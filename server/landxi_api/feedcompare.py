"""사료작물 생육기·생산기 비교 분석(10-24 사용자 "생육기 생산기 카드 각각, 비교 분석 하는 카드 하나 더").

  GET  /api/v1/cards/{cid}/compare/results   이 비교 카드에 넣을 수 있는 내 분석 결과 — 시기마다(생육기 · 생산기 · 곤포사일리지) 끝난 분석 목록
  POST /api/v1/cards/{cid}/compare           {growth, production, silage?} 두 시기 결과를 필지마다 견준다 → 필지별 비교 결과 + 집계

비교 카드 = 카드 판의 modules.compare 에 시기별 원천 카드가 적힌 카드(서비스 정의 한 곳 · 카드 id 를 코드에 적지 않는다).
견주는 자리 = 두 결과가 모두 덮는 곳(분석 범위 ∩ 영상 범위)의 필지(연속지적 survey_parcels) 가운데 넓이의 80% 이상이 그 자리에 든 필지.
필지마다 그 시기 AI 분석 결과 가운데 가장 넓은 작물 = 그 시기 작물(작물 넓이 50㎡ 이상 또는 필지의 10% 이상일 때만 '있음').
비교 결과(같은 말 · 모든 화면): 같은 작물 · 작물 바뀜 · 수확·곤포 확인(생산기에 작물 없음 + 곤포사일리지 있음) · 생산기에 없음 · 생산기에만 있음.
숫자는 이 계산 한 번의 값(AI 분석 결과 · 결과 확인 전) — 지어내지 않는다. 결과를 저장하지 않는다(같은 두 결과면 같은 값).
"""
from __future__ import annotations

import json

from fastapi import APIRouter, Request

from .deps import ApiError, audit, db, principal, require
from .envelope import env, now_iso

router = APIRouter()

MIN_M2, MIN_SHARE, INSIDE = 50.0, 0.10, 0.80       # 작물 '있음' 기준 · 필지가 견주는 자리에 든 비율(서비스 기본값 — 통계 선언 기록과 같은 값)
MAX_PARCELS = 6000
STATUS = ["같은 작물", "작물 바뀜", "수확·곤포 확인", "생산기에 없음", "생산기에만 있음"]
SEASON_WORD = {"growth": "생육기", "production": "생산기", "silage": "곤포사일리지"}


async def _setup(conn, cid: str) -> dict:
    mods = await conn.fetchval("SELECT modules FROM card_versions WHERE card_id=$1 ORDER BY approved_at DESC NULLS LAST, id DESC LIMIT 1", cid)
    if isinstance(mods, str):
        mods = json.loads(mods)
    cmp_ = (mods or {}).get("compare") if isinstance(mods, dict) else None
    if not cmp_ or not cmp_.get("growth") or not cmp_.get("production"):
        raise ApiError("not_found", "비교 분석 카드가 아닙니다")
    return cmp_


def _lx(request: Request):
    p = require(principal(request), lx=True)
    if p.role not in ("staff", "admin"):
        raise ApiError("forbidden", "LX 직원 · 관리자만")
    return p


JOBS_SQL = ("SELECT j.id, j.card_id, j.finished_at, j.options->>'sgg_cd' AS sgg, j.counts, i.name AS iname, i.epoch, i.year, i.gsd_m "
            "FROM jobs j LEFT JOIN imagery i ON i.id=j.imagery_id "
            "WHERE j.kind='infer' AND j.state='done' AND NOT j.demo AND NOT coalesce(j.test,false) AND j.card_id = ANY($1::text[]) "
            "AND (j.submitted_by=$2 OR $3) ORDER BY j.finished_at DESC LIMIT 60")


def _when(r) -> str:
    e = str(r["epoch"] or "")
    return e[:7].replace("-", ".") if len(e) >= 7 else (e[:4] or (str(r["year"]) if r["year"] else ""))


def _item(r) -> dict:
    from .regions import region_of
    rg = region_of(r["sgg"]) if r["sgg"] else None
    cnt = r["counts"] if isinstance(r["counts"], dict) else (json.loads(r["counts"]) if r["counts"] else {})
    n = sum(int(v or 0) for v in (cnt or {}).values())
    nm = r["iname"]
    nm = (nm.get("ko") or nm.get("en")) if isinstance(nm, dict) else (json.loads(nm).get("ko") if isinstance(nm, str) and nm.startswith("{") else nm)
    return {"job": r["id"], "region": (rg or {}).get("name") or "", "sgg_cd": r["sgg"], "imagery": nm or "", "when": _when(r),
            "found": env(n, "count", "inferred", "AI 분석 결과(결과 확인 전)"),
            "finished_at": r["finished_at"].isoformat(timespec="seconds") if r["finished_at"] else None}


