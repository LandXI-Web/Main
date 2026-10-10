"""구현 5차 · 기관 화면 완성 디자인(확인 대장 '기관 화면 확인' 기관-2 · 3 · 4 · 5 · 8 ⓐ) — 실서버(:8700).

· 기관-2 메인(로그인 전) 그림 · 업무 결과 셋 — 설정 한 곳(config/gov-main.yaml) · 저해상만(긴 변 800 이하) · 제한 영상 0 · 숫자 = 대표 수치 요약 같은 값
· 기관-3 내 서비스 — 부서 사용자는 기관 관리자가 정해 준 서비스만(서버 덱이 거른다)
· 기관-4 서비스 대시보드 — 읍면별 현장 확인 필요(칸 합 = 큰 숫자) · 시점별 장면은 관할 것만 · 최근 결과는 다듬은 결과의 분석한 날
· 기관-5 이름 '분석 요청'(결재함 종류 · 작업 이름 · 서버 글)
· 기관-8 보낸 사람 — 이름 · 부서 + 연락처(본인이 가입 신청에 적은 경우만 · 받은 LX 담당 직원과 LX 관리자만 · 기관 403)
만든 시험 계정 · 신청 · 배정 · 검토 요청은 끝에서 지운다.
"""
import httpx
import psycopg
import pytest

from conftest import B, H, TENANT_ID, _login, drop_account, temp_account
from landxi_api import config

DEPT_ID = "u_pytest_impl5_dept"
DEPT_LOGIN = "pytest-impl5-dept@namwon.go.kr"
SIGN_LOGIN = "pytest-impl5-sign@namwon.go.kr"


def pg():
    return psycopg.connect(config.PG_ADMIN_DSN, autocommit=True)


@pytest.fixture(scope="module")
def T(live):
    pw = config.DEV_PASSWORD
    _, dept = temp_account("tenant", DEPT_ID, DEPT_LOGIN, "viewer", "namwon", name="시험 부서 사용자")
    with pg() as c:
        c.execute("UPDATE tenant_users SET dept='농정과', contact='063-000-0000' WHERE id=%s", (DEPT_ID,))
    t = {
        "nw": H(_login({"realm": "tenant", "tenant_id": "namwon", "login": "lxadmin@lx.or.kr", "password": pw, "site": "gov"})),
        "dept": H(dept),
        "staff": H(_login({"realm": "lx", "login": "test@lx.or.kr", "password": pw})),
        "admin": H(_login({"realm": "lx", "login": "lxadmin@lx.or.kr", "password": pw})),
    }
    made: list[str] = []
    t["_made"] = made
    yield t
    with pg() as c:
        for rid in made:
            c.execute("DELETE FROM review_messages WHERE request_id=%s", (rid,))
            c.execute("DELETE FROM review_reads WHERE request_id=%s", (rid,))
            c.execute("DELETE FROM feedback WHERE id=%s", (rid,))
        c.execute("DELETE FROM space_assign WHERE user_id=%s", (DEPT_ID,))
        uid = c.execute("SELECT user_id FROM signup_requests WHERE lower(login)=%s", (SIGN_LOGIN,)).fetchone()
        c.execute("DELETE FROM signup_requests WHERE lower(login)=%s", (SIGN_LOGIN,))
        if uid and uid[0]:
            c.execute("DELETE FROM sessions WHERE user_id=%s", (uid[0],))
            c.execute("DELETE FROM tenant_users WHERE id=%s", (uid[0],))
    drop_account("tenant", DEPT_ID)


def get(path, h=None, **kw):
    return httpx.get(B + path, headers=h or {}, timeout=60, **kw)


