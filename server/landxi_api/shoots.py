"""촬영 요청(확인 대장 17차 촬영-1 · 18차 ⓑ '요청하기' 메뉴 · 촬영-2 ⓑ 비례 · 촬영-3 ⓐ 화면은 대략만 · 원칙 106 · 119 · 120).

  [기관 분기 — 요청하기 → 촬영 요청]
  POST /api/v1/shoots/quote          {aoi(GeoJSON)} → 넓이 · 시군구 종류 · 대략 비용(셈 한 곳 — config/fees.yaml) · 그 곳 이름
  POST /api/v1/shoots                {aoi, timing, card?, memo?} → 201 요청 한 건(대략 비용 사본을 남김)
  GET  /api/v1/shoots                기관 = 우리 기관 요청(내 것 표시) · LX 관리자 = 모두(받는 쪽 — 담당 지정 화면은 다음 설계)
  GET  /api/v1/shoots/{id}
  POST /api/v1/shoots/{id}/answer    (LX 관리자) {timing, amount, line} 답 · {reject:true, reason} 반려(사유 필수)
  POST /api/v1/shoots/{id}/accept    (기관) 답한 조건으로 진행 · /cancel (기관) 취소
화면의 금액은 늘 '대략'이다 — 넓이 그대로 비례(촬영-2 ⓑ). 끝수 · 최소 · 부가세 · 걸침 · 할인 · 분석 대가 같은 조정은 LX 담당자가 답에서 정한다.
관할 밖 범위는 받지 않는다(원칙 39 — '관할 밖'과 같은 답). 숫자는 봉투(envelope)로만.
"""
from __future__ import annotations

import json
import re
import secrets

from fastapi import APIRouter, Request
from starlette.concurrency import run_in_threadpool

from . import config
from .deps import ApiError, Principal, audit, db, principal, require
from .envelope import KST, env, now_iso

router = APIRouter()
ID_RE = re.compile(r"^sh_[0-9a-f]{12}$")
STATE_WORD = {"sent": "LX 확인 중", "answered": "답 도착", "accepted": "진행", "cancelled": "취소", "rejected": "반려"}
TYPE_WORD = {"gun": "군 지역", "si": "시 지역", "gu": "구 지역"}
LIMIT = {"timing": 40, "memo": 200, "line": 200, "reason": 200}


def _fees() -> dict:
    d = (config.load_yaml("fees") or {}).get("drone_shoot") or {}
    if not d.get("per_unit") or not d.get("unit_km2"):
        raise ApiError("not_ready", "촬영 비용 설정이 없습니다 — LX 관리자에게 알려 주세요", None, 503)
    return d


def _txt(v, key: str) -> str | None:
    s = " ".join(re.sub(r"[\x00-\x1f\x7f<>]", "", str(v or "")).split())
    if len(s) > LIMIT[key]:
        raise ApiError("bad_request", f"{LIMIT[key]}자까지 적을 수 있습니다", {"field": key})
    return s or None


def _region_type(sgg_cd: str | None, fees: dict) -> str | None:
    """군 · 시 · 구 — 그 시군구 이름으로(자치구 = 구 · 시 아래 일반구 = 설정 general_gu · 기본 시)."""
    from . import regions as R
    r = R.region_of(sgg_cd) if sgg_cd else None
    if not r:
        return None
    words = str(r.get("name") or "").split()
    last = words[-1] if words else ""
    if last.endswith("군"):
        return "gun"
    if last.endswith("구"):
        return (fees.get("general_gu") or "si") if any(w.endswith("시") for w in words[:-1]) else "gu"
    if last.endswith("시"):
        return "si"
    return None


def _geom(aoi):
    from shapely.geometry import shape
    try:
        g = shape(aoi if isinstance(aoi, dict) and aoi.get("type") != "Feature" else (aoi or {}).get("geometry"))
    except Exception:
        raise ApiError("bad_request", "찍을 범위를 지도에 그려 주세요") from None
    if g.is_empty or g.geom_type not in ("Polygon", "MultiPolygon"):
        raise ApiError("bad_request", "찍을 범위를 지도에 그려 주세요")
    if not g.is_valid:
        g = g.buffer(0)
    return g


def _area_km2(g) -> float:
    from pyproj import Geod
    a, _ = Geod(ellps="WGS84").geometry_area_perimeter(g)
    return abs(a) / 1e6


