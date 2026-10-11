"""impl-11 LX 관리자 관리 기능(now 페이지 답 10-10) — 요청 관리 · 기관 한 곳 · 광역 공유 시군구 · 부서별 관할 · 새 판 알림.

시험으로 만든 요청 · 공유 · 관할 · 알림은 끝나면 지운다(진행 중 데이터 0 변경). GPU 0(분석 요청은 승인하지 않는다).
"""
import secrets

import httpx
import psycopg
import pytest

from conftest import B, H, temp_account, drop_account
from landxi_api import config


def _pg():
    return psycopg.connect(config.PG_ADMIN_DSN, autocommit=True)


@pytest.fixture()
def temp_request():
    rid = "rq_t11" + secrets.token_hex(4)
    aid = "ap_t11" + secrets.token_hex(4)
    with _pg() as c:
        c.execute("INSERT INTO analysis_requests(id, tenant_id, requested_by, deploy_id, source, meta, memo, state, approval_id) "
                  "VALUES (%s,'namwon','u_namwon_mail_lxadmin','dp-nw-living-23','shared', %s::jsonb, '시험', 'pending', %s)",
                  (rid, '{"org": "남원시", "service": "생활환경 시험", "place": "시험 범위", "area_km2": 0.5}', aid))
        c.execute("INSERT INTO approvals(id, subject_type, subject_id, requested_by, state, payload, reason, tenant_id, at) "
                  "VALUES (%s,'request',%s,'u_namwon_mail_lxadmin','pending','{}'::jsonb,'시험','namwon',now())", (aid, rid))
    yield rid, aid
    with _pg() as c:
        c.execute("DELETE FROM approvals WHERE id=%s", (aid,))
        c.execute("DELETE FROM audit_log WHERE subject IN (%s, %s)", (rid, aid))
        c.execute("DELETE FROM analysis_requests WHERE id=%s", (rid,))


def test_manage_list_and_actions(tok, temp_request):
    rid, aid = temp_request
    a = H(tok["admin"])
    j = httpx.get(B + "/requests/manage", headers=a, timeout=60).json()
    it = next(x for x in j["items"] if x["id"] == rid)
    assert it["state"] == "pending" and it["eta"] and it["n"] >= 1
    assert {"running", "waiting", "wait_s"} <= set(j["strip"])
    # 급함 · 보류는 사유 필수
    r = httpx.post(B + f"/requests/{rid}/manage", headers=a, json={"action": "urgent"}, timeout=30)
    assert r.status_code == 400 and r.json()["error"]["code"] == "reason_required"
    assert httpx.post(B + f"/requests/{rid}/manage", headers=a, json={"action": "urgent", "reason": "시험 급함"}, timeout=30).status_code == 200
    j = httpx.get(B + "/requests/manage", headers=a, timeout=60).json()
    first = j["items"][0]
    assert first["id"] == rid and first["urgent"], "급함은 맨 앞"
    assert httpx.post(B + f"/requests/{rid}/manage", headers=a, json={"action": "calm"}, timeout=30).status_code == 200
    # 담당
    staff = j["staff"][0]["id"]
    assert httpx.post(B + f"/requests/{rid}/manage", headers=a, json={"action": "assign", "user_id": staff}, timeout=30).status_code == 200
    j = httpx.get(B + "/requests/manage", headers=a, timeout=60).json()
    assert next(x for x in j["items"] if x["id"] == rid)["assignee"]["id"] == staff
    # 보류 → 기관 '내 요청'에 사유 → 풀기
    assert httpx.post(B + f"/requests/{rid}/manage", headers=a, json={"action": "hold", "reason": "영상 확인 중"}, timeout=30).status_code == 200
    mine = httpx.get(B + "/requests", headers=H(tok["namwon"]), timeout=60).json()["items"]
    x = next(m for m in mine if m["id"] == rid)
    assert x["state"] == "held" and x["state_word"] == "보류" and x["reason"] == "영상 확인 중"
    assert httpx.post(B + f"/requests/{rid}/manage", headers=a, json={"action": "resume"}, timeout=30).status_code == 200
    # 처리 기록에 남는다
    j = httpx.get(B + "/requests/manage", headers=a, timeout=60).json()
    assert any(l["what"] in ("보류", "보류 풂") for l in j["log"])
    # 직원 · 기관은 관리 못 함
    assert httpx.post(B + f"/requests/{rid}/manage", headers=H(tok["staff"]), json={"action": "up"}, timeout=30).status_code == 403
    assert httpx.get(B + "/requests/manage", headers=H(tok["namwon"]), timeout=30).status_code == 403


