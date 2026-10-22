"""학습 장비 1분 감시(10-22 바퀴 22 P6 · 2024 전국 분석 동안) — 두 장의 전력 · 사용률 · 온도를 nvidia-smi 로 1분마다 기록하고, 넘으면 바로 한 장으로.

  pythonw -X utf8 ops/gpu_minute_watch.py            (server 폴더에서 · 하나만 돈다 — 잠금 파일)
  python ops/gpu_minute_watch.py --once              한 번만 재고 줄을 찍는다

  · 1분마다 30초 동안 1초 간격으로 nvidia-smi 를 불러 장마다 30초 평균 전력 · 사용률, 가장 높은 온도, 두 장 합 전력(평균)을 적는다.
    기록: 02. 데이터/_logs/gpu-minute-YYYYMMDD.csv (14일 보관)
  · 규칙(원칙 270 · CLAUDE.md §4): 장마다 30초 평균 사용률 ≤ 70% · 전력 ≤ 140 W, 장당 상한(power.limit) 200 W, 온도 < 85 ℃.
    넘으면 workers.pair_guard.trip(한 장 모드 · power:single · 30분 쉼)으로 바로 한 장으로 줄인다. 상한이 200 W 가 아니면 기록에 남긴다.
  · GPU 를 쓰지 않는다(조회만). 워커 안의 1초 감시(pair_guard.guard_loop)와 같이 돈다 — 이것은 1분 요약 · 장마다 평균 규칙 담당.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import os
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from landxi_api import config  # noqa: E402

LOG_DIR = config.DATA_ROOT / "_logs"
LOCK = LOG_DIR / "gpu-minute.lock"
UTIL_MAX, W_MAX, LIMIT_W, TEMP_MAX = 70.0, 140.0, 200.0, 85.0
Q = "index,power.draw,utilization.gpu,temperature.gpu,power.limit,memory.used"
NOWIN = 0x08000000 if os.name == "nt" else 0


def sample() -> dict[int, tuple]:
    out = subprocess.run(["nvidia-smi", f"--query-gpu={Q}", "--format=csv,noheader,nounits"], capture_output=True, text=True,
                         timeout=15, creationflags=NOWIN).stdout
    rows = {}
    for line in out.strip().splitlines():
        p = [x.strip() for x in line.split(",")]
        rows[int(p[0])] = tuple(float(x) if x not in ("[N/A]", "") else 0.0 for x in p[1:])
    return rows


def measure(sec: int = 30) -> dict:
    acc: dict[int, list] = {}
    for _ in range(sec):
        t = time.time()
        try:
            for i, v in sample().items():
                acc.setdefault(i, []).append(v)
        except Exception:  # noqa: BLE001
            pass
        time.sleep(max(0.0, 1.0 - (time.time() - t)))
    res = {}
    for i, vs in acc.items():
        n = len(vs)
        res[i] = {"w": sum(v[0] for v in vs) / n, "u": sum(v[1] for v in vs) / n, "t": max(v[2] for v in vs),
                  "lim": vs[-1][3], "mem": vs[-1][4], "n": n}
    return res


def judge(res: dict) -> list[str]:
    bad = []
    for i, m in res.items():
        if m["u"] > UTIL_MAX or m["w"] > W_MAX:
            bad.append(f"card:GPU{i} 30초 평균 {m['w']:.0f}W {m['u']:.0f}%")
        if m["t"] >= TEMP_MAX:
            bad.append(f"temp:GPU{i} {m['t']:.0f}℃")
    return bad


def write(res: dict, bad: list[str], action: str):
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    now = dt.datetime.now()
    p = LOG_DIR / f"gpu-minute-{now:%Y%m%d}.csv"
    new = not p.exists()
    with open(p, "a", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        if new:
            w.writerow(["at", "w0", "u0", "t0", "lim0", "w1", "u1", "t1", "lim1", "sum_w", "over", "action"])
        g0, g1 = res.get(0, {}), res.get(1, {})
        w.writerow([now.isoformat(timespec="seconds"),
                    round(g0.get("w", 0), 1), round(g0.get("u", 0), 1), g0.get("t", ""), g0.get("lim", ""),
                    round(g1.get("w", 0), 1), round(g1.get("u", 0), 1), g1.get("t", ""), g1.get("lim", ""),
                    round(sum(m["w"] for m in res.values()), 1), "; ".join(bad), action])
    for old in LOG_DIR.glob("gpu-minute-*.csv"):
        try:
            if time.time() - old.stat().st_mtime > 14 * 86400:
                old.unlink()
        except OSError:
            pass


def to_single(bad: list[str]) -> str:
    try:
        from workers.bus import r
        from workers import pair_guard
        why = "temp" if any(b.startswith("temp:") for b in bad) else "card"
        row = pair_guard.trip(r(), why, {"detail": "; ".join(bad)}, who="gpu_minute_watch")
        return "한 장으로(" + row.get("at", "") + ")"
    except Exception as e:  # noqa: BLE001
        return f"한 장으로 실패 {e!r}"[:200]


def once() -> tuple[dict, list[str], str]:
    res = measure(30)
    bad = judge(res)
    lim_bad = [f"GPU{i} 상한 {m['lim']:.0f}W" for i, m in res.items() if m["lim"] and abs(m["lim"] - LIMIT_W) > 1]
    action = to_single(bad) if bad else ""
    if lim_bad:
        action = (action + " · " if action else "") + "상한 다름: " + ", ".join(lim_bad)
    write(res, bad, action)
    return res, bad, action


def alive(pid: int) -> bool:
    try:
        import ctypes
        h = ctypes.windll.kernel32.OpenProcess(0x1000, False, pid)
        if not h:
            return False
        code = ctypes.c_ulong()
        ctypes.windll.kernel32.GetExitCodeProcess(h, ctypes.byref(code))
        ctypes.windll.kernel32.CloseHandle(h)
        return code.value == 259
    except Exception:  # noqa: BLE001
        return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--once", action="store_true")
    a = ap.parse_args()
    if a.once:
        print(once())
        return
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    if LOCK.exists():
        try:
            pid = int(LOCK.read_text().strip() or 0)
        except ValueError:
            pid = 0
        if pid and pid != os.getpid() and alive(pid):
            print("이미 돌고 있음", pid)
            return
    LOCK.write_text(str(os.getpid()))
    while True:
        t = time.time()
        try:
            once()
        except Exception:  # noqa: BLE001
            pass
        time.sleep(max(1.0, 60 - (time.time() - t)))


if __name__ == "__main__":
    main()
