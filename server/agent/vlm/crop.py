"""조각 만들기(crop_tiles) — 필지·결과 피처 경계 + 여백으로 등록 영상을 잘라 PNG 를 만든다(CPU 만 · GPU 0).

· 영상 원천: 등록 영상 표(imagery)의 PMTiles 세트(있으면) → 없으면 원본·COG 를 게이트웨이 타일 렌더(landxi_api.tiles._render)로.
  tiles.py 는 불러 쓰기만 한다(고치지 않음).
· 시점: 경계와 겹치는 등록 영상 가운데 서로 다른 촬영 시점 최대 4장(고해상도 ≤ 0.5 m 먼저 → 최근 순).
· 겹침: 노란 선 = 필지(또는 피처) 경계 · 하늘색 선 = AI 탐지(AI 결과 연도와 같은 시점 한 장에만).
· 파일은 run 산출 폴더(LX_DATA_ROOT/agent/{run_id}/crops/)에 둔다. 경로 글자는 화면에 내지 않는다(내려받기 주소만).
"""
from __future__ import annotations

import math
import os
import re
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

TILE = 256
R_EARTH = 6378137.0
ORIGIN = math.pi * R_EARTH
OUT_PX = 512                 # 긴 변(비전 모델 입력 · 명령 바 표시)
MAX_TILES = 36               # 한 장 렌더 상한(CPU 보호)
MIN_COVER = 0.3              # 경계 상자 안 영상 화소가 이 비율 미만이면 그 시점은 뺀다
MAX_VIEWS = 4
PARCEL_BGR = (0, 212, 255)   # 노랑(#FFD400)
AI_BGR = (255, 214, 0)       # 하늘색(#00D6FF)
NODATA_BGR = (235, 232, 229)


@dataclass
class Source:
    id: str
    label: str                       # 화면 캡션(예: '2023 항공 25cm')
    epoch: str                       # 정렬·중복 제거 키(예: '2023' · '2025-08')
    gsd_m: float | None = None
    pm_path: str | None = None       # PMTiles 절대 경로
    raster_path: str | None = None   # 원본·COG 절대 경로


@dataclass
class View:
    source: Source
    png: bytes
    cover: float
    zoom: int
    ai_overlay: bool = False
    path: Path | None = None
    name: str = ""


@dataclass
class CropResult:
    views: list[View] = field(default_factory=list)
    skipped: list[dict] = field(default_factory=list)
    bbox: list[float] | None = None


# ── 좌표 ──────────────────────────────────────────────────────────────────
def lonlat_to_m(lon: float, lat: float) -> tuple[float, float]:
    lat = max(min(lat, 85.05112878), -85.05112878)
    x = lon * ORIGIN / 180.0
    y = math.log(math.tan((90 + lat) * math.pi / 360.0)) * R_EARTH
    return x, y


def res_at(z: int) -> float:
    return 2 * ORIGIN / (TILE * 2 ** z)


def rings_of(geom: dict | None) -> list[list[list[float]]]:
    """GeoJSON Polygon·MultiPolygon → 바깥·안쪽 고리 목록(선 그리기용)."""
    if not geom:
        return []
    t = geom.get("type")
    c = geom.get("coordinates") or []
    if t == "Polygon":
        return [r for r in c]
    if t == "MultiPolygon":
        return [r for poly in c for r in poly]
    if t == "GeometryCollection":
        return [r for g in geom.get("geometries") or [] for r in rings_of(g)]
    return []


def bbox_of(geom: dict) -> list[float]:
    xs, ys = [], []
    for r in rings_of(geom):
        for x, y in r:
            xs.append(x)
            ys.append(y)
    if not xs:
        pt = geom.get("coordinates") if geom.get("type") == "Point" else None
        if pt:
            return [pt[0], pt[1], pt[0], pt[1]]
        raise ValueError("빈 도형")
    return [min(xs), min(ys), max(xs), max(ys)]


def padded_bbox(b: list[float], pad_ratio: float = 0.35, min_m: float = 60.0) -> list[float]:
    """경계 상자 + 여백(한 변 35% · 최소 폭 60 m) → 정사각에 가깝게."""
    lat = (b[1] + b[3]) / 2
    m_per_deg_x = 111320.0 * math.cos(math.radians(lat))
    m_per_deg_y = 110540.0
    w = max((b[2] - b[0]) * m_per_deg_x, 1.0)
    h = max((b[3] - b[1]) * m_per_deg_y, 1.0)
    side = max(w, h) * (1 + 2 * pad_ratio)
    side = max(side, min_m)
    cx, cy = (b[0] + b[2]) / 2, (b[1] + b[3]) / 2
    dx = side / 2 / m_per_deg_x
    dy = side / 2 / m_per_deg_y
    return [cx - dx, cy - dy, cx + dx, cy + dy]


