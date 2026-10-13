"""LX 관리자 로그인 세션으로 fetch_max 바꾸기(관리자 API) · 진행 응답 일정 보기. python put.py [N]"""
import json, sys
import requests
sys.path.insert(0, r"E:/Land-XI 플랫폼/01. 디자인/server")
from national.common import env_file

B = "http://127.0.0.1:8700/api/v1"
e = env_file()
s = requests.Session()
r = s.post(B + "/auth/login", json={"realm": "lx", "login": e.get("LX_ADMIN_LOGIN") or "lxadmin@lx.or.kr", "password": e["DEV_PASSWORD"]}, timeout=30)
r.raise_for_status()
h = {"Authorization": "Bearer " + r.json()["token"]}
sys.stdout.reconfigure(encoding="utf-8")
if len(sys.argv) > 1:
    r = s.put(B + "/national/settings", headers=h, json={"fetch_max": int(sys.argv[1])}, timeout=30)
    print(r.status_code, json.dumps(r.json(), ensure_ascii=False)[:400])
j = s.get(B + "/national/progress", headers=h, timeout=60).json()
print(json.dumps({k: j.get(k) for k in ("schedule", "speed", "runner")}, ensure_ascii=False)[:1500])
for a in j.get("assets", []):
    print(json.dumps({k: a.get(k) for k in ("asset", "on", "pct", "done_km2", "target_km2", "days_left", "schedule")}, ensure_ascii=False)[:600])
