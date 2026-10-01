"""작업(F1-CONTRACT §4.4) — quote · submit · 목록 · 조회 · cancel/requeue/priority.

견적 숫자는 전부 봉투: 면적(shapely · EPSG:5186 · measured) · shard 수(tiling · measured) · GPU·s(models.perf 실측 계수 × shard · estimate).
perf 가 없으면 null + note 'bench 전'. 제출 = jobs 행 + Redis job:{id} 해시 + XADD jobs:{pool} + events:{job} job.queued.
"""
from __future__ import annotations

import datetime as dt
import json
import os
import re
import secrets
import time

from fastapi import APIRouter, Request
from shapely.geometry import mapping, shape
from starlette.concurrency import run_in_threadpool

from . import config
from .deps import ApiError, Principal, audit, db, principal, redis, require
from .envelope import KST, env, now_iso
from . import quota as quota_mod

router = APIRouter()
_CROCK = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"


def ulid() -> str:
    t = int(time.time() * 1000)
    ts = "".join(_CROCK[(t >> (5 * i)) & 31] for i in reversed(range(10)))
    rnd = int.from_bytes(secrets.token_bytes(10), "big")
    return ts + "".join(_CROCK[(rnd >> (5 * i)) & 31] for i in reversed(range(16)))


_raster_meta: dict[str, dict] = {}


def raster_meta(path: str) -> dict:
    m = _raster_meta.get(path)
    if m is None:
        import rasterio
        with rasterio.open(path) as ds:
            m = {"width": ds.width, "height": ds.height, "transform": ds.transform, "crs": ds.crs.to_epsg() or 5186,
                 "res": ds.res[0]}
        _raster_meta[path] = m
    return m


def resolve_internal(path: str | None) -> str | None:
    if not path:
        return None
    p = path if os.path.isabs(path) or ":" in path[:3] else str(config.DATA_ROOT / path)
    return p


def _footprint_parts(fp_geojson: dict | None, epsg: int):
    if not fp_geojson:
        return None
    from pyproj import Transformer
    from shapely.ops import transform as sh_transform
    to = Transformer.from_crs(4326, epsg, always_xy=True).transform
    g = sh_transform(to, shape(fp_geojson))
    return list(getattr(g, "geoms", [g]))


async def _load(conn, model_id: str | None, imagery_id: str | None):
    model = await conn.fetchrow("SELECT * FROM models WHERE id=$1", model_id) if model_id else None
    img = None
    if imagery_id:
        img = await conn.fetchrow("SELECT id, tier, kind, gsd_m, path_internal, layer, export_policy, ST_AsGeoJSON(footprint)::json AS fp, "
                                  "ST_AsGeoJSON(ST_Envelope(footprint))::json AS env FROM imagery WHERE id=$1", imagery_id)
    return model, img


def pool_of(model) -> str:
    if model is None:
        return "cpu"
    adapter = model["adapter"] or ""
    from workers.registry_scan import adapter_device
    return "cpu" if adapter_device(adapter) == "cpu" else config.POOL


async def active_workers(pool: str) -> list[str]:
    r = await redis()
    out = []
    async for k in r.scan_iter(match="worker:*:hb", count=2000):
        h = await r.hgetall(k)
        if h.get("pool") == pool:
            out.append(h.get("id"))
    return sorted(w for w in out if w)


# 작업 상한(S-8 · 서버측 shard 계획의 천장) — 넘으면 too_large(쪼개서 다시). 값은 이 PC(A6000 1장 고부하) 기준 [추정 초기값].
SHARD_CAP = {"infer": 20000, "reinfer": 120000, "index": 120, "survey": 5000, "join": 5000, "tile": 2, "train": 1}
TRAIN_EPOCHS_MAX = 50

# 실시간 소범위 분석(fix-xi-live · XI맵 읍면동) — 범위 천장은 서버가 강제한다(클라이언트 max_km2 는 이보다 클 수 없다).
# 시군 전역 같은 큰 범위는 실시간으로 받지 않는다(aoi_too_large) — 끝난 전역 작업은 '전체 범위 기록 보기'로 다시 본다.
INFER_MAX_KM2 = 150.0          # 가장 넓은 읍면동급(예시 지역 최대 읍면동 ≈ 104㎢) + 여유 [추정 초기값]
# options.live=true: 칩 수가 LIVE_MAX_SHARDS 를 넘지 않도록 서버가 해상도(upsample)를 한 단계씩 낮춰 계획한다.
# 2026-09-29 실측(A6000 1장 · aerial25/best · 25cm VRT · 대기 없음): 원 해상도 12–16칸/s · 0.75 ≈ 5.5칸/s(운봉읍 756칸 136 s) ·
# 0.5 ≈ 4.9칸/s(산내면 599칸 ≈ 120 s) — 해상도를 낮출수록 창 읽기가 병목. 800칸 × 0.75 ≈ 145 s + 마무리 → 읍면동 ≤ 3분 목표.
LIVE_MAX_SHARDS = 800
LIVE_LADDER = (1.0, 0.75, 0.5, 0.35, 0.25)


def normalize_aoi(aoi: dict | None) -> dict | None:
    """AOI(GeoJSON Polygon | MultiPolygon | Feature | FeatureCollection) → 한 Polygon(4326).
    화면은 벡터 타일 조각(읍면동 경계가 타일마다 잘려 온다)을 MultiPolygon 으로 보낸다 — 조각을 녹여 합치고,
    섬처럼 떨어진 부분이 남으면 가장 큰 면(jobs.aoi 열 = POLYGON)을 쓴다."""
    if not aoi:
        return aoi
    from shapely.geometry import Polygon
    from shapely.ops import unary_union
    t = aoi.get("type")
    if t == "Feature":
        return normalize_aoi(aoi.get("geometry"))
    if t == "FeatureCollection":
        return normalize_aoi({"type": "GeometryCollection", "geometries": [f.get("geometry") for f in aoi.get("features") or [] if f.get("geometry")]})
    if t == "Polygon":
        g = shape(aoi)
        if g.is_valid:
            return aoi
        g = g.buffer(0)
    else:
        try:
            g = shape(aoi)
        except Exception as e:
            raise ApiError("bad_request", f"aoi 형식: {e}") from None
        eps = 1e-6                                      # ≈ 0.1 m — 타일 경계 이음새만 녹인다
        parts = [p for p in getattr(g, "geoms", [g]) if p.geom_type in ("Polygon", "MultiPolygon")]
        g = unary_union([p.buffer(eps, join_style=2) for p in parts]).buffer(-eps, join_style=2)
    polys = [p for p in getattr(g, "geoms", [g]) if isinstance(p, Polygon) and not p.is_empty]
    if not polys:
        raise ApiError("bad_request", "aoi 가 비어 있습니다")
    p = max(polys, key=lambda x: x.area)
    return mapping(Polygon(p.exterior.coords, [i.coords for i in p.interiors]))


def fit_upsample(model, img) -> float:
    """모델이 배운 해상도에 영상을 맞춘다(드론 1.4cm → 차량 모델 2cm = 0.68) — 영상이 더 거칠면 1(키우지 않음)."""
    try:
        g_img, g_m = float(img["gsd_m"] or 0), float(model["gsd_trained_m"] or 0)
    except (KeyError, TypeError, ValueError):
        return 1.0
    if not g_img or not g_m:
        return 1.0
    f = g_img / g_m
    return max(0.25, round(f, 2)) if f < 0.9 else 1.0


_live_seen: dict[str, tuple[float, float]] = {}      # 견적에서 고른 해상도(10분) — 제출 때 사다리를 다시 오르내리지 않는다(실행 → 첫 결과 단축)


def live_plan(meta: dict, aoi, fp_parts, chip: int, overlap, fit: float, key: str = ""):
    """options.live — 칩 수 ≤ LIVE_MAX_SHARDS 가 되는 가장 높은 해상도. → (upsample, grid, shards)"""
    from workers.tiling import shards as mk_shards
    ladder = [fit] + [u for u in LIVE_LADDER if u < fit]
    hit = _live_seen.get(key)
    if hit and time.time() - hit[1] < 600 and hit[0] in ladder:
        ladder = ladder[ladder.index(hit[0]):]
    grid = sh = None
    for u in ladder:
        grid, sh = mk_shards(meta, aoi, chip=chip, overlap=overlap, upsample=u, footprint_src=fp_parts)
        if len(sh) <= LIVE_MAX_SHARDS:
            if key:
                _live_seen[key] = (u, time.time())
                if len(_live_seen) > 256:
                    _live_seen.pop(next(iter(_live_seen)))
            return u, grid, sh
    return ladder[-1], grid, sh


