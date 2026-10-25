"""2단계: 2019·2025 토지피복 추론. 영상 = 이 창을 위해 이미 받아 둔 NGII 항공 L17 타일(재다운로드 0). 모델 학습 해상도(25cm)에 맞춰 2배로 키워 추론(엔진 방식).
큰 판 한 장에 확률을 합쳐(hann 가중 · 겹침 75%) 이음새를 없애고, 창 격자(WebMercator z17 3840x2304)로 최근접 다시 뽑는다. 전력: 30초 평균 160W 아래로 쉬며 돈다."""
import os, sys, time, json, collections
os.environ["CUDA_DEVICE_ORDER"] = "PCI_BUS_ID"
from pathlib import Path
import numpy as np, torch
from PIL import Image
import rasterio
from rasterio.transform import from_origin
from rasterio.warp import reproject, Resampling
sys.path.insert(0, "E:/도로공사/geoai_roadland/src"); sys.path.insert(0, "E:/도로공사/deck_anseong/_src"); sys.path.insert(0, "E:/Land-XI 플랫폼/01. 디자인/server")
import ngii as NG, window as W, landcover_unet as LC
from workers import nvml_power
OUT = Path("E:/도로공사/deck_anseong/v3"); TILES = Path("E:/도로공사/deck_anseong/_src/tiles_cache")
DEV = "cuda:1"; GPU_IDX = 1; CAP = 150.0; UP = 2
tiles, (c0, r0, c1, r1) = W.ngii_tiles_needed()
H5, W5 = (r1 - r0 + 1) * 256, (c1 - c0 + 1) * 256
res = NG.RES[17] / UP
src_tf = from_origin(NG.ORIGIN_X + c0 * NG.tile_span_m(17), NG.ORIGIN_Y - r0 * NG.tile_span_m(17), res, res)
xmin, ymin, xmax, ymax = W.merc_bounds(); px = W.TILE_M / 256; dst_tf = from_origin(xmin, ymax, px, px)

hist = collections.deque(); sleeps = [0.0]; peak = [0.0]
def throttle():
    now = time.time(); w = nvml_power.read().get(GPU_IDX, 0.0); hist.append((now, w)); peak[0] = max(peak[0], w)
    while hist and now - hist[0][0] > 30: hist.popleft()
    while True:
        avg = sum(x for _, x in hist) / len(hist)
        if avg <= CAP: return
        time.sleep(1.0); sleeps[0] += 1.0; now = time.time(); hist.append((now, nvml_power.read().get(GPU_IDX, 0.0)))
        while hist and now - hist[0][0] > 30: hist.popleft()

def mosaic(year):
    arr = np.zeros((H5, W5, 3), np.uint8); missing = 0
    for c, r in tiles:
        p = TILES / str(year) / "17" / f"{c}_{r}.jpg"
        if not p.exists(): missing += 1; continue
        arr[(r - r0) * 256:(r - r0 + 1) * 256, (c - c0) * 256:(c - c0 + 1) * 256] = np.asarray(Image.open(p).convert("RGB"))
    big = np.asarray(Image.fromarray(arr).resize((W5 * UP, H5 * UP), Image.BICUBIC))
    return big, missing

@torch.no_grad()
def predict(net, rgb, tile=1024, stride=512):
    H, Wd = rgb.shape[:2]
    acc = np.zeros((LC.NUM_CLASSES, H, Wd), np.float32); wsum = np.zeros((H, Wd), np.float32)
    wy = np.maximum(np.hanning(tile + 2)[1:-1].astype(np.float32), 1e-3); win = np.outer(wy, wy)
    ys = list(range(0, H - tile + 1, stride)); xs = list(range(0, Wd - tile + 1, stride))
    if ys[-1] + tile < H: ys.append(H - tile)
    if xs[-1] + tile < Wd: xs.append(Wd - tile)
    n = 0
    for y0 in ys:
        for x0 in xs:
            throttle()
            x = LC._T(Image.fromarray(np.ascontiguousarray(rgb[y0:y0 + tile, x0:x0 + tile]))).unsqueeze(0).to(DEV)
            with torch.autocast("cuda", dtype=torch.float16): lg = net(x)
            p = torch.softmax(lg.float(), 1)[0].cpu().numpy()
            acc[:, y0:y0 + tile, x0:x0 + tile] += p * win; wsum[y0:y0 + tile, x0:x0 + tile] += win; n += 1
    return (acc / np.maximum(wsum, 1e-6)).argmax(0).astype(np.uint8), n

def to_window(cls):
    out = np.zeros((W.H_PX, W.W_PX), np.uint8)
    reproject(cls, out, src_transform=src_tf, src_crs="EPSG:5179", dst_transform=dst_tf, dst_crs="EPSG:3857", resampling=Resampling.nearest)
    return out

def save_png(cls, path):
    im = Image.fromarray(cls, mode="L").convert("P"); pal = []
    for k in range(256): pal += LC.VISIBLE.get(k, [0, 0, 0])
    im.putpalette(pal[:768]); im.save(path, optimize=True)

if __name__ == "__main__":
    net = LC.load_model(device=DEV); info = {"model": "models/ap25_best.pth (landcover_unet · 12클래스)", "입력": f"NGII 항공 L17(0.51m) → {UP}배(0.255m)", "창격자": [W.H_PX, W.W_PX], "겹침": "1024칸 · 보폭 512 · hann 확률 평균", "runs": {}}
    T0 = time.time()
    for yr in (2019, 2025):
        t0 = time.time(); big, missing = mosaic(yr); t1 = time.time()
        cls, n = predict(net, big); t2 = time.time(); del big
        np.save(OUT / "_src" / f"fine_{yr}.npy", cls)
        win = to_window(cls); save_png(win, OUT / f"lc_{yr}.png"); np.save(OUT / "_src" / f"win_{yr}.npy", win)
        info["runs"][str(yr)] = {"빠진 타일": missing, "영상 준비 초": round(t1 - t0, 1), "추론 초": round(t2 - t1, 1), "칸 수": n, "창 클래스 픽셀": np.bincount(win.ravel(), minlength=12).tolist()}
        print(yr, info["runs"][str(yr)], flush=True)
    info["총 초"] = round(time.time() - T0, 1); info["전력"] = {"기준 30초 평균 W": CAP, "관측 최고 W(순간)": peak[0], "전력 때문에 쉰 초": sleeps[0]}
    (OUT / "_src" / "s2.json").write_text(json.dumps(info, ensure_ascii=False, indent=1), encoding="utf-8")
