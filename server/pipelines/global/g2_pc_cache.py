"""G2 · Planetary Computer 캐시 — 월별 S2 모자이크 searchid · WorldCover 비율 · T43TEH 장면 수(F1-D 브리프 §0).

실행: python -m server.pipelines.global.g2_pc_cache [--refresh]
산출:
  pc-mosaics.json          {"months": {"2025-03": searchid, …}, source, fetched_at, license}
  ysykata-landcover.json   WorldCover 2021 클래스 비율(봉투 · '비율만 유효')
  ysykata-ndvi-2025.json   월별 n_scenes(T43TEH만) · ndvi_mean 은 G-J1(adapter_ndvi_pc)이 채운다(그 전엔 null)
멱등: PC 응답은 raw/ 캐시. searchid 는 같은 본문이면 PC 가 같은 해시를 준다.
"""
from __future__ import annotations

import argparse
import importlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
G = importlib.import_module("server.adapters.global")

PC = "https://planetarycomputer.microsoft.com/api"
MONTHS = [f"2025-{m:02d}" for m in range(3, 11)]
YSYK_PLAIN = [74.70, 42.75, 75.20, 43.00]          # 브리프 · 계약 §6 dp-kgz-agri-farm-26 aoi
MOSAIC_BBOX = [73.80, 42.40, 76.00, 43.35]         # 추이 평원(소쿨룩·비슈케크·으슥아타) — 브리프 bbox 의 상위집합(카메라가 비슈케크를 지날 때 모자이크 경계가 보이지 않게)
WC_ITEMS = ["ESA_WorldCover_10m_2021_v200_N42E072", "ESA_WorldCover_10m_2021_v200_N42E075"]
WC_CLASSES = {10: ("Tree cover", "수목"), 20: ("Shrubland", "관목"), 30: ("Grassland", "초지"), 40: ("Cropland", "농경지"),
              50: ("Built-up", "시가화"), 60: ("Bare / sparse vegetation", "나지"), 70: ("Snow and ice", "눈·빙하"),
              80: ("Permanent water", "영구수역"), 90: ("Herbaceous wetland", "초본 습지"), 95: ("Mangroves", "맹그로브"), 100: ("Moss and lichen", "이끼·지의류")}
MGRS = "43TEH"
SPRAWL_BBOX = [74.15, 42.74, 74.80, 43.02]


def poly(b):
    return {"type": "Polygon", "coordinates": [[[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]], [b[0], b[1]]]]}


def month_interval(m: str):
    y, mm = map(int, m.split("-"))
    ny, nm = (y + 1, 1) if mm == 12 else (y, mm + 1)
    return f"{m}-01T00:00:00Z", f"{ny}-{nm:02d}-01T00:00:00Z"


