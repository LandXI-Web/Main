"""변화 탐지 계산 — 두 해 영상 → 피복 U-Net ×2 → 전이 → 변화 폴리곤(유형 · 면적 · 구역 안팎 · 필지).

GPU 추론은 이 함수를 부르는 쪽(작업 대기열의 GPU 워커)이 net 을 넘긴다. 여기서는 전력 · 대기열을 다루지 않는다.
- 같은 격자: 두 해 모두 같은 줌(18=25cm, 17=51cm)으로 받는다. 17 이면 U-Net 학습 해상도(25cm)에 맞춰 2배로 키워 추론.
- 추론: landcover_unet.predict(1024 칸 · 128 겹침 = 12.5%) — 기존 방식 그대로.
- 12분류 → 뜻 묶음: characterize_idle.GROUP(건물 · 도로 · 경작 · 산림 · 수역 · 나지초지) 그대로.
- 도로 보정: 고속국도 도로(본선) 필지 안의 나지초지는 두 해 모두 도로로(U-Net 이 포장면을 나지로 흡수하는 경향 · 지시서 3.4).
- 유형(A→B): 신축 비건물→건물 · 소실 건물→비건물 · 경작 전환 나지초지·도로→경작 · 포장 확대 나지초지·경작→도로
  · 식생 증감 그 밖 산림 전이(참고 · 기본 숨김).
- 거름: 최소 면적 50㎡ · 세장비(최소 회전 사각형 긴 변/짧은 변) 6 넘는 띠 버림 · 열기(잡음) 연산.
"""
from __future__ import annotations

import math
import time
from dataclasses import dataclass

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

from . import roadland_src

roadland_src()
from characterize_idle import GROUP  # noqa: E402 — 12분류 → 뜻 묶음(검증된 묶음 그대로)

G = {"built": 1, "road": 2, "crop": 3, "forest": 4, "water": 5, "other": 6}   # 묶음 번호
LUT = np.zeros(16, np.uint8)
for g, cs in GROUP.items():
    for c in cs:
        LUT[c] = G[g]
GNAME = {1: "건물", 2: "도로", 3: "경작", 4: "산림", 5: "수역", 6: "나지초지"}

TYPES = ["신축", "소실", "경작 전환", "포장 확대", "식생 증감"]
TYPE_HIDDEN = {"식생 증감"}
# 카드마다 찾는 변화 묶음(카드 판 modules.change_types · 10-25) — 국토 변화 기본값(TYPES)은 그대로 두고 더한다
TYPE_SETS = {"landslide": ["산림 → 나지", "산림 → 도로", "산림 → 건물"]}


def types_of(tset: str | None) -> list[str]:
    return list(TYPE_SETS.get(tset or "", TYPES))
MIN_AREA = 50.0      # ㎡
MAX_ELONG = 6.0      # 세장비
MIN_AREA_BY = {"경작 전환": 200.0, "식생 증감": 300.0, "산림 → 나지": 100.0}   # 계절 차이로 흔들리는 유형은 더 크게(영상 계절이 다름 · 지시서 3.4)


def group_map(cls: np.ndarray) -> np.ndarray:
    return LUT[np.clip(cls, 0, 15)]


def transitions(ga: np.ndarray, gb: np.ndarray, tset: str | None = None) -> dict[str, np.ndarray]:
    B, R, C, F, O = G["built"], G["road"], G["crop"], G["forest"], G["other"]
    valid = (ga > 0) & (gb > 0)
    if tset == "landslide":
        # 산사태 취약지구(10-25) — 산림이었던 자리가 나지초지 · 도로 · 건물로(앞 시점 산림만 · 다른 전이는 보지 않음)
        return {"산림 → 나지": valid & (ga == F) & (gb == O), "산림 → 도로": valid & (ga == F) & (gb == R),
                "산림 → 건물": valid & (ga == F) & (gb == B)}
    m = {
        # 도로 ↔ 건물은 변화로 세지 않는다 — U-Net 이 포장면(특히 콘크리트 고속도로 · 요금소 바닥)을 해마다 건물 ↔ 도로로 흔들어 잡는다
        # (지시서 3.4 · 10-22 담양 시험: 소실 · 신축 오탐 대부분이 본선 포장면). 도로였던 자리의 진짜 건물은 '나지 → 건물'로 대개 잡힌다.
        "신축": valid & ~np.isin(ga, [B, R]) & (gb == B),
        "소실": valid & (ga == B) & ~np.isin(gb, [B, R]),
        "경작 전환": valid & np.isin(ga, [O, R]) & (gb == C),
        "포장 확대": valid & np.isin(ga, [O, C]) & (gb == R),
    }
    m["식생 증감"] = valid & (((ga == F) & (gb != F)) | ((ga != F) & (gb == F))) & ~(m["신축"] | m["소실"])
    return m


def _clean(mask: np.ndarray, res: float) -> np.ndarray:
    k = max(1, int(round(1.0 / res)))          # 약 1 m 열기 · 닫기
    st = np.ones((2 * k + 1, 2 * k + 1), bool)
    mask = ndi.binary_opening(mask, structure=st)
    mask = ndi.binary_closing(mask, structure=st)
    return mask


def elongation(poly) -> float:
    try:
        r = poly.minimum_rotated_rectangle
        xs, ys = r.exterior.coords.xy
        a = math.dist((xs[0], ys[0]), (xs[1], ys[1]))
        b = math.dist((xs[1], ys[1]), (xs[2], ys[2]))
        lo, hi = sorted([a, b])
        return hi / lo if lo > 0 else 99.0
    except Exception:
        return 1.0


