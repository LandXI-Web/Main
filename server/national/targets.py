"""전국 결과 자산 — 칸(법정 읍면동)마다 '분석할 범위'를 만들어 진행 장부(national_cells)에 넣는다. 학습 장비(GPU)를 쓰지 않는다.

  농지(farm)  = 읍면동 ∩ 농지 둘레. 농지 둘레 = ESA WorldCover 2021 v200(10m · 공개 · 키 없음 · AWS 공개 저장소에서 칸 범위만 원격으로 읽음 ·
                파일을 받아 두지 않음)의 '경작지(40)' 칸을 약 30m 로 읽어 둘레를 잇고(닫힘) 약 110m 넓힌 면. 0.05㎢ 보다 작은 외딴 조각은 뺀다.
  하천(river) = 읍면동 ∩ 하천 띠. 하천 띠 = 하천 면을 양쪽 river_buffer_m(기본 100m) 넓힌 면.
                국가 · 지방하천: 국토교통부 하천망(브이월드 데이터 API LT_C_WKMSTRM · 등급 국가하천 · 지방1급 · 지방2급).
                소하천: 공개 원본(국가공간정보 연속주제 '소하천/소하천구역' · 전국하천표준데이터)은 계정 로그인 · 인증키가 있어야 받을 수 있어
                        자동으로 받지 못했다 → 보유 자료(행정안전부 하천 · 계곡 과제의 소하천구역 면 · 252 시군구)를 쓴다. 원본을 받으면 그것으로 바꾼다.

  python -m national.targets [--sgg 52190] [--year 2025] [--asset farm|river] [--force]   (server 폴더에서)
같은 칸을 다시 만들어도 이미 끝난(done) 칸은 그대로 둔다(--force 여도 범위만 바꾸고 결과 · 상태는 둔다).
"""
from __future__ import annotations

import argparse
import gzip
import json
import math
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from national.common import OUT, pg, settings  # noqa: E402

WC_URL = "/vsicurl/https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_{t}_Map.tif"
WC_SRC = "ESA WorldCover 10m 2021 v200(경작지 분류 · CC BY 4.0)"
RIVER_SRC = {"national_local": "국토교통부 하천망(브이월드 LT_C_WKMSTRM · 국가하천 · 지방하천)",
             "small": "소하천구역(보유 · 행정안전부 하천·계곡 과제 자료) — 공개 원본(국가공간정보 연속주제 소하천/소하천구역)은 계정이 있어야 받음"}
SMALL_DIR = Path(r"E:/행안부/07. 대국민 서버/data/river_dedup")
WC_RES = 0.00033            # 약 30m(원본 10m 의 3배 · 원격 개요 층에서 읽음)
FARM_DIL, FARM_ERO = 8, 5   # 칸 수 — 잇기(약 260m) 뒤 줄이기(약 160m) → 순 약 100~110m 넓힘
FARM_MIN_KM2 = 0.05
RIVER_MIN_KM2 = 0.02
SIMPLE_EMD = 0.0003         # 화면용 읍면동 경계 단순화(약 30m)


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


def _to5179():
    from pyproj import Transformer
    return Transformer.from_crs(4326, 5179, always_xy=True).transform, Transformer.from_crs(5179, 4326, always_xy=True).transform


F, B = _to5179()


def km2(g4326) -> float:
    from shapely.ops import transform
    return transform(F, g4326).area / 1e6


def _polys(g):
    from shapely.geometry import Polygon
    return [p for p in getattr(g, "geoms", [g]) if isinstance(p, Polygon) and not p.is_empty]


def _multi(parts):
    from shapely.geometry import MultiPolygon
    return MultiPolygon(parts) if parts else None


# ── 농지 둘레(WorldCover) ───────────────────────────────────────────────────
def _wc_tiles(b):
    out = []
    for lat in range(int(math.floor(b[1] / 3) * 3), int(math.floor(b[3] / 3) * 3) + 1, 3):
        for lon in range(int(math.floor(b[0] / 3) * 3), int(math.floor(b[2] / 3) * 3) + 1, 3):
            out.append(f"N{lat:02d}E{lon:03d}")
    return out


