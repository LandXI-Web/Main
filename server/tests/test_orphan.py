"""v1.1-14 shard 고아 감시 — 강제 sleep 어댑터(test/sleep · cpu-0 · 개발 모드)로 실증.

감시 한도 = max(120 s, 5×중앙값) 이지만 테스트는 options.orphan_timeout_s(개발 모드 전용)로 2 s 로 줄인다. 감시 주기 10 s.
① 첫 시도만 느림 → shard.failed{timeout, retry 1} → 재배정 → 두 번째 시도 완료 → job.done(늦게 온 첫 시도 결과는 버림)
② 두 번 다 느림 → shard.failed{timeout, retry 2, final} → job.failed"""
from _f2b import BASE, sleep_job, sse, submit, wait_job


def test_orphan_timeout_then_reassigned_ok(live, tok):
    jid = submit(tok["staff"], sleep_job(n=1, sleep_first_s=14, sleep_retry_s=0, orphan_timeout_s=2))
    evs = sse(BASE + f"/api/v1/events/jobs/{jid}?access_token={tok['staff']}", until=("job.done", "job.failed"), timeout=90)
    names = [e for e, *_ in evs]
    fails = [d for e, d, *_ in evs if e == "shard.failed"]
    assert fails and fails[0]["error"] == "timeout" and fails[0]["retry"] == 1, names
    assert "job.done" in names and names.index("shard.failed") < names.index("shard.done")
    dones = [d for e, d, *_ in evs if e == "shard.done"]
    assert len(dones) == 1                                     # 늦게 끝난 첫 시도는 버려져 shard.done 1회
    j = wait_job(tok["staff"], jid)
    assert j["state"] == "done" and j["shards_done"] == 1 and j["shards_failed"] == 0


def test_orphan_timeout_twice_fails_job(live, tok):
    jid = submit(tok["staff"], sleep_job(n=1, sleep_first_s=13, sleep_retry_s=13, orphan_timeout_s=2))
    evs = sse(BASE + f"/api/v1/events/jobs/{jid}?access_token={tok['staff']}", until=("job.done", "job.failed"), timeout=120)
    fails = [d for e, d, *_ in evs if e == "shard.failed"]
    assert [f["retry"] for f in fails][:2] == [1, 2] and fails[-1].get("final") is True
    assert evs[-1][0] == "job.failed" and "shard_timeout" in evs[-1][1]["error"]
    j = wait_job(tok["staff"], jid)
    assert j["state"] == "failed"
