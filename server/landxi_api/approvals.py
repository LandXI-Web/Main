"""결재함(F3 최종 명세 §3 S-9) — 배포(다른 지역에 적용 · ga 승격) · 규칙(임계 활성화) · 쿼터(한도 변경) · 모델 등록 · 서비스 공개를 한 줄로 읽고 결정한다.

GET  /approvals?state=pending|decided|all   → {items[{id, kind, subject, title, requested_by, requested_by_name, request_reason, at, payload, mine}], counts}
                                               lx admin(전체) · staff(자기 요청 — 반려 사유가 요청한 사람 화면으로 돌아가는 길)
POST /approvals                            {subject_type:'quota', subject_id: tenant, payload:{dim, soft?, hard?, policy?} | {dims:{dim:{soft,hard,policy}}}, reason} → 대기 행
POST /approvals/{id}/decide                {decision: approve|reject, reason} → lx admin · 효과 적용(아래) · deploy.changed / approval.decided 이벤트
효과: deploy(port) = 적용 확정 → 한 흐름 시작(deploys.on_port_decided: 영상 → 시범 + AI 분석 → 실태조사 · 영상 없으면 영상 등록 필요) · rule = 임계 적용(survey_rules · 버전 +1) ·
      quota = quotas 표 갱신 · model = 모델 등록(registered / 반려 = candidate) · card = 서비스 공개(card_versions.approved_by = 결재한 관리자) ·
      request = 기관 영상 분석 의뢰(확인 대장 6차 GF-2 · 무상) — 승인 = 기존 분석 작업 대기열(requests.after_decided) · 반려 = 사유가 기관 '내 의뢰'에.
캔버스 ga 대기(카나리 · ga 승인 수 부족)도 '결재 대기'로 함께 보여 준다(행 없이 계산 · kind deploy_ga).

impl-1(2026-09-30 · 확인 대장 FR-3 · D2-ⓐ · R&R 점검):
  · 요청한 사람은 스스로 결재할 수 없다(409 self_approval) — 서비스 공개를 요청한 직원 · 한도 변경을 요청한 관리자가 스스로 승인자로 적히던 것.
  · 반려는 사유가 있어야 한다(400 reason_required). 요청 사유는 payload.request_reason 으로 남기고 reason 칸에는 결정 사유를 적는다.
  · 요청 없이 관리자가 바로 결정하는 ga 승인은 요청자를 비워 둔다(스스로 요청 · 스스로 승인으로 적지 않는다).
"""
from __future__ import annotations

import secrets

from fastapi import APIRouter, Request

from . import config
from .deps import ApiError, audit, db, principal, require
from .envelope import KST, env, now_iso
from .jobs import ops_event

router = APIRouter()
QUOTA_DIMS = ["storage_gb", "gpu_s_month", "area_km2_month", "concurrent_jobs", "egress_gb_month", "vworld_calls_day", "llm_tokens_month"]
KIND_LABEL = {"deploy": "다른 지역에 적용", "deploy_ga": "운영 전환", "rule": "규칙 적용", "quota": "한도 변경", "model": "모델 등록",
              "card": "서비스 공개", "request": "분석 의뢰"}
ROLE_WORD = {"admin": "LX 관리자", "staff": "LX 직원", "sales": "LX 영업"}


def _iso(v):
    return v.astimezone(KST).isoformat(timespec="seconds") if v else None


async def _rows(conn, state: str, user: str | None):
    return await conn.fetch("SELECT * FROM approvals WHERE ($1::text = 'all' OR coalesce(state, CASE WHEN decision IS NULL THEN 'pending' ELSE 'decided' END) = $1) "
                            "AND ($2::text IS NULL OR requested_by = $2) ORDER BY at DESC LIMIT 200", state, user)


