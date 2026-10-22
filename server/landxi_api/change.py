"""국토 변화 분석서비스(변화 탐지) API — 대상지(범위) · 연도 · 실행 · 결과 · 필지 교차 · 썸네일.

독립 모듈(기존 분석 서비스 · 프로젝트 표는 바꾸지 않음 · 0124 표 넷). 추론은 작업 대기열(jobs · kind 'index' · 모델 change-ap25)로만.
같은 범위 · 같은 두 해 · 같은 계산 방식(run.VERSION)의 끝난 결과가 있으면 다시 돌리지 않고 그것을 쓴다(캐시).

GET  /change/years?range_id=|bbox=          쓸 수 있는 국토지리정보원 영상 연도(가장 고운 줌)
POST /change/ranges                         구역선 파일(+버퍼 m) · PNU 목록 · 행정구역 → 범위
GET  /change/ranges?project_id=             범위 목록 · GET /change/ranges/{id} 범위(4326) + 구역선 + 연도
POST /change/ranges/{id}/project            프로젝트 연결 · 고른 연도
POST /change/runs                           {range_id, year_a, year_b} → 캐시 또는 작업 제출
GET  /change/runs/{job}                     상태 · 요약(봉투)
GET  /change/runs/{job}/features            변화 폴리곤(GeoJSON · 판정 상태 포함)
GET  /change/runs/{job}/thumbs/{fid}_{a|b}.png
GET  /change/runs/{job}/parcels             필지 교차 표(유형 · 지목 · 소유구분 · 구역 안/밖 거름) · ?format=csv
GET  /change/latest?project_id=|range_id=   그 범위의 최근 끝난 결과
"""
from __future__ import annotations

import csv
import io
import json
import re
import secrets

from fastapi import APIRouter, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse, Response

from .deps import ApiError, audit, db, principal, require
from .envelope import env, now_iso

router = APIRouter()
TYPES = ["신축", "소실", "경작 전환", "포장 확대", "식생 증감"]
STATUSES = ["미확인", "불법", "적법", "현장확인", "철거완료"]
JOB_RE = re.compile(r"^(job_[0-9A-Z]{10,40}|_test_cpu)$")


class _Run:
    """계산 모듈(change/run.py)을 게이트웨이에서 불러오지 않는다 — 그 모듈은 토지피복 모델(torch)을 끌어와 게이트웨이 첫 요청이 수십 초 걸렸다(10-22 시험).
    결과 폴더 · 계산 판만 같은 규칙으로."""
    @staticmethod
    def run_dir(run_id: str):
        from change import DATA
        return DATA / "runs" / run_id


def _mods():
    from change import imagery, parcels, ranges
    return imagery, parcels, ranges, _Run


def _ver() -> str:
    """계산 방식 판(캐시 열쇠) — 워커가 계산 모듈을 다시 읽으므로 게이트웨이도 파일에서 그때그때 읽는다(재시작 없이 같은 판)."""
    from pathlib import Path
    try:
        import change
        m = re.search(r'^VERSION\s*=\s*"([^"]+)"', (Path(change.__file__).parent / "run.py").read_text(encoding="utf-8"), re.M)
        return m.group(1) if m else "change-?"
    except Exception:  # noqa: BLE001
        return "change-?"


def _lx(p):
    require(p, lx=True)
    if p.role not in ("staff", "admin"):
        raise ApiError("forbidden", "LX 직원 · 관리자만")
    return p


# ── 연도 ───────────────────────────────────────────────────────────────────
async def years_for_bounds(bounds5179) -> dict[int, int]:
    I, *_ = _mods()
    return await run_in_threadpool(I.available_years, bounds5179)


