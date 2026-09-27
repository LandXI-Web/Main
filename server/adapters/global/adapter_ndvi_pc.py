"""G-J1 · index/ndvi_pc — Planetary Computer Sentinel-2 L2A 월별 NDVI(지수 계산 · 모델 추론 아님) — F1-CONTRACT §7.

워커 등록: 모듈 상단 `ADAPTER` 상수(F1-B 워커가 server/adapters/**/adapter_*.py 를 스캔). CPU 전용 · 입력 params · 출력 metrics.
shard.params = {"month": "2025-06", "aoi": [minx,miny,maxx,maxy] | GeoJSON Polygon, "cloud_max": 15}
  1) PC STAC 검색 — s2:mgrs_tile = 43TEH 만(§10.3) · eo:cloud_cover < cloud_max
  2) SAS 토큰(/api/sas/v1/token/sentinel-2-l2a) → /vsicurl/ B04·B08·SCL 창 읽기(분석 격자 EPSG:32643 · 40 m)
  3) WorldCover 2021 COG(S3 · map == 40 농경지) 마스크 · SCL 구름/그림자/눈 제외
  4) 화소 합산 평균 NDVI → ShardResult(metrics={"ndvi_mean", "n_scenes", …}, n=n_scenes)
  PC 장애 → LX_DATA_ROOT/global/ysykata-ndvi-2025.json 캐시로 basis 'recorded'.

단독 실행(완료 기준 7):
  python -m server.adapters.global.adapter_ndvi_pc --month 2025-06 --aoi 74.70,42.75,75.20,43.00
  python -m server.adapters.global.adapter_ndvi_pc --all            # 8개월 · 캐시 ysykata-ndvi-2025.json 갱신
  python -m server.adapters.global.adapter_ndvi_pc --serve 8711     # F1-B 게이트웨이가 없을 때 쓰는 F1-D 개발 하니스
                                                                    # (계약 §4.4 · §5.1 부분집합 · 프로세스 안 큐 · 워커 cpu-0 · Redis 없음)
"""
import argparse
import importlib
import json
import math
import os
import sys
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
G = importlib.import_module("server.adapters.global")

HIST_BINS = 20   # 계약 v1.1-10: index.month hist bins 20 (-0.2…0.8 · 폭 0.05)
ADAPTER = {"id": "index/ndvi_pc", "kinds": ["index"], "device": "cpu", "input": "params", "output": "metrics",
           "models": ["index/ndvi_pc"], "owner": "F1-D"}

PC = "https://planetarycomputer.microsoft.com/api"
MGRS = "43TEH"
WC_URL = "https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_N42E0{lon}_Map.tif"
CROP = 40
RES_M = 40
SCL_BAD = {0, 1, 3, 8, 9, 10, 11}   # nodata · saturated · 그림자 · 구름 중/고 · 권운 · 눈
CACHE = G.GLOBAL_ROOT / "ysykata-ndvi-2025.json"
MEASURE_SRC = "PC S2 L2A B04/B08 · WorldCover 40 mask"

# ── 계약 §7 자료형: F1-B base.py 가 있으면 그것, 없으면 같은 모양의 로컬 정의 ─────────────
try:  # pragma: no cover — F1-B 산출 도착 후
    _base = importlib.import_module("server.adapters.base")
    Shard, ShardResult = _base.Shard, _base.ShardResult
except Exception:  # noqa: BLE001
    @dataclass
    class Shard:  # type: ignore[no-redef]
        id: str
        job_id: str
        bbox4326: tuple
        window: dict | None = None
        params: dict | None = None

    @dataclass
    class ShardResult:  # type: ignore[no-redef]
        features: list = field(default_factory=list)
        metrics: dict = field(default_factory=dict)
        n: int = 0
        ms: int = 0


def _gdal_env():
    os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
    os.environ.setdefault("CPL_VSIL_CURL_ALLOWED_EXTENSIONS", ".tif,.TIF")
    os.environ.setdefault("VSI_CACHE", "TRUE")
    os.environ.setdefault("GDAL_HTTP_MULTIRANGE", "YES")
    os.environ.setdefault("GDAL_HTTP_MERGE_CONSECUTIVE_RANGES", "YES")


