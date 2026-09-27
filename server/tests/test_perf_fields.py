"""v1.1-5·6·7·8 Hyper Performance 실측 필드 — chips_per_s 창 규칙 · util 5표본 이동평균 + power_w · 마지막 progress 1회 · job.done 두 줄.

순수 함수(workers/perf.py) 단위 + 실추론(GPU0 한 장 · 황등 378 shard ≈ 20 s) 1회."""
import pytest
import httpx

from _f2b import B, BASE, H, hwang, sse, submit, wait_job
from workers import perf


def test_chips_rate_window_rule():
    assert perf.chips_rate(5, 0.5, 5) == (None, "창 짧음")          # 창 0.5 s — 예전 n/0.5 = 10.0 인공값 금지
    assert perf.chips_rate(5, 0.9, 20) == (None, "창 짧음")         # 창 < 1 s
    assert perf.chips_rate(7, 3.0, 7) == (None, "창 짧음")          # 완료 < 8
    assert perf.chips_rate(0, 5.0, 30) == (None, "창 짧음")
    v, note = perf.chips_rate(24, 1.0, 8)
    assert v == 24.0 and note is None
    v, _ = perf.chips_rate(250, 25.0, 300)                          # 창은 10 s 로 자른다
    assert v == 25.0


def test_moving_avg_and_done_rates():
    assert perf.moving_avg([0, 100, 0, 100, 100, 0, 100]) == 60.0     # 마지막 5표본
    assert perf.moving_avg([]) is None
    assert perf.done_rates(378, 13.6, 19.6) == (27.8, 19.3)
    assert perf.done_rates(39, None, 5.0) == (None, 7.8)


@pytest.fixture(scope="module")
def run378(live, tok):
    jid = submit(tok["staff"], hwang(label="pytest perf 378"))
    evs = sse(BASE + f"/api/v1/events/jobs/{jid}?access_token={tok['staff']}", until=("snapshot.ready", "job.failed"), timeout=300)
    j = wait_job(tok["staff"], jid)
    return jid, evs, j


def test_progress_rules(run378):
    jid, evs, j = run378
    prog = [d for e, d, *_ in evs if e == "job.progress"]
    assert len(prog) >= 12, len(prog)
    for d in prog:
        cps = d["chips_per_s"]
        if d["shards_done"] < 8:
            assert cps["value"] is None and cps["note"] == "창 짧음"
        assert "gpu_s_so_far" in d and d["gpu_s_so_far"]["unit"] == "gpu_s"
    # 마지막 shard 뒤 progress 는 정확히 1회 · shards_done == shards_total
    finals = [d for d in prog if d["shards_done"] == d["shards_total"]]
    assert len(finals) == 1 and finals[0]["final"] is True
    assert prog[-1]["shards_done"] == prog[-1]["shards_total"] == 378


def test_gpu_util_moving_average_no_flicker(run378):
    """12표본 이상에서 이동평균 util 이 0↔100 으로 튀지 않는다(연속 표본 차 ≥ 100 = 0건) · power_w 실측 · shared 표기."""
    _, evs, _ = run378
    g0 = [next((g for g in d["gpu"] if g["index"] == 0), None) for e, d, *_ in evs if e == "job.progress"]
    g0 = [g for g in g0 if g and g["util_pct"] is not None]
    assert len(g0) >= 12
    us = [g["util_pct"] for g in g0]
    jumps = sum(1 for a, b in zip(us, us[1:]) if abs(a - b) >= 100)
    assert jumps == 0, us
    assert all(g["shared"] is True for g in g0)
    assert all(isinstance(g["power_w"], (int, float)) for g in g0)
    assert max(g["power_w"] for g in g0) > 60          # 추론 중 GPU0 전력(유휴 ≈ 18 W)
    gs = [g["gpu_s_so_far"] for g in g0]
    assert gs == sorted(gs) and gs[-1] > 0


def test_job_done_two_lines_equal_get(run378, tok):
    jid, evs, j = run378
    done = next(d for e, d, *_ in evs if e == "job.done")
    for k in ("chips_per_gpu_s", "chips_per_wall_s", "gpu_s", "elapsed_env"):
        assert {"value", "unit", "basis", "as_of", "source"} <= set(done[k]), k
        assert done[k]["basis"] == "measured"
    assert done["chips_per_gpu_s"]["value"] == round(378 / done["gpu_s"]["value"], 1)
    assert done["chips_per_wall_s"]["value"] == round(378 / done["elapsed_s"], 1)
    assert j["chips_per_gpu_s"]["value"] == done["chips_per_gpu_s"]["value"]
    assert j["chips_per_wall_s"]["value"] == done["chips_per_wall_s"]["value"]
    assert j["elapsed_s"]["value"] == done["elapsed_s"]
    assert j["counts"] == done["counts"]


def test_first_shard_single_le_5s(run378):
    _, evs, _ = run378
    t_first = next(t for e, d, eid, t in evs if e == "shard.done")
    assert t_first <= 5.0, t_first
