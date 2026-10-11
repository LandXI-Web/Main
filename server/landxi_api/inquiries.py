"""문의 — 메인 · 도움말 · 로그인 창의 '문의하기' 창으로 들어온 문의(10-11 메인 지시 3 · 원칙 170).

로그인 없이 부르는 길:
  POST /public/inquiries   {name, org?, contact(메일 또는 전화), kind: intro|howto|etc, body, consent: true, website?(비워 둠)}
                            → 201 {ok, at} — 같은 접속 주소 시간당 PER_HOUR 번까지(넘으면 429). website 칸이 채워져 오면(자동 입력기) 받은 척만 한다.
LX 관리자만 부르는 길(계정 → '문의' 탭):
  GET  /inquiries                    → {items, counts:{new, all}} — 최근 200건. 새 문의 = 읽지 않은 것(시험 제외)
  POST /inquiries/{id}/mark          {read?, answered?, test?} — 읽음 · 답함 · 시험 표시(누가 언제 · 처리 기록에 남는다)
문의 연락처(전화 · 메일)는 운영 정보 값 하나(accounts.contact_value — 원칙 170)를 창 아래에 함께 보인다.
"""
from __future__ import annotations

import re
import secrets

from fastapi import APIRouter, Request

from .accounts import _admin, _iso, client_ip      # 같은 도움 함수(LX 관리자 확인 · 시각 · 접속 주소)
from .deps import ApiError, audit, db, redis
from .envelope import now_iso

router = APIRouter()

PER_HOUR = 5
KIND_KO = {"intro": "서비스 도입", "howto": "사용 방법", "etc": "기타"}
_TEL = re.compile(r"^[0-9+][0-9\- ]{6,19}$")
_MAIL = re.compile(r"^[^@\s]{1,64}@[^@\s]+\.[^@\s]{2,}$")


def _txt(v, lo: int, hi: int, field: str, msg: str) -> str:
    s = re.sub(r"[\u0000-\u0008\u000b\u000c\u000e-\u001f]", "", str(v or "")).strip()
    if len(s) < lo or len(s) > hi:
        raise ApiError("bad_request", msg, {"field": field})
    return s


async def _limit(ip: str):
    k = f"lx:inquiry:{ip}"
    try:
        r = await redis()
        c = await r.incr(k)
        if c == 1:
            await r.expire(k, 3600)
        if c <= PER_HOUR:
            return
        left = await r.ttl(k)
    except Exception:            # 제한 저장소가 멈춰도 문의는 받는다(입력 검증은 그대로)
        return
    mins = max(1, round((left if left and left > 0 else 3600) / 60))
    raise ApiError("too_many_attempts", f"문의를 너무 자주 보냈습니다. {mins}분 뒤 다시 보내 주세요.", status=429)


@router.post("/public/inquiries", status_code=201)
async def send(body: dict, request: Request):
    name = _txt(body.get("name"), 1, 40, "name", "이름을 적어 주세요")
    org = _txt(body.get("org"), 0, 80, "org", "소속은 80자까지 적을 수 있습니다")
    contact = _txt(body.get("contact"), 5, 120, "contact", "답을 받을 메일이나 전화번호를 적어 주세요")
    if not (_MAIL.match(contact) or _TEL.match(contact)):
        raise ApiError("bad_request", "메일 주소나 전화번호를 확인해 주세요", {"field": "contact"})
    kind = str(body.get("kind") or "")
    if kind not in KIND_KO:
        raise ApiError("bad_request", "문의 종류를 골라 주세요", {"field": "kind"})
    text = _txt(body.get("body"), 5, 2000, "body", "내용을 5자 이상 2,000자까지 적어 주세요")
    if body.get("consent") is not True:
        raise ApiError("bad_request", "개인정보 수집에 동의해야 보낼 수 있습니다", {"field": "consent"})
    ip = client_ip(request)
    await _limit(ip)
    if str(body.get("website") or "").strip():          # 사람에게는 보이지 않는 칸 — 채워졌으면 자동 입력기
        return {"ok": True, "at": now_iso()}
    site = request.headers.get("x-lx-site") if request.headers.get("x-forwarded-for") else None
    iid = "iq_" + secrets.token_hex(5)
    async with db(realm="lx") as conn:
        await conn.execute("INSERT INTO inquiries(id, name, org, contact, kind, body, consent_at, site, ip) VALUES ($1,$2,$3,$4,$5,$6,now(),$7,$8)",
                           iid, name, org or None, contact, kind, text, site, ip)
    return {"ok": True, "at": now_iso()}


