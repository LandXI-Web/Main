"""구현 5차 2묶음 · 기관 화면(확인 대장 18차 촬영-1 ⓑ · N-1 ⓐ · 기관-9 ⓑ) — 실서버(:8700).

· 촬영 요청 — 대략 비용 = 넓이 ÷ 기준 넓이 × 고시 금액(config/fees.yaml 한 곳 · 천 원 단위) · 관할 밖 0 · LX 계정은 보내지 않음 ·
  받는 쪽 = LX 관리자(답 · 반려 사유 필수 · LX 직원 403) · 기관은 답을 보고 진행 · 취소 · 알림 칸(종) 다른 할 일
· 서비스 이력 · 통계 — 그 서비스 기록만 · 부서 사용자는 정해 준 서비스만(404) · 통계 큰 숫자 = 대표 수치 요약 같은 값 · 읍면 칸 합 = 전체
· 필지 메모 + 다음 확인 날짜 — 상태는 그대로 · 기록 한 줄(이력 '확인 기록') · 기관 관리자만 · 지난 날짜 400
· 새 결과 알림 — 종(다른 할 일 '새 결과') · 메일은 설정이 있을 때만(설정 없으면 0통 · 화면 '메일 알림은 설정 뒤')
만든 요청 · 기록 · 시험 계정은 끝에서 지운다.
"""
import datetime as dt

import httpx
import psycopg
import pytest

from conftest import B, H, _login, drop_account, temp_account
from landxi_api import config

VIEW_ID = "u_pytest_impl5b_view"
VIEW_LOGIN = "pytest-impl5b-view@namwon.go.kr"
MGR_ID = "u_pytest_impl5b_mgr"
MGR_LOGIN = "pytest-impl5b-mgr@namwon.go.kr"


def pg():
    return psycopg.connect(config.PG_ADMIN_DSN, autocommit=True)


def get(path, h=None, **kw):
    return httpx.get(B + path, headers=h or {}, timeout=60, **kw)


def post(path, h=None, body=None):
    return httpx.post(B + path, headers=h or {}, json=body or {}, timeout=60)


@pytest.fixture(scope="module")
def T(live):
    pw = config.DEV_PASSWORD
    _, view = temp_account("tenant", VIEW_ID, VIEW_LOGIN, "viewer", "namwon", name="시험 부서 사용자")
    _, mgr = temp_account("tenant", MGR_ID, MGR_LOGIN, "manager", "namwon", name="시험 기관 관리자")
    t = {
        "nw": H(_login({"realm": "tenant", "tenant_id": "namwon", "login": "lxadmin@lx.or.kr", "password": pw, "site": "gov"})),
        "view": H(view), "mgr": H(mgr),
        "staff": H(_login({"realm": "lx", "login": "test@lx.or.kr", "password": pw})),
        "admin": H(_login({"realm": "lx", "login": "lxadmin@lx.or.kr", "password": pw})),
        "shoots": [], "events": [], "logs": [], "restore": [],
    }
    yield t
    with pg() as c:
        for sid in t["shoots"]:
            c.execute("DELETE FROM shoot_requests WHERE id=%s", (sid,))
        for cid in t["events"]:
            c.execute("DELETE FROM survey_finding_events WHERE client_id=%s", (cid,))
        for fid, note, planned in t["restore"]:
            c.execute("UPDATE survey_findings SET note=%s, planned_for=%s WHERE id=%s", (note, planned, fid))
        for lid in t["logs"]:
            c.execute("DELETE FROM space_log WHERE id=%s", (lid,))
        c.execute("DELETE FROM space_reads WHERE user_id IN (%s, %s)", (VIEW_ID, MGR_ID))
    drop_account("tenant", VIEW_ID)
    drop_account("tenant", MGR_ID)


def _box(T, d=0.004):
    regs = get("/regions", T["nw"]).json()["items"]
    x, y = regs[0]["center"]
    return {"type": "Polygon", "coordinates": [[[x - d, y - d], [x + d, y - d], [x + d, y + d], [x - d, y + d], [x - d, y - d]]]}


