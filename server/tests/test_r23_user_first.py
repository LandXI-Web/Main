"""바퀴 23 결정11(10-28 now 22) — 학습 · Land-XI 밖 일로 한 장이 뜨거워도 사용자 분석이 먼저 · 빈 장비에서 돈다.

고장(v4 확인 10-28): GPU1 이 Land-XI 밖 학습으로 약 200 W → GPU0 워커가 '다른 장 고부하'로 사용자 분석 칸을 읽지 않음 →
감시가 배정 120초 뒤 '분석 장비가 작업을 받은 뒤 시작하지 못했습니다'로 죽임(그때 GPU0 15 W).
GPU 를 쓰지 않는다(전력 값은 가짜). Redis 는 시험 번호(conftest) · 스트림 · 키는 시험 이름.
"""
import asyncio
import json
import sys
import time

import pytest

from workers import bus, pair_guard
from workers.power_throttle import PowerThrottle, Window, pair_target


# ── 두 장 합 상한 안의 목표 전력 ─────────────────────────────
def test_pair_target_math():
    assert pair_target(145, None, 300) == 145                 # 다른 장 값을 모르면 그대로
    assert pair_target(145, 20, 300) == 145                   # 다른 장이 놀면 그대로(장당 목표가 이김)
    assert pair_target(145, 200, 300, 10, 60) == 90           # 다른 장 200 W(Land-XI 밖 학습) → 이 장 90 W · 합 290 W
    assert pair_target(145, 260, 300, 10, 60) == 60           # 아주 뜨거워도 최소 60 W(사용자 분석이 멈추지 않게)


IDLE_W, BUSY_W, TAU, DT = 30.0, 230.0, 2.0, 0.5


class FakeGpu:
    def __init__(self):
        self.t, self.w, self.busy_acc, self.next_s = 0.0, IDLE_W, 0.0, DT
        self.hist = []
        self.win = Window(0, self.read, clock=lambda: self.t)
        self.last = {"w": IDLE_W, "util": 0.0, "temp": 40}

    def read(self):
        return {0: self.last}

    def advance(self, dt, busy):
        while dt > 0:
            step = min(dt, self.next_s - self.t)
            self.t += step
            dt -= step
            self.busy_acc += step if busy else 0.0
            if self.t >= self.next_s - 1e-9:
                frac = self.busy_acc / DT
                tgt = IDLE_W + (BUSY_W - IDLE_W) * frac
                self.w += (tgt - self.w) * (DT / TAU)
                self.last = {"w": self.w, "util": 100.0 * frac, "temp": 40 + self.w * 0.2}
                self.hist.append((self.t, self.w))
                self.win.poll()
                self.busy_acc, self.next_s = 0.0, self.next_s + DT

    def avg30_max(self, t_from=0.0):
        m = 0.0
        for i, (t, _) in enumerate(self.hist):
            if t < t_from:
                continue
            xs = [h[1] for h in self.hist[:i + 1] if h[0] > t - 30]
            m = max(m, sum(xs) / len(xs))
        return m


def test_throttle_obeys_pair_cap():
    """다른 장 200 W → 이 장 목표 90 W: 30초 평균이 약 90 W 아래(+여유)로 · 장당 상한 160 W 는 당연히 아래 · 일은 계속한다."""
    g = FakeGpu()
    g.win.pair_cap = lambda tw: pair_target(tw, 200.0, 300.0, 10.0, 60.0)
    thr = PowerThrottle(g.win, limit_w=160, limit_util=70, target_w=145, target_util=62, clock=lambda: g.t,
                        sleep=lambda s: g.advance(s, False))
    while g.t < 600:
        g.advance(0.05, True)
        thr()
    m = g.avg30_max(t_from=60)
    assert thr.target_w() == 90
    assert m <= 90 + 6, m
    assert thr.stats["calls"] > 200


# ── 워커: 누가 사용자 분석 칸을 받나 ───────────────────────────
@pytest.fixture(scope="module")
def gw():
    argv = sys.argv
    sys.argv = ["gpu_worker.py", "--gpu", "0"]
    try:
        import importlib
        m = importlib.import_module("workers.gpu_worker")
    finally:
        sys.argv = argv
    return m


