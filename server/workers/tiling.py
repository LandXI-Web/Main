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
        bx0, by0, bx1, by1 = aoi_src.bounds                 # Polygon · MultiPolygon(섬 많은 시군구 전역) 공통
        xs, ys = zip(*[inv * (x, y) for x, y in ((bx0, by0), (bx1, by0), (bx1, by1), (bx0, by1))])
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
           footprint_src: list | None = None, aoi_src=None) -> tuple[Grid, list[dict]]:
    """ds_meta = {width, height, transform(Affine), crs(epsg int)} · aoi4326 = GeoJSON Polygon|MultiPolygon · footprint_src = [shapely in src crs].
    aoi_src = 이미 원본 좌표계로 바꾼 범위(shapely · 있으면 aoi4326 대신)."""
    tr = ds_meta["transform"]
    crs = ds_meta["crs"]
    if aoi_src is None and aoi4326:
        to_src = Transformer.from_crs(4326, crs, always_xy=True).transform
        aoi_src = sh_transform(to_src, shape(aoi4326))
    g = make_grid(ds_meta["width"], ds_meta["height"], tr, aoi_src, chip, overlap, upsample)
    clip = aoi_src
    fp = None
    if footprint_src:
        from shapely.ops import unary_union
        fp = unary_union(footprint_src)
        clip = fp if clip is None else clip.intersection(fp)
    # 벡터화(시군구 전역 1만 칸 이상 · 칸마다 도형을 만들던 예전 방식은 7 s) — 결과(칸 id · bbox · 창)는 예전과 같다
    import numpy as np
    import shapely
    half = g.overlap // 2
    out = []
    if g.nrows == 0 or g.ncols == 0:
        return g, out
    rr, cc = np.meshgrid(np.arange(g.nrows), np.arange(g.ncols), indexing="ij")
    rr, cc = rr.ravel(), cc.ravel()
    xs = np.minimum(g.col0 + cc * g.stride, max(0, ds_meta["width"] - g.src_chip))
    ys = np.minimum(g.row0 + rr * g.stride, max(0, ds_meta["height"] - g.src_chip))
    X0 = tr.c + xs * tr.a + ys * tr.b
    Y0 = tr.f + xs * tr.d + ys * tr.e
    X1 = tr.c + (xs + g.src_chip) * tr.a + (ys + g.src_chip) * tr.b
    Y1 = tr.f + (xs + g.src_chip) * tr.d + (ys + g.src_chip) * tr.e
    mnx, mxx = np.minimum(X0, X1), np.maximum(X0, X1)
    mny, mxy = np.minimum(Y0, Y1), np.maximum(Y0, Y1)
    if clip is not None:
        cells = shapely.box(mnx, mny, mxx, mxy)
        shapely.prepare(clip)
        keep = shapely.intersects(clip, cells)
    else:
        keep = np.ones(len(rr), dtype=bool)
    idx = np.nonzero(keep)[0]
    T = Transformer.from_crs(crs, 4326, always_xy=True)
    corners_x = np.stack([mnx[idx], mxx[idx], mxx[idx], mnx[idx]])
    corners_y = np.stack([mny[idx], mny[idx], mxy[idx], mxy[idx]])
    lx, ly = T.transform(corners_x, corners_y)
    lx, ly = np.asarray(lx), np.asarray(ly)
    b0, b1, b2, b3 = lx.min(axis=0), ly.min(axis=0), lx.max(axis=0), ly.max(axis=0)
    k = g.chip / g.src_chip
    for j, i in enumerate(idx):
        r, c = int(rr[i]), int(cc[i])
        cx0 = 0 if c == 0 else half
        cy0 = 0 if r == 0 else half
        cx1 = g.src_chip if c == g.ncols - 1 else g.src_chip - half
        cy1 = g.src_chip if r == g.nrows - 1 else g.src_chip - half
        out.append({
            "shard_id": f"r{r:03d}c{c:03d}",
            "bbox": [round(float(v), 7) for v in (b0[j], b1[j], b2[j], b3[j])],
            "window": {"col_off": int(xs[i]), "row_off": int(ys[i]), "width": g.src_chip, "height": g.src_chip,
                       "upsample": g.upsample, "chip": g.chip,
                       "core": [cx0 * k, cy0 * k, cx1 * k, cy1 * k]},
        })
    return g, out


def area_km2(aoi4326: dict, epsg: int = 5186) -> float:
    to = Transformer.from_crs(4326, epsg, always_xy=True).transform
    return sh_transform(to, shape(aoi4326)).area / 1e6


