"""관제 읽기·제어(F1-CONTRACT §4.9) — lx admin.

GPU 텔레메트리는 F1-C 폴러(server/ops/gpu_poller.py)가 Redis ops:gpu:{node}:{idx} · ops:gpu 에 쓴다. 폴러가 없으면
/ops/gpus 는 게이트웨이가 nvidia-smi 를 직접 한 번 읽어 같은 형으로 내되 source 에 '폴러 미기동 · 게이트웨이 직접'을 적는다.
큐·노드·모델은 워커 하트비트(Redis) · jobs 표에서, 스토리지는 statfs + du(60s), 경보는 config/alerts.yaml 을 60s 마다 평가.
"""
from __future__ import annotations

import asyncio
import datetime as dt
import json
import secrets
import shutil
import subprocess
import time

from fastapi import APIRouter, Request
from starlette.concurrency import run_in_threadpool

from . import config
from .deps import ApiError, audit, db, principal, redis, require
from .envelope import KST, env, now_iso
from .quota import du_gb, usage_of

router = APIRouter()


_NOWIN = getattr(subprocess, "CREATE_NO_WINDOW", 0)  # 창 깜빡임 방지(Windows)


def nvidia_smi_sample() -> dict:
    """게이트웨이 직접 폴백 — GpuSample 형."""
    at = now_iso()
    q = ["index", "name", "utilization.gpu", "memory.used", "memory.total", "temperature.gpu", "power.draw", "driver_version", "driver_model.current"]
    try:
        out = subprocess.run([config.NVIDIA_SMI, "--query-gpu=" + ",".join(q), "--format=csv,noheader,nounits"], capture_output=True,
                             text=True, timeout=5, creationflags=_NOWIN).stdout
        apps = subprocess.run([config.NVIDIA_SMI, "--query-compute-apps=gpu_uuid,pid,process_name,used_memory", "--format=csv,noheader"],
                              capture_output=True, text=True, timeout=5, creationflags=_NOWIN).stdout
    except Exception as e:  # pragma: no cover
        return {"node": config.NODE_ID, "at": at, "gpus": [], "error": str(e)}
    procs = subprocess.run([config.NVIDIA_SMI], capture_output=True, text=True, timeout=5, creationflags=_NOWIN).stdout
    ext_names = {}
    for line in procs.splitlines():
        if "llama-server" in line or "ollama" in line.lower():
            parts = line.split()
            try:
                gi = int(parts[1])
                ext_names.setdefault(gi, []).append(parts[4].split("\\")[-1] if len(parts) > 4 else "llama-server.exe")
            except (ValueError, IndexError):
                pass
    gpus = []
    for line in out.strip().splitlines():
        v = [s.strip() for s in line.split(",")]
        idx = int(v[0])
        src = "nvidia-smi(게이트웨이 직접 · F1-C 폴러 미기동 폴백)"
        gpus.append({
            "index": idx, "name": v[1],
            "util_pct": env(float(v[2]), "%", "measured", src + " utilization.gpu", as_of=at),
            "mem_used_mib": (env(float(v[3]), "MiB", "measured", src + " memory.used", as_of=at) if float(v[3]) <= float(v[4]) else
                             env(None, "MiB", "measured", src + " memory.used", "nvidia-smi 무효값(드라이버 " + v[7] + " · 재부팅 전?) — 결손", as_of=at)),
            "mem_total_mib": env(float(v[4]), "MiB", "measured", src + " memory.total", as_of=at),
            "temp_c": env(float(v[5]), "°C", "measured", src + " temperature.gpu", as_of=at),
            "power_w": env(float(v[6]), "W", "measured", src + " power.draw", as_of=at),
            "external": [{"pid": 0, "name": n, "mem_mib": None, "note": "WDDM: 프로세스별 VRAM N/A"} for n in ext_names.get(idx, [])],
            "external_used_mib": None, "worker": f"{config.POOL}-{idx}", "job_id": None, "driver": v[7], "mode": v[8]})
    return {"node": config.NODE_ID, "at": at, "gpus": gpus}


async def _worker_self_mib(r, worker: str) -> float | None:
    h = await r.hgetall(f"worker:{worker}:vram")
    return float(h["used_mib"]) if h.get("used_mib") else None


