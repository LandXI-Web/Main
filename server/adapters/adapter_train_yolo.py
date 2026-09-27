"""학습 작업(F3 최종 명세 §3 S-8) — kind 'train' · GPU 워커(전력 임대 power:hot 을 쥔 워커만 · 동시 고부하 1장).

POST /jobs {kind:'train', base_model, region, samples, options{epochs, imgsz, batch}} → 게이트웨이가 검증·견적 → 이 어댑터.
- base_model = models.id(ultralytics 가중치가 있는 것) · samples = 학습 표본 id(registry DATASETS 키 · dataset.yaml 이 있어야 함)
- shard 1칸('train') = 미세조정 전체(에포크 상한 · 진행은 train.epoch 이벤트) · 결과 = 새 models 행(status 'candidate' · 검수 전)
- 전력: 배치·이미지 크기 보수적 기본값 · power:hot 임대를 쥔 채로만 돈다(gpu_worker 가 임대 확인 뒤 부른다).
"""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

from adapters.base import ShardResult

ADAPTER = {"id": "train/yolo", "kinds": ["train"], "device": "gpu", "input": "dataset-yaml", "output": "model"}
EPOCHS_MAX = 50
DATASETS = {       # samples id → 학습 표본 폴더(dataset.yaml) · 레지스트리 계보와 같은 키
    "namwon/Vinyl_house/train2": "E:/namwon/Vinyl_house",
    "namwon/cultivate_uncultivate/train": "E:/namwon/cultivate_uncultivate",
    "namwon/Silage/train": "E:/namwon/Silage",
    "namwon/growth_baseline/train": "E:/namwon/growth_baseline",
    "namwon/production_baseline/train": "E:/namwon/production_baseline",
}


def dataset_yaml(samples: str) -> Path | None:
    d = DATASETS.get(samples or "")
    if d and (Path(d) / "dataset.yaml").exists():
        return Path(d) / "dataset.yaml"
    p = Path(samples or "")
    if p.suffix in (".yaml", ".yml") and p.exists():
        return p
    return None


def plan(job: dict) -> list[dict]:
    o = job.get("options") or {}
    return [{"shard_id": "train", "base_model": o.get("base_model"), "samples": o.get("samples"), "region": o.get("region"),
             "epochs": min(int(o.get("epochs", 10)), EPOCHS_MAX), "imgsz": int(o.get("imgsz", 640)), "batch": int(o.get("batch", 8))}]


def _cfg():
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from landxi_api import config
    return config


class Adapter:
    def __init__(self):
        self.device = "cuda:0"

    def load(self, model, device, vram_budget_mib):
        self.device = device or "cuda:0"

    def unload(self):
        try:
            import torch
            torch.cuda.empty_cache()
        except Exception:
            pass

    def run_shard(self, shard, read, opts):
        p = shard.params or {}
        emit = opts.get("_emit") or (lambda *a, **k: None)
        cfg = _cfg()
        import psycopg
        with psycopg.connect(cfg.PG_WORKER_DSN) as conn:
            row = conn.execute("SELECT weights_uri FROM models WHERE id=%s", (p.get("base_model"),)).fetchone()
        if not row or not row[0]:
            raise RuntimeError("base_model 가중치 없음")
        w = row[0] if (":" in row[0][:3] or os.path.isabs(row[0])) else str(cfg.DATA_ROOT / row[0])
        yml = dataset_yaml(p.get("samples"))
        if not yml:
            raise RuntimeError("학습 표본(dataset.yaml) 없음")
        from ultralytics import YOLO
        t0 = time.perf_counter()
        out_dir = cfg.DATA_ROOT / "models" / "trained"
        name = f"{shard.job_id}"
        model = YOLO(w)

        def on_epoch(tr):
            try:
                emit("train.epoch", {"epoch": int(tr.epoch) + 1, "epochs": int(tr.epochs),
                                     "metrics": {k: round(float(v), 4) for k, v in (tr.metrics or {}).items() if isinstance(v, (int, float))}})
            except Exception:
                pass
        model.add_callback("on_fit_epoch_end", on_epoch)
        gate = opts.get("_gate")
        if callable(gate):           # 배치마다 전력 규칙(다른 GPU 고부하면 멈춤) — gpu_worker 가 준다
            model.add_callback("on_train_batch_end", gate)
        res = model.train(data=str(yml), epochs=int(p.get("epochs", 10)), imgsz=int(p.get("imgsz", 640)), batch=int(p.get("batch", 8)),
                          device=0, project=str(out_dir), name=name, exist_ok=True, workers=4, verbose=False, plots=False)
        best = out_dir / name / "weights" / "best.pt"
        mets = {}
        try:
            mets = {k: round(float(v), 5) for k, v in (res.results_dict or {}).items()}
        except Exception:
            pass
        ms = int((time.perf_counter() - t0) * 1000)
        return ShardResult(features=[], metrics={"weights": str(best), "metrics": mets, "ms": ms, "basis": "measured",
                                                 "source": f"ultralytics train({p.get('base_model')} · {p.get('samples')})"}, n=1, ms=ms)


def finalize(job: dict, result: dict | None = None) -> dict:
    """새 모델 행(status candidate · 검수 전) — 배포는 lx-review 검수와 결재 뒤."""
    o = job.get("options") or {}
    cfg = _cfg()
    if not result or not result.get("weights"):
        return {"counts": {"model": 0}}
    mid = f"trained/{job.get('id')}"
    import psycopg
    with psycopg.connect(cfg.PG_ADMIN_DSN, autocommit=True) as conn:
        base = conn.execute("SELECT family, task, classes, input, gsd_trained_m, image, tile_size, infer_shape, adapter FROM models WHERE id=%s",
                            (o.get("base_model"),)).fetchone()
        mets = {k: {"value": v, "unit": "ratio", "basis": "measured", "as_of": time.strftime("%Y-%m"), "source": "ultralytics val(학습 끝)"}
                for k, v in (result.get("metrics") or {}).items() if k.startswith("metrics/")}
        conn.execute("INSERT INTO models(id, family, version, weights_uri, task, classes, input, gsd_trained_m, metrics, status, image, tile_size, "
                     "infer_shape, adapter) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,'candidate',%s,%s,%s,%s) ON CONFLICT (id) DO UPDATE SET "
                     "weights_uri=EXCLUDED.weights_uri, metrics=EXCLUDED.metrics",
                     (mid, base[0] if base else None, time.strftime("%Y%m%d"), result["weights"], base[1] if base else "seg",
                      json.dumps(base[2]) if base and base[2] is not None else None, json.dumps(base[3]) if base and base[3] is not None else None,
                      base[4] if base else None, json.dumps(mets), base[5] if base else None, base[6] if base else None,
                      base[7] if base else None, base[8] if base else None))
    return {"counts": {"model": 1}, "model_id": mid}
