"""단계 요약: python summ.py LABEL 'YYYY-MM-DD HH:MM:SS' 'YYYY-MM-DD HH:MM:SS' → stages.jsonl 한 줄 + 출력."""
import csv, datetime as dt, json, os, re, statistics as S, sys
sys.path.insert(0, r"E:/Land-XI 플랫폼/01. 디자인/server")
from national.common import pg

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = r"E:/Land-XI 플랫폼/02. 데이터"
label, a, b = sys.argv[1], dt.datetime.fromisoformat(sys.argv[2]), dt.datetime.fromisoformat(sys.argv[3])
ta, tb = a.timestamp(), b.timestamp()
hours = (tb - ta) / 3600
out = {"stage": label, "from": a.isoformat(sep=" "), "to": b.isoformat(sep=" "), "minutes": round((tb - ta) / 60, 1)}

# 영상 호출 창(자동 조절 장치)
W = []
p = os.path.join(DATA, "national/imagery-api/fetch-windows.jsonl")
if os.path.exists(p):
    for line in open(p, encoding="utf-8"):
        r = json.loads(line)
        t = dt.datetime.fromisoformat(r["at"]).timestamp()
        if ta <= t <= tb:
            W.append(r)
if W:
    calls = sum(r["calls"] for r in W)
    errs = sum(r["errors"] for r in W)
    out.update(fetch_windows=len(W), calls=calls, errors=errs, err_rate=round(errs / calls, 4),
               p50_ms=round(S.median([r["p50_ms"] for r in W if r["p50_ms"]])), p90_ms=round(S.median([r["p90_ms"] for r in W if r["p90_ms"]])),
               levels=sorted({r["level"] for r in W} | {r["level_after"] for r in W}), tiles_per_s=round(calls / (tb - ta), 2),
               mb_down_api=round((W[-1]["bytes_total"] - W[0]["bytes_total"]) / 1e6, 1) if len(W) > 1 else None,
               downs=[r.get("why") for r in W if r.get("action") == "down"], ups=sum(1 for r in W if r.get("action") == "up"))

# 워커 로그 — 4칩 묶음 영상 읽기 대기
waits = []
day = a.date()
for fn in ("f1b-a6000-0.prev.log", "f1b-a6000-0.log"):
    for line in open(os.path.join(DATA, "_logs", fn), encoding="utf-8", errors="ignore"):
        m = re.match(r"^(\d\d:\d\d:\d\d) .*영상 읽기 대기 ([0-9.]+)s", line)
        if m:
            t = dt.datetime.combine(day, dt.time.fromisoformat(m.group(1))).timestamp()
            if ta <= t <= tb:
                waits.append(float(m.group(2)))
if waits:
    out.update(batches=len(waits), read_wait_mean_s=round(S.mean(waits), 2), read_wait_p50_s=round(S.median(waits), 2),
               batches_per_h=round(len(waits) / hours, 1))

# 칸(장부) — 구간과 겹친 끝난 칸을 겹친 시간 비율로 나눠 센다(구간 밖에서 한 일은 빼기)
with pg() as c:
    rows = c.execute("SELECT asset, target_km2, extract(epoch FROM started_at), extract(epoch FROM done_at), cell_cd FROM national_cells "
                     "WHERE NOT test AND state='done' AND done_at > %s AND started_at < %s", (a.astimezone(), b.astimezone())).fetchall()
km2 = 0.0; by = {"farm": 0.0, "river": 0.0}; inside = []
for asset, k, s0, s1, cd in rows:
    s0, s1, k = float(s0), float(s1), float(k or 0)
    frac = max(0.0, min(s1, tb) - max(s0, ta)) / max(1.0, s1 - s0)
    km2 += k * frac; by[asset] += k * frac
    if ta <= s0 and s1 <= tb:
        inside.append((s1 - s0, k))
out.update(cells_overlap=len(rows), cells_inside=len(inside), km2_prorated=round(km2, 2), km2_per_h=round(km2 / hours, 2),
           sec_per_cell=round(S.mean([x[0] for x in inside]), 1) if inside else None,
           sec_per_km2=round(sum(x[0] for x in inside) / sum(x[1] for x in inside), 1) if inside and sum(x[1] for x in inside) else None,
           by_asset={k: round(v, 2) for k, v in by.items()})

# GPU0 · GPU1
G = {0: [], 1: []}
for r in csv.reader(open(os.path.join(HERE, "gpu-1s.csv"))):
    t = float(r[0])
    if ta <= t <= tb:
        G[int(r[1])].append((float(r[2]), float(r[3]), float(r[4])))
for i, g in G.items():
    if not g:
        continue
    u = [x[0] for x in g]
    w30 = [S.mean(u[k:k + 30]) for k in range(0, max(1, len(u) - 29), 5)]
    p30 = [S.mean([x[1] for x in g[k:k + 30]]) for k in range(0, max(1, len(g) - 29), 5)]
    out[f"gpu{i}"] = {"util_mean": round(S.mean(u), 1), "util_30s_max": round(max(w30), 1), "power_mean": round(S.mean(x[1] for x in g), 1),
                      "power_30s_max": round(max(p30), 1), "power_max": round(max(x[1] for x in g), 1), "temp_max": max(x[2] for x in g)}

# 네트워크(이더넷 2 · Mbps)
N = [(float(r[1]), float(r[2])) for r in csv.reader(open(os.path.join(HERE, "net-10s.csv"))) if ta <= float(r[0]) <= tb]
if N:
    out["net_mbps"] = {"down_mean": round(S.mean(x[0] for x in N), 2), "down_max": round(max(x[0] for x in N), 2),
                       "up_mean": round(S.mean(x[1] for x in N), 2), "up_max": round(max(x[1] for x in N), 2)}
# 바깥 주소 로그인 화면
O = [r for r in csv.reader(open(os.path.join(HERE, "outside-60s.csv"))) if ta <= float(r[0]) <= tb]
ok = [float(r[2]) for r in O if r[1] == "200"]
out["outside"] = {"n": len(O), "ok": len(ok), "p50_s": round(S.median(ok), 2) if ok else None, "max_s": round(max(ok), 2) if ok else None}
sys.stdout.reconfigure(encoding="utf-8")
print(json.dumps(out, ensure_ascii=False, indent=1))
with open(os.path.join(HERE, "stages.jsonl"), "a", encoding="utf-8") as f:
    f.write(json.dumps(out, ensure_ascii=False) + "\n")