@router.get("/ops/gpus")
async def gpus(request: Request):
    require(principal(request), admin=True)
    r = await redis()
    keys = sorted([k async for k in r.scan_iter(match=f"ops:gpu:{config.NODE_ID}:*", count=2000)])
    if keys:
        gl = []
        for k in keys:
            h = await r.hgetall(k)
            g = json.loads(h["json"]) if "json" in h else {kk: (json.loads(vv) if vv.startswith("{") else vv) for kk, vv in h.items()}
            # 폴러(드라이버 597 · PDH)가 프로세스별 VRAM 을 맨 숫자로 줄 때 — 계약 §0 봉투 규칙에 맞춰 감싼다(값은 그대로)
            for e in (g.get("external") or []) if isinstance(g, dict) else []:
                if isinstance(e, dict) and isinstance(e.get("mem_mib"), (int, float)):
                    e["mem_mib"] = env(e["mem_mib"], "MiB", "measured", "ops:gpu (F1-C 폴러) · Windows PDH GPU Process Memory",
                                       e.get("note"), as_of=g.get("at"))
            if isinstance(g, dict):
                _v11_fields(g, g.get("at") or now_iso(), "ops:gpu (F2-C 폴러)")
            gl.append(g)
        at = max((g.get("at") or "" for g in gl), default=None) if gl and isinstance(gl[0], dict) else None
        return {"node": config.NODE_ID, "at": at or now_iso(), "gpus": gl, "source": "ops:gpu (F1-C 폴러)",
                "power_budget": await power_budget_now([g for g in gl if isinstance(g, dict)])}
    s = await run_in_threadpool(nvidia_smi_sample)
    for g in s["gpus"]:
        w = await _worker_self_mib(r, g["worker"])
        used = g["mem_used_mib"]["value"]
        ext = used - (w or 0)
        g["external_used_mib"] = env(ext, "MiB", "measured", "memory.used − 워커 자기 보고" if w else "memory.used(워커 미기동)",
                                     "워커 미기동 시 = memory.used" if not w else f"워커 {w:.0f} MiB 제외", as_of=s["at"])
        g["job_id"] = await r.hget(f"worker:{g['worker']}:hb", "job_id") or None
        _v11_fields(g, s["at"], "게이트웨이 직접(폴러 미기동)")
    s["note"] = "F1-C 폴러 미기동 — 게이트웨이가 nvidia-smi 를 직접 읽음(폴백)"
    s["power_budget"] = await power_budget_now(s["gpus"])
    return s


async def power_budget_now(gl: list[dict]) -> dict:
    """전력 예산(S-9) — 동시 고부하 GPU 수(실측: power.draw > other_gpu_hot_w 인 장 + 워커 임대) ≤ max_hot_gpus 인가.
    {max_hot, hot_now, ok, hot[], leases} · 관제 큰 숫자 '동시 고부하 GPU' 의 한 출처."""
    from .jobs import power_budget
    pb = await power_budget()
    pw = config.load_yaml("pools").get("power", {}) or {}
    th = float(pw.get("other_gpu_hot_w", 100))
    hot = []
    for g in gl:
        v = (g.get("power_w") or {}).get("value") if isinstance(g.get("power_w"), dict) else g.get("power_w")
        if isinstance(v, (int, float)) and v > th:
            hot.append(g.get("index"))
    lease_gpu = []
    r = await redis()
    for ls in pb["leases"]:
        if ls.get("holder"):
            h = await r.hgetall(f"worker:{ls['holder']}:hb")
            gi = h.get("gpu") or h.get("gpu_index")
            if gi not in (None, "") and str(gi).isdigit() and int(gi) not in hot:
                lease_gpu.append(int(gi))
    hot_now = len(hot) + len(lease_gpu)
    mx = int(pb["max_hot_gpus"])
    return {"max_hot": mx, "hot_now": hot_now, "ok": hot_now <= mx, "hot": sorted(hot + lease_gpu), "threshold_w": th,
            "power_limit_w": pb.get("power_limit_w"), "leases": pb["leases"], "at": now_iso(),
            "source": "nvidia-smi power.draw(장별) + power:hot 임대", "unit": "GPU"}


