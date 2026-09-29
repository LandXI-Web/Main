"""C2 c2-core — 에이전트 공통 뼈대: 확장 불러오기 · 동작 대조 · 언어 감지 · 자리표·꼬리·금지어 · 블록 · 독파모 자리 (LLM·GPU 0)."""
import asyncio
import os
import sys
import types
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from agent import config, lint, runner  # noqa: E402
from agent.tools import Out, ToolError, ext, from_contract, registry  # noqa: E402
from landxi_api.deps import CAPS, Principal  # noqa: E402

STAFF = Principal("lx", "staff", None, "u_lx_staff", caps=CAPS[("lx", "staff")])
ADMIN = Principal("lx", "admin", None, "u_lx_admin", caps=CAPS[("lx", "admin")])
NAMWON = Principal("tenant", "manager", "namwon", "u_nw", caps=CAPS[("tenant", "manager")])
GUEST = Principal()


@pytest.fixture(autouse=True)
def nodb(monkeypatch):
    """DB·감사 기록 없이(테스트는 읽기·쓰기 0)."""
    async def _nodb():
        raise RuntimeError("no db in tests")

    async def _nolog(*a, **k):
        return None
    monkeypatch.setattr(runner, "_db", _nodb)
    monkeypatch.setattr(runner.audit, "log", _nolog)


# ── 1. 확장 불러오기(plan 3.1) ─────────────────────────────────────────────
def _fake_module(name: str, **attrs):
    m = types.ModuleType(name)
    for k, v in attrs.items():
        setattr(m, k, v)
    sys.modules[name] = m
    return m


@pytest.fixture
def fresh_ext(monkeypatch):
    """실제 ext/*.py 를 내려놓고 시험 모듈만으로 다시 불러온다 · 끝나면 원래대로."""
    ext.unload(registry, from_contract)
    yield
    ext.unload(registry, from_contract)
    monkeypatch.delenv("LX_AGENT_EXT_EXTRA", raising=False)
    ext.load(registry, from_contract, force=True)


def test_ext_load_merges_everything(monkeypatch, fresh_ext):
    async def h_read(args, ctx):
        o = Out(source="t")
        o.env("n", "시험 건수", {"value": 3, "unit": "count", "basis": "measured"})
        return o

    async def h_write(args, ctx):
        return Out(source="t")
    _fake_module("c2t_good", SPECS={"t_read": {"description": "읽기", "properties": {}}, "t_write": {"description": "쓰기", "properties": {}},
                                     "t_map": {"description": "지도", "properties": {"zoom": {"type": "number"}}}},
                 HANDLERS={"t_read": h_read, "t_write": h_write}, WRITE={"t_write"}, CONFIRM={"t_write"}, CLIENT={"t_map"},
                 allowed=lambda n, p: p.realm == "lx", WHY={"t_read": "시험 읽기"}, SAY={"t_read": "읽기"}, HINT="시험 규칙 한 줄",
                 ROUTE=lambda msg, ctx: {"tool": "t_read", "args": {}} if msg == "시험" else None)
    _fake_module("c2t_bad_import")
    del sys.modules["c2t_bad_import"]                               # 불러오기 실패(없는 모듈)
    _fake_module("c2t_dup", SPECS={"survey_stats": {"description": "겹침", "properties": {}}, "t_nohandler": {"description": "x", "properties": {}}},
                 HANDLERS={"survey_stats": h_read})
    monkeypatch.setenv("LX_AGENT_EXT_EXTRA", "c2t_good,c2t_bad_import,c2t_dup")
    loaded = ext.load(registry, from_contract, force=True)
    assert loaded["c2t_good"]["ok"] and set(loaded["c2t_good"]["tools"]) == {"t_read", "t_write", "t_map"}
    assert loaded["c2t_bad_import"]["ok"] is False and "ModuleNotFoundError" in loaded["c2t_bad_import"]["error"]   # 서버는 뜬다(경고만)
    assert loaded["c2t_dup"]["tools"] == []                         # 기본 도구가 먼저 → 겹친 이름은 버림 · 핸들러 없는 도구도 버림
    assert registry.HANDLERS["survey_stats"] is not h_read
    assert any("이미 있습니다" in w for w in ext.WARNINGS) and any("핸들러가 없습니다" in w for w in ext.WARNINGS)
    assert "t_write" in registry.WRITE and "t_write" in registry.CONFIRM and "t_map" in registry.CLIENT
    names_staff = {t["function"]["name"] for t in registry.tools_for(STAFF)}
    names_nw = {t["function"]["name"] for t in registry.tools_for(NAMWON)}
    assert {"t_read", "t_write", "t_map"} <= names_staff and not ({"t_read", "t_write", "t_map"} & names_nw)   # 모듈 allowed
    assert not registry.tools_for(GUEST)
    desc = next(t for t in registry.tools_for(STAFF) if t["function"]["name"] == "t_read")["function"]["description"]
    assert desc == "읽기"                                           # 계약 경로 없는 확장 도구는 [METHOD path] 꼬리 없음
    assert ext.WHY["t_read"] == "시험 읽기" and ext.SAY["t_read"] == "읽기"
    assert "시험 규칙 한 줄" in runner.system_prompt("ko") and "시험 규칙 한 줄" in runner.system_prompt("en")
    assert "c2t_good" in [m for m, _ in ext.ROUTES] and "c2t_dup" not in [m for m, _ in ext.ROUTES]