# ── 촬영 요청 ──────────────────────────────────────────────────────────────────
def test_shoot_quote_is_area_times_notice_and_scope(T):
    import yaml
    fees = yaml.safe_load(open(config.CONFIG_DIR / "fees.yaml", encoding="utf-8"))["drone_shoot"]
    r = post("/shoots/quote", T["nw"], {"aoi": _box(T)})
    assert r.status_code == 200, r.text
    q = r.json()
    km2 = q["area_km2"]["value"]
    assert 0.3 < km2 < 1.5
    rt = {"군 지역": "gun", "시 지역": "si", "구 지역": "gu"}[q["region_type_word"]]
    assert q["region_type_word"] == "시 지역"                       # 남원시
    want = round(km2 / float(fees["unit_km2"]) * int(fees["per_unit"][rt]), -3)
    assert abs(q["approx"]["value"] - want) <= 1000                    # 화면에 보이는 넓이 × 고시 금액 = 대략 비용(천 원 단위)
    assert q["approx"]["basis"] == "estimate" and "대략" in (q["approx"].get("note") or "")
    seoul = {"type": "Polygon", "coordinates": [[[126.97, 37.56], [126.98, 37.56], [126.98, 37.57], [126.97, 37.57], [126.97, 37.56]]]}
    out = post("/shoots/quote", T["nw"], {"aoi": seoul})
    assert out.status_code == 400 and out.json()["error"]["code"] == "out_of_scope"
    assert post("/shoots/quote", T["admin"], {"aoi": _box(T)}).status_code == 403          # LX 계정은 보내지 않는다
    big = _box(T, d=0.2)
    assert post("/shoots/quote", T["nw"], {"aoi": big}).json()["error"]["code"] in ("too_large", "out_of_scope")


def test_shoot_flow_admin_answers_tenant_accepts_and_bell(T):
    r = post("/shoots", T["nw"], {"aoi": _box(T), "timing": "2026년 10월 하순", "card": "card-farm", "memo": "시험 — 추수 전에"})
    assert r.status_code == 201, r.text
    x = r.json(); T["shoots"].append(x["id"])
    assert x["state"] == "sent" and x["mine"] is True and x["approx"]["value"] > 0
    mine = get("/shoots", T["nw"]).json()["items"]
    assert any(i["id"] == x["id"] and i["card_name"] == "영농관리 행정서비스" for i in mine)
    # 받는 쪽 = LX 관리자(기관 · 보낸 사람 이름이 보인다) · LX 직원은 아직 받지 않는다
    adm = get("/shoots", T["admin"]).json()
    one = next(i for i in adm["items"] if i["id"] == x["id"])
    assert one["org"] and "sender" in one and one["aoi"]["type"] in ("Polygon", "MultiPolygon")
    assert get("/shoots", T["staff"]).status_code == 403
    bell = get("/reviews/notify", T["admin"]).json()
    assert any(e["kind"] == "shoot" and e["n"] >= 1 for e in bell["extra"])
    # 답 — 시기 필수 · 반려는 사유 필수 · 직원 403
    assert post(f"/shoots/{x['id']}/answer", T["admin"], {"amount": "1000"}).status_code == 400
    assert post(f"/shoots/{x['id']}/answer", T["admin"], {"reject": True}).status_code == 400
    assert post(f"/shoots/{x['id']}/answer", T["staff"], {"timing": "10월", "amount": "1"}).status_code == 403
    a = post(f"/shoots/{x['id']}/answer", T["admin"], {"timing": "10월 하순 맑은 날", "amount": "3,500,000", "line": "분석 대가 포함"})
    assert a.status_code == 200, a.text
    assert a.json()["state"] == "answered" and a.json()["answer"]["amount"]["value"] == 3500000
    tb = get("/reviews/notify", T["nw"]).json()
    assert any(e["kind"] == "shoot_ans" and e["href"].endswith("tab=sent") for e in tb["extra"])
    assert post(f"/shoots/{x['id']}/accept", T["nw"]).json()["state"] == "accepted"
    assert post(f"/shoots/{x['id']}/cancel", T["nw"]).status_code == 409                    # 진행한 뒤에는 취소가 아니라 LX 와 이야기
    assert get(f"/shoots/{x['id']}", T["admin"]).json()["state_word"] == "진행"


# ── 이력 · 통계 ────────────────────────────────────────────────────────────────
def test_history_lists_this_service_and_respects_assignment(T):
    j = get("/history?card=card-farm", T["nw"]).json()
    ats = [i["at"] for i in j["items"]]
    assert ats == sorted(ats, reverse=True)
    assert {i["kind"] for i in j["items"]} <= {"publish", "analysis", "check", "review", "request", "shoot", "download"}
    assert sum(e["value"] for e in j["counts"].values()) == len(j["items"])
    assert all(i["kind_ko"] for i in j["items"]) and j["survey"] is True
    assert not any("pnu" in (i.get("title") or "") for i in j["items"])
    assert get("/history?card=card-farm", T["view"]).status_code == 404                    # 배정 없는 부서 사용자
    assert get("/history?card=card-marine", T["nw"]).status_code == 404                    # 다른 기관 서비스
    assert get("/history?card=card-farm", T["admin"]).status_code in (401, 403)


