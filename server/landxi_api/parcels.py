"""필지 조회(F1-CONTRACT §4.5) — GET /parcels?lng&lat · 전국(core-survey).

① 적재된 시군구 = PostGIS survey_parcels(점 ∈ 필지 · GIST) — 필지 원천(연속지적 전국 2022-02 · V-World · 적재 정본)과 기준 시점을 싣는다.
② 적재 전 시군구 = V-World 연속지적 LP_PA_CBND_BUBUN 한 점 조회(서버 키 · 디스크 캐시 30일 · survey/nation._vw).
지역 고정값 없음. 카드에 기준 시점을 반드시 싣는다.
"""
from __future__ import annotations

from fastapi import APIRouter, Request
from starlette.concurrency import run_in_threadpool

from .deps import ApiError, db, principal, require
from .envelope import env

router = APIRouter()
SRC_NM = {"canon": "연속지적(적재 정본)", "lsmd": "연속지적(전국)", "vworld": "V-World 연속지적"}
NO_PARCEL = "이 지점에 필지 없음(도로·하천 경계이거나 바다)"


def _vw_point(lng: float, lat: float) -> dict | None:
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from survey import nation as N
    resp = N._vw("LP_PA_CBND_BUBUN", point=(lng, lat), size=1, geometry=False, ttl_days=30)
    if resp.get("status") != "OK":
        return None
    fs = resp["result"]["featureCollection"]["features"]
    return (fs[0].get("properties") or {}) if fs else None


@router.get("/parcels")
async def parcels(lng: float, lat: float, request: Request):
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
            "SELECT pnu, jibun, jimok, jimok_nm, area_m2, jiga, jiga_ym, emd, emd_cd, ri, sgg_cd, src, src_as_of FROM survey_parcels "
            "WHERE geom && ST_SetSRID(ST_MakePoint($1,$2),4326) AND ST_Contains(geom, ST_SetSRID(ST_MakePoint($1,$2),4326)) LIMIT 1", lng, lat)
    if r and not R.region_allowed(who, r["sgg_cd"] or str(r["pnu"])[:5]):
        raise ApiError("not_found", NO_PARCEL, {"lng": lng, "lat": lat})     # 경계선 오차 안 이웃 시군구 필지도 내주지 않는다
    if r:
        src = r["src"] or "canon"
        as_of = r["src_as_of"] or "2026-09-24"
        return {"pnu": r["pnu"], "jibun": r["jibun"], "jimok": r["jimok_nm"] or r["jimok"],
                "area_m2": env(round(float(r["area_m2"]), 1) if r["area_m2"] is not None else None, "m2", "measured",
                               f"{SRC_NM.get(src, src)} 도형 · EPSG:5186 면적", as_of=as_of),
                "price_krw_m2": env(int(r["jiga"]) if r["jiga"] is not None else None, "krw_m2", "recorded", "연속지적 공시지가",
                                    None if r["jiga"] is not None else "원천에 공시지가 없음", as_of=r["jiga_ym"] or as_of),
                "owner_kind": None, "emd": r["emd"], "emd_cd": r["emd_cd"], "ri": r["ri"], "road": None,
                "source": f"survey_parcels · {SRC_NM.get(src, src)}", "as_of": as_of}
    try:
        p = await run_in_threadpool(_vw_point, lng, lat)
    except Exception as e:
        raise ApiError("parcels_unavailable", "필지 원천을 읽지 못했습니다", {"error": type(e).__name__}, 503) from None
    if not p or not R.region_allowed(who, str(p.get("pnu") or "")[:5]):
        raise ApiError("not_found", NO_PARCEL, {"lng": lng, "lat": lat})
    jb = str(p.get("jibun") or "")
    jiga = p.get("jiga")
    ym = f"{p.get('gosi_year')}-{p.get('gosi_month')}" if p.get("gosi_year") else None
    return {"pnu": p.get("pnu"), "jibun": jb, "jimok": jb[-1:] if jb else None,
            "area_m2": env(None, "m2", "measured", "V-World 연속지적", "면적은 필지를 적재한 뒤 계산"),
            "price_krw_m2": env(int(float(jiga)) if jiga not in (None, "") else None, "krw_m2", "recorded", "V-World 연속지적 공시지가", as_of=ym),
            "owner_kind": None, "emd": None,
            "emd_cd": str(p.get("pnu") or "")[:8] or None, "ri": None, "road": None, "source": "V-World 연속지적(LP_PA_CBND_BUBUN)", "as_of": ym}
