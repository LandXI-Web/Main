import sys,json; sys.stdout.reconfigure(encoding='utf-8')
import numpy as np, geopandas as gpd
from rasterio.features import rasterize
from rasterio.transform import from_origin
from shapely.geometry import box
sys.path.insert(0,"E:/도로공사/deck_anseong/_src"); import window as W
OUT="E:/도로공사/deck_anseong/v3/"
c19=np.load(OUT+"_src/win_2019.npy").astype(int); c25=np.load(OUT+"_src/win_2025.npy").astype(int)
G=gpd.read_file(OUT+"_src/parcels_3857.gpkg"); n=len(G)
x0,y0,x1,y1=W.merc_bounds(); px=W.TILE_M/256; tf=from_origin(x0,y1,px,px); H,Wd=c19.shape
lab=rasterize([(g,i+1) for i,g in enumerate(G.geometry)],out_shape=(H,Wd),transform=tf,fill=0,dtype=np.int32)
ra=(px*np.cos(np.radians(37.056)))**2
mg=gpd.read_file(OUT+"_src/master_gpkg_window.gpkg").to_crs(3857); mg=mg[mg.geometry.intersection(box(x0,y0,x1,y1)).area>1]
u=mg.geometry.buffer(1.0).union_all(); u0=mg.geometry.union_all()
def run(name,mask):
    a=np.bincount(lab[mask&(lab>0)],minlength=n+1)[1:]*ra; sel=np.where(a>=300)[0]
    g=G.geometry.iloc[sel]; h0=g.intersects(u0).sum(); h1=g.intersects(u).sum()
    print(name,"필지",len(sel),"마스터 겹침",h0,"겹침/맞닿음",h1, round(100*h1/max(len(sel),1),1))
road25=c25==3
run("literal: lc25=도로, lc19!=도로",road25&(c19!=3))
run("literal + 0·4 제외",road25&~np.isin(c19,[0,3,4]))
run("농지→도로(적용분)",road25&np.isin(c19,[5,6,7]))
run("lc19=0 → 도로",road25&(c19==0)); run("lc19 11→도로",road25&(c19==11)); run("lc19 산림→도로",road25&np.isin(c19,[8,9]))
print("road px 2019/2025",(c19==3).sum(),road25.sum()); print("마스터 창 안",len(mg))
