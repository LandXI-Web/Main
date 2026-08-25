#!/usr/bin/env python
# -*- coding: utf-8 -*-
u"""남원 4시점 정사영상 변화 지수(비지도) 파이프라인.

입력  build/namwon_{2504,2506,2508,2510}.tif  (EPSG:5186, 0.15m, 같은 창)
      — tools/prepare-assets.py --only namwon 이 만든 작업 GeoTIFF.
출력  landxi/assets/data/geo/namwon-change.geojson       (폴리곤, EPSG:4326)
      landxi/assets/data/geo/namwon-change-grid.geojson  (20m 격자 요약)
      landxi/assets/tiles/namwon_change_2504_2510/{z}/{x}/{y}.webp
      landxi/assets/data/change.js
      shots/change/namwon_2504_2510.png                  (퀵룩)

학습된 모델이 아니다. 밴드 차분 + 녹색도(ExG) 차분을 정규화해 임계한 **비지도 변화 지수**다.
자세한 방법과 한계는 tools/change/README.md 참고.

  "C:\\Users\\oem\\anaconda3\\envs\\yolo\\python.exe" tools/change/namwon_change.py
  ... --skip-tiles --debug
"""
from __future__ import annotations

import argparse
import json
import math
import shutil
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.features import shapes as rio_shapes
from scipy import ndimage as ndi
from shapely.geometry import shape as shp_shape, mapping
from skimage.filters import threshold_otsu
from skimage.morphology import binary_closing, binary_opening, disk, remove_small_objects

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / 'build'
GEO = ROOT / 'landxi' / 'assets' / 'data' / 'geo'
DATA = ROOT / 'landxi' / 'assets' / 'data'
TILES = ROOT / 'landxi' / 'assets' / 'tiles'
SHOTS = ROOT / 'shots' / 'change'

PYEXE = sys.executable
GDAL2TILES = Path(sys.prefix) / 'Scripts' / 'gdal2tiles.py'

# 남원 AOI — prepare-assets.py 의 NAMWON_AOI 와 같아야 한다.
AOI = (127.3481, 35.5276, 127.3567, 35.5347)

EPOCHS = ['2504', '2506', '2508', '2510']
PAIRS = [('2504', '2506'), ('2506', '2508'), ('2508', '2510'), ('2504', '2510')]
DOMINANT = ('2504', '2510')
CAPTURED = {'2504': '2025-04', '2506': '2025-06', '2508': '2025-08', '2510': '2025-10'}

RES = 0.5                 # 분석 해상도(m) — 0.15m 원본을 average 로 내린다
MIN_AREA_M2 = 25.0        # 최소 면적
SIMPLIFY_M = 0.3          # 폴리곤 단순화 허용오차(m)
GRID_M = 20.0             # 격자 요약 셀 크기(m)
CHANGE_PCTL = 91.0        # 임계 하한 — 유효 화소의 상위 (100-P)% 만 변화 후보로
TEX_K = 24.0              # 질감 정규화 세기 — 임관·주차선 같은 고주파 오정합 오탐을 누른다
SMOOTH_PX = 5.0           # 변화 지수 가우시안 σ(화소) = 2.5m — 필지 규모 변화가 이기게
CLASSES = ['veg_gain', 'veg_loss', 'built_new', 'other']

# 색 — landxi/assets/css/tokens.css 기준.
#   veg_gain  --ai      #0FA9A0 (청록)
#   built_new --s-doing #E3A008 (호박)
#   veg_loss  마젠타 — 토큰에 없어 호박/적색과 확실히 갈리는 값을 새로 골랐다.
#   other     --s-hold  #6B7A8C (회청)
COLOR = {
    'veg_gain': (15, 169, 160),
    'veg_loss': (214, 36, 143),
    'built_new': (227, 160, 8),
    'other': (107, 122, 140),
}

