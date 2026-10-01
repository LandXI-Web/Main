"""CPU 워커 — ① finalize:cpu: 전 shard 완료 → 전역 NMS + 후처리(P4 규칙) → detections 교체 → GeoJSON + PMTiles 스냅샷
→ job.done → snapshot.ready · (J1) 정답 대비 P/R qa.json · (옵션 publish_as) 이름 붙은 세트로 게시 + manifest 추가.
② shards:cpu: kind index(F1-D global/adapter_ndvi_pc 등 device cpu 어댑터) shard 실행 → index_results + shard.done + index.month.
"""
from __future__ import annotations

import json
import os
import shutil
import socket
import sys
import threading
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from landxi_api import config  # noqa: E402
from workers import bus, postprocess  # noqa: E402
from workers.bus import emit, env, log, now_iso, ops_event, r  # noqa: E402
from workers.metering import meter  # noqa: E402
from workers.registry_scan import load_adapter, scan_adapters  # noqa: E402
from adapters.base import Shard, run_batch_default  # noqa: E402
from pipelines.snapshot_pmtiles import build as build_pmtiles  # noqa: E402

import argparse as _ap  # noqa: E402
_a = _ap.ArgumentParser()
_a.add_argument("--id", default="cpu-0")                 # cpu-1 … = shard 전용 추가 워커(finalize 는 cpu-0 만)
_a.add_argument("--no-finalize", action="store_true")
ARGS, _ = _a.parse_known_args()
WID = ARGS.id
WHO = WID
FINALIZE = not ARGS.no_finalize and WID == "cpu-0"
FIN = "finalize:cpu"
FIN_SMALL = "finalize:cpu:small"     # 작은 작업 우선 레인(v1.1-17) — 큰 작업 finalize(J2b 전역 NMS 140 s) 뒤에 줄 서지 않게
SHARDS = "shards:cpu"
GROUP = "g:workers"


def heartbeat():
    while True:
        try:
            r().hset(f"worker:{WID}:hb", mapping={"id": WID, "pool": "cpu", "device": "cpu", "ts": time.time(), "pid": os.getpid(),
                                                  "node": config.NODE_ID, "job_id": ""})
            r().expire(f"worker:{WID}:hb", 30)
        except Exception:
            pass
        time.sleep(10)


def _feats_from_shards(sdir: Path) -> list[dict]:
    from shapely.geometry import shape
    out = []
    for f in sorted(sdir.glob("*.geojson")):
        d = json.loads(f.read_text(encoding="utf-8"))
        for ft in d["features"]:
            out.append({"geom": shape(ft["geometry"]), "props": ft["properties"]})
    return out