async def ensure_year_layers(av: dict[int, int]):
    """영상 비교(가르기)에 그 해 층이 없으면(옛 해 · 전국 분석이 쓰지 않는 해) 영상 표에 한 줄 — 국토지리정보원 영상 API(저장 없음).
    footprint 없음 = 영상 목록 · 영상 고르기 · 전국 분석 연도 목록(2020~)에 나오지 않는다(national.ensure_imagery 와 같은 모양)."""
    from change import imagery as I
    from . import config
    async with db(realm="lx") as conn:
        have = {r["year"] for r in await conn.fetch("SELECT year FROM imagery WHERE id LIKE 'nat-ngii-air-%'")}
        for y, z in av.items():
            if y in have:
                continue
            xp = await run_in_threadpool(I.ngii_layer_xml, y, z)
            await conn.execute(
                "INSERT INTO imagery(id, name, tier, gsd_m, epoch, crs, path_internal, license, attribution, export_policy, rights_holder, kind, layer, year, "
                "registered_by, registered_at) VALUES ($1,$2,'raw',$3,$4,'EPSG:5179',$5,$6,'국토지리정보원','never','국토지리정보원','ortho',$7,$8,'national',now()) "
                "ON CONFLICT (id) DO NOTHING",
                f"nat-ngii-air-{y}", {"ko": f"국토지리정보원 항공 정사영상 {y} · 영상 API", "en": f"NGII aerial ortho {y} · tile API"},
                0.255 if z == 18 else 0.51, str(y), xp.relative_to(config.DATA_ROOT).as_posix(), "공개 영상 API — 영상은 저장하지 않고 분석 결과만 저장",
                {"role": "change-compare", "source": "ngii-air-wmts", "year": y, "zoom": z}, y)


def years_out(av: dict[int, int]) -> list[dict]:
    return [{"year": y, "zoom": z, "label": f"{y}년", "gsd_m": 0.255 if z == 18 else 0.51} for y, z in sorted(av.items())]


@router.get("/change/years")
async def years(request: Request, range_id: str | None = None, bbox: str | None = None):
    p = require(principal(request))
    if range_id:
        rg = await get_range_row(p, range_id)
        b = rg["bounds"]
    elif bbox:
        _, _, R, _ = _mods()
        from shapely.geometry import box
        x = [float(v) for v in bbox.split(",")]
        b = R.to5179(box(*x)).bounds
    else:
        raise ApiError("bad_request", "range_id 또는 bbox")
    av = await years_for_bounds(b)
    await ensure_year_layers(av)
    ys = sorted(av)
    return {"years": years_out(av), "default": [{"year": y} for y in ([ys[0], ys[-1]] if len(ys) >= 2 else ys)], "source": "국토지리정보원 항공정사영상"}


# ── 범위 ───────────────────────────────────────────────────────────────────
async def get_range_row(p, rid: str) -> dict:
    async with db(p) as conn:
        r = await conn.fetchrow(
            "SELECT id, tenant_id, project_id, name, kind, buffer_m, sgg, years, source_name, created_at, "
            "ST_AsGeoJSON(ST_Transform(geom,4326), 7)::json AS g, ST_AsGeoJSON(ST_Transform(ST_SimplifyPreserveTopology(line, 1.0),4326), 7)::json AS l, "
            "ST_Area(geom) AS m2, ST_XMin(geom) x0, ST_YMin(geom) y0, ST_XMax(geom) x1, ST_YMax(geom) y1, "
            "ST_AsGeoJSON(ST_Transform(ST_Envelope(geom),4326))::json AS env4326 FROM change_ranges WHERE id=$1", rid)
    if not r:
        raise ApiError("not_found", "범위를 찾을 수 없습니다")
    d = dict(r)
    d["bounds"] = (d.pop("x0"), d.pop("y0"), d.pop("x1"), d.pop("y1"))
    return d


def range_out(d: dict, av: dict | None = None) -> dict:
    from shapely.geometry import shape
    e = shape(d["env4326"]).bounds
    out = {"id": d["id"], "name": d["name"], "kind": d["kind"], "kind_label": {"line": "구역선", "pnu": "필지 목록", "region": "행정구역"}[d["kind"]],
           "buffer": f"{int(float(d['buffer_m'] or 0))}m", "project_id": d.get("project_id"), "sgg": list(d.get("sgg") or []),
           "years": [{"year": int(y)} for y in (d.get("years") or [])], "area": env(round(float(d["m2"]) / 1e6, 3), "km2", "measured", "범위 면적(EPSG:5179)"),
           "bbox": [round(v, 6) for v in e], "geometry": d["g"], "line": d["l"], "source_name": d.get("source_name")}
    if av is not None:
        out["imagery_years"] = years_out(av)
    return out


