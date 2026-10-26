"""사료작물 넓게 보기 그림 — drone_eval 의 .pkl(정리한 결과 · 필지 묶기) + 같은 드론 영상(겹친 줄임판) → 원본 · 설정별 결과 그림.
틀 = 결과 범위(분석 범위 ∩ 영상 있는 곳) 안 · 빈 곳(검은 · 흰 채움)이 틀의 2% 넘으면 그 틀은 버림(원칙 340).
  python drone_fig.py PKL OUTDIR NAME CX CY WIDTH_M [PX]   (CX CY = EPSG:5186 m · WIDTH_M = 틀 가로)  · CX=auto 면 결과가 가장 많은 틀"""
import sys, os, pickle
from pathlib import Path
SERVER = Path(r"E:\Land-XI 플랫폼\01. 디자인\server"); sys.path.insert(0, str(SERVER)); sys.stdout.reconfigure(encoding="utf-8")
import numpy as np, rasterio
from rasterio.windows import from_bounds
from rasterio.enums import Resampling
from PIL import Image, ImageDraw, ImageFont
from shapely.geometry import box
from workers import imagery_src as S
pk = pickle.load(open(sys.argv[1], "rb")); OUT = Path(sys.argv[2]); OUT.mkdir(parents=True, exist_ok=True); name = sys.argv[3]
W_M = float(sys.argv[6]); PX = int(sys.argv[7]) if len(sys.argv) > 7 else 1400
geo = pk["geo"]; tags = list(geo)
COL = {"IRG": (116, 184, 22), "호밀": (250, 176, 5), "옥수수": (240, 68, 82), "수단그라스": (49, 130, 246)}
FONT = ImageFont.truetype(r"C:\Windows\Fonts\malgun.ttf", 26)
def frame_auto():
    best = None
    allg = [g for t in tags for g, _, _ in geo[t]["objs"]]
    zb = pk["zone"].bounds
    for cx in np.arange(zb[0] + W_M / 2, zb[2] - W_M / 2 + 1, W_M / 4):
        for cy in np.arange(zb[1] + W_M * 0.375, zb[3] - W_M * 0.375 + 1, W_M / 4):
            fr = box(cx - W_M / 2, cy - W_M * 0.375, cx + W_M / 2, cy + W_M * 0.375)
            if pk["zone"].intersection(fr).area < 0.98 * fr.area:
                continue
            s = sum(g.intersection(fr).area for g in allg)
            if best is None or s > best[0]:
                best = (s, cx, cy)
    return best[1], best[2]
cx, cy = (frame_auto() if sys.argv[4] == "auto" else (float(sys.argv[4]), float(sys.argv[5])))
H_M = W_M * 0.75
fr = (cx - W_M / 2, cy - H_M / 2, cx + W_M / 2, cy + H_M / 2)
ph = int(PX * 0.75)
with rasterio.open(S.imagery_path(pk["imagery"])) as ds:
    win = from_bounds(*fr, ds.transform)
    arr = ds.read([1, 2, 3], window=win, out_shape=(3, ph, PX), resampling=Resampling.average, boundless=True, fill_value=0)
rgb = np.transpose(arr, (1, 2, 0)).astype(np.uint8)
blank = ((rgb.max(axis=2) < 8) | (rgb.min(axis=2) > 247)).mean()
print("빈 곳 비율", round(float(blank), 4), "틀", [round(v) for v in fr])
if blank > 0.02:
    sys.exit("빈 곳이 보이는 틀 — 버림")
base = Image.fromarray(rgb)
def px(x, y): return ((x - fr[0]) / W_M * PX, (fr[3] - y) / H_M * ph)
def draw(objs, label):
    im = base.copy().convert("RGBA"); ov = Image.new("RGBA", im.size, (0, 0, 0, 0)); d = ImageDraw.Draw(ov)
    fb = box(*fr)
    for g, k, _ in objs:
        if not g.intersects(fb): continue
        g = g.intersection(fb)
        for p in getattr(g, "geoms", [g]):
            if p.geom_type != "Polygon" or p.is_empty: continue
            c = COL.get(k, (255, 255, 255))
            d.polygon([px(*xy) for xy in p.exterior.coords], fill=c + (95,), outline=c + (255,), width=3)
    im = Image.alpha_composite(im, ov).convert("RGB")
    dd = ImageDraw.Draw(im); tw = dd.textlength(label, font=FONT)
    dd.rounded_rectangle([14, 14, 34 + tw, 56], 8, fill=(255, 255, 255)); dd.text((24, 18), label, font=FONT, fill=(25, 31, 40))
    return im
def bar(im):   # 축척 막대(100 m)
    d = ImageDraw.Draw(im); L = 100 / W_M * PX; y = ph - 30
    d.rectangle([20, y - 8, 20 + L + 70, y + 24], fill=(255, 255, 255)); d.line([30, y + 8, 30 + L, y + 8], fill=(25, 31, 40), width=4)
    d.text((38 + L, y - 6), "100 m", font=ImageFont.truetype(r"C:\Windows\Fonts\malgun.ttf", 18), fill=(25, 31, 40)); return im
LAB = {"u1": "지금(1배 · 칸 17 m)", "u0.5": "넓게 0.5배(칸 35 m)", "u0.33": "넓게 0.33배(칸 52 m)"}
o = base.copy(); dd = ImageDraw.Draw(o); tw = dd.textlength("원본", font=FONT)
dd.rounded_rectangle([14, 14, 34 + tw, 56], 8, fill=(255, 255, 255)); dd.text((24, 18), "원본", font=FONT, fill=(25, 31, 40))
bar(o).save(OUT / f"{name}-0-원본.jpg", quality=88)
for t in tags:
    bar(draw(geo[t]["objs"], LAB.get(t, t))).save(OUT / f"{name}-{t}.jpg", quality=88)
    # 필지 묶기(같은 설정 결과 → 필지 하나 = 한 작물)
    pl = geo[t]["plab"]; objs = [(pg, pl[pnu][0], 1.0) for pnu, _, pg in pk["parcels"] if pnu in pl]
    bar(draw(objs, LAB.get(t, t) + " → 필지 묶기")).save(OUT / f"{name}-{t}-필지.jpg", quality=88)
print("그림", OUT, name, [round(cx), round(cy)])