# ── 기관-2 메인(로그인 전) ─────────────────────────────────────────────────────────
def test_main_pictures_low_res_own_tenant_and_facts_match_summary(T):
    from PIL import Image
    r = get("/brand/namwon/main")
    assert r.status_code == 200, r.text
    j = r.json()
    pics = [j["background"]["src"]] + [s["src"] for s in j["scenes"].values()]
    for src in pics:
        assert src.startswith("/landxi/") and "@2x" not in src
        with Image.open(config.REPO_ROOT / src.lstrip("/")) as im:
            assert max(im.size) <= 800                                         # 저해상 크롭만
        for bad in ("marine-hero", "marine-aerial", "yeosu-marine-2025-aerial"):
            assert bad not in src                                              # 제한 영상 0
    assert set(j["scenes"]) <= {"card-farm"}                                   # 그 기관 · 열린 서비스 것만
    f = j["facts"]
    summ = get("/summary", T["nw"], params={"card": f["result"]["card"]}).json()["items"]
    assert f["result"]["label"] == "AI 분석 결과"                             # 원칙 135 기관까지(10-10 확인 8 ⓐ)
    assert f["result"]["env"]["value"] == sum(i["metrics"]["detected"]["value"] or 0 for i in summ if i.get("detected_counted"))   # 숫자 한 출처(요약 AI 분석 결과)
    brand = get("/brand/namwon").json()
    assert f["services"]["value"] == len(brand["services"])
    gj = get("/brand/gwangju-jeonnam/main").json()
    assert "card-farm" not in gj["scenes"] and all("namwon" not in s["src"] for s in gj["scenes"].values())   # 다른 기관 그림 0
    assert get("/brand/no-such-org/main").status_code == 404


def test_main_picture_guard_unit():
    from landxi_api import brand
    assert brand._main_pic("/landxi/v3/service-detail/data/img/farm-hero.jpg", 800, []) is None                 # 원 해상도(1600) — 내지 않음
    assert brand._main_pic("/landxi/v3/service-detail/data/img/marine-aerial/1.jpg", 800, ["marine-aerial"]) is None   # 제한 영상
    assert brand._main_pic("/landxi/../server/.env", 800, []) is None
    assert brand._main_pic("/landxi/v3/service-detail/data/img/namwon-cycle4/3.jpg", 800, []) is not None


# ── 기관-3 부서 사용자는 정해 준 서비스만 ──────────────────────────────────────────
def test_dept_user_sees_only_assigned_services(T):
    all_ids = {c["id"] for c in get("/cards/deck", T["nw"]).json()["items"]}
    assert {"card-farm", "card-living"} <= all_ids                            # 기관 관리자 = 전부
    d = get("/cards/deck", T["dept"]).json()
    assert d["items"] == [] and d["scope"] == "assigned"                      # 정해 준 서비스가 없으면 빈 덱
    r = httpx.put(B + f"/spaces/me/assign/{DEPT_ID}", headers=T["nw"], json={"cards": ["card-farm"]}, timeout=30)
    assert r.status_code == 200, r.text
    d = get("/cards/deck", T["dept"]).json()
    assert [c["id"] for c in d["items"]] == ["card-farm"]


# ── 기관-4 서비스 대시보드 재료 ─────────────────────────────────────────────────────
def test_emd_field_check_sums_to_big_number(T):
    j = get("/survey/stats", T["nw"], params={"by": "emd", "sgg": "52190", "card": "card-farm"}).json()     # 그 서비스의 필지 대조만(모델-표기 ⓐ)
    if j.get("state") == "building":
        pytest.skip("실태조사 집계 중")
    tot = j["field_check"]["value"]
    assert tot and sum(e["field_check"]["value"] for e in j["items"]) == tot
    summ = get("/summary", T["nw"], params={"card": "card-farm"}).json()["items"]
    assert tot == sum(i["metrics"]["field_check"]["value"] or 0 for i in summ)


def test_deck_scenes_in_scope_and_latest_is_result_date(T):
    farm = next(c for c in get("/cards/deck", T["nw"]).json()["items"] if c["id"] == "card-farm")
    whens = [s["when"] for s in farm["scenes"]]
    assert {"2025.04", "2025.06", "2025.08", "2025.10"} <= set(whens) and whens == sorted(whens)
    summ = get("/summary", T["nw"], params={"card": "card-farm"}).json()["items"]
    assert farm["latest"] == str(summ[0]["metrics"]["detected"]["as_of"])[:10]   # '지금 센 때'가 아니라 결과 날짜
    gj = get("/cards/deck", H(_login({"realm": "tenant", "tenant_id": "gwangju-jeonnam", "login": "lxadmin@lx.or.kr",
                                      "password": config.DEV_PASSWORD, "site": "gov"}))).json()
    for c in gj["items"]:
        assert all("namwon" not in s["src"] for s in c.get("scenes", []))      # 남원 장면은 광주전남에 0


