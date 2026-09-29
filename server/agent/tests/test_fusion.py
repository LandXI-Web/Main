"""c2-fusion — '의심 필지 몇 건?' 직행(fusion_suspects) · 대장 도구 읍면동 차트 블록 · 관할 가드(가짜 HTTP · DB 0 · LLM 0)."""
import asyncio
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from agent.tools import Out, ToolError  # noqa: E402
from agent.tools import ledger_findings as LF  # noqa: E402
from agent.tools.ext import fusion as FU  # noqa: E402

IMP = {"import_id": "imp_1", "state": "matched", "rows": {"value": 10, "unit": "행"}, "kind": "farm_ledger", "ai": {"has": True}}
ENV = lambda v, u="필지": {"value": v, "unit": u, "basis": "inferred", "as_of": "2026-09-30T00:00:00+09:00", "source": "t"}  # noqa: E731


class Res:
    def __init__(self, code, j):
        self.status_code, self._j = code, j

    def json(self):
        return self._j


class Http:
    def __init__(self, routes):
        self.routes, self.calls = routes, []

    async def get(self, path, params=None):
        self.calls.append((path, dict(params or {})))
        for k, v in self.routes.items():
            if path.startswith(k):
                return v(path, params or {}) if callable(v) else v
        return Res(404, {})


def ctx(realm="tenant", tenant="namwon", routes=None):
    p = SimpleNamespace(realm=realm, role="manager", tenant_id=tenant if realm == "tenant" else None)
    return SimpleNamespace(principal=p, http=Http(routes or {}), context={}, envs={}, now=lambda: "2026-09-30T00:00:00+09:00")


def run(c):
    return asyncio.run(c)


def stats_out():
    o = Out(source="s")
    o.env("suspects", "남원시 전체 의심 건수(규칙별 1행 · 전체)", ENV(21303, "count"))
    o.env("suspect_parcels", "남원시 전체 의심 필지 수(중복 제거)", ENV(20852))
    o.data = {"범위": "남원시 전체"}
    o.citations.append({"kind": "stats", "sgg_cd": "52190"})
    return o


def test_route_only_suspect_count():
    c = ctx()
    assert FU.ROUTE("의심 필지 몇 건?", c) == {"tool": "fusion_suspects", "args": {}}
    assert FU.ROUTE("의심 필지 수는?", c)["tool"] == "fusion_suspects"
    for q in ["운봉읍 보고서 초안", "건축법 조문", "광의면 의심 필지 보고서 초안 만들어 줘", "대장과 어긋난 필지 현장 조사 공문 초안 써 줘"]:
        assert FU.ROUTE(q, c) is None, q
    assert FU.ROUTE("여수시 의심 필지 읍면동별 차트", c)["tool"] == "fusion_chart"      # 차트는 차트 도구(이름을 섞지 않게)
    assert FU.ROUTE("의심 필지 몇 건?", SimpleNamespace(principal=SimpleNamespace(realm=None))) is None


def test_fusion_suspects_one_source_and_mismatch(monkeypatch):
    from agent.tools import survey as SV

    async def fake_stats(args, c):
        return stats_out()
    monkeypatch.setattr(SV, "survey_stats", fake_stats)
    items = [{"pnu": "5219010100100010000", "rule": "L1"}, {"pnu": "5219010100100010000", "rule": "L2"}, {"pnu": "5219010100100020000", "rule": "L2"}]
    c = ctx(routes={"/t/namwon/survey/registry": Res(200, {"items": [IMP]}),
                    "/survey/findings": Res(200, {"items": items, "total": ENV(3, "count"), "by_rule": {"L1": ENV(1, "count"), "L2": ENV(2, "count")}})})
    o = run(FU.fusion_suspects({}, c))
    env = {k: e for k, _, e in o.envelopes}
    assert env["suspect"]["value"] == 20852                      # survey_stats 봉투 그대로(한 출처)
    assert env["mismatch"]["value"] == 2                          # 필지 중복 제거(L1 · L2 겹침 1)
    assert "{{suspect}}" in o.answer and "{{mismatch}}" in o.answer and "어긋난" in o.answer
    assert not any(ch.isdigit() for ch in o.answer)               # 답 문장에 숫자 직접 0
    mo = [a for a in o.ui_actions if a["op"] == "map_on"][0]
    assert mo["filter"] == {"rule": "L1,L2", "ledger": "imp_1"}
    fp = [p for path, p in c.http.calls if path == "/survey/findings"][-1]
    assert fp["ledger"] == "imp_1" and fp["rule"] == "L1,L2"


