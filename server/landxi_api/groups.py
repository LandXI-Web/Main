"""행정서비스 묶음 · 다운로드 이력(10-22 원칙 310 · 308 · FARM-ADMIN-DESIGN §2-1 · §6-3 · IMPL 1-1 · 1-4).

  [행정서비스 묶음 — "영농관리 행정서비스 큰 틀 아래에 서비스 들이 여러개"]
  GET  /api/v1/spaces/me/groups                  기관 세션 — 묶음(이름 · 분야 · 한 줄) × 그 기관이 볼 수 있는 분석서비스(공유된 것만 · 부서 사용자는 배정된 것만)
                                                 + 묶음 없는 서비스. 묶음 정의 = service_groups · group_cards(0116 · 서버 데이터 — 화면 고정값 0).
                                                 정책 칸(통합 대시보드 칸 넷)은 확인 뒤(now 22 Q7) — 지금은 칸 정의만 싣는다(값은 내지 않는다 · 지어내지 않음).
  [다운로드 이력 — '이용 약속 기록'을 대신하는 쉬운 말(원칙 308)]
  GET  /api/v1/spaces/me/download-history?from=&to=&who=&kind=&personal=   누가 · 언제 · 무엇(파일 종류 · 서비스 · 범위) · 개인정보 포함 · 사용 목적 · 활용 기간 · 횟수
       (.xlsx 같은 길)                            횟수 = 같은 사람이 같은 파일(종류 · 서비스 · 범위)을 받은 수(운영 사이트 '다운로드 횟수'). 기관 관리자 = 기관 전체 ·
                                                 부서 사용자 = 자기 것만. 기록 = space_log(kind=download · 기관 세션에서 받은 것만) + download_pledges.
지역 고정값 0 · 숫자 한 출처(기록 그대로 센 값) · 내부 지표 0.
"""
from __future__ import annotations

import datetime as dt
import json
import re

from fastapi import APIRouter, Request
from starlette.concurrency import run_in_threadpool

from .deps import ApiError, Principal, db
from .envelope import KST, env, now_iso

router = APIRouter()
GROUP_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,39}$")
DOMAIN_TILES = {   # 분야마다 통합 대시보드 칸 정의(FARM-ADMIN §2-2 — 값은 확인 뒤 /groups/{id}/dashboard 가 같은 집계로)
    "farm": [{"key": "direct_pay", "label": "직불금 이행 점검"}, {"key": "fallow", "label": "휴경 관리"},
             {"key": "facility", "label": "영농시설 현황"}, {"key": "yearly", "label": "해마다 변화"}],
    "river": [{"key": "occupancy", "label": "하천 점용"}, {"key": "debris", "label": "쓰레기 현황"}, {"key": "yearly", "label": "해마다 변화"}],
}


def _me(request: Request) -> Principal:
    from .spaces import _me as me
    return me(request)


def _title(name: str) -> str:
    n = (name or "").strip()
    return n if n.endswith("서비스") else f"{n} 행정서비스"


async def groups_of(p: Principal) -> dict:
    """그 기관(그 사람)이 볼 수 있는 묶음 · 서비스 — 서비스 선택 화면 · 묶음 홈 · 레일이 같은 값을 쓴다."""
    from .spaces import _visible, received
    svcs = await _visible(p, await received(p.tenant_id))
    by = {s["card"]: s for s in svcs}
    async with db(p) as c:
        if not await c.fetchval("SELECT to_regclass('public.service_groups') IS NOT NULL"):
            return {"items": [], "ungrouped": [s["card"] for s in svcs]}
        gs = await c.fetch('SELECT id, name, domain, descr, policy_tiles, "order" FROM service_groups WHERE tenant_id=$1 ORDER BY "order", name', p.tenant_id)
        gc = await c.fetch('SELECT group_id, card_id, "order" FROM group_cards WHERE tenant_id=$1 ORDER BY "order", card_id', p.tenant_id)
    items, used = [], set()
    for g in gs:
        cards = [r["card_id"] for r in gc if r["group_id"] == g["id"] and r["card_id"] in by]
        if not cards:                                    # 볼 수 있는 서비스가 없는 묶음은 내지 않는다(빈 묶음 0)
            continue
        used.update(cards)
        tiles = g["policy_tiles"]
        if isinstance(tiles, str):
            tiles = json.loads(tiles)
        items.append({"id": g["id"], "name": g["name"], "title": _title(g["name"]), "domain": g["domain"], "descr": g["descr"] or "",
                      "cards": cards, "services": [{"card": k, "name": by[k]["name"], "status": by[k].get("status")} for k in cards],
                      "tiles": tiles or DOMAIN_TILES.get(g["domain"], [])})
    return {"items": items, "ungrouped": [s["card"] for s in svcs if s["card"] not in used]}


