"""피드백(F1-CONTRACT §4.5) — 기관의 오탐·누락 신고 → LX 라벨링 큐."""
from __future__ import annotations

import secrets

from fastapi import APIRouter, Request

from .deps import ApiError, audit, db, principal, require
from .envelope import now_iso

router = APIRouter()


@router.post("/feedback", status_code=201)
async def post_feedback(body: dict, request: Request):
    p = require(principal(request))
    if not (p.realm == "tenant" and "feedback.write" in p.caps) and not p.is_lx:
        raise ApiError("forbidden", "피드백은 기관 담당자(manager)")
    kind = body.get("kind", "other")
    if kind not in ("fp", "fn", "other"):
        raise ApiError("bad_request", "kind fp|fn|other")
    ll = body.get("lnglat")
    fid = "fb_" + secrets.token_hex(8)
    tenant = p.tenant_id or "lx"
    async with db(p) as conn:
        await conn.execute("INSERT INTO feedback(id, tenant_id, job_id, set_id, fid, pnu, lnglat, kind, note, state) VALUES "
                           "($1,$2,$3,$4,$5,$6, CASE WHEN $7::float8[] IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint(($7::float8[])[1], ($7::float8[])[2]),4326) END, $8,$9,'open')",
                           fid, tenant, body.get("job_id"), body.get("set"), body.get("fid"), body.get("pnu"), ll, kind, body.get("note"))
        await audit(conn, p, "feedback.create", fid, None, {"kind": kind, "fid": body.get("fid")})
    return {"id": fid, "state": "open", "at": now_iso()}


@router.get("/feedback")
async def list_feedback(request: Request, state: str | None = None):
    p = require(principal(request))
    async with db(p) as conn:
        rows = await conn.fetch("SELECT id, tenant_id, job_id, set_id, fid, pnu, kind, note, state, at, "
                                "CASE WHEN lnglat IS NULL THEN NULL ELSE ARRAY[ST_X(lnglat), ST_Y(lnglat)] END AS lnglat "
                                "FROM feedback WHERE ($1::text IS NULL OR state=$1) ORDER BY at DESC LIMIT 500", state)
    return {"items": [dict(r) for r in rows], "total": len(rows), "as_of": now_iso()}
