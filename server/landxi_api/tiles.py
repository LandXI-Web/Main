"""타일 · 파일(F1-CONTRACT §4.2 · §8).

  GET /tiles/pmtiles/{set}.pmtiles   Range 206 · Accept-Ranges · ETag. 공용(imagery/reference/terrain/vector/results/lx/*) 무서명,
                                     results/{tenant≠lx}/* 와 demo/* 는 서명(exp·sig) 필수 → 없으면 403.
  GET /tiles/xyz/{folder}/{z}/{x}/{y}.webp   LX_DATA_ROOT/tiles/{folder}/… · 없는 타일 204.
  GET /tiles/cog/{imagery_id}/{z}/{x}/{y}.webp   lx 전용 · rasterio 직접 렌더(TiTiler 대체 · COG 있으면 COG, 없으면 원본 창 + 재투영) · 디스크 캐시.
  GET /tiles/sign?set=               HMAC-SHA256 · exp 12h.
  GET /files/models/{path}           lx 전용 · LX_DATA_ROOT/models/…
"""
from __future__ import annotations

import hashlib
import hmac
import math
import mimetypes
import os
import threading
import time
from pathlib import Path

import numpy as np
from fastapi import APIRouter, Request
from fastapi.responses import Response
from starlette.concurrency import run_in_threadpool

from . import config
from .catalog import base_of, canonical_set, layer_items, pm_url, rebase, resolve_set_path, restricted_set, set_tenant
from .deps import ApiError, db, principal, require
from .envelope import KST

router = APIRouter()
SIGN_TTL = 12 * 3600
CHUNK = 1 << 20


def sign(set_id: str, exp: int) -> str:
    return hmac.new(config.SESSION_SECRET, f"{set_id}|{exp}".encode(), hashlib.sha256).hexdigest()[:40]


def verify(set_id: str, exp: str | None, sig: str | None) -> bool:
    if not exp or not sig:
        return False
    try:
        e = int(exp)
    except ValueError:
        return False
    return e > time.time() and hmac.compare_digest(sign(set_id, e), sig)


def lx_only_set(set_id: str) -> bool:
    # 등록 영상에서 구운 세트(imagery/img-* · p16)는 원본급 자체 영상 → LX 세션 전용 서명 세트
    return set_id in (config.load_yaml("sets").get("signed_sets") or []) or set_id.startswith("imagery/img-")


def needs_signature(set_id: str) -> bool:
    # 공개 아닌 이름 있는 세트(restricted_set — 기관 서비스 결과와 같은 파일 · 영상 조각 · 필지)도 서명(10-22 옆문 닫기:
    # 기관 별칭은 403 인데 같은 파일의 results/lx/* 이름으로는 서명 없이 받아지던 것)
    t = set_tenant(set_id)
    return (t is not None and t != "lx") or set_id.startswith("demo/") or lx_only_set(set_id) or restricted_set(set_id)


def sign_exp() -> int:
    # 만료를 6시간 칸에 맞춘다(12~18시간) — 같은 칸 안에서는 서명 주소가 같아 브라우저 보관이 이어진다(impl-20 ximap-speed)
    return (int(time.time()) + SIGN_TTL) // 21600 * 21600 + 21600


def _range_response(path: Path, request: Request, content_type: str) -> Response:
    st = path.stat()
    size = st.st_size
    etag = f'"{size:x}-{int(st.st_mtime):x}"'
    base = {"Accept-Ranges": "bytes", "ETag": etag, "Cache-Control": "public, max-age=300", "Content-Type": content_type}
    rng = request.headers.get("range")
    if request.headers.get("if-none-match") == etag and not rng:
        return Response(status_code=304, headers=base)
    if request.method == "HEAD":
        return Response(status_code=200, headers={**base, "Content-Length": str(size)})
    if rng and rng.startswith("bytes="):
        a, _, b = rng[6:].split(",")[0].partition("-")
        if a == "":
            start = max(size - int(b), 0)
            end = size - 1
        else:
            start = int(a)
            end = min(int(b), size - 1) if b else size - 1
        if start >= size or start > end:
            return Response(status_code=416, headers={**base, "Content-Range": f"bytes */{size}"})
        with open(path, "rb") as f:
            f.seek(start)
            data = f.read(end - start + 1)
        return Response(content=data, status_code=206, headers={**base, "Content-Range": f"bytes {start}-{end}/{size}"})
    with open(path, "rb") as f:
        data = f.read()
    return Response(content=data, status_code=200, headers=base)


