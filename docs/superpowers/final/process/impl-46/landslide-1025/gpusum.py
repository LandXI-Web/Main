"""GPU 기록(1초) → 카드마다 30초 평균 최대 W · 사용률 · 온도 — python gpusum.py gpu-*.csv [시작 끝]"""
import csv, sys, json
f = sys.argv[1]; a = sys.argv[2] if len(sys.argv) > 2 else "00:00:00"; b = sys.argv[3] if len(sys.argv) > 3 else "99:99:99"
rows = [r for r in csv.DictReader(open(f)) if a <= r["t"] <= b]
out = {}
for g in sorted({r["gpu"] for r in rows}):
    rs = [r for r in rows if r["gpu"] == g]
    w = [float(r["W"]) for r in rs]; u = [float(r["util"]) for r in rs]
    m30 = max((sum(w[i:i + 30]) / len(w[i:i + 30]) for i in range(max(1, len(w) - 29))), default=0)
    u30 = max((sum(u[i:i + 30]) / len(u[i:i + 30]) for i in range(max(1, len(u) - 29))), default=0)
    out[f"gpu{g}"] = {"from": rs[0]["t"], "to": rs[-1]["t"], "samples": len(rs), "max_30s_avg_W": round(m30, 1), "max_30s_avg_util": round(u30, 1),
                      "peak_W": max(w), "peak_temp_C": max(float(r["temp"]) for r in rs)}
print(json.dumps(out, ensure_ascii=False, indent=1))