async def _save_range(p, *, name: str, kind: str, buffer_m: float, line5179, rng5179, source_name: str | None,
                      project_id: str | None, years: list[int]) -> str:
    _, P, R, _ = _mods()
    from shapely import to_wkb
    from shapely.geometry import MultiPolygon
    sgg = await run_in_threadpool(P.sgg_codes_for, R.to4326(rng5179))
    mp = rng5179 if rng5179.geom_type == "MultiPolygon" else MultiPolygon([rng5179])
    rid = "rng_" + secrets.token_hex(6)
    async with db(p) as conn:
        await conn.execute(
            "INSERT INTO change_ranges(id, tenant_id, project_id, name, kind, buffer_m, line, geom, sgg, years, source_name, created_by) "
            "VALUES ($1,$2,$3,$4,$5,$6, ST_SetSRID(ST_GeomFromWKB($7),5179), ST_SetSRID(ST_GeomFromWKB($8),5179), $9,$10,$11,$12)",
            rid, "lx" if p.is_lx else p.tenant_id, project_id, name[:120], kind, buffer_m, to_wkb(line5179), to_wkb(mp), sgg, years,
            source_name, p.user_id)
        await audit(conn, p, "change.range.create", rid, None, {"name": name, "kind": kind, "buffer_m": buffer_m, "project_id": project_id})
    return rid


@router.post("/change/ranges")
async def create_range(request: Request):
    """multipart(file · buffer_m · name · project_id · years) 또는 JSON {name, buffer_m, geojson | pnus | regions, project_id, years}."""
    p = _lx(principal(request))
    _, P, R, _ = _mods()
    ct = request.headers.get("content-type", "")
    years: list[int] = []
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
        years = [int(y) for y in re.findall(r"\d{4}", str(form.get("years") or ""))]
        kind = "line"
        src = f.filename
        if str(f.filename or "").lower().endswith((".txt", ".csv")):
            kind = "pnu"
            pn = P.parse_pnus(data.decode("utf-8", "ignore"))
            g = await run_in_threadpool(P.by_pnus, pn)
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
            from shapely.ops import unary_union

            from .regions import regions_base
            _, geoms, _ = regions_base()
            gs = [geoms[c] for c in body["regions"] if c in geoms]
            if not gs:
                raise ApiError("bad_request", "행정구역을 찾지 못했습니다")
            line = R.to5179(unary_union(gs))
        else:
            raise ApiError("bad_request", "구역선 파일 · PNU 목록 · 행정구역 가운데 하나")
    try:
        rng = await run_in_threadpool(R.build, line, buffer_m)
    except R.RangeError as e:
        raise ApiError("bad_request", str(e)) from None
    rid = await _save_range(p, name=name, kind=kind, buffer_m=buffer_m, line5179=line, rng5179=rng, source_name=src,
                            project_id=project_id, years=years)
    d = await get_range_row(p, rid)
    av = await years_for_bounds(d["bounds"])
    await ensure_year_layers(av)
    return range_out(d, av)


@router.get("/change/ranges")
async def list_ranges(request: Request, project_id: str | None = None, all: int = 0):
    """기본 = 프로젝트에 묶인 대상지만(새 프로젝트 창에서 올리다 만 범위는 빼고) · all=1 이면 전부."""
    p = require(principal(request))
    async with db(p) as conn:
        rows = await conn.fetch("SELECT id FROM change_ranges WHERE ($1::text IS NULL OR project_id=$1) AND ($2 OR project_id IS NOT NULL) "
                                "ORDER BY created_at DESC LIMIT 50", project_id, bool(all))
    out = []
    for r in rows:
        out.append(range_out(await get_range_row(p, r["id"])))
    return {"items": out}


@router.get("/change/ranges/{rid}")
async def get_range(rid: str, request: Request, years: int = 1):
    p = require(principal(request))
    d = await get_range_row(p, rid)
    return range_out(d, await years_for_bounds(d["bounds"]) if years else None)


