import sys, time
from pg import conn
db = sys.argv[1]
with conn(True, db) as c:
    print(c.execute("SELECT indexdef FROM pg_indexes WHERE tablename='survey_parcel_ai'").fetchall())
    print("sgg invariant bad:", c.execute("SELECT count(*) FROM survey_parcels WHERE sgg_cd IS DISTINCT FROM left(pnu,5)").fetchone())
    if db != "landxi_test": sys.exit()
    c.execute("SET jit=off")
    codes = ['52190','45190']
    sets = [r[0] for r in c.execute("SELECT DISTINCT job_id FROM survey_parcel_ai WHERE sgg_cd=ANY(%s)", (codes,)).fetchall()]
    print(len(sets))
    A = ("SELECT jimok, cls_ko, count(DISTINCT pnu)::int AS n FROM survey_parcel_ai WHERE sgg_cd = ANY(%s::text[]) AND job_id = ANY(%s::text[]) GROUP BY 1, 2", "SELECT jimok, count(DISTINCT pnu)::int AS n FROM survey_parcel_ai WHERE sgg_cd = ANY(%s::text[]) AND job_id = ANY(%s::text[]) GROUP BY 1")
    B = ("SELECT jimok, cls_ko, count(*)::int AS n FROM (SELECT DISTINCT jimok, cls_ko, pnu FROM survey_parcel_ai WHERE sgg_cd = ANY(%s::text[]) AND job_id = ANY(%s::text[]) AND pnu IS NOT NULL) q GROUP BY 1, 2",
         "SELECT jimok, count(*)::int AS n FROM (SELECT DISTINCT jimok, pnu FROM survey_parcel_ai WHERE sgg_cd = ANY(%s::text[]) AND job_id = ANY(%s::text[]) AND pnu IS NOT NULL) q GROUP BY 1")
    for name, Q in (("old", A), ("new", B)):
        t = time.time(); r = [sorted(map(tuple, c.execute(q, (codes, sets)).fetchall()), key=str) for q in Q]; print(name, round(time.time()-t, 2), len(r[0]), len(r[1]))
        if name == "old": ref = r
        else: print("same:", r == ref)
