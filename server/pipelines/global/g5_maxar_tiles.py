"""G5 · Maxar Open Data 메이크틸라 전(2025-03-06)·후(2025-04-03) visual COG → XYZ WebP z12–17(F1-D 브리프 §0 · 선택).

실행: python -m server.pipelines.global.g5_maxar_tiles [--refresh] [--workers 12]
산출: LX_DATA_ROOT/global/tiles/maxar_meiktila_{pre,post}/{z}/{x}/{y}.webp + tiles/maxar_meiktila.json(메타)
      화면(off)은 /landxi/data/global/tiles/… (junction) · on 은 계약 §4.2 /tiles/xyz/{set}/{z}/{x}/{y}.webp
라이선스: Maxar Open Data **CC BY-NC 4.0** — 시연 한정 · build=export 에서 제외(카탈로그 export_policy 'never').
멱등: 이미 있는 타일은 건너뛴다(--refresh 면 다시 굽는다). 범위 안 모든 타일을 쓴다(빈 곳은 투명) → 404 0.
실패 시: 화면은 S2 전후(PC STAC 사전 2025-03-01/03-27 · 사후 03-29/04-20)로 대체하고 그렇게 표기한다(disaster-swipe.js).
"""
from __future__ import annotations

import argparse
import importlib
import io
import json
import math
import os
import sys
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
G = importlib.import_module("server.adapters.global")

BASE = "https://maxar-opendata.s3.amazonaws.com/events/Earthquake-Myanmar-March-2025/ard/46/"
QK = ["122000331011", "122000331100", "122000331013", "122000331102"]
SETS = {
    "pre": {"date": "2025-03-06", "catalog_id": "103001010E80EA00"},
    "post": {"date": "2025-04-03", "catalog_id": "10300101112F4700"},
}
BOUNDS = [95.858, 20.864, 95.934, 20.937]   # 4 쿼드키 합(두 시점 공통)
ZMIN, ZMAX = 12, 17
_local = threading.local()


def tile_range(z):
    n = 2 ** z
    def tx(lon): return int((lon + 180) / 360 * n)
    def ty(lat): return int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)
    return tx(BOUNDS[0]), ty(BOUNDS[3]), tx(BOUNDS[2]), ty(BOUNDS[1])


def merc_bounds(z, x, y):
    n = 2 ** z
    R = 6378137.0
    size = 2 * math.pi * R / n
    minx = -math.pi * R + x * size
    maxy = math.pi * R - y * size
    return minx, maxy - size, minx + size, maxy


def datasets(key):
    import rasterio
    d = getattr(_local, "ds", None)
    if d is None:
        d = _local.ds = {}
    if key not in d:
        s = SETS[key]
        out = []
        for q in QK:
            url = f"/vsicurl/{BASE}{q}/{s['date']}/{s['catalog_id']}-visual.tif"
            try:
                out.append(rasterio.open(url))
            except Exception:  # noqa: BLE001 — 없는 쿼드키는 건너뜀
                pass
        d[key] = out
    return d[key]


def render(key, z, x, y, root: Path, refresh: bool):
    import numpy as np
    from PIL import Image
    from rasterio.enums import Resampling
    from rasterio.vrt import WarpedVRT
    p = root / str(z) / str(x) / f"{y}.webp"
    if p.exists() and not refresh:
        return "skip"
    b = merc_bounds(z, x, y)
    canvas = np.zeros((4, 256, 256), dtype=np.uint8)
    from rasterio.transform import from_bounds as tfb
    tt = tfb(*b, 256, 256)
    for ds in datasets(key):
        # 타일 격자를 직접 지정한 WarpedVRT — 범위 밖은 0(nodata)
        with WarpedVRT(ds, crs="EPSG:3857", transform=tt, width=256, height=256, resampling=Resampling.bilinear, nodata=0) as vrt:
            arr = vrt.read(indexes=[1, 2, 3])
        m = (arr.sum(axis=0) > 0) & (canvas[3] == 0)
        for i in range(3):
            canvas[i][m] = arr[i][m]
        canvas[3][m] = 255
    p.parent.mkdir(parents=True, exist_ok=True)
    img = Image.fromarray(np.moveaxis(canvas, 0, -1), "RGBA")
    buf = io.BytesIO()
    img.save(buf, "WEBP", quality=82, method=4)
    p.write_bytes(buf.getvalue())
    return "full" if canvas[3].all() else ("empty" if not canvas[3].any() else "part")


def main(refresh=False, workers=12):
    os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
    os.environ.setdefault("CPL_VSIL_CURL_ALLOWED_EXTENSIONS", ".tif")
    os.environ.setdefault("VSI_CACHE", "TRUE")
    os.environ.setdefault("GDAL_HTTP_MULTIRANGE", "YES")
    stats = {}
    for key in SETS:
        root = G.GLOBAL_ROOT / "tiles" / f"maxar_meiktila_{key}"
        jobs = []
        for z in range(ZMIN, ZMAX + 1):
            x0, y0, x1, y1 = tile_range(z)
            jobs += [(z, x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)]
        jobs.sort(key=lambda t: -t[0])
        with ThreadPoolExecutor(workers) as ex:
            res = list(ex.map(lambda t: render(key, *t, root, refresh), jobs))
        stats[key] = {k: res.count(k) for k in set(res)} | {"tiles": len(jobs)}
        print(key, stats[key])
    meta = {"source": BASE + "{quadkey}/{date}/{catalog_id}-visual.tif (Maxar Open Data · Earthquake-Myanmar-March-2025)",
            "fetched_at": G.now_iso(), "license": "CC BY-NC 4.0 (Maxar Open Data) — 비상업 · 시연 한정 · build=export 제외",
            "export_policy": "never", "bounds": BOUNDS, "minzoom": ZMIN, "maxzoom": ZMAX, "sets": SETS, "quadkeys": QK,
            "tiles": "global/tiles/maxar_meiktila_{set}/{z}/{x}/{y}.webp", "stats": stats}
    (G.GLOBAL_ROOT / "tiles").mkdir(parents=True, exist_ok=True)
    old = G.GLOBAL_ROOT / "tiles" / "maxar_meiktila.json"
    if old.exists() and not refresh:
        prev = json.loads(old.read_text(encoding="utf-8"))
        meta["fetched_at"] = prev.get("fetched_at", meta["fetched_at"])
    old.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true")
    ap.add_argument("--workers", type=int, default=12)
    a = ap.parse_args()
    main(a.refresh, a.workers)