@router.api_route("/tiles/pmtiles/{set_path:path}", methods=["GET", "HEAD"])
async def pmtiles(set_path: str, request: Request, exp: str | None = None, sig: str | None = None):
    if not set_path.endswith(".pmtiles"):
        raise ApiError("not_found", "pmtiles 경로 아님")
    set_id = set_path[: -len(".pmtiles")]
    if needs_signature(set_id) and not verify(set_id, exp, sig):
        raise ApiError("forbidden", "서명 없는 기관 결과 세트", {"set": set_id})
    rel = resolve_set_path(set_id)
    if not rel:
        raise ApiError("not_found", f"set {set_id} 없음")
    path = config.DATA_ROOT / rel
    if not path.exists():
        raise ApiError("not_found", f"{rel} 파일 없음(산출 전)", {"set": set_id})
    return await run_in_threadpool(_range_response, path, request, "application/octet-stream")


# ── 결과 지도 조각(벡터 · 한 조각 = 한 요청 · 판 번호 주소 · impl-20 ximap-speed) ─────────────────────
# PMTiles 를 브라우저가 Range 로 직접 읽으면(1) Windows 크롬에서 pmtiles 라이브러리가 보관을 끈다(no-store) → 다시 와도 매번 터널로 다시 받고
# (2) 조각 하나에 디렉터리 읽기까지 여러 요청이 든다. 그래서 서버가 조각을 꺼내 한 요청으로 내준다.
#   GET /tiles/mvt/{set}/{z}/{x}/{y}.pbf?v=<판>[&exp&sig]
#   판 = 결과 파일의 크기 · 고친 시각 지문(tile_ver) — 파일을 다시 구우면 판이 바뀌어 주소가 바뀐다. 판이 맞으면 1년 보관(immutable),
#   판이 다르면(옛 주소) 지금 내용을 보관 없이(no-cache) 내준다. 그 자리 고치기는 조각을 바꾸지 않고 /ximap/edits 층(no-store)으로 보인다.
#   얕은 줌(≤ SLIM_Z)은 화면이 쓰는 속성(id · cls)만 남겨 조각을 줄인다(도형은 그대로 · 누르면 /ximap/feature 가 원래 속성을 준다).
SLIM_Z = 12
SLIM_KEEP = {"id", "cls"}
_PM_DIR: dict = {}          # (path, ver, offset, length) → 디렉터리
_PM_TILE: dict = {}         # (set, ver, z, x, y) → 내줄 바이트(gzip) · 작은 LRU
_PM_TILE_MAX = 64 << 20
_pm_lock = threading.Lock()


def tile_ver(path: Path) -> str | None:
    try:
        st = path.stat()
    except OSError:
        return None
    return hashlib.sha1(f"{st.st_size}-{st.st_mtime_ns}".encode()).hexdigest()[:10]


def set_tile_ver(set_id: str) -> str | None:
    rel = resolve_set_path(set_id)
    return tile_ver(config.DATA_ROOT / rel) if rel else None


def _read(path: Path, off: int, n: int) -> bytes:
    with open(path, "rb") as f:            # 열어 둔 채로 두지 않는다(Windows 에서 결과 파일을 다시 구울 때 막히지 않게)
        f.seek(off)
        return f.read(n)


