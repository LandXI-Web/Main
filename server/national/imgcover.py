"""전국 분석 칸의 영상 빈 자리 — 그 해 국토지리정보원 항공 층에 영상이 없는 자리를 칸(읍면동)마다 적는다(10-22 바퀴 22 P6 시계열).

  python -m national.imgcover --year 2025 --fill 2024            빈 자리가 기록된 시군구(fetch-events 표본) + 접경 시군구 전부
  python -m national.imgcover --year 2025 --fill 2024 --sgg 41800,42780   이 시군구만
  python -m national.imgcover --year 2024 --fill 2023 --copy-none 2025    2025 에서 '영상 없음'으로 찾은 칸만 2024 층으로 다시 물어 봄

사용자 답(10-22 now21):
  · 시계열-빈조각2024 ⓐ — 2025 영상의 빈 조각을 2024 영상으로 채우고 '2024년 영상'으로 표기  → kind 'fill'
  · 시계열-접경영상없음 ⓐ — '영상 없음(공개 제한 지역)' 회색 표시 · 숫자에서 뺌                → kind 'none'

방법: 칸 범위(농지 · 하천 범위를 합친 것) 안을 타일 STEP 칸 간격(약 196m)으로 점을 찍고, 점마다 그 해 층 타일(18단계 · 약 65m)을 묻는다.
  영상 서버가 그 타일만 안내 페이지(404 html)를 주고 기준 타일(전주 · 서울 · 대전)은 그림을 주면 '빈 자리'. 빈 점은 앞 해 층에도 묻는다.
  GPU 를 쓰지 않는다. 영상은 저장하지 않는다(응답 종류만 본다). 동시 호출은 THREADS 개(전국 작업기와 같은 영상 서버 · 작게).
결과는 national_imgcover(해 · 칸 · 종류 · 넓이 · 몫 · 면). 숫자는 이 표 한 곳 — XI맵 · 관리자 · 진행이 같이 읽는다.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from national.common import OUT, pg  # noqa: E402

Z = 18
RES = 17112760.32 / (256 * 2 ** Z)          # 18단계 화소 크기(m) — NGIS_AIR 타일 격자(EPSG:5179 · 왼쪽 위 -200000, 4000000)
TILE_M = RES * 256                           # 타일 한 장 약 65.3m
STEP = 3                                     # 점 간격(타일 수) — 약 196m
THREADS = 6
UA = {"User-Agent": "Mozilla/5.0 (LandXI)", "Referer": "https://map.ngii.go.kr/"}
# 접경 · 공개 제한 시군구(10-21 TIMESERIES 표본 10곳 모두 2020~2025 영상 없음) — 이름으로 찾는다(코드 하드코딩 없이 장부의 이름 · 시도로)
BORDER = [("경기", "연천군"), ("경기", "파주시"), ("경기", "김포시"), ("강원", "철원군"), ("강원", "양구군"), ("강원", "고성군"),
          ("강원", "인제군"), ("강원", "화천군"), ("인천", "강화군"), ("인천", "옹진군")]


def url(year: int, x: int, y: int) -> str:
    return (f"https://map.ngii.go.kr/airmapprime/map/wmts?service=WMTS&request=GetTile&version=1.0.0&layer=mapprime:air_{year}&style=&format=image/jpeg"
            f"&tilematrixset=NGIS_AIR&tilematrix={Z}&tilerow={y}&tilecol={x}")


_tl = threading.local()


def _s():
    import requests
    if not hasattr(_tl, "s"):
        _tl.s = requests.Session()
    return _tl.s


def ask(year: int, x: int, y: int) -> str:
    """'img' 그림 · 'empty' 바다 등 정상 빈 칸(204 · 404 그림 아님 html 아님) · 'hole' 안내 페이지(이 자리만 영상 없음) · 'err'."""
    for k in range(4):
        try:
            r = _s().get(url(year, x, y), headers=UA, timeout=(10, 30))
            ct = (r.headers.get("content-type") or "").lower()
            if r.status_code == 200 and ct.startswith("image/"):
                return "img"
            if r.status_code in (204, 404) and "html" not in ct:
                return "empty"
            if r.status_code == 404 and "html" in ct:
                return "hole"
        except Exception:  # noqa: BLE001
            pass
        time.sleep(2 * (k + 1))
    return "err"


def service_ok(year: int) -> bool:
    for ex, ny in ((965000, 1745000), (953000, 1952000), (990000, 1817000)):
        tx, ty = int((ex + 200000) / TILE_M), int((4000000 - ny) / TILE_M)
        if ask(year, tx, ty) == "img":
            return True
    return False


def tile_of(ex: float, ny: float) -> tuple[int, int]:
    return int((ex + 200000) / TILE_M), int((4000000 - ny) / TILE_M)


def tile_box(x: int, y: int, n: int = 1):
    from shapely.geometry import box
    x0, y1 = -200000 + x * TILE_M, 4000000 - y * TILE_M
    return box(x0, y1 - n * TILE_M, x0 + n * TILE_M, y1)


def sample_sggs(c, year: int) -> set[str]:
    """빈 타일 표본(작업기 기록 fetch-events.jsonl · 100장마다 1건)이 떨어진 시군구 + 접경 시군구."""
    from pyproj import Transformer
    tr = Transformer.from_crs(5179, 4326, always_xy=True)
    pts = []
    p = OUT / "imagery-api" / "fetch-events.jsonl"
    if p.exists():
        for line in p.read_text(encoding="utf-8").splitlines():
            try:
                e = json.loads(line)
            except ValueError:
                continue
            if "holes" in e and e.get("tile"):
                x, y = e["tile"]
                lon, lat = tr.transform(-200000 + (x + 0.5) * TILE_M, 4000000 - (y + 0.5) * TILE_M)
                pts.append((lon, lat))
    out = set()
    for i in range(0, len(pts), 200):
        chunk = pts[i:i + 200]
        wkt = "MULTIPOINT(" + ",".join(f"({a} {b})" for a, b in chunk) + ")"
        for (s,) in c.execute("SELECT DISTINCT n.sgg_cd FROM national_cells n, (SELECT (ST_Dump(ST_GeomFromText(%s, 4326))).geom g) q "
                              "WHERE n.year=%s AND NOT n.test AND ST_Intersects(n.geom_s, q.g)", (wkt, year)).fetchall():
            out.add(s)
    for sido, name in BORDER:
        for (s,) in c.execute("SELECT DISTINCT sgg_cd FROM national_cells WHERE year=%s AND sido=%s AND sgg_name=%s", (year, sido, name)).fetchall():
            out.add(s)
    return out


def cells_of(c, year: int, sggs: list[str], only: list[str] | None = None):
    q = ("SELECT cell_cd, max(sgg_name), max(name), ST_AsBinary(ST_Transform(ST_Union(target), 5179)) FROM national_cells "
         "WHERE year=%s AND NOT test AND state <> 'skip' AND target IS NOT NULL AND sgg_cd = ANY(%s) ")
    args = [year, sggs]
    if only:
        q += "AND cell_cd = ANY(%s) "
        args.append(only)
    return c.execute(q + "GROUP BY cell_cd ORDER BY cell_cd", args).fetchall()


def probe_cell(year: int, fill: int | None, g5179) -> dict:
    """칸 하나 — 점마다 그 해 층 · 빈 점은 앞 해 층."""
    from shapely.prepared import prep
    from shapely.geometry import Point
    pg_ = prep(g5179)
    x0, y0, x1, y1 = g5179.bounds
    tx0, ty0 = tile_of(x0, y1)
    tx1, ty1 = tile_of(x1, y0)
    pts = []
    for ty in range(ty0, ty1 + 1, STEP):
        for tx in range(tx0, tx1 + 1, STEP):
            cx, cy = -200000 + (tx + STEP / 2) * TILE_M, 4000000 - (ty + STEP / 2) * TILE_M
            if pg_.contains(Point(cx, cy)):
                pts.append((tx + STEP // 2, ty + STEP // 2, tx, ty))
    if not pts:                                         # 아주 작은 칸 — 가운데 한 점
        p = g5179.representative_point()
        tx, ty = tile_of(p.x, p.y)
        pts = [(tx, ty, tx - STEP // 2, ty - STEP // 2)]
    with ThreadPoolExecutor(THREADS) as ex:
        a = list(ex.map(lambda t: ask(year, t[0], t[1]), pts))
        holes = [pts[i] for i, v in enumerate(a) if v == "hole"]
        b = list(ex.map(lambda t: ask(fill, t[0], t[1]), holes)) if (fill and holes) else ["hole"] * len(holes)
    none = [h for h, v in zip(holes, b) if v != "img"]
    filled = [h for h, v in zip(holes, b) if v == "img"]
    return {"n": len(pts), "err": a.count("err"), "none": none, "fill": filled}


def save(c, year: int, fill: int | None, cd: str, g5179, res: dict):
    from shapely.ops import unary_union
    from shapely import wkb
    from pyproj import Transformer
    from shapely.ops import transform
    tr = Transformer.from_crs(5179, 4326, always_xy=True).transform
    c.execute("DELETE FROM national_imgcover WHERE year=%s AND cell_cd=%s", (year, cd))
    n = max(1, res["n"])
    for kind, pts in (("none", res["none"]), ("fill", res["fill"])):
        if not pts:
            continue
        sq = unary_union([tile_box(t[2], t[3], STEP) for t in pts]).intersection(g5179)
        if sq.is_empty:
            continue
        km2 = sq.area / 1e6
        g4326 = transform(tr, sq)
        c.execute("INSERT INTO national_imgcover(year, cell_cd, kind, fill_year, km2, ratio, probes, geom) "
                  "VALUES (%s,%s,%s,%s,%s,%s,%s, ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_GeomFromWKB(%s, 4326)), 3)))",
                  (year, cd, kind, fill if kind == "fill" else None, round(km2, 4), round(len(pts) / n, 4), n, wkb.dumps(g4326)))
    by_asset(c, year, cd)


def by_asset(c, year: int, cd: str):
    """자산(농지 · 하천) 범위마다 이 빈 자리 넓이(㎢) — 진행 숫자에서 뺄 몫."""
    c.execute("UPDATE national_imgcover i SET by_asset = (SELECT jsonb_object_agg(n.asset, round((ST_Area(ST_Intersection(i.geom, n.target)::geography) / 1e6)::numeric, 4)) "
              "FROM national_cells n WHERE n.year=i.year AND n.cell_cd=i.cell_cd AND NOT n.test AND n.state <> 'skip' AND n.target IS NOT NULL) "
              "WHERE i.year=%s AND i.cell_cd=%s AND i.geom IS NOT NULL", (year, cd))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--year", type=int, default=2025)
    ap.add_argument("--fill", type=int, default=None, help="빈 자리를 물어 볼 앞 해(없으면 'none' 만)")
    ap.add_argument("--sgg", default="")
    ap.add_argument("--copy-none", type=int, default=None, help="이 해에서 찾은 빈 칸(none · fill)만 다시 물어 봄")
    a = ap.parse_args()
    from shapely import wkb
    t0 = time.time()
    with pg() as c:
        if not service_ok(a.year):
            print("영상 서버 응답 없음 — 나중에 다시")
            return
        only = None
        if a.copy_none:
            only = [r[0] for r in c.execute("SELECT DISTINCT cell_cd FROM national_imgcover WHERE year=%s", (a.copy_none,)).fetchall()]
            sggs = [r[0] for r in c.execute("SELECT DISTINCT sgg_cd FROM national_cells WHERE year=%s AND cell_cd = ANY(%s)", (a.year, only)).fetchall()]
        elif a.sgg:
            sggs = [s.strip() for s in a.sgg.split(",") if s.strip()]
        else:
            sggs = sorted(sample_sggs(c, a.year))
        rows = cells_of(c, a.year, sggs, only)
        print(f"시군구 {len(sggs)} · 칸 {len(rows)}", flush=True)
        tot = {"none": 0.0, "fill": 0.0, "probes": 0, "err": 0}
        for i, (cd, sgg, name, gb) in enumerate(rows):
            g = wkb.loads(bytes(gb))
            res = probe_cell(a.year, a.fill, g)
            save(c, a.year, a.fill, cd, g, res)
            tot["probes"] += res["n"]
            tot["err"] += res["err"]
            if res["none"] or res["fill"]:
                print(f"  {sgg} {name} {cd}: 점 {res['n']} · 영상 없음 {len(res['none'])} · 앞 해로 채움 {len(res['fill'])}", flush=True)
            if i % 20 == 0:
                print(f"  … {i + 1}/{len(rows)} · {round(time.time() - t0)}초", flush=True)
        s = c.execute("SELECT kind, count(*), round(sum(km2), 2) FROM national_imgcover WHERE year=%s GROUP BY kind", (a.year,)).fetchall()
        print(json.dumps({"year": a.year, "fill": a.fill, "cells": len(rows), "probes": tot["probes"], "err": tot["err"], "sec": round(time.time() - t0),
                          "by_kind": {k: {"cells": n, "km2": float(km)} for k, n, km in s}}, ensure_ascii=False))


if __name__ == "__main__":
    main()
