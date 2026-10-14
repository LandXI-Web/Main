"""해외 바탕 영상 — Copernicus Sentinel-2 L2A 원 자료로 만든 구름 없는 모자이크(10 m) → XYZ WebP 조각. CPU 만.
원천: AWS 공개 Sentinel-2 L2A COG(Element84 Earth Search STAC · 키 · 계정 없음) — Copernicus 자료 이용 조건(무료 · 상업 포함 · 출처 표기).
방법: 판(set)마다 기간 안 구름 적은 장면을 MGRS 칸마다 몇 장 골라 → 참색(TCI) + 장면 분류(SCL)로 구름 · 그림자 · 권운 · 무자료 가림
      → 화소마다 중앙값 합성 → 나라 판에서 정한 밝기 맞춤(같은 나라 고줌 판도 같은 값) → 256 조각(WebP) + 낮은 줌 피라미드.
      나라 판(낮은 줌)은 COG 내부 축소판(overview)만 읽어 받는 양을 줄인다.
출력: E:/Land-XI 플랫폼/02. 데이터/tiles/overseas-s2/{set}/{z}/{x}/{y}.webp + meta.json (화면 = /landxi/data/tiles/overseas-s2/)
사용: python bake_s2.py [set ...]   (없으면 전부 · 나라 판이 먼저)"""
import os, sys, json, math, time, threading
os.environ.setdefault("GDAL_DATA", r"C:\Users\User\anaconda3\envs\gcs\Library\share\gdal")
os.environ["GDAL_DISABLE_READDIR_ON_OPEN"] = "EMPTY_DIR"
os.environ["CPL_VSIL_CURL_ALLOWED_EXTENSIONS"] = ".tif"
os.environ["GDAL_HTTP_MULTIRANGE"] = "YES"
os.environ["GDAL_HTTP_MERGE_CONSECUTIVE_RANGES"] = "YES"
os.environ["GDAL_HTTP_MAX_RETRY"] = "5"
os.environ["GDAL_HTTP_RETRY_DELAY"] = "2"
os.environ["VSI_CACHE"] = "TRUE"
import numpy as np, rasterio, requests, warnings
warnings.filterwarnings("ignore", category=RuntimeWarning)
from rasterio.vrt import WarpedVRT
from rasterio.enums import Resampling
from rasterio.transform import from_origin
from concurrent.futures import ThreadPoolExecutor, as_completed
from PIL import Image

OUT = "E:/Land-XI 플랫폼/02. 데이터/tiles/overseas-s2/"
STAC = "https://earth-search.aws.element84.com/v1/search"
R = 6378137.0; ORIG = math.pi * R
VALID = np.array([0, 0, 1, 0, 1, 1, 1, 1, 0, 0, 0, 1], bool)   # SCL: 2 어두운 곳 · 4 식생 · 5 맨땅 · 6 물 · 7 미분류 · 11 눈 = 씀 / 0 · 1 · 3 그림자 · 8–10 구름 · 권운 = 가림

# 판 — 나라 판(낮은 줌 · 축소판 읽기)과 구역 판(고줌 · 원 해상도). parent = 밝기 맞춤 값을 물려받는 나라 판.
#  키르기스스탄 여름(6–9월) · 미얀마 건기(11–3월 · 우기 여름은 구름에 덮여 건기로)
SETS = {
    "kg":       dict(name="키르기스스탄", bbox=[67.6, 38.4, 81.4, 44.2], dt="2026-06-01/2026-09-30", z=(5, 10), ov=2, per=3, cc=20),
    "kg-chuy":  dict(name="추이 주(비슈케크 · 소쿨룩 · 으슥아타)", bbox=[74.0, 42.2, 75.3, 43.45], dt="2026-06-01/2026-09-30", z=(11, 14), ov=None, per=6, cc=25, parent="kg"),
    "mm":       dict(name="미얀마", bbox=[92.1, 9.6, 101.2, 28.6], dt="2025-11-01/2026-03-15", z=(5, 9), ov=3, per=3, cc=15),
    "mm-meiktila": dict(name="메이크틸라", bbox=[95.55, 20.6, 96.2, 21.15], dt="2025-11-01/2026-03-15", z=(10, 14), ov=None, per=6, cc=20, parent="mm"),
}
CH = 8   # 한 번에 만드는 덩어리 = 8×8 조각(2048 화소)