@pytest.fixture()
def lane(gw, monkeypatch):
    """시험 스트림 · 작업 해시(실스트림 shards:a6000 은 건드리지 않음)."""
    tag = f"pytest-r23-{time.time_ns()}"
    stream = f"shards:{tag}"
    monkeypatch.setattr(gw, "STREAM", stream)
    monkeypatch.setattr(gw, "WID", f"a6000-{tag}")
    monkeypatch.setattr(bus, "LLM_REQ", f"power:llm_request:{tag}")
    gw.state["llm_seen"] = 0.0
    gw.lease["last_work"] = 0.0
    r = bus.r()
    bus.ensure_group(stream, gw.GROUP)
    jobs = []

    def add(kind="index", options=None, age_s=0.0, **h):
        jid = f"job_{tag}_{len(jobs)}"
        jobs.append(jid)
        r.hset(f"job:{jid}", mapping={"state": "running", "kind": kind, "options": json.dumps(options or {}), "model_id": "change-ap25", **h})
        ms = int((time.time() - age_s) * 1000)
        r.xadd(stream, {"job_id": jid, "shard_id": "change", "attempt": 0}, id=f"{ms}-*")
        return jid
    yield add
    r.delete(stream)
    for j in jobs:
        r.delete(f"job:{j}")
    for k in r.scan_iter(match=f"*{tag}*"):
        r.delete(k)


def _heat(gw, own_w, other_w):
    g, o = gw.A.gpu, 1 - gw.A.gpu
    gw.smi["pfast"] = {g: own_w, o: other_w}
    gw.smi["pfast_at"] = time.time()
    gw.smi["pring"] = {g: [own_w] * 5, o: [other_w] * 5}


def test_primary_takes_user_job_while_other_card_hot(gw, lane, monkeypatch):
    """v4 고장 재현: GPU1 207 W(Land-XI 밖) · GPU0 15 W → 예전 게이트는 0(안 읽음) · 이제 첫 장이 바로 받는다."""
    monkeypatch.setattr(gw, "SECONDARY", False)
    monkeypatch.setattr(pair_guard, "two_on", lambda *a, **k: False)     # 안전 감시가 한 장으로 돌려 둔 때(그날 온도 85 ℃)
    _heat(gw, 15.0, 207.7)
    lane()
    gw.state["other_since"] = None
    assert gw.power_gate() == 0                     # 예전 길(전국 · 학습 칸)은 그대로 기다림
    assert gw.user_take("loop") is True             # 사용자 분석은 기다리지 않음


def test_primary_leaves_job_when_own_card_busy_outside(gw, lane, monkeypatch):
    """첫 장이 Land-XI 밖 일로 뜨거우면 두 번째 장에 양보(spill_s × 2 지나면 그래도 받음)."""
    monkeypatch.setattr(gw, "SECONDARY", False)
    _heat(gw, 190.0, 15.0)
    lane(age_s=1)
    assert gw.user_take("loop") is False
    bus.r().delete(gw.STREAM)
    bus.ensure_group(gw.STREAM, gw.GROUP)
    lane(age_s=gw.SPILL_S * 2 + 1)
    assert gw.user_take("loop") is True


def test_secondary_spills_after_wait(gw, lane, monkeypatch):
    monkeypatch.setattr(gw, "SECONDARY", True)
    _heat(gw, 18.0, 15.0)
    lane(age_s=1)
    assert gw.user_take("loop") is False             # 첫 장이 받을 시간(spill_s)
    bus.r().delete(gw.STREAM)
    bus.ensure_group(gw.STREAM, gw.GROUP)
    lane(age_s=gw.SPILL_S + 1)
    assert gw.user_take("loop") is True              # 첫 장이 못 받음 → 빈 두 번째 장이 받는다
    bus.r().set(bus.LLM_REQ, "agent:pytest", ex=5)
    assert gw.user_take("loop") is False             # XI ChatGEO 가 이 장을 쓰는 중이면 안 받음
    bus.r().delete(bus.LLM_REQ)
    gw.state["llm_seen"] = 0.0
    _heat(gw, 199.0, 15.0)
    assert gw.user_take("loop") is False             # 이 장이 밖의 일로 뜨거우면 안 받음
    _heat(gw, 18.0, 15.0)
    bus.r().set(f"spill:skip:{gw.WID}:change-ap25", "oom", ex=30)
    assert gw.user_take("loop") is False             # 이 장에 못 올린 모델은 한동안 안 받음


def test_not_user_jobs_untouched(gw, lane, monkeypatch):
    """학습 · 전국 칸은 예전 규칙 그대로(이 함수는 사용자 분석만)."""
    monkeypatch.setattr(gw, "SECONDARY", False)
    _heat(gw, 15.0, 15.0)
    lane(kind="train", age_s=30)
    assert gw.user_take("loop") is False
    bus.r().delete(gw.STREAM)
    bus.ensure_group(gw.STREAM, gw.GROUP)
    lane(options={"national": True}, age_s=30)
    assert gw.user_take("loop") is False


def test_training_card_serves_user_first(gw, lane, monkeypatch):
    """두 번째 장도 못 받으면(inline_s) 학습 중인 장이 학습을 잠깐 멈추고 먼저 돌린다."""
    monkeypatch.setattr(gw, "SECONDARY", False)
    lane(age_s=2)
    assert gw.user_take("train") is False
    bus.r().delete(gw.STREAM)
    bus.ensure_group(gw.STREAM, gw.GROUP)
    lane(age_s=gw.INLINE_S + 1)
    assert gw.user_take("train") is True


