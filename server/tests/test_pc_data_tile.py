"""PC 원값 타일 중계(/proxy/pc/data/…) — 해외 첫 화면 작황 하락 계산용(10-15 해외첫화면-고침).
로그인 필요 · 허용 주소만 · 받은 타일과 '자료 없음(204)'은 보관 · 429/5xx 는 다시 시도. 실망 없이 httpx.MockTransport."""
import asyncio

import httpx
import pytest

from landxi_api import deps, proxy
from landxi_api.main import app

TILE = "item/tiles/WebMercatorQuad/11/1449/757@1x"
Q = "collection=esa-worldcover&item=ESA_WorldCover_10m_2021_v200_N42E072&assets=map"
PNG = b"\x89PNG\r\n\x1a\n" + b"x" * 200


@pytest.fixture()
def env(tmp_path, monkeypatch):
    monkeypatch.setattr(proxy, "cache_root", lambda: tmp_path)
    monkeypatch.setattr(proxy, "principal", lambda r: deps.Principal(realm="tenant", role="manager", tenant_id="kgz-agri", user_id="u"))

    async def no_sleep(_):
        return None
    monkeypatch.setattr(asyncio, "sleep", no_sleep)
    return tmp_path


async def _get(path):
    deps._redis = None
    deps._pool = None
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
        return await c.get(path)


def test_needs_login(tmp_path, monkeypatch):
    monkeypatch.setattr(proxy, "cache_root", lambda: tmp_path)
    r = asyncio.run(_get(f"/api/v1/proxy/pc/data/{TILE}?{Q}"))
    assert r.status_code == 401


def test_only_allowed_paths(env):
    assert asyncio.run(_get(f"/api/v1/proxy/pc/data/stac/v1/search?{Q}")).status_code == 400
    assert asyncio.run(_get(f"/api/v1/proxy/pc/data/{TILE}?collection=naip")).status_code == 400


def test_retry_then_cached(env, monkeypatch):
    calls = {"n": 0}

    def handler(req):
        calls["n"] += 1
        assert str(req.url).startswith("https://planetarycomputer.microsoft.com/api/data/v1/item/tiles/")
        return httpx.Response(429) if calls["n"] == 1 else httpx.Response(200, content=PNG, headers={"content-type": "image/png"})
    monkeypatch.setattr(proxy, "transport", httpx.MockTransport(handler))
    r = asyncio.run(_get(f"/api/v1/proxy/pc/data/{TILE}?{Q}"))
    assert r.status_code == 200 and r.content == PNG and r.headers["x-lx-cache"] == "miss" and calls["n"] == 2
    r = asyncio.run(_get(f"/api/v1/proxy/pc/data/{TILE}?{Q}"))
    assert r.status_code == 200 and r.content == PNG and r.headers["x-lx-cache"] == "hit" and calls["n"] == 2


def test_empty_204_cached_404_empty_5xx_502(env, monkeypatch):
    calls = {"n": 0}

    def handler(req):
        calls["n"] += 1
        return httpx.Response(204)
    monkeypatch.setattr(proxy, "transport", httpx.MockTransport(handler))
    assert asyncio.run(_get(f"/api/v1/proxy/pc/data/{TILE}?{Q}")).status_code == 204
    assert asyncio.run(_get(f"/api/v1/proxy/pc/data/{TILE}?{Q}")).status_code == 204
    assert calls["n"] == 1

    n404 = {"n": 0}

    def h404(req):
        n404["n"] += 1
        return httpx.Response(404)
    monkeypatch.setattr(proxy, "transport", httpx.MockTransport(h404))
    for _ in range(2):
        assert asyncio.run(_get(f"/api/v1/proxy/pc/data/{TILE.replace('757', '758')}?{Q}")).status_code == 204
    assert n404["n"] == 2   # 404 는 보관하지 않는다

    monkeypatch.setattr(proxy, "transport", httpx.MockTransport(lambda req: httpx.Response(503)))
    assert asyncio.run(_get(f"/api/v1/proxy/pc/data/{TILE.replace('757', '759')}?{Q}")).status_code == 502