def mosaics(refresh: bool):
    out, metas = {}, []
    for m in MONTHS:
        a, b = month_interval(m)
        body = {"filter-lang": "cql2-json", "filter": {"op": "and", "args": [
            {"op": "=", "args": [{"property": "collection"}, "sentinel-2-l2a"]},
            {"op": "s_intersects", "args": [{"property": "geometry"}, poly(MOSAIC_BBOX)]},
            {"op": "anyinteracts", "args": [{"property": "datetime"}, {"interval": [a, b]}]},
            {"op": "<=", "args": [{"property": "eo:cloud_cover"}, 10]}]},
            "sortby": [{"field": "eo:cloud_cover", "direction": "asc"}]}
        raw, meta = G.cached_fetch(PC + "/data/v1/mosaic/register", f"pc-mosaic-{m}.json", method="POST", body=body, refresh=refresh)
        out[m] = json.loads(raw)["searchid"]
        metas.append(meta)
    # 스와이프 2017 ↔ 2025(소쿨룩·비슈케크) — EOX s2cloudless-2017 은 중앙아시아에서 흰 타일(2026-09-24 실측) → PC S2 L2A 여름 모자이크 두 장
    swipe = {}
    for yr in ("2017", "2025"):
        body = {"filter-lang": "cql2-json", "filter": {"op": "and", "args": [
            {"op": "=", "args": [{"property": "collection"}, "sentinel-2-l2a"]},
            {"op": "s_intersects", "args": [{"property": "geometry"}, poly(SPRAWL_BBOX)]},
            {"op": "anyinteracts", "args": [{"property": "datetime"}, {"interval": [f"{yr}-07-01T00:00:00Z", f"{yr}-10-01T00:00:00Z"]}]},
            {"op": "<=", "args": [{"property": "eo:cloud_cover"}, 5]}]},
            "sortby": [{"field": "eo:cloud_cover", "direction": "asc"}]}
        raw, meta = G.cached_fetch(PC + "/data/v1/mosaic/register", f"pc-mosaic-swipe-{yr}.json", method="POST", body=body, refresh=refresh)
        swipe[yr] = json.loads(raw)["searchid"]
        metas.append(meta)
    doc = {"source": PC + "/data/v1/mosaic/register (CQL2 · sentinel-2-l2a · eo:cloud_cover ≤ 10 · 구름 적은 순)",
           "fetched_at": max(x["fetched_at"] for x in metas), "license": "Copernicus Sentinel data (free · 상업 포함) · 'Contains modified Copernicus Sentinel data 2025' · Microsoft Planetary Computer",
           "bbox": MOSAIC_BBOX, "bbox_note": "브리프 bbox [74.70,42.75,75.20,43.00] 의 상위집합(추이 평원 전체)",
           "tiles": PC + "/data/v1/mosaic/tiles/{searchid}/WebMercatorQuad/{z}/{x}/{y}@1x.png?collection=sentinel-2-l2a&assets=visual&asset_bidx=visual|1,2,3&nodata=0",
           "minzoom": 9, "maxzoom": 14, "months": out,
           "swipe": swipe, "swipe_bbox": SPRAWL_BBOX, "swipe_note": "Jul–Sep · cloud ≤ 5 · least-cloudy first · 2017 = L2A reprocessed (2021) · EOX 2017 blank over KGZ"}
    G.write_out("pc-mosaics.json", doc, indent=1)
    print("mosaics", out)


