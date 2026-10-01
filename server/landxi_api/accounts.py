"""계정 — 가입 신청 · 아이디 찾기 · 비밀번호 찾기(재설정 요청) · 승인하는 화면(LX 관리자 · 기관 관리자) (구현 2차 T5).

근거: 확인 대장 FR-4(계정을 관리자 화면에서 만들기·승인·비밀번호 재설정·잠금 — 확인) · D4-ⓑ(기관 사용자 가입 신청 + 승인 — 확인) ·
      원칙 49(입력 최소) · 원칙 72(LX 관리자는 다 보고 돕는다) · 원칙 77(아이디 = 메일 주소) · 10-01 사용자 "가입 신청과 아이디 비밀번호 찾기 등 기능".

로그인 없이 부르는 길(시도 제한 — 접속 주소마다 · 입력 검증):
  POST /accounts/signup         {site?, tenant_id?, name, login(메일), password, password2?, dept, consent:true} → 201 {ok, state:'pending'}
                                  site 가 admin 이면 받지 않는다(LX 관리자 계정은 LX 관리자가 만든다) · app = LX 직원 신청 · gov = 기관 사용자 신청(tenant_id 필수)
  POST /accounts/find-id        {site?, tenant_id?, name} → {items:[가린 메일]} (예: te**@lx.or.kr) · 없으면 빈 목록
  POST /accounts/reset-request  {site?, tenant_id?, login} → {ok} — 계정이 있든 없든 같은 답(있는 메일을 알아내는 데 쓰이지 않게)
  POST /auth/password/change    {change_token, password} → 로그인과 같은 답(세션) — 임시 비밀번호로 들어온 사람이 새 비밀번호를 정한다
입구(site)는 바깥 주소면 공개 관문이 알린 x-lx-site 가 이기고, 이 PC 안이면 본문 site(없으면 tenant_id 유무로 app/gov).

승인하는 사람(관할 — 서버가 정본 · 원칙 39):
  LX 직원 신청 · LX 계정 재설정 = LX 관리자 · 기관 사용자 신청 = 그 기관 관리자(manager)만 승인 · 반려.
  LX 관리자는 기관 가입 승인에 관여하지 않는다(원칙 72 · 10-01 "LX 는 기관 가입 승인에는 관여하지 않지만 사용자 확인·통제·지원") —
  기관 신청은 보기만(서버도 결정 403 tenant_signup) · 기관 계정은 확인 · 잠금 · 지원(임시 비밀번호 · 재설정 요청 처리).
  기관 관리자는 자기 기관 것만 보이고 바꿀 수 있다. 내 계정에 걸린 일(재설정 · 잠금 · 역할 · 임시 비밀번호)은 스스로 하지 않는다(409 self_account).
  사용 중지된 계정(status disabled — 옛 아이디 정리 · 0015_mail_accounts.sql)은 목록에 '사용 중지'로 보이고 바꾸지 않는다(409 disabled_account).
  반려는 사유 필수(400 reason_required). 누가 승인·반려·재설정했는지는 요청 행(decided_*)과 audit_log(account.*) 두 곳에 남는다.

로그인한 관리자가 부르는 길:
  GET  /accounts/summary                        → {counts:{signup, reset}}
  GET  /accounts/requests?kind=signup|reset&state=pending|all
  POST /accounts/signup/{id}/decide             {decision: approve|reject, reason}
  POST /accounts/reset/{id}/decide              {decision: issue|reject, reason} → issue 면 {temp_password}(이 응답에서 한 번만)
  GET  /accounts/users?realm=lx|tenant&tenant_id=
  POST /accounts/users/{realm}/{user_id}/lock   {locked: bool, reason?}
  POST /accounts/users/{realm}/{user_id}/role   {role}
  POST /accounts/users/{realm}/{user_id}/temp-password → {temp_password}(한 번만)
  GET  /accounts/log                            → 계정 기록(누가 무엇을 · 최근 100)
  GET  /accounts/failures                       → 실패한 로그인(아이디 · 시각 · 입구 · 접속 주소 · 까닭 · 최근 200 — 비밀번호 값은 없다)
  잠금: 관리자가 잠근 계정(status locked)과 비밀번호 5번 틀려 10분 잠긴 계정(lock_until · auth.py) 둘 다 lock {locked:false} 로 푼다.

임시 비밀번호: 사람이 불러 주기 쉬운 대문자·숫자 12자(헷갈리는 0·O·1·I·L 제외) · 하루 동안만 · 받은 사람은 로그인하면 새 비밀번호를 정해야 들어간다.
비밀번호 규칙(기본값 — 사용자 확인 대기): 10자 이상 · 영문과 숫자를 함께 · 메일 아이디를 그대로 넣지 않음.
"""
from __future__ import annotations

import datetime as dt
import json
import re
import secrets

from fastapi import APIRouter, Request
from starlette.concurrency import run_in_threadpool

from . import auth, config
from .deps import ApiError, Principal, db, pool, principal, redis, require
from .envelope import KST, now_iso

router = APIRouter()

