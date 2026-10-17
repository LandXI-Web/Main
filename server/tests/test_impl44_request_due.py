"""분석 요청 '희망 완료일'(10-18 제안-희망완료일) — 지난 날짜 · 잘못된 날짜 · 너무 먼 날짜는 요청이 만들어지기 전에 막힌다. 요청은 만들지 않는다."""
import datetime as dt

import httpx
import psycopg

from conftest import B, H, _login
from landxi_api import config


def _nw():
    return _login({"realm": "tenant", "tenant_id": "namwon", "login": "lxadmin@lx.or.kr", "password": config.DEV_PASSWORD, "site": "gov"})


def test_due_column_exists():
    with psycopg.connect(config.PG_ADMIN_DSN, autocommit=True) as c:
        n = c.execute("SELECT count(*) FROM information_schema.columns WHERE table_name='analysis_requests' AND column_name='due_date'").fetchone()[0]
    assert n == 1


def test_due_rejected_before_create(live):
    t = _nw()
    today = dt.date.today()
    base = {"service_id": "x", "source": "shared", "imagery_id": "x"}
    for bad, word in [((today - dt.timedelta(days=1)).isoformat(), "오늘 이후"), ("아무 날", "날짜로"), ((today + dt.timedelta(days=900)).isoformat(), "멀리")]:
        r = httpx.post(B + "/requests", headers=H(t), json={**base, "due_date": bad}, timeout=60)
        assert r.status_code == 400 and word in r.json()["error"]["message"], (bad, r.text)
