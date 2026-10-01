"""에이전트 라우터(F1-CONTRACT v1.1-23~27 · 소유 F2-E) — F2-B 확장 훅이 `app.include_router(agent.router, prefix='/api/v1')` 로 붙인다.

POST /agent/runs                     → 202 {run, events_url} · 사슬 전부 죽음 → 503 llm_unavailable(프론트 리플레이)
GET  /events/agent/{run_id}          → SSE(agent.route/plan/tool.call/tool.result/confirm/token/done/failed/rejected · 24h 재생)
POST /agent/runs/{id}/confirm        → {confirm_id, decision: approve|reject} · 만료 409 confirm_expired
POST /agent/runs/{id}/client         → 클라이언트 도구 ms(브라우저 실측) 기록
POST /agent/runs/{id}/acts           → 화면 지도 동작 결과(ok·reason) 기록 → agent_runs.perf.acts_*(R3 M5 · acts_ok=0 = 동작 모두 실패)
GET  /agent/runs · /agent/runs/{id}  → 감사(본인 · 기관 · LX 전체 — RLS)
GET  /agent/models                   → 실제 백엔드 헬스(agent:models 30s)
POST /agent/report/draft             → 202 {run, events_url} · 완료 시 agent.done.artifact.docx_url
GET  /agent/runs/{id}/draft.docx     → 초안 파일(Bearer)
GET  /agent/runs/{id}/files/{name}   → run 산출 파일(.docx·.png·.jpg·.webp·.csv·.pdf·.xlsx · 권한 = run 소유 기관 · 명령 바 file·image 블록)
게스트 0(401). 외부 클라우드 호출 0.
"""
from __future__ import annotations

import asyncio
import json
import time
from urllib.parse import quote as urlquote

from fastapi import APIRouter, Request
from fastapi.responses import FileResponse
from sse_starlette.sse import EventSourceResponse, ServerSentEvent

from .deps import ApiError, db, principal, redis, require
from .envelope import now_iso

router = APIRouter()
TERMINAL = {"agent.done", "agent.failed", "agent.rejected"}
HEADERS = {"Cache-Control": "no-store", "X-Accel-Buffering": "no"}
_health_task: asyncio.Task | None = None
_warm_started = False


def _agent():
    from agent import backends, config, report, runner   # server/agent (sys.path 에 server/ 가 있다)
    return backends, config, report, runner


def _bg():
    """첫 호출 때 한 번: 백엔드 헬스 30s 루프(agent:models). 실태조사는 PostGIS 가 정본이라 파일 색인은 데우지 않는다(대체 경로는 필요할 때만)."""
    global _health_task, _warm_started
    _warm_started = True
    if _health_task is None or _health_task.done():
        backends, config, _, _ = _agent()

        async def loop():
            while True:
                try:
                    await backends.health(await redis())
                except Exception:
                    pass
                await asyncio.sleep(config.HEALTH_TTL_S)
        _health_task = asyncio.get_running_loop().create_task(loop())


def _token(request: Request) -> str | None:
    h = request.headers.get("authorization", "")
    return h[7:].strip() if h.lower().startswith("bearer ") else None


def _run_public(run_id: str, p, mode: str, state: str) -> dict:
    return {"id": run_id, "tenant_id": p.tenant_id, "user": p.user_id, "realm": p.realm, "mode": mode, "state": state, "created_at": now_iso()}


async def _unavailable(tried):
    # 화면 문구 = K10 '지금은 답할 수 없습니다'(개발 정보 0) — 사슬·포트는 detail(개발자 서랍 ?dev=1)에만
    raise ApiError("llm_unavailable", "지금은 답할 수 없습니다",
                   {"tried": tried, "chain": "vLLM → Ollama"}, 503)


@router.get("/agent/alive")
async def alive(request: Request):
    """신선한 사슬 헬스(200 · 503 을 쓰지 않는다 — 프론트가 POST 전에 물어 콘솔 오류 없이 리플레이로 간다)."""
    require(principal(request))
    backends, _, _, _ = _agent()
    first, tried = await backends.first_alive(await redis())
    return {"alive": first, "tried": tried, "at": now_iso()}