async def _quote_train_tile(p: Principal, body: dict, kind: str) -> dict:
    """kind train(학습 · GPU 임대) · tile(영상 등록 타일 · CPU) 견적 — 모델 추론 견적과 같은 모양."""
    reasons: list[str] = []
    opts = dict(body.get("options") or {})
    tenant = "lx"
    model = None
    if kind == "train":
        if not (p.is_lx and p.role in ("staff", "admin")):
            raise ApiError("forbidden", "학습은 LX 직원·관리자만")
        base = body.get("base_model") or opts.get("base_model")
        samples = body.get("samples") or opts.get("samples")
        from .projects import guard_train          # 공개된 서비스의 재학습 = 그 프로젝트장 · 구성원만(구현 2차 T1 · 역할-3 ⓑ)
        await guard_train(p, samples, base, body.get("project_id") or opts.get("project_id"))
        async with db(realm="lx") as conn:
            model = await conn.fetchrow("SELECT * FROM models WHERE id=$1", base) if base else None
            busy = await conn.fetchval("SELECT count(*) FROM jobs WHERE kind='train' AND state IN ('queued','running')")
        if not model or not model["weights_uri"]:
            raise ApiError("not_found", "기반 모델(가중치)이 없습니다", {"base_model": base})
        from workers.registry_scan import load_adapter  # noqa: F401  (어댑터 등록 확인)
        import importlib.util
        spec = importlib.util.spec_from_file_location("lx_train_probe", str(config.SERVER_ROOT / "adapters" / "adapter_train_yolo.py"))
        mod = importlib.util.module_from_spec(spec)
        import sys as _s
        _s.path.insert(0, str(config.SERVER_ROOT))
        spec.loader.exec_module(mod)
        if not mod.dataset_yaml(samples):
            raise ApiError("not_found", "학습 표본이 없습니다", {"samples": samples, "allowed": list(mod.DATASETS)})
        gpus = int(opts.get("gpus", 1) or 1)
        pw = config.load_yaml("pools").get("power", {}) or {}
        if gpus > int(pw.get("max_hot_gpus", 1)) or busy:
            reasons.append("power_budget")          # 동시 고부하 GPU ≤ max_hot(1) — 두 번째 학습·다중 GPU 학습은 거절
        ep = int(opts.get("epochs", 10))
        if ep > TRAIN_EPOCHS_MAX:
            reasons.append("too_large")
        opts.update({"base_model": base, "samples": samples, "region": body.get("region") or opts.get("region"),
                     "epochs": min(ep, TRAIN_EPOCHS_MAX), "imgsz": int(opts.get("imgsz", 640)), "batch": int(opts.get("batch", 8))})
        adapter, pool, shards_n = "train/yolo", config.POOL, 1
        gpu_s = env(None, "gpu_s", "estimate", "학습 실측 없음", "첫 학습 뒤 채워짐")
        eta = env(None, "s", "estimate", "학습 실측 없음", "첫 학습 뒤 채워짐")
    else:
        if not (p.is_lx and p.role in ("staff", "admin")):
            raise ApiError("forbidden", "영상 등록은 LX 직원·관리자만")
        adapter, pool, shards_n = "tile/cog", "cpu", 2
        gpu_s = env(0, "gpu_s", "estimate", "kind tile — CPU 워커", "GPU 사용 없음")
        eta = await eta_estimate(adapter, shards_n)
    if shards_n > SHARD_CAP.get(kind, 10 ** 9):
        reasons.append("too_large")
    return {"area_km2": env(None, "km2", "measured", "-", "학습·타일 작업 — 면적 없음"), "shards": shards_n,
            "shards_env": env(shards_n, "count", "measured", f"plan({adapter})"), "gpu_s": gpu_s, "eta_s": eta,
            "quota": {"tenant_id": tenant, "dim": "gpu_s_month", "remaining": env(None, "gpu_s", "measured", "quotas(lx)", "무제한"), "policy": "queue_low"},
            "allowed": not reasons, "reasons": reasons, "pool": pool, "kind": kind, "demo": False,
            "power_budget": await power_budget() if pool != "cpu" else None,
            "_aoi": None, "_tenant": tenant, "_model": dict(model) if model else None, "_img": None, "_adapter": adapter, "_opts": opts}


OUT_OF_SCOPE = "관할 밖 지역은 분석할 수 없습니다"


def _aoi_shape(aoi: dict | None):
    """범위 원본 전체(조각 · 여러 면 · Feature · FeatureCollection) → shapely 하나. 가장 큰 면만 남기기 전의 모양으로 관할을 본다."""
    if not aoi:
        return None
    t = aoi.get("type")
    if t == "Feature":
        return _aoi_shape(aoi.get("geometry"))
    if t == "FeatureCollection":
        from shapely.ops import unary_union
        parts = [_aoi_shape(f.get("geometry") if f.get("type") == "Feature" else f) for f in aoi.get("features") or []]
        parts = [g for g in parts if g is not None and not g.is_empty]
        return unary_union(parts) if parts else None
    try:
        g = shape(aoi)
    except Exception as e:
        raise ApiError("bad_request", f"aoi 형식: {e}") from None
    return g if g.is_valid else g.buffer(0)


async def scope_guard(p: Principal, body: dict) -> None:
    """기관 계정의 분석 견적·등록 = 관할 안만(원칙 39 · 확인 FR-11). 시군구 코드 · 읍면동 코드 · 범위 · 영상 · 배포본 가운데
    하나라도 관할 밖이면(범위는 경계선 오차 약 10m 를 넘어 조금이라도 벗어나면) 거절 — 분석 기계 사용 0 · 계획 0(모델 미리 올리기 전).
    LX 계정은 그대로 전국. 위치를 하나도 주지 않은 기관 요청도 거절(무엇을 분석하는지 모르는 요청을 받지 않는다)."""
    from . import regions as R
    if R.scope_of(p) is None:
        return
    out = ApiError("out_of_scope", OUT_OF_SCOPE, None, 403)
    opts = body.get("options") or {}
    located = False
    sgg = opts.get("sgg_cd") or body.get("sgg_cd")
    if sgg:
        located = True
        if not R.region_allowed(p, str(sgg)):
            raise out
    emds = opts.get("emd_cd") or body.get("emd_cd")
    for e in ([emds] if isinstance(emds, str) else list(emds or [])):
        located = True
        if not re.fullmatch(r"\d{8,10}", str(e)) or not R.region_allowed(p, str(e)[:5]):
            raise out
    g = _aoi_shape(body.get("aoi"))
    if body.get("aoi") is not None:
        located = True
        if g is None or not await run_in_threadpool(R.geom_in_scope, p, g):
            raise out
    if body.get("imagery_id"):
        located = True
        if g is None:                                   # 범위 없이 영상 전체 — 영상 범위가 관할 안이어야
            async with db(realm="lx") as conn:
                fp = await conn.fetchval("SELECT ST_AsGeoJSON(footprint)::json FROM imagery WHERE id=$1", body["imagery_id"])
            if not fp or not await run_in_threadpool(R.geom_in_scope, p, shape(fp)):
                raise out
    if body.get("deploy_id"):
        located = True
        async with db(p) as conn:                        # RLS — 다른 기관 배포본은 보이지 않는다
            t = await conn.fetchval("SELECT tenant_id FROM deploys WHERE id=$1", body["deploy_id"])
        if t != p.tenant_id:
            raise out
    if not located:
        raise out


