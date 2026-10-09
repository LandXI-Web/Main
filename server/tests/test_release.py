"""분석 서비스 배포(10-09 확인 대장 배포-1 · 2 · 3 ⓐ · 4 · 5) — 추론 화면 값 · 배포 신청 → 거절(사유) → 고쳐서 다시 신청 → 승인 · 기관 공유 체크 · 사용 현황. 실서버(:8700).

GPU 0 — 추론은 화면 값과 거절 판정까지만(대기열에 넣지 않는다 · 실제 분석은 확인 흐름에서 한 번). 시험 프로젝트 · 카드 · 판 · 승인 요청 · 공유 기록은 끝에서 지운다.
"""
import httpx
import psycopg
import pytest

from conftest import B, H
from landxi_api import config

SAMPLE = "smp_94f1ab120e"          # 비닐하우스 학습 표본(등록된 모델 둘이 이 표본으로 학습됐다)


def pg():
    return psycopg.connect(config.PG_ADMIN_DSN, autocommit=True)


@pytest.fixture
def made(live, tok):
    ids = []

    def mk():
        r = httpx.post(B + "/projects", headers=H(tok["staff"]), json={"name": "pytest 배포 흐름", "task": "비닐하우스", "task_id": "greenhouse",
                                                                       "regions": ["52190"]}, timeout=60)
        assert r.status_code == 201, r.text
        pid = r.json()["id"]
        ids.append(pid)
        r = httpx.post(B + f"/projects/{pid}/samples", headers=H(tok["staff"]), json={"sample_id": SAMPLE}, timeout=60)
        assert r.status_code == 201, r.text
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
            c.execute("DELETE FROM card_shares WHERE card_id=%s", (cd,))
            if not c.execute("SELECT 1 FROM card_versions WHERE card_id=%s", (cd,)).fetchone():
                c.execute("DELETE FROM cards WHERE id=%s", (cd,))
        c.execute("DELETE FROM projects WHERE id=%s", (pid,))
    c.close()


def test_infer_view_and_guard(live, tok, made):
    """추론 탭 — 이 프로젝트 모델(학습 끝 검증 정확도 봉투) · 프로젝트 영상(남원시) · 결과 목록. 다른 프로젝트 모델 · 없는 영상은 거절(대기열에 넣지 않음)."""
    p = made()
    s = H(tok["staff"])
    d = httpx.get(B + f"/release/projects/{p['id']}/infer", headers=s, timeout=60).json()
    assert d["models"] and all(m["acc"]["unit"] == "%" for m in d["models"])
    assert any(i["sgg_cd"] == "52190" for i in d["imagery"]["project"])
    assert d["jobs"] == [] and d["can"]["run"] is True
    img = d["imagery"]["project"][0]["id"]
    r = httpx.post(B + f"/release/projects/{p['id']}/infer", headers=s, json={"model_id": "aerial25/best", "imagery_id": img}, timeout=60)
    assert r.status_code == 400, r.text                                  # 이 프로젝트에서 학습한 모델이 아니다
    r = httpx.post(B + f"/release/projects/{p['id']}/infer", headers=s, json={"model_id": d["models"][0]["id"], "imagery_id": "없는-영상"}, timeout=60)
    assert r.status_code == 400, r.text
    # 단계 6 — 학습 다음 '추론'
    pr = httpx.get(B + f"/projects/{p['id']}", headers=s, timeout=60).json()
    assert [x["key"] for x in pr["stages"]][3] == "infer"