def test_ext_default_allowed_and_client_default(monkeypatch, fresh_ext):
    _fake_module("c2t_min", SPECS={"t_pan": {"description": "이동", "properties": {"dx": {"type": "number"}}}}, CLIENT={"t_pan"})
    monkeypatch.setenv("LX_AGENT_EXT_EXTRA", "c2t_min")
    ext.load(registry, from_contract, force=True)
    assert registry.allowed("t_pan", NAMWON) and registry.allowed("t_pan", STAFF) and not registry.allowed("t_pan", GUEST)
    ctx = runner.Ctx(run_id="run_test0001", principal=STAFF, token=None, context={})
    r = asyncio.run(runner.run_tool(ctx, 1, "t_pan", {"dx": 2}))
    assert r["ok"] and ctx.ui_ops == ["t_pan"]                     # 핸들러 없는 CLIENT → {op: 이름, **인자} 그대로 ui_actions


def test_real_ext_modules_all_accounted():
    """지금 폴더의 실제 확장(다른 작업 소유) — 파일마다 LOADED 항목이 있고, 실패한 모듈은 오류 문구를 남긴 채 나머지는 붙는다."""
    loaded = ext.load(registry, from_contract)
    here = Path(ext.__file__).parent
    files = {p.stem for p in here.glob("*.py") if not p.stem.startswith("_")}
    assert files <= set(loaded), files - set(loaded)
    for k, v in loaded.items():
        assert v["ok"] or v["error"], k
        for n in v["tools"]:
            assert n in registry.SPECS and ext.OWNER[n] == k


# ── 2. 지어낸 동작 차단(plan 3.4) — 동작 문장 12종(한·영) ─────────────────────
CLAIMS = [
    ("확대하여 보여드리겠습니다.", "map_zoom"),
    ("지도를 한 단계 축소했습니다.", "map_zoom"),
    ("영상 층을 켰습니다.", "map_layer"),
    ("AI 분석 결과 레이어를 꺼 두었습니다.", "map_layer"),
    ("3D 시점으로 기울여 드립니다.", "map_view"),
    ("지도를 구례군으로 이동했습니다.", "map_region"),
    ("의심 필지를 빨간색으로 칠했습니다.", "map_on"),
    ("보고서 서랍을 열었습니다.", "drawer_open"),
    ("I zoomed in on Gurye-gun.", "map_zoom"),
    ("I turned on the imagery layer.", "map_layer"),
    ("I moved the map to Chui.", "map_region"),
    ("I tilted the map into a 3D view.", "map_view"),
]


@pytest.mark.parametrize("sentence,op", CLAIMS)
def test_action_claim_without_action_is_replaced(sentence, op):
    lang = "en" if sentence[0].isascii() else "ko"
    md, flags = lint.action_check("결과입니다. " + sentence if lang == "ko" else "Here it is. " + sentence, set(), lang)
    assert flags and lint.ACTION_NA[lang] in md and sentence not in md
    md2, flags2 = lint.action_check(sentence, {op}, lang)           # 같은 run 에 그 동작이 있으면 그대로
    assert not flags2 and md2 == sentence


