"""v1.1-15 재부팅 복구 — workers/recovery.sweep · recover_one(Redis 가짜 하트비트 · 스케줄러가 보지 않는 풀 'pytest-pool').

실프로세스 kill → 게이트웨이 재기동 실증은 e2e f2b-recovery(영상 f2b.mp4 22–40 s)."""
import json
import os
import time

import httpx
import pytest

from conftest import B
from workers import bus, recovery

POOL = "pytest-pool"
TEN = "pytest-t"


def _mk(jid, state="running", workers=("ghost-9",), total=5, done=("s0", "s1"), model="", extra=None):
    r = bus.r()
    for k in r.scan_iter(match=f"job:{jid}*"):
        r.delete(k)
    r.delete(f"events:{jid}", f"jobshards:{jid}")
    r.hset(f"job:{jid}", mapping={"id": jid, "state": state, "pool": POOL, "tenant_id": TEN, "kind": "infer", "priority": 0,
                                  "workers": json.dumps(list(workers)), "shards_total": total, "shards_done": len(done), "model_id": model,
                                  "imagery_id": "", "centroid": "null", "options": "{}", **(extra or {})})
    if total:
        r.rpush(f"jobshards:{jid}", *[json.dumps({"shard_id": f"s{i}", "bbox": [0, 0, 0, 0], "window": None, "params": None}) for i in range(total)])
    if done:
        r.sadd(f"job:{jid}:done", *done)


def _cleanup(*jids):
    r = bus.r()
    for jid in jids:
        for k in list(r.scan_iter(match=f"job:{jid}*")):
            r.delete(k)
        r.delete(f"events:{jid}", f"jobshards:{jid}")
    r.delete(f"jobs:{POOL}", f"shards:{POOL}", f"inflight:{POOL}", f"events:tenant:{TEN}")


def _events(jid):
    return [(f["event"], json.loads(f["data"])) for _, f in bus.r().xrange(f"events:{jid}")]


@pytest.fixture()
def stats():
    return {"resumed": 0, "requeued": 0, "failed": 0, "jobs": []}


def test_running_dead_worker_resumes_only_unfinished(live, stats):
    jid = "job_PYTEST_RECOVER_A"
    _cleanup(jid)
    _mk(jid)
    r = bus.r()
    bus.ensure_group(f"shards:{POOL}", "g:workers")
    for sid in ("s2", "s3"):                                   # 죽은 워커가 들고 있던 항목(하나는 배달돼 PEL)
        r.xadd(f"shards:{POOL}", {"job_id": jid, "shard_id": sid, "bbox": "[0,0,0,0]", "window": "null", "params": "null", "attempt": 0})
    r.xreadgroup("g:workers", "ghost-9", {f"shards:{POOL}": ">"}, count=1)
    bus.inflight_start(POOL, jid, "s2", {"attempt": 0}, "ghost-9")
    recovery.recover_one(jid, None, stats, "pytest")
    left = [json.loads(x)["shard_id"] for x in r.lrange(f"jobshards:{jid}", 0, -1)]
    assert left == ["s2", "s3", "s4"]                          # 완료 s0·s1 유지 · 미완료만
    assert [f for _, f in r.xrange(f"shards:{POOL}") if f.get("job_id") == jid] == []
    assert r.xpending(f"shards:{POOL}", "g:workers")["pending"] == 0
    assert r.hlen(f"inflight:{POOL}") == 0
    resume = [f for _, f in r.xrange(f"jobs:{POOL}") if f.get("job_id") == jid]
    assert resume and resume[-1]["resume"] == "1"
    ev = _events(jid)
    rec = [d for e, d in ev if e == "job.recovered"]
    assert rec and rec[-1]["mode"] == "resumed" and rec[-1]["shards_done"] == 2 and rec[-1]["shards_total"] == 5 and rec[-1]["remaining"] == 3
    assert "heartbeat 0" in rec[-1]["reason"]
    h = bus.job(jid)
    assert h["recovered_mode"] == "resumed" and h["recovering"] == "1" and h["cursor"] == "0"
    ten = [(f["event"], json.loads(f["data"])) for _, f in r.xrange(f"events:tenant:{TEN}")]
    assert any(e == "job.state" and d.get("reason") == "recovered" and d["job_id"] == jid for e, d in ten)
    ops = [json.loads(f["data"]) for _, f in r.xrevrange("ops:events", count=200) if f.get("event") == "job.state"]
    assert any(d.get("job_id") == jid and d.get("reason") == "recovered" for d in ops)
    assert stats["resumed"] == 1
    _cleanup(jid)


