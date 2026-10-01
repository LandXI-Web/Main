"""구현 2차 정리 작업(10-01) — 실서버(:8700). GPU 0(분석 · 학습 실행 없음).

· 관리자 계정 하나(사용자 결정 10-01 "관리자 계정은 하나를 유지한다"): 다른 LX 관리자 계정이 없으면 요청한 관리자 계정이 스스로 결재 —
  처리 기록에 '관리자 계정 승인(단일 계정)'. 두 번째 관리자 계정이 있으면 지금처럼 스스로 결재 0.
· 공유 영상(사용자 결정 10-01 "기관에 영상을 공유하면 그 기관 지도에도"): 원본만 있는 LX 영상도 공유하면 그 기관 카탈로그에 서명 지도 조각(cog)으로 ·
  공유 안 된 기관 · 관할 밖은 서명 0.
· 알림 칸의 다른 할 일(화면 잇기): 가입 신청(기관 관리자 = 자기 기관 · LX 관리자 = LX 직원 신청) · 비밀번호 재설정 요청.
· 분석 의뢰 서비스 목록에 카드(서비스 대시보드 → 의뢰 화면 ?service=).
시험이 만든 결재 · 신청 · 공유는 끝에서 처음 상태로 되돌린다.
"""
import math
import secrets

import httpx
import psycopg
import pytest

from conftest import ADMIN_ID, B, BASE, H, drop_account, temp_account
from landxi_api import config

RAW = "img-52190-2020-aerial"            # 남원시 2020 항공영상 — 원본만 있음(타일 없음) · 남원시 관할


def pg():
    return psycopg.connect(config.PG_ADMIN_DSN, autocommit=True)


# ── 관리자 계정 하나 — 스스로 결재(기록) ───────────────────────────────────────────
def test_single_admin_can_decide_own_request_and_it_is_recorded(live, tok):
    c = pg()
    others = c.execute("SELECT count(*) FROM lx_users WHERE role='admin' AND status='active' AND id <> %s", (ADMIN_ID,)).fetchone()[0]
    if others:
        pytest.skip("다른 LX 관리자 계정이 있음 — 단일 계정 규칙 시험 불가")
    a = H(tok["admin"])
    r = httpx.put(B + "/tenants/lx-demo/quota", headers=a, json={"dims": {"egress_gb_month": {"soft": 8, "hard": 9, "policy": "notify"}},
                                                                 "reason": "pytest 정리 단일 관리자"}, timeout=30)
    assert r.status_code == 200, r.text
    aid = r.json()["approval_id"]
    try:
        ap = [x for x in httpx.get(B + "/approvals?state=pending", headers=a, timeout=30).json()["items"] if x["id"] == aid][0]
        assert ap["mine"] is True and ap["can_decide"] is True                          # 결재함에 승인 · 반려 버튼이 선다
        d = httpx.post(B + f"/approvals/{aid}/decide", headers=a, json={"decision": "reject", "reason": "pytest 단일 계정 반려"}, timeout=30)
        assert d.status_code == 200, d.text
        row = c.execute("SELECT decided_by, decision, payload->>'single_admin' FROM approvals WHERE id=%s", (aid,)).fetchone()
        assert row == (ADMIN_ID, "reject", "true")
        done = [x for x in httpx.get(B + "/approvals?state=decided", headers=a, timeout=30).json()["items"] if x["id"] == aid][0]
        assert done["decided_note"] == "관리자 계정 승인(단일 계정)"
        au = c.execute("SELECT after->>'note' FROM audit_log WHERE action='approval.reject' AND subject=%s ORDER BY id DESC LIMIT 1", (aid,)).fetchone()
        assert au and au[0] == "관리자 계정 승인(단일 계정)"
    finally:
        c.execute("DELETE FROM approvals WHERE id=%s", (aid,))
        c.close()


