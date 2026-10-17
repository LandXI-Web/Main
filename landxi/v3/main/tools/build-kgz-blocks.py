"""XI맵 해외 — 키르기스스탄 구획 단위 결과(바퀴 5 · 10-11 18:52 'XI맵-해외 필지 단위로 디테일하게').

이 PC 에 키르기스스탄 필지(지적) 경계 자료는 없다(조사 10-11). 그래서 공개 구획 경계에 AI 판정 화소를 묶는다:
  · 구획 경계  OpenStreetMap landuse=farmland 면(추이 주 평야 범위 · Overpass 로 10-11 받음 · ODbL)
               → 02. 데이터/global/raw/osm-farmland-chuy-2026-10-11.json
  · AI 판정    Sentinel-2 10 m AI 토지피복 2025(Esri/Impact Observatory · CC BY 4.0) 경작지 등급 5 — 약 13 m 화소
               → 02. 데이터/global/raw/esri-lulc-2025.tif (g3 산출 · EPSG:4326)
  · 군 이름    landxi/global/data/kgz-adm2.geojson(geoBoundaries)
산출: landxi/v3/main/data/kgz-blocks-2025.json — 구획마다 {id, district, area_ha, crop_ha, share, px} · 화소를 세지 못한 구획(영상 밖)은 뺀다.
  면적 = WGS84 타원체 면적(pyproj Geod) · 경작지 = 구획 안 경작지 화소 수 × 화소 면적(그 위도의 타원체 면적).
  구획은 '필지'가 아니라 OSM 에 그려진 농경지 묶음이다(화면에도 '구획'으로 쓴다). 지어낸 숫자 0.
실행: python landxi/v3/main/tools/build-kgz-blocks.py
"""
import json
import os
from pathlib import Path

import numpy as np
import rasterio
from rasterio.features import geometry_mask
from pyproj import Geod
from shapely.geometry import Polygon, mapping, shape

ROOT = Path(__file__).resolve().parents[3]          # landxi/
RAW = Path(os.environ.get("LX_DATA_ROOT", str(ROOT.parents[1] / "02. 데이터"))) / "global" / "raw"
OSM = RAW / "osm-farmland-chuy-2026-10-11.json"
OURS = Path(os.environ.get("LX_DATA_ROOT", str(ROOT.parents[1] / "02. 데이터"))) / "overseas" / "kgz" / "2025" / "publish" / "crop-blocks.tif"
TIF = OURS if OURS.exists() else RAW / "esri-lulc-2025.tif"          # 10-17(원칙 269): 우리 해외 모델 결과(같은 격자 · 경작지 = 5)가 있으면 그것
ADM2 = ROOT / "global" / "data" / "kgz-adm2.geojson"
OUT = ROOT / "v3" / "main" / "data" / "kgz-blocks-2025.json"
geod = Geod(ellps="WGS84")


def rnd(c):
    return [rnd(x) for x in c] if isinstance(c[0], (list, tuple)) else [round(c[0], 5), round(c[1], 5)]


osm = json.loads(OSM.read_text(encoding="utf-8"))
adm = [(f["properties"].get("shapeName") or f["properties"].get("name"), shape(f["geometry"])) for f in json.loads(ADM2.read_text(encoding="utf-8"))["features"]]
src = rasterio.open(TIF)
arr = src.read(1)
T = src.transform
px_deg = abs(T.a) * abs(T.e)
feats, tot_crop, tot_area = [], 0.0, 0.0
for e in osm["elements"]:
    g = e.get("geometry") or []
    if len(g) < 4:
        continue
    poly = Polygon([(x["lon"], x["lat"]) for x in g])
    if not poly.is_valid:
        poly = poly.buffer(0)
    if poly.is_empty:
        continue
    b = poly.bounds
    if b[0] < src.bounds.left or b[2] > src.bounds.right or b[1] < src.bounds.bottom or b[3] > src.bounds.top:
        continue                                      # 영상 밖(일부라도) — 세지 않는다
    r0, c0 = src.index(b[0], b[3])
    r1, c1 = src.index(b[2], b[1])
    r0, c0, r1, c1 = max(r0, 0), max(c0, 0), min(r1 + 1, arr.shape[0]), min(c1 + 1, arr.shape[1])
    if r1 <= r0 or c1 <= c0:
        continue
    win = arr[r0:r1, c0:c1]
    wt = rasterio.windows.transform(rasterio.windows.Window(c0, r0, c1 - c0, r1 - r0), T)
    inside = ~geometry_mask([mapping(poly)], out_shape=win.shape, transform=wt, all_touched=False)
    n_in = int(inside.sum())
    if n_in == 0:
        continue
    n_crop = int(((win == 5) & inside).sum())
    area_ha = abs(geod.geometry_area_perimeter(poly)[0]) / 1e4
    share = n_crop / n_in
    crop_ha = area_ha * share                         # 구획 면적 × 경작지 화소 비율(화소 면적 차이를 구획 면적에 맞춘다)
    c = poly.representative_point()
    dist = next((nm for nm, gg in adm if gg.contains(c)), None)
    simp = poly.simplify(0.00003, preserve_topology=True)
    feats.append({"type": "Feature", "id": e["id"], "geometry": {"type": "Polygon", "coordinates": [rnd(list(map(list, simp.exterior.coords)))]} if simp.geom_type == "Polygon" else json.loads(json.dumps(mapping(simp))),
                  "properties": {"id": e["id"], "district": dist, "area_ha": round(area_ha, 1), "crop_ha": round(crop_ha, 1), "share": round(share, 3), "px": n_in}})
    tot_crop += crop_ha
    tot_area += area_ha
cell_m = round((abs(T.a) * 111320 * np.cos(np.radians((src.bounds.top + src.bounds.bottom) / 2)) * abs(T.e) * 110574) ** 0.5, 1)
JUDGE = ("Land-XI 해외 모델(Sentinel-2 달별 합성 2025 · 10 m) 경작지" if TIF == OURS else
         "Sentinel-2 10 m AI 토지피복 2025 경작지(Esri/Impact Observatory · CC BY 4.0)")
import datetime as _dt
out = {"year": 2025, "basis": "inferred", "as_of": _dt.date.today().isoformat() if TIF == OURS else "2026-10-11",
       "source": "구획 = OpenStreetMap 농경지 면(© OpenStreetMap 기여자 · ODbL) · 판정 = " + JUDGE,
       "note": "필지(지적) 경계가 아니라 OSM 에 그려진 농경지 구획. 경작지 = 구획 안 AI 경작지 화소 비율 × 구획 면적.",
       "cell_m": cell_m, "bbox": [round(v, 4) for v in src.bounds], "n": len(feats), "area_ha": round(tot_area), "crop_ha": round(tot_crop),
       "geojson": {"type": "FeatureCollection", "features": feats}}
OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(OUT, len(feats), round(tot_area), round(tot_crop), cell_m, OUT.stat().st_size)
