import sys, os
os.chdir("E:/Land-XI 플랫폼/01. 디자인/server"); sys.path.insert(0, "E:/Land-XI 플랫폼/01. 디자인/server")
from change import imagery as CI
os.chdir("C:/Users/User/AppData/Local/Temp/claude/E--Land-XI----/8755e9e1-c9d4-4ccc-ae31-8eb0e35a24df/scratchpad/cc")
from cover import *
from cand import sheet
TC = {'신축': '#F04452', '소실': '#6B7684', '경작 전환': '#0FA9A0', '포장 확대': '#FF9F1C', '식생 증감': '#74B816',
      '산림 → 나지': '#C2410C', '산림 → 도로': '#FF9F1C', '산림 → 건물': '#F04452'}
def ngii(bb, year, zoom=18):
    img, (ox, oy, res), got, tot = CI.fetch_imagery(bb, int(year), zoom)
    c0 = int(round((bb[0] - ox) / res)); r0 = int(round((oy - bb[3]) / res))
    c1 = int(round((bb[2] - ox) / res)); r1 = int(round((oy - bb[1]) / res))
    return Image.fromarray(img[r0:r1, c0:c1]).resize((600, 900), Image.LANCZOS)
SQL = "select ST_AsBinary(ST_Transform(geom,5179)) g, cls, area_m2 from detections where job_id=$1 and geom && ST_Transform(ST_MakeEnvelope($2,$3,$4,$5,5179),4326)"
async def ccells(job, cell, n=10):
    c = await asyncpg.connect(DSN)
    r = await c.fetch(f"""select floor(ST_X(p)/{cell})*{cell}+{cell/2} cx, floor(ST_Y(p)/{cell})*{cell}+{cell/2} cy, count(*) n, sum(area_m2)::float8 m2,
       count(distinct cls) k from (select ST_Transform(ST_PointOnSurface(geom),5179) p, area_m2, cls from detections where job_id=$1) x group by 1,2 order by sum(area_m2) desc limit {n}""", job)
    await c.close(); return [dict(x) for x in r]
def make(job, ya, yb, cx, cy, wm, minm2=0, zoom=18):
    bb = half_bbox(cx, cy, wm)
    A, B = ngii(bb, ya, zoom), ngii(bb, yb, zoom)
    rows = run(geoms(SQL, job, *bb))
    it = [(g, {"fill": TC.get(r["cls"], "#9AA4B2"), "fa": 70, "line": TC.get(r["cls"], "#9AA4B2"), "width": 3.5, "halo": "#FFFFFF", "ha": 170})
          for g, r in rows if float(r["area_m2"] or 0) >= minm2]
    st = sorted({r["cls"] for g, r in rows if float(r["area_m2"] or 0) >= minm2}, key=lambda s: list(TC).index(s) if s in TC else 99)
    return compose(A, draw(B, it, bb), labels=(str(ya), str(yb)), legend=[(TC.get(s, "#9AA4B2"), s) for s in st])