def test_apply_reject_reapply_approve(live, tok, made):
    """배포 신청(첫 판) → 관리자 거절(사유 필수) → 같은 판을 고쳐서 다시 신청 → 승인. 신청서 = 서버 값 + 메모 한 칸."""
    p = made()
    s, a = H(tok["staff"]), H(tok["admin"])
    d = httpx.get(B + f"/release/projects/{p['id']}/apply", headers=s, timeout=60).json()
    assert d["first"] is True and d["status"]["state"] == "none" and d["can"]["apply"] is True
    mid = next(m["id"] for m in d["models"] if m["can_apply"])
    r = httpx.post(B + f"/release/projects/{p['id']}/apply", headers=s,
                   json={"model_id": mid, "memo": "pytest 첫 신청", "name": "pytest 비닐하우스", "ledger_kind": (d["ledger_kinds"] or [{}])[0].get("kind")}, timeout=60)
    assert r.status_code == 201, r.text
    aid, ver = r.json()["approval_id"], r.json()["version"]
    assert httpx.post(B + f"/release/projects/{p['id']}/apply", headers=s, json={"model_id": mid}, timeout=60).status_code == 409   # 검토 중
    assert httpx.get(B + "/release/requests", headers=s, timeout=60).status_code == 403                                           # 관리자만
    it = next(x for x in httpx.get(B + "/release/requests", headers=a, timeout=60).json()["items"] if x["id"] == aid)
    assert it["state"] == "pending" and it["memo"] == "pytest 첫 신청" and it["form"]["acc"]["unit"] == "%" and it["form"]["prev"] is None
    assert it["form"]["sample"]["images"]["value"] >= 1 and it["form"]["review"]["total"] == 20
    r = httpx.post(B + f"/approvals/{aid}/decide", headers=a, json={"decision": "reject"}, timeout=60)
    assert r.status_code == 400                                          # 거절 사유 필수
    assert httpx.post(B + f"/approvals/{aid}/decide", headers=a, json={"decision": "reject", "reason": "pytest 결과 확인 먼저"}, timeout=60).status_code == 200
    d = httpx.get(B + f"/release/projects/{p['id']}/apply", headers=s, timeout=60).json()
    assert d["status"]["state"] == "rejected" and d["status"]["reason"] == "pytest 결과 확인 먼저" and d["next_version"] == ver
    r = httpx.post(B + f"/release/projects/{p['id']}/apply", headers=s, json={"model_id": mid, "memo": "pytest 고쳐서"}, timeout=60)
    assert r.status_code == 201 and r.json()["again"] is True and r.json()["version"] == ver, r.text
    aid2 = r.json()["approval_id"]
    assert httpx.post(B + f"/approvals/{aid2}/decide", headers=a, json={"decision": "approve", "reason": "pytest"}, timeout=60).status_code == 200
    d = httpx.get(B + f"/release/projects/{p['id']}/apply", headers=s, timeout=60).json()
    assert d["status"]["state"] == "approved" and d["status"]["version"] == ver
    v = next(x for x in d["versions"] if x["version"] == ver)
    assert v["tries"]["value"] == 2
    pr = httpx.get(B + f"/projects/{p['id']}", headers=s, timeout=60).json()
    assert pr["stage"]["key"] == "publish" and pr["next"]["text"] == "배포 승인됨"


def test_share_check_reaches_org_and_usage(live, tok, made):
    """기관 공유 = 서비스 × 기관 체크 한 칸 — 켜면 그 기관 '서비스 선택'(브랜드 서비스 목록)에 나타나고 사용 현황에 한 줄 · 끄면 사라진다."""
    p = made()
    s, a = H(tok["staff"]), H(tok["admin"])
    d = httpx.get(B + f"/release/projects/{p['id']}/apply", headers=s, timeout=60).json()
    mid = next(m["id"] for m in d["models"] if m["can_apply"])
    aid = httpx.post(B + f"/release/projects/{p['id']}/apply", headers=s, json={"model_id": mid, "name": "pytest 공유 서비스",
                     "ledger_kind": (d["ledger_kinds"] or [{}])[0].get("kind")}, timeout=60).json()["approval_id"]
    card = httpx.get(B + f"/release/projects/{p['id']}/apply", headers=s, timeout=60).json()["service"]["id"]
    # 승인 전에는 공유할 수 없다
    r = httpx.put(B + "/release/shares", headers=a, json={"card_id": card, "tenant_id": "namwon", "shared": True, "test": True}, timeout=60)
    assert r.status_code == 409, r.text
    assert httpx.post(B + f"/approvals/{aid}/decide", headers=a, json={"decision": "approve", "reason": "pytest"}, timeout=60).status_code == 200
    assert httpx.put(B + "/release/shares", headers=s, json={"card_id": card, "tenant_id": "namwon", "shared": True}, timeout=60).status_code == 403
    r = httpx.put(B + "/release/shares", headers=a, json={"card_id": card, "tenant_id": "namwon", "shared": True, "test": True}, timeout=60)
    assert r.status_code == 200 and r.json()["shared"] is True, r.text
    br = httpx.get(B + "/brand/namwon", headers=H(tok["namwon"]), timeout=60).json()
    assert card in [x["card"] for x in br["services"]]
    sh = httpx.get(B + "/release/shares", headers=a, timeout=60).json()
    assert next(x for x in sh["items"] if x["id"] == card)["cells"]["namwon"]["shared"] is True
    u = httpx.get(B + "/release/usage", headers=a, timeout=60).json()
    assert any(x["service"]["id"] == card and x["org"]["id"] == "namwon" for x in u["items"])
    r = httpx.put(B + "/release/shares", headers=a, json={"card_id": card, "tenant_id": "namwon", "shared": False, "test": True}, timeout=60)
    assert r.status_code == 200 and r.json()["shared"] is False
    br = httpx.get(B + "/brand/namwon", headers=H(tok["namwon"]), timeout=60).json()
    assert card not in [x["card"] for x in br["services"]]
