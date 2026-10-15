"""나라 전체 대조 — 군마다 공개 판정(Esri/Impact Observatory 2025 · ESA WorldCover 2021)의 경작지 · 시가지 · 물 넓이(약 40 m 표본 · 위도 보정 화소 넓이).

  python -m overseas.compare            → 02. 데이터/overseas/{나라}/{연도}/public-compare.json (+ 우리 결과 장부와 나란히 표)
CPU · 네트워크만(키 없음). 우리 숫자는 결과 장부(overseas_cells.counts) 한 출처.
"""
from __future__ import annotations

import datetime as dt
import json
import math
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import numpy as np  # noqa: E402
from national.common import pg  # noqa: E402
from overseas.dataset import ESRI, WC_URL, wc_tiles  # noqa: E402
from overseas.runner import root  # noqa: E402

PX_DEG = 1 / 3000                    # 약 37 m(위도) — WorldCover 원 해상도의 1/4
ESRI_CLS = {"경작지": [5], "시가지": [7], "물": [1, 4]}
WC_CLS = {"경작지": [40], "시가지": [50], "물": [80, 90]}


def px_area(lat_rows: np.ndarray, d: float) -> np.ndarray:
    return (d * 111_320.0 * np.cos(np.radians(lat_rows))) * (d * 110_574.0)


def esri_bbox(b, year: int) -> np.ndarray:
    W, H = int(math.ceil((b[2] - b[0]) / PX_DEG)), int(math.ceil((b[3] - b[1]) / PX_DEG))
    out = np.zeros((H, W), np.uint8)
    a = int(dt.datetime(year, 1, 1, tzinfo=dt.timezone.utc).timestamp() * 1000)
    z = int(dt.datetime(year, 12, 31, 23, 59, 59, tzinfo=dt.timezone.utc).timestamp() * 1000)
    from rasterio.io import MemoryFile
    step = 3000
    for r0 in range(0, H, step):
        for c0 in range(0, W, step):
            h, w = min(step, H - r0), min(step, W - c0)
            bb = (b[0] + c0 * PX_DEG, b[3] - (r0 + h) * PX_DEG, b[0] + (c0 + w) * PX_DEG, b[3] - r0 * PX_DEG)
            u = (f"{ESRI}?bbox={bb[0]},{bb[1]},{bb[2]},{bb[3]}&bboxSR=4326&imageSR=4326&size={w},{h}&format=tiff&pixelType=U8"
                 f"&interpolation=RSP_NearestNeighbor&renderingRule=%7B%22rasterFunction%22%3A%22None%22%7D&time={a},{z}&f=image")
            for k in range(5):
                try:
                    with MemoryFile(urllib.request.urlopen(u, timeout=180).read()) as mf, mf.open() as ds:
                        out[r0:r0 + h, c0:c0 + w] = ds.read(1)[:h, :w]
                    break
                except Exception:  # noqa: BLE001
                    if k == 4:
                        raise
                    time.sleep(5 * (k + 1))
    return out


def wc_bbox(b, year: int = 2021) -> np.ndarray:
    import rasterio
    from rasterio.windows import from_bounds
    W, H = int(math.ceil((b[2] - b[0]) / PX_DEG)), int(math.ceil((b[3] - b[1]) / PX_DEG))
    out = np.zeros((H, W), np.uint8)
    for t in wc_tiles(b):
        try:
            with rasterio.open("/vsicurl/" + WC_URL[year].format(t=t)) as ds:
                l, bo, r, tp = ds.bounds
                il, ir, it_, ib = max(b[0], l), min(b[2], r), min(b[3], tp), max(b[1], bo)
                if il >= ir or ib >= it_:
                    continue
                c0, c1 = int(round((il - b[0]) / PX_DEG)), int(round((ir - b[0]) / PX_DEG))
                r0, r1 = int(round((b[3] - it_) / PX_DEG)), int(round((b[3] - ib) / PX_DEG))
                a = ds.read(1, window=from_bounds(il, ib, ir, it_, ds.transform), out_shape=(r1 - r0, c1 - c0))
                out[r0:r1, c0:c1] = np.where(a > 0, a, out[r0:r1, c0:c1])
        except Exception as e:  # noqa: BLE001
            if "404" not in str(e) and "not recognized" not in str(e):
                raise
    return out


