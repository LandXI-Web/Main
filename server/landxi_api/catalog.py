"""카탈로그(F1-CONTRACT §4.1) — imagery 표 + config/sets.yaml(layers) + config/ladder.yaml(외부 사다리) → LayerItem.

관문(사용자 결정 2026-09-24 · 설계서 §10 X5 · R6):
  build=public  영상 층 = 외부 위성(xdworld-satellite · gibs-* · eox-* · pc-*)만. 자체 영상(pmtiles|xyz|cog · role imagery) 0.
                결과는 export_policy='public' 이면서 security_review='cleared' 만.
  build=tenant  그 기관 배포본 결과 + 참조 + 자체 영상 중 export_policy ∈ tenant|public. tier raw · cog 는 절대 없음.
  build=lx      전부(원본 COG 는 lx 만).
요청한 build 가 세션 권한보다 넓으면 좁힌다(게스트가 build=lx 를 달라고 해도 public).
"""
from __future__ import annotations

import json

from fastapi import APIRouter, Request
from starlette.concurrency import run_in_threadpool

from . import config
from .deps import ApiError, Principal, db, principal
from .envelope import env, now_iso, today

router = APIRouter()
try:                                                    # 영상 표준(원칙 94) — 받는 형식 · 원본 지울 날짜(LX 관리자) · 같은 영상 묶음의 경로
    from .imagery_std import router as _std_router
    if _std_router is not None:
        router.include_router(_std_router)
except Exception:  # noqa: BLE001
    pass
PUBLIC_IMAGERY_PREFIX = ("xdworld-", "gibs-", "eox-", "pc-")


def allowed_build(p: Principal, requested: str | None) -> str:
    natural = "lx" if p.is_lx else "tenant" if p.realm == "tenant" else "public"
    order = {"public": 0, "tenant": 1, "lx": 2}
    if requested not in order:
        return natural
    if requested == "tenant" and natural == "lx":
        return "tenant"          # lx 가 기관 화면을 미리 볼 때
    return requested if order[requested] <= order[natural] else natural


def _mf(mid: str | None) -> dict:
    return config.manifest()["_by_id"].get(mid or "", {}) if mid else {}


def _count_env(m: dict, unit: str, mid: str) -> dict | None:
    if not m or m.get("count") is None:
        return None
    return env(m["count"], unit if unit in ("count", "필지", "동", "polygons") else "count", "measured",
               f"manifest.json#{mid}", as_of=(m.get("as_of") or today()))


def _item_base(**kw) -> dict:
    keys = ["id", "name", "kind", "role", "source", "set", "path", "url", "tiles", "scheme", "layer", "promote_id", "minzoom",
            "maxzoom", "bounds", "gsd_m", "epoch", "crs", "tier", "license", "attribution", "export_policy", "security_review",
            "rights_holder", "ladder", "count", "signed"]
    d = {k: kw.get(k) for k in keys}
    d["scheme"] = d["scheme"] or "xyz"
    d["signed"] = bool(d["signed"])
    for k in ("params", "note", "basis", "noncommercial"):
        if kw.get(k) is not None:
            d[k] = kw[k]
    return d


def resolve_set_path(set_id: str) -> str | None:
    s = config.load_yaml("sets")
    set_id = s.get("aliases", {}).get(set_id, set_id)
    if set_id in s["sets"]:
        return s["sets"][set_id]
    parts = set_id.split("/")
    if len(parts) == 3 and parts[0] == "results":
        return f"results/{parts[1]}/{parts[2]}.pmtiles"
    if len(parts) == 2 and parts[0] == "public":            # 공개 타일 폴더(S-4 · 서명 면제)
        return f"tiles/public/{parts[1]}.pmtiles"
    if len(parts) == 2 and parts[0] == "demo":
        return f"cache/demo/{parts[1]}.pmtiles"
    if len(parts) == 2 and parts[0] == "imagery" and parts[1].startswith("img-"):   # 등록 영상에서 구운 LX 전용 세트(p16 · 서명 필수)
        return f"tiles/imagery/{parts[1]}.pmtiles"
    return None


# ── 타일 주소의 기준 주소 = 이 요청을 받은 주소(c2-xi 3차) ─────────────────────────────────────────────
# 화면은 API 기준 주소(localStorage.lx_api_base · 기본 localhost:8700 · LX 관리자 화면은 127.0.0.1:8700 등)로 카탈로그·서명을 부른다.
# 타일 주소를 고정 PUBLIC_BASE(localhost:8700)로 주면, 그 호스트 이름의 브라우저 연결 6칸이 막혔을 때 API 는 다른 이름으로 살아 있어도
# 영상 타일만 멈춘다(실증 2차). 그래서 요청이 들어온 호스트 이름(믿을 수 있는 이름만)으로 주소를 만든다. 그 밖은 PUBLIC_BASE 그대로.
def _trusted_host(host: str) -> bool:
    h = (host or "").lower().rsplit(":", 1)[0] if not (host or "").startswith("[") else (host or "").lower().split("]")[0] + "]"
    pub = config.PUBLIC_BASE.split("://", 1)[-1].split("/", 1)[0].lower().rsplit(":", 1)[0]
    return h in ("localhost", "localhost.", "127.0.0.1", "[::1]", pub) or h in config.PUBLIC_HOSTS or h.endswith(".localhost") or h.endswith(".localhost.")


def base_of(request: Request | None) -> str:
    """요청이 들어온 기준 주소(scheme://host[:port]) — 믿을 수 있는 호스트 이름일 때만. 아니면 config.PUBLIC_BASE."""
    if request is None:
        return config.PUBLIC_BASE
    try:
        host = request.headers.get("host") or ""
        if host and _trusted_host(host) and all(c.isalnum() or c in ".-:[]" for c in host):
            if host.lower() in config.PUBLIC_HOSTS:          # 바깥 주소(터널) — 브라우저는 https 로 들어온다
                return f"https://{host}"
            return f"{request.url.scheme}://{host}"
    except Exception:                                   # noqa: BLE001
        pass
    return config.PUBLIC_BASE


def rebase(url, base: str):
    """PUBLIC_BASE 로 만든 주소를 이 요청의 기준 주소로(그 밖의 주소 · None 은 그대로)."""
    if isinstance(url, str) and base != config.PUBLIC_BASE and url.startswith(config.PUBLIC_BASE):
        return base + url[len(config.PUBLIC_BASE):]
    if isinstance(url, list):
        return [rebase(u, base) for u in url]
    return url


def canonical_set(set_id: str) -> str:
    return config.load_yaml("sets").get("aliases", {}).get(set_id, set_id)


def set_tenant(set_id: str) -> str | None:
    parts = set_id.split("/")
    return parts[1] if parts[0] == "results" and len(parts) >= 3 else None


def pm_url(set_id: str) -> str:
    return f"{config.PUBLIC_BASE}/tiles/pmtiles/{set_id}.pmtiles"


def _external_items(stage: str | None) -> list[dict]:
    lad = config.load_yaml("ladder")
    out = []
    for e in lad["external"]:
        st = e["ladder"]["stage"]
        if stage and st not in (stage, "both"):
            continue
        params = dict(e.get("params") or {})
        if e.get("params_from"):
            p = config.DATA_ROOT / e["params_from"]
            if p.exists():
                try:
                    params["months"] = json.loads(p.read_text(encoding="utf-8"))
                except Exception:
                    params["months"] = None
            else:
                params["months"] = None
                params["note"] = "F1-D G2 사전 수집 전 — searchid 없음"
        out.append(_item_base(id=e["id"], name=e["name"], kind=e["kind"], role=e["role"], source="external", set=None, path=None,
                              url=None, tiles=e["tiles"], layer=e.get("layer"), minzoom=e["minzoom"], maxzoom=e["maxzoom"],
                              bounds=e.get("bounds"), gsd_m=e.get("gsd_m"), epoch=e.get("epoch"), crs="EPSG:3857", tier="tile",
                              license=e["license"], attribution=e["attribution"], export_policy=e["export_policy"],
                              security_review=e["security_review"], rights_holder=e.get("rights_holder"), ladder=e["ladder"],
                              count=None, signed=False, params=params or None, noncommercial=e.get("noncommercial")))
    return out


def _layer_items(stage: str | None) -> list[dict]:
    s = config.load_yaml("sets")
    out = []
    for L in s.get("layers", []):
        st = L["ladder"]["stage"]
        if stage and st not in (stage, "both"):
            continue
        m = _mf(L.get("manifest"))
        path = s["sets"].get(L["set"])
        exists = bool(path) and (config.DATA_ROOT / path).exists()
        item = _item_base(id=L["id"], name=L["name"], kind=L["kind"], role=L["role"], source="pmtiles", set=L["set"], path=path,
                          url=pm_url(L["set"]) if exists else None, tiles=None, layer=L.get("layer"), promote_id=L.get("promote_id"),
                          minzoom=m.get("minzoom", L["ladder"]["from"]), maxzoom=m.get("maxzoom", L["ladder"]["to"]),
                          bounds=m.get("bounds"), gsd_m=None, epoch=m.get("as_of"), crs="EPSG:3857", tier="result" if L["role"] == "result" else "tile",
                          license=L.get("license"), attribution=L.get("attribution"), export_policy=L["export_policy"],
                          security_review=L["security_review"], rights_holder=L.get("rights_holder", "LX"), ladder=L["ladder"],
                          count=_count_env(m, L.get("count_unit", "count"), L.get("manifest", "")), signed=L["set"] in s.get("signed_sets", []),
                          note=L.get("note") if exists else "파일 없음 — 산출 전(프론트 결손 표시)", basis=L.get("basis"))
        item["_lx_only"] = bool(L.get("lx_only"))
        item["_exists"] = exists
        out.append(item)
    return out


