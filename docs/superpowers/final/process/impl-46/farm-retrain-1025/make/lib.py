import sys,json,math,random,pathlib
sys.path.insert(0, r"E:\Land-XI 플랫폼\01. 디자인\server"); sys.stdout.reconfigure(encoding="utf-8")
from landxi_api import config
import psycopg, numpy as np, rasterio
from rasterio.windows import from_bounds
from rasterio.enums import Resampling
from shapely import wkb
from PIL import Image, ImageDraw, ImageFont
DATA=config.DATA_ROOT
IMG={"06":DATA/"imagery/namwon/2025-06/nw_2506_cog.tif","08":DATA/"imagery/namwon/2025-08/nw_2508_cog.tif"}
FARM={"경작지":"경작","비경작지":"휴경"}
PSQL="""
WITH d AS (SELECT geom, cls, conf FROM detections WHERE job_id = ANY(%s) AND coalesce(edit_state,'raw')<>'deleted' AND cls = ANY(%s)),
 e AS (SELECT ST_SetSRID(ST_Extent(geom),4326) g FROM d),
 p AS (SELECT sp.pnu, sp.geom, sp.jimok FROM survey_parcels sp, e WHERE sp.jimok IN ('전','답','과') AND sp.geom && e.g)
SELECT p.pnu, p.jimok, ST_AsBinary(ST_Transform(p.geom,5186)) g, d.cls, sum(ST_Area(ST_Intersection(ST_MakeValid(p.geom),ST_MakeValid(d.geom))::geography)) a, max(ST_Area(p.geom::geography)) pa, avg(d.conf) cf
FROM p JOIN d ON ST_Intersects(p.geom,d.geom) GROUP BY p.pnu,p.jimok,p.geom,d.cls"""
def parcels(jobs):
    """job들의 결과 → 필지별 예측(경작/휴경 · 몫 · 덮인 몫). 필지 도형은 5186."""
    c=psycopg.connect(config.PG_ADMIN_DSN)
    rows=c.execute(PSQL,(list(jobs),list(FARM))).fetchall(); per={}
    for pnu,jm,g,cls,a,pa,cf in rows:
        x=per.setdefault(pnu,{"pnu":pnu,"jimok":jm,"g":bytes(g),"pa":float(pa or 0),"by":{}})
        x["by"][cls]=x["by"].get(cls,0)+float(a or 0)
    out=[]
    for x in per.values():
        tot=sum(x["by"].values())
        if x["pa"]<=0 or tot/x["pa"]<0.3: continue
        cls,aa=max(x["by"].items(),key=lambda kv:kv[1])
        out.append({"pnu":x["pnu"],"jimok":x["jimok"],"wkb":x["g"].hex(),"area":round(x["pa"],1),"pred":FARM[cls],"share":round(aa/tot,3),"cover":round(tot/x["pa"],3)})
    return out
def read(month,bbox,w,h):
    with rasterio.open(IMG[month]) as ds:
        win=from_bounds(*bbox,transform=ds.transform)
        coarse=(bbox[2]-bbox[0])/w>abs(ds.transform.a)*2
        arr=ds.read([1,2,3],window=win,out_shape=(3,h,w),boundless=True,fill_value=255,resampling=Resampling.average if coarse else Resampling.bilinear)
    return np.transpose(arr,(1,2,0)).astype(np.uint8)
def font(px):
    try: return ImageFont.truetype("C:/Windows/Fonts/malgunbd.ttf",px)
    except Exception: return None
def draw_poly(im,g,bbox,color=(255,230,0),width=2):
    w,h=im.size; sx=w/(bbox[2]-bbox[0]); sy=h/(bbox[3]-bbox[1]); d=ImageDraw.Draw(im)
    polys=[g] if g.geom_type=="Polygon" else list(g.geoms)
    for p in polys:
        pts=[((x-bbox[0])*sx,(bbox[3]-y)*sy) for x,y in p.exterior.coords]
        d.line(pts,fill=color,width=width)
