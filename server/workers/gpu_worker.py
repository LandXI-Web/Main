"""GPU 워커 — GPU 1장 = 프로세스 1(F1-CONTRACT §7 · 설계서 §3.3).

python server/workers/gpu_worker.py --gpu 0     (run-workers.ps1 이 CUDA_VISIBLE_DEVICES 를 같이 건다)

시작: nvidia-smi → 예산 = total − used − 2,048 MiB(외부 Ollama 점유는 used 에 들어 있다 · 절대 건드리지 않음)
      → torch.cuda.set_per_process_memory_fraction → 어댑터 스캔 → 상주 모델 적재(pools.yaml resident).
루프: XREADGROUP g:workers shards:{pool} → job 별 묶음 → 창 읽기(스레드) → 어댑터 run_batch → shard 마다
      GeoJSON 파일 · detections(demo 제외) · shard.done · 계량(usage_events · demo → lx-demo) · job.progress(≤1/s)
      → 마지막 shard 면 finalize:cpu 로 넘긴다. 30s 넘게 처리 안 된 항목은 XAUTOCLAIM 으로 회수.
"""
from __future__ import annotations

import argparse
import json
import os
import socket
import sys
import threading
import time
from collections import OrderedDict, deque
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ap = argparse.ArgumentParser()
ap.add_argument("--gpu", type=int, default=0)
ap.add_argument("--pool", default=None)
A = ap.parse_args()
os.environ.setdefault("CUDA_VISIBLE_DEVICES", str(A.gpu))

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from landxi_api import config  # noqa: E402
from workers import bus, vram  # noqa: E402
from workers.bus import emit, env, log, now_iso, ops_event, r  # noqa: E402
from workers.metering import meter  # noqa: E402
from workers.registry_scan import load_adapter, scan_adapters  # noqa: E402
from adapters.base import Shard, run_batch_default  # noqa: E402

POOL = A.pool or config.POOL
WID = f"{POOL}-{A.gpu}"
PCFG = config.load_yaml("pools")["pools"][POOL]
STREAM = f"shards:{POOL}"
GROUP = "g:workers"
BATCH = int(PCFG.get("batch", 16))
WHO = WID
PWR = config.load_yaml("pools").get("power", {}) or {}
MAX_HOT = int(PWR.get("max_hot_gpus", 1))
LEASE_TTL = int(PWR.get("lease_ttl_s", 20))
IDLE_RELEASE = float(PWR.get("idle_release_s", 3))
lease = {"slot": None, "last_work": 0.0, "waiting": False}


# ── 전력 예산: 동시 고부하 GPU ≤ max_hot_gpus (Redis 임대 power:hot:{slot}) ─────────
def power_acquire() -> bool:
    if lease["slot"] is not None:
        k = f"power:hot:{lease['slot']}"
        if r().get(k) == WID:
            r().expire(k, LEASE_TTL)
            return True
        lease["slot"] = None
    for i in range(MAX_HOT):
        if r().set(f"power:hot:{i}", WID, nx=True, ex=LEASE_TTL):
            lease["slot"], lease["waiting"] = i, False
            lease["last_work"] = time.time()
            log(WHO, f"power lease power:hot:{i} 획득 · 동시 고부하 GPU ≤ {MAX_HOT}")
            return True
    if not lease["waiting"]:
        lease["waiting"] = True
        holders = [r().get(f"power:hot:{i}") for i in range(MAX_HOT)]
        log(WHO, f"power lease 대기 · 보유 {holders} · 동시 고부하 GPU ≤ {MAX_HOT}(전력 예산)")
    return False


def power_release(reason: str = "idle"):
    if lease["slot"] is None:
        return
    k = f"power:hot:{lease['slot']}"
    if r().get(k) == WID:
        r().delete(k)
    log(WHO, f"power lease {k} 반납({reason})")
    lease["slot"] = None

state = {"job_id": None, "budget": 0, "external": 0, "gpu_util": {}, "gpu_mem": {}}
models: "OrderedDict[str, tuple]" = OrderedDict()   # model_id → (adapter, meta, mib)
_local = threading.local()


# ── 창 읽기 ──────────────────────────────────────────────────────────────────
def _ds(path: str):
    import rasterio
    c = getattr(_local, "ds", None)
    if c is None:
        c = _local.ds = {}
    d = c.get(path)
    if d is None:
        d = c[path] = rasterio.open(path)
    return d


