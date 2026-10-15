"""필지 조회(F1-CONTRACT §4.5) — GET /parcels?lng&lat · 전국(core-survey).

① 적재된 시군구 = PostGIS survey_parcels(점 ∈ 필지 · GIST) — 필지 원천(연속지적 전국 2022-02 · V-World · 적재 정본)과 기준 시점을 싣는다.
② 적재 전 시군구 = V-World 연속지적 LP_PA_CBND_BUBUN 한 점 조회(서버 키 · 디스크 캐시 30일 · survey/nation._vw).
   적재된 필지에 공시지가가 비어 있으면(연속지적 전국 2022-02 원천) 그 필지 번호로 V-World 연속지적 공시지가를 채운다(필지마다 한 번 · 30일).
지역 고정값 없음. 카드에 기준 시점을 반드시 싣는다.
geom=1(XI맵 필지 카드 · 10-15 원칙 266): 필지 모양(그 필지 AI 결과를 세고 지도에 테두리) · 지목 한 글자 · 자리 이름(리 또는 읍면동) · 번지 ·
   지목과 어긋남을 볼 실태조사 규칙(기존 규칙 이름 · 지목 · AI 분류 · 문턱 — R2 처럼 '없음'으로 거는 규칙은 뺌)을 함께 준다.
V-World 정중하게: 같은 필지 안을 다시 누르면 메모리(필지 모양 안 점)에서 · 같은 점 · 같은 필지 번호는 디스크 캐시에서 — 상류 호출 0.
"""
from __future__ import annotations

import json
import re
import time
from collections import OrderedDict

from fastapi import APIRouter, Request
from starlette.concurrency import run_in_threadpool

from .deps import ApiError, db, principal, require
from .envelope import env

router = APIRouter()
SRC_NM = {"canon": "연속지적(적재 정본)", "lsmd": "연속지적(전국)", "vworld": "V-World 연속지적"}
NO_PARCEL = "이 지점에 필지 없음(도로·하천 경계이거나 바다)"


def _N():
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from survey import nation as N
    return N


# V-World 로 받은 필지(모양 포함) — 같은 필지 안을 다시 누르면 상류를 부르지 않는다(최근 400필지 · 30일 디스크 캐시와 별개)
_MEMO: "OrderedDict[str, tuple]" = OrderedDict()
_JIGA: dict[str, tuple] = {}
MEMO_N = 400


def _memo_hit(lng: float, lat: float) -> dict | None:
    try:
        from shapely.geometry import Point
    except Exception:  # noqa: BLE001
        return None
    pt = Point(lng, lat)
    for k, (props, g, shp, b) in list(_MEMO.items()):
        if b[0] <= lng <= b[2] and b[1] <= lat <= b[3] and shp.covers(pt):
            _MEMO.move_to_end(k)
            return {"properties": props, "geometry": g}
    return None


def _memo_put(f: dict) -> None:
    try:
        from shapely.geometry import shape
        shp = shape(f["geometry"])
    except Exception:  # noqa: BLE001
        return
    k = str((f.get("properties") or {}).get("pnu") or id(f))
    _MEMO[k] = (f.get("properties") or {}, f["geometry"], shp, shp.bounds)
    _MEMO.move_to_end(k)
    while len(_MEMO) > MEMO_N:
        _MEMO.popitem(last=False)


def _vw_point(lng: float, lat: float, geometry: bool = False) -> dict | None:
    """그 점의 V-World 연속지적 필지 → {properties, geometry?}. 모양을 받으면 메모리에 남겨 같은 필지 안 다른 점도 상류 호출 0."""
    if geometry and (m := _memo_hit(lng, lat)):
        return m
    resp = _N()._vw("LP_PA_CBND_BUBUN", point=(lng, lat), size=1, geometry=geometry, ttl_days=30)
    if resp.get("status") != "OK":
        return None
    fs = resp["result"]["featureCollection"]["features"]
    if not fs:
        return None
    f = {"properties": fs[0].get("properties") or {}, "geometry": fs[0].get("geometry") if geometry else None}
    if geometry and f["geometry"]:
        _memo_put(f)
    return f


def _vw_jiga(pnu: str) -> tuple | None:
    """필지 번호 → (공시지가 원/㎡, 'YYYY-M') — V-World 연속지적(필지마다 한 번 · 30일 디스크 캐시 · 메모리 하루)."""
    if not pnu or not pnu.isdigit():
        return None
    if pnu in _JIGA and time.time() - _JIGA[pnu][0] < 86400:
        return _JIGA[pnu][1]
    resp = _N()._vw("LP_PA_CBND_BUBUN", attr=f"pnu:=:{pnu}", size=1, geometry=False, ttl_days=30)
    out = None
    if resp.get("status") == "OK":
        fs = resp["result"]["featureCollection"]["features"]
        p = (fs[0].get("properties") or {}) if fs else {}
        if p.get("jiga") not in (None, ""):
            out = (int(float(p["jiga"])), f"{p.get('gosi_year')}-{p.get('gosi_month')}" if p.get("gosi_year") else None)
    if len(_JIGA) > 4000:
        _JIGA.clear()
    _JIGA[pnu] = (time.time(), out)
    return out


