"""해외 학습(kind 'train' · options.trainer 'train/s2unet') — Sentinel-2 달별 합성 → 경작지 · 시가지 · 물(+ 나무 · 초지 · 맨땅) 작은 U-Net.

게이트웨이 대기열로만 들어온다(POST /jobs {kind:'train', options:{trainer:'train/s2unet', dataset:'overseas/kgz/train/dataset-v1.npz'}}).
학습 장비 한 장 · 배치마다 gpu_worker 의 _gate(쉼으로 사용률 70 % · 140 W 상한 · 다른 GPU 고부하면 멈춤) — 전국 작업과 같은 규칙.
판 파일 = overseas.dataset 이 만든 묶음(2.56 km) · 고정 목록의 학습 70 · 검증 10 · 시험 20(묶음째).
결과 = 새 모델 행(status candidate · 결과 확인 전) — 성능은 시험 묶음에서 공개 판정(WorldCover 2021)과 얼마나 같은가(측정).
"""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

from adapters.base import ShardResult

ADAPTER = {"id": "train/s2unet", "kinds": ["train"], "device": "gpu", "input": "s2-monthly-npz", "output": "model", "hidden": True}
EPOCHS = 40
TARGET_IDX = (2, 3, 4)
REST_EXTRA_S = 0.0


def _cfg():
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
    from landxi_api import config
    return config


def dataset_path(rel: str | None) -> Path | None:
    """판 파일 — 02. 데이터/overseas 아래만."""
    if not rel:
        return None
    cfg = _cfg()
    base = (cfg.DATA_ROOT / "overseas").resolve()
    p = (cfg.DATA_ROOT / rel).resolve() if not os.path.isabs(rel) else Path(rel).resolve()
    if base not in p.parents or p.suffix != ".npz" or not p.exists():
        return None
    return p


def plan(job: dict) -> list[dict]:
    o = job.get("options") or {}
    return [{"shard_id": "train", "bbox": [0, 0, 0, 0], "window": None,
             "params": {k: o.get(k) for k in ("dataset", "epochs", "batch", "country", "trainer", "cw_max")}}]


def scores(cm, names) -> dict:
    import numpy as np
    C = cm.shape[0]
    out = {"oa": round(float(np.trace(cm) / max(1, cm.sum())), 4)}
    per = {}
    ious = []
    for c in range(C):
        tp = float(cm[c, c])
        fp = float(cm[:, c].sum() - tp)
        fn = float(cm[c].sum() - tp)
        if cm[c].sum() == 0 and cm[:, c].sum() == 0:
            continue
        iou = tp / max(1.0, tp + fp + fn)
        ious.append(iou)
        per[names[c]] = {"iou": round(iou, 4), "f1": round(2 * tp / max(1.0, 2 * tp + fp + fn), 4),
                         "precision": round(tp / max(1.0, tp + fp), 4), "recall": round(tp / max(1.0, tp + fn), 4),
                         "px": int(cm[c].sum())}
    out["miou"] = round(float(np.mean(ious)), 4) if ious else None
    out["classes"] = per
    return out


