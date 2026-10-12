"""프로젝트 학습 화면(학습-작업흐름-v3 · 원칙 183 · 200 · 208 · 209) — 이 프로젝트의 학습 기록 한 번에.

GET /projects/{pid}/train
  runs  = 이 프로젝트의 학습(끝난 것 · 도는 것 · 기다리는 것) 최근 순. 줄마다
          시각(시작 · 끝 · 걸린 초) · 설정(반복 · 크기 · 한 번에 — 작업 기록 값, 없으면 학습 어댑터 기본값) ·
          학습 데이터(n장 · 그중 자체 검증 n장 · 이름) · 기반 모델 · 만든 모델(상태) ·
          AI 모델 정확도(모델 기록의 학습 끝 검증 값 — kit/acc.js · cards.py 와 같은 순서) ·
          반복마다 정확도(모델 기록 train_log 의 map50 — 분할 모델은 마스크 값) ·
          같은 검증 묶음 값(검증만 작업 결과 models/eval/*.json — 이 모델의 클래스 · 같은 묶음 · 같은 크기로 잰 원판 값과 함께)
  base  = 이 프로젝트 첫 학습의 기반 모델(원판) — 이름 · 클래스 · 정확도 · 날짜
어느 학습이 이 프로젝트 것인가 = 프로젝트 판정(projects._facts)과 같은 규칙(작업에 밝힌 project_id · 이 프로젝트 학습 표본) +
  이 PC 학습 자산으로 같은 업무를 다시 학습한 것(작업의 업무 이름이 프로젝트 업무 이름으로 시작 · 다른 프로젝트를 밝히지 않음).
숫자는 모두 서버 기록 · 학습 기록 파일에서 그대로(지어낸 값 0). 파일 경로 · 작업 번호는 화면 글로 쓰지 않는다(화면이 고르지 않음).
"""
from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, Request

from . import config
from .deps import db
from .envelope import env, now_iso
from .projects import _iso, _lx, _row, _sample_ids

router = APIRouter()

ACC_KEYS = ("mask_mAP50", "metrics/mAP50(M)", "box_mAP50", "metrics/mAP50(B)", "mAP50")   # kit/acc.js ACC_KEYS 와 같은 순서
DEFAULTS = {"epochs": 3, "imgsz": 640, "batch": 4}                                          # adapters/adapter_train_yolo.py DEFAULTS
_IMG = (".jpg", ".jpeg", ".png", ".tif", ".tiff", ".bmp")
_N_CACHE: dict[str, tuple[float, int]] = {}


def _obj(v):
    if isinstance(v, str):
        try:
            return json.loads(v)
        except ValueError:
            return None
    return v


def _acc(metrics) -> dict | None:
    mt = _obj(metrics) or {}
    for k in ACC_KEYS:
        e = mt.get(k)
        v = e.get("value") if isinstance(e, dict) else e
        try:
            v = float(v)
        except (TypeError, ValueError):
            continue
        basis = e.get("basis") if isinstance(e, dict) and e.get("basis") in ("recorded", "measured") else "recorded"
        return {**env(round(v * 100), "%", basis, "모델 기록 · 학습 끝 검증", as_of=(e.get("as_of") if isinstance(e, dict) else None)),
                "ratio": round(v, 5)}
    return None


def _cnt(n, src: str = "학습 데이터 기록(묶음 기록 · 올린 파일)"):
    return env(int(n), "count", "measured", src) if n is not None else None


def _count_dir(d: Path) -> int:
    """폴더 안 그림 파일 수(폴더 시각이 같으면 다시 세지 않는다)."""
    try:
        mt = d.stat().st_mtime
    except OSError:
        return 0
    hit = _N_CACHE.get(str(d))
    if hit and hit[0] == mt:
        return hit[1]
    n = sum(1 for f in d.iterdir() if f.suffix.lower() in _IMG) if d.is_dir() else 0
    _N_CACHE[str(d)] = (mt, n)
    return n


def _yaml(p: Path) -> dict:
    try:
        import yaml
        return yaml.safe_load(p.read_text(encoding="utf-8")) or {}
    except Exception:  # noqa: BLE001
        return {}


def _asset_data(path: str) -> dict | None:
    """이 PC 학습 자산(dataset.yaml) — 묶음 기록(bundle.json)의 있는 칸 + 없는 칸 · 검증 몫, 없으면 폴더의 그림 수."""
    p = Path(path)
    if p.suffix.lower() not in (".yaml", ".yml") or not p.exists():
        return None
    b = {}
    try:
        b = json.loads((p.parent / "bundle.json").read_text(encoding="utf-8")) or {}
    except Exception:  # noqa: BLE001
        b = {}
    if isinstance(b.get("positive"), int):
        n = int(b["positive"]) + int(b.get("negative") or 0)
        sp = b.get("split") or {}
        val = int(sp.get("val_p") or 0) + int(sp.get("val_n") or 0) or None
        return {"images": _cnt(n), "val": _cnt(val), "with": _cnt(int(b["positive"])), "without": _cnt(int(b.get("negative") or 0) or None)}
    y = _yaml(p)
    base = Path(str(y.get("path") or p.parent))
    cnt = lambda k: sum(_count_dir(base / str(v)) for v in (y.get(k) if isinstance(y.get(k), list) else [y.get(k)] if y.get(k) else []))   # noqa: E731
    tr, va = cnt("train"), cnt("val")
    return {"images": _cnt((tr + va) or None), "val": _cnt(va or None)} if tr or va else None


