# /projects?scope=mine 안쪽 구간별 시간(읽기만 · 재시작 불필요). 사용: python prof_projects.py [이메일]
import asyncio, sys, time, os
sys.path.insert(0, r"E:/Land-XI 플랫폼/01. 디자인/server"); os.chdir(r"E:/Land-XI 플랫폼/01. 디자인/server")
from landxi_api import projects as P
from landxi_api.deps import db, Principal
T = {}
def wrap(mod, name):
    f = getattr(mod, name)
    async def w(*a, **k):
        t = time.perf_counter(); r = await f(*a, **k); T.setdefault(name, []).append(time.perf_counter() - t); return r
    setattr(mod, name, w)
for n in ("_people", "_members", "_facts", "_judge_async", "_finds", "_pic", "_train_n", "view"):
    if hasattr(P, n): wrap(P, n)
import asyncpg
Q = {}
for _n in ("fetch", "fetchval", "fetchrow"):
    def _mk(n):
        f = getattr(asyncpg.Connection, n)
        async def w(self, q, *a, **k):
            t = time.perf_counter(); r = await f(self, q, *a, **k); d = Q.setdefault(" ".join(q.split())[:90], [0, 0.0]); d[0] += 1; d[1] += time.perf_counter() - t; return r
        setattr(asyncpg.Connection, n, w)
    _mk(_n)
async def main():
    email = sys.argv[1] if len(sys.argv) > 1 else "test@lx.or.kr"
    async with db(realm="lx") as c:
        u = await c.fetchrow("SELECT id, name, role FROM lx_users WHERE login=$1", email)
    p = Principal(realm="lx", role=u["role"], user_id=u["id"], name=u["name"])
    class Rq: pass
    for i in range(3):
        T.clear(); t = time.perf_counter()
        async with db(realm="lx") as c:
            people = await P._people(c); rows = await c.fetch("SELECT p.* FROM projects p WHERE p.state='active' AND (p.lead_id=$1 OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id=p.id AND m.user_id=$1)) ORDER BY p.updated_at DESC LIMIT 200", p.user_id)
            for r in rows: await P.view(c, p, r, people, full=False)
        if i == 2: print(*[f'{v[1]:.2f}s x{v[0]} {k}' for k, v in sorted(Q.items(), key=lambda x: -x[1][1])[:6]], sep=chr(10))
        Q.clear()
        print("run", i, "projects", len(rows), "total %.2fs" % (time.perf_counter() - t), {k: "%d x %.2fs" % (len(v), sum(v)) for k, v in T.items()})
asyncio.run(main())
