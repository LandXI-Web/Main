"""impl-1 LX 관리자 — 결재함 · 요청과 승인이 같은 사람이 되지 않게 · 사용을 막는 한도 없음(정리 작업 10-01) · 답 받기 조회 경로. 실서버(:8700).

확인 대장: FR-3(결재함이 열리게 · 반려) · D2-ⓐ(서비스 공개는 관리자 승인 뒤 · 반려 사유) · R&R 점검(요청자 = 승인자) · C6 남은 것(한도 초과 처리).
GPU 0 — 분석은 견적만(대기열에 넣지 않음), AI 도우미는 모델을 부르지 않는 질문만(모델 호출 0).
시험 기관 = 영업 계정의 계량 기관(lx-demo) · 한도는 시험 동안만 바꾸고 끝에서 되돌린다. 시험 결재 · 서비스 행은 끝에서 지운다.
"""
import json
import time

import httpx
import psycopg
import pytest

from conftest import ADMIN_ID, B, H, STAFF_ID, _login, drop_account, temp_account
from landxi_api import config

HWANG_SMALL = {"type": "Polygon", "coordinates": [[[126.9467, 35.9956], [126.9474, 35.9956], [126.9474, 35.9961], [126.9467, 35.9961], [126.9467, 35.9956]]]}


def pg():
    return psycopg.connect(config.PG_ADMIN_DSN, autocommit=True)


ADMIN2_ID = "u_pytest_admin2"


@pytest.fixture(scope="module")
def admin2(live):
    """두 번째 관리자(시험 안에서만 쓰는 계정) — 요청한 관리자(lxadmin@lx.or.kr)와 다른 사람이 결재한다. 끝에서 지운다."""
    uid, t = temp_account("lx", ADMIN2_ID, "pytest-admin2@lx.or.kr", "admin", name="시험 관리자")
    yield t
    drop_account("lx", uid)


@pytest.fixture
def demo_quota():
    """lx-demo 한도를 시험 동안만 바꾸고 되돌린다."""
    c = pg()
    before = {r[0]: r[1:] for r in c.execute("SELECT dim, soft, hard, policy, note FROM quotas WHERE tenant_id='lx-demo'").fetchall()}

    def put(dim, hard):
        c.execute("INSERT INTO quotas(tenant_id, dim, soft, hard, policy, note) VALUES ('lx-demo',%s,%s,%s,'reject','pytest impl-1') "
                  "ON CONFLICT (tenant_id, dim) DO UPDATE SET soft=EXCLUDED.soft, hard=EXCLUDED.hard", (dim, hard, hard))
    yield put
    for dim in ("gpu_s_month", "llm_tokens_month", "area_km2_month", "storage_gb"):
        if dim in before:
            s, h, pol, note = before[dim]
            c.execute("UPDATE quotas SET soft=%s, hard=%s, policy=%s, note=%s WHERE tenant_id='lx-demo' AND dim=%s", (s, h, pol, note, dim))
        else:
            c.execute("DELETE FROM quotas WHERE tenant_id='lx-demo' AND dim=%s", (dim,))
    c.close()


