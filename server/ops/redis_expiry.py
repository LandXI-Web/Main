"""오래 끝난 작업의 Redis 부속 키 정리(impl-46 ops) — 게이트웨이 대표 프로세스가 1시간마다(main.lifespan) · 따로도 돈다.

    python server/ops/redis_expiry.py            # 정리(만료 걸기)
    python server/ops/redis_expiry.py --dry      # 몇 개인지 세기만

Redis 에 작업마다 진행 부속 키(job:{id}:done · :failed · :finalize · :ts · :counts · :final_progress · :cursor · :progress_lock)와
조각 목록(jobshards:{id}) · 이벤트 스트림(events:{id})이 만료 없이 쌓여 27만 개가 됐다(10-21) → 키 훑기가 0.6 s.
지우는 대상 = DB jobs 표에서 끝난 상태(done · failed · cancelled)이고 끝난 지 KEEP_HOURS(24시간)가 지난 작업만. 진행 중 · 대기 ·
DB 에 없는 작업 · 최근 작업은 손대지 않는다(전국 작업기 · 복구 sweep · 다시 실행이 쓰는 것은 모두 진행 중이거나 최근 것).
조각 목록 · 이벤트 스트림은 쓰는 쪽이 건 만료(약 7일)를 하루로 줄인다(끝난 뒤 24시간 + 하루). 본 해시 job:{id}(작은 요약)는 남긴다 — 작업 상세가 DB 행과 함께 읽는다. 바로 지우지 않고 1시간 뒤 만료(EXPIRE 3600)를 건다.
(전국 작업기가 하루 수천 개 작업을 만들어 14일 기준으로는 키가 줄지 않는다 — 10-21 실측 done 35,418 중 14일 넘은 것 798.)
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from landxi_api import config  # noqa: E402

KEEP_HOURS = 24
EXPIRE_S = 3600
STREAM_KEEP_S = 86400
AUX = ("done", "failed", "finalize", "ts", "counts", "final_progress", "cursor", "progress_lock")


def run(dry: bool = False) -> dict:
    import psycopg
    import redis
    t0 = time.time()
    with psycopg.connect(config.PG_WORKER_DSN) as c:
        ids = [r[0] for r in c.execute(
            "SELECT id FROM jobs WHERE state IN ('done','failed','cancelled') AND coalesce(finished_at, created_at) < now() - make_interval(hours => %s)",
            (KEEP_HOURS,)).fetchall()]
    r = redis.Redis.from_url(config.REDIS_URL, decode_responses=True)
    before = r.dbsize()
    n_keys = 0
    for i in range(0, len(ids), 500):
        chunk = ids[i:i + 500]
        keys = [f"job:{j}:{a}" for j in chunk for a in AUX] + [f"jobshards:{j}" for j in chunk] + [f"events:{j}" for j in chunk]
        pipe = r.pipeline(transaction=False)
        for k in keys:
            pipe.ttl(k)
        ttls = pipe.execute()
        # 부속 키 = 만료 없음(-1)이면 EXPIRE_S · 조각 목록 · 이벤트 스트림 = 쓰는 쪽이 건 만료(약 7일)가 STREAM_KEEP_S 보다 길면 줄인다
        todo = []
        for k, t in zip(keys, ttls):
            if t == -2:
                continue
            want = STREAM_KEEP_S if k.startswith(("jobshards:", "events:")) else EXPIRE_S
            if t == -1 or t > want:
                todo.append((k, want))
        n_keys += len(todo)
        if not dry and todo:
            pipe = r.pipeline(transaction=False)
            for k, want in todo:
                pipe.expire(k, want)
            pipe.execute()
    out = {"jobs_old": len(ids), "keys_expire_set": n_keys, "dry": dry, "dbsize": before, "keep_hours": KEEP_HOURS,
           "expire_s": EXPIRE_S, "stream_keep_s": STREAM_KEEP_S, "seconds": round(time.time() - t0, 1)}
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true")
    print(json.dumps(run(ap.parse_args().dry), ensure_ascii=False))