@pytest.mark.parametrize("s", ["그 지도 동작은 아직 할 수 없습니다.", "확대 기능은 아직 없습니다.", "3D 보기는 지원하지 않습니다.", "I can't zoom the map yet.",
                               "조건에 맞는 의심 필지 20,852건입니다.", "영상을 켜려면 오른쪽 버튼을 누르세요."])
def test_non_claims_untouched(s):
    md, flags = lint.action_check(s, set(), "ko")
    assert not flags and md == s


def test_duplicate_replacements_collapse():
    md, flags = lint.action_check("확대했습니다. 영상 층을 켰습니다. 3D로 기울였습니다.", set(), "ko")
    assert len(flags) == 3 and md.count(lint.ACTION_NA["ko"]) == 1


# ── 3. 언어 감지(plan 3.6) ───────────────────────────────────────────────
@pytest.mark.parametrize("q,lang", [("Show flagged parcels in Chui district", "en"), ("How many low NDVI fields?", "en"), ("구례군 보여 줘", "ko"),
                                   ("의심 필지 몇 건?", "ko"), ("Zoom in on 구례군", "en"), ("Gurye-gun 확대해 줘", "ko"), ("남원 NDVI 알려 줘", "ko"), ("123", "ko"), ("", "ko")])
def test_lang_of(q, lang):
    assert runner.lang_of(q) == lang


def test_english_messages_exist():
    for k in runner.MSG["ko"]:
        assert k in runner.MSG["en"]
    from agent import audit
    for cat, _rx, _why in audit.GUARDS:
        assert cat in audit.GUARDS_EN and not any("가" <= ch <= "힣" for ch in audit.GUARDS_EN[cat])
    assert audit.reject_text("no_region_data", "해당 지역 데이터가 없습니다", "en") == "No data for this area yet."
    assert "Map actions" in runner.system_prompt("en") and "그 지도 동작은 아직 할 수 없습니다" in runner.system_prompt("ko")


# ── 4. 자리표 · 꼬리 · 금지어(K2) ─────────────────────────────────────────
def test_unverified_placeholders_never_reach_screen():
    md = lint.render_unverified("2023 {{unv:u1}}cm 영상, 의심 {{unv:u2}}건, {{env:e1}} ~입니다 {{foo}}")
    assert "{{unv" not in md and "{{foo" not in md and "~" not in md
    assert md.startswith("2023 확인되지 않음 영상") and "{{env:e1}}입니다" in md
    assert lint.render_unverified("{{unv:u1}} parcels", "en") == "unverified parcels"


def test_3d_is_structural_not_a_number():
    r = lint.lint("3D 시점과 2D 지도를 씁니다.", {"e1": {"value": 3, "unit": "count"}})
    assert not r.unverified and "{{" not in r.answer_md


def test_banned_terms_scrubbed():
    s = ("GPU·대기열 질문은 **관제 운영 에이전트(AG-6)** 몫입니다. 관제 화면의 GPU 패널. GET /api/v1/ops/gpus 와 runner.py 참고. "
         "PostGIS survey_findings · V-World 연속지적 · 건축HUB API 키 대기 · 서술: llm")
    out = lint.scrub_terms(s)
    assert lint.banned_hits(s) == sorted({"AG-", "관제", "/api", ".py", "PostGIS", "V-World", "API 키", "llm"})
    assert lint.banned_hits(out) == [], out
    assert "LX 관리자 화면" in out and "vLLM" in lint.scrub_terms("vLLM 서버")   # 단독 llm 만 · vLLM 은 그대로


# ── 5. finish 파이프라인 — 운영 질문 고정 답 없음 · 동작 대조 · 블록 ────────────────
def _ctx(p=STAFF, msg="", lang="ko"):
    ctx = runner.Ctx(run_id="run_test0002", principal=p, token=None, context={})
    ctx.lang = lang
    ctx.state["msg"] = msg
    return ctx


class _Res:
    backend, model, base, first_token_ms, tps, fallback_from = "vllm", "gemma", "http://127.0.0.1:8000/v1", 1.0, None, []
    usage = {}


