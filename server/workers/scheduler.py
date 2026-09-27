"""스케줄러 — jobs:{pool} → shard 목록(plan) → 우선순위·기관 공정 분배로 shards:{pool} 를 '얕게' 채운다.

- 새 작업: XREADGROUP g:sched jobs:{pool} → shard 전부 계산해 Redis 목록 jobshards:{job} 에 둔다(커서 = 보낸 수).
  plan 훅(D0 · v1.1-9/22): 작업의 어댑터 모듈이 plan(job) -> [shard] 을 정의하면 그것을 쓴다(F2-S survey/rules = 읍면동 39).
  없으면 kind index = 월 목록 · 래스터 = tiling 격자.
- 채우기: shards:{pool} 깊이가 low_watermark 보다 얕으면 가장 급한 작업(priority 숫자 작은 것 → **아직 시작 안 한 작업의 첫 묶음 선점**
  → 기관 deficit RR → 배정 적은 작업)에서 fill_chunk 만큼 XADD. 새 작업의 첫 묶음은 깊이와 상관없이 바로 넣는다(v1.1-17).
- 재개(v1.1-15): jobs:{pool} 의 resume 항목(recovery.sweep 이 넣음) → jobshards(미완료만)를 커서 0 부터 다시.
- 고아 감시(v1.1-14 · 10s): inflight:{pool} 에서 shard.started 뒤 max(120s, 5×중앙값 ms) 넘은 shard → shard.failed{timeout, retry 1}
  → 1회 재배정 → 재실패면 job failed.
- job.started(첫 배정) · job.state(관제·기관) 발행 · 2s 마다 Redis 해시 → jobs 표 동기화 · 동시 작업 한도(concurrent_jobs) 집행.
"""
from __future__ import annotations

import json
import statistics
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from landxi_api import config  # noqa: E402
from workers import bus  # noqa: E402
from workers.bus import emit, log, now_iso, ops_event, r  # noqa: E402
from workers.tiling import shards as mk_shards  # noqa: E402

WHO = "scheduler"
_PCFG = config.load_yaml("pools")
POOLS = {k: v for k, v in _PCFG["pools"].items() if v.get("state") != "pending"}
ORPHAN = _PCFG.get("orphan", {}) or {}
ORPHAN_FLOOR_S = float(ORPHAN.get("floor_s", 120))
ORPHAN_SCAN_S = float(ORPHAN.get("scan_s", 10))
FIRST_CHUNK = int(_PCFG.get("first_chunk", 16))
active: dict[str, dict] = {}        # job_id → {pool, priority, tenant, total, cursor, started, created, resume_seq}
deficit: dict[str, float] = {}      # tenant → 받은 shard 수(적을수록 먼저)


def _meta(path: str):
    import rasterio
    with rasterio.open(path) as ds:
        return {"width": ds.width, "height": ds.height, "transform": ds.transform, "crs": ds.crs.to_epsg() or 5186, "res": ds.res[0]}


def job_view(jh: dict) -> dict:
    """어댑터 plan(job) 에 넘기는 작업 사전(해시 → 파싱)."""
    d = dict(jh)
    for k in ("options", "aoi", "centroid"):
        try:
            d[k] = json.loads(jh[k]) if jh.get(k) else None
        except Exception:
            pass
    d["params"] = (d.get("options") or {}).get("params") or {}
    return d


