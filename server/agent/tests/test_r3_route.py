"""R3 r3-route — 에이전트 길 나누기·가드(M1·M2·M3·M5·M10 문구 · 목록 모수 · 서수 · 조사 · 명령 바). LLM·GPU 0 · DB 쓰기 0.

실증 기록(C2 3차 must_fix) 문장을 그대로 쓴다:
  M1  'Zoom in' · 'Zoom out' · 'Turn off the imagery layer'(LX 직원 · 관리자) · '구례군 전역 분석 실행해 줘' · '구례군 AI 분석 돌려 줘'(기관)
  M2  대장을 올린 계정의 법령 질문 4개 → 법령 도구(대장 필지 수 답 0) · 대장 조건 질문은 대장 직행 그대로
  M3  '<개정 2014.5.28, 2019.4.23>' · '<신설 2023. 8. 30.>' 가 '확인되지 않음'으로 바뀌지 않는다 · '3rd' → 'unverifiedrd' 0
  M5  동작 문장(명령 바가 실패 문장으로 바꿀 자리) · 키트 기본 처리 ok:false + 이유 · 서버 run 기록 자리
  M10 관할 안 · 결과 없음 → '해당 지역 데이터가 없습니다' + 다음 할 일(관할 밖 문구 0)
"""
import asyncio
import json
import re
import shutil
import subprocess
import sys
import types
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from agent import lint, runner  # noqa: E402
from agent.tools import Out, ToolError, ext, from_contract, registry  # noqa: E402
from landxi_api.deps import CAPS, Principal  # noqa: E402

STAFF = Principal("lx", "staff", None, "u_mail_test", caps=CAPS[("lx", "staff")])
ADMIN = Principal("lx", "admin", None, "u_mail_lxadmin", caps=CAPS[("lx", "admin")])
GJ = Principal("tenant", "manager", "gwangju-jeonnam", "u_gj", caps=CAPS[("tenant", "manager")])
NW = Principal("tenant", "manager", "namwon", "u_nw", caps=CAPS[("tenant", "manager")])
KIT = Path(__file__).resolve().parents[3] / "landxi" / "v3" / "kit"


@pytest.fixture(autouse=True)
def nodb(monkeypatch):
    async def _nodb():
        raise RuntimeError("no db in tests")

    async def _nolog(*a, **k):
        return None
    monkeypatch.setattr(runner, "_db", _nodb)
    monkeypatch.setattr(runner.audit, "log", _nolog)


def _ctx(p=STAFF, msg="", context=None):
    ctx = runner.Ctx(run_id="run_r3route", principal=p, token=None, context=context or {})
    ctx.lang = runner.lang_of(msg)
    ctx.state["msg"] = msg
    return ctx


def _route(p, msg, context=None):
    ctx = _ctx(p, msg, context)
    return asyncio.run(runner.ext_route(ctx, msg)), ctx


def _done(ctx):
    return next(d for _t, e, d in ctx.events if e == "agent.done")


def _no_llm(monkeypatch):
    async def boom(*a, **k):
        raise AssertionError("LLM 을 부르면 안 된다")
    monkeypatch.setattr(runner.backends, "chat_stream", boom)
    monkeypatch.setattr(runner.backends, "classify", boom)


# ═══ M1 운영 안내 오분기 ════════════════════════════════════════════════════════
@pytest.mark.parametrize("p", [STAFF, ADMIN])
@pytest.mark.parametrize("q,tool,args", [("Zoom in", "map_zoom", {"delta": 1}), ("Zoom out", "map_zoom", {"delta": -1}),
                                         ("Zoom in on the map", "map_zoom", {"delta": 1}),
                                         ("Turn off the imagery layer", "map_layer", {"layer": "imagery", "on": False}),
                                         ("Turn on the imagery layer", "map_layer", {"layer": "imagery", "on": True}),
                                         ("Tilt to 3D", "map_view", {"preset": "3d"})])
def test_m1_english_map_actions_go_to_map_tools(p, q, tool, args):
    for _ in range(3):                                  # 3회 모두 같은 길(결정적)
        hit, _c = _route(p, q)
        assert hit and hit["tool"] == tool and hit["args"] == args, hit
        assert hit["module"] in ("runner.map_en", "map")               # 영어는 런타임 직행 · 확장 지도 직행이 잡으면 그것
        if hit["module"] == "runner.map_en":
            assert hit.get("answer") and "admin" not in hit["answer"].lower()


@pytest.mark.parametrize("p,q", [(GJ, "구례군 전역 분석 실행해 줘"), (GJ, "구례군 AI 분석 돌려 줘"), (GJ, "강진군 전역 분석 실행해 줘"),
                                 (NW, "남원시 전역 분석 실행해 줘"), (NW, "남원시 AI 분석 돌려 줘")])
def test_m1_tenant_run_goes_to_confirm_card(p, q):
    for _ in range(3):
        hit, _c = _route(p, q)
        assert hit and hit["tool"] in ("survey_build", "survey_wait"), hit
        assert hit["args"].get("region")
    assert "survey_build" in registry.CONFIRM                 # 실행은 확인 카드(사람 승인) 뒤에만


def test_m1_tenant_summary_is_not_a_run():
    hit, _c = _route(GJ, "구례군 AI 분석 결과 요약해 줘")
    assert not hit or hit["tool"] not in registry.CONFIRM


@pytest.mark.parametrize("p", [STAFF, GJ, NW])
@pytest.mark.parametrize("q", ["GPU 상태", "Show GPU status"])
def test_m1_real_ops_question_still_one_line_for_non_admin(p, q):
    hit, _c = _route(p, q)
    assert hit and hit["tool"] == "ops_admin_only"
    assert runner.ops_close(q)


