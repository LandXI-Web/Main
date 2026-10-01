"""구현 4차 · 못 한 요청 → 서비스 개선 고리(확인 대장 16차 개선-1 · 원칙 98 · 39 · 59 · 72).

① 가리기 — 요지에 지명 · 지번 · 사람 이름 · 전화 · 메일 · 필지 번호가 남지 않는다 · 개선 표 어디에도 원문이 없다.
② 분류 — 서버 · 화면의 '할 수 없습니다'류 문구 → 여덟 분류 · 지시를 바꾸려는 문장은 모으지 않는다.
③ 모으기 — 답 끝 사건에서 저절로(record_run) · 3분 안 같은 뜻 다시 물음 · '이미 됨'이면 답에 안내(hint).
④ 화면 — 목록(LX 관리자 전부 · LX 직원 담당분만 · 기관 0) · 채택 · 보류 · 이미 됨 · 다시 고르기 · 이제 됩니다(관리자만).
⑤ 화면 신호 · 알림 — /assist/feedback(기관은 자기 답만) · /assist/notices(그 사람 것만) · seen.
⑥ 90일 지우기 — 보기만(운영 표) → 사본 표에서 실제로 지움(91일 지난 줄만).
실행: python -m pytest server/tests/test_impl4_improve.py -q   (②·① 일부는 게이트웨이 없이 돈다 · 나머지는 :8700 이 떠 있어야 한다)
운영 DB 를 쓰므로 시험이 만든 줄(시험 run · 시험 묶음 · 알림 · 물은 사람)은 끝나면 지운다. 첫 목록(10-01 점검)은 건드리지 않는다.
"""
import asyncio
import datetime as dt
import json
import secrets

import httpx
import psycopg
import pytest

from landxi_api import config, deps
from landxi_api import improve as I
from landxi_api.deps import Principal

from conftest import B, H, STAFF_ID, TENANT_ID

# 이 시험의 run id — 실제 답 번호 꼴(run_ + 숫자 12 + 16진 6)이되 날짜 자리가 000000 이라 실제 답과 겹치지 않는다. 끝나면 이 머리로 지운다.
TAG = "run_000000" + "".join(secrets.choice("0123456789") for _ in range(6))


def rid(s: str) -> str:
    import hashlib
    return TAG + hashlib.md5(s.encode()).hexdigest()[:6]
RAW = ["남원시", "운봉읍", "산내면", "대정리", "123-4", "김도윤", "010-2345-6789", "hong@lx.or.kr", "4519025021100010000", "Bishkek"]


def _sql(q, args=(), many=False):
    with psycopg.connect(config.PG_ADMIN_DSN, autocommit=True) as c:
        cur = c.execute(q, args)
        if cur.description is None:
            return None
        return cur.fetchall() if many else cur.fetchone()


def arun(coro):
    """한 번의 이벤트 루프 — 게이트웨이 공용 풀을 새로 열고 닫는다."""
    deps._pool = deps._redis = deps._pool_sys = None

    async def w():
        try:
            return await coro
        finally:
            for t in list(I._BG):
                try:
                    await t
                except Exception:  # noqa: BLE001
                    pass
            await deps.close()
    return asyncio.run(w())


class Ctx:
    def __init__(self, p, msg, run_id, context=None, steps=None):
        self.principal, self.run_id, self.state, self.context, self.steps = p, run_id, {"msg": msg}, context or {}, steps or []


def staff():
    return Principal(realm="lx", role="staff", user_id=STAFF_ID, name="시험")


def tenant():
    return Principal(realm="tenant", role="manager", tenant_id="namwon", user_id=TENANT_ID["namwon"], name="시험")


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    items = [r[0] for r in (_sql("SELECT DISTINCT item_id FROM improve_signals WHERE run_id LIKE %s", (TAG + "%",), many=True) or [])]
    _sql("DELETE FROM improve_signals WHERE run_id LIKE %s", (TAG + "%",))
    for iid in items:
        if not _sql("SELECT 1 FROM improve_signals WHERE item_id=%s LIMIT 1", (iid,)):
            _sql("DELETE FROM improve_notices WHERE item_id=%s", (iid,))
            _sql("DELETE FROM improve_items WHERE id=%s", (iid,))
    _sql("DELETE FROM improve_items WHERE gist LIKE '시험 묶음%%'")
    _sql("DELETE FROM improve_notices WHERE text LIKE '시험 알림%%'")
    _sql("DELETE FROM audit_log WHERE action LIKE 'improve.%%' AND after::text LIKE '%%시험%%'")


