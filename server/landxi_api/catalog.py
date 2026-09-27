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

from . import config
from .deps import ApiError, Principal, db, principal
from .envelope import env, now_iso, today

router = APIRouter()
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
    return None


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
        m = _mf(meta.get("manifest"))
        signed = False
        pm_raw = meta.get("pmtiles_set")
        if r["tier"] == "raw" and pm_raw and s["sets"].get(pm_raw) and (config.DATA_ROOT / s["sets"][pm_raw]).exists():
            # 원본에서 구운 LX 전용 PMTiles(서명 필수 · api-v1.js tileUrl 이 /tiles/sign 을 부른다)
            source, set_id, path = "pmtiles", pm_raw, s["sets"][pm_raw]
            tiles, url, signed = None, pm_url(pm_raw), True
            m = _mf(s["sets"][pm_raw].split("/")[-1]) or m
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
        out[-1]["sgg_cd"] = r["sgg_cd"]          # 소유 시군구(v1.2 · 등록 S-5 또는 seed/backfill_imagery_sgg.py)
        # 타일 준비(v1.2) — 원본(raw)은 등록 타일 작업(tile/cog finalize)이 끝나야 true · 미리 구운 PMTiles 는 파일이 있으면 true
        if r["tile_job_id"]:                     # 등록(S-5)한 영상 = 그 타일 작업이 끝났는가
            ready = bool(meta.get("tile_ready"))
        else:                                    # 등록 전부터 있던 영상 = 타일 원천(COG 경로 · 구운 PMTiles)이 있는가
            ready = bool(meta.get("tile_ready") or path or meta.get("cog_path"))
        out[-1]["tile_ready"] = ready
        out[-1]["_fp"] = r["fp"]
        out[-1]["_lx_only"] = r["tier"] == "raw"
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


def public_view(it: dict) -> dict:
    return {k: v for k, v in it.items() if not k.startswith("_")}


async def layer_items(p: Principal, build: str | None, stage: str | None = None, bbox: list[float] | None = None) -> tuple[str, list[dict]]:
    b = allowed_build(p, build)
    items = _external_items(stage) + await _imagery_items(stage) + _layer_items(stage)
    tsets = await tenant_result_sets(p.tenant_id) if b == "tenant" and p.tenant_id else set()
    items = [i for i in guard(items, b, tsets) if _bbox_hit(i, bbox)]
    # 기관 결과 세트는 서명 필요 표시(on 모드 url 은 /tiles/sign 으로)
    for i in items:
        t = set_tenant(i["set"] or "")
        if t and t != "lx":
            i["signed"] = True
    items.sort(key=lambda i: (i["ladder"].get("order", 999) if i.get("ladder") else 999))
    return b, items


@router.get("/catalog/layers")
async def catalog_layers(request: Request, stage: str | None = None, build: str | None = None, bbox: str | None = None,
                         z: float | None = None, locale: str = "ko"):
    p = principal(request)
    bb = [float(v) for v in bbox.split(",")] if bbox else None
    b, items = await layer_items(p, build, stage, bb)
    lad = config.load_yaml("ladder")["ladder"]
    ids = {i["id"] for i in items}
    ladder = {k: [x for x in v if x in ids] for k, v in lad.items()}
    return {"items": [public_view(i) for i in items], "ladder": ladder, "build": b, "total": len(items), "as_of": now_iso()}


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
RASTER_EXT = (".tif", ".tiff", ".vrt", ".jp2", ".img", ".ecw")
UPLOAD_MAX = 2 * 1024 ** 3


@router.post("/catalog/imagery", status_code=201)
async def register_imagery(request: Request):
    """영상 등록 — {path | upload(multipart file), region(sgg_cd), year, gsd, kind, name?} → 카탈로그 행(tier raw · LX 전용) + 타일 작업(kind tile · CPU).
    LX staff/admin. 경로는 서버 안(02. 데이터 또는 절대 경로) · 응답은 /catalog/layers 항목 형식 그대로 + job."""
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
        if not name.lower().endswith(RASTER_EXT):
            raise ApiError("bad_request", "래스터 파일(GeoTIFF 등)만", {"allowed": list(RASTER_EXT)})
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
        if not Path(full).exists() or not full.lower().endswith(RASTER_EXT):
            raise ApiError("not_found", "영상 파일이 없습니다(서버 경로)")
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
