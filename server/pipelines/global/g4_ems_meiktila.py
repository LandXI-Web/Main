"""G4 · Copernicus EMS EMSR798 AOI11 Meiktila GRA → Overture 건물 최근접 15 m 조인(F1-D 브리프 §0).

실행: python -m server.pipelines.global.g4_ems_meiktila [--refresh]
산출: mm-meiktila-damage.geojson — EMS builtUpP 38점 각각을 가장 가까운 Overture 건물(≤ 15 m)에 붙여
        · 건물 폴리곤(있으면) + 원 점 · damage_gra · 조인 거리 · Overture id/높이
      mm-meiktila-aoi.geojson    — areaOfInterestA + imageFootprintA
원천: EMS 제품 ZIP(CORS 없음 → 서버 수집) · Overture buildings PMTiles 2026-09-23.0 (HTTP Range · pmtiles 파이썬)
"""
from __future__ import annotations

import argparse
import gzip
import importlib
import io
import json
import math
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
G = importlib.import_module("server.adapters.global")

EMS_ZIP = "https://rapidmapping.emergency.copernicus.eu/backend/EMSR798/AOI11/GRA_PRODUCT/EMSR798_AOI11_GRA_PRODUCT_v1.zip"
OVERTURE = "https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/tiles/2026-09-23.0/buildings.pmtiles"
Z = 14
JOIN_M = 15.0
GRADE_ORDER = ["Destroyed", "Damaged", "Possibly damaged"]


def lonlat_to_tile(lon, lat, z):
    n = 2 ** z
    x = int((lon + 180) / 360 * n)
    y = int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)
    return x, y


def tile_px_to_lonlat(z, tx, ty, px, py, extent):
    n = 2 ** z
    lon = (tx + px / extent) / n * 360 - 180
    lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (ty + py / extent) / n))))
    return lon, lat


class RangeSource:
    def __init__(self, url):
        import httpx
        self.url = url
        self.c = httpx.Client(timeout=60, headers=G.UA, follow_redirects=True)
        self.n = 0

    def __call__(self, offset, length):
        self.n += 1
        r = self.c.get(self.url, headers={"range": f"bytes={offset}-{offset + length - 1}"})
        r.raise_for_status()
        return r.content


def overture_buildings(bbox, cache_name):
    """bbox 안 z14 타일의 Overture 건물을 GeoJSON 으로(캐시)."""
    cache = G.RAW / cache_name
    if cache.exists():
        return json.loads(cache.read_text(encoding="utf-8"))
    import mapbox_vector_tile
    from pmtiles.reader import Reader
    from shapely.geometry import mapping, shape
    src = RangeSource(OVERTURE)
    rd = Reader(src)
    hdr = rd.header()
    x0, y1 = lonlat_to_tile(bbox[0], bbox[1], Z)
    x1, y0 = lonlat_to_tile(bbox[2], bbox[3], Z)
    feats = []
    for tx in range(x0, x1 + 1):
        for ty in range(y0, y1 + 1):
            data = rd.get(Z, tx, ty)
            if not data:
                continue
            if data[:2] == b"\x1f\x8b":
                data = gzip.decompress(data)
            dec = mapbox_vector_tile.decode(data, default_options={"y_coord_down": True})
            lyr = dec.get("building")
            if not lyr:
                continue
            ext = lyr.get("extent", 4096)
            for f in lyr["features"]:
                g = f["geometry"]
                if g["type"] not in ("Polygon", "MultiPolygon"):
                    continue
                def conv(c):
                    if isinstance(c[0], (int, float)):
                        return list(tile_px_to_lonlat(Z, tx, ty, c[0], c[1], ext))
                    return [conv(x) for x in c]
                geom = {"type": g["type"], "coordinates": conv(g["coordinates"])}
                try:
                    sg = shape(geom).buffer(0)
                except Exception:  # noqa: BLE001
                    continue
                p = f.get("properties", {})
                feats.append({"type": "Feature", "properties": {"ov_id": p.get("id"), "height": p.get("height"), "tile": f"{Z}/{tx}/{ty}"},
                              "geometry": mapping(sg)})
    out = {"type": "FeatureCollection", "lx": {"source": OVERTURE, "z": Z, "range_requests": src.n, "fetched_at": G.now_iso(),
                                               "tile_compression": str(hdr.get("tile_compression", "")), "maxzoom": hdr.get("max_zoom")}, "features": feats}
    cache.write_text(json.dumps(out), encoding="utf-8")
    return out