def lonlat2tile(lon, lat, z):
    n = 2 ** z
    return (lon + 180) / 360 * n, (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n

def tile2lonlat(x, y, z):
    n = 2 ** z
    return x / n * 360 - 180, math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))

def search(bbox, dt, cc):
    a, b = dt.split("/")
    body = {"collections": ["sentinel-2-l2a"], "bbox": bbox, "datetime": f"{a}T00:00:00Z/{b}T23:59:59Z", "limit": 200,
            "query": {"eo:cloud_cover": {"lt": cc}}}
    out = []
    while True:
        for k in range(5):
            try:
                r = requests.post(STAC, json=body, timeout=90); r.raise_for_status(); j = r.json(); break
            except Exception as e:
                print("stac retry", k, e); time.sleep(3 + 5 * k)
        else:
            raise RuntimeError("STAC 실패")
        out += j["features"]
        nxt = [l for l in j.get("links", []) if l.get("rel") == "next"]
        if not nxt or not j["features"]: break
        body = nxt[0].get("body", body)
    return out

def pick(items, per):
    """같은 MGRS 칸 · 같은 날 처리판 중 최신 하나 → 칸마다 (구름 + 무자료/4) 낮은 순 per 장"""
    best = {}
    for it in items:
        p = it["properties"]; t = p.get("s2:mgrs_tile") or it["id"].split("_")[1]; d = p["datetime"][:10]
        if p.get("s2:nodata_pixel_percentage", 0) > 95: continue
        k = (t, d)
        if k not in best or it["id"] > best[k]["id"]: best[k] = it
    by = {}   # 칸 × 궤도마다 따로 고른다 — 궤도 끝 칸은 두 궤도가 반씩 덮어 한 궤도만 고르면 빈 쐐기가 남는다
    #   (Earth Search 에 궤도 번호 칸이 없어, 같은 궤도면 같은 무자료 비율이라는 점으로 묶는다 · 10 % 단위)
    for (t, d), it in best.items(): by.setdefault((t, round(it["properties"].get("s2:nodata_pixel_percentage", 0) / 10)), []).append(it)
    out = []
    for t, its in by.items():
        its.sort(key=lambda it: it["properties"]["eo:cloud_cover"] + it["properties"].get("s2:nodata_pixel_percentage", 0) / 4)
        top = its[:per]
        if all(it["properties"].get("s2:nodata_pixel_percentage", 0) > 5 for it in top):   # 칸을 다 덮는 장면이 하나는 있게(빈 쐐기 0)
            full = [it for it in its[per:] if it["properties"].get("s2:nodata_pixel_percentage", 0) <= 5]
            top += full[:1]
        out += top
    return out

def ibox(it):
    b = it.get("bbox")
    if b: return b
    xs = [c[0] for ring in it["geometry"]["coordinates"] for c in ring]; ys = [c[1] for ring in it["geometry"]["coordinates"] for c in ring]
    return [min(xs), min(ys), max(xs), max(ys)]

_tl = threading.local()
def ds(url, ov):
    c = getattr(_tl, "c", None)
    if c is None: c = _tl.c = {}
    k = (url, ov)
    if k not in c:
        if len(c) > 64:
            for v in c.values(): v.close()
            c.clear()
        c[k] = rasterio.open("/vsicurl/" + url, **({} if ov is None else {"overview_level": ov}))
    return c[k]