MAIL = re.compile(r"^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$")
ROLES = {"lx": ("admin", "staff", "sales"), "tenant": ("manager", "viewer")}
ROLE_KO = {("lx", "admin"): "LX 관리자", ("lx", "staff"): "LX 직원", ("lx", "sales"): "LX 영업",
           ("tenant", "manager"): "기관 관리자", ("tenant", "viewer"): "부서 사용자"}
NEW_ROLE = {"lx": "staff", "tenant": "viewer"}          # 승인으로 만든 계정의 첫 역할 — 바꾸기는 계정 목록에서
# 시도 제한(접속 주소마다) — (횟수, 초). 가입 신청은 한 기관 직원들이 같은 사무실 주소로 몰려도 막히지 않게 한 시간 20번
LIMITS = {"signup": (20, 3600), "find": (10, 600), "reset": (10, 600), "change": (10, 600)}
TEMP_ALPHA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
TEMP_TTL = dt.timedelta(hours=24)
KEEP_REJECTED = dt.timedelta(days=30)
ACTION_KO = {
    "account.signup.request": "가입 신청", "account.signup.approve": "가입 승인", "account.signup.reject": "가입 반려",
    "account.reset.request": "비밀번호 재설정 요청", "account.reset.issue": "임시 비밀번호 발급", "account.reset.reject": "재설정 반려",
    "account.temp.issue": "임시 비밀번호 발급", "account.lock": "잠금", "account.unlock": "잠금 풀기", "account.role": "역할 변경",
    "account.password.change": "새 비밀번호 설정", "account.autolock": "자동 잠금(10분)",
}
FAIL_KO = {"password": "비밀번호 틀림", "unknown": "없는 아이디", "temp_locked": "잠긴 동안 시도", "locked": "잠긴 계정", "temp_expired": "임시 비밀번호 기간 지남",
           "disabled": "사용 중지된 계정"}
TENANT_SIGNUP_MSG = "기관 가입 신청은 그 기관 관리자가 승인합니다"
# LX 직원 가입 신청은 회사 메일만(구현 확인 2차 Q-2 ⓐ) — 기관 신청은 기관 메일이 제각각이라 제한하지 않는다(그 기관 관리자가 승인으로 거른다)
LX_MAIL_DOMAINS = tuple(d.strip().lower() for d in (config.get("LX_STAFF_MAIL_DOMAINS", "lx.or.kr") or "").split(",") if d.strip())
SITE_KO = {"app": "Land-XI", "admin": "LX 관리자", "gov": "기관"}


# ── 공용 ────────────────────────────────────────────────────────────────────────────────
def _iso(v):
    return v.astimezone(KST).isoformat(timespec="seconds") if v else None


def client_ip(request: Request) -> str:
    """접속 주소 — 바깥 요청은 공개 관문이 x-forwarded-for 를 새로 적어 넘긴다(게이트웨이는 127.0.0.1 에만 열려 있다)."""
    xff = request.headers.get("x-forwarded-for") or ""
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else ""


async def _limit(kind: str, request: Request, extra: str = ""):
    n, win = LIMITS[kind]
    k = f"lx:acct:{kind}:{client_ip(request)}{':' + extra if extra else ''}"
    try:
        r = await redis()
        c = await r.incr(k)
        if c == 1:
            await r.expire(k, win)
        if c <= n:
            return
        left = await r.ttl(k)
    except Exception:           # 제한 저장소가 멈춰도 신청·찾기는 막지 않는다(입력 검증은 그대로)
        return
    mins = max(1, round((left if left and left > 0 else win) / 60))
    raise ApiError("too_many_attempts", f"시도가 너무 많습니다. {mins}분 뒤 다시 해 주세요.", status=429)


def _site(request: Request, body: dict) -> tuple[str, str]:
    site = request.headers.get("x-lx-site") or body.get("site") or ("gov" if body.get("tenant_id") else "app")
    if site not in auth.SITE_REALM:
        raise ApiError("bad_request", "site 는 app | admin | gov")
    return site, auth.SITE_REALM[site]


def _josa(word: str, pair: str) -> str:
    """받침이 있으면 앞 글자('을' · '은'), 없으면 뒤 글자('를' · '는')."""
    c = ord(word[-1]) if word else 0
    return pair[0] if 0xAC00 <= c <= 0xD7A3 and (c - 0xAC00) % 28 else pair[1]


def _text(v, most: int, label: str, field: str) -> str:
    s = " ".join(str(v or "").split())
    if not s:
        raise ApiError("bad_request", f"{label}{_josa(label, '을를')} 적어 주세요", {"field": field})
    if len(s) > most:
        raise ApiError("bad_request", f"{label}{_josa(label, '은는')} {most}자까지입니다", {"field": field})
    return s


def _mail(v) -> str:
    s = str(v or "").strip().lower()
    if not s:
        raise ApiError("bad_request", "메일 주소를 적어 주세요", {"field": "login"})
    if len(s) > 254 or not MAIL.match(s):
        raise ApiError("bad_request", "메일 주소 형식을 확인하세요", {"field": "login"})
    return s


