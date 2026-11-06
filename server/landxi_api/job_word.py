"""작업 상태 말 한 곳(11-01 PM "실패하면 당연히 실패로 표시한다") — 모든 분석 공통.

칸(shard) 계산이 모두 실패 → 작업 상태 'failed'(작업기 · 마감 단계 workers/cpu_worker.job_failed).
일부 칸만 실패 → 상태는 'done'(나온 결과는 쓴다) · 말은 '일부 실패 · 실패 칸 n/전체'.
"""
from __future__ import annotations

BASE = {"queued": "작업 대기", "running": "분석 중", "done": "완료", "failed": "실패", "cancelled": "취소됨", "timeout": "시간초과"}


def partial(state: str | None, shards_failed, shards_total=None) -> bool:
    try:
        return state == "done" and int(shards_failed or 0) > 0
    except (TypeError, ValueError):
        return False


def word(state: str | None, shards_failed=0, shards_total=None, kind: str | None = None) -> str:
    st = state or ""
    if kind == "train" and st == "running":     # 학습 작업은 '분석 중'이 아니라 '학습 중'(11-07 태양광 검수 6)
        return "학습 중"
    if partial(st, shards_failed, shards_total):
        n = int(shards_failed or 0)
        try:
            t = int(shards_total or 0)
        except (TypeError, ValueError):
            t = 0
        return f"일부 실패 · 실패 칸 {n}" + (f"/{t}" if t else "")
    return BASE.get(st, st)
