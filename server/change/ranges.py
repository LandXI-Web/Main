"""대상지(범위) 만들기 — ① 구역선 파일(geojson · shp zip · gpkg) + 버퍼 m ② PNU 목록 ③ 행정구역(시군구 코드).

범위는 EPSG:5179 면으로 저장(변화 탐지의 bbox · 마스크). 구역선 원래 모양(line)은 '구역선 안/밖' 판정에 쓴다.
좌표계: geojson = 4326(표준) · .prj 가 있으면 그것 · .prj 가 비었거나 없으면(연속지적도) common.detect_belt_crs 로 벨트 탐지.
"""
from __future__ import annotations

import io
import json
import tempfile
import zipfile
from pathlib import Path

import geopandas as gpd
from shapely.geometry import mapping, shape
from shapely.ops import unary_union

from . import roadland_cfg, roadland_src

roadland_src()
import common as C  # noqa: E402

MAX_KM2 = 60.0


class RangeError(ValueError):
    pass


def _detect_crs(g: gpd.GeoDataFrame) -> int:
    """좌표계 없는 도형 — 경위도처럼 보이면 4326, 아니면 연속지적도 벨트 후보 중 시도 대표 경도와 맞는 것."""
    b = g.total_bounds
    if -180 <= b[0] <= 180 and -90 <= b[1] <= 90 and abs(b[2]) <= 180 and abs(b[3]) <= 90:
        return 4326
    if 700000 < b[0] < 1400000 and 1400000 < b[1] < 2200000:
        return 5179                                    # 이미 UTM-K
    from landxi_api.regions import region_of, sgg_at
    from pyproj import Transformer

    from .parcels import SIDO2
    cfg = roadland_cfg()
    cx, cy = (b[0] + b[2]) / 2, (b[1] + b[3]) / 2
    for epsg in cfg["crs"]["candidates"]:
        lon, lat = Transformer.from_crs(epsg, 4326, always_xy=True).transform(cx, cy)
        cd = sgg_at(lon, lat)
        r = region_of(cd) if cd else None
        if not r:
            continue
        sido = SIDO2.get(str(r.get("prev_cd") or r["sgg_cd"])[:2])
        if sido and C.detect_belt_crs(b, sido, cfg) == epsg:
            return epsg
    raise RangeError("좌표계를 알 수 없습니다 — 좌표계(.prj)가 있는 파일로 올려 주세요")


def read_vector(name: str, data: bytes) -> gpd.GeoDataFrame:
    """올린 파일 → GeoDataFrame(5179)."""
    low = name.lower()
    with tempfile.TemporaryDirectory() as td:
        tdp = Path(td)
        if low.endswith(".zip"):
            with zipfile.ZipFile(io.BytesIO(data)) as z:
                z.extractall(tdp)
            shp = next(iter(sorted(tdp.rglob("*.shp"))), None) or next(iter(sorted(tdp.rglob("*.gpkg"))), None) \
                or next(iter(sorted(tdp.rglob("*.geojson"))), None)
            if not shp:
                raise RangeError("압축 안에 shp · gpkg · geojson 이 없습니다")
            path = shp
        else:
            path = tdp / Path(name).name
            path.write_bytes(data)
        enc = {"encoding": "euc-kr"} if str(path).lower().endswith(".shp") and not path.with_suffix(".cpg").exists() else {}
        try:
            g = gpd.read_file(path, **enc)
        except Exception:
            g = gpd.read_file(path)
        prj = path.with_suffix(".prj")
        if str(path).lower().endswith(".shp") and (not prj.exists() or prj.stat().st_size == 0):
            g = g.set_crs(None, allow_override=True)
    g = g[g.geometry.notna() & ~g.geometry.is_empty]
    if not len(g):
        raise RangeError("도형이 없습니다")
    if g.crs is None:
        g = g.set_crs(_detect_crs(g), allow_override=True)
    return g.to_crs(5179)


def from_geojson(obj: dict) -> gpd.GeoDataFrame:
    feats = obj.get("features") if obj.get("type") == "FeatureCollection" else [{"type": "Feature", "geometry": obj.get("geometry", obj), "properties": {}}]
    g = gpd.GeoDataFrame.from_features(feats)
    if g.crs is None:
        g = g.set_crs(_detect_crs(g), allow_override=True)
    return g.to_crs(5179)


def build(line5179, buffer_m: float):
    """구역선(선 · 면) + 버퍼 → 범위 면(5179)."""
    buffer_m = max(0.0, min(float(buffer_m or 0), 1000.0))
    rng = line5179.buffer(buffer_m) if buffer_m > 0 else (line5179 if line5179.geom_type.endswith("Polygon") else line5179.buffer(5))
    rng = rng.buffer(0)
    km2 = rng.area / 1e6
    if km2 <= 0:
        raise RangeError("범위 면적이 0 입니다")
    if km2 > MAX_KM2:
        raise RangeError(f"범위가 너무 넓습니다 — {MAX_KM2:.0f}㎢ 아래로 나눠 주세요")
    return rng


def union5179(g: gpd.GeoDataFrame):
    return unary_union([x for x in g.geometry if x is not None and not x.is_empty]).buffer(0) \
        if all(t.endswith("Polygon") for t in g.geom_type) else unary_union(list(g.geometry))


def to4326(geom5179):
    import pyproj
    from shapely.ops import transform
    t = pyproj.Transformer.from_crs(5179, 4326, always_xy=True).transform
    return transform(t, geom5179)


def to5179(geom4326):
    import pyproj
    from shapely.ops import transform
    t = pyproj.Transformer.from_crs(4326, 5179, always_xy=True).transform
    return transform(t, geom4326)


def gj(geom) -> dict:
    return json.loads(json.dumps(mapping(geom)))


def geom_from(d) -> object:
    return shape(d)
