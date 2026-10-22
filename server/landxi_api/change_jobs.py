"""변화 탐지 작업 상태 · 예외 처리(10-22 수정 지시서 v2 F3) — 채팅 · 프로젝트 · 대시보드가 같은 상태 한 가지를 본다.

상태(화면 말): 작업 대기(대기열 n번째 / N) → 분석 중(영상 칸 k/K · 경과 · 남은 시간) → 완료 / 실패(사유) / 취소됨 / 시간초과(사유)
규칙: 대기 30초 넘으면 대기열 자리 · 예상 분 · 분석 10분 넘으면 '계속 기다리기 · 알림 받기 · 취소' · 20분 넘거나 워커 숨이 60초 끊기면 시간초과(사유 · 다시 시도).
값 출처: jobs 표 · 작업 해시(job:{작업} — 워커 change/worker_hooks.py 가 적음) · change_runs. 지어낸 진행률 0(워커가 적은 값만).

GET  /change/runs/{작업}/status        상태 한 묶음
POST /change/runs/{작업}/cancel        취소(요청자 · 관리자) → 다음 칸 사이에서 GPU 를 놓음
POST /change/runs/{작업}/retry         같은 대상지 · 같은 두 해로 새 작업
POST /change/runs/{작업}/later         끝나면 요청함 알림(백그라운드로)
GET  /change/active                    내 진행 중 변화 탐지(대시보드 · 요청함 카드)
감시: 게이트웨이 안 15초마다 — 시간초과 판정 · 끝난 작업 알림(백그라운드로 보낸 것).
"""
from __future__ import annotations

import asyncio
import json
import time

from fastapi import APIRouter, Request

from .deps import ApiError, audit, db, principal, redis, require
from .envelope import env, now_iso

router = APIRouter()
RUN_MAX_S = 20 * 60          # 분석 20분 넘으면 시간초과
HB_MAX_S = 30                # 워커 숨 30초 끊기면 시간초과(숨은 5초마다 · 감시는 5초마다 → 끊긴 뒤 35초 안에 표시)
FIRST_HB_MAX_S = 120         # 칸을 받은 뒤 첫 숨이 이만큼 없으면(워커가 받고 멈춤) 시간초과
QUEUE_SHOW_S = 30            # 대기 30초 넘으면 대기열 자리 · 예상
ASK_AT_S = 10 * 60           # 분석 10분 넘으면 고르기
STAGE_WORD = {"prepare": "준비", "imagery": "영상 받기", "infer": "토지피복 AI 분석", "polygons": "변화 폴리곤 만들기", "owner": "필지 · 소유구분 겹치기",
              "thumbs": "두 해 썸네일 만들기", "done": "마무리", "failed": "멈춤"}
WORD = {"queued": "작업 대기", "running": "분석 중", "done": "완료", "failed": "실패", "cancelled": "취소됨", "timeout": "시간초과"}


def _f(v, d=0.0):
    try:
        return float(v)
    except (TypeError, ValueError):
        return d


