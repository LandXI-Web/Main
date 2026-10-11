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


def cover(pid, tok_staff, color=(15, 169, 160)):
    """대표 그림 올리기(원칙 186 — 배포 신청 필수) → 올린 그림 이름"""
    import io
    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGB", (480, 320), color).save(buf, "PNG")
    r = httpx.post(B + f"/release/projects/{pid}/cover", headers=H(tok_staff), files={"file": ("cover.png", buf.getvalue(), "image/png")}, timeout=60)
    assert r.status_code == 201, r.text
    return r.json()["name"]


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
        import shutil                                          # 시험으로 올린 대표 그림(원칙 186) · 카드 그림 사본
        shutil.rmtree(config.DATA_ROOT / "release" / pid, ignore_errors=True)
        for cd in cards:
            if not c.execute("SELECT 1 FROM cards WHERE id=%s", (cd,)).fetchone():
                shutil.rmtree(config.DATA_ROOT / "cards" / cd, ignore_errors=True)
    c.close()


def test_infer_view_and_guard(live, tok, made):
    """추론 탭 — 이 프로젝트 모델(학습 끝 AI 모델 정확도 봉투) · 프로젝트 영상(남원시) · 결과 목록. 다른 프로젝트 모델 · 없는 영상은 거절(대기열에 넣지 않음)."""
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
    assert r.status_code == 400 and r.json()["error"]["detail"]["field"] == "cover"      # 대표 그림 없으면 신청 못 함(원칙 186)
    cv = cover(p["id"], tok["staff"])
    r = httpx.post(B + f"/release/projects/{p['id']}/apply", headers=s,
                   json={"model_id": mid, "memo": "pytest 첫 신청", "name": "pytest 비닐하우스", "cover": cv,
                         "ledger_kind": (d["ledger_kinds"] or [{}])[0].get("kind")}, timeout=60)
    assert r.status_code == 201, r.text
    aid, ver = r.json()["approval_id"], r.json()["version"]
    assert httpx.post(B + f"/release/projects/{p['id']}/apply", headers=s, json={"model_id": mid, "cover": cv}, timeout=60).status_code == 409   # 검토 중
    assert httpx.get(B + "/release/requests", headers=s, timeout=60).status_code == 403                                           # 관리자만
    it = next(x for x in httpx.get(B + "/release/requests", headers=a, timeout=60).json()["items"] if x["id"] == aid)
    assert it["state"] == "pending" and it["memo"] == "pytest 첫 신청" and it["form"]["acc"]["unit"] == "%" and it["form"]["prev"] is None
    assert it["form"]["cover"]["name"] == cv and httpx.get(B.replace("/api/v1", "") + it["form"]["cover"]["src"], timeout=30).status_code == 200
    assert it["form"]["sample"]["images"]["value"] >= 1 and it["form"]["review"]["total"] == 20
    r = httpx.post(B + f"/approvals/{aid}/decide", headers=a, json={"decision": "reject"}, timeout=60)
    assert r.status_code == 400                                          # 거절 사유 필수
    assert httpx.post(B + f"/approvals/{aid}/decide", headers=a, json={"decision": "reject", "reason": "pytest 결과 확인 먼저"}, timeout=60).status_code == 200
    d = httpx.get(B + f"/release/projects/{p['id']}/apply", headers=s, timeout=60).json()
    assert d["status"]["state"] == "rejected" and d["status"]["reason"] == "pytest 결과 확인 먼저" and d["next_version"] == ver
    r = httpx.post(B + f"/release/projects/{p['id']}/apply", headers=s, json={"model_id": mid, "memo": "pytest 고쳐서", "cover": cv}, timeout=60)
    assert r.status_code == 201 and r.json()["again"] is True and r.json()["version"] == ver, r.text
    aid2 = r.json()["approval_id"]
    assert httpx.post(B + f"/approvals/{aid2}/decide", headers=a, json={"decision": "approve", "reason": "pytest"}, timeout=60).status_code == 200
    d = httpx.get(B + f"/release/projects/{p['id']}/apply", headers=s, timeout=60).json()
    assert d["status"]["state"] == "approved" and d["status"]["version"] == ver
    # 승인되면 대표 그림이 분석하기 카드 그림(서버 scene · 원칙 186) · 다음 신청은 '지금 그림 그대로'를 고를 수 있다
    assert d["cover"]["current"] and d["cover"]["current"].startswith("/api/v1/cards/files/")
    cd = httpx.get(B + f"/cards/{d['service']['id']}", headers=s, timeout=60).json()
    assert cd["scene"]["src"] == d["cover"]["current"] and httpx.get(B.replace("/api/v1", "") + cd["scene"]["src"], timeout=30).status_code == 200
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
    aid = httpx.post(B + f"/release/projects/{p['id']}/apply", headers=s, json={"model_id": mid, "name": "pytest 공유 서비스", "cover": cover(p["id"], tok["staff"]),
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


def test_infer_settings_defaults_and_guard(live, tok, made):
    """질문 6 ⓐ — 추론 설정 두 가지(신뢰도 기준 · 최소 크기). 기본값 = 서버 값(0.25 · 4㎡) · 범위 밖은 사람 말로 거절(대기열에 넣지 않음)."""
    p = made()
    s = H(tok["staff"])
    d = httpx.get(B + f"/release/projects/{p['id']}/infer", headers=s, timeout=60).json()
    assert d["settings"]["default"] == {"conf": 0.25, "min_area_m2": 4.0}
    img, mid = d["imagery"]["project"][0]["id"], d["models"][0]["id"]
    for bad in ({"conf": 2}, {"conf": "x"}, {"min_area_m2": -1}, {"min_area_m2": 9999}):
        r = httpx.post(B + f"/release/projects/{p['id']}/infer", headers=s, json={"model_id": mid, "imagery_id": img, **bad}, timeout=60)
        assert r.status_code == 400, (bad, r.text)


def test_apply_low_accuracy_warns_not_blocks(live, tok, made):
    """질문 9 ⓑ — 기반 모델 · 지난 판보다 정확도가 낮으면 신청서 · 관리자 신청서에 경고 한 줄(막지 않는다)."""
    p = made()
    s, a = H(tok["staff"]), H(tok["admin"])
    d = httpx.get(B + f"/release/projects/{p['id']}/apply", headers=s, timeout=60).json()
    low = [m for m in d["models"] if m["can_apply"] and m.get("low")]
    if not low:
        pytest.skip("기반보다 낮은 모델 없음")
    m = low[0]
    assert m["base"] and m["acc"]["value"] < m["base"]["acc"]["value"] and "기반 모델" in m["low"]
    r = httpx.post(B + f"/release/projects/{p['id']}/apply", headers=s,
                   json={"model_id": m["id"], "name": "pytest 낮은 정확도", "cover": cover(p["id"], tok["staff"]), "ledger_kind": (d["ledger_kinds"] or [{}])[0].get("kind")}, timeout=60)
    assert r.status_code == 201, r.text                                  # 막지 않는다
    it = next(x for x in httpx.get(B + "/release/requests", headers=a, timeout=60).json()["items"] if x["id"] == r.json()["approval_id"])
    assert it["form"]["low"] == m["low"]
