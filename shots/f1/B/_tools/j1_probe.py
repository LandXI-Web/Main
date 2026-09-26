"""J1 소형 AOI 타이밍 탐침 — 영상용 AOI 역산(완료 ≤ 약 25s)."""
import json, sys, time
import httpx
B = "http://127.0.0.1:8700/api/v1"
x0, y0, x1, y1 = map(float, sys.argv[1:5])
role = sys.argv[5] if len(sys.argv) > 5 else "staff"
c = httpx.Client(timeout=60)
tok = c.post(B + "/auth/login", json={"realm": "lx", "login": f"lx-{role}", "password": "landxi-dev-2026"}).json()["token"]
H = {"authorization": "Bearer " + tok}
aoi = {"type": "Polygon", "coordinates": [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]]}
body = {"kind": "infer", "model_id": "car_v2_obb", "imagery_id": "axis-iksan-hwangdeung", "aoi": aoi,
        "options": {"chip": 1024, "overlap": 0.125, "conf": 0.25}, "demo": role == "sales", "priority": 0}
q = c.post(B + "/jobs/quote", headers=H, json=body).json()
print("quote", json.dumps({k: q.get(k) for k in ("area_km2", "shards", "gpu_s", "eta_s", "allowed")}, ensure_ascii=False))
t0 = time.time()
j = c.post(B + "/jobs", headers=H, json=body).json()["job"]["id"]
print("job", j)
first = None
with c.stream("GET", f"{B}/events/jobs/{j}?access_token={tok}", timeout=httpx.Timeout(300, read=60)) as r:
    ev = None
    for ln in r.iter_lines():
        if ln.startswith("event:"):
            ev = ln[6:].strip()
            t = time.time() - t0
            if ev == "shard.done" and first is None:
                first = t; print(f"first shard.done {t:.2f}s")
            if ev in ("job.done", "snapshot.ready", "job.failed"):
                print(f"{ev} {t:.2f}s")
            if ev in ("snapshot.ready", "job.failed"):
                break
print(json.dumps(c.get(f"{B}/jobs/{j}", headers=H).json(), ensure_ascii=False)[:600])
