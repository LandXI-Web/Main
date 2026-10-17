"""XI맵 — 열자마자 전국 결과 · 그 자리 고치기(바퀴 5 · 원칙 182 · 191 · 196(10-11 18:52 고침) · 설계 20차 ximap-board-2 ①③④).

GET  /ximap/board                       전국 결과 한 번 호출 — 시군구 × 서비스 → 찾은 객체 수 · 끝난 시각 · 영상 · 결과 층(그릴 주소) · 멀리서 그릴 밀도.
                                        출처: 서비스 결과 장부(service_results · 지금 줄 · API3 결과장부 ⓐ — 외부 API 와 같은 장부) + 서비스가 붙지 않은
                                        시군구 전역 분석(토지피복). 수 = 그 결과 묶음의 객체(겹침 정리 후 · 지운 것 빼고 새로 그린 것 더함 — 결과 층 count 와 같은 값).
GET  /ximap/feature?set=&fid=&tol=1.5   객체 하나 + 편집용 단순화 모양(허용치 m · 원래 꼭짓점 수) + 영상 · 모델 · 서비스 · 분류 목록 · 고치기 이력.
POST /ximap/edits                       {set, fid?, action: delete|reclass|reshape|add|memo, cls?, geometry?, memo?, test?} — 원래 모양을 남기고 고친다.
POST /ximap/edits/{id}/undo             되돌리기(고친 사람 · 관리자 · 그 객체의 마지막 고치기만).
GET  /ximap/edits?sets=a,b              지금 살아 있는 고치기(지도 위 '고친 자리' 층) — 묶음별 · 되돌린 것 뺌.
GET  /ximap/edits/summary               서비스별 고친 것 수 → 그 서비스의 프로젝트(재학습으로 잇는 단추 · 학습 실행은 하지 않음).
POST /ximap/memory/apply                {set, force?} 관리자 — 지운 자리 기억을 그 결과에 적용(작업기 마무리가 저절로 하는 일 · 시험 · 다시 적용용).
전국 결과(전국 작업기 · 객체 줄을 데이터베이스에 쌓지 않는 묶음)도 같은 칸에서 고친다 — 누른 객체만 결과 묶음 파일에서 한 줄로 올려 고친다(원칙 243).
지운 자리 기억(edit_memory.py · 원칙 243): 고친 자리는 모양 · 분류 · 영상 연도로도 남아 다시 추론한 새 결과에 저절로 적용된다(source='memory').
권한: 보기 = LX 영역(직원 · 관리자 · 영업) · 고치기 = LX 직원 · 관리자(결과 고치기와 같은 묶음). 작업 id · 파일 경로는 화면 글에 쓰지 않는다(층 주소에만).
"""
from __future__ import annotations

import asyncio
import json
import secrets
import time

from fastapi import APIRouter, Request, Response
from starlette.concurrency import run_in_threadpool

from .deps import ApiError, audit, db, principal, require
from .envelope import KST, env, now_iso
from .spaces import CLASS_KO

router = APIRouter()

LANDCOVER = {"건물", "주차장", "경작지", "비닐하우스"}
_BOARD: dict = {"at": 0.0, "v": None}
_STATIC_N: dict = {"at": 0.0, "v": {}}
BOARD_TTL = 60.0
_SID: dict[str, str] = {}                                   # 결과 층 주소(set) → detections.job_id
_DENS: dict = {"cells": {}, "out": {}}                      # (묶음, 격자) → (수, 칸 목록) · 격자 → (전국 결과 시각, 응답)
GRID = {0: 0.02, 1: 0.004}                                  # 멀리(약 2km 칸) · 가까이(약 400m 칸)


def _iso(t) -> str | None:
    """DB 시각 → 한국 시각 글(+09:00) — 화면 날짜가 하루 어긋나지 않게."""
    return t.astimezone(KST).isoformat(timespec="seconds") if t else None


def _jl(v):
    if isinstance(v, str):
        try:
            return json.loads(v)
        except ValueError:
            return {}
    return v or {}


def svc_name(n) -> str:
    """서비스 카드 이름 → 짧은 서비스 이름('비닐하우스 분석서비스' → '비닐하우스')."""
    s = (n or {}).get("ko") if isinstance(n, dict) else str(n or "")
    s = (s or "").strip()
    for suf in (" 분석서비스", "분석서비스", " 분석 서비스"):
        if s.endswith(suf):
            s = s[: -len(suf)].strip()
    return s


def _img_label(row) -> str | None:
    if not row:
        return None
    y = row.get("year") or (str(row.get("epoch") or "")[:4] if row.get("epoch") else None)
    kind = (_jl(row.get("layer")) or {}).get("source_kind") or ""
    nm = (_jl(row.get("name")) or {}).get("ko", "")
    word = "항공 영상" if kind == "aerial" or "항공" in nm else "영상"
    gsd = row.get("gsd_m")
    res = f" · {round(float(gsd) * 100)}cm" if gsd and float(gsd) < 1 else (f" · {float(gsd):g}m" if gsd else "")
    return f"{y}년 {word}{res}" if y else f"{word}{res}"


def _area_km2(g) -> float | None:
    """경위도 shapely 면적 → ㎢(위도 보정 근사 — 밀도 색 칠하기에만 쓴다 · 화면 숫자 아님)."""
    try:
        import math
        c = g.centroid
        return abs(g.area) * (111.32 ** 2) * math.cos(math.radians(c.y))
    except Exception:  # noqa: BLE001
        return None


async def _static_counts(conn, sets: list[str]) -> dict[str, int]:
    """정적 결과 묶음(results/…)의 객체 수 — detections 에서 센다(10분 보관)."""
    if time.time() - _STATIC_N["at"] > 600:
        _STATIC_N.update(at=time.time(), v={})
    need = [s for s in sets if s not in _STATIC_N["v"]]
    if need:
        for r in await conn.fetch("SELECT job_id, count(*) AS n FROM detections WHERE job_id = ANY($1::text[]) AND edit_state <> 'deleted' "
                                  "AND edit_state <> 'added' GROUP BY job_id", need):
            _STATIC_N["v"][r["job_id"]] = int(r["n"])
        for s in need:
            _STATIC_N["v"].setdefault(s, 0)
    return {s: _STATIC_N["v"].get(s, 0) for s in sets}


async def _edit_delta(conn, sets: list[str]) -> dict[str, int]:
    """살아 있는 고치기가 바꾼 수 — 새로 그린 것 +1 · 지운 것 -1(되돌린 것 뺌)."""
    rows = await conn.fetch("SELECT set_id, sum(CASE action WHEN 'add' THEN 1 WHEN 'delete' THEN -1 ELSE 0 END) AS d FROM result_edits "
                            "WHERE undone_at IS NULL AND set_id = ANY($1::text[]) GROUP BY set_id", sets)
    return {r["set_id"]: int(r["d"] or 0) for r in rows}


