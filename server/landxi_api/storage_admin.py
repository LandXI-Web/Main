"""기관별 저장 사용량 · 지울 날짜 한 표 · 기관 공유 이력(10-22 now21 채택 제안 · 바퀴 22 P4) — LX 관리자 전용.

GET /ops/storage-tenants          기관마다 한 줄: 올린 영상 원본 · 표준본 · 분석 결과 · 기관 공간 · 합계 + 다음에 지울 것(무엇 · 날짜)
                                  숫자 = DB 에 적힌 크기(원본 · 표준본 = 영상 표준 기록 · 결과 = 작업이 끝날 때 적은 jobs.result_bytes)
                                  + 기관 공간 폴더(작아서 바로 잼 · 10분 기억). 폴더 전체를 훑지 않는다(저장 현황 가볍게).
GET /ops/share-history?tenant=    기관 공유 이력(share_history · 0122) — 언제 어느 기관에 어느 서비스 판 · 영상을 공유 · 바꿈 · 거둠
"""
from __future__ import annotations

import datetime as dt
import os
import time

from fastapi import APIRouter, Request
from starlette.concurrency import run_in_threadpool

from . import config
from .deps import db, principal, require
from .envelope import env, now_iso

router = APIRouter()
_space_mem: dict[str, tuple[float, int]] = {}
SPACE_TTL = 600


def _du(p) -> int:
    n = 0
    for dp, _dn, fn in os.walk(p):
        for x in fn:
            try:
                n += os.path.getsize(os.path.join(dp, x))
            except OSError:
                pass
    return n


async def _space_bytes(t: str) -> int:
    hit = _space_mem.get(t)
    if hit and time.time() - hit[0] < SPACE_TTL:
        return hit[1]
    v = await run_in_threadpool(_du, config.DATA_ROOT / "tenants" / t / "space")
    _space_mem[t] = (time.time(), v)
    return v


def _day(d) -> str | None:
    if d is None:
        return None
    if isinstance(d, dt.datetime):
        d = d.date()
    return d.isoformat()


