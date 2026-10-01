"""F2-S pytest — PostGIS 적재 · 규칙 재평가 · explain · API · 상태기계 · 보고서.

    cd server && python -m pytest survey/tests -q

API 테스트 대상: LX_SURVEY_API(기본: :8705 개발 게이트웨이가 떠 있으면 그것, 아니면 :8700). 둘 다 없으면 API 테스트는 skip.
"""
import os
import sys
from pathlib import Path

import httpx
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))       # server/
from landxi_api import config  # noqa: E402


def _alive(base: str) -> bool:
    try:
        return httpx.get(base + "/api/v1/survey/rules", timeout=3).status_code == 401
    except Exception:
        return False


@pytest.fixture(scope="session")
def api():
    # 운영 게이트웨이(:8700 · 지금 코드) 먼저 — 오래 떠 있는 개발 앱(:8705)이 옛 코드로 답해 검사가 어긋나지 않게
    cands = [os.environ["LX_SURVEY_API"]] if os.environ.get("LX_SURVEY_API") else ["http://127.0.0.1:8700", "http://127.0.0.1:8705"]
    for b in cands:
        if _alive(b):
            return b + "/api/v1"
    pytest.skip("실태조사 라우트가 붙은 게이트웨이 없음")


def _login(api, body):
    r = httpx.post(api + "/auth/login", json=body, timeout=30)
    r.raise_for_status()
    return {"authorization": "Bearer " + r.json()["token"]}


@pytest.fixture(scope="session")
def h_nw(api):
    return _login(api, {"realm": "tenant", "tenant_id": "namwon", "login": "lxadmin@lx.or.kr", "password": config.DEV_PASSWORD, "site": "gov"})


@pytest.fixture(scope="session")
def h_gj(api):
    return _login(api, {"realm": "tenant", "tenant_id": "gwangju-jeonnam", "login": "lxadmin@lx.or.kr", "password": config.DEV_PASSWORD, "site": "gov"})


@pytest.fixture(scope="session")
def h_staff(api):
    return _login(api, {"realm": "lx", "login": "test@lx.or.kr", "password": config.DEV_PASSWORD})


@pytest.fixture(scope="session")
def h_sales(api):
    return _login(api, {"realm": "lx", "login": "sales@lx.or.kr", "password": config.DEV_PASSWORD})


@pytest.fixture()
def pg():
    from survey.db import lx_tx, pg as _pg
    c = _pg()
    lx_tx(c)
    yield c
    c.rollback()
    c.close()
