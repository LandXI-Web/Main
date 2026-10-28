"""구현 41 · 학습 장비 두 장 사용(시험 · 원칙 270 · 10-17) + 영상 받기 속도.

GPU 를 쓰지 않는다(전력 · 온도 값은 가짜로 넣는다). Redis 키는 시험 이름(pytest)으로 따로 쓰고 실키(power:single 등)는 건드리지 않는다.
"""
import json
import sys
import time

import pytest

from workers import bus, pair_guard


@pytest.fixture(scope="module")
def gw():
    argv = sys.argv
    sys.argv = ["gpu_worker.py", "--gpu", "0"]
    try:
        import importlib
        m = importlib.import_module("workers.gpu_worker")
    finally:
        sys.argv = argv
    m.WID = m.WHO = "a6000-pytest41"
    return m


@pytest.fixture()
def keys(monkeypatch):
    """pair_guard 키를 시험 이름으로 — 실서버의 두 장 모드 상태와 섞이지 않게."""
    tag = f"pytest41:{time.time_ns()}"
    monkeypatch.setattr(pair_guard, "SINGLE", f"power:single:{tag}")
    monkeypatch.setattr(pair_guard, "PAIR", f"power:pair:{tag}")
    monkeypatch.setattr(pair_guard, "TRIPS", f"power:pair:trips:{tag}")
    monkeypatch.setattr(bus, "LLM_REQ", f"power:llm_request:{tag}")
    pair_guard._cache.update(at=0.0)
    yield tag
    r = bus.r()
    for k in list(r.scan_iter(match=f"*{tag}*")):
        r.delete(k)
    pair_guard._cache.update(at=0.0)


def test_config_limits_kept():
    """장당 상한 200 W · 장마다 30초 평균 70% · 160 W(10-25 사용자) · 안전 감시 300 W/10초 · 85℃ · 한 작업 한 장."""
    from landxi_api import config
    pw = config.load_yaml("pools")["power"]
    nat = pw["national"]
    assert pw["power_limit_w"] == 200
    assert nat["util_max"] <= 70 and nat["power_max_w"] <= 160 and nat["chunk"] <= 8
    assert int(pw.get("job_max_gpus", 1)) == 1                      # 학습 · 사용자 분석은 여전히 한 장
    c = pair_guard.cfg(pw)
    assert c["sum_max_w"] <= 300 and c["sum_over_s"] <= 10 and c["temp_max_c"] <= 85 and c["driver_err_s"] <= 5
    if pair_guard.configured(pw):
        assert pair_guard.nat_gpus(pw) == [0, 1] and int(pw["max_hot_gpus"]) == 2
        assert int(nat.get("secondary_mem_mib", 0)) <= 8192          # XI ChatGEO 장(약 10GB 남음)에 작은 상한


def test_trip_turns_single_and_status(keys, monkeypatch):
    r = bus.r()
    monkeypatch.setattr(pair_guard, "configured", lambda pw=None: True)
    assert pair_guard.two_on(r, max_age=0) is True
    row = pair_guard.trip(r, "sum_w", {"sum_w": 312.0, "over_s": 10.4}, "pytest")
    assert row["reason"] == "sum_w"
    assert pair_guard.two_on(r, max_age=0) is False                  # 한 장으로
    assert 0 < r.ttl(pair_guard.SINGLE) <= pair_guard.cfg()["single_cool_s"]
    assert pair_guard.trip(r, "temp", {"temp": 86}, "pytest")       # 이미 한 장 — 까닭은 첫 것 그대로
    assert json.loads(r.get(pair_guard.SINGLE))["reason"] == "sum_w"
    st = pair_guard.status(r)
    assert st["mode"] == "single" and st["reason"] == "sum_w"


