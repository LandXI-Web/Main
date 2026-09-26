"""녹화용 터미널 반화면 — 실제 명령을 실행하고 실제 로그를 tail 해서 SSE 로 흘린다(:8799). 값은 전부 실측 출력 그대로.

GET  /           term.html
GET  /feed       SSE: {k:'out', text, cls} · {k:'cmd', text} · {k:'smi', rows, procs, at}
POST /cmd?name=… 미리 정한 명령 실행(ps · vramlog · tasklist · tail:<job> · untail · qa:<job> · psql:<job> · smi)
"""
from __future__ import annotations

import json
import queue
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

HERE = Path(__file__).resolve().parent
LOGS = Path("E:/Land-XI 플랫폼/02. 데이터/_logs")
DATA = Path("E:/Land-XI 플랫폼/02. 데이터")
SMI = "C:/Windows/System32/nvidia-smi.exe"
NOWIN = getattr(subprocess, "CREATE_NO_WINDOW", 0)
subs: list[queue.Queue] = []
tail_state = {"job": None, "stop": threading.Event()}


def push(obj):
    for q in list(subs):
        q.put(obj)


def out(text, cls=""):
    for ln in text.rstrip("\n").split("\n"):
        push({"k": "out", "text": ln, "cls": cls})


def run(argv, cls=""):
    p = subprocess.run(argv, capture_output=True, text=True, encoding="utf-8", errors="replace", creationflags=NOWIN)
    out((p.stdout or "") + (p.stderr or ""), cls)


def psql(sql):
    run(["docker", "exec", "landxi-postgis", "psql", "-U", "postgres", "-d", "landxi", "-c", sql])


def smi_loop():
    while True:
        try:
            q = subprocess.run([SMI, "--query-gpu=index,name,utilization.gpu,memory.used,memory.total,power.draw,power.limit,temperature.gpu,driver_model.current",
                                "--format=csv,noheader,nounits"], capture_output=True, text=True, creationflags=NOWIN, timeout=5).stdout
            rows = [[s.strip() for s in l.split(",")] for l in q.strip().splitlines()]
            t = subprocess.run([SMI], capture_output=True, text=True, creationflags=NOWIN, timeout=5).stdout
            procs = []
            inp = False
            for l in t.splitlines():
                if "Processes:" in l:
                    inp = True
                    continue
                if inp and l.startswith("|") and (".exe" in l):
                    parts = l.strip("| ").split()
                    procs.append({"gpu": parts[0], "pid": parts[3], "name": parts[5].split("\\")[-1]})
            push({"k": "smi", "rows": rows, "procs": procs, "at": time.strftime("%H:%M:%S")})
        except Exception as e:  # pragma: no cover
            push({"k": "out", "text": f"nvidia-smi error {e}", "cls": "err"})
        time.sleep(1)


def tail_loop(job: str, stop: threading.Event):
    files = [LOGS / "f1b-a6000-0.log", LOGS / "f1b-scheduler.log", LOGS / "f1b-cpu-0.log"]
    fh = []
    for f in files:
        h = open(f, "r", encoding="utf-8", errors="replace")
        h.seek(0, 2)
        fh.append(h)
    part = ["" for _ in fh]
    while not stop.is_set():
        got = False
        for i, h in enumerate(fh):
            ln = h.readline()
            while ln:
                got = True
                if not ln.endswith("\n"):       # 쓰는 중인 줄 — 다음 읽기와 이어 붙인다
                    part[i] += ln
                    break
                ln, part[i] = part[i] + ln, ""
                s = ln.rstrip("\n")
                if job in s or "shard.done" in s or "power lease" in s:
                    cls = "done" if "shard.done" in s else "hi" if ("finalize" in s or "qa " in s or "admit" in s or "job.started" in s) else ""
                    push({"k": "out", "text": s, "cls": cls, "tail": True})
                ln = h.readline()
        if not got:
            time.sleep(0.05)
    for h in fh:
        h.close()


