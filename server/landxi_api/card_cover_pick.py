"""카드 그림 후보 자동 찾기(10-25 사용자 "그래 그 방식대로 일단 적용하자" — 규칙 기반 · AI 없음).

결과 하나(작업)에 4:3 틀을 밀어 보며 점수를 매긴다:
  · 결과 넓이 — 틀의 15~50 % 가 결과(사람 결과 = 8 m 칸이 찬 넓이)
  · 신뢰도 — 틀 안 결과의 평균 신뢰도
  · 여러 종류 — 그 결과가 가진 종류 가운데 틀에 든 몫(경작 + 휴경 · 단동 + 다동 …)
  · 가장자리 잘림 — 틀 가장자리에 걸린 결과가 적을수록
  · 영상 상태 — 빈 곳(영상 없음) · 구름(밝고 흰) · 그림자(어두움) · 흐림(경계가 약함) — 단순 통계
  · 국토 변화 — 신축 · 소실 중 가장 큰 변화가 클수록(그 밖 유형은 틀 고르기에 쓰지 않음)
  · 사람 결과 — 틀 너비 200 m 이상(card_cover 와 같은 규칙)
돌려줌: [{bbox(경위도), score(0~100), why[말], opts}] — 점수 높은 순 · 서로 많이 겹치지 않게.
"""
from __future__ import annotations

import json
import math

from starlette.concurrency import run_in_threadpool

from . import card_cover as CC
from . import config
from .deps import ApiError

CHANGE_BIG = {"신축", "소실"}
SKIP_CLS = {"식생 증감"}
MAX_ROWS = 40000
BLANK_MAX = 0.001           # 틀 안 영상 빈 곳(흰 · 검은 채움 · 마스크 밖) 허용 상한 0.1 % — 넘으면 후보에서 뺌(조금이라도 보이면 버림)


async def _objects(conn, source: dict) -> dict:
    """결과 → 틀 고르기 재료 {crs, objs:[(도형, 종류, 신뢰도)], people, kind, opts}"""
    from shapely import wkb
    jobs = source.get("jobs") or ([source["job"]] if source.get("job") else [])
    if not jobs:
        raise ApiError("bad_request", "후보는 작업 결과에서 찾습니다")
    jobs = [str(j) for j in jobs][:4]
    rs = await conn.fetch("SELECT j.id, j.options, i.path_internal, i.crs FROM jobs j LEFT JOIN imagery i ON i.id = j.imagery_id WHERE j.id = ANY($1)", jobs)
    if len(rs) != len(jobs):
        raise ApiError("not_found", "없는 결과입니다")
    first = next(r for r in rs if r["id"] == jobs[0])
    o = first["options"] if isinstance(first["options"], dict) else json.loads(first["options"] or "{}")
    sql = ("SELECT ST_AsBinary(ST_Transform(geom, $2::int)) g, cls, conf FROM detections WHERE job_id = ANY($1) "
           "AND coalesce(edit_state, 'raw') <> 'deleted' ORDER BY id LIMIT " + str(MAX_ROWS))
    if o.get("change"):
        rows = await conn.fetch(sql, [first["id"]], 5179)
        objs = [(wkb.loads(bytes(r["g"])), r["cls"], float(r["conf"]) if r["conf"] is not None else 0.7) for r in rows if r["cls"] not in SKIP_CLS]
        big = [x for x in objs if x[1] in CHANGE_BIG]
        land = [x for x in objs if str(x[1]).startswith("산림")]
        objs = big or land or objs                       # 한눈에 알 변화(신축 · 소실) 먼저 · 산사태는 산림 → …
        classes = sorted({x[1] for x in objs})
        return {"kind": "change", "crs": "EPSG:5179", "objs": objs, "people": False, "change": o["change"],
                "opts": {"classes": classes} if big else {}}
    if o.get("compare"):
        cm = o["compare"]
        im = await conn.fetchrow("SELECT i.path_internal, i.crs FROM jobs j JOIN imagery i ON i.id = j.imagery_id WHERE j.id = $1", cm.get("growth"))
        if not im:
            raise ApiError("not_found", "두 시기 영상을 찾지 못했습니다")
        f = config.DATA_ROOT / "compare" / f"{first['id']}.json"
        if not f.is_file():
            raise ApiError("not_found", "비교 결과 파일이 없습니다")
        crs = im["crs"] or "EPSG:5186"

        def load():
            from pyproj import Transformer
            from shapely.geometry import shape
            from shapely.ops import transform as stx
            T = Transformer.from_crs(4326, crs, always_xy=True).transform
            J = json.loads(f.read_text(encoding="utf-8"))
            return [(stx(T, shape(x["geometry"])), x["properties"].get("status"), 0.7) for x in (J.get("geo") or {}).get("features", [])
                    if x["properties"].get("status") in CC.CMP_COL]
        return {"kind": "compare", "crs": crs, "objs": await run_in_threadpool(load), "people": False, "path": im["path_internal"], "opts": {}}
    if not first["path_internal"]:
        raise ApiError("bad_request", "영상이 없는 결과입니다")
    crs = first["crs"] or "EPSG:5186"
    rows = await conn.fetch(sql, jobs, CC._epsg(crs))
    objs = [(wkb.loads(bytes(r["g"])), r["cls"], float(r["conf"] or 0)) for r in rows]
    if objs and CC.is_farm(o[1] for o in objs):                 # 경작 · 휴경 — 필지 단위로 고른다(그림과 같은 모양 · 10-25 승인)
        pv = await CC.parcel_view(conn, jobs, CC._epsg(crs))
        if pv:
            return {"kind": "detect", "crs": crs, "objs": [(g, c, 0.5 + 0.5 * sh) for g, c, sh in pv], "people": False,
                    "path": first["path_internal"], "opts": {}, "parcel": True}
    return {"kind": "detect", "crs": crs, "objs": objs, "people": any(x[1] in CC.PEOPLE for x in objs), "path": first["path_internal"], "opts": {}}


