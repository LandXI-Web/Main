"""학습 장비 두 장 사용(시험 · 원칙 270 · 10-17) — 모드 판정 + 안전 감시.

사용자(10-17): "GPU 1도 상한선 200w가 있으니깐. 둘다 사용하는 걸로 일단 제약을 풀어보자."
  · 장당 nvidia-smi 상한 200 W 는 그대로(조회만). 장마다 30초 평균 사용률 70% · 140 W 아래는 워커 쉼 조절(gpu_worker.nat_rest)이 그대로 지킨다.
  · 두 장 모드 = pools.yaml power.max_hot_gpus ≥ 2 이고 power.national.gpu 가 두 장 이상이며, 안전 감시가 한 장으로 돌려 두지 않았을 때(power:single 없음).
  · 안전 감시(guard_loop): 1초마다 두 장의 전력(드라이버 평균) · 온도 · 사용률 · 합 전력을 기록(02. 데이터/_logs/gpu-pair-YYYYMMDD.csv)하고,
    이상이면 바로 한 장으로 돌아간다 — 합 전력 > sum_max_w 가 sum_over_s 초 넘게 이어짐 · 어느 장이든 온도 ≥ temp_max_c ·
    드라이버 오류(NVML 호출 실패 · 장이 사라짐)가 driver_err_s 초 이어짐. 한 장 모드는 single_cool_s(기본 30분) 뒤 저절로 풀린다.
  · 감시는 GPU 워커마다 돌지만 Redis 잠금(power:guard)을 쥔 하나만 기록 · 판정한다.

Redis 키
  power:single            한 장으로 돌아간 까닭(json · 만료 = 쉬는 시간) — 있으면 두 장 모드가 꺼진다
  power:pair              지금 상태(해시: mode · reason · since · sum_w · temp_max · w0 · w1 · t0 · t1 · at · trips)
  power:nat_busy:{gpu}    그 장 워커가 지금 전국 칩을 돌리는 중(1.5초 만료 · 칩 묶음마다 갱신)
  power:nat_last:{gpu}    그 장 워커가 마지막으로 전국 칩을 돌린 시각 — 다른 장 워커 · LLM 호출이 '그 장의 열은 전국 작업 몫'으로 본다
"""
from __future__ import annotations

import csv
import datetime as dt
import json
import os
import threading
import time
from pathlib import Path

SINGLE = "power:single"
PAIR = "power:pair"
GUARD = "power:guard"
TRIPS = "power:pair:trips"
_cache = {"at": 0.0, "two": False}
_lock = threading.Lock()


def _pw() -> dict:
    from landxi_api import config
    return config.load_yaml("pools").get("power", {}) or {}


def nat_gpus(pw: dict | None = None) -> list[int]:
    g = ((pw if pw is not None else _pw()).get("national") or {}).get("gpu", 0)
    return [int(x) for x in g] if isinstance(g, (list, tuple)) else [int(g)]


def cfg(pw: dict | None = None) -> dict:
    p = (pw if pw is not None else _pw()).get("pair") or {}
    return {"sum_max_w": float(p.get("sum_max_w", 300)), "sum_over_s": float(p.get("sum_over_s", 10)),
            "temp_max_c": float(p.get("temp_max_c", 85)), "driver_err_s": float(p.get("driver_err_s", 3)),
            "single_cool_s": int(p.get("single_cool_s", 1800)), "log_days": int(p.get("log_days", 7))}


def configured(pw: dict | None = None) -> bool:
    """설정상 두 장 모드인가(안전 감시 상태와 무관)."""
    pw = pw if pw is not None else _pw()
    return int(pw.get("max_hot_gpus", 1)) >= 2 and len(nat_gpus(pw)) >= 2


def two_on(r=None, max_age: float = 1.0) -> bool:
    """지금 두 장 모드인가 — 설정 + power:single 없음. 1초 캐시(칩 묶음마다 불러도 Redis 한 번)."""
    now = time.time()
    with _lock:
        if now - _cache["at"] < max_age:
            return _cache["two"]
    try:
        if r is None:
            from workers.bus import r as _r
            r = _r()
        two = configured() and not r.exists(SINGLE)
    except Exception:  # noqa: BLE001 — Redis 가 없으면 한 장(보수적으로)
        two = False
    with _lock:
        _cache.update(at=now, two=two)
    return two


def mark_busy(r, gpu: int, job_id: str):
    p = r.pipeline(transaction=False)
    p.set(f"power:nat_busy:{gpu}", job_id, px=1500)
    p.set(f"power:nat_last:{gpu}", f"{time.time():.3f}", ex=120)
    p.execute()


def clear_busy(r, gpu: int):
    try:
        r.delete(f"power:nat_busy:{gpu}")
        r.set(f"power:nat_last:{gpu}", f"{time.time():.3f}", ex=120)
    except Exception:  # noqa: BLE001
        pass


def nat_heat(r, gpu: int, within_s: float) -> bool:
    """그 장의 최근 열(전력)이 우리 전국 작업 몫인가 — 지금 돌리는 중이거나 within_s 안에 돌렸다."""
    try:
        if r.exists(f"power:nat_busy:{gpu}"):
            return True
        v = r.get(f"power:nat_last:{gpu}")
        return bool(v) and time.time() - float(v) <= within_s
    except Exception:  # noqa: BLE001
        return False


