"""검토 요청 · 메시지 · 알림(구현 2차 · 확인 대장 6차 GF-6 · 알림-1 · 원칙 50 · 63 · 72 · 73).

기관 화면(결과 지도 · 필지 카드 · 판정 표)에서 필지를 누르고 '검토 요청' → 메모 한 줄(선택) → 보내기. 이유 고르기 · 사진 필수 없음.
요청 하나 = 짧은 대화(기관 ↔ LX). LX 답 = 한 줄 메시지 + (선택) 판정(맞음 · AI 오류 · 모름). 'AI 오류'는 재학습 표본(feedback fp)으로 이어 쓴다.
받는 사람 = 그 서비스 카드의 담당 LX 직원(cards.owner_id → 없으면 그 카드를 공개 · 적용 요청한 LX 직원) · 없으면 LX 관리자.
LX 관리자는 모든 요청 · 대화를 함께 본다. 계정 범위 밖 0(원칙 39): 기관은 자기가 보낸 요청만, 요청은 관할 필지만.

POST /reviews                       기관 → 요청 만들기 {pnu | lnglat, note?, rule?, set?, fid?, card?, deploy?, from?}
GET  /reviews/recipient             기관 → 보내기 전 '받는 사람' 한 줄 {service, recipient{kind, name}}
GET  /reviews?box=todo|done|all     목록 — 기관 = 내가 보낸 요청 · LX 직원 = 내가 담당하는 요청 · LX 관리자 = 모두
GET  /reviews/{id}                  대화 한 건(메시지 · 저절로 붙은 필지 정보)
POST /reviews/{id}/read             읽음(LX 가 처음 열면 기관 쪽 상태 '확인 중')
POST /reviews/{id}/messages         답 · 덧붙임 {body, verdict?(LX 만)}
GET  /reviews/notify                알림 칸 — 새로 온 것 수 + 최근 목록
저장: feedback(kind 'review' · 기존 행은 그대로 · state open = 답을 기다림 / closed = LX 가 답함 — 요약의 '기관 신고' 수와 같은 뜻) · review_messages · review_reads(0011_messages.sql).
"""
from __future__ import annotations

import re
import secrets

from fastapi import APIRouter, Request
from starlette.concurrency import run_in_threadpool

from . import regions as R
from .deps import ApiError, Principal, audit, db, principal, require
from .envelope import KST, env, now_iso

router = APIRouter()

PNU_RE = re.compile(r"^\d{19}$")
NOTE_MAX = 300
BODY_MAX = 500
STATUS_KO = {"sent": "보냄", "seen": "확인 중", "answered": "답변"}
VERDICT_KO = {"ok": "맞음", "ai_error": "AI 오류", "unknown": "모름"}
NO_PARCEL = "이 필지는 볼 수 없습니다"
# 결과 층 이름 → 서비스(재학습 묶음 규칙과 같은 판정 · landxi/v3/lx-deploy/retrain.js SET_CARD 와 같은 표)
SET_CARD = [(re.compile(p, re.I), c) for p, c in (
    (r"farm|greenhouse|landcover|cultiv|crop", "card-farm"), (r"change", "card-change"), (r"living|waste|burn|pile|bld|build", "card-living"),
    (r"marine|debris|shore", "card-marine"), (r"road|vehicle", "card-road"), (r"crowd", "card-crowd"), (r"forest|carbon", "card-forest"))]


# ── 도우미 ──────────────────────────────────────────────────────────────────────────
def _reader(p: Principal) -> str:
    return f"{p.realm}:{p.user_id}"


def _iso(t) -> str | None:
    return t.astimezone(KST).isoformat(timespec="seconds") if t else None


def _short_org(name: dict | None) -> str:
    """'전북특별자치도 남원시' → '남원시'(시도 이름은 떼고 기관이 부르는 이름만)."""
    ko = ((name or {}).get("ko") or (name or {}).get("en") or "").strip()
    parts = ko.split()
    return parts[-1] if len(parts) > 1 and re.search(r"[시군구도]$", parts[-1]) else ko


def _where(addr: str | None, pnu: str | None) -> str:
    """주소 → 읍면동 리 지번(시도 · 시군구를 뗀다 — 기관 화면 표와 같은 모양)."""
    a = (addr or "").split()
    return " ".join(a[2:]) if len(a) > 2 else (addr or pnu or "")


