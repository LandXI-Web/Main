"""메인 마지막 해외 장면(ch6) — 키르기스스탄 군(ADM2)별 농경지 분석 결과의 공개 사본(10-11 메인 지시 5).

원천(이미 이 PC 에 있는 실제 분석 결과 — 지어낸 숫자 0):
  · 군 경계      landxi/global/data/kgz-adm2.geojson        (geoBoundaries KGZ ADM2 · g1_boundaries.py)
  · 군별 농경지  landxi/v3/global/data/district-cropland-2025.json
                 (Sentinel-2 10 m AI 토지피복 2025 · 경작지 등급 · 군 폴리곤 안 면적 — server/pipelines/global/g6_district_cropland.py)
산출: landxi/v3/main/data/kgz-crop-2025.json — 군마다 {name, crop_ha, share(군 면적 대비 농경지 비율)} + 합계(total_ha · n · year · as_of · basis).
군 면적은 WGS84 타원체 면적(pyproj Geod). 공개 영상 · 공개 결과만(Sentinel-2 · Esri/IO 토지피복 CC BY 4.0).
확대 장면(10-11 12:07 메인-5 · 원칙 190): 경작지 면적이 가장 큰 군 하나(데이터로 고름 — 이름 하드코딩 0)의 실제 판정 화소를
  그 군 원천 영상(02. 데이터/global/raw/esri-lulc-{year}-{군 id}-*.tif · 경작지 등급 5)에서 군 폴리곤 안만 청록 칸으로 굽는다
  → data/kgz-crop-focus.png(투명 바탕) · 자리 · 이름 · 면적은 산출 JSON 의 focus 에.
실행: python landxi/v3/main/tools/build-kgz.py
"""
import json
import os
from pathlib import Path

import numpy as np

from pyproj import Geod
from shapely.geometry import shape

ROOT = Path(__file__).resolve().parents[3]          # landxi/
ADM2 = ROOT / "global" / "data" / "kgz-adm2.geojson"
CROP = ROOT / "v3" / "global" / "data" / "district-cropland-2025.json"
OUT = ROOT / "v3" / "main" / "data" / "kgz-crop-2025.json"
PNG = ROOT / "v3" / "main" / "data" / "kgz-crop-focus.png"
RAW = Path(os.environ.get("LX_DATA_ROOT", str(ROOT.parents[1] / "02. 데이터"))) / "global" / "raw"

geod = Geod(ellps="WGS84")
adm = json.loads(ADM2.read_text(encoding="utf-8"))
crop = json.loads(CROP.read_text(encoding="utf-8"))
ds = crop["districts"]


def rnd(c):
    return [rnd(x) for x in c] if isinstance(c[0], list) else [round(c[0], 4), round(c[1], 4)]


feats, total, as_of, best = [], 0, None, None
for f in adm["features"]:
    code = f["properties"]["code"]
    d = ds.get(code)
    if not d:
        continue
    area_ha = abs(geod.geometry_area_perimeter(shape(f["geometry"]))[0]) / 1e4
    ha = d["crop_ha"]["value"]
    total += ha
    if not best or ha > best[1]:
        best = (f, ha, code, area_ha)
    as_of = as_of or d["crop_ha"].get("as_of")
    feats.append({"type": "Feature", "properties": {"name": f["properties"]["name"], "crop_ha": ha, "share": round(ha / area_ha, 4) if area_ha else 0},
                  "geometry": {"type": f["geometry"]["type"], "coordinates": rnd(f["geometry"]["coordinates"])}})



def focus_png(f, code, year):
    """그 군 원천 판정(경작지 = 5)을 폴리곤 안만 청록 칸으로(나머지 투명) — 자리(bbox)는 원천 요청 범위 그대로."""
    import rasterio
    from PIL import Image
    from rasterio.features import geometry_mask
    from rasterio.transform import from_bounds
    from shapely.geometry import mapping
    tifs = sorted(RAW.glob(f"esri-lulc-{year}-{code}-*.tif"))
    if not tifs:
        return None
    meta = json.loads(Path(str(tifs[0]) + ".meta.json").read_text(encoding="utf-8")) if Path(str(tifs[0]) + ".meta.json").exists() else {}
    with rasterio.open(tifs[0]) as ds:
        arr = ds.read(1)
        b = list(ds.bounds)
    H, W = arr.shape
    inside = geometry_mask([mapping(shape(f["geometry"]))], out_shape=(H, W), transform=from_bounds(*b, W, H), invert=True)
    on = inside & (arr == 5)
    rgba = np.zeros((H, W, 4), np.uint8)
    rgba[on] = (15, 169, 160, 150)                                      # AI 결과 청록(법전 §1 · kit/stage LOOK.ai)
    Image.fromarray(rgba, "RGBA").save(PNG, optimize=True)
    return {"bbox": [round(v, 5) for v in b], "px": [W, H], "fetched_at": meta.get("fetched_at")}


out = {"year": crop.get("year"), "as_of": as_of, "basis": "estimate", "license": crop.get("license"),
       "source": "Sentinel-2 10 m AI land cover · cropland class · district polygon",
       "total_ha": total, "n": len(feats), "geojson": {"type": "FeatureCollection", "features": feats}}
if best:
    f, ha, code, area_ha = best
    fp = focus_png(f, code, crop.get("year") or 2025)
    if fp:
        out["focus"] = {"name": f["properties"]["name"], "crop_ha": ha, "share": round(ha / area_ha, 4), "area_ha": round(area_ha),
                        "png": PNG.name, "cell_m": round(ds[code].get("px_m") or 40), **fp}
OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print("kgz-crop", len(feats), "districts", total, "ha", OUT.stat().st_size, "bytes")