async def build_quote(p: Principal, body: dict) -> dict:
    kind = body.get("kind", "infer")
    if kind not in ("infer", "reinfer", "index", "survey", "join", "train", "tile"):
        raise ApiError("bad_request", f"kind {kind} — infer|reinfer|index|survey|join|train|tile")
    await scope_guard(p, body)                          # 관할 밖 = 계획·견적 전에 거절
    if kind in ("train", "tile"):
        return await _quote_train_tile(p, body, kind)
    demo = bool(body.get("demo"))
    opts = dict(body.get("options") or {})
    chip = int(opts.get("chip", 1024))
    reasons: list[str] = []
    tenant = "lx-demo" if demo else (p.tenant_id if p.realm == "tenant" else "lx")
    if kind == "infer" and opts.get("scope") == "sgg":
        return await _quote_sgg(p, body, opts, demo, tenant, reasons)      # 시군구 전역 분석(core-xi)
    auto = None
    if kind == "infer" and body.get("aoi") and not body.get("imagery_id"):
        # 읍면동 · 그린 범위(r3-xi · M11) — 영상 · 모델은 서버가 고른다(등록 영상 COG 포함 · 전역 분석과 같은 규칙).
        # 범위는 영상 footprint 로 자른다(영상 밖은 분석하지 않는다). 겹치는 영상이 없을 때만 no_imagery('영상 등록 필요').
        auto = await _auto_imagery(p, normalize_aoi(body.get("aoi")))
        if not auto.get("imagery_id"):
            reasons.append(auto.get("reason") or "no_imagery")
            return {"area_km2": env(None, "km2", "measured", "범위 ∩ 영상", "영상 없음"), "shards": 0,
                    "shards_env": env(0, "count", "measured", "tiling"), "gpu_s": env(None, "gpu_s", "estimate", "영상 없음"),
                    "eta_s": env(None, "s", "estimate", "영상 없음"), "quota": None, "allowed": False, "reasons": reasons, "pool": config.POOL,
                    "kind": kind, "demo": demo, "power_budget": None, "imagery": None, "coverage": env(0.0, "ratio", "measured", "범위 ∩ 영상 footprint"),
                    "_aoi": None, "_tenant": tenant, "_model": None, "_img": None, "_adapter": None, "_opts": None}
        body = {**body, "imagery_id": auto["imagery_id"], "aoi": auto["aoi"]}
    async with db(realm="lx") as conn:
        model, img = await _load(conn, body.get("model_id"), body.get("imagery_id"))
        if auto and img is not None and model is None:
            model = await _pick_model(conn, img["kind"] or "ortho", float(img["gsd_m"] or 0.25))
            if model is None:
                reasons.append("model_input_mismatch")
    if body.get("model_id") and not model:
        raise ApiError("not_found", f"model {body.get('model_id')} 없음")
    if body.get("imagery_id") and not img:
        raise ApiError("not_found", f"imagery {body.get('imagery_id')} 없음")
    if p.role == "sales" and not demo:
        reasons.append("demo_required")
    if p.realm == "tenant" and img and (img["tier"] == "raw"):
        reasons.append("imagery_forbidden")
    if model and img and model["input"] and img["kind"] not in (model["input"] or []):
        reasons.append("model_input_mismatch")
    aoi = normalize_aoi(body.get("aoi"))
    live = bool(opts.get("live")) and kind == "infer"
    plan_opts: dict = {}
    if kind == "reinfer" and not aoi and img and img["fp"]:
        aoi = None      # footprint 전체
    area = None
    area_src = "shapely area(EPSG:5186)"
    shards_n = 0
    tile_src = "params"
    adapter_id = None
    if kind in ("survey", "join") or (kind == "index" and not model):
        from workers.registry_scan import adapter_for_kind
        adapter_id = body.get("adapter") if (config.DEV and body.get("adapter")) else adapter_for_kind(kind)
        if config.DEV and opts.get("adapter"):
            adapter_id = opts["adapter"]            # 개발 모드 전용(고아 감시 테스트 어댑터 등)
        if not adapter_id:
            raise ApiError("registry_unavailable", f"kind {kind}: 어댑터 없음(plan 훅 · F2-S server/adapters/survey 미도착)",
                           {"kind": kind}, status=404)
    elif model and kind == "index":
        adapter_id = model["adapter"]
    if kind in ("index", "survey", "join"):
        sh = await run_in_threadpool(_plan_preview, kind, adapter_id, body, opts, aoi)
        shards_n = len(sh)
        tile_src = f"plan({adapter_id})" if adapter_id else "params.months"
        if aoi:
            area, area_src = aoi_area(aoi)
    elif img:
        path = resolve_internal(img["path_internal"])
        if not path:        # 원본 경로가 없는 영상(보기 전용 타일만 있음) — 500 대신 정직한 거절
            raise ApiError("imagery_unavailable", "이 영상은 AI 분석 입력(원본)이 없습니다 — 영상 등록 필요",
                           {"imagery_id": img.get("id") if hasattr(img, "get") else None}, status=409)
        meta = await run_in_threadpool(raster_meta, path)
        fp_parts = _footprint_parts(img["fp"], meta["crs"])
        if aoi:
            g = shape(aoi)
            area, area_src = aoi_area(aoi)
            if img["fp"] and not shape(img["fp"]).intersects(g):
                reasons.append("aoi_outside_footprint")
            # 범위 천장: 클라이언트가 보낸 max_km2 와 서버 천장(INFER_MAX_KM2) 중 작은 값 — 클라이언트가 늘릴 수 없다
            if kind == "infer" and area > min(float(opts.get("max_km2", 5)), INFER_MAX_KM2):
                reasons.append("aoi_too_large")
        elif img["fp"]:
            area, area_src = aoi_area(img["fp"])
            if kind == "infer" and area > INFER_MAX_KM2:
                reasons.append("aoi_too_large")         # 범위 없이 영상 전체 — 같은 천장
        from workers.tiling import shards as mk_shards
        if "aoi_outside_footprint" not in reasons and "aoi_too_large" not in reasons:
            if live and aoi:
                import hashlib
                lkey = hashlib.sha1(json.dumps([img["id"], aoi, chip, opts.get("overlap"), model["id"] if model else None],
                                               sort_keys=True).encode()).hexdigest()
                up, grid, sh = await run_in_threadpool(live_plan, meta, aoi, fp_parts, chip, opts.get("overlap"),
                                                       fit_upsample(model, img) if model else 1.0, lkey)
                plan_opts = {"upsample": up}            # 제출 때 서버가 고른 해상도를 작업 옵션에 남긴다(스케줄러가 같은 계획을 만든다)
                if len(sh) > LIVE_MAX_SHARDS:
                    reasons.append("too_large")
            else:
                grid, sh = await run_in_threadpool(mk_shards, meta, aoi, chip=chip, overlap=opts.get("overlap"),
                                                   upsample=float(opts.get("upsample", 1) or 1), footprint_src=fp_parts)
            shards_n = len(sh)
            tile_src = f"workers.tiling(chip {chip} · overlap {grid.overlap}px(원본) · upsample {grid.upsample:g} · gsd {meta['res']:.4f})"
    pool = pool_of(model) if model else "cpu"
    if kind in ("survey", "join"):
        pool = "cpu"
    perf = (model["perf"] if model else None) or None
    cps = (perf or {}).get("chips_per_s", {}).get("value") if perf else None
    if kind != "index" and cps:
        bench_at = (perf or {}).get("bench_at", "")
        gpu_s = env(round(shards_n / cps, 1), "gpu_s", "estimate", f"models.perf({model['id']}) {cps} chips/s/GPU × {shards_n} shard",
                    (perf["chips_per_s"].get("note") or "") + f" · bench {bench_at}")
        wk = await active_workers(pool)
        n = max(1, len(wk))
        eta = env(round(shards_n / cps / n + 3.0, 1), "s", "estimate", f"gpu_s ÷ 워커 {n} + 스냅샷 3s",
                  "워커 수는 지금 하트비트 기준" if wk else "워커 하트비트 없음 — 1 로 계산")
    elif kind in ("index", "survey", "join"):
        gpu_s = env(0 if kind != "index" else None, "gpu_s", "estimate", f"kind {kind} — CPU 워커(모델 추론 아님)", "GPU 사용 없음")
        eta = await eta_estimate(adapter_id or kind, shards_n)
    else:
        gpu_s = env(None, "gpu_s", "estimate", f"models.perf({model['id'] if model else '-'}) 없음 — bench 전", "bench 후 채워짐")
        eta = env(None, "s", "estimate", "同上")
    q = await quota_mod.remaining(tenant, "gpu_s_month")
    req = gpu_s["value"] or 0
    if q["hard"] is not None and q["used"] + req > q["hard"] and q["policy"] == "reject":
        reasons.append("quota_exceeded")
    if shards_n > SHARD_CAP.get(kind, 10 ** 9):
        reasons.append("too_large")                 # 서버측 shard 계획 상한(S-8) — AOI 를 나눠 다시
    if int(opts.get("gpus", 1) or 1) > int((config.load_yaml("pools").get("power", {}) or {}).get("max_hot_gpus", 1)):
        reasons.append("power_budget")              # 동시 고부하 GPU 상한(전력 예산 · 1급 제약)
    area_env = env(round(area, 4) if area is not None else None, "km2", "measured", area_src,
                   None if area is not None else ("AOI 없음(읍면동 목록 · 규칙 재평가)" if kind in ("survey", "join") else None))
    return {
        "area_km2": area_env,
        "shards": shards_n,
        "shards_env": env(shards_n, "count", "measured", tile_src),
        "gpu_s": gpu_s, "eta_s": eta,
        "quota": {"tenant_id": tenant, "dim": "gpu_s_month",
                  "remaining": env(None if q["hard"] is None else round(q["hard"] - q["used"], 1), "gpu_s", "measured",
                                   f"quotas({tenant} hard={q['hard']}) − usage_events", "무제한" if q["hard"] is None else q.get("note")),
                  "policy": q["policy"]},
        "allowed": not reasons, "reasons": reasons, "pool": pool, "kind": kind, "demo": demo,
        "power_budget": await power_budget() if pool != "cpu" else None,
        "_aoi": aoi, "_tenant": tenant, "_model": dict(model) if model else None, "_img": dict(img) if img else None,
        "_adapter": adapter_id, "_opts": plan_opts or None, "_auto": bool(auto),
        **({"upsample": plan_opts["upsample"]} if plan_opts else {}),     # live: 서버가 고른 해상도(화면은 예상 시간 기록 대조에만 쓴다)
        **({"aoi": aoi} if (live and aoi) else {}),                        # live: 서버가 녹여 합친 범위(화면 프레임 · 타일 이음새 없는 한 면)
        **({"imagery": {"id": img["id"], "gsd_m": float(img["gsd_m"] or 0), "kind": img["kind"], "year": auto.get("year"),
                        "coverage": env(auto.get("coverage"), "ratio", "measured", "그린 범위 ∩ 영상 footprint")},
            "model_id": model["id"] if model else None} if auto and img else {}),
    }


