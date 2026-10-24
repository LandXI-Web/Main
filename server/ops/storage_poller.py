#!/usr/bin/env python
"""LX/OPS 스토리지 폴러 (F1-C) — F1-CONTRACT §4.9 `/ops/storage` · §5.3 `ops:storage`.

60s 마다 (폴더 훑기는 30분에 한 번 — LX_STORAGE_HEAVY_S · 10-22 저장 현황 가볍게)
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


def _env_file(key: str) -> str | None:
    """server/.env 의 한 값(폴러는 관제 :8702 가 띄워 환경변수에 DSN 이 없다)."""
    p = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".env")
    try:
        for line in open(p, encoding="utf-8"):
            if line.strip().startswith(key + "="):
                return line.split("=", 1)[1].strip()
    except OSError:
        pass
    return None


def tenants() -> list[str]:
    """기관 목록 = tenants 표(고정 목록 0 · 새 기관도 자동) — DB 를 못 읽으면 결과 폴더 이름."""
    try:
        import psycopg
        dsn = os.environ.get("PG_WORKER_DSN") or _env_file("PG_WORKER_DSN")   # 비밀번호는 server/.env 에만(SECRET-FIX 10-22)
        if not dsn:
            raise RuntimeError("PG_WORKER_DSN 없음")
        with psycopg.connect(dsn, connect_timeout=3) as c:
            return [r[0] for r in c.execute("SELECT id FROM tenants ORDER BY id").fetchall()]
    except Exception:
        base = os.path.join(DATA_ROOT, "results")
        return ["lx"] + sorted(d for d in (os.listdir(base) if os.path.isdir(base) else []) if os.path.isdir(os.path.join(base, d)) and d != "lx")


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


# 무거운 부분(폴더 훑기)은 30분에 한 번만(10-22 바퀴 22 P4 · 저장보안-제안-저장현황가볍게 채택).
#   예전: 1분마다 results/ 전체(45만 파일)를 두 번(전체 · 기관마다) 훑었다 — 'lx' 몫에 다른 기관 폴더가 겹쳐 세지는 길도 있었다.
#   이제: results/ 를 한 번 훑어 첫 단(기관 폴더)별로 나눈다 · results/ 바로 아래 파일과 vector/ 는 LX 몫 · 디스크 남은 공간은 1분마다.
#   작업 하나하나의 크기는 작업이 끝날 때 jobs.result_bytes 에 적는다(기관별 사용량 표 · /ops/storage-tenants 가 그것을 더한다).
HEAVY_S = float(os.environ.get("LX_STORAGE_HEAVY_S") or 1800)
_heavy: dict = {"at": 0.0, "v": None}


def walk_results(root: str) -> dict:
    """results/ 한 번 훑기 → {기관: (바이트, 파일 수)} + 바로 아래 파일(LX 몫)."""
    base = os.path.join(root, "results")
    out: dict[str, list[int]] = {}
    flat_b = flat_n = 0
    try:
        with os.scandir(base) as it:
            for e in it:
                try:
                    if e.is_dir(follow_symlinks=False):
                        b, n = du(e.path)
                        out[e.name] = [b, n]
                    elif e.is_file(follow_symlinks=False):
                        flat_b += e.stat(follow_symlinks=False).st_size
                        flat_n += 1
                except OSError:
                    pass
    except OSError:
        pass
    return {"tenants": out, "flat": (flat_b, flat_n)}


def heavy(root: str) -> dict:
    now = time.time()
    if _heavy["v"] is None or now - _heavy["at"] >= HEAVY_S:
        t0 = time.time()
        j = lambda *p: os.path.join(root, *p)  # noqa: E731
        _heavy["v"] = {"results": walk_results(root), "tiles": du(j("tiles")), "vector": du(j("vector")),
                       "tenants_dir": {t: du(j("tenants", t)) for t in tenants()}, "at": now_iso(), "took_s": round(time.time() - t0, 1)}
        _heavy["at"] = now
    return _heavy["v"]


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
    H = heavy(root)
    hat = H["at"]
    j = lambda *p: os.path.join(root, *p)  # noqa: E731
    tile_b, tile_n = H["tiles"]
    vec_b, vec_n = H["vector"]
    rt = H["results"]["tenants"]
    flat_b, flat_n = H["results"]["flat"]
    res_b = sum(v[0] for v in rt.values()) + flat_b
    res_n = sum(v[1] for v in rt.values()) + flat_n
    by_tenant = {}
    for t in sorted(set(H["tenants_dir"]) | {"lx"}):
        b1, n1 = rt.get(t, [0, 0])
        b2, n2 = H["tenants_dir"].get(t, (0, 0))
        b, n, note = b1 + b2, n1 + n2, None
        if t == "lx":
            # 바로 아래 산출물(results/*.pmtiles|geojson) · vector/** 는 LX 가 만든 결과 — lx 로 센다(다른 기관 폴더는 넣지 않는다)
            b, n = b + flat_b + vec_b, n + flat_n + vec_n
            note = "results/lx + 바로 아래 산출물(results/*.*) + vector/** · 다른 기관 폴더는 뺌"
        elif n == 0:
            note = "tenants/{0}/ · results/{0}/ 없음 — 0".format(t)
        by_tenant[t] = env(gb(b), "GB", f"du {j('results', t)} (한 번 훑기 · {int(HEAVY_S // 60)}분마다)", hat, note)
    return {
        "volumes": vols,
        "by_tier": {
            "raw": env(None, "GB", "LX_DATA_ROOT 밖", at, "원본은 LX_DATA_ROOT 밖 · 목록만"),
            "tile": env(gb(tile_b), "GB", f"du {j('tiles')}", hat, f"{tile_n:,} 파일"),
            "result": env(gb(res_b + vec_b), "GB", f"du {j('results')} + {j('vector')}", hat, f"{res_n + vec_n:,} 파일"),
        },
        "by_tenant": by_tenant,
        "data_root": root,
        "walk": {"at": hat, "took_s": env(H["took_s"], "s", "storage_poller 자기 계측", hat), "every_s": env(HEAVY_S, "s", "storage_poller 설정", hat)},   # 10-24 맨 숫자 → 봉투(관리자 배포 · 인프라 화면 500)
        "as_of": at,
    }


def main():
    ap = argparse.ArgumentParser(description="LX/OPS 스토리지 폴러 (F1-C)")
    ap.add_argument("--interval", type=float, default=60.0)
    ap.add_argument("--root", default=DATA_ROOT)
    ap.add_argument("--mounts", default="E:,D:,C:")
    ap.add_argument("--redis", default=gpu_poller.redis_url_default())
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
