"""10-13 11:29~ 국토지리정보원 '접속 지연' 안내 페이지(404 html)를 빈 타일로 읽어 '끝'이 된 칸을 되돌린다.
되돌림: 칸 todo(시도 0) · 낮은 줌 면 삭제 · 그 칸 작업 연결(national_jobs) 삭제 → 다시 분석. 결과 묶음 파일(그 작업들)은 지움."""
import json, shutil, sys
sys.path.insert(0, r"E:/Land-XI 플랫폼/01. 디자인/server")
from landxi_api import config
from national.common import pg

FROM = "2026-10-13 11:29:00+09"
dry = "--do" not in sys.argv
out = {"from": FROM, "cells": [], "jobs": []}
with pg() as c:
    cells = c.execute("SELECT asset, year, cell_cd, name, target_km2, done_at, counts FROM national_cells WHERE NOT test AND "
                      "((state='done' AND done_at >= %s) OR state='running') ORDER BY done_at", (FROM,)).fetchall()
    for a, y, cd, nm, km2, d, cnt in cells:
        jobs = [r[0] for r in c.execute("SELECT job_id FROM national_jobs WHERE asset=%s AND year=%s AND cell_cd=%s AND NOT test", (a, y, cd)).fetchall()]
        out["cells"].append({"asset": a, "cell": cd, "km2": float(km2 or 0), "done_at": d.isoformat() if d else None, "counts": cnt, "jobs": jobs})
        out["jobs"] += jobs
        if not dry:
            c.execute("DELETE FROM national_faces WHERE asset=%s AND year=%s AND cell_cd=%s", (a, y, cd))
            c.execute("DELETE FROM national_jobs WHERE asset=%s AND year=%s AND cell_cd=%s AND NOT test", (a, y, cd))
            c.execute("DELETE FROM detections WHERE job_id = ANY(%s)", (jobs,))
            c.execute("UPDATE national_cells SET state='todo', tries=0, err=NULL, next_try_at=NULL, started_at=NULL, done_at=NULL, counts=NULL "
                      "WHERE asset=%s AND year=%s AND cell_cd=%s", (a, y, cd))
            for jid in jobs:
                d0 = config.DATA_ROOT / "results" / "lx" / jid
                shutil.rmtree(d0, ignore_errors=True)
                for ext in (".geojson", ".pmtiles"):
                    f = d0.with_name(jid + ext)
                    if f.exists():
                        f.unlink()
out["n_cells"] = len(out["cells"])
out["km2"] = round(sum(x["km2"] for x in out["cells"]), 3)
out["dry"] = dry
sys.stdout.reconfigure(encoding="utf-8")
print(json.dumps({k: out[k] for k in ("n_cells", "km2", "dry")}, ensure_ascii=False))
json.dump(out, open(r"C:/Users/User/AppData/Local/Temp/claude/E--Land-XI----/8755e9e1-c9d4-4ccc-ae31-8eb0e35a24df/scratchpad/fetch/reset-outage.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1, default=str)
