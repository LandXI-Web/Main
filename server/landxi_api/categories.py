"""분야(카테고리) 관리(now 질문 5 '이대로 구현' 10-11 · 원칙 165) — 코드 상수(cards.py GROUPS)였던 분야를 관리 표(0030_card_groups)로.

  GET   /api/v1/categories                    분야 목록(순서대로) · 분야마다 쓰는 서비스 · 수 — LX 직원 · 관리자(배포 신청서 · 분석하기 · 배포 '분야' 탭)
                                              관리자에게는 + 직원이 요청한 새 분야(열림) · 바뀐 기록(최근 20)
  POST  /api/v1/categories                    {name, descr?, request_id?} 새 분야 만들기(LX 관리자) — request_id = 직원 요청으로 만들 때(그 요청의 서비스도 이 분야에 넣는다)
  PATCH /api/v1/categories/{gid}              {name?, descr?} 이름 바꾸기 · 설명 고치기(LX 관리자) — 서비스에 붙은 분야는 id 로 이어져 그대로 따라간다
  PUT   /api/v1/categories/order              {ids:[...]} 순서(LX 관리자) — 분석하기 거르기 칩 · 서비스 카드 · 기관 공유가 이 순서를 따른다
  POST  /api/v1/categories/requests/{rid}/close  직원 요청 닫기(LX 관리자 · 만들지 않음)

서비스 × 분야(여러 개) = card_group_of. 배포 신청서에서 고른 분야는 승인될 때 반영된다(on_card_approved · approvals.decide).
라우터는 release.py 가 붙인다(main.py 를 건드리지 않는다).
"""
from __future__ import annotations

import re
import secrets

from fastapi import APIRouter, Request

from .deps import ApiError, audit, db, principal, require
from .envelope import KST, now_iso

router = APIRouter()
NAME_MAX, DESCR_MAX = 20, 40
IMAGERY_KINDS = ("드론", "항공", "위성")          # 쓸 수 있는 영상(분석하기 영상별 거르기)
GID_RE = re.compile(r"^grp-[a-z0-9-]{2,40}$")


def _iso(v):
    return v.astimezone(KST).isoformat(timespec="seconds") if v else None


def _ko(v) -> str:
    if isinstance(v, dict):
        return str(v.get("ko") or v.get("en") or "")
    return str(v or "")


# ── 읽기(다른 모듈이 쓴다) ──────────────────────────────────────────────────
async def load(conn) -> dict:
    """{'list': [{id, name, descr, ord}] 순서대로, 'of': {card_id: [group_id …] 분야 순서대로}}. 표가 없으면(마이그레이션 전) 빈 값."""
    try:
        gs = [dict(r) for r in await conn.fetch("SELECT id, name, descr, ord FROM card_groups ORDER BY ord, name")]
        rows = await conn.fetch("SELECT card_id, group_id FROM card_group_of")
    except Exception:  # noqa: BLE001 — 0030 전
        return {"list": [], "of": {}, "ready": False}
    order = {g["id"]: i for i, g in enumerate(gs)}
    of: dict[str, list[str]] = {}
    for r in rows:
        if r["group_id"] in order:
            of.setdefault(r["card_id"], []).append(r["group_id"])
    for k in of:
        of[k].sort(key=lambda x: order[x])
    return {"list": gs, "of": of, "ready": True}


def names_of(cats: dict, cid: str) -> list[str]:
    by = {g["id"]: g["name"] for g in cats.get("list") or []}
    return [by[x] for x in (cats.get("of") or {}).get(cid, []) if x in by]


def kinds_from(text: str | None) -> list[str]:
    """영상 조건 글(예: '드론·항공 50cm 이하')에서 쓸 수 있는 영상 종류 — 글에 적힌 것만."""
    t = str(text or "")
    return [k for k in IMAGERY_KINDS if k in t]


