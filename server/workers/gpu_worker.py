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
OTHER_HOT_W = float(PWR.get("other_gpu_hot_w", 120))       # 다른 GPU(vLLM · Ollama 등 · 임대 밖) 전력 이동평균이 이보다 높으면 새 묶음을 잠시 미룬다
OTHER_WAIT_LOG_S = float(PWR.get("other_wait_log_s", 15))  # 대기 중 로그·HUD 사유 갱신 주기(폴백 진행 없음 — 사용자 절대 규칙: 두 장 동시 고부하 금지)
GATE_CHUNK = max(1, int(PWR.get("gate_chunk", 8)))          # 읽어 간 묶음 안에서도 이 칸 수마다 다른 GPU 를 다시 본다(이미 읽은 묶음과의 겹침 제거)
FAST_POLL_S = float(PWR.get("fast_poll_s", 0.1))            # NVML 순간 전력 폴링(반응 지연 ↓)
QUIET_S = float(PWR.get("other_quiet_s", 20))               # 다른 GPU 가 내려간 뒤 이만큼 조용해야 재개(에이전트 LLM 호출은 몇 초 간격으로 몰려 온다 — 실측 겹침 3구간 중 2구간이 재개 2·14 s 뒤)
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

state = {"job_id": None, "budget": 0, "external": 0, "gpu_util": {}, "gpu_mem": {}, "other_since": None, "other_logged": 0.0,
         "gate_total_s": 0.0, "gate_job": None, "last_job": None}


def nvml_loop():
    """NVML 순간 전력 0.1 s 폴링 → smi['pfast'] — nvidia-smi -lms 500 스트림은 0.5–1 s 늦게 안다(겹침 원인 2)."""
    from workers import nvml_power
    if not nvml_power.available():
        log(WHO, "NVML 전력 폴링 불가 — nvidia-smi 스트림(0.5 s)만으로 게이트")
        return
    log(WHO, f"NVML 전력 폴링 {FAST_POLL_S * 1000:.0f} ms · {nvml_power.read()} W")
    while True:
        try:
            v = nvml_power.read()
            if v:
                smi["pfast"], smi["pfast_at"], smi["pfast_mode"] = v, time.time(), nvml_power.mode()
        except Exception as e:
            log(WHO, "nvml error", repr(e))
            time.sleep(2)
        time.sleep(FAST_POLL_S)


def other_gpu_hot():
    """이 워커 밖 GPU 가 고부하인가 → (index, W) | None. 전력 규칙(동시 고부하 ≤ 1장)을 임대 밖 부하(vLLM · Ollama)까지.
    NVML 순간값(0.1 s · 신선할 때) · nvidia-smi 최신 표본 · 5표본 이동평균 중 가장 큰 값으로 본다(켜질 땐 빨리 · 꺼질 땐 보수적으로)."""
    fast = smi.get("pfast") or {}
    fresh = time.time() - float(smi.get("pfast_at") or 0) < 0.5
    idx = set(fast) | set((smi.get("pring") or {}).keys())
    for i in sorted(idx):
        if i == A.gpu:
            continue
        ring = list((smi.get("pring") or {}).get(i) or [])
        cand = []
        if ring:
            cand += [sum(ring) / len(ring), ring[-1]]
        if fresh and i in fast:
            cand.append(fast[i])
        if cand and max(cand) > OTHER_HOT_W:
            return i, round(max(cand), 1)
    return None


def gate_block():
    """→ (gpu, W, 남은 조용 s) | None. 다른 GPU 가 지금 고부하이거나, 내려간 지 QUIET_S 가 안 됐으면 막는다(히스테리시스)."""
    hot = other_gpu_hot()
    now = time.time()
    if not hot:
        try:
            req = r().get(bus.LLM_REQ)          # LLM 호출 예고(협조 임대) — GPU1 이 오르기 전에 먼저 멈춘다
        except Exception:
            req = None
        if req:
            g = 1 if A.gpu != 1 else 0
            hot = (g, round(float((smi.get("pfast") or {}).get(g) or 0), 1))
            state["other_req"] = req
    if hot:
        state["other_last_hot"], state["other_last"] = now, hot
        return hot[0], hot[1], QUIET_S
    left = QUIET_S - (now - float(state.get("other_last_hot") or 0))
    if left > 0 and state.get("other_last"):
        g = state["other_last"][0]
        cur = (smi.get("pfast") or {}).get(g) or (smi.get("power") or {}).get(g) or 0
        return g, round(float(cur), 1), round(left, 1)
    return None


