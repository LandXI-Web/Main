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


def open_imagery(imagery_id: str):
    """rasterio 데이터셋 — 같은 스레드에서 다시 부르면 같은 핸들(워커 창 읽기 반복용)."""
    import rasterio
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
