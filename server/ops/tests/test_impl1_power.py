"""impl-1 LX 관리자 — 고부하 판정은 실측(전력 · 사용률)으로만. 분석 작업이 GPU 를 쥐고 있기만 한 것은 고부하가 아니다.

근거: r3-ops 실증 3차 must_fix 2(16:06:41) — GPU 0 부하 0% · 20 W 인데 임대만 보고 고부하로 세어 '2 / 1 · 전력 예산 초과'(빨강).
실측(impl-1 판정 시험 · 분석 한 건 · 게이트웨이 대기열): 분석 중 GPU 0 은 사용률 5–38% 에서도 110–128 W — 판정 기준은 전력.
GPU 0 · DB 0 · 순수 함수만.
"""
import sys
from pathlib import Path

SERVER = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(SERVER))

from landxi_api.ops import UTIL_HOT_PCT, judge_power  # noqa: E402


def E(v, unit):
    return {"value": v, "unit": unit, "basis": "measured", "as_of": "2026-09-30T16:06:41+09:00", "source": "test"}


def gpu(i, w=None, util=None):
    g = {"index": i}
    if w is not None:
        g["power_w"] = E(w, "W")
    if util is not None:
        g["util_ma5"] = E(util, "%")
    return g


def test_prove3_sample_is_one_not_two():
    """16:06:41 표본 그대로 — GPU 0 임대 · 0% · 20 W, GPU 1 언어 모델 147 W(최근 평균 137 W). 예전 '2 / 1 초과' → 이제 '1 / 1 · 전력 예산 안'."""
    j = judge_power([gpu(0, 20.0, 0.0), gpu(1, 147.0, 25.0)], 100.0, 1, [0], {0: 20.0, 1: 137.0})
    assert j["hot"] == [1] and j["hot_now"] == 1 and j["ok"] is True
    per = {p["gpu"]: p for p in j["per"]}
    assert per[0]["hot"] is False and per[0]["why"] == "held"
    assert per[1]["hot"] is True and per[1]["why"] == "power" and per[1]["power_w"] == 137.0


def test_held_gpu_alone_is_zero():
    """분석 작업이 모델을 올리는 중(임대 · 21 W) — 예전 화면 '1 / 1 · GPU 0 고부하 · 작업 중'(impl-1 판정 시험 캡처) → 0."""
    j = judge_power([gpu(0, 21.0, 0.0), gpu(1, 28.0, 0.0)], 100.0, 1, [0], {0: 21.0, 1: 28.0})
    assert j["hot_now"] == 0 and j["ok"] is True and j["per"][0]["why"] == "held"


def test_running_analysis_counts_by_power_even_with_low_util():
    """분석이 실제로 도는 중 — 사용률 20% 여도 118 W 면 고부하(전력이 기준)."""
    j = judge_power([gpu(0, 118.0, 20.0), gpu(1, 28.0, 0.0)], 100.0, 1, [0], {0: 118.0, 1: 28.0})
    assert j["hot"] == [0] and j["per"][0]["why"] == "power"


def test_two_really_hot_is_exceeded():
    """두 장이 실제로 기준을 넘으면 초과(빨강) — 판정을 느슨하게 만든 것이 아니다."""
    j = judge_power([gpu(0, 126.0), gpu(1, 199.0)], 100.0, 1, [0], {0: 126.0, 1: 199.0})
    assert j["hot"] == [0, 1] and j["ok"] is False


def test_util_only_when_power_unknown():
    """전력 값이 없는 장(폴러가 전력을 못 읽음)만 사용률로 — 이동평균 ≥ 50% 면 고부하."""
    j = judge_power([gpu(0, util=UTIL_HOT_PCT + 10), gpu(1, util=5.0)], 100.0, 1, [])
    assert j["hot"] == [0] and j["per"][0]["why"] == "util" and j["per"][1]["why"] is None
    # 전력이 있으면 사용률은 보지 않는다(사용률 90% · 60 W = 고부하 아님)
    j = judge_power([gpu(0, 60.0, 90.0)], 100.0, 1, [])
    assert j["hot_now"] == 0


def test_no_measure_at_all_keeps_lease_conservative():
    """전력도 사용률도 모르는 장의 임대는 센다(측정값 0 — 보수적)."""
    j = judge_power([gpu(0)], 100.0, 1, [0])
    assert j["hot"] == [0] and j["per"][0]["why"] == "lease"
    j = judge_power([gpu(1, 20.0)], 100.0, 1, [0])             # 표본에 없는 GPU 0 의 임대
    assert j["hot"] == [0]


def test_infra_screen_reads_held_as_analysis_without_hot_note():
    js = (SERVER.parent / "landxi" / "v3" / "ops-infra" / "js" / "data.js").read_text(encoding="utf-8")
    assert "why === 'held'" in js                               # 작업 칸 = 'AI 분석'
    assert "p.why === 'util'" in js                             # 사용률로 셌으면 부하 % 표시
    hot = js[js.index("export function hotNote"):js.index("export function hotNote") + 900]
    assert "if (!p || !p.hot) return '';" in hot                # 고부하가 아니면(held) 고부하 표시 없음