def farm_mask(bounds):
    """시군구 범위 → 농지 둘레 면(4326 · shapely). 원격 COG 의 개요 층에서 그 범위만 읽는다(파일 보관 0)."""
    import numpy as np
    import rasterio
    from rasterio import features
    from rasterio.merge import merge
    from scipy import ndimage
    from shapely.geometry import shape
    from shapely.ops import unary_union
    b = (bounds[0] - 0.01, bounds[1] - 0.01, bounds[2] + 0.01, bounds[3] + 0.01)
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif", GDAL_HTTP_MAX_RETRY="4",
                      GDAL_HTTP_RETRY_DELAY="2"):
        dss = []
        for t in _wc_tiles(b):
            try:
                dss.append(rasterio.open(WC_URL.format(t=t)))
            except Exception:  # noqa: BLE001 — 바다만 있는 칸은 파일이 없다
                pass
        if not dss:
            return None
        arr, tr = merge(dss, bounds=b, res=(WC_RES, WC_RES), nodata=0)
        for d in dss:
            d.close()
    m = arr[0] == 40
    if not m.any():
        return None
    mm = ndimage.binary_dilation(m, iterations=FARM_DIL)
    mm = ndimage.binary_erosion(mm, iterations=FARM_ERO)
    polys = [shape(p) for p, v in features.shapes(mm.astype("uint8"), mask=mm, transform=tr)]
    return unary_union(polys).buffer(0) if polys else None


# ── 하천 띠 ─────────────────────────────────────────────────────────────────
_SMALL: dict = {}


def _small_index():
    """보유 소하천구역 면 — 한 번 읽어 공간 색인(STRtree)."""
    if "tree" in _SMALL:
        return _SMALL["tree"], _SMALL["geoms"]
    from shapely.geometry import shape
    from shapely.strtree import STRtree
    geoms = []
    if SMALL_DIR.exists():
        for p in sorted(SMALL_DIR.glob("*_river.json.gz")):
            try:
                d = json.load(gzip.open(p))
            except Exception:  # noqa: BLE001
                continue
            for f in (d.get("소하천") or {}).get("features", []):
                try:
                    g = shape(f["geometry"])
                    geoms.append(g if g.is_valid else g.buffer(0))
                except Exception:  # noqa: BLE001
                    pass
    _SMALL["geoms"] = geoms
    _SMALL["tree"] = STRtree(geoms) if geoms else None
    log(f"소하천구역 면 {len(geoms)}개 읽음")
    return _SMALL["tree"], geoms


def vworld_rivers(bounds) -> list:
    """국토교통부 하천망(국가 · 지방하천 면) — 브이월드 데이터 API(플랫폼 등록 키 · 서버에서만)."""
    import requests
    from shapely.geometry import shape
    from landxi_api.proxy import vworld_key
    key, dom = vworld_key()
    out = []
    if not key:
        return out
    for page in range(1, 30):
        q = {"service": "data", "request": "GetFeature", "data": "LT_C_WKMSTRM", "key": key, "domain": dom,
             "geomFilter": "BOX({},{},{},{})".format(*[round(v, 5) for v in bounds]), "size": 1000, "page": page,
             "geometry": "true", "attribute": "true", "format": "json", "crs": "EPSG:4326"}
        for k in range(4):
            try:
                j = requests.get("https://api.vworld.kr/req/data", params=q, timeout=60, headers={"User-Agent": "LandXI-national/1.0"}).json()["response"]
                break
            except Exception:  # noqa: BLE001
                time.sleep(2 ** (k + 1))
        else:
            raise RuntimeError("브이월드 하천망 응답 없음")
        if j.get("status") != "OK":
            break
        for f in j["result"]["featureCollection"]["features"]:
            try:
                g = shape(f["geometry"])
                out.append((g if g.is_valid else g.buffer(0), (f.get("properties") or {}).get("cat_nam")))
            except Exception:  # noqa: BLE001
                pass
        if page >= int(j["page"]["total"]):
            break
    return out


def river_band(bounds, buffer_m: float):
    from shapely.geometry import box
    from shapely.ops import transform, unary_union
    nat = [g for g, _ in vworld_rivers(bounds)]
    tree, geoms = _small_index()
    small = [geoms[i] for i in tree.query(box(*bounds))] if tree is not None else []
    allg = [transform(F, g) for g in nat + small]
    if not allg:
        return None, {"national_local": len(nat), "small": len(small)}
    band = unary_union(allg).buffer(buffer_m, 4)
    return transform(B, band), {"national_local": len(nat), "small": len(small)}


# ── 칸 만들기 ───────────────────────────────────────────────────────────────
def parts_in(cover, eg, min_km2):
    """읍면동 ∩ 범위 → 작업 조각(넓이 min_km2 이상)."""
    if cover is None or not cover.intersects(eg):
        return []
    x = cover.intersection(eg)
    return [p for p in _polys(x) if km2(p) >= min_km2]


