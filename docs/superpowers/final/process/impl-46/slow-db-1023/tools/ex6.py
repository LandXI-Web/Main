import time, sys
from pg import conn
OLD = ("SELECT d.job_id, count(*) FROM detections d JOIN deploys p ON p.snapshot_current = 'results/' || p.tenant_id "
       "|| '/' || d.job_id OR p.snapshot_current = 'results/lx/' || d.job_id GROUP BY 1")
NEW = ("SELECT d.job_id, count(*) FROM detections d JOIN (SELECT substring(p.snapshot_current FROM '^results/[^/]+/(.+)$') AS jid FROM deploys p "
       "WHERE starts_with(p.snapshot_current, 'results/' || p.tenant_id || '/') OR starts_with(p.snapshot_current, 'results/lx/')) s ON d.job_id = s.jid GROUP BY 1")
with conn(True, sys.argv[1]) as c:
    c.execute("SET statement_timeout='120s'")
    t=time.time(); b = sorted(c.execute(NEW).fetchall()); tb=time.time()-t
    t=time.time(); a = sorted(c.execute(OLD).fetchall()); ta=time.time()-t
    print(sys.argv[1], len(a), a == b, round(ta,2), round(tb,3))
