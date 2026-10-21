"""XI ChatGEO 400문 남은 실패 고침(10-22 RESULT-2) — 법령 길 비켜 가기 · 도구 결과 길이 · 정해진 틀."""
from __future__ import annotations

import json

from agent import frames, runner
from agent.tools.ext import law


def test_map_question_not_law():
    # 서비스 · 층 이름 안의 법 낱말('하천구역')이 있어도 나눠 세기 · 의심 시설 질문은 법 길이 아니다
    assert law.ROUTE("해남군 하천구역 안 의심 시설 동네별로 얼마나 돼?", None) is None
    assert not runner.law_ask("해남군 하천구역 안 의심 시설 동네별로 얼마나 돼?")
    # 법 질문은 그대로 법 길
    assert law.ROUTE("하천구역 지정은 누가 고시해", None)
    assert law.ROUTE("하천구역 안 의심 시설 근거 조문 알려 줘", None)
    assert law.ROUTE("농지원부가 뭐고 어디서 떼", None)


def test_fit_payload_keeps_envelopes():
    payload = {"봉투": {"e1": {"값": 3, "단위": "건"}}, "데이터": {"목록": [{"원문": "가" * 900} for _ in range(40)]}}
    out = runner.fit_payload(payload)
    assert out["봉투"] == payload["봉투"]
    assert len(json.dumps(out, ensure_ascii=False)) <= runner.BLOCK_MAX_CHARS


def test_fit_messages_budget():
    msgs = [{"role": "system", "content": "s"}] + [{"role": "tool", "content": "<data>" + "나" * 9000 + "</data>"} for _ in range(3)]
    assert runner.fit_messages(msgs)
    assert sum(len(m["content"]) for m in msgs if m["role"] == "tool") <= runner.TOOL_BUDGET_CHARS + 600


def test_trust_frame_cites_original():
    fr = frames._trust()
    assert "현장조사 대상 후보" in fr["text"] and "제54조" in fr["text"]
    assert frames.TRUST_RX.search("위성영상으로 판독한 결과를 믿어도 돼")