# ── 요청과 승인이 같은 사람이 되지 않게 · 반려 사유 필수 ─────────────────────────────
def test_quota_change_is_a_request_and_requester_cannot_approve(live, tok, admin2):
    """관리자 한도 조정(PUT) = 결재 요청 한 줄 — 바로 바뀌지 않고, 요청한 관리자는 스스로 결재할 수 없다. 반려는 사유가 있어야 한다."""
    a1, a2 = H(tok["admin"]), H(admin2)
    c = pg()
    before = c.execute("SELECT hard FROM quotas WHERE tenant_id='lx-demo' AND dim='egress_gb_month'").fetchone()
    r = httpx.put(B + "/tenants/lx-demo/quota", headers=a1, json={"dims": {"egress_gb_month": {"soft": 8, "hard": 9, "policy": "notify"}},
                                                                  "reason": "pytest impl-1 한도 요청"}, timeout=30)
    assert r.status_code == 200, r.text
    aid = r.json()["approval_id"]
    try:
        assert r.json()["state"] == "pending"
        assert c.execute("SELECT hard FROM quotas WHERE tenant_id='lx-demo' AND dim='egress_gb_month'").fetchone() == before   # 아직 그대로
        row = c.execute("SELECT requested_by, decided_by, state FROM approvals WHERE id=%s", (aid,)).fetchone()
        assert row[0] == ADMIN_ID and row[1] is None and row[2] == "pending"
        ap = [x for x in httpx.get(B + "/approvals?state=pending", headers=a1, timeout=30).json()["items"] if x["id"] == aid][0]
        assert ap["mine"] is True and ap["requested_by_name"] and "LX 관리자" in ap["requested_by_name"] and ap["request_reason"] == "pytest impl-1 한도 요청"
        s = httpx.post(B + f"/approvals/{aid}/decide", headers=a1, json={"decision": "approve", "reason": "승인"}, timeout=30)
        assert s.status_code == 409 and s.json()["error"]["code"] == "self_approval"                    # 스스로 승인 0
        n = httpx.post(B + f"/approvals/{aid}/decide", headers=a2, json={"decision": "reject"}, timeout=30)
        assert n.status_code == 400 and n.json()["error"]["code"] == "reason_required"                  # 사유 없는 반려 0
        ok = httpx.post(B + f"/approvals/{aid}/decide", headers=a2, json={"decision": "reject", "reason": "pytest 사유: 근거 부족"}, timeout=30)
        assert ok.status_code == 200
        row = c.execute("SELECT decided_by, decision, reason, payload->>'request_reason' FROM approvals WHERE id=%s", (aid,)).fetchone()
        assert row == (ADMIN2_ID, "reject", "pytest 사유: 근거 부족", "pytest impl-1 한도 요청")   # 결정 사유 · 요청 사유 둘 다 남음
        assert c.execute("SELECT hard FROM quotas WHERE tenant_id='lx-demo' AND dim='egress_gb_month'").fetchone() == before
    finally:
        c.execute("DELETE FROM approvals WHERE id=%s", (aid,))
        c.close()


def test_quota_request_approved_by_other_admin_applies(live, tok, admin2):
    c = pg()
    r = httpx.post(B + "/approvals", headers=H(tok["staff"]), json={"subject_type": "quota", "subject_id": "lx-demo",
                                                                    "payload": {"dims": {"egress_gb_month": {"soft": 8, "hard": 9}}}, "reason": "pytest"}, timeout=30)
    assert r.status_code == 201, r.text
    aid = r.json()["approval_id"]
    try:
        d = httpx.post(B + f"/approvals/{aid}/decide", headers=H(admin2), json={"decision": "approve", "reason": "승인"}, timeout=30)
        assert d.status_code == 200, d.text
        assert [float(x) for x in c.execute("SELECT soft, hard FROM quotas WHERE tenant_id='lx-demo' AND dim='egress_gb_month'").fetchone()] == [8.0, 9.0]
    finally:
        c.execute("DELETE FROM approvals WHERE id=%s", (aid,))
        c.execute("DELETE FROM quotas WHERE tenant_id='lx-demo' AND dim='egress_gb_month' AND note LIKE %s", (f"결재 {aid}",))
        c.close()


