"""해외 나라 작업 덧일 — 10-18 원칙 289(해외-2017건물 · 해외-작황10m).

① 기준 통계(keep_ref) — 2025 칸 합성을 지우기 전에 띠마다 분위수(2–98%)를 남긴다(work/ref-{칸}.json · 몇 KB).
   2017 칸 합성은 이 분위수에 맞춰 맞춘다(harmonize) — 2017 장면은 처리 기준이 옛 판(00.01)이라 같은 땅도 값이 조금 다르다.
   맞춘 뒤 같은 모델 · 같은 합성 규칙(맑은 관측 1개)으로 돌리므로 2017 · 2025 '같은 기준'.
② 작황 하락 10 m(keep_ndvi · drop_cell) — 2025 칸 합성의 9 · 10월 NDVI 를 남겨 두고(drop10/ndvi25-{칸}.tif),
   2024 같은 달을 따로 합성해 화소(10 m)마다 잰다. 경작지 = 같은 칸의 새 모델 경작지 면. 규칙 = 화면에 쓰던 r2 와 같다:
   두 달 모두 작년 같은 달보다 0.1 이상 낮고 · 작년에 푸르렀고(0.3 이상) · 4분의 1 이상 덜 푸르고 · 외톨이 화소는 뺌.
   결과 = drop10/drop-{칸}.tif(1 = 하락) + drop10/drop.json(군마다 ㎢) — 서버 보관만(화면에 빨강 없음 · 10-18 사용자 "빨간색은 필요 없겠다").

  python -m overseas.extras drop --loop     새 모델로 끝난 칸마다 작황 하락 10 m(CPU · 네트워크 · GPU 0)
  python -m overseas.extras drop --status
"""
from __future__ import annotations

import argparse
import json
import math
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import numpy as np  # noqa: E402

QS = (2, 5, 10, 25, 50, 75, 90, 95, 98)
REF_YEAR = 2025
DROP, PREV_MIN, REL_MIN = 0.1, 0.3, 0.25
DROP_MONTHS = (9, 10)


def _root(country: str, year: int) -> Path:
    from overseas.runner import root
    return root(country, year)


def ref_path(country: str, cd: str) -> Path:
    return _root(country, REF_YEAR) / "work" / "ref" / f"{cd}.json"


def keep_ref(country: str, year: int, cd: str, stack_tif: Path):
    """2025 칸 합성 → 띠마다 분위수(8 화소마다 하나 표본)."""
    if year != REF_YEAR:
        return
    import rasterio
    from rasterio.enums import Resampling
    with rasterio.open(stack_tif) as ds:
        h, w = max(1, ds.height // 8), max(1, ds.width // 8)
        a = ds.read(out_shape=(ds.count, h, w), resampling=Resampling.nearest)
    q = []
    for b in a:
        v = b[b > 0]
        q.append([float(x) for x in np.percentile(v, QS)] if v.size > 1000 else None)
    p = ref_path(country, cd)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps({"cell": cd, "year": year, "qs": QS, "bands": q}), encoding="utf-8")


def harmonize(stack: np.ndarray, country: str, cd: str) -> dict:
    """옛 해 칸 합성(띠 × H × W uint16)을 2025 같은 칸 분위수에 맞춘다(띠마다 분위수 사이 직선) — 없으면 그대로."""
    p = ref_path(country, cd)
    if not p.exists():
        return {"harmonized": False, "why": "no 2025 reference for this cell"}
    ref = json.loads(p.read_text(encoding="utf-8"))["bands"]
    n = 0
    for i, rq in enumerate(ref):
        if rq is None or i >= stack.shape[0]:
            continue
        b = stack[i]
        sub = b[::8, ::8]
        v = sub[sub > 0]
        if v.size < 1000:
            continue
        sq = np.percentile(v, QS)
        if np.any(np.diff(sq) <= 0):
            continue
        m = b > 0
        out = np.interp(b[m].astype(np.float32), sq, rq, left=None, right=None)
        lo, hi = sq[0], sq[-1]                                     # 바깥은 끝 기울기로 늘림(잘리지 않게)
        x = b[m].astype(np.float32)
        s0 = (rq[1] - rq[0]) / max(1e-6, sq[1] - sq[0])
        s1 = (rq[-1] - rq[-2]) / max(1e-6, sq[-1] - sq[-2])
        out = np.where(x < lo, rq[0] + (x - lo) * s0, np.where(x > hi, rq[-1] + (x - hi) * s1, out))
        b[m] = np.clip(np.round(out), 1, 65535).astype(np.uint16)
        n += 1
    return {"harmonized": True, "bands": n, "to": f"{REF_YEAR} same cell quantiles {QS[0]}-{QS[-1]}%"}