def _pm_get(path: Path, ver: str, z: int, x: int, y: int) -> tuple[bytes | None, int]:
    from pmtiles.tile import deserialize_directory, deserialize_header, find_tile, zxy_to_tileid
    hk = (str(path), ver, "h")
    h = _PM_DIR.get(hk)
    if h is None:
        h = _PM_DIR[hk] = deserialize_header(_read(path, 0, 127))
    if z < h["min_zoom"] or z > h["max_zoom"]:
        return None, h["tile_compression"].value
    tid = zxy_to_tileid(z, x, y)
    off, ln = h["root_offset"], h["root_length"]
    for _ in range(4):
        dk = (str(path), ver, off, ln)
        d = _PM_DIR.get(dk)
        if d is None:
            d = deserialize_directory(_read(path, off, ln))
            if len(_PM_DIR) > 4000:
                _PM_DIR.clear()
            _PM_DIR[dk] = d
        e = find_tile(d, tid)
        if not e:
            return None, h["tile_compression"].value
        if e.run_length > 0:
            return _read(path, h["tile_data_offset"] + e.offset, e.length), h["tile_compression"].value
        off, ln = h["leaf_directory_offset"] + e.offset, e.length
    return None, h["tile_compression"].value


def _varint(b, i):
    r = s = 0
    while True:
        c = b[i]
        i += 1
        r |= (c & 0x7F) << s
        s += 7
        if c < 0x80:
            return r, i


def _wv(n: int) -> bytes:
    out = bytearray()
    while True:
        c = n & 0x7F
        n >>= 7
        if n:
            out.append(c | 0x80)
        else:
            out.append(c)
            return bytes(out)


def _fields(b):
    i, n = 0, len(b)
    while i < n:
        k, i = _varint(b, i)
        f, w = k >> 3, k & 7
        j = i
        if w == 0:
            _, i = _varint(b, i)
        elif w == 2:
            ln, j = _varint(b, i)
            i = j + ln
        elif w == 5:
            i += 4
        elif w == 1:
            i += 8
        else:
            raise ValueError("wire")
        yield f, w, b[j:i] if w == 2 else b[j:i], k


def _ld(f: int, payload: bytes) -> bytes:
    return _wv((f << 3) | 2) + _wv(len(payload)) + payload


def slim_mvt(raw: bytes, keep=SLIM_KEEP) -> bytes:
    """MVT 조각에서 keep 속성만 남긴다(도형 · 층 · 판 그대로). 쓰지 않는 값은 값 표에서 뺀다."""
    out = bytearray()
    for f, w, payload, k in _fields(raw):
        if f != 3:
            out += _wv(k) + (_wv(len(payload)) + payload if w == 2 else payload)
            continue
        keys, vals, feats, other = [], [], [], []
        for lf, lw, lp, lk in _fields(payload):
            if lf == 3:
                keys.append(bytes(lp))
            elif lf == 4:
                vals.append(bytes(lp))
            elif lf == 2:
                feats.append(lp)
            else:
                other.append(_wv(lk) + (_wv(len(lp)) + lp if lw == 2 else lp))
        names = []
        for kb in keys:
            names.append(kb.decode("utf-8", "replace"))
        kmap = {i: n for i, n in enumerate(names) if n in keep}
        nk, nv, vmap, kidx = [], [], {}, {}
        lay = bytearray().join(other)
        fb = bytearray()
        for fp in feats:
            nf = bytearray()
            for ff, fw, fpp, fk in _fields(fp):
                if ff == 2:                          # 속성(packed key/value 번호 쌍)
                    nums, i = [], 0
                    while i < len(fpp):
                        v, i = _varint(fpp, i)
                        nums.append(v)
                    tags = bytearray()
                    for a in range(0, len(nums) - 1, 2):
                        ki, vi = nums[a], nums[a + 1]
                        if ki not in kmap:
                            continue
                        if ki not in kidx:
                            kidx[ki] = len(nk)
                            nk.append(keys[ki])
                        if vi not in vmap:
                            vmap[vi] = len(nv)
                            nv.append(vals[vi])
                        tags += _wv(kidx[ki]) + _wv(vmap[vi])
                    if tags:
                        nf += _ld(2, bytes(tags))
                else:
                    nf += _wv(fk) + (_wv(len(fpp)) + fpp if fw == 2 else fpp)
            fb += _ld(2, bytes(nf))
        lay += fb
        for kb in nk:
            lay += _ld(3, kb)
        for vb in nv:
            lay += _ld(4, vb)
        out += _ld(3, bytes(lay))
    return bytes(out)


