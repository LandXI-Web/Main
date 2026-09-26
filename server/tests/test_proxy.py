"""V-World 프록시 — 키 없음/권한 미반영 → 503 vworld_key_pending · 키 투입 시(가짜 상류) 캐시 경로 · PC register/statistics 캐시.
실키·실망 없이 httpx.MockTransport 로 돈다(게이트웨이 앱을 직접 띄움 · Redis 는 계량에만)."""
import asyncio
import json

import httpx
import pytest

from landxi_api import config, proxy
from landxi_api.main import app


@pytest.fixture()
def tmp_cache(tmp_path, monkeypatch):
    monkeypatch.setattr(proxy, "cache_root", lambda: tmp_path)
    proxy._state.update(pending_until=0.0, key_sig=None, last_error=None)
    return tmp_path


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro) if False else asyncio.run(coro)


async def _get(path, **kw):
    from landxi_api import deps
    deps._redis = None
    deps._pool = None
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
        return await c.request(kw.pop("method", "GET"), path, **kw)


def test_no_key_503(tmp_cache, monkeypatch):
    monkeypatch.setattr(proxy, "vworld_key", lambda: ("", ""))
    r = run(_get("/api/v1/proxy/vworld/data?service=data&request=GetFeature&data=LP_PA_CBND_BUBUN"))
    assert r.status_code == 503 and r.json()["error"]["code"] == "vworld_key_pending"


def test_expired_key_503_then_key_ok_cached(tmp_cache, monkeypatch):
    calls = {"n": 0}

    def handler(req: httpx.Request):
        calls["n"] += 1
        key = req.url.params.get("key")
        assert req.url.params.get("domain") == "test.com"
        if key == "OLD":
            return httpx.Response(200, json={"response": {"status": "ERROR", "error": {"code": "INCORRECT_KEY"}}})
        return httpx.Response(200, json={"response": {"status": "OK", "result": {"featureCollection": {"type": "FeatureCollection", "features": []}}}})

    monkeypatch.setattr(proxy, "transport", httpx.MockTransport(handler))
    monkeypatch.setattr(proxy, "vworld_key", lambda: ("OLD", "test.com"))
    q = "/api/v1/proxy/vworld/data?service=data&request=GetFeature&data=LP_PA_CBND_BUBUN&geomFilter=BOX(127.38,35.40,127.40,35.42)"
    r = run(_get(q))
    assert r.status_code == 503 and r.json()["error"]["detail"]["upstream_code"] == "INCORRECT_KEY"
    r = run(_get(q))                       # 60s 기억 — 상류 재호출 없음
    assert r.status_code == 503 and calls["n"] == 1
    monkeypatch.setattr(proxy, "vworld_key", lambda: ("NEW", "test.com"))   # 키 투입 → 즉시 활성
    r = run(_get(q))
    assert r.status_code == 200 and r.headers["x-lx-cache"] == "miss" and calls["n"] == 2
    r = run(_get(q))
    assert r.status_code == 200 and r.headers["x-lx-cache"] == "hit" and calls["n"] == 2
    assert list(tmp_cache.rglob("*.bin"))


def test_wmts_url_order(monkeypatch):
    u = proxy._upstream_url("wmts", {"layer": "Satellite", "z": "9", "x": "437", "y": "204", "ext": "jpeg"}, "K", "")
    assert u.endswith("/wmts/1.0.0/K/Satellite/9/204/437.jpeg")


def test_pc_register_statistics_cached(tmp_cache, monkeypatch):
    calls = []

    def handler(req: httpx.Request):
        calls.append(str(req.url))
        if "register" in str(req.url):
            return httpx.Response(200, json={"searchid": "abc123"})
        return httpx.Response(200, json={"map": {"min": 10, "max": 100}})

    monkeypatch.setattr(proxy, "transport", httpx.MockTransport(handler))
    body = json.dumps({"collections": ["sentinel-2-l2a"], "filter-lang": "cql2-json"})
    r1 = run(_get("/api/v1/proxy/pc/mosaic/register", method="POST", content=body, headers={"content-type": "application/json"}))
    r2 = run(_get("/api/v1/proxy/pc/mosaic/register", method="POST", content=body, headers={"content-type": "application/json"}))
    assert r1.json()["searchid"] == "abc123" and r2.headers["x-lx-cache"] == "hit" and len(calls) == 1
    r3 = run(_get("/api/v1/proxy/pc/statistics?collection=esa-worldcover&item=X", method="POST", content=b'{"type":"Feature"}'))
    r4 = run(_get("/api/v1/proxy/pc/statistics?collection=esa-worldcover&item=X", method="POST", content=b'{"type":"Feature"}'))
    assert r3.status_code == 200 and r4.headers["x-lx-cache"] == "hit" and len(calls) == 2
