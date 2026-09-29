"""테넌트 · 쿼터 · 사용량(F1-CONTRACT §4.8). 한도는 config/quotas.yaml → quotas 표([추정 기반 초기값]).
사용량은 실측: usage_events 합(gpu_s · area_km2 · egress_gb — 작업 귀속 기관 기준) · 기관 저장 공간(결과 파일 + DB 행 · 60s 캐시) · jobs(동시) · Redis(vworld 일일 호출).
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
DIMS = ["storage_gb", "gpu_s_month", "area_km2_month", "concurrent_jobs", "egress_gb_month", "vworld_calls_day"]
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
# ③ 그 기관 배포본 스냅샷이 가리키는 결과 세트 파일(config/sets.yaml aliases → sets) ④ DB 에 담긴 그 기관 행(올린 대장 · 실태조사 결과 · 탐지 결과 · 위성 지수 결과).
_st_cache: dict[str, tuple[float, dict]] = {}


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
    files_gb = 0.0
    for rel in sorted(rels):
        p = config.DATA_ROOT / rel
        if p.is_file():
            files_gb += round(p.stat().st_size / 1e9, 6)
        elif p.is_dir():
            files_gb += await du_gb(rel)
    out = {"gb": round(files_gb + float(db_b or 0) / 1e9, 3), "files_gb": round(files_gb, 3), "db_gb": round(float(db_b or 0) / 1e9, 3),
           "n_paths": len(rels), "n_jobs": len(jobs)}
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
    base = {"gpu_s_month": "gpu_s", "area_km2_month": "area_km2", "egress_gb_month": "egress_gb"}[dim]
    return (await _month_sums()).get((tenant, base), 0.0)


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
            "WHERE u.at >= $1 AND u.dim IN ('gpu_s', 'area_km2', 'egress_gb') GROUP BY 1, 2", ms)
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
        "vworld_calls_day": "count"}
SRC = {"storage_gb": "결과 폴더·파일(기관 몫 작업 · 배포본 결과 세트) + 기관 DB 행(대장 · 실태조사 · 탐지) · 60s 캐시", "gpu_s_month": "usage_events(gpu_s · 이번 달 · 작업 귀속 기관)", "area_km2_month": "usage_events(area_km2 · 이번 달 · 작업 귀속 기관)",
       "concurrent_jobs": "jobs(state queued|running · 지금)", "egress_gb_month": "usage_events(egress_gb)", "vworld_calls_day": "Redis vworld:calls(오늘)"}


async def usage_of(tenant: str) -> dict:
    dims = {}
    for d in DIMS:
        q = await remaining(tenant, d)
        note = None
        if d == "egress_gb_month":
            note = "타일 전송량 계량은 2차(nginx 로그) — 지금은 0 이 아니라 '미계량'"
        e = env(round(q["used"], 3) if d != "egress_gb_month" else None, UNIT[d], "measured", SRC[d].replace("{t}", tenant), note)
        dims[d] = {"used": e, "soft": q["soft"], "hard": q["hard"], "policy": q["policy"], "note": q["note"] or "[추정 기반 초기값]",
                   "limit_set": q["hard"] is not None}   # 한도 미설정이면 화면은 % 대신 실사용량만(0% 를 지어내지 않는다)
        if d == "storage_gb" and tenant != "lx":
            st = await storage_of(tenant)
            dims[d]["breakdown"] = {"files_gb": env(st["files_gb"], "GB", "measured", "결과 폴더·파일 크기(기관 몫 작업 · 배포본 결과 세트)"),
                                    "db_gb": env(st["db_gb"], "GB", "measured", "기관 DB 행 크기(대장 · 실태조사 · 탐지 · 위성 지수)")}
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
    p = require(principal(request), admin=True)
    dims = body.get("dims") or {}
    import secrets
    async with db(realm="lx") as conn:
        t = await conn.fetchrow("SELECT id, name, kind, scope, crs, locale, profile_id, status FROM tenants WHERE id=$1", tid)
        if not t:
            raise ApiError("not_found", f"tenant {tid} 없음")
        before = [dict(r) for r in await conn.fetch("SELECT dim, soft, hard, policy FROM quotas WHERE tenant_id=$1", tid)]
        for d, v in dims.items():
            if d not in DIMS:
                raise ApiError("bad_request", f"dim {d}")
            await conn.execute("INSERT INTO quotas(tenant_id, dim, soft, hard, policy, note) VALUES ($1,$2,$3,$4,$5,$6) "
                               "ON CONFLICT (tenant_id, dim) DO UPDATE SET soft=EXCLUDED.soft, hard=EXCLUDED.hard, policy=EXCLUDED.policy, note=EXCLUDED.note",
                               tid, d, v.get("soft"), v.get("hard"), v.get("policy", "notify"), body.get("reason"))
        await conn.execute("INSERT INTO approvals(id, subject_type, subject_id, requested_by, decided_by, decision, reason) VALUES ($1,'quota',$2,$3,$3,'approve',$4)",
                           "ap_" + secrets.token_hex(6), tid, p.user_id, body.get("reason") or "한도 변경")
        await audit(conn, p, "quota.put", tid, {"quotas": [{k: (float(v) if hasattr(v, 'is_finite') else v) for k, v in b.items()} for b in before]}, {"dims": dims})
    return {**dict(t), "home": "portal"}
