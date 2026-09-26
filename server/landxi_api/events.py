"""SSE(F1-CONTRACT §5) — sse-starlette.

/events/jobs/{id}   events:{job} 스트림 tail · id = Redis entry id · Last-Event-ID(헤더) 또는 ?last_event_id= 로 재개(XRANGE (id +)
                    · 10s ': hb' · X-Accel-Buffering: no · Cache-Control: no-store. 끝난 작업도 스트림이 남아 있는 동안 재생.
/events/ops         lx admin · Origin 8702(또는 Origin 없음 = 서버 간). F1-C 폴러 스트림 ops:gpu 와 게이트웨이 ops:events(deploy.changed ·
                    job.state · usage.delta) · ops:alerts 를 한 줄로 합친다. queue.sample 은 게이트웨이가 2s 마다 값이 바뀌면 낸다.
                    id = 'g:<id>|e:<id>|a:<id>' (세 스트림 커서) → 재개.
"""
from __future__ import annotations

import asyncio
import json

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
    p = require(principal(request), admin=True)
    origin = request.headers.get("origin")
    if origin and origin != config.OPS_ORIGIN:
        raise ApiError("forbidden", "관제 스트림은 LX/OPS origin(:8702) 전용")
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
