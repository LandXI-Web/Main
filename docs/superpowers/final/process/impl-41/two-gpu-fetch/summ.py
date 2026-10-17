"""단계 요약: python summ.py LABEL 'YYYY-MM-DD HH:MM:SS' 'YYYY-MM-DD HH:MM:SS' → stages.jsonl 한 줄 + 출력(impl-41)."""
import csv, datetime as dt, json, os, re, statistics as S, sys
sys.path.insert(0, r"E:/Land-XI 플랫폼/01. 디자인/server")
from national.common import pg

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = r"E:/Land-XI 플랫폼/02. 데이터"
label, a, b = sys.argv[1], dt.datetime.fromisoformat(sys.argv[2]), dt.datetime.fromisoformat(sys.argv[3])
ta, tb = a.timestamp(), b.timestamp()
hours = (tb - ta) / 3600
out = {"stage": label, "from": a.isoformat(sep=" "), "to": b.isoformat(sep=" "), "minutes": round((tb - ta) / 60, 1)}

W = []
p = os.path.join(DATA, "national/imagery-api/fetch-windows.jsonl")
for line in open(p, encoding="utf-8"):
    try:
        r = json.loads(line)
    except ValueError:
        continue
    t = dt.datetime.fromisoformat(r["at"]).timestamp()
    if ta <= t <= tb:
        W.append(r)
if W:
    calls = sum(r["calls"] for r in W); errs = sum(r["errors"] for r in W)
    out["fetch"] = {"calls": calls, "errors": errs, "err_rate": round(errs / calls, 4), "tiles_per_s": round(calls / (tb - ta), 2),
                    "p50_ms": round(S.median([r["p50_ms"] for r in W if r["p50_ms"]])), "p90_ms": round(S.median([r["p90_ms"] for r in W if r["p90_ms"]])),
                    "levels": sorted({r["level"] for r in W} | {r["level_after"] for r in W}), "procs": len({r.get("pid") for r in W}),
                    "downs": [r.get("why") for r in W if r.get("action") == "down"]}
    dd = [r for r in W if r.get("dup_net") is not None]
    if dd:
        out["fetch"]["dup_rate"] = round(sum(r["dup_net"] for r in dd) / max(1, sum(r["calls"] for r in dd)), 4)

waits = {0: [], 1: []}; yields = {0: 0, 1: 0}
for line in open(os.path.join(HERE, "worker-lines.log"), encoding="utf-8", errors="ignore"):
    m = re.match(r"^(\d{4}-\d\d-\d\d) (\d\d:\d\d:\d\d) \[a6000-(\d)\] (.*)$", line.strip())
    if not m:
        continue
    t = dt.datetime.fromisoformat(m.group(1) + " " + m.group(2)).timestamp()
    if not (ta <= t <= tb):
        continue
    g, msg = int(m.group(3)), m.group(4)
    w = re.search(r"영상 읽기 대기 ([0-9.]+)s", msg)
    if w:
        waits[g].append(float(w.group(1)))
    if "XI ChatGEO 질문 먼저" in msg:
        yields[g] += 1
out["batches"] = {f"gpu{g}": {"n": len(v), "per_h": round(len(v) / hours, 1), "read_wait_mean_s": round(S.mean(v), 2) if v else None}
                  for g, v in waits.items()}
out["chat_yields_gpu1"] = yields[1]

with pg() as c:
    rows = c.execute("SELECT asset, target_km2, extract(epoch FROM started_at), extract(epoch FROM done_at) FROM national_cells "
                     "WHERE NOT test AND state='done' AND done_at > %s AND started_at < %s", (a.astimezone(), b.astimezone())).fetchall()
    chips = c.execute("SELECT coalesce(sum(j.shards_total),0), count(*) FROM jobs j JOIN national_jobs n ON n.job_id=j.id WHERE NOT n.test "
                      "AND j.finished_at BETWEEN %s AND %s AND j.state='done'", (a.astimezone(), b.astimezone())).fetchone()
km2 = 0.0; inside = []
for asset, k, s0, s1 in rows:
    s0, s1, k = float(s0), float(s1), float(k or 0)
    km2 += k * max(0.0, min(s1, tb) - max(s0, ta)) / max(1.0, s1 - s0)
    if ta <= s0 and s1 <= tb:
        inside.append((s1 - s0, k))
out["cells"] = {"overlap": len(rows), "inside": len(inside), "km2": round(km2, 2), "km2_per_h": round(km2 / hours, 1),
                "sec_per_cell": round(S.mean([x[0] for x in inside]), 1) if inside else None,
                "sec_per_km2": round(sum(x[0] for x in inside) / sum(x[1] for x in inside), 1) if inside and sum(x[1] for x in inside) else None}
out["chips"] = {"done": int(chips[0]), "jobs": int(chips[1]), "per_h": round(int(chips[0]) / hours), "sec_per_chip": round((tb - ta) / chips[0], 3) if chips[0] else None}

G = {0: [], 1: []}
for r in csv.reader(open(os.path.join(HERE, "gpu-1s.csv"))):
    try:
        t = float(r[0])
    except ValueError:
        continue
    if ta <= t <= tb:
        G[int(r[1])].append((t, float(r[2]), float(r[3]), float(r[4])))
for i, g in G.items():
    if not g:
        continue
    u = [x[1] for x in g]; pw = [x[2] for x in g]
    w30 = [S.mean(u[k:k + 30]) for k in range(0, max(1, len(u) - 29), 5)]
    p30 = [S.mean(pw[k:k + 30]) for k in range(0, max(1, len(pw) - 29), 5)]
    out[f"gpu{i}"] = {"util_mean": round(S.mean(u), 1), "util_30s_max": round(max(w30), 1), "power_mean": round(S.mean(pw), 1),
                      "power_30s_max": round(max(p30), 1), "power_max": round(max(pw), 1), "temp_max": max(x[3] for x in g)}
if G[0] and G[1]:
    m1 = {round(x[0]): x[2] for x in G[1]}
    sums = [x[2] + m1[round(x[0])] for x in G[0] if round(x[0]) in m1]
    run = best = 0
    for v in sums:
        run = run + 1 if v > 300 else 0
        best = max(best, run)
    out["pair"] = {"sum_mean": round(S.mean(sums), 1), "sum_max": round(max(sums), 1), "sum_p99": round(sorted(sums)[int(0.99 * (len(sums) - 1))], 1),
                   "over300_s": sum(1 for v in sums if v > 300), "over300_longest_s": best}
C = []
for line in open(os.path.join(HERE, "chat-probe.jsonl"), encoding="utf-8"):
    j = json.loads(line)
    if ta <= j.get("at", 0) <= tb and j.get("first_token_s") is not None:
        C.append(j)
if C:
    out["chat"] = {"n": len(C), "first_token_s": round(S.median([x["first_token_s"] for x in C]), 2), "total_s": round(S.median([x["total_s"] for x in C]), 2),
                   "first_token_max_s": max(x["first_token_s"] for x in C)}
sys.stdout.reconfigure(encoding="utf-8")
print(json.dumps(out, ensure_ascii=False, indent=1))
with open(os.path.join(HERE, "stages.jsonl"), "a", encoding="utf-8") as f:
    f.write(json.dumps(out, ensure_ascii=False) + "\n")
