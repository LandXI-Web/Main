"""전국 정리 전후 합계 — 정리 상태 파일(_logs/tidy/{자산}-{해}/{시군구}.json)과 진행 장부(national_cells.counts). 읽기 전용. → tally-c22.json"""
import json, sys
from pathlib import Path
sys.path.insert(0, r"E:/Land-XI 플랫폼/01. 디자인/server")
from national import tidy as T
H = Path(__file__).parent
out = {}
for asset in ("farm", "river"):
    d = T._state_dir(asset, 2025)
    files = list(d.glob("*.json")) if d.exists() else []
    agg = {"sgg": len(files), "in": 0, "out": 0, "merged_pieces": 0, "merged_into": 0, "candidates": 0, "dropped": {}, "delta": {}}
    for f in files:
        s = json.loads(f.read_text(encoding="utf-8"))
        st = s.get("stats") or {}
        for k in ("in", "out", "merged_pieces", "merged_into", "candidates"):
            agg[k] += int(st.get(k) or 0)
        for k, v in (st.get("dropped") or {}).items():
            agg["dropped"][k] = agg["dropped"].get(k, 0) + int(v)
        for cd, dv in (s.get("applied") or {}).items():
            for cls, (dn, da) in dv.items():
                x = agg["delta"].setdefault(cls, [0, 0.0]); x[0] += dn; x[1] += da
    with T._pg() as c:
        rows = c.execute("SELECT k, sum((v->>'n')::bigint), sum((v->>'km2')::numeric) FROM national_cells, jsonb_each(counts) e(k, v) "
                         "WHERE asset=%s AND year=2025 AND NOT test AND state='done' GROUP BY k", (asset,)).fetchall()
    agg["now"] = {k: [int(n), round(float(a), 2)] for k, n, a in rows}
    agg["before"] = {k: [v[0] - agg["delta"].get(k, [0, 0])[0], round(v[1] - agg["delta"].get(k, [0, 0])[1], 2)] for k, v in agg["now"].items()}
    agg["delta"] = {k: [v[0], round(v[1], 2)] for k, v in agg["delta"].items()}
    out[asset] = agg
(H.parent / "tally-c22.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
print(json.dumps(out, ensure_ascii=False))
