"""테넌트 · 쿼터 · 사용량(F1-CONTRACT §4.8). 한도는 config/quotas.yaml → quotas 표([추정 기반 초기값]).
사용량은 실측: usage_events 합(gpu_s · area_km2 · egress_gb — 분석을 요청한 기관(기록된 그대로) · llm_tokens = AI 도우미 사용량(토큰) — 에이전트 run 을 부른 기관) · 기관 저장 공간(결과 파일 + DB 행 · 60s 캐시) · jobs(동시) · Redis(vworld 일일 호출).
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
# 기관에 속한 것 = ① results/{기관} 폴더 ② 그 기관 몫 작업(workers.metering.STORE_OWNER_EXPR — 기관이 낸 작업 + 그 기관 배포본(서비스)으로 낸 작업 ·
#   겹치는 범위로 짐작하지 않음 · 정리 작업 10-01)의 결과 폴더·파일
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
    from workers.metering import STORE_OWNER_EXPR
    rels: set[str] = {f"results/{tenant}", f"tenants/{tenant}/space"}   # ⑥ 기관 공간 저장 폴더(spaces.py · 가벼운 칸)
    async with db(realm="lx") as conn:
        jobs = await conn.fetch(f"SELECT j.id, j.tenant_id, j.result_set FROM jobs j WHERE NOT j.demo AND ({STORE_OWNER_EXPR}) = $1", tenant)
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
    """이번 달 usage_events 합(기관 × dim) — 기록된 기관 그대로 센다(10s 캐시).
    계량(workers.metering.meter)이 쓸 때 이미 '분석을 요청한 기관'(정리 작업 10-01 · 장부 고장 ②)으로 적는다. 읽을 때 다시 귀속하지 않는다 —
    지난 기록은 그때 적힌 대로 두고(고치지 않음), 새 규칙으로 다시 세어 보는 것은 server/ops/recount_usage.py(보기만)."""
    global _ms_cache
    ms = _month_start()
    if _ms_cache and time.time() - _ms_cache[0] < 10 and _ms_cache[1] == ms.isoformat():
        return _ms_cache[2]
    async with db(realm="lx") as conn:
        rows = await conn.fetch(
            "SELECT u.tenant_id AS t, u.dim, sum(u.amount) AS v FROM usage_events u "
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
SRC = {"storage_gb": "결과 폴더·파일(기관 몫 작업 · 배포본 결과 세트) + 분석 요청으로 올린 영상 원본 + 기관 DB 행(대장 · 실태조사 · 탐지) · 60s 캐시", "gpu_s_month": "usage_events(gpu_s · 이번 달 · 분석을 요청한 기관 · 학습 포함)", "area_km2_month": "usage_events(area_km2 · 이번 달 · 분석을 요청한 기관 · 실제 분석한 땅)",
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
                                    "uploads_gb": env(st.get("uploads_gb", 0.0), "GB", "measured", "분석 요청으로 올린 영상 원본(받는 중 포함)")}
    # AI 도우미 요청 건수(이번 달) — 사용량 표시의 말은 '질문'이 아니라 '요청 건수'(10-01 사용자 11차 답). 토큰은 개발자용 값으로 그대로 둔다.
    async with db(realm="lx") as conn:
        n_req = await conn.fetchval("SELECT count(*) FROM agent_runs WHERE tenant_id=$1 AND created_at >= $2", tenant, _month_start())
    dims["llm_requests_month"] = {"used": env(int(n_req or 0), "count", "measured", "agent_runs(이번 달 · AI 도우미를 부른 기관)"),
                                  "soft": None, "hard": None, "policy": None, "note": None, "limit_set": False}
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


# ── 사용을 막는 한도 없음(10-01 사용자 — 원칙 83 · 7차 기관-1 · 11차 "GPU 는 무상 정책" · "우리 직원도 분석 시간 같은 한도가 없어야지") ──
# 기관 · LX 직원 모두 분석 · AI 도우미 질문 · 보고서 초안을 한도로 거절하거나 뒤로 미루지 않는다(예전 over_hard · hold_quote · refuse_run 은 없앰).
# 사용량은 그대로 기록한다(usage_events · usage_of — 사용 현황의 근거). 막는 것은 장비 보호뿐:
#   서버 저장 공간 여유(storage_room · config/requests.yaml disk_reserve_gb) · 한 번에 분석할 수 있는 크기(jobs too_large) · 전력 규칙(power_budget) · 기관별 동시 작업 줄 서기.
# quotas 표 값은 지우지 않고 쓰지 않는다(관리자 기록 · 지난 결재).


def quote_block(tenant: str) -> dict:
    """견적 답의 'quota' 자리(계약 모양 유지) — 막는 값 없음. 사용량은 기록만 한다."""
    return {"tenant_id": tenant, "dim": "gpu_s_month",
            "remaining": env(None, "gpu_s", "measured", "사용을 막는 값 없음 — 사용량은 usage_events 에 기록", "무제한"),
            "policy": "notify"}