# 지목과 어긋남(기존 실태조사 규칙 · survey/rules/*.yaml) — 규칙 근거 분류 → XI맵 AI 분류 이름. 이름은 규칙 이름 그대로(짧은 이름 = 대시보드와 같은 표)
EVID_CLS = {"bld": ["건물"], "gh": ["비닐하우스"], "park": ["주차장"], "crop": ["경작지", "비닐하우스"]}
_RULES: dict = {}


def mismatch_rules() -> list[dict]:
    if "v" in _RULES:
        return _RULES["v"]
    out = []
    try:
        _N()
        from survey import rules as SR
        try:
            from agent.tools.ext.dash import RULE_NAME as SHORT
        except Exception:  # noqa: BLE001
            SHORT = {}
        for rid, d in sorted(SR.definitions().items()):
            th = d.get("thresholds") or {}
            m2 = next((float(v) for k, v in th.items() if k.endswith("_m2") and not k.endswith("parcel_min_m2")), None)
            ratio = next((float(v) for k, v in th.items() if k.endswith("_ratio")), None)
            if not rid.startswith("R") or m2 is None or d.get("evidence_cls") not in EVID_CLS:
                continue                                   # R2(농경 '없음') · L*(대장 대조)는 필지 카드 한 점 판단에 쓰지 않는다
            out.append({"name": SHORT.get(rid) or d.get("name"), "jimok": list(d.get("jimok") or []), "cls": EVID_CLS[d["evidence_cls"]],
                        "params": {"min_m2": m2, "ratio": ratio}})       # 규칙 문턱(구조 값 — 화면 숫자 아님)
    except Exception:  # noqa: BLE001
        out = []
    _RULES["v"] = out
    return out


def _place(addr: str | None, jibun: str | None) -> tuple[str | None, str | None]:
    """'… 함양읍 운림리 31-2' → ('함양읍', '운림리') — V-World 주소에서 읍면동 · 리."""
    t = [x for x in str(addr or "").split() if x]
    if t and t[-1].lstrip("산")[:1].isdigit():
        t = t[:-1]
    if t and t[-1].endswith("리") and len(t) >= 2:
        return t[-2], t[-1]
    return (t[-1] if t else None), None


_NO = re.compile(r"^\s*(산\s?\d+(?:-\d+)?|\d+(?:-\d+)?)\s*(\D?)")


def _jibun_no(jb: str | None) -> str | None:
    """'768답' · '31-2 대' · '산12-3임' → '768' · '31-2' · '산12-3' (번지만 · 지목 글자 뺌)."""
    m = _NO.match(str(jb or ""))
    return m.group(1).replace(" ", "") if m else (str(jb).strip() or None if jb else None)


def _jimok_cd(jb: str | None) -> str | None:
    m = _NO.match(str(jb or ""))
    return (m.group(2) or None) if m else None


def _jimok_name(j: str | None) -> str | None:
    """지목 한 글자(연속지적 전국 · V-World 번지 끝 글자) → 지목 이름(xdash.JIMOK 한 표 · 예: 대 → 대지)."""
    if j and len(j) == 1:
        from .xdash import JIMOK
        return JIMOK.get(j, j)
    return j


async def _area_5186(conn, g: dict) -> float | None:
    v = await conn.fetchval("SELECT ST_Area(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($1),4326),5186))", json.dumps(g))
    return round(float(v), 1) if v is not None else None


