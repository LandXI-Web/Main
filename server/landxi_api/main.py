"""Land-XI API 게이트웨이 :8700 (F1-CONTRACT §1) — uvicorn landxi_api.main:app --port 8700

접두 /api/v1 · 타일 /tiles · 파일 /files · SSE /api/v1/events. CORS = 4173(정적) · 8702(관제). 역프록시 없음(§10.4).
"""
from __future__ import annotations

import asyncio
import contextlib
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))   # server/ — workers 패키지 import

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import auth, catalog, config, deploys, events, feedback, jobs, ops, parcels, proxy, quota, registry, results, tiles
from .deps import ApiError, close, pool, redis
from .envelope import LXJSON, dumps, now_iso


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    await pool()
    await redis()
    task = asyncio.create_task(ops.alert_loop())
    yield
    task.cancel()
    await close()


app = FastAPI(title="Land-XI API", version=config.VERSION, default_response_class=LXJSON, lifespan=lifespan,
              docs_url="/api/v1/docs", openapi_url="/api/v1/openapi.json")
app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS, allow_credentials=False,
                   allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
                   allow_headers=["authorization", "content-type", "accept", "last-event-id", "range", "if-none-match"],
                   expose_headers=["content-range", "accept-ranges", "etag", "content-length", "x-lx-cache", "x-lx-render"], max_age=600)


@app.middleware("http")
async def principal_mw(request: Request, call_next):
    t0 = time.perf_counter()
    try:
        request.state.principal = await auth.resolve(request)
    except Exception:
        from .deps import Principal
        request.state.principal = Principal()
    resp = await call_next(request)
    resp.headers["X-LX-Time-ms"] = f"{(time.perf_counter() - t0) * 1000:.1f}"
    return resp


def _err(code: str, message: str, status: int, detail=None):
    e = ApiError(code, message, detail, status)
    return JSONResponse(e.body(), status_code=status)


@app.exception_handler(ApiError)
async def api_error(request: Request, exc: ApiError):
    return JSONResponse(exc.body(), status_code=exc.status)


@app.exception_handler(StarletteHTTPException)
async def http_error(request: Request, exc: StarletteHTTPException):
    code = {401: "unauthorized", 403: "forbidden", 404: "not_found", 405: "bad_request"}.get(exc.status_code, "bad_request")
    return _err(code, str(exc.detail), exc.status_code)


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    return _err("bad_request", "요청 형식 오류", 400, {"errors": [str(e.get("msg")) + " @ " + ".".join(map(str, e.get("loc", []))) for e in exc.errors()][:5]})


API = "/api/v1"
for m in (auth, catalog, jobs, events, results, parcels, feedback, registry, deploys, quota, ops, proxy):
    app.include_router(m.router, prefix=API)
app.include_router(tiles.router)


@app.get(API + "/health")
async def health():
    r = await redis()
    ok_r = ok_p = False
    try:
        ok_r = bool(await r.ping())
    except Exception:
        pass
    try:
        pl = await pool()
        ok_p = (await pl.fetchval("SELECT 1")) == 1
    except Exception:
        pass
    gpu = cpu = 0
    now = time.time()
    try:
        async for k in r.scan_iter(match="worker:*:hb"):
            h = await r.hgetall(k)
            if now - float(h.get("ts", 0)) < 30:
                if h.get("device") == "cpu":
                    cpu += 1
                else:
                    gpu += 1
    except Exception:
        pass
    return {"ok": ok_r and ok_p, "version": config.VERSION, "redis": ok_r, "pg": ok_p, "workers": {"gpu": gpu, "cpu": cpu}, "at": now_iso()}


if config.DEV:
    @app.get(API + "/_dev/envelope-probe")
    async def envelope_probe():
        """개발 모드 검증용: 봉투 없는 숫자 → 직렬화기가 500 envelope_missing 으로 막는지."""
        return {"area_km2": 0.199}


@app.get("/")
async def root():
    return {"service": "Land-XI API", "version": config.VERSION, "docs": "/api/v1/docs", "health": "/api/v1/health"}