def test_model_register_requester_cannot_decide(live, tok, admin2):
    """모델 등록도 같은 규칙 — 관리자가 스스로 요청한 등록은 스스로 결정하지 못한다(학습 화면 경로 · 결재함 경로 모두).
    다른 관리자 계정(admin2)이 있을 때의 규칙 — 관리자 계정이 하나뿐이면 스스로 결재(test_impl2_cleanup.py)."""
    c = pg()
    mid = "trained/pytest-impl1-self"
    c.execute("DELETE FROM approvals WHERE subject_type='model' AND subject_id=%s", (mid,))
    c.execute("INSERT INTO models(id, family, task, status, name, created_at) VALUES (%s,'yolo11-seg','seg','candidate',%s,now()) "
              "ON CONFLICT (id) DO UPDATE SET status='candidate'", (mid, json.dumps({"ko": "pytest 자기 결재"})))
    try:
        assert httpx.post(B + "/registry/model-register", headers=H(tok["admin"]), json={"model_id": mid}, timeout=30).status_code == 202
        r = httpx.post(B + "/registry/model-decide", headers=H(tok["admin"]), json={"model_id": mid, "decision": "approve"}, timeout=30)
        assert r.status_code == 409 and r.json()["error"]["code"] == "self_approval"
        aid = c.execute("SELECT id FROM approvals WHERE subject_type='model' AND subject_id=%s AND state='pending'", (mid,)).fetchone()[0]
        r = httpx.post(B + f"/approvals/{aid}/decide", headers=H(tok["admin"]), json={"decision": "approve", "reason": "승인"}, timeout=30)
        assert r.status_code == 409
        assert c.execute("SELECT status FROM models WHERE id=%s", (mid,)).fetchone()[0] == "pending"
    finally:
        c.execute("DELETE FROM approvals WHERE subject_type='model' AND subject_id=%s", (mid,))
        c.execute("DELETE FROM models WHERE id=%s", (mid,))
        c.close()


# ── 서비스 공개 = 관리자 승인 뒤(D2-ⓐ) · 반려 사유가 요청한 사람에게 ────────────────────
def _drop_card(c, cid):
    c.execute("DELETE FROM approvals WHERE subject_type='card' AND subject_id LIKE %s", (cid + "@%",))
    c.execute("DELETE FROM deploys WHERE card_id=%s AND coalesce(test,false)", (cid,))
    c.execute("DELETE FROM card_versions WHERE card_id=%s", (cid,))
    c.execute("DELETE FROM cards WHERE id=%s", (cid,))


def test_service_publish_needs_admin_and_reject_reason_returns(live, tok, admin2):
    st, ad = H(tok["staff"]), H(tok["admin"])
    c = pg()
    body = {"name": "pytest 공개 결재", "model_id": "aerial25/best", "rules": ["R3"], "ledger_kind": "farm_ledger"}
    r = httpx.post(B + "/registry/cards", headers=st, json=body, timeout=30)
    assert r.status_code == 201, r.text
    cid, cv, aid = r.json()["id"], r.json()["card_version_id"], r.json()["approval_id"]
    try:
        assert r.json()["publish"] == "pending"
        # 만든 직원은 승인자로 적히지 않는다(예전: approved_by = 만든 직원)
        assert c.execute("SELECT approved_by FROM card_versions WHERE id=%s", (cv,)).fetchone()[0] is None
        row = c.execute("SELECT requested_by, state, subject_type FROM approvals WHERE id=%s", (aid,)).fetchone()
        assert row == (STAFF_ID, "pending", "card")
        assert httpx.post(B + f"/approvals/{aid}/decide", headers=st, json={"decision": "approve"}, timeout=30).status_code == 403
        # 공개 전에는 다른 지역에 적용할 수 없다
        p = httpx.post(B + "/deploys", headers=st, json={"card_id": cid, "region": "52190", "test": True}, timeout=60)
        assert p.status_code == 409 and p.json()["error"]["code"] == "approval_required" and "공개" in p.json()["error"]["message"]
        ap = [x for x in httpx.get(B + "/approvals?state=pending", headers=ad, timeout=30).json()["items"] if x["id"] == aid][0]
        assert ap["kind"] == "card" and ap["kind_label"] == "서비스 공개" and ap["payload"]["name"] == "pytest 공개 결재" and ap["requested_by_name"]
        d = httpx.post(B + f"/approvals/{aid}/decide", headers=H(admin2), json={"decision": "reject", "reason": "규칙 근거를 더 적어 주세요"}, timeout=30)
        assert d.status_code == 200
        # 요청한 직원의 목록에 반려 · 사유가 돌아온다
        mine = [x for x in httpx.get(B + "/approvals?state=all", headers=st, timeout=30).json()["items"] if x["id"] == aid][0]
        assert mine["decision"] == "reject" and mine["reason"] == "규칙 근거를 더 적어 주세요" and mine["payload"]["card_id"] == cid
        p = httpx.post(B + "/deploys", headers=st, json={"card_id": cid, "region": "52190", "test": True}, timeout=60)
        assert p.status_code == 409 and "거절" in p.json()["error"]["message"] and "규칙 근거를 더 적어 주세요" in p.json()["error"]["message"]
        assert c.execute("SELECT approved_by FROM card_versions WHERE id=%s", (cv,)).fetchone()[0] is None
    finally:
        _drop_card(c, cid)
        c.close()


