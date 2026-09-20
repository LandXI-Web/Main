#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""A01 rev.3k — rev.3i(링 없는 지구본)에서 위성만 잘라 50 % 축소, 한반도 상공 우상에 재배치, 원위치는 배경 클론으로 치유. 크레딧 0.

  python tools/proto/a01-rev3k-composite.py
"""
import sys
from pathlib import Path
import numpy as np, cv2
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
DIR = ROOT / 'landxi/assets/proto/film/legs/anchors-v3'
SCR = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'shots/kie'
SCALE = 0.5
ROT = -8.0          # deg, ccw+ : 배럴(좌하)을 한반도 쪽으로 조금 더 숙임
DEST = (1840, 215)  # 새 위성 중심 (full-res 2736x1520)

src = np.asarray(Image.open(DIR / 'A01.v3i.png').convert('RGB')).astype(np.float32)
H, W, _ = src.shape

# 1) 위성 ROI (수동 박스) + 매트: grabCut(밝은 버스·좌 날개) ∪ 수동 다각형(그늘진 우 날개)
x0, y0, x1, y1 = 1650, 40, 2520, 545
roi = np.ascontiguousarray(src[y0:y1, x0:x1].astype(np.uint8))
f = roi.astype(np.float32); lum = f.max(axis=2); blue = f[..., 2] - f[..., 1]
sure = ((lum > 90) | (blue > 45)).astype(np.uint8)
sure = cv2.morphologyEx(sure, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
m = np.full(roi.shape[:2], cv2.GC_PR_BGD, np.uint8); m[sure > 0] = cv2.GC_FGD
m[:45, :] = cv2.GC_BGD; m[:, :10] = cv2.GC_BGD; m[:, 830:] = cv2.GC_BGD; m[200:, :130] = cv2.GC_BGD; m[300:, :250] = cv2.GC_BGD  # 지구본 림
bgm = np.zeros((1, 65), np.float64); fgm = np.zeros((1, 65), np.float64)
cv2.grabCut(cv2.cvtColor(roi, cv2.COLOR_RGB2BGR), m, None, bgm, fgm, 6, cv2.GC_INIT_WITH_MASK)
key = ((m == cv2.GC_FGD) | (m == cv2.GC_PR_FGD)).astype(np.uint8)
key = cv2.morphologyEx(key, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
RIGHT_WING = np.array([[522, 268], [812, 418], [762, 494], [468, 342]], np.int32)   # ROI 좌표, 셀이 어두워 키가 안 잡힘
cv2.fillPoly(key, [RIGHT_WING], 1)
key[200:, :130] = 0; key[300:, :250] = 0                                   # 지구본 림 절대 제외
h_, w_ = key.shape
n, lab, st, _ = cv2.connectedComponentsWithStats(key, 8)
areas = st[:, cv2.CC_STAT_AREA].copy(); areas[0] = 0
key = np.isin(lab, np.argsort(areas)[::-1][:2]).astype(np.uint8)          # 본체+날개 덩어리만
ys, xs = np.where(key); bx0, bx1, by0, by1 = xs.min(), xs.max(), ys.min(), ys.max()
print('satellite bbox (full-res)', x0 + bx0, y0 + by0, x0 + bx1, y0 + by1, 'w=', bx1 - bx0, f'{(bx1-bx0)/W*100:.1f}% of W')
alpha = cv2.GaussianBlur(key.astype(np.float32), (0, 0), 1.2)
alpha = np.clip((alpha - 0.25) / 0.6, 0, 1)
alpha = cv2.dilate(alpha, np.ones((3, 3), np.uint8))
alpha = cv2.GaussianBlur(alpha, (0, 0), 0.8)

# 2) 치유: 위성 영역을 인접 암부로 채움 (inpaint + 배경 그레인)
heal = cv2.dilate(key, np.ones((41, 41), np.uint8))
full_heal = np.zeros((H, W), np.uint8); full_heal[y0:y1, x0:x1] = heal
# 저주파: 치유 영역 밖 clean 픽셀만의 정규화 컨볼루션(넓은 시그마) — inpaint 보다 번짐 없음
clean = (1 - full_heal).astype(np.float32)
num = cv2.GaussianBlur(src * clean[..., None], (0, 0), 60); den = cv2.GaussianBlur(clean, (0, 0), 60)[..., None]
low = num / np.maximum(den, 1e-3)
# 고주파(그레인)는 인접 clean 암부에서 reflect 타일링(경계 씸 없음)
grain_src = src[560:1000, 2300:2736]
g = grain_src - cv2.GaussianBlur(grain_src, (0, 0), 14)
gh, gw = g.shape[:2]
tile = np.pad(g, ((0, H), (0, W), (0, 0)), mode='reflect')[:H, :W]
healed = low + tile
hm = cv2.GaussianBlur(full_heal.astype(np.float32), (0, 0), 8)[..., None]
plate = src * (1 - hm) + healed * hm

# 3) 위성 축소·회전·배치
sat = roi[by0:by1 + 1, bx0:bx1 + 1]; a = alpha[by0:by1 + 1, bx0:bx1 + 1]
rgba = np.dstack([sat, a[..., None] * 255]).astype(np.float32)
sh, sw = rgba.shape[:2]
M = cv2.getRotationMatrix2D((sw / 2, sh / 2), ROT, SCALE)
out_w, out_h = int(sw * 0.8), int(sh * 0.9)
M[0, 2] += out_w / 2 - sw / 2; M[1, 2] += out_h / 2 - sh / 2
small = cv2.warpAffine(rgba, M, (out_w, out_h), flags=cv2.INTER_AREA, borderValue=(0, 0, 0, 0))
sa = small[..., 3:4] / 255
ys, xs = np.where(sa[..., 0] > 0.02)
print('placed wingspan', xs.max() - xs.min(), f'{(xs.max()-xs.min())/W*100:.1f}% of W')
px, py = DEST[0] - out_w // 2, DEST[1] - out_h // 2
region = plate[py:py + out_h, px:px + out_w]
plate[py:py + out_h, px:px + out_w] = region * (1 - sa) + small[..., :3] * sa
print('placed bbox', px + xs.min(), py + ys.min(), px + xs.max(), py + ys.max())

out = Image.fromarray(np.clip(plate, 0, 255).astype(np.uint8))
out.save(DIR / 'A01.png'); out.save(DIR / 'A01.jpg', quality=92)
out.resize((1280, round(1280 * H / W)), Image.LANCZOS).save(DIR / 'A01.1280.jpg', quality=90)
# 검토용 100 % 크롭
Image.fromarray(np.clip(plate[0:620, 1500:2736], 0, 255).astype(np.uint8)).save(SCR / 'A01-v3k-crop100.png')
print('done')
