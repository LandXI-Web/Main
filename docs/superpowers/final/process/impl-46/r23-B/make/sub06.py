import sys,json,time; sys.path.insert(0, r"E:\Land-XI 플랫폼\01. 디자인\server"); sys.stdout.reconfigure(encoding="utf-8")
from landxi_api import config
import httpx
B=f"http://127.0.0.1:{config.API_PORT}/api/v1"
t=httpx.post(B+"/auth/login",json={"realm":"lx","login":"lxadmin@lx.or.kr","password":config.DEV_PASSWORD},timeout=30).json()
h={"Authorization":"Bearer "+(t.get("token") or t.get("access_token"))}
w,s,e,n=127.280,35.368,127.293,35.376
body={"kind":"infer","model_id":"trained/job_01M5SRDTF2XW0K3KKCF0FJDT7D","imagery_id":"namwon-2025-06","aoi":{"type":"Polygon","coordinates":[[[w,s],[e,s],[e,n],[w,n],[w,s]]]},"options":{"chip":1024,"conf":0.25,"gentle":True},"label":"시험 · 후보 경작휴경 · 남원 6월 예시"}
q=httpx.post(B+"/jobs/quote",headers=h,json=body,timeout=120).json(); print(q.get("allowed"),q.get("shards"),q.get("reasons"))
if q.get("allowed") and "--go" in sys.argv:
    r=httpx.post(B+"/jobs",headers=h,json=body,timeout=120).json(); print(r["job"]["id"]); open("jobs06.txt","a").write(r["job"]["id"]+"\n")