# 분류 임계 — 성분 평균값 기준.
T_EXG = 0.030             # 정규화 ExG 차 (±)
T_BRIGHT = 0.055          # 밝기 차 (0..1)
TEX_Q = 0.70              # 후영상 텍스처가 변화역 상위 30% 안에 들 것
T_VEG = 0.0               # ExG 식생 판정 하한
T_GMB = 0.03              # 녹−청 색도 하한 — ExG 만으로는 청록 비닐하우스 지붕이 '식생'이 된다


def log(*a):
    print('[change]', *a, flush=True)


def mb(n):
    return f'{n / 1e6:.2f}MB'


def dir_size(p: Path) -> int:
    return sum(f.stat().st_size for f in p.rglob('*') if f.is_file())


# ── 입력 ────────────────────────────────────────────────────────────────────
def read_epoch(tag: str, shape):
    """0.15m GeoTIFF 를 RES 로 average 리샘플해 (rgb float32 0..1, valid bool) 로."""
    src = BUILD / f'namwon_{tag}.tif'
    if not src.exists():
        raise SystemExit(
            f'원본 없음: {src}\n'
            f'  "…/envs/yolo/python.exe" tools/prepare-assets.py --only namwon 를 먼저 돌릴 것')
    with rasterio.open(src) as ds:
        arr = ds.read(out_shape=(ds.count, shape[0], shape[1]),
                      resampling=Resampling.average).astype(np.float32)
    rgb = arr[:3] / 255.0
    # 알파(4밴드) = 촬영 커버리지. 원본 알파가 손실압축을 거쳐 249~254 로 흩어져 있어
    # (255 가 아니다) 미촬영(≈0)만 걸러 낸다. 모자이크 경계는 뒤에서 침식으로 잘라 낸다.
    valid = arr[3] > 192.0
    return rgb, valid


def geo_grid():
    """분석 격자(폭/높이/affine) — 0.15m 원본과 원점을 공유한다."""
    with rasterio.open(BUILD / f'namwon_{EPOCHS[0]}.tif') as ds:
        t = ds.transform
        w = int(math.ceil(ds.width * t.a / RES))
        h = int(math.ceil(ds.height * abs(t.e) / RES))
        crs = ds.crs
    tr = rasterio.Affine(RES, 0, t.c, 0, -RES, t.f)
    return (h, w), tr, crs


# ── 지표 ────────────────────────────────────────────────────────────────────
def indices(rgb):
    """밝기, 정규화 ExG(2g-r-b), 녹-청 차(g-b), 국소 텍스처."""
    bri = rgb.mean(axis=0)
    s = rgb.sum(axis=0) + 1e-6
    r, g, b = rgb[0] / s, rgb[1] / s, rgb[2] / s
    exg = 2 * g - r - b                      # 대략 -1 … +1
    gmb = g - b                              # 식생은 뚜렷이 +, 청록 지붕은 −
    m = ndi.uniform_filter(bri, 5)
    m2 = ndi.uniform_filter(bri * bri, 5)
    tex = np.sqrt(np.maximum(m2 - m * m, 0))  # 5×5(2.5m) 국소 표준편차
    return bri, exg, gmb, tex


def coregister(a_bri, b_bri, valid, rng=8, step=2):
    """전역 평행이동 오정합 보정 — 정사영상 간 수십 cm 어긋남이 경계 오탐의 주범이다.

    ±rng 화소(=±4m)를 정수 격자로 훑어 유효역 평균절대차가 가장 작은 이동량을 고른다.
    (skimage.phase_cross_correlation 은 이 환경에서 프로세스를 죽여 쓰지 않는다.)
    """
    h, w = a_bri.shape
    m = valid[rng:h - rng:step, rng:w - rng:step]
    if m.sum() < 5000:
        return (0.0, 0.0)
    a = a_bri[rng:h - rng:step, rng:w - rng:step][m]
    best, bshift = None, (0, 0)
    for dy in range(-rng, rng + 1):
        for dx in range(-rng, rng + 1):
            b = b_bri[rng + dy:h - rng + dy:step, rng + dx:w - rng + dx:step][m]
            v = float(np.abs(a - b).mean())
            if best is None or v < best:
                best, bshift = v, (dy, dx)
    return (float(bshift[0]), float(bshift[1]))


