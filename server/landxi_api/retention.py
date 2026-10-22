"""보관 기한 정리(10-22 now21 인프라-취소실패정리 ⓐ · 저장보안-제안-접속주소90일 채택) — 하루 한 번 CPU 작업기가 돈다(GPU 0).

1. 취소 · 실패한 분석 작업의 결과(끝난 지 30일 지남): 결과 폴더 · 결과 파일 · DB 결과 줄을 지운다. 작업 기록(jobs 줄)은 남긴다.
   서비스 결과 · 공개 판 · 배포본이 가리키는 작업은 건드리지 않는다(취소 · 실패여도).
2. 지난 학습 묶음(마지막으로 바뀐 지 30일 지남): 묶음의 그림 · 라벨(images/ · labels/ · *.cache)만 지운다.
   설명 파일(bundle.json · dataset.yaml) · 기록 · 진행 · 가중치는 남긴다(같은 묶음은 만드는 스크립트로 다시 만들 수 있다).
   학습 중인 묶음(진행 파일이 30일 안에 바뀜)은 건드리지 않는다. 사람이 올린 학습 표본(samples)은 대상이 아니다.
3. 로그인 실패 기록의 접속 주소(90일 지남): 그 줄을 지운다(개인정보 보관 기한).

값은 config/retention.yaml 한 곳. dry_run: true 면 대상만 세고 지우지 않는다. 지운 수는 감사 기록(audit_log 'retention.purge') 한 줄.
"""
from __future__ import annotations

import datetime as dt
import json
import shutil
import time
from pathlib import Path

from . import config

DEFAULTS = {"failed_cancelled_days": 30, "training_bundle_days": 30, "login_ip_days": 90, "dry_run": False,
            "training_roots": ["training/retrain", "training/retrain-auto", "training/farm-v2", "training/xi-tiles"]}
RESULT_EXT = (".geojson", ".geojson.gz", ".pmtiles", ".fgb", "-summary.json")
BUNDLE_DATA = ("images", "labels")


def settings() -> dict:
    try:
        s = dict(config.load_yaml("retention") or {})
    except Exception:  # noqa: BLE001
        s = {}
    return {**DEFAULTS, **s}


def _rm(p: Path, dry: bool) -> int:
    """지운 바이트(대략) — 폴더는 통째로."""
    try:
        if p.is_dir():
            n = sum(f.stat().st_size for f in p.rglob("*") if f.is_file())
            if not dry:
                shutil.rmtree(p, ignore_errors=True)
            return n
        if p.is_file():
            n = p.stat().st_size
            if not dry:
                p.unlink(missing_ok=True)
            return n
    except OSError:
        pass
    return 0


def purge_jobs(conn, days: int, dry: bool) -> dict:
    """취소 · 실패 작업 결과(끝난 지 days 일)."""
    rows = conn.execute(
        "SELECT j.id, j.result_set FROM jobs j WHERE j.state IN ('cancelled','failed') "
        "AND coalesce(j.finished_at, j.started_at, j.created_at) < now() - make_interval(days => %s) "
        "AND NOT EXISTS (SELECT 1 FROM service_results s WHERE s.set_id = j.id) "
        "AND NOT EXISTS (SELECT 1 FROM published_sets p WHERE p.job_id = j.id) "
        "AND NOT EXISTS (SELECT 1 FROM deploys d WHERE d.snapshot_current = j.id OR d.snapshot_prev = j.id) "
        "AND (j.result_set IS NOT NULL OR EXISTS (SELECT 1 FROM detections d WHERE d.job_id = j.id))", (days,)).fetchall()
    files = rows_n = 0
    ids = []
    from .result_store import base_of_set, files_of_base
    for jid, rs in rows:
        ids.append(jid)
        if rs and ".." not in rs:
            for f in files_of_base(base_of_set(rs)):        # 폴더 + 곁 파일(새 결과 results/{주인}/{연-월}/ · 옛 자리 둘 다)
                files += _rm(f, dry)
    if ids:
        if dry:
            rows_n = conn.execute("SELECT count(*) FROM detections WHERE job_id = ANY(%s)", (ids,)).fetchone()[0]
        else:
            rows_n = conn.execute("DELETE FROM detections WHERE job_id = ANY(%s)", (ids,)).rowcount
            conn.execute("UPDATE jobs SET result_set = NULL WHERE id = ANY(%s)", (ids,))
    return {"jobs": len(ids), "files_gb": round(files / 1e9, 3), "rows": int(rows_n)}


def purge_bundles(days: int, roots: list[str], dry: bool) -> dict:
    """지난 학습 묶음의 그림 · 라벨(묶음 = images/ 와 labels/ 를 가진 폴더 · 그 폴더의 가장 최근 변경이 days 일 넘음)."""
    cut = time.time() - days * 86400
    n = size = 0
    for r in roots:
        top = config.DATA_ROOT / r
        if not top.is_dir():
            continue
        cands = [top] + [d for d in top.iterdir() if d.is_dir()]
        for b in cands:
            if not any((b / x).is_dir() for x in BUNDLE_DATA):
                continue
            meta = [f for f in b.iterdir() if f.is_file()]
            last = max([f.stat().st_mtime for f in meta] + [(b / x).stat().st_mtime for x in BUNDLE_DATA if (b / x).exists()] or [time.time()])
            if last > cut:
                continue                                  # 30일 안에 바뀜(학습 중 · 막 만든 묶음)
            for x in BUNDLE_DATA:
                size += _rm(b / x, dry)
            for c in b.glob("*.cache"):
                size += _rm(c, dry)
            n += 1
    return {"bundles": n, "files_gb": round(size / 1e9, 3)}


def purge_login_ips(conn, days: int, dry: bool) -> dict:
    if dry:
        n = conn.execute("SELECT count(*) FROM login_failures WHERE at < now() - make_interval(days => %s)", (days,)).fetchone()[0]
    else:
        n = conn.execute("DELETE FROM login_failures WHERE at < now() - make_interval(days => %s)", (days,)).rowcount
    return {"login_failures": int(n)}


def purge(log=print) -> dict:
    """하루 한 번(작업기) — 세 가지 정리 + 감사 기록 한 줄."""
    from workers import bus
    s = settings()
    dry = bool(s.get("dry_run"))
    out: dict = {"dry_run": dry, "at": dt.datetime.now().isoformat(timespec="seconds")}
    with bus.pg() as conn:
        conn.execute("SELECT set_config('app.realm','lx',true), set_config('app.tenant_id','',true)")
        out["jobs"] = purge_jobs(conn, int(s["failed_cancelled_days"]), dry)
        out["login"] = purge_login_ips(conn, int(s["login_ip_days"]), dry)
        conn.commit()
    out["bundles"] = purge_bundles(int(s["training_bundle_days"]), list(s.get("training_roots") or []), dry)
    with bus.pg() as conn:
        conn.execute("SELECT set_config('app.realm','lx',true), set_config('app.tenant_id','',true)")
        conn.execute("INSERT INTO audit_log(actor, realm, action, subject, before, after) VALUES ('system','system','retention.purge',%s,NULL,%s)",
                     (out["at"][:10], json.dumps(out, ensure_ascii=False)))
        conn.commit()
    log(f"보관 기한 정리 — 작업 {out['jobs']} · 학습 묶음 {out['bundles']} · 로그인 실패 {out['login']} · 보기만 {dry}")
    return out
