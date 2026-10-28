"""이지목 현황(카드 ② · 10-28 지시서 v5) — 한 시점 영상 → 토지피복 U-Net → 필지마다 실제 피복 ↔ 지목 → 판정 층 7종.

판정 규칙 = 원천 코드 E:\\도로공사\\geoai_roadland\\src\\ijimok_synth.py judge() 그대로(옮겨 적지 않고 불러 쓴다).
판정 층 이름 = 이지목_판정별레이어.gpkg 레이어명 그대로(01_정상_지목일치 … 07_이지목_기타).
피복 = 12분류 공식 이름 묶음(change/detect.GROUP · 10-25 승인) — 원천이 쓰던 옛 묶음(나지 → 경작 · 비대상지 → 나지초지)과 다르다.
  · 나지(공식 '나지') · 비대상지 · 가로수(어느 묶음에도 없음)는 원천의 '나지초지(판정보류)'와 같은 자리 → 미확정.
필지 = 대상지 구역선 안에 대표점이 드는 연속지적 필지(구역선이 선이면 범위 안 전부). 필지 지목 = 연속지적도 지번 끝 글자.
결과 파일은 국토 변화와 같은 모양(changes.geojson · stats.json · thumbs) — 지도 · 표 · 판정 저장 · 이력 · 보고서를 그대로 쓴다.
"""
from __future__ import annotations

import json
import time

import numpy as np
from shapely.geometry import box, mapping

from . import detect as D
from . import imagery as I
from .ranges import to4326

VERSION = "ijimok-3"           # 2: 철도용 시범 규칙 · 소유구분 조회 뺌(카드 ③에서만) · 3: 철도 시범 규칙 끔(광산구 점유의심 11.6% > 10% → PM 기준대로 ⓐ로 되돌림 · 10-28)
RAIL_RULE = False               # 철도용 시범 규칙(10-28 PM ⓑ) — 켜면 judge_rail 이 지목 철을 시설 지목으로 본다
# 판정 층 7종(gpkg 레이어명) — 짧은 이름(화면 · 표) → 레이어명 · 색(gpkg 색상 그대로)
LAYERS = [
    ("정상_지목일치", "01_정상_지목일치", "#a9d6a0"),
    ("미확정_나지초지", "02_미확정_나지초지", "#d0d0d0"),
    ("점유의심", "03_이지목_점유의심", "#c0392b"),
    ("지목미정리", "04_이지목_지목미정리", "#2980b9"),
    ("유휴산림화", "05_이지목_유휴산림화", "#e67e22"),
    ("수역구거", "06_이지목_수역구거", "#16a085"),
    ("기타", "07_이지목_기타", "#7f8c8d"),
]
TYPES = [x[0] for x in LAYERS]
LAYER_OF = {x[0]: x[1] for x in LAYERS}
GKO = {"built": "건물", "road": "도로", "crop": "경작", "forest": "산림", "water": "수역", "other": "나지초지"}


def _judge_fn():
    from . import roadland_src
    roadland_src()
    import ijimok_synth as S          # geoai_roadland/src/ijimok_synth.py — 원천 판정 규칙
    return S.jimok_group, S.judge


def layer_of(pan: str, kind: str) -> str:
    """원천 judge() 결과(판정 · 이지목유형) → gpkg 판정 층(짧은 이름).
    gpkg 층 수와 원천 유형 수를 맞춰 보면(전국) 이지목은 실제 피복으로 층이 갈린다: 도로 → 지목미정리(수계 · 대지시설 지목의 '도로(기타불일치)'만 기타) ·
    경작 · 건물 → 점유의심 · 산림 → 유휴산림화 · 수역 → 수역구거."""
    if pan == "일치":
        return "정상_지목일치"
    if pan == "미확정":
        return "미확정_나지초지"
    if "지목미정리" in kind:
        return "지목미정리"
    if "_경작" in kind or "_건물" in kind:
        return "점유의심"
    if "_산림" in kind:
        return "유휴산림화"
    if "_수역" in kind:
        return "수역구거"
    return "기타"


RAIL_NOTE = "철도용 시범 규칙 · 선로는 도로로 간주 · AI 철도 분류 없음"


