import sys
from pathlib import Path

import httpx
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from landxi_api import config  # noqa: E402

B = f"http://127.0.0.1:{config.API_PORT}/api/v1"     # localhost 는 Windows httpx 가 ::1 먼저 시도해 요청마다 +2 s
BASE = f"http://127.0.0.1:{config.API_PORT}"


def _login(body):
    r = httpx.post(B + "/auth/login", json=body, timeout=30)
    r.raise_for_status()
    return r.json()["token"]


@pytest.fixture(scope="session")
def live():
    try:
        ok = httpx.get(B + "/health", timeout=5).json()["ok"]
    except Exception:
        ok = False
    if not ok:
        pytest.skip("게이트웨이 :8700 미기동")
    return B


@pytest.fixture(scope="session")
def tok(live):
    pw = config.DEV_PASSWORD
    return {
        "admin": _login({"realm": "lx", "login": "lx-admin", "password": pw}),
        "staff": _login({"realm": "lx", "login": "lx-staff", "password": pw}),
        "sales": _login({"realm": "lx", "login": "lx-sales", "password": pw}),
        "namwon": _login({"realm": "tenant", "tenant_id": "namwon", "login": "namwon-manager", "password": pw}),
        "gj": _login({"realm": "tenant", "tenant_id": "gwangju-jeonnam", "login": "gj-manager", "password": pw}),
    }


def H(t):
    return {"authorization": "Bearer " + t}