@pytest.fixture(scope="module")
def names():
    arun(I.ensure_names())
    assert I._NAMES["ok"] and len(I._NAMES["places"]) > 200
    return I._NAMES


# ── ① 가리기 ─────────────────────────────────────────────────────────────────────────
def test_mask_places_lots_people(names):
    cases = {
        "남원시 운봉읍으로 이동해서 비닐하우스 결과만 보여 줘": "○○으로 이동해서 비닐하우스 결과만 보기",
        "구례군 확대해 줘": "○○ 확대",
        "산동면 대기리 615 영상 설명해 줘": "○○ 영상 설명",
        "서울 강남구 역삼동 123-45 보여 줘": "○○ 보기",
        "4519025021100010000 필지 정보": "○○ 필지 정보",
        "Bishkek 지역 결과 보여 줘": "○○ 지역 결과 보기",
        "종로1가 결과": "○○ 결과",
    }
    for q, want in cases.items():
        assert I.gist(q) == want, (q, I.gist(q))
    g = I.gist("김도윤 주무관에게 010-2345-6789 hong@lx.or.kr 로 알려 줘")
    for raw in ("김도윤", "010", "hong@", "lx.or.kr"):
        assert raw not in g, g
    assert I.gist("박서연님이 올린 대장 보여 줘").startswith("○○님")
    # 해 · 건수 · 넓이 · 흔한 말은 가리지 않는다
    assert I.gist("2024년과 2025년 영상을 나란히 비교해 줘") == "2024년과 2025년 영상을 나란히 비교"
    assert I.gist("남원시 3필지 보여 줘") == "○○ 3필지 보기"
    assert I.gist("지도 이동해 줘") == "지도 이동"
    assert I.gist("이 화면에서 지도 표시해 줘") == "이 화면에서 지도 표시"
    assert I.gist("우리 시 현장 확인 필요 필지 몇 건이야?") == "우리 시 현장 확인 필요 필지 몇 건"


def test_tokens_group_same_meaning(names):
    a, b = I.tokens(I.gist("지도 화면을 이미지로 저장해 줘")), I.tokens(I.gist("지도 화면 그림으로 저장해 줘"))
    assert I.jaccard(a, b) >= 0.75
    # 다시 물음 비교는 지명을 어간으로 남긴다 — 다른 곳은 다른 질문 · 같은 곳은 같은 질문
    h1, h2, h3 = (I.same_meaning_hashes(x) for x in ("구례군 확대해 줘", "구례 확대해 줘", "남원시 확대해 줘"))
    assert I.same_meaning(h1, h2) and not I.same_meaning(h1, h3)
    assert I.same_meaning(I.same_meaning_hashes("지도 그림으로 저장해 줘"), I.same_meaning_hashes("지도를 그림으로 저장해 주세요"))
    assert not I.same_meaning(I.same_meaning_hashes("지적선 켜 줘"), I.same_meaning_hashes("보고서 초안 만들어 줘"))


# ── ② 분류 ───────────────────────────────────────────────────────────────────────────
def test_classify():
    C = I.classify
    assert C("agent.failed", {"error": "llm_unavailable"}) == [("blocked", "server")]
    assert C("agent.rejected", {"category": "no_region_data"}) == [("blocked", "nodata")]
    assert C("agent.rejected", {"category": "cross_tenant"}) == [("blocked", "scope")]
    assert C("agent.rejected", {"category": "prompt_injection"}) == []
    assert C("agent.done", {"answer_md": "그 지도 동작은 아직 할 수 없습니다."}) == [("blocked", "action")]
    assert C("agent.done", {"answer_md": "현장 확인 필요 층을 켜지 못했습니다 — 이 화면에는 그 층이 없습니다."}) == [("blocked", "screen")]
    assert C("agent.done", {"answer_md": "법령 데이터에 없습니다."}) == [("blocked", "law")]
    assert C("agent.done", {"answer_md": "어느 필지인지 찾지 못했습니다 — 지번으로 말씀해 주세요"}) == [("blocked", "parcel")]
    assert C("agent.done", {"answer_md": "해당 지역 데이터가 없습니다."}) == [("blocked", "nodata")]
    assert C("agent.done", {"answer_md": "LX 관리자 화면에서 확인할 수 있습니다."}) == [("blocked", "scope")]
    assert C("agent.done", {"answer_md": "프레임을 생성할 수 없습니다."}) == [("blocked", "other")]
    assert C("agent.done", {"answer_md": "남원시로 지도를 옮겼습니다.", "action_flags": [{"sentence": "x"}]}) == [("blocked", "action")]
    assert C("agent.done", {"answer_md": "확인 카드에서 취소해 실행하지 않았습니다."}, [{"error": "rejected_by_user"}]) == [("card_cancel", "other")]
    assert C("agent.done", {"answer_md": "현장 확인 필요 필지는 1,035필지입니다."}) == []        # 된 답은 모으지 않는다
    assert C("agent.done", {"answer_md": "됩니다", "cannot": {"kind": "law"}}) == [("blocked", "law")]   # 채팅 쪽이 실어 준 분류를 먼저


