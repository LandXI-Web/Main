"""분석 서비스 카드 그림(10-25 원칙 338) — 이 서버의 실제 영상 + 실제 AI 결과로 한 틀(1200×900 · 4:3 · webp)."""
import sys, numpy as np
from gen import *
from rasterio.features import geometry_mask
from rasterio.transform import from_bounds as tfb
OUT = pathlib.Path("out"); OUT.mkdir(exist_ok=True)
ONLY = set(sys.argv[1:])
def want(k): return not ONLY or k in ONLY
NW23 = "imagery/mosaics/namwon_ap25_2023.vrt"; DR = "cog/std/img-52190-nd-drone-v2.tif"

# ① 경작·휴경 — 필지 판정(AI 경작지 비율 · 휴경·전용 의심 규칙) · 2023 25cm 항공
if want("card-farm"):
    from try_farm import PSQL, G, F
    cx, cy, wm = 220125, 309125, 240
    bb = half_bbox(cx, cy, wm); L = read_rgb(NW23, bb, 600, 900); arr = np.asarray(L).astype(float)
    it = []
    for g, r in run(geoms(PSQL, *bb)):
        if r["fal"]:
            m = ~geometry_mask([g], (900, 600), tfb(*bb, 600, 900)); px = arr[m]
            if len(px) and (px.mean() > 125 or px[:, 2].mean() > px[:, 1].mean()):   # 밝은 지붕 · 푸른 비닐 = 전용(휴경 아님) — 휴경 칸에 넣지 않는다
                continue
            it.append((g, {"fill": F, "fa": 120, "line": F, "width": 3, "halo": "#FFFFFF", "ha": 150}))
        elif (r["cr"] or 0) >= 0.5:
            it.append((g, {"fill": G, "fa": 95, "line": G, "width": 2.5, "halo": "#FFFFFF", "ha": 120}))
    save(compose(L, draw(L, it, bb), legend=[(G, "경작"), (F, "휴경")]), OUT / "card-farm.webp")

def det(key, path, jobs, cx, cy, wm, colors, legend=None, minconf=0.0, fa=95, cls=None):
    if want(key):
        im, n = det_make(path, jobs, cx, cy, wm, colors, legend, cls, minconf, fa)
        save(im, OUT / f"{key}.webp"); print(key, n)

det("card-5e85a9", NW23, ["job_01M4AT60R3DZ1Q0VKGC1R71CPF"], 246425, 311990, 170, {"비닐하우스": "#F59F00"})
det("card-6f7050", DR, ["job_01M5NW3EH2XSQAMS5A57EQ9EPD"], 256650, 315165, 90, {"비닐하우스_단동": "#F59F00", "비닐하우스_다동": "#5C7CFA"},
    legend=[("#F59F00", "단동"), ("#5C7CFA", "다동")], minconf=0.8)
det("card-2c5304", DR, ["job_01M5NW3F8688S6XF0RX5ZG0DQH"], 256590, 313762, 55, {"차량": "#D6336C"}, minconf=0.5, fa=70)
det("card-45424f", "imagery/mosaics/ap25_2023_51130.vrt", ["job_01M4ARMQDXBZKXVQKBVBYSKV59"], 276825, 513975, 150, {"건물": "#3182F6"}, fa=110)
det("card-389c45", "imagery/mosaics/ap25_2023_41670.vrt", ["job_01M4ARJ76ARDGB04EAF8QP591P"], 262900, 508950, 170, {"주차장": "#8B5CF6"}, fa=110)
det("card-d8fc01", "imagery/namwon/2025-06/nw_2506_cog.tif", ["job_01M5RBX85XEVANJZ0QPMNEEH1J"], 227060, 301888, 36, {"곤포사일리지": "#B07A3A"}, minconf=0.9, fa=130)
FEED = {"IRG": "#74B816", "호밀": "#E8590C", "옥수수": "#F59F00", "수단그라스": "#AE3EC9"}
det("card-4d8d6f", "cog/std/namwon-2025-04-geumji-1.tif", ["job_01M5Q21ZHFPT6F3TC22KKTWRBM"], 226625, 302375, 200, FEED, legend=[("#74B816", "IRG")])
det("card-f31e5f", "imagery/namwon/2025-06/nw_2506_cog.tif", ["job_01M5Q2202Q8D5CCKZVYZ7GE1AH"], 226375, 302125, 200, FEED, legend=[("#74B816", "IRG")])

if want("card-ba9d6d"):
    import cmp as CM
    save(CM.make(226634.9, 302229.2, 140), OUT / "card-ba9d6d.webp")
if want("card-change") or want("card-landslide"):
    import chg as CH
    if want("card-change"):
        save(CH.make("job_01M5HAG21ED9RXTEQMNGTGZK74", 2019, 2024, 935300, 1682900, 200, minm2=150, zoom=17), OUT / "card-change.webp")
    if want("card-landslide"):
        save(CH.make("job_01M5R4NDS3537AB5QHQHHZ4YJM", 2020, 2025, 995125, 1707875, 260), OUT / "card-landslide.webp")
if want("card-crowd"):
    import crowd as CR
    im, n, v = CR.make(234885, 311925, 180); save(im, OUT / "card-crowd.webp"); print("crowd", n, v)
if want("card-marine"):
    src = Image.open("E:/Land-XI 플랫폼/01. 디자인/landxi/v3/service-detail/data/img/marine-drone/1@2x.jpg").convert("RGB")
    x0, y0 = 90, 50; im = src.crop((x0, y0, x0 + 680, y0 + 510)).resize((W, H), Image.LANCZOS)
    ov = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(ov); pill(d, (W // 2, H - 92), "AI 결과", font(30))
    o = im.convert("RGBA"); o.alpha_composite(ov); save(o.convert("RGB"), OUT / "card-marine.webp")
# 모델 · 결과가 없는 카드(생활환경 · 도로 · 산림 · 해외 둘)는 그림을 올리지 않는다 — 갤러리의 같은 틀 빈 칸 그대로(지어낸 결과 0)