@router.post("/change/ranges/{rid}/project")
async def link_project(rid: str, body: dict, request: Request):
    p = _lx(principal(request))
    ys = [int(y) for y in body.get("years") or []]
    async with db(p) as conn:
        await conn.execute("UPDATE change_ranges SET project_id=coalesce($2, project_id), years=CASE WHEN cardinality($3::int[])>0 THEN $3 ELSE years END, "
                           "name=coalesce(nullif($4,''), name) WHERE id=$1", rid, body.get("project_id"), ys, str(body.get("name") or "")[:120])
        await audit(conn, p, "change.range.project", rid, None, {"project_id": body.get("project_id"), "years": ys})
    return range_out(await get_range_row(p, rid))


# ── 실행 ───────────────────────────────────────────────────────────────────
async def cached_run(p, range_id: str, year_a: int, year_b: int) -> dict | None:
    _, _, _, RUN = _mods()
    async with db(p) as conn:
        r = await conn.fetchrow("SELECT job_id, state FROM change_runs WHERE range_id=$1 AND year_a=$2 AND year_b=$3 AND version=$4 "
                                "AND state IN ('done','queued','running') ORDER BY (state='done') DESC, created_at DESC LIMIT 1",
                                range_id, year_a, year_b, _ver())
    return dict(r) if r else None


async def start_run(request: Request, p, range_id: str, year_a: int, year_b: int, fresh: bool = False) -> dict:
    """캐시(끝났거나 도는 중)가 있으면 그것 · 없으면 작업 제출. → {job_id, cached, state, zoom}"""
    I, _, R, RUN = _mods()
    d = await get_range_row(p, range_id)
    if year_a == year_b:
        raise ApiError("bad_request", "서로 다른 두 해를 골라 주세요")
    year_a, year_b = sorted([year_a, year_b])
    if not fresh:
        c = await cached_run(p, range_id, year_a, year_b)
        if c:
            return {"job_id": c["job_id"], "cached": c["state"] == "done", "state": c["state"], "range": range_out(d)}
    _lx(p)
    av = await years_for_bounds(d["bounds"])
    await ensure_year_layers(av)
    z = I.common_zoom(av, year_a, year_b)
    if not z:
        miss = [y for y in (year_a, year_b) if y not in av]
        raise ApiError("no_imagery", f"{', '.join(f'{y}년' for y in miss)} 영상이 이 범위에 없습니다",
                       {"years": sorted(av)}, status=409)
    from . import jobs as J
    body = {"kind": "index", "model_id": "change-ap25", "card_id": "card-change", "label": f"변화 탐지 · {d['name']} · {year_a}↔{year_b}",
            "options": {"change": {"range_id": range_id, "year_a": year_a, "year_b": year_b, "zoom": z, "version": _ver(),
                                   "bbox4326": range_out(d)["bbox"]}}}
    res = await J.submit(body, request)
    jid = res["job"]["id"]
    async with db(p) as conn:
        await conn.execute("INSERT INTO change_runs(job_id, range_id, tenant_id, year_a, year_b, zoom, version, state, created_by) "
                           "VALUES ($1,$2,'lx',$3,$4,$5,$6,'queued',$7) ON CONFLICT (job_id) DO NOTHING",
                           jid, range_id, year_a, year_b, z, _ver(), p.user_id)
    return {"job_id": jid, "cached": False, "state": "queued", "zoom": z, "range": range_out(d), "events_url": res.get("events_url")}


@router.post("/change/runs", status_code=202)
async def create_run(body: dict, request: Request):
    p = require(principal(request))
    return await start_run(request, p, str(body.get("range_id") or ""), int(body.get("year_a") or 0), int(body.get("year_b") or 0),
                           bool(body.get("fresh")))


async def run_row(p, job_id: str) -> dict:
    if not JOB_RE.match(job_id or ""):
        raise ApiError("not_found", "결과를 찾을 수 없습니다")
    async with db(p) as conn:
        r = await conn.fetchrow("SELECT r.*, g.name AS range_name, g.project_id FROM change_runs r JOIN change_ranges g ON g.id=r.range_id WHERE r.job_id=$1", job_id)
        j = await conn.fetchrow("SELECT state, error FROM jobs WHERE id=$1", job_id) if r else None
    if not r:
        raise ApiError("not_found", "결과를 찾을 수 없습니다")
    d = dict(r)
    if d["state"] != "done" and j:
        d["state"] = "failed" if j["state"] in ("failed", "cancelled") else d["state"] if j["state"] != "running" else "running"
        d["error"] = j["error"]
    return d


