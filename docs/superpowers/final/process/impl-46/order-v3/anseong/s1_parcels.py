"""1단계: 창과 교차하는 연속지적도(2025) 필지 전부. 창은 WebMercator 직사각형 그대로(벨트 좌표 사각형 근사 아님). 벨트 = common.detect_belt_crs."""
import sys, glob, json, time
from pathlib import Path
import geopandas as gpd, pandas as pd, pyogrio
from shapely.geometry import box
from pyproj import Transformer
sys.path.insert(0, "E:/도로공사/geoai_roadland/src"); sys.path.insert(0, "E:/도로공사/deck_anseong/_src")
import common as C, window as W
CAD = Path("E:/도로공사/2025_01_전국연속도"); SIDO = "경기"
xmin, ymin, xmax, ymax = W.merc_bounds(); win3857 = box(xmin, ymin, xmax, ymax)
to_ll = Transformer.from_crs(3857, 4326, always_xy=True)
t0 = time.time(); out = []; log = []
for d in sorted(glob.glob(str(CAD / SIDO / "*"))):
    shp = Path(d) / "LSMD_CONT_LDREG.shp"
    if not shp.exists(): continue
    b = pyogrio.read_info(shp)["total_bounds"]; epsg = C.detect_belt_crs(b, SIDO)
    t = Transformer.from_crs(3857, epsg, always_xy=True)
    xs, ys = zip(*[t.transform(x, y) for x in (xmin, xmax) for y in (ymin, ymax)])
    wb = (min(xs) - 50, min(ys) - 50, max(xs) + 50, max(ys) + 50)
    if not (b[0] <= wb[2] and b[2] >= wb[0] and b[1] <= wb[3] and b[3] >= wb[1]): continue
    g = gpd.read_file(shp, bbox=wb, engine="pyogrio", encoding="cp949").set_crs(epsg, allow_override=True)
    g3 = g.to_crs(3857); g3 = g3[g3.intersects(win3857)]
    log.append({"시군구": Path(d).name, "epsg": epsg, "교차필지": len(g3)}); out.append(g3)
G = gpd.GeoDataFrame(pd.concat(out, ignore_index=True), crs=3857)
G["pnu"] = G["PNU"].map(C.normalize_pnu); G["jimok"] = G["JIBUN"].map(C.parse_jimok)
G5 = G.to_crs(5179); G["area_m2"] = G5.geometry.area.round(1).values
G = G.drop_duplicates("pnu").reset_index(drop=True)
G[["pnu", "jimok", "area_m2", "geometry"]].to_file("parcels_3857.gpkg", driver="GPKG")
json.dump({"신고": log, "rows": int(sum(len(x) for x in out)), "unique_pnu": len(G), "sec": round(time.time() - t0, 1)}, open("s1.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(log, len(G), round(time.time() - t0, 1))