@pytest.mark.parametrize("q", ["Zoom in", "Turn off the imagery layer", "구례군 전역 분석 실행해 줘", "구례군 AI 분석 돌려 줘", "지도 확대해 주고 영상도 켜 줘"])
def test_m1_ops_close_only_on_ops_words(q):
    assert not runner.ops_close(q)


def test_m1_router_ops_without_ops_words_goes_to_tools(monkeypatch):
    """라우터(1.5B)가 ops 라고 잘못 불러도 비관리자 답이 운영 안내로 닫히지 않는다 — 모델 경로(도구 목록 있음)."""
    async def classify(msg, r=None):
        return {"intent": "ops", "ms": 1.0, "backend": "vllm", "model": "router"}
    seen = {}

    class Res:
        backend, model, base, first_token_ms, tps, fallback_from, tool_calls = "vllm", "gemma", "", 1.0, None, [], []
        content, usage = "지도 동작을 확인했습니다.", {}

    async def chat(messages, tools=None, **k):
        seen["tools"] = tools
        return Res()
    monkeypatch.setattr(runner.backends, "classify", classify)
    monkeypatch.setattr(runner.backends, "chat_stream", chat)
    q = "지도 좀 크게 확대해 주고 영상도 켜 줘"
    ctx = _ctx(STAFF, q)
    asyncio.run(runner.execute(ctx, q))
    d = _done(ctx)
    assert runner.MSG["ko"]["admin_only"] not in d["answer_md"] and seen.get("tools")
    assert ctx.state.get("route_override") == "ops→map"


# ═══ M2 법령 질문 가로채기 ══════════════════════════════════════════════════════
LAW_QS = ["농지 전용 허가 없이 창고를 지으면 원상회복 조문은?", "농지에 허가 없이 건물을 지으면 어떤 법 조문에 걸려?",
          "개발행위허가 대상 조문은?", "농지 전용 신고 조문은?"]


@pytest.mark.parametrize("p", [GJ, NW])
@pytest.mark.parametrize("q", LAW_QS + ["무허가 건축물은 건축법 몇 조 위반이야?"])
def test_m2_law_questions_go_to_law_tool(p, q):
    assert runner.law_ask(q)
    ctx = _ctx(p, q, context={"ledger": {"import_id": "imp_x"}})   # 대장을 올린 세션
    assert runner.ledger_route(ctx, q) is None or runner.law_ask(q)  # execute 는 law_ask 면 대장 직행을 부르지 않는다
    hit = asyncio.run(runner.ext_route(ctx, q))
    assert hit and hit["tool"] == "law_search", hit


@pytest.mark.parametrize("q", ["대장상 농지인데 AI가 건물로 본 필지", "경작 신고인데 경작 흔적 없는 필지", "허가 필지인데 건물 없음",
                               "무허가 건축 의심 필지 몇 건?", "분석 방법 알려 줘", "의심 필지 몇 건?"])
def test_m2_ledger_and_data_questions_are_not_law(q):
    assert not runner.law_ask(q)


def test_m2_ledger_condition_question_keeps_ledger_route():
    hit, _c = _route(GJ, "대장상 농지인데 AI가 건물로 본 필지")
    assert hit and hit["tool"] in ("fusion_ledger", "ledger_findings")


def test_m2_execute_law_question_skips_ledger_direct(monkeypatch):
    """대장이 올라간 세션 · 조문 질문 → 대장 직행(answer_ledger) 0 · 법령 도구 1."""
    called = {}

    async def fake_direct(ctx, msg, hit, started, scr):
        called["direct"] = hit["tool"]

    async def fake_ledger(*a, **k):
        called["ledger"] = True
    monkeypatch.setattr(runner, "answer_direct", fake_direct)
    monkeypatch.setattr(runner, "answer_ledger", fake_ledger)
    _no_llm(monkeypatch)
    for q in LAW_QS:
        called.clear()
        ctx = _ctx(GJ, q, context={"ledger": {"import_id": "imp_x"}})
        asyncio.run(runner.execute(ctx, q))
        assert called == {"direct": "law_search"}, (q, called)


# ═══ M3 · 서수 — 숫자 가드 ═══════════════════════════════════════════════════════
LAW_TEXT = ("제79조(위반 건축물 등에 대한 조치 등) ① 허가권자는 대지나 건축물이 이 법 또는 이 법에 따른 명령이나 처분에 위반되면 "
            "공사의 중지를 명할 수 있다. <개정 2014. 5. 28., 2019. 4. 23.>")


@pytest.mark.parametrize("ans", [
    "「건축법」 제79조 제1항입니다. <개정 2014.5.28, 2019.4.23>",
    "「건축법」 제79조 원문입니다. <신설 2023. 8. 30.>",
    "「산지관리법」 제18조의4 와 「농지법」 제35조 제1항 제2호를 보세요.",
    "시행일은 2023. 8. 30. 입니다.",
    "「농지법」 제42조 제1항 원상회복 조문입니다 <개정 2023.8.16>.",
])
def test_m3_law_dates_and_article_numbers_not_unverified(ans):
    r = lint.lint(ans, {"e1": {"value": 819, "unit": "count"}})
    assert not r.unverified, r.unverified
    assert "확인되지 않음" not in lint.render_unverified(r.answer_md)


def test_m3_verbatim_law_text_numbers_pass():
    ans = "원문: “허가권자는 … 공사의 중지를 명할 수 있다. <개정 2014. 5. 28., 2019. 4. 23.>”"
    r = lint.lint(ans, {}, verbatim=[LAW_TEXT])
    assert not r.unverified


