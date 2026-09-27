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
from .envelope import KST, env, now_iso
from .jobs import ops_event

router = APIRouter()
CORE = ["mod-auth", "mod-map", "mod-result", "mod-stats", "mod-report", "mod-feedback", "mod-usage"]
FORWARD = {"draft": ["shadow"], "shadow": ["canary"], "canary": ["ga"], "ga": [], "rolled_back": ["shadow", "canary", "ga"]}
COLS = ("id, name, tenant_id, card_id, card_version_id, prev_card_version_id, region_profile, region_name, "
        "ST_AsGeoJSON(aoi, 6)::json AS aoi, stage, pinned, gpu_pool, from_deploy_id, modules, model_override, snapshot_current, "
        "snapshot_prev, year, status_history, scale, basis, created_at, updated_at, sgg_cd, ci, coalesce(test, false) AS test")
CI_KEYS = ["name", "short", "mark", "color", "tint", "unit_word", "crs", "contact", "seal"]     # 기관 명칭 · 약칭 · 마크 · 상징색 · 연한 바탕 · 행정단위 말 · 좌표계 · 문의처 · 직인
# 운영 건강(F3 §3 S-7) — 넘으면 next_action. 값은 [추정 초기값](운영하며 보정 · 사용자 결정 전)
THRESHOLDS = {"precision_min_pct": 70.0, "fp_reports_max": 10, "judged_min": 20, "train_max_days": 180}


def _iso(v):
    return v.astimezone(KST).isoformat(timespec="seconds") if v else None


