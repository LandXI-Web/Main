#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""남원/여수/제주/국산리 실제 탐지·정사영상에서 사전 크롭 증거 이미지를 굽는다.

  "C:\\Users\\oem\\anaconda3\\envs\\yolo\\python.exe" tools/crops/make_crops.py

산출물:
  landxi/assets/proto/crops/<dataset>/<n>.jpg        640x420  (overlay 있으면 hairline 포함)
  landxi/assets/proto/crops/<dataset>/<n>@2x.jpg      1280x840
  landxi/assets/proto/crops/<dataset>/<n>-clean.jpg   640x420  (overlay 없는 원본, overlay 데이터셋만)
  landxi/assets/data/crops.js                         CROPS 카탈로그
  shots/crops/sheet.jpg                                육안 확인용 contact sheet(커밋 안 함, shots/ gitignore)
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib import (ACCENT, BG, Render, VWorldSource, deg2num, draw_geom_outline,  # noqa: E402
                  local_tile, log, safe_render, shared_safe_window, save_jpeg_budget)

from PIL import Image  # noqa: E402
from shapely.geometry import shape  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
GEO = ROOT / 'landxi' / 'assets' / 'data' / 'geo' / 'results'
OUT = ROOT / 'landxi' / 'assets' / 'proto' / 'crops'
CROPS_JS = ROOT / 'landxi' / 'assets' / 'data' / 'crops.js'
SHEET = ROOT / 'shots' / 'crops' / 'sheet.jpg'
SCRATCH = Path(r'C:\Users\oem\AppData\Local\Temp\claude\F--Land-XI-----01-----\67e4a754-5f9b-4174-a3aa-cdbbaade48d2\scratchpad')

CAP_1X_KB = 90
CAP_2X_KB = 250

vworld = VWorldSource(SCRATCH / 'vworld_cache')

# 남원 전역 core (namwon_city_2510/2504 의 고해상 core, imagery.js 참고)
NAMWON_CORE = (127.292609, 35.318037, 127.35883, 35.372294)
# 4시점 공통 AOI (imagery.js namwon_2504..2510)
NAMWON_AOI = (127.3481, 35.5276, 127.3567, 35.5347)
# 국산리 드론 AOI (imagery.js kuksan_a68/a71)
KUKSAN_AOI = (126.973996, 35.825613, 126.992145, 35.838284)

results_summary = []  # (dataset, n_crops, bytes)


def load_geojson(name: str) -> dict:
    return json.loads((GEO / name).read_text(encoding='utf-8'))


def bbox_m(geom) -> tuple[float, float]:
    minx, miny, maxx, maxy = shape(geom).bounds
    lat0 = (miny + maxy) / 2
    w = (maxx - minx) * 111320 * math.cos(math.radians(lat0))
    h = (maxy - miny) * 111320
    return abs(w), abs(h)


def rep_point(geom) -> tuple[float, float]:
    """가장 큰 서브폴리곤의 대표점(폴리곤 내부 보장)."""
    g = shape(geom)
    if g.geom_type == 'MultiPolygon':
        g = max(g.geoms, key=lambda p: p.area)
    p = g.representative_point()
    return p.x, p.y


def in_bbox(lon: float, lat: float, bbox) -> bool:
    return bbox[0] <= lon <= bbox[2] and bbox[1] <= lat <= bbox[3]


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