def _evals() -> list[dict]:
    """검증만 작업 결과(models/eval/*.json) — 모델 · 묶음 · 크기 · 분류별 값."""
    d = config.DATA_ROOT / "models" / "eval"
    out = []
    for f in sorted(d.glob("*.json")) if d.is_dir() else []:
        try:
            out.append(json.loads(f.read_text(encoding="utf-8")))
        except Exception:  # noqa: BLE001
            continue
    return out


def _bundle_of(ev: dict) -> tuple[str, int | None]:
    """검증 묶음 이름(묶음 폴더) · 칸 수(묶음 기록 images → 없으면 val 폴더 그림 수)."""
    p = Path(str(ev.get("samples") or ev.get("data") or ""))
    ds = p.parent                       # …/eval/{묶음}/{분류 묶음}/dataset.yaml
    root = ds.parent if (ds.parent / "bundle.json").exists() else ds
    n = None
    try:
        n = int((json.loads((root / "bundle.json").read_text(encoding="utf-8")) or {}).get("images") or 0) or None
    except Exception:  # noqa: BLE001
        n = None
    if n is None:
        n = _count_dir(ds / "images" / "val") or None
    return root.name, n


def _class_val(ev: dict, classes: list[str]) -> float | None:
    """분류별 값(마스크 먼저) — 고른 분류들의 평균."""
    per = ev.get("classes") or {}
    vs = []
    for c in classes:
        x = per.get(c) or {}
        v = (x.get("mask") or x.get("box") or {}).get("map50")
        if v is not None:
            vs.append(float(v))
    return sum(vs) / len(vs) if vs else None


def _same_bundle(evals: list[dict], model_id: str, classes: list[str], base_id: str | None) -> dict | None:
    """같은 검증 묶음 값 — 이 모델의 가장 최근 검증 + 같은 묶음 · 같은 크기로 잰 원판(기반) 값."""
    mine = [e for e in evals if e.get("model_id") == model_id]
    if not mine or not classes:
        return None
    ev = sorted(mine, key=lambda e: str(e.get("at") or ""))[-1]
    v = _class_val(ev, classes)
    if v is None:
        return None
    name, n = _bundle_of(ev)
    out = {"value": env(round(v * 100), "%", "measured", "같은 검증 묶음(학습에 안 쓴 칸)", as_of=str(ev.get("at") or "")[:10] or None),
           "images": _cnt(n, "같은 검증 묶음 칸 수"), "imgsz": ev.get("imgsz"), "at": ev.get("at")}
    if base_id:
        bs = [e for e in evals if e.get("model_id") == base_id and e.get("imgsz") == ev.get("imgsz") and _bundle_of(e)[0] == name]
        bv = _class_val(sorted(bs, key=lambda e: str(e.get("at") or ""))[-1], classes) if bs else None
        if bv is not None:
            out["base"] = {"value": env(round(bv * 100), "%", "measured", "같은 검증 묶음 · 기반 모델")}
    return out


def _log(rows) -> dict | None:
    """반복마다 정확도(1회부터 차례로) — 모델 기록 train_log 의 map50(분할 모델은 마스크 값)."""
    by = {}
    for x in _obj(rows) or []:                    # 같은 회차가 두 번(학습 끝 최종 검증) 적혔으면 나중 값
        if isinstance(x, dict) and x.get("epoch") is not None and x.get("map50") is not None:
            by[int(x["epoch"])] = x
    rows = [by[k] for k in sorted(by)]
    return env([round(float(x["map50"]), 4) for x in rows], "ratio", "measured", "학습 기록 · 반복마다 자체 검증") if rows else None


def _model_word(m) -> dict | None:
    if not m:
        return None
    cls = [str(c) for c in (_obj(m["classes"]) or [])]
    nm = _obj(m["name"])
    nm = nm.get("ko") if isinstance(nm, dict) else nm
    day = ""
    mt = _obj(m["metrics"]) or {}
    day = next((str(e.get("as_of"))[:10] for e in mt.values() if isinstance(e, dict) and e.get("as_of")), "")
    return {"id": m["id"], "name": nm, "classes": cls, "acc": _acc(m["metrics"]), "day": day or (_iso(m["created_at"]) or "")[:10] or None,
            "status": m["status"], "gsd_m": float(m["gsd_trained_m"]) if m["gsd_trained_m"] is not None else None}