def test_guard_judge_sum_over_10s(keys, monkeypatch, tmp_path):
    """합 전력 > 300 W 가 10초 넘게 이어지면 한 장으로 — 9초는 그대로(가짜 NVML · 시계)."""
    from workers import nvml_power
    r = bus.r()
    monkeypatch.setattr(pair_guard, "configured", lambda pw=None: True)
    monkeypatch.setattr(pair_guard, "GUARD", f"power:guard:{keys}")
    monkeypatch.setenv("LX_DATA_ROOT", str(tmp_path))
    seq = [{0: {"w": 160.0, "temp": 70, "util": 60, "err": 0}, 1: {"w": 150.0, "temp": 69, "util": 50, "err": 0}}] * 40
    it = iter(seq)
    monkeypatch.setattr(nvml_power, "read_all", lambda: next(it))
    clock = {"t": 1000.0}
    monkeypatch.setattr(pair_guard.time, "time", lambda: clock["t"])

    def fake_sleep(s):
        clock["t"] += 1.0
        if clock["t"] > 1000 + 12:
            raise SystemExit
    monkeypatch.setattr(pair_guard.time, "sleep", fake_sleep)
    seen = []
    with pytest.raises(SystemExit):
        pair_guard.guard_loop("pytest", log=lambda *a: seen.append(" ".join(map(str, a))))
    s = r.get(pair_guard.SINGLE)
    assert s and json.loads(s)["reason"] == "sum_w" and json.loads(s)["over_s"] >= 10
    assert any("한 장으로" in x for x in seen)
    assert list(tmp_path.glob("_logs/gpu-pair-*.csv"))                # 1초 기록


def test_temp_trips_immediately(keys, monkeypatch, tmp_path):
    from workers import nvml_power
    r = bus.r()
    monkeypatch.setattr(pair_guard, "configured", lambda pw=None: True)
    monkeypatch.setattr(pair_guard, "GUARD", f"power:guard:{keys}")
    monkeypatch.setenv("LX_DATA_ROOT", str(tmp_path))
    monkeypatch.setattr(nvml_power, "read_all", lambda: {0: {"w": 90.0, "temp": 86, "util": 30, "err": 0}, 1: {"w": 40.0, "temp": 60, "util": 0, "err": 0}})
    n = {"k": 0}

    def fake_sleep(s):
        n["k"] += 1
        if n["k"] > 2:
            raise SystemExit
    monkeypatch.setattr(pair_guard.time, "sleep", fake_sleep)
    with pytest.raises(SystemExit):
        pair_guard.guard_loop("pytest", log=lambda *a: None)
    assert json.loads(r.get(pair_guard.SINGLE))["reason"] == "temp"


def test_own_national_heat_not_counted_in_two_mode(gw, keys, monkeypatch):
    """두 장 모드: 다른 장의 열이 우리 전국 작업 몫이면 '다른 GPU 고부하'로 세지 않는다 · 아니면(vLLM 등) 예전처럼 센다."""
    r = bus.r()
    gw.smi["pfast"] = {0: 150.0, 1: 199.0}
    gw.smi["pfast_at"] = time.time()
    gw.smi["pring"] = {0: [150.0] * 5, 1: [199.0] * 5}
    monkeypatch.setattr(pair_guard, "two_on", lambda *a, **k: True)
    r.delete("power:nat_busy:1", "power:nat_last:1")
    try:
        assert gw.other_gpu_hot() == (1, 199.0)                    # 우리 몫 아님(vLLM 등) — 센다
        pair_guard.mark_busy(r, 1, "job_pytest41")
        assert gw.other_gpu_hot() is None                          # 우리 전국 작업 몫 — 세지 않는다
        monkeypatch.setattr(pair_guard, "two_on", lambda *a, **k: False)
        assert gw.other_gpu_hot() == (1, 199.0)                    # 한 장 모드 — 예전 규칙 그대로
    finally:
        r.delete("power:nat_busy:1", "power:nat_last:1")


def test_llm_request_two_mode_waits_only_for_llm_card(keys, monkeypatch):
    """두 장 모드: XI ChatGEO 호출은 GPU0 의 전국 작업을 기다리지 않고, GPU1 에서 돌던 전국 칩 묶음이 비킬 때까지만(≤ 3초) 기다린다."""
    from workers import nvml_power
    r = bus.r()
    monkeypatch.setattr(pair_guard, "two_on", lambda *a, **k: True)
    monkeypatch.setattr(nvml_power, "read_avg", lambda: {0: 135.0, 1: 40.0})
    r.set("power:nat_last:0", f"{time.time():.3f}", ex=60)          # GPU0 열 = 전국 작업 몫
    r.set("power:nat_busy:1", "job_pytest41", px=600)              # GPU1 에서 칩 묶음 하나가 도는 중(0.6초 뒤 끝)
    try:
        out = bus.llm_power_request("pytest41-llm", wait_max_s=3)
        assert out["ok"] and out["other_w"] == {} and 0.4 <= out["waited_s"] < 2.0
        assert r.get(bus.LLM_REQ)                                    # 예고는 건다 — GPU1 워커가 칩 묶음 사이에서 비킨다
    finally:
        bus.llm_power_done("pytest41-llm")
        r.delete("power:nat_last:0", "power:nat_busy:1")


