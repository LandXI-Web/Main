"""구현 2차 T5 계정 — 가입 신청 → 승인 → 로그인 · 반려 사유 · 아이디 찾기(가림 · 시도 제한) · 재설정 → 임시 비밀번호 → 바꾸기 강제 ·
기관 관리자는 자기 기관만 · LX 관리자는 전부 · 잠금 · 바깥 주소 로그인 시도 제한. 실서버(:8700).

확인 대장: FR-4(계정 — 확인) · D4-ⓑ(가입 신청 + 승인 — 확인) · 원칙 72 · 77.
메일 계정(lxadmin@lx.or.kr · 각 기관 lxadmin@lx.or.kr)은 관리자 역할로만 쓰고 바꾸지 않는다. 옛 아이디는 사용 중지(로그인 0 · 바꾸기 0).
LX 관리자는 기관 가입 신청을 보기만 한다(승인 · 반려 0 — 원칙 72 · 서버 403 tenant_signup). 시험 계정은 시험 안에서 만들고(비밀번호도 시험 안에서 새로) 끝에서 지운다.
'바깥 주소' 요청은 공개 관문처럼 x-forwarded-for 를 붙여 흉내 낸다(시험마다 다른 주소 — 시도 제한이 서로 섞이지 않게).
"""
import secrets

import httpx
import psycopg
import pytest

from conftest import ADMIN_ID, B, H, STAFF_ID, TENANT_ID
from landxi_api import config

MAILDOM = "example.com"


def pg():
    return psycopg.connect(config.PG_ADMIN_DSN, autocommit=True)


def ip():
    return f"2001:db8::{secrets.token_hex(2)}:{secrets.token_hex(2)}:{secrets.token_hex(2)}"    # 문서용 주소 — 시험마다 새 주소


def mail(tag=""):
    return f"pytest-{tag}{secrets.token_hex(4)}@{MAILDOM}"


def newpw():
    return "Pt" + secrets.token_hex(6) + "7q"          # 10자 이상 · 영문 + 숫자 — 시험 안에서만 쓰고 출력하지 않는다


def post(path, body, *, token=None, xff=None, site=None):
    h = {}
    if token:
        h["authorization"] = "Bearer " + token
    if xff:
        h["x-forwarded-for"] = xff
    if site:
        h["x-lx-site"] = site
    return httpx.post(B + path, json=body, headers=h, timeout=30)


def get(path, token):
    return httpx.get(B + path, headers=H(token), timeout=30)


def signup(login, pw, *, tenant=None, name=None, dept="시험과"):
    body = {"site": "gov" if tenant else "app", "name": name or "시험 " + login[7:13], "login": login, "password": pw, "password2": pw,
            "dept": dept, "consent": True}
    if tenant:
        body["tenant_id"] = tenant
    return post("/accounts/signup", body, xff=ip())


def pending_id(token, login, kind="signup"):
    items = get(f"/accounts/requests?kind={kind}&state=pending", token).json()["items"]
    hit = [x for x in items if x["login"] == login]
    return hit[0]["id"] if hit else None


@pytest.fixture(scope="module", autouse=True)
def cleanup(live):
    yield
    c = pg()
    like = f"pytest-%@{MAILDOM}"
    ids = [r[0] for r in c.execute("SELECT id FROM lx_users WHERE login LIKE %s UNION ALL SELECT id FROM tenant_users WHERE login LIKE %s", (like, like)).fetchall()]
    if ids:
        c.execute("DELETE FROM sessions WHERE user_id = ANY(%s)", (ids,))
        c.execute("DELETE FROM audit_log WHERE action='login' AND actor = ANY(%s)", (ids,))
    c.execute("DELETE FROM lx_users WHERE login LIKE %s", (like,))
    c.execute("DELETE FROM tenant_users WHERE login LIKE %s", (like,))
    c.execute("DELETE FROM signup_requests WHERE login LIKE %s", (like,))
    c.execute("DELETE FROM reset_requests WHERE login LIKE %s", (like,))
    c.execute("DELETE FROM audit_log WHERE action LIKE 'account.%%' AND subject LIKE %s", (like,))
    c.execute("DELETE FROM login_failures WHERE login ILIKE %s", (like,))
    c.close()


def login(login_, pw, *, site="app", tenant=None, xff=None):
    body = {"site": site, "login": login_, "password": pw}
    if tenant:
        body["tenant_id"] = tenant
    return post("/auth/login", body, xff=xff)


