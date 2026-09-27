"""재부팅 복구(v1.1-15) — 게이트웨이 lifespan · scheduler 기동이 같은 sweep() 을 부른다(멱등 · Redis recovery:lock).

state in (queued, running) 작업 전수 점검(DB ∪ Redis 미러):
  (a) running 인데 workers[] 하트비트 0(TTL 30s 또는 같은 호스트 PID 죽음)
      → 완료 shard(job:{id}:done · detections · shard GeoJSON)는 그대로 두고, 미완료 shard 만 jobshards:{job} 로 다시 적어
        jobs:{pool} 에 resume 항목을 넣는다(scheduler 가 커서 0 부터 다시 채움) · 스트림·PEL·inflight 에 남은 이 작업 항목은 지운다
        → events:{job} job.recovered{mode:'resumed'} · ops/tenant job.state{reason:'recovered'} · audit_log('job.recovered')
  (b) 영상·모델·배포본이 사라졌으면 failed(error:'recovery_failed') + job.recovered{mode:'failed'}
  (c) queued 인데 스트림에도 없고(미배달 아님) 계획(jobshards)도 없으면 jobs:{pool} 재투입 → job.recovered{mode:'requeued'}
전 shard 가 끝났는데 finalize 가 안 된 작업은 finalize 큐에 다시 넣는다(resumed · 남은 shard 0).
"""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from landxi_api import config  # noqa: E402
from workers import bus  # noqa: E402
from workers.bus import emit, log, now_iso, ops_event, r  # noqa: E402

LOCK = "recovery:lock"
LAST = "recovery:last"
ACTIVE = ("queued", "running")


def _db_jobs() -> dict[str, dict]:
    out = {}
    try:
        with bus.pg() as conn:
            bus.lx_tx(conn)
            rows = conn.execute("SELECT id, state, pool, tenant_id, kind, imagery_id, model_id, deploy_id, shards_total, priority, demo "
                                "FROM jobs WHERE state IN ('queued','running')").fetchall()
        for x in rows:
            out[x[0]] = {"id": x[0], "state": x[1], "pool": x[2], "tenant_id": x[3], "kind": x[4], "imagery_id": x[5], "model_id": x[6],
                         "deploy_id": x[7], "shards_total": x[8], "priority": x[9], "demo": x[10]}
    except Exception as e:
        log("recovery", "db read error", repr(e))
    return out


def _redis_jobs() -> set[str]:
    ids = set()
    for k in r().scan_iter(match="job:job_*", count=1000):
        if k.count(":") != 1:
            continue
        if r().hget(k, "state") in ACTIVE:
            ids.add(k.split(":", 1)[1])
    return ids


def _assets_ok(jh: dict, db: dict | None) -> str | None:
    """없어진 자산이 있으면 사유 문자열."""
    img = jh.get("imagery_id") or (db or {}).get("imagery_id")
    mid = jh.get("model_id") or (db or {}).get("model_id")
    dep = (db or {}).get("deploy_id")
    try:
        with bus.pg() as conn:
            bus.lx_tx(conn)
            if img:
                row = conn.execute("SELECT path_internal FROM imagery WHERE id=%s", (img,)).fetchone()
                if not row:
                    return f"imagery {img} 행 없음"
                p = row[0] or ""
                p = p if (":" in p[:3] or os.path.isabs(p)) else str(config.DATA_ROOT / p)
                if p and not Path(p).exists():
                    return f"imagery 파일 없음: {p}"
            if mid:
                row = conn.execute("SELECT weights_uri FROM models WHERE id=%s", (mid,)).fetchone()
                if not row:
                    return f"model {mid} 행 없음"
                if row[0] and not Path(row[0]).exists():
                    return f"가중치 없음: {row[0]}"
            if dep:
                if not conn.execute("SELECT 1 FROM deploys WHERE id=%s", (dep,)).fetchone():
                    return f"배포본 {dep} 없음"
    except Exception as e:
        return None if "connection" in str(e).lower() else None
    return None


def _in_undelivered(stream: str, group: str, job_id: str) -> bool:
    """jobs:{pool} 에 아직 배달 안 된(그룹 last-delivered-id 뒤) 이 작업 항목이 있는가."""
    try:
        last = next((g["last-delivered-id"] for g in r().xinfo_groups(stream) if g["name"] == group), "0-0")
    except Exception:
        last = "0-0"
    for eid, f in r().xrange(stream, min=f"({last}" if last != "0-0" else "-", max="+", count=10000):
        if f.get("job_id") == job_id:
            return True
    return False


