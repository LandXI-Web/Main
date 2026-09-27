"""프록시(F1-CONTRACT §4.3) — 키는 서버에만.

V-World: /proxy/vworld/{wmts|wms|data|search|address} — 키·domain 주입 · 디스크 캐시 cache/vworld/ · 일일 계량(Redis).
  키가 비었거나 V-World 가 키 오류(EXPIRE_KEY · INVALID_KEY · 권한 미반영 …)를 주면 503 vworld_key_pending.
  키가 아닌 오류(status ERROR · PARAM_REQUIRED 등 · 200 으로 옴)는 캐시하지 않고 502 upstream_error(v1.1 · F1-B must_fix 4).
  상태는 60s 동안 기억(연타 방지) — server/.env 의 키가 바뀌면 즉시 다시 시도(키 살아나면 바로 활성).
Planetary Computer: mosaic/register(30일) · statistics(7일) · stac/search(6h) 대리 + 캐시. 타일은 CORS * 이라 브라우저 직통.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import re
import time
from pathlib import Path
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import Response

from . import config
from .deps import ApiError, principal, redis
from .envelope import KST

router = APIRouter()
VW = "https://api.vworld.kr/req"
PC = "https://planetarycomputer.microsoft.com/api"
TTL = {"wmts": 30 * 86400, "wms": 30 * 86400, "data": 7 * 86400, "search": 86400, "address": 86400}
KEY_ERR = re.compile(r"(KEY|AUTH|PERMISSION|NOT_ALLOW|UNAUTHORIZED|DOMAIN)", re.I)
_state = {"pending_until": 0.0, "key_sig": None, "last_error": None}

# 테스트가 바꿔 끼운다(httpx.MockTransport)
transport: httpx.AsyncBaseTransport | None = None


def cache_root() -> Path:
    return config.DATA_ROOT / "cache"


def vworld_key() -> tuple[str, str]:
    env = config._load_env()
    return env.get("VWORLD_KEY", "") or "", env.get("VWORLD_DOMAIN", "") or ""


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=20, transport=transport, headers={"User-Agent": "LandXI-gateway/0.1"})


def _cache_paths(ns: str, key: str) -> tuple[Path, Path]:
    h = hashlib.sha1(key.encode()).hexdigest()
    d = cache_root() / ns / h[:2]
    return d / (h + ".bin"), d / (h + ".json")


def cache_get(ns: str, key: str, ttl: int):
    b, m = _cache_paths(ns, key)
    if b.exists() and m.exists():
        meta = json.loads(m.read_text(encoding="utf-8"))
        if time.time() - meta["t"] < ttl:
            return b.read_bytes(), meta
    return None, None


def cache_put(ns: str, key: str, body: bytes, ctype: str, extra: dict | None = None):
    b, m = _cache_paths(ns, key)
    b.parent.mkdir(parents=True, exist_ok=True)
    b.write_bytes(body)
    m.write_text(json.dumps({"t": time.time(), "ctype": ctype, "key": key[:300], **(extra or {})}, ensure_ascii=False), encoding="utf-8")


_RAW_STATUS_ERR = re.compile(rb'"status"\s*:\s*"ERROR"')
_RAW_CODE = re.compile(rb'"code"\s*:\s*"([A-Za-z0-9_]+)"')


def _raw_status_error(body: bytes) -> str | None:
    """JSON 파싱과 무관하게 원문 바이트에서 `"status" : "ERROR"` 를 찾는다 → 오류 코드(없으면 'ERROR')."""
    head = body[:8000]
    if not _RAW_STATUS_ERR.search(head):
        return None
    m = _RAW_CODE.search(head)
    return m.group(1).decode("ascii", "replace") if m else "ERROR"


def _key_error(body: bytes, ctype: str) -> str | None:
    """V-World 응답에서 키 오류 코드를 찾는다(200 으로 오는 오류 포함)."""
    head = body[:4000]
    if "json" in ctype or head.strip()[:1] in (b"{", b"["):
        try:
            j = json.loads(body.decode("utf-8", "replace"))
            resp = j.get("response", j)
            if str(resp.get("status", "")).upper() == "ERROR":
                code = (resp.get("error") or {}).get("code") or "ERROR"
                return code if KEY_ERR.search(code) else None
            return None
        except Exception:
            # V-World 는 text 안의 따옴표를 이스케이프하지 않아 JSON 이 깨진 채로 온다 → 원문 바이트로 판정
            st = _raw_status_error(body)
            return st if (st and KEY_ERR.search(st)) else None
    if b"ExceptionReport" in head or b"ServiceException" in head:
        txt = head.decode("euc-kr", "replace")
        if 'locator="key"' in txt or "인증키" in txt or "key" in txt.lower():
            return "KEY_EXCEPTION"
    if re.match(rb"^\s*[\w$.]+\(", head):   # JSONP
        m = re.search(rb'"code"\s*:\s*"([A-Z_]+)"', head)
        if m and KEY_ERR.search(m.group(1).decode()):
            return m.group(1).decode()
    return None


def upstream_status_error(body: bytes, ctype: str) -> str | None:
    """키 오류가 아닌 V-World 오류(PARAM_REQUIRED · INVALID_RANGE …)를 200 본문에서 찾는다 → 캐시 금지 · 502(F1-B must_fix 4)."""
    head = body[:4000]
    if "json" in ctype or head.strip()[:1] in (b"{", b"["):
        try:
            j = json.loads(body.decode("utf-8", "replace"))
            resp = j.get("response", j) if isinstance(j, dict) else {}
            if str(resp.get("status", "")).upper() == "ERROR":
                e = resp.get("error") or {}
                return (e.get("code") or "ERROR") + (f" · {e.get('text') or e.get('message')}" if (e.get("text") or e.get("message")) else "")
            return None
        except Exception:
            # json.loads 실패(예: INVALID_RANGE 본문 text 안의 `단일검색="Y"` 따옴표) — 원문 바이트 정규식으로 판정.
            # 여기서 None 을 돌려주면 ERROR 가 7일 캐시되고 200·hit 로 재전송된다(F2-B 1차 판정 불합격 1).
            return _raw_status_error(body)
    st = _raw_status_error(body)        # JSONP 등 JSON 이 아닌 포장
    if st:
        return st
    if b"ExceptionReport" in head or b"ServiceException" in head:
        return "OWS_EXCEPTION"
    return None


def _pending(msg: str, detail: dict | None = None):
    raise ApiError("vworld_key_pending", msg, detail, status=503)


async def _meter(request: Request):
    p = principal(request)
    r = await redis()
    k = f"vworld:calls:{p.tenant_id or ('lx' if p.is_lx else 'public')}:{dt.datetime.now(KST).date().isoformat()}"
    await r.incr(k)
    await r.expire(k, 3 * 86400)


def _upstream_url(kind: str, q: dict, key: str, domain: str) -> str:
    q = {k: v for k, v in q.items() if k not in ("key", "domain", "access_token")}
    if kind == "wmts":
        layer, z, y, x, ext = q.get("layer", "Satellite"), q["z"], q["y"], q["x"], q.get("ext", "jpeg")
        return f"{VW}/wmts/1.0.0/{key}/{layer}/{z}/{y}/{x}.{ext}"
    base = {"wms": "wms", "data": "data", "search": "search", "address": "address"}[kind]
    q2 = {**q, "key": key}
    if domain:
        q2["domain"] = domain
    return f"{VW}/{base}?{urlencode(q2)}"


@router.get("/proxy/vworld/{kind}")
async def vworld(kind: str, request: Request):
    if kind not in TTL:
        raise ApiError("not_found", "wmts|wms|data|search|address")
    q = dict(request.query_params)
    ck = kind + "?" + urlencode(sorted((k, v) for k, v in q.items() if k not in ("access_token",)))
    body, meta = cache_get("vworld", ck, TTL[kind])
    if body is not None and upstream_status_error(body, meta["ctype"]):
        for f in _cache_paths("vworld", ck):           # 예전(v1.0)에 캐시된 ERROR 본문 — 지우고 상류를 다시 부른다
            f.unlink(missing_ok=True)
        body = None
    if body is not None:
        return Response(content=body, media_type=meta["ctype"], headers={"X-LX-Cache": "hit", "Access-Control-Allow-Origin": "*"})
    key, domain = vworld_key()
    if not key:
        _pending("V-World 키 권한 반영 대기", {"reason": "server/.env VWORLD_KEY 비어 있음"})
    sig = hashlib.sha1((key + "|" + domain).encode()).hexdigest()
    if sig != _state["key_sig"]:
        _state.update(key_sig=sig, pending_until=0.0)
    if time.time() < _state["pending_until"]:
        _pending("V-World 키 권한 반영 대기", {"last_error": _state["last_error"], "retry_after_s": int(_state["pending_until"] - time.time())})
    url = _upstream_url(kind, q, key, domain)
    async with _client() as c:
        try:
            r = await c.get(url, headers={"Referer": f"http://{domain}" if domain else "http://localhost"})
        except httpx.HTTPError as e:
            raise ApiError("upstream_error", f"V-World 연결 실패: {type(e).__name__}", status=502)
    ctype = r.headers.get("content-type", "application/octet-stream")
    err = _key_error(r.content, ctype)
    await _meter(request)
    if err:
        _state.update(pending_until=time.time() + 60, last_error=err)
        _pending("V-World 키 권한 반영 대기", {"upstream_code": err})
    if r.status_code != 200:
        raise ApiError("upstream_error", f"V-World HTTP {r.status_code}", status=502)
    _state.update(pending_until=0.0, last_error=None)
    uerr = upstream_status_error(r.content, ctype)
    if uerr:          # 키는 살아 있으나 요청 오류 — 캐시하지 않는다(7일 hit 로 굳지 않게)
        raise ApiError("upstream_error", f"V-World status ERROR: {uerr}", {"upstream_code": uerr.split(" · ")[0], "cached": False,
                                                                          "upstream_body": r.content[:300].decode("utf-8", "replace")}, status=502)
    cache_put("vworld", ck, r.content, ctype)
    return Response(content=r.content, media_type=ctype, headers={"X-LX-Cache": "miss", "Access-Control-Allow-Origin": "*"})


# ── Planetary Computer ────────────────────────────────────────────────────────
async def _pc(method: str, url: str, body: bytes | None, ns: str, ttl: int, ck: str) -> Response:
    cb, meta = cache_get(ns, ck, ttl)
    if cb is not None:
        return Response(content=cb, media_type=meta["ctype"], headers={"X-LX-Cache": "hit"})
    async with _client() as c:
        try:
            r = await c.request(method, url, content=body, headers={"content-type": "application/json"} if body else None)
        except httpx.HTTPError as e:
            raise ApiError("upstream_error", f"PC 연결 실패: {type(e).__name__}", status=502)
    if r.status_code >= 400:
        raise ApiError("upstream_error", f"PC HTTP {r.status_code}", {"body": r.text[:300]}, status=502)
    ctype = r.headers.get("content-type", "application/json")
    cache_put(ns, ck, r.content, ctype)
    return Response(content=r.content, media_type=ctype, headers={"X-LX-Cache": "miss"})


@router.post("/proxy/pc/mosaic/register")
async def pc_register(request: Request):
    body = await request.body()
    return await _pc("POST", f"{PC}/data/v1/mosaic/register", body, "pc/register", 30 * 86400, "register:" + body.decode("utf-8", "replace"))


@router.post("/proxy/pc/statistics")
async def pc_statistics(request: Request, collection: str, item: str):
    body = await request.body()
    qs = urlencode({"collection": collection, "item": item, **{k: v for k, v in request.query_params.items() if k not in ("collection", "item")}})
    url = f"{PC}/data/v1/item/statistics?{qs}"
    return await _pc("POST" if body else "GET", url, body or None, "pc/statistics", 7 * 86400, "stats:" + qs + "|" + body.decode("utf-8", "replace"))


@router.get("/proxy/pc/stac/search")
async def pc_search(request: Request):
    q = dict(request.query_params)
    body = {"collections": q.get("collections", "sentinel-2-l2a").split(",")}
    if q.get("bbox"):
        body["bbox"] = [float(v) for v in q["bbox"].split(",")]
    if q.get("datetime"):
        body["datetime"] = q["datetime"]
    if q.get("query"):
        m = re.match(r"([\w:]+)\s*(<=|>=|<|>|=)\s*([\d.]+)", q["query"])
        if m:
            op = {"<": "lt", "<=": "lte", ">": "gt", ">=": "gte", "=": "eq"}[m.group(2)]
            body["query"] = {m.group(1): {op: float(m.group(3))}}
    body["limit"] = int(q.get("limit", 100))
    raw = json.dumps(body, sort_keys=True).encode()
    return await _pc("POST", f"{PC}/stac/v1/search", raw, "pc/search", 6 * 3600, "search:" + raw.decode())