_NUM_FIELDS = {"util_pct": "%", "util_ma5": "%", "mem_used_mib": "MiB", "mem_total_mib": "MiB", "temp_c": "°C", "power_w": "W",
               "external_used_mib": "MiB", "power_limit_w": "W"}


def _v11_fields(g: dict, at: str, src: str):
    """GpuSample.gpus[i] v1.1-28 필드 통과: util_ma5 · power_w · caution · fault — 폴러(F2-C)가 준 값은 그대로, 맨 숫자는 봉투로 감싸고,
    없는 필드는 결손(null + note). /ops/gpus 500(envelope_missing) 재발 0."""
    for k, unit in _NUM_FIELDS.items():
        v = g.get(k)
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            g[k] = env(v, unit, "measured", f"{src} · {k}", as_of=at)
    if "util_ma5" not in g or g["util_ma5"] is None:
        g["util_ma5"] = env(None, "%", "measured", src, "이동평균 필드 없음(F2-C 폴러 v1.1 이전 또는 폴백)", as_of=at)
    if "power_w" not in g or g["power_w"] is None:
        g["power_w"] = env(None, "W", "measured", src, "power.draw 없음", as_of=at)
    for k in ("caution", "fault"):
        if not isinstance(g.get(k), bool):
            g[k] = None if k not in g or g.get(k) is None else bool(g.get(k))
    for e in g.get("external") or []:
        if isinstance(e, dict):
            for kk in ("mem_mib",):
                if isinstance(e.get(kk), (int, float)) and not isinstance(e.get(kk), bool):
                    e[kk] = env(e[kk], "MiB", "measured", f"{src} · PDH", e.get("note"), as_of=at)
            llm = e.get("llm")
            if isinstance(llm, dict):
                for kk, vv in list(llm.items()):
                    if isinstance(vv, (int, float)) and not isinstance(vv, bool) and kk not in ("reqs_active",):
                        llm[kk] = env(vv, "tokens" if "tok" in kk or kk == "tps" else "count", "measured", f"{src} · vLLM /metrics", as_of=at)


async def queues_snapshot() -> dict:
    r = await redis()
    pools = config.load_yaml("pools")["pools"]
    out = {}
    async with db(realm="lx") as conn:
        rows = await conn.fetch("SELECT pool, state, count(*) n FROM jobs WHERE state IN ('queued','running') GROUP BY 1,2")
        waits = await conn.fetch("SELECT pool, percentile_cont(0.95) WITHIN GROUP (ORDER BY extract(epoch FROM started_at-created_at)) p95 "
                                 "FROM jobs WHERE started_at IS NOT NULL AND created_at > now() - interval '24 hours' GROUP BY 1")
    wmap = {w["pool"]: w["p95"] for w in waits}
    hb = {}
    async for k in r.scan_iter(match="worker:*:hb", count=2000):
        h = await r.hgetall(k)
        hb.setdefault(h.get("pool"), []).append(h)
    for name, pl in pools.items():
        if pl.get("state") == "pending":
            continue
        q = sum(x["n"] for x in rows if x["pool"] == name and x["state"] == "queued")
        ru = sum(x["n"] for x in rows if x["pool"] == name and x["state"] == "running")
        try:
            depth = await r.xlen(f"shards:{name}")
        except Exception:
            depth = 0
        p95 = wmap.get(name)
        out[name] = {"queued": int(q), "running": int(ru), "workers": len(hb.get(name, [])),
                     "p95_wait_s": env(round(float(p95), 1) if p95 is not None else None, "s", "measured", "jobs(started_at − created_at · 24h)",
                                       None if p95 is not None else "시작된 작업 없음"),
                     "shards_backlog": env(depth, "count", "measured", f"XLEN shards:{name}")}
    lanes = []
    async for k in r.scan_iter(match="lane:*", count=2000):
        w = k.split(":", 1)[1]
        blocks = [json.loads(b) for b in await r.lrange(k, 0, 49)]
        lanes.append({"worker": w, "blocks": blocks})
    # 끝나지 않은 블록(running · to 없음) 중 작업이 이미 끝난 것 → 작업 표의 상태·종료 시각으로 닫는다(ops-infra 요청 · 유령 막대 0)
    open_ids = list({b["job_id"] for ln in lanes for b in ln["blocks"] if b.get("state") == "running" and not b.get("to") and b.get("job_id")})
    if open_ids:
        async with db(realm="lx") as conn:
            fin = {x["id"]: x for x in await conn.fetch("SELECT id, state, finished_at FROM jobs WHERE id = ANY($1::text[]) "
                                                          "AND state IN ('done','failed','cancelled')", open_ids)}
        for ln in lanes:
            for b in ln["blocks"]:
                f = fin.get(b.get("job_id"))
                if f and b.get("state") == "running" and not b.get("to"):
                    b["state"] = f["state"]
                    b["to"] = f["finished_at"].astimezone(KST).isoformat(timespec="seconds") if f["finished_at"] else None
    lanes.sort(key=lambda x: x["worker"])
    return {"pools": out, "lanes": lanes, "as_of": now_iso()}


