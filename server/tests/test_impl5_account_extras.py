"""구현 5차 · 계정 · 프로젝트 셋 — 저장 용량 할당 · 늘리기 요청 · 승인(S-19) · 메모 · 파일 지우기(S-20) · 부서를 LX 조직도에서 고르기(S-21). 실서버(:8700).

GPU 0. 시험으로 바꾼 할당 · 기본 할당 · 부서 · 요청 · 알림 · 메모 · 파일 · 부서 목록은 끝에서 원래대로(부서 목록은 출처 — 누리집 조직도 CSV 에서 다시).
"""
import io
import shutil

import httpx
import pytest

from conftest import ADMIN_ID, B, H, STAFF_ID
from landxi_api import config
from test_impl2_project import OTHER, made, other, pg  # noqa: F401  (fixture 를 이 모듈에서도 쓴다)

PNG = bytes.fromhex("89504e470d0a1a0a0000000d4948445200000001000000010806000000"
                    "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082")
V = lambda e: e["value"] if isinstance(e, dict) and "value" in e else e  # noqa: E731


def _audit_mark():
    c = pg()
    n = c.execute("SELECT coalesce(max(id), 0) FROM audit_log").fetchone()[0]
    c.close()
    return n


@pytest.fixture
def quota_back():
    """시험 뒤 — test@lx.or.kr 할당 · 기본 할당 · 요청 · 알림 · 시험 감사 기록을 원래대로."""
    c = pg()
    keep = c.execute("SELECT storage_quota_gb FROM lx_users WHERE id=%s", (STAFF_ID,)).fetchone()[0]
    keep_def = c.execute("SELECT value FROM lx_settings WHERE key='storage.default_quota_gb'").fetchone()
    mark = _audit_mark()
    c.close()
    yield
    c = pg()
    c.execute("UPDATE lx_users SET storage_quota_gb=%s WHERE id=%s", (keep, STAFF_ID))
    if keep_def is None:
        c.execute("DELETE FROM lx_settings WHERE key='storage.default_quota_gb'")
    c.execute("DELETE FROM storage_requests WHERE user_id=%s AND created_at > now() - interval '1 hour' AND why LIKE 'pytest%%'", (STAFF_ID,))
    c.execute("DELETE FROM lx_notices WHERE user_id=%s AND kind='account.storage'", (STAFF_ID,))
    c.execute("DELETE FROM audit_log WHERE id > %s AND action IN ('account.quota','account.quota.default','account.storage.request',"
              "'account.storage.approve','account.storage.reject')", (mark,))
    c.close()


