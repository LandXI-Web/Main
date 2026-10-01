"""배포(F1-CONTRACT §4.7 · §9) — 단계 배포 · 롤백 · 승인 · 고정 · 모듈 · 모델 · GPU 풀 · 다른 지역에 적용(POST /deploys).

상태기계: draft → shadow → canary → ga(순방향 한 칸씩 · 건너뛰기 없음) · canary|ga → rolled_back · rolled_back → shadow|canary|ga.
ga 는 approve ≥ APPROVALS_REQUIRED(기본 1) — 마지막 롤백·적용 이후의 승인만 센다. 모든 쓰기 = audit_log + deploy.changed.

한 흐름(core-flow · 코어 ④ · 2026-09-29) — '적용 = 실행':
  POST /deploys {card_id, region: sgg_cd, tenant_id?} → draft + 결재 요청(flow.state approval)
  → 결재 승인(approvals.decide) → flow_start: 영상(catalog.best_imagery) 없으면 need_imagery(영상 등록 필요 · LX 직원 할 일 · draft 유지)
    있으면 draft → shadow(시범) + POST /jobs {kind:infer, options:{scope:"sgg", sgg_cd}, deploy_id}(analyzing)
  → 작업 끝(flow_loop 5 s) → snapshot_current = 그 결과 세트 → 카드에 필지 대조 모듈(*-parcel)이 켜져 있으면
    POST /survey/build {sgg_cd, job_id}(surveying) → 끝나면 done. 영상 등록 필요 상태는 60 s 마다 영상을 다시 찾아 이어 간다.
  모든 단계 = audit_log(action flow.*, subject = 배포본 id, after.job_id) — 같은 deploy_id · job_id 로 묶인다.
"""
from __future__ import annotations

import asyncio
import datetime as dt
import inspect
import json
import secrets
import time

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
        "snapshot_prev, year, status_history, scale, basis, created_at, updated_at, sgg_cd, ci, coalesce(test, false) AS test, flow")
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
            "sgg_cd": r["sgg_cd"], "ci": r["ci"], "test": r["test"], "flow": await _flow_view_parcel(conn, r),
            "created_at": _iso(r["created_at"]), "updated_at": _iso(r["updated_at"])}


async def _flow_view_parcel(conn, r) -> dict | None:
    """flow_view + survey_next — AI 분석은 끝났는데 실태조사를 아직 잇지 않은 필지 대조 서비스(화면 '실태조사 이어 하기' 버튼)."""
    fv = flow_view(r["flow"])
    if fv and fv.get("model") and fv["model"].get("id"):
        await _model_truth(conn, r, fv)
    if fv and fv["state"] == "done" and not fv.get("survey_job_id") and not (r["flow"] if isinstance(r["flow"], dict) else {}).get("survey"):
        m = await conn.fetchval("SELECT modules FROM card_versions WHERE id=$1", r["card_version_id"]) if r["card_version_id"] else None
        fv["survey_next"] = _has_parcel(r["modules"]) or (isinstance(m, dict) and (_has_parcel(m) or bool(m.get("rules"))))
    return fv


async def _model_truth(conn, r, fv: dict) -> None:
    """분석에 실제로 쓴 모델(흐름 기록 한 출처) — 이름·대상 · 서비스 모델과 다르면 substitute · 서비스 대상을 못 찾는 모델이었으면 model_ok False.
    (r3-train 3차: 같은 배포본을 직원 화면은 기본 모델로, 관리자 화면은 서비스 모델로 말했다)"""
    m = fv["model"]
    if not m.get("name") and not m.get("classes"):
        m.update(await model_block(conn, m["id"]) or {})
    own_ids = await _card_model_ids(conn, r["card_id"], r["card_version_id"])
    own = [x for x in await conn.fetch("SELECT id, task, classes, weights_uri, status FROM models WHERE id = ANY($1::text[])", own_ids) if _learned(x)]
    if own and m["id"] not in own_ids:
        m["substitute"] = True
        if not covers(m.get("classes"), [c for x in own for c in (x["classes"] or [])]):
            fv["model_ok"] = False
            fv["note"] = fv.get("note") or "서비스 모델로 분석하지 않았습니다 — 이 결과는 서비스 결과로 보지 않습니다"


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
    if (public and p.realm != "tenant") or p.guest:      # 기관 계정은 공개 목록(전국 배포본)으로 돌아가지 못한다(원칙 39) — 자기 기관 것만
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
    """다른 지역에 적용 = 카드(또는 기존 배포본)를 새 지역(sgg_cd)에 → 배포본 draft + 결재 요청(approvals pending · action port).
    본문: {from_deploy_id | card_id | card_version_id, region: sgg_cd, tenant_id?, ci{9키}?, aoi?, region_profile?(해외만), name?, year?}.
    LX 직원(staff)이 요청하고 관리자가 결재한다. 국내는 sgg_cd 필수(AOI = 시군구 경계). 결재가 통과하면 flow_start 가 AI 분석까지 잇는다."""
    p = require(principal(request), lx=True)
    if p.role not in ("admin", "staff"):
        raise ApiError("forbidden", "LX 직원·관리자만 다른 지역에 적용할 수 있습니다")
    src_id = body.get("from_deploy_id")
    sgg = str(body.get("region") or body.get("sgg_cd") or "").strip() or None
    aoi = body.get("aoi")
    region_name = None
    from .regions import regions_base, tenant_scope
    if sgg:
        regs, geoms, _ = regions_base()
        rg = next((x for x in regs if x["sgg_cd"] == sgg), None) or next((x for x in regs if x.get("prev_cd") == sgg), None)
        if not rg:
            raise ApiError("bad_request", "해당 지역이 없습니다", {"region": sgg})
        sgg = rg["sgg_cd"]                           # 옛 코드로 와도 지금 코드로 저장(한 시군구 = 한 코드)
        region_name = {"ko": rg["full"], "en": rg.get("name_en") or rg["full"]}
        if sgg in geoms:
            from shapely.geometry import mapping
            aoi = mapping(geoms[sgg])                # 배포본 AOI = 시군구 경계(본문 aoi 는 무시 — 지역 판정이 한 출처)
    elif body.get("region_profile"):
        prof = (config.load_yaml("region_profiles")["profiles"]).get(body.get("region_profile") or "")
        if not prof:
            raise ApiError("bad_request", f"region_profile {body.get('region_profile')} 없음")
        if _domestic_bbox(prof.get("bbox")):
            raise ApiError("bad_request", "국내 지역은 시군구 코드(region)로 적용합니다", {"region_profile": body.get("region_profile")})
        region_name = prof["name"]
        if not aoi and prof.get("bbox"):
            from shapely.geometry import box, mapping
            aoi = mapping(box(*prof["bbox"]))
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
        # 서비스 공개 = LX 관리자 승인 뒤(확인 D2-ⓐ · impl-1) — 공개 결재가 대기 · 반려인 서비스는 다른 지역에 적용하지 않는다(결재 행이 없는 옛 서비스는 그대로)
        pub = await conn.fetchrow("SELECT state, decision, reason FROM approvals WHERE subject_type='card' AND subject_id=$1 ORDER BY at DESC LIMIT 1",
                                  cv) if cv else None
        if pub and pub["state"] == "pending":
            raise ApiError("approval_required", "서비스 공개 결재가 끝나야 다른 지역에 적용할 수 있습니다", {"card_version_id": cv})
        if pub and pub["decision"] == "reject":
            raise ApiError("approval_required", "서비스 공개가 반려됐습니다" + (f" — 사유: {pub['reason']}" if pub["reason"] else ""), {"card_version_id": cv})
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
        modules = (src["modules"] if src else None) or await _card_modules(conn, card_id, cv)
        test = bool(body.get("test")) and config.DEV
        img = await best_imagery(sgg, aoi) if sgg else {"imagery_id": None, "reason": "no_region"}
        if sgg:
            # 적용 전 점검(적용 화면 GET /deploy-fit 과 같은 판정) — 서비스 모델과 영상 해상도가 맞지 않으면 결재 요청을 만들지 않는다
            pl = await plan_analysis(conn, src["model_override"] if src else None, card_id, cv, sgg, aoi, img)
            if pl["fits"] is False:
                raise ApiError("model_input_mismatch", pl["note"], {"region": sgg}, 409)
            img = pl["img"]
        flow = _flow_new("approval", imagery=img, todo=None if img.get("imagery_id") else "영상 등록")
        await conn.execute(
            "INSERT INTO deploys(id, name, tenant_id, card_id, card_version_id, prev_card_version_id, region_profile, region_name, aoi, stage, "
            "pinned, gpu_pool, from_deploy_id, modules, year, status_history, scale, basis, sgg_cd, ci, test, flow) VALUES ($1,$2,$3,$4,$5,NULL,$6,$7,"
            "ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($8),4326)),'draft',false,$9,$10,$11,$12,NULL,NULL,'measured',$13,$14,$15,$16)",
            did, body.get("name") or ((region_name or {}).get("ko", "") + " · 적용").strip(" ·"), tenant, card_id, cv,
            body.get("region_profile"), region_name, json.dumps(aoi), body.get("gpu_pool") or (src["gpu_pool"] if src else config.POOL), src_id,
            modules, year, sgg, ci, test, flow)
        aid = "ap_" + secrets.token_hex(6)
        await conn.execute("INSERT INTO approvals(id, subject_type, subject_id, requested_by, state, payload, reason, tenant_id, at) "
                           "VALUES ($1,'deploy',$2,$3,'pending',$4,$5,$6,now())", aid, did, p.user_id,
                           {"action": "port", "card_id": card_id, "card_version_id": cv, "sgg_cd": sgg, "from_deploy_id": src_id},
                           body.get("reason") or "다른 지역에 적용", tenant)
        row = await _get(conn, did)
        await audit(conn, p, "deploy.port", did, {"from": src_id}, {"tenant_id": tenant, "card_version_id": cv, "stage": "draft", "sgg_cd": sgg,
                                                                   "approval_id": aid, "deploy_id": did,
                                                                   "imagery_id": img.get("imagery_id"), "imagery_reason": img.get("reason")})
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
                raise ApiError("approval_required", "적용 결재가 끝나야 시범을 시작할 수 있습니다", {"approval_id": pend})
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
    from .approvals import check_decider
    check_decider(p, None, dec, body.get("reason"))          # 반려 = 사유 필수(결재함과 같은 규칙)
    aid = "ap_" + secrets.token_hex(6)
    async with db(realm="lx") as conn:
        await _get(conn, did)
        # 요청 없이 관리자가 바로 결정한 승인 — 요청자를 비워 둔다(스스로 요청 · 스스로 승인으로 적지 않는다 · impl-1 R&R)
        await conn.execute("INSERT INTO approvals(id, subject_type, subject_id, requested_by, decided_by, decision, reason, state, decided_at) "
                           "VALUES ($1,'deploy',$2,NULL,$3,$4,$5,'decided',now())", aid, did, p.user_id, dec, body.get("reason"))
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
        m = await conn.fetchrow("SELECT id, gsd_trained_m FROM models WHERE id=$1", mid) if mid else None
        if mid and not m:
            raise ApiError("not_found", f"model {mid} 없음")
        img_gsd = ((r["flow"] or {}).get("imagery") or {}).get("gsd_m") if isinstance(r["flow"], dict) else None
        if m and img_gsd and not gsd_fits(img_gsd, m["gsd_trained_m"]):
            # 교체한 모델이 이 지역 영상 해상도와 맞지 않으면 흐름이 그 모델을 쓰지 못한다 — 말없이 무시되지 않게 교체를 막는다
            raise ApiError("model_input_mismatch", f"이 모델({gsd_word(m['gsd_trained_m'])})은 이 지역 영상({gsd_word(img_gsd)})과 해상도가 맞지 않습니다",
                           {"deploy_id": did}, 409)
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