def check_password(pw: str, login: str = "") -> None:
    if not isinstance(pw, str) or len(pw) < 10:
        raise ApiError("bad_request", "비밀번호는 10자 이상입니다", {"field": "password"})
    if len(pw) > 128:
        raise ApiError("bad_request", "비밀번호는 128자까지입니다", {"field": "password"})
    if not (re.search(r"[A-Za-z]", pw) and re.search(r"\d", pw)):
        raise ApiError("bad_request", "영문과 숫자를 함께 넣어 주세요", {"field": "password"})
    local = (login or "").split("@")[0].lower()
    if len(local) >= 4 and local in pw.lower():
        raise ApiError("bad_request", "메일 아이디를 비밀번호에 넣지 마세요", {"field": "password"})


def mask(login: str) -> str:
    """te**@lx.or.kr — 앞 두 글자만 보이고 나머지는 가린다(짧으면 한 글자). 옛 아이디(메일 아님)도 같은 방식."""
    local, at, dom = (login or "").partition("@")
    keep = 2 if len(local) > 3 else 1
    return local[:keep] + "*" * max(2, len(local) - keep) + (at + dom if at else "")


def temp_password() -> str:
    while True:
        s = "".join(secrets.choice(TEMP_ALPHA) for _ in range(12))
        if re.search(r"[A-Z]", s) and re.search(r"\d", s):
            return f"{s[:4]}-{s[4:8]}-{s[8:]}"


async def _tenant_ok(conn, tid) -> dict:
    if not tid or not isinstance(tid, str):
        raise ApiError("bad_request", "기관을 고르세요", {"field": "tenant_id"})
    r = await conn.fetchrow("SELECT id, name FROM tenants WHERE id=$1 AND status='active' AND kind='user' AND id <> 'lx-demo'", tid)
    if not r:
        raise ApiError("bad_request", "기관을 고르세요", {"field": "tenant_id"})
    return r


def _tname(v) -> str:
    return ((v or {}).get("ko") or (v or {}).get("en") or "") if isinstance(v, dict) else (v or "")


async def _log(conn, actor: str, realm: str, action: str, subject: str, after: dict):
    await conn.execute("INSERT INTO audit_log(actor, realm, action, subject, after) VALUES ($1,$2,$3,$4,$5)", actor, realm, action, subject, after)


async def _purge(conn):
    """반려된 신청은 30일 뒤 지운다(동의 안내 '보관 기간'과 같은 값) · 끝난 신청의 비밀번호 해시는 남기지 않는다."""
    await conn.execute("DELETE FROM signup_requests WHERE state='rejected' AND decided_at < now() - $1::interval", KEEP_REJECTED)
    await conn.execute("UPDATE signup_requests SET pw_hash=NULL WHERE state <> 'pending' AND pw_hash IS NOT NULL")


# ── 로그인 없이 — 가입 신청 · 아이디 찾기 · 비밀번호 찾기 ─────────────────────────────────
@router.post("/accounts/signup", status_code=201)
async def signup(body: dict, request: Request):
    site, realm = _site(request, body)
    if site == "admin":
        raise ApiError("forbidden", "LX 관리자 계정은 LX 관리자가 만듭니다")
    await _limit("signup", request)
    name = _text(body.get("name"), 40, "이름", "name")
    login = _mail(body.get("login"))
    if realm == "lx" and LX_MAIL_DOMAINS and login.rpartition("@")[2] not in LX_MAIL_DOMAINS:
        raise ApiError("bad_request", f"LX 직원은 @{LX_MAIL_DOMAINS[0]} 메일로 신청합니다", {"field": "login"})
    pw = body.get("password") or ""
    check_password(pw, login)
    if body.get("password2") is not None and body.get("password2") != pw:
        raise ApiError("bad_request", "두 비밀번호가 서로 다릅니다", {"field": "password2"})
    dept = _text(body.get("dept"), 60, "부서", "dept")
    if body.get("consent") is not True:
        raise ApiError("bad_request", "개인정보 수집·이용에 동의해야 신청할 수 있습니다", {"field": "consent"})
    pw_hash = await run_in_threadpool(auth.hash_password, pw)
    async with db(realm="lx") as conn:
        tid = None
        if realm == "tenant":
            tid = (await _tenant_ok(conn, body.get("tenant_id")))["id"]
            used = await conn.fetchval("SELECT 1 FROM tenant_users WHERE tenant_id=$1 AND lower(login)=$2", tid, login)
        else:
            used = await conn.fetchval("SELECT 1 FROM lx_users WHERE lower(login)=$1", login)
        used = used or await conn.fetchval("SELECT 1 FROM signup_requests WHERE state='pending' AND realm=$1 AND coalesce(tenant_id,'')=coalesce($2,'') "
                                           "AND lower(login)=$3", realm, tid, login)
        if used:
            raise ApiError("conflict", "이미 가입했거나 신청한 메일 주소입니다", {"field": "login"}, 409)
        rid = "sr_" + secrets.token_hex(8)
        await conn.execute("INSERT INTO signup_requests(id, realm, tenant_id, login, name, dept, pw_hash, consent_at) VALUES ($1,$2,$3,$4,$5,$6,$7,now())",
                           rid, realm, tid, login, name, dept, pw_hash)
        await _log(conn, "public", "public", "account.signup.request", login,
                   {"request": rid, "realm": realm, "tenant_id": tid, "name": name, "dept": dept, "ip": client_ip(request)})
        await _purge(conn)
    return {"ok": True, "state": "pending", "at": now_iso()}


