"""impl-14 바퀴 3(10-11 12:07 now 답) — 분석하기 영상 하나만(원칙 185) · 자동 로그아웃 시간(원칙 188 · 177) · 연장. GPU 0.

문의 두 칸(메인-3)은 test_impl13_inquiries · 대표 그림 필수(원칙 186)는 test_release · 공개 뒤 결과 확인 남은 일(QA-Q11)은 test_impl2_project.
자동 로그아웃 줄이기 시험은 시험 계정만 있는 기관(kgz-land)에서 하고 끝나면 설정 줄을 지운다(기본 24시간으로).
"""
import datetime as dt

import httpx
import psycopg
import pytest

from conftest import B, H, drop_account, temp_account
from landxi_api import config


def test_analyze_one_imagery_only(live, tok):
    """영상 · 지역은 한 개씩만 — 목록 · 쉼표 묶음 · 여러 개 칸은 서버가 거절(대기열에 넣지 않는다)."""
    s = H(tok["staff"])
    for body in ({"region": "52190", "imagery": ["a", "b"]}, {"region": "52190", "imagery": "a,b"},
                 {"region": ["52190", "51130"]}, {"region": "52190", "imageries": ["a"]}):
        r = httpx.post(B + "/cards/card-5e85a9/analyze", headers=s, json=body, timeout=60)
        assert r.status_code == 400 and r.json()["error"]["detail"]["field"] == "imagery", (body, r.text)


def test_session_policy_scope(live, tok):
    """설정은 각자 범위만(원칙 177) — LX 관리자 = LX · 기관 관리자 = 자기 기관 · 직원 · 영업은 거절. 목록 밖 값은 거절."""
    a = httpx.get(B + "/accounts/session-policy", headers=H(tok["admin"]), timeout=30).json()
    assert a["scope"] == "lx" and a["minutes"] in [o["minutes"] for o in a["options"]]
    n = httpx.get(B + "/accounts/session-policy", headers=H(tok["namwon"]), timeout=30).json()
    assert n["scope"] == "tenant"
    for t in (tok["staff"], tok["sales"]):
        assert httpx.get(B + "/accounts/session-policy", headers=H(t), timeout=30).status_code == 403
        assert httpx.put(B + "/accounts/session-policy", headers=H(t), json={"minutes": 60}, timeout=30).status_code == 403
    r = httpx.put(B + "/accounts/session-policy", headers=H(tok["namwon"]), json={"minutes": 45}, timeout=30)
    assert r.status_code == 400 and r.json()["error"]["detail"]["field"] == "minutes"


def test_session_now_and_extend(live, tok):
    """머리줄 시계 값 = 서버 세션 끝나는 시각 · 연장하면 지금부터 설정 시간만큼."""
    j = httpx.get(B + "/auth/session", headers=H(tok["staff"]), timeout=30).json()
    assert j["expires_at"] and j["minutes"] and j["word"]
    e = httpx.post(B + "/auth/extend", headers=H(tok["staff"]), timeout=30).json()
    left = dt.datetime.fromisoformat(e["expires_at"]) - dt.datetime.now(dt.timezone.utc)
    assert abs(left.total_seconds() - int(e["minutes"]) * 60) < 120
    assert httpx.post(B + "/auth/extend", timeout=30).status_code in (401, 403)          # 로그인 없음


def test_session_policy_follows(live):
    """기관 관리자가 30분으로 줄이면 — 지금 열린 그 기관 세션도 30분 안으로 · 새 로그인도 30분 · 다른 기관 · LX 는 그대로."""
    uid = "u_pytest_sess_mgr"
    _, t = temp_account("tenant", uid, "pytest-sess@lx.or.kr", "manager", tenant_id="kgz-land", name="시험 담당자")
    try:
        r = httpx.put(B + "/accounts/session-policy", headers=H(t), json={"minutes": 30}, timeout=30)
        assert r.status_code == 200 and r.json()["minutes"] == "30", r.text
        j = httpx.get(B + "/auth/session", headers=H(t), timeout=30).json()
        left = dt.datetime.fromisoformat(j["expires_at"]) - dt.datetime.now(dt.timezone.utc)
        assert left.total_seconds() <= 30 * 60 + 5 and j["minutes"] == "30"
        r = httpx.post(B + "/auth/login", json={"realm": "tenant", "tenant_id": "kgz-land", "login": "pytest-sess@lx.or.kr",
                                                 "password": config.DEV_PASSWORD, "site": "gov"}, timeout=30).json()
        assert r["minutes"] == "30"
    finally:
        with psycopg.connect(config.PG_ADMIN_DSN, autocommit=True) as c:
            c.execute("DELETE FROM session_policy WHERE scope='kgz-land'")
        drop_account("tenant", uid)
