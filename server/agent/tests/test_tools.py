"""도구 스키마(계약 → OpenAI tools) · caps 교집합 · 라우터 4클래스 · 리플레이 녹음 형식 · 백엔드 온프레미스 강제."""
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from agent import backends, config  # noqa: E402
from agent.tools import from_contract, registry  # noqa: E402
from landxi_api.deps import CAPS, Principal  # noqa: E402

CONTRACT_TOOLS = {"catalog_layers", "results_stats", "results_features", "parcel_at", "results_parcels_join", "survey_findings", "survey_stats",
                  "survey_parcel", "jobs_quote", "jobs_submit", "survey_state"}
CLIENT = {"map_on", "map_arrive", "map_flyto", "map_frame", "drawer_open", "parcel_card"}


LEDGER_TOOLS = {"ledger_ingest", "ledger_match", "ledger_rule", "ledger_findings", "parcel_lookup"}     # S-10(runner 가 등록)
SUMMARY_TOOLS = {"summary_lookup"}                                                                      # fix-agent-scope(runner 가 등록)


def test_tool_names_are_contract_names():
    from agent import runner  # noqa: F401
    from agent.tools import ext
    base = set(registry.SPECS) - set(ext.OWNER)                   # 확장 도구(tools/ext · plan 3.1)는 모듈 소유로 따로
    assert base == CONTRACT_TOOLS | CLIENT | LEDGER_TOOLS | SUMMARY_TOOLS
    for n in ext.OWNER:                                            # 확장 도구도 스키마가 만들어진다(EXT 또는 CLIENT)
        assert from_contract.endpoint(n)["method"] in ("EXT", "CLIENT", "GET", "POST"), n
    assert from_contract.endpoint("summary_lookup")["path"] == "/api/v1/summary"
    for n in CONTRACT_TOOLS:
        ep = from_contract.endpoint(n)
        assert ep["path"].startswith("/api/v1/"), (n, ep)
    assert from_contract.endpoint("jobs_submit")["method"] == "POST"
    assert from_contract.endpoint("survey_findings")["path"] == "/api/v1/survey/findings"
    assert "rule" in from_contract.endpoint("survey_findings")["query"]


def test_schema_generation_rejects_non_contract():
    with pytest.raises(ValueError):
        from_contract.build({"deploys_rollback": {"description": "x", "properties": {}}})
    tools = from_contract.build(registry.SPECS)
    assert all(t["type"] == "function" and t["function"]["parameters"]["type"] == "object" for t in tools)
    assert any("[GET /api/v1/survey/findings]" in t["function"]["description"] for t in tools)


@pytest.mark.parametrize("who,has,hasnot", [
    (("lx", "staff"), {"survey_findings", "jobs_quote", "jobs_submit", "survey_state"}, set()),
    (("lx", "sales"), {"jobs_quote", "jobs_submit", "survey_findings"}, {"survey_state"}),
    (("tenant", "manager"), {"survey_findings", "survey_state", "results_stats"}, {"jobs_quote", "jobs_submit"}),
    (("tenant", "viewer"), {"survey_findings"}, {"jobs_quote", "jobs_submit", "survey_state"}),
])
def test_caps_intersection(who, has, hasnot):
    p = Principal(who[0], who[1], "namwon" if who[0] == "tenant" else None, "u", caps=CAPS[who])
    names = {t["function"]["name"] for t in registry.tools_for(p)}
    assert has <= names and not (hasnot & names)


def test_validate_enum_and_required():
    from agent.tools import ToolError
    with pytest.raises(ToolError):
        registry.validate("survey_findings", {"rule": "R9"})
    with pytest.raises(ToolError):
        registry.validate("survey_stats", {})
    assert registry.validate("survey_findings", {"rule": "R1", "evil": "x"}) == {"rule": "R1"}


def test_onprem_only():
    assert config.LLM_EXTERNAL is False
    for name, b in config.BACKENDS.items():
        if name == "dokpamo" and not config.backend_on("dokpamo"):
            assert "dokpamo" not in config.CHAIN                 # 승격 자리 — 연결 전이면 사슬 밖 · 탐침 0
            continue
        assert config.host_allowed(b["base"]), b
    assert not config.host_allowed("https://api.openai.com/v1")
    assert not backends._allowed({"base": "https://generativelanguage.googleapis.com/v1", "name": "x"})
    assert backends._allowed({"base": "http://llm-gemma.landxi.internal:8000/v1", "name": "x"})


def test_rule_router_fallback():
    assert backends.rule_classify("아영면 답 위 건물 의심 필지 보여줘") == "map"
    assert backends.rule_classify("아영면 보고서 초안 써줘") == "report"
    assert backends.rule_classify("GPU1 왜 느려?") == "ops"
    assert backends.rule_classify("안녕하세요") == "smalltalk"


def test_inline_tool_call_parser():
    t = '<tool_call>{"name": "survey_stats", "arguments": {"by": "rule"}}</tool_call>'
    out = backends.parse_inline_tool_calls(t, {"survey_stats"})
    assert out and out[0]["name"] == "survey_stats" and json.loads(out[0]["arguments"]) == {"by": "rule"}
    assert backends.parse_inline_tool_calls('{"name":"deploys_rollback","arguments":{}}', {"survey_stats"}) == []


@pytest.mark.parametrize("q,intent", [("아영면 답 위에 건물이 있는 의심 필지 상위 5개 보여줘", "map"), ("아영면 실태조사 보고서 초안 써줘", "report"),
                                      ("GPU1 왜 느려?", "ops"), ("안녕", "smalltalk")])
def test_router_live(q, intent):
    import asyncio
    h = asyncio.run(backends.probe({"base": config.BACKENDS["router"]["base"], "model": config.BACKENDS["router"]["model"], "name": "router"}))
    if not h["ok"]:
        pytest.skip("라우터 :8001 미기동")
    r = asyncio.run(backends.classify(q))
    assert r["intent"] == intent, r
    assert r["ms"] > 0


REPLAY = config.REPLAY_DIR


@pytest.mark.parametrize("name", ["ag0-namwon.ndjson", "ag0-verify.ndjson", "ag0-frame.ndjson", "ag0-report.ndjson"])
def test_replay_recording_format(name):
    f = REPLAY / name
    if not f.exists():
        pytest.skip("녹음 전")
    lines = [json.loads(x) for x in f.read_text(encoding="utf-8").splitlines() if x.strip()]
    assert lines[0]["event"] == "replay.meta" and lines[0]["data"]["run_id"].startswith("run_")
    ts = [x["t"] for x in lines]
    assert ts == sorted(ts)
    ev = [x["event"] for x in lines]
    assert "agent.plan" in ev and ("agent.done" in ev)
    done = next(x for x in lines if x["event"] == "agent.done")["data"]
    assert done["model"]["backend"] in ("vllm", "ollama") and done["tokens"]["basis"] == "measured"
