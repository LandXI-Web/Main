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


def test_status_error_not_cached_502(tmp_cache, monkeypatch):
    """v1.1(F1-B must_fix 4): 키는 살아 있는데 V-World 가 200 + status ERROR(PARAM_REQUIRED) → 캐시 금지 · 502 upstream_error."""
    calls = {"n": 0}

    def handler(req: httpx.Request):
        calls["n"] += 1
        return httpx.Response(200, json={"response": {"status": "ERROR", "error": {"level": "1", "code": "PARAM_REQUIRED",
                                                                                   "text": "필수 파라미터인 request가 없어서 요청을 처리할수 없습니다."}}})

    monkeypatch.setattr(proxy, "transport", httpx.MockTransport(handler))
    monkeypatch.setattr(proxy, "vworld_key", lambda: ("LIVE", "test.com"))
    q = "/api/v1/proxy/vworld/data?data=LP_PA_CBND_BUBUN"
    r = run(_get(q))
    assert r.status_code == 502
    e = r.json()["error"]
    assert e["code"] == "upstream_error" and e["detail"]["upstream_code"] == "PARAM_REQUIRED" and e["detail"]["cached"] is False
    r = run(_get(q))
    assert r.status_code == 502 and calls["n"] == 2          # 캐시 hit 없음 — 매번 상류
    assert not list(tmp_cache.rglob("*.bin"))


def test_legacy_cached_error_body_is_dropped(tmp_cache, monkeypatch):
    """v1.0 이 캐시해 둔 ERROR 본문은 읽을 때 지우고 상류를 다시 부른다."""
    from urllib.parse import urlencode
    q = {"service": "data", "request": "GetFeature", "data": "LP_PA_CBND_BUBUN", "geomFilter": "POINT(127.39 35.41)"}
    ck = "data?" + urlencode(sorted(q.items()))
    proxy.cache_put("vworld", ck, json.dumps({"response": {"status": "ERROR", "error": {"code": "PARAM_REQUIRED"}}}).encode(), "application/json")

    def handler(req: httpx.Request):
        return httpx.Response(200, json={"response": {"status": "OK", "result": {"featureCollection": {"type": "FeatureCollection", "features": []}}}})

    monkeypatch.setattr(proxy, "transport", httpx.MockTransport(handler))
    monkeypatch.setattr(proxy, "vworld_key", lambda: ("LIVE", "test.com"))
    r = run(_get("/api/v1/proxy/vworld/data?" + urlencode(q)))
    assert r.status_code == 200 and r.headers["x-lx-cache"] == "miss"
    r = run(_get("/api/v1/proxy/vworld/data?" + urlencode(q)))
    assert r.headers["x-lx-cache"] == "hit" and r.json()["response"]["status"] == "OK"


# ── F2-B 1차 판정 불합격 1: JSON 이 깨진 ERROR 본문 ──────────────────────────────
# 실제 상류 본문(02. 데이터/cache/vworld/54/5431ffc0….bin 원문 그대로) — text 안의 `단일검색="Y"` 따옴표가
# 이스케이프되지 않아 json.loads 가 실패한다. 예전 구현은 None → 7일 캐시 → 200·hit 재전송.
from pathlib import Path as _P  # noqa: E402

BROKEN = (_P(__file__).resolve().parents[1] / "fixtures" / "upstream" / "vworld-invalid-range-broken-json.bin").read_bytes()


def test_broken_json_error_body_is_detected():
    with pytest.raises(json.JSONDecodeError):
        json.loads(BROKEN.decode("utf-8"))
    assert proxy.upstream_status_error(BROKEN, "application/json;charset=UTF-8") == "INVALID_RANGE"
    assert proxy._key_error(BROKEN, "application/json;charset=UTF-8") is None       # 키 오류 아님 → 503 이 아니라 502


def test_broken_json_error_not_cached_502(tmp_cache, monkeypatch):
    calls = {"n": 0}

    def handler(req: httpx.Request):
        calls["n"] += 1
        return httpx.Response(200, content=BROKEN, headers={"content-type": "application/json;charset=UTF-8"})

    monkeypatch.setattr(proxy, "transport", httpx.MockTransport(handler))
    monkeypatch.setattr(proxy, "vworld_key", lambda: ("LIVE", "test.com"))
    q = "/api/v1/proxy/vworld/data?service=data&request=GetFeature&data=LP_PA_CBND_BUBUN&size=1"
    for i in (1, 2):
        r = run(_get(q))
        assert r.status_code == 502, r.text
        assert "x-lx-cache" not in r.headers
        e = r.json()["error"]
        assert e["code"] == "upstream_error" and e["detail"]["upstream_code"] == "INVALID_RANGE" and e["detail"]["cached"] is False
        assert calls["n"] == i
    assert not list(tmp_cache.rglob("*.bin"))


def test_broken_json_legacy_cache_dropped_and_purged(tmp_cache, monkeypatch):
    """캐시에 이미 굳은 깨진-JSON ERROR 본문: 읽을 때 지우고 502, purge 스크립트도 같은 판정으로 센다/지운다."""
    from urllib.parse import urlencode
    import importlib.util
    q = {"service": "data", "request": "GetFeature", "data": "LP_PA_CBND_BUBUN", "size": "1"}
    ck = "data?" + urlencode(sorted(q.items()))
    # purge 스크립트 — 같은 판정
    proxy.cache_put("vworld", ck, BROKEN, "application/json;charset=UTF-8")
    proxy.cache_put("vworld", "data?ok=1", b'{"response":{"status":"OK"}}', "application/json")
    spec = importlib.util.spec_from_file_location("purge", _P(__file__).resolve().parents[1] / "pipelines" / "purge_vworld_error_cache.py")
    purge = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(purge)
    rep = purge.purge(tmp_cache, dry=False)
    assert rep["entries"] == 2 and rep["error_bodies"] == 1 and rep["removed"][0]["error"] == "INVALID_RANGE"
    assert len(list(tmp_cache.rglob("*.bin"))) == 1
    # 게이트웨이 읽기 경로 — 다시 굳혀 두고 요청
    proxy.cache_put("vworld", ck, BROKEN, "application/json;charset=UTF-8")
    monkeypatch.setattr(proxy, "transport", httpx.MockTransport(
        lambda req: httpx.Response(200, content=BROKEN, headers={"content-type": "application/json;charset=UTF-8"})))
    monkeypatch.setattr(proxy, "vworld_key", lambda: ("LIVE", "test.com"))
    r = run(_get("/api/v1/proxy/vworld/data?" + urlencode(q)))
    assert r.status_code == 502 and "x-lx-cache" not in r.headers
    assert len(list(tmp_cache.rglob("*.bin"))) == 1          # ok 본문만 남음