def test_secondary_yields_to_llm(gw, keys, monkeypatch):
    r = bus.r()
    gw.state["llm_seen"] = 0.0
    assert gw.llm_wanted() is False
    r.set(bus.LLM_REQ, "agent:pytest", ex=5)
    assert gw.llm_wanted() is True
    r.delete(bus.LLM_REQ)
    assert gw.llm_wanted() is True                                   # 끝난 뒤 LLM_QUIET_S 동안은 그대로 비킴
    gw.state["llm_seen"] = time.time() - gw.LLM_QUIET_S - 1
    assert gw.llm_wanted() is False


def test_scheduler_two_mode_inflight(monkeypatch):
    from workers import scheduler as sch
    monkeypatch.setattr(pair_guard, "two_on", lambda *a, **k: True)
    assert sch.nat_cap({"nat": "national"}) == sch.NAT_INFLIGHT_TWO >= 2 * sch.NAT_INFLIGHT
    assert sch.nat_cap({"nat": "overseas"}) == sch.NAT_INFLIGHT      # 해외는 그대로(첫 장)
    monkeypatch.setattr(pair_guard, "two_on", lambda *a, **k: False)
    assert sch.nat_cap({"nat": "national"}) == sch.NAT_INFLIGHT
    assert sch.is_national({"options": json.dumps({"national": {"asset": "farm"}})}) == "national"
    assert sch.is_national({"options": json.dumps({"overseas": {"c": "kgz"}})}) == "overseas"
    assert sch.is_national({"options": "{}"}) is False


def test_scheduler_job_scan_skips_finished():
    """끝난 작업 해시는 상태 두 칸만 읽고 넘긴다(주 고리가 멈추지 않게) — 지금 도는 작업만 남는다."""
    from workers import scheduler as sch
    r = bus.r()
    a, b = "job_PYTEST41A", "job_PYTEST41B"
    r.hset(f"job:{a}", mapping={"state": "done", "synced_state": "final"})
    r.hset(f"job:{b}", mapping={"state": "running"})
    try:
        t = time.time()
        ids = sch._job_ids(lambda st, ss: st == "running")
        assert b in ids and a not in ids and time.time() - t < 2.0
        ids2 = sch._job_ids(lambda st, ss: st is not None and ss != "final" and not (ss == st == "done"))
        assert b in ids2 and a not in ids2
    finally:
        r.delete(f"job:{a}", f"job:{b}")


def test_fetch_share_two_workers(monkeypatch):
    """관리자 상한 fetch_max 는 두 워커 합으로 — 워커마다 ceil(상한 / 지금 부르는 워커 수)."""
    from workers import imagery_src as im
    r = bus.r()

    class D:
        pass
    d = D()
    d.gov = im.FetchGovernor(8)
    d.gov.total["calls"] = 5
    other = "fetch:proc:pytest41"
    r.set(other, "1", ex=30)
    try:
        share = im.ApiDataset._share(d, 8)
        n = sum(1 for _ in r.scan_iter(match="fetch:proc:*", count=100))
        assert share == -(-8 // n) and share <= 8
        assert d.procs == n >= 2
    finally:
        r.delete(other, f"fetch:proc:{__import__('os').getpid()}")


def test_runner_pipeline_same_jobs_and_exclude():
    """흐름 방식은 조각(작업 범위 · 선택)을 예전과 똑같이 넣는다 — 칸을 합치지 않는다(칸 격자가 바뀌면 결과가 달라진다)."""
    import inspect
    from national import runner
    src = inspect.getsource(runner.CellRun.submit)
    assert '"max_km2": 150' in src and "PRIORITY" in src and "split_parts" in inspect.getsource(runner.CellRun.__init__)
    assert "exclude" in inspect.signature(runner.next_cell).parameters
    assert 1 <= runner.pipeline_depth() <= 4
