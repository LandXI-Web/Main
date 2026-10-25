"""3단계: 필지별 피복 · 변화 유형 · 허가 대상 → change_parcels.geojson · summary.json · 자기검증. 공식 이름 직접 매핑(묶음 없음)."""
import sys, json, math, time, datetime
from pathlib import Path
import numpy as np, geopandas as gpd, pandas as pd
from rasterio.features import rasterize
from rasterio.transform import from_origin
from shapely.geometry import box
sys.path.insert(0, "E:/도로공사/deck_anseong/_src"); import window as W
OUT = Path("E:/도로공사/deck_anseong/v3-color"); t0 = time.time()
NAMES = {0: "비대상지", 1: "건물", 2: "주차장", 3: "도로", 4: "가로수", 5: "논", 6: "비닐하우스", 7: "밭", 8: "활엽수림", 9: "침엽수림", 10: "나지", 11: "수역"}
FARM = [5, 6, 7]; TO_FAC = [1, 2, 10]; MTN = [8, 9, 11]; TO_CUT = [10, 1]; ROAD = 3; SKIP = [0, 4]; MIN = 300.0
PERMIT = {"전", "답", "과", "임", "천", "구", "유", "하천", "구거", "유지"}
c19 = np.load(OUT / "_src" / "win_2019.npy").astype(np.int64); c25 = np.load(OUT / "_src" / "win_2025.npy").astype(np.int64)
G = gpd.read_file(OUT / "_src" / "parcels_3857.gpkg"); n = len(G)
xmin, ymin, xmax, ymax = W.merc_bounds(); px = W.TILE_M / 256; tf = from_origin(xmin, ymax, px, px)
H, Wd = c19.shape
R = 6378137.0; ymerc = ymax - (np.arange(H) + 0.5) * px
lat = np.degrees(2 * np.arctan(np.exp(ymerc / R)) - np.pi / 2)
rowarea = ((px * np.cos(np.radians(lat))) ** 2).astype(np.float64)       # 줄마다 땅 위 실제 한 픽셀 면적(㎡)
lab = rasterize([(g, i + 1) for i, g in enumerate(G.geometry)], out_shape=(H, Wd), transform=tf, fill=0, dtype=np.int32)
cnt = np.bincount(lab.ravel(), minlength=n + 1)[1:]
miss = np.where(cnt == 0)[0]                                            # 한 픽셀도 못 받은 작은 필지 → 닿는 픽셀로 보충
for i in miss:
    one = rasterize([(G.geometry.iloc[i], 1)], out_shape=(H, Wd), transform=tf, fill=0, dtype=np.uint8, all_touched=True)
    lab[(one == 1) & (lab == 0)] = i + 1
m = lab > 0; L = lab[m].astype(np.int64); RA = np.broadcast_to(rowarea[:, None], (H, Wd))[m]
a = c19[m]; b = c25[m]
pair = np.bincount(L * 144 + a * 12 + b, weights=RA, minlength=(n + 1) * 144).reshape(n + 1, 12, 12)[1:]   # 필지 × 2019 × 2025 (㎡)
tot = pair.sum((1, 2)); m19 = pair.sum(2); m25 = pair.sum(1)
def S(src, dst): return pair[:, src][:, :, dst].sum((1, 2))
valid = np.ones((12, 12), bool); valid[SKIP, :] = False; valid[:, SKIP] = False; np.fill_diagonal(valid, False)
changed = (pair * valid).sum((1, 2))
A1, A2, A3 = S(FARM, TO_FAC), S(MTN, TO_CUT), S(FARM, [ROAD])
A_other = np.maximum(changed - A1 - A2 - A3, 0)
chg = np.where(A1 >= MIN, "농지→시설야적", np.where(A2 >= MIN, "산지하천변→절토야적", np.where(A3 >= MIN, "농지→도로", np.where(A_other >= MIN, "기타변화", "변화없음"))))
chg[tot == 0] = "변화없음"
j = G["jimok"].fillna("")
permit = (chg != "변화없음") & j.isin(PERMIT).values
def major(M): 
    k = M.argmax(1); return [NAMES[v] if t > 0 else None for v, t in zip(k, tot)], np.round(M.max(1) / np.maximum(tot, 1e-9) * 100, 1)
mj19, pc19 = major(m19); mj25, pc25 = major(m25)
G4 = G.to_crs(4326); fts = []
import shapely
for i in range(n):
    bnd = G.geometry.iloc[i].bounds
    pb = [round((bnd[0] - xmin) / px, 1), round((ymax - bnd[3]) / px, 1), round((bnd[2] - xmin) / px, 1), round((ymax - bnd[1]) / px, 1)]
    props = {"pnu": G.pnu.iloc[i], "jimok": G.jimok.iloc[i], "area_m2": float(G.area_m2.iloc[i]), "lc19_major": mj19[i], "lc25_major": mj25[i],
             "lc19_pct": float(pc19[i]), "lc25_pct": float(pc25[i]), "chg_type": str(chg[i]), "permit_check": bool(permit[i]), "pix_bbox": pb}
    fts.append({"type": "Feature", "properties": props, "geometry": json.loads(shapely.to_geojson(G4.geometry.iloc[i]))})
