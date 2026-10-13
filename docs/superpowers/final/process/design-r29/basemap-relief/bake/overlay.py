"""AI 결과 얹기 자료 — 남원: 서버의 남원 AI 분석 결과(건물 · 경작지 · 비닐하우스 · 주차장) 중 시안 범위만 · 비슈케크: 10 m AI 토지피복(2017 · 2025)에서 새로 생긴 시가지 · 경작지."""
import os
os.environ.setdefault("GDAL_DATA", r"C:\Users\User\anaconda3\envs\gcs\Library\share\gdal")
import pyogrio, rasterio, geopandas as gpd
from rasterio.features import shapes
from rasterio.windows import from_bounds
from shapely.geometry import box, shape
G = "E:/Land-XI 플랫폼/02. 데이터/"; O = G + "basemap-relief/pub/overlay/"
bb = (127.357, 35.386, 127.423, 35.440)
df = pyogrio.read_dataframe(G + "results/lx/job_01M3RCYK4CWJWSXYNEXH3CWZ2B.geojson", bbox=bb, columns=["cls_en"]).clip(box(*bb))
df["geometry"] = df.geometry.simplify(0.000003); df = df[~df.geometry.is_empty]
df.to_file(O + "namwon-ai.geojson", driver="GeoJSON", COORDINATE_PRECISION=6)
bb = (74.54, 42.83, 74.67, 42.92)
def rd(f):
    with rasterio.open(f) as d:
        w = from_bounds(*bb, d.transform); return d.read(1, window=w), d.window_transform(w)
a25, t = rd(G + "global/raw/esri-lulc-2025.tif"); a17, _ = rd(G + "global/raw/esri-lulc-2017.tif")
rows = []
for arr, cls in [(((a25 == 7) & (a17 != 7)).astype("uint8"), "new_built"), ((a25 == 5).astype("uint8"), "cropland")]:
    rows += [{"cls_en": cls, "geometry": shape(g)} for g, v in shapes(arr, mask=arr == 1, transform=t) if v == 1]
g = gpd.GeoDataFrame(rows, crs=4326); g = g[g.to_crs(32643).area > 1500]; g["geometry"] = g.geometry.simplify(0.00004)
g.to_file(O + "bishkek-ai.geojson", driver="GeoJSON", COORDINATE_PRECISION=6)
