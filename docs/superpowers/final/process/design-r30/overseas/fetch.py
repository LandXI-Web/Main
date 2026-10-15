"""소쿨룩 평야 — Sentinel-2 L2A 두 시기(봄·여름) × 2021 · 2025 + ESA WorldCover 2021 라벨 + Esri LULC 2025(독립 대조).
원 자료: AWS 공개(Earth Search STAC · sentinel-cogs · esa-worldcover 버킷) — 키 · 계정 · 메일 없음. CPU만."""
import json, time, urllib.request, numpy as np, rasterio
from rasterio.windows import from_bounds
from rasterio.warp import reproject, Resampling, transform_bounds
from rasterio.transform import from_origin
import os
os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN","EMPTY_DIR"); os.environ.setdefault("AWS_NO_SIGN_REQUEST","YES")
AOI=[74.15,42.75,74.45,42.95]
CRS="EPSG:32643"
l,b,r,t=transform_bounds("EPSG:4326",CRS,*AOI)
l,b,r,t=[round(v/10)*10 for v in (l,b,r,t)]
W,H=int((r-l)/10),int((t-b)/10); TR=from_origin(l,t,10,10)
SCENES={"2021a":"S2A_43TDH_20210428_1_L2A","2021b":"S2B_43TDH_20210811_1_L2A","2025a":"S2C_43TDH_20250517_0_L2A","2025b":"S2B_43TDH_20250830_0_L2A"}
BANDS=["blue","green","red","nir","swir16","swir22","scl"]
def item(i):
    u=f"https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a/items/{i}"
    return json.load(urllib.request.urlopen(u,timeout=60))
out={"grid":dict(crs=CRS,bounds=[l,b,r,t],w=W,h=H),"scenes":SCENES}
arr={}
t0=time.time()
for k,i in SCENES.items():
    it=item(i); stack=[]
    for bnd in BANDS:
        href=it["assets"][bnd]["href"]
        with rasterio.open(href) as src:
            assert str(src.crs)==CRS, src.crs
            win=from_bounds(l,b,r,t,src.transform)
            a=src.read(1,window=win,out_shape=(H,W),resampling=Resampling.nearest,boundless=True,fill_value=0)
        stack.append(a)
        print(k,bnd,a.shape,round(time.time()-t0,1),flush=True)
    arr[k]=np.stack(stack)
def warp(url,dtype=np.uint8):
    with rasterio.open(url) as src:
        dst=np.zeros((H,W),dtype)
        reproject(rasterio.band(src,1),dst,dst_transform=TR,dst_crs=CRS,resampling=Resampling.nearest)
    return dst
arr["wc2021"]=warp("https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_N42E072_Map.tif"); print("wc",time.time()-t0)
RAW="E:/Land-XI 플랫폼/02. 데이터/global/raw/"
arr["esri2025"]=warp(RAW+"esri-lulc-2025.tif"); arr["esri2017"]=warp(RAW+"esri-lulc-2017.tif")
np.savez_compressed("sokuluk.npz",**arr); json.dump(out,open("sokuluk-meta.json","w"),indent=1)
print("done",W,H,round(time.time()-t0,1))
