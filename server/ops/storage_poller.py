#!/usr/bin/env python
"""LX/OPS 스토리지 폴러 (F1-C) — F1-CONTRACT §4.9 `/ops/storage` · §5.3 `ops:storage`.

60s 마다
  volumes   : shutil.disk_usage(E: D: C:)  → free_gb · total_gb (measured · statfs)
  by_tier   : raw  = null (원본은 LX_DATA_ROOT 밖 · 목록만)
              tile = du(LX_DATA_ROOT/tiles)
              result = du(LX_DATA_ROOT/results) + du(LX_DATA_ROOT/vector)
  by_tenant : du(results/{tenant} + tenants/{tenant}) · lx 는 평면 산출물(results/*.* · vector/**)을 더한다
Redis 가 있으면 HSET ops:storage {json, at, …} + EXPIRE 180. --stdout 이면 한 줄 JSON.

실행
  python server/ops/storage_poller.py --stdout --once
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import shutil
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gpu_poller  # noqa: E402
from gpu_poller import Store, KST  # noqa: E402  (같은 최소 RESP 클라이언트)

gpu_poller.TAG = "storage_poller"

DATA_ROOT = os.environ.get("LX_DATA_ROOT", r"E:/Land-XI 플랫폼/02. 데이터")
TENANTS = ["lx", "namwon", "gwangju-jeonnam", "kgz-agri", "kgz-land", "lx-demo"]
GB = 1024 ** 3


def now_iso() -> str:
    return dt.datetime.now(KST).isoformat(timespec="milliseconds")


def env(value, unit, source, as_of, note=None, basis="measured"):
    e = {"value": value, "unit": unit, "basis": basis, "as_of": as_of, "source": source}
    if note:
        e["note"] = note
    return e


def du(path: str) -> tuple[int, int]:
    """(bytes, files). 없는 경로는 (0, 0). 심볼릭 링크는 따라가지 않는다."""
    total, n = 0, 0
    if not os.path.exists(path):
        return 0, 0
    if os.path.isfile(path):
        return os.path.getsize(path), 1
    stack = [path]
    while stack:
        p = stack.pop()
        try:
            with os.scandir(p) as it:
                for e in it:
                    try:
                        if e.is_dir(follow_symlinks=False):
                            stack.append(e.path)
                        elif e.is_file(follow_symlinks=False):
                            total += e.stat(follow_symlinks=False).st_size
                            n += 1
                    except OSError:
                        pass
        except OSError:
            pass
    return total, n


def gb(b: int) -> float:
    return round(b / GB, 2)


def sample(root: str, mounts: list[str]) -> dict:
    at = now_iso()
    vols = []
    for m in mounts:
        try:
            u = shutil.disk_usage(m + "\\" if len(m) == 2 else m)
            vols.append({"mount": m,
                         "free_gb": env(round(u.free / GB), "GB", "shutil.disk_usage (statfs)", at),
                         "total_gb": env(round(u.total / GB), "GB", "shutil.disk_usage (statfs)", at),
                         "used_gb": env(round(u.used / GB), "GB", "shutil.disk_usage (statfs)", at)})
        except OSError as e:
            vols.append({"mount": m, "free_gb": env(None, "GB", "shutil.disk_usage", at, f"읽기 실패 {e.__class__.__name__}"),
                         "total_gb": env(None, "GB", "shutil.disk_usage", at)})
    j = lambda *p: os.path.join(root, *p)  # noqa: E731
    tile_b, tile_n = du(j("tiles"))
    res_b, res_n = du(j("results"))
    vec_b, vec_n = du(j("vector"))
    by_tenant = {}
    for t in TENANTS:
        b1, n1 = du(j("results", t))
        b2, n2 = du(j("tenants", t))
        b, n, note = b1 + b2, n1 + n2, None
        if t == "lx":
            # 평면 산출물(results/*.pmtiles|geojson · vector/**)은 LX 가 만든 결과다 — lx 로 계상
            flat_b = sum(os.path.getsize(j("results", f)) for f in os.listdir(j("results"))
                         if os.path.isfile(j("results", f))) if os.path.isdir(j("results")) else 0
            b, n = b + flat_b + vec_b, n + vec_n
            note = "results/lx + 평면 산출물(results/*.* · vector/**) 합"
        elif n == 0:
            note = "tenants/{0}/ · results/{0}/ 없음 — 0".format(t)
        by_tenant[t] = env(gb(b), "GB", f"du {j('results', t)}", at, note)
    return {
        "volumes": vols,
        "by_tier": {
            "raw": env(None, "GB", "LX_DATA_ROOT 밖", at, "원본은 LX_DATA_ROOT 밖 · 목록만"),
            "tile": env(gb(tile_b), "GB", f"du {j('tiles')}", at, f"{tile_n:,} 파일"),
            "result": env(gb(res_b + vec_b), "GB", f"du {j('results')} + {j('vector')}", at, f"{res_n + vec_n:,} 파일"),
        },
        "by_tenant": by_tenant,
        "data_root": root,
        "as_of": at,
    }


def main():
    ap = argparse.ArgumentParser(description="LX/OPS 스토리지 폴러 (F1-C)")
    ap.add_argument("--interval", type=float, default=60.0)
    ap.add_argument("--root", default=DATA_ROOT)
    ap.add_argument("--mounts", default="E:,D:,C:")
    ap.add_argument("--redis", default=os.environ.get("LX_REDIS_URL", "redis://localhost:6380"))
    ap.add_argument("--stdout", action="store_true")
    ap.add_argument("--once", action="store_true")
    a = ap.parse_args()
    for s_ in (sys.stdout, sys.stderr):
        try:
            s_.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass
    store = Store(a.redis or None)
    mounts = [m.strip() for m in a.mounts.split(",") if m.strip()]
    while True:
        t0 = time.time()
        s = sample(a.root, mounts)
        s["took_s"] = env(round(time.time() - t0, 2), "s", "storage_poller 자기 계측", s["as_of"])
        if a.stdout:
            sys.stdout.write(json.dumps(s, ensure_ascii=False) + "\n")
            sys.stdout.flush()
        if store.ok():
            flat = ["json", json.dumps(s, ensure_ascii=False), "at", s["as_of"]]
            for v in s["volumes"]:
                flat += [f"{v['mount'].rstrip(':')}_free_gb", v["free_gb"]["value"] if v["free_gb"]["value"] is not None else ""]
            store.do("HSET", "ops:storage", *flat)
            store.do("EXPIRE", "ops:storage", "180")
        if a.once:
            break
        time.sleep(max(1.0, a.interval - (time.time() - t0)))


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
