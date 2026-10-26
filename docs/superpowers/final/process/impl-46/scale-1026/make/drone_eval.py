"""사료작물 넓게 보기 시험 — 끝난 작업들의 원래 결과(.raw.fgb)를 같은 규칙으로 다시 정리해(메모리 안 · DB · 파일 쓰기 0) 견준다.
같은 규칙 = 카드 신뢰도 하한 → 영상 빈 곳 자르기 → 칸 경계 붙이기(작업기 마무리와 같은 national.tidy.finalize_clean).
+ 필지 단위 묶기: 연속지적 농지 필지(전 · 답 · 과수원 · 목장용지)마다 결과가 덮은 비율 → 비율 ≥ SHARE 이면 그 필지 = 그 작물.
  python drone_eval.py growth|production OUT.json JOB[:TAG] ...  → 결과 도형은 OUT 옆 .gpkg 대신 .pkl(그림용)"""
import sys, os, json, pickle
from pathlib import Path
SERVER = Path(r"E:\Land-XI 플랫폼\01. 디자인\server"); sys.path.insert(0, str(SERVER)); os.chdir(SERVER); sys.stdout.reconfigure(encoding="utf-8")
from landxi_api import config, result_store as R, valid_area as VA
from national import tidy as T
import psycopg, shapely, numpy as np
from shapely import wkb
from shapely.ops import unary_union, transform as sh_tr
from pyproj import Transformer
CONF = {"growth": 0.8, "production": 0.6}          # 카드 하한(cards8-1026)
SHARE = 0.3
kind, OUT = sys.argv[1], sys.argv[2]
jobs = [a.split(":") for a in sys.argv[3:]]
EPSG = 5186
to_m = Transformer.from_crs(4326, EPSG, always_xy=True).transform
res = {"kind": kind, "conf_min": CONF[kind], "share": SHARE, "runs": {}}
geo = {}
with psycopg.connect(config.PG_DSN) as c:
    c.execute("SELECT set_config('app.realm','lx',false), set_config('app.tenant_id','',false), set_config('app.user_id','',false)")
    iid, aoi = c.execute("SELECT imagery_id, ST_AsBinary(aoi) FROM jobs WHERE id=%s", (jobs[0][0],)).fetchone()
    aoi4326 = wkb.loads(bytes(aoi))
    vg = VA.load(iid)
    zone = aoi4326 if vg is None else aoi4326.intersection(vg)
    rows = c.execute("SELECT pnu, jimok_nm, ST_AsBinary(geom) FROM survey_parcels WHERE jimok_nm = ANY(%s) AND ST_Intersects(geom, ST_GeomFromWKB(%s,4326))",
                     (["전", "답", "과수원", "목장용지"], shapely.to_wkb(zone))).fetchall()
zone_m = sh_tr(to_m, zone)
parcels = []
for pnu, jm, g in rows:
    gm = sh_tr(to_m, wkb.loads(bytes(g)))
    if gm.area > 0 and gm.intersection(zone_m).area >= 0.8 * gm.area:
        parcels.append((pnu, jm, gm))
tree = shapely.STRtree([p[2] for p in parcels])
res["parcels"] = len(parcels); res["zone_km2"] = round(zone_m.area / 1e6, 3)
for jid, *tg in jobs:
    tag = tg[0] if tg else jid
    b = R.base("lx", jid)
    raw = b.with_name(b.name + ".raw.fgb")
    src = raw if raw.exists() else R.vector_of_base(b)
    g4, props = T.read_raw(src)
    feats = [{"geom": T._valid(g), "props": p} for g, p in zip(g4, props)]
    n0 = len(feats)
    feats = [f for f in feats if float(f["props"].get("conf") or 0) >= CONF[kind]]
    n1 = len(feats)
    if vg is not None and feats:
        feats, _ = VA.clip_feats(feats, vg, EPSG, min_area=4.0, clip=True)
    out, rec = T.finalize_clean(feats, task="seg", epsg=EPSG)
    gm = [sh_tr(to_m, f["geom"]) for f in out]
    cls = [f["props"]["cls"] for f in out]
    areas = np.array([g.area for g in gm]) if gm else np.zeros(0)
    by = {}
    for g, k in zip(gm, cls):
        d = by.setdefault(k, {"n": 0, "m2": 0.0}); d["n"] += 1; d["m2"] += g.area
    # 필지 묶기
    plab = {}
    if gm:
        for k in set(cls):
            u = unary_union([g for g, kk in zip(gm, cls) if kk == k])
            for i in tree.query(u, predicate="intersects"):
                pnu, jm, pg = parcels[int(i)]
                sh = pg.intersection(u).area / pg.area
                if sh >= SHARE and sh > plab.get(pnu, (None, 0))[1]:
                    plab[pnu] = (k, round(sh, 3))
    res["runs"][tag] = {"job": jid, "raw": n0, "after_conf": n1, "objects": len(out), "seam": rec.get("seam"),
                        "by_cls": {k: {"n": v["n"], "ha": round(v["m2"] / 1e4, 2)} for k, v in by.items()},
                        "median_m2": round(float(np.median(areas)), 1) if len(areas) else None,
                        "p90_m2": round(float(np.percentile(areas, 90)), 1) if len(areas) else None,
                        "parcels_labeled": len(plab), "parcels_by_cls": {k: sum(1 for v in plab.values() if v[0] == k) for k in set(cls)}}
    geo[tag] = {"objs": [(g, k, float(f["props"].get("conf") or 0)) for g, k, f in zip(gm, cls, out)], "plab": plab}
    print(tag, json.dumps(res["runs"][tag], ensure_ascii=False), flush=True)
# 설정끼리 겹침(같은 땅을 같은 작물로 본 넓이 비율)
tags = list(geo)
res["agree"] = {}
for i in range(len(tags)):
    for j in range(i + 1, len(tags)):
        a = unary_union([g for g, _, _ in geo[tags[i]]["objs"]]) if geo[tags[i]]["objs"] else None
        bb = unary_union([g for g, _, _ in geo[tags[j]]["objs"]]) if geo[tags[j]]["objs"] else None
        if a is None or bb is None:
            continue
        res["agree"][f"{tags[i]}~{tags[j]}"] = {"iou": round(a.intersection(bb).area / a.union(bb).area, 3),
                                                 "a_in_b": round(a.intersection(bb).area / a.area, 3), "b_in_a": round(a.intersection(bb).area / bb.area, 3)}
json.dump(res, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
pickle.dump({"geo": geo, "parcels": parcels, "zone": zone_m, "imagery": iid, "epsg": EPSG}, open(Path(OUT).with_suffix(".pkl"), "wb"))
print(json.dumps(res["agree"], ensure_ascii=False))
