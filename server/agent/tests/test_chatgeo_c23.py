"""XI ChatGEO 10-23 고침 — 물은 범위대로(원칙 312): '남원시 비닐하우스 보여 줘' → 남원시만 · 이어 묻기('읍면동별로 통계 내 줘' · '보고서 초안')는 앞 답의 지역 · 업무."""
from __future__ import annotations

import asyncio
import json
from types import SimpleNamespace

from agent import runner
from agent.tools.ext import dash
from landxi_api import improve


class _R:
    def __init__(self, d):
        self.d = d

    async def get(self, k):
        return self.d.get(k)


def _ctx(context=None, base=None):
    c = runner.Ctx(run_id="run_test_c23", principal=SimpleNamespace(realm="lx", role="staff", tenant_id=None, user_id="u"), token=None,
                   context={"page": "xi-clean", "region": None, **(context or {})})
    if base is not None:
        c.context["prev_run"] = "run_prev"
        c.r = _R({"agent:runs:run_prev:refs": json.dumps(base, ensure_ascii=False)})
    return c


def test_rewrite_keeps_named_region(monkeypatch):
    # 바꿔 묻기 줄('비닐하우스만 보기' → '비닐하우스만 보여 줘')이 물은 지역을 버리지 않는다
    rows = [{"id": "ir_x", "mode": "intent", "src": "비닐하우스 보여 줘", "dst": "비닐하우스만 보여 줘", "rel_state": "approved"}]

    async def fresh(force=False):
        return rows
    monkeypatch.setattr(improve, "rules_fresh", fresh)
    assert asyncio.run(improve.rewrite("남원시 비닐하우스 보여 줘"))[0] == "남원시 비닐하우스 보여 줘"
    assert asyncio.run(improve.rewrite("비닐하우스 보여 줘"))[0] == "비닐하우스만 보여 줘"


def test_show_is_region_task():
    a = dash.parse_show("남원시 비닐하우스 보여 줘")
    assert a and a["region"] == "52190" and a["task"] == "비닐하우스" and a["kind"] == "task"
    for q in ["비닐하우스 보여 줘", "남원시 보여 줘", "남원시 비닐하우스만 보여 줘", "남원시 운봉읍 비닐하우스 보여 줘", "남원시 500㎡ 이상 비닐하우스 보여 줘",
              "남원시 비닐하우스 보고서 보여 줘"]:
        assert dash.parse_show(q) is None, q
    hit = dash.ROUTE("남원시 비닐하우스 보여 줘", _ctx())
    assert hit and hit["tool"] == "ximap_dash" and hit["args"]["region"] == "52190"


def test_follow_up_carries_region_and_task():
    base = {"level": "emd", "sgg": "52190", "src": "dash", "task": "비닐하우스", "items": [{"k": "52190250", "name": "운봉읍", "v": 1}]}
    a = dash.parse("읍면동별로 통계 내 줘", None)
    assert dash._carry_ok(a)
    asyncio.run(dash._carry(a, _ctx(base=base)))
    assert a["region"] == "52190" and a["task"] == "비닐하우스" and a["kind"] == "task"
    # 지도를 다른 시군구로 옮겼으면 이어받지 않는다
    b = dash.parse("읍면동별로 통계 내 줘", "52710")
    asyncio.run(dash._carry(b, _ctx({"region": "52710"}, base=base)))
    assert b["region"] == "52710" and not b["task"]
    # 질문에 지역 · 업무 · 전국이 있으면 이어받지 않는다
    for q in ["구례군 읍면동별로 통계 내 줘", "건물 읍면동별로 통계 내 줘", "전국 통계 내 줘"]:
        assert not dash._carry_ok(dash.parse(q, None) or {"request": q}), q


def test_class_change_years_is_timeseries_frame():
    # '남원시 밭 2021년에서 2025년 사이 변화' — 국토 변화 실행(대상지 필요)이 아니라 시점 비교 틀(지금 숫자 단추) · 국토 변화 말이 있으면 그대로
    from agent import frames
    c = _ctx()
    c.lang = "ko"
    xr = {"tool": "run_change_detection"}
    for q in ["남원시 밭 2021년에서 2025년 사이 변화", "남원시 나대지 2022년에서 2024년 사이 변화", "나주시 논 2021년에서 2025년 사이 변화"]:
        fr = frames.timeseries(c, q, xr)
        assert fr and fr["kind"] == "feature", q
    for q in ["인월면 새로 생긴 밭 2021년에서 2025년 사이 변화", "고속국도 구역선 2021년 2025년 사이 변화 탐지"]:
        assert frames.timeseries(c, q, xr) is None, q