def _purge_stream(pool: str, job_id: str) -> int:
    """shards:{pool} 에서 이 작업 항목(미배달 · PEL)을 지운다 — 재배정 목록과 겹치지 않게."""
    s = f"shards:{pool}"
    ids = [eid for eid, f in r().xrange(s, "-", "+", count=200000) if f.get("job_id") == job_id]
    # PEL 에만 남고 본문이 지워진 항목까지
    try:
        for p in r().xpending_range(s, "g:workers", min="-", max="+", count=10000):
            eid = p["message_id"]
            if eid not in ids:
                got = r().xrange(s, eid, eid)
                if not got:
                    r().xack(s, "g:workers", eid)
    except Exception:
        pass
    if ids:
        for i in range(0, len(ids), 500):
            chunk = ids[i:i + 500]
            try:
                r().xack(s, "g:workers", *chunk)
            except Exception:
                pass
            r().xdel(s, *chunk)
    # 비행 기록
    k = f"inflight:{pool}"
    for f in [f for f in r().hkeys(k) if f.startswith(job_id + "|")]:
        r().hdel(k, f)
    return len(ids)


def _all_shards(job_id: str, jh: dict) -> list[str]:
    k = f"jobshards:{job_id}"
    items = r().lrange(k, 0, -1)
    if items:
        return items
    from workers.scheduler import plan    # 계획이 없으면(Redis 만료) 다시 계산 — 멱등 shard id
    return [json.dumps(s, ensure_ascii=False) for s in plan(job_id)]


def _fail(job_id: str, jh: dict, reason: str, stats: dict):
    now = now_iso()
    r().hset(f"job:{job_id}", mapping={"state": "failed", "error": "recovery_failed", "finished_at": now, "recovered_mode": "failed",
                                       "recovered_at": now, "recovered_reason": reason})
    try:
        with bus.pg() as conn:
            bus.lx_tx(conn)
            conn.execute("UPDATE jobs SET state='failed', error='recovery_failed', finished_at=now() WHERE id=%s", (job_id,))
            conn.execute("INSERT INTO audit_log(actor, realm, action, subject, before, after) VALUES ('system','system','job.recovered',%s,%s,%s)",
                         (job_id, json.dumps({"state": jh.get("state")}), json.dumps({"mode": "failed", "reason": reason}, ensure_ascii=False)))
            conn.commit()
    except Exception as e:
        log("recovery", "db fail write", repr(e))
    d = {"job_id": job_id, "mode": "failed", "shards_done": int(jh.get("shards_done") or 0), "shards_total": int(jh.get("shards_total") or 0),
         "reason": reason, "at": now}
    emit(job_id, "job.recovered", d)
    emit(job_id, "job.failed", {"job_id": job_id, "error": "recovery_failed", "at": now})
    ops_event("job.state", {"job_id": job_id, "tenant_id": jh.get("tenant_id"), "state": "failed", "reason": "recovered", "mode": "failed",
                            "shards_done": d["shards_done"], "shards_total": d["shards_total"],
                            "aoi_centroid": json.loads(jh.get("centroid") or "null"), "pool": jh.get("pool"), "at": now})
    stats["failed"] += 1
    stats["jobs"].append({"job_id": job_id, "mode": "failed", "reason": reason})
    log("recovery", f"{job_id} failed ({reason})")


def already_resumed(jh: dict, done_now: int) -> bool:
    """recovered_at 이 있고 · 그때의 resume_seq 가 지금과 같고 · 완료 수가 그때와 같으면 같은 복구를 두 번 알리는 것."""
    if not jh.get("recovered_at") or jh.get("recovered_mode") != "resumed":
        return False
    if str(jh.get("recovered_seq", "")) != str(jh.get("resume_seq", "0") or "0"):
        return False
    try:
        return int(jh.get("recovered_done") or -1) == int(done_now)
    except ValueError:
        return False