def test_reject_from_held(tok, temp_request):
    rid, aid = temp_request
    a = H(tok["admin"])
    httpx.post(B + f"/requests/{rid}/manage", headers=a, json={"action": "hold", "reason": "시험 보류"}, timeout=30)
    r = httpx.post(B + f"/approvals/{aid}/decide", headers=a, json={"decision": "reject", "reason": "시험 거절"}, timeout=30)
    assert r.status_code == 200, r.text
    with _pg() as c:
        assert c.execute("SELECT state FROM analysis_requests WHERE id=%s", (rid,)).fetchone()[0] == "rejected"


def test_tenant_page_and_helpdesk(tok):
    a = H(tok["admin"])
    j = httpx.get(B + "/tenants/namwon/page", headers=a, timeout=120).json()
    assert j["name"] and j["host"] and j["services"] and "views" not in j          # 개별 계정 없이 요약 숫자만(원칙 177)
    assert all(k in j["counts"] for k in ("accounts", "managers", "viewers", "logins_month"))
    card = j["services"][0]["card"]
    staff = j["staff"][0]["id"]
    try:
        assert httpx.put(B + "/tenants/namwon/helpdesk", headers=a, json={"card_id": card, "user_id": staff}, timeout=30).status_code == 200
        j2 = httpx.get(B + "/tenants/namwon/page", headers=a, timeout=120).json()
        assert next(s for s in j2["services"] if s["card"] == card)["staff"]["id"] == staff
        # 검토 요청 받는 사람 = 그 담당
        rc = httpx.get(B + f"/reviews/recipient?card={card}", headers=H(tok["namwon"]), timeout=30).json()
        assert rc["recipient"]["kind"] == "staff" and rc["recipient"]["via"] == "helpdesk"
        assert httpx.put(B + "/tenants/namwon/helpdesk", headers=a, json={"shoot": True, "user_id": staff}, timeout=30).status_code == 200
        assert httpx.get(B + "/tenants/namwon/page", headers=a, timeout=120).json()["shoot"]["id"] == staff
    finally:
        with _pg() as c:
            c.execute("DELETE FROM tenant_service_staff WHERE tenant_id='namwon'")
            c.execute("DELETE FROM tenant_shoot_staff WHERE tenant_id='namwon'")
    assert httpx.get(B + "/tenants/namwon/page", headers=H(tok["staff"]), timeout=30).status_code == 403


def test_wide_share_sgg_and_retract(tok):
    a = H(tok["admin"])
    d = httpx.get(B + "/release/shares", headers=a, timeout=120).json()
    gj = next(o for o in d["orgs"] if o["id"] == "gwangju-jeonnam")
    assert gj["wide"] and len(gj["regions"]) > 1
    svc = next(s for s in d["items"] if s["version"] and not s["cells"]["gwangju-jeonnam"]["shared"])
    one = gj["regions"][0]["code"]
    try:
        r = httpx.put(B + "/release/shares", headers=a, json={"card_id": svc["id"], "tenant_id": "gwangju-jeonnam", "shared": True, "sgg": [one], "test": True}, timeout=60)
        assert r.status_code == 200 and r.json()["sgg"] == [one]
        d2 = httpx.get(B + "/release/shares", headers=a, timeout=120).json()
        assert next(s for s in d2["items"] if s["id"] == svc["id"])["cells"]["gwangju-jeonnam"]["sgg"] == [one]
        bad = httpx.put(B + "/release/shares", headers=a, json={"card_id": svc["id"], "tenant_id": "namwon", "shared": True, "sgg": ["52190"]}, timeout=60)
        assert bad.status_code == 400
        r = httpx.put(B + "/release/shares", headers=a, json={"card_id": svc["id"], "tenant_id": "gwangju-jeonnam", "shared": False, "test": True}, timeout=60)
        assert r.status_code == 200 and r.json()["shared"] is False
    finally:
        with _pg() as c:
            c.execute("DELETE FROM card_shares WHERE card_id=%s AND tenant_id='gwangju-jeonnam' AND test", (svc["id"],))


