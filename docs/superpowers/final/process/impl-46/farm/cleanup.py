"""시험 메모 지우기 — capture.mjs 가 적은 '기능 확인용 메모' 줄만(parcel_notes · 이 증거에서 만든 것). 감사 기록(audit_log)은 건드리지 않는다.
python cleanup.py [--count]   비밀번호 · 접속 정보는 server/.env 에서 읽고 출력하지 않는다."""
import asyncio
import sys

import asyncpg

ENV = {}
for line in open(r"E:/Land-XI 플랫폼/01. 디자인/server/.env", encoding="utf-8"):
    line = line.strip()
    if "=" in line and not line.startswith("#"):
        k, v = line.split("=", 1)
        ENV[k] = v.strip().strip('"')
MEMO = "기능 확인용 메모"


async def main():
    c = await asyncpg.connect(ENV["PG_ADMIN_DSN"])
    n = await c.fetchval("SELECT count(*) FROM parcel_notes WHERE tenant_id='namwon' AND note=$1", MEMO)
    b = await c.fetch("SELECT batch_id, count(*) n FROM parcel_notes WHERE tenant_id='namwon' AND note=$1 GROUP BY 1", MEMO)
    print({"test_rows": n, "batches": [(r["batch_id"], r["n"]) for r in b]})
    if "--count" not in sys.argv:
        print({"deleted": await c.execute("DELETE FROM parcel_notes WHERE tenant_id='namwon' AND note=$1", MEMO)})
    await c.close()

asyncio.run(main())
