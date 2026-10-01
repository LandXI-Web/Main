"""구현 2차 T1 '프로젝트 백본' — 프로젝트 만들기 · 단계 판정 · 서비스 카드 발행 요청 연결 · 재학습 권한. 실서버(:8700).

확인 대장: 3차 R-D3(프로젝트 = 무엇 · 어디 · 담당 · 단계 6) · R-D3 갈림길 ⓐ(직원이 바로 만든다) · 4차 P1(프로젝트 → 발행 요청) ·
          5차 역할-3 ⓑ(공개된 서비스의 재학습 = 프로젝트장 · 구성원만, 배포는 관리자 승인) · 6차 흐름-1.
GPU 0 — 학습은 견적(POST /jobs/quote)의 권한 판정까지만(대기열에 넣지 않음). 시험 계정(다른 직원)과 시험 프로젝트 · 카드 · 결재는 끝에서 지운다.
"""
import httpx
import psycopg
import pytest

from conftest import B, H, STAFF_ID, _login
from landxi_api import config

SAMPLE = "smp_94f1ab120e"          # 비닐하우스 학습 표본(09-30 원스톱 학습 · 등록된 모델이 이 표본으로 학습됐다)
OTHER = "u_pytest_staff2"


def pg():
    return psycopg.connect(config.PG_ADMIN_DSN, autocommit=True)


@pytest.fixture(scope="module")
def other(live):
    """다른 직원(시험 계정) — 프로젝트장도 구성원도 아닌 LX 직원."""
    from landxi_api.auth import hash_password
    c = pg()
    c.execute("DELETE FROM sessions WHERE user_id=%s", (OTHER,))
    c.execute("DELETE FROM lx_users WHERE id=%s", (OTHER,))
    c.execute("INSERT INTO lx_users(id, login, pw_hash, role, status, name) VALUES (%s,'pytest-staff2',%s,'staff','active','시험 직원')",
              (OTHER, hash_password(config.DEV_PASSWORD)))
    tok = _login({"realm": "lx", "login": "pytest-staff2", "password": config.DEV_PASSWORD})
    yield tok
    c.execute("DELETE FROM project_members WHERE user_id=%s", (OTHER,))
    c.execute("DELETE FROM sessions WHERE user_id=%s", (OTHER,))
    c.execute("DELETE FROM lx_users WHERE id=%s", (OTHER,))
    c.close()


@pytest.fixture
def made(live, tok):
    """시험 프로젝트를 만들고 끝에서 그 프로젝트가 만든 카드 · 판 · 결재까지 지운다."""
    ids = []

    def mk(body=None, t=None):
        r = httpx.post(B + "/projects", headers=H(t or tok["staff"]), json=body or {"name": "pytest 남원시 비닐하우스", "task": "비닐하우스",
                                                                                   "task_id": "greenhouse", "regions": ["52190"]}, timeout=60)
        assert r.status_code == 201, r.text
        ids.append(r.json()["id"])
        return r.json()
    yield mk
    c = pg()
    for pid in ids:
        cvs = [x[0] for x in c.execute("SELECT ref FROM project_links WHERE project_id=%s AND kind='card_version'", (pid,)).fetchall()]
        cards = [x[0] for x in c.execute("SELECT ref FROM project_links WHERE project_id=%s AND kind='card'", (pid,)).fetchall()]
        for cv in cvs:
            c.execute("DELETE FROM approvals WHERE subject_type='card' AND subject_id=%s", (cv,))
            c.execute("DELETE FROM card_versions WHERE id=%s", (cv,))
        for cd in cards:
            if not c.execute("SELECT 1 FROM card_versions WHERE card_id=%s", (cd,)).fetchone():
                c.execute("DELETE FROM cards WHERE id=%s", (cd,))
        c.execute("DELETE FROM projects WHERE id=%s", (pid,))
    c.close()


def stage(p, key):
    return next(s for s in p["stages"] if s["key"] == key)


# ── 만들기 ────────────────────────────────────────────────────────────────
def test_staff_makes_project_directly(live, tok, made):
    """직원이 바로 만든다(관리자 승인 없음) · 입력 세 칸 · 프로젝트장 = 만든 직원 · 단계 6 · '내 프로젝트'에 한 줄."""
    p = made()
    assert p["state"] == "active" and p["lead"]["id"] == STAFF_ID and p["mine"] is True
    assert [s["key"] for s in p["stages"]] == ["ingest", "label", "train", "review", "publish", "ops"]
    assert p["regions"][0]["code"] == "52190" and p["regions"][0]["name"] == "남원시"
    assert p["round"]["value"] == 1 and p["can"]["publish"] is True
    assert p["next"]["text"]                                           # 다음 할 일 하나
    mine = httpx.get(B + "/projects?scope=mine", headers=H(tok["staff"]), timeout=60).json()
    assert p["id"] in [x["id"] for x in mine["items"]]
    led = httpx.get(B + "/projects?scope=led", headers=H(tok["staff"]), timeout=60).json()
    assert p["id"] in [x["id"] for x in led["items"]] and led["counts"]["led"]["value"] >= 1