def _card_of_rule(rid: str | None) -> str | None:
    """규칙이 보는 AI 클래스 → 서비스(retrain.js cardOfRule 과 같은 판정): 농경(경작지 · 비닐하우스 · 주차장 전용) = 영농, 건물 단독 = 생활환경."""
    if not rid:
        return None
    try:
        import sys
        from pathlib import Path
        sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
        from survey import rules as RL
        from . import ledger as LG
        d = RL.definitions().get(rid) or LG.ledger_rules().get(rid) or {}
    except Exception:
        return None
    req = " ".join(d.get("requires") or [])
    if re.search(r"_(crop|gh|farm|park)(_|)", req):
        return "card-farm"
    if re.search(r"_bld(_|)", req):
        return "card-living"
    return None


def _rule_of_set(s: str | None) -> str | None:
    m = re.match(r"^(?:review:|survey/)(\w+)$", str(s or ""))
    return m.group(1) if m else None


async def _resolve_card(conn, tenant: str | None, body: dict, finding_rule: str | None) -> tuple[str | None, str | None]:
    """요청이 어느 서비스 카드로 가나 → (card_id, deploy_id). 화면이 준 카드 · 배포본 → 규칙 → 결과 층 이름 → 필지의 AI 결과 규칙."""
    cards = {r["id"] for r in await conn.fetch("SELECT id FROM cards")}
    dep = None
    if body.get("deploy"):
        d = await conn.fetchrow("SELECT id, card_id FROM deploys WHERE id=$1 AND ($2::text IS NULL OR tenant_id=$2)", str(body["deploy"]), tenant)
        if d:
            dep = d["id"]
            if d["card_id"] in cards:
                return d["card_id"], dep
    c = str(body.get("card") or "")
    if c in cards:
        return c, dep
    for rid in (body.get("rule"), _rule_of_set(body.get("set")), finding_rule):
        c = _card_of_rule(rid)
        if c:
            return c, dep
    s = str(body.get("set") or "")
    for rx, c in SET_CARD:
        if s and rx.search(s):
            return c, dep
    return None, dep


async def _owner(conn, card_id: str | None) -> dict | None:
    """서비스 카드의 담당 LX 직원 — 그 카드를 낸 프로젝트의 프로젝트장(프로젝트 쪽 한 곳 projects.project_of_card) → 카드의 담당 칸
    → 그 카드를 공개 · 다른 지역 적용 요청한 LX 직원(가장 최근) · 없으면 None(LX 관리자가 받는다)."""
    if not card_id:
        return None
    try:
        from .projects import project_of_card
    except Exception:                                   # 프로젝트 백본이 없는 배포 — 아래 길로
        project_of_card = None
    if project_of_card:
        pj = await project_of_card(conn, card_id)
        if pj and pj.get("lead_id") and await conn.fetchval(
                "SELECT 1 FROM lx_users WHERE id=$1 AND status='active' AND role IN ('staff','admin')", pj["lead_id"]):
            return {"id": pj["lead_id"], "name": pj.get("lead_name"), "via": "project"}
    r = await conn.fetchrow("SELECT u.id, u.name FROM cards c JOIN lx_users u ON u.id = c.owner_id "
                            "WHERE c.id=$1 AND u.status='active' AND u.role='staff'", card_id)
    if r:
        return {"id": r["id"], "name": r["name"], "via": "card"}
    r = await conn.fetchrow(
        "SELECT u.id, u.name FROM approvals a JOIN lx_users u ON u.id = a.requested_by "
        "WHERE u.status='active' AND u.role='staff' AND ((a.subject_type='card' AND a.subject_id=$1) "
        "OR (a.subject_type='deploy' AND a.subject_id IN (SELECT id FROM deploys WHERE card_id=$1))) "
        "ORDER BY a.at DESC LIMIT 1", card_id)
    return {"id": r["id"], "name": r["name"], "via": "request"} if r else None


async def _card_name(conn, card_id: str | None) -> str | None:
    if not card_id:
        return None
    n = await conn.fetchval("SELECT name FROM cards WHERE id=$1", card_id)
    return (n or {}).get("ko") or (n or {}).get("en") if n else None


