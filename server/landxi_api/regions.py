"""전국 지역(F3 최종 명세 §3 S-3) — `GET /regions` · `GET /regions/{sgg}`.

뼈대 = server/seed/regions-sgg.json(행정경계 시군구 252 · build_regions.py). 이름·코드 갱신 = V-World LT_C_ADSIGG_INFO
(캐시 90일 · 게이트웨이가 백그라운드로 받는다 · 키 오류면 뼈대 그대로). 뼈대에 없는 새 코드(개편 시군구)는 V-World 경계로 bbox 를 채운다.
has_imagery = 자체 영상(imagery.footprint) ∩ 시군구 경계 · deploys = 배포본 AOI(또는 sgg_cd) ∩ 시군구 · n_findings = 실태조사 의심(RLS).
지역 고정값 0 — 모든 값은 표·파일에서 계산한다. 읍면동 경계(GET /regions/{sgg}/emd · emd_index) = V-World LT_C_ADEMD_INFO 캐시.
"""
from __future__ import annotations

import asyncio
import datetime as dt
import json
import os
import time
from pathlib import Path

import httpx
from fastapi import APIRouter, Request
from shapely.geometry import box, shape
from starlette.concurrency import run_in_threadpool

from . import config
from .deps import ApiError, db, principal, require
from .envelope import env, now_iso

router = APIRouter()
SEED = config.SERVER_ROOT / "seed" / "regions-sgg.json"
SEED_GEOM = config.SERVER_ROOT / "seed" / "sgg-simplified.geojson"
SRC_SEED = "행정경계 시군구(SGG_korea)"
SRC_VW = "V-World 시군구 경계(LT_C_ADSIGG_INFO)"
_cache: dict = {"t": 0.0, "regions": None, "geoms": None, "src": SRC_SEED, "vw_at": None, "vw_status": None, "refreshing": False}
_derived: dict = {"t": 0.0, "data": None}
DERIVED_TTL = 60


def _vw_cache_path() -> Path:
    return config.DATA_ROOT / "cache" / "regions" / "vworld-adsigg.json"


def _cfg() -> dict:
    try:
        return config.load_yaml("regions") or {}
    except Exception:
        return {}


def _load_seed() -> tuple[list[dict], dict]:
    d = json.loads(SEED.read_text(encoding="utf-8"))
    g = json.loads(SEED_GEOM.read_text(encoding="utf-8"))
    geoms = {f["properties"]["sgg_cd"]: _valid(shape(f["geometry"])) for f in g["features"]}
    return d["items"], geoms


def _valid(g):
    """단순화(0.01°)로 꼬인 경계(섬 많은 시군구 75곳) → 유효 도형. 교차 연산(영상·배포 → 시군구)이 GEOS 오류로 빠지지 않게."""
    if g.is_valid:
        return g
    try:
        from shapely.validation import make_valid
        v = make_valid(g)
        if v.geom_type == "GeometryCollection":
            from shapely.geometry import MultiPolygon
            polys = [x for x in v.geoms if x.geom_type in ("Polygon", "MultiPolygon")]
            v = MultiPolygon([p for x in polys for p in (x.geoms if x.geom_type == "MultiPolygon" else [x])])
        return v
    except Exception:
        return g.buffer(0)


def regions_base() -> tuple[list[dict], dict, str]:
    """(지역 목록, {sgg_cd: shapely}, 출처) — V-World 캐시(90일)가 있으면 그 목록이 정본, 경계는 뼈대(없으면 V-World bbox).
    시도 이름은 sido_label() 한 가지로(화면·문서·에이전트가 같은 표기 · c2-numbers)."""
    if _cache["regions"] is None:
        items, geoms = _load_seed()
        _cache.update(regions=[_label_rec(r) for r in items], geoms=geoms, src=SRC_SEED)
        vp = _vw_cache_path()
        if vp.exists():
            try:
                _apply_vw(json.loads(vp.read_text(encoding="utf-8")), (items, dict(geoms)))
            except Exception as e:  # pragma: no cover
                _cache["vw_status"] = f"cache read error {type(e).__name__}"
    return _cache["regions"], _cache["geoms"], _cache["src"]


# ── 시도 이름 한 가지(c2-numbers · 기본값 결정 plan 4절) ─────────────────────────────────────────────
# V-World 행정구역 이름(전남광주통합특별시)과 기관 표기(tenants.name.ko 광주전남특별시)가 섞여 한 문서에 두 이름이 나왔다.
# 표기는 기관 표기 하나로 맞춘다 — 원천 이름 → 표기. 사용자가 바꾸면 이 표 한 줄만 고친다.
SIDO_LABEL = {"전남광주통합특별시": "광주전남특별시"}
SIDO_ALIASES = {v: k for k, v in SIDO_LABEL.items()}        # 표기 → 원천 이름(검색·옛 자료 읽기)


def sido_label(x: str | None) -> str | None:
    """시도 표기 하나 — 인자: 시도 이름(원천·표기 어느 쪽이든) · 시군구 코드 5자리(지금/옛) · 시도 코드 2자리.
    같은 시도는 어느 화면·문서·에이전트에서든 같은 글자로 나간다."""
    if not x:
        return None
    s = str(x).strip()
    if s.isdigit():
        if len(s) >= 5:
            r = region_of(s[:5])
            return sido_label(r.get("sido")) if r else None
        regions, _, _ = regions_base()
        r = next((r for r in regions if r["sgg_cd"].startswith(s[:2])), None)
        return sido_label(r.get("sido")) if r else None
    return SIDO_LABEL.get(s, s)


def full_label(full: str | None) -> str | None:
    """'시도 시군구 …' 문자열의 머리 시도 이름을 표기 하나로(주소·지역 이름 공통)."""
    if not full:
        return full
    head, _, rest = str(full).partition(" ")
    lab = SIDO_LABEL.get(head)
    return f"{lab} {rest}".strip() if lab else full


def _label_rec(r: dict) -> dict:
    out = dict(r)
    if out.get("sido"):
        out["sido"] = sido_label(out["sido"])
    if out.get("full"):
        out["full"] = full_label(out["full"])
    return out