@router.post("/agent/runs", status_code=202)
async def create_run(body: dict, request: Request):
    p = require(principal(request))
    _bg()
    backends, config, _, runner = _agent()
    msg = str(body.get("message") or "").strip()
    if not msg:
        raise ApiError("bad_request", "message 가 비었습니다")
    if len(msg) > 1000:
        raise ApiError("bad_request", "message 는 1,000자 이하")
    mode = body.get("mode") or "map"
    if mode not in ("map", "report", "ops"):
        raise ApiError("bad_request", "mode 는 map|report|ops")
    r = await redis()
    alive, tried = await backends.first_alive(r)
    context = dict(body.get("context") or {})
    # 시험 · 점검으로 보낸 질문(context.test) — 답 번호를 시험용(run_test…)으로 매겨 개선 고리가 모으지 않게 한다(improve.RUN_ID · 실제 사용자의 막힘만 모은다)
    test = bool(context.pop("test", False))
    run_id = runner.ulid("run_test" if test else "run_")
    ctx = runner.make_ctx(run_id, p, _token(request), context, mode, r)
    # 기관 AI 도우미 질문은 한도로 막지 않는다(원칙 83 · 7차 기관-1 — 기관에는 한도가 아니라 사용 현황). 사용량(토큰)은 runner.meter 가 그대로 기록한다.
    if alive is None:
        # 거절(관할 밖 · 자료 없음)·요약 직행은 LLM 이 없어도 서버가 한 줄로 답한다(fix-agent-scope) — 그 밖만 503
        try:
            need = await runner.needs_llm(ctx, msg)
        except Exception:  # noqa: BLE001
            need = True
        if need:
            await ctx.http.aclose()
            await _unavailable(tried)
    if tried:
        ctx.state["prefallback"] = tried
    runner.start(ctx, runner.execute(ctx, msg))
    return {"run": _run_public(run_id, p, mode, "planning"), "events_url": f"/api/v1/events/agent/{run_id}",
            "backend": {"first": alive, "skipped": [t["backend"] for t in tried]}}


@router.post("/agent/report/draft", status_code=202)
async def report_draft(body: dict, request: Request):
    p = require(principal(request))
    _bg()
    backends, config, report, runner = _agent()
    if (body.get("template") or "survey-emd") != "survey-emd":
        raise ApiError("bad_request", "template 은 survey-emd(1차 유일)")
    if not (body.get("emd_cd") or body.get("emd")):
        raise ApiError("bad_request", "emd_cd 가 필요합니다")
    r = await redis()
    alive, tried = await backends.first_alive(r)
    run_id = runner.ulid("run_")
    ctx = runner.make_ctx(run_id, p, _token(request), body.get("context") or {}, "report", r)
    # 보고서 초안도 한도로 막지 않는다(원칙 83) — 사용량 기록만
    if alive is None:
        await ctx.http.aclose()
        await _unavailable(tried)
    runner.start(ctx, report.draft(ctx, body))
    return {"run": _run_public(run_id, p, "report", "planning"), "events_url": f"/api/v1/events/agent/{run_id}"}


async def _own_run(p, run_id: str):
    async with db(p) as conn:
        row = await conn.fetchrow("SELECT id, tenant_id, user_id, state, artifact FROM agent_runs WHERE id=$1", run_id)
    if not row:
        raise ApiError("not_found", f"run {run_id} 없음(또는 다른 기관)")
    if not (p.is_admin or row["user_id"] == p.user_id or (p.realm == "tenant" and row["tenant_id"] == p.tenant_id)):
        raise ApiError("forbidden", "다른 사용자의 run")
    return row


@router.get("/events/agent/{run_id}")
async def run_events(run_id: str, request: Request):
    p = require(principal(request))
    r = await redis()
    key = f"agent:runs:{run_id}"
    # PG 행이 막 쓰이는 중일 수 있어 짧게 기다린다(스트림은 이미 있을 수 있음)
    for _ in range(10):
        try:
            await _own_run(p, run_id)
            break
        except ApiError as e:
            if e.code != "not_found":
                raise
            await asyncio.sleep(0.1)
    else:
        await _own_run(p, run_id)
    start = request.headers.get("last-event-id") or request.query_params.get("last_event_id")

    async def gen():
        cursor = start or "0-0"
        first = True
        while True:
            if await request.is_disconnected():
                return
            if first:
                rows = await r.xrange(key, min=f"({cursor}" if cursor != "0-0" else "-", max="+", count=5000)
                first = False
                batch = rows
            else:
                res = await r.xread({key: cursor}, block=10000, count=500)
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
                await asyncio.sleep(1)
                return

    return EventSourceResponse(gen(), headers=HEADERS, ping=10, send_timeout=30)


