#!/usr/bin/env python
"""Overture Maps buildings -> GeoJSON (bbox), 높이/층수 커버리지 통계 포함.
usage: python tools/data3d/fetch_overture_buildings.py <name> <w> <s> <e> <n> [out.geojson]
"""
import json, os, sys, time
import duckdb

RELEASE = os.environ.get("OVERTURE_RELEASE", "2026-08-19.0")
BASE = f"s3://overturemaps-us-west-2/release/{RELEASE}/theme=buildings/type=building/*"

def main():
    name = sys.argv[1] if len(sys.argv) > 1 else "namwon"
    w, s, e, n = [float(x) for x in (sys.argv[2:6] or [127.346, 35.374, 127.434, 35.446])]
    out = sys.argv[6] if len(sys.argv) > 6 else f"landxi/assets/data/3d/{name}-buildings-overture.geojson"

    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial;")
    con.execute("SET s3_region='us-west-2'; SET s3_endpoint='s3.us-west-2.amazonaws.com';")
    t0 = time.time()
    rows = con.execute(f"""
        SELECT id, height, num_floors, roof_height, class, subtype, level,
               ST_AsGeoJSON(geometry) AS gj,
               list_transform(sources, x -> x.dataset) AS ds
        FROM read_parquet('{BASE}', filename=true, hive_partitioning=1)
        WHERE bbox.xmin BETWEEN {w} AND {e}
          AND bbox.ymin BETWEEN {s} AND {n}
    """).fetchall()
    print(f"query {time.time()-t0:.1f}s rows={len(rows)}", file=sys.stderr)

    feats = []
    for r in rows:
        gid, h, nf, rh, cls, sub, lvl, gj, ds = r
        feats.append({
            "type": "Feature",
            "properties": {"id": gid, "height": h, "num_floors": nf, "roof_height": rh,
                           "class": cls, "subtype": sub, "level": lvl,
                           "datasets": sorted(set(ds or [])), "src": "overture"},
            "geometry": json.loads(gj),
        })
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection",
                   "metadata": {"source": f"Overture Maps {RELEASE} theme=buildings",
                                "bbox_wsen": [w, s, e, n],
                                "licence": "CDLA-Permissive 2.0 (일부 ODbL 유래 — sources 확인)"},
                   "features": feats}, f, ensure_ascii=False)
    wh = sum(1 for f in feats if f["properties"]["height"] is not None)
    wf = sum(1 for f in feats if f["properties"]["num_floors"] is not None)
    from collections import Counter
    dsc = Counter(d for f in feats for d in f["properties"]["datasets"])
    print(json.dumps({"out": out, "total": len(feats), "with_height": wh, "with_num_floors": wf,
                      "pct_height": round(100*wh/len(feats), 1) if feats else 0,
                      "datasets": dsc.most_common(8),
                      "bytes": os.path.getsize(out)}, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