def test_fusion_suspects_without_ledger_paints_region(monkeypatch):
    from agent.tools import survey as SV

    async def fake_stats(args, c):
        return stats_out()
    monkeypatch.setattr(SV, "survey_stats", fake_stats)
    c = ctx(routes={"/t/namwon/survey/registry": Res(200, {"items": []})})
    o = run(FU.fusion_suspects({}, c))
    assert [k for k, _, _ in o.envelopes] == ["suspect"]
    assert "어긋난" not in o.answer
    assert o.ui_actions[0]["op"] == "map_on" and o.ui_actions[0]["filter"] == {"sgg_cd": "52190"}


def test_fusion_suspects_cross_tenant_blocked(monkeypatch):
    from agent.tools import survey as SV

    async def fake_stats(args, c):
        return stats_out()
    monkeypatch.setattr(SV, "survey_stats", fake_stats)
    c = ctx(routes={"/t/namwon/survey/registry": Res(403, {})})      # 다른 기관 대장 → 403 은 삼키지 않는다
    with pytest.raises(ToolError) as e:
        run(FU.fusion_suspects({"tenant_id": "gwangju-jeonnam"}, c))
    assert e.value.code == "tool_forbidden"


def test_ledger_findings_emd_chart_block():
    stats = {"items": [{"key": "운봉읍", "ledger_findings": {"L1": ENV(120)}}, {"key": "동면", "ledger_findings": {"L1": ENV(80)}},
                       {"key": "산내면", "ledger_findings": {"L1": ENV(0)}}]}
    c = ctx(routes={"/survey/stats": Res(200, stats)})
    o = Out()
    rows = run(LF.emd_rows(c, o, "imp_1", "L1", "대장 농지 위 건물", 20))
    assert [r["읍면동"] for r in rows] == ["운봉읍", "동면"]
    assert o.blocks and o.blocks[0]["kind"] == "bar" and o.blocks[0]["type"] == "chart"
    assert [r["env"] for r in o.blocks[0]["rows"]] == ["emd_1", "emd_2"]      # 값은 봉투 key 로만
    assert all("value" not in r for r in o.blocks[0]["rows"])
    one = Out()
    c2 = ctx(routes={"/survey/stats": Res(200, {"items": stats["items"][:1]})})
    run(LF.emd_rows(c2, one, "imp_1", "L1", "x", 8))
    assert not one.blocks                                                     # 한 곳이면 차트 없음


def test_fusion_suspects_falls_back_to_r1(monkeypatch):
    """대장 규칙 결과가 0인 대장(기관 임계 평가 전) — 첫 화면 큰 숫자와 같은 R1 로 센다."""
    from agent.tools import survey as SV

    async def fake_stats(args, c):
        return stats_out()
    monkeypatch.setattr(SV, "survey_stats", fake_stats)

    def fnd(path, params):
        if params.get("limit") == 1:
            return Res(200, {"items": [], "by_rule": {"L1": ENV(0, "count"), "L2": ENV(0, "count"), "R1": ENV(67, "count")}})
        return Res(200, {"items": [{"pnu": f"12130{i:014d}", "rule": "R1"} for i in range(67)], "total": ENV(67, "count")})
    c = ctx(tenant="gwangju-jeonnam", routes={"/t/gwangju-jeonnam/survey/registry": Res(200, {"items": [IMP]}), "/survey/findings": fnd})
    o = run(FU.fusion_suspects({}, c))
    env = {k: e for k, _, e in o.envelopes}
    assert env["mismatch"]["value"] == 67
    assert o.ui_actions[0]["filter"]["rule"] == "R1"


