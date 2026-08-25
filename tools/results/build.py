# -*- coding: utf-8 -*-
"""GeoJSON 산출 + 100m 격자 + 통계(results.js) + 중첩 분석 근거."""
import sys, io, os, json, math
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
import numpy as np, pandas as pd, geopandas as gpd
from shapely.geometry import box
from shapely import make_valid

SRC = r"F:\Land-XI 플랫폼\02. 데이터"
REPO = r"F:\Land-XI 플랫폼\01. 디자인"
OUT = os.path.join(REPO, "landxi", "assets", "data", "geo", "results")
SCR = os.path.dirname(os.path.abspath(__file__))
os.makedirs(OUT, exist_ok=True)

DEFS = [
    dict(id="namwon-farmland-2025", file="25년 남원시 농지이용 현황(드론).gpkg", layer="union",
         title="남원시 농지이용 현황", year=2025, sensor="drone", region="전북 남원시",
         service="farmland", tol=0.5, grid=False, unit="필지",
         what="농경지/비경작지 필지 단위 이용 분류 (드론 정사영상 + AI 세그멘테이션, PNU 필지 경계와 결합)",
         keep={"id": "id", "className": "cls", "classId": "cid", "confidence": "conf", "sam_score": "sam",
               "areaM2": "area", "PNU": "pnu", "EMD": "emd", "n_obj": "nobj"}),
    dict(id="namwon-greenhouse-2025", file="25년 남원시 비닐하우스 조사(드론).gpkg", layer="union",
         title="남원시 비닐하우스 조사", year=2025, sensor="drone", region="전북 남원시",
         service="greenhouse", tol=0.4, grid=False, unit="필지",
         what="비닐하우스 단동/다동 필지 단위 집계 (드론 정사영상 + AI 탐지, 필지별 union)",
         keep={"id": "id", "className": "cls", "classId": "cid", "confidence": "conf", "sam_score": "sam",
               "areaM2": "area", "PNU": "pnu", "EMD": "emd", "n_obj": "nobj"}),
    dict(id="yeosu-marine-2025-aerial", file="25년 여수시 해양쓰레기 조사(항공).gpkg", layer="detections_clipped_ref",
         title="여수시 해양쓰레기 조사(항공)", year=2025, sensor="aerial", region="전남 여수시",
         service="marine", tol=0.15, grid=True, unit="건",
         what="항공영상 기반 스티로폼 부유·적치 탐지 객체 (단일 클래스)",
         keep={"id": "id", "className": "cls", "classId": "cid", "confidence": "conf", "areaM2": "area"}),
    dict(id="yeosu-marine-2026-drone", file="26년 여수시 해양쓰레기 조사(드론).gpkg", layer="yeosu_2m_platform",
         title="여수시 해양쓰레기 조사(드론)", year=2026, sensor="drone", region="전남 여수시",
         service="marine", tol=0.05, grid=True, unit="건",
         what="드론 기반 해양쓰레기 8종 탐지 객체",
         keep={"id": "id", "className": "cls", "classId": "cid", "category": "cat", "confidence": "conf",
               "areaM2": "area", "hasMask": "mask", "color": "color"}),
]
FIELD_LABEL = {"id": "원본 객체 ID(SHA1 40자)", "cls": "AI 분류명", "cid": "분류 ID", "cat": "카테고리 ID",
               "conf": "AI 신뢰도(0~1)", "sam": "SAM 마스크 점수", "area": "면적(㎡)",
               "pnu": "필지고유번호(PNU 19자리)", "emd": "읍면동", "nobj": "필지 내 탐지 객체 수",
               "mask": "세그먼트 마스크 보유", "color": "원본 표출 색상"}