def emit(dataset: str, idx: int, render: Render, geometry=None, meta=None):
    """render 결과를 저장(overlay 있으면 hairline+clean, 없으면 base만)한다."""
    ds_dir = OUT / dataset
    base2x = render.base2x
    base1x = base2x.resize((640, 420), Image.LANCZOS)

    entry = dict(meta or {})
    if geometry is not None:
        proj2x = render.projector(1280, 840)
        proj1x = render.projector(640, 420)
        overlaid2x = draw_geom_outline(base2x.copy(), geometry, proj2x, width=2)
        overlaid1x = draw_geom_outline(base1x.copy(), geometry, proj1x, width=1)
        n1, _ = save_jpeg_budget(overlaid1x, ds_dir / f'{idx}.jpg', CAP_1X_KB)
        n2, _ = save_jpeg_budget(overlaid2x, ds_dir / f'{idx}@2x.jpg', CAP_2X_KB)
        nc, _ = save_jpeg_budget(base1x, ds_dir / f'{idx}-clean.jpg', CAP_1X_KB)
        entry['file'] = f'assets/proto/crops/{dataset}/{idx}.jpg'
        entry['file2x'] = f'assets/proto/crops/{dataset}/{idx}@2x.jpg'
        entry['clean'] = f'assets/proto/crops/{dataset}/{idx}-clean.jpg'
        total = n1 + n2 + nc
    else:
        n1, _ = save_jpeg_budget(base1x, ds_dir / f'{idx}.jpg', CAP_1X_KB)
        n2, _ = save_jpeg_budget(base2x, ds_dir / f'{idx}@2x.jpg', CAP_2X_KB)
        entry['file'] = f'assets/proto/crops/{dataset}/{idx}.jpg'
        entry['file2x'] = f'assets/proto/crops/{dataset}/{idx}@2x.jpg'
        entry['clean'] = None
        total = n1 + n2
    return entry, total, base1x


thumbs = []  # (label, PIL image 640x420) for contact sheet


def add_thumb(label, img):
    thumbs.append((label, img))


CROPS: dict[str, list] = {}


# ── 1) 여수 항공 2025 / 드론 2026 — V-World 위성, top-8 by conf ─────────────────
def build_yeosu(dataset_id: str, geojson_name: str, sensor_label: str):
    fc = load_geojson(geojson_name)
    feats = [f for f in fc['features'] if f['properties'].get('conf') is not None]
    feats.sort(key=lambda f: -f['properties']['conf'])
    top = feats[:8]
    entries = []
    total_bytes = 0
    for i, f in enumerate(top, start=1):
        lon, lat = rep_point(f['geometry'])
        bw, bh = bbox_m(f['geometry'])
        window_m = clamp(max(bw, bh) * 8, 20, 70)
        r = safe_render(vworld, 19, lon, lat, window_m)
        meta = dict(
            lnglat=[round(lon, 6), round(lat, 6)],
            conf=f['properties'].get('conf'),
            cls=f['properties'].get('cls'),
            area_m2=f['properties'].get('area'),
            epoch=None,
            source='vworld',
            gsd=round(156543.03392 * math.cos(math.radians(lat)) / (2 ** 19), 4),
        )
        entry, nbytes, thumb = emit(dataset_id, i, r, f['geometry'], meta)
        entries.append(entry)
        total_bytes += nbytes
        add_thumb(f'{dataset_id}#{i} conf={meta["conf"]:.2f} α={r.mean_alpha:.2f}', thumb)
        log(f'{dataset_id} #{i} conf={meta["conf"]:.3f} win={window_m:.0f}m alpha={r.mean_alpha:.2f} vworld_miss={vworld.misses}')
    CROPS[dataset_id] = entries
    results_summary.append((dataset_id, len(entries), total_bytes))


