"""공용 의존성 — PG 풀(asyncpg) · Redis · 주체(Principal) · 오류 형식(F1-CONTRACT §10) · RLS SET LOCAL."""
from __future__ import annotations

import contextlib
import os
import json
import secrets
import time
from dataclasses import dataclass, field

import asyncpg
import redis.asyncio as aioredis
from fastapi import Request

from . import config

_pool: asyncpg.Pool | None = None
_redis: aioredis.Redis | None = None

ERROR_STATUS = {
    "unauthorized": 401, "forbidden": 403, "demo_required": 403, "not_found": 404, "parcels_unavailable": 404,
    "vworld_key_pending": 503, "cog_unavailable": 501, "quota_exceeded": 400, "aoi_outside_footprint": 400,
    "aoi_too_large": 400, "model_input_mismatch": 400, "module_locked": 400, "approval_required": 409,
    "invalid_stage_transition": 409, "envelope_missing": 500, "worker_unavailable": 503, "bad_request": 400,
    "imagery_forbidden": 403, "conflict": 409, "upstream_error": 502,
    "registry_unavailable": 404, "recovery_failed": 500,
}


class ApiError(Exception):
    def __init__(self, code: str, message: str = "", detail: dict | None = None, status: int | None = None):
        super().__init__(message or code)
        self.code, self.message, self.detail = code, message or code, detail
        self.status = status or ERROR_STATUS.get(code, 400)

    def body(self) -> dict:
        e = {"code": self.code, "message": self.message}
        if self.detail is not None:
            e["detail"] = self.detail
        return {"error": e, "request_id": "req_" + secrets.token_hex(8)}


async def _init_conn(conn):
    await conn.set_type_codec("jsonb", encoder=lambda v: json.dumps(v, ensure_ascii=False), decoder=json.loads, schema="pg_catalog")
    await conn.set_type_codec("json", encoder=lambda v: json.dumps(v, ensure_ascii=False), decoder=json.loads, schema="pg_catalog")


# 게이트웨이 프로세스마다 연결 묶음 — 여러 프로세스(--workers N)면 PostgreSQL max_connections(100)를 넘지 않게 줄인다(impl-46 ops)
_POOL_MAX = int(os.environ.get("LX_PG_POOL_MAX") or (16 if int(os.environ.get("LX_GATEWAY_WORKERS") or 1) <= 1 else 14))


async def pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(config.PG_DSN, min_size=2, max_size=_POOL_MAX, init=_init_conn, command_timeout=60,
                                          server_settings={"jit": "off"})   # JIT 끔(바퀴 16 재검수 — 짧은 질의에 컴파일 1초가 붙음)
    return _pool


_pool_tenant: asyncpg.Pool | None = None
_tenant_fail_at = 0.0
_POOL_TENANT_MAX = int(os.environ.get("LX_PG_TENANT_POOL_MAX") or 4)    # 게이트웨이 프로세스마다(4개면 최대 16 · DB 연결 한도 100)


async def pool_tenant() -> asyncpg.Pool:
    """기관 권한 계정(landxi_tenant · 0121 · 10-22 now21 저장보안-DB-칸막이 ⓐ 1단계) — 기관 세션(realm tenant)의 DB 접속.
    이 계정에는 되돌릴 수 없는 칸막이(RESTRICTIVE 정책)가 붙어, app.realm 을 lx 로 바꿔도 그 기관 행 · 볼 수 있는 시군구만 보인다.
    PG_TENANT_DSN 이 없으면(옛 설치) 앱 계정 묶음을 그대로 쓴다."""
    global _pool_tenant, _tenant_fail_at
    if not config.PG_TENANT_DSN or (_tenant_fail_at and time.time() - _tenant_fail_at < 60):
        return await pool()
    if _pool_tenant is None:
        try:
            _pool_tenant = await asyncpg.create_pool(config.PG_TENANT_DSN, min_size=1, max_size=_POOL_TENANT_MAX, init=_init_conn, command_timeout=60,
                                                     server_settings={"jit": "off"})
        except Exception as e:  # noqa: BLE001 — 기관 권한 계정에 붙지 못하면(계정 준비 전 · 비밀번호 다름) 예전 길(앱 계정)로
            import logging
            logging.getLogger("landxi").warning("tenant pool unavailable, using app pool: %s", type(e).__name__)
            _tenant_fail_at = time.time()                 # 1분 동안은 다시 붙어 보지 않는다
            return await pool()
    return _pool_tenant


_pool_sys: asyncpg.Pool | None = None


async def pool_sys() -> asyncpg.Pool:
    """시스템 읽기 전용 경로(BYPASSRLS 워커 역할) — RLS 보안 장벽이 공간 조인(ST_Intersects)의 인덱스 사용을 막는 무거운 결합 전용.
    호출자가 관문(resolve · tenant 필터)을 SQL 에 직접 넣어야 한다(v1.1-21 /results/{set}/parcels)."""
    global _pool_sys
    if _pool_sys is None:
        _pool_sys = await asyncpg.create_pool(config.PG_WORKER_DSN, min_size=1, max_size=4, init=_init_conn, command_timeout=120,
                                              server_settings={"jit": "off"})
    return _pool_sys


async def redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(config.REDIS_URL, decode_responses=True, socket_timeout=40, socket_connect_timeout=5,
                                   socket_keepalive=True, health_check_interval=15, max_connections=256)
    return _redis


async def close():
    global _pool, _redis, _pool_sys, _pool_tenant
    if _pool:
        await _pool.close()
        _pool = None
    if _pool_tenant:
        await _pool_tenant.close()
        _pool_tenant = None
    if _pool_sys:
        await _pool_sys.close()
        _pool_sys = None
    if _redis:
        await _redis.aclose()
        _redis = None


