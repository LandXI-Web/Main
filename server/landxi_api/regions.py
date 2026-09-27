"""전국 지역(F3 최종 명세 §3 S-3) — `GET /regions` · `GET /regions/{sgg}`.

뼈대 = server/seed/regions-sgg.json(행정경계 시군구 252 · build_regions.py). 이름·코드 갱신 = V-World LT_C_ADSIGG_INFO
(캐시 90일 · 게이트웨이가 백그라운드로 받는다 · 키 오류면 뼈대 그대로). 뼈대에 없는 새 코드(개편 시군구)는 V-World 경계로 bbox 를 채운다.
has_imagery = 자체 영상(imagery.footprint) ∩ 시군구 경계 · deploys = 배포본 AOI(또는 sgg_cd) ∩ 시군구 · n_findings = 실태조사 의심(RLS).
남원 고정값 0 — 모든 값은 표·파일에서 계산한다.
"""
from __future__ import annotations

import asyncio
import datetime as dt
import json
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
    """(지역 목록, {sgg_cd: shapely}, 출처) — V-World 캐시(90일)가 있으면 그 목록이 정본, 경계는 뼈대(없으면 V-World bbox)."""
    if _cache["regions"] is None:
        items, geoms = _load_seed()
        _cache.update(regions=items, geoms=geoms, src=SRC_SEED)
        vp = _vw_cache_path()
        if vp.exists():
            try:
                _apply_vw(json.loads(vp.read_text(encoding="utf-8")), (items, dict(geoms)))
            except Exception as e:  # pragma: no cover
                _cache["vw_status"] = f"cache read error {type(e).__name__}"
    return _cache["regions"], _cache["geoms"], _cache["src"]


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
        full = f.get("full_nm") or (base or {}).get("full")
        sido = full.split(" ", 1)[0] if full else (base or {}).get("sido")
        rec = {"sgg_cd": cd, "sido": sido, "sido_short": (base or {}).get("sido_short") or _short(sido), "name": f.get("sig_kor_nm") or (base or {}).get("name"),
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
SHORT = {"강원특별자치도": "강원", "경기도": "경기", "경상남도": "경남", "경상북도": "경북", "광주광역시": "광주", "대구광역시": "대구",
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


async def _n_findings(p) -> dict[str, int]:
    if p.guest:
        return {}
    try:
        async with db(p) as conn:
            rows = await conn.fetch("SELECT substr(pnu,1,5) sgg, count(*) n FROM survey_findings WHERE state<>'dismissed' GROUP BY 1")
    except Exception:
        return {}
    return _alias({r["sgg"]: int(r["n"]) for r in rows})


def _alias(d: dict) -> dict:
    """PNU 앞 5자리가 옛 코드(46130 등)인 자료를 새 코드(12130)에도 붙인다 — 코드가 바뀐 시군구의 결과 0 오판 방지."""
    regions, _, _ = regions_base()
    for r in regions:
        pc = r.get("prev_cd")
        if pc and r["sgg_cd"] not in d and pc in d:
            d[r["sgg_cd"]] = d[pc]
    return d


def _public_deploy(d: dict) -> bool:
    return not d.get("_test") and d["stage"] in ("ga", "canary")


def find(q: str) -> list[dict]:
    """이름 검색(에이전트 범위 가드 · K4 검색) — '남원' · '남원시' · '전북 남원시' · 코드."""
    regions, _, _ = regions_base()
    q = (q or "").strip()
    if not q:
        return []
    if q.isdigit():
        return [r for r in regions if r["sgg_cd"].startswith(q)]
    qs = q.replace(" ", "")
    out = []
    for r in regions:
        nm = (r["name"] or "").replace(" ", "")
        full = (r["full"] or "").replace(" ", "")
        stem = nm[:-1] if len(nm) > 2 and nm[-1] in "시군구" else nm
        if qs in (nm, full, stem) or (r["sido_short"] or "") + nm == qs or nm.startswith(qs) or (len(qs) >= 2 and qs in full):
            out.append(r)
    return out


@router.get("/regions")
async def list_regions(request: Request, public: int | None = None, q: str | None = None, sido: str | None = None,
                       has_imagery: int | None = None):
    p = principal(request)
    pub = bool(public) or p.guest
    _kick_refresh()
    regions, _, src = regions_base()
    dv = await derived()
    nf = {} if pub else await _n_findings(p)
    scope = tenant_scope(p.tenant_id) if p.realm == "tenant" else ([] if p.is_lx else None)
    pool = find(q) if q else regions
    items = []
    for r in pool:
        if sido and sido not in (r["sido"], r["sido_short"]):
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
        if not pub:
            it["n_findings"] = env(nf.get(cd, 0), "count", "inferred", "실태조사 의심 필지(검수 전)",
                                   None if nf.get(cd) else ("실태조사 결과 없음" if cd not in dv["parcels"] else None), as_of=dv["at"])
            it["in_scope"] = in_scope(cd, scope)
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