def stats_env(st: dict | None) -> dict | None:
    if not st:
        return None
    src = "변화 탐지 결과(토지피복 U-Net · 두 해 비교 · 검수 전)"
    bt = {}
    for t, v in (st.get("by_type") or {}).items():
        bt[t] = {"n": env(v["n"], "count", "inferred", src), "area": env(round(v["m2"], 1), "m2", "inferred", src),
                 "in": env(v["in"], "count", "inferred", src), "out": env(v["out"], "count", "inferred", src)}
    return {"n": env(st["n"], "count", "inferred", src, "식생 증감(참고) 빼고"), "n_in": env(st["n_in"], "count", "inferred", src),
            "n_out": env(st["n_out"], "count", "inferred", src), "area": env(st["m2"], "m2", "inferred", src),
            "by_type": bt, "top_in": [{"id": x["id"], "type": x["type"], "jibun": x.get("jibun"), "jimok": x.get("jimok"),
                                       "area": env(x["area_m2"], "m2", "inferred", src)} for x in st.get("top_in") or []],
            "range_area": env(st.get("range_km2"), "km2", "measured", "범위 면적"), "gsd_m": st.get("gsd_m")}


async def marks_of(p, job_id: str) -> dict[str, dict]:
    async with db(p) as conn:
        rows = await conn.fetch("SELECT fid, status, memo, photos, by_user, at FROM change_marks WHERE job_id=$1", job_id)
    return {r["fid"]: {"status": r["status"], "memo": r["memo"], "photos": r["photos"] if isinstance(r["photos"], list) else json.loads(r["photos"] or "[]"),
                       "by": r["by_user"], "at": r["at"].isoformat(timespec="seconds")} for r in rows}


def mark_counts(marks: dict, fids: list[str]) -> dict:
    c = {s: 0 for s in STATUSES}
    for f in fids:
        c[(marks.get(f) or {}).get("status") or "미확인"] += 1
    return {k: env(v, "count", "recorded", "판정 기록(change_marks)") for k, v in c.items()}


@router.get("/change/runs/{job_id}")
async def get_run(job_id: str, request: Request):
    p = require(principal(request))
    d = await run_row(p, job_id)
    st = d.get("stats")
    if isinstance(st, str):
        st = json.loads(st)
    out = {"job_id": job_id, "state": d["state"], "range_id": d["range_id"], "range_name": d["range_name"], "project_id": d.get("project_id"),
           "period": {"a": {"year": d["year_a"]}, "b": {"year": d["year_b"]}}, "zoom": d["zoom"], "stats": stats_env(st),
           "done_at": d["done_at"].isoformat(timespec="seconds") if d.get("done_at") else None, "error": d.get("error")}
    if d["state"] == "done":
        fc = await run_in_threadpool(_features, job_id)
        fids = [f["id"] for f in fc["features"] if not f["properties"].get("hidden")]
        out["marks"] = mark_counts(await marks_of(p, job_id), fids)
    return out


def _features(job_id: str) -> dict:
    _, _, _, RUN = _mods()
    f = RUN.run_dir(job_id) / "changes.geojson"
    if not f.exists():
        raise ApiError("not_found", "결과 파일이 아직 없습니다")
    return json.loads(f.read_text(encoding="utf-8"))


@router.get("/change/runs/{job_id}/features")
async def features(job_id: str, request: Request, hidden: int = 0):
    p = require(principal(request))
    await run_row(p, job_id)
    fc = await run_in_threadpool(_features, job_id)
    mk = await marks_of(p, job_id)
    feats = []
    for f in fc["features"]:
        if f["properties"].get("hidden") and not hidden:
            continue
        m = mk.get(f["id"]) or {}
        f["properties"]["status"] = m.get("status") or "미확인"
        f["properties"]["memo"] = m.get("memo")
        f["properties"]["photos_n"] = len(m.get("photos") or [])
        feats.append(f)
    body = json.dumps({"type": "FeatureCollection", "features": feats}, ensure_ascii=False, separators=(",", ":"))
    return Response(body, media_type="application/geo+json")