def finalize(job_id: str):
    from shapely import set_srid, to_wkb
    from shapely.geometry import MultiPolygon, mapping
    t0 = time.time()
    jh = bus.job(job_id)
    if not jh:
        return
    if jh.get("state") in ("cancelled", "failed"):
        return
    demo = jh.get("demo") == "1"
    tenant = jh.get("tenant_id")
    opts = json.loads(jh.get("options") or "{}")
    with bus.pg() as conn:
        mrow = conn.execute("SELECT task FROM models WHERE id=%s", (jh.get("model_id"),)).fetchone()
    task = mrow[0] if mrow else "seg"
    sdir = bus.shard_dir(tenant, job_id, demo)
    raw = _feats_from_shards(sdir) if sdir.exists() else []
    region = None      # 영상 id 로 지역을 추정하지 않는다(읍면동 붙이기는 postprocess 가 결과 좌표로 판단 · core-imagery)
    feats, st = postprocess.run(raw, task=task, region=region)
    for i, f in enumerate(feats):
        f["props"]["fid"] = f["props"].get("id")
    counts: dict[str, int] = {}
    for f in feats:
        counts[f["props"]["cls_en"]] = counts.get(f["props"]["cls_en"], 0) + 1
    jdir = bus.job_dir(tenant, job_id, demo)
    jdir.mkdir(parents=True, exist_ok=True)
    fc = {"type": "FeatureCollection", "name": job_id,
          "features": [{"type": "Feature", "id": f["props"]["id"], "geometry": mapping(f["geom"]),
                        "properties": {k: f["props"].get(k) for k in ("id", "cls", "cls_en", "cid", "conf", "area_m2", "emd", "emd_cd",
                                                                          "edit_state", "job_id", "shard_id", "chip_edge")}} for f in feats]}
    gj = jdir.parent / f"{job_id}.geojson"
    gj.write_text(json.dumps(fc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    # 전역 NMS 결과로 detections 교체(demo 는 0행 유지)
    if not demo:
        with bus.pg() as conn:
            bus.lx_tx(conn)
            conn.execute("DELETE FROM detections WHERE job_id=%s", (job_id,))
            with conn.cursor().copy("COPY detections (tenant_id, job_id, shard_id, fid, cls, cls_en, cid, conf, area_m2, emd, emd_cd, chip_edge, "
                                    "edit_state, geom) FROM STDIN") as cp:
                for f in feats:
                    p = f["props"]
                    g = f["geom"] if f["geom"].geom_type == "MultiPolygon" else MultiPolygon([f["geom"]])
                    cp.write_row((tenant, job_id, p.get("shard_id"), p["id"], p["cls"], p["cls_en"], p.get("cid"), p.get("conf"), p.get("area_m2"),
                                  p.get("emd"), p.get("emd_cd"), bool(p.get("chip_edge")), "raw", to_wkb(set_srid(g, 4326), hex=True, include_srid=True)))
            conn.commit()
    t_nms = time.time() - t0
    started = float(jh.get("started_ts") or t0)
    elapsed = round(time.time() - started, 1)
    gpu_s = float(r().hget(f"job:{job_id}", "gpu_s") or 0)
    n = len(feats)
    rs = jh.get("result_set")
    # qa(J1: 황등 × 차량)
    qa = None
    if jh.get("imagery_id") == "axis-iksan-hwangdeung" and task == "obb":
        try:
            gt = json.loads((config.DATA_ROOT / "results/lx/axis-hwangdeung-gt.geojson").read_text(encoding="utf-8"))
            rv = json.loads((config.DATA_ROOT / "results/lx/axis-hwangdeung-reviewed.geojson").read_text(encoding="utf-8"))
            summ = json.loads((config.DATA_ROOT / "results/lx/axis-hwangdeung-gt-summary.json").read_text(encoding="utf-8"))
            aoi = json.loads(jh["aoi"]) if jh.get("aoi") else None
            m = postprocess.qa_pr(feats, gt, rv, aoi)
            my = postprocess.qa_pr(feats, gt, rv, aoi, scope=("yes",))
            src = "postprocess.qa_pr(OBB↔SAM 폴리곤 IoU≥0.5 · 검토 타일 안)"
            basis = "demo" if demo else "measured"
            qa = {"job_id": job_id, "match_rule": summ["match_rule"],
                  "gt_in_aoi": summ["gt_in_aoi"] if aoi and aoi.get("coordinates") == [summ["aoi"]] else env(m["n_gt"], "count", "measured", "GT ∩ AOI(검토 타일 안)"),
                  "gt_in_scope": env(m["n_gt"], "count", "measured", "GT ∩ AOI ∩ 검토 타일(yes|no)"),
                  "pred_in_scope": env(m["n_pred"], "count", basis, "예측 ∩ AOI ∩ 검토 타일"),
                  "tp": env(m["tp"], "count", basis, src), "fp": env(m["fp"], "count", basis, src), "fn": env(m["fn"], "count", basis, src),
                  "precision": env(round(m["precision"], 3) if m["precision"] is not None else None, "ratio", basis, src,
                                   "하한 — AXIS 'no' 타일에도 실제 차량이 있다(FP 표본 시각 점검 · 결과 문서) · 전수 라벨 아님"),
                  "precision_yes_tiles": env(round(my["precision"], 3) if my["precision"] is not None else None, "ratio", basis,
                                             src.replace("검토 타일", "yes 타일"), f"yes 타일 안 예측 {my['n_pred']} · GT {my['n_gt']}"),
                  "recall_yes_tiles": env(round(my["recall"], 3) if my["recall"] is not None else None, "ratio", basis, src.replace("검토 타일", "yes 타일")),
                  "recall": env(round(m["recall"], 3) if m["recall"] is not None else None, "ratio", basis, src),
                  "mean_iou": env(round(m["mean_iou_matched"], 3) if m["mean_iou_matched"] is not None else None, "ratio", basis, src),
                  "pairs_iou_ge_0_3": env(m["pairs_iou_ge_0_3"], "count", basis, src, "참고: OBB 사각 vs SAM 윤곽은 모양이 달라 IoU 가 낮게 나온다"),
                  "self_consistency": summ["self_consistency"], "at": now_iso()}
            (jdir / "qa.json").write_text(json.dumps(qa, ensure_ascii=False, indent=1), encoding="utf-8")
            log(WHO, f"qa {job_id}: P={m['precision']} R={m['recall']} tp={m['tp']} fp={m['fp']} fn={m['fn']} gt={m['n_gt']}")
        except Exception as e:
            log(WHO, "qa error", repr(e))
    # 면적 계량 — 실제로 분석한 땅(시군구 전역 = 읍면동 ∩ 영상 · 그 밖 = 범위 ∩ 영상). 바깥 테두리로 재지 않는다(장부 고장 ① · 10-01)
    try:
        if jh.get("aoi") or opts.get("scope") == "sgg":
            from workers.metering import analysis_area_km2
            with bus.pg() as conn:
                bus.lx_tx(conn)
                fp = None
                if jh.get("imagery_id") and opts.get("scope") != "sgg":
                    row = conn.execute("SELECT ST_AsGeoJSON(footprint)::json FROM imagery WHERE id=%s", (jh.get("imagery_id"),)).fetchone()
                    fp = row[0] if row else None
                a = analysis_area_km2(json.loads(jh["aoi"]) if jh.get("aoi") else None, opts, fp)
                if a is not None:
                    meter(conn, tenant=tenant, demo=demo, job_id=job_id, dim="area_km2", amount=a)
                conn.commit()
    except Exception as e:
        log(WHO, "area meter error", e)
    counts_env = env(n, "count", "demo" if demo else "inferred", f"{job_id} 전역 NMS 후", "시연 · 결과 미기록" if demo else "검수 전")
    total = int(jh.get("shards_total") or 0)
    perf = done_perf(job_id, total, elapsed, demo, gpu=True)
    gpu_s = perf["gpu_s"]["value"] or gpu_s
    emit(job_id, "job.done", {"job_id": job_id, "counts": counts, "counts_env": counts_env, "shards_total": total,
                              "shards_done": int(jh.get("shards_done") or 0), **perf,
                              "elapsed_s": elapsed, "result_set": rs, "nms": st, "at": now_iso(ms=True)})
    r().hset(f"job:{job_id}", mapping={"counts": json.dumps(counts, ensure_ascii=False), "state": "done", "finished_at": now_iso(),
                                       "perf": json.dumps(perf, ensure_ascii=False), "elapsed_s": elapsed})
    log(WHO, f"job.done {job_id} · GPU 초당 {perf['chips_per_gpu_s']['value']}칩 · 벽시계 {perf['chips_per_wall_s']['value']}칩/s · "
             f"{perf['gpu_s']['value']} GPU·s · {elapsed} s · {total} shard")
    # 스냅샷
    snap = bus.snapshot_path(tenant, job_id, demo)
    t1 = time.time()
    try:
        info = build_pmtiles(gj, snap, minzoom=12 if task == "obb" else 10, maxzoom=20 if task == "obb" else 17, name=job_id)
    except Exception as e:
        log(WHO, "snapshot fail", repr(e))
        info = None
    set_id = rs
    url = f"{config.PUBLIC_BASE}/tiles/pmtiles/{set_id}.pmtiles" if info else None
    if url and (demo or tenant != "lx"):          # 기관 결과·시연 세트는 서명 URL(12h)
        url += "?" + bus.sign(set_id)
    r().hset(f"job:{job_id}", "snapshot_ready", "1" if info else "0")
    with bus.pg() as conn:
        bus.lx_tx(conn)
        conn.execute("UPDATE jobs SET state='done', finished_at=now(), counts=%s, gpu_s=%s, shards_done=%s, shards_failed=%s, snapshot_ready=%s, "
                     "workers=%s, started_at=COALESCE(started_at, %s::timestamptz), perf=%s WHERE id=%s",
                     (json.dumps(counts, ensure_ascii=False), gpu_s, int(jh.get("shards_done") or 0), int(jh.get("shards_failed") or 0), bool(info),
                      json.loads(r().hget(f"job:{job_id}", "workers") or "[]"), jh.get("started_at") or None,
                      json.dumps({**perf, "elapsed_s": elapsed}, ensure_ascii=False), job_id))
        conn.commit()
    emit(job_id, "snapshot.ready", {"job_id": job_id, "set": set_id, "url": url, "features": n, "bytes": info["bytes"] if info else None,
                                    "ms": info["ms"] if info else None, "at": now_iso(ms=True)})
    r().expire(f"events:{job_id}", 7 * 86400)
    ops_event("job.state", {"job_id": job_id, "tenant_id": tenant, "state": "done", "aoi_centroid": json.loads(jh.get("centroid") or "null"),
                            "pool": jh.get("pool"), "at": now_iso()})
    log(WHO, f"finalize {job_id}: raw {st.get('in')} → {n} (nms −{st.get('nms_dropped')} · 면적 −{st.get('in',0)-st.get('after_area',0)} · "
             f"읍면동 밖 −{st.get('outside_emd')}) · nms {t_nms:.1f}s · pmtiles {time.time()-t1:.1f}s · elapsed {elapsed}s")
    # 이름 붙은 세트로 게시(J2b 등)
    pub = opts.get("publish_as")
    if pub and info and not demo:
        dst = config.DATA_ROOT / "results" / "lx" / f"{pub}.pmtiles"
        shutil.copyfile(snap, dst)
        shutil.copyfile(gj, dst.with_suffix(".geojson"))
        try:
            from pipelines._common import manifest_add
            b = None
            if feats:
                from shapely.ops import unary_union
                b = [round(v, 6) for v in unary_union([f["geom"].envelope for f in feats]).bounds]
            manifest_add({"id": f"{pub}.pmtiles", "step": "J2b" if "greenhouse" in pub else "job", "kind": "vector-pmtiles",
                          "path": f"results/lx/{pub}.pmtiles", "layer": "results", "promote_id": "id", "count": n, "count_unit": "polygons",
                          "bounds": b, "minzoom": info["minzoom"], "maxzoom": info["maxzoom"], "bytes": info["bytes"], "job_id": job_id,
                          "model_id": jh.get("model_id"), "imagery_id": jh.get("imagery_id"), "options": opts,
                          "provenance": "추론(검수 전 · 도메인 이식)" if "vh" in pub else "추론(검수 전)"})
        except Exception as e:
            log(WHO, "manifest error", e)
        try:     # 별칭 표(v1.1-19) — /results/results/lx/{pub}/features|stats 가 이 job 의 detections 로 해석
            with bus.pg() as conn:
                bus.lx_tx(conn)
                conn.execute("INSERT INTO published_sets(set_id, job_id, tenant_id, path, n, published_at) VALUES (%s,%s,%s,%s,%s,now()) "
                             "ON CONFLICT (set_id) DO UPDATE SET job_id=EXCLUDED.job_id, tenant_id=EXCLUDED.tenant_id, path=EXCLUDED.path, "
                             "n=EXCLUDED.n, published_at=now()", (f"results/lx/{pub}", job_id, tenant, f"results/lx/{pub}.pmtiles", n))
                conn.commit()
        except Exception as e:
            log(WHO, "published_sets error", repr(e))
        log(WHO, f"published results/lx/{pub}")


def done_perf(job_id: str, total: int, elapsed: float, demo: bool, gpu: bool) -> dict:
    """job.done 두 줄 실측(v1.1-6): chips_per_gpu_s = shards ÷ gpu_s(usage_events 합) · chips_per_wall_s = shards ÷ elapsed_s."""
    gs = None
    try:
        with bus.pg() as conn:
            bus.lx_tx(conn)
            v = conn.execute("SELECT sum(amount) FROM usage_events WHERE job_id=%s AND dim='gpu_s'", (job_id,)).fetchone()[0]
            gs = float(v) if v is not None else None
    except Exception as e:
        log(WHO, "gpu_s sum error", repr(e))
    if gs is None:
        gs = float(r().hget(f"job:{job_id}", "gpu_s") or 0) if gpu else 0.0
    src_u = "usage_events(dim gpu_s · 이 작업 합)" + ("(lx-demo)" if demo else "")
    basis = "measured"
    from workers.perf import done_rates
    per_gpu, per_wall = done_rates(total, gs if gpu else None, elapsed)
    return {
        "gpu_s": env(round(gs, 2), "gpu_s", basis, src_u, None if gpu else "CPU 작업 — GPU 사용 없음"),
        "chips_per_gpu_s": env(per_gpu, "chips_per_gpu_s", basis, f"shards_total {total} ÷ gpu_s {gs:.2f}",
                               "GPU 초당 칩(모델+창 읽기 · 워커 벽시계 합)" if per_gpu else "CPU 작업 — GPU 사용 없음"),
        "chips_per_wall_s": env(per_wall, "chips_per_wall_s", basis, f"shards_total {total} ÷ elapsed_s {elapsed}",
                                "벽시계(첫 배정 → job.done · 전역 NMS 포함 · 스냅샷 제외)"),
        "elapsed_env": env(elapsed, "s", basis, "job.started → job.done(scheduler started_ts · 벽시계)"),
    }


CPU_PROG_LOCK_MS = 900


def cpu_progress(job_id: str, force_final: bool = False):
    """cpu 작업(index · survey · join)도 job.progress(v1.1-9) — shard 마다 · ≤ 1회/s 합치기 · 마지막 1회는 반드시."""
    jh = bus.job(job_id)
    done = int(jh.get("shards_done") or 0)
    failed = int(jh.get("shards_failed") or 0)
    total = int(jh.get("shards_total") or 0)
    final = total > 0 and done + failed >= total
    if final:
        if not r().set(f"job:{job_id}:final_progress", WID, nx=True, ex=7 * 86400):
            return
    elif not r().set(f"job:{job_id}:progress_lock", WID, nx=True, px=CPU_PROG_LOCK_MS):
        return
    now = time.time()
    started = float(jh.get("started_ts") or now)
    counts = {kk: int(v) for kk, v in r().hgetall(f"job:{job_id}:counts").items()}
    el = max(now - started, 1e-6)
    rate = round(done / el, 3) if done and el >= 1 else None
    emit(job_id, "job.progress", {
        "job_id": job_id, "shards_done": done, "shards_total": total, "shards_failed": failed, "counts": counts,
        "chips_per_s": env(rate, "chips_per_s", "measured", f"cpu_worker 계량(누적 {done} shard ÷ {el:.1f}s)",
                           None if rate is not None else "창 짧음"),
        "gpu_s_so_far": env(0, "gpu_s", "measured", "CPU 작업", "GPU 사용 없음"),
        "elapsed_s": round(el, 1), "final": final, "gpu": [], "pool": "cpu", "at": now_iso(ms=True)})


def _adapter_of(jh: dict) -> str | None:
    if jh.get("adapter"):
        return jh["adapter"]
    if jh.get("model_id"):
        with bus.pg() as conn:
            row = conn.execute("SELECT adapter FROM models WHERE id=%s", (jh.get("model_id"),)).fetchone()
        if row and row[0]:
            return row[0]
    from workers.registry_scan import adapter_for_kind
    return adapter_for_kind(jh.get("kind") or "")


def run_cpu_shards(entries):
    byjob: dict[str, list] = {}
    for eid, f in entries:
        byjob.setdefault(f["job_id"], []).append((eid, f))
    for job_id, es in byjob.items():
        jh = bus.job(job_id)
        ids = [e for e, _ in es]
        if not jh or jh.get("state") in ("cancelled", "failed", "done"):
            r().xack(SHARDS, GROUP, *ids)
            r().xdel(SHARDS, *ids)
            continue
        aid = _adapter_of(jh)
        ad, meta = load_adapter(aid)
        if hasattr(ad, "load"):
            try:
                ad.load({"id": jh.get("model_id") or aid, "job": {k: jh.get(k) for k in ("id", "kind", "tenant_id", "deploy_id")}}, "cpu", 0)
            except TypeError:
                pass
        opts = json.loads(jh.get("options") or "{}")
        if not r().hget(f"job:{job_id}", "worker_seen:" + WID):
            r().hset(f"job:{job_id}", "worker_seen:" + WID, 1)
            ws = json.loads(r().hget(f"job:{job_id}", "workers") or "[]")
            if WID not in ws:
                r().hset(f"job:{job_id}", "workers", json.dumps(sorted(ws + [WID])))
        for eid, f in es:
            s = Shard(f["shard_id"], job_id, tuple(json.loads(f["bbox"])), None, json.loads(f.get("params") or "null"))
            att = bus.inflight_start("cpu", job_id, s.id, f, WID)
            emit(job_id, "shard.started", {"job_id": job_id, "shard_id": s.id, "bbox": list(s.bbox4326), "worker": WID, "at": now_iso(ms=True)})
            t0 = time.perf_counter()
            try:
                res = ad.run_shard(s, lambda _s: (None, None, None), {**opts, "job_id": job_id, "attempt": att})
            except Exception as e:
                bus.inflight_end("cpu", job_id, s.id)
                emit(job_id, "shard.failed", {"job_id": job_id, "shard_id": s.id, "error": type(e).__name__, "retry": 0, "at": now_iso(ms=True)})
                if r().sadd(f"job:{job_id}:failed", s.id):
                    r().hincrby(f"job:{job_id}", "shards_failed", 1)
                log(WHO, f"shard.failed {job_id}/{s.id} {e!r}")
                cpu_progress(job_id)
                continue
            ms = int((time.perf_counter() - t0) * 1000)
            live = bus.job(job_id).get("state")
            if live in ("cancelled", "failed") or not bus.inflight_owned("cpu", job_id, s.id, att):
                log(WHO, f"shard {s.id} 결과 버림(감시자가 재배정했거나 작업 종료: {live}) · {ms} ms")
                continue
            bus.inflight_end("cpu", job_id, s.id)
            m = res.metrics or {}
            with bus.pg() as conn:
                bus.lx_tx(conn)
                conn.execute("DELETE FROM index_results WHERE job_id=%s AND shard_id=%s", (job_id, s.id))
                conn.execute("INSERT INTO index_results(tenant_id, job_id, shard_id, key, metrics) VALUES (%s,%s,%s,%s,%s)",
                             (jh.get("tenant_id"), job_id, s.id, (s.params or {}).get("month", s.id),
                              json.dumps({**{k: v for k, v in m.items() if k != "events"}, "ms": m.get("ms", ms)}, ensure_ascii=False, default=str)))
                conn.commit()
            bus.shard_ms_record(aid or jh.get("kind") or "cpu", ms)
            classes = m.get("classes") if isinstance(m.get("classes"), dict) else {}
            if r().sadd(f"job:{job_id}:done", s.id):
                r().hincrby(f"job:{job_id}", "shards_done", 1)
                for k, v in classes.items():
                    try:
                        r().hincrby(f"job:{job_id}:counts", k, int(v))
                    except (TypeError, ValueError):
                        pass
            r().hsetnx(f"job:{job_id}", "first_done_ts", time.time())
            emit(job_id, "shard.done", {"job_id": job_id, "shard_id": s.id, "bbox": list(s.bbox4326), "n": res.n, "classes": classes,
                                        "polys_url": None, "ms": ms, "worker": WID, "at": now_iso(ms=True)})
            # 어댑터가 덧붙이는 이벤트(F2-S survey.finding 등) — metrics.events = [{event, data}]
            for ev in m.get("events") or []:
                if isinstance(ev, dict) and ev.get("event"):
                    emit(job_id, ev["event"], {"job_id": job_id, "shard_id": s.id, **(ev.get("data") or {}), "at": now_iso(ms=True)})
            month = (s.params or {}).get("month")
            if month:
                nd = m.get("ndvi_mean")
                emit(job_id, "index.month", {"job_id": job_id, "shard_id": s.id, "month": month,
                                             "ndvi_mean": nd if isinstance(nd, dict) else env(nd, "ndvi", m.get("basis", "measured"),
                                                                                             m.get("source", "PC S2 L2A B04/B08 · WorldCover 40 마스크"),
                                                                                             m.get("error")),
                                             "n_scenes": m.get("n_scenes"), "cloud_max": (s.params or {}).get("cloud_max", 15),
                                             # v1.1-10: 어댑터 metrics 그대로 — 라이브가 리플레이보다 가난하면 안 된다
                                             "hist": m.get("hist"), "p10": m.get("p10"), "p50": m.get("p50"), "p90": m.get("p90"),
                                             "valid_px": m.get("valid_px"), "crop_px": m.get("crop_px"), "ms": m.get("ms", ms),
                                             "basis": m.get("basis", "measured"), "at": now_iso(ms=True)})
            log(WHO, f"shard.done {job_id}/{s.id} n={res.n} {ms}ms")
            cpu_progress(job_id)
        r().xack(SHARDS, GROUP, *ids)
        r().xdel(SHARDS, *ids)
        jh = bus.job(job_id)
        if int(jh.get("shards_done") or 0) + int(jh.get("shards_failed") or 0) >= int(jh.get("shards_total") or 0) \
                and r().set(f"job:{job_id}:finalize", WID, nx=True):
            cpu_progress(job_id)
            finalize_cpu(job_id)


def finalize_cpu(job_id: str):
    """cpu 작업 마감(index · survey · join) — 어댑터 finalize(job) 훅이 있으면 부르고, job.done(두 줄 실측 · counts)."""
    jh = bus.job(job_id)
    now = now_iso()
    n = int(jh.get("shards_done") or 0)
    total = int(jh.get("shards_total") or 0)
    kind = jh.get("kind")
    counts = {kk: int(v) for kk, v in r().hgetall(f"job:{job_id}:counts").items()}
    extra = {}
    try:
        from workers.registry_scan import adapter_module
        aid = _adapter_of(jh)
        mod = adapter_module(aid) if aid else None
        fn = getattr(mod, "finalize", None) if mod else None
        if callable(fn):
            from workers.scheduler import job_view
            extra = fn(job_view(jh)) or {}
            if isinstance(extra.get("counts"), dict):
                counts = extra.pop("counts")
    except Exception as e:
        log(WHO, "adapter finalize error", job_id, repr(e))
    if kind == "index" and not counts:
        counts = {"months": n}
    elapsed = round(time.time() - float(jh.get("started_ts") or time.time()), 1)
    perf = done_perf(job_id, total, elapsed, jh.get("demo") == "1", gpu=False)
    cnt = sum(counts.values()) if kind != "index" else n
    emit(job_id, "job.done", {"job_id": job_id, "counts": counts,
                              "counts_env": env(cnt, "count", "measured" if kind == "index" else "inferred",
                                                "index_results" if kind == "index" else f"{jh.get('adapter') or kind} shard 합",
                                                "지수 계산 · 모델 추론 아님" if kind == "index" else "규칙 재평가 · 검수 전"),
                              "shards_total": total, "shards_done": n, **perf, "elapsed_s": elapsed, "result_set": jh.get("result_set"),
                              **{k: v for k, v in extra.items() if k not in ("job_id", "at")}, "at": now})
    r().hset(f"job:{job_id}", mapping={"state": "done", "finished_at": now, "counts": json.dumps(counts, ensure_ascii=False),
                                       "perf": json.dumps(perf, ensure_ascii=False), "elapsed_s": elapsed})
    with bus.pg() as conn:
        bus.lx_tx(conn)
        conn.execute("UPDATE jobs SET state='done', finished_at=now(), shards_done=%s, counts=%s, perf=%s WHERE id=%s",
                     (n, json.dumps(counts, ensure_ascii=False), json.dumps({**perf, "elapsed_s": elapsed}, ensure_ascii=False), job_id))
        conn.commit()
    ops_event("job.state", {"job_id": job_id, "tenant_id": jh.get("tenant_id"), "state": "done", "aoi_centroid": json.loads(jh.get("centroid") or "null"),
                            "pool": "cpu", "at": now})
    log(WHO, f"job.done {job_id} kind={kind} {n}/{total} shard · 벽시계 {perf['chips_per_wall_s']['value']} shard/s · {elapsed}s")


finalize_index = finalize_cpu     # 예전 이름(호환)


def main():
    threading.Thread(target=heartbeat, daemon=True).start()
    ads = scan_adapters()
    log(WHO, "adapters:", ", ".join(f"{k}({v['_scope']}·{v.get('device')})" for k, v in ads.items()))
    if FINALIZE:
        try:   # 어댑터 스캔 → models 자동 등록(global/ 포함)
            from workers.registry_scan import scan_models, upsert_models_sql
            with bus.pg() as conn:
                upsert_models_sql(conn.cursor(), scan_models())
                conn.commit()
            log(WHO, "models 등록 동기화 완료")
        except Exception as e:
            log(WHO, "models sync error", repr(e))
    bus.ensure_group(FIN, "g:cpu")
    bus.ensure_group(FIN_SMALL, "g:cpu")
    bus.ensure_group(SHARDS, GROUP)
    if FINALIZE:
        threading.Thread(target=fin_loop, args=(FIN_SMALL,), daemon=True, name="finalize-small").start()
        threading.Thread(target=fin_loop, args=(FIN,), daemon=True, name="finalize").start()
        log(WHO, "ready · finalize:cpu:small(≤16 shard 우선 레인) · finalize:cpu(전용 스레드) · shards:cpu")
    else:
        log(WHO, "ready · shards:cpu 전용(추가 cpu 워커 · finalize 는 cpu-0)")
    while True:
        try:
            loop_once()
        except bus.REDIS_ERRORS as e:
            bus.redis_hiccup(WHO, e)


def fin_loop(stream: str = FIN):
    """finalize 는 자기 스레드에서 — 느린 index shard(PC 원격 · 수십 초)가 GPU 작업의 스냅샷을 막지 않게(2026-09-26 실측: 막히면 +280s).
    레인 둘: finalize:cpu:small(≤ 16 shard · 대화형 시연) 과 finalize:cpu(대량) — 큰 작업의 전역 NMS 뒤에 작은 작업이 줄 서지 않는다."""
    while True:
        try:
            fin_once(stream)
        except bus.REDIS_ERRORS as e:
            bus.redis_hiccup(WHO, e)
        except Exception as e:  # pragma: no cover
            log(WHO, "fin loop error", repr(e))
            time.sleep(1)


def fin_once(stream: str = FIN):
    res = r().xreadgroup("g:cpu", WID + (":fin-s" if stream == FIN_SMALL else ":fin"), {stream: ">"}, count=1, block=500)
    for _, entries in res or []:
        for eid, f in entries:
            try:
                jh = bus.job(f["job_id"])
                if jh.get("pool") == "cpu" or jh.get("kind") in ("index", "survey", "join"):
                    finalize_cpu(f["job_id"])
                else:
                    finalize(f["job_id"])
            except Exception as e:
                import traceback
                log(WHO, "finalize error", f.get("job_id"), repr(e), traceback.format_exc()[-800:])
                jid = f.get("job_id")
                r().hset(f"job:{jid}", mapping={"state": "failed", "error": f"finalize: {e}"})
                emit(jid, "job.failed", {"job_id": jid, "error": f"finalize: {type(e).__name__}", "at": now_iso()})
            r().xack(stream, "g:cpu", eid)


def loop_once():
    if True:
        res = r().xreadgroup(GROUP, WID, {SHARDS: ">"}, count=1, block=500)
        entries = res[0][1] if res else []
        if entries:
            try:
                run_cpu_shards(entries)
            except Exception as e:
                log(WHO, "cpu shard error", repr(e))


if __name__ == "__main__":
    main()
