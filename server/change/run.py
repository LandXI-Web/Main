"""변화 탐지 한 번(범위 · 연도 A · B) — 블록(타일 16×16) 단위로 받아 추론하고, 끝에 유형별로 이어 붙여 거른다.

부르는 쪽: adapters/adapter_change_unet.py(GPU 워커 · 작업 대기열) — net · 전력 쉼(pause) · 진행(progress)을 넘긴다.
결과 폴더: DATA/change/runs/{run_id}/ — changes.geojson(4326 · 속성) · stats.json · thumbs/{id}_a.png · {id}_b.png
"""
from __future__ import annotations

import json
import time
from pathlib import Path

import numpy as np
from shapely.geometry import box, mapping
from shapely.ops import unary_union
from shapely.prepared import prep

from . import DATA
from . import detect as D
from . import imagery as I
from .ranges import to4326

VERSION = "change-3"          # 2: 도로 ↔ 건물 전이 제외(포장면 오탐) · 3: 본선 필지 위 건물도 도로로          # 계산 방식이 바뀌면 올린다(캐시 키)
BLOCK_TILES = 16


def run_dir(run_id: str) -> Path:
    return DATA / "runs" / run_id


def _blocks(rng5179, zoom: int):
    span = I.NG.tile_span_m(zoom) * BLOCK_TILES
    mnx, mny, mxx, mxy = rng5179.bounds
    ox, oy = I.NG.ORIGIN_X, I.NG.ORIGIN_Y
    c0 = int((mnx - ox) // span)
    c1 = int((mxx - ox) // span)
    r0 = int((oy - mxy) // span)
    r1 = int((oy - mny) // span)
    pr = prep(rng5179)
    out = []
    for r in range(r0, r1 + 1):
        for c in range(c0, c1 + 1):
            b = (ox + c * span, oy - (r + 1) * span, ox + (c + 1) * span, oy - r * span)
            if pr.intersects(box(*b)):
                out.append(b)
    return out


def _raster(geoms, grid: D.Grid):
    from rasterio.features import rasterize
    gs = [g for g in geoms if g is not None and not g.is_empty]
    if not gs:
        return np.zeros((grid.H, grid.W), bool)
    return rasterize(((g, 1) for g in gs), out_shape=(grid.H, grid.W), transform=grid.affine(), fill=0, dtype="uint8").astype(bool)


def compute(*, run_id: str, rng5179, line5179, year_a: int, year_b: int, zoom: int, net, parcels, device="cuda",
            pause=None, progress=None, log=print, thumb_zoom: dict | None = None) -> dict:
    """한 범위 전체. parcels = parcels.for_range 결과(5179). 돌려줌 = stats(dict)."""
    t0 = time.perf_counter()
    out = run_dir(run_id)
    (out / "thumbs").mkdir(parents=True, exist_ok=True)
    up = zoom == 17
    pr = prep(rng5179)
    road_geoms = []
    if parcels is not None and len(parcels) and "use" in parcels:
        road_geoms = list(parcels[parcels["use"].fillna("").str.contains("도로\\(본선\\)|본선", regex=True)].geometry)
    blocks = _blocks(rng5179, zoom)
    raw: dict[str, list] = {t: [] for t in D.TYPES}
    tiles_got = {"a": 0, "b": 0, "total": 0}
    span = I.NG.tile_span_m(zoom)

    def need(c, r, z):
        mnx = I.NG.ORIGIN_X + c * span
        mxy = I.NG.ORIGIN_Y - r * span
        return pr.intersects(box(mnx, mxy - span, mnx + span, mxy))

    for bi, b in enumerate(blocks):
        if progress:
            progress("imagery", bi, len(blocks))
        A, (ox, oy, res), ga_n, tot = I.fetch_imagery(b, year_a, zoom, need=need)
        B, _, gb_n, _ = I.fetch_imagery(b, year_b, zoom, need=need)
        tiles_got["a"] += ga_n
        tiles_got["b"] += gb_n
        tiles_got["total"] += tot
        if ga_n == 0 or gb_n == 0:
            continue
        grid = D.Grid(ox, oy, res, A.shape[0], A.shape[1])
        aoi = _raster([rng5179.intersection(box(*b))], grid)
        if progress:
            progress("infer", bi, len(blocks))
        ga = D.infer_groups(net, A, up, device=device, pause=pause)
        gb = D.infer_groups(net, B, up, device=device, pause=pause)
        if road_geoms:
            rm = _raster([g for g in road_geoms if g.intersects(box(*b))], grid)
            ga, gb = D.burn_road(ga, rm), D.burn_road(gb, rm)
        masks = D.transitions(ga, gb)
        for t, p in D.polygons(masks, grid, aoi, min_area=10.0, elong=False):
            raw[t].append(p)
    if progress:
        progress("polygons", len(blocks), len(blocks))
    # 블록 경계에서 나뉜 조각 잇기 → 거름
    feats = []
    for t in D.TYPES:
        if not raw[t]:
            continue
        u = unary_union(raw[t]).buffer(0)
        parts = list(u.geoms) if hasattr(u, "geoms") else [u]
        for p in parts:
            if p.area < D.MIN_AREA_BY.get(t, D.MIN_AREA):
                continue
            if D.elongation(p) > D.MAX_ELONG and p.area < 2000:
                continue
            feats.append((t, p))
    feats.sort(key=lambda x: -x[1].area)
    # 구역선 안/밖 · 필지
    line = line5179 if line5179 is not None else rng5179
    linep = line if line.geom_type.endswith("Polygon") else line.buffer(1)
    rows = []
    sidx = parcels.sindex if parcels is not None and len(parcels) else None
    for i, (t, p) in enumerate(feats):
        fid = f"c{i + 1:04d}"
        inter = p.intersection(linep).area if p.intersects(linep) else 0.0
        inside = inter >= 0.3 * p.area or linep.contains(p.representative_point())
        prow = None
        if sidx is not None:
            cand = list(sidx.query(p, predicate="intersects"))
            if cand:
                best = max(cand, key=lambda k: parcels.geometry.iloc[k].intersection(p).area)
                prow = parcels.iloc[best]
        pnus = []
        if sidx is not None:
            pnus = [parcels["PNU"].iloc[k] for k in sidx.query(p, predicate="intersects")][:20]
        rows.append({"id": fid, "type": t, "area_m2": round(p.area, 1), "inside_row": "내" if inside else "외",
                     "pnu": None if prow is None else prow["PNU"], "jibun": None if prow is None else prow.get("jibun"),
                     "jimok": None if prow is None else prow.get("jimok"), "owner": None if prow is None else prow.get("owner"),
                     "use": None if prow is None else (prow.get("use") if isinstance(prow.get("use"), str) else None),
                     "sgg_cd": None if prow is None else prow.get("sgg_cd"), "pnus": pnus,
                     "hidden": t in D.TYPE_HIDDEN, "geom": p})
    # 소유구분 — 브이월드 토지소유정보(분류만 · 캐시 · 10-22 사용자 허락). 못 받으면 앞 값(대장 · 토지마스터 판정) 그대로
    try:
        import importlib

        from . import owner as OW
        OW = importlib.reload(OW)
        got = OW.fill([r["pnu"] for r in rows if r.get("pnu")])
        for r in rows:
            if r.get("pnu") in got:
                r["owner"] = got[r["pnu"]]
    except Exception as e:  # noqa: BLE001
        log("소유구분 조회 건너뜀", type(e).__name__)
    # 썸네일(A · B 같은 자리) — 타일은 디스크 캐시 · 폴리곤 여럿을 함께(받기 대기가 길어 한 줄로 돌면 철도처럼 넓은 범위가 느림)
    from concurrent.futures import ThreadPoolExecutor

    def one(row):
        p = row["geom"]
        mnx, mny, mxx, mxy = p.bounds
        side = max(40.0, 2.2 * max(mxx - mnx, mxy - mny))
        cx, cy = (mnx + mxx) / 2, (mny + mxy) / 2
        for tag, yr in (("a", year_a), ("b", year_b)):
            tz = int((thumb_zoom or {}).get(yr) or zoom)          # 썸네일은 그 해 가장 고운 영상(추론 격자와 따로)
            pad = I.NG.tile_span_m(tz)
            bb = (cx - side / 2 - pad, cy - side / 2 - pad, cx + side / 2 + pad, cy + side / 2 + pad)
            img, (ox, oy, res), _, _ = I.fetch_imagery(bb, yr, tz, workers=3)
            g = D.Grid(ox, oy, res, img.shape[0], img.shape[1])
            D.thumb(img, g, p).save(out / "thumbs" / f"{row['id']}_{tag}.png", optimize=True)
    with ThreadPoolExecutor(max_workers=4) as ex:
        for k, _ in enumerate(ex.map(one, rows)):
            if progress and k % 20 == 0:
                progress("thumbs", k, len(rows))
    # 파일
    fc = {"type": "FeatureCollection", "features": []}
    for row in rows:
        g4 = to4326(row["geom"])
        props = {k: v for k, v in row.items() if k != "geom"}
        props["thumb_a"] = f"thumbs/{row['id']}_a.png"
        props["thumb_b"] = f"thumbs/{row['id']}_b.png"
        c = g4.representative_point()
        props["lng"], props["lat"] = round(c.x, 6), round(c.y, 6)
        fc["features"].append({"type": "Feature", "id": row["id"], "geometry": mapping(g4), "properties": props})
    (out / "changes.geojson").write_text(json.dumps(fc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    stats = summarize(rows)
    stats.update({"version": VERSION, "year_a": year_a, "year_b": year_b, "zoom": zoom, "gsd_m": 0.255 if zoom == 18 else 0.51,
                  "range_km2": round(rng5179.area / 1e6, 3), "blocks": len(blocks), "tiles": tiles_got,
                  "seconds": round(time.perf_counter() - t0, 1)})
    (out / "stats.json").write_text(json.dumps(stats, ensure_ascii=False, indent=1), encoding="utf-8")
    return stats


def summarize(rows: list[dict]) -> dict:
    vis = [r for r in rows if not r.get("hidden")]
    by_type = {t: {"n": 0, "m2": 0.0, "in": 0, "out": 0} for t in D.TYPES}
    for r in rows:
        b = by_type[r["type"]]
        b["n"] += 1
        b["m2"] = round(b["m2"] + r["area_m2"], 1)
        b["in" if r["inside_row"] == "내" else "out"] += 1
    top = sorted([r for r in vis if r["inside_row"] == "내"], key=lambda r: -r["area_m2"])[:3]
    return {"n": len(vis), "n_all": len(rows), "n_in": sum(1 for r in vis if r["inside_row"] == "내"),
            "n_out": sum(1 for r in vis if r["inside_row"] == "외"), "m2": round(sum(r["area_m2"] for r in vis), 1),
            "by_type": by_type, "top_in": [{"id": r["id"], "type": r["type"], "area_m2": r["area_m2"], "jibun": r.get("jibun"),
                                             "jimok": r.get("jimok")} for r in top]}