def plan_job(jh: dict) -> list[dict]:
    """작업 해시 → shard 목록(게이트웨이 견적도 이 함수를 부른다 · jobs.build_quote)."""
    from workers.registry_scan import normalize_plan, plan_hook
    opts = json.loads(jh.get("options") or "{}") if isinstance(jh.get("options"), str) else (jh.get("options") or {})
    kind = jh.get("kind")
    hook = plan_hook(jh.get("adapter") or None)
    if hook is not None:
        return normalize_plan(hook(job_view(jh)))
    if kind == "index":
        params = opts.get("params") or {}
        months = params.get("months") or opts.get("months") or []
        aoi = json.loads(jh["aoi"]) if isinstance(jh.get("aoi"), str) and jh.get("aoi") else (jh.get("aoi") or None)
        return [{"shard_id": f"m{m}", "bbox": list(_bbox(aoi)) if aoi else [0, 0, 0, 0], "window": None,
                 "params": {**{k: v for k, v in params.items() if k != "months"}, "month": m, "aoi": aoi,
                            "cloud_max": params.get("cloud_max", 15)}} for m in months]
    if kind in ("survey", "join"):
        raise RuntimeError(f"kind {kind}: plan() 훅을 가진 어댑터 없음(F2-S server/adapters/survey 미도착)")
    with bus.pg() as conn:
        row = conn.execute("SELECT path_internal, ST_AsGeoJSON(footprint)::text FROM imagery WHERE id=%s", (jh["imagery_id"],)).fetchone()
    path = row[0] if (":" in row[0][:3]) else str(config.DATA_ROOT / row[0])
    meta = _meta(path)
    aoi = json.loads(jh["aoi"]) if jh.get("aoi") else None
    fp_parts = None
    if row[1]:
        from pyproj import Transformer
        from shapely.geometry import shape
        from shapely.ops import transform as sh_transform
        g = sh_transform(Transformer.from_crs(4326, meta["crs"], always_xy=True).transform, shape(json.loads(row[1])))
        fp_parts = list(getattr(g, "geoms", [g]))
    _, sh = mk_shards(meta, aoi, chip=int(opts.get("chip", 1024)), overlap=opts.get("overlap"), upsample=float(opts.get("upsample", 1) or 1),
                      footprint_src=fp_parts)
    return sh


def plan(job_id: str) -> list[dict]:
    return plan_job(bus.job(job_id))


def _bbox(aoi):
    from shapely.geometry import shape
    return shape(aoi).bounds


def _resume(pool: str, job_id: str, jh: dict, seq: int):
    k = f"jobshards:{job_id}"
    total = r().llen(k)
    cur = active.get(job_id)
    if cur and cur.get("resume_seq") == seq:
        # restore() 가 이미 같은 resume_seq 로 되살려 두었다(스케줄러 자신의 기동 sweep) — 재적용은 않되 recovering 표시는 반드시 푼다.
        # (예전엔 여기서 그냥 return → pick() 이 이 작업을 영영 건너뜀. 중복 sweep 이 resume_seq 2 로 풀어 주던 것이 가려져 있었다)
        if r().hdel(f"job:{job_id}", "recovering"):
            log(WHO, f"resume {job_id} 이미 restore 됨(resume_seq {seq}) · recovering 해제 · 커서 {cur.get('cursor')}/{cur.get('total')}")
        return
    active[job_id] = {"pool": pool, "priority": int(jh.get("priority", 0)), "tenant": jh.get("tenant_id"), "total": total, "cursor": 0,
                      "started": True, "created": float(jh.get("queued_at_ms", 0)) / 1000, "resume_seq": seq}
    r().hset(f"job:{job_id}", mapping={"cursor": 0})
    r().hdel(f"job:{job_id}", "recovering")
    log(WHO, f"resume {job_id} 미완료 {total} shard (resume_seq {seq})")
    if total == 0:
        active.pop(job_id, None)


