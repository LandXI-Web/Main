"""인증(F1-CONTRACT §3) — argon2 · Bearer 토큰(sessions 표 · 24h) · SSE 는 ?access_token= 만.

LX 계정(lx_users)과 기관 계정(tenant_users)은 완전히 다른 표·다른 토큰 접두(lxs_ / lxt_)다.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import hmac
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, InvalidHashError
from starlette.concurrency import run_in_threadpool
from fastapi import APIRouter, Request
from fastapi.responses import Response

from . import config
from .deps import ApiError, CAPS, Principal, db, pool, principal, require
from .envelope import KST, now_iso

router = APIRouter()
ph = PasswordHasher()
TTL = dt.timedelta(hours=24)


def hash_password(pw: str) -> str:
    return ph.hash(pw)


def token_hash(token: str) -> str:
    return hmac.new(config.SESSION_SECRET, token.encode(), hashlib.sha256).hexdigest()


async def resolve(request: Request) -> Principal:
    """미들웨어가 요청마다 부른다. 토큰이 없거나 만료면 게스트."""
    tok = None
    h = request.headers.get("authorization", "")
    if h.lower().startswith("bearer "):
        tok = h[7:].strip()
    elif request.url.path.startswith("/api/v1/events/"):
        tok = request.query_params.get("access_token")
    if not tok:
        return Principal()
    th = token_hash(tok)
    pl = await pool()
    row = await pl.fetchrow("SELECT realm, user_id, tenant_id, role, expires_at FROM sessions WHERE token_hash=$1", th)
    if not row or row["expires_at"] < dt.datetime.now(dt.timezone.utc):
        return Principal()
    if row["realm"] == "lx":
        u = await pl.fetchrow("SELECT name FROM lx_users WHERE id=$1", row["user_id"])
    else:
        u = await pl.fetchrow("SELECT name FROM tenant_users WHERE id=$1", row["user_id"])
    return Principal(realm=row["realm"], role=row["role"], tenant_id=row["tenant_id"], user_id=row["user_id"],
                     name=u["name"] if u else None, token_hash=th, caps=CAPS.get((row["realm"], row["role"]), []))


@router.post("/auth/login")
async def login(body: dict):
    realm = body.get("realm")
    login_ = (body.get("login") or "").strip()
    pw = body.get("password") or ""
    pl = await pool()
    if realm == "lx":
        u = await pl.fetchrow("SELECT id, pw_hash, role, status, name FROM lx_users WHERE login=$1", login_)
        tenant_id = None
    elif realm == "tenant":
        tenant_id = body.get("tenant_id")
        u = await pl.fetchrow("SELECT id, pw_hash, role, status, name FROM tenant_users WHERE tenant_id=$1 AND login=$2", tenant_id, login_)
    else:
        raise ApiError("bad_request", "realm 은 lx | tenant")
    ok = False
    if u and u["status"] == "active":
        try:
            ok = await run_in_threadpool(ph.verify, u["pw_hash"], pw)     # argon2 는 CPU 를 쓴다 — 이벤트 루프를 막지 않게(동시 로그인 · 헬스 지연 0)
        except (VerifyMismatchError, InvalidHashError):
            ok = False
    if not ok:
        raise ApiError("unauthorized", "아이디 또는 비밀번호가 맞지 않습니다")
    tok = ("lxs_" if realm == "lx" else "lxt_") + secrets.token_urlsafe(32)
    exp = dt.datetime.now(KST) + TTL
    await pl.execute("INSERT INTO sessions(token_hash, realm, user_id, tenant_id, role, expires_at) VALUES ($1,$2,$3,$4,$5,$6)",
                     token_hash(tok), realm, u["id"], tenant_id, u["role"], exp)
    await pl.execute("DELETE FROM sessions WHERE expires_at < now()")
    async with db(realm="lx") as conn:
        await conn.execute("INSERT INTO audit_log(actor, realm, action, subject) VALUES ($1,$2,'login',$3)", u["id"], realm, login_)
    return {"token": tok, "realm": realm, "role": u["role"], "tenant_id": tenant_id,
            "user": {"id": u["id"], "name": u["name"]}, "expires_at": exp.isoformat(timespec="seconds")}


@router.get("/auth/tenants")
async def public_tenants():
    """공개 기관 디렉터리(F3 최종 명세 §3 S-1) — 정문이 픽스처 없이 기관 목록을 얻는다. 인증 불필요.
    active 이고 이용 기관(kind user)만 · LX 자신(maker)·영업 계량 기관(lx-demo) 제외 · 이름과 범위만(계정·쿼터·경로 0)."""
    pl = await pool()
    rows = await pl.fetch("SELECT id, name, scope FROM tenants WHERE status='active' AND kind='user' AND id <> 'lx-demo' ORDER BY (scope = 'global'), id")   # 국내 먼저
    items = [{"id": r["id"], "name": {"ko": (r["name"] or {}).get("ko"), "en": (r["name"] or {}).get("en")}, "scope": r["scope"]} for r in rows]
    return {"items": items, "as_of": now_iso()}


@router.post("/auth/logout", status_code=204)
async def logout(request: Request):
    p = principal(request)
    if p.token_hash:
        pl = await pool()
        await pl.execute("DELETE FROM sessions WHERE token_hash=$1", p.token_hash)
    return Response(status_code=204)


@router.get("/me")
async def me(request: Request):
    p = require(principal(request))
    return {"realm": p.realm, "role": p.role, "tenant_id": p.tenant_id, "caps": p.caps,
            "user": {"id": p.user_id, "name": p.name}, "at": now_iso()}
