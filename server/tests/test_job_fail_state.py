"""칸이 실패한 작업의 상태(11-01 PM "실패하면 당연히 실패로 표시한다") — 시험 DB · 시험 Redis 에서만(conftest).

① 칸이 모두 실패 → 작업 'failed'(진행 기록 · 작업 장부 · 변화 실행 기록 모두) · 결과 마감은 하지 않는다
② 일부 칸만 실패 → 'done' + shards_failed 기록 · 말 '일부 실패 · 실패 칸 n/전체'
③ 마감 단계 오류 → 장부까지 'failed'
GPU 를 쓰지 않는다.
"""
import json
import uuid

import psycopg

from landxi_api import config
from landxi_api.job_word import partial, word
from workers import bus, cpu_worker as CW


def test_word():
    assert word("done", 0, 9) == "완료" and not partial("done", 0)
    assert word("done", 2, 9) == "일부 실패 · 실패 칸 2/9" and partial("done", 2)
    assert word("failed", 1, 1) == "실패" and not partial("failed", 1)
    assert CW.all_failed({"shards_total": "1", "shards_done": "0", "shards_failed": "1"})
    assert not CW.all_failed({"shards_total": "3", "shards_done": "2", "shards_failed": "1"})
    assert not CW.all_failed({"shards_total": "0", "shards_done": "0", "shards_failed": "0"})


def _job(kind="index", total=1, done=0, failed=1):
    jid = "job_TEST" + uuid.uuid4().hex[:18].upper()
    with psycopg.connect(config.PG_ADMIN_DSN) as c:
        c.execute("INSERT INTO jobs(id, tenant_id, kind, state, pool, model_id, options, shards_total, shards_done, shards_failed, counts, submitted_by, test) "
                  "VALUES (%s,'lx',%s,'running','a6000','change-ap25',%s,%s,0,0,'{}','u_mail_test',true)",
                  (jid, kind, json.dumps({"change": {"types": "landslide"}}), total))
    bus.r().hset(f"job:{jid}", mapping={"state": "running", "kind": kind, "pool": "a6000", "tenant_id": "lx", "model_id": "change-ap25",
                                        "shards_total": total, "shards_done": done, "shards_failed": failed, "options": "{}"})
    return jid


def _db(jid):
    with psycopg.connect(config.PG_ADMIN_DSN) as c:
        return c.execute("SELECT state, shards_failed, error FROM jobs WHERE id=%s", (jid,)).fetchone()


def _clean(jid):
    with psycopg.connect(config.PG_ADMIN_DSN) as c:
        c.execute("DELETE FROM jobs WHERE id=%s", (jid,))
    bus.r().delete(f"job:{jid}", f"events:{jid}")


def test_all_failed_index():
    jid = _job("index", 1, 0, 1)
    try:
        CW.finalize_cpu(jid)
        st, sf, err = _db(jid)
        assert st == "failed" and sf == 1 and "칸 계산 실패 1/1" in (err or "")
        assert bus.r().hget(f"job:{jid}", "state") == "failed"
    finally:
        _clean(jid)


def test_all_failed_infer():
    jid = _job("infer", 4, 0, 4)
    try:
        CW.finalize(jid)
        st, sf, err = _db(jid)
        assert st == "failed" and sf == 4
    finally:
        _clean(jid)


def test_partial_index_done():
    jid = _job("index", 3, 2, 1)
    try:
        CW.finalize_cpu(jid)
        st, sf, _ = _db(jid)
        assert st == "done" and sf == 1
        assert word(st, sf, 3) == "일부 실패 · 실패 칸 1/3"
    finally:
        _clean(jid)


def test_finalize_error_marks_ledger():
    jid = _job("index", 1, 1, 0)
    try:
        CW.job_failed(jid, None, "finalize: ValueError: 시험")
        st, _, err = _db(jid)
        assert st == "failed" and err.startswith("finalize")
    finally:
        _clean(jid)