def admit(pool: str):
    """jobs:{pool} 새 작업·재개 항목 받기."""
    stream = f"jobs:{pool}"
    bus.ensure_group(stream, "g:sched")
    res = r().xreadgroup("g:sched", "sched-0", {stream: ">"}, count=10, block=100)
    for _, entries in res or []:
        for eid, f in entries:
            job_id = f["job_id"]
            jh = bus.job(job_id)
            if not jh or jh.get("state") in ("cancelled", "failed", "done"):
                r().xack(stream, "g:sched", eid)
                continue
            if f.get("resume"):
                _resume(pool, job_id, jh, int(f["resume"]))
                r().xack(stream, "g:sched", eid)
                continue
            t0 = time.time()
            try:
                sh = plan(job_id)
            except Exception as e:
                log(WHO, "plan fail", job_id, repr(e))
                r().hset(f"job:{job_id}", mapping={"state": "failed", "error": f"plan: {e}", "finished_at": now_iso()})
                emit(job_id, "job.failed", {"job_id": job_id, "error": f"plan: {e}", "at": now_iso()})
                ops_event("job.state", {"job_id": job_id, "tenant_id": jh.get("tenant_id"), "state": "failed",
                                        "aoi_centroid": json.loads(jh.get("centroid") or "null"), "pool": pool, "at": now_iso()})
                r().xack(stream, "g:sched", eid)
                continue
            k = f"jobshards:{job_id}"
            r().delete(k)
            for i in range(0, len(sh), 2000):
                r().rpush(k, *[json.dumps(s, ensure_ascii=False) for s in sh[i:i + 2000]])
            r().expire(k, 7 * 86400)
            r().hset(f"job:{job_id}", mapping={"shards_total": len(sh), "cursor": 0})
            active[job_id] = {"pool": pool, "priority": int(jh.get("priority", 0)), "tenant": jh.get("tenant_id"), "total": len(sh),
                              "cursor": 0, "started": False, "created": float(jh.get("queued_at_ms", 0)) / 1000,
                              "resume_seq": int(jh.get("resume_seq") or 0), "slow": is_slow(pool, jh)}
            log(WHO, f"admit {job_id} kind={jh.get('kind')} model={jh.get('model_id')} adapter={jh.get('adapter') or '-'} shards={len(sh)} "
                     f"plan {int((time.time()-t0)*1000)}ms P{jh.get('priority')}")
            r().xack(stream, "g:sched", eid)
            if not sh:
                r().xadd("finalize:cpu:small", {"job_id": job_id, "by": WHO, "at": now_iso()})
                active.pop(job_id, None)


def is_slow(pool: str, jh: dict) -> bool:
    """cpu 풀에서 shard 중앙값 ≥ slow_shard_ms(기본 5 s)인 어댑터 작업 — PC 원격 NDVI(25–56 s/shard · 2026-09-27 실측) 등."""
    if pool != "cpu":
        return False
    lim = float((POOLS.get("cpu") or {}).get("slow_shard_ms", 5000))
    key = jh.get("adapter") or ""
    if not key and jh.get("model_id"):
        try:
            with bus.pg() as conn:
                row = conn.execute("SELECT adapter FROM models WHERE id=%s", (jh.get("model_id"),)).fetchone()
            key = (row[0] if row else "") or ""
        except Exception:
            key = ""
    med = _median_ms(key) if key else None
    return bool(med and med >= lim)


def _running_of(tenant: str) -> int:
    return sum(1 for j in active.values() if j["tenant"] == tenant and j["started"])


_conc = {"t": 0.0, "lim": {}}


def conc_limits() -> dict:
    if time.time() - _conc["t"] > 60:
        try:
            with bus.pg() as conn:
                rows = conn.execute("SELECT tenant_id, hard FROM quotas WHERE dim='concurrent_jobs' AND hard IS NOT NULL").fetchall()
            _conc["lim"] = {t: int(h) for t, h in rows}
        except Exception:
            pass
        _conc["t"] = time.time()
    return _conc["lim"]


def pick(pool: str, only_new: bool = False) -> str | None:
    cand = []
    lim = conc_limits()
    for jid, j in active.items():
        if j["pool"] != pool or j["cursor"] >= j["total"]:
            continue
        if only_new and j["started"]:
            continue
        if not j["started"] and j["tenant"] in lim and _running_of(j["tenant"]) >= lim[j["tenant"]]:
            continue            # 동시 작업 한도 — 앞 작업이 끝날 때까지 대기(queue)
        jh = bus.job(jid)
        if jh.get("state") in ("cancelled", "failed") or jh.get("recovering") == "1":
            continue
        if j.get("slow") and j["cursor"] - int(jh.get("shards_done") or 0) - int(jh.get("shards_failed") or 0) >= 1:
            continue            # 느린 shard 작업(원격 지수 등 · 중앙값 ≥ slow_shard_ms)은 한 번에 1 shard — 다른 cpu 워커가 빠른 작업(실태조사 39칸)을 굶지 않게
        j["priority"] = int(jh.get("priority", j["priority"]))
        # (1) 우선순위 (2) 아직 시작 안 한 작업의 첫 묶음 선점(v1.1-17 · 동시 3건 첫 shard ≤ 8s) (3) 기관 deficit
        # (4) 지금까지 배정한 shard 수가 적은 작업(작업 단위 공정 분배 — 8만 shard 전역 뒤에 143 shard 도엽 작업이 줄 서지 않게)
        cand.append((j["priority"], 1 if j["started"] else 0, deficit.get(j["tenant"], 0), j["cursor"], j["created"], jid))
    if not cand:
        return None
    cand.sort()
    return cand[0][-1]