async def build_board(p) -> dict:
    from . import regions as R
    from . import catalog as C
    try:
        from .ext_api import ledger_sync
        asyncio.get_running_loop().create_task(ledger_sync())        # 1분에 한 번만 실제로 돈다
    except Exception:  # noqa: BLE001
        pass
    async with db(realm="lx") as conn:
        led = await conn.fetch(
            "SELECT s.card_id, s.set_id, s.sgg_cd, s.year, s.service_version, s.imagery_id, s.analyzed_at, s.origin, c.name AS cname "
            "FROM service_results s LEFT JOIN cards c ON c.id = s.card_id WHERE s.replaced_at IS NULL AND s.origin IN ('deploy', 'job')")
        bare = await conn.fetch(
            "SELECT j.id, j.options->>'sgg_cd' AS sgg_cd, j.imagery_id, j.model_id, j.options->'classes' AS ocls, j.finished_at, m.classes, i.year FROM jobs j "
            "LEFT JOIN models m ON m.id = j.model_id LEFT JOIN imagery i ON i.id = j.imagery_id "
            "WHERE j.kind='infer' AND j.state='done' AND NOT j.demo AND NOT coalesce(j.test,false) AND j.snapshot_ready "
            "AND j.card_id IS NULL AND j.tenant_id='lx' AND j.options->>'scope'='sgg' ORDER BY j.finished_at DESC")
        cells: dict[tuple, dict] = {}
        for r in led:
            reg = R.region_of(r["sgg_cd"])
            if not reg:
                continue
            k = (reg["sgg_cd"], r["card_id"])
            cand = {"svc": r["card_id"], "name": svc_name(r["cname"]) or "AI 분석", "set_id": r["set_id"], "year": r["year"],
                    "version": r["service_version"], "imagery_id": r["imagery_id"], "at": r["analyzed_at"]}
            o = cells.get(k)
            rank = lambda c: (c["year"] or 0, c["at"].timestamp() if c["at"] else 0)   # noqa: E731 — 늦은 연도 → 늦게 분석한 것
            if o is None or rank(cand) > rank(o):
                cells[k] = cand
        # 같은 시군구에 서비스 결과로 이미 올라온 것과 같은 분석(모델 · 영상 · 분류가 같음)은 한 번만 — 수를 두 번 세지 않는다
        lj = {r["id"]: r for r in await conn.fetch("SELECT id, model_id, imagery_id, options->'classes' AS ocls FROM jobs WHERE id = ANY($1::text[])",
                                                   [c["set_id"] for c in cells.values()])}
        sig = lambda m, i, oc: (m, i, json.dumps(_jl(oc) if oc else None, sort_keys=True))   # noqa: E731
        have = {(k[0], sig(lj[c["set_id"]]["model_id"], lj[c["set_id"]]["imagery_id"], lj[c["set_id"]]["ocls"])) for k, c in cells.items() if c["set_id"] in lj}
        for r in bare:
            reg = R.region_of(r["sgg_cd"])
            if not reg or (reg["sgg_cd"], sig(r["model_id"], r["imagery_id"], r["ocls"])) in have:
                continue
            cls = list(r["classes"] or [])
            lc = bool(cls) and set(cls) <= LANDCOVER
            k = (reg["sgg_cd"], "landcover" if lc else "ai")
            if k in cells:
                continue
            cells[k] = {"svc": k[1], "name": "토지피복" if lc else "AI 분석", "set_id": r["id"], "year": r["year"], "version": None,
                        "imagery_id": r["imagery_id"], "at": r["finished_at"]}
        sets = sorted({c["set_id"] for c in cells.values()})
        jobs = {r["id"]: r for r in await conn.fetch(
            "SELECT j.id, j.tenant_id, j.result_set, j.counts, j.snapshot_ready, j.model_id, ST_AsGeoJSON(ST_Envelope(j.aoi))::json AS env "
            "FROM jobs j WHERE j.id = ANY($1::text[])", [s for s in sets if s.startswith("job_")])}
        static = [s for s in sets if not s.startswith("job_")]
        sn = await _static_counts(conn, static) if static else {}
        delta = await _edit_delta(conn, sets)
        imgs = {r["id"]: dict(r) for r in await conn.fetch(
            "SELECT id, name, year, epoch, gsd_m, layer FROM imagery WHERE id = ANY($1::text[])",
            list({c["imagery_id"] for c in cells.values() if c["imagery_id"]}))}
    # 정적 묶음 = 카탈로그 결과 층(그릴 주소 · 범위)
    cat_items = {}
    if static:
        _, items = await C.layer_items(p, C.allowed_build(p, None), "domestic")
        cat_items = {it.get("set"): it for it in items if it.get("role") == "result" and it.get("set")}
    _, geoms, _ = R.regions_base()
    regs: dict[str, dict] = {}
    svcs: dict[str, dict] = {}
    from shapely.geometry import shape
    for (sgg, svc), c in cells.items():
        s = c["set_id"]
        if s.startswith("job_"):
            j = jobs.get(s)
            if not j or not j["snapshot_ready"]:
                continue
            counts = _jl(j["counts"])
            n = sum(int(v) for v in counts.values() if isinstance(v, (int, float))) if counts else 0
            try:
                b = [round(v, 6) for v in shape(j["env"]).bounds] if j["env"] else None
            except Exception:  # noqa: BLE001
                b = None
            layer = {"id": j["result_set"].replace("/", "-"), "set": j["result_set"], "path": j["result_set"] + ".pmtiles", "layer": "results",
                     "source": "pmtiles", "kind": "vector", "role": "result", "promote_id": "id", "minzoom": 10, "maxzoom": 17, "bounds": b,
                     "signed": j["tenant_id"] != "lx", "attribution": "Land-XI AI 분석 · 검수 전"}
        else:
            it = cat_items.get(s)
            if not it or not it.get("url") and not it.get("path"):
                continue
            n = sn.get(s, 0)
            layer = {k: it.get(k) for k in ("id", "set", "path", "layer", "source", "kind", "role", "promote_id", "minzoom", "maxzoom", "bounds", "signed", "attribution", "url")}
        n = max(0, n + delta.get(s, 0))
        _SID[layer["set"]] = s                                   # 결과 층 → 결과 묶음(밀도 격자가 같은 묶음을 센다 · 바깥에 내지 않음)
        reg = R.region_of(sgg)
        r = regs.get(sgg)
        if r is None:
            g = geoms.get(sgg) or (geoms.get(reg.get("prev_cd")) if reg.get("prev_cd") else None)
            r = regs[sgg] = {"sgg_cd": sgg, "prev_cd": reg.get("prev_cd"), "name": reg["name"], "full": reg.get("full"), "sido": reg.get("sido_short") or reg.get("sido"),
                             "bbox": reg.get("bbox"), "center": reg.get("center"), "area_km2": round(_area_km2(g), 1) if g is not None and _area_km2(g) else None,
                             "items": []}
        im = imgs.get(c["imagery_id"])
        at = _iso(c["at"])
        r["items"].append({"svc": svc, "name": c["name"], "n": env(n, "count", "inferred", "AI 분석 결과 객체(겹침 정리 후 · 고친 것 반영 · 검수 전)", as_of=_iso(c["at"])), "unit": "개", "finished_at": at, "year": c["year"] or (im or {}).get("year"),
                           "imagery": _img_label(im) or (f"{c['year']}년 영상" if c["year"] else None), "version": c["version"],
                           "style": "landcover" if svc == "landcover" else "result", "layer": layer})
        sv = svcs.setdefault(svc, {"id": svc, "name": c["name"], "n_regions": 0, "n": 0})
        sv["n_regions"] += 1
        sv["n"] += n
        r["_n"] = r.get("_n", 0) + n
    out = []
    SRC_N = "AI 분석 결과 객체(겹침 정리 후 · 고친 것 반영 · 검수 전)"
    for r in regs.values():
        r["items"].sort(key=lambda x: -(x["n"]["value"] or 0))
        n = r.pop("_n", 0)
        area = r.pop("area_km2", None)
        r["top"] = r["items"][0]["svc"] if r["items"] else None
        r["last_at"] = max((x["finished_at"] or "" for x in r["items"]), default="") or None
        r["n"] = env(n, "count", "inferred", SRC_N, as_of=r["last_at"])
        # 멀리서 칠하는 밀도(객체 ÷ 시군구 면적) — 화면에 숫자로 쓰지 않는다(색 진하기에만)
        r["density"] = env(round(n / area, 3) if area else None, "count", "inferred", "객체 수 ÷ 시군구 면적(㎢) — 칠하기용", "화면 숫자 아님")
        out.append(r)
    out.sort(key=lambda r: (r["sido"] or "", r["name"]))
    years = sorted({str(x["year"]) for r in out for x in r["items"] if x["year"]})
    last = max((r["last_at"] or "" for r in out), default="") or None
    services = []
    for sv in sorted(svcs.values(), key=lambda s: -s["n_regions"]):
        services.append({"id": sv["id"], "name": sv["name"], "n_regions": env(sv["n_regions"], "count", "recorded", "결과가 있는 시군구"),
                         "n": env(sv["n"], "count", "inferred", SRC_N, as_of=last),
                         # 서비스 = 서비스 결과 장부의 서비스(메인 '서비스 n가지'와 같은 줄) · 전역 분석 = 서비스가 붙지 않은 시군구 전역 분석(토지피복 등) — GPT5-1
                         "kind": "analysis" if sv["id"] in ("landcover", "ai") else "service"})
    n_svc = sum(1 for x in services if x["kind"] == "service")
    return {"regions": out, "services": services,
            "n_services": env(n_svc, "가지", "recorded", "서비스 결과 장부의 서비스(전역 분석 제외 — 메인 '서비스 n가지'와 같은 출처)"),
            "n_regions": env(len(out), "count", "recorded", "결과가 있는 시군구(서비스 결과 장부 + 시군구 전역 분석)", as_of=last),
            "years": years, "last_at": last, "as_of": now_iso(),
            # 결과 분류의 한글 이름표(결과 조각에 영문 코드만 있을 때 — 변화 탐지 built_new 등) · 한 곳(spaces.CLASS_KO)
            "class_ko": dict(CLASS_KO),
            "source": "서비스 결과 장부(지금 결과) + 시군구 전역 분석"}