# ── 가입 신청 → 승인 → 로그인 ───────────────────────────────────────────────────────────
def test_signup_approve_then_login(live, tok):
    m, pw = mail("a"), newpw()
    r = signup(m, pw)
    assert r.status_code == 201 and r.json()["state"] == "pending", r.text
    assert login(m, pw).status_code == 401                                     # 승인 전에는 들어가지 않는다
    rid = pending_id(tok["admin"], m)
    assert rid
    ok = post(f"/accounts/signup/{rid}/decide", {"decision": "approve"}, token=tok["admin"])
    assert ok.status_code == 200 and ok.json()["state"] == "approved", ok.text
    s = login(m.upper(), pw)                                                   # 메일 아이디는 대소문자를 가리지 않는다
    assert s.status_code == 200, s.text
    j = s.json()
    assert j["token"].startswith("lxs_") and j["role"] == "staff"              # 승인된 LX 신청 = LX 직원
    me = get("/me", j["token"]).json()
    assert me["realm"] == "lx" and me["role"] == "staff"
    c = pg()
    row = c.execute("SELECT pw_hash, decided_by, state FROM signup_requests WHERE id=%s", (rid,)).fetchone()
    assert row == (None, ADMIN_ID, "approved")                            # 끝난 신청에 비밀번호 해시가 남지 않는다 · 승인한 사람
    c.close()
    again = signup(m, pw)
    assert again.status_code == 409                                            # 이미 가입한 메일


def test_signup_validation_and_admin_site(live):
    pw = newpw()
    bad = [({"login": "not-a-mail"}, "login"), ({"password": "short1", "password2": "short1"}, "password"),
           ({"password": "onlyletterslong", "password2": "onlyletterslong"}, "password"), ({"password2": pw + "x"}, "password2"),
           ({"consent": False}, "consent"), ({"dept": ""}, "dept"), ({"name": "  "}, "name")]
    for patch, field in bad:
        body = {"site": "app", "name": "시험", "login": mail("v"), "password": pw, "password2": pw, "dept": "시험과", "consent": True, **patch}
        r = post("/accounts/signup", body, xff=ip())
        assert r.status_code == 400 and r.json()["error"]["detail"]["field"] == field, (patch, r.text)
    r = post("/accounts/signup", {"site": "admin", "name": "시험", "login": mail("x"), "password": pw, "password2": pw, "dept": "시험과", "consent": True}, xff=ip())
    assert r.status_code == 403 and "LX 관리자가 만듭니다" in r.json()["error"]["message"]
    r = post("/accounts/signup", {"name": "시험", "login": mail("x"), "password": pw, "dept": "시험과", "consent": True}, xff=ip(), site="admin")
    assert r.status_code == 403                                                 # 바깥 주소(관문이 알린 입구)도 같다
    r = post("/accounts/signup", {"site": "gov", "tenant_id": "lx-demo", "name": "시험", "login": mail("x"), "password": pw, "dept": "시험과", "consent": True}, xff=ip())
    assert r.status_code == 400 and r.json()["error"]["detail"]["field"] == "tenant_id"


def test_signup_rate_limit(live):
    who = ip()
    codes = []
    for i in range(21):
        r = post("/accounts/signup", {"site": "app", "name": "시험", "login": "bad", "password": "x", "dept": "d", "consent": True}, xff=who)
        codes.append(r.status_code)
    assert codes[:20] == [400] * 20 and codes[20] == 429                       # 접속 주소마다 한 시간에 20번


# ── 반려는 사유 필수 ─────────────────────────────────────────────────────────────────────
def test_reject_needs_reason(live, tok):
    m, pw = mail("r"), newpw()
    assert signup(m, pw).status_code == 201
    rid = pending_id(tok["admin"], m)
    n = post(f"/accounts/signup/{rid}/decide", {"decision": "reject"}, token=tok["admin"])
    assert n.status_code == 400 and n.json()["error"]["code"] == "reason_required"
    ok = post(f"/accounts/signup/{rid}/decide", {"decision": "reject", "reason": "소속 확인이 안 됩니다"}, token=tok["admin"])
    assert ok.status_code == 200 and ok.json()["state"] == "rejected"
    again = post(f"/accounts/signup/{rid}/decide", {"decision": "approve"}, token=tok["admin"])
    assert again.status_code == 409                                            # 이미 처리한 신청
    assert login(m, pw).status_code == 401
    items = get("/accounts/requests?kind=signup&state=all", tok["admin"]).json()["items"]
    row = [x for x in items if x["id"] == rid][0]
    assert row["reason"] == "소속 확인이 안 됩니다" and row["decided_name"]
    staff = get("/accounts/requests?kind=signup", tok["staff"])
    assert staff.status_code == 403                                            # LX 직원은 승인 화면을 부르지 못한다


