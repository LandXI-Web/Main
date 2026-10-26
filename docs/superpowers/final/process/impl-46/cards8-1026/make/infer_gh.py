"""단동다동 새 예시 — 남원 2025.06 드론(남원 전체) · 생산기 예시와 같은 범위(금지면 약 2 km²) · 카드 하한 0.8 · 대기열로.  python infer_gh.py [--go]"""
import sys, json
sys.path.insert(0, r"E:\Land-XI 플랫폼\01. 디자인\server"); sys.stdout.reconfigure(encoding="utf-8")
from landxi_api import config
import httpx
B = f"http://127.0.0.1:{config.API_PORT}/api/v1"
t = httpx.post(B + "/auth/login", json={"realm": "lx", "login": "lxadmin@lx.or.kr", "password": config.DEV_PASSWORD}, timeout=30).json()
H = {"Authorization": "Bearer " + (t.get("token") or t.get("access_token"))}
w, s, e, n = 127.28629, 35.31211, 127.30281, 35.32474
body = {"kind": "infer", "model_id": "namwon/Vinyl_house/train", "imagery_id": "namwon-2025-06", "card_id": "card-6f7050",
        "label": "분석 서비스 · 비닐하우스 단동·다동 분석서비스", "aoi": {"type": "Polygon", "coordinates": [[[w, s], [e, s], [e, n], [w, n], [w, s]]]},
        "options": {"chip": 1024, "overlap": 0.125, "conf": 0.8, "sgg_cd": "52190", "max_km2": 5}}
q = httpx.post(B + "/jobs/quote", headers=H, json=body, timeout=120).json()
print(q.get("allowed"), q.get("reasons"), {k: q.get(k) for k in ("shards", "eta_s")})
if q.get("allowed") and "--go" in sys.argv:
    r = httpx.post(B + "/jobs", headers=H, json=body, timeout=120); print(r.status_code, r.json()["job"]["id"] if r.status_code < 300 else r.text[:300])
