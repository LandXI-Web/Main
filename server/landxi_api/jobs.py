"""작업(F1-CONTRACT §4.4) — quote · submit · 목록 · 조회 · cancel/requeue/priority.

견적 숫자는 전부 봉투: 면적(shapely · EPSG:5186 · measured) · shard 수(tiling · measured) · GPU·s(models.perf 실측 계수 × shard · estimate).
perf 가 없으면 null + note 'bench 전'. 제출 = jobs 행 + Redis job:{id} 해시 + XADD jobs:{pool} + events:{job} job.queued.
"""
from __future__ import annotations

import datetime as dt
import json
import os
import secrets
import time

from fastapi import APIRouter, Request
from shapely.geometry import mapping, shape
from starlette.concurrency import run_in_threadpool

from . import config
from .deps import ApiError, Principal, audit, db, principal, redis, require
from .envelope import KST, env, now_iso
from . import quota as quota_mod

router = APIRouter()
_CROCK = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"


def ulid() -> str:
    t = int(time.time() * 1000)
    ts = "".join(_CROCK[(t >> (5 * i)) & 31] for i in reversed(range(10)))
    rnd = int.from_bytes(secrets.token_bytes(10), "big")
    return ts + "".join(_CROCK[(rnd >> (5 * i)) & 31] for i in reversed(range(16)))


_raster_meta: dict[str, dict] = {}


def raster_meta(path: str) -> dict:
    m = _raster_meta.get(path)
    if m is None:
        import rasterio
        with rasterio.open(path) as ds:
            m = {"width": ds.width, "height": ds.height, "transform": ds.transform, "crs": ds.crs.to_epsg() or 5186,
                 "res": ds.res[0]}
        _raster_meta[path] = m
    return m


def resolve_internal(path: str | None) -> str | None:
    if not path:
        return None
    p = path if os.path.isabs(path) or ":" in path[:3] else str(config.DATA_ROOT / path)
    return p


def _footprint_parts(fp_geojson: dict | None, epsg: int):
    if not fp_geojson:
        return None
    from pyproj import Transformer
    from shapely.ops import transform as sh_transform
    to = Transformer.from_crs(4326, epsg, always_xy=True).transform
    g = sh_transform(to, shape(fp_geojson))
    return list(getattr(g, "geoms", [g]))


async def _load(conn, model_id: str | None, imagery_id: str | None):
    model = await conn.fetchrow("SELECT * FROM models WHERE id=$1", model_id) if model_id else None
    img = None
    if imagery_id:
        img = await conn.fetchrow("SELECT id, tier, kind, gsd_m, path_internal, layer, export_policy, ST_AsGeoJSON(footprint)::json AS fp, "
                                  "ST_AsGeoJSON(ST_Envelope(footprint))::json AS env FROM imagery WHERE id=$1", imagery_id)
    return model, img


def pool_of(model) -> str:
    if model is None:
        return "cpu"
    adapter = model["adapter"] or ""
    from workers.registry_scan import adapter_device
    return "cpu" if adapter_device(adapter) == "cpu" else config.POOL


async def active_workers(pool: str) -> list[str]:
    r = await redis()
    out = []
    async for k in r.scan_iter(match="worker:*:hb"):
        h = await r.hgetall(k)
        if h.get("pool") == pool:
            out.append(h.get("id"))
    return sorted(w for w in out if w)