def dump(gdf, path, precision=6):
    """GeoJSON 기록. 좌표 6자리(≈0.11m)로 반올림하면 사라지는 초미세 잔여 폴리곤은
    `coordinates: []` 로 남는데, 그런 피처는 지도에 그릴 수 없으므로 버리고 건수를 돌려준다."""
    gdf.to_file(path, driver="GeoJSON", COORDINATE_PRECISION=precision, RFC7946="NO", WRITE_BBOX="NO")
    with open(path, "r", encoding="utf-8") as f:
        j = json.load(f)
    j.pop("crs", None)
    j.pop("name", None)
    kept, dropped = [], 0
    for ft in j["features"]:
        ft.pop("id", None)
        ft["properties"] = {k: v for k, v in ft["properties"].items() if v is not None}
        c = (ft.get("geometry") or {}).get("coordinates")
        if not c:
            dropped += 1
            continue
        kept.append(ft)
    j["features"] = kept
    with open(path, "w", encoding="utf-8") as f:
        json.dump(j, f, ensure_ascii=False, separators=(",", ":"))
    return os.path.getsize(path), len(kept), dropped


def camera(bbox):
    lat = (bbox[1] + bbox[3]) / 2
    w = max(bbox[2] - bbox[0], (bbox[3] - bbox[1]) / math.cos(math.radians(lat)))
    z = round(max(8.0, min(16.5, math.log2(360.0 / max(w, 1e-9)) - 0.45)), 2)
    return dict(center=[round((bbox[0] + bbox[2]) / 2, 6), round(lat, 6)], zoom=z,
                pitch=45 if z >= 11 else 35, bearing=0)


