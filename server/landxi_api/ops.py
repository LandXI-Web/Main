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


POWER_WINDOW = 3          # 전력 판정 창 — 폴러 표본(2 s 간격) 최근 3개 평균(≈6 s). 순간 튐 하나로 화면·답이 엇갈리지 않게(r3-ops M14)
POWER_WINDOW_S = 10.0     # 이보다 오래된 표본은 평균에 넣지 않는다(폴러가 멈춘 뒤 옛 값 0)


def _num(v):
    v = v.get("value") if isinstance(v, dict) else v
    return float(v) if isinstance(v, (int, float)) else None


UTIL_HOT_PCT = 50.0       # 전력 값이 없는 GPU 만 — 사용률(이동평균) 이 값 이상이면 고부하(인프라 화면 옛 규칙과 같은 선)


def judge_power(gl: list[dict], th: float, mx: int, lease_gpu: list[int], recent_w: dict | None = None,
                yield_gpu: list[int] | None = None) -> dict:
    """전력 예산 판정 — 인프라 화면 큰 숫자 '동시 고부하 GPU n / m' · 전력 예산 안/초과 · AI 도우미 운영 답(한국어 · 영어)이 모두 이 함수 한 곳을 쓴다.
    GPU 한 장이 고부하 = **실측**으로만: ① 최근 전력 평균(없으면 지금 전력) > th W · ② 전력 값이 없으면 사용률(이동평균) ≥ UTIL_HOT_PCT.
    분석 작업 임대(power:hot)를 쥐고 있기만 한 GPU(모델 올리는 중 · 칸 사이 · 전력 규칙으로 멈춤)는 세지 않는다(why='held' · 'yield').
    (impl-1 · r3-ops 실증 3차 must_fix 2 — GPU 0 이 부하 0% · 20 W 인데 임대만 보고 고부하로 세어 '2 / 1 전력 예산 초과' 빨간 경고가 떴다.
     실측: 분석 중 GPU 는 사용률 5–38% 에서도 110–128 W 라 전력이 판정의 기준이다.)
    전력도 사용률도 모르는 GPU(폴러가 그 장을 못 읽은 때)의 임대만 보수적으로 센다(why='lease').
    → {hot: [순번], hot_now, ok, per: [{gpu, power_w, util_pct, hot, why}]} (why = 'power' | 'util' | 'lease' | 'held' | 'yield' | None)."""
    recent_w = recent_w or {}
    yield_gpu = set(yield_gpu or [])
    per, hot = [], []
    for g in sorted([g for g in gl if isinstance(g, dict)], key=lambda g: g.get("index") or 0):
        i = g.get("index")
        w = recent_w.get(i)
        if w is None:
            w = _num(g.get("power_w"))
        u = _num(g.get("util_ma5"))
        if u is None:
            u = _num(g.get("util_pct"))
        if w is not None:
            why = "power" if w > th else None
        elif u is not None:
            why = "util" if u >= UTIL_HOT_PCT else None
        else:
            why = "lease" if i in lease_gpu else None          # 측정값 0 — 임대만이 단서(보수적)
        if why is None and i in lease_gpu:
            why = "yield" if i in yield_gpu else "held"          # 분석 작업이 쥐고 있지만 실측은 기준 아래 — 고부하 아님
        is_hot = why in ("power", "util", "lease")
        per.append({"gpu": i, "power_w": None if w is None else round(w, 1), "util_pct": None if u is None else round(u, 1),
                    "hot": is_hot, "why": why})
        if is_hot:
            hot.append(i)
    seen = {p["gpu"] for p in per}
    for i in lease_gpu:                     # 표본에 없는 GPU 의 임대(폴러가 그 장을 못 읽은 때) — 전력을 모르니 보수적으로 센다
        if i not in seen:
            hot.append(i)
            per.append({"gpu": i, "power_w": None, "util_pct": None, "hot": True, "why": "lease"})
    hot = sorted(hot)
    return {"hot": hot, "hot_now": len(hot), "ok": len(hot) <= mx, "per": per}


OVERLAP_CACHE: dict = {"at": 0.0, "v": None}


