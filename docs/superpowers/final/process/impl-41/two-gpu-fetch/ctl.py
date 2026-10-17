"""LX 관리자 로그인 세션(관리자 API)으로만: python ctl.py pause | resume | fetch N | progress"""
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
cmd = sys.argv[1] if len(sys.argv) > 1 else "progress"
if cmd in ("pause", "resume"):
    r = s.put(B + "/national/settings", headers=h, json={"enabled": cmd == "resume"}, timeout=30)
    print(r.status_code, json.dumps(r.json(), ensure_ascii=False)[:300])
elif cmd == "fetch":
    r = s.put(B + "/national/settings", headers=h, json={"fetch_max": int(sys.argv[2])}, timeout=30)
    print(r.status_code, json.dumps(r.json(), ensure_ascii=False)[:300])
j = s.get(B + "/national/progress", headers=h, timeout=60).json()
out = {k: j.get(k) for k in ("enabled", "schedule", "runner")}
out["assets"] = {a: {k: (v or {}).get(k) for k in ("pct", "done_km2", "target_km2", "days_left", "on")} for a, v in (j.get("assets") or {}).items()} \
    if isinstance(j.get("assets"), dict) else j.get("assets")
print(json.dumps(out, ensure_ascii=False, default=str)[:2500])
