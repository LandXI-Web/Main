import time
from pg import conn
with conn(True, "landxi") as c:
    c.execute("SET jit=off")
    q = "SELECT id, job_id, ST_X(p), ST_Y(p) FROM (SELECT id, job_id, ST_PointOnSurface(geom) p FROM detections WHERE (emd IS NULL OR emd = '') LIMIT 20000) q"
    print([l[0][:110] for l in c.execute("EXPLAIN " + q).fetchall()][:6])
    t = time.time(); n = len(c.execute(q).fetchall()); print("emd_blank rows", n, round(time.time()-t, 3), "s")
    # ChatGEO 필지 수: 옛 식 vs 새 식 같은 값
    codes = [r[0] for r in c.execute("SELECT DISTINCT sgg_cd FROM survey_parcels LIMIT 3").fetchall()]
    t = time.time(); a = c.execute("SELECT count(*) FROM survey_parcels WHERE substr(pnu,1,5) = ANY(%s)", (codes,)).fetchone()[0]; ta = time.time()-t
    t = time.time(); b = c.execute("SELECT count(*) FROM survey_parcels WHERE sgg_cd = ANY(%s)", (codes,)).fetchone()[0]; tb = time.time()-t
    print("parcels", codes, a, b, a == b, round(ta, 2), round(tb, 3))