def trip(r, reason: str, detail: dict | None = None, who: str = "guard") -> dict:
    """한 장으로 — power:single(쉬는 시간 만료) + 상태 + 기록. 이미 한 장이면 까닭만 남긴다."""
    c = cfg()
    row = {"reason": reason, "at": dt.datetime.now().isoformat(timespec="seconds"), "by": who, **(detail or {})}
    first = r.set(SINGLE, json.dumps(row, ensure_ascii=False), ex=c["single_cool_s"], nx=True)
    if first:
        r.lpush(TRIPS, json.dumps(row, ensure_ascii=False))
        r.ltrim(TRIPS, 0, 199)
        r.hset(PAIR, mapping={"mode": "single", "reason": reason, "since": row["at"], "trips": r.llen(TRIPS)})
        with _lock:
            _cache.update(at=0.0)
    return row


def status(r) -> dict:
    """관리자 대시보드 '학습 장비' 줄 · 진행 응답이 쓰는 한 출처."""
    pw = _pw()
    h = r.hgetall(PAIR) or {}
    s = r.get(SINGLE)
    single = json.loads(s) if s else None
    mode = "single" if (single or not configured(pw)) else "two"
    out = {"configured": "two" if configured(pw) else "single", "mode": mode,
           "reason": (single or {}).get("reason"), "since": (single or {}).get("at"), "until_s": r.ttl(SINGLE) if single else None,
           "sum_w": _f(h.get("sum_w")), "temp_max": _f(h.get("temp_max")), "at": h.get("at"),
           "watch": bool(h.get("at")) and time.time() - float(h.get("ts") or 0) < 10}
    return out


def _f(v):
    try:
        return None if v in (None, "") else float(v)
    except ValueError:
        return None


REASON_KO = {"sum_w": "두 장 합 전력이 높음", "temp": "온도가 높음", "driver": "장비 응답 오류"}


def guard_loop(who: str, log=print):
    """1초 감시 — 잠금(power:guard)을 쥔 워커 하나만 기록 · 판정한다. 다른 워커는 잠금이 풀리길 기다린다(뒤를 잇는다)."""
    from workers import nvml_power
    from workers.bus import r as _r
    from landxi_api import config
    logs = Path(os.environ.get("LX_DATA_ROOT") or config.DATA_ROOT) / "_logs"
    over_since = err_since = None
    f = w = None
    day = None
    owned = False
    while True:
        t = time.time()
        try:
            r = _r()
            if r.set(GUARD, who, nx=True, ex=5) or r.get(GUARD) == who:
                r.expire(GUARD, 5)
                if not owned:
                    owned = True
                    log(who, "학습 장비 안전 감시 시작(1초 · 두 장 합 전력 · 온도 · 장비 응답)")
                c = cfg()
                v = nvml_power.read_all()
                idx = sorted(v)
                ws = [v[i]["w"] for i in idx]
                ts = [v[i]["temp"] for i in idx]
                bad = (len(idx) < 2 and configured()) or any(v[i]["err"] for i in idx) or any(x is None for x in ws)
                total = round(sum(x for x in ws if x is not None), 1)
                tmax = max([x for x in ts if x is not None] or [0])
                two = two_on(r, max_age=0)
                # 기록(하루 한 파일 · 1초)
                d = time.strftime("%Y%m%d")
                if d != day:
                    if f:
                        f.close()
                    logs.mkdir(parents=True, exist_ok=True)
                    fn = logs / f"gpu-pair-{d}.csv"
                    new = not fn.exists()
                    f = open(fn, "a", newline="", encoding="utf-8")
                    w = csv.writer(f)
                    if new:
                        w.writerow(["ts", "w0", "w1", "sum_w", "t0", "t1", "u0", "u1", "mode", "err"])
                    day = d
                    _prune(logs, c["log_days"])
                g = lambda i, k: v.get(i, {}).get(k)  # noqa: E731
                w.writerow([round(t, 1), g(0, "w"), g(1, "w"), total, g(0, "temp"), g(1, "temp"), g(0, "util"), g(1, "util"),
                            "two" if two else "single", "|".join(str(v[i]["err"]) for i in idx)])
                f.flush()
                r.hset(PAIR, mapping={"sum_w": total, "temp_max": tmax, "w0": g(0, "w") or "", "w1": g(1, "w") or "",
                                      "t0": g(0, "temp") or "", "t1": g(1, "temp") or "", "ts": f"{t:.1f}",
                                      "at": dt.datetime.now().isoformat(timespec="seconds"), "mode": "two" if two else "single"})
                # 판정 — 두 장 모드일 때만 되돌림(한 장 모드는 예전 규칙이 이미 막는다)
                over_since = (over_since or t) if total > c["sum_max_w"] else None
                err_since = (err_since or t) if bad else None
                if two:
                    why = None
                    if over_since and t - over_since >= c["sum_over_s"]:
                        why, det = "sum_w", {"sum_w": total, "over_s": round(t - over_since, 1)}
                    elif tmax >= c["temp_max_c"]:
                        why, det = "temp", {"temp": tmax}
                    elif err_since and t - err_since >= c["driver_err_s"]:
                        why, det = "driver", {"err": [v[i]["err"] for i in idx], "gpus": len(idx)}
                    if why:
                        row = trip(r, why, det, who)
                        log(who, f"학습 장비 한 장으로 — {REASON_KO[why]} {json.dumps(det, ensure_ascii=False)} · {c['single_cool_s'] // 60}분 쉼 · {row['at']}")
                        over_since = err_since = None
            else:
                owned = False
        except Exception as e:  # noqa: BLE001 — 감시는 죽지 않는다
            try:
                log(who, "안전 감시 오류", repr(e)[:200])
            except Exception:  # noqa: BLE001
                pass
            time.sleep(2)
        time.sleep(max(0.05, 1.0 - (time.time() - t)))


def _prune(logs: Path, days: int):
    cut = time.time() - days * 86400
    for p in logs.glob("gpu-pair-*.csv"):
        try:
            if p.stat().st_mtime < cut:
                p.unlink()
        except OSError:
            pass
