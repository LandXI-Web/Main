"""분석 구간 — 모든 분석 서비스 카드가 함께 쓰는 공간 도구(10-24 사용자 "분석 구간 설정하기 … 구간을 업로드 하거나 행정 구역을 설정 … 분석 서비스 카드 모두").

구간은 국토 변화 대상지 표(change_ranges) 한 곳에 둔다 — 국토 변화 카드 · 다른 모든 카드 · 지도 서비스가 같은 줄을 읽는다(원칙 320 · 장부 하나).
만드는 길도 하나(make_range) — 국토 변화의 POST /change/ranges 도 이 함수를 부른다(구역선 파일 읽기 · 좌표계 찾기 · 버퍼는 change/ranges.py 그대로).

POST /ranges                     multipart(file · buffer_m · name) 또는 JSON {name, buffer_m, geojson | pnus | regions[시군구 5자리 · 읍면동 8자리]}
                                 같은 모양 · 같은 거리의 카드 구간이 이미 있으면 새로 만들지 않고 그 구간을 돌려준다
GET  /ranges                     카드에서 만든 구간 · 프로젝트 대상지(최근 50)
GET  /ranges/{id}                구간 모양(4326) + 원래 모양
GET  /ranges/{id}/split?job=     그 결과의 구간 안/밖(분류별 수 · 넓이) + 필지 단위 집계(parcels=1) — 한 번 세고 range_counts 에 둔다
GET  /ranges/{id}/inside?job=    구간 안 객체 번호(지도 서비스가 안/밖을 나눠 칠 때)
"""
from __future__ import annotations

import json
import re
import secrets

from fastapi import APIRouter, Request
from fastapi.concurrency import run_in_threadpool

from .deps import ApiError, audit, db, principal, require
from .envelope import env, now_iso

router = APIRouter()
MAX_BUFFER_M = 1000
KIND_LABEL = {"line": "구간", "pnu": "필지 목록", "region": "행정구역"}


def _lx(p):
    require(p, lx=True)
    if p.role not in ("staff", "admin"):
        raise ApiError("forbidden", "LX 직원 · 관리자만")
    return p


def _mods():
    from change import parcels, ranges
    return parcels, ranges


def range_word(name: str | None, buffer_m) -> str:
    """작업 목록 · 지도 서비스 한 줄 — '구간: 이름 · 100m'(거리 0 이면 거리 없이)."""
    b = int(float(buffer_m or 0))
    return f"구간: {name or '구간'}" + (f" · {b:,}m" if b > 0 else "")


def region_geom(codes: list[str]):
    """시군구(5자리) · 읍면동(8자리) 코드 → 합친 면(4326) · 이름."""
    from shapely.geometry import shape
    from shapely.ops import unary_union

    from .regions import emd_fc, region_of, regions_base
    _, geoms, _ = regions_base()
    gs, names = [], []
    for c in codes:
        c = str(c).strip()
        if re.fullmatch(r"\d{5}", c) and c in geoms:
            gs.append(geoms[c])
            names.append((region_of(c) or {}).get("name") or c)
        elif re.fullmatch(r"\d{8}(00)?", c):
            c = c[:8]
            fc = emd_fc(c[:5])
            f = next((x for x in fc.get("features") or [] if x["properties"].get("emd_cd") == c), None)
            if f:
                gs.append(shape(f["geometry"]))
                names.append(" ".join(x for x in ((region_of(c[:5]) or {}).get("name"), f["properties"].get("name")) if x))
    if not gs:
        raise ApiError("bad_request", "행정구역을 찾지 못했습니다")
    return unary_union(gs).buffer(0), " · ".join(names)