def _dispatch(pool: str, jid: str, n: int) -> int:
    j = active[jid]
    if j.get("slow"):
        n = 1
    stream = f"shards:{pool}"
    items = r().lrange(f"jobshards:{jid}", j["cursor"], j["cursor"] + n - 1)
    if not items:
        j["cursor"] = j["total"]
        return 0
    # job.started 는 첫 shard 를 스트림에 넣기 **전에** 발행 — 빠른 CPU 워커(survey 39칸)가 shard.done 을 먼저 내지 않게(F2-B must_fix · infer 와 같은 순서)
    if not j["started"]:
        j["started"] = True
        now = now_iso()
        ws = sorted(h.split(":")[1] for h in r().scan_iter(match="worker:*:hb") if r().hget(h, "pool") == pool)
        r().hset(f"job:{jid}", mapping={"state": "running", "started_at": now, "started_ts": time.time()})
        emit(jid, "job.started", {"job_id": jid, "shards_total": int(bus.job(jid).get("shards_total") or j["total"]), "workers": ws, "at": now})
        jh = bus.job(jid)
        ops_event("job.state", {"job_id": jid, "tenant_id": jh.get("tenant_id"), "state": "running",
                                "aoi_centroid": json.loads(jh.get("centroid") or "null"), "pool": pool, "at": now})
        log(WHO, f"job.started {jid} shards {j['total']} workers {ws}")
    pipe = r().pipeline()
    for it in items:
        s = json.loads(it)
        pipe.xadd(stream, {"job_id": jid, "shard_id": s["shard_id"], "bbox": json.dumps(s["bbox"]),
                           "window": json.dumps(s.get("window")), "params": json.dumps(s.get("params"), ensure_ascii=False), "attempt": 0})
    pipe.execute()
    j["cursor"] += len(items)
    r().hset(f"job:{jid}", "cursor", j["cursor"])
    deficit[j["tenant"]] = deficit.get(j["tenant"], 0) + len(items)
    if j["cursor"] >= j["total"]:
        log(WHO, f"{jid} 모든 shard 배정 완료({j['total']})")
    return len(items)


def fill(pool: str, cfg: dict):
    stream = f"shards:{pool}"
    lw, chunk = int(cfg.get("low_watermark", 48)), int(cfg.get("fill_chunk", 64))
    # 첫 묶음 선점: 새 작업은 깊이와 상관없이 첫 FIRST_CHUNK 를 바로(스트림 꼬리 — 앞의 ≤ lw+chunk 만 기다림)
    for _ in range(4):
        jid = pick(pool, only_new=True)
        if not jid:
            break
        _dispatch(pool, jid, min(FIRST_CHUNK, chunk))
    try:
        depth = r().xlen(stream)
    except Exception:
        depth = 0
    guard = 0
    while depth < lw and guard < 4:
        guard += 1
        jid = pick(pool)
        if not jid:
            return
        depth += _dispatch(pool, jid, chunk)


def _median_ms(key: str) -> float | None:
    v = [int(x) for x in r().lrange(f"perf:shard_ms:{key}", 0, 99)]
    return statistics.median(v) if v else None


