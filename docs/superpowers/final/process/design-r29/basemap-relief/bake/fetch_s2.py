"""해외(비슈케크) 정사 바탕 — Sentinel-2 L2A 참색(TCI, 10 m) 한 장면을 범위만 읽어 XYZ 조각(z12–16)으로. CPU 만.
원천: Copernicus Sentinel-2(AWS 공개 · Element84 Earth Search) — Copernicus 자료 이용 조건(무료 · 상업 포함 · 출처 표기).
지금 XI맵 해외 바탕(EOxCloudless)은 비상업 라이선스(상업은 EOX 유료 계약)라 시안 정사 바탕은 원 자료에서 직접 만든다.
사용: python fetch_s2.py"""
import os, math, json, time
os.environ.setdefault("GDAL_DATA", r"C:\Users\User\anaconda3\envs\gcs\Library\share\gdal")
os.environ["GDAL_DISABLE_READDIR_ON_OPEN"] = "EMPTY_DIR"
import numpy as np, rasterio
from rasterio.warp import reproject, Resampling
from rasterio.transform import from_origin
from PIL import Image
import bake as B

SCENE = "S2A_43TDH_20250827_1_L2A"   # 2025-08-27 · 구름 0.0001%
URL = f"/vsicurl/https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/43/T/DH/2025/8/{SCENE}/TCI.tif"
OUT = B.ROOT + "pub/tiles/bishkek-s2"

def main():
    t0 = time.time(); w, s, e, n = B.CITY["bishkek"]["bbox"]
    x0, y0 = B.lonlat2tile(w, n, 12); x1, y1 = B.lonlat2tile(e, s, 12)
    X0, Y0, NX, NY = int(x0), int(y0), int(x1) - int(x0) + 1, int(y1) - int(y0) + 1
    z = 16; f = 16; W, H = NX * f * 256, NY * f * 256
    ox, oy, ts = B.tile_origin(X0 * f, Y0 * f, z); px = ts / 256
    dst = np.zeros((3, H, W), np.uint8)
    with rasterio.open(URL) as d:
        for i in range(3):
            reproject(rasterio.band(d, i + 1), dst[i], dst_transform=from_origin(ox, oy, px, px), dst_crs="EPSG:3857", resampling=Resampling.lanczos)
    a = dst.astype(np.float32) / 255.0
    lo = np.percentile(a, 0.5, axis=(1, 2), keepdims=True); hi = np.percentile(a, 99.6, axis=(1, 2), keepdims=True)
    a = np.clip((a - lo) / (hi - lo), 0, 1) ** 0.9                          # 은은한 대비(참색 유지)
    img = Image.fromarray((a.transpose(1, 2, 0) * 255).astype(np.uint8))
    nt = 0
    for zz in range(12, 17):
        k = 2 ** (z - zz); cur = img.resize((W // k, H // k), Image.LANCZOS) if k > 1 else img
        bx, by = X0 * f // k, Y0 * f // k
        for j in range(cur.height // 256):
            for i in range(cur.width // 256):
                p = f"{OUT}/{zz}/{bx+i}"; os.makedirs(p, exist_ok=True)
                cur.crop((i * 256, j * 256, i * 256 + 256, j * 256 + 256)).save(f"{p}/{by+j}.webp", "WEBP", quality=88, method=4); nt += 1
    json.dump(dict(source="Copernicus Sentinel-2 L2A TCI", scene=SCENE, date="2025-08-27", gsd_m=10, tiles=nt, zooms=[12, 16],
                   baked_at=time.strftime("%Y-%m-%dT%H:%M:%S+09:00"), seconds=round(time.time() - t0)), open(OUT + "/meta.json", "w", encoding="utf8"), ensure_ascii=False, indent=1)
    print("tiles", nt, round(time.time() - t0), "s")

if __name__ == "__main__":
    main()