# ── 2차(실증 부족 해결) — 지역 고르기 · 차트 · 대장 규칙 문장 ─────────────────────────
def test_route_chart_ledger_and_language():
    c = ctx()
    r = FU.ROUTE("구례군 의심 필지 읍면동별 차트 보여 줘", c)
    assert r["tool"] == "fusion_chart" and r["args"]["kind"] == "suspect"
    r = FU.ROUTE("대장과 어긋난 필지 읍면동별 차트", c)
    assert r["tool"] == "fusion_chart" and r["args"]["kind"] == "mismatch"
    r = FU.ROUTE("대장상 농지인데 AI가 건물로 본 필지 몇 건", c)
    assert r == {"tool": "fusion_ledger", "args": {"rule_id": "L1"}}
    assert FU.ROUTE("대장상 농지인데 AI가 건물 500㎡ 넘는 필지", c) is None                # 임계를 바꾸는 말은 확인 카드 경로
    cl = ctx()
    cl.context = {"mode": "ledger"}
    assert FU.ROUTE("대장상 농지인데 AI가 건물로 본 필지", cl) is None                    # 첫 화면 결합표 필터(JSON 계획)는 모델 경로
    ce = ctx()
    ce.lang = "en"
    assert FU.ROUTE("의심 필지 몇 건?", ce) is None                                       # 영어는 모델 경로(같은 도구 · 영어 답)


GR = {**IMP, "import_id": "imp_gr", "sgg": [{"sgg_cd": "46730", "name": "구례군"}]}


def _stats_spy(calls, sgg="46730", scope="구례군 전체"):
    async def fake(args, c):
        calls.append(dict(args))
        o = Out(source="s")
        o.env("suspects", f"{scope} 의심 필지(건 · 규칙 R1–R6)", ENV(11081, "count"))
        o.data = {"범위": scope}
        o.citations.append({"kind": "stats", "sgg_cd": sgg})
        return o
    return fake


def test_suspects_follow_screen_ledger_not_page_region(monkeypatch):
    """[1] 시군구가 여럿인 기관 — 화면 지역(여수)보다 화면에 올린 대장(구례)의 시군구로 답한다."""
    from agent.tools import survey as SV
    calls = []
    monkeypatch.setattr(SV, "survey_stats", _stats_spy(calls))
    items = [{"pnu": "4673031021100010000", "rule": "L1", "addr": "전라남도 구례군 광의면 대산리 1"}]
    c = ctx(tenant="gwangju-jeonnam", routes={"/t/gwangju-jeonnam/survey/registry/imp_gr": Res(200, GR),
                                              "/survey/findings": Res(200, {"items": items, "total": ENV(1, "count"), "by_rule": {"L1": ENV(1, "count")}})})
    c.context = {"region": "12130", "ledger": "imp_gr"}
    c.state = {"msg": "의심 필지 몇 건?"}
    o = run(FU.fusion_suspects({}, c))
    assert calls[0]["region"] == "46730"
    env = {k: e for k, _, e in o.envelopes}
    assert env["suspect"]["value"] == 11081 and env["mismatch"]["value"] == 1
    assert "R1" not in dict((k, m) for k, m, _ in o.envelopes)["suspect"]              # 내부 규칙 코드 0
    assert o.answer.startswith("구례군 전체 의심 필지는")