@router.post("/accounts/find-id")
async def find_id(body: dict, request: Request):
    site, realm = _site(request, body)
    await _limit("find", request)
    name = _text(body.get("name"), 40, "이름", "name")
    pl = await pool()
    if realm == "tenant":
        async with db(realm="lx") as conn:
            tid = (await _tenant_ok(conn, body.get("tenant_id")))["id"]
        rows = await pl.fetch("SELECT login FROM tenant_users WHERE tenant_id=$1 AND name=$2 AND status IN ('active','locked') ORDER BY login LIMIT 5", tid, name)
    else:
        rows = await pl.fetch("SELECT login FROM lx_users WHERE name=$1 AND status IN ('active','locked') ORDER BY login LIMIT 5", name)
    return {"items": [mask(r["login"]) for r in rows], "at": now_iso()}


@router.post("/accounts/reset-request")
async def reset_request(body: dict, request: Request):
    site, realm = _site(request, body)
    await _limit("reset", request)
    login = str(body.get("login") or "").strip()
    if not login or len(login) > 254:
        raise ApiError("bad_request", "메일 주소를 적어 주세요", {"field": "login"})
    async with db(realm="lx") as conn:
        tid = None
        if realm == "tenant":
            tid = (await _tenant_ok(conn, body.get("tenant_id")))["id"]
            u = await conn.fetchrow("SELECT id, login, name FROM tenant_users WHERE tenant_id=$1 AND lower(login)=lower($2) AND status IN ('active','locked')", tid, login)
        else:
            u = await conn.fetchrow("SELECT id, login, name FROM lx_users WHERE lower(login)=lower($1) AND status IN ('active','locked')", login)
        if u and not await conn.fetchval("SELECT 1 FROM reset_requests WHERE state='pending' AND realm=$1 AND user_id=$2", realm, u["id"]):
            rid = "rr_" + secrets.token_hex(8)
            await conn.execute("INSERT INTO reset_requests(id, realm, tenant_id, user_id, login) VALUES ($1,$2,$3,$4,$5)", rid, realm, tid, u["id"], u["login"])
            await _log(conn, "public", "public", "account.reset.request", u["login"],
                       {"request": rid, "realm": realm, "tenant_id": tid, "name": u["name"], "ip": client_ip(request)})
    return {"ok": True, "at": now_iso()}           # 있든 없든 같은 답


@router.post("/auth/password/change")
async def password_change(body: dict, request: Request):
    """임시 비밀번호로 들어온 사람이 새 비밀번호를 정한다 — 로그인이 준 바꾸기 표(15분 · 한 번)만 받는다. 성공하면 로그인과 같은 답(세션)."""
    tok = str(body.get("change_token") or "")
    if not tok.startswith("lxc_"):
        raise ApiError("unauthorized", "다시 로그인해 주세요")
    await _limit("change", request)
    r = await redis()
    key = auth.CHANGE_KEY + auth.token_hash(tok)
    raw = await r.get(key)
    if not raw:
        raise ApiError("unauthorized", "시간이 지났습니다. 임시 비밀번호로 다시 로그인해 주세요")
    c = json.loads(raw)
    pw = body.get("password") or ""
    check_password(pw, c.get("login") or "")
    if body.get("password2") is not None and body.get("password2") != pw:
        raise ApiError("bad_request", "두 비밀번호가 서로 다릅니다", {"field": "password2"})
    table = "lx_users" if c["realm"] == "lx" else "tenant_users"
    pl = await pool()
    u = await pl.fetchrow(f"SELECT id, pw_hash, role, status, name, must_change FROM {table} WHERE id=$1", c["user_id"])
    if not u or u["status"] != "active" or not u["must_change"]:
        await r.delete(key)
        raise ApiError("unauthorized", "다시 로그인해 주세요")
    try:
        same = await run_in_threadpool(auth.ph.verify, u["pw_hash"], pw)
    except Exception:
        same = False
    if same:
        raise ApiError("bad_request", "임시 비밀번호와 다른 비밀번호를 정하세요", {"field": "password"})
    h = await run_in_threadpool(auth.hash_password, pw)
    await pl.execute(f"UPDATE {table} SET pw_hash=$2, must_change=false, temp_pw_at=NULL WHERE id=$1", u["id"], h)
    await r.delete(key)
    async with db(realm="lx") as conn:
        await _log(conn, u["id"], c["realm"], "account.password.change", c.get("login") or "", {"realm": c["realm"], "tenant_id": c.get("tenant_id"), "name": u["name"]})
    return await auth.open_session(c["realm"], u, c.get("tenant_id"), c.get("site"), c.get("login") or "")


# ── 관리자 — 관할 ───────────────────────────────────────────────────────────────────────
def _who(request: Request) -> Principal:
    p = require(principal(request))
    if p.is_admin or (p.realm == "tenant" and p.role == "manager"):
        return p
    raise ApiError("forbidden", "계정을 관리할 권한이 없습니다")


def _mine(p: Principal, realm: str, user_id: str) -> bool:
    return p.realm == realm and p.user_id == user_id