_SLIM_Q: "set[tuple]" = set()


def _slim_dir(set_id: str, ver: str) -> Path:
    return config.DATA_ROOT / "cache" / "mvt" / f"{hashlib.sha1(set_id.encode()).hexdigest()[:8]}-{ver}"


def _remember(key, data: bytes | None) -> None:
    with _pm_lock:
        _PM_TILE[key] = data or b""
        if sum(len(v) for v in _PM_TILE.values()) > _PM_TILE_MAX:
            for k in list(_PM_TILE)[: len(_PM_TILE) // 2]:
                _PM_TILE.pop(k, None)


def _slim_job(key, path: Path) -> None:
    """얕은 줌 조각을 줄여 디스크(cache/mvt)와 메모리에 둔다 — 뒤에서 한 번(첫 요청은 기다리게 하지 않는다)."""
    import gzip
    set_id, ver, z, x, y = key
    try:
        data, comp = _pm_get(path, ver, z, x, y)
        if data:
            raw = gzip.decompress(data) if comp == 2 else data
            out = gzip.compress(slim_mvt(raw), 6, mtime=0)
            d = _slim_dir(set_id, ver)
            d.mkdir(parents=True, exist_ok=True)
            tmp = d / f"{z}-{x}-{y}.gz.tmp"
            tmp.write_bytes(out)
            os.replace(tmp, d / f"{z}-{x}-{y}.gz")
            _remember(key, out)
    except Exception:  # noqa: BLE001 — 줄이지 못하면 원래 조각을 계속 쓴다
        pass
    finally:
        _SLIM_Q.discard(key)


_slim_pool = None


def _mvt_bytes(set_id: str, path: Path, ver: str, z: int, x: int, y: int) -> bytes | None:
    """내줄 조각(gzip). 얕은 줌은 줄인 것(디스크 보관)이 있으면 그것, 없으면 원래 조각을 바로 내주고 뒤에서 줄여 둔다."""
    global _slim_pool
    import gzip
    key = (set_id, ver, z, x, y)
    hit = _PM_TILE.get(key)
    if hit is not None:
        return hit or None
    if z <= SLIM_Z:
        f = _slim_dir(set_id, ver) / f"{z}-{x}-{y}.gz"
        if f.exists():
            out = f.read_bytes()
            _remember(key, out)
            return out
    data, comp = _pm_get(path, ver, z, x, y)
    if data and comp != 2:
        data = gzip.compress(data, 6, mtime=0)
    if data and z <= SLIM_Z and key not in _SLIM_Q:
        from concurrent.futures import ThreadPoolExecutor
        if _slim_pool is None:
            _slim_pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="mvt-slim")
        _SLIM_Q.add(key)
        _slim_pool.submit(_slim_job, key, path)
        return data                      # 메모리에 두지 않는다 — 다음 요청은 줄인 것을
    _remember(key, data)
    return data or None


