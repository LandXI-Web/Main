"""전력 게이트 v3(F2-B 1차 판정 불합격 2) — 다른 GPU 가 other_gpu_hot_w 이상이면 폴백 없이 멈춘다.

v2 는 30 s 대기 뒤 batch 4 로 진행(기아 방지)했고, 이미 읽어 간 16칸 묶음은 끝까지 돌렸다 → power-log 동시 >100 W 12표본.
v3: ① 대기 시간과 무관하게 0(진행 없음) ② 읽어 간 묶음도 gate_chunk 칸마다 멈춤 ③ NVML 0.1 s 순간값으로 빨리 안다.
GPU 를 쓰지 않는다(smi 링·NVML 값을 가짜로 넣는다)."""
import json
import sys
import threading
import time

import pytest

from workers import bus


@pytest.fixture(scope="module")
def gw():
    argv = sys.argv
    sys.argv = ["gpu_worker.py", "--gpu", "0"]
    try:
        import importlib
        m = importlib.import_module("workers.gpu_worker")
    finally:
        sys.argv = argv
    m.WID = m.WHO = "a6000-pytestgate"                       # 실워커(a6000-0) 하트비트와 겹치지 않게
    return m


@pytest.fixture(autouse=True)
def _own_llm_req_key(monkeypatch):
    """실서버의 LLM 호출 예고(power:llm_request · 백엔드 프로브·에이전트 실행이 건다)와 격리 — 시험 프로세스 안에서만 키 이름을 바꾼다.
    실키를 지우지 않는다(지우면 실워커가 LLM 과 동시에 GPU 를 올릴 수 있다 · 전력 규칙). 동시 LLM 활동이 있어도 결과가 같다."""
    key = f"power:llm_request:pytest:{time.time_ns()}"
    monkeypatch.setattr(bus, "LLM_REQ", key)
    yield
    bus.r().delete(key)


def _set(gw, other_w, fresh=True, ring=None):
    gw.smi["pfast"] = {0: 150.0, 1: other_w}
    gw.smi["pfast_at"] = time.time() if fresh else time.time() - 5
    gw.smi["pring"] = {0: [150.0] * 5, 1: list(ring if ring is not None else [18.0] * 5)}


def test_config_no_fallback(gw):
    assert gw.OTHER_HOT_W == 100
    assert not hasattr(gw, "OTHER_WAIT_MAX_S")          # 30 s 폴백 삭제
    assert gw.GATE_CHUNK >= 1


def test_hot_other_gpu_never_proceeds_even_after_long_wait(gw):
    _set(gw, 199.0)
    gw.state["other_since"] = time.time() - 600           # 10 분 기다렸어도
    gw.state["other_logged"] = 0.0
    assert gw.power_gate() == 0
    hb = bus.r().hgetall(f"worker:{gw.WID}:hb")
    assert "GPU1 199.0 W" in hb.get("power_gate", "")
    _set(gw, 18.0)
    assert gw.power_gate() == 0                             # 내려갔어도 조용 QUIET_S(20 s) 전에는 재개 안 함(히스테리시스)
    assert "식는 중" in gw.gate_block().__repr__() or gw.gate_block()[2] > 0
    gw.state["other_last_hot"] = time.time() - gw.QUIET_S - 1
    assert gw.power_gate() == gw.BATCH                      # 조용 확인 뒤 정상 묶음
    assert "power_gate" not in bus.r().hgetall(f"worker:{gw.WID}:hb")
    bus.r().delete(f"worker:{gw.WID}:hb")


