"""Hyper Performance 실측 규칙(순수 함수 · 계약 v1.1-5·6·7) — gpu_worker · cpu_worker 와 pytest 가 같은 함수를 쓴다."""
from __future__ import annotations

CPS_WINDOW_S = 10.0       # 진행 중 chips_per_s 계량 창
CPS_MIN_WINDOW_S = 1.0    # 창이 이보다 짧으면 값 없음(창 하한 인공값 n/0.5 금지)
CPS_MIN_DONE = 8          # 완료 shard 가 이보다 적으면 값 없음
MA_WIN = 5                # util 이동평균 표본 수(0.5 s × 5 ≈ 2.5 s)


def chips_rate(n_in_window: int, span_s: float, done: int) -> tuple[float | None, str | None]:
    """→ (값, note). 창 ≥ 1 s 이고 완료 ≥ 8 일 때만 값 · 아니면 (None, '창 짧음')."""
    span = min(CPS_WINDOW_S, span_s)
    if span < CPS_MIN_WINDOW_S or done < CPS_MIN_DONE or not n_in_window:
        return None, "창 짧음"
    return round(n_in_window / span, 2), None


def moving_avg(samples: list[float]) -> float | None:
    s = list(samples)[-MA_WIN:]
    return round(sum(s) / len(s), 1) if s else None


def done_rates(shards_total: int, gpu_s: float | None, elapsed_s: float | None) -> tuple[float | None, float | None]:
    """job.done 두 줄: (GPU 초당 칩 = shards ÷ gpu_s, 벽시계 칩/s = shards ÷ elapsed_s)."""
    per_gpu = round(shards_total / gpu_s, 1) if gpu_s else None
    per_wall = round(shards_total / elapsed_s, 1) if elapsed_s else None
    return per_gpu, per_wall
