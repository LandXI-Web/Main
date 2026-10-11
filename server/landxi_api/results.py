"""결과(F1-CONTRACT §4.5) — features · shards · stats · PATCH(lx staff) · qa(확장: J1 P/R 봉투).

세트 해석: job_… | results/{tenant}/{job_…} → 그 작업의 detections · results/lx/<이름>(시드 정적 세트) → detections(job_id=세트 id).
v1.1-19 별칭: results/{tenant}/{publish_as}(published_sets 표 · 없으면 manifest.json job_id) → 그 job 의 detections(빈 [] 금지).
v1.1-20 GET /results/{set}/index?format=json|csv|geojson — index_results 월별(봉투 · hist · p10/p50/p90).
v1.1-21 GET /results/{set}/parcels — 필지 FeatureCollection + lx.count + by_emd. 정본 = 저장된 결합 survey_parcel_ai(core-survey ·
contract-parcel-ai.md · 첫 응답 ≤ 3초). 저장이 없는 옛 세트 · min_conf · 기본값이 아닌 min_hit_m2 만 공간 결합(결과 캐시 10분).
기관 세션은 자기 배포본 스냅샷 세트(별칭 포함)와 자기 작업만. 게스트는 export_policy=public·cleared 세트만.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.responses import Response

from . import config
from .catalog import canonical_set, layer_items, tenant_result_sets
from .deps import ApiError, Principal, audit, db, principal, require
from .envelope import RawJSON, env, now_iso

router = APIRouter()
FEATURE_COLS = ("id, fid, cls, cls_en, cid, conf, area_m2, emd, emd_cd, pnu, edit_state, job_id, shard_id, chip_edge, "
                "ST_AsGeoJSON(geom, 7)::json AS g")


async def published_job(set_id: str) -> str | None:
    """이름 붙은 게시 세트 → job_id(v1.1-19). published_sets 표가 정본 · 없으면 manifest.json 항목의 job_id."""
    try:
        async with db(realm="lx") as conn:
            j = await conn.fetchval("SELECT job_id FROM published_sets WHERE set_id=$1", set_id)
        if j:
            return j
    except Exception:
        pass
    try:
        it = config.manifest()["_by_id"].get(set_id.split("/")[-1] + ".pmtiles")
        if it and it.get("job_id") and (it.get("path") or "").startswith(set_id):
            return it["job_id"]
    except Exception:
        pass
    return None


async def resolve(p: Principal, set_or_job: str) -> dict:
    """→ {job_id(detections 키), tenant, demo, kind('job'|'static'|'published'), set}"""
    s = canonical_set(set_or_job)
    job_id = None
    if s.startswith("job_"):
        job_id = s
    elif s.startswith("results/") and s.split("/")[-1].startswith("job_"):
        job_id = s.split("/")[-1]
    if job_id:
        async with db(realm="lx") as conn:
            j = await conn.fetchrow("SELECT id, tenant_id, demo, result_set, submitted_by FROM jobs WHERE id=$1", job_id)
        if not j:
            raise ApiError("not_found", f"job {job_id} 없음")
        if not p.is_lx and p.tenant_id != j["tenant_id"]:
            raise ApiError("forbidden", "다른 기관의 결과")
        return {"job_id": job_id, "tenant": j["tenant_id"], "demo": j["demo"], "kind": "job", "set": j["result_set"]}
    # 정적 세트(또는 이름 붙은 게시 세트)
    pub = await published_job(s) if s.startswith("results/") else None
    if not pub and not await static_set_exists(s):
        # 어디에도 없는 세트 — 200 · total 0('조용한 0')이 화면에 실리지 않게 404(F2-B 1차 판정 불합격 3)
        raise ApiError("not_found", f"결과 세트 {set_or_job} 없음(정적·게시 세트 어디에도 없음)",
                       {"set": set_or_job, "hint": "results/{tenant}/{이름} 또는 job_… 형식"})
    if not p.is_lx:
        ok = False
        if p.realm == "tenant":
            ok = s in await tenant_result_sets(p.tenant_id) or set_or_job in await tenant_result_sets(p.tenant_id)
        if not ok:
            _, items = await layer_items(p, None)
            ok = any(i["set"] == s and i["role"] == "result" for i in items)
        if not ok:
            raise ApiError("forbidden", "이 세션에서 열 수 없는 결과 세트", {"set": set_or_job})
    if pub:
        return {"job_id": pub, "tenant": s.split("/")[1], "demo": False, "kind": "published", "set": s}
    return {"job_id": s, "tenant": "lx", "demo": False, "kind": "static", "set": s}


async def static_set_exists(s: str) -> bool:
    """정적 세트 = config/sets.yaml 의 results/* 키 또는 detections 에 행이 있는 job_id(시드 세트)."""
    if not s.startswith("results/"):
        return False
    if s in (config.load_yaml("sets").get("sets") or {}):
        return True
    async with db(realm="lx") as conn:
        return bool(await conn.fetchval("SELECT EXISTS(SELECT 1 FROM detections WHERE job_id=$1)", s))


def _feature(r) -> dict:
    return {"type": "Feature", "id": r["fid"] or str(r["id"]), "geometry": r["g"],
            "properties": {"id": r["fid"] or str(r["id"]), "cls": r["cls"], "cls_en": r["cls_en"], "cid": r["cid"],
                           "conf": round(float(r["conf"]), 3) if r["conf"] is not None else None,
                           "area_m2": float(r["area_m2"]) if r["area_m2"] is not None else None, "emd": r["emd"], "emd_cd": r["emd_cd"],
                           "pnu": r["pnu"], "edit_state": r["edit_state"], "job_id": r["job_id"], "shard_id": r["shard_id"],
                           "chip_edge": r["chip_edge"]}}


def parse_bbox(bbox: str | None) -> list[float] | None:
    """'minx,miny,maxx,maxy'(경도,위도 순) → 4개 실수. 개수·숫자·순서가 틀리면 500 이 아니라 400."""
    if not bbox:
        return None
    try:
        v = [float(x) for x in bbox.split(",")]
    except ValueError:
        raise ApiError("bad_request", "bbox 는 숫자 네 개(minx,miny,maxx,maxy)", {"bbox": bbox})
    if len(v) != 4 or not all(math.isfinite(x) for x in v):
        raise ApiError("bad_request", "bbox 는 숫자 네 개(minx,miny,maxx,maxy)", {"bbox": bbox})
    if v[0] > v[2] or v[1] > v[3]:
        raise ApiError("bad_request", "bbox 순서가 거꾸로입니다(minx<=maxx, miny<=maxy · 경도,위도 순)", {"bbox": bbox})
    return v


@router.get("/results/{set_path:path}/features")
async def features(set_path: str, request: Request, bbox: str | None = None, cls: str | None = None, limit: int = 2000,
                   offset: int = 0, min_conf: float | None = None):
    p = principal(request)
    rs = await resolve(p, set_path)
    bb = parse_bbox(bbox)
    limit = max(1, min(limit, 10000))
    where = ["job_id=$1", "edit_state <> 'deleted'"]
    args: list = [rs["job_id"]]
    if bb:
        n = len(args)
        args.extend(bb)
        where.append(f"geom && ST_MakeEnvelope(${n+1}::float8, ${n+2}::float8, ${n+3}::float8, ${n+4}::float8, 4326)")
    if cls:
        args.append(cls.split(","))
        where.append(f"(cls = ANY(${len(args)}) OR cls_en = ANY(${len(args)}))")
    if min_conf is not None:
        args.append(min_conf)
        where.append(f"conf >= ${len(args)}")
    w = " AND ".join(where)
    async with db(realm="lx") as conn:
        total = await conn.fetchval(f"SELECT count(*) FROM detections WHERE {w}", *args)
        rows = await conn.fetch(f"SELECT {FEATURE_COLS} FROM detections WHERE {w} ORDER BY id LIMIT {limit} OFFSET {int(offset)}", *args)
    basis = "demo" if rs["demo"] else "inferred"
    fc = {"type": "FeatureCollection", "features": [_feature(r) for r in rows],
          "lx": {"count": env(int(total), "count", basis, f"detections(job_id={rs['job_id']})",
                              "필터 적용 · 검수 전" if (bb or cls or min_conf) else "검수 전"),
                 "total": int(total), "limit": limit, "offset": offset}}
    return RawJSON(fc)


def _shard_dir(tenant: str, job_id: str, demo: bool) -> Path:
    if demo:
        return config.DATA_ROOT / "cache" / "demo" / job_id / "shards"
    return config.DATA_ROOT / "results" / tenant / job_id / "shards"


@router.get("/results/{job_id}/shards/{shard_file}")
async def shard_geojson(job_id: str, shard_file: str, request: Request, exp: str | None = None, sig: str | None = None):
    """세션(Bearer) 또는 shard.done 이 준 서명 쿼리(exp·sig · 12h) — 프론트는 헤더 없이 fetch 한다."""
    from .tiles import verify
    p = principal(request)
    if verify(f"shards/{job_id}", exp, sig):
        async with db(realm="lx") as conn:
            j = await conn.fetchrow("SELECT id, tenant_id, demo FROM jobs WHERE id=$1", job_id)
        if not j:
            raise ApiError("not_found")
        rs = {"job_id": job_id, "tenant": j["tenant_id"], "demo": j["demo"]}
    else:
        rs = await resolve(require(p), job_id)
    if not shard_file.endswith(".geojson") or "/" in shard_file or ".." in shard_file:
        raise ApiError("not_found")
    f = _shard_dir(rs["tenant"], rs["job_id"], rs["demo"]) / shard_file
    if not f.exists():
        raise ApiError("not_found", f"shard {shard_file} 없음")
    return Response(content=f.read_bytes(), media_type="application/geo+json", headers={"Cache-Control": "private, max-age=86400"})


@router.get("/results/{set_path:path}/stats")
async def stats(set_path: str, request: Request, by: str = "emd"):
    p = principal(request)
    rs = await resolve(p, set_path)
    pre = f"results/{rs['set'].split('/')[-1]}-emd-stats.json" if rs["kind"] == "static" else None     # 정적 세트의 미리 계산한 집계(있을 때만)
    if pre and by in ("emd", "cls") and (config.DATA_ROOT / pre).exists():
        src = pre
        d = json.loads((config.DATA_ROOT / src).read_text(encoding="utf-8"))
        items = []
        if by == "emd":
            for nm, e in d["by_emd"].items():
                for cls_, v in e.items():
                    if not isinstance(v, dict):
                        continue
                    items.append({"key": nm, "cd": e.get("cd"), "cls": cls_,
                                  "n": env(v["n"], "polygons", "inferred", src, "검수 전", as_of="2026-09-24"),
                                  "area_ha": env(v["area_ha"], "ha", "inferred", src, as_of="2026-09-24"),
                                  "conf_mean": env(None, "ratio", "inferred", src, "읍면동별 평균 conf 없음(전체만)", as_of="2026-09-24")})
        else:
            for cls_, v in d["total"].items():
                items.append({"key": cls_, "cd": None, "n": env(v["n"], "polygons", "inferred", src, as_of="2026-09-24"),
                              "area_ha": env(v["area_ha"], "ha", "inferred", src, as_of="2026-09-24"),
                              "conf_mean": env(v["conf_mean"], "ratio", "inferred", src, as_of="2026-09-24")})
        tn = sum(v["n"] for v in d["total"].values())
        ta = sum(v["area_ha"] for v in d["total"].values())
        return {"items": items, "total": {"n": env(tn, "polygons", "inferred", src, "검수 전", as_of="2026-09-24"),
                                          "area_ha": env(round(ta, 2), "ha", "inferred", src, as_of="2026-09-24")},
                "source": src, "as_of": now_iso()}
    key = "emd" if by == "emd" else "cls"
    async with db(realm="lx") as conn:
        rows = await conn.fetch(f"SELECT {key} AS k, max(emd_cd) AS cd, count(*) AS n, sum(area_m2)/1e4 AS ha, avg(conf) AS c "
                                f"FROM detections WHERE job_id=$1 AND edit_state<>'deleted' GROUP BY {key} ORDER BY n DESC", rs["job_id"])
    basis = "demo" if rs["demo"] else "inferred"
    src = f"detections(job_id={rs['job_id']}) GROUP BY {key}"
    items = [{"key": r["k"], "cd": r["cd"] if by == "emd" else None, "n": env(int(r["n"]), "count", basis, src),
              "area_ha": env(round(float(r["ha"] or 0), 3), "ha", basis, src),
              "conf_mean": env(round(float(r["c"] or 0), 3), "ratio", basis, src)} for r in rows]
    return {"items": items, "total": {"n": env(sum(int(r["n"]) for r in rows), "count", basis, src),
                                      "area_ha": env(round(sum(float(r["ha"] or 0) for r in rows), 3), "ha", basis, src)},
            "source": src, "as_of": now_iso()}


@router.patch("/results/{job_id}/features/{fid}")
async def patch_feature(job_id: str, fid: str, body: dict, request: Request):
    p = require(principal(request), lx=True, roles=("staff", "admin"))
    rs = await resolve(p, job_id)
    state = body.get("edit_state", "edited")
    if state not in ("edited", "deleted", "raw"):
        raise ApiError("bad_request", "edit_state edited|deleted|raw")
    async with db(realm="lx") as conn:
        row = await conn.fetchrow(f"SELECT {FEATURE_COLS} FROM detections WHERE job_id=$1 AND (fid=$2 OR id::text=$2)", rs["job_id"], fid)
        if not row:
            raise ApiError("not_found", f"feature {fid} 없음")
        sets, args = ["edit_state=$3", "edited_by=$4"], [rs["job_id"], fid, state, p.user_id]
        if body.get("geometry"):
            args.append(json.dumps(body["geometry"]))
            sets.append(f"geom=ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(${len(args)}),4326))")
            sets.append("area_m2=round(ST_Area(ST_Transform(ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($%d),4326)),5186))::numeric,1)" % len(args))
        if body.get("cls"):
            args.append(body["cls"])
            sets.append(f"cls=${len(args)}")
        await conn.execute(f"UPDATE detections SET {', '.join(sets)} WHERE job_id=$1 AND (fid=$2 OR id::text=$2)", *args)
        new = await conn.fetchrow(f"SELECT {FEATURE_COLS} FROM detections WHERE job_id=$1 AND (fid=$2 OR id::text=$2)", rs["job_id"], fid)
        await audit(conn, p, "result.patch", f"{rs['job_id']}/{fid}", {"edit_state": row["edit_state"], "cls": row["cls"]},
                    {"edit_state": state, "cls": new["cls"]})
    return RawJSON(_feature(new))


@router.get("/results/{job_id}/qa")
async def qa(job_id: str, request: Request):
    """확장(계약 변경 요청 §B-1): J1 정답 대비 P/R 봉투 — results/lx/{job}/qa.json."""
    p = require(principal(request))
    rs = await resolve(p, job_id)
    f = config.DATA_ROOT / "results" / rs["tenant"] / rs["job_id"] / "qa.json"
    if rs["demo"]:
        f = config.DATA_ROOT / "cache" / "demo" / rs["job_id"] / "qa.json"
    if not f.exists():
        raise ApiError("not_found", "qa 없음(GT 없는 영상이거나 스냅샷 전)")
    return json.loads(f.read_text(encoding="utf-8"))


# ── v1.1-20 · 지수 결과 ─────────────────────────────────────────────────────────
def _pct_env(v, src, basis):
    return env(round(float(v), 4) if isinstance(v, (int, float)) else None, "ndvi", basis, src)


@router.get("/results/{set_path:path}/index")
async def index_results(set_path: str, request: Request, format: str = "json"):
    p = require(principal(request))
    rs = await resolve(p, set_path)
    async with db(realm="lx") as conn:
        rows = await conn.fetch("SELECT shard_id, key, metrics, at FROM index_results WHERE job_id=$1 ORDER BY key, id", rs["job_id"])
        j = await conn.fetchrow("SELECT kind, model_id, ST_AsGeoJSON(aoi)::json AS aoi, options FROM jobs WHERE id=$1", rs["job_id"])
    if not rows:
        raise ApiError("not_found", f"index_results 없음({rs['job_id']}) — kind index 작업이 아니거나 아직 shard 없음")
    src = f"index_results(job_id={rs['job_id']})"
    items = []
    for x in rows:
        m = x["metrics"] or {}
        basis = m.get("basis") if m.get("basis") in ("measured", "recorded", "estimate", "demo") else "measured"
        nd = m.get("ndvi_mean")
        items.append({
            "shard_id": x["shard_id"], "month": x["key"],
            "ndvi_mean": nd if isinstance(nd, dict) else env(nd, "ndvi", basis, m.get("source") or src, m.get("error")),
            "p10": _pct_env(m.get("p10"), src, basis), "p50": _pct_env(m.get("p50"), src, basis), "p90": _pct_env(m.get("p90"), src, basis),
            "n_scenes": m.get("n_scenes"), "valid_px": env(m.get("valid_px"), "count", basis, src),
            "hist": m.get("hist"), "ms": m.get("ms"), "basis": basis})
    if format == "csv":
        import csv
        import io
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(["month", "ndvi_mean", "p10", "p50", "p90", "n_scenes", "valid_px", "basis", "source"])
        for it in items:
            w.writerow([it["month"], it["ndvi_mean"]["value"], it["p10"]["value"], it["p50"]["value"], it["p90"]["value"], it["n_scenes"],
                        it["valid_px"]["value"], it["basis"], src])
        return Response(content=buf.getvalue().encode("utf-8-sig"), media_type="text/csv; charset=utf-8",
                        headers={"Content-Disposition": f'attachment; filename="{rs["job_id"]}-index.csv"'})
    if format == "geojson":
        fc = {"type": "FeatureCollection", "features": [{"type": "Feature", "geometry": j["aoi"] if j else None,
                                                          "properties": {"job_id": rs["job_id"], "months": items}}]}
        return RawJSON(fc)
    return {"job_id": rs["job_id"], "set": rs["set"], "kind": (j or {}).get("kind") if j else None, "items": items, "total": len(items),
            "source": src, "as_of": now_iso()}


# ── v1.1-21 · 결과 × 필지 결합(에이전트 도구 results_parcels_join) ─────────────────────
_rp_cache: dict = {}
RP_CACHE_S = 600


@router.get("/results/{set_path:path}/parcels")
async def result_parcels(set_path: str, request: Request, cls: str | None = None, jimok: str | None = None, emd_cd: str | None = None,
                         min_conf: float | None = None, limit: int = 2000, min_hit_m2: float = 1.0):
    import time as _t
    p = principal(request)
    rs = await resolve(p, set_path)
    limit = max(1, min(limit, 2000))
    from .deps import pool_sys
    # 관문: resolve() 가 세트·작업 접근을 이미 확인했다. RLS 는 공간 조인의 GIST 사용을 막으므로(보안 장벽 · 비 leakproof ST_Intersects)
    # 시스템 역할로 읽되 기관 격리는 SQL 에 직접(p.tenant_id = 세션 기관) 넣는다.
    sp = await pool_sys()
    t0 = _t.perf_counter()
    async with sp.acquire() as conn, conn.transaction():
        if not await conn.fetchval("SELECT to_regclass('public.survey_parcels') IS NOT NULL"):
            raise ApiError("parcels_unavailable", "survey_parcels 표 없음(F2-S 0002_survey 적재 전)")
        stored = min_conf is None and abs(float(min_hit_m2) - 1.0) < 1e-9 and await conn.fetchval(
            "SELECT to_regclass('public.survey_parcel_ai') IS NOT NULL AND EXISTS(SELECT 1 FROM survey_parcel_ai WHERE job_id=$1)", rs["job_id"])
        ck = (rs["job_id"], cls, jimok, emd_cd, min_conf, limit, float(min_hit_m2), p.tenant_id if p.realm == "tenant" else None)
        hit = None if stored else _rp_cache.get(ck)
        if hit and _t.time() - hit[0] < RP_CACHE_S:
            total, by_emd, rows, geoms, how = hit[1]
        else:
            args: list = [rs["job_id"]]
            pw = []
            if p.realm == "tenant":
                args.append(p.tenant_id)
                pw.append(f"p.tenant_id = ${len(args)}")      # 탐지 쪽은 resolve() 가 허용한 세트(job_id)로 이미 한정
            if jimok:
                args.append(jimok.split(","))
                pw.append(f"(p.jimok = ANY(${len(args)}) OR p.jimok_nm = ANY(${len(args)}))")
            if emd_cd:
                args.append(emd_cd.split(","))
                pw.append(f"p.emd_cd = ANY(${len(args)})")
            await conn.execute("SET LOCAL jit = off")
            if stored:
                how = "stored"
                aw = ["a.job_id=$1"]
                if cls:
                    args.append(cls.split(","))
                    aw.append(f"(a.cls_ko = ANY(${len(args)}) OR a.cls_en = ANY(${len(args)}) OR a.cls = ANY(${len(args)}))")
                # 필지 속성은 결합 표의 사본(emd · jimok · parcel_m2) — 큰 필지 표와 조인하지 않는다(첫 응답 ≤ 3초)
                pw2 = [x.replace("p.", "a.") for x in pw]          # 기관 · 지목 · 읍면동 조건을 결합 표 열로
                await conn.execute("SET LOCAL work_mem = '64MB'")
                await conn.execute(
                    f"CREATE TEMP TABLE _rp ON COMMIT DROP AS "
                    f"SELECT a.pnu, max(a.emd) emd, max(a.emd_cd) emd_cd, max(a.jimok) jimok, max(a.jimok_nm) jimok_nm, max(a.parcel_m2) parcel_m2, "
                    f"sum(a.n1) n, sum(a.hit1_m2) hit_m2, sum(a.conf1_sum) / nullif(sum(a.n1), 0) conf, "
                    f"array_agg(DISTINCT a.cls_ko) FILTER (WHERE a.n1 > 0) classes FROM survey_parcel_ai a "
                    f"WHERE {' AND '.join(aw + pw2)} GROUP BY a.pnu HAVING sum(a.n1) > 0", *args)
            else:
                how = "spatial"
                dw = ["d.job_id=$1", "d.edit_state<>'deleted'"]
                if cls:
                    args.append(cls.split(","))
                    dw.append(f"(d.cls = ANY(${len(args)}) OR d.cls_en = ANY(${len(args)}))")
                if min_conf is not None:
                    args.append(min_conf)
                    dw.append(f"d.conf >= ${len(args)}")
                where_p = (" AND " + " AND ".join(pw)) if pw else ""
                args.append(float(min_hit_m2))
                mh = f"${len(args)}"
                # 한 번만 결합(MATERIALIZED) · 면적은 EPSG:5186 평면 · 완전히 안에 든 탐지는 교차 계산 생략
                await conn.execute(
                    f"CREATE TEMP TABLE _rp ON COMMIT DROP AS "
                    f"WITH pr AS MATERIALIZED (SELECT p.pnu, p.emd, p.emd_cd, p.jimok, p.jimok_nm, p.area_m2 AS parcel_m2, d.conf, d.cls, "
                    f"CASE WHEN ST_Within(d.geom, p.geom) THEN ST_Area(ST_Transform(d.geom, 5186)) "
                    f"ELSE ST_Area(ST_Transform(ST_Intersection(p.geom, d.geom), 5186)) END AS hit "
                    f"FROM detections d JOIN survey_parcels p ON ST_Intersects(p.geom, d.geom) WHERE {' AND '.join(dw)}{where_p}) "
                    f"SELECT pnu, emd, emd_cd, jimok, jimok_nm, parcel_m2, count(*) AS n, sum(hit) AS hit_m2, avg(conf) AS conf, "
                    f"array_agg(DISTINCT cls) AS classes FROM pr WHERE hit >= {mh} GROUP BY pnu, emd, emd_cd, jimok, jimok_nm, parcel_m2", *args)
            total = await conn.fetchval("SELECT count(*) FROM _rp")
            by_emd = [dict(r) for r in await conn.fetch(
                "SELECT emd, emd_cd, count(*) AS parcels, sum(n) AS n FROM _rp GROUP BY 1, 2 ORDER BY 3 DESC, 2")]
            rows = [dict(r) for r in await conn.fetch(
                f"SELECT * FROM _rp ORDER BY hit_m2 DESC NULLS LAST, pnu LIMIT {limit}")]
            geoms = {}
            if rows:
                gr = await conn.fetch("SELECT pnu, ST_AsGeoJSON(geom, 7)::json AS g FROM survey_parcels WHERE pnu = ANY($1)", [x["pnu"] for x in rows])
                geoms = {g["pnu"]: g["g"] for g in gr}
            if not stored:
                _rp_cache[ck] = (_t.time(), (total, by_emd, rows, geoms, "spatial·cache"))
                while len(_rp_cache) > 32:
                    _rp_cache.pop(next(iter(_rp_cache)))
    ms = int((_t.perf_counter() - t0) * 1000)
    basis = "demo" if rs["demo"] else "inferred"
    src = (f"survey_parcel_ai(job_id={rs['job_id']}) × survey_parcels" if how == "stored"
           else f"ST_Intersects(detections(job_id={rs['job_id']}), survey_parcels)")
    feats = [{"type": "Feature", "id": x["pnu"], "geometry": geoms.get(x["pnu"]),
              "properties": {"pnu": x["pnu"], "emd": x["emd"], "emd_cd": x["emd_cd"], "jimok": x["jimok"], "jimok_nm": x["jimok_nm"],
                             "parcel_m2": round(float(x["parcel_m2"] or 0), 1), "n": int(x["n"]), "hit_m2": round(float(x["hit_m2"] or 0), 1),
                             "ratio": round(float(x["hit_m2"] or 0) / float(x["parcel_m2"]), 4) if x["parcel_m2"] else None,
                             "conf_mean": round(float(x["conf"]), 3) if x["conf"] is not None else None, "classes": list(x["classes"] or [])}}
             for x in rows]
    return RawJSON({"type": "FeatureCollection", "features": feats,
                    "lx": {"count": env(int(total), "필지", basis, src, f"검수 전 · 겹침 {min_hit_m2:g} m² 이상 · 필지 경계 연속지적(survey_parcels)"),
                           "total": int(total), "limit": limit, "ms": ms, "how": how,
                           "by_emd": [{"emd": b["emd"], "emd_cd": b["emd_cd"],
                                       "parcels": env(int(b["parcels"]), "필지", basis, src),
                                       "n": env(int(b["n"]), "count", basis, src, "필지와 겹친 탐지 쌍(한 탐지가 여러 필지에 걸치면 중복)")} for b in by_emd],
                           "set": rs["set"], "job_id": rs["job_id"]}})
