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
                                "security_review, rights_holder, asset_ref, ladder, kind, layer, "
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
