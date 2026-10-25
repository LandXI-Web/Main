"""교정 학습 묶음 만들기 — 눈으로 매긴 필지(+ 모델이 이미 맞게 낸 필지)에서 1024칸(2cm) 칩 + YOLO-seg 라벨.
usage: build_ds.py OUT_DIR"""
from lib import *
from areas import *
from labels import load_labels
from shapely.geometry import box, Polygon, MultiPolygon, Point
from shapely.ops import unary_union
from shapely.strtree import STRtree
from shapely.validation import make_valid
import shapely, shutil
OUT=pathlib.Path(sys.argv[1]); S=1024; GSD=0.02; WIN=S*GSD
rnd=random.Random(1025)
c=psycopg.connect(config.PG_ADMIN_DSN)
def dets(jobs):
    rows=c.execute("SELECT ST_AsBinary(ST_Transform(geom,5186)), cls FROM detections WHERE job_id=ANY(%s) AND coalesce(edit_state,'raw')<>'deleted' AND geom IS NOT NULL",(list(jobs),)).fetchall()
    return [(make_valid(wkb.loads(bytes(g))),FARM[k]) for g,k in rows if k in FARM]
def nodata_frac(a):
    w=(a>=250).all(2); r=(a[...,0]>200)&(a[...,1]<70)&(a[...,2]<70)
    return float((w|r).mean())
def polys_of(g):
    if g.is_empty: return []
    if g.geom_type=="Polygon": return [g]
    if g.geom_type in("MultiPolygon","GeometryCollection"): return [x for p in g.geoms for x in polys_of(p)]
    return []
def stats():
    return {}
chips=[]; summary={}
for area,(m,jobs,split) in AREAS.items():
    lab=load_labels(area)
    # 사용자 지적 필지(OVERRIDE)는 학습에 넣지 않는다 — 학습에 안 쓴 채 새 모델이 맞히는지 보려고(평가에서만 경작으로 침)
    if not lab and split!="train": continue
    if not lab: continue
    # 시험용으로 떼어 둔 것 — 08E 의 한 개 리(5219038023)와 사용자 지적 필지는 학습에 쓰지 않는다(그 필지 칩은 맞닿으면 버린다)
    HOLD_RI={"08E":"5219038023"}
    for k in list(lab):
        if k[:10]==HOLD_RI.get(area) or k in OVERRIDE: lab[k]="X"
    ps=parcels(jobs); P={p["pnu"]:p for p in ps}
    D=dets(jobs)
    # 필지 → 새 분류
    for p in ps: p["g"]=make_valid(wkb.loads(bytes.fromhex(p["wkb"])))
    union=unary_union([g for g,_ in D])
    items=[]    # (poly, class) — 라벨로 쓰는 것
    excl=[]     # 이 칩에 들어오면 안 되는 것(애매한 필지)
    new={}      # pnu -> 새 분류
    for p in ps:
        code=lab.get(p["pnu"])
        if code in CODE: new[p["pnu"]]=CODE[code]; p["src"]="human"
        elif code in("N","U","X"): p["src"]="excl"; excl.append(p["g"])
        elif p["pred"]=="경작": new[p["pnu"]]=("경작"); p["src"]="model"
        else: p["src"]="excl"; excl.append(p["g"])
    for p in ps:
        if p["pnu"] not in new: continue
        part=p["g"].intersection(union) if union.is_valid else p["g"]
        if part.is_empty or part.area<0.3*p["g"].area: part=p["g"]
        for q in polys_of(part):
            if q.area>=15: items.append((q,new[p["pnu"]],p["src"],p["pnu"]))
    ex=unary_union([make_valid(x) for x in excl]) if excl else Polygon()
    tree=STRtree([q for q,_,_,_ in items])
    n_ok=0; n_rej=0
    for p in ps:
        if p.get("src")!="human": continue
        g=p["g"]; cls=new[p["pnu"]]
        n=max(1,min(4,round(p["area"]/450)))
        if cls=="휴경": n=min(5,n+1)
        pts=[]; tries=0; target=g.intersection(union) if not g.intersection(union).is_empty else g
        x0,y0,x1,y1=target.bounds
        while len(pts)<n and tries<300:
            tries+=1; pt=Point(rnd.uniform(x0,x1),rnd.uniform(y0,y1))
            if not target.contains(pt): continue
            if any(pt.distance(q)<WIN*0.7 for q in pts): continue
            pts.append(pt)
        for pt in pts:
            bb=(pt.x-WIN/2,pt.y-WIN/2,pt.x+WIN/2,pt.y+WIN/2); B=box(*bb)
            if not ex.is_empty and ex.intersection(B).area>0.03*B.area: n_rej+=1; continue
            arr=read(m,bb,S,S)
            if nodata_frac(arr)>0.005: n_rej+=1; continue
            lines=[]; hum=0
            for i in tree.query(B):
                q,cl,src,pnu=items[i]
                ip=q.intersection(B)
                for r in polys_of(ip):
                    if r.area<30: continue
                    r=r.simplify(0.04)
                    co=[((x-bb[0])/WIN,(bb[3]-y)/WIN) for x,y in r.exterior.coords[:-1]]
                    if len(co)<3: continue
                    lines.append(f"{0 if cl=='경작' else 1} "+" ".join(f"{u:.5f} {v:.5f}" for u,v in co))
                    if src=="human": hum+=1
            if not lines: continue
            chips.append({"area":area,"split":split,"pnu":p["pnu"],"cls":cls,"month":m,"arr":arr,"lines":lines,"hum":hum})
            n_ok+=1
    summary[area]=(len(lab),n_ok,n_rej); print(area,split,"labeled",len(lab),"chips",n_ok,"rejected",n_rej,flush=True)
# 쓰기
import collections
for sp in("train","val"):
    for sub in("images","labels"): (OUT/sub/sp).mkdir(parents=True,exist_ok=True)
cnt=collections.Counter()
for i,ch in enumerate(chips):
    if ch["split"]=="test": continue
    nm=f"{ch['area']}_{i:05d}"; sp=ch["split"]
    Image.fromarray(ch["arr"]).save(OUT/"images"/sp/(nm+".jpg"),quality=94)
    (OUT/"labels"/sp/(nm+".txt")).write_text("\n".join(ch["lines"])+"\n",encoding="utf-8")
    cnt[(sp,ch["month"],ch["cls"])]+=1
print(sorted(cnt.items()))
json.dump({"summary":summary,"chips":sorted(cnt.items())},open(OUT/"build.json","w",encoding="utf-8"),ensure_ascii=False,default=str)
