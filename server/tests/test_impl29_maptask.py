"""구현 29 · XI ChatGEO 업무 거르기(map_task) — XI맵에서 '○○만 보여 줘'(업무 이름만) → 업무 거르기 · 조건이 붙으면 기존 거르기(map_filter)."""
from agent.tools.ext import mapsvc as M


def test_parse_task():
    assert M.parse_task("비닐하우스만 보여 줘")["task"] == "비닐하우스"
    assert M.parse_task("건축물만")["task"] == "건물"
    assert M.parse_task("경작지만 보여줘")["task"] == "경작지"
    assert M.parse_task("곤포사일리지만 보여 줘")["task"] == "곤포사일리지"
    assert M.parse_task("원래대로") == {"clear": True, "request": "원래대로"}
    for t in ["1,000㎡ 넘는 경작지만", "운봉읍 비닐하우스만 보여 줘", "비닐하우스 단동만", "면적 조건만 풀어 줘", "보고서 초안 만들어 줘", "비닐하우스 몇 동이야?"]:
        assert M.parse_task(t) is None, t


class _P:
    realm = "lx"


class _C:
    def __init__(self, page):
        self.principal = _P()
        self.context = {"page": page, "sets": []}
        self.lang = "ko"


def test_route_only_on_ximap():
    assert M.ROUTE("비닐하우스만 보여 줘", _C("xi-clean"))["tool"] == "map_task"
    assert M.ROUTE("비닐하우스만 보여 줘", _C("lx-map"))["tool"] == "map_filter"      # 지도 서비스는 그대로
    assert M.ROUTE("1,000㎡ 넘는 경작지만", _C("xi-clean"))["tool"] == "map_filter"   # 조건이 붙으면 기존 거르기
