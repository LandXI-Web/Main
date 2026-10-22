"""바퀴 22 P6 시계열(10-22 now21) — 전국 진행 응답이 봉투 형식을 지키는가 · 해마다 따로 세는가.

10-22 사고: 진행 응답에 봉투 없는 숫자(show_year)를 넣어 게이트웨이가 500(envelope_missing)을 돌려주었고, XI맵 전국 층이 6분 동안 비었다.
진행 응답(기본 해 · 지난 해 · 작업기가 도는 해)을 실제 장부로 만들어 봉투 검사(envelope.scan)를 그대로 통과하는지 본다(DB 읽기만).
"""
from __future__ import annotations

import asyncio
import json
from types import SimpleNamespace

import pytest

from landxi_api import national as N
from landxi_api.deps import Principal
from landxi_api.envelope import EnvelopeMissing, scan


def _req():
    return SimpleNamespace(state=SimpleNamespace(principal=Principal(realm="lx", role="admin", user_id="pytest")))


_LOOP = asyncio.new_event_loop()                  # 연결 풀이 처음 루프에 묶이므로 한 루프에서만


def _progress(year=None):
    try:
        return _LOOP.run_until_complete(N.progress(_req(), year=year))
    except OSError as e:                          # DB 가 없는 곳(시험만 도는 PC)
        pytest.skip(f"DB 없음: {e!r}")


def _years():
    o = _progress()
    return sorted({y["year"] for y in o.get("years") or []} | {o["year"]})


@pytest.mark.parametrize("which", ["default", "each"])
def test_progress_envelope(which):
    ys = [None] if which == "default" else _years()
    for y in ys:
        o = _progress(y)
        try:
            scan(json.loads(json.dumps(o, default=str)))
        except EnvelopeMissing as e:                # 봉투 없는 숫자 = 게이트웨이 500(전국 층이 빈다)
            pytest.fail(f"봉투 없는 숫자 year={y}: {e.path} = {e.value!r}")


def test_progress_shape_one_year():
    o = _progress()
    assert isinstance(o["year"], int)
    assert o["base"]["year"] == o["year"]                         # 기본 해 = 화면 기본(끝난 해)
    assert isinstance(o["running_year"]["year"], int)
    assert str(o["year"]) in o["tile_sigs"]
    for y in o.get("years") or []:
        assert set(y) >= {"year", "pct", "complete"} and isinstance(y["pct"], dict)   # 해마다 따로 · 숫자는 봉투
    for a, A in o["assets"].items():
        assert "noimg" in A and A["noimg"]["km2"]["unit"] == "km2"
