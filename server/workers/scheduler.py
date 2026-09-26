"""스케줄러 — jobs:{pool} → shard 목록(tiling) → 우선순위·기관 공정 분배로 shards:{pool} 를 '얕게' 채운다.

- 새 작업: XREADGROUP g:sched jobs:{pool} → shard 전부 계산해 Redis 목록 jobshards:{job} 에 둔다(커서 = 보낸 수).
- 채우기: shards:{pool} 깊이가 low_watermark 보다 얕으면 가장 급한 작업(priority 숫자 작은 것 → 같은 우선순위는 기관 deficit RR)
  에서 fill_chunk 만큼 XADD. 스트림을 얕게 유지하므로 P0 시연이 P1 대량 배치(J2b) 뒤에 줄 서지 않는다(선점 지연 ≈ 한 묶음).
- job.started(첫 배정) · job.state(관제) 발행 · 2s 마다 Redis 해시 → jobs 표 동기화 · 동시 작업 한도(concurrent_jobs) 집행.
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from landxi_api import config  # noqa: E402
from workers import bus  # noqa: E402
from workers.bus import emit, log, now_iso, ops_event, r  # noqa: E402
from workers.tiling import shards as mk_shards  # noqa: E402

WHO = "scheduler"
POOLS = {k: v for k, v in config.load_yaml("pools")["pools"].items() if v.get("state") != "pending"}
active: dict[str, dict] = {}        # job_id → {pool, priority, tenant, total, cursor}
deficit: dict[str, float] = {}      # tenant → 받은 shard 수(적을수록 먼저)


def _meta(path: str):
    import rasterio
    with rasterio.open(path) as ds:
        return {"width": ds.width, "height": ds.height, "transform": ds.transform, "crs": ds.crs.to_epsg() or 5186, "res": ds.res[0]}


def plan(job_id: str) -> list[dict]:
    jh = bus.job(job_id)
    opts = json.loads(jh.get("options") or "{}")
    kind = jh.get("kind")
    if kind == "index":
        params = opts.get("params") or {}
        months = params.get("months") or opts.get("months") or []
        aoi = json.loads(jh["aoi"]) if jh.get("aoi") else None
        return [{"shard_id": f"m{m}", "bbox": list(_bbox(aoi)) if aoi else [0, 0, 0, 0], "window": None,
                 "params": {**{k: v for k, v in params.items() if k != "months"}, "month": m, "aoi": aoi,
                            "cloud_max": params.get("cloud_max", 15)}} for m in months]
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


def _bbox(aoi):
    from shapely.geometry import shape
    return shape(aoi).bounds


def admit(pool: str):
    """jobs:{pool} 새 작업 받기."""
    stream = f"jobs:{pool}"
    bus.ensure_group(stream, "g:sched")
    res = r().xreadgroup("g:sched", "sched-0", {stream: ">"}, count=10, block=100)
    for _, entries in res or []:
        for eid, f in entries:
            job_id = f["job_id"]
            jh = bus.job(job_id)
            if not jh or jh.get("state") == "cancelled":
                r().xack(stream, "g:sched", eid)
                continue
            t0 = time.time()
            try:
                sh = plan(job_id)
            except Exception as e:
                log(WHO, "plan fail", job_id, repr(e))
                r().hset(f"job:{job_id}", mapping={"state": "failed", "error": f"plan: {e}", "finished_at": now_iso()})
                emit(job_id, "job.failed", {"job_id": job_id, "error": f"plan: {e}", "at": now_iso()})
                r().xack(stream, "g:sched", eid)
                continue
            k = f"jobshards:{job_id}"
            r().delete(k)
            for i in range(0, len(sh), 2000):
                r().rpush(k, *[json.dumps(s, ensure_ascii=False) for s in sh[i:i + 2000]])
            r().expire(k, 7 * 86400)
            r().hset(f"job:{job_id}", mapping={"shards_total": len(sh), "cursor": 0})
            active[job_id] = {"pool": pool, "priority": int(jh.get("priority", 0)), "tenant": jh.get("tenant_id"), "total": len(sh),
                              "cursor": 0, "started": False, "created": float(jh.get("queued_at_ms", 0)) / 1000}
            log(WHO, f"admit {job_id} kind={jh.get('kind')} model={jh.get('model_id')} shards={len(sh)} plan {int((time.time()-t0)*1000)}ms P{jh.get('priority')}")
            r().xack(stream, "g:sched", eid)
            if not sh:
                r().xadd("finalize:cpu", {"job_id": job_id, "by": WHO, "at": now_iso()})
                active.pop(job_id, None)


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


def pick(pool: str) -> str | None:
    cand = []
    lim = conc_limits()
    for jid, j in active.items():
        if j["pool"] != pool or j["cursor"] >= j["total"]:
            continue
        if not j["started"] and j["tenant"] in lim and _running_of(j["tenant"]) >= lim[j["tenant"]]:
            continue            # 동시 작업 한도 — 앞 작업이 끝날 때까지 대기(queue)
        jh = bus.job(jid)
        if jh.get("state") in ("cancelled", "failed"):
            continue
        j["priority"] = int(jh.get("priority", j["priority"]))
        # 같은 우선순위·같은 기관 안에서는 '지금까지 배정한 shard 수'가 적은 작업 먼저(작업 단위 공정 분배) —
        # 8만 shard 전역 재추론 뒤에 143 shard 도엽 작업이 한 시간 줄 서지 않게(2026-09-26 J2b A/B 실측).
        cand.append((j["priority"], deficit.get(j["tenant"], 0), j["cursor"], j["created"], jid))
    if not cand:
        return None
    cand.sort()
    return cand[0][-1]


def fill(pool: str, cfg: dict):
    stream = f"shards:{pool}"
    lw, chunk = int(cfg.get("low_watermark", 48)), int(cfg.get("fill_chunk", 64))
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
        j = active[jid]
        items = r().lrange(f"jobshards:{jid}", j["cursor"], j["cursor"] + chunk - 1)
        if not items:
            j["cursor"] = j["total"]
            continue
        pipe = r().pipeline()
        for it in items:
            s = json.loads(it)
            pipe.xadd(stream, {"job_id": jid, "shard_id": s["shard_id"], "bbox": json.dumps(s["bbox"]),
                               "window": json.dumps(s.get("window")), "params": json.dumps(s.get("params"), ensure_ascii=False), "attempt": 0})
        pipe.execute()
        j["cursor"] += len(items)
        r().hset(f"job:{jid}", "cursor", j["cursor"])
        deficit[j["tenant"]] = deficit.get(j["tenant"], 0) + len(items)
        depth += len(items)
        if not j["started"]:
            j["started"] = True
            now = now_iso()
            ws = sorted(h.split(":")[1] for h in r().scan_iter(match="worker:*:hb") if r().hget(h, "pool") == pool)
            r().hset(f"job:{jid}", mapping={"state": "running", "started_at": now, "started_ts": time.time()})
            emit(jid, "job.started", {"job_id": jid, "shards_total": j["total"], "workers": ws, "at": now})
            jh = bus.job(jid)
            ops_event("job.state", {"job_id": jid, "tenant_id": jh.get("tenant_id"), "state": "running",
                                    "aoi_centroid": json.loads(jh.get("centroid") or "null"), "pool": pool, "at": now})
            log(WHO, f"job.started {jid} shards {j['total']} workers {ws}")
        if j["cursor"] >= j["total"]:
            log(WHO, f"{jid} 모든 shard 배정 완료({j['total']})")


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
                         "started_at=COALESCE(started_at, %s::timestamptz) WHERE id=%s AND state NOT IN ('done','cancelled','failed')",
                         (h.get("state"), int(h.get("shards_total") or 0), int(h.get("shards_done") or 0), int(h.get("shards_failed") or 0),
                          json.dumps(counts, ensure_ascii=False), float(h.get("gpu_s") or 0), json.loads(h.get("workers") or "[]"),
                          h.get("started_at") or None, jid))
            if h.get("state") in ("done", "cancelled", "failed"):
                r().hset(f"job:{jid}", "synced_state", "final")
        conn.commit()


def restore():
    """재시작 시 진행 중이던 작업의 커서를 되살린다."""
    for k in r().scan_iter(match="jobshards:*"):
        jid = k.split(":", 1)[1]
        jh = bus.job(jid)
        if not jh or jh.get("state") in ("done", "cancelled", "failed"):
            continue
        total = r().llen(k)
        cur = int(jh.get("cursor") or 0)
        if cur < total:
            active[jid] = {"pool": jh.get("pool"), "priority": int(jh.get("priority", 0)), "tenant": jh.get("tenant_id"), "total": total,
                           "cursor": cur, "started": jh.get("state") == "running", "created": float(jh.get("queued_at_ms", 0)) / 1000}
            log(WHO, f"restore {jid} cursor {cur}/{total}")


def main():
    log(WHO, "start · pools", list(POOLS))
    restore()
    last_sync = 0.0
    while True:
        for pool, cfg in POOLS.items():
            try:
                admit(pool)
                fill(pool, cfg)
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
        time.sleep(0.05)


if __name__ == "__main__":
    main()