async def people(conn) -> dict:
    """사용자 id → 사람 말('김도윤 · LX 직원' · '남원시 담당자'). 화면은 id 를 내지 않는다."""
    out = {}
    for r in await conn.fetch("SELECT id, role, name FROM lx_users"):
        w = ROLE_WORD.get(r["role"], "LX")
        out[r["id"]] = w if not r["name"] or r["name"] == w else f"{r['name']} · {w}"
    tn = {r["id"]: ((r["name"] or {}).get("ko") if isinstance(r["name"], dict) else r["name"]) for r in await conn.fetch("SELECT id, name FROM tenants")}
    for r in await conn.fetch("SELECT id, tenant_id, name FROM tenant_users"):
        t = tn.get(r["tenant_id"]) or "기관"
        out[r["id"]] = f"{r['name']} · {t}" if r["name"] else f"{t} 담당자"
    return out


def _pub(o, src: str = "결재 요청 값"):
    """결재 payload·effect 안의 숫자(임계 등)를 봉투로 — 화면이 숫자를 지어내지 않게."""
    if isinstance(o, dict):
        return {k: (v if k in ("soft", "hard") else _pub(v, src)) for k, v in o.items()}
    if isinstance(o, list):
        return [_pub(v, src) for v in o]
    if isinstance(o, (int, float)) and not isinstance(o, bool):
        return env(o, "ratio" if o < 1 else "count", "estimate", src, "[추정 초기값] · 결재 요청 값")
    return o


async def _title(conn, r) -> str:
    st, sid, pl = r["subject_type"], r["subject_id"], r["payload"] or {}
    if st == "deploy":
        d = await conn.fetchrow("SELECT d.region_name, c.name FROM deploys d LEFT JOIN cards c ON c.id=d.card_id WHERE d.id=$1", sid)
        if d:
            rn = (d["region_name"] or {}).get("ko") if isinstance(d["region_name"], dict) else d["region_name"]
            cn = (d["name"] or {}).get("ko") if isinstance(d["name"], dict) else d["name"]
            return f"{rn or ''} · {cn or ''}".strip(" ·")
        return sid
    if st == "rule":
        return f"{pl.get('name') or sid}"
    if st == "quota":
        t = await conn.fetchval("SELECT name->>'ko' FROM tenants WHERE id=$1", sid)
        dims = list((pl.get("dims") or {}).keys()) or [pl.get("dim", "")]
        return f"{t or sid} · {', '.join(d for d in dims if d)}"
    if st == "model":
        return str(pl.get("name") or "새 모델")
    if st == "card":
        c = await conn.fetchval("SELECT c.name FROM card_versions v JOIN cards c ON c.id=v.card_id WHERE v.id=$1", sid)
        return ((c or {}).get("ko") if isinstance(c, dict) else c) or str(pl.get("name") or "새 서비스")
    if st == "request":                                  # 기관 영상 분석 의뢰 — '남원시 · 비닐하우스 서비스'
        return f"{pl.get('org') or ''} · {pl.get('service') or ''}".strip(" ·") or "분석 의뢰"
    return sid


async def _ga_waiting(conn) -> list[dict]:
    """카나리에 있는데 ga 승인 수가 모자란 배포본(행 없이 계산)."""
    rows = await conn.fetch("SELECT d.id, d.updated_at, d.region_name, c.name FROM deploys d LEFT JOIN cards c ON c.id=d.card_id "
                            "WHERE d.stage='canary' AND NOT coalesce(d.test,false)")
    out = []
    for d in rows:
        reset = await conn.fetchval("SELECT max(at) FROM audit_log WHERE subject=$1 AND action IN ('deploy.rollback','deploy.port')", d["id"])
        n = await conn.fetchval("SELECT count(*) FROM approvals WHERE subject_type='deploy' AND subject_id=$1 AND decision='approve' "
                                "AND coalesce(payload->>'action','') <> 'port' AND ($2::timestamptz IS NULL OR coalesce(decided_at, at) > $2)", d["id"], reset)
        if n < config.APPROVALS_REQUIRED:
            rn = (d["region_name"] or {}).get("ko") if isinstance(d["region_name"], dict) else d["region_name"]
            cn = (d["name"] or {}).get("ko") if isinstance(d["name"], dict) else d["name"]
            out.append({"id": f"ga:{d['id']}", "kind": "deploy_ga", "kind_label": KIND_LABEL["deploy_ga"],
                        "subject": {"type": "deploy", "id": d["id"]}, "title": f"{rn or ''} · {cn or ''}".strip(" ·"),
                        "requested_by": None, "requested_by_name": None, "request_reason": None, "mine": False,
                        "at": _iso(d["updated_at"]), "state": "pending", "payload": {"action": "ga"}})
    return out


