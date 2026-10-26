"""필지 눈 판정 표본(예측 숨김) — 설정 어느 하나라도 작물로 본 필지 + 아무도 안 본 필지를 섞어 무작위 순서 번호만 붙여 그림판으로.
판정은 사람(여기선 에이전트)이 그림만 보고 적는다 → parcel_score.py 가 설정별 맞음 · 틀림을 센다.
  python parcel_sheet.py PKL OUTDIR NAME NPOS NNEG"""
import sys, pickle, random, json
from pathlib import Path
SERVER = Path(r"E:\Land-XI 플랫폼\01. 디자인\server"); sys.path.insert(0, str(SERVER)); sys.stdout.reconfigure(encoding="utf-8")
import numpy as np, rasterio
from rasterio.windows import from_bounds
from rasterio.enums import Resampling
from PIL import Image, ImageDraw, ImageFont
from workers import imagery_src as S
pk = pickle.load(open(sys.argv[1], "rb")); OUT = Path(sys.argv[2]); OUT.mkdir(parents=True, exist_ok=True); name = sys.argv[3]
npos, nneg = int(sys.argv[4]), int(sys.argv[5])
geo = pk["geo"]
pos = sorted({p for t in geo for p in geo[t]["plab"]})
big = [(pnu, pg) for pnu, _, pg in pk["parcels"] if pg.area >= 300]
neg = sorted({pnu for pnu, _ in big} - set(pos))
rnd = random.Random(1026)
pick = rnd.sample(pos, min(npos, len(pos))) + rnd.sample(neg, min(nneg, len(neg)))
rnd.shuffle(pick)
PG = {pnu: pg for pnu, _, pg in pk["parcels"]}
F = ImageFont.truetype(r"C:\Windows\Fonts\malgun.ttf", 22)
tiles = []
with rasterio.open(S.imagery_path(pk["imagery"])) as ds:
    for i, pnu in enumerate(pick):
        g = PG[pnu]; b = g.bounds; s = max(b[2] - b[0], b[3] - b[1]) * 1.25 + 10; cx, cy = (b[0] + b[2]) / 2, (b[1] + b[3]) / 2
        fr = (cx - s / 2, cy - s / 2, cx + s / 2, cy + s / 2)
        arr = ds.read([1, 2, 3], window=from_bounds(*fr, ds.transform), out_shape=(3, 360, 360), resampling=Resampling.average, boundless=True, fill_value=0)
        im = Image.fromarray(np.transpose(arr, (1, 2, 0)).astype(np.uint8)); d = ImageDraw.Draw(im)
        for p in getattr(g, "geoms", [g]):
            d.line([((x - fr[0]) / s * 360, (fr[3] - y) / s * 360) for x, y in p.exterior.coords], fill=(255, 255, 255), width=3)
        d.rectangle([0, 0, 52, 30], fill=(0, 0, 0)); d.text((6, 2), f"{i:02d}", font=F, fill=(255, 255, 0))
        tiles.append(im)
for k in range(0, len(tiles), 12):
    sh = Image.new("RGB", (4 * 364, 3 * 364), "white")
    for j, im in enumerate(tiles[k:k + 12]):
        sh.paste(im, ((j % 4) * 364, (j // 4) * 364))
    sh.save(OUT / f"{name}-sheet{k // 12}.jpg", quality=85)
json.dump({"order": pick, "n_pos_pool": len(pos), "n_neg_pool": len(neg)}, open(OUT / f"{name}-order.json", "w"), indent=0)
print(len(pick), "장", len(pos), len(neg))