def landcover(refresh: bool):
    from pyproj import Geod
    from shapely.geometry import box, shape
    adm2 = json.loads((G.GLOBAL_ROOT / "kgz-adm2.geojson").read_text(encoding="utf-8"))
    ys = next(f for f in adm2["features"] if f["properties"]["name"] == "Ysyk-Ata")
    gshape = shape(ys["geometry"])
    geod = Geod(ellps="WGS84")
    area_weighted, raw_counts, metas, per_item = {}, {}, [], []
    for item in WC_ITEMS:
        lon0 = int(item.split("E")[-1][:3])
        part = gshape.intersection(box(lon0, 42, lon0 + 3, 45))
        if part.is_empty:
            continue
        feat = {"type": "Feature", "properties": {}, "geometry": ys["geometry"]}
        url = f"{PC}/data/v1/item/statistics?collection=esa-worldcover&item={item}&assets=map&categorical=true&max_size=2048"
        raw, meta = G.cached_fetch(url, f"pc-wc-stats-{item}.json", method="POST", body=feat, refresh=refresh)
        st = json.loads(raw)["properties"]["statistics"]["map_b1"]
        counts, values = st["histogram"]
        tot = sum(counts)
        a_m2 = abs(geod.geometry_area_perimeter(part)[0])
        per_item.append({"item": item, "valid_pixels": st["valid_pixels"], "part_area_km2": round(a_m2 / 1e6, 1)})
        for c, v in zip(counts, values):
            v = int(v)
            raw_counts[v] = raw_counts.get(v, 0) + c
            area_weighted[v] = area_weighted.get(v, 0) + (c / tot) * a_m2
        metas.append(meta)
    tot_c = sum(raw_counts.values())
    tot_a = sum(area_weighted.values())
    as_of = max(m["fetched_at"] for m in metas)[:10]
    classes = []
    for v in sorted(raw_counts, key=lambda k: -raw_counts[k]):
        pct = round(100 * raw_counts[v] / tot_c, 1)
        pct_aw = round(100 * area_weighted[v] / tot_a, 1)
        en, ko = WC_CLASSES.get(v, (str(v), str(v)))
        classes.append({"code": v, "name_en": en, "name_ko": ko,
                        "pct": G.env(pct, "%", "measured", "PC item/statistics esa-worldcover 2021 · N42E072+N42E075 · Ysyk-Ata ADM2", as_of=as_of,
                                     note="max_size 2048 downsample — ratio only valid"),
                        "pct_area_weighted": G.env(pct_aw, "%", "measured", "same response · area-weighted per tile", as_of=as_of, note="cross-check — ratio only valid")})
    doc = {"source": f"{PC}/data/v1/item/statistics?collection=esa-worldcover&assets=map&categorical=true&max_size=2048 · body = geoBoundaries ADM2 Ysyk-Ata (92254566B31675215078110)",
           "fetched_at": max(m["fetched_at"] for m in metas), "license": "CC BY 4.0 · © ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium",
           "district": {"name": "Ysyk-Ata", "name_cyr": "Ысык-Ата", "code": "92254566B31675215078110"},
           "note": "비율만 유효 — 정밀 면적(ha)은 원해상도 COG 재집계 필요(adapter_worldcover.py)", "items": per_item, "classes": classes}
    old = G.GLOBAL_ROOT / "ysykata-landcover.json"
    if old.exists():   # adapter_worldcover 가 채운 10 m 정밀 면적 보존(멱등)
        prev = json.loads(old.read_text(encoding="utf-8"))
        pc = {c["code"]: c for c in prev.get("classes", [])}
        for c in classes:
            for k in ("area_ha", "pct_10m"):
                if k in pc.get(c["code"], {}):
                    c[k] = pc[c["code"]][k]
        for k in ("total_ha", "note_10m"):
            if k in prev:
                doc[k] = prev[k]
    G.write_out("ysykata-landcover.json", doc, indent=1)
    print("landcover", [(c["name_en"], c["pct"]["value"], c["pct_area_weighted"]["value"]) for c in classes])


def scene_counts(refresh: bool):
    months, metas = [], []
    existing = {}
    p = G.GLOBAL_ROOT / "ysykata-ndvi-2025.json"
    if p.exists():  # G-J1 가 채운 ndvi_mean 은 보존(멱등 · 덮어쓰지 않음)
        for m in json.loads(p.read_text(encoding="utf-8")).get("months", []):
            existing[m["month"]] = m
    for m in MONTHS:
        a, b = month_interval(m)
        body = {"collections": ["sentinel-2-l2a"], "bbox": YSYK_PLAIN, "datetime": f"{a}/{b}",
                "query": {"eo:cloud_cover": {"lt": 15}, "s2:mgrs_tile": {"eq": MGRS}}, "limit": 100,
                "sortby": [{"field": "eo:cloud_cover", "direction": "asc"}]}
        raw, meta = G.cached_fetch(PC + "/stac/v1/search", f"pc-stac-{MGRS}-{m}.json", method="POST", body=body, refresh=refresh)
        feats = json.loads(raw)["features"]
        metas.append(meta)
        prev = existing.get(m, {})
        keep = {k: v for k, v in prev.items() if k in ("p10", "p50", "p90", "hist", "valid_px", "crop_px", "scenes_used", "ms")}   # G-J1 산출 보존(멱등)
        months.append({**keep, "month": m, "shard_id": f"m{m}",
                       "n_scenes": G.env(len(feats), "count", "measured", f"PC STAC search s2:mgrs_tile={MGRS} · eo:cloud_cover<15", as_of=meta["fetched_at"][:10]),
                       "scenes": [f["id"] for f in feats],
                       "ndvi_mean": prev.get("ndvi_mean") or G.env(None, "ndvi", "recorded", "G-J1 not run yet", note="filled by adapter_ndvi_pc")})
    doc = {"source": PC + "/stac/v1/search (sentinel-2-l2a · T43TEH · cloud<15)", "fetched_at": max(m["fetched_at"] for m in metas),
           "license": "Copernicus Sentinel data (free) · Microsoft Planetary Computer",
           "aoi": YSYK_PLAIN, "mgrs": MGRS, "cloud_max": 15, "mask": "worldcover-40",
           "note": "T43TEH 만 센다(§10.3 — recon 107장면은 T43TEH+T43TDH 합)", "months": months,
           "total_scenes": G.env(sum(x["n_scenes"]["value"] for x in months), "count", "measured", "sum of months", as_of=metas[-1]["fetched_at"][:10])}
    G.write_out("ysykata-ndvi-2025.json", doc, indent=1)
    print("scenes", [(x["month"], x["n_scenes"]["value"]) for x in months], doc["total_scenes"]["value"])