def quote_of(p: Principal, aoi) -> tuple[dict, object]:
    """범위 → 셈(동기 · 스레드에서). 관할 밖이면 '관할 밖' · 넓이가 한도를 넘으면 나눠 달라고."""
    from . import regions as R
    from .requests import _place
    fees = _fees()
    g = _geom(aoi)
    c = g.representative_point()
    if R.scope_of(p) is not None and not R.point_in_scope(p, c.x, c.y):
        raise ApiError("out_of_scope", "관할 밖입니다 — 우리 관할 안에서만 촬영을 요청할 수 있습니다", None, 400)
    km2 = _area_km2(g)
    if km2 <= 0:
        raise ApiError("bad_request", "찍을 범위를 지도에 그려 주세요")
    mx = float(fees.get("max_km2") or 100)
    if km2 > mx:
        raise ApiError("too_large", f"한 번에 {mx:g}㎢까지 요청할 수 있습니다 — 범위를 나눠 요청해 주세요", {"area_km2": round(km2, 2)}, 400)
    place, sgg = _place(p, g)
    sgg = sgg or R.sgg_at(c.x, c.y)
    rt = _region_type(sgg, fees)
    if rt is None or rt not in fees["per_unit"]:
        raise ApiError("bad_request", "이 범위의 시군구를 알 수 없습니다 — 다른 곳에 그려 주세요")
    unit, per = float(fees["unit_km2"]), int(fees["per_unit"][rt])
    units = round(km2, 2) / unit                                  # 비례(넓이 그대로 · 촬영-2 ⓑ) — 화면에 보이는 넓이(소수 둘째 자리)로 셈해 보이는 값끼리 맞는다
    amount = int(round(units * per, -3))                          # 천 원 단위로(대략)
    q = {"notice": fees.get("notice") or "", "unit_km2": unit, "per_unit": per, "region_type": rt, "units": round(units, 2),
         "amount": amount, "rounding": fees.get("rounding") or "prorate"}
    region = R.region_of(sgg) if sgg else None
    return {"place": place, "sgg_cd": sgg, "region": (region or {}).get("name"), "km2": km2, "quote": q}, g


def _view(r, p: Principal | None = None, names: dict | None = None) -> dict:
    q = r["quote"] or {}
    a = r["answer"] or None
    src = "넓이 × 국토교통부 고시 기준(대략 · LX 담당자가 조정해 확정)"
    v = {"id": r["id"], "state": r["state"], "state_word": STATE_WORD.get(r["state"], r["state"]), "tenant_id": r["tenant_id"],
         "place": r["place"], "region_type_word": TYPE_WORD.get(r["region_type"] or "", ""),
         "area_km2": env(round(float(r["area_km2"]), 2), "km2", "measured", "그린 범위 넓이"),
         "approx": env(q.get("amount"), "원", "estimate", src, "대략"), "notice": q.get("notice"),
         "timing": r["timing"], "card_id": r["card_id"], "memo": r["memo"], "reason": r["reason"] if r["state"] in ("rejected", "cancelled") else None,
         "created_at": r["created_at"].astimezone(KST).isoformat(timespec="seconds"),
         "updated_at": r["updated_at"].astimezone(KST).isoformat(timespec="seconds"),
         "mine": bool(p and p.realm == "tenant" and r["requested_by"] == p.user_id)}
    if a:
        v["answer"] = {"timing": a.get("timing"), "line": a.get("line"), "by": a.get("by_name") or "LX 담당자", "at": a.get("at"),
                       "amount": env(a.get("amount"), "원", "recorded", "LX 담당자가 정한 금액")}
    if names is not None:
        v["card_name"] = names.get("card", {}).get(r["card_id"]) if r["card_id"] else None
        if p is not None and p.realm == "lx":
            v["org"] = names.get("org", {}).get(r["tenant_id"])
            v["sender"] = names.get("user", {}).get(r["requested_by"])
    if "aoi_g" in r.keys() and r["aoi_g"]:
        v["aoi"] = r["aoi_g"] if isinstance(r["aoi_g"], dict) else json.loads(r["aoi_g"])
    return v


def _tenant(request: Request) -> Principal:
    p = require(principal(request), realm="tenant")
    if not p.tenant_id or p.tenant_id == "lx-demo":
        raise ApiError("forbidden", "기관 계정만 촬영을 요청할 수 있습니다")
    return p


def _lx_admin(request: Request) -> Principal:
    p = require(principal(request))
    if not p.is_admin:
        raise ApiError("forbidden", "촬영 요청은 지금 LX 관리자가 받습니다")
    return p