def _in_scope(p: Principal, realm: str, tenant_id: str | None) -> bool:
    """LX 관리자 = 전부 · 기관 관리자 = 자기 기관 계정만(LX 계정 0)."""
    return p.is_admin or (realm == "tenant" and tenant_id == p.tenant_id)


def _can_decide_signup(p: Principal, realm: str) -> bool:
    """가입 신청을 승인 · 반려할 수 있나 — LX 직원 신청 = LX 관리자 · 기관 신청 = 그 기관 관리자만(LX 관리자는 보기만 · 원칙 72)."""
    return (realm == "lx" and p.is_admin) or (realm == "tenant" and p.realm == "tenant" and p.role == "manager")


async def _tenant_names(conn) -> dict:
    return {r["id"]: _tname(r["name"]) for r in await conn.fetch("SELECT id, name FROM tenants")}


async def _last_login(conn, ids: list[str]) -> dict:
    if not ids:
        return {}
    rows = await conn.fetch("SELECT actor, max(at) AS at FROM audit_log WHERE action='login' AND actor = ANY($1::text[]) GROUP BY actor", ids)
    return {r["actor"]: r["at"] for r in rows}


@router.get("/accounts/summary")
async def summary(request: Request):
    p = _who(request)
    pl = await pool()
    w = "" if p.is_admin else " AND realm='tenant' AND tenant_id=$1"
    a = [] if p.is_admin else [p.tenant_id]
    # 가입 신청 수 = 내가 승인 · 반려할 것(LX 관리자 = LX 직원 신청 · 기관 관리자 = 자기 기관 신청). LX 관리자가 보기만 하는 기관 신청은 따로(signup_view)
    s = await pl.fetchval("SELECT count(*) FROM signup_requests WHERE state='pending'" + (" AND realm='lx'" if p.is_admin else w), *a)
    sv = await pl.fetchval("SELECT count(*) FROM signup_requests WHERE state='pending' AND realm='tenant'") if p.is_admin else 0
    r = await pl.fetchval("SELECT count(*) FROM reset_requests WHERE state='pending'" + w, *a)
    return {"counts": {"signup": s, "reset": r, "signup_view": sv}, "at": now_iso()}


@router.get("/accounts/requests")
async def list_requests(request: Request, kind: str = "signup", state: str = "pending"):
    p = _who(request)
    if kind not in ("signup", "reset") or state not in ("pending", "all"):
        raise ApiError("bad_request", "kind 는 signup | reset · state 는 pending | all")
    pl = await pool()
    table = "signup_requests" if kind == "signup" else "reset_requests"
    q = f"SELECT * FROM {table} WHERE ($1::text = 'all' OR state = 'pending')"
    args = [state]
    if not p.is_admin:
        q += " AND realm='tenant' AND tenant_id=$2"
        args.append(p.tenant_id)
    rows = await pl.fetch(q + " ORDER BY created_at DESC LIMIT 200", *args)
    async with db(realm="lx") as conn:
        tn = await _tenant_names(conn)
        users = {}
        if kind == "reset":
            for realm_ in ("lx", "tenant"):
                ids = [r["user_id"] for r in rows if r["realm"] == realm_]
                if ids:
                    tbl = "lx_users" if realm_ == "lx" else "tenant_users"
                    for u in await conn.fetch(f"SELECT id, name, dept, role, status FROM {tbl} WHERE id = ANY($1::text[])", ids):
                        users[(realm_, u["id"])] = u
            last = await _last_login(conn, [r["user_id"] for r in rows])
    items = []
    for r in rows:
        it = {"id": r["id"], "kind": kind, "realm": r["realm"], "tenant_id": r["tenant_id"], "org": "LX" if r["realm"] == "lx" else tn.get(r["tenant_id"], ""),
              "login": r["login"], "state": r["state"], "reason": r["reason"], "created_at": _iso(r["created_at"]),
              "decided_name": r["decided_name"], "decided_at": _iso(r["decided_at"])}
        if kind == "signup":
            it.update({"name": r["name"], "dept": r["dept"], "consent_at": _iso(r["consent_at"]), "mine": False,
                       "can_decide": _can_decide_signup(p, r["realm"])})   # LX 관리자가 보는 기관 신청 = 보기만(원칙 72)
        else:
            u = users.get((r["realm"], r["user_id"]))
            it.update({"name": u["name"] if u else "", "dept": u["dept"] if u else None, "role_ko": ROLE_KO.get((r["realm"], u["role"])) if u else None,
                       "status": u["status"] if u else "gone", "last_login": _iso(last.get(r["user_id"])), "mine": _mine(p, r["realm"], r["user_id"])})
        items.append(it)
    return {"items": items, "at": now_iso()}


def _decision(body: dict, ok: tuple[str, ...]) -> tuple[str, str]:
    d = body.get("decision")
    if d not in ok:
        raise ApiError("bad_request", "decision 은 " + " | ".join(ok))
    reason = " ".join(str(body.get("reason") or "").split())[:200]
    if d == "reject" and not reason:
        raise ApiError("reason_required", "반려 사유를 적어 주세요", status=400)
    return d, reason


async def _drop_sessions(conn, realm: str, user_id: str):
    await conn.execute("DELETE FROM sessions WHERE realm=$1 AND user_id=$2", realm, user_id)


