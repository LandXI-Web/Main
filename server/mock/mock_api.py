"""목(mock) 게이트웨이 :8701 (F1-CONTRACT §1 · D0+1) — DB·Redis·GPU 없이 프론트 세 에픽이 붙는 대상.

- REST: server/fixtures/contract/*.json 의 body 를 그대로 낸다(경로 패턴 매칭 · {id} 자리는 요청 값으로 바꿔 줌).
- SSE /api/v1/events/jobs/{id}: server/fixtures/replay/*.ndjson(정본 = J1 실녹음 j1-hwangdeung.ndjson)을 t(ms) 대로 흘린다.
  data 에 "basis":"demo","replay":true 를 덧댄다(리플레이는 시연). Last-Event-ID(=t) 로 재개.
- SSE /api/v1/events/ops: 합성 샘플(basis 'demo') 2s — 실측이 아님을 note 로 적는다.
- SSE /api/v1/events/tenant(v1.1-16): _events_v11.json 'tenant' 목록(deploy.changed · finding.state · job.state(recovered) · usage.delta) 3s 순환.
- v1.1 라우트 픽스처: /results/{set}/index · /results/{set}/parcels · job.recovered 는 replay/f2b-recovery.ndjson(실녹음).
- 타일: /tiles/pmtiles/{set}.pmtiles 는 config/sets.yaml 로 LX_DATA_ROOT 파일을 Range 206 으로(읽기 전용).
사용: powershell -File server/run-mock.ps1  (또는 uvicorn mock.mock_api:app --port 8701)
"""
from __future__ import annotations

import asyncio
import json
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from sse_starlette.sse import EventSourceResponse, ServerSentEvent

from landxi_api import config

ROOT = Path(__file__).resolve().parents[1]
FIX = ROOT / "fixtures" / "contract"
REPLAY = ROOT / "fixtures" / "replay"
app = FastAPI(title="Land-XI mock :8701")
app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"],
                   expose_headers=["content-range", "accept-ranges", "etag"])

ROUTES: list[tuple[str, re.Pattern, dict]] = []


def _load():
    ROUTES.clear()
    for f in sorted(FIX.glob("*.json")):
        if f.name.startswith("_"):
            continue
        d = json.loads(f.read_text(encoding="utf-8"))
        if d["path"] == "*":
            continue
        path = d["path"].split("?")[0]
        pat = "^" + re.sub(r"\\\{(\w+)\\\}", r"(?P<\1>.+?)", re.escape(path)) + "$"
        ROUTES.append((d["method"], re.compile(pat), d))
    # 구체적인 경로를 먼저
    ROUTES.sort(key=lambda x: -len(x[1].pattern))


_load()


def _replays() -> dict[str, Path]:
    return {p.stem: p for p in REPLAY.glob("*.ndjson")}


def _job_id_of(p: Path) -> str | None:
    try:
        first = json.loads(p.read_text(encoding="utf-8").splitlines()[0])
        return first["data"].get("job_id")
    except Exception:
        return None


@app.get("/api/v1/health")
async def health():
    return {"ok": True, "version": config.VERSION + "-mock", "redis": False, "pg": False, "workers": {"gpu": 0, "cpu": 0},
            "at": time.strftime("%Y-%m-%dT%H:%M:%S+09:00"), "mode": "mock", "note": "계약 픽스처 + 녹음 리플레이(시연)"}


