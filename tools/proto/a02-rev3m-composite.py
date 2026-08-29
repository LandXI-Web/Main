#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""A02 rev.3m — rev.3l 위성(날개폭 프레임 폭 ≈33 %)만 잘라 60 % 축소, 우상 암부(지구본 밖)로 재배치, 원위치는 배경 클론으로 치유. 크레딧 0.
rev.3k(tools/proto/a01-rev3k-composite.py) 와 같은 방법.

  python tools/proto/a02-rev3m-composite.py [shots_dir]
"""
import sys
from pathlib import Path
import numpy as np, cv2
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
DIR = ROOT / 'landxi/assets/proto/film/legs/anchors-v3'
SCR = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'shots/kie'
SCALE = 0.6
ROT = -6.0          # deg, ccw+ : 배럴(좌하)을 한반도 쪽으로 조금 더 숙임
LUM_T, BLUE_T = 40, 18
HEAL_DIL, LOW_SIG, LIMB_ANG = 25, 20, 29.0   # LIMB_ANG: 디포커스 림 기울기(deg, 우하향)   # rev.3k 는 41/60 — 여기선 좌 날개가 디포커스 림 헤이즈 위라 좁은 시그마로 그라데이션 보존
DEST = (2400, 300)  # 새 위성 중심 (full-res 2736x1520) — 지구본 림 밖 암부

src = np.asarray(Image.open(DIR / 'A02.v3l.png').convert('RGB')).astype(np.float32)
H, W, _ = src.shape

# 1) 위성 매트: 수동 실루엣 다각형(넉넉히) ∩ 색 키(암부 우주 배경 대비 밝기/청색) → 닫힘·구멍 채움.
#    grabCut 은 지구본 헤이즈를 삼키고 버스 그늘면·짙은 셀을 놓쳐 폐기.
x0, y0, x1, y1 = 1400, 100, 2450, 700
roi = np.ascontiguousarray(src[y0:y1, x0:x1].astype(np.uint8))
f = roi.astype(np.float32); lum = f.max(axis=2); blue = f[..., 2] - f[..., 1]
SIL = np.array([(60, 58), (415, 168), (500, 172), (508, 110), (540, 115), (600, 170), (632, 205), (645, 300), (978, 445), (945, 540),
                (585, 400), (560, 450), (455, 450), (340, 432), (330, 395), (345, 345), (395, 330), (390, 262), (345, 262), (42, 110)], np.int32)  # ROI 좌표
poly = np.zeros(roi.shape[:2], np.uint8); cv2.fillPoly(poly, [SIL], 1)
key = ((poly > 0) & ((lum > LUM_T) | (blue > BLUE_T))).astype(np.uint8)
BUS = np.array([(408, 180), (500, 172), (585, 165), (628, 212), (636, 300), (600, 385), (588, 445), (462, 448), (455, 430), (400, 340), (398, 262), (405, 180)], np.int32)
cv2.fillPoly(key, [BUS], 1)                                                # 버스 그늘면(lum≈23, 배경과 동급)은 다각형으로 강제
key = cv2.morphologyEx(key, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
ff = key.copy(); hh, ww = key.shape
mask = np.zeros((hh + 2, ww + 2), np.uint8); cv2.floodFill(ff, mask, (0, 0), 1)
key = (key | (1 - ff)).astype(np.uint8)                                   # 버스 내부 구멍 채움
n, lab, st, _ = cv2.connectedComponentsWithStats(key, 8)
areas = st[:, cv2.CC_STAT_AREA].copy(); areas[0] = 0
key = np.isin(lab, np.argsort(areas)[::-1][:3]).astype(np.uint8)          # 본체+날개 덩어리만
ys, xs = np.where(key); bx0, bx1, by0, by1 = xs.min(), xs.max(), ys.min(), ys.max()
print('satellite bbox (full-res)', x0 + bx0, y0 + by0, x0 + bx1, y0 + by1, 'w=', bx1 - bx0, f'{(bx1-bx0)/W*100:.1f}% of W')
alpha = cv2.GaussianBlur(key.astype(np.float32), (0, 0), 1.2)
alpha = np.clip((alpha - 0.25) / 0.6, 0, 1)
alpha = cv2.dilate(alpha, np.ones((3, 3), np.uint8))
alpha = cv2.GaussianBlur(alpha, (0, 0), 0.8)
vis = roi.copy(); cv2.polylines(vis, [SIL], True, (0, 255, 0), 1); vis[key > 0] = (vis[key > 0] * 0.4 + np.array([255, 0, 255]) * 0.6).astype(np.uint8)
Image.fromarray(vis).save(SCR / 'A02-v3m-key.png')

# 2) 치유: 위성 영역을 인접 암부로 채움 (정규화 컨볼루션 저주파 + 배경 그레인)
near = cv2.dilate(poly, np.ones((61, 61), np.uint8))
extra = (near > 0) & (lum > 35)                                             # 실루엣 밖 얇은 날개 림·부속물도 치유 대상
heal = cv2.dilate((key | extra).astype(np.uint8), np.ones((HEAL_DIL, HEAL_DIL), np.uint8))
full_heal = np.zeros((H, W), np.uint8); full_heal[y0:y1, x0:x1] = heal
clean = (1 - full_heal).astype(np.float32)
# 림 방향 이방성 정규화 컨볼루션: 이 자리 배경은 디포커스 림(약 +29°, 우하향)을 따라 평행 이동 불변이므로, 림이 수평이 되게 돌린 뒤
# 림 방향으로는 길고(σx) 림을 가로질러서는 짧은(σy) 가우시안으로 채운다. 등방성으로 채우면 아래 밝은 바다 헤이즈가 우주로 번져 '안개 혀'가 생김.
diag = int(np.hypot(H, W)) + 2; cx, cy = W / 2, H / 2
Mr = cv2.getRotationMatrix2D((cx, cy), LIMB_ANG, 1.0); Mr[0, 2] += diag / 2 - cx; Mr[1, 2] += diag / 2 - cy
Mi = cv2.invertAffineTransform(Mr)
rot = lambda im: cv2.warpAffine(im, Mr, (diag, diag), flags=cv2.INTER_LINEAR, borderValue=0)
src_r = rot(src); clean_r = rot(clean) * rot(np.ones((H, W), np.float32))   # 캔버스 밖은 clean 0
low_r = None
for sx, sy in ((LOW_SIG * 12, LOW_SIG), (LOW_SIG * 6, LOW_SIG * 0.6), (LOW_SIG * 3, LOW_SIG * 0.4)):   # 굵은 → 고운 순
    num = cv2.GaussianBlur(src_r * clean_r[..., None], (0, 0), sigmaX=sx, sigmaY=sy); den = cv2.GaussianBlur(clean_r, (0, 0), sigmaX=sx, sigmaY=sy)[..., None]
    cur = num / np.maximum(den, 1e-3); w = np.clip(den / 0.25, 0, 1)
    low_r = cur if low_r is None else low_r * (1 - w) + cur * w
low = cv2.warpAffine(low_r, Mi, (W, H), flags=cv2.INTER_LINEAR)
grain_src = src[100:500, 2450:2736]        # 우상 clean 암부
g = grain_src - cv2.GaussianBlur(grain_src, (0, 0), 14)
tile = np.pad(g, ((0, H), (0, W), (0, 0)), mode='reflect')[:H, :W]
healed = low + tile
hm = cv2.GaussianBlur(full_heal.astype(np.float32), (0, 0), 8)[..., None]
plate = src * (1 - hm) + healed * hm

# 3) 위성 축소·회전·배치
sat = roi[by0:by1 + 1, bx0:bx1 + 1]; a = alpha[by0:by1 + 1, bx0:bx1 + 1]
rgba = np.dstack([sat, a[..., None] * 255]).astype(np.float32)
sh, sw = rgba.shape[:2]
M = cv2.getRotationMatrix2D((sw / 2, sh / 2), ROT, SCALE)
out_w, out_h = int(sw * 0.7), int(sh * 0.9)
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
out.save(DIR / 'A02.png'); out.save(DIR / 'A02.jpg', quality=92)
out.resize((1280, round(1280 * H / W)), Image.LANCZOS).save(DIR / 'A02.1280.jpg', quality=90)
# 검토용 100 % 크롭 (치유부 + 새 위성) 및 3.5× 게인
crop = np.clip(plate[0:760, 1350:2736], 0, 255)
Image.fromarray(crop.astype(np.uint8)).save(SCR / 'A02-v3m-crop100.png')
Image.fromarray(np.clip(crop * 3.5, 0, 255).astype(np.uint8)).save(SCR / 'A02-v3m-crop100-gain.png')
Image.fromarray(np.clip(np.hstack([src[0:760, 1350:2736], plate[0:760, 1350:2736]]), 0, 255).astype(np.uint8)).resize((1386, 380)).save(SCR / 'A02-v3m-heal-ab.png')
print('done')
