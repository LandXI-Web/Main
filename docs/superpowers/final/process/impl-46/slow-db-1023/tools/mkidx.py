import sys
from pg import conn
db = sys.argv[1]
with conn(True, db) as c:
    c.execute("SET lock_timeout='10s'")
    parts = [r[0] for r in c.execute("SELECT c.relname FROM pg_inherits i JOIN pg_class c ON c.oid=i.inhrelid WHERE i.inhparent='detections'::regclass ORDER BY 1").fetchall()]
    if c.execute("SELECT to_regclass('detections_emd_blank')").fetchone()[0]:
        print("exists"); sys.exit()
    for p in parts:
        c.execute(f"CREATE INDEX CONCURRENTLY IF NOT EXISTS {p}_emd_blank ON {p} (job_id) WHERE (emd IS NULL OR emd = '')"); print("made", p)
    c.execute("CREATE INDEX IF NOT EXISTS detections_emd_blank ON ONLY detections (job_id) WHERE (emd IS NULL OR emd = '')")
    for p in parts:
        c.execute(f"ALTER INDEX detections_emd_blank ATTACH PARTITION {p}_emd_blank")
    print(c.execute("SELECT indisvalid FROM pg_index WHERE indexrelid='detections_emd_blank'::regclass").fetchone())