@router.get("/agent/runs/{run_id}/events")
async def run_events_poll(run_id: str, request: Request, after: str | None = None):
    """답 받기 연결이 막혔을 때의 조회 경로(impl-1 · C6·C9 — r3-ops 실증 3차: 탭이 많은 브라우저에서 스트림 연결 칸이 모자라 서버가 끝낸 답이 화면에 안 옴).
    스트림과 같은 사건을 짧은 요청 한 번으로: ?after=마지막 사건 id → {items:[{id, event, data}], done}. 명령 바는 같은 처리기로 넘긴다."""
    p = require(principal(request))
    await _own_run(p, run_id)
    r = await redis()
    lo = "-"
    if after and all(part.isdigit() for part in str(after).split("-", 1)):
        lo = f"({after}"
    rows = await r.xrange(f"agent:runs:{run_id}", min=lo, max="+", count=500)
    items, done = [], False
    for eid, f in rows:
        try:
            d = json.loads(f.get("data") or "{}")
        except Exception:  # noqa: BLE001
            d = {}
        items.append({"id": eid, "event": f.get("event", "message"), "data": d})
        done = done or f.get("event") in TERMINAL
    from .envelope import RawJSON
    return RawJSON({"run_id": run_id, "items": items, "done": done, "as_of": now_iso()})


@router.post("/agent/runs/{run_id}/confirm")
async def confirm(run_id: str, body: dict, request: Request):
    p = require(principal(request))
    cid = str(body.get("confirm_id") or "")
    decision = body.get("decision")
    if decision not in ("approve", "reject"):
        raise ApiError("bad_request", "decision 은 approve|reject")
    await _own_run(p, run_id)
    r = await redis()
    raw = await r.get(f"agent:confirm:{cid}")
    st = json.loads(raw) if raw else None
    if not st or st.get("run_id") != run_id:
        raise ApiError("confirm_expired", "확인 카드가 만료됐거나 없습니다(60s)", {"confirm_id": cid}, 409)
    if st.get("state") != "pending":
        raise ApiError("confirm_expired" if st.get("state") == "expired" else "conflict", f"이미 처리됨({st.get('state')})", {"confirm_id": cid}, 409)
    if p.realm == "lx" and p.role == "sales":
        pass                                   # 영업: 승인 가능하나 제출은 demo:true 강제(jobs 도구)
    st.update({"state": decision, "by": p.user_id, "at": now_iso()})
    await r.set(f"agent:confirm:{cid}", json.dumps(st), ex=300)
    return {"confirm_id": cid, "decision": decision, "run_id": run_id}


@router.post("/agent/runs/{run_id}/client")
async def client_ms(run_id: str, body: dict, request: Request):
    """클라이언트 도구(map_arrive 등) 단계의 브라우저 실측 ms → agent_tool_calls.ms (ms_source='browser')."""
    p = require(principal(request))
    await _own_run(p, run_id)
    try:
        i, ms = int(body.get("i")), float(body.get("ms"))
    except (TypeError, ValueError):
        raise ApiError("bad_request", "i · ms 필요")
    if not (0 <= ms < 600000):
        raise ApiError("bad_request", "ms 범위")
    async with db(p) as conn:
        n = await conn.execute("UPDATE agent_tool_calls SET ms=$3, ms_source='browser' WHERE run_id=$1 AND i=$2", run_id, i, round(ms, 1))
    r = await redis()
    await r.xadd(f"agent:runs:{run_id}", {"event": "agent.tool.client", "data": json.dumps({"run_id": run_id, "i": i, "ms": round(ms, 1), "ms_source": "browser", "at": now_iso()})},
                 maxlen=2000, approximate=True)
    return {"ok": n.endswith("1"), "run_id": run_id}


