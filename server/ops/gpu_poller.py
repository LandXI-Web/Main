#!/usr/bin/env python
"""LX/OPS GPU 폴러 (F1-C) — F1-CONTRACT §4.9 GpuSample · §5.3 Redis 키.

2s마다 nvidia-smi 를 한 번 읽어 GpuSample 을 만든다.
  Redis 가 있으면  HSET ops:gpu:{node}:{idx}  (GpuSample.gpus[i] 평탄화 + json)
                   XADD ops:gpu MAXLEN ~ 3600  {node, at, json}
                   HSET node:{node} … + EXPIRE 30   (10s 하트비트)
  --stdout 이면    GpuSample 한 줄(JSON)을 표준출력으로 흘린다(단독 검증 · :8702 로컬 브리지가 읽는다).

원칙
  * 읽기만 한다. GPU 위의 어떤 프로세스도 건드리지 않는다(Ollama llama-server 종료 금지 — 사용자 결정).
  * WDDM 에서는 --query-compute-apps 의 프로세스별 used_memory 가 N/A 다 → 이름만 싣고 mem_mib=null.
  * external_used_mib = memory.used − Σ 워커 자기 보고(worker:{id}:vram.used_mib). 워커가 없으면 = memory.used.
  * 지어낸 값 0: 읽지 못한 필드는 value=null + note.

실행
  python server/ops/gpu_poller.py --stdout --once
  python server/ops/gpu_poller.py --redis redis://localhost:6380 --interval 2
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import shutil
import socket
import subprocess
import sys
import time
import urllib.request

NVSMI_DEFAULT = r"C:\Windows\System32\DriverStore\FileRepository\nv_dispui.inf_amd64_f2b06cc19dadc00f\nvidia-smi.exe"
GPU_FIELDS = "index,name,uuid,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw,driver_version,driver_model.current,memory.free,power.limit"
APP_FIELDS = "gpu_uuid,pid,process_name,used_memory"
KST = dt.timezone(dt.timedelta(hours=9))


def now_iso() -> str:
    return dt.datetime.now(KST).isoformat(timespec="milliseconds")


def env(value, unit, source, as_of, note=None):
    e = {"value": value, "unit": unit, "basis": "measured", "as_of": as_of, "source": source}
    if note:
        e["note"] = note
    return e


def num(s):
    s = (s or "").strip()
    if not s or s.startswith("[") or s.upper() in ("N/A", "NA"):
        return None
    try:
        v = float(s)
        return int(v) if v.is_integer() else v
    except ValueError:
        return None


def _driverstore_nvsmi() -> list[str]:
    """DriverStore 의 nvidia-smi.exe 전부(최근 설치 순). 드라이버가 갱신되면(2026-09-26 522.06 → 597.16) 폴더가 늘어난다."""
    root = r"C:\Windows\System32\DriverStore\FileRepository"
    out = []
    try:
        for d in os.listdir(root):
            if d.startswith("nv_disp") and os.path.isdir(os.path.join(root, d)):
                f = os.path.join(root, d, "nvidia-smi.exe")
                if os.path.exists(f):
                    out.append(f)
    except OSError:
        pass
    return sorted(out, key=lambda f: os.path.getmtime(f), reverse=True)


NVSMI_SRC = {"path": None, "why": None}


def _responds(path: str) -> bool:
    """그 nvidia-smi 가 실제로 GPU 를 읽는가(-L 한 번 · 5s). 드라이버가 바뀌면 옛 폴더의 exe 는 'Failed to initialize NVML' 로 죽는다."""
    try:
        out = subprocess.run([path, "-L"], capture_output=True, text=True, timeout=5,
                             creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        return out.returncode == 0 and "GPU 0" in out.stdout
    except Exception:  # noqa: BLE001
        return False


def find_nvsmi(explicit: str | None) -> str:
    """v1.1-18: LX_NVSMI(또는 --nvsmi) 우선 → DriverStore 안 '응답하는' 최신 nvidia-smi → 기본 경로 → PATH."""
    cands = [("--nvsmi", explicit), ("LX_NVSMI", os.environ.get("LX_NVSMI"))]
    cands += [("DriverStore 최신(응답 확인)", p) for p in _driverstore_nvsmi()]
    cands += [("기본 경로", NVSMI_DEFAULT), ("PATH", shutil.which("nvidia-smi"))]
    for why, c in cands:
        if c and os.path.exists(c) and _responds(c):
            NVSMI_SRC.update(path=c, why=why)
            return c
    raise SystemExit("nvidia-smi 를 찾지 못했다 (--nvsmi 또는 LX_NVSMI)")


# ── 표본 스트림(v1.1-7 · 28 · F2-C 2차) — nvidia-smi -lms 100 한 프로세스를 띄워 두고 GPU 별 링버퍼 ────────────
#   WDDM 의 utilization.gpu 순간값은 사실상 0/100 이진이다. 1차(-lms 500 × 5표본)는 2 s 마다 20%p 단위로 뛰었다(판정 불합격).
#   2차: 같은 2.5 s 창을 0.1 s 표본 25개로 채운다(창 = MA_WINDOW_MS ÷ ms) → 이진 표본 평균의 흔들림이 약 1/√5 로 준다.
#   부모(폴러)가 죽으면 Windows Job Object(KILL_ON_JOB_CLOSE)가 nvidia-smi 도 같이 끝낸다(고아 0).
STREAM_FIELDS = "index,utilization.gpu,power.draw,temperature.gpu"
MA_WINDOW_MS = 2500   # 이동평균 창(ms) — 표본 수 = 창 ÷ -lms 간격(100 ms → 25표본)
TREND_WINDOW_MS = 10000   # 추세 창(ms) — 작업의 shard 주기(≈1.5 s: GPU 0.5 s + 디코드 1 s)보다 충분히 긴 창. util_ma10(보조 · 화면 "10 s 추세")


def _kill_on_close_job(pid: int):
    if os.name != "nt":
        return None
    try:
        import ctypes
        from ctypes import wintypes
        k32 = ctypes.WinDLL("kernel32", use_last_error=True)

        class IO(ctypes.Structure):
            _fields_ = [(n, ctypes.c_uint64) for n in ("r", "w", "o", "rb", "wb", "ob")]

        class BASIC(ctypes.Structure):
            _fields_ = [("PerProcessUserTimeLimit", ctypes.c_int64), ("PerJobUserTimeLimit", ctypes.c_int64),
                        ("LimitFlags", wintypes.DWORD), ("MinimumWorkingSetSize", ctypes.c_size_t),
                        ("MaximumWorkingSetSize", ctypes.c_size_t), ("ActiveProcessLimit", wintypes.DWORD),
                        ("Affinity", ctypes.c_size_t), ("PriorityClass", wintypes.DWORD), ("SchedulingClass", wintypes.DWORD)]

        class EXT(ctypes.Structure):
            _fields_ = [("Basic", BASIC), ("Io", IO), ("ProcessMemoryLimit", ctypes.c_size_t), ("JobMemoryLimit", ctypes.c_size_t),
                        ("PeakProcessMemoryUsed", ctypes.c_size_t), ("PeakJobMemoryUsed", ctypes.c_size_t)]

        k32.CreateJobObjectW.restype = wintypes.HANDLE
        k32.OpenProcess.restype = wintypes.HANDLE
        job = k32.CreateJobObjectW(None, None)
        info = EXT()
        info.Basic.LimitFlags = 0x2000  # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        k32.SetInformationJobObject(wintypes.HANDLE(job), 9, ctypes.byref(info), ctypes.sizeof(info))
        h = k32.OpenProcess(0x0100 | 0x0001, False, pid)  # SET_QUOTA | TERMINATE
        k32.AssignProcessToJobObject(wintypes.HANDLE(job), wintypes.HANDLE(h))
        return job  # 핸들을 쥐고 있는 동안 산다 — 폴러 프로세스가 끝나면 커널이 닫고 nvidia-smi 를 끝낸다
    except Exception:  # noqa: BLE001
        return None


class Stream:
    def __init__(self, nvsmi: str, ms: int = 100):
        import collections
        import threading
        self.nvsmi, self.ms = nvsmi, ms
        self.n = max(1, round(MA_WINDOW_MS / ms))
        self.buf: dict[int, "collections.deque"] = {}
        self.lock = threading.Lock()
        self.proc = None
        self.job = None
        self.restarts = 0
        self.last_t = 0.0
        self._dq = lambda: collections.deque(maxlen=max(120, round(TREND_WINDOW_MS / ms) + 10))
        threading.Thread(target=self._run, daemon=True).start()

    def _run(self):
        while True:
            try:
                self.proc = subprocess.Popen([self.nvsmi, f"--query-gpu={STREAM_FIELDS}", "--format=csv,noheader,nounits", "-lms", str(self.ms)],
                                             stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, bufsize=1,
                                             creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
                self.job = _kill_on_close_job(self.proc.pid)
                for line in self.proc.stdout:
                    c = [x.strip() for x in line.split(",")]
                    if len(c) < 4 or not c[0].isdigit():
                        continue
                    t = time.time()
                    with self.lock:
                        self.buf.setdefault(int(c[0]), self._dq()).append((t, num(c[1]), num(c[2]), num(c[3])))
                        self.last_t = t
            except Exception as e:  # noqa: BLE001
                log(f"nvidia-smi -lms 스트림 오류 {e.__class__.__name__}: {e}")
            self.restarts += 1
            log(f"nvidia-smi -lms {self.ms} 스트림 끊김 — 2s 뒤 재시작({self.restarts})")
            time.sleep(2)

    def window(self, idx: int, n: int | None = None) -> list:
        n = n or self.n
        with self.lock:
            b = list(self.buf.get(idx, ()))
        now = time.time()
        return [x for x in b[-n:] if now - x[0] < n * self.ms / 1000 * 2 + 1.0]   # 끊긴 뒤 옛 표본으로 평균 내지 않는다

    def ready(self, n: int | None = None) -> bool:
        n = n or self.n
        with self.lock:
            return bool(self.buf) and all(len(v) >= n for v in self.buf.values())

    def close(self):
        try:
            self.proc and self.proc.kill()
        except Exception:  # noqa: BLE001
            pass


def _mean(xs):
    xs = [x for x in xs if x is not None]
    return None if not xs else sum(xs) / len(xs)


# ── 외부 LLM 백엔드(v1.1-28 · llm_poller.py 가 Redis ops:llm 에 쓴다) · 전력 예산 임대(power:hot:*) ─────────────
def llm_state(store: "Store", url: str | None) -> dict | None:
    j = None
    if store.ok():
        raw = store.do("GET", "ops:llm")
        if raw:
            try:
                j = json.loads(raw)
            except ValueError:
                j = None
    if j is None and url:
        try:
            with urllib.request.urlopen(url, timeout=0.5) as r:
                j = json.loads(r.read().decode("utf-8")) or None
        except Exception:  # noqa: BLE001
            j = None
    return j


def _max_hot() -> int:
    try:
        cfg = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "config", "pools.yaml"), encoding="utf-8").read()
        import re
        m = re.search(r"max_hot_gpus:\s*(\d+)", cfg)
        return int(m.group(1)) if m else 1
    except OSError:
        return 1


MAX_HOT = _max_hot()
HOT_UTIL = 50              # [목표] 이용률(2.5 s 이동평균) 고부하 임계 %
HOT_POWER_FRAC = 0.5       # [목표] 전력 고부하 임계 = power.limit 실측 × 0.5 (200 W 한도 → 100 W)
HOT_POWER_W_FALLBACK = 100.0   # power.limit 을 못 읽으면


def power_budget(store: "Store", gpus: list, at: str) -> dict:
    """전력 규칙(2026-09-26): 동시 고부하 GPU ≤ max_hot_gpus. 임대(power:hot:{slot} · gpu_worker SET NX EX) + 측정(이동평균 ≥ 50%)."""
    leases = []
    if store.ok():
        for i in range(MAX_HOT + 1):
            v = store.do("GET", f"power:hot:{i}")
            if v:
                leases.append({"slot": i, "holder": v, "ttl_s": store.do("TTL", f"power:hot:{i}")})
    # 고부하 = 이용률 이동평균(2.5 s) ≥ 50% **또는** 전력 이동평균 ≥ 한도(nvidia-smi power.limit 실측)의 50% [목표] (F2-C 3차 판정:
    # WDDM 이용률은 버스트라 전력과 어긋난다 — GPU0 151.5 W 에도 이용률만 보면 '고부하 0/1' 이었다). 사유는 GPU 별로 남긴다.
    hot, per = [], []
    for g in gpus:
        u = (g.get("util_ma5") or {}).get("value"); w = (g.get("power_w") or {}).get("value"); lim = (g.get("power_limit_w") or {}).get("value")
        thr = round(lim * HOT_POWER_FRAC, 1) if lim else HOT_POWER_W_FALLBACK
        why = []
        if u is not None and u >= HOT_UTIL:
            why.append(f"이용률 {u:.0f}% ≥ {HOT_UTIL}%")
        if w is not None and w >= thr:
            why.append(f"전력 {w:.1f} W ≥ {thr:g} W(한도 {lim:g} W × {HOT_POWER_FRAC:g})" if lim else f"전력 {w:.1f} W ≥ {thr:g} W")
        per.append({"gpu": g["index"], "util_ma5": u, "power_w": w, "limit_w": lim, "thr_w": thr, "hot": bool(why), "why": why})
        if why:
            hot.append(g["index"])
    hot_now = env(len(hot), "count", f"고부하 GPU 수 = 이용률(2.5 s) ≥ {HOT_UTIL}% 또는 전력 ≥ power.limit × {HOT_POWER_FRAC:g} [목표]", at,
                  " · ".join(f"GPU{p['gpu']} " + " · ".join(p["why"]) for p in per if p["hot"]) or "고부하 GPU 없음")
    hot_now["gpus"] = hot   # 어느 GPU 인지(봉투 안) — 녹화 도구 record.mjs 가 반대편 GPU 고부하를 이 값으로 판정
    hot_now["per"] = per    # GPU 별 이용률 · W · 한도 · 사유(칩 title · pb-watch.py)
    return {"max_hot": MAX_HOT, "leases": leases, "leases_n": len(leases),
            "hot_now": hot_now,
            "source": "Redis power:hot:* (gpu_worker 임대) · server/config/pools.yaml max_hot_gpus",
            "redis": store.ok()}


def run_csv(nvsmi: str, args: list[str]) -> list[list[str]]:
    out = subprocess.run([nvsmi, *args, "--format=csv,noheader,nounits"], capture_output=True, text=True, timeout=10,
                         creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    rows = []
    for line in out.stdout.splitlines():
        if line.strip():
            rows.append([c.strip() for c in line.split(",")])
    return rows


# ── 최소 RESP 클라이언트(redis-py 가 없을 때) ────────────────────────────
class Resp:
    def __init__(self, url: str, timeout: float = 0.5):
        u = url.replace("redis://", "")
        host, _, port = u.partition(":")
        self.addr = (host or "localhost", int((port or "6379").split("/")[0]))
        self.timeout = timeout
        self.sock = None
        self.buf = b""

    def connect(self):
        self.sock = socket.create_connection(self.addr, timeout=self.timeout)
        self.sock.settimeout(2.0)
        self.buf = b""

    def close(self):
        try:
            self.sock and self.sock.close()
        finally:
            self.sock = None

    def _line(self) -> bytes:
        while b"\r\n" not in self.buf:
            chunk = self.sock.recv(65536)
            if not chunk:
                raise ConnectionError("redis closed")
            self.buf += chunk
        line, _, self.buf = self.buf.partition(b"\r\n")
        return line

    def _read(self):
        line = self._line()
        t, rest = line[:1], line[1:]
        if t == b"+":
            return rest.decode()
        if t == b"-":
            raise RuntimeError(rest.decode())
        if t == b":":
            return int(rest)
        if t == b"$":
            n = int(rest)
            if n < 0:
                return None
            while len(self.buf) < n + 2:
                self.buf += self.sock.recv(65536)
            data, self.buf = self.buf[:n], self.buf[n + 2:]
            return data.decode("utf-8", "replace")
        if t == b"*":
            n = int(rest)
            return None if n < 0 else [self._read() for _ in range(n)]
        raise RuntimeError("RESP?" + repr(line))

    def cmd(self, *args):
        if self.sock is None:
            self.connect()
        parts = [b"*%d\r\n" % len(args)]
        for a in args:
            b = a if isinstance(a, bytes) else str(a).encode("utf-8")
            parts.append(b"$%d\r\n%s\r\n" % (len(b), b))
        self.sock.sendall(b"".join(parts))
        return self._read()


class Store:
    """Redis 가 있으면 쓰고, 없으면 조용히 건너뛴다(30s 마다 재시도)."""

    def __init__(self, url: str | None):
        self.url = url
        self.r = None
        self.next_try = 0.0
        self.state = "off" if not url else "down"

    def ok(self) -> bool:
        if not self.url:
            return False
        if self.r is not None:
            return True
        if time.time() < self.next_try:
            return False
        try:
            r = Resp(self.url)
            r.connect()
            r.cmd("PING")
            self.r, self.state = r, "up"
            log(f"redis 연결 {self.url}")
            return True
        except OSError as e:
            self.next_try = time.time() + 30
            if self.state != "down-logged":
                log(f"redis 없음 {self.url} ({e.__class__.__name__}) — 30s 뒤 재시도, 표준출력만")
                self.state = "down-logged"
            return False

    def do(self, *args):
        if not self.ok():
            return None
        try:
            return self.r.cmd(*args)
        except (OSError, ConnectionError, RuntimeError) as e:
            log(f"redis 오류 {e} — 연결 해제")
            self.r.close()
            self.r = None
            self.next_try = time.time() + 5
            return None


TAG = "gpu_poller"   # storage_poller 가 같은 Store 를 쓸 때 바꾼다


def log(msg: str):
    print(f"[{TAG} {dt.datetime.now(KST):%H:%M:%S}] {msg}", file=sys.stderr, flush=True)


# ── Windows 성능 카운터(PDH) — WDDM 에서 nvidia-smi 가 못 주는 VRAM 을 커널(dxgkrnl) 집계로 읽는다 ──
#   \GPU Adapter Memory(luid_…_phys_N)\Dedicated Usage          어댑터(물리 GPU)별 전용 메모리 사용
#   \GPU Process Memory(pid_P_luid_…_phys_N)\Dedicated Usage     프로세스별 전용 메모리 사용(WDDM 에서도 된다)
#   phys_N ↔ nvidia-smi index 대응은 같은 pid 가 compute-apps(gpu_uuid) 와 카운터(phys) 양쪽에 있을 때 배운다.
#   증거가 없으면 LX_PHYS_MAP("1:0,0:1" = phys1→idx0, phys0→idx1) → 둘 다 없으면 대응 미확정(값 null · 지어내지 않는다).
class Pdh:
    def __init__(self):
        self.ok = False
        self.map: dict[int, int] = {}          # phys → nvidia index
        self.map_src = None
        # 기본 대응 = 이 PC 에서 확인한 값(2026-09-26 20:45 · F1-B bench pid 39660 이 nvidia-smi GPU0 · 카운터 phys_1 에만 있었다)
        env_map = os.environ.get("LX_PHYS_MAP", "1:0,0:1")
        for pair in filter(None, env_map.split(",")):
            try:
                a, b = pair.split(":"); self.map[int(a)] = int(b)
                self.map_src = "LX_PHYS_MAP" if os.environ.get("LX_PHYS_MAP") else "기본값(2026-09-26 pid 대조로 확인)"
            except ValueError:
                pass
        if os.name != "nt":
            return
        try:
            import ctypes
            from ctypes import wintypes
            self.ct, self.wt = ctypes, wintypes
            self.pdh = ctypes.WinDLL("pdh.dll")
            self.q = wintypes.HANDLE()
            if self.pdh.PdhOpenQueryW(None, None, ctypes.byref(self.q)) != 0:
                return
            self.c_ad, self.c_pr = wintypes.HANDLE(), wintypes.HANDLE()
            add = self.pdh.PdhAddEnglishCounterW
            if add(self.q, "\GPU Adapter Memory(*)\Dedicated Usage", None, ctypes.byref(self.c_ad)) != 0:
                return
            if add(self.q, "\GPU Process Memory(*)\Dedicated Usage", None, ctypes.byref(self.c_pr)) != 0:
                return
            self.ok = True
        except Exception:  # noqa: BLE001
            self.ok = False

    def _array(self, counter) -> dict[str, float]:
        ct, wt = self.ct, self.wt

        class VAL(ct.Structure):
            _fields_ = [("CStatus", wt.DWORD), ("pad", wt.DWORD), ("doubleValue", ct.c_double)]

        class ITEM(ct.Structure):
            _fields_ = [("szName", wt.LPWSTR), ("FmtValue", VAL)]

        size, count = wt.DWORD(0), wt.DWORD(0)
        PDH_FMT_DOUBLE = 0x00000200
        self.pdh.PdhGetFormattedCounterArrayW(counter, PDH_FMT_DOUBLE, ct.byref(size), ct.byref(count), None)
        if not size.value:
            return {}
        buf = (ct.c_byte * size.value)()
        if self.pdh.PdhGetFormattedCounterArrayW(counter, PDH_FMT_DOUBLE, ct.byref(size), ct.byref(count), buf) != 0:
            return {}
        items = ct.cast(buf, ct.POINTER(ITEM))
        return {items[i].szName: items[i].FmtValue.doubleValue for i in range(count.value) if items[i].FmtValue.CStatus in (0, 1)}

    def read(self, apps_by_pid: dict[int, int]) -> dict | None:
        """→ {luid, adapters:{phys: MiB}, procs:{phys: [(pid, MiB)]}, map:{phys: idx}, map_src} · 실패 시 None"""
        if not self.ok:
            return None
        try:
            if self.pdh.PdhCollectQueryData(self.q) != 0:
                return None
            ad, pr = self._array(self.c_ad), self._array(self.c_pr)
        except Exception:  # noqa: BLE001
            return None
        # A6000 두 장 = 같은 luid 아래 phys_0/phys_1(연결 어댑터). phys 가 2개 이상인 luid 를 고른다.
        by_luid: dict[str, dict[int, float]] = {}
        for name, v in ad.items():
            try:
                luid, phys = name.rsplit("_phys_", 1)
                by_luid.setdefault(luid, {})[int(phys)] = v
            except ValueError:
                continue
        if not by_luid:
            return None
        luid = max(by_luid, key=lambda k: (len(by_luid[k]), sum(by_luid[k].values())))
        procs: dict[int, list] = {}
        phys_n: dict[int, int] = {}
        for name in pr:
            try:
                phys_n[int(name.rsplit("_phys_", 1)[0].split("_")[1])] = phys_n.get(int(name.rsplit("_phys_", 1)[0].split("_")[1]), 0) + (1 if luid in name and pr[name] > 2 ** 20 else 0)
            except (ValueError, IndexError):
                pass
        for name, v in pr.items():
            if luid not in name:
                continue
            try:
                head, phys = name.rsplit("_phys_", 1)
                pid = int(head.split("_")[1])
            except (ValueError, IndexError):
                continue
            mib = int(round(v / 2 ** 20))
            if mib <= 0:
                continue
            procs.setdefault(int(phys), []).append((pid, mib))
            if pid in apps_by_pid and phys_n.get(pid) == 1:   # 증거: 한 장에만 있는 pid 가 nvidia-smi 어느 index 에 있는가(두 장에 걸친 Ollama 분할 등은 제외)
                idx = apps_by_pid[pid]
                if self.map.get(int(phys)) != idx:
                    self.map = {int(phys): idx, **{p: i for p, i in self.map.items() if p != int(phys) and i != idx}}
                    if len(by_luid[luid]) == 2:        # 두 장이면 나머지 한 쌍도 정해진다
                        other_p = [p for p in by_luid[luid] if p != int(phys)][0]
                        other_i = [i for i in range(2) if i != idx][0]
                        self.map[other_p] = other_i
                self.map_src = f"pid {pid} 대조(compute-apps ↔ 카운터)"
        return {"luid": luid, "adapters": {p: int(round(v / 2 ** 20)) for p, v in by_luid[luid].items()},
                "procs": procs, "map": dict(self.map), "map_src": self.map_src}


def proc_names(pids: set[int]) -> dict[int, str]:
    """pid → 실행 파일 이름(tasklist 한 번). 이름만 싣는다."""
    if not pids or os.name != "nt":
        return {}
    try:
        out = subprocess.run(["tasklist", "/fo", "csv", "/nh"], capture_output=True, text=True, timeout=5,
                             creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0), encoding="utf-8", errors="replace")
    except Exception:  # noqa: BLE001
        return {}
    names = {}
    for line in out.stdout.splitlines():
        cols = [c.strip('"') for c in line.split('","')]
        if len(cols) >= 2 and cols[1].isdigit() and int(cols[1]) in pids:
            names[int(cols[1])] = cols[0].strip('"')
    return names


def worker_vram(store: Store, url: str | None, workers: list[str]) -> dict:
    """worker:{id}:vram → {budget_mib, used_mib, model_id, job_id?} + worker:{id}:hb.job_id(F2-C 2차).
    1차는 vram 해시(job_id 없음)만 읽어 실행 중에도 GPU 카드가 '현재 job 없음'이었다 — 게이트웨이 GET /ops/gpus 처럼 hb 를 함께 읽는다.
    Redis 우선, 없으면 --worker-vram-url."""
    out = {}
    if store.ok():
        for w in workers:
            h = store.do("HGETALL", f"worker:{w}:vram")
            hb = store.do("HGETALL", f"worker:{w}:hb")
            hbd = dict(zip(hb[::2], hb[1::2])) if hb else {}
            if h:
                d = dict(zip(h[::2], h[1::2]))
                out[w] = {"budget_mib": num(d.get("budget_mib")), "used_mib": num(d.get("used_mib")),
                          "model_id": d.get("model_id") or None, "job_id": hbd.get("job_id") or d.get("job_id") or None,
                          "pid": num(d.get("pid")) or num(hbd.get("pid"))}
            elif hbd.get("job_id"):
                out[w] = {"budget_mib": None, "used_mib": None, "model_id": None, "job_id": hbd.get("job_id"), "pid": num(hbd.get("pid"))}
    if url:
        try:
            with urllib.request.urlopen(url, timeout=0.5) as r:
                j = json.loads(r.read().decode("utf-8"))
                for k, v in (j or {}).items():
                    if not isinstance(v, dict):
                        continue
                    if k not in out:                         # 빈 자리는 브리지 로컬 워커
                        out[k] = v
                    else:                                    # 같은 GPU 에 게이트웨이 워커 + 로컬 워커 → 둘 다 워커 점유(합)
                        o = out[k]
                        o["used_mib"] = (o.get("used_mib") or 0) + (v.get("used_mib") or 0)
                        o["model_id"] = " + ".join(x for x in (o.get("model_id"), v.get("model_id")) if x) or None
                        o["job_id"] = v.get("job_id") or o.get("job_id")
        except Exception:  # noqa: BLE001 — 브리지가 없으면 워커 없음과 같다
            pass
    return out


def ext_list(smi: list, pdh_procs: list | None, pnames: dict, worker_pids: set) -> list:
    """외부 점유 프로세스 — nvidia-smi 이름 목록 + PDH 프로세스별 전용 메모리(있으면 mem_mib 채움).
    워커 자신(worker:{id}:vram.pid)은 외부가 아니므로 뺀다."""
    smi = [a for a in smi if a["pid"] not in worker_pids]
    if not pdh_procs:
        return smi
    out, seen = [], set()
    for pid, mib in sorted(pdh_procs, key=lambda x: -x[1]):
        if pid in worker_pids:
            continue
        nm = next((a["name"] for a in smi if a["pid"] == pid), None) or pnames.get(pid) or f"pid {pid}"
        out.append({"pid": pid, "name": nm, "mem_mib": mib, "note": "Windows PDH GPU Process Memory · Dedicated(프로세스 커밋 기준 — 합이 어댑터 사용량과 다를 수 있음)"})
        seen.add(pid)
    out += [a for a in smi if a["pid"] not in seen]
    return out


VRAM_CAUTION, UTIL_CAUTION, VRAM_FAULT, TEMP_FAULT = 0.76, 80, 0.95, 85   # 전부 [목표] — Ops 임계 80% 규칙(95%×.8 · 100×.8)


def caution_reasons(vr: float | None, u_ma: float | None, p_ma: float | None, plim: float | None, temp: float | None) -> tuple[list, list]:
    """주의(caution) · 장애(fault) 사유 — 전부 [목표]. VRAM ≥ 76% · 이용률(2.5 s) ≥ 80% · **전력 ≥ 한도 × 0.5(고부하 · F2-C 3차)** / VRAM ≥ 95% · 온도 ≥ 85°C."""
    why_c = [x for x in ((f"VRAM {vr * 100:.1f}% ≥ 76% [목표]" if vr is not None and vr >= VRAM_CAUTION else None),
                         (f"이용률(이동평균) {u_ma:.0f}% ≥ 80% [목표]" if u_ma is not None and u_ma >= UTIL_CAUTION else None),
                         (f"전력 {p_ma:.1f} W ≥ {plim * HOT_POWER_FRAC:g} W(한도 {plim:g} W × {HOT_POWER_FRAC:g}) · 고부하 [목표]"
                          if p_ma is not None and plim and p_ma >= plim * HOT_POWER_FRAC else None)) if x]
    why_f = [x for x in ((f"VRAM {vr * 100:.1f}% ≥ 95% [목표]" if vr is not None and vr >= VRAM_FAULT else None),
                         (f"온도 {temp}°C ≥ 85°C [목표]" if (temp or 0) >= TEMP_FAULT else None)) if x]
    return why_c, why_f


def sample(nvsmi: str, node: str, store: Store, wv_url: str | None, pdh: "Pdh | None" = None,
           stream: "Stream | None" = None, llm_url: str | None = None) -> dict:
    at = now_iso()
    rows = run_csv(nvsmi, [f"--query-gpu={GPU_FIELDS}"])
    apps = run_csv(nvsmi, [f"--query-compute-apps={APP_FIELDS}"])
    idx_of_uuid = {r[2]: int(r[0]) for r in rows if len(r) > 2 and r[0].isdigit()}
    _pid_n: dict[str, int] = {}
    for a in apps:
        if len(a) > 1:
            _pid_n[a[1]] = _pid_n.get(a[1], 0) + 1
    apps_by_pid = {int(a[1]): idx_of_uuid[a[0]] for a in apps if len(a) > 1 and a[1].isdigit() and a[0] in idx_of_uuid and _pid_n[a[1]] == 1}
    P = pdh.read(apps_by_pid) if pdh else None
    phys_of = {i: p for p, i in (P or {}).get("map", {}).items()}
    pnames = proc_names({pid for lst in (P or {}).get("procs", {}).values() for pid, _ in lst}) if P else {}
    by_uuid: dict[str, list] = {}
    for a in apps:
        if len(a) < 4:
            continue
        uuid, pid, name, mem = a[0], a[1], a[2], a[3]
        if name.startswith("["):   # [Insufficient Permissions] 행 — 이름을 모르므로 싣지 않는다
            continue
        by_uuid.setdefault(uuid, []).append({
            "pid": int(pid) if pid.isdigit() else 0,
            "name": os.path.basename(name.replace("\\", "/")),
            "mem_mib": num(mem),
            **({"note": "WDDM: 프로세스별 VRAM N/A"} if num(mem) is None else {}),
        })
    workers = [f"a6000-{r[0]}" for r in rows]
    wv = worker_vram(store, wv_url, workers)
    llm = llm_state(store, llm_url)
    all_used = [num(r[4]) for r in rows if len(r) > 4]
    same_used = len(all_used) > 1 and len(set(all_used)) == 1
    gpus = []
    for r in rows:
        idx, name, uuid, util, mu, mt, temp, pw, drv, mode, mf, plim = (r + [""] * 12)[:12]
        w = f"a6000-{idx}"
        mine = wv.get(w) or {}
        used = num(mu)
        used_src, used_note = "memory.used", None
        total, free = num(mt), num(mf)
        ph = phys_of.get(int(idx)) if idx.isdigit() else None
        pdh_mib = (P or {}).get("adapters", {}).get(ph) if ph is not None else None
        bad = num(mu)
        if pdh_mib is not None and mode.upper() == "WDDM" and (used is None or total is None or used > total or same_used or abs(used - pdh_mib) > 1024):
            # 드라이버 597.16 WDDM: memory.used 가 (a) 음수 언더플로(17,592,186,044,414 MiB) 또는 (b) 두 장이 같은 값(2026-09-27 02:15 · 43,256 / 43,256 —
            # 실제로는 GPU0 16,281 · GPU1 43,275)으로 나온다. 지어내지 않는다 — Windows 커널 집계(PDH GPU Adapter Memory)로 대체하고 사실을 적는다.
            used = pdh_mib
            used_src = "Windows PDH GPU Adapter Memory · Dedicated Usage"
            why = "음수 언더플로" if (bad is not None and total is not None and bad > total) else "두 장 같은 값" if same_used else "커널 집계와 불일치"
            used_note = f"nvidia-smi memory.used {bad:,} ({why} · 드라이버 {drv} WDDM) → 커널 집계 · phys_{ph}↔GPU{idx} {(P or {}).get('map_src') or ''}".strip() if bad is not None else f"nvidia-smi memory.used 없음 → 커널 집계"
        elif used is not None and total is not None and used > total:
            used = (total - free) if free is not None else None
            used_src, used_note = "memory.total − memory.free", f"memory.used 이상값 {bad:,} → total−free 로 대체(드라이버 {drv} WDDM · 할당 미반영 가능 — 하한)"
        wused = mine.get("used_mib") or 0
        ext = None if used is None else max(0, used - int(wused))
        src = lambda f: f"nvidia-smi {f}"  # noqa: E731
        gi = int(idx)
        # ── 0.5 s 표본 이동평균(v1.1-7 · 28)
        win = stream.window(gi) if stream else []
        u_ma = _mean([x[1] for x in win]); p_ma = _mean([x[2] for x in win])
        span = (win[-1][0] - win[0][0]) if len(win) > 1 else 0.0
        ms = stream.ms if stream else 0
        smp_note = f"{len(win)}표본 · {span:.1f}s 창 · {ms / 1000:g}s 간격" if win else "표본 수집 중"
        util_now = win[-1][1] if win else num(util)
        util_ma5 = env(None if u_ma is None else round(u_ma, 1), "%", f"nvidia-smi -lms {ms} utilization.gpu · 최근 {stream.n if stream else 1}표본 이동평균({MA_WINDOW_MS / 1000:g}s)", at,
                       smp_note + " · 카드 전체(공유) 이용률")
        util_ma5["samples"] = [{"t": round(x[0] * 1000), "v": x[1]} for x in win]   # 원표본(봉투 안 · 게이트웨이 봉투 검사 통과)
        win10 = stream.window(gi, round(TREND_WINDOW_MS / ms)) if stream else []
        u10 = _mean([x[1] for x in win10])
        util_ma10 = env(None if u10 is None else round(u10, 1), "%", f"nvidia-smi -lms {ms} utilization.gpu · 최근 {len(win10)}표본({TREND_WINDOW_MS / 1000:g}s) 추세", at,
                        "보조 — 2.5 s 이동평균은 작업의 실제 shard 주기(GPU 버스트 · CPU 디코드)를 따라 오르내린다. 10 s 추세는 그 주기를 평균한 값")
        power_w = (env(round(p_ma, 1), "W", f"nvidia-smi -lms {ms} power.draw · 최근 {stream.n if stream else 1}표본 평균", at, smp_note) if p_ma is not None
                   else env(num(pw), "W", src("power.draw"), at))
        total_v = num(mt) or 0
        vr = (used / total_v) if (used is not None and total_v) else None
        why_c, why_f = caution_reasons(vr, u_ma, p_ma, num(plim), num(temp))
        ext_rows = ext_list(by_uuid.get(uuid, []), (P or {}).get("procs", {}).get(ph) if ph is not None else None, pnames,
                            {int(v["pid"]) for v in wv.values() if v.get("pid")})
        # 외부 LLM(vLLM · WSL 컨테이너) — nvidia-smi·PDH 어디에도 프로세스로 안 잡힌다. 띠는 따로(합치지 않음) · VRAM 은 결손으로 정직.
        for b in (llm or {}).get("backends", []):
            if b.get("gpu") == gi:
                ext_rows.append({"pid": None, "name": f"vLLM · {b.get('model')}", "mem_mib": None,
                                 "llm": {"backend": b.get("backend", "vllm"), "model": b.get("model"), "role": b.get("role"), "endpoint": f":{b.get('port')}",
                                         "tps": b.get("tps"), "prompt_tps": b.get("prompt_tps"), "reqs_active": b.get("reqs_active"),
                                         "gen_tps": b.get("gen_tps"), "gen_basis": b.get("gen_basis"), "gen_live": b.get("gen_live"), "tps_window_s": b.get("tps_window_s"),
                                         "reqs_waiting": env(b.get("reqs_waiting"), "count", f"vLLM :{b.get('port')}/metrics vllm:num_requests_waiting", at),
                                         "kv_cache_pct": b.get("kv_cache_pct"),
                                         "gen_tokens_total": env(b.get("gen_tokens_total"), "tokens", f"vLLM :{b.get('port')}/metrics vllm:generation_tokens_total", at, "기동 뒤 누적"),
                                         "container": b.get("container"), "up": b.get("up"),
                                         "as_of": (llm or {}).get("at"), "note": "WSL 프로세스 VRAM 미노출"},
                                 "note": "WSL2 · docker 컨테이너 — Windows 에 프로세스로 보이지 않아 프로세스별 VRAM 결손"})
        proc_sum = sum(p.get("mem_mib") or 0 for p in ext_rows if isinstance(p.get("mem_mib"), (int, float)))
        unattr = None
        if pdh_mib is not None and ext_rows:
            unattr = env(max(0, int(pdh_mib) - int(proc_sum) - int(wused)), "MiB", "어댑터 전용(PDH) − Σ 프로세스(PDH) − 워커", at,
                         "미귀속 잔차 — WSL(vLLM) 등 프로세스로 안 보이는 점유 추정", )
            unattr["basis"] = "estimate"
        gpus.append({
            "index": gi, "name": name,
            "util_pct": env(util_now, "%", f"nvidia-smi -lms {ms} utilization.gpu(순간)" if win else src("utilization.gpu"), at,
                            "WDDM 순간값 — 화면은 util_ma5(이동평균)를 쓴다"),
            "util_ma5": util_ma5,
            "util_ma10": util_ma10,
            "mem_used_mib": env(used, "MiB", src(used_src), at, used_note),
            "mem_total_mib": env(num(mt), "MiB", src("memory.total"), at),
            "temp_c": env(num(temp), "°C", src("temperature.gpu"), at),
            "power_w": power_w,
            "power_limit_w": env(num(plim), "W", src("power.limit"), at, "전력 한도(관리자 -pl 적용값) · 고부하 임계 = × 0.5 [목표]"),
            "power_w_now": env(win[-1][2] if win else num(pw), "W", f"nvidia-smi -lms {ms} power.draw(순간)" if win else src("power.draw"), at),
            "caution": bool(why_c) and not why_f, "fault": bool(why_f), "caution_why": why_c + why_f,
            "external": ext_rows,
            "external_used_mib": env(ext, "MiB", "memory.used − 워커 자기 보고", at,
                                     "워커 미기동 시 = memory.used" if not mine else f"워커 {w} {int(wused):,} MiB 제외"),
            "unattributed_mib": unattr,
            "worker": w, "job_id": mine.get("job_id"),
            "worker_vram": ({"budget_mib": env(mine.get("budget_mib"), "MiB", f"worker:{w}:vram", at),
                             "used_mib": env(mine.get("used_mib"), "MiB", f"worker:{w}:vram", at),
                             "model_id": mine.get("model_id")} if mine else None),
            "driver": drv, "mode": mode,
        })
    out = {"node": node, "at": at, "gpus": gpus, "power_budget": power_budget(store, gpus, at),
           "nvsmi": {"path": NVSMI_SRC["path"], "why": NVSMI_SRC["why"],
                     "stream": (f"-lms {stream.ms} · 재시작 {stream.restarts}" if stream else "단발 2s"),
                     "ma_n": stream.n if stream else 1, "ma_window_ms": MA_WINDOW_MS}}
    if llm:   # 게이트웨이 봉투 검사(맨 숫자 금지)를 통과하는 것만 — Ollama 자기 보고 VRAM(봉투)
        out["llm_ollama"] = {"up": (llm.get("ollama") or {}).get("up"), "models": [{"name": m.get("name"), "size_vram_mib": m.get("size_vram_mib"), "expires_at": m.get("expires_at")}
                                                                               for m in (llm.get("ollama") or {}).get("models", [])],
                             "note": (llm.get("ollama") or {}).get("note"), "as_of": llm.get("at")}
    return out


def flatten(g: dict, at: str) -> list:
    """GpuSample.gpus[i] 평탄화(스칼라 필드) + json(원본 봉투 전체)."""
    f = {"index": g["index"], "name": g["name"], "at": at, "worker": g["worker"], "job_id": g["job_id"] or "",
         "driver": g["driver"], "mode": g["mode"],
         "external_names": ",".join(sorted({p["name"] for p in g["external"]})), "external_n": len(g["external"])}
    f["caution"] = int(bool(g.get("caution"))); f["fault"] = int(bool(g.get("fault")))
    for k in ("util_pct", "util_ma5", "util_ma10", "power_limit_w", "mem_used_mib", "mem_total_mib", "temp_c", "power_w", "external_used_mib"):
        v = (g.get(k) or {}).get("value")
        f[k] = "" if v is None else v
    f["json"] = json.dumps(g, ensure_ascii=False)
    out = []
    for k, v in f.items():
        out += [k, v]
    return out


def main():
    ap = argparse.ArgumentParser(description="LX/OPS GPU 폴러 (F1-C)")
    ap.add_argument("--node", default=os.environ.get("LX_NODE_ID", "node-tr3995wx"))
    ap.add_argument("--interval", type=float, default=2.0)
    ap.add_argument("--redis", default=os.environ.get("LX_REDIS_URL", "redis://localhost:6380"),
                    help="'' 이면 Redis 를 쓰지 않는다")
    ap.add_argument("--stdout", action="store_true", help="GpuSample 한 줄 JSON 을 표준출력으로")
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--nvsmi", default=None)
    ap.add_argument("--worker-vram-url", default=os.environ.get("LX_WORKER_VRAM_URL"),
                    help="Redis 가 없을 때 worker:{id}:vram 대신 읽을 JSON URL (:8702 로컬 브리지)")
    ap.add_argument("--llm-url", default=os.environ.get("LX_LLM_URL"),
                    help="Redis ops:llm 이 없을 때 읽을 llm_poller 결과 URL (:8702 로컬 브리지)")
    ap.add_argument("--lms", type=int, default=100, help="nvidia-smi -lms 표본 간격(ms) · 0 이면 스트림 없이 2s 단발")
    ap.add_argument("--no-write", action="store_true", help="Redis 를 읽기만(worker hb·vram·ops:llm) — ops:gpu 에 쓰지 않는다(e2e 단독 검증용)")
    ap.add_argument("--raw-log", default=None, help="0.5s 원표본을 ndjson 으로 남길 파일(실측 대조 표용)")
    a = ap.parse_args()
    for s_ in (sys.stdout, sys.stderr):   # Windows cp949 콘솔에서도 UTF-8 한 줄 JSON
        try:
            s_.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass

    nvsmi = find_nvsmi(a.nvsmi)
    store = Store(a.redis or None)
    pdh = Pdh()
    if pdh.ok:
        pdh.read({})           # PDH 서식 값은 두 번째 수집부터 유효하다 — 첫 수집을 버린다
        time.sleep(0.2)
    host = socket.gethostname()
    last_hb = 0.0
    stream = Stream(nvsmi, a.lms) if a.lms > 0 else None
    if stream and a.once:
        t_w = time.time()
        while not stream.ready() and time.time() - t_w < 6:
            time.sleep(0.1)
    log(f"시작 node={a.node} interval={a.interval}s nvsmi={nvsmi}({NVSMI_SRC['why']}) stream={'-lms ' + str(a.lms) if stream else 'off'} pdh={'on' if pdh.ok else 'off'}")
    raw_f = open(a.raw_log, "a", encoding="utf-8") if a.raw_log else None
    raw_seen: dict[int, float] = {}
    while True:
        t0 = time.time()
        try:
            s = sample(nvsmi, a.node, store, a.worker_vram_url, pdh, stream, a.llm_url)
        except subprocess.TimeoutExpired:
            log("nvidia-smi 10s 초과 — 이번 주기 건너뜀")
            s = None
        if raw_f and stream:
            with stream.lock:
                for gi, dq in stream.buf.items():
                    for (t, u, p, tc) in dq:
                        if t > raw_seen.get(gi, 0):
                            raw_f.write(json.dumps({"t": round(t * 1000), "gpu": gi, "util": u, "power_w": p, "temp_c": tc}) + "\n")
                            raw_seen[gi] = t
            if s:
                for g in s["gpus"]:
                    raw_f.write(json.dumps({"emit": s["at"], "t": round(time.time() * 1000), "gpu": g["index"], "util_ma5": g["util_ma5"]["value"],
                                            "power_w": g["power_w"]["value"], "n": len(g["util_ma5"].get("samples") or [])}) + "\n")
            raw_f.flush()
        if s:
            if a.stdout:
                sys.stdout.write(json.dumps(s, ensure_ascii=False) + "\n")
                sys.stdout.flush()
            if store.ok() and not a.no_write:
                for g in s["gpus"]:
                    store.do("HSET", f"ops:gpu:{a.node}:{g['index']}", *flatten(g, s["at"]))
                store.do("XADD", "ops:gpu", "MAXLEN", "~", "3600", "*",
                         "node", a.node, "at", s["at"], "json", json.dumps(s, ensure_ascii=False))
                if t0 - last_hb >= 10:
                    store.do("HSET", f"node:{a.node}", "id", a.node, "hostname", host, "role", "control+gpu",
                             "pool", "a6000", "gpus", json.dumps([g["index"] for g in s["gpus"]]),
                             "last_seen", s["at"], "state", "up", "source", "gpu_poller")
                    store.do("EXPIRE", f"node:{a.node}", "30")
                    last_hb = t0
        if a.once:
            break
        time.sleep(max(0.05, a.interval - (time.time() - t0)))
    if stream:
        stream.close()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