def count_overlap(samples: list[dict], th: float) -> dict:
    """폴러 표본(2 s 간격 · 장별 전력 평균)에서 두 장 이상이 동시에 th W 를 넘은 표본 수 → {n, last_at, samples}.
    '두 장 동시 고부하 금지'(2026-09-26 셧다운) 규칙이 실제로 지켜졌는지의 측정값 — 임대·예고가 아니라 전력 실측으로 본다."""
    n, last = 0, None
    for j in samples:
        ws = [w for w in (_num((g or {}).get("power_w")) for g in j.get("gpus") or []) if w is not None]
        if sum(1 for w in ws if w > th) >= 2:
            n += 1
            last = j.get("at") or last
    return {"n": n, "last_at": last, "samples": len(samples)}


async def _overlap_recent(r, th: float) -> dict:
    """최근 2시간(폴러 스트림 전체 · MAXLEN ~3600 × 2 s) 동시 고부하 표본 수 · 30 s 캐시."""
    if OVERLAP_CACHE["v"] is not None and time.time() - OVERLAP_CACHE["at"] < 30:
        return OVERLAP_CACHE["v"]
    out = {"n": None, "last_at": None, "samples": 0}
    try:
        xs = await r.xrange("ops:gpu")
        js = []
        for _id, f in xs or []:
            try:
                js.append(json.loads(f.get("json") or "{}"))
            except Exception:  # noqa: BLE001
                continue
        out = count_overlap(js, th)
        out["since"] = js[0].get("at") if js else None
    except Exception:  # noqa: BLE001
        pass
    OVERLAP_CACHE.update(at=time.time(), v=out)
    return out


async def _recent_power(r) -> dict:
    """폴러 스트림(ops:gpu) 최근 POWER_WINDOW 표본의 GPU 별 전력 평균 {순번: W}. 스트림이 없으면 {}(지금 값으로 판정)."""
    return (await _recent_sample(r))["avg"]


async def _recent_sample(r) -> dict:
    """→ {avg: {순번: W 평균}, sid: 최신 표본 id | None, at: 최신 표본 시각 | None}.
    sid · at = '판정 시각' — 같은 표본이면 인프라 화면과 AI 도우미 답이 같은 판정을 받는다(r3-ops M14 · 실증 2차 must_fix 2)."""
    try:
        xs = await r.xrevrange("ops:gpu", count=POWER_WINDOW)
    except Exception:  # noqa: BLE001
        return {"avg": {}, "sid": None, "at": None, "gpus": []}
    now = dt.datetime.now(KST)
    acc: dict = {}
    sid = at_s = None
    latest: list = []
    for _id, f in xs or []:
        try:
            j = json.loads(f.get("json") or "{}")
            at_raw = j.get("at") or f.get("at")
            at = dt.datetime.fromisoformat(at_raw)
            if (now - at).total_seconds() > POWER_WINDOW_S:
                continue
        except Exception:  # noqa: BLE001
            continue
        if sid is None:
            sid, at_s, latest = _id, at_raw, [g for g in j.get("gpus") or [] if isinstance(g, dict)]
        for g in j.get("gpus") or []:
            w = _num((g or {}).get("power_w"))
            if w is not None:
                acc.setdefault(g.get("index"), []).append(w)
    return {"avg": {i: sum(v) / len(v) for i, v in acc.items() if v}, "sid": sid, "at": at_s, "gpus": latest}


JUDGE_KEY = "ops:power:judge:"   # + 표본 id · 표본 하나에 판정 하나(먼저 부른 쪽이 정하고 나머지는 같은 값을 읽는다)
JUDGE_TTL_S = 30


