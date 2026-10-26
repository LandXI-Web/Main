"""산사태 넓게 보기 시험(10-26 · CPU 만 · GPU 0 · DB 0) — 국토 변화와 같은 영상(국토지리정보원 타일 캐시) · 같은 모델(change-ap25)로
줌(해상도) · 칸 크기를 바꿔 두 해 토지피복 지도를 만들어 둔다(npz). 판정 · 그림은 ls_eval.py.
  python ls_cpu.py TAG W S E N ZOOM TILE [UP]
  ZOOM 18 = 25.5 cm(학습 25 cm 와 같음) · 17 = 51 cm(UP=1 이면 2배 키움 = 국토 변화 2019 방식) · TILE = U-Net 한 칸(px)"""
import sys, os, time, json
import numpy as np
SERVER = r"E:\Land-XI 플랫폼\01. 디자인\server"; sys.path.insert(0, SERVER); sys.stdout.reconfigure(encoding="utf-8")
import torch
torch.set_num_threads(int(os.environ.get("LS_THREADS", "16")))
from pyproj import Transformer
from change import detect as D, imagery as I, roadland_src
roadland_src()
import landcover_unet as LC
tag = sys.argv[1]; w, s, e, n = map(float, sys.argv[2:6]); zoom = int(sys.argv[6]); tile = int(sys.argv[7]); up = len(sys.argv) > 8 and sys.argv[8] == "1"
OUT = os.environ.get("LS_OUT", r"C:\Users\User\AppData\Local\Temp\claude\E--Land-XI----\8755e9e1-c9d4-4ccc-ae31-8eb0e35a24df\scratchpad\ls")
os.makedirs(OUT, exist_ok=True)
T = Transformer.from_crs(4326, 5179, always_xy=True).transform
x0, y0 = T(w, s); x1, y1 = T(e, n)
bb = (min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1))
net = LC.load_model(r"E:\도로공사\geoai_roadland\models\ap25_best.pth", device="cpu")

@torch.no_grad()
def classes(rgb):
    x = D.upsample2(rgb) if up else rgb
    H, W = x.shape[:2]; ov = tile // 8; step = tile - ov
    out = np.zeros((H, W), np.uint8)
    blank = x.max(axis=2) < 8
    for yy in range(0, H, step):
        for xx in range(0, W, step):
            ya, xa = min(yy + tile, H), min(xx + tile, W)
            if blank[yy:ya, xx:xa].mean() <= 0.98:
                out[yy:ya, xx:xa] = LC._predict_one(net, x[yy:ya, xx:xa], "cpu")
            if xa == W: break
        if ya == H: break
    out[blank] = 255
    return out[::2, ::2] if up else out

rec = {"tag": tag, "bbox4326": [w, s, e, n], "bbox5179": bb, "zoom": zoom, "tile": tile, "up": up}
for yr in (2020, 2025):
    t0 = time.time()
    rgb, (ox, oy, res), got, tot = I.fetch_imagery(bb, yr, zoom)
    t1 = time.time()
    cl = classes(rgb)
    rec[str(yr)] = {"tiles": [got, tot], "fetch_s": round(t1 - t0, 1), "infer_s": round(time.time() - t1, 1), "shape": list(cl.shape)}
    np.savez_compressed(f"{OUT}/{tag}-{yr}.npz", cls=cl, ox=ox, oy=oy, res=res)
    if not os.path.exists(f"{OUT}/rgb-z{zoom}-{yr}-{tag.split('-')[0]}.jpg"):
        from PIL import Image
        Image.fromarray(rgb).save(f"{OUT}/rgb-z{zoom}-{yr}-{tag.split('-')[0]}.jpg", quality=88)
    print(tag, yr, rec[str(yr)], res, flush=True)
rec["res"] = res
json.dump(rec, open(f"{OUT}/{tag}.json", "w"), indent=1)
