"""Land-XI API 게이트웨이 :8700 (F1-CONTRACT §1) — uvicorn landxi_api.main:app --port 8700

접두 /api/v1 · 타일 /tiles · 파일 /files · SSE /api/v1/events. CORS = 4173(정적) · 8702(관제). 역프록시 없음(§10.4).
"""
from __future__ import annotations

import asyncio
import contextlib
import importlib
import json
import logging
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))   # server/ — workers 패키지 import

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import approvals, auth, catalog, config, deploys, events, feedback, jobs, ledger, ops, parcels, proxy, public, quota, regions, registry, results, tiles
from . import summary          # fix-server-summary · 대표 수치 단일 요약(숫자 한 출처)
from .deps import ApiError, close, pool, redis
from .envelope import LXJSON, dumps, now_iso


log = logging.getLogger("landxi")
BOOT = {"recovered_at_boot": None, "boot_at": None}


async def _boot_recovery():
    """재부팅 복구(v1.1-15) — workers.recovery.sweep(동기 · Redis/PG) 을 스레드에서. 스케줄러가 먼저 돌았으면 skipped + 그쪽 결과."""
    from starlette.concurrency import run_in_threadpool
    from workers.recovery import sweep
    try:
        st = await run_in_threadpool(sweep, "gateway")
    except Exception as e:  # pragma: no cover
        st = {"resumed": 0, "requeued": 0, "failed": 0, "error": repr(e), "at": now_iso()}
    BOOT["recovered_at_boot"] = st
    print(f"[gateway] recovery sweep: resumed {st.get('resumed')} · requeued {st.get('requeued')} · failed {st.get('failed')}"
          + (f" (skipped — {st.get('held_by')})" if st.get("skipped") else "")
          + (f" · 이미 재개됨 {st.get('already')}건(앞선 sweep · 중복 알림 없음)" if st.get("already") else "")
          + "".join(f"\n[gateway] recovery: {j['job_id']} {j['mode']} {j.get('shards_done', '')}/{j.get('shards_total', '')} ({j.get('reason')})"
                    for j in st.get("jobs", [])), flush=True)


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    await pool()
    await redis()
    BOOT["boot_at"] = now_iso()
    await _boot_recovery()
    try:                                   # 전국 시군구 뼈대를 스레드에서 미리 읽는다(첫 /regions 요청이 이벤트 루프를 막지 않게)
        from starlette.concurrency import run_in_threadpool
        await run_in_threadpool(regions.regions_base)
    except Exception as e:  # noqa: BLE001
        print(f"[gateway] regions warm 실패: {e!r}", flush=True)
    try:                                   # 재기동으로 끊긴 대장 매칭 이어 돌리기(S-2 · S-12)
        BOOT["ledger_resume"] = await ledger.resume_stuck_imports()
        if BOOT["ledger_resume"]["resumed"] or BOOT["ledger_resume"]["failed"]:
            print(f"[gateway] ledger resume: {BOOT['ledger_resume']}", flush=True)
    except Exception as e:  # noqa: BLE001
        print(f"[gateway] ledger resume 실패: {e!r}", flush=True)
    try:                                   # AI 도우미 도구 확장(tools/ext · C2 plan 3.1)을 기동 때 불러 둔다 — 모듈 실패는 경고만
        from agent import runner as _runner  # noqa: F401
        from agent.tools import ext as _ext
        BOOT["agent_ext"] = {k: {"ok": v["ok"], "tools": len(v["tools"]), **({"error": v["error"]} if v["error"] else {})} for k, v in _ext.LOADED.items()}
        line = ", ".join("%s(%d)%s" % (k, v["tools"], "" if v["ok"] else " 실패") for k, v in BOOT["agent_ext"].items()) or "없음"
        print(f"[gateway] agent ext: {line}", flush=True)
    except Exception as e:  # noqa: BLE001
        print(f"[gateway] agent ext 불러오기 실패: {e!r}", flush=True)
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
for m in (auth, catalog, jobs, events, results, parcels, feedback, registry, deploys, quota, ops, proxy,
          regions, public, ledger, approvals, summary):   # F3 최종 명세 §3 S-1…S-9 · summary(fix-server-summary)
    app.include_router(m.router, prefix=API)
app.include_router(importlib.import_module("landxi_api.requests").router, prefix=API)   # 기관 영상 분석 의뢰 · 조각 올리기(impl-2 · 확인 대장 GF-2)
app.include_router(tiles.router)
app.include_router(importlib.import_module("landxi_api.brand").router)   # 기관 분기 브랜드(구현 2차 T3) — /api/v1/brand/* · /files/brand/*
app.include_router(importlib.import_module("landxi_api.accounts").router, prefix=API)   # 구현 2차 T5 계정 — 가입 신청 · 아이디/비밀번호 찾기 · 승인
app.include_router(importlib.import_module("landxi_api.messages").router, prefix=API)   # 검토 요청 · 메시지 · 알림(구현 2차 · 확인 대장 GF-6 · 알림-1)
app.include_router(importlib.import_module("landxi_api.projects").router, prefix=API)   # 프로젝트 — LX 직원의 일 단위(구현 2차 T1 · 확인 대장 R-D3 · 흐름-1)