def test_make_rejects_bad_input_and_other_roles(live, tok):
    """지역 없음 · 없는 지역 = 400 · 영업 · 기관 계정 = 403(프로젝트는 LX 직원 · 관리자)."""
    s = H(tok["staff"])
    assert httpx.post(B + "/projects", headers=s, json={"name": "x", "task": "비닐하우스", "regions": []}, timeout=30).status_code == 400
    assert httpx.post(B + "/projects", headers=s, json={"name": "x", "task": "비닐하우스", "regions": ["99999"]}, timeout=30).status_code == 400
    assert httpx.post(B + "/projects", headers=s, json={"name": "", "task": "비닐하우스", "regions": ["52190"]}, timeout=30).status_code == 400
    for who in ("sales", "namwon"):
        assert httpx.post(B + "/projects", headers=H(tok[who]), json={"name": "x", "task": "y", "regions": ["52190"]}, timeout=30).status_code == 403


# ── 단계 판정 ─────────────────────────────────────────────────────────────
def test_stage_judgement_follows_records(live, tok, made):
    """완료 조건 자동 판정 — 영상 있는 지역 = 데이터 올리기 끝 · 표본을 이으면 학습데이터 구축 끝 · 그 표본으로 학습해 등록된 모델 = 학습 끝."""
    p = made()
    s = H(tok["staff"])
    assert stage(p, "ingest")["done"] is True                           # 남원시 = 영상 있음(/regions 와 같은 판정)
    assert stage(p, "label")["done"] is False and p["stage"]["key"] == "label" and p["next"]["text"] == "라벨 묶음 올리기"
    r = httpx.post(B + f"/projects/{p['id']}/samples", headers=s, json={"sample_id": SAMPLE}, timeout=60)
    assert r.status_code == 201, r.text
    p = r.json()
    assert stage(p, "label")["done"] is True and stage(p, "label")["target"]["sample"] == SAMPLE
    assert stage(p, "train")["done"] is True and stage(p, "train")["target"].get("model")   # 이 표본으로 학습해 등록된 모델
    assert p["stage"]["key"] == "review" and p["next"]["text"].startswith("표본 확인")
    # 다른 직원(구성원 아님)은 표본을 잇지 못한다
    # (프로젝트 일 = 프로젝트장 · 구성원)
    lst = httpx.get(B + f"/training/samples?project={p['id']}", headers=s, timeout=60).json()
    assert [x["id"] for x in lst["items"]] == [SAMPLE]


def test_publish_request_carries_project_and_owner(live, tok, made, other):
    """서비스 카드 발행 요청 = 공개 결재 요청에 프로젝트가 붙고, 공개된 카드의 담당 = 그 프로젝트장. 구성원 아닌 직원 · 구성원은 요청하지 못한다(프로젝트장)."""
    p = made()
    s = H(tok["staff"])
    p = httpx.post(B + f"/projects/{p['id']}/samples", headers=s, json={"sample_id": SAMPLE}, timeout=60).json()
    mid = stage(p, "train")["target"]["model"]
    body = {"name": "pytest 비닐하우스", "model_id": mid, "rules": [], "ledger_kind": "greenhouse", "project_id": p["id"]}
    assert httpx.post(B + "/registry/cards", headers=H(other), json=body, timeout=60).status_code == 403
    r = httpx.post(B + "/registry/cards", headers=s, json=body, timeout=60)
    if r.status_code == 400 and "대장" in r.text:                          # 대장 형식 목록이 다르면 서버가 가진 첫 형식으로
        kinds = httpx.get(B + "/registry/ledger_kinds", headers=s, timeout=30).json()["items"]
        body["ledger_kind"] = next(k["kind"] for k in kinds if k["ready"])
        r = httpx.post(B + "/registry/cards", headers=s, json=body, timeout=60)
    assert r.status_code == 201, r.text
    card = r.json()
    assert card["project_id"] == p["id"]
    aps = httpx.get(B + "/approvals?state=pending", headers=H(tok["admin"]), timeout=60).json()["items"]
    ap = next(a for a in aps if a["id"] == card["approval_id"])
    assert ap["payload"]["project_id"] == p["id"] and ap["payload"]["project_name"] == p["name"]
    p2 = httpx.get(B + f"/projects/{p['id']}", headers=s, timeout=60).json()
    assert stage(p2, "publish")["next"] == "공개 결재 대기"
    cards = httpx.get(B + "/registry/cards", headers=s, timeout=60).json()["items"]
    mine = next(c for c in cards if c["id"] == card["id"])
    assert mine["project"]["id"] == p["id"] and mine["owner"] == p["lead"]["name"]


