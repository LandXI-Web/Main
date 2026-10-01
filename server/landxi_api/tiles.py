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
from .catalog import base_of, canonical_set, layer_items, pm_url, rebase, resolve_set_path, set_tenant
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
    t = set_tenant(set_id)
    return (t is not None and t != "lx") or set_id.startswith("demo/") or lx_only_set(set_id)


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


@router.get("/tiles/xyz/{folder}/{z}/{x}/{y}.webp")
async def xyz(folder: str, z: int, x: int, y: int):
    if "/" in folder or ".." in folder:
        raise ApiError("not_found")
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
    if iid not in await shared_ids(p.tenant_id):
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
    exp = int(time.time()) + SIGN_TTL
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
    cp = config.DATA_ROOT / "cache" / "tiles" / "cog" / iid / ("cog" if src == meta["cog"] else "raw") / str(z) / str(x) / f"{y}.webp"
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