def zoom_for(bb: list[float], gsd_m: float | None, max_zoom: int | None = None) -> int:
    x0, y0 = lonlat_to_m(bb[0], bb[1])
    x1, y1 = lonlat_to_m(bb[2], bb[3])
    span = max(x1 - x0, y1 - y0)
    z = int(math.floor(math.log2(2 * ORIGIN / TILE / (span / OUT_PX))))
    if gsd_m:
        lat = (bb[1] + bb[3]) / 2
        z_native = int(math.ceil(math.log2(2 * ORIGIN / TILE * math.cos(math.radians(lat)) / float(gsd_m))))
        z = min(z, z_native + 1)
    if max_zoom is not None:
        z = min(z, max_zoom)
    return max(8, min(z, 21))


def tile_range(bb: list[float], z: int):
    x0, y0 = lonlat_to_m(bb[0], bb[1])
    x1, y1 = lonlat_to_m(bb[2], bb[3])
    r = res_at(z)
    px0, px1 = (x0 + ORIGIN) / r, (x1 + ORIGIN) / r
    py0, py1 = (ORIGIN - y1) / r, (ORIGIN - y0) / r      # 위쪽이 작다
    return px0, py0, px1, py1


# ── 원천별 타일 읽기 ─────────────────────────────────────────────────────────
_PM: dict[str, object] = {}


def _pm_reader(path: str):
    rd = _PM.get(path)
    if rd is None:
        from pmtiles.reader import MmapSource, Reader
        f = open(path, "rb")
        rd = _PM[path] = Reader(MmapSource(f))
    return rd


def pm_max_zoom(path: str) -> int | None:
    try:
        return int(_pm_reader(path).header()["max_zoom"])
    except Exception:
        return None


def _decode(buf: bytes | None):
    if not buf:
        return None
    import cv2
    im = cv2.imdecode(np.frombuffer(buf, np.uint8), cv2.IMREAD_UNCHANGED)
    if im is None:
        return None
    if im.ndim == 2:
        im = cv2.cvtColor(im, cv2.COLOR_GRAY2BGRA)
    elif im.shape[2] == 3:
        im = np.dstack([im, np.full(im.shape[:2], 255, np.uint8)])
    return im


def use_raster(src: Source) -> bool:
    """1 m 보다 고운 영상은 원본(해상도 그대로 · PMTiles 는 한 단계 낮게 구워져 있다)을, 그 밖은 PMTiles 를 먼저 쓴다."""
    return bool(src.raster_path) and (not src.pm_path or (src.gsd_m or 99) < 1)


def _tile(src: Source, z: int, x: int, y: int, raster: bool):
    if raster:
        from landxi_api.tiles import _render          # 게이트웨이 COG 렌더(불러 쓰기만)
        try:
            return _decode(_render(src.raster_path, z, x, y))
        except Exception:
            return None
    try:
        return _decode(_pm_reader(src.pm_path).get(z, x, y))
    except Exception:
        return None