def _gate_note(hot, waited: float, where: str):
    """대기 로그 · 하트비트 · HUD 사유(job.progress.power_gate) 갱신 — 진행은 하지 않는다."""
    cooling = hot[1] <= OTHER_HOT_W
    req = r().get(bus.LLM_REQ)
    msg = (f"LLM 호출 예고({req}) · GPU{hot[0]} {hot[1]} W · 대기 {waited:.0f}s" if req else
           f"GPU{hot[0]} {hot[1]} W · 식는 중(조용 {QUIET_S:.0f}s 확인 · 남은 {hot[2]:.0f}s) · 대기 {waited:.0f}s" if cooling
           else f"GPU{hot[0]} {hot[1]} W > {OTHER_HOT_W:.0f} W · 대기 {waited:.0f}s")
    r().hset(f"worker:{WID}:hb", mapping={"power_gate": msg, "power_gate_since": state["other_since"] or time.time()})
    log(WHO, f"power gate 대기({where}) · {msg} · 임대 밖 부하(vLLM/Ollama) — 두 장 동시 고부하 금지 · 폴백 진행 없음")
    jid = state.get("job_id") or state.get("gate_job") or state.get("last_job")
    if jid:
        jh = bus.job(jid)
        if jh and jh.get("state") == "running":
            progress(jid, jh, force=True, gate={"waiting": True, "gpu": hot[0], "w": hot[1], "limit_w": OTHER_HOT_W,
                                                "waited_s": round(waited, 1), "where": where,
                                                "quiet_left_s": hot[2],
                                                "reason": (f"전력 규칙 · LLM 호출 예고 — GPU{hot[0]} 차례" if req else
                                                           f"전력 규칙 · GPU{hot[0]} 식는 중 — {hot[2]:.0f}s 뒤 재개" if cooling
                                                           else f"전력 규칙 · GPU{hot[0]} 고부하 {hot[1]:.0f} W — 내려갈 때까지 대기")})


def _gate_clear():
    if state["other_since"]:
        waited = time.time() - state["other_since"]
        state["gate_total_s"] = state.get("gate_total_s", 0.0) + waited
        log(WHO, f"power gate 해제 · 다른 GPU 부하 내려감({waited:.1f}s 대기 · 누적 {state['gate_total_s']:.1f}s)")
        r().hdel(f"worker:{WID}:hb", "power_gate", "power_gate_since")
    state["other_since"], state["other_logged"] = None, 0.0


def power_gate() -> int:
    """→ 이번 묶음 크기(0 = 기다림). 다른 GPU 가 고부하면 내려갈 때까지 새 묶음을 읽지 않는다.
    (v2 의 '30 s 뒤 batch 4 폴백'은 없앰 — 판정 실측 겹침 12표본의 원인 · 사용자 절대 규칙이 기아 방지보다 우선)"""
    hot = gate_block()
    if not hot:
        _gate_clear()
        return BATCH
    now = time.time()
    if not state["other_since"]:
        state["other_since"] = now
    if now - (state["other_logged"] or 0) >= OTHER_WAIT_LOG_S:
        state["other_logged"] = now
        _gate_note(hot, now - state["other_since"], "묶음 전")
    return 0


def hold_while_other_hot(job_id: str, shard_ids: list) -> float:
    """읽어 간 묶음 안(칸 사이)에서 다른 GPU 가 고부하가 되면 멈춘다 → 멈춘 초(계량 gpu_s 에서 뺀다).
    멈춘 동안 임대 TTL · 비행 기록 ts 를 갱신해 고아 감시가 재배정하지 않게 한다."""
    hot = gate_block()
    if not hot:
        return 0.0
    t0 = time.time()
    state["gate_job"] = job_id
    if not state["other_since"]:
        state["other_since"] = t0
    last_note = 0.0
    while hot:
        now = time.time()
        if now - last_note >= OTHER_WAIT_LOG_S:
            last_note = now
            _gate_note(hot, now - state["other_since"], "묶음 안")
            if lease["slot"] is not None:
                r().expire(f"power:hot:{lease['slot']}", LEASE_TTL)
            for sid in shard_ids:
                bus.inflight_touch(POOL, job_id, sid)
        time.sleep(0.1)
        hot = gate_block()
    _gate_clear()
    state["gate_job"] = None
    return time.time() - t0


models: "OrderedDict[str, tuple]" = OrderedDict()   # model_id → (adapter, meta, mib)
_local = threading.local()