async def attach_group(conn, tenant: str, name: str, card_id: str, domain: str | None = None) -> str | None:
    """LX 의 '기관에 공유'에서 고른 묶음 — 같은 이름이 있으면 그 묶음, 없으면 새로(id = 이름에서 · 겹치면 숫자) · 카드를 끝에 붙인다(이미 있으면 그대로)."""
    import secrets
    name = re.sub(r"\s*행정\s*서비스$", "", name.strip())[:40]
    if not name or not await conn.fetchval("SELECT to_regclass('public.service_groups') IS NOT NULL"):
        return None
    gid = await conn.fetchval("SELECT id FROM service_groups WHERE tenant_id=$1 AND name=$2", tenant, name)
    if not gid:
        gid = "g-" + secrets.token_hex(3)
        dom = domain if domain in DOMAIN_TILES else "general"
        n = await conn.fetchval('SELECT coalesce(max("order"), -1) + 1 FROM service_groups WHERE tenant_id=$1', tenant)
        await conn.execute('INSERT INTO service_groups(tenant_id, id, name, domain, "order") VALUES ($1,$2,$3,$4,$5)', tenant, gid, name, dom, n)
    n = await conn.fetchval('SELECT coalesce(max("order"), -1) + 1 FROM group_cards WHERE tenant_id=$1 AND group_id=$2', tenant, gid)
    await conn.execute('INSERT INTO group_cards(tenant_id, group_id, card_id, "order") VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING', tenant, gid, card_id, n)
    return gid


@router.get("/lx/service-groups")
async def lx_groups(request: Request, region: str | None = None, tenant: str | None = None):
    """LX — 공유할 기관(지역 → 관할 기관)의 행정서비스 묶음 이름(기관에 공유 창의 고르기 목록)."""
    from .deps import principal, require
    from .regions import tenant_scope
    require(principal(request), lx=True)
    async with db(realm="lx") as c:
        t = tenant
        if not t and region:
            for x in await c.fetch("SELECT id FROM tenants WHERE status='active' AND kind='user' ORDER BY id"):
                sc = tenant_scope(x["id"])
                if sc and any(str(region).startswith(px) for px in sc):
                    t = x["id"]
                    break
        if not t or not await c.fetchval("SELECT to_regclass('public.service_groups') IS NOT NULL"):
            return {"tenant": t, "items": []}
        rows = await c.fetch('SELECT id, name FROM service_groups WHERE tenant_id=$1 ORDER BY "order", name', t)
    return {"tenant": t, "items": [{"id": r["id"], "name": r["name"]} for r in rows], "as_of": now_iso()}


@router.get("/spaces/me/groups")
async def my_groups(request: Request):
    p = _me(request)
    out = await groups_of(p)
    return {**out, "as_of": now_iso()}


# ── 다운로드 이력 ─────────────────────────────────────────────────────────────
def _day(v: str | None, k: str) -> dt.date | None:
    if not v:
        return None
    try:
        return dt.date.fromisoformat(str(v)[:10])
    except ValueError:
        raise ApiError("bad_request", "날짜는 2026-10-22 꼴로", {"field": k}) from None