async def _imagery_items(stage: str | None) -> list[dict]:
    async with db(realm="lx") as conn:
        rows = await conn.fetch("SELECT id, name, tier, gsd_m, epoch, crs, pmtiles_set, xyz_folder, license, attribution, export_policy, "
                                "security_review, rights_holder, asset_ref, ladder, kind, layer, sgg_cd, tile_job_id, "
                                "ST_AsGeoJSON(footprint)::json AS fp, CASE WHEN footprint IS NULL THEN NULL ELSE "
                                "ARRAY[ST_XMin(footprint), ST_YMin(footprint), ST_XMax(footprint), ST_YMax(footprint)] END AS bb FROM imagery")
    s = config.load_yaml("sets")
    out = []
    for r in rows:
        lad = r["ladder"] or {}
        if stage and lad.get("stage") not in (stage, "both"):
            continue
        meta = r["layer"] or {}
        if meta.get("role") == "request":         # 기관이 분석 의뢰로 맡긴 영상 — 그 의뢰의 분석에만(영상 목록 · 지도에 내지 않는다 · requests.py)
            continue
        m = _mf(meta.get("manifest"))
        signed = False
        pm_raw = meta.get("pmtiles_set")
        pm_path = resolve_set_path(pm_raw) if pm_raw else None
        if r["tier"] == "raw" and pm_path and (config.DATA_ROOT / pm_path).exists():
            # 원본에서 구운 LX 전용 PMTiles(서명 필수 · api-v1.js tileUrl 이 /tiles/sign 을 부른다)
            source, set_id, path = "pmtiles", pm_raw, pm_path
            tiles, url, signed = None, pm_url(pm_raw), True
            m = _mf(pm_path.split("/")[-1]) or ({"minzoom": meta["pmtiles_minzoom"], "maxzoom": meta.get("pmtiles_maxzoom")}
                                                if meta.get("pmtiles_minzoom") is not None else m)
        elif r["tier"] == "raw":        # 원본 → COG 동적 타일(lx 만)
            source, set_id, path = "cog", f"cog/{r['id']}", meta.get("cog_path")
            tiles = f"{config.PUBLIC_BASE}/tiles/cog/{r['id']}/{{z}}/{{x}}/{{y}}.webp"
            url = None
        else:
            source, set_id = "pmtiles", r["pmtiles_set"]
            path = s["sets"].get(set_id)
            tiles, url = None, pm_url(set_id) if path else None
        bb = [round(float(v), 6) for v in r["bb"]] if r["bb"] else m.get("bounds")
        role = meta.get("role", "terrain" if r["kind"] == "terrain" else "imagery")
        out.append(_item_base(
            id=r["id"], name=r["name"], kind="terrain" if role == "terrain" else "raster", role=role, source=source, set=set_id, path=path,
            url=url, tiles=tiles, minzoom=m.get("minzoom", lad.get("from")), maxzoom=m.get("maxzoom", lad.get("to")), bounds=bb,
            gsd_m=float(r["gsd_m"]) if r["gsd_m"] is not None else None, epoch=r["epoch"], crs="EPSG:3857", tier=r["tier"],
            license=r["license"], attribution=r["attribution"], export_policy=r["export_policy"], security_review=r["security_review"],
            rights_holder=r["rights_holder"], ladder=lad, count=_count_env(m, "count", meta.get("manifest", "")), signed=signed))
        if meta.get("coverage") is not None:
            out[-1]["coverage"] = env(meta["coverage"], "ratio", "measured", "도엽 외곽 ∩ 시군구 경계(등록 시 계산)")   # 덮는 비율
        out[-1]["sgg_cd"] = r["sgg_cd"]          # 소유 시군구(v1.2 · 등록 S-5 또는 seed/backfill_imagery_sgg.py)
        # 타일 준비(v1.2) — 원본(raw)은 등록 타일 작업(tile/cog finalize)이 끝나야 true · 미리 구운 PMTiles 는 파일이 있으면 true
        if r["tile_job_id"]:                     # 등록(S-5)한 영상 = 그 타일 작업이 끝났는가
            ready = bool(meta.get("tile_ready"))
        else:                                    # 등록 전부터 있던 영상 = 타일 원천(COG 경로 · 구운 PMTiles)이 있는가
            ready = bool(meta.get("tile_ready") or path or meta.get("cog_path"))
        out[-1]["tile_ready"] = ready
        out[-1]["_fp"] = r["fp"]
        out[-1]["_lx_only"] = r["tier"] == "raw"
        out[-1]["_lx_imagery"] = True            # LX 영상 표의 영상 — 기관에는 공유한 것만(imagery_shares)
    return out


def _bbox_hit(item: dict, bbox: list[float] | None) -> bool:
    b = item.get("bounds")
    if not bbox or not b:
        return True
    return not (b[2] < bbox[0] or b[0] > bbox[2] or b[3] < bbox[1] or b[1] > bbox[3])


async def tenant_result_sets(tenant_id: str) -> set[str]:
    async with db(realm="tenant", tenant=tenant_id) as conn:
        rows = await conn.fetch("SELECT snapshot_current, snapshot_prev FROM deploys WHERE tenant_id=$1", tenant_id)
    out = set()
    for r in rows:
        for k in ("snapshot_current", "snapshot_prev"):
            if r[k]:
                out.add(r[k])
                out.add(canonical_set(r[k]))
    return out


def guard(items: list[dict], build: str, tenant_sets: set[str] | None = None) -> list[dict]:
    keep = []
    for it in items:
        role, src = it["role"], it["source"]
        own_imagery = src in ("pmtiles", "xyz", "cog") and role == "imagery"
        if build == "public":
            if role == "imagery":
                if not (src == "external" and it["id"].startswith(PUBLIC_IMAGERY_PREFIX)):
                    continue
            elif role == "result":
                if not (it["export_policy"] == "public" and it["security_review"] == "cleared"):
                    continue
            elif it["export_policy"] != "public" or it.get("_lx_only"):
                continue
        elif build == "tenant":
            if it["tier"] == "raw" or src == "cog" or it.get("_lx_only"):
                continue
            if own_imagery and it["export_policy"] not in ("tenant", "public"):
                continue
            if role == "result":
                sets = tenant_sets or set()
                if not (it["set"] in sets or it["export_policy"] == "public" and it["security_review"] == "cleared"):
                    continue
            elif it["export_policy"] == "never":
                continue
        keep.append(it)
    return keep


# 기관 계정에 원본 영상(동적 타일 · 서명)을 줄 것인가 — 2026-09-24 결정(관문 R6: build=tenant 에 원본·동적 타일 0)은
# 2026-10-01 사용자 결정 "기관에 영상을 공유하면 그 기관 지도에도 보이게 한다"로 바뀌었다:
# LX 관리자가 그 기관에 공유한 영상(imagery_shares)만 그 기관에게 지도 조각(서명 주소 · /tiles/sign 이 공유 · 관할을 확인)으로 준다.
# 공유 안 된 영상 · 다른 기관 · 관할 밖은 계속 0. 원본 파일 경로(path)는 내보내지 않는다.
TENANT_RAW_IMAGERY = "shared"


def tenant_cog_items(items: list[dict], tenant_id: str, have: set[str], shared: set[str] | None = None) -> list[dict]:
    """기관 계정의 영상 층 — 이 기관에 공유된 등록 원본 영상(PMTiles 없음 · LX 전용으로 구운 세트 포함)을 동적 래스터 타일로.
    주소는 서명(exp·sig · /tiles/sign 이 공유 · 관할을 다시 확인해 서명한다). 공유 안 된 영상 · 관할 밖 · 해외 · 외부 영상은 넣지 않는다."""
    from .regions import tenant_scope
    if tenant_scope(tenant_id) is None:            # 해외 기관 — 국내 등록 원본 영상은 없음
        return []
    shared = shared or set()                       # 공유 행은 공유할 때 관할(소유 시군구 · 범위)을 확인했다 — 서명 때 한 번 더 본다
    out = []
    for it in items:
        if it["id"] in have or it["id"] not in shared or it.get("role") != "imagery" or it.get("tier") != "raw" \
                or it.get("source") not in ("cog", "pmtiles"):
            continue
        # LX 전용으로 구운 PMTiles 세트는 기관에 주지 않는다 — 같은 영상을 동적 타일(cog/{id} · 공유 · 관할 서명)로
        out.append({**it, "source": "cog", "set": f"cog/{it['id']}", "url": None, "tiles": None, "signed": True, "path": None, "_lx_only": False})
    return out


def public_view(it: dict) -> dict:
    return {k: v for k, v in it.items() if not k.startswith("_")}


async def layer_items(p: Principal, build: str | None, stage: str | None = None, bbox: list[float] | None = None) -> tuple[str, list[dict]]:
    b = allowed_build(p, build)
    items = _external_items(stage) + await _imagery_items(stage) + _layer_items(stage)
    tsets = await tenant_result_sets(p.tenant_id) if b == "tenant" and p.tenant_id else set()
    kept = guard(items, b, tsets)
    if b == "tenant" and p.realm == "tenant" and p.tenant_id:
        # LX 영상 공유(5차 역할-4 ⓑ) — 기관 세션에는 LX 관리자가 이 기관에 켠 영상만(지형 · 외부 위성 · 결과 · 참조 층은 그대로)
        sh = await shared_ids(p.tenant_id)
        kept = [i for i in kept if not (i.get("_lx_imagery") and i.get("role") == "imagery") or i["id"] in sh]
        # 공유된 원본 영상(타일 없음)도 그 기관 지도에(10-01 사용자 결정) — 서명 동적 타일
        kept += tenant_cog_items(items, p.tenant_id, {i["id"] for i in kept}, sh)
    items = [i for i in kept if _bbox_hit(i, bbox)]
    # 기관 결과 세트는 서명 필요 표시(on 모드 url 은 /tiles/sign 으로)
    for i in items:
        t = set_tenant(i["set"] or "")
        if t and t != "lx":
            i["signed"] = True
    items.sort(key=lambda i: (i["ladder"].get("order", 999) if i.get("ladder") else 999))
    return b, items


