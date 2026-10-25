import sys,json; sys.path.insert(0, r"E:\Land-XI 플랫폼\01. 디자인\server"); sys.stdout.reconfigure(encoding="utf-8")
from landxi_api import config
import httpx
B=f"http://127.0.0.1:{config.API_PORT}/api/v1"
t=httpx.post(B+"/auth/login",json={"realm":"lx","login":"lxadmin@lx.or.kr","password":config.DEV_PASSWORD},timeout=30).json()
H={"Authorization":"Bearer "+(t.get("token") or t.get("access_token"))}
EP=int(sys.argv[1]) if len(sys.argv)>1 else 12
body={"kind":"train","base_model":"namwon/cultivate_uncultivate/train","samples":"E:/Land-XI 플랫폼/02. 데이터/training/farm-retrain-1025/dataset.yaml",
      "label":"경작·휴경 교정 학습(10-25)","options":{"epochs":EP,"imgsz":1024,"batch":4,"task_name":"경작·휴경 교정 학습 · 남원",
      "hp":{"optimizer":"SGD","lr0":0.002,"lrf":0.2,"warmup_epochs":1,"freeze":10,"close_mosaic":3}}}
q=httpx.post(B+"/jobs/quote",headers=H,json=body,timeout=120).json(); print(json.dumps({k:q.get(k) for k in ("allowed","reasons","shards","kind","pool")},ensure_ascii=False))
if q.get("allowed") and "--go" in sys.argv:
    r=httpx.post(B+"/jobs",headers=H,json=body,timeout=120); print(r.status_code, r.json()["job"]["id"] if r.status_code<300 else r.text[:300])
