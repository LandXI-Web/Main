#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Leg 1 모형 지구본 스틸 - 크림 배경을 순백 #FFFFFF 로 바꾸는 후처리.

클라이언트 지시(2026-08-26): 배경은 크림 기미 없는 완전한 흰색.
지구본/황동 링/위성/솜구름 픽셀은 건드리지 않는다.

원리 - 단순 임계값 컷아웃이 아니라 알파 매팅 기반 배경 교체다.

    관측 픽셀  obs = a*F + (1-a)*B      (a = 피사체 커버리지, B = 크림 배경)
    원하는 것  out = a*F + (1-a)*W      (W = 255,255,255)
    따라서     out = obs + (1-a)*(W - B)

즉 더하기 보정이라 경계에서 끊기지 않는다. (1-a) 가 그 픽셀에 섞여 있던
배경의 양이므로, 디포커스로 흐려진 극관(polar cap) 림처럼 배경이 절반쯤
섞인 곳도 정확히 그 비율만큼만 밝아진다. 하드 마스크 컷아웃이 만드는
크림 테두리(halo)나 회색 림이 원리적으로 생기지 않는다.

  * B 는 상수가 아니라 공간적으로 변하는 부드러운 필드로 추정한다.
    실측: 프레임 좌상단 (234,225,208) - 우하단 (239,232,220) 로 최대 12레벨
    기울기가 있고, 파랑 채널에 20레벨 가까운 크로마 노이즈가 있다.
    상수 흰점으로 밀면 그 기울기가 회색 얼룩으로 남는다.
  * 알파는 두 갈래로 만든다.
      - 지구본: 원 피팅(구는 원이다). 림 흐림 폭만큼 램프.
        상단 극관은 배경과 대비가 20레벨뿐이라 밝기 임계값으로는 잡히지 않는다.
      - 링/위성: 배경 편차 기반(황동은 채도가 높아 잘 분리된다).
  * 알파가 0 인 곳은 잔차까지 죽여 정확히 255,255,255 로 만든다
    (필름 그레인이 남으면 순백이 아니다). 비네트/헤이즈는 더하지 않는다.

  python tools/kie/leg-01-white.py [--in <png>] [--scale 0.55]