def test_second_admin_keeps_no_self_approval(live, tok):
    """두 번째 관리자 계정이 생기면(정식 오픈 뒤 등) 지금 규칙 그대로 — 요청한 계정은 스스로 결재 0, 다른 관리자가 결재."""
    a = H(tok["admin"])
    uid, t2 = temp_account("lx", "u_pytest_cleanup_admin2", "pytest-cleanup-admin2@lx.or.kr", "admin", name="시험 관리자")
    c = pg()
    aid = None
    try:
        r = httpx.put(B + "/tenants/lx-demo/quota", headers=a, json={"dims": {"egress_gb_month": {"soft": 8, "hard": 9}}, "reason": "pytest 두 관리자"}, timeout=30)
        aid = r.json()["approval_id"]
        ap = [x for x in httpx.get(B + "/approvals?state=pending", headers=a, timeout=30).json()["items"] if x["id"] == aid][0]
        assert ap["mine"] is True and ap["can_decide"] is False
        s = httpx.post(B + f"/approvals/{aid}/decide", headers=a, json={"decision": "reject", "reason": "x"}, timeout=30)
        assert s.status_code == 409 and s.json()["error"]["code"] == "self_approval"
        ok = httpx.post(B + f"/approvals/{aid}/decide", headers=H(t2), json={"decision": "reject", "reason": "pytest 다른 관리자"}, timeout=30)
        assert ok.status_code == 200
        assert c.execute("SELECT payload->>'single_admin' FROM approvals WHERE id=%s", (aid,)).fetchone()[0] is None
    finally:
        if aid:
            c.execute("DELETE FROM approvals WHERE id=%s", (aid,))
        c.close()
        drop_account("lx", uid)


# ── 공유 영상 — 원본만 있는 영상도 공유하면 그 기관 지도에(서명 조각) ───────────────────────
def _share(tok, tenant, on):
    r = httpx.put(B + f"/tenants/{tenant}/imagery-shares/{RAW}", headers=H(tok["admin"]), json={"shared": on}, timeout=30)
    assert r.status_code == 200, r.text


def _cat_ids(t):
    j = httpx.get(B + "/catalog/layers?build=tenant", headers=H(t), timeout=60).json()
    return {i["id"]: i for i in j.get("items", [])}


def _tile_of(fp):
    xs = [p[0] for ring in fp["coordinates"] for p in ring] if fp["type"] == "Polygon" else [p[0] for poly in fp["coordinates"] for ring in poly for p in ring]
    ys = [p[1] for ring in fp["coordinates"] for p in ring] if fp["type"] == "Polygon" else [p[1] for poly in fp["coordinates"] for ring in poly for p in ring]
    lon, lat, z = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, 15
    n = 2 ** z
    return z, int((lon + 180) / 360 * n), int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)


def test_shared_raw_imagery_shows_on_tenant_map_only_when_shared(live, tok):
    c = pg()
    row = c.execute("SELECT tier, ST_AsGeoJSON(footprint)::json FROM imagery WHERE id=%s", (RAW,)).fetchone()
    if not row:
        pytest.skip("남원시 2020 항공영상 없음")
    was = bool(c.execute("SELECT 1 FROM imagery_shares WHERE tenant_id='namwon' AND imagery_id=%s", (RAW,)).fetchone())
    try:
        _share(tok, "namwon", False)
        assert RAW not in _cat_ids(tok["namwon"])                                          # 공유 전 = 기관 지도에 0
        assert httpx.get(BASE + f"/tiles/sign?set=cog/{RAW}", headers=H(tok["namwon"]), timeout=30).status_code == 403
        _share(tok, "namwon", True)
        items = _cat_ids(tok["namwon"])
        it = items.get(RAW)
        assert it and it["source"] == "cog" and it["set"] == f"cog/{RAW}" and it["signed"] is True and not it.get("path")   # 원본 경로 0
        s = httpx.get(BASE + f"/tiles/sign?set=cog/{RAW}", headers=H(tok["namwon"]), timeout=30)
        assert s.status_code == 200 and "/tiles/cog/" + RAW in s.json()["url"] and "sig=" in s.json()["url"]
        if row[1]:                                                                         # 서명 주소로 실제 조각(CPU 렌더 · GPU 0)
            z, x, y = _tile_of(row[1])
            u = s.json()["url"].replace("{z}", str(z)).replace("{x}", str(x)).replace("{y}", str(y))
            u = BASE + u[u.index("/tiles/"):]
            t = httpx.get(u, timeout=120)
            assert t.status_code in (200, 204) and (t.status_code == 204 or t.headers["content-type"] == "image/webp")
        # 다른 기관(공유 안 됨 · 관할 밖) = 서명 0 · 카탈로그 0
        assert httpx.get(BASE + f"/tiles/sign?set=cog/{RAW}", headers=H(tok["gj"]), timeout=30).status_code == 403
        assert RAW not in _cat_ids(tok["gj"])
        assert httpx.get(BASE + f"/tiles/cog/{RAW}/15/0/0.webp", timeout=30).status_code == 403                 # 서명 없이 = 0
    finally:
        _share(tok, "namwon", was)
        c.close()


