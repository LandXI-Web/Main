"""분석 구간(모든 카드 고급 기능 · 10-24) 시험 — 시험 게이트웨이(시험 DB · :8710)에서만.

python -m pytest server/change/tests/test_range_tools.py -q
"""
from __future__ import annotations

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
import psycopg  # noqa: E402

B = f"http://127.0.0.1:{S['port']}/api/v1"
DATA = config.DATA_ROOT / "change" / "inputs"


def _tok(login="test@lx.or.kr"):
    r = httpx.post(B + "/auth/login", json={"realm": "lx", "login": login, "password": config.DEV_PASSWORD}, timeout=30)
    r.raise_for_status()
    return r.json()["token"]


def H(t):
    return {"Authorization": "Bearer " + t}


def _done_job():
    """시험 DB 의 끝난 카드 결과 하나(결과가 있는 것) — 관리자가 연다(배포 신청 검토와 같은 판정)."""
    with psycopg.connect(config.PG_ADMIN_DSN) as c:
        r = c.execute("SELECT j.id, j.options->>'sgg_cd' FROM jobs j WHERE j.state='done' AND j.card_id IS NOT NULL AND j.snapshot_ready "
                      "AND j.options->>'sgg_cd' IS NOT NULL AND EXISTS(SELECT 1 FROM detections d WHERE d.job_id=j.id) "
                      "ORDER BY j.finished_at DESC LIMIT 1").fetchone()
    return r


def test_upload_buffer_reuse_and_change_same_ledger():
    assert testdb.guard(config) is None
    t = _tok()
    f = sorted(DATA.glob("*.geojson"))[0]
    up = lambda b: httpx.post(B + "/ranges", headers=H(t), files={"file": (f.name, f.read_bytes(), "application/geo+json")},  # noqa: E731
                              data={"buffer_m": str(b), "name": "시험 구간", "origin": "card"}, timeout=120)
    a = up(100)
    assert a.status_code == 200, a.text
    a = a.json()
    assert a["word"] == "구간: 시험 구간 · 100m" and a["buffer"] == "100m" and a["geometry"]["type"] == "MultiPolygon"
    again = up(100).json()
    assert again["id"] == a["id"]                                  # 같은 모양 · 같은 거리 = 같은 구간(다시 만들지 않음)
    z = up(0).json()
    assert z["id"] != a["id"] and z["word"] == "구간: 시험 구간"
    big = up(5000).json()
    assert big.get("buffer") == "1000m" or "넓" in big["error"]["message"]   # 상한 1,000m(그래도 넓으면 나눠 달라고)
    # 국토 변화 대상지도 같은 표 · 같은 함수(목록에 보임)
    r = httpx.get(B + f"/change/ranges/{a['id']}", headers=H(t), params={"years": 0}, timeout=60)
    assert r.status_code == 200 and r.json()["id"] == a["id"]


def test_region_emd_range():
    t = _tok()
    r = httpx.post(B + "/ranges", headers=H(t), json={"regions": ["52190101"], "origin": "card"}, timeout=120)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["kind"] == "region" and d["sgg"] == ["52190"] and d["word"].startswith("구간: 남원시")
    r2 = httpx.post(B + "/ranges", headers=H(t), json={"regions": ["52190101"], "origin": "card"}, timeout=120).json()
    assert r2["id"] == d["id"]
    bad = httpx.post(B + "/ranges", headers=H(t), json={"regions": ["99999"], "origin": "card"}, timeout=60)
    assert bad.status_code == 400


def test_split_inside_outside_and_ledger():
    j = _done_job()
    if not j:
        import pytest
        pytest.skip("시험 DB 에 끝난 카드 결과 없음")
    job, sgg = j
    t = _tok("lxadmin@lx.or.kr")
    with psycopg.connect(config.PG_ADMIN_DSN) as c:
        emd = c.execute("SELECT emd_cd FROM detections WHERE job_id=%s AND emd_cd IS NOT NULL GROUP BY emd_cd ORDER BY count(*) DESC LIMIT 1", (job,)).fetchone()[0]
        total = c.execute("SELECT count(*) FROM detections WHERE job_id=%s AND edit_state<>'deleted'", (job,)).fetchone()[0]
    rg = httpx.post(B + "/ranges", headers=H(t), json={"regions": [emd], "origin": "card"}, timeout=120).json()
    s = httpx.get(B + f"/ranges/{rg['id']}/split", headers=H(t), params={"job": job, "parcels": 1}, timeout=300)
    assert s.status_code == 200, s.text
    s = s.json()
    i, o = s["inside"]["n"]["value"], s["outside"]["n"]["value"]
    assert i > 0 and i + o <= total
    assert s["parcels"] is not None and s["parcels"]["n"]["value"] >= 0
    s2 = httpx.get(B + f"/ranges/{rg['id']}/split", headers=H(t), params={"job": job, "parcels": 1}, timeout=60).json()
    assert s2["cached"] and s2["inside"]["n"]["value"] == i     # 한 번 세고 다시 쓴다
    ids = httpx.get(B + f"/ranges/{rg['id']}/inside", headers=H(t), params={"job": job}, timeout=120).json()
    assert ids["n"] == i
    # 남의 결과는 직원에게 없음
    r = httpx.get(B + f"/ranges/{rg['id']}/split", headers=H(_tok()), params={"job": job}, timeout=60)
    assert r.status_code == 404


def test_card_analyze_with_range_records_word():
    """고급 기능으로 분석 시작 — 작업 기록에 구간 · 필지 단위 집계, 이름표에 '구간: 이름'(작업기는 없으므로 제출까지만)."""
    t = _tok()
    rg = httpx.post(B + "/ranges", headers=H(t), json={"regions": ["52190101"], "origin": "card"}, timeout=120).json()
    deck = httpx.get(B + "/cards/deck", headers=H(t), timeout=60).json()
    cards = [c for c in (deck.get("items") or deck.get("cards") or []) if c.get("can_analyze") and c.get("id") not in ("card-change",)]
    for c in cards:
        f = httpx.get(B + f"/cards/{c['id']}/fit", headers=H(t), params={"region": "52190"}, timeout=60).json()
        if f.get("fits") and not f.get("running"):
            break
    else:
        import pytest
        pytest.skip("시험 DB 에 남원시를 분석할 수 있는 카드 없음")
    r = httpx.post(B + f"/cards/{c['id']}/analyze", headers=H(t), json={"range": {"id": rg["id"]}, "parcels": True}, timeout=120)
    assert r.status_code == 202, r.text
    d = r.json()
    if d.get("started"):
        assert d["range"]["word"].startswith("구간: 남원시") and d["region"] == "52190"
        with psycopg.connect(config.PG_ADMIN_DSN, autocommit=True) as cn:
            o, lb, jid = cn.execute("SELECT options, label, id FROM jobs WHERE card_id=%s ORDER BY created_at DESC LIMIT 1", (c["id"],)).fetchone()
            assert o["range"]["id"] == rg["id"] and o["parcels"] is True and "구간: 남원시" in lb
            cn.execute("UPDATE jobs SET state='cancelled', test=true WHERE id=%s", (jid,))
    # 다른 지역의 구간은 거절
    bad = httpx.post(B + f"/cards/{c['id']}/analyze", headers=H(t), json={"region": "11110", "range": {"id": rg["id"]}}, timeout=120)
    assert bad.status_code in (400, 404, 409)