# ── 2) 남원 비닐하우스 / 농지 — core 안이면 namwon_city_2510(z17), 밖이면 V-World ──
def build_namwon_city(dataset_id: str, geojson_name: str):
    fc = load_geojson(geojson_name)
    feats = fc['features']
    feats.sort(key=lambda f: (-(f['properties'].get('nobj') or 0), -(f['properties'].get('area') or 0)))
    top = feats[:8]
    entries = []
    total_bytes = 0
    for i, f in enumerate(top, start=1):
        lon, lat = rep_point(f['geometry'])
        bw, bh = bbox_m(f['geometry'])
        window_m = clamp(max(bw, bh) * 2.0, 70, 120)
        inside = in_bbox(lon, lat, NAMWON_CORE)
        if inside:
            z = 17
            get_tile = lambda zz, xx, yy: local_tile('namwon_city_2510', zz, xx, yy)  # noqa: E731
            source = 'ortho'
            gsd = 0.6
            r = safe_render(get_tile, z, lon, lat, window_m)
        else:
            z = 19
            source = 'vworld'
            gsd = round(156543.03392 * math.cos(math.radians(lat)) / (2 ** z), 4)
            r = safe_render(vworld, z, lon, lat, window_m)
        meta = dict(
            lnglat=[round(lon, 6), round(lat, 6)],
            conf=f['properties'].get('conf'),
            cls=f['properties'].get('cls'),
            area_m2=f['properties'].get('area'),
            epoch='2025-10' if inside else None,
            source=source,
            gsd=gsd,
        )
        entry, nbytes, thumb = emit(dataset_id, i, r, f['geometry'], meta)
        entries.append(entry)
        total_bytes += nbytes
        add_thumb(f'{dataset_id}#{i} nobj={f["properties"].get("nobj")} {"core" if inside else "vworld"} α={r.mean_alpha:.2f}', thumb)
        log(f'{dataset_id} #{i} nobj={f["properties"].get("nobj")} area={f["properties"].get("area"):.0f} '
            f'win={window_m:.0f}m src={source} alpha={r.mean_alpha:.2f}')
    CROPS[dataset_id] = entries
    results_summary.append((dataset_id, len(entries), total_bytes))


# ── 3) 제주 불법건축물 — jeju_2020(z19, 실제 도엽), 2건 × 2프레이밍(광/협) ───────
def build_jeju():
    fc = load_geojson('../jeju-illegal.geojson')
    entries = []
    total_bytes = 0
    idx = 1
    for fi, f in enumerate(fc['features']):
        lon, lat = rep_point(f['geometry'])
        bw, bh = bbox_m(f['geometry'])
        for framing, mult in (('tight', 1.15), ('context', 1.9)):
            window_m = clamp(max(bw, bh) * mult, 40, 400)
            get_tile = lambda zz, xx, yy: local_tile('jeju_2020', zz, xx, yy)  # noqa: E731
            r = safe_render(get_tile, 19, lon, lat, window_m)
            meta = dict(
                lnglat=[round(lon, 6), round(lat, 6)],
                conf=None,
                cls='불법건축물',
                area_m2=round(shape(f['geometry']).area * 111320 * 111320 * math.cos(math.radians(lat)), 1),
                epoch='2020-12',
                source='ortho',
                gsd=round(156543.03392 * math.cos(math.radians(lat)) / (2 ** 19), 4),
            )
            entry, nbytes, thumb = emit('jeju-illegal', idx, r, f['geometry'], meta)
            entries.append(entry)
            total_bytes += nbytes
            add_thumb(f'jeju-illegal#{idx} {framing} win={window_m:.0f}m α={r.mean_alpha:.2f}', thumb)
            log(f'jeju-illegal #{idx} feat={fi} {framing} win={window_m:.0f}m alpha={r.mean_alpha:.2f}')
            idx += 1
    CROPS['jeju-illegal'] = entries
    results_summary.append(('jeju-illegal', len(entries), total_bytes))


def opacity_at(dataset_id: str, lon: float, lat: float, z: int = 17) -> float:
    from PIL import ImageStat
    x, y = deg2num(lon, lat, z)
    t = local_tile(dataset_id, z, int(x), int(y))
    if t is None:
        return 0.0
    return ImageStat.Stat(t.split()[-1]).mean[0] / 255.0


