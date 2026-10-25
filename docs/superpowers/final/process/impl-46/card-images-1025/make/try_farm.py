from cand import *
path = "imagery/mosaics/namwon_ap25_2023.vrt"
CELL = 250
async def cands():
    c = await asyncpg.connect(DSN)
    r = await c.fetch(f"""
    with p as (select sp.pnu, ST_Transform(ST_PointOnSurface(sp.geom),5186) pt,
         (exists(select 1 from survey_findings f where f.pnu=sp.pnu and f.rule='R2' and f.sgg_cd='52190' and f.ai_job_id is null) and coalesce(sp.a23_gh_in_m2,0)+coalesce(sp.a23_bld_in_m2,0) < 0.03*sp.area_m2) fal,
         coalesce(sp.a23_crop_in_m2,0)/nullif(sp.area_m2,0) cr
       from survey_parcels sp where sp.sgg_cd='52190' and sp.jimok in ('전','답'))
    select floor(ST_X(pt)/{CELL})*{CELL}+{CELL/2} cx, floor(ST_Y(pt)/{CELL})*{CELL}+{CELL/2} cy,
      sum(fal::int) nf, sum((cr>=0.5 and not fal)::int) nc, sum((cr<0.5 and not fal)::int) nu from p group by 1,2
    having sum(fal::int) between 4 and 10 and sum((cr>=0.5 and not fal)::int) >= 10 and sum((cr<0.5 and not fal)::int) <= 2 order by random() limit 16""")
    await c.close(); return [dict(x) for x in r]
PSQL = """select ST_AsBinary(ST_Transform(sp.geom,5186)) g, sp.pnu,
  exists(select 1 from survey_findings f where f.pnu=sp.pnu and f.rule='R2' and f.sgg_cd='52190' and f.ai_job_id is null) and coalesce(sp.a23_gh_in_m2,0)+coalesce(sp.a23_bld_in_m2,0) < 0.03*sp.area_m2 fal,
  coalesce(sp.a23_crop_in_m2,0)/nullif(sp.area_m2,0) cr
  from survey_parcels sp where sp.sgg_cd='52190' and sp.jimok in ('전','답') and sp.geom && ST_Transform(ST_MakeEnvelope($1,$2,$3,$4,5186),4326)"""
G, F = "#2E9E5B", "#E8590C"
def styles(rows):
    out = []
    for g, r in rows:
        if r["fal"]: out.append((g, {"fill": F, "fa": 120, "line": F, "width": 3, "halo": "#FFFFFF", "ha": 150}))
        elif (r["cr"] or 0) >= 0.5: out.append((g, {"fill": G, "fa": 105, "line": G, "width": 2.5, "halo": "#FFFFFF", "ha": 120}))
    return out
def make(cx, cy, wm=240):
    bb = half_bbox(cx, cy, wm)
    L = read_rgb(path, bb, 600, 900)
    R = draw(L, styles(run(geoms(PSQL, *bb))), bb)
    return compose(L, R, legend=[(G, "경작"), (F, "휴경")])
if __name__ == "__main__":
    cs = run(cands()); json.dump(cs, open("farm_cells.json", "w")); print(len(cs))
    sheet([make(c["cx"], c["cy"]) for c in cs]).save("farm_sheet.jpg", quality=85)
