"""단동다동 배경 칸 — 산내면 드론(img-52190-nd-drone) 예시 결과 중 눈으로 '아님(F)'이라 매긴 자리(gh_labels.json) 가운데 1024 칸.
거름: 칸 안에 '비닐하우스(T)'로 매긴 결과 · 신뢰도 0.85 이상 결과가 있으면 버림 · 빈 곳(검은 · 흰 채움) 2% 넘으면 버림 → 눈 확인 표로 한 번 더.
나눔: 경도 중앙값 서쪽 = 학습 · 동쪽 = 평가.   python gh_bg.py OUTDIR"""
import sys, json, glob
from pathlib import Path
sys.path.insert(0, r"E:\Land-XI 플랫폼\01. 디자인\server")
from landxi_api import config
import numpy as np, rasterio, shapely
from shapely import wkt
from shapely.geometry import box
from rasterio.windows import from_bounds, Window
from pyproj import Transformer
from PIL import Image
OUT = Path(sys.argv[1]); C = 1024; H = Path(__file__).parent
L = json.load(open(H / "gh_labels.json", encoding="utf-8")); M = json.load(open(H / "gh-sample-156.json", encoding="utf-8"))
rows = json.load(open(sorted(glob.glob(str(config.DATA_ROOT / "_backup/cards8-1026/job_01M5NW3EH2XSQAMS5A57EQ9EPD.main.detections.*.json")))[0], encoding="utf-8"))
geo = {r[0]: wkt.loads(r[9]) for r in rows}; conf = {r[0]: float(r[7]) for r in rows}
T = Transformer.from_crs(4326, 5186, always_xy=True).transform
from shapely.ops import transform as stx
g5 = {k: stx(T, g) for k, g in geo.items()}
idk = {m["k"]: m["id"] for m in M}
tid = {idk[k] for k in L["T"]}
keep_out = [g5[i] for i in g5 if i in tid or conf[i] >= 0.85]
KT = shapely.STRtree(keep_out)
ds = rasterio.open(config.DATA_ROOT / "cog/std/img-52190-nd-drone-v2.tif"); half = C * ds.transform.a / 2
kept, taken = [], []
for k in L["F"]:
    c = g5[idk[k]].centroid
    for dx, dy in ((0, 0), (half * 0.6, 0), (-half * 0.6, 0), (0, half * 0.6), (0, -half * 0.6)):
        x, y = c.x + dx, c.y + dy
        if len(KT.query(box(x - half, y - half, x + half, y + half), predicate="intersects")):
            continue
        if any(abs(x - a) < half and abs(y - b) < half for a, b in taken):
            continue
        win = from_bounds(x - half, y - half, x + half, y + half, transform=ds.transform)
        a = ds.read([1, 2, 3], window=Window(int(round(win.col_off)), int(round(win.row_off)), C, C), boundless=True, fill_value=0)
        if (a.max(axis=0) <= 3).mean() > 0.02 or (a.min(axis=0) >= 252).mean() > 0.02:
            continue
        taken.append((x, y)); kept.append((k, x, y, a)); break
xs = sorted(v[1] for v in kept); mid = xs[len(xs) // 2] if xs else 0
meta = []
for i, (k, x, y, a) in enumerate(kept):
    sp = "train" if x < mid else "eval"
    for s in ("images", "labels"):
        (OUT / sp / s).mkdir(parents=True, exist_ok=True)
    nm = f"ghbg26_{i:03d}"
    Image.fromarray(np.transpose(a, (1, 2, 0))).save(OUT / sp / "images" / f"{nm}.jpg", quality=92)
    (OUT / sp / "labels" / f"{nm}.txt").write_text("", encoding="utf-8")
    meta.append({"name": nm, "from_sample": k, "split": sp, "x": round(x, 1), "y": round(y, 1)})
json.dump({"chips": meta, "mid_x": mid}, open(OUT / "chips.json", "w", encoding="utf-8"), ensure_ascii=False, indent=0)
print({s: sum(1 for m in meta if m["split"] == s) for s in ("train", "eval")})