@router.get("/tiles/mvt/{set_path:path}/{z}/{x}/{y}.pbf")
async def mvt(set_path: str, z: int, x: int, y: int, v: str | None = None, exp: str | None = None, sig: str | None = None):
    set_id = set_path
    if needs_signature(set_id) and not verify(set_id, exp, sig):
        raise ApiError("forbidden", "서명 없는 기관 결과 세트", {"set": set_id})
    if set_id.startswith("cog/") or lx_only_set(set_id):
        raise ApiError("not_found", "벡터 결과 세트가 아님")
    rel = resolve_set_path(set_id)
    if not rel:
        raise ApiError("not_found", f"set {set_id} 없음")
    path = config.DATA_ROOT / rel
    ver = tile_ver(path)
    if not ver:
        raise ApiError("not_found", f"{rel} 파일 없음(산출 전)", {"set": set_id})
    scope = "private" if needs_signature(set_id) else "public"
    cache = f"{scope}, max-age=31536000, immutable" if v == ver else "no-cache"
    hdr = {"Cache-Control": cache, "ETag": f'"{ver}-{z}-{x}-{y}"', "X-LX-Ver": ver}
    data = await run_in_threadpool(_mvt_bytes, set_id, path, ver, z, x, y)
    if not data:
        return Response(status_code=204, headers=hdr)
    return Response(content=data, media_type="application/x-protobuf", headers={**hdr, "Content-Encoding": "gzip"})


@router.get("/tiles/xyz/{folder}/{z}/{x}/{y}.webp")
async def xyz(folder: str, z: int, x: int, y: int, exp: str | None = None, sig: str | None = None):
    if "/" in folder or ".." in folder:
        raise ApiError("not_found")
    if needs_signature(f"imagery/{folder}") and not verify(f"imagery/{folder}", exp, sig):   # 공개 아닌 영상 낱장(10-22 옆문 닫기)
        raise ApiError("forbidden", "서명 없는 영상 조각", {"set": f"imagery/{folder}"})
    p = config.DATA_ROOT / "tiles" / folder / str(z) / str(x) / f"{y}.webp"
    if not p.exists():
        return Response(status_code=204)
    return Response(content=p.read_bytes(), media_type="image/webp", headers={"Cache-Control": "public, max-age=86400"})


@router.get("/tiles/xyz/public/{set_name}/{z}/{x}/{y}.{ext}")
async def xyz_public(set_name: str, z: int, x: int, y: int, ext: str):
    """공개 타일 폴더(S-4 · 서명 면제) — LX_DATA_ROOT/tiles/public/{set}/ · 공개 결과(시군구 집계 등)만 둔다. 원본 영상 0."""
    if "/" in set_name or ".." in set_name or ext not in ("pbf", "mvt", "webp", "png"):
        raise ApiError("not_found")
    p = config.DATA_ROOT / "tiles" / "public" / set_name / str(z) / str(x) / f"{y}.{ext}"
    if not p.exists():
        return Response(status_code=204)
    mt = {"pbf": "application/x-protobuf", "mvt": "application/vnd.mapbox-vector-tile", "webp": "image/webp", "png": "image/png"}[ext]
    return Response(content=p.read_bytes(), media_type=mt, headers={"Cache-Control": "public, max-age=86400"})


@router.get("/files/public/{name}")
async def files_public(name: str):
    """공개 파일(S-6 카드 크롭 등 · 서명 면제) — LX_DATA_ROOT/tiles/public/files/ 의 이미지만."""
    if "/" in name or ".." in name or not name.lower().endswith((".webp", ".png", ".jpg")):
        raise ApiError("not_found")
    p = config.DATA_ROOT / "tiles" / "public" / "files" / name
    if not p.exists():
        raise ApiError("not_found", "파일 없음")
    mt = "image/webp" if name.endswith(".webp") else "image/png" if name.endswith(".png") else "image/jpeg"
    return Response(content=p.read_bytes(), media_type=mt, headers={"Cache-Control": "public, max-age=86400"})


