"""숫자 검증기 12케이스(브리프 F2-E §4) — LLM 없이 결정적."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from agent.lint import lint, uncited_sentences  # noqa: E402

E = {
    "e1": {"value": 20872, "unit": "count", "basis": "inferred", "as_of": "2026-09-24", "source": "s"},
    "e2": {"value": 235, "unit": "필지", "basis": "inferred", "as_of": "2026-09-24", "source": "s"},
    "e3": {"value": 5, "unit": "필지", "basis": "measured", "as_of": "2026-09-24", "source": "s"},
    "e4": {"value": 2415.2, "unit": "m2", "basis": "inferred", "as_of": "2026-09-24", "source": "s"},
    "e5": {"value": 0.967, "unit": "ratio", "basis": "inferred", "as_of": "2026-09-24", "source": "s"},
    "e6": {"value": 20852, "unit": "필지", "basis": "inferred", "as_of": "2026-09-24", "source": "s"},
}


def test_placeholder_passes():
    r = lint("의심은 {{env:e1}}건입니다.", E)
    assert r.unverified == [] and r.answer_md == "의심은 {{env:e1}}입니다."


def test_match_promoted_thousands():
    r = lint("전체 20,872건입니다.", E)
    assert r.unverified == [] and "{{env:e1}}" in r.answer_md and r.promoted[0]["env"] == "e1"


def test_mismatch_unverified():
    r = lint("대략 30,000건입니다.", E)
    assert r.unverified_numbers == ["30,000"] and "{{unv:u1}}" in r.answer_md
    assert r.unverified[0]["nearest"] in ("e1", "e6")


def test_korean_man_unit_mismatch():
    r = lint("대략 3만 건 정도예요.", E)
    assert r.unverified_numbers == ["3만"]


def test_korean_man_unit_rounded_match():
    r = lint("약 2만 건입니다.", E)
    assert r.unverified == [] and r.promoted


def test_rounding_decimal_m2():
    r = lint("근거 면적 2,415㎡", E)
    assert r.unverified == [] and r.answer_md == "근거 면적 {{env:e4}}"


def test_percent_vs_ratio():
    r = lint("신뢰도 96.7%", E)
    assert r.unverified == []
    r2 = lint("신뢰도 99%", E)
    assert r2.unverified_numbers == ["99%"]


def test_whitelist_year_pnu_jibun():
    r = lint("2023 항공 영상, 아곡리 1053-12 (PNU 5219045021110530012), 2025-04 촬영", E)
    assert r.unverified == []


def test_whitelist_law_and_rule_code():
    r = lint("농지법 제34조 제1항, 규칙 R1 기준", E)
    assert r.unverified == []


def test_citations_ignored():
    r = lint("상위 필지입니다 [1][2] [3, 4].", E)
    assert r.unverified == []


def test_top_n_promoted():
    r = lint("상위 5필지를 표시했습니다.", E)
    assert r.unverified == [] and "{{env:e3}}" in r.answer_md


def test_unknown_placeholder_and_year_count_guard():
    r = lint("{{env:e99}} 과 2085건", E)
    assert len(r.unverified) == 2      # 없는 자리표 + 봉투에 없는 2085건(연도 모양이지만 건 단위)


def test_uncited_sentences():
    md = "아영면 의심은 {{env:e1}}입니다 [1]. 현장 확인이 필요합니다."
    assert uncited_sentences(md) == ["현장 확인이 필요합니다."]
