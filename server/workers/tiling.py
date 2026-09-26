"""AOI ∩ footprint → 칩(shard) 격자. P4 실측 규칙(1024 칩 · overlap 128px) + car_v1/infer_orthomosaic 방식(overlap 20% 옵션).

shard = 모델 입력 1장(chip × chip). upsample u 면 원본 창은 chip/u px 을 u 배 키워 넣는다(25cm → 12.5cm 상당).
shard id = r{row:03d}c{col:03d} (격자 원점 = AOI 픽셀 bbox 좌상단 · 멱등).
core = 칩 안에서 '내 것'으로 인정하는 영역(이웃과 겹치는 폭의 절반은 이웃에게) — 박스 중심 기준.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

from pyproj import Transformer
from shapely.geometry import Polygon, box, mapping, shape
from shapely.ops import transform as sh_transform
from shapely.prepared import prep


@dataclass
class Grid:
    chip: int            # 모델 입력 px
    src_chip: int        # 원본 창 px (= chip / upsample)
    overlap: int         # 원본 px
    stride: int          # 원본 px
    upsample: float
    col0: int
    row0: int
    ncols: int
    nrows: int


def overlap_px(chip: int, overlap) -> int:
    if overlap is None:
        return 128
    if isinstance(overlap, float) and overlap < 1:
        return int(round(chip * overlap))
    return int(overlap)


def make_grid(width: int, height: int, transform, aoi_src: Polygon | None, chip: int = 1024, overlap=None, upsample: float = 1.0) -> Grid:
    up = float(upsample or 1)
    src_chip = max(64, int(round(chip / up)))
    ov = max(0, int(round(overlap_px(chip, overlap) / up)))
    stride = src_chip - ov
    if aoi_src is not None:
        inv = ~transform
        xs, ys = zip(*[inv * (x, y) for x, y in aoi_src.exterior.coords])
        c0, c1 = max(0, int(math.floor(min(xs)))), min(width, int(math.ceil(max(xs))))
        r0, r1 = max(0, int(math.floor(min(ys)))), min(height, int(math.ceil(max(ys))))
    else:
        c0, c1, r0, r1 = 0, width, 0, height
    w, h = max(0, c1 - c0), max(0, r1 - r0)
    ncols = 1 if w <= src_chip else math.ceil((w - src_chip) / stride) + 1
    nrows = 1 if h <= src_chip else math.ceil((h - src_chip) / stride) + 1
    if w == 0 or h == 0:
        ncols = nrows = 0
    return Grid(chip, src_chip, ov, stride, up, c0, r0, ncols, nrows)


def shards(ds_meta: dict, aoi4326: dict | None, *, chip: int = 1024, overlap=None, upsample: float = 1.0,
           footprint_src: list | None = None) -> tuple[Grid, list[dict]]:
    """ds_meta = {width, height, transform(Affine), crs(epsg int)} · aoi4326 = GeoJSON Polygon · footprint_src = [shapely in src crs]."""
    tr = ds_meta["transform"]
    crs = ds_meta["crs"]
    to_src = Transformer.from_crs(4326, crs, always_xy=True).transform
    to4326 = Transformer.from_crs(crs, 4326, always_xy=True).transform
    aoi_src = sh_transform(to_src, shape(aoi4326)) if aoi4326 else None
    g = make_grid(ds_meta["width"], ds_meta["height"], tr, aoi_src, chip, overlap, upsample)
    clip = aoi_src
    fp = None
    if footprint_src:
        from shapely.ops import unary_union
        fp = unary_union(footprint_src)
        clip = fp if clip is None else clip.intersection(fp)
    pclip = prep(clip) if clip is not None else None
    half = g.overlap // 2
    out = []
    for r in range(g.nrows):
        for c in range(g.ncols):
            x = g.col0 + c * g.stride
            y = g.row0 + r * g.stride
            x = min(x, max(0, ds_meta["width"] - g.src_chip))
            y = min(y, max(0, ds_meta["height"] - g.src_chip))
            x0, y0 = tr * (x, y)
            x1, y1 = tr * (x + g.src_chip, y + g.src_chip)
            cell = box(min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1))
            if pclip is not None and not pclip.intersects(cell):
                continue
            # core(모델 px 좌표)
            cx0 = 0 if c == 0 else half
            cy0 = 0 if r == 0 else half
            cx1 = g.src_chip if c == g.ncols - 1 else g.src_chip - half
            cy1 = g.src_chip if r == g.nrows - 1 else g.src_chip - half
            k = g.chip / g.src_chip
            b4326 = sh_transform(to4326, cell).bounds
            out.append({
                "shard_id": f"r{r:03d}c{c:03d}",
                "bbox": [round(v, 7) for v in b4326],
                "window": {"col_off": x, "row_off": y, "width": g.src_chip, "height": g.src_chip,
                           "upsample": g.upsample, "chip": g.chip,
                           "core": [cx0 * k, cy0 * k, cx1 * k, cy1 * k]},
            })
    return g, out


def area_km2(aoi4326: dict, epsg: int = 5186) -> float:
    to = Transformer.from_crs(4326, epsg, always_xy=True).transform
    return sh_transform(to, shape(aoi4326)).area / 1e6