async def build_quote(p: Principal, body: dict) -> dict:
    kind = body.get("kind", "infer")
    if kind not in ("infer", "reinfer", "index", "survey", "join"):
        raise ApiError("bad_request", f"kind {kind} — infer|reinfer|index|survey|join")
    demo = bool(body.get("demo"))
    opts = dict(body.get("options") or {})
    chip = int(opts.get("chip", 1024))
    reasons: list[str] = []
    tenant = "lx-demo" if demo else (p.tenant_id if p.realm == "tenant" else "lx")
    async with db(realm="lx") as conn:
        model, img = await _load(conn, body.get("model_id"), body.get("imagery_id"))
    if body.get("model_id") and not model:
        raise ApiError("not_found", f"model {body.get('model_id')} 없음")
    if body.get("imagery_id") and not img:
        raise ApiError("not_found", f"imagery {body.get('imagery_id')} 없음")
    if p.role == "sales" and not demo:
        reasons.append("demo_required")
    if p.realm == "tenant" and img and (img["tier"] == "raw"):
        reasons.append("imagery_forbidden")
    if model and img and model["input"] and img["kind"] not in (model["input"] or []):
        reasons.append("model_input_mismatch")
    aoi = body.get("aoi")
    if kind == "reinfer" and not aoi and img and img["fp"]:
        aoi = None      # footprint 전체
    area = None
    area_src = "shapely area(EPSG:5186)"
    shards_n = 0
    tile_src = "params"
    adapter_id = None
    if kind in ("survey", "join") or (kind == "index" and not model):
        from workers.registry_scan import adapter_for_kind
        adapter_id = body.get("adapter") if (config.DEV and body.get("adapter")) else adapter_for_kind(kind)
        if config.DEV and opts.get("adapter"):
            adapter_id = opts["adapter"]            # 개발 모드 전용(고아 감시 테스트 어댑터 등)
        if not adapter_id:
            raise ApiError("registry_unavailable", f"kind {kind}: 어댑터 없음(plan 훅 · F2-S server/adapters/survey 미도착)",
                           {"kind": kind}, status=404)
    elif model and kind == "index":
        adapter_id = model["adapter"]
    if kind in ("index", "survey", "join"):
        sh = await run_in_threadpool(_plan_preview, kind, adapter_id, body, opts, aoi)
        shards_n = len(sh)
        tile_src = f"plan({adapter_id})" if adapter_id else "params.months"
        if aoi:
            area, area_src = aoi_area(aoi)
    elif img:
        path = resolve_internal(img["path_internal"])
        meta = await run_in_threadpool(raster_meta, path)
        fp_parts = _footprint_parts(img["fp"], meta["crs"])
        if aoi:
            g = shape(aoi)
            area, area_src = aoi_area(aoi)
            if img["fp"] and not shape(img["fp"]).intersects(g):
                reasons.append("aoi_outside_footprint")
            if kind == "infer" and area > float(opts.get("max_km2", 5)):
                reasons.append("aoi_too_large")
        elif img["fp"]:
            area, area_src = aoi_area(img["fp"])
        from workers.tiling import shards as mk_shards
        if "aoi_outside_footprint" not in reasons and "aoi_too_large" not in reasons:
            grid, sh = await run_in_threadpool(mk_shards, meta, aoi, chip=chip, overlap=opts.get("overlap"),
                                               upsample=float(opts.get("upsample", 1) or 1), footprint_src=fp_parts)
            shards_n = len(sh)
            tile_src = f"workers.tiling(chip {chip} · overlap {grid.overlap}px(원본) · upsample {grid.upsample:g} · gsd {meta['res']:.4f})"
    pool = pool_of(model) if model else "cpu"
    if kind in ("survey", "join"):
        pool = "cpu"
    perf = (model["perf"] if model else None) or None
    cps = (perf or {}).get("chips_per_s", {}).get("value") if perf else None
    if kind != "index" and cps:
        bench_at = (perf or {}).get("bench_at", "")
        gpu_s = env(round(shards_n / cps, 1), "gpu_s", "estimate", f"models.perf({model['id']}) {cps} chips/s/GPU × {shards_n} shard",
                    (perf["chips_per_s"].get("note") or "") + f" · bench {bench_at}")
        wk = await active_workers(pool)
        n = max(1, len(wk))
        eta = env(round(shards_n / cps / n + 3.0, 1), "s", "estimate", f"gpu_s ÷ 워커 {n} + 스냅샷 3s",
                  "워커 수는 지금 하트비트 기준" if wk else "워커 하트비트 없음 — 1 로 계산")
    elif kind in ("index", "survey", "join"):
        gpu_s = env(0 if kind != "index" else None, "gpu_s", "estimate", f"kind {kind} — CPU 워커(모델 추론 아님)", "GPU 사용 없음")
        eta = await eta_estimate(adapter_id or kind, shards_n)
    else:
        gpu_s = env(None, "gpu_s", "estimate", f"models.perf({model['id'] if model else '-'}) 없음 — bench 전", "bench 후 채워짐")
        eta = env(None, "s", "estimate", "同上")
    q = await quota_mod.remaining(tenant, "gpu_s_month")
    req = gpu_s["value"] or 0
    if q["hard"] is not None and q["used"] + req > q["hard"] and q["policy"] == "reject":
        reasons.append("quota_exceeded")
    area_env = env(round(area, 4) if area is not None else None, "km2", "measured", area_src,
                   None if area is not None else ("AOI 없음(읍면동 목록 · 규칙 재평가)" if kind in ("survey", "join") else None))
    return {
        "area_km2": area_env,
        "shards": shards_n,
        "shards_env": env(shards_n, "count", "measured", tile_src),
        "gpu_s": gpu_s, "eta_s": eta,
        "quota": {"tenant_id": tenant, "dim": "gpu_s_month",
                  "remaining": env(None if q["hard"] is None else round(q["hard"] - q["used"], 1), "gpu_s", "measured",
                                   f"quotas({tenant} hard={q['hard']}) − usage_events", "무제한" if q["hard"] is None else q.get("note")),
                  "policy": q["policy"]},
        "allowed": not reasons, "reasons": reasons, "pool": pool, "kind": kind, "demo": demo,
        "power_budget": await power_budget() if pool != "cpu" else None,
        "_aoi": aoi, "_tenant": tenant, "_model": dict(model) if model else None, "_img": dict(img) if img else None,
        "_adapter": adapter_id,
    }


