import sys, json, datetime
from pg import conn
out = sys.argv[1]
with conn(True) as c:
    rows = c.execute("SELECT d.datname, r.rolname, s.calls, round(s.mean_exec_time::numeric,1), round(s.max_exec_time::numeric,1), round(s.total_exec_time::numeric,0), s.rows, s.query, s.queryid FROM pg_stat_statements s JOIN pg_database d ON d.oid=s.dbid JOIN pg_roles r ON r.oid=s.userid ORDER BY s.total_exec_time DESC").fetchall()
    info = c.execute("SELECT stats_reset FROM pg_stat_statements_info").fetchone()
json.dump({"saved_at": datetime.datetime.now().isoformat(), "stats_reset": str(info[0]), "rows":[dict(db=r[0],role=r[1],calls=r[2],mean_ms=float(r[3]),max_ms=float(r[4]),total_ms=float(r[5]),rows=r[6],query=r[7],queryid=r[8]) for r in rows]}, open(out,"w",encoding="utf-8"), ensure_ascii=False, indent=1)
for r in rows[:25]: print(r[0], r[1], r[2], r[3], r[4], r[7][:110].replace("\n"," "))
