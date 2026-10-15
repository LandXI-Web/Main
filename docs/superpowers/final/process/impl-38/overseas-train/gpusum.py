"""gpu-1s.csv → 구간별 요약(GPU0 학습 장비 · GPU1 vLLM) — 사용률 · 전력 최대 · 평균 · 30초 평균 최대 · 두 장 동시 100 W 넘은 초."""
import csv, json, sys, datetime as dt
import numpy as np
rows=[r for r in csv.reader(open(sys.argv[1],encoding="utf-8")) if len(r)>=5]
T={}
for r in rows:
    try:
        t=dt.datetime.strptime(r[0].strip()[:19],"%Y/%m/%d %H:%M:%S"); i=int(r[1]); u=float(r[2]); w=float(r[3])
    except Exception: continue
    T.setdefault(t,{})[i]=(u,w)
ts=sorted(T)
def summ(a,b):
    sel=[t for t in ts if a<=t<=b and 0 in T[t] and 1 in T[t]]
    if not sel: return None
    u0=np.array([T[t][0][0] for t in sel]); w0=np.array([T[t][0][1] for t in sel]); w1=np.array([T[t][1][1] for t in sel]); u1=np.array([T[t][1][0] for t in sel])
    k=30; r30u=np.convolve(u0,np.ones(k)/k,"valid") if len(u0)>=k else u0; r30w=np.convolve(w0,np.ones(k)/k,"valid") if len(w0)>=k else w0
    return {"from":a.isoformat(),"to":b.isoformat(),"samples_s":len(sel),
            "gpu0":{"util_mean":round(float(u0.mean()),1),"util_max":float(u0.max()),"util_30s_max":round(float(r30u.max()),1),
                    "power_mean_w":round(float(w0.mean()),1),"power_max_w":float(w0.max()),"power_30s_max_w":round(float(r30w.max()),1),
                    "s_util_over_70":int((u0>70).sum()),"s_power_over_140":int((w0>140).sum())},
            "gpu1":{"util_mean":round(float(u1.mean()),1),"power_max_w":float(w1.max())},
            "both_over_100w_s":int(((w0>100)&(w1>100)).sum())}
out={}
for name,a,b in [x.split("|") for x in sys.argv[3:]]:
    out[name]=summ(dt.datetime.fromisoformat(a),dt.datetime.fromisoformat(b))
json.dump(out,open(sys.argv[2],"w",encoding="utf-8"),ensure_ascii=False,indent=1)
print(json.dumps(out,ensure_ascii=False,indent=1))