def chunk(scenes, cx, cy, z, ov):
    """덩어리 (cx, cy)(z 조각 번호 · CH 배수)의 중앙값 RGB(+유효) — 3×H×W uint8 · H×W bool"""
    s = 2 * ORIG / 2 ** z; px = s / 256
    ox, oy = -ORIG + cx * s, ORIG - cy * s
    W = H = CH * 256
    tr = from_origin(ox, oy, px, px)
    w, n = tile2lonlat(cx, cy, z); e, so = tile2lonlat(cx + CH, cy + CH, z)
    hit = [it for it in scenes if not (ibox(it)[2] < w or ibox(it)[0] > e or ibox(it)[3] < so or ibox(it)[1] > n)]
    if not hit: return None
    stack, good = [], []
    for it in hit:
        try:
            d = ds(it["assets"]["visual"]["href"], ov)
            with WarpedVRT(d, crs="EPSG:3857", transform=tr, width=W, height=H, resampling=Resampling.bilinear, nodata=0) as v:
                rgb = v.read()
            if not rgb.any(): continue
            q = ds(it["assets"]["scl"]["href"], None if ov is None else max(ov - 1, 0))   # SCL 20 m → 한 단 덜 줄인 축소판
            with WarpedVRT(q, crs="EPSG:3857", transform=tr, width=W, height=H, resampling=Resampling.nearest, nodata=0) as v:
                scl = v.read(1)
        except Exception as ex:
            print("  skip", it["id"], str(ex)[:120]); continue
        data = rgb.any(0)
        stack.append(rgb); good.append((VALID[np.clip(scl, 0, 11)] & data, data))
    if not stack: return None
    A = np.stack(stack)                                        # N×3×H×W uint8
    G = np.stack([g for g, _ in good]); D = np.stack([d for _, d in good])
    out = np.zeros((3, H, W), np.uint8); any_ = D.any(0)
    for r0 in range(0, H, 256):                               # 256 줄씩 — 장면이 수백 장인 나라 판도 메모리 안에서
        a = A[:, :, r0:r0 + 256].astype(np.float32); g = G[:, r0:r0 + 256]; d = D[:, r0:r0 + 256]
        med = np.nanmedian(np.where(g[:, None], a, np.nan), axis=0)
        alld = np.nanmedian(np.where(d[:, None], a, np.nan), axis=0)   # 늘 구름인 곳 = 있는 관측 전부의 중앙값
        o = np.where(g.any(0)[None], med, np.where(d.any(0)[None], alld, 0))
        out[:, r0:r0 + 256] = np.nan_to_num(o).round().astype(np.uint8)
    return out, any_

def tone(img, valid, P):
    a = img.astype(np.float32) / 255.0
    lo = np.array(P["lo"], np.float32)[:, None, None]; hi = np.array(P["hi"], np.float32)[:, None, None]
    a = np.clip((a - lo) / (hi - lo), 0, 1) ** P["gamma"]
    m = a.mean(0, keepdims=True); a = np.clip(m + (a - m) * P["sat"], 0, 1)
    rgba = np.concatenate([a * 255, valid[None] * 255.0]).astype(np.uint8)
    return rgba

