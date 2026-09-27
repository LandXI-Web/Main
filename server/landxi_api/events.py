"""SSE(F1-CONTRACT §5) — sse-starlette.

/events/jobs/{id}   events:{job} 스트림 tail · id = Redis entry id · Last-Event-ID(헤더) 또는 ?last_event_id= 로 재개(XRANGE (id +)
                    · 10s ': hb' · X-Accel-Buffering: no · Cache-Control: no-store. 끝난 작업도 스트림이 남아 있는 동안 재생.
/events/ops         lx admin · Origin 4173(앱 ops-core) · 8702(관제) · 없음(서버 간) — S-9 관제 일원화. F1-C 폴러 스트림 ops:gpu 와 게이트웨이 ops:events(deploy.changed ·
                    job.state · usage.delta) · ops:alerts 를 한 줄로 합친다. queue.sample 은 게이트웨이가 2s 마다 값이 바뀌면 낸다.
                    id = 'g:<id>|e:<id>|a:<id>' (세 스트림 커서) → 재개.
"""
from __future__ import annotations

import asyncio
import json
import time

from fastapi import APIRouter, Request
from sse_starlette.sse import EventSourceResponse, ServerSentEvent

from . import config
from .deps import ApiError, db, principal, redis, require

router = APIRouter()
HB_S = 10
HEADERS = {"Cache-Control": "no-store", "X-Accel-Buffering": "no"}
TERMINAL = {"snapshot.ready", "job.failed", "job.cancelled"}


def _last_id(request: Request) -> str | None:
    return request.headers.get("last-event-id") or request.query_params.get("last_event_id") or None


@router.get("/events/jobs/{job_id}")
async def job_events(job_id: str, request: Request):
    p = require(principal(request))
    async with db(p) as conn:
        row = await conn.fetchrow("SELECT id, tenant_id, submitted_by FROM jobs WHERE id=$1", job_id)
    if not row:
        raise ApiError("not_found", f"job {job_id} 없음")
    if not (p.is_lx or p.tenant_id == row["tenant_id"]):
        raise ApiError("forbidden")
    r = await redis()
    key = f"events:{job_id}"
    start = _last_id(request)

    async def gen():
        cursor = start or "0-0"
        # 1) 밀린 것(재개 포함)
        first = True
        while True:
            if await request.is_disconnected():
                return
            if first:
                rows = await r.xrange(key, min=f"({cursor}" if cursor != "0-0" else "-", max="+", count=5000)
                first = False
                batch = [(eid, f) for eid, f in rows]
            else:
                res = await r.xread({key: cursor}, block=HB_S * 1000, count=500)
                batch = res[0][1] if res else []
                if not batch:
                    yield ServerSentEvent(comment="hb")
                    continue
            ended = False
            for eid, f in batch:
                cursor = eid
                yield ServerSentEvent(data=f.get("data", "{}"), event=f.get("event", "message"), id=eid)
                if f.get("event") in TERMINAL:
                    ended = True
            if ended:
                # 종료 이벤트 뒤에도 연결은 잠시 유지(하트비트) — 프론트가 닫는다
                for _ in range(3):
                    await asyncio.sleep(HB_S)
                    if await request.is_disconnected():
                        return
                    yield ServerSentEvent(comment="hb")
                return

    return EventSourceResponse(gen(), headers=HEADERS, ping=HB_S, send_timeout=30)


def _parse_ops_id(s: str | None) -> dict:
    out = {"g": "$", "e": "$", "a": "$"}
    if not s:
        return out
    for part in s.split("|"):
        if ":" in part:
            k, v = part.split(":", 1)
            if k in out and v:
                out[k] = v
    return out


def _ops_id(c: dict) -> str:
    return f"g:{c['g']}|e:{c['e']}|a:{c['a']}"