def _announce(job_id: str, jh: dict, mode: str, reason: str, done: int, total: int, remaining: int, stats: dict, seq: int | None = None):
    now = now_iso()
    if seq is None:
        seq = int(r().hget(f"job:{job_id}", "resume_seq") or 0)
    r().hset(f"job:{job_id}", mapping={"recovered_mode": mode, "recovered_at": now, "recovered_reason": reason, "recovered_done": done,
                                       "recovered_total": total, "recovered_seq": seq})
    d = {"job_id": job_id, "mode": mode, "shards_done": done, "shards_total": total, "remaining": remaining, "reason": reason, "at": now,
         "resume_seq": seq}
    emit(job_id, "job.recovered", d)
    ops_event("job.state", {"job_id": job_id, "tenant_id": jh.get("tenant_id"), "state": jh.get("state") or "running", "reason": "recovered",
                            "mode": mode, "shards_done": done, "shards_total": total,
                            "aoi_centroid": json.loads(jh.get("centroid") or "null"), "pool": jh.get("pool"), "at": now})
    try:
        with bus.pg() as conn:
            bus.lx_tx(conn)
            conn.execute("INSERT INTO audit_log(actor, realm, action, subject, before, after) VALUES ('system','system','job.recovered',%s,%s,%s)",
                         (job_id, json.dumps({"state": jh.get("state"), "workers": json.loads(jh.get("workers") or "[]")}),
                          json.dumps({"mode": mode, "shards_done": done, "shards_total": total, "reason": reason}, ensure_ascii=False)))
            conn.commit()
    except Exception as e:
        log("recovery", "audit error", repr(e))
    stats[mode] += 1
    stats["jobs"].append({"job_id": job_id, "mode": mode, "shards_done": done, "shards_total": total, "reason": reason})
    log("recovery", f"{job_id} {mode} {done}/{total} ({reason})")


def recover_one(job_id: str, db: dict | None, stats: dict, who: str):
    jh = bus.job(job_id)
    if not jh:
        # Redis 미러가 없다(볼륨 유실) — DB 행으로는 shard 목록·커서를 되살릴 수 없으니 실패로 정직하게
        if db:
            _fail(job_id, {"state": db["state"], "tenant_id": db["tenant_id"], "pool": db["pool"], "shards_total": db["shards_total"]},
                  "Redis 작업 미러 없음(재부팅 중 유실)", stats)
        return
    state = jh.get("state")
    if state not in ACTIVE:
        return
    pool = jh.get("pool") or (db or {}).get("pool") or config.POOL
    if state == "queued":
        if r().exists(f"jobshards:{job_id}") or _in_undelivered(f"jobs:{pool}", "g:sched", job_id):
            return          # 스케줄러가 받을 것(미배달) 또는 이미 계획됨(restore 가 되살림)
        r().xadd(f"jobs:{pool}", {"job_id": job_id, "priority": jh.get("priority", 0), "requeue": "recovery"}, maxlen=10000, approximate=True)
        _announce(job_id, jh, "requeued", "queued 인데 스케줄러 스트림에 없음(재부팅)", 0, int(jh.get("shards_total") or 0), 0, stats)
        return
    # running
    workers = json.loads(jh.get("workers") or "[]")
    if not workers:
        workers = [k.split(":")[1] for k in r().scan_iter(match="worker:*:hb") if r().hget(k, "pool") == pool]
    alive = [w for w in workers if bus.worker_alive(w)]
    total = int(jh.get("shards_total") or 0)
    done_ids = r().smembers(f"job:{job_id}:done")
    failed_ids = r().smembers(f"job:{job_id}:failed")
    finished = len(done_ids) + len(failed_ids) >= total > 0
    if finished:
        if r().exists(f"job:{job_id}:finalize") and bus.worker_alive("cpu-0"):
            return          # finalize 대기/진행 중(cpu-0 살아 있음)
    elif alive:
        return              # 살아 있는 워커가 들고 있다 — 건드리지 않음
    if already_resumed(jh, len(done_ids)):
        # 앞선 sweep(게이트웨이 lifespan ↔ scheduler.restore)이 이미 같은 resume_seq 로 재개해 두었고 그 뒤 진척 0
        # — 새 워커가 아직 뜨는 중일 뿐이다. 다시 재배정·job.recovered 를 내지 않는다(F2-B 1차 판정 불합격 4).
        stats["already"] = stats.get("already", 0) + 1
        stats.setdefault("already_jobs", []).append({"job_id": job_id, "resume_seq": jh.get("resume_seq"), "recovered_at": jh.get("recovered_at")})
        log("recovery", f"{job_id}: 이미 재개됨(resume_seq {jh.get('resume_seq')} · {len(done_ids)}/{total} · {jh.get('recovered_at')}) — 중복 알림 건너뜀")
        return
    missing = _assets_ok(jh, db)
    if missing:
        _fail(job_id, jh, missing, stats)
        return
    dead = [w for w in workers if w not in alive]
    reason = f"worker heartbeat 0 ({', '.join(dead) or pool}) · 재부팅/종료"
    if finished:
        # shard 는 끝났는데 finalize 전 — finalize 큐에 다시
        r().delete(f"job:{job_id}:finalize")
        known = set((config.load_yaml("pools").get("pools") or {}).keys())
        lane = ("finalize:cpu:small" if total <= 16 else "finalize:cpu") if pool in known else f"finalize:{pool}"
        r().xadd(lane, {"job_id": job_id, "by": "recovery", "at": now_iso()})
        _announce(job_id, jh, "resumed", reason + " · finalize 재투입", len(done_ids), total, 0, stats)
        return
    r().hset(f"job:{job_id}", "recovering", "1")          # 스케줄러 pick() 이 이 작업을 잠시 건너뛴다
    time.sleep(0.2)
    all_items = _all_shards(job_id, jh)
    remaining = []
    skip = done_ids | failed_ids
    for it in all_items:
        try:
            sid = json.loads(it)["shard_id"]
        except Exception:
            continue
        if sid not in skip:
            remaining.append(it)
    purged = _purge_stream(pool, job_id)
    k = f"jobshards:{job_id}"
    pipe = r().pipeline()
    pipe.delete(k)
    for i in range(0, len(remaining), 2000):
        pipe.rpush(k, *remaining[i:i + 2000])
    pipe.expire(k, 7 * 86400)
    seq = r().hincrby(f"job:{job_id}", "resume_seq", 1)
    pipe.hset(f"job:{job_id}", mapping={"cursor": 0, "workers": json.dumps(sorted(alive))})
    for w in dead:
        pipe.hdel(f"job:{job_id}", "worker_seen:" + w)
    pipe.execute()
    r().xadd(f"jobs:{pool}", {"job_id": job_id, "priority": jh.get("priority", 0), "resume": seq}, maxlen=10000, approximate=True)
    _announce(job_id, jh, "resumed", reason, len(done_ids), total, len(remaining), stats, seq=seq)
    log("recovery", f"{job_id}: 미완료 {len(remaining)} shard 재배정 · 스트림 정리 {purged} · resume_seq {seq}")