def test_fast_nvml_value_triggers_before_smi_ring(gw):
    _set(gw, 171.0, ring=[18.0] * 5)                       # nvidia-smi 링은 아직 모름 · NVML 순간값만 앎
    assert gw.other_gpu_hot() == (1, 171.0)
    _set(gw, 171.0, fresh=False, ring=[18.0] * 5)          # NVML 값이 낡았으면(>0.5 s) 쓰지 않는다
    assert gw.other_gpu_hot() is None
    _set(gw, 18.0, ring=[18.0, 18.0, 18.0, 18.0, 140.0])   # smi 최신 표본만 높아도 멈춤
    assert gw.other_gpu_hot()[0] == 1
    _set(gw, 18.0, ring=[150.0, 150.0, 150.0, 150.0, 18.0]) # 꺼질 땐 보수적(이동평균 > 100 이면 아직 대기)
    assert gw.other_gpu_hot() is not None
    _set(gw, 18.0)
    assert gw.other_gpu_hot() is None


def test_hold_inside_read_batch_until_cool_and_touches_inflight(gw):
    pool, jid = "pytest-gate", "job_PYTEST_GATE"               # 실풀(a6000) inflight 는 스케줄러 고아 감시가 정리하므로 따로
    real_pool, gw.POOL = gw.POOL, pool
    r = bus.r()
    r.hdel(f"inflight:{pool}", f"{jid}|s1")
    bus.inflight_start(pool, jid, "s1", {"attempt": 0}, gw.WID)
    old_ts = json.loads(r.hget(f"inflight:{pool}", f"{jid}|s1"))["ts"]
    _set(gw, 199.0)
    gw.state["other_since"] = None
    q = gw.QUIET_S
    gw.QUIET_S = 0.3                                         # 테스트에선 조용 확인 0.3 s

    def cool():
        for _ in range(6):                                   # NVML 폴링처럼 0.1 s 마다 신선한 199 W
            _set(gw, 199.0)
            time.sleep(0.1)
        _set(gw, 18.0)

    threading.Thread(target=cool, daemon=True).start()
    t0 = time.time()
    held = gw.hold_while_other_hot(jid, ["s1"])
    gw.QUIET_S = q
    assert 0.8 <= held <= 2.5 and time.time() - t0 >= 0.8      # 0.6 s 고부하 + 0.3 s 조용 확인
    assert json.loads(r.hget(f"inflight:{pool}", f"{jid}|s1"))["ts"] > old_ts      # 고아 감시가 재배정하지 않게
    assert gw.state["other_since"] is None and gw.state["gate_total_s"] >= 0.5
    gw.state["other_last_hot"] = 0
    assert gw.hold_while_other_hot(jid, ["s1"]) == 0.0                           # 식어 있고 조용하면 즉시
    r.delete(f"inflight:{pool}", f"worker:{gw.WID}:hb")
    gw.POOL = real_pool


def test_llm_cooperative_request_blocks_worker_and_waits_for_gpu0(gw, monkeypatch):
    """협조 임대 power:llm_request — LLM 호출 전에 걸면 워커가 GPU1 이 오르기 전에 멈추고, 호출자는 GPU0 평균 전력 < 100 W 를 기다린다."""
    from workers import nvml_power
    _set(gw, 18.0)
    gw.state["other_last_hot"] = 0
    assert gw.gate_block() is None
    seq = iter([{0: 150.0, 1: 20.0}, {0: 120.0, 1: 20.0}, {0: 95.0, 1: 20.0}])
    monkeypatch.setattr(nvml_power, "read_avg", lambda: next(seq, {0: 90.0, 1: 20.0}))
    out = bus.llm_power_request("pytest-llm", wait_max_s=3)
    assert out["ok"] and out["other_w"] == {0: 95.0} and 0.15 <= out["waited_s"] < 1.5
    blk = gw.gate_block()
    assert blk and blk[0] == 1                                  # 워커 쪽: GPU1 차례로 보고 멈춤
    assert gw.power_gate() == 0
    bus.llm_power_done("pytest-llm")
    assert bus.r().get(bus.LLM_REQ) is None
    assert gw.gate_block() is not None                          # 끝난 뒤에도 조용 확인(히스테리시스) 동안 대기
    gw.state["other_last_hot"] = 0
    assert gw.gate_block() is None
    bus.r().delete(f"worker:{gw.WID}:hb")