def _row(r) -> dict:
    ip = r["ip"] or ""
    return {"id": r["id"], "at": _iso(r["at"]), "name": r["name"], "org": r["org"] or "", "contact": r["contact"],
            "kind": r["kind"], "kind_ko": KIND_KO.get(r["kind"], r["kind"]), "body": r["body"],
            "read": bool(r["read_at"]), "read_at": _iso(r["read_at"]), "read_name": r["read_name"],
            "answered": bool(r["answered_at"]), "answered_at": _iso(r["answered_at"]), "answered_name": r["answered_name"],
            "test": bool(r["test"]), "ip": "이 PC" if ip in ("127.0.0.1", "::1", "") else ip}


@router.get("/inquiries")
async def list_(request: Request):
    _admin(request)
    async with db(realm="lx") as conn:
        rows = await conn.fetch(
            "SELECT q.*, a.name AS read_name, b.name AS answered_name FROM inquiries q "
            "LEFT JOIN lx_users a ON a.id = q.read_by LEFT JOIN lx_users b ON b.id = q.answered_by ORDER BY q.at DESC LIMIT 200")
        n_new = await conn.fetchval("SELECT count(*) FROM inquiries WHERE read_at IS NULL AND NOT test")
        n_all = await conn.fetchval("SELECT count(*) FROM inquiries")
    return {"items": [_row(r) for r in rows], "counts": {"new": n_new, "all": n_all}, "at": now_iso()}


@router.post("/inquiries/{iid}/mark")
async def mark(iid: str, body: dict, request: Request):
    p = _admin(request)
    sets, args = [], [iid]
    for k, col in (("read", "read"), ("answered", "answered")):
        if k in body:
            if body[k]:
                args.append(p.user_id); sets.append(f"{col}_at = coalesce({col}_at, now()), {col}_by = coalesce({col}_by, ${len(args)})")
            else:
                sets.append(f"{col}_at = NULL, {col}_by = NULL")
    if body.get("answered"):                               # 답했으면 읽은 것
        args.append(p.user_id); sets.append(f"read_at = coalesce(read_at, now()), read_by = coalesce(read_by, ${len(args)})")
    if "test" in body:
        args.append(bool(body["test"])); sets.append(f"test = ${len(args)}")
    if not sets:
        raise ApiError("bad_request", "바꿀 것이 없습니다")
    async with db(realm="lx") as conn:
        before = await conn.fetchrow("SELECT read_at, answered_at, test FROM inquiries WHERE id=$1", iid)
        if not before:
            raise ApiError("not_found", "없는 문의입니다")
        await conn.execute(f"UPDATE inquiries SET {', '.join(sets)} WHERE id=$1", *args)
        await audit(conn, p, "inquiry.mark", iid, {"read": bool(before["read_at"]), "answered": bool(before["answered_at"]), "test": before["test"]},
                    {k: bool(v) for k, v in body.items() if k in ("read", "answered", "test")})
        r = await conn.fetchrow("SELECT q.*, a.name AS read_name, b.name AS answered_name FROM inquiries q "
                                "LEFT JOIN lx_users a ON a.id = q.read_by LEFT JOIN lx_users b ON b.id = q.answered_by WHERE q.id=$1", iid)
    return _row(r)