def save(tile, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if tile.mode == "RGBA" and tile.getextrema()[3][0] == 255: tile = tile.convert("RGB")
    tile.save(path, "WEBP", quality=86, method=4)

def bake(sid):
    S = SETS[sid]; t0 = time.time(); z0, z1 = S["z"]; root = OUT + sid
    items = search(S["bbox"], S["dt"], S["cc"]); scenes = pick(items, S["per"])
    print(sid, "후보", len(items), "→ 고른 장면", len(scenes))
    w, so, e, n = S["bbox"]
    x0, y0 = lonlat2tile(w, n, z1); x1, y1 = lonlat2tile(e, so, z1)
    X0, Y0 = int(x0) // CH * CH, int(y0) // CH * CH; X1, Y1 = int(x1), int(y1)
    jobs = [(cx, cy) for cy in range(Y0, Y1 + 1, CH) for cx in range(X0, X1 + 1, CH)]
    raw = {}
    with ThreadPoolExecutor(12) as ex:
        fs = {ex.submit(chunk, scenes, cx, cy, z1, S["ov"]): (cx, cy) for cx, cy in jobs}
        for i, f in enumerate(as_completed(fs)):
            r = f.result()
            if r is not None: raw[fs[f]] = r
            if i % 10 == 0: print(f"  {sid} 덩어리 {i + 1}/{len(jobs)} · {round(time.time() - t0)} s", flush=True)
    # 밝기 맞춤 — 나라 판이 정하고(유효 화소 표본의 띠별 0.5 · 99.7 백분위) 구역 판은 그 값을 그대로
    old = json.load(open(OUT + "meta.json", encoding="utf8"))["sets"] if os.path.exists(OUT + "meta.json") else {}
    if "parent" in S:
        P = old[S["parent"]]["tone"]
    elif sid in old:
        P = old[sid]["tone"]                                  # 다시 구워도 밝기 값은 그대로(같은 나라 고줌 판과 어긋나지 않게)
    else:
        smp = np.concatenate([img[:, v][:, ::37] for img, v in raw.values() if v.any()], axis=1).astype(np.float32) / 255
        P = dict(lo=np.percentile(smp, 0.5, axis=1).round(4).tolist(), hi=np.percentile(smp, 99.7, axis=1).round(4).tolist(), gamma=0.88, sat=1.12)
    nt = 0
    for (cx, cy), (img, v) in raw.items():
        im = Image.fromarray(tone(img, v, P).transpose(1, 2, 0), "RGBA")
        for j in range(CH):
            for i in range(CH):
                if not v[j * 256:(j + 1) * 256, i * 256:(i + 1) * 256].any(): continue
                save(im.crop((i * 256, j * 256, i * 256 + 256, j * 256 + 256)), f"{root}/{z1}/{cx + i}/{cy + j}.webp"); nt += 1
    raw.clear()
    for z in range(z1 - 1, z0 - 1, -1):                     # 피라미드 — 아이 넷을 합쳐 줄인다
        kids = {}
        for xd in os.listdir(f"{root}/{z + 1}"):
            for yf in os.listdir(f"{root}/{z + 1}/{xd}"):
                x, y = int(xd), int(yf[:-5]); kids.setdefault((x // 2, y // 2), []).append((x, y))
        for (px_, py_), ks in kids.items():
            c = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
            for x, y in ks: c.paste(Image.open(f"{root}/{z + 1}/{x}/{y}.webp").convert("RGBA"), ((x % 2) * 256, (y % 2) * 256))
            save(c.resize((256, 256), Image.LANCZOS), f"{root}/{z}/{px_}/{py_}.webp"); nt += 1
    size = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs_ in os.walk(root) for f in fs_)
    years = sorted({it["properties"]["datetime"][:4] for it in scenes})
    meta = json.load(open(OUT + "meta.json", encoding="utf8")) if os.path.exists(OUT + "meta.json") else {"sets": {}}
    meta["sets"][sid] = dict(name=S["name"], bounds=S["bbox"], minzoom=z0, maxzoom=z1, period=S["dt"], tone=P, tiles=nt, bytes=size,
                             scenes=sorted(it["id"] for it in scenes), years=years, seconds=round(time.time() - t0),
                             baked_at=time.strftime("%Y-%m-%dT%H:%M:%S+09:00"))
    meta["source"] = "Copernicus Sentinel-2 L2A (AWS 공개 · Earth Search) · TCI + SCL 구름 가림 · 중앙값 합성"
    ys = sorted({y for s in meta["sets"].values() for y in s["years"]})
    meta["attribution"] = "Contains modified Copernicus Sentinel data " + "–".join(dict.fromkeys([ys[0], ys[-1]]))
    json.dump(meta, open(OUT + "meta.json", "w", encoding="utf8"), ensure_ascii=False, indent=1)
    print(sid, "조각", nt, "·", round(size / 1e6, 1), "MB ·", round(time.time() - t0), "s")

if __name__ == "__main__":
    for sid in (sys.argv[1:] or ["kg", "kg-chuy", "mm", "mm-meiktila"]): bake(sid)