@router.get("/ops/queues")
async def queues(request: Request):
    require(principal(request), admin=True)
    return await queues_snapshot()


@router.get("/ops/nodes")
async def nodes(request: Request):
    require(principal(request), admin=True)
    r = await redis()
    cfg = config.load_yaml("pools")["nodes"]
    items = []
    for n in cfg:
        if n.get("state") == "pending":
            items.append({"id": n["id"], "state": "pending", "note": n.get("note")})
            continue
        h = await r.hgetall(f"node:{n['id']}")
        import socket
        items.append({"id": n["id"], "hostname": h.get("hostname") or socket.gethostname(), "role": n["role"], "pool": n["pool"],
                      "cpu": n["cpu"], "ram_gb": env(n["ram_gb"], "GB", "measured", "env.md(recon-0924) · 512 GB"),
                      "gpus": n["gpus"], "joined_at": h.get("joined_at"), "last_seen": h.get("last_seen"),
                      "state": "up" if h else "down", "workers": json.loads(h.get("workers", "[]")) if h else []})
    return {"items": items, "total": len(items), "as_of": now_iso()}


def _statfs(mount: str):
    try:
        u = shutil.disk_usage(mount + "\\")
        return u.free / 1e9, u.total / 1e9
    except Exception:
        return None, None


@router.get("/ops/storage")
async def storage(request: Request):
    require(principal(request), admin=True)
    r = await redis()
    cached = await r.hgetall("ops:storage")
    if cached.get("json"):
        d = json.loads(cached["json"])
        d.setdefault("source", "ops:storage (F1-C storage_poller)")
        return d
    at = now_iso()
    vols = []
    for m in ("E:", "D:", "C:"):
        f, t = await run_in_threadpool(_statfs, m)
        vols.append({"mount": m, "free_gb": env(round(f, 1) if f else None, "GB", "measured", "statfs(shutil.disk_usage)", as_of=at),
                     "total_gb": env(round(t, 1) if t else None, "GB", "measured", "statfs", as_of=at)})
    tile = await du_gb("tiles")
    res = await du_gb("results") + await du_gb("vector")
    by_tenant = {}
    async with db(realm="lx") as conn:
        ts = [x["id"] for x in await conn.fetch("SELECT id FROM tenants ORDER BY id")]
    for t in ts:
        by_tenant[t] = env(await du_gb("results" if t == "lx" else f"results/{t}"), "GB", "measured", f"du results/{t if t != 'lx' else ''}")
    return {"volumes": vols, "by_tier": {"raw": env(None, "GB", "measured", "-", "원본은 LX_DATA_ROOT 밖 · 목록만"),
                                         "tile": env(tile, "GB", "measured", "du tiles/ (60s 캐시)"),
                                         "result": env(round(res, 3), "GB", "measured", "du results/ + vector/ (60s 캐시)")},
            "by_tenant": by_tenant, "as_of": at, "source": "게이트웨이 statfs + du(F1-C storage_poller 미기동 폴백)"}