# ── 작황 하락 10 m ─────────────────────────────────────────────────────────────
def d10(country: str) -> Path:
    p = _root(country, REF_YEAR) / "drop10"
    p.mkdir(parents=True, exist_ok=True)
    return p


def keep_ndvi(country: str, year: int, cd: str, stack_tif: Path):
    """2025 칸 합성의 9 · 10월 NDVI(0–250 · 255 = 없음) 두 장을 남긴다."""
    if year != REF_YEAR:
        return
    import rasterio
    from overseas import s2
    nb = len(s2.BANDS)
    out = d10(country) / f"ndvi25-{cd}.tif"
    with rasterio.open(stack_tif) as ds:
        prof = ds.profile
        bands = []
        for m in DROP_MONTHS:
            k = s2.MONTHS.index(m)
            red, nir = ds.read(k * nb + 3).astype(np.float32), ds.read(k * nb + 4).astype(np.float32)
            nd = np.where((nir > 0) & (red > 0), (nir - red) / (nir + red + 1e-6), np.nan)
            bands.append(np.where(np.isnan(nd), 255, np.clip(np.round((nd + 0.25) * 200), 0, 250)).astype(np.uint8))
    prof.update(count=2, dtype="uint8", nodata=255, predictor=1)
    with rasterio.open(out, "w", **prof) as dst:
        dst.write(np.stack(bands))


def _nd(u8: np.ndarray) -> np.ndarray:
    return np.where(u8 == 255, np.nan, u8.astype(np.float32) / 200 - 0.25)