def aoi_area(g: dict) -> tuple[float, str]:
    """면적(km²): AOI 중심이 EPSG:5186 유효 범위(한국 · 124–132°E · 33–39°N) 안이면 5186 평면, 밖이면 측지(GRS80 · v1.1-12)."""
    c = shape(g).centroid
    if 124.0 <= c.x <= 132.0 and 33.0 <= c.y <= 39.0:
        from workers.tiling import area_km2
        return area_km2(g), "shapely area(EPSG:5186)"
    from pyproj import Geod
    a = abs(Geod(ellps="GRS80").geometry_area_perimeter(shape(g))[0]) / 1e6
    return a, f"geodesic(GRS80 · pyproj.Geod) — AOI 중심 {c.x:.2f},{c.y:.2f} 가 EPSG:5186 범위 밖"


def _plan_preview(kind: str, adapter_id: str | None, body: dict, opts: dict, aoi) -> list:
    """견적용 shard 목록 — 스케줄러와 같은 plan_job()(어댑터 plan 훅 · index 월 목록)."""
    from workers.scheduler import plan_job
    o = dict(opts)
    if body.get("params"):
        o["params"] = body["params"]
    for k in ("survey_id", "rules", "emd_cd", "thresholds"):
        if k in body and k not in o:
            o[k] = body[k]
    jh = {"kind": kind, "adapter": adapter_id or "", "options": json.dumps(o, ensure_ascii=False), "aoi": json.dumps(aoi) if aoi else "",
          "tenant_id": body.get("tenant_id") or "", "deploy_id": body.get("deploy_id") or ""}
    try:
        return plan_job(jh)
    except ValueError as e:
        m = str(e)
        if m.startswith("rule_requires_missing:"):
            raise ApiError("rule_requires_missing", m.split(":", 1)[1].strip(), {"rules": o.get("rules"), "thresholds": o.get("thresholds")}, status=400) from None
        raise