@router.get("/parcels")
async def parcels(lng: float, lat: float, request: Request, geom: int = 0):
    """로그인 필수(게스트 401) · 기관 계정은 관할 안 지점만(밖 = '필지 없음'과 같은 404 · V-World 호출 0) · LX 는 전국."""
    from . import regions as R
    who = require(principal(request))
    if not (-180 <= lng <= 180 and -90 <= lat <= 90):
        raise ApiError("bad_request", "lng · lat 범위 오류")
    if R.scope_of(who) is not None:
        if not await run_in_threadpool(R.point_in_scope, who, lng, lat):
            raise ApiError("not_found", NO_PARCEL, {"lng": lng, "lat": lat})
    async with db(realm="lx") as conn:
        r = await conn.fetchrow(
            "SELECT pnu, jibun, jimok, jimok_nm, area_m2, jiga, jiga_ym, emd, emd_cd, ri, sgg_cd, src, src_as_of"
            + (", ST_AsGeoJSON(geom, 7)::json AS g" if geom else "") + " FROM survey_parcels "
            "WHERE geom && ST_SetSRID(ST_MakePoint($1,$2),4326) AND ST_Contains(geom, ST_SetSRID(ST_MakePoint($1,$2),4326)) LIMIT 1", lng, lat)
    if r and not R.region_allowed(who, r["sgg_cd"] or str(r["pnu"])[:5]):
        raise ApiError("not_found", NO_PARCEL, {"lng": lng, "lat": lat})     # 경계선 오차 안 이웃 시군구 필지도 내주지 않는다
    if r:
        src = r["src"] or "canon"
        as_of = r["src_as_of"] or "2026-09-24"
        if r["jiga"] is not None:
            price = env(int(r["jiga"]), "krw_m2", "recorded", "연속지적 공시지가", as_of=r["jiga_ym"] or as_of)
        else:                                                   # 적재 원천에 공시지가가 없으면 V-World 연속지적(그 필지 번호 · 한 번)
            try:
                vj = await run_in_threadpool(_vw_jiga, str(r["pnu"]))
            except Exception:  # noqa: BLE001
                vj = None
            price = (env(vj[0], "krw_m2", "recorded", "V-World 연속지적 공시지가", as_of=vj[1]) if vj
                     else env(None, "krw_m2", "recorded", "연속지적 공시지가", "원천에 공시지가 없음", as_of=r["jiga_ym"] or as_of))
        out = {"pnu": r["pnu"], "jibun": r["jibun"], "jimok": r["jimok_nm"] or r["jimok"],
               "area_m2": env(round(float(r["area_m2"]), 1) if r["area_m2"] is not None else None, "m2", "measured",
                              f"{SRC_NM.get(src, src)} 도형 · EPSG:5186 면적", as_of=as_of),
               "price_krw_m2": price,
               "owner_kind": None, "emd": r["emd"], "emd_cd": r["emd_cd"], "ri": r["ri"], "road": None,
               "source": f"survey_parcels · {SRC_NM.get(src, src)}", "as_of": as_of}
        if geom:
            jb = str(r["jibun"] or "").strip()
            cd = r["jimok"] if r["jimok"] and len(str(r["jimok"])) == 1 else (jb.split()[-1][:1] if " " in jb else None)
            out.update(geometry=r["g"], jimok_cd=cd or _jimok_cd(jb), no=_jibun_no(jb), place=r["ri"] or r["emd"], rules=mismatch_rules(),
                       jimok=_jimok_name(out["jimok"]))
        return out
    try:
        f = await run_in_threadpool(_vw_point, lng, lat, bool(geom))
    except Exception as e:
        raise ApiError("parcels_unavailable", "필지 원천을 읽지 못했습니다", {"error": type(e).__name__}, 503) from None
    p = (f or {}).get("properties") or {}
    if not f or not R.region_allowed(who, str(p.get("pnu") or "")[:5]):
        raise ApiError("not_found", NO_PARCEL, {"lng": lng, "lat": lat})
    jb = str(p.get("jibun") or "")
    jiga = p.get("jiga")
    ym = f"{p.get('gosi_year')}-{p.get('gosi_month')}" if p.get("gosi_year") else None
    area = None
    if geom and f.get("geometry"):
        async with db(realm="lx") as conn:
            area = await _area_5186(conn, f["geometry"])
    emd, ri = _place(p.get("addr"), jb)
    out = {"pnu": p.get("pnu"), "jibun": jb, "jimok": jb[-1:] if jb else None,
           "area_m2": (env(area, "m2", "measured", "V-World 연속지적 도형 · EPSG:5186 면적") if area is not None
                       else env(None, "m2", "measured", "V-World 연속지적", "면적은 필지를 적재한 뒤 계산")),
           "price_krw_m2": env(int(float(jiga)) if jiga not in (None, "") else None, "krw_m2", "recorded", "V-World 연속지적 공시지가", as_of=ym),
           "owner_kind": None, "emd": emd if geom else None,
           "emd_cd": str(p.get("pnu") or "")[:8] or None, "ri": ri if geom else None, "road": None, "source": "V-World 연속지적(LP_PA_CBND_BUBUN)", "as_of": ym}
    if geom:
        out.update(geometry=f.get("geometry"), jimok_cd=_jimok_cd(jb), no=_jibun_no(jb), place=ri or emd, rules=mismatch_rules(),
                   jimok=_jimok_name(out["jimok"]))
    return out