async def _auto_imagery(p: Principal, aoi: dict | None) -> dict:
    """범위(4326) → {imagery_id, year, coverage, aoi(영상 footprint 로 자른 한 면)} | {imagery_id: None, reason}.
    catalog.best_imagery 와 같은 순위(imagery_src.choose) · 기관 계정은 원본(tier raw) 제외 · 원본 파일이 있는 영상만."""
    if not aoi:
        return {"imagery_id": None, "reason": "no_imagery"}
    from workers import imagery_src as isrc
    g = shape(aoi).buffer(0)
    async with db(realm="lx") as conn:
        recs = await conn.fetch(isrc.SQL_ROWS + " AND ST_Intersects(footprint, ST_SetSRID(ST_GeomFromGeoJSON($1),4326))", json.dumps(mapping(g)))
        raw = {x["id"] for x in await conn.fetch("SELECT id FROM imagery WHERE tier='raw'")} if p.realm == "tenant" else set()
    rows = [r for r in await run_in_threadpool(isrc.rows_from, recs) if r["id"] not in raw and (r.get("gsd_m") is None or float(r["gsd_m"]) < 1)]
    best = await run_in_threadpool(isrc.choose, rows, g)
    if not best:
        # 범위의 2% 미만만 덮는 영상(choose 의 하한)이라도 1 ha 이상 겹치면 그 겹친 곳을 분석한다 — 전역 분석이 센 '영상과 겹치는 읍면동'
        # (sgg_scope · 1 ha)을 눌렀을 때 '영상 등록 필요'가 뜨지 않게(같은 기준)
        from workers.tiling import area_km2
        cand = []
        for r in rows:
            if not r.get("readable") or r.get("fp") is None or not r["fp"].intersects(g):
                continue
            try:
                a = area_km2(mapping(r["fp"].intersection(g)))
            except Exception:                           # noqa: BLE001
                continue
            if a >= 0.01:
                cand.append((a, r))
        if cand:
            a, r = max(cand, key=lambda t: t[0])
            best = {**r, "coverage": round(r["fp"].intersection(g).area / max(g.area, 1e-12), 4)}
    if not best:
        return {"imagery_id": None, "reason": "no_imagery"}
    cut = g.intersection(best["fp"])
    if cut.is_empty or cut.area <= 0:
        return {"imagery_id": None, "reason": "no_imagery"}
    return {"imagery_id": best["id"], "year": isrc._year(best) or None, "coverage": best["coverage"], "aoi": normalize_aoi(mapping(cut))}


def aoi_area(g: dict) -> tuple[float, str]:
    """면적(km²): AOI 중심이 EPSG:5186 유효 범위(한국 · 124–132°E · 33–39°N) 안이면 5186 평면, 밖이면 측지(GRS80 · v1.1-12)."""
    c = shape(g).centroid
    if 124.0 <= c.x <= 132.0 and 33.0 <= c.y <= 39.0:
        from workers.tiling import area_km2
        return area_km2(g), "shapely area(EPSG:5186)"
    from pyproj import Geod
    a = abs(Geod(ellps="GRS80").geometry_area_perimeter(shape(g))[0]) / 1e6
    return a, f"geodesic(GRS80 · pyproj.Geod) — AOI 중심 {c.x:.2f},{c.y:.2f} 가 EPSG:5186 범위 밖"


def _plan_preview(kind: str, adapter_id: str | None, body: dict, opts: dict, aoi) -> list:
    """견적용 shard 목록 — 스케줄러와 같은 plan_job()(어댑터 plan 훅 · index 월 목록)."""
    from workers.scheduler import plan_job
    o = dict(opts)
    if body.get("params"):
        o["params"] = body["params"]
    for k in ("survey_id", "rules", "emd_cd", "thresholds"):
        if k in body and k not in o:
            o[k] = body[k]
    jh = {"kind": kind, "adapter": adapter_id or "", "options": json.dumps(o, ensure_ascii=False), "aoi": json.dumps(aoi) if aoi else "",
          "tenant_id": body.get("tenant_id") or "", "deploy_id": body.get("deploy_id") or ""}
    try:
        return plan_job(jh)
    except ValueError as e:
        m = str(e)
        if m.startswith("rule_requires_missing:"):
            raise ApiError("rule_requires_missing", m.split(":", 1)[1].strip(), {"rules": o.get("rules"), "thresholds": o.get("thresholds")}, status=400) from None
        raise


async def eta_estimate(key: str, shards_n: int) -> dict:
    """kind index · survey eta_s(v1.1-11): 최근 shard ms 중앙값(perf:shard_ms:{어댑터} · 없으면 index_results.metrics.ms) × shards."""
    import statistics
    r = await redis()
    vals = [int(x) for x in await r.lrange(f"perf:shard_ms:{key}", 0, 99)]
    src = f"perf:shard_ms:{key} 최근 {len(vals)}건 중앙값"
    if not vals:
        try:
            async with db(realm="lx") as conn:
                rows = await conn.fetch("SELECT (metrics->>'ms')::float AS ms FROM index_results i JOIN jobs j ON j.id=i.job_id "
                                        "WHERE metrics ? 'ms' AND (j.options->>'adapter'=$1 OR j.model_id=$1 OR j.kind=$1) "
                                        "ORDER BY i.id DESC LIMIT 100", key)
            vals = [x["ms"] for x in rows if x["ms"] is not None]
            src = f"index_results.metrics.ms 최근 {len(vals)}건 중앙값"
        except Exception:
            vals = []
    if not vals or not shards_n:
        return env(None, "s", "estimate", src if vals else f"{key} 실측 shard 없음", "첫 실행 뒤 채워짐")
    med = statistics.median(vals)
    return env(round(med * shards_n / 1000, 1), "s", "estimate", f"{src} {med:.0f} ms × {shards_n} shard",
               "순수 shard 시간(cpu 워커 1 · 순차) — 큐 대기·finalize(전역 집계·기록) 제외 · 실측 elapsed 는 이보다 길다")


async def power_budget() -> dict:
    """전력 예산(v1.1-18) — power:hot:{slot} 임대 상태. 지금 다른 워커가 쥐고 있으면 '보류 사유'로 보여 준다(제출은 막지 않음)."""
    r = await redis()
    pw = config.load_yaml("pools").get("power", {}) or {}
    mx = int(pw.get("max_hot_gpus", 1))
    leases = []
    for i in range(mx):
        h = await r.get(f"power:hot:{i}")
        ttl = await r.ttl(f"power:hot:{i}") if h else None
        leases.append({"slot": i, "holder": h, "ttl_s": ttl})
    held = [x for x in leases if x["holder"]]
    return {"max_hot_gpus": mx, "leases": leases, "hot_now": len(held),
            "hold_reason": "power_budget" if len(held) >= mx else None,
            "note": (f"고부하 GPU {len(held)}/{mx} — 같은 워커가 이어받거나 임대 반납 뒤 시작" if len(held) >= mx else f"고부하 GPU {len(held)}/{mx}"),
            "power_limit_w": pw.get("power_limit_w")}


def _public_quote(q: dict) -> dict:
    return {k: v for k, v in q.items() if not k.startswith("_") and k not in ("kind", "demo") and not (k == "power_budget" and v is None)}


# ═══ 시군구 전역 분석(scope sgg · core-xi · 코어 ①) ═══════════════════════════════════════════════════════
# POST /jobs/quote|/jobs {kind:infer, options:{scope:"sgg", sgg_cd, center:[lng,lat]}} — 영상(catalog.best_imagery · 없으면 imagery 표),
# 모델(영상 해상도에 가장 가까운 학습 해상도 · 실측 속도 있는 것)은 서버가 고른다. 범위 = 시군구 읍면동 합집합 ∩ 영상 footprint.
# 칸은 화면 중심에서 가까운 읍면동부터(workers.scheduler.plan_sgg — 스케줄러와 같은 함수). 해상도는 칸 수가 SGG_MAX_SHARDS 이하인 가장 높은 값.
# 2026-09-29 실측(A6000 1장 · aerial25/best · 25cm VRT · 오버뷰 없음): 원 해상도 12–16칸/s 가 낮춘 해상도(0.5 ≈ 4.9칸/s)보다 빠르다 —
# 그래서 시군구 전역은 원 해상도를 기본으로, 칸이 SGG_MAX_SHARDS 를 넘을 때만 낮춘다(예시 지역 원 해상도 15,527칸 · 실측은 보고서).
SGG_MAX_SHARDS = 20000
_sgg_seen: dict[str, tuple[float, float]] = {}
_sgg_plans: dict[str, tuple] = {}


async def _best_imagery(sgg_cd: str, codes: list[str], land_geojson: dict | None, tenant_realm: bool) -> dict:
    """core-imagery 계약(catalog.best_imagery)이 있으면 그것, 없으면 imagery 표에서 — 이 시군구(지금/옛 코드) 행 또는 footprint 가 겹치는 행 중
    추론 가능한(원본 경로 있음) 정사영상. 순서: 덮는 비율 20% 이상 → 해상도(25cm 에 가까운 순) → 연도 최신 → 덮는 비율."""
    try:
        from .catalog import best_imagery  # core-imagery 계약
        import inspect
        res = best_imagery(sgg_cd, land_geojson)
        if inspect.isawaitable(res):
            res = await res
        if isinstance(res, dict):
            return res
    except ImportError:
        pass
    except Exception as e:  # 계약 함수 오류 — 표에서 다시 고른다
        import logging
        logging.getLogger("landxi").warning("best_imagery error %r", e)
    async with db(realm="lx") as conn:
        rows = await conn.fetch(
            "SELECT id, gsd_m, year, epoch, kind, tier, sgg_cd, export_policy, ST_AsGeoJSON(footprint)::json AS fp FROM imagery "
            "WHERE path_internal IS NOT NULL AND kind='ortho' AND gsd_m < 1 AND footprint IS NOT NULL "
            "AND (sgg_cd = ANY($1::text[]) OR ($2::text IS NOT NULL AND ST_Intersects(footprint, ST_SetSRID(ST_GeomFromGeoJSON($2),4326))))",
            codes, json.dumps(land_geojson) if land_geojson else None)
    land = shape(land_geojson) if land_geojson else None
    best = None
    for x in rows:
        if tenant_realm and x["tier"] == "raw":
            continue
        try:
            fp = shape(x["fp"])
            cov = (fp.intersection(land).area / max(land.area, 1e-12)) if land is not None else 1.0
        except Exception:
            cov = 0.0
        if cov < 0.005:
            continue
        g = float(x["gsd_m"] or 1)
        import math
        ep = str(x["epoch"] or "")[:4]
        yr = int(x["year"] or (ep if ep.isdigit() else 0) or 0)
        key = (0 if cov >= 0.2 else 1, round(abs(math.log(g / 0.25)), 2), -yr, -cov)
        if best is None or key < best[0]:
            best = (key, {"imagery_id": x["id"], "gsd_m": g, "year": yr or None, "coverage": round(min(1.0, cov), 4), "source": "local"})
    return best[1] if best else {"imagery_id": None, "reason": "no_imagery"}


