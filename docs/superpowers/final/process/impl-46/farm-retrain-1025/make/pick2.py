"""usage: pick2.py area month tag n_fallow n_crop start_no — 이미 매긴 필지는 빼고 새로 뽑기. 결과 s{area}{tag}.json"""
from lib import *
from labels import load_labels
import zlib,glob
area,month,tag,nf,nc,no0=sys.argv[1],sys.argv[2],sys.argv[3],int(sys.argv[4]),int(sys.argv[5]),int(sys.argv[6])
done=set(load_labels(area))
for f in glob.glob(f"s{area}*.json"):
    if f!=f"s{area}.json":
        for i in json.load(open(f,encoding="utf-8")): done.add(i["pnu"])
ps=[p for p in json.load(open(f"parcels_{area}.json",encoding="utf-8")) if p["pnu"] not in done]
rnd=random.Random(zlib.crc32((area+tag).encode())%1000)
F=[p for p in ps if p["pred"]=="휴경"]; C=[p for p in ps if p["pred"]=="경작"]; rnd.shuffle(F); rnd.shuffle(C)
sel=F[:nf]+C[:nc]; rnd.shuffle(sel)
for i,p in enumerate(sel): p.update({"no":no0+i,"area_id":area,"m":month})
json.dump(sel,open(f"s{area}{tag}.json","w",encoding="utf-8"),ensure_ascii=False); print(len(sel))