# ══ 한 흐름(core-flow · 코어 ④) ═══════════════════════════════════════════════════════════════════════
# 배포본 flow(jsonb) 한 곳이 상태다. 화면은 flow_view 로 읽고(작업 id·경로는 화면에 내지 않는다), LX 관리자 화면은 /ops/flows.
FLOW_LABEL = {"approval": "결재 대기", "need_imagery": "영상 등록 필요", "starting": "AI 분석 준비", "analyzing": "AI 분석 중",
              "surveying": "실태조사 중", "done": "결과 반영", "failed": "다시 실행 필요", "rejected": "반려"}
FLOW_TICK_S = 5
IMAGERY_RECHECK_S = 60
_flow_tasks: set = set()
_flow_last_img: dict[str, float] = {}


def _domestic_bbox(b) -> bool:
    return bool(b) and 124 <= b[0] and b[2] <= 132.5 and 32.5 <= b[1] and b[3] <= 39.5


async def _card_modules(conn, card_id: str, cv: str | None) -> dict:
    m = await conn.fetchval("SELECT modules FROM card_versions WHERE id=$1", cv) if cv else None
    ext = (m or {}).get("ext") if isinstance(m, dict) else None
    return {"core": CORE, "ext": dict(ext or {})}


def _has_parcel(mods) -> bool:
    ext = (mods or {}).get("ext") or {}
    return any(bool(v) and str(k).endswith("-parcel") for k, v in ext.items())


async def _parcel_on(d) -> bool:
    """필지 대조(실태조사)까지 잇는가 — 배포본 전용 모듈(-parcel) 또는 서비스 만들기로 만든 카드 버전(규칙·대장 형식을 고른 서비스 = 필지 대조).
    (r3-train 2차: 화면에서 만든 서비스는 전용 모듈 표가 비어 있어 AI 분석 뒤 실태조사로 이어지지 않던 것)"""
    if _has_parcel(d["modules"]):
        return True
    cv = d["card_version_id"] if "card_version_id" in d.keys() else None
    if not cv:
        return False
    async with db(realm="lx") as conn:
        m = await conn.fetchval("SELECT modules FROM card_versions WHERE id=$1", cv)
    return isinstance(m, dict) and (_has_parcel(m) or bool(m.get("rules")))


async def card_rules(d) -> list[str] | None:
    """서비스(카드 버전)에서 고른 규칙 — 실태조사는 이 규칙만 계산한다(r3-train 3차 must_fix 3). 규칙 칸이 없는 옛 카드 = None(전체 규칙)."""
    cv = d["card_version_id"] if "card_version_id" in d.keys() else None
    if not cv:
        return None
    async with db(realm="lx") as conn:
        m = await conn.fetchval("SELECT modules FROM card_versions WHERE id=$1", cv)
    rules = (m or {}).get("rules") if isinstance(m, dict) else None
    return [str(x) for x in rules] if isinstance(rules, list) and rules else None


def _flow_new(state: str, **kw) -> dict:
    f = {"state": state, "updated_at": now_iso(), "steps": [{"state": state, "at": now_iso()}]}
    f.update({k: v for k, v in kw.items() if v is not None})
    return f


def _flow_next(flow: dict | None, state: str, **kw) -> dict:
    f = dict(flow or {})
    f["state"] = state
    f["updated_at"] = now_iso()
    step = {"state": state, "at": now_iso()}
    if kw.get("reason"):
        step["reason"] = kw["reason"]
    f["steps"] = (list(f.get("steps") or []) + [step])[-40:]
    for k, v in kw.items():
        if v is None:
            f.pop(k, None)
        else:
            f[k] = v
    return f


