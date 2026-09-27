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
    cands = [os.environ["LX_SURVEY_API"]] if os.environ.get("LX_SURVEY_API") else ["http://127.0.0.1:8705", "http://127.0.0.1:8700"]
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
    return _login(api, {"realm": "tenant", "tenant_id": "namwon", "login": "namwon-manager", "password": config.DEV_PASSWORD})


@pytest.fixture(scope="session")
def h_gj(api):
    return _login(api, {"realm": "tenant", "tenant_id": "gwangju-jeonnam", "login": "gj-manager", "password": config.DEV_PASSWORD})


@pytest.fixture(scope="session")
def h_staff(api):
    return _login(api, {"realm": "lx", "login": "lx-staff", "password": config.DEV_PASSWORD})


@pytest.fixture(scope="session")
def h_sales(api):
    return _login(api, {"realm": "lx", "login": "lx-sales", "password": config.DEV_PASSWORD})


@pytest.fixture()
def pg():
    from survey.db import lx_tx, pg as _pg
    c = _pg()
    lx_tx(c)
    yield c
    c.rollback()
    c.close()
