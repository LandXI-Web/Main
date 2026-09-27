"""개발용 에이전트 단독 게이트웨이 :8703 — F2-B 확장 훅이 main.py 에 들어오기 전 검증용.

    python -m uvicorn agent.devserver:app --host 127.0.0.1 --port 8703   (cwd = server/)

main.py 와 같은 인증(Bearer · SSE access_token) · 오류 형식 · CORS 를 쓰고 에이전트 라우터만 싣는다(관제 경보 루프 등은 띄우지 않음).
도구 HTTP 는 정본 게이트웨이 :8700 으로 간다(config.GATEWAY). 프론트는 localStorage.lx_agent_base='http://localhost:8703' 일 때만 여기로.
훅이 들어오면 이 파일은 쓰지 않는다.
"""
from __future__ import annotations

import contextlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import FastAPI, Request  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import JSONResponse  # noqa: E402
from starlette.exceptions import HTTPException as StarletteHTTPException  # noqa: E402

from landxi_api import agent, auth, config  # noqa: E402
from landxi_api.deps import ApiError, Principal, close, pool, redis  # noqa: E402
from landxi_api.envelope import LXJSON  # noqa: E402


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    await pool()
    await redis()
    yield
    await close()


app = FastAPI(title="Land-XI agent dev", default_response_class=LXJSON, lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS, allow_credentials=False,
                   allow_methods=["GET", "POST", "OPTIONS"], allow_headers=["authorization", "content-type", "accept", "last-event-id"],
                   expose_headers=["content-disposition"], max_age=600)


@app.middleware("http")
async def principal_mw(request: Request, call_next):
    try:
        request.state.principal = await auth.resolve(request)
    except Exception:
        request.state.principal = Principal()
    return await call_next(request)


@app.exception_handler(ApiError)
async def api_error(request: Request, exc: ApiError):
    return JSONResponse(exc.body(), status_code=exc.status)


@app.exception_handler(StarletteHTTPException)
async def http_error(request: Request, exc: StarletteHTTPException):
    return JSONResponse(ApiError("not_found" if exc.status_code == 404 else "bad_request", str(exc.detail), None, exc.status_code).body(),
                        status_code=exc.status_code)


app.include_router(agent.router, prefix="/api/v1")


@app.get("/api/v1/health")
async def health():
    return {"ok": True, "service": "agent-dev"}
