"""재시작 전 짧은 점검 — 시험 게이트웨이(시험 DB)에서 핵심 GET 이 500 없이 도는지(10-23 · 국토 변화 분석 서비스 이동).
LX_TEST_API_PORT=8712 python docs/superpowers/final/process/impl-46/change-svc/smoke.py
"""
import os
import sys
from pathlib import Path

SERVER = Path(__file__).resolve().parents[6] / "server"
sys.path[:0] = [str(SERVER / "tests"), str(SERVER)]
import testdb  # noqa: E402

S = testdb.apply()
from landxi_api import config  # noqa: E402
import httpx  # noqa: E402

B = f"http://127.0.0.1:{S['port']}/api/v1"
assert testdb.guard(config) is None
t = httpx.post(B + "/auth/login", json={"realm": "lx", "login": "test@lx.or.kr", "password": config.DEV_PASSWORD}, timeout=30).json()["token"]
H = {"Authorization": "Bearer " + t}
bad = []


def get(p, **kw):
    r = httpx.get(B + p, headers=H, timeout=120, **kw)
    print(r.status_code, p)
    if r.status_code >= 500:
        bad.append((p, r.text[:300]))
    return r


pj = get("/projects").json()
items = pj.get("items") or pj.get("projects") or []
for x in items[:8]:
    get(f"/projects/{x['id']}")
    get(f"/release/projects/{x['id']}/infer")
for p in ("/cards/deck", "/me/jobs", "/me/analyses", "/change/ranges", "/change/active", "/registry/models", "/staff/home"):
    get(p)
rg = (get("/change/ranges").json().get("items") or [])
for x in rg[:3]:
    get(f"/change/ranges/{x['id']}/imagery")
print("500:", bad)
sys.exit(1 if bad else 0)
