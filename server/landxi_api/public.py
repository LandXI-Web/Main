"""공개 통계·표본(F3 최종 명세 §3 S-4) — 게스트(인증 불필요) · 공개 결과만 · 원본 영상 0.

GET /public/stats?set=river-occupy&by=sigungu[&geom=1]  전국 하천구역 건물 점유(시군구 집계 · export_policy=public)
GET /public/sample-parcel                              익명 필지 카드 1(대장 × AI · PNU 마스킹 · 주소는 리까지)
공개 타일: /tiles/pmtiles/public/river-occupy.pmtiles · /tiles/xyz/public/river-occupy/{z}/{x}/{y}.pbf (서명 면제)
정본: server/seed/public-river-occupy.json(build_regions.py ← 하천구역 건물 점유 분석 _처리결과.csv) · survey_findings × detections.
"""
from __future__ import annotations

import json
import time

from fastapi import APIRouter, Request
from shapely.geometry import shape

from . import config
from .deps import ApiError, db
from .envelope import env, now_iso

router = APIRouter()
RIVER = config.SERVER_ROOT / "seed" / "public-river-occupy.json"
GEOM = config.SERVER_ROOT / "seed" / "sgg-simplified.geojson"
SETS = {"river-occupy": {"by": ["sigungu"], "label": "하천구역 안 건물 점유"}}
_cache: dict = {}


def _river() -> dict:
    mt = RIVER.stat().st_mtime
    c = _cache.get("river")
    if c and c[0] == mt:
        return c[1]
    d = json.loads(RIVER.read_text(encoding="utf-8"))
    _cache["river"] = (mt, d)
    return d


def _geoms() -> dict:
    if "geoms" not in _cache:
        g = json.loads(GEOM.read_text(encoding="utf-8"))
        _cache["geoms"] = {f["properties"]["sgg_cd"]: f for f in g["features"]}
    return _cache["geoms"]


def _names() -> dict:
    if "names" not in _cache:
        d = json.loads((config.SERVER_ROOT / "seed" / "regions-sgg.json").read_text(encoding="utf-8"))
        _cache["names"] = {r["sgg_cd"]: r for r in d["items"]}
    return _cache["names"]


def _breaks(vals: list[int]) -> list[int]:
    v = sorted(x for x in vals if x)
    return [v[int(len(v) * t)] for t in (0.2, 0.4, 0.6, 0.8)] if v else []


@router.get("/public/stats")
async def public_stats(request: Request, set: str = "river-occupy", by: str = "sigungu", geom: int | None = None):
    if set not in SETS:
        raise ApiError("not_found", "공개 결과가 없습니다", {"allowed": list(SETS)})
    if by not in SETS[set]["by"]:
        raise ApiError("bad_request", "by 는 sigungu", {"allowed": SETS[set]["by"]})
    d = _river()
    src = d["source"]
    names = _names()
    items = []
    for it in d["items"]:
        r = names.get(it["sgg_cd"], {})
        items.append({"sgg_cd": it["sgg_cd"], "name": r.get("name"), "sido": r.get("sido_short"),
                      "value": env(it["value"], "count", "measured", src, as_of=d["as_of"])})
    top = max(d["items"], key=lambda x: x["value"])
    tr = names.get(top["sgg_cd"], {})
    out = {"set": set, "by": by, "label": SETS[set]["label"], "export_policy": "public", "as_of": d["as_of"],
           "total": env(d["total"], "count", "measured", src, as_of=d["as_of"]),
           "n_sgg": env(d["n_rows"], "count", "measured", src, as_of=d["as_of"]),
           "breaks": [env(b, "count", "measured", src, "5분위 경계", as_of=d["as_of"]) for b in _breaks([x["value"] for x in d["items"]])],
           "top": {"sgg_cd": top["sgg_cd"], "name": tr.get("name"), "sido": tr.get("sido_short"),
                   "value": env(top["value"], "count", "measured", src, as_of=d["as_of"])},
           "items": items,
           "tiles": {"pmtiles": f"{_base(request)}/tiles/pmtiles/public/{set}.pmtiles",   # 이 요청의 기준 주소(바깥 주소에서 이 PC 주소 0 · fix9)
                     "xyz": f"{_base(request)}/tiles/xyz/public/{set}/{{z}}/{{x}}/{{y}}.pbf", "layer": set.replace("-", "_")},
           "source": src}
    if geom:
        gs = _geoms()
        vals = {x["sgg_cd"]: x["value"] for x in d["items"]}
        out["geojson"] = {"type": "FeatureCollection", "features": [
            {"type": "Feature", "properties": {**gs[cd]["properties"], "value": vals.get(cd)}, "geometry": gs[cd]["geometry"]}
            for cd in gs]}
    return out