async def power_budget_now(gl: list[dict]) -> dict:
    """전력 예산(S-9) — 동시 고부하 GPU 수 ≤ max_hot_gpus 인가(판정 = judge_power 한 곳).
    {max_hot, hot_now, ok, hot[], per[], leases, at(판정 시각)} · LX 관리자 대시보드 큰 숫자 '동시 고부하 GPU' 와 AI 도우미 답의 한 출처.
    판정은 폴러 표본 하나에 한 번 — 같은 표본 시각(at)이면 화면 · 답 · 분석 제출 검사가 모두 같은 판정을 쓴다(Redis 30 s)."""
    r = await redis()
    rs = await _recent_sample(r)
    if rs["sid"]:
        try:
            hit = await r.get(JUDGE_KEY + rs["sid"])
            if hit:
                return json.loads(hit)
        except Exception:  # noqa: BLE001
            pass
    from .jobs import power_budget
    pb = await power_budget()
    pw = config.load_yaml("pools").get("power", {}) or {}
    th = float(pw.get("other_gpu_hot_w", 100))
    lease_gpu, yield_gpu = [], []
    for ls in pb["leases"]:
        if ls.get("holder"):
            h = await r.hgetall(f"worker:{ls['holder']}:hb")
            gi = h.get("gpu") or h.get("gpu_index")
            if gi not in (None, "") and str(gi).isdigit() and int(gi) not in lease_gpu:
                lease_gpu.append(int(gi))
                if h.get("power_gate"):           # 작업기가 전력 규칙으로 멈춰 있다(gpu_worker _gate_note · 해제 때 지운다)
                    yield_gpu.append(int(gi))
    mx = int(pb["max_hot_gpus"])
    if rs["sid"] and rs["gpus"]:
        gl = rs["gpus"]                       # 판정은 그 표본의 GPU 목록으로 — 부른 쪽이 준 목록과 무관하게 표본 하나 = 판정 하나
    j = judge_power(gl, th, mx, lease_gpu, rs["avg"], yield_gpu)
    now_w = {g.get("index"): _num(g.get("power_w")) for g in gl if isinstance(g, dict)}
    for p in j["per"]:                         # 판정에 쓴 값(최근 평균)과 지금 값을 함께 — 행 · 답이 '왜 고부하인지'를 같은 숫자로 말한다
        p["basis"] = "avg" if p["gpu"] in rs["avg"] else "now"
        nw = now_w.get(p["gpu"])
        p["power_now_w"] = None if nw is None else round(nw, 1)
    ov = await _overlap_recent(r, th)
    at = rs["at"] or now_iso()
    out = {"max_hot": mx, **j, "threshold_w": th, "window_s": POWER_WINDOW * 2,
           "overlap": {"n": env(ov.get("n"), "count", "measured", "GPU 전력 표본(2 s) 중 두 장이 함께 기준을 넘은 수", as_of=at),
                       "last_at": ov.get("last_at"), "since": ov.get("since")},
           "power_limit_w": pb.get("power_limit_w"), "leases": pb["leases"], "at": at, "sample": rs["sid"],
           "source": "nvidia-smi power.draw(장별 · 최근 평균) + power:hot 임대", "unit": "GPU"}
    if rs["sid"]:
        try:
            await r.set(JUDGE_KEY + rs["sid"], json.dumps(out, ensure_ascii=False, default=str), ex=JUDGE_TTL_S, nx=True)
            hit = await r.get(JUDGE_KEY + rs["sid"])      # 동시에 두 곳이 정했으면 먼저 쓴 쪽을 따른다
            if hit:
                return json.loads(hit)
        except Exception:  # noqa: BLE001
            pass
    return out


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


_pub_cache: dict = {}


@router.get("/ops/public/findings")
async def public_findings(sgg: str):
    """로그인 장면 숫자(r3-ops) — 시군구 의심 필지 수 한 개(정본 = survey_sgg.findings · 로그인 뒤 화면과 같은 값).
    인증 없음 · 합계 숫자 하나만(필지 · 주소 · 좌표 0). 결과가 없으면 value=null(화면은 숫자를 빼고 문장만). 60 s 캐시."""
    cd = "".join(ch for ch in str(sgg or "") if ch.isdigit())[:5]
    if len(cd) != 5:
        raise ApiError("bad_request", "시군구 코드가 필요합니다")
    c = _pub_cache.get(cd)
    if c and time.time() - c[0] < 60:
        return c[1]
    try:
        from .regions import sgg_codes
        codes = sgg_codes(cd) or [cd]
    except Exception:  # noqa: BLE001
        codes = [cd]
    row = None
    try:
        async with db(realm="lx") as conn:
            row = await conn.fetchrow("SELECT findings, finished_at FROM survey_sgg WHERE sgg_cd = ANY($1::text[]) AND state = 'done' "
                                      "ORDER BY finished_at DESC NULLS LAST LIMIT 1", codes)
    except Exception:  # noqa: BLE001
        row = None
    at = row["finished_at"].astimezone(KST).isoformat(timespec="seconds") if row and row["finished_at"] else now_iso()
    out = {"sgg_cd": cd, "findings": env(int(row["findings"]) if row and row["findings"] is not None else None, "필지", "inferred",
                                         "AI 실태조사 결과(의심 필지)", as_of=at)}
    _pub_cache[cd] = (time.time(), out)
    return out


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


_side: dict = {}