@router.get("/events/ops")
async def ops_events(request: Request):
    p = require(principal(request), admin=True)          # 판정은 역할(lx admin) — 오리진은 허용 목록(4173 앱 · 8702 관제)이면 된다(S-9 관제 일원화)
    origin = request.headers.get("origin")
    if origin and origin not in config.CORS_ORIGINS:
        raise ApiError("forbidden", "허용되지 않은 오리진")
    r = await redis()
    cur = _parse_ops_id(_last_id(request))
    streams = {"g": "ops:gpu", "e": "ops:events", "a": "ops:alerts"}
    # '$' 는 첫 XREAD 에서만 의미 — 실제 마지막 id 로 바꿔 둔다(재개 가능하게)
    for k, s in streams.items():
        if cur[k] == "$":
            last = await r.xrevrange(s, count=1)
            cur[k] = last[0][0] if last else "0-0"
    from .ops import queues_snapshot

    async def gen():
        last_q = None
        # 폴러가 없으면 그 사실을 한 번 알린다(봉투 null + note)
        if not await r.exists("ops:gpu"):
            yield ServerSentEvent(event="gpu.sample", data=json.dumps({"node": config.NODE_ID, "at": None, "gpus": [],
                                  "note": "폴러 미기동(F1-C server/ops/gpu_poller.py) — ops:gpu 스트림 없음",
                                  "util_pct": {"value": None, "unit": "%", "basis": "measured", "as_of": "", "source": "ops:gpu", "note": "폴러 미기동"}},
                                  ensure_ascii=False), id=_ops_id(cur))
        tick = 0
        while True:
            if await request.is_disconnected():
                return
            res = await r.xread({streams[k]: cur[k] for k in streams}, block=2000, count=200)
            for sname, entries in res or []:
                k = next(k for k, v in streams.items() if v == sname)
                for eid, f in entries:
                    cur[k] = eid
                    if k == "g":
                        ev, data = "gpu.sample", f.get("json") or f.get("data") or "{}"
                    elif k == "a":
                        ev, data = "alert", f.get("json") or f.get("data") or "{}"
                    else:
                        ev, data = f.get("event", "message"), f.get("data", "{}")
                    yield ServerSentEvent(event=ev, data=data, id=_ops_id(cur))
            tick += 1
            q = await queues_snapshot()
            sig = json.dumps(q["pools"], sort_keys=True, default=str)
            if sig != last_q:
                last_q = sig
                yield ServerSentEvent(event="queue.sample", data=json.dumps(q, ensure_ascii=False, default=str), id=_ops_id(cur))
            if not res and tick % 5 == 0:
                yield ServerSentEvent(comment="hb")

    return EventSourceResponse(gen(), headers=HEADERS, ping=HB_S, send_timeout=30)


# ── 기관 스트림(v1.1-16) ─────────────────────────────────────────────────────────
TENANT_EVENTS = ("job.state", "deploy.changed", "finding.state", "usage.delta", "job.recovered")


def _replay_s(v: str | None) -> int:
    if not v:
        return 0
    v = v.strip().lower()
    try:
        if v.endswith("h"):
            return int(float(v[:-1]) * 3600)
        if v.endswith("m"):
            return int(float(v[:-1]) * 60)
        if v in ("1", "true", "yes"):
            return 86400
        return int(float(v))
    except ValueError:
        return 0


@router.get("/events/tenant")
async def tenant_events(request: Request, tenant: str | None = None, replay: str | None = None, events: str | None = None):
    """GET /api/v1/events/tenant?access_token=[&tenant=][&replay=24h][&events=a,b]

    - realm tenant: 자기 기관 스트림만(tenant= 다른 값 → 403). realm lx: 기본 'lx' · tenant= 로 기관 지정(관제·XI맵 직원 세션).
    - 게스트 401 · 허용 오리진(4173 · 8702) 밖 403. 이벤트: job.state · deploy.changed · finding.state · usage.delta (+ job.recovered 칩).
    - id = Redis entry id → Last-Event-ID 재개. replay=24h 면 최근 24h 를 먼저 흘린다(스트림은 24h · MAXLEN 10,000 으로 잘림).
    """
    p = require(principal(request))
    origin = request.headers.get("origin")
    if origin and origin not in config.CORS_ORIGINS:
        raise ApiError("forbidden", "허용되지 않은 오리진")
    if p.realm == "tenant":
        if tenant and tenant != p.tenant_id:
            raise ApiError("forbidden", "다른 기관의 스트림")
        tid = p.tenant_id
    else:
        tid = tenant or "lx"
    want = set((events or "").split(",")) - {""}
    r = await redis()
    key = f"events:tenant:{tid}"
    start = _last_id(request)
    rs = _replay_s(replay)
    if start:
        cursor = start
    elif rs:
        cursor = f"{int((time.time() - min(rs, 86400)) * 1000)}-0"
    else:
        last = await r.xrevrange(key, count=1)
        cursor = last[0][0] if last else "0-0"

    async def gen():
        nonlocal cursor
        yield ServerSentEvent(comment=f"tenant {tid} · events {','.join(sorted(want)) or 'all'}")
        first = True
        while True:
            if await request.is_disconnected():
                return
            if first and (start or rs):
                rows = await r.xrange(key, min=f"({cursor}" if start else cursor, max="+", count=5000)
                batch = rows
            else:
                res = await r.xread({key: cursor}, block=HB_S * 1000, count=500)
                batch = res[0][1] if res else []
                if not batch:
                    yield ServerSentEvent(comment="hb")
                    continue
            first = False
            for eid, f in batch:
                cursor = eid
                ev = f.get("event", "message")
                if want and ev not in want:
                    continue
                yield ServerSentEvent(data=f.get("data", "{}"), event=ev, id=eid)

    return EventSourceResponse(gen(), headers=HEADERS, ping=HB_S, send_timeout=30)