def test_avoid_after_redispatch(gw, lane, monkeypatch):
    """감시가 다른 장비로 다시 보낸 칸 — 원래 장은 avoid_max_s 동안 받지 않는다(그 뒤엔 받음 · 영영 멈추지 않게)."""
    monkeypatch.setattr(gw, "SECONDARY", False)
    _heat(gw, 15.0, 15.0)
    lane(age_s=1, chg_avoid=gw.WID)
    assert gw.user_take("loop") is False
    bus.r().delete(gw.STREAM)
    bus.ensure_group(gw.STREAM, gw.GROUP)
    lane(age_s=gw.AVOID_MAX_S + 1, chg_avoid=gw.WID)
    assert gw.user_take("loop") is True


# ── 감시: 배정 시각이 아니라 실제 시작 기준 ──────────────────────
class FakeR:
    def __init__(self, h=None):
        self.h, self.adds = (h or {}), []

    async def hget(self, k, f):
        return self.h.get(k, {}).get(f)

    async def hset(self, k, f=None, v=None, mapping=None):
        self.h.setdefault(k, {}).update(mapping or {f: v})

    async def xadd(self, s, fields):
        self.adds.append((s, fields))


class Row(dict):
    pass


def _row(created_ago):
    import datetime as dt
    return Row(created_at=dt.datetime.fromtimestamp(time.time() - created_ago, dt.timezone.utc), pool="a6000")


def test_watch_waits_in_queue_then_redispatches_then_times_out(monkeypatch):
    from landxi_api import change_jobs as CJ
    stops = []

    async def fake_stop(jid, state, reason, by):
        stops.append(reason)
    monkeypatch.setattr(CJ, "stop", fake_stop)
    now = time.time()
    # ① 배정 5분 뒤에도 아무 장비도 안 받음(대기열) — 예전에는 120초에 죽었다 → 이제 기다림
    fr = FakeR()
    asyncio.run(CJ._not_started(fr, "job_x", _row(300), {}, now))
    assert stops == [] and fr.adds == []
    # ② 20분 넘게 차례가 안 옴 → 시간초과(대기열 사유)
    asyncio.run(CJ._not_started(fr, "job_x", _row(CJ.RUN_MAX_S + 5), {}, now))
    assert "차례가 오지 않았습니다" in stops[-1]
    stops.clear()
    # ③ 장비가 받고 120초 넘게 시작 못 함 → 다른 장비로 한 번 다시(원래 장비 피함 · 시도 번호 +1)
    rec = {"entry": {"job_id": "job_y", "shard_id": "change", "bbox": "[0,0,0,0]", "attempt": 0}, "attempt": 0,
           "ts": now - CJ.FIRST_HB_MAX_S - 5, "worker": "a6000-0"}
    fr = FakeR({"inflight:a6000": {"job_y|change": json.dumps(rec)}})
    asyncio.run(CJ._not_started(fr, "job_y", _row(200), {}, now))
    assert stops == [] and len(fr.adds) == 1
    assert fr.adds[0][0] == "shards:a6000" and fr.adds[0][1]["attempt"] == "1"
    assert fr.h["job:job_y"]["chg_avoid"] == "a6000-0" and fr.h["job:job_y"]["chg_attempt"] == 1
    rec2 = json.loads(fr.h["inflight:a6000"]["job_y|change"])
    assert rec2["requeued"] and rec2["worker"] is None
    # ④ 다시 보낸 것도 받고 시작 못 함 → 시간초과
    rec2.update(worker="a6000-1", ts=now - CJ.FIRST_HB_MAX_S - 5)
    fr.h["inflight:a6000"]["job_y|change"] = json.dumps(rec2)
    asyncio.run(CJ._not_started(fr, "job_y", _row(400), fr.h["job:job_y"], now))
    assert "받은 뒤 시작하지 못했습니다" in stops[-1]


def test_control_stale_attempt_does_not_start():
    """다시 보낸 작업의 옛 시도는 시작하지 않는다(같은 작업 두 번 0)."""
    from change import worker_hooks as H
    jid = f"job_pytest_r23_{time.time_ns()}"
    r = bus.r()
    r.hset(f"job:{jid}", mapping={"state": "running", "chg_attempt": 1})
    try:
        with pytest.raises(H.JobStopped):
            H.Control(jid, "change", attempt=0)
        c = H.Control(jid, "change", attempt=1)
        assert r.hget(f"job:{jid}", "chg_stage") == "prepare"
        c.set(chg_stage="done")
    finally:
        r.delete(f"job:{jid}")
