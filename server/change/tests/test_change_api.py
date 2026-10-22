"""변화 탐지 API 시험 — 시험 게이트웨이(시험 DB)에서만(LX_TEST_API_PORT · 기본 8710). 작업기는 없으므로 제출까지만 본다.

python -m pytest server/change/tests -q
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve()
SERVER = HERE.parents[2]
sys.path.insert(0, str(SERVER / "tests"))
sys.path.insert(0, str(SERVER))
import testdb  # noqa: E402

S = testdb.apply()
from landxi_api import config  # noqa: E402

import httpx  # noqa: E402

B = f"http://127.0.0.1:{S['port']}/api/v1"
DATA = config.DATA_ROOT / "change" / "inputs"


def _tok(realm="lx", login="test@lx.or.kr", **kw):
    r = httpx.post(B + "/auth/login", json={"realm": realm, "login": login, "password": config.DEV_PASSWORD, **kw}, timeout=30)
    r.raise_for_status()
    return r.json()["token"]


def H(t):
    return {"Authorization": "Bearer " + t}


def _line_file():
    fs = sorted(DATA.glob("*.geojson"))
    assert fs, "02. 데이터/change/inputs 에 구역선 파일이 있어야 함"
    return fs[0]


def test_range_upload_years_and_run_submit():
    assert testdb.guard(config) is None
    t = _tok()
    f = _line_file()
    r = httpx.post(B + "/change/ranges", headers=H(t), files={"file": (f.name, f.read_bytes(), "application/geo+json")},
                   data={"buffer_m": "50", "name": "시험 구역선", "years": "2019,2024"}, timeout=120)
    assert r.status_code == 200, r.text
    rg = r.json()
    assert rg["kind"] == "line" and rg["buffer"] == "50m" and rg["sgg"]
    ys = {y["year"] for y in rg["imagery_years"]}
    assert 2024 in ys
    r = httpx.get(B + f"/change/ranges/{rg['id']}", headers=H(t), timeout=60)
    assert r.status_code == 200 and r.json()["geometry"]["type"] == "MultiPolygon"
    a, b = min(ys), 2024
    r = httpx.post(B + "/change/runs", headers=H(t), json={"range_id": rg["id"], "year_a": a, "year_b": b}, timeout=120)
    assert r.status_code == 202, r.text
    j = r.json()
    assert j["job_id"].startswith("job_") and j["state"] in ("queued", "done")
    # 같은 범위 · 같은 두 해 = 다시 제출하지 않고 같은 작업
    r2 = httpx.post(B + "/change/runs", headers=H(t), json={"range_id": rg["id"], "year_a": b, "year_b": a}, timeout=60)
    assert r2.json()["job_id"] == j["job_id"]
    r = httpx.get(B + f"/change/runs/{j['job_id']}", headers=H(t), timeout=30)
    assert r.status_code == 200 and r.json()["state"] in ("queued", "running", "done")
    httpx.post(B + f"/jobs/{j['job_id']}/cancel", headers=H(t), timeout=30)


def test_same_year_rejected_and_guest_blocked():
    t = _tok()
    r = httpx.get(B + "/change/ranges", headers=H(t), timeout=30)
    assert r.status_code == 200
    items = r.json()["items"]
    if items:
        r = httpx.post(B + "/change/runs", headers=H(t), json={"range_id": items[0]["id"], "year_a": 2024, "year_b": 2024}, timeout=30)
        assert r.status_code == 400
    assert httpx.get(B + "/change/ranges", timeout=30).status_code == 401


def test_pnu_range():
    t = _tok()
    import geopandas as gpd  # noqa: F401
    from change import parcels as P
    lm = P.land_master()
    pn = list(lm.index[:5])
    r = httpx.post(B + "/change/ranges", headers=H(t), json={"name": "시험 PNU", "buffer_m": 20, "pnus": pn}, timeout=180)
    assert r.status_code == 200, r.text
    assert r.json()["kind"] == "pnu"
