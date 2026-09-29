"""후처리(P4 p4_merge.py 실측 규칙 = 정본) + 전역 NMS + J1 정답 대비 P/R.

순서: (미터 CRS) simplify 0.3 m → 4 m² 미만 제거 → 동일 클래스 겹침(작은 쪽 면적 대비 50% 초과) → 낮은 conf 제거(= 전역 NMS)
→ 작업 시군구의 법정 읍면동(regions.emd_index · V-World LT_C_ADEMD_INFO 캐시)으로 대표점이 읍면동 안인 것만 + emd/emd_cd.
   시군구 = sgg_cd 인자 → 작업 옵션(sgg_cd) → 작업 영상의 sgg_cd → 결과 대표점이 속한 시군구 순. 작업 시군구 경계를 못 받으면
   점마다 그 점의 시군구 경계로 붙이고, 어느 읍면동에도 없으면 '관할 밖'(emd_cd 없음). 남은 빈칸은 fill_blank() 가 뒤따라 채운다.
OBB(차량)는 꼭짓점 4개라 simplify 를 건너뛴다. 지역 문자열 하드코딩 0.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from pyproj import Transformer
from shapely import STRtree
from shapely.geometry import shape
from shapely.ops import transform as sh_transform

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from landxi_api import config  # noqa: E402,F401


def metric_epsg(lng: float, lat: float) -> int:
    if 124 <= lng <= 132 and 33 <= lat <= 39:
        return 5186
    zone = int((lng + 180) // 6) + 1
    return (32600 if lat >= 0 else 32700) + zone


def job_sgg(job_id: str | None) -> str | None:
    """작업 → 시군구 코드(옵션 sgg_cd → 영상의 sgg_cd). 모르면 None."""
    if not job_id:
        return None
    try:
        from workers import bus
        jh = bus.job(job_id) or {}
        opts = json.loads(jh.get("options") or "{}")
        if opts.get("sgg_cd"):
            return str(opts["sgg_cd"])
        iid = jh.get("imagery_id")
        if iid:
            with bus.pg() as conn:
                row = conn.execute("SELECT sgg_cd FROM imagery WHERE id=%s", (iid,)).fetchone()
            if row and row[0]:
                return str(row[0])
    except Exception:
        return None
    return None


def resolve_sgg(features: list[dict], sgg_cd: str | None = None, region: str | None = None) -> str | None:
    """sgg_cd 인자 → region(숫자 5자리일 때만 · 예전 호출 호환) → 결과의 job_id 로 작업 시군구 → 결과 대표점의 시군구."""
    if sgg_cd:
        return str(sgg_cd)
    if region and str(region)[:5].isdigit():
        return str(region)[:5]
    jid = next((f["props"].get("job_id") for f in features if f.get("props", {}).get("job_id")), None)
    cd = job_sgg(jid)
    if cd:
        return cd
    try:
        from shapely.ops import unary_union
        from landxi_api.regions import sgg_at
        c = unary_union([f["geom"].envelope for f in features[:2000]]).centroid
        return sgg_at(c.x, c.y)
    except Exception:
        return None


def emd_index_for(sgg_cd: str | None):
    if not sgg_cd:
        return None
    try:
        from landxi_api.regions import emd_index
        ix = emd_index(sgg_cd)
        return ix if ix is not None and len(ix) else None
    except Exception:
        return None


# ── 읍면동 이름 붙이기(c2-numbers · K15) ───────────────────────────────────────────────────────────
# 빈칸 원인(2026-09-30 실측 67,141행): ① 분석 중 칸 결과(gpu_worker 칸 기록)는 읍면동 없이 먼저 들어가고, 끝날 때(후처리)만 채워졌다
#   — 취소·중단된 전역 분석 30여 건은 끝내 빈칸 ② 후처리 때 그 시군구 읍면동 경계를 받지 못하면(캐시 없음·일시 오류) 조용히 빈칸
#   ③ 작업 없이 들여온 결과 세트(results/…)는 처음부터 빈칸. 좌표계 문제는 아니었다(4326 · 대표점 기준 같음).
# 고침: label_points() 한 규칙 — 작업 시군구 경계 → 안 맞으면 그 점의 시군구 경계 → 어느 시군구에도 없으면 '관할 밖'(emd_cd 없음).
#   경계를 아직 받지 못한 시군구의 점만 빈칸으로 두고(모르는 것을 지어내지 않음), fill_blank() 가 뒤따라 채운다(게이트웨이 주기 작업).
OUTSIDE = "관할 밖"


class _Labeler:
    """시군구 → EmdIndex 캐시 + 점 → (읍면동, 코드) | (관할 밖, None) | None(경계 미수신)."""

    def __init__(self):
        self._ix: dict[str, object] = {}

    def ix(self, sgg: str | None):
        if not sgg:
            return None
        if sgg not in self._ix:
            self._ix[sgg] = emd_index_for(sgg)
        return self._ix[sgg]

    def at(self, x: float, y: float, sgg: str | None):
        from shapely.geometry import Point
        pt = Point(x, y)
        ix = self.ix(sgg)
        if ix is not None:
            hit = ix.find(pt)
            if hit:
                return hit
        elif sgg:
            return None                          # 작업 시군구 경계를 아직 못 받음 — 빈칸으로 두고 다음 채우기에서
        try:
            from landxi_api.regions import sgg_at
            other = sgg_at(x, y)
        except Exception:
            other = None
        if other and other != sgg:
            ox = self.ix(other)
            if ox is None:
                return None                      # 그 점의 시군구 경계를 아직 못 받음
            hit = ox.find(pt)
            if hit:
                return hit
        return (OUTSIDE, None)                   # 어느 시군구 읍면동에도 들지 않음(바다·경계 밖·해외)


def label_points(points: list[tuple[float, float]], sgg_cd: str | None = None, labeler: "_Labeler | None" = None) -> list:
    """점(4326) 목록 → [(읍면동, 코드) | ('관할 밖', None) | None]. 작업 시군구가 있으면 그 경계를 먼저."""
    lb = labeler or _Labeler()
    return [lb.at(x, y, sgg_cd) for x, y in points]


def _job_sgg_db(conn, job_id: str) -> str | None:
    row = conn.execute("SELECT coalesce(j.options->>'sgg_cd', i.sgg_cd) FROM jobs j LEFT JOIN imagery i ON i.id = j.imagery_id WHERE j.id = %s",
                       (job_id,)).fetchone()
    return str(row[0]) if row and row[0] else None


def fill_blank(limit: int = 20000, job_id: str | None = None, dsn: str | None = None) -> dict:
    """detections 의 읍면동 빈칸(emd NULL·'')을 채운다 — 관리 작업(CPU · 게이트웨이 주기 · 한 번에 limit 행).
    반환 {filled, outside, pending, jobs}. pending = 경계를 아직 못 받아 빈칸으로 남긴 행."""
    import psycopg
    from landxi_api import config as C
    t0 = __import__("time").time()
    out = {"filled": 0, "outside": 0, "pending": 0, "jobs": 0}
    with psycopg.connect(dsn or C.PG_WORKER_DSN, autocommit=False) as conn:
        conn.execute("SELECT set_config('app.realm','lx',true), set_config('app.tenant_id','',true)")
        where = "(emd IS NULL OR emd = '')" + (" AND job_id = %(job)s" if job_id else "")
        rows = conn.execute(f"SELECT id, job_id, ST_X(p), ST_Y(p) FROM (SELECT id, job_id, ST_PointOnSurface(geom) p FROM detections "
                            f"WHERE {where} LIMIT %(lim)s) q", {"job": job_id, "lim": int(limit)}).fetchall()
        if not rows:
            conn.rollback()
            return {**out, "ms": round((__import__("time").time() - t0) * 1000)}
        by_job: dict[str, list] = {}
        for i, j, x, y in rows:
            by_job.setdefault(j, []).append((i, x, y))
        lb = _Labeler()
        upd = []
        for j, pts in by_job.items():
            sgg = _job_sgg_db(conn, j) if str(j).startswith("job_") else None
            if not sgg:                                   # 작업 없는 결과 세트 — 결과 중심의 시군구
                try:
                    from landxi_api.regions import sgg_at
                    xs = sorted(p[1] for p in pts)
                    ys = sorted(p[2] for p in pts)
                    sgg = sgg_at(xs[len(xs) // 2], ys[len(ys) // 2])
                except Exception:
                    sgg = None
            for (i, x, y), hit in zip(pts, label_points([(p[1], p[2]) for p in pts], sgg, lb)):
                if hit is None:
                    out["pending"] += 1
                    continue
                upd.append((i, hit[0], hit[1]))
                out["outside" if hit[1] is None else "filled"] += 1
        out["jobs"] = len(by_job)
        if upd:
            conn.execute("CREATE TEMP TABLE _emd_fill(id bigint PRIMARY KEY, emd text, emd_cd text) ON COMMIT DROP")
            with conn.cursor().copy("COPY _emd_fill(id, emd, emd_cd) FROM STDIN") as cp:
                for r in upd:
                    cp.write_row(r)
            conn.execute("UPDATE detections d SET emd = f.emd, emd_cd = f.emd_cd FROM _emd_fill f "
                         "WHERE d.id = f.id AND (d.emd IS NULL OR d.emd = '')")
        conn.commit()
    out["ms"] = round((__import__("time").time() - t0) * 1000)
    return out


def blank_counts(dsn: str | None = None) -> dict:
    """K15 집계 — 빈칸(관할 밖 표지 제외) · 관할 밖 · 전체."""
    import psycopg
    from landxi_api import config as C
    with psycopg.connect(dsn or C.PG_WORKER_DSN) as conn:
        conn.execute("SELECT set_config('app.realm','lx',false), set_config('app.tenant_id','',false)")
        b, o, n = conn.execute("SELECT count(*) FILTER (WHERE emd IS NULL OR emd = ''), count(*) FILTER (WHERE emd = %s), count(*) FROM detections",
                               (OUTSIDE,)).fetchone()
    return {"blank": int(b), "outside": int(o), "total": int(n)}


def run(features: list[dict], *, task: str, region: str | None = None, sgg_cd: str | None = None, overlap_thr: float = 0.5,
        min_area: float = 4.0, simplify_m: float = 0.3) -> tuple[list[dict], dict]:
    """features: [{geom(shapely 4326), props{cls,cls_en,cid,conf,chip_edge,shard_id,fid}}] → (남은 것, 통계)."""
    if not features:
        return [], {"in": 0, "out": 0}
    c = features[0]["geom"].centroid
    epsg = metric_epsg(c.x, c.y)
    to_m = Transformer.from_crs(4326, epsg, always_xy=True).transform
    to_g = Transformer.from_crs(epsg, 4326, always_xy=True).transform
    st = {"in": len(features)}
    items = []
    for f in features:
        g = sh_transform(to_m, f["geom"])
        if task != "obb":
            g = g.simplify(simplify_m, preserve_topology=True)
        if not g.is_valid:
            g = g.buffer(0)
        if g.is_empty or g.area < min_area:
            continue
        items.append((g, f))
    st["after_area"] = len(items)
    # 동일 클래스 겹침 → 낮은 conf 제거(전역 NMS)
    geoms = [g for g, _ in items]
    tree = STRtree(geoms)
    order = sorted(range(len(items)), key=lambda i: -float(items[i][1]["props"].get("conf") or 0))
    drop = set()
    for i in order:
        if i in drop:
            continue
        gi, fi = items[i]
        for j in tree.query(gi, predicate="intersects"):
            j = int(j)
            if j == i or j in drop:
                continue
            gj, fj = items[j]
            if fj["props"].get("cls") != fi["props"].get("cls"):
                continue
            inter = gi.intersection(gj).area
            if inter / max(min(gi.area, gj.area), 1e-9) > overlap_thr:
                drop.add(j)       # i 가 conf 가 더 높다(정렬 순서)
    st["nms_dropped"] = len(drop)
    kept = [(g, f) for k, (g, f) in enumerate(items) if k not in drop]
    out = []
    outside = 0
    sgg = resolve_sgg(features, sgg_cd, region)
    ix = emd_index_for(sgg)
    lb = _Labeler()
    pending = 0
    for g, f in kept:
        p = dict(f["props"])
        p["area_m2"] = round(g.area, 1)
        g4 = sh_transform(to_g, g)
        if ix is not None:
            hit = ix.find(g4.representative_point())
            if not hit:
                outside += 1
                continue
            p["emd"], p["emd_cd"] = hit
        else:                                    # 작업 시군구 경계가 없으면 점마다 그 점의 시군구로(없으면 '관할 밖' · 경계 미수신이면 빈칸)
            rp = g4.representative_point()
            hit = lb.at(rp.x, rp.y, None)
            if hit is None:
                pending += 1
            else:
                p["emd"], p["emd_cd"] = hit
        out.append({"geom": g4, "props": p})
    st["outside_emd"] = outside
    st["emd_pending"] = pending
    st["sgg_cd"] = ix.sgg_cd if ix is not None else sgg
    st["emd_n"] = len(ix) if ix is not None else 0
    st["out"] = len(out)
    st["epsg"] = epsg
    return out, st


def qa_pr(pred: list[dict], gt_fc: dict, reviewed_fc: dict, aoi4326: dict | None, iou_thr: float = 0.5,
          scope: tuple[str, ...] = ("yes", "no")) -> dict:
    """정답 대비 P/R — 검토된 타일(scope: yes|no) 안의 예측·GT 만. unsure 타일은 제외. 매칭 = 1:1 탐욕(IoU 내림차순)."""
    to = Transformer.from_crs(4326, 5186, always_xy=True).transform
    aoi = sh_transform(to, shape(aoi4326)) if aoi4326 else None
    rev = [sh_transform(to, shape(f["geometry"])) for f in reviewed_fc["features"] if f["properties"]["kind"] in scope]
    ign = [sh_transform(to, shape(f["geometry"])) for f in reviewed_fc["features"] if f["properties"]["kind"] == "ignore"]
    rtree, itree = STRtree(rev), STRtree(ign) if ign else None

    def inside(g):
        cpt = g.centroid
        if aoi is not None and not aoi.contains(cpt):
            return False
        if itree is not None and len(itree.query(cpt, predicate="within")):
            return False
        return len(rtree.query(cpt, predicate="within")) > 0

    P = [sh_transform(to, f["geom"]) for f in pred]
    P = [(g, f["props"].get("conf", 0)) for g, f in zip(P, pred) if inside(g)]
    G = [sh_transform(to, shape(f["geometry"])) for f in gt_fc["features"]]
    G = [g for g in G if inside(g)]
    pairs = []
    if P and G:
        gtree = STRtree(G)
        for i, (pg, _) in enumerate(P):
            for j in gtree.query(pg, predicate="intersects"):
                gg = G[int(j)]
                inter = pg.intersection(gg).area
                iou = inter / max(pg.union(gg).area, 1e-9)
                if iou > 0:
                    pairs.append((iou, i, int(j)))
    pairs.sort(reverse=True)
    mp, mg, ious = set(), set(), []
    for iou, i, j in pairs:
        if iou < iou_thr:
            break
        if i in mp or j in mg:
            continue
        mp.add(i)
        mg.add(j)
        ious.append(iou)
    tp = len(mp)
    fp = len(P) - tp
    fn = len(G) - tp
    prec = tp / len(P) if P else None
    rec = tp / len(G) if G else None
    # 참고: IoU 0.3 매칭(OBB 사각 vs SAM 차체 윤곽은 모양이 달라 IoU 가 낮게 나온다)
    loose = sum(1 for iou, _, _ in pairs if iou >= 0.3)
    return {"tp": tp, "fp": fp, "fn": fn, "n_pred": len(P), "n_gt": len(G), "precision": prec, "recall": rec,
            "mean_iou_matched": float(np.mean(ious)) if ious else None, "pairs_iou_ge_0_3": loose}