async def region_imagery_ids(region: str) -> tuple[set[str], dict | None]:
    """시군구(옛/새 코드 모두) → 그 시군구 영상 id(소유 sgg_cd 또는 footprint 겹침 · regions.derived 와 같은 판정)."""
    from .regions import derived, regions_base
    regions, _, _ = regions_base()
    cd = str(region)
    r = next((x for x in regions if x["sgg_cd"] == cd or x.get("prev_cd") == cd), None)
    codes = {cd} | ({r["sgg_cd"], r.get("prev_cd")} - {None} if r else set())
    dv = await derived()
    ids = {i["id"] for c in codes for i in dv["img"].get(c, [])}
    return ids, r


def _dynamic_ladder(ladder: dict, items: list[dict]) -> dict:
    """사다리 설정에 없는 등록 영상(전국 시군구 · p16 · S-5)은 order 순으로 domestic 뒤에 붙인다."""
    listed = {x for v in ladder.values() for x in v}
    extra = sorted((i for i in items if i["role"] == "imagery" and i["source"] in ("pmtiles", "cog") and i["id"] not in listed
                    and (i.get("ladder") or {}).get("stage") in ("domestic", "both")),
                   key=lambda i: ((i.get("ladder") or {}).get("order", 999), i["id"]))
    if extra:
        ladder = {**ladder, "domestic": list(ladder.get("domestic", [])) + [i["id"] for i in extra]}
    return ladder


@router.get("/catalog/layers")
async def catalog_layers(request: Request, stage: str | None = None, build: str | None = None, bbox: str | None = None,
                         z: float | None = None, locale: str = "ko", region: str | None = None):
    p = principal(request)
    bb = [float(v) for v in bbox.split(",")] if bbox else None
    b, items = await layer_items(p, build, stage, bb)
    reg = None
    if region:            # 그 시군구 영상만(외부 위성·참조·결과 층은 그대로) · 옛/새 시군구 코드 모두
        ids, reg = await region_imagery_ids(region)
        items = [i for i in items if not (i["role"] == "imagery" and i["source"] != "external") or i["id"] in ids]
    lad = config.load_yaml("ladder")["ladder"]
    ids = {i["id"] for i in items}
    ladder = _dynamic_ladder({k: [x for x in v if x in ids] for k, v in lad.items()}, items)
    base = base_of(request)
    out = {"items": [{**v, "url": rebase(v.get("url"), base), "tiles": rebase(v.get("tiles"), base)} for v in map(public_view, items)],
           "ladder": ladder, "build": b, "total": len(items), "as_of": now_iso()}
    if region:
        out["region"] = {"sgg_cd": reg["sgg_cd"], "prev_cd": reg.get("prev_cd"), "name": reg["name"]} if reg else {"sgg_cd": region}
    return out


async def best_imagery(sgg_cd: str | None, geom_4326: dict | None = None) -> dict:
    """추론 입력 고르기(core-imagery 계약) — 시군구·범위 → 가장 좋은 영상 한 건(대상의 절반 이상을 덮는가 → 해상도 → 연도 → 덮는 비율).
    반환 {imagery_id, gsd_m, year, coverage 0..1, source 'local', name, sgg_cd, partial} | {imagery_id: None, reason, vworld, next}.
    V-World 위성은 분석 입력으로 쓰지 않는다(config/ladder.yaml vworld_analysis · 약관 판정). 워커는 workers.imagery_src.best_imagery_sync."""
    from workers import imagery_src as isrc
    t = await run_in_threadpool(isrc.target_geom, sgg_cd, geom_4326)
    if t is None or t.is_empty:
        return isrc.result(None, False)
    async with db(realm="lx") as conn:
        recs = await conn.fetch(isrc.SQL_ROWS)
    rows = await run_in_threadpool(isrc.rows_from, recs)
    return isrc.result(await run_in_threadpool(isrc.choose, rows, t), True)


@router.get("/catalog/best_imagery")
async def best_imagery_route(request: Request, region: str | None = None, bbox: str | None = None):
    """best_imagery 를 HTTP 로(LX 세션) — 화면은 '영상 있음/등록 필요' 판정에 쓴다."""
    from .deps import require
    require(principal(request), lx=True)
    geom = None
    if bbox:
        x0, y0, x1, y1 = [float(v) for v in bbox.split(",")]
        geom = {"type": "Polygon", "coordinates": [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]]}
    if not region and not geom:
        raise ApiError("bad_request", "region 또는 bbox 가 필요합니다")
    r = await best_imagery(region, geom)
    if r.get("coverage") is not None:
        r["coverage"] = env(r["coverage"], "ratio", "measured", "영상 footprint ∩ 대상 범위")
    return {**r, "as_of": now_iso()}


@router.get("/catalog/imagery/{iid}")
async def catalog_imagery(iid: str, request: Request):
    p = principal(request)
    b, items = await layer_items(p, None)
    hit = next((i for i in items if i["id"] == iid), None)
    if not hit:
        # 존재는 하는데 권한 밖이면 403(imagery_forbidden), 아예 없으면 404
        async with db(realm="lx") as conn:
            ex = await conn.fetchval("SELECT 1 FROM imagery WHERE id=$1", iid)
        if ex:
            raise ApiError("imagery_forbidden", "이 세션에서 열 수 없는 영상(원본·자체 영상)", {"imagery_id": iid, "build": b})
        raise ApiError("not_found", f"imagery {iid} 없음")
    out = public_view(hit)
    out["footprint"] = hit.get("_fp")
    if p.is_admin:
        async with db(realm="lx") as conn:
            out["path_internal"] = await conn.fetchval("SELECT path_internal FROM imagery WHERE id=$1", iid)
    return out


# ── S-5 영상 등록(F3 최종 명세 §3) ────────────────────────────────────────────
IMAGERY_KINDS = {"ortho": "정사영상", "aerial": "항공영상", "drone": "드론 정사영상", "satellite": "위성영상"}
def _raster_ext() -> tuple:
    """LX 영상 등록이 받는 형식 = 영상 표준 설정 한 곳(config/imagery.yaml accept.raster) + 서버 안 모음 파일(VRT)."""
    from .imagery_std import accept_raster
    return tuple("." + e for e in accept_raster()) + (".vrt",)


RASTER_EXT = (".tif", ".tiff", ".vrt", ".jp2", ".img", ".ecw")          # 옛 이름(다른 모듈 호환) — 등록은 _raster_ext()
UPLOAD_MAX = 2 * 1024 ** 3


def _std_guard(name: str) -> None:
    """이 서버가 지금 바꿀 수 없는 형식이면 등록 전에 — LX 쪽에는 무엇이 없는지 그대로('ECW 변환기가 이 서버에 없습니다')."""
    from .imagery_std import ext_of, unavailable
    e = ext_of(name)
    un = unavailable(True)
    if e in un:
        raise ApiError("format_unavailable", un[e], {"ext": e}, 400)


# ── LX 영상 등록 = 파일 끌어 놓기(확인 대장 1차 FR-1 '기존 자산 기준으로' · 원칙 41 · 49 · 사용자 규칙 2 파일 경로 노출 금지) ──────────
# 기관 분석 의뢰와 같은 조각 올리기(여러 파일 · 진행 · 멈춤 · 이어 올리기 · 취소 — requests.py 의 같은 함수 · 폴더만 cog/uploads/drafts).
# 다 올리면 POST /catalog/imagery {draft_id} — 서버가 파일마다 시군구 · 촬영일 · 해상도를 읽어 영상 행을 만들고 영상 등록 작업(표준본)을 건다.
# 서버 경로 · 촬영 연도 · 해상도를 사람이 넣는 등록은 LX 관리자 도구로만(보관 영상 · 원본 지우지 않음).
#   POST   /catalog/imagery/uploads                 {draft_id?, filename, size, quick_fp?} → 올리기 한 건(같은 파일이면 이어 올리기)
#   PUT    /catalog/imagery/uploads/{uid}?offset=N  한 조각
#   GET    /catalog/imagery/uploads/{uid}           받은 바이트
#   DELETE /catalog/imagery/uploads/{uid}           취소
#   POST   /catalog/imagery/uploads/{uid}/finish    끝
#   GET    /catalog/imagery/uploads/formats         받는 형식 · 지금 받을 수 없는 형식(LX 말)
#   DELETE /catalog/imagery/drafts/{did}            등록 전 묶음 지우기
@router.get("/catalog/imagery/uploads/formats")
async def lx_up_formats(request: Request):
    from . import requests as RQ
    RQ.lx_who(request)
    return await RQ.up_formats(request)


@router.post("/catalog/imagery/uploads", status_code=201)
async def lx_up_start(body: dict, request: Request):
    from . import requests as RQ
    return await RQ.start_upload(RQ.lx_who(request), body)