def test_stats_numbers_match_summary_and_emd_sum(T):
    j = get("/history/stats?card=card-farm", T["nw"]).json()
    s = get("/summary?region=52190", T["nw"]).json()
    fc = [i for i in s["items"] if i["card"] == "card-farm" and i.get("metrics", {}).get("field_check")]
    if fc:
        assert j["numbers"]["field_check"]["value"] == fc[0]["metrics"]["field_check"]["value"]
    assert sum(e["prio_a"]["value"] for e in j["emd"]) == j["numbers"]["prio_a"]["value"]
    assert sum(e["suspect"]["value"] for e in j["emd"]) == j["numbers"]["suspect"]["value"]
    assert j["numbers"]["field_check"]["value"] <= j["numbers"]["prio_a"]["value"]
    m = get("/history/stats?card=card-farm&period=month", T["nw"]).json()
    assert m["checks"]["value"] <= j["checks"]["value"]


# ── 필지 메모 · 다음 확인 날짜(판정 버튼 없음) ─────────────────────────────────────
def test_note_keeps_state_and_lands_in_history(T):
    f = get("/survey/findings?state=open&limit=1&sort=score&sgg=52190", T["nw"]).json()["items"][0]
    with pg() as c:
        row = c.execute("SELECT note, planned_for, state FROM survey_findings WHERE id=%s", (f["id"],)).fetchone()
    T["restore"].append((f["id"], row[0], row[1]))
    day = (dt.date.today() + dt.timedelta(days=5)).isoformat()
    assert post(f"/survey/findings/{f['id']}/note", T["view"], {"note": "x"}).status_code == 403   # 기관 관리자만
    past = (dt.date.today() - dt.timedelta(days=1)).isoformat()
    assert post(f"/survey/findings/{f['id']}/note", T["nw"], {"planned_for": past}).status_code == 400
    assert post(f"/survey/findings/{f['id']}/note", T["nw"], {}).status_code == 400
    r = post(f"/survey/findings/{f['id']}/note", T["nw"], {"note": "시험 메모 — 소유자 통화", "planned_for": day})
    assert r.status_code == 200, r.text
    with pg() as c:
        ev = c.execute("SELECT client_id, from_state, to_state FROM survey_finding_events WHERE finding_id=%s ORDER BY at DESC LIMIT 1", (f["id"],)).fetchone()
        st = c.execute("SELECT state, planned_for FROM survey_findings WHERE id=%s", (f["id"],)).fetchone()
    T["events"].append(ev[0])
    assert ev[1] == ev[2] == row[2] == st[0]                                   # 상태는 그대로
    assert st[1].isoformat() == day
    notes = get(f"/survey/findings/{f['id']}/notes", T["nw"]).json()
    assert notes["can_write"] is True and notes["items"][0]["note"] == "시험 메모 — 소유자 통화"
    assert get(f"/survey/findings/{f['id']}/notes", T["view"]).json()["can_write"] is False
    h = get("/history?card=card-farm", T["nw"]).json()["items"]
    d = dt.date.fromisoformat(day)
    assert any(i["kind"] == "check" and f"다음 확인 {d.month}.{d.day:02d}" in i["title"] and "시험 메모" in i["sub"] for i in h)


# ── 새 결과 알림 · 메일 ─────────────────────────────────────────────────────────
def test_new_result_bell_and_mail_off(T):
    from landxi_api import mailer
    with pg() as c:
        lid = c.execute("INSERT INTO space_log(tenant_id, kind, card_id, line, backfill, at) VALUES ('namwon','guide','card-farm',"
                        "'영농관리 행정서비스 결과 설명서 시험판 — 시험', false, now()) RETURNING id").fetchone()[0]
    T["logs"].append(lid)
    b = get("/reviews/notify", T["mgr"]).json()
    res = [e for e in b["extra"] if e["kind"] == "result"]
    assert res and res[0]["n"] >= 1 and "gov-select" in res[0]["href"]
    assert b["mail"] is mailer.enabled()
    assert get("/reviews/notify", T["view"]).json()["extra"] == [] or all(e["kind"] != "result" for e in get("/reviews/notify", T["view"]).json()["extra"])   # 배정 없는 부서 사용자 0
    post("/spaces/me/read", T["mgr"])
    assert not [e for e in get("/reviews/notify", T["mgr"]).json()["extra"] if e["kind"] == "result"]   # 읽으면 빠진다
    if not mailer.enabled():
        import asyncio
        assert asyncio.run(mailer.notify_new_result("namwon", "card-farm", "영농관리 행정서비스", 9, "시험")) == 0