def build_sgg(c, r: dict, year: int, assets, st: dict, ord0: int, force: bool = False) -> dict:
    from shapely.geometry import shape
    from landxi_api import regions
    fc = regions.emd_fc(r["sgg_cd"])
    emds = [(f["properties"]["emd_cd"], f["properties"].get("name"), shape(f["geometry"]).buffer(0)) for f in fc["features"] if f.get("geometry")]
    b = r.get("bbox") or [min(e[2].bounds[0] for e in emds), min(e[2].bounds[1] for e in emds), max(e[2].bounds[2] for e in emds), max(e[2].bounds[3] for e in emds)]
    covers, info = {}, {}
    if "farm" in assets:
        covers["farm"] = farm_mask(b)
    if "river" in assets:
        covers["river"], info["river"] = river_band(b, float(st.get("river_buffer_m", 100)))
    n = {a: 0 for a in assets}
    for k, (cd, name, eg) in enumerate(emds):
        gs = eg.simplify(SIMPLE_EMD, preserve_topology=True)
        for a in assets:
            parts = parts_in(covers.get(a), eg, FARM_MIN_KM2 if a == "farm" else RIVER_MIN_KM2)
            tg = _multi(parts)
            tk = round(sum(km2(p) for p in parts), 4)
            state = "todo" if parts else "skip"
            c.execute(
                "INSERT INTO national_cells(asset, year, cell_cd, sgg_cd, sido, sgg_name, name, ord, emd_km2, target_km2, target, geom_s, state) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s, CASE WHEN %s::text IS NULL THEN NULL ELSE ST_Multi(ST_SetSRID(ST_GeomFromText(%s),4326)) END, "
                "ST_Multi(ST_SetSRID(ST_GeomFromText(%s),4326)), %s) "
                "ON CONFLICT (asset, year, cell_cd) DO UPDATE SET sgg_cd=EXCLUDED.sgg_cd, sido=EXCLUDED.sido, sgg_name=EXCLUDED.sgg_name, name=EXCLUDED.name, "
                "ord=EXCLUDED.ord, emd_km2=EXCLUDED.emd_km2, geom_s=EXCLUDED.geom_s, "
                "target=CASE WHEN national_cells.state='done' AND NOT %s THEN national_cells.target ELSE EXCLUDED.target END, "
                "target_km2=CASE WHEN national_cells.state='done' AND NOT %s THEN national_cells.target_km2 ELSE EXCLUDED.target_km2 END, "
                "state=CASE WHEN national_cells.state IN ('done','running') THEN national_cells.state ELSE EXCLUDED.state END",
                (a, year, cd, r["sgg_cd"], r.get("sido_short") or r.get("sido"), r.get("name"), name, ord0 + k, round(km2(eg), 4), tk,
                 tg.wkt if tg is not None else None, tg.wkt if tg is not None else None, _multi(_polys(gs) or _polys(eg)).wkt, state, force, force))
            n[a] += 1 if parts else 0
    return {"emd": len(emds), "cells": n, **({"river_src": info["river"]} if "river" in info else {})}


def order_regions(st: dict) -> list[dict]:
    from landxi_api.regions import regions_base
    regs = [x for x in regions_base()[0] if not x.get("abroad")]
    order = [str(x) for x in st.get("order") or []]
    rank = {p: i for i, p in enumerate(order)}
    return sorted(regs, key=lambda x: (rank.get(x["sgg_cd"][:2], len(order)), x["sgg_cd"]))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sgg", action="append")
    ap.add_argument("--year", type=int)
    ap.add_argument("--asset", action="append")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--skip-built", action="store_true", help="이미 칸이 있는 시군구는 건너뜀(이어 만들기)")
    a = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    with pg() as c:
        st = settings(c)
        year = a.year or int(st["year"])
        assets = a.asset or st["assets"]
        regs = order_regions(st)
        if a.sgg:
            regs = [x for x in regs if x["sgg_cd"] in a.sgg]
        built = {r[0] for r in c.execute("SELECT DISTINCT sgg_cd FROM national_cells WHERE year=%s", (year,)).fetchall()} if a.skip_built else set()
        t0 = time.time()
        for i, r in enumerate(regs):
            if r["sgg_cd"] in built:
                continue
            ord0 = (order_regions(st).index(r) if a.sgg else i) * 1000
            try:
                res = build_sgg(c, r, year, assets, st, ord0, a.force)
                log(f"[{i + 1}/{len(regs)}] {r['sgg_cd']} {r.get('sido_short')} {r['name']} {res}")
            except Exception as e:  # noqa: BLE001 — 한 시군구가 실패해도 다음으로(다시 돌리면 이어서)
                log(f"[{i + 1}/{len(regs)}] {r['sgg_cd']} 실패: {e!r}")
        tot = c.execute("SELECT asset, count(*) FILTER (WHERE state<>'skip'), round(sum(target_km2)::numeric,1) FROM national_cells WHERE year=%s GROUP BY asset",
                        (year,)).fetchall()
        log(f"끝 {time.time() - t0:.0f}s · {tot}")


if __name__ == "__main__":
    main()