# ── S-19 저장 용량 할당 · 늘리기 요청 · 승인 ───────────────────────────────────────────
def test_storage_quota_request_approve_reject(live, tok, quota_back):
    s, a = H(tok["staff"]), H(tok["admin"])
    assert V(httpx.get(B + "/accounts/storage-default", headers=a, timeout=30).json()["quota_gb"]) is not None   # 처음 값 50 GB(또는 관리자가 정한 값)
    httpx.put(B + "/accounts/storage-default", headers=a, json={"quota_gb": None}, timeout=30)       # 할당 없음 경우부터(끝나면 quota_back 이 되돌림)
    me = httpx.get(B + "/me/profile", headers=s, timeout=30).json()
    used = V(me["storage"]["used"])
    assert V(me["storage"]["quota_gb"]) is None and me["storage"]["warn"] is False
    # 할당이 없으면 늘리기 요청이 필요 없다(409) — 기본은 '할당 없음'(지어내지 않음)
    r = httpx.post(B + "/me/storage-request", headers=s, json={"want_gb": 10, "why": "pytest"}, timeout=30)
    assert r.status_code == 409 and r.json()["error"]["detail"]["why"] == "no_quota"
    # 관리자가 사람마다 할당을 정한다 — 쓴 양의 90% 를 넘게(막지 않고 알리기만)
    assert httpx.post(B + f"/accounts/users/lx/{STAFF_ID}/quota", headers=s, json={"quota_gb": 1}, timeout=30).status_code == 403
    assert httpx.post(B + f"/accounts/users/lx/{STAFF_ID}/quota", headers=a, json={"quota_gb": 0}, timeout=30).status_code == 400
    assert httpx.post(B + f"/accounts/users/tenant/{STAFF_ID}/quota", headers=a, json={"quota_gb": 1}, timeout=30).status_code == 403
    q = round(used / 1e9 / 0.95, 2) or 0.01                                 # 쓴 양이 할당의 95% 쯤
    r = httpx.post(B + f"/accounts/users/lx/{STAFF_ID}/quota", headers=a, json={"quota_gb": q}, timeout=30)
    assert r.status_code == 200, r.text
    st = r.json()["storage"]
    assert V(st["quota_gb"]) == q and st["quota_own"] is True and V(st["used"]) == used
    assert V(st["pct"]) == round(used / (q * 1e9) * 100) and st["warn"] is (V(st["pct"]) >= 90)
    users = httpx.get(B + "/accounts/users?realm=lx", headers=a, timeout=30).json()
    row = next(u for u in users["items"] if u["id"] == STAFF_ID)
    assert V(row["storage"]["quota_gb"]) == q and V(row["storage"]["used"]) == used               # 계정 목록 = 내 정보(한 곳 계산)
    # 직원이 늘리기 요청 — 지금보다 작으면 400 · 이유 없으면 400 · 하나만 대기
    assert httpx.post(B + "/me/storage-request", headers=s, json={"want_gb": q, "why": "pytest"}, timeout=30).status_code == 400
    assert httpx.post(B + "/me/storage-request", headers=s, json={"want_gb": q + 1, "why": " "}, timeout=30).status_code == 400
    r = httpx.post(B + "/me/storage-request", headers=s, json={"want_gb": q + 1, "why": "pytest 2차 학습데이터 추가"}, timeout=30)
    assert r.status_code == 201, r.text
    assert V(r.json()["storage"]["pending"]["want_gb"]) == q + 1
    sr = httpx.get(B + "/me/storage", headers=s, timeout=30)                                  # 신청 이력이 있어도 열린다(숫자 봉투)
    assert sr.status_code == 200 and V(sr.json()["requests"][0]["want_gb"]) == q + 1
    assert httpx.post(B + "/me/storage-request", headers=s, json={"want_gb": q + 2, "why": "pytest"}, timeout=30).status_code == 409
    # 관리자 계정 관리 — 요청 목록(가입 신청 · 재설정과 같은 자리) · 대기 수
    assert httpx.get(B + "/accounts/summary", headers=a, timeout=30).json()["counts"]["storage"] >= 1
    items = httpx.get(B + "/accounts/requests?kind=storage", headers=a, timeout=30).json()["items"]
    it = next(x for x in items if x["login"] == "test@lx.or.kr")
    assert it["can_decide"] and V(it["want_gb"]) == q + 1 and it["why"] == "pytest 2차 학습데이터 추가"
    assert httpx.post(B + f"/accounts/storage/{it['id']}/decide", headers=s, json={"decision": "approve"}, timeout=30).status_code == 403
    # 반려 — 사유 필수 · 요청한 사람에게 알림(처리한 사람 · 사유)
    r = httpx.post(B + f"/accounts/storage/{it['id']}/decide", headers=a, json={"decision": "reject"}, timeout=30)
    assert r.status_code == 400 and r.json()["error"]["code"] == "reason_required"
    r = httpx.post(B + f"/accounts/storage/{it['id']}/decide", headers=a, json={"decision": "reject", "reason": "pytest 서버 증설 뒤 다시"}, timeout=30)
    assert r.status_code == 200 and r.json()["state"] == "rejected"
    assert httpx.post(B + f"/accounts/storage/{it['id']}/decide", headers=a, json={"decision": "approve"}, timeout=30).status_code == 409
    n = [x for x in httpx.get(B + "/projects/notices", headers=s, timeout=30).json()["items"] if x["kind"] == "account.storage"]
    assert n and "거절" in n[0]["text"] and n[0]["note"] == "pytest 서버 증설 뒤 다시" and n[0]["by_word"] == "처리한 사람" and n[0]["project"] is None
    me = httpx.get(B + "/me/profile", headers=s, timeout=30).json()
    assert me["storage"]["pending"] is None and me["storage"]["last"]["state"] == "rejected" and V(me["storage"]["quota_gb"]) == q
    # 다시 요청 → 승인 = 할당이 원하는 값 · 알림
    r = httpx.post(B + "/me/storage-request", headers=s, json={"want_gb": q + 1, "why": "pytest 다시"}, timeout=30)
    rid = next(x for x in httpx.get(B + "/accounts/requests?kind=storage", headers=a, timeout=30).json()["items"] if x["login"] == "test@lx.or.kr")["id"]
    r = httpx.post(B + f"/accounts/storage/{rid}/decide", headers=a, json={"decision": "approve"}, timeout=30)
    assert r.status_code == 200 and r.json()["state"] == "approved"
    me = httpx.get(B + "/me/profile", headers=s, timeout=30).json()
    assert V(me["storage"]["quota_gb"]) == q + 1 and me["storage"]["last"]["state"] == "approved" and me["storage"]["warn"] is False
    n = [x for x in httpx.get(B + "/projects/notices", headers=s, timeout=30).json()["items"] if x["kind"] == "account.storage"]
    assert any("늘었습니다" in x["text"] for x in n)
    log = httpx.get(B + "/accounts/log", headers=a, timeout=30).json()["items"]
    assert {"저장 용량 증량 승인", "저장 용량 증량 거절", "저장 용량 증량 신청", "저장 용량 할당"} <= {x["action_ko"] for x in log[:12]}
    # 기본 할당 — 따로 정하지 않은 계정에 쓴다(사람마다 값을 비우면 기본으로)
    assert httpx.put(B + "/accounts/storage-default", headers=s, json={"quota_gb": 5}, timeout=30).status_code == 403
    r = httpx.put(B + "/accounts/storage-default", headers=a, json={"quota_gb": 5}, timeout=30)
    assert r.status_code == 200 and V(r.json()["quota_gb"]) == 5
    r = httpx.post(B + f"/accounts/users/lx/{STAFF_ID}/quota", headers=a, json={"quota_gb": None}, timeout=30)
    assert V(r.json()["storage"]["quota_gb"]) == 5 and r.json()["storage"]["quota_own"] is False
    r = httpx.put(B + "/accounts/storage-default", headers=a, json={"quota_gb": None}, timeout=30)
    assert V(r.json()["quota_gb"]) is None
    assert V(httpx.get(B + "/me/profile", headers=s, timeout=30).json()["storage"]["quota_gb"]) is None
    ov = httpx.get(B + "/accounts/storage-overview", headers=a, timeout=30)                       # 저장 공간 전체 현황(용량-1) — 관리자만
    assert ov.status_code == 200 and V(ov.json()["disk"]["total"]) >= V(ov.json()["disk"]["free"]) > 0
    assert httpx.get(B + "/accounts/storage-overview", headers=s, timeout=30).status_code == 403
    # 기관 관리자 화면에는 이 일이 없다
    assert httpx.get(B + "/accounts/requests?kind=storage", headers=H(tok["namwon"]), timeout=30).json()["items"] == []
    assert httpx.get(B + "/accounts/storage-default", headers=H(tok["namwon"]), timeout=30).status_code == 403