def test_suspects_question_emd_wins(monkeypatch):
    from agent.tools import survey as SV
    calls = []
    monkeypatch.setattr(SV, "survey_stats", _stats_spy(calls))

    async def fake_emd(c, t):
        return {"emd": "광의면", "sgg_cd": "46730"} if "광의면" in t else None
    monkeypatch.setattr(FU, "emd_in_text", fake_emd)
    c = ctx(tenant="gwangju-jeonnam", routes={"/t/gwangju-jeonnam/survey/registry": Res(200, {"items": []})})
    c.context = {"region": "12130"}
    c.state = {"msg": "광의면 의심 필지 몇 건?"}
    run(FU.fusion_suspects({}, c))
    assert calls[0] == {"region": "46730", "emd": "광의면"}


def test_suspects_no_mismatch_across_regions(monkeypatch):
    """질문한 시군구와 대장의 시군구가 다르면 대조 숫자를 섞지 않는다."""
    from agent.tools import survey as SV
    monkeypatch.setattr(SV, "survey_stats", _stats_spy([], sgg="12130", scope="여수시 전체"))
    c = ctx(tenant="gwangju-jeonnam", routes={"/t/gwangju-jeonnam/survey/registry": Res(200, {"items": [GR]})})
    c.state = {"msg": "여수시 의심 필지 몇 건?"}
    o = run(FU.fusion_suspects({"region": "12130"}, c))
    assert [k for k, _, _ in o.envelopes] == ["suspect"] and "어긋난" not in o.answer


def test_chart_mismatch_names_and_ri_fallback(monkeypatch):
    """[3] '대장과 어긋난 필지 차트' — 합계·막대 모두 '올린 대장과 AI가 어긋난 필지'(의심 필지 수를 부르지 않음) · 한 면 대장은 리별."""
    items = [{"pnu": f"46730310{i:011d}", "rule": "L1", "addr": f"전라남도 구례군 광의면 {'대산리' if i < 3 else '지천리'} {i}"} for i in range(5)]
    items.append(dict(items[0], rule="L2"))
    c = ctx(tenant="gwangju-jeonnam", routes={"/t/gwangju-jeonnam/survey/registry/imp_gr": Res(200, GR),
                                              "/survey/findings": Res(200, {"items": items, "total": ENV(6, "count"),
                                                                            "by_rule": {"L1": ENV(5, "count"), "L2": ENV(1, "count")}})})
    c.context = {"ledger": "imp_gr"}
    o = run(FU.fusion_chart({"kind": "mismatch"}, c))
    env = {k: (m, e) for k, m, e in o.envelopes}
    assert env["mismatch"][1]["value"] == 5
    assert [b["title"] for b in o.blocks] == ["리별 올린 대장과 AI가 어긋난 필지"]
    assert [r["label"] for r in o.blocks[0]["rows"]] == ["대산리", "지천리"]
    assert [env[r["env"]][1]["value"] for r in o.blocks[0]["rows"]] == [3, 2]
    assert all("의심" not in m for m, _ in env.values())
    assert not any(ch.isdigit() for ch in o.answer)


def test_chart_suspect_passes_stats_block(monkeypatch):
    from agent.tools import survey as SV

    async def fake(args, c):
        assert args["by"] == "emd"
        o = Out(source="s")
        o.env("suspects", "구례군 전체 의심 필지(건 · 규칙 R1–R6)", ENV(11081, "count"))
        o.env("emd_1", "광의면 의심 필지(건)", ENV(961, "count"))
        o.env("emd_2", "마산면 의심 필지(건)", ENV(800, "count"))
        o.blocks.append({"type": "chart", "kind": "bar", "title": "구례군 읍면동별 의심 필지",
                         "rows": [{"label": "광의면", "env": "emd_1"}, {"label": "마산면", "env": "emd_2"}]})
        o.data = {"범위": "구례군 전체"}
        o.citations.append({"sgg_cd": "46730"})
        return o
    monkeypatch.setattr(SV, "survey_stats", fake)
    c = ctx(tenant="gwangju-jeonnam", routes={"/t/gwangju-jeonnam/survey/registry": Res(200, {"items": []})})
    o = run(FU.fusion_chart({"kind": "suspect", "region": "46730"}, c))
    assert o.blocks and o.blocks[0]["rows"][0]["env"] == "emd_1"
    assert "{{suspects}}" in o.answer and not any(ch.isdigit() for ch in o.answer)
    assert o.ui_actions[0]["filter"] == {"sgg_cd": "46730"}


