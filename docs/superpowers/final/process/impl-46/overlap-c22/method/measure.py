"""겹침 정리 전후 — 남원 2025 전국 분석(농지) 경작지 · 2023 LX 분석(칸 경계 붙이기 시험 · 쓰지 않음). 읽기 전용(정리 기록 · 파일 · DB 읽기만).
OVERLAP-DESIGN 의 ana.py 와 같은 정의: 겹친 쌍 = 같은 분류 · 교차 > 1㎡ · 비율 = 교차 / 작은 쪽.  python measure.py → stats-c22.json"""
import json, sys, time
from collections import Counter, defaultdict
from pathlib import Path
import numpy as np, shapely
sys.path.insert(0, r"E:/Land-XI 플랫폼/01. 디자인/server")
from national import tidy as T
from landxi_api.result_store import base, vector_of_base

H = Path(__file__).parent
SGG = sys.argv[1] if len(sys.argv) > 1 else "52190"


def load(which):
    with T._pg() as c:
        jobs = T._sgg_jobs(c, "farm", 2025, SGG)
    L = []
    for jb in jobs:
        b = base("lx", jb["job"])
        p = T.raw_path(b) if which == "before" else vector_of_base(b)
        g4, pr = T.read_raw(p)
        gm = T.to_metric([T._valid(g) for g in g4]) if g4 else []
        for g, q in zip(gm, pr):
            if q.get("cls") == "경작지" and g is not None and not g.is_empty:
                L.append(dict(id=q.get("id"), shard=q.get("shard_id"), job=jb["job"], cell=jb["cell"], g=g))
    return L


def kind(a, b):
    if a["job"] != b["job"]:
        return "다른 읍면동 칸" if a["cell"] != b["cell"] else "같은 읍면동 다른 조각"
    return "같은 칩" if a["shard"] == b["shard"] else "다른 칩(칸 경계)"


def stats(L):
    G = np.array([o["g"] for o in L], dtype=object)
    A = shapely.area(G)
    i, j = shapely.STRtree(G).query(G, predicate="intersects")
    m = i < j
    i, j = i[m], j[m]
    ia = shapely.area(shapely.intersection(G[i], G[j]))
    k = ia > 1.0
    i, j, ia = i[k], j[k], ia[k]
    r = ia / np.minimum(A[i], A[j])
    kinds, big = Counter(), Counter()
    for a, b, rr in zip(i, j, r):
        kd = kind(L[a], L[b])
        kinds[kd] += 1
        if rr >= 0.1:
            big[kd] += 1
    U = A.sum() - ia.sum()
    return dict(n=len(L), sum_km2=round(A.sum() / 1e6, 3), union_km2=round(float(U) / 1e6, 3), excess_pct=round((A.sum() - U) / A.sum() * 100, 2),
                pairs=int(len(i)), ratio_bins={"<10%": int((r < 0.1).sum()), "10–50%": int(((r >= 0.1) & (r < 0.5)).sum()), "≥50%": int((r >= 0.5).sum())},
                kinds=dict(kinds), kinds_ge10=dict(big), overlap_km2=round(float(ia.sum()) / 1e6, 3)), (G, A, i, j, r)


