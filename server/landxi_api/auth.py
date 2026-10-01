"""인증(F1-CONTRACT §3) — argon2 · Bearer 토큰(sessions 표 · 24h) · SSE 는 ?access_token= 만.

LX 계정(lx_users)과 기관 계정(tenant_users)은 완전히 다른 표·다른 토큰 접두(lxs_ / lxt_)다.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import hmac
import json
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, InvalidHashError
from starlette.concurrency import run_in_threadpool
from fastapi import APIRouter, Request
from fastapi.responses import Response

from . import config
from .deps import ApiError, CAPS, Principal, db, pool, principal, redis, require
from .envelope import KST, now_iso

router = APIRouter()
ph = PasswordHasher()
TTL = dt.timedelta(hours=24)

# 입구 셋(원칙 27 · 확인 대장 6·7) — 입구가 로그인 문(realm)을 정한다. 서버가 정본:
#   app = LX 계정(직원 · 영업 · 관리자도 — 화면이 LX 직원 첫 화면으로) · admin = LX 관리자 계정만 · gov = 기관 계정
# 입구는 바깥 주소면 공개 관문이 x-lx-site 로 알리고(주소 이름으로만 정함 — 바깥에서 보낸 값은 관문이 버린다),
# 이 PC 안(개발 · ?site=)이면 화면이 본문 site 로 알린다. 입구가 없으면(옛 도구) 본문 realm 그대로.
SITE_REALM = {"app": "lx", "admin": "lx", "gov": "tenant"}

# 구현 2차 T5(계정) — 최소:
#   · 계정마다 잠금(개인정보의 안전성 확보조치 기준 제5조 — 일정 횟수 틀리면 접근 제한): 같은 아이디로 비밀번호를 10분 안에 5번 틀리면
#     그 계정을 10분 잠근다(lock_until) — 잠긴 동안은 맞는 비밀번호도 받지 않는다. 관리자는 계정 화면에서 풀 수 있다(accounts.py lock false).
#     횟수는 바깥 주소(공개 관문을 거친 요청 = x-forwarded-for 있음)만 센다 — 이 PC 안(개발 · 시험)의 틀린 비밀번호 시험이 옛 계정을 잠그지 않게.
#     접속 주소마다의 제한(관문 10분 20번)은 그대로 함께.
#   · 실패한 로그인은 모두 적는다(login_failures — 아이디 · 시각 · 입구 · 접속 주소 · 까닭). 비밀번호 값은 어디에도 적지 않는다.
#   · 관리자가 잠근 계정은 비밀번호가 맞아도 들어가지 않는다(403 account_locked).
#   · 임시 비밀번호(관리자가 발급 · 하루)로 들어오면 세션 대신 바꾸기 표(15분)를 준다 → POST /auth/password/change(accounts.py)에서 새 비밀번호를 정해야 세션.
#   · 메일 아이디는 대소문자를 가리지 않는다(원칙 77).
#   · 사용 중지된 계정(status disabled — 옛 아이디 정리 · 0015_mail_accounts.sql)은 로그인 0 · 남은 세션도 받지 않는다(resolve).
FAIL_MAX, FAIL_WIN = 5, 600
LOCK_FOR = dt.timedelta(minutes=10)
LOCKED_MSG = "비밀번호를 여러 번 틀려 10분 동안 잠겼습니다"
CHANGE_KEY = "lx:pwchange:"
TEMP_TTL = dt.timedelta(hours=24)


def fail_key(realm: str, tenant_id: str | None, login: str) -> str:
    return f"lx:loginfail:{realm}:{tenant_id or ''}:{(login or '').lower()}"


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
        u = await pl.fetchrow("SELECT name, status FROM lx_users WHERE id=$1", row["user_id"])
    else:
        u = await pl.fetchrow("SELECT name, status FROM tenant_users WHERE id=$1", row["user_id"])
    if u and u["status"] == "disabled":            # 사용 중지된 계정(옛 아이디 정리 · 원칙 77) — 남은 세션도 받지 않는다
        return Principal()
    return Principal(realm=row["realm"], role=row["role"], tenant_id=row["tenant_id"], user_id=row["user_id"],
                     name=u["name"] if u else None, token_hash=th, caps=CAPS.get((row["realm"], row["role"]), []))


@router.post("/auth/login")
async def login(body: dict, request: Request):
    realm = body.get("realm")
    site = request.headers.get("x-lx-site") or body.get("site")
    if site is not None:
        if site not in SITE_REALM:
            raise ApiError("bad_request", "site 는 app | admin | gov")
        want = SITE_REALM[site]
        if realm is None:
            realm = want
        elif realm != want:                          # 이 입구의 문이 아니다 — 계정을 찾지도 않는다
            raise ApiError("bad_request", "이 주소에서는 기관 계정으로 로그인합니다" if want == "tenant" else "이 주소에서는 LX 계정으로 로그인합니다")
    login_ = (body.get("login") or "").strip()
    pw = body.get("password") or ""
    pl = await pool()
    cols = "id, pw_hash, role, status, name, must_change, temp_pw_at, lock_until"
    if realm == "lx":
        tenant_id = None
        u = await pl.fetchrow(f"SELECT {cols} FROM lx_users WHERE login=$1", login_)
        if not u and "@" in login_:
            u = await pl.fetchrow(f"SELECT {cols} FROM lx_users WHERE lower(login)=lower($1)", login_)
    elif realm == "tenant":
        tenant_id = body.get("tenant_id")
        u = await pl.fetchrow(f"SELECT {cols} FROM tenant_users WHERE tenant_id=$1 AND login=$2", tenant_id, login_)
        if not u and "@" in login_:
            u = await pl.fetchrow(f"SELECT {cols} FROM tenant_users WHERE tenant_id=$1 AND lower(login)=lower($2)", tenant_id, login_)
    else:
        raise ApiError("bad_request", "realm 은 lx | tenant")
    outside = bool(request.headers.get("x-forwarded-for"))
    ip = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip() or (request.client.host if request.client else "")
    table = "lx_users" if realm == "lx" else "tenant_users"
    fail = lambda why: _record_fail(realm, tenant_id, login_, u["id"] if u else None, site, ip, why)   # noqa: E731
    if u and u["lock_until"] and u["lock_until"] > dt.datetime.now(dt.timezone.utc):   # 잠시 잠김 — 비밀번호를 보지도 않는다
        await fail("temp_locked")
        raise ApiError("temp_locked", LOCKED_MSG, status=423)
    if u and u["status"] == "disabled":             # 사용 중지된 계정(옛 아이디 → 메일 아이디 정리) — 없는 아이디와 같은 답(계정이 있었는지 알리지 않는다)
        await fail("disabled")
        raise ApiError("unauthorized", "아이디 또는 비밀번호가 맞지 않습니다")
    ok = False
    if u and u["status"] in ("active", "locked"):
        try:
            ok = await run_in_threadpool(ph.verify, u["pw_hash"], pw)     # argon2 는 CPU 를 쓴다 — 이벤트 루프를 막지 않게(동시 로그인 · 헬스 지연 0)
        except (VerifyMismatchError, InvalidHashError):
            ok = False
    fk = fail_key(realm, tenant_id, login_)
    if not ok:
        await fail("password" if u else "unknown")
        if u and outside and await _fail(fk) >= FAIL_MAX:              # 같은 아이디 5번째 — 계정 10분 잠금
            await pl.execute(f"UPDATE {table} SET lock_until=$2 WHERE id=$1", u["id"], dt.datetime.now(dt.timezone.utc) + LOCK_FOR)
            await _fail(fk, clear=True)
            await pl.execute("DELETE FROM sessions WHERE realm=$1 AND user_id=$2", realm, u["id"])
            async with db(realm="lx") as conn:
                await conn.execute("INSERT INTO audit_log(actor, realm, action, subject, after) VALUES ('system','system','account.autolock',$1,$2)",
                                   login_, {"realm": realm, "tenant_id": tenant_id, "name": u["name"], "ip": ip, "reason": "비밀번호 5번 틀림"})
            raise ApiError("temp_locked", LOCKED_MSG, status=423)
        raise ApiError("unauthorized", "아이디 또는 비밀번호가 맞지 않습니다")
    if outside:
        await _fail(fk, clear=True)
    if u["status"] == "locked":
        await fail("locked")
        raise ApiError("account_locked", "잠긴 계정입니다. 관리자에게 문의하세요.", status=403)
    if site == "admin" and u["role"] != "admin":     # 관리자 입구 — 관리자 아닌 계정에는 토큰을 내주지 않는다
        raise ApiError("forbidden", "관리자 계정이 아닙니다")
    if u["must_change"]:                             # 임시 비밀번호 — 새 비밀번호를 정해야 들어간다(세션 없음)
        if u["temp_pw_at"] and u["temp_pw_at"] + TEMP_TTL < dt.datetime.now(dt.timezone.utc):
            await fail("temp_expired")
            raise ApiError("temp_expired", "임시 비밀번호의 사용 기간(하루)이 지났습니다. 관리자에게 다시 요청하세요.", status=401)
        ct = "lxc_" + secrets.token_urlsafe(24)
        r = await redis()
        await r.set(CHANGE_KEY + token_hash(ct), json.dumps({"realm": realm, "user_id": u["id"], "tenant_id": tenant_id, "site": site, "login": login_}), ex=900)
        return {"must_change": True, "change_token": ct, "realm": realm, "role": u["role"], "tenant_id": tenant_id, "site": site,
                "user": {"name": u["name"]}}
    return await open_session(realm, u, tenant_id, site, login_)


async def _fail(key: str, clear: bool = False) -> int:
    """같은 아이디의 틀린 횟수(10분 창) — clear 면 지운다. 저장소가 멈추면 0(로그인은 막지 않는다)."""
    try:
        r = await redis()
        if clear:
            await r.delete(key)
            return 0
        n = await r.incr(key)
        if n == 1:
            await r.expire(key, FAIL_WIN)
        return n
    except Exception:
        return 0


async def _record_fail(realm, tenant_id, login_: str, user_id, site, ip: str, reason: str):
    """실패한 로그인 한 줄 — 비밀번호 값은 받지도 적지도 않는다."""
    try:
        pl = await pool()
        await pl.execute("INSERT INTO login_failures(realm, tenant_id, login, user_id, site, ip, reason) VALUES ($1,$2,$3,$4,$5,$6,$7)",
                         realm, tenant_id, (login_ or "")[:254], user_id, site, (ip or "")[:64], reason)
    except Exception:
        pass


async def open_session(realm: str, u, tenant_id: str | None, site: str | None, login_: str) -> dict:
    """세션을 열고 로그인 답을 만든다 — 로그인 · 새 비밀번호 정하기(accounts.py)가 같이 쓴다."""
    pl = await pool()
    tok = ("lxs_" if realm == "lx" else "lxt_") + secrets.token_urlsafe(32)
    exp = dt.datetime.now(KST) + TTL
    await pl.execute("INSERT INTO sessions(token_hash, realm, user_id, tenant_id, role, expires_at) VALUES ($1,$2,$3,$4,$5,$6)",
                     token_hash(tok), realm, u["id"], tenant_id, u["role"], exp)
    await pl.execute("DELETE FROM sessions WHERE expires_at < now()")
    async with db(realm="lx") as conn:
        await conn.execute("INSERT INTO audit_log(actor, realm, action, subject) VALUES ($1,$2,'login',$3)", u["id"], realm, login_)
    return {"token": tok, "realm": realm, "role": u["role"], "tenant_id": tenant_id, "site": site,
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
    user = {"id": p.user_id, "name": p.name}
    if p.realm == "tenant" and p.user_id:            # 기관 화면 머리의 사람 표기(부서 · 이름 — 기관-1 ⓐ) · 본인 계정 값 그대로
        try:
            d = await (await pool()).fetchval("SELECT dept FROM tenant_users WHERE id=$1 AND tenant_id=$2", p.user_id, p.tenant_id)
            user["dept"] = (d or "").strip() or None
        except Exception:  # noqa: BLE001
            pass
    return {"realm": p.realm, "role": p.role, "tenant_id": p.tenant_id, "caps": p.caps, "user": user, "at": now_iso()}