def test_fusion_ledger_names_display_cap_apart(monkeypatch):
    """[4] 표시 상한(10)을 '의심 필지'로 부르지 않는다 — 조건 필지 수와 '그중 지도에 표시한 필지'로 나눈다."""
    items = [{"id": f"f{i}", "pnu": f"46730310{i:011d}", "rule": "L1", "addr": f"구례군 광의면 대산리 {i}", "lnglat": [127.4, 35.2],
              "evid_m2": ENV(100, "㎡"), "priority": "A", "jimok": "답"} for i in range(12)]
    c = ctx(tenant="gwangju-jeonnam", routes={"/t/gwangju-jeonnam/survey/registry/imp_gr": Res(200, GR),
                                              "/survey/findings": Res(200, {"items": items, "total": ENV(177, "count")}),
                                              "/survey/stats": Res(200, {"items": []})})
    c.context = {"ledger": "imp_gr"}

    async def no_geoms(c_, pnus):
        return {}
    from agent.tools import survey as SV
    monkeypatch.setattr(SV, "_geoms", no_geoms)
    monkeypatch.setattr(LF, "_rule_name", lambda rid: "대장 농지 위 건물")
    o = run(FU.fusion_ledger({"rule_id": "L1"}, c))
    env = {k: (m, e) for k, m, e in o.envelopes}
    assert env["total"][1]["value"] == 177 and env["total"][1]["unit"] == "필지"
    assert env["shown"][1]["value"] == 10 and "의심" not in env["shown"][0] and "표시 상한" in env["shown"][0]
    assert "{{total}}" in o.answer and "그중" in o.answer and "{{shown}}" in o.answer and "의심" not in o.answer


def test_group_by_place():
    lv, g = FU.group_by_place({"1": "전라남도 여수시 화양면 안포리 1", "2": "전라남도 여수시 돌산읍 우두리 2", "3": "전라남도 여수시 화양면 서촌리 3"})
    assert lv == "읍면동" and g == [("화양면", 2), ("돌산읍", 1)]


# ── 3차(강진군 병영면) — 어긋난 필지 이어 묻기 · 읍면 이름만으로 이동 · 숫자 가드 문장 ─────────────
GJ = {**IMP, "import_id": "imp_gj", "sgg": [{"sgg_cd": "46810", "name": "강진군"}]}


def _gj_ctx(msg):
    ris = ["삼인리"] * 4 + ["상낙리"] * 2 + ["삭양리"]
    items = [{"pnu": f"46810350{i:011d}", "rule": "R1", "addr": f"전라남도 강진군 병영면 {r} {i}"} for i, r in enumerate(ris)]
    items.append({"pnu": "4681035000000000099", "rule": "R4", "addr": "전라남도 강진군 병영면 삼인리 99"})   # 주차장(어긋난 필지 규칙 밖)
    c = ctx(tenant="gwangju-jeonnam", routes={"/t/gwangju-jeonnam/survey/registry/imp_gj": Res(200, GJ),
                                              "/survey/findings": lambda path, p: Res(200, {
                                                  "items": [x for x in items if x["rule"] in p.get("rule", "").split(",")],
                                                  "total": ENV(8, "count"), "by_rule": {"R1": ENV(7, "count")}})})
    c.context = {"ledger": "imp_gj", "region": "46810"}
    c.state = {"msg": msg}
    return c