"""
import argparse
import json
import os
import numpy as np
import scipy.ndimage as ndi
from PIL import Image, ImageDraw, ImageFont

Image.MAX_IMAGE_PIXELS = None
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
GEN = os.path.join(ROOT, 'landxi', 'assets', 'proto', 'film', 'legs', 'gen')


def smooth_bg(a, known, sigma=110.0):
    """정규화 컨볼루션 - 피사체를 뺀 배경 픽셀만으로 부드러운 배경 필드를 만든다.
    피사체 구멍은 주변 배경으로 자연스럽게 메워진다(그 안쪽은 어차피 alpha=1)."""
    k = known.astype(np.float32)
    den = np.maximum(ndi.gaussian_filter(k, sigma, mode='nearest'), 1e-4)
    out = np.empty_like(a)
    for c in range(3):
        num = ndi.gaussian_filter(a[..., c] * k, sigma, mode='nearest')
        out[..., c] = num / den
    return out


def solve3(M, v):
    """3x3 선형계를 여인수 전개로 직접 푼다.
    이 환경의 샌드박스에서는 numpy 의 BLAS/LAPACK 경로(dot/lstsq/inv)가
    프로세스째 죽는다. 그래서 행렬곱을 일절 쓰지 않고 스칼라 산술로만 푼다."""
    a, b, c = M[0]
    d, e, f = M[1]
    g, h, i = M[2]
    A = e * i - f * h
    Bc = -(d * i - f * g)
    C = d * h - e * g
    det = a * A + b * Bc + c * C
    iv = [[A, -(b * i - c * h), b * f - c * e],
          [Bc, a * i - c * g, -(a * f - c * d)],
          [C, -(a * h - b * g), a * e - b * d]]
    return [sum(iv[r][k] * v[k] for k in range(3)) / det for r in range(3)]


def normal_eq(cols, b):
    """정규방정식 (A^T A, A^T b) 를 열별 원소곱 합으로 만든다 (BLAS 미사용)."""
    M = [[float(np.sum(cols[i] * cols[j])) for j in range(3)] for i in range(3)]
    v = [float(np.sum(cols[i] * b)) for i in range(3)]
    return M, v


def fit_circle(mask, skip_top=0.30):
    """디스크 경계점에 최소제곱 원 피팅(Kasa).
    상단은 극관이 흐려 마스크가 잘리므로 위 30% 는 피팅에서 뺀다."""
    ys, _ = np.nonzero(mask)
    y0, y1 = ys.min(), ys.max()
    edge = mask ^ ndi.binary_erosion(mask)
    ey, ex = np.nonzero(edge)
    keep = ey > y0 + (y1 - y0) * skip_top
    ey = ey[keep].astype(np.float64)
    ex = ex[keep].astype(np.float64)
    cols = [ex, ey, np.ones_like(ex)]
    b = ex ** 2 + ey ** 2
    cx = cy = R = 0.0
    for _ in range(3):                                  # 이상치를 한 번씩 잘라낸다
        sol = solve3(*normal_eq(cols, b))
        cx, cy = sol[0] / 2, sol[1] / 2
        R = float(np.sqrt(sol[2] + cx ** 2 + cy ** 2))
        d = np.abs(np.hypot(cols[0] - cx, cols[1] - cy) - R)
        sel = d < max(4.0, 2.5 * float(np.median(d)))
        cols = [c[sel] for c in cols]
        b = b[sel]
    return float(cx), float(cy), R


def build(src, scale=0.55, canvas=(1920, 1080), cy_frac=0.53, feather=14.0):
    a = np.asarray(Image.open(src).convert('RGB'), dtype=np.float32)
    H, W, _ = a.shape

    # --- 1) 거친 피사체 마스크 (배경 상수 근사) ---------------------------
    corner = np.concatenate([a[:80, :80].reshape(-1, 3), a[:80, -80:].reshape(-1, 3),
                             a[-80:, :80].reshape(-1, 3), a[-80:, -80:].reshape(-1, 3)])
    bg0 = np.median(corner, 0)
    blur = np.stack([ndi.gaussian_filter(a[..., c], 1.5) for c in range(3)], -1)
    dev0 = np.abs(blur - bg0).max(2)

    strong = ndi.binary_closing(dev0 > 22, np.ones((7, 7)))
    lab, n = ndi.label(strong)
    sizes = ndi.sum(strong, lab, range(1, n + 1))
    big = np.zeros(n + 1, bool)
    big[1:][sizes > 400] = True                          # 그레인/크로마 노이즈 제거
    subject = ndi.binary_fill_holes(big[lab])

    # --- 2) 지구본 원 피팅 ------------------------------------------------
    # 얇은 링은 반지름 18 원판 오프닝으로 떨어져 나가고 구 디스크만 남는다.
    gy, gx = np.ogrid[-18:19, -18:19]
    disk = (gy * gy + gx * gx) <= 18 * 18
    core = ndi.binary_opening(subject, disk)
    lab2, n2 = ndi.label(core)
    s2 = ndi.sum(core, lab2, range(1, n2 + 1))
    core = ndi.binary_fill_holes(lab2 == (1 + int(np.argmax(s2))))
    cx, cy, R = fit_circle(core)

    yy = np.arange(H, dtype=np.float32)[:, None]
    xx = np.arange(W, dtype=np.float32)[None, :]
    r = np.sqrt((yy - cy) ** 2 + (xx - cx) ** 2)
    t = np.clip((R + feather - r) / (2 * feather), 0.0, 1.0)
    a_disc = t * t * (3 - 2 * t)                         # smoothstep

    # --- 3) 배경 필드 B ---------------------------------------------------
    known = ~ndi.binary_dilation(subject | (a_disc > 0.002), np.ones((25, 25)))
    B = smooth_bg(a, known)

    # --- 4) 링/위성용 편차 알파 ------------------------------------------
    dev = np.abs(blur - B).max(2)
    a_dev = np.clip((dev - 7.0) / 26.0, 0.0, 1.0)
    gate = ndi.binary_dilation(subject, np.ones((15, 15))).astype(np.float32)
    gate = np.clip(ndi.gaussian_filter(gate, 3.0), 0, 1)
    alpha = np.maximum(a_disc, a_dev * gate)
    alpha = np.clip(ndi.gaussian_filter(alpha, 0.8), 0.0, 1.0)

    # --- 5) 매팅 기반 배경 교체 ------------------------------------------
    w = (1.0 - alpha)[..., None]
    kill = np.clip(1.0 - alpha / 0.10, 0.0, 1.0)[..., None]   # alpha=0 이면 잔차까지 제거
    out = np.clip(a + w * (255.0 - B) - w * kill * (a - B), 0, 255)
    solid = alpha > 0.999                                # 지구본/링 내부는 손대지 않았음을 증명
    untouched = float(np.abs(out[solid] - a[solid]).max()) if solid.any() else 0.0

    # --- 6) 리프레이밍: 순백 캔버스 위 지구본 높이 = scale -----------------
    CW, CH = canvas
    s = (scale * CH) / (2 * R)
    im = Image.fromarray(out.round().astype(np.uint8), 'RGB')
    im = im.resize((int(round(W * s)), int(round(H * s))), Image.LANCZOS)
    ox = int(round(CW / 2.0 - cx * s))
    oy = int(round(CH * cy_frac - cy * s))
    canv = Image.new('RGB', (CW, CH), (255, 255, 255))
    canv.paste(im, (ox, oy))

    meta = dict(
        src=os.path.basename(src), src_size=[W, H],
        bg_corner=[round(float(v), 1) for v in bg0],
        circle=dict(cx=round(cx, 1), cy=round(cy, 1), R=round(R, 1),
                    diam_frac_of_src_h=round(2 * R / H, 4)),
        scale=round(s, 5), placed=[ox, oy, im.size[0], im.size[1]], canvas=[CW, CH],
        globe_frac_of_canvas_h=round(2 * R * s / CH, 4),
        disc_centre_frac=[0.5, round(cy_frac, 4)],
        margins_frac=dict(top=round(cy_frac - R * s / CH, 4),
                          bottom=round(1 - cy_frac - R * s / CH, 4),
                          left=round(0.5 - R * s / CW, 4),
                          right=round(0.5 - R * s / CW, 4)),
        solid_px=int(solid.sum()), untouched_max_delta=round(untouched, 4))
    return canv, meta, (cx, cy, R, s, cy_frac)


def verify(canv, geom):
    cx, cy, R, s, cy_frac = geom
    arr = np.asarray(canv, np.float64)
    CH, CW, _ = arr.shape
    ccx, ccy, cR = CW / 2.0, CH * cy_frac, R * s
    yy = np.arange(CH, dtype=np.float32)[:, None]
    xx = np.arange(CW, dtype=np.float32)[None, :]
    rr = np.sqrt((yy - ccy) ** 2 + (xx - ccx) ** 2)
    far = rr > cR + 120
    px = arr[far]
    band = (rr > cR + 8) & (rr < cR + 30)
    pb = arr[band]
    return dict(bg_pixels=int(far.sum()),
                bg_min=[int(v) for v in px.min(0)],
                bg_max=[int(v) for v in px.max(0)],
                bg_mean=[round(float(v), 3) for v in px.mean(0)],
                pure_white_frac=round(float((px == 255).all(1).mean()), 6),
                limb_band_mean=[round(float(v), 2) for v in pb.mean(0)],
                limb_band_min=[int(v) for v in pb.min(0)],
                limb_band_pure_white_frac=round(float((pb == 255).all(1).mean()), 4))


def _font(sz):
    for f in (r'C:\Windows\Fonts\malgun.ttf', r'C:\Windows\Fonts\arial.ttf'):
        try:
            return ImageFont.truetype(f, sz)
        except OSError:
            pass
    return ImageFont.load_default()


def _label(im, text, sz=20):
    d = ImageDraw.Draw(im)
    f = _font(sz)
    d.rectangle([0, 0, im.width, sz + 10], fill=(24, 24, 24))
    d.text((8, 4), text, font=f, fill=(255, 255, 255))
    return im


def sheet(src, white_png, geom, out, tiles=None):
    """검수 시트: 1행 before/after, 2행 after 2배 엣지 크롭, 3행 before 같은 자리 2배 크롭.
    2·3행을 같은 좌표로 놓아야 할로/회색 림/틴트 이음매가 '생겼는지'를 비교로 판정할 수 있다."""
    cx, cy, R, s, cy_frac = geom
    before = Image.open(src).convert('RGB')
    after = Image.open(white_png).convert('RGB')
    CW, CH = after.size
    ccx, ccy, cR = CW / 2.0, CH * cy_frac, R * s
    ox, oy = ccx - cx * s, ccy - cy * s

    if tiles is None:
        tiles = [('상단 극관 림 (가장 흐린 경계)', ccx - 30, ccy - cR + 6),
                 ('좌측 림 + 황동 링', ccx - cR + 4, ccy - cR * 0.45),
                 ('우측 림 + 링 빠져나감', ccx + cR - 4, ccy + cR * 0.30),
                 ('하단 림', ccx - cR * 0.25, ccy + cR - 4),
                 ('솜구름', ccx + cR * 0.52, ccy + cR * 0.22)]
    N, T = len(tiles), 320
    Wd = N * T
    half = T // 4                                        # 2배 확대 -> 160px 원본

    def band(img, sx, sy, scl, tag):
        row = Image.new('RGB', (Wd, T + 30), (24, 24, 24))
        for k, (name, x, y) in enumerate(tiles):
            px, py = sx + x * scl, sy + y * scl
            c = img.crop((int(px - half * scl), int(py - half * scl),
                          int(px + half * scl), int(py + half * scl)))
            c = c.resize((T, T), Image.NEAREST if scl >= 1 else Image.LANCZOS)
            row.paste(c, (k * T, 30))
            d = ImageDraw.Draw(row)
            d.text((k * T + 6, 6), tag + ' | ' + name, font=_font(15), fill=(255, 255, 255))
            d.rectangle([k * T, 30, k * T + T - 1, T + 29], outline=(90, 90, 90))
        return row

    top_h = int(round((Wd / 2) * CH / CW))
    a1 = _label(before.resize((Wd // 2, int(round((Wd / 2) * before.height / before.width))),
                              Image.LANCZOS), 'BEFORE  still-2.png  (크림 #ECE4D6)')
    a2 = _label(after.resize((Wd // 2, top_h), Image.LANCZOS),
                'AFTER  still-2.white.png  (순백 #FFFFFF · 지구본 55%)')
    rowA = Image.new('RGB', (Wd, max(a1.height, a2.height)), (24, 24, 24))
    rowA.paste(a1, (0, 0))
    rowA.paste(a2, (Wd // 2, 0))

    rowB = band(after, 0, 0, 1.0, 'AFTER')
    # before 는 캔버스 좌표를 원본 좌표로 되돌려 같은 자리를 본다: p_src = (p_canvas - o) / s
    rowC = Image.new('RGB', (Wd, T + 30), (24, 24, 24))
    for k, (name, x, y) in enumerate(tiles):
        px, py = (x - ox) / s, (y - oy) / s
        h2 = half / s
        c = before.crop((int(px - h2), int(py - h2), int(px + h2), int(py + h2)))
        c = c.resize((T, T), Image.LANCZOS)
        rowC.paste(c, (k * T, 30))
        d = ImageDraw.Draw(rowC)
        d.text((k * T + 6, 6), 'BEFORE | ' + name, font=_font(15), fill=(255, 255, 255))
        d.rectangle([k * T, 30, k * T + T - 1, T + 29], outline=(90, 90, 90))

    total = Image.new('RGB', (Wd, rowA.height + rowB.height + rowC.height), (24, 24, 24))
    total.paste(rowA, (0, 0))
    total.paste(rowB, (0, rowA.height))
    total.paste(rowC, (0, rowA.height + rowB.height))
    os.makedirs(os.path.dirname(out), exist_ok=True)
    total.save(out, quality=94)
    return out, total.size


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--in', dest='src', default=os.path.join(GEN, 'ch1-leg-01-globe.still-2.png'))
    ap.add_argument('--out', dest='dst', default=None)
    ap.add_argument('--scale', type=float, default=0.55)
    ap.add_argument('--sheet', default=os.path.join(ROOT, 'shots', 'kie', 'leg01-white.jpg'))
    args = ap.parse_args()
    dst = args.dst or args.src.replace('.png', '.white.png')

    canv, meta, geom = build(args.src, scale=args.scale)
    canv.save(dst)
    meta['check'] = verify(canv, geom)
    out, size = sheet(args.src, dst, geom, args.sheet)
    meta['sheet'] = dict(path=os.path.relpath(out, ROOT).replace(os.sep, '/'), size=list(size))
    print(json.dumps(meta, ensure_ascii=False, indent=2))
    print('wrote ' + dst)


if __name__ == '__main__':
    main()