INV, RES = [], []
for d in DEFS:
    print("=" * 66)
    print(d["id"])
    g = gpd.read_file(os.path.join(SRC, d["file"]), layer=d["layer"])
    n0 = len(g)
    n_bad = int((~g.geometry.is_valid).sum())
    g["geometry"] = [x if x.is_valid else make_valid(x) for x in g.geometry]
    created = str(g["created_at"].iloc[0])
    conf = pd.to_numeric(g["confidence"], errors="coerce")
    area = pd.to_numeric(g["areaM2"], errors="coerce")
    cls_n = {k: int(v) for k, v in g["className"].value_counts().items()}
    cls_a = {k: round(float(v), 1) for k, v in g.groupby("className")["areaM2"].sum().items()}
    cls_c = {k: (None if pd.isna(v) else round(float(v), 4))
             for k, v in g.assign(_c=conf).groupby("className")["_c"].mean().items()}
    hist = np.histogram(conf.dropna().values, bins=10, range=(0.0, 1.0))[0].tolist()
    g4 = g.to_crs(4326)
    bbox = [round(float(v), 6) for v in g4.total_bounds]

    gs = g.copy()
    gs["geometry"] = gs.geometry.simplify(d["tol"], preserve_topology=True).buffer(0)
    gs = gs[~gs.geometry.is_empty & gs.geometry.notna()].to_crs(4326)
    cols = {}
    for s_c, t_c in d["keep"].items():
        s = gs[s_c]
        if t_c in ("conf", "sam"):
            s = pd.to_numeric(s, errors="coerce").round(4)
        elif t_c == "area":
            s = pd.to_numeric(s, errors="coerce").round(1)
        elif t_c in ("cid", "nobj", "cat"):
            s = pd.to_numeric(s, errors="coerce").astype("Int64")
        elif t_c == "mask":
            s = s.astype(bool)
        cols[t_c] = s
    web = gpd.GeoDataFrame(cols, geometry=gs.geometry, crs=4326)
    fn = d["id"] + ".geojson"
    size, n_web, n_drop = dump(web.copy(), os.path.join(OUT, fn))

    entry = dict(id=d["id"], title=d["title"], year=d["year"], sensor=d["sensor"], region=d["region"],
                 service=d["service"], src=d["file"], geojson="assets/data/geo/results/" + fn)

    grid_size = None
    if d["grid"]:
        gm = g.to_crs(5186)
        cen = gm.geometry.representative_point()
        cell = 100.0
        ix = np.floor(cen.x.values / cell).astype(int)
        iy = np.floor(cen.y.values / cell).astype(int)
        df = pd.DataFrame(dict(ix=ix, iy=iy, cls=g["className"].values, conf=conf.values, area=area.values))
        rows = []
        for (a, b), sub in df.groupby(["ix", "iy"]):
            shares = sub["cls"].value_counts()
            rows.append(dict(geometry=box(a * cell, b * cell, (a + 1) * cell, (b + 1) * cell),
                             count=int(len(sub)), area=round(float(sub["area"].sum()), 1),
                             conf_n=int(sub["conf"].notna().sum()),
                             mean_conf=(None if sub["conf"].notna().sum() == 0 else round(float(sub["conf"].mean()), 4)),
                             top=str(shares.index[0]), top_share=round(float(shares.iloc[0] / len(sub)), 3)))
        gr = gpd.GeoDataFrame(rows, geometry="geometry", crs=5186).to_crs(4326)
        gfn = d["id"] + "-grid100.geojson"
        grid_size, n_cells, _ = dump(gr.copy(), os.path.join(OUT, gfn))
        entry["grid"] = "assets/data/geo/results/" + gfn
        assert int(gr["count"].sum()) == n0
        print("  grid100: %d cells, %.0f KB" % (len(gr), grid_size / 1024))

    entry["stats"] = dict(
        count=n0, areaM2=round(float(area.sum()), 1), areaHa=round(float(area.sum()) / 1e4, 3),
        areaMeanM2=round(float(area.mean()), 1), areaMedianM2=round(float(area.median()), 1),
        classes=cls_n, classAreaM2=cls_a, classMeanConf=cls_c,
        confN=int(conf.notna().sum()), confNull=int(conf.isna().sum()),
        confMin=round(float(conf.min()), 4), confMax=round(float(conf.max()), 4),
        confMean=round(float(conf.mean()), 4), confMedian=round(float(conf.median()), 4),
        confHist=hist, confBins=[round(i / 10, 1) for i in range(11)],
        bbox=bbox, analyzedAt=created[:10], crsSrc="EPSG:5186", fileBytes=size, gridBytes=grid_size,
        countWeb=n_web, dropped=n_drop)
    if "EMD" in g:
        entry["stats"]["emd"] = {k: int(v) for k, v in g["EMD"].value_counts().items()}
        entry["stats"]["objTotal"] = int(g["n_obj"].sum())
    if "color" in g:
        entry["stats"]["classColors"] = {k: v for k, v in g.groupby("className")["color"].first().items()}
    entry["fields"] = {v: FIELD_LABEL[v] for v in d["keep"].values()}
    entry["camera"] = camera(bbox)
    RES.append(entry)
    INV.append(dict(id=d["id"], title=d["title"], file=d["file"], layer=d["layer"], what=d["what"],
                    unit=d["unit"], sensor=d["sensor"], region=d["region"], year=d["year"],
                    n0=n0, n_bad=n_bad, n_web=n_web, n_drop=n_drop, created=created, bbox=bbox, cls_n=cls_n, cls_a=cls_a,
                    cls_c=cls_c, hist=hist, size=size, grid_size=grid_size,
                    geom=str(g.geometry.geom_type.value_counts().to_dict()),
                    ext5186=[round(float(v), 1) for v in g.total_bounds],
                    conf_desc=dict(n=int(conf.notna().sum()), nan=int(conf.isna().sum()),
                                   mn=float(conf.min()), mx=float(conf.max()), mean=float(conf.mean()),
                                   med=float(conf.median())),
                    area_desc=dict(sum=float(area.sum()), mn=float(area.min()), mx=float(area.max()),
                                   mean=float(area.mean()), med=float(area.median())),
                    emd=({k: int(v) for k, v in g["EMD"].value_counts().items()} if "EMD" in g else None),
                    nobj=(int(g["n_obj"].sum()) if "n_obj" in g else None),
                    keep=d["keep"],
                    cols=[(c, str(g[c].dtype), int(g[c].notna().sum()), int(g[c].nunique()),
                           [str(x)[:60] for x in g[c].dropna().unique()[:4]]) for c in g.columns if c != "geometry"]))
    print("  %d건 -> %.2f MB, bbox=%s, cls=%s" % (n0, size / 1024 / 1024, bbox, cls_n))

json.dump(RES, open(os.path.join(SCR, "results.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
json.dump(INV, open(os.path.join(SCR, "inv.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1, default=str)
print("OK")
