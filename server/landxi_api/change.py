"""국토 변화 분석서비스(변화 탐지) API — 대상지(범위) · 연도 · 실행 · 결과 · 필지 교차 · 썸네일.

독립 모듈(기존 분석 서비스 · 프로젝트 표는 바꾸지 않음 · 0124 표 넷). 추론은 작업 대기열(jobs · kind 'index' · 모델 change-ap25)로만.
같은 범위 · 같은 두 해 · 같은 계산 방식(run.VERSION)의 끝난 결과가 있으면 다시 돌리지 않고 그것을 쓴다(캐시).

GET  /change/years?range_id=|bbox=          쓸 수 있는 국토지리정보원 영상 연도(가장 고운 줌)
POST /change/ranges                         구역선 파일(+버퍼 m) · PNU 목록 · 행정구역 → 범위
GET  /change/ranges?project_id=             범위 목록 · GET /change/ranges/{id} 범위(4326) + 구역선 + 연도
POST /change/ranges/{id}/project            프로젝트 연결 · 고른 연도
GET  /change/ranges/{id}/imagery             그 대상지를 덮는 공유 데이터 영상 · 내 영상(시점 고르기 · 10-23 원칙 329)
POST /change/runs                           {range_id, year_a, year_b} 또는 {range_id, src_a, src_b} → 캐시 또는 작업 제출(분석 서비스 작업 · card-change)
                                            src = {kind:'ngii', year} 국토지리정보원 그 해 · {kind:'imagery', id, year?} 등록 영상(공유 데이터 · 내 영상)
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
                      project_id: str | None, years: list[int], origin: str | None = None) -> str:
    _, P, R, _ = _mods()
    from shapely import to_wkb
    from shapely.geometry import MultiPolygon
    sgg = await run_in_threadpool(P.sgg_codes_for, R.to4326(rng5179))
    mp = rng5179 if rng5179.geom_type == "MultiPolygon" else MultiPolygon([rng5179])
    rid = "rng_" + secrets.token_hex(6)
    async with db(p) as conn:
        await conn.execute(
            "INSERT INTO change_ranges(id, tenant_id, project_id, name, kind, buffer_m, line, geom, sgg, years, source_name, created_by, origin) "
            "VALUES ($1,$2,$3,$4,$5,$6, ST_SetSRID(ST_GeomFromWKB($7),5179), ST_SetSRID(ST_GeomFromWKB($8),5179), $9,$10,$11,$12,$13)",
            rid, "lx" if p.is_lx else p.tenant_id, project_id, name[:120], kind, buffer_m, to_wkb(line5179), to_wkb(mp), sgg, years,
            source_name, p.user_id, origin)
        await audit(conn, p, "change.range.create", rid, None, {"name": name, "kind": kind, "buffer_m": buffer_m, "project_id": project_id, "origin": origin})
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
        origin = "card" if form.get("origin") == "card" else None
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
                            project_id=project_id, years=years, origin=origin)
    d = await get_range_row(p, rid)
    av = await years_for_bounds(d["bounds"])
    await ensure_year_layers(av)
    return range_out(d, av)


@router.get("/change/ranges")
async def list_ranges(request: Request, project_id: str | None = None, all: int = 0):
    """기본 = 프로젝트에 묶인 대상지 · 분석 서비스 카드에서 올린 대상지(새 프로젝트 창에서 올리다 만 범위는 빼고) · all=1 이면 전부."""
    p = require(principal(request))
    async with db(p) as conn:
        rows = await conn.fetch("SELECT id FROM change_ranges WHERE ($1::text IS NULL OR project_id=$1) AND ($2 OR project_id IS NOT NULL OR origin='card') "
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


# 어림(수정 지시서 v2 F5) — 영상 받기 = 칸 수 × 칸당 시간(10-22 측정: 1㎢ 상자 272칸 · 4.5초 · 동시 12) ·
# 분석 = 최근 끝난 변화 탐지의 상자 1㎢당 시간(중앙값 · 작업 시작 → 끝, 기록) × 이 범위 상자 면적. 기록이 없으면 분석 어림은 비운다.
FETCH_S_PER_TILE = 0.017
BIG_KM2 = 20.0


async def estimate(d: dict, years: list[int] | None = None, zoom: int = 18) -> dict:
    I, *_ = _mods()
    b = d["bounds"]
    c0, r0, c1, r1 = I.tiles_for(b, zoom)
    tiles = (c1 - c0 + 1) * (r1 - r0 + 1)
    box_km2 = (b[2] - b[0]) * (b[3] - b[1]) / 1e6
    async with db(realm="lx") as conn:
        rates = await conn.fetch(
            "SELECT extract(epoch FROM (j.finished_at - j.started_at)) / greatest((ST_XMax(g.geom)-ST_XMin(g.geom))*(ST_YMax(g.geom)-ST_YMin(g.geom))/1e6, 0.05) AS r "
            "FROM change_runs c JOIN change_ranges g ON g.id=c.range_id JOIN jobs j ON j.id=c.job_id "
            "WHERE c.state='done' AND j.started_at IS NOT NULL AND j.finished_at IS NOT NULL ORDER BY c.done_at DESC NULLS LAST LIMIT 9")
    rs = sorted(float(x["r"]) for x in rates if x["r"])
    run_s = round(rs[len(rs) // 2] * box_km2) if rs else None
    n_years = len(years or []) or 2
    return {"fetch_s": env(max(1, round(tiles * FETCH_S_PER_TILE)), "s", "estimate", "국토지리정보원 영상 한 해 받기 어림(칸 수 × 측정 칸당 시간)"),
            "run_s": env(run_s, "s", "estimate", "최근 변화 탐지 처리 속도로 어림(상자 면적 기준 · 중앙값)"),
            "tiles": env(tiles * n_years, "tiles", "measured", "받을 영상 칸 수(두 해)"),
            "area": env(round(float(d["m2"]) / 1e6, 3), "km2", "measured", "범위 면적(EPSG:5179)"), "big": float(d["m2"]) / 1e6 > BIG_KM2}


@router.get("/change/ranges/{rid}/estimate")
async def get_estimate(rid: str, request: Request, years: str | None = None):
    p = require(principal(request))
    d = await get_range_row(p, rid)
    ys = [int(y) for y in (years or "").split(",") if y.strip().isdigit()]
    return {"range_id": rid, **(await estimate(d, ys)), "as_of": now_iso()}


@router.post("/change/ranges/{rid}/project")
async def link_project(rid: str, body: dict, request: Request):
    p = _lx(principal(request))
    ys = [int(y) for y in body.get("years") or []]
    async with db(p) as conn:
        await conn.execute("UPDATE change_ranges SET project_id=coalesce($2, project_id), years=CASE WHEN cardinality($3::int[])>0 THEN $3 ELSE years END, "
                           "name=coalesce(nullif($4,''), name) WHERE id=$1", rid, body.get("project_id"), ys, str(body.get("name") or "")[:120])
        await audit(conn, p, "change.range.project", rid, None, {"project_id": body.get("project_id"), "years": ys})
    return range_out(await get_range_row(p, rid))
# (10-23 원칙 329) 프로젝트 '진행 경로'(정식 서비스 모델로 바로 분석 · 학습 건너뜀)는 뺐다 — 학습된 모델로 하는 분석은 분석 서비스 카드에서.
#  예전에 적힌 project_links(kind='path') 줄은 지우지 않고 읽지도 않는다.


# ── 시점 영상(분석 서비스 카드 — 공유 데이터 · 내 영상) ─────────────────────────
def _year_of(year, epoch) -> int | None:
    if year:
        return int(year)
    e = str(epoch or "")[:4]
    return int(e) if e.isdigit() else None


@router.get("/change/ranges/{rid}/imagery")
async def range_imagery(rid: str, request: Request):
    """그 대상지를 덮는 등록 영상 — 공유 데이터(직원에게 보이는 것) + 내가 올린 영상. 덮는 비율 · 해상도 · 촬영 해 · 이름."""
    p = _lx(principal(request))
    d = await get_range_row(p, rid)
    from shapely.geometry import shape
    from workers import imagery_src as isrc
    from .cards import OWN_ROWS
    from .deploys import gsd_word
    g4 = shape(d["g"])
    async with db(realm="lx") as conn:
        recs = await conn.fetch(isrc.SQL_ROWS)
        mine = await conn.fetch(OWN_ROWS, p.user_id)
        hidden = {x["id"] for x in await conn.fetch("SELECT id FROM imagery WHERE NOT staff_visible AND coalesce(layer->>'role','imagery')='imagery'")}
    rows = await run_in_threadpool(isrc.rows_from, recs)
    own = [{**r, "own": True} for r in await run_in_threadpool(isrc.rows_from, mine)] if mine else []
    ta = max(g4.area, 1e-12)
    items = []
    for r in own + rows:
        if r["id"] in hidden or not r.get("readable") or r.get("fp") is None or str(r["id"]).startswith("nat-"):
            continue
        try:
            inter = r["fp"].intersection(g4)
        except Exception:  # noqa: BLE001
            continue
        if inter.is_empty:
            continue
        cov = min(1.0, inter.area / ta)
        if cov < 0.01:
            continue
        nm = r.get("name")
        nm = (nm.get("ko") if isinstance(nm, dict) else nm) or "영상"
        items.append({"id": r["id"], "name": nm, "own": bool(r.get("own")), "year": _year_of(r.get("year"), r.get("epoch")),
                      "gsd_word": gsd_word(r.get("gsd_m")),
                      "cover": env(round(cov * 100), "%", "measured", "대상지 면적 가운데 영상이 덮는 비율")})
    items.sort(key=lambda x: (0 if x["own"] else 1, -(x["cover"]["value"] or 0), -(x["year"] or 0)))
    return {"range_id": rid, "items": items[:40], "as_of": now_iso()}


async def _src_in(p, s, d: dict) -> dict:
    """시점 하나의 영상 출처 → {kind, year, id?, name, own?}. 등록 영상은 볼 수 있는 것(공유 데이터 · 내 영상)만."""
    s = dict(s or {})
    if s.get("kind") == "imagery":
        iid = str(s.get("id") or "")
        async with db(realm="lx") as conn:
            r = await conn.fetchrow("SELECT id, name->>'ko' AS name, year, epoch, layer, staff_visible, "
                                    "ST_Intersects(footprint, ST_SetSRID(ST_GeomFromGeoJSON($2),4326)) AS hit FROM imagery WHERE id=$1",
                                    iid, json.dumps(d["g"]))
        lay = (r["layer"] or {}) if r else {}
        if isinstance(lay, str):
            lay = json.loads(lay)
        role = lay.get("role") or "imagery"
        if not r or (role == "own" and lay.get("owner") != p.user_id) or (role == "imagery" and not r["staff_visible"]) or role not in ("own", "imagery"):
            raise ApiError("not_found", "고른 영상을 찾을 수 없습니다")
        if not r["hit"]:
            raise ApiError("bad_request", "고른 영상이 대상지와 겹치지 않습니다")
        yr = int(s["year"]) if str(s.get("year") or "").isdigit() else _year_of(r["year"], r["epoch"])
        if not yr:
            raise ApiError("bad_request", "촬영 해를 알 수 없는 영상입니다 — 촬영 해를 골라 주세요", {"field": "year"})
        return {"kind": "imagery", "id": iid, "year": int(yr), "name": r["name"] or "영상", "own": role == "own"}
    y = int(s.get("year") or 0)
    if not y:
        raise ApiError("bad_request", "시점마다 영상을 골라 주세요")
    return {"kind": "ngii", "year": y}


def src_word(src: dict | None, year: int) -> str:
    """시점 한 줄(화면 · 보고서 · 채팅 같은 말)."""
    if not src or src.get("kind", "ngii") == "ngii":
        return f"{year}년 국토지리정보원 항공영상"
    return f"{year}년 {'내 영상' if src.get('own') else '공유 데이터'} · {src.get('name') or '영상'}"


# ── 실행 ───────────────────────────────────────────────────────────────────
async def cached_run(p, range_id: str, year_a: int, year_b: int, key: str | None = None) -> dict | None:
    _, _, _, RUN = _mods()
    async with db(p) as conn:
        r = await conn.fetchrow("SELECT job_id, state FROM change_runs WHERE range_id=$1 AND year_a=$2 AND year_b=$3 AND version=$4 "
                                "AND src_key IS NOT DISTINCT FROM $5 "
                                "AND state IN ('done','queued','running') ORDER BY (state='done') DESC, created_at DESC LIMIT 1",
                                range_id, year_a, year_b, _ver(), key)
    return dict(r) if r else None


async def same_range_run(p, range_id: str, year_a: int, year_b: int) -> str | None:
    """같은 대상지(범위 면이 같은 다른 대상지 — 같은 구역선 · 같은 버퍼를 다시 올린 새 프로젝트)의 끝난 결과가 있으면, 계산을 다시 하지 않고
    이 대상지 몫 결과로 이어 붙인다(결과 파일은 하드 링크 · 판정은 새로 · 결과 번호는 새로). 없으면 None."""
    async with db(realm="lx") as conn:
        src = await conn.fetchrow(
            "SELECT r.job_id, r.zoom, r.stats FROM change_runs r JOIN change_ranges g ON g.id=r.range_id JOIN change_ranges me ON me.id=$1 "
            "WHERE r.state='done' AND r.year_a=$2 AND r.year_b=$3 AND r.version=$4 AND r.src_key IS NULL AND g.id<>me.id AND g.buffer_m=me.buffer_m "
            "AND ST_Equals(ST_SnapToGrid(g.geom, 0.01), ST_SnapToGrid(me.geom, 0.01)) ORDER BY r.done_at DESC LIMIT 1",
            range_id, year_a, year_b, _ver())
    if not src:
        return None
    import os
    import shutil

    from .jobs import ulid
    new = "job_" + ulid()
    sd, nd = _Run.run_dir(src["job_id"]), _Run.run_dir(new)

    def _link():
        for f in sd.rglob("*"):
            if f.is_dir() or "photos" in f.relative_to(sd).parts:
                continue
            t = nd / f.relative_to(sd)
            t.parent.mkdir(parents=True, exist_ok=True)
            try:
                os.link(f, t)
            except OSError:
                shutil.copy2(f, t)
    await run_in_threadpool(_link)
    async with db(p) as conn:
        await conn.execute("INSERT INTO change_runs(job_id, range_id, tenant_id, year_a, year_b, zoom, version, state, stats, created_by, done_at) "
                           "VALUES ($1,$2,'lx',$3,$4,$5,$6,'done',$7,$8,now())", new, range_id, year_a, year_b, src["zoom"], _ver(), src["stats"], p.user_id)
        await audit(conn, p, "change.run.same_range", new, None, {"from": src["job_id"], "range_id": range_id})
    return new


INTERACTIVE_KM2 = 2.0


async def start_run(request: Request, p, range_id: str, year_a: int, year_b: int, fresh: bool = False, via: str = "화면",
                    src_a: dict | None = None, src_b: dict | None = None) -> dict:
    """캐시(끝났거나 도는 중)가 있으면 그것 · 없으면 작업 제출. → {job_id, cached, state, zoom}
    시점마다 영상 출처(src_a · src_b · 10-23 원칙 329) — 없으면 국토지리정보원 year_a · year_b(예전과 같음)."""
    I, _, R, RUN = _mods()
    d = await get_range_row(p, range_id)
    sa = await _src_in(p, src_a or {"kind": "ngii", "year": year_a}, d)
    sb = await _src_in(p, src_b or {"kind": "ngii", "year": year_b}, d)
    if sa["kind"] == sb["kind"] == "ngii" and sa["year"] == sb["year"]:
        raise ApiError("bad_request", "서로 다른 두 해를 골라 주세요")
    if sa["kind"] == sb["kind"] == "imagery" and sa["id"] == sb["id"]:
        raise ApiError("bad_request", "두 시점에 서로 다른 영상을 골라 주세요")
    if sa["year"] > sb["year"]:                       # 앞 시점 = 앞 해
        sa, sb = sb, sa
    year_a, year_b = sa["year"], sb["year"]
    key = I.src_key(sa, sb)
    if not fresh:
        c = await cached_run(p, range_id, year_a, year_b, key)
        if c:
            return {"job_id": c["job_id"], "cached": c["state"] == "done", "state": c["state"], "range": range_out(d),
                    "attached": c["state"] in ("queued", "running")}       # 같은 요청 — 진행 중 작업에 붙인다(새로 만들지 않음 · F5)
        al = await same_range_run(p, range_id, year_a, year_b) if key is None else None
        if al:
            return {"job_id": al, "cached": True, "state": "done", "range": range_out(d)}
    _lx(p)
    ng = [s0["year"] for s0 in (sa, sb) if s0["kind"] == "ngii"]
    av = await years_for_bounds(d["bounds"]) if ng else {}
    if ng:
        await ensure_year_layers(av)
    miss = [y for y in ng if y not in av]
    if miss:
        raise ApiError("no_imagery", f"{', '.join(f'{y}년' for y in miss)} 국토지리정보원 영상이 이 범위에 없습니다",
                       {"years": sorted(av)}, status=409)
    z = min([av[y] for y in ng] + ([18] if len(ng) < 2 else []))   # 두 시점 같은 격자 — 국토지리정보원 해가 17(51cm)뿐이면 17 · 등록 영상은 18(25cm)
    from . import jobs as J
    km2 = float(d["m2"]) / 1e6
    interactive = km2 <= INTERACTIVE_KM2
    opts = {"change": {"range_id": range_id, "year_a": year_a, "year_b": year_b, "zoom": z, "version": _ver(), "bbox4326": range_out(d)["bbox"],
                       **({"src_a": {k: sa.get(k) for k in ("kind", "id", "year")}, "src_b": {k: sb.get(k) for k in ("kind", "id", "year")}} if key else {})},
            "range_name": d["name"], "interactive": interactive, "requested_via": via}
    # 분석 서비스 작업(card-change) — 프로젝트 4단계 추론으로 적지 않는다(10-23 원칙 329 · 다른 분석 서비스와 같은 작업 장부 · 지도 서비스 '분석 서비스' 묶음)
    if d.get("sgg"):
        opts["sgg_cd"] = d["sgg"][0]
    # 대화형(작은 범위 2㎢ 이하)은 전국 분석(3) · 다른 분석(0)보다 먼저(−1) — 전국 작업은 칸 묶음 사이에서 비킨다(F3)
    body = {"kind": "index", "model_id": "change-ap25", "card_id": "card-change", "label": f"분석 서비스 · 국토 변화 · {d['name']} {year_a}↔{year_b}"[:60],
            "priority": -1 if interactive else 0, "options": opts}
    res = await J.submit(body, request)
    jid = res["job"]["id"]
    async with db(p) as conn:
        await conn.execute("INSERT INTO change_runs(job_id, range_id, tenant_id, year_a, year_b, zoom, version, state, created_by, src_key, sources) "
                           "VALUES ($1,$2,'lx',$3,$4,$5,$6,'queued',$7,$8,$9) ON CONFLICT (job_id) DO NOTHING",
                           jid, range_id, year_a, year_b, z, _ver(), p.user_id, key, {"a": sa, "b": sb})
    return {"job_id": jid, "cached": False, "state": "queued", "zoom": z, "range": range_out(d), "events_url": res.get("events_url")}


@router.post("/change/runs", status_code=202)
async def create_run(body: dict, request: Request):
    p = require(principal(request))
    out = await start_run(request, p, str(body.get("range_id") or ""), int(body.get("year_a") or 0), int(body.get("year_b") or 0),
                          bool(body.get("fresh")), via="XI ChatGEO" if body.get("via") == "chatgeo" else "분석 서비스" if body.get("via") == "analyze" else "화면",
                          src_a=body.get("src_a") if isinstance(body.get("src_a"), dict) else None,
                          src_b=body.get("src_b") if isinstance(body.get("src_b"), dict) else None)
    if body.get("later") and out.get("state") in ("queued", "running"):     # 배치로 — 끝나면 요청함 알림(F3 · F5)
        from .deps import redis
        await (await redis()).hset(f"job:{out['job_id']}", "chg_notify", p.user_id or "")
    return out


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


def period_of(d: dict) -> dict:
    """두 시점(해 · 영상 출처 한 줄) — 예전 결과(sources 없음)는 국토지리정보원 두 해."""
    sr = d.get("sources") or {}
    if isinstance(sr, str):
        sr = json.loads(sr)
    out = {}
    for k, y in (("a", d["year_a"]), ("b", d["year_b"])):
        s0 = sr.get(k) or {"kind": "ngii", "year": y}
        out[k] = {"year": y, "kind": s0.get("kind", "ngii"), "word": src_word(s0, y)}
    return out


def stats_env(st: dict | None) -> dict | None:
    if not st:
        return None
    src = "변화 탐지 결과(토지피복 U-Net · 두 해 비교 · 결과 확인 전)"
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
           "period": period_of(d), "zoom": d["zoom"], "stats": stats_env(st),
           "done_at": d["done_at"].isoformat(timespec="seconds") if d.get("done_at") else None, "error": d.get("error")}
    if d["state"] == "done":
        fc = await run_in_threadpool(_features, job_id)
        fids = [f["id"] for f in fc["features"] if not f["properties"].get("hidden")]
        out["marks"] = mark_counts(await marks_of(p, job_id), fids)
    else:
        from .change_jobs import job_status
        out["status"] = await job_status(job_id)
        out["state"] = out["status"]["state"]
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


# ═══ P1 — 판정 저장 · 사진 · 기관 공유 · 보고서(10-22 CHANGE-DEMO P1-5 · 6 · 7 · §7 6~8) ═══════════════════════════════
def _can_mark(p):
    if p.is_lx and p.role in ("staff", "admin"):
        return p
    if p.realm == "tenant":
        return p
    raise ApiError("forbidden", "판정은 LX 직원 · 공유받은 기관만 저장합니다")


@router.patch("/change/runs/{job_id}/marks/{fid}")
async def set_mark(job_id: str, fid: str, body: dict, request: Request):
    """판정 — status ∈ 미확인 · 불법 · 적법 · 현장확인 · 철거완료 · memo(선택). 판정자 · 일시는 서버가 적고 줄마다 이력(change_mark_log)."""
    p = _can_mark(require(principal(request)))
    await run_row(p, job_id)
    if not re.fullmatch(r"c\d{4}", fid or ""):
        raise ApiError("not_found", "변화 폴리곤을 찾을 수 없습니다")
    st = body.get("status")
    if st is not None and st not in STATUSES:
        raise ApiError("bad_request", "판정은 " + " · ".join(STATUSES) + " 가운데 하나입니다")
    memo = body.get("memo")
    memo = str(memo)[:500] if memo is not None else None
    who = p.user_id
    tenant = "lx" if p.is_lx else p.tenant_id
    async with db(p) as conn:
        prev = await conn.fetchrow("SELECT status, memo, photos FROM change_marks WHERE job_id=$1 AND fid=$2", job_id, fid)
        new_st = st or (prev["status"] if prev else "미확인")
        new_memo = memo if memo is not None else (prev["memo"] if prev else None)
        await conn.execute(
            "INSERT INTO change_marks(job_id, fid, tenant_id, status, memo, by_user, at) VALUES ($1,$2,$3,$4,$5,$6,now()) "
            "ON CONFLICT (job_id, fid) DO UPDATE SET status=EXCLUDED.status, memo=EXCLUDED.memo, by_user=EXCLUDED.by_user, at=now()",
            job_id, fid, tenant, new_st, new_memo, who)
        await conn.execute("INSERT INTO change_mark_log(job_id, fid, tenant_id, status, memo, photos, by_user) VALUES ($1,$2,$3,$4,$5,$6,$7)",
                           job_id, fid, tenant, new_st, new_memo, (prev["photos"] if prev else []) or [], who)
        await audit(conn, p, "change.mark", f"{job_id}/{fid}", {"status": prev["status"] if prev else None}, {"status": new_st})
    m = (await marks_of(p, job_id)).get(fid) or {}
    return {"job_id": job_id, "fid": fid, "status": m.get("status"), "memo": m.get("memo"), "at": m.get("at"),
            "photos": env(len(m.get("photos") or []), "count", "recorded", "현장 사진")}


async def _user_names(ids) -> dict:
    ids = [i for i in dict.fromkeys(ids) if i]
    if not ids:
        return {}
    out = {}
    async with db(realm="lx") as conn:
        for t in ("lx_users", "tenant_users"):
            try:
                for r in await conn.fetch(f"SELECT id, name FROM {t} WHERE id = ANY($1::text[])", ids):
                    out[r["id"]] = r["name"] or ""
            except Exception:  # noqa: BLE001
                pass
    return out


@router.get("/change/runs/{job_id}/marks/{fid}")
async def get_mark(job_id: str, fid: str, request: Request):
    p = require(principal(request))
    await run_row(p, job_id)
    async with db(p) as conn:
        hist = await conn.fetch("SELECT status, memo, by_user, at FROM change_mark_log WHERE job_id=$1 AND fid=$2 ORDER BY at DESC LIMIT 20", job_id, fid)
    m = (await marks_of(p, job_id)).get(fid) or {"status": "미확인", "photos": []}
    names = await _user_names([x["by_user"] for x in hist] + [m.get("by")])
    return {"job_id": job_id, "fid": fid, "status": m.get("status") or "미확인", "memo": m.get("memo"), "by": names.get(m.get("by")) or None,
            "at": m.get("at"), "photos": [{"name": x.get("name"), "at": x.get("at")} for x in m.get("photos") or []],
            "history": [{"status": x["status"], "memo": x["memo"], "by": names.get(x["by_user"]) or "", "at": x["at"].isoformat(timespec="seconds")} for x in hist]}


PHOTO_MAX = 12 * 1024 * 1024


@router.post("/change/runs/{job_id}/marks/{fid}/photos")
async def add_photo(job_id: str, fid: str, request: Request):
    """현장 사진 — 다시 저장해 위치 · 기기 정보(EXIF)를 지운다 · 긴 변 1600px · JPG."""
    p = _can_mark(require(principal(request)))
    await run_row(p, job_id)
    if not re.fullmatch(r"c\d{4}", fid or ""):
        raise ApiError("not_found", "변화 폴리곤을 찾을 수 없습니다")
    form = await request.form()
    f = form.get("file")
    if f is None:
        raise ApiError("bad_request", "사진이 없습니다")
    data = await f.read()
    if len(data) > PHOTO_MAX:
        raise ApiError("too_large", "12MB 아래 사진으로 올려 주세요")

    def _save() -> str:
        import datetime as _dt

        from PIL import Image, ImageOps
        im = Image.open(io.BytesIO(data))
        im = ImageOps.exif_transpose(im).convert("RGB")
        im.thumbnail((1600, 1600))
        d = _Run.run_dir(job_id) / "photos" / fid
        d.mkdir(parents=True, exist_ok=True)
        name = _dt.datetime.now().strftime("%Y%m%d-%H%M%S") + "-" + secrets.token_hex(3) + ".jpg"
        im.save(d / name, "JPEG", quality=85)
        return name
    try:
        name = await run_in_threadpool(_save)
    except Exception:  # noqa: BLE001
        raise ApiError("bad_request", "그림 파일이 아닙니다") from None
    tenant = "lx" if p.is_lx else p.tenant_id
    item = {"name": name, "at": now_iso(), "by": p.user_id}
    async with db(p) as conn:
        prev = await conn.fetchrow("SELECT status, memo, photos FROM change_marks WHERE job_id=$1 AND fid=$2", job_id, fid)
        photos = list((prev["photos"] if prev else []) or []) + [item]
        await conn.execute(
            "INSERT INTO change_marks(job_id, fid, tenant_id, status, memo, photos, by_user, at) VALUES ($1,$2,$3,$4,$5,$6,$7,now()) "
            "ON CONFLICT (job_id, fid) DO UPDATE SET photos=EXCLUDED.photos, by_user=EXCLUDED.by_user, at=now()",
            job_id, fid, tenant, prev["status"] if prev else "미확인", prev["memo"] if prev else None, photos, p.user_id)
        await conn.execute("INSERT INTO change_mark_log(job_id, fid, tenant_id, status, memo, photos, by_user) VALUES ($1,$2,$3,$4,$5,$6,$7)",
                           job_id, fid, tenant, prev["status"] if prev else "미확인", prev["memo"] if prev else None, photos, p.user_id)
        await audit(conn, p, "change.photo", f"{job_id}/{fid}", None, {"name": name})
    return {"name": name, "photos": env(len(photos), "count", "recorded", "현장 사진")}


@router.get("/change/runs/{job_id}/photos/{fid}/{name}")
async def get_photo(job_id: str, fid: str, name: str, request: Request):
    p = require(principal(request))
    await run_row(p, job_id)
    if not re.fullmatch(r"c\d{4}", fid or "") or not re.fullmatch(r"\d{8}-\d{6}-[0-9a-f]{6}\.jpg", name or ""):
        raise ApiError("not_found", "사진 없음")
    f = _Run.run_dir(job_id) / "photos" / fid / name
    if not f.exists():
        raise ApiError("not_found", "사진 없음")
    return FileResponse(f, media_type="image/jpeg", headers={"Cache-Control": "private, max-age=3600"})


async def _sync_shares(tenant: str):
    """기관 공유(배포 → 기관 공유 체크 · PUT /release/shares)에서 국토 변화 분석서비스가 그 기관에 켜져 있으면, 프로젝트에 묶이고 끝난 결과가 있는 대상지를
    그 기관에 보이게 · 꺼져 있으면 거둔다(표 change_shares · 읽을 때 맞춤 — 공유 화면은 그대로 쓴다)."""
    from .release import latest_shares
    async with db(realm="lx") as conn:
        sh = (await latest_shares(conn, tenant=tenant)).get("card-change")
        if sh and sh["shared"]:
            await conn.execute("INSERT INTO change_shares(range_id, tenant_id, shared_by) SELECT DISTINCT g.id, $1, $2 FROM change_ranges g "
                               "JOIN change_runs r ON r.range_id = g.id AND r.state='done' WHERE g.project_id IS NOT NULL ON CONFLICT DO NOTHING",
                               tenant, sh.get("by"))
        else:
            await conn.execute("DELETE FROM change_shares WHERE tenant_id=$1", tenant)


@router.get("/change/shared")
async def shared(request: Request):
    """대시보드 · 현장점검 — 볼 수 있는 대상지마다 최근 결과(구역선 안 변화 · 유형별 · 판정 현황). LX = 프로젝트에 묶인 대상지 전부 · 기관 = 공유받은 것."""
    p = require(principal(request))
    if p.realm == "tenant":
        await _sync_shares(p.tenant_id)
    async with db(p) as conn:
        rows = await conn.fetch(
            "SELECT DISTINCT ON (g.id) g.id AS range_id, g.name, g.project_id, r.job_id FROM change_ranges g JOIN change_runs r ON r.range_id=g.id "
            "WHERE r.state='done' AND g.project_id IS NOT NULL AND r.version=$1 ORDER BY g.id, r.done_at DESC", _ver())
    items = []
    for x in rows:
        try:
            run = await get_run(x["job_id"], request)
        except ApiError:
            continue
        items.append({"range_id": x["range_id"], "name": x["name"], "project_id": x["project_id"], "job_id": x["job_id"], "period": run["period"],
                      "stats": run["stats"], "marks": run.get("marks"), "done_at": run.get("done_at")})
    items.sort(key=lambda i: i["name"])
    return {"items": items, "as_of": now_iso()}


@router.post("/change/ranges/{rid}/share")
async def share_range(rid: str, body: dict, request: Request):
    """대상지 하나를 기관에 공유 · 거두기(LX 관리자) — 기관 공유 체크(서비스 단위)보다 좁게 고를 때."""
    p = require(principal(request), admin=True)
    tid = str(body.get("tenant_id") or "")
    async with db(realm="lx") as conn:
        if not await conn.fetchval("SELECT 1 FROM tenants WHERE id=$1", tid):
            raise ApiError("not_found", "없는 기관입니다")
        if body.get("shared") is False:
            await conn.execute("DELETE FROM change_shares WHERE range_id=$1 AND tenant_id=$2", rid, tid)
        else:
            await conn.execute("INSERT INTO change_shares(range_id, tenant_id, shared_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", rid, tid, p.user_id)
        await audit(conn, p, "change.share", rid, None, {"tenant_id": tid, "shared": body.get("shared") is not False})
    return {"range_id": rid, "tenant_id": tid, "shared": body.get("shared") is not False}


async def _report_data(p, job_id: str) -> tuple[dict, dict]:
    from change import report as RP
    d = await run_row(p, job_id)
    st = d.get("stats")
    if isinstance(st, str):
        st = json.loads(st)
    if not st:
        raise ApiError("not_found", "결과가 아직 없습니다")
    rg = await get_range_row(p, d["range_id"])
    fc = await run_in_threadpool(_features, job_id)
    mk = await marks_of(p, job_id)
    r = RP.build(rng=range_out(rg), run=d, stats=st, fc=fc, marks=mk)
    return r, d


@router.get("/change/runs/{job_id}/report.json")
async def report_json(job_id: str, request: Request):
    """보고서 미리보기(개조식) — 화면이 그대로 그린다. 숫자는 결과 · 판정 기록 한 출처."""
    p = require(principal(request))
    r, d = await _report_data(p, job_id)
    out = {**r, "status": {k: env(v, "count", "recorded", "판정 기록") for k, v in r["status"].items()},
           "more": env(r["more"], "count", "inferred", "구역선 안 변화 가운데 표 밖"), "job_id": job_id,
           "period_y": {"a": {"year": d["year_a"]}, "b": {"year": d["year_b"]}}}
    return out


@router.get("/change/runs/{job_id}/report.pdf")
async def report_pdf(job_id: str, request: Request):
    p = require(principal(request))
    r, d = await _report_data(p, job_id)
    from change import report as RP

    from .farm_extra import PDF_CSS, _fonts

    def _make() -> bytes:
        import fitz
        f = _fonts()
        if not f:
            raise ApiError("worker_unavailable", "PDF 글꼴이 서버에 없습니다 — 화면의 인쇄로 받아 주세요")
        arch = fitz.Archive()
        arch.add(f[0], "kr.ttf")
        arch.add(f[1], "krb.ttf")
        for fid in r["thumbs"]:
            for t in ("a", "b"):
                fp = _Run.run_dir(job_id) / "thumbs" / f"{fid}_{t}.png"
                if fp.exists():
                    arch.add(fp.read_bytes(), f"{t}_{fid}.png")
        css = PDF_CSS + " ul{margin:0 0 4pt 12pt;padding:0} li{margin:0 0 2pt} td img{width:100%}"
        story = fitz.Story(html=f"<body>{RP.html_body(r, (d['year_a'], d['year_b']))}</body>", user_css=css, archive=arch)
        buf = io.BytesIO()
        w = fitz.DocumentWriter(buf)
        mb = fitz.paper_rect("a4")
        where = mb + (56, 50, -56, -50)
        more, n = 1, 0
        while more and n < 40:
            dev = w.begin_page(mb)
            more, _ = story.place(where)
            story.draw(dev)
            w.end_page()
            n += 1
        w.close()
        doc = fitz.open(stream=buf.getvalue(), filetype="pdf")
        doc.set_metadata({"title": r["title"], "author": "Land-XI", "creator": "Land-XI", "producer": "Land-XI"})
        for i, pg in enumerate(doc):
            pg.insert_text(fitz.Point(mb.width / 2 - 10, mb.height - 24), f"{i + 1} / {doc.page_count}", fontsize=8, color=(0.42, 0.46, 0.52))
        doc.subset_fonts()
        return doc.tobytes(garbage=3, deflate=True)
    pdf = await run_in_threadpool(_make)
    from urllib.parse import quote
    name = re.sub(r"[\\/:*?\"<>|\s]+", "_", f"{d['range_name']}_변화탐지보고_{d['year_a']}-{d['year_b']}") + ".pdf"
    async with db(p) as conn:
        await audit(conn, p, "change.report", job_id, None, {"pdf": True})
    return Response(pdf, media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(name)}"})


from . import change_jobs as _cj  # noqa: E402 — 작업 상태 · 취소 · 다시 · 알림 · 감시(같은 라우터로)
router.include_router(_cj.router)