# ── S-20 메모 · 파일 지우기 ─────────────────────────────────────────────────────────
def test_note_and_file_remove(live, tok, made, other):
    p = made()
    pid = p["id"]
    s, a = H(tok["staff"]), H(tok["admin"])
    try:
        memo = httpx.post(B + f"/projects/{pid}/notes", headers=s, json={"text": "pytest 잘못 올린 메모"}, timeout=30).json()["id"]
        before = V(httpx.get(B + f"/projects/{pid}", headers=s, timeout=60).json()["storage"])
        f = httpx.post(B + f"/projects/{pid}/files", headers=s, files={"file": ("pytest 지울 그림.png", PNG, "image/png")}, timeout=60)
        assert f.status_code == 201 and "lead_storage" in f.json()
        fid = f.json()["id"]
        path = next((config.DATA_ROOT / "projects" / pid / "files").glob(f"{fid}.*"))
        assert path.is_file()
        assert V(httpx.get(B + f"/projects/{pid}", headers=s, timeout=60).json()["storage"]) == before + len(PNG)
        # 구성원 · 다른 사람 — 남이 쓴 메모는 못 지운다(쓴 사람 · 프로젝트장 · 관리자만)
        assert httpx.post(B + f"/projects/{pid}/members", headers=s, json={"user_id": OTHER}, timeout=30).status_code == 201
        mine = httpx.post(B + f"/projects/{pid}/notes", headers=H(other), json={"text": "pytest 구성원 메모"}, timeout=30).json()["id"]
        log = httpx.get(B + f"/projects/{pid}/log", headers=H(other), timeout=60).json()
        flags = {x["id"]: x["can_remove"] for x in log["items"] if x["kind"] in ("memo", "file")}
        assert flags == {memo: False, fid: False, mine: True}
        assert httpx.delete(B + f"/projects/{pid}/notes/{memo}", headers=H(other), timeout=30).status_code == 403
        flags = {x["id"]: x["can_remove"] for x in httpx.get(B + f"/projects/{pid}/log", headers=s, timeout=60).json()["items"] if x.get("id")}
        assert flags == {memo: True, fid: True, mine: True}                 # 프로젝트장은 구성원 메모도
        # 쓴 사람이 메모를 지운다 — 줄이 빠지고 '메모를 지움' 한 줄(내용 없음)
        r = httpx.delete(B + f"/projects/{pid}/notes/{memo}", headers=s, timeout=30)
        assert r.status_code == 200 and r.json()["kind"] == "memo"
        assert httpx.delete(B + f"/projects/{pid}/notes/{memo}", headers=s, timeout=30).status_code == 404
        # 프로젝트장이 구성원 메모를 · LX 관리자가 파일을 지운다
        assert httpx.delete(B + f"/projects/{pid}/notes/{mine}", headers=s, timeout=30).status_code == 200
        r = httpx.delete(B + f"/projects/{pid}/notes/{fid}", headers=a, timeout=30)
        assert r.status_code == 200 and V(r.json()["storage"]) == before                         # 저장 공간이 파일 크기만큼 준다(한 곳 계산)
        assert not path.exists()                                                                   # 저장 폴더에서 빠짐
        assert V(httpx.get(B + f"/projects/{pid}", headers=s, timeout=60).json()["storage"]) == before
        assert httpx.get(B + f"/projects/{pid}/files/{fid}", headers=s, timeout=30).status_code == 404
        j = httpx.get(B + f"/projects/{pid}/log", headers=s, timeout=60).json()
        texts = [(x["text"], x["who"]) for x in j["items"][:3]]
        assert ("파일을 지움", "LX 관리자") in texts and ("메모를 지움", "LX 직원") in texts
        assert "pytest 잘못 올린 메모" not in str(j) and "pytest 지울 그림" not in str(j) and "pytest 구성원 메모" not in str(j)
        assert V(j["counts"]["memo"]) == 0 and V(j["counts"]["file"]) == 0
        c = pg()
        rows = c.execute("SELECT body, file_name, file_rel, removed_by FROM project_notes WHERE project_id=%s", (pid,)).fetchall()
        assert all(r[0] is None and r[1] is None and r[2] is None and r[3] for r in rows)               # 내용은 남기지 않는다
        au = c.execute("SELECT after FROM audit_log WHERE action='project.file' AND subject=%s", (pid,)).fetchone()[0]
        assert "name" not in au and au["bytes"] == len(PNG)
        c.close()
    finally:
        shutil.rmtree(config.DATA_ROOT / "projects" / pid, ignore_errors=True)


