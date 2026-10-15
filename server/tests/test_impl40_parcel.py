"""구현 40 · XI맵 지적 · 필지 카드 · 끈 클래스 통계(10-15 원칙 266 · 265).
① 필지 번지 · 지목 글자 읽기(연속지적 정본 '768답' · 전국 '31-2 대' · V-World '1176-1대' · 산)
② 지목과 어긋남 규칙 = 기존 실태조사 규칙 파일 그대로(R1 · R3 · R4 · R5 · R6 — R2 · L* 는 뺌 · 숫자는 구조 값 params)
③ 끈 클래스 → 집계 줄만 빠짐(원본 캐시는 그대로 · 같은 함수 · 숫자 한 출처)
④ 대시보드 도구가 화면 문맥(cls_off)을 받아 큰 숫자에서 뺌."""
import asyncio

from agent.tools.ext import dash as D
from landxi_api import parcels as P
from landxi_api import xdash as XD

LOOP = asyncio.new_event_loop()


def run(co):
    return LOOP.run_until_complete(co)


def test_jibun_parts():
    assert (P._jibun_no("768답"), P._jimok_cd("768답")) == ("768", "답")
    assert (P._jibun_no("31-2 대"), P._jimok_cd("31-2 대")) == ("31-2", "대")
    assert (P._jibun_no("1176-1대"), P._jimok_cd("1176-1대")) == ("1176-1", "대")
    assert (P._jibun_no("산12-3임"), P._jimok_cd("산12-3임")) == ("산12-3", "임")
    assert P._jimok_name("대") == "대지" and P._jimok_name("하천") == "하천"
    assert P._place("경상남도 함양군 함양읍 운림리 31-2", "31-2대") == ("함양읍", "운림리")


def test_mismatch_rules_from_rule_files():
    rs = P.mismatch_rules()
    names = [r["name"] for r in rs]
    assert "농지 위 건물" in names and len(rs) == 5
    r1 = next(r for r in rs if r["name"] == "농지 위 건물")
    assert set(r1["jimok"]) == {"전", "답", "과"} and r1["cls"] == ["건물"] and r1["params"]["min_m2"] == 33.0
    assert all("min_m2" not in r for r in rs)               # 숫자는 params(구조 값) 안에만 — 봉투 검사


def test_without_filters_rows_not_cache():
    t = {"by": "task", "rows": [{"k": "건물", "n": 3}, {"k": "경작지", "n": 5}]}
    o = XD.without(t, ["건물"])
    assert [r["k"] for r in o["rows"]] == ["경작지"] and len(t["rows"]) == 2 and o["off"] == ["건물"]
    e = {"by": "emd", "cols": [{"name": "건물(하천 · 계곡)", "k": "건물"}, {"name": "경작지(농지 전수)", "k": "경작지"}],
         "rows": [{"cd": "1", "vals": {"건물(하천 · 계곡)": 2, "경작지(농지 전수)": 4}}]}
    o = XD.without(e, ["건물"])
    assert [c["k"] for c in o["cols"]] == ["경작지"] and o["rows"][0]["vals"] == {"경작지(농지 전수)": 4}
    assert XD.without(t, []) is t
    assert "건물" not in XD._nat_cls_sql(["건물"]) and "경작지" in XD._nat_cls_sql(["건물"])


def test_dash_off_from_context():
    class Ctx:
        context = {"cls_off": ["건물", 3, ""]}
    assert D.off_classes(Ctx()) == ["건물"]
    full = run(D.build({"kind": "overview"}))
    off = run(D.build({"kind": "overview"}, ["건물"]))
    t_full = run(XD.agg_task(None))
    gone = sum(r["n"] for r in t_full["rows"] if r["k"] == "건물")
    assert full["main"]["value"] - off["main"]["value"] == gone