# ── 창 읽기 ──────────────────────────────────────────────────────────────────
def _ds(path: str):
    """스레드별 데이터셋 캐시. path 가 'imagery:{id}' 면 core-imagery 의 imagery_src.open_imagery(VRT · 가상 영상 공통)로 연다."""
    import rasterio
    c = getattr(_local, "ds", None)
    if c is None:
        c = _local.ds = {}
    d = c.get(path)
    if d is None:
        if path.startswith("imagery:"):
            from workers.imagery_src import open_imagery
            d = c[path] = open_imagery(path.split(":", 1)[1])
        else:
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
        try:
            import workers.imagery_src  # noqa: F401  (core-imagery 계약 — 있으면 영상은 그것으로 연다)
            c[imagery_id] = "imagery:" + imagery_id
        except ImportError:
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
            ws = sorted(k.split(":")[1] for k in r().scan_iter(match="worker:*:hb", count=2000))
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


SMI_WIN = 5          # 이동평균 표본 수(0.5 s × 5 ≈ 2.5 s · v1.1-7)
smi = {"ring": {}, "power": {}, "mem": {}, "total": {}, "raw": {}, "at": 0.0, "pdh": {}, "pdh_at": 0.0, "src": None,
       "linked": False, "invalid": False}


def _pdh_dedicated() -> dict:
    """Windows PDH 'GPU Adapter Memory(*_phys_i)/Dedicated Usage' → {i: MiB}. 연결 어댑터(두 장이 한 LUID)일 때만(≈2.5 s)."""
    import re as _re
    import subprocess
    out = subprocess.run(["typeperf", "\\GPU Adapter Memory(*)\\Dedicated Usage", "-sc", "1"], capture_output=True, text=True, timeout=15,
                         encoding="mbcs", errors="replace", creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0)).stdout
    lines = [ln for ln in out.splitlines() if ln.startswith('"')]
    if len(lines) < 2:
        return {}
    hdr = [h.strip('"') for h in lines[0].split('","')]
    val = [v.strip('"') for v in lines[1].split('","')]
    groups: dict = {}
    for h, v in zip(hdr[1:], val[1:]):
        m = _re.search(r"luid_(0x[0-9A-Fa-f]+_0x[0-9A-Fa-f]+)_phys_(\d+)", h)
        if m:
            try:
                groups.setdefault(m.group(1), {})[int(m.group(2))] = int(float(v) / 2**20)
            except ValueError:
                pass
    best = max(groups.values(), key=lambda g: (len(g), sum(g.values())), default={})
    return best if len(best) >= 2 else {}


def _pdh_loop():
    while True:
        try:
            if smi.get("linked") or smi.get("invalid"):
                d = _pdh_dedicated()
                if d:
                    smi["pdh"], smi["pdh_at"] = d, time.time()
        except Exception:
            pass
        time.sleep(15)


def smi_sampler():
    """nvidia-smi -lms 500 스트림(DriverStore 최신 · LX_NVSMI 우선) → GPU 별 링버퍼 5 → util 이동평균 · power_w(v1.1-7 · v1.1-18)."""
    import subprocess
    cmd = [bus.nvsmi(), "--query-gpu=index,utilization.gpu,power.draw,memory.used,memory.total", "--format=csv,noheader,nounits", "-lms", "500"]
    smi["src"] = "nvidia-smi -lms 500"
    threading.Thread(target=_pdh_loop, daemon=True).start()
    while True:
        try:
            p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, bufsize=1,
                                 creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            for line in p.stdout:
                v = [x.strip() for x in line.split(",")]
                if len(v) < 5:
                    continue
                try:
                    i, u = int(v[0]), float(v[1])
                except ValueError:
                    continue
                smi["ring"].setdefault(i, deque(maxlen=SMI_WIN)).append(u)
                smi["raw"][i] = u
                try:
                    smi["power"][i] = round(float(v[2]), 1)
                    smi.setdefault("pring", {}).setdefault(i, deque(maxlen=SMI_WIN)).append(float(v[2]))
                except ValueError:
                    smi["power"][i] = None
                try:
                    used, tot = float(v[3]), float(v[4])
                    smi["total"][i] = tot
                    smi["invalid"] = not (0 <= used <= tot)
                    smi["mem"][i] = None if smi["invalid"] else int(used)
                except ValueError:
                    smi["mem"][i] = None
                vals = [x for x in smi["mem"].values() if x is not None]
                smi["linked"] = len(smi["mem"]) > 1 and len(vals) == len(smi["mem"]) and len(set(vals)) == 1
                smi["at"] = time.time()
                state["gpu_util"][i] = u          # 호환(예전 이름)
                state["gpu_mem"][i] = smi["mem"][i]
        except Exception as e:
            log(WHO, "smi stream error", repr(e))
        time.sleep(2)