def _apply_vw(vw: dict, seed: tuple[list[dict], dict] | None = None):
    items, geoms = seed or _load_seed()          # 기동 시엔 방금 읽은 뼈대를 그대로(두 번 읽기 0)
    by = {r["sgg_cd"]: r for r in items}
    # 코드가 바뀐 시군구(예: 전남광주통합특별시 12xxx ← 옛 전남 46xxx · 광주 29xxx) — 뼈대에서 '사라진 코드'끼리 이름으로 이어
    # 옛 경계를 그대로 쓴다(사각형 bbox 로 떨어지지 않게 · lx-ingest 요청). 이름이 둘 이상 겹치면 잇지 않는다.
    vw_cds = {str(f["sig_cd"]) for f in vw.get("items", [])}
    retired: dict[str, list[dict]] = {}
    for r in items:
        if r["sgg_cd"] not in vw_cds:
            retired.setdefault((r["name"] or "").replace(" ", ""), []).append(r)
    out = []
    for f in vw.get("items", []):
        cd = str(f["sig_cd"])
        base = by.get(cd)
        if base is None:
            cand = retired.get((f.get("sig_kor_nm") or "").replace(" ", ""), [])
            if len(cand) > 1 and f.get("bbox"):          # 같은 이름(동구 · 서구 …) → V-World 범위 안에 중심이 있는 옛 코드만
                x0, y0, x1, y1 = f["bbox"]
                cand = [c for c in cand if c.get("center") and x0 <= c["center"][0] <= x1 and y0 <= c["center"][1] <= y1]
            if len(cand) == 1:
                base = {**cand[0], "sgg_cd": cd, "prev_cd": cand[0]["sgg_cd"]}
                if cand[0]["sgg_cd"] in geoms:
                    geoms[cd] = geoms[cand[0]["sgg_cd"]]
        full = full_label(f.get("full_nm") or (base or {}).get("full"))
        sido = sido_label(full.split(" ", 1)[0] if full else (base or {}).get("sido"))
        rec = {"sgg_cd": cd, "sido": sido, "sido_short": _short(sido) if (sido and (not base or base.get("prev_cd") or sido != base.get("sido"))) else ((base or {}).get("sido_short") or _short(sido)), "name": f.get("sig_kor_nm") or (base or {}).get("name"),
               "full": full, "name_en": f.get("sig_eng_nm"), "parent_cd": (base or {}).get("parent_cd"),
               "bbox": (base or {}).get("bbox") or f.get("bbox"), "center": (base or {}).get("center") or f.get("center")}
        if (base or {}).get("prev_cd"):
            rec["prev_cd"] = base["prev_cd"]          # 옛 코드(연속지적 PNU 앞 5자리가 옛 코드인 자료와 잇는 데 쓴다)
        if cd not in geoms and f.get("geom"):
            try:
                geoms[cd] = _valid(shape(f["geom"]))
            except Exception:
                pass
        if cd not in geoms and f.get("bbox"):
            geoms[cd] = box(*f["bbox"])
        out.append(rec)
    if len(out) >= 200:            # 부분 응답이면 쓰지 않는다
        out.sort(key=lambda r: r["sgg_cd"])
        _cache.update(regions=out, geoms=geoms, src=SRC_VW, vw_at=vw.get("fetched_at"), vw_status="ok")


# 전남광주통합특별시 = 기관(tenants.name.ko '광주전남특별시')과 같은 표기 — 콘솔 점·비행 라벨과 배포 화면이 한 이름을 쓴다
SHORT = {"광주전남특별시": "광주전남특별시", "강원특별자치도": "강원", "경기도": "경기", "경상남도": "경남", "경상북도": "경북", "광주광역시": "광주", "대구광역시": "대구",
         "대전광역시": "대전", "부산광역시": "부산", "서울특별시": "서울", "세종특별자치시": "세종", "울산광역시": "울산", "인천광역시": "인천",
         "전라남도": "전남", "전남광주통합특별시": "광주전남특별시", "전북특별자치도": "전북", "제주특별자치도": "제주", "충청남도": "충남", "충청북도": "충북"}


def _geom_small(g) -> dict:
    """뼈대와 같은 규격(단순화 0.001° · 좌표 5자리)의 GeoJSON."""
    from shapely.geometry import mapping
    s = g.simplify(0.001, preserve_topology=True)

    def rnd(c):
        return [round(c[0], 5), round(c[1], 5)] if isinstance(c[0], (int, float)) else [rnd(x) for x in c]
    m = json.loads(json.dumps(mapping(s)))
    m["coordinates"] = rnd(m["coordinates"])
    return m


def _short(sido: str | None) -> str | None:
    return SHORT.get(sido or "", sido)


async def refresh_vworld(force: bool = False) -> dict:
    """LT_C_ADSIGG_INFO 속성 전부(+ 뼈대에 없는 코드는 경계 bbox) → cache/regions/vworld-adsigg.json. 90일 안이면 건너뜀."""
    cfgv = (_cfg().get("vworld") or {})
    if not cfgv.get("enabled", True):
        return {"status": "disabled"}
    vp = _vw_cache_path()
    days = int(cfgv.get("cache_days", 90))
    if vp.exists() and not force and time.time() - vp.stat().st_mtime < days * 86400:
        return {"status": "fresh"}
    if _cache["refreshing"]:
        return {"status": "running"}
    _cache["refreshing"] = True
    try:
        from .proxy import vworld_key
        key, dom = vworld_key()
        if not key:
            _cache["vw_status"] = "key_missing"
            return {"status": "key_missing"}
        base = {"service": "data", "request": "GetFeature", "data": cfgv.get("layer", "LT_C_ADSIGG_INFO"), "key": key, "domain": dom,
                "geomFilter": "BOX(124,33,132,39)", "size": 1000, "geometry": "false", "attribute": "true", "format": "json", "crs": "EPSG:4326"}
        feats = []
        async with httpx.AsyncClient(timeout=30, headers={"User-Agent": "LandXI-gateway/0.1"}) as c:
            for page in range(1, 5):
                r = await c.get("https://api.vworld.kr/req/data", params={**base, "page": page})
                j = r.json().get("response", {})
                if j.get("status") != "OK":
                    _cache["vw_status"] = f"vworld {j.get('status')} {(j.get('error') or {}).get('code', '')}".strip()
                    return {"status": _cache["vw_status"]}
                fs = j["result"]["featureCollection"]["features"]
                feats += [f["properties"] for f in fs]
                if page >= int(j["page"]["total"]):
                    break
            seed_codes = {r["sgg_cd"] for r in _load_seed()[0]}
            for f in feats:
                if str(f["sig_cd"]) in seed_codes:
                    continue
                q = {**base, "geometry": "true", "attrFilter": f"sig_cd:=:{f['sig_cd']}", "size": 1}
                r = await c.get("https://api.vworld.kr/req/data", params=q)
                j = r.json().get("response", {})
                try:
                    g = shape(j["result"]["featureCollection"]["features"][0]["geometry"])
                    f["bbox"] = [round(v, 4) for v in g.bounds]
                    f["geom"] = _geom_small(g)          # 새로 생긴 시군구 = 실제 경계(사각형 0)
                    pt = g.representative_point()
                    f["center"] = [round(pt.x, 4), round(pt.y, 4)]
                except Exception:
                    pass
        out = {"fetched_at": now_iso(), "layer": base["data"], "n": len(feats), "items": feats}
        vp.parent.mkdir(parents=True, exist_ok=True)
        vp.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
        _apply_vw(out)
        _derived["t"] = 0
        return {"status": "ok", "n": len(feats)}
    except Exception as e:
        _cache["vw_status"] = f"error {type(e).__name__}"
        return {"status": _cache["vw_status"]}
    finally:
        _cache["refreshing"] = False


