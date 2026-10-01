"""구현 2차 · 검토 요청 · 메시지 · 알림 — 실서버(:8700). 확인 대장 6차 GF-6('검토 요청' · 메모 한 줄 · LX 관리자도 봄) · 알림-1(담당 + 관리자) · 원칙 39 · 50 · 63 · 72 · 73.

요청 만들기 · 관할 밖 거절 · 받는 사람(프로젝트장 → 카드 담당 직원 / 없으면 LX 관리자) · 관리자 전체 보기 · 알림 수 · 답(판정 'AI 오류' → 재학습 표본) · 기관은 자기 요청만.
받는 사람 판정이 기존 자료(프로젝트 · 공개 요청 기록)에 흔들리지 않게 시험용 서비스 카드 한 장을 만들고 끝에서 지운다. 만든 요청 · 대화 · 읽음 · 표본 행도 끝에서 지운다.
"""
import httpx
import psycopg
import pytest

from conftest import B, H, _login
from landxi_api import config

CARD = "card-pytest-review"
PNU_R2 = "5219037024102770003"          # 남원 · 휴경·전용 의심(관할 안)


def pg():
    return psycopg.connect(config.PG_ADMIN_DSN, autocommit=True)


@pytest.fixture(scope="module")
def T(live):
    pw = config.DEV_PASSWORD
    t = {
        "nw": _login({"realm": "tenant", "tenant_id": "namwon", "login": "lxadmin", "password": pw, "site": "gov"}),
        "nw2": _login({"realm": "tenant", "tenant_id": "namwon", "login": "namwon-manager", "password": pw, "site": "gov"}),
        "gj": _login({"realm": "tenant", "tenant_id": "gwangju-jeonnam", "login": "gj-manager", "password": pw, "site": "gov"}),
        "staff": _login({"realm": "lx", "login": "lx-staff", "password": pw}),
        "admin": _login({"realm": "lx", "login": "lxadmin", "password": pw}),
        "sales": _login({"realm": "lx", "login": "lx-sales", "password": pw}),
    }
    return {k: H(v) for k, v in t.items()}


@pytest.fixture(scope="module")
def made(live):
    """시험용 카드(담당 없음) — 끝에서 이 시험이 만든 요청 · 대화 · 읽음 · 재학습 표본 행과 함께 지운다."""
    c = pg()
    c.execute("INSERT INTO cards(id, name, scope, domain) VALUES (%s, %s, 'local', '시험') ON CONFLICT (id) DO UPDATE SET owner_id=NULL",
              (CARD, psycopg.types.json.Jsonb({"ko": "시험 서비스", "en": "test"})))
    ids: list[str] = []
    yield ids
    for rid in ids:
        fp = c.execute("SELECT ctx->>'fp_id' FROM feedback WHERE id=%s", (rid,)).fetchone()
        if fp and fp[0]:
            c.execute("DELETE FROM feedback WHERE id=%s", (fp[0],))
        c.execute("DELETE FROM review_messages WHERE request_id=%s", (rid,))
        c.execute("DELETE FROM review_reads WHERE request_id=%s", (rid,))
        c.execute("DELETE FROM feedback WHERE id=%s", (rid,))
    c.execute("DELETE FROM cards WHERE id=%s", (CARD,))
    c.close()


def post(h, body):
    return httpx.post(B + "/reviews", headers=h, json=body, timeout=60)


def set_owner(uid):
    with pg() as c:
        c.execute("UPDATE cards SET owner_id=%s WHERE id=%s", (uid, CARD))


def other_pnu(tenant):
    with pg() as c:
        return c.execute("SELECT pnu FROM survey_findings WHERE tenant_id=%s AND pnu IS NOT NULL LIMIT 1", (tenant,)).fetchone()[0]


