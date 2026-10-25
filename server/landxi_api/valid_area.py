"""영상의 빈 곳 빼기(10-25 원칙 340 — "흰 바탕(밴드4)을 분석하네? 이건 어떤 조건이라도 기본으로 제외해야 한다").

영상의 빈 곳 = ① 투명 칸(넷째 밴드 알파 · 내부 마스크 · nodata 값) ② 마스크 밖이 아닌데도 흰색(255) · 검은색(0)으로 채운 칸
  (영상 가장자리나 ①의 빈 곳에 이어진 넓고 무늬 없는 흰 · 검은 덩어리 — 영상 안의 흰 비닐하우스 지붕처럼 무늬가 있거나
  빈 곳과 떨어진 것은 건드리지 않는다).
이 모듈이 한 곳에서 정한다 — 영상 표준본 만들기(imagery_std) · 분석 칸 나누기 · 칸 읽기(gpu_worker) · 결과 마무리(cpu_worker) ·
카드 그림(card_cover · card_cover_pick) · 지난 결과 정리(ops/nodata_clean.py)가 같은 함수를 쓴다.

  compute(path)          → 영상에서 빈 곳을 찾아 '영상이 있는 곳'(유효 범위) 도형(경위도 MultiPolygon)과 기록 {invalid, fill, res_m …}
  store(iid, geom, rec)  → 02. 데이터/imagery/valid/{영상 id}.geojson (경위도 · 화면 · 작업기 공용)
  load(iid)              → 유효 범위(경위도 shapely) | None — 프로세스 안에서 기억
  window_valid(...)      → 칸 하나(원본 창)의 유효 칸 표(bool h×w) — 마스크 · 유효 범위 · 정확한 0 채움
  clip_feats(feats, v)   → 결과를 유효 범위로 자르기(절반 넘게 빈 곳이면 뺌) · 기록

GPU 0 — 작게 읽기(약 2 m 칸) · CPU.
"""
from __future__ import annotations

import json
import os
import threading
import time
from pathlib import Path

from . import config

RES_M = 2.0                  # 빈 곳 찾기 칸 크기(m) — 25 cm 항공 = 8배 · 드론 1.7 cm = 약 120배 줄여 읽기
MAX_PX = 4.0e8               # 작게 읽은 표의 최대 칸 수(넘으면 칸을 키움)
WHITE, BLACK = 242, 5        # 채움 색 문턱(세 밴드 모두 · 흰 채움은 JPEG 번짐으로 242~254)
FLAT_STD = 5.0               # 채움 덩어리의 밝기 흔들림 상한(무늬 없는 덩어리만 — 흰 지붕 · 비닐하우스는 무늬가 있다)
MIN_FILL_M2 = 400.0          # 이보다 작은 채움 덩어리는 빈 곳으로 보지 않는다(작은 흰 지붕)
BIG_FILL_M2 = 5000.0         # 빈 곳에 닿지 않아도 이만큼 넓고 아주 고른(밝기 흔들림 4 이하) 흰 · 검은 덩어리는 빈 곳(드론 영상 안의 못 찍은 자리)
BIG_FLAT_STD = 4.0
DROP_FRAC = 0.5              # 결과가 이 비율 넘게 빈 곳 위면 뺀다 · 그 아래는 유효 범위로 자른다
CLIP_FRAC, CLIP_M2 = 0.10, 10.0  # 걸친 결과는 빈 곳 몫이 10% 넘고 10 m² 넘을 때만 자른다(유효 범위가 약 2 m 칸이라 그보다 작은 차이는 자르지 않음)
TILE_MIN_VALID = 0.10        # 칸(칩)에서 영상이 있는 곳이 이 비율 미만이면 분석하지 않는다
_CACHE: dict = {}
_LOCK = threading.Lock()


def _dir() -> Path:
    return config.DATA_ROOT / "imagery" / "valid"


def path_of(iid: str) -> Path:
    return _dir() / f"{iid}.geojson"


