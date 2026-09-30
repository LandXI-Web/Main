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
# 작업 종류별 shard 상한(S-8 · landxi_api.jobs.SHARD_CAP 와 같은 값 — 게이트웨이 견적이 먼저 too_large 로 거절)
SHARD_CAP = {"infer": 20000, "reinfer": 120000, "index": 120, "survey": 5000, "join": 5000, "tile": 2, "train": 1}
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
    if opts.get("scope") == "sgg":
        return plan_sgg(jh.get("imagery_id"), opts.get("sgg_cd"), center=opts.get("center"), chip=int(opts.get("chip", 1024)),
                        overlap=opts.get("overlap"), upsample=float(opts.get("upsample", 1) or 1))[1]
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


def imagery_meta(imagery_id: str) -> tuple[dict, dict | None]:
    """영상 → (래스터 메타, footprint GeoJSON). core-imagery 의 imagery_src.open_imagery 가 있으면 그것으로 연다(VRT · 가상 영상 공통)."""
    with bus.pg() as conn:
        row = conn.execute("SELECT path_internal, ST_AsGeoJSON(footprint)::text FROM imagery WHERE id=%s", (imagery_id,)).fetchone()
    if not row:
        raise RuntimeError(f"imagery {imagery_id} 없음")
    fp = json.loads(row[1]) if row[1] else None
    try:
        from workers.imagery_src import open_imagery  # core-imagery 계약
        ds = open_imagery(imagery_id)
        try:
            meta = {"width": ds.width, "height": ds.height, "transform": ds.transform, "crs": (ds.crs.to_epsg() if ds.crs else None) or 5186,
                    "res": ds.res[0]}
        finally:
            ds.close()
        return meta, fp
    except ImportError:
        pass
    path = row[0] if (":" in row[0][:3]) else str(config.DATA_ROOT / row[0])
    return _meta(path), fp


def plan_sgg(imagery_id: str, sgg_cd: str, *, center=None, chip: int = 1024, overlap=None, upsample: float = 1.0):
    """시군구 전역 분석 계획(scope sgg) — 읍면동 합집합 ∩ 영상 footprint 를 칸으로, 화면 중심에서 가까운 읍면동부터.
    게이트웨이 견적(jobs.build_quote)과 스케줄러가 같은 함수를 쓴다 → (grid, shards, info)."""
    from pyproj import Transformer
    from shapely.geometry import shape
    from shapely.ops import transform as sh_transform
    from landxi_api.regions import emd_index
    from workers.tiling import sgg_shards
    ix = emd_index(sgg_cd)
    if ix is None or not len(ix):
        raise RuntimeError(f"emd_unavailable {sgg_cd}")
    meta, fp = imagery_meta(imagery_id)
    fp_parts = None
    if fp:
        g = sh_transform(Transformer.from_crs(4326, meta["crs"], always_xy=True).transform, shape(fp))
        fp_parts = list(getattr(g, "geoms", [g]))
    return sgg_shards(meta, ix.geoms, ix.codes, center=center, chip=chip, overlap=overlap, upsample=upsample, footprint_src=fp_parts)


# ── 영상 범위(r3-xi · M12) — '전역' 분석이 실제로 덮는 곳. 견적 · 확인 카드 · 작업 옵션이 모두 이 한 함수의 값을 쓴다(숫자 한 출처) ──
# 읍면동 수 = 영상 footprint 와 1 ha(0.01 ㎢) 이상 겹치는 법정 읍면동 수 — 경계선 오차로 몇 ㎡ 스치는 곳은 세지 않는다
# (DB 대조: ST_Area(ST_Intersection(읍면동, imagery.footprint)) ≥ 10,000 ㎡ · EPSG:5186).
# 비율(coverage) = (시군구 읍면동 합집합 ∩ 영상 footprint) ÷ 시군구 읍면동 합집합 — plan_sgg(info.coverage)와 같은 식.
SCOPE_EMD_MIN_M2 = 10_000.0
_scope_cache: dict[tuple, tuple[float, dict]] = {}