def _finish(ctx, answer, res=_Res(), artifact=None):
    asyncio.run(runner.finish(ctx, answer, res, 0.0, {"ms": 0}, {}, artifact=artifact))
    return next(d for _t, e, d in ctx.events if e == "agent.done")


def test_finish_replaces_fabricated_action_and_scrubs():
    d = _finish(_ctx(), "구례군 결과입니다. 확대하여 보여드리겠습니다. 관제 화면(AG-6)에서 보세요.")
    assert "확대하여" not in d["answer_md"] and "그 지도 동작은 아직 할 수 없습니다" in d["answer_md"]
    assert lint.banned_hits(d["answer_md"]) == [] and d["action_flags"]


def test_finish_keeps_real_action():
    ctx = _ctx()
    ctx.ui_ops.append("map_zoom")
    d = _finish(ctx, "지도를 확대했습니다.")
    assert d["answer_md"] == "지도를 확대했습니다." and "action_flags" not in d


def test_ops_route_has_no_fixed_legacy_answer():
    src = Path(runner.__file__).read_text(encoding="utf-8")
    assert "AG-6" not in src.split("def execute", 1)[1].split("async def finish", 1)[0]
    assert runner.say("ko", "admin_only") == "LX 관리자 화면에서 확인할 수 있습니다."


def test_blocks_env_keys_become_envelope_ids_and_auto_chart():
    ctx = _ctx(msg="읍면동별 차트로 보여 줘")
    o = Out(source="t")
    o.env("emd_1", "운봉읍 의심 건수", {"value": 30, "unit": "count", "basis": "inferred"})
    o.env("emd_2", "아영면 의심 건수", {"value": 12, "unit": "count", "basis": "inferred"})
    o.blocks.append({"type": "file", "label": "a.docx", "href": config.run_href("run_test0002", "a.docx")})
    o.blocks.append({"type": "chart", "kind": "bar", "title": "x", "rows": [{"label": "운봉읍", "env": "emd_1"}, {"label": "숫자", "env": 5}]})
    o.blocks.append({"type": "script", "src": "x"})                  # 모르는 블록은 버린다
    runner.register(ctx, 1, o)
    kinds = [b["type"] for b in ctx.blocks]
    assert kinds == ["file", "chart"] and ctx.blocks[1]["rows"] == [{"label": "운봉읍", "env": "e1"}]   # 숫자 직접 값은 버림
    ctx2 = _ctx(msg="읍면동별 차트로 보여 줘")
    runner.register(ctx2, 1, Out(envelopes=o.envelopes))
    d = _finish(ctx2, "읍면동별 의심 건수입니다.", artifact={"docx_url": "/api/v1/agent/runs/run_x/draft.docx", "filename": "초안.docx"})
    chart = next(b for b in d["blocks"] if b["type"] == "chart")
    assert [r["label"] for r in chart["rows"]] == ["운봉읍", "아영면"] and chart["rows"][0]["env"] == "e1"
    assert any(b["type"] == "file" and b["label"] == "초안.docx" for b in d["blocks"])


def test_probe_extension_blocks(monkeypatch, fresh_ext, tmp_path):
    """시험 확장(ext_probe) — ROUTE 직행 · 차트·파일·영상 블록 3종 · 파일은 run 폴더 안."""
    monkeypatch.setattr(config, "ARTIFACT_DIR", tmp_path)
    monkeypatch.setenv("LX_AGENT_EXT_EXTRA", "agent.tests.ext_probe")
    ext.load(registry, from_contract, force=True)

    async def fake_stats(args, ctx):
        o = Out(source="t")
        o.env("suspects", "전체", {"value": 42, "unit": "count"})
        o.env("emd_1", "운봉읍 의심 건수", {"value": 30, "unit": "count"})
        o.env("emd_2", "아영면 의심 건수", {"value": 12, "unit": "count"})
        return o
    monkeypatch.setitem(registry.HANDLERS, "survey_stats", fake_stats)
    ctx = runner.Ctx(run_id="run_test0003", principal=STAFF, token=None, context={"region": "52190"})
    hit = asyncio.run(runner.ext_route(ctx, "명령 바 블록 확인"))
    assert hit and hit["tool"] == "blocks_probe"
    assert "blocks_probe" not in {t["function"]["name"] for t in registry.tools_for(STAFF)}     # route_only — 모델에게는 없다
    assert asyncio.run(runner.ext_route(runner.Ctx(run_id="run_test0004", principal=NAMWON, token=None, context={}), "명령 바 블록 확인")) is None
    r = asyncio.run(runner.run_tool(ctx, 1, "blocks_probe", {}))
    assert r["ok"] and sorted(b["type"] for b in ctx.blocks) == ["chart", "file", "image"]
    assert (tmp_path / "run_test0003" / "blocks.docx").is_file() and (tmp_path / "run_test0003" / "tile.webp").is_file()
    assert all(b.get("href", b.get("src", "")).startswith("/api/v1/agent/runs/run_test0003/files/") for b in ctx.blocks if b["type"] != "chart")


