"""외부 검수 3차 보완 b(10-11 · GPT3-3 · GPT3-4 · 도형목록). 실서버 DB · GPU 0 · vLLM 0(직행만).

  GPT3-3 거르기 쌓기   새 조건은 지금 조건(context.filter) 위에 더해짐 · 같은 종류는 바꿔 끼움 · '조건 풀어 줘' 모두 · '면적 조건만 풀어 줘' 하나
                       · 답 첫 줄 = 대상(켜진 층 n개 · 이름) · 조건 전부 · 맞는 수 · 화면 동작에 칩(k · label)
  GPT3-4 집계 범위     두 레이어(남원 비닐하우스 · 여주 하거동 주차장)를 켠 채 읍면동 통계 = 보고서 = 켜진 층 전부(같은 수) · 첫 줄 '대상: 켜진 층 2개'
                       · 켜진 층에 없는 읍면동(가남읍)은 통계에도 없음(앞 통계와 모순 0)
  도형목록             GET /me/analyses/{작업}/rows(넓은 것부터 · 조건 그대로 · n = 거르기 수) · POST /me/analyses/filter(칩 풀기 수 = 거르기 수)
"""
import httpx
import psycopg
import pytest

from conftest import B, H
from landxi_api import config
from test_impl14_b import NAMWON_GH, _ctx, arun

PARK = "job_01M4JX13YPQ4M50XGZCTQPFYVN"      # 프로젝트 추론 · 여주시 하거동 주차장(LX 직원 test@lx.or.kr) — GPT 가 함께 켠 레이어
SETS = [f"results/lx/{NAMWON_GH}", f"results/lx/{PARK}"]


def pg():
    return psycopg.connect(config.PG_ADMIN_DSN, autocommit=True)


def _n(sql_tail: str, args=()) -> int:
    with pg() as c:
        return c.execute("SELECT count(*) FROM detections WHERE edit_state<>'deleted' AND " + sql_tail, args).fetchone()[0]


def _env(out, key):
    return next(e for k, _, e in out.envelopes if k == key)["value"]


@pytest.mark.parametrize("q,want", [
    ("면적 조건만 풀어 줘", {"clear": True, "clear_only": "area"}), ("운봉읍 조건 풀어 줘", {"clear": True, "clear_only": "emd"}),
    ("분류 조건만 풀어 줘", {"clear": True, "clear_only": "cls"}), ("조건 풀어 줘", {"clear": True}), ("조건 다 풀어 줘", {"clear": True})])
def test_parse_clear(q, want):
    from agent.tools.ext.mapsvc import parse_filter
    got = parse_filter(q)
    assert got == want, got


def test_stack_swap_drop():
    from agent.tools.ext import mapsvc as M
    base = {"page": "lx-map", "sets": [SETS[0]]}
    a1 = arun(M.map_filter({"area_min": 1000.0, "area_op_min": ">"}, _ctx(base, "면적 1,000㎡ 넘는 것만"))).ui_actions[0]
    prev = {k: a1[k] for k in ("area_min", "area_op_min")}
    o2 = arun(M.map_filter({"emd": "운봉읍"}, _ctx({**base, "filter": prev}, "운봉읍만")))
    a2 = o2.ui_actions[0]
    n2 = _n("job_id=%s AND area_m2 > 1000 AND emd = '운봉읍'", (NAMWON_GH,))
    assert a2["n"] == n2 and a2["area_min"] == 1000.0 and a2["emd"] == ["운봉읍"]                 # 쌓기(앞 조건 유지)
    assert [c["k"] for c in a2["chips"]] == ["area", "emd"]
    first = o2.answer.split("\n")[0]
    assert first.startswith("대상: 켜진 층 1개(") and "1,000㎡ 넘음 · 운봉읍" in first and "{{n}}" in first
    assert "앞 조건(1,000㎡ 넘음)에 운봉읍 조건을 더했습니다" in o2.answer
    prev2 = {k: a2[k] for k in ("area_min", "area_op_min", "emd")}
    o3 = arun(M.map_filter({"emd": "산내면"}, _ctx({**base, "filter": prev2}, "산내면만")))
    a3 = o3.ui_actions[0]
    assert a3["emd"] == ["산내면"] and a3["area_min"] == 1000.0 and "바꿔 끼웠습니다(읍면동 운봉읍 → 산내면)" in o3.answer   # 같은 종류는 바꿔 끼움
    o4 = arun(M.map_filter({"clear": True, "clear_only": "area"}, _ctx({**base, "filter": prev2}, "면적 조건만 풀어 줘")))
    a4 = o4.ui_actions[0]
    assert "area_min" not in a4 and a4["emd"] == ["운봉읍"] and a4["n"] == _n("job_id=%s AND emd='운봉읍'", (NAMWON_GH,))
    o5 = arun(M.map_filter({"clear": True}, _ctx({**base, "filter": prev2}, "조건 풀어 줘")))
    assert o5.ui_actions == [{"op": "map_filter", "clear": True}] and "조건: 없음" in o5.answer
    o6 = arun(M.map_filter({"clear": True, "clear_only": "cls"}, _ctx({**base, "filter": prev2}, "분류 조건만 풀어 줘")))
    assert not o6.ui_actions and "걸려 있지 않습니다" in o6.answer


