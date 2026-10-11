"""메인 마지막 해외 장면(ch6) — 키르기스스탄 군(ADM2)별 농경지 분석 결과의 공개 사본(10-11 메인 지시 5).

원천(이미 이 PC 에 있는 실제 분석 결과 — 지어낸 숫자 0):
  · 군 경계      landxi/global/data/kgz-adm2.geojson        (geoBoundaries KGZ ADM2 · g1_boundaries.py)
  · 군별 농경지  landxi/v3/global/data/district-cropland-2025.json
                 (Sentinel-2 10 m AI 토지피복 2025 · 경작지 등급 · 군 폴리곤 안 면적 — server/pipelines/global/g6_district_cropland.py)
산출: landxi/v3/main/data/kgz-crop-2025.json — 군마다 {name, crop_ha, share(군 면적 대비 농경지 비율)} + 합계(total_ha · n · year · as_of · basis).
군 면적은 WGS84 타원체 면적(pyproj Geod). 공개 영상 · 공개 결과만(Sentinel-2 · Esri/IO 토지피복 CC BY 4.0).
실행: python landxi/v3/main/tools/build-kgz.py
"""
import json
from pathlib import Path

from pyproj import Geod
from shapely.geometry import shape

ROOT = Path(__file__).resolve().parents[3]          # landxi/
ADM2 = ROOT / "global" / "data" / "kgz-adm2.geojson"
CROP = ROOT / "v3" / "global" / "data" / "district-cropland-2025.json"
OUT = ROOT / "v3" / "main" / "data" / "kgz-crop-2025.json"

geod = Geod(ellps="WGS84")
adm = json.loads(ADM2.read_text(encoding="utf-8"))
crop = json.loads(CROP.read_text(encoding="utf-8"))
ds = crop["districts"]


def rnd(c):
    return [rnd(x) for x in c] if isinstance(c[0], list) else [round(c[0], 4), round(c[1], 4)]


feats, total, as_of = [], 0, None
for f in adm["features"]:
    code = f["properties"]["code"]
    d = ds.get(code)
    if not d:
        continue
    area_ha = abs(geod.geometry_area_perimeter(shape(f["geometry"]))[0]) / 1e4
    ha = d["crop_ha"]["value"]
    total += ha
    as_of = as_of or d["crop_ha"].get("as_of")
    feats.append({"type": "Feature", "properties": {"name": f["properties"]["name"], "crop_ha": ha, "share": round(ha / area_ha, 4) if area_ha else 0},
                  "geometry": {"type": f["geometry"]["type"], "coordinates": rnd(f["geometry"]["coordinates"])}})

out = {"year": crop.get("year"), "as_of": as_of, "basis": "estimate", "license": crop.get("license"),
       "source": "Sentinel-2 10 m AI land cover · cropland class · district polygon",
       "total_ha": total, "n": len(feats), "geojson": {"type": "FeatureCollection", "features": feats}}
OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print("kgz-crop", len(feats), "districts", total, "ha", OUT.stat().st_size, "bytes")
