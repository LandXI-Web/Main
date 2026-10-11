"""impl-13 확인 흐름에서 화면으로 만든 시험 키(쓰는 시스템 '시험 연동(점검)')와 그 호출 기록에 '시험' 표시를 단다 — 사용 현황 합계에서 빠진다.
키 값은 다루지 않는다(번호 · 이름으로만). 폐기 안 된 시험 키가 남아 있으면 알린다.
사용: python docs/superpowers/final/process/impl-13/api/mark-test.py"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[6] / "server"))
import psycopg  # noqa: E402
from landxi_api import config  # noqa: E402

with psycopg.connect(config.PG_ADMIN_DSN, autocommit=True) as c:
    ids = [r[0] for r in c.execute("SELECT id FROM api_keys WHERE label = '시험 연동(점검)'").fetchall()]
    if ids:
        c.execute("UPDATE api_keys SET test = true WHERE id = ANY(%s)", (ids,))
        c.execute("UPDATE api_calls SET test = true WHERE key_id = ANY(%s)", (ids,))
    live = c.execute("SELECT count(*) FROM api_keys WHERE test AND revoked_at IS NULL").fetchone()[0]
    calls = c.execute("SELECT count(*) FROM api_calls WHERE key_id = ANY(%s)", (ids,)).fetchone()[0]
print({"marked_keys": len(ids), "marked_calls": calls, "test_keys_not_revoked": live})
