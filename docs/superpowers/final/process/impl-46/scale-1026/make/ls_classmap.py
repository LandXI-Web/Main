"""산사태 시험 — 두 해 토지피복 지도를 색 그림으로(12분류 · 범례). 결과가 작게 나오는 까닭(산을 '비대상지'로 봄)을 눈으로.
  python ls_classmap.py DIR TAG OUTDIR"""
import sys, os
import numpy as np
from PIL import Image, ImageDraw, ImageFont
DIR, TAG, OUT = sys.argv[1:4]; os.makedirs(OUT, exist_ok=True)
NAMES = ["비대상지", "건물", "주차장", "도로", "가로수", "논", "비닐하우스", "밭", "활엽수림", "침엽수림", "나지", "수역"]
COL = [(200, 200, 200), (240, 68, 82), (120, 120, 120), (90, 90, 90), (150, 200, 120), (130, 190, 240), (230, 230, 255), (240, 200, 90),
       (60, 150, 60), (20, 90, 40), (190, 120, 70), (40, 90, 220)]
F = ImageFont.truetype(r"C:\Windows\Fonts\malgun.ttf", 26)
for yr in (2020, 2025):
    c = np.load(f"{DIR}/{TAG}-{yr}.npz")["cls"]
    k = max(1, c.shape[1] // 2000); c = c[::k, ::k]
    rgb = np.zeros((*c.shape, 3), np.uint8)
    for i, col in enumerate(COL):
        rgb[c == i] = col
    im = Image.fromarray(rgb); d = ImageDraw.Draw(im)
    d.rounded_rectangle([16, 16, 330, 64], 8, fill=(255, 255, 255)); d.text((28, 20), f"{yr} AI 토지피복", font=F, fill=(25, 31, 40))
    y = 80
    for i in (0, 8, 9, 10, 7, 5, 11, 1):
        share = (c == i).mean() * 100
        d.rectangle([16, y, 340, y + 34], fill=(255, 255, 255)); d.rectangle([22, y + 6, 44, y + 28], fill=COL[i])
        d.text((54, y + 2), f"{NAMES[i]} {share:.0f}%", font=F, fill=(25, 31, 40)); y += 36
    im.save(f"{OUT}/ls-{TAG}-{yr}-토지피복.jpg", quality=88)
print("ok")