def _kick_refresh():
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return
    vp = _vw_cache_path()
    days = int((_cfg().get("vworld") or {}).get("cache_days", 90))
    if (not vp.exists() or time.time() - vp.stat().st_mtime > days * 86400) and not _cache["refreshing"]:
        loop.create_task(refresh_vworld())


def _hit(g_sgg, g_other) -> bool:
    """시군구와 겹침 판정 — 경계 맞닿음은 제외(교집합이 시군구의 5% 이상 또는 상대의 30% 이상)."""
    try:
        if not g_sgg.intersects(g_other):
            return False
        a = g_sgg.intersection(g_other).area
        return a > 0.05 * g_sgg.area or a > 0.3 * max(g_other.area, 1e-12)
    except Exception:
        return False


async def derived() -> dict:
    """영상·배포 → 시군구(60 s 캐시 · 권한 무관 · 필터는 응답 단계에서)."""
    if _derived["data"] is not None and time.time() - _derived["t"] < DERIVED_TTL:
        return _derived["data"]
    regions, geoms, _ = regions_base()
    async with db(realm="lx") as conn:
        imgs = await conn.fetch("SELECT id, name, tier, gsd_m, epoch, year, kind, sgg_cd, export_policy, ST_AsGeoJSON(footprint)::json AS fp FROM imagery")
        dps = await conn.fetch("SELECT id, tenant_id, card_id, stage, sgg_cd, coalesce(test,false) AS test, region_name, "
                               "ST_AsGeoJSON(ST_SimplifyPreserveTopology(aoi, 0.001))::json AS aoi FROM deploys")
        led = await conn.fetch("SELECT tenant_id, kind, id, rows, stats, created_at FROM ledger_imports WHERE latest AND state='matched'")
        par = await conn.fetch("SELECT substr(pnu,1,5) sgg, count(*) n FROM survey_parcels GROUP BY 1")

    def work():
        img_by: dict[str, list] = {}
        dp_by: dict[str, list] = {}
        for i in imgs:
            hits = [i["sgg_cd"]] if i["sgg_cd"] else []
            if not hits and i["fp"]:
                g = shape(i["fp"])
                hits = [cd for cd, gs in geoms.items() if _hit(gs, g)]
            for cd in hits:
                img_by.setdefault(cd, []).append({"id": i["id"], "name": (i["name"] or {}).get("ko") if isinstance(i["name"], dict) else i["name"],
                                                   "epoch": i["epoch"], "year": i["year"], "gsd_m": float(i["gsd_m"]) if i["gsd_m"] is not None else None,
                                                   "kind": i["kind"], "tier": i["tier"], "export_policy": i["export_policy"]})
        for d in dps:
            hits = [d["sgg_cd"]] if d["sgg_cd"] else []
            if not hits and d["aoi"]:
                g = shape(d["aoi"])
                hits = [cd for cd, gs in geoms.items() if _hit(gs, g)]
            for cd in hits:
                dp_by.setdefault(cd, []).append({"id": d["id"], "card": d["card_id"], "stage": d["stage"], "tenant_id": d["tenant_id"], "_test": d["test"]})
        return img_by, dp_by

    img_by, dp_by = await run_in_threadpool(work)
    data = {"img": img_by, "dp": dp_by, "ledger": [dict(x) for x in led], "parcels": _alias({x["sgg"]: int(x["n"]) for x in par}), "at": now_iso()}
    _derived.update(t=time.time(), data=data)
    return data


def tenant_scope(tenant_id: str | None) -> list[str] | None:
    """기관 관할 시군구 코드 접두(None = 국내 관할 없음 · [] = 전국 권한)."""
    t = (_cfg().get("tenants") or {}).get(tenant_id or "")
    if not t:
        return None
    if t.get("global"):
        return None
    return list(t.get("sgg") or [])


def in_scope(sgg_cd: str, prefixes: list[str] | None) -> bool:
    if prefixes is None:
        return False
    if prefixes == []:
        return True
    return any(sgg_cd.startswith(px) for px in prefixes)


# ═══ 관할 가드(원칙 39 · 계정 범위 밖 0) — 지역 목록 · 지역 상세 · 분석 견적·등록 · 필지 조회가 같이 쓰는 한 판정 ═══════════════
# LX 계정 = 전국. 기관 계정 = 관할 시군구(config/regions.yaml tenants) 안만 — 밖은 호출·표시·열람 모두 0(서버가 내주지 않는다).
# 해외 기관 = 국내 관할 없음(국내 0) · 해외 사업 구역(프로필 범위 + 그 나라 구역) 안만. 게스트 = 관할 없음.
SCOPE_TOL = 0.0001          # 경계선 그리기 오차(약 10m) — 화면이 보낸 읍면동 경계(단순화 ≈5m)가 거절되지 않을 만큼만. 이보다 밖이면 관할 밖


def scope_of(p) -> list[str] | None:
    """계정의 국내 관할 — None = 전국(LX · 전국 권한 기관) · [접두…] = 기관 관할 시군구 · [] = 국내 관할 없음(해외 기관 · 게스트)."""
    realm = getattr(p, "realm", None)
    if realm == "lx":
        return None
    if realm == "tenant":
        sc = tenant_scope(getattr(p, "tenant_id", None))
        if sc is None:
            return []
        dept = getattr(p, "sgg", None)                 # 광역 기관 부서별 관할(나중 16) — 부서 사용자는 그 부서의 시군구만(기관 관할 안의 것만)
        if dept:
            return [c for c in dept if sc == [] or in_scope(c, sc)] or []
        return None if sc == [] else sc
    return []


def region_allowed(p, sgg_cd: str | None) -> bool:
    """그 시군구(지금 코드 · 옛 코드 어느 쪽이든)가 계정 관할 안인가."""
    sc = scope_of(p)
    if sc is None:
        return True
    if not sc or not sgg_cd:
        return False
    return any(in_scope(c, sc) for c in (sgg_codes(str(sgg_cd)[:5]) or [str(sgg_cd)[:5]]))


