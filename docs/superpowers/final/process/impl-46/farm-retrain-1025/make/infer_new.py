import sys,json,time; sys.path.insert(0, r"E:\Land-XI 플랫폼\01. 디자인\server"); sys.stdout.reconfigure(encoding="utf-8")
from landxi_api import config
import httpx
MID=sys.argv[1]
B=f"http://127.0.0.1:{config.API_PORT}/api/v1"
def H():
    t=httpx.post(B+"/auth/login",json={"realm":"lx","login":"lxadmin@lx.or.kr","password":config.DEV_PASSWORD},timeout=30).json()
    return {"Authorization":"Bearer "+(t.get("token") or t.get("access_token"))}
W,Hh=0.012,0.008
# (이름, 월, 서쪽, 남쪽, 폭, 높이) — 같은 칸을 새 모델로
AOIS=[("06X1","06",127.356,35.392,W,Hh),("06X2","06",127.584,35.472,W,Hh),("08X","08",127.500,35.392,W,Hh),
      ("08F","08",127.548,35.451,0.012,0.007),("08E","08",127.328,35.466,0.012,0.008),("08D","08",127.404,35.472,0.012,0.008)]
out=open("jobs_new.txt","a",encoding="utf-8")
for name,m,w,s,dw,dh in AOIS:
    e,n=w+dw,s+dh
    aoi={"type":"Polygon","coordinates":[[[w,s],[e,s],[e,n],[w,n],[w,s]]]}
    body={"kind":"infer","model_id":MID,"imagery_id":f"namwon-2025-{m}","card_id":"card-farm","aoi":aoi,"options":{"chip":1024,"conf":0.25,"gentle":True},"label":f"card-farm/retrain-eval/{name}"}
    h=H(); q=httpx.post(B+"/jobs/quote",headers=h,json=body,timeout=120).json()
    print(name,"quote",q.get("allowed"),q.get("shards"),q.get("reasons"),flush=True)
    if q.get("allowed") and "--go" in sys.argv:
        jid=httpx.post(B+"/jobs",headers=h,json=body,timeout=120).json()["job"]["id"]; print(name,jid,flush=True); out.write(f"{name} {jid}\n"); out.flush()