@router.get("/approvals")
async def list_approvals(request: Request, state: str = "pending"):
    p = require(principal(request), lx=True)
    if state not in ("pending", "decided", "all"):
        raise ApiError("bad_request", "state 는 pending|decided|all")
    if p.role == "sales":
        raise ApiError("forbidden", "LX 영업 계정은 결재함이 없습니다")
    mine = None if p.is_admin else p.user_id
    async with db(realm="lx") as conn:
        rows = await _rows(conn, state, mine)
        who = await people(conn)
        cvs = [r["subject_id"] for r in rows if r["subject_type"] == "card"]
        live_cv = {x["id"] for x in await conn.fetch("SELECT id FROM card_versions WHERE id = ANY($1::text[])", cvs)} if cvs else set()
        rqs = [r["subject_id"] for r in rows if r["subject_type"] == "request"]
        live_rq = {x["id"] for x in await conn.fetch("SELECT id FROM analysis_requests WHERE id = ANY($1::text[])", rqs)} if rqs else set()
        items = []
        for r in rows:
            kind = r["subject_type"]
            if kind == "card" and r["subject_id"] not in live_cv:
                continue                              # 지워진 서비스의 공개 결재(시험 잔여 등)는 결재함에 두지 않는다
            if kind == "request" and r["subject_id"] not in live_rq:
                continue                              # 지워진 분석 의뢰(시험 잔여 등)
            st = r["state"] or ("decided" if r["decision"] else "pending")
            pl = dict(r["payload"] or {})
            # 요청 사유: 대기 = reason 칸 · 결정 뒤 = payload.request_reason(옛 행은 결정 사유가 덮어써 없음 — 지어내지 않는다)
            req_reason = r["reason"] if st == "pending" else pl.get("request_reason")
            pl.pop("request_reason", None)
            items.append({"id": r["id"], "kind": kind, "kind_label": KIND_LABEL.get(kind, kind),
                          "subject": {"type": kind, "id": r["subject_id"]}, "title": await _title(conn, r),
                          "requested_by": r["requested_by"], "requested_by_name": who.get(r["requested_by"]) if r["requested_by"] else None,
                          "request_reason": req_reason, "mine": bool(r["requested_by"]) and r["requested_by"] == p.user_id,
                          "at": _iso(r["at"]), "state": st,
                          "decision": r["decision"], "decided_by": r["decided_by"], "decided_by_name": who.get(r["decided_by"]) if r["decided_by"] else None,
                          "decided_at": _iso(r["decided_at"]), "reason": r["reason"] if st == "decided" else None, "payload": _pub(pl)})
        if state in ("pending", "all") and p.is_admin:
            items = (await _ga_waiting(conn)) + items
    pend = [i for i in items if i["state"] == "pending"]
    counts = {k: env(sum(1 for i in pend if i["kind"] == k), "count", "recorded", "approvals + 카나리 ga 대기") for k in KIND_LABEL}
    return {"items": items, "pending": env(len(pend), "count", "recorded", "approvals(state pending) + 카나리 ga 대기"),
            "counts": counts, "as_of": now_iso()}


