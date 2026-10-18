"""장당 전력 · 사용률 30초 평균 상한 강제 — 학습(kind train) · 전국 작업 등 모든 GPU 작업 종류 공용.

사용자 규칙(10-17): 장당 30초 평균 사용률 ≤ 70 % · 전력 ≤ 140 W · 하드 상한 200 W(nvidia-smi). 이상이면 한 장으로.

예전 방식(배치 뒤 duty 쉼만)의 문제 — 10초에 한 번만 고치고 30초 평균이 늦게 따라와서, duty 가 오르내리며 상한을 넘었다
(10-18 해외 재학습: 30초 평균 140 W 초과 약 2분 · 최대 173 W · 79 ℃ · 사용률 72–94 %).

이 모듈:
  1. Window  — NVML 에서 실제 30초 이동평균(전력 · 사용률 · 온도)을 잰다(0.5 s 표본, 시간 기준 창).
  2. PowerThrottle.__call__ — 훅이 불릴 때마다
       a) 30초 평균이 목표(기본 125 W · 62 %)를 넘으면 목표 − 여유 아래로 내려갈 때까지 쉰다(막는 쪽이 이긴다),
       b) 안 넘어도 duty(일하는 몫)로 쉼을 깐다 — 10초 · 30초 평균 중 큰 쪽 기준 비례 제어(과하면 크게 줄이고 넉넉하면 천천히 늘림),
       c) 하드 정지: 30초 평균이 상한(140 W · 70 %)을 20초 넘게 넘은 채로 있거나 온도가 temp_max 이상이면
          평균이 (목표 − 여유)로 식을 때까지 작업을 멈추고 로그 · 이벤트를 남긴다.
  3. 창을 못 읽으면(표본 없음 · 오래됨) 보수적으로 duty ≤ blind_duty 로만 일한다.
"""
from __future__ import annotations

import threading
import time
from collections import deque


class Window:
    """장 하나의 NVML 표본 창. reader() -> {index: {"w", "util", "temp"}} (nvml_power.read_all 모양)."""

    def __init__(self, gpu: int, reader, span: float = 30.0, clock=time.time):
        self.gpu, self.reader, self.span, self.clock = gpu, reader, span, clock
        self.s: deque = deque()          # (t, w, util, temp)
        self.lock = threading.Lock()
        self._th = None

    def poll(self):
        v = (self.reader() or {}).get(self.gpu) or {}
        w = v.get("w")
        if w is None:
            return False
        t = self.clock()
        with self.lock:
            self.s.append((t, float(w), float(v.get("util") or 0.0), float(v.get("temp") or 0.0)))
            while self.s and self.s[0][0] < t - self.span - 1:
                self.s.popleft()
        return True

    def avg(self, span: float | None = None):
        """→ (w평균, 사용률평균, 최고온도, 표본수, 마지막 표본 나이 s) — 표본이 없으면 n = 0."""
        now = self.clock()
        lo = now - (span or self.span)
        with self.lock:
            xs = [x for x in self.s if x[0] >= lo]
            last = self.s[-1][0] if self.s else None
        if not xs:
            return 0.0, 0.0, 0.0, 0, (now - last) if last else 1e9
        n = len(xs)
        return (sum(x[1] for x in xs) / n, sum(x[2] for x in xs) / n, max(x[3] for x in xs), n, now - xs[-1][0])

    def start(self, period: float = 0.5):
        if self._th:
            return self

        def loop():
            while True:
                try:
                    self.poll()
                except Exception:  # noqa: BLE001
                    pass
                time.sleep(period)
        self._th = threading.Thread(target=loop, daemon=True, name=f"pwin{self.gpu}")
        self._th.start()
        return self


_wins: dict = {}


def nvml_window(gpu: int) -> Window:
    """실제 NVML 창(장 번호당 하나 · 0.5 s 폴링 스레드)."""
    if gpu not in _wins:
        from workers import nvml_power
        _wins[gpu] = Window(gpu, nvml_power.read_all).start()
    return _wins[gpu]


