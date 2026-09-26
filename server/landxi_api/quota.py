"""테넌트 · 쿼터 · 사용량(F1-CONTRACT §4.8). 한도는 config/quotas.yaml → quotas 표([추정 기반 초기값]).
사용량은 실측: usage_events 합(gpu_s · area_km2 · egress_gb) · du(60s 캐시) · jobs(동시) · Redis(vworld 일일 호출).
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


def _month_start() -> dt.datetime:
    n = dt.datetime.now(KST)
    return n.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


async def used(tenant: str, dim: str) -> float:
    if dim == "concurrent_jobs":
        async with db(realm="lx") as conn:
            return float(await conn.fetchval("SELECT count(*) FROM jobs WHERE tenant_id=$1 AND state IN ('queued','running')", tenant))
    if dim == "storage_gb":
        return await du_gb("results" if tenant == "lx" else f"results/{tenant}")
    if dim == "vworld_calls_day":
        r = await redis()
        return float(await r.get(f"vworld:calls:{tenant}:{dt.datetime.now(KST).date().isoformat()}") or 0)
    base = {"gpu_s_month": "gpu_s", "area_km2_month": "area_km2", "egress_gb_month": "egress_gb"}[dim]
    async with db(realm="lx") as conn:
        v = await conn.fetchval("SELECT coalesce(sum(amount),0) FROM usage_events WHERE tenant_id=$1 AND dim=$2 AND at >= $3",
                                tenant, base, _month_start())
    return float(v)


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
SRC = {"storage_gb": "du results/{t} (60s 캐시)", "gpu_s_month": "usage_events(gpu_s · 이번 달)", "area_km2_month": "usage_events(area_km2 · 이번 달)",
       "concurrent_jobs": "jobs(state queued|running · 지금)", "egress_gb_month": "usage_events(egress_gb)", "vworld_calls_day": "Redis vworld:calls(오늘)"}


async def usage_of(tenant: str) -> dict:
    dims = {}
    for d in DIMS:
        q = await remaining(tenant, d)
        note = None
        if d == "egress_gb_month":
            note = "타일 전송량 계량은 2차(nginx 로그) — 지금은 0 이 아니라 '미계량'"
        e = env(round(q["used"], 3) if d != "egress_gb_month" else None, UNIT[d], "measured", SRC[d].replace("{t}", tenant), note)
        dims[d] = {"used": e, "soft": q["soft"], "hard": q["hard"], "policy": q["policy"], "note": q["note"] or "[추정 기반 초기값]"}
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