CAPS = {
    ("lx", "admin"): ["jobs.submit", "results.edit", "results.read", "catalog.lx", "registry.read", "deploys.write", "ops.read",
                      "ops.write", "quota.write", "usage.read"],
    ("lx", "staff"): ["jobs.submit", "results.edit", "results.read", "catalog.lx", "registry.read"],
    ("lx", "sales"): ["jobs.submit(demo only)", "results.read", "catalog.lx"],
    ("tenant", "manager"): ["results.read(own)", "feedback.write", "usage.read(own)", "catalog.tenant"],
    ("tenant", "viewer"): ["results.read(own)", "catalog.tenant"],
}


@dataclass
class Principal:
    realm: str | None = None          # lx | tenant | None(게스트)
    role: str | None = None
    tenant_id: str | None = None
    user_id: str | None = None
    name: str | None = None
    token_hash: str | None = None
    caps: list[str] = field(default_factory=list)
    sgg: list[str] | None = None      # 광역 기관 부서 사용자의 관할(부서별 관할 · 나중 16 — None = 기관 관할 전체)

    @property
    def is_lx(self) -> bool:
        return self.realm == "lx"

    @property
    def is_admin(self) -> bool:
        return self.realm == "lx" and self.role == "admin"

    @property
    def guest(self) -> bool:
        return self.realm is None

    def rls(self) -> tuple[str, str]:
        return (self.realm or "public", self.tenant_id or "")


def principal(request: Request) -> Principal:
    return getattr(request.state, "principal", None) or Principal()


def require(p: Principal, *, realm: str | None = None, roles: tuple[str, ...] | None = None, lx: bool = False,
            admin: bool = False, tenant: str | None = None) -> Principal:
    if p.guest:
        raise ApiError("unauthorized", "로그인이 필요합니다")
    if admin and not p.is_admin:
        raise ApiError("forbidden", "LX 관리자 전용")
    if lx and not p.is_lx:
        raise ApiError("forbidden", "LX 계정 전용")
    if realm and p.realm != realm:
        raise ApiError("forbidden", f"{realm} 계정 전용")
    if roles and p.role not in roles:
        raise ApiError("forbidden", "권한 없음")
    if tenant is not None and not p.is_lx and p.tenant_id != tenant:
        raise ApiError("forbidden", "다른 기관의 자원")
    return p


@contextlib.asynccontextmanager
async def db(p: Principal | None = None, *, realm: str | None = None, tenant: str | None = None):
    """트랜잭션 + SET LOCAL app.realm / app.tenant_id (RLS). 시스템 작업은 realm='lx'."""
    r, t = (realm, tenant) if realm else (p.rls() if p else ("public", ""))
    pl = await (pool_tenant() if r == "tenant" else pool())          # 기관 세션 = 기관 권한 계정(1단계) · LX · 시스템 · 게스트 = 앱 계정
    u = (p.user_id or "") if p else ""
    async with pl.acquire() as conn:
        async with conn.transaction():
            await conn.execute("SELECT set_config('app.realm', $1, true), set_config('app.tenant_id', $2, true), set_config('app.user_id', $3, true)",
                               r, t or "", u)
            yield conn


async def audit(conn, p: Principal, action: str, subject: str, before=None, after=None):
    await conn.execute("INSERT INTO audit_log(actor, realm, action, subject, before, after) VALUES ($1,$2,$3,$4,$5,$6)",
                       p.user_id or "system", p.realm or "system", action, subject, before, after)


# ── 적은 수의 키 목록(워커 하트비트 · 레인 · GPU 해시) — Redis 전체를 훑지 않게(impl-46 ops) ─────────────────
# Redis 에는 작업 기록 키가 수십만 개라 scan_iter(match="worker:*:hb") 한 번이 0.4~0.8 s 였다(/health · 인프라 · 공유 데이터 화면).
# 패턴마다 10 s 에 한 번만 훑고(모든 게이트웨이 프로세스를 통틀어 · Redis 잠금) 목록을 Redis 에 둔다. 값(hgetall)은 늘 지금 것을 읽고,
# 목록에 있는데 값이 비면(워커가 멈춰 키가 사라짐) 호출하는 쪽이 빈 해시로 본다 — 새 워커는 길어야 10 s 뒤에 보인다.
_KEYS_MEM: dict[str, tuple[float, list[str]]] = {}
KEYS_TTL_S = 10


async def keys_like(pattern: str, ttl: float = KEYS_TTL_S) -> list[str]:
    import time as _t
    now = _t.time()
    hit = _KEYS_MEM.get(pattern)
    if hit and now - hit[0] < ttl:
        return hit[1]
    r = await redis()
    ck = f"lx:keyidx:{pattern}"
    raw = await r.get(ck)
    if raw is None and await r.set(ck + ":lock", "1", nx=True, ex=30):
        try:
            keys = sorted({k async for k in r.scan_iter(match=pattern, count=5000)})
            await r.set(ck, json.dumps(keys), ex=max(1, int(ttl)))
            raw = json.dumps(keys)
        finally:
            await r.delete(ck + ":lock")
    if raw is None:                       # 다른 프로세스가 훑는 중 — 지난 목록 · 없으면 직접
        if hit:
            return hit[1]
        keys = sorted({k async for k in r.scan_iter(match=pattern, count=5000)})
    else:
        keys = json.loads(raw)
    _KEYS_MEM[pattern] = (now, keys)
    return keys