def gpu_list(job_id):
    """job.progress.gpu[] — util_pct = 최근 5표본 이동평균(카드 전체 · 공유) · power_w · mem · gpu_s_so_far(이 작업 · 그 GPU 워커 몫)."""
    out = []
    per = {}
    if job_id:
        h = r().hgetall(f"job:{job_id}")
        per = {kk.split(":", 1)[1]: float(vv) for kk, vv in h.items() if kk.startswith("gpu_s:")}
    for i in sorted(smi["ring"]):
        ring = list(smi["ring"][i])
        ma = moving_avg(ring)
        mem, note = smi["mem"].get(i), None
        if (smi.get("linked") or mem is None) and smi.get("pdh"):
            mem, note = smi["pdh"].get(i, mem), "PDH Dedicated Usage(phys_%d · index 대응은 PCI 순서 가정) — nvidia-smi 는 연결 어댑터 합계값" % i
        elif smi.get("linked"):
            note = "nvidia-smi 연결 어댑터 합계값(두 장 같은 값) — 장별 아님"
        elif mem is None:
            note = "nvidia-smi memory.used 무효값(언더플로) — 결손"
        wid = f"{POOL}-{i}"
        out.append({"index": i, "util_pct": ma, "util_raw": smi["raw"].get(i), "samples": len(ring), "power_w": smi["power"].get(i),
                    "mem_used_mib": mem, "mem_note": note, "shared": True, "worker": wid,
                    "gpu_s_so_far": round(per[wid], 2) if wid in per else (0.0 if job_id else None),
                    "source": f"{smi['src']} · 이동평균 {SMI_WIN}표본(≈{SMI_WIN * 0.5:.1f}s) · 카드 전체(공유)"})
    return out


# ── 진행 이벤트 ────────────────────────────────────────────────────────────────
from workers.perf import CPS_WINDOW_S, chips_rate as _rate, moving_avg  # noqa: E402


def chips_rate(job_id: str, jh: dict, done: int, now: float):
    """진행 중 chips_per_s(v1.1-5 · workers/perf.py 규칙): 창 ≥ 1 s 이고 완료 shard ≥ 8 일 때만 값 · 그 전엔 None + '창 짧음'."""
    k = f"job:{job_id}:ts"
    r().zremrangebyscore(k, 0, now - CPS_WINDOW_S)
    n10 = r().zcount(k, now - CPS_WINDOW_S, now)
    first = float(jh.get("first_done_ts") or now)
    span = min(CPS_WINDOW_S, now - first)
    v, note = _rate(n10, now - first, done)
    return v, round(max(span, 0), 2), note