async def eta_estimate(key: str, shards_n: int) -> dict:
    """kind index · survey eta_s(v1.1-11): 최근 shard ms 중앙값(perf:shard_ms:{어댑터} · 없으면 index_results.metrics.ms) × shards."""
    import statistics
    r = await redis()
    vals = [int(x) for x in await r.lrange(f"perf:shard_ms:{key}", 0, 99)]
    src = f"perf:shard_ms:{key} 최근 {len(vals)}건 중앙값"
    if not vals:
        try:
            async with db(realm="lx") as conn:
                rows = await conn.fetch("SELECT (metrics->>'ms')::float AS ms FROM index_results i JOIN jobs j ON j.id=i.job_id "
                                        "WHERE metrics ? 'ms' AND (j.options->>'adapter'=$1 OR j.model_id=$1 OR j.kind=$1) "
                                        "ORDER BY i.id DESC LIMIT 100", key)
            vals = [x["ms"] for x in rows if x["ms"] is not None]
            src = f"index_results.metrics.ms 최근 {len(vals)}건 중앙값"
        except Exception:
            vals = []
    if not vals or not shards_n:
        return env(None, "s", "estimate", src if vals else f"{key} 실측 shard 없음", "첫 실행 뒤 채워짐")
    med = statistics.median(vals)
    return env(round(med * shards_n / 1000, 1), "s", "estimate", f"{src} {med:.0f} ms × {shards_n} shard",
               "순수 shard 시간(cpu 워커 1 · 순차) — 큐 대기·finalize(전역 집계·기록) 제외 · 실측 elapsed 는 이보다 길다")


async def power_budget() -> dict:
    """전력 예산(v1.1-18) — power:hot:{slot} 임대 상태. 지금 다른 워커가 쥐고 있으면 '보류 사유'로 보여 준다(제출은 막지 않음)."""
    r = await redis()
    pw = config.load_yaml("pools").get("power", {}) or {}
    mx = int(pw.get("max_hot_gpus", 1))
    leases = []
    for i in range(mx):
        h = await r.get(f"power:hot:{i}")
        ttl = await r.ttl(f"power:hot:{i}") if h else None
        leases.append({"slot": i, "holder": h, "ttl_s": ttl})
    held = [x for x in leases if x["holder"]]
    return {"max_hot_gpus": mx, "leases": leases, "hot_now": len(held),
            "hold_reason": "power_budget" if len(held) >= mx else None,
            "note": (f"고부하 GPU {len(held)}/{mx} — 같은 워커가 이어받거나 임대 반납 뒤 시작" if len(held) >= mx else f"고부하 GPU {len(held)}/{mx}"),
            "power_limit_w": pw.get("power_limit_w")}


def _public_quote(q: dict) -> dict:
    return {k: v for k, v in q.items() if not k.startswith("_") and k not in ("kind", "demo") and not (k == "power_budget" and v is None)}


@router.post("/jobs/quote")
async def quote(body: dict, request: Request):
    p = require(principal(request))
    q = await build_quote(p, body)
    return _public_quote(q)


def _iso(v):
    if v is None:
        return None
    if isinstance(v, str):
        return v
    return v.astimezone(KST).isoformat(timespec="seconds")