@router.get("/cards/{cid}/compare/results")
async def results(cid: str, request: Request):
    p = _lx(request)
    async with db(realm="lx") as conn:
        cm = await _setup(conn, cid)
        out = {}
        for k in ("growth", "production", "silage"):
            src = cm.get(k)
            if not src:
                continue
            name = await conn.fetchval("SELECT name->>'ko' FROM cards WHERE id=$1", src)
            rows = await conn.fetch(JOBS_SQL, [src], p.user_id, bool(p.is_admin))
            out[k] = {"label": SEASON_WORD[k], "card": src, "card_name": name, "items": [_item(r) for r in rows]}
    return {"seasons": out, "rule": _rule(), "as_of": now_iso()}


# 두 결과가 모두 덮는 자리 → 그 안 필지 → 시기별 작물 넓이 → 필지별 비교. 한 번의 SQL(PostGIS · CPU · GPU 를 쓰지 않음)
CMP_SQL = """
WITH ea AS (SELECT CASE WHEN i.footprint IS NOT NULL THEN ST_Intersection(j.aoi, i.footprint) ELSE j.aoi END g
            FROM jobs j LEFT JOIN imagery i ON i.id=j.imagery_id WHERE j.id=$1),
     eb AS (SELECT CASE WHEN i.footprint IS NOT NULL THEN ST_Intersection(j.aoi, i.footprint) ELSE j.aoi END g
            FROM jobs j LEFT JOIN imagery i ON i.id=j.imagery_id WHERE j.id=$2),
     zone AS (SELECT ST_Intersection(ea.g, eb.g) g FROM ea, eb),
     pa AS (SELECT p.pnu, p.addr, p.emd, p.jimok_nm, p.geom, ST_Area(p.geom::geography) pm2 FROM survey_parcels p, zone
            WHERE ST_Intersects(p.geom, zone.g) AND ST_Area(ST_Intersection(p.geom, zone.g)) >= $4 * ST_Area(p.geom) LIMIT $5),
     ca AS (SELECT p.pnu, d.cls, sum(ST_Area(ST_Intersection(ST_MakeValid(d.geom), p.geom)::geography)) m2 FROM pa p
            JOIN detections d ON d.job_id=$1 AND coalesce(d.edit_state,'') <> 'deleted' AND ST_Intersects(d.geom, p.geom) GROUP BY 1, 2),
     cb AS (SELECT p.pnu, d.cls, sum(ST_Area(ST_Intersection(ST_MakeValid(d.geom), p.geom)::geography)) m2 FROM pa p
            JOIN detections d ON d.job_id=$2 AND coalesce(d.edit_state,'') <> 'deleted' AND ST_Intersects(d.geom, p.geom) GROUP BY 1, 2),
     cs AS (SELECT p.pnu, count(*) n FROM pa p
            JOIN detections d ON d.job_id=$3 AND coalesce(d.edit_state,'') <> 'deleted' AND ST_Intersects(d.geom, p.geom) GROUP BY 1)
SELECT p.pnu, p.addr, p.emd, p.jimok_nm, p.pm2,
       (SELECT cls FROM ca WHERE ca.pnu=p.pnu ORDER BY m2 DESC LIMIT 1) a_cls, (SELECT max(m2) FROM ca WHERE ca.pnu=p.pnu) a_top, (SELECT sum(m2) FROM ca WHERE ca.pnu=p.pnu) a_m2,
       (SELECT cls FROM cb WHERE cb.pnu=p.pnu ORDER BY m2 DESC LIMIT 1) b_cls, (SELECT max(m2) FROM cb WHERE cb.pnu=p.pnu) b_top, (SELECT sum(m2) FROM cb WHERE cb.pnu=p.pnu) b_m2,
       coalesce((SELECT n FROM cs WHERE cs.pnu=p.pnu), 0) s_n,
       ST_AsGeoJSON(ST_SimplifyPreserveTopology(p.geom, 0.000005), 7) g,
       (SELECT ST_Area(g::geography) FROM zone) zone_m2
FROM pa p
"""


def _rule() -> dict:
    src = "서비스 기본값(사료작물 비교)"
    return {"text": f"작물 넓이 {MIN_M2:g}㎡ 이상 또는 필지의 {MIN_SHARE:.0%} 이상일 때 그 시기 작물로 셉니다",
            "min_crop": env(MIN_M2, "m2", "recorded", src), "min_share": env(round(MIN_SHARE * 100), "%", "recorded", src),
            "inside": env(round(INSIDE * 100), "%", "recorded", src, "필지 넓이 가운데 두 결과 공통 범위 안 비율")}


def _has(top, pm2) -> bool:
    t = float(top or 0)
    return t >= MIN_M2 or (pm2 and t >= MIN_SHARE * float(pm2))