def progress(job_id: str, jh: dict, force: bool = False, gate: dict | None = None):
    """≤ 1회/s(progress_lock 900 ms) · 마지막 shard 뒤에는 lock 을 우회해 shards_done == shards_total 인 progress 를 1회 반드시(v1.1-8)."""
    done = int(r().hget(f"job:{job_id}", "shards_done") or 0)
    failed = int(r().hget(f"job:{job_id}", "shards_failed") or 0)
    total = int(jh.get("shards_total") or 0)
    final = total > 0 and done + failed >= total
    if final and gate:
        return
    if final:
        if not r().set(f"job:{job_id}:final_progress", WID, nx=True, ex=7 * 86400):
            return
    elif not force and not r().set(f"job:{job_id}:progress_lock", WID, nx=True, px=900):
        return
    now = time.time()
    cps, span, cps_note = chips_rate(job_id, jh, done, now)
    counts = {kk: int(v) for kk, v in r().hgetall(f"job:{job_id}:counts").items()}
    started = float(jh.get("started_ts") or now)
    if cps is not None:
        r().hset(f"job:{job_id}", "chips_per_s", cps)
    r().hset(f"job:{job_id}", "counts", json.dumps(counts, ensure_ascii=False))
    gs = float(r().hget(f"job:{job_id}", "gpu_s") or 0)
    emit(job_id, "job.progress", {
        "job_id": job_id, "shards_done": done, "shards_total": total, "shards_failed": failed, "counts": counts,
        "chips_per_s": env(cps, "chips_per_s", "measured", f"gpu_worker 계량(창 {span:.1f}s · 전 워커 합)",
                           cps_note or f"최근 {CPS_WINDOW_S:.0f}s 창"),
        "gpu_s_so_far": env(round(gs, 2), "gpu_s", "measured", "usage_events(이 작업 누적)"),
        "elapsed_s": round(now - started, 1), "final": final,
        "gpu": gpu_list(job_id),
        "power_gate": gate or {"waiting": False, "waited_total_s": round(state.get("gate_total_s", 0.0), 1)},
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
    state["job_id"] = state["last_job"] = job_id
    if not r().hget(f"job:{job_id}", "worker_seen:" + WID):
        r().hset(f"job:{job_id}", "worker_seen:" + WID, 1)
        ws = json.loads(r().hget(f"job:{job_id}", "workers") or "[]")
        if WID not in ws:
            ws.append(WID)
            r().hset(f"job:{job_id}", "workers", json.dumps(sorted(ws)))
        bus.lane(WID, {"job_id": job_id, "from": now_iso(), "to": None, "state": "running", "tenant_id": tenant})
    shards = []
    attempts = {}
    sgg = opts.get("scope") == "sgg"
    for eid, f in entries:
        w = json.loads(f.get("window") or "null")
        s = Shard(f["shard_id"], job_id, tuple(json.loads(f["bbox"])), w, json.loads(f.get("params") or "null"))
        shards.append(s)
        attempts[s.id] = bus.inflight_start(POOL, job_id, s.id, f, WID)      # 고아 감시(v1.1-14)
        if not sgg:                                     # 시군구 전역(1만 칸 이상)은 shard.started 를 싣지 않는다 — 이벤트 스트림(1만 줄)을 결과(shard.done)에 쓴다
            emit(job_id, "shard.started", {"job_id": job_id, "shard_id": s.id, "bbox": list(s.bbox4326), "worker": WID, "at": now_iso(ms=True)})
    t0 = time.perf_counter()
    futs = {s.id: pool_io.submit(read_window, path, s.window) for s in shards}
    cache = {}

    def reader(s):
        if s.id not in cache:
            cache[s.id] = futs[s.id].result()
        return cache[s.id]

    run = getattr(ad, "run_batch", None)
    sdir = bus.shard_dir(tenant, job_id, demo)
    sdir.mkdir(parents=True, exist_ok=True)
    t_read = 0.0
    # 칸 묶음(GATE_CHUNK)마다: 다른 GPU 확인(전력 규칙 · 폴백 없음) → 그 묶음의 창만 기다림 → 추론 → 바로 기록 · shard.done.
    # (예전: 16칸 창을 다 읽고 16칸을 다 돌린 뒤에야 첫 shard.done — 실시간 분석의 첫 결과가 한 묶음만큼 늦었다)
    for c0 in range(0, len(shards), GATE_CHUNK):
        part = shards[c0:c0 + GATE_CHUNK]
        if c0 and (bus.job(job_id) or {}).get("state") in ("cancelled", "failed"):
            for s in shards[c0:]:
                bus.inflight_end(POOL, job_id, s.id)    # 멈춘 작업 — 남은 칸은 돌리지 않는다(GPU 를 바로 놓는다)
            log(WHO, f"job {job_id} 멈춤 — 묶음의 남은 {len(shards) - c0}칸 건너뜀")
            break
        held = hold_while_other_hot(job_id, [x.id for x in shards[c0:]])
        tp = time.perf_counter()
        for s in part:
            reader(s)
        t_read += time.perf_counter() - tp
        results = run(part, reader, opts) if run else run_batch_default(ad, part, reader, opts)
        if opts.get("live"):
            results = clip_to_aoi(job_id, jh, results)      # 실시간 읍면동 분석 — 범위 밖 결과 제외
        elif sgg:
            results = clip_to_sgg(opts.get("sgg_cd"), results)   # 시군구 전역 — 시군구(읍면동 합집합) 밖 결과 제외
        t_part = time.perf_counter() - tp               # 전력 게이트 대기(held)는 GPU 시간이 아니다 — tp 는 대기 뒤부터
        _commit_part(job_id, tenant, demo, meta, sdir, part, results, attempts, t_part, held)
    r().xack(STREAM, GROUP, *ids)
    r().xdel(STREAM, *ids)
    jh = bus.job(job_id)
    progress(job_id, jh)
    done = int(jh.get("shards_done") or 0)
    failed = int(jh.get("shards_failed") or 0)
    total = int(jh.get("shards_total") or 0)
    if total and done + failed >= total and r().set(f"job:{job_id}:finalize", WID, nx=True):
        lane = "finalize:cpu:small" if total <= 16 else "finalize:cpu"          # 작은 작업 우선 레인(v1.1-17)
        r().xadd(lane, {"job_id": job_id, "by": WID, "at": now_iso()})
        bus.lane(WID, {"job_id": job_id, "to": now_iso(), "state": "done"})
        log(WHO, f"job {job_id} 전 shard 완료 → {lane} (read {t_read*1000:.0f}ms/batch)")
    state["job_id"] = None


_aoi_cache: "OrderedDict[str, object]" = OrderedDict()


def clip_to_aoi(job_id: str, jh: dict, results: list) -> list:
    """작업 범위(읍면동 경계 등) 밖 결과는 버린다 — 경계에 걸친 칩은 칩 전체를 돌리므로 대표점이 범위 밖인 도형이 섞인다.
    범위 없는 작업(영상 전체)은 그대로. options.live 작업에만 쓴다(기존 작업의 수는 바꾸지 않는다)."""
    a = _aoi_cache.get(job_id, False)
    if a is False:
        a = None
        try:
            if jh.get("aoi"):
                from shapely.geometry import shape
                from shapely.prepared import prep
                a = prep(shape(json.loads(jh["aoi"])))
        except Exception as e:
            log(WHO, "aoi parse", job_id, repr(e))
        _aoi_cache[job_id] = a
        while len(_aoi_cache) > 32:
            _aoi_cache.popitem(last=False)
    if a is None:
        return results
    out = []
    for res in results:
        keep = [d for d in res.features if a.contains(d.geom4326.representative_point())]
        if len(keep) != len(res.features):
            res = type(res)(features=keep, metrics=res.metrics, n=len(keep), ms=res.ms)
        out.append(res)
    return out


_sgg_cache: "OrderedDict[str, object]" = OrderedDict()


def clip_to_sgg(sgg_cd: str | None, results: list) -> list:
    """시군구 전역 분석 — 대표점이 그 시군구 읍면동 밖(이웃 시군구 · 바다)인 결과는 버린다(후처리와 같은 기준)."""
    if not sgg_cd:
        return results
    a = _sgg_cache.get(sgg_cd, False)
    if a is False:
        a = None
        try:
            from shapely.prepared import prep
            from landxi_api.regions import emd_index
            ix = emd_index(sgg_cd)
            a = prep(ix.union) if ix is not None and len(ix) else None
        except Exception as e:
            log(WHO, "sgg clip", sgg_cd, repr(e))
        _sgg_cache[sgg_cd] = a
        while len(_sgg_cache) > 8:
            _sgg_cache.popitem(last=False)
    if a is None:
        return results
    out = []
    for res in results:
        keep = [d for d in res.features if a.contains(d.geom4326.representative_point())]
        if len(keep) != len(res.features):
            res = type(res)(features=keep, metrics=res.metrics, n=len(keep), ms=res.ms)
        out.append(res)
    return out


def _commit_part(job_id: str, tenant: str, demo: bool, meta: dict, sdir, part: list, results: list, attempts: dict,
                 t_part: float, held: float):
    """한 칸 묶음의 결과 기록 — shard GeoJSON · detections(demo 제외) · 계량 → shard.done(칸마다 · 화면이 받는 즉시 지도에 채운다)."""
    global conn_db
    from shapely import set_srid, to_wkb
    from shapely.geometry import MultiPolygon
    per_ms = int(t_part * 1000 / max(1, len(part)))
    rows = []
    for s, res in zip(part, results):
        fc = fc_of(res.features, job_id, s.id)
        for ft, d in zip(fc["features"], res.features):
            a = round(area_m2(d.geom4326), 2)
            ft["properties"]["area_m2"] = a
            if not demo:
                mp = d.geom4326 if d.geom4326.geom_type == "MultiPolygon" else MultiPolygon([d.geom4326])
                rows.append((s.id, ft["id"], d.cls, d.cls_en, d.cid, d.conf, a, bool(d.attrs.get("chip_edge")),
                             to_wkb(set_srid(mp, 4326), hex=True, include_srid=True)))
        (sdir / f"{s.id}.geojson").write_text(json.dumps(fc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    if conn_db is None or conn_db.closed:
        conn_db = bus.pg()
    try:
        if rows:
            write_db(conn_db, job_id, tenant, rows)
        meter(conn_db, tenant=tenant, demo=demo, job_id=job_id, dim="gpu_s", amount=round(t_part, 3))
        conn_db.commit()
        r().hincrbyfloat(f"job:{job_id}", "gpu_s:" + WID, round(t_part, 3))     # 이 작업 · 이 GPU 몫(gpu[].gpu_s_so_far)
        bus.shard_ms_record(meta.get("id") or "gpu", per_ms)
    except Exception as e:
        conn_db.rollback()
        log(WHO, "db error", e)
        raise
    now = time.time()
    live = bus.job(job_id).get("state")
    for s, res in zip(part, results):
        if live in ("cancelled", "failed") or not bus.inflight_owned(POOL, job_id, s.id, attempts.get(s.id, 0)):
            log(WHO, f"shard {s.id} 결과 버림(감시자가 재배정했거나 작업 종료: {live})")
            continue
        bus.inflight_end(POOL, job_id, s.id)
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
            ev = {"job_id": job_id, "shard_id": s.id, "bbox": list(s.bbox4326), "n": res.n, "classes": classes,
                  "polys_url": f"/api/v1/results/{job_id}/shards/{s.id}.geojson?{bus.sign('shards/' + job_id)}",
                  "ms": per_ms, "worker": WID, "at": now_iso(ms=True)}
            if isinstance(s.params, dict) and s.params.get("emd_cd"):
                ev["emd_cd"] = s.params["emd_cd"]             # 시군구 전역 — 이 칸이 속한 읍면동(화면이 읍면동 순서로 채운다)
            emit(job_id, "shard.done", ev)
            log(WHO, f"shard.done {s.id} n={res.n} {per_ms}ms {WID}")
    jh = bus.job(job_id)
    if jh:
        progress(job_id, jh)                           # ≤ 1회/s(잠금) — 묶음마다 진행률


def process_train(job_id: str, entries: list[tuple[str, dict]]):
    """kind 'train'(S-8) — 전력 임대를 쥔 채 미세조정 1회. 임대는 별도 스레드가 LEASE_TTL/3 마다 연장하고,
    배치마다 다른 GPU 고부하(vLLM 등)를 확인해 그동안 학습을 멈춘다(두 장 동시 고부하 0). 결과 = 새 모델 행(candidate)."""
    jh = bus.job(job_id)
    ids = [e[0] for e in entries]
    r().xack(STREAM, GROUP, *ids)
    r().xdel(STREAM, *ids)
    if not jh or jh.get("state") in ("cancelled", "failed", "done"):
        return
    from workers.registry_scan import adapter_module
    mod = adapter_module("train/yolo")
    ad = mod.Adapter()
    ad.load(None, "cuda:0", state.get("budget") or 0)
    stop = threading.Event()

    def keep():
        while not stop.wait(max(2.0, LEASE_TTL / 3)):
            if lease["slot"] is not None:
                r().expire(f"power:hot:{lease['slot']}", LEASE_TTL)
            r().hset(f"worker:{WID}:hb", mapping={"ts": time.time(), "job_id": job_id})
    threading.Thread(target=keep, daemon=True).start()
    state["job_id"] = state["last_job"] = job_id
    r().hset(f"job:{job_id}", "workers", json.dumps([WID]))
    bus.lane(WID, {"job_id": job_id, "from": now_iso(), "to": None, "state": "running", "tenant_id": jh.get("tenant_id")})
    held = {"s": 0.0, "note": False}

    def ev(name, data):
        emit(job_id, name, {"job_id": job_id, **data, "at": now_iso(ms=True)})

    def gate_batch(_tr=None):
        t0 = time.time()
        while other_gpu_hot():
            if not held["note"]:
                held["note"] = True
                ev("train.hold", {"reason": "power_budget", "note": "다른 GPU 고부하 — 학습 일시 정지"})
            time.sleep(0.5)
            if bus.job(job_id).get("state") == "cancelled":
                raise RuntimeError("cancelled")
        if held["note"]:
            held["note"] = False
            held["s"] += time.time() - t0
            ev("train.resume", {})
    f0 = entries[0][1]
    shard = Shard(f0["shard_id"], job_id, (0, 0, 0, 0), None, json.loads(f0.get("params") or "null"))
    ev("shard.started", {"shard_id": shard.id, "bbox": [0, 0, 0, 0], "worker": WID})
    t0 = time.perf_counter()
    try:
        opts = {**json.loads(jh.get("options") or "{}"), "_emit": ev, "_gate": gate_batch}
        res = ad.run_shard(shard, None, opts)
        m = res.metrics or {}
        extra = mod.finalize(bus_job_view(jh), m) or {}
        ok = True
    except Exception as e:
        ok, m, extra = False, {"error": f"{type(e).__name__}: {str(e)[:200]}"}, {}
    finally:
        stop.set()
        ad.unload()
    el = round(time.perf_counter() - t0, 1)
    now = now_iso()
    if ok:
        r().hset(f"job:{job_id}", mapping={"state": "done", "finished_at": now, "shards_done": 1, "counts": json.dumps(extra.get("counts") or {})})
        ev("shard.done", {"shard_id": shard.id, "n": 1, "ms": int(el * 1000), "worker": WID})
        ev("job.done", {"counts": extra.get("counts") or {}, "model_id": extra.get("model_id"), "elapsed_s": el,
                        "held_s": env(round(held["s"], 1), "s", "measured", "전력 규칙 대기(다른 GPU 고부하)"),
                        "shards_total": 1, "shards_done": 1})
        st = "done"
    else:
        r().hset(f"job:{job_id}", mapping={"state": "failed", "finished_at": now, "error": m.get("error")})
        ev("job.failed", {"error": m.get("error")})
        st = "failed"
    with bus.pg() as conn:
        bus.lx_tx(conn)
        conn.execute("UPDATE jobs SET state=%s, finished_at=now(), shards_done=%s, error=%s, counts=%s WHERE id=%s",
                     (st, 1 if ok else 0, None if ok else m.get("error"), json.dumps(extra.get("counts") or {}), job_id))
        conn.commit()
    ops_event("job.state", {"job_id": job_id, "tenant_id": jh.get("tenant_id"), "state": st, "pool": POOL, "at": now})
    bus.lane(WID, {"job_id": job_id, "from": None, "to": now, "state": st, "tenant_id": jh.get("tenant_id")})
    state["job_id"] = None
    log(WHO, f"train {job_id} {st} · {el}s · 전력 대기 {held['s']:.1f}s")


def bus_job_view(jh: dict) -> dict:
    from workers.scheduler import job_view
    return job_view(jh)


def fail(job_id: str, entries, err: str):
    for eid, f in entries:
        att = int(f.get("attempt", 0))
        bus.inflight_end(POOL, job_id, f["shard_id"])
        if att < 2:
            r().xadd(STREAM, {**f, "attempt": att + 1})
        else:
            if r().sadd(f"job:{job_id}:failed", f["shard_id"]):
                r().hincrby(f"job:{job_id}", "shards_failed", 1)
        emit(job_id, "shard.failed", {"job_id": job_id, "shard_id": f["shard_id"], "error": err, "retry": att + 1, "at": now_iso(ms=True)})
    ids = [e[0] for e in entries]
    r().xack(STREAM, GROUP, *ids)
    r().xdel(STREAM, *ids)


def control_init():
    """시작 때 control:{WID} 커서를 지금 끝으로 — 예전 'last' 가 없으면 '$'(블록 1 ms)로 읽어 첫 요청(실시간 분석 미리 적재)을 놓쳤다."""
    try:
        if not r().hget(f"worker:{WID}:ctl", "last"):
            top = r().xrevrange(f"control:{WID}", count=1)
            r().hset(f"worker:{WID}:ctl", "last", top[0][0] if top else "0-0")
    except Exception:
        pass


def warm_pending():
    """미뤄 둔 미리 적재(다른 GPU 가 고부하였을 때) — 다른 GPU 가 조용해지면 적재한다(전력 규칙 · 두 장 동시 고부하 0)."""
    mid = state.get("warm")
    if not mid or gate_block():
        return
    state["warm"] = None
    try:
        ensure_model(mid)
        log(WHO, f"미리 적재 {mid}(실시간 분석 견적)")
    except Exception as e:
        log(WHO, "warm error", mid, repr(e))


def control():
    try:
        res = r().xread({f"control:{WID}": r().hget(f"worker:{WID}:ctl", "last") or "0-0"}, count=10, block=1)
    except Exception:
        return
    for _, entries in res or []:
        for eid, f in entries:
            r().hset(f"worker:{WID}:ctl", "last", eid)
            try:
                if f["action"] == "load" and f.get("model_id") in models:
                    models.move_to_end(f["model_id"])
                elif f["action"] == "load" and gate_block():
                    state["warm"] = f["model_id"]         # 다른 GPU 고부하 — 적재(더미 추론 포함)를 미룬다
                    log(WHO, f"미리 적재 {f['model_id']} 미룸(다른 GPU 고부하 · 전력 규칙)")
                elif f["action"] == "load":
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
    for t in (heartbeat, vram_reporter, smi_sampler, nvml_loop):
        threading.Thread(target=t, daemon=True).start()
    for mid in PCFG.get("resident", []):
        try:
            ensure_model(mid)
        except Exception as e:
            log(WHO, "resident load fail", mid, e)
    bus.ensure_group(STREAM, GROUP)
    control_init()
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
        warm_pending()
        if lease["slot"] is None and r().xlen(STREAM) == 0:
            time.sleep(0.3)          # 일이 없으면 임대를 잡지 않는다(유휴 GPU 는 전력 슬롯을 비워 둔다)
            return last_claim
        n_batch = power_gate()
        if n_batch == 0:
            time.sleep(0.5)
            return last_claim
        if not power_acquire():
            time.sleep(0.5)
            return last_claim
        res = r().xreadgroup(GROUP, WID, {STREAM: ">"}, count=n_batch, block=1000)
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
                if (bus.job(job_id) or {}).get("kind") == "train":
                    process_train(job_id, es)          # S-8 학습(임대 유지 · 배치마다 전력 규칙)
                    continue
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