def flow_view(flow) -> dict | None:
    """화면용 — 상태 · 사용자 말 · 할 일 · 단계 시각. job_id 는 서버·보고서·개발자 서랍용(화면 본문은 쓰지 않는다)."""
    if not flow:
        return None
    if isinstance(flow, str):
        flow = json.loads(flow)
    st = flow.get("state")
    img = flow.get("imagery") or {}
    mm = flow.get("reason") == "model_mismatch"
    return {"state": st, "label": "맞는 영상 등록 필요" if mm and st == "need_imagery" else FLOW_LABEL.get(st, st), "todo": flow.get("todo"),
            "reason": flow.get("reason"), "note": flow.get("note"),
            "model": flow.get("model") or ({"id": flow["model_id"]} if flow.get("model_id") else None),
            "has_imagery": bool(img.get("imagery_id")) and not mm,
            "imagery": {"year": img.get("year"), "gsd_m": img.get("gsd_m"), "partial": bool(img.get("partial")),
                        "coverage": env(img.get("coverage"), "ratio", "measured", "영상 범위 ∩ 시군구 면적",
                                        None if img.get("coverage") is not None else "영상 없음")},
            "job_id": flow.get("job_id"), "survey_job_id": flow.get("survey_job_id"),
            "steps": flow.get("steps") or [], "updated_at": flow.get("updated_at")}


# ── 영상: catalog.best_imagery(core-imagery 계약) · 아직 없으면 같은 계약 모양으로 imagery 표에서 고른다 ──
async def best_imagery(sgg: str | None, geom: dict | None = None) -> dict:
    try:
        from . import catalog
        fn = getattr(catalog, "best_imagery", None)
    except Exception:
        fn = None
    if fn is not None:
        try:
            if inspect.iscoroutinefunction(fn):
                r = await fn(sgg, geom)
            else:
                from starlette.concurrency import run_in_threadpool
                r = await run_in_threadpool(fn, sgg, geom)
                if inspect.isawaitable(r):
                    r = await r
            if isinstance(r, dict):
                r.setdefault("via", "catalog.best_imagery")
                return r
        except Exception as e:  # noqa: BLE001 — 영상 선택 실패는 흐름을 멈추지 않고 사유로 남긴다
            return {"imagery_id": None, "reason": f"catalog_error {type(e).__name__}", "via": "catalog.best_imagery"}
    return await _best_imagery_table(sgg, geom)


async def _best_imagery_table(sgg: str | None, geom: dict | None) -> dict:
    """계약과 같은 모양 — 추론 입력이 되는 자체 영상(원본 경로 있음 · 정사) ∩ 시군구. 0.5 m 이하 → 덮는 비율 → 연도 순."""
    from .regions import regions_base
    from shapely.geometry import mapping, shape
    regs, geoms, _ = regions_base()
    g = shape(geom) if geom else (geoms.get(sgg) if sgg else None)
    if g is None:
        return {"imagery_id": None, "reason": "no_region", "via": "imagery 표"}
    rg = next((x for x in regs if x["sgg_cd"] == sgg), None) or {}
    codes = [c for c in (sgg, rg.get("prev_cd")) if c]
    async with db(realm="lx") as conn:
        rows = await conn.fetch(
            "WITH a AS (SELECT ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($1),4326)) g) "
            "SELECT i.id, i.gsd_m, coalesce(i.year::text, i.epoch) AS yr, "
            "ST_Area(ST_Intersection(ST_MakeValid(i.footprint), a.g)::geography) / nullif(ST_Area(a.g::geography), 0) AS cov "
            "FROM imagery i, a WHERE i.path_internal IS NOT NULL AND coalesce(i.kind,'ortho')='ortho' AND i.footprint IS NOT NULL "
            "AND (i.sgg_cd = ANY($2::text[]) OR ST_Intersects(i.footprint, a.g))",
            json.dumps(mapping(g)), codes)
    rows = [r for r in rows if (r["cov"] or 0) >= 0.02]
    if not rows:
        return {"imagery_id": None, "reason": "no_imagery", "via": "imagery 표"}

    def yr(r):
        s = str(r["yr"] or "")
        return int(s[:4]) if s[:4].isdigit() else 0
    best = max(rows, key=lambda r: (float(r["gsd_m"] or 99) <= 0.5, round(float(r["cov"] or 0), 1), yr(r), -float(r["gsd_m"] or 99)))
    return {"imagery_id": best["id"], "gsd_m": float(best["gsd_m"]) if best["gsd_m"] is not None else None, "year": yr(best) or None,
            "coverage": round(float(best["cov"] or 0), 3), "source": "local", "via": "imagery 표"}


# ── 모델: 배포본 교체 모델 → 카드 버전 모델 → 카드의 다른 버전 모델 → (카드에 제 모델이 없거나, 대신할 모델이 서비스 대상을 모두 찾을 때만)
#    영상 해상도에 맞는 기본 분할 모델. 서비스 모델이 맞지 않는데 대상을 못 찾는 모델로 말없이 바꾸지 않는다(r3-train 3차 must_fix 2:
#    2 cm 드론 곤포사일리지 서비스가 25 cm 항공 영상에서 기본 모델(건물·주차장·경작지·비닐하우스)로 돌아 곤포사일리지 0건이 실렸다).
GSD_GAP = 2.5          # 학습 해상도와 영상 해상도가 이 배수 안이면 맞는다


def gsd_fits(img_gsd, model_gsd) -> bool:
    import math
    if not img_gsd or not model_gsd:
        return True
    return abs(math.log(float(img_gsd) / float(model_gsd))) <= math.log(GSD_GAP)


def gsd_word(g) -> str:
    """해상도 → 사용자 말('2cm 드론' · '25cm 항공' · '10m 위성')."""
    if g is None:
        return ""
    g = float(g)
    if g >= 1:
        return f"{g:g}m 위성"
    cm = f"{g * 100:.1f}".rstrip("0").rstrip(".")
    return f"{cm}cm {'드론' if g < 0.1 else '항공'}"


def _norm_cls(c) -> str:
    return str(c or "").strip().split("_")[0].lower()


def covers(sub_classes, own_classes) -> bool:
    """대신할 모델이 서비스 모델의 탐지 대상을 모두 찾는가('비닐하우스_단동' = '비닐하우스')."""
    own = {_norm_cls(c) for c in (own_classes or []) if c}
    sub = {_norm_cls(c) for c in (sub_classes or []) if c}
    return bool(own) and own <= sub


def _learned(m) -> bool:
    return bool(m) and bool(m["weights_uri"]) and m["task"] in ("seg", "det", "obb") and (m["status"] or "") != "retired"


async def _card_model_ids(conn, card_id: str, cv: str | None) -> list[str]:
    ids: list[str] = []
    for r in await conn.fetch("SELECT model_ids FROM card_versions WHERE card_id=$1 ORDER BY (id=$2) DESC, approved_at DESC NULLS LAST, id DESC",
                              card_id, cv):
        ids += [m for m in (r["model_ids"] or []) if m not in ids]
    return ids


