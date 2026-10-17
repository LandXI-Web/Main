"""측정만(설정 바꾸지 않음 · impl-41): GPU 두 장 1초(nvidia-smi 조회 · 사용률 · 전력 · 온도 · 합) · 워커 로그 '전국 묶음' 줄 이어 받기 ·
XI ChatGEO 응답 시간(10분마다 시험 질문 한 번 · context.test).  python monitor.py   (멈출 때는 이 프로세스 PID 로)"""
import csv, json, os, re, subprocess, sys, threading, time
import requests

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = r"E:/Land-XI 플랫폼/02. 데이터"
NV = r"C:\Windows\system32\nvidia-smi.exe"
CNW = 0x08000000
API = "http://127.0.0.1:8700/api/v1"


def gpu():
    with open(os.path.join(HERE, "gpu-1s.csv"), "a", newline="") as f:
        w = csv.writer(f)
        p = subprocess.Popen([NV, "--query-gpu=index,utilization.gpu,power.draw,temperature.gpu,memory.used", "--format=csv,noheader,nounits",
                              "-lms", "1000"], stdout=subprocess.PIPE, text=True, bufsize=1, creationflags=CNW)
        for line in p.stdout:
            v = [x.strip() for x in line.split(",")]
            if len(v) >= 5:
                w.writerow([round(time.time(), 1)] + v)
                f.flush()


def tail():
    """워커 로그는 재시작 때 새로 쓰인다 — 줄을 이어 받아 남긴다(시각 · 워커 · 줄)."""
    pos = {}
    with open(os.path.join(HERE, "worker-lines.log"), "a", encoding="utf-8") as out:
        while True:
            for g in (0, 1):
                fn = os.path.join(DATA, "_logs", f"f1b-a6000-{g}.log")
                try:
                    st = os.stat(fn)
                except OSError:
                    continue
                key = (fn, st.st_ctime)
                p0 = pos.get(fn)
                if p0 is None:
                    pos[fn] = (st.st_size, st.st_ctime)
                    continue
                off, ct = p0
                if st.st_size < off:
                    off = 0
                with open(fn, "rb") as f:
                    f.seek(off)
                    data = f.read()
                pos[fn] = (off + len(data), st.st_ctime)
                for line in data.decode("utf-8", "ignore").splitlines():
                    if "전국 묶음" in line or "power" in line or "두 장" in line or "한 장" in line or "ChatGEO" in line:
                        out.write(f"{time.strftime('%Y-%m-%d')} {line}\n")
                out.flush()
            time.sleep(2)


def env_pw():
    for line in open(r"E:/Land-XI 플랫폼/01. 디자인/server/.env", encoding="utf-8"):
        if line.startswith("DEV_PASSWORD="):
            return line.split("=", 1)[1].strip().strip('"')


def chat_once(s, msg="농지 실태조사에서 현장 확인이 필요한 필지는 어떻게 고르나요? 두 문장으로 설명해 줘."):
    t0 = time.time()
    r = s.post(API + "/agent/runs", json={"message": msg, "mode": "map", "context": {"test": True}}, timeout=60)
    if r.status_code >= 300:
        return {"at": t0, "status": r.status_code}
    rid = r.json()["run"]["id"]
    first = None; after = None; done = False
    while time.time() - t0 < 180 and not done:
        q = s.get(API + f"/agent/runs/{rid}/events", params={"after": after} if after else None, timeout=30).json()
        for it in q.get("items", []):
            after = it["id"]
            if it["event"] == "agent.token" and first is None:
                first = time.time() - t0
        done = q.get("done")
        if not done:
            time.sleep(0.25)
    return {"at": round(t0, 1), "run": rid, "first_token_s": round(first, 2) if first else None, "total_s": round(time.time() - t0, 2), "done": done}


def chat():
    while True:
        try:
            s = requests.Session()
            r = s.post(API + "/auth/login", json={"realm": "lx", "login": "lxadmin@lx.or.kr", "password": env_pw()}, timeout=30)
            s.headers["Authorization"] = "Bearer " + r.json()["token"]
            row = chat_once(s)
        except Exception as e:
            row = {"at": round(time.time(), 1), "error": repr(e)[:200]}
        with open(os.path.join(HERE, "chat-probe.jsonl"), "a", encoding="utf-8") as f:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
        time.sleep(300)


if __name__ == "__main__":
    with open(os.path.join(HERE, "monitor.pid"), "w") as f:
        f.write(str(os.getpid()))
    for fn in (gpu, tail, chat):
        threading.Thread(target=fn, daemon=True).start()
    while True:
        time.sleep(3600)