async def _rebuild(p, wait: bool = False):
    """wait=True(fresh) — 이미 만드는 중이면 끝나기를 기다린 뒤 한 번 더 만든다. 그 판은 방금 고친 것보다 먼저 시작했을 수 있다
    (10-17 재검수: 고친 직후 fresh 로 물어도 고치기 전 수가 나오던 일 — 객체 수가 한 걸음씩 늦음)."""
    if _BOARD.get("busy"):
        if not wait:
            return
        while _BOARD.get("busy"):
            await asyncio.sleep(0.05)
    _BOARD["busy"] = True
    try:
        _BOARD.update(v=await build_board(p), at=time.time())
    finally:
        _BOARD["busy"] = False


async def warm():
    """기동 때 전국 결과 · 밀도 격자를 미리 만든다(재기동 직후 첫 XI맵도 바로 · main.lifespan _warm)."""
    from .deps import Principal
    await _rebuild(Principal(realm="lx", role="staff", user_id="system"))
    for g in GRID:
        await build_density(g)


# ── 빛나는 밀도(원칙 204 · 10-12 답) ─────────────────────────────────────────
async def build_density(g: int) -> dict:
    """전국 결과의 객체 중심을 격자로 센다 — 결과 묶음마다 (칸 x, 칸 y) → 객체 수. 묶음 수가 바뀌었을 때만 다시 센다.
    한 묶음의 칸 합 = 그 묶음의 객체 수(지운 것 빼고 새로 그린 것 더함 — 전국 결과 수와 같은 값 · 숫자 한 출처)."""
    bd = _BOARD["v"]
    if not bd:
        return {"g": GRID[g], "sets": [], "cells": []}
    key = (bd.get("as_of"), g)
    hit = _DENS["out"].get(g)
    if hit and hit[0] == key:
        return hit[1]
    size = GRID[g]
    sets, todo = [], []
    for r in bd["regions"]:
        for x in r["items"]:
            sid = _SID.get(x["layer"]["set"])
            if not sid:
                continue
            n = x["n"]["value"] or 0
            sets.append({"svc": x["svc"], "name": x["name"], "region": r["name"], "imagery": x.get("imagery"), "year": x.get("year"), "n": n, "_sid": sid})
            c = _DENS["cells"].get((sid, g))
            if not c or c[0] != n:
                todo.append(sid)
    if todo:
        async with db(realm="lx") as conn:
            rows = await conn.fetch(
                "SELECT job_id, floor(((ST_XMin(geom) + ST_XMax(geom)) / 2) / $2)::int AS gx, floor(((ST_YMin(geom) + ST_YMax(geom)) / 2) / $2)::int AS gy, "
                "count(*)::int AS n FROM detections WHERE job_id = ANY($1::text[]) AND coalesce(edit_state, 'raw') <> 'deleted' AND geom IS NOT NULL "
                "GROUP BY 1, 2, 3", todo, size)
        got: dict[str, list] = {s: [] for s in todo}
        for r in rows:
            got[r["job_id"]].append((r["gx"], r["gy"], r["n"]))
        for sid in todo:
            _DENS["cells"][(sid, g)] = (sum(c[2] for c in got[sid]), got[sid])
    flat, out_sets = [], []
    for i, s in enumerate(sets):
        n_cells, cells = _DENS["cells"][(s["_sid"], g)]
        for gx, gy, n in cells:
            flat += (gx, gy, i, n)
        out_sets.append({k: v for k, v in s.items() if k != "_sid"} | {"n_cells": n_cells})
    out = {"g": size, "sets": out_sets, "cells": flat, "as_of": bd.get("as_of"),
           "source": "전국 결과(서비스 결과 장부 + 시군구 전역 분석)의 객체 중심을 격자 칸으로 센 수 — 칸 합 = 결과 수"}
    _DENS["out"][g] = (key, out)
    return out


@router.get("/ximap/density")
async def density(request: Request, g: int = 0):
    """빛나는 밀도 — 전국 결과 객체를 격자로 센 칸들(g=0 약 2km · g=1 약 400m). 칸 = [x, y, 묶음 번호, 수] 를 이어 붙인 한 줄(가볍게)."""
    require(principal(request), lx=True)
    if g not in GRID:
        raise ApiError("bad_request", "격자는 0 또는 1")
    if not _BOARD["v"]:
        await board(request)
    body = json.dumps(await build_density(g), ensure_ascii=False, separators=(",", ":")).encode()
    if "gzip" in (request.headers.get("accept-encoding") or "") and len(body) > 2048:
        import gzip
        return Response(gzip.compress(body, 6), media_type="application/json", headers={"Content-Encoding": "gzip", "Vary": "Accept-Encoding", "Cache-Control": "no-store"})
    return Response(body, media_type="application/json", headers={"Cache-Control": "no-store"})


@router.get("/ximap/board")
async def board(request: Request, fresh: int | None = None):
    """한 번 호출 — 지난 값이 있으면 바로 돌려주고(열자마자 · 2초 안) 1분이 지났으면 뒤에서 새로 만든다. 고치기가 있으면 바로 새로."""
    p = require(principal(request), lx=True)
    if fresh or not _BOARD["v"]:
        await _rebuild(p, wait=bool(fresh))
        while _BOARD["v"] is None and _BOARD.get("busy"):     # 다른 요청이 만드는 중이면 그 결과를 기다린다
            await asyncio.sleep(0.05)
    elif time.time() - _BOARD["at"] > BOARD_TTL:
        asyncio.get_running_loop().create_task(_rebuild(p))
    return _stamp(_BOARD["v"])


def _stamp(bd: dict | None) -> dict | None:
    """결과 층마다 지금 파일의 판(v) — 보관해 둔 판(board)이 오래돼도 판은 내줄 때 잰다(파일을 다시 구우면 조각 주소가 바뀐다 · impl-20 ximap-speed)."""
    from .tiles import set_tile_ver
    for r in (bd or {}).get("regions") or []:
        for it in r.get("items") or []:
            L = it.get("layer") or {}
            if L.get("set") and L.get("source") == "pmtiles":
                L["v"] = set_tile_ver(L["set"])
    return bd


# ── 객체 하나(편집용 단순화) ────────────────────────────────────────────────
async def _resolve(p, set_id: str) -> dict:
    from .results import resolve
    return await resolve(p, set_id)