@router.get("/catalog/imagery/uploads/{uid}")
async def lx_up_state(uid: str, request: Request):
    from . import requests as RQ
    return await RQ.upload_state(RQ.lx_who(request), uid)


@router.put("/catalog/imagery/uploads/{uid}")
async def lx_up_chunk(uid: str, request: Request, offset: int = 0):
    from . import requests as RQ
    return await RQ.put_chunk(RQ.lx_who(request), uid, request, offset)


@router.delete("/catalog/imagery/uploads/{uid}")
async def lx_up_cancel(uid: str, request: Request):
    from . import requests as RQ
    return await RQ.cancel_upload(RQ.lx_who(request), uid)


@router.post("/catalog/imagery/uploads/{uid}/finish")
async def lx_up_finish(uid: str, request: Request):
    from . import requests as RQ
    return await RQ.finish_upload(RQ.lx_who(request), uid)


@router.delete("/catalog/imagery/drafts/{did}")
async def lx_draft_delete(did: str, request: Request):
    from . import requests as RQ
    return await RQ.delete_draft(RQ.lx_who(request), did)


async def _register_draft(request: Request, did: str, near_cd: str | None) -> dict:
    """올린 묶음 → 영상 행(파일마다 하나) + 영상 등록 작업(표준본 · CPU). 입력 칸 없음 — 시군구 · 촬영일 · 해상도 · 종류는 파일에서.
    near_cd = 그 지역 서랍에서 올렸다면 그 시군구(좌표계 기록이 없는 도엽의 위치를 가려낼 때만 쓴다 · 영상이 다른 곳이면 영상이 이긴다)."""
    import re
    from pathlib import Path
    from starlette.concurrency import run_in_threadpool
    from . import requests as RQ
    from .deps import audit
    from .regions import region_of, regions_base
    w = RQ.lx_who(request)
    p = w.p
    if not re.fullmatch(r"dr_[0-9a-f]{12}", did or ""):
        raise ApiError("not_found", "올린 파일이 없습니다")
    async with db(realm="lx") as conn:
        rows = await conn.fetch("SELECT * FROM request_uploads WHERE draft_id=$1 AND tenant_id=$2 AND state IN ('uploading','done') ORDER BY created_at",
                                did, RQ.LX_OWNER)
    if not rows:
        raise ApiError("not_found", "올린 파일이 없습니다")
    if any(r["user_id"] != p.user_id for r in rows):
        raise ApiError("forbidden", "다른 사람의 묶음입니다")
    if any(r["state"] == "uploading" for r in rows):
        raise ApiError("not_ready", "아직 올리는 중인 파일이 있습니다", None, 409)
    if any(r["request_id"] for r in rows):
        raise ApiError("conflict", "이미 등록한 묶음입니다 — 새로 올려 주세요", None, 409)
    folder = config.DATA_ROOT / RQ.LX_ROOT / "drafts" / did
    near = region_of(near_cd) if near_cd else None
    rd = await run_in_threadpool(RQ.read_each, p, folder, [r["filename"] for r in rows], near)
    if not rd.get("ok"):
        raise ApiError(rd["code"], rd["why"], {"files": rd.get("files") or [], "reasons": rd.get("reasons") or {}}, 400)
    regs = {x["sgg_cd"]: x for x in regions_base()[0]}
    made = []
    from . import jobs as jobs_mod
    for it in rd["items"]:
        rg = regs.get(it["sgg_cd"]) or {"name": it["place"].split(" ")[0]}
        year = int(it["date"][:4]) if it.get("date") else None
        kind = it["kind"]
        path = str(config.DATA_ROOT / RQ.LX_ROOT / "drafts" / did / it["name"])
        async with db(realm="lx") as conn:
            base = f"img-{it['sgg_cd']}-{year or 'nd'}-{kind}"
            iid, n = base, 1
            while await conn.fetchval("SELECT 1 FROM imagery WHERE id=$1", iid):
                n += 1
                iid = f"{base}-{n}"
            nm = f"{rg['name']} {year} {IMAGERY_KINDS[kind]}" if year else f"{rg['name']} {IMAGERY_KINDS[kind]}"
            await conn.execute(
                "INSERT INTO imagery(id, name, tier, gsd_m, epoch, crs, footprint, path_internal, license, attribution, export_policy, security_review, "
                "rights_holder, ladder, kind, layer, sgg_cd, year, registered_by, registered_at) VALUES ($1,$2,'raw',$3,$4,$5,"
                "ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($6),4326)),$7,$8,'LX','never','pending','LX',$9,'ortho',$10,$11,$12,$13,now())",
                iid, {"ko": nm, "en": nm}, it["gsd_m"], it.get("date") or None, f"EPSG:{it['epsg']}", json.dumps(it["footprint"]), path,
                "LX 등록 영상(이용 범위 협의)", {"stage": "domestic", "from": 12, "to": 22, "order": 60},
                {"role": "imagery", "cog_path": path, "source_kind": kind, "upload_draft": did, "date_src": it.get("date_src")},
                it["sgg_cd"], year, p.user_id)
            await audit(conn, p, "imagery.register", iid, None, {"sgg_cd": it["sgg_cd"], "year": year, "kind": kind, "gsd": it["gsd_m"],
                                                                  "from": "upload", "draft_id": did, "crs_guessed": it["crs_guessed"]})
        job = await jobs_mod.submit({"kind": "tile", "options": {"imagery_id": iid, "path": path}, "label": f"영상 등록 · {nm}"}, request)
        stem = Path(it["name"]).stem.lower()
        async with db(realm="lx") as conn:
            await conn.execute("UPDATE imagery SET tile_job_id=$2 WHERE id=$1", iid, job["job"]["id"])
            # 이 영상 파일과 곁 파일(같은 이름)은 이 영상에 쓰였다 — 정리(7일)에서 빠지고 같은 파일을 다시 올리면 '이미 등록한 영상'
            await conn.execute("UPDATE request_uploads SET request_id=$2, updated_at=now() WHERE draft_id=$1 AND state='done' AND request_id IS NULL "
                               "AND (lower(filename)=lower($3) OR lower(split_part(filename, '.', 1))=$4)", did, iid, it["name"], stem)
        made.append({"id": iid, "sgg_cd": it["sgg_cd"], "region": rg["name"], "place": it["place"], "year": year, "date": it.get("date"),
                     "gsd_m": it["gsd_m"], "kind": kind, "job": {"id": job["job"]["id"], "kind": "tile", "state": job["job"]["state"]}})
    async with db(realm="lx") as conn:                 # 묶음에 남은 곁 파일(이름이 다른 PRJ 등)도 첫 영상에 묶는다
        await conn.execute("UPDATE request_uploads SET request_id=$2, updated_at=now() WHERE draft_id=$1 AND state='done' AND request_id IS NULL",
                           did, made[0]["id"])
    try:
        from .regions import _derived
        _derived["t"] = 0
    except Exception:
        pass
    return {"items": made, "draft_id": did, "as_of": now_iso()}