def sgg_scope(imagery_id: str, sgg_cd: str) -> dict:
    """→ {coverage 0..1, emd_covered, emd_total, emds:[{emd_cd, name, km2}], area_km2, land_km2} (10분 캐시)."""
    key = (imagery_id, str(sgg_cd))
    hit = _scope_cache.get(key)
    if hit and time.time() - hit[0] < 600:
        return hit[1]
    from pyproj import Transformer
    from shapely.geometry import shape
    from shapely.ops import transform as sh_transform, unary_union
    from landxi_api.regions import emd_index
    ix = emd_index(sgg_cd)
    if ix is None or not len(ix):
        raise RuntimeError(f"emd_unavailable {sgg_cd}")
    meta, fp = imagery_meta(imagery_id)
    crs = meta["crs"] if meta.get("crs") and meta["crs"] != 4326 else 6933          # 경위도 영상은 등적 좌표(EASE)로 면적
    to = Transformer.from_crs(4326, crs, always_xy=True).transform
    es = [sh_transform(to, g).buffer(0) for g in ix.geoms]
    land = unary_union(es)
    out = {"coverage": 0.0, "emd_covered": 0, "emd_total": len(ix), "emds": [], "area_km2": 0.0,
           "land_km2": round(land.area / 1e6, 3), "emd_min_m2": SCOPE_EMD_MIN_M2}
    if fp:
        f = sh_transform(to, shape(fp)).buffer(0)
        inter = land.intersection(f)
        out["coverage"] = round(inter.area / max(land.area, 1e-9), 4)
        out["area_km2"] = round(inter.area / 1e6, 3)
        for cd, nm, e in zip(ix.codes, ix.names, es):
            a = e.intersection(f).area if e.intersects(f) else 0.0
            if a >= SCOPE_EMD_MIN_M2:
                out["emds"].append({"emd_cd": cd, "name": nm, "km2": round(a / 1e6, 3)})
        out["emds"].sort(key=lambda x: -x["km2"])
        out["emd_covered"] = len(out["emds"])
    _scope_cache[key] = (time.time(), out)
    while len(_scope_cache) > 64:
        _scope_cache.pop(next(iter(_scope_cache)))
    return out


def plan(job_id: str) -> list[dict]:
    pre = r().get(f"jobplan:{job_id}")                  # 게이트웨이가 제출 때 넘긴 계획(시군구 전역 · 견적과 같은 계획)
    if pre:
        r().delete(f"jobplan:{job_id}")
        try:
            return json.loads(pre)
        except Exception:
            pass
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
            cap = SHARD_CAP.get(jh.get("kind") or "", 10 ** 9)
            if len(sh) > cap:
                # S-8 서버측 상한(게이트웨이 견적이 먼저 거른다 · 여기는 이중 방어) — 쪼개서 다시
                log(WHO, f"too_large {job_id} shards {len(sh)} > {cap}")
                r().hset(f"job:{job_id}", mapping={"state": "failed", "error": f"too_large: {len(sh)} shard", "finished_at": now_iso()})
                emit(job_id, "job.failed", {"job_id": job_id, "error": "too_large", "at": now_iso()})
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
        ws = sorted(h.split(":")[1] for h in r().scan_iter(match="worker:*:hb", count=2000) if r().hget(h, "pool") == pool)
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
        if depth >= lw and depth <= 256:
            # 끝난 작업의 남은 칸(취소·시험 중단)이 스트림 깊이를 채워 새 칸 배정이 멈추지 않게 걷어 낸다
            for eid, f in r().xrange(stream, count=256):
                if (bus.job(f.get("job_id", "")) or {}).get("state") in (None, "done", "cancelled", "failed"):
                    r().xdel(stream, eid)
                    depth -= 1
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


def job_counts(jid: str, h: dict) -> dict:
    """jobs.counts 에 쓸 값 — 한 출처(r3-xi 2차 must_fix 3).
    - 끝난 작업(done): 마감(전역 NMS)이 해시 counts 에 쓴 최종 수. 예전에는 칸별 합(job:{id}:counts · 겹침 포함)을 먼저 읽어,
      마감이 DB 를 고치기 전에 동기화가 돌면 끝난 작업의 counts 가 칸별 합(부여 그린 범위 11,999 ↔ 최종 9,670)으로 남을 수 있었다.
    - 진행 중: 칸 경계 겹침을 걸러 낸 수(counts_clean · 아래 CleanCount) — 없으면 칸별 합."""
    if h.get("state") == "done" and h.get("counts"):
        try:
            return json.loads(h["counts"])
        except Exception:
            pass
    if h.get("state") in ("queued", "running") and h.get("counts_clean"):
        try:
            return (json.loads(h["counts_clean"]) or {}).get("by") or {}
        except Exception:
            pass
    return {k: int(v) for k, v in r().hgetall(f"job:{jid}:counts").items()} or json.loads(h.get("counts") or "{}")