@router.get("/ops/alerts")
async def alerts(request: Request):
    require(principal(request), admin=True)
    async with db(realm="lx") as conn:
        rows = await conn.fetch("SELECT id, rule, level, node, gpu, value, opened_at, closed_at FROM ops_alerts ORDER BY opened_at DESC LIMIT 200")
    r = await redis()
    last = await r.get("ops:alerts:last_check")
    items = [{**dict(x), "opened_at": x["opened_at"].astimezone(KST).isoformat(timespec="seconds") if x["opened_at"] else None,
              "closed_at": x["closed_at"].astimezone(KST).isoformat(timespec="seconds") if x["closed_at"] else None} for x in rows]
    return {"items": items, "total": len(items), "last_check": last}


@router.get("/ops/models")
async def ops_models(request: Request):
    require(principal(request), admin=True)
    r = await redis()
    resident: dict[str, list[str]] = {}
    vram: dict[str, float] = {}
    async for k in r.scan_iter(match="worker:*:vram", count=2000):
        h = await r.hgetall(k)
        w = k.split(":")[1]
        for mid in json.loads(h.get("models", "[]")):
            resident.setdefault(mid, []).append(w)
        for mid, mib in json.loads(h.get("model_mib", "{}")).items():
            vram[mid] = max(vram.get(mid, 0), mib)
    pinned = set(config.load_yaml("pools")["pools"]["a6000"].get("resident", []))
    async with db(realm="lx") as conn:
        rows = await conn.fetch("SELECT id, perf FROM models ORDER BY id")
    items = [{"model_id": m["id"], "resident_on": sorted(resident.get(m["id"], [])),
              "vram_mib": env(vram.get(m["id"]), "MiB", "measured", "worker:{id}:vram(torch.cuda.memory_allocated 차이)",
                              None if m["id"] in vram else "상주 안 함"),
              "perf": m["perf"], "pinned": m["id"] in pinned} for m in rows]
    return {"items": items, "total": len(items), "as_of": now_iso()}


@router.get("/ops/tenants")
async def ops_tenants(request: Request):
    require(principal(request), admin=True)
    async with db(realm="lx") as conn:
        ts = [x["id"] for x in await conn.fetch("SELECT id FROM tenants ORDER BY id")]
    return {"items": [await usage_of(t) for t in ts], "total": len(ts), "as_of": now_iso()}


@router.get("/ops/bench")
async def bench(request: Request):
    require(principal(request), lx=True)
    f = config.DATA_ROOT / "cache" / "bench" / "throughput.json"
    items = []
    if f.exists():
        items = json.loads(f.read_text(encoding="utf-8")).get("items", [])
        for it in items:      # 부가 실측 값도 봉투로
            at = it.get("at") or now_iso()
            u = it.pop("util_pct_mean", None)
            m = it.pop("mem_used_during_mib", None)
            it["util_pct_mean"] = env(u, "%", "measured", "nvidia-smi utilization.gpu(bench 중 표본 평균)", as_of=at)
            it["mem_used_during_mib"] = env(m, "MiB", "measured", "nvidia-smi memory.used(bench 끝)", "외부 점유 포함", as_of=at)
    p4 = {"model_id": "aerial25/best", "gpu": "RTX A6000", "batch": 16, "fp16": True, "chip": 1024, "imgsz": 1280,
          "chips_per_s": env(26, "chips_per_s", "measured", "pipeline-run.md §3 (P4 전역 재추론)",
                             "P4 2026-09-24 · 읽기 포함 · 외부 점유 23,396 MiB", as_of="2026-09-24"),
          "external_used_mib": env(23396, "MiB", "measured", "nvidia-smi 2026-09-24", as_of="2026-09-24"), "at": "2026-09-24", "kind": "P4 기록"}
    return {"items": items + [p4], "total": len(items) + 1, "as_of": now_iso(),
            "note": "bench/throughput.py 실측(순수 추론 · 칩 미리 적재) + P4 기록(읽기 포함)"}


@router.post("/ops/nodes/join-token")
async def join_token(request: Request):
    p = require(principal(request), admin=True)
    tok = "nj_" + secrets.token_urlsafe(24)
    exp = dt.datetime.now(KST) + dt.timedelta(hours=24)
    r = await redis()
    await r.set(f"join:{tok}", json.dumps({"by": p.user_id, "at": now_iso()}), ex=86400)
    async with db(realm="lx") as conn:
        await audit(conn, p, "ops.join_token", tok[:8] + "…")
    return {"token": tok, "expires_at": exp.isoformat(timespec="seconds"), "compose_hint": "docker compose -f node.yml up  (Phase 2)"}