def read_window(path: str, w: dict):
    from rasterio.windows import Window
    ds = _ds(path)
    win = Window(w["col_off"], w["row_off"], w["width"], w["height"])
    arr = ds.read(indexes=[1, 2, 3], window=win, boundless=True, fill_value=0)
    if ds.count >= 4:
        alpha = ds.read(4, window=win, boundless=True, fill_value=0)
        if alpha.max() == 0:
            return None, ds.window_transform(win), ds.crs.to_epsg()
    elif arr.max() == 0:
        return None, ds.window_transform(win), ds.crs.to_epsg()
    return arr.transpose(1, 2, 0), ds.window_transform(win), ds.crs.to_epsg()


def imagery_path(imagery_id: str) -> str:
    c = getattr(_local, "img", None)
    if c is None:
        c = _local.img = {}
    if imagery_id not in c:
        with bus.pg() as conn:
            row = conn.execute("SELECT path_internal FROM imagery WHERE id=%s", (imagery_id,)).fetchone()
        p = row[0]
        c[imagery_id] = p if (":" in p[:3] or os.path.isabs(p)) else str(config.DATA_ROOT / p)
    return c[imagery_id]


# ── 모델 상주(LRU) ─────────────────────────────────────────────────────────────
def model_row(mid: str) -> dict:
    with bus.pg() as conn:
        row = conn.execute("SELECT id, weights_uri, task, tile_size, adapter, classes FROM models WHERE id=%s", (mid,)).fetchone()
    if not row:
        raise KeyError(mid)
    return {"id": row[0], "weights_uri": row[1], "task": row[2], "tile_size": row[3], "adapter": row[4], "classes": row[5]}


def ensure_model(mid: str):
    import torch
    if mid in models:
        models.move_to_end(mid)
        return models[mid]
    while len(models) >= int(PCFG.get("lru_max", 3)):
        old, (ad, _, _) = models.popitem(last=False)
        ad.unload()
        torch.cuda.empty_cache()
        log(WHO, "unload", old)
    m = model_row(mid)
    ad, meta = load_adapter(m["adapter"])
    before = torch.cuda.memory_reserved() / 2**20
    t0 = time.time()
    ad.load(m, "cuda:0", state["budget"])
    mib = torch.cuda.memory_reserved() / 2**20 - before
    models[mid] = (ad, meta, mib)
    log(WHO, f"load {mid} via {meta['id']} · {time.time()-t0:.1f}s · +{mib:.0f} MiB")
    return models[mid]


# ── 백그라운드: 하트비트 · VRAM · nvidia-smi ─────────────────────────────────────
def heartbeat():
    host = socket.gethostname()
    joined = now_iso()
    while True:
        try:
            now = time.time()
            r().hset(f"worker:{WID}:hb", mapping={"id": WID, "pool": POOL, "device": "gpu", "gpu": A.gpu, "ts": now, "pid": os.getpid(),
                                                  "job_id": state["job_id"] or "", "node": config.NODE_ID})
            r().expire(f"worker:{WID}:hb", 30)
            ws = sorted(k.split(":")[1] for k in r().scan_iter(match="worker:*:hb"))
            r().hset(f"node:{config.NODE_ID}", mapping={"hostname": host, "last_seen": now_iso(), "joined_at": joined, "workers": json.dumps(ws)})
            r().expire(f"node:{config.NODE_ID}", 30)
        except Exception as e:  # pragma: no cover
            log(WHO, "hb error", e)
        time.sleep(10)


def vram_reporter():
    import torch
    while True:
        try:
            r().hset(f"worker:{WID}:vram", mapping={"budget_mib": state["budget"], "used_mib": round(torch.cuda.memory_reserved() / 2**20),
                                                    "model_id": next(reversed(models)) if models else "", "models": json.dumps(list(models)),
                                                    "model_mib": json.dumps({k: round(v[2]) for k, v in models.items()}), "at": now_iso()})
            r().expire(f"worker:{WID}:vram", 30)
        except Exception:
            pass
        time.sleep(2)


def smi_sampler():
    while True:
        try:
            for g in vram.query_raw():          # 표시용 — nvidia-smi 그대로(WDDM 연결 어댑터면 mem 은 두 장이 같은 값)
                state["gpu_util"][g["index"]] = g["util"]
                state["gpu_mem"][g["index"]] = g["used"]
        except Exception:
            pass
        time.sleep(1)