COLS = "s.*, ST_AsGeoJSON(s.aoi, 7)::json AS aoi_g"


@router.post("/shoots/quote")
async def quote(body: dict, request: Request):
    p = _tenant(request)
    info, _g = await run_in_threadpool(quote_of, p, body.get("aoi"))
    q = info["quote"]
    return {"place": info["place"], "region": info["region"], "region_type_word": TYPE_WORD.get(q["region_type"], ""),
            "area_km2": env(round(info["km2"], 2), "km2", "measured", "그린 범위 넓이"),
            "units": env(q["units"], "count", "estimate", f"넓이 ÷ {q['unit_km2']:g}㎢(기준 넓이)"),
            "per_unit": env(q["per_unit"], "원", "recorded", q["notice"] or "고시 기준"),
            "approx": env(q["amount"], "원", "estimate", "넓이 × 국토교통부 고시 기준(대략 · LX 담당자가 조정해 확정)", "대략"),
            "unit_km2": str(q["unit_km2"]), "notice": q["notice"], "as_of": now_iso()}


@router.post("/shoots", status_code=201)
async def create(body: dict, request: Request):
    p = _tenant(request)
    info, g = await run_in_threadpool(quote_of, p, body.get("aoi"))
    timing, memo = _txt(body.get("timing"), "timing"), _txt(body.get("memo"), "memo")
    card = str(body.get("card") or "").strip() or None
    if card and not re.fullmatch(r"card-[a-z0-9-]{2,40}", card):
        card = None
    sid = "sh_" + secrets.token_hex(6)
    async with db(realm="lx") as conn:
        if card and not await conn.fetchval("SELECT 1 FROM deploys WHERE tenant_id=$1 AND card_id=$2 AND NOT coalesce(test,false)", p.tenant_id, card):
            card = None                                                # 그 기관 서비스가 아니면 비운다
        r = await conn.fetchrow(
            "INSERT INTO shoot_requests(id, tenant_id, requested_by, aoi, place, sgg_cd, area_km2, region_type, quote, timing, card_id, memo) "
            f"VALUES ($1,$2,$3,ST_SetSRID(ST_GeomFromGeoJSON($4),4326),$5,$6,$7,$8,$9,$10,$11,$12) RETURNING {COLS.replace('s.*', '*').replace('s.aoi', 'aoi')}",
            sid, p.tenant_id, p.user_id, json.dumps(g.__geo_interface__), info["place"], info["sgg_cd"], info["km2"], info["quote"]["region_type"],
            info["quote"], timing, card, memo)
        await audit(conn, p, "shoot.request", sid, None, {"area_km2": round(info["km2"], 2), "approx": info["quote"]["amount"], "card": card})
    return _view(r, p)


async def _names(conn, rows) -> dict:
    tids = list({r["tenant_id"] for r in rows}); uids = list({r["requested_by"] for r in rows})
    org = {t["id"]: ((t["name"] or {}).get("ko") if isinstance(t["name"], dict) else t["name"]) for t in await conn.fetch("SELECT id, name FROM tenants WHERE id = ANY($1::text[])", tids)} if tids else {}
    user = {u["id"]: " ".join(x for x in ((u["dept"] or "").strip(), u["name"] or "") if x) for u in await conn.fetch("SELECT id, name, dept FROM tenant_users WHERE id = ANY($1::text[])", uids)} if uids else {}
    cids = list({r["card_id"] for r in rows if r["card_id"]})
    card = {c["id"]: ((c["name"] or {}).get("ko") if isinstance(c["name"], dict) else c["name"]) for c in await conn.fetch("SELECT id, name FROM cards WHERE id = ANY($1::text[])", cids)} if cids else {}
    return {"org": {k: str(v or "").split()[-1] if v else "" for k, v in org.items()}, "user": user, "card": card}


@router.get("/shoots")
async def list_(request: Request, state: str | None = None):
    p = require(principal(request))
    async with db(realm="lx") as conn:
        if p.realm == "tenant":
            rows = await conn.fetch(f"SELECT {COLS} FROM shoot_requests s WHERE s.tenant_id=$1 ORDER BY s.created_at DESC LIMIT 100", p.tenant_id)
            names = await _names(conn, rows)
        elif p.is_admin:
            rows = await conn.fetch(f"SELECT {COLS} FROM shoot_requests s WHERE ($1::text IS NULL OR s.state=$1) ORDER BY s.created_at DESC LIMIT 200", state)
            names = await _names(conn, rows)
        else:
            raise ApiError("forbidden", "촬영 요청은 지금 LX 관리자가 받습니다")
    items = [_view(r, p, names) for r in rows]
    return {"items": items, "total": len(items), "waiting": env(sum(1 for i in items if i["state"] == "sent"), "count", "recorded", "답을 기다리는 촬영 요청"),
            "as_of": now_iso()}