@dataclass
class Grid:
    ox: float
    oy: float
    res: float
    H: int
    W: int

    def affine(self):
        from rasterio.transform import Affine
        return Affine(self.res, 0, self.ox, 0, -self.res, self.oy)


def polygons(masks: dict[str, np.ndarray], grid: Grid, aoi_mask: np.ndarray | None, min_area: float | None = None, elong: bool = True):
    """유형별 마스크 → shapely 폴리곤 목록[(유형, poly)] — 거름 적용(min_area 를 주면 유형 하한 대신 그 값 · 블록 조각용)."""
    from rasterio.features import shapes
    from shapely.geometry import shape
    out = []
    for t in masks:
        m = masks[t]
        if aoi_mask is not None:
            m = m & aoi_mask
        m = _clean(m, grid.res)
        if not m.any():
            continue
        lab, n = ndi.label(m)
        if n == 0:
            continue
        sizes = np.bincount(lab.ravel())
        amin = min_area if min_area is not None else MIN_AREA_BY.get(t, MIN_AREA)
        px_min = amin / (grid.res * grid.res)
        keep = np.where(sizes >= px_min)[0]
        keep = keep[keep > 0]
        if not len(keep):
            continue
        m2 = np.isin(lab, keep)
        for geom, v in shapes(m2.astype(np.uint8), mask=m2, transform=grid.affine()):
            if not v:
                continue
            p = shape(geom).buffer(0)
            if p.is_empty:
                continue
            p = p.simplify(grid.res * 0.75, preserve_topology=True)
            if p.area < amin:
                continue
            if elong and elongation(p) > MAX_ELONG and p.area < 2000:
                continue
            out.append((t, p))
    return out


def upsample2(rgb: np.ndarray) -> np.ndarray:
    return np.asarray(Image.fromarray(rgb).resize((rgb.shape[1] * 2, rgb.shape[0] * 2), Image.BICUBIC))


def infer_groups(net, rgb: np.ndarray, up: bool, device="cuda", pause=None) -> np.ndarray:
    """RGB → 뜻 묶음 지도(원래 격자 크기). up 이면 2배로 키워 추론 후 다시 줄임(최빈 대신 가운데 표본)."""
    import landcover_unet as LC
    x = upsample2(rgb) if up else rgb
    H, W = x.shape[:2]
    tile, overlap = 1024, 128
    step = tile - overlap
    out = np.zeros((H, W), np.uint8)
    blank = x.max(axis=2) < 8
    for y0 in range(0, H, step):
        for x0 in range(0, W, step):
            y1, x1 = min(y0 + tile, H), min(x0 + tile, W)
            if blank[y0:y1, x0:x1].mean() > 0.98:
                pass
            else:
                out[y0:y1, x0:x1] = group_map(LC._predict_one(net, x[y0:y1, x0:x1], device))
            if pause:
                pause()
            if x1 == W:
                break
        if y1 == H:
            break
    out[blank] = 0
    if up:
        out = out[::2, ::2]
    return out


def burn_road(gm: np.ndarray, road_mask: np.ndarray | None) -> np.ndarray:
    if road_mask is None:
        return gm
    gm = gm.copy()
    # 고속국도 '도로(본선)' 필지 = 권위 있는 도로(hero_cases.burn_roads 와 같은 생각) — 나지초지 · 건물로 잡힌 포장면을 도로로.
    # 본선 필지 위 진짜 새 건물(요금소 등)은 놓칠 수 있다 — 지목 '도로'인 폐도 · 유휴지 필지는 그대로 본다.
    gm[road_mask & np.isin(gm, [G["other"], G["built"]])] = G["road"]
    return gm


# ── 썸네일(필지 중심 정사각 크롭 · 사례 그림 방식) ─────────────────────────────
def thumb(rgb: np.ndarray, grid: Grid, poly, size: int = 320, color=(255, 64, 64)) -> Image.Image:
    minx, miny, maxx, maxy = poly.bounds
    cx, cy = (minx + maxx) / 2, (miny + maxy) / 2
    side = max(40.0, 2.2 * max(maxx - minx, maxy - miny))
    half = side / 2
    px0 = int((cx - half - grid.ox) / grid.res)
    py0 = int((grid.oy - (cy + half)) / grid.res)
    n = max(8, int(side / grid.res))
    canvas = np.zeros((n, n, 3), np.uint8)
    sx0, sy0 = max(0, px0), max(0, py0)
    sx1, sy1 = min(grid.W, px0 + n), min(grid.H, py0 + n)
    if sx1 > sx0 and sy1 > sy0:
        canvas[sy0 - py0:sy1 - py0, sx0 - px0:sx1 - px0] = rgb[sy0:sy1, sx0:sx1]
    im = Image.fromarray(canvas).resize((size, size), Image.BICUBIC)
    k = size / n
    d = ImageDraw.Draw(im)
    geoms = [poly] if poly.geom_type == "Polygon" else list(poly.geoms)
    for g in geoms:
        pts = [(((x - grid.ox) / grid.res - px0) * k, ((grid.oy - y) / grid.res - py0) * k) for x, y in g.exterior.coords]
        d.line(pts, fill=color, width=3)
    return im


def now_ms(t0: float) -> int:
    return int((time.perf_counter() - t0) * 1000)