(OUT / "change_parcels.geojson").write_text(json.dumps({"type": "FeatureCollection", "name": "change_parcels", "crs": {"type": "name", "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"}}, "features": fts}, ensure_ascii=False), encoding="utf-8")
# ── 자기검증
P5 = G.to_crs(5179); road = G[chg == "농지→도로"]
mg = gpd.read_file(OUT / "_src" / "master_gpkg_window.gpkg").to_crs(3857)
mg_in = mg[mg.geometry.intersection(box(xmin, ymin, xmax, ymax)).area > 1.0]       # 창 안에 면적이 있는 마스터 필지
def hit(geoms, tol): 
    u = mg_in.geometry.buffer(tol).union_all(); return geoms.intersects(u)
nb = {}
for name, tol in (("겹침", 0.0), ("겹침 또는 맞닿음(1m)", 1.0)):
    h = hit(road.geometry, tol); nb[name] = {"필지": int(h.sum()), "비율_%": round(100 * float(h.mean()), 1) if len(road) else None}
# 이음새: 타일 줄(256픽셀)에서 이웃 픽셀 클래스가 달라지는 비율 ÷ 보통 줄에서 달라지는 비율
def seam(c):
    dx = (c[:, 1:] != c[:, :-1]).mean(0); dy = (c[1:, :] != c[:-1, :]).mean(1)
    bx = [k for k in range(255, c.shape[1] - 1, 256)]; by = [k for k in range(255, c.shape[0] - 1, 256)]
    ix = np.delete(dx, bx); iy = np.delete(dy, by)
    return {"타일줄 x 달라짐": round(float(dx[bx].mean()), 5), "그 밖 x": round(float(ix.mean()), 5), "타일줄 y": round(float(dy[by].mean()), 5), "그 밖 y": round(float(iy.mean()), 5),
            "비(타일줄÷그 밖)": round(float((dx[bx].mean() / ix.mean() + dy[by].mean() / iy.mean()) / 2), 3)}
def pyr(c):   # 큰 판 추론 칸 줄(보폭 512 · 창 격자 환산)도 같이 — 추론 칸은 0.255m 격자라 창 격자 환산 간격 = 512*0.255/0.954
    return None
seams = {"2019": seam(c19), "2025": seam(c25)}
tc = {k: int((chg == k).sum()) for k in ["농지→시설야적", "산지하천변→절토야적", "농지→도로", "기타변화", "변화없음"]}
ta = {k: round(float(P5.geometry.area[chg == k].sum()), 0) for k in tc}
info = json.loads((OUT / "_src" / "s2.json").read_text(encoding="utf-8")); s1 = json.loads((OUT / "_src" / "s1.json").read_text(encoding="utf-8"))
summ = {"실행 시각": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"), "모델": info["model"], "입력": info["입력"],
        "필지 수": n, "chg_type별 필지 수": tc, "chg_type별 필지 면적_m2(필지 전체 면적 합)": ta, "permit_check 수": int(permit.sum()),
        "클래스 매핑": {"번호→공식 이름": {str(k): v for k, v in NAMES.items()},
                    "농지": [5, 6, 7], "시설야적 쪽(이후)": {"건물": 1, "주차장": 2, "나지": 10, "야적/시설": "클래스 없음(0)"}, "산지하천변(이전)": {"산림": [8, 9], "수역/하천변": 11, "초지": "클래스 없음(0)"}, "도로": 3, "규칙 제외": {"가로수": 4, "비대상지": 0}},
        "규칙 적용": "변화 면적 = 필지 안에서 이전 범주 → 이후 범주로 바뀐 픽셀 면적 합(실제 ㎡) ≥ 300 · 가로수·비대상지가 낀 전환은 변화로 세지 않음 · 기타변화 = 위 세 범주에 안 드는 나머지 변화",
        "창 밖 필지": "필지 통계는 창 안 픽셀만 · area_m2 는 필지 전체", "작은 필지(픽셀 0개 → 닿는 픽셀로 보충)": int(len(miss)),
        "자기검증": {"교차 필지 수 = geojson 필지 수": {"교차": s1["unique_pnu"], "geojson": n, "누락": s1["unique_pnu"] - n}, "농지→도로 필지": len(road), "토지마스터(이지목 판정 레이어) 창 안 필지": int(len(mg_in)), "농지→도로 vs 마스터": nb, "이음새": seams},
        "처리 시간": {"추론 초(2019)": info["runs"]["2019"]["추론 초"], "추론 초(2025)": info["runs"]["2025"]["추론 초"], "총 초(영상 준비 포함)": info["총 초"], "전력": info["전력"]}}
(OUT / "summary.json").write_text(json.dumps(summ, ensure_ascii=False, indent=1), encoding="utf-8")
print(json.dumps(summ, ensure_ascii=False, indent=1)[:4000], round(time.time() - t0, 1))
