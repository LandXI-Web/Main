"""어댑터 · 모델 레지스트리 스캔.

- 어댑터: server/adapters/**/adapter_*.py 의 모듈 상단 ADAPTER 상수를 AST 로 읽는다(torch import 없이 — 게이트웨이도 쓴다).
  global/ 하위(F1-D 소유)도 같은 규칙으로 자동 등록된다.
- 모델: LX_DATA_ROOT/models/index.json(P6 · 9런) + car_v2_obb(B05) + 어댑터가 선언한 모델(예: index/ndvi_pc) → models 행.
"""
from __future__ import annotations

import ast
import csv
import importlib.util
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from landxi_api import config  # noqa: E402

ADAPTER_ROOT = config.SERVER_ROOT / "adapters"


def scan_adapters() -> dict[str, dict]:
    out = {}
    for f in sorted(ADAPTER_ROOT.rglob("adapter_*.py")):
        try:
            tree = ast.parse(f.read_text(encoding="utf-8"))
        except Exception as e:  # pragma: no cover
            print("adapter parse fail", f, e, flush=True)
            continue
        for node in tree.body:
            if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "ADAPTER" for t in node.targets):
                try:
                    a = ast.literal_eval(node.value)
                except Exception:
                    continue
                a = dict(a)
                a["_path"] = str(f)
                a["_scope"] = "global" if "global" in f.parts else "core"
                out[a["id"]] = a
    return out


def adapter_device(adapter_id: str) -> str:
    return scan_adapters().get(adapter_id, {}).get("device", "gpu")


def adapter_for_model(model_id: str, task: str | None = None) -> str | None:
    ads = scan_adapters()
    for aid, a in ads.items():
        if model_id in (a.get("models") or []) or model_id == aid:
            return aid
    if task == "obb":
        return "yolo_obb"
    if task == "seg":
        return "yolo_seg"
    return None


def load_adapter(adapter_id: str):
    a = scan_adapters().get(adapter_id)
    if not a:
        raise KeyError(f"adapter {adapter_id} 없음")
    name = "lx_adapter_" + adapter_id.replace("/", "_")
    spec = importlib.util.spec_from_file_location(name, a["_path"])
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    if hasattr(mod, "make_adapter"):
        return mod.make_adapter(), a
    for cand in ("Adapter", "YoloAdapter", "NdviAdapter"):
        if hasattr(mod, cand):
            return getattr(mod, cand)(), a
    cls = next((v for k, v in vars(mod).items() if isinstance(v, type) and hasattr(v, "run_shard") and v.__module__ == name), None)
    if cls is None:
        raise KeyError(f"adapter {adapter_id}: 클래스 없음")
    return cls(), a


def _env(value, unit, basis, as_of, source, note=None):
    e = {"value": value, "unit": unit, "basis": basis, "as_of": as_of, "source": source}
    if note:
        e["note"] = note
    return e