def orphan_watch():
    """shard 고아 감시(v1.1-14)."""
    now = time.time()
    for pool in POOLS:
        k = f"inflight:{pool}"
        for f, v in r().hgetall(k).items():
            try:
                rec = json.loads(v)
            except Exception:
                r().hdel(k, f)
                continue
            job_id, shard_id = f.split("|", 1)
            if rec.get("requeued") and not rec.get("worker"):
                continue            # 재배정 뒤 아직 어느 워커도 집지 않음(대기열) — 시작된 시도만 시간을 잰다
            jh = bus.job(job_id)
            if not jh or jh.get("state") not in ("running", "queued"):
                r().hdel(k, f)
                continue
            opts = json.loads(jh.get("options") or "{}")
            med = _median_ms(jh.get("adapter") or jh.get("kind") or pool)
            limit = max(ORPHAN_FLOOR_S, 5 * (med or 0) / 1000)
            if config.DEV and opts.get("orphan_timeout_s"):
                limit = float(opts["orphan_timeout_s"])          # 테스트(강제 sleep 어댑터)만 — 개발 모드
            age = now - float(rec.get("ts") or now)
            if age <= limit:
                continue
            if r().sismember(f"job:{job_id}:done", shard_id):
                r().hdel(k, f)
                continue
            att = int(rec.get("attempt") or 0)
            if att >= 1:
                # 재배정한 것도 시간 초과 → shard 실패 → 작업 실패
                r().hdel(k, f)
                if r().sadd(f"job:{job_id}:failed", shard_id):
                    r().hincrby(f"job:{job_id}", "shards_failed", 1)
                emit(job_id, "shard.failed", {"job_id": job_id, "shard_id": shard_id, "error": "timeout", "retry": att + 1,
                                              "final": True, "age_s": round(age, 1), "limit_s": round(limit, 1), "at": now_iso(ms=True)})
                nowi = now_iso()
                r().hset(f"job:{job_id}", mapping={"state": "failed", "error": f"shard_timeout {shard_id}", "finished_at": nowi})
                emit(job_id, "job.failed", {"job_id": job_id, "error": f"shard_timeout {shard_id}", "at": nowi})
                ops_event("job.state", {"job_id": job_id, "tenant_id": jh.get("tenant_id"), "state": "failed", "reason": "shard_timeout",
                                        "aoi_centroid": json.loads(jh.get("centroid") or "null"), "pool": pool, "at": nowi})
                try:
                    with bus.pg() as conn:
                        bus.lx_tx(conn)
                        conn.execute("UPDATE jobs SET state='failed', error=%s, finished_at=now() WHERE id=%s", (f"shard_timeout {shard_id}", job_id))
                        conn.commit()
                except Exception as e:
                    log(WHO, "orphan db error", repr(e))
                log(WHO, f"orphan {job_id}/{shard_id} 재시도도 {age:.0f}s 초과 → job failed")
                continue
            entry = dict(rec.get("entry") or {})
            entry["attempt"] = 1
            entry["job_id"], entry["shard_id"] = job_id, shard_id
            r().hset(k, f, json.dumps({"entry": entry, "attempt": 1, "ts": now, "worker": None, "requeued": True}, ensure_ascii=False))
            r().xadd(f"shards:{pool}", {kk: (vv if isinstance(vv, str) else json.dumps(vv, ensure_ascii=False)) for kk, vv in entry.items()})
            emit(job_id, "shard.failed", {"job_id": job_id, "shard_id": shard_id, "error": "timeout", "retry": 1, "worker": rec.get("worker"),
                                          "age_s": round(age, 1), "limit_s": round(limit, 1), "at": now_iso(ms=True)})
            log(WHO, f"orphan {job_id}/{shard_id} {age:.0f}s > {limit:.0f}s (워커 {rec.get('worker')}) → shard.failed timeout · 재배정 1회")