def ensure_region(p, sgg_cd: str | None):
    """관할 밖 시군구 = '없는 지역'과 같은 답(있다는 사실도 알리지 않는다 · 404)."""
    if not region_allowed(p, sgg_cd):
        raise ApiError("not_found", "해당 지역이 없습니다", {"sgg_cd": sgg_cd})


def scope_regions(p) -> list[dict]:
    """계정이 볼 수 있는 시군구 목록(regions_base 행) — LX 는 전국."""
    regions, _, _ = regions_base()
    sc = scope_of(p)
    if sc is None:
        return list(regions)
    if not sc:
        return []
    return [r for r in regions if any(in_scope(c, sc) for c in (r["sgg_cd"], r.get("prev_cd")) if c)]


def _scope_union(p, bounds) -> object | None:
    """관할 시군구 가운데 bounds 근처(0.05°) 것들의 경계 합 — 읍면동 경계(V-World 캐시)의 합이 정밀 경계, 못 받으면 뼈대 경계."""
    from shapely.ops import unary_union
    _, geoms, _ = regions_base()
    x0, y0, x1, y1 = bounds
    m = 0.05
    parts = []
    for r in scope_regions(p):
        b = r.get("bbox")
        if b and (b[2] < x0 - m or b[0] > x1 + m or b[3] < y0 - m or b[1] > y1 + m):
            continue
        ix = emd_index(r["sgg_cd"])
        g = ix.union if ix is not None and len(ix) else (geoms.get(r["sgg_cd"]) or (geoms.get(r.get("prev_cd")) if r.get("prev_cd") else None))
        if g is not None and not g.is_empty:
            parts.append(g)
    return _valid(unary_union(parts)) if parts else None


def _overseas_area(p):
    """해외 기관의 사업 구역 — 프로필 범위 + 그 나라 구역(해외 분석 화면이 고르는 구역 범위) · 없으면 None."""
    from shapely.geometry import box as _box
    from shapely.ops import unary_union
    t = (_cfg().get("tenants") or {}).get(getattr(p, "tenant_id", None) or "") or {}
    if not t.get("global"):
        return None
    parts = []
    prof_id = str(t.get("profile") or "")
    try:
        prof = ((config.load_yaml("region_profiles") or {}).get("profiles") or {}).get(prof_id) or {}
        if prof.get("bbox"):
            parts.append(_box(*prof["bbox"]))
    except Exception:
        pass
    iso = prof_id.split("-")[0].upper() if prof_id else ""
    try:
        from agent.tools.ext.global_ import districts
        parts += [_box(*d["bbox"]) for d in districts() if iso and str(d.get("iso") or "")[:len(iso)] == iso[:3] and d.get("bbox")]
    except Exception:
        pass
    return unary_union(parts) if parts else None


SEA_REACH = 0.05            # 관할 연안 바다(약 5km) — 읍면동 경계는 땅만 덮으므로, 관할 땅에서 이 안이고 다른 시군구 땅에 닿지 않는 바다는 관할로 본다


def _land(cd: str, prev: str | None = None):
    """한 시군구 땅(읍면동 경계 합 · 못 받으면 뼈대 경계)."""
    _, geoms, _ = regions_base()
    ix = emd_index(cd)
    if ix is not None and len(ix):
        return ix.union
    return geoms.get(cd) or (geoms.get(prev) if prev else None)


def _other_land(p, bounds, own):
    """bounds 근처(0.02°)의 관할 밖 시군구 땅 합 − 관할 땅(경계선 오차만큼 넓혀 뺀다 · 뼈대 경계의 거친 선이 관할 땅을 덮지 않게)."""
    from shapely.ops import unary_union
    regions, _, _ = regions_base()
    mine = {r["sgg_cd"] for r in scope_regions(p)}
    x0, y0, x1, y1 = bounds
    m = 0.02
    parts = []
    for r in regions:
        if r["sgg_cd"] in mine:
            continue
        b = r.get("bbox")
        if not b or b[2] < x0 - m or b[0] > x1 + m or b[3] < y0 - m or b[1] > y1 + m:
            continue
        g = _land(r["sgg_cd"], r.get("prev_cd"))
        if g is not None and not g.is_empty:
            parts.append(g)
    if not parts:
        return None
    return _valid(unary_union(parts)).difference(own.buffer(SCOPE_TOL))


def geom_in_scope(p, g) -> bool:
    """범위(shapely · 4326)가 계정 관할 안인가 — 조금이라도(경계선 오차 SCOPE_TOL 밖) 벗어나면 False. 동기(읍면동 경계 캐시를 읽는다).
    관할 땅 밖으로 나간 부분은 ① 다른 시군구 땅에 닿으면 거절 ② 바다라도 관할 땅에서 SEA_REACH 를 넘으면 거절(연안 바다만 관할)."""
    sc = scope_of(p)
    if sc is None:
        return True
    if g is None or g.is_empty:
        return False
    if not sc:
        area = _overseas_area(p)
        if area is None:
            return False
        out = g.difference(area.buffer(0.001))
        return out.is_empty or out.area < 1e-10
    u = _scope_union(p, g.bounds)
    if u is None:
        return False
    out = g.difference(u.buffer(SCOPE_TOL))
    if out.is_empty or out.area < 1e-10:
        return True
    if not out.within(u.buffer(SEA_REACH)):
        return False
    other = _other_land(p, out.bounds, u)
    if other is None:
        return True
    hit = out.intersection(other)
    return hit.is_empty or (out.area > 0 and hit.area < 1e-10)      # 점(필지 조회)은 닿기만 해도 밖


def aoi_in_scope(p, aoi: dict | None) -> bool:
    """GeoJSON 범위(Polygon · MultiPolygon · Feature) → geom_in_scope."""
    if not aoi:
        return scope_of(p) is None
    if aoi.get("type") == "Feature":
        aoi = aoi.get("geometry") or {}
    try:
        g = shape(aoi)
    except Exception:
        return False
    return geom_in_scope(p, g if g.is_valid else g.buffer(0))


def point_in_scope(p, lng: float, lat: float) -> bool:
    from shapely.geometry import Point
    return geom_in_scope(p, Point(lng, lat))


async def _n_findings(p) -> dict[str, int]:
    if p.guest:
        return {}
    try:
        async with db(p) as conn:
            rows = await conn.fetch("SELECT sgg_cd sgg, findings n FROM survey_sgg WHERE state = 'done'")
    except Exception:
        return {}
    return _alias({r["sgg"]: int(r["n"] or 0) for r in rows})


