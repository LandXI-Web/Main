"""구현 5차 · 프로젝트 한 장 — 재학습 근거와 사유 · 기록 · 메모 · 파일 · 프로젝트장 넘기기 · 내 정보(확인 17차 P-3 ⓐ · P-4 ⓐ · P-5 ⓐ). 실서버(:8700).

GPU 0 — 재학습은 회차(POST /projects/{id}/rounds)까지만(학습 작업을 내지 않는다). 시험 프로젝트 · 시험 계정 · 올린 파일 · 시험 결재 행은 끝에서 지운다.
내 정보 시험은 바꾼 이름 · 부서 · 연락처를 끝에서 원래대로 돌려 놓는다.
"""
import shutil

import httpx
import pytest

from conftest import ADMIN_ID, B, H, STAFF_ID
from landxi_api import config
from test_impl2_project import OTHER, SAMPLE, _publish, made, other, pg, stage  # noqa: F401  (fixture 를 이 모듈에서도 쓴다)

PNG = bytes.fromhex("89504e470d0a1a0a0000000d4948445200000001000000010806000000"
                    "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082")


@pytest.fixture
def files_gone():
    """시험 프로젝트에 올린 파일 폴더를 끝에서 지운다(프로젝트 행은 made 가 지운다)."""
    pids = []
    yield pids.append
    for pid in pids:
        shutil.rmtree(config.DATA_ROOT / "projects" / pid, ignore_errors=True)


def _log(t, pid, kind="all"):
    return httpx.get(B + f"/projects/{pid}/log?kind={kind}", headers=H(t), timeout=60)


# ── P-4 ⓐ 기록 · 메모 · 파일 ───────────────────────────────────────────────
def test_log_memo_file_and_who_sees(live, tok, made, other, files_gone):
    """메모 한 줄 · 파일 올리기(형식 · 크기 한도) · 기록에 함께 · 구성원 · 프로젝트장 · 관리자만(다른 직원 403) · 파일 크기는 프로젝트 저장 공간에 더해진다."""
    p = made()
    files_gone(p["id"])
    s = H(tok["staff"])
    before = httpx.get(B + f"/projects/{p['id']}", headers=s, timeout=60).json()["storage"]["value"]
    j = _log(tok["staff"], p["id"]).json()
    assert [x["text"] for x in j["items"]][-1] == "프로젝트 만듦" and j["counts"]["memo"]["value"] == 0
    assert j["file_max_mb"]["value"] == 20 and "pdf" in j["file_types"] and "exe" not in j["file_types"]
    # 메모 한 줄
    assert httpx.post(B + f"/projects/{p['id']}/notes", headers=s, json={"text": "  "}, timeout=30).status_code == 400
    r = httpx.post(B + f"/projects/{p['id']}/notes", headers=s, json={"text": "pytest 함양군 북쪽 표본을 더 받기로 함"}, timeout=30)
    assert r.status_code == 201, r.text
    # 파일 — 그림 하나(받음) · 실행 파일(형식 거절) · 한도 넘는 크기(거절 · 남은 조각 없음)
    r = httpx.post(B + f"/projects/{p['id']}/files", headers=s, files={"file": ("표본 위치.png", PNG, "image/png")}, data={"text": "pytest 그림"}, timeout=60)
    assert r.status_code == 201, r.text
    fid = r.json()["id"]
    assert r.json()["bytes"]["value"] == len(PNG)
    r = httpx.post(B + f"/projects/{p['id']}/files", headers=s, files={"file": ("run.exe", b"MZ..", "application/octet-stream")}, timeout=60)
    assert r.status_code == 400 and r.json()["error"]["detail"]["why"] == "type"
    big = b"0" * (20 * 1024 * 1024 + 10)
    r = httpx.post(B + f"/projects/{p['id']}/files", headers=s, files={"file": ("큰 표.csv", big, "text/csv")}, timeout=120)
    assert r.status_code == 400 and r.json()["error"]["detail"]["why"] == "size"
    left = list((config.DATA_ROOT / "projects" / p["id"] / "files").glob("*"))
    assert len(left) == 1                                                   # 거절한 파일은 남기지 않는다
    # 기록 — 메모 · 파일이 맨 위 · 거르기 · 파일 내려받기(같은 바이트)
    j = _log(tok["staff"], p["id"]).json()
    assert [x["kind"] for x in j["items"][:2]] == ["file", "memo"]
    assert j["items"][0]["file"]["name"] == "표본 위치.png" and j["items"][0]["text"] == "pytest 그림"
    assert j["counts"]["memo"]["value"] == 1 and j["counts"]["file"]["value"] == 1
    assert [x["kind"] for x in _log(tok["staff"], p["id"], "memo").json()["items"]] == ["memo"]
    assert all(x["kind"] == "auto" for x in _log(tok["staff"], p["id"], "auto").json()["items"])
    assert "file_rel" not in str(j) and "projects/" not in str(j)           # 서버 저장 위치는 응답에 없다
    d = httpx.get(B + f"/projects/{p['id']}/files/{fid}", headers=s, timeout=60)
    assert d.status_code == 200 and d.content == PNG
    # 저장 공간 = 이은 학습데이터 + 올린 파일(한 출처) · 내 정보의 쓴 양도 같은 식
    after = httpx.get(B + f"/projects/{p['id']}", headers=s, timeout=60).json()["storage"]["value"]
    assert after == before + len(PNG)
    # 보는 사람 — 다른 직원 403(기록 · 메모 · 파일 모두) · 관리자 200 · 기관 계정 403
    assert _log(other, p["id"]).status_code == 403
    assert httpx.post(B + f"/projects/{p['id']}/notes", headers=H(other), json={"text": "x"}, timeout=30).status_code == 403
    assert httpx.get(B + f"/projects/{p['id']}/files/{fid}", headers=H(other), timeout=30).status_code == 403
    assert httpx.get(B + f"/projects/{p['id']}", headers=H(other), timeout=60).json()["can"]["log"] is False
    assert _log(tok["admin"], p["id"]).status_code == 200
    assert _log(tok["namwon"], p["id"]).status_code == 403