async def deploy_dict(conn, r) -> dict:
    aps = await conn.fetch("SELECT id, decision, decided_by, reason, at, state, payload FROM approvals WHERE subject_type='deploy' AND subject_id=$1 "
                           "ORDER BY at", r["id"])
    ver = await conn.fetchval("SELECT version FROM card_versions WHERE id=$1", r["card_version_id"]) if r["card_version_id"] else None
    return {"id": r["id"], "name": r["name"], "tenant_id": r["tenant_id"], "card_id": r["card_id"], "card_version_id": r["card_version_id"],
            "version": ("v" + ver) if ver and not str(ver).startswith("v") else ver, "prev_card_version_id": r["prev_card_version_id"],
            "region_profile": r["region_profile"], "region_name": r["region_name"], "aoi": r["aoi"], "stage": r["stage"],
            "pinned": r["pinned"], "gpu_pool": r["gpu_pool"], "from_deploy_id": r["from_deploy_id"], "modules": r["modules"] or {"core": CORE, "ext": {}},
            "model_override": r["model_override"], "snapshot_current": r["snapshot_current"], "snapshot_prev": r["snapshot_prev"],
            "year": r["year"], "status_history": r["status_history"], "scale": r["scale"], "basis": r["basis"],
            "approvals": [{"id": a["id"], "decision": a["decision"], "by": a["decided_by"], "at": _iso(a["at"]), "reason": a["reason"],
                           "state": a["state"], "action": (a["payload"] or {}).get("action")} for a in aps],
            "sgg_cd": r["sgg_cd"], "ci": r["ci"], "test": r["test"],
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


def public_deploy(r) -> bool:
    """공개(게스트 · 영업 진열) = 시험 아님 · 운영/시범 · 실결과(스냅샷 또는 출처 있는 규모)가 있는 배포본만."""
    return not r["test"] and r["stage"] in ("ga", "canary") and bool(r["snapshot_current"] or r["scale"])


def _public_view(r) -> dict:
    c = bb = None
    try:
        from shapely.geometry import shape
        if r["aoi"]:
            g = shape(r["aoi"])
            c = [round(g.centroid.x, 4), round(g.centroid.y, 4)]
            bb = [round(v, 4) for v in g.bounds]
    except Exception:
        pass
    return {"id": r["id"], "card_id": r["card_id"], "stage": r["stage"], "tenant_id": r["tenant_id"], "region_name": r["region_name"],
            "sgg_cd": r["sgg_cd"], "scale": r["scale"], "updated_at": _iso(r["updated_at"]), "center": c, "bbox": bb}


async def health_of(conn, r, feedback_by_tenant: dict, verdicts_by_tenant: dict, last_train: dict) -> dict:
    """정밀도(현장 판정) · 오탐 신고(feedback fp) · 마지막 학습(모델 지표 기준월) → next_action(재학습 · 표본 검수 · 갱신 배포 · 없음)."""
    t = r["tenant_id"]
    v = verdicts_by_tenant.get(t, {"tp": 0, "fp": 0})
    judged = v["tp"] + v["fp"]
    prec = round(100 * v["tp"] / judged, 1) if judged else None
    fpn = feedback_by_tenant.get(t, 0)
    lt = last_train.get(r["card_version_id"])
    days = None
    if lt:
        try:
            d0 = dt.date.fromisoformat(lt if len(lt) > 7 else lt + "-01")
            days = (dt.datetime.now(KST).date() - d0).days
        except ValueError:
            days = None
    th = THRESHOLDS
    if (prec is not None and prec < th["precision_min_pct"]) or fpn > th["fp_reports_max"]:
        nxt = "retrain"
    elif judged < th["judged_min"] and r["stage"] in ("ga", "canary"):
        nxt = "sample_review"
    elif days is not None and days > th["train_max_days"]:
        nxt = "update_deploy"
    else:
        nxt = "none"
    src_v = "현장 판정(기관 단위)"
    return {"precision": env(prec, "%", "measured", src_v, None if judged else "현장 판정 표본 없음"),
            "judged": env(judged, "count", "recorded", src_v),
            "fp_reports": env(fpn, "count", "recorded", "오탐 신고"),
            "last_train": lt, "last_train_days": env(days, "count", "recorded", "모델 지표 기준월", None if days is not None else "학습 기록 없음"),
            "next_action": nxt, "next_action_label": {"retrain": "재학습", "sample_review": "표본 검수", "update_deploy": "갱신 배포", "none": "없음"}[nxt],
            "thresholds": {k: env(v, "%" if k.endswith("pct") else "count", "estimate", "deploys.THRESHOLDS", "[추정 초기값]") for k, v in th.items()}}


async def _health_inputs(conn):
    fb = {x["tenant_id"]: int(x["n"]) for x in await conn.fetch("SELECT tenant_id, count(*) n FROM feedback WHERE kind='fp' GROUP BY 1")}
    vv: dict = {}
    for x in await conn.fetch("SELECT tenant_id, verdict, state, count(*) n FROM survey_findings WHERE verdict IS NOT NULL OR state='dismissed' GROUP BY 1,2,3"):
        d = vv.setdefault(x["tenant_id"], {"tp": 0, "fp": 0})
        if x["verdict"] in ("match", "violation"):
            d["tp"] += x["n"]
        elif x["verdict"] == "match_fp" or x["state"] == "dismissed":
            d["fp"] += x["n"]
    lt = {}
    for x in await conn.fetch("SELECT cv.id, max(m.metrics->'box_mAP50'->>'as_of') a FROM card_versions cv LEFT JOIN models m ON m.id = ANY(cv.model_ids) GROUP BY 1"):
        lt[x["id"]] = x["a"]
    return fb, vv, lt


@router.get("/deploys")
async def list_deploys(request: Request, tenant_id: str | None = None, card_id: str | None = None, stage: str | None = None,
                       public: int | None = None, include_test: int | None = None):
    """?with=health → 운영 건강 · ?public=1(또는 게스트) → 실결과 있는 운영·시범 배포본만(요약 필드). 시험 배포본은 기본 제외."""
    p = principal(request)
    want = set((request.query_params.get("with") or "").split(",")) - {""}
    if public or p.guest:
        async with db(realm="lx") as conn:
            rows = await conn.fetch(f"SELECT {COLS} FROM deploys WHERE ($1::text IS NULL OR card_id=$1) ORDER BY year NULLS LAST, id", card_id)
        items = [_public_view(r) for r in rows if public_deploy(r)]
        return {"items": items, "total": env(len(items), "count", "recorded", "운영·시범 배포본(실결과)"), "public": True, "as_of": now_iso()}
    require(p)
    async with db(p) as conn:
        rows = await conn.fetch(f"SELECT {COLS} FROM deploys WHERE ($1::text IS NULL OR tenant_id=$1) AND ($2::text IS NULL OR card_id=$2) "
                                "AND ($3::text IS NULL OR stage=$3) AND ($4 OR NOT coalesce(test,false)) ORDER BY year NULLS LAST, id",
                                tenant_id, card_id, stage, bool(include_test))
        items = [await deploy_dict(conn, r) for r in rows]
        if "health" in want:
            fb, vv, lt = await _health_inputs(conn)
            for it, r in zip(items, rows):
                it["health"] = await health_of(conn, r, fb, vv, lt)
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
    """이식 = 카드(또는 기존 배포본)를 새 지역(sgg_cd)에 심는다 → 배포본 draft + 결재 요청(approvals pending · action port).
    본문: {from_deploy_id | card_id | card_version_id, region: sgg_cd, tenant_id?, ci{9키}?, aoi?, region_profile?(구형), name?, year?}.
    LX 직원(staff)이 요청하고 관리자가 결재한다. 결과 0 · 스냅샷 없음(첫 분석 대기)."""
    p = require(principal(request), lx=True)
    if p.role not in ("admin", "staff"):
        raise ApiError("forbidden", "LX 직원·관리자만 심을 수 있습니다")
    src_id = body.get("from_deploy_id")
    sgg = str(body.get("region") or body.get("sgg_cd") or "").strip() or None
    aoi = body.get("aoi")
    region_name = None
    from .regions import regions_base, tenant_scope
    if sgg:
        regs, geoms, _ = regions_base()
        rg = next((x for x in regs if x["sgg_cd"] == sgg), None)
        if not rg:
            raise ApiError("bad_request", "해당 지역이 없습니다", {"region": sgg})
        region_name = {"ko": rg["full"], "en": rg.get("name_en") or rg["full"]}
        if not aoi and sgg in geoms:
            from shapely.geometry import mapping
            aoi = mapping(geoms[sgg])
    elif body.get("region_profile"):
        prof = (config.load_yaml("region_profiles")["profiles"]).get(body.get("region_profile") or "")
        if not prof:
            raise ApiError("bad_request", f"region_profile {body.get('region_profile')} 없음")
        region_name = prof["name"]
    if not aoi:
        raise ApiError("bad_request", "지역(region = 시군구 코드)이 필요합니다")
    ci = body.get("ci") or None
    if ci is not None:
        if not isinstance(ci, dict):
            raise ApiError("bad_request", "ci 는 9키 객체", {"keys": CI_KEYS})
        extra = [k for k in ci if k not in CI_KEYS]
        if extra:
            raise ApiError("bad_request", "ci 에 없는 키", {"keys": extra, "allowed": CI_KEYS})
        ci = {k: str(v)[:200] for k, v in ci.items() if v is not None}
    async with db(realm="lx") as conn:
        if src_id:
            src = await _get(conn, src_id)
            card_id, cv = src["card_id"], src["card_version_id"]
        else:
            cv = body.get("card_version_id")
            card_id = body.get("card_id")
            if not cv and card_id:
                cv = await conn.fetchval("SELECT id FROM card_versions WHERE card_id=$1 ORDER BY approved_at DESC NULLS LAST, id DESC LIMIT 1", card_id)
            if cv and not card_id:
                card_id = await conn.fetchval("SELECT card_id FROM card_versions WHERE id=$1", cv)
            if not card_id or not await conn.fetchval("SELECT 1 FROM cards WHERE id=$1", card_id):
                raise ApiError("bad_request", "from_deploy_id 또는 card_id 필요")
            src = None
        tenant = body.get("tenant_id")
        if not tenant and sgg:
            for t in [x["id"] for x in await conn.fetch("SELECT id FROM tenants WHERE status='active' AND kind='user' ORDER BY id")]:
                sc = tenant_scope(t)
                if sc and any(sgg.startswith(px) for px in sc):
                    tenant = t
                    break
        tenant = tenant or "lx"                  # 계약 기관이 없으면 LX 보관(기관 연결 전 draft)
        if not await conn.fetchval("SELECT 1 FROM tenants WHERE id=$1", tenant):
            raise ApiError("bad_request", f"tenant {tenant} 없음")
        year = int(body.get("year") or dt.datetime.now(KST).year)
        did = body.get("id") or _new_id(sgg or tenant, card_id, year)
        n = 1
        base = did
        while await conn.fetchval("SELECT 1 FROM deploys WHERE id=$1", did):
            n += 1
            did = f"{base}-{n}"
        modules = (src["modules"] if src else None) or {"core": CORE, "ext": {}}
        test = bool(body.get("test")) and config.DEV
        await conn.execute(
            "INSERT INTO deploys(id, name, tenant_id, card_id, card_version_id, prev_card_version_id, region_profile, region_name, aoi, stage, "
            "pinned, gpu_pool, from_deploy_id, modules, year, status_history, scale, basis, sgg_cd, ci, test) VALUES ($1,$2,$3,$4,$5,NULL,$6,$7,"
            "ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($8),4326)),'draft',false,$9,$10,$11,$12,NULL,NULL,'measured',$13,$14,$15)",
            did, body.get("name") or ((region_name or {}).get("ko", "") + " · 이식").strip(" ·"), tenant, card_id, cv,
            body.get("region_profile"), region_name, json.dumps(aoi), body.get("gpu_pool") or (src["gpu_pool"] if src else "a6000"), src_id,
            modules, year, sgg, ci, test)
        aid = "ap_" + secrets.token_hex(6)
        await conn.execute("INSERT INTO approvals(id, subject_type, subject_id, requested_by, state, payload, reason, tenant_id, at) "
                           "VALUES ($1,'deploy',$2,$3,'pending',$4,$5,$6,now())", aid, did, p.user_id,
                           {"action": "port", "card_id": card_id, "card_version_id": cv, "sgg_cd": sgg, "from_deploy_id": src_id},
                           body.get("reason") or "새 지역에 심기", tenant)
        row = await _get(conn, did)
        await audit(conn, p, "deploy.port", did, {"from": src_id}, {"tenant_id": tenant, "card_version_id": cv, "stage": "draft", "sgg_cd": sgg,
                                                                   "approval_id": aid})
        out = await deploy_dict(conn, row)
    out["approval_id"] = aid
    out["results"] = env(0, "count", "measured", "detections(deploy)", "결과 0 · 첫 분석 대기")
    await _changed(p, did, "port", row)
    await ops_event("approval.requested", {"approval_id": aid, "subject_type": "deploy", "subject_id": did, "by": p.user_id, "at": now_iso()})
    return out


@router.delete("/deploys/{did}")
async def delete_deploy(did: str, request: Request):
    """시험 배포본 정리(pytest · test=true) 또는 결과 0 인 draft — 관리자만. 운영 배포본은 지울 수 없다."""
    p = require(principal(request), admin=True)
    async with db(realm="lx") as conn:
        r = await _get(conn, did)
        if not (r["test"] or (r["stage"] == "draft" and not r["snapshot_current"])):
            raise ApiError("conflict", "운영 중이거나 결과가 있는 배포본은 지울 수 없습니다", status=409)
        await conn.execute("DELETE FROM approvals WHERE subject_type='deploy' AND subject_id=$1", did)
        await conn.execute("DELETE FROM deploys WHERE id=$1", did)
        await audit(conn, p, "deploy.delete", did, {"stage": r["stage"], "test": r["test"]}, None)
    return {"deleted": did, "as_of": now_iso()}


async def _approvals_since_reset(conn, did: str) -> int:
    reset = await conn.fetchval("SELECT max(at) FROM audit_log WHERE subject=$1 AND action IN ('deploy.rollback','deploy.port')", did)
    return await conn.fetchval("SELECT count(*) FROM approvals WHERE subject_type='deploy' AND subject_id=$1 AND decision='approve' "
                               "AND coalesce(payload->>'action','') <> 'port' "
                               "AND ($2::timestamptz IS NULL OR coalesce(decided_at, at) > $2)", did, reset)


@router.post("/deploys/{did}/rollout")
async def rollout(did: str, body: dict, request: Request):
    p = require(principal(request), admin=True)
    to = body.get("stage")
    async with db(realm="lx") as conn:
        r = await _get(conn, did)
        if to not in FORWARD.get(r["stage"], []):
            raise ApiError("invalid_stage_transition", f"{r['stage']} → {to} 불가(순방향 한 칸씩)", {"from": r["stage"], "to": to,
                                                                                                 "allowed": FORWARD.get(r["stage"], [])})
        if r["stage"] == "draft":
            pend = await conn.fetchval("SELECT id FROM approvals WHERE subject_type='deploy' AND subject_id=$1 AND state='pending' "
                                       "AND payload->>'action'='port'", did)
            if pend:
                raise ApiError("approval_required", "심기 결재가 끝나야 시범을 시작할 수 있습니다", {"approval_id": pend})
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
        await conn.execute("INSERT INTO approvals(id, subject_type, subject_id, requested_by, decided_by, decision, reason, state, decided_at) "
                           "VALUES ($1,'deploy',$2,$3,$3,$4,$5,'decided',now())", aid, did, p.user_id, dec, body.get("reason"))
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