# ── 시군구 전역 분석(scope sgg · core-xi) ─────────────────────────────────────────────────────────────
# 범위 = 시군구 읍면동 합집합 ∩ 영상 footprint. 칸(shard)을 읍면동에 묶고, 화면 중심에서 가까운 읍면동부터 · 읍면동 안에서는
# 화면 중심에서 가까운 칸부터 내보낸다(첫 결과가 보고 있는 곳에서 나오고, 읍면동 순서로 차오른다). shard params = {emd_cd}.
def emd_order(emd_geoms4326: list, emd_codes: list, center: list | None) -> list[str]:
    """읍면동 순서 — 화면 중심을 품은 읍면동 → 대표점이 중심에서 가까운 순. 중심이 없으면 코드 순."""
    from shapely.geometry import Point
    if not center:
        return list(emd_codes)
    pt = Point(float(center[0]), float(center[1]))
    rank = []
    for g, cd in zip(emd_geoms4326, emd_codes):
        try:
            d = 0.0 if g.contains(pt) else g.representative_point().distance(pt)
        except Exception:
            d = 1e9
        rank.append((d, cd))
    rank.sort()
    return [cd for _, cd in rank]


def sgg_shards(ds_meta: dict, emd_geoms4326: list, emd_codes: list, *, center: list | None = None, chip: int = 1024, overlap=None,
               upsample: float = 1.0, footprint_src: list | None = None) -> tuple[Grid | None, list[dict], dict]:
    """→ (grid, shards(읍면동 순서), info{aoi4326(MultiPolygon GeoJSON), area_km2, emd:[{emd_cd, shards}], coverage})."""
    from shapely import STRtree
    from shapely.geometry import Point
    from shapely.ops import unary_union
    crs = ds_meta["crs"]
    to_src = Transformer.from_crs(4326, crs, always_xy=True).transform
    to4326 = Transformer.from_crs(crs, 4326, always_xy=True).transform
    emd_src = [sh_transform(to_src, g) for g in emd_geoms4326]
    land = unary_union(emd_src)
    fp = unary_union(footprint_src) if footprint_src else None
    aoi_src = land.intersection(fp) if fp is not None else land
    info = {"land_km2": round(land.area / 1e6, 3) if crs != 4326 else None, "coverage": 0.0, "emd": [], "aoi4326": None, "area_km2": 0.0}
    if aoi_src.is_empty or aoi_src.area <= 0:
        return None, [], info
    info["coverage"] = round(aoi_src.area / max(land.area, 1e-9), 4)
    info["area_km2"] = round(aoi_src.area / 1e6, 3)
    g, cells = shards(ds_meta, None, chip=chip, overlap=overlap, upsample=upsample, aoi_src=aoi_src)
    order = emd_order(emd_geoms4326, emd_codes, center)
    pos = {cd: i for i, cd in enumerate(order)}
    import numpy as np
    import shapely
    tree = STRtree(emd_src)
    tr = ds_meta["transform"]
    if not cells:
        return g, [], info
    wc = np.array([[s["window"]["col_off"] + s["window"]["width"] / 2, s["window"]["row_off"] + s["window"]["height"] / 2] for s in cells])
    px = tr.c + wc[:, 0] * tr.a + wc[:, 1] * tr.b
    py = tr.f + wc[:, 0] * tr.d + wc[:, 1] * tr.e
    pts = shapely.points(px, py)
    qi, qt = tree.query(pts, predicate="within")
    assign = np.full(len(cells), -1, dtype=np.int64)
    assign[qi[::-1]] = qt[::-1]                               # 같은 점이 두 곳에 걸리면 첫 번째
    if center:
        cx, cy = to_src(float(center[0]), float(center[1]))
        dist = np.hypot(px - cx, py - cy)
    else:
        dist = np.zeros(len(cells))
    keyed = []
    for i, s in enumerate(cells):
        k = int(assign[i])
        if k < 0:                                           # 칸 중심이 바다 · 경계 밖 — 칸이 걸친 읍면동 중 가장 많이 겹치는 곳
            half = s["window"]["width"] / 2 * abs(tr.a)
            cell = Point(px[i], py[i]).buffer(half, cap_style=3)
            cand = [int(x) for x in tree.query(cell, predicate="intersects")]
            if not cand:
                continue
            k = max(cand, key=lambda x: emd_src[x].intersection(cell).area)
        cd = emd_codes[k]
        s["params"] = {"emd_cd": cd}
        keyed.append((pos.get(cd, 10 ** 6), float(dist[i]), s["shard_id"], s))
    keyed.sort(key=lambda t: (t[0], t[1], t[2]))
    out = [t[3] for t in keyed]
    per: dict[str, int] = {}
    for s in out:
        per[s["params"]["emd_cd"]] = per.get(s["params"]["emd_cd"], 0) + 1
    info["emd"] = [{"emd_cd": cd, "shards": per[cd]} for cd in order if cd in per]
    info["aoi4326"] = mapping(sh_transform(to4326, aoi_src.simplify(5 if crs != 4326 else 0.00005)))   # 화면·계량용(≈5 m 단순화)
    return g, out, info