async def _same(p, kind: str, buffer_m: float, line5179, codes: list[str] | None) -> str | None:
    """같은 구간(같은 모양 · 같은 거리 · 카드에서 만든 것)이 있으면 그 id — 다시 만들지 않는다."""
    from shapely import to_wkb
    async with db(p) as conn:
        if codes:
            return await conn.fetchval("SELECT id FROM change_ranges WHERE kind=$1 AND buffer_m=$2 AND codes=$3 AND origin='card' AND project_id IS NULL "
                                       "ORDER BY created_at DESC LIMIT 1", kind, buffer_m, sorted(codes))
        return await conn.fetchval("SELECT id FROM change_ranges WHERE kind=$1 AND buffer_m=$2 AND origin='card' AND project_id IS NULL "
                                   "AND ST_Equals(line, ST_SetSRID(ST_GeomFromWKB($3),5179)) ORDER BY created_at DESC LIMIT 1",
                                   kind, buffer_m, to_wkb(line5179))


async def _area_km2(p, rid: str) -> float:
    async with db(p) as conn:
        return float(await conn.fetchval("SELECT ST_Area(geom)/1e6 FROM change_ranges WHERE id=$1", rid) or 0)


async def _save(p, *, name: str, kind: str, buffer_m: float, line5179, rng5179, source_name: str | None,
                project_id: str | None, years: list[int], origin: str | None, codes: list[str] | None) -> str:
    P, R = _mods()
    from shapely import to_wkb
    from shapely.geometry import MultiPolygon
    sgg = await run_in_threadpool(P.sgg_codes_for, R.to4326(rng5179))
    mp = rng5179 if rng5179.geom_type == "MultiPolygon" else MultiPolygon([rng5179])
    rid = "rng_" + secrets.token_hex(6)
    async with db(p) as conn:
        await conn.execute(
            "INSERT INTO change_ranges(id, tenant_id, project_id, name, kind, buffer_m, line, geom, sgg, years, source_name, created_by, origin, codes) "
            "VALUES ($1,$2,$3,$4,$5,$6, ST_SetSRID(ST_GeomFromWKB($7),5179), ST_SetSRID(ST_GeomFromWKB($8),5179), $9,$10,$11,$12,$13,$14)",
            rid, "lx" if p.is_lx else p.tenant_id, project_id, name[:120], kind, buffer_m, to_wkb(line5179), to_wkb(mp), sgg, years,
            source_name, p.user_id, origin, sorted(codes) if codes else None)
        await audit(conn, p, "change.range.create", rid, None, {"name": name, "kind": kind, "buffer_m": buffer_m, "project_id": project_id, "origin": origin})
    return rid


SPLIT_MAX_KM2 = 3000.0      # 결과를 나눠 보기만 하는 카드 구간 — 가장 넓은 시군구(약 1,800㎢)도 들어간다


