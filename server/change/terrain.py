"""공개 30 m 급 지형(경사) — 산사태 취약지역 분석서비스의 '바뀐 곳 경사' · 순위(10-31 PM "가능하다면 들여와도 된다").

출처: AWS Open Data 'Terrain Tiles'(Mapzen terrarium 인코딩 · 무료 · 키 없음 · 한국은 SRTM 약 30 m 바탕)
  https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png   — tools/data3d/mirror_terrarium.py 와 같은 곳.
타일은 디스크 캐시(DATA_ROOT/cache/terrarium/{z}/{x}/{y}.png · 없음 = .none). 받지 못하면 경사 없이(None) — 결과는 그대로 낸다.
slope_deg(geoms5179) → 도형마다 평균 · 최대 경사(도). 지역 이름 · 좌표는 코드에 없다.
"""
from __future__ import annotations

import io
import math
import threading
import urllib.request
from pathlib import Path

import numpy as np

from landxi_api import config as _cfg

SRC = "https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png"
CACHE = _cfg.DATA_ROOT / "cache" / "terrarium"
Z = 13                     # 위도 35° 에서 한 칸 약 15.6 m(원자료 약 30 m 보다 곱게 · 타일 수 적게)
_lock = threading.Lock()
_mem: dict = {}


def _tile(x: int, y: int, z: int = Z) -> np.ndarray | None:
    k = (z, x, y)
    if k in _mem:
        return _mem[k]
    p = CACHE / str(z) / str(x) / f"{y}.png"
    a = None
    if p.with_suffix(".none").exists():
        _mem[k] = None
        return None
    from PIL import Image
    if not p.exists():
        try:
            req = urllib.request.Request(SRC.format(z=z, x=x, y=y), headers={"User-Agent": "Land-XI"})
            b = urllib.request.urlopen(req, timeout=15).read()
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(b)
        except Exception:  # noqa: BLE001
            return None             # 일시 실패는 캐시하지 않음
    try:
        im = np.asarray(Image.open(p).convert("RGB")).astype(np.float32)
        a = im[..., 0] * 256 + im[..., 1] + im[..., 2] / 256 - 32768
    except Exception:  # noqa: BLE001
        p.unlink(missing_ok=True)
        p.with_suffix(".none").write_bytes(b"")
    with _lock:
        _mem[k] = a
    return a


def _xy(lon: float, lat: float, z: int = Z):
    n = 2 ** z
    x = (lon + 180) / 360 * n
    y = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
    return x, y


def dem(bounds4326, z: int = Z):
    """경위도 범위 → (높이 배열, 왼쪽 위 타일 x0 · y0, z) — 범위를 덮는 타일을 이어 붙임(한 칸 여유)."""
    w, s, e, n = bounds4326
    x0, y0 = _xy(w, n, z)
    x1, y1 = _xy(e, s, z)
    tx0, ty0, tx1, ty1 = int(x0) - 1, int(y0) - 1, int(x1) + 1, int(y1) + 1
    if (tx1 - tx0 + 1) * (ty1 - ty0 + 1) > 400:
        return None
    rows = []
    for ty in range(ty0, ty1 + 1):
        row = []
        for tx in range(tx0, tx1 + 1):
            t = _tile(tx, ty, z)
            if t is None:
                return None
            row.append(t)
        rows.append(np.concatenate(row, 1))
    return np.concatenate(rows, 0), tx0, ty0, z


def slope_grid(H: np.ndarray, lat: float, z: int = Z) -> np.ndarray:
    """높이 → 경사(도) · 칸 크기는 웹 메르카토르 축척(위도 보정)."""
    px = 156543.03392 * math.cos(math.radians(lat)) / 2 ** z
    gy, gx = np.gradient(H, px)
    return np.degrees(np.arctan(np.hypot(gx, gy)))


def slope_deg(geoms5179) -> list[dict | None]:
    """도형마다 {'mean': 평균 경사, 'max': 최대 경사}(도 · 소수 한 자리) — 지형을 못 받으면 모두 None."""
    if not geoms5179:
        return []
    try:
        from pyproj import Transformer
        from shapely.ops import transform, unary_union
        T = Transformer.from_crs(5179, 4326, always_xy=True).transform
        g4 = [transform(T, g) for g in geoms5179]
        allb = unary_union([g.envelope for g in g4]).bounds
        d = dem(allb)
        if d is None:
            return [None] * len(geoms5179)
        H, tx0, ty0, z = d
        S = slope_grid(H, (allb[1] + allb[3]) / 2, z)
        out = []
        for g in g4:
            mnx, mny, mxx, mxy = g.bounds
            xa, ya = _xy(mnx, mxy, z)
            xb, yb = _xy(mxx, mny, z)
            c0, r0 = int((xa - tx0) * 256), int((ya - ty0) * 256)
            c1, r1 = int(math.ceil((xb - tx0) * 256)) + 1, int(math.ceil((yb - ty0) * 256)) + 1
            win = S[max(0, r0):r1, max(0, c0):c1]
            if win.size == 0:
                out.append(None)
                continue
            # 도형이 칸 몇 개뿐이라 안팎 판정 대신 덮는 창의 값(작은 도형은 1~4칸)
            out.append({"mean": round(float(win.mean()), 1), "max": round(float(win.max()), 1)})
        return out
    except Exception:  # noqa: BLE001
        return [None] * len(geoms5179)