@router.post("/catalog/imagery", status_code=201)
async def register_imagery(request: Request):
    """영상 등록 — 화면(LX 직원 · 데이터 올리기): {draft_id, near?} = 올린 파일 묶음 → 파일마다 영상 행 + 영상 등록 작업(_register_draft).
    LX 관리자 도구: {path | upload(multipart file), region(sgg_cd), year, gsd, kind, name?} → 카탈로그 행(tier raw · LX 전용) + 타일 작업(kind tile · CPU).
    경로는 서버 안(02. 데이터 또는 절대 경로) · 응답은 /catalog/layers 항목 형식 그대로 + job."""
    import datetime as dt
    import re
    from pathlib import Path
    from .deps import audit, require
    p = require(principal(request), lx=True)
    if p.role not in ("staff", "admin"):
        raise ApiError("forbidden", "LX 직원·관리자만 영상을 등록할 수 있습니다")
    ctype = request.headers.get("content-type", "")
    upload = None
    if ctype.startswith("multipart/"):
        form = await request.form()
        body = {k: v for k, v in form.items() if isinstance(v, str)}
        upload = form.get("upload") or form.get("file")
    else:
        body = await request.json()
    if body.get("draft_id"):
        return await _register_draft(request, str(body.get("draft_id")), str(body.get("near") or "") or None)
    if not p.is_admin:                                   # 서버 경로 · 사람이 넣는 연도 · 해상도 — 관리자 도구로만(화면에서 감춤)
        raise ApiError("forbidden", "서버 경로 등록은 LX 관리자만 할 수 있습니다 — 영상 파일을 끌어 놓아 올려 주세요")
    sgg = str(body.get("region") or body.get("sgg_cd") or "").strip()
    kind = body.get("kind") or "ortho"
    if kind not in IMAGERY_KINDS:
        raise ApiError("bad_request", "영상 종류", {"allowed": list(IMAGERY_KINDS)})
    try:
        year = int(body.get("year"))
        assert 1990 <= year <= dt.date.today().year + 1
    except Exception:
        raise ApiError("bad_request", "촬영 연도(year)가 필요합니다")
    gsd = None
    if body.get("gsd") not in (None, ""):
        try:
            gsd = float(body.get("gsd"))
        except (TypeError, ValueError):
            raise ApiError("bad_request", "gsd 는 m 단위 숫자")
    from .regions import regions_base
    regs, _, _ = regions_base()
    rg = next((x for x in regs if x["sgg_cd"] == sgg), None)
    if not rg:
        raise ApiError("bad_request", "해당 지역이 없습니다", {"region": sgg})
    if upload is not None and hasattr(upload, "filename"):
        name = re.sub(r"[^\w.\-]", "_", upload.filename or "upload.tif")
        if not name.lower().endswith(_raster_ext()):
            raise ApiError("bad_request", "래스터 파일(GeoTIFF 등)만", {"allowed": list(_raster_ext())})
        _std_guard(name)
        dest = config.DATA_ROOT / "cog" / "uploads" / f"{sgg}-{year}-{name}"
        dest.parent.mkdir(parents=True, exist_ok=True)
        size = 0
        with open(dest, "wb") as f:
            while True:
                chunk = await upload.read(1 << 20)
                if not chunk:
                    break
                size += len(chunk)
                if size > UPLOAD_MAX:
                    f.close()
                    dest.unlink(missing_ok=True)
                    raise ApiError("bad_request", "파일이 너무 큽니다(2GB) — 서버 경로로 등록하세요", status=413)
                f.write(chunk)
        path = str(dest)
    else:
        path = str(body.get("path") or "").strip()
        if not path:
            raise ApiError("bad_request", "path 또는 upload 가 필요합니다")
        full = path if (":" in path[:3] or Path(path).is_absolute()) else str(config.DATA_ROOT / path)
        if not Path(full).exists() or not full.lower().endswith(_raster_ext()):
            raise ApiError("not_found", "영상 파일이 없습니다(서버 경로)")
        _std_guard(full)
    iid = body.get("id") or f"img-{sgg}-{year}-{kind}"
    async with db(realm="lx") as conn:
        base, n = iid, 1
        while await conn.fetchval("SELECT 1 FROM imagery WHERE id=$1", iid):
            n += 1
            iid = f"{base}-{n}"
        nm = body.get("name") or f"{rg['name']} {year} {IMAGERY_KINDS[kind]}"
        await conn.execute(
            "INSERT INTO imagery(id, name, tier, gsd_m, epoch, crs, footprint, path_internal, license, attribution, export_policy, security_review, "
            "rights_holder, ladder, kind, layer, sgg_cd, year, registered_by, registered_at) VALUES ($1,$2,'raw',$3,$4,NULL,NULL,$5,$6,$7,'never',"
            "'pending',$8,$9,$10,$11,$12,$13,$14,now())",
            iid, {"ko": nm, "en": nm}, gsd, str(year), path, body.get("license") or "기관 제공(이용 범위 협의)", body.get("attribution") or "LX",
            body.get("rights_holder") or "기관", {"stage": "domestic", "from": 12, "to": 22, "order": 60},
            "ortho" if kind in ("ortho", "aerial", "drone") else kind, {"role": "imagery", "cog_path": path, "source_kind": kind},
            sgg, year, p.user_id)
        await audit(conn, p, "imagery.register", iid, None, {"sgg_cd": sgg, "year": year, "kind": kind, "gsd": gsd})
    from . import jobs as jobs_mod
    job = await jobs_mod.submit({"kind": "tile", "options": {"imagery_id": iid, "path": path}, "label": f"영상 등록 · {nm}",
                                 "test": bool(body.get("test"))}, request)
    async with db(realm="lx") as conn:
        await conn.execute("UPDATE imagery SET tile_job_id=$2 WHERE id=$1", iid, job["job"]["id"])
    try:
        from .regions import _derived
        _derived["t"] = 0
    except Exception:
        pass
    _, items = await layer_items(p, "lx")
    hit = next((i for i in items if i["id"] == iid), None)
    out = public_view(hit) if hit else {"id": iid}
    out.update({"sgg_cd": sgg, "year": year, "job": {"id": job["job"]["id"], "kind": "tile", "state": job["job"]["state"],
                                                     "events_url": job["events_url"]}})
    return out


# ── LX 영상 공유(확인 대장 5차 역할-4 ⓑ — LX 관리자가 기관마다 고른다) ─────────────────────────────
# 공유 = 권한 한 줄(imagery_shares: 기관 × 영상) — 복사 0 · 원본 파일 0. 기관 세션의 영상 층(layer_items)과 분석 의뢰의 '불러오기'(requests.py)가
# 이 한 표만 본다. 관할 밖 영상은 공유할 수 없다(원칙 39). 첫 실행 때 한 번, 지금 기관에 보이던 관할 안 영상(지도 이미지 · 기관 공개)을 그대로 옮겨 적는다
# (시드 — 화면이 바뀌지 않게). 그 뒤로는 관리자가 켜고 끈 것만.
import time as _time

from .envelope import KST as _KST

_share_cache: dict[str, tuple[float, set]] = {}
_share_seeded = False


async def _seed_shares(conn) -> None:
    global _share_seeded
    if _share_seeded:
        return
    if await conn.fetchval("SELECT 1 FROM audit_log WHERE action='imagery.share.seed' LIMIT 1"):
        _share_seeded = True
        return
    from .regions import in_scope, region_of, tenant_scope
    rows = await conn.fetch("SELECT id, sgg_cd FROM imagery WHERE tier <> 'raw' AND export_policy IN ('tenant','public') AND sgg_cd IS NOT NULL "
                            "AND coalesce(layer->>'role','imagery') = 'imagery' AND coalesce(kind,'ortho') <> 'terrain'")
    n = 0
    for t in await conn.fetch("SELECT id FROM tenants WHERE coalesce(kind,'') <> 'maker'"):
        sc = tenant_scope(t["id"])
        if not sc:                                   # 해외(None) · 전국 권한([]) 기관은 옮겨 적지 않는다
            continue
        for r in rows:
            reg = region_of(r["sgg_cd"]) or {}
            if any(in_scope(str(c), sc) for c in {r["sgg_cd"], reg.get("sgg_cd"), reg.get("prev_cd")} if c):
                await conn.execute("INSERT INTO imagery_shares(tenant_id, imagery_id, shared_by) VALUES ($1,$2,'system') ON CONFLICT DO NOTHING",
                                   t["id"], r["id"])
                n += 1
    await conn.execute("INSERT INTO audit_log(actor, realm, action, subject, before, after) VALUES ('system','system','imagery.share.seed',"
                       "'imagery_shares',NULL,$1)", {"n": n})
    _share_seeded = True


async def shared_ids(tenant_id: str | None) -> set[str]:
    """기관에 공유된 LX 영상 id(10초 캐시)."""
    if not tenant_id:
        return set()
    c = _share_cache.get(tenant_id)
    if c and _time.time() - c[0] < 10:
        return c[1]
    async with db(realm="lx") as conn:
        await _seed_shares(conn)
        ids = {r["imagery_id"] for r in await conn.fetch("SELECT imagery_id FROM imagery_shares WHERE tenant_id=$1", tenant_id)}
    _share_cache[tenant_id] = (_time.time(), ids)
    return ids


def _share_candidates(tid: str, rows: list) -> list:
    """기관 관할 안의 LX 영상(소유 시군구가 관할 안 · 또는 범위가 관할에 걸침) — 공유 고르기 목록. 동기(관할 경계 캐시)."""
    from shapely.geometry import shape as _shape
    from .deps import Principal
    from .regions import geom_in_scope, in_scope, region_of, scope_of, _scope_union, _overseas_area
    from .regions import scope_regions
    tp = Principal(realm="tenant", role="manager", tenant_id=tid)
    sc = scope_of(tp)
    boxes = [x["bbox"] for x in scope_regions(tp) if x.get("bbox")] if sc else []
    out = []
    for r in rows:
        reg = region_of(r["sgg_cd"]) if r["sgg_cd"] else None
        codes = {c for c in (r["sgg_cd"], (reg or {}).get("sgg_cd"), (reg or {}).get("prev_cd")) if c}
        hit = sc is None or (sc and any(in_scope(str(c), sc) for c in codes))
        if not hit and r["fp"]:
            g = _shape(r["fp"]).buffer(0)
            b = g.bounds
            if sc and not any(not (b[2] < x[0] or b[0] > x[2] or b[3] < x[1] or b[1] > x[3]) for x in boxes):
                continue                               # 관할 시군구 상자에 닿지도 않는 영상 — 경계 계산 없이 뺀다
            area = _overseas_area(tp) if sc == [] else _scope_union(tp, g.bounds)
            hit = area is not None and g.intersects(area) and (g.intersection(area).area > 0.2 * g.area or geom_in_scope(tp, g))
        if hit:
            out.append(r)
    return out


