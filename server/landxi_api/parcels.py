"""필지 조회(F1-CONTRACT §4.5) — P8 `parcels/namwon-parcels.pmtiles` 를 서버에서 pmtiles 파이썬으로 읽어 점-면 판정.

V-World 연속지적(Data API) 권한 반영 전의 대체 소스(국토정보기본도 2.0 · 2021-12). 카드에 기준 시점을 반드시 싣는다.
z17 타일(MVT extent 4096)에서 판정 — 경계 근처 수 cm 오차 가능(MVT 양자화 · 4096/타일 ≈ 7.5cm@35°N).
"""
from __future__ import annotations

import gzip
import math
import threading
from functools import lru_cache

from fastapi import APIRouter, Request
from shapely.geometry import Point, shape
from starlette.concurrency import run_in_threadpool

from . import config
from .deps import ApiError
from .envelope import env

router = APIRouter()
PATH = config.DATA_ROOT / "parcels" / "namwon-parcels.pmtiles"
Z = 17
_lock = threading.Lock()
_reader = None


def _get_reader():
    global _reader
    if _reader is None:
        from pmtiles.reader import MmapSource, Reader
        f = open(PATH, "rb")
        _reader = Reader(MmapSource(f))
    return _reader


@lru_cache(maxsize=512)
def _tile(z: int, x: int, y: int):
    import mapbox_vector_tile
    with _lock:
        data = _get_reader().get(z, x, y)
    if not data:
        return None
    if data[:2] == b"\x1f\x8b":
        data = gzip.decompress(data)
    return mapbox_vector_tile.decode(data, default_options={"y_coord_down": True})


def _lookup(lng: float, lat: float):
    n = 2 ** Z
    xf = (lng + 180) / 360 * n
    yf = (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n
    x, y = int(xf), int(yf)
    t = _tile(Z, x, y)
    if not t or "parcels" not in t:
        return None
    lyr = t["parcels"]
    ext = lyr.get("extent", 4096)
    px, py = (xf - x) * ext, (yf - y) * ext
    pt = Point(px, py)
    for f in lyr["features"]:
        g = f["geometry"]
        if g["type"] not in ("Polygon", "MultiPolygon"):
            continue
        try:
            if shape(g).buffer(0).contains(pt):
                return f["properties"]
        except Exception:
            continue
    return None


@router.get("/parcels")
async def parcels(lng: float, lat: float, request: Request):
    if not PATH.exists():
        raise ApiError("parcels_unavailable", "P8 필지 PMTiles 없음")
    props = await run_in_threadpool(_lookup, lng, lat)
    if not props:
        raise ApiError("not_found", "이 지점에 필지 없음(남원시 밖이거나 도로·하천 경계)", {"lng": lng, "lat": lat})
    src = "reference/parcels-namwon"
    area = props.get("area_m2")
    price = props.get("price_krw_m2")
    return {"pnu": props.get("pnu"), "jibun": props.get("jibun"), "jimok": props.get("jimok"),
            "area_m2": env(float(area) if area is not None else None, "m2", "measured", "국토정보기본도 2.0 PAREA", as_of="2021-12"),
            "price_krw_m2": env(int(price) if price not in (None, "") else None, "krw_m2", "measured",
                                f"국토정보기본도 2.0 JIGA_ILP(공시지가 {props.get('price_year') or '2021'})", as_of="2021-12"),
            "owner_kind": props.get("owner_kind"), "emd": props.get("emd"), "emd_cd": props.get("emd_cd"), "ri": props.get("ri"),
            "road": props.get("road"), "source": src, "as_of": "2021-12",
            "note": "V-World 연속지적 권한 반영 전 대체 소스 · MVT z17 판정"}
