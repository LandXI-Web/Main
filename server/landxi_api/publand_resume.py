"""전국 공공용지 작업 자동 이어 돌기(11-02 PM 확인) — 재부팅으로 끊긴 전국 작업을 체크포인트부터 다시 시작한다.

게이트웨이가 뜰 때 한 번만 돈다. 조건이 모두 맞을 때만 새 작업을 낸다:
- 전국 범위의 가장 최근 작업이 '분석 장비가 응답하지 않아' 멈췄고(failed), 멈춘 지 얼마 안 됐다
- 사람이 취소한 작업이 아니다 · 같은 범위에 도는 작업이 없다 · 오늘 자동으로 이어 돈 횟수가 3번 미만이다
- 낸 사람 계정이 살아 있다(같은 낸 사람 · 같은 범위 · 같은 영상으로 낸다)
3번을 넘으면 내지 않고 기록만 남긴다(audit_log publand.auto_resume.stop).
"""
from __future__ import annotations

import asyncio
import time
from types import SimpleNamespace

from .deps import CAPS, Principal, audit, db, redis

NATIONAL_SRC = "publand:national"
DAILY_MAX = 3                # 하루 자동 이어 돌기 상한(PM)
NO_RESPONSE = "응답하지 않아"    # change_jobs.watch_once 가 적는 말
FRESH_S = 3600               # 멈춘 지 1시간 안의 것만 — 오래전에 멈춰 둔 작업을 재시작 때 되살리지 않게
SETTLE_S = 150               # 감시가 끊긴 작업을 표시할 시간(숨 30초 + 감시 5초 · 넉넉히)
WORKER_WAIT_S = 1800         # 작업기가 뜨기를 기다리는 시간
EXTRA_WORKER_S = 60          # 한 장이 먼저 뜬 뒤 다른 한 장을 기다리는 시간


async def latest() -> dict | None:
    """전국 범위의 가장 최근 작업 + 같은 범위에 도는 작업 수."""
    async with db(realm="lx") as conn:
        r = await conn.fetchrow(
            "SELECT c.job_id, c.range_id, c.year_a, c.year_b, j.state, j.error, j.finished_at, j.submitted_by, j.card_id, j.options "
            "FROM change_runs c JOIN change_ranges g ON g.id=c.range_id JOIN jobs j ON j.id=c.job_id "
            "WHERE g.source_name=$1 ORDER BY c.created_at DESC LIMIT 1", NATIONAL_SRC)
        if not r:
            return None
        n = await conn.fetchval("SELECT count(*) FROM change_runs c JOIN jobs j ON j.id=c.job_id "
                                "WHERE c.range_id=$1 AND j.state IN ('queued','running')", r["range_id"])
    return {**dict(r), "active": int(n)}


async def today_count() -> int:
    async with db(realm="lx") as conn:
        return int(await conn.fetchval(
            "SELECT count(*) FROM audit_log WHERE action='publand.auto_resume' "
            "AND at >= date_trunc('day', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul'"))


def decide(row: dict | None, count: int, now: float) -> str:
    """'resume' 이면 새 작업을 낸다 · 그 밖은 이유 한 낱말(화면에 안 나가는 기록용)."""
    if not row:
        return "no_run"
    if row["active"]:
        return "running"
    if row["state"] != "failed":
        return row["state"]                     # done · cancelled — 사람이 멈춘 것은 잇지 않는다
    if NO_RESPONSE not in (row["error"] or ""):
        return "other_error"
    fin = row["finished_at"]
    if not fin or now - fin.timestamp() > FRESH_S:
        return "old"
    if count >= DAILY_MAX:
        return "limit"
    return "resume"