# ── 6. 독파모 승격 자리 · 산출 파일 경로 ────────────────────────────────────
def test_dokpamo_slot_off_by_default():
    d = config.BACKENDS["dokpamo"]
    assert d["enabled"] is False and not config.backend_on("dokpamo") and "dokpamo" not in config.CHAIN
    assert config.CHAIN[:2] == ["vllm", "ollama"]


def test_dokpamo_goes_first_only_when_enabled_and_onprem(monkeypatch):
    monkeypatch.setitem(config.BACKENDS, "dokpamo", {**config.BACKENDS["dokpamo"], "enabled": True, "base": "http://127.0.0.1:8010/v1", "model": "dokpamo-x"})
    assert config.chain()[0] == "dokpamo"
    monkeypatch.setitem(config.BACKENDS, "dokpamo", {**config.BACKENDS["dokpamo"], "base": "https://cloud.example.com/v1"})
    assert "dokpamo" not in config.chain()                        # 외부 주소는 켜도 사슬 밖(host_allowed)


def test_health_reports_dokpamo_not_connected():
    from agent import backends
    h = asyncio.run(backends.health(None, write=False))
    assert h["dokpamo"]["state"] == "연결 전" and h["dokpamo"]["ok"] is False and h["dokpamo"]["probe_ms"] is None


def test_run_files_names():
    assert config.RUN_FILE.match("draft.docx") and config.RUN_FILE.match("영상_조각-1.png")
    for bad in ("../x.docx", "a/b.png", "x.exe", "x.py", ""):
        assert not (config.RUN_FILE.match(bad) and "/" not in bad and ".." not in bad), bad
    with pytest.raises(ValueError):
        config.run_dir("../etc")
    assert config.run_href("run_a1", "a b.png") == "/api/v1/agent/runs/run_a1/files/a%20b.png"


def test_main_mounts_law_router_optionally():
    src = (Path(__file__).resolve().parents[2] / "landxi_api" / "main.py").read_text(encoding="utf-8")
    assert 'for _name in ("law",)' in src and "건너뜀" in src


def test_device_ordinals_and_file_names_are_not_numbers():
    r = lint.lint("GPU 0은 대기 중이고 GPU 1은 사용 중입니다.", {"e1": {"value": 0, "unit": "%"}, "e2": {"value": 1, "unit": "count"}})
    assert not r.unverified and "{{" not in r.answer_md
    md, _ = lint.fix_cites("아래에서 .docx 파일을 받습니다 [1] .", {1})
    assert md == "아래에서 .docx 파일을 받습니다 [1]."
    assert "\x01" not in Path(lint.__file__).read_text(encoding="utf-8")        # 역참조 깨짐(제어 문자) 0


# ── 7. 실증 2차 must_fix — 결과 요약 ≠ 분석 실행 · 영어 단위 겹침 ─────────────────────
@pytest.mark.parametrize("q", ["강진군 AI 분석 결과 요약해 줘", "강진군 분석 결과 요약해줘", "여수시 AI 분석 결과 정리해 줘",
                               "분석 결과 보여 줘", "Summarize the AI results for Gangjin-gun", "Show me the results for Yeosu-si"])
def test_lookup_questions_are_not_runs(q):
    assert runner.lookup_not_run(q)