def sync_db():
    """Redis 미러 → jobs 표(2s)."""
    ids = [k.split(":")[1] for k in r().scan_iter(match="job:job_*") if k.count(":") == 1]
    if not ids:
        return
    with bus.pg() as conn:
        bus.lx_tx(conn)
        for jid in ids:
            h = bus.job(jid)
            if not h or h.get("synced_state") == h.get("state") == "done" or h.get("synced_state") == "final":
                continue
            counts = {k: int(v) for k, v in r().hgetall(f"job:{jid}:counts").items()} or json.loads(h.get("counts") or "{}")
            conn.execute("UPDATE jobs SET state=%s, shards_total=%s, shards_done=%s, shards_failed=%s, counts=%s, gpu_s=%s, workers=%s, "
                         "started_at=COALESCE(started_at, %s::timestamptz), error=COALESCE(%s::text, error), "
                         "finished_at=CASE WHEN %s::text IN ('failed','cancelled') THEN COALESCE(finished_at, now()) ELSE finished_at END "
                         "WHERE id=%s AND state NOT IN ('done','cancelled','failed')",
                         (h.get("state"), int(h.get("shards_total") or 0), int(h.get("shards_done") or 0), int(h.get("shards_failed") or 0),
                          json.dumps(counts, ensure_ascii=False), float(h.get("gpu_s") or 0), json.loads(h.get("workers") or "[]"),
                          h.get("started_at") or None, h.get("error") or None, h.get("state"), jid))
            if h.get("state") in ("done", "cancelled", "failed"):
                r().hset(f"job:{jid}", "synced_state", "final")
        conn.commit()


def restore():
    """재시작 시: ① 재부팅 복구 sweep(게이트웨이와 같은 함수 · 멱등) ② 진행 중이던 작업의 커서를 되살린다."""
    try:
        from workers.recovery import sweep
        st = sweep(WHO)
        log(WHO, f"recovery sweep: resumed {st['resumed']} · requeued {st['requeued']} · failed {st['failed']}"
                 + (f" (skipped — {st.get('held_by')} 가 진행 중)" if st.get("skipped") else ""))
    except Exception as e:
        log(WHO, "recovery sweep error", repr(e))
    for k in r().scan_iter(match="jobshards:*"):
        jid = k.split(":", 1)[1]
        jh = bus.job(jid)
        if not jh or jh.get("state") in ("done", "cancelled", "failed"):
            continue
        total = r().llen(k)
        cur = int(jh.get("cursor") or 0)
        if cur < total:
            active[jid] = {"pool": jh.get("pool"), "priority": int(jh.get("priority", 0)), "tenant": jh.get("tenant_id"), "total": total,
                           "cursor": cur, "started": jh.get("state") == "running", "created": float(jh.get("queued_at_ms", 0)) / 1000,
                           "resume_seq": int(jh.get("resume_seq") or 0), "slow": is_slow(jh.get("pool"), jh)}
            if jh.get("recovering") == "1":
                r().hdel(f"job:{jid}", "recovering")      # 복구 sweep 이 방금 다시 적은 계획을 restore 가 그대로 이어받는다
            log(WHO, f"restore {jid} cursor {cur}/{total}")


def main():
    log(WHO, "start · pools", list(POOLS), f"· 첫 묶음 {FIRST_CHUNK} · 고아 감시 {ORPHAN_SCAN_S:.0f}s(하한 {ORPHAN_FLOOR_S:.0f}s)")
    restore()
    last_sync = last_orphan = 0.0
    while True:
        for pool, cfg in POOLS.items():
            try:
                admit(pool)
                fill(pool, cfg)
            except bus.REDIS_ERRORS as e:
                bus.redis_hiccup(WHO, e)
            except Exception as e:
                log(WHO, "loop error", pool, repr(e))
        for jid in [j for j, v in active.items() if v["cursor"] >= v["total"]]:
            active.pop(jid, None)
        if time.time() - last_sync > 2:
            last_sync = time.time()
            try:
                sync_db()
            except Exception as e:
                log(WHO, "sync error", repr(e))
        if time.time() - last_orphan > ORPHAN_SCAN_S:
            last_orphan = time.time()
            try:
                orphan_watch()
            except Exception as e:
                log(WHO, "orphan watch error", repr(e))
        time.sleep(0.05)


if __name__ == "__main__":
    main()