async def set_card_groups(conn, cid: str, gids: list[str], by: str | None) -> list[str]:
    """서비스의 분야를 gids 로 바꾼다(빈 목록 = 분야 없음). card_info.grp(옛 칸)에는 첫 분야 이름을 같이 적는다. 바뀐 이름 목록을 돌려준다."""
    gs = {r["id"]: r for r in await conn.fetch("SELECT id, name, ord FROM card_groups")}
    want = []
    for g in gids:
        if g not in gs:
            raise ApiError("bad_request", "없는 분야입니다", {"group": g})
        if g not in want:
            want.append(g)
    want.sort(key=lambda g: (gs[g]["ord"], gs[g]["name"]))
    before = [r["group_id"] for r in await conn.fetch("SELECT group_id FROM card_group_of WHERE card_id=$1", cid)]
    if set(before) == set(want):
        return [gs[g]["name"] for g in want]
    await conn.execute("DELETE FROM card_group_of WHERE card_id=$1", cid)
    for g in want:
        await conn.execute("INSERT INTO card_group_of(card_id, group_id, by) VALUES ($1,$2,$3)", cid, g, by)
    await conn.execute("INSERT INTO card_info(card_id, updated_by) VALUES ($1,$2) ON CONFLICT (card_id) DO NOTHING", cid, by)
    await conn.execute("UPDATE card_info SET grp=$2 WHERE card_id=$1", cid, gs[want[0]]["name"] if want else None)
    await conn.execute("INSERT INTO card_group_log(group_id, action, before, after, by) VALUES (NULL,'card.groups',$1,$2,$3)",
                       {"card_id": cid, "groups": before}, {"card_id": cid, "groups": want}, by)
    return [gs[g]["name"] for g in want]


async def on_card_approved(conn, cv_id: str, pl: dict, by: str | None) -> dict | None:
    """배포 신청이 승인되면 신청서에서 고른 분야 · 서비스 설명 · 쓸 수 있는 영상을 서비스에 반영한다(approvals.decide 가 같은 트랜잭션에서 부른다)."""
    f = (pl or {}).get("form") or {}
    cat = f.get("category") or {}
    if not cat:
        return None
    cid = str(cv_id).split("@")[0]
    out = {}
    if isinstance(cat.get("groups"), list) and cat["groups"]:
        ok = {r["id"] for r in await conn.fetch("SELECT id FROM card_groups")}
        gids = [g for g in cat["groups"] if g in ok]            # 신청 뒤 지워진 분야는 건너뛴다
        if gids:
            out["groups"] = await set_card_groups(conn, cid, gids, by)
    await conn.execute("INSERT INTO card_info(card_id, updated_by) VALUES ($1,$2) ON CONFLICT (card_id) DO NOTHING", cid, by)
    if cat.get("desc"):
        await conn.execute("UPDATE card_info SET line=$2, updated_at=now(), updated_by=$3 WHERE card_id=$1", cid, str(cat["desc"])[:60], by)
        out["desc"] = True
    if isinstance(cat.get("imagery_kinds"), list):
        kinds = [k for k in IMAGERY_KINDS if k in cat["imagery_kinds"]]
        await conn.execute("UPDATE card_info SET imagery_kinds=$2, updated_at=now(), updated_by=$3 WHERE card_id=$1", cid, kinds or None, by)
        out["imagery_kinds"] = kinds
    await conn.execute("UPDATE card_group_requests SET card_id=$2 WHERE project_id=$1 AND card_id IS NULL", str(pl.get("project_id") or ""), cid)
    return out


def clean_form(body: dict, ok_ids: set[str]) -> dict:
    """배포 신청서의 분야 칸 → 신청서에 담을 값(검사). groups = 분야 id 목록 · desc = 서비스 설명 한 문장 · imagery_kinds · new_group(요청할 새 분야 이름)."""
    gids = body.get("groups")
    out: dict = {}
    if gids is not None:
        if not isinstance(gids, list) or any(str(g) not in ok_ids for g in gids):
            raise ApiError("bad_request", "분야는 목록에 있는 것 중에서 고릅니다")
        out["groups"] = list(dict.fromkeys(str(g) for g in gids))
    if body.get("desc") is not None:
        d = re.sub(r"\s+", " ", str(body.get("desc") or "")).strip()
        if len(d) > 60:
            raise ApiError("bad_request", "서비스 설명은 60자 안으로 적어 주세요")
        if d:
            out["desc"] = d
    if body.get("imagery_kinds") is not None:
        ks = body.get("imagery_kinds")
        if not isinstance(ks, list) or any(k not in IMAGERY_KINDS for k in ks):
            raise ApiError("bad_request", "쓸 수 있는 영상은 드론 · 항공 · 위성 중에서 고릅니다")
        out["imagery_kinds"] = [k for k in IMAGERY_KINDS if k in ks]
    ng = re.sub(r"\s+", " ", str(body.get("new_group") or "")).strip()
    if ng:
        if len(ng) > NAME_MAX:
            raise ApiError("bad_request", f"새 분야 이름은 {NAME_MAX}자 안으로 적어 주세요")
        out["new_group"] = ng
    return out


