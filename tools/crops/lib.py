#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Land-XI 사전 크롭 파이프라인 공용 함수.

results 행 상세 카드가 라이브 타일을 기다리지 않고도 즉시 선명한 "Acquired" 증거
크롭을 보여줄 수 있도록, 실제 좌표 기준으로 로컬 정사영상 webp 타일(또는 V-World
위성 타일)을 스티칭해 640x420 / 1280x840 JPEG 을 미리 구워 둔다.

호출부: tools/crops/make_crops.py
"""
from __future__ import annotations

import hashlib
import io
import math
import time
import urllib.error
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageStat

TILE = 256
ACCENT = (0, 109, 247)  # #006DF7
BG = (16, 20, 26)  # 타일 결측 영역 채움색

ROOT = Path(__file__).resolve().parents[2]
TILES_DIR = ROOT / 'landxi' / 'assets' / 'tiles'
VWORLD_URL = 'https://xdworld.vworld.kr/2d/Satellite/service/{z}/{x}/{y}.jpeg'


def log(*a):
    print('[crops]', *a, flush=True)


# ── 타일 좌표 수학 (표준 slippy XYZ, gdal2tiles --xyz 와 동일 원점) ──────────────
def deg2num(lon: float, lat: float, z: int) -> tuple[float, float]:
    lat_r = math.radians(lat)
    n = 2 ** z
    x = (lon + 180.0) / 360.0 * n
    y = (1.0 - math.log(math.tan(lat_r) + 1.0 / math.cos(lat_r)) / math.pi) / 2.0 * n
    return x, y


def resolution_m_per_px(z: int, lat: float) -> float:
    return 156543.03392 * math.cos(math.radians(lat)) / (2 ** z)


# ── 타일 소스 ────────────────────────────────────────────────────────────────
def local_tile(dataset_id: str, z: int, x: int, y: int) -> Image.Image | None:
    p = TILES_DIR / dataset_id / str(z) / str(x) / f'{y}.webp'
    if not p.exists():
        return None
    try:
        return Image.open(p).convert('RGBA')
    except Exception as e:
        log(f'  !! 로컬 타일 손상 {p}: {e}')
        return None


class VWorldSource:
    """V-World 위성 타일 소스. 다운로드는 스크래치패드에 캐시한다(리포에는 쓰지 않음)."""

    def __init__(self, cache_dir: Path):
        self.cache_dir = cache_dir
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.misses = 0

    def __call__(self, z: int, x: int, y: int) -> Image.Image | None:
        cache_path = self.cache_dir / f'{z}_{x}_{y}.jpg'
        if cache_path.exists():
            try:
                return Image.open(cache_path).convert('RGBA')
            except Exception:
                cache_path.unlink(missing_ok=True)
        url = VWORLD_URL.format(z=z, x=x, y=y)
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 Land-XI-proto/1.0'})
        for attempt in range(3):
            try:
                with urllib.request.urlopen(req, timeout=15) as r:
                    data = r.read()
                cache_path.write_bytes(data)
                return Image.open(io.BytesIO(data)).convert('RGBA')
            except urllib.error.HTTPError as e:
                if e.code == 404:
                    self.misses += 1
                    return None
                time.sleep(0.6 * (attempt + 1))
            except Exception as e:
                log(f'  !! vworld fetch {z}/{x}/{y} 실패({attempt}): {e}')
                time.sleep(0.6 * (attempt + 1))
        return None


# ── 스티칭 + 크롭 ────────────────────────────────────────────────────────────
class Render:
    """center(lon,lat) 주변을 stitch 해 window_m(가로) 폭의 640x420/1280x840 크롭을 만든다."""

    def __init__(self, get_tile, z: int, lon: float, lat: float, window_m: float,
                 out2x=(1280, 840), radius: int | None = None):
        self.z = z
        res = resolution_m_per_px(z, lat)
        self.win_w_px = window_m / res
        self.win_h_px = self.win_w_px * (out2x[1] / out2x[0])
        cx, cy = deg2num(lon, lat, z)
        if radius is None:
            radius = max(1, math.ceil((self.win_w_px / 2) / TILE) + 1)
        self.x0 = int(math.floor(cx)) - radius
        self.y0 = int(math.floor(cy)) - radius
        n = radius * 2 + 1
        # 알파 0으로 채워 둬야 결측 타일이 진짜로 "덮이지 않음"으로 측정된다 —
        # Image.paste 는 mask 로 4채널을 동일 비율로 블렌딩하므로, 캔버스를 불투명(255)으로
        # 채워두면 결측 영역이 BG 색으로 덮인 채 알파만 255로 남아 mean_alpha 가 항상 1.0으로
        # 읽히는 버그가 있었다(제주 크롭 검은 띠 원인).
        canvas = Image.new('RGBA', (n * TILE, n * TILE), BG + (0,))
        opaque_sum = 0.0
        opaque_n = 0
        for j in range(n):
            for i in range(n):
                tx, ty = self.x0 + i, self.y0 + j
                tile = get_tile(self.z, tx, ty)
                if tile is None:
                    continue
                canvas.paste(tile, (i * TILE, j * TILE), tile)
                opaque_sum += ImageStat.Stat(tile.split()[-1]).mean[0]
                opaque_n += 1
        self.tile_opacity = (opaque_sum / opaque_n / 255.0) if opaque_n else 0.0
        px = (cx - self.x0) * TILE
        py = (cy - self.y0) * TILE
        left = px - self.win_w_px / 2
        top = py - self.win_h_px / 2
        self.crop_left, self.crop_top = left, top
        box = (round(left), round(top), round(left + self.win_w_px), round(top + self.win_h_px))
        crop = canvas.crop(box)
        alpha = crop.split()[-1]
        self.mean_alpha = ImageStat.Stat(alpha).mean[0] / 255.0
        bg = Image.new('RGB', crop.size, BG)
        bg.paste(crop, (0, 0), crop)
        self.base2x = bg.resize(out2x, Image.LANCZOS)
        self.out2x = out2x

    def projector(self, out_w: int, out_h: int):
        sx = out_w / self.win_w_px
        sy = out_h / self.win_h_px

        def proj(lon: float, lat: float):
            fx, fy = deg2num(lon, lat, self.z)
            cx = (fx - self.x0) * TILE
            cy = (fy - self.y0) * TILE
            return (cx - self.crop_left) * sx, (cy - self.crop_top) * sy

        return proj


def draw_geom_outline(img: Image.Image, geometry: dict, proj, width: int = 1, color=ACCENT):
    draw = ImageDraw.Draw(img)

    def rings(geom):
        if geom['type'] == 'Polygon':
            for ring in geom['coordinates']:
                yield ring
        elif geom['type'] == 'MultiPolygon':
            for poly in geom['coordinates']:
                for ring in poly:
                    yield ring

    for ring in rings(geometry):
        pts = [proj(lon, lat) for lon, lat in ring]
        if len(pts) >= 2:
            draw.line(pts + [pts[0]], fill=color, width=width, joint='curve')
    return img


def safe_render(get_tile, z: int, lon: float, lat: float, window_m: float,
                 out2x=(1280, 840), min_alpha: float = 0.985, max_shrinks: int = 4) -> Render:
    """알파 결측(타일 경계 안전마진 부족 또는 실제 커버리지 밖)이 있으면 창을 줄여 재시도."""
    best = None
    w = window_m
    for _ in range(max_shrinks + 1):
        r = Render(get_tile, z, lon, lat, w, out2x=out2x)
        if best is None or r.mean_alpha > best.mean_alpha:
            best = r
        if r.mean_alpha >= min_alpha:
            return r
        w *= 0.78
    return best


def shared_safe_window(get_tile_fns: list, z: int, lon: float, lat: float, window_m: float,
                        out2x=(1280, 840), min_alpha: float = 0.985, max_shrinks: int = 4) -> float:
    """같은 창을 여러 시점(소스)에 동일 적용해야 하는 시계열 비교용 — 개별로 따로
    줄이면 프레이밍이 시점마다 달라져 비교가 성립하지 않는다. 모든 소스가 만족할 때까지
    공통 window_m 을 함께 줄여서 돌려준다(호출부는 이 값으로 각 소스를 Render 한다)."""
    w = window_m
    for _ in range(max_shrinks + 1):
        alphas = [Render(fn, z, lon, lat, w, out2x=out2x).mean_alpha for fn in get_tile_fns]
        if min(alphas) >= min_alpha:
            return w
        w *= 0.78
    return w


def save_jpeg_budget(img: Image.Image, path: Path, cap_kb: float, start_q: int = 82, floor_q: int = 45):
    path.parent.mkdir(parents=True, exist_ok=True)
    q = start_q
    data = None
    while q >= floor_q:
        buf = io.BytesIO()
        img.save(buf, 'JPEG', quality=q, optimize=True)
        data = buf.getvalue()
        if len(data) <= cap_kb * 1024 or q == floor_q:
            break
        q -= 8
    path.write_bytes(data)
    return len(data), q