def _alias(d: dict) -> dict:
    """PNU 앞 5자리가 옛 코드(46xxx 등)인 자료를 새 코드(12xxx)에도 붙인다 — 코드가 바뀐 시군구의 결과 0 오판 방지."""
    regions, _, _ = regions_base()
    for r in regions:
        pc = r.get("prev_cd")
        if pc and r["sgg_cd"] not in d and pc in d:
            d[r["sgg_cd"]] = d[pc]
    return d


def _public_deploy(d: dict) -> bool:
    return not d.get("_test") and d["stage"] in ("ga", "canary")


def find(q: str) -> list[dict]:
    """이름 검색(에이전트 범위 가드 · K4 검색) — '○○' · '○○시' · '시도 ○○시' · 코드."""
    regions, _, _ = regions_base()
    q = (q or "").strip()
    if not q:
        return []
    if q.isdigit():
        return [r for r in regions if r["sgg_cd"].startswith(q)]
    qs = (full_label(q) or q).replace(" ", "")          # 원천 시도 이름(전남광주통합특별시 …)으로 물어도 표기 이름으로 찾는다
    out = []
    for r in regions:
        nm = (r["name"] or "").replace(" ", "")
        full = (r["full"] or "").replace(" ", "")
        stem = nm[:-1] if len(nm) > 2 and nm[-1] in "시군구" else nm
        if qs in (nm, full, stem) or (r["sido_short"] or "") + nm == qs or nm.startswith(qs) or (len(qs) >= 2 and qs in full):
            out.append(r)
    return out


_geo_static: dict = {}


def _static_geom(r: dict) -> dict | None:
    """시군구 경계(화면 지도와 같은 그림 · landxi/assets/data/geo/sigungu.geojson) — 코드(지금 · 옛) → 이름 + 위치 순으로 잇는다.
    기관 계정은 전국 경계 파일을 받지 않고 관할 시군구 경계만 이 목록(?geom=1)으로 받는다."""
    if "by" not in _geo_static:
        by, byname = {}, {}
        try:
            fc = json.loads((config.SERVER_ROOT.parent / "landxi" / "assets" / "data" / "geo" / "sigungu.geojson").read_text(encoding="utf-8"))
            for f in fc.get("features") or []:
                pr = f.get("properties") or {}
                by[str(pr.get("code"))] = f.get("geometry")
                byname.setdefault(str(pr.get("name") or ""), []).append(f.get("geometry"))
        except Exception:  # noqa: BLE001 — 없으면 뼈대 경계
            pass
        _geo_static.update(by=by, byname=byname)
    for c in (r.get("sgg_cd"), r.get("prev_cd")):
        if c and str(c) in _geo_static["by"]:
            return _geo_static["by"][str(c)]
    c0 = r.get("center")
    for g in _geo_static["byname"].get(str(r.get("name") or ""), []):
        try:
            if c0 and shape(g).buffer(0.02).contains(shape({"type": "Point", "coordinates": c0})):
                return g
        except Exception:  # noqa: BLE001
            continue
    _, geoms, _ = regions_base()
    g = geoms.get(r.get("sgg_cd")) or (geoms.get(r.get("prev_cd")) if r.get("prev_cd") else None)
    return _geom_small(g) if g is not None else None


@router.get("/regions")
async def list_regions(request: Request, public: int | None = None, q: str | None = None, sido: str | None = None,
                       has_imagery: int | None = None, geom: int | None = None):
    p = principal(request)
    tenant = p.realm == "tenant"
    pub = (bool(public) and not tenant) or p.guest       # 기관 계정은 공개 목록(전국)으로 돌아가지 못한다(원칙 39)
    _kick_refresh()
    regions, _, src = regions_base()
    dv = await derived()
    nf = {} if pub else await _n_findings(p)
    scope = tenant_scope(p.tenant_id) if tenant else ([] if p.is_lx else None)
    pool = find(q) if q else regions
    if tenant:                                            # 관할 밖 시군구는 목록 · 검색 제안에 한 줄도 내지 않는다
        pool = [r for r in pool if region_allowed(p, r["sgg_cd"])]
    items = []
    for r in pool:
        if sido and sido_label(sido) not in (r["sido"], r["sido_short"]) and sido not in (r["sido"], r["sido_short"]):
            continue
        cd = r["sgg_cd"]
        imgs = dv["img"].get(cd, [])
        dps = [d for d in dv["dp"].get(cd, []) if (not d["_test"])]
        if pub:
            dps = [d for d in dps if _public_deploy(d)]          # 공개: 영상은 '있음' 여부만(목록 0)
        elif p.realm == "tenant":
            dps = [d for d in dps if d["tenant_id"] == p.tenant_id]
        hi = bool(imgs)
        if has_imagery is not None and bool(has_imagery) != hi:
            continue
        it = {"sgg_cd": cd, "name": r["name"], "sido": r["sido_short"], "full": r["full"], "bbox": r["bbox"], "center": r["center"],
              "has_imagery": hi, "deploys": [{"id": d["id"], "card": d["card"], "stage": d["stage"]} for d in dps]}
        if r.get("prev_cd"):
            it["prev_cd"] = r["prev_cd"]      # 옛 코드(46xxx) — XI맵 시군구 경계(옛 코드)와 새 코드(12xxx)를 잇는다
        if not pub:
            it["n_findings"] = env(nf.get(cd, 0), "count", "inferred", "실태조사 의심 필지(검수 전 · survey_counts 와 같은 값)",
                                   None if nf.get(cd) else ("실태조사 결과 없음" if cd not in dv["parcels"] else None), as_of=dv["at"])
            it["in_scope"] = True if tenant else in_scope(cd, scope)     # 기관 목록은 관할만 남았다
            if geom:
                it["geometry"] = _static_geom(r)
        items.append(it)
    return {"items": items, "total": env(len(items), "count", "recorded", src, as_of=_cache.get("vw_at") or dv["at"]),
            "source": src, "public": pub, "as_of": dv["at"]}