def test_second_sweep_same_resume_seq_does_not_reannounce(live, stats):
    """F2-B 1차 판정 불합격 4: 게이트웨이 lifespan sweep 뒤 12 s 에 scheduler.restore sweep 이 다시 돌 때(새 워커 아직 기동 중 ·
    진척 0) 같은 resume_seq 로 job.recovered 가 두 번 나가면 안 된다. 진척이 생긴 뒤 다시 죽으면 새 resume_seq 로 한 번 더."""
    jid = "job_PYTEST_RECOVER_IDEM"
    _cleanup(jid)
    _mk(jid)
    r = bus.r()
    recovery.recover_one(jid, None, stats, "gateway")          # 1) 게이트웨이 lifespan
    r.hset(f"job:{jid}", "workers", "[]")                      #    새 워커 하트비트 아직 없음
    recovery.recover_one(jid, None, stats, "scheduler")        # 2) scheduler.restore — 12 s 뒤
    rec = [d for e, d in _events(jid) if e == "job.recovered"]
    assert len(rec) == 1 and rec[0]["resume_seq"] == 1
    assert stats["resumed"] == 1 and stats.get("already") == 1
    assert len([f for _, f in r.xrange(f"jobs:{POOL}") if f.get("job_id") == jid and f.get("resume")]) == 1
    assert bus.job(jid)["resume_seq"] == "1"
    # 3) 새 워커가 s2 를 끝낸 뒤 또 죽음 → 진척이 있으므로 재개 2회차(resume_seq 2)
    r.sadd(f"job:{jid}:done", "s2")
    r.hset(f"job:{jid}", "workers", json.dumps(["ghost-10"]))
    recovery.recover_one(jid, None, stats, "gateway")
    rec = [d for e, d in _events(jid) if e == "job.recovered"]
    assert len(rec) == 2 and rec[1]["resume_seq"] == 2 and rec[1]["shards_done"] == 3 and rec[1]["remaining"] == 2
    _cleanup(jid)


def test_alive_worker_untouched(live, stats):
    jid = "job_PYTEST_RECOVER_B"
    _cleanup(jid)
    r = bus.r()
    r.hset("worker:pytest-live:hb", mapping={"id": "pytest-live", "pool": POOL, "ts": time.time(), "pid": os.getpid(), "node": ""})
    r.expire("worker:pytest-live:hb", 30)
    _mk(jid, workers=("pytest-live",))
    recovery.recover_one(jid, None, stats, "pytest")
    assert not [e for e, _ in _events(jid) if e == "job.recovered"]
    assert r.llen(f"jobshards:{jid}") == 5
    r.delete("worker:pytest-live:hb")
    _cleanup(jid)


def test_missing_model_fails_recovery_failed(live, stats):
    jid = "job_PYTEST_RECOVER_C"
    _cleanup(jid)
    _mk(jid, model="nope/none")
    recovery.recover_one(jid, None, stats, "pytest")
    h = bus.job(jid)
    assert h["state"] == "failed" and h["error"] == "recovery_failed" and h["recovered_mode"] == "failed"
    ev = dict(_events(jid)[-2:])
    assert ev["job.recovered"]["mode"] == "failed" and "nope/none" in ev["job.recovered"]["reason"]
    assert ev["job.failed"]["error"] == "recovery_failed"
    assert stats["failed"] == 1
    _cleanup(jid)


