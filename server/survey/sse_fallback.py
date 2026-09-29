"""기관 스트림 대체 라우트 — `GET /api/v1/events/tenant?access_token=`(v1.1-16 · 정본 소유 F2-B).

F2-B 의 events.py 가 이 라우트를 올리기 전(또는 올린 뒤에도 같은 Redis 키를 읽으므로 호환) 개발 게이트웨이
(server/survey/devapp.py)에서만 붙인다. 키 = `events:tenant:{tenant_id}`(F2-B 브리프 §D0 · MAXLEN 10,000 · 24h 재생).
realm tenant = 자기 기관 · lx staff/admin = ?tenant_id= 로 지정(기본 lx). 게스트 401.
"""
from __future__ import annotations

import asyncio

from fastapi import APIRouter, Request
from sse_starlette.sse import EventSourceResponse, ServerSentEvent

from landxi_api.deps import ApiError, principal, redis, require

router = APIRouter()
HB_S = 10


@router.get("/events/tenant")
async def tenant_events(request: Request, tenant_id: str | None = None):
    p = require(principal(request))
    if p.realm == "tenant":
        t = p.tenant_id
    elif p.role in ("staff", "admin"):
        t = tenant_id or "lx"                     # 기관을 고르지 않은 LX 세션 = LX 스트림
    else:
        raise ApiError("forbidden", "기관 스트림은 기관 계정 · LX 직원/관리자")
    r = await redis()
    key = f"events:tenant:{t}"
    start = request.headers.get("last-event-id") or request.query_params.get("last_event_id")
    if not start:
        last = await r.xrevrange(key, count=1)
        start = last[0][0] if last else "0-0"

    async def gen():
        cursor = start
        yield ServerSentEvent(comment=f"tenant {t} · from {cursor}")
        while True:
            if await request.is_disconnected():
                return
            res = await r.xread({key: cursor}, block=HB_S * 1000, count=200)
            if not res:
                yield ServerSentEvent(comment="hb")
                continue
            for eid, f in res[0][1]:
                cursor = eid
                yield ServerSentEvent(data=f.get("data", "{}"), event=f.get("event", "message"), id=eid)
            await asyncio.sleep(0)

    return EventSourceResponse(gen(), headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"}, ping=HB_S)