def pick_points(dataset_ids: list[str], bbox, n_points: int, inset=0.22, grid=5):
    w = bbox[2] - bbox[0]
    h = bbox[3] - bbox[1]
    cands = []
    for gx in range(grid):
        for gy in range(grid):
            lon = bbox[0] + w * (inset + (1 - 2 * inset) * gx / (grid - 1))
            lat = bbox[1] + h * (inset + (1 - 2 * inset) * gy / (grid - 1))
            score = min(opacity_at(d, lon, lat) for d in dataset_ids)
            cands.append((score, lon, lat))
    cands.sort(key=lambda c: -c[0])
    picked = []
    min_sep = min(w, h) * 0.28
    for score, lon, lat in cands:
        if all(math.hypot(lon - p[0], lat - p[1]) > min_sep for p in picked):
            picked.append((lon, lat))
        if len(picked) >= n_points:
            break
    return picked


# ── 4) 국산리 A68/A71 — 로컬 z19, 2지점 × 2시점, overlay 없음(변화탐지 비교용) ────
def build_kuksan():
    pts = pick_points(['kuksan_a68', 'kuksan_a71'], KUKSAN_AOI, 2)
    entries = []
    total_bytes = 0
    idx = 1
    for pi, (lon, lat) in enumerate(pts, start=1):
        fns = {ds: (lambda zz, xx, yy, _ds=ds: local_tile(_ds, zz, xx, yy))
               for ds in ('kuksan_a68', 'kuksan_a71')}
        shared_w = shared_safe_window(list(fns.values()), 19, lon, lat, 80)
        for ds, epoch in (('kuksan_a68', 'a68 · 2025-08'), ('kuksan_a71', 'a71 · 2025-08')):
            get_tile = fns[ds]
            r = Render(get_tile, 19, lon, lat, shared_w)
            meta = dict(
                lnglat=[round(lon, 6), round(lat, 6)],
                conf=None, cls=None, area_m2=None,
                epoch=epoch, source='ortho',
                gsd=round(156543.03392 * math.cos(math.radians(lat)) / (2 ** 19), 4),
            )
            entry, nbytes, thumb = emit('kuksan-change', idx, r, None, meta)
            entries.append(entry)
            total_bytes += nbytes
            add_thumb(f'kuksan-change#{idx} pt{pi} {epoch} α={r.mean_alpha:.2f}', thumb)
            log(f'kuksan-change #{idx} pt{pi} {epoch} alpha={r.mean_alpha:.2f}')
            idx += 1
    CROPS['kuksan-change'] = entries
    results_summary.append(('kuksan-change', len(entries), total_bytes))


# ── 5) 남원 4시점 AOI — 로컬 z19, 동일창 × 4시점, overlay 없음 ───────────────────
def build_namwon_epoch():
    epochs = [('namwon_2504', '2025-04'), ('namwon_2506', '2025-06'),
              ('namwon_2508', '2025-08'), ('namwon_2510', '2025-10')]
    pts = pick_points([e[0] for e in epochs], NAMWON_AOI, 1)
    lon, lat = pts[0]
    fns = [(lambda zz, xx, yy, _ds=ds: local_tile(_ds, zz, xx, yy)) for ds, _ in epochs]
    shared_w = shared_safe_window(fns, 19, lon, lat, 90)
    entries = []
    total_bytes = 0
    for i, ((ds, epoch), get_tile) in enumerate(zip(epochs, fns), start=1):
        r = Render(get_tile, 19, lon, lat, shared_w)
        meta = dict(
            lnglat=[round(lon, 6), round(lat, 6)],
            conf=None, cls=None, area_m2=None,
            epoch=epoch, source='ortho',
            gsd=round(156543.03392 * math.cos(math.radians(lat)) / (2 ** 19), 4),
        )
        entry, nbytes, thumb = emit('namwon-epoch', i, r, None, meta)
        entries.append(entry)
        total_bytes += nbytes
        add_thumb(f'namwon-epoch#{i} {epoch} α={r.mean_alpha:.2f}', thumb)
        log(f'namwon-epoch #{i} {epoch} alpha={r.mean_alpha:.2f}')
    CROPS['namwon-epoch'] = entries
    results_summary.append(('namwon-epoch', len(entries), total_bytes))