def start_args(row: dict) -> dict:
    """원래 작업과 같은 값 — 영상 · 카드 · 낸 곳(분석 서비스 = 개인 결과). resume_from 은 start_run 이 찾는다."""
    o = row["options"] or {}
    ch = o.get("change") or {}
    ya, yb = int(row["year_a"]), int(row["year_b"])
    sb = ch.get("src_b") or {"kind": "ngii", "year": yb}
    sa = ch.get("src_a") or ({"kind": "ngii", "year": ya} if ya != yb else None)
    return {"range_id": row["range_id"], "year_a": ya, "year_b": yb, "fresh": True, "via": o.get("requested_via") or "분석 서비스",
            "src_a": sa, "src_b": sb, "card_id": row["card_id"]}


async def owner(uid: str | None) -> Principal | None:
    """낸 사람 — LX 계정이고 살아 있을 때만."""
    if not uid:
        return None
    async with db(realm="lx") as conn:
        u = await conn.fetchrow("SELECT name, role, status FROM lx_users WHERE id=$1", uid)
    if not u or u["status"] != "active":
        return None
    return Principal(realm="lx", role=u["role"], user_id=uid, name=u["name"], caps=CAPS.get(("lx", u["role"]), []))


async def _record(action: str, subject: str, after: dict):
    async with db(realm="lx") as conn:
        await audit(conn, Principal(realm="lx", role="admin", user_id="system", name="system"), action, subject, None, after)


async def _wait_workers(pool: str) -> bool:
    from .jobs import active_workers
    end = time.time() + WORKER_WAIT_S
    while time.time() < end:
        if await active_workers(pool):
            await asyncio.sleep(EXTRA_WORKER_S)
            return True
        await asyncio.sleep(15)
    return False


async def run_once():
    """부팅 뒤 한 번 — 어떤 실패도 게이트웨이를 멈추지 않는다."""
    try:
        await asyncio.sleep(SETTLE_S)
        row = await latest()
        why = decide(row, await today_count(), time.time())
        if why == "limit":
            print(f"[publand] 자동 이어 돌기 멈춤: 오늘 {DAILY_MAX}번을 넘었습니다", flush=True)
            await _record("publand.auto_resume.stop", row["job_id"], {"limit": DAILY_MAX})
            return
        if why != "resume":
            print(f"[publand] 자동 이어 돌기 안 함: {why}", flush=True)
            return
        p = await owner(row["submitted_by"])
        if p is None:
            print("[publand] 자동 이어 돌기 안 함: 낸 사람 계정 없음", flush=True)
            await _record("publand.auto_resume.stop", row["job_id"], {"why": "owner"})
            return
        pool = (await (await redis()).hget(f"job:{row['job_id']}", "pool")) or "a6000"
        if not await _wait_workers(pool):
            print("[publand] 자동 이어 돌기 안 함: 작업기가 뜨지 않았습니다", flush=True)
            await _record("publand.auto_resume.stop", row["job_id"], {"why": "no_worker"})
            return
        row2 = await latest()                   # 기다리는 사이 사람이 냈으면 잇지 않는다
        why = decide(row2, await today_count(), time.time())
        if why != "resume" or row2["job_id"] != row["job_id"]:
            print(f"[publand] 자동 이어 돌기 안 함: {why}", flush=True)
            return
        from .change import start_run
        a = start_args(row)
        out = await start_run(SimpleNamespace(state=SimpleNamespace(principal=p)), p, a["range_id"], a["year_a"], a["year_b"], a["fresh"],
                              via=a["via"], src_a=a["src_a"], src_b=a["src_b"], card_id=a["card_id"])
        r = await redis()
        nt = await r.hget(f"job:{row['job_id']}", "chg_notify")
        if nt:                                  # 끝나면 알림도 그대로(배치로 낸 작업)
            await r.hset(f"job:{out['job_id']}", "chg_notify", nt)
        await _record("publand.auto_resume", out["job_id"], {"from": row["job_id"], "by": p.user_id})
        print(f"[publand] 자동 이어 돌기: {row['job_id']} → {out['job_id']}", flush=True)
    except Exception as e:  # noqa: BLE001
        print(f"[publand] 자동 이어 돌기 실패: {e!r}", flush=True)
        try:
            await _record("publand.auto_resume.stop", "error", {"why": repr(e)[:200]})
        except Exception:  # noqa: BLE001
            pass