def drop_cell(country: str, cd: str, model: str) -> dict:
    import rasterio
    from rasterio.features import rasterize
    from pyproj import Transformer
    from shapely.geometry import shape
    from shapely.ops import transform as sh_tr
    from national.common import pg
    from overseas import s2
    from overseas.publish import job_files
    src = d10(country) / f"ndvi25-{cd}.tif"
    with rasterio.open(src) as ds:
        cur = ds.read()
        prof = ds.profile
        tr, epsg = ds.transform, ds.crs.to_epsg()
    grid = s2.Grid(epsg, tr.c, tr.f, prof["width"], prof["height"])
    t0 = time.time()
    prev_stack, st = s2.composite(grid, REF_YEAR - 1, months=DROP_MONTHS, threads=32, max_obs=1)
    nb = len(s2.BANDS)
    prev = []
    for k in range(len(DROP_MONTHS)):
        red, nir = prev_stack[k * nb + 2].astype(np.float32), prev_stack[k * nb + 3].astype(np.float32)
        prev.append(np.where((nir > 0) & (red > 0), (nir - red) / (nir + red + 1e-6), np.nan))
    del prev_stack
    with pg() as c:
        files = job_files(c, model, [cd])
    to = Transformer.from_crs(4326, epsg, always_xy=True).transform
    geoms = [sh_tr(to, shape(f["geometry"])) for fp in files for f in json.loads(fp.read_text(encoding="utf-8"))["features"]
             if (f.get("properties") or {}).get("cls") == "경작지"]
    crop = rasterize([(g, 1) for g in geoms], out_shape=(grid.h, grid.w), transform=grid.transform, fill=0, dtype="uint8").astype(bool) if geoms else np.zeros((grid.h, grid.w), bool)
    c25 = [_nd(cur[i]) for i in range(len(DROP_MONTHS))]
    ok = crop.copy()
    each = np.ones_like(crop)
    for a, b in zip(c25, prev):
        ok &= ~np.isnan(a) & ~np.isnan(b)
        each &= (a <= b - DROP)
    with np.errstate(invalid="ignore"):
        ma, mb = np.nanmean(np.stack(c25), 0), np.nanmean(np.stack(prev), 0)
        hit = ok & each & (ma <= mb - DROP) & (mb >= PREV_MIN) & (ma <= mb * (1 - REL_MIN))
    pad = np.pad(hit, 1)
    nbr = sum(pad[1 + dy:pad.shape[0] - 1 + dy, 1 + dx:pad.shape[1] - 1 + dx] for dy in (-1, 0, 1) for dx in (-1, 0, 1) if dy or dx)
    hit &= nbr > 0                                                 # 외톨이 화소 뺌
    out = d10(country) / f"drop-{cd}.tif"
    p2 = dict(prof)
    p2.update(count=1, dtype="uint8", nodata=0)
    with rasterio.open(out, "w", **p2) as dst:
        dst.write(hit.astype(np.uint8)[None])
    px_km2 = 1e-4                                                   # 10 m 화소 = 100 ㎡
    res = {"cell": cd, "model": model, "drop_km2": round(float(hit.sum()) * px_km2, 2), "crop_km2": round(float(crop.sum()) * px_km2, 1),
           "measured_km2": round(float(ok.sum()) * px_km2, 1), "season": f"Sep–Oct {REF_YEAR} vs {REF_YEAR - 1}", "rule": "r2-10m",
           "months_prev": st.get("months"), "sec": round(time.time() - t0), "at": time.strftime("%Y-%m-%dT%H:%M:%S")}
    j = d10(country) / "drop.json"
    doc = json.loads(j.read_text(encoding="utf-8")) if j.exists() else {"note": "Crop condition drop at 10 m — stored only, not shown (10-18 user)", "cells": {}}
    doc["cells"][cd] = res
    j.write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
    return res


def drop_loop(country: str = "kgz"):
    from national.common import pg
    from overseas.runner import settings
    from overseas import s2
    s2.net_env()
    while True:
        with pg() as c:
            st = settings(c)
            model = st["model"]
            rows = c.execute("SELECT cell_cd, name FROM overseas_cells WHERE country=%s AND year=%s AND state='done' AND model_id=%s AND NOT test ORDER BY ord",
                             (country, REF_YEAR, model)).fetchall()
            left = c.execute("SELECT count(*) FROM overseas_cells WHERE country=%s AND year=%s AND NOT test AND (state<>'done' OR model_id IS DISTINCT FROM %s)",
                             (country, REF_YEAR, model)).fetchone()[0]
        j = d10(country) / "drop.json"
        doc = json.loads(j.read_text(encoding="utf-8")) if j.exists() else {"cells": {}}
        todo = [(cd, nm) for cd, nm in rows if (d10(country) / f"ndvi25-{cd}.tif").exists() and (doc["cells"].get(cd) or {}).get("model") != model]
        for cd, nm in todo:
            try:
                r = drop_cell(country, cd, model)
                print(time.strftime("%m-%d %H:%M:%S"), "작황 하락 10 m", nm, json.dumps(r, ensure_ascii=False), flush=True)
            except Exception as e:  # noqa: BLE001
                print(time.strftime("%m-%d %H:%M:%S"), "작황 하락 실패", nm, repr(e)[:300], flush=True)
        if not todo and left == 0:
            print("모두 끝", flush=True)
            return
        time.sleep(120)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("what", choices=["drop"])
    ap.add_argument("--loop", action="store_true")
    ap.add_argument("--status", action="store_true")
    a = ap.parse_args()
    if a.status:
        j = d10("kgz") / "drop.json"
        doc = json.loads(j.read_text(encoding="utf-8")) if j.exists() else {"cells": {}}
        print(json.dumps({"cells": len(doc["cells"]), "drop_km2": round(sum(v["drop_km2"] for v in doc["cells"].values()), 1)}, ensure_ascii=False))
    elif a.loop:
        drop_loop()


if __name__ == "__main__":
    main()