# 확장 라우터 훅(D0 · F2-S survey · F2-E agent) — main.py 를 만지지 않고 붙는다.
# 모듈이 없으면 조용히(로그 1줄) · 있는데 import 오류면 기동 실패로 드러나게(예외 그대로).
EXT_ROUTERS: dict[str, str] = {}
for _name in ("survey", "agent"):
    try:
        _m = importlib.import_module(f"landxi_api.{_name}")
    except ModuleNotFoundError as _e:
        if _e.name != f"landxi_api.{_name}":
            raise
        EXT_ROUTERS[_name] = "absent"
        print(f"[gateway] ext router landxi_api.{_name}: 없음(건너뜀)", flush=True)
        continue
    app.include_router(_m.router, prefix=API)
    EXT_ROUTERS[_name] = "mounted"
    print(f"[gateway] ext router landxi_api.{_name}: 등록({len(_m.router.routes)} routes)", flush=True)

# C2 확장 라우터(c2-report-law 법령 원문·색인 등) — 있으면 붙이고, 없거나 불러오기에 실패하면 건너뛴다(게이트웨이는 뜬다 · 로그 1줄).
for _name in ("law", "training", "global_data", "staff_home", "release"):   # staff_home = LX 직원 대시보드 칸(저장 용량 · 내가 돌린 작업 · 공지 — 직원-4 ⓐ · 직원-5 ⓐ) · release = 분석 서비스 배포(추론 · 배포 신청 · 기관 공유 · 사용 현황 — 배포-1~5)
    try:
        _m = importlib.import_module(f"landxi_api.{_name}")
        app.include_router(_m.router, prefix=API)
        EXT_ROUTERS[_name] = "mounted"
        print(f"[gateway] ext router landxi_api.{_name}: 등록({len(_m.router.routes)} routes)", flush=True)
    except Exception as _e:  # noqa: BLE001
        EXT_ROUTERS[_name] = "absent" if isinstance(_e, ModuleNotFoundError) and _e.name == f"landxi_api.{_name}" else f"skipped: {type(_e).__name__}"
        print(f"[gateway] ext router landxi_api.{_name}: 건너뜀({type(_e).__name__}: {str(_e)[:120]})", flush=True)


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
        async for k in r.scan_iter(match="worker:*:hb", count=2000):
            h = await r.hgetall(k)
            if now - float(h.get("ts", 0)) < 30:
                if h.get("device") == "cpu":
                    cpu += 1
                else:
                    gpu += 1
    except Exception:
        pass
    last = None
    try:
        raw = await r.get("recovery:last")
        last = json.loads(raw) if raw else None
    except Exception:
        pass
    rb = BOOT.get("recovered_at_boot") or {}
    acted = int(rb.get("resumed") or 0) + int(rb.get("requeued") or 0) + int(rb.get("failed") or 0)
    # 스케줄러가 먼저 sweep 했으면(잠금 skipped · 또는 이미 재개된 작업만 봤으면 already) 그쪽 결과
    src = rb if not (rb.get("skipped") or (not acted and rb.get("already"))) else (last or rb)
    return {"ok": ok_r and ok_p, "version": config.VERSION, "redis": ok_r, "pg": ok_p, "workers": {"gpu": gpu, "cpu": cpu}, "at": now_iso(),
            "recovered_at_boot": {"resumed": int(src.get("resumed") or 0), "requeued": int(src.get("requeued") or 0),
                                  "failed": int(src.get("failed") or 0), "by": src.get("by"), "at": src.get("at"),
                                  "jobs": [{k: j.get(k) for k in ("job_id", "mode", "shards_done", "shards_total", "reason")} for j in src.get("jobs", [])][:20],
                                  "gateway_sweep": {"resumed": int(rb.get("resumed") or 0), "already": int(rb.get("already") or 0),
                                                    "skipped": bool(rb.get("skipped"))} if rb else None},
            "boot_at": BOOT.get("boot_at"), "ext_routers": EXT_ROUTERS}


if config.DEV:
    @app.get(API + "/_dev/envelope-probe")
    async def envelope_probe():
        """개발 모드 검증용: 봉투 없는 숫자 → 직렬화기가 500 envelope_missing 으로 막는지."""
        return {"area_km2": 0.199}


@app.get("/")
async def root():
    return {"service": "Land-XI API", "version": config.VERSION, "docs": "/api/v1/docs", "health": "/api/v1/health"}