async def _meta(conn, job_id: str) -> dict:
    """결과 묶음 → 서비스 · 모델 · 영상 · 끝난 시각(작업이면 작업 표 · 정적 묶음이면 결과 장부)."""
    out = {"card_id": None, "service": None, "model_id": None, "model": None, "imagery_id": None, "imagery": None, "finished_at": None,
           "classes": [], "version": None, "sgg_cd": None, "national": None, "year": None}
    j = await conn.fetchrow("SELECT j.card_id, j.model_id, j.imagery_id, j.finished_at, j.options, m.classes, m.name AS mname, m.version AS mver, c.name AS cname "
                            "FROM jobs j LEFT JOIN models m ON m.id=j.model_id LEFT JOIN cards c ON c.id=j.card_id WHERE j.id=$1", job_id)
    led = await conn.fetchrow("SELECT s.card_id, s.service_version, s.imagery_id, s.analyzed_at, s.sgg_cd, s.year, c.name AS cname FROM service_results s "
                              "LEFT JOIN cards c ON c.id=s.card_id WHERE s.set_id=$1 ORDER BY s.replaced_at NULLS FIRST LIMIT 1", job_id)
    if j:
        o = _jl(j["options"])
        out.update(card_id=j["card_id"], model_id=j["model_id"], imagery_id=j["imagery_id"], classes=list(j["classes"] or o.get("classes") or []),
                   finished_at=_iso(j["finished_at"]), sgg_cd=o.get("sgg_cd"))
        mn = (_jl(j["mname"]) or {}).get("ko") if j["mname"] else None
        out["model"] = mn or (f"{j['model_id'].split('/')[0]} {j['mver']}" if j["mver"] else None)
        out["service"] = svc_name(j["cname"]) if j["cname"] else ("토지피복" if out["classes"] and set(out["classes"]) <= LANDCOVER else None)
        nat = o.get("national") if isinstance(o, dict) else None
        if nat:                                                   # 전국 결과 — 서비스 이름 = 결과 자산(농지 전수 · 하천 · 계곡)
            from .national import ASSETS as NAT_ASSETS
            out["service"] = NAT_ASSETS.get(str(nat.get("asset")), out["service"])
            out["national"] = nat
            out["sgg_cd"] = out["sgg_cd"] or await conn.fetchval("SELECT sgg_cd FROM national_cells WHERE asset=$1 AND year=$2::int AND cell_cd=$3 LIMIT 1",
                                                                 str(nat.get("asset")), int(nat.get("year") or 0), str(nat.get("cell")))
    if led:
        out["card_id"] = out["card_id"] or led["card_id"]
        out["service"] = out["service"] or svc_name(led["cname"])
        out["version"] = led["service_version"]
        out["imagery_id"] = out["imagery_id"] or led["imagery_id"]
        out["sgg_cd"] = out["sgg_cd"] or led["sgg_cd"]
        if not out["finished_at"] and led["analyzed_at"]:
            out["finished_at"] = _iso(led["analyzed_at"])
    if out["imagery_id"]:
        im = await conn.fetchrow("SELECT id, name, year, epoch, gsd_m, layer FROM imagery WHERE id=$1", out["imagery_id"])
        out["imagery"] = _img_label(dict(im)) if im else None
        if im:
            y = im["year"] or (str(im["epoch"] or "")[:4] if str(im["epoch"] or "")[:4].isdigit() else None)
            out["year"] = int(y) if y else None
    elif led and led["year"]:
        out["imagery"] = f"{led['year']}년 영상"
    if not out["classes"]:
        out["classes"] = [r["cls"] for r in await conn.fetch("SELECT DISTINCT cls FROM detections WHERE job_id=$1 AND cls IS NOT NULL LIMIT 12", job_id)]
    return out


FEAT = ("d.id, d.fid, d.cls, d.cls_en, d.cid, d.conf, d.area_m2, d.edit_state, d.tenant_id, d.emd, "
        "ST_AsGeoJSON(d.geom, 7)::json AS g, ST_NPoints(d.geom) AS nv")


def _fprops(r) -> dict:
    return {"id": r["fid"] or str(r["id"]), "cls": r["cls"], "conf": round(float(r["conf"]), 3) if r["conf"] is not None else None,
            "area_m2": float(r["area_m2"]) if r["area_m2"] is not None else None, "edit_state": r["edit_state"], "emd": r["emd"]}


async def _row(conn, job_id: str, fid: str):
    return await conn.fetchrow(f"SELECT {FEAT} FROM detections d WHERE d.job_id=$1 AND (d.fid=$2 OR d.id::text=$2) LIMIT 1", job_id, fid)


async def _history(conn, job_id: str, fid: str, p=None) -> list[dict]:
    """고치기 이력 — 저절로 적용한 줄(source='memory')은 원래 고친 사람 이름 · 되돌리기는 그 사람 · 관리자(mine)."""
    rows = await conn.fetch("SELECT e.id, e.action, e.cls_before, e.cls_after, e.memo, e.at, e.undone_at, e.test, e.source, e.by_user, u.name AS who FROM result_edits e "
                            "LEFT JOIN lx_users u ON u.id = e.by_user WHERE e.set_id=$1 AND e.fid=$2 ORDER BY e.at DESC LIMIT 20", job_id, fid)

    def can(r):
        return bool(p) and (r["by_user"] == p.user_id or p.role == "admin")
    return [{"id": r["id"], "action": r["action"], "cls_before": r["cls_before"], "cls_after": r["cls_after"], "memo": r["memo"],
             "at": _iso(r["at"]), "undone": bool(r["undone_at"]), "test": r["test"], "who": r["who"] or "LX 직원",
             "memory": r["source"] == "memory", **({"mine": True} if r["source"] == "memory" and can(r) else {})} for r in rows]


async def _rechecks(conn, job_id: str, fid: str) -> list[dict]:
    """영상 연도가 달라 저절로 적용하지 않은 이 자리의 지난 고치기('다시 확인' · 원칙 243)."""
    rows = await conn.fetch("SELECT k.action, k.year_edit, e.at, u.name AS who FROM edit_rechecks k JOIN result_edits e ON e.id = k.from_edit "
                            "LEFT JOIN lx_users u ON u.id = e.by_user WHERE k.set_id=$1 AND k.fid=$2 AND e.undone_at IS NULL ORDER BY e.at DESC LIMIT 3", job_id, fid)
    return [{"action": r["action"], "year": r["year_edit"], "at": _iso(r["at"]), "who": r["who"] or "LX 직원"} for r in rows]


# ── 전국 결과(객체 줄을 데이터베이스에 쌓지 않는 묶음) ─────────────────────────────
async def _nat(conn, job_id: str):
    return await conn.fetchrow("SELECT n.asset, n.year, n.cell_cd, n.model_id, j.tenant_id FROM national_jobs n JOIN jobs j ON j.id = n.job_id WHERE n.job_id=$1",
                               job_id)


async def _materialize(conn, job_id: str, fid: str):
    """누른 전국 결과 객체 한 줄을 결과 묶음 파일(E:)에서 데이터베이스로 — 고칠 때만 · 이미 있으면 그대로."""
    nat = await _nat(conn, job_id)
    if not nat:
        return None
    from .edit_memory import result_file_features
    f = (await run_in_threadpool(result_file_features, job_id, nat["tenant_id"])).get(fid)
    if not f:
        return None
    await conn.execute("SELECT pg_advisory_xact_lock(hashtext($1))", f"{job_id}/{fid}")
    r = await _row(conn, job_id, fid)
    if r:
        return r
    pr = f.get("properties") or {}
    await conn.execute(
        "INSERT INTO detections(tenant_id, job_id, shard_id, fid, cls, cls_en, cid, conf, area_m2, emd, emd_cd, chip_edge, edit_state, geom) "
        "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'raw', ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($13),4326)))",
        nat["tenant_id"], job_id, pr.get("shard_id"), fid, pr.get("cls"), pr.get("cls_en"), int(pr["cid"]) if pr.get("cid") is not None else None,
        float(pr["conf"]) if pr.get("conf") is not None else None, round(float(pr["area_m2"]), 1) if pr.get("area_m2") is not None else None,
        pr.get("emd"), pr.get("emd_cd"), bool(pr.get("chip_edge")), json.dumps(f["geometry"]))
    return await _row(conn, job_id, fid)


async def _nat_part(conn, job_id: str, det_id) -> tuple | None:
    """전국 결과 객체 한 줄이 진행 장부 칸 숫자에 드는 몫 → (분류, ㎡) | None — 끝난 칸 · 그 칸의 지금 판 · 세는 분류 · 가운데가 칸 안 · 지우지 않은 것."""
    if det_id is None:
        return None
    from .national import CLS as NAT_CLS
    r = await conn.fetchrow(
        "SELECT d.cls, coalesce(d.area_m2, 0)::float8 AS a, n.asset FROM detections d JOIN national_jobs n ON n.job_id = d.job_id "
        "JOIN national_cells c ON c.asset = n.asset AND c.year = n.year AND c.cell_cd = n.cell_cd AND NOT c.test AND c.state = 'done' "
        "AND c.model_id IS NOT DISTINCT FROM n.model_id "
        "WHERE d.id = $1 AND d.job_id = $2 AND coalesce(d.edit_state, 'raw') <> 'deleted' AND ST_Intersects(c.geom_s, ST_PointOnSurface(d.geom))", det_id, job_id)
    if not r or r["cls"] not in NAT_CLS.get(r["asset"], ()):
        return None
    return (r["cls"], float(r["a"]))


async def _nat_count(conn, job_id: str, before: tuple | None, after: tuple | None) -> None:
    """진행 장부 칸 숫자를 고친 만큼 맞춘다(숫자 한 출처 — XI맵 · 관리자 · 진행이 같은 장부)."""
    if before == after:
        return
    nat = await _nat(conn, job_id)
    if not nat:
        return
    for part, sign in ((before, -1), (after, 1)):
        if not part:
            continue
        cls, a = part
        await conn.execute(
            "UPDATE national_cells SET counts = jsonb_set(coalesce(counts, '{}'::jsonb), ARRAY[$4::text], jsonb_build_object("
            "'n', greatest(0, coalesce((counts->$4::text->>'n')::int, 0) + $5::int), "
            "'km2', greatest(0, round((coalesce((counts->$4::text->>'km2')::numeric, 0) + $6::numeric), 3)))) "
            "WHERE asset=$1 AND year=$2 AND cell_cd=$3 AND state='done'",
            nat["asset"], nat["year"], nat["cell_cd"], cls, sign, sign * a / 1e6)
    from . import national as NAT
    NAT._VER.clear()