def radiometric_match(dst, ref, valid):
    """밴드별 median/MAD 로 dst 를 ref 노출·화이트밸런스에 맞춘다(강건 선형)."""
    out = dst.copy()
    for i in range(dst.shape[0]):
        d, r = dst[i][valid], ref[i][valid]
        if d.size < 100:
            continue
        md, mr = np.median(d), np.median(r)
        sd = np.median(np.abs(d - md)) + 1e-6
        sr = np.median(np.abs(r - mr)) + 1e-6
        gain = float(np.clip(sr / sd, 0.5, 2.0))
        out[i] = np.clip((dst[i] - md) * gain + mr, 0, 1)
    return out


# ── 변화 지수 ───────────────────────────────────────────────────────────────
def change_index(A, B, valid):
    """A(전) → B(후) 변화 지수 0..1 과 분류용 부가 지표.

    지수 = (밴드 절대차 + |ExG 차|) / (1 + TEX_K·국소질감) 을 σ=SMOOTH_PX 로 흐린 값.
    분모의 질감 항이 핵심이다 — 나무 임관·이랑처럼 고주파가 센 곳은 몇 cm 오정합이나
    태양각 차이만으로도 큰 차분이 나오는데, 이를 누르지 않으면 결과가 온통 숲 가장자리
    레이스 무늬가 된다(실제로 1차 시도가 그랬다).
    """
    a_bri, a_exg, a_gmb, a_tex = indices(A)
    dy, dx = coregister(a_bri, B.mean(axis=0), valid)
    if dy or dx:
        B = np.stack([ndi.shift(b, (-dy, -dx), order=1, mode='nearest') for b in B])
    # 노출·화이트밸런스 정합은 밝기/밴드 차분에만 쓴다. ExG 는 이미 합으로 나눈 색도
    # 지수라 전역 median 정합을 먹이면 "장면 중앙값 대비 녹색도"로 뜻이 바뀌어,
    # 4월(맨땅 위주) 대비 10월(전체 녹색) 비교에서 숲이 통째로 veg_loss 로 뒤집힌다.
    Bm = radiometric_match(B, A, valid)
    b_bri, _, _, b_tex = indices(Bm)
    _, b_exg, b_gmb, _ = indices(B)

    d_spec = np.abs(Bm - A).mean(axis=0)         # 밴드 절대차 평균 (0..1)
    d_exg = b_exg - a_exg
    raw = 0.55 * (d_spec / 0.25) + 0.45 * (np.abs(d_exg) / 0.20)
    tex = ndi.gaussian_filter(np.maximum(a_tex, b_tex), 3.0)
    raw = raw / (1.0 + TEX_K * tex)
    idx = ndi.gaussian_filter(np.where(valid, raw, 0.0), SMOOTH_PX)
    hi = float(np.percentile(idx[valid], 99.5)) if valid.any() else 1.0
    idx = np.clip(idx / max(hi, 1e-6), 0, 1)     # 0..1 (99.5% 지점을 1로)
    return dict(idx=idx, d_exg=ndi.gaussian_filter(d_exg, 2.0),
                d_bri=ndi.gaussian_filter(b_bri - a_bri, 2.0),
                exg_a=a_exg, exg_b=b_exg, gmb_a=a_gmb, gmb_b=b_gmb,
                tex_b=b_tex, tex_a=a_tex, shift=(dy, dx))


def threshold_mask(idx, valid):
    v = idx[valid]
    try:
        otsu = float(threshold_otsu(v))
    except Exception:
        otsu = float(np.percentile(v, CHANGE_PCTL))
    pct = float(np.percentile(v, CHANGE_PCTL))
    thr = max(otsu, pct)
    mask = (idx >= thr) & valid
    # 열기(잡음 제거) → 닫기(구멍 메움) → 최소 면적
    mask = binary_opening(mask, disk(2))
    mask = binary_closing(mask, disk(3))
    mask = remove_small_objects(mask, int(MIN_AREA_M2 / (RES * RES)))
    # 화소 계단을 한 번 눌러 준다 — 폴리곤 정점 수(=파일 크기)가 크게 줄고 모양도 읽힌다.
    mask = (ndi.gaussian_filter(mask.astype(np.float32), 1.6) >= 0.5) & valid
    mask = remove_small_objects(mask, int(MIN_AREA_M2 / (RES * RES)))
    return mask, thr, otsu, pct