# ── ③ 모으기 · 다시 물음 · 이미 됨 안내 ──────────────────────────────────────────────────────
def test_record_run_masks_and_stores_no_raw(live, names):
    msg = "남원시 운봉읍 산내면 대정리 123-4 김도윤 010-2345-6789 hong@lx.or.kr 4519025021100010000 Bishkek 지도 그림으로 저장해 줘"
    from agent.audit import mask_pii
    masked, _ = mask_pii(msg)                     # 러너가 넘기는 글 = 기존 가리기 뒤의 글
    rid_ = rid("a")

    async def go():
        d = {"answer_md": "그 지도 동작은 아직 할 수 없습니다."}
        await I.record_run(Ctx(staff(), masked, rid_, {"region": "45190"}), "agent.done", d)
    arun(go())
    row = _sql("SELECT s.kind, s.gist, s.role, s.tenant_id, s.sgg_cd, i.gist FROM improve_signals s JOIN improve_items i ON i.id=s.item_id WHERE s.run_id=%s", (rid_,))
    assert row and row[0] == "action" and row[2] == "staff" and row[3] == "lx" and row[4] == "45190"
    dump = json.dumps(_sql("SELECT row_to_json(x)::text FROM (SELECT * FROM improve_signals WHERE run_id=%s) x", (rid_,)), ensure_ascii=False)
    dump += json.dumps([r[0] for r in _sql("SELECT row_to_json(i)::text FROM improve_items i WHERE id IN (SELECT item_id FROM improve_signals WHERE run_id=%s)",
                                           (rid_,), many=True)], ensure_ascii=False)
    for raw in RAW:
        assert raw.lower() not in dump.lower(), raw
    assert _sql("SELECT 1 FROM improve_askers a JOIN improve_signals s ON s.item_id=a.item_id WHERE s.run_id=%s AND a.user_id=%s", (rid_, STAFF_ID))


def test_reask_within_3min(live, names):
    r1, r2 = rid("b1"), rid("b2")

    async def go():
        await I.record_run(Ctx(staff(), "구례군 확대해 줘 시험", r1), "agent.done", {"answer_md": "지도를 확대했습니다."})
        for t in list(I._BG):
            await t
        await I.record_run(Ctx(staff(), "구례군으로 확대해 줘 시험", r2), "agent.done", {"answer_md": "지도를 확대했습니다."})
    arun(go())
    got = _sql("SELECT sig, kind FROM improve_signals WHERE run_id=%s", (r2,), many=True)
    assert ("reask", "other") in got, got
    # 다른 곳을 물으면 다시 물음이 아니다
    r3 = rid("b3")
    arun(I.record_run(Ctx(staff(), "강릉시 확대해 줘 시험", r3), "agent.done", {"answer_md": "지도를 확대했습니다."}))
    assert not _sql("SELECT 1 FROM improve_signals WHERE run_id=%s AND sig='reask'", (r3,))


def test_test_runs_are_not_collected(live, names):
    """시험 run(run_test… · run_t… — 실제 답 번호 꼴이 아님)은 모으지 않는다."""
    d = {"answer_md": "그 지도 동작은 아직 할 수 없습니다."}
    arun(I.record_run(Ctx(staff(), "지도 흑백 시험", "run_test0001"), "agent.done", d))
    arun(I.record_run(Ctx(staff(), "지도 흑백 시험", "run_t2610011700237e9d81"), "agent.done", d))
    assert not _sql("SELECT 1 FROM improve_signals WHERE run_id IN ('run_test0001','run_t2610011700237e9d81')")


