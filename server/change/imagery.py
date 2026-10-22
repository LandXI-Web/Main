"""연도별 국토지리정보원 항공정사영상 자동 확보 — geoai_roadland/src/ngii.py 이식(격자 · 주소 · 받기 그대로 씀).

fetch_imagery(bbox_5179, year, zoom) → (RGB 배열, (원점 x, 원점 y, 해상도)) · 타일은 디스크 캐시
  TILE_CACHE/{year}/{z}/{col}_{row}.jpg  (없음 = .none 표시 — 같은 빈 타일을 다시 묻지 않음)
available_years(bbox_5179) → 레이어가 실제로 영상을 주는 해(2019~올해 프로브 · 결과 캐시)
바깥 요청은 국토지리정보원 영상 타일뿐(키 · 메일 없음 · Referer 만).
"""
from __future__ import annotations

import datetime as dt
import json
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from pathlib import Path

import numpy as np
from PIL import Image

from . import TILE_CACHE, roadland_src

roadland_src()
import ngii as NG  # noqa: E402 — geoai_roadland/src/ngii.py

YEAR_MIN = 2019
_lock = threading.Lock()
_stats = {"hit": 0, "miss": 0, "none": 0}


def _path(year: int, z: int, col: int, row: int) -> Path:
    return TILE_CACHE / str(year) / str(z) / f"{col}_{row}.jpg"


def tile(col: int, row: int, z: int, year: int) -> np.ndarray | None:
    p = _path(year, z, col, row)
    if p.exists():
        with _lock:
            _stats["hit"] += 1
        try:
            return np.asarray(Image.open(p).convert("RGB"))
        except Exception:
            p.unlink(missing_ok=True)
    nonef = p.with_suffix(".none")
    if nonef.exists():
        with _lock:
            _stats["none"] += 1
        return None
    data = None
    for k in range(3):
        try:
            data = NG.fetch_tile(NG.air_tile_url(col, row, z, year), timeout=15)
            break
        except Exception:
            time.sleep(0.4 * (k + 1))
    p.parent.mkdir(parents=True, exist_ok=True)
    with _lock:
        _stats["miss"] += 1
    if not data:
        nonef.write_bytes(b"")
        return None
    try:
        arr = np.asarray(Image.open(BytesIO(data)).convert("RGB"))
    except Exception:
        nonef.write_bytes(b"")
        return None
    p.write_bytes(data)
    return arr


def tiles_for(bbox, z: int):
    mnx, mny, mxx, mxy = bbox
    c0, r0 = NG.xy_to_tile(mnx, mxy, z)
    c1, r1 = NG.xy_to_tile(mxx, mny, z)
    return c0, r0, c1, r1


def fetch_imagery(bbox_5179, year: int, zoom: int = 18, workers: int = 12, need=None, progress=None):
    """bbox(EPSG:5179) → 같은 격자(줌) 모자이크. need(col,row)->bool 이 있으면 그 타일만 받는다(구역 마스크 밖 생략).
    돌려줌: rgb(H,W,3 uint8), (ox, oy, res), got(받은 타일 수), total."""
    c0, r0, c1, r1 = tiles_for(bbox_5179, zoom)
    todo = [(c, r) for r in range(r0, r1 + 1) for c in range(c0, c1 + 1) if (need is None or need(c, r, zoom))]
    H, W = (r1 - r0 + 1) * 256, (c1 - c0 + 1) * 256
    img = np.zeros((H, W, 3), np.uint8)
    got = 0
    done = 0
    with ThreadPoolExecutor(max_workers=workers) as ex:
        for (c, r), a in zip(todo, ex.map(lambda cr: tile(cr[0], cr[1], zoom, year), todo)):
            done += 1
            if a is not None and a.shape[0] == 256 and a.shape[1] == 256:
                img[(r - r0) * 256:(r - r0 + 1) * 256, (c - c0) * 256:(c - c0 + 1) * 256] = a
                got += 1
            if progress and done % 50 == 0:
                progress(done, len(todo))
    ox = NG.ORIGIN_X + c0 * NG.tile_span_m(zoom)
    oy = NG.ORIGIN_Y - r0 * NG.tile_span_m(zoom)
    return img, (ox, oy, NG.RES[zoom]), got, len(todo)


def _probe_one(x: float, y: float, year: int, z: int = 18) -> bool:
    col, row = NG.xy_to_tile(x, y, z)
    a = tile(col, row, z, year)
    return a is not None and float(a.mean()) > 3.0


def available_years(bbox_5179, years=None) -> dict[int, int]:
    """범위 가운데 · 안쪽 네 점(다섯 점)을 해마다 물어 둘 이상 영상이 오면 그 해가 있음.
    돌려줌: {해: 가장 고운 줌} — 18(25cm) 이 없으면 17(51cm)(국토지리정보원 옛 해는 17 까지만 있는 곳이 있다)."""
    this = dt.date.today().year
    years = list(years or range(YEAR_MIN, this + 1))
    mnx, mny, mxx, mxy = bbox_5179
    cx, cy = (mnx + mxx) / 2, (mny + mxy) / 2
    dx, dy = (mxx - mnx) * 0.3, (mxy - mny) * 0.3
    pts = [(cx, cy), (cx - dx, cy - dy), (cx + dx, cy - dy), (cx - dx, cy + dy), (cx + dx, cy + dy)]
    key = TILE_CACHE / "_years" / (f"{int(cx)//1000}_{int(cy)//1000}.json")
    known: dict[int, int] = {}
    if key.exists():
        try:
            known = {int(k): int(v) for k, v in json.loads(key.read_text(encoding="utf-8")).items()}
        except Exception:
            known = {}
    out: dict[int, int] = {}
    with ThreadPoolExecutor(max_workers=10) as ex:
        for y in years:
            if y in known and y < this:
                z = known[y]
            else:
                z = 0
                for zz in (18, 17):
                    if sum(ex.map(lambda p: _probe_one(p[0], p[1], y, zz), pts)) >= 2:
                        z = zz
                        break
                known[y] = z
            if z:
                out[y] = z
    key.parent.mkdir(parents=True, exist_ok=True)
    key.write_text(json.dumps(known), encoding="utf-8")
    return out


def common_zoom(avail: dict[int, int], year_a: int, year_b: int) -> int | None:
    """두 해를 같은 격자로 — 둘 다 18 이면 18, 하나라도 17 이면 17(정합 우선)."""
    za, zb = avail.get(year_a), avail.get(year_b)
    if not za or not zb:
        return None
    return min(za, zb)


def cache_stats() -> dict:
    with _lock:
        return dict(_stats)


def ngii_layer_xml(year: int, zoom: int) -> "Path":
    """영상 비교(가르기)에 쓰는 그 해 국토지리정보원 층 원천(GDAL WMS) — 그 해 가장 고운 줌까지(옛 해 17 = 51cm).
    전국 분석 원천(national/runner.ensure_imagery)과 같은 틀 · 줌 단계만 그 해에 맞춘다(없는 단계를 빈 타일로 그리지 않게)."""
    from national import runner as NR
    from national.common import OUT
    p = OUT / "imagery-api" / f"ngii-air-{year}.xml"
    body = NR.XML.format(year=year, conn=8).replace("<TileLevel>18</TileLevel>", f"<TileLevel>{int(zoom)}</TileLevel>")
    p.parent.mkdir(parents=True, exist_ok=True)
    if not p.exists():
        p.write_text(body, encoding="utf-8")
    return p
