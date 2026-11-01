"""경작·휴경 시기별 판정 규칙(11-01 PM 확정) — 모델 결과 위에 '작물 없는 맨흙'을 영상 색으로 찾아 촬영 시기에 맞게 나눈다.

PM 기준(원문 요지): 8월처럼 작물이 다 자란 시기 = 작물 없는 맨흙은 휴경 · 6월 모내기 철 = 물 댄 논 · 갈아 둔 논은 경작(잡초만 무성한 방치지만 휴경).
- 다 자란 시기(7~2월 · 월 모름): '경작지' 안의 넓은 맨흙 → '비경작지'(휴경)
- 모내기 철(3~6월): '비경작지' 안의 넓은 맨흙 · 물 댄 곳 → '경작지'(잡초가 난 방치지는 녹색이라 그대로 비경작지)
맨흙 = 녹색 지수 ExG = (2G − R − B)/(R + G + B) 가 BARE_EXG 아래(눈으로 매긴 표본: 맨흙 가운데값 0.01 · 작물 0.21 · 잡초 0.21) ·
채소 고랑 사이 흙 같은 좁은 틈은 열기(OPEN_M)로 지우고, BARE_MIN_M2 넘는 덩어리만 쓴다. 영상 해상도 GSD_MAX 보다 거친 영상(항공 25 cm)에는 쓰지 않는다.
"""
from __future__ import annotations

import numpy as np

import os

ENABLED = os.environ.get("LX_FARM_SEASON", "1") != "0"     # 되돌리기: LX_FARM_SEASON=0 이면 작업기 · 카드 그림 모두 규칙 없이(지금까지와 같음)
FARM = ("경작지", "비경작지")
EN = {"경작지": "farmland", "비경작지": "non_farmland"}
BARE_EXG = 0.08
STEP_M = 0.25         # 판정 화소 크기
COARSE_M = 1.0        # 먼저 1 m 화소로 맨흙이 있을 만한지만 본다(대부분의 녹색 필지는 여기서 끝 · 속도)
OPEN_M = 2.0          # 좁은 흙 틈(고랑) · 논두렁 · 가장자리 띠(폭 2 m 아래) 지우기
BARE_MIN_M2 = 100.0
GSD_MAX = 0.1
MAX_SIDE_PX = 3000    # 큰 면은 화소를 키워 읽는다


def _mask_bare(rgb: np.ndarray, valid: np.ndarray, step: float) -> np.ndarray:
    from scipy import ndimage
    a = rgb.astype(np.float32)
    exg = (2 * a[..., 1] - a[..., 0] - a[..., 2]) / (a.sum(2) + 1e-6)
    m = (exg < BARE_EXG) & valid
    k = max(1, int(round(OPEN_M / step)))
    st = np.ones((k, k), bool)
    m = ndimage.binary_opening(m, structure=st)
    m = ndimage.binary_closing(m, structure=st)
    return m


def plant_season(month: int | None) -> bool:
    return bool(month) and 3 <= int(month) <= 6