async def job_dict(row, live: dict | None = None) -> dict:
    live = live or {}
    counts = json.loads(live["counts"]) if live.get("counts") else (row["counts"] or {})
    total_n = sum(counts.values()) if counts else 0
    state = live.get("state") or row["state"]
    cps = float(live["chips_per_s"]) if live.get("chips_per_s") else None
    gpu_s = float(live["gpu_s"]) if live.get("gpu_s") else float(row["gpu_s"] or 0)
    aoi = row["aoi"] if not isinstance(row["aoi"], str) else json.loads(row["aoi"])
    basis_counts = "demo" if row["demo"] else "inferred"
    return {
        "id": row["id"], "tenant_id": row["tenant_id"], "submitted_by": row["submitted_by"], "kind": row["kind"], "state": state,
        "priority": int(live.get("priority", row["priority"])), "demo": row["demo"], "pool": row["pool"],
        "model_id": row["model_id"], "imagery_id": row["imagery_id"], "deploy_id": row["deploy_id"], "card_id": row["card_id"],
        "aoi": aoi, "options": row["options"] or {},
        "shards_total": int(live.get("shards_total", row["shards_total"] or 0)),
        "shards_done": int(live.get("shards_done", row["shards_done"] or 0)),
        "shards_failed": int(live.get("shards_failed", row["shards_failed"] or 0)),
        "counts": counts,
        "counts_env": env(total_n, "count", basis_counts, row["id"], "진행 중 누적" if state == "running" else ("시연 · 결과 미기록" if row["demo"] else "검수 전")),
        "chips_per_s": env(cps, "chips_per_s", "measured", "gpu_worker 계량(창 10s)", None if cps else "첫 shard 뒤 채워짐"),
        "gpu_s": env(round(gpu_s, 2), "gpu_s", "measured", "usage_events" if not row["demo"] else "usage_events(lx-demo)"),
        "workers": json.loads(live["workers"]) if live.get("workers") else list(row["workers"] or []),
        "result_set": row["result_set"], "snapshot_ready": (live.get("snapshot_ready") == "1") if live.get("snapshot_ready") else row["snapshot_ready"],
        "created_at": _iso(row["created_at"]), "started_at": live.get("started_at") or _iso(row["started_at"]),
        "finished_at": live.get("finished_at") or _iso(row["finished_at"]), "error": live.get("error") or row["error"],
        **_perf_fields(row, live, state),
        "recovered": _recovered(live),
    }


def _perf_fields(row, live: dict, state: str) -> dict:
    """v1.1-6: job.done 과 같은 두 줄 실측 — 끝난 작업은 perf(jsonb · Redis 미러) 그대로, 진행 중이면 null + note."""
    perf = None
    if live.get("perf"):
        try:
            perf = json.loads(live["perf"])
        except Exception:
            perf = None
    if perf is None:
        try:
            perf = row["perf"]
        except (KeyError, IndexError):
            perf = None
        if isinstance(perf, str):
            perf = json.loads(perf)
    if perf:
        el = perf.get("elapsed_env") or env(perf.get("elapsed_s"), "s", "measured", "job.started → job.done")
        return {"chips_per_gpu_s": perf.get("chips_per_gpu_s"), "chips_per_wall_s": perf.get("chips_per_wall_s"), "elapsed_s": el}
    note = "job.done 뒤 채워짐" if state in ("queued", "running") else "이 작업은 v1.1 이전 실행 — 기록 없음"
    return {"chips_per_gpu_s": env(None, "chips_per_gpu_s", "measured", "shards_total ÷ gpu_s", note),
            "chips_per_wall_s": env(None, "chips_per_wall_s", "measured", "shards_total ÷ elapsed_s", note),
            "elapsed_s": env(None, "s", "measured", "job.started → job.done", note)}


def _recovered(live: dict) -> dict | None:
    if not live.get("recovered_mode"):
        return None
    return {"mode": live.get("recovered_mode"), "shards_done": int(live.get("recovered_done") or 0),
            "shards_total": int(live.get("recovered_total") or 0), "reason": live.get("recovered_reason"), "at": live.get("recovered_at"),
            "chip": (f"복구 · 재개 {live.get('recovered_done')}/{live.get('recovered_total')}" if live.get("recovered_mode") == "resumed"
                     else "복구 · 재투입" if live.get("recovered_mode") == "requeued" else "복구 실패")}


JOB_COLS = ("id, tenant_id, submitted_by, kind, state, priority, demo, pool, model_id, imagery_id, deploy_id, card_id, "
            "ST_AsGeoJSON(aoi)::json AS aoi, options, shards_total, shards_done, shards_failed, counts, gpu_s, workers, result_set, "
            "snapshot_ready, created_at, started_at, finished_at, error, label, perf")


