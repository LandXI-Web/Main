"""구현 31 · XI맵 융합 대시보드 — ChatGEO 대시보드 도구(ximap_dash) · 집계 API(GET /ximap/agg).
① 말 → 뜻(지역 · 업무 · 종류) · 업무 거르기 말('○○만 보여 줘' · '원래대로')은 받지 않음(map_task 그대로)
② 집계 숫자 = 데이터베이스 직접 집계와 같음(업무별 · 읍면동별 · 지목별 · 의심 종류별 · 면적 구간별 · 날짜별)
③ 같은 질문 유형도 결과가 다르면 다른 가시화 · 색 척도는 값의 뜻 · 퍼짐에 따라(규칙표)
데이터는 지금 데이터베이스(읽기만 · 쓰기 0). 지역은 데이터에서 고른다(전국 분석이 끝난 시군구 · 실태조사가 있는 시군구)."""
import asyncio
import json

import pytest

from agent.tools.ext import dash as D
from agent.tools.ext import mapsvc as M
from landxi_api import xdash as XD
from landxi_api.deps import db


LOOP = asyncio.new_event_loop()          # 연결 풀이 한 루프에 묶이므로 이 파일은 루프 하나로


def run(co):
    return LOOP.run_until_complete(co)


async def _pick():
    """전국 분석이 끝난 칸과 실태조사 의심 필지가 함께 있는 시군구 하나(고정값 0)."""
    async with db(realm="lx") as c:
        return await c.fetchval(
            "SELECT f.sgg_cd FROM survey_findings f JOIN national_cells n ON n.sgg_cd=f.sgg_cd AND n.state='done' AND NOT n.test "
            "GROUP BY 1 ORDER BY count(*) DESC LIMIT 1")


@pytest.fixture(scope="module")
def sgg():
    v = run(_pick())
    if not v:
        pytest.skip("전국 분석 · 실태조사가 함께 있는 시군구가 없음")
    return v


class _P:
    realm = "lx"


class _C:
    def __init__(self, page="xi-clean", region=None):
        self.principal = _P()
        self.context = {"page": page, "sets": ["x"], "region": region}
        self.lang = "ko"
        self.state = {}


def test_parse_kinds():
    assert D.parse("남원시 현황 보여 줘")["kind"] == "overview"
    a = D.parse("남원시 비닐하우스 어디가 많아?")
    assert a["kind"] == "task" and a["task"] == "비닐하우스"
    assert D.parse("남원시 농지 이용 실태 어때?")["kind"] == "survey"
    assert D.parse("전국 분석 얼마나 진행됐어?")["kind"] == "time"
    assert D.parse("남원 비닐하우스 면적별 분포")["kind"] == "area"
    assert D.parse("남원시 지목별 공시지가 통계")["kind"] == "jimok"
    assert D.parse("남원시 함양군 비교해 줘")["kind"] == "compare"
    assert len(D.parse("남원시 함양군 비교해 줘")["region"].split(",")) == 2
    for t in ["비닐하우스만 보여 줘", "원래대로", "보고서 초안 만들어 줘", "남원시로 이동해 줘", "1,000㎡ 넘는 경작지만"]:
        assert D.parse(t) is None, t


def test_route_order():
    """XI맵: 통계 · 현황 = 대시보드(지도 서비스 통계 map_stats 보다 먼저) · 업무 거르기 말 = map_task 그대로 · 다른 화면 = 대시보드 아님."""
    assert M.ROUTE("남원시 통계 보여 줘", _C())["tool"] == "ximap_dash"
    assert M.ROUTE("비닐하우스만 보여 줘", _C())["tool"] == "map_task"
    assert M.ROUTE("원래대로", _C())["tool"] == "map_task"
    assert D.ROUTE("남원시 현황 보여 줘", _C(page="lx-map")) is None
    # 지역을 말하지 않으면 화면 지역
    assert D.parse("현황 보여 줘", "52190")["region"] == "52190"


def test_task_same_as_board_and_national(sgg):
    """업무별 = 서비스 결과 장부(GET /ximap/board) + 전국 분석 진행 장부 — XI맵 말풍선과 같은 셈."""
    t = run(XD.agg_task(sgg))

    async def direct():
        async with db(realm="lx") as c:
            from landxi_api.national import _settings
            y = int((await _settings(c))[0]["year"])
            rows = await c.fetch("SELECT asset, k, sum((v->>'n')::bigint) n FROM national_cells, jsonb_each(counts) e(k, v) "
                                 "WHERE year=$1 AND NOT test AND state='done' AND sgg_cd LIKE $2 GROUP BY 1, 2", y, XD._pre(sgg) + "%")
        return {(r["asset"], r["k"]): int(r["n"]) for r in rows}
    d = run(direct())
    for r in t["rows"]:
        if r["src"] == "national":
            asset = "farm" if "농지" in r["name"] else "river"
            assert r["n"] == d[(asset, r["k"])], r
    bd, _ = run(XD._board())
    br = XD._board_region(bd, sgg)
    svc = {x["name"]: x["n"]["value"] for x in (br or {}).get("items", []) if x["n"]["value"]}
    assert {r["name"]: r["n"] for r in t["rows"] if r["src"] == "service"} == svc