@router.post("/agent/runs/{run_id}/acts")
async def client_acts(run_id: str, body: dict, request: Request):
    """R3 M5 — 화면이 처리한 지도 동작 결과(kit:agent-action-done 모음) → agent_runs.perf.acts_*(acts_ok=0 이면 동작이 모두 실패).
    body = {sent, done, ok, items: [{op, ok, reason?}], verdict: ok|failed|unconfirmed}. 값은 브라우저 실측(basis browser)."""
    p = require(principal(request))
    await _own_run(p, run_id)
    try:
        sent, done, ok = (max(0, min(int(body.get(k) or 0), 50)) for k in ("sent", "done", "ok"))
    except (TypeError, ValueError):
        raise ApiError("bad_request", "sent · done · ok 는 정수")
    verdict = body.get("verdict") if body.get("verdict") in ("ok", "failed", "unconfirmed", "partial") else None
    items = []
    for it in (body.get("items") or [])[:20]:
        if isinstance(it, dict) and it.get("op"):
            items.append({"op": str(it["op"])[:40], "ok": bool(it.get("ok")), "done": bool(it.get("done", True)),
                          **({"reason": str(it["reason"])[:120]} if it.get("reason") else {})})
    acts = {"acts_sent": sent, "acts_done": done, "acts_ok": ok, "acts_verdict": verdict, "acts": items, "acts_source": "browser", "acts_at": now_iso()}
    async with db(p) as conn:
        n = await conn.execute("UPDATE agent_runs SET perf = coalesce(perf, '{}'::jsonb) || $2::jsonb WHERE id=$1", run_id, acts)
    r = await redis()
    await r.xadd(f"agent:runs:{run_id}", {"event": "agent.acts", "data": json.dumps({"run_id": run_id, **acts}, ensure_ascii=False)},
                 maxlen=2000, approximate=True)
    return {"ok": n.endswith("1"), "run_id": run_id, "verdict": verdict}          # 응답에 맨 숫자 0(봉투 규칙) — 값은 run 기록에


@router.get("/agent/runs")
async def list_runs(request: Request, limit: int = 20):
    p = require(principal(request))
    async with db(p) as conn:
        rows = await conn.fetch("SELECT id, tenant_id, user_id, realm, mode, intent, state, model, tokens_in, tokens_out, error, created_at, finished_at "
                                "FROM agent_runs WHERE ($1 OR user_id=$2 OR tenant_id=$3) ORDER BY created_at DESC LIMIT $4",
                                p.is_admin, p.user_id, p.tenant_id or "", max(1, min(limit, 100)))
    items = []
    for x in rows:
        d = dict(x)
        tin, tout = d.pop("tokens_in") or 0, d.pop("tokens_out") or 0
        d["tokens"] = {"value": tin + tout, "unit": "tokens", "basis": "measured", "as_of": d["created_at"].isoformat() if d.get("created_at") else now_iso(),
                       "source": "agent_runs(chat/completions usage)"}
        items.append(d)
    return {"items": items}


@router.get("/agent/runs/{run_id}")
async def get_run(run_id: str, request: Request):
    p = require(principal(request))
    await _own_run(p, run_id)
    async with db(p) as conn:
        row = await conn.fetchrow("SELECT id, tenant_id, user_id, realm, mode, intent, state, model, answer_md, envelopes, unverified, citations, artifact, "
                                  "perf, tokens_in, tokens_out, error, created_at, finished_at FROM agent_runs WHERE id=$1", run_id)
        calls = await conn.fetch("SELECT i, tool, args, result_ref, ms, ms_source, ok, error, at FROM agent_tool_calls WHERE run_id=$1 ORDER BY i, id", run_id)
        cfs = await conn.fetch("SELECT id, tool, decision, decided_by, expires_at, at FROM agent_confirms WHERE run_id=$1 ORDER BY at", run_id)
    d = dict(row)
    tin, tout = d.pop("tokens_in") or 0, d.pop("tokens_out") or 0
    d["tokens"] = {"value": tin + tout, "unit": "tokens", "basis": "measured", "as_of": now_iso(), "source": "agent_runs"}
    d["perf_raw"] = d.pop("perf")
    d["steps"] = [{**dict(c), "ms": float(c["ms"]) if c["ms"] is not None else None} for c in calls]
    d["confirms"] = [dict(c) for c in cfs]
    from .envelope import RawJSON
    from .envelope import dumps
    return RawJSON(json.loads(dumps(d)))