# ── 요청 만들기 · 받는 사람 ───────────────────────────────────────────────────────
def test_request_goes_to_card_owner_then_admin(T, made):
    """카드의 담당 직원이 있으면 그 직원에게, 없으면 LX 관리자에게. 메모는 선택(빈 메모도 보낸다)."""
    set_owner("u_lx_staff")
    r = httpx.get(B + "/reviews/recipient", headers=T["nw"], params={"pnu": PNU_R2, "card": CARD}, timeout=30)
    assert r.status_code == 200, r.text
    assert r.json()["recipient"] == {"kind": "staff", "name": "김도윤", "via": "card"} and r.json()["service"] == "시험 서비스"
    r = post(T["nw"], {"pnu": PNU_R2, "card": CARD, "note": "pytest 지난달 창고를 철거했습니다", "from": "pytest"})
    assert r.status_code == 201, r.text
    j = r.json(); made.append(j["id"])
    assert j["status"] == "sent" and j["status_ko"] == "보냄" and j["recipient"]["kind"] == "staff" and not j["merged"]
    assert j["where"] and "남원" not in j["where"]                       # 읍면동 리 지번(시도 · 시군구를 뗀 모양)
    with pg() as c:
        row = c.execute("SELECT kind, state, status, recipient_id, card_id, sender_id, tenant_id FROM feedback WHERE id=%s", (j["id"],)).fetchone()
    assert row == ("review", "open", "sent", "u_lx_staff", CARD, "u_namwon_lxadmin", "namwon")   # 기존 feedback 표에 이어 쓴다

    set_owner(None)
    r = httpx.get(B + "/reviews/recipient", headers=T["nw"], params={"pnu": PNU_R2, "card": CARD}, timeout=30)
    assert r.json()["recipient"]["kind"] == "admin"
    r = post(T["nw2"], {"pnu": PNU_R2, "card": CARD})                       # 메모 없이도 보낸다(원칙 50)
    assert r.status_code == 201, r.text
    made.append(r.json()["id"])
    assert r.json()["recipient"] == {"kind": "admin", "name": None}


def test_project_lead_comes_first(T, made):
    """그 카드를 낸 프로젝트가 있으면 프로젝트장이 받는다(카드 담당 칸보다 먼저) — 프로젝트 쪽 한 곳(카드 → 프로젝트장)을 쓴다."""
    with pg() as c:
        if not c.execute("SELECT to_regclass('project_links') IS NOT NULL").fetchone()[0]:
            pytest.skip("프로젝트 표 없음")
        c.execute("INSERT INTO projects(id, name, task, lead_id, created_by) VALUES ('prj_pytest_review', '시험 프로젝트', '시험', 'u_lx_staff', 'u_lx_staff') ON CONFLICT (id) DO NOTHING")
        c.execute("INSERT INTO project_links(project_id, kind, ref, by) VALUES ('prj_pytest_review', 'card', %s, 'u_lx_staff') ON CONFLICT DO NOTHING", (CARD,))
    try:
        set_owner("u_lx_admin")                                             # 카드 담당 칸이 달라도 프로젝트장이 먼저
        r = httpx.get(B + "/reviews/recipient", headers=T["nw"], params={"pnu": PNU_R2, "card": CARD}, timeout=30).json()
        assert r["recipient"] == {"kind": "staff", "name": "김도윤", "via": "project"}
    finally:
        set_owner(None)
        with pg() as c:
            c.execute("DELETE FROM project_links WHERE project_id='prj_pytest_review'")
            c.execute("DELETE FROM projects WHERE id='prj_pytest_review'")


def test_same_parcel_before_answer_joins_the_conversation(T, made):
    """같은 사람이 같은 필지로 답을 받기 전에 또 보내면 새 요청이 아니라 그 대화에 한 줄이 붙는다."""
    first = made[0]
    r = post(T["nw"], {"pnu": PNU_R2, "card": CARD, "note": "pytest 덧붙임"})
    assert r.status_code == 201 and r.json()["merged"] is True and r.json()["id"] == first
    r = httpx.get(B + f"/reviews/{first}", headers=T["nw"], timeout=30)
    assert [m["body"] for m in r.json()["messages"]][-1] == "pytest 덧붙임"