def test_route_mismatch_followups_go_to_ledger_tool():
    c = ctx()
    assert FU.ROUTE("어긋난 필지가 제일 많은 리는?", c) == {"tool": "fusion_mismatch", "args": {"order": "most", "level": "리"}}
    assert FU.ROUTE("올린 대장에서 어긋난 필지가 가장 적은 읍면동은?", c)["args"] == {"order": "least", "level": "읍면동"}
    assert FU.ROUTE("삼인리에서 대장과 어긋난 필지 몇 필지?", c) == {"tool": "fusion_mismatch", "args": {}}
    assert FU.ROUTE("의심 필지가 제일 많은 읍면동은?", c) == {"tool": "fusion_chart", "args": {"kind": "suspect", "order": "most"}}
    assert FU.ROUTE("대장과 어긋난 필지 공문 초안", c) is None                              # 문서는 보고서 도구
    assert FU.ROUTE("의심 필지 몇 건?", c)["tool"] == "fusion_suspects"                    # 회귀 0


def test_mismatch_rank_answers_top_place_from_same_list():
    o = run(FU.fusion_mismatch({"order": "most", "level": "리"}, _gj_ctx("어긋난 필지가 제일 많은 리는?")))
    env = {k: (m, e) for k, m, e in o.envelopes}
    assert env["mismatch"][1]["value"] == 7                                               # 주차장(R4)은 세지 않음
    assert o.answer.startswith("올린 대장과 AI가 어긋난 필지가 가장 많은 리는 삼인리(")
    k = o.answer.split("삼인리({{")[1].split("}}")[0]
    assert env[k][1]["value"] == 4 and "의심" not in env[k][0]
    rows = o.blocks[0]["rows"]
    assert [r["label"] for r in rows] == ["삼인리", "상낙리", "삭양리"] and rows[0]["env"] == k   # 막대와 답이 같은 봉투
    assert o.ui_actions[0]["filter"]["place"] == "삼인리"
    import re as _re
    assert not any(ch.isdigit() for ch in _re.sub(r"\{\{\w+\}\}", "", o.answer))          # 숫자는 자리표로만


def test_mismatch_place_counts_only_mismatch_parcels():
    o = run(FU.fusion_mismatch({}, _gj_ctx("삼인리에서 대장과 어긋난 필지 몇 필지?")))
    env = {k: e for k, _, e in o.envelopes}
    assert env["place"]["value"] == 4                                                     # 대장 삼인리 전체(주차장 포함 5)가 아니라 어긋난 필지만
    assert o.answer.startswith("삼인리에서 올린 대장과 AI가 어긋난 필지는 {{place}}")
    bar = next(r for r in o.blocks[0]["rows"] if r["label"] == "삼인리")
    assert env[bar["env"]]["value"] == env["place"]["value"]                              # 같은 이름 = 같은 값
    assert o.ui_actions[0]["filter"] == {"rule": "R1", "ledger": "imp_gj", "place": "삼인리"}


def test_mismatch_without_ledger_says_so():
    c = ctx(tenant="gwangju-jeonnam", routes={"/t/gwangju-jeonnam/survey/registry": Res(200, {"items": []})})
    c.state = {"msg": "어긋난 필지 몇 필지?"}
    o = run(FU.fusion_mismatch({}, c))
    assert o.envelopes == [] and "올린 대장이 없어" in o.answer


def test_route_goto_emd_only(monkeypatch):
    async def fake_emd(c, t):
        return {"emd": "병영면", "sgg_cd": "46810"} if "병영면" in t else None
    monkeypatch.setattr(FU, "emd_in_text", fake_emd)
    c = ctx(tenant="gwangju-jeonnam")
    for q in ["병영면으로 지도 이동해 줘", "병영면 보여 줘", "강진군 병영면으로 가 줘"]:
        assert run(FU.ROUTE(q, c)) == {"tool": "fusion_goto", "args": {"emd": "병영면", "sgg_cd": "46810"}}, q
    assert FU.ROUTE("병영면 의심 필지 몇 건?", c)["tool"] == "fusion_suspects"            # 자료 질문은 이동이 아님
    assert FU.ROUTE("강진군으로 이동해 줘", c) is None                                     # 시군구 이동은 지도 도구 몫
    r = FU.ROUTE("도암면으로 이동", c)
    assert r is not None and run(r) is None                                               # 모르는 읍면동 → 다른 길


