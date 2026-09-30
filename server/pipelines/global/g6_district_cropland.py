"""G6 · 해외 구역(ADM2)별 AI 경작지 면적 — 구역 대장(신고 농지 면적) 대조의 'AI 값'(r3-global · C4 최소).

실행: python -m server.pipelines.global.g6_district_cropland [--year 2025] [--px 40] [--refresh]
산출: district-cropland-{year}.json — 구역 id → {name, iso, crop_ha(봉투), valid_share, px_m}
      정본 LX_DATA_ROOT/global/ + 화면 사본 landxi/v3/global/data/
원천: Sentinel-2 10 m AI 토지피복(Esri/Impact Observatory 딥러닝 모델) exportImage · renderingRule=None(원 클래스 값) · 최근접 리샘플.
      클래스 5(Crops) 화소 × 화소 면적(위도별) · 구역 폴리곤 안만 · 구름(10)·nodata(0) 제외.
구역 목록 = 해외 도구(global_.districts)와 같은 경계 파일 — 지역 이름 하드코딩 0. 원천 응답은 raw/ 캐시(멱등).
"""
from __future__ import annotations

import argparse
import importlib
import io
import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "server"))
G = importlib.import_module("server.adapters.global")

SVC = "https://ic.imagery1.arcgis.com/arcgis/rest/services/Sentinel2_10m_LandCover/ImageServer/exportImage"
CROPS, CLOUD, NODATA = 5, 10, 0
MAXPX = 4000
SCREEN_V3 = ROOT / "landxi" / "v3" / "global" / "data"
SRC = "Sentinel-2 10 m AI land cover · cropland class"


def year_time(y: int) -> str:
    a = int(datetime(y, 1, 1, tzinfo=timezone.utc).timestamp() * 1000)
    b = int(datetime(y, 12, 31, 23, 59, 59, tzinfo=timezone.utc).timestamp() * 1000)
    return f"{a},{b}"


def size_for(b, px_m: float) -> tuple[int, int]:
    lat0 = (b[1] + b[3]) / 2
    w_m = (b[2] - b[0]) * 111_320.0 * math.cos(math.radians(lat0))
    h_m = (b[3] - b[1]) * 111_320.0
    return max(8, min(MAXPX, math.ceil(w_m / px_m))), max(8, min(MAXPX, math.ceil(h_m / px_m)))


def crop_area(d: dict, year: int, px_m: float, refresh: bool) -> dict:
    """구역 한 곳 — (경작지 ha, 유효 화소 비율, 실제 화소 크기 m)."""
    import numpy as np
    import rasterio
    from rasterio.features import geometry_mask
    from rasterio.transform import from_bounds
    from shapely.geometry import mapping

    b = d["bbox"]
    W, H = size_for(b, px_m)
    q = (f"?bbox={b[0]},{b[1]},{b[2]},{b[3]}&bboxSR=4326&imageSR=4326&size={W},{H}"
         f"&format=tiff&pixelType=U8&interpolation=RSP_NearestNeighbor&renderingRule=%7B%22rasterFunction%22%3A%22None%22%7D"
         f"&time={year_time(year)}&f=image")
    raw, meta = G.cached_fetch(SVC + q, f"esri-lulc-{year}-{d['id']}-{W}x{H}.tif", refresh=refresh, timeout=300)
    with rasterio.open(io.BytesIO(raw)) as ds:
        arr = np.asarray(ds.read(1))
    H, W = arr.shape
    tr = from_bounds(b[0], b[1], b[2], b[3], W, H)
    inside = geometry_mask([mapping(d["geom"])], out_shape=(H, W), transform=tr, invert=True)
    # 화소 면적(위도별 · m²)
    lats = b[3] - (np.arange(H) + 0.5) * (b[3] - b[1]) / H
    dx = (b[2] - b[0]) / W * 111_320.0 * np.cos(np.radians(lats))
    dy = (b[3] - b[1]) / H * 111_320.0
    area_row = (dx * dy)[:, None]                                    # (H,1) m²
    valid = inside & (arr != NODATA) & (arr != CLOUD)
    n_in = int(inside.sum())
    crop_m2 = float((area_row * ((arr == CROPS) & valid)).sum())
    valid_share = float(valid.sum()) / n_in if n_in else 0.0
    px = float(math.sqrt(float(dx.mean()) * dy))
    return {"crop_ha": crop_m2 / 10_000.0, "valid_share": valid_share, "px_m": px, "fetched_at": meta.get("fetched_at")}


def main(year: int = 2025, px_m: float = 40.0, refresh: bool = False, only: list[str] | None = None):
    from agent.tools.ext import global_ as GL
    out: dict = {}
    ds = [d for d in GL.districts() if not only or d["name"] in only or d["id"] in only]
    fetched = []
    for k, d in enumerate(ds, 1):
        try:
            r = crop_area(d, year, px_m, refresh)
        except Exception as e:  # noqa: BLE001 — 한 구역 실패가 나머지를 막지 않는다(값 없음 = 비교 안 함)
            print(f"[{k}/{len(ds)}] {d['name']}: 실패 {type(e).__name__}: {str(e)[:120]}", flush=True)
            continue
        fetched.append(r["fetched_at"] or "")
        as_of = (r["fetched_at"] or G.now_iso())[:10]
        out[d["id"]] = {"name": d["name"], "iso": d["iso"],
                        "crop_ha": G.env(round(r["crop_ha"]), "ha", "estimate", f"{SRC} · {year}", as_of=as_of,
                                         note=f"10 m map sampled at about {round(r['px_m'])} m · district polygon"),
                        "valid_share": round(r["valid_share"], 3), "px_m": round(r["px_m"], 1)}
        print(f"[{k}/{len(ds)}] {d['name']}: {r['crop_ha']:.0f} ha · valid {r['valid_share']:.2f} · {r['px_m']:.0f} m", flush=True)
    doc = {"source": SVC, "year": year, "class": {"crops": CROPS, "excluded": [NODATA, CLOUD]},
           "license": "CC BY 4.0 · Impact Observatory, Microsoft, and Esri", "px_target_m": px_m,
           "fetched_at": max(fetched) if fetched else None, "districts": out}
    name = f"district-cropland-{year}.json"
    G.write_out(name, doc, screen=False)
    SCREEN_V3.mkdir(parents=True, exist_ok=True)
    (SCREEN_V3 / name).write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(out)}/{len(ds)} districts → {name}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--year", type=int, default=2025)
    ap.add_argument("--px", type=float, default=40.0)
    ap.add_argument("--refresh", action="store_true")
    ap.add_argument("--only", nargs="*")
    a = ap.parse_args()
    main(a.year, a.px, a.refresh, a.only)