async def _control(request: Request, mid: str, action: str, body: dict):
    p = require(principal(request), admin=True)
    w = body.get("worker")
    r = await redis()
    if not w or not await r.exists(f"worker:{w}:hb"):
        raise ApiError("worker_unavailable", f"워커 {w} 하트비트 없음")
    await r.xadd(f"control:{w}", {"action": action, "model_id": mid, "by": p.user_id or "", "at": now_iso()}, maxlen=1000)
    async with db(realm="lx") as conn:
        await audit(conn, p, f"ops.model.{action}", mid, None, {"worker": w})
    from fastapi.responses import JSONResponse
    return JSONResponse({"accepted": True, "worker": w, "model_id": mid, "action": action}, status_code=202)


@router.post("/ops/models/{mid:path}/load")
async def load(mid: str, body: dict, request: Request):
    return await _control(request, mid, "load", body)


@router.post("/ops/models/{mid:path}/unload")
async def unload(mid: str, body: dict, request: Request):
    return await _control(request, mid, "unload", body)


# ── 경보 평가(60s) ────────────────────────────────────────────────────────────
async def evaluate_alerts_once():
    rules = config.load_yaml("alerts")["rules"]
    r = await redis()
    now = time.time()
    metrics: dict[str, list[tuple[str, int | None, float]]] = {}
    # 워커 하트비트
    async for k in r.scan_iter(match="worker:*:hb", count=2000):
        h = await r.hgetall(k)
        age = now - float(h.get("ts", now))
        metrics.setdefault("worker.heartbeat_age_s", []).append((h.get("id"), None, age))
    # 폴러 GPU 해시(없으면 건너뜀)
    async for k in r.scan_iter(match=f"ops:gpu:{config.NODE_ID}:*", count=2000):
        h = await r.hgetall(k)
        try:
            g = json.loads(h["json"]) if "json" in h else None
            if g:
                idx = g.get("index")
                t = (g.get("temp_c") or {}).get("value")
                mu, mt = (g.get("mem_used_mib") or {}).get("value"), (g.get("mem_total_mib") or {}).get("value")
                if t is not None:
                    metrics.setdefault("gpu.temp_c", []).append((config.NODE_ID, idx, t))
                if mu and mt:
                    metrics.setdefault("gpu.mem_pct", []).append((config.NODE_ID, idx, 100 * mu / mt))
        except Exception:
            pass
    f, _ = await run_in_threadpool(_statfs, "E:")
    if f is not None:
        metrics.setdefault("storage.E.free_gb", []).append((config.NODE_ID, None, f))
    async with db(realm="lx") as conn:
        fr = await conn.fetchrow("SELECT count(*) FILTER (WHERE state='failed') f, count(*) n FROM jobs WHERE created_at > now() - interval '1 hour'")
        if fr["n"]:
            metrics.setdefault("jobs.fail_rate_1h_pct", []).append((config.NODE_ID, None, 100 * fr["f"] / fr["n"]))
        for rule in rules:
            for node, gpu, val in metrics.get(rule["metric"], []):
                bad = val > rule["threshold"] if rule["op"] == ">" else val < rule["threshold"]
                aid = f"al_{rule['id']}_{node}_{gpu if gpu is not None else 'x'}"
                open_ = await conn.fetchrow("SELECT id FROM ops_alerts WHERE id=$1 AND closed_at IS NULL", aid)
                value = env(round(val, 2), rule.get("unit", "count") if rule.get("unit") in ("°C", "%", "s", "GB") else "count", "measured", rule["metric"])
                if bad and not open_:
                    await conn.execute("INSERT INTO ops_alerts(id, rule, level, node, gpu, value, opened_at) VALUES ($1,$2,$3,$4,$5,$6,now()) "
                                       "ON CONFLICT (id) DO UPDATE SET opened_at=now(), closed_at=NULL, value=EXCLUDED.value", aid, rule["id"], rule["level"], node, gpu, value)
                    await r.xadd("ops:alerts", {"json": json.dumps({"id": aid, "rule": rule["id"], "level": rule["level"], "node": node, "gpu": gpu,
                                                                     "value": value, "opened_at": now_iso(), "closed_at": None}, ensure_ascii=False)}, maxlen=5000)
                elif not bad and open_:
                    await conn.execute("UPDATE ops_alerts SET closed_at=now() WHERE id=$1", aid)
                    await r.xadd("ops:alerts", {"json": json.dumps({"id": aid, "rule": rule["id"], "level": rule["level"], "node": node, "gpu": gpu,
                                                                     "value": value, "closed_at": now_iso()}, ensure_ascii=False)}, maxlen=5000)
    await r.set("ops:alerts:last_check", now_iso())


