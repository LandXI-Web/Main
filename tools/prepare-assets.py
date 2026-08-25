#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Land-XI 실자산 파이프라인.

원본(정사영상·탐지 벡터·학습 모델)은 절대 수정하지 않고, 프론트엔드가 바로 쓸 수 있는
작은 산출물만 만든다.

  (a) 남원 4시점 정사영상  → landxi/assets/tiles/namwon_25xx/{z}/{x}/{y}.webp
  (b) 국산리 드론 2회차    → landxi/assets/tiles/kuksan_a68|a71/...
  (c) 제주 항공·세그먼트   → landxi/assets/tiles/jeju_2022|jeju_landcover/...
  (d) 실탐지 벡터          → landxi/assets/data/geo/*.geojson
  (e) 모델 메타            → landxi/assets/data/models.js
  (f) 브랜드 자산 + CI 블루 → landxi/assets/brand/*, tokens.css

각 단계는 산출물이 이미 있으면 건너뛴다(`--force` 로 재생성).

  "C:\\Users\\oem\\anaconda3\\envs\\yolo\\python.exe" tools/prepare-assets.py
  ... --force --only namwon,vectors
"""
from __future__ import annotations

import argparse
import colorsys
import json
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

from osgeo import gdal, ogr, osr

gdal.UseExceptions()
ogr.UseExceptions()

# 한국어 윈도우 콘솔(cp949)에서도 로그가 깨지거나 죽지 않도록 UTF-8 로 고정한다.
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

ROOT = Path(__file__).resolve().parents[1]
TILES = ROOT / 'landxi' / 'assets' / 'tiles'
GEO = ROOT / 'landxi' / 'assets' / 'data' / 'geo'
DATA = ROOT / 'landxi' / 'assets' / 'data'
BRAND = ROOT / 'landxi' / 'assets' / 'brand'
BUILD = ROOT / 'build'            # 중간 GeoTIFF (gitignore)
TOKENS = ROOT / 'landxi' / 'assets' / 'css' / 'tokens.css'

PYEXE = sys.executable
GDAL2TILES = Path(sys.prefix) / 'Scripts' / 'gdal2tiles.py'
GDALBIN = Path(sys.prefix) / 'Library' / 'bin'


def tool(name: str) -> str:
    p = GDALBIN / (name + '.exe')
    return str(p) if p.exists() else name


# ── 원본 정의 ────────────────────────────────────────────────────────────────
# 남원 AOI — 4시점이 완전히 같은 창을 쓴다.
#
# 애초 계획은 도통동·시청 일대(127.379–127.401 / 35.399–35.421)였지만, 4시점의 알파밴드
# 커버리지를 20m 격자로 교차해 보니 시청 일대는 2504/2508 에 촬영분이 없다. 4시점 공통
# 촬영 면적은 21.8km² 이고 조각나 있어서 2km 창은 최대 64%, 1km 창도 92% 밖에 못 덮는다.
# 그래서 4시점 모두 99.4% 덮이는 800m 창(시청 북서 13km, 계단식 논·비닐하우스 지대)으로
# 옮겼다 — 4시점 시계열 비교가 실제로 성립하는 유일한 구간이다.
#   커버리지 산출: tools/prepare-assets.py 와 같은 알파밴드 교차(20m 셀) 방식.
NAMWON_AOI = (127.3481, 35.5276, 127.3567, 35.5347)     # W, S, E, N (WGS84), ≈780×790m

NAMWON = [
    ('namwon_2504', r'F:\namwon_final\nw_2504.tif', '2025-04', '남원 농경지 · 2025.04'),
    ('namwon_2506', r'E:\namwon_final\nw_2506.tif', '2025-06', '남원 농경지 · 2025.06'),
    ('namwon_2508', r'E:\namwon_final\nw_2508.tif', '2025-08', '남원 농경지 · 2025.08'),
    ('namwon_2510', r'E:\namwon_final\nw_2510.tif', '2025-10', '남원 농경지 · 2025.10'),
]
KUKSAN = [
    ('kuksan_a68', r'F:\a68_out\ortho_kuksan2_a68_zenmuse.tif', '2025-08', '국산리 드론 A68 · 2025.08'),
    ('kuksan_a71', r'F:\a71_out\ortho_kuksan2_a71_zenmuse.tif', '2025-08', '국산리 드론 A71 · 2025.08'),
]
JEJU = [
    ('jeju_2022', r'D:\python\lx_2023\336081285_AE_2022_12.tif', '2022-12', '제주 항공 정사영상 · 2022.12', 'ortho', 'bilinear'),
    ('jeju_landcover', r'D:\python\lx_2023\segmented_image.tif', '2022-12', '제주 토지형질 세그멘테이션', 'landcover', 'near'),
    # detected_objects.shp(=jeju-illegal.geojson) 는 126.896–126.899/33.515–33.517 에 있어
    # 2022 도엽(126.820/33.505)과 겹치지 않는다. 탐지 결과가 실제로 얹히는 도엽을 같이 낸다.
    ('jeju_2020', r'D:\python\lx_2023\336081370_AE_2020_12.tif', '2020-12', '제주 항공 정사영상 · 2020.12(불법건축물 도엽)', 'ortho', 'bilinear'),
]

DEBRIS_SRC = r'D:\python\jeonnamdo\jeonam_debris_wgs84.geojson'
RESULT_SRC = r'D:\python\jeonnamdo\result_wgs84.geojson'
JEJU_SHP = r'D:\python\lx_2023\detected_objects.shp'

MODEL_DIR = Path(r'D:\python\99. LX 부서별 협력사항\02. 지적사업혁신처')
LX2023 = Path(r'D:\python\lx_2023')

BRAND_URLS = [
    ('landxi-logo-big.png', 'https://land-xi.lx.or.kr/lnxi/public/lnxi/lbl/common/images/front/logo_big_v3.png'),
    ('landxi-wordmark.png', 'https://land-xi.lx.or.kr/lnxi/public/lnxi/lbl/common/images/front/logo.png'),
    ('landxi-wordmark-dark.png', 'https://mini531.github.io/namwon-smart-village/landxi7/assets/images/logo_landxi_dark.png'),
    ('lx-symbol.png', 'https://mini531.github.io/namwon-smart-village/landxi7/assets/images/lx_symbol.png'),
]

WEBP_QUALITY = 80
SIZE_BUDGET_MB = 200


# ── 도우미 ───────────────────────────────────────────────────────────────────
def log(*a):
    print('[prepare]', *a, flush=True)


def run(cmd, what):
    t0 = time.time()
    log('$', ' '.join(str(c) for c in cmd[:4]), '…')
    r = subprocess.run([str(c) for c in cmd], capture_output=True, text=True, errors='replace')
    if r.returncode != 0:
        sys.stderr.write(r.stdout[-4000:] + '\n' + r.stderr[-4000:] + '\n')
        raise SystemExit(f'{what} 실패 (exit {r.returncode})')
    log(f'  ✓ {what} {time.time() - t0:.1f}s')
    return r


def dir_size(p: Path) -> int:
    return sum(f.stat().st_size for f in p.rglob('*') if f.is_file())


def mb(n: int) -> str:
    return f'{n / 1e6:.1f}MB'


def transform(src_epsg: int, dst_epsg: int):
    a = osr.SpatialReference(); a.ImportFromEPSG(src_epsg); a.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    b = osr.SpatialReference(); b.ImportFromEPSG(dst_epsg); b.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    return osr.CoordinateTransformation(a, b)


def aoi_to(epsg: int, aoi):
    """WGS84 bbox → 대상 좌표계의 (ulx, uly, lrx, lry) — 네 모서리를 모두 변환한 외접 사각형."""
    ct = transform(4326, epsg)
    xs, ys = [], []
    for lon in (aoi[0], aoi[2]):
        for lat in (aoi[1], aoi[3]):
            x, y, _ = ct.TransformPoint(lon, lat)
            xs.append(x); ys.append(y)
    return (min(xs), max(ys), max(xs), min(ys))


def wgs84_bounds(path) -> list:
    """래스터의 WGS84 bbox [W, S, E, N] (소수점 6자리)."""
    ds = gdal.Open(str(path))
    gt = ds.GetGeoTransform()
    sr = osr.SpatialReference(wkt=ds.GetProjection())
    epsg = int(sr.GetAuthorityCode(None))
    corners = [(gt[0], gt[3]),
               (gt[0] + gt[1] * ds.RasterXSize, gt[3]),
               (gt[0], gt[3] + gt[5] * ds.RasterYSize),
               (gt[0] + gt[1] * ds.RasterXSize, gt[3] + gt[5] * ds.RasterYSize)]
    ds = None
    ct = transform(epsg, 4326)
    pts = [ct.TransformPoint(x, y) for x, y in corners]
    lons = [p[0] for p in pts]; lats = [p[1] for p in pts]
    return [round(min(lons), 6), round(min(lats), 6), round(max(lons), 6), round(max(lats), 6)]


def native_gsd(path) -> float:
    ds = gdal.Open(str(path))
    g = abs(ds.GetGeoTransform()[1])
    ds = None
    return round(g, 4)


# ── (a~c) 타일링 ─────────────────────────────────────────────────────────────
def complete_zooms(out: Path, zmin: int, zmax: int) -> bool:
    """요청한 줌이 하나도 빠짐없이 만들어져 있는지. 중간에 죽은 실행을 걸러 낸다."""
    return out.exists() and all((out / str(z)).is_dir() and next((out / str(z)).rglob('*.*'), None)
                                for z in range(zmin, zmax + 1))


def make_tiles(tid: str, src: Path, zoom: str, resample: str, force: bool, exclude=True):
    out = TILES / tid
    zmin, zmax = (int(v) for v in zoom.split('-'))
    if not force and complete_zooms(out, zmin, zmax):
        # 중간에 죽어 PNG 가 남아 있으면 변환만 이어서 끝낸다(재실행 안전).
        if next(out.rglob('*.png'), None):
            log(f'resume webp {tid} (PNG 잔여분 변환)')
            if png_to_webp(out) == 0:
                return out
            log(f'  깨진 타일이 있어 {tid} 전체를 다시 만든다')   # 구멍 난 채로 두지 않는다
        else:
            log(f'skip tiles {tid} (이미 있음)')
            return out
    if out.exists():
        shutil.rmtree(out)
    cmd = [PYEXE, GDAL2TILES, '--xyz', '-z', zoom, '-w', 'none', '-r', resample,
           '--processes', '4', '-q']
    if exclude:
        cmd.append('-x')
    cmd += [str(src), str(out)]
    run(cmd, f'gdal2tiles {tid}')
    png_to_webp(out)
    return out


def png_to_webp(out: Path) -> int:
    """PNG → webp(q80) 변환 후 PNG 삭제. 깨진 PNG(중단된 실행의 잔해) 수를 돌려준다."""
    from PIL import Image
    t0 = time.time()
    n = bad = 0
    for png in list(out.rglob('*.png')):
        try:
            im = Image.open(png)
            im = im.convert('RGBA' if 'A' in im.getbands() else 'RGB')
            im.save(png.with_suffix('.webp'), 'WEBP', quality=WEBP_QUALITY, method=6)
            im.close()
        except OSError as e:
            # 실행이 중간에 죽으면 마지막 PNG 가 잘려 있을 수 있다. 지우고 세어 둔다.
            log(f'  !! 깨진 PNG {png.relative_to(out)}: {e}')
            png.with_suffix('.webp').unlink(missing_ok=True)
            png.unlink()
            bad += 1
            continue
        png.unlink()
        n += 1
    for junk in list(out.glob('*.xml')) + list(out.glob('*.html')):
        junk.unlink()
    log(f'  ✓ webp q{WEBP_QUALITY} {n}장 {time.time() - t0:.1f}s' + (f' (깨짐 {bad}장)' if bad else ''))
    return bad


def tif_ok(p: Path) -> bool:
    """작업 GTiff 가 실제로 화소를 담고 있는지. 중단된 gdal_translate 는 헤더만 있고
    전 화소가 0(알파=0)인 파일을 남기므로, 존재 여부만으로는 건너뛸 수 없다."""
    try:
        ds = gdal.Open(str(p))
        b = ds.GetRasterBand(ds.RasterCount)
        a = b.ReadAsArray(buf_xsize=min(512, ds.RasterXSize), buf_ysize=min(512, ds.RasterYSize))
        ds = None
        return bool(a is not None and a.max() > 0)
    except Exception:
        return False


def crop(src: str, dst: Path, projwin, tr: float, extra=(), force=False):
    if dst.exists() and not force:
        if tif_ok(dst):
            log(f'skip crop {dst.name} (이미 있음)')
            return dst
        log(f'!! {dst.name} 이 비어 있다(중단된 실행) — 다시 만든다')
        dst.unlink()
    dst.parent.mkdir(parents=True, exist_ok=True)
    cmd = [tool('gdal_translate'), '-of', 'GTiff', '-tr', tr, tr, '-r', 'average',
           '-co', 'TILED=YES', '-co', 'COMPRESS=DEFLATE', '-co', 'BIGTIFF=IF_SAFER']
    if projwin:
        cmd += ['-projwin', projwin[0], projwin[1], projwin[2], projwin[3]]
    cmd += list(extra) + [src, str(dst)]
    run(cmd, f'gdal_translate {dst.name}')
    log(f'  작업 파일 {dst.name} {mb(dst.stat().st_size)}')
    return dst


def step_namwon(force: bool, entries: list):
    win = aoi_to(5186, NAMWON_AOI)
    log('남원 AOI EPSG:5186 projwin =', ' '.join(f'{v:.3f}' for v in win))
    for tid, src, captured, label in NAMWON:
        if not Path(src).exists():
            log(f'!! 원본 없음: {src} — {tid} 건너뜀')
            continue
        work = BUILD / f'{tid}.tif'
        # 원본(1.5cm, 수백 GB)을 그대로 자르면 안 된다. 오버뷰를 타고 0.15m 로 내려 받는다.
        # AOI 가 800m 로 작아진 만큼 z19 까지 올려 상세도를 되찾는다(0.15m ≥ z19 의 0.24m).
        crop(src, work, win, 0.15, extra=['-b', '1', '-b', '2', '-b', '3', '-b', '4',
                                          '-colorinterp_4', 'alpha'], force=force)
        make_tiles(tid, work, '12-19', 'bilinear', force)
        entries.append(dict(id=tid, label=label, kind='ortho', gsd=native_gsd(src),
                            captured=captured, bounds=list(NAMWON_AOI), minzoom=12, maxzoom=19,
                            tiles=f'assets/tiles/{tid}/{{z}}/{{x}}/{{y}}.webp'))


def step_kuksan(force: bool, entries: list):
    for tid, src, captured, label in KUKSAN:
        if not Path(src).exists():
            log(f'!! 원본 없음: {src} — {tid} 건너뜀')
            continue
        work = BUILD / f'{tid}.tif'
        crop(src, work, None, 0.2, extra=['-a_nodata', '0'], force=force)
        make_tiles(tid, work, '13-19', 'bilinear', force)
        entries.append(dict(id=tid, label=label, kind='ortho', gsd=native_gsd(src),
                            captured=captured, bounds=wgs84_bounds(work), minzoom=13, maxzoom=19,
                            tiles=f'assets/tiles/{tid}/{{z}}/{{x}}/{{y}}.webp'))


def step_jeju(force: bool, entries: list):
    for tid, src, captured, label, kind, resample in JEJU:
        if not Path(src).exists():
            log(f'!! 원본 없음: {src} — {tid} 건너뜀')
            continue
        # 제주 원본은 작아서(≈4천×4천) 그대로 타일링한다.
        make_tiles(tid, Path(src), '13-19', resample, force)
        entries.append(dict(id=tid, label=label, kind=kind, gsd=native_gsd(src),
                            captured=captured, bounds=wgs84_bounds(src), minzoom=13, maxzoom=19,
                            tiles=f'assets/tiles/{tid}/{{z}}/{{x}}/{{y}}.webp'))


# ── (d) 벡터 ────────────────────────────────────────────────────────────────
def feature_count(path: Path) -> int:
    ds = ogr.Open(str(path))
    n = ds.GetLayer(0).GetFeatureCount()
    ds = None
    return n


def step_marine(force: bool):
    out = GEO / 'marine-debris.geojson'
    if not out.exists() or force:
        if not Path(DEBRIS_SRC).exists():
            raise SystemExit(f'원본 없음: {DEBRIS_SRC}')
        if out.exists():
            out.unlink()
        sql = ("SELECT confidence, class, area_m2 FROM jeonam_debris_wgs84 "
               "ORDER BY confidence DESC LIMIT 5000")
        base = [tool('ogr2ogr'), '-f', 'GeoJSON', '-lco', 'COORDINATE_PRECISION=5',
                '-simplify', '0.00002']
        try:
            run(base + [str(out), DEBRIS_SRC, '-sql', sql], 'ogr2ogr marine-debris')
            assert feature_count(out) == 5000
        except (SystemExit, AssertionError, Exception):
            # OGR SQL 방언이 ORDER BY … LIMIT 를 못 받으면 SQLite 방언으로 재시도.
            log('  OGR SQL 실패 → -dialect SQLite 로 재시도')
            if out.exists():
                out.unlink()
            sql2 = ("SELECT confidence, class, area_m2, geometry FROM jeonam_debris_wgs84 "
                    "ORDER BY confidence DESC LIMIT 5000")
            run(base + ['-dialect', 'SQLite', str(out), DEBRIS_SRC, '-sql', sql2],
                'ogr2ogr marine-debris (SQLite)')
        log(f'  marine-debris.geojson {feature_count(out)}건 {mb(out.stat().st_size)}')
    else:
        log('skip marine-debris.geojson (이미 있음)')

    grid = GEO / 'marine-debris-grid.geojson'
    if grid.exists() and not force:
        log('skip marine-debris-grid.geojson (이미 있음)')
        return
    build_grid(grid)


CELL = 0.0045   # ≈ 500m


def cell_key(lon, lat):
    return (int(lon // CELL), int(lat // CELL))


def iter_points(path, lon_field='중심_경도', lat_field='중심_위도'):
    """대용량 GeoJSON을 OGR 로 스트리밍하며 (lon, lat, 속성) 만 뽑는다(메모리 절약)."""
    ds = ogr.Open(str(path))
    lyr = ds.GetLayer(0)
    defn = lyr.GetLayerDefn()
    names = {defn.GetFieldDefn(i).GetName() for i in range(defn.GetFieldCount())}
    for f in lyr:
        if lon_field in names and lat_field in names and f.GetField(lon_field) is not None:
            lon, lat = f.GetField(lon_field), f.GetField(lat_field)
        else:
            g = f.GetGeometryRef()
            if g is None:
                continue
            c = g.Centroid()
            lon, lat = c.GetX(), c.GetY()
        yield lon, lat, f
    ds = None


def build_grid(out: Path):
    t0 = time.time()
    cells = {}
    total = 0
    nulls = 0
    for lon, lat, f in iter_points(DEBRIS_SRC):
        k = cell_key(lon, lat)
        c = cells.setdefault(k, {'count': 0, 'conf': 0.0, 'conf_n': 0, 'giin': {}})
        c['count'] += 1
        # 원본 38,057건 중 13건은 confidence 가 비어 있다. 0 으로 세면 평균이 내려가므로
        # 값이 있는 건만 평균에 넣고, 몇 건으로 낸 평균인지(conf_n)를 같이 적는다.
        conf = f.GetField('confidence')
        if conf is None:
            nulls += 1
        else:
            c['conf'] += float(conf)
            c['conf_n'] += 1
        total += 1
    log(f'  격자 집계: 해양쓰레기 {total}건 → {len(cells)}셀 '
        f'(confidence 결측 {nulls}건) {time.time() - t0:.1f}s')

    if Path(RESULT_SRC).exists():
        n = 0
        for lon, lat, f in iter_points(RESULT_SRC):
            k = cell_key(lon, lat)
            c = cells.get(k)
            if c is None:
                continue    # 해양쓰레기 탐지가 없는 셀은 만들지 않는다
            g = f.GetField('giin') or '미분류'
            c['giin'][g] = c['giin'].get(g, 0) + 1
            n += 1
        log(f'  기인(giin) 집계 {n}건 반영')

    feats = []
    for (ix, iy), c in sorted(cells.items()):
        w, s = round(ix * CELL, 5), round(iy * CELL, 5)
        e, nn = round(w + CELL, 5), round(s + CELL, 5)
        props = {'count': c['count'], 'conf_n': c['conf_n'],
                 'mean_conf': round(c['conf'] / c['conf_n'], 4) if c['conf_n'] else None}
        if c['giin']:
            props['giin'] = c['giin']
        feats.append({'type': 'Feature', 'properties': props,
                      'geometry': {'type': 'Polygon',
                                   'coordinates': [[[w, s], [e, s], [e, nn], [w, nn], [w, s]]]}})
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({'type': 'FeatureCollection', 'cellDeg': CELL,
                               'source': 'jeonam_debris_wgs84 + result_wgs84',
                               'features': feats}, ensure_ascii=False), encoding='utf-8')
    log(f'  marine-debris-grid.geojson {len(feats)}셀 {mb(out.stat().st_size)}')


def step_jeju_vector(force: bool):
    out = GEO / 'jeju-illegal.geojson'
    if out.exists() and not force:
        log('skip jeju-illegal.geojson (이미 있음)')
        return
    if not Path(JEJU_SHP).exists():
        raise SystemExit(f'원본 없음: {JEJU_SHP}')
    if out.exists():
        out.unlink()
    run([tool('ogr2ogr'), '-f', 'GeoJSON', '-t_srs', 'EPSG:4326',
         '-lco', 'COORDINATE_PRECISION=5', str(out), JEJU_SHP], 'ogr2ogr jeju-illegal')
    log(f'  jeju-illegal.geojson {feature_count(out)}건')


# ── (e) 모델 메타 ────────────────────────────────────────────────────────────
COCO = ['person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat',
        'traffic light', 'fire hydrant', 'stop sign', 'parking meter', 'bench', 'bird', 'cat',
        'dog', 'horse', 'sheep', 'cow']
DOTA = ['plane', 'ship', 'storage tank', 'baseball diamond', 'tennis court', 'basketball court',
        'ground track field', 'harbor', 'bridge', 'large vehicle', 'small vehicle', 'helicopter',
        'roundabout', 'soccer ball field', 'swimming pool']

# 파일 → (표시명, yaml, task, 추정 클래스)
MODEL_SPEC = [
    (MODEL_DIR / 'best(Car).pt', '차량·교통량 탐지', MODEL_DIR / 'data(Car).yaml', 'detect', None),
    (MODEL_DIR / 'best(House).pt', '건물 탐지', MODEL_DIR / 'data(House).yaml', 'detect', None),
    (MODEL_DIR / 'best(Road).pt', '도로망 세그멘테이션', MODEL_DIR / 'data(Road).yaml', 'segment', None),
    (MODEL_DIR / 'best(Vinylhouse).pt', '비닐하우스 탐지', MODEL_DIR / 'data.yaml', 'detect', None),
    (MODEL_DIR / 'yolo11x-obb.pt', 'YOLO11x-OBB 회전객체', None, 'obb', DOTA),
    (MODEL_DIR / 'yolo11n.pt', 'YOLO11n 범용 사전학습', None, 'detect', COCO),
    (LX2023 / 'model_yolo_illegal.pt', '개발제한구역 불법행위 탐지', None, 'detect',
     ['불법건축물', '불법적치', '불법형질변경']),
    (LX2023 / 'model_yolo_illegal_building.pt', '불법건축물 탐지', None, 'detect', ['불법건축물']),
    (LX2023 / 'model_segformer_land.pt', '토지형질 SegFormer', None, 'segment',
     ['건물', '도로', '농경지', '산림', '나지', '수역']),
    (LX2023 / 'model_landuse_epoch000.pt', '토지이용 분류', None, 'segment',
     ['주거', '상업', '공업', '농업', '녹지']),
]


def yaml_names(p: Path):
    """의존성 없이 data.yaml 의 `names: [...]` 만 읽는다."""
    m = re.search(r'^names:\s*\[(.*?)\]', p.read_text(encoding='utf-8'), re.M | re.S)
    if not m:
        return None
    return [s.strip().strip('\'"') for s in m.group(1).split(',') if s.strip()]


def step_models():
    out, missing = [], []
    for path, name, yml, task, guess in MODEL_SPEC:
        if not path.exists():
            missing.append(path.name)
            continue
        st = path.stat()
        classes, inferred = None, True
        if yml and yml.exists():
            classes = yaml_names(yml)
            inferred = classes is None
        if classes is None:
            classes = guess or [name]
        mid = re.sub(r'[^a-z0-9]+', '-', path.stem.lower()).strip('-')
        out.append(dict(id=mid, name=name, file=path.name,
                        sizeMB=round(st.st_size / 1e6, 1), task=task, classes=classes,
                        trainedAt=time.strftime('%Y-%m', time.localtime(st.st_mtime)),
                        inferred=inferred))
    if missing:
        log('!! 모델 파일 없음:', ', '.join(missing))
    write_module(DATA / 'models.js', 'MODELS', out,
                 '학습 모델 메타 — tools/prepare-assets.py 가 실제 .pt 파일 stat 과 data(*.yaml) 에서 생성.\n'
                 '// inferred:true 는 data yaml 이 없어 파일명/노트북에서 클래스를 추정한 모델.')
    log(f'  models.js {len(out)}개')
    return out


def write_module(path: Path, name: str, value, note: str):
    body = json.dumps(value, ensure_ascii=False, indent=2)
    path.write_text(f'// {note}\n// 자동 생성 — 직접 고치지 말고 파이프라인을 다시 돌릴 것.\n'
                    f'export const {name} = {body};\n', encoding='utf-8')


# ── (f) 브랜드 + CI 블루 ─────────────────────────────────────────────────────
def step_brand(force: bool):
    import urllib.request
    BRAND.mkdir(parents=True, exist_ok=True)
    got = []
    for fname, url in BRAND_URLS:
        dst = BRAND / fname
        if dst.exists() and dst.stat().st_size > 0 and not force:
            log(f'skip brand {fname} (이미 있음)')
            got.append(dst)
            continue
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=30) as r:
                dst.write_bytes(r.read())
            log(f'  ↓ {fname} {mb(dst.stat().st_size)}  ← {url}')
            got.append(dst)
        except Exception as e:
            log(f'!! 다운로드 실패 {url}: {e}')
            # 프로토타입에서 이미 받아 둔 이미지로 폴백.
            local = {'landxi-logo-big.png': ROOT / 'landxi/assets/images/logo_landxi_dark.png',
                     'landxi-wordmark.png': ROOT / 'landxi/assets/images/logo_landxi_dark.png',
                     'landxi-wordmark-dark.png': ROOT / 'landxi/assets/images/logo_landxi_dark.png',
                     'lx-symbol.png': ROOT / 'landxi/assets/images/lx_symbol.png'}.get(fname)
            if local and local.exists():
                shutil.copyfile(local, dst)
                log(f'  ↳ 폴백 복사 {local.name} → {fname}')
                got.append(dst)
    return got


def sample_ci_blue(img_path: Path):
    """워드마크에서 CI 블루를 뽑는다.

    Land-XI 워드마크는 'LAND'(짙은 파랑) → 'XI'(시안) 그라디언트라서 전체 중앙값을 잡으면
    시안 쪽(hue ≈ 199°)으로 끌려간다. 주색은 그라디언트의 파란 끝이므로, 채도 높은 파랑
    계열(hue 195–250°) 중 hue 상위 15%(= 가장 파란 픽셀)의 중앙값을 쓴다.
    """
    from PIL import Image
    im = Image.open(img_path).convert('RGBA')
    blues = []
    for r, g, b, a in im.getdata():
        if a < 250:
            continue
        h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        deg = h * 360
        if 195 <= deg <= 250 and s >= 0.6 and v >= 0.25:
            blues.append((deg, r, g, b))
    if not blues:
        return None
    blues.sort()
    top = blues[int(len(blues) * 0.85):] or blues       # hue 상위 15% = 가장 파란 끝
    top.sort(key=lambda t: t[1] * 0.299 + t[2] * 0.587 + t[3] * 0.114)
    _, r, g, b = top[len(top) // 2]
    return (r, g, b), len(blues)


def hexs(rgb):
    return '#%02X%02X%02X' % rgb


def derive(rgb):
    r, g, b = [c / 255 for c in rgb]
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    deep = colorsys.hls_to_rgb(h, max(0, l * 0.75), s)          # 명도 −25%
    deep = tuple(round(c * 255) for c in deep)
    tint = tuple(round(c * 255 * 0.08 + 255 * 0.92) for c in (r, g, b))   # 흰색 92% 혼합
    return deep, tint, round(h * 360, 1)


def step_tokens(logo: Path):
    got = sample_ci_blue(logo)
    if not got:
        log('!! 로고에서 파란 픽셀을 찾지 못했습니다 — tokens.css 유지')
        return None
    rgb, n = got
    deep, tint, hue = derive(rgb)
    old = re.search(r'--lx:(#\w+); --lx-deep:(#\w+); --lx-tint:(#\w+); --lx-rgb:([\d,]+);',
                    TOKENS.read_text(encoding='utf-8'))
    line = (f'--lx:{hexs(rgb)}; --lx-deep:{hexs(deep)}; --lx-tint:{hexs(tint)}; '
            f'--lx-rgb:{rgb[0]},{rgb[1]},{rgb[2]};')
    txt = re.sub(r'--lx:#\w+; --lx-deep:#\w+; --lx-tint:#\w+; --lx-rgb:[\d,]+;', line,
                 TOKENS.read_text(encoding='utf-8'))
    TOKENS.write_text(txt, encoding='utf-8')
    log(f'  CI 블루 표본 {n}px, hue {hue}° → {hexs(rgb)} (was {old.group(1) if old else "?"})')
    log(f'  {line}')
    return {'hex': hexs(rgb), 'deep': hexs(deep), 'tint': hexs(tint), 'hue': hue,
            'old': old.group(0) if old else None, 'new': line}


# ── 요약 ─────────────────────────────────────────────────────────────────────
def summary():
    total = 0
    log('── 타일 용량 요약 ──────────────────────────')
    if TILES.exists():
        for d in sorted(TILES.iterdir()):
            if not d.is_dir():
                continue
            s = dir_size(d)
            total += s
            n = sum(1 for _ in d.rglob('*.webp'))
            log(f'  {d.name:<16} {mb(s):>9}  {n:>6}장')
    log(f'  {"합계":<14} {mb(total):>9}  (예산 {SIZE_BUDGET_MB}MB)')
    if total > SIZE_BUDGET_MB * 1e6:
        log('!! 예산 초과 — 최대 줌을 한 단계 낮추세요')
    for f in ['marine-debris.geojson', 'marine-debris-grid.geojson', 'jeju-illegal.geojson']:
        p = GEO / f
        if p.exists():
            log(f'  geo/{f:<28} {mb(p.stat().st_size):>9}')
    return total


def main():
    ap = argparse.ArgumentParser(description='Land-XI 실자산 파이프라인')
    ap.add_argument('--force', action='store_true', help='산출물이 있어도 다시 만든다')
    ap.add_argument('--only', default='', help='namwon,kuksan,jeju,vectors,models,brand 중 일부만')
    a = ap.parse_args()
    only = {s.strip() for s in a.only.split(',') if s.strip()}
    do = lambda s: not only or s in only

    for d in (TILES, GEO, BRAND, BUILD, DATA):
        d.mkdir(parents=True, exist_ok=True)

    t0 = time.time()
    entries = []
    if do('namwon'):
        step_namwon(a.force, entries)
    if do('kuksan'):
        step_kuksan(a.force, entries)
    if do('jeju'):
        step_jeju(a.force, entries)
    if entries:
        img = DATA / 'imagery.js'
        # 부분 실행이어도 기존 항목은 살린다.
        if img.exists() and only:
            old = json.loads(re.search(r'export const IMAGERY = (\[.*\]);',
                                       img.read_text(encoding='utf-8'), re.S).group(1))
            new_ids = {e['id'] for e in entries}
            entries = [e for e in old if e['id'] not in new_ids] + entries
        order = [t[0] for t in NAMWON] + [t[0] for t in KUKSAN] + [t[0] for t in JEJU]
        entries.sort(key=lambda e: order.index(e['id']) if e['id'] in order else 99)
        write_module(DATA / 'imagery.js', 'IMAGERY', entries,
                     '정사영상 타일 카탈로그 — tools/prepare-assets.py 가 실제 원본에서 생성.\n'
                     '// tiles 경로는 landxi/ 기준 상대 경로다.')
        log(f'  imagery.js {len(entries)}개')

    if do('vectors'):
        step_marine(a.force)
        step_jeju_vector(a.force)
    if do('models'):
        step_models()
    if do('brand'):
        got = step_brand(a.force)
        logo = BRAND / 'landxi-logo-big.png'
        if not logo.exists() and got:
            logo = got[0]
        if logo.exists():
            step_tokens(logo)

    summary()
    log(f'전체 {time.time() - t0:.1f}s')


if __name__ == '__main__':
    main()