async def _forget_fails(realm: str, tenant_id: str | None, login: str):
    try:
        r = await redis()
        await r.delete(auth.fail_key(realm, tenant_id, login))
    except Exception:
        pass


@router.post("/accounts/signup/{rid}/decide")
async def decide_signup(rid: str, body: dict, request: Request):
    p = _who(request)
    d, reason = _decision(body, ("approve", "reject"))
    async with db(realm="lx") as conn:
        r = await conn.fetchrow("SELECT * FROM signup_requests WHERE id=$1 FOR UPDATE", rid)
        if not r or not _in_scope(p, r["realm"], r["tenant_id"]):
            raise ApiError("not_found", "신청이 없습니다")
        if not _can_decide_signup(p, r["realm"]):     # LX 관리자는 기관 가입 승인에 관여하지 않는다(보기 · 잠금 · 지원만 — 원칙 72)
            raise ApiError("tenant_signup", TENANT_SIGNUP_MSG, status=403)
        if r["state"] != "pending":
            raise ApiError("conflict", "이미 처리한 신청입니다", {"state": r["state"], "by": r["decided_name"]}, 409)
        uid = None
        if d == "approve":
            if r["realm"] == "lx":
                if await conn.fetchval("SELECT 1 FROM lx_users WHERE lower(login)=lower($1)", r["login"]):
                    raise ApiError("conflict", "이미 있는 아이디입니다", None, 409)
                uid = "u_" + secrets.token_hex(6)
                await conn.execute("INSERT INTO lx_users(id, login, pw_hash, role, status, name, dept) VALUES ($1,$2,$3,$4,'active',$5,$6)",
                                   uid, r["login"], r["pw_hash"], NEW_ROLE["lx"], r["name"], r["dept"])
            else:
                if await conn.fetchval("SELECT 1 FROM tenant_users WHERE tenant_id=$1 AND lower(login)=lower($2)", r["tenant_id"], r["login"]):
                    raise ApiError("conflict", "이미 있는 아이디입니다", None, 409)
                uid = "u_" + secrets.token_hex(6)
                await conn.execute("INSERT INTO tenant_users(id, tenant_id, login, pw_hash, role, status, name, dept) VALUES ($1,$2,$3,$4,$5,'active',$6,$7)",
                                   uid, r["tenant_id"], r["login"], r["pw_hash"], NEW_ROLE["tenant"], r["name"], r["dept"])
        await conn.execute("UPDATE signup_requests SET state=$2, reason=$3, user_id=$4, pw_hash=NULL, decided_by=$5, decided_realm=$6, decided_name=$7, decided_at=now() "
                           "WHERE id=$1", rid, "approved" if d == "approve" else "rejected", reason or None, uid, p.user_id, p.realm, p.name)
        await _log(conn, p.user_id, p.realm, f"account.signup.{d}", r["login"],
                   {"request": rid, "realm": r["realm"], "tenant_id": r["tenant_id"], "name": r["name"], "reason": reason or None,
                    "role": NEW_ROLE[r["realm"]] if d == "approve" else None})
    return {"ok": True, "state": "approved" if d == "approve" else "rejected", "at": now_iso()}


async def _issue_temp(conn, p: Principal, realm: str, u, tenant_id: str | None, action: str, extra: dict) -> str:
    tp = temp_password()
    h = await run_in_threadpool(auth.hash_password, tp)
    table = "lx_users" if realm == "lx" else "tenant_users"
    await conn.execute(f"UPDATE {table} SET pw_hash=$2, must_change=true, temp_pw_at=now() WHERE id=$1", u["id"], h)
    await _drop_sessions(conn, realm, u["id"])
    await conn.execute("UPDATE reset_requests SET state='issued', decided_by=$3, decided_realm=$4, decided_name=$5, decided_at=now() "
                       "WHERE state='pending' AND realm=$1 AND user_id=$2", realm, u["id"], p.user_id, p.realm, p.name)
    await _log(conn, p.user_id, p.realm, action, u["login"], {"realm": realm, "tenant_id": tenant_id, "name": u["name"], **extra})
    await _forget_fails(realm, tenant_id, u["login"])
    return tp


