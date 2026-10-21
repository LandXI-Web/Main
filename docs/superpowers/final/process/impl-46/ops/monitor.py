"""2초마다: GPU 전력 · 사용률 · 온도 / 게이트웨이 · 관문 CPU · 메모리 / DB 연결 수. stop 파일이 생기면 끝."""
import json, os, subprocess, sys, time
import psutil
OUT = sys.argv[1]; STOP = OUT + ".stop"
NF = 0x08000000

def pid_on(port):
    for c in psutil.net_connections("tcp"):
        if c.laddr and c.laddr.port == port and c.status == "LISTEN": return c.pid
procs = {}
TREE = {}
def proc(name, port):
    pid = pid_on(port)
    if pid and (name not in procs or procs[name].pid != pid):
        procs[name] = psutil.Process(pid); procs[name].cpu_percent(None)
    return procs.get(name)

with open(OUT, "a", encoding="utf-8") as f:
    while not os.path.exists(STOP):
        t = time.time(); row = {"t": round(t, 1)}
        try:
            o = subprocess.run(["C:/Windows/System32/nvidia-smi.exe", "--query-gpu=index,power.draw,utilization.gpu,temperature.gpu", "--format=csv,noheader,nounits"],
                               capture_output=True, text=True, timeout=8, creationflags=NF).stdout
            row["gpu"] = [[float(x) for x in l.split(",")] for l in o.strip().splitlines()]
        except Exception as e: row["gpu_err"] = str(e)[:80]
        for name, port in (("gw", 8700), ("gate", 4180)):
            try:
                p = proc(name, port)
                if p:
                    with p.oneshot(): row[name] = {"cpu": p.cpu_percent(None), "rss_mb": round(p.memory_info().rss / 2**20), "thr": p.num_threads()}
            except Exception as e: row[name + "_err"] = str(e)[:80]
        # impl-46: 게이트웨이 여러 프로세스(uvicorn --workers) — 감독 프로세스 + 자식 전부의 CPU 합 · 프로세스별
        try:
            root = procs.get("gw")
            if root:
                while True:
                    pp = root.parent()
                    if pp and pp.name().lower().startswith("python") and "uvicorn" in " ".join(pp.cmdline()): root = pp
                    else: break
                fam = [root] + [c for c in root.children(recursive=True) if c.name().lower().startswith("python")]
                for c in fam:
                    if c.pid not in TREE: TREE[c.pid] = c; c.cpu_percent(None)
                per = {str(c.pid): TREE[c.pid].cpu_percent(None) for c in fam}
                row["gw_tree"] = {"cpu": round(sum(per.values()), 1), "n": len(fam), "per": per, "rss_mb": round(sum(c.memory_info().rss for c in fam) / 2**20)}
        except Exception as e: row["gw_tree_err"] = str(e)[:80]
        try:
            o = subprocess.run(["docker", "exec", "landxi-postgis", "psql", "-U", "postgres", "-d", "landxi", "-tAc",
                                "select count(*), count(*) filter (where state='active') from pg_stat_activity where backend_type='client backend'"],
                               capture_output=True, text=True, timeout=8, creationflags=NF).stdout.strip()
            a, b = o.split("|"); row["pg"] = {"conn": int(a), "active": int(b)}
        except Exception as e: row["pg_err"] = str(e)[:80]
        row["sys_cpu"] = psutil.cpu_percent(None)
        f.write(json.dumps(row) + "\n"); f.flush()
        time.sleep(max(0, 2 - (time.time() - t)))
