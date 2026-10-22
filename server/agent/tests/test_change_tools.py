"""국토 변화 탐지 도구(10-22 CHANGE-DEMO-ORDER P0-4) — 직행 규칙 · 권한 · 등록."""
from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from agent.tools.ext import change as CH  # noqa: E402


def ctx(realm="lx", role="staff", change=None, prev=None):
    c = {}
    if change:
        c["change"] = change
    if prev:
        c["prev_run"] = prev
    return SimpleNamespace(lang="ko", principal=SimpleNamespace(realm=realm, role=role), context=c, state={}, r=None)


def test_run_route_years():
    h = CH.ROUTE("2019년과 2024년 항공영상 비교해서 구역선 안에 새로 생긴 것 찾아줘", ctx())
    assert h == {"tool": "run_change_detection", "args": {"year_a": 2019, "year_b": 2024}}


def test_plain_compare_not_taken():
    assert CH.ROUTE("2020년과 2024년 영상 나란히 비교해 줘", ctx()) is None      # 영상 나란히 = 기존 영상 비교(map_compare)


def test_rail_route():
    assert CH.ROUTE("철도용지도 같은 방식으로", ctx())["args"] == {"range_query": "철도"}


def test_describe_needs_selection():
    assert CH.ROUTE("이거 뭐야?", ctx()) is None
    assert CH.ROUTE("이거 뭐야?", ctx(change={"job_id": "job_X", "sel": "c0003"}))["tool"] == "describe_change"


def test_table_route_filters():
    h = CH.ROUTE("지목이 도로인데 건물 생긴 필지만 소유구분이랑 같이 표로", ctx(change={"job_id": "job_X"}))
    assert h["tool"] == "intersect_parcels"
    assert h["args"]["jimok"] == ["도"] and h["args"]["types"] == ["신축"]


def test_tenant_cannot_run():
    assert not CH.allowed("run_change_detection", SimpleNamespace(realm="tenant", role="manager"))
    assert CH.allowed("intersect_parcels", SimpleNamespace(realm="tenant", role="manager"))
    assert CH.ROUTE("2019년과 2024년 비교해서 새로 생긴 것 찾아줘", ctx(realm="tenant")) is None


def test_registered():
    from agent import runner  # noqa: F401 — 확장 도구를 레지스트리에 합친다
    from agent.tools import registry
    for n in ("run_change_detection", "intersect_parcels", "describe_change"):
        assert n in registry.SPECS