# ── 한 시점 렌더 ────────────────────────────────────────────────────────────
def render_view(src: Source, bb: list[float], outline: dict | None, ai_geoms: list[dict] | None = None,
                target_bb: list[float] | None = None) -> View | None:
    """src 영상에서 bb(4326) 범위를 잘라 경계선을 겹친 PNG. 영상이 경계 상자를 MIN_COVER 미만 덮으면 None."""
    import cv2
    raster = use_raster(src)
    mz = None if raster else pm_max_zoom(src.pm_path)
    z = zoom_for(bb, src.gsd_m, mz)
    px0, py0, px1, py1 = tile_range(bb, z)
    tx0, ty0, tx1, ty1 = int(px0 // TILE), int(py0 // TILE), int(px1 // TILE), int(py1 // TILE)
    while (tx1 - tx0 + 1) * (ty1 - ty0 + 1) > MAX_TILES and z > 8:
        z -= 1
        px0, py0, px1, py1 = tile_range(bb, z)
        tx0, ty0, tx1, ty1 = int(px0 // TILE), int(py0 // TILE), int(px1 // TILE), int(py1 // TILE)
    nx, ny = tx1 - tx0 + 1, ty1 - ty0 + 1
    canvas = np.zeros((ny * TILE, nx * TILE, 4), np.uint8)
    got = 0
    for ty in range(ty0, ty1 + 1):
        for tx in range(tx0, tx1 + 1):
            im = _tile(src, z, tx, ty, raster)
            if im is None:
                continue
            if im.shape[0] != TILE or im.shape[1] != TILE:
                im = cv2.resize(im, (TILE, TILE), interpolation=cv2.INTER_LINEAR)
            oy, ox = (ty - ty0) * TILE, (tx - tx0) * TILE
            canvas[oy:oy + TILE, ox:ox + TILE] = im
            got += 1
    if not got:
        return None
    # 자르기(캔버스 좌표)
    cx0, cy0 = px0 - tx0 * TILE, py0 - ty0 * TILE
    cx1, cy1 = px1 - tx0 * TILE, py1 - ty0 * TILE
    ix0, iy0, ix1, iy1 = int(math.floor(cx0)), int(math.floor(cy0)), int(math.ceil(cx1)), int(math.ceil(cy1))
    crop = canvas[max(iy0, 0):iy1, max(ix0, 0):ix1]
    if crop.size == 0:
        return None
    # 덮는 비율 — 대상(필지) 상자 안 화소 기준
    tb = target_bb or bb
    tx_0, ty_0, tx_1, ty_1 = tile_range(tb, z)
    a = crop[:, :, 3]
    sx0, sy0 = int(max(tx_0 - tx0 * TILE - ix0, 0)), int(max(ty_0 - ty0 * TILE - iy0, 0))
    sx1, sy1 = int(min(tx_1 - tx0 * TILE - ix0 + 1, a.shape[1])), int(min(ty_1 - ty0 * TILE - iy0 + 1, a.shape[0]))
    sub = a[sy0:max(sy1, sy0 + 1), sx0:max(sx1, sx0 + 1)]
    cover = float((sub > 0).mean()) if sub.size else 0.0
    color = crop[:, :, :3].astype(np.float32)
    alpha = (crop[:, :, 3:4].astype(np.float32) / 255.0)
    bg = np.empty_like(color)
    bg[:] = NODATA_BGR
    rgb = (color * alpha + bg * (1 - alpha)).astype(np.uint8)
    # 출력 크기(긴 변 OUT_PX)
    h, w = rgb.shape[:2]
    s = OUT_PX / max(h, w)
    out = cv2.resize(rgb, (max(1, round(w * s)), max(1, round(h * s))), interpolation=cv2.INTER_CUBIC if s > 1 else cv2.INTER_AREA)
    r = res_at(z)

    def to_px(lon, lat):
        mx, my = lonlat_to_m(lon, lat)
        cx = (mx + ORIGIN) / r - tx0 * TILE - max(ix0, 0)
        cy = (ORIGIN - my) / r - ty0 * TILE - max(iy0, 0)
        return [cx * s, cy * s]

    def draw(geom, bgr, width):
        for ring in rings_of(geom):
            pts = np.array([to_px(x, y) for x, y in ring], np.float32)
            if len(pts) < 2:
                continue
            p = np.round(pts * 4).astype(np.int32)      # 소수 화소(shift=2)
            cv2.polylines(out, [p], True, (20, 20, 20), width + 2, cv2.LINE_AA, shift=2)
            cv2.polylines(out, [p], True, bgr, width, cv2.LINE_AA, shift=2)

    ai_on = bool(ai_geoms)
    for g in ai_geoms or []:
        draw(g, AI_BGR, 1)
    if outline:
        draw(outline, PARCEL_BGR, 2)
    ok, buf = cv2.imencode(".png", out, [cv2.IMWRITE_PNG_COMPRESSION, 6])
    if not ok:
        return None
    return View(source=src, png=buf.tobytes(), cover=round(cover, 3), zoom=z, ai_overlay=ai_on)


# ── 시점 고르기 ─────────────────────────────────────────────────────────────
def _year_of(s: Source) -> int:
    m = re.search(r"(19|20)\d{2}", s.epoch or "")
    return int(m.group(0)) if m else 0


def order_sources(srcs: list[Source]) -> list[Source]:
    """같은 촬영 시점은 한 장(해상도 높은 쪽) · 고해상도(≤ 0.5 m) 먼저 · 최근 순."""
    best: dict[str, Source] = {}
    for s in srcs:
        k = s.epoch or s.id
        cur = best.get(k)
        if cur is None or (s.gsd_m or 99) < (cur.gsd_m or 99):
            best[k] = s
    vals = sorted(best.values(), key=lambda s: s.epoch or "", reverse=True)          # 같은 해 안에서도 최근 먼저
    return sorted(vals, key=lambda s: (0 if (s.gsd_m or 99) <= 0.5 else 1, -_year_of(s)))


def crop_views(srcs: list[Source], outline: dict, ai_geoms: list[dict] | None = None, ai_year: int | None = None,
               max_views: int = MAX_VIEWS) -> CropResult:
    """경계(outline · GeoJSON 4326)로 등록 영상 조각 최대 max_views 장. AI 선은 AI 결과 연도와 같은 시점 한 장에만."""
    tb = bbox_of(outline)
    bb = padded_bbox(tb)
    res = CropResult(bbox=bb)
    ordered = order_sources(srcs)
    if ai_geoms and ai_year:                  # AI 결과 연도 시점을 맨 앞에(AI 선과 대조할 한 장) — 나머지는 최근 순
        first = next((s for s in ordered if _year_of(s) == ai_year), None)
        if first is not None:
            ordered = [first] + [s for s in ordered if s is not first]
    ai_done = False
    for s in ordered:
        if len(res.views) >= max_views:
            break
        with_ai = bool(ai_geoms) and not ai_done and (ai_year is None or _year_of(s) == ai_year)
        try:
            v = render_view(s, bb, outline, ai_geoms if with_ai else None, target_bb=tb)
        except Exception as e:  # noqa: BLE001 — 한 시점 실패는 건너뛴다
            res.skipped.append({"source": s.id, "why": type(e).__name__})
            continue
        if v is None or v.cover < MIN_COVER:
            res.skipped.append({"source": s.id, "why": "영상 범위 밖" if v is None else f"덮는 비율 {v.cover}"})
            continue
        ai_done = ai_done or with_ai
        res.views.append(v)
    # AI 선이 들어간 시점을 맨 앞으로(비전 모델이 첫 장을 AI 결과와 대조)
    res.views.sort(key=lambda v: 0 if v.ai_overlay else 1)
    return res


def save_views(res: CropResult, out_dir: Path, stem: str) -> list[View]:
    out_dir.mkdir(parents=True, exist_ok=True)
    for k, v in enumerate(res.views, 1):
        name = f"{re.sub(r'[^0-9A-Za-z_-]+', '', stem)[:40] or 'crop'}-{k}.png"
        p = out_dir / name
        p.write_bytes(v.png)                   # cv2.imwrite 는 한글 경로를 못 쓴다 — 바이트로
        v.path, v.name = p, name
    return res.views


# ── 등록 영상 행 → Source ───────────────────────────────────────────────────
KIND_KO = {"ortho": "정사영상", "aerial": "항공", "drone": "드론", "satellite": "위성"}


def label_of(row: dict) -> str:
    nm = row.get("name")
    if isinstance(nm, dict):
        nm = nm.get("ko") or nm.get("en")
    epoch = str(row.get("year") or row.get("epoch") or "").strip()
    g = row.get("gsd_m")
    gs = ""
    if g is not None:
        g = float(g)
        gs = f"{round(g * 100, 1):g}cm" if g < 1 else f"{g:g}m"
    kind = "드론" if (g is not None and g < 0.05) else "위성" if (g is not None and g >= 2) else "항공"
    base = " ".join(x for x in (epoch, kind, gs) if x)
    return base or (str(nm or "") or "등록 영상")


def sources_from_rows(rows: list[dict], data_root: Path, resolve_set) -> list[Source]:
    out = []
    for r in rows:
        layer = r.get("layer") or {}
        if isinstance(layer, str):
            import json
            layer = json.loads(layer)
        pm = None
        if r.get("pmtiles_set"):
            rel = None
            try:
                rel = resolve_set(r["pmtiles_set"])
            except Exception:
                rel = None
            if rel and (data_root / rel).exists():
                pm = str(data_root / rel)
        if pm is None:
            rel = None
            try:
                rel = resolve_set(f"imagery/{r['id']}")
            except Exception:
                rel = None
            if rel and (data_root / rel).exists():
                pm = str(data_root / rel)
        raster = None
        for cand in (layer.get("cog_path"), r.get("path_internal")):
            if not cand:
                continue
            full = cand if (":" in cand[:3] or os.path.isabs(cand)) else str(data_root / cand)
            if os.path.exists(full):
                raster = full
                break
        if not pm and not raster:
            continue
        epoch = str(r.get("epoch") or r.get("year") or "").strip()
        if not epoch or epoch == "-":
            epoch = str(r.get("year") or r["id"])
        g = float(r["gsd_m"]) if r.get("gsd_m") is not None else None
        out.append(Source(id=r["id"], label=label_of(r), epoch=epoch, gsd_m=g, pm_path=pm, raster_path=raster))
    return out


SQL_SOURCES = ("SELECT id, name, kind, gsd_m, year, epoch, path_internal, pmtiles_set, layer FROM imagery "
               "WHERE footprint IS NOT NULL AND ST_Intersects(footprint, ST_MakeEnvelope($1,$2,$3,$4,4326)) "
               "AND coalesce(layer->>'role','imagery')='imagery' AND coalesce(kind,'ortho') NOT IN ('terrain','index')")