@router.get("/ximap/feature")
async def feature(request: Request, set: str, fid: str, tol: float = 1.5):
    p = require(principal(request), lx=True)
    rs = await _resolve(p, set)
    tol = max(0.0, min(float(tol), 10.0))
    async with db(realm="lx") as conn:
        r = await _row(conn, rs["job_id"], fid) or await _materialize(conn, rs["job_id"], fid)
        if not r:
            raise ApiError("not_found", "그 객체를 찾지 못했습니다")
        simp = await conn.fetchrow(
            "SELECT ST_AsGeoJSON(ST_Transform(ST_SimplifyPreserveTopology(ST_Transform(geom, 5186), $3::float8), 4326), 7)::json AS g, "
            "ST_NPoints(ST_SimplifyPreserveTopology(ST_Transform(geom, 5186), $3::float8)) AS nv "
            "FROM detections WHERE job_id=$1 AND (fid=$2 OR id::text=$2) LIMIT 1", rs["job_id"], fid, tol)
        meta = await _meta(conn, rs["job_id"])
        hist = await _history(conn, rs["job_id"], r["fid"] or str(r["id"]), p)
        again = await _rechecks(conn, rs["job_id"], r["fid"] or str(r["id"]))
    return {"type": "Feature", "id": r["fid"] or str(r["id"]), "geometry": r["g"], "properties": _fprops(r), "recheck": again,
            "edit": {"geometry": simp["g"], "options": {"tol_m": tol},
                     "n_vertices": env(int(r["nv"] or 0), "count", "measured", "결과 도형 꼭짓점"),
                     "n_vertices_edit": env(int(simp["nv"] or 0), "count", "measured", f"편집용 단순화(허용치 {tol:g}m)")},
            "meta": {k: meta[k] for k in ("service", "model", "imagery", "finished_at", "classes", "version")},
            "history": hist, "can_edit": p.is_lx and p.role in ("staff", "admin")}


# ── 고치기 ──────────────────────────────────────────────────────────────
def _geom_json(g) -> str:
    if not isinstance(g, dict) or g.get("type") not in ("Polygon", "MultiPolygon"):
        raise ApiError("bad_request", "모양은 면(Polygon · MultiPolygon)이어야 합니다")
    try:
        from shapely.geometry import shape
        s = shape(g)
        if s.is_empty or s.area <= 0:
            raise ValueError
        b = s.bounds
        if not (-180 <= b[0] <= 180 and -90 <= b[1] <= 90) or (b[2] - b[0]) > 0.2 or (b[3] - b[1]) > 0.2:
            raise ApiError("bad_request", "모양이 너무 크거나 좌표가 맞지 않습니다")
    except ApiError:
        raise
    except Exception:  # noqa: BLE001
        raise ApiError("bad_request", "모양을 읽지 못했습니다")
    return json.dumps(g)


GEO = "ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON({}),4326)),3))"


def _invalidate():
    """고친 뒤 — 다음 호출이 새로 센 값을 받도록 지금 바로 다시 만든다(지난 값은 그동안 그대로)."""
    _BOARD["at"] = 0.0
    try:
        from .deps import Principal
        asyncio.get_running_loop().create_task(_rebuild(Principal(realm="lx", role="staff", user_id="system")))
    except RuntimeError:
        pass


@router.post("/ximap/edits")
async def make_edit(request: Request, body: dict):
    p = require(principal(request), lx=True, roles=("staff", "admin"))
    action = str(body.get("action") or "")
    if action not in ("delete", "reclass", "reshape", "add", "memo"):
        raise ApiError("bad_request", "action = delete · reclass · reshape · add · memo")
    rs = await _resolve(p, str(body.get("set") or ""))
    job_id, fid = rs["job_id"], str(body.get("fid") or "")
    memo = (str(body.get("memo") or "").strip()[:500]) or None
    test = bool(body.get("test"))
    eid = "ed_" + secrets.token_hex(6)
    async with db(realm="lx") as conn:
        cls_id = None
        if body.get("cls_id") and action in ("reclass", "add"):        # 클래스 목록에서 고름(원칙 205 · core.py) — 이름은 목록 이름
            from .core import class_for_edit
            c = await class_for_edit(conn, str(body["cls_id"]))
            cls_id, body = c["id"], {**body, "cls": c["name"]}
        meta = await _meta(conn, job_id)
        base = {"model_id": meta["model_id"], "card_id": meta["card_id"], "card_version": meta["version"], "imagery_id": meta["imagery_id"], "sgg_cd": meta["sgg_cd"]}
        proj = None
        if meta.get("national") and not meta["card_id"]:          # 전국 결과 — 학습 데이터는 전국 분석 모델을 학습한 프로젝트로(경작지 새 판 → 경작지 v2)
            from .edit_memory import project_of_model
            proj = await project_of_model(conn, meta["model_id"])
        nat_before = None
        if action == "add":
            cls = str(body.get("cls") or "").strip()
            if not cls:
                raise ApiError("bad_request", "새로 그린 객체의 분류를 고르세요")
            gj = _geom_json(body.get("geometry"))
            ref = await conn.fetchrow("SELECT tenant_id, cls_en, cid FROM detections WHERE job_id=$1 AND cls=$2 LIMIT 1", job_id, cls)
            tenant = (ref["tenant_id"] if ref else None) or rs["tenant"]
            fid = "ed-" + eid[3:]
            det = await conn.fetchval(
                f"INSERT INTO detections(tenant_id, job_id, cls, cls_en, cid, conf, area_m2, geom, edited_by, edit_state, fid) "
                f"VALUES ($1,$2,$3,$4,$5,NULL, round(ST_Area(ST_Transform({GEO.format('$6')},5186))::numeric,1), {GEO.format('$6')}, $7, 'added', $8) RETURNING id",
                tenant, job_id, cls, ref["cls_en"] if ref else None, ref["cid"] if ref else None, gj, p.user_id, fid)
            await conn.execute(
                f"INSERT INTO result_edits(id, tenant_id, set_id, det_id, fid, action, cls_after, state_before, geom_after, memo, model_id, card_id, card_version, "
                f"imagery_id, sgg_cd, by_user, test) VALUES ($1,$2,$3,$4,$5,'add',$6,NULL,{GEO.format('$7')},$8,$9,$10,$11,$12,$13,$14,$15)",
                eid, tenant, job_id, det, fid, cls, gj, memo, base["model_id"], base["card_id"], base["card_version"], base["imagery_id"], base["sgg_cd"], p.user_id, test)
        else:
            row = await _row(conn, job_id, fid) or await _materialize(conn, job_id, fid)
            if not row:
                raise ApiError("not_found", "그 객체를 찾지 못했습니다")
            fid = row["fid"] or str(row["id"])
            nat_before = await _nat_part(conn, job_id, row["id"]) if meta.get("national") else None
            cols = {"cls_before": row["cls"], "state_before": row["edit_state"], "conf_before": row["conf"]}
            sets, args = [], [job_id, row["id"]]
            after_geom = None
            if action == "delete":
                if row["edit_state"] == "deleted":
                    raise ApiError("conflict", "이미 지운 객체입니다")
                sets.append("edit_state='deleted'")
            elif action == "reclass":
                cls = str(body.get("cls") or "").strip()
                if not cls or cls == row["cls"]:
                    raise ApiError("bad_request", "바꿀 분류를 고르세요")
                ref = await conn.fetchrow("SELECT cls_en, cid FROM detections WHERE job_id=$1 AND cls=$2 LIMIT 1", job_id, cls)
                args += [cls, ref["cls_en"] if ref else None, ref["cid"] if ref else None]
                sets += ["cls=$3", "cls_en=$4", "cid=$5", "edit_state=CASE WHEN edit_state='added' THEN 'added' ELSE 'edited' END"]
                cols["cls_after"] = cls
            elif action == "reshape":
                after_geom = _geom_json(body.get("geometry"))
                args.append(after_geom)
                sets += [f"geom={GEO.format('$3')}", f"area_m2=round(ST_Area(ST_Transform({GEO.format('$3')},5186))::numeric,1)",
                         "edit_state=CASE WHEN edit_state='added' THEN 'added' ELSE 'edited' END"]
            elif action == "memo":
                if not memo:
                    raise ApiError("bad_request", "메모를 적어 주세요")
            await conn.execute(
                "INSERT INTO result_edits(id, tenant_id, set_id, det_id, fid, action, cls_before, cls_after, state_before, geom_before, conf_before, memo, "
                "model_id, card_id, card_version, imagery_id, sgg_cd, by_user, test) "
                "SELECT $1, d.tenant_id, d.job_id, d.id, $4, $5, $6, $7, $8, ST_Multi(d.geom), $9, $10, $11, $12, $13, $14, $15, $16, $17 "
                "FROM detections d WHERE d.job_id=$2 AND d.id=$3",
                eid, job_id, row["id"], fid, action, cols["cls_before"], cols.get("cls_after"), cols["state_before"], cols["conf_before"], memo,
                base["model_id"], base["card_id"], base["card_version"], base["imagery_id"], base["sgg_cd"], p.user_id, test)
            if sets:
                args.append(p.user_id)
                await conn.execute(f"UPDATE detections SET {', '.join(sets)}, edited_by=${len(args)} WHERE job_id=$1 AND id=$2", *args)
            if after_geom:
                await conn.execute(f"UPDATE result_edits SET geom_after = {GEO.format('$2')} WHERE id=$1", eid, after_geom)
        await conn.execute("UPDATE result_edits SET year=$2::int, project_id=$3 WHERE id=$1", eid, meta.get("year"), proj)   # 지운 자리 기억 — 영상 연도
        if meta.get("national") and not test:                         # 시험 고치기는 진행 장부 숫자를 바꾸지 않는다
            det = await conn.fetchval("SELECT det_id FROM result_edits WHERE id=$1", eid)
            await _nat_count(conn, job_id, nat_before, await _nat_part(conn, job_id, det))
        from .core import tag_edit
        await tag_edit(conn, eid, cls_id)                              # 고친 기록 → 클래스 id(클래스 한 곳)
        await audit(conn, p, "ximap.edit", f"{job_id}/{fid}", None, {"edit": eid, "action": action, "test": test})
        new = await _row(conn, job_id, fid)
        n = await _card_count(conn, base["card_id"])
    _invalidate()
    return {"edit": {"id": eid, "action": action, "test": test, "at": now_iso()},
            "feature": {"type": "Feature", "id": fid, "geometry": new["g"] if new else None, "properties": _fprops(new) if new else None},
            "card": {"id": base["card_id"], "n": env(n, "count", "recorded", "고친 것(되돌린 것 뺌)")}}


