"""usage: pick.py area month out.json n_fallow n_crop [start_no] — 예측 휴경 전부(최대 n_fallow) + 경작 무작위 n_crop"""
from lib import *
area,month,out,nf,nc=sys.argv[1],sys.argv[2],sys.argv[3],int(sys.argv[4]),int(sys.argv[5]); no0=int(sys.argv[6]) if len(sys.argv)>6 else 1
ps=json.load(open(f"parcels_{area}.json",encoding="utf-8")); rnd=random.Random(__import__("zlib").crc32(area.encode())%1000)
F=[p for p in ps if p["pred"]=="휴경"]; C=[p for p in ps if p["pred"]=="경작"]; rnd.shuffle(F); rnd.shuffle(C)
sel=F[:nf]+C[:nc]; rnd.shuffle(sel)
for i,p in enumerate(sel): p.update({"no":no0+i,"area_id":area,"m":month})
json.dump(sel,open(out,"w",encoding="utf-8"),ensure_ascii=False); print(len(sel),"fallow",min(nf,len(F)),"crop",min(nc,len(C)))