def test_m3_data_numbers_still_guarded():
    r = lint.lint("의심 필지는 2019.45건이고 말씀하신 500건보다 많습니다.", {"e1": {"value": 819, "unit": "count"}}, asked={"500"})
    assert {"2019.45", "500"} <= set(r.unverified_numbers)


@pytest.mark.parametrize("ans,lang", [("The imagery for the 3rd parcel shows a roof.", "en"), ("The 1st and 2nd parcels are nearby.", "en"),
                                      ("상위 5곳 중 3위 필지입니다.", "ko"), ("줌 19로 변경되었습니다.", "ko"), ("Zoom set to level 5.", "en")])
def test_ordinals_not_unverified(ans, lang):
    r = lint.lint(ans, {}, asked={"3", "5", "19"})
    md = lint.render_unverified(r.answer_md, lang)
    assert not r.unverified and "unverified" not in md and "확인되지 않음" not in md


def test_finish_passes_question_numbers_and_law_text(monkeypatch):
    ctx = _ctx(GJ, "Describe the imagery of the 3rd parcel")
    ctx.citations.append({"n": 1, "kind": "law", "text": LAW_TEXT})

    class Res:
        backend, model, base, first_token_ms, tps, fallback_from = "vllm", "gemma", "", 1.0, None, []
        usage = {}
    asyncio.run(runner.finish(ctx, "The imagery for the 3rd parcel shows a roof.", Res(), 0.0, {"ms": 0}, {}))
    d = _done(ctx)
    assert "unverified" not in d["answer_md"] and "3rd" in d["answer_md"]


# ═══ M10 가드 문구 그대로 ════════════════════════════════════════════════════════
def _guard_module(monkeypatch, exc=None, data=None):
    async def h(args, ctx):
        if exc:
            raise exc
        o = Out(source="t")
        o.data = data
        return o
    m = types.ModuleType("r3t_report")
    m.SPECS = {"r3t_report": {"description": "보고서 시험", "properties": {"region": {"type": "string"}}}}
    m.HANDLERS = {"r3t_report": h}
    m.ROUTE = lambda msg, ctx: {"tool": "r3t_report", "args": {}} if "보고서" in msg else None
    sys.modules["r3t_report"] = m
    monkeypatch.setenv("LX_AGENT_EXT_EXTRA", "r3t_report")
    ext.unload(registry, from_contract)
    ext.load(registry, from_contract, force=True)


@pytest.fixture
def restore_ext(monkeypatch):
    yield
    monkeypatch.delenv("LX_AGENT_EXT_EXTRA", raising=False)
    ext.unload(registry, from_contract)
    ext.load(registry, from_contract, force=True)


@pytest.mark.parametrize("q", ["해남군 보고서 초안 써 줘", "나주시 보고서 초안 써 줘"])
def test_m10_no_data_tool_error_is_verbatim_with_next(monkeypatch, restore_ext, q):
    _guard_module(monkeypatch, exc=ToolError("not_found", "해당 지역 데이터가 없습니다", 404))
    _no_llm(monkeypatch)
    ctx = _ctx(GJ, q)
    asyncio.run(runner.answer_direct(ctx, q, {"tool": "r3t_report", "args": {}, "module": "r3t_report"}, 0.0, {"pii": []}))
    d = _done(ctx)
    md = d["answer_md"]
    # 확인 16차 대화-1 규칙 ② — 지역 이름을 넣은 이유 한 줄 + 다음 할 일은 문장이 아니라 버튼(기관 = 분석 요청)
    nm = q.split()[0]
    assert md == f"{nm}{'은' if nm.endswith('군') else '는'} 아직 AI 분석 결과가 없습니다." and "다음 할 일" not in md
    assert "이 기관" not in md and "아닙니다" not in md and d["next"][0]["label"] == "분석 요청 보내기"


def test_m10_status_contract_text_and_next_verbatim(monkeypatch, restore_ext):
    _guard_module(monkeypatch, data={"status": "no_data", "text": "해당 지역 데이터가 없습니다", "next": "XI맵에서 이 지역 AI 분석을 먼저 요청하세요."})
    _no_llm(monkeypatch)
    ctx = _ctx(STAFF, "순창군 보고서 초안 써 줘")          # LX 직원은 XI맵에서 AI 분석을 실행할 수 있다 → 도구가 준 다음 할 일 그대로
    asyncio.run(runner.answer_direct(ctx, ctx.state["msg"], {"tool": "r3t_report", "args": {}, "module": "r3t_report"}, 0.0, {"pii": []}))
    d = _done(ctx)                                         # 확인 16차 — 이유 한 줄 + LX 직원이 할 수 있는 일은 버튼(그 지역 전역 분석 · 영상 등록)
    assert d["answer_md"] == "순창군은 아직 AI 분석 결과가 없습니다." and d["next"][0]["q"] == "순창군 전역 분석 실행해 줘"


def test_m10_outside_is_verbatim_without_next(monkeypatch, restore_ext):
    _guard_module(monkeypatch, data={"status": "outside", "text": "이 기관의 데이터가 아닙니다"})
    _no_llm(monkeypatch)
    ctx = _ctx(GJ, "전주시 보고서 초안 써 줘")
    asyncio.run(runner.answer_direct(ctx, ctx.state["msg"], {"tool": "r3t_report", "args": {}, "module": "r3t_report"}, 0.0, {"pii": []}))
    assert _done(ctx)["answer_md"] == "이 기관의 데이터가 아닙니다."


