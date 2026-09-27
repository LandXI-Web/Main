"""배포(F1-CONTRACT §4.7 · §9) — 단계 배포 · 롤백 · 승인 · 고정 · 모듈 · 모델 · GPU 풀 · 이식(POST /deploys).

상태기계: draft → shadow → canary → ga(순방향 한 칸씩 · 건너뛰기 없음) · canary|ga → rolled_back · rolled_back → shadow|canary|ga.
ga 는 approve ≥ APPROVALS_REQUIRED(기본 1) — 마지막 롤백·이식 이후의 승인만 센다. 모든 쓰기 = audit_log + deploy.changed.
"""
from __future__ import annotations

import datetime as dt
import json
import secrets

from fastapi import APIRouter, Request

from . import config
from .deps import ApiError, Principal, audit, db, principal, require
from .envelope import KST, now_iso
from .jobs import ops_event

router = APIRouter()
CORE = ["mod-auth", "mod-map", "mod-result", "mod-stats", "mod-report", "mod-feedback", "mod-usage"]
FORWARD = {"draft": ["shadow"], "shadow": ["canary"], "canary": ["ga"], "ga": [], "rolled_back": ["shadow", "canary", "ga"]}
COLS = ("id, name, tenant_id, card_id, card_version_id, prev_card_version_id, region_profile, region_name, "
        "ST_AsGeoJSON(aoi, 6)::json AS aoi, stage, pinned, gpu_pool, from_deploy_id, modules, model_override, snapshot_current, "
        "snapshot_prev, year, status_history, scale, basis, created_at, updated_at")


def _iso(v):
    return v.astimezone(KST).isoformat(timespec="seconds") if v else None


async def deploy_dict(conn, r) -> dict:
    aps = await conn.fetch("SELECT id, decision, decided_by, reason, at FROM approvals WHERE subject_type='deploy' AND subject_id=$1 ORDER BY at", r["id"])
    ver = await conn.fetchval("SELECT version FROM card_versions WHERE id=$1", r["card_version_id"]) if r["card_version_id"] else None
    return {"id": r["id"], "name": r["name"], "tenant_id": r["tenant_id"], "card_id": r["card_id"], "card_version_id": r["card_version_id"],
            "version": ("v" + ver) if ver and not str(ver).startswith("v") else ver, "prev_card_version_id": r["prev_card_version_id"],
            "region_profile": r["region_profile"], "region_name": r["region_name"], "aoi": r["aoi"], "stage": r["stage"],
            "pinned": r["pinned"], "gpu_pool": r["gpu_pool"], "from_deploy_id": r["from_deploy_id"], "modules": r["modules"] or {"core": CORE, "ext": {}},
            "model_override": r["model_override"], "snapshot_current": r["snapshot_current"], "snapshot_prev": r["snapshot_prev"],
            "year": r["year"], "status_history": r["status_history"], "scale": r["scale"], "basis": r["basis"],
            "approvals": [{"id": a["id"], "decision": a["decision"], "by": a["decided_by"], "at": _iso(a["at"]), "reason": a["reason"]} for a in aps],
            "created_at": _iso(r["created_at"]), "updated_at": _iso(r["updated_at"])}


async def _get(conn, did: str):
    r = await conn.fetchrow(f"SELECT {COLS} FROM deploys WHERE id=$1", did)
    if not r:
        raise ApiError("not_found", f"deploy {did} 없음")
    return r


async def _changed(p: Principal, did: str, action: str, row):
    # tenant_id 를 실어 기관 스트림(v1.1-16 · events:tenant:{tenant})에도 같은 모양으로 복사된다 — XI맵 계보 칩 실시간
    await ops_event("deploy.changed", {"deploy_id": did, "action": action, "stage": row["stage"], "card_version_id": row["card_version_id"],
                                       "tenant_id": row["tenant_id"], "snapshot_current": row["snapshot_current"],
                                       "by": p.user_id, "at": now_iso()})