def parcels(L, G, A, i, j, r, P):
    PG = np.array([p["g"] for p in P], dtype=object)
    PA = shapely.area(PG)
    oi, pi = shapely.STRtree(PG).query(G, predicate="intersects")
    ia = shapely.area(shapely.intersection(G[oi], PG[pi]))
    share = ia / A[oi]
    home = {int(o): int(p) for o, p, s in zip(oi, pi, share) if s >= 0.5}
    per = defaultdict(list)
    for o, p in home.items():
        per[p].append(o)
    pr = {(int(a), int(b)): float(x) for a, b, x in zip(i, j, r)}
    cat = Counter()
    rank = {"겹친 중복": 4, "칸 경계에서 잘림": 3, "붙어 있음(같은 칩)": 2, "떨어진 여러 경작지": 1}
    for p, objs in per.items():
        if len(objs) < 2:
            continue
        objs = sorted(objs)
        c = "떨어진 여러 경작지"
        for x in range(len(objs)):
            for y in range(x + 1, len(objs)):
                a, b = objs[x], objs[y]
                if pr.get((a, b), 0.0) >= 0.1:
                    cc = "겹친 중복"
                else:
                    dd = shapely.distance(G[a], G[b])
                    cc = ("칸 경계에서 잘림" if (L[a]["shard"] != L[b]["shard"] or L[a]["job"] != L[b]["job"]) else "붙어 있음(같은 칩)") if dd < 0.5 else "떨어진 여러 경작지"
                if rank[cc] > rank[c]:
                    c = cc
        cat[c] += 1
    dist = Counter(min(len(v), 5) for v in per.values())
    cover = []
    for p, objs in per.items():
        cover.append(float(shapely.area(shapely.union_all(G[objs]))) / PA[p])
    return dict(parcels_with_crop=len(per), multi=sum(v for kk, v in dist.items() if kk >= 2), causes=dict(cat),
                crop_area_in_parcels_km2=round(sum(float(shapely.area(shapely.intersection(shapely.union_all(G[objs]), PG[p]))) for p, objs in per.items()) / 1e6, 3),
                cover_gt1=sum(1 for v in cover if v > 1.0001))


def seam_2023():
    """2023 LX 분석(실태조사 결합에 쓰는 결과) — 새 분석 규칙(칸 경계 붙이기)을 적용하면 '칸 경계 10~50%' 1,071 쌍이 어떻게 되나(시험 · DB 는 바꾸지 않음)."""
    import psycopg
    from national.common import pg
    with pg() as c:
        c.execute("SET default_transaction_read_only = on")
        c.execute("SELECT set_config('app.realm','lx',false), set_config('app.tenant_id','',false)")
        rows = c.execute("SELECT id, cls, conf, shard_id, chip_edge, ST_AsBinary(geom) FROM detections WHERE job_id=%s AND coalesce(edit_state,'raw')<>'deleted'",
                         ("job_01M3PHP0GQAP0NV87VFWHPP77G",)).fetchall()
    g4 = shapely.from_wkb([bytes(r[5]) for r in rows])
    gm = list(T.to_metric([T._valid(g) for g in g4]))
    props = [dict(id=str(r[0]), cls=r[1], conf=r[2], shard_id=r[3], chip_edge=r[4]) for r in rows]
    out = {}
    for tag, (G2, P2) in {"before": (gm, props)}.items():
        pass
    mg, mp, st, cands = T.seam_merge(gm, props)

    def crop_pairs(G2, P2):
        L = [dict(id=p.get("id"), shard=p.get("shard_id"), job="B", cell="B", g=g) for g, p in zip(G2, P2) if p.get("cls") == "경작지" and not g.is_empty]
        return stats(L)[0]
    out["before"] = crop_pairs(gm, props)
    out["after"] = crop_pairs(mg, mp)
    out["seam"] = st
    out["candidates_crop"] = sum(1 for x in cands if x["cls"] == "경작지")
    return out


if __name__ == "__main__":
    t0 = time.time()
    from national.common import pg
    with pg() as c:
        c.execute("SELECT set_config('app.realm','lx',false), set_config('app.tenant_id','',false)")
        rows = c.execute("SELECT pnu, ST_AsBinary(geom) FROM survey_parcels WHERE sgg_cd=%s", (SGG,)).fetchall()
    P = [dict(pnu=r[0], g=g) for r, g in zip(rows, T.to_metric(shapely.from_wkb([bytes(r[1]) for r in rows])))]
    res = {"sgg": SGG}
    for w in ("before", "after"):
        L = load(w)
        s, (G, A, i, j, r) = stats(L)
        s["parcel"] = parcels(L, G, A, i, j, r, P)
        res[w] = s
        print(w, json.dumps(s, ensure_ascii=False), flush=True)
    if SGG == "52190":
        res["b2023"] = seam_2023()
        print("2023", json.dumps(res["b2023"], ensure_ascii=False), flush=True)
    res["sec"] = round(time.time() - t0)
    (H.parent / f"stats-c22-{SGG}.json").write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
