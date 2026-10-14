"""구현 32 · XI ChatGEO 정기 개선 바퀴(원칙 249) — 판 · 판정 · 승인 전 시험 질문에만 · 새 도구 둘.

① 판정(improve.judge) — 답함 · 안내함 · 못 함(모으는 규칙과 같은 기준).
② 판의 도구 길(improve.tool_open) — 판에 실리기 전 닫힘 · 만드는 중 · 승인 요청 = 시험 질문에만 · 승인 = 모두 · 거절 · 되돌림 = 막음.
③ 판 API — 만들기(by 시스템) → 통과 기준 못 넘으면 409(만드는 중으로 남음) → 승인 요청 → 거절하면 묶인 줄이 새로 옴으로 · 규칙 꺼짐.
   승인 → 묶인 줄 만들어짐 · '이제 됩니다'(물은 사람 없으면 0명) · 되돌리기.
④ 평가 질문 묶음 all=1(LX 관리자만 넓게) · 새 도구 길잡이(결과 파일 내려받기 · Land-XI 소개).
실행: python -m pytest server/tests/test_impl32_loop.py -q   (게이트웨이 :8700 · GPU 0 — 모델을 부르지 않는다)
"""
import secrets

import httpx
import psycopg
import pytest

from landxi_api import config
from landxi_api import improve as I

from conftest import B, H


def _sql(q, args=()):
    with psycopg.connect(config.PG_ADMIN_DSN, autocommit=True) as c:
        cur = c.execute(q, args)
        return cur.fetchall() if cur.description else None


def test_judge():
    assert I.judge("agent.done", {"answer_md": "남원시로 지도를 옮겼습니다."}) == ("답함", None)
    assert I.judge("agent.done", {"answer_md": "해당 지역 데이터가 없습니다"}) == ("못 함", "nodata")
    assert I.judge("agent.done", {"answer_md": "해당 지역 데이터가 없습니다", "hint": {"text": "…"}}) == ("안내함", "nodata")
    assert I.judge("agent.rejected", {"category": "cross_tenant_region", "message": "구례군은 이 기관 계정에서 볼 수 없습니다.", "next": [{}]})[0] == "안내함"
    assert I.judge("agent.failed", {"error": "llm_unavailable"}) == ("못 함", "server")
    assert I.judge("agent.done", {"answer_md": "아무 말"}, confirm=True) == ("답함", None)


def test_tool_open_gate():
    from agent.tools import ext
    old = dict(I._REL), set(ext.GATED)
    try:
        ext.GATED.add("t_new")
        I._REL.update(test_only=set(), off=set(), live=set())
        assert not I.tool_open("t_new") and not I.tool_open("t_new", True)          # 판에 실리기 전 = 닫힘('전' 점수에 섞이지 않게)
        assert I.tool_open("map_task")                                               # 판 밖 도구는 늘 열림
        I._REL["test_only"] = {"t_new"}
        assert I.tool_open("t_new", True) and not I.tool_open("t_new")               # 만드는 중 · 승인 요청 = 시험 질문에만
        I._REL.update(test_only=set(), live={"t_new"})
        assert I.tool_open("t_new")                                                  # 승인 = 모두
        I._REL.update(live=set(), off={"t_new"})
        assert not I.tool_open("t_new", True)                                        # 거절 · 되돌림 = 막음
    finally:
        I._REL.clear(); I._REL.update(old[0])
        ext.GATED.clear(); ext.GATED.update(old[1])


def test_live_rule():
    assert I._live({"rel_state": "approved"}, False) and I._live({"rel_state": None}, False)
    assert I._live({"rel_state": "pending"}, True) and not I._live({"rel_state": "pending"}, False)
    assert not I._live({"rel_state": "rejected"}, True)


def test_new_tool_routes():
    from agent.tools.ext import about as A
    from agent.tools.ext import results_dl as R
    assert R.parse("분석 결과를 GeoJSON 으로 내려받고 싶어") == {"request": "분석 결과를 GeoJSON 으로 내려받고 싶어", "fmt": "geojson"}
    assert R.parse("결과 SHP로 줘")["fmt"] == "shp" and R.parse("필지 엑셀로 내려받기")["fmt"] == "parcels"
    for t in ("지도 화면을 이미지로 저장해 줘", "보고서 초안 내려받기", "남원시 결과 보여 줘"):
        assert R.parse(t) is None

    class C:
        lang = "ko"
        context = {}
        principal = type("P", (), {"realm": "lx", "role": "staff"})()
    assert A.ROUTE("Land-XI 플랫폼 창시자는 누구", C())["tool"] == "platform_about"
    for t in ("Land-XI 결과 몇 건", "안녕하세요", "남원시로 이동해 줘"):
        assert A.ROUTE(t, C()) is None
    assert {"result_files", "platform_about"} <= {"result_files", "platform_about"} & set(R.GATED | A.GATED)


@pytest.fixture()
def rel_item():
    """시험 줄 하나(새로 옴 · source 'test') — 끝나면 판 · 줄 · 규칙을 지운다."""
    iid = "ic_t32" + secrets.token_hex(4)
    _sql("INSERT INTO improve_items(id, key, kind, gist, note, source) VALUES (%s,%s,'other','온실 결과 어디','시험 줄(구현 32 · 끝나면 지움)','test')",
         (iid, "other|t32·" + iid))
    made = []
    yield iid, made
    _sql("DELETE FROM improve_rules WHERE item_id=%s", (iid,))
    _sql("DELETE FROM improve_items WHERE id=%s", (iid,))
    for rid in made:
        _sql("DELETE FROM improve_releases WHERE id=%s", (rid,))