async def _pick_model(conn, img_kind: str, gsd: float):
    rows = await conn.fetch("SELECT * FROM models WHERE status='registered' AND gsd_trained_m IS NOT NULL AND input ? $1::text "
                            "AND (perf->'chips_per_s'->>'value') IS NOT NULL", img_kind)
    import math
    rows = sorted(rows, key=lambda m: abs(math.log(float(m["gsd_trained_m"]) / max(gsd, 1e-6))))
    return rows[0] if rows else None


def _hull(aoi: dict | None) -> dict | None:
    if not aoi:
        return None
    g = shape(aoi)
    h = g.convex_hull.simplify(0.0005)
    if h.geom_type != "Polygon":
        h = g.envelope
    return mapping(h)


# ── 영상 범위 문장(r3-xi · M12 · plan 3.3 · 4절 기본값) — 답 · 확인 카드 · 진행판이 이 한 함수의 글자를 그대로 쓴다 ──────────
FULL_COVER = 0.95          # 영상이 시군구를 95% 이상 덮을 때만 '전역'


def _pct_words(cov: float, lang: str) -> str:
    p = float(cov or 0) * 100
    if lang == "en":
        return "less than 1%" if p < 1 else f"about {round(p)}%"
    return "1% 미만" if p < 1 else f"약 {round(p)}%"


def scope_words(cov: float | None, n: int | None, m: int | None, lang: str = "ko") -> str | None:
    """영상 범위 → 사용자 말 한 줄. 덮는 비율이 95% 이상이면 '전역', 아니면 '영상이 있는 곳만'. 값이 없으면 None(지어내지 않는다)."""
    if cov is None or m is None:
        return None
    if cov >= FULL_COVER:
        return f"Analyzing the whole area — all {m} districts" if lang == "en" else f"시군구 전역을 분석합니다 — 읍면동 {m}곳"
    if lang == "en":
        return f"Analyzing only where imagery exists — {n} of {m} districts, {_pct_words(cov, 'en')} of the area"
    return f"영상이 있는 곳만 분석합니다 — 읍면동 {n}곳, 시군구 면적의 {_pct_words(cov, 'ko')}"


REST_WORDS = {"ko": "나머지는 영상 등록 후 분석", "en": "The rest can be analyzed after imagery is registered"}


def scope_block(sc: dict | None) -> dict | None:
    """sgg_scope 결과 → 견적 · 작업 옵션에 넣는 범위 봉투 묶음(coverage · emd_covered · emd_total) + 문장."""
    if not sc:
        return None
    cov, n, m = float(sc["coverage"]), int(sc["emd_covered"]), int(sc["emd_total"])
    src = "시군구 읍면동 ∩ 영상 footprint(EPSG:5186)"
    return {"coverage": env(round(cov, 4), "ratio", "measured", src, None if cov >= FULL_COVER else "영상이 있는 곳만 분석"),
            "emd_covered": env(n, "count", "measured", f"{src} · 1 ha 이상 겹치는 읍면동"),
            "emd_total": env(m, "count", "recorded", "V-World LT_C_ADEMD_INFO(읍면동 경계)"),
            "full": cov >= FULL_COVER, "text": scope_words(cov, n, m, "ko"), "text_en": scope_words(cov, n, m, "en"),
            "rest": None if cov >= FULL_COVER else REST_WORDS["ko"], "rest_en": None if cov >= FULL_COVER else REST_WORDS["en"],
            "emds": [{"emd_cd": e["emd_cd"], "name": e["name"]} for e in sc.get("emds") or []]}


async def _sgg_scope(img_id: str, cd: str) -> dict | None:
    from workers.scheduler import sgg_scope
    try:
        return await run_in_threadpool(sgg_scope, img_id, cd)
    except Exception as e:                              # noqa: BLE001 — 범위를 못 세면 문장을 내지 않는다(지어내지 않음)
        import logging
        logging.getLogger("landxi").warning("sgg_scope %s %s: %r", img_id, cd, e)
        return None


@router.get("/jobs/scope/{sgg_cd}")
async def job_scope(sgg_cd: str, request: Request):
    """시군구 AI 분석이 덮을 범위(확인 카드용 · GPU·모델 적재 0 · 계획 0) — 영상은 전역 분석 견적과 같은 규칙으로 고른다."""
    from . import regions as R
    p = require(principal(request))
    reg = R.region_of(sgg_cd)
    if not reg:
        raise ApiError("not_found", "해당 지역이 없습니다", {"sgg_cd": sgg_cd})
    R.ensure_region(p, reg["sgg_cd"])                   # 기관 계정: 관할 밖 = 없는 지역
    cd = reg["sgg_cd"]
    ix = await run_in_threadpool(R.emd_index, cd)
    if ix is None or not len(ix):
        raise ApiError("upstream_unavailable", "읍면동 경계를 받을 수 없습니다", {"sgg_cd": cd}, status=503)
    best = await _best_imagery(cd, R.sgg_codes(cd), mapping(ix.union.simplify(0.0002)), p.realm == "tenant")
    base = {"sgg_cd": cd, "region_name": reg["name"], "as_of": now_iso()}
    if not best.get("imagery_id"):
        return {**base, "imagery": None, "reason": best.get("reason") or "no_imagery", "coverage": env(0.0, "ratio", "measured", "시군구 ∩ 영상", "영상 없음"),
                "emd_covered": env(0, "count", "measured", "시군구 ∩ 영상"), "emd_total": env(len(ix), "count", "recorded", "V-World LT_C_ADEMD_INFO(읍면동 경계)"),
                "text": None, "text_en": None}
    blk = scope_block(await _sgg_scope(best["imagery_id"], cd))
    return {**base, "imagery": {"id": best["imagery_id"], "year": best.get("year")}, **(blk or {})}