async def job_status(job_id: str) -> dict:
    """작업 하나의 상태(화면 · 채팅 · 프로젝트가 같이 쓴다)."""
    r = await redis()
    h = await r.hgetall(f"job:{job_id}") or {}
    async with db(realm="lx") as conn:
        j = await conn.fetchrow("SELECT state, error, created_at, started_at, finished_at, priority, pool, submitted_by FROM jobs WHERE id=$1", job_id)
        cr = await conn.fetchrow("SELECT state, range_id, year_a, year_b, created_by FROM change_runs WHERE job_id=$1", job_id)
        pos = tot = None
        if j and (h.get("state") or j["state"]) == "queued":
            rows = await conn.fetch("SELECT id FROM jobs WHERE pool=$1 AND state IN ('queued','running') AND NOT (options ? 'national') "
                                    "AND NOT (options ? 'overseas') ORDER BY priority, created_at", j["pool"])
            ids = [x["id"] for x in rows]
            tot = len(ids)
            pos = ids.index(job_id) + 1 if job_id in ids else None
    now = time.time()
    raw = (h.get("state") or (j["state"] if j else None) or (cr["state"] if cr else "queued"))
    err = (h.get("chg_error") or (j["error"] if j else None) or "").strip()
    if cr and cr["state"] == "done":
        raw = "done"
    st = raw
    if raw == "failed" and err.startswith("timeout"):
        st = "timeout"
    created = j["created_at"].timestamp() if j and j["created_at"] else now
    started = _f(h.get("chg_started")) or (j["started_at"].timestamp() if j and j["started_at"] else None)
    frac = _f(h.get("chg_frac"))
    elapsed = (now - started) if (started and st == "running") else None
    eta = None
    if st == "running" and elapsed and frac >= 0.05:
        eta = max(5.0, elapsed * (1 - frac) / frac)
    waited = now - created
    out = {"job_id": job_id, "state": st, "word": WORD.get(st, st),
           "stage": STAGE_WORD.get(h.get("chg_stage") or "", "") if st == "running" else "",
           "progress": env(round(frac * 100) if st == "running" else (100 if st == "done" else None), "%", "measured", "분석 장비가 적은 진행(영상 칸 · 단계)"),
           "tiles": {"n": int(_f(h.get("chg_k"))), "total": int(_f(h.get("chg_K")))} if h.get("chg_K") else None,   # 영상 칸 블록 k/K
           "elapsed": env(round(elapsed) if elapsed is not None else None, "s", "measured", "분석 시작부터"),
           "remaining": env(round(eta) if eta is not None else None, "s", "estimate", "지금까지 진행 속도로 어림"),
           "waited": env(round(waited) if st == "queued" else None, "s", "measured", "요청부터"),
           "queue": {"position": pos, "total": tot} if (st == "queued" and pos and waited >= QUEUE_SHOW_S) else None,
           "ask": bool(st == "running" and elapsed and elapsed >= ASK_AT_S),
           "reason": (err.split(":", 1)[1].strip() if err.startswith("timeout") else err) if st in ("failed", "timeout") else None,
           "can_cancel": st in ("queued", "running"), "can_retry": st in ("failed", "timeout", "cancelled"),
           "notify": bool(h.get("chg_notify")), "as_of": now_iso()}
    if out["queue"]:
        out["queue_wait"] = env((out["queue"]["position"] or 1) * 180, "s", "estimate", "앞 작업마다 약 3분(담양 크기 기준)")
    if cr:
        out["range_id"] = cr["range_id"]
        out["period"] = {"a": {"year": cr["year_a"]}, "b": {"year": cr["year_b"]}}
    return out


async def _own(p, job_id: str):
    async with db(realm="lx") as conn:
        row = await conn.fetchrow("SELECT submitted_by, tenant_id FROM jobs WHERE id=$1", job_id)
    if not row:
        raise ApiError("not_found", "작업을 찾을 수 없습니다")
    if not (p.is_admin or row["submitted_by"] == p.user_id or (p.is_lx and p.role == "staff")):
        raise ApiError("forbidden", "요청한 사람 · 관리자만")
    return row


@router.get("/change/runs/{job_id}/status")
async def status(job_id: str, request: Request):
    p = require(principal(request))
    from .change import run_row
    await run_row(p, job_id)                       # 볼 수 있는 결과인지(기관은 공유받은 것만)
    return await job_status(job_id)


