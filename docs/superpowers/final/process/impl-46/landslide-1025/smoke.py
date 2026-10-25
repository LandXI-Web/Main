"""재시작 전 짧은 점검 — 시험 게이트웨이(시험 DB)에서 핵심 GET 이 500 없이 도는지(10-25 · 결과 장부 찾는 것 · 국토 변화 틀 · 산사태 카드).
LX_TEST_API_PORT=8711 python docs/superpowers/final/process/impl-46/landslide-1025/smoke.py
"""
import json
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
bad, out = [], {}


def get(p):
    r = httpx.get(B + p, headers=H, timeout=180)
    out[p] = r.status_code
    if r.status_code >= 500:
        bad.append((p, r.text[:300]))
    return r


for p in ("/cards/deck", "/cards/card-landslide", "/cards/card-change", "/cards/card-crowd", "/ximap/board", "/me/analyses", "/me/jobs",
          "/change/ranges?brief=1", "/cards/card-ba9d6d/compare/results"):
    get(p)
rg = get("/change/ranges?brief=1").json().get("items") or []
for x in rg[:2]:
    get(f"/change/ranges/{x['id']}/imagery")
print(json.dumps({"status": out, "bad": bad}, ensure_ascii=False, indent=1))
sys.exit(1 if bad else 0)