async def alert_loop():
    # 한 흐름(core-flow) 감시도 여기서 함께 띄운다 — 게이트웨이 수명(lifespan) 동안 5 s 마다 배포본 흐름을 잇는다(main.py 무수정)
    if "flow" not in _side:
        from .deploys import flow_loop
        _side["flow"] = asyncio.create_task(flow_loop())
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


# ── 한 흐름(core-flow · 코어 ④) — 배포본 → 결재 → AI 분석(GPU) → 실태조사 → 기관 사용량 한 줄 ─────────────────
@router.get("/ops/flows")
async def ops_flows(request: Request, limit: int = 20):
    """LX 관리자 대시보드 '배포 흐름' — 흐름이 있는 배포본(최근 순) 마다 같은 작업의 GPU 사용 · 기관 계량 · 배포 단계.
    화면은 이름·상태·시간만 그린다(작업 id·GPU 이름·경로 노출 0 — id 는 개발자 서랍·보고서용)."""
    require(principal(request), admin=True)
    from .deploys import flow_detail
    async with db(realm="lx") as conn:
        ids = [r["id"] for r in await conn.fetch("SELECT id FROM deploys WHERE flow IS NOT NULL AND NOT coalesce(test,false) "
                                                  "ORDER BY coalesce((flow->>'updated_at')::timestamptz, updated_at) DESC LIMIT $1", max(1, min(limit, 100)))]
        names = {r["id"]: (r["name"] or {}).get("ko") if isinstance(r["name"], dict) else r["name"]
                 for r in await conn.fetch("SELECT id, name FROM tenants")}
        cards = {r["id"]: (r["name"] or {}).get("ko") if isinstance(r["name"], dict) else r["name"] for r in await conn.fetch("SELECT id, name FROM cards")}
    items = []
    for did in ids:
        x = await flow_detail(did)
        x["tenant_name"] = names.get(x["tenant_id"])
        x["card_name"] = cards.get(x["card_id"])
        gs = sum(((u.get("gpu_s") or {}).get("value") or 0) for u in x["usage"].values())
        x["gpu_s"] = env(round(gs, 1), "gpu_s", "measured", "usage_events(gpu_s · 이 배포본 작업)")
        x["metered_to"] = sorted(x["usage"].keys())
        items.append(x)
    return {"items": items, "total": len(items), "as_of": now_iso()}


# ── 언어 모델 상태 · 켜기(c2-ops · C2 ⑨ · C9 원스톱) ─────────────────────────────────────────
# 화면(LX 관리자 화면 · 인프라)과 운영 도구 ops_models 가 같은 한 출처를 읽는다. 사용자 말만 싣는다: 모델 이름(Gemma 4 · HyperCLOVA X SEED) ·
# 역할(두뇌 · 라우터 · 예비) · 켜짐/꺼짐 · GPU 순번. 포트 · 주소 · 경로 · GPU 제품명은 싣지 않는다.
LLM_SLOTS = [  # (줄 id, 백엔드 이름, 역할, 이름)
    ("brain", "vllm", "두뇌", "Gemma 4"),
    ("router", "router", "라우터", "HyperCLOVA X SEED"),
    ("fallback", "ollama", "예비", "Qwen3"),
]


def _gpu_words(label) -> str | None:
    """'GPU1' → 'GPU 1' · 'GPU0/1 상주' → 'GPU 0·1' (순번만)."""
    import re as _re
    m = _re.search(r"GPU\s*([\d/·,]+)", str(label or ""))
    if not m:
        return None
    nums = [x for x in _re.split(r"[/·,]", m.group(1)) if x.isdigit()]
    return "GPU " + "·".join(nums) if nums else None