FORAGE_W = 600.0           # 사료작물(생육기 · 생산기 · 비교) 카드 그림 틀 너비 — 10-28 now 22 결정7 "넓게 크게 보고 그 안에서"
LANDSLIDE_W = 1000.0       # 산사태 취약지구 카드 그림 틀 너비 — 결정7
FORAGE_CLS = {"IRG", "호밀", "옥수수", "수단그라스"}


def _frame_w(objs, people: bool, kind: str, parcel: bool = False, change: dict | None = None) -> float:
    if kind == "change" and (change or {}).get("types") == "landslide":
        return LANDSLIDE_W
    if kind == "compare" or (objs and all(c in FORAGE_CLS for _, c, _ in objs)):
        return FORAGE_W
    sizes = sorted(math.sqrt(max(g.area, 0.01)) for g, _, _ in objs if g.area > 0) or [5.0]
    s = sizes[len(sizes) // 2]
    if parcel or (objs and all(c in CC.FIELD_CLS for _, c, _ in objs)):   # 필지 단위 · 논밭 결과(사료작물 — 칸 경계를 붙여 밭 하나가 큼 · 10-26) — 필지 몇 줄이 보이는 너비(×12 면 너무 넓다)
        return min(max(s * 6, 120.0), 360.0)
    if kind == "change":
        w = min(max(s * 9, 140.0), 420.0)
    else:
        w = min(max(s * 12, 50.0), 600.0)
    return max(w, CC.MIN_PEOPLE_W + 20) if people else w


def _eval(fr, objs, tree, K: int, people: bool, kind: str) -> dict | None:
    """틀 하나의 벡터 점수 — 결과 넓이 · 신뢰도 · 여러 종류 · 가장자리 잘림 · 큰 변화"""
    from shapely.geometry import box
    bx = box(*fr)
    w, hgt = fr[2] - fr[0], fr[3] - fr[1]
    hit = [(objs[x], objs[x][0].intersection(bx)) for x in (int(i) for i in tree.query(bx))]
    hit = [(o, g) for o, g in hit if not g.is_empty]
    if len(hit) < (5 if people else 2):
        return None
    A = w * hgt
    if people:
        occ = {(int((g.centroid.x - fr[0]) // 8), int((g.centroid.y - fr[1]) // 8)) for (o, g) in hit if o[1] in CC.PEOPLE}
        cov = len(occ) * 64 / A
    else:
        cov = min(1.0, sum(g.area for _, g in hit) / A)
    cov_s = cov / 0.15 if cov < 0.15 else (1.0 if cov <= 0.5 else max(0.0, 1 - (cov - 0.5) / 0.5))
    conf = sum(o[2] for o, _ in hit) / len(hit)
    k = len({o[1] for o, _ in hit})
    var_s = 1.0 if K <= 1 else (k - 1) / (K - 1)
    cut_s = 1 - sum(1 for o, g in hit if g.area < o[0].area * 0.98) / len(hit)
    big_s = 1.0
    if kind == "change":
        big = max((g.area for o, g in hit if o[1] in CHANGE_BIG or str(o[1]).startswith("산림")), default=0.0)
        big_s = min(1.0, big / (A * 0.04))
    v = 0.3 * cov_s + 0.2 * conf + 0.15 * var_s + 0.15 * cut_s + 0.2 * big_s
    return {"fr": fr, "v": v, "cov": cov, "cov_s": cov_s, "conf": conf, "k": k, "var_s": var_s, "cut_s": cut_s, "big_s": big_s, "K": K}


def _tree(objs):
    from shapely.strtree import STRtree
    return STRtree([g for g, _, _ in objs])


def _vector_scores(objs, w: float, people: bool, kind: str, top: int = 10):
    """틀 후보(가운데 = 결과가 몰린 칸 · 반 틀씩 밀기) → 벡터 점수 상위 · 서로 많이 겹치지 않게"""
    if not objs:
        return []
    tree = _tree(objs)
    hgt, step = w * 0.75, w / 2
    cells: dict[tuple[int, int], int] = {}
    for g, _, _ in objs:
        c = g.centroid
        k = (int(c.x // step), int(c.y // step))
        cells[k] = cells.get(k, 0) + 1
    K = len({c for _, c, _ in objs})
    out = []
    for (i, j), _n in sorted(cells.items(), key=lambda kv: -kv[1])[:80]:
        cx, cy = (i + 0.5) * step, (j + 0.5) * step
        e = _eval((cx - w / 2, cy - hgt / 2, cx + w / 2, cy + hgt / 2), objs, tree, K, people, kind)
        if e:
            out.append(e)
    out.sort(key=lambda x: -x["v"])
    pick = []
    for c in out:
        cx, cy = (c["fr"][0] + c["fr"][2]) / 2, (c["fr"][1] + c["fr"][3]) / 2
        if all(math.hypot(cx - (p["fr"][0] + p["fr"][2]) / 2, cy - (p["fr"][1] + p["fr"][3]) / 2) >= w * 0.8 for p in pick):
            pick.append(c)
        if len(pick) >= top:
            break
    return pick


def _img_stats(img) -> dict:
    """영상 상태 — 빈 곳 · 구름 · 그림자 · 흐림(작은 그림 통계)"""
    import numpy as np
    a = np.asarray(img.convert("RGB").resize((240, 180))).astype(float)
    mx, mn = a.max(axis=2), a.min(axis=2)
    inv = img.info.get("invalid")                         # 영상 빈 곳(마스크 · 채움 — card_cover._raster 가 잰 값) · 없으면 색으로
    blank = float(inv) if inv is not None else float(((mn >= 250) | (mx <= 3)).mean())
    sat = (mx - mn) / np.maximum(mx, 1)
    cloud = float(((mx > 225) & (sat < 0.08)).mean())
    shadow = float((mx < 40).mean())
    g = a.mean(axis=2)
    lap = np.abs(4 * g[1:-1, 1:-1] - g[:-2, 1:-1] - g[2:, 1:-1] - g[1:-1, :-2] - g[1:-1, 2:])
    sharp = float(lap.mean())
    s = (1 - min(1.0, blank * 10)) * (1 - min(1.0, cloud * 2)) * (1 - min(1.0, max(0.0, shadow - 0.25) * 2)) * min(1.0, sharp / 6)
    return {"blank": blank, "cloud": cloud, "shadow": shadow, "sharp": sharp, "s": s}


def _img_of(mat: dict, fr):
    if mat["kind"] == "change":
        ch = mat["change"]
        z = int(ch.get("zoom") or 18)                       # 변화 작업이 받아 둔 그 줌(받아 둔 타일 그대로)
        sa = ch.get("src_a") or {"kind": "ngii", "year": int(ch["year_a"])}
        sb = ch.get("src_b") or {"kind": "ngii", "year": int(ch["year_b"])}
        try:
            A, B = CC._ngii(sa, fr, z), CC._ngii(sb, fr, z)
        except ApiError:
            return None
        sA, sB = _img_stats(A), _img_stats(B)
        st = dict(min(sA, sB, key=lambda x: x["s"]))
        st["diff"] = _diff(A, B, mat["objs"], fr)            # 변화 자리에서 두 해 영상이 얼마나 다른가(숲 → 건물처럼 한눈에)
        return st
    try:
        return _img_stats(CC._raster(mat["path"], fr))
    except ApiError:
        return None


def _total(c: dict, st: dict | None, img_s: float, kind: str) -> float:
    if kind == "change":                                  # 국토 변화 = 두 해가 확 달라 보이는 자리(숲 → 공장 · 건물 → 빈 땅)
        d = min(1.0, (st or {}).get("diff", 0.0) / 70)
        c["diff_s"] = d
        return c["v"] * (0.3 + 0.3 * img_s + 0.4 * d)
    return c["v"] * (0.45 + 0.55 * img_s)


def _diff(A, B, objs, fr) -> float:
    import numpy as np
    from rasterio.features import geometry_mask
    from rasterio.transform import from_bounds as tfb
    from shapely.geometry import box
    bx = box(*fr)
    gs = [g for g, _, _ in objs if g.intersects(bx)]
    if not gs:
        return 0.0
    m = ~geometry_mask(gs, (180, 240), tfb(*fr, 240, 180))
    if not m.any():
        return 0.0
    a = np.asarray(A.convert("RGB").resize((240, 180))).astype(float)
    b = np.asarray(B.convert("RGB").resize((240, 180))).astype(float)
    return float(np.abs(a - b).mean(axis=2)[m].mean())


def _why(c: dict, st: dict | None, kind: str) -> list[str]:
    w = []
    if kind == "change" and c.get("diff_s", 0) >= 0.6:
        w.append("한눈에 보이는 변화")
    elif kind == "change" and c["big_s"] >= 0.8:
        w.append("큰 변화")
    if c["cov_s"] >= 0.9:
        w.append("결과 넓이 알맞음")
    if c["K"] > 1 and c["k"] >= 2:
        w.append("여러 종류")
    if c["conf"] >= 0.7 and kind == "detect":
        w.append("신뢰도 높음")
    if c["cut_s"] >= 0.8:
        w.append("가장자리 잘림 적음")
    if st and st["s"] >= 0.8:
        w.append("영상 깨끗함")
    return w[:3]


async def candidates(conn, source: dict, n: int = 4) -> list[dict]:
    mat = await _objects(conn, source)
    if not mat["objs"]:
        return []
    w = _frame_w(mat["objs"], mat["people"], mat["kind"], bool(mat.get("parcel")), mat.get("change"))

    def go():
        cs = _vector_scores(mat["objs"], w, mat["people"], mat["kind"], top=max(n * 4, 16) if mat["kind"] == "change" or mat.get("parcel") else max(n * 2, 6))
        out = []
        for c in cs:
            st = _img_of(mat, c["fr"])
            img_s = st["s"] if st else 0.0
            if st is None or st["blank"] > BLANK_MAX:          # 10-25 원칙 340 — 영상 빈 곳이 보이는 틀은 점수를 깎지 않고 버린다
                continue
            score = _total(c, st, img_s, mat["kind"])
            out.append({"bbox": CC._frame4326(c["fr"], mat["crs"]), "score": round(score * 100), "why": _why(c, st, mat["kind"]),
                        "opts": mat["opts"]})
        out.sort(key=lambda x: -x["score"])
        return out[:n]
    return await run_in_threadpool(go)


async def score_frame(conn, source: dict, bbox4326) -> int | None:
    """지금 카드 그림 틀의 점수(같은 잣대) — 새 후보가 더 나은지 견줄 때"""
    try:
        mat = await _objects(conn, source)
    except ApiError:
        return None
    if not mat["objs"]:
        return None
    fr = CC._frame(bbox4326, mat["crs"], mat["people"])

    def go():
        K = len({c for _, c, _ in mat["objs"]})
        c = _eval(fr, mat["objs"], _tree(mat["objs"]), K, mat["people"], mat["kind"])
        if not c:
            return 0
        st = _img_of(mat, fr)
        if st is not None and st["blank"] > BLANK_MAX:
            return 0
        img_s = st["s"] if st else 0.0
        return round(_total(c, st, img_s, mat["kind"]) * 100)
    return await run_in_threadpool(go)