def classify(stats, tex_hi):
    """성분 평균값으로 4분류.

    veg_* 는 '변화 후(전) 영상이 실제로 식생이었을 것'을 함께 요구한다. 이 조건이 없으면
    파란 비닐하우스 지붕처럼 ExG 가 크게 음수인 면이 태양각 차이만으로 veg_gain 이 된다.
    built_new 는 '밝기↑ + 녹색도↓ + 질감↑' 후보일 뿐, 준공 판정이 아니다(나지·정지작업 포함).
    """
    dexg, dbri, tex = stats['dexg'], stats['dbri'], stats['tex']
    if dbri > T_BRIGHT and dexg < -0.5 * T_EXG and tex >= tex_hi:
        return 'built_new'
    if dexg > T_EXG and stats['exg_b'] > T_VEG and stats['gmb_b'] > T_GMB:
        return 'veg_gain'
    if dexg < -T_EXG and stats['exg_a'] > T_VEG and stats['gmb_a'] > T_GMB:
        return 'veg_loss'
    return 'other'


# ── 폴리곤화 ────────────────────────────────────────────────────────────────
def to_wgs84(crs):
    from pyproj import Transformer
    return Transformer.from_crs(crs, 'EPSG:4326', always_xy=True)


def polygonize(pair, mask, res, tr, crs, tf):
    """연결성분 → 분류 → EPSG:4326 폴리곤 리스트."""
    lab, n = ndi.label(mask, structure=np.ones((3, 3), int))
    if n == 0:
        return []
    tex_hi = float(np.percentile(res['tex_b'][mask], TEX_Q * 100)) if mask.any() else 1.0
    idx, d_exg, d_bri, tex_b = res['idx'], res['d_exg'], res['d_bri'], res['tex_b']
    objs = ndi.find_objects(lab)
    props = {}
    for i, sl in enumerate(objs, start=1):
        if sl is None:
            continue
        sub = lab[sl] == i
        props[i] = dict(
            dexg=float(d_exg[sl][sub].mean()),
            dbri=float(d_bri[sl][sub].mean()),
            tex=float(tex_b[sl][sub].mean()),
            exg_a=float(res['exg_a'][sl][sub].mean()),
            exg_b=float(res['exg_b'][sl][sub].mean()),
            gmb_a=float(res['gmb_a'][sl][sub].mean()),
            gmb_b=float(res['gmb_b'][sl][sub].mean()),
            score=float(np.clip(idx[sl][sub].mean(), 0, 1)),
        )

    feats = []
    min_area_px = MIN_AREA_M2
    for geom, val in rio_shapes(lab.astype(np.int32), mask=mask, transform=tr, connectivity=4):
        v = int(val)
        if v not in props:
            continue
        g = shp_shape(geom)
        if g.area < min_area_px:
            continue
        g = g.simplify(SIMPLIFY_M, preserve_topology=False)
        if not g.is_valid:
            g = g.buffer(0)
        if g.is_empty or g.area < min_area_px:
            continue
        p = props[v]
        cls = classify(p, tex_hi)
        area = round(g.area, 1)
        feats.append(dict(type='Feature',
                          properties=dict(pair=f'{pair[0]}-{pair[1]}', cls=cls,
                                          area_m2=area, score=round(p['score'], 3)),
                          geometry=mapping(reproject_geom(g, tf)),
                          _cx=g.centroid.x, _cy=g.centroid.y, _area=area, _cls=cls,
                          _g=g, _tf=tf))
    return feats