# ── 아이디 찾기 — 가려서 · 시도 제한 ───────────────────────────────────────────────────────
def test_find_id_masks_and_limits(live, tok):
    m, pw = mail("f"), newpw()
    name = "찾기시험" + secrets.token_hex(2)
    assert signup(m, pw, name=name).status_code == 201
    rid = pending_id(tok["admin"], m)
    assert post(f"/accounts/signup/{rid}/decide", {"decision": "approve"}, token=tok["admin"]).status_code == 200
    who = ip()
    r = post("/accounts/find-id", {"site": "app", "name": name}, xff=who)
    assert r.status_code == 200
    items = r.json()["items"]
    local = m.split("@")[0]
    assert items == [local[:2] + "*" * (len(local) - 2) + "@" + MAILDOM]       # te**@… — 앞 두 글자만
    assert m not in r.text
    none = post("/accounts/find-id", {"site": "app", "name": "없는사람" + secrets.token_hex(3)}, xff=who)
    assert none.status_code == 200 and none.json()["items"] == []
    codes = [post("/accounts/find-id", {"site": "app", "name": name}, xff=who).status_code for _ in range(9)]
    assert codes[:8] == [200] * 8 and codes[8] == 429                          # 접속 주소마다 10분에 10번
    assert "분 뒤" in post("/accounts/find-id", {"site": "app", "name": name}, xff=who).json()["error"]["message"]


# ── 재설정 → 임시 비밀번호 → 바꾸기 강제 ───────────────────────────────────────────────────
def test_reset_temp_password_forces_change(live, tok):
    m, pw = mail("p"), newpw()
    assert signup(m, pw).status_code == 201
    rid = pending_id(tok["admin"], m)
    assert post(f"/accounts/signup/{rid}/decide", {"decision": "approve"}, token=tok["admin"]).status_code == 200
    old = login(m, pw).json()["token"]
    ghost = post("/accounts/reset-request", {"site": "app", "login": mail("ghost")}, xff=ip())
    real = post("/accounts/reset-request", {"site": "app", "login": m}, xff=ip())
    assert ghost.status_code == real.status_code == 200 and ghost.json()["ok"] is True   # 있든 없든 같은 답
    xid = pending_id(tok["admin"], m, "reset")
    assert xid
    assert post(f"/accounts/reset/{xid}/decide", {"decision": "reject"}, token=tok["admin"]).json()["error"]["code"] == "reason_required"
    iss = post(f"/accounts/reset/{xid}/decide", {"decision": "issue"}, token=tok["admin"])
    assert iss.status_code == 200, iss.text
    tp = iss.json()["temp_password"]
    assert len(tp) == 14 and tp.count("-") == 2
    assert get("/me", old).status_code == 401                                  # 발급하면 옛 세션은 끝난다
    assert login(m, pw).status_code == 401                                     # 옛 비밀번호는 더 이상 안 된다
    t = login(m, tp)
    assert t.status_code == 200
    j = t.json()
    assert j["must_change"] is True and "token" not in j and j["change_token"].startswith("lxc_")   # 세션 없음 — 바꾸기만
    weak = post("/auth/password/change", {"change_token": j["change_token"], "password": "abc"})
    assert weak.status_code == 400
    same = post("/auth/password/change", {"change_token": j["change_token"], "password": tp})
    assert same.status_code == 400                                             # 임시 비밀번호 그대로는 안 된다
    pw2 = newpw()
    ch = post("/auth/password/change", {"change_token": j["change_token"], "password": pw2, "password2": pw2})
    assert ch.status_code == 200, ch.text
    s = ch.json()
    assert s["token"].startswith("lxs_") and get("/me", s["token"]).status_code == 200
    assert post("/auth/password/change", {"change_token": j["change_token"], "password": newpw()}).status_code == 401   # 바꾸기 표는 한 번
    assert login(m, tp).status_code == 401 and login(m, pw2).status_code == 200
    log = get("/accounts/log", tok["admin"]).json()["items"]
    mine = [x for x in log if x["subject"] == m]
    acts = [x["action"] for x in mine]
    assert {"account.signup.request", "account.signup.approve", "account.reset.request", "account.reset.issue", "account.password.change"} <= set(acts)
    assert [x for x in mine if x["action"] == "account.reset.issue"][0]["who"]  # 누가 발급했는지


