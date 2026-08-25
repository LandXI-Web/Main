#!/usr/bin/env python
"""Overture buildings 높이 커버리지 점검 — 한국 주요 도시 다중 bbox 1-pass."""
import json, os, sys, time
from collections import Counter
import duckdb

RELEASE = os.environ.get("OVERTURE_RELEASE", "2026-08-19.0")
BASE = f"s3://overturemaps-us-west-2/release/{RELEASE}/theme=buildings/type=building/*"

AOIS = {
    "서울-중구":   (126.965, 37.550, 127.010, 37.575),
    "전주-덕진":   (127.100, 35.810, 127.160, 35.850),
    "여수-시내":   (127.700, 34.730, 127.760, 34.775),
    "제주-시내":   (126.500, 33.490, 126.560, 33.525),
    "남원-금지송동": (127.346, 35.374, 127.434, 35.446),
}

def main():
    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial;")
    con.execute("SET s3_region='us-west-2';")
    where = " OR ".join(
        f"(bbox.xmin BETWEEN {w} AND {e} AND bbox.ymin BETWEEN {s} AND {n})"
        for (w, s, e, n) in AOIS.values())
    case = " ".join(
        f"WHEN bbox.xmin BETWEEN {w} AND {e} AND bbox.ymin BETWEEN {s} AND {n} THEN '{k}'"
        for k, (w, s, e, n) in AOIS.items())
    t0 = time.time()
    rows = con.execute(f"""
        SELECT CASE {case} END AS aoi,
               count(*) AS total,
               count(height) AS with_height,
               count(num_floors) AS with_floors,
               round(100.0*count(height)/count(*), 2) AS pct_height,
               round(median(height), 1) AS median_h
        FROM read_parquet('{BASE}', hive_partitioning=1)
        WHERE {where}
        GROUP BY 1 ORDER BY 2 DESC
    """).fetchall()
    print(f"# query {time.time()-t0:.0f}s  release={RELEASE}", file=sys.stderr)
    print(f"{'AOI':<14}{'total':>8}{'height':>8}{'floors':>8}{'%h':>8}{'median_h':>10}")
    for r in rows:
        print(f"{r[0]:<14}{r[1]:>8}{r[2]:>8}{r[3]:>8}{r[4]:>8}{str(r[5]):>10}")

if __name__ == "__main__":
    main()