# ── P-5 ⓐ 프로젝트장 넘기기 ────────────────────────────────────────────────
def test_handover_by_lead_with_notice(live, tok, made, other):
    """프로젝트장 본인이 넘긴다 — 받는 사람 알림 한 줄 · 넘긴 사람은 구성원 · 기록 한 줄(메모 포함). 다른 직원은 넘기지 못한다 · 관리자는 넘긴다."""
    p = made()
    s = H(tok["staff"])
    assert httpx.post(B + f"/projects/{p['id']}/handover", headers=H(other), json={"to": OTHER}, timeout=30).status_code == 403
    assert httpx.post(B + f"/projects/{p['id']}/handover", headers=s, json={"to": STAFF_ID}, timeout=30).status_code == 400   # 이미 프로젝트장
    assert httpx.post(B + f"/projects/{p['id']}/handover", headers=s, json={"to": "u_nobody"}, timeout=30).status_code == 400
    r = httpx.post(B + f"/projects/{p['id']}/handover", headers=s, json={"to": OTHER, "note": "pytest 10월 전출로 넘깁니다"}, timeout=60)
    assert r.status_code == 200, r.text
    q = r.json()
    assert q["lead"]["id"] == OTHER and STAFF_ID in [m["id"] for m in q["members"]]
    assert q["can"]["lead"] is False and q["can"]["log"] is True              # 넘긴 사람 = 구성원(기록은 계속 본다)
    # 받는 사람 알림 — 한 줄 · 본 뒤에는 없다
    n = httpx.get(B + "/projects/notices", headers=H(other), timeout=30).json()["items"]
    mine = [x for x in n if (x.get("project") or {}).get("id") == p["id"]]
    assert len(mine) == 1 and "프로젝트장을 넘겨받았습니다" in mine[0]["text"] and mine[0]["note"] == "pytest 10월 전출로 넘깁니다"
    assert httpx.post(B + f"/projects/notices/{mine[0]['id']}/seen", headers=H(other), timeout=30).json()["ok"] is True
    assert p["id"] not in [(x.get("project") or {}).get("id") for x in httpx.get(B + "/projects/notices", headers=H(other), timeout=30).json()["items"]]
    # 기록 한 줄
    line = next(x for x in _log(tok["staff"], p["id"]).json()["items"] if x["text"] == "프로젝트장 넘김")
    assert "→" in line["sub"] and "pytest 10월 전출로 넘깁니다" in line["sub"]
    # 관리자도 넘긴다(PATCH lead_id 도 같은 길) · 앞 프로젝트장(구성원으로 남은 직원)은 넘기지 못한다
    assert httpx.post(B + f"/projects/{p['id']}/handover", headers=s, json={"to": STAFF_ID}, timeout=30).status_code == 403
    r = httpx.patch(B + f"/projects/{p['id']}", headers=H(tok["admin"]), json={"lead_id": STAFF_ID}, timeout=60)
    assert r.status_code == 200 and r.json()["lead"]["id"] == STAFF_ID and OTHER in [m["id"] for m in r.json()["members"]]