def _scope_of(d: dict) -> str:
    """같은 파일 열쇠의 '범위' — 고른 필지 수 · 읍면동 · 대장 · 고른 서비스(기록에 있는 것만)."""
    bits = []
    if d.get("emd"):
        bits.append(str(d["emd"]))
    if d.get("cards"):
        bits.append(str(d["cards"]))
    if d.get("import_id"):
        bits.append("대장")
    return " · ".join(bits)


async def downloads_of(p: Principal, d0: dt.date | None, d1: dt.date | None, who: str | None, kind: str | None, personal: str | None) -> dict:
    from .farm_more import FMT_KO
    mgr = p.role == "manager"
    cond, args = ["s.tenant_id=$1", "s.kind='download'", "s.realm='tenant'", "NOT coalesce((s.detail->>'test')::boolean, false)"], [p.tenant_id]
    if not mgr:                                          # 부서 사용자 = 자기 것만
        args.append(p.user_id)
        cond.append(f"s.actor=${len(args)}")
    if d0:
        args.append(dt.datetime.combine(d0, dt.time.min, KST))
        cond.append(f"s.at >= ${len(args)}")
    if d1:
        args.append(dt.datetime.combine(d1 + dt.timedelta(days=1), dt.time.min, KST))
        cond.append(f"s.at < ${len(args)}")
    async with db(p) as c:
        rows = await c.fetch(
            "SELECT s.at, s.card_id, s.actor, s.detail, u.name, u.dept, u.position, pl.purpose, pl.until_date "
            "FROM space_log s LEFT JOIN tenant_users u ON u.id = s.actor "
            "LEFT JOIN download_pledges pl ON pl.id = s.detail->>'pledge' AND pl.tenant_id = s.tenant_id "
            f"WHERE {' AND '.join(cond)} ORDER BY s.at DESC LIMIT 5000", *args)
        cards = {r["id"]: r["name"] for r in await c.fetch("SELECT id, name FROM cards WHERE id = ANY($1::text[])",
                                                           list({r["card_id"] for r in rows if r["card_id"]}))}
    def cname(cid):
        n = cards.get(cid)
        if isinstance(n, str):
            try:
                n = json.loads(n)
            except ValueError:
                n = {"ko": n}
        return ((n or {}).get("ko") or "") if n else ""
    groups: dict[tuple, dict] = {}
    people: dict[str, str] = {}
    for r in rows:
        dd = r["detail"] or {}
        if isinstance(dd, str):
            dd = json.loads(dd)
        fmt = dd.get("fmt") or "file"
        who_s = " · ".join(x for x in ((r["dept"] or "").strip(), " ".join(y for y in ((r["name"] or "").strip(), (r["position"] or "").strip()) if y)) if x) or "기관 담당자"
        if r["actor"]:
            people[r["actor"]] = who_s
        key = (r["actor"], fmt, r["card_id"], _scope_of(dd))
        g = groups.get(key)
        if not g:
            g = groups[key] = {"at": r["at"], "first": r["at"], "who": who_s, "who_id": r["actor"], "fmt": fmt, "kind": FMT_KO.get(fmt, "자료"),
                               "service": cname(r["card_id"]), "card": r["card_id"], "scope": _scope_of(dd),
                               "personal": bool(dd.get("personal")), "purpose": r["purpose"], "until": r["until_date"].isoformat() if r["until_date"] else None, "n": 0}
        g["n"] += 1
        g["first"] = min(g["first"], r["at"])
        if r["purpose"] and not g["purpose"]:
            g["purpose"], g["until"] = r["purpose"], (r["until_date"].isoformat() if r["until_date"] else None)
    items = list(groups.values())
    facets = {"who": sorted({(x["who_id"], x["who"]) for x in items if x["who_id"]}, key=lambda t: t[1]),
              "kind": sorted({(x["fmt"], x["kind"]) for x in items}, key=lambda t: t[1])}
    if who:
        items = [x for x in items if x["who_id"] == who]
    if kind:
        items = [x for x in items if x["fmt"] == kind]
    if personal in ("1", "0"):
        items = [x for x in items if x["personal"] == (personal == "1")]
    items.sort(key=lambda x: x["at"], reverse=True)
    out = [{**{k: v for k, v in x.items() if k not in ("at", "first")}, "at": x["at"].astimezone(KST).isoformat(timespec="minutes"),
            "first": x["first"].astimezone(KST).isoformat(timespec="minutes"), "n": env(x["n"], "회", "recorded", "같은 파일을 받은 횟수(다운로드 기록)")} for x in items]
    total = sum(x["n"]["value"] for x in out)
    return {"items": out, "files": env(len(out), "건", "recorded", "다운로드 이력(같은 파일은 한 줄)"), "total": env(total, "회", "recorded", "받은 횟수 합"),
            "facets": {"who": [{"id": a, "name": b} for a, b in facets["who"]], "kind": [{"id": a, "name": b} for a, b in facets["kind"]]},
            "mine_only": not mgr, "as_of": now_iso()}