def sweep(who: str = "gateway") -> dict:
    """멱등 — 다른 프로세스가 돌고 있으면 skipped. 결과는 Redis recovery:last 에도 남긴다."""
    stats = {"resumed": 0, "requeued": 0, "failed": 0, "jobs": [], "by": who, "at": now_iso(), "skipped": False}
    t0 = time.time()
    if not r().set(LOCK, who, nx=True, ex=120):
        stats["skipped"] = True
        stats["held_by"] = r().get(LOCK)
        return stats
    try:
        db = _db_jobs()
        ids = set(db) | _redis_jobs()
        for jid in sorted(ids):
            try:
                recover_one(jid, db.get(jid), stats, who)
            except Exception as e:
                log("recovery", "recover error", jid, repr(e))
        stats["checked"] = len(ids)
        stats["ms"] = int((time.time() - t0) * 1000)
        acted = stats["resumed"] or stats["requeued"] or stats["failed"]
        if acted or not stats.get("already") or not r().exists(LAST):
            # 앞선 sweep 이 이미 복구한 작업만 있었다면(already) 그쪽 기록(recovery:last)을 덮지 않는다 — /health 가 그 결과를 보인다
            r().set(LAST, json.dumps(stats, ensure_ascii=False), ex=7 * 86400)
        if stats["resumed"] or stats["requeued"] or stats["failed"]:
            log("recovery", f"sweep by {who}: resumed {stats['resumed']} · requeued {stats['requeued']} · failed {stats['failed']} "
                            f"(점검 {len(ids)} · {stats['ms']} ms)")
    finally:
        if r().get(LOCK) == who:
            r().delete(LOCK)
    return stats


if __name__ == "__main__":
    print(json.dumps(sweep("cli"), ensure_ascii=False, indent=1))