@app.get("/api/v1/events/jobs/{job_id}")
async def job_events(job_id: str, request: Request):
    reps = _replays()
    src = next((p for p in reps.values() if _job_id_of(p) == job_id), None) or reps.get("j1-hwangdeung") or next(iter(reps.values()), None)
    if not src:
        return JSONResponse({"error": {"code": "not_found", "message": "리플레이 파일 없음"}}, status_code=404)
    lines = [json.loads(x) for x in src.read_text(encoding="utf-8").splitlines() if x.strip()]
    last = request.headers.get("last-event-id") or request.query_params.get("last_event_id")
    t_from = int(last) if last and last.isdigit() else -1
    speed = max(0.1, min(50.0, float(request.query_params.get("speed") or 1)))   # 녹음 배속(프론트 개발 편의 · 기본 실시간)

    async def gen():
        t0 = time.monotonic()
        base = max(t_from, 0)
        for ln in lines:
            if ln["t"] <= t_from:
                continue
            wait = (ln["t"] - base) / 1000 / speed - (time.monotonic() - t0)
            if wait > 0:
                await asyncio.sleep(wait)
            if await request.is_disconnected():
                return
            data = {**ln["data"], "job_id": job_id, "basis": "demo", "replay": True}
            yield ServerSentEvent(event=ln["event"], data=json.dumps(data, ensure_ascii=False), id=str(ln["t"]))
        for _ in range(2):
            await asyncio.sleep(10)
            yield ServerSentEvent(comment="hb")

    return EventSourceResponse(gen(), headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"}, ping=10)


@app.get("/api/v1/events/ops")
async def ops_events(request: Request):
    gpu = json.loads((FIX / "ops_gpus.json").read_text(encoding="utf-8"))["body"]
    q = json.loads((FIX / "ops_queues.json").read_text(encoding="utf-8"))["body"]

    async def gen():
        i = 0
        while not await request.is_disconnected():
            i += 1
            g = json.loads(json.dumps(gpu))
            g["at"] = time.strftime("%Y-%m-%dT%H:%M:%S+09:00")
            for x in g["gpus"]:
                for k in ("util_pct", "mem_used_mib", "temp_c", "power_w"):
                    x[k]["basis"] = "demo"
                    x[k]["note"] = "목 서버 합성 샘플 — 실측 아님"
            yield ServerSentEvent(event="gpu.sample", data=json.dumps(g, ensure_ascii=False), id=str(i))
            if i % 3 == 1:
                yield ServerSentEvent(event="queue.sample", data=json.dumps(q, ensure_ascii=False), id=str(i))
            await asyncio.sleep(2)

    return EventSourceResponse(gen(), headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"}, ping=10)


@app.get("/api/v1/events/tenant")
async def tenant_events(request: Request, tenant: str | None = None):
    """v1.1-16 기관 스트림 시연 — fixtures/contract/_events_v11.json 'tenant' 목록을 3 s 간격으로 돌린다(basis demo · 실측 아님)."""
    evs = json.loads((FIX / "_events_v11.json").read_text(encoding="utf-8"))["tenant"]
    tid = tenant or "namwon"

    async def gen():
        i = 0
        yield ServerSentEvent(comment=f"mock tenant {tid} · 시연 · 서버 연결 없음")
        while not await request.is_disconnected():
            e = evs[i % len(evs)]
            i += 1
            d = {**e["data"], "tenant_id": tid, "basis": "demo", "replay": True, "at": time.strftime("%Y-%m-%dT%H:%M:%S+09:00")}
            yield ServerSentEvent(event=e["event"], data=json.dumps(d, ensure_ascii=False), id=str(i))
            await asyncio.sleep(3)

    return EventSourceResponse(gen(), headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"}, ping=10)


@app.api_route("/tiles/pmtiles/{set_path:path}", methods=["GET", "HEAD"])
async def pmtiles(set_path: str, request: Request):
    set_id = set_path[:-8] if set_path.endswith(".pmtiles") else set_path
    s = config.load_yaml("sets")
    set_id = s.get("aliases", {}).get(set_id, set_id)
    rel = s["sets"].get(set_id)
    if not rel or not (config.DATA_ROOT / rel).exists():
        return JSONResponse({"error": {"code": "not_found", "message": set_id}}, status_code=404)
    p = config.DATA_ROOT / rel
    size = p.stat().st_size
    rng = request.headers.get("range")
    h = {"Accept-Ranges": "bytes", "Content-Type": "application/octet-stream"}
    if rng and rng.startswith("bytes="):
        a, _, b = rng[6:].partition("-")
        a, b = int(a), min(int(b) if b else size - 1, size - 1)
        with open(p, "rb") as f:
            f.seek(a)
            return Response(f.read(b - a + 1), status_code=206, headers={**h, "Content-Range": f"bytes {a}-{b}/{size}"})
    return Response(p.read_bytes(), headers=h)


@app.api_route("/{full:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def any_route(full: str, request: Request):
    path = "/" + full
    for method, pat, d in ROUTES:
        if method not in (request.method, "*"):
            continue
        m = pat.match(path)
        if m:
            body = json.loads(json.dumps(d["body"], ensure_ascii=False))
            if d["path"].startswith("/api/v1/jobs") and request.method == "POST" and "job" in body:
                reps = _replays()
                rp = reps.get("j1-hwangdeung") or next(iter(reps.values()), None)
                jid = (_job_id_of(rp) if rp else None) or body["job"]["id"]
                body["job"]["id"] = jid
                body["events_url"] = f"/api/v1/events/jobs/{jid}"
            return JSONResponse(body, status_code=d["status"], headers={"X-LX-Mock": __import__("urllib.parse", fromlist=["quote"]).quote(d.get("note", "fixture"))})   # 헤더는 latin-1 — 한글 note 는 %-인코딩
    return JSONResponse({"error": {"code": "not_found", "message": f"목 서버에 {request.method} {path} 픽스처 없음"}, "request_id": "req_mock"},
                        status_code=404)
