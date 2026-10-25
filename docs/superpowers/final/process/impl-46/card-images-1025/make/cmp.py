from cover import *
from shapely.geometry import shape
from shapely.ops import transform as stx
from pyproj import Transformer
T = Transformer.from_crs(4326, 5186, always_xy=True).transform
J = json.load(open("E:/Land-XI 플랫폼/02. 데이터/compare/job_01M5R76BKYBANCRZ61WTC6536W.json", encoding="utf-8"))
FE = [(stx(T, shape(f["geometry"])), f["properties"]["status"]) for f in J["geo"]["features"]]
COL = {'같은 작물': '#0FA9A0', '작물 바뀜': '#FFB633', '수확·곤포 확인': '#006DF7', '생산기에 없음': '#F04452', '생산기에만 있음': '#727780'}
A, B = "cog/std/namwon-2025-04-geumji-1.tif", "imagery/namwon/2025-06/nw_2506_cog.tif"
def make(cx, cy, wm):
    bb = half_bbox(cx, cy, wm)
    from shapely.geometry import box
    bx = box(*bb)
    it = [(g, {"fill": COL[s], "fa": 45, "line": COL[s], "width": 4, "halo": "#FFFFFF", "ha": 150}) for g, s in FE if g.intersects(bx)]
    La, Lb = read_rgb(A, bb, 600, 900), read_rgb(B, bb, 600, 900)
    st = sorted({s for g, s in FE if g.intersects(bx)}, key=list(COL).index)
    return compose(draw(La, it, bb), draw(Lb, it, bb), labels=("4월", "6월"), legend=[(COL[s], s) for s in st])
if __name__ == "__main__":
    import collections
    print(collections.Counter(s for _, s in FE))
    cells = collections.defaultdict(list)
    for g, s in FE:
        c = g.centroid; cells[(int(c.x // 200), int(c.y // 200))].append(s)
    top = sorted(cells.items(), key=lambda kv: (-len(set(kv[1])), -len(kv[1])))[:8]
    print([(k, collections.Counter(v)) for k, v in top])
    ims = [make(k[0] * 200 + 100, k[1] * 200 + 100, 200) for k, v in top]
    json.dump([[k[0] * 200 + 100, k[1] * 200 + 100] for k, v in top], open("cmp_cells.json", "w"))
    from cand import sheet
    sheet(ims).save("cmp_sheet.jpg", quality=85)