@router.get("/ops/storage-tenants")
async def storage_tenants(request: Request):
    require(principal(request), admin=True)
    from workers.metering import STORE_OWNER_EXPR
    from .retention import settings as keep_settings
    keep = keep_settings()
    fc_days = int(keep.get("failed_cancelled_days") or 30)
    async with db(realm="lx") as conn:
        ts = await conn.fetch("SELECT id, name, kind, scope, parent_id FROM tenants WHERE coalesce(status, 'active') = 'active' "
                              "AND id <> 'lx-demo' ORDER BY (id = 'lx') DESC, id")
        std = {r["t"]: r for r in await conn.fetch(
            "SELECT tenant_id t, coalesce(sum(orig_size) FILTER (WHERE orig_deleted_at IS NULL AND orig_owned AND state <> 'removed'), 0) orig_b, "
            "count(*) FILTER (WHERE orig_deleted_at IS NULL AND orig_owned AND state <> 'removed') orig_n, "
            "coalesce(sum(std_size) FILTER (WHERE state = 'ready' AND std_path IS DISTINCT FROM orig_path), 0) std_b, "
            "count(*) FILTER (WHERE state = 'ready' AND std_path IS DISTINCT FROM orig_path) std_n, "
            "min(orig_delete_on) FILTER (WHERE orig_deleted_at IS NULL AND orig_owned AND state = 'ready' AND orig_delete_on IS NOT NULL) orig_next "
            "FROM imagery_std GROUP BY 1")}
        res = {r["t"]: r for r in await conn.fetch(
            f"SELECT ({STORE_OWNER_EXPR}) t, coalesce(sum(j.result_bytes), 0) b, count(*) FILTER (WHERE j.result_bytes IS NOT NULL) n, "
            f"count(*) FILTER (WHERE j.result_bytes IS NULL) unknown FROM jobs j "
            f"WHERE NOT j.demo AND j.result_set LIKE 'results/%' AND j.state = 'done' GROUP BY 1")}
        gone = {r["t"]: r for r in await conn.fetch(
            f"SELECT ({STORE_OWNER_EXPR}) t, min(coalesce(j.finished_at, j.started_at, j.created_at)) first_end, count(*) n FROM jobs j "
            f"WHERE j.state IN ('cancelled', 'failed') AND j.result_set IS NOT NULL AND NOT j.demo GROUP BY 1")}
    rows = []
    for t in ts:
        tid = t["id"]
        s = std.get(tid) or {}
        r = res.get(tid) or {}
        sp = await _space_bytes(tid) if tid != "lx" else 0
        nxt = []
        if s.get("orig_next"):
            nxt.append({"what": "올린 영상 원본(표준본은 남음)", "on": _day(s["orig_next"]), "n": int(s.get("orig_n") or 0)})
        g = gone.get(tid)
        if g and g["first_end"]:
            nxt.append({"what": "취소 · 실패한 분석의 결과", "on": _day(g["first_end"] + dt.timedelta(days=fc_days)), "n": int(g["n"])})
        nxt.sort(key=lambda x: x["on"] or "9999")
        ob, sb, rb = int(s.get("orig_b") or 0), int(s.get("std_b") or 0), int(r.get("b") or 0)
        src_std = "영상 표준 기록(imagery_std)"
        src_res = "작업이 끝날 때 적은 결과 크기(jobs.result_bytes)"
        rows.append({
            "tenant": tid, "name": (t["name"] or {}).get("ko") if isinstance(t["name"], dict) else t["name"], "kind": t["kind"],
            "overseas": t["scope"] == "global", "parent": t["parent_id"],
            "originals": env(ob, "bytes", "measured", src_std, f"{int(s.get('orig_n') or 0)}개"),
            "standard": env(sb, "bytes", "measured", src_std, f"{int(s.get('std_n') or 0)}개"),
            "results": env(rb, "bytes", "measured", src_res,
                           (f"크기를 아직 적지 않은 결과 {int(r.get('unknown') or 0)}건" if r.get("unknown") else None)),
            "space": env(sp, "bytes", "measured", f"tenants/{tid}/space 폴더(10분 기억)") if tid != "lx" else None,
            "total": env(ob + sb + rb + sp, "bytes", "measured", "원본 + 표준본 + 결과 + 공간"),
            "next_delete": nxt[:2],
        })
    return {"items": rows, "keep": {"originals_days": None, "failed_cancelled_days": fc_days}, "as_of": now_iso()}


@router.get("/ops/share-history")
async def share_history(request: Request, tenant: str | None = None, limit: int = 100):
    require(principal(request), admin=True)
    limit = max(1, min(int(limit or 100), 500))
    async with db(realm="lx") as conn:
        if not await conn.fetchval("SELECT to_regclass('public.share_history') IS NOT NULL"):
            return {"items": [], "as_of": now_iso()}
        rows = await conn.fetch(
            "SELECT h.at, h.tenant_id, h.kind, h.ref_id, h.card_id, h.action, h.edition, h.stage, h.by_user, c.name AS card_name, "
            "i.name AS imagery_name FROM share_history h LEFT JOIN cards c ON c.id = h.card_id "
            "LEFT JOIN imagery i ON h.kind = 'imagery' AND i.id = h.ref_id "
            "WHERE ($1::text IS NULL OR h.tenant_id = $1) ORDER BY h.at DESC, h.id DESC LIMIT " + str(limit), tenant)
    word = {"share": "공유", "update": "판 바꿈", "unshare": "거둠", "backfill": "공유(이력 전부터)"}
    items = []
    for r in rows:
        nm = r["card_name"] if r["kind"] == "service" else r["imagery_name"]
        if isinstance(nm, dict):
            nm = nm.get("ko")
        items.append({"at": r["at"].isoformat(timespec="seconds"), "tenant": r["tenant_id"], "kind": r["kind"],
                      "what": nm or r["ref_id"], "action": word.get(r["action"], r["action"]), "stage": r["stage"], "by": r["by_user"]})
    return {"items": items, "as_of": now_iso()}