@router.get("/agent/models")
async def models(request: Request):
    require(principal(request))
    _bg()
    backends, config, _, _ = _agent()
    r = await redis()
    raw = await r.hgetall("agent:models")
    if not raw:
        h = await backends.health(r)
    else:
        h = {k: json.loads(v) for k, v in raw.items()}
    items = []
    for name, v in h.items():
        items.append({"id": v["id"], "name": name, "backend": v["backend"], "role": v["role"], "resident": bool(v["ok"]), "license": v["license"],
                      "family": v["family"], "gpu": v["gpu"], "onprem": True, "base": v["base"], "error": v.get("error"),
                      "probe": {"value": v.get("probe_ms"), "unit": "ms", "basis": "measured", "as_of": v["as_of"], "source": "GET /v1/models"}
                      if v.get("probe_ms") is not None else None})
    if "dokpamo" in config.BACKENDS and not any(x["name"] == "dokpamo" for x in items):     # 승격 자리 — 헬스 해시가 아직 옛것이어도 보인다
        d = config.BACKENDS["dokpamo"]
        items.append({"id": d.get("model") or "", "name": "dokpamo", "backend": "dokpamo", "role": ["planner", "writer"], "resident": False,
                      "license": d.get("license"), "family": d.get("family"), "gpu": d.get("gpu"), "onprem": True, "base": d.get("base"),
                      "error": "not_connected", "probe": None})
    for x in items:
        v = h.get(x["name"]) or {}
        x["label"] = v.get("label") or config.BACKENDS.get(x["name"], {}).get("label")
        if x["name"] == "dokpamo":
            on = config.backend_on("dokpamo")
            x["state"] = ("연결됨" if x["resident"] else "응답 없음") if on else "연결 전"
            x["enabled"] = on
            x["in_chain"] = "dokpamo" in config.CHAIN
            if not on:
                x["probe"] = None
        else:
            x["state"] = "연결됨" if x["resident"] else "응답 없음"
    order = {"vllm": 0, "router": 1, "ollama": 2, "dokpamo": 3}
    items.sort(key=lambda x: order.get(x["name"], 9))
    active = next((x for x in items if x["name"] in config.CHAIN and x["resident"]), None)
    return {"items": items, "active": active["name"] if active else None, "external": False, "chain": config.CHAIN, "as_of": now_iso()}


FILE_TYPES = {"docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "png": "image/png", "jpg": "image/jpeg",
              "jpeg": "image/jpeg", "webp": "image/webp", "csv": "text/csv; charset=utf-8", "pdf": "application/pdf",
              "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}


@router.get("/agent/runs/{run_id}/files/{name}")
async def run_file(run_id: str, name: str, request: Request):
    """run 산출 파일(명령 바 file·image 블록 · plan 3.3). 권한 = run 소유(본인 · 같은 기관 · LX 관리자). 이름은 run 폴더 안 파일 하나만."""
    p = require(principal(request))
    row = await _own_run(p, run_id)
    _, config, _, _ = _agent()
    if not config.RUN_FILE.match(name or "") or "/" in name or "\\" in name or ".." in name:
        raise ApiError("bad_request", "파일 이름 형식")
    base = (config.ARTIFACT_DIR / run_id).resolve()
    f = (base / name).resolve()
    if f.parent != base or not f.is_file():
        raise ApiError("not_found", "파일 없음(작성 중이거나 실패)")
    ext = f.suffix.lower().lstrip(".")
    art = row["artifact"] or {}
    shown = art.get("filename") if (ext == "docx" and name == "draft.docx") else name
    return FileResponse(str(f), media_type=FILE_TYPES.get(ext, "application/octet-stream"),
                        headers={"Content-Disposition": f"{'inline' if ext in ('png', 'jpg', 'jpeg', 'webp') else 'attachment'}; filename=\"file.{ext}\"; filename*=UTF-8''{urlquote(shown or name)}",
                                 "Cache-Control": "private, max-age=600", "Access-Control-Expose-Headers": "Content-Disposition"})


@router.get("/agent/runs/{run_id}/draft.docx")
async def draft_file(run_id: str, request: Request):
    p = require(principal(request))
    row = await _own_run(p, run_id)
    _, config, _, _ = _agent()
    f = config.ARTIFACT_DIR / run_id / "draft.docx"
    if not f.exists():
        raise ApiError("not_found", "초안 파일 없음(작성 중이거나 실패)")
    art = row["artifact"] or {}
    name = art.get("filename") or "실태조사_초안.docx"
    return FileResponse(str(f), media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                        headers={"Content-Disposition": f"attachment; filename=\"draft.docx\"; filename*=UTF-8''{urlquote(name)}",
                                 "Access-Control-Expose-Headers": "Content-Disposition"})