# ── 진행 중 탐지 수 정리(r3-xi 2차 · 숫자 한 출처) ────────────────────────────────────────────────────────────────
# 칸(칩)은 12.5% 겹쳐 돈다. 두 칸이 같은 건물 · 논밭을 함께 잡으면 칸별 합은 최종(마감 전역 NMS) 수보다 크다(부여 그린 범위 11,999 → 9,670).
# 진행판이 끝에서 숫자를 줄이지 않도록, 칸 결과가 들어오는 대로 마감과 같은 규칙(미터 좌표 · 0.3 m 단순화 · 4 ㎡ 미만 제외 ·
# 같은 종류끼리 작은 쪽 면적의 50% 넘게 겹치면 하나)으로 걸러 센다. 도착 순서로 세므로 마감(신뢰도 순)과 몇 건(0.4% 안팎) 다를 수 있고,
# 끝나면 마감 수가 이긴다. 결과: 해시 job:{id}.counts_clean + 이벤트 counts.clean{n, by, cls, shards}.
CLEAN_S = 3.0
CLEAN_CELL_M = 64.0
CLEAN_BUDGET_S = 0.6
CLEAN_TICK_S = 2.5                 # 한 차례에 세는 시간(작업 전체) — 뒤에 0.5초 이상 쉰다
_clean: dict = {}