def catalog_fixture():
    """계약 §4.1 LayerItem 형 카탈로그 픽스처(off 모드 · 하니스 /catalog/layers 원천). 외부 URL = recon global-map §1 검증값."""
    mos = json.loads((G.GLOBAL_ROOT / "pc-mosaics.json").read_text(encoding="utf-8"))
    PCD = PC + "/data/v1"
    W = [-180, -85, 180, 85]

    def item(id, name_en, name_ko, kind, role, source, tiles, minz, maxz, bounds, gsd, epoch, lic, attr, export, sec, holder, order, frm, to,
             params=None, set_=None, path=None, layer=None, note=None):
        d = {"id": id, "name": {"ko": name_ko, "en": name_en}, "kind": kind, "role": role, "source": source, "set": set_, "path": path, "url": None,
             "tiles": tiles, "scheme": "xyz", "layer": layer, "promote_id": None, "minzoom": minz, "maxzoom": maxz, "bounds": bounds, "gsd_m": gsd,
             "epoch": epoch, "crs": "EPSG:3857", "tier": "tile", "license": lic, "attribution": attr, "export_policy": export, "security_review": sec,
             "rights_holder": holder, "ladder": {"stage": "global", "from": frm, "to": to, "order": order}, "count": None, "signed": False}
        if params:
            d["params"] = params
        if note:
            d["note"] = note
        return d
    NDVI = PCD + "/mosaic/tiles/{searchid}/WebMercatorQuad/{z}/{x}/{y}@1x.png?collection=sentinel-2-l2a&assets=B04&assets=B08&expression=(B08-B04)/(B08%2BB04)&asset_as_band=true&rescale=-0.2,0.8&colormap_name=rdylgn&nodata=0"
    maxar_b = [95.858, 20.864, 95.934, 20.937]
    items = [
        item("gibs-viirs-truecolor", "NASA GIBS VIIRS NOAA-20 true colour · daily", "NASA GIBS VIIRS NOAA-20 트루컬러 · 일자별", "raster", "imagery", "external",
             "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_NOAA20_CorrectedReflectance_TrueColor/default/{date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg", 0, 9, W, 375, "daily",
             "NASA open data (no restriction)", "Imagery: NASA GIBS / ESDIS", "public", "n/a", "NASA", 10, 0, 5, {"date": "yesterday(UTC)"}),
        item("eox-s2cloudless-2025", "EOX Sentinel-2 cloudless 2025", "EOX Sentinel-2 cloudless 2025", "raster", "imagery", "external",
             "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/g/{z}/{y}/{x}.jpg", 3, 14, W, 10, "2025", "CC BY-NC-SA 4.0",
             "Sentinel-2 cloudless – https://s2maps.eu by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2025)", "public", "n/a", "EOX IT Services GmbH", 20, 5, 9,
             note="non-commercial — build=lx|tenant public demo only · excluded from build=export (2017 edition instead)"),
        item("eox-s2cloudless-2017", "EOX Sentinel-2 cloudless 2017", "EOX Sentinel-2 cloudless 2017", "raster", "imagery", "external",
             "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2017_3857/default/g/{z}/{y}/{x}.jpg", 3, 14, W, 10, "2017", "CC BY 4.0",
             "Sentinel-2 cloudless – https://s2maps.eu by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016 & 2017)", "public", "n/a", "EOX IT Services GmbH", 21, 5, 9,
             note="verified blank (white tiles) over Kyrgyzstan 2026-09-24 — not used in KGZ scenes"),
        item("gibs-hls-s30", "NASA GIBS HLS S30 30 m · daily", "NASA GIBS HLS S30 30 m · 일자별", "raster", "imagery", "external",
             "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/HLS_S30_Nadir_BRDF_Adjusted_Reflectance/default/{date}/GoogleMapsCompatible_Level12/{z}/{y}/{x}.png", 8, 12, W, 30, "daily",
             "NASA open data (no restriction)", "Imagery: NASA GIBS / ESDIS · HLS", "public", "n/a", "NASA", 30, 9, 12, {"date": "yesterday(UTC)"}),
        item("pc-s2-mosaic", "Planetary Computer Sentinel-2 L2A monthly mosaic", "PC Sentinel-2 L2A 월별 모자이크", "raster", "imagery", "external",
             mos["tiles"], 9, 14, mos["bbox"], 10, "2025-03…10", "Copernicus Sentinel data (free · commercial OK)",
             "Contains modified Copernicus Sentinel data 2025 · Microsoft Planetary Computer", "public", "n/a", "ESA / Copernicus", 40, 9, 14,
             {"months": mos["months"], "searchid": mos["months"]["2025-06"], "swipe": mos["swipe"], "swipe_bbox": mos["swipe_bbox"]}),
        item("pc-worldcover-2021", "ESA WorldCover 10 m 2021", "ESA WorldCover 10 m 2021", "raster", "reference", "external",
             PCD + "/item/tiles/WebMercatorQuad/{z}/{x}/{y}@1x?collection=esa-worldcover&item={item}&assets=map&colormap_name=esa-worldcover", 9, 14, [72, 42, 78, 45], 10, "2021",
             "CC BY 4.0", "© ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium", "public", "n/a", "ESA", 50, 9, 14,
             {"items": WC_ITEMS}),
        item("pc-ndvi-mosaic", "NDVI (B08−B04)/(B08+B04) · monthly mosaic · index calc", "NDVI 지수 · 월별 모자이크 · 지수 계산", "raster", "result", "external",
             NDVI, 9, 14, YSYK_PLAIN, 10, "2025-03…10", "Copernicus Sentinel data (free)",
             "Contains modified Copernicus Sentinel data 2025 · Microsoft Planetary Computer · index calc, not model inference", "public", "n/a", "ESA / Copernicus", 60, 10, 14,
             {"months": mos["months"]}),
        item("overture-buildings", "Overture Maps buildings 2026-09-23.0", "Overture 건물 2026-09-23.0", "vector", "reference", "external",
             "pmtiles://https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/tiles/2026-09-23.0/buildings.pmtiles", 13, 18, W, None, "2026-09-23.0",
             "ODbL / CDLA-Permissive-2.0", "© OpenStreetMap contributors, Overture Maps Foundation", "public", "n/a", "Overture Maps Foundation", 70, 13, 18, layer="building"),
        item("maxar-mm-meiktila", "Maxar Open Data · Meiktila post-event 2025-04-03 (0.5 m)", "Maxar Open Data · 메이크틸라 사후 2025-04-03 (0.5 m)", "raster", "imagery", "xyz",
             None, 12, 17, maxar_b, 0.5, "2025-04-03", "CC BY-NC 4.0", "Maxar Open Data (CC BY-NC 4.0) · 10300101112F4700", "never", "n/a", "Maxar Technologies (Vantor)", 80, 14, 18,
             set_="global/maxar_meiktila_post", path="global/tiles/maxar_meiktila_post/{z}/{x}/{y}.webp", note="demo only · non-commercial · excluded from build=export"),
        item("maxar-mm-meiktila-pre", "Maxar Open Data · Meiktila pre-event 2025-03-06 (0.5 m)", "Maxar Open Data · 메이크틸라 사전 2025-03-06 (0.5 m)", "raster", "imagery", "xyz",
             None, 12, 17, maxar_b, 0.5, "2025-03-06", "CC BY-NC 4.0", "Maxar Open Data (CC BY-NC 4.0) · 103001010E80EA00", "never", "n/a", "Maxar Technologies (Vantor)", 81, 14, 18,
             set_="global/maxar_meiktila_pre", path="global/tiles/maxar_meiktila_pre/{z}/{x}/{y}.webp", note="demo only · non-commercial · excluded from build=export"),
        item("xdworld-satellite", "V-World satellite (xdworld)", "V-World 위성(xdworld)", "raster", "imagery", "external",
             "https://xdworld.vworld.kr/2d/Satellite/service/{z}/{x}/{y}.jpeg", 5, 19, [124.5, 33.0, 131.9, 38.9], 0.25, "2026-03",
             "KOGL (MOLIT V-World)", "© V-World (MOLIT)", "public", "cleared", "MOLIT", 5, 5, 19, note="Namwon start camera · the only imagery layer in public mode (R6)"),
    ]
    # 메이크틸라 S2 전후(Maxar 불가 빌드의 대체) — 브라우저 POST 검색은 CORS 사전요청 실패(실측) → 여기서 사전 수집
    for key, (dt, when) in {"pre": ("2025-03-01T00:00:00Z/2025-03-27T23:59:59Z", "pre-event"), "post": ("2025-03-29T00:00:00Z/2025-04-20T23:59:59Z", "post-event")}.items():
        body = {"collections": ["sentinel-2-l2a"], "bbox": [95.82, 20.85, 95.91, 20.92], "datetime": dt, "limit": 20, "sortby": [{"field": "eo:cloud_cover", "direction": "asc"}]}
        raw, meta = G.cached_fetch(PC + "/stac/v1/search", f"pc-stac-meiktila-{key}.json", method="POST", body=body)
        f = json.loads(raw)["features"][0]
        items.append(item(f"s2-mm-meiktila-{key}", f"Sentinel-2 L2A · Meiktila {when} {f['properties']['datetime'][:10]}", f"Sentinel-2 L2A · 메이크틸라 {'사전' if key == 'pre' else '사후'} {f['properties']['datetime'][:10]}",
                          "raster", "imagery", "external",
                          PCD + f"/item/tiles/WebMercatorQuad/{{z}}/{{x}}/{{y}}@1x.png?collection=sentinel-2-l2a&item={f['id']}&assets=visual&asset_bidx=visual|1,2,3&nodata=0",
                          10, 14, [round(v, 4) for v in f["bbox"]], 10, f["properties"]["datetime"][:10], "Copernicus Sentinel data (free · commercial OK)",
                          "Contains modified Copernicus Sentinel data 2025 · Microsoft Planetary Computer", "public", "n/a", "ESA / Copernicus", 82 if key == "pre" else 83, 10, 14,
                          {"item": f["id"], "cloud": round(f["properties"]["eo:cloud_cover"], 1)}, note="Maxar fallback (build=export|public)"))
    doc = {"items": items,
           "ladder": {"global": ["gibs-viirs-truecolor", "eox-s2cloudless-2025", "gibs-hls-s30", "pc-s2-mosaic", "pc-worldcover-2021", "pc-ndvi-mosaic", "overture-buildings", "maxar-mm-meiktila"],
                      "domestic_bridge": ["xdworld-satellite"]},
           "as_of": mos["fetched_at"][:10], "source": "F1-D fixture · F1-CONTRACT §4.1 LayerItem · external URLs verified in recon-0924/global-map.md §1",
           "fetched_at": mos["fetched_at"], "license": "per item (license field)"}
    (G.SCREEN / "catalog-fixture-global.json").write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
    print("catalog", len(items))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true")
    r = ap.parse_args().refresh
    mosaics(r)
    landcover(r)
    scene_counts(r)
    catalog_fixture()