@router.get("/change/runs/{job_id}/thumbs/{name}")
async def thumb(job_id: str, name: str, request: Request):
    p = require(principal(request))
    await run_row(p, job_id)
    if not re.fullmatch(r"c\d{4}_[ab]\.png", name):
        raise ApiError("not_found", "그림 없음")
    _, _, _, RUN = _mods()
    f = RUN.run_dir(job_id) / "thumbs" / name
    if not f.exists():
        raise ApiError("not_found", "그림 없음")
    return FileResponse(f, media_type="image/png", headers={"Cache-Control": "private, max-age=3600"})


def parcel_rows(fc: dict, marks: dict, *, types=None, jimok=None, owner=None, inside=None, status=None) -> list[dict]:
    rows = []
    for f in fc["features"]:
        pr = f["properties"]
        if pr.get("hidden") and not (types and pr["type"] in types):
            continue
        if types and pr["type"] not in types:
            continue
        if jimok and (pr.get("jimok") or "") not in jimok:
            continue
        if owner and not any(o in (pr.get("owner") or "") for o in owner):
            continue
        if inside and pr.get("inside_row") != inside:
            continue
        st = (marks.get(f["id"]) or {}).get("status") or "미확인"
        if status and st not in status:
            continue
        rows.append({"id": f["id"], "jibun": pr.get("jibun"), "pnu": pr.get("pnu"), "jimok": pr.get("jimok"), "owner": pr.get("owner"),
                     "use": pr.get("use"), "type": pr["type"], "area_m2": pr["area_m2"], "inside_row": pr.get("inside_row"), "status": st,
                     "lng": pr.get("lng"), "lat": pr.get("lat")})
    return rows


def _split(v: str | None) -> list[str] | None:
    if not v:
        return None
    return [x.strip() for x in re.split(r"[,·|]", v) if x.strip()]


@router.get("/change/runs/{job_id}/parcels")
async def parcels(job_id: str, request: Request, type: str | None = None, jimok: str | None = None, owner: str | None = None,
                  inside: str | None = None, status: str | None = None, format: str = "json"):
    p = require(principal(request))
    d = await run_row(p, job_id)
    fc = await run_in_threadpool(_features, job_id)
    rows = parcel_rows(fc, await marks_of(p, job_id), types=_split(type), jimok=_split(jimok), owner=_split(owner),
                       inside=inside if inside in ("내", "외") else None, status=_split(status))
    if format == "csv":
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(["번호", "지번", "PNU", "지목", "소유구분", "용도(토지마스터)", "변화 유형", "면적(㎡)", "구역선", "판정"])
        for r in rows:
            w.writerow([r["id"], r["jibun"], r["pnu"], r["jimok"], r["owner"], r["use"] or "", r["type"], r["area_m2"],
                        "안" if r["inside_row"] == "내" else "밖", r["status"]])
        name = f"변화탐지_{d['range_name']}_{d['year_a']}-{d['year_b']}.csv"
        from urllib.parse import quote
        return Response("﻿" + buf.getvalue(), media_type="text/csv; charset=utf-8",
                        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(name)}"})
    src = "변화 탐지 결과 × 연속지적도(필지 교차)"
    return {"job_id": job_id, "n": env(len(rows), "count", "inferred", src),
            "area": env(round(sum(r["area_m2"] for r in rows), 1), "m2", "inferred", src),
            "items_raw": rows}


@router.get("/change/latest")
async def latest(request: Request, project_id: str | None = None, range_id: str | None = None):
    p = require(principal(request))
    async with db(p) as conn:
        r = await conn.fetchrow("SELECT r.job_id FROM change_runs r JOIN change_ranges g ON g.id=r.range_id "
                                "WHERE r.state='done' AND ($1::text IS NULL OR g.project_id=$1) AND ($2::text IS NULL OR g.id=$2) "
                                "ORDER BY r.done_at DESC NULLS LAST LIMIT 1", project_id, range_id)
    if not r:
        return {"job_id": None}
    return await get_run(r["job_id"], request)
