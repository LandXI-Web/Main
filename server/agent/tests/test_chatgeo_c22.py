"""XI ChatGEO 바퀴 22(10-22 now 21 답) — 범위 줄 · 출처 · 행정동 이름 · 화면별 도구 · 긴 요청 · 관리자 전용 거절 · 말투 → 같은 조문 · '우리 시' 규칙."""
from __future__ import annotations

import asyncio
from types import SimpleNamespace

from agent import hjd, longreq, runner, scopecheck, talk
from agent.rag import index as LAW
from agent.tools.ext import ask, ops


def _ctx(**kw):
    c = runner.Ctx(run_id="run_test_c22", principal=SimpleNamespace(realm=kw.pop("realm", "lx"), role="staff", tenant_id=kw.pop("tenant", None),
                                                                     user_id="u"), token=None, context=kw.pop("context", {}))
    for k, v in kw.items():
        setattr(c, k, v)
    return c


def test_admin_line_one_sentence():
    # 관리자 전용 질문(서버 · GPU · 사용량) 거절 문장 하나(10-22 채택) — 직원 · 기관 · 런타임 같은 말
    line = "이 계정에서는 볼 수 없습니다 — LX 관리자 화면에서 봅니다."
    assert ops.ADMIN_LINE == line
    assert runner.say("ko", "admin_only") == line


def test_same_meaning_same_article():
    # '할 수 없는 행위' · '행위 제한이 뭐야' · '금지되는 행위' → 모두 「농지법」 제32조(본 조문) — 특례(제53조)가 먼저 나오지 않게
    for q in ["농업진흥구역에서 할 수 없는 행위는?", "농업진흥구역에서 행위 제한이 뭐야", "농업진흥구역에서 금지되는 행위", "농업진흥구역에서 못 하는 것"]:
        r = LAW.search(q, None, 3)
        assert r["found"] and r["hits"][0]["article"] == "제32조", (q, r["hits"][0]["ref"]["label"])
    # 특례를 물으면 특례 조문
    r = LAW.search("농업진흥구역과 농업보호구역에 걸치는 필지", None, 3)
    assert r["hits"][0]["article"] == "제53조"


def test_hjd_annotate_keeps_numbers_and_addresses():
    class C:
        lang = "ko"
    tb = {"하정동": "죽항동"}
    orig = hjd.names
    hjd.names = lambda sgg: tb
    try:
        md = "운봉읍 {{env:e1}}건 · 하정동에서 {{env:e2}}건 · 읍면동 {{env:e3}}곳"
        out = hjd.annotate(C(), md, "52190")
        assert "하정동(행정동 죽항동)에서" in out and "{{env:e2}}" in out
        assert "읍면동 {{env:e3}}곳(법정동 기준)" in out
        # 주소(지번) 안의 동 이름은 그대로
        assert hjd.annotate(C(), "1위 남원시 하정동 773-8 [3]", "52190") == "1위 남원시 하정동 773-8 [3]"
    finally:
        hjd.names = orig


def test_screen_tools_trims_by_page():
    tools = [{"type": "function", "function": {"name": n}} for n in
             ["map_zoom", "global_map", "ledger_ingest", "survey_stats", "law_search", "ximap_dash"]]
    c = _ctx(context={"page": "xi-clean", "has_map": True})
    names = [t["function"]["name"] for t in runner.screen_tools(c, tools)]
    assert "global_map" not in names and "ledger_ingest" not in names and "map_zoom" in names
    c = _ctx(context={"page": "gov-fusion", "has_map": False})
    names = [t["function"]["name"] for t in runner.screen_tools(c, tools)]
    assert "ledger_ingest" in names and "map_zoom" not in names and "ximap_dash" not in names
    c = _ctx(context={"page": "global", "has_map": True})
    names = [t["function"]["name"] for t in runner.screen_tools(c, tools)]
    assert "global_map" in names and "survey_stats" not in names


def test_long_survey_match():
    q = ("저희 과에서 올해 아영면 일대 나대지와 건물에 대해 실태조사를 나가야 하는데 현장 인력이 부족해서 영상으로 먼저 걸러 보려고 합니다. "
         "합계는 마지막 줄에 읍면동별로 나눠서 정리해 주시고 확인이 급한 순서로 추려 주세요. 근거가 되는 법령 조항도 같이 알려 주시면 보고서에 넣겠습니다.")
    assert longreq.match(q)
    assert not longreq.match("남원 의심 필지 몇 건이야")
    assert not longreq.match("실태조사 근거 조문 알려 줘")


def test_source_line_names_screen_not_tool():
    c = _ctx()
    c.steps = [{"i": 1, "tool": "ximap_dash", "ok": True}]
    c.keymap = {(1, "n"): "e1"}
    s = scopecheck.source_line(c, "남원시 · 경작지 — {{env:e1}}.")
    assert s == "XI맵 통계 판" and "_" not in s
    assert scopecheck.source_line(c, "숫자 없는 답") is None


def test_rank_and_count_routes():
    from landxi_api import deps
    from landxi_api.deps import close
    deps._pool = deps._pool_sys = deps._redis = None             # 앞선 시험의 닫힌 루프 묶음을 버린다
    if hasattr(deps, "_pool_tenant"):
        deps._pool_tenant = None
    c = _ctx(realm="tenant", tenant="namwon", context={"region": "52190", "page": "gov-home", "has_map": False})

    async def go():
        try:
            return await ask.ROUTE("읍면동별 현장 확인 필요 필지 순위", c), await ask.ROUTE("남원시 비닐하우스 몇 곳이야", c)
        finally:
            await close()                                  # 이 시험 루프에서 연 DB 묶음은 닫는다(다음 시험의 다른 루프와 섞이지 않게)
    h1, h2 = asyncio.run(go())
    assert h1 and h1["tool"] == "survey_rank"
    assert h2 and h2["tool"] == "class_count" and h2["args"]["task"] == "비닐하우스"


def test_home_rule_multi_tenant():
    # '우리 시' 규칙 — 여러 시군을 맡은 기관: 지도가 관할 시군을 보면 그곳 · 아니면 관할 전체(한 곳을 아무렇게나 고르지 않는다)
    c = _ctx(realm="tenant", tenant="gwangju-jeonnam", context={})
    assert asyncio.run(talk.home(c)) is None
    assert len(talk.home_all(c)) > 1
    c2 = _ctx(realm="tenant", tenant="gwangju-jeonnam", context={"region": "46130"})
    h = asyncio.run(talk.home(c2))
    from landxi_api.regions import region_of
    assert h and h["sgg_cd"] == region_of("46130")["sgg_cd"]          # 지금 코드(옛 코드로 물어도 같은 곳)
    c3 = _ctx(realm="tenant", tenant="namwon", context={})
    assert (asyncio.run(talk.home(c3)) or {}).get("sgg_cd") == "52190"