def test_goto_moves_to_emd_bbox(monkeypatch):
    from agent.tools.ext import map as MP
    monkeypatch.setattr(MP, "resolve_region", lambda a, c: {"sgg_cd": "46810", "name": "강진군", "full": "전라남도 강진군", "bbox": [126.6, 34.5, 126.9, 34.8]})

    async def fake_bbox(c, e, s):
        return [126.7, 34.6, 126.8, 34.7], "46810350"
    monkeypatch.setattr(FU, "_emd_bbox", fake_bbox)
    o = run(FU.fusion_goto({"emd": "병영면", "sgg_cd": "46810"}, ctx(tenant="gwangju-jeonnam")))
    a = o.ui_actions[0]
    assert a["op"] == "map_region" and a["bbox"] == [126.7, 34.6, 126.8, 34.7] and a["emd"] == "병영면"
    assert o.answer == "지도를 강진군 병영면으로 옮겼습니다."


def test_goto_keeps_scope_guard(monkeypatch):
    from agent.tools.ext import map as MP

    def deny(a, c):
        raise ToolError("out_of_scope", "이 기관의 데이터가 아닙니다", 403)
    monkeypatch.setattr(MP, "resolve_region", deny)
    with pytest.raises(ToolError):
        run(FU.fusion_goto({"emd": "운봉읍", "sgg_cd": "52190"}, ctx(tenant="gwangju-jeonnam")))


def test_chart_suspect_rank(monkeypatch):
    from agent.tools import survey as SV

    async def fake(args, c):
        o = Out(source="s")
        o.env("suspect_parcels", "강진군 전체 의심 필지", ENV(12625))
        o.env("emd_1", "도암면 의심 필지", ENV(1729))
        o.env("emd_2", "옴천면 의심 필지", ENV(459))
        o.blocks.append({"type": "chart", "kind": "bar", "title": "t", "rows": [{"label": "도암면", "env": "emd_1"}, {"label": "옴천면", "env": "emd_2"}]})
        o.data = {"범위": "강진군 전체"}
        o.citations.append({"kind": "stats", "sgg_cd": "46810"})
        return o
    monkeypatch.setattr(SV, "survey_stats", fake)
    c = ctx(tenant="gwangju-jeonnam", routes={"/t/gwangju-jeonnam/survey/registry": Res(200, {"items": []})})
    c.state = {"msg": "의심 필지가 가장 적은 읍면동은?"}
    o = run(FU.fusion_chart({"kind": "suspect", "order": "least"}, c))
    assert o.answer.startswith("강진군 전체 의심 필지가 가장 적은 읍면동은 옴천면({{emd_2}})")


def test_lint_keeps_digit_count_words():
    """숫자 가드가 '5자리'의 5를 지워 '확인되지 않음자리'로 깨지지 않는다."""
    from agent import lint
    r = lint.lint("정확한 시군구 명칭이나 5자리 코드를 확인해 주세요.", {})
    assert r.unverified == [] and "5자리" in r.answer_md
    r = lint.lint("병영면에는 5필지가 있습니다.", {})
    assert len(r.unverified) == 1                                                         # 데이터 숫자는 그대로 가드


def test_top_n_parcel_list_is_not_emd_rank_chart():
    """'의심 필지 상위 5곳' = 필지 목록(영상 설명 '1위 필지'가 이어 쓰는 목록) — 읍면동 순위 차트로 가로채지 않는다(C2 Ship 회귀)."""
    c = ctx()
    for q in ("남원시 의심 필지 상위 5곳 보여 줘", "구례군 의심 필지 상위 5곳 보여 줘", "의심 필지 하위 3곳"):
        r = FU.ROUTE(q, c)
        assert not (r and r["tool"] == "fusion_chart"), (q, r)
    assert FU.ROUTE("의심 필지가 가장 많은 읍면동은?", c)["tool"] == "fusion_chart"