@router.get("/projects/{pid}/train")
async def project_train(pid: str, request: Request):
    _lx(request)
    async with db(realm="lx") as conn:
        r = await _row(conn, pid)
        sids = await _sample_ids(conn, pid)
        task = str(r["task"] or "").strip()
        jobs = await conn.fetch(
            "SELECT id, state, model_id, options, created_at, started_at, finished_at FROM jobs WHERE kind='train' "
            "AND coalesce(options->>'eval','') NOT IN ('true','1') AND state IN ('queued','running','done') AND ("
            "options->>'project_id' = $1 OR (options->'samples') ?| $2::text[] OR "
            "($3 <> '' AND options->>'project_id' IS NULL AND jsonb_typeof(options->'samples') = 'string' "
            "AND position($3 in coalesce(options->>'task_name','')) = 1 "
            # 프로젝트 이전 학습(프로젝트 표시 없음)은 같은 업무의 가장 먼저 만든 프로젝트 것만 — 새 프로젝트에 남의 학습 이력이 붙지 않게(구현 23차)
            "AND NOT EXISTS (SELECT 1 FROM projects q WHERE q.task = $3 AND q.created_at < (SELECT created_at FROM projects WHERE id = $1)))) "
            "ORDER BY created_at DESC LIMIT 40",
            pid, sids or ["-"], task)
        jids = [j["id"] for j in jobs]
        made = {m["train_job"]: m for m in await conn.fetch(
            "SELECT id, name, status, classes, metrics, train_log, sample_id, train_job, gsd_trained_m, created_at FROM models WHERE train_job = ANY($1::text[])",
            jids or ["-"])}
        bases = {j["model_id"] for j in jobs if j["model_id"]}
        brow = {m["id"]: m for m in await conn.fetch(
            "SELECT id, name, status, classes, metrics, gsd_trained_m, created_at, train_job FROM models WHERE id = ANY($1::text[])", list(bases) or ["-"])}
        smp = {s["id"]: s for s in await conn.fetch(
            "SELECT id, task_name, n_images, n_train, created_at FROM train_samples WHERE id = ANY($1::text[])",
            list({str(x) for j in jobs for x in ((_obj(j["options"]) or {}).get("samples") if isinstance((_obj(j["options"]) or {}).get("samples"), list) else [])}) or ["-"])}
    evals = _evals()
    # 원판 = 이 프로젝트 학습이 만든 모델이 아닌 기반 모델 중 가장 오래된 학습의 것
    ours = {m["id"] for m in made.values()}
    root = None
    for j in sorted(jobs, key=lambda x: x["created_at"]):
        if j["model_id"] and j["model_id"] not in ours:
            root = j["model_id"]
            break
    runs = []
    for j in jobs:
        o = _obj(j["options"]) or {}
        s = o.get("samples")
        s1 = s[0] if isinstance(s, list) and s else s if isinstance(s, str) else None
        data = None
        if isinstance(s1, str) and s1 in smp:
            x = smp[s1]
            n, nt = int(x["n_images"] or 0), x["n_train"]
            data = {"images": _cnt(n or None), "val": _cnt((n - int(nt)) if nt is not None and n else None), "name": x["task_name"], "day": (_iso(x["created_at"]) or "")[:10],
                    "kind": "sample", "ref": s1}
        elif isinstance(s1, str):
            a = _asset_data(s1)
            data = {**(a or {}), "name": o.get("task_name") or task or None, "kind": "asset", "ref": s1}
        m = made.get(j["id"])
        mw = _model_word(m) if m else None
        took = int((j["finished_at"] - j["started_at"]).total_seconds()) if j["finished_at"] and j["started_at"] else None
        runs.append({
            "job": j["id"], "state": j["state"], "created_at": _iso(j["created_at"]), "started_at": _iso(j["started_at"]), "finished_at": _iso(j["finished_at"]),
            "took": env(took, "s", "measured", "작업 기록 · 시작에서 끝까지") if took is not None else None,
            "epochs": env(int(o.get("epochs") or DEFAULTS["epochs"]), "count", "recorded", "학습 설정 · 반복 횟수"), "imgsz": int(o.get("imgsz") or DEFAULTS["imgsz"]),
            "batch": int(o.get("batch") or DEFAULTS["batch"]), "data": data,
            "base": {"id": j["model_id"], "root": j["model_id"] == root, **({"day": _model_word(brow[j["model_id"]])["day"]} if j["model_id"] in brow else {})},
            "model": mw, "acc": mw["acc"] if mw else None, "log": _log(m["train_log"]) if m else None,
            "same": _same_bundle(evals, m["id"], [task] if task in mw["classes"] else mw["classes"], root) if m else None,   # 이 프로젝트 대상 분류로 잰 값
            "events_url": f"/events/jobs/{j['id']}" if j["state"] in ("queued", "running") else None})
    base = _model_word(brow.get(root)) if root else None
    return {"project": pid, "runs": runs, "base": base, "as_of": now_iso()}