async def make_range(request: Request, max_km2: float | None = None) -> tuple:
    """올린 파일 · PNU 목록 · 행정구역 → 구간 id(같은 구간이 있으면 그것). → (principal, range_id).
    max_km2 = 국토 변화는 영상을 받아 두 번 분석하므로 60㎢(change/ranges.MAX_KM2) · 다른 카드는 SPLIT_MAX_KM2."""
    p = _lx(principal(request))
    P, R = _mods()
    ct = request.headers.get("content-type", "")
    years: list[int] = []
    codes: list[str] | None = None
    if ct.startswith("multipart/"):
        form = await request.form()
        f = form.get("file")
        if f is None:
            raise ApiError("bad_request", "파일이 없습니다")
        data = await f.read()
        if len(data) > 30 * 1024 * 1024:
            raise ApiError("too_large", "30MB 아래 파일로 올려 주세요")
        name = str(form.get("name") or f.filename or "구역선")
        buffer_m = float(form.get("buffer_m") or 0)
        project_id = form.get("project_id") or None
        origin = "card" if form.get("origin") == "card" else None
        years = [int(y) for y in re.findall(r"\d{4}", str(form.get("years") or ""))]
        kind = "line"
        src = f.filename
        if str(f.filename or "").lower().endswith((".txt", ".csv")):
            kind = "pnu"
            g = await run_in_threadpool(P.by_pnus, P.parse_pnus(data.decode("utf-8", "ignore")))
            if not len(g):
                raise ApiError("bad_request", "필지(PNU)를 찾지 못했습니다")
            line = await run_in_threadpool(R.union5179, g)
        else:
            try:
                g = await run_in_threadpool(R.read_vector, f.filename or "x.geojson", data)
            except R.RangeError as e:
                raise ApiError("bad_request", str(e)) from None
            line = await run_in_threadpool(R.union5179, g)
    else:
        body = await request.json()
        name = str(body.get("name") or "대상지")
        buffer_m = float(body.get("buffer_m") or 0)
        project_id = body.get("project_id")
        origin = "card" if body.get("origin") == "card" else None
        years = [int(y) for y in body.get("years") or []]
        src = body.get("source_name")
        if body.get("geojson"):
            kind = "line"
            try:
                g = await run_in_threadpool(R.from_geojson, body["geojson"])
            except R.RangeError as e:
                raise ApiError("bad_request", str(e)) from None
            line = await run_in_threadpool(R.union5179, g)
        elif body.get("pnus"):
            kind = "pnu"
            pn = P.parse_pnus(" ".join(map(str, body["pnus"])) if isinstance(body["pnus"], list) else str(body["pnus"]))
            g = await run_in_threadpool(P.by_pnus, pn)
            if not len(g):
                raise ApiError("bad_request", "필지(PNU)를 찾지 못했습니다")
            line = await run_in_threadpool(R.union5179, g)
        elif body.get("regions"):
            kind = "region"
            codes = [str(c)[:8] if len(str(c)) == 10 else str(c) for c in body["regions"]][:20]
            g4326, nm = await run_in_threadpool(region_geom, codes)
            if not body.get("name"):
                name = nm
            line = R.to5179(g4326)
        else:
            raise ApiError("bad_request", "구간 파일 · PNU 목록 · 행정구역 가운데 하나")
    buffer_m = max(0.0, min(float(buffer_m), float(MAX_BUFFER_M)))
    lim = float(max_km2 or SPLIT_MAX_KM2)
    if origin == "card" and not project_id:
        hit = await _same(p, kind, buffer_m, line, codes)
        if hit and (lim >= SPLIT_MAX_KM2 or await _area_km2(p, hit) <= lim):
            return p, hit
    try:
        rng = await run_in_threadpool(R.build, line, buffer_m, lim)
    except R.RangeError as e:
        raise ApiError("bad_request", str(e)) from None
    rid = await _save(p, name=name, kind=kind, buffer_m=buffer_m, line5179=line, rng5179=rng, source_name=src,
                      project_id=project_id, years=years, origin=origin, codes=codes)
    return p, rid


async def get_row(p, rid: str) -> dict:
    from .change import get_range_row
    return await get_range_row(p, rid)


def out(d: dict) -> dict:
    from .change import range_out
    o = range_out(d)
    o["word"] = range_word(d["name"], d["buffer_m"])
    return o


async def for_job(p, rid: str, sgg: str | None = None) -> dict:
    """분석 시작에 붙일 구간 — 있는지 · 그 시군구에 걸치는지 보고 작업 기록에 넣을 값."""
    d = await get_row(p, rid)
    if sgg and d.get("sgg") and sgg not in list(d["sgg"]):
        raise ApiError("bad_request", "고른 구간이 이 지역에 없습니다", {"range": rid, "region": sgg})
    return {"id": d["id"], "name": d["name"], "kind": d["kind"], "buffer_m": int(float(d["buffer_m"] or 0)),
            "word": range_word(d["name"], d["buffer_m"])}


# ── 화면 길 ──────────────────────────────────────────────────────────────────
@router.post("/ranges")
async def create(request: Request):
    p, rid = await make_range(request)
    return out(await get_row(p, rid))


@router.get("/ranges")
async def list_(request: Request, kind: str | None = None):
    p = _lx(principal(request))
    async with db(p) as conn:
        rows = await conn.fetch("SELECT id FROM change_ranges WHERE (project_id IS NOT NULL OR origin='card') AND ($1::text IS NULL OR kind=$1) "
                                "ORDER BY created_at DESC LIMIT 50", kind)
    return {"items": [out(await get_row(p, r["id"])) for r in rows], "as_of": now_iso()}


