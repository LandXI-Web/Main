"""시험 게이트웨이 — 시험 전용 DB(landxi_test) · 포트 :8710 · Redis 5번으로 게이트웨이를 하나 더 띄운다(운영 :8700 은 그대로).

    python server/tests/testdb_gateway.py          # 띄우기(앞에서 돈다 · 끄려면 그 PID 만)

운영 DB · 운영 포트를 가리키면 띄우지 않는다(testdb.guard). 작업기는 띄우지 않는다 — 작업 대기열(Redis 5번)을 읽는 작업기가 없으므로
시험이 넣은 작업은 GPU 로 가지 않는다(작업이 끝나기를 기다리는 시험은 시간 초과 · TESTS-1022 ②).
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SERVER = HERE.parent
sys.path.insert(0, str(SERVER))
sys.path.insert(0, str(HERE))

import testdb  # noqa: E402

s = testdb.apply()
from landxi_api import config  # noqa: E402

why = testdb.guard(config)
if why:
    sys.exit(f"[시험 게이트웨이 멈춤] {why}")
os.environ.setdefault("PYTHONUTF8", "1")
os.chdir(SERVER)
import uvicorn  # noqa: E402

print(f"[test-gateway] http://127.0.0.1:{s['port']}/api/v1/health · DB {s['db']} · Redis {s['redis_db']}번", flush=True)
uvicorn.run("landxi_api.main:app", host="127.0.0.1", port=s["port"], log_level="warning", timeout_graceful_shutdown=3, timeout_keep_alive=75)