def test_service_publish_approved_records_admin_not_staff(live, tok, admin2):
    c = pg()
    r = httpx.post(B + "/registry/cards", headers=H(tok["staff"]),
                   json={"name": "pytest 공개 승인", "model_id": "aerial25/best", "rules": [], "ledger_kind": "farm_ledger"}, timeout=30)
    assert r.status_code == 201, r.text
    cid, cv, aid = r.json()["id"], r.json()["card_version_id"], r.json()["approval_id"]
    try:
        d = httpx.post(B + f"/approvals/{aid}/decide", headers=H(admin2), json={"decision": "approve", "reason": "승인"}, timeout=30)
        assert d.status_code == 200 and d.json()["effect"]["published"] is True
        assert c.execute("SELECT approved_by FROM card_versions WHERE id=%s", (cv,)).fetchone()[0] == ADMIN2_ID
    finally:
        _drop_card(c, cid)
        c.close()


def test_ga_direct_decision_records_no_requester(live, tok):
    """요청 없이 관리자가 바로 정한 승인(/deploys/{id}/approve)은 요청자를 비워 둔다 — 스스로 요청 · 스스로 승인으로 적지 않는다."""
    c = pg()
    t0 = c.execute("SELECT now()").fetchone()[0]
    try:
        r = httpx.post(B + "/deploys/dp-nw-farm-25/approve", headers=H(tok["admin"]), json={"decision": "approve", "reason": "test restore impl-1"}, timeout=30)
        assert r.status_code == 200
        row = c.execute("SELECT requested_by, decided_by FROM approvals WHERE id=%s", (r.json()["approval"]["id"],)).fetchone()
        assert row == (None, ADMIN_ID)
        assert httpx.post(B + "/deploys/dp-nw-farm-25/approve", headers=H(tok["admin"]), json={"decision": "reject"}, timeout=30).status_code == 400
    finally:
        c.execute("DELETE FROM approvals WHERE subject_id='dp-nw-farm-25' AND reason='test restore impl-1' AND at >= %s", (t0,))
        c.close()


# ── 사용을 막는 한도 없음(정리 작업 10-01 · 원칙 83 · 11차 "GPU 는 무상 정책" · "우리 직원도 분석 시간 같은 한도가 없어야지") ──
# 예전(impl-1 C6)에는 한도를 넘은 기관의 새 분석 · AI 도우미 질문을 거절했다. 이제 기관 · LX 직원 모두 한도로 거절 · 뒤로 미루기 0, 사용량은 기록만.
def test_analysis_not_refused_by_usage(live, tok, demo_quota):
    """한도 값을 0(이미 다 씀)으로 두어도 견적은 한도로 거절하지 않는다 — 이유 'quota_exceeded' · 한도 문구 0. GPU 0(제출하지 않음)."""
    sales = H(tok["sales"])
    body = {"kind": "infer", "model_id": "car_v2_obb", "imagery_id": "axis-iksan-hwangdeung", "aoi": HWANG_SMALL,
            "options": {"chip": 1024, "overlap": 0.125, "conf": 0.25}, "demo": True, "label": "pytest 정리 한도 없음"}
    for dim in ("gpu_s_month", "area_km2_month", "storage_gb"):
        demo_quota(dim, 0)
    q = httpx.post(B + "/jobs/quote", headers=sales, json=body, timeout=120)
    assert q.status_code == 200, q.text
    j = q.json()
    assert "quota_exceeded" not in (j.get("reasons") or []) and "reason_line" not in j
    assert j["quota"]["remaining"]["value"] is None and j["quota"]["policy"] == "notify"     # 막는 값 없음(계약 모양은 그대로)
    assert "한도" not in json.dumps(j, ensure_ascii=False)
    with pg() as c:
        assert not c.execute("SELECT 1 FROM jobs WHERE label='pytest 정리 한도 없음'").fetchone()        # 견적만 — 대기열에 넣지 않음