async def _card_count(conn, card_id: str | None) -> int:
    if not card_id:
        return 0
    return int(await conn.fetchval("SELECT count(*) FROM result_edits WHERE card_id=$1 AND undone_at IS NULL AND source <> 'memory'", card_id) or 0)


@router.post("/ximap/edits/{eid}/undo")
async def undo_edit(eid: str, request: Request):
    p = require(principal(request), lx=True, roles=("staff", "admin"))
    async with db(realm="lx") as conn:
        e = await conn.fetchrow("SELECT * FROM result_edits WHERE id=$1", eid)
        if not e:
            raise ApiError("not_found", "그 고치기 기록이 없습니다")
        if e["undone_at"]:
            raise ApiError("conflict", "이미 되돌렸습니다")
        if e["by_user"] != p.user_id and p.role != "admin":
            raise ApiError("forbidden", "고친 사람이나 LX 관리자만 되돌릴 수 있습니다")
        later = await conn.fetchval("SELECT count(*) FROM result_edits WHERE set_id=$1 AND fid=$2 AND undone_at IS NULL AND at > $3 AND action <> 'memo'",
                                    e["set_id"], e["fid"], e["at"])
        if later and e["action"] != "memo":
            raise ApiError("conflict", "이 객체를 그 뒤에 또 고쳤습니다 — 나중 것부터 되돌리세요")
        a = e["action"]
        nat = await _nat(conn, e["set_id"]) if not e["test"] else None
        nat_before = await _nat_part(conn, e["set_id"], e["det_id"]) if nat else None
        if a == "add":
            await conn.execute("DELETE FROM detections WHERE id=$1 AND edit_state='added'", e["det_id"])
        elif a == "delete":
            await conn.execute("UPDATE detections SET edit_state=$2 WHERE id=$1", e["det_id"], e["state_before"] or "raw")
        elif a == "reclass":
            ref = await conn.fetchrow("SELECT cls_en, cid FROM detections WHERE job_id=$1 AND cls=$2 AND id<>$3 LIMIT 1", e["set_id"], e["cls_before"], e["det_id"])
            await conn.execute("UPDATE detections SET cls=$2, cls_en=coalesce($3, cls_en), cid=coalesce($4, cid), edit_state=$5 WHERE id=$1",
                               e["det_id"], e["cls_before"], ref["cls_en"] if ref else None, ref["cid"] if ref else None, e["state_before"] or "raw")
        elif a == "reshape":
            await conn.execute("UPDATE detections d SET geom=e.geom_before, area_m2=round(ST_Area(ST_Transform(e.geom_before,5186))::numeric,1), "
                               "edit_state=coalesce(e.state_before,'raw') FROM result_edits e WHERE e.id=$1 AND d.id=e.det_id", eid)
        await conn.execute("UPDATE result_edits SET undone_by=$2, undone_at=now() WHERE id=$1", eid, p.user_id)
        if nat:
            await _nat_count(conn, e["set_id"], nat_before, await _nat_part(conn, e["set_id"], e["det_id"]) if a != "add" else None)
        await audit(conn, p, "ximap.undo", f"{e['set_id']}/{e['fid']}", {"edit": eid, "action": a}, None)
        new = await _row(conn, e["set_id"], e["fid"]) if a != "add" else None
        n = await _card_count(conn, e["card_id"])
    _invalidate()
    return {"ok": True, "edit": {"id": eid, "action": a},
            "feature": {"type": "Feature", "id": e["fid"], "geometry": new["g"], "properties": _fprops(new)} if new else None,
            "card": {"id": e["card_id"], "n": env(n, "count", "recorded", "고친 것(되돌린 것 뺌)")}}


@router.get("/ximap/edits")
async def live_edits(request: Request, response: Response, sets: str = "", bbox: str = ""):
    """지도 위 '고친 자리' — 살아 있는 고치기(되돌린 것 뺌 · 묶음 60개까지). 객체마다 마지막 고치기 하나.
    결과 조각은 1년 보관(판 번호 주소)이고 고치기는 조각을 바꾸지 않으므로, 이 층은 보관하지 않는다(no-store · 고친 즉시 새 모습)."""
    response.headers["Cache-Control"] = "no-store"
    p = require(principal(request), lx=True)
    want = [s for s in sets.split(",") if s][:60]                     # 화면 안 시군구 넷 × 서비스 여럿(20이면 뒤 묶음의 고친 자리가 빠진다 · 10-15)
    ids = []
    name_of: dict[str, str] = {}                                  # job id → 화면이 부른 묶음 이름(결과 층 · 색 규칙 · 숨김이 그 이름으로 묶인다)
    for s in want:
        try:
            jid = (await _resolve(p, s))["job_id"]
            ids.append(jid)
            name_of.setdefault(jid, s)
        except ApiError:
            continue
    box = None
    try:                                                          # 전국 결과(줌 11+) — 화면 범위 안 전국 결과 묶음의 고친 자리(묶음이 많아 범위로)
        box = [float(v) for v in bbox.split(",")] if bbox else None
        if box and (len(box) != 4 or box[2] - box[0] > 1.0 or box[3] - box[1] > 1.0):
            box = None
    except ValueError:
        box = None
    if not ids and not box:
        return {"type": "FeatureCollection", "features": []}
    async with db(realm="lx") as conn:
        rows = await conn.fetch(
            "SELECT DISTINCT ON (e.set_id, e.fid) e.id, e.set_id, e.fid, e.action, e.cls_before, e.cls_after, e.memo, e.test, e.at, "
            "ST_AsGeoJSON(coalesce(e.geom_after, d.geom, e.geom_before), 7)::json AS g, ST_AsGeoJSON(e.geom_before, 7)::json AS g0 "
            "FROM result_edits e LEFT JOIN detections d ON d.id = e.det_id WHERE e.undone_at IS NULL AND (e.set_id = ANY($1::text[]) "
            "OR ($2::float8[] IS NOT NULL AND e.set_id IN (SELECT job_id FROM national_jobs) "
            "    AND coalesce(e.geom_after, e.geom_before) && ST_MakeEnvelope($2[1], $2[2], $2[3], $2[4], 4326))) "
            "ORDER BY e.set_id, e.fid, e.at DESC", ids, box)
    feats = []
    for r in rows:
        pr = {"edit": r["id"], "fid": r["fid"], "action": r["action"], "cls": r["cls_after"] or r["cls_before"], "test": r["test"],
              "set": name_of.get(r["set_id"], r["set_id"])}
        if r["g"]:
            feats.append({"type": "Feature", "geometry": r["g"], "properties": {**pr, "part": "now"}})
        if r["action"] == "reshape" and r["g0"]:
            feats.append({"type": "Feature", "geometry": r["g0"], "properties": {**pr, "part": "before"}})
    return {"type": "FeatureCollection", "features": feats}