def test_queued_lost_is_requeued_but_undelivered_is_left(live, stats):
    a, b = "job_PYTEST_RECOVER_D", "job_PYTEST_RECOVER_E"
    _cleanup(a, b)
    _mk(a, state="queued", total=0, done=())
    _mk(b, state="queued", total=0, done=())
    r = bus.r()
    bus.ensure_group(f"jobs:{POOL}", "g:sched")
    r.xadd(f"jobs:{POOL}", {"job_id": b, "priority": 0})           # b 는 아직 배달 안 됨 → 스케줄러가 받을 것
    recovery.recover_one(a, None, stats, "pytest")
    recovery.recover_one(b, None, stats, "pytest")
    ents = [f for _, f in r.xrange(f"jobs:{POOL}")]
    assert any(f["job_id"] == a and f.get("requeue") == "recovery" for f in ents)
    assert sum(1 for f in ents if f["job_id"] == b) == 1
    assert [d["mode"] for e, d in _events(a) if e == "job.recovered"] == ["requeued"]
    assert not [e for e, _ in _events(b) if e == "job.recovered"]
    assert stats["requeued"] == 1
    _cleanup(a, b)


def test_finished_not_finalized_goes_back_to_finalize(live, stats):
    jid = "job_PYTEST_RECOVER_F"
    _cleanup(jid)
    _mk(jid, total=3, done=("s0", "s1", "s2"))
    r = bus.r()
    fin = f"finalize:{POOL}"                     # 설정에 없는 풀 → 실 cpu-0 가 집어 가지 않는 레인(실풀은 finalize:cpu[:small])
    r.delete(fin)
    # finalize 키가 없다(워커가 마지막 shard 직후 죽음) → finalize 재투입
    recovery.recover_one(jid, None, stats, "pytest")
    assert r.xlen(fin) == 1
    last = r.xrevrange(fin, count=1)[0][1]
    assert last["job_id"] == jid and last["by"] == "recovery"
    rec = [d for e, d in _events(jid) if e == "job.recovered"]
    assert rec[-1]["mode"] == "resumed" and rec[-1]["remaining"] == 0
    r.delete(fin)
    _cleanup(jid)


def test_sweep_is_idempotent_under_lock(live):
    r = bus.r()
    r.set(recovery.LOCK, "someone-else", ex=5)
    st = recovery.sweep("pytest")
    assert st["skipped"] and st["held_by"] == "someone-else"
    r.delete(recovery.LOCK)
    st = recovery.sweep("pytest")
    assert not st["skipped"] and "checked" in st


def test_health_recovered_at_boot(live):
    h = httpx.get(B + "/health", timeout=10).json()
    rb = h["recovered_at_boot"]
    assert {"resumed", "requeued", "failed", "jobs"} <= set(rb)
    assert isinstance(rb["resumed"], int)


def test_scheduler_resume_same_seq_after_restore_clears_recovering(live):
    """스케줄러 자신의 기동 sweep 이 재개 → restore() 가 같은 resume_seq 로 active 에 올림 → jobs:{pool} 의 resume 항목 도착.
    예전: _resume 이 그냥 return → recovering=1 이 남아 pick() 이 영영 건너뜀(중복 sweep 의 resume_seq 2 가 우연히 풀어 주고 있었다)."""
    from workers import scheduler
    jid = "job_PYTEST_RECOVER_SEQ"
    _cleanup(jid)
    _mk(jid, extra={"recovering": "1", "resume_seq": 1})
    scheduler.active[jid] = {"pool": POOL, "priority": 0, "tenant": TEN, "total": 3, "cursor": 0, "started": True, "created": 0, "resume_seq": 1}
    scheduler._resume(POOL, jid, bus.job(jid), 1)
    assert bus.job(jid).get("recovering") is None
    assert scheduler.active[jid]["resume_seq"] == 1           # 재적용(커서 되감기)은 없음
    scheduler.active.pop(jid, None)
    _cleanup(jid)
