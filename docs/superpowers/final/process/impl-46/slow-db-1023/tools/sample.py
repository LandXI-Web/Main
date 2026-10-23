import time, json, sys
from pg import conn
dur = int(sys.argv[1]); out = open(sys.argv[2], "w", encoding="utf-8")
seen = {}
with conn(True) as c:
    t0 = time.time()
    while time.time() - t0 < dur:
        rows = c.execute("SELECT pid, datname, usename, extract(epoch FROM now()-query_start), state, wait_event_type, wait_event, left(query, 160), application_name FROM pg_stat_activity WHERE state <> 'idle' AND pid <> pg_backend_pid() AND now()-query_start > interval '1.5 s'").fetchall()
        tot = c.execute("SELECT count(*), count(*) FILTER (WHERE state='active'), count(*) FILTER (WHERE state='idle in transaction') FROM pg_stat_activity").fetchone()
        out.write(json.dumps({"t": round(time.time()-t0,1), "conns": tot, "long": [[r[0], r[1], r[2], round(float(r[3]),1), r[4], r[5], r[6], r[7]] for r in rows]}, ensure_ascii=False) + "\n"); out.flush()
        time.sleep(1)
