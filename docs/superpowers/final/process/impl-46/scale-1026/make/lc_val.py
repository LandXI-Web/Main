"""토지피복 U-Net(change-ap25) 축척 · 칸 크기 시험(CPU · 정답 있음) — AI 허브 토지피복(경상 · 전라) 검증 1024 칸(25 cm · 256 m) 중 산지 칸 표본.
V1 원래(1024 칸 · 25 cm) · V2 512 칸 넷(128 m) · V3 51 cm 로 줄였다가 2배 키움(국토 변화 2019 방식) · V4 51 cm 그대로(줄인 채)
→ 뜻 묶음(건물 · 도로 · 경작 · 산림 · 수역 · 나지) IoU · 화소 정확도.   python lc_val.py N OUT.json"""
import sys, os, json, zipfile, io, random, time
import numpy as np
SERVER = r"E:\Land-XI 플랫폼\01. 디자인\server"; sys.path.insert(0, SERVER); sys.stdout.reconfigure(encoding="utf-8")
import torch
torch.set_num_threads(16)
from PIL import Image
import rasterio
from rasterio.features import rasterize
from rasterio.transform import from_origin
from shapely.geometry import shape
from change import detect as D, roadland_src
roadland_src()
import landcover_unet as LC
N = int(sys.argv[1]); OUT = sys.argv[2]
import glob
from shapely.geometry import shape as _shp
def _rd(b):
    for e in ("utf-8", "cp949"):
        try:
            d = json.loads(b.decode(e))
            return d if isinstance(d, dict) else None
        except Exception:
            pass
PAIRS = []          # (이미지 zip, 이미지 이름, 라벨 zip, 라벨 이름)
for reg in ("124.토지 피복지도 항공위성 이미지 데이터(경상)", "125.토지 피복지도 항공위성 이미지 데이터(전라)"):
    zi = zipfile.ZipFile(glob.glob(f"E:/{reg}/01.데이터/2.Validation/원천데이터/*1024*.zip")[0])
    zl = zipfile.ZipFile(glob.glob(f"E:/{reg}/01.데이터/2.Validation/라벨링데이터/*1024*.zip")[0])
    labs = {os.path.basename(n)[:-5]: n for n in zl.namelist() if n.endswith(".json")}
    for n in zi.namelist():
        k = os.path.basename(n)[:-4]
        if n.endswith(".tif") and k in labs:
            PAIRS.append((zi, n, zl, labs[k]))
# 산지 표본(산사태가 보는 곳) — 산림 라벨이 칸의 15% 이상인 칸만
FOREST = []
for zi, n, zl, ln in PAIRS:
    d = _rd(zl.read(ln))
    if not d:
        continue
    a = sum(_shp(f["geometry"]).area for f in d["features"] if int(f["properties"]["ANN_CD"]) in (70, 71, 75))
    if a >= 0.15 * 256 * 256:
        FOREST.append((zi, n, zl, ln))
random.Random(1026).shuffle(FOREST); ims = FOREST[:N]
print("산지 칸", len(FOREST), "중", len(ims), flush=True)
CODE = {10: 1, 20: 2, 30: 3, 40: 4, 50: 5, 55: 6, 60: 7, 70: 8, 71: 8, 75: 9, 80: 10, 95: 11, 100: 0}   # 70 = 산림(세분 없는 라벨)
net = LC.load_model(r"E:\도로공사\geoai_roadland\models\ap25_best.pth", device="cpu")
def pred(rgb, tile):
    H, W = rgb.shape[:2]
    if tile >= max(H, W):
        return LC._predict_one(net, rgb, "cpu")
    out = np.zeros((H, W), np.int64)
    for y in range(0, H, tile):
        for x in range(0, W, tile):
            out[y:y + tile, x:x + tile] = LC._predict_one(net, rgb[y:y + tile, x:x + tile], "cpu")
    return out
def up2(a): return np.asarray(Image.fromarray(a).resize((a.shape[1] * 2, a.shape[0] * 2), Image.BICUBIC))
def down2(a): return np.asarray(Image.fromarray(a).resize((a.shape[1] // 2, a.shape[0] // 2), Image.BOX))
VS = ["V1", "V2", "V3", "V4"]
G = list(range(1, 7))
inter = {v: np.zeros(7) for v in VS}; union = {v: np.zeros(7) for v in VS}; ok = {v: 0 for v in VS}; tot = {v: 0 for v in VS}
t0 = time.time()
with torch.no_grad():
    for k, (zi, n, zl, ln) in enumerate(ims):
        with rasterio.MemoryFile(zi.read(n)) as mf, mf.open() as ds:
            rgb = np.transpose(ds.read([1, 2, 3]), (1, 2, 0)).astype(np.uint8)
        fc = _rd(zl.read(ln))
        gs = [(shape(f["geometry"]), CODE.get(int(f["properties"]["ANN_CD"]), 0)) for f in fc["features"]]
        xs = [g.bounds for g, _ in gs]
        mnx = min(b[0] for b in xs); mxy = max(b[3] for b in xs)
        # 칸 범위 = 256 m 정사각 — 라벨 도형 묶음의 바깥 틀(왼쪽 위)로 맞춤
        tr = from_origin(mnx, mxy, 0.25, 0.25)
        gt = rasterize([(g, c + 1) for g, c in gs], out_shape=(1024, 1024), transform=tr, fill=0, dtype="uint8").astype(np.int64) - 1
        gtg = np.where(gt >= 0, D.group_map(np.clip(gt, 0, 15)), 0)
        P = {"V1": pred(rgb, 1024), "V2": pred(rgb, 512)}
        lo = down2(rgb)
        P["V3"] = pred(up2(lo), 1024)
        p4 = pred(lo, 1024); P["V4"] = np.kron(p4, np.ones((2, 2), np.int64))[:1024, :1024]
        m = gtg > 0
        for v in VS:
            pg = D.group_map(np.clip(P[v], 0, 15))
            ok[v] += int(((pg == gtg) & m).sum()); tot[v] += int(m.sum())
            for g in G:
                a, b = (pg == g) & m, (gtg == g) & m
                inter[v][g] += (a & b).sum(); union[v][g] += (a | b).sum()
        if k % 10 == 0:
            print(k, round(time.time() - t0), {v: round(ok[v] / max(1, tot[v]), 3) for v in VS}, flush=True)
NAME = {1: "건물", 2: "도로", 3: "경작", 4: "산림", 5: "수역", 6: "나지"}
res = {"n": len(ims), "source": "AI 허브 124 · 125 토지피복(경상 · 전라) 검증 1024 칸 · 25 cm · 산림 라벨 15% 이상 칸 중 무작위(seed 1026)", "pool": len(FOREST),
       "variants": {"V1": "25 cm · 1024 칸(256 m) — 산사태 지금", "V2": "25 cm · 512 칸(128 m)", "V3": "51 cm → 2배 키움 · 1024 칸 — 국토 변화 2019 방식", "V4": "51 cm 그대로 · 1024 칸(512 m)"},
       "pixel_acc_group": {v: round(ok[v] / max(1, tot[v]), 4) for v in VS},
       "iou_group": {v: {NAME[g]: (round(inter[v][g] / union[v][g], 4) if union[v][g] else None) for g in G} for v in VS},
       "seconds": round(time.time() - t0)}
res["miou_group"] = {v: round(float(np.mean([x for x in res["iou_group"][v].values() if x is not None])), 4) for v in VS}
json.dump(res, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(json.dumps(res, ensure_ascii=False))
