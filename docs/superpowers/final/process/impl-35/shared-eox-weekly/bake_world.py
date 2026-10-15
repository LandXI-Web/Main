"""세계 낮은 줌(0–8) 위성 바탕 — NASA Blue Marble Next Generation(2004-07, 지형 + 수심) → XYZ WebP 조각. CPU 만.
원천: NASA Earth Observatory / Visible Earth (미국 정부 저작물 — 저작권 없음, 상업 포함 이용 · 출처 'NASA Blue Marble').
방법: 8장 JPEG(각 90°×90°, 21600²)에 위치 정보를 붙여 타일형 GeoTIFF → 가상 모자이크 → EPSG:3857 z8 해상도로 덩어리(8×8 조각)씩 변환
      → 밝기 맞춤(감마 · 채도, 해외 Sentinel-2 판과 같은 방향) → 256 조각 → 2×2 줄여 z7·z6·z5 → z0–4 는 z5 조각을 다시 줄여 만든다.
사용: python bake_world.py prep | test | bake | meta     (test = 키르기스스탄 z6–7 비교용 조각만 scratch 에)
"""
import os, sys, json, math, time, glob, datetime
os.environ.setdefault("GDAL_DATA", r"C:\Users\User\anaconda3\envs\gcs\Library\share\gdal")
import numpy as np, rasterio, warnings
warnings.filterwarnings("ignore")
from rasterio.vrt import WarpedVRT
from rasterio.enums import Resampling
from rasterio.windows import Window
from rasterio.transform import from_origin
from PIL import Image
from concurrent.futures import ProcessPoolExecutor

RAW = "E:/Land-XI 플랫폼/02. 데이터/raw/bmng/"
OUT = "E:/Land-XI 플랫폼/02. 데이터/tiles/world-bm/"
SCR = r"C:\Users\User\AppData\Local\Temp\claude\E--Land-XI----\8755e9e1-c9d4-4ccc-ae31-8eb0e35a24df\scratchpad" + "/"
PFX = "world.topo.bathy.200407.3x21600x21600."
BASE = "https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-topography-bathymetry/july/"
Z = 8; N = 2 ** Z; PX = N * 256; ORIG = 20037508.342789244; RES = 2 * ORIG / PX
CH = 8
QUALITY = 82
# 밝기 맞춤 (test 로 정한 값)
TONE = dict(gamma=0.78, sat=1.28, gain=(1.08, 1.05, 1.0), lift=0.0)   # 키르기스스탄 z6 에서 해외 Sentinel-2 판과 맞춤
if os.path.exists(SCR + "tone.json"):
    TONE.update(json.load(open(SCR + "tone.json")))

def prep():
    from osgeo import gdal
    gdal.UseExceptions()
    cols = {"A": -180, "B": -90, "C": 0, "D": 90}; rows = {"1": 90, "2": 0}
    tifs = []
    for c, x0 in cols.items():
        for r, y1 in rows.items():
            src = RAW + f"{PFX}{c}{r}.jpg"; dst = RAW + f"{PFX}{c}{r}.tif"
            tifs.append(dst)
            if os.path.exists(dst): continue
            gdal.Translate(dst, src, outputBounds=[x0, y1, x0 + 90, y1 - 90], outputSRS="EPSG:4326",
                           creationOptions=["TILED=YES", "COMPRESS=DEFLATE", "PREDICTOR=2", "BIGTIFF=IF_SAFER", "NUM_THREADS=4"])
            print("tif", dst, flush=True)
    gdal.BuildVRT(RAW + "bmng.vrt", tifs)

# 바다 — 물은 파랑이 빨강 · 초록보다 뚜렷이 큰 화소. 깊이(파랑 값)에 따라 짙은 남색 → 얕은 대륙붕의 차분한 청록 남색, 해안은 부드럽게 섞는다.
WATER = dict(deep=(18, 32, 58), shelf=(46, 98, 124), b0=38, b1=128, gam=1.25, m0=10, m1=26)

