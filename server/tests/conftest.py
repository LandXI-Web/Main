import os
import sys
from pathlib import Path

import httpx
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import testdb  # noqa: E402

# 시험 전용 DB(10-22 시험 2차) — config 를 읽기 전에 접속값을 landxi_test · 시험 게이트웨이(:8710) · Redis 5번으로 바꾼다.
# 시험 게이트웨이: python server/tests/testdb_gateway.py (같은 값으로 띄운다). 운영 DB · 운영 게이트웨이를 가리키면 시험을 멈춘다.
_TESTDB = testdb.apply()
from landxi_api import config  # noqa: E402

# national.common.env_file 은 server/.env 파일을 바로 읽는다(환경 변수 무시) — 시험(그리고 시험이 부르는 national.runner)이 그 함수로 운영 DB 에
# 붙지 않게 시험 접속값을 덮어 준다(10-22 시험 2차: test_impl22_national · test_impl28_national_v2 · test_impl38_overseas 가 이 길로 운영 DB 를 읽었다)
import national.common as _NC  # noqa: E402

_nc_env_file = _NC.env_file
_NC.env_file = lambda: {**_nc_env_file(), **{k: os.environ[k] for k in testdb.DSN_KEYS if os.environ.get(k)}}
_why = testdb.guard(config) or testdb.guard_national(_NC)
if _why:
    pytest.exit(f"[시험 멈춤] 운영 DB 에 쓰지 않도록 멈췄습니다 — {_why}. server/tests/testdb.py · server/.env 의 PG_TEST_DB 를 보세요.", returncode=3)

B = f"http://127.0.0.1:{config.API_PORT}/api/v1"     # localhost 는 Windows httpx 가 ::1 먼저 시도해 요청마다 +2 s
BASE = f"http://127.0.0.1:{config.API_PORT}"


def _login(body):
    r = httpx.post(B + "/auth/login", json=body, timeout=30)
    r.raise_for_status()
    return r.json()["token"]


# 시험 계정(원칙 77 — 아이디 = 메일 주소 · 옛 아이디 lx-admin · lx-staff · lxadmin · {기관}-manager 는 사용 중지 · 0015_mail_accounts.sql)
ADMIN_LOGIN, STAFF_LOGIN, SALES_LOGIN = "lxadmin@lx.or.kr", "test@lx.or.kr", "sales@lx.or.kr"
TENANT_LOGIN = "lxadmin@lx.or.kr"                     # 각 기관 담당자(기관 관리자) — 기관 주소의 로그인으로 들어온다(입구 gov)
ADMIN_ID, STAFF_ID, SALES_ID = "u_mail_lxadmin", "u_mail_test", "u_lx_sales"
TENANT_ID = {"namwon": "u_namwon_mail_lxadmin", "gwangju-jeonnam": "u_gwangju-jeonnam_mail_lxadmin",
             "kgz-agri": "u_kgz-agri_mail_lxadmin", "kgz-land": "u_kgz-land_mail_lxadmin"}


def login_lx(login=STAFF_LOGIN, **kw):
    return _login({"realm": "lx", "login": login, "password": config.DEV_PASSWORD, **kw})


def login_tenant(tenant, login=TENANT_LOGIN, **kw):
    return _login({"realm": "tenant", "tenant_id": tenant, "login": login, "password": config.DEV_PASSWORD, "site": "gov", **kw})


def temp_account(realm, uid, login, role, tenant_id=None, name=None):
    """시험 안에서만 쓰는 계정(같은 역할의 두 번째 사람이 필요할 때 — 예: 요청한 관리자와 다른 결재 관리자) → (id, 토큰).
    비밀번호는 DEV_PASSWORD · 끝나면 drop_account(realm, uid) 로 지운다."""
    import psycopg
    from argon2 import PasswordHasher
    h = PasswordHasher().hash(config.DEV_PASSWORD)
    with psycopg.connect(config.PG_ADMIN_DSN, autocommit=True) as c:
        if realm == "lx":
            c.execute("INSERT INTO lx_users(id, login, pw_hash, role, status, name) VALUES (%s,%s,%s,%s,'active',%s) "
                      "ON CONFLICT (id) DO UPDATE SET login=EXCLUDED.login, pw_hash=EXCLUDED.pw_hash, role=EXCLUDED.role, status='active', name=EXCLUDED.name",
                      (uid, login, h, role, name or "시험 계정"))
        else:
            c.execute("INSERT INTO tenant_users(id, tenant_id, login, pw_hash, role, status, name) VALUES (%s,%s,%s,%s,%s,'active',%s) "
                      "ON CONFLICT (id) DO UPDATE SET login=EXCLUDED.login, pw_hash=EXCLUDED.pw_hash, role=EXCLUDED.role, status='active', name=EXCLUDED.name",
                      (uid, tenant_id, login, h, role, name or "시험 담당자"))
    tok = login_lx(login) if realm == "lx" else login_tenant(tenant_id, login)
    return uid, tok


def drop_account(realm, uid):
    import psycopg
    with psycopg.connect(config.PG_ADMIN_DSN, autocommit=True) as c:
        c.execute("DELETE FROM sessions WHERE realm=%s AND user_id=%s", (realm, uid))
        c.execute(f"DELETE FROM {'lx_users' if realm == 'lx' else 'tenant_users'} WHERE id=%s", (uid,))


@pytest.fixture(autouse=True, scope="module")
def _fresh_async_clients():
    """파일마다 asyncpg 묶음 · Redis 연결을 새로 — 파일마다 제 이벤트 루프(LOOP · asyncio.run)를 써서, 앞 파일 루프에 묶인 연결을
    물려받으면 'another operation is in progress' · 'attached to a different loop' 로 깨진다(10-22 순서 영향 ③)."""
    from landxi_api import deps

    def drop():
        for k in ("_pool", "_redis", "_pool_sys", "_pool_tenant"):
            v = getattr(deps, k, None)
            if v is not None and k != "_redis":
                try:
                    v.terminate()                 # 연결을 바로 닫는다(묶인 루프가 멈춰 있어도 — DB 연결 수가 쌓이지 않게)
                except Exception:  # noqa: BLE001
                    pass
            if hasattr(deps, k):
                setattr(deps, k, None)
    drop()
    yield
    drop()


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
        "admin": _login({"realm": "lx", "login": ADMIN_LOGIN, "password": pw}),
        "staff": _login({"realm": "lx", "login": STAFF_LOGIN, "password": pw}),
        "sales": _login({"realm": "lx", "login": SALES_LOGIN, "password": pw}),
        "namwon": _login({"realm": "tenant", "tenant_id": "namwon", "login": TENANT_LOGIN, "password": pw, "site": "gov"}),
        "gj": _login({"realm": "tenant", "tenant_id": "gwangju-jeonnam", "login": TENANT_LOGIN, "password": pw, "site": "gov"}),
    }


def H(t):
    return {"authorization": "Bearer " + t}