async def publish(job_id: str, event: str, data: dict, *, ops: bool = False):
    r = await redis()
    eid = await r.xadd(f"events:{job_id}", {"event": event, "data": json.dumps(data, ensure_ascii=False)}, maxlen=10000, approximate=True)
    if ops:
        await r.xadd("ops:events", {"event": event, "data": json.dumps(data, ensure_ascii=False)}, maxlen=5000, approximate=True)
    return eid


TENANT_MIRROR = ("job.state", "usage.delta", "deploy.changed")


async def tenant_event(tenant_id: str | None, event: str, data: dict):
    """기관 스트림(v1.1-16) — workers.bus.tenant_event 의 async 판(게이트웨이용 · 같은 키 events:tenant:{tenant_id})."""
    if not tenant_id:
        return None
    r = await redis()
    d = {**data}
    d.setdefault("tenant_id", tenant_id)
    d.setdefault("at", now_iso())
    k = f"events:tenant:{tenant_id}"
    eid = await r.xadd(k, {"event": event, "data": json.dumps(d, ensure_ascii=False)}, maxlen=10000, approximate=True)
    try:
        await r.xtrim(k, minid=f"{int((time.time() - 86400) * 1000)}-0", approximate=True)
    except Exception:
        pass
    return eid


async def ops_event(event: str, data: dict):
    r = await redis()
    await r.xadd("ops:events", {"event": event, "data": json.dumps(data, ensure_ascii=False)}, maxlen=5000, approximate=True)
    if event in TENANT_MIRROR and data.get("tenant_id"):
        await tenant_event(data["tenant_id"], event, data)


def _centroid(aoi, img) -> list | None:
    g = aoi or (img or {}).get("fp")
    if not g:
        return None
    c = shape(g).centroid
    return [round(c.x, 6), round(c.y, 6)]


