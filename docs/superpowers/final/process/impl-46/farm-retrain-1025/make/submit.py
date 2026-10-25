import sys,json,time; sys.path.insert(0, r"E:\Land-XI 플랫폼\01. 디자인\server"); sys.stdout.reconfigure(encoding="utf-8")
from landxi_api import config
import httpx
B=f"http://127.0.0.1:{config.API_PORT}/api/v1"
def H():
    t=httpx.post(B+"/auth/login",json={"realm":"lx","login":"lxadmin@lx.or.kr","password":config.DEV_PASSWORD},timeout=30).json()
    return {"Authorization":"Bearer "+(t.get("token") or t.get("access_token"))}
W,Hh=0.012,0.008
AOIS=[("06","T1",127.308,35.336),("06","T2",127.608,35.480),("06","V",127.224,35.336),("06","X1",127.356,35.392),("06","X2",127.584,35.472),
      ("08","T",127.344,35.528),("08","V",127.356,35.496),("08","X",127.500,35.392)]
out=open("jobs.txt","a",encoding="utf-8")
for m,name,w,s in AOIS:
    e,n=w+W,s+Hh
    aoi={"type":"Polygon","coordinates":[[[w,s],[e,s],[e,n],[w,n],[w,s]]]}
    body={"kind":"infer","model_id":"namwon/cultivate_uncultivate/train","imagery_id":f"namwon-2025-{m}","card_id":"card-farm","aoi":aoi,
          "options":{"chip":1024,"conf":0.25,"gentle":True},"label":f"card-farm/retrain/{m}/{name}"}
    h=H(); q=httpx.post(B+"/jobs/quote",headers=h,json=body,timeout=120).json()
    print(m,name,"quote",q.get("allowed"),q.get("shards"),q.get("reasons"),flush=True)
    if not q.get("allowed") or not q.get("shards"): continue
    if "--go" in sys.argv:
        jid=httpx.post(B+"/jobs",headers=h,json=body,timeout=120).json()["job"]["id"]; print(m,name,jid,flush=True)
        out.write(f"{m} {name} {jid}\n"); out.flush()