def _quota_payload(pl: dict) -> dict:
    """한도 변경 요청 본문 검사 — 한 항목(dim · soft · hard · policy) 또는 여러 항목(dims: {dim: {soft, hard, policy}})."""
    def one(d: str, v: dict) -> dict:
        if d not in QUOTA_DIMS:
            raise ApiError("bad_request", "dim 오류", {"allowed": QUOTA_DIMS})
        o = {}
        for k in ("soft", "hard"):
            if v.get(k) is not None:
                try:
                    o[k] = float(v[k])
                except (TypeError, ValueError):
                    raise ApiError("bad_request", f"{k} 는 숫자")
        if o.get("soft") is not None and o.get("hard") is not None and o["soft"] > o["hard"]:
            raise ApiError("bad_request", "소프트는 하드보다 클 수 없습니다", {"dim": d})
        if v.get("policy"):
            if v["policy"] not in ("queue_low", "reject", "notify"):
                raise ApiError("bad_request", "policy 는 queue_low|reject|notify")
            o["policy"] = v["policy"]
        return o
    if isinstance(pl.get("dims"), dict) and pl["dims"]:
        return {"dims": {d: one(d, v or {}) for d, v in pl["dims"].items()}}
    d = pl.get("dim")
    return {"dim": d, **one(d, pl)}


async def request_quota(p, tid: str | None, payload: dict, reason: str | None) -> str:
    """한도 변경 결재 요청 한 줄(POST /approvals · PUT /tenants/{id}/quota 가 같이 쓴다) → 결재 id."""
    tid = tid or p.tenant_id
    if p.realm == "tenant" and (p.role != "manager" or tid != p.tenant_id):
        raise ApiError("forbidden", "자기 기관의 한도만 요청할 수 있습니다")
    if p.realm == "lx" and p.role == "sales":
        raise ApiError("forbidden", "LX 영업 계정은 요청할 수 없습니다")
    pl = _quota_payload(dict(payload or {}))
    aid = "ap_" + secrets.token_hex(6)
    async with db(realm="lx") as conn:
        if not await conn.fetchval("SELECT 1 FROM tenants WHERE id=$1", tid):
            raise ApiError("not_found", "해당 기관이 없습니다")
        await conn.execute("INSERT INTO approvals(id, subject_type, subject_id, requested_by, state, payload, reason, tenant_id, at) "
                           "VALUES ($1,'quota',$2,$3,'pending',$4,$5,$2,now())", aid, tid, p.user_id, pl, reason)
        await audit(conn, p, "approval.request", aid, None, {"subject_type": "quota", "tenant": tid, **pl})
    await ops_event("approval.requested", {"approval_id": aid, "subject_type": "quota", "subject_id": tid, "by": p.user_id, "at": now_iso()})
    return aid


@router.post("/approvals", status_code=201)
async def request_approval(body: dict, request: Request):
    """한도 변경 요청(quota) — 기관 manager(자기 기관) 또는 LX staff/admin. 배포·규칙·모델·서비스 요청은 각 라우트
    (POST /deploys · /survey/rules/{id}/activate · /registry/model-register · /registry/cards)."""
    p = require(principal(request))
    st = body.get("subject_type")
    if st != "quota":
        raise ApiError("bad_request", "여기서는 한도 변경(quota)만 요청합니다 — 다른 지역에 적용 = POST /deploys · 규칙 = POST /survey/rules/{id}/activate")
    aid = await request_quota(p, body.get("subject_id"), body.get("payload") or {}, body.get("reason"))
    return {"approval_id": aid, "state": "pending", "as_of": now_iso()}


def check_decider(p, requested_by: str | None, decision: str, reason: str | None) -> None:
    """결정 규칙 한 곳(결재함 · 모델 등록 결정이 같이 쓴다): 반려 = 사유 필수 · 요청한 사람 ≠ 결정하는 사람."""
    if decision == "reject" and not str(reason or "").strip():
        raise ApiError("reason_required", "반려 사유를 적어 주세요", status=400)
    if requested_by and requested_by == p.user_id:
        raise ApiError("self_approval", "요청한 사람은 스스로 결재할 수 없습니다 — 다른 관리자가 결재합니다", status=409)


