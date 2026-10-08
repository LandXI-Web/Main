"""학습 작업(F3 최종 명세 §3 S-8 · r3-train) — kind 'train' · GPU 워커(전력 임대 power:hot 을 쥔 워커만 · 동시 고부하 1장).

POST /jobs {kind:'train', base_model, region, samples, options{epochs, imgsz, batch}} → 게이트웨이가 검증·견적 → 이 어댑터.
- base_model = models.id(ultralytics 가중치가 있는 것)
- samples = 학습 표본 id — ① 화면에서 올린 표본(train_samples · 'smp_…' · 데이터 올리기 화면) ② 기존 로컬 표본(DATASETS · 계보용)
- shard 1칸('train') = 미세조정 전체(에포크 상한 · 진행은 train.epoch · job.progress 이벤트) · 결과 = 새 models 행(status 'candidate')
- 전력: 작은 표본 기본값(3 에포크 · batch 4 · imgsz 640) · power:hot 임대를 쥔 채로만 돈다(gpu_worker 가 임대 확인 뒤 부른다).
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
DEFAULTS = {"epochs": 3, "imgsz": 640, "batch": 4}      # 작은 표본 기본값(R3 plan 4절) — 전력·VRAM 보수적
DATASETS = {       # 기존 로컬 표본(계보) — 새 표본은 화면에서 올린다(train_samples)
    "namwon/Vinyl_house/train2": "E:/namwon/Vinyl_house",
    "namwon/cultivate_uncultivate/train": "E:/namwon/cultivate_uncultivate",
    "namwon/Silage/train": "E:/namwon/Silage",
    "namwon/growth_baseline/train": "E:/namwon/growth_baseline",
    "namwon/production_baseline/train": "E:/namwon/production_baseline",
}


def _one(samples):
    """samples 는 표본 id 한 개(문자열) 또는 한 개짜리 목록 — 화면은 목록으로 보낸다."""
    if isinstance(samples, (list, tuple)):
        return samples[0] if len(samples) == 1 else None
    return samples


def dataset_yaml(samples) -> Path | None:
    """표본 → dataset.yaml. ① 올린 표본(DB train_samples) ② 기존 로컬 표본 ③ yaml 경로(내부용)."""
    samples = _one(samples)
    if isinstance(samples, str) and samples.startswith("smp_"):
        try:
            sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
            from landxi_api.training import sample_yaml
            return sample_yaml(samples)
        except Exception:
            return None
    d = DATASETS.get(samples or "")
    if d and (Path(d) / "dataset.yaml").exists():
        return Path(d) / "dataset.yaml"
    p = Path(samples or "")
    if p.suffix in (".yaml", ".yml") and p.exists():
        return p
    return None


def plan(job: dict) -> list[dict]:
    o = job.get("options") or {}
    return [{"shard_id": "train", "base_model": o.get("base_model"), "samples": _one(o.get("samples")), "region": o.get("region"),
             "epochs": min(int(o.get("epochs", DEFAULTS["epochs"])), EPOCHS_MAX), "imgsz": int(o.get("imgsz", DEFAULTS["imgsz"])),
             "batch": int(o.get("batch", DEFAULTS["batch"])), **({"eval": True} if o.get("eval") else {})}]


def _cfg():
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from landxi_api import config
    return config


def _short(mt: dict) -> dict:
    """회차 기록 — 검증 지표 세 가지(분할 모델은 마스크 값, 없으면 상자 값)."""
    def g(k):
        for suf in ("(M)", "(B)"):
            if f"metrics/{k}{suf}" in mt:
                return mt[f"metrics/{k}{suf}"]
        return None
    return {"map50": g("mAP50"), "precision": g("precision"), "recall": g("recall")}


def model_name(task: str | None, region: str | None, day: str) -> str:
    """새 모델 이름 기본값(R3 plan 4절) — '{업무 이름} · {지역} 학습 {YYYY.MM.DD}' · 지역이 없으면 '{업무 이름} 학습 {날짜}'."""
    t = (task or "새 모델").strip()
    return f"{t} · {region} 학습 {day}" if region else f"{t} 학습 {day}"


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
        if p.get("eval"):
            try:
                return self._eval(w, yml, p, opts, t0)
            except Exception:
                import traceback
                (cfg.DATA_ROOT / "_logs" / "train-eval.err").write_text(traceback.format_exc(), encoding="utf-8")
                raise
        out_dir = cfg.DATA_ROOT / "models" / "trained"
        name = f"{shard.job_id}"
        model = YOLO(w)
        epochs = int(p.get("epochs", DEFAULTS["epochs"]))
        log_rows: list[dict] = []

        def on_epoch(tr):
            try:
                mt = {k: round(float(v), 4) for k, v in (tr.metrics or {}).items() if isinstance(v, (int, float))}
                row = {"epoch": int(tr.epoch) + 1, "epochs": int(tr.epochs), **_short(mt)}
                if log_rows and log_rows[-1]["epoch"] == row["epoch"]:
                    log_rows[-1] = row          # 학습 끝 최종 검증(같은 회차 두 번째 호출) = 그 회차의 마지막 값
                else:
                    log_rows.append(row)
                emit("train.epoch", {**row, "metrics": mt})
                emit("job.progress", {"progress": round(row["epoch"] / max(1, row["epochs"]), 3), "epoch": row["epoch"],
                                      "epochs": row["epochs"], "shards_done": 0, "shards_total": 1})
            except Exception:
                pass
        model.add_callback("on_fit_epoch_end", on_epoch)
        gate = opts.get("_gate")
        if callable(gate):           # 배치마다 전력 규칙(다른 GPU 고부하면 멈춤) — gpu_worker 가 준다
            model.add_callback("on_train_batch_end", gate)
        emit("train.epoch", {"epoch": 0, "epochs": epochs})
        res = model.train(data=str(yml), epochs=epochs, imgsz=int(p.get("imgsz", DEFAULTS["imgsz"])), batch=int(p.get("batch", DEFAULTS["batch"])),
                          device=0, project=str(out_dir), name=name, exist_ok=True, workers=0, verbose=False, plots=False)
        best = out_dir / name / "weights" / "best.pt"
        mets = {}
        try:
            mets = {k: round(float(v), 5) for k, v in (res.results_dict or {}).items()}
        except Exception:
            pass
        ms = int((time.perf_counter() - t0) * 1000)
        return ShardResult(features=[], metrics={"weights": str(best), "metrics": mets, "log": log_rows, "ms": ms, "basis": "measured",
                                                 "source": f"ultralytics train({p.get('base_model')} · {p.get('samples')})"}, n=1, ms=ms)


    def _eval(self, w, yml, p, opts, t0):
        """검증만(데이터-1 · 10-07) — 같은 검증 묶음(dataset.yaml 의 val)으로 모델 하나를 잰다. 새 모델 행을 만들지 않는다.
        같은 대기열 · 같은 전력 임대 · 배치마다 전력 규칙(학습과 같다). 결과 = 분류마다 마스크 · 상자 mAP50 · 정밀도 · 재현율."""
        for k in ("stdout", "stderr"):          # 숨은 창으로 뜬 워커는 표준 출력이 없을 수 있다 — 진행 막대(ultralytics)가 쓸 곳을 둔다
            if getattr(sys, k) is None:
                setattr(sys, k, open(os.devnull, "w", encoding="utf-8"))
        from ultralytics import YOLO
        model = YOLO(w)
        gate = opts.get("_gate")
        if callable(gate):
            model.add_callback("on_val_batch_end", gate)
        imgsz = int(p.get("imgsz", 1280))
        res = model.val(data=str(yml), split="val", imgsz=imgsz, batch=int(p.get("batch", 8)), device=0, workers=0, plots=False,
                        verbose=False, half=True)
        names = res.names if isinstance(res.names, dict) else dict(enumerate(res.names or []))
        per = {}
        for i, c in enumerate(list(res.ap_class_index)):
            row = {}
            for key, mt in (("mask", getattr(res, "seg", None)), ("box", getattr(res, "box", None))):
                if mt is None:
                    continue
                try:
                    row[key] = {"map50": round(float(mt.ap50[i]), 4), "map50_95": round(float(mt.ap[i]), 4),
                                "precision": round(float(mt.p[i]), 4), "recall": round(float(mt.r[i]), 4)}
                except Exception:
                    pass
            per[str(names.get(int(c), c))] = row
        ms = int((time.perf_counter() - t0) * 1000)
        out = {"eval": {"weights": str(w), "data": str(yml), "imgsz": imgsz, "classes": per,
                        "speed_ms": {k: round(float(v), 2) for k, v in (res.speed or {}).items()}},
               "ms": ms, "basis": "measured", "source": f"ultralytics val({p.get('base_model')} · {yml})"}
        return ShardResult(features=[], metrics=out, n=1, ms=ms)


def finalize(job: dict, result: dict | None = None) -> dict:
    """새 모델 행(status candidate · 결과 확인 전) — 성능 = 학습 끝 검증값(측정) · 이름 = 업무 · 지역 · 날짜. 등록은 관리자 승인 뒤."""
    o = job.get("options") or {}
    cfg = _cfg()
    if o.get("eval"):                      # 검증만 — 결과 파일 한 개(models/eval/{작업 id}.json) · 모델 행 없음
        ev = (result or {}).get("eval")
        if not ev:
            return {"counts": {"eval": 0}}
        d = cfg.DATA_ROOT / "models" / "eval"
        d.mkdir(parents=True, exist_ok=True)
        f = d / f"{job.get('id')}.json"
        f.write_text(json.dumps({"job_id": job.get("id"), "model_id": o.get("base_model"), "samples": o.get("samples"),
                                 "at": time.strftime("%Y-%m-%dT%H:%M:%S"), **ev}, ensure_ascii=False, indent=1), encoding="utf-8")
        return {"counts": {"eval": 1}, "eval_file": str(f)}
    if not result or not result.get("weights"):
        return {"counts": {"model": 0}}
    mid = f"trained/{job.get('id')}"
    import psycopg
    with psycopg.connect(cfg.PG_ADMIN_DSN, autocommit=True) as conn:
        base = conn.execute("SELECT family, task, classes, input, gsd_trained_m, image, tile_size, infer_shape, adapter FROM models WHERE id=%s",
                            (o.get("base_model"),)).fetchone()
        mets = {k: {"value": v, "unit": "ratio", "basis": "measured", "as_of": time.strftime("%Y-%m-%d"), "source": "학습 끝 검증"}
                for k, v in (result.get("metrics") or {}).items() if k.startswith("metrics/")}
        sid = _one(o.get("samples"))
        smp = None
        if isinstance(sid, str) and sid.startswith("smp_"):
            smp = conn.execute("SELECT task_name, region_name, names FROM train_samples WHERE id=%s", (sid,)).fetchone()
        yml_names = None
        if not smp and isinstance(sid, str) and sid.lower().endswith((".yaml", ".yml")):   # 이 PC 학습 자산(dataset.yaml 경로) — 분류는 그 yaml 의 names
            try:
                import yaml as _y
                nm = (_y.safe_load(open(sid, encoding="utf-8")) or {}).get("names")
                yml_names = [str(v) for _, v in sorted(nm.items())] if isinstance(nm, dict) else [str(v) for v in (nm or [])]
            except Exception:
                yml_names = None
        classes = list(smp[2]) if smp and smp[2] else (yml_names or (base[2] if base else None))
        name = model_name(smp[0] if smp else o.get("task_name"), smp[1] if smp else None, time.strftime("%Y.%m.%d"))
        # 같은 날 같은 업무로 다시 학습하면 이름이 겹친다(결재함·모델 목록에서 구별 불가) → 두 번째부터 '· n회'
        same = conn.execute("SELECT count(*) FROM models WHERE id<>%s AND (name->>'ko' = %s OR name->>'ko' LIKE %s)",
                            (mid, name, name + " · %회")).fetchone()[0]
        if same:
            name = f"{name} · {same + 1}회"
        conn.execute("INSERT INTO models(id, family, version, weights_uri, task, classes, input, gsd_trained_m, metrics, status, image, tile_size, "
                     "infer_shape, adapter, name, sample_id, train_job, train_log, created_at) "
                     "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,'candidate',%s,%s,%s,%s,%s,%s,%s,%s,now()) ON CONFLICT (id) DO UPDATE SET "
                     "weights_uri=EXCLUDED.weights_uri, metrics=EXCLUDED.metrics, train_log=EXCLUDED.train_log, name=EXCLUDED.name",
                     (mid, base[0] if base else None, time.strftime("%Y%m%d"), result["weights"], base[1] if base else "seg",
                      json.dumps(classes, ensure_ascii=False) if classes is not None else None,
                      json.dumps(base[3]) if base and base[3] is not None else None,
                      base[4] if base else None, json.dumps(mets), base[5] if base else None, base[6] if base else None,
                      base[7] if base else None, base[8] if base else None, json.dumps({"ko": name}, ensure_ascii=False), sid,
                      job.get("id"), json.dumps(result.get("log") or [])))
    return {"counts": {"model": 1}, "model_id": mid}