async def choose_model(conn, override: str | None, card_id: str, cv: str | None, gsd) -> dict:
    """{model_id, substitute, reason, own:{id, gsd, classes, name}} — reason 'model_mismatch' 이면 model_id 없음(분석하지 않는다)."""
    rows = {r["id"]: r for r in await conn.fetch("SELECT id, task, gsd_trained_m, classes, weights_uri, status, name, train_job FROM models")}
    own_ids = await _card_model_ids(conn, card_id, cv)
    cands = ([override] if override else []) + [m for m in own_ids if m != override]
    own = [rows[m] for m in own_ids if _learned(rows.get(m))]

    def info(m):
        return {"id": m["id"], "gsd_m": float(m["gsd_trained_m"]) if m["gsd_trained_m"] is not None else None, "classes": list(m["classes"] or []),
                "name": (m["name"] or {}).get("ko") if isinstance(m["name"], dict) else m["name"]}
    for mid in cands:
        m = rows.get(mid)
        if _learned(m) and gsd_fits(gsd, m["gsd_trained_m"]):
            return {"model_id": mid, "substitute": False, "reason": None, "own": info(m)}
    base = [m for m in rows.values() if _learned(m) and m["task"] == "seg" and gsd_fits(gsd, m["gsd_trained_m"])]
    base.sort(key=lambda m: (abs(float(m["gsd_trained_m"] or 0) - float(gsd or 0)), m["train_job"] is not None, m["id"]))   # 원 모델 먼저(재학습본 뒤)
    if own:
        want = [c for m in own for c in (m["classes"] or [])]
        ok = [m for m in base if covers(m["classes"], want)]
        if ok:            # 같은 대상을 찾는 다른 해상도 모델(예: 비닐하우스 2 cm → 25 cm 항공 모델) — 대신 쓰고 화면에 그 모델을 보인다
            return {"model_id": ok[0]["id"], "substitute": True, "reason": None, "own": info(own[0])}
        return {"model_id": None, "substitute": False, "reason": "model_mismatch", "own": info(own[0])}
    if base:              # 제 모델이 없는 카드(기본 분석) — 영상 해상도에 맞는 기본 분할 모델
        return {"model_id": base[0]["id"], "substitute": False, "reason": None, "own": None}
    return {"model_id": None, "substitute": False, "reason": "no_model", "own": None}


async def _pick_model(conn, d, img: dict) -> str | None:
    """(옛 호출 모양) — 고른 모델 id 만."""
    return (await choose_model(conn, d["model_override"], d["card_id"], d["card_version_id"], img.get("gsd_m")))["model_id"]


async def imagery_for_model(sgg: str | None, geom: dict | None, model_gsd) -> dict | None:
    """모델 해상도에 맞는 등록 영상(자체 · 정사) 가운데 시군구를 가장 많이 덮는 것 — 없으면 None."""
    if not sgg or not model_gsd:
        return None
    from .regions import regions_base
    from shapely.geometry import mapping, shape
    regs, geoms, _ = regions_base()
    g = shape(geom) if geom else geoms.get(sgg)
    if g is None:
        return None
    rg = next((x for x in regs if x["sgg_cd"] == sgg), None) or {}
    codes = [c for c in (sgg, rg.get("prev_cd")) if c]
    async with db(realm="lx") as conn:
        rows = await conn.fetch(
            "WITH a AS (SELECT ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($1),4326)) g) "
            "SELECT i.id, i.gsd_m, coalesce(i.year::text, i.epoch) AS yr, "
            "ST_Area(ST_Intersection(ST_MakeValid(i.footprint), a.g)::geography) / nullif(ST_Area(a.g::geography), 0) AS cov "
            "FROM imagery i, a WHERE i.path_internal IS NOT NULL AND coalesce(i.kind,'ortho')='ortho' AND i.footprint IS NOT NULL "
            "AND (i.sgg_cd = ANY($2::text[]) OR ST_Intersects(i.footprint, a.g))",
            json.dumps(mapping(g)), codes)
    rows = [r for r in rows if (r["cov"] or 0) >= 0.001 and r["gsd_m"] is not None and gsd_fits(r["gsd_m"], model_gsd)]
    if not rows:
        return None

    def yr(r):
        s = str(r["yr"] or "")
        return int(s[:4]) if s[:4].isdigit() else 0
    best = max(rows, key=lambda r: (round(float(r["cov"] or 0), 2), yr(r)))
    return {"imagery_id": best["id"], "gsd_m": float(best["gsd_m"]), "year": yr(best) or None, "coverage": round(float(best["cov"] or 0), 3),
            "partial": float(best["cov"] or 0) < 0.98, "source": "local", "via": "imagery 표(모델 해상도)"}


def mismatch_text(own: dict | None, img: dict | None) -> str:
    mg = gsd_word((own or {}).get("gsd_m"))
    ig = gsd_word((img or {}).get("gsd_m"))
    return (f"서비스 모델({mg})과 이 지역 영상({ig})의 해상도가 맞지 않습니다 — 모델 해상도에 맞는 영상을 등록하거나 다른 지역을 고르세요"
            if mg and ig else "서비스 모델과 이 지역 영상의 해상도가 맞지 않습니다")


async def plan_analysis(conn, override, card_id, cv, sgg, aoi, img: dict | None = None) -> dict:
    """적용 전 점검 · 흐름 시작이 같은 판정을 쓴다(한 출처) — {img, pick, fits, note}.
    fits: True(분석 가능) · False(모델·영상 해상도 불일치 · 대신할 모델 없음) · None(영상 없음 — 등록되면 이어짐)."""
    img = img if img is not None else await best_imagery(sgg, aoi)
    if not img.get("imagery_id"):
        return {"img": img, "pick": None, "fits": None, "note": "이 지역에 등록된 영상이 없습니다 — 영상이 등록되면 AI 분석이 이어집니다"}
    pick = await choose_model(conn, override, card_id, cv, img.get("gsd_m"))
    if pick["reason"] == "model_mismatch":
        alt = await imagery_for_model(sgg, aoi, (pick["own"] or {}).get("gsd_m"))
        if alt:
            pick2 = await choose_model(conn, override, card_id, cv, alt["gsd_m"])
            if pick2["model_id"]:
                pct = round(100 * float(alt["coverage"] or 0))
                return {"img": alt, "pick": pick2, "fits": True,
                        "note": f"모델 해상도에 맞는 {gsd_word(alt['gsd_m'])} 영상으로 분석합니다 — 시군구 면적의 약 {max(pct, 1)}%"}
        return {"img": img, "pick": pick, "fits": False, "note": mismatch_text(pick["own"], img)}
    if not pick["model_id"]:
        return {"img": img, "pick": pick, "fits": False, "note": "이 영상에 맞는 분석 모델이 없습니다"}
    return {"img": img, "pick": pick, "fits": True, "note": None}


async def model_block(conn, mid: str | None, substitute: bool = False) -> dict | None:
    """화면·관리자 공용 — 실제로 분석에 쓴(쓸) 모델 한 줄."""
    if not mid:
        return None
    m = await conn.fetchrow("SELECT id, name, classes, gsd_trained_m FROM models WHERE id=$1", mid)
    if not m:
        return {"id": mid, "name": None, "classes": [], "gsd_m": None, "substitute": substitute}
    return {"id": m["id"], "name": (m["name"] or {}).get("ko") if isinstance(m["name"], dict) else m["name"], "classes": list(m["classes"] or []),
            "gsd_m": float(m["gsd_trained_m"]) if m["gsd_trained_m"] is not None else None, "gsd_word": gsd_word(m["gsd_trained_m"]),
            "substitute": substitute}