def test_m10_model_path_guard_ends_run(monkeypatch, restore_ext):
    """모델이 도구를 불러 가드 결과가 오면 모델이 다시 쓰지 않는다(두 번째 LLM 호출 0)."""
    _guard_module(monkeypatch, exc=ToolError("not_found", "해당 지역 데이터가 없습니다", 404))
    calls = {"n": 0}

    class Res:
        backend, model, base, first_token_ms, tps, fallback_from = "vllm", "gemma", "", 1.0, None, []
        content, usage = "", {"prompt_tokens": 10, "completion_tokens": 2}
        tool_calls = [{"name": "r3t_report", "arguments": "{}", "id": "c1"}]

    async def chat(messages, tools=None, **k):
        calls["n"] += 1
        return Res()

    async def classify(msg, r=None):
        return {"intent": "report", "ms": 1.0, "backend": "vllm", "model": "router"}
    monkeypatch.setattr(runner.backends, "chat_stream", chat)
    monkeypatch.setattr(runner.backends, "classify", classify)
    q = "우리 지역 실태 문서 좀"                                # ROUTE(보고서) 밖 문장 → 모델 경로
    ctx = _ctx(GJ, q)
    asyncio.run(runner.execute(ctx, q))
    d = _done(ctx)
    assert calls["n"] == 1 and d["answer_md"].startswith("해당 지역 데이터가 없습니다") and "이 기관" not in d["answer_md"]


def test_m10_english_guard():
    ctx = _ctx(GJ, "Draft a report for Haenam-gun")
    g = runner.guard_text(ctx, {"ok": False, "err": ToolError("not_found", "해당 지역 데이터가 없습니다", 404)})
    assert g.startswith("No data for this area yet.") and "Next:" in g and not re.search(r"[가-힣]", g)


# ═══ 목록 답 모수 · 한국어 지번 5개 ════════════════════════════════════════════════
def _list_handlers(monkeypatch):
    async def stats(args, ctx):
        o = Out(source="t")
        o.env("suspects", "목포시 의심 필지(전체 규칙)", {"value": 819, "unit": "count", "basis": "inferred"})
        o.env("rule_R1", "목포시 R1 무허가 건축 의심 건수", {"value": 300, "unit": "count", "basis": "inferred"})
        o.citations.append({"kind": "stats", "label": "목포시 집계"})
        return o

    async def findings(args, ctx):
        o = Out(source="t")
        n = int(args.get("top") or 5)
        o.env("total", "목포시 의심 필지 전체", {"value": 819, "unit": "필지", "basis": "inferred"})
        o.env("shown", "점수 상위로 반환한 필지 수", {"value": n, "unit": "필지", "basis": "measured"})
        addrs = ["달동 773-8", "달동 산 75-6", "달동 산 106", "달동 773-9", "율도동 2-4"][:n]
        o.citations.append({"kind": "list", "label": "목록", "env_keys": ["total", "shown"]})
        for k, a in enumerate(addrs, 1):
            o.citations.append({"kind": "parcel", "pnu": f"4611012{k:012d}", "addr": a, "label": a})
        o.data = {"지역": "목포시", "items": []}
        o.raw = {"features": [{"type": "Feature", "geometry": {"type": "Point", "coordinates": [126.4, 34.8]}, "properties": {"n": 1}}],
                 "bbox": [126.39, 34.79, 126.41, 34.81]}
        return o
    monkeypatch.setitem(registry.HANDLERS, "survey_stats", stats)
    monkeypatch.setitem(registry.HANDLERS, "survey_findings", findings)


def test_list_route_parses_top_n_and_region():
    ctx = _ctx(GJ, "목포시 의심 필지 5곳 지번 보여 줘")
    assert runner.list_route(ctx, ctx.state["msg"]) == {"top": 5, "region": "12110"}
    assert runner.list_route(ctx, "목포시 의심 필지 몇 건?") is None
    assert runner.list_route(ctx, "1위 필지 영상 설명해 줘") is None


def test_list_answer_denominator_and_five_jibun(monkeypatch):
    _list_handlers(monkeypatch)
    _no_llm(monkeypatch)
    q = "목포시 의심 필지 5곳 지번 보여 줘"
    ctx = _ctx(GJ, q)
    asyncio.run(runner.answer_list(ctx, q, {"top": 5, "region": "12110"}, 0.0, {"pii": []}))
    d = _done(ctx)
    md, envs = d["answer_md"], d["envelopes"]
    ph = re.findall(r"\{\{env:(e\d+)\}\}", md)
    assert len(ph) == 2 and ph[0] != ph[1]                                 # 모수와 상위 n 이 다른 봉투
    assert envs[ph[0]]["value"] == 819 and envs[ph[1]]["value"] == 5       # 모수 = 지역 의심 필지 · 상위 n = shown
    for a in ["달동 773-8", "달동 산 75-6", "달동 산 106", "달동 773-9", "율도동 2-4"]:
        assert a in md
    assert "}}를 지도" in md and "필지을" not in md                         # 조사(5필지를)
    assert "map_arrive" in d["ui_ops"]


# ═══ 조사 ═══════════════════════════════════════════════════════════════════
@pytest.mark.parametrize("src,envs,want", [
    ("그중 {{env:e1}}을 지도에 표시했습니다.", {"e1": {"value": 10, "unit": "필지"}}, "그중 {{env:e1}}를 지도에 표시했습니다."),
    ("{{env:e1}}를 찾았습니다.", {"e1": {"value": 3, "unit": "count"}}, "{{env:e1}}을 찾았습니다."),
    ("의심 필지는 {{env:e1}}이며 현장 확인 {{env:e2}}가 남았습니다.", {"e1": {"value": 819, "unit": "count"}, "e2": {"value": 110, "unit": "필지"}},
     "의심 필지는 {{env:e1}}이며 현장 확인 {{env:e2}}가 남았습니다."),
    ("면적 {{env:e1}}로 봅니다.", {"e1": {"value": 7, "unit": None}}, "면적 {{env:e1}}로 봅니다."),
    ("{{env:e1}}으로 늘었습니다.", {"e1": {"value": 5, "unit": "필지"}}, "{{env:e1}}로 늘었습니다."),
    ("그중 10필지을 지도에 표시했고 3건를 골랐습니다.", {}, "그중 10필지를 지도에 표시했고 3건을 골랐습니다."),
])
def test_josa(src, envs, want):
    assert runner.fix_josa(src, envs) == want