# ── 라우트 ───────────────────────────────────────────────────────────────
def _clean_name(v) -> str:
    n = re.sub(r"\s+", " ", str(v or "")).strip()
    if not n:
        raise ApiError("bad_request", "분야 이름을 적어 주세요")
    if len(n) > NAME_MAX:
        raise ApiError("bad_request", f"분야 이름은 {NAME_MAX}자 안으로 적어 주세요")
    return n


@router.get("/categories")
async def list_(request: Request):
    p = require(principal(request), lx=True)
    async with db(realm="lx") as conn:
        cats = await load(conn)
        from .cards import _name                       # 화면 용어표(판독 → AI 분석 등)를 거친 서비스 이름 — 분석하기 카드와 같은 이름
        cards = {r["id"]: _name(r["name"]) for r in await conn.fetch("SELECT id, name FROM cards")}
        people = {r["id"]: r["name"] for r in await conn.fetch("SELECT id, name FROM lx_users")}
        reqs = log = []
        if p.is_admin:
            reqs = await conn.fetch("SELECT r.*, pj.name AS pname FROM card_group_requests r LEFT JOIN projects pj ON pj.id = r.project_id "
                                    "WHERE r.state='open' ORDER BY r.at DESC LIMIT 30")
            log = await conn.fetch("SELECT * FROM card_group_log WHERE action <> 'card.groups' ORDER BY at DESC, id DESC LIMIT 20")
    items = []
    for g in cats["list"]:
        svc = sorted({cards[c] for c, gs in cats["of"].items() if g["id"] in gs and c in cards})
        items.append({"id": g["id"], "name": g["name"], "descr": g["descr"], "services": svc, "n": len(svc)})
    out = {"items": items, "kinds": list(IMAGERY_KINDS), "as_of": now_iso()}
    if p.is_admin:
        out["requests"] = [{"id": r["id"], "name": r["name"], "project": r["pname"], "service": cards.get(r["card_id"]) if r["card_id"] else None,
                            "by": people.get(r["by"]) or None, "at": _iso(r["at"])} for r in reqs]
        out["log"] = [{"at": _iso(r["at"]), "by": people.get(r["by"]) or None, "text": _log_text(r)} for r in log]
    return out


def _log_text(r) -> str:
    a, b, x = r["action"], r["before"] or {}, r["after"] or {}
    if a == "create":
        return f"'{x.get('name')}' 분야를 만들었습니다"
    if a == "rename":
        return f"'{b.get('name')}' 이름을 '{x.get('name')}'(으)로 바꿨습니다"
    if a == "descr":
        return f"'{x.get('name')}' 설명을 고쳤습니다"
    if a == "order":
        return "분야 순서를 바꿨습니다"
    if a == "request.closed":
        return f"직원이 요청한 '{x.get('name')}'을(를) 닫았습니다"
    return a


@router.post("/categories", status_code=201)
async def create(body: dict, request: Request):
    p = require(principal(request), admin=True)
    name = _clean_name(body.get("name"))
    descr = (str(body.get("descr") or "").strip()[:DESCR_MAX]) or None
    rid = body.get("request_id")
    async with db(realm="lx") as conn:
        if await conn.fetchval("SELECT 1 FROM card_groups WHERE lower(name)=lower($1)", name):
            raise ApiError("conflict", "같은 이름의 분야가 있습니다", None, 409)
        gid = "grp-" + secrets.token_hex(4)
        ordv = int(await conn.fetchval("SELECT coalesce(max(ord), 0) + 10 FROM card_groups"))
        await conn.execute("INSERT INTO card_groups(id, name, descr, ord, by) VALUES ($1,$2,$3,$4,$5)", gid, name, descr, ordv, p.user_id)
        await conn.execute("INSERT INTO card_group_log(group_id, action, after, by) VALUES ($1,'create',$2,$3)", gid, {"name": name, "descr": descr}, p.user_id)
        if rid is not None:
            r = await conn.fetchrow("SELECT * FROM card_group_requests WHERE id=$1 AND state='open'", int(rid))
            if r:
                await conn.execute("UPDATE card_group_requests SET state='made', group_id=$2, decided_by=$3, decided_at=now() WHERE id=$1", r["id"], gid, p.user_id)
                if r["card_id"]:                          # 요청한 서비스가 이미 있으면(승인된 판) 이 분야에 넣는다
                    cur = [x["group_id"] for x in await conn.fetch("SELECT group_id FROM card_group_of WHERE card_id=$1", r["card_id"])]
                    await set_card_groups(conn, r["card_id"], cur + [gid], p.user_id)
        await audit(conn, p, "category.create", gid, None, {"name": name, "descr": descr, "request_id": rid})
    return {"id": gid, "name": name, "descr": descr, "as_of": now_iso()}