def _aoi_bbox(aoi) -> list[float]:
    if isinstance(aoi, (list, tuple)):
        return [float(v) for v in aoi]
    if isinstance(aoi, str):
        return [float(v) for v in aoi.split(",")]
    from shapely.geometry import shape
    return list(shape(aoi).bounds)


class NdviPcAdapter:
    """계약 §7 Adapter 프로토콜 구현."""

    def __init__(self):
        self.grid = None      # (transform, width, height, crs, bbox)
        self.mask = None      # 농경지 bool 배열(분석 격자)
        self.sas = None
        self.sas_at = 0.0
        self.http = None

    # 계약: load(model, device, vram_budget_mib) — CPU 어댑터라 VRAM 을 쓰지 않는다(budget 무시 · 외부 프로세스 건드리지 않음)
    def load(self, model: dict | None = None, device: str = "cpu", vram_budget_mib: int = 0) -> None:
        import httpx
        _gdal_env()
        self.http = httpx.Client(timeout=60, headers=G.UA)

    def unload(self) -> None:
        if self.http:
            self.http.close()
        self.http = None

    # ── 분석 격자 · 농경지 마스크 ───────────────────────────────────
    def _grid(self, bbox):
        from pyproj import Transformer
        from rasterio.transform import from_origin
        if self.grid and self.grid[4] == bbox:
            return self.grid
        t = Transformer.from_crs("EPSG:4326", "EPSG:32643", always_xy=True)
        xs, ys = zip(*[t.transform(x, y) for x in (bbox[0], bbox[2]) for y in (bbox[1], bbox[3])])
        minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
        w = int(math.ceil((maxx - minx) / RES_M)); h = int(math.ceil((maxy - miny) / RES_M))
        self.grid = (from_origin(minx, maxy, RES_M, RES_M), w, h, "EPSG:32643", bbox)
        self.mask = None
        return self.grid

    def _read_to_grid(self, url, grid, resampling, dtype="float32", band=1):
        import numpy as np
        import rasterio
        from rasterio.enums import Resampling
        from rasterio.vrt import WarpedVRT
        tr, w, h, crs, _ = grid
        with rasterio.open(url) as src:
            with WarpedVRT(src, crs=crs, transform=tr, width=w, height=h, resampling=getattr(Resampling, resampling)) as vrt:
                return vrt.read(band, out_dtype=dtype).astype(dtype) if dtype else np.asarray(vrt.read(band))

    def _crop_mask(self, grid):
        import numpy as np
        if self.mask is not None:
            return self.mask
        bbox = grid[4]
        m = np.zeros((grid[2], grid[1]), dtype=bool)
        for lon in sorted({int(bbox[0] // 3 * 3), int(bbox[2] // 3 * 3)}):
            arr = self._read_to_grid("/vsicurl/" + WC_URL.format(lon=f"{lon:02d}"), grid, "nearest", dtype="uint8")
            m |= arr == CROP
        self.mask = m
        return m

    # ── PC ─────────────────────────────────────────────────────────
    def _sas(self):
        if self.sas and time.time() - self.sas_at < 30 * 60:
            return self.sas
        r = self.http.get(PC + "/sas/v1/token/sentinel-2-l2a")
        r.raise_for_status()
        self.sas, self.sas_at = r.json()["token"], time.time()
        return self.sas

    def _search(self, month, bbox, cloud_max):
        y, m = map(int, month.split("-"))
        ny, nm = (y + 1, 1) if m == 12 else (y, m + 1)
        body = {"collections": ["sentinel-2-l2a"], "bbox": bbox, "datetime": f"{month}-01T00:00:00Z/{ny}-{nm:02d}-01T00:00:00Z",
                "query": {"eo:cloud_cover": {"lt": cloud_max}, "s2:mgrs_tile": {"eq": MGRS}}, "limit": 100,
                "sortby": [{"field": "datetime", "direction": "asc"}]}
        r = self.http.post(PC + "/stac/v1/search", json=body)
        r.raise_for_status()
        return r.json()["features"]

    def _scene(self, item, grid, mask, sas):
        import numpy as np
        a = item["assets"]
        rd = lambda k, rs: self._read_to_grid(f"/vsicurl/{a[k]['href']}?{sas}", grid, rs)  # noqa: E731
        b4 = rd("B04", "average"); b8 = rd("B08", "average")
        scl = self._read_to_grid(f"/vsicurl/{a['SCL']['href']}?{sas}", grid, "nearest", dtype="uint8")
        # L2A 반사율: processing baseline ≥ 04.00 은 +1000 오프셋(BOA_ADD_OFFSET)
        off = 1000.0 if str(item["properties"].get("s2:processing_baseline", "05")) >= "04.00" else 0.0
        r = b4 - off; n = b8 - off
        ok = mask & ~np.isin(scl, list(SCL_BAD)) & (b4 > 0) & (b8 > 0) & ((n + r) > 0)
        nd = np.where(ok, (n - r) / np.where(ok, n + r, 1), np.nan)
        return nd[ok], int(ok.sum())

    def run_shard(self, shard: Shard, read=None, opts: dict | None = None) -> ShardResult:
        """read 는 raster-window 어댑터용 — params 어댑터라 쓰지 않는다(계약 §7 input:'params')."""
        import numpy as np
        t0 = time.time()
        p = shard.params or {}
        month = p["month"]
        bbox = _aoi_bbox(p.get("aoi") or shard.bbox4326)
        cloud_max = float(p.get("cloud_max", 15))
        try:
            if self.http is None:
                self.load()
            grid = self._grid(bbox)
            mask = self._crop_mask(grid)
            items = self._search(month, bbox, cloud_max)
            sas = self._sas()
            vals, per = [], []
            with ThreadPoolExecutor(4) as ex:
                for it, (v, n) in zip(items, ex.map(lambda it: self._scene(it, grid, mask, sas), items)):
                    if n:
                        vals.append(v)
                    per.append({"id": it["id"], "cloud": round(it["properties"]["eo:cloud_cover"], 1), "valid_px": n,
                                "ndvi_mean": round(float(np.nanmean(v)), 4) if n else None})
            allv = np.concatenate(vals) if vals else np.array([])
            hist, _ = np.histogram(allv, bins=HIST_BINS, range=(-0.2, 0.8)) if allv.size else (np.zeros(HIST_BINS, int), None)   # 계약 v1.1-10 · bins 20(0.05)
            ms = int((time.time() - t0) * 1000)
            asof = G.now_iso()
            metrics = {
                "ndvi_mean": G.env(round(float(allv.mean()), 4) if allv.size else None, "ndvi", "measured", MEASURE_SRC, as_of=asof,
                                   note=f"T{MGRS} {len(items)} scenes · cloud<{cloud_max:g} · SCL masked · {RES_M} m grid pixel-pooled"),
                "n_scenes": len(items), "valid_px": int(allv.size), "crop_px": int(mask.sum()),
                "p10": round(float(np.percentile(allv, 10)), 4) if allv.size else None,
                "p50": round(float(np.percentile(allv, 50)), 4) if allv.size else None,
                "p90": round(float(np.percentile(allv, 90)), 4) if allv.size else None,
                "hist": {"bins": [round(-0.2 + 1.0 / HIST_BINS * i, 3) for i in range(HIST_BINS + 1)], "counts": [int(c) for c in hist]},
                "scenes": per, "cloud_max": cloud_max, "mgrs": MGRS, "res_m": RES_M, "basis": "measured"}
            return ShardResult(features=[], metrics=metrics, n=len(items), ms=ms)
        except Exception as ex:  # noqa: BLE001 — PC 장애 → 기록 폴백(계약 §7)
            return self._recorded(month, str(ex)[:160], t0)

    def _recorded(self, month, err, t0):
        rec = {}
        try:
            rec = {m["month"]: m for m in json.loads(CACHE.read_text(encoding="utf-8"))["months"]}.get(month, {})
        except Exception:  # noqa: BLE001
            pass
        nd = dict(rec.get("ndvi_mean") or G.env(None, "ndvi", "recorded", str(CACHE)))
        nd.update({"basis": "recorded", "source": f"{CACHE.name} (PC outage fallback)", "note": f"PC error: {err}"})
        ns = (rec.get("n_scenes") or {}).get("value", 0)
        return ShardResult(features=[], metrics={"ndvi_mean": nd, "n_scenes": ns, "basis": "recorded", "error": err,
                                                 "hist": rec.get("hist"), "p10": rec.get("p10"), "p50": rec.get("p50"), "p90": rec.get("p90")},
                           n=ns, ms=int((time.time() - t0) * 1000))


def update_cache(month: str, res: ShardResult):
    """G-J1 job.done 뒤 캐시 갱신(measured 만 · 폴백 결과로 덮어쓰지 않는다)."""
    if res.metrics.get("basis") != "measured":
        return
    doc = json.loads(CACHE.read_text(encoding="utf-8"))
    for m in doc["months"]:
        if m["month"] == month:
            m["ndvi_mean"] = res.metrics["ndvi_mean"]
            for k in ("p10", "p50", "p90", "hist", "valid_px", "crop_px"):
                m[k] = res.metrics.get(k)
            m["scenes_used"] = res.metrics.get("scenes")
            m["ms"] = res.ms
    doc["updated_by"] = "adapter_ndvi_pc (G-J1)"
    G.write_out("ysykata-ndvi-2025.json", doc, indent=1)


# ── F1-D 개발 하니스(F1-B 게이트웨이 부재 시) ─────────────────────────────────
def serve(port: int):
    import uvicorn
    from fastapi import FastAPI, Request
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import JSONResponse, StreamingResponse
    import asyncio

    app = FastAPI(title="Land-XI F1-D harness")
    app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:4173", "http://localhost:8702"], allow_methods=["*"],
                       allow_headers=["*"], allow_credentials=False)
    jobs: dict[str, dict] = {}
    events: dict[str, list] = {}
    q: list[str] = []
    cv = threading.Condition()
    adapter = NdviPcAdapter(); adapter.load({"id": "index/ndvi_pc"}, "cpu", 0)
    screen = G.SCREEN
    HARNESS = "F1-D harness · in-process queue (Redis 없음) · F1-B 게이트웨이 도착 시 폐기"

    def now():
        return G.now_iso()

    def emit(jid, name, data):
        with cv:
            lst = events.setdefault(jid, [])
            lst.append({"id": str(len(lst) + 1), "event": name, "data": {"job_id": jid, **data, "at": now()}})
            cv.notify_all()

    def worker():
        while True:
            with cv:
                while not q:
                    cv.wait()
                jid = q.pop(0)
            j = jobs[jid]
            months = j["options"]["months"]
            j.update(state="running", started_at=now(), workers=["cpu-0"], shards_total=len(months))
            emit(jid, "job.started", {"shards_total": len(months), "workers": ["cpu-0"]})
            t0 = time.time()
            for m in months:
                sid = f"m{m}"
                emit(jid, "shard.started", {"shard_id": sid, "bbox": j["bbox"], "worker": "cpu-0", "month": m})
                res = adapter.run_shard(Shard(id=sid, job_id=jid, bbox4326=tuple(j["bbox"]), window=None,
                                              params={"month": m, "aoi": j["bbox"], "cloud_max": j["options"].get("cloud_max", 15)}))
                j["shards_done"] += 1
                mt = res.metrics
                emit(jid, "shard.done", {"shard_id": sid, "bbox": j["bbox"], "n": res.n, "classes": {}, "polys_url": None, "ms": res.ms, "worker": "cpu-0"})
                emit(jid, "index.month", {"shard_id": sid, "month": m, "ndvi_mean": mt["ndvi_mean"], "n_scenes": mt["n_scenes"],
                                          "cloud_max": j["options"].get("cloud_max", 15), "hist": mt.get("hist"), "p10": mt.get("p10"),
                                          "p50": mt.get("p50"), "p90": mt.get("p90"), "valid_px": mt.get("valid_px"), "basis": mt.get("basis")})
                emit(jid, "job.progress", {"shards_done": j["shards_done"], "shards_total": len(months), "counts": {"scenes": sum(1 for _ in [0])},
                                           "chips_per_s": G.env(None, "chips_per_s", "measured", "cpu-0", note="index calc — no chips"),
                                           "elapsed_s": round(time.time() - t0, 1), "gpu": []})
                if mt.get("basis") == "measured":
                    update_cache(m, res)
            j.update(state="done", finished_at=now())
            emit(jid, "job.done", {"counts": {"months": len(months)},
                                   "counts_env": G.env(len(months), "count", "measured", jid, note="month shards"),
                                   "gpu_s": G.env(0, "gpu_s", "measured", "cpu worker — no GPU"),
                                   "elapsed_s": round(time.time() - t0, 1), "result_set": f"index/{jid}"})

    threading.Thread(target=worker, daemon=True).start()

    def area_km2(b):
        from pyproj import Geod
        from shapely.geometry import box
        return abs(Geod(ellps="WGS84").geometry_area_perimeter(box(*b))[0]) / 1e6

    @app.get("/api/v1/health")
    def health():
        return {"ok": True, "version": "0.1.0-f1d", "redis": False, "pg": False, "workers": {"gpu": 0, "cpu": 1}, "at": now(), "harness": HARNESS}

    @app.post("/api/v1/auth/login")
    async def login(req: Request):
        b = await req.json()
        pw = os.environ.get("DEV_PASSWORD", "landxi-dev")
        if b.get("password") != pw:
            return JSONResponse({"error": {"code": "unauthorized", "message": "로그인 정보가 맞지 않습니다"}}, status_code=401)
        realm = b.get("realm")
        if realm == "tenant":
            return {"token": "lxt_" + uuid.uuid4().hex, "realm": "tenant", "role": "manager", "tenant_id": b.get("tenant_id"),
                    "user": {"id": f"u_{b.get('login')}", "name": b.get("login")}, "expires_at": "2099-01-01T00:00:00+09:00"}
        return {"token": "lxs_" + uuid.uuid4().hex, "realm": "lx", "role": (b.get("login") or "lx-staff").split("-")[-1], "tenant_id": None,
                "user": {"id": "u_" + (b.get("login") or ""), "name": b.get("login")}, "expires_at": "2099-01-01T00:00:00+09:00"}

    @app.get("/api/v1/catalog/layers")
    def catalog(stage: str = "global", build: str = "lx", locale: str = "en"):
        doc = json.loads((screen / "catalog-fixture-global.json").read_text(encoding="utf-8"))
        items = [i for i in doc["items"] if build_ok(i, build)]
        return {"items": items, "ladder": {"global": [i for i in doc["ladder"]["global"] if any(x["id"] == i for x in items)]}, "as_of": now()}

    @app.get("/api/v1/deploys")
    def deploys(tenant_id: str | None = None):
        doc = json.loads((screen / "deploys-fixture.json").read_text(encoding="utf-8"))
        return {"items": [d for d in doc["items"] if not tenant_id or d["tenant_id"] == tenant_id]}

    def quote_of(b):
        bb = _aoi_bbox(b.get("aoi"))
        a = area_km2(bb)
        months = (b.get("options") or {}).get("months") or []
        ok = b.get("kind") == "index" and b.get("model_id") == "index/ndvi_pc"
        return {"area_km2": G.env(round(a, 1), "km2", "measured", "pyproj Geod(WGS84) bbox"),
                "shards": len(months), "shards_env": G.env(len(months), "count", "measured", "scheduler.months(options.months)"),
                "gpu_s": G.env(0, "gpu_s", "estimate", "cpu 워커 — GPU 미사용"),
                "eta_s": G.env(None, "s", "estimate", "PC 응답 속도 의존", note="장면 수 × ≈3 s [추정]"),
                "quota": {"tenant_id": "kgz-agri", "dim": "area_km2_month", "remaining": G.env(None, "km2", "measured", "harness — quotas 없음", note="F1-B 도착 후"), "policy": "notify"},
                "allowed": ok, "reasons": [] if ok else ["model_input_mismatch"], "pool": "cpu"}, bb

    @app.post("/api/v1/jobs/quote")
    async def quote(req: Request):
        return quote_of(await req.json())[0]

    @app.post("/api/v1/jobs")
    async def submit(req: Request):
        b = await req.json()
        qt, bb = quote_of(b)
        if not qt["allowed"]:
            return JSONResponse({"error": {"code": qt["reasons"][0], "message": "index/ndvi_pc 만"}}, status_code=400)
        jid = "job_" + uuid.uuid4().hex[:24].upper()
        j = {"id": jid, "tenant_id": "kgz-agri", "submitted_by": "u_kgz_agri_manager", "kind": "index", "state": "queued", "priority": b.get("priority", 0),
             "demo": bool(b.get("demo")), "pool": "cpu", "model_id": "index/ndvi_pc", "imagery_id": b.get("imagery_id"), "deploy_id": b.get("deploy_id"),
             "card_id": b.get("card_id"), "aoi": b.get("aoi"), "options": b.get("options") or {}, "shards_total": qt["shards"], "shards_done": 0,
             "shards_failed": 0, "counts": {}, "counts_env": G.env(0, "count", "measured", jid), "chips_per_s": G.env(None, "chips_per_s", "measured", "cpu-0"),
             "gpu_s": G.env(0, "gpu_s", "measured", "cpu"), "workers": [], "result_set": f"index/{jid}", "snapshot_ready": False,
             "created_at": now(), "started_at": None, "finished_at": None, "error": None, "bbox": bb}
        jobs[jid] = j
        emit(jid, "job.queued", {"position": len(q), "pool": "cpu"})
        with cv:
            q.append(jid); cv.notify_all()
        return JSONResponse({"job": {k: v for k, v in j.items() if k != "bbox"}, "events_url": f"/api/v1/events/jobs/{jid}"}, status_code=202)

    @app.get("/api/v1/jobs/{jid}")
    def job(jid: str):
        j = jobs.get(jid)
        return {k: v for k, v in j.items() if k != "bbox"} if j else JSONResponse({"error": {"code": "not_found"}}, status_code=404)

    @app.get("/api/v1/events/jobs/{jid}")
    async def sse(jid: str, request: Request, last_event_id: str | None = None):
        start = int(last_event_id or request.headers.get("last-event-id") or 0)

        async def gen():
            i = start; hb = time.time()
            while True:
                lst = events.get(jid, [])
                while i < len(lst):
                    e = lst[i]; i += 1
                    yield f"id: {e['id']}\nevent: {e['event']}\ndata: {json.dumps(e['data'], ensure_ascii=False)}\n\n"
                    if e["event"] in ("job.done", "job.failed", "job.cancelled"):
                        return
                if await request.is_disconnected():
                    return
                if time.time() - hb > 10:
                    hb = time.time(); yield ": hb\n\n"
                await asyncio.sleep(0.1)
        return StreamingResponse(gen(), media_type="text/event-stream", headers={"cache-control": "no-store", "x-accel-buffering": "no"})

    print(f"F1-D harness http://localhost:{port}/api/v1 · {HARNESS}", flush=True)
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")


def build_ok(item: dict, build: str) -> bool:
    """라이선스 가드(계약 §4.1 · 설계서 §3.2): export 빌드는 비상업(NC)·EOX 2018+·Maxar 제외 · public 은 외부 위성만."""
    lic = (item.get("license") or "").upper()
    if build == "export":
        return item.get("export_policy") != "never" and "NC" not in lic
    if build == "public":
        return item.get("role") != "imagery" or item.get("source") == "external"
    return True


def main():
    ap = argparse.ArgumentParser(description="index/ndvi_pc — 지수 계산(모델 추론 아님)")
    ap.add_argument("--month")
    ap.add_argument("--aoi", default="74.70,42.75,75.20,43.00")
    ap.add_argument("--cloud-max", type=float, default=15)
    ap.add_argument("--all", action="store_true", help="2025-03…10 전부 · 캐시 갱신")
    ap.add_argument("--serve", type=int, help="F1-D 개발 하니스 포트")
    ap.add_argument("--no-cache", action="store_true")
    a = ap.parse_args()
    if a.serve:
        return serve(a.serve)
    ad = NdviPcAdapter(); ad.load({"id": "index/ndvi_pc"}, "cpu", 0)
    months = [f"2025-{m:02d}" for m in range(3, 11)] if a.all else [a.month]
    out = []
    for m in months:
        r = ad.run_shard(Shard(id=f"m{m}", job_id="cli", bbox4326=tuple(_aoi_bbox(a.aoi)), window=None,
                               params={"month": m, "aoi": a.aoi, "cloud_max": a.cloud_max}))
        if not a.no_cache:
            update_cache(m, r)
        slim = {k: v for k, v in r.metrics.items() if k != "scenes"}
        out.append({"shard": f"m{m}", "n": r.n, "ms": r.ms, "metrics": slim})
        print(json.dumps(out[-1], ensure_ascii=False), flush=True)
    ad.unload()


def make_adapter():
    """F1-B 워커(registry_scan.load_adapter) 진입점."""
    return NdviPcAdapter()


if __name__ == "__main__":
    main()