async def _parcel_ctx(conn, tenant: str, pnu: str | None, fid: str | None) -> dict:
    """요청 때 저절로 붙는 필지 정보 — 주소 · 지목 · 면적 · AI 결과(규칙 · 면적 · 영상 시점). 좌표 · 코드는 화면에 내지 않는다."""
    out: dict = {}
    if not pnu:
        return out
    p = await conn.fetchrow("SELECT addr, emd, ri, jibun, jimok, jimok_nm, area_m2, sgg_cd, "
                            "ST_X(ST_PointOnSurface(geom)) AS x, ST_Y(ST_PointOnSurface(geom)) AS y FROM survey_parcels WHERE pnu=$1", pnu)
    if p:
        out.update({"addr": p["addr"], "where": _where(p["addr"], pnu), "emd": p["emd"], "jimok": p["jimok_nm"] or p["jimok"],
                    "area_m2": round(float(p["area_m2"]), 1) if p["area_m2"] is not None else None, "sgg_cd": p["sgg_cd"],
                    "_ll": [float(p["x"]), float(p["y"])] if p["x"] is not None else None})
    f = await conn.fetchrow("SELECT id, rule, rule_nm, evid_m2, img_date, state, addr, lon, lat FROM survey_findings WHERE pnu=$1 "
                            "ORDER BY (id = $2) DESC, (tenant_id = $3) DESC, score DESC NULLS LAST LIMIT 1", pnu, fid or "", tenant)
    if f:
        out["finding"] = {"id": f["id"], "rule": f["rule"], "rule_nm": f["rule_nm"],
                          "evid_m2": round(float(f["evid_m2"]), 1) if f["evid_m2"] is not None else None,
                          "img_date": f["img_date"], "state": f["state"]}
        out.setdefault("addr", f["addr"])
        out.setdefault("where", _where(f["addr"], pnu))
        if not out.get("_ll") and f["lon"] is not None:
            out["_ll"] = [float(f["lon"]), float(f["lat"])]
    return out


def _visible_sql(p: Principal, n0: int) -> tuple[str, list]:
    """계정이 볼 수 있는 요청 — 기관 = 내가 보낸 것 · LX 직원 = 내가 담당하는 것 · LX 관리자 = 모두."""
    if p.realm == "tenant":
        return f"f.kind='review' AND f.tenant_id=${n0} AND f.sender_id=${n0 + 1}", [p.tenant_id, p.user_id]
    if p.is_admin:
        return "f.kind='review'", []
    return f"f.kind='review' AND f.recipient_id=${n0}", [p.user_id]


def _can_read(p: Principal, r) -> bool:
    if p.realm == "tenant":
        return r["tenant_id"] == p.tenant_id and r["sender_id"] == p.user_id
    if p.is_admin:
        return True
    return p.realm == "lx" and p.role == "staff" and r["recipient_id"] == p.user_id


def _gate(p: Principal) -> Principal:
    require(p)
    if p.realm == "lx" and p.role not in ("admin", "staff"):
        raise ApiError("forbidden", "검토 요청은 LX 직원 · LX 관리자 · 기관 계정이 봅니다")
    if p.realm == "tenant" and p.tenant_id == "lx-demo":
        raise ApiError("forbidden", "이 계정에는 검토 요청이 없습니다")
    return p


async def _names(conn, tenant_users: set, lx_users: set, tenants: set) -> tuple[dict, dict, dict]:
    tu = {r["id"]: r["name"] for r in await conn.fetch("SELECT id, name FROM tenant_users WHERE id = ANY($1::text[])", list(tenant_users))} if tenant_users else {}
    lu = {r["id"]: (r["name"], r["role"]) for r in await conn.fetch("SELECT id, name, role FROM lx_users WHERE id = ANY($1::text[])", list(lx_users))} if lx_users else {}
    tn = {r["id"]: _short_org(r["name"]) for r in await conn.fetch("SELECT id, name FROM tenants WHERE id = ANY($1::text[])", list(tenants))} if tenants else {}
    return tu, lu, tn