@router.put("/categories/order")
async def order(body: dict, request: Request):
    p = require(principal(request), admin=True)
    ids = [str(x) for x in (body.get("ids") or [])]
    async with db(realm="lx") as conn:
        have = [r["id"] for r in await conn.fetch("SELECT id FROM card_groups ORDER BY ord, name")]
        if sorted(ids) != sorted(have):
            raise ApiError("bad_request", "분야 목록 전체를 새 순서로 보내 주세요")
        if ids == have:
            return {"ids": ids, "as_of": now_iso()}
        for i, g in enumerate(ids):
            await conn.execute("UPDATE card_groups SET ord=$2, updated_at=now() WHERE id=$1", g, (i + 1) * 10)
        await conn.execute("INSERT INTO card_group_log(action, before, after, by) VALUES ('order',$1,$2,$3)", {"ids": have}, {"ids": ids}, p.user_id)
        await audit(conn, p, "category.order", "card_groups", {"ids": have}, {"ids": ids})
    return {"ids": ids, "as_of": now_iso()}


@router.patch("/categories/{gid}")
async def patch(gid: str, body: dict, request: Request):
    p = require(principal(request), admin=True)
    if not GID_RE.match(gid):
        raise ApiError("not_found", "없는 분야입니다")
    async with db(realm="lx") as conn:
        g = await conn.fetchrow("SELECT * FROM card_groups WHERE id=$1 FOR UPDATE", gid)
        if not g:
            raise ApiError("not_found", "없는 분야입니다")
        if "name" in body:
            name = _clean_name(body.get("name"))
            if name != g["name"]:
                if await conn.fetchval("SELECT 1 FROM card_groups WHERE lower(name)=lower($1) AND id<>$2", name, gid):
                    raise ApiError("conflict", "같은 이름의 분야가 있습니다", None, 409)
                await conn.execute("UPDATE card_groups SET name=$2, updated_at=now() WHERE id=$1", gid, name)
                await conn.execute("UPDATE card_info SET grp=$2 WHERE grp=$1", g["name"], name)        # 옛 칸도 같은 이름으로
                await conn.execute("INSERT INTO card_group_log(group_id, action, before, after, by) VALUES ($1,'rename',$2,$3,$4)",
                                   gid, {"name": g["name"]}, {"name": name}, p.user_id)
        if "descr" in body:
            d = (str(body.get("descr") or "").strip()[:DESCR_MAX]) or None
            if d != g["descr"]:
                await conn.execute("UPDATE card_groups SET descr=$2, updated_at=now() WHERE id=$1", gid, d)
                nm = await conn.fetchval("SELECT name FROM card_groups WHERE id=$1", gid)
                await conn.execute("INSERT INTO card_group_log(group_id, action, before, after, by) VALUES ($1,'descr',$2,$3,$4)",
                                   gid, {"descr": g["descr"]}, {"name": nm, "descr": d}, p.user_id)
        r = await conn.fetchrow("SELECT id, name, descr FROM card_groups WHERE id=$1", gid)
        await audit(conn, p, "category.update", gid, {"name": g["name"], "descr": g["descr"]}, dict(r))
    return {**dict(r), "as_of": now_iso()}


@router.post("/categories/requests/{rid}/close")
async def close_request(rid: int, request: Request):
    p = require(principal(request), admin=True)
    async with db(realm="lx") as conn:
        r = await conn.fetchrow("SELECT * FROM card_group_requests WHERE id=$1 AND state='open'", rid)
        if not r:
            raise ApiError("not_found", "열린 요청이 아닙니다")
        await conn.execute("UPDATE card_group_requests SET state='closed', decided_by=$2, decided_at=now() WHERE id=$1", rid, p.user_id)
        await conn.execute("INSERT INTO card_group_log(action, after, by) VALUES ('request.closed',$1,$2)", {"name": r["name"], "id": rid}, p.user_id)
        await audit(conn, p, "category.request.close", str(rid), None, {"name": r["name"]})
    return {"id": rid, "state": "closed", "as_of": now_iso()}