def judge_rail(judge, jg: str, jimok: str, cover: str, road_main: bool):
    """철도용 시범 규칙(10-28 PM 회신 REPLY-v6-B ⓑ) — 지목 '철'을 도로와 같은 시설 지목으로:
    철 + 경작 · 건물 → 점유의심 · 철 + 나지 · 자갈 · 비대상(판정 보류 자리) · 도로(선로) → 정상(선로 · 노반) · 철 + 산림 · 수역 → 도로 지목과 같은 층.
    철이 아닌 지목은 원천 규칙 그대로(농지 · 임야 · 수계 · 대지 지목 + 도로 피복(선로 포함) → 지목미정리). → (판정, 이지목유형, 색, 시범 규칙 썼나)"""
    if RAIL_RULE and jimok == "철":
        if cover in ("경작", "건물"):
            return "이지목", f"철도지목_{cover}(점유의심)", "#c0392b", True
        if cover in ("도로", "나지초지"):
            return "일치", "정상_철도(선로 · 노반)", "#a9d6a0", True
        pan, kind, col = judge("도로", cover, False)
        return pan, kind.replace("도로지목", "철도지목"), col, True
    pan, kind, col = judge(jg, cover, road_main)
    return pan, kind, col, False


def _run_ver() -> str:
    from .run import VERSION as RV          # 캐시 열쇠 = 게이트웨이 change._ver() + 카드 묶음 판(detect.TSET_VER)과 같은 모양
    return RV


