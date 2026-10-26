"""학습 대기열(/jobs kind train)에 '검증만'(options.eval) 또는 후보 학습을 넣는다 — 게이트웨이 견적 → 제출.
  python submit.py eval MODEL[,MODEL] YAML LABEL [--go]
  python submit.py train BASE_MODEL YAML LABEL EPOCHS [--go]"""
import sys, json, time
sys.path.insert(0, r"E:\Land-XI 플랫폼\01. 디자인\server"); sys.stdout.reconfigure(encoding="utf-8")
from landxi_api import config
import httpx
B = f"http://127.0.0.1:{config.API_PORT}/api/v1"
t = httpx.post(B + "/auth/login", json={"realm": "lx", "login": "lxadmin@lx.or.kr", "password": config.DEV_PASSWORD}, timeout=30).json()
H = {"Authorization": "Bearer " + (t.get("token") or t.get("access_token"))}
mode, models, yml, label = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
for mid in models.split(","):
    if mode == "eval":
        body = {"kind": "train", "base_model": mid, "samples": yml, "label": "검증만 · " + label, "options": {"eval": True, "imgsz": 1024, "batch": 4}}
    else:
        body = {"kind": "train", "base_model": mid, "samples": yml, "label": label,
                "options": {"epochs": int(sys.argv[5]), "imgsz": 1024, "batch": 4, "patience": 15, "lr0": 0.002, "warmup_epochs": 1}}
    q = httpx.post(B + "/jobs/quote", headers=H, json=body, timeout=120).json()
    print(mid, q.get("allowed"), q.get("reasons"))
    if q.get("allowed") and "--go" in sys.argv:
        r = httpx.post(B + "/jobs", headers=H, json=body, timeout=120)
        print(r.status_code, r.json()["job"]["id"] if r.status_code < 300 else r.text[:300])
        time.sleep(1)