def main(refresh: bool = False):
    from pyproj import Transformer
    from shapely.geometry import mapping, shape
    from shapely.ops import transform
    from shapely.strtree import STRtree
    raw, meta = G.cached_fetch(EMS_ZIP, "EMSR798_AOI11_GRA_PRODUCT_v1.zip", refresh=refresh, timeout=300)
    z = zipfile.ZipFile(io.BytesIO(raw))
    pts = json.loads(z.read("EMSR798_AOI11_GRA_PRODUCT_builtUpP_v1.json"))
    aoi = json.loads(z.read("EMSR798_AOI11_GRA_PRODUCT_areaOfInterestA_v1.json"))
    foot = json.loads(z.read("EMSR798_AOI11_GRA_PRODUCT_imageFootprintA_v1.json"))
    xs = [f["geometry"]["coordinates"][0] for f in pts["features"]]
    ys = [f["geometry"]["coordinates"][1] for f in pts["features"]]
    bb = [min(xs) - 0.002, min(ys) - 0.002, max(xs) + 0.002, max(ys) + 0.002]
    ov = overture_buildings(bb, f"overture-buildings-meiktila-z{Z}.json")
    to_m = Transformer.from_crs("EPSG:4326", "EPSG:32646", always_xy=True).transform   # UTM 46N
    bshapes = [shape(f["geometry"]) for f in ov["features"]]
    bm = [transform(to_m, s) for s in bshapes]
    tree = STRtree(bm)
    out, counts, joined = [], {}, 0
    for i, f in enumerate(pts["features"]):
        p = f["properties"]
        grade = p["damage_gra"]
        counts[grade] = counts.get(grade, 0) + 1
        pt = shape(f["geometry"])
        ptm = transform(to_m, pt)
        idx = tree.query_nearest(ptm, max_distance=JOIN_M, return_distance=True)
        props = {"id": f"ems-{i:02d}", "damage_gra": grade, "grade_rank": GRADE_ORDER.index(grade) if grade in GRADE_ORDER else 9,
                 "obj_type": p.get("obj_type"), "det_method": p.get("det_method"), "lnglat": G.rnd(f["geometry"]["coordinates"], 6)}
        geom = f["geometry"]
        if len(idx[0]):
            k = int(idx[0][0]); d = float(idx[1][0])
            props.update({"joined": True, "join_m": round(d, 1), "ov_id": ov["features"][k]["properties"]["ov_id"],
                          "height_m": ov["features"][k]["properties"]["height"]})
            geom = {"type": mapping(bshapes[k])["type"], "coordinates": G.rnd(json.loads(json.dumps(mapping(bshapes[k])["coordinates"])), 6)}
            joined += 1
        else:
            props.update({"joined": False, "join_m": None, "note": f"{JOIN_M:.0f} m 안 Overture 건물 없음 — 점으로 표기"})
        out.append({"type": "Feature", "id": i, "properties": props, "geometry": geom})
    as_of = meta["fetched_at"][:10]
    src_ems = "Copernicus EMS EMSR798 AOI11 GRA v1 builtUpP"
    doc = {"type": "FeatureCollection",
           "lx": {"source": EMS_ZIP, "fetched_at": meta["fetched_at"], "sha256": meta["sha256"],
                  "license": "© European Union, Copernicus Emergency Management Service (출처 표기 시 자유 이용) · 건물 형상 © OpenStreetMap contributors, Overture Maps Foundation (ODbL/CDLA)",
                  "overture": OVERTURE, "join": f"최근접 ≤ {JOIN_M:.0f} m (UTM 46N) · Overture z{Z} MVT",
                  "event": {"id": "EMSR798", "glide": "EQ-2025-000043-MMR", "name": "Earthquakes in Myanmar", "date": "2025-03-28", "aoi": "AOI11 Meiktila"},
                  "counts": {g: G.env(counts.get(g, 0), "count", "measured", src_ems, as_of=as_of) for g in GRADE_ORDER},
                  "total": G.env(len(out), "count", "measured", src_ems, as_of=as_of),
                  "joined": G.env(joined, "count", "measured", "shapely STRtree.query_nearest", as_of=ov["lx"]["fetched_at"][:10], note=f"nearest Overture building ≤ {JOIN_M:.0f} m"),
                  "overture_buildings_in_bbox": G.env(len(ov["features"]), "count", "measured", OVERTURE, as_of=ov["lx"]["fetched_at"][:10]),
                  "pts_bbox": [round(v, 5) for v in bb]},
           "features": out}
    G.write_out("mm-meiktila-damage.geojson", doc)
    aoi_doc = {"type": "FeatureCollection",
               "lx": {"source": EMS_ZIP, "fetched_at": meta["fetched_at"], "license": "© European Union, Copernicus Emergency Management Service"},
               "features": [{"type": "Feature", "properties": {"kind": "aoi", **aoi["features"][0]["properties"]},
                             "geometry": {"type": aoi["features"][0]["geometry"]["type"], "coordinates": G.rnd(aoi["features"][0]["geometry"]["coordinates"], 6)}}]
               + [{"type": "Feature", "properties": {"kind": "image_footprint", **{k: v for k, v in f["properties"].items() if isinstance(v, (str, int, float))}},
                   "geometry": {"type": f["geometry"]["type"], "coordinates": G.rnd(f["geometry"]["coordinates"], 6)}} for f in foot["features"]]}
    G.write_out("mm-meiktila-aoi.geojson", aoi_doc)
    print("counts", counts, "joined", joined, "/", len(out), "overture", len(ov["features"]))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true")
    main(ap.parse_args().refresh)