class PowerThrottle:
    def __init__(self, window: Window, *, limit_w=140.0, limit_util=70.0, target_w=125.0, target_util=62.0,
                 margin_w=8.0, margin_util=6.0, hard_s=20.0, temp_max=83.0, duty0=0.35, duty_min=0.05, duty_max=0.85,
                 blind_duty=0.3, adj_every=3.0, clock=time.time, sleep=time.sleep, log=None, event=None, poll_s=0.25):
        self.win, self.clock, self.sleep, self.log, self.event = window, clock, sleep, log or (lambda *a: None), event or (lambda *a, **k: None)
        self.limit_w, self.limit_u, self.tw, self.tu = limit_w, limit_util, target_w, target_util
        self.mw, self.mu, self.hard_s, self.temp_max = margin_w, margin_util, hard_s, temp_max
        self.duty, self.dmin, self.dmax, self.blind_duty, self.adj_every, self.poll_s = duty0, duty_min, duty_max, blind_duty, adj_every, poll_s
        self.t_last = clock()
        self.debt = 0.0
        self.adj_at = 0.0
        self.over_since = None
        self.hard = False
        self.stats = {"rest_s": 0.0, "pause_s": 0.0, "pauses": 0, "hard_stops": 0, "calls": 0, "max_w30": 0.0, "max_u30": 0.0}

    # ── 상태 ──────────────────────────────────────────────
    def reset_clock(self):
        """작업 밖 대기(다른 GPU 고부하 대기 등)는 일한 시간이 아니다 — 쉼 빚에서 뺀다."""
        self.t_last = self.clock()

    def _over_target(self, w, u, temp, resume=False):
        if resume:        # 쉬던 중에는 목표 − 여유 아래로 내려와야 다시 일한다(떨림 방지)
            return w > self.tw - self.mw or u > self.tu - self.mu or temp >= self.temp_max - 3
        return w > self.tw or u > self.tu or temp >= self.temp_max

    def _over_limit(self, w, u, temp):
        return w > self.limit_w or u > self.limit_u or temp >= self.temp_max

    # ── 막기(쉬는 동안 평균이 목표 아래로 내려올 때까지) ───
    def guard(self, on_wait=None, why="학습"):
        w, u, temp, n, age = self.win.avg()
        self._track_hard(w, u, temp, n)
        if n < 4 or age > 3.0 or not self._over_target(w, u, temp):
            return 0.0
        t0 = self.clock()
        self.stats["pauses"] += 1
        last_log = t0
        while True:
            self.sleep(self.poll_s)
            if on_wait:
                on_wait()
            w, u, temp, n, age = self.win.avg()
            self._track_hard(w, u, temp, n)
            if n >= 4 and age <= 3.0 and not self._over_target(w, u, temp, resume=True):
                break
            if self.clock() - last_log >= 15:
                last_log = self.clock()
                self.log(f"{why} 쉬는 중 · 30초 평균 {w:.0f} W {u:.0f} % {temp:.0f} ℃ → {self.tw - self.mw:.0f} W {self.tu - self.mu:.0f} % 아래로 내려갈 때까지"
                         f" ({last_log - t0:.0f}s째)")
        dt = self.clock() - t0
        self.stats["pause_s"] += dt
        if self.hard:
            self.hard = False
            self.log(f"{why} 하드 정지 해제 · {dt:.0f}s 쉼 · 30초 평균 {w:.0f} W {u:.0f} %")
            self.event("train.resume", {"reason": "power_cooled", "paused_s": round(dt, 1), "w30": round(w, 1), "util30": round(u, 1)})
        # 쉼 뒤에는 작업 몫을 다시 시작한다 — 방금 쉰 시간을 일한 시간으로 세지 않는다
        self.t_last = self.clock()
        self.debt = 0.0
        return dt

    def _track_hard(self, w, u, temp, n):
        if n < 4:
            return
        now = self.clock()
        w_, u_ = w, u
        if self._over_limit(w_, u_, temp):
            if self.over_since is None:
                self.over_since = now
            if now - self.over_since > self.hard_s and not self.hard:
                self.hard = True
                self.stats["hard_stops"] += 1
                self.log(f"하드 정지 · 30초 평균 {w_:.0f} W {u_:.0f} % {temp:.0f} ℃ 가 상한({self.limit_w:.0f} W {self.limit_u:.0f} %)을 {now - self.over_since:.0f}s 넘게 넘음 — 식을 때까지 멈춤")
                self.event("train.hold", {"reason": "power_hard_stop", "note": "전력 상한 초과 — 식을 때까지 일시 정지",
                                          "w30": round(w_, 1), "util30": round(u_, 1), "temp": round(temp)})
        else:
            self.over_since = None

    # ── 훅(배치/스텝마다) ─────────────────────────────────
    def __call__(self, on_wait=None, why="학습"):
        self.stats["calls"] += 1
        now = self.clock()
        work = max(0.0, now - self.t_last)
        w, u, temp, n, age = self.win.avg()
        blind = n < 4 or age > 3.0
        d = min(self.duty, self.blind_duty) if blind else self.duty
        self.debt += work * (1 - d) / d
        self.guard(on_wait, why)
        if not blind:
            w30, u30, _, _, _ = self.win.avg()
            w10, u10, _, n10, _ = self.win.avg(10.0)
            self.stats["max_w30"] = max(self.stats["max_w30"], w30)
            self.stats["max_u30"] = max(self.stats["max_u30"], u30)
            if self.clock() - self.adj_at >= self.adj_every:
                self.adj_at = self.clock()
                e = max(w30 / self.tw, u30 / self.tu)
                if n10 >= 8:                                  # 10초 평균이 더 빨리 오른다 — 큰 쪽으로 본다
                    e = max(e, w10 / self.tw, u10 / self.tu)
                if e > 1.0:
                    self.duty = max(self.dmin, self.duty * max(0.7, 1.0 / e))
                elif e < 0.88:
                    self.duty = min(self.dmax, self.duty * 1.04)
        if self.debt >= 0.05:
            rest = min(self.debt, 15.0)
            self.debt -= rest
            self._rest(rest, on_wait)
        self.t_last = self.clock()

    def _rest(self, rest, on_wait):
        end = self.clock() + rest
        while True:
            left = end - self.clock()
            if left <= 0.002:
                break
            self.sleep(min(1.0, left))
            if on_wait:
                on_wait()
        self.stats["rest_s"] += rest