def test_ledger_direct_sentence_josa(monkeypatch):
    """대장 직행 문장('… {{shown}}을 지도에 표시') — 칩이 '10필지'면 '를'."""
    ctx = _ctx(GJ, "대장상 농지인데 AI가 건물로 본 필지")
    ctx.envs = {"e1": {"value": 245, "unit": "필지"}, "e2": {"value": 10, "unit": "필지"}}
    asyncio.run(runner.finish(ctx, "조건에 맞는 필지는 {{env:e1}}입니다. 그중 근거 면적이 큰 {{env:e2}}을 지도에 표시했습니다.", None, 0.0, {"ms": 0}, {},
                              lint_on=False))
    assert "{{env:e2}}를 지도" in _done(ctx)["answer_md"]


# ═══ M5 거짓 성공 — 동작 문장 · 확인 카드 제목 · 서버 기록 자리 ═══════════════════════════
def test_m5_action_sentences_in_done(monkeypatch):
    _no_llm(monkeypatch)
    ctx = _ctx(STAFF, "Zoom in")
    asyncio.run(runner.answer_direct(ctx, "Zoom in", runner.en_map_route(ctx, "Zoom in"), 0.0, {"pii": []}))
    d = _done(ctx)
    assert d["answer_md"] == "Zoomed in on the map." and d["act_claims"] == ["Zoomed in on the map."] and d["ui_ops"] == ["map_zoom"]
    ctx2 = _ctx(STAFF, "지도 확대")
    asyncio.run(runner.finish(ctx2, "지도를 확대했습니다. 영상 층을 껐습니다.", None, 0.0, {"ms": 0}, {}, lint_on=False))
    assert _done(ctx2)["act_claims"] == ["지도를 확대했습니다.", "영상 층을 껐습니다."]


def test_confirm_card_title(monkeypatch, restore_ext):
    async def h(args, ctx):
        return Out(source="t")
    m = types.ModuleType("r3t_run")
    m.SPECS = {"r3t_run": {"description": "실행 시험", "properties": {"region": {"type": "string"}}}}
    m.HANDLERS, m.WRITE, m.CONFIRM = {"r3t_run": h}, {"r3t_run"}, {"r3t_run"}
    m.PREPARE = {"r3t_run": lambda args, ctx: {**args, "title": "산청군 AI 분석 실행 · 영상이 있는 곳만"}}
    sys.modules["r3t_run"] = m
    monkeypatch.setenv("LX_AGENT_EXT_EXTRA", "r3t_run")
    ext.unload(registry, from_contract)
    ext.load(registry, from_contract, force=True)

    async def wait(ctx, cid):
        return "reject", None
    monkeypatch.setattr(runner, "wait_confirm", wait)
    ctx = _ctx(STAFF, "산청군 전역 분석 실행해 줘")
    r = asyncio.run(runner.run_tool(ctx, 1, "r3t_run", {"region": "48860"}))
    assert not r["ok"] and r["err"].code == "rejected_by_user"
    cf = next(d for _t, e, d in ctx.events if e == "agent.confirm")
    assert cf["title"] == "산청군 AI 분석 실행 · 영상이 있는 곳만"


def test_m5_server_acts_endpoint_exists():
    src = (Path(__file__).resolve().parents[2] / "landxi_api" / "agent.py").read_text(encoding="utf-8")
    assert '@router.post("/agent/runs/{run_id}/acts")' in src and "acts_ok" in src and "_own_run(p, run_id)" in src
    body = src[src.index('@router.post("/agent/runs/{run_id}/acts")'):src.index('@router.get("/agent/runs")')]
    ret = body[body.rindex("return {"):]
    assert "acts_ok" not in ret.split("\n")[0]                  # 응답에 맨 숫자 0(게이트웨이 봉투 규칙 · 값은 run 기록에만)


# ═══ 명령 바(cmdk.js) — 입력 사라짐 · 실패 문장 · 키트 기본 처리 ═══════════════════════════
CMDK = (KIT / "cmdk.js").read_text(encoding="utf-8")


def test_cmdk_open_focuses_now_and_keeps_typed_text():
    a = CMDK.index("const open = (q")
    body = CMDK[a:CMDK.index("const close = ", a)]
    raf = body.index("requestAnimationFrame(() => { if (!box.hidden")               # 초점 다시 잡기 프레임(구현 3차 — 앞쪽 rAF 는 대화 맨 아래로 내리기)
    assert body.index("input.focus(") < raf                                           # 여는 즉시 초점(다음 프레임을 기다리지 않음)
    assert body.index("input.select()") < raf                                         # 앞 질문은 선택 → 새 글자로 바뀜(두 번 붙기 0)
    assert "input.select()" not in body[raf:]                                         # 프레임 뒤에 다시 선택하지 않는다(그새 친 글자 보존)
    assert "setRangeText(e.key" in CMDK                                               # 바 밖 초점에서 친 글자 → 입력 칸