# ── 진행 이벤트 ────────────────────────────────────────────────────────────────
def progress(job_id: str, jh: dict):
    if not r().set(f"job:{job_id}:progress_lock", WID, nx=True, px=900):
        return
    now = time.time()
    k = f"job:{job_id}:ts"
    r().zremrangebyscore(k, 0, now - 10)
    n10 = r().zcount(k, now - 10, now)
    first = float(jh.get("first_done_ts") or now)
    span = min(10.0, max(now - first, 0.5))
    cps = round(n10 / span, 2) if n10 else None
    counts = {kk: int(v) for kk, v in r().hgetall(f"job:{job_id}:counts").items()}
    done = int(r().hget(f"job:{job_id}", "shards_done") or 0)
    total = int(jh.get("shards_total") or 0)
    started = float(jh.get("started_ts") or now)
    if cps is not None:
        r().hset(f"job:{job_id}", "chips_per_s", cps)
    r().hset(f"job:{job_id}", "counts", json.dumps(counts, ensure_ascii=False))
    emit(job_id, "job.progress", {
        "job_id": job_id, "shards_done": done, "shards_total": total, "counts": counts,
        "chips_per_s": env(cps, "chips_per_s", "measured", "gpu_worker 계량(창 10s · 전 워커 합)", None if cps else "첫 shard 뒤 채워짐"),
        "elapsed_s": round(now - started, 1),
        "gpu": [{"index": i, "util_pct": state["gpu_util"].get(i), "mem_used_mib": state["gpu_mem"].get(i)} for i in sorted(state["gpu_util"])],
        "at": now_iso(ms=True)})


def fc_of(dets, job_id: str, shard_id: str) -> dict:
    from shapely.geometry import mapping
    feats = []
    for i, d in enumerate(dets):
        fid = f"{shard_id}-{i}"
        feats.append({"type": "Feature", "id": fid, "geometry": mapping(d.geom4326),
                      "properties": {"id": fid, "cls": d.cls, "cls_en": d.cls_en, "cid": d.cid, "conf": d.conf, "area_m2": None,
                                     "emd": None, "emd_cd": None, "edit_state": "raw", "job_id": job_id, "shard_id": shard_id,
                                     "chip_edge": bool(d.attrs.get("chip_edge"))}})
    return {"type": "FeatureCollection", "features": feats}


def write_db(conn, job_id: str, tenant: str, rows: list[tuple]):
    """rows = (shard_id, fid, cls, cls_en, cid, conf, area_m2, chip_edge, ewkb_hex) — shard 단위 멱등(지우고 다시)."""
    from psycopg import sql  # noqa: F401
    bus.lx_tx(conn)
    shard_ids = sorted({x[0] for x in rows})
    if shard_ids:
        conn.execute("DELETE FROM detections WHERE job_id=%s AND shard_id = ANY(%s)", (job_id, shard_ids))
    with conn.cursor().copy("COPY detections (tenant_id, job_id, shard_id, fid, cls, cls_en, cid, conf, area_m2, chip_edge, edit_state, geom) FROM STDIN") as cp:
        for x in rows:
            cp.write_row((tenant, job_id, x[0], x[1], x[2], x[3], x[4], x[5], x[6], x[7], "raw", x[8]))


def area_m2(g) -> float:
    from pyproj import Geod
    return abs(Geod(ellps="GRS80").geometry_area_perimeter(g)[0])


# ── 처리 ──────────────────────────────────────────────────────────────────────
pool_io = ThreadPoolExecutor(max_workers=8, thread_name_prefix="rd")
conn_db = None