def clamp_ll(lon, lat):
    """AOI 바깥으로 20cm쯤 삐져나가는 화소를 잘라 낸다.

    5186 작업창은 WGS84 AOI 네 모서리의 외접 사각형이라 경계에서 최대 ~0.2m 넓다.
    단순화 허용오차(0.35m)보다 작은 양이므로 모양을 해치지 않는다."""
    return (round(min(max(lon, AOI[0]), AOI[2]), 6),
            round(min(max(lat, AOI[1]), AOI[3]), 6))


def reproject_geom(g, tf):
    from shapely.ops import transform as shp_transform

    def _t(x, y, z=None):
        return clamp_ll(*tf.transform(x, y))
    return shp_transform(_t, g)


def build_grid(feats, tr, tf):
    """20m 셀별 count / area_m2 / dominant (셀 안 면적이 가장 큰 클래스)."""
    ox, oy = tr.c, tr.f
    cells = {}
    for f in feats:
        pair = f['properties']['pair']
        cx, cy = int((f['_cx'] - ox) // GRID_M), int((oy - f['_cy']) // GRID_M)
        c = cells.setdefault((pair, cx, cy), dict(count=0, area=0.0, by={}))
        c['count'] += 1
        c['area'] += f['_area']
        c['by'][f['_cls']] = c['by'].get(f['_cls'], 0.0) + f['_area']
    out = []
    for (pair, cx, cy), c in sorted(cells.items()):
        x0, y0 = ox + cx * GRID_M, oy - cy * GRID_M
        ring = [(x0, y0), (x0 + GRID_M, y0), (x0 + GRID_M, y0 - GRID_M), (x0, y0 - GRID_M), (x0, y0)]
        ll = [list(clamp_ll(*tf.transform(x, y))) for x, y in ring]
        dom = max(c['by'].items(), key=lambda kv: kv[1])[0]
        out.append(dict(type='Feature',
                        properties=dict(pair=pair, count=c['count'],
                                        area_m2=round(c['area'], 1), dominant=dom),
                        geometry=dict(type='Polygon', coordinates=[ll])))
    return out


def write_geojson(path: Path, feats, note):
    path.parent.mkdir(parents=True, exist_ok=True)
    fc = dict(type='FeatureCollection', note=note,
              features=[{k: v for k, v in f.items() if not k.startswith('_')} for f in feats])
    path.write_text(json.dumps(fc, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    log(f'  {path.name} {len(fc["features"])}건 {mb(path.stat().st_size)}')


def write_polygons(path: Path, feats, note, budget=800_000):
    """0.3m 단순화가 원칙이지만, 4개 페어를 한 파일에 담으면 예산(800KB)을 넘는다.
    넘을 때만 허용오차를 한 단계씩 올리고 최종 값을 note 에 남긴다(조용히 자르지 않는다)."""
    for tol in (SIMPLIFY_M, 0.35, 0.4, 0.5, 0.8, 1.2):
        for f in feats:
            g = f['_g'].simplify(tol, preserve_topology=False)
            if not g.is_valid:
                g = g.buffer(0)
            if g.is_empty:
                g = f['_g']
            f['geometry'] = mapping(reproject_geom(g, f['_tf']))
        write_geojson(path, feats, f'{note} · simplify={tol}m')
        if path.stat().st_size <= budget:
            log(f'  단순화 허용오차 {tol}m 로 예산 {budget // 1000}KB 충족')
            return tol
    return tol


# ── 히트 타일 ───────────────────────────────────────────────────────────────
def heat_tiles(pair, res, mask, feats_pair, tr, crs, force):
    out = TILES / f'namwon_change_{pair[0]}_{pair[1]}'
    zmin, zmax = 14, 19
    if not force and out.exists() and all((out / str(z)).is_dir() for z in range(zmin, zmax + 1)):
        log(f'skip tiles {out.name} (이미 있음)')
        return out
    h, w = mask.shape
    rgba = np.zeros((4, h, w), np.uint8)
    # 최소 면적을 통과한 연결성분만, 폴리곤과 같은 분류 규칙으로 칠한다.
    lab, n = ndi.label(mask, structure=np.ones((3, 3), int))
    tex_hi = float(np.percentile(res['tex_b'][mask], TEX_Q * 100)) if mask.any() else 1.0
    idx = res['idx']
    for i, sl in enumerate(ndi.find_objects(lab), start=1):
        if sl is None:
            continue
        sub = lab[sl] == i
        if sub.sum() * RES * RES < MIN_AREA_M2:
            continue
        p = dict(dexg=float(res['d_exg'][sl][sub].mean()),
                 dbri=float(res['d_bri'][sl][sub].mean()),
                 tex=float(res['tex_b'][sl][sub].mean()),
                 exg_a=float(res['exg_a'][sl][sub].mean()),
                 exg_b=float(res['exg_b'][sl][sub].mean()),
                 gmb_a=float(res['gmb_a'][sl][sub].mean()),
                 gmb_b=float(res['gmb_b'][sl][sub].mean()))
        cr, cg, cb = COLOR[classify(p, tex_hi)]
        reg = rgba[:, sl[0], sl[1]]
        reg[0][sub] = cr
        reg[1][sub] = cg
        reg[2][sub] = cb
        a = np.clip(70 + 150 * idx[sl][sub], 55, 210)
        reg[3][sub] = a.astype(np.uint8)
    # 가장자리를 살짝 부드럽게(히트맵 느낌). 알파만 흐리면 RGB=0 인 바깥으로 번져
    # '반투명 검정' 후광이 생긴다 — 먼저 색을 최근접 화소로 채운 뒤 알파를 흐린다.
    solid = rgba[3] > 0
    if solid.any():
        near = ndi.distance_transform_edt(~solid, return_indices=True)[1]
        for c in range(3):
            rgba[c] = rgba[c][tuple(near)]
        rgba[3] = ndi.gaussian_filter(rgba[3], 1.0)

    BUILD.mkdir(parents=True, exist_ok=True)
    tif = BUILD / f'change_{pair[0]}_{pair[1]}.tif'
    # ALPHA=YES 가 없으면 4번 밴드가 ColorInterp=Undefined 로 남아 gdal2tiles 가
    # 투명도를 무시하고 전면 불투명 타일을 만든다(실제로 한 번 그렇게 나왔다).
    with rasterio.open(tif, 'w', driver='GTiff', width=w, height=h, count=4,
                       dtype='uint8', crs=crs, transform=tr, photometric='RGB',
                       alpha='YES', compress='DEFLATE', tiled=True) as ds:
        ds.write(rgba)
    if out.exists():
        shutil.rmtree(out)
    cmd = [PYEXE, str(GDAL2TILES), '--xyz', '-z', f'{zmin}-{zmax}', '-w', 'none',
           '-r', 'average', '--processes', '4', '-q', '-x', str(tif), str(out)]
    t0 = time.time()
    r = subprocess.run([str(c) for c in cmd], capture_output=True, text=True, errors='replace')
    if r.returncode != 0:
        sys.stderr.write(r.stdout[-3000:] + '\n' + r.stderr[-3000:] + '\n')
        raise SystemExit('gdal2tiles 실패')
    log(f'  gdal2tiles {out.name} {time.time() - t0:.1f}s')
    png_to_webp(out)
    log(f'  타일 {out.name} {mb(dir_size(out))}')
    return out


def png_to_webp(out: Path):
    from PIL import Image
    n = 0
    for png in list(out.rglob('*.png')):
        try:
            im = Image.open(png).convert('RGBA')
            # 완전히 투명한 타일은 버린다(용량·요청 절약).
            if im.getchannel('A').getextrema()[1] == 0:
                im.close()
                png.unlink()
                continue
            im.save(png.with_suffix('.webp'), 'WEBP', quality=80, method=6)
            im.close()
        except OSError:
            png.unlink(missing_ok=True)
            continue
        png.unlink()
        n += 1
    for junk in list(out.glob('*.xml')) + list(out.glob('*.html')):
        junk.unlink()
    log(f'  webp {n}장')


# ── 퀵룩 ────────────────────────────────────────────────────────────────────
def quicklook(pair, feats_pair, tr, shape, width=1500):
    from PIL import Image, ImageDraw, ImageFont
    h, w = shape
    with rasterio.open(BUILD / f'namwon_{pair[1]}.tif') as ds:
        sc = width / w
        ow, oh = width, int(h * sc)
        rgb = ds.read((1, 2, 3), out_shape=(3, oh, ow), resampling=Resampling.average)
    im = Image.fromarray(np.transpose(rgb, (1, 2, 0)), 'RGB').convert('RGBA')
    ov = Image.new('RGBA', im.size, (0, 0, 0, 0))
    dr = ImageDraw.Draw(ov)
    ox, oy = tr.c, tr.f
    ppm = ow / (w * RES)                       # 화면 픽셀 / m

    def px(x, y):
        return ((x - ox) * ppm, (oy - y) * ppm)

    for f in feats_pair:
        g = f['_g']
        polys = g.geoms if g.geom_type == 'MultiPolygon' else [g]
        c = COLOR[f['_cls']]
        for p in polys:
            pts = [px(x, y) for x, y in p.exterior.coords]
            if len(pts) < 3:
                continue
            dr.polygon(pts, fill=c + (70,), outline=c + (235,), width=2)
    im = Image.alpha_composite(im, ov)
    dr = ImageDraw.Draw(im)
    try:
        font = ImageFont.truetype('malgun.ttf', 20)
        small = ImageFont.truetype('malgun.ttf', 16)
    except OSError:
        font = small = ImageFont.load_default()
    n_by = {}
    for f in feats_pair:
        n_by[f['_cls']] = n_by.get(f['_cls'], 0) + 1
    lines = [f'남원 변화 지수(비지도) {pair[0]} → {pair[1]} · 배경 = {pair[1]} 정사영상']
    lines += [f'{c}: {n_by.get(c, 0)}건' for c in CLASSES]
    dr.rectangle([10, 10, 430, 30 + 26 * len(lines)], fill=(10, 20, 35, 190))
    for i, t in enumerate(lines):
        col = (255, 255, 255) if i == 0 else COLOR[CLASSES[i - 1]]
        dr.text((22, 20 + 26 * i), t, fill=col, font=font if i == 0 else small)
    SHOTS.mkdir(parents=True, exist_ok=True)
    p = SHOTS / f'namwon_{pair[0]}_{pair[1]}.png'
    # 항공사진 트루컬러 PNG 는 4MB 를 넘는다. 검수용 퀵룩이므로 256색으로 양자화한다.
    im.convert('RGB').quantize(colors=256, method=Image.Quantize.MEDIANCUT,
                               dither=Image.Dither.FLOYDSTEINBERG).save(p, 'PNG', optimize=True)
    log(f'  퀵룩 {p.relative_to(ROOT)} {mb(p.stat().st_size)}')
    return p


# ── change.js ───────────────────────────────────────────────────────────────
def write_js(entries):
    body = json.dumps(entries, ensure_ascii=False, indent=2)
    txt = (u'// 변화 지수(비지도) 카탈로그 — tools/change/namwon_change.py 가 실제 정사영상에서 생성.\n'
           u'// 학습 모델의 탐지 결과가 아니다. UI 는 반드시 "변화 지수(비지도)" 로 표기할 것.\n'
           u'// 자동 생성 — 직접 고치지 말고 파이프라인을 다시 돌릴 것.\n'
           u'export const CHANGE = ' + body + ';\n\n'
           u'export const changeByPair = (pair) => CHANGE.find(c => c.pair === pair) || null;\n')
    (DATA / 'change.js').write_text(txt, encoding='utf-8')
    log(f'  change.js {mb((DATA / "change.js").stat().st_size)}')


# ── 메인 ────────────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--skip-tiles', action='store_true')
    ap.add_argument('--skip-quicklook', action='store_true')
    ap.add_argument('--force', action='store_true')
    ap.add_argument('--debug', action='store_true')
    args = ap.parse_args()

    shape, tr, crs = geo_grid()
    log(f'분석 격자 {shape[1]}×{shape[0]} @ {RES}m, {crs}')

    imgs, valids = {}, {}
    for e in EPOCHS:
        imgs[e], valids[e] = read_epoch(e, shape)
        log(f'  {e} 유효화소 {100 * valids[e].mean():.1f}%')
    common = np.logical_and.reduce([valids[e] for e in EPOCHS])
    common = ndi.binary_erosion(common, disk(4))       # 모자이크 경계 2m 잘라 낸다
    log(f'  4시점 공통 유효역 {100 * common.mean():.1f}% ({common.sum() * RES * RES / 1e4:.2f}ha)')

    tf = to_wgs84(crs)
    all_feats, entries = [], []
    cache = {}
    for pair in PAIRS:
        t0 = time.time()
        res = change_index(imgs[pair[0]], imgs[pair[1]], common)
        mask, thr, otsu, pct = threshold_mask(res['idx'], common)
        feats = polygonize(pair, mask, res, tr, crs, tf)
        log(f'{pair[0]}→{pair[1]} shift={tuple(round(v, 2) for v in res["shift"])} '
            f'otsu={otsu:.3f} p{CHANGE_PCTL:.0f}={pct:.3f} thr={thr:.3f} '
            f'변화면적={mask.sum() * RES * RES / 1e4:.2f}ha({100 * mask.sum() / max(common.sum(), 1):.1f}%) '
            f'폴리곤={len(feats)} {time.time() - t0:.1f}s')
        by = {}
        area = 0.0
        for f in feats:
            by[f['_cls']] = by.get(f['_cls'], 0) + 1
            area += f['_area']
        log('   ', {c: by.get(c, 0) for c in CLASSES}, f'총 {area / 1e4:.2f}ha')
        cache[pair] = (res, mask, feats)
        all_feats += feats
        entries.append(dict(pair=f'{pair[0]}-{pair[1]}', from_=pair[0], to=pair[1],
                            _n=len(feats), _area=round(area, 1),
                            _by={c: by.get(c, 0) for c in CLASSES}))

    tol = write_polygons(GEO / 'namwon-change.geojson', all_feats,
                         '비지도 변화 지수(질감정규화 밴드차 + ExG 차, Otsu/백분위 임계) — 학습 모델 탐지 아님')
    grid = build_grid(all_feats, tr, tf)
    write_geojson(GEO / 'namwon-change-grid.geojson', grid, '20m 격자 변화 요약')

    tiles_path = None
    if not args.skip_tiles:
        res, mask, feats = cache[DOMINANT]
        heat_tiles(DOMINANT, res, mask, feats, tr, crs, args.force)
        tiles_path = (f'assets/tiles/namwon_change_{DOMINANT[0]}_{DOMINANT[1]}'
                      '/{z}/{x}/{y}.webp')
    else:
        d = TILES / f'namwon_change_{DOMINANT[0]}_{DOMINANT[1]}'
        if d.exists():
            tiles_path = (f'assets/tiles/namwon_change_{DOMINANT[0]}_{DOMINANT[1]}'
                          '/{z}/{x}/{y}.webp')

    out = []
    for e in entries:
        pair = tuple(e['pair'].split('-'))
        out.append({
            'pair': e['pair'], 'from': e['from_'], 'to': e['to'],
            'fromDate': CAPTURED[e['from_']], 'toDate': CAPTURED[e['to']],
            'label': f"{CAPTURED[e['from_']]} → {CAPTURED[e['to']]}",
            'method': '변화 지수(비지도)', 'bounds': list(AOI),
            'polygons': 'assets/data/geo/namwon-change.geojson',
            'grid': 'assets/data/geo/namwon-change-grid.geojson',
            'tiles': tiles_path if pair == DOMINANT else None,
            'minzoom': 14, 'maxzoom': 19,
            'stats': {'n': e['_n'], 'area_m2': e['_area'], 'byClass': e['_by']},
        })
    write_js(out)

    if not args.skip_quicklook:
        quicklook(DOMINANT, cache[DOMINANT][2], tr, shape)
    log('완료')


if __name__ == '__main__':
    main()