def test_emd_sums(sgg):
    """읍면동별 칸 합 = 시군구 업무별 합(전국 분석 · 서비스 결과 모두) · 의심 필지 칸 합 = 데이터베이스 직접 합."""
    e = run(XD.agg_emd(sgg))
    for c in e["cols"]:
        s = sum(r["vals"].get(c["name"], 0) for r in e["rows"])
        assert s == c["n"], (c, s)

    async def direct():
        async with db(realm="lx") as c:
            return await c.fetchval("SELECT count(*) FROM survey_findings WHERE sgg_cd = ANY($1::text[]) AND rule = ANY($2::text[])", XD._codes(sgg), list(XD.RULES))
    assert sum(r["suspects"] or 0 for r in e["rows"]) == run(direct())


def test_jimok_rule_area_time(sgg):
    async def direct():
        async with db(realm="lx") as c:
            par = {r["jimok"] or "—": int(r["n"]) for r in await c.fetch("SELECT jimok, count(*) n FROM survey_parcels WHERE sgg_cd = ANY($1::text[]) GROUP BY 1", XD._codes(sgg))}
            rule = {r["rule"]: int(r["n"]) for r in await c.fetch(
                "SELECT rule, count(*) n FROM survey_findings WHERE sgg_cd = ANY($1::text[]) AND rule = ANY($2::text[]) GROUP BY 1", XD._codes(sgg), list(XD.RULES))}
            done = await c.fetchval("SELECT count(*) FROM national_cells WHERE NOT test AND state='done' AND done_at IS NOT NULL AND year=(SELECT coalesce((value->>'year')::int, 2025) FROM lx_settings WHERE key='national.run' UNION ALL SELECT 2025 LIMIT 1)")
            return par, rule, done
    par, rule, done = run(direct())
    jm = run(XD.agg_jimok(sgg))
    assert {r["k"]: r["parcels"] for r in jm["rows"] if r["parcels"]} == par
    ru = run(XD.agg_rule(sgg))
    assert {c["k"]: c["n"] for c in ru["cols"] if c["n"]} == rule
    tm = run(XD.agg_time(None))
    assert tm["points"][-1]["cells_sum"] == done
    # 면적 구간 합 = 구간 칸 합
    ar = run(XD.agg_area(sgg, "건물"))
    assert ar["n"] == sum(b["n"] for b in ar["bins"])


def test_variety_and_scales(sgg):
    """질문마다 차트 종류가 다르고(8종 이상 함께 쓰임) · 색 척도가 값의 뜻에 따라 다르다(연속 · 단계 · 발산 · 색 여러 가지)."""
    qs = [f"{XD.region_name(sgg)} 현황 보여 줘", f"{XD.region_name(sgg)} 건물 어디가 많아?", f"{XD.region_name(sgg)} 농지 이용 실태 어때?",
          "전국 분석 얼마나 진행됐어?", "전국 시군구 비교", f"{XD.region_name(sgg)} 지목별 공시지가 통계", f"{XD.region_name(sgg)} 건물 면적별 분포"]
    specs = [run(D.build(D.parse(q))) for q in qs]
    types = {p["type"] for s in specs for p in s["panels"]}
    assert len(types | {"kpi"}) >= 8, types
    kinds = {s["map"]["scale"]["kind"] for s in specs if s.get("map")}
    hues = {s["map"]["scale"].get("hue") for s in specs if s.get("map") and s["map"]["scale"]["kind"] != "div"}
    assert "div" in kinds and len(hues) >= 2, (kinds, hues)
    assert len({tuple(p["type"] for p in s["panels"]) for s in specs}) == len(specs)      # 일곱 질문 = 일곱 모양
    for s in specs:
        txt = json.dumps(s, ensure_ascii=False)
        for bad in ("job_", "GPU", "남은 약", "results/", "national_cells", "survey_"):
            assert bad not in txt, (bad, s["title"])


def test_scale_rules():
    assert D.scale_for([1, 2, 3, 4, 5, 6, 100], "count")["kind"] == "step"           # 퍼짐이 크면 단계 색
    assert D.scale_for([10, 11, 12, 13], "density") == {"kind": "seq", "hue": "orange", "min": 10, "max": 13}
    assert D.scale_for([-20, 5, 30], "dev")["kind"] == "div"
    assert D.scale_for([1, 2], "ratio")["hue"] == "violet"
    assert D.scale_for([1, 2], "suspect")["hue"] == "red"


def test_density_scale_extreme():
    """10-15 밀도 색 기준: ㎢당은 5개 이상이면 늘 5단 분위 · 극단값 하나는 분위에서 빠지고 맨 위 단계(tail) — 나머지가 옅어지지 않음."""
    vals = [20, 35, 50, 60, 80, 90, 110, 130, 150, 170, 2765]
    s = D.scale_for(vals, "density")
    assert s["kind"] == "step" and s["hue"] == "orange" and s["tail"] == 2765 and s["max"] == 2765
    assert len(s["breaks"]) == 4 and s["breaks"][-1] < 200               # 단계 경계는 나머지 값 안에서
    s2 = D.scale_for([10, 12, 14, 16, 18, 20], "density")                 # 극단값 없음 = 꼬리표 없음
    assert s2["kind"] == "step" and "tail" not in s2
    assert D.scale_for(vals, "count")["kind"] == "step" and "tail" not in D.scale_for(vals, "count")   # 다른 척도 뜻 그대로


def test_tool_answer(sgg):
    out = run(D.ximap_dash(D.parse(f"{XD.region_name(sgg)} 현황 보여 줘"), _C()))
    assert out.ui_actions[0]["op"] == "ximap_dash" and out.ui_actions[0]["spec"]["kpis"]
    assert "{{n}}" in out.answer
    e = out.envelopes[0][2]
    assert e["value"] == out.ui_actions[0]["spec"]["main"]["value"]