class CleanCount:
    def __init__(self, jid: str, h: dict):
        self.jid, self.demo = jid, h.get("demo") == "1"
        self.sdir = bus.shard_dir(h.get("tenant_id") or "lx", jid, self.demo)
        self.seen: set = set()
        self.grid: dict = {}
        self.to_m = None
        self.by: dict = {}
        self.cls: dict = {}
        self.n = 0
        self.sent = -1

    def _metric(self, arr):
        """도형 배열 → 미터 좌표(한 번에 · shapely.transform + pyproj 벡터 변환)."""
        import numpy as np
        import shapely
        if self.to_m is None:
            from pyproj import Transformer
            from workers.postprocess import metric_epsg
            c = arr[0].centroid
            self.to_m = Transformer.from_crs(4326, metric_epsg(c.x, c.y), always_xy=True)
        tr = self.to_m
        return shapely.transform(arr, lambda xy: np.column_stack(tr.transform(xy[:, 0], xy[:, 1])))

    def feed(self, sid: str) -> bool:
        import numpy as np
        import shapely
        from shapely.geometry import shape
        f = self.sdir / f"{sid}.geojson"
        try:
            fs = json.loads(f.read_text(encoding="utf-8")).get("features") or []
        except FileNotFoundError:
            return False                                   # 아직 파일이 없다(다음 차례에 다시)
        except Exception:
            return True
        if not fs:
            return True
        fs.sort(key=lambda ft: -float((ft.get("properties") or {}).get("conf") or 0))
        gs, props = [], []
        for ft in fs:
            try:
                gs.append(shape(ft["geometry"]))
                props.append(ft.get("properties") or {})
            except Exception:
                continue
        if not gs:
            return True
        try:
            arr = shapely.simplify(self._metric(np.array(gs, dtype=object)), 0.3, preserve_topology=True)
            bad = ~shapely.is_valid(arr)
            if bad.any():
                arr[bad] = shapely.buffer(arr[bad], 0)
            areas = shapely.area(arr)
            bnds = shapely.bounds(arr)
        except Exception:
            return True
        C = CLEAN_CELL_M
        for g, pr, a, (x0, y0, x1, y1) in zip(arr, props, areas, bnds):
            if g is None or not a or a < 4.0 or not np.isfinite(x0):
                continue
            c = pr.get("cls") or pr.get("cls_en") or ""
            keys = [(c, i, j) for i in range(int(x0 // C), int(x1 // C) + 1) for j in range(int(y0 // C), int(y1 // C) + 1)]
            dup, looked = False, set()
            for k in keys:
                for o in self.grid.get(k, ()):
                    oid = id(o)
                    if oid in looked:
                        continue
                    looked.add(oid)
                    og, oa, ob = o
                    if ob[0] > x1 or ob[2] < x0 or ob[1] > y1 or ob[3] < y0:
                        continue
                    try:
                        inter = g.intersection(og).area
                    except Exception:
                        continue
                    if inter / max(min(a, oa), 1e-9) > 0.5:
                        dup = True
                        break
                if dup:
                    break
            if dup:
                continue
            rec = (g, float(a), (x0, y0, x1, y1))
            for k in keys:
                self.grid.setdefault(k, []).append(rec)
            self.n += 1
            en = pr.get("cls_en") or c
            self.by[en] = self.by.get(en, 0) + 1
            self.cls[c] = self.cls.get(c, 0) + 1
        return True

    def step(self, budget_s: float = CLEAN_BUDGET_S) -> None:
        """이번 차례 몫(budget_s)만 센다 — 큰 작업의 따라잡기가 새 작업을 막지 않게(작업마다 돌아가며).
        다 따라잡았을 때만 내보낸다(따라잡는 중의 적은 수를 진행판에 보이지 않는다)."""
        t0 = time.time()
        new = [sid for sid in r().smembers(f"job:{self.jid}:done") if sid not in self.seen]     # 끝난 칸(작업기가 파일을 쓴 뒤 넣는다)

        def mtime(sid):
            try:
                return (self.sdir / f"{sid}.geojson").stat().st_mtime
            except OSError:
                return float("inf")
        new.sort(key=mtime)                                # 도착 순서(파일 시각)
        behind = False
        for sid in new:
            if time.time() - t0 > budget_s:
                behind = True
                break
            if self.feed(sid):
                self.seen.add(sid)
        if not behind and self.n != self.sent and self.seen:
            self.sent = self.n
            body = {"n": self.n, "by": self.by, "cls": self.cls, "shards": len(self.seen)}
            r().hset(f"job:{self.jid}", "counts_clean", json.dumps(body, ensure_ascii=False))
            emit(self.jid, "counts.clean", {"job_id": self.jid, **body, "at": now_iso(ms=True)})


def clean_tick() -> None:
    """진행 중 분석마다 걸러 센다 — 밀린 칸이 적은 작업(막 시작한 · 화면에서 보고 있는 작업)부터, 차례 몫(CLEAN_TICK_S) 안에서.
    오래 밀린 큰 작업(재기동 뒤 따라잡기)은 남는 몫으로 따라잡는다."""
    live = []
    for k in r().scan_iter(match="job:job_*", count=2000):
        if k.count(":") != 1:
            continue
        jid = k.split(":")[1]
        h = bus.job(jid)
        if not h or h.get("state") != "running" or h.get("kind") not in ("infer", "reinfer") or h.get("pool") == "cpu":
            continue
        c = _clean.get(jid)
        if c is None:
            c = _clean[jid] = CleanCount(jid, h)
        live.append((int(h.get("shards_done") or 0) - len(c.seen), jid, c))
    t0 = time.time()
    for _, jid, c in sorted(live, key=lambda x: x[0]):
        left = CLEAN_TICK_S - (time.time() - t0)
        if left <= 0.05:
            break
        try:
            c.step(left)
        except bus.REDIS_ERRORS:
            raise
        except Exception as e:
            log(WHO, "clean count", jid, repr(e))
    alive = {j for _, j, _ in live}
    for jid in [j for j in _clean if j not in alive]:
        _clean.pop(jid, None)


def clean_loop() -> None:
    while True:
        t0 = time.time()
        try:
            clean_tick()
        except bus.REDIS_ERRORS as e:
            bus.redis_hiccup(WHO, e)
        except Exception as e:
            log(WHO, "clean loop error", repr(e))
        time.sleep(max(0.5, CLEAN_S - (time.time() - t0)))


def sync_db():
    """Redis 미러 → jobs 표(2s)."""
    ids = [k.split(":")[1] for k in r().scan_iter(match="job:job_*", count=2000) if k.count(":") == 1]
    if not ids:
        return
    with bus.pg() as conn:
        bus.lx_tx(conn)
        for jid in ids:
            h = bus.job(jid)
            if not h or h.get("synced_state") == h.get("state") == "done" or h.get("synced_state") == "final":
                continue
            counts = job_counts(jid, h)
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
    for k in r().scan_iter(match="jobshards:*", count=2000):
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
    import threading
    threading.Thread(target=clean_loop, name="clean-count", daemon=True).start()    # 진행 중 탐지 수 정리(칸 겹침 제외 · 숫자 한 출처)
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