def test_already_hint_goes_into_answer(live, names):
    iid = "ic_t" + secrets.token_hex(5)
    toks = I.tokens(I.gist("두 시점 영상 겹쳐 보기 시험"))
    _sql("INSERT INTO improve_items(id, key, kind, gist, state, already_text, already_try) VALUES (%s,%s,'action','시험 묶음 겹쳐 보기','already',%s,%s)",
         (iid, I.key_of("action", toks), "시험 안내 — XI맵 가르기에서 두 시점을 고를 수 있습니다", "XI맵 가르기 열어 줘"))
    d = {"answer_md": "그 지도 동작은 아직 할 수 없습니다."}

    async def go():
        await I._load_already()
        await I.record_run(Ctx(staff(), "두 시점 영상 겹쳐 보여 줘 시험", rid("c")), "agent.done", d)
    arun(go())
    assert d.get("hint", {}).get("text", "").startswith("시험 안내"), d
    assert d["hint"]["try"] == "XI맵 가르기 열어 줘"
    d2 = {"answer_md": "남원시로 지도를 옮겼습니다."}            # 된 답에는 싣지 않는다
    arun(I.record_run(Ctx(staff(), "두 시점 영상 겹쳐 보여 줘 시험", rid("c2")), "agent.done", d2))
    assert "hint" not in d2


# ── ④ 화면 API ──────────────────────────────────────────────────────────────────────
def test_list_scopes(tok):
    a = httpx.get(B + "/improve/items", headers=H(tok["admin"]), timeout=60)
    assert a.status_code == 200, a.text
    j = a.json()
    assert j["scope"] == "all" and j["summary"]["from_check"]["value"] == 15     # 10-01 점검 15건 = 실태 값 그대로
    chk = [x for x in j["items"] if x["source"] == "10-01 점검"]
    assert len(chk) == 12                                                         # 막힌 15건 → 12줄
    per = sorted(r[0] for r in _sql("SELECT count(*) FROM improve_signals WHERE source='check-1001' GROUP BY item_id", many=True))
    assert per == [1] * 9 + [2] * 3                                               # 실태 표의 횟수 그대로(2 · 2 · 2 · 1 × 9)
    assert all(x["reask"] is None and x["not_helpful"] is None for x in chk
               if not _sql("SELECT 1 FROM improve_signals WHERE item_id=%s AND source<>'check-1001' LIMIT 1", (x["id"],)))   # 세지 않은 칸은 비움
    s = httpx.get(B + "/improve/items", headers=H(tok["staff"]), timeout=60).json()
    assert s["scope"] == "mine" and s["counts"]["all"] <= j["counts"]["all"]
    assert httpx.get(B + "/improve/items", headers=H(tok["namwon"]), timeout=30).status_code == 403
    assert httpx.get(B + "/improve/items", headers=H(tok["sales"]), timeout=30).status_code == 403
    assert httpx.get(B + "/improve/items", timeout=30).status_code == 401


def _test_item(asker_user=None, realm="lx", tenant_id="lx"):
    iid = "ic_t" + secrets.token_hex(5)
    _sql("INSERT INTO improve_items(id, key, kind, gist) VALUES (%s,%s,'action','시험 묶음 ' || %s)", (iid, "action|시험·" + iid, iid))
    _sql("INSERT INTO improve_signals(item_id, sig, kind, gist, role, tenant_id, run_id) VALUES (%s,'blocked','action','시험',%s,%s,%s)",
         (iid, "tenant" if realm == "tenant" else "staff", tenant_id, rid(iid)))
    if asker_user:
        _sql("INSERT INTO improve_askers(item_id, realm, user_id, tenant_id) VALUES (%s,%s,%s,%s)", (iid, realm, asker_user, tenant_id))
    return iid


