"""바퀴 4 · 개선 후보 '채택' — 쉬운 것은 바로 반영(원칙 197 · 10-11 자동진화-관리) + '층 → 레이어'(원칙 195).

① 채택 갈래: 다른 이름 더하기(alias) · 질문 뜻 연결(intent) · 답 문구(phrase) = 바로 반영(표 한 줄) · 개발 할 일(dev) = 확인 대기.
② 바로 반영은 다음 질문부터 — 게이트웨이 경로로 '온실'을 '비닐하우스'의 다른 이름으로 채택하면, 같은 질문의 답이 '비닐하우스'로 물은 답과 같아지고,
   되돌리면 예전 답으로 돌아온다(시험 표시 줄 · 끝나면 지움).
③ 목록에 갈래 · '반영됨 — 다시 물어보세요' · 되돌리기(can.revert)가 보인다 · 개발 할 일은 '확인 대기'.
④ 지도에서 켜고 끄는 '층'은 답에서 '레이어'로(서버 문구 · 거르기 답 첫 줄).
실행: python -m pytest server/tests/test_impl16_adopt.py -q   (게이트웨이 :8700 · GPU 0 — 질문은 요약 직행 경로)
"""
import secrets
import time

import httpx
import psycopg
import pytest

from landxi_api import config

from conftest import B, H

SRC, DST = "온실", "비닐하우스"
Q_ALIAS = f"{SRC} 분석서비스는 어느 지역에서 쓰고 있어?"
Q_TARGET = f"{DST} 분석서비스는 어느 지역에서 쓰고 있어?"


def _sql(q, args=()):
    with psycopg.connect(config.PG_ADMIN_DSN, autocommit=True) as c:
        cur = c.execute(q, args)
        return cur.fetchone() if cur.description else None


def ask(t: str, q: str) -> str:
    r = httpx.post(B + "/agent/runs", headers=H(t), json={"message": q, "mode": "map", "context": {"test": True}}, timeout=60).json()
    rid = r["run"]["id"] if isinstance(r.get("run"), dict) else (r.get("run_id") or r.get("run"))
    t0 = time.time()
    while time.time() - t0 < 120:
        j = httpx.get(B + f"/agent/runs/{rid}/events", headers=H(t), timeout=30).json()
        if j.get("done"):
            end = [x for x in j["items"] if x["event"] in ("agent.done", "agent.rejected", "agent.failed")][-1]
            d = end["data"]
            return str(d.get("answer_md") or d.get("message") or "")
        time.sleep(0.8)
    raise AssertionError("답이 오지 않았습니다")


@pytest.fixture()
def item():
    """시험 줄 — 보류 상태로 넣어(목록에 보이게) 채택 · 되돌리기를 시험하고 끝나면 지운다."""
    iid = "ic_t16" + secrets.token_hex(4)
    _sql("INSERT INTO improve_items(id, key, kind, gist, note, source, state, hold_reason) VALUES (%s,%s,'other',%s,'시험 줄(바퀴 4 · 끝나면 지움)','auto','held','시험')",
         (iid, "other|t16·" + iid, f"{SRC} 분석서비스는 어디"))
    yield iid
    _sql("DELETE FROM improve_items WHERE id=%s", (iid,))


def test_alias_adopt_changes_next_answer_and_revert(tok, item):
    A, S = H(tok["admin"]), tok["staff"]
    before, target = ask(S, Q_ALIAS), ask(S, Q_TARGET)
    assert before != target                                                   # 채택 전: 다른 이름은 다른 답
    r = httpx.post(B + f"/improve/items/{item}/adopt", headers=A, json={"mode": "alias", "src": SRC, "dst": DST, "test": True}, timeout=30)
    assert r.status_code == 200, r.text
    it = r.json()["item"]
    assert it["state"] == "adopted" and it["adopt"]["quick"] and it["adopt"]["mode"] == "alias" and it["ledger"] == "바로 반영"
    assert it["adopt"]["state_word"] == "반영됨 — 다시 물어보세요" and it["can"]["revert"] and not it["can"]["notify"] and it["adopt"]["rule"]["test"]
    after = ask(S, Q_ALIAS)
    assert after == target, (after, target)                                   # 바로 반영: 다음 질문부터 같은 답
    r = httpx.post(B + f"/improve/items/{item}/revert", headers=A, timeout=30)
    assert r.status_code == 200 and r.json()["item"]["state"] == "new"
    assert ask(S, Q_ALIAS) == before                                          # 되돌리면 예전 답
    assert _sql("SELECT count(*) FROM improve_rules WHERE item_id=%s AND active", (item,))[0] == 0


def test_alias_keeps_longer_words():
    """다른 이름은 낱말 앞머리에서만 — '하우스'를 더해도 '비닐하우스'는 '비닐비닐하우스'가 되지 않는다."""
    import asyncio
    from landxi_api import improve as I
    I._RULES.update(rows=[{"id": "ir_x", "item_id": None, "mode": "alias", "src": "하우스", "dst": "비닐하우스", "text": None, "try": None}], at=time.time() + 3600)
    try:
        assert asyncio.run(I.rewrite("남원시 비닐하우스 몇 개야?"))[0] == "남원시 비닐하우스 몇 개야?"
        assert asyncio.run(I.rewrite("남원시 하우스 몇 개야?"))[0] == "남원시 비닐하우스 몇 개야?"
    finally:
        I._RULES.update(rows=[], at=0.0)


def test_dev_adopt_goes_to_ledger(tok, item):
    A = H(tok["admin"])
    r = httpx.post(B + f"/improve/items/{item}/adopt", headers=A, json={"mode": "dev", "how": "단동 · 연동 분류 더하기"}, timeout=30)
    it = r.json()["item"]
    assert it["adopt"]["mode"] == "dev" and not it["adopt"]["quick"] and it["ledger"] == "확인 대기" and it["can"]["notify"] and not it["can"]["revert"]
    bad = httpx.post(B + f"/improve/items/{item}/adopt", headers=A, json={"mode": "alias", "src": "가", "dst": "가"}, timeout=30)
    assert bad.status_code == 400


def test_layer_word_in_server_answers():
    """원칙 195 — 서버 문구 · 답 다듬기에서 지도 '층'은 '레이어'(건물 층은 그대로)."""
    from agent import lint
    assert lint.scrub_terms("결과 층을 켰습니다.") == "결과 레이어를 켰습니다."
    assert lint.scrub_terms("3층 건물입니다.") == "3층 건물입니다."
    from landxi_api import result_scope as RSC
    assert RSC.scope_line([{"name": "비닐하우스"}]).startswith("대상: 켜진 레이어 1개(")