async def llm_rows(fresh: bool = False) -> dict:
    """→ {items:[{slot, role, name, on, gpu, can_start}], promo:{name, state, connected}, on_n, as_of} · 켜짐 = 헬스 탐침(GET /v1/models) 성공."""
    from agent import backends as _b, config as _c
    r = await redis()
    raw = {} if fresh else await r.hgetall("agent:models")
    h = {k: json.loads(v) for k, v in raw.items()} if raw else await _b.health(r)
    at = now_iso()
    items = []
    for slot, name, role, label in LLM_SLOTS:
        v = h.get(name) or {}
        on = bool(v.get("ok"))
        items.append({"slot": slot, "role": role, "name": label, "on": on, "gpu": _gpu_words(v.get("gpu") or (_c.BACKENDS.get(name) or {}).get("gpu")),
                      "can_start": slot in ("brain", "router") and not on, "checked_at": v.get("as_of")})
    # 국산 모델 연결 자리(독파모 · config.BACKENDS['dokpamo'] · c2-core) — 설정이 없거나 꺼져 있으면 '연결 전'
    dk = getattr(_c, "BACKENDS", {}).get("dokpamo") or {}
    connected = bool(dk.get("enabled")) and bool((h.get("dokpamo") or {}).get("ok"))
    promo = {"slot": "dokpamo", "role": "국산 모델 연결", "name": "국산 모델", "connected": connected,
             "state": "연결됨" if connected else "연결 전", "configured": bool(dk)}
    n_on = sum(1 for x in items if x["on"])
    return {"items": items, "promo": promo, "on_n": env(n_on, "count", "measured", "언어 모델 헬스 탐침(30s)", as_of=at),
            "total_n": env(len(items), "count", "recorded", "언어 모델 자리(두뇌 · 라우터 · 예비)", as_of=at), "as_of": at}


@router.get("/ops/llm/models")
async def ops_llm_models(request: Request):
    require(principal(request), admin=True)
    return await llm_rows()


@router.post("/ops/llm/start")
async def ops_llm_start(body: dict, request: Request):
    """꺼져 있을 때만 켠다(끄기 · 재시작 없음). 켜진 줄이면 409 already_on · 전력 규칙 위반이면 409 power."""
    p = require(principal(request), admin=True)
    from agent import config as _c
    from ops import llm_start as L
    slot = str((body or {}).get("slot") or "")
    rows = await llm_rows(fresh=True)
    on = {x["slot"]: x["on"] for x in rows["items"]}
    g = await gpus(request)
    gl = [{"index": x.get("index"), "util": ((x.get("util_ma5") or {}).get("value") if isinstance(x.get("util_ma5"), dict) else x.get("util_ma5"))}
          for x in g.get("gpus") or [] if isinstance(x, dict)]
    target = L.gpu_index(_c.BACKENDS.get("vllm", {}).get("gpu")) or 1
    r = await redis()
    starting = bool(await r.get(f"ops:llm:starting:{slot}"))
    d = L.decide(slot, on, g.get("power_budget") or {}, gl, target_gpu=target, starting=starting, script_exists=L.SCRIPT.exists())
    async with db(realm="lx") as conn:
        await audit(conn, p, "ops.llm.start", slot, None, {"ok": d["ok"], "code": d["code"]})
    if not d["ok"]:
        raise ApiError("conflict", d["message"])
    pid = await run_in_threadpool(L.spawn, d["cmd"])
    await r.set(f"ops:llm:starting:{slot}", str(pid), ex=900)
    from fastapi.responses import JSONResponse
    return JSONResponse({"accepted": True, "slot": slot, "message": d["message"]}, status_code=202)


# ── 서버 다시 시작(C9 원스톱 · r3-ops) — 명령줄 start-landxi.ps1 -Restart gateway 를 화면에서 ─────────────────────
@router.post("/ops/gateway/restart")
async def ops_gateway_restart(request: Request):
    """LX 관리자만. 게이트웨이만 다시 띄운다(작업기 · 언어 모델 · 정적 서버 그대로). 이 게이트웨이가 요청을 받은 뒤 아직 살아 있으면 409.
    연속 누름 막기 = Redis 표시(값 = 요청받은 게이트웨이의 기동 시각) — 새 게이트웨이는 기동 시각이 달라 다시 누를 수 있다."""
    p = require(principal(request), admin=True)
    from ops import gateway_restart as G
    from .main import BOOT
    boot = str(BOOT.get("boot_at") or "")
    r = await redis()
    flag = await r.get(G.FLAG)
    d = G.decide(restarting=bool(flag) and flag == boot, script_exists=G.SCRIPT.exists())
    async with db(realm="lx") as conn:
        await audit(conn, p, "ops.gateway.restart", "gateway", None, {"ok": d["ok"], "code": d["code"]})
    if not d["ok"]:
        raise ApiError("conflict", d["message"])
    await r.set(G.FLAG, boot, ex=G.FLAG_TTL_S)
    await run_in_threadpool(G.spawn, d["cmd"])
    from fastapi.responses import JSONResponse
    return JSONResponse({"accepted": True, "message": d["message"], "boot_at": boot}, status_code=202)