@router.post("/accounts/reset/{rid}/decide")
async def decide_reset(rid: str, body: dict, request: Request):
    p = _who(request)
    d, reason = _decision(body, ("issue", "reject"))
    async with db(realm="lx") as conn:
        r = await conn.fetchrow("SELECT * FROM reset_requests WHERE id=$1 FOR UPDATE", rid)
        if not r or not _in_scope(p, r["realm"], r["tenant_id"]):
            raise ApiError("not_found", "요청이 없습니다")
        if r["state"] != "pending":
            raise ApiError("conflict", "이미 처리한 요청입니다", {"state": r["state"], "by": r["decided_name"]}, 409)
        if _mine(p, r["realm"], r["user_id"]):
            raise ApiError("self_account", "내 계정의 요청은 다른 관리자가 처리합니다", status=409)
        if d == "reject":
            await conn.execute("UPDATE reset_requests SET state='rejected', reason=$2, decided_by=$3, decided_realm=$4, decided_name=$5, decided_at=now() WHERE id=$1",
                               rid, reason, p.user_id, p.realm, p.name)
            await _log(conn, p.user_id, p.realm, "account.reset.reject", r["login"], {"request": rid, "realm": r["realm"], "tenant_id": r["tenant_id"], "reason": reason})
            return {"ok": True, "state": "rejected", "at": now_iso()}
        table = "lx_users" if r["realm"] == "lx" else "tenant_users"
        u = await conn.fetchrow(f"SELECT id, login, name, status FROM {table} WHERE id=$1", r["user_id"])
        if not u:
            raise ApiError("not_found", "계정이 없습니다")
        if u["status"] == "disabled":
            raise ApiError("disabled_account", "사용 중지된 계정입니다", status=409)
        tp = await _issue_temp(conn, p, r["realm"], u, r["tenant_id"], "account.reset.issue", {"request": rid})
    return {"ok": True, "state": "issued", "temp_password": tp, "locked": u["status"] == "locked", "at": now_iso()}


# ── 관리자 — 계정 목록 · 잠금 · 역할 · 임시 비밀번호 · 기록 ─────────────────────────────────
@router.get("/accounts/users")
async def list_users(request: Request, realm: str | None = None, tenant_id: str | None = None):
    p = _who(request)
    out = []
    async with db(realm="lx") as conn:
        tn = await _tenant_names(conn)
        if p.is_admin and realm in (None, "", "lx") and not tenant_id:
            for u in await conn.fetch("SELECT id, login, role, status, name, dept, must_change, created_at, lock_until FROM lx_users "
                                      "ORDER BY (status = 'disabled'), login"):   # 사용 중지(옛 아이디)는 뒤로
                out.append({"realm": "lx", "tenant_id": None, "org": "LX", **_user(u, "lx")})
        if realm in (None, "", "tenant"):
            tid = tenant_id if p.is_admin else p.tenant_id
            rows = await conn.fetch("SELECT id, tenant_id, login, role, status, name, dept, must_change, created_at, lock_until FROM tenant_users "
                                    "WHERE ($1::text IS NULL OR tenant_id=$1) ORDER BY tenant_id, (status = 'disabled'), login", tid)
            for u in rows:
                if u["tenant_id"] == "lx-demo" and not p.is_admin:
                    continue
                out.append({"realm": "tenant", "tenant_id": u["tenant_id"], "org": tn.get(u["tenant_id"], ""), **_user(u, "tenant")})
        last = await _last_login(conn, [x["id"] for x in out])
    for x in out:
        x["last_login"] = _iso(last.get(x["id"]))
        x["mine"] = _mine(p, x["realm"], x["id"])
    orgs = [{"id": k, "name": v} for k, v in tn.items() if k not in ("lx", "lx-demo")] if p.is_admin else [{"id": p.tenant_id, "name": tn.get(p.tenant_id, "")}]
    return {"items": out, "orgs": orgs, "roles": {k: [{"id": r, "label": ROLE_KO[(k, r)]} for r in v] for k, v in ROLES.items()}, "at": now_iso()}


def _user(u, realm: str) -> dict:
    held = bool(u["lock_until"] and u["lock_until"] > dt.datetime.now(dt.timezone.utc))      # 비밀번호 5번 틀려 잠시 잠김
    return {"id": u["id"], "login": u["login"], "name": u["name"], "dept": u["dept"], "role": u["role"], "role_ko": ROLE_KO.get((realm, u["role"]), u["role"]),
            "status": u["status"], "temp_locked": held, "lock_until": _iso(u["lock_until"]) if held else None,
            "must_change": bool(u["must_change"]), "created_at": _iso(u["created_at"])}


async def _target(conn, p: Principal, realm: str, uid: str):
    if realm not in ROLES:
        raise ApiError("not_found", "계정이 없습니다")
    if realm == "lx":
        u = await conn.fetchrow("SELECT id, login, role, status, name, NULL::text AS tenant_id FROM lx_users WHERE id=$1 FOR UPDATE", uid)
    else:
        u = await conn.fetchrow("SELECT id, login, role, status, name, tenant_id FROM tenant_users WHERE id=$1 FOR UPDATE", uid)
    if not u or not _in_scope(p, realm, u["tenant_id"]):
        raise ApiError("not_found", "계정이 없습니다")
    if _mine(p, realm, uid):
        raise ApiError("self_account", "내 계정은 다른 관리자가 바꿉니다", status=409)
    if u["status"] == "disabled":                      # 옛 아이디 — 메일 아이디로 옮긴 뒤 사용 중지(되살리지 않는다)
        raise ApiError("disabled_account", "사용 중지된 계정입니다", status=409)
    return u