@router.get("/deploys")
async def list_deploys(request: Request, tenant_id: str | None = None, card_id: str | None = None, stage: str | None = None):
    p = require(principal(request))
    async with db(p) as conn:
        rows = await conn.fetch(f"SELECT {COLS} FROM deploys WHERE ($1::text IS NULL OR tenant_id=$1) AND ($2::text IS NULL OR card_id=$2) "
                                "AND ($3::text IS NULL OR stage=$3) ORDER BY year NULLS LAST, id", tenant_id, card_id, stage)
        items = [await deploy_dict(conn, r) for r in rows]
    return {"items": items, "total": len(items), "as_of": now_iso()}


@router.get("/deploys/{did}")
async def get_deploy(did: str, request: Request):
    p = require(principal(request))
    async with db(p) as conn:
        return await deploy_dict(conn, await _get(conn, did))


def _new_id(tenant: str, card_id: str, year: int) -> str:
    return f"dp-{tenant}-{card_id.removeprefix('card-')}-{year % 100:02d}"


@router.post("/deploys", status_code=201)
async def port(body: dict, request: Request):
    """이식 = 같은 card_version_id 로 배포본 하나 더(draft · 스냅샷 없음 · 결과 0)."""
    p = require(principal(request), admin=True)
    src_id = body.get("from_deploy_id")
    tenant = body.get("tenant_id")
    aoi = body.get("aoi")
    if not aoi:
        raise ApiError("bad_request", "aoi 필수(이식 대상 지역)")
    prof = (config.load_yaml("region_profiles")["profiles"]).get(body.get("region_profile") or "")
    if not prof:
        raise ApiError("bad_request", f"region_profile {body.get('region_profile')} 없음")
    async with db(realm="lx") as conn:
        if src_id:
            src = await _get(conn, src_id)
            card_id, cv = src["card_id"], src["card_version_id"]
        else:
            cv = body.get("card_version_id")
            card_id = await conn.fetchval("SELECT card_id FROM card_versions WHERE id=$1", cv)
            if not card_id:
                raise ApiError("bad_request", "from_deploy_id 또는 card_version_id 필요")
            src = None
        if not await conn.fetchval("SELECT 1 FROM tenants WHERE id=$1", tenant):
            raise ApiError("bad_request", f"tenant {tenant} 없음")
        year = int(body.get("year") or dt.datetime.now(KST).year)
        did = body.get("id") or _new_id(tenant, card_id, year)
        n = 1
        base = did
        while await conn.fetchval("SELECT 1 FROM deploys WHERE id=$1", did):
            n += 1
            did = f"{base}-{n}"
        modules = (src["modules"] if src else None) or {"core": CORE, "ext": {}}
        await conn.execute(
            "INSERT INTO deploys(id, name, tenant_id, card_id, card_version_id, prev_card_version_id, region_profile, region_name, aoi, stage, "
            "pinned, gpu_pool, from_deploy_id, modules, year, status_history, scale, basis) VALUES ($1,$2,$3,$4,$5,NULL,$6,$7,"
            "ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($8),4326)),'draft',false,$9,$10,$11,$12,NULL,NULL,'measured')",
            did, body.get("name") or f"{prof['name']['ko']} · 이식", tenant, card_id, cv, body.get("region_profile"), prof["name"],
            json.dumps(aoi), body.get("gpu_pool") or (src["gpu_pool"] if src else "a6000"), src_id, modules, year)
        row = await _get(conn, did)
        await audit(conn, p, "deploy.port", did, {"from": src_id}, {"tenant_id": tenant, "card_version_id": cv, "stage": "draft"})
        out = await deploy_dict(conn, row)
    out["results"] = {"value": 0, "unit": "count", "basis": "measured", "as_of": now_iso(), "source": "detections(deploy)",
                      "note": "결과 0 · 첫 분석 대기"}
    await _changed(p, did, "port", row)
    return out