@router.get("/spaces/me/download-history")
async def my_downloads(request: Request):
    p = _me(request)
    q = request.query_params
    return await downloads_of(p, _day(q.get("from"), "from"), _day(q.get("to"), "to"), (q.get("who") or "").strip() or None,
                              (q.get("kind") or "").strip() or None, q.get("personal"))


@router.get("/spaces/me/download-history.xlsx")
async def my_downloads_xlsx(request: Request):
    from .farm_more import COUNT, DATETIME, _book, _info, _org_short, _save, _sheet, _xlsx_resp, cap_line
    p = _me(request)
    q = request.query_params
    d0, d1 = _day(q.get("from"), "from"), _day(q.get("to"), "to")
    j = await downloads_of(p, d0, d1, (q.get("who") or "").strip() or None, (q.get("kind") or "").strip() or None, q.get("personal"))
    org = await _org_short(p.tenant_id)
    rng = f"{d0.isoformat() if d0 else '처음'} ~ {d1.isoformat() if d1 else '오늘'}"

    def build() -> bytes:
        wb = _book()
        head = ["마지막으로 받은 때", "누가", "무엇", "서비스", "범위", "개인정보", "사용 목적", "활용 기간(끝나는 날)", "횟수"]
        data = []
        for x in j["items"]:
            at = dt.datetime.fromisoformat(x["at"]).replace(tzinfo=None)
            data.append([at, x["who"], x["kind"], x["service"], x["scope"], "포함" if x["personal"] else "없음", x["purpose"] or "",
                         dt.date.fromisoformat(x["until"]) if x["until"] else None, x["n"]["value"]])
        cap = cap_line(org, "다운로드 이력", rng, dt.datetime.now(KST).strftime("%Y-%m-%d"), "기관 화면에서 받은 파일 기록")
        _sheet(wb, "다운로드 이력", head, data, num={0: DATETIME, 7: "yyyy-mm-dd", 8: COUNT}, widths=[18, 24, 18, 22, 18, 10, 30, 14, 8], cap=cap)
        _info(wb, [("기관", org), ("기간", rng), ("줄 수", len(data)), ("횟수", "같은 사람이 같은 파일(종류 · 서비스 · 범위)을 받은 수"),
                   ("규칙", "올린 대장의 필지별 내용(지번 · 대장 값)이 든 파일은 받을 때마다 사용 목적 · 활용 기간을 확인합니다."),
                   ("만든 때", now_iso()[:16].replace("T", " "))])
        return _save(wb)
    blob = await run_in_threadpool(build)
    return _xlsx_resp(blob, f"{org}_다운로드이력_{dt.datetime.now(KST).strftime('%Y%m%d')}")
