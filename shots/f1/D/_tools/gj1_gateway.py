"""G-J1 실경로 검증 — F1-B 게이트웨이(8700 · Redis+PostGIS) 큐 경유 kind=index. python shots/f1/D/_tools/gj1_gateway.py"""
import json, sys, time, urllib.request
B = "http://127.0.0.1:8700/api/v1"
acc = json.load(open("server/seed/accounts.dev.json", encoding="utf-8"))
u = next(x for x in acc["tenant_users"] if x["login"] == "kgz-agri-manager")
sys.path.insert(0, "server"); from landxi_api import config; pw = config.DEV_PASSWORD
def call(m, p, body=None, tok=None):
    rq = urllib.request.Request(B + p, method=m, data=json.dumps(body).encode() if body is not None else None,
                                headers={"content-type": "application/json", **({"authorization": "Bearer " + tok} if tok else {})})
    try:
        with urllib.request.urlopen(rq, timeout=30) as r: return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")
st, s = call("POST", "/auth/login", {"realm": "tenant", "tenant_id": "kgz-agri", "login": u["login"], "password": pw})
print("login", st, {k: s.get(k) for k in ("realm", "role", "tenant_id")}); tok = s["token"]
months = [f"2025-{m:02d}" for m in range(3, 11)]
aoi = {"type": "Polygon", "coordinates": [[[74.70, 42.75], [75.20, 42.75], [75.20, 43.00], [74.70, 43.00], [74.70, 42.75]]]}
body = {"kind": "index", "model_id": "index/ndvi_pc", "aoi": aoi,
        "options": {"months": months[:int(sys.argv[1]) if len(sys.argv) > 1 else 8], "cloud_max": 15, "mask": "worldcover-40"}}
import os
if os.environ.get("JOB"):
    jid = os.environ["JOB"]
else:
  st, q = call("POST", "/jobs/quote", body, tok)
  print("quote", st, json.dumps(q, ensure_ascii=False)[:600])
  st, j = call("POST", "/jobs", {**body, "quote_id": q.get("quote_id")}, tok)
  print("submit", st, json.dumps(j, ensure_ascii=False)[:400])
  jid = (j.get("job") or j).get("id")
t0 = time.time()
with urllib.request.urlopen(f"{B}/events/jobs/{jid}?access_token={tok}", timeout=900) as r:
    ev = None
    for line in r:
        line = line.decode("utf-8").rstrip()
        if line.startswith("event:"): ev = line[6:].strip()
        elif line.startswith("data:"):
            d = json.loads(line[5:])
            if ev in ("index.month", "job.done", "job.failed", "shard.failed", "shard.started", "shard.retry", "job.queued", "job.started"):
                print(f"{time.time()-t0:7.1f}s", ev, json.dumps({k: d.get(k) for k in ("shard_id", "month", "ndvi_mean", "n_scenes", "counts", "error", "state")}, ensure_ascii=False)[:300], flush=True)
            if ev in ("job.done", "job.failed"): break
