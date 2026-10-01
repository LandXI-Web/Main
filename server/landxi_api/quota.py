"""테넌트 · 쿼터 · 사용량(F1-CONTRACT §4.8). 한도는 config/quotas.yaml → quotas 표([추정 기반 초기값]).
사용량은 실측: usage_events 합(gpu_s · area_km2 · egress_gb — 작업 귀속 기관 기준 · llm_tokens = AI 도우미 사용량(토큰) — 에이전트 run 을 부른 기관) · 기관 저장 공간(결과 파일 + DB 행 · 60s 캐시) · jobs(동시) · Redis(vworld 일일 호출).
"""
from __future__ import annotations

import asyncio
import calendar
import datetime as dt
import os
import time

from fastapi import APIRouter, Request
from starlette.concurrency import run_in_threadpool

from . import config
from .deps import ApiError, audit, db, principal, redis, require
from .envelope import KST, env, now_iso

router = APIRouter()
DIMS = ["storage_gb", "gpu_s_month", "area_km2_month", "concurrent_jobs", "egress_gb_month", "vworld_calls_day", "llm_tokens_month"]
# AI 도우미 사용량(토큰 · 이번 달) — usage_events dim='llm_tokens' 합 한 출처(runner.meter 가 run 마다 쓴다). 한도는 quotas 표(llm_tokens_month · [추정 기반 초기값])
MONTH_DIM = {"gpu_s_month": "gpu_s", "area_km2_month": "area_km2", "egress_gb_month": "egress_gb", "llm_tokens_month": "llm_tokens"}
_du_cache: dict[str, tuple[float, float]] = {}


def _du(path) -> float:
    total = 0
    stack = [str(path)]
    while stack:
        d = stack.pop()
        try:
            with os.scandir(d) as it:
                for e in it:
                    if e.is_dir(follow_symlinks=False):
                        stack.append(e.path)
                    elif e.is_file(follow_symlinks=False):
                        total += e.stat(follow_symlinks=False).st_size
        except FileNotFoundError:
            pass
    return total


async def du_gb(rel: str) -> float:
    c = _du_cache.get(rel)
    if c and time.time() - c[0] < 60:
        return c[1]
    v = await run_in_threadpool(_du, config.DATA_ROOT / rel)
    gb = round(v / 1e9, 3)
    _du_cache[rel] = (time.time(), gb)
    return gb


# ── 기관 저장 공간(fix-admin-usage) ────────────────────────────────────────────
# 기관에 속한 것 = ① results/{기관} 폴더 ② 그 기관 몫 작업(workers.metering.OWNER_EXPR — LX 가 대신 돌린 작업 포함)의 결과 폴더·파일
# ③ 그 기관 배포본 스냅샷이 가리키는 결과 세트 파일(config/sets.yaml aliases → sets) ④ DB 에 담긴 그 기관 행(올린 대장 · 실태조사 결과 · 탐지 결과 · 위성 지수 결과)
# ⑤ 분석 의뢰로 올린 영상 원본(config/requests.yaml storage_root — 받는 중인 조각 포함).
_st_cache: dict[str, tuple[float, dict]] = {}


def request_root_rel(tenant: str) -> str:
    """기관이 올린 영상 폴더(02. 데이터 기준) — 값은 config/requests.yaml 한 곳(requests.root_rel 과 같은 값)."""
    try:
        s = config.load_yaml("requests") or {}
    except Exception:  # noqa: BLE001
        s = {}
    return str(s.get("storage_root") or "tenants/{tenant}/requests").format(tenant=tenant).strip("/")


def invalidate_storage(tenant: str) -> None:
    """올리기 · 지우기 뒤 — 기관 저장 계산을 다시(60 s 캐시를 비운다)."""
    _st_cache.pop(tenant, None)
    _du_cache.pop(request_root_rel(tenant), None)