def process(job_id: str, entries: list[tuple[str, dict]]):
    global conn_db
    from shapely import set_srid, to_wkb
    from shapely.geometry import MultiPolygon
    jh = bus.job(job_id)
    ids = [e[0] for e in entries]
    if not jh or jh.get("state") in ("cancelled", "failed", "done"):
        r().xack(STREAM, GROUP, *ids)
        r().xdel(STREAM, *ids)
        return
    demo = jh.get("demo") == "1"
    tenant = jh.get("tenant_id")
    opts = json.loads(jh.get("options") or "{}")
    mid = jh.get("model_id")
    ad, meta, _ = ensure_model(mid)
    path = imagery_path(jh.get("imagery_id"))
    state["job_id"] = job_id
    if not r().hget(f"job:{job_id}", "worker_seen:" + WID):
        r().hset(f"job:{job_id}", "worker_seen:" + WID, 1)
        ws = json.loads(r().hget(f"job:{job_id}", "workers") or "[]")
        if WID not in ws:
            ws.append(WID)
            r().hset(f"job:{job_id}", "workers", json.dumps(sorted(ws)))
        bus.lane(WID, {"job_id": job_id, "from": now_iso(), "to": None, "state": "running", "tenant_id": tenant})
    shards = []
    for eid, f in entries:
        w = json.loads(f.get("window") or "null")
        s = Shard(f["shard_id"], job_id, tuple(json.loads(f["bbox"])), w, json.loads(f.get("params") or "null"))
        shards.append(s)
        emit(job_id, "shard.started", {"job_id": job_id, "shard_id": s.id, "bbox": list(s.bbox4326), "worker": WID, "at": now_iso(ms=True)})
    t0 = time.perf_counter()
    futs = {s.id: pool_io.submit(read_window, path, s.window) for s in shards}
    cache = {}

    def reader(s):
        if s.id not in cache:
            cache[s.id] = futs[s.id].result()
        return cache[s.id]

    for s in shards:           # 창 읽기를 먼저 끝낸다(모델 시간과 분리 계량)
        reader(s)
    t_read = time.perf_counter() - t0
    run = getattr(ad, "run_batch", None)
    results = run(shards, reader, opts) if run else run_batch_default(ad, shards, reader, opts)
    t_all = time.perf_counter() - t0
    per_ms = int(t_all * 1000 / max(1, len(shards)))
    sdir = bus.shard_dir(tenant, job_id, demo)
    sdir.mkdir(parents=True, exist_ok=True)
    rows = []
    done_now = []
    for s, res in zip(shards, results):
        fc = fc_of(res.features, job_id, s.id)
        for ft, d in zip(fc["features"], res.features):
            a = round(area_m2(d.geom4326), 2)
            ft["properties"]["area_m2"] = a
            if not demo:
                mp = d.geom4326 if d.geom4326.geom_type == "MultiPolygon" else MultiPolygon([d.geom4326])
                rows.append((s.id, ft["id"], d.cls, d.cls_en, d.cid, d.conf, a, bool(d.attrs.get("chip_edge")),
                             to_wkb(set_srid(mp, 4326), hex=True, include_srid=True)))
        (sdir / f"{s.id}.geojson").write_text(json.dumps(fc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        done_now.append((s, res))
    if conn_db is None or conn_db.closed:
        conn_db = bus.pg()
    try:
        if rows:
            write_db(conn_db, job_id, tenant, rows)
        meter(conn_db, tenant=tenant, demo=demo, job_id=job_id, dim="gpu_s", amount=round(t_all, 3))
        conn_db.commit()
    except Exception as e:
        conn_db.rollback()
        log(WHO, "db error", e)
        raise
    now = time.time()
    for s, res in done_now:
        new = r().sadd(f"job:{job_id}:done", s.id)
        if new:
            r().hincrby(f"job:{job_id}", "shards_done", 1)
            r().zadd(f"job:{job_id}:ts", {f"{s.id}:{now}": now})
            classes = {}
            for d in res.features:
                classes[d.cls_en] = classes.get(d.cls_en, 0) + 1
            for k, v in classes.items():
                r().hincrby(f"job:{job_id}:counts", k, v)
            r().hsetnx(f"job:{job_id}", "first_done_ts", now)
            emit(job_id, "shard.done", {"job_id": job_id, "shard_id": s.id, "bbox": list(s.bbox4326), "n": res.n, "classes": classes,
                                        "polys_url": f"/api/v1/results/{job_id}/shards/{s.id}.geojson?{bus.sign('shards/' + job_id)}",
                                        "ms": per_ms, "worker": WID,
                                        "at": now_iso(ms=True)})
            log(WHO, f"shard.done {s.id} n={res.n} {per_ms}ms {WID}")
    r().xack(STREAM, GROUP, *ids)
    r().xdel(STREAM, *ids)
    jh = bus.job(job_id)
    progress(job_id, jh)
    done = int(jh.get("shards_done") or 0)
    failed = int(jh.get("shards_failed") or 0)
    total = int(jh.get("shards_total") or 0)
    if total and done + failed >= total and r().set(f"job:{job_id}:finalize", WID, nx=True):
        r().xadd("finalize:cpu", {"job_id": job_id, "by": WID, "at": now_iso()})
        bus.lane(WID, {"job_id": job_id, "to": now_iso(), "state": "done"})
        log(WHO, f"job {job_id} 전 shard 완료 → finalize:cpu (read {t_read*1000:.0f}ms/batch)")
    state["job_id"] = None


def fail(job_id: str, entries, err: str):
    for eid, f in entries:
        att = int(f.get("attempt", 0))
        if att < 2:
            r().xadd(STREAM, {**f, "attempt": att + 1})
        else:
            if r().sadd(f"job:{job_id}:failed", f["shard_id"]):
                r().hincrby(f"job:{job_id}", "shards_failed", 1)
        emit(job_id, "shard.failed", {"job_id": job_id, "shard_id": f["shard_id"], "error": err, "retry": att + 1, "at": now_iso(ms=True)})
    ids = [e[0] for e in entries]
    r().xack(STREAM, GROUP, *ids)
    r().xdel(STREAM, *ids)


def control():
    try:
        res = r().xread({f"control:{WID}": r().hget(f"worker:{WID}:ctl", "last") or "$"}, count=10, block=1)
    except Exception:
        return
    for _, entries in res or []:
        for eid, f in entries:
            r().hset(f"worker:{WID}:ctl", "last", eid)
            try:
                if f["action"] == "load":
                    ensure_model(f["model_id"])
                elif f["action"] == "unload" and f["model_id"] in models:
                    ad, _, _ = models.pop(f["model_id"])
                    ad.unload()
                    import torch
                    torch.cuda.empty_cache()
                log(WHO, "control", f)
            except Exception as e:
                log(WHO, "control error", e)


def main():
    import torch
    g = vram.query(A.gpu)[0]
    allp = [p for x in vram.query() for p in x.external_procs]      # WDDM: GPU 별 귀속이 불안정 — 노드 전체 외부 프로세스로 표기
    budget = vram.budget_mib(g.total_mib, g.used_mib)
    state["budget"], state["external"] = budget, g.used_mib
    torch.cuda.set_per_process_memory_fraction(max(0.05, budget / g.total_mib), 0)
    log(WHO, f"{g.name} {g.mode} · free {vram.fmt(g.total_mib - g.used_mib)} MiB · vram budget {vram.fmt(budget)} MiB(free − "
             f"{vram.fmt(config.VRAM_RESERVE_MIB)}) · external {vram.fmt(g.used_mib)} MiB({vram.external_label(allp)}) · total {vram.fmt(g.total_mib)}")
    ads = scan_adapters()
    log(WHO, "adapters:", ", ".join(f"{k}({v['_scope']}·{v.get('device')})" for k, v in ads.items()))
    for t in (heartbeat, vram_reporter, smi_sampler):
        threading.Thread(target=t, daemon=True).start()
    for mid in PCFG.get("resident", []):
        try:
            ensure_model(mid)
        except Exception as e:
            log(WHO, "resident load fail", mid, e)
    bus.ensure_group(STREAM, GROUP)
    log(WHO, f"ready · {STREAM} · batch {BATCH}")
    last_claim = 0.0
    while True:
        try:
            last_claim = loop_once(last_claim)
        except bus.REDIS_ERRORS as e:
            bus.redis_hiccup(WHO, e)


def loop_once(last_claim: float) -> float:
    import torch
    if True:
        control()
        if lease["slot"] is None and r().xlen(STREAM) == 0:
            time.sleep(0.3)          # 일이 없으면 임대를 잡지 않는다(유휴 GPU 는 전력 슬롯을 비워 둔다)
            return last_claim
        if not power_acquire():
            time.sleep(0.5)
            return last_claim
        res = r().xreadgroup(GROUP, WID, {STREAM: ">"}, count=BATCH, block=1000)
        entries = res[0][1] if res else []
        if not entries and time.time() - last_claim > 5:
            last_claim = time.time()
            try:
                _, claimed, *_ = r().xautoclaim(STREAM, GROUP, WID, min_idle_time=30000, start_id="0-0", count=BATCH)
                entries = [(e, f) for e, f in claimed if f]
                if entries:
                    log(WHO, f"XAUTOCLAIM {len(entries)} (30s 넘게 처리 안 된 항목 회수)")
            except Exception:
                pass
        if not entries:
            if time.time() - lease["last_work"] > IDLE_RELEASE and r().xlen(STREAM) == 0:
                power_release("idle")
            return last_claim
        lease["last_work"] = time.time()
        byjob: dict[str, list] = {}
        for eid, f in entries:
            byjob.setdefault(f["job_id"], []).append((eid, f))
        for job_id, es in byjob.items():
            try:
                process(job_id, es)
            except RuntimeError as e:
                err = "cuda_oom" if "out of memory" in str(e).lower() else "vram_budget" if "vram_budget" in str(e) else "runtime"
                log(WHO, "shard error", job_id, e)
                torch.cuda.empty_cache()
                fail(job_id, es, err)
            except Exception as e:
                log(WHO, "shard error", job_id, repr(e))
                fail(job_id, es, type(e).__name__)
    return last_claim


if __name__ == "__main__":
    main()
