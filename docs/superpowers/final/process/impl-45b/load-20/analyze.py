import json, sys, collections, statistics
run, mon, out = sys.argv[1], sys.argv[2], sys.argv[3]
d = json.load(open(run, encoding="utf-8"))
st = d["stages"]
def stage_of(t):
    s = None
    for x in st:
        if t >= x["start"]: s = x["vus"]
    return s
def pct(v, p):
    v = sorted(v); return v[min(len(v) - 1, int(len(v) * p))] if v else None
by = collections.defaultdict(lambda: collections.defaultdict(list))
err = collections.defaultdict(collections.Counter)
for t, vu, k, s, ms in d["log"]:
    g = stage_of(t)
    by[g][k].append(ms); err[g][s] += 1
res = {"stages": st, "per_stage": {}, "chat": {}}
for g in sorted(by):
    tot = sum(err[g].values()); bad = sum(n for s, n in err[g].items() if s >= 400 or s < 0)
    rows = {}
    for k, v in sorted(by[g].items()):
        rows[k] = {"n": len(v), "p50": pct(v, .5), "p95": pct(v, .95), "max": max(v)}
    res["per_stage"][str(g)] = {"requests": tot, "errors": bad, "error_rate": round(bad / tot * 100, 2) if tot else 0, "status": dict(err[g]), "endpoints": rows}
ch = collections.defaultdict(list)
for c in d["chat"]:
    ch[(c["tag"], c.get("backend"))].append(c)
for (tag, be), v in ch.items():
    ms = [x["ms"] for x in v]
    res["chat"][f"{tag}|{be}"] = {"n": len(v), "done": sum(x["event"] == "agent.done" for x in v), "events": dict(collections.Counter(x["event"] for x in v)),
                                  "p50_s": round(pct(ms, .5) / 1000, 1), "p95_s": round(pct(ms, .95) / 1000, 1), "max_s": round(max(ms) / 1000, 1)}
# 동시 질문 수(겹침) 최대
iv = [(c["at"], c["at"] + c["ms"] / 1000) for c in d["chat"] if c["tag"] == "load" and c.get("at") is not None]
pts = sorted([(a, 1) for a, _ in iv] + [(b, -1) for _, b in iv]); cur = mx = 0
for _, x in pts: cur += x; mx = max(mx, cur)
res["chat"]["max_overlap"] = mx
m = [json.loads(l) for l in open(mon, encoding="utf-8")]
gpu = {0: [], 1: []}
for r in m:
    for g in r.get("gpu", []): gpu[int(g[0])].append((g[1], g[2], g[3]))
def w30(vals):  # 30초(15표본) 이동 평균 최대
    best = 0
    for i in range(len(vals)):
        seg = vals[max(0, i - 14):i + 1]; best = max(best, sum(seg) / len(seg))
    return round(best, 1)
res["monitor"] = {
    "samples": len(m),
    "gw_cpu_max": max(r.get("gw", {}).get("cpu", 0) for r in m), "gw_cpu_p95": pct([r.get("gw", {}).get("cpu", 0) for r in m], .95),
    "gw_rss_max_mb": max(r.get("gw", {}).get("rss_mb", 0) for r in m),
    "gate_cpu_max": max(r.get("gate", {}).get("cpu", 0) for r in m), "gate_rss_max_mb": max(r.get("gate", {}).get("rss_mb", 0) for r in m),
    "pg_conn_max": max(r.get("pg", {}).get("conn", 0) for r in m), "pg_active_max": max(r.get("pg", {}).get("active", 0) for r in m),
    "sys_cpu_max": max(r.get("sys_cpu", 0) for r in m),
    "gpu": {str(i): {"power_max_w": max(x[0] for x in v), "power_30s_avg_max_w": w30([x[0] for x in v]), "util_30s_avg_max": w30([x[1] for x in v]), "temp_max": max(x[2] for x in v)} for i, v in gpu.items() if v},
}
json.dump(res, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
for g, s in res["per_stage"].items():
    print(f"== {g} VU: {s['requests']} req, err {s['errors']} ({s['error_rate']}%) {s['status']}")
    for k, r in s["endpoints"].items():
        if r["p95"] > 1500 or k.startswith("PAGE") or "login" in k: print(f"   {k}: n{r['n']} p50 {r['p50']} p95 {r['p95']} max {r['max']}")
print(json.dumps(res["chat"], ensure_ascii=False, indent=0))
print(json.dumps(res["monitor"], ensure_ascii=False))
