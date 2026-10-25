"""탐지 카드 공통 — 작업 결과(detections)를 같은 영상 위에"""
from cand import *
DSQL = "select ST_AsBinary(ST_Transform(geom,5186)) g, cls, conf from detections where job_id = any($1) and ($6::text[] is null or cls = any($6)) and conf >= $7 and geom && ST_Transform(ST_MakeEnvelope($2,$3,$4,$5,5186),4326)"
def det_make(path, jobs, cx, cy, wm, colors, legend=None, cls=None, minconf=0.0, fa=95, width=3, srs_w=600):
    bb = half_bbox(cx, cy, wm)
    L = read_rgb(path, bb, 600, 900)
    rows = run(geoms(DSQL, jobs, *bb, cls, minconf))
    items = [(g, {"fill": colors.get(r["cls"], "#0FA9A0"), "fa": fa, "line": colors.get(r["cls"], "#0FA9A0"), "width": width, "halo": "#FFFFFF", "ha": 140}) for g, r in rows]
    R = draw(L, items, bb)
    return compose(L, R, legend=legend), len(rows)
def cand_sheet(name, path, jobs, cell, wm, colors, legend=None, cls=None, n=12, minn=3, minconf=0.0, cols=4):
    cs = run(cells(jobs, cell, cls=cls, n=n, minn=minn))
    ims = [det_make(path, jobs, c["cx"], c["cy"], wm, colors, legend, cls, minconf)[0] for c in cs]
    json.dump(cs, open(f"{name}_cells.json", "w"))
    sheet(ims, cols=cols).save(f"{name}_sheet.jpg", quality=85)
    return cs