def write_crops_js():
    header = """// 사전 크롭 "Acquired" 증거 이미지 카탈로그 — tools/crops/make_crops.py 산출물.
// 자동 생성 — 손으로 고치지 말고 파이프라인을 다시 돌릴 것.
//
// 소스:
//  · yeosu-marine-2025-aerial / yeosu-marine-2026-drone: 로컬 여수 정사영상이 없어
//    V-World 위성 타일(z19, 3x3 스티칭)로 크롭. (C) 국토교통부 브이월드(VWorld) —
//    개발자 가이드 이용약관에 따라 출처 표시 조건부로 사용. 실사용 시
//    "자료제공: 브이월드(www.vworld.kr)" 표기 필요, 상업적 재배포 전 약관 재확인할 것.
//  · namwon-farmland-2025 / namwon-greenhouse-2025: top-8 이 남원 전역 커버리지의
//    고해상 core(namwon_city_2510, z17, gsd 0.6m) 안이면 로컬 타일, 밖이면 V-World 폴백.
//  · jeju-illegal: 원본 탐지 shp 좌표(126.896~126.899E)는 jeju_2022 도엽과 겹치지
//    않는다(prepare-assets.py 주석 참고) — 실제로 겹치는 jeju_2020(2020-12) 도엽에서 크롭.
//  · kuksan-change / namwon-epoch: 결과 geojson 이 없는 순수 시계열 비교용 — 등록된
//    탐지가 아니므로 conf/cls/area_m2 는 null, hairline overlay 없음(clean=null).
export const CROPS = """
    body = json.dumps(CROPS, ensure_ascii=False, indent=2)
    footer = ";\n\nexport const cropsFor = id => CROPS[id] || [];\n"
    CROPS_JS.write_text(header + body + footer, encoding='utf-8')


def build_sheet():
    cols = 8
    rows = math.ceil(len(thumbs) / cols)
    cell_w, cell_h, pad, label_h = 200, 132, 4, 16
    sheet = Image.new('RGB', (cols * (cell_w + pad), rows * (cell_h + label_h + pad)), (10, 12, 16))
    from PIL import ImageDraw
    draw = ImageDraw.Draw(sheet)
    for idx, (label, img) in enumerate(thumbs):
        cx, cy = idx % cols, idx // cols
        thumb = img.resize((cell_w, cell_h))
        x0, y0 = cx * (cell_w + pad), cy * (cell_h + label_h + pad)
        sheet.paste(thumb, (x0, y0))
        draw.text((x0 + 2, y0 + cell_h + 1), label[:34], fill=(255, 255, 255))
    SHEET.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(SHEET, 'JPEG', quality=85)
    log(f'contact sheet: {SHEET} ({len(thumbs)} crops, {sheet.size})')


def main():
    build_yeosu('yeosu-marine-2025-aerial', 'yeosu-marine-2025-aerial.geojson', '항공')
    build_yeosu('yeosu-marine-2026-drone', 'yeosu-marine-2026-drone.geojson', '드론')
    build_namwon_city('namwon-farmland-2025', 'namwon-farmland-2025.geojson')
    build_namwon_city('namwon-greenhouse-2025', 'namwon-greenhouse-2025.geojson')
    build_jeju()
    build_kuksan()
    build_namwon_epoch()
    write_crops_js()
    build_sheet()

    total = sum(b for _, _, b in results_summary)
    log('=== 요약 ===')
    for ds, n, b in results_summary:
        log(f'  {ds}: {n}건, {b/1024:.0f}KB')
    log(f'총 {total/1024/1024:.2f}MB / 12MB 예산, vworld 캐시 미스(404) {vworld.misses}건')


if __name__ == '__main__':
    main()