@router.get("/regions/{sgg_cd}")
async def get_region(sgg_cd: str, request: Request, geom: int | None = None):
    p = principal(request)
    regions, geoms, src = regions_base()
    r = next((x for x in regions if x["sgg_cd"] == sgg_cd), None)
    if not r:
        raise ApiError("not_found", "해당 지역이 없습니다", {"sgg_cd": sgg_cd})
    if not p.guest:
        ensure_region(p, sgg_cd)                          # 기관 계정: 관할 밖 = 없는 지역
    dv = await derived()
    pub = p.guest
    imgs = dv["img"].get(sgg_cd, [])
    dps = [d for d in dv["dp"].get(sgg_cd, []) if not d["_test"]]
    if pub:
        dps = [d for d in dps if _public_deploy(d)]
    elif p.realm == "tenant":
        dps = [d for d in dps if d["tenant_id"] == p.tenant_id]
    out = {"sgg_cd": sgg_cd, "name": r["name"], "sido": r["sido_short"], "full": r["full"], "bbox": r["bbox"], "center": r["center"],
           "has_imagery": bool(imgs), "deploys": [{"id": d["id"], "card": d["card"], "stage": d["stage"]} for d in dps],
           "source": src, "as_of": dv["at"]}
    if not pub:
        out["imagery"] = [{k: v for k, v in i.items() if k != "export_policy"} for i in imgs] if p.is_lx else \
            [{"id": i["id"], "name": i["name"], "year": i["year"], "epoch": i["epoch"]} for i in imgs if i["export_policy"] in ("tenant", "public")]
        n_par = dv["parcels"].get(sgg_cd)
        out["parcels"] = env(n_par, "필지", "measured", "연속지적(실태조사 적재분)", None if n_par else "필지 적재 전", as_of=dv["at"])
        leds = [x for x in dv["ledger"] if (p.is_lx or x["tenant_id"] == p.tenant_id)]
        # 대장 유무·결합률 = 이 시군구 코드로 시작하는 매칭 행이 있는 최신 반입
        ledger = []
        if leds:
            async with db(p) as conn:
                for x in leds:
                    n = await conn.fetchval("SELECT count(*) FROM registry_snapshots WHERE import_id=$1 AND (pnu LIKE $2 || '%' OR pnu LIKE $3 || '%')",
                                            x["id"], sgg_cd, r.get("prev_cd") or sgg_cd)
                    if n:
                        st = x["stats"] or {}
                        ledger.append({"kind": x["kind"], "import_id": x["id"],
                                       "rows": env(x["rows"], "count", "recorded", "대장 반입 행"),
                                       "matched_pct": env(st.get("matched_pct"), "%", "measured", "대장 × 연속지적 매칭(PNU → 지번 → V-World)",
                                                          as_of=x["created_at"].isoformat() if x["created_at"] else None)})
        out["ledger"] = ledger
        out["has_ledger"] = bool(ledger)
        nf = await _n_findings(p)
        out["n_findings"] = env(nf.get(sgg_cd, 0), "count", "inferred", "실태조사 의심 필지(검수 전)", as_of=dv["at"])
    if geom:
        g = geoms.get(sgg_cd)
        if g is not None:
            from shapely.geometry import mapping
            out["geometry"] = mapping(g)
    return out


@router.post("/regions/refresh")
async def refresh(request: Request):
    require(principal(request), admin=True)
    st = await refresh_vworld(force=True)
    return {"status": st.get("status"), "source": _cache["src"], "vworld_at": _cache.get("vw_at"), "as_of": now_iso()}


# ═══ 전국 읍면동 경계(core-xi · 코어 ①) ═══════════════════════════════════════════════════════════════
# 원천 = V-World LT_C_ADEMD_INFO(법정 읍면동 · 키는 서버에만) → 02. 데이터/cache/regions/emd-{sgg}.geojson(90일 디스크 캐시).
# 옛/새 시군구 코드(예: 46xxx ↔ 12xxx)는 regions_base() 의 prev_cd 로 같은 곳을 가리킨다. 지역 문자열 하드코딩 0.
EMD_LAYER = "LT_C_ADEMD_INFO"
EMD_CACHE_DAYS = 90
_emd_mem: dict[str, dict] = {}
_emd_idx: dict[str, "EmdIndex"] = {}


class EmdUnavailable(RuntimeError):
    pass


def region_of(sgg_cd: str | None) -> dict | None:
    """시군구 코드(지금 코드 또는 옛 코드) → regions_base 한 행."""
    if not sgg_cd:
        return None
    sgg_cd = str(sgg_cd)[:5]
    regions, _, _ = regions_base()
    r = next((x for x in regions if x["sgg_cd"] == sgg_cd), None)
    return r or next((x for x in regions if x.get("prev_cd") == sgg_cd), None)


def sgg_codes(sgg_cd: str | None) -> list[str]:
    """그 시군구를 가리키는 코드 전부(지금 · 옛)."""
    r = region_of(sgg_cd)
    if not r:
        return [str(sgg_cd)] if sgg_cd else []
    return [c for c in (r["sgg_cd"], r.get("prev_cd")) if c]


def sgg_at(lng: float, lat: float) -> str | None:
    """점 → 시군구 코드(regions_base 경계 · 뼈대가 단순화돼 있어 경계 근처는 가까운 쪽)."""
    from shapely.geometry import Point
    _, geoms, _ = regions_base()
    pt = Point(lng, lat)
    best = None
    for cd, g in geoms.items():
        try:
            if g.contains(pt):
                return cd
            d = g.distance(pt)
            if best is None or d < best[0]:
                best = (d, cd)
        except Exception:
            continue
    return best[1] if best and best[0] < 0.02 else None


def _emd_path(cd: str) -> Path:
    return config.DATA_ROOT / "cache" / "regions" / f"emd-{cd}.geojson"


def _emd_fetch(cd: str, prev: str | None) -> dict:
    """V-World 에서 한 시군구의 법정 읍면동(경계 포함) → FeatureCollection. 페이지 1000 · 코드 앞 5자리(LIKE)."""
    from .proxy import vworld_key
    key, dom = vworld_key()
    if not key:
        raise EmdUnavailable("key_missing")
    feats: list[dict] = []
    with httpx.Client(timeout=60, headers={"User-Agent": "LandXI-gateway/0.1"}) as c:
        for code in [x for x in (cd, prev) if x]:
            for page in range(1, 6):
                q = {"service": "data", "request": "GetFeature", "data": EMD_LAYER, "key": key, "domain": dom, "attrFilter": f"emd_cd:LIKE:{code}",
                     "size": 1000, "page": page, "geometry": "true", "attribute": "true", "format": "json", "crs": "EPSG:4326"}
                j = c.get("https://api.vworld.kr/req/data", params=q).json().get("response", {})
                if j.get("status") != "OK":
                    break
                for f in j["result"]["featureCollection"]["features"]:
                    p = f.get("properties") or {}
                    if not str(p.get("emd_cd", "")).startswith(code):
                        continue
                    feats.append({"type": "Feature", "properties": {"emd_cd": str(p["emd_cd"]), "name": p.get("emd_kor_nm"), "full": p.get("full_nm"),
                                                                    "sgg_cd": cd}, "geometry": f.get("geometry")})
                if page >= int((j.get("page") or {}).get("total") or 1):
                    break
            if feats:
                break
    if not feats:
        raise EmdUnavailable("empty")
    feats.sort(key=lambda f: f["properties"]["emd_cd"])
    return {"type": "FeatureCollection", "sgg_cd": cd, "source": f"V-World {EMD_LAYER}", "fetched_at": now_iso(), "features": feats}