# ── S-21 부서를 LX 조직도에서 고르기 ────────────────────────────────────────────────
@pytest.fixture
def depts_back(tok):
    """시험 뒤 — 부서 목록을 출처(누리집 조직도 CSV)에서 다시 · test@lx.or.kr 부서 원래대로 · 시험 감사 기록 · 가입 신청 지움."""
    c = pg()
    keep = c.execute("SELECT dept FROM lx_users WHERE id=%s", (STAFF_ID,)).fetchone()[0]
    mark = _audit_mark()
    c.close()
    yield
    httpx.post(B + "/accounts/depts/reload", headers=H(tok["admin"]), json={}, timeout=30)
    c = pg()
    c.execute("UPDATE lx_users SET dept=%s WHERE id=%s", (keep, STAFF_ID))
    c.execute("DELETE FROM signup_requests WHERE login LIKE 'pytest-dept%%'")
    c.execute("DELETE FROM audit_log WHERE id > %s AND (action IN ('account.depts', 'account.signup.request') OR "
              "(action='account.profile' AND actor=%s))", (mark, STAFF_ID))
    c.close()


def test_depts_list_pick_and_admin_edit(live, tok, depts_back):
    s, a = H(tok["staff"]), H(tok["admin"])
    j = httpx.get(B + "/accounts/depts", timeout=30).json()                        # 로그인 없이(가입 신청 창)
    assert "공간정보본부 › 플랫폼사업처" in j["items"] and "전남광주지역본부" in j["items"] and "감사실 › 감사처" in j["items"]
    assert "사장" not in j["items"] and "부사장" not in j["items"] and "rows" not in j        # 최상위는 고르는 칸에 없음 · 관리자 정보 없음
    n0 = V(j["count"])
    ja = httpx.get(B + "/accounts/depts", headers=a, timeout=30).json()
    assert ja["source"].startswith("LX 누리집 조직도") and any(r["unit"] == "지역본부" for r in ja["rows"])
    # 가입 신청(LX) — 목록에 있는 부서는 목록 이름으로 · 없는 부서(지사)는 적은 그대로
    for login, dept, want in (("pytest-dept1@lx.or.kr", "플랫폼사업처", "공간정보본부 › 플랫폼사업처"),
                              ("pytest-dept2@lx.or.kr", "전남광주지역본부 남원지사", "전남광주지역본부 남원지사")):
        r = httpx.post(B + "/accounts/signup", json={"site": "app", "name": "시험 신청", "login": login, "password": "pytest-pass-1234",
                                                     "dept": dept, "consent": True}, timeout=30)
        assert r.status_code == 201, r.text
        c = pg()
        assert c.execute("SELECT dept FROM signup_requests WHERE login=%s AND state='pending'", (login,)).fetchone()[0] == want
        c.close()
    # 내 정보 — 같은 규칙 · 목록에 있나(dept_listed)
    r = httpx.patch(B + "/me/profile", headers=s, json={"dept": "공간정보본부 플랫폼사업처"}, timeout=30)
    assert r.status_code == 200 and r.json()["dept"] == "공간정보본부 › 플랫폼사업처" and r.json()["dept_listed"] is True
    r = httpx.patch(B + "/me/profile", headers=s, json={"dept": "전남광주지역본부 남원지사"}, timeout=30)
    assert r.json()["dept"] == "전남광주지역본부 남원지사" and r.json()["dept_listed"] is False
    off = httpx.get(B + "/accounts/depts", headers=a, timeout=30).json()["unlisted"]
    assert any(x["login"] == "test@lx.or.kr" for x in off)
    # 관리자 — 올리기(한 열 CSV · 조직도 모양 엑셀) 미리 보기 → 바꾸기 · 하나 더하기 · 빼기 · 출처에서 다시
    assert httpx.post(B + "/accounts/depts/parse", headers=s, files={"file": ("d.csv", b"x", "text/csv")}, timeout=30).status_code == 403
    r = httpx.post(B + "/accounts/depts/parse", headers=a, files={"file": ("d.txt", b"x", "text/plain")}, timeout=30)
    assert r.status_code == 400 and r.json()["error"]["detail"]["why"] == "type"
    csv1 = "부서\n# 메모 줄\n공간정보처\n공간정보처\n\n지적사업처\n".encode("cp949")
    r = httpx.post(B + "/accounts/depts/parse", headers=a, files={"file": ("부서.csv", csv1, "text/csv")}, timeout=30)
    assert r.status_code == 200, r.text
    assert r.json()["labels"] == ["공간정보처", "지적사업처"] and V(r.json()["skipped"]["dup"]) == 1
    from openpyxl import Workbook
    wb = Workbook()
    ws = wb.active
    for row in (["상위", "부서", "단위"], [None, "사장", "최상위"], ["사장", "가본부", "본부"], ["가본부", "나처", "처"]):
        ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    r = httpx.post(B + "/accounts/depts/parse", headers=a, files={"file": ("조직도.xlsx", buf.getvalue(), "application/octet-stream")}, timeout=30)
    assert r.status_code == 200 and r.json()["labels"] == ["가본부", "가본부 › 나처"]
    assert httpx.put(B + "/accounts/depts", headers=s, json={"rows": r.json()["rows"]}, timeout=30).status_code == 403
    r = httpx.put(B + "/accounts/depts", headers=a, json={"rows": r.json()["rows"]}, timeout=30)
    assert r.status_code == 200 and r.json()["items"] == ["가본부", "가본부 › 나처"]
    assert httpx.get(B + "/me/profile", headers=s, timeout=30).json()["dept"] == "전남광주지역본부 남원지사"   # 계정에 적힌 이름은 그대로
    r = httpx.post(B + "/accounts/depts/add", headers=a, json={"name": "다처", "parent": "가본부"}, timeout=30)
    assert r.status_code == 200 and r.json()["items"][-1] == "가본부 › 다처"
    assert httpx.post(B + "/accounts/depts/add", headers=a, json={"name": "다처", "parent": "가본부"}, timeout=30).status_code == 409
    assert httpx.post(B + "/accounts/depts/remove", headers=a, json={"label": "가본부 › 나처"}, timeout=30).json()["items"] == ["가본부", "가본부 › 다처"]
    assert httpx.post(B + "/accounts/depts/remove", headers=a, json={"label": "없는 부서"}, timeout=30).status_code == 404
    r = httpx.post(B + "/accounts/depts/reload", headers=a, json={}, timeout=30)
    assert r.status_code == 200 and V(r.json()["count"]) == n0 and r.json()["source"].startswith("LX 누리집 조직도")