def _lx_label(uid: str | None, lu: dict) -> str:
    """LX 쪽 사람 표기 — 관리자 = 'LX 관리자' · 직원 = 'LX 담당 {이름}'(이름은 계정 그대로 · 지어내지 않는다)."""
    if not uid or uid not in lu:
        return "LX 관리자"
    name, role = lu[uid]
    if role == "admin":
        return "LX 관리자" if not name or name == "LX 관리자" else f"LX 관리자 {name}"
    return f"LX 담당 {name}" if name else "LX 담당 직원"


def _item(r, p: Principal, tu: dict, lu: dict, tn: dict) -> dict:
    ctx = r["ctx"] or {}
    last_side = r["last_realm"]
    return {
        "id": r["id"], "status": r["status"] or "sent", "status_ko": STATUS_KO.get(r["status"] or "sent"),
        "verdict": r["verdict"], "verdict_ko": VERDICT_KO.get(r["verdict"]) if r["verdict"] else None,
        "where": ctx.get("where") or r["pnu"] or "", "service": ctx.get("service"),
        "org": tn.get(r["tenant_id"], ""), "sender": tu.get(r["sender_id"], "") if p.realm == "lx" else "나",
        "recipient": _lx_label(r["recipient_id"], lu) if r["recipient_id"] else "LX 관리자",
        "recipient_kind": "staff" if r["recipient_id"] else "admin",
        "note": r["first_body"] or "",
        "last": {"body": r["last_body"] or "", "side": last_side, "verdict_ko": VERDICT_KO.get(r["last_verdict"]) if r["last_verdict"] else None,
                 "at": _iso(r["last_at"])} if r["last_at"] else None,
        "unread": bool(r["unread"]), "at": _iso(r["at"]), "updated_at": _iso(r["updated_at"] or r["at"]),
    }


LIST_SQL = """
SELECT f.id, f.tenant_id, f.sender_id, f.recipient_id, f.pnu, f.status, f.verdict, f.ctx, f.at, f.updated_at,
       fm.body AS first_body, lm.body AS last_body, lm.author_realm AS last_realm, lm.verdict AS last_verdict, lm.at AS last_at,
       EXISTS (SELECT 1 FROM review_messages m WHERE m.request_id = f.id AND m.author_realm <> $1
               AND m.at > coalesce((SELECT rr.read_at FROM review_reads rr WHERE rr.request_id = f.id AND rr.reader = $2), '-infinity'::timestamptz)) AS unread
  FROM feedback f
  LEFT JOIN LATERAL (SELECT body FROM review_messages m WHERE m.request_id = f.id ORDER BY at ASC LIMIT 1) fm ON true
  LEFT JOIN LATERAL (SELECT body, author_realm, verdict, at FROM review_messages m WHERE m.request_id = f.id ORDER BY at DESC LIMIT 1) lm ON true
 WHERE {where}
 ORDER BY coalesce(f.updated_at, f.at) DESC
 LIMIT {limit}"""


async def _list(conn, p: Principal, *, box: str = "all", limit: int = 100, unread_only: bool = False) -> list[dict]:
    w, args = _visible_sql(p, 3)
    if box == "todo":
        w += " AND coalesce(f.status,'sent') <> 'answered'"
    elif box == "done":
        w += " AND f.status = 'answered'"
    rows = await conn.fetch(LIST_SQL.format(where=w, limit=int(limit)), p.realm, _reader(p), *args)
    if unread_only:
        rows = [r for r in rows if r["unread"]]
    tu, lu, tn = await _names(conn, {r["sender_id"] for r in rows if r["sender_id"]}, {r["recipient_id"] for r in rows if r["recipient_id"]},
                              {r["tenant_id"] for r in rows})
    return [_item(r, p, tu, lu, tn) for r in rows]


async def _counts(conn, p: Principal) -> dict:
    w, args = _visible_sql(p, 3)
    r = await conn.fetchrow(
        "SELECT count(*) FILTER (WHERE coalesce(f.status,'sent') <> 'answered') AS todo, count(*) FILTER (WHERE f.status='answered') AS done, "
        "count(*) FILTER (WHERE EXISTS (SELECT 1 FROM review_messages m WHERE m.request_id = f.id AND m.author_realm <> $1 "
        "AND m.at > coalesce((SELECT rr.read_at FROM review_reads rr WHERE rr.request_id = f.id AND rr.reader = $2), '-infinity'::timestamptz))) AS unread "
        f"FROM feedback f WHERE {w}", p.realm, _reader(p), *args)
    return {"todo": int(r["todo"] or 0), "done": int(r["done"] or 0), "unread": int(r["unread"] or 0)}


