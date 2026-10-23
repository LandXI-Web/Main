# 무거운 뒤 계산 흉내(읽기만): 이번 달 면적 합집합(LX · 4만여 작업) 을 두 개 동시에 · 각 180초 제한
import sys, time, threading
sys.path.insert(0, r"E:\Land-XI 플랫폼\01. 디자인\server")
from landxi_api.quota import AREA_UNION_SQL
from pg import conn
import re
q = re.sub(r"\$(\d)", lambda m: "%s", AREA_UNION_SQL)
def run(i):
    t = time.time()
    with conn(False) as c:
        c.execute("SET statement_timeout='180s'"); c.execute("SET application_name='slow-db-1023-heavy'")
        try:
            c.execute("SELECT set_config('app.realm','lx',false)")
            r = c.execute(q, ("2026-10-01T00:00:00+09:00", ["lx"])).fetchall(); print(i, "done", r, round(time.time()-t))
        except Exception as e: print(i, type(e).__name__, round(time.time()-t))
ts = [threading.Thread(target=run, args=(i,)) for i in range(2)]
[t.start() for t in ts]; [t.join() for t in ts]
