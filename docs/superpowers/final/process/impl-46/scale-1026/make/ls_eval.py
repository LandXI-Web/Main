"""산사태 넓게 보기 — ls_cpu.py 가 만든 두 해 토지피복 지도(npz)로 설정별 '산림이 바뀐 곳'을 같은 규칙(국토 변화 change-4 · 산사태 묶음)으로 뽑아 견준다.
+ 앞 해 산림 → 뒤 해 무엇이 되었나(12분류 넓이) — 결과가 작게 나오는 까닭(묶음 규칙)을 본다.
+ 그림: 넓은 틀(지역 전체) 2020 원본 · 2025 원본 · 2025 + 결과.
  python ls_eval.py DIR OUT.json TAG ...      (첫 TAG 의 영상으로 그림)"""
import sys, os, json
import numpy as np
SERVER = r"E:\Land-XI 플랫폼\01. 디자인\server"; sys.path.insert(0, SERVER); sys.stdout.reconfigure(encoding="utf-8")
from change import detect as D
from shapely.ops import unary_union
from PIL import Image, ImageDraw, ImageFont
DIR, OUT = sys.argv[1], sys.argv[2]; tags = sys.argv[3:]
NAMES = ["비대상지", "건물", "주차장", "도로", "가로수", "논", "비닐하우스", "밭", "활엽수림", "침엽수림", "나지", "수역"]
res = {"runs": {}}
_IM = {}
def IMYA(grid):
    """임야 필지(연속지적 survey_parcels · 읽기만) → 격자 마스크(5179)"""
    key = (grid.ox, grid.oy, grid.res, grid.H, grid.W)
    if key in _IM: return _IM[key]
    import psycopg, shapely
    from shapely import wkb
    from shapely.ops import transform as tr
    from pyproj import Transformer
    from rasterio.features import rasterize
    from landxi_api import config
    T5 = Transformer.from_crs(5179, 4326, always_xy=True).transform; T4 = Transformer.from_crs(4326, 5179, always_xy=True).transform
    x0, y0 = T5(grid.ox, grid.oy - grid.H * grid.res); x1, y1 = T5(grid.ox + grid.W * grid.res, grid.oy)
    with psycopg.connect(config.PG_DSN) as c:
        c.execute("SELECT set_config('app.realm','lx',false), set_config('app.tenant_id','',false), set_config('app.user_id','',false)")
        rows = c.execute("SELECT ST_AsBinary(geom) FROM survey_parcels WHERE jimok_nm='임야' AND ST_Intersects(geom, ST_MakeEnvelope(%s,%s,%s,%s,4326))", (x0, y0, x1, y1)).fetchall()
    gs = [tr(T4, wkb.loads(bytes(r[0]))) for r in rows]
    m = rasterize(((g, 1) for g in gs), out_shape=(grid.H, grid.W), transform=grid.affine(), fill=0, dtype="uint8").astype(bool) if gs else np.zeros((grid.H, grid.W), bool)
    _IM[key] = m; return m