def test_cmdk_kit_reports_reasons_and_title():
    assert "reason = why('nomap')" in CMDK and "why((a.zoom ?? cur + (+a.delta || 1)) >= cur ? 'max' : 'min')" in CMDK
    assert "'map_layer'" in CMDK.split("const KIT_OPS")[1].split("\n")[0]
    assert "d?.title || d?.say" in CMDK
    assert "`/agent/runs/${shown.run}/acts`" in CMDK and "ACT_WAIT_MS = 6000" in CMDK     # 확인 16차 — 끝 신호 전 진행형 · 먼 지역 비행까지 기다림


def test_i18n_act_keys_both_languages():
    ko = json.loads((KIT / "i18n" / "ko.json").read_text(encoding="utf-8"))
    en = json.loads((KIT / "i18n" / "en.json").read_text(encoding="utf-8"))
    keys = [f"cmdk.act.{k}" for k in ("in", "out", "zoom", "on", "off", "move", "view", "fail", "unconfirmed")] + \
           [f"cmdk.why.{k}" for k in ("max", "min", "nomap", "nolayer")] + [f"cmdk.layer.{k}" for k in ("imagery", "results", "findings", "parcels")]
    for k in keys:
        assert ko.get(k) and en.get(k), k
        assert not re.search(r"[가-힣]", en[k]), k


@pytest.mark.skipif(not shutil.which("node"), reason="node 없음")
def test_cmdk_fail_line_node():
    """failLine · reasonIn — 실패 문장(한·영)과 화면 이유 번역(실제 cmdk.js 코드 조각 + i18n 사전)."""
    a, b = CMDK.index("const REASONS = "), CMDK.index("export function mountCmdk")
    ko = (KIT / "i18n" / "ko.json").read_text(encoding="utf-8")
    en = (KIT / "i18n" / "en.json").read_text(encoding="utf-8")
    js = ("const D={ko:" + ko + ",en:" + en + "};const tl=(l,k,v={})=>(D[l][k]??D.ko[k]??'').replace(/\\{(\\w+)\\}/g,(_,x)=>v[x]??'');\n"
          + CMDK[a:b] + "\nconst C=[[{op:'map_zoom',a:{delta:1},reason:'더 확대할 수 없습니다'},'ko'],[{op:'map_zoom',a:{delta:1},reason:'더 확대할 수 없습니다'},'en'],"
          "[{op:'map_layer',a:{layer:'imagery',on:false},reason:''},'en'],[{op:'map_layer',a:{layer:'imagery',on:false},reason:'모르는 이유'},'en'],"
          "[{op:'map_region',a:{},reason:''},'ko']];console.log(JSON.stringify(C.map(([x,l])=>failLine(x,l))));")
    out = subprocess.run(["node", "-e", js], capture_output=True, text=True, encoding="utf-8", timeout=30)
    assert out.returncode == 0, out.stderr
    got = json.loads(out.stdout.strip())
    assert got == ["지도를 확대하지 못했습니다 — 더 확대할 수 없습니다.", "Couldn't zoom in — already at the closest zoom.",
                   "Couldn't turn off the imagery layer.", "Couldn't turn off the imagery layer.", "지도를 이동하지 못했습니다."]


# ═══ C2 3차 합격 항목 회귀 0 ═══════════════════════════════════════════════════════
@pytest.mark.parametrize("q", ["구례군 AI 분석 결과 요약해 줘", "분석 결과 정리해 줘", "Summarize the AI results for Gurye-gun"])
def test_regression_summary_is_not_run(q):
    assert runner.lookup_not_run(q)
    hit, _c = _route(GJ if runner.lang_of(q) == "ko" else STAFF, q)
    assert not hit or hit["tool"] not in registry.CONFIRM


def test_regression_outside_guard_kept(monkeypatch):
    import landxi_api.regions as RG

    async def derived():
        return {"parcels": {}, "dp": {}}
    monkeypatch.setattr(RG, "derived", derived)
    ctx = _ctx(GJ, "남원시 의심 필지 몇 건?")
    sg = asyncio.run(runner.scope_guard(ctx, ctx.state["msg"]))
    assert sg and sg["message"] == "이 기관의 데이터가 아닙니다"


def test_regression_english_units_not_doubled_by_josa():
    ctx = _ctx(STAFF, "How many suspect parcels are in Gurye-gun?")
    ctx.envs = {"e1": {"value": 11081, "unit": "count"}}
    asyncio.run(runner.finish(ctx, "Gurye-gun has {{env:e1}} suspect parcels.", None, 0.0, {"ms": 0}, {}, lint_on=False))
    assert _done(ctx)["answer_md"] == "Gurye-gun has {{env:e1}} suspect parcels."


# ═══ 지도 동작 한 가지 직행 — 모델 없이 한 문장(자리표·숫자 0 · 'M5 동작 문장') ═══════════════════
@pytest.mark.parametrize("q,want", [("줌 19로 해 줘", "지도 배율을 바꿨습니다."), ("지도 확대해 줘", "지도를 확대했습니다."),
                                    ("영상 꺼 줘", "영상 층을 껐습니다."), ("3D로 기울여 줘", "지도를 3D 시점으로 기울였습니다.")])
def test_korean_map_direct_runtime_sentence(monkeypatch, q, want):
    _no_llm(monkeypatch)
    ctx = _ctx(STAFF, q)
    hit = asyncio.run(runner.ext_route(ctx, q))
    assert hit and hit["tool"] in runner.MAP_TOOLS, hit
    asyncio.run(runner.answer_direct(ctx, q, hit, 0.0, {"pii": []}))
    d = _done(ctx)
    assert d["answer_md"] == want and d["act_claims"] == [want] and "{{" not in d["answer_md"]