def test_dept_scope_narrows_region(tok):
    gj = H(tok["gj"])
    d = httpx.get(B + "/spaces/me/dept-scope", headers=gj, timeout=60).json()
    assert d["wide"] and d["regions"]
    one = d["regions"][0]["code"]
    other = next(r["code"] for r in d["regions"] if r["code"] != one)
    uid = "u_gj_t11_" + secrets.token_hex(3)
    login = f"t11-{secrets.token_hex(3)}@gj.go.kr"
    try:
        with _pg() as c:
            pass
        uid, t = temp_account("tenant", uid, login, "viewer", tenant_id="gwangju-jeonnam", name="시험 부서")
        with _pg() as c:
            c.execute("UPDATE tenant_users SET dept='시험과' WHERE id=%s", (uid,))
        assert httpx.put(B + "/spaces/me/dept-scope", headers=gj, json={"dept": "시험과", "sgg": [one]}, timeout=30).status_code == 200
        v = H(t)
        assert httpx.get(B + f"/regions/{one}", headers=v, timeout=60).status_code == 200
        assert httpx.get(B + f"/regions/{other}", headers=v, timeout=60).status_code == 404
        assert httpx.get(B + f"/regions/{other}", headers=gj, timeout=60).status_code == 200      # 기관 관리자는 관할 전체
        assert httpx.put(B + "/spaces/me/dept-scope", headers=gj, json={"dept": "시험과", "sgg": ["52190"]}, timeout=30).status_code == 400
        assert httpx.get(B + "/spaces/me/dept-scope", headers=H(tok["namwon"]), timeout=30).json()["wide"] is False
    finally:
        with _pg() as c:
            c.execute("DELETE FROM tenant_dept_scope WHERE tenant_id='gwangju-jeonnam' AND dept='시험과'")
        drop_account("tenant", uid)


def test_version_notice_line(tok):
    """새 판 알림 — 지금 공유받은 기관에 '새 판 n — 달라진 점 한 줄'(배포 신청 메모 첫 줄) · 같은 판은 한 번만."""
    import asyncio
    import sys
    from landxi_api import spaces, deps
    with _pg() as c:
        row = c.execute("SELECT v.id, v.card_id FROM card_versions v WHERE v.approved_by IS NOT NULL AND v.card_id='card-living' ORDER BY v.approved_at DESC NULLS LAST LIMIT 1").fetchone()
    if not row:
        pytest.skip("공유된 서비스의 승인된 판 없음")
    cv = row[0]

    async def run():
        deps._pool = None
        return await spaces.version_notice(cv, test=True)
    try:
        if sys.platform == "win32":
            asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
        sent = asyncio.run(run())
        assert "namwon" in sent
        again = asyncio.run(run())
        assert "namwon" not in again
        with _pg() as c:
            line = c.execute("SELECT line FROM space_log WHERE tenant_id='namwon' AND kind='version' AND detail->>'card_version'=%s", (cv,)).fetchone()[0]
        assert "새 판" in line
        n = httpx.get(B + "/reviews/notify", headers=H(tok["namwon"]), timeout=60).json()
        assert any(x["kind"] == "result" for x in n["extra"])
    finally:
        with _pg() as c:
            c.execute("DELETE FROM space_log WHERE kind='version' AND detail->>'card_version'=%s AND (detail->>'test')::boolean", (cv,))
