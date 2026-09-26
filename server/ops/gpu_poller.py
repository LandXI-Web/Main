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
GPU_FIELDS = "index,name,uuid,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw,driver_version,driver_model.current,memory.free"
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


def find_nvsmi(explicit: str | None) -> str:
    for c in (explicit, os.environ.get("LX_NVSMI"), *_driverstore_nvsmi(), NVSMI_DEFAULT, shutil.which("nvidia-smi")):
        if c and os.path.exists(c):
            return c
    raise SystemExit("nvidia-smi 를 찾지 못했다 (--nvsmi 또는 LX_NVSMI)")


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
    """worker:{id}:vram → {budget_mib, used_mib, model_id, job_id?}. Redis 우선, 없으면 --worker-vram-url."""
    out = {}
    if store.ok():
        for w in workers:
            h = store.do("HGETALL", f"worker:{w}:vram")
            if h:
                d = dict(zip(h[::2], h[1::2]))
                out[w] = {"budget_mib": num(d.get("budget_mib")), "used_mib": num(d.get("used_mib")),
                          "model_id": d.get("model_id") or None, "job_id": d.get("job_id") or None,
                          "pid": num(d.get("pid"))}
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


def sample(nvsmi: str, node: str, store: Store, wv_url: str | None, pdh: "Pdh | None" = None) -> dict:
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
    gpus = []
    for r in rows:
        idx, name, uuid, util, mu, mt, temp, pw, drv, mode, mf = (r + [""] * 11)[:11]
        w = f"a6000-{idx}"
        mine = wv.get(w) or {}
        used = num(mu)
        used_src, used_note = "memory.used", None
        total, free = num(mt), num(mf)
        ph = phys_of.get(int(idx)) if idx.isdigit() else None
        pdh_mib = (P or {}).get("adapters", {}).get(ph) if ph is not None else None
        if used is not None and total is not None and used > total:
            # 드라이버 597.16 WDDM: memory.used 가 음수 언더플로(17,592,186,044,414 MiB)로 나오고 memory.free 도 할당을 반영하지 않는다.
            # 지어내지 않는다 — Windows 커널 집계(PDH GPU Adapter Memory)가 있으면 그것, 없으면 total − free(하한 · 그렇게 적는다).
            bad = num(mu)
            if pdh_mib is not None:
                used = pdh_mib
                used_src = "Windows PDH GPU Adapter Memory · Dedicated Usage"
                used_note = f"nvidia-smi memory.used 이상값 {bad:,} (드라이버 {drv} WDDM) → 커널 집계 · phys_{ph}↔GPU{idx} {(P or {}).get('map_src') or ''}"
            else:
                used = (total - free) if free is not None else None
                used_src, used_note = "memory.total − memory.free", f"memory.used 이상값 {bad:,} → total−free 로 대체(드라이버 {drv} WDDM · 할당 미반영 가능 — 하한)"
        wused = mine.get("used_mib") or 0
        ext = None if used is None else max(0, used - int(wused))
        src = lambda f: f"nvidia-smi {f}"  # noqa: E731
        gpus.append({
            "index": int(idx), "name": name,
            "util_pct": env(num(util), "%", src("utilization.gpu"), at),
            "mem_used_mib": env(used, "MiB", src(used_src), at, used_note),
            "mem_total_mib": env(num(mt), "MiB", src("memory.total"), at),
            "temp_c": env(num(temp), "°C", src("temperature.gpu"), at),
            "power_w": env(num(pw), "W", src("power.draw"), at),
            "external": ext_list(by_uuid.get(uuid, []), (P or {}).get("procs", {}).get(ph) if ph is not None else None, pnames,
                                 {int(v["pid"]) for v in wv.values() if v.get("pid")}),
            "external_used_mib": env(ext, "MiB", "memory.used − 워커 자기 보고", at,
                                     "워커 미기동 시 = memory.used" if not mine else f"워커 {w} {int(wused):,} MiB 제외"),
            "worker": w, "job_id": mine.get("job_id"),
            "worker_vram": ({"budget_mib": env(mine.get("budget_mib"), "MiB", f"worker:{w}:vram", at),
                             "used_mib": env(mine.get("used_mib"), "MiB", f"worker:{w}:vram", at),
                             "model_id": mine.get("model_id")} if mine else None),
            "driver": drv, "mode": mode,
        })
    return {"node": node, "at": at, "gpus": gpus}


def flatten(g: dict, at: str) -> list:
    """GpuSample.gpus[i] 평탄화(스칼라 필드) + json(원본 봉투 전체)."""
    f = {"index": g["index"], "name": g["name"], "at": at, "worker": g["worker"], "job_id": g["job_id"] or "",
         "driver": g["driver"], "mode": g["mode"],
         "external_names": ",".join(sorted({p["name"] for p in g["external"]})), "external_n": len(g["external"])}
    for k in ("util_pct", "mem_used_mib", "mem_total_mib", "temp_c", "power_w", "external_used_mib"):
        v = g[k]["value"]
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
    log(f"시작 node={a.node} interval={a.interval}s nvsmi={nvsmi} pdh={'on' if pdh.ok else 'off'}")
    while True:
        t0 = time.time()
        try:
            s = sample(nvsmi, a.node, store, a.worker_vram_url, pdh)
        except subprocess.TimeoutExpired:
            log("nvidia-smi 10s 초과 — 이번 주기 건너뜀")
            s = None
        if s:
            if a.stdout:
                sys.stdout.write(json.dumps(s, ensure_ascii=False) + "\n")
                sys.stdout.flush()
            if store.ok():
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


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