async def _quote_sgg(p: Principal, body: dict, opts: dict, demo: bool, tenant: str, reasons: list[str]) -> dict:
    from . import regions as R
    sgg_in = str(opts.get("sgg_cd") or body.get("sgg_cd") or "")
    reg = R.region_of(sgg_in)
    if not reg:
        raise ApiError("not_found", "해당 지역이 없습니다", {"sgg_cd": sgg_in})
    cd = reg["sgg_cd"]
    codes = R.sgg_codes(cd)
    ix = await run_in_threadpool(R.emd_index, cd)
    if ix is None or not len(ix):
        raise ApiError("upstream_unavailable", "읍면동 경계를 받을 수 없습니다", {"sgg_cd": cd}, status=503)
    land = ix.union
    land_simple = mapping(land.simplify(0.0002))
    chip = int(opts.get("chip", 1024))
    center = opts.get("center")
    if not (isinstance(center, (list, tuple)) and len(center) == 2):
        c = land.representative_point()
        center = [round(c.x, 6), round(c.y, 6)]
    base = {"scope": "sgg", "sgg_cd": cd, "region_name": reg["name"], "emd_total": env(len(ix), "count", "recorded", "V-World LT_C_ADEMD_INFO(읍면동 경계)"), "center": center}
    if p.role == "sales" and not demo:
        reasons.append("demo_required")
    async with db(realm="lx") as conn:
        if body.get("imagery_id"):
            row = await conn.fetchrow("SELECT id, gsd_m, year FROM imagery WHERE id=$1", body["imagery_id"])
            best = {"imagery_id": row["id"], "gsd_m": float(row["gsd_m"] or 0), "year": row["year"], "coverage": None, "source": "local"} if row else \
                {"imagery_id": None, "reason": "no_imagery"}
        else:
            best = await _best_imagery(cd, codes, land_simple, p.realm == "tenant")
        model = img = None
        if best.get("imagery_id"):
            model, img = await _load(conn, body.get("model_id"), best["imagery_id"])
            if model is None and img is not None:
                model = await _pick_model(conn, img["kind"], float(img["gsd_m"] or 0.25))
    no_img = {**base, "area_km2": env(None, "km2", "measured", "시군구 ∩ 영상", "영상 없음"), "shards": 0,
              "shards_env": env(0, "count", "measured", "plan_sgg"), "gpu_s": env(None, "gpu_s", "estimate", "영상 없음"),
              "eta_s": env(None, "s", "estimate", "영상 없음"), "quota": None, "allowed": False, "pool": config.POOL, "kind": "infer",
              "demo": demo, "power_budget": None, "coverage": env(0.0, "ratio", "measured", "시군구 읍면동 ∩ 영상 footprint"),
              "emd_covered": env(0, "count", "measured", "시군구 읍면동 ∩ 영상 footprint"),
              "imagery": None, "_aoi": None, "_tenant": tenant, "_model": None, "_img": None, "_adapter": None, "_opts": None}
    if not img:
        reasons.append(best.get("reason") or "no_imagery")
        return {**no_img, "reasons": reasons}
    if not model:
        reasons.append("model_input_mismatch")
        return {**no_img, "reasons": reasons}
    if p.realm == "tenant" and img["tier"] == "raw":
        reasons.append("imagery_forbidden")
    fit = fit_upsample(model, img)
    ladder = [fit] + [u for u in LIVE_LADDER if u < fit]
    key = f"{cd}|{img['id']}|{model['id']}|{chip}|{opts.get('overlap')}"
    hit = _sgg_seen.get(key)
    if hit and time.time() - hit[1] < 600 and hit[0] in ladder:
        ladder = ladder[ladder.index(hit[0]):]
    from workers.scheduler import plan_sgg
    grid = sh = info = None
    up = ladder[0]
    for up in ladder:
        pk = f"{key}|{up}|{json.dumps(center)}"
        hitp = _sgg_plans.get(pk)
        if hitp and time.time() - hitp[0] < 600:
            sh, info = hitp[1], hitp[2]                 # 견적 → 실행(10분 안) — 같은 계획을 다시 세우지 않는다(실행 → 첫 결과 단축)
        else:
            try:
                grid, sh, info = await run_in_threadpool(plan_sgg, img["id"], cd, center=center, chip=chip, overlap=opts.get("overlap"), upsample=up)
            except RuntimeError as e:
                raise ApiError("upstream_unavailable", f"전역 계획을 세울 수 없습니다: {e}", {"sgg_cd": cd}, status=503) from None
            _sgg_plans[pk] = (time.time(), sh, info)
            while len(_sgg_plans) > 8:
                _sgg_plans.pop(next(iter(_sgg_plans)))
        if len(sh) <= SGG_MAX_SHARDS:
            _sgg_seen[key] = (up, time.time())
            break
    shards_n = len(sh or [])
    cov = float((info or {}).get("coverage") or 0.0)
    if shards_n == 0 or cov < 0.005:
        reasons.append("no_imagery")
    elif shards_n > SGG_MAX_SHARDS:
        reasons.append("too_large")
    perf = model["perf"] or {}
    cps = (perf.get("chips_per_s") or {}).get("value")
    pool = pool_of(model)
    if cps:
        gpu_s = env(round(shards_n / cps, 1), "gpu_s", "estimate", f"models.perf({model['id']}) {cps} chips/s/GPU × {shards_n} shard")
        wk = await active_workers(pool)
        eta = env(round(shards_n / cps / max(1, len(wk)) + 3.0, 1), "s", "estimate", "gpu_s ÷ 워커 + 3 s")
    else:
        gpu_s = env(None, "gpu_s", "estimate", "bench 전")
        eta = env(None, "s", "estimate", "bench 전")
    q = await quota_mod.remaining(tenant, "gpu_s_month")
    if q["hard"] is not None and q["used"] + (gpu_s["value"] or 0) > q["hard"] and q["policy"] == "reject":
        reasons.append("quota_exceeded")
    aoi_full = (info or {}).get("aoi4326")
    by_cd = dict(zip(ix.codes, ix.names))
    emds = [{"emd_cd": e["emd_cd"], "name": by_cd.get(e["emd_cd"]), "shards": e["shards"]} for e in (info or {}).get("emd", [])]
    img_d = dict(img)
    # 영상 범위(r3-xi · M12) — coverage · emd_covered · emd_total 은 sgg_scope 한 곳에서(확인 카드 GET /jobs/scope 와 같은 값)
    sc = scope_block(await _sgg_scope(img_d["id"], cd))
    scope_env = {"coverage": sc["coverage"], "emd_covered": sc["emd_covered"], "emd_total": sc["emd_total"]} if sc else \
        {"coverage": env(round(cov, 4), "ratio", "measured", "시군구 읍면동 ∩ 영상 footprint", None if cov >= FULL_COVER else "영상이 있는 곳만 분석")}
    scope_txt = {"text": sc["text"], "text_en": sc["text_en"], "rest": sc["rest"], "rest_en": sc["rest_en"], "full": sc["full"]} if sc else None
    opt_scope = {"coverage": sc["coverage"]["value"], "emd_covered": sc["emd_covered"]["value"], "emd_total": sc["emd_total"]["value"],
                 "scope_text": sc["text"], "scope_text_en": sc["text_en"], "scope_rest": sc["rest"], "scope_full": sc["full"]} if sc else \
        {"coverage": round(cov, 4)}
    return {
        **base,
        "area_km2": env((info or {}).get("area_km2"), "km2", "measured", "시군구 읍면동 ∩ 영상 footprint(EPSG:5186)"),
        "shards": shards_n, "shards_env": env(shards_n, "count", "measured", f"plan_sgg(chip {chip} · upsample {up:g})"),
        "gpu_s": gpu_s, "eta_s": eta,
        "quota": {"tenant_id": tenant, "dim": "gpu_s_month", "remaining": env(None if q["hard"] is None else round(q["hard"] - q["used"], 1), "gpu_s",
                                                                             "measured", f"quotas({tenant})", "무제한" if q["hard"] is None else q.get("note")),
                  "policy": q["policy"]},
        "allowed": not reasons, "reasons": reasons, "pool": pool, "kind": "infer", "demo": demo,
        "power_budget": await power_budget() if pool != "cpu" else None,
        **scope_env, **({"scope": scope_txt} if scope_txt else {}),
        "imagery": {"id": img_d["id"], "gsd_m": float(img_d["gsd_m"] or 0), "kind": img_d["kind"], "year": best.get("year"), "source": best.get("source", "local")},
        "model_id": model["id"], "upsample": up, "emds": emds,
        "_aoi": _hull(aoi_full), "_tenant": tenant, "_model": dict(model), "_img": img_d, "_adapter": None, "_plan": sh,
        "_opts": {"scope": "sgg", "sgg_cd": cd, "center": center, "upsample": up, "area_km2": (info or {}).get("area_km2"), **opt_scope},
    }


async def prewarm(model_id: str | None, pool: str) -> list[str]:
    """실시간 분석 견적(options.live) 때 GPU 워커에 모델 적재를 미리 부탁한다 — 실행 → 첫 결과 ≤ 10 s.
    이미 올라 있는 워커는 건너뛴다. 적재는 워커가 전력 규칙(다른 GPU 고부하면 미룸)을 확인한 뒤에 한다(gpu_worker.control)."""
    if not model_id or pool == "cpu":
        return []
    r = await redis()
    sent = []
    for w in await active_workers(pool):
        try:
            have = json.loads(await r.hget(f"worker:{w}:vram", "models") or "[]")
        except Exception:
            have = []
        if model_id in have:
            continue
        await r.xadd(f"control:{w}", {"action": "load", "model_id": model_id, "by": "quote.live", "at": now_iso()}, maxlen=1000)
        sent.append(w)
    return sent


@router.post("/jobs/quote")
async def quote(body: dict, request: Request):
    p = require(principal(request))
    q = await quota_mod.hold_quote(await build_quote(p, body))          # 기관 한도를 넘었으면 새 분석 거절 + 이유 한 줄(impl-1 · C6)
    o = body.get("options") or {}
    if q.get("allowed") and (o.get("live") or o.get("scope") == "sgg") and q.get("_model"):
        try:
            await prewarm(q["_model"].get("id"), q.get("pool") or "cpu")
        except Exception:
            pass                                        # 미리 적재는 보조 — 실패해도 견적은 그대로
    return _public_quote(q)


def _iso(v):
    if v is None:
        return None
    if isinstance(v, str):
        return v
    return v.astimezone(KST).isoformat(timespec="seconds")


