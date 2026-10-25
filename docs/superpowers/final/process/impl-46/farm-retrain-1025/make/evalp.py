"""필지 단위 비교 — 눈으로 매긴 필지 vs 모델 판정. usage: evalp.py tag area=job,job ... (새 모델 작업) · 'base' 는 기존 작업(areas.py)
출력: 혼동표 · 분류별 정밀도/재현율 · 층(예전 판정 분류)별 가중 추정."""
from lib import *
from areas import *
from labels import load_labels
import collections
def truth(code): return CODE.get(code)
def run(areas, jobmap, out=None, only_ri=None):
    only_ri=only_ri or {}
    res=[]; strata=collections.Counter()
    for a in areas:
        m,jobs,split=AREAS[a]; lab=load_labels(a)
        for k,v in OVERRIDE.items():
            if a=="08D": lab[k]="T"
        import glob; items=[i for f in sorted(glob.glob(f"s{a}.json")+glob.glob(f"s{a}[bcd].json")) for i in json.load(open(f,encoding="utf-8"))]; all_ps=json.load(open(f"parcels_{a}.json",encoding="utf-8"))
        N=collections.Counter(p["pred"] for p in all_ps)   # 층 크기(예전 판정)
        pred_new={p["pnu"]:p for p in parcels(jobmap.get(a,jobs))}
        samp=collections.Counter(i["pred"] for i in items if truth(lab.get(i["pnu"])))
        for i in items:
            if a in only_ri and i["pnu"][:10]!=only_ri[a]: continue
            t=truth(lab.get(i["pnu"]))
            if not t: continue
            pn=pred_new.get(i["pnu"]); new=pn["pred"] if pn else "없음"
            w=N[i["pred"]]/max(1,samp[i["pred"]])
            res.append({"area":a,"pnu":i["pnu"],"truth":t,"old":i["pred"],"new":new,"w":w,"code":lab[i["pnu"]]})
    return res
def summarize(res,key):
    conf=collections.Counter((r["truth"],r[key]) for r in res); wconf=collections.defaultdict(float)
    for r in res: wconf[(r["truth"],r[key])]+=r["w"]
    out={"n":len(res),"confusion":{f"{t}->{p}":c for (t,p),c in sorted(conf.items())}}
    for cls in("경작","휴경"):
        tp=conf[(cls,cls)]; fp=sum(c for (t,p),c in conf.items() if p==cls and t!=cls); fn=sum(c for (t,p),c in conf.items() if t==cls and p!=cls)
        wtp=wconf[(cls,cls)]; wfp=sum(c for (t,p),c in wconf.items() if p==cls and t!=cls); wfn=sum(c for (t,p),c in wconf.items() if t==cls and p!=cls)
        out[cls]={"tp":tp,"fp":fp,"fn":fn,"precision":round(tp/max(1,tp+fp),3),"recall":round(tp/max(1,tp+fn),3),
                  "w_precision":round(wtp/max(1e-9,wtp+wfp),3),"w_recall":round(wtp/max(1e-9,wtp+wfn),3)}
    tot=sum(r["w"] for r in res); ok=sum(r["w"] for r in res if r["truth"]==r[key])
    out["w_accuracy"]=round(ok/max(1e-9,tot),3); out["accuracy"]=round(sum(1 for r in res if r["truth"]==r[key])/max(1,len(res)),3)
    return out
if __name__=="__main__":
    tag=sys.argv[1]; hold="08Eh" in sys.argv[2]; areas=[a.replace("08Eh","08E") for a in sys.argv[2].split(",")]; jm={}
    for s in sys.argv[3:]:
        a,j=s.split("="); jm[a]=j.split(",")
    r=run(areas,jm,only_ri={"08E":"5219038023"} if hold else None)
    print(json.dumps({"old":summarize(r,"old"),"new":summarize(r,"new")},ensure_ascii=False,indent=1))
    json.dump(r,open(f"eval_{tag}.json","w",encoding="utf-8"),ensure_ascii=False)