async def require_cog_scope(p, iid: str):
    """동적 타일 서명(기관) — LX 관리자가 이 기관에 공유한 영상(imagery_shares)이고, 그 영상이 이 기관 관할 안(소유 시군구 · 범위 — 공유할 때와 같은 판정)일 때만.
    공유 안 된 영상 · 다른 기관 · 관할 밖은 403(10-01 사용자 결정 '공유하면 그 기관 지도에도'). 영업 계량 기관(lx-demo)은 없음."""
    require(p)
    if p.realm != "tenant" or not p.tenant_id or p.tenant_id == "lx-demo":
        raise ApiError("forbidden", "원본 동적 타일은 LX 세션 또는 공유받은 기관만", {"imagery_id": iid})
    from .catalog import _share_candidates, shared_ids
    if iid not in await shared_ids(p.tenant_id, every=True):       # 비공개로 내린 영상도 이미 공유된 결과 아래 조각은 그대로(10-14)
        raise ApiError("forbidden", "이 기관에 공유된 영상이 아닙니다", {"imagery_id": iid})
    async with db(realm="lx") as conn:
        r = await conn.fetchrow("SELECT id, sgg_cd, ST_AsGeoJSON(footprint)::json AS fp FROM imagery WHERE id=$1 AND tier='raw'", iid)
    if not r or not await run_in_threadpool(_share_candidates, p.tenant_id, [r]):
        raise ApiError("forbidden", "관할 밖 영상", {"imagery_id": iid})


@router.get("/tiles/sign")
async def tiles_sign(set: str, request: Request):
    p = require(principal(request))
    set_id = set
    canon = canonical_set(set_id)
    t = set_tenant(set_id)
    if set_id.startswith("cog/") and not p.is_lx:
        await require_cog_scope(p, set_id[4:])      # 기관 = 이 기관에 공유된 · 관할 안 영상만(10-01 사용자 결정)
    elif set_id.startswith("cog/") or lx_only_set(set_id):
        require(p, lx=True)
    elif t and t != "lx" and not p.is_lx and p.tenant_id != t:
        raise ApiError("forbidden", "다른 기관의 결과 세트")
    if set_id.startswith("demo/") and not p.is_lx:
        raise ApiError("forbidden")
    if not p.is_lx and t in (None, "lx") and not set_id.startswith("cog/") and restricted_set(set_id):
        # 공개 아닌 이름 있는 세트 — 기관은 그 기관 카탈로그(배포본 결과 · 공유된 영상 · 참조)에 있는 것만(10-22 옆문 닫기)
        _, mine = await layer_items(p, "tenant")
        if not any(i.get("set") == set_id for i in mine):
            raise ApiError("forbidden", "이 기관에 공유되지 않은 세트", {"set": set_id})
    exp = sign_exp()
    s = sign(set_id, exp)
    if set_id.startswith("cog/"):
        url = f"{config.PUBLIC_BASE}/tiles/cog/{set_id[4:]}/{{z}}/{{x}}/{{y}}.webp?exp={exp}&sig={s}"
    else:
        url = f"{pm_url(set_id)}?exp={exp}&sig={s}"
    url = rebase(url, base_of(request))          # 서명 주소 = 이 화면의 API 기준 주소(고정 localhost:8700 이 아니라 · c2-xi 3차)
    import datetime as dt
    return {"url": url, "set": set_id, "canonical": canon,
            "expires_at": dt.datetime.fromtimestamp(exp, KST).isoformat(timespec="seconds")}


# ── COG 동적 타일(lx 전용) ─────────────────────────────────────────────────────
_ds_local = threading.local()
_cog_meta: dict[str, dict] = {}


def _tile_bounds_3857(z: int, x: int, y: int):
    n = 2 ** z
    size = 2 * math.pi * 6378137 / n
    ox = -math.pi * 6378137
    minx = ox + x * size
    maxy = -ox - y * size
    return minx, maxy - size, minx + size, maxy


def _open(path: str):
    import rasterio
    cache = getattr(_ds_local, "ds", None)
    if cache is None:
        cache = _ds_local.ds = {}
    ds = cache.get(path)
    if ds is None:
        ds = cache[path] = rasterio.open(path)
    return ds


DECIMATE_AT = 2.0      # 원본 화소 / 출력 화소 가 이보다 크면(낮은 줌) 가장 가까운 화소로 2배 읽고 면적 평균으로 줄인다


