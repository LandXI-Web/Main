"""시험 전용 DB(landxi_test) 접속값 — server/tests 가 운영 DB(landxi)에 쓰지 않게(10-22 시험 2차).

server/.env 의 PG_TEST_DB · LX_TEST_API_PORT · REDIS_TEST_DB 만 읽고, 비밀번호는 기존 접속값(PG_DSN 등)의 것을 그대로 쓴다
(새 비밀값 0 · 운영 역할 비밀번호 그대로 · 원칙 307). 같은 컨테이너의 다른 데이터베이스 · 다른 게이트웨이 포트 · 다른 Redis 번호.

apply() 는 config 를 import 하기 전에 os.environ 을 시험 값으로 바꾼다. guard() 는 운영 DB · 운영 게이트웨이를 가리키면 멈춘다.
"""
from __future__ import annotations

import os
import re
from pathlib import Path

SERVER = Path(__file__).resolve().parents[1]
DSN_KEYS = ("PG_DSN", "PG_ADMIN_DSN", "PG_WORKER_DSN", "PG_TENANT_DSN")


def _env_file() -> dict[str, str]:
    out: dict[str, str] = {}
    for name in (".env.example", ".env"):
        p = SERVER / name
        if p.exists():
            for line in p.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    out[k.strip()] = v.strip()
    return out


def _db_of(dsn: str) -> str:
    m = re.search(r"/([^/?]+)(\?|$)", dsn.split("@", 1)[-1])
    return m.group(1) if m else ""


def _swap_db(dsn: str, db: str) -> str:
    head, _, tail = dsn.rpartition("@")
    host, _, rest = tail.partition("/")
    q = ("?" + rest.split("?", 1)[1]) if "?" in rest else ""
    return f"{head}@{host}/{db}{q}"


def settings() -> dict:
    e = _env_file()
    prod_db = _db_of(e.get("PG_DSN") or "postgresql://x@h/landxi") or "landxi"
    return {"db": os.environ.get("PG_TEST_DB") or e.get("PG_TEST_DB") or "landxi_test",
            "port": int(os.environ.get("LX_TEST_API_PORT") or e.get("LX_TEST_API_PORT") or 8710),
            "redis_db": int(os.environ.get("REDIS_TEST_DB") or e.get("REDIS_TEST_DB") or 5),
            "prod_db": prod_db, "prod_port": int(e.get("LX_API_PORT") or 8700), "env": e}


def apply() -> dict:
    """os.environ 을 시험 값으로(이미 시험 값이면 그대로). → settings()."""
    s = settings()
    e = s["env"]
    for k in DSN_KEYS:
        v = e.get(k)
        if v:
            os.environ[k] = _swap_db(v, s["db"])
    r = e.get("REDIS_URL")
    if r:
        os.environ["REDIS_URL"] = re.sub(r"/\d+$", "", r) + f"/{s['redis_db']}"
    os.environ["LX_API_PORT"] = str(s["port"])
    os.environ["LX_PUBLIC_BASE"] = f"http://localhost:{s['port']}"
    os.environ["LX_AGENT_GATEWAY"] = f"http://127.0.0.1:{s['port']}/api/v1"     # XI ChatGEO 도구도 시험 게이트웨이로
    os.environ["LX_PRIMARY_LOCK"] = str(SERVER / ".gateway-primary-test.lock")
    os.environ["LX_TEST_GATEWAY"] = "1"
    return s


def guard(config) -> str | None:
    """운영을 가리키면 이유(문장), 아니면 None. config = landxi_api.config(apply 뒤 import)."""
    s = settings()
    if s["db"] == s["prod_db"]:
        return f"PG_TEST_DB 가 운영 DB({s['prod_db']})와 같습니다"
    for k in DSN_KEYS:
        v = getattr(config, k, None)
        if v and _db_of(v) == s["prod_db"]:
            return f"{k} 가 운영 DB({s['prod_db']})를 가리킵니다"
    if config.API_PORT == s["prod_port"]:
        return f"시험 게이트웨이 포트가 운영 게이트웨이(:{s['prod_port']})와 같습니다"
    try:
        import psycopg
        with psycopg.connect(config.PG_ADMIN_DSN, autocommit=True, connect_timeout=5) as c:
            name = c.execute("SELECT current_database()").fetchone()[0]
            mark = c.execute("SELECT to_regclass('public.lx_test_marker') IS NOT NULL").fetchone()[0]
    except Exception as ex:  # noqa: BLE001
        return f"시험 DB({s['db']})에 붙지 못했습니다: {type(ex).__name__}"
    if name == s["prod_db"] or not mark:
        return f"붙은 DB({name})가 시험 DB 표시(lx_test_marker)를 갖고 있지 않습니다"
    return None


def guard_national(nc) -> str | None:
    """national.common.env_file()(server/.env 를 바로 읽는 길)도 시험 DB 를 가리키는가."""
    s = settings()
    v = nc.env_file().get("PG_ADMIN_DSN") or ""
    if _db_of(v) != s["db"]:
        return "national.common.env_file 의 PG_ADMIN_DSN 이 시험 DB 가 아닙니다"
    return None