# ── 보내기 전: 받는 사람 한 줄 ───────────────────────────────────────────────────────
async def _check_scope(p: Principal, pnu: str | None, ll) -> tuple[str | None, list | None]:
    """관할 필지만 — 관할 밖은 '없는 필지'와 같은 답(있다는 사실도 알리지 않는다 · 원칙 39)."""
    if pnu is not None:
        pnu = str(pnu).strip()
        if not PNU_RE.match(pnu):
            raise ApiError("bad_request", "필지 번호 형식이 맞지 않습니다")
        if not R.region_allowed(p, pnu[:5]):
            raise ApiError("not_found", NO_PARCEL)
    if ll is not None:
        try:
            lng, lat = float(ll[0]), float(ll[1])
        except Exception:
            raise ApiError("bad_request", "위치 형식이 맞지 않습니다") from None
        if not (-180 <= lng <= 180 and -90 <= lat <= 90):
            raise ApiError("bad_request", "위치 형식이 맞지 않습니다")
        if R.scope_of(p) is not None and not await run_in_threadpool(R.point_in_scope, p, lng, lat):
            raise ApiError("not_found", NO_PARCEL)
        ll = [lng, lat]
    if not pnu and not ll:
        raise ApiError("bad_request", "필지를 골라 주세요")
    return pnu, ll


@router.get("/reviews/recipient")
async def recipient(request: Request, pnu: str | None = None, card: str | None = None, rule: str | None = None, set: str | None = None,
                    deploy: str | None = None, fid: str | None = None):
    p = _gate(principal(request))
    if p.realm != "tenant":
        raise ApiError("forbidden", "검토 요청은 기관 계정에서 보냅니다")
    if pnu:
        await _check_scope(p, pnu, None)
    async with db(realm="lx") as conn:
        frule = None
        if pnu:
            frule = await conn.fetchval("SELECT rule FROM survey_findings WHERE pnu=$1 ORDER BY (id=$2) DESC, (tenant_id=$3) DESC, score DESC NULLS LAST LIMIT 1",
                                        pnu, fid or "", p.tenant_id)
        cid, _ = await _resolve_card(conn, p.tenant_id, {"card": card, "rule": rule, "set": set, "deploy": deploy}, frule)
        o = await _owner(conn, cid)
        svc = await _card_name(conn, cid)
    return {"service": svc, "recipient": {"kind": "staff", "name": o["name"], "via": o.get("via")} if o else {"kind": "admin", "name": None},
            "at": now_iso()}


