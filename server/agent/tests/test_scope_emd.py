"""ChatGEO 읍면동 찾기(재검수 남은 고장) — 화면 시군구에서 먼저 · 없으면 전국(한 곳일 때) · 여러 곳이면 되묻기 · 기관은 관할 안만."""
import asyncio
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from agent import runner  # noqa: E402
from agent.tools import ToolError, scope  # noqa: E402
from landxi_api.deps import CAPS, Principal  # noqa: E402

STAFF = Principal("lx", "staff", None, "u_scope_test", caps=CAPS[("lx", "staff")])
NAMWON = Principal("tenant", "manager", "namwon", "u_nw", caps=CAPS[("tenant", "manager")])


def _reg(p, region_ctx, asked):
    ctx = runner.Ctx(run_id="run_scope0001", principal=p, token=None, context={"region": region_ctx} if region_ctx else {})
    args = {"region": asked}
    return asyncio.run(scope.region_of(ctx, args)), args


@pytest.mark.parametrize("where", [None, "48870", "52190", "45190"])   # 전국 · 함양 · 남원 · 남원 옛 코드 화면
def test_emd_found_from_any_screen(where):
    reg, args = _reg(STAFF, where, "운봉읍")
    assert reg["name"] == "남원시" and "52190" in reg["codes"]
    assert args.get("emd") == "운봉읍" and "region" not in args


def test_emd_with_sgg_head():
    reg, args = _reg(STAFF, "48870", "남원 운봉읍")
    assert reg["name"] == "남원시" and args.get("emd")


def test_screen_sgg_first_then_ambiguous_asks():
    reg, args = _reg(STAFF, "52190", "운봉")                  # 화면 시군구 안에서 먼저(읍 없이 말해도)
    assert reg["name"] == "남원시"
    with pytest.raises(ToolError) as e:                       # 전국에 여러 곳(중앙동) — 되묻기
        _reg(STAFF, None, "중앙동")
    assert e.value.status == 400 and "여러 시군구" in str(e.value)


def test_tenant_only_own_scope():
    reg, args = _reg(NAMWON, None, "운봉읍")
    assert reg["name"] == "남원시" and args.get("emd") == "운봉읍"
    with pytest.raises(ToolError) as e:                       # 관할 밖(함양 마천면)은 찾지 않는다
        _reg(NAMWON, None, "마천면")
    assert e.value.status == 404
