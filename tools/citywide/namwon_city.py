#!/usr/bin/env python
# -*- coding: utf-8 -*-
u"""남원 **전역**(시 단위) 정사영상 타일 파이프라인.

`tools/prepare-assets.py` 의 남원 단계는 4시점이 모두 겹치는 800m AOI 만 자른다.
발주처 AI 결과(농지이용 현황·비닐하우스)는 **남원시 전역**이라 그 위에 얹을 바탕이
없다. 이 스크립트가 그 바탕을 만든다.

  입력  E:\\namwon_final\\nw_2510.tif  (1.68cm, 2.45M x 1.70M px, 1.8TB, EPSG:5186, +.ovr)
        F:\\namwon_final\\nw_2504.tif  (1.08cm, 3.79M x 2.51M px, 1.1TB, EPSG:5186, +.ovr)
  출력  landxi/assets/tiles/namwon_city_2510/{z}/{x}/{y}.webp   (z11-15 전역 + z16-17 코어)
        landxi/assets/tiles/namwon_city_2504/...
        landxi/assets/data/imagery.js 에 항목 추가(기존 항목은 그대로 둔다)
        shots/citywide/namwon_city_*_z13.png (퀵룩)

원본은 절대 수정하지 않는다. 전 화소를 읽지도 않는다 — `gdal_translate -tr` 이
`.ovr` 오버뷰를 타고 내려받는다(전역 2m 는 오버뷰 x128, 코어 0.6m 는 x32 레벨).

  "C:\\Users\\oem\\anaconda3\\envs\\yolo\\python.exe" tools/citywide/namwon_city.py
  ... --only 2510 --force --skip-core 2504
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import re
import shutil
import sys
import time
from pathlib import Path

from osgeo import gdal

sys.dont_write_bytecode = True    # tools/__pycache__ 를 남기지 않는다(리포에 커밋되면 안 된다)

gdal.UseExceptions()

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

ROOT = Path(__file__).resolve().parents[2]
TILES = ROOT / 'landxi' / 'assets' / 'tiles'
DATA = ROOT / 'landxi' / 'assets' / 'data'
BUILD = ROOT / 'build'
STAGE = BUILD / 'citywide_tiles'          # gdal2tiles 중간 출력(줌 폴더 단위로 옮긴다)
SHOTS = ROOT / 'shots' / 'citywide'

PYEXE = sys.executable
GDAL2TILES = Path(sys.prefix) / 'Scripts' / 'gdal2tiles.py'


# -- prepare-assets.py 재사용 ------------------------------------------------
# 파일명에 '-' 가 있어 일반 import 가 안 된다. 모듈 최상위는 상수/함수 정의뿐이라
# exec_module 해도 부작용이 없다(main() 은 __main__ 가드 안).
def _load_prepare():
    spec = importlib.util.spec_from_file_location('prepare_assets', ROOT / 'tools' / 'prepare-assets.py')
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


pa = _load_prepare()
pa.WEBP_QUALITY = 75      # 전역 타일은 장수가 많다 - AOI 용 q80 보다 한 단계 낮춘다

run, mb, dir_size, tif_ok = pa.run, pa.mb, pa.dir_size, pa.tif_ok
wgs84_bounds, native_gsd, png_to_webp = pa.wgs84_bounds, pa.native_gsd, pa.png_to_webp


def log(*a):
    print('[citywide]', *a, flush=True)


# -- 원본/창 정의 ------------------------------------------------------------
# (id, 원본, 촬영, 라벨)
CITY = [
    ('namwon_city_2510', r'E:\namwon_final\nw_2510.tif', '2025-10', '남원 전역 · 2025.10'),
    ('namwon_city_2504', r'F:\namwon_final\nw_2504.tif', '2025-04', '남원 전역 · 2025.04'),
]

# 고해상 코어 6x6km - EPSG:5186 projwin (ulx, uly, lrx, lry).
#
# 계획은 "남원 시가지 + 농경지" 였지만 시청(235467, 313362) 중심 6km 창은 알파 커버리지가
# 2510 30.2% / 2504 15.3% 다 - 시가지는 애초에 촬영분이 거의 없다(prepare-assets 가 800m
# AOI 를 옮긴 것과 같은 이유). 50m 격자 알파 적분영상으로 두 시점 커버리지의 **최솟값**을
# 최대화하는 6km 창을 전수 탐색해 남서부 금지/송동 평야를 골랐다. 2510 100% / 2504 84.3%,
# 논/비닐하우스 지대라 발주처 AI 결과(농지이용/비닐하우스)와 정확히 겹친다.
CORE_5186 = (226608.0, 308438.0, 232608.0, 302438.0)

BASE_TR = 2.0            # 전역 작업 해상도(m/px) - z15(위도 35.4도에서 3.89m/px)보다 촘촘
CORE_TR = 0.6            # 코어 작업 해상도(m/px) - z17(0.97m/px)보다 촘촘
CITY_Z = (11, 15)
CORE_Z = (16, 17)
BUDGET_MB = 60           # namwon_city_* 두 시점 합계 예산


# -- GeoTIFF 만들기 ----------------------------------------------------------
def crop(src: str, dst: Path, tr: float, projwin=None, force=False) -> Path:
    """오버뷰를 타고 내려받아 작업 GeoTIFF 를 만든다.

    pa.crop 과 같은 규칙(멱등 + 빈 파일 자동 복구)이되 전역 래스터라 BIGTIFF=YES 를 못 박고
    RGB+알파 4밴드를 고정한다.
    """
    if dst.exists() and not force:
        if tif_ok(dst):
            log(f'skip crop {dst.name} (이미 있음, {mb(dst.stat().st_size)})')
            return dst
        log(f'!! {dst.name} 이 비어 있다(중단된 실행) - 다시 만든다')
        dst.unlink()
    dst.parent.mkdir(parents=True, exist_ok=True)
    cmd = [pa.tool('gdal_translate'), '-of', 'GTiff', '-tr', tr, tr, '-r', 'average',
           '-co', 'TILED=YES', '-co', 'COMPRESS=DEFLATE', '-co', 'BIGTIFF=YES',
           '-b', '1', '-b', '2', '-b', '3', '-b', '4', '-colorinterp_4', 'alpha']
    if projwin:
        cmd += ['-projwin', projwin[0], projwin[1], projwin[2], projwin[3]]
    cmd += [src, str(dst)]
    run(cmd, f'gdal_translate {dst.name}')
    ds = gdal.Open(str(dst))
    log(f'  {dst.name} {ds.RasterXSize}x{ds.RasterYSize}px {mb(dst.stat().st_size)}')
    ds = None
    return dst


# -- 타일 --------------------------------------------------------------------
def zooms_done(out: Path, zmin: int, zmax: int) -> bool:
    return out.exists() and all((out / str(z)).is_dir() and next((out / str(z)).rglob('*.webp'), None)
                                for z in range(zmin, zmax + 1))


def tiles_pass(out: Path, src: Path, zmin: int, zmax: int, force: bool, what: str):
    """out/{z} 를 채운다.

    전역 패스(z11-15)와 코어 패스(z16-17)가 같은 폴더를 나눠 쓰므로 prepare-assets 의
    make_tiles(폴더 통째 삭제)를 쓸 수 없다. 스테이징 폴더에 만든 뒤 줌 폴더 단위로 옮긴다.
    """
    if not force and zooms_done(out, zmin, zmax):
        log(f'skip tiles {out.name} z{zmin}-{zmax} ({what}, 이미 있음)')
        return
    stage = STAGE / f'{out.name}_z{zmin}-{zmax}'
    if stage.exists():
        shutil.rmtree(stage)
    cmd = [PYEXE, GDAL2TILES, '--xyz', '-z', f'{zmin}-{zmax}', '-w', 'none', '-r', 'average',
           '--processes', '4', '-x', '-q', str(src), str(stage)]
    run(cmd, f'gdal2tiles {out.name} z{zmin}-{zmax} ({what})')
    png_to_webp(stage)
    out.mkdir(parents=True, exist_ok=True)
    for z in range(zmin, zmax + 1):
        s, d = stage / str(z), out / str(z)
        if not s.is_dir():
            log(f'  !! z{z} 가 비었다(전부 투명?) - 건너뜀')
            continue
        if d.exists():
            shutil.rmtree(d)
        shutil.move(str(s), str(d))
    shutil.rmtree(stage, ignore_errors=True)
    log(f'  {out.name} 누적 {sum(1 for _ in out.rglob("*.webp"))}장 {mb(dir_size(out))}')


def tile_stats(out: Path) -> dict:
    per = {}
    for zd in sorted((p for p in out.iterdir() if p.is_dir()), key=lambda p: int(p.name)):
        files = list(zd.rglob('*.webp'))
        per[int(zd.name)] = (len(files), sum(f.stat().st_size for f in files))
    return per


# -- 퀵룩 --------------------------------------------------------------------
def quicklook(out: Path, z: int, dst: Path, max_px: int = 1600):
    """z 레벨 타일을 이어 붙여 한 장으로.

    빠진 타일과 투명 화소가 눈에 띄도록 마젠타/청록 체커 위에 알파 합성한다.
    검거나 흰 구멍(= 잘못 채워진 화소)과 정상적인 투명(= 미촬영)이 구별된다.
    """
    from PIL import Image
    zd = out / str(z)
    if not zd.is_dir():
        log(f'!! 퀵룩 실패: {zd} 없음')
        return None
    tiles = {(int(f.parent.name), int(f.stem)): f for f in zd.rglob('*.webp')}
    if not tiles:
        log('!! 퀵룩 실패: 타일 없음')
        return None
    xs = [k[0] for k in tiles]
    ys = [k[1] for k in tiles]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    w, h = (x1 - x0 + 1) * 256, (y1 - y0 + 1) * 256
    bg = Image.new('RGB', (w, h), (255, 0, 200))
    for by in range(0, h, 32):
        for bx in range(0, w, 32):
            if (bx // 32 + by // 32) % 2:
                bg.paste((0, 210, 200), (bx, by, min(bx + 32, w), min(by + 32, h)))
    for (tx, ty), f in tiles.items():
        im = Image.open(f).convert('RGBA')
        bg.paste(im, ((tx - x0) * 256, (ty - y0) * 256), im)
        im.close()
    if max(w, h) > max_px:
        s = max_px / max(w, h)
        bg = bg.resize((max(1, int(w * s)), max(1, int(h * s))), Image.LANCZOS)
    dst.parent.mkdir(parents=True, exist_ok=True)
    bg.save(dst)
    log(f'  퀵룩 {dst.relative_to(ROOT)} {bg.size[0]}x{bg.size[1]} '
        f'(z{z} 타일 {len(tiles)}장, x {x0}-{x1} / y {y0}-{y1})')
    return dst


# -- imagery.js --------------------------------------------------------------
def read_imagery() -> list:
    p = DATA / 'imagery.js'
    if not p.exists():
        return []
    m = re.search(r'export const IMAGERY = (\[.*\]);', p.read_text(encoding='utf-8'), re.S)
    return json.loads(m.group(1)) if m else []


def write_imagery(entries: list):
    pa.write_module(DATA / 'imagery.js', 'IMAGERY', entries,
                    '정사영상 타일 카탈로그 — tools/prepare-assets.py(AOI·드론·제주)와\n'
                    '// tools/citywide/namwon_city.py(coverage:"city" 항목)가 실제 원본에서 생성.\n'
                    '// tiles 경로는 landxi/ 기준 상대 경로다.')


def upsert(entries: list, e: dict) -> list:
    """같은 id 는 갈아 끼우고, 나머지 기존 항목은 순서 그대로 둔다(덧붙이기 전용)."""
    out = [x for x in entries if x['id'] != e['id']]
    out.append(e)
    return out


# -- 파이프라인 --------------------------------------------------------------
def build(tid, src, captured, label, force, want_core):
    if not Path(src).exists():
        log(f'!! 원본 없음: {src} - {tid} 건너뜀')
        return None
    out = TILES / tid

    base = crop(src, BUILD / f'{tid}.tif', BASE_TR, None, force)
    tiles_pass(out, base, CITY_Z[0], CITY_Z[1], force, '전역 2m')
    bounds = wgs84_bounds(base)

    core_bounds = None
    if want_core:
        core = crop(src, BUILD / f'{tid}_core.tif', CORE_TR, CORE_5186, force)
        tiles_pass(out, core, CORE_Z[0], CORE_Z[1], force, '코어 0.6m')
        core_bounds = wgs84_bounds(core)
    else:
        for z in range(CORE_Z[0], CORE_Z[1] + 1):
            if (out / str(z)).exists():
                shutil.rmtree(out / str(z))
        log(f'  {tid} 코어 생략(--skip-core)')

    e = dict(id=tid, label=label, kind='ortho', gsd=BASE_TR, captured=captured,
             bounds=bounds, minzoom=CITY_Z[0],
             maxzoom=CORE_Z[1] if want_core else CITY_Z[1],
             tiles=f'assets/tiles/{tid}/{{z}}/{{x}}/{{y}}.webp',
             coverage='city', sourceGsd=native_gsd(src))
    if core_bounds:
        # z16 부터는 이 창 안에만 타일이 있다. 바깥에서는 z15 부모 타일을 확대해 써야 한다.
        e['core'] = dict(bounds=core_bounds, gsd=CORE_TR,
                         minzoom=CORE_Z[0], maxzoom=CORE_Z[1])
    quicklook(out, 13, SHOTS / f'{tid}_z13.png')
    if core_bounds:
        quicklook(out, CORE_Z[0], SHOTS / f'{tid}_z16_core.png')
    return e


def main():
    ap = argparse.ArgumentParser(description='남원 전역 정사영상 타일')
    ap.add_argument('--force', action='store_true', help='산출물이 있어도 다시 만든다')
    ap.add_argument('--only', default='', help='2510,2504 중 일부만')
    ap.add_argument('--skip-core', default='', help='코어(z16-17)를 만들지 않을 시점: 2504 등')
    a = ap.parse_args()
    only = {s.strip() for s in a.only.split(',') if s.strip()}
    nocore = {s.strip() for s in a.skip_core.split(',') if s.strip()}

    for d in (TILES, BUILD, STAGE, DATA):
        d.mkdir(parents=True, exist_ok=True)

    t0 = time.time()
    entries = read_imagery()
    for tid, src, captured, label in CITY:
        tag = tid.split('_')[-1]
        if only and tag not in only:
            continue
        e = build(tid, src, captured, label, a.force, tag not in nocore)
        if e:
            entries = upsert(entries, e)
    write_imagery(entries)
    log(f'  imagery.js {len(entries)}개'
        f' (city {sum(1 for e in entries if e.get("coverage") == "city")}개)')

    total = 0
    log('-- namwon_city_* 용량 ----------------------')
    for tid, *_ in CITY:
        d = TILES / tid
        if not d.is_dir():
            continue
        per = tile_stats(d)
        s = sum(v[1] for v in per.values())
        total += s
        log(f'  {tid}  {mb(s):>8}  ' + '  '.join(f'z{z}:{n}장' for z, (n, _) in per.items()))
    log(f'  합계 {mb(total)} (예산 {BUDGET_MB}MB)')
    if total > BUDGET_MB * 1e6:
        log('!! 예산 초과 - --skip-core 2504 로 다시 돌리세요')
    log(f'전체 {time.time() - t0:.1f}s')


if __name__ == '__main__':
    main()