async def _row(conn, sid: str, p: Principal):
    if not ID_RE.match(sid or ""):
        raise ApiError("not_found", "촬영 요청이 없습니다")
    r = await conn.fetchrow(f"SELECT {COLS} FROM shoot_requests s WHERE s.id=$1", sid)
    if not r or (p.realm == "tenant" and r["tenant_id"] != p.tenant_id) or (p.realm == "lx" and not p.is_admin):
        raise ApiError("not_found", "촬영 요청이 없습니다")
    return r


@router.get("/shoots/{sid}")
async def one(sid: str, request: Request):
    p = require(principal(request))
    async with db(realm="lx") as conn:
        r = await _row(conn, sid, p)
        names = await _names(conn, [r])
    return _view(r, p, names)


@router.post("/shoots/{sid}/answer")
async def answer(sid: str, body: dict, request: Request):
    p = _lx_admin(request)
    async with db(realm="lx") as conn:
        r = await _row(conn, sid, p)
        if r["state"] not in ("sent", "answered"):
            raise ApiError("conflict", "이미 진행 · 취소 · 반려된 요청입니다", {"state": r["state"]}, 409)
        if body.get("reject"):
            reason = _txt(body.get("reason"), "reason")
            if not reason:
                raise ApiError("reason_required", "반려 사유를 적어 주세요", None, 400)
            r = await conn.fetchrow(f"UPDATE shoot_requests SET state='rejected', reason=$2, updated_at=now() WHERE id=$1 RETURNING {COLS.replace('s.*', '*').replace('s.aoi', 'aoi')}", sid, reason)
            await audit(conn, p, "shoot.reject", sid, None, {"reason": reason})
            return _view(r, p)
        try:
            amount = int(str(body.get("amount") or "").replace(",", "").strip())
        except ValueError:
            raise ApiError("bad_request", "확정 금액을 숫자로 적어 주세요", {"field": "amount"}) from None
        if amount < 0:
            raise ApiError("bad_request", "확정 금액을 숫자로 적어 주세요", {"field": "amount"})
        timing = _txt(body.get("timing"), "timing")
        if not timing:
            raise ApiError("bad_request", "촬영 시기를 적어 주세요", {"field": "timing"})
        ans = {"timing": timing, "amount": amount, "line": _txt(body.get("line"), "line"), "by": p.user_id, "by_name": p.name, "at": now_iso()}
        r = await conn.fetchrow(f"UPDATE shoot_requests SET state='answered', answer=$2, updated_at=now() WHERE id=$1 RETURNING {COLS.replace('s.*', '*').replace('s.aoi', 'aoi')}", sid, ans)
        await audit(conn, p, "shoot.answer", sid, None, {"amount": amount, "timing": timing})
    return _view(r, p)


async def _tenant_move(sid: str, request: Request, to: str, body: dict | None = None):
    p = _tenant(request)
    async with db(realm="lx") as conn:
        r = await _row(conn, sid, p)
        ok = {"accepted": ("answered",), "cancelled": ("sent", "answered")}[to]
        if r["state"] not in ok:
            raise ApiError("conflict", "지금 상태에서는 할 수 없습니다", {"state": r["state"]}, 409)
        reason = _txt((body or {}).get("reason"), "reason") if to == "cancelled" else None
        r = await conn.fetchrow(f"UPDATE shoot_requests SET state=$2, reason=coalesce($3, reason), updated_at=now() WHERE id=$1 RETURNING {COLS.replace('s.*', '*').replace('s.aoi', 'aoi')}", sid, to, reason)
        await audit(conn, p, "shoot." + ("accept" if to == "accepted" else "cancel"), sid, None, {})
    return _view(r, p)


@router.post("/shoots/{sid}/accept")
async def accept(sid: str, request: Request):
    return await _tenant_move(sid, request, "accepted")


@router.post("/shoots/{sid}/cancel")
async def cancel(sid: str, request: Request, body: dict | None = None):
    return await _tenant_move(sid, request, "cancelled", body)