@router.get("/tenants/{tid}/imagery-shares")
async def tenant_shares(tid: str, request: Request):
    """LX 관리자 — 이 기관에 열어 줄 수 있는 LX 영상(관할 안)과 지금 공유 여부. 지도에서 보기(화면용 지도 이미지가 있음) · 분석 의뢰에 쓰기(원본이 있음)."""
    from .deps import require
    from .deploys import gsd_word
    require(principal(request), admin=True)
    async with db(realm="lx") as conn:
        if not await conn.fetchval("SELECT 1 FROM tenants WHERE id=$1", tid):
            raise ApiError("not_found", "해당 기관이 없습니다")
        await _seed_shares(conn)
        rows = await conn.fetch("SELECT i.id, i.name, i.tier, i.gsd_m, i.year, i.epoch, i.kind, i.sgg_cd, i.pmtiles_set, i.path_internal, i.layer, "
                                "ST_AsGeoJSON(i.footprint)::json AS fp FROM imagery i WHERE coalesce(i.layer->>'role','imagery') = 'imagery' "
                                "AND coalesce(i.kind,'ortho') <> 'terrain' AND (i.sgg_cd IS NOT NULL OR i.footprint IS NOT NULL)")
        sh = {r["imagery_id"]: r for r in await conn.fetch("SELECT imagery_id, shared_at FROM imagery_shares WHERE tenant_id=$1", tid)}
    cands = await run_in_threadpool(_share_candidates, tid, rows)
    # 영상 표준(원칙 94 · 확인 대장 15차 영상-3 ⓑ) — 원본 지울 날짜 한 칸(숫자 한 출처 imagery_std · 경로는 내지 않는다)
    from .imagery_std import date_word
    async with db(realm="lx") as conn:
        stds = {x["source_id"]: x for x in await conn.fetch(
            "SELECT source_id, state, orig_delete_on, orig_deleted_at, orig_owned FROM imagery_std WHERE source_kind='imagery' AND source_id = ANY($1::text[])",
            [r["id"] for r in cands])}

    def _orig(iid: str) -> str | None:
        x = stds.get(iid)
        if not x or x["state"] != "ready":
            return None
        if x["orig_deleted_at"]:
            return "원본 지움 · 표준본으로 씀"
        if x["orig_delete_on"]:
            return f"원본 지울 날짜 {date_word(x['orig_delete_on'])}"
        return "원본 보관(지우지 않음)" if not x["orig_owned"] else None
    wheres = await run_in_threadpool(_where_words, cands)
    items = []
    for r in cands:
        g = float(r["gsd_m"]) if r["gsd_m"] is not None else None
        ep = str(r["year"] or r["epoch"] or "")
        analyze = bool(r["path_internal"] or (r["layer"] or {}).get("cog_path"))
        view = bool(r["pmtiles_set"]) or (r["tier"] == "raw" and analyze)      # 원본만 있는 영상도 공유하면 기관 지도에(서명 동적 타일 · 10-01)
        name = (r["name"] or {}).get("ko") if isinstance(r["name"], dict) else r["name"]
        kind = _kind_of(g)
        items.append({"id": r["id"], "name": name or "영상", "year": int(ep[:4]) if ep[:4].isdigit() else None, "gsd_m": g,
                      "gsd_word": gsd_word(g) if g else "", "view": view, "analyze": analyze, "shared": r["id"] in sh, "orig": _orig(r["id"]),
                      "kind": kind, "kind_word": KIND_WORD.get(kind), "when": _when_word(r), "where": wheres.get(r["id"]),
                      "_when": _when_key(r), "thumb": f"/catalog/imagery/{r['id']}/thumb",
                      "shared_at": sh[r["id"]]["shared_at"].astimezone(_KST).isoformat(timespec="seconds") if r["id"] in sh and sh[r["id"]]["shared_at"] else None})
    # 확인 18차 M-4 ⓐ — 공유 중 먼저 → 최근 촬영순(같은 해면 월까지) → 이름
    items.sort(key=lambda x: (not x["shared"], tuple(-v for v in x.pop("_when")), x["name"]))
    return {"tenant_id": tid, "items": items, "total": len(items), "as_of": now_iso()}


# ── 공유 영상을 그림으로 보고 판단(확인 18차 M-4 ⓐ · 원칙 112) ─────────────────────────────────────────────
# 줄마다 실제 영상 썸네일(표준본 · 원본 COG 또는 화면용 지도 조각에서 작게 — 지어낸 그림 0) · 어디(읍면동 · 영상 범위에서) · 언제(촬영 연월) · 종류.
# 썸네일은 LX 관리자만(로그인 세션 · 원본에서 만든 그림이라 기관 · 게스트에는 내지 않는다). 처음 한 번 CPU 로 만들어 두고(가로 320) 다시 쓴다.
KIND_WORD = {"drone": "드론", "aerial": "항공", "satellite": "위성"}
THUMB_W, THUMB_H = 320, 240
_where_cache: dict[str, str | None] = {}


def _kind_of(g: float | None) -> str:
    return "drone" if g is not None and g < 0.1 else "satellite" if g is not None and g >= 1 else "aerial"


def _when_key(r) -> tuple[int, int]:
    import re as _re
    s = str(r["epoch"] or r["year"] or "")
    m = _re.match(r"((?:19|20)\d{2})(?:[-.](\d{1,2}))?", s)
    return (int(m.group(1)), int(m.group(2) or 0)) if m else (0, 0)


def _when_word(r) -> str | None:
    y, mo = _when_key(r)
    return (f"{y}년 {mo}월" if mo else f"{y}년") if y else None


def _where_words(rows) -> dict[str, str | None]:
    """영상 범위 → '남원시 송동면 일대' · 시군구를 거의 다 덮으면 '남원시 전역'(동기 · 영상마다 한 번 계산해 둔다)."""
    from shapely.geometry import shape as _shape
    from .deps import Principal
    import re
    from .regions import emd_index, region_of
    from .requests import _place
    lx = Principal(realm="lx", role="admin", user_id="system")
    out = {}
    for r in rows:
        if r["id"] in _where_cache:
            out[r["id"]] = _where_cache[r["id"]]
            continue
        w = None
        cov = (r["layer"] or {}).get("coverage")
        reg = region_of(r["sgg_cd"]) if r["sgg_cd"] else None
        try:
            if cov is not None and float(cov) >= 0.8 and reg:
                w = f"{reg['name']} 전역"
            elif r["fp"]:
                place, sgg = _place(lx, _shape(r["fp"]).buffer(0))
                w = f"{place} 일대" if sgg else (reg or {}).get("name")
                m = re.search(r"등 (\d+)곳$", place or "")
                ix = emd_index(sgg) if (m and sgg) else None
                if m and ix is not None and len(ix) and int(m.group(1)) >= 0.8 * len(ix):
                    w = f"{place.split(' ')[0]} 전역"                    # 읍면동을 거의 다 덮는 영상
            elif reg:
                w = reg["name"]
        except Exception:  # noqa: BLE001
            w = (reg or {}).get("name")
        out[r["id"]] = _where_cache[r["id"]] = w
    return out


