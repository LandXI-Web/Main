# -*- coding: utf-8 -*-
"""영상 여는 도우미(core-imagery 계약) — 워커·파이프라인이 imagery id 하나로 추론 입력을 연다.

  open_imagery(imagery_id)        → rasterio 데이터셋(VRT · GeoTIFF · COG 공통 · 스레드별 캐시 · 닫지 말 것)
  imagery_path(imagery_id)        → 실제 파일 경로(path_internal · 없으면 layer.cog_path)
  best_imagery_sync(sgg, geom)    → catalog.best_imagery 와 같은 결과(동기 · 워커용)
  choose(rows, target)            → 순위 규칙(서버·워커 공용)

영상 행이 없거나 파일이 없으면 ImageryUnavailable. V-World 위성 영상은 분석 입력으로 쓰지 않는다(config/ladder.yaml vworld_analysis).
"""
from __future__ import annotations

import json
import os
import sys
import threading
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from landxi_api import config  # noqa: E402

_local = threading.local()
MIN_COVER = 0.02          # 대상 범위의 2% 미만만 덮는 영상(작은 칩 · 가장자리)은 후보에서 뺀다


class ImageryUnavailable(RuntimeError):
    pass


def _resolve(p: str) -> str:
    return p if (":" in p[:3] or os.path.isabs(p)) else str(config.DATA_ROOT / p)


def _row(imagery_id: str):
    import psycopg
    with psycopg.connect(config.PG_WORKER_DSN) as c:
        return c.execute("SELECT path_internal, layer FROM imagery WHERE id=%s", (imagery_id,)).fetchone()


def imagery_path(imagery_id: str) -> str:
    c = getattr(_local, "path", None)
    if c is None:
        c = _local.path = {}
    if imagery_id not in c:
        row = _row(imagery_id)
        if not row:
            raise ImageryUnavailable(f"영상 행 없음: {imagery_id}")
        layer = row[1] or {}
        p = row[0] or layer.get("cog_path")
        if not p:
            raise ImageryUnavailable(f"분석에 쓸 원본 경로가 없는 영상: {imagery_id}")
        full = _resolve(p)
        if not os.path.exists(full):
            raise ImageryUnavailable(f"영상 파일 없음: {imagery_id}")
        c[imagery_id] = full
    return c[imagery_id]


# ── 영상 API 원천(전국 결과 자산 · 원칙 136 · 218) ─────────────────────────────────
# imagery 행 layer.role = 'national' · path_internal = GDAL WMS 설명 파일(.xml · 국토지리정보원 항공 타일 · 키 없음).
# 영상 파일을 만들지 않는다 — 칩 창을 읽을 때 그 칸의 타일만 불러 메모리에서 쓴다(디스크 보관 0 · <Cache> 없음).
# 정중한 호출: 프로세스 안에서 한 번에 한 창만 읽고(잠금) 창 하나의 동시 연결은 설명 파일 MaxConnections(≤4) — 동시 4 이하.
# 실패하면 2 · 4 · 8 · 16 초 기다렸다 다시(지수 대기) · 그래도 안 되면 칸 실패(작업기가 칸을 다시 넣는다). 404 · 204(바다 등 영상 없음)만 빈 칸.
_API: dict = {}
_API_LOCK = threading.Lock()
_API_ROLE: dict = {}
API_RETRY_S = (2, 4, 8, 16)


class ApiDataset:
    """rasterio 데이터셋처럼 쓰는 얇은 감싸개 — 워커 · 스케줄러가 부르는 속성만(read · count · crs · transform · window_transform · 크기)."""

    def __init__(self, path: str):
        import rasterio
        self.path = path
        self._ds = rasterio.open(path)
        self._lock = threading.Lock()
        for k in ("count", "crs", "transform", "width", "height", "res", "bounds", "profile", "dtypes", "nodata"):
            setattr(self, k, getattr(self._ds, k))
        self.closed = False
        self.reads = 0
        self.retries = 0

    def window_transform(self, win):
        return self._ds.window_transform(win)

    def read(self, indexes=None, window=None, boundless=False, fill_value=0, **kw):
        import time as _t
        inside = window is not None and window.col_off >= 0 and window.row_off >= 0 \
            and window.col_off + window.width <= self.width and window.row_off + window.height <= self.height
        last = None
        for k, wait in enumerate((0,) + API_RETRY_S):
            if wait:
                self.retries += 1
                _t.sleep(wait)
            try:
                with self._lock:
                    self.reads += 1
                    if inside or not boundless:
                        return self._ds.read(indexes, window=window, **kw)
                    return self._ds.read(indexes, window=window, boundless=True, fill_value=fill_value, **kw)
            except Exception as e:  # noqa: BLE001 — 네트워크 · 서버 오류 → 지수 대기 뒤 다시
                last = e
        raise ImageryUnavailable(f"영상 API 읽기 실패(다시 {len(API_RETRY_S)}번): {last}")

    def close(self):          # 프로세스 안에서 함께 쓰는 핸들 — 닫지 않는다
        pass


def _is_api(imagery_id: str) -> bool:
    if imagery_id not in _API_ROLE:
        row = _row(imagery_id)
        _API_ROLE[imagery_id] = bool(row and isinstance(row[1], dict) and row[1].get("role") == "national")
    return _API_ROLE[imagery_id]