# ── 요청 만들기 ───────────────────────────────────────────────────────────────────
@router.post("/reviews", status_code=201)
async def create(body: dict, request: Request):
    p = _gate(principal(request))
    if p.realm != "tenant":
        raise ApiError("forbidden", "검토 요청은 기관 계정에서 보냅니다")
    pnu, ll = await _check_scope(p, body.get("pnu"), body.get("lnglat"))
    note = re.sub(r"\s+", " ", str(body.get("note") or "")).strip()[:NOTE_MAX]
    fid = str(body.get("fid") or "")[:120] or None
    async with db(realm="lx") as conn:                       # 관할 확인이 끝난 필지만 — 시스템 조회(필지 · AI 결과 · 카드 · 담당)
        if not pnu and ll:
            pnu = await conn.fetchval("SELECT pnu FROM survey_parcels WHERE geom && ST_SetSRID(ST_MakePoint($1,$2),4326) "
                                      "AND ST_Contains(geom, ST_SetSRID(ST_MakePoint($1,$2),4326)) LIMIT 1", ll[0], ll[1])
            if pnu and not R.region_allowed(p, pnu[:5]):
                pnu = None
        ctx = await _parcel_ctx(conn, p.tenant_id, pnu, fid)
        frule = (ctx.get("finding") or {}).get("rule")
        cid, dep = await _resolve_card(conn, p.tenant_id, body, frule)
        if not dep and cid:
            dep = await conn.fetchval("SELECT id FROM deploys WHERE tenant_id=$1 AND card_id=$2 ORDER BY (stage='ga') DESC, updated_at DESC NULLS LAST LIMIT 1",
                                      p.tenant_id, cid)
        owner = await _owner(conn, cid)
        ctx["service"] = await _card_name(conn, cid)
        ctx["from"] = str(body.get("from") or "")[:24] or None
        if not ll:
            ll = ctx.get("_ll")
    ctx.pop("_ll", None)
    set_id = str(body.get("set") or "")[:120] or (f"survey/{frule}" if frule else None)
    async with db(p) as conn:
        # 같은 사람이 같은 필지로 보낸 요청이 아직 답을 받지 않았으면 그 대화에 이어 붙인다(같은 일을 두 번 쓰게 하지 않는다)
        prev = await conn.fetchrow("SELECT id, recipient_id FROM feedback WHERE kind='review' AND tenant_id=$1 AND sender_id=$2 AND pnu IS NOT DISTINCT FROM $3 "
                                   "AND coalesce(status,'sent') <> 'answered' ORDER BY at DESC LIMIT 1", p.tenant_id, p.user_id, pnu) if pnu else None
        if prev:
            rid = prev["id"]
            await conn.execute("INSERT INTO review_messages(id, request_id, tenant_id, author_id, author_realm, author_role, body) VALUES ($1,$2,$3,$4,'tenant',$5,$6)",
                               "rm_" + secrets.token_hex(8), rid, p.tenant_id, p.user_id, p.role, note)
            await conn.execute("UPDATE feedback SET status='sent', state='open', updated_at=now() WHERE id=$1", rid)
            merged, rcpt = True, prev["recipient_id"]
        else:
            rid = "fb_" + secrets.token_hex(8)
            await conn.execute(
                "INSERT INTO feedback(id, tenant_id, job_id, set_id, fid, pnu, lnglat, kind, note, state, sender_id, card_id, deploy_id, recipient_id, status, ctx, updated_at) VALUES "
                "($1,$2,$3,$4,$5,$6, CASE WHEN $7::float8[] IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint(($7::float8[])[1], ($7::float8[])[2]),4326) END, "
                "'review',$8,'open',$9,$10,$11,$12,'sent',$13, now())",
                rid, p.tenant_id, body.get("job_id"), set_id, fid, pnu, ll, note, p.user_id, cid, dep, owner["id"] if owner else None, ctx)
            await conn.execute("INSERT INTO review_messages(id, request_id, tenant_id, author_id, author_realm, author_role, body) VALUES ($1,$2,$3,$4,'tenant',$5,$6)",
                               "rm_" + secrets.token_hex(8), rid, p.tenant_id, p.user_id, p.role, note)
            merged, rcpt = False, owner["id"] if owner else None
        await conn.execute("INSERT INTO review_reads(request_id, reader, tenant_id, read_at) VALUES ($1,$2,$3,now()) "
                           "ON CONFLICT (request_id, reader) DO UPDATE SET read_at=now()", rid, _reader(p), p.tenant_id)
        rname = await conn.fetchval("SELECT name FROM lx_users WHERE id=$1", rcpt) if rcpt else None
        await audit(conn, p, "review.create" if not merged else "review.append", rid, None, {"card": cid, "to": rcpt or "admin", "merged": merged})
    return {"id": rid, "status": "sent", "status_ko": STATUS_KO["sent"], "merged": merged, "service": ctx.get("service"),
            "recipient": {"kind": "staff", "name": rname, "via": (owner or {}).get("via") if owner and owner["id"] == rcpt else None} if rcpt else {"kind": "admin", "name": None},
            "where": ctx.get("where"), "at": now_iso()}


# ── 목록 · 한 건 · 읽음 · 답 ───────────────────────────────────────────────────────
@router.get("/reviews")
async def list_(request: Request, box: str = "all", limit: int = 100):
    p = _gate(principal(request))
    if box not in ("todo", "done", "all"):
        raise ApiError("bad_request", "box 는 todo | done | all")
    async with db(p) as conn:
        items = await _list(conn, p, box=box, limit=max(1, min(int(limit), 300)))
        counts = await _counts(conn, p)
    return {"items": items, "counts": counts, "scope": "sent" if p.realm == "tenant" else "all" if p.is_admin else "mine", "as_of": now_iso()}