async def storage_room(tenant: str, add_bytes: int) -> dict | None:
    """새 파일을 받을 자리가 있나 — 서버 전체 저장 공간(하드웨어)이 모자랄 때만 막는다(config/requests.yaml disk_reserve_gb · LX 관리자 설정 한 곳).
    기관 저장 한도로는 막지 않는다(사용자 7차 답 10-01 '기관에는 막는 한도를 두지 않는다 — 인프라를 얼마나 쓰는지 보여 주는 관점'):
    기관이 올린 양은 사용 현황(storage_of · uploads_gb)으로 기록 · 표시만. → None(받는다) | {code, line(사용자 말), detail}."""
    import shutil
    need = max(0, int(add_bytes)) / 1e9
    try:
        s = config.load_yaml("requests") or {}
    except Exception:  # noqa: BLE001
        s = {}
    reserve = float(s.get("disk_reserve_gb") or 200)
    try:
        free = shutil.disk_usage(config.DATA_ROOT).free / 1e9
    except Exception:  # noqa: BLE001
        free = None
    if free is not None and free - need < reserve:
        return {"code": "disk_full", "line": "지금은 서버 저장 공간이 모자라 올릴 수 없습니다 — LX 관리자에게 알려 주세요.",
                "detail": {"dim": "disk", "tenant": tenant}}
    return None


def _set_file(set_id: str) -> str | None:
    s = config.load_yaml("sets") or {}
    sid = (s.get("aliases") or {}).get(set_id, set_id)
    return (s.get("sets") or {}).get(sid)


async def storage_of(tenant: str) -> dict:
    """→ {gb, files_gb, db_gb, paths} · 60s 캐시(du 캐시와 같은 주기)."""
    c = _st_cache.get(tenant)
    if c and time.time() - c[0] < 60:
        return c[1]
    from workers.metering import OWNER_EXPR
    rels: set[str] = {f"results/{tenant}"}
    async with db(realm="lx") as conn:
        jobs = await conn.fetch(f"SELECT j.id, j.tenant_id, j.result_set FROM jobs j WHERE NOT j.demo AND ({OWNER_EXPR}) = $1", tenant)
        snaps = await conn.fetch("SELECT snapshot_current, snapshot_prev FROM deploys WHERE tenant_id=$1 AND NOT coalesce(test, false)", tenant)
        pub = await conn.fetch("SELECT path FROM published_sets WHERE job_id = ANY($1::text[])", [j["id"] for j in jobs])
        db_b = await conn.fetchval(
            "SELECT (SELECT coalesce(sum(pg_column_size(r.*)),0) FROM registry_snapshots r WHERE r.tenant_id=$1)"
            " + (SELECT coalesce(sum(pg_column_size(f.*)),0) FROM survey_findings f WHERE f.tenant_id=$1)"
            " + (SELECT coalesce(sum(pg_column_size(d.*)),0) FROM detections d WHERE d.job_id = ANY($2::text[]))"
            " + (SELECT coalesce(sum(pg_column_size(x.*)),0) FROM index_results x WHERE x.job_id = ANY($2::text[]))",
            tenant, [j["id"] for j in jobs])
    for j in jobs:
        base = (j["result_set"] or f"results/{j['tenant_id']}/{j['id']}").rstrip("/")
        rels |= {base, base + ".geojson", base + ".pmtiles"}
    for r in pub:
        if r["path"]:
            rels.add(r["path"])
    for r in snaps:
        for sid in (r["snapshot_current"], r["snapshot_prev"]):
            f = _set_file(sid) if sid else None
            if f:
                rels.add(f)
    up_rel = request_root_rel(tenant)                   # ⑤ 기관이 분석 의뢰로 올린 영상 원본(받는 중인 조각 포함 · 원칙 66)
    files_gb = 0.0
    for rel in sorted(rels):
        p = config.DATA_ROOT / rel
        if p.is_file():
            files_gb += round(p.stat().st_size / 1e9, 6)
        elif p.is_dir():
            files_gb += await du_gb(rel)
    up_gb = await du_gb(up_rel) if (config.DATA_ROOT / up_rel).is_dir() else 0.0
    files_gb += up_gb
    out = {"gb": round(files_gb + float(db_b or 0) / 1e9, 3), "files_gb": round(files_gb, 3), "db_gb": round(float(db_b or 0) / 1e9, 3),
           "uploads_gb": round(up_gb, 3), "n_paths": len(rels) + 1, "n_jobs": len(jobs)}
    _st_cache[tenant] = (time.time(), out)
    return out


def _month_start() -> dt.datetime:
    n = dt.datetime.now(KST)
    return n.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