@router.get("/deploy-fit")
async def deploy_fit(request: Request, region: str, card_id: str | None = None, from_deploy_id: str | None = None):
    """다른 지역에 적용 — 결재 요청 전에 이 서비스 모델이 그 지역 영상으로 분석할 수 있는지(적용 화면이 먼저 보인다 · POST /deploys 도 같은 판정)."""
    p = require(principal(request), lx=True)
    if p.role not in ("admin", "staff"):
        raise ApiError("forbidden", "LX 직원·관리자만")
    from .regions import regions_base
    regs, geoms, _ = regions_base()
    rg = next((x for x in regs if x["sgg_cd"] == region or x.get("prev_cd") == region), None)
    if not rg:
        raise ApiError("bad_request", "해당 지역이 없습니다", {"region": region})
    sgg = rg["sgg_cd"]
    from shapely.geometry import mapping
    aoi = mapping(geoms[sgg]) if sgg in geoms else None
    async with db(realm="lx") as conn:
        override = None
        if from_deploy_id:
            src = await _get(conn, from_deploy_id)
            card_id, cv, override = src["card_id"], src["card_version_id"], src["model_override"]
        else:
            cv = await conn.fetchval("SELECT id FROM card_versions WHERE card_id=$1 ORDER BY approved_at DESC NULLS LAST, id DESC LIMIT 1", card_id)
        if not card_id or not cv:
            raise ApiError("bad_request", "서비스(card_id)가 필요합니다")
        pl = await plan_analysis(conn, override, card_id, cv, sgg, aoi)
        pk = pl["pick"] or {}
        mb = await model_block(conn, pk.get("model_id"), bool(pk.get("substitute")))
        own = pk.get("own")
    img = pl["img"] or {}
    return {"region": sgg, "fits": pl["fits"], "note": pl["note"],
            "imagery": {"has": bool(img.get("imagery_id")), "gsd_m": img.get("gsd_m"), "gsd_word": gsd_word(img.get("gsd_m")), "year": img.get("year"),
                        "coverage": env(img.get("coverage"), "ratio", "measured", "영상 범위 ∩ 시군구 면적",
                                        None if img.get("coverage") is not None else "영상 없음")},
            "model": mb, "service_model": ({**own, "gsd_word": gsd_word(own.get("gsd_m"))} if own else None), "as_of": now_iso()}


# ── 계약 경로를 같은 프로세스에서 부른다(POST /jobs · POST /survey/build) — 결재한 사람의 권한으로 ──
def _as_request(p: Principal):
    from starlette.requests import Request as SReq
    return SReq({"type": "http", "method": "POST", "path": "/", "headers": [], "query_string": b"", "state": {"principal": p}})


async def _call_route(method: str, path: str, body: dict, p: Principal):
    """게이트웨이 라우트 함수를 직접 호출(HTTP 왕복·토큰 0). 경로가 아직 없으면 ApiError(not_found) — 흐름은 사유로 멈춘다."""
    from fastapi.routing import APIRoute
    from .main import app
    full = "/api/v1" + path
    for rt in app.routes:
        if isinstance(rt, APIRoute) and rt.path == full and method.upper() in rt.methods:
            fn = rt.endpoint
            kw = {}
            for name in inspect.signature(fn).parameters:
                if name == "request":
                    kw[name] = _as_request(p)
                elif name == "body":
                    kw[name] = body
            return await fn(**kw)
    raise ApiError("not_found", f"{method} {path} 경로 없음", {"path": path})


def _route_exists(method: str, path: str) -> bool:
    from fastapi.routing import APIRoute
    from .main import app
    return any(isinstance(rt, APIRoute) and rt.path == "/api/v1" + path and method.upper() in rt.methods for rt in app.routes)


def _flow_actor(user_id: str | None) -> Principal:
    return Principal(realm="lx", role="admin", user_id=user_id or "system", name="flow")


async def _set_flow(conn, did: str, flow: dict, *, stage: str | None = None, snapshot: str | None = None):
    if snapshot:
        await conn.execute("UPDATE deploys SET flow=$2, snapshot_prev=CASE WHEN snapshot_current IS DISTINCT FROM $3 THEN snapshot_current "
                           "ELSE snapshot_prev END, snapshot_current=$3, updated_at=now() WHERE id=$1", did, flow, snapshot)
    elif stage:
        await conn.execute("UPDATE deploys SET flow=$2, stage=$3, updated_at=now() WHERE id=$1", did, flow, stage)
    else:
        await conn.execute("UPDATE deploys SET flow=$2, updated_at=now() WHERE id=$1", did, flow)


async def _flow_event(p: Principal, did: str, action: str):
    async with db(realm="lx") as conn:
        row = await _get(conn, did)
    await _changed(p, did, action, row)
    try:
        from . import summary as sm
        sm.invalidate()
    except Exception:
        pass


async def flow_start(did: str, user_id: str | None = None, *, why: str = "approval") -> dict:
    """결재 통과(또는 영상 등록 뒤 재확인 · 다시 실행) → 영상 → (있으면) 시범 + AI 분석 작업. 반환 = 새 flow."""
    p = _flow_actor(user_id)
    async with db(realm="lx") as conn:
        d = await _get(conn, did)
        flow = d["flow"] or {}
        if flow.get("state") in ("analyzing", "surveying"):
            return flow
        if not d["sgg_cd"]:
            f = _flow_next(flow, "failed", reason="no_region", todo=None)
            await _set_flow(conn, did, f)
            await audit(conn, p, "flow.failed", did, None, {"deploy_id": did, "reason": "no_region"})
            return f
        geom = d["aoi"]
    img = await best_imagery(d["sgg_cd"], geom)
    async with db(realm="lx") as conn:
        d = await _get(conn, did)
        flow = d["flow"] or {}
        if not img.get("imagery_id"):
            if flow.get("state") != "need_imagery":
                f = _flow_next(flow, "need_imagery", imagery=img, reason=img.get("reason") or "no_imagery", todo="영상 등록")
                await _set_flow(conn, did, f)
                await audit(conn, p, "flow.need_imagery", did, None, {"deploy_id": did, "sgg_cd": d["sgg_cd"], "reason": f.get("reason"), "why": why})
            else:
                f = {**flow, "imagery": img, "checked_at": now_iso()}
                await _set_flow(conn, did, f)
            return f
        pl = await plan_analysis(conn, d["model_override"], d["card_id"], d["card_version_id"], d["sgg_cd"], geom, img)
        pk = pl["pick"] or {}
        if pl["fits"] is False and pk.get("reason") == "model_mismatch":
            # 서비스 모델과 영상 해상도가 맞지 않다 — 다른 모델로 말없이 바꾸지 않고, 맞는 영상이 등록되면 이어 간다(60 s 마다 다시 확인)
            if flow.get("state") == "need_imagery" and flow.get("reason") == "model_mismatch":
                f = {**flow, "imagery": img, "checked_at": now_iso()}
                await _set_flow(conn, did, f)
                return f
            f = _flow_next(flow, "need_imagery", imagery=img, reason="model_mismatch", todo="맞는 영상 등록", note=pl["note"])
            await _set_flow(conn, did, f)
            await audit(conn, p, "flow.need_imagery", did, None, {"deploy_id": did, "sgg_cd": d["sgg_cd"], "reason": "model_mismatch",
                                                                "model_id": (pk.get("own") or {}).get("id"), "imagery_id": img.get("imagery_id"), "why": why})
            return f
        model_id = pk.get("model_id")
        if not model_id:
            f = _flow_next(flow, "failed", imagery=img, reason="no_model", todo="모델 연결")
            await _set_flow(conn, did, f)
            await audit(conn, p, "flow.failed", did, None, {"deploy_id": did, "reason": "no_model"})
            return f
        img = pl["img"]
        mb = await model_block(conn, model_id, bool(pk.get("substitute")))
        f = _flow_next(flow, "starting", imagery=img, model_id=model_id, model=mb, todo=None, reason=None, note=pl["note"])
        stage = "shadow" if d["stage"] == "draft" else None
        await _set_flow(conn, did, f, stage=stage)
        if stage:
            await audit(conn, p, "deploy.rollout", did, {"stage": "draft"}, {"stage": "shadow", "via": "flow", "deploy_id": did})
    body = {"kind": "infer", "model_id": model_id, "imagery_id": img["imagery_id"], "deploy_id": did, "card_id": d["card_id"],
            "options": {"scope": "sgg", "sgg_cd": d["sgg_cd"], "chip": 1024, "conf": 0.25, "overlap": 0.125},
            "label": "배포 적용 분석", **({"test": True} if d["test"] else {})}
    try:
        res = await _call_route("POST", "/jobs", body, p)
        job = (res or {}).get("job") or {}
        jid = job.get("id")
        if not jid:
            raise ApiError("upstream_error", "작업 id 없음")
    except ApiError as e:
        async with db(realm="lx") as conn:
            d = await _get(conn, did)
            f = _flow_next(d["flow"], "failed", reason=e.code, detail=str(e.message)[:200], todo="다시 실행")
            await _set_flow(conn, did, f)
            await audit(conn, p, "flow.failed", did, None, {"deploy_id": did, "step": "jobs", "reason": e.code, "message": str(e.message)[:200]})
        await _flow_event(p, did, "flow")
        return f
    async with db(realm="lx") as conn:
        d = await _get(conn, did)
        f = _flow_next(d["flow"], "analyzing", job_id=jid, result_set=job.get("result_set"), detail=None)
        await _set_flow(conn, did, f)
        await audit(conn, p, "flow.analyze", did, None, {"deploy_id": did, "job_id": jid, "imagery_id": img["imagery_id"], "model_id": model_id,
                                                        "sgg_cd": d["sgg_cd"], "scope": "sgg"})
    await _flow_event(p, did, "flow")
    return f