async def stop(job_id: str, state: str, reason: str, by: str):
    """작업 멈추기 — jobs · 작업 해시 · change_runs 같은 값 · 사건 한 줄(워커는 다음 칸 사이에서 보고 GPU 를 놓는다)."""
    from .jobs import publish
    r = await redis()
    now = now_iso()
    err = reason if (state == "cancelled" or reason.startswith("timeout")) else (f"timeout: {reason}" if state == "timeout" else reason)
    db_state = "cancelled" if state == "cancelled" else "failed"
    await r.hset(f"job:{job_id}", mapping={"state": db_state, "finished_at": now, "chg_error": "" if state == "cancelled" else err})
    async with db(realm="lx") as conn:
        await conn.execute("UPDATE jobs SET state=$2, error=$3, finished_at=now() WHERE id=$1 AND state IN ('queued','running')",
                           job_id, db_state, None if state == "cancelled" else err)
        await conn.execute("UPDATE change_runs SET state=$2 WHERE job_id=$1 AND state<>'done'", job_id, "cancelled" if state == "cancelled" else "failed")
    await publish(job_id, "job.cancelled" if state == "cancelled" else "job.failed", {"job_id": job_id, "error": err, "by": by, "at": now})


@router.post("/change/runs/{job_id}/cancel")
async def cancel(job_id: str, request: Request):
    p = require(principal(request))
    await _own(p, job_id)
    s0 = await job_status(job_id)
    if s0["state"] in ("queued", "running"):
        await stop(job_id, "cancelled", "사용자가 취소", p.user_id or "")
        async with db(p) as conn:
            await audit(conn, p, "change.run.cancel", job_id, {"state": s0["state"]}, {"state": "cancelled"})
    return await job_status(job_id)


@router.post("/change/runs/{job_id}/retry", status_code=202)
async def retry(job_id: str, request: Request):
    p = require(principal(request))
    from .change import start_run
    async with db(realm="lx") as conn:
        cr = await conn.fetchrow("SELECT range_id, year_a, year_b FROM change_runs WHERE job_id=$1", job_id)
    if not cr:
        raise ApiError("not_found", "작업을 찾을 수 없습니다")
    s0 = await job_status(job_id)
    if s0["state"] in ("queued", "running", "done"):
        return {"job_id": job_id, "state": s0["state"], "same": True}
    res = await start_run(request, p, cr["range_id"], cr["year_a"], cr["year_b"], fresh=True)
    async with db(p) as conn:
        await audit(conn, p, "change.run.retry", res["job_id"], {"from": job_id}, None)
    return res


@router.post("/change/runs/{job_id}/later")
async def later(job_id: str, request: Request):
    """백그라운드로 — 끝나면(완료 · 실패 · 시간초과) 요청한 사람 요청함에 알림 한 줄."""
    p = require(principal(request))
    await _own(p, job_id)
    r = await redis()
    await r.hset(f"job:{job_id}", "chg_notify", p.user_id or "")
    return await job_status(job_id)


@router.get("/change/active")
async def active(request: Request):
    """진행 중 변화 탐지(내가 요청한 것 · 관리자는 전부) — LX 직원 대시보드 · 요청함 카드."""
    p = require(principal(request), lx=True)
    async with db(realm="lx") as conn:
        rows = await conn.fetch("SELECT r.job_id, g.name, g.project_id FROM change_runs r JOIN change_ranges g ON g.id=r.range_id JOIN jobs j ON j.id=r.job_id "
                                "WHERE j.state IN ('queued','running') AND ($1 OR j.submitted_by=$2) ORDER BY j.created_at DESC LIMIT 20",
                                bool(p.is_admin), p.user_id)
    items = []
    for x in rows:
        s = await job_status(x["job_id"])
        s.update({"name": x["name"], "project_id": x["project_id"]})
        items.append(s)
    return {"items": items, "as_of": now_iso()}


