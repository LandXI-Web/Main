"""숫자 봉투(F1-CONTRACT §2) — 만들기 · 검사 · 직렬화.

모든 '보여 주는 숫자'는 {value, unit, basis, as_of, source, note?} 로만 나간다. 개발 모드(LX_DEV=1)에서
응답 JSON 에 봉투 밖 숫자가 있으면 500 envelope_missing. 구조 필드(id · 좌표 · 줌 · 분자/분모 · 페이지)는
화이트리스트로 통과시킨다.
"""
from __future__ import annotations

import datetime as dt
import json
import math
from typing import Any

from fastapi.responses import JSONResponse

from . import config

BASIS = {"measured", "estimate", "demo", "history", "inferred", "recorded"}
UNITS = {"polygons", "필지", "동", "ha", "km2", "m2", "%", "s", "gpu_s", "MiB", "GB", "chips_per_s", "ms", "count", "ratio",
         "ndvi", "°C", "W", "krw_m2", "krw", "calls", "tiles", "bytes", "features"}
KST = dt.timezone(dt.timedelta(hours=9))

# 봉투가 아니어도 되는 구조 필드(키 이름) — 계약 §2 "구조 필드"
STRUCT_KEYS = {
    "shards", "shards_total", "shards_done", "shards_failed", "priority", "position", "total", "limit", "offset",
    "minzoom", "maxzoom", "from", "to", "order", "index", "year", "soft", "hard", "features", "n_scenes", "cloud_max",
    "exp", "page", "pid", "tile_size", "queued", "running", "workers", "z", "x", "y", "n", "ms", "retry",
    "remaining_raw", "requested", "amount", "gpu", "count_raw", "version_num", "chip", "overlap", "conf", "upsample",
    "max_km2", "batch", "status", "http_status", "elapsed_s", "gpus", "bytes", "size", "zoom", "util_pct", "mem_used_mib",
    "position_in_queue", "age_s", "ttl_s", "iou", "min_conf", "lanes_total", "seq", "attempt", "gsd_m", "gsd_trained_m",
    "expires_in_s", "cpu", "raw_routes", "gpu_index", "imgsz", "seconds", "chips",
}
# 이 키 아래 서브트리는 통째로 데이터(좌표·속성·요청 본문 되돌림)
STRUCT_SUBTREES = {"coordinates", "bbox", "bounds", "geometry", "aoi", "footprint", "counts", "params", "options", "detail",
                   "properties", "infer_shape", "aoi_centroid", "center", "classes", "window", "items_raw", "compose",
                   "gpu_indices", "gpus_measured", "dims_raw", "ladder", "lnglat"}


def now_iso() -> str:
    return dt.datetime.now(KST).isoformat(timespec="seconds")


def today() -> str:
    return dt.datetime.now(KST).date().isoformat()


def env(value, unit: str, basis: str, source: str, note: str | None = None, as_of: str | None = None) -> dict:
    assert basis in BASIS, basis
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        value = None
    e = {"value": value, "unit": unit, "basis": basis, "as_of": as_of or now_iso(), "source": source}
    if note:
        e["note"] = note
    return e


def is_env(o: Any) -> bool:
    return isinstance(o, dict) and "value" in o and isinstance(o.get("unit"), str) and o.get("basis") in BASIS \
        and isinstance(o.get("as_of"), str) and isinstance(o.get("source"), str)


class EnvelopeMissing(Exception):
    def __init__(self, path: str, value: Any):
        super().__init__(path)
        self.path = path
        self.value = value


def scan(o: Any, path: str = "$", key: str | None = None) -> None:
    """봉투 밖 숫자를 찾으면 EnvelopeMissing."""
    if isinstance(o, bool) or o is None or isinstance(o, str):
        return
    if isinstance(o, (int, float)):
        if key in STRUCT_KEYS:
            return
        raise EnvelopeMissing(path, o)
    if isinstance(o, dict):
        if is_env(o):
            v = o["value"]
            if not (v is None or isinstance(v, (int, float, list, dict))):
                raise EnvelopeMissing(path + ".value", v)
            return
        for k, v in o.items():
            if k in STRUCT_SUBTREES:
                continue
            scan(v, f"{path}.{k}", k)
        return
    if isinstance(o, (list, tuple)):
        for i, v in enumerate(o):
            scan(v, f"{path}[{i}]", key)   # 리스트 원소는 부모 키를 물려받는다(예: shards_total 목록은 없음 · workers 문자열)


def _default(o):
    if isinstance(o, (dt.datetime, dt.date)):
        if isinstance(o, dt.datetime) and o.tzinfo is None:
            o = o.replace(tzinfo=KST)
        return o.astimezone(KST).isoformat(timespec="seconds") if isinstance(o, dt.datetime) else o.isoformat()
    try:
        import decimal
        if isinstance(o, decimal.Decimal):
            return float(o)
    except Exception:  # pragma: no cover
        pass
    if hasattr(o, "tolist"):
        return o.tolist()
    raise TypeError(type(o))


def dumps(o) -> bytes:
    return json.dumps(o, ensure_ascii=False, default=_default, separators=(",", ":")).encode("utf-8")


class LXJSON(JSONResponse):
    """기본 응답 클래스 — 직렬화 전에 봉투 검사(개발 모드)."""
    media_type = "application/json"
    check = True

    def render(self, content) -> bytes:
        raw = dumps(content)
        if config.DEV and self.check and self.status_code < 400:
            parsed = json.loads(raw)
            try:
                scan(parsed)
            except EnvelopeMissing as e:
                self.status_code = 500
                return dumps({"error": {"code": "envelope_missing", "message": f"봉투 없는 숫자: {e.path} = {e.value!r}",
                                        "detail": {"path": e.path}}, "request_id": "req_env"})
        return raw


class RawJSON(LXJSON):
    """GeoJSON 등 데이터 본문 — 봉투 검사를 'lx' 메타 블록에만 적용."""
    check = False