class Adapter:
    def __init__(self):
        self.device = "cuda:0"

    def load(self, model, device, vram_budget_mib):
        self.device = device or "cuda:0"

    def unload(self):
        try:
            import torch
            torch.cuda.empty_cache()
        except Exception:  # noqa: BLE001
            pass

    def run_shard(self, shard, read, opts):
        import numpy as np
        import torch
        import torch.nn.functional as F
        import importlib
        import overseas
        if not hasattr(overseas, "fresh"):
            importlib.reload(overseas)
        fresh = overseas.fresh
        s2 = fresh("overseas.s2")
        NAMES, NAMES_EN = fresh("overseas.dataset").NAMES, fresh("overseas.dataset").NAMES_EN
        UNet = fresh("overseas.unet").UNet
        p = {**(opts or {}), **(shard.params or {})}
        emit = opts.get("_emit") or (lambda *a, **k: None)
        gate = opts.get("_gate")
        cfg = _cfg()
        dpath = dataset_path(p.get("dataset"))
        if not dpath:
            raise RuntimeError("판 파일 없음(02. 데이터/overseas 아래 .npz)")
        t0 = time.perf_counter()
        d = np.load(dpath)
        X, Y, Y20, S = d["x"], d["y"], d["y2020"], d["split"]
        nm = len(s2.MONTHS)
        feats = np.stack([s2.features(x, nm) for x in X]).astype(np.float32)        # (N, 49, 256, 256)
        C = len(NAMES)
        ytr = Y.copy()
        ytr[Y20 != Y] = 255                                                           # 두 해 판정이 같은 화소만 배움
        tr, va, te = (S == 0), (S == 1), (S == 2)
        mu = feats[tr].mean((0, 2, 3))
        sd = feats[tr].std((0, 2, 3)) + 1e-6
        feats = (feats - mu[None, :, None, None]) / sd[None, :, None, None]

        def chips(m, y):
            xs, ys = [], []
            for i in np.nonzero(m)[0]:
                for r in range(0, 256, 64):
                    for c in range(0, 256, 64):
                        xs.append(feats[i, :, r:r + 64, c:c + 64])
                        ys.append(y[i, r:r + 64, c:c + 64])
            return np.stack(xs), np.stack(ys)
        xtr, yt = chips(tr, ytr)
        freq = np.bincount(yt[yt != 255].ravel(), minlength=C).astype(np.float64)
        w = np.where(freq > 0, np.sqrt(np.median(freq[freq > 0]) / np.maximum(freq, 1)), 1.0).clip(0.5, float(p.get("cw_max") or 2.0))
        dev = torch.device(self.device)
        cw = torch.tensor(w, dtype=torch.float32, device=dev)
        xt = torch.from_numpy(xtr)
        ytt = torch.from_numpy(yt.astype(np.int64))
        torch.manual_seed(7)
        net = UNet(feats.shape[1], C, 32).to(dev)
        ep = int(p.get("epochs") or EPOCHS)
        bs = int(p.get("batch") or 32)
        steps = ep * ((len(xt) + bs - 1) // bs)
        opt = torch.optim.AdamW(net.parameters(), 2e-3, weight_decay=1e-4)
        sch = torch.optim.lr_scheduler.OneCycleLR(opt, 3e-3, total_steps=steps)

        last = {"t": time.perf_counter()}

        def tick(force=False):
            """쉼 · 전력 규칙 — 배치가 몇십 ms 라 배치마다 쉬면 장비가 쉬지 못한다(전력이 그대로). 약 1초 일한 뒤 한 번씩 쉰다
            (gpu_worker 의 쉼 = 지난 쉼 뒤 일한 시간 × (1 − duty) ÷ duty · 30초 평균 사용률 70 % · 전력 140 W 를 넘으면 duty 를 줄임)."""
            if callable(gate) and (force or time.perf_counter() - last["t"] >= 0.5):
                if dev.type == "cuda":
                    torch.cuda.synchronize()
                gate()
                time.sleep(REST_EXTRA_S)                  # 장비가 실제로 내려앉도록 덧쉼(실측: 쉼이 짧으면 클럭이 그대로라 30초 평균 전력이 140 W 를 넘음)
                last["t"] = time.perf_counter()

        def predict(m):
            net.eval()
            outs = []
            with torch.no_grad():
                for i in np.nonzero(m)[0]:
                    x = torch.from_numpy(feats[i:i + 1]).to(dev)
                    outs.append(net(x).argmax(1)[0].cpu().numpy())
                    tick()
            net.train()
            return np.stack(outs)

        def cmat(pred, y):
            k = y != 255
            return np.bincount(y[k].astype(np.int64) * C + pred[k], minlength=C * C).reshape(C, C)
        best, best_state, rows = -1.0, None, []
        emit("train.epoch", {"epoch": 0, "epochs": ep})
        for e in range(ep):
            net.train()
            perm = torch.randperm(len(xt))
            tl, nb = 0.0, 0
            for k in range(0, len(xt), bs):
                b = perm[k:k + bs]
                x = xt[b].to(dev, non_blocking=True)
                y = ytt[b].to(dev, non_blocking=True)
                if torch.rand(1).item() < .5:
                    x, y = x.flip(-1), y.flip(-1)
                if torch.rand(1).item() < .5:
                    x, y = x.flip(-2), y.flip(-2)
                kr = int(torch.randint(0, 4, (1,)).item())
                if kr:
                    x, y = torch.rot90(x, kr, (-2, -1)), torch.rot90(y, kr, (-2, -1))
                loss = F.cross_entropy(net(x), y, weight=cw, ignore_index=255)
                opt.zero_grad()
                loss.backward()
                opt.step()
                sch.step()
                tl += float(loss.item())
                nb += 1
                tick()                                       # 약 1초마다 쉼 · 전력 규칙(풀로드 금지 · 다른 GPU 고부하면 멈춤)
            row = {"epoch": e + 1, "epochs": ep, "loss": round(tl / max(1, nb), 4)}
            if (e + 1) % 2 == 0 or e + 1 == ep:
                sc = scores(cmat(predict(va), Y[va]), NAMES)
                f1 = float(np.mean([sc["classes"].get(NAMES[c], {}).get("f1", 0) for c in TARGET_IDX]))
                row.update(val_f1_target=round(f1, 4), val_oa=sc["oa"], val_miou=sc["miou"])
                if f1 > best:
                    best = f1
                    best_state = {k: v.detach().cpu().clone() for k, v in net.state_dict().items()}
                    row["best"] = True
            rows.append(row)
            emit("train.epoch", row)
            emit("job.progress", {"progress": round((e + 1) / ep, 3), "epoch": e + 1, "epochs": ep, "shards_done": 0, "shards_total": 1})
        net.load_state_dict(best_state)
        pte = predict(te)
        test = scores(cmat(pte, Y[te]), NAMES)
        val = scores(cmat(predict(va), Y[va]), NAMES)
        out_dir = cfg.DATA_ROOT / "models" / "overseas" / str(p.get("country") or "kgz") / shard.job_id
        out_dir.mkdir(parents=True, exist_ok=True)
        wpath = out_dir / "best.pt"
        conf = {"cin": int(feats.shape[1]), "classes": C, "width": 32, "names": NAMES, "names_en": NAMES_EN, "targets": list(TARGET_IDX),
                "months": list(s2.MONTHS), "bands": list(s2.BANDS), "chip": 64, "dataset": str(dpath), "year_trained": 2021,
                "country": p.get("country") or "kgz", "label": "ESA WorldCover 2021 · 2020 과 같은 화소만 학습"}
        try:                                                                          # 판 설명(3판부터 — 정답 규칙 · 해)
            dj = json.loads(dpath.with_suffix(".json").read_text(encoding="utf-8"))
            if int(dj.get("version") or 0) >= 3:
                conf.update(label=dj.get("label") or conf["label"], year_trained=dj.get("years") or conf["year_trained"])
        except (OSError, ValueError):
            pass
        torch.save({"state": best_state, "mu": mu.tolist(), "sd": sd.tolist(), "cfg": conf}, wpath)
        np.save(out_dir / "test_pred.npy", pte.astype(np.uint8))
        ms = int((time.perf_counter() - t0) * 1000)
        info = {"weights": str(wpath), "metrics": {"test": test, "val": val, "best_val_f1_target": round(best, 4),
                                                   "chips": {"train": int(len(xt)), "val": int(va.sum()) * 16, "test": int(te.sum()) * 16},
                                                   "class_weight": [round(float(v), 3) for v in w]},
                "log": rows, "ms": ms, "basis": "measured", "country": conf["country"],
                "source": f"작은 U-Net · {dpath.name} · 시험 묶음(고정 목록) 대 WorldCover 2021"}
        (out_dir / "train.json").write_text(json.dumps(info, ensure_ascii=False, indent=1), encoding="utf-8")
        return ShardResult(features=[], metrics=info, n=1, ms=ms)


def finalize(job: dict, result: dict | None = None) -> dict:
    """새 모델 행(status candidate · 결과 확인 전 · 해외 전용 입력 's2-monthly' — 국내 · 기관 모델 고르기에는 나오지 않음)."""
    if not result or not result.get("weights"):
        return {"counts": {"model": 0}}
    cfg = _cfg()
    o = job.get("options") or {}
    mid = f"overseas/{job.get('id')}"
    test = (result.get("metrics") or {}).get("test") or {}
    day = time.strftime("%Y-%m-%d")

    def env(v, note):
        return {"value": v, "unit": "ratio", "basis": "measured", "as_of": day, "source": "시험 묶음(고정 목록) 대 ESA WorldCover 2021", "note": note}
    mets = {"oa": env(test.get("oa"), "6 분류 전체 맞춤"), "miou": env(test.get("miou"), "6 분류 평균 겹침")}
    for ko, key in (("경작지", "cropland"), ("시가지", "built"), ("물·습지", "water")):
        c = (test.get("classes") or {}).get(ko) or {}
        mets[f"{key}_f1"] = env(c.get("f1"), ko)
        mets[f"{key}_iou"] = env(c.get("iou"), ko)
    from overseas.dataset import NAMES
    country = {"kgz": "키르기스스탄"}.get(str(o.get("country") or "kgz"), str(o.get("country")))
    name = f"경작지 · 시가지 · 물 · {country}(위성 10 m) 학습 {time.strftime('%Y.%m.%d')}"
    import psycopg
    with psycopg.connect(cfg.PG_ADMIN_DSN, autocommit=True) as conn:
        conn.execute("INSERT INTO models(id, family, version, weights_uri, task, classes, input, gsd_trained_m, metrics, status, tile_size, "
                     "infer_shape, adapter, name, sample_id, train_job, train_log, created_at) "
                     "VALUES (%s,'s2-unet-small',%s,%s,'seg',%s,%s,10,%s,'candidate',512,%s,'s2_unet',%s,%s,%s,%s,now()) ON CONFLICT (id) DO UPDATE SET "
                     "weights_uri=EXCLUDED.weights_uri, metrics=EXCLUDED.metrics, train_log=EXCLUDED.train_log, name=EXCLUDED.name",
                     (mid, time.strftime("%Y%m%d"), result["weights"], json.dumps(NAMES, ensure_ascii=False), json.dumps(["s2-monthly"]),
                      json.dumps(mets, ensure_ascii=False), [512, 512], json.dumps({"ko": name}, ensure_ascii=False), o.get("dataset"),
                      job.get("id"), json.dumps(result.get("log") or [], ensure_ascii=False)))
    return {"counts": {"model": 1}, "model_id": mid}
