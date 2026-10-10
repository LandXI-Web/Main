"""공용 의존성 — PG 풀(asyncpg) · Redis · 주체(Principal) · 오류 형식(F1-CONTRACT §10) · RLS SET LOCAL."""
from __future__ import annotations

import contextlib
import json
import secrets
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


async def pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(config.PG_DSN, min_size=2, max_size=16, init=_init_conn, command_timeout=60)
    return _pool


_pool_sys: asyncpg.Pool | None = None


async def pool_sys() -> asyncpg.Pool:
    """시스템 읽기 전용 경로(BYPASSRLS 워커 역할) — RLS 보안 장벽이 공간 조인(ST_Intersects)의 인덱스 사용을 막는 무거운 결합 전용.
    호출자가 관문(resolve · tenant 필터)을 SQL 에 직접 넣어야 한다(v1.1-21 /results/{set}/parcels)."""
    global _pool_sys
    if _pool_sys is None:
        _pool_sys = await asyncpg.create_pool(config.PG_WORKER_DSN, min_size=1, max_size=4, init=_init_conn, command_timeout=120)
    return _pool_sys


async def redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(config.REDIS_URL, decode_responses=True, socket_timeout=40, socket_connect_timeout=5,
                                   socket_keepalive=True, health_check_interval=15, max_connections=256)
    return _redis


async def close():
    global _pool, _redis, _pool_sys
    if _pool:
        await _pool.close()
        _pool = None
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
    pl = await pool()
    async with pl.acquire() as conn:
        async with conn.transaction():
            await conn.execute("SELECT set_config('app.realm', $1, true), set_config('app.tenant_id', $2, true)", r, t or "")
            yield conn


async def audit(conn, p: Principal, action: str, subject: str, before=None, after=None):
    await conn.execute("INSERT INTO audit_log(actor, realm, action, subject, before, after) VALUES ($1,$2,$3,$4,$5,$6)",
                       p.user_id or "system", p.realm or "system", action, subject, before, after)