# ── 관할 밖 · 계정 범위 ───────────────────────────────────────────────────────────
def test_out_of_scope_and_accounts_rejected(T, made):
    gj = other_pnu("gwangju-jeonnam")
    r = post(T["nw"], {"pnu": gj, "note": "pytest 관할 밖"})
    assert r.status_code == 404 and r.json()["error"]["code"] == "not_found"          # 관할 밖 = 없는 필지와 같은 답
    r = httpx.get(B + "/reviews/recipient", headers=T["nw"], params={"pnu": gj}, timeout=30)
    assert r.status_code == 404
    r = post(T["nw"], {"lnglat": [126.8526, 35.1595], "note": "pytest 광주 좌표"})    # 광주 시내 — 남원 관할 밖
    assert r.status_code == 404
    assert post(T["nw"], {"note": "필지 없음"}).status_code == 400
    assert post(T["nw"], {"pnu": "12345"}).status_code == 400
    assert post(T["staff"], {"pnu": PNU_R2}).status_code == 403                        # LX 는 받는 쪽
    assert httpx.post(B + "/reviews", json={"pnu": PNU_R2}, timeout=30).status_code == 401
    assert httpx.get(B + "/reviews", headers=T["sales"], timeout=30).status_code == 403
    with pg() as c:
        n = c.execute("SELECT count(*) FROM feedback WHERE kind='review' AND (note LIKE 'pytest 관할 밖%%' OR note LIKE 'pytest 광주%%')").fetchone()[0]
    assert n == 0


def test_tenant_sees_only_own_requests(T, made):
    first, second = made[0], made[1]                     # 첫째 = lxadmin(남원) · 둘째 = namwon-manager(남원)
    ids = {i["id"] for i in httpx.get(B + "/reviews", headers=T["nw"], timeout=30).json()["items"]}
    assert first in ids and second not in ids            # 같은 기관이라도 내가 보낸 것만
    assert httpx.get(B + f"/reviews/{second}", headers=T["nw"], timeout=30).status_code == 404
    assert httpx.get(B + f"/reviews/{first}", headers=T["gj"], timeout=30).status_code == 404       # 다른 기관
    assert first not in {i["id"] for i in httpx.get(B + "/reviews", headers=T["gj"], timeout=30).json()["items"]}


# ── LX: 담당 직원 · 관리자 전체 보기 · 알림 수 ─────────────────────────────────────
def test_staff_sees_own_admin_sees_all_and_notify_counts(T, made):
    first, second = made[0], made[1]                     # 첫째 → 담당 김도윤 · 둘째 → LX 관리자
    staff_ids = {i["id"] for i in httpx.get(B + "/reviews?box=all", headers=T["staff"], timeout=30).json()["items"]}
    admin = httpx.get(B + "/reviews?box=all&limit=300", headers=T["admin"], timeout=30).json()
    admin_ids = {i["id"] for i in admin["items"]}
    assert first in staff_ids and second not in staff_ids
    assert {first, second} <= admin_ids and admin["scope"] == "all"
    assert httpx.get(B + f"/reviews/{second}", headers=T["staff"], timeout=30).status_code == 404

    n_staff = httpx.get(B + "/reviews/notify", headers=T["staff"], timeout=30).json()
    n_admin = httpx.get(B + "/reviews/notify", headers=T["admin"], timeout=30).json()
    assert n_staff["n"] >= 1 and n_admin["n"] >= 2
    item = next(i for i in n_staff["items"] if i["id"] == first)
    assert item["unread"] is True and item["org"] == "남원시"
    # 담당 직원이 열면 → 담당의 새 알림 하나 줄고, 기관 쪽 상태는 '확인 중'
    r = httpx.post(B + f"/reviews/{first}/read", headers=T["staff"], timeout=30)
    assert r.status_code == 200 and r.json()["status"] == "seen"
    assert httpx.get(B + "/reviews/notify", headers=T["staff"], timeout=30).json()["n"] == n_staff["n"] - 1
    assert httpx.get(B + "/reviews/notify", headers=T["admin"], timeout=30).json()["n"] == n_admin["n"]   # 관리자 알림은 관리자가 볼 때까지
    mine = next(i for i in httpx.get(B + "/reviews", headers=T["nw"], timeout=30).json()["items"] if i["id"] == first)
    assert mine["status_ko"] == "확인 중"