@router.get("/ranges/{rid}")
async def get(rid: str, request: Request):
    p = _lx(principal(request))
    return out(await get_row(p, rid))


async def _job_ok(p, job: str) -> dict:
    from .staff_home import my_job
    x = await my_job(p, job)
    if not x:
        raise ApiError("not_found", "이 계정의 지도 서비스에 없는 결과입니다")
    return x


async def _stamp(conn, job: str) -> str:
    """결과 판 — 객체 수 · 지운 수 · 고친 수 · 작업 끝난 시각(결과를 고치면 다시 센다)."""
    r = await conn.fetchrow("SELECT count(*) n, count(*) FILTER (WHERE edit_state='deleted') x, count(*) FILTER (WHERE coalesce(edit_state,'') NOT IN ('', 'ai', 'deleted')) e, "
                            "(SELECT finished_at::text FROM jobs WHERE id=$1) f FROM detections WHERE job_id=$1", job)
    return f"{r['n']}|{r['x']}|{r['e']}|{r['f'] or ''}"


def _inside_sql(extra: str = "") -> str:
    # 객체의 대표점이 구간 안이면 안(경계에 걸친 객체를 두 번 세지 않는다 · 구간 면 = 원래 모양 + 거리)
    return ("WITH r AS MATERIALIZED (SELECT ST_Transform(geom,4326) g FROM change_ranges WHERE id=$2) "
            "SELECT d.id, d.fid, d.cls, d.area_m2, d.emd, d.emd_cd, d.geom, ST_Intersects(r.g, ST_PointOnSurface(d.geom)) AS inn "
            f"FROM detections d, r WHERE d.job_id=$1 AND d.edit_state<>'deleted'{extra}")