def test_decisions_and_now_works(tok):
    A = H(tok["admin"])
    iid = _test_item(TENANT_ID["namwon"], "tenant", "namwon")
    # 보류 — 사유 · 날짜가 있어야 한다
    assert httpx.post(B + f"/improve/items/{iid}/hold", json={"reason": "", "until": "2026-12-01"}, headers=A, timeout=30).status_code == 400
    r = httpx.post(B + f"/improve/items/{iid}/hold", json={"reason": "시험 보류", "until": (dt.date.today() + dt.timedelta(days=14)).isoformat()},
                   headers=A, timeout=30)
    assert r.status_code == 200 and r.json()["item"]["state"] == "held" and r.json()["item"]["hold"]["reason"] == "시험 보류"
    # 다시 볼 날짜가 되면 새로 옴으로
    _sql("UPDATE improve_items SET hold_until=current_date WHERE id=%s", (iid,))
    j = httpx.get(B + "/improve/items", headers=A, timeout=60).json()
    assert next(x for x in j["items"] if x["id"] == iid)["state"] == "new"
    # 채택 → 확인 대기
    r = httpx.post(B + f"/improve/items/{iid}/adopt", json={}, headers=A, timeout=30)
    assert r.status_code == 200 and r.json()["item"]["state"] == "adopted" and r.json()["item"]["ledger"] == "확인 대기"
    # LX 직원은 '이제 됩니다'를 보낼 수 없다(관리자만) · 담당 밖 줄은 보이지도 않는다
    assert httpx.post(B + f"/improve/items/{iid}/notify", json={}, headers=H(tok["staff"]), timeout=30).status_code in (403, 404)
    # 이제 됩니다 → 물은 사람(기관)에게만 한 줄
    r = httpx.post(B + f"/improve/items/{iid}/notify", json={"text": "시험 알림 — 이제 됩니다", "try": "시험 질문"}, headers=A, timeout=30)
    assert r.status_code == 200 and r.json()["item"]["state"] == "built" and r.json()["item"]["notice"]["n"]["value"] == 1
    n = httpx.get(B + "/assist/notices", headers=H(tok["namwon"]), timeout=30).json()["items"]
    mine = [x for x in n if x["text"] == "시험 알림 — 이제 됩니다"]
    assert len(mine) == 1 and mine[0]["try"] == "시험 질문"
    others = httpx.get(B + "/assist/notices", headers=H(tok["staff"]), timeout=30).json()["items"]
    assert not [x for x in others if x["id"] == mine[0]["id"]]                     # 다른 사람에게는 0
    assert httpx.post(B + f"/assist/notices/{mine[0]['id']}/seen", headers=H(tok["staff"]), timeout=30).status_code == 404
    assert httpx.post(B + f"/assist/notices/{mine[0]['id']}/seen", headers=H(tok["namwon"]), timeout=30).status_code == 204
    assert not [x for x in httpx.get(B + "/assist/notices", headers=H(tok["namwon"]), timeout=30).json()["items"] if x["id"] == mine[0]["id"]]
    # 만들어진 줄은 다시 고를 수 없다
    assert httpx.post(B + f"/improve/items/{iid}/reopen", headers=A, timeout=30).status_code == 409


def test_already_and_reopen(tok):
    A = H(tok["admin"])
    iid = _test_item()
    assert httpx.post(B + f"/improve/items/{iid}/already", json={"text": ""}, headers=A, timeout=30).status_code == 400
    r = httpx.post(B + f"/improve/items/{iid}/already", json={"text": "시험 안내 한 줄", "try": "시험 질문"}, headers=A, timeout=30)
    assert r.status_code == 200 and r.json()["item"]["already"] == {"text": "시험 안내 한 줄", "try": "시험 질문"}
    r = httpx.post(B + f"/improve/items/{iid}/reopen", headers=A, timeout=30)
    assert r.status_code == 200 and r.json()["item"]["state"] == "new"