def spawn_flow(did: str, user_id: str | None, why: str = "approval"):
    """결재 응답을 막지 않게 배경에서(영상 선택 · 전역 견적은 수 초)."""
    async def run():
        try:
            await flow_start(did, user_id, why=why)
        except Exception as e:  # pragma: no cover — 흐름 오류는 flow.failed 로 남긴다
            try:
                async with db(realm="lx") as conn:
                    d = await _get(conn, did)
                    await _set_flow(conn, did, _flow_next(d["flow"], "failed", reason=f"error {type(e).__name__}", todo="다시 실행"))
                    await audit(conn, _flow_actor(user_id), "flow.failed", did, None, {"deploy_id": did, "error": repr(e)[:300]})
            except Exception:
                pass
    t = asyncio.create_task(run())
    _flow_tasks.add(t)
    t.add_done_callback(_flow_tasks.discard)
    return t


async def on_port_decided(did: str, decision: str, user_id: str | None):
    """approvals.decide 가 적용(port) 결재를 끝낸 뒤 부른다 — 승인 = 흐름 시작 · 반려 = rejected."""
    async with db(realm="lx") as conn:
        d = await _get(conn, did)
        if decision == "approve":
            await _set_flow(conn, did, _flow_next(d["flow"], "starting", todo=None))
        else:
            await _set_flow(conn, did, _flow_next(d["flow"], "rejected", todo=None))
            await audit(conn, _flow_actor(user_id), "flow.rejected", did, None, {"deploy_id": did})
    if decision == "approve":
        spawn_flow(did, user_id)


async def _job_row(conn, jid: str | None):
    return await conn.fetchrow("SELECT id, state, result_set, error, finished_at, counts FROM jobs WHERE id=$1", jid) if jid else None


async def _survey_state(sgg: str | None, build_job: str | None) -> dict | None:
    """실태조사 적재 결과(core-survey 계약 표 survey_sgg · 읽기만). 표가 없거나 다른 적재 작업의 행이면 None."""
    if not sgg:
        return None
    try:
        async with db(realm="lx") as conn:
            r = await conn.fetchrow("SELECT state, parcels, findings, error, build_job_id FROM survey_sgg WHERE sgg_cd=$1", sgg)
    except Exception:
        return None
    if not r or (build_job and r["build_job_id"] and r["build_job_id"] != build_job):
        return None
    return dict(r)


def _small(res: dict) -> dict:
    return {k: v for k, v in (res or {}).items() if k in ("counts", "state", "n_parcels", "n_findings", "sgg_cd", "tenant_id")}


async def _approver(did: str) -> str | None:
    async with db(realm="lx") as conn:
        return await conn.fetchval("SELECT decided_by FROM approvals WHERE subject_type='deploy' AND subject_id=$1 AND decision='approve' "
                                   "ORDER BY coalesce(decided_at, at) DESC LIMIT 1", did)


async def _after_infer(did: str, d, job) -> None:
    """AI 분석 끝 → 배포본 스냅샷 = 그 결과 세트 → (필지 대조 모듈) POST /survey/build."""
    p = _flow_actor(await _approver(did))
    rs = job["result_set"]
    parcel = await _parcel_on(d)
    async with db(realm="lx") as conn:
        f = _flow_next(d["flow"], "surveying" if parcel else "done", result_set=rs, reason=None, detail=None)
        await _set_flow(conn, did, f, snapshot=rs)
        await audit(conn, p, "flow.result", did, {"snapshot_current": d["snapshot_current"]},
                    {"deploy_id": did, "job_id": job["id"], "snapshot_current": rs, "counts": job["counts"]})
        if not parcel:
            await audit(conn, p, "flow.done", did, None, {"deploy_id": did, "job_id": job["id"]})
    await _flow_event(p, did, "snapshot")
    if not parcel:
        return
    rules = await card_rules(d)
    try:
        res = await _call_route("POST", "/survey/build", {"sgg_cd": d["sgg_cd"], "job_id": job["id"], "deploy_id": did,
                                                          "tenant_id": d["tenant_id"], **({"rules": rules} if rules else {})}, p)
    except ApiError as e:
        async with db(realm="lx") as conn:
            d2 = await _get(conn, did)
            await _set_flow(conn, did, _flow_next(d2["flow"], "failed", reason=f"survey {e.code}", detail=str(e.message)[:200], todo="다시 실행"))
            await audit(conn, p, "flow.failed", did, None, {"deploy_id": did, "job_id": job["id"], "step": "survey.build", "reason": e.code})
        await _flow_event(p, did, "flow")
        return
    res = res if isinstance(res, dict) else {}
    sj = (res.get("job") or {}).get("id") if isinstance(res.get("job"), dict) else None
    sj = sj or res.get("job_id")
    async with db(realm="lx") as conn:
        d2 = await _get(conn, did)
        if sj:
            await _set_flow(conn, did, _flow_next(d2["flow"], "surveying", survey_job_id=sj))
            await audit(conn, p, "flow.survey", did, None, {"deploy_id": did, "job_id": job["id"], "survey_job_id": sj, "sgg_cd": d["sgg_cd"]})
        else:                                     # 동기 응답(바로 끝남)
            await _set_flow(conn, did, _flow_next(d2["flow"], "done", survey=_small(res), reason=None, detail=None))
            await audit(conn, p, "flow.done", did, None, {"deploy_id": did, "job_id": job["id"], "survey": _small(res)})
    await _flow_event(p, did, "flow")


async def _fail(did: str, f: dict, reason: str, extra: dict):
    async with db(realm="lx") as conn:
        await _set_flow(conn, did, _flow_next(f, "failed", reason=reason, todo="다시 실행"))
        await audit(conn, _flow_actor(None), "flow.failed", did, None, {"deploy_id": did, "reason": reason, **extra})
    await _flow_event(_flow_actor(None), did, "flow")