def scan_models() -> list[dict]:
    rows = []
    idx = json.loads((config.DATA_ROOT / "models" / "index.json").read_text(encoding="utf-8"))
    for m in idx:
        names = [m["names"][k] for k in sorted(m.get("names", {}), key=lambda x: int(x))]
        mid = m["id"]
        is_aerial = mid.startswith("aerial25")
        best = m.get("best_by_mask_mAP50") or {}
        metrics = {}
        if is_aerial:
            mm = m.get("metrics") or {}
            metrics["mask_mAP50"] = _env(mm.get("metrics/mAP50(M)"), "ratio", "recorded", (m.get("ckpt_date") or "")[:10], "ckpt train_metrics",
                                         "results.csv 없음 — 체크포인트 내장 지표")
            src_card = "/files/models/aerial25/card.json"
        else:
            if best:
                metrics["mask_mAP50"] = _env(best.get("metrics/mAP50(M)"), "ratio", "recorded", (m.get("ckpt_date") or "")[:7],
                                             f"models/{mid}/results.csv", f"best epoch {int(best.get('epoch', 0))}")
                metrics["box_mAP50"] = _env(best.get("metrics/mAP50(B)"), "ratio", "recorded", (m.get("ckpt_date") or "")[:7],
                                            f"models/{mid}/results.csv", f"best epoch {int(best.get('epoch', 0))}")
            src_card = f"/files/models/{mid}/card.json"
        ta = m.get("train_args") or {}
        fam = str(ta.get("model", "")).split("/")[-1].replace(".pt", "") or ("yolo11-seg" if is_aerial else None)
        if is_aerial:
            fam = "yolo11-seg"
        rows.append({"id": mid, "family": fam, "version": m.get("run"), "weights_uri": m.get("weights"), "task": "seg", "classes": names,
                     "input": ["ortho"], "gsd_trained_m": 0.25 if is_aerial else 0.02, "metrics": metrics, "status": "registered",
                     "image": None, "tile_size": int(ta.get("imgsz", 1024)), "infer_shape": [int(ta.get("imgsz", 1024))] * 2,
                     "card_url": src_card, "adapter": "yolo_seg"})
    # B05 차량 OBB
    rc = Path(r"E:/drone_runs/car_v2_obb/run/results.csv")
    met = {}
    if rc.exists():
        r = list(csv.DictReader(open(rc, encoding="utf-8")))
        r = [{k.strip(): v for k, v in x.items()} for x in r]
        b = max(r, key=lambda x: float(x["metrics/mAP50(B)"]))
        met["mAP50"] = _env(round(float(b["metrics/mAP50(B)"]), 5), "ratio", "recorded", "2026-06", "E:/drone_runs/car_v2_obb/run/results.csv",
                            f"best epoch {int(float(b['epoch']))}")
        met["mAP50_95"] = _env(round(float(b["metrics/mAP50-95(B)"]), 5), "ratio", "recorded", "2026-06", "E:/drone_runs/car_v2_obb/run/results.csv")
    rows.append({"id": "car_v2_obb", "family": "yolo11x-obb", "version": "run", "weights_uri": r"E:\drone_runs\car_v2_obb\run\weights\best.pt",
                 "task": "obb", "classes": ["vehicle"], "input": ["ortho"], "gsd_trained_m": 0.02, "metrics": met, "status": "registered",
                 "image": None, "tile_size": 1024, "infer_shape": [1024, 1024], "card_url": None, "adapter": "yolo_obb"})
    # 비지도 변화(A04) — 학습 모델 아님
    rows.append({"id": "unsupervised-change", "family": "change-index", "version": "A04", "weights_uri": None, "task": "index",
                 "classes": ["veg_gain", "veg_loss", "built_gain", "built_loss"], "input": ["ortho"], "gsd_trained_m": None,
                 "metrics": {}, "status": "recorded", "image": None, "tile_size": None, "infer_shape": None, "card_url": None, "adapter": None})
    # 어댑터가 선언한 index 모델(F1-D global/adapter_ndvi_pc 등) — 파일이 아직 없어도 계약 ID 로 자리를 만든다
    ads = scan_adapters()
    declared = {"index/ndvi_pc": {"id": "index/ndvi_pc", "kinds": ["index"], "device": "cpu", "_scope": "global(계약 §7 · 어댑터 파일 대기)"}}
    declared.update({k: v for k, v in ads.items() if "index" in (v.get("kinds") or [])})
    for aid, a in declared.items():
        rows.append({"id": aid, "family": "index", "version": "0.1", "weights_uri": None, "task": "index", "classes": [],
                     "input": ["satellite"], "gsd_trained_m": None, "metrics": {}, "status": "registered" if aid in ads else "pending-adapter",
                     "image": None, "tile_size": None, "infer_shape": None, "card_url": None, "adapter": aid})
    return rows


def upsert_models_sql(cur, rows: list[dict]):
    for m in rows:
        cur.execute(
            "INSERT INTO models(id, family, version, weights_uri, task, classes, input, gsd_trained_m, metrics, status, image, tile_size, "
            "infer_shape, card_url, adapter) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (id) DO UPDATE SET "
            "family=EXCLUDED.family, version=EXCLUDED.version, weights_uri=EXCLUDED.weights_uri, task=EXCLUDED.task, classes=EXCLUDED.classes, "
            "input=EXCLUDED.input, gsd_trained_m=EXCLUDED.gsd_trained_m, metrics=EXCLUDED.metrics, status=EXCLUDED.status, "
            "tile_size=EXCLUDED.tile_size, infer_shape=EXCLUDED.infer_shape, card_url=EXCLUDED.card_url, adapter=EXCLUDED.adapter",
            (m["id"], m["family"], m["version"], m["weights_uri"], m["task"], json.dumps(m["classes"], ensure_ascii=False),
             json.dumps(m["input"]), m["gsd_trained_m"], json.dumps(m["metrics"], ensure_ascii=False), m["status"], m["image"],
             m["tile_size"], m["infer_shape"], m["card_url"], m["adapter"]))


if __name__ == "__main__":
    print(json.dumps({k: {kk: vv for kk, vv in v.items() if kk != "_path"} for k, v in scan_adapters().items()}, ensure_ascii=False, indent=1))
    print(len(scan_models()), "models")