# ── 빈 곳 찾기 ─────────────────────────────────────────────────────────────────
def _grid(path: str, res_m: float = RES_M):
    """작게 읽기 → (mask_valid bool, white bool, black bool, gray uint8, 칸 변환, crs, k)"""
    import warnings

    import numpy as np
    import rasterio
    from rasterio.enums import Resampling
    from rasterio.windows import Window
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        d = rasterio.open(path)
    with d:
        r = abs(d.transform.a) or 1.0
        unit = 111000.0 if (d.crs and d.crs.is_geographic) else 1.0
        k = max(1, int(round(res_m / (r * unit))))
        while (d.width / k) * (d.height / k) > MAX_PX:
            k += 1
        try:
            ovs = d.overviews(1)
        except Exception:  # noqa: BLE001
            ovs = []
        lvl = None
        if ovs:                                    # 축소판이 있으면 그 배율의 축소판을 직접 연다(505 GB 영상도 축소판 한 장만 읽게)
            import math
            f = min(ovs, key=lambda x: abs(math.log(x / k)))
            if (d.width / f) * (d.height / f) <= MAX_PX:
                k, lvl = f, ovs.index(f)
        tr = d.transform * d.transform.scale(k, k)
        crs = d.crs
        bands = [1, 2, 3] if d.count >= 3 else [1, 1, 1]
        color = d.dtypes[0] == "uint8"
        W0, H0 = d.width, d.height
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        src = rasterio.open(path, overview_level=lvl) if lvl is not None else rasterio.open(path)
    with src as d:
        W, H = (d.width, d.height) if lvl is not None else (max(1, W0 // k), max(1, H0 // k))
        kk = 1 if lvl is not None else k
        m = np.zeros((H, W), bool)
        white = np.zeros((H, W), bool)
        black = np.zeros((H, W), bool)
        gray = np.zeros((H, W), np.uint8)
        step = max(1, min(H, int(6e7 // max(W, 1))))
        for y in range(0, H, step):
            h = min(step, H - y)
            win = Window(0, y * kk, W * kk, h * kk)
            mm = d.dataset_mask(window=win, out_shape=(h, W))
            m[y:y + h] = mm > 0
            if color:
                a = d.read(bands, window=win, out_shape=(3, h, W), resampling=Resampling.nearest)
                white[y:y + h] = np.all(a >= WHITE, 0)
                black[y:y + h] = np.all(a <= BLACK, 0)
                gray[y:y + h] = (a.astype(np.uint16).sum(0) // 3).astype(np.uint8)
        if lvl is not None:
            tr = d.transform
    return m, white, black, gray, tr, crs, k


def fill_of(m, white, black, gray, cell_m2: float):
    """채움 덩어리 — 흰 · 검은 칸 중 영상 가장자리나 빈 곳(마스크 밖)에 이어지고, 넓고, 무늬가 없는 것."""
    import numpy as np
    from scipy import ndimage
    cand = (white | black) & m
    if not cand.any():
        return np.zeros_like(m)
    touch = ~m
    touch = ndimage.binary_dilation(touch, iterations=1) if touch.any() else touch
    border = np.zeros_like(m)
    border[0, :] = border[-1, :] = border[:, 0] = border[:, -1] = True
    lab, n = ndimage.label(cand)
    if n == 0:
        return np.zeros_like(m)
    idx = np.arange(1, n + 1)
    hit = ndimage.maximum((touch | border).astype(np.uint8), lab, idx) > 0
    size = ndimage.sum(np.ones_like(lab, dtype=np.uint8), lab, idx)
    g = gray.astype(np.float32)
    mean = ndimage.mean(g, lab, idx)
    sq = ndimage.mean(g * g, lab, idx)
    std = np.sqrt(np.maximum(sq - mean * mean, 0))
    keep = (hit & (size * cell_m2 >= MIN_FILL_M2) & (std <= FLAT_STD)) | ((size * cell_m2 >= BIG_FILL_M2) & (std <= BIG_FLAT_STD))
    good = np.zeros(n + 1, bool)
    good[1:] = keep
    return good[lab]


def compute(path: str, res_m: float = RES_M) -> tuple[object, dict]:
    """→ (유효 범위 경위도 MultiPolygon | None, 기록). 기록: invalid(빈 곳 비율) · mask(마스크 밖) · fill(채움) · res_m · sec"""
    import numpy as np
    import shapely
    from pyproj import Transformer
    from rasterio.features import shapes
    from shapely.geometry import MultiPolygon, shape
    from shapely.ops import transform as stx
    t0 = time.time()
    m, white, black, gray, tr, crs, k = _grid(path, res_m)
    unit = 111000.0 if (crs and crs.is_geographic) else 1.0
    cell = abs(tr.a) * unit
    fill = fill_of(m, white, black, gray, cell * cell)
    valid = m & ~fill
    rec = {"mask": round(float((~m).mean()), 4), "fill": round(float(fill.mean()), 4),
           "res_m": round(cell, 2), "px": [int(m.shape[1]), int(m.shape[0])]}
    if not valid.any():
        rec["sec"] = round(time.time() - t0, 1)
        return None, rec
    # 부스러기 정리 — 작은 유효 조각은 버리고 작은 빈 구멍은 메운다(도형 수를 줄여 빠르게 · 결과를 가르는 데는 영향 없음)
    from scipy import ndimage
    small = max(4, int(MIN_FILL_M2 / max(cell * cell, 1e-9)))
    lab, n = ndimage.label(valid)
    if n:
        sz = ndimage.sum(np.ones_like(lab, dtype=np.uint8), lab, np.arange(1, n + 1))
        good = np.zeros(n + 1, bool)
        good[1:] = sz >= small
        valid = good[lab]
    hl, hn = ndimage.label(~valid)
    if hn:
        hs = ndimage.sum(np.ones_like(hl, dtype=np.uint8), hl, np.arange(1, hn + 1))
        edge = set(np.unique(np.concatenate([hl[0], hl[-1], hl[:, 0], hl[:, -1]])).tolist())
        fillh = np.zeros(hn + 1, bool)
        fillh[1:] = hs < small
        for e in edge:
            if e:
                fillh[e] = False
        valid = valid | fillh[hl]
    rec["invalid"] = round(float((~valid).mean()), 4)
    tol = abs(tr.a) * 1.5
    polys = [shape(g).simplify(tol, preserve_topology=True) for g, v in shapes(valid.astype(np.uint8), mask=valid, transform=tr, connectivity=4) if v == 1]
    min_a = (MIN_FILL_M2 / 4) / (unit * unit)
    polys = [p if p.is_valid else p.buffer(0) for p in polys]
    parts = [q for p in polys for q in getattr(p, "geoms", [p]) if q.geom_type == "Polygon" and q.area >= min_a]
    if not parts:
        rec["sec"] = round(time.time() - t0, 1)
        return None, rec
    g = MultiPolygon(parts) if len(parts) > 1 or parts[0].geom_type != "MultiPolygon" else parts[0]
    epsg = crs.to_epsg() if crs else None
    if epsg != 4326:
        T = Transformer.from_crs(crs, 4326, always_xy=True).transform
        g = stx(T, g)
    if not g.is_valid:
        g = g.buffer(0)
    if g.geom_type == "Polygon":
        g = MultiPolygon([g])
    rec["sec"] = round(time.time() - t0, 1)
    rec["parts"] = len(g.geoms)
    rec["npts"] = int(shapely.get_num_coordinates(g))
    return g, rec


def store(iid: str, geom4326, rec: dict) -> Path:
    from shapely.geometry import mapping
    p = path_of(iid)
    p.parent.mkdir(parents=True, exist_ok=True)
    fc = {"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {"imagery": iid, **rec},
                                                      "geometry": mapping(geom4326) if geom4326 is not None else None}]}
    tmp = p.with_suffix(".part")
    tmp.write_text(json.dumps(fc, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, p)
    with _LOCK:
        _CACHE.pop(iid, None)
    return p


def load(iid: str | None):
    """유효 범위(경위도 shapely · 준비된 도형) | None(아직 계산 전 — 부르는 쪽은 마스크만으로)"""
    if not iid:
        return None
    p = path_of(iid)
    try:
        mt = p.stat().st_mtime
    except OSError:
        return None
    with _LOCK:
        hit = _CACHE.get(iid)
        if hit and hit[0] == mt:
            return hit[1]
    try:
        import shapely
        from shapely.geometry import shape
        fc = json.loads(p.read_text(encoding="utf-8"))
        g = fc["features"][0]["geometry"]
        geom = shape(g) if g else None              # 준비(prepare)하지 않는다 — 여러 스레드가 함께 쓰는 도형(준비된 도형은 스레드 안전하지 않음 · 10-25 작업기 GEOS 충돌)
    except Exception:  # noqa: BLE001
        return None
    with _LOCK:
        _CACHE[iid] = (mt, geom)
    return geom


def record(iid: str) -> dict | None:
    try:
        return json.loads(path_of(iid).read_text(encoding="utf-8"))["features"][0]["properties"]
    except Exception:  # noqa: BLE001
        return None


# ── 칸 하나 읽을 때 ──────────────────────────────────────────────────────────
def window_valid(ds, win, arr, valid4326=None, crs_epsg: int | None = None):
    """원본 창의 유효 칸 표(bool h×w) — ① 데이터셋 마스크(알파 · 내부 마스크 · nodata) ② 정확한 0 채움(세 밴드 모두 0 · 창 밖 · 빈 타일)
    ③ 유효 범위(있으면 · 흰 채움처럼 마스크에 없는 빈 곳)."""
    import numpy as np
    h, w = arr.shape[-2], arr.shape[-1]
    ok = np.ones((h, w), bool)
    try:
        if hasattr(ds, "dataset_mask"):
            mk = ds.dataset_mask(window=win, boundless=True)
            if mk.shape == (h, w):
                ok &= mk > 0
    except Exception:  # noqa: BLE001
        pass
    if arr.ndim == 3 and arr.shape[0] >= 3:
        ok &= ~np.all(arr[:3] == 0, axis=0)
    if valid4326 is not None and crs_epsg:
        try:
            from rasterio.features import geometry_mask
            from shapely.geometry import box
            tr = ds.window_transform(win)
            fp = _to_src(valid4326, crs_epsg)
            b = box(tr.c, tr.f + tr.e * h, tr.c + tr.a * w, tr.f)
            if not fp.contains(b):
                part = fp.intersection(b)
                if part.is_empty:
                    ok[:] = False
                else:
                    ok &= ~geometry_mask([part], (h, w), tr, all_touched=True)
        except Exception:  # noqa: BLE001
            pass
    return ok


_TL = threading.local()


def _to_src(g4326, epsg: int):
    """유효 범위를 그 좌표계로 — 스레드마다 따로 만든 사본(준비된 도형을 스레드끼리 나누지 않는다: GEOS 가 스레드 안전하지 않아
    10-25 작업기가 칩 읽기 스레드 16개에서 함께 쓰다 GEOS 접근 위반으로 꺼졌다)."""
    c = getattr(_TL, "src", None)
    if c is None:
        c = _TL.src = {}
    key = (id(g4326), epsg)
    hit = c.get(key)
    if hit is None or hit[0] is not g4326:
        import shapely
        from pyproj import Transformer
        from shapely.ops import transform as stx
        g = shapely.from_wkb(shapely.to_wkb(g4326))
        if epsg != 4326:
            g = stx(Transformer.from_crs(4326, epsg, always_xy=True).transform, g)
        shapely.prepare(g)
        hit = c[key] = (g4326, g)
        if len(c) > 16:
            c.pop(next(iter(c)))
    return hit[1]


def mask_chip(arr, ok):
    """빈 칸을 영상이 있는 칸의 평균 색으로(모델이 흰 · 검은 바탕을 보지 않게). → (arr, 유효 비율)"""
    import numpy as np
    frac = float(ok.mean()) if ok.size else 0.0
    if frac >= 0.999 or frac == 0.0:
        return arr, frac
    out = arr.copy()
    mean = arr[:, ok].mean(axis=1).astype(arr.dtype)
    for b in range(out.shape[0]):
        out[b][~ok] = mean[b]
    return out, frac


# ── 결과 마무리 ─────────────────────────────────────────────────────────────────
def clip_feats(feats: list[dict], valid4326, epsg: int, min_area: float = 0.0, clip: bool = True) -> tuple[list[dict], dict]:
    """feats = [{geom(경위도), props}] → 유효 범위 밖이 절반 넘으면 뺌 · 걸치면 자름(면적 다시). 상자 결과(차량 · 사람)는 자르지 않고 중심으로만."""
    import shapely
    from pyproj import Transformer
    from shapely.ops import transform as stx
    st = {"in": len(feats), "dropped": 0, "clipped": 0}
    if valid4326 is None or not feats:
        st["out"] = len(feats)
        return feats, st
    fwd = Transformer.from_crs(4326, epsg, always_xy=True).transform
    back = Transformer.from_crs(epsg, 4326, always_xy=True).transform
    vm = _to_src(valid4326, epsg)
    out = []
    for f in feats:
        g = f["geom"]
        if vm.contains(stx(fwd, g.representative_point())) and shapely.contains(valid4326, g):
            out.append(f)
            continue
        gm = stx(fwd, g)
        a0 = gm.area
        inter = gm.intersection(vm) if a0 > 0 else gm
        a1 = inter.area if a0 > 0 else (1.0 if vm.contains(gm) else 0.0)
        if a0 <= 0:
            if a1:
                out.append(f)
            else:
                st["dropped"] += 1
            continue
        if a1 < a0 * (1 - DROP_FRAC) or a1 < min_area:
            st["dropped"] += 1
            continue
        if clip and a1 < a0 * (1 - CLIP_FRAC) and a0 - a1 >= CLIP_M2:
            polys = [p for p in getattr(inter, "geoms", [inter]) if p.geom_type == "Polygon" and not p.is_empty]
            if not polys:
                st["dropped"] += 1
                continue
            from shapely.geometry import MultiPolygon
            ng = MultiPolygon(polys) if len(polys) > 1 else polys[0]
            f = {"geom": stx(back, ng), "props": {**f["props"], "area_m2": round(float(ng.area), 1)}}
            st["clipped"] += 1
        out.append(f)
    st["out"] = len(out)
    return out, st
