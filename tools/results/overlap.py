# -*- coding: utf-8 -*-
import sys, io, os, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
import geopandas as gpd, pandas as pd
from shapely.geometry import box

REPO = r"F:\Land-XI 플랫폼\01. 디자인"
G = os.path.join(REPO, "landxi", "assets", "data", "geo")
R = os.path.join(G, "results")

AOI = box(127.3481, 35.5276, 127.3567, 35.5347)
aoi_g = gpd.GeoSeries([AOI], crs=4326).to_crs(5186)
print("AOI 면적(ha) = %.2f" % (aoi_g.area.iloc[0] / 1e4))

for n in ["namwon-farmland-2025", "namwon-greenhouse-2025"]:
    g = gpd.read_file(os.path.join(R, n + ".geojson"))
    gm = g.to_crs(5186)
    inter = gm.intersection(aoi_g.iloc[0])
    hit = ~inter.is_empty
    a_in = inter.area.sum()
    a_all = gm.area.sum()
    print("\n[%s] n=%d" % (n, len(g)))
    print("  AOI 내 걸치는 피처: %d (%.2f%%)" % (hit.sum(), 100 * hit.sum() / len(g)))
    print("  AOI 내 면적: %.2f ha / 전체 %.2f ha  → 면적 비중 %.3f%%" % (a_in / 1e4, a_all / 1e4, 100 * a_in / a_all))
    print("  AOI 채움률: %.2f%%" % (100 * a_in / aoi_g.area.iloc[0]))
    print("  데이터 bbox: %s" % [round(v, 5) for v in g.total_bounds])
    bb = g.total_bounds
    bbm = gpd.GeoSeries([box(*bb)], crs=4326).to_crs(5186).area.iloc[0]
    print("  데이터 bbox 면적 %.0f ha → AOI 는 그 %.4f%%" % (bbm / 1e4, 100 * aoi_g.area.iloc[0] / bbm))
    if hit.sum():
        sub = g[hit.values]
        print("  AOI 내 클래스:", sub["cls"].value_counts().to_dict())
        print("  AOI 내 읍면동:", sub["emd"].value_counts().to_dict() if "emd" in sub else None)

print("\n" + "=" * 60)
md = gpd.read_file(os.path.join(G, "marine-debris.geojson"))
print("marine-debris.geojson n=%d bbox=%s" % (len(md), [round(v, 5) for v in md.total_bounds]))
print("  cols:", [c for c in md.columns if c != "geometry"][:15])
mdb = box(*md.total_bounds)
for n in ["yeosu-marine-2025-aerial", "yeosu-marine-2026-drone"]:
    g = gpd.read_file(os.path.join(R, n + ".geojson"))
    b = box(*g.total_bounds)
    print("\n[%s] bbox=%s" % (n, [round(v, 5) for v in g.total_bounds]))
    print("  bbox 교차? %s" % b.intersects(mdb))
    if b.intersects(mdb):
        print("  교차 bbox: %s" % [round(v, 5) for v in b.intersection(mdb).bounds])
        sj = gpd.sjoin(g, md, how="inner", predicate="intersects")
        print("  실제 피처 교차 건수: %d" % len(sj))
    else:
        d = gpd.GeoSeries([b], crs=4326).to_crs(5186).distance(
            gpd.GeoSeries([mdb], crs=4326).to_crs(5186).iloc[0]).iloc[0]
        print("  bbox 최단거리 %.1f km" % (d / 1000))

# 여수 2025 항공 vs 2026 드론
a = gpd.read_file(os.path.join(R, "yeosu-marine-2025-aerial.geojson"))
d = gpd.read_file(os.path.join(R, "yeosu-marine-2026-drone.geojson"))
db = box(*d.total_bounds)
inside = a[a.geometry.intersects(db)]
print("\n2026 드론 bbox 안에 들어오는 2025 항공 탐지: %d / %d (%.1f%%)" % (len(inside), len(a), 100 * len(inside) / len(a)))