async def _approvals_since_reset(conn, did: str) -> int:
    reset = await conn.fetchval("SELECT max(at) FROM audit_log WHERE subject=$1 AND action IN ('deploy.rollback','deploy.port')", did)
    return await conn.fetchval("SELECT count(*) FROM approvals WHERE subject_type='deploy' AND subject_id=$1 AND decision='approve' "
                               "AND ($2::timestamptz IS NULL OR at > $2)", did, reset)


@router.post("/deploys/{did}/rollout")
async def rollout(did: str, body: dict, request: Request):
    p = require(principal(request), admin=True)
    to = body.get("stage")
    async with db(realm="lx") as conn:
        r = await _get(conn, did)
        if to not in FORWARD.get(r["stage"], []):
            raise ApiError("invalid_stage_transition", f"{r['stage']} → {to} 불가(순방향 한 칸씩)", {"from": r["stage"], "to": to,
                                                                                                 "allowed": FORWARD.get(r["stage"], [])})
        if to == "ga":
            n = await _approvals_since_reset(conn, did)
            if n < config.APPROVALS_REQUIRED:
                raise ApiError("approval_required", f"ga 전 승인 {config.APPROVALS_REQUIRED}건 필요(현재 {n})", {"have": n, "need": config.APPROVALS_REQUIRED})
        await conn.execute("UPDATE deploys SET stage=$2, updated_at=now() WHERE id=$1", did, to)
        row = await _get(conn, did)
        await audit(conn, p, "deploy.rollout", did, {"stage": r["stage"]}, {"stage": to})
        out = await deploy_dict(conn, row)
    await _changed(p, did, "rollout", row)
    return out


@router.post("/deploys/{did}/rollback")
async def rollback(did: str, request: Request, body: dict | None = None):
    p = require(principal(request), admin=True)
    async with db(realm="lx") as conn:
        r = await _get(conn, did)
        if r["stage"] not in ("canary", "ga"):
            raise ApiError("invalid_stage_transition", f"{r['stage']} 에서는 롤백 불가(canary|ga 만)", {"from": r["stage"], "to": "rolled_back"})
        if not r["prev_card_version_id"]:
            raise ApiError("invalid_stage_transition", "직전 버전 없음", {"from": r["stage"]})
        await conn.execute("UPDATE deploys SET stage='rolled_back', card_version_id=prev_card_version_id, prev_card_version_id=card_version_id, "
                           "snapshot_current=snapshot_prev, snapshot_prev=snapshot_current, updated_at=now() WHERE id=$1", did)
        row = await _get(conn, did)
        await audit(conn, p, "deploy.rollback", did,
                    {"stage": r["stage"], "card_version_id": r["card_version_id"], "snapshot_current": r["snapshot_current"]},
                    {"stage": "rolled_back", "card_version_id": row["card_version_id"], "snapshot_current": row["snapshot_current"]})
        out = await deploy_dict(conn, row)
    await _changed(p, did, "rollback", row)
    return out


@router.post("/deploys/{did}/approve")
async def approve(did: str, body: dict, request: Request):
    p = require(principal(request), admin=True)
    dec = body.get("decision")
    if dec not in ("approve", "reject"):
        raise ApiError("bad_request", "decision approve|reject")
    aid = "ap_" + secrets.token_hex(6)
    async with db(realm="lx") as conn:
        await _get(conn, did)
        await conn.execute("INSERT INTO approvals(id, subject_type, subject_id, requested_by, decided_by, decision, reason) VALUES ($1,'deploy',$2,$3,$3,$4,$5)",
                           aid, did, p.user_id, dec, body.get("reason"))
        a = await conn.fetchrow("SELECT id, decision, decided_by, reason, at FROM approvals WHERE id=$1", aid)
        row = await _get(conn, did)
        await audit(conn, p, "deploy.approve", did, None, {"decision": dec, "reason": body.get("reason")})
        out = {"approval": {"id": a["id"], "decision": a["decision"], "by": a["decided_by"], "at": _iso(a["at"]), "reason": a["reason"]},
               "deploy": await deploy_dict(conn, row)}
    await _changed(p, did, "approve", row)
    return out