@router.post("/accounts/users/{realm}/{uid}/lock")
async def lock_user(realm: str, uid: str, body: dict, request: Request):
    p = _who(request)
    locked = body.get("locked")
    if not isinstance(locked, bool):
        raise ApiError("bad_request", "locked 는 true | false")
    reason = " ".join(str(body.get("reason") or "").split())[:200] or None
    table = "lx_users" if realm == "lx" else "tenant_users"
    async with db(realm="lx") as conn:
        u = await _target(conn, p, realm, uid)
        if locked:
            await conn.execute(f"UPDATE {table} SET status='locked' WHERE id=$1", uid)
        else:                                            # 관리자 잠금 · 5번 틀림 10분 잠금 둘 다 푼다
            await conn.execute(f"UPDATE {table} SET status='active', lock_until=NULL WHERE id=$1", uid)
        if locked:
            await _drop_sessions(conn, realm, uid)
        await _log(conn, p.user_id, p.realm, "account.lock" if locked else "account.unlock", u["login"],
                   {"realm": realm, "tenant_id": u["tenant_id"], "name": u["name"], "reason": reason})
    if not locked:
        await _forget_fails(realm, u["tenant_id"], u["login"])
    return {"ok": True, "status": "locked" if locked else "active", "at": now_iso()}


@router.post("/accounts/users/{realm}/{uid}/role")
async def set_role(realm: str, uid: str, body: dict, request: Request):
    p = _who(request)
    role = body.get("role")
    if realm not in ROLES or role not in ROLES[realm]:
        raise ApiError("bad_request", "역할을 고르세요")
    table = "lx_users" if realm == "lx" else "tenant_users"
    async with db(realm="lx") as conn:
        u = await _target(conn, p, realm, uid)
        if u["role"] == role:
            return {"ok": True, "role": role, "at": now_iso()}
        await conn.execute(f"UPDATE {table} SET role=$2 WHERE id=$1", uid, role)
        await _drop_sessions(conn, realm, uid)          # 새 역할은 다시 로그인하면 적용 — 옛 역할 세션이 남지 않게
        await _log(conn, p.user_id, p.realm, "account.role", u["login"],
                   {"realm": realm, "tenant_id": u["tenant_id"], "name": u["name"], "from": ROLE_KO.get((realm, u["role"])), "to": ROLE_KO.get((realm, role))})
    return {"ok": True, "role": role, "at": now_iso()}


@router.post("/accounts/users/{realm}/{uid}/temp-password")
async def temp_pw(realm: str, uid: str, request: Request):
    p = _who(request)
    async with db(realm="lx") as conn:
        u = await _target(conn, p, realm, uid)
        tp = await _issue_temp(conn, p, realm, u, u["tenant_id"], "account.temp.issue", {})
    return {"ok": True, "temp_password": tp, "locked": u["status"] == "locked", "at": now_iso()}


@router.get("/accounts/log")
async def account_log(request: Request):
    p = _who(request)
    pl = await pool()
    if p.is_admin:
        rows = await pl.fetch("SELECT id, actor, realm, action, subject, after, at FROM audit_log WHERE action LIKE 'account.%' ORDER BY id DESC LIMIT 100")
    else:
        rows = await pl.fetch("SELECT id, actor, realm, action, subject, after, at FROM audit_log WHERE action LIKE 'account.%' "
                              "AND after->>'tenant_id' = $1 ORDER BY id DESC LIMIT 100", p.tenant_id)
    async with db(realm="lx") as conn:
        names = {r["id"]: r["name"] for r in await conn.fetch("SELECT id, name FROM lx_users")}
        names.update({r["id"]: r["name"] for r in await conn.fetch("SELECT id, name FROM tenant_users")})
        tn = await _tenant_names(conn)
    items = []
    for r in rows:
        a = r["after"] or {}
        who = "신청한 사람" if r["actor"] == "public" else "자동" if r["actor"] == "system" else names.get(r["actor"]) or "관리자"
        items.append({"at": _iso(r["at"]), "who": who, "action": r["action"], "action_ko": ACTION_KO.get(r["action"], r["action"]), "subject": r["subject"],
                      "name": a.get("name"), "org": "LX" if a.get("realm") == "lx" else tn.get(a.get("tenant_id"), ""), "reason": a.get("reason"),
                      "to": a.get("to")})
    return {"items": items, "at": now_iso()}


@router.get("/accounts/failures")
async def login_failures(request: Request):
    """실패한 로그인 — LX 관리자 = 전부 · 기관 관리자 = 자기 기관 입구의 실패만. 이 PC 안 요청은 접속 주소 대신 '이 PC'."""
    p = _who(request)
    pl = await pool()
    if p.is_admin:
        rows = await pl.fetch("SELECT at, realm, tenant_id, login, site, ip, reason FROM login_failures ORDER BY id DESC LIMIT 200")
    else:
        rows = await pl.fetch("SELECT at, realm, tenant_id, login, site, ip, reason FROM login_failures WHERE realm='tenant' AND tenant_id=$1 "
                              "ORDER BY id DESC LIMIT 200", p.tenant_id)
    async with db(realm="lx") as conn:
        tn = await _tenant_names(conn)
    items = [{"at": _iso(r["at"]), "login": r["login"], "org": "LX" if r["realm"] == "lx" else tn.get(r["tenant_id"], ""),
              "site_ko": SITE_KO.get(r["site"] or "", "이 PC"), "ip": "이 PC" if (r["ip"] or "") in ("127.0.0.1", "::1", "") else r["ip"],
              "reason": r["reason"], "reason_ko": FAIL_KO.get(r["reason"], r["reason"])} for r in rows]
    return {"items": items, "at": now_iso()}
