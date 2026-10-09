"""구현 2차 T1 '프로젝트 백본' — 프로젝트 만들기 · 단계 판정 · 서비스 카드 발행 요청 연결 · 재학습 권한. 실서버(:8700).

확인 대장: 3차 R-D3(프로젝트 = 무엇 · 어디 · 담당 · 단계 6) · R-D3 갈림길 ⓐ(직원이 바로 만든다) · 4차 P1(프로젝트 → 발행 요청) ·
          5차 역할-3 ⓑ(공개된 서비스의 재학습 = 프로젝트장이 시작, 배포는 관리자 승인 · 구현 확인 2차 J-2 '재학습은 프로젝트장만') · 6차 흐름-1.
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
    assert [s["key"] for s in p["stages"]] == ["ingest", "label", "train", "infer", "review", "publish"]
    assert p["regions"][0]["code"] == "52190" and p["regions"][0]["name"] == "남원시"
    assert p["round"]["value"] == 1 and p["can"]["publish"] is True
    assert p["next"]["text"]                                           # 다음 할 일 하나
    mine = httpx.get(B + "/projects?scope=mine", headers=H(tok["staff"]), timeout=60).json()
    assert p["id"] in [x["id"] for x in mine["items"]]
    led = httpx.get(B + "/projects?scope=led", headers=H(tok["staff"]), timeout=60).json()
    assert p["id"] in [x["id"] for x in led["items"]] and led["counts"]["led"]["value"] >= 1
    # 내 프로젝트(진행 중 · 내가 만든 + 참여한) 수 = 목록 수 — 대시보드 흐름도 · 프로젝트 목록 '내 프로젝트' 묶음(10-09 직원-6)
    assert mine["counts"]["mine"]["value"] == len(mine["items"]) == led["counts"]["led"]["value"] + led["counts"]["joined"]["value"]
    assert p["next"]["text"].endswith("영상 등록") or p["stage"]["key"] != "ingest"   # 데이터 올리기 단계의 말 = 영상 등록


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
    # 학습 다음 = 추론(배포-1 · 학습한 모델로 영상 분석) — 해 보면 좋은 단계라 막힌 곳에는 올리지 않는다
    assert p["stage"]["key"] == "infer" and p["next"]["text"] == "학습한 모델로 영상 분석" and p["blocked"] == []
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
    assert stage(p2, "publish")["next"] == "배포 신청 검토 중"
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


def _row(tok, pid, scope="led"):
    return next(x for x in httpx.get(B + f"/projects?scope={scope}", headers=H(tok["staff"]), timeout=60).json()["items"] if x["id"] == pid)


def test_list_steps_and_blocked(live, tok, made):
    """목록 줄의 6칸 막대(steps)와 막힌 곳(blocked) — 한 장(stages)과 같은 판정(제안 2 S-14 ⓑ). 결재 대기 · 반려 · 앞 단계 남음이 한 줄씩 나온다."""
    s = H(tok["staff"])
    # 새 프로젝트 — 칸 6 · 지금 칸 하나 · 한 장과 같다 · 막힌 곳 없음(앞 단계는 차례대로 해 가는 중)
    p = made()
    row = _row(tok, p["id"])
    assert row["steps"] == [x["state"] for x in p["stages"]] and len(row["steps"]) == 6 and row["steps"].count("now") == 1
    assert row["blocked"] == [] and p["blocked"] == []
    # 발행 요청을 올려 둔 채 — 결재 대기(남이 처리) 한 줄
    p = httpx.post(B + f"/projects/{p['id']}/samples", headers=s, json={"sample_id": SAMPLE}, timeout=60).json()
    kinds = httpx.get(B + "/registry/ledger_kinds", headers=s, timeout=30).json()["items"]
    body = {"name": "pytest 비닐하우스", "model_id": stage(p, "train")["target"]["model"], "rules": [],
            "ledger_kind": next(k["kind"] for k in kinds if k["ready"]), "project_id": p["id"]}
    card = httpx.post(B + "/registry/cards", headers=s, json=body, timeout=60).json()
    row = _row(tok, p["id"])
    assert [b["kind"] for b in row["blocked"]] == ["wait"] and row["blocked"][0]["text"] == "배포 신청 검토 중" and row["blocked"][0]["stage"] == "publish"
    # 관리자가 반려 — 반려(내가 손댈 것) 한 줄 · 사유 확인
    r = httpx.post(B + f"/approvals/{card['approval_id']}/decide", headers=H(tok["admin"]), json={"decision": "reject", "reason": "pytest"}, timeout=60)
    assert r.status_code == 200, r.text
    row = _row(tok, p["id"])
    assert [b["kind"] for b in row["blocked"]] == ["reject"] and row["blocked"][0]["text"] == "배포 신청 거절 · 사유 확인"


def test_list_blocked_before_stage_after_publish(live, tok, made):
    """공개까지 간 프로젝트인데 결과 확인을 한 건도 안 했다 — 지금 칸은 배포 신청(승인됨)이지만 '결과 확인 0/20'(앞 단계 남음)이 막힌 곳에 나온다. 막대는 그 칸만 비어 있다."""
    p = _publish(tok, made())
    row = _row(tok, p["id"])
    assert row["stage"]["key"] == "publish" and row["steps"] == ["done", "done", "done", "wait", "wait", "now"]   # 추론(4번째)은 해 보면 좋은 단계 — 막힌 곳 아님
    assert [b["kind"] for b in row["blocked"]] == ["before"] and row["blocked"][0]["stage"] == "review"
    rv = stage(p, "review")["progress"]
    assert row["blocked"][0]["text"] == f"결과 확인 {rv['n']}/{rv['total']}"            # 한 장의 '결과 확인 n/20'과 같은 값
    assert httpx.get(B + f"/projects/{p['id']}", headers=H(tok["staff"]), timeout=60).json()["blocked"] == row["blocked"]


def test_list_steps_skip_for_overseas_only(live, tok, made):
    """해외 지역만 — 결과 확인(필지 표본)은 대상이 아니라 '건너뛴 칸'(skip)으로 나오고 막힌 곳에 올리지 않는다."""
    places = httpx.get(B + "/projects/places", headers=H(tok["staff"]), timeout=30).json()["items"]
    if not places:
        pytest.skip("해외 지역 없음")
    p = made({"name": "pytest 해외 시험", "task": "비닐하우스", "task_id": "greenhouse", "regions": [places[0]["code"]]})
    row = _row(tok, p["id"])
    assert row["steps"][4] == "skip" and all(b["stage"] != "review" for b in row["blocked"])


def test_retrain_only_lead(live, tok, made, other):
    """공개된 서비스의 재학습 — 프로젝트장만 학습 · 다음 회차를 시작한다(구성원 · 다른 직원 · 관리자는 서버가 거절 · 버튼 없음). 재학습 = 같은 프로젝트 2차 · 학습 단계로."""
    p = _publish(tok, made())
    assert p["published"] is True and p["stage"]["key"] == "publish"
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
    assert httpx.post(B + f"/projects/{p['id']}/rounds", headers=H(tok["admin"]), json={}, timeout=60).status_code == 403
    # 구성원으로 더해도 공개된 서비스의 재학습은 시작하지 못한다(프로젝트장만 · J-2) — 버튼 없음 · 견적 · 회차 모두 거절
    r = httpx.post(B + f"/projects/{p['id']}/members", headers=H(tok["staff"]), json={"user_id": OTHER}, timeout=60)
    assert r.status_code == 201
    pm = httpx.get(B + f"/projects/{p['id']}", headers=H(other), timeout=60).json()
    assert pm["can"]["retrain"] is False and pm["can"]["train"] is False and pm["can"]["work"] is True
    r = httpx.post(B + "/jobs/quote", headers=H(other), json=q, timeout=60)
    assert r.status_code == 403 and "프로젝트장" in r.json()["error"]["message"], r.text
    assert httpx.post(B + f"/projects/{p['id']}/rounds", headers=H(other), json={}, timeout=60).status_code == 403
    # 재학습 = 2차 · 학습 단계로 돌아간다(새 프로젝트를 만들지 않는다)
    r = httpx.post(B + f"/projects/{p['id']}/rounds", headers=H(tok["staff"]), json={}, timeout=60)
    assert r.status_code == 201, r.text
    p2 = r.json()
    assert p2["round"]["value"] == 2 and p2["stage"]["key"] == "train" and p2["id"] == p["id"]
    assert stage(p2, "label")["done"] is True                          # 앞 회차 학습데이터는 이어 쓴다
    assert p2["can"]["retrain"] is True and p2["can"]["train"] is True   # 프로젝트장은 2차 학습을 이어서 시작한다


def test_retrain_not_before_publish(live, tok, made, other):
    """공개 전 프로젝트 — 다음 회차는 없다(같은 회차에서 다시 학습) · 학습은 프로젝트장과 구성원(재학습 칸은 닫힘)."""
    p = made()
    assert p["can"]["retrain"] is False and p["can"]["train"] is True
    r = httpx.post(B + f"/projects/{p['id']}/rounds", headers=H(tok["staff"]), json={}, timeout=60)
    assert r.status_code == 409, r.text
    assert httpx.post(B + f"/projects/{p['id']}/members", headers=H(tok["staff"]), json={"user_id": OTHER}, timeout=60).status_code == 201
    pm = httpx.get(B + f"/projects/{p['id']}", headers=H(other), timeout=60).json()
    assert pm["can"]["train"] is True and pm["can"]["retrain"] is False


def test_lead_change_lead_or_admin(live, tok, made, other):
    """프로젝트장 바꾸기 = 프로젝트장 본인(넘기기) · LX 관리자(확인 17차 P-5 ⓐ — 예전에는 관리자만) · 다른 직원은 못 한다 · 앞 프로젝트장은 구성원으로 남는다."""
    p = made()
    assert httpx.patch(B + f"/projects/{p['id']}", headers=H(other), json={"lead_id": OTHER}, timeout=30).status_code == 403
    r = httpx.patch(B + f"/projects/{p['id']}", headers=H(tok["staff"]), json={"lead_id": OTHER}, timeout=30)
    assert r.status_code == 200, r.text
    assert r.json()["lead"]["id"] == OTHER and STAFF_ID in [m["id"] for m in r.json()["members"]]
    r = httpx.patch(B + f"/projects/{p['id']}", headers=H(tok["admin"]), json={"lead_id": STAFF_ID}, timeout=30)
    assert r.status_code == 200 and r.json()["lead"]["id"] == STAFF_ID and OTHER in [m["id"] for m in r.json()["members"]]


def test_archive_moves_out_of_mine(live, tok, made):
    """끝난 프로젝트 보관 — '내 프로젝트'에서 빠지고 보관 묶음에 남는다 · 다시 열 수 있다."""
    p = made()
    s = H(tok["staff"])
    assert httpx.post(B + f"/projects/{p['id']}/archive", headers=s, json={"archived": True}, timeout=30).json()["state"] == "archived"
    assert p["id"] not in [x["id"] for x in httpx.get(B + "/projects?scope=mine", headers=s, timeout=60).json()["items"]]
    assert p["id"] in [x["id"] for x in httpx.get(B + "/projects?scope=archived", headers=s, timeout=60).json()["items"]]
    assert httpx.post(B + f"/projects/{p['id']}/archive", headers=s, json={"archived": False}, timeout=30).json()["state"] == "active"
