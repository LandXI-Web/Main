"""바퀴 15 재검수 — 분석한 면적(합집합) 무거운 기관: 한 번에 하나만 뒤에서 세고, 지난 값을 바로 준다(/ops/tenants 500 고침)."""
import asyncio
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from landxi_api import quota as Q  # noqa: E402


class _R:
    def __init__(self):
        self.kv = {}

    async def get(self, k):
        return self.kv.get(k)

    async def set(self, k, v, ex=None):
        self.kv[k] = v


def test_heavy_area_single_flight_and_stale(monkeypatch):
    r = _R()
    calls = []

    async def fake_redis():
        return r

    async def slow_compute(ms, t):
        calls.append(t)
        await asyncio.sleep(0.2)
        v = 100.0 + len(calls)
        Q._area[(ms.isoformat(), t)] = (time.time(), v)
        return v

    monkeypatch.setattr(Q, "redis", fake_redis)
    monkeypatch.setattr(Q, "_area_compute", slow_compute)
    monkeypatch.setattr(Q, "_area", {})
    monkeypatch.setattr(Q, "_area_task", {})
    ms = Q._month_start()

    async def go():
        # 처음(기억 없음) — 여럿이 함께 물어도 계산은 한 번, 모두 같은 값
        a = await asyncio.gather(*(Q._area_heavy(ms, "lx") for _ in range(5)))
        assert a == [101.0] * 5 and calls == ["lx"]
        # 오래된 값 — 기다리지 않고 지난 값을 바로 주고, 뒤에서 한 번 새로 센다
        Q._area[(ms.isoformat(), "lx")] = (time.time() - Q.AREA_TTL - 1, 101.0)
        t0 = time.perf_counter()
        b = await Q._area_heavy(ms, "lx")
        assert b == 101.0 and time.perf_counter() - t0 < 0.1
        await asyncio.sleep(0.3)
        assert calls == ["lx", "lx"] and await Q._area_heavy(ms, "lx") == 102.0

    asyncio.run(go())


def test_heavy_area_reads_redis_after_restart(monkeypatch):
    r = _R()
    ms = Q._month_start()
    r.kv[f"quota:area_union:{ms.isoformat()}:lx"] = '{"at": %f, "v": 204814.2}' % time.time()

    async def fake_redis():
        return r

    async def never(ms, t):
        raise AssertionError("기억이 새것이면 다시 세지 않는다")

    monkeypatch.setattr(Q, "redis", fake_redis)
    monkeypatch.setattr(Q, "_area_compute", never)
    monkeypatch.setattr(Q, "_area", {})
    monkeypatch.setattr(Q, "_area_task", {})
    assert asyncio.run(Q._area_heavy(ms, "lx")) == 204814.2
