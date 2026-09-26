#!/usr/bin/env python
"""J1 대체 워커(F1-C 시연 도구 · F1-B gpu_worker 가 오면 폐기) — 실제 GPU 추론으로 관제 텔레메트리를 검증한다.

무엇을 하나
  :8702 로컬 브리지의 대기열에서 job 을 claim → car_v2_obb(YOLO11-OBB · B05) 를 GPU 한 장(기본 0 · 전력 규칙 2026-09-26)에 올려
  B04 익산 황등 1.36cm 정사영상(EPSG:5186 GeoTIFF)의 AOI 를 1024 칩으로 실제 추론한다.
  shard 마다 브리지에 shard.done{ms, n} 을 보내고(→ usage.delta gpu_s 계량), 2s 마다 worker:{id}:vram 자기 보고를 보낸다
  (→ gpu_poller 가 external_used_mib = memory.used − 자기 보고 로 계산 · 관제 VRAM 링의 워커 구간).

규칙(계약 §7)
  VRAM 예산 = total − used − 2,048 MiB (nvidia-smi) · torch.cuda.set_per_process_memory_fraction(budget/total).
  외부 프로세스(Ollama llama-server)는 절대 건드리지 않는다. 취소는 /worker/control 을 shard 경계마다 확인.

실행
  python shots/f1/C/tools/standin_worker.py                 # 대기(claim 루프)
  python shots/f1/C/tools/standin_worker.py --bench 64      # 단독 처리량 측정(브리지 없이)
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import threading
import time
import urllib.request

BRIDGE = os.environ.get("OPS_BRIDGE", "http://127.0.0.1:8702/landxi/ops/bridge/worker")
IMG = r"E:\Auto_Label_project\data\images\익산_황등3,4지구.tif"
WEIGHTS = r"E:\drone_runs\car_v2_obb\run\weights\best.pt"
def _find_nvsmi():
    """드라이버 갱신으로 DriverStore 폴더가 바뀐다(2026-09-26 nv_dispui → nv_dispwi) — 실제로 응답하는 것을 고른다."""
    import glob
    cands = [os.environ.get("LX_NVSMI")] + sorted(glob.glob(r"C:\Windows\System32\DriverStore\FileRepository\nv_disp*\nvidia-smi.exe"), key=os.path.getmtime, reverse=True) + ["nvidia-smi"]
    for c in cands:
        if not c:
            continue
        try:
            r = subprocess.run([c, "--query-gpu=index", "--format=csv,noheader"], capture_output=True, text=True, timeout=10)
            if r.returncode == 0 and r.stdout.strip()[:1].isdigit():
                return c
        except Exception:  # noqa: BLE001
            pass
    raise SystemExit("nvidia-smi 를 찾지 못했다(LX_NVSMI)")


NVSMI = _find_nvsmi()
CHIP, OVERLAP = 1024, 0.2
# 전력 규칙(2026-09-26): 무거운 GPU 작업은 한 번에 한 장만. 기본 GPU 0 · STANDIN_GPUS=1 로 다른 한 장 지정.
GPUS = [int(x) for x in os.environ.get("STANDIN_GPUS", "0").split(",") if x.strip() != ""][:1] or [0]
_TL = threading.local()


def _pin_devices():
    """ultralytics select_device 는 'cuda:1' 도 CUDA_VISIBLE_DEVICES 재해석 뒤 cuda:0 을 돌려준다(한 프로세스 두 GPU 불가).
    예측기 안의 select_device 를 스레드별 장치로 바꿔 GPU 0/1 을 실제로 나눠 쓴다."""
    import torch
    import ultralytics.engine.predictor as P
    orig = P.select_device
    P.select_device = lambda *a, **k: torch.device(f"cuda:{_TL.idx}") if getattr(_TL, "idx", None) is not None else orig(*a, **k)


def post(path, body):
    try:
        req = urllib.request.Request(BRIDGE + path, data=json.dumps(body).encode(), headers={"content-type": "application/json"}, method="POST")
        with urllib.request.urlopen(req, timeout=3) as r:
            return json.loads(r.read().decode())
    except Exception as e:  # noqa: BLE001
        print("post fail", path, e, file=sys.stderr)
        return None


def get(path):
    try:
        with urllib.request.urlopen(BRIDGE + path, timeout=3) as r:
            return json.loads(r.read().decode())
    except Exception:  # noqa: BLE001
        return None


def smi():
    out = subprocess.run([NVSMI, "--query-gpu=index,memory.used,memory.total", "--format=csv,noheader,nounits"], capture_output=True, text=True).stdout
    return {int(a): (int(b), int(c)) for a, b, c in (l.split(", ") for l in out.strip().splitlines())}


def shards_for(aoi, limit=None):
    import rasterio
    from rasterio.warp import transform
    ds = rasterio.open(IMG)
    xs = [p[0] for p in aoi["coordinates"][0]]; ys = [p[1] for p in aoi["coordinates"][0]]
    X, Y = transform("EPSG:4326", ds.crs, [min(xs), max(xs)], [min(ys), max(ys)])
    r0, c0 = ds.index(X[0], Y[1]); r1, c1 = ds.index(X[1], Y[0])
    r0, c0 = max(0, r0), max(0, c0); r1, c1 = min(ds.height, r1), min(ds.width, c1)
    step = int(CHIP * (1 - OVERLAP))
    out = []
    for r in range(r0, max(r0 + 1, r1 - CHIP + 1), step):
        for c in range(c0, max(c0 + 1, c1 - CHIP + 1), step):
            out.append((f"r{(r - r0) // step:03d}c{(c - c0) // step:03d}", r, c))
    ds.close()
    return out[:limit] if limit else out


class GpuRunner(threading.Thread):
    def __init__(self, idx, job, queue, lock, stop, stats):
        super().__init__(daemon=True)
        self.idx, self.job, self.q, self.lock, self.stop, self.stats = idx, job, queue, lock, stop, stats
        self.worker = f"a6000-{idx}"
        self.model = None; self.budget = None; self.ctx = 0

    def load(self):
        import torch
        from ultralytics import YOLO
        _TL.idx = self.idx
        used, total = smi()[self.idx]
        self.budget = total - used - 2048
        torch.cuda.set_device(self.idx)
        torch.cuda.set_per_process_memory_fraction(max(0.05, self.budget / total), self.idx)
        before = smi()[self.idx][0]
        torch.zeros(1, device=f"cuda:{self.idx}")
        self.ctx = max(0, smi()[self.idx][0] - before)
        self.model = YOLO(WEIGHTS)
        self.model.to(f"cuda:{self.idx}")

    def used_mib(self):
        import torch
        return int(torch.cuda.memory_reserved(self.idx) / 2**20) + self.ctx

    def run(self):
        import rasterio
        import numpy as np
        from rasterio.windows import Window
        try:
            self.load()
        except Exception as e:  # noqa: BLE001
            print("load fail", self.worker, e, file=sys.stderr); self.stats["err"] = str(e); return
        ds = rasterio.open(IMG)
        last_v = 0
        while not self.stop.is_set():
            with self.lock:
                if not self.q:
                    break
                sid, r, c = self.q.pop(0)
            t0 = time.time()
            img = ds.read(window=Window(c, r, CHIP, CHIP))
            img = np.ascontiguousarray(np.transpose(img[:3], (1, 2, 0))[:, :, ::-1])
            res = self.model.predict(img, imgsz=CHIP, conf=0.25, verbose=False, half=True)
            n = int(len(res[0].obb)) if res and res[0].obb is not None else 0
            ms = int((time.time() - t0) * 1000)
            with self.lock:
                self.stats["done"] += 1; self.stats["n"] += n
            if self.job:
                post("/event", {"event": "shard.done", "data": {"job_id": self.job["id"], "shard_id": sid, "worker": self.worker, "ms": ms, "n": n}})
                if time.time() - last_v > 2:
                    post("/event", {"event": "vram", "data": {"worker": self.worker, "budget_mib": self.budget, "used_mib": self.used_mib(), "model_id": "car_v2_obb", "pid": os.getpid(), "job_id": self.job["id"]}}); last_v = time.time()
        ds.close()
        if self.job:
            post("/event", {"event": "vram", "data": {"worker": self.worker, "budget_mib": self.budget, "used_mib": self.used_mib(), "model_id": "car_v2_obb", "pid": os.getpid(), "job_id": self.job["id"]}})


def release(workers):
    import gc
    import torch
    gc.collect()
    for i in GPUS:
        try:
            with torch.cuda.device(i):
                torch.cuda.empty_cache()
        except Exception:  # noqa: BLE001
            pass
    for w in workers:
        post("/event", {"event": "vram.release", "data": {"worker": w}})


def run_job(job, limit):
    shards = shards_for(job["aoi"], job.get("shards_total") or limit)
    lock = threading.Lock(); stop = threading.Event(); stats = {"done": 0, "n": 0}
    q = list(shards)
    runners = [GpuRunner(i, job, q, lock, stop, stats) for i in GPUS[:max(1, int(job.get("_max_gpus") or 1))]]
    for r in runners:
        r.start()
    # 모델이 올라간 뒤 started (대기 → 실행 전환이 실제 GPU 배정 시각)
    while any(r.model is None and r.is_alive() for r in runners):
        time.sleep(0.1)
    post("/event", {"event": "job.started", "data": {"job_id": job["id"], "workers": [r.worker for r in runners], "shards_total": len(shards)}})
    for r in runners:
        post("/event", {"event": "vram", "data": {"worker": r.worker, "budget_mib": r.budget, "used_mib": r.used_mib(), "model_id": "car_v2_obb", "pid": os.getpid(), "job_id": job["id"]}})
    t0 = time.time()
    while any(r.is_alive() for r in runners):
        ctl = get("/control?job_id=" + job["id"]) or {}
        if ctl.get("cancel"):
            stop.set()
        time.sleep(0.5)
    el = time.time() - t0
    if stop.is_set():
        post("/event", {"event": "job.cancelled", "data": {"job_id": job["id"]}})
    else:
        post("/event", {"event": "job.done", "data": {"job_id": job["id"], "counts": {"vehicle": stats["n"]}, "elapsed_s": round(el, 1)}})
    print(f"job {job['id']} shards {stats['done']}/{len(shards)} n={stats['n']} {el:.1f}s {'cancelled' if stop.is_set() else 'done'}", flush=True)
    for r in runners:
        r.model = None
    release([r.worker for r in runners])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bench", type=int, default=0)
    ap.add_argument("--limit", type=int, default=int(os.environ.get("STANDIN_LIMIT", "0")) or None, help="shard 상한(영상 길이 맞춤)")
    a = ap.parse_args()
    _pin_devices()
    if a.bench:
        aoi = {"type": "Polygon", "coordinates": [[[126.9440, 35.9950], [126.9490, 35.9950], [126.9490, 35.9990], [126.9440, 35.9990], [126.9440, 35.9950]]]}
        print("shards total", len(shards_for(aoi)))
        lock = threading.Lock(); stop = threading.Event(); stats = {"done": 0, "n": 0}
        q = shards_for(aoi, a.bench)
        rs = [GpuRunner(i, None, q, lock, stop, stats) for i in GPUS[:1]]
        t0 = time.time(); [r.start() for r in rs]
        while any(r.model is None and r.is_alive() for r in rs): time.sleep(0.1)
        t1 = time.time(); print(f"load {t1 - t0:.1f}s")
        [r.join() for r in rs]
        el = time.time() - t1
        print(f"bench {stats['done']} chips {el:.1f}s = {stats['done'] / el:.1f} chips/s (1 GPU · 전력 규칙) n={stats['n']} ctx={[r.ctx for r in rs]} used={[r.used_mib() for r in rs]}")
        return
    import torch  # noqa: F401  — 미리 올려 둔다(claim → started 사이 = 모델 적재만)
    import ultralytics  # noqa: F401
    print("standin worker: claim loop", BRIDGE, flush=True)
    while True:
        r = post("/claim", {"pool": "a6000"}) or {}
        j = r.get("job")
        if j:
            j["_max_gpus"] = min(len(GPUS), r.get("max_gpus") or 1)
            print("claimed", j["id"], flush=True)
            run_job(j, a.limit)
        else:
            time.sleep(0.5)


if __name__ == "__main__":
    main()
