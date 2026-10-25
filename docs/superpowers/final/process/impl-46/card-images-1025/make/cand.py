import sys, json, asyncio, asyncpg
from cover import *
async def cells(jobs, cell, cls=None, n=12, minn=3):
    c = await asyncpg.connect(DSN)
    q = f"""select floor(ST_X(p)/{cell})*{cell}+{cell/2} cx, floor(ST_Y(p)/{cell})*{cell}+{cell/2} cy, count(*) n, avg(conf) conf
      from (select ST_Transform(ST_PointOnSurface(geom),5186) p, conf from detections where job_id = any($1) {"and cls = any($2)" if cls else ""}) x
      group by 1,2 having count(*)>={minn} order by n desc limit {n}"""
    r = await c.fetch(q, jobs, *( [cls] if cls else []))
    await c.close(); return [dict(x) for x in r]
def dets_sql(jobs_param="$1"):
    return f"select ST_AsBinary(ST_Transform(geom,5186)) g, cls, conf from detections where job_id = any({jobs_param}) and geom && ST_Transform(ST_MakeEnvelope($2,$3,$4,$5,5186),4326)"
def sheet(imgs, cols=4, tw=300):
    th = int(tw * imgs[0].size[1] / imgs[0].size[0]); rows = (len(imgs) + cols - 1) // cols
    s = Image.new("RGB", (cols * tw, rows * th), "white"); d = ImageDraw.Draw(s)
    for i, im in enumerate(imgs):
        s.paste(im.resize((tw, th)), ((i % cols) * tw, (i // cols) * th)); d.text(((i % cols) * tw + 6, (i // cols) * th + 4), str(i), font=font(22), fill="red")
    return s