async def flow_tick(only: set | None = None) -> int:
    """진행 중 흐름을 한 번 훑는다(작업 표 = 정본 · 게이트웨이 재기동 뒤에도 이어진다). 반환 = 바뀐 배포본 수. only = 이 배포본들만(시험)."""
    n = 0
    async with db(realm="lx") as conn:
        rows = await conn.fetch(f"SELECT {COLS} FROM deploys WHERE (flow->>'state' IN ('analyzing','surveying','need_imagery','starting') "
                                "OR (flow->>'state' = 'failed' AND flow->>'reason' IN ('survey not_found', 'survey failed') "
                                "    AND coalesce((flow->>'retries')::int, 0) < 5)) "
                                "AND ($1::text[] IS NULL OR id = ANY($1::text[]))", sorted(only) if only else None)
    for d in rows:
        f = d["flow"] or {}
        st = f.get("state")
        did = d["id"]
        try:
            if st == "analyzing":
                async with db(realm="lx") as conn:
                    j = await _job_row(conn, f.get("job_id"))
                if j and j["state"] == "done":
                    await _after_infer(did, d, j)
                    n += 1
                elif j is None or j["state"] in ("failed", "cancelled"):
                    await _fail(did, f, f"job {j['state'] if j else 'missing'}", {"job_id": f.get("job_id")})
                    n += 1
            elif st == "surveying" and f.get("survey_job_id"):
                async with db(realm="lx") as conn:
                    j = await _job_row(conn, f.get("survey_job_id"))
                sv = await _survey_state(d["sgg_cd"], j["id"]) if j and j["state"] == "done" else None
                if j and j["state"] == "done" and sv and sv.get("state") == "failed":
                    # 작업은 끝났다고 했지만 실태조사 적재 표가 실패(계약 survey_sgg.state) — 정직하게 멈춤 + 자동 재시도(최대 5회)
                    await _fail(did, f, "survey failed", {"job_id": f.get("job_id"), "survey_job_id": j["id"], "error": str(sv.get("error"))[:200]})
                    n += 1
                elif j and j["state"] == "done":
                    async with db(realm="lx") as conn:
                        await _set_flow(conn, did, _flow_next(f, "done", reason=None, detail=None, survey={"counts": j["counts"], **({"findings": sv.get("findings"),
                                                                                                          "parcels": sv.get("parcels")} if sv else {})}))
                        await audit(conn, _flow_actor(None), "flow.done", did, None,
                                    {"deploy_id": did, "job_id": f.get("job_id"), "survey_job_id": j["id"], "counts": j["counts"]})
                    await _flow_event(_flow_actor(None), did, "flow")
                    n += 1
                elif j is None or j["state"] in ("failed", "cancelled"):
                    await _fail(did, f, f"survey {j['state'] if j else 'missing'}", {"job_id": f.get("job_id"), "survey_job_id": f.get("survey_job_id")})
                    n += 1
            elif st == "failed":
                # 실태조사 경로(POST /survey/build · core-survey)가 나중에 생기면 AI 분석 결과로 실태조사만 이어 간다(1분마다 확인)
                if time.time() - _flow_last_img.get("sv:" + did, 0) >= IMAGERY_RECHECK_S:
                    _flow_last_img["sv:" + did] = time.time()
                    if _route_exists("POST", "/survey/build"):
                        async with db(realm="lx") as conn:
                            j = await _job_row(conn, f.get("job_id"))
                        if j and j["state"] == "done":
                            async with db(realm="lx") as conn:
                                await conn.execute("UPDATE deploys SET flow = jsonb_set(flow, '{retries}', to_jsonb(coalesce((flow->>'retries')::int, 0) + 1)) "
                                                   "WHERE id=$1", did)
                                d = await _get(conn, did)
                            await _after_infer(did, d, j)
                            n += 1
            elif st == "need_imagery":
                if time.time() - _flow_last_img.get(did, 0) >= IMAGERY_RECHECK_S:
                    _flow_last_img[did] = time.time()
                    img = await best_imagery(d["sgg_cd"], d["aoi"])
                    if img.get("imagery_id"):
                        await flow_start(did, await _approver(did), why="imagery_registered")
                        n += 1
            elif st == "starting":
                # 배경 작업 없이 남은 '준비'(게이트웨이 재기동) — 2분 넘으면 다시 시작
                at = f.get("updated_at")
                if at and not _flow_tasks and (dt.datetime.now(KST) - dt.datetime.fromisoformat(at)).total_seconds() > 120:
                    spawn_flow(did, await _approver(did), why="resume")
        except Exception as e:  # pragma: no cover
            print(f"[flow] {did} {st} 오류 {e!r}", flush=True)
    return n


# ── 필지 대조는 서버가 뒤에서(확인 18차 M-3 ⓐ · 원칙 45 AI 분석이 먼저) ─────────────────────────────────────────
# 배포 흐름 밖에서 끝난 시군구 전역 AI 분석(분석하기 → 이 카드로 분석)도, 그 카드가 필지 대조 서비스면 실태조사(필지 적재 · AI 결합 · 규칙 · 의심 —
# 배포 흐름의 _after_infer 와 같은 POST /survey/build)를 저절로 잇는다. 직원이 '결합 실행'을 누르지 않는다(데이터 올리기에서 결합 단계 · 결합률을 뺐다).
# CPU 작업 대기열 · 한 번에 하나(돌고 있는 실태조사가 있으면 다음 차례에). 일부 범위 분석(그린 범위 · 기관 분석 요청 · 말로 분석)은 시군구 실태조사를
# 바꾸지 않는다(전역 분석만). 그 시군구에 더 새 AI 결과로 만든 실태조사가 있으면 건너뛴다. 끝난 지 PARCEL_WINDOW_H 시간이 지난 분석은 보지 않는다.
PARCEL_TICK_S = 30
PARCEL_WINDOW_H = 72
_parcel_last = {"t": 0.0}


async def _card_parcel(conn, card_id: str) -> tuple[bool, list[str] | None]:
    """카드의 가장 최근 판이 필지 대조 서비스인가(전용 모듈 -parcel 또는 규칙을 고른 서비스) · 고른 규칙(없으면 None = 전체)."""
    m = await conn.fetchval("SELECT modules FROM card_versions WHERE card_id=$1 ORDER BY approved_at DESC NULLS LAST, id DESC LIMIT 1", card_id)
    if not isinstance(m, dict):
        return False, None
    rules = m.get("rules") if isinstance(m.get("rules"), list) and m.get("rules") else None
    return bool(_has_parcel(m) or rules), ([str(x) for x in rules] if rules else None)


async def parcel_tick() -> str | None:
    """끝난 전역 AI 분석 하나를 실태조사로 잇는다 → 이은 AI 작업 id | None."""
    async with db(realm="lx") as conn:
        if await conn.fetchval("SELECT 1 FROM jobs WHERE kind='survey' AND state IN ('queued','running') AND options->>'build'='true' LIMIT 1"):
            return None                                          # 한 번에 하나
        rows = await conn.fetch(
            "SELECT j.id, j.card_id, j.submitted_by, j.finished_at, j.options->>'sgg_cd' AS sgg FROM jobs j "
            "WHERE j.kind='infer' AND j.state='done' AND NOT coalesce(j.test, false) AND j.deploy_id IS NULL AND j.card_id IS NOT NULL "
            "AND j.options->>'scope'='sgg' AND coalesce(j.options->>'sgg_cd','') <> '' "
            "AND j.finished_at > now() - make_interval(hours => $1) "
            "AND EXISTS (SELECT 1 FROM detections d WHERE d.job_id = j.id) "
            "AND NOT EXISTS (SELECT 1 FROM jobs s WHERE s.kind='survey' AND s.options->>'ai_job_id' = j.id) "
            "ORDER BY j.finished_at ASC LIMIT 20", PARCEL_WINDOW_H)
        pick = None
        for r in rows:
            on, rules = await _card_parcel(conn, r["card_id"])
            if not on:
                continue
            newer = await conn.fetchval(
                "SELECT 1 FROM survey_sgg s JOIN jobs a ON a.id = s.job_id WHERE s.sgg_cd=$1 AND a.finished_at > $2", r["sgg"], r["finished_at"])
            if newer:
                continue
            pick = (r, rules)
            break
    if not pick:
        return None
    r, rules = pick
    p = _flow_actor(r["submitted_by"])
    try:
        await _call_route("POST", "/survey/build", {"sgg_cd": r["sgg"], "job_id": r["id"], **({"rules": rules} if rules else {})}, p)
    except ApiError as e:
        if e.code != "survey_build_running":
            print(f"[parcel] {r['id']} {r['sgg']} 실태조사를 잇지 못함 {e.code}", flush=True)
        return None
    async with db(realm="lx") as conn:
        await audit(conn, p, "survey.auto", r["sgg"], None, {"ai_job_id": r["id"], "card_id": r["card_id"], "why": "전역 분석 끝 — 필지 대조 서비스"})
    return r["id"]


