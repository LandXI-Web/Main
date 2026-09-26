"""bench — 모델 × A6000 처리량(Phase 0 첫 작업 · 설계서 §3.3). 결과 → models.perf + cache/bench/throughput.json → /ops/bench.

조건: 1024 칩(실영상에서 미리 읽어 GPU 순수 추론만) · batch {8,16} · fp16 · N 초. 외부 점유(Ollama) 를 그대로 둔 채로 잰다 —
external_used_mib 를 함께 기록한다. Ollama 프로세스는 건드리지 않는다(전후 tasklist 로 생존 확인).
사용: python server/bench/throughput.py --gpu 0 --models car_v2_obb,aerial25/best,namwon/Vinyl_house/train2 --batches 8,16 --seconds 60
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path

ap = argparse.ArgumentParser()
ap.add_argument("--gpu", type=int, default=0)
ap.add_argument("--models", default="car_v2_obb,aerial25/best,namwon/Vinyl_house/train2")
ap.add_argument("--batches", default="8,16")
ap.add_argument("--seconds", type=float, default=60)
ap.add_argument("--no-db", action="store_true")
A = ap.parse_args()
os.environ["CUDA_VISIBLE_DEVICES"] = str(A.gpu)

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from landxi_api import config  # noqa: E402
from workers import vram  # noqa: E402
from workers.registry_scan import scan_models  # noqa: E402

import numpy as np  # noqa: E402
import rasterio  # noqa: E402
from rasterio.windows import Window  # noqa: E402

OUT = config.DATA_ROOT / "cache" / "bench" / "throughput.json"
HWANGDEUNG = r"E:/Auto_Label_project/data/images/익산_황등3,4지구.tif"
AP25 = str(config.DATA_ROOT / "_work" / "namwon_ap25_2023.vrt")


def log(*a):
    print(time.strftime("%H:%M:%S"), f"[bench gpu{A.gpu}]", *a, flush=True)


def chips(path: str, n: int = 32, size: int = 1024, seed: int = 7) -> list[np.ndarray]:
    rng = np.random.default_rng(seed)
    out = []
    with rasterio.open(path) as ds:
        tries = 0
        while len(out) < n and tries < n * 20:
            tries += 1
            x = int(rng.integers(0, ds.width - size))
            y = int(rng.integers(0, ds.height - size))
            a = ds.read(indexes=[1, 2, 3], window=Window(x, y, size, size))
            if ds.count >= 4:
                al = ds.read(4, window=Window(x, y, size, size))
                if (al > 0).mean() < 0.9:
                    continue
            if a.mean() < 5:
                continue
            out.append(np.ascontiguousarray(a.transpose(1, 2, 0)[:, :, ::-1]))
    return out


def main():
    import torch
    from ultralytics import YOLO
    models = {m["id"]: m for m in scan_models()}
    before = vram.query(A.gpu)[0]
    allprocs = vram.query()
    ext_procs = before.external_procs or sorted({p for g in allprocs for p in g.external_procs})
    log(f"external {vram.fmt(before.used_mib)} MiB({vram.external_label(ext_procs)}) · total {vram.fmt(before.total_mib)} · "
        f"budget {vram.fmt(vram.budget_mib(before.total_mib, before.used_mib))} MiB")
    torch.cuda.set_per_process_memory_fraction(vram.budget_mib(before.total_mib, before.used_mib) / before.total_mib, 0)
    src_chips = {"hwangdeung": chips(HWANGDEUNG), "ap25": chips(AP25)}
    log("chips ready", {k: len(v) for k, v in src_chips.items()})
    results = []
    for mid in A.models.split(","):
        m = models[mid]
        task = "obb" if m["task"] == "obb" else "segment"
        imgsz = int(m.get("tile_size") or 1024)
        data = src_chips["hwangdeung" if task == "obb" else "ap25"]
        net = YOLO(m["weights_uri"], task=task)
        for b in [int(x) for x in A.batches.split(",")]:
            torch.cuda.empty_cache()
            torch.cuda.reset_peak_memory_stats()
            batch = [data[i % len(data)] for i in range(b)]
            net.predict(batch, imgsz=imgsz, device=0, half=True, verbose=False)     # 워밍업
            torch.cuda.synchronize()
            n = 0
            t0 = time.perf_counter()
            util = []
            while time.perf_counter() - t0 < A.seconds:
                off = (n // b) % len(data)
                batch = [data[(off + i) % len(data)] for i in range(b)]
                net.predict(batch, imgsz=imgsz, device=0, half=True, verbose=False)
                n += b
                if len(util) < 50 and n % (b * 4) == 0:
                    try:
                        util.append(vram.query(A.gpu)[0].util_pct)
                    except Exception:
                        pass
            torch.cuda.synchronize()
            dt = time.perf_counter() - t0
            cps = n / dt
            peak = torch.cuda.max_memory_reserved() / 2**20
            now = vram.query(A.gpu)[0]
            rec = {"model_id": mid, "gpu": before.name.replace("NVIDIA ", ""), "gpu_index": A.gpu, "batch": b, "fp16": True, "chip": 1024,
                   "imgsz": imgsz, "seconds": round(dt, 1), "chips": n,
                   "chips_per_s": {"value": round(cps, 2), "unit": "chips_per_s", "basis": "measured", "as_of": time.strftime("%Y-%m-%dT%H:%M:%S+09:00"),
                                   "source": "server/bench/throughput.py", "note": f"A6000 · batch {b} · fp16 · imgsz {imgsz} · 칩 미리 적재(읽기 제외) · "
                                                                                    f"외부 점유 {vram.fmt(before.used_mib)} MiB 동시"},
                   "vram_mib": {"value": round(peak), "unit": "MiB", "basis": "measured", "as_of": time.strftime("%Y-%m-%dT%H:%M:%S+09:00"),
                                "source": "torch.cuda.max_memory_reserved"},
                   "external_used_mib": {"value": before.used_mib, "unit": "MiB", "basis": "measured", "as_of": time.strftime("%Y-%m-%dT%H:%M:%S+09:00"),
                                         "source": "nvidia-smi memory.used(bench 전)", "note": vram.external_label(ext_procs)},
                   "util_pct_mean": round(float(np.mean(util)), 1) if util else None, "mem_used_during_mib": now.used_mib,
                   "at": time.strftime("%Y-%m-%dT%H:%M:%S+09:00")}
            results.append(rec)
            log(f"{mid} batch {b}: {cps:.2f} chips/s · peak {peak:.0f} MiB · util≈{rec['util_pct_mean']}% · nvidia-smi used {now.used_mib}")
        del net
        torch.cuda.empty_cache()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    keyf = lambda r: (r["model_id"], r["gpu_index"], r["batch"])  # noqa: E731
    mine = OUT.parent / f"throughput-gpu{A.gpu}.json"
    old = json.loads(mine.read_text(encoding="utf-8")).get("items", []) if mine.exists() else []
    m1 = {keyf(r): r for r in old}
    m1.update({keyf(r): r for r in results})
    mine.write_text(json.dumps({"items": sorted(m1.values(), key=keyf)}, ensure_ascii=False, indent=1), encoding="utf-8")
    merged = {}
    for f in sorted(OUT.parent.glob("throughput-gpu*.json")):
        merged.update({keyf(r): r for r in json.loads(f.read_text(encoding="utf-8"))["items"]})
    OUT.write_text(json.dumps({"items": sorted(merged.values(), key=keyf)}, ensure_ascii=False, indent=1), encoding="utf-8")
    if not A.no_db:
        import psycopg
        with psycopg.connect(config.PG_ADMIN_DSN) as conn:
            for mid in {r["model_id"] for r in results}:
                rs = [r for r in merged.values() if r["model_id"] == mid and r["batch"] == 16] or [r for r in merged.values() if r["model_id"] == mid]
                best = min(rs, key=lambda r: r["chips_per_s"]["value"])    # 두 GPU 중 보수적인 값
                perf = {"chips_per_s": best["chips_per_s"], "vram_mib": best["vram_mib"], "bench_at": best["at"],
                        "external_used_mib": best["external_used_mib"], "batch": best["batch"], "gpus_measured": sorted({r["gpu_index"] for r in rs})}
                conn.execute("UPDATE models SET perf=%s WHERE id=%s", (json.dumps(perf, ensure_ascii=False), mid))
            conn.commit()
    log("done →", OUT)


if __name__ == "__main__":
    main()