async def alert_loop():
    while True:
        try:
            await evaluate_alerts_once()
        except Exception as e:  # pragma: no cover
            print("alert loop error", e, flush=True)
        await asyncio.sleep(60)


# ── 관제 LLM 줄(S-10) · 가동 시간(S-12) ───────────────────────────────────────
@router.get("/ops/llm")
async def ops_llm(request: Request):
    """에이전트 회귀셋 50문 정확도(정답·거절 · 가드 수준) + 백엔드 헬스 — 관제 LLM 줄의 한 출처."""
    require(principal(request), admin=True)
    r = await redis()
    raw = await r.get("agent:redteam:last")
    if not raw:
        f = config.DATA_ROOT / "agent" / "redteam-last.json"
        raw = f.read_text(encoding="utf-8") if f.exists() else None
    rt = json.loads(raw) if raw else None
    models = await r.hgetall("agent:models")          # backends.py 가 hash 로 쓴다(키 = 백엔드 이름)
    bk = {}
    for k, v in (models or {}).items():
        try:
            bk[k] = json.loads(v)
            if isinstance(bk[k], dict) and isinstance(bk[k].get("probe_ms"), (int, float)):
                bk[k]["probe_ms"] = env(bk[k]["probe_ms"], "ms", "measured", "GET /models 헬스 탐침", as_of=bk[k].get("as_of"))
        except Exception:
            bk[k] = v
    out = {"redteam": None, "backends": bk or None, "as_of": now_iso()}
    if rt:
        out["redteam"] = {k: rt.get(k) for k in ("at", "level", "accuracy", "reject_accuracy", "answer_accuracy")}
        out["redteam"]["cases"] = env(rt.get("n"), "count", "recorded", "server/agent/redteam.yaml")
        out["redteam"]["failed"] = [x.get("id") for x in rt.get("failed") or []]
    else:
        out["redteam_note"] = "아직 평가 전 — python -m agent.runner --redteam"
    return out


@router.get("/ops/uptime")
async def ops_uptime(request: Request):
    """가동 시간(S-12) — 게이트웨이 기동 시각 · 워커별 프로세스 시작(psutil) · 마지막 하트비트."""
    require(principal(request), admin=True)
    import psutil
    from .main import BOOT
    now = time.time()
    at = now_iso()

    def up(ts):
        return env(round(now - ts) if ts else None, "s", "measured", "process create_time", None if ts else "알 수 없음", as_of=at)
    items = []
    try:
        gw = psutil.Process().create_time()
    except Exception:
        gw = None
    items.append({"name": "gateway", "boot_at": BOOT.get("boot_at"), "uptime_s": up(gw), "state": "up"})
    r = await redis()
    async for k in r.scan_iter(match="worker:*:hb", count=2000):
        h = await r.hgetall(k)
        pid = h.get("pid")
        ct = None
        try:
            ct = psutil.Process(int(pid)).create_time() if pid else None
        except Exception:
            ct = None
        age = now - float(h.get("ts", now))
        items.append({"name": h.get("id"), "pid_alive": ct is not None, "uptime_s": up(ct),
                      "heartbeat_age_s": env(round(age, 1), "s", "measured", "worker hb"), "state": "up" if age < 30 else "stale"})
    lock = config.SERVER_ROOT / ".workers.lock"
    return {"items": sorted(items, key=lambda x: x["name"] or ""), "lock": lock.read_text(encoding="utf-8").strip() if lock.exists() else None,
            "as_of": at}