def _read_rgb(ds, win, ow: int, oh: int):
    """창 → (3,oh,ow) uint8 · 마스크(0/255). 낮은 줌: 오버뷰 없는 25cm 원본(줄 단위 스트립 · 수십 장 VRT)을 bilinear 로 읽으면
    원 해상도 전부를 풀어 z12 한 장에 20초+ 걸린다(2026-09-30 실측 23.2 s). 가장 가까운 화소 읽기는 필요한 줄만 읽어 0.1 s 안팎 —
    2배로 읽은 뒤 면적 평균으로 줄여 계단 무늬를 누른다. 높은 줌(배율 ≤ 2)은 기존 bilinear 그대로."""
    import cv2
    from rasterio.enums import Resampling
    factor = max(win.width / max(ow, 1), win.height / max(oh, 1))
    if factor > DECIMATE_AT:
        k = 2
        src = ds.read(indexes=[1, 2, 3], window=win, out_shape=(3, oh * k, ow * k), boundless=True, fill_value=0, resampling=Resampling.nearest)
        m = ds.read_masks(1, window=win, out_shape=(oh * k, ow * k), boundless=True, resampling=Resampling.nearest)
        src = np.stack([cv2.resize(np.ascontiguousarray(b), (ow, oh), interpolation=cv2.INTER_AREA) for b in src])
        m = cv2.resize(np.where(m, 255, 0).astype(np.uint8), (ow, oh), interpolation=cv2.INTER_NEAREST)
        return src, m
    src = ds.read(indexes=[1, 2, 3], window=win, out_shape=(3, oh, ow), boundless=True, fill_value=0, resampling=Resampling.bilinear)
    m = ds.read_masks(1, window=win, out_shape=(oh, ow), boundless=True)
    return src, np.where(m, 255, 0).astype(np.uint8)   # rasterio 1.4 boundless 마스크는 bool — reproject 는 bool 을 못 받는다


def _render(src_path: str, z: int, x: int, y: int, size: int = 256) -> bytes | None:
    import cv2
    import rasterio
    from rasterio.enums import Resampling
    from rasterio.warp import reproject, transform_bounds
    from rasterio.windows import from_bounds
    from rasterio.transform import from_bounds as tfb

    ds = _open(src_path)
    b3857 = _tile_bounds_3857(z, x, y)
    dst_tr = tfb(*b3857, size, size)
    if ds.crs and ds.crs.to_epsg() == 3857:
        win = from_bounds(*b3857, transform=ds.transform)
        data = ds.read(indexes=[1, 2, 3], window=win, out_shape=(3, size, size), boundless=True, fill_value=0,
                       resampling=Resampling.bilinear)
        mask = ds.read_masks(1, window=win, out_shape=(size, size), boundless=True)
        mask = np.where(mask, 255, 0).astype(np.uint8)
    else:
        sb = transform_bounds("EPSG:3857", ds.crs, *b3857, densify_pts=5)
        l, bt, r, tp = ds.bounds
        if sb[2] < l or sb[0] > r or sb[3] < bt or sb[1] > tp:
            return None
        pad = (sb[2] - sb[0]) * 0.05
        sb = (sb[0] - pad, sb[1] - pad, sb[2] + pad, sb[3] + pad)
        win = from_bounds(*sb, transform=ds.transform)
        ow = oh = int(size * 1.2)
        src, smask = _read_rgb(ds, win, ow, oh)
        src_tr = tfb(*sb, ow, oh)
        data = np.zeros((3, size, size), np.uint8)
        mask = np.zeros((size, size), np.uint8)
        reproject(src, data, src_transform=src_tr, src_crs=ds.crs, dst_transform=dst_tr, dst_crs="EPSG:3857", resampling=Resampling.bilinear)
        reproject(smask, mask, src_transform=src_tr, src_crs=ds.crs, dst_transform=dst_tr, dst_crs="EPSG:3857", resampling=Resampling.nearest)
    if mask.max() == 0:
        return None
    # GPT3-7 — 영상 가장자리 어두운 띠: 화소 값은 bilinear 로 바깥(채움 0 = 검정)과 섞이고 마스크는 nearest 라
    # 가장자리 1~2줄이 어둡게 남았다(실측 z13 첫 줄 밝기 48 ↔ 안쪽 74). 마스크를 안쪽으로 2화소 깎아 섞인 줄을 투명으로.
    # 타일 테두리는 깎지 않는다(erode 기본 테두리 값 = 최대) — 이웃 타일과 이음매 없음.
    if mask.min() == 0:
        mask = cv2.erode(mask, np.ones((5, 5), np.uint8))
        if mask.max() == 0:
            return None
    rgba = np.dstack([data[2], data[1], data[0], mask])   # BGRA for cv2
    ok, buf = cv2.imencode(".webp", rgba, [cv2.IMWRITE_WEBP_QUALITY, 82])
    return buf.tobytes() if ok else None


