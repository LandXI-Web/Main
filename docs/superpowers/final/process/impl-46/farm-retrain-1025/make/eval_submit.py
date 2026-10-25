import sys,json; sys.path.insert(0, r"E:\Land-XI 플랫폼\01. 디자인\server"); sys.stdout.reconfigure(encoding="utf-8")
from landxi_api import config
import httpx
B=f"http://127.0.0.1:{config.API_PORT}/api/v1"
t=httpx.post(B+"/auth/login",json={"realm":"lx","login":"lxadmin@lx.or.kr","password":config.DEV_PASSWORD},timeout=30).json()
H={"Authorization":"Bearer "+(t.get("token") or t.get("access_token"))}
yml="E:/Land-XI 플랫폼/02. 데이터/training/farm-retrain-1025/"+sys.argv[2]
for mid in sys.argv[1].split(","):
    body={"kind":"train","base_model":mid,"samples":yml,"label":"검증만 · "+sys.argv[2],"options":{"eval":True,"imgsz":1024,"batch":4}}
    q=httpx.post(B+"/jobs/quote",headers=H,json=body,timeout=120).json(); print(mid,q.get("allowed"),q.get("reasons"))
    if q.get("allowed") and "--go" in sys.argv:
        r=httpx.post(B+"/jobs",headers=H,json=body,timeout=120); print(r.status_code,r.json()["job"]["id"] if r.status_code<300 else r.text[:200])
        import time
        if len(sys.argv[1].split(","))>1: time.sleep(1)
