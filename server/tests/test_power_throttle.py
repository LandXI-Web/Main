"""전력 쉼 제어기 모의 시험 — 가짜 NVML 읽기(가상 시계)로 30초 평균이 140 W · 70 % 를 넘지 않음을 증명.
GPU 는 바쁘면 30 + 200×바쁜몫 W 로 수렴(시정수 2 s), 사용률 = 바쁜 몫. 실제 장비 · 학습은 건드리지 않는다.
실행: python -m pytest server/tests/test_power_throttle.py -q   (또는 python server/tests/test_power_throttle.py)"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from workers.power_throttle import PowerThrottle, Window  # noqa: E402

IDLE_W, BUSY_W, TAU, DT = 30.0, 230.0, 2.0, 0.5


class FakeGpu:
    def __init__(self, ext_w=lambda t: 0.0, temp_fn=lambda w: 40 + w * 0.25):
        self.t, self.w, self.busy_acc, self.next_s = 0.0, IDLE_W, 0.0, DT
        self.ext, self.temp_fn = ext_w, temp_fn
        self.hist = []                          # (t, w, util)
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
                tgt = IDLE_W + (BUSY_W - IDLE_W) * frac + self.ext(self.t)
                self.w += (tgt - self.w) * (DT / TAU)
                self.last = {"w": self.w, "util": 100.0 * frac, "temp": self.temp_fn(self.w)}
                self.hist.append((self.t, self.w, 100.0 * frac))
                self.win.poll()
                self.busy_acc, self.next_s = 0.0, self.next_s + DT

    def avg30_max(self, t_from=0.0):
        """실제 30초 이동평균(기록 전체에서 다시 계산)의 최댓값."""
        mw = mu = 0.0
        for i, (t, _, _) in enumerate(self.hist):
            if t < t_from:
                continue
            xs = [h for h in self.hist[:i + 1] if h[0] > t - 30]
            mw = max(mw, sum(h[1] for h in xs) / len(xs))
            mu = max(mu, sum(h[2] for h in xs) / len(xs))
        return mw, mu


def run(gpu, seconds, step_s=0.05, events=None, **kw):
    logs = []
    thr = PowerThrottle(gpu.win, clock=lambda: gpu.t, sleep=lambda s: gpu.advance(s, False), log=lambda m: logs.append(m),
                        event=lambda n, d=None, **k: (events if events is not None else []).append((n, d)), **kw)
    while gpu.t < seconds:
        gpu.advance(step_s, True)       # 한 스텝 = 0.05 s 풀로드
        thr()                           # 스텝마다 훅
    return thr, logs


def test_holds_under_limit():
    g = FakeGpu()
    thr, _ = run(g, 900)
    mw, mu = g.avg30_max()
    print(f"max 30s avg: {mw:.1f} W {mu:.1f} %  duty {thr.duty:.2f}  rest {thr.stats['rest_s']:.0f}s pause {thr.stats['pause_s']:.0f}s")
    assert mw <= 140 and mu <= 70
    assert thr.stats["calls"] > 100


def test_holds_from_high_initial_duty():
    """처음 duty 가 높아도(예전 문제 재현: 풀로드에 가깝게 시작) 막는 쪽이 평균을 상한 아래로 눌러 둔다."""
    g = FakeGpu()
    thr, _ = run(g, 600, duty0=0.85)
    mw, mu = g.avg30_max()
    print(f"high-duty start: {mw:.1f} W {mu:.1f} %")
    assert mw <= 140 and mu <= 70


def test_hard_stop_on_external_load():
    """같은 장에 밖의 부하(+120 W · 60 s)가 있어 쉬어도 평균이 안 내려가면 20 s 뒤 하드 정지 → 부하가 끝나면 재개."""
    g = FakeGpu(ext_w=lambda t: 120.0 if 20 <= t < 80 else 0.0)
    ev = []
    thr, logs = run(g, 300, events=ev)
    assert thr.stats["hard_stops"] >= 1
    assert any(n == "train.hold" for n, _ in ev) and any(n == "train.resume" for n, _ in ev)
    assert any("하드 정지" in m for m in logs)
    # 부하가 끝난 뒤에는 상한 안
    mw, mu = g.avg30_max(t_from=140)
    assert mw <= 140 and mu <= 70
    assert thr.stats["calls"] > 50          # 재개 후 계속 일함


if __name__ == "__main__":
    test_holds_under_limit()
    test_holds_from_high_initial_duty()
    test_hard_stop_on_external_load()
    print("OK")
