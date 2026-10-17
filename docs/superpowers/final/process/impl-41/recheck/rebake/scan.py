"""전국 결과 칸 파일 목록 — national_jobs(done · 시험 아님)의 result_set → 파일 · lx_light 판. 읽기만."""
import json, sys, time, os
sys.path.insert(0, r"E:/Land-XI 플랫폼/01. 디자인/server")
from pathlib import Path
from landxi_api import config
from landxi_api.catalog import resolve_set_path
from survey.db import pg, lx_tx
from pmtiles.reader import Reader
c = pg(); lx_tx(c)
rows = c.execute("SELECT job_id, result_set, asset, cell_cd, done_at FROM national_jobs WHERE state='done' AND result_set IS NOT NULL AND NOT test").fetchall()
out = []
cnt = {}
for job, rs, asset, cell, done in rows:
    rel = resolve_set_path(rs)
    if not rel: cnt['norel'] = cnt.get('norel', 0) + 1; continue
    p = config.DATA_ROOT / rel
    if not p.exists(): cnt['missing'] = cnt.get('missing', 0) + 1; continue
    with open(p, 'rb') as f:
        def get(o, l): f.seek(o); return f.read(l)
        try:
            m = Reader(get).metadata()
        except Exception as e:
            cnt['bad'] = cnt.get('bad', 0) + 1; continue
    v = (m.get('lx_light') or {}).get('v') if isinstance(m.get('lx_light'), dict) else None
    cnt[f'v{v}'] = cnt.get(f'v{v}', 0) + 1
    out.append({"job": job, "path": str(p), "v": v, "age_s": round(time.time() - p.stat().st_mtime), "size": p.stat().st_size})
print(len(rows), cnt)
json.dump(out, open(sys.argv[1], 'w', encoding='utf-8'), ensure_ascii=False)