async def _apply_quota(conn, sid: str, pl: dict, aid: str) -> dict:
    items = pl["dims"].items() if isinstance(pl.get("dims"), dict) else [(pl["dim"], pl)]
    before = {}
    for dim, v in items:
        cur = await conn.fetchrow("SELECT soft, hard, policy FROM quotas WHERE tenant_id=$1 AND dim=$2", sid, dim)
        before[dim] = {k: (float(cur[k]) if k != "policy" and cur[k] is not None else cur[k]) for k in ("soft", "hard", "policy")} if cur else None
        await conn.execute("INSERT INTO quotas(tenant_id, dim, soft, hard, policy, note) VALUES ($1,$2,$3,$4,coalesce($5,'notify'),$6) "
                           "ON CONFLICT (tenant_id, dim) DO UPDATE SET soft=coalesce($3, quotas.soft), hard=coalesce($4, quotas.hard), "
                           "policy=coalesce($5, quotas.policy), note=$6", sid, dim, v.get("soft"), v.get("hard"), v.get("policy"), f"결재 {aid}")
    return {"quota": sid, "dims": list(before), "before": before}


@router.post("/approvals/{aid}/decide")
async def decide(aid: str, body: dict, request: Request):
    p = require(principal(request), admin=True)
    dec = body.get("decision")
    if dec not in ("approve", "reject"):
        raise ApiError("bad_request", "decision approve|reject")
    reason = (str(body.get("reason")).strip() or None) if body.get("reason") is not None else None
    if aid.startswith("ga:"):                    # 카나리 ga 승인 = 배포 승인 한 줄(기존 /deploys/{id}/approve 와 같은 행) · 요청 없음 → 요청자 비움
        check_decider(p, None, dec, reason)
        did = aid[3:]
        nid = "ap_" + secrets.token_hex(6)
        async with db(realm="lx") as conn:
            if not await conn.fetchval("SELECT 1 FROM deploys WHERE id=$1", did):
                raise ApiError("not_found", f"deploy {did} 없음")
            await conn.execute("INSERT INTO approvals(id, subject_type, subject_id, requested_by, decided_by, decision, reason, state, decided_at) "
                               "VALUES ($1,'deploy',$2,NULL,$3,$4,$5,'decided',now())", nid, did, p.user_id, dec, reason)
            await audit(conn, p, "deploy.approve", did, None, {"decision": dec, "reason": reason, "via": "approvals"})
            t = await conn.fetchval("SELECT tenant_id FROM deploys WHERE id=$1", did)
        await ops_event("deploy.changed", {"deploy_id": did, "action": "approve", "tenant_id": t, "by": p.user_id, "at": now_iso()})
        return {"id": nid, "decision": dec, "kind": "deploy_ga", "subject": {"type": "deploy", "id": did}, "as_of": now_iso()}
    async with db(realm="lx") as conn:
        r = await conn.fetchrow("SELECT * FROM approvals WHERE id=$1 FOR UPDATE", aid)
        if not r:
            raise ApiError("not_found", f"결재 {aid} 없음")
        if (r["state"] or "decided") != "pending":
            raise ApiError("conflict", "이미 결정된 결재입니다", {"decision": r["decision"]}, 409)
        check_decider(p, r["requested_by"], dec, reason)
        st, sid, pl = r["subject_type"], r["subject_id"], dict(r["payload"] or {})
        effect = None
        if dec == "approve":
            if st == "rule":
                th = pl.get("thresholds") or {}
                ex = await conn.fetchrow("SELECT id, thresholds, version FROM survey_rules WHERE id=$1", sid)
                if ex:
                    await conn.execute("UPDATE survey_rules SET thresholds=coalesce(thresholds,'{}'::jsonb) || $2::jsonb, version=coalesce(version,1)+1, "
                                       "state='active', pending=NULL WHERE id=$1", sid, th)
                else:
                    await conn.execute("INSERT INTO survey_rules(id, tenant_id, name, condition, thresholds, basis, state, version) "
                                       "VALUES ($1,'lx',$2,NULL,$3,'estimate','active',1)", sid, pl.get("name"), th)
                if pl.get("review"):              # 검수 전 떼기 승인 → 규칙 꼬리표 '✓ 검수됨'(lx-review · 명세 §2.6)
                    await conn.execute("UPDATE survey_rules SET reviewed=true, reviewed_at=now() WHERE id=$1", sid)
                effect = {"rule": sid, "thresholds": th, "reviewed": bool(pl.get("review"))}
            elif st == "quota":
                effect = await _apply_quota(conn, sid, pl, aid)
            elif st == "deploy":
                effect = {"deploy": sid, "action": pl.get("action") or "approve"}
            elif st == "model":
                await conn.execute("UPDATE models SET status='registered' WHERE id=$1 AND status='pending'", sid)
                effect = {"model": sid}
            elif st == "card":                    # 서비스 공개(D2-ⓐ) — 승인자 = 결재한 관리자(만든 직원이 아니라)
                await conn.execute("UPDATE card_versions SET approved_by=$2, approved_at=now() WHERE id=$1", sid, p.user_id)
                effect = {"card_version": sid, "published": True}
            elif st == "request":                 # 기관 영상 분석 의뢰(GF-2) — 분석 준비(대기열은 결재 뒤 배경에서)
                from .requests import on_decided
                effect = await on_decided(conn, sid, "approve", reason, p.user_id)
        elif st == "rule":
            await conn.execute("UPDATE survey_rules SET pending=NULL WHERE id=$1", sid)
        elif st == "model":
            await conn.execute("UPDATE models SET status='candidate' WHERE id=$1 AND status='pending'", sid)
        elif st == "request":                     # 반려 사유가 기관 '내 의뢰'에 그대로
            from .requests import on_decided
            effect = await on_decided(conn, sid, "reject", reason, p.user_id)
        if r["reason"] is not None and "request_reason" not in pl:      # 요청 사유는 남기고, reason 칸에는 결정 사유를 적는다
            pl["request_reason"] = r["reason"]
        await conn.execute("UPDATE approvals SET state='decided', decision=$2, decided_by=$3, decided_at=now(), "
                           "reason=coalesce($4, reason), payload=$5 WHERE id=$1", aid, dec, p.user_id, reason, pl)
        await audit(conn, p, f"approval.{dec}", aid, {"subject_type": st, "subject_id": sid}, {"effect": effect, "reason": reason})
        tenant = r["tenant_id"] or (await conn.fetchval("SELECT tenant_id FROM deploys WHERE id=$1", sid) if st == "deploy" else None)
    await ops_event("approval.decided", {"approval_id": aid, "subject_type": st, "subject_id": sid, "decision": dec, "by": p.user_id,
                                         "requested_by": r["requested_by"], "at": now_iso()})
    if st == "deploy" and pl.get("action") == "port":            # 한 흐름(core-flow): 결재 = 실행 시작
        from .deploys import on_port_decided
        await on_port_decided(sid, dec, p.user_id)
        effect = {**(effect or {}), "flow": "starting" if dec == "approve" else "rejected"}
    if st == "deploy":
        await ops_event("deploy.changed", {"deploy_id": sid, "action": "approval", "decision": dec, "tenant_id": tenant, "by": p.user_id, "at": now_iso()})
    if st == "card":
        await ops_event("deploy.changed", {"card_version_id": sid, "action": "card.publish", "decision": dec, "by": p.user_id, "at": now_iso()})
    if st == "request":                           # 승인 = 기존 분석 작업 대기열(게이트웨이 대기열로만) · 기관 화면에 상태 알림
        from .requests import after_decided
        after_decided(sid, dec, p.user_id)
    return {"id": aid, "decision": dec, "kind": st, "subject": {"type": st, "id": sid}, "effect": _pub(effect), "as_of": now_iso()}