@pytest.mark.parametrize("q", ["강진군 전역 분석 실행해 줘", "강진군 분석 돌려 줘", "강진군 비닐하우스 분석해 줘",
                               "강진군 분석 실행하고 결과 요약해 줘", "Run the AI analysis for Gangjin-gun"])
def test_run_questions_stay_runs(q):
    assert not runner.lookup_not_run(q)


def _run_ext(monkeypatch):
    async def h_run(args, ctx):
        return Out(source="t")

    def route(msg, ctx):
        return {"tool": "analysis_run", "args": {"region": "12780"}} if "분석" in msg else None
    _fake_module("c2t_run", SPECS={"analysis_run": {"description": "분석 실행", "properties": {"region": {"type": "string"}}}},
                 HANDLERS={"analysis_run": h_run}, WRITE={"analysis_run"}, CONFIRM={"analysis_run"}, ROUTE=route)
    monkeypatch.setenv("LX_AGENT_EXT_EXTRA", "c2t_run")
    ext.load(registry, from_contract, force=True)


def test_summary_question_skips_run_route(monkeypatch, fresh_ext):
    _run_ext(monkeypatch)
    ctx = _ctx(msg="강진군 AI 분석 결과 요약해 줘")
    assert asyncio.run(runner.ext_route(ctx, ctx.state["msg"])) is None
    assert ctx.state["route_skipped"] and all(x.endswith(":analysis_run") for x in ctx.state["route_skipped"])
    hit = asyncio.run(runner.ext_route(_ctx(), "강진군 전역 분석 실행해 줘"))
    assert hit and hit["tool"] == "analysis_run"


def test_model_run_call_on_summary_question_gets_no_confirm_card(monkeypatch, fresh_ext):
    _run_ext(monkeypatch)
    ctx = _ctx(msg="강진군 AI 분석 결과 요약해 줘")
    r = asyncio.run(runner.run_tool(ctx, 1, "analysis_run", {"region": "12780"}))
    assert not r["ok"] and ctx.steps[-1]["error"] == "lookup_not_run"
    assert not any(e == "agent.confirm" for _t, e, _d in ctx.events)


def test_summary_rule_in_both_prompts():
    assert "분석 실행(analysis_run" in runner.system_prompt("ko") and "never start an analysis" in runner.system_prompt("en")


KIT = Path(__file__).resolve().parents[3] / "landxi" / "v3" / "kit"


def test_en_units_cover_korean_server_units():
    import json
    en = json.loads((KIT / "i18n" / "en.json").read_text(encoding="utf-8"))
    for u in ("건", "필지", "동", "개", "장", "대", "시간", "토큰", "count", "tokens"):
        v = en.get(f"unit.{u}")
        assert v and not any("가" <= ch <= "힣" for ch in v), u


@pytest.mark.skipif(not __import__("shutil").which("node"), reason="node 없음")
def test_en_chip_unit_not_doubled():
    """cmdk.js unitWritten — 모델이 자리표 뒤에 명사·단위를 쓰면 칩 단위를 붙이지 않는다(실증 문장 그대로)."""
    import json
    import re
    import subprocess
    src = (KIT / "cmdk.js").read_text(encoding="utf-8")
    a = src.index("const NOUN_EN = ")
    b = src.index("function fill(")
    cases = [(" suspect parcels under", "cases", True), (" detected cases", "cases", True), ("°C.", "°C", True),
             (" GB of memory", "GB", True), (" GPUs under high load", "GPUs", True), (" job(s) waiting", "jobs", True),
             (" analysis jobs in progress", "jobs", True), (" in Gangjin-gun.", "cases", False), (".", "parcels", False),
             (" and 633", "cases", False), (" awaiting confirmation", "cases", False),
             (" requiring field inspection", "parcels", False), (" detected cases", "cases", True)]
    js = src[a:b] + "\nconst C=" + json.dumps(cases, ensure_ascii=False) + ";\nconsole.log(JSON.stringify(C.map(([s,u,e])=>unitWritten(s,u)===e)));"
    out = subprocess.run(["node", "-e", js], capture_output=True, text=True, encoding="utf-8", timeout=30)
    assert out.returncode == 0, out.stderr
    res = json.loads(out.stdout.strip())
    assert all(res), [c for c, ok in zip(cases, res) if not ok]
