"""테스트 전용 어댑터(개발 모드 · 숨김) — 고아 감시(v1.1-14) · plan 훅(D0) · index.month 필드(v1.1-10) 실증용.

작업은 kind 'index' + options.adapter='test/sleep'(LX_DEV=1 에서만 허용) 로 제출한다. 카탈로그·모델 목록·kind 해석에는 나오지 않는다(hidden).
options: n(shard 수) · sleep_first_s(첫 시도 sleep) · sleep_retry_s(재시도 sleep) · month(있으면 index.month 발행) · orphan_timeout_s(감시 한도 · 개발 모드)
"""
from __future__ import annotations

import time

from adapters.base import ShardResult

ADAPTER = {"id": "test/sleep", "kinds": ["test"], "device": "cpu", "input": "params", "output": "metrics", "hidden": True}


def plan(job: dict) -> list[dict]:
    o = job.get("options") or {}
    n = int(o.get("n", 2))
    out = []
    for i in range(n):
        it = {"shard_id": f"s{i:02d}", "sleep_first_s": float(o.get("sleep_first_s", 0)), "sleep_retry_s": float(o.get("sleep_retry_s", 0))}
        if o.get("month"):
            it["month"] = o["month"] if n == 1 else f"{o['month'][:4]}-{int(o['month'][5:7]) + i:02d}"
        out.append(it)
    return out


class Adapter:
    def load(self, model, device, vram_budget_mib):
        return None

    def run_shard(self, shard, read, opts):
        p = shard.params or {}
        att = int(opts.get("attempt", 0) or 0)
        s = float(p.get("sleep_first_s", 0) if att == 0 else p.get("sleep_retry_s", 0))
        t0 = time.perf_counter()
        if s:
            time.sleep(s)
        ms = int((time.perf_counter() - t0) * 1000)
        m = {"slept_s": s, "attempt": att, "ms": ms, "basis": "demo", "source": "adapters/adapter_test_sleep(테스트)"}
        if p.get("month"):
            m.update({"ndvi_mean": 0.42, "n_scenes": 3, "valid_px": 1234, "p10": 0.21, "p50": 0.43, "p90": 0.61,
                      "hist": {"bins": [round(-0.2 + 0.05 * i, 3) for i in range(21)], "counts": [0] * 8 + [3, 9, 20, 40, 30, 12, 4] + [0] * 5}})
        return ShardResult(features=[], metrics=m, n=1, ms=ms)

    def unload(self):
        return None