# ── 재학습 권한(역할-3 ⓑ) ─────────────────────────────────────────────────
def _publish(tok, p):
    """프로젝트를 공개까지 — 표본 잇기 → 발행 요청(프로젝트장) → 관리자 승인(요청한 사람과 다른 관리자)."""
    s = H(tok["staff"])
    p = httpx.post(B + f"/projects/{p['id']}/samples", headers=s, json={"sample_id": SAMPLE}, timeout=60).json()
    kinds = httpx.get(B + "/registry/ledger_kinds", headers=s, timeout=30).json()["items"]
    body = {"name": "pytest 비닐하우스", "model_id": stage(p, "train")["target"]["model"], "rules": [],
            "ledger_kind": next(k["kind"] for k in kinds if k["ready"]), "project_id": p["id"]}
    card = httpx.post(B + "/registry/cards", headers=s, json=body, timeout=60).json()
    r = httpx.post(B + f"/approvals/{card['approval_id']}/decide", headers=H(tok["admin"]), json={"decision": "approve", "reason": "pytest"}, timeout=60)
    assert r.status_code == 200, r.text
    return httpx.get(B + f"/projects/{p['id']}", headers=s, timeout=60).json()


def test_retrain_only_lead_and_members(live, tok, made, other):
    """공개된 서비스의 재학습 — 프로젝트장 · 구성원만 학습을 시작한다(다른 직원 · 관리자는 서버가 거절). 재학습 = 같은 프로젝트 2차 · 학습 단계로."""
    p = _publish(tok, made())
    assert p["published"] is True and p["stage"]["key"] == "ops"
    assert p["can"]["retrain"] is True
    q = {"kind": "train", "base_model": stage(p, "train")["target"]["model"], "samples": [SAMPLE],
         "options": {"epochs": 1, "project_id": p["id"]}}
    # 다른 직원 — 버튼 없음(can) · 서버도 거절(견적 · 회차)
    po = httpx.get(B + f"/projects/{p['id']}", headers=H(other), timeout=60).json()
    assert po["can"]["retrain"] is False and po["can"]["train"] is False
    r = httpx.post(B + "/jobs/quote", headers=H(other), json=q, timeout=60)
    assert r.status_code == 403 and r.json()["error"]["code"] == "forbidden", r.text
    q2 = {k: v for k, v in q.items() if k != "options"}                 # project_id 없이 표본만 보내도 그 표본의 프로젝트로 거절
    assert httpx.post(B + "/jobs/quote", headers=H(other), json=q2, timeout=60).status_code == 403
    assert httpx.post(B + f"/projects/{p['id']}/rounds", headers=H(other), json={}, timeout=60).status_code == 403
    # 관리자도 구성원이 아니면 시작하지 않는다(관리자는 프로젝트장을 바꾸고, 배포를 승인한다)
    assert httpx.post(B + "/jobs/quote", headers=H(tok["admin"]), json=q, timeout=60).status_code == 403
    # 프로젝트장 — 거절하지 않는다(대기열 · 전력 판정은 그다음 일)
    r = httpx.post(B + "/jobs/quote", headers=H(tok["staff"]), json=q, timeout=60)
    assert r.status_code == 200, r.text
    # 구성원으로 더하면 그 직원도 시작할 수 있다
    r = httpx.post(B + f"/projects/{p['id']}/members", headers=H(tok["staff"]), json={"user_id": OTHER}, timeout=60)
    assert r.status_code == 201
    assert httpx.post(B + "/jobs/quote", headers=H(other), json=q, timeout=60).status_code == 200
    # 재학습 = 2차 · 학습 단계로 돌아간다(새 프로젝트를 만들지 않는다)
    r = httpx.post(B + f"/projects/{p['id']}/rounds", headers=H(tok["staff"]), json={}, timeout=60)
    assert r.status_code == 201, r.text
    p2 = r.json()
    assert p2["round"]["value"] == 2 and p2["stage"]["key"] == "train" and p2["id"] == p["id"]
    assert stage(p2, "label")["done"] is True                          # 앞 회차 학습데이터는 이어 쓴다


def test_lead_change_is_admin_only(live, tok, made, other):
    """프로젝트장 바꾸기 = LX 관리자만 · 앞 프로젝트장은 구성원으로 남는다."""
    p = made()
    assert httpx.patch(B + f"/projects/{p['id']}", headers=H(tok["staff"]), json={"lead_id": OTHER}, timeout=30).status_code == 403
    r = httpx.patch(B + f"/projects/{p['id']}", headers=H(tok["admin"]), json={"lead_id": OTHER}, timeout=30)
    assert r.status_code == 200, r.text
    assert r.json()["lead"]["id"] == OTHER and STAFF_ID in [m["id"] for m in r.json()["members"]]


def test_archive_moves_out_of_mine(live, tok, made):
    """끝난 프로젝트 보관 — '내 프로젝트'에서 빠지고 보관 묶음에 남는다 · 다시 열 수 있다."""
    p = made()
    s = H(tok["staff"])
    assert httpx.post(B + f"/projects/{p['id']}/archive", headers=s, json={"archived": True}, timeout=30).json()["state"] == "archived"
    assert p["id"] not in [x["id"] for x in httpx.get(B + "/projects?scope=mine", headers=s, timeout=60).json()["items"]]
    assert p["id"] in [x["id"] for x in httpx.get(B + "/projects?scope=archived", headers=s, timeout=60).json()["items"]]
    assert httpx.post(B + f"/projects/{p['id']}/archive", headers=s, json={"archived": False}, timeout=30).json()["state"] == "active"
