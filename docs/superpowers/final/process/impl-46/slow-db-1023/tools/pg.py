import sys, json
sys.path.insert(0, r"E:\Land-XI 플랫폼\01. 디자인\server")
from landxi_api import config
import psycopg
def conn(admin=False, db=None):
    dsn = config.PG_ADMIN_DSN if admin else config.PG_DSN
    if db: dsn = dsn.rsplit("/",1)[0] + "/" + db if "?" not in dsn else dsn
    return psycopg.connect(dsn, autocommit=True)
if __name__ == "__main__":
    admin = "--admin" in sys.argv; db = None
    for a in sys.argv:
        if a.startswith("--db="): db = a[5:]
    q = sys.stdin.read()
    with conn(admin, db) as c:
        for stmt in [s for s in q.split(";\n") if s.strip()]:
            cur = c.execute(stmt)
            if cur.description:
                for r in cur.fetchall(): print(" | ".join(str(x) for x in r))
            print("--")
