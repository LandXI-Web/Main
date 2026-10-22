#!/usr/bin/env python
"""파일과 DB 짝 맞추기(10-22 now21 저장보안-제안-파일DB짝 채택 · 바퀴 22 P4) — 매주 한 번(예약 작업 LandXI-Pair-Check · CPU 만 · 낮은 우선순위).

본다(지우지 않는다 — 세기만):
  ① 장부에는 있는데 파일이 없는 것: 끝난 분석 작업의 결과 파일(.fgb/.geojson + .pmtiles) · 영상 표의 영상 파일 · 표준본 · 학습 칸 그림
  ② 파일은 있는데 장부에 없는 것: results/ 의 작업 결과 파일(job_*)인데 작업 목록에 없는 것
  ③ 결과 줄의 작업 번호가 작업 목록 · 이름 있는 판(result_sources)에 없는 것(결과-작업 연결 규칙 · 0122)
결과 = 02. 데이터/_logs/pair-check/{날짜}.json + Redis ops:paircheck(관리자 대시보드 할 일 목록이 읽는다).

사용: python server/ops/pair_check.py [--json]
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from landxi_api import config  # noqa: E402
from landxi_api import result_store as R  # noqa: E402

JOB_RX = re.compile(r"^(job_[0-9A-Z]{20,32})(\.fgb|\.geojson|\.geojson\.gz|\.pmtiles)?$")
KST = dt.timezone(dt.timedelta(hours=9))
SAMPLE = 20


def _abs(p: str) -> Path:
    return Path(p) if (":" in p[:3] or os.path.isabs(p)) else config.DATA_ROOT / p


def run() -> dict:
    import psycopg
    t0 = time.time()
    out: dict = {"at": dt.datetime.now(KST).isoformat(timespec="seconds")}
    with psycopg.connect(config.PG_WORKER_DSN.replace("@localhost:", "@127.0.0.1:"), autocommit=True) as c:
        c.execute("SELECT set_config('app.realm','lx',false)")
        jobs = c.execute("SELECT id, tenant_id, result_set, snapshot_ready FROM jobs WHERE state='done' AND NOT demo AND kind NOT IN ('tile','train','index') "
                         "AND result_set LIKE 'results/%'").fetchall()
        known = {r[0] for r in c.execute("SELECT id FROM jobs").fetchall()}
        imgs = c.execute("SELECT id, path_internal, layer->>'cog_path' FROM imagery WHERE coalesce((layer->>'removed')::boolean, false) = false "
                         "AND coalesce(layer->>'role','') NOT IN ('national','request')").fetchall()
        stds = c.execute("SELECT id, std_path FROM imagery_std WHERE state='ready' AND std_path IS NOT NULL").fetchall()
        tiles = c.execute("SELECT id, img_path FROM train_tiles WHERE state='made' AND img_path IS NOT NULL").fetchall()
        orphan_rows = c.execute(
            "SELECT DISTINCT d.job_id FROM detections d WHERE NOT EXISTS (SELECT 1 FROM jobs j WHERE j.id = d.job_id) "
            "AND NOT EXISTS (SELECT 1 FROM result_sources s WHERE s.id = d.job_id) LIMIT 50").fetchall() \
            if c.execute("SELECT to_regclass('public.result_sources') IS NOT NULL").fetchone()[0] else []
    miss_res = []
    for jid, tenant, rs, snap in jobs:
        b = R.base_of_set(rs)
        if b is None:
            continue
        vec = R.vector_of_base(b)
        pm = b.with_name(b.name + ".pmtiles")
        if vec is None and not pm.exists():
            miss_res.append(jid)
    miss_img = [i for i, p, cog in imgs if (p or cog) and not _abs(p or cog).exists()]
    miss_std = [i for i, p in stds if not _abs(p).exists()]
    miss_tile = [i for i, p in tiles if not Path(p).exists()]
    # ② 결과 폴더의 작업 결과 파일인데 작업 목록에 없는 것(기관 · 연-월 폴더까지)
    stray, scanned = [], 0
    root = config.DATA_ROOT / "results"
    for t in (root.iterdir() if root.is_dir() else []):
        if not t.is_dir():
            continue
        dirs = [t] + [m for m in t.iterdir() if m.is_dir() and re.fullmatch(r"\d{4}-\d{2}", m.name)]
        for d in dirs:
            with os.scandir(d) as it:
                for e in it:
                    m = JOB_RX.match(e.name)
                    if not m:
                        continue
                    scanned += 1
                    if m.group(1) not in known:
                        stray.append(f"{t.name}/{d.name + '/' if d is not t else ''}{e.name}")
    out.update({
        "missing_result_files": {"n": len(miss_res), "sample": miss_res[:SAMPLE]},
        "missing_imagery_files": {"n": len(miss_img), "sample": miss_img[:SAMPLE]},
        "missing_standard_files": {"n": len(miss_std), "sample": miss_std[:SAMPLE]},
        "missing_train_images": {"n": len(miss_tile), "sample": miss_tile[:SAMPLE]},
        "files_without_job": {"n": len(stray), "sample": stray[:SAMPLE], "scanned": scanned},
        "result_rows_without_job": {"n": len(orphan_rows), "sample": [r[0] for r in orphan_rows[:SAMPLE]]},
        "checked": {"jobs": len(jobs), "imagery": len(imgs), "standard": len(stds), "train_tiles": len(tiles)},
        "took_s": round(time.time() - t0, 1),
    })
    out["mismatch"] = sum(v["n"] for k, v in out.items() if isinstance(v, dict) and "n" in v)
    d = config.DATA_ROOT / "_logs" / "pair-check"
    d.mkdir(parents=True, exist_ok=True)
    (d / f"{out['at'][:10]}.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    try:
        import redis
        rd = redis.Redis.from_url(config.REDIS_URL, decode_responses=True, socket_timeout=5)
        rd.hset("ops:paircheck", mapping={"json": json.dumps(out, ensure_ascii=False), "at": out["at"], "mismatch": out["mismatch"]})
    except Exception:  # noqa: BLE001
        pass
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    for s_ in (sys.stdout, sys.stderr):
        try:
            s_.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass
    r = run()
    print(json.dumps(r, ensure_ascii=False, indent=None if a.json else 1))
