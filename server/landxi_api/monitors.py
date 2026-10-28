"""상시 모니터링 대상지(10-28 지시서 v5 §3-8 · §4-5) — 등록 · 상태 표시까지만(스케줄 실행 없음).
대시보드 칸 · 프로젝트 · 결과 카드가 같은 줄(change_monitors)을 읽는다. 시점 쌍 = 그 대상지의 끝난 국토 변화 결과(시점 표기 · M5).
다음 영상 = 가장 늦은 시점 + 1년(국토지리정보원 영상이 그 해에 나오면 자동 분석 — 등록해 둔 표시 · 실행은 향후).

POST /change/ranges/{id}/monitor {on: true|false}   GET /change/monitors[?range_id=|project_id=]
"""
from __future__ import annotations

from fastapi import APIRouter, Request

from .deps import ApiError, audit, db, principal, require
from .envelope import env, now_iso

router = APIRouter()


async def _items(p, range_id: str | None = None, project_id: str | None = None) -> list[dict]:
    async with db(realm="lx") as conn:
        rows = await conn.fetch(
            "SELECT m.range_id, m.on_at, g.name, g.project_id FROM change_monitors m JOIN change_ranges g ON g.id=m.range_id "
            "WHERE m.user_id=$1 AND m.off_at IS NULL AND ($2::text IS NULL OR m.range_id=$2) AND ($3::text IS NULL OR g.project_id=$3) ORDER BY m.on_at DESC",
            p.user_id, range_id, project_id)
        out = []
        for r in rows:
            runs = await conn.fetch(
                "SELECT DISTINCT ON (c.year_a, c.year_b) c.job_id, c.year_a, c.year_b FROM change_runs c LEFT JOIN jobs j ON j.id=c.job_id "
                "WHERE c.range_id=$1 AND c.state='done' AND c.year_a<>c.year_b AND coalesce(j.card_id,'card-change')='card-change' "
                "ORDER BY c.year_a, c.year_b, c.done_at DESC", r["range_id"])
            pairs = sorted(({"from": x["year_a"], "to": x["year_b"], "word": f"{x['year_a']} → {x['year_b']}", "job_id": x["job_id"]} for x in runs),
                           key=lambda x: (x["to"], x["from"]))
            last = max([x["to"] for x in pairs] or [0])
            out.append({"range_id": r["range_id"], "name": r["name"], "project_id": r["project_id"], "on_at": r["on_at"].isoformat(timespec="seconds"),
                        "pairs": pairs, "n_pairs": env(len(pairs), "count", "recorded", "끝난 국토 변화 결과(시점 쌍)"),
                        "year": last + 1 if last else None,
                        "next_word": f"다음 영상({last + 1}) 확보 시 자동 분석" if last else "첫 비교 결과가 나오면 다음 영상부터 자동 분석"})
    return out


@router.post("/change/ranges/{rid}/monitor")
async def set_monitor(rid: str, body: dict, request: Request):
    p = require(principal(request), lx=True)
    from .change import get_range_row
    await get_range_row(p, rid)
    on = body.get("on") is not False
    async with db(realm="lx") as conn:
        if on:
            await conn.execute("INSERT INTO change_monitors(range_id, user_id) VALUES ($1,$2) ON CONFLICT (range_id, user_id) DO UPDATE SET on_at=now(), off_at=NULL",
                               rid, p.user_id)
        else:
            await conn.execute("UPDATE change_monitors SET off_at=now() WHERE range_id=$1 AND user_id=$2", rid, p.user_id)
        await audit(conn, p, "change.monitor", rid, None, {"on": on})
    it = await _items(p, range_id=rid)
    return {"range_id": rid, "on": on, "item": it[0] if it else None, "as_of": now_iso()}


@router.get("/change/monitors")
async def monitors(request: Request, range_id: str | None = None, project_id: str | None = None):
    p = require(principal(request), lx=True)
    if p.role not in ("staff", "admin"):
        raise ApiError("forbidden", "LX 직원 · 관리자만")
    return {"items": await _items(p, range_id, project_id), "as_of": now_iso()}