async def used(tenant: str, dim: str) -> float:
    if dim == "concurrent_jobs":
        async with db(realm="lx") as conn:
            return float(await conn.fetchval("SELECT count(*) FROM jobs WHERE tenant_id=$1 AND state IN ('queued','running')", tenant))
    if dim == "storage_gb":
        if tenant == "lx":
            return await du_gb("results")
        return (await storage_of(tenant))["gb"]
    if dim == "vworld_calls_day":
        r = await redis()
        return float(await r.get(f"vworld:calls:{tenant}:{dt.datetime.now(KST).date().isoformat()}") or 0)
    return (await _month_sums()).get((tenant, MONTH_DIM[dim]), 0.0)


_ms_cache: tuple[float, str, dict] | None = None


async def _month_sums() -> dict:
    """이번 달 usage_events 합(기관 × dim) — 작업 귀속(workers.metering.OWNER_EXPR)으로 센다(10s 캐시).
    metering 은 새 행을 이미 기관 id 로 쓰고 과거 행은 백필로 옮겼지만, 옛 워커 프로세스가 아직 'lx' 로 쓴 행도 같은 규칙으로 읽어
    화면 값이 워커 재기동 시점에 흔들리지 않게 한다. 작업 없는 행(job_id 없음)은 기록된 기관 그대로. lx-demo 는 영업 계량이라 그대로."""
    global _ms_cache
    ms = _month_start()
    if _ms_cache and time.time() - _ms_cache[0] < 10 and _ms_cache[1] == ms.isoformat():
        return _ms_cache[2]
    from workers.metering import OWNER_EXPR
    async with db(realm="lx") as conn:
        rows = await conn.fetch(
            "SELECT coalesce(CASE WHEN u.tenant_id = 'lx-demo' THEN 'lx-demo' ELSE o.owner END, u.tenant_id) AS t, u.dim, sum(u.amount) AS v "
            f"FROM usage_events u LEFT JOIN (SELECT j.id, {OWNER_EXPR} AS owner FROM jobs j) o ON o.id = u.job_id "
            "WHERE u.at >= $1 AND u.dim = ANY($2::text[]) GROUP BY 1, 2", ms, list(MONTH_DIM.values()))
    out = {(r["t"], r["dim"]): float(r["v"] or 0) for r in rows}
    _ms_cache = (time.time(), ms.isoformat(), out)
    return out


async def remaining(tenant: str, dim: str) -> dict:
    async with db(realm="lx") as conn:
        q = await conn.fetchrow("SELECT soft, hard, policy, note FROM quotas WHERE tenant_id=$1 AND dim=$2", tenant, dim)
    u = await used(tenant, dim)
    if not q:
        return {"soft": None, "hard": None, "policy": "notify", "used": u, "note": "한도 없음"}
    return {"soft": float(q["soft"]) if q["soft"] is not None else None, "hard": float(q["hard"]) if q["hard"] is not None else None,
            "policy": q["policy"], "used": u, "note": q["note"]}


UNIT = {"storage_gb": "GB", "gpu_s_month": "gpu_s", "area_km2_month": "km2", "concurrent_jobs": "count", "egress_gb_month": "GB",
        "vworld_calls_day": "count", "llm_tokens_month": "tokens"}
SRC = {"storage_gb": "결과 폴더·파일(기관 몫 작업 · 배포본 결과 세트) + 분석 의뢰로 올린 영상 원본 + 기관 DB 행(대장 · 실태조사 · 탐지) · 60s 캐시", "gpu_s_month": "usage_events(gpu_s · 이번 달 · 작업 귀속 기관)", "area_km2_month": "usage_events(area_km2 · 이번 달 · 작업 귀속 기관)",
       "concurrent_jobs": "jobs(state queued|running · 지금)", "egress_gb_month": "usage_events(egress_gb)", "vworld_calls_day": "Redis vworld:calls(오늘)",
       "llm_tokens_month": "usage_events(llm_tokens · 이번 달 · AI 도우미를 부른 기관)"}