# ── 기관 관리자는 자기 기관만 · LX 관리자는 전부 ──────────────────────────────────────────
def test_tenant_manager_scope(live, tok):
    mn, mg, pw = mail("nw"), mail("gj"), newpw()
    assert signup(mn, pw, tenant="namwon").status_code == 201
    assert signup(mg, pw, tenant="gwangju-jeonnam").status_code == 201
    nw = get("/accounts/requests?kind=signup", tok["namwon"]).json()["items"]
    assert any(x["login"] == mn for x in nw) and not any(x["login"] == mg for x in nw)
    assert all(x["realm"] == "tenant" and x["tenant_id"] == "namwon" for x in nw)
    both = get("/accounts/requests?kind=signup", tok["admin"]).json()["items"]
    assert {mn, mg} <= {x["login"] for x in both}                              # LX 관리자는 전부 본다(원칙 72)
    assert all(x["can_decide"] is False for x in both if x["realm"] == "tenant")  # 기관 신청은 보기만(승인 · 반려 버튼 없음)
    assert all(x["can_decide"] is True for x in nw)
    gid = pending_id(tok["admin"], mg)
    nid = pending_id(tok["namwon"], mn)
    assert post(f"/accounts/signup/{gid}/decide", {"decision": "approve"}, token=tok["namwon"]).status_code == 404   # 다른 기관 = 없음
    for d in ({"decision": "approve"}, {"decision": "reject", "reason": "시험 반려"}):                               # LX 관리자 = 기관 가입 승인에 관여 0
        r = post(f"/accounts/signup/{nid}/decide", d, token=tok["admin"])
        assert r.status_code == 403 and r.json()["error"]["code"] == "tenant_signup"
    assert get("/accounts/summary", tok["admin"]).json()["counts"]["signup_view"] >= 2                               # 보기만 하는 기관 신청 수
    assert post(f"/accounts/signup/{nid}/decide", {"decision": "approve"}, token=tok["namwon"]).status_code == 200   # 자기 기관 = 그 기관 관리자가 승인
    assert post(f"/accounts/signup/{gid}/decide", {"decision": "reject", "reason": "시험 반려"}, token=tok["gj"]).status_code == 200   # 광주전남 관리자가 반려
    s = login(mn, pw, site="gov", tenant="namwon")
    assert s.status_code == 200 and s.json()["role"] == "viewer"               # 기관 신청 = 부서 사용자
    assert login(mn, pw, site="gov", tenant="gwangju-jeonnam").status_code == 401
    users = get("/accounts/users", tok["namwon"]).json()
    assert users["items"] and all(u["realm"] == "tenant" and u["tenant_id"] == "namwon" for u in users["items"])
    assert [o["id"] for o in users["orgs"]] == ["namwon"]
    lx_ids = {u["id"] for u in get("/accounts/users?realm=lx", tok["admin"]).json()["items"]}
    assert STAFF_ID in lx_ids
    assert post(f"/accounts/users/lx/{STAFF_ID}/lock", {"locked": True}, token=tok["namwon"]).status_code == 404        # LX 계정 = 관할 밖
    uid = [u["id"] for u in users["items"] if u["login"] == mn][0]
    gj_user = [u for u in get("/accounts/users?realm=tenant&tenant_id=gwangju-jeonnam", tok["admin"]).json()["items"]][0]
    assert post(f"/accounts/users/tenant/{gj_user['id']}/temp-password", {}, token=tok["namwon"]).status_code == 404   # 다른 기관 계정
    assert post(f"/accounts/users/tenant/{TENANT_ID['namwon']}/temp-password", {}, token=tok["namwon"]).json()["error"]["code"] == "self_account"
    r = post(f"/accounts/users/tenant/{uid}/role", {"role": "manager"}, token=tok["namwon"])
    assert r.status_code == 200
    assert post(f"/accounts/users/tenant/{uid}/role", {"role": "admin"}, token=tok["namwon"]).status_code == 400
    assert login(mn, pw, site="gov", tenant="namwon").json()["role"] == "manager"
    log_nw = get("/accounts/log", tok["namwon"]).json()["items"]
    assert any(x["subject"] == mn for x in log_nw) and not any(x["subject"] == mg for x in log_nw)
    assert get("/accounts/summary", tok["gj"]).json()["counts"]["signup"] >= 0