geo = {}
for tag in tags:
    A = np.load(f"{DIR}/{tag}-2020.npz"); B = np.load(f"{DIR}/{tag}-2025.npz")
    ca, cb = A["cls"], B["cls"]; res_m = float(A["res"])
    h, w = min(ca.shape[0], cb.shape[0]), min(ca.shape[1], cb.shape[1]); ca, cb = ca[:h, :w], cb[:h, :w]
    valid = (ca != 255) & (cb != 255)
    ga = np.where(valid, D.group_map(np.clip(ca, 0, 15)), 0); gb = np.where(valid, D.group_map(np.clip(cb, 0, 15)), 0)
    grid = D.Grid(float(A["ox"]), float(A["oy"]), res_m, h, w)
    px = res_m * res_m
    fa = valid & (ga == D.G["forest"])
    lost = fa & (gb != D.G["forest"])
    comp = {NAMES[k]: round(float(((cb == k) & lost).sum() * px / 1e4), 2) for k in range(12)}
    m = D.transitions(ga, gb, "landslide")
    polys = D.polygons(m, grid, valid, min_area=None)
    # 산림 감소 전체(묶음 규칙과 무관 · 참고) — 같은 거름
    pl_all = D.polygons({"산림 감소(전체)": lost}, grid, valid, min_area=100.0)
    areas = sorted([p.area for _, p in polys], reverse=True)
    # 후보 규칙 B — 앞 해 '산 모습'(산림 · 비대상지 · 그늘을 수역으로 본 곳) → 뒤 해 나지 · 도로 · 건물
    BAD = np.isin(gb, [D.G["other"], D.G["road"], D.G["built"]])
    mb = {"산 → 나지 · 도로 · 건물": valid & ((ga == D.G["forest"]) | (ga == 0) | (ga == D.G["water"])) & BAD}
    pb = D.polygons(mb, grid, valid, min_area=100.0)
    # 후보 규칙 C — 임야 필지(연속지적) 안에서 앞 해 나지 · 도로 · 건물이 아니던 곳 → 뒤 해 나지 · 도로 · 건물(산 여부는 지적으로 · 모델은 '벗겨짐'만)
    mc = {"임야 필지 → 나지 · 도로 · 건물": valid & IMYA(grid) & ~np.isin(ga, [D.G["other"], D.G["road"], D.G["built"]]) & BAD}
    pc = D.polygons(mc, grid, valid, min_area=100.0)
    res["runs"][tag] = {"res_m": res_m, "forest_2020_ha": round(float(fa.sum() * px / 1e4), 1),
                        "forest_lost_ha": round(float(lost.sum() * px / 1e4), 2), "lost_became_ha": comp,
                        "landslide_rule": {"n": len(polys), "ha": round(sum(areas) / 1e4, 2), "top5_m2": [round(a) for a in areas[:5]],
                                           "by": {t: sum(1 for tt, _ in polys if tt == t) for t in m}},
                        "forest_loss_any": {"n": len(pl_all), "ha": round(sum(p.area for _, p in pl_all) / 1e4, 2),
                                            "top5_m2": sorted([round(p.area) for _, p in pl_all], reverse=True)[:5]},
                        "rule_b_mountain": {"n": len(pb), "ha": round(sum(p.area for _, p in pb) / 1e4, 2), "top5_m2": sorted([round(p.area) for _, p in pb], reverse=True)[:5]},
                        "rule_c_imya": {"n": len(pc), "ha": round(sum(p.area for _, p in pc) / 1e4, 2), "top5_m2": sorted([round(p.area) for _, p in pc], reverse=True)[:5]}}
    geo[tag] = {"rule": [p for _, p in polys], "any": [p for _, p in pl_all], "b": [p for _, p in pb], "c": [p for _, p in pc], "grid": grid}
    print(tag, json.dumps(res["runs"][tag], ensure_ascii=False), flush=True)
# 설정끼리 겹침(산사태 묶음 결과)
res["agree"] = {}
for i in range(len(tags)):
    for j in range(i + 1, len(tags)):
        a, b = unary_union(geo[tags[i]]["rule"]), unary_union(geo[tags[j]]["rule"])
        if a.is_empty or b.is_empty: continue
        res["agree"][f"{tags[i]}~{tags[j]}"] = round(a.intersection(b).area / a.union(b).area, 3)
json.dump(res, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
# 그림(첫 TAG 의 영상 격자 · 2000 px 너비로 줄임)
base = tags[0].split("-")[0]
g0 = geo[tags[0]]["grid"]; z = "z18" if abs(g0.res - 0.255) < 0.01 else "z17"
FONT = ImageFont.truetype(r"C:\Windows\Fonts\malgun.ttf", 30)
def lab(im, t):
    d = ImageDraw.Draw(im); tw = d.textlength(t, font=FONT); d.rounded_rectangle([16, 16, 40 + tw, 64], 8, fill=(255, 255, 255)); d.text((28, 20), t, font=FONT, fill=(25, 31, 40)); return im
FIG = os.path.join(os.path.dirname(OUT), "fig"); os.makedirs(FIG, exist_ok=True)
for yr in (2020, 2025):
    f = f"{DIR}/rgb-{z}-{yr}-{base}.jpg"
    if not os.path.exists(f): continue
    im = Image.open(f); k = 2000 / im.width; im = im.resize((2000, int(im.height * k)), Image.LANCZOS)
    lab(im.copy(), f"{yr} 원본").save(f"{FIG}/ls-{yr}-원본.jpg", quality=88)
    if yr != 2025: continue
    for tag in tags:
        gg = geo[tag]["grid"]
        for key, col, word in (("rule", (240, 68, 82), "지금 규칙 · 산림 → 나지 · 도로 · 건물"), ("any", (250, 176, 5), "AI 산림이 줄어든 곳(전체)"),
                               ("b", (240, 68, 82), "후보 B · 산 모습 → 나지 · 도로 · 건물"), ("c", (240, 68, 82), "후보 C · 임야 필지 안 → 나지 · 도로 · 건물")):
            o = im.copy().convert("RGBA"); ov = Image.new("RGBA", o.size, (0, 0, 0, 0)); d = ImageDraw.Draw(ov)
            for p in geo[tag][key]:
                for q in getattr(p, "geoms", [p]):
                    pts = [((x - g0.ox) / g0.res * k, (g0.oy - y) / g0.res * k) for x, y in q.exterior.coords]
                    d.polygon(pts, fill=col + (90,), outline=col + (255,), width=3)
            o = Image.alpha_composite(o, ov).convert("RGB")
            lab(o, f"{tag} · {word}").save(f"{FIG}/ls-{tag}-{key}.jpg", quality=88)
print(json.dumps(res["agree"]))