def compute(*, run_id: str, rng5179, line5179, year: int, zoom: int, net, parcels, src=None, device="cuda",
            pause=None, progress=None, log=print, out=None) -> dict:
    t0 = time.perf_counter()
    jgroup, judge = _judge_fn()
    S = dict(src or {"kind": "ngii", "year": year})
    if S.get("kind") == "imagery" and not S.get("path"):
        from workers import imagery_src
        S["path"] = imagery_src.imagery_path(S["id"])
    (out / "thumbs").mkdir(parents=True, exist_ok=True)
    up = zoom == 17
    # 대상 필지 — 구역선(면) 안에 대표점
    line = line5179 if line5179 is not None else rng5179
    tgt = parcels
    if tgt is not None and len(tgt):
        if line.geom_type.endswith("Polygon"):
            from shapely.prepared import prep
            pl = prep(line)
            tgt = tgt[[pl.contains(g.representative_point()) for g in tgt.geometry]]
        tgt = tgt.reset_index(drop=True)
    n = 0 if tgt is None else len(tgt)
    cnt = np.zeros((max(n, 1), 8), np.int64)          # 열 0 = 묶음 없음(비대상지 · 가로수) · 1~6 = detect.G · 7 = 영상 없음
    from .run import _blocks
    from rasterio.features import rasterize
    blocks = _blocks(rng5179, zoom) if n else []
    span = I.NG.tile_span_m(zoom)
    from shapely.prepared import prep as _prep
    pr = _prep(rng5179)

    def need(c, r, z):
        mnx = I.NG.ORIGIN_X + c * span
        mxy = I.NG.ORIGIN_Y - r * span
        return pr.intersects(box(mnx, mxy - span, mnx + span, mxy))
    sidx = tgt.sindex if n else None
    got = tot = 0
    road_idx = set()
    if n and "use" in tgt:
        road_idx = {i for i, u in enumerate(tgt["use"].fillna("")) if "도로(본선" in str(u) or "본선" in str(u)}
    for bi, b in enumerate(blocks):
        if progress:
            progress("imagery", bi, len(blocks))
        idx = list(sidx.query(box(*b), predicate="intersects"))
        if not idx:
            continue
        hb = (lambda d, t, _bi=bi: progress("imagery", _bi, len(blocks))) if progress else None
        A, (ox, oy, res), g_n, t_n = I.fetch_source(S, b, zoom, need=need, progress=hb)
        got += g_n
        tot += t_n
        if g_n == 0:
            continue
        grid = D.Grid(ox, oy, res, A.shape[0], A.shape[1])
        lab = rasterize(((tgt.geometry.iloc[k], k + 1) for k in idx), out_shape=(grid.H, grid.W), transform=grid.affine(), fill=0, dtype="int32")
        if not (lab > 0).any():
            continue
        if progress:
            progress("infer", bi, len(blocks))
        gm = D.infer_groups(net, A, up, device=device, pause=pause).astype(np.int64)
        blank = A.max(axis=-1) < 8
        gm[blank] = 7
        m = lab > 0
        cnt += np.bincount((lab[m] - 1).astype(np.int64) * 8 + gm[m], minlength=cnt.size).reshape(cnt.shape)   # np.add.at 보다 수십 배 빠름
    if progress:
        progress("polygons", 1, 1)
    rows = []
    G = D.G
    for i in range(n):
        r = tgt.iloc[i]
        c = cnt[i]
        valid = int(c[:7].sum())
        comp = {k: (int(c[G[k]]) / valid if valid else 0.0) for k in G}
        unk = int(c[0]) / valid if valid else 1.0
        # 원천과 같은 '지배 분류'(구성비 최댓값) — 나지 · 묶음 없음은 원천의 판정보류(나지초지) 자리
        cand = {**{GKO[k]: v for k, v in comp.items() if k != "other"}, "나지초지": comp["other"] + unk}
        cover = max(cand, key=cand.get) if valid else "나지초지"
        jm = str(r.get("jimok") or "")
        jg = jgroup(jm)
        pan, kind, _col, rail = judge_rail(judge, jg, jm, cover, i in road_idx)
        t = layer_of(pan, kind)
        rows.append({"id": f"c{i + 1:04d}", "type": t, "layer": LAYER_OF[t], "kind": kind, "pan": pan, "cover": cover, "jimok_group": jg,
                     "comp": {k: round(v, 3) for k, v in cand.items()}, "seen": valid > 0, "rail_rule": rail,
                     "area_m2": round(float(r.geometry.area), 1), "inside_row": "내", "pnu": r.get("PNU"), "jibun": r.get("jibun"), "jimok": jm or None,
                     "owner": r.get("owner"), "use": r.get("use") if isinstance(r.get("use"), str) else None, "sgg_cd": r.get("sgg_cd"),
                     "pnus": [r.get("PNU")], "hidden": False, "geom": r.geometry})
    # 소유구분 조회(브이월드)는 하지 않는다 — 카드 ③ 점유의심 조사에서 목록에 오른 필지만(10-28 PM 회신 3 · 판정 시간). owner = 대장 · 토지마스터 판정 그대로
    # 썸네일 — 그 해 영상 한 장(두 칸 모양을 맞추려 a · b 같은 그림)
    from concurrent.futures import ThreadPoolExecutor
    import shutil

    def one(row):
        p = row["geom"]
        mnx, mny, mxx, mxy = p.bounds
        side = max(40.0, 2.2 * max(mxx - mnx, mxy - mny))
        cx, cy = (mnx + mxx) / 2, (mny + mxy) / 2
        tz = zoom if S.get("kind") != "imagery" else 18
        pad = I.NG.tile_span_m(tz)
        bb = (cx - side / 2 - pad, cy - side / 2 - pad, cx + side / 2 + pad, cy + side / 2 + pad)
        img, (ox, oy, res), _, _ = I.fetch_source(S, bb, tz, workers=3)
        g = D.Grid(ox, oy, res, img.shape[0], img.shape[1])
        fa = out / "thumbs" / f"{row['id']}_a.png"
        D.thumb(img, g, p, color=(255, 230, 0)).save(fa, optimize=True)
        shutil.copyfile(fa, out / "thumbs" / f"{row['id']}_b.png")
    with ThreadPoolExecutor(max_workers=4) as ex:
        for k, _ in enumerate(ex.map(one, rows)):
            if progress and (k % 10 == 0 or k == len(rows) - 1):
                progress("thumbs", k + 1, len(rows))
    fc = {"type": "FeatureCollection", "features": []}
    for row in rows:
        g4 = to4326(row["geom"])
        props = {k: v for k, v in row.items() if k != "geom"}
        props["thumb_a"] = f"thumbs/{row['id']}_a.png"
        props["thumb_b"] = f"thumbs/{row['id']}_b.png"
        cpt = g4.representative_point()
        props["lng"], props["lat"] = round(cpt.x, 6), round(cpt.y, 6)
        fc["features"].append({"type": "Feature", "id": row["id"], "geometry": mapping(g4), "properties": props})
    (out / "changes.geojson").write_text(json.dumps(fc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    by = {t: {"n": 0, "m2": 0.0, "in": 0, "out": 0} for t in TYPES}
    for x in rows:
        b = by[x["type"]]
        b["n"] += 1
        b["m2"] = round(b["m2"] + x["area_m2"], 1)
        b["in"] += 1
    stats = {"n": len(rows), "n_all": len(rows), "n_in": len(rows), "n_out": 0, "m2": round(sum(x["area_m2"] for x in rows), 1),
             "by_type": by, "top_in": [], "mode": "ijimok", "version": f"{_run_ver()}+{VERSION}", "types": "ijimok", "year_a": year, "year_b": year, "zoom": zoom,
             "layers": {t: LAYER_OF[t] for t in TYPES}, "rail_rule_n": sum(1 for x in rows if x.get("rail_rule")),
             "rule_note": RAIL_NOTE if RAIL_RULE and any(x.get("rail_rule") for x in rows) else None, "sources": {"a": {k: S[k] for k in ("kind", "year", "id") if k in S}},
             "gsd_m": 0.255 if zoom == 18 else 0.51, "range_km2": round(rng5179.area / 1e6, 3), "blocks": len(blocks),
             "tiles": {"got": got, "total": tot}, "unseen": sum(1 for x in rows if not x["seen"]), "seconds": round(time.perf_counter() - t0, 1)}
    (out / "stats.json").write_text(json.dumps(stats, ensure_ascii=False, indent=1), encoding="utf-8")
    return stats
