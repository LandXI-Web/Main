#!/usr/bin/env python
"""남원 3D 건물 데이터셋 빌드.

지오메트리 = Overture(=CN-EAB ML 풋프린트 + OSM), 속성 = OSM 조인,
높이 = 실측이 있으면 실측, 없으면 '면적×용도 기반 추정'(추정임을 명시적으로 플래그).

usage: python tools/data3d/build_namwon_buildings.py
"""
import json, math, os, sys
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OVT = os.path.join(ROOT, "landxi/assets/data/3d/_raw-namwon-overture.geojson")
OSM = os.path.join(ROOT, "landxi/assets/data/3d/_raw-namwon-osm.geojson")
OUT = os.path.join(ROOT, "landxi/assets/data/3d/namwon-buildings.geojson")

FLOOR_H, ROOF_H = 3.0, 1.0   # 한국 단독주택 통상 층고 / 박공지붕 가산

# 면적(㎡) -> (추정높이 m, 추정 층수, 추정 용도) — 농촌 마을 실태 기준
AREA_RULES = [
    (0,    60,  3.0, 1, "부속사/창고"),
    (60,   250, 4.0, 1, "단독주택"),
    (250,  800, 5.5, 1, "축사/창고/근생"),
    (800,  1e9, 7.5, 2, "대형축사/공장/학교"),
]

def ring_area_m2(ring):
    """WGS84 링 -> 근사 평면 면적(㎡). 국소 등적 근사(위도 보정)."""
    if len(ring) < 4: return 0.0
    lat0 = sum(p[1] for p in ring) / len(ring)
    kx = 111320.0 * math.cos(math.radians(lat0))
    ky = 110540.0
    s = 0.0
    for i in range(len(ring) - 1):
        x1, y1 = ring[i][0] * kx, ring[i][1] * ky
        x2, y2 = ring[i + 1][0] * kx, ring[i + 1][1] * ky
        s += x1 * y2 - x2 * y1
    return abs(s) / 2.0

def poly_area(geom):
    if geom["type"] == "Polygon":
        return ring_area_m2(geom["coordinates"][0])
    if geom["type"] == "MultiPolygon":
        return sum(ring_area_m2(p[0]) for p in geom["coordinates"])
    return 0.0

def centroid(geom):
    rings = geom["coordinates"][0] if geom["type"] == "Polygon" else geom["coordinates"][0][0]
    return (sum(p[0] for p in rings) / len(rings), sum(p[1] for p in rings) / len(rings))

def round_geom(geom, nd=6):
    def rr(c):
        if isinstance(c[0], (int, float)):
            return [round(c[0], nd), round(c[1], nd)]
        return [rr(x) for x in c]
    geom["coordinates"] = rr(geom["coordinates"])
    return geom

def main():
    ovt = json.load(open(OVT, encoding="utf-8"))
    osm = json.load(open(OSM, encoding="utf-8"))

    # OSM 속성 그리드 인덱스 (약 100m 셀)
    grid = {}
    for f in osm["features"]:
        cx, cy = centroid(f["geometry"])
        grid.setdefault((round(cx, 3), round(cy, 3)), []).append((cx, cy, f["properties"]))

    def osm_near(cx, cy, tol=0.0006):
        best = None; bd = tol
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for (ox, oy, p) in grid.get((round(cx + dx * 0.001, 3), round(cy + dy * 0.001, 3)), []):
                    d = math.hypot(ox - cx, oy - cy)
                    if d < bd: bd, best = d, p
        return best

    feats = []
    stat = Counter()
    for f in ovt["features"]:
        g = f["geometry"]; p = f["properties"]
        area = poly_area(g)
        if area < 12:            # 12㎡ 미만은 노이즈로 제외
            stat["dropped_tiny"] += 1; continue
        cx, cy = centroid(g)
        o = osm_near(cx, cy)

        h = None; src = None; floors = None; use = None
        if p.get("height") is not None:
            h, src = float(p["height"]), "overture_height"
        elif o and o.get("height_tag") is not None:
            h, src = float(o["height_tag"]), "osm_height"
        elif o and o.get("levels"):
            floors = float(o["levels"]); h, src = floors * FLOOR_H + ROOF_H, "osm_levels"
        elif p.get("num_floors"):
            floors = float(p["num_floors"]); h, src = floors * FLOOR_H + ROOF_H, "overture_floors"
        else:
            for lo, hi, hh, ff, uu in AREA_RULES:
                if lo <= area < hi:
                    h, floors, use, src = hh, ff, uu, "estimated_area"
                    break
            bt = (o or {}).get("building")
            if bt in ("apartments", "residential") and area > 300:
                h, floors, use, src = 5 * FLOOR_H + ROOF_H, 5, "아파트(추정)", "estimated_area"
        stat[src] += 1

        feats.append({
            "type": "Feature",
            "properties": {
                "id": p.get("id"),
                "name": (o or {}).get("name"),
                "area_m2": round(area, 1),
                "height_m": round(h, 1),
                "floors_est": floors,
                "use_est": use or (o or {}).get("building"),
                "height_src": src,
                "height_is_estimate": src == "estimated_area",
                "geom_src": "OSM" if "OpenStreetMap" in (p.get("datasets") or []) else "CN-EAB(ML)",
            },
            "geometry": round_geom(g),
        })

    fc = {
        "type": "FeatureCollection",
        "metadata": {
            "name": "남원 금지면·송동면 코어 건물 (3D 압출용)",
            "bbox_wsen": [127.346, 35.374, 127.434, 35.446],
            "geometry_source": "Overture Maps 2026-08-19.0 theme=buildings "
                               "(CN-EAB ML 풋프린트 doi:10.5281/zenodo.8174931 CC-BY-4.0 + OpenStreetMap ODbL)",
            "height_source": "실측 높이 없음. height_src='estimated_area' 는 면적×농촌 용도 규칙 기반 추정치이며 "
                             "건축물대장 실측이 아님. 시각화 전용, 분석/법적 용도 금지.",
            "height_rules": [{"area_min": a, "area_max": (None if b > 1e8 else b),
                              "height_m": h, "floors": f, "use": u} for a, b, h, f, u in AREA_RULES],
            "licence": "CC-BY-4.0 (CN-EAB) + ODbL-1.0 (OSM) — 출처표기 필수",
        },
        "features": feats,
    }
    json.dump(fc, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    mb = os.path.getsize(OUT) / 1e6
    real = sum(1 for f in feats if not f["properties"]["height_is_estimate"])
    print(json.dumps({"out": OUT, "features": len(feats), "mb": round(mb, 2),
                      "height_real": real, "height_estimated": len(feats) - real,
                      "pct_real_height": round(100 * real / len(feats), 2),
                      "breakdown": dict(stat)}, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