@router.get("/ximap/edits/summary")
async def edits_summary(request: Request):
    """서비스별 고친 것 수(되돌린 것 뺌) → 그 서비스 프로젝트 — '재학습으로 잇는 길'(학습 실행은 하지 않는다)."""
    p = require(principal(request), lx=True)
    from .projects import project_of_card
    from .train_tiles import count_tiles
    async with db(realm="lx") as conn:
        rows = await conn.fetch("SELECT e.card_id, c.name AS cname, count(*) AS n, count(*) FILTER (WHERE e.test) AS n_test, max(e.at) AS last "
                                "FROM result_edits e LEFT JOIN cards c ON c.id = e.card_id WHERE e.undone_at IS NULL AND e.source <> 'memory' "
                                "AND NOT EXISTS (SELECT 1 FROM national_jobs n WHERE n.job_id = e.set_id) GROUP BY e.card_id, c.name ORDER BY n DESC")
        # 전국 결과(결과 자산마다) — 학습 데이터는 전국 분석 모델을 학습한 프로젝트(원칙 243 · 결정 3 규칙 그대로)
        nat = await conn.fetch("SELECT n.asset, max(e.project_id) AS project_id, count(*) AS n, count(*) FILTER (WHERE e.test) AS n_test, max(e.at) AS last "
                               "FROM result_edits e JOIN national_jobs n ON n.job_id = e.set_id WHERE e.undone_at IS NULL AND e.source <> 'memory' "
                               "GROUP BY n.asset ORDER BY n DESC")
        out = []
        from .national import ASSETS as NAT_ASSETS
        for r in nat:
            pr = await conn.fetchrow("SELECT id, name FROM projects WHERE id=$1", r["project_id"]) if r["project_id"] else None
            nt = await conn.fetchval("SELECT count(*) FROM train_tiles t WHERE t.state='made' AND NOT t.test AND t.set_id IN "
                                     "(SELECT job_id FROM national_jobs WHERE asset=$1)", r["asset"])
            out.append({"card_id": None, "service": NAT_ASSETS.get(r["asset"], r["asset"]),
                        "n": env(int(r["n"]), "count", "recorded", "고친 것(되돌린 것 뺌)"), "n_test": env(int(r["n_test"]), "count", "recorded", "그중 시험 고치기"),
                        "tiles": env(int(nt or 0), "count", "recorded", "수정된 부분(1장이 된 칸)"), "last_at": _iso(r["last"]),
                        "project": {"id": pr["id"], "name": pr["name"]} if pr else None})
        for r in rows:
            pr = await project_of_card(conn, r["card_id"]) if r["card_id"] else None
            out.append({"card_id": r["card_id"], "service": svc_name(r["cname"]) if r["cname"] else "토지피복",
                        "n": env(int(r["n"]), "count", "recorded", "고친 것(되돌린 것 뺌)"), "n_test": env(int(r["n_test"]), "count", "recorded", "그중 시험 고치기"),
                        # 수정된 부분 n장 = 1장이 된 칸(학습 화면 · XI 재학습과 같은 셈 · 10-13 저절로-문구)
                        "tiles": env(await count_tiles(conn, card_id=r["card_id"]) if r["card_id"] else 0, "count", "recorded", "수정된 부분(1장이 된 칸)"),
                        "last_at": _iso(r["last"]),
                        "project": {"id": pr["id"], "name": pr["name"]} if pr else None})
    return {"items": out, "total": env(sum(x["n"]["value"] for x in out), "count", "recorded", "고친 것(되돌린 것 뺌)"), "as_of": now_iso()}


@router.post("/ximap/memory/apply")
async def memory_apply(request: Request, body: dict):
    """지운 자리 기억을 그 결과에 적용(LX 관리자 · 작업기 마무리가 저절로 하는 일과 같은 함수) — {set, force?}."""
    p = require(principal(request), admin=True)
    rs = await _resolve(p, str(body.get("set") or ""))
    from .edit_memory import apply as mem_apply
    async with db(realm="lx") as conn:
        res = await mem_apply(conn, rs["job_id"], force=bool(body.get("force")))
        await audit(conn, p, "ximap.memory", rs["job_id"], None, res)
    _invalidate()
    return {"result": {k: env(v, "count", "recorded", f"지운 자리 기억 {k}") if isinstance(v, int) else v for k, v in res.items()}, "as_of": now_iso()}


# ── 첫 화면 묶음(impl-38 ximap-boot · 10-15 '기관XI맵-3초') ─────────────────────────────────────────────
# XI맵 첫 화면이 따로 부르던 자료(로그인 확인 · 기관 · 관할 · 카탈로그 · 집계 · 지역 경계 · 결과 목록 · 지역 요약 · 영상 서명 · 판 번호 …)를
# 한 요청으로. 묶음 안의 하나하나는 지금 API 를 같은 사람(같은 Authorization)으로 게이트웨이 안에서 그대로 부른 응답 — 숫자 · 권한 · 거르기가
# 따로 부를 때와 같다(한 출처). 화면(api-v1.js)은 경로마다 한 번 이 응답을 쓰고, 없거나 실패한 것은 예전처럼 따로 부른다.
_BOOT_HDR = {b"authorization", b"host", b"x-forwarded-for", b"x-forwarded-proto", b"x-forwarded-host", b"x-lx-site", b"cf-connecting-ip", b"user-agent"}
_BOOT_SVC = __import__("re").compile(r"^[\w-]{1,64}$")
_BOOT_SGG = __import__("re").compile(r"^\d{5}$")


async def _inproc(request: Request, path: str) -> tuple[int, bytes | None]:
    """게이트웨이 안에서 GET 한 번(같은 미들웨어 · 같은 로그인 확인) → (상태, JSON 본문 | None)."""
    from urllib.parse import unquote
    u = path if path.startswith(("/tiles", "/files")) else "/api/v1" + path
    pth, _, qs = u.partition("?")
    hdrs = [(k, v) for k, v in request.scope.get("headers", []) if k in _BOOT_HDR] + [(b"accept", b"application/json")]
    scope = {k: v for k, v in request.scope.items() if k not in ("route", "endpoint", "path_params", "router", "state")}
    scope.update(type="http", method="GET", path=unquote(pth), raw_path=pth.encode(), query_string=qs.encode(), headers=hdrs, state={})
    out: dict = {"st": 500, "ct": b"", "body": []}
    fin = asyncio.Event()
    sent = False

    async def receive():
        nonlocal sent
        if not sent:
            sent = True
            return {"type": "http.request", "body": b"", "more_body": False}
        await fin.wait()
        return {"type": "http.disconnect"}

    async def send(m):
        if m["type"] == "http.response.start":
            out["st"] = m["status"]
            out["ct"] = dict(m.get("headers") or []).get(b"content-type", b"")
        elif m["type"] == "http.response.body":
            out["body"].append(m.get("body", b""))
    try:
        await request.scope["app"](scope, receive, send)
    finally:
        fin.set()
    body = b"".join(out["body"])
    return out["st"], (body if b"json" in out["ct"] and body else None)