# ── P-3 ⓐ 재학습 근거 · 사유 ──────────────────────────────────────────────
def test_retrain_basis_and_reason_reach_admin(live, tok, made):
    """공개된 프로젝트 — 띠(서버 기록 시각) · 칩(검토 요청 · 새 영상 · 앞 단계) · 재학습 사유는 회차 기록 · 기록 · LX 관리자 결재 줄에 같은 말로."""
    p = _publish(tok, made())
    b = p["basis"]
    assert b and 1 <= len(b["points"]) <= 4 and all(x["at"] for x in b["points"])
    assert [x["at"] for x in b["points"]] == sorted(x["at"] for x in b["points"])
    assert {"reviews", "imagery", "before", "thin", "trained_at", "now"} <= set(b)
    assert b["before"] == "결과 확인 0/20"                                   # 앞 단계 남음 = 막힌 곳과 같은 말
    r = httpx.post(B + f"/projects/{p['id']}/rounds", headers=H(tok["staff"]), json={"reason": "성능 보완"}, timeout=60)
    assert r.status_code == 201, r.text
    p2 = r.json()
    assert p2["round"]["value"] == 2 and p2["rounds"][-1]["reason"] == "성능 보완"
    assert any(x["text"] == "2차 재학습 시작" and x["sub"] == "사유 성능 보완" for x in _log(tok["staff"], p["id"]).json()["items"])
    # 2차에서 나온 모델 등록 결재 — 관리자 결재 목록에 같은 사유(학습 작업은 내지 않고 결재 행만 만들어 본다)
    c = pg()
    mid, aid = f"pytest/{p['id']}", f"ap_pytest_{p['id'][-6:]}"
    try:
        c.execute("INSERT INTO models(id, status, sample_id, created_at) VALUES (%s,'registered',%s, now())", (mid, SAMPLE))
        c.execute("INSERT INTO approvals(id, subject_type, subject_id, requested_by, decided_by, decision, reason, state, at, decided_at, payload) "
                  "VALUES (%s,'model',%s,%s,%s,'approve','pytest','decided', now(), now(), '{}'::jsonb)", (aid, mid, STAFF_ID, ADMIN_ID))
        items = httpx.get(B + "/approvals?state=all", headers=H(tok["admin"]), timeout=60).json()["items"]
        row = next(x for x in items if x["id"] == aid)
        assert row["retrain"]["round"]["value"] == 2 and row["retrain"]["reason"] == "성능 보완" and row["retrain"]["project"] == p["name"]
        assert all(x.get("retrain") is None for x in items if x["kind"] == "model" and x["id"] != aid and x["subject"]["id"].startswith("trained/"))
    finally:
        c.execute("DELETE FROM approvals WHERE id=%s", (aid,))
        c.execute("DELETE FROM models WHERE id=%s", (mid,))
        c.close()


# ── P-5 ⓐ 내 정보(본인이 고친다) ───────────────────────────────────────────
def test_profile_self_edit_and_storage(live, tok):
    """이름 · 부서 · 연락처를 본인이 바로 고친다(승인 없음 · 감사 기록) · 아이디는 고정 · 저장 용량 = 할당(없으면 null) + 내가 프로젝트장인 프로젝트 합."""
    s = H(tok["staff"])
    me = httpx.get(B + "/me/profile", headers=s, timeout=30).json()
    keep = {k: me[k] for k in ("name", "dept", "contact")}
    try:
        assert me["login"] == "test@lx.or.kr" and me["role_ko"] == "LX 직원"
        st = me["storage"]
        assert st["quota_gb"]["value"] is None                                  # 할당 화면은 확인 전 — 지어내지 않는다
        c = pg()
        want = c.execute("SELECT coalesce(sum((SELECT coalesce(sum(bytes),0) FROM project_links l WHERE l.project_id=p.id) + "
                         "(SELECT coalesce(sum(bytes),0) FROM project_notes n WHERE n.project_id=p.id AND n.removed_at IS NULL)),0), count(*) "
                         "FROM projects p WHERE p.lead_id=%s", (STAFF_ID,)).fetchone()
        assert st["used"]["value"] == int(want[0]) and st["projects"]["value"] == int(want[1])
        assert httpx.patch(B + "/me/profile", headers=s, json={"login": "x@lx.or.kr"}, timeout=30).status_code == 400
        assert httpx.patch(B + "/me/profile", headers=s, json={"name": " "}, timeout=30).status_code == 400
        assert httpx.patch(B + "/me/profile", headers=s, json={"contact": "abc"}, timeout=30).status_code == 400
        r = httpx.patch(B + "/me/profile", headers=s, json={"dept": "pytest 공간정보처", "contact": "내선 1234"}, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["dept"] == "pytest 공간정보처" and r.json()["contact"] == "내선 1234" and sorted(r.json()["changed"]) == ["contact", "dept"]
        assert r.json()["changed_at"]
        a = c.execute("SELECT before, after FROM audit_log WHERE action='account.profile' AND actor=%s ORDER BY id DESC LIMIT 1", (STAFF_ID,)).fetchone()
        assert a[1]["dept"] == "pytest 공간정보처" and "dept" in a[0]
        c.close()
        # 기관 계정은 이 창이 없다(확인 범위 밖)
        assert httpx.get(B + "/me/profile", headers=H(tok["namwon"]), timeout=30).status_code == 403
        assert httpx.get(B + "/me/profile", headers=H(tok["sales"]), timeout=30).status_code == 200
    finally:
        httpx.patch(B + "/me/profile", headers=s, json=keep, timeout=30)
        c = pg()
        c.execute("DELETE FROM audit_log WHERE action='account.profile' AND actor=%s AND (after->>'dept' LIKE 'pytest%%' OR before->>'dept' LIKE 'pytest%%')",
                  (STAFF_ID,))
        c.close()