def areas(arr, b, geom, cls_map) -> dict:
    from rasterio.features import geometry_mask
    from rasterio.transform import from_origin
    from shapely.geometry import mapping
    tr = from_origin(b[0], b[3], PX_DEG, PX_DEG)
    inside = ~geometry_mask([mapping(geom)], out_shape=arr.shape, transform=tr)
    lat = b[3] - (np.arange(arr.shape[0]) + 0.5) * PX_DEG
    pa = px_area(lat, PX_DEG)[:, None]
    valid = inside & (arr > 0)
    out = {k: round(float(((np.isin(arr, v) & inside) * pa).sum()) / 1e6, 2) for k, v in cls_map.items()}
    out["판정 화소 비율"] = round(float(valid.sum() / max(1, inside.sum())), 4)
    return out


def main(country: str = "kgz", year: int = 2025):
    import os
    from shapely import wkt
    os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
    out_p = root(country, year) / "public-compare.json"
    have = json.loads(out_p.read_text(encoding="utf-8")) if out_p.exists() else {"cells": {}}
    with pg() as c:
        cells = c.execute("SELECT cell_cd, name, adm1_name, ST_AsText(geom), area_km2 FROM overseas_cells WHERE country=%s AND year=%s ORDER BY ord",
                          (country, year)).fetchall()
    for cd, name, a1, gw, km2 in cells:
        if cd in have["cells"]:
            continue
        g = wkt.loads(gw)
        b = [math.floor(v * 1000) / 1000 if i < 2 else math.ceil(v * 1000) / 1000 for i, v in enumerate(g.bounds)]
        t0 = time.time()
        e = areas(esri_bbox(b, year), b, g, ESRI_CLS)
        w = areas(wc_bbox(b, 2021), b, g, WC_CLS)
        have["cells"][cd] = {"name": name, "adm1": a1, "area_km2": float(km2), f"esri{year}": e, "worldcover2021": w}
        print(f"{name} {time.time() - t0:.0f}s esri {e} wc {w}", flush=True)
        out_p.write_text(json.dumps(have, ensure_ascii=False, indent=1), encoding="utf-8")
    tot = {}
    for src in (f"esri{year}", "worldcover2021"):
        tot[src] = {k: round(sum(v[src][k] for v in have["cells"].values()), 1) for k in ESRI_CLS}
    have["total"] = tot
    have["made_at"] = dt.datetime.now().isoformat(timespec="seconds")
    have["method"] = f"약 {PX_DEG * 110574:.0f} m 표본 · 위도 보정 화소 넓이 · 군 경계 안 · Esri = Sentinel2_10m_LandCover exportImage(키 없음) · WorldCover = AWS 공개 COG"
    out_p.write_text(json.dumps(have, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps(tot, ensure_ascii=False))


def table(country: str = "kgz", year: int = 2025) -> dict:
    """끝난 칸만 — 우리 결과 장부(overseas_cells.counts) · Esri 2025 · WorldCover 2021 넓이(㎢) 나란히."""
    from overseas.runner import summary
    pub = json.loads((root(country, year) / "public-compare.json").read_text(encoding="utf-8"))["cells"]
    s = summary(country, year)
    rows, tot = [], {k: {"ours": 0.0, f"esri{year}": 0.0, "worldcover2021": 0.0} for k in ESRI_CLS}
    for r in s["per_cell"]:
        p = pub.get(r["cell"])
        if not p:
            continue
        row = {"cell": r["cell"], "name": r["name"], "adm1": r["adm1"], "area_km2": r["area_km2"]}
        for k in ESRI_CLS:
            o = float(((r["counts"] or {}).get(k) or {}).get("km2") or 0)
            row[k] = {"ours": round(o, 1), f"esri{year}": p[f"esri{year}"][k], "worldcover2021": p["worldcover2021"][k]}
            tot[k]["ours"] += o
            tot[k][f"esri{year}"] += p[f"esri{year}"][k]
            tot[k]["worldcover2021"] += p["worldcover2021"][k]
        rows.append(row)
    out = {"cells_done": len(rows), "cells_total": sum(v["n"] for v in s["cells"].values()),
           "total": {k: {kk: round(vv, 1) for kk, vv in v.items()} for k, v in tot.items()}, "rows": rows,
           "made_at": dt.datetime.now().isoformat(timespec="seconds")}
    (root(country, year) / "national-compare.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    return out


if __name__ == "__main__":
    if "--table" in sys.argv:
        print(json.dumps(table()["total"], ensure_ascii=False))
    else:
        main()