def _home(regs: list[dict], tn: str, want: str | None) -> str | None:
    """첫 지역 — 화면(app.js homeRegion)과 같은 판정: 주소의 지역 → 기관 이름이 시군구 하나 → 관할이 한 곳이면 그곳. 광역(여러 곳)은 없음(사용자가 고른다)."""
    import re as _re
    norm = lambda s: _re.sub(r"\s+", "", str(s or ""))   # noqa: E731
    rs = [{"code": str(x.get("sgg_cd")), "name": x.get("name"), "full": x.get("full"), "sido": (str(x.get("full") or "").split() or [x.get("sido")])[0]}
          for x in regs if x.get("geometry")]
    if want and any(r["code"] == want for r in rs):
        return want
    n = norm(tn)
    if n:
        for r in rs:
            if r["code"] == n or norm(r["full"]) == n or norm(r["name"]) == n:
                return r["code"]
        for r in rs:
            if norm(r["name"]) and n.endswith(norm(r["name"])) and norm(r["sido"])[:2] in n:
                return r["code"]
    return rs[0]["code"] if len(rs) == 1 else None


def _line(obj: dict, body: bytes | None = None) -> bytes:
    """묶음 한 줄(줄 = JSON 하나). 본문은 받은 JSON 그대로 붙인다 — JSON 의 줄바꿈은 글자 밖에서만 나오므로 빼도 뜻이 같다."""
    head = json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode()
    if body is None:
        return head + b"\n"
    return head[:-1] + b',"b":' + body.replace(b"\r", b"").replace(b"\n", b"") + b"}\n"


@router.get("/ximap/boot")
async def boot(request: Request, service: str | None = None, region: str | None = None):
    """XI맵 첫 화면 묶음 — 한 요청 · 다 된 것부터 한 줄씩 흘려 보낸다(application/x-ndjson).
    줄: {"plan":[경로…],"final":참/거짓} 보낼 경로 · {"home":시군구} 첫 지역 · {"p":경로,"s":상태,"b":본문} 응답 하나 · {"took":{…}} 끝(증거용 시간).
    LX = 로그인 확인 · 전국 결과 · 판 번호 · 밀도 · 영상 서명, 기관 = 로그인 확인 · 기관 · 관할 · 집계 · 첫 지역의 경계 · 결과 목록 · 요약 · 영상 서명."""
    from urllib.parse import quote
    from starlette.responses import StreamingResponse
    p = require(principal(request))
    lx = p.is_lx
    build = "lx" if lx else "tenant"
    cat = f"/catalog/layers?stage=domestic&build={build}&locale=ko"
    paths = ["/me", "/survey/rules", "/survey/stats?by=rule", cat, "/regions?limit=400", "/reviews/notify", "/auth/session"]
    if lx:      # LX 첫 화면(전국 결과)은 읍면동 집계(전국 · 큼)를 기다리지 않는다 — 따로 받는다
        paths += ["/ximap/board", "/national/progress", "/approvals?state=pending", "/ximap/density?g=0"]
    elif p.realm == "tenant" and p.tenant_id:
        paths += ["/survey/stats?by=emd", "/auth/tenants", "/brand/" + quote(p.tenant_id, safe=""), "/regions?geom=1", "/regions"]
        if service and _BOOT_SVC.match(service):
            paths += ["/requests/services", "/requests/shared-imagery", "/spaces/me/guides/" + service]
    want = region if region and _BOOT_SGG.match(region) else None
    q: asyncio.Queue = asyncio.Queue()
    sem = asyncio.Semaphore(16)
    took: dict[str, list[int]] = {}               # 경로 → [묶음 시작부터 시작 · 걸린 시간](ms · 증거용 — 화면은 쓰지 않는다)
    t0 = time.perf_counter()

    async def one(pth: str):
        async with sem:
            a = time.perf_counter()
            try:
                r = await _inproc(request, pth)
            except Exception:  # noqa: BLE001 — 하나가 실패해도 나머지는 그대로(화면이 그 하나만 따로 부른다)
                r = (500, None)
            took[pth] = [round((a - t0) * 1000), round((time.perf_counter() - a) * 1000)]
        q.put_nowait(_line({"p": pth, "s": r[0]}, r[1]))
        return r

    # 먼저 = 첫 화면이 바로 기다리는 가벼운 것(로그인 확인 · 기관 · 관할 · 전국 결과). 나머지는 그 뒤에 — 한 게이트웨이 안에서 모두 한꺼번에 돌리면
    # 가벼운 것도 무거운 것과 번갈아 돌아 늦게 나온다
    FIRST = {"/me", "/auth/tenants", "/regions?geom=1", "/regions?limit=400", "/survey/rules", "/ximap/board"} | {x for x in paths if x.startswith("/brand/")}
    gate1 = asyncio.Event()

    async def later(pth: str):
        await gate1.wait()
        return await one(pth)
    tasks = {pth: asyncio.create_task(one(pth) if pth in FIRST else later(pth)) for pth in paths}

    async def first_wave():
        await asyncio.gather(*(tasks[x] for x in paths if x in FIRST), return_exceptions=True)
        gate1.set()
    asyncio.get_running_loop().create_task(first_wave())

    async def region_part():
        home = None
        try:
            if p.realm == "tenant":
                st, b = await tasks["/regions?geom=1"]
                sd, bd = await tasks["/auth/tenants"]
                regs = (json.loads(b).get("items") or []) if st == 200 and b else []
                tn = ""
                if sd == 200 and bd:
                    t = next((x for x in json.loads(bd).get("items") or [] if x.get("id") == p.tenant_id), None) or {}
                    tn = (t.get("name") or {}).get("ko") or (t.get("name") or {}).get("en") or ""
                home = _home(regs, tn, want)
            elif want:
                home = want
        except Exception:  # noqa: BLE001 — 첫 지역 판정이 어긋나도 공통 자료는 그대로(지역 자료는 화면이 따로 부른다)
            home = None
        more = []
        if home:
            c = quote(home, safe="")
            more = [f"/regions/{c}/emd", f"/regions/{c}/results", "/summary?region=" + c]
        q.put_nowait(_line({"home": home, "plan": more}))
        sub = [asyncio.create_task(one(x)) for x in more]
        signs: list[str] = []
        try:
            sc, bc = await tasks[cat]
            if sc == 200 and bc:       # 원본 영상 서명(화면 cogLayers 와 같은 거르기 — 쓰지 않는 것은 화면이 버린다) — 서명 함수(GET /tiles/sign)를 이 요청 그대로 부른다
                from .tiles import tiles_sign
                a = time.perf_counter()
                lines = []
                for it in (json.loads(bc).get("items") or [])[:200]:
                    if it.get("role") == "imagery" and it.get("tier") == "raw" and it.get("source") in ("cog", "pmtiles") and it.get("bounds") and it.get("tile_ready") is not False:
                        st = "cog/" + str(it.get("id"))
                        k = "/tiles/sign?set=" + quote(st, safe="")
                        signs.append(k)
                        try:
                            lines.append(_line({"p": k, "s": 200}, json.dumps(await tiles_sign(st, request), ensure_ascii=False, separators=(",", ":")).encode()))
                        except ApiError as e:
                            lines.append(_line({"p": k, "s": e.status}))
                q.put_nowait(_line({"plan": signs}))
                for x in lines:
                    q.put_nowait(x)
                took["/tiles/sign"] = [round((a - t0) * 1000), round((time.perf_counter() - a) * 1000)]
        except Exception:  # noqa: BLE001
            pass
        q.put_nowait(_line({"final": True}))
        await asyncio.gather(*sub)

    async def gen():
        yield _line({"plan": paths})
        rp = asyncio.create_task(region_part())
        done = asyncio.gather(rp, *tasks.values(), return_exceptions=True)
        while True:
            if done.done() and q.empty():
                break
            g = asyncio.create_task(q.get())
            await asyncio.wait({g, done}, return_when=asyncio.FIRST_COMPLETED)
            if g.done():
                yield g.result()
            else:
                g.cancel()
        yield _line({"took": took, "as_of": now_iso()})

    hd = {"Cache-Control": "no-store", "X-Accel-Buffering": "no"}
    if "gzip" not in (request.headers.get("accept-encoding") or ""):
        return StreamingResponse(gen(), media_type="application/x-ndjson", headers=hd)

    async def gz():                # 줄마다 눌러 바로 내보낸다(동기 비우기 — 받는 쪽이 줄 단위로 풀 수 있다)
        import zlib
        z = zlib.compressobj(5, zlib.DEFLATED, 31)
        async for ln in gen():
            yield z.compress(ln) + z.flush(zlib.Z_SYNC_FLUSH)
        yield z.flush()
    return StreamingResponse(gz(), media_type="application/x-ndjson", headers={**hd, "Content-Encoding": "gzip", "Vary": "Accept-Encoding"})