def emd_fc(sgg_cd: str, force: bool = False) -> dict:
    """그 시군구 읍면동 경계(원 해상도 · 4326). 메모리 → 디스크(90일) → V-World. 받지 못하면 오래된 캐시라도 · 그것도 없으면 EmdUnavailable."""
    r = region_of(sgg_cd)
    if not r:
        raise EmdUnavailable("unknown_region")
    cd = r["sgg_cd"]
    m = _emd_mem.get(cd)
    if m and not force:
        return m["fc"]
    p = _emd_path(cd)
    fresh = p.exists() and time.time() - p.stat().st_mtime < EMD_CACHE_DAYS * 86400
    if fresh and not force:
        fc = json.loads(p.read_text(encoding="utf-8"))
    else:
        try:
            fc = _emd_fetch(cd, r.get("prev_cd"))
            p.parent.mkdir(parents=True, exist_ok=True)
            tmp = p.with_name(p.name + f".{os.getpid()}.tmp")
            tmp.write_text(json.dumps(fc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
            os.replace(tmp, p)
        except Exception as e:
            if p.exists():
                fc = json.loads(p.read_text(encoding="utf-8"))
            else:
                raise EmdUnavailable(str(e)) from None
    _emd_mem[cd] = {"fc": fc, "t": time.time()}
    _emd_idx.pop(cd, None)
    while len(_emd_mem) > 48:
        _emd_mem.pop(next(iter(_emd_mem)))
    return fc


class EmdIndex:
    """한 시군구의 읍면동 색인(STRtree · 4326) — find(점) → (이름, 코드). postprocess · 전역 분석 계획 · core-survey 가 쓴다."""

    def __init__(self, sgg_cd: str, fc: dict):
        from shapely import STRtree
        self.sgg_cd = sgg_cd
        self.codes: list[str] = []
        self.names: list[str] = []
        self.geoms: list = []
        for f in fc.get("features") or []:
            try:
                g = _valid(shape(f["geometry"]))
            except Exception:
                continue
            if g.is_empty:
                continue
            self.geoms.append(g)
            self.codes.append(f["properties"]["emd_cd"])
            self.names.append(f["properties"].get("name"))
        self.tree = STRtree(self.geoms)
        self._union = None

    def find(self, pt) -> tuple[str, str] | None:
        hit = [int(k) for k in self.tree.query(pt, predicate="within")]
        if not hit:
            return None
        return self.names[hit[0]], self.codes[hit[0]]

    def find_lnglat(self, lng: float, lat: float) -> tuple[str, str] | None:
        from shapely.geometry import Point
        return self.find(Point(lng, lat))

    @property
    def union(self):
        if self._union is None:
            from shapely.ops import unary_union
            self._union = _valid(unary_union(self.geoms))
        return self._union

    def __len__(self):
        return len(self.codes)


def emd_index(sgg_cd: str | None) -> "EmdIndex | None":
    """공개 계약 — 시군구(지금/옛 코드) → EmdIndex | None(경계를 받을 수 없음)."""
    r = region_of(sgg_cd)
    if not r:
        return None
    cd = r["sgg_cd"]
    ix = _emd_idx.get(cd)
    if ix is not None:
        return ix
    try:
        ix = EmdIndex(cd, emd_fc(cd))
    except EmdUnavailable:
        return None
    _emd_idx[cd] = ix
    return ix


def _rnd(c):
    return [round(c[0], 6), round(c[1], 6)] if isinstance(c[0], (int, float)) else [_rnd(x) for x in c]


def _emd_public(fc: dict, full: bool) -> dict:
    """화면용 — 단순화(≈5 m) · 좌표 6자리 · bbox · 대표점(가까운 순서 · 라벨)."""
    from shapely.geometry import mapping
    out = []
    for f in fc.get("features") or []:
        try:
            g = _valid(shape(f["geometry"]))
        except Exception:
            continue
        s = g if full else g.simplify(0.00005, preserve_topology=True)
        m = json.loads(json.dumps(mapping(s)))
        m["coordinates"] = _rnd(m["coordinates"])
        pt = g.representative_point()
        out.append({"type": "Feature", "id": f["properties"]["emd_cd"],
                    "properties": {"emd_cd": f["properties"]["emd_cd"], "name": f["properties"].get("name"),
                                   "bbox": [round(v, 6) for v in g.bounds], "center": [round(pt.x, 6), round(pt.y, 6)]},
                    "geometry": m})
    return {"type": "FeatureCollection", "features": out}


_emd_pub: dict[tuple, dict] = {}


@router.get("/regions/{sgg_cd}/emd")
async def region_emd(sgg_cd: str, request: Request, full: int | None = None):
    """그 시군구 읍면동 경계 FeatureCollection(emd_cd · name · bbox · center). 옛/새 코드 모두 받는다."""
    p = principal(request)
    r = region_of(sgg_cd)
    if not r:
        raise ApiError("not_found", "해당 지역이 없습니다", {"sgg_cd": sgg_cd})
    if p.realm == "tenant":
        ensure_region(p, r["sgg_cd"])                     # 기관 계정: 관할 밖 읍면동 경계 0
    try:
        fc = await run_in_threadpool(emd_fc, r["sgg_cd"])
    except EmdUnavailable as e:
        raise ApiError("upstream_unavailable", "읍면동 경계를 받을 수 없습니다", {"sgg_cd": r["sgg_cd"], "reason": str(e)}, status=503) from None
    k = (r["sgg_cd"], bool(full), fc.get("fetched_at"))
    body = _emd_pub.get(k)
    if body is None:
        body = await run_in_threadpool(_emd_public, fc, bool(full))
        body.update({"sgg_cd": r["sgg_cd"], "prev_cd": r.get("prev_cd"), "name": r["name"], "n": len(body["features"]),
                     "source": fc.get("source"), "as_of": fc.get("fetched_at")})
        _emd_pub[k] = body
        while len(_emd_pub) > 32:
            _emd_pub.pop(next(iter(_emd_pub)))
    from fastapi.responses import JSONResponse
    return JSONResponse(body, headers={"Cache-Control": "private, max-age=3600"})


def _kick_emd_fill():
    """결과 읍면동 빈칸 채우기 주기 작업(landxi_api.survey) — XI맵이 지역을 고를 때도 켜 둔다(분석 중 결과의 읍면동 이름)."""
    try:
        from . import survey as _sv
        _sv._kick_emd_sweep()
    except Exception:
        pass


def _box_hit(g_region, bounds) -> bool:
    try:
        b = box(*bounds)
        if not g_region.intersects(b):
            return False
        a = g_region.intersection(b).area
        return a > 0.2 * max(b.area, 1e-12) or a > 0.2 * max(g_region.area, 1e-12)
    except Exception:
        return False


LANDCOVER_CLASSES = {"건물", "주차장", "경작지", "비닐하우스"}


@router.get("/regions/{sgg_cd}/results")
async def region_results(sgg_cd: str, request: Request):
    """그 시군구에 결과가 있는 모든 결과 층 — ① 카탈로그 결과 층(범위가 이 시군구와 겹치는 것 · 권한 관문 그대로)
    ② 이 시군구 전역 분석(scope sgg)으로 끝난 작업 결과(기관 = 자기 작업 + 관할 안의 LX 작업). 작업 id 는 화면에 쓰지 않는다(층 주소에만)."""
    p = require(principal(request))
    _kick_emd_fill()
    r = region_of(sgg_cd)
    if not r:
        raise ApiError("not_found", "해당 지역이 없습니다", {"sgg_cd": sgg_cd})
    ensure_region(p, r["sgg_cd"])                         # 기관 계정: 관할 밖 결과 층 0
    if p.realm == "tenant":                               # 광역 기관 — 공유 때 고른 소속 시군구 밖은 결과 층 0(LX 보관 · 나중 13 ⓐ)
        try:
            from .release import share_sgg
            async with db(realm="lx") as conn:
                allow = await share_sgg(conn, p.tenant_id)
        except Exception:  # noqa: BLE001
            allow = None
        if allow is not None and not any(c in allow for c in (sgg_codes(r["sgg_cd"]) or [r["sgg_cd"]])):
            return {"sgg_cd": r["sgg_cd"], "name": r["name"], "items": [], "as_of": now_iso()}
    _, geoms, _ = regions_base()
    g = geoms.get(r["sgg_cd"]) or (geoms.get(r.get("prev_cd")) if r.get("prev_cd") else None)
    ix = await run_in_threadpool(emd_index, r["sgg_cd"])
    if ix is not None and len(ix):
        g = ix.union
    from . import catalog as cat_mod
    build = cat_mod.allowed_build(p, None)
    _, items = await cat_mod.layer_items(p, build, "domestic")
    out = []
    for it in items:
        if it.get("role") != "result" or it.get("kind") != "vector" or not it.get("bounds") or not it.get("url"):
            continue
        if g is not None and not _box_hit(g, it["bounds"]):
            continue
        out.append({**{k: it.get(k) for k in ("id", "name", "kind", "role", "source", "set", "path", "layer", "promote_id", "minzoom", "maxzoom", "bounds",
                                               "signed", "attribution", "count", "basis")}, "from": "catalog",
                    "style": "landcover" if "landcover" in it["id"] else "result"})
    codes = sgg_codes(r["sgg_cd"])
    scope = tenant_scope(p.tenant_id) if p.realm == "tenant" else None
    lx_ok = p.is_lx or any(in_scope(c, scope) for c in codes)
    async with db(realm="lx") as conn:
        rows = await conn.fetch(
            "SELECT j.id, j.tenant_id, j.result_set, j.model_id, j.imagery_id, j.finished_at, j.counts, j.card_id, j.options, "
            "ST_AsGeoJSON(ST_Envelope(j.aoi))::json AS env, m.classes, i.year, i.epoch "
            "FROM jobs j LEFT JOIN models m ON m.id=j.model_id LEFT JOIN imagery i ON i.id=j.imagery_id "
            "WHERE j.kind='infer' AND j.state='done' AND NOT j.demo AND NOT coalesce(j.test,false) AND j.snapshot_ready "
            "AND j.options->>'scope'='sgg' AND j.options->>'sgg_cd' = ANY($1::text[]) ORDER BY j.finished_at DESC LIMIT 20", codes)
    seen = set()
    for x in rows:
        if not (p.is_lx or x["tenant_id"] == p.tenant_id or (x["tenant_id"] == "lx" and lx_ok)):
            continue
        k = (x["model_id"], x["imagery_id"])
        if k in seen:
            continue
        seen.add(k)
        yr = x["year"] or (str(x["epoch"])[:4] if x["epoch"] else "")
        lc = bool(x["classes"]) and set(x["classes"]) <= LANDCOVER_CLASSES
        nm = f"{r['name']} 토지피복 {yr}(AI 분석)" if lc else f"{r['name']} AI 분석 {yr}".strip()
        counts = x["counts"] or {}
        if isinstance(counts, str):
            counts = json.loads(counts)
        _opts = x["options"] or {}
        if isinstance(_opts, str):
            _opts = json.loads(_opts)
        try:
            b = [round(v, 6) for v in shape(x["env"]).bounds] if x["env"] else None
        except Exception:
            b = None
        fin = x["finished_at"].isoformat(timespec="seconds") if x["finished_at"] else None
        out.append({"id": x["result_set"].replace("/", "-"), "name": {"ko": nm, "en": nm}, "kind": "vector", "role": "result", "source": "pmtiles",
                    "set": x["result_set"], "path": x["result_set"] + ".pmtiles", "layer": "results", "promote_id": "id", "minzoom": 10, "maxzoom": 17, "bounds": b,
                    "signed": x["tenant_id"] != "lx", "attribution": "Land-XI AI 분석 · 검수 전", "basis": "inferred",
                    "count": env(sum(counts.values()) if counts else None, "count", "inferred", "전역 분석 결과(겹침 정리 후)", as_of=fin),
                    "from": "job", "style": "landcover" if lc else "result", "finished_at": fin,
                    # 전역(영상이 시군구를 덮음)인지 · 서비스 카드 분석의 대상 — XI ChatGEO 가 '그 지역 결과'를 고를 때 작은 부분 분석보다 전역 분석을(QA-통계 · 10-11)
                    "full": bool(_opts.get("scope_full")), "card_id": x["card_id"], "classes": _opts.get("classes") or None})
    return {"sgg_cd": r["sgg_cd"], "name": r["name"], "items": out, "as_of": now_iso()}