# ── 알림 칸의 다른 할 일 ─────────────────────────────────────────────────────────────
def test_notify_extra_signup_and_reset(live, tok):
    c = pg()
    login_t, login_l = f"pytest-cl-{secrets.token_hex(3)}@namwon.go.kr", f"pytest-cl-{secrets.token_hex(3)}@lx.or.kr"
    pw = "Cl" + secrets.token_hex(6) + "9z"
    xff = lambda: {"x-forwarded-for": f"2001:db8::{secrets.token_hex(2)}:{secrets.token_hex(2)}"}   # noqa: E731
    try:
        for login, body in ((login_t, {"site": "gov", "tenant_id": "namwon"}), (login_l, {"site": "app"})):
            r = httpx.post(B + "/accounts/signup", headers=xff(), json={**body, "name": "정리 시험", "login": login, "password": pw, "password2": pw,
                                                                         "dept": "시험과", "consent": True}, timeout=30)
            assert r.status_code == 201, r.text
        ex = {x["kind"]: x for x in httpx.get(B + "/reviews/notify", headers=H(tok["namwon"]), timeout=30).json()["extra"]}
        assert ex["signup"]["n"] >= 1 and ex["signup"]["href"] == "/landxi/v3/gov-accounts/#signup"      # 기관 관리자 = 자기 기관 신청
        n_t = ex["signup"]["n"]
        exa = {x["kind"]: x for x in httpx.get(B + "/reviews/notify", headers=H(tok["admin"]), timeout=30).json()["extra"]}
        assert exa["signup"]["n"] >= 1 and exa["signup"]["href"] == "/landxi/v3/ops-accounts/#signup"   # LX 관리자 = LX 직원 신청만(기관 신청 승인 0)
        lx_pending = c.execute("SELECT count(*) FROM signup_requests WHERE state='pending' AND realm='lx'").fetchone()[0]
        assert exa["signup"]["n"] == lx_pending
        assert httpx.get(B + "/reviews/notify", headers=H(tok["staff"]), timeout=30).json().get("extra", []) == [] or \
            all(x["kind"] == "request" for x in httpx.get(B + "/reviews/notify", headers=H(tok["staff"]), timeout=30).json()["extra"])
        gj = {x["kind"]: x for x in httpx.get(B + "/reviews/notify", headers=H(tok["gj"]), timeout=30).json()["extra"]}
        assert gj.get("signup", {}).get("n", 0) == c.execute("SELECT count(*) FROM signup_requests WHERE state='pending' AND tenant_id='gwangju-jeonnam'").fetchone()[0]
        assert n_t == c.execute("SELECT count(*) FROM signup_requests WHERE state='pending' AND tenant_id='namwon'").fetchone()[0]
    finally:
        c.execute("DELETE FROM signup_requests WHERE login IN (%s, %s)", (login_t, login_l))
        c.execute("DELETE FROM audit_log WHERE action LIKE 'account.%%' AND subject IN (%s, %s)", (login_t, login_l))
        c.close()


def test_request_services_carry_card(live, tok):
    j = httpx.get(B + "/requests/services", headers=H(tok["namwon"]), timeout=60).json()
    assert j["items"] and all("card" in x and "sgg_cd" in x for x in j["items"])
    assert {x["card"] for x in j["items"]} & {"card-farm", "card-living", "card-road", "card-change"}
