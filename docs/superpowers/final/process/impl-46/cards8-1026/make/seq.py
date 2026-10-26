"""대기열 작업을 하나씩(전력 예산 — 학습 · 검증은 한 번에 하나) 넣고 끝날 때까지 기다린다 + GPU 전력 기록(2초마다 · 순간 · 30초 평균 최댓값).
  python seq.py PLAN.json OUT.json   PLAN = [{"mode":"eval|train","model":..,"yaml":..,"label":..,"epochs":..}]  (첫 줄이 이미 넣은 작업이면 {"job": id})"""
import sys, json, time, subprocess, collections, threading
sys.path.insert(0, r"E:\Land-XI 플랫폼\01. 디자인\server"); sys.stdout.reconfigure(encoding="utf-8")
from landxi_api import config
import httpx, psycopg
B = f"http://127.0.0.1:{config.API_PORT}/api/v1"
plan = json.load(open(sys.argv[1], encoding="utf-8")); OUT = sys.argv[2]
res = {"jobs": [], "power": {}}
def tok():
    t = httpx.post(B + "/auth/login", json={"realm": "lx", "login": "lxadmin@lx.or.kr", "password": config.DEV_PASSWORD}, timeout=30).json()
    return {"Authorization": "Bearer " + (t.get("token") or t.get("access_token"))}
stop = False
def power():
    win = {0: collections.deque(maxlen=15), 1: collections.deque(maxlen=15)}
    while not stop:
        try:
            o = subprocess.run([r"C:\Windows\System32\nvidia-smi.exe", "--query-gpu=index,power.draw,utilization.gpu,temperature.gpu", "--format=csv,noheader,nounits"],
                               capture_output=True, text=True, timeout=10).stdout
            for ln in o.strip().splitlines():
                i, p, u, tC = [x.strip() for x in ln.split(",")]; i = int(i); p = float(p)
                win[i].append(p); r = res["power"].setdefault(str(i), {"max_w": 0, "max_avg30_w": 0, "max_util": 0, "max_temp": 0})
                r["max_w"] = max(r["max_w"], p); r["max_util"] = max(r["max_util"], int(u)); r["max_temp"] = max(r["max_temp"], int(tC))
                if len(win[i]) == 15:
                    r["max_avg30_w"] = max(r["max_avg30_w"], round(sum(win[i]) / 15, 1))
        except Exception:
            pass
        time.sleep(2)
th = threading.Thread(target=power, daemon=True); th.start()
def state(jid):
    with psycopg.connect(config.PG_DSN) as c:
        c.execute("SELECT set_config('app.realm','lx',false), set_config('app.tenant_id','',false), set_config('app.user_id','',false)")
        return c.execute("SELECT state, error, model_id, finished_at FROM jobs WHERE id=%s", (jid,)).fetchone()
def save():
    json.dump(res, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1, default=str)
for it in plan:
    jid = it.get("job")
    if not jid:
        body = ({"kind": "train", "base_model": it["model"], "samples": it["yaml"], "label": "검증만 · " + it["label"], "options": {"eval": True, "imgsz": 1024, "batch": 4}}
                if it["mode"] == "eval" else
                {"kind": "train", "base_model": it["model"], "samples": it["yaml"], "label": it["label"],
                 "options": {"epochs": int(it["epochs"]), "imgsz": 1024, "batch": 4, "patience": 6, "lr0": 0.002, "warmup_epochs": 1}})
        t0 = time.time()
        while True:
            H = tok(); q = httpx.post(B + "/jobs/quote", headers=H, json=body, timeout=120).json()
            if q.get("allowed"):
                r = httpx.post(B + "/jobs", headers=H, json=body, timeout=120)
                if r.status_code < 300:
                    jid = r.json()["job"]["id"]; break
            if time.time() - t0 > 6 * 3600:
                break
            time.sleep(60)
    rec = {**it, "job": jid, "start": time.strftime("%H:%M:%S")}
    res["jobs"].append(rec); save()
    print("넣음", it.get("label"), jid, flush=True)
    while jid:
        s = state(jid)
        if s and s[0] in ("done", "failed", "cancelled"):
            rec.update({"state": s[0], "error": s[1], "end": time.strftime("%H:%M:%S")}); break
        time.sleep(30)
    save(); print("끝", jid, rec.get("state"), flush=True)
stop = True; save()