def do(name: str):
    if name == "ps":
        push({"k": "cmd", "text": "docker compose -p landxi ps"})
        run(["docker", "compose", "-p", "landxi", "ps", "--format", "table {{.Name}}\t{{.Image}}\t{{.Status}}"])
    elif name == "vramlog":
        push({"k": "cmd", "text": ".\\run-workers.ps1   # 로그 머리(시작 시 VRAM 예산)"})
        lines = (LOGS / "f1b-a6000-0.log").read_text(encoding="utf-8", errors="replace").splitlines()[:4]
        sch = (LOGS / "f1b-scheduler.log").read_text(encoding="utf-8", errors="replace").splitlines()[:1]
        cpu = [l for l in (LOGS / "f1b-cpu-0.log").read_text(encoding="utf-8", errors="replace").splitlines() if "ready" in l][:1]
        for l in sch + cpu + lines:
            out(l, "hi" if "vram budget" in l else "")
    elif name == "tasklist":
        push({"k": "cmd", "text": 'tasklist /FI "IMAGENAME eq llama-server.exe"   # Ollama — 종료 금지'})
        run(["tasklist", "/FI", "IMAGENAME eq llama-server.exe"])
    elif name.startswith("tail:"):
        job = name.split(":", 1)[1]
        push({"k": "cmd", "text": f"Get-Content _logs\\f1b-a6000-0.log -Wait -Tail 0   # {job}"})
        tail_state["stop"].set()
        tail_state["stop"] = threading.Event()
        threading.Thread(target=tail_loop, args=(job, tail_state["stop"]), daemon=True).start()
    elif name == "untail":
        tail_state["stop"].set()
    elif name.startswith("qa:"):
        job = name.split(":", 1)[1]
        push({"k": "cmd", "text": f"Get-Content results\\lx\\{job}\\qa.json | ConvertFrom-Json"})
        p = DATA / "results" / "lx" / job / "qa.json"
        for _ in range(40):
            if p.exists():
                break
            time.sleep(0.25)
        if not p.exists():
            out("qa.json 없음", "err")
            return
        q = json.loads(p.read_text(encoding="utf-8"))
        for k in ("gt_in_scope", "pred_in_scope", "tp", "fp", "fn", "precision", "recall", "precision_yes_tiles", "recall_yes_tiles", "mean_iou"):
            e = q.get(k)
            if isinstance(e, dict):
                out(f"{k:<20} {e['value']!s:>7} {e['unit']:<6} [{e['basis']}]", "hi" if k.startswith(("precision", "recall")) else "")
        out(f"match_rule  {q.get('match_rule')}")
        sc = q.get("self_consistency") or {}
        out(f"자기 일치   {sc.get('verdict')}", "warn")
    elif name.startswith("psql:"):
        job = name.split(":", 1)[1]
        push({"k": "cmd", "text": f"psql> select count(*) from detections where job_id='{job}';"})
        psql(f"select count(*) from detections where job_id='{job}'")
        push({"k": "cmd", "text": f"psql> select tenant_id, dim, count(*), round(sum(amount)::numeric,2) from usage_events where job_id='{job}' group by 1,2;"})
        psql(f"select tenant_id, dim, count(*), round(sum(amount)::numeric,2) amount from usage_events where job_id='{job}' group by 1,2")
    elif name == "smi":
        push({"k": "cmd", "text": "nvidia-smi"})
        t = subprocess.run([SMI], capture_output=True, text=True, creationflags=NOWIN).stdout
        out("\n".join(t.splitlines()[:30]))
    elif name.startswith("echo:"):
        out(name.split(":", 1)[1], "hi")


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        u = urlparse(self.path)
        if u.path in ("/", "/term.html"):
            b = (HERE / "term.html").read_bytes()
            self.send_response(200)
            self.send_header("content-type", "text/html; charset=utf-8")
            self.send_header("content-length", str(len(b)))
            self.end_headers()
            self.wfile.write(b)
            return
        if u.path == "/feed":
            self.send_response(200)
            self.send_header("content-type", "text/event-stream")
            self.send_header("cache-control", "no-store")
            self.end_headers()
            q: queue.Queue = queue.Queue()
            subs.append(q)
            try:
                while True:
                    try:
                        o = q.get(timeout=5)
                        self.wfile.write(("data: " + json.dumps(o, ensure_ascii=False) + "\n\n").encode("utf-8"))
                    except queue.Empty:
                        self.wfile.write(b": hb\n\n")
                    self.wfile.flush()
            except Exception:
                pass
            finally:
                subs.remove(q)
            return
        self.send_response(404)
        self.end_headers()

    def do_POST(self):
        u = urlparse(self.path)
        if u.path == "/cmd":
            name = parse_qs(u.query).get("name", [""])[0]
            threading.Thread(target=do, args=(name,), daemon=True).start()
            self.send_response(204)
            self.send_header("access-control-allow-origin", "*")
            self.end_headers()
            return
        self.send_response(404)
        self.end_headers()


if __name__ == "__main__":
    threading.Thread(target=smi_loop, daemon=True).start()
    ThreadingHTTPServer(("127.0.0.1", 8799), H).serve_forever()