def bare_part(ds, g):
    """열린 영상(ds) · 영상 좌표계 도형 g → g 안의 넓은 맨흙(도형) | None(없음 · 못 읽음 · 규칙 끔)."""
    if not ENABLED:
        return None
    import rasterio
    from rasterio.features import geometry_mask, shapes
    from rasterio.windows import from_bounds
    from shapely.geometry import shape
    from shapely.ops import unary_union
    if not g.is_valid:
        g = g.buffer(0)
    gx0, gy0, gx1, gy1 = g.bounds
    cw, ch = max(2, int((gx1 - gx0) / COARSE_M)), max(2, int((gy1 - gy0) / COARSE_M))
    try:
        c = ds.read([1, 2, 3], window=from_bounds(gx0, gy0, gx1, gy1, transform=ds.transform), out_shape=(3, ch, cw), boundless=True, fill_value=255).astype(np.float32)
    except Exception:  # noqa: BLE001
        return None
    cin = geometry_mask([g], out_shape=(ch, cw), transform=rasterio.transform.from_bounds(gx0, gy0, gx1, gy1, cw, ch), invert=True)
    cexg = (2 * c[1] - c[0] - c[2]) / (c.sum(0) + 1e-6)
    if ((cexg < BARE_EXG) & cin & (c.min(0) < 250)).sum() * COARSE_M * COARSE_M < BARE_MIN_M2 * 0.5:
        return None
    pad = OPEN_M * 2                                   # 열기가 도형 가장자리를 깎지 않게 둘레를 더 읽는다
    x0, y0, x1, y1 = g.bounds
    x0, y0, x1, y1 = x0 - pad, y0 - pad, x1 + pad, y1 + pad
    step = max(STEP_M, (x1 - x0) / MAX_SIDE_PX, (y1 - y0) / MAX_SIDE_PX)
    w, h = max(4, int((x1 - x0) / step)), max(4, int((y1 - y0) / step))
    try:
        a = ds.read([1, 2, 3], window=from_bounds(x0, y0, x1, y1, transform=ds.transform), out_shape=(3, h, w), boundless=True, fill_value=255)
    except Exception:  # noqa: BLE001
        return None
    rgb = np.transpose(a, (1, 2, 0))
    tf = rasterio.transform.from_bounds(x0, y0, x1, y1, w, h)
    inside = geometry_mask([g], out_shape=(h, w), transform=tf, invert=True)
    m = _mask_bare(rgb, rgb.min(2) < 250, step) & inside
    if m.sum() * step * step < BARE_MIN_M2:
        return None
    parts = [shape(s) for s, v in shapes(m.astype(np.uint8), mask=m, transform=tf) if v == 1]
    parts = [p if p.is_valid else p.buffer(0) for p in parts if p.area >= BARE_MIN_M2]
    if not parts:
        return None
    bare = unary_union(parts).intersection(g).buffer(-OPEN_M / 2, join_style=2).buffer(OPEN_M / 2, join_style=2).intersection(g).buffer(0)   # 필지 가장자리에 걸친 길 · 둑 띠 지우기
    return None if bare.is_empty or bare.area < BARE_MIN_M2 else bare


def split_bare(feats: list[dict], raster_path, month: int | None) -> tuple[list[dict], dict]:
    """feats = [{geom(경위도 shapely), props}] → 시기 규칙으로 나눈 결과 · 통계. 다른 분류 · 영상을 못 읽는 경우는 그대로."""
    import rasterio
    from pyproj import Transformer
    from shapely.ops import transform as stx
    plant = plant_season(month)
    src_cls, to_cls = ("비경작지", "경작지") if plant else ("경작지", "비경작지")
    st = {"month": month, "rule": "모내기 철" if plant else ("다 자란 시기" if month else "월 모름 → 다 자란 시기"), "split": 0, "m2": 0.0}
    if not ENABLED or not any(f["props"].get("cls") == src_cls for f in feats):
        return feats, st
    out = []
    with rasterio.open(raster_path) as ds:
        if abs(ds.transform.a) > GSD_MAX:
            st["skip"] = "coarse"
            return feats, st
        fwd = Transformer.from_crs(4326, ds.crs, always_xy=True).transform
        back = Transformer.from_crs(ds.crs, 4326, always_xy=True).transform
        for f in feats:
            if f["props"].get("cls") != src_cls:
                out.append(f)
                continue
            g = stx(fwd, f["geom"])
            g = g if g.is_valid else g.buffer(0)
            bare = bare_part(ds, g)
            if bare is None:
                out.append(f)
                continue
            rest = g.difference(bare).buffer(0)
            pid = f["props"].get("id")
            if not rest.is_empty and rest.area >= 1.0:
                out.append({"geom": stx(back, rest), "props": {**f["props"], "area_m2": round(rest.area, 1)}})
            out.append({"geom": stx(back, bare), "props": {**f["props"], "id": f"{pid}-s" if pid is not None else None, "fid": f"{f['props'].get('fid')}-s",
                                                           "cls": to_cls, "cls_en": EN[to_cls], "area_m2": round(bare.area, 1)}})
            st["split"] += 1
            st["m2"] += bare.area
    st["m2"] = round(st["m2"], 1)
    return out, st