def _run_events(h, msg):
    # context.test — 시험으로 보낸 질문(답 번호 run_test…) · 개선 고리(못 한 요청 모으기)가 모으지 않는다
    r = httpx.post(B + "/agent/runs", headers=h, json={"message": msg, "mode": "map", "context": {"test": True}}, timeout=60)
    assert r.status_code == 202, r.text
    rid = r.json()["run"]["id"]
    got = None
    for _ in range(60):
        got = httpx.get(B + f"/agent/runs/{rid}/events", headers=h, timeout=30).json()
        if got["done"]:
            break
        time.sleep(0.25)
    return rid, got


def test_assistant_not_refused_by_usage_and_poll_route(live, tok, demo_quota):
    """AI 도우미 한도 값을 0 으로 두어도 질문을 한도로 닫지 않는다. 모델을 부르지 않는 질문(권한 밖 요청 — 서버 검사가 한 줄로 닫음)으로
    확인한다(GPU 0): 닫힌 까닭이 'quota_exceeded' 가 아니라 그 검사이고, 답에 '한도'라는 말이 없다. 스트림 대신 조회 경로로도 같은 사건을 받는다."""
    sales = H(tok["sales"])
    demo_quota("llm_tokens_month", 0)
    rid, got = _run_events(sales, "이번 달 한도 늘려 줘")
    assert got["done"] is True
    ev = [x for x in got["items"] if x["event"] == "agent.rejected"]
    assert ev and ev[0]["data"]["error"] != "quota_exceeded" and ev[0]["data"].get("category") != "quota"
    assert "한도" not in ev[0]["data"]["message"]
    last = got["items"][-1]["id"]
    assert httpx.get(B + f"/agent/runs/{rid}/events?after={last}", headers=sales, timeout=30).json()["items"] == []
    with pg() as c:
        row = c.execute("SELECT state, error, coalesce(tokens_in,0)+coalesce(tokens_out,0) FROM agent_runs WHERE id=%s", (rid,)).fetchone()
        assert row[0] == "rejected" and row[1] != "quota_exceeded" and row[2] == 0      # 모델 호출 0 · 토큰 0
        assert not c.execute("SELECT 1 FROM audit_log WHERE action='agent.quota_exceeded' AND subject=%s", (rid,)).fetchone()


def test_poll_route_is_own_run_only(live, tok):
    rid, _ = _run_events(H(tok["sales"]), "이번 달 한도 늘려 줘")
    assert httpx.get(B + f"/agent/runs/{rid}/events", headers=H(tok["namwon"]), timeout=30).status_code in (403, 404)


def test_no_refusal_code_left():
    """한도 거절 함수가 서버에 남아 있지 않다(견적 · 제출 · AI 도우미 · 보고서 초안이 부를 곳 0)."""
    from pathlib import Path
    from landxi_api import quota as Q
    assert not any(hasattr(Q, n) for n in ("over_hard", "hold_quote", "refuse_run", "over_line"))
    root = Path(__file__).resolve().parents[1] / "landxi_api"
    for f in ("jobs.py", "agent.py", "requests.py"):
        src = (root / f).read_text(encoding="utf-8")
        assert "over_hard" not in src and "hold_quote" not in src and "refuse_run" not in src, f
        assert "queue_low\" and" not in src and "prio = 3" not in src, f