async def _one(conn, p: Principal, rid: str):
    r = await conn.fetchrow("SELECT id, tenant_id, sender_id, recipient_id, card_id, deploy_id, pnu, fid, set_id, status, verdict, ctx, at, updated_at "
                            "FROM feedback WHERE id=$1 AND kind='review'", rid)
    if not r or not _can_read(p, r):
        raise ApiError("not_found", "요청이 없습니다")
    return r


@router.get("/reviews/notify")
async def notify(request: Request):
    """알림 칸 — 새로 온 것(상대가 보낸 말 가운데 아직 안 본 것이 있는 대화) 수 + 최근 대화 6개."""
    p = principal(request)
    require(p)
    if (p.realm == "lx" and p.role not in ("admin", "staff")) or (p.realm == "tenant" and p.tenant_id == "lx-demo"):
        return {"n": 0, "items": [], "as_of": now_iso()}
    async with db(p) as conn:
        items = await _list(conn, p, box="all", limit=6)
        c = await _counts(conn, p)
    return {"n": c["unread"], "items": items, "counts": c, "as_of": now_iso()}


@router.get("/reviews/{rid}")
async def one(rid: str, request: Request):
    p = _gate(principal(request))
    async with db(p) as conn:
        r = await _one(conn, p, rid)
        msgs = await conn.fetch("SELECT id, author_id, author_realm, author_role, body, verdict, at FROM review_messages WHERE request_id=$1 ORDER BY at", rid)
        read = await conn.fetchval("SELECT read_at FROM review_reads WHERE request_id=$1 AND reader=$2", rid, _reader(p))
        tu, lu, tn = await _names(conn, {r["sender_id"]} | {m["author_id"] for m in msgs if m["author_realm"] == "tenant"},
                                  ({r["recipient_id"]} if r["recipient_id"] else set()) | {m["author_id"] for m in msgs if m["author_realm"] == "lx"},
                                  {r["tenant_id"]})
    org = tn.get(r["tenant_id"], "")
    out_msgs = []
    for m in msgs:
        mine = m["author_realm"] == p.realm and m["author_id"] == p.user_id
        if m["author_realm"] == "tenant":
            who = "나" if mine else f"{org} {tu.get(m['author_id'], '')}".strip()
        else:
            who = _lx_label(m["author_id"], lu) + (" (나)" if mine else "")
        out_msgs.append({"id": m["id"], "side": m["author_realm"], "mine": mine, "who": who, "body": m["body"] or "",
                         "verdict": m["verdict"], "verdict_ko": VERDICT_KO.get(m["verdict"]) if m["verdict"] else None,
                         "at": _iso(m["at"]), "new": m["author_realm"] != p.realm and (read is None or m["at"] > read)})
    ctx = dict(r["ctx"] or {})
    can_answer = p.realm == "lx" and (p.is_admin or r["recipient_id"] == p.user_id)
    return {"id": r["id"], "status": r["status"] or "sent", "status_ko": STATUS_KO.get(r["status"] or "sent"),
            "verdict": r["verdict"], "verdict_ko": VERDICT_KO.get(r["verdict"]) if r["verdict"] else None,
            "org": org, "sender": tu.get(r["sender_id"], "") if p.realm == "lx" else "나",
            "recipient": _lx_label(r["recipient_id"], lu) if r["recipient_id"] else "LX 관리자",
            "recipient_kind": "staff" if r["recipient_id"] else "admin",
            "where": ctx.get("where") or r["pnu"] or "", "service": ctx.get("service"),
            "parcel": _parcel_out(ctx), "ai": _ai_out(ctx.get("finding")), "pnu": r["pnu"], "messages": out_msgs, "can_answer": can_answer,
            "at": _iso(r["at"]), "updated_at": _iso(r["updated_at"] or r["at"])}


def _parcel_out(ctx: dict) -> dict:
    a = ctx.get("area_m2")
    return {"addr": ctx.get("addr"), "emd": ctx.get("emd"), "jimok": ctx.get("jimok"),
            "area_m2": env(a, "m2", "measured", "연속지적 도형 면적") if a is not None else None}


