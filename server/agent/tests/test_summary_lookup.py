"""summary_lookup(fix-agent-scope) — 요약 API 와 같은 수 · 같은 상태 · 관할 · 답 문장.

순수 함수 검사는 DB 없이, 'API 와 같은 값' 검사는 게이트웨이(:8700)가 떠 있을 때만(로그인 = 계정 API · 화면 판정은 별도로 로그인 폼)."""
import asyncio
import os
import re
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from agent.tools import summary_lookup as S  # noqa: E402
from landxi_api.deps import CAPS, Principal  # noqa: E402

CARDS = [{"id": "card-marine", "name": "해양쓰레기 실태조사 서비스", "scope": "local"},
         {"id": "card-farm", "name": "영농관리 행정서비스", "scope": "local"},
         {"id": "card-global-farm", "name": "농지 이용 실태 분석 (해외)", "scope": "global"},
         {"id": "card-road", "name": "도로 안전관리 서비스", "scope": "local"}]
GW = "http://127.0.0.1:8700/api/v1"


def _fresh():
    """앞선 asyncio.run 이 남긴(닫힌 루프의) 연결 풀을 버린다 — 테스트마다 새 루프 · 새 풀."""
    from landxi_api import deps
    deps._pool = deps._pool_sys = deps._redis = None


def test_card_words():
    assert S.match_card("여수시 해양쓰레기 몇 건이야?", CARDS) == "card-marine"
    assert S.match_card("여수 해안 쓰레기 현황", CARDS) == "card-marine"          # 같은 뜻의 흔한 말
    assert S.match_card("영농 결과 몇 건", CARDS) == "card-farm"                    # '영농관리' → '영농'
    assert S.match_card("서비스 결과 알려줘", CARDS) is None                         # 일반 낱말만으로는 고르지 않는다


def test_say_uses_placeholders_only():
    it = {"region_name": "전남 여수시", "card_name": "해양쓰레기 실태조사 서비스", "stage": "운영"}
    a = S.say([it], [{"nums": [("AI 탐지", "e1")]}], True)
    assert "{{env:e1}}" in a and "운영 중" in a
    assert not re.search(r"\d", a.replace("{{env:e1}}", ""))                        # 숫자는 자리표로만(지어낸 숫자 0)
    assert S.say([], [], True) == "해당 지역 데이터가 없습니다"                        # 명세 문구 그대로
    first = {**it, "stage": "첫 결과 전"}
    assert S.say([first, first], [{"nums": []}, {"nums": []}], False) == "해당 지역 데이터가 없습니다"


def test_tenant_arg():
    assert S.tenant_arg(Principal("tenant", "manager", "namwon", "u", caps=CAPS[("tenant", "manager")])) == "namwon"
    assert S.tenant_arg(Principal("lx", "staff", None, "u", caps=CAPS[("lx", "staff")])) == S.LX_ALL
    assert S.tenant_arg(Principal()) is None


def _pw():
    if os.environ.get("LX_PW"):
        return os.environ["LX_PW"]
    env = Path(__file__).resolve().parents[2] / ".env"
    m = re.search(r"^DEV_PASSWORD=(.*)$", env.read_text(encoding="utf-8"), re.M) if env.exists() else None
    return m.group(1).strip() if m else None


def _login(httpx, body):
    r = httpx.post(GW + "/auth/login", json={**body, "password": _pw()}, timeout=10)
    r.raise_for_status()
    return {"authorization": "Bearer " + r.json()["token"]}


@pytest.mark.parametrize("who,body,msg", [
    ("staff", {"realm": "lx", "login": "lx-staff"}, "여수시 해양쓰레기 결과 보여줘"),
    ("gj", {"realm": "tenant", "tenant_id": "gwangju-jeonnam", "login": "gj-manager"}, "여수시 해양쓰레기 몇 건이야?"),
])
def test_same_as_summary_api(who, body, msg):
    """에이전트 요약 직행의 봉투 값 · 상태 == GET /api/v1/summary 의 같은 항목."""
    httpx = pytest.importorskip("httpx")
    try:
        httpx.get(GW + "/health", timeout=3).raise_for_status()
        H = _login(httpx, body)
    except Exception:
        pytest.skip("게이트웨이 · 계정 미가동")
    from agent import runner
    from landxi_api.deps import close
    p = {"staff": Principal("lx", "staff", None, "u_lx_staff", caps=CAPS[("lx", "staff")]),
         "gj": Principal("tenant", "manager", "gwangju-jeonnam", "u_gj", caps=CAPS[("tenant", "manager")])}[who]

    async def go():
        try:
            ctx = runner.Ctx(run_id="t_sum", principal=p, token=None, context={})
            assert await runner.scope_guard(ctx, msg) is None
            sr = await runner.summary_route(ctx, msg)
            assert sr and sr["card"] and sr["region"]
            o = await S.summary_lookup({"region": sr["region"], "card": sr["card"]}, ctx)
            return sr, o
        finally:
            await close()
    _fresh()
    sr, o = asyncio.run(go())
    api = httpx.get(GW + "/summary", params={"region": sr["region"], "card": sr["card"]}, headers=H, timeout=20)
    if api.status_code == 404:
        pytest.skip("요약 API 미탑재(게이트웨이 재기동 전)")
    items = api.json()["items"]
    mine = o.raw["items"]
    assert len(items) == len(mine) >= 1
    for a, b in zip(items, mine):
        assert a["stage"] == b["stage"] and a["sgg_cd"] == b["sgg_cd"] and a["card"] == b["card"]
        for k in ("detected", "field_check", "review_pending", "reports"):
            assert (a["metrics"].get(k) or {}).get("value") == (b["metrics"].get(k) or {}).get("value"), k
    assert any(x["op"] == "map_flyto" for x in o.ui_actions)                         # 한 지역 → 지도 이동
