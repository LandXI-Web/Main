"""영상 등록 타일 작업(F3 최종 명세 §3 S-5) + 영상 표준 변환(원칙 94 · 확인 대장 15차 영상-1~3) — kind 'tile' · CPU 워커.

POST /catalog/imagery 가 카탈로그 행을 만들고 이 작업을 큐에 넣는다. shard 2칸:
  inspect      영상 메타(CRS · 해상도 · 범위) → imagery.footprint · gsd_m · crs 갱신(등록 값과 다르면 실측이 이긴다).
               서버 파이썬이 못 여는 형식(ECW 등)은 그 형식을 읽는 GDAL 명령으로(landxi_api.imagery_std.inspect).
  standardize  표준 한 벌(COG · JPEG 90 · 축소판 · 빈 칸 마스크)로 바꾸고 확인 → 지도 · 분석이 표준본을 읽게(imagery.path_internal · layer.cog_path).
               원본: 플랫폼이 받은 원본(02. 데이터/cog/uploads)만 표준본 확인 날 + 90일에 지운다 — 서버 경로로 등록한 보관 영상은 그대로(원칙 17).
               표준본을 만들지 못하면(형식 · 디스크 · 큰 보관 영상) 예전처럼 원본 옆 축소판(.ovr)만 만든다.
기관 분석 의뢰로 올린 큰 파일도 같은 작업(options.std_id · shard 1칸 'standardize')으로 바꾼다 — 게이트웨이(requests.py)가 넣는다.
GPU 0 · 원본 파일은 바꾸지 않는다.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path

from adapters.base import ShardResult

ADAPTER = {"id": "tile/cog", "kinds": ["tile"], "device": "cpu", "input": "raster-path", "output": "metrics"}
_NOWIN = getattr(subprocess, "CREATE_NO_WINDOW", 0)


def plan(job: dict) -> list[dict]:
    o = job.get("options") or {}
    if o.get("std_id"):                                   # 기관 의뢰로 올린 파일 하나 — 표준으로 바꾸기만
        return [{"shard_id": "standardize", "std_id": o.get("std_id"), "epsg": o.get("epsg")}]
    return [{"shard_id": "inspect", "imagery_id": o.get("imagery_id"), "path": o.get("path")},
            {"shard_id": "standardize", "imagery_id": o.get("imagery_id"), "path": o.get("path")}]


def _cfg():
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from landxi_api import config
    return config


def _std():
    _cfg()
    from landxi_api import imagery_std
    return imagery_std


def _resolve(path: str) -> str:
    cfg = _cfg()
    return path if (os.path.isabs(path) or ":" in path[:3]) else str(cfg.DATA_ROOT / path)


def _pg():
    cfg = _cfg()
    import psycopg
    conn = psycopg.connect(cfg.PG_WORKER_DSN, autocommit=True)
    conn.execute("SELECT set_config('app.realm','lx',false), set_config('app.tenant_id','',false)")
    return conn


def _keepalive(job_id: str | None, shard_id: str, attempt) -> callable:
    """오래 걸리는 변환(큰 ECW 는 수십 분)이 스케줄러의 고아 감시(floor 120 s)에 걸리지 않게 — 이 시도가 아직 도는 동안
    비행 기록(inflight:cpu)의 시각을 30초마다 새로 적는다. 작업기가 죽으면 적지 못하므로 감시는 그대로 동작한다. → 멈추는 함수."""
    import threading
    if not job_id:
        return lambda: None
    cfg = _cfg()
    try:
        import redis
        rd = redis.Redis.from_url(cfg.REDIS_URL, decode_responses=True)
    except Exception:  # noqa: BLE001
        return lambda: None
    k, f = "inflight:cpu", f"{job_id}|{shard_id}"
    stop = threading.Event()

    def beat():
        while not stop.wait(30):
            try:
                v = rd.hget(k, f)
                if not v:
                    continue
                rec = json.loads(v)
                if int(rec.get("attempt") or 0) != int(attempt or 0) or not rec.get("worker"):
                    continue                                 # 감시자가 다시 배정한 시도 — 건드리지 않는다
                rec["ts"] = time.time()
                rd.hset(k, f, json.dumps(rec, ensure_ascii=False))
            except Exception:  # noqa: BLE001
                pass
    threading.Thread(target=beat, daemon=True, name=f"alive-{shard_id}").start()
    return stop.set


def _guess_epsg(info: dict, imagery_id: str | None) -> int | None:
    """좌표계 기록이 없는 영상(TFW 만 딸린 도엽 등) — 등록한 지역 안에 떨어지는 후보 좌표계(기관 의뢰의 위치 판정과 같은 후보 · 앞에서부터).
    번호만 붙이고 다시 그리지 않는다. 지역을 모르거나 맞는 후보가 없으면 None(예전처럼 중부원점으로 범위만 잰다)."""
    try:
        from affine import Affine
        from pyproj import Transformer
        cfg = _cfg()
        from landxi_api.regions import regions_base
        with _pg() as conn:
            row = conn.execute("SELECT sgg_cd FROM imagery WHERE id=%s", (imagery_id,)).fetchone()
        sgg = row[0] if row else None
        rg = next((x for x in regions_base()[0] if x["sgg_cd"] == sgg), None) if sgg else None
        bb = (rg or {}).get("bbox")
        if not bb:
            return None
        t = Affine.from_gdal(*info["transform"])
        cx, cy = t * (info["w"] / 2, info["h"] / 2)
        cand = (cfg.load_yaml("requests") or {}).get("crs_guess") or [5186, 5187, 5185, 5188, 5179, 32652, 32651]
        for c in cand:
            if int(c) == 4326:
                continue
            lng, lat = Transformer.from_crs(int(c), 4326, always_xy=True).transform(cx, cy)
            if bb[0] - 0.02 <= lng <= bb[2] + 0.02 and bb[1] - 0.02 <= lat <= bb[3] + 0.02:
                return int(c)
    except Exception:  # noqa: BLE001
        return None
    return None


def _job_gone(job_id: str | None) -> bool:
    if not job_id:
        return False
    try:
        import redis
        st = redis.Redis.from_url(_cfg().REDIS_URL, decode_responses=True).hget(f"job:{job_id}", "state")
        return st in ("failed", "cancelled", "done")
    except Exception:  # noqa: BLE001
        return False


class Adapter:
    def load(self, model, device, vram_budget_mib):
        return None

    def unload(self):
        return None

    def run_shard(self, shard, read, opts):
        p = shard.params or {}
        t0 = time.perf_counter()
        stop = _keepalive(opts.get("job_id"), shard.id, opts.get("attempt"))
        try:
            if p.get("std_id"):
                m = self._std_upload(p, opts)
            else:
                path = _resolve(p.get("path") or opts.get("path") or "")
                if shard.id == "inspect":
                    m = self._inspect(path, p)
                elif shard.id == "standardize":
                    m = self._standardize(path, p, opts)
                else:                                      # 예전 계획(overview) — 바꾸기 전에 대기열에 들어간 작업
                    m = self._overview(path)
        finally:
            stop()
        ms = int((time.perf_counter() - t0) * 1000)
        m["ms"] = ms
        return ShardResult(features=[], metrics=m, n=1, ms=ms)

    # ── 영상 메타 ──────────────────────────────────────────
    def _inspect(self, path: str, p: dict) -> dict:
        S = _std()
        info = S.inspect(path)
        epsg = info.get("epsg") or _guess_epsg(info, p.get("imagery_id"))
        from affine import Affine
        from pyproj import Transformer
        from shapely.geometry import box, mapping
        t = Affine.from_gdal(*info["transform"])
        w, h = info["w"], info["h"]
        pts = [t * (0, 0), t * (w, 0), t * (0, h), t * (w, h)]
        tf = Transformer.from_crs(epsg or 5186, 4326, always_xy=True)
        xs, ys = zip(*(tf.transform(x, y) for x, y in pts))
        fp = box(min(xs), min(ys), max(xs), max(ys))
        res = float(abs(t.a))
        gsd = res if (epsg and epsg != 4326) else None
        with _pg() as conn:
            conn.execute("UPDATE imagery SET footprint=ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(%s),4326)), crs=%s, "
                         "gsd_m=COALESCE(%s, gsd_m) WHERE id=%s",
                         (json.dumps(mapping(fp)), f"EPSG:{epsg}" if epsg else None, gsd, p.get("imagery_id")))
        return {"basis": "measured", "source": "영상 메타", "width_px": w, "height_px": h, "crs": epsg, "gsd_m": gsd,
                "bbox4326": [round(v, 6) for v in fp.bounds], "reader": info.get("reader")}

    # ── 표준으로 바꾸기(LX 영상 등록) ─────────────────────────
    def _standardize(self, path: str, p: dict, opts: dict) -> dict:
        S = _std()
        cfg = _cfg()
        iid = p.get("imagery_id")
        src = Path(path)
        rec = S.ensure("imagery", iid, src, tenant="lx", std_path=cfg.DATA_ROOT / "cog" / "std" / f"{iid}.tif")
        size = rec.get("orig_size") or 0
        if not rec["orig_owned"] and size > float(S.settings()["convert"]["auto_max_gb"]) * 1e9:
            S.update(rec["id"], state="deferred", error="큰 보관 영상 — 표준 변환은 밤 작업(사용자 결정 뒤)")
            m = self._overview(path)
            m["std"] = "deferred"
            return m
        try:
            guess = None if S.inspect(path).get("epsg") else _guess_epsg(S.inspect(path), iid)
        except Exception:  # noqa: BLE001
            guess = None
        out = S.run_record(rec["id"], job_id=opts.get("job_id"), epsg=guess)
        if out.get("state") != "ready":
            m = self._overview(path) if S.ext_of(path) in ("tif", "tiff", "img", "vrt") else {"note": "축소판 없음"}
            m.update({"std": out.get("state"), "error": out.get("error")})
            return m
        std = S.absolute(out["std_path"])
        if std.resolve() != src.resolve():
            with _pg() as conn:
                conn.execute("UPDATE imagery SET path_internal=%s, layer = coalesce(layer,'{}'::jsonb) || jsonb_build_object('cog_path', %s::text, "
                             "'orig_path', %s::text, 'std', %s::text) WHERE id=%s",
                             (out["std_path"], out["std_path"], S.rel(src), out["id"], iid))
        return {"std": "ready", "rule": out.get("rule"), "orig_size": out.get("orig_size"), "std_size": out.get("std_size"),
                "seconds": float(out.get("seconds") or 0), "delete_on": S.date_word(out.get("orig_delete_on"))}

    # ── 표준으로 바꾸기(기관 의뢰로 올린 큰 파일) ────────────────
    def _std_upload(self, p: dict, opts: dict) -> dict:
        S = _std()
        out = S.run_record(p["std_id"], job_id=opts.get("job_id"), epsg=p.get("epsg"))
        if out.get("state") == "converting" and out.get("job_id") == opts.get("job_id"):
            return {"std": "converting", "note": "같은 작업의 앞 시도가 아직 바꾸는 중 — 그 시도가 기록을 마무리한다"}
        if out.get("state") == "converting":                 # 다른 쪽(게이트웨이 · 다른 작업)이 바꾸는 중 — 끝날 때까지 기다린다(같은 파일을 둘이 바꾸지 않게)
            for _ in range(6 * 3600 // 10):
                time.sleep(10)
                out = S.get(p["std_id"]) or {}
                if out.get("state") != "converting" or _job_gone(opts.get("job_id")):
                    break
        return {"std": out.get("state"), "rule": out.get("rule"), "orig_size": out.get("orig_size"), "std_size": out.get("std_size"),
                "error": out.get("error")}

    # ── 예전 방식: 원본 옆 축소판(.ovr) ─────────────────────────
    def _overview(self, path: str) -> dict:
        import rasterio
        try:
            with rasterio.open(path) as ds:
                ovr = ds.overviews(1)
                w, h = ds.width, ds.height
        except Exception:  # noqa: BLE001
            return {"note": "서버 파이썬이 열지 못하는 형식 — 축소판 건너뜀"}
        if ovr:
            return {"overviews": ovr, "note": "내부 오버뷰 있음 — 건너뜀"}
        if Path(path + ".ovr").exists():
            return {"note": "외부 오버뷰 있음 — 건너뜀"}
        cfg = _cfg()
        exe = cfg.gdal_exe("gdaladdo")
        levels = [str(2 ** i) for i in range(1, 7) if max(w, h) / 2 ** i >= 256]
        if levels:
            subprocess.run([exe, "-ro", "-r", "average", "--config", "COMPRESS_OVERVIEW", "DEFLATE", path, *levels],
                           check=True, capture_output=True, env=cfg.gdal_env(), timeout=6 * 3600, creationflags=_NOWIN)
        return {"levels": levels, "note": "외부 오버뷰(.ovr) 생성"}


def finalize(job: dict) -> dict:
    """카탈로그 행을 '타일 준비됨'으로(layer.tile_ready) — 화면은 /catalog/layers 에서 이 영상을 본다."""
    o = job.get("options") or {}
    if not o.get("imagery_id"):
        return {"counts": {"standardized": 1}, "std_id": o.get("std_id")}
    cfg = _cfg()
    import psycopg
    with psycopg.connect(cfg.PG_WORKER_DSN, autocommit=True) as conn:
        conn.execute("UPDATE imagery SET layer = coalesce(layer,'{}'::jsonb) || jsonb_build_object('tile_ready', true, 'tile_job', %s::text) "
                     "WHERE id=%s", (job.get("id"), o.get("imagery_id")))
    return {"counts": {"imagery": 1}, "imagery_id": o.get("imagery_id")}