async def job_dict(row, live: dict | None = None) -> dict:
    live = live or {}
    counts = json.loads(live["counts"]) if live.get("counts") else (row["counts"] or {})
    state = live.get("state") or row["state"]
    if state in ("queued", "running") and live.get("counts_clean"):      # 진행 중 = 칸 겹침을 걸러 낸 수(스케줄러 · 진행판과 한 출처)
        try:
            counts = (json.loads(live["counts_clean"]) or {}).get("by") or counts
        except Exception:
            pass
    total_n = sum(counts.values()) if counts else 0
    cps = float(live["chips_per_s"]) if live.get("chips_per_s") else None
    gpu_s = float(live["gpu_s"]) if live.get("gpu_s") else float(row["gpu_s"] or 0)
    aoi = row["aoi"] if not isinstance(row["aoi"], str) else json.loads(row["aoi"])
    basis_counts = "demo" if row["demo"] else "inferred"
    return {
        "id": row["id"], "tenant_id": row["tenant_id"], "submitted_by": row["submitted_by"], "kind": row["kind"], "state": state,
        "priority": int(live.get("priority", row["priority"])), "demo": row["demo"], "pool": row["pool"],
        "model_id": row["model_id"], "imagery_id": row["imagery_id"], "deploy_id": row["deploy_id"], "card_id": row["card_id"],
        "aoi": aoi, "options": row["options"] or {},
        "shards_total": int(live.get("shards_total", row["shards_total"] or 0)),
        "shards_done": int(live.get("shards_done", row["shards_done"] or 0)),
        "shards_failed": int(live.get("shards_failed", row["shards_failed"] or 0)),
        "counts": counts,
        "counts_env": env(total_n, "count", basis_counts, row["id"], "진행 중 누적" if state == "running" else ("시연 · 결과 미기록" if row["demo"] else "검수 전")),
        "chips_per_s": env(cps, "chips_per_s", "measured", "gpu_worker 계량(창 10s)", None if cps else "첫 shard 뒤 채워짐"),
        "gpu_s": env(round(gpu_s, 2), "gpu_s", "measured", "usage_events" if not row["demo"] else "usage_events(lx-demo)"),
        "workers": json.loads(live["workers"]) if live.get("workers") else list(row["workers"] or []),
        "result_set": row["result_set"], "snapshot_ready": (live.get("snapshot_ready") == "1") if live.get("snapshot_ready") else row["snapshot_ready"],
        "created_at": _iso(row["created_at"]), "started_at": live.get("started_at") or _iso(row["started_at"]),
        "finished_at": live.get("finished_at") or _iso(row["finished_at"]), "error": live.get("error") or row["error"],
        **_perf_fields(row, live, state),
        "recovered": _recovered(live),
    }


def _perf_fields(row, live: dict, state: str) -> dict:
    """v1.1-6: job.done 과 같은 두 줄 실측 — 끝난 작업은 perf(jsonb · Redis 미러) 그대로, 진행 중이면 null + note."""
    perf = None
    if live.get("perf"):
        try:
            perf = json.loads(live["perf"])
        except Exception:
            perf = None
    if perf is None:
        try:
            perf = row["perf"]
        except (KeyError, IndexError):
            perf = None
        if isinstance(perf, str):
            perf = json.loads(perf)
    if perf:
        el = perf.get("elapsed_env") or env(perf.get("elapsed_s"), "s", "measured", "job.started → job.done")
        return {"chips_per_gpu_s": perf.get("chips_per_gpu_s"), "chips_per_wall_s": perf.get("chips_per_wall_s"), "elapsed_s": el}
    note = "job.done 뒤 채워짐" if state in ("queued", "running") else "이 작업은 v1.1 이전 실행 — 기록 없음"
    return {"chips_per_gpu_s": env(None, "chips_per_gpu_s", "measured", "shards_total ÷ gpu_s", note),
            "chips_per_wall_s": env(None, "chips_per_wall_s", "measured", "shards_total ÷ elapsed_s", note),
            "elapsed_s": env(None, "s", "measured", "job.started → job.done", note)}


def _recovered(live: dict) -> dict | None:
    if not live.get("recovered_mode"):
        return None
    return {"mode": live.get("recovered_mode"), "shards_done": int(live.get("recovered_done") or 0),
            "shards_total": int(live.get("recovered_total") or 0), "reason": live.get("recovered_reason"), "at": live.get("recovered_at"),
            "chip": (f"복구 · 재개 {live.get('recovered_done')}/{live.get('recovered_total')}" if live.get("recovered_mode") == "resumed"
                     else "복구 · 재투입" if live.get("recovered_mode") == "requeued" else "복구 실패")}


JOB_COLS = ("id, tenant_id, submitted_by, kind, state, priority, demo, pool, model_id, imagery_id, deploy_id, card_id, "
            "ST_AsGeoJSON(aoi)::json AS aoi, options, shards_total, shards_done, shards_failed, counts, gpu_s, workers, result_set, "
            "snapshot_ready, created_at, started_at, finished_at, error, label, perf")


async def publish(job_id: str, event: str, data: dict, *, ops: bool = False):
    r = await redis()
    eid = await r.xadd(f"events:{job_id}", {"event": event, "data": json.dumps(data, ensure_ascii=False)}, maxlen=10000, approximate=True)
    if ops:
        await r.xadd("ops:events", {"event": event, "data": json.dumps(data, ensure_ascii=False)}, maxlen=5000, approximate=True)
    return eid


TENANT_MIRROR = ("job.state", "usage.delta", "deploy.changed")


async def tenant_event(tenant_id: str | None, event: str, data: dict):
    """기관 스트림(v1.1-16) — workers.bus.tenant_event 의 async 판(게이트웨이용 · 같은 키 events:tenant:{tenant_id})."""
    if not tenant_id:
        return None
    r = await redis()
    d = {**data}
    d.setdefault("tenant_id", tenant_id)
    d.setdefault("at", now_iso())
    k = f"events:tenant:{tenant_id}"
    eid = await r.xadd(k, {"event": event, "data": json.dumps(d, ensure_ascii=False)}, maxlen=10000, approximate=True)
    try:
        await r.xtrim(k, minid=f"{int((time.time() - 86400) * 1000)}-0", approximate=True)
    except Exception:
        pass
    return eid


async def ops_event(event: str, data: dict):
    r = await redis()
    await r.xadd("ops:events", {"event": event, "data": json.dumps(data, ensure_ascii=False)}, maxlen=5000, approximate=True)
    if event in TENANT_MIRROR and data.get("tenant_id"):
        await tenant_event(data["tenant_id"], event, data)


def _centroid(aoi, img) -> list | None:
    g = aoi or (img or {}).get("fp")
    if not g:
        return None
    c = shape(g).centroid
    return [round(c.x, 6), round(c.y, 6)]


@router.post("/jobs", status_code=202)
async def submit(body: dict, request: Request):
    p = require(principal(request))
    if p.realm == "tenant" and p.role != "manager":
        raise ApiError("forbidden", "제출 권한 없음")
    if p.role == "sales" and not body.get("demo"):
        raise ApiError("demo_required", "영업 계정은 시연(demo:true)만 실행할 수 있습니다")
    q = await quota_mod.hold_quote(await build_quote(p, body))          # 기관 한도를 넘었으면 새 분석 거절 + 이유 한 줄(impl-1 · C6)
    if not q["allowed"]:
        code = q["reasons"][0]
        msg = q.get("reason_line") if code == "quota_exceeded" else None
        msg = msg or {"power_budget": "전력 예산 초과 — 동시 고부하 GPU 는 1장까지입니다", "too_large": "작업이 너무 큽니다 — 범위를 나눠 주세요"}.get(code)
        raise ApiError(code, msg or f"제출 불가: {', '.join(q['reasons'])}", {"reasons": q["reasons"]},
                       status=409 if code == "power_budget" else None)
    # 시군구 전역(scope sgg · 긴 작업)은 기본 우선순위 1 — 읍면동 실시간 분석 · 소범위 작업이 먼저 칸을 받는다(첫 결과 ≤ 10 s 유지)
    long_job = body.get("kind") == "reinfer" or (body.get("options") or {}).get("scope") == "sgg"
    prio = int(body.get("priority", 0 if body.get("demo") else (1 if long_job else 0)))
    tenant = q["_tenant"]
    qpol = await quota_mod.remaining(tenant, "gpu_s_month")
    if qpol["hard"] is not None and qpol["used"] + (q["gpu_s"]["value"] or 0) > qpol["hard"] and qpol["policy"] == "queue_low":
        prio = 3
    job_id = "job_" + ulid()
    demo = bool(body.get("demo"))
    rs = f"demo/{job_id}" if demo else f"results/{tenant}/{job_id}"
    img = q["_img"]
    aoi = q["_aoi"]
    opts = dict(body.get("options") or {})
    if body.get("params"):
        opts["params"] = body["params"]
    for k in ("survey_id", "rules", "emd_cd", "thresholds"):
        if k in body and k not in opts:
            opts[k] = body[k]
    if q.get("_adapter"):
        opts.setdefault("adapter", q["_adapter"])
    if q.get("_opts"):
        opts.update(q["_opts"])
    is_test = bool(body.get("test")) or str(body.get("label") or "").lower().startswith(("pytest", "test/"))
    # 시군구 전역 분석은 서버가 영상 · 모델을 고른다(견적과 같은 값)
    server_pick = opts.get("scope") == "sgg" or bool(q.get("_auto"))          # 전역 분석 · 읍면동/그린 범위(영상 id 없이 온 것)
    model_id = body.get("model_id") or (opts.get("base_model") if q["kind"] == "train" else None) or         ((q.get("_model") or {}).get("id") if server_pick else None)
    imagery_id = body.get("imagery_id") or (opts.get("imagery_id") if q["kind"] == "tile" else None) or         ((q.get("_img") or {}).get("id") if server_pick else None)
    async with db(p) if p.realm == "tenant" else db(realm="lx") as conn:
        await conn.execute(
            "INSERT INTO jobs(id, tenant_id, submitted_by, kind, state, priority, demo, pool, model_id, imagery_id, deploy_id, card_id, aoi, "
            "options, shards_total, result_set, label, test) VALUES ($1,$2,$3,$4,'queued',$5,$6,$7,$8,$9,$10,$11,"
            "CASE WHEN $12::text IS NULL THEN NULL ELSE ST_SetSRID(ST_GeomFromGeoJSON($12),4326) END,$13,$14,$15,$16,$17)",
            job_id, tenant, p.user_id, q["kind"], prio, demo, q["pool"], model_id,
            imagery_id,
            body.get("deploy_id"), body.get("card_id"), json.dumps(aoi) if aoi else None, opts, q["shards"], rs, body.get("label"), is_test)
        await audit(conn, p, "job.submit", job_id, None, {"kind": q["kind"], "model_id": model_id, "imagery_id": imagery_id,
                                                           "demo": demo, "priority": prio})
    r = await redis()
    now = now_iso()
    await r.hset(f"job:{job_id}", mapping={
        "id": job_id, "state": "queued", "tenant_id": tenant, "demo": "1" if demo else "0", "kind": q["kind"], "pool": q["pool"],
        "priority": prio, "model_id": model_id or "", "imagery_id": imagery_id or "",
        "options": json.dumps(opts), "aoi": json.dumps(aoi) if aoi else "", "shards_total": q["shards"], "shards_done": 0,
        "shards_failed": 0, "counts": "{}", "gpu_s": 0, "result_set": rs, "created_at": now, "submitted_by": p.user_id or "",
        "centroid": json.dumps(_centroid(aoi, img)), "queued_at_ms": int(time.time() * 1000), "adapter": q.get("_adapter") or "",
        "deploy_id": body.get("deploy_id") or ""})
    if q.get("_plan"):
        # 시군구 전역: 견적에서 세운 계획(읍면동 순서)을 스케줄러에 넘긴다 — 스케줄러가 다시 세우지 않는다(scheduler.plan 이 먼저 본다)
        await r.set(f"jobplan:{job_id}", json.dumps(q["_plan"], ensure_ascii=False, separators=(",", ":")), ex=3600)
    await r.xadd(f"jobs:{q['pool']}", {"job_id": job_id, "priority": prio}, maxlen=10000, approximate=True)
    # 대기 위치 = 같은 풀에서 이 작업보다 먼저 처리될 작업 수
    async with db(realm="lx") as conn:
        pos = await conn.fetchval("SELECT count(*) FROM jobs WHERE pool=$1 AND state IN ('queued','running') AND id<>$2 AND priority<=$3",
                                  q["pool"], job_id, prio)
    await publish(job_id, "job.queued", {"job_id": job_id, "position": int(pos), "pool": q["pool"], "at": now})
    await ops_event("job.state", {"job_id": job_id, "tenant_id": tenant, "state": "queued", "aoi_centroid": _centroid(aoi, img),
                                  "pool": q["pool"], "at": now})
    async with db(realm="lx") as conn:
        row = await conn.fetchrow(f"SELECT {JOB_COLS} FROM jobs WHERE id=$1", job_id)
    job = await job_dict(row, await r.hgetall(f"job:{job_id}"))
    return {"job": job, "events_url": f"/api/v1/events/jobs/{job_id}"}