# ── 답 · 판정 · 기관이 답을 본다 ───────────────────────────────────────────────────
def test_answer_reaches_tenant_and_ai_error_becomes_sample(T, made):
    first, second = made[0], made[1]
    assert httpx.post(B + f"/reviews/{second}/messages", headers=T["staff"], json={"body": "x"}, timeout=30).status_code in (403, 404)   # 담당이 아님
    assert httpx.post(B + f"/reviews/{first}/messages", headers=T["staff"], json={"verdict": "wrong"}, timeout=30).status_code == 400
    assert httpx.post(B + f"/reviews/{first}/messages", headers=T["nw"], json={"body": "x", "verdict": "ok"}, timeout=30).status_code == 400   # 판정은 LX
    before = httpx.get(B + "/reviews/notify", headers=T["nw"], timeout=30).json()["n"]
    r = httpx.post(B + f"/reviews/{first}/messages", headers=T["staff"], json={"body": "pytest 확인했습니다. 다음 학습에 반영합니다", "verdict": "ai_error"}, timeout=30)
    assert r.status_code == 201 and r.json()["status"] == "answered"
    n = httpx.get(B + "/reviews/notify", headers=T["nw"], timeout=30).json()
    assert n["n"] == before + 1
    it = next(i for i in n["items"] if i["id"] == first)
    assert it["status_ko"] == "답변" and it["verdict_ko"] == "AI 오류" and it["unread"] is True and it["last"]["side"] == "lx"
    conv = httpx.get(B + f"/reviews/{first}", headers=T["nw"], timeout=30).json()
    last = conv["messages"][-1]
    assert last["who"] == "LX 담당 김도윤" and last["verdict_ko"] == "AI 오류" and last["new"] is True and conv["messages"][0]["who"] == "나"
    httpx.post(B + f"/reviews/{first}/read", headers=T["nw"], timeout=30)
    assert httpx.get(B + "/reviews/notify", headers=T["nw"], timeout=30).json()["n"] == before
    with pg() as c:                                        # 'AI 오류' = 재학습 표본(feedback fp) 한 줄 — 같은 필지 · 같은 기관
        fp = c.execute("SELECT f.kind, f.tenant_id, f.pnu, f.state FROM feedback f WHERE f.id = (SELECT ctx->>'fp_id' FROM feedback WHERE id=%s)", (first,)).fetchone()
    assert fp == ("fp", "namwon", PNU_R2, "open")
    with pg() as c:                                        # 답을 받은 요청은 '열린 기관 신고' 수(요약)에서 빠진다
        assert c.execute("SELECT state FROM feedback WHERE id=%s", (first,)).fetchone()[0] == "closed"
    # 관리자는 담당이 아니어도 답할 수 있다(보조 지원) · 담당 없는 요청은 관리자가 답한다
    r = httpx.post(B + f"/reviews/{second}/messages", headers=T["admin"], json={"body": "pytest 현장 사진을 한 장 더 보내 주세요"}, timeout=30)
    assert r.status_code == 201
    got = httpx.get(B + f"/reviews/{second}", headers=T["nw2"], timeout=30).json()
    assert got["status_ko"] == "답변" and got["messages"][-1]["who"].startswith("LX 관리자")
    # 기관이 답에 한 줄 덧붙이면 다시 '보냄' — 받는 쪽 알림이 다시 선다
    r = httpx.post(B + f"/reviews/{second}/messages", headers=T["nw2"], json={"body": "pytest 사진은 내일 보내겠습니다"}, timeout=30)
    assert r.status_code == 201 and r.json()["status"] == "sent"
    with pg() as c:
        assert c.execute("SELECT state FROM feedback WHERE id=%s", (second,)).fetchone()[0] == "open"
    assert next(i for i in httpx.get(B + "/reviews/notify", headers=T["admin"], timeout=30).json()["items"] if i["id"] == second)["unread"] is True


def test_screen_words(T, made):
    """화면에 가는 말 — '오탐 신고' · 'AI가 잘못 봤어요' 표기 0 · 상태 · 판정은 확인된 말만."""
    j = httpx.get(B + f"/reviews/{made[0]}", headers=T["nw"], timeout=30).text
    assert "오탐" not in j and "잘못 봤" not in j
    assert httpx.get(B + f"/reviews/{made[0]}", headers=T["nw"], timeout=30).json()["status_ko"] in ("보냄", "확인 중", "답변")