async def flow_loop():
    """게이트웨이 수명 동안 5 s 마다(ops.alert_loop 가 띄운다 — main.py 무수정). 필지 대조 잇기(parcel_tick)는 30 s 마다."""
    await asyncio.sleep(3)
    while True:
        try:
            await flow_tick()
        except Exception as e:  # pragma: no cover
            print("[flow] loop error", repr(e), flush=True)
        if time.time() - _parcel_last["t"] >= PARCEL_TICK_S:
            _parcel_last["t"] = time.time()
            try:
                await parcel_tick()
            except Exception as e:  # pragma: no cover
                print("[parcel] loop error", repr(e), flush=True)
        await asyncio.sleep(FLOW_TICK_S)


@router.post("/deploys/{did}/flow")
async def flow_retry(did: str, request: Request, body: dict | None = None):
    """다시 실행(영상 등록 뒤 · 실패 뒤) — LX 직원·관리자. 적용 결재가 끝난 배포본만."""
    p = require(principal(request), lx=True)
    if p.role not in ("admin", "staff"):
        raise ApiError("forbidden", "LX 직원·관리자만")
    async with db(realm="lx") as conn:
        d = await _get(conn, did)
        pend = await conn.fetchval("SELECT 1 FROM approvals WHERE subject_type='deploy' AND subject_id=$1 AND state='pending' "
                                   "AND payload->>'action'='port'", did)
        if pend:
            raise ApiError("approval_required", "적용 결재가 끝나야 실행할 수 있습니다")
        if (d["flow"] or {}).get("state") in ("analyzing", "surveying", "starting"):
            raise ApiError("conflict", "이미 진행 중입니다", status=409)
        await audit(conn, p, "flow.retry", did, {"flow": (d["flow"] or {}).get("state")}, {"deploy_id": did, "job_id": (d["flow"] or {}).get("job_id")})
        fl = d["flow"] or {}
        j = await _job_row(conn, fl.get("job_id"))
    if j is not None and j["state"] == "done" and not await _parcel_on(d):
        raise ApiError("conflict", "이미 결과가 반영됐습니다", status=409)
    if j is not None and j["state"] == "done":          # AI 분석은 끝났다 — 실태조사만 다시(GPU 재사용 0)
        await _after_infer(did, d, j)
        async with db(realm="lx") as conn:
            f = (await _get(conn, did))["flow"]
        return {"deploy_id": did, "flow": flow_view(f), "as_of": now_iso()}
    f = await flow_start(did, p.user_id, why="retry")
    return {"deploy_id": did, "flow": flow_view(f), "as_of": now_iso()}


@router.get("/deploys/{did}/flow")
async def flow_get(did: str, request: Request):
    """한 배포본의 흐름 한 줄(LX) — 결재 · 영상 · AI 분석(작업 상태 · GPU 사용) · 실태조사 · 사용량(기관 계량) · 감사 기록."""
    require(principal(request), lx=True)
    return await flow_detail(did)


async def flow_detail(did: str) -> dict:
    async with db(realm="lx") as conn:
        d = await _get(conn, did)
        f = d["flow"] or {}
        jids = [x for x in (f.get("job_id"), f.get("survey_job_id")) if x]
        jobs = {r["id"]: r for r in await conn.fetch(
            "SELECT id, kind, state, pool, shards_total, shards_done, gpu_s, workers, created_at, started_at, finished_at, "
            "extract(epoch FROM (coalesce(finished_at, now()) - coalesce(started_at, created_at))) AS el FROM jobs WHERE id = ANY($1::text[])", jids)}
        use = await conn.fetch("SELECT u.tenant_id, u.dim, sum(u.amount) v, count(*) n FROM usage_events u WHERE u.job_id = ANY($1::text[]) GROUP BY 1,2",
                               jids)
        aud = await conn.fetch("SELECT action, actor, at, after FROM audit_log WHERE subject=$1 AND (action LIKE 'flow.%' OR action LIKE 'deploy.%') "
                               "ORDER BY at", did)
        ap = await conn.fetchrow("SELECT id, decision, decided_by, decided_at, at FROM approvals WHERE subject_type='deploy' AND subject_id=$1 "
                                 "AND payload->>'action'='port' ORDER BY at DESC LIMIT 1", did)
        ap_aud = await conn.fetch("SELECT action, actor, at FROM audit_log WHERE subject=$1 AND action LIKE 'approval.%' ORDER BY at", ap["id"]) if ap else []

    from .deps import redis
    r = await redis()
    live = {}
    for x in jids:                                   # 끝 시각·걸린 시간은 작업 해시(워커가 쓴다)가 표보다 먼저 — 표에 비어 있을 때 보탠다
        try:
            live[x] = await r.hmget(f"job:{x}", "state", "finished_at", "elapsed_s", "shards_done")
        except Exception:
            live[x] = [None] * 4

    def jv(j):
        if not j:
            return None
        lv = live.get(j["id"]) or [None] * 4
        done = j["state"] in ("done", "failed", "cancelled")
        el = float(lv[2]) if (done and lv[2]) else (float(j["el"] or 0) if (j["finished_at"] or not done) else None)
        return {"id": j["id"], "kind": j["kind"], "state": j["state"], "pool": j["pool"], "shards_total": j["shards_total"],
                "shards_done": int(lv[3]) if lv[3] else j["shards_done"], "workers": list(j["workers"] or []),
                "gpu_s": env(round(float(j["gpu_s"] or 0), 1), "gpu_s", "measured", "jobs.gpu_s(작업 계량)"),
                "elapsed_s": env(round(el, 1) if (el is not None and j["started_at"]) else None, "s", "measured", "작업 시작 → 끝(또는 지금)",
                                 None if j["started_at"] else "대기 중"),
                "created_at": _iso(j["created_at"]), "started_at": _iso(j["started_at"]), "finished_at": _iso(j["finished_at"]) or lv[1]}
    usage: dict = {}
    for u in use:
        usage.setdefault(u["tenant_id"], {})[u["dim"]] = env(round(float(u["v"] or 0), 3), u["dim"], "measured", "usage_events(작업 귀속 기관)")
    return {"deploy_id": did, "card_id": d["card_id"], "tenant_id": d["tenant_id"], "sgg_cd": d["sgg_cd"], "region_name": d["region_name"],
            "stage": d["stage"], "snapshot_current": d["snapshot_current"], "flow": flow_view(f),
            "approval": {"id": ap["id"], "decision": ap["decision"], "by": ap["decided_by"], "at": _iso(ap["decided_at"] or ap["at"])} if ap else None,
            "analysis": jv(jobs.get(f.get("job_id"))), "survey": jv(jobs.get(f.get("survey_job_id"))), "usage": usage,
            "audit": [{"action": a["action"], "actor": a["actor"], "at": _iso(a["at"]),
                       "job_id": (a["after"] or {}).get("job_id") if isinstance(a["after"], dict) else None} for a in aud]
                     + [{"action": a["action"], "actor": a["actor"], "at": _iso(a["at"]), "job_id": None} for a in ap_aud],
            "as_of": now_iso()}