def test_map_region_runtime_sentence_josa():
    ctx = _ctx(STAFF, "산청군으로 이동해 줘")
    o = Out(source="t")
    o.data = {"이동": "경상남도 산청군"}
    assert runner.map_answer(ctx, "map_region", {"name": "산청군"}, o) == "경상남도 산청군으로 지도를 옮겼습니다."
    o.data = {"이동": "전북특별자치도 남원시"}
    assert runner.map_answer(ctx, "map_region", {}, o) == "전북특별자치도 남원시로 지도를 옮겼습니다."


# ═══ 1차 실증 must_fix(rv 기록) ═══════════════════════════════════════════════════
# 1. 기관에게 할 수 없는 '다음 할 일' — 곡성·담양 보고서 요청 · 결과 없는 곳의 실행 요청
@pytest.mark.parametrize("name", ["곡성군", "담양군"])
def test_fix1_tenant_next_is_what_tenant_can_do(monkeypatch, restore_ext, name):
    _guard_module(monkeypatch, data={"status": "no_data", "text": "해당 지역 데이터가 없습니다", "next": f"XI맵에서 {name} AI 분석을 먼저 실행하세요"})
    _no_llm(monkeypatch)
    ctx = _ctx(GJ, f"{name} 보고서 초안 써 줘")
    asyncio.run(runner.answer_direct(ctx, ctx.state["msg"], {"tool": "r3t_report", "args": {}, "module": "r3t_report"}, 0.0, {"pii": []}))
    d = _done(ctx)
    md = d["answer_md"]
    # 확인 16차 — 기관이 할 수 있는 일(분석 요청 · 원칙 113)은 버튼으로 · 문장으로 떠넘기지 않는다
    assert md == f"{name}은 아직 AI 분석 결과가 없습니다." and d["next"][0]["label"] == "분석 요청 보내기"
    assert "XI맵에서" not in md and "실행하세요" not in md and "이 기관" not in md


def test_fix1_tenant_next_english(monkeypatch, restore_ext):
    _guard_module(monkeypatch, data={"status": "no_data", "text": "No data for this area", "next": "Run AI analysis for Gokseong-gun on the XI map first"})
    _no_llm(monkeypatch)
    ctx = _ctx(GJ, "Write a report for Gokseong-gun")
    asyncio.run(runner.answer_direct(ctx, ctx.state["msg"], {"tool": "r3t_report", "args": {}, "module": "r3t_report"}, 0.0, {"pii": []}))
    md = _done(ctx)["answer_md"]
    assert md == "No data for this area.\n\nNext: ask LX to run AI analysis for Gokseong-gun via Help (?) → Contact."


def test_fix1_lx_next_kept_and_ends_with_period(monkeypatch, restore_ext):
    _guard_module(monkeypatch, data={"status": "no_data", "text": "해당 지역 데이터가 없습니다", "next": "XI맵에서 고창군 AI 분석을 먼저 실행하세요"})
    _no_llm(monkeypatch)
    ctx = _ctx(STAFF, "고창군 보고서 초안 써 줘")
    asyncio.run(runner.answer_direct(ctx, ctx.state["msg"], {"tool": "r3t_report", "args": {}, "module": "r3t_report"}, 0.0, {"pii": []}))
    d = _done(ctx)
    assert d["answer_md"] == "고창군은 아직 AI 분석 결과가 없습니다." and d["next"][0]["q"] == "고창군 전역 분석 실행해 줘"


def _checks(done=None, running=None, partial=None, survey=None):
    async def rj(codes):
        return {"running": running, "done": done, "partial": partial}

    async def sv(codes):
        return survey
    return {"region_jobs": rj, "survey_state": sv}


@pytest.mark.parametrize("q", ["곡성군 전역 분석 실행해 줘", "곡성군 AI 분석 돌려 줘", "담양군 전역 분석 실행해 줘"])
def test_fix1_tenant_run_without_ai_results_has_no_card(monkeypatch, q):
    _no_llm(monkeypatch)
    ctx = _ctx(GJ, q)
    ctx.state["_c2xi_checks"] = _checks()
    hit = asyncio.run(runner.ext_route(ctx, q))
    assert hit and hit["tool"] is None and hit.get("reply"), hit
    asyncio.run(runner.answer_direct(ctx, q, hit, 0.0, {"pii": []}))
    md = _done(ctx)["answer_md"]
    name = q.split(" ")[0]
    assert md == (f"{name}에는 아직 AI 분석 결과가 없습니다. AI 분석은 LX가 실행합니다.\n\n"
                  f"다음 할 일: 화면 위 도움말(?)의 '문의'로 LX에 {name} AI 분석을 요청해 주세요.")
    assert not [e for _t, e, _d in ctx.events if e in ("agent.confirm", "agent.tool.call")]      # 확인 카드 0 · 도구 0


def test_fix1_tenant_run_partial_only_has_no_card(monkeypatch):
    """곡성군처럼 중간에 멈춘 분석만 있으면 카드를 눌러도 만들 수 없다(survey_build 가 거절) → 카드 없이 사실 + 다음 할 일."""
    _no_llm(monkeypatch)
    ctx = _ctx(GJ, "곡성군 전역 분석 실행해 줘")
    ctx.state["_c2xi_checks"] = _checks(partial={"id": "j2", "state": "cancelled", "n": 5112})
    hit = asyncio.run(runner.ext_route(ctx, ctx.state["msg"]))
    assert hit and hit["tool"] is None
    assert hit["reply"] == ("곡성군 AI 분석이 중간에 멈춰 아직 결과가 없습니다. AI 분석은 LX가 실행합니다.\n\n"
                            "다음 할 일: 화면 위 도움말(?)의 '문의'로 LX에 곡성군 AI 분석을 요청해 주세요.")