def test_same_scope_stats_report_filter():
    from agent.tools.ext import mapsvc as M
    ctxv = {"page": "lx-map", "sets": SETS, "region": "41670"}
    want = _n("job_id = ANY(%s)", (SETS and [NAMWON_GH, PARK],))
    st = arun(M.map_stats({"request": "읍면동 통계 보여 줘"}, _ctx(ctxv, "읍면동 통계 보여 줘")))
    assert _env(st, "total") == want and st.answer.startswith("대상: 켜진 층 2개(") and "조건: 없음" in st.answer
    assert "층별:" in st.answer and any(b["type"] == "chart" for b in st.blocks)
    rp = arun(M.ai_report({"request": "보고서 초안 만들어 줘"}, _ctx(ctxv, "보고서 초안 만들어 줘")))
    assert _env(rp, "total") == want and rp.answer.startswith("대상: 켜진 층 2개(")       # 통계와 같은 범위 · 같은 수(원칙 3)
    names = st.data["읍면동"]
    assert "가남읍" not in names                                                                # 켜진 층에 없는 읍면동은 통계에도 없다
    f = arun(M.map_filter({"emd": "가남읍"}, _ctx(ctxv, "가남읍만")))
    assert not f.ui_actions and "가남읍 결과가 없습니다" in f.answer and f.answer.startswith("대상: 켜진 층 2개(")
    # 조건이 걸린 채 통계 · 보고서 — 같은 조건 · 같은 수
    cond = {"area_min": 1000.0, "area_op_min": ">"}
    n_c = _n("job_id = ANY(%s) AND area_m2 > 1000", ([NAMWON_GH, PARK],))
    st2 = arun(M.map_stats({"request": "읍면동 통계"}, _ctx({**ctxv, "filter": cond}, "읍면동 통계")))
    rp2 = arun(M.ai_report({"request": "보고서 초안 만들어 줘"}, _ctx({**ctxv, "filter": cond}, "보고서 초안 만들어 줘")))
    assert _env(st2, "total") == n_c == _env(rp2, "total") and "조건: 1,000㎡ 넘음" in st2.answer
    assert st2.answer.split(" · 조건")[0] == rp2.answer.split(" · 조건")[0]                     # 같은 대상(조건에 0건인 층도 대상 이름에 남는다)


def test_route_stats():
    from agent import runner
    hit = arun(runner.ext_route(_ctx({"page": "lx-map", "sets": SETS}, "읍면동 통계"), "읍면동 통계"))
    assert hit["tool"] == "map_stats"
    hit = arun(runner.ext_route(_ctx({"page": "lx-map", "sets": SETS}, "면적 조건만 풀어 줘"), "면적 조건만 풀어 줘"))
    assert hit["tool"] == "map_filter" and hit["args"].get("clear_only") == "area"


def test_rows_and_filter_endpoints(tok):
    t = tok["staff"]
    cond = '{"area_min":1000,"area_op_min":">"}'
    r = httpx.get(B + f"/me/analyses/{NAMWON_GH}/rows", params={"limit": 5, "cond": cond}, headers=H(t), timeout=60).json()
    n = _n("job_id=%s AND area_m2 > 1000", (NAMWON_GH,))
    assert r["n"] == n and len(r["items"]) == min(5, n) and r["label"] == "1,000㎡ 넘음"
    ar = [it["properties"]["area_m2"] for it in r["items"]]
    assert ar == sorted(ar, reverse=True) and all(len(it["center"]) == 2 and len(it["bbox"]) == 4 for it in r["items"])
    assert all("job" not in str(k) for it in r["items"] for k in it)
    f = httpx.post(B + "/me/analyses/filter", json={"jobs": [NAMWON_GH, PARK], "cond": {"emd": ["운봉읍"]}}, headers=H(t), timeout=60).json()
    assert f["n"] == _n("job_id = ANY(%s) AND emd='운봉읍'", ([NAMWON_GH, PARK],)) and f["chips"] == [{"k": "emd", "label": "운봉읍"}]
    no = httpx.get(B + "/me/analyses/job_00000000000000000000000000/rows", headers=H(t), timeout=30)
    assert no.status_code == 404
