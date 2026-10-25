from cand import *
import numpy as np
P, V = "job_01M5PYK3BR4697HEYZS80HRVZ9", "job_01M5PYT4PCY4RN0YGMXHKCW1AE"
PATH = "cog/std/chunhyang-2025-lx4.tif"
PSQL = "select ST_X(p) x, ST_Y(p) y, ST_AsBinary(p) g from (select ST_Transform(ST_Centroid(geom),5186) p from detections where job_id=$1 and geom && ST_Transform(ST_MakeEnvelope($2,$3,$4,$5,5186),4326)) z"
HEAT = ["#FFE08A", "#FFB633", "#FF7A1A", "#F04452", "#B5179E"]
def make(cx, cy, wm, cell=8):
    bb = half_bbox(cx, cy, wm)
    base = read_rgb(PATH, bb, 150, 225).resize((600, 900), Image.BILINEAR).filter(ImageFilter.GaussianBlur(2.2))   # 사람 알아볼 수 없게(원칙 331) — 4배 줄였다 늘리고 흐리게
    ppl = run(geoms(PSQL, P, *bb)); car = run(geoms(PSQL, V, *bb))
    from shapely.geometry import box
    nx, ny = int((bb[2]-bb[0]) // cell) + 1, int((bb[3]-bb[1]) // cell) + 1
    grid = np.zeros((ny, nx), int)
    for g, r in ppl:
        i, j = int((r["y"]-bb[1]) // cell), int((r["x"]-bb[0]) // cell)
        if 0 <= i < ny and 0 <= j < nx: grid[i, j] += 1
    it = []
    for i in range(ny):
        for j in range(nx):
            n = grid[i, j]
            if n <= 0: continue
            k = 0 if n < 3 else 1 if n < 6 else 2 if n < 10 else 3 if n < 16 else 4
            it.append((box(bb[0]+j*cell, bb[1]+i*cell, bb[0]+(j+1)*cell, bb[1]+(i+1)*cell), {"fill": HEAT[k], "fa": 120 + 22*k}))
    R = draw(base, it, bb)
    R = draw(R, [(g, {"fill": "#3182F6", "fa": 255, "r": 6, "line": "#FFFFFF", "width": 1.5}) for g, r in car], bb)
    return compose(base, R, legend=[("#F04452", "사람 밀집"), ("#3182F6", "차량")]), len(ppl), len(car)
