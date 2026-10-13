import os
os.environ.setdefault("GDAL_DATA", r"C:\Users\User\anaconda3\envs\gcs\Library\share\gdal")
os.environ["GDAL_DISABLE_READDIR_ON_OPEN"]="EMPTY_DIR"
from osgeo import gdal
gdal.UseExceptions()
D="E:/Land-XI 플랫폼/02. 데이터/basemap-relief/src/"
for name,tile,bb in [("namwon","N35_00_E127_00",(127.30,35.35,127.48,35.48)),("bishkek","N42_00_E074_00",(74.50,42.80,74.70,42.95))]:
    u=f"/vsicurl/https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_{tile}_DEM/Copernicus_DSM_COG_10_{tile}_DEM.tif"
    gdal.Translate(D+f"{name}-cop30.tif",u,projWin=[bb[0],bb[3],bb[2],bb[1]],creationOptions=["COMPRESS=DEFLATE"])
    ds=gdal.Open(D+f"{name}-cop30.tif"); b=ds.GetRasterBand(1); print(name,ds.RasterXSize,ds.RasterYSize,b.ComputeRasterMinMax())