def tone(a):
    """a: (3,H,W) uint8 → uint8 (땅 = 감마 · 채도 맞춤, 물 = 남색 계열)"""
    src = a.astype(np.float32)
    f = src / 255.0
    g = np.array(TONE["gain"], np.float32)[:, None, None]
    f = np.clip(f * g + TONE["lift"], 0, 1) ** TONE["gamma"]
    m = f.mean(0, keepdims=True); f = np.clip(m + (f - m) * TONE["sat"], 0, 1)
    land = f * 255
    W = WATER
    w = np.clip((src[2] - np.maximum(src[0], src[1]) - W["m0"]) / (W["m1"] - W["m0"]), 0, 1)
    s = np.clip((src[2] - W["b0"]) / (W["b1"] - W["b0"]), 0, 1) ** W["gam"]
    deep = np.array(W["deep"], np.float32)[:, None, None]; shelf = np.array(W["shelf"], np.float32)[:, None, None]
    water = deep + (shelf - deep) * s[None]
    out = land * (1 - w[None]) + water * w[None]
    return (out + 0.5).astype(np.uint8)

_ds = None
def _open():
    global _ds
    if _ds is None:
        src = rasterio.open(RAW + "bmng.vrt")
        _ds = WarpedVRT(src, crs="EPSG:3857", transform=from_origin(-ORIG, ORIG, RES, RES), width=PX, height=PX,
                        resampling=Resampling.average, dtype="uint8")
    return _ds

def save(a, z, x, y, root):
    d = f"{root}{z}/{x}"; os.makedirs(d, exist_ok=True)
    Image.fromarray(a.transpose(1, 2, 0)).save(f"{d}/{y}.webp", "WEBP", quality=QUALITY, method=4)

def down(a):  # (3,H,W) → 2×2 평균
    f = a.astype(np.float32)
    f = (f[:, 0::2, 0::2] + f[:, 1::2, 0::2] + f[:, 0::2, 1::2] + f[:, 1::2, 1::2]) / 4
    return (f + 0.5).astype(np.uint8)

def chunk(job):
    cx, cy, root, zmin = job   # cx, cy = 덩어리 번호 (z8 조각 x = cx*8 …)
    ds = _open()
    s = CH * 256
    a = ds.read([1, 2, 3], window=Window(cx * s, cy * s, s, s))
    a = tone(a)
    z = Z
    while z >= zmin and z >= 5:
        t = a.shape[1] // 256
        bx = cx * CH * 2 ** (z - Z) if z <= Z else 0
        bx = (cx * CH) >> (Z - z); by = (cy * CH) >> (Z - z)
        for i in range(t):
            for j in range(t):
                save(a[:, j * 256:(j + 1) * 256, i * 256:(i + 1) * 256], z, bx + i, by + j, root)
        a = down(a); z -= 1
    return cx, cy

def pyramid_low(root):   # z4..z0 : z5 조각 → 줄이기
    for z in range(4, -1, -1):
        n = 2 ** z
        for x in range(n):
            for y in range(n):
                q = np.zeros((3, 512, 512), np.uint8)
                for i in (0, 1):
                    for j in (0, 1):
                        p = f"{root}{z+1}/{2*x+i}/{2*y+j}.webp"
                        q[:, j * 256:(j + 1) * 256, i * 256:(i + 1) * 256] = np.asarray(Image.open(p).convert("RGB")).transpose(2, 0, 1)
                save(down(q), z, x, y, root)

def lon2x(lon, z): return (lon + 180) / 360 * 2 ** z
def lat2y(lat, z): return (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * 2 ** z

if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "bake"
    if cmd == "prep": prep()
    elif cmd == "test":   # 지정 좌표(기본 키르기스스탄 76E 41.5N) 둘레 z5–8 조각만 scratch 에:  test [lon lat 폴더]
        lon, lat = (float(sys.argv[2]), float(sys.argv[3])) if len(sys.argv) > 3 else (76, 41.5)
        root = SCR + (sys.argv[4] if len(sys.argv) > 4 else "test") + "/"; cx = int(lon2x(lon, 8)) // CH; cy = int(lat2y(lat, 8)) // CH
        jobs = [(cx + i, cy + j, root, 5) for i in (-1, 0) for j in (0, 1)]
        with ProcessPoolExecutor(4) as ex: list(ex.map(chunk, jobs))
        print("test ok", cx, cy)
    elif cmd == "bake":
        t0 = time.time(); workers = int(os.environ.get("BM_WORKERS", "12"))
        jobs = [(cx, cy, OUT, 5) for cy in range(N // CH) for cx in range(N // CH)]
        with ProcessPoolExecutor(workers) as ex:
            for k, (cx, cy) in enumerate(ex.map(chunk, jobs, chunksize=4)):
                if k % 64 == 0: print(k, len(jobs), round(time.time() - t0), flush=True)
        pyramid_low(OUT); print("done", round(time.time() - t0))