@router.get("/jobs")
async def list_jobs(request: Request, state: str | None = None, tenant_id: str | None = None, limit: int = 50, include_test: int | None = None,
                    kind: str | None = None, since: str | None = None):
    """pytest·시험 작업(test=true)은 기본 제외(관제·콘솔 목록 · S-9 시드 정리) — include_test=1 이면 포함.
    ?since=YYYY-MM-DD[THH:MM] → 그 뒤 작업만 + 기간 전체 건수(count · 목록 상한 500 과 무관 · ops-infra 요청)."""
    p = require(principal(request))
    since_ts = None
    if since:
        try:
            since_ts = dt.datetime.fromisoformat(since.replace("Z", "+00:00"))
            if since_ts.tzinfo is None:
                since_ts = since_ts.replace(tzinfo=KST)
        except ValueError:
            raise ApiError("bad_request", "since = YYYY-MM-DD 또는 ISO 시각")
    r = await redis()
    where = ("($1::text IS NULL OR state=$1) AND ($2::text IS NULL OR tenant_id=$2) AND ($3 OR NOT coalesce(test,false)) "
             "AND ($4::text IS NULL OR kind=$4) AND ($5::timestamptz IS NULL OR created_at >= $5)")
    args = (state, tenant_id, bool(include_test), kind, since_ts)
    async with db(p) as conn:
        rows = await conn.fetch(f"SELECT {JOB_COLS} FROM jobs WHERE {where} ORDER BY created_at DESC LIMIT {max(1, min(limit, 500))}", *args)
        n_all = await conn.fetchval(f"SELECT count(*) FROM jobs WHERE {where}", *args) if since_ts else None
    items = [await job_dict(x, await r.hgetall(f"job:{x['id']}")) for x in rows]
    out = {"items": items, "total": len(items), "as_of": now_iso()}
    if since_ts:
        out["since"] = since_ts.isoformat(timespec="seconds")
        out["count"] = env(int(n_all or 0), "count", "recorded", "jobs(created_at ≥ since)")
    return out


async def get_job_row(p: Principal, job_id: str):
    async with db(p) as conn:
        row = await conn.fetchrow(f"SELECT {JOB_COLS} FROM jobs WHERE id=$1", job_id)
    if not row:
        raise ApiError("not_found", f"job {job_id} 없음")
    return row


@router.get("/jobs/{job_id}")
async def get_job(job_id: str, request: Request):
    p = require(principal(request))
    row = await get_job_row(p, job_id)
    r = await redis()
    return await job_dict(row, await r.hgetall(f"job:{job_id}"))


async def _owner_or_admin(p: Principal, row):
    if not (p.is_admin or row["submitted_by"] == p.user_id):
        raise ApiError("forbidden", "제출자 또는 관리자만")


@router.post("/jobs/{job_id}/cancel")
async def cancel(job_id: str, request: Request):
    p = require(principal(request))
    row = await get_job_row(p, job_id)
    await _owner_or_admin(p, row)
    r = await redis()
    now = now_iso()
    if (await r.hget(f"job:{job_id}", "state") or row["state"]) in ("done", "failed", "cancelled"):
        return await job_dict(row, await r.hgetall(f"job:{job_id}"))
    await r.hset(f"job:{job_id}", mapping={"state": "cancelled", "finished_at": now})
    async with db(realm="lx") as conn:
        await conn.execute("UPDATE jobs SET state='cancelled', finished_at=now() WHERE id=$1", job_id)
        await audit(conn, p, "job.cancel", job_id)
    await publish(job_id, "job.cancelled", {"job_id": job_id, "at": now})
    await ops_event("job.state", {"job_id": job_id, "tenant_id": row["tenant_id"], "state": "cancelled",
                                  "aoi_centroid": json.loads(await r.hget(f"job:{job_id}", "centroid") or "null"), "pool": row["pool"], "at": now})
    row = await get_job_row(p, job_id)
    return await job_dict(row, await r.hgetall(f"job:{job_id}"))


@router.post("/jobs/{job_id}/requeue")
async def requeue(job_id: str, request: Request):
    p = require(principal(request))
    row = await get_job_row(p, job_id)
    await _owner_or_admin(p, row)
    r = await redis()
    now = now_iso()
    await r.delete(f"job:{job_id}:done", f"job:{job_id}:failed", f"job:{job_id}:cursor", f"job:{job_id}:final_progress",
                   f"job:{job_id}:finalize", f"job:{job_id}:ts", f"job:{job_id}:counts", f"job:{job_id}:progress_lock")
    await r.hdel(f"job:{job_id}", "first_done_ts", "perf", "chips_per_s", "recovering")
    await r.hset(f"job:{job_id}", mapping={"state": "queued", "shards_done": 0, "shards_failed": 0, "counts": "{}", "gpu_s": 0,
                                           "snapshot_ready": "0", "error": "", "finished_at": "", "started_at": "",
                                           "queued_at_ms": int(time.time() * 1000)})
    async with db(realm="lx") as conn:
        await conn.execute("UPDATE jobs SET state='queued', shards_done=0, shards_failed=0, counts='{}', snapshot_ready=false, error=NULL, "
                           "started_at=NULL, finished_at=NULL WHERE id=$1", job_id)
        await conn.execute("DELETE FROM detections WHERE job_id=$1", job_id)
        await audit(conn, p, "job.requeue", job_id)
    await r.xadd(f"jobs:{row['pool']}", {"job_id": job_id, "priority": row["priority"]})
    await publish(job_id, "job.queued", {"job_id": job_id, "position": 0, "pool": row["pool"], "at": now, "requeue": True})
    row = await get_job_row(p, job_id)
    return await job_dict(row, await r.hgetall(f"job:{job_id}"))


@router.post("/jobs/{job_id}/priority")
async def set_priority(job_id: str, body: dict, request: Request):
    p = require(principal(request))
    row = await get_job_row(p, job_id)
    await _owner_or_admin(p, row)
    prio = int(body.get("priority", row["priority"]))
    if prio not in (0, 1, 2, 3):
        raise ApiError("bad_request", "priority 0..3")
    r = await redis()
    await r.hset(f"job:{job_id}", "priority", prio)
    async with db(realm="lx") as conn:
        await conn.execute("UPDATE jobs SET priority=$2 WHERE id=$1", job_id, prio)
        await audit(conn, p, "job.priority", job_id, {"priority": row["priority"]}, {"priority": prio})
    row = await get_job_row(p, job_id)
    return await job_dict(row, await r.hgetall(f"job:{job_id}"))


@router.delete("/jobs/{job_id}")
async def delete_job(job_id: str, request: Request):
    return await cancel(job_id, request)
