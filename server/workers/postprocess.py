"""후처리(P4 p4_merge.py 실측 규칙 = 정본) + 전역 NMS + J1 정답 대비 P/R.

순서: (미터 CRS) simplify 0.3 m → 4 m² 미만 제거 → 동일 클래스 겹침(작은 쪽 면적 대비 50% 초과) → 낮은 conf 제거(= 전역 NMS)
→ 남원이면 대표점이 법정동 안인 것만 + emd/emd_cd. OBB(차량)는 꼭짓점 4개라 simplify 를 건너뛴다.
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
from landxi_api import config  # noqa: E402

_EMD = None


def metric_epsg(lng: float, lat: float) -> int:
    if 124 <= lng <= 132 and 33 <= lat <= 39:
        return 5186
    zone = int((lng + 180) // 6) + 1
    return (32600 if lat >= 0 else 32700) + zone


def _emd():
    global _EMD
    if _EMD is None:
        p = config.REPO_ROOT / "landxi/assets/data/geo/namwon-emd.geojson"
        d = json.loads(p.read_text(encoding="utf-8"))
        to = Transformer.from_crs(4326, 5186, always_xy=True).transform
        geoms = [sh_transform(to, shape(f["geometry"])).buffer(0) for f in d["features"]]
        _EMD = (STRtree(geoms), geoms, [(f["properties"]["nm"], f["properties"]["cd"]) for f in d["features"]])
    return _EMD


def run(features: list[dict], *, task: str, region: str | None = None, overlap_thr: float = 0.5, min_area: float = 4.0,
        simplify_m: float = 0.3) -> tuple[list[dict], dict]:
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
    namwon = region == "namwon" or (epsg == 5186 and 127.1 < c.x < 127.7 and 35.2 < c.y < 35.6)
    if namwon:
        tr, eg, names = _emd()
    for g, f in kept:
        p = dict(f["props"])
        p["area_m2"] = round(g.area, 1)
        if namwon:
            rp = g.representative_point()
            hit = [int(k) for k in tr.query(rp, predicate="within")]
            if not hit:
                outside += 1
                continue
            p["emd"], p["emd_cd"] = names[hit[0]]
        out.append({"geom": sh_transform(to_g, g), "props": p})
    st["outside_emd"] = outside
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