async def split(p, rid: str, job: str, parcels: bool = False) -> dict:
    """결과 × 구간 → 안/밖(분류별 수 · 넓이) + 읍면동별(안) + 필지 단위 집계(켰을 때). 한 번 센 것은 range_counts 에서."""
    from .deps import pool_sys
    from .result_scope import only_cls, only_sql
    from .spaces import CLASS_KO
    d = await get_row(p, rid)
    async with db(realm="lx") as conn:
        stamp = await _stamp(conn, job)
        tool = "split+parcels" if parcels else "split"
        hit = await conn.fetchrow("SELECT out, stamp FROM range_counts WHERE job_id=$1 AND range_id=$2 AND tool=$3 AND val=''", job, rid, tool)
        if hit and hit["stamp"] == stamp:
            o = hit["out"] if isinstance(hit["out"], dict) else json.loads(hit["out"])
            return {**o, "cached": True}
        await only_cls(conn)
        args: list = [job, rid]
        ow = "".join(" AND " + x for x in only_sql(job, args, "d"))
        rows = await conn.fetch(f"WITH x AS ({_inside_sql(ow)}) SELECT inn, cls, count(*) n, coalesce(sum(area_m2),0) a FROM x GROUP BY inn, cls ORDER BY n DESC", *args)
        emd = await conn.fetch(f"WITH x AS ({_inside_sql(ow)}) SELECT emd, emd_cd, count(*) n FROM x WHERE inn GROUP BY emd, emd_cd ORDER BY n DESC LIMIT 50", *args)
    src = f"detections(job_id={job}) × change_ranges({rid})"

    def side(flag: bool) -> dict:
        rs = [r for r in rows if r["inn"] is flag]
        return {"n": env(sum(int(r["n"]) for r in rs), "count", "inferred", src, "검수 전"),
                "area_m2": env(round(sum(float(r["a"]) for r in rs), 1), "m2", "inferred", src),
                "by_class": [{"cls": CLASS_KO.get(r["cls"], r["cls"]), "n": int(r["n"]), "area_m2": env(round(float(r["a"]), 1), "m2", "inferred", src)} for r in rs]}
    o = {"range": out(d) | {"geometry": None, "line": None}, "job": job, "inside": side(True), "outside": side(False),
         "by_emd": [{"emd": r["emd"] or "", "emd_cd": r["emd_cd"], "n": int(r["n"])} for r in emd], "parcels": None, "as_of": now_iso()}
    if parcels:
        sp = await pool_sys()
        async with sp.acquire() as conn, conn.transaction():
            await conn.execute("SET LOCAL jit = off")
            if await conn.fetchval("SELECT to_regclass('public.survey_parcels') IS NOT NULL"):
                args2: list = [job, rid]
                ow2 = "".join(" AND " + x for x in only_sql(job, args2, "d"))
                pr = await conn.fetch(
                    f"WITH x AS MATERIALIZED ({_inside_sql(ow2)}), i AS MATERIALIZED (SELECT geom FROM x WHERE inn), "
                    "pp AS (SELECT p.pnu, max(p.emd) emd, max(p.jimok_nm) jimok_nm, max(p.area_m2) parcel_m2, "
                    "sum(ST_Area(ST_Transform(ST_Intersection(p.geom, i.geom), 5186))) hit "
                    "FROM i JOIN survey_parcels p ON ST_Intersects(p.geom, i.geom) GROUP BY p.pnu) "
                    "SELECT emd, jimok_nm, count(*) n, sum(hit) hit, sum(parcel_m2) pm FROM pp WHERE hit >= 1 GROUP BY emd, jimok_nm", *args2)
                psrc = f"{src} × survey_parcels"
                by_emd: dict = {}
                by_jimok: dict = {}
                for r in pr:
                    by_emd[r["emd"] or ""] = by_emd.get(r["emd"] or "", 0) + int(r["n"])
                    by_jimok[r["jimok_nm"] or "미상"] = by_jimok.get(r["jimok_nm"] or "미상", 0) + int(r["n"])
                o["parcels"] = {"n": env(sum(int(r["n"]) for r in pr), "필지", "inferred", psrc, "구간 안 결과와 겹친 필지 · 겹침 1㎡ 이상"),
                                "area_m2": env(round(sum(float(r["hit"] or 0) for r in pr), 1), "m2", "inferred", psrc, "필지 안 결과 넓이"),
                                "by_emd": [{"emd": k, "n": v} for k, v in sorted(by_emd.items(), key=lambda x: -x[1])],
                                "by_jimok": [{"jimok": k, "n": v} for k, v in sorted(by_jimok.items(), key=lambda x: -x[1])]}
    async with db(realm="lx") as conn:
        await conn.execute("INSERT INTO range_counts(job_id, range_id, tool, val, stamp, out) VALUES ($1,$2,$3,'',$4,$5) "
                           "ON CONFLICT (job_id, range_id, tool, val) DO UPDATE SET stamp=EXCLUDED.stamp, out=EXCLUDED.out, at=now()",
                           job, rid, tool, stamp, json.dumps(o, ensure_ascii=False, default=str))
    return {**o, "cached": False}


@router.get("/ranges/{rid}/split")
async def get_split(rid: str, request: Request, job: str, parcels: int = 0):
    p = _lx(principal(request))
    await _job_ok(p, job)
    return await split(p, rid, job, bool(parcels))


@router.get("/ranges/{rid}/inside")
async def get_inside(rid: str, request: Request, job: str):
    """구간 안 객체 번호(지도 결과 타일의 id 와 같은 값) — 지도 서비스가 밖을 옅게 칠 때."""
    p = _lx(principal(request))
    await _job_ok(p, job)
    await get_row(p, rid)
    from .result_scope import only_cls, only_sql
    async with db(realm="lx") as conn:
        await only_cls(conn)
        args: list = [job, rid]
        ow = "".join(" AND " + x for x in only_sql(job, args, "d"))
        rows = await conn.fetch(f"WITH x AS ({_inside_sql(ow)}) SELECT coalesce(fid, id::text) k FROM x WHERE inn LIMIT 50000", *args)
    return {"ids": [r["k"] for r in rows], "n": len(rows), "as_of": now_iso()}