# ── 관리자 잠금 · 비밀번호 5번 틀리면 계정 10분 잠금 · 실패한 로그인 기록 ─────────────────────
def approved(tok):
    m, pw = mail("l"), newpw()
    assert signup(m, pw).status_code == 201
    rid = pending_id(tok["admin"], m)
    assert post(f"/accounts/signup/{rid}/decide", {"decision": "approve"}, token=tok["admin"]).status_code == 200
    uid = [u["id"] for u in get("/accounts/users?realm=lx", tok["admin"]).json()["items"] if u["login"] == m][0]
    return m, pw, uid


def test_admin_lock(live, tok):
    m, pw, uid = approved(tok)
    t = login(m, pw).json()["token"]
    assert post(f"/accounts/users/lx/{uid}/lock", {"locked": True, "reason": "시험"}, token=tok["admin"]).status_code == 200
    assert get("/me", t).status_code == 401                                    # 잠그면 세션도 끝난다
    lk = login(m, pw)
    assert lk.status_code == 403 and lk.json()["error"]["code"] == "account_locked"
    assert login(m, "wrong-" + newpw()).status_code == 401                     # 틀린 비밀번호는 잠금 여부를 말하지 않는다
    assert post(f"/accounts/users/lx/{uid}/lock", {"locked": False}, token=tok["admin"]).status_code == 200
    assert login(m, pw).status_code == 200
    assert post(f"/accounts/users/lx/{ADMIN_ID}/lock", {"locked": True}, token=tok["admin"]).json()["error"]["code"] == "self_account"


def test_five_wrong_locks_account_ten_minutes(live, tok):
    """같은 아이디로 5번 틀리면 그 계정 10분 잠금(접속 주소가 바뀌어도) · 잠긴 동안 맞는 비밀번호도 안 됨 · 관리자가 풀기 · 실패 기록(비밀번호 값 0)."""
    m, pw, uid = approved(tok)
    wrong = ["wrong-" + newpw() for _ in range(5)]
    codes = [login(m, w, xff=ip()) for w in wrong]                              # 주소를 매번 바꿔도 계정으로 센다
    assert [r.status_code for r in codes[:4]] == [401] * 4
    assert codes[4].status_code == 423 and codes[4].json()["error"]["message"] == "비밀번호를 여러 번 틀려 10분 동안 잠겼습니다"
    held = login(m, pw)                                                        # 이 PC 안에서 맞는 비밀번호라도 잠긴 동안은 안 된다
    assert held.status_code == 423 and held.json()["error"]["code"] == "temp_locked"
    u = [x for x in get("/accounts/users?realm=lx", tok["admin"]).json()["items"] if x["id"] == uid][0]
    assert u["temp_locked"] is True and u["lock_until"]
    fails = [x for x in get("/accounts/failures", tok["admin"]).json()["items"] if x["login"] == m]
    assert len(fails) >= 6 and {"비밀번호 틀림", "잠긴 동안 시도"} <= {x["reason_ko"] for x in fails}
    assert all(x["at"] and x["site_ko"] == "Land-XI" and x["ip"] for x in fails)   # 아이디 · 시각 · 입구 · 접속 주소
    c = pg()
    rows = c.execute("SELECT * FROM login_failures WHERE login=%s", (m,)).fetchall()
    c.close()
    flat = " ".join(str(v) for r in rows for v in r)
    assert rows and not any(w in flat for w in wrong) and pw not in flat          # 비밀번호 값은 어디에도 없다
    log = [x for x in get("/accounts/log", tok["admin"]).json()["items"] if x["subject"] == m]
    assert any(x["action"] == "account.autolock" and x["who"] == "자동" for x in log)
    assert post(f"/accounts/users/lx/{uid}/lock", {"locked": False}, token=tok["admin"]).status_code == 200   # 관리자가 풀기
    assert login(m, pw).status_code == 200
    ok_after = [login(m, "wrong-" + newpw()) for _ in range(4)]                 # 이 PC 안의 틀린 시도는 세지 않는다(다른 갈래 시험 보호)
    assert all(r.status_code == 401 for r in ok_after) and login(m, pw).status_code == 200