# ── ⑤ 화면 신호 ─────────────────────────────────────────────────────────────────────
def test_feedback(tok):
    # 시험 run 두 개(기관 · LX 직원) — agent_runs 에 질문(이미 가린 글)과 답
    rt, rs = rid("fbt"), rid("fbs")
    _sql("INSERT INTO agent_runs(id, tenant_id, user_id, realm, role, mode, state, prompt_text, answer_md) VALUES "
         "(%s,'namwon',%s,'tenant','manager','map','done','운봉읍 결과 겹쳐 보여 줘 시험','운봉읍 결과입니다.'),"
         "(%s,'lx',%s,'lx','staff','map','done','지적선 켜 줘 시험','지적선 층을 켰습니다.')", (rt, TENANT_ID["namwon"], rs, STAFF_ID))
    try:
        r = httpx.post(B + "/assist/feedback", json={"run_id": rt, "kind": "not_helpful", "screen": "gov-report"}, headers=H(tok["namwon"]), timeout=30)
        assert r.status_code == 204, r.text
        s = _sql("SELECT sig, kind, gist, screen, tenant_id, source FROM improve_signals WHERE run_id=%s", (rt,))
        assert s[0] == "not_helpful" and s[3] == "할 일·보고서" and s[4] == "namwon" and s[5] == "screen" and "운봉" not in s[2]
        # 기관은 다른 기관 · LX 의 답에 신호를 보낼 수 없다(없는 답과 같은 답)
        assert httpx.post(B + "/assist/feedback", json={"run_id": rs, "kind": "not_helpful", "screen": "x"},
                          headers=H(tok["namwon"]), timeout=30).status_code == 404
        assert httpx.post(B + "/assist/feedback", json={"run_id": rt, "kind": "map_failed", "screen": "x"},
                          headers=H(tok["gj"]), timeout=30).status_code == 404
        r = httpx.post(B + "/assist/feedback", json={"run_id": rs, "kind": "map_failed", "screen": "/landxi/v3/lx-console/",
                                                     "summary": "이 화면에는 그 층이 없습니다"}, headers=H(tok["staff"]), timeout=30)
        assert r.status_code == 204
        assert _sql("SELECT kind, screen FROM improve_signals WHERE run_id=%s AND sig='map_failed'", (rs,)) == ("screen", "첫 화면")
        assert httpx.post(B + "/assist/feedback", json={"kind": "nope"}, headers=H(tok["staff"]), timeout=30).status_code == 400
        assert httpx.post(B + "/assist/feedback", json={"kind": "not_helpful"}, timeout=30).status_code == 401
        r = httpx.post(B + "/assist/feedback", json={"kind": "card_cancel", "screen": "xi-clean", "summary": "남원시 전역 분석 실행"},
                       headers=H(tok["staff"]), timeout=30)                     # run 없이도(요지는 가려서)
        assert r.status_code == 204
    finally:
        _sql("DELETE FROM agent_runs WHERE id IN (%s,%s)", (rt, rs))
        items = [x[0] for x in _sql("SELECT DISTINCT item_id FROM improve_signals WHERE source='screen' AND gist LIKE '%%전역 분석 실행%%' "
                                    "AND at > now() - interval '5 minutes' AND run_id IS NULL", many=True) or []]
        _sql("DELETE FROM improve_signals WHERE source='screen' AND run_id IS NULL AND at > now() - interval '5 minutes' AND gist LIKE '%%전역 분석 실행%%'")
        for iid in items:
            if not _sql("SELECT 1 FROM improve_signals WHERE item_id=%s LIMIT 1", (iid,)):
                _sql("DELETE FROM improve_items WHERE id=%s", (iid,))


# ── ⑥ 90일 지우기 ────────────────────────────────────────────────────────────────────
def test_purge_dry_run_then_copy():
    real = I.purge(dry_run=True, log=lambda m: None)                              # 보기만 — 운영 표는 그대로
    assert real["dry_run"] and real["askers"] >= 0 and real["notices"] >= 0
    before = _sql("SELECT (SELECT count(*) FROM improve_askers), (SELECT count(*) FROM improve_notices)")
    sch = "improve_purge_t" + secrets.token_hex(2)
    try:
        _sql(f"CREATE SCHEMA {sch}")
        _sql(f"CREATE TABLE {sch}.improve_askers (LIKE public.improve_askers INCLUDING DEFAULTS)")
        _sql(f"CREATE TABLE {sch}.improve_notices (LIKE public.improve_notices INCLUDING DEFAULTS)")
        _sql(f"INSERT INTO {sch}.improve_askers(item_id, realm, user_id, tenant_id, at) VALUES "
             "('ic_a','lx','u_old','lx', now() - interval '91 days'), ('ic_a','lx','u_new','lx', now() - interval '89 days')")
        _sql(f"INSERT INTO {sch}.improve_notices(id, item_id, realm, user_id, tenant_id, text, created_at) VALUES "
             "('in_old','ic_a','lx','u_old','lx','오래된', now() - interval '91 days'), ('in_new','ic_a','lx','u_new','lx','새', now() - interval '1 day')")
        dry = I.purge(dry_run=True, schema=sch, log=lambda m: None)
        assert dry["askers"] == 1 and dry["notices"] == 1
        assert _sql(f"SELECT count(*) FROM {sch}.improve_askers")[0] == 2          # 보기만은 지우지 않는다
        out = I.purge(dry_run=False, schema=sch, log=lambda m: None)
        assert out["askers"] == 1 and out["notices"] == 1
        assert [r[0] for r in _sql(f"SELECT user_id FROM {sch}.improve_askers", many=True)] == ["u_new"]
        assert [r[0] for r in _sql(f"SELECT id FROM {sch}.improve_notices", many=True)] == ["in_new"]
    finally:
        _sql(f"DROP SCHEMA IF EXISTS {sch} CASCADE")
    assert _sql("SELECT (SELECT count(*) FROM improve_askers), (SELECT count(*) FROM improve_notices)") == before