def open_imagery(imagery_id: str):
    """rasterio 데이터셋 — 같은 스레드에서 다시 부르면 같은 핸들(워커 창 읽기 반복용). 영상 API 원천은 프로세스에 하나(ApiDataset)."""
    import rasterio
    if _is_api(imagery_id):
        p = imagery_path(imagery_id)
        with _API_LOCK:
            d = _API.get(p)
            if d is None:
                os.environ.setdefault("GDAL_HTTP_TIMEOUT", "30")
                d = _API[p] = ApiDataset(p)
        return d
    c = getattr(_local, "ds", None)
    if c is None:
        c = _local.ds = {}
    ds = c.get(imagery_id)
    if ds is None or ds.closed:
        ds = c[imagery_id] = rasterio.open(imagery_path(imagery_id))
    return ds


# ── 추론 입력 고르기 ─────────────────────────────────────────────────────────
def _year(r: dict) -> int:
    y = r.get("year")
    if y:
        return int(y)
    import re
    m = re.search(r"(19|20)\d{2}", str(r.get("epoch") or ""))
    return int(m.group(0)) if m else 0


def choose(rows: list[dict], target) -> dict | None:
    """rows: [{id, gsd_m, year, epoch, fp(shapely), readable}] · target: shapely(4326) → 가장 좋은 한 건(+coverage) 또는 None.
    순서: 대상의 절반 이상을 덮는가 → 해상도 급(≤10cm · ≤50cm · ≤2m · 그 밖) → 최근 연도 → 덮는 비율."""
    best, key = None, None
    ta = max(target.area, 1e-12)
    for r in rows:
        if not r.get("readable") or r.get("fp") is None:
            continue
        try:
            cov = r["fp"].intersection(target).area / ta
        except Exception:
            continue
        if cov < MIN_COVER:
            continue
        g = float(r["gsd_m"]) if r.get("gsd_m") is not None else 99.0
        tier = 0 if g <= 0.1 else 1 if g <= 0.5 else 2 if g <= 2 else 3
        k = (0 if cov >= 0.5 else 1, tier, -_year(r), -cov)
        if key is None or k < key:
            best, key = {**r, "coverage": round(min(cov, 1.0), 4)}, k
    return best


def vworld_allowed() -> dict:
    v = (config.load_yaml("ladder") or {}).get("vworld_analysis") or {}
    return {"allowed": bool(v.get("allowed")), "reason": v.get("reason")}


def result(best: dict | None, target_ok: bool) -> dict:
    if not target_ok:
        return {"imagery_id": None, "reason": "no_region"}
    if best is None:
        v = vworld_allowed()
        return {"imagery_id": None, "reason": "no_imagery", "vworld": v,
                "next": "영상 등록"}
    return {"imagery_id": best["id"], "gsd_m": float(best["gsd_m"]) if best.get("gsd_m") is not None else None, "year": _year(best) or None,
            "coverage": best["coverage"], "source": "local", "name": best.get("name"), "sgg_cd": best.get("sgg_cd"),
            "partial": best["coverage"] < 0.95}


SQL_ROWS = ("SELECT id, name, gsd_m, year, epoch, sgg_cd, path_internal, layer, ST_AsGeoJSON(footprint) AS fp FROM imagery "
            "WHERE footprint IS NOT NULL AND coalesce(layer->>'role','imagery')='imagery' AND coalesce(kind,'ortho') <> 'terrain'")


def rows_from(records) -> list[dict]:
    from shapely.geometry import shape
    out = []
    for r in records:
        r = dict(r)
        layer = r.get("layer") or {}
        if isinstance(layer, str):
            layer = json.loads(layer)
        fp = r.get("fp")
        if isinstance(fp, str):
            fp = json.loads(fp)
        p = r.get("path_internal") or layer.get("cog_path")
        name = r.get("name")
        if isinstance(name, str):
            try:
                name = json.loads(name)
            except Exception:
                pass
        out.append({"id": r["id"], "name": name.get("ko") if isinstance(name, dict) else name, "gsd_m": r.get("gsd_m"), "year": r.get("year"),
                    "epoch": r.get("epoch"), "sgg_cd": r.get("sgg_cd"), "fp": shape(fp).buffer(0) if fp else None,
                    "readable": bool(p) and os.path.exists(_resolve(p))})
    return out


def target_geom(sgg_cd: str | None, geom_4326: dict | None):
    """대상 = geom(주면) ∩ 시군구(주면) · 옛/새 시군구 코드 모두."""
    from shapely.geometry import shape
    from landxi_api.regions import regions_base
    t = None
    if sgg_cd:
        regions, geoms, _ = regions_base()
        cd = str(sgg_cd)
        g = geoms.get(cd)
        if g is None:                     # 옛 코드로 물으면 새 코드 경계
            r = next((x for x in regions if x.get("prev_cd") == cd), None)
            g = geoms.get(r["sgg_cd"]) if r else None
        t = g
    if geom_4326:
        gg = shape(geom_4326 if geom_4326.get("type") != "Feature" else geom_4326["geometry"]).buffer(0)
        t = gg if t is None else (t.intersection(gg) if t.intersects(gg) else gg)
    return t


def best_imagery_sync(sgg_cd: str | None, geom_4326: dict | None = None) -> dict:
    import psycopg
    from psycopg.rows import dict_row
    t = target_geom(sgg_cd, geom_4326)
    if t is None or t.is_empty:
        return result(None, False)
    with psycopg.connect(config.PG_WORKER_DSN, row_factory=dict_row) as c:
        recs = c.execute(SQL_ROWS).fetchall()
    return result(choose(rows_from(recs), t), True)