# ── 기관-5 이름 ────────────────────────────────────────────────────────────────────
def test_request_named_analysis_request():
    from landxi_api import approvals, requests as rq
    import inspect
    assert approvals.KIND_LABEL["request"] == "분석 요청"
    src = inspect.getsource(rq)
    assert "f\"분석 요청 · {m.get('org')" in src and "\"기관 계정만 분석을 요청할 수 있습니다\"" in src


# ── 기관-8 보낸 사람 · 연락처 ──────────────────────────────────────────────────────
def test_signup_contact_is_copied_on_approval(T):
    body = {"site": "gov", "tenant_id": "namwon", "name": "시험 신청자", "login": SIGN_LOGIN, "password": "signtest2026ab", "password2": "signtest2026ab",
            "dept": "환경과", "contact": "063-111-2222", "consent": True}
    r = httpx.post(B + "/accounts/signup", json=body, timeout=30)
    assert r.status_code == 201, r.text
    with pg() as c:
        rid, contact = c.execute("SELECT id, contact FROM signup_requests WHERE lower(login)=%s AND state='pending'", (SIGN_LOGIN,)).fetchone()
    assert contact == "063-111-2222"
    r = httpx.post(B + f"/accounts/signup/{rid}/decide", headers=T["nw"], json={"decision": "approve"}, timeout=30)
    assert r.status_code == 200, r.text
    with pg() as c:
        row = c.execute("SELECT u.contact, u.dept FROM signup_requests s JOIN tenant_users u ON u.id=s.user_id WHERE s.id=%s", (rid,)).fetchone()
    assert row == ("063-111-2222", "환경과")
    bad = dict(body, login="pytest-impl5-x@namwon.go.kr", contact="1" * 31)
    assert httpx.post(B + "/accounts/signup", json=bad, timeout=30).status_code == 400   # 30자까지


def test_sender_name_dept_contact_only_for_lx_owner_and_admin(T):
    with pg() as c:
        pnu = c.execute("SELECT pnu FROM survey_findings WHERE tenant_id='namwon' AND pnu IS NOT NULL ORDER BY score DESC NULLS LAST LIMIT 1").fetchone()[0]
    r = httpx.post(B + "/reviews", headers=T["dept"], json={"pnu": pnu, "note": "pytest 보낸 사람 확인", "from": "pytest"}, timeout=60)
    assert r.status_code == 201, r.text
    rid = r.json()["id"]
    T["_made"].append(rid)
    with pg() as c:
        rcpt = c.execute("SELECT recipient_id FROM feedback WHERE id=%s", (rid,)).fetchone()[0]
    a = get("/accounts/senders", T["admin"], params={"review": rid}).json()["reviews"][rid]
    assert a == {"name": "시험 부서 사용자", "dept": "농정과", "role_ko": "부서 사용자", "org": "남원시", "contact": "063-000-0000"}
    s = get("/accounts/senders", T["staff"], params={"review": rid}).json()["reviews"]
    if rcpt == "u_mail_test":                                                  # 이 서비스의 담당이 test@ 면 받은 사람 — 연락처까지
        assert s[rid]["contact"] == "063-000-0000"
    else:                                                                      # 받은 사람이 아니면 그 줄이 없다
        assert rid not in s
    assert get("/accounts/senders", T["nw"], params={"review": rid}).status_code == 403   # 기관 계정 0
    assert get("/accounts/senders", T["admin"], params={"review": "x; drop"}).json()["reviews"] == {}
    me = get("/me", T["dept"]).json()
    assert me["user"]["dept"] == "농정과"                                       # 기관 머리의 사람 표기(부서 · 이름)