async def _notify(job_id: str, uid: str, st: dict):
    """알림 한 줄(lx_notices · kind 'change.job') — 프로젝트 목록 · LX 직원 대시보드 '내 프로젝트' 알림 칸에 보인다."""
    import secrets
    try:
        async with db(realm="lx") as conn:
            row = await conn.fetchrow("SELECT g.name, g.project_id FROM change_runs r JOIN change_ranges g ON g.id=r.range_id WHERE r.job_id=$1", job_id)
            name = row["name"] if row else "변화 탐지"
            text = {"done": f"{name} — 변화 탐지가 끝났습니다", "failed": f"{name} — 변화 탐지가 멈췄습니다",
                    "timeout": f"{name} — 변화 탐지가 시간초과로 멈췄습니다"}.get(st["state"], f"{name} — 변화 탐지 {st['word']}")
            await conn.execute("INSERT INTO lx_notices(id, user_id, kind, project_id, text, note, by) VALUES ($1,$2,'change.job',$3,$4,$5,'system:change')",
                               "nt_" + secrets.token_hex(6), uid, row["project_id"] if row else None, text[:200], (st.get("reason") or "")[:200] or None)
    except Exception as e:  # noqa: BLE001
        print("[change] notify", type(e).__name__, str(e)[:160], flush=True)


async def watch_once():
    r = await redis()
    now = time.time()
    async with db(realm="lx") as conn:
        rows = await conn.fetch("SELECT r.job_id, j.state, j.created_at, j.started_at FROM change_runs r JOIN jobs j ON j.id=r.job_id "
                                "WHERE j.state IN ('queued','running') OR (r.state NOT IN ('done','cancelled','failed') AND j.state IN ('done','failed','cancelled'))")
    for x in rows:
        jid = x["job_id"]
        h = await r.hgetall(f"job:{jid}") or {}
        st = h.get("state") or x["state"]
        if st == "running":
            hb = _f(h.get("chg_hb"))
            started = _f(h.get("chg_started")) or (x["started_at"].timestamp() if x["started_at"] else now)
            if hb and now - hb > HB_MAX_S:
                await stop(jid, "timeout", f"timeout: 분석 장비가 {int(now - hb)}초 동안 응답하지 않아 멈췄습니다", "watchdog")
            elif not hb and x["started_at"] and now - x["started_at"].timestamp() > FIRST_HB_MAX_S:
                await stop(jid, "timeout", "timeout: 분석 장비가 작업을 받은 뒤 시작하지 못했습니다", "watchdog")
            elif now - started > RUN_MAX_S and not h.get("chg_keep"):
                await stop(jid, "timeout", "timeout: 20분 안에 끝나지 않아 멈췄습니다", "watchdog")
        elif st == "queued" and now - x["created_at"].timestamp() > RUN_MAX_S:
            await stop(jid, "timeout", "timeout: 20분 넘게 분석 장비 차례가 오지 않았습니다", "watchdog")
        uid = h.get("chg_notify")
        if uid and not h.get("chg_notified"):
            s = await job_status(jid)
            if s["state"] in ("done", "failed", "timeout"):
                await r.hset(f"job:{jid}", "chg_notified", now_iso())
                await _notify(jid, uid, s)
    # 끝난 작업 중 알림을 기다리는 것(위 줄에서 빠진 done 작업)
    async with db(realm="lx") as conn:
        done = await conn.fetch("SELECT job_id FROM change_runs WHERE state='done' AND done_at > now() - interval '1 hour'")
    for x in done:
        h = await r.hgetall(f"job:{x['job_id']}") or {}
        if h.get("chg_notify") and not h.get("chg_notified"):
            await r.hset(f"job:{x['job_id']}", "chg_notified", now_iso())
            await _notify(x["job_id"], h["chg_notify"], await job_status(x["job_id"]))


_task = {"t": None}


async def _loop():
    while True:
        try:
            r = await redis()
            if await r.set("change:watch:lock", "1", nx=True, ex=4):      # 게이트웨이 프로세스 여럿 — 한 곳만(5초마다)
                await watch_once()
        except Exception as e:  # noqa: BLE001
            print("[change] watch", type(e).__name__, str(e)[:200], flush=True)
        await asyncio.sleep(5)


@router.on_event("startup")
async def _start():
    if _task["t"] is None:
        _task["t"] = asyncio.create_task(_loop())