def _thumb_make(row: dict, out) -> bool:
    """영상 한 장 → 가로 320 · 4:3 그림(JPEG · 지도 조각 · 표준본 COG 에서 · CPU). 작은 영상(긴 변 3km 이하)은 영상이 충분히 덮으면 전체,
    큰 영상 · 빈 곳이 많은 영상은 낮은 줌 개관에서 영상이 가장 빽빽한 곳을 찾아 그 둘레 1.2km 만(빈 바탕만 보이는 그림 0)."""
    import math
    import cv2
    import numpy as np
    from shapely.geometry import shape as _shape
    from agent.vlm import crop as CR                               # 영상 조각 렌더(불러 쓰기만 — 고치지 않음)
    srcs = CR.sources_from_rows([row], config.DATA_ROOT, resolve_set_path)
    if not srcs or not row.get("fp"):
        return False
    src = srcs[0]
    g = _shape(row["fp"]).buffer(0)
    b = g.bounds
    lat = (b[1] + b[3]) / 2
    mx, my = 111320.0 * max(0.1, math.cos(math.radians(lat))), 110540.0
    w_m, h_m = (b[2] - b[0]) * mx, (b[3] - b[1]) * my
    bg = np.array(CR.NODATA_BGR, np.int16)

    def box(cx, cy, wm):                                           # 가운데 · 가로 폭(m) → 4:3 상자(경위도)
        hm = wm * 3 / 4
        return [cx - wm / 2 / mx, cy - hm / 2 / my, cx + wm / 2 / mx, cy + hm / 2 / my]

    def render(bb):
        v = CR.render_view(src, bb, None)
        im = cv2.imdecode(np.frombuffer(v.png, np.uint8), cv2.IMREAD_COLOR) if v else None
        if im is None:
            return None, None
        data = (np.abs(im.astype(np.int16) - bg).max(axis=2) > 6).astype(np.float32)
        return im, data

    full = box((b[0] + b[2]) / 2, (b[1] + b[3]) / 2, max(w_m, h_m * 4 / 3) * 1.04)
    im, data = render(full)
    if im is None:                                                 # 낮은 줌 조각이 없는 세트 — 영상 안쪽 몇 점 둘레 1.2km 가운데 영상이 가장 많은 것
        pts = [g.representative_point(), g.centroid] + [type(g.centroid)(b[0] + (b[2] - b[0]) * i / 4, b[1] + (b[3] - b[1]) * j / 4)
                                                        for i in (1, 2, 3) for j in (1, 2, 3)]
        best = (None, None, -1.0)
        for c in pts:
            if not g.contains(c):
                continue
            im2, d2 = render(box(c.x, c.y, min(1200.0, max(w_m, h_m))))
            if im2 is not None and float(d2.mean()) > best[2]:
                best = (im2, d2, float(d2.mean()))
                if best[2] >= 0.6:
                    break
        im, data = best[0], best[1]
        if im is None:
            return False
    if max(w_m, h_m) > 3000 or float(data.mean()) < 0.35:
        k = max(3, int(min(data.shape) / 5) | 1)
        dens = cv2.blur(data, (k, k))
        vy, vx = np.unravel_index(int(np.argmax(dens)), dens.shape)
        if dens[vy, vx] > 0.2:                                    # 영상이 가장 빽빽한 곳 → 그 둘레(긴 변 3km 이하면 영상 폭의 절반까지만 키움)
            fx, fy = (vx + 0.5) / data.shape[1], (vy + 0.5) / data.shape[0]
            x0m, y0m = CR.lonlat_to_m(full[0], full[1])
            x1m, y1m = CR.lonlat_to_m(full[2], full[3])
            xm, ym = x0m + fx * (x1m - x0m), y1m - fy * (y1m - y0m)
            lon = xm / 6378137.0 * 180 / math.pi
            la = (2 * math.atan(math.exp(ym / 6378137.0)) - math.pi / 2) * 180 / math.pi
            wm = 1200.0 if max(w_m, h_m) > 3000 else max(200.0, max(w_m, h_m) / 2)
            im2, d2 = render(box(lon, la, wm))
            if im2 is not None:
                im, data = im2, d2
    ys, xs = np.nonzero(data > 0)                                  # 영상이 있는 상자만 남긴다(바깥 빈 바탕을 덜어 냄)
    if len(xs) and (xs.max() - xs.min() + 1) * (ys.max() - ys.min() + 1) >= 0.25 * data.size:
        im = im[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    h, w = im.shape[:2]
    s = max(THUMB_W / w, THUMB_H / h)
    im = cv2.resize(im, (max(THUMB_W, round(w * s)), max(THUMB_H, round(h * s))), interpolation=cv2.INTER_AREA)
    y0, x0 = (im.shape[0] - THUMB_H) // 2, (im.shape[1] - THUMB_W) // 2
    ok, buf = cv2.imencode(".jpg", im[y0:y0 + THUMB_H, x0:x0 + THUMB_W], [cv2.IMWRITE_JPEG_QUALITY, 82])
    if not ok:
        return False
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(buf.tobytes())
    return True


_thumb_gate = None


@router.get("/catalog/imagery/{iid}/thumb")
async def imagery_thumb(iid: str, request: Request):
    """공유 영상 썸네일(LX 관리자만) — 처음 한 번 만들어 cache/thumbs 에 두고 다시 쓴다(원천 파일이 바뀌면 새로). 그림이 없으면 204."""
    import asyncio
    import hashlib
    from fastapi import Response
    from .deps import require
    global _thumb_gate
    require(principal(request), admin=True)
    async with db(realm="lx") as conn:
        r = await conn.fetchrow("SELECT id, name, kind, gsd_m, year, epoch, path_internal, pmtiles_set, layer, ST_AsGeoJSON(footprint)::json AS fp "
                                "FROM imagery WHERE id=$1 AND coalesce(layer->>'role','imagery')='imagery'", iid)
    if not r:
        raise ApiError("not_found", "영상이 없습니다")
    row = dict(r)
    key = hashlib.sha1(json.dumps([row["path_internal"], row["pmtiles_set"], (row["layer"] or {}).get("cog_path"), row["fp"]], default=str).encode()).hexdigest()[:12]
    out = config.DATA_ROOT / "cache" / "thumbs" / f"{iid}-{key}.jpg"
    hdr = {"Cache-Control": "private, max-age=86400"}
    if out.exists():
        return Response(content=out.read_bytes(), media_type="image/jpeg", headers=hdr)
    if out.with_suffix(".none").exists():
        return Response(status_code=204)
    _thumb_gate = _thumb_gate or asyncio.Semaphore(2)               # CPU 보호 — 한 번에 둘
    async with _thumb_gate:
        try:
            ok = await run_in_threadpool(_thumb_make, row, out)
        except Exception as e:  # noqa: BLE001
            print(f"[thumb] {iid} {e!r}", flush=True)
            ok = False
    if not ok:
        out.parent.mkdir(parents=True, exist_ok=True)
        out.with_suffix(".none").touch()
        return Response(status_code=204)
    return Response(content=out.read_bytes(), media_type="image/jpeg", headers=hdr)


@router.put("/tenants/{tid}/imagery-shares/{iid}")
async def set_tenant_share(tid: str, iid: str, body: dict, request: Request):
    """LX 관리자 — 이 영상을 이 기관에 켜고 끈다(켜면 그 기관이 지도에서 보고 분석 의뢰에 불러온다). 관할 밖 영상은 켤 수 없다."""
    from .deps import audit, require
    from .jobs import ops_event, tenant_event
    p = require(principal(request), admin=True)
    on = bool(body.get("shared"))
    async with db(realm="lx") as conn:
        if not await conn.fetchval("SELECT 1 FROM tenants WHERE id=$1", tid):
            raise ApiError("not_found", "해당 기관이 없습니다")
        r = await conn.fetchrow("SELECT id, sgg_cd, ST_AsGeoJSON(footprint)::json AS fp FROM imagery WHERE id=$1 AND coalesce(layer->>'role','imagery')='imagery'",
                                iid)
    if not r:
        raise ApiError("not_found", "영상이 없습니다")
    if on and not await run_in_threadpool(_share_candidates, tid, [r]):
        raise ApiError("out_of_scope", "이 기관 관할 밖 영상은 공유할 수 없습니다", None, 403)
    async with db(realm="lx") as conn:
        if on:
            await conn.execute("INSERT INTO imagery_shares(tenant_id, imagery_id, shared_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", tid, iid, p.user_id)
        else:
            await conn.execute("DELETE FROM imagery_shares WHERE tenant_id=$1 AND imagery_id=$2", tid, iid)
        await audit(conn, p, "imagery.share" if on else "imagery.unshare", iid, None, {"tenant_id": tid})
    _share_cache.pop(tid, None)
    await ops_event("imagery.share", {"tenant_id": tid, "imagery_id": iid, "shared": on, "by": p.user_id, "at": now_iso()})
    await tenant_event(tid, "imagery.shared", {"imagery_id": iid, "shared": on})
    return {"tenant_id": tid, "imagery_id": iid, "shared": on, "as_of": now_iso()}


# ── 기관 메인 배경 사진(확인 18차 기관-12 ⓐ · 원칙 116) ───────────────────────────────────────────────
# LX 관리자가 그 기관의 결과 장면 · 공유한 영상에서 고르거나 올린다 → 서버가 가로 1,600 이하 JPEG 한 장으로 만들어 둔다(메타데이터 없이 다시 저장).
# 로그인 전 기관 메인이 쓰므로 공개 길(GET /brand/{기관}/main-photo)은 그 한 장만 내준다 — 원본 · 지도 조각 · 다른 기관 그림 0.
# 제한 영상(config/gov-main.yaml restricted 의 이름이 들어간 영상 · 장면)은 고를 수 없다. 고르지 않았으면 기관 메인은 지금 그림 그대로(기본).
#   GET    /tenants/{기관}/main-photo              LX 관리자 — 고를 수 있는 것(결과 장면 · 공유한 영상) + 지금 고른 것
#   PUT    /tenants/{기관}/main-photo              {kind: scene, src} | {kind: imagery, id} | {kind: default} — 고르기(default = 지금 그림으로 되돌림)
#   POST   /tenants/{기관}/main-photo/upload       그림 파일 올리기(JPG · PNG · WEBP · 20MB 까지)
#   GET    /brand/{기관}/main-photo                로그인 없이 — 고른 한 장(없으면 404)
MAIN_W = 1600
MAIN_MAX_UPLOAD = 20 * 1024 * 1024


def _main_dir(tid: str):
    import re as _re
    if not _re.fullmatch(r"[a-z0-9][a-z0-9-]{1,40}", tid or ""):
        raise ApiError("not_found", "해당 기관이 없습니다")
    return config.DATA_ROOT / "tenants" / tid / "brand"            # 기관 마크와 같은 칸(brand.py _brand_dir) · 파일 이름 main-* · main.json


def _main_meta(tid: str) -> dict | None:
    try:
        return json.loads((_main_dir(tid) / "main.json").read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return None


def _gov_main_cfg() -> dict:
    try:
        return config.load_yaml("gov-main") or {}
    except Exception:  # noqa: BLE001
        return {}


def _restricted(*names) -> bool:
    bad = [str(x) for x in (_gov_main_cfg().get("restricted") or []) if x]
    return any(b in str(n or "") for n in names for b in bad)


def _save_main(tid: str, im, source: dict, by: str) -> dict:
    """그림(BGR 배열) → 가로 1,600 이하 JPEG(메타데이터 없음) + main.json. 예전 그림은 지운다."""
    import hashlib
    import cv2
    h, w = im.shape[:2]
    if w > MAIN_W:
        im = cv2.resize(im, (MAIN_W, max(1, round(h * MAIN_W / w))), interpolation=cv2.INTER_AREA)
    ok, buf = cv2.imencode(".jpg", im, [cv2.IMWRITE_JPEG_QUALITY, 84, cv2.IMWRITE_JPEG_PROGRESSIVE, 1])
    if not ok:
        raise ApiError("bad_request", "그림을 만들지 못했습니다")
    data = buf.tobytes()
    d = _main_dir(tid)
    d.mkdir(parents=True, exist_ok=True)
    name = f"main-{hashlib.sha1(data).hexdigest()[:10]}.jpg"
    for old in d.glob("main-*.jpg"):
        if old.name != name:
            old.unlink(missing_ok=True)
    (d / name).write_bytes(data)
    meta = {"file": name, "w": int(im.shape[1]), "h": int(im.shape[0]), "source": source, "by": by, "at": now_iso()}
    (d / "main.json").write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
    return meta


def _main_view(tid: str, meta: dict | None) -> dict | None:
    if not meta or not (_main_dir(tid) / meta.get("file", "-")).exists():
        return None
    src = meta.get("source") or {}
    return {"url": f"/brand/{tid}/main-photo?v={meta['file'][5:15]}", "kind": src.get("kind"), "id": src.get("id"), "src": src.get("src"),
            "label": src.get("label"), "at": meta.get("at")}


def _render_banner(row: dict):
    """공유 영상 한 장 → 가로 1,536 · 2:1 그림(영상이 빽빽한 곳 둘레 · 지도 조각 · 표준본 COG 에서 · CPU). 3×2 칸을 따로 그려 잇는다."""
    import math
    import cv2
    import numpy as np
    from shapely.geometry import shape as _shape
    from agent.vlm import crop as CR                               # 영상 조각 렌더(불러 쓰기만 — 고치지 않음)
    srcs = CR.sources_from_rows([row], config.DATA_ROOT, resolve_set_path)
    if not srcs or not row.get("fp"):
        return None
    g = _shape(row["fp"]).buffer(0)
    b = g.bounds
    lat = (b[1] + b[3]) / 2
    mx, my = 111320.0 * max(0.1, math.cos(math.radians(lat))), 110540.0
    w_m = min(max((b[2] - b[0]) * mx, (b[3] - b[1]) * my * 2), 1800.0)
    c = g.representative_point()
    cx, cy = c.x, c.y
    cols, rws = 3, 2
    cw, ch = w_m / cols, w_m / 2 / rws
    x0, y1 = cx - w_m / 2 / mx, cy + w_m / 4 / my
    tiles = []
    for j in range(rws):
        line = []
        for i in range(cols):
            bb = [x0 + i * cw / mx, y1 - (j + 1) * ch / my, x0 + (i + 1) * cw / mx, y1 - j * ch / my]
            v = CR.render_view(srcs[0], bb, None)
            im = cv2.imdecode(np.frombuffer(v.png, np.uint8), cv2.IMREAD_COLOR) if v else None
            if im is None:
                return None
            line.append(cv2.resize(im, (512, 341), interpolation=cv2.INTER_AREA))
        tiles.append(np.hstack(line))
    return np.vstack(tiles)


@router.get("/tenants/{tid}/main-photo")
async def main_photo_get(tid: str, request: Request):
    """LX 관리자 — 기관 메인 배경 사진: 고를 수 있는 것(그 기관 결과 장면 · 공유한 영상) + 지금 고른 것(없으면 기본 그림)."""
    from .deps import require
    require(principal(request), admin=True)
    async with db(realm="lx") as conn:
        if not await conn.fetchval("SELECT 1 FROM tenants WHERE id=$1", tid):
            raise ApiError("not_found", "해당 기관이 없습니다")
        rows = await conn.fetch("SELECT i.id, i.name, i.gsd_m, i.year, i.epoch, i.path_internal, i.pmtiles_set FROM imagery_shares s JOIN imagery i ON i.id = s.imagery_id "
                                "WHERE s.tenant_id=$1 AND coalesce(i.kind,'ortho') NOT IN ('terrain','index')", tid)
    t = ((_gov_main_cfg().get("tenants") or {}).get(tid) or {})
    scenes = []
    if t.get("background") and not _restricted(t["background"]):
        scenes.append({"kind": "scene", "src": t["background"], "label": "지금 그림(기본)", "thumb": t["background"], "default": True})
    for card, sc in (t.get("scenes") or {}).items():
        if isinstance(sc, dict) and sc.get("src") and not _restricted(sc["src"]):
            scenes.append({"kind": "scene", "src": sc["src"], "label": sc.get("caption") or "결과 장면", "thumb": sc["src"]})
    imgs = []
    for r in sorted(rows, key=lambda x: _when_key(x), reverse=True):
        name = (r["name"] or {}).get("ko") if isinstance(r["name"], dict) else r["name"]
        if _restricted(r["id"], name, r["path_internal"], r["pmtiles_set"]):
            continue
        g = float(r["gsd_m"]) if r["gsd_m"] is not None else None
        imgs.append({"kind": "imagery", "id": r["id"], "label": " ".join(x for x in (_when_word(r), KIND_WORD.get(_kind_of(g))) if x) or (name or "영상"),
                     "thumb": f"/catalog/imagery/{r['id']}/thumb"})
    return {"tenant_id": tid, "current": _main_view(tid, _main_meta(tid)), "scenes": scenes, "imagery": imgs[:12], "as_of": now_iso()}


@router.put("/tenants/{tid}/main-photo")
async def main_photo_put(tid: str, body: dict, request: Request):
    """LX 관리자 — 고르기. scene = 그 기관 결과 장면(설정 한 곳의 그림) · imagery = 그 기관에 공유한 영상에서 그림 · default = 지금 그림으로 되돌림."""
    import cv2
    import numpy as np
    from .deps import audit, require
    p = require(principal(request), admin=True)
    kind = str(body.get("kind") or "")
    d = _main_dir(tid)
    async with db(realm="lx") as conn:
        if not await conn.fetchval("SELECT 1 FROM tenants WHERE id=$1", tid):
            raise ApiError("not_found", "해당 기관이 없습니다")
    if kind == "default":
        for f in list(d.glob("main-*.jpg")) + [d / "main.json"]:
            f.unlink(missing_ok=True)
        async with db(realm="lx") as conn:
            await audit(conn, p, "brand.main_photo", tid, None, {"kind": "default"})
        return {"tenant_id": tid, "current": None, "as_of": now_iso()}
    if kind == "scene":
        src = str(body.get("src") or "")
        t = ((_gov_main_cfg().get("tenants") or {}).get(tid) or {})
        allowed = {t.get("background")} | {(sc or {}).get("src") for sc in (t.get("scenes") or {}).values() if isinstance(sc, dict)}
        if not src or src not in allowed or _restricted(src) or ".." in src:
            raise ApiError("bad_request", "이 기관의 결과 장면이 아닙니다")
        im = await run_in_threadpool(lambda: cv2.imdecode(np.fromfile(str(config.REPO_ROOT / src.lstrip("/")), np.uint8), cv2.IMREAD_COLOR))
        source = {"kind": "scene", "src": src, "label": str(body.get("label") or "")[:60] or None}
    elif kind == "imagery":
        iid = str(body.get("id") or "")
        async with db(realm="lx") as conn:
            r = await conn.fetchrow("SELECT i.id, i.name, i.kind, i.gsd_m, i.year, i.epoch, i.path_internal, i.pmtiles_set, i.layer, "
                                    "ST_AsGeoJSON(i.footprint)::json AS fp FROM imagery_shares s JOIN imagery i ON i.id = s.imagery_id "
                                    "WHERE s.tenant_id=$1 AND i.id=$2", tid, iid)
        if not r:
            raise ApiError("bad_request", "이 기관에 공유한 영상만 고를 수 있습니다")
        name = (r["name"] or {}).get("ko") if isinstance(r["name"], dict) else r["name"]
        if _restricted(r["id"], name, r["path_internal"], r["pmtiles_set"]):
            raise ApiError("bad_request", "밖으로 낼 수 없는 영상입니다")
        im = await run_in_threadpool(_render_banner, dict(r))
        source = {"kind": "imagery", "id": iid, "label": " ".join(x for x in (_when_word(r), KIND_WORD.get(_kind_of(float(r["gsd_m"]) if r["gsd_m"] is not None else None))) if x)}
    else:
        raise ApiError("bad_request", "고를 것: scene · imagery · default")
    if im is None:
        raise ApiError("bad_request", "그림을 만들지 못했습니다 — 다른 장면을 골라 주세요")
    meta = await run_in_threadpool(_save_main, tid, im, source, p.user_id)
    async with db(realm="lx") as conn:
        await audit(conn, p, "brand.main_photo", tid, None, {"source": source, "w": meta["w"], "h": meta["h"]})
    return {"tenant_id": tid, "current": _main_view(tid, meta), "as_of": now_iso()}


@router.post("/tenants/{tid}/main-photo/upload")
async def main_photo_upload(tid: str, request: Request):
    """LX 관리자 — 사진 올리기(JPG · PNG · WEBP · 20MB 까지) → 가로 1,600 이하로 다시 저장(메타데이터 없이)."""
    import cv2
    import numpy as np
    from .deps import audit, require
    p = require(principal(request), admin=True)
    async with db(realm="lx") as conn:
        if not await conn.fetchval("SELECT 1 FROM tenants WHERE id=$1", tid):
            raise ApiError("not_found", "해당 기관이 없습니다")
    form = await request.form()
    f = form.get("file")
    if f is None or not hasattr(f, "read"):
        raise ApiError("bad_request", "사진 파일을 골라 주세요")
    data = await f.read(MAIN_MAX_UPLOAD + 1)
    if len(data) > MAIN_MAX_UPLOAD:
        raise ApiError("too_large", "사진은 20MB 까지 올릴 수 있습니다", None, 413)
    im = await run_in_threadpool(lambda: cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR))
    if im is None or min(im.shape[:2]) < 200:
        raise ApiError("bad_request", "사진으로 읽을 수 없는 파일입니다 — JPG · PNG 사진을 골라 주세요")
    source = {"kind": "upload", "label": "올린 사진"}
    meta = await run_in_threadpool(_save_main, tid, im, source, p.user_id)
    async with db(realm="lx") as conn:
        await audit(conn, p, "brand.main_photo", tid, None, {"source": source, "w": meta["w"], "h": meta["h"], "bytes": len(data)})
    return {"tenant_id": tid, "current": _main_view(tid, meta), "as_of": now_iso()}


@router.get("/brand/{tid}/main-photo")
async def main_photo_public(tid: str):
    """로그인 없이 — 기관 메인 배경 사진(LX 관리자가 고른 한 장 · 가로 1,600 이하). 고르지 않았으면 404(메인은 지금 그림)."""
    from fastapi import Response
    meta = _main_meta(tid)
    f = _main_dir(tid) / (meta or {}).get("file", "-")
    if not meta or not f.exists():
        raise ApiError("not_found", "고른 배경 사진이 없습니다")
    return Response(content=f.read_bytes(), media_type="image/jpeg", headers={"Cache-Control": "public, max-age=300"})