@router.post("/jobs", status_code=202)
async def submit(body: dict, request: Request):
    p = require(principal(request))
    if p.realm == "tenant" and p.role != "manager":
        raise ApiError("forbidden", "제출 권한 없음")
    if p.role == "sales" and not body.get("demo"):
        raise ApiError("demo_required", "영업 계정은 시연(demo:true)만 실행할 수 있습니다")
    q = await build_quote(p, body)
    if not q["allowed"]:
        code = q["reasons"][0]
        raise ApiError(code, f"제출 불가: {', '.join(q['reasons'])}", {"reasons": q["reasons"]})
    prio = int(body.get("priority", 0 if body.get("demo") else (1 if body.get("kind") == "reinfer" else 0)))
    tenant = q["_tenant"]
    qpol = await quota_mod.remaining(tenant, "gpu_s_month")
    if qpol["hard"] is not None and qpol["used"] + (q["gpu_s"]["value"] or 0) > qpol["hard"] and qpol["policy"] == "queue_low":
        prio = 3
    job_id = "job_" + ulid()
    demo = bool(body.get("demo"))
    rs = f"demo/{job_id}" if demo else f"results/{tenant}/{job_id}"
    img = q["_img"]
    aoi = q["_aoi"]
    opts = dict(body.get("options") or {})
    if body.get("params"):
        opts["params"] = body["params"]
    for k in ("survey_id", "rules", "emd_cd", "thresholds"):
        if k in body and k not in opts:
            opts[k] = body[k]
    if q.get("_adapter"):
        opts.setdefault("adapter", q["_adapter"])
    async with db(p) if p.realm == "tenant" else db(realm="lx") as conn:
        await conn.execute(
            "INSERT INTO jobs(id, tenant_id, submitted_by, kind, state, priority, demo, pool, model_id, imagery_id, deploy_id, card_id, aoi, "
            "options, shards_total, result_set, label) VALUES ($1,$2,$3,$4,'queued',$5,$6,$7,$8,$9,$10,$11,"
            "CASE WHEN $12::text IS NULL THEN NULL ELSE ST_SetSRID(ST_GeomFromGeoJSON($12),4326) END,$13,$14,$15,$16)",
            job_id, tenant, p.user_id, q["kind"], prio, demo, q["pool"], body.get("model_id"), body.get("imagery_id"),
            body.get("deploy_id"), body.get("card_id"), json.dumps(aoi) if aoi else None, opts, q["shards"], rs, body.get("label"))
        await audit(conn, p, "job.submit", job_id, None, {"kind": q["kind"], "model_id": body.get("model_id"), "imagery_id": body.get("imagery_id"),
                                                           "demo": demo, "priority": prio})
    r = await redis()
    now = now_iso()
    await r.hset(f"job:{job_id}", mapping={
        "id": job_id, "state": "queued", "tenant_id": tenant, "demo": "1" if demo else "0", "kind": q["kind"], "pool": q["pool"],
        "priority": prio, "model_id": body.get("model_id") or "", "imagery_id": body.get("imagery_id") or "",
        "options": json.dumps(opts), "aoi": json.dumps(aoi) if aoi else "", "shards_total": q["shards"], "shards_done": 0,
        "shards_failed": 0, "counts": "{}", "gpu_s": 0, "result_set": rs, "created_at": now, "submitted_by": p.user_id or "",
        "centroid": json.dumps(_centroid(aoi, img)), "queued_at_ms": int(time.time() * 1000), "adapter": q.get("_adapter") or "",
        "deploy_id": body.get("deploy_id") or ""})
    await r.xadd(f"jobs:{q['pool']}", {"job_id": job_id, "priority": prio}, maxlen=10000, approximate=True)
    # 대기 위치 = 같은 풀에서 이 작업보다 먼저 처리될 작업 수
    async with db(realm="lx") as conn:
        pos = await conn.fetchval("SELECT count(*) FROM jobs WHERE pool=$1 AND state IN ('queued','running') AND id<>$2 AND priority<=$3",
                                  q["pool"], job_id, prio)
    await publish(job_id, "job.queued", {"job_id": job_id, "position": int(pos), "pool": q["pool"], "at": now})
    await ops_event("job.state", {"job_id": job_id, "tenant_id": tenant, "state": "queued", "aoi_centroid": _centroid(aoi, img),
                                  "pool": q["pool"], "at": now})
    async with db(realm="lx") as conn:
        row = await conn.fetchrow(f"SELECT {JOB_COLS} FROM jobs WHERE id=$1", job_id)
    job = await job_dict(row, await r.hgetall(f"job:{job_id}"))
    return {"job": job, "events_url": f"/api/v1/events/jobs/{job_id}"}


@router.get("/jobs")
async def list_jobs(request: Request, state: str | None = None, tenant_id: str | None = None, limit: int = 50):
    p = require(principal(request))
    r = await redis()
    async with db(p) as conn:
        rows = await conn.fetch(f"SELECT {JOB_COLS} FROM jobs WHERE ($1::text IS NULL OR state=$1) AND ($2::text IS NULL OR tenant_id=$2) "
                                "ORDER BY created_at DESC LIMIT $3", state, tenant_id, min(limit, 500))
    items = [await job_dict(x, await r.hgetall(f"job:{x['id']}")) for x in rows]
    return {"items": items, "total": len(items), "as_of": now_iso()}


async def get_job_row(p: Principal, job_id: str):
    async with db(p) as conn:
        row = await conn.fetchrow(f"SELECT {JOB_COLS} FROM jobs WHERE id=$1", job_id)
    if not row:
        raise ApiError("not_found", f"job {job_id} 없음")
    return row


@router.get("/jobs/{job_id}")
async def get_job(job_id: str, request: Request):
    p = require(principal(request))
    row = await get_job_row(p, job_id)
    r = await redis()
    return await job_dict(row, await r.hgetall(f"job:{job_id}"))


async def _owner_or_admin(p: Principal, row):
    if not (p.is_admin or row["submitted_by"] == p.user_id):
        raise ApiError("forbidden", "제출자 또는 관리자만")


