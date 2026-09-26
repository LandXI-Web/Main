"""G3 · Esri/Impact Observatory Sentinel-2 10m LULC 2017 vs 2025 — built(7) 500 m 격자(F1-D 브리프 §0).

실행: python -m server.pipelines.global.g3_esri_lulc [--refresh]
산출: kgz-sprawl-2017-2025.json — 소쿨룩·비슈케크·알라무둔 평원 500 m 격자의 built 비율(2017 · 2025 · delta 봉투 measured)
      + 필라멘트용 셀 중심 · 요약(격자 합 km²) · 출처 URL·time 파라미터
원천: exportImage renderingRule=None(원 클래스 값) · format=tiff · 최근접 리샘플(≈13 m). 응답은 raw/ 캐시(멱등).
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

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
G = importlib.import_module("server.adapters.global")

SVC = "https://ic.imagery1.arcgis.com/arcgis/rest/services/Sentinel2_10m_LandCover/ImageServer/exportImage"
BBOX = [74.15, 42.74, 74.80, 43.02]            # 소쿨룩 평원 + 비슈케크 + 알라무둔 (남쪽 산지 제외)
SIZE = (4000, 2300)                            # ≈13.2 × 13.5 m 픽셀(서비스 한도 4000)
CELL_M = 500
BUILT = 7
CLASSES = {1: "Water", 2: "Trees", 4: "Flooded vegetation", 5: "Crops", 7: "Built area", 8: "Bare ground", 9: "Snow/ice", 10: "Clouds", 11: "Rangeland"}


def year_time(y: int) -> str:
    a = int(datetime(y, 1, 1, tzinfo=timezone.utc).timestamp() * 1000)
    b = int(datetime(y, 12, 31, 23, 59, 59, tzinfo=timezone.utc).timestamp() * 1000)
    return f"{a},{b}"


def fetch_year(y: int, refresh: bool):
    import numpy as np
    import rasterio
    q = (f"?bbox={BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]}&bboxSR=4326&imageSR=4326&size={SIZE[0]},{SIZE[1]}"
         f"&format=tiff&pixelType=U8&interpolation=RSP_NearestNeighbor&renderingRule=%7B%22rasterFunction%22%3A%22None%22%7D"
         f"&time={year_time(y)}&f=image")
    raw, meta = G.cached_fetch(SVC + q, f"esri-lulc-{y}.tif", refresh=refresh, timeout=300)
    with rasterio.open(io.BytesIO(raw)) as ds:
        arr = ds.read(1)
    return np.asarray(arr), meta


def main(refresh: bool = False):
    import numpy as np
    a17, m17 = fetch_year(2017, refresh)
    a25, m25 = fetch_year(2025, refresh)
    assert a17.shape == a25.shape, (a17.shape, a25.shape)
    H, W = a17.shape
    lat0 = (BBOX[1] + BBOX[3]) / 2
    dlat = CELL_M / 111_320.0
    dlon = CELL_M / (111_320.0 * math.cos(math.radians(lat0)))
    nx = int(math.floor((BBOX[2] - BBOX[0]) / dlon))
    ny = int(math.floor((BBOX[3] - BBOX[1]) / dlat))
    px_lon = (BBOX[2] - BBOX[0]) / W
    px_lat = (BBOX[3] - BBOX[1]) / H
    cells, feats = [], []
    tot17 = tot25 = 0.0
    hist17 = {int(k): int(v) for k, v in zip(*np.unique(a17, return_counts=True))}
    hist25 = {int(k): int(v) for k, v in zip(*np.unique(a25, return_counts=True))}
    as_of = G.now_iso()[:10]
    for j in range(ny):
        for i in range(nx):
            x0 = BBOX[0] + i * dlon
            y1 = BBOX[3] - j * dlat
            c0 = int((x0 - BBOX[0]) / px_lon); c1 = int((x0 + dlon - BBOX[0]) / px_lon)
            r0 = int((BBOX[3] - y1) / px_lat); r1 = int((BBOX[3] - (y1 - dlat)) / px_lat)
            w17 = a17[r0:r1, c0:c1]; w25 = a25[r0:r1, c0:c1]
            valid = (w17 != 0) & (w25 != 0) & (w17 != 10) & (w25 != 10)
            n = int(valid.sum())
            if n < 0.5 * w17.size:
                continue
            b17 = float(((w17 == BUILT) & valid).sum()) / n
            b25 = float(((w25 == BUILT) & valid).sum()) / n
            cell_km2 = (CELL_M / 1000) ** 2
            tot17 += b17 * cell_km2; tot25 += b25 * cell_km2
            if b17 == 0 and b25 == 0:
                continue
            x1 = x0 + dlon; y0 = y1 - dlat
            props = {"id": f"r{j:03d}c{i:03d}", "b17": round(100 * b17, 1), "b25": round(100 * b25, 1), "d": round(100 * (b25 - b17), 1)}
            feats.append({"type": "Feature", "id": len(feats), "properties": props,
                          "geometry": {"type": "Polygon", "coordinates": [G.rnd([[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]], 5)]}})
    src = "Esri/IO Sentinel-2 10 m LULC exportImage · 2017 vs 2025 · 500 m grid"
    doc = {
        "source": SVC, "source_params": {"bbox": BBOX, "size": SIZE, "time_2017": year_time(2017), "time_2025": year_time(2025),
                                          "renderingRule": "None", "interpolation": "RSP_NearestNeighbor", "class_built": BUILT},
        "fetched_at": max(m17["fetched_at"], m25["fetched_at"]),
        "license": "CC BY 4.0 · Impact Observatory, Microsoft, and Esri",
        "cell_m": CELL_M, "bbox": BBOX,
        "note": "픽셀 ≈13 m 최근접 리샘플 → 셀 비율은 근사 · 구름(10)·nodata 제외 · Esri 연도 모델 차이가 델타에 섞임",
        "summary": {
            "built_2017_km2": G.env(round(tot17, 1), "km2", "measured", src, as_of=as_of, note="500 m grid sum · approx."),
            "built_2025_km2": G.env(round(tot25, 1), "km2", "measured", src, as_of=as_of, note="500 m grid sum · approx."),
            "delta_km2": G.env(round(tot25 - tot17, 1), "km2", "measured", src, as_of=as_of, note="2025 − 2017 · approx. · model-year differences included"),
            "cells": G.env(len(feats), "count", "measured", src, as_of=as_of, note="cells with built > 0"),
        },
        "class_hist": {"2017": hist17, "2025": hist25, "names": CLASSES},
        "grid": {"type": "FeatureCollection", "features": feats},
    }
    G.write_out("kgz-sprawl-2017-2025.json", doc)
    print(f"grid {nx}x{ny} kept {len(feats)} · built 2017 {tot17:.1f} km² → 2025 {tot25:.1f} km²")
    print("hist17", hist17); print("hist25", hist25)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true")
    main(ap.parse_args().refresh)