def _base(request: Request) -> str:
    from .catalog import base_of
    return base_of(request)


def _mask(pnu: str) -> str:
    return pnu[:10] + "-****-****"


def _place(addr: str | None) -> str | None:
    """주소를 리(里)까지만 — 지번 0."""
    if not addr:
        return None
    parts = addr.split()
    keep = []
    for w in parts:
        if any(ch.isdigit() for ch in w) or w == "산":
            break
        keep.append(w)
    s = " ".join(keep)
    for a, b in (("전북특별자치도", "전북"), ("강원특별자치도", "강원"), ("제주특별자치도", "제주"), ("전라남도", "전남"), ("경상북도", "경북"),
                 ("경상남도", "경남"), ("충청남도", "충남"), ("충청북도", "충북"), ("경기도", "경기")):
        s = s.replace(a, b)
    return s


@router.get("/public/sample-parcel")
async def sample_parcel():
    """익명 필지 카드 1 — 가장 설명이 분명한 표본(무허가 건축 의심 A · 지목 전/답 · 근거 90–260㎡ · 신뢰도 ≥ 0.8 · 필지 700–2600㎡).
    지역 고정 0: 조건에 맞는 전국 의심 중 점수 1위(지금 적재분). 10분 캐시."""
    c = _cache.get("sample")
    if c and time.time() - c[0] < 600:
        return c[1]
    async with db(realm="lx") as conn:
        f = await conn.fetchrow("SELECT id, pnu, addr, jimok, yongdo, parcel_m2, evid_m2, conf, ai_ids, img_date FROM survey_findings "
                                "WHERE rule='R1' AND priority='A' AND jimok IN ('답','전') AND evid_m2 BETWEEN 90 AND 260 AND conf >= 0.8 "
                                "AND parcel_m2 BETWEEN 700 AND 2600 AND state <> 'dismissed' ORDER BY score DESC, rank LIMIT 1")
        if not f:
            raise ApiError("not_found", "아직 결과가 없습니다")
        pg = await conn.fetchval("SELECT ST_AsGeoJSON(geom, 7) FROM survey_parcels WHERE pnu=$1", f["pnu"])
        ids = [x.strip() for x in (f["ai_ids"] or "").split(",") if x.strip()]
        ai_in = await conn.fetch("SELECT ST_AsGeoJSON(geom, 7) g FROM detections WHERE job_id='results/lx/namwon-landcover-2023' AND fid = ANY($1::text[])",
                                 ids) if ids else []
        bb = await conn.fetchrow("SELECT ST_XMin(geom) a, ST_YMin(geom) b, ST_XMax(geom) c, ST_YMax(geom) d FROM survey_parcels WHERE pnu=$1", f["pnu"])
        near = await conn.fetch("SELECT ST_AsGeoJSON(geom, 7) g FROM detections WHERE job_id='results/lx/namwon-landcover-2023' AND cls='건물' "
                                "AND geom && ST_Expand(ST_MakeEnvelope($1,$2,$3,$4,4326), 0.0004) AND NOT (fid = ANY($5::text[])) LIMIT 60",
                                bb["a"], bb["b"], bb["c"], bb["d"], ids)
    as_of = "2026-09-24"
    try:
        from survey.db import AS_OF as as_of  # noqa: F811
    except Exception:
        pass
    out = {"place": _place(f["addr"]), "pnu_masked": _mask(f["pnu"]),
           "ledger": {"jimok": f["jimok"], "yongdo": f["yongdo"] or None,
                      "area": env(round(float(f["parcel_m2"])), "m2", "recorded", "V-World 연속지적도", as_of=as_of)},
           "ai": {"cls": "건물", "n": env(len(ai_in), "동", "inferred", "2023년 25cm 항공영상 AI 판독", as_of=as_of),
                  "area": env(round(float(f["evid_m2"]), 1), "m2", "inferred", "2023년 25cm 항공영상 AI 판독", as_of=as_of), "year": 2023},
           "verdict": "현장 확인 필요",
           "bbox": [round(bb["a"], 6), round(bb["b"], 6), round(bb["c"], 6), round(bb["d"], 6)],
           "parcel": {"type": "Feature", "properties": {}, "geometry": json.loads(pg)},
           "ai_fc": {"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {"in": True}, "geometry": json.loads(x["g"])} for x in ai_in]
                     + [{"type": "Feature", "properties": {"in": False}, "geometry": json.loads(x["g"])} for x in near]},
           "export_policy": "public", "as_of": as_of}
    _cache["sample"] = (time.time(), out)
    return out