@router.post("/jobs/{job_id}/cancel")
async def cancel(job_id: str, request: Request):
    p = require(principal(request))
    row = await get_job_row(p, job_id)
    await _owner_or_admin(p, row)
    r = await redis()
    now = now_iso()
    if (await r.hget(f"job:{job_id}", "state") or row["state"]) in ("done", "failed", "cancelled"):
        return await job_dict(row, await r.hgetall(f"job:{job_id}"))
    await r.hset(f"job:{job_id}", mapping={"state": "cancelled", "finished_at": now})
    async with db(realm="lx") as conn:
        await conn.execute("UPDATE jobs SET state='cancelled', finished_at=now() WHERE id=$1", job_id)
        await audit(conn, p, "job.cancel", job_id)
    await publish(job_id, "job.cancelled", {"job_id": job_id, "at": now})
    await ops_event("job.state", {"job_id": job_id, "tenant_id": row["tenant_id"], "state": "cancelled",
                                  "aoi_centroid": json.loads(await r.hget(f"job:{job_id}", "centroid") or "null"), "pool": row["pool"], "at": now})
    row = await get_job_row(p, job_id)
    return await job_dict(row, await r.hgetall(f"job:{job_id}"))


@router.post("/jobs/{job_id}/requeue")
async def requeue(job_id: str, request: Request):
    p = require(principal(request))
    row = await get_job_row(p, job_id)
    await _owner_or_admin(p, row)
    r = await redis()
    now = now_iso()
    await r.delete(f"job:{job_id}:done", f"job:{job_id}:failed", f"job:{job_id}:cursor", f"job:{job_id}:final_progress",
                   f"job:{job_id}:finalize", f"job:{job_id}:ts", f"job:{job_id}:counts", f"job:{job_id}:progress_lock")
    await r.hdel(f"job:{job_id}", "first_done_ts", "perf", "chips_per_s", "recovering")
    await r.hset(f"job:{job_id}", mapping={"state": "queued", "shards_done": 0, "shards_failed": 0, "counts": "{}", "gpu_s": 0,
                                           "snapshot_ready": "0", "error": "", "finished_at": "", "started_at": "",
                                           "queued_at_ms": int(time.time() * 1000)})
    async with db(realm="lx") as conn:
        await conn.execute("UPDATE jobs SET state='queued', shards_done=0, shards_failed=0, counts='{}', snapshot_ready=false, error=NULL, "
                           "started_at=NULL, finished_at=NULL WHERE id=$1", job_id)
        await conn.execute("DELETE FROM detections WHERE job_id=$1", job_id)
        await audit(conn, p, "job.requeue", job_id)
    await r.xadd(f"jobs:{row['pool']}", {"job_id": job_id, "priority": row["priority"]})
    await publish(job_id, "job.queued", {"job_id": job_id, "position": 0, "pool": row["pool"], "at": now, "requeue": True})
    row = await get_job_row(p, job_id)
    return await job_dict(row, await r.hgetall(f"job:{job_id}"))


@router.post("/jobs/{job_id}/priority")
async def set_priority(job_id: str, body: dict, request: Request):
    p = require(principal(request))
    row = await get_job_row(p, job_id)
    await _owner_or_admin(p, row)
    prio = int(body.get("priority", row["priority"]))
    if prio not in (0, 1, 2, 3):
        raise ApiError("bad_request", "priority 0..3")
    r = await redis()
    await r.hset(f"job:{job_id}", "priority", prio)
    async with db(realm="lx") as conn:
        await conn.execute("UPDATE jobs SET priority=$2 WHERE id=$1", job_id, prio)
        await audit(conn, p, "job.priority", job_id, {"priority": row["priority"]}, {"priority": prio})
    row = await get_job_row(p, job_id)
    return await job_dict(row, await r.hgetall(f"job:{job_id}"))


@router.delete("/jobs/{job_id}")
async def delete_job(job_id: str, request: Request):
    return await cancel(job_id, request)
