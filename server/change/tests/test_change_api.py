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


def _done_run():
    """시험 DB 의 끝난 결과 하나(시험 게이트웨이에는 작업기가 없다 — 미리 넣어 둔 결과 · 없으면 건너뜀)."""
    import psycopg
    with psycopg.connect(config.PG_ADMIN_DSN) as c:
        r = c.execute("SELECT job_id FROM change_runs WHERE state='done' ORDER BY done_at DESC LIMIT 1").fetchone()
    return r[0] if r else None


def test_marks_photo_report():
    import pytest
    job = _done_run()
    if not job:
        pytest.skip("끝난 결과 없음")
    t = _tok()
    fc = httpx.get(B + f"/change/runs/{job}/features", headers=H(t), timeout=60).json()
    fid = fc["features"][0]["id"]
    r = httpx.patch(B + f"/change/runs/{job}/marks/{fid}", headers=H(t), json={"status": "현장확인", "memo": "시험"}, timeout=30)
    assert r.status_code == 200 and r.json()["status"] == "현장확인", r.text
    assert httpx.patch(B + f"/change/runs/{job}/marks/{fid}", headers=H(t), json={"status": "모름"}, timeout=30).status_code == 400
    import io
    from PIL import Image
    b = io.BytesIO(); Image.new("RGB", (64, 48), (200, 10, 10)).save(b, "JPEG")
    r = httpx.post(B + f"/change/runs/{job}/marks/{fid}/photos", headers=H(t), files={"file": ("a.jpg", b.getvalue(), "image/jpeg")}, timeout=30)
    assert r.status_code == 200, r.text
    m = httpx.get(B + f"/change/runs/{job}/marks/{fid}", headers=H(t), timeout=30).json()
    assert m["photos"] and m["history"]
    ph = httpx.get(B + f"/change/runs/{job}/photos/{fid}/{m['photos'][0]['name']}", headers=H(t), timeout=30)
    assert ph.status_code == 200 and ph.headers["content-type"] == "image/jpeg"
    rj = httpx.get(B + f"/change/runs/{job}/report.json", headers=H(t), timeout=60)
    assert rj.status_code == 200, rj.text
    assert rj.json()["status"]["현장확인"]["value"] >= 1 and rj.json()["recommend"]
    pdf = httpx.get(B + f"/change/runs/{job}/report.pdf", headers=H(t), timeout=120)
    assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF", pdf.text[:300]
    httpx.patch(B + f"/change/runs/{job}/marks/{fid}", headers=H(t), json={"status": "미확인", "memo": ""}, timeout=30)


def test_tenant_share_dashboard():
    """기관 공유(서비스 단위 체크) → 그 기관이 대상지 · 결과 · 판정을 본다 · 거두면 0."""
    import pytest
    import psycopg
    job = _done_run()
    with psycopg.connect(config.PG_ADMIN_DSN) as c:
        has = c.execute("SELECT 1 FROM tenants WHERE id='kec'").fetchone()
        if not job or not has:
            pytest.skip("끝난 결과 · 시험 기관 없음")
        rid = c.execute("SELECT range_id FROM change_runs WHERE job_id=%s", (job,)).fetchone()[0]
        c.execute("UPDATE change_ranges SET project_id=coalesce(project_id, 'prj_test_change') WHERE id=%s", (rid,))
        c.commit()
    adm = _tok(login="lxadmin@lx.or.kr")
    r = httpx.put(B + "/release/shares", headers=H(adm), json={"card_id": "card-change", "tenant_id": "kec", "shared": True, "test": True}, timeout=60)
    assert r.status_code == 200, r.text
    tt = _tok(realm="tenant", login="lxadmin@lx.or.kr", tenant_id="kec", site="gov")
    sh = httpx.get(B + "/change/shared", headers=H(tt), timeout=60).json()
    assert any(x["job_id"] == job for x in sh["items"]), sh
    assert httpx.get(B + f"/change/runs/{job}/report.json", headers=H(tt), timeout=60).status_code == 200
    r = httpx.put(B + "/release/shares", headers=H(adm), json={"card_id": "card-change", "tenant_id": "kec", "shared": False, "test": True}, timeout=60)
    sh = httpx.get(B + "/change/shared", headers=H(tt), timeout=60).json()
    assert not sh["items"]
    assert httpx.get(B + f"/change/runs/{job}", headers=H(tt), timeout=60).status_code == 404


def test_same_range_reuses_result():
    """같은 구역선 · 같은 버퍼를 새 프로젝트로 다시 올리면 계산을 다시 하지 않고 끝난 결과를 이어 붙인다(새 결과 번호 · 판정은 새로)."""
    import pytest
    import psycopg
    with psycopg.connect(config.PG_ADMIN_DSN) as c:
        r = c.execute("SELECT g.source_name, g.buffer_m FROM change_runs x JOIN change_ranges g ON g.id=x.range_id "
                      "WHERE x.state='done' AND x.year_a=2019 AND x.year_b=2024 AND g.kind='line' ORDER BY x.done_at DESC LIMIT 1").fetchone()
    if not r or not r[0] or not (DATA / r[0]).exists():
        pytest.skip("구역선 파일로 만든 끝난 결과 없음")
    t = _tok()
    f = DATA / r[0]
    rg = httpx.post(B + "/change/ranges", headers=H(t), files={"file": (f.name, f.read_bytes(), "application/geo+json")},
                    data={"buffer_m": str(int(float(r[1]))), "name": "시험 같은 대상지"}, timeout=120).json()
    j = httpx.post(B + "/change/runs", headers=H(t), json={"range_id": rg["id"], "year_a": 2019, "year_b": 2024}, timeout=120).json()
    assert j["cached"] is True and j["state"] == "done", j
    fc = httpx.get(B + f"/change/runs/{j['job_id']}/features", headers=H(t), timeout=60).json()
    assert fc["features"]