def test_failures_scope(live, tok):
    mn, pw = mail("fs"), newpw()
    login(mn, "wrong-" + newpw(), site="gov", tenant="namwon")                  # 없는 아이디도 기록된다
    login(mn, "wrong-" + newpw(), site="gov", tenant="gwangju-jeonnam")
    nw = get("/accounts/failures", tok["namwon"]).json()["items"]
    mine = [x for x in nw if x["login"] == mn]
    assert mine and len({x["org"] for x in nw}) == 1                           # 기관 관리자는 자기 기관 실패만
    assert mine[0]["reason_ko"] == "없는 아이디"
    allf = [x for x in get("/accounts/failures", tok["admin"]).json()["items"] if x["login"] == mn]
    assert len(allf) == 2                                                       # LX 관리자는 전부
    assert get("/accounts/failures", tok["staff"]).status_code == 403


# ── 옛 아이디 → 메일 아이디(원칙 77 · 정리 작업): 옛 계정은 지우지 않고 사용 중지 ───────────────────────────
def test_old_ids_disabled_not_deleted(live, tok):
    """옛 아이디(lx-staff · lx-admin · lxadmin · namwon-manager · gj-manager …)는 로그인 0 · 목록에 '사용 중지'로 남고 바꾸지 않는다.
    가진 것(프로젝트 · 결재 · 대장 · 작업 등)은 새 메일 계정으로 옮겨져 옛 아이디로 남은 것이 없다. 영업은 sales@lx.or.kr."""
    c = pg()
    t0 = c.execute("SELECT now()").fetchone()[0]
    old_lx = ["u_lx_staff", "u_lx_admin", "u_lxadmin"]
    old_t = ["u_namwon_manager", "u_namwon_lxadmin", "u_gj_manager", "u_gj_manager_alias", "u_gwangju-jeonnam_lxadmin"]
    try:
        assert {r[0] for r in c.execute("SELECT status FROM lx_users WHERE id = ANY(%s)", (old_lx,)).fetchall()} == {"disabled"}
        assert {r[0] for r in c.execute("SELECT status FROM tenant_users WHERE id = ANY(%s)", (old_t,)).fetchall()} == {"disabled"}
        for body in ({"site": "app", "login": "lx-staff"}, {"site": "admin", "login": "lx-admin"}, {"site": "admin", "login": "lxadmin"},
                     {"site": "gov", "tenant_id": "namwon", "login": "namwon-manager"}, {"site": "gov", "tenant_id": "gwangju-jeonnam", "login": "gj-manager"}):
            r = post("/auth/login", {**body, "password": config.DEV_PASSWORD})
            assert r.status_code == 401 and r.json()["error"]["message"] == "아이디 또는 비밀번호가 맞지 않습니다"     # 있었는지 알리지 않는다
        for body in ({"site": "app", "login": "test@lx.or.kr"}, {"site": "admin", "login": "lxadmin@lx.or.kr"}, {"site": "app", "login": "sales@lx.or.kr"},
                     {"site": "gov", "tenant_id": "namwon", "login": "lxadmin@lx.or.kr"}):
            assert post("/auth/login", {**body, "password": config.DEV_PASSWORD}).status_code == 200, body
        users = {u["id"]: u for u in get("/accounts/users", tok["admin"]).json()["items"]}
        assert users["u_lx_staff"]["status"] == "disabled" and users[STAFF_ID]["status"] == "active"
        for path in ("/accounts/users/lx/u_lx_staff/lock", "/accounts/users/tenant/u_namwon_manager/temp-password"):
            r = post(path, {"locked": False} if path.endswith("lock") else {}, token=tok["admin"])
            assert r.status_code == 409 and r.json()["error"]["code"] == "disabled_account"                              # 되살리지 않는다
        assert c.execute("SELECT status FROM lx_users WHERE id='u_lx_staff'").fetchone()[0] == "disabled"
        moved = {"projects": "lead_id", "approvals": "requested_by", "jobs": "submitted_by", "ledger_imports": "created_by", "agent_runs": "user_id"}
        for t, col in moved.items():
            assert c.execute(f"SELECT count(*) FROM {t} WHERE {col} = ANY(%s)", (old_lx + old_t,)).fetchone()[0] == 0, t
        assert c.execute("SELECT count(*) FROM sessions WHERE user_id = ANY(%s)", (old_lx + old_t,)).fetchone()[0] == 0
    finally:
        c.execute("DELETE FROM login_failures WHERE reason='disabled' AND at >= %s", (t0,))
        c.close()