@router.post("/cards/{cid}/compare")
async def compare(cid: str, body: dict, request: Request):
    p = _lx(request)
    a, b, s = (str(body.get(k) or "") for k in ("growth", "production", "silage"))
    if not a or not b:
        raise ApiError("bad_request", "생육기 결과와 생산기 결과를 하나씩 골라 주세요")
    async with db(realm="lx") as conn:
        cm = await _setup(conn, cid)
        mine = {}
        for k, jid in (("growth", a), ("production", b), ("silage", s)):
            if not jid:
                continue
            r = await conn.fetchrow(JOBS_SQL.replace("ORDER BY j.finished_at DESC LIMIT 60", "AND j.id=$4"), [cm.get(k) or ""], p.user_id, bool(p.is_admin), jid)
            if not r:
                raise ApiError("bad_request", f"고를 수 있는 {SEASON_WORD[k]} 결과가 아닙니다", {"season": k})
            mine[k] = _item(r)
        overlap = await conn.fetchval("SELECT ST_Intersects(a.aoi, b.aoi) FROM jobs a, jobs b WHERE a.id=$1 AND b.id=$2", a, b)
        if not overlap:
            raise ApiError("conflict", "두 결과가 겹치는 곳이 없습니다 — 같은 곳을 찍은 두 시기 영상으로 분석한 결과를 골라 주세요", None, 409)
        rows = await conn.fetch(CMP_SQL, a, b, s or "", INSIDE, MAX_PARCELS)
        await audit(conn, p, "card.compare", cid, None, {"growth": a, "production": b, "silage": s or None, "parcels": len(rows)})
    feats, table = [], []
    src = "AI 분석 결과 두 시기 비교(결과 확인 전)"
    agg = {k: {"n": 0, "m2": 0.0} for k in STATUS}
    for r in rows:
        ha, hb = _has(r["a_top"], r["pm2"]), _has(r["b_top"], r["pm2"])
        if not ha and not hb:
            continue
        if ha and hb:
            st = "같은 작물" if r["a_cls"] == r["b_cls"] else "작물 바뀜"
        elif ha:
            st = "수확·곤포 확인" if r["s_n"] else "생산기에 없음"
        else:
            st = "생산기에만 있음"
        am, bm = round(float(r["a_m2"] or 0)) if ha else 0, round(float(r["b_m2"] or 0)) if hb else 0
        agg[st]["n"] += 1
        agg[st]["m2"] += float(r["pm2"] or 0)
        row = {"pnu": r["pnu"], "addr": r["addr"] or "", "emd": r["emd"] or "", "jimok": r["jimok_nm"] or "", "status": st,
               "growth": r["a_cls"] if ha else None, "production": r["b_cls"] if hb else None,
               "silage": env(int(r["s_n"] or 0), "count", "inferred", src),
               "growth_area": env(am, "m2", "inferred", src), "production_area": env(bm, "m2", "inferred", src),
               "change": env(bm - am, "m2", "inferred", src, "생산기 넓이 − 생육기 넓이(필지 안 작물)")}
        table.append(row)
        feats.append({"type": "Feature", "geometry": json.loads(r["g"]), "properties": {"pnu": r["pnu"], "status": st, "growth": row["growth"], "production": row["production"], "change_m2": bm - am}})
    table.sort(key=lambda x: (STATUS.index(x["status"]), -abs(x["change"]["value"])))
    total = sum(v["n"] for v in agg.values())
    zone = float(rows[0]["zone_m2"]) if rows and rows[0]["zone_m2"] is not None else None
    label = str(body.get("label") or "").strip()[:40]
    if body.get("keep_example") and total:      # 이 한 번을 카드의 결과 예시로 남긴다(LX 직원 · 관리자 · 범위 말은 직원이 적는다 · 숫자는 이 계산 그대로)
        from . import config
        f = config.DATA_ROOT / "cards" / cid / "example.json"
        f.parent.mkdir(parents=True, exist_ok=True)
        day = now_iso()[:10]
        ex = {"value": total, "unit": "필지", "basis": "inferred", "as_of": day, "source": src, "label": "비교한 필지", "word": "비교한 필지",
              "region": label or "두 시기 공통 범위", "sgg": (mine.get("growth") or {}).get("sgg_cd"),
              "by_status": {k: v["n"] for k, v in agg.items()}}
        f.write_text(json.dumps({"example": ex, "inputs": {k: v["job"] for k, v in mine.items()}, "by": p.user_id, "at": now_iso()},
                                ensure_ascii=False, indent=1), encoding="utf-8")
        async with db(realm="lx") as conn:
            await audit(conn, p, "card.compare.example", cid, None, {"label": label, "parcels": total, "inputs": {k: v["job"] for k, v in mine.items()}})
    return {"inputs": mine, "unit": "필지",
            "zone": env(round(zone / 10000, 2) if zone else None, "ha", "measured", "두 결과가 모두 덮는 자리"),
            "total": env(total, "필지", "inferred", src),
            "by_status": [{"status": k, "n": env(v["n"], "필지", "inferred", src), "area_ha": env(round(v["m2"] / 10000, 2), "ha", "inferred", src)} for k, v in agg.items()],
            "rows": table, "geo": {"type": "FeatureCollection", "features": feats},
            "rule": _rule(),
            "as_of": now_iso()}
