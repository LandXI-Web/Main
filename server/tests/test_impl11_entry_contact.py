"""impl-11 — 로그인 기록의 입구(나중 17) · 운영 정보 문의 연락처(원칙 170). GPU 0.

· 로그인 성공 기록(audit_log 'login')에 입구(app · admin · gov) · 주소 이름 · 접속 주소가 남고, GET /accounts/logins 가 사람 말로 내준다.
  LX 관리자 = 전부 · 기관 관리자 = 자기 기관 계정만 · 직원 403. 계정 목록의 '최근 로그인'에도 입구가 붙는다.
· 문의 연락처: GET /public/contact(로그인 없이) · GET/PUT /accounts/contact(LX 관리자만) · 바꾸면 처리 기록에 남는다. 시험 뒤 원래 값으로 되돌린다.
"""
import json
import secrets

import httpx
import psycopg
import pytest

from conftest import ADMIN_ID, ADMIN_LOGIN, B, H, TENANT_ID, TENANT_LOGIN
from landxi_api import config


def pg():
    return psycopg.connect(config.PG_ADMIN_DSN, autocommit=True)


def doc_ip():
    return f"2001:db8::{secrets.token_hex(2)}:{secrets.token_hex(2)}"


def outside_login(body, site, host):
    xff = doc_ip()
    r = httpx.post(B + "/auth/login", json={**body, "password": config.DEV_PASSWORD},
                   headers={"x-forwarded-for": xff, "x-lx-site": site, "x-forwarded-host": host}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"], xff


def test_login_entry_recorded_and_listed(live, tok):
    t_admin, ip_a = outside_login({"realm": "lx", "login": ADMIN_LOGIN}, "admin", "admin.land-xi.dev")
    t_nw, ip_n = outside_login({"realm": "tenant", "tenant_id": "namwon", "login": TENANT_LOGIN}, "gov", "namwon.land-xi.dev")
    items = httpx.get(B + "/accounts/logins", headers=H(tok["admin"]), timeout=30).json()["items"]
    a = next(x for x in items if x["ip"] == ip_a)
    assert a["site_ko"] == "LX 관리자" and a["host"] == "admin.land-xi.dev" and a["org"] == "LX" and a["login"] == ADMIN_LOGIN
    n = next(x for x in items if x["ip"] == ip_n)
    assert n["site_ko"] == "기관 · 남원시" and n["host"] == "namwon.land-xi.dev" and "남원시" in n["org"]
    inside = [x for x in items if x["ip"] == "이 PC" and x["site_ko"] != "—"]
    assert all(x["site_ko"] == "이 PC" for x in inside)                       # 이 PC 안 로그인(시험 · 개발)은 '이 PC'
    # 기관 관리자 = 자기 기관 계정의 로그인만 · 직원은 못 본다
    mine = httpx.get(B + "/accounts/logins", headers=H(tok["namwon"]), timeout=30).json()["items"]
    assert mine and len({x["org"] for x in mine}) == 1 and "남원시" in mine[0]["org"] and any(x["ip"] == ip_n for x in mine)
    assert httpx.get(B + "/accounts/logins", headers=H(tok["staff"]), timeout=30).status_code == 403
    # 계정 목록 '최근 로그인'에 입구
    us = httpx.get(B + "/accounts/users?realm=tenant&tenant_id=namwon", headers=H(tok["admin"]), timeout=30).json()["items"]
    me = next(x for x in us if x["id"] == TENANT_ID["namwon"])
    assert me["last_login_where"] == "기관 · 남원시"
    for t in (t_admin, t_nw):
        httpx.post(B + "/auth/logout", headers=H(t), timeout=10)


def test_login_record_has_no_password(live):
    c = pg()
    rows = c.execute("SELECT after FROM audit_log WHERE action='login' AND after IS NOT NULL ORDER BY id DESC LIMIT 20").fetchall()
    c.close()
    flat = json.dumps([r[0] for r in rows], ensure_ascii=False)
    assert rows and config.DEV_PASSWORD not in flat and "pw" not in flat


@pytest.fixture
def keep_contact():
    c = pg()
    row = c.execute("SELECT value, updated_by, updated_at FROM lx_settings WHERE key='ops.contact'").fetchone()
    c.close()
    yield
    c = pg()
    if row is None:
        c.execute("DELETE FROM lx_settings WHERE key='ops.contact'")
    else:
        c.execute("UPDATE lx_settings SET value=%s, updated_by=%s, updated_at=%s WHERE key='ops.contact'",
                  (json.dumps(row[0], ensure_ascii=False), row[1], row[2]))
    c.execute("DELETE FROM audit_log WHERE action='account.contact' AND after->>'reason' LIKE '%%010-0000-1234%%'")
    c.close()


def test_contact_public_and_admin_change(live, tok, keep_contact):
    pub = httpx.get(B + "/public/contact", timeout=10)
    assert pub.status_code == 200 and pub.json()["tel"] and "@" in pub.json()["mail"]      # 로그인 없이
    before = pub.json()
    cur = httpx.get(B + "/accounts/contact", headers=H(tok["admin"]), timeout=10).json()
    assert cur["default"] == {"tel": "063-713-1218", "mail": "landxi@lx.or.kr"}
    assert httpx.get(B + "/accounts/contact", headers=H(tok["staff"]), timeout=10).status_code == 403
    assert httpx.put(B + "/accounts/contact", json={"tel": "010-0000-1234", "mail": "a@b.kr"}, headers=H(tok["staff"]), timeout=10).status_code == 403
    assert httpx.put(B + "/accounts/contact", json={"tel": "전화", "mail": "a@b.kr"}, headers=H(tok["admin"]), timeout=10).status_code == 400
    assert httpx.put(B + "/accounts/contact", json={"tel": "010-0000-1234", "mail": "메일"}, headers=H(tok["admin"]), timeout=10).status_code == 400
    r = httpx.put(B + "/accounts/contact", json={"tel": "010-0000-1234", "mail": before["mail"]}, headers=H(tok["admin"]), timeout=10)
    assert r.status_code == 200
    assert httpx.get(B + "/public/contact", timeout=10).json()["tel"] == "010-0000-1234"
    got = httpx.get(B + "/accounts/contact", headers=H(tok["admin"]), timeout=10).json()
    assert got["updated_at"] and got["updated_name"]
    log = httpx.get(B + "/accounts/log", headers=H(tok["admin"]), timeout=10).json()["items"]
    assert any(x["action"] == "account.contact" and "010-0000-1234" in (x["reason"] or "") for x in log)