@router.post("/deploys/{did}/pin")
async def pin(did: str, body: dict, request: Request):
    p = require(principal(request), admin=True)
    cv = body.get("card_version_id")
    async with db(realm="lx") as conn:
        r = await _get(conn, did)
        if cv:
            card = await conn.fetchval("SELECT card_id FROM card_versions WHERE id=$1", cv)
            if card != r["card_id"]:
                raise ApiError("bad_request", f"{cv} 는 {r['card_id']} 의 버전이 아님")
            await conn.execute("UPDATE deploys SET pinned=true, prev_card_version_id=CASE WHEN card_version_id<>$2 THEN card_version_id ELSE prev_card_version_id END, "
                               "card_version_id=$2, updated_at=now() WHERE id=$1", did, cv)
        else:
            await conn.execute("UPDATE deploys SET pinned=false, updated_at=now() WHERE id=$1", did)
        row = await _get(conn, did)
        await audit(conn, p, "deploy.pin", did, {"pinned": r["pinned"], "card_version_id": r["card_version_id"]},
                    {"pinned": row["pinned"], "card_version_id": row["card_version_id"]})
        out = await deploy_dict(conn, row)
    await _changed(p, did, "pin", row)
    return out


@router.post("/deploys/{did}/modules")
async def modules(did: str, body: dict, request: Request):
    p = require(principal(request), admin=True)
    if "core" in body:
        raise ApiError("module_locked", "공통 모듈 7개는 잠금", {"core": CORE})
    ext = body.get("ext") or {}
    locked = [k for k in ext if k in CORE]
    if locked:
        raise ApiError("module_locked", f"공통 모듈은 끌 수 없음: {', '.join(locked)}", {"locked": locked})
    async with db(realm="lx") as conn:
        r = await _get(conn, did)
        mods = r["modules"] or {"core": CORE, "ext": {}}
        unknown = [k for k in ext if k not in (mods.get("ext") or {})]
        if unknown:
            raise ApiError("bad_request", f"이 카드에 없는 전용 모듈: {', '.join(unknown)}")
        new = {"core": CORE, "ext": {**mods.get("ext", {}), **{k: bool(v) for k, v in ext.items()}}}
        await conn.execute("UPDATE deploys SET modules=$2, updated_at=now() WHERE id=$1", did, new)
        row = await _get(conn, did)
        await audit(conn, p, "deploy.modules", did, mods, new)
        out = await deploy_dict(conn, row)
    await _changed(p, did, "modules", row)
    return out


@router.post("/deploys/{did}/model")
async def model(did: str, body: dict, request: Request):
    p = require(principal(request), admin=True)
    mid = body.get("model_id")
    async with db(realm="lx") as conn:
        r = await _get(conn, did)
        if mid and not await conn.fetchval("SELECT 1 FROM models WHERE id=$1", mid):
            raise ApiError("not_found", f"model {mid} 없음")
        await conn.execute("UPDATE deploys SET model_override=$2, updated_at=now() WHERE id=$1", did, mid)
        row = await _get(conn, did)
        await audit(conn, p, "deploy.model", did, {"model_override": r["model_override"]}, {"model_override": mid})
        out = await deploy_dict(conn, row)
    await _changed(p, did, "model", row)
    return out


@router.post("/deploys/{did}/gpu")
async def gpu(did: str, body: dict, request: Request):
    p = require(principal(request), admin=True)
    pool = body.get("pool")
    pools = config.load_yaml("pools")["pools"]
    if pool not in pools or pools[pool].get("state") == "pending":
        raise ApiError("bad_request", f"풀 {pool} 없음 또는 등록 대기")
    async with db(realm="lx") as conn:
        r = await _get(conn, did)
        await conn.execute("UPDATE deploys SET gpu_pool=$2, updated_at=now() WHERE id=$1", did, pool)
        row = await _get(conn, did)
        await audit(conn, p, "deploy.gpu", did, {"gpu_pool": r["gpu_pool"]}, {"gpu_pool": pool})
        out = await deploy_dict(conn, row)
    await _changed(p, did, "gpu", row)
    return out