@router.get("/tiles/cog/{iid}/{z}/{x}/{y}.webp")
async def cog_tile(iid: str, z: int, x: int, y: int, request: Request, exp: str | None = None, sig: str | None = None):
    p = principal(request)
    if not (p.is_lx or verify(f"cog/{iid}", exp, sig)):
        raise ApiError("forbidden", "원본 동적 타일은 LX 세션 전용(R7)", {"imagery_id": iid})
    meta = _cog_meta.get(iid)
    if meta is None:
        async with db(realm="lx") as conn:
            r = await conn.fetchrow("SELECT path_internal, layer FROM imagery WHERE id=$1 AND tier='raw'", iid)
        if not r:
            raise ApiError("not_found", f"cog 영상 {iid} 없음")
        cog = (r["layer"] or {}).get("cog_path")
        meta = _cog_meta[iid] = {"raw": r["path_internal"], "cog": str(config.DATA_ROOT / cog) if cog else None}
    src = meta["cog"] if meta["cog"] and os.path.exists(meta["cog"]) else meta["raw"]
    if not src or not os.path.exists(src):
        raise ApiError("cog_unavailable", "원본/COG 파일 없음")
    # 캐시 판 'e2' — 가장자리 고침(GPT3-7) 전 타일은 쓰지 않는다(옛 캐시 폴더는 지우지 않고 그대로 둔다)
    cp = config.DATA_ROOT / "cache" / "tiles" / "cog" / iid / (("cog" if src == meta["cog"] else "raw") + "-e2") / str(z) / str(x) / f"{y}.webp"
    hdr = {"Cache-Control": "private, max-age=3600", "X-LX-Render": "rasterio(COG)" if src == meta["cog"] else "rasterio(source window+reproject)"}  # 머리 값은 ASCII 만(한글이면 500)
    if cp.exists():
        return Response(content=cp.read_bytes(), media_type="image/webp", headers=hdr)
    if cp.with_suffix(".empty").exists():
        return Response(status_code=204)
    buf = await run_in_threadpool(_render, src, z, x, y)
    cp.parent.mkdir(parents=True, exist_ok=True)
    if buf is None:
        cp.with_suffix(".empty").touch()
        return Response(status_code=204)
    cp.write_bytes(buf)
    return Response(content=buf, media_type="image/webp", headers=hdr)


@router.get("/files/models/{path:path}")
async def files_models(path: str, request: Request):
    require(principal(request), lx=True)
    base = (config.DATA_ROOT / "models").resolve()
    p = (base / path).resolve()
    if base not in p.parents or not p.is_file():
        raise ApiError("not_found", "모델 파일 없음")
    ct = mimetypes.guess_type(p.name)[0] or ("image/webp" if p.suffix == ".webp" else "application/octet-stream")
    return Response(content=p.read_bytes(), media_type=ct, headers={"Cache-Control": "private, max-age=600"})
