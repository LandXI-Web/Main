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
OUT = Path("E:/도로공사/deck_anseong/v3-bright"); TILES = Path("E:/도로공사/deck_anseong/_src/tiles_cache")
DEV = "cuda:1"; GPU_IDX = 1; CAP = 145.0; REL = 135.0; PAUSE = [0.4]; UP = 2
tiles, (c0, r0, c1, r1) = W.ngii_tiles_needed()
H5, W5 = (r1 - r0 + 1) * 256, (c1 - c0 + 1) * 256
res = NG.RES[17] / UP
src_tf = from_origin(NG.ORIGIN_X + c0 * NG.tile_span_m(17), NG.ORIGIN_Y - r0 * NG.tile_span_m(17), res, res)
xmin, ymin, xmax, ymax = W.merc_bounds(); px = W.TILE_M / 256; dst_tf = from_origin(xmin, ymax, px, px)

import threading
hist = collections.deque(); sleeps = [0.0]; peak = [0.0]; peak_avg = [0.0]; hl = threading.Lock(); stop = [False]; recent = [0.0]
def _mon():
    while not stop[0]:
        now = time.time(); w = nvml_power.read().get(GPU_IDX, 0.0)
        with hl:
            hist.append((now, w)); recent[0] = max(recent[0], w); peak[0] = max(peak[0], w)
            while hist and now - hist[0][0] > 30: hist.popleft()
            if now - hist[0][0] >= 25: peak_avg[0] = max(peak_avg[0], sum(x for _, x in hist) / len(hist))
        time.sleep(0.1)
def avg30():
    with hl: return sum(x for _, x in hist) / max(len(hist), 1)
def throttle():
    if recent[0] >= 190: PAUSE[0] = min(PAUSE[0] * 2, 2.0)         # 순간이 200W 가까우면 칸마다 더 쉼(배치는 이미 1)
    recent[0] = 0.0
    if avg30() > CAP:
        while avg30() > REL: time.sleep(1.0); sleeps[0] += 1.0
    time.sleep(PAUSE[0]); sleeps[0] += PAUSE[0]

def match_hist(src, ref):
    """채널마다 src 의 누적분포를 ref 에 맞춘다. 영상 없는 칸(세 채널 모두 0)은 세지 않고 그대로 둔다."""
    out = src.copy(); vs = (src.reshape(-1, 3) != 0).any(1); vr = (ref.reshape(-1, 3) != 0).any(1)
    for ch in range(3):
        hs = np.bincount(src[..., ch].reshape(-1)[vs], minlength=256).astype(np.float64); hr = np.bincount(ref[..., ch].reshape(-1)[vr], minlength=256).astype(np.float64)
        cs = np.cumsum(hs) / hs.sum(); cr = np.cumsum(hr) / hr.sum()
        lut = np.clip(np.searchsorted(cr, cs), 0, 255).astype(np.uint8)
        out[..., ch] = lut[src[..., ch]]
    out[~(src != 0).any(-1)] = 0
    return out


GAMMA = 0.75; Y_FULL = 50.0; Y_NONE = 90.0   # 밝기 50 이하는 감마 0.75 전부, 90 이상은 그대로, 사이는 부드럽게 섞음
def lift_dark(src):
    """어두운 부분만 밝힘: 밝기 Y 에 감마를 걸고(어두울수록 세게) 같은 비율로 R·G·B 를 곱함(색조 유지). 영상 없는 칸(세 채널 0)은 그대로."""
    v = (src != 0).any(-1); f = src.astype(np.float32); Y = f @ np.array([0.299, 0.587, 0.114], np.float32)
    Yg = 255.0 * np.power(np.clip(Y, 0, 255) / 255.0, GAMMA)
    w = np.clip((Y_NONE - Y) / (Y_NONE - Y_FULL), 0, 1)
    Yn = Y + (Yg - Y) * w; ratio = np.where(Y > 0.5, Yn / np.maximum(Y, 0.5), 1.0)
    out = np.clip(f * ratio[..., None], 0, 255).astype(np.uint8); out[~v] = 0
    return out, float((w[v] > 0).mean())

def raw_mosaic(year):
    arr = np.zeros((H5, W5, 3), np.uint8); missing = 0
    for c, r in tiles:
        p = TILES / str(year) / "17" / f"{c}_{r}.jpg"
        if not p.exists(): missing += 1; continue
        arr[(r - r0) * 256:(r - r0 + 1) * 256, (c - c0) * 256:(c - c0 + 1) * 256] = np.asarray(Image.open(p).convert("RGB"))
    return arr, missing

def mosaic(year, ref=None):
    arr, missing = raw_mosaic(year)
    if year == 2019: arr, frac = lift_dark(arr); print("밝힌 픽셀 비율", round(frac, 3), flush=True)
    return np.asarray(Image.fromarray(arr).resize((W5 * UP, H5 * UP), Image.BICUBIC)), missing, arr

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
    net = LC.load_model(device=DEV); info = {"model": "models/ap25_best.pth (landcover_unet · 12클래스)", "입력": f"NGII 항공 L17(0.51m) → {UP}배(0.255m) · 2019 어두운 부분만 밝힘(감마 0.75 · 밝기 50 이하 전부 · 90 이상 그대로 · 영상 없는 칸 제외) · 2025 는 v3-color 결과 그대로", "창격자": [W.H_PX, W.W_PX], "겹침": "1024칸 · 보폭 512 · hann 확률 평균", "runs": {}}
    T0 = time.time(); threading.Thread(target=_mon, daemon=True).start()
    for yr in (2019,):
        t0 = time.time(); big, missing, arr = mosaic(yr); t1 = time.time()
        if yr == 2019: info['밝힌 뒤 평균RGB(2019)'] = arr.reshape(-1, 3)[(arr.reshape(-1, 3) != 0).any(1)].mean(0).round(1).tolist()
        cls, n = predict(net, big); t2 = time.time(); del big
        np.save(OUT / "_src" / f"fine_{yr}.npy", cls)
        win = to_window(cls); save_png(win, OUT / f"lc_{yr}.png"); np.save(OUT / "_src" / f"win_{yr}.npy", win)
        info["runs"][str(yr)] = {"빠진 타일": missing, "영상 준비 초": round(t1 - t0, 1), "추론 초": round(t2 - t1, 1), "칸 수": n, "창 클래스 픽셀": np.bincount(win.ravel(), minlength=12).tolist()}
        print(yr, info["runs"][str(yr)], flush=True)
    stop[0] = True; info["총 초"] = round(time.time() - T0, 1); info["전력"] = {"쉬기 시작(30초 평균 W)": CAP, "다시 시작 W": REL, "30초 평균 최댓값 W": round(peak_avg[0], 1), "순간 최댓값 W": peak[0], "칸마다 쉼 초(끝값)": PAUSE[0], "쉰 시간 합 초": round(sleeps[0], 1)}
    info["runs"]["2025"] = json.loads((Path("E:/도로공사/deck_anseong/v3-color/_src/s2.json")).read_text(encoding="utf-8"))["runs"]["2025"]
    (OUT / "_src" / "s2.json").write_text(json.dumps(info, ensure_ascii=False, indent=1), encoding="utf-8")