def _new(A, made):
    r = httpx.post(B + "/improve/releases", headers=A, json={"by": "system", "tools": [], "note": "시험 판(구현 32)"}, timeout=30)
    assert r.status_code == 200, r.text
    rid = r.json()["release"]["id"]
    made.append(rid)
    return r.json()["release"]


def test_release_flow(tok, rel_item):
    iid, made = rel_item
    A, S = H(tok["admin"]), H(tok["staff"])
    rel = _new(A, made)
    assert rel["state"] == "draft" and rel["by"] == "시스템"
    assert httpx.post(B + "/improve/releases", headers=S, json={}, timeout=30).status_code == 403          # 판은 관리자 · 시스템만
    # 판에 묶어 바로 반영(by 시스템) — 줄은 '새 판 n' · 규칙에 판 번호
    r = httpx.post(B + f"/improve/items/{iid}/adopt", headers=A, json={"use": "suggest", "by": "system", "release": rel["id"], "test": True}, timeout=30)
    assert r.status_code == 200, r.text
    it = r.json()["item"]
    assert it["adopt"]["release"]["seq"] == rel["seq"] and it["adopt"]["release"]["state"] == "draft" and it["decided"]["by"] == "시스템"
    assert _sql("SELECT release_id, by FROM improve_rules WHERE item_id=%s AND active", (iid,))[0] == (rel["id"], "system")
    assert httpx.post(B + f"/improve/items/{iid}/revert", headers=A, timeout=30).status_code == 409                # 판에 묶인 줄은 판에서
    # 통과 기준 — 나빠진 질문이 있으면 내보내지 않는다
    bad = {"before": {"total": 10, "답함": 5, "안내함": 1, "못 함": 4}, "after": {"total": 10, "답함": 7, "안내함": 1, "못 함": 2}, "better": 2, "worse": 1}
    r = httpx.post(B + f"/improve/releases/{rel['id']}/submit", headers=A, json=bad, timeout=30)
    assert r.status_code == 409
    same = {**bad, "worse": 0, "after": bad["before"]}
    assert httpx.post(B + f"/improve/releases/{rel['id']}/submit", headers=A, json=same, timeout=30).status_code == 409   # 답한 수가 늘지 않음
    ok = {**bad, "worse": 0, "better_items": [iid]}
    r = httpx.post(B + f"/improve/releases/{rel['id']}/submit", headers=A, json=ok, timeout=30)
    assert r.status_code == 200, r.text
    j = r.json()["release"]
    assert j["state"] == "pending" and j["better"]["value"] == 2 and j["counts"]["after"]["답함"] == 7
    lst = httpx.get(B + "/improve/releases", headers=A, timeout=30).json()["items"]
    assert any(x["id"] == rel["id"] and x["can"]["approve"] for x in lst)
    assert httpx.post(B + f"/improve/releases/{rel['id']}/approve", headers=S, timeout=30).status_code == 403
    # 거절 — 묶인 줄은 새로 옴 · 규칙 꺼짐
    r = httpx.post(B + f"/improve/releases/{rel['id']}/reject", headers=A, timeout=30)
    assert r.status_code == 200 and r.json()["release"]["state"] == "rejected"
    assert _sql("SELECT state, release_id FROM improve_items WHERE id=%s", (iid,))[0] == ("new", None)
    assert not _sql("SELECT 1 FROM improve_rules WHERE item_id=%s AND active", (iid,))


def test_release_approve_revert(tok, rel_item):
    iid, made = rel_item
    A = H(tok["admin"])
    rel = _new(A, made)
    assert httpx.post(B + f"/improve/items/{iid}/adopt", headers=A, json={"use": "suggest", "by": "system", "release": rel["id"], "test": True},
                      timeout=30).status_code == 200
    ok = {"before": {"total": 4, "답함": 1, "안내함": 0, "못 함": 3}, "after": {"total": 4, "답함": 2, "안내함": 0, "못 함": 2}, "better": 1, "worse": 0,
          "better_items": [iid]}
    assert httpx.post(B + f"/improve/releases/{rel['id']}/submit", headers=A, json=ok, timeout=30).status_code == 200
    r = httpx.post(B + f"/improve/releases/{rel['id']}/approve", headers=A, timeout=30)
    assert r.status_code == 200 and r.json()["release"]["state"] == "approved" and r.json()["sent"]["value"] == 0   # 시험 줄 — 물은 사람 0
    assert _sql("SELECT state FROM improve_items WHERE id=%s", (iid,))[0][0] == "built"
    r = httpx.post(B + f"/improve/releases/{rel['id']}/revert", headers=A, timeout=30)
    assert r.status_code == 200 and r.json()["release"]["state"] == "reverted"
    assert not _sql("SELECT 1 FROM improve_rules WHERE item_id=%s AND active", (iid,))


def test_eval_set_all(tok):
    A, S = H(tok["admin"]), H(tok["staff"])
    j = httpx.get(B + "/improve/eval-set", headers=A, params={"all": "1"}, timeout=60).json()
    n_all = _sql("SELECT count(*) FROM improve_items")[0][0]
    assert len(j["items"]) == n_all and all("seq" in x and "role" in x for x in j["items"])
    j2 = httpx.get(B + "/improve/eval-set", headers=S, params={"all": "1"}, timeout=60).json()
    assert all("seq" not in x for x in j2["items"])                                       # 직원은 넓게 보지 않는다(모아 둔 것만)