@pytest.mark.parametrize("ck", [{"done": {"id": "j1", "state": "done", "n": 5}}, {"survey": "done"},
                                {"partial": {"id": "j2", "state": "cancelled", "n": 3}, "survey": "done"}])
def test_fix1_tenant_run_with_results_still_goes_to_card(ck):
    ctx = _ctx(GJ, "구례군 전역 분석 실행해 줘")
    ctx.state["_c2xi_checks"] = _checks(**ck)
    hit = asyncio.run(runner.ext_route(ctx, ctx.state["msg"]))
    assert hit and hit["tool"] == "survey_build" and hit["args"].get("region")


def test_fix1_tenant_run_outside_is_not_answered_as_no_result():
    """관할 밖 시군구는 '결과 없음'으로 답하지 않는다(관할 가드 문구 몫) — 확인 카드 길로 두면 PREPARE·도구가 막는다."""
    ctx = _ctx(GJ, "남원시 전역 분석 실행해 줘")
    ctx.state["_c2xi_checks"] = _checks()
    hit = asyncio.run(runner.ext_route(ctx, ctx.state["msg"]))
    assert not hit or not hit.get("reply")


def test_fix1_tenant_run_running_is_wait():
    ctx = _ctx(GJ, "곡성군 AI 분석 돌려 줘")
    ctx.state["_c2xi_checks"] = _checks(running={"id": "j3", "state": "running", "n": 0})
    hit = asyncio.run(runner.ext_route(ctx, ctx.state["msg"]))
    assert hit and hit["tool"] == "survey_wait"


# 2. 실패한 지도 동작 단계 줄에 완료 표시(✓) 0
def test_fix2_failed_step_is_not_checked_source():
    assert "is-wait" in CMDK and "markStep(x.step)" in CMDK and "act(a, d?.i)" in CMDK
    css = (KIT / "cmdk.css").read_text(encoding="utf-8")
    assert ".k-ck-plan li.is-fail::before" in css and "var(--warn)" in css


@pytest.mark.skipif(not shutil.which("node"), reason="node 없음")
def test_fix2_mark_step_node():
    a = CMDK.index("  function markStep(i)")
    b = CMDK.index("  /* R3 M5", a)
    js = ("const TRACK=new Set(['map_region','map_zoom','map_view','map_layer']);"
          "const mk=()=>{const s=new Set(['is-wait']);return{classList:{toggle:(c,on)=>on?s.add(c):s.delete(c),has:(c)=>s.has(c)},s}};"
          "const li={1:mk(),2:mk(),3:mk()};const plan={querySelector:(q)=>li[q.match(/[0-9]+/)[0]]};"
          "const acts={items:[{op:'map_zoom',state:'fail',step:1},{op:'map_zoom',state:'ok',step:2},{op:'map_layer',state:'sent',step:3}]};\n"
          + CMDK[a:b] + "\n[1,2,3].forEach(markStep);console.log(JSON.stringify([1,2,3].map((i)=>[...li[i].s].sort())));")
    out = subprocess.run(["node", "-e", js], capture_output=True, text=True, encoding="utf-8", timeout=30)
    assert out.returncode == 0, out.stderr
    assert json.loads(out.stdout.strip()) == [["is-fail"], ["is-done"], ["is-wait"]]


# 4. 괄호·단위 뒤 조사(관리자 'GPU 상태' 답)
@pytest.mark.parametrize("src,envs,want", [
    ("동시 고부하 GPU는 {{env:e1}}(한도 {{env:e2}})로 GPU 1이 고부하입니다.", {"e1": {"value": 1, "unit": "장"}, "e2": {"value": 1, "unit": "장"}},
     "동시 고부하 GPU는 {{env:e1}}(한도 {{env:e2}})으로 GPU 1이 고부하입니다."),
    ("온도 {{env:e3}}으로 정상입니다.", {"e3": {"value": 63, "unit": "°C"}}, "온도 {{env:e3}}로 정상입니다."),
    ("전력 {{env:e4}}으로", {"e4": {"value": 121, "unit": "W"}}, "전력 {{env:e4}}로"),
    ("메모리 {{env:e5}}으로", {"e5": {"value": 11.5, "unit": "GB"}}, "메모리 {{env:e5}}로"),
    ("고부하 GPU는 1장(한도 1장)로", {}, "고부하 GPU는 1장(한도 1장)으로"),
    ("온도 63°C으로", {}, "온도 63°C로"),
    ("부하 50%으로", {}, "부하 50%로"),
    ("10필지(대장 기준)을", {}, "10필지(대장 기준)를"),
])
def test_fix4_josa_after_paren_and_units(src, envs, want):
    assert runner.fix_josa(src, envs) == want


# 권고 — 확인 카드 취소 뒤 답이 같은 말을 두 번 하지 않는다(한 문장 · LLM 0)
@pytest.mark.parametrize("q,want", [("곡성군 보고서 초안 써 줘", "취소해서 실행하지 않았습니다."),
                                    ("Write a report", "Cancelled on the confirmation card — nothing was run.")])
def test_cancel_is_one_sentence(monkeypatch, restore_ext, q, want):
    _guard_module(monkeypatch, exc=ToolError("rejected_by_user", "사람이 확인 카드에서 거부했습니다 — 실행하지 않았습니다", 409))
    _no_llm(monkeypatch)
    ctx = _ctx(GJ, q)
    asyncio.run(runner.answer_direct(ctx, q, {"tool": "r3t_report", "args": {}, "module": "r3t_report"}, 0.0, {"pii": []}))
    assert _done(ctx)["answer_md"] == want