def _ai_out(f: dict | None) -> dict | None:
    if not f:
        return None
    e = f.get("evid_m2")
    return {"rule_nm": f.get("rule_nm"), "img_date": f.get("img_date"), "state": f.get("state"),
            "evid_m2": env(e, "m2", "inferred", "AI 분석 면적(필지 안)") if e is not None else None}


@router.post("/reviews/{rid}/read")
async def mark_read(rid: str, request: Request):
    p = _gate(principal(request))
    async with db(p) as conn:
        r = await _one(conn, p, rid)
        await conn.execute("INSERT INTO review_reads(request_id, reader, tenant_id, read_at) VALUES ($1,$2,$3,now()) "
                           "ON CONFLICT (request_id, reader) DO UPDATE SET read_at=now()", rid, _reader(p), r["tenant_id"])
        st = r["status"] or "sent"
        if p.realm == "lx" and st == "sent":              # LX 가 처음 열었다 → 기관 쪽 상태 '확인 중'
            await conn.execute("UPDATE feedback SET status='seen' WHERE id=$1 AND coalesce(status,'sent')='sent'", rid)
            st = "seen"
    return {"id": rid, "status": st, "status_ko": STATUS_KO.get(st), "at": now_iso()}


@router.post("/reviews/{rid}/messages", status_code=201)
async def post_message(rid: str, body: dict, request: Request):
    p = _gate(principal(request))
    text = re.sub(r"[ \t]+", " ", str(body.get("body") or "")).strip()[:BODY_MAX]
    verdict = body.get("verdict") or None
    if verdict is not None and verdict not in VERDICT_KO:
        raise ApiError("bad_request", "판정은 맞음 · AI 오류 · 모름 가운데 하나")
    if p.realm == "tenant" and verdict:
        raise ApiError("bad_request", "판정은 LX 가 남깁니다")
    if not text and not verdict:
        raise ApiError("bad_request", "보낼 말을 적어 주세요")
    async with db(p) as conn:
        r = await _one(conn, p, rid)
        if p.realm == "lx" and not (p.is_admin or r["recipient_id"] == p.user_id):
            raise ApiError("forbidden", "이 요청의 담당이 아닙니다")
        mid = "rm_" + secrets.token_hex(8)
        await conn.execute("INSERT INTO review_messages(id, request_id, tenant_id, author_id, author_realm, author_role, body, verdict) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
                           mid, rid, r["tenant_id"], p.user_id, p.realm, p.role, text, verdict)
        if p.realm == "lx":
            await conn.execute("UPDATE feedback SET status='answered', state='closed', verdict=coalesce($2, verdict), updated_at=now() WHERE id=$1", rid, verdict)
            st = "answered"
            ctx = dict(r["ctx"] or {})
            if verdict == "ai_error" and not ctx.get("fp_id"):
                # 'AI 오류' = 재학습 표본 — 지금까지 오탐 신고가 쌓이던 feedback(kind 'fp')에 이어 쓴다(재학습 신호 · 정밀도 보드가 그대로 읽는다)
                fp = "fb_" + secrets.token_hex(8)
                await conn.execute("INSERT INTO feedback(id, tenant_id, job_id, set_id, fid, pnu, lnglat, kind, note, state) "
                                   "SELECT $1, tenant_id, job_id, set_id, fid, pnu, lnglat, 'fp', $3, 'open' FROM feedback WHERE id=$2",
                                   fp, rid, "검토 요청 · AI 오류")
                ctx["fp_id"] = fp
                await conn.execute("UPDATE feedback SET ctx=$2 WHERE id=$1", rid, ctx)
        else:
            await conn.execute("UPDATE feedback SET status='sent', state='open', updated_at=now() WHERE id=$1", rid)
            st = "sent"
        await conn.execute("INSERT INTO review_reads(request_id, reader, tenant_id, read_at) VALUES ($1,$2,$3,now()) "
                           "ON CONFLICT (request_id, reader) DO UPDATE SET read_at=now()", rid, _reader(p), r["tenant_id"])
        await audit(conn, p, "review.message", rid, None, {"verdict": verdict, "side": p.realm})
    return {"id": mid, "request_id": rid, "status": st, "status_ko": STATUS_KO.get(st), "verdict": verdict, "at": now_iso()}
