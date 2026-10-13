"""측정만(설정 바꾸지 않음): GPU 1초(nvidia-smi 조회) · 네트워크 10초(psutil) · 바깥 주소 로그인 화면 60초."""
import csv, os, subprocess, sys, threading, time
import psutil, requests

OUT = os.path.dirname(os.path.abspath(__file__))
NV = r"C:\Windows\system32\nvidia-smi.exe"
CNW = 0x08000000


def gpu():
    with open(os.path.join(OUT, "gpu-1s.csv"), "a", newline="") as f:
        w = csv.writer(f)
        while True:
            t = time.time()
            try:
                o = subprocess.run([NV, "--query-gpu=index,utilization.gpu,power.draw,temperature.gpu,memory.used",
                                    "--format=csv,noheader,nounits"], capture_output=True, text=True, timeout=10,
                                   creationflags=CNW).stdout
                for line in o.strip().splitlines():
                    w.writerow([round(t, 1)] + [x.strip() for x in line.split(",")])
                f.flush()
            except Exception as e:
                print("gpu", e, flush=True)
            time.sleep(max(0, 1 - (time.time() - t)))


def net():
    with open(os.path.join(OUT, "net-10s.csv"), "a", newline="") as f:
        w = csv.writer(f)
        prev = None
        while True:
            t = time.time()
            c = psutil.net_io_counters(pernic=True).get("이더넷 2")
            if c and prev:
                dt = t - prev[0]
                w.writerow([round(t, 1), round((c.bytes_recv - prev[1]) * 8 / dt / 1e6, 3), round((c.bytes_sent - prev[2]) * 8 / dt / 1e6, 3)])
                f.flush()
            if c:
                prev = (t, c.bytes_recv, c.bytes_sent)
            time.sleep(10)


def outside():
    with open(os.path.join(OUT, "outside-60s.csv"), "a", newline="") as f:
        w = csv.writer(f)
        while True:
            t = time.time()
            try:
                s = requests.Session()
                t0 = time.perf_counter()
                r = s.get("https://app.land-xi.dev/", timeout=30)
                w.writerow([round(t, 1), r.status_code, round(time.perf_counter() - t0, 3), len(r.content)])
            except Exception as e:
                w.writerow([round(t, 1), type(e).__name__, "", ""])
            f.flush()
            time.sleep(60)


for fn in (gpu, net, outside):
    threading.Thread(target=fn, daemon=True).start()
while True:
    time.sleep(3600)