async def usage_of(tenant: str) -> dict:
    dims = {}
    for d in DIMS:
        q = await remaining(tenant, d)
        note = None
        if d == "egress_gb_month":
            note = "타일 전송량 계량은 2차(nginx 로그) — 지금은 0 이 아니라 '미계량'"
        v = None if d == "egress_gb_month" else int(round(q["used"])) if d == "llm_tokens_month" else round(q["used"], 3)
        e = env(v, UNIT[d], "measured", SRC[d].replace("{t}", tenant), note)
        dims[d] = {"used": e, "soft": q["soft"], "hard": q["hard"], "policy": q["policy"], "note": q["note"] or "[추정 기반 초기값]",
                   "limit_set": q["hard"] is not None}   # 한도 미설정이면 화면은 % 대신 실사용량만(0% 를 지어내지 않는다)
        if d == "storage_gb" and tenant != "lx":
            st = await storage_of(tenant)
            dims[d]["breakdown"] = {"files_gb": env(st["files_gb"], "GB", "measured", "결과 폴더·파일 크기(기관 몫 작업 · 배포본 결과 세트)"),
                                    "db_gb": env(st["db_gb"], "GB", "measured", "기관 DB 행 크기(대장 · 실태조사 · 탐지 · 위성 지수)"),
                                    "uploads_gb": env(st.get("uploads_gb", 0.0), "GB", "measured", "분석 의뢰로 올린 영상 원본(받는 중 포함)")}
    # 선형 예측(gpu_s) — [추정]
    g = dims["gpu_s_month"]
    now = dt.datetime.now(KST)
    days = calendar.monthrange(now.year, now.month)[1]
    frac = (now - _month_start()).total_seconds() / (days * 86400)
    proj = (g["used"]["value"] or 0) / max(frac, 1e-6)
    exceed = None
    if g["hard"] is not None and proj > g["hard"]:
        exceed = now.strftime("%Y-%m")
    return {"tenant_id": tenant, "month": now.strftime("%Y-%m"), "dims": dims,
            "isolation": {"prefix": f"tenants/{tenant}/", "rls": True, "signed_tiles": tenant != "lx", "raw_routes": 0},
            "forecast": {"gpu_s_month": {"exceed_month": exceed, "basis": "estimate", "source": "quota.estimator 선형",
                                         "projected": env(round(proj, 1), "gpu_s", "estimate", "이번 달 사용 ÷ 경과 비율(선형)")}}}


@router.get("/tenants")
async def tenants(request: Request):
    require(principal(request), lx=True)
    async with db(realm="lx") as conn:
        rows = await conn.fetch("SELECT id, name, kind, scope, crs, locale, profile_id, status FROM tenants ORDER BY id")
    items = [{**dict(r), "home": "portal"} for r in rows]
    return {"items": items, "total": len(items), "as_of": now_iso()}


@router.get("/t/{tenant}/usage")
async def tenant_usage(tenant: str, request: Request):
    p = require(principal(request))
    if not p.is_lx and p.tenant_id != tenant:
        raise ApiError("forbidden", "자기 기관 사용량만")
    return await usage_of(tenant)


@router.put("/tenants/{tid}/quota")
async def put_quota(tid: str, body: dict, request: Request):
    """한도 변경 = 결재 요청(impl-1 · R&R 점검 '요청자 = 승인자' 막기). 예전에는 요청한 관리자가 곧바로 바꾸고 스스로 승인자로 적혔다.
    이제는 결재함에 대기 행 하나(여러 항목을 한 건으로 · payload.dims)를 만들고, 요청하지 않은 다른 관리자가 결재해야 바뀐다."""
    p = require(principal(request), admin=True)
    dims = body.get("dims") or {}
    if not isinstance(dims, dict) or not dims:
        raise ApiError("bad_request", "바꿀 항목(dims)이 없습니다")
    from .approvals import request_quota
    aid = await request_quota(p, tid, {"dims": dims}, body.get("reason"))
    async with db(realm="lx") as conn:
        t = await conn.fetchrow("SELECT id, name, kind, scope, crs, locale, profile_id, status FROM tenants WHERE id=$1", tid)
    return {**dict(t), "home": "portal", "approval_id": aid, "state": "pending"}


# ── 한도를 넘으면 새 작업 거절(impl-1 · C6 — r3-ops 실증 3차 '광주전남 AI 도우미 사용량이 한도를 넘어도 계속 처리') ──────────
# 하드 한도 = 넘으면 그 기관의 새 작업을 받지 않는다(정책 칸과 무관 · 정책은 한도를 넘기는 그 한 건의 처리 — 우선순위 낮춤 등).
# LX(무제한)는 막지 않는다. 판정 값은 기관 화면 표 · 관리자 화면 고리와 같은 한 출처(remaining = quotas 표 + 실사용).
WORK_DIMS = {"analysis": ["gpu_s_month", "area_km2_month", "storage_gb"], "assistant": ["llm_tokens_month"]}
_OVER_LINE = {
    "gpu_s_month": ("이번 달 GPU 사용 한도를 넘어 새 분석을 시작할 수 없습니다", "This month's GPU limit is used up, so new analyses can't start"),
    "area_km2_month": ("이번 달 분석 면적 한도를 넘어 새 분석을 시작할 수 없습니다", "This month's analysis area limit is used up, so new analyses can't start"),
    "storage_gb": ("저장 공간 한도를 넘어 새 분석을 시작할 수 없습니다", "The storage limit is used up, so new analyses can't start"),
    "llm_tokens_month": ("이번 달 AI 도우미 사용 한도를 넘어 새 질문을 받을 수 없습니다", "This month's AI assistant limit is used up, so new questions can't be taken"),
}
_OVER_TAIL = (". 한도 변경은 LX 관리자에게 요청하세요.", ". Ask LX to raise the limit.")


def over_line(dim: str, lang: str = "ko") -> str:
    ko, en = _OVER_LINE.get(dim, ("한도를 넘어 새 작업을 받을 수 없습니다", "The limit is used up, so new work can't be taken"))
    return (en + _OVER_TAIL[1]) if lang == "en" else (ko + _OVER_TAIL[0])


async def over_hard(tenant: str | None, kind: str) -> dict | None:
    """기관의 하드 한도를 이미 넘었나(kind = analysis | assistant) → {dim, line, line_en} | None. LX · 한도 미설정 = None."""
    if not tenant or tenant == "lx":
        return None
    for d in WORK_DIMS.get(kind, []):
        try:
            q = await remaining(tenant, d)
        except Exception:  # noqa: BLE001 — 판정 실패로 일을 막지 않는다(계량 오류 = 통과 · 기록은 화면 표에)
            continue
        if q["hard"] is not None and q["used"] is not None and q["used"] >= q["hard"]:     # 한도 0 = 쓸 수 없음
            return {"dim": d, "tenant": tenant, "line": over_line(d, "ko"), "line_en": over_line(d, "en")}
    return None


async def hold_quote(q: dict) -> dict:
    """분석 견적(jobs.build_quote 결과)에 한도 판정을 더한다 — GPU 분석(infer · reinfer)만. 넘었으면 allowed False ·
    reasons 맨 앞 quota_exceeded · reason_line(화면 한 줄). 견적(POST /jobs/quote)과 제출(POST /jobs)이 같은 판정을 쓴다."""
    if q.get("kind") not in ("infer", "reinfer") or q.get("pool") == "cpu":
        return q
    ov = await over_hard(q.get("_tenant"), "analysis")
    if ov:
        q["reasons"] = ["quota_exceeded"] + [r for r in (q.get("reasons") or []) if r != "quota_exceeded"]
        q["allowed"] = False
        q["reason_line"] = ov["line"]
        q["quota_over"] = ov["dim"]
    return q


async def refuse_run(ctx, message: str, ov: dict):
    """AI 도우미 한 건을 한도 초과로 닫는다 — 모델 호출 0 · 토큰 0. 명령 바는 agent.rejected 의 문구를 그대로 보인다(질문 언어)."""
    import datetime as _dt
    from agent import audit as _audit, runner as _runner
    ctx.lang = _runner.lang_of(message)
    await _runner.persist_start(ctx, message)
    text = ov["line_en"] if ctx.lang == "en" else ov["line"]
    await _runner.emit(ctx, "agent.rejected", {"error": "quota_exceeded", "category": "quota", "message": text, "pii": [], "region": None,
                                               "lang": ctx.lang})
    await _runner.persist_state(ctx, state="rejected", error="quota_exceeded", finished_at=_dt.datetime.now(KST))
    await _audit.log(ctx.principal, "agent.quota_exceeded", ctx.run_id, {"tenant": ov.get("tenant"), "dim": ov.get("dim")})
