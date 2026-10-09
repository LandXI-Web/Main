"""레지스트리 · 계보(F1-CONTRACT §4.6) — models · cards · card_versions · lineage."""
from __future__ import annotations

import json
import re
import secrets

from fastapi import APIRouter, Query, Request

from . import config
from .deps import ApiError, audit, db, principal, require
from .envelope import env, now_iso

router = APIRouter()
MODEL_COLS = ("id, family, version, weights_uri, task, classes, input, gsd_trained_m, metrics, perf, status, image, tile_size, infer_shape, card_url, adapter, "
              "name, sample_id, train_job, train_log, created_at")


def model_dict(r, train: bool = True, base_of: dict | None = None) -> dict:
    """모델 한 행. train=False 면 계약(F1 §4.6) 모양 그대로 — 목록은 ?with=train 일 때만 학습 칸(이름·상태 말·회차 기록·기반 모델)을 붙인다.
    base_model = 그 모델을 만든 학습 작업이 고른 기반 모델(작업 기록 한 출처 · 화면 선택 상자 값이 아님)."""
    d = {"id": r["id"], "family": r["family"], "task": r["task"], "classes": r["classes"] or [], "weights_uri": r["weights_uri"],
            "input": r["input"] or [], "gsd_trained_m": float(r["gsd_trained_m"]) if r["gsd_trained_m"] is not None else None,
            "tile_size": r["tile_size"], "infer_shape": list(r["infer_shape"]) if r["infer_shape"] else None, "image": r["image"],
            "metrics": r["metrics"] or {}, "perf": r["perf"], "status": r["status"], "card_url": r["card_url"]}
    if not train:
        return d
    return {**d,
            "name": name_ko(r), "sample_id": r["sample_id"],
            "train_job": r["train_job"], "train_log": _log(r["train_log"]),
            "base_model": (base_of or {}).get(r["train_job"]) if r["train_job"] else None,
            "created_at": r["created_at"].isoformat(timespec="seconds") if r["created_at"] else None,
            "status_label": STATUS_MODEL.get(r["status"] or "", r["status"])}


_CLS_KO = {"vehicle": "차량", "car": "차량", "building": "건물", "parking": "주차장", "cropland": "경작지", "greenhouse": "비닐하우스"}
_CARD_CACHE: dict[str, tuple[float, dict]] = {}


def _card_json(card_url) -> dict:
    """모델 카드(card.json) — 파일 시각이 같으면 다시 읽지 않는다. 없으면 {}."""
    if not (isinstance(card_url, str) and card_url.startswith("/files/")):
        return {}
    f = config.DATA_ROOT / card_url[len("/files/"):]
    try:
        mt = f.stat().st_mtime
        hit = _CARD_CACHE.get(str(f))
        if hit and hit[0] == mt:
            return hit[1]
        c = json.loads(f.read_text(encoding="utf-8")) or {}
        _CARD_CACHE[str(f)] = (mt, c)
        return c
    except Exception:                                   # noqa: BLE001
        return {}


def name_ko(r) -> str | None:
    """모델 이름(사람 말 · fix9 · 원칙 143) — 서버 이름 칸이 있으면 그것. 없으면 '{대상} 모델 (날짜)':
    대상 = 모델 카드의 업무 이름(task_ko) → 없으면 클래스 이름(세부 '_단동' 등은 앞말 · 영문은 우리말) · 날짜 = 학습 끝 날(카드 ckpt_date → 검증 기록 날).
    파일명 · 영문 코드는 화면에 내지 않는다."""
    n = (r["name"] or {}).get("ko") if isinstance(r["name"], dict) else r["name"]
    if n:
        return n
    if r["task"] not in ("seg", "det", "obb"):          # 지수 · 규칙(학습 모델 아님)은 이름을 짓지 않는다
        return None
    c = _card_json(r["card_url"])
    what = str(c.get("task_ko") or "").strip()
    if not what:
        words = []
        for x in (r["classes"] or []):
            w = _CLS_KO.get(str(x).lower(), str(x).split("_")[0])
            if w and w not in words:
                words.append(w)
        what = "·".join(words) if len(words) <= 2 else f"{words[0]}·{words[1]} 등 {len(words)}종"   # 고르는 칸에서 잘리지 않게(줄바꿈 규칙 9)
    if not what:
        return None
    day = str(c.get("ckpt_date") or "")[:10]
    if not day:
        mt = r["metrics"] or {}
        if isinstance(mt, str):
            try:
                mt = json.loads(mt)
            except ValueError:
                mt = {}
        day = next((str(e.get("as_of"))[:10] for e in mt.values() if isinstance(e, dict) and e.get("as_of")), "")
    return f"{what} 모델 ({day.replace('-', '.')})" if day else f"{what} 모델"


async def train_bases(conn) -> dict:
    """학습 작업 id → 그 작업의 기반 모델(jobs.model_id · 학습 작업은 기반 모델로 제출된다)."""
    return {x["id"]: x["model_id"] for x in await conn.fetch("SELECT id, model_id FROM jobs WHERE kind='train'")}


# ── 규칙 × 모델 클래스(서비스 만들기) — 규칙의 근거 대상(evidence_cls)을 모델이 찾을 때만 그 규칙이 뜻을 가진다 ──
def class_keys(classes) -> set[str]:
    """모델 클래스 → 규칙 피연산자 키(bld·crop·park·gh). '비닐하우스_단동' 같은 세부 이름은 앞말로 본다."""
    from survey import rules as RL
    names = (RL.operand_map().get("classes") or {})
    out = set()
    for c in classes or []:
        s = str(c).strip()
        for cand in {s, s.split("_")[0], s.lower()}:
            for k, vs in names.items():
                if cand in vs:
                    out.add(k)
    return out


def rules_fit(classes) -> dict[str, bool]:
    """규칙 id → 이 클래스들로 평가할 수 있는가(근거 대상 evidence_cls 가 모델 클래스에 있음)."""
    from survey import rules as RL
    keys = class_keys(classes)
    return {rid: (d.get("evidence_cls") in keys) for rid, d in RL.definitions().items()}


def _log(rows) -> list | None:
    """회차 기록 → 봉투(측정 · 학습 검증). index = 회차."""
    if not rows:
        return None
    return [{"index": x.get("epoch"), "label": f"{x.get('epoch')}/{x.get('epochs')}",
             **{k: env(x.get(k), "ratio", "measured", "학습 검증") for k in ("map50", "precision", "recall")}} for x in rows]


STATUS_MODEL = {"candidate": "결과 확인 전", "pending": "승인 대기", "registered": "등록", "retired": "내림", "recorded": "기록"}


async def sync_model_approvals(conn) -> int:
    """모델 등록 결재(approvals subject_type 'model')가 결재함에서 결정됐으면 모델 상태에 반영(승인 = registered · 반려 = candidate)."""
    a = await conn.execute("UPDATE models m SET status='registered' FROM approvals a WHERE a.subject_type='model' AND a.subject_id=m.id "
                           "AND a.decision='approve' AND m.status='pending'")
    b = await conn.execute("UPDATE models m SET status='candidate' FROM approvals a WHERE a.subject_type='model' AND a.subject_id=m.id "
                           "AND a.decision='reject' AND m.status='pending' AND NOT EXISTS (SELECT 1 FROM approvals x WHERE x.subject_type='model' "
                           "AND x.subject_id=m.id AND coalesce(x.state,'')='pending')")
    return int(a.split()[-1]) + int(b.split()[-1])


@router.get("/registry/models")
async def models(request: Request, with_: str | None = Query(None, alias="with")):
    require(principal(request), lx=True)
    async with db(realm="lx") as conn:
        await sync_model_approvals(conn)
        rows = await conn.fetch(f"SELECT {MODEL_COLS} FROM models ORDER BY id")
        bases = await train_bases(conn) if with_ == "train" else None
    return {"items": [model_dict(r, with_ == "train", bases) for r in rows], "total": len(rows), "as_of": now_iso()}


@router.get("/registry/model-rules")
async def model_rules(request: Request, model_id: str):
    """서비스 만들기 — 규칙마다 이 모델로 평가할 수 있는지(fits). 맞지 않는 규칙은 고를 수 없다(서버도 거절)."""
    require(principal(request), lx=True)
    async with db(realm="lx") as conn:
        m = await conn.fetchrow("SELECT classes FROM models WHERE id=$1", model_id)
        rows = await conn.fetch("SELECT id, name FROM survey_rules ORDER BY id")
    if not m:
        raise ApiError("not_found", "모델이 없습니다")
    fit = rules_fit(m["classes"] or [])
    return {"items": [{"id": r["id"], "name": r["name"], "fits": bool(fit.get(r["id"]))} for r in rows if r["id"] in fit],
            "as_of": now_iso()}


@router.get("/registry/models/{mid:path}")
async def model(mid: str, request: Request):
    require(principal(request), lx=True)
    async with db(realm="lx") as conn:
        await sync_model_approvals(conn)
        r = await conn.fetchrow(f"SELECT {MODEL_COLS} FROM models WHERE id=$1", mid)
        bases = await train_bases(conn) if r and r["train_job"] else None
    if not r:
        raise ApiError("not_found", f"model {mid} 없음")
    return model_dict(r, True, bases)


def _staff(p):
    if p.role not in ("staff", "admin"):
        raise ApiError("forbidden", "LX 직원·관리자만")
    return p


@router.post("/registry/model-register", status_code=202)
async def register_model(body: dict, request: Request):
    """모델 등록 요청(r3-train) — 학습 끝 모델(결과 확인 전 · candidate) → 승인 대기(pending) + 관리자 결재 한 줄(approvals subject_type 'model').
    본문 {model_id, reason?}. (모델 id 에 '/' 가 있어 경로 대신 본문으로 받는다)"""
    p = _staff(require(principal(request), lx=True))
    mid = body.get("model_id")
    async with db(realm="lx") as conn:
        r = await conn.fetchrow("SELECT id, status, name, metrics FROM models WHERE id=$1", mid)
        if not r:
            raise ApiError("not_found", "모델이 없습니다")
        if r["status"] == "pending":
            aid = await conn.fetchval("SELECT id FROM approvals WHERE subject_type='model' AND subject_id=$1 AND state='pending' ORDER BY at DESC LIMIT 1", mid)
            return {"id": mid, "status": "pending", "approval_id": aid, "as_of": now_iso()}
        if r["status"] != "candidate":
            raise ApiError("conflict", "결과 확인 전 모델만 등록을 요청합니다", {"status": r["status"]}, 409)
        name = (r["name"] or {}).get("ko") if isinstance(r["name"], dict) else r["name"]
        met = r["metrics"] or {}
        mk = next((k for k in ("metrics/mAP50(M)", "metrics/mAP50(B)", "mask_mAP50", "box_mAP50", "mAP50") if k in met), None)
        mv = met[mk].get("value") if mk and isinstance(met[mk], dict) else (met[mk] if mk else None)
        aid = "ap_" + secrets.token_hex(6)
        await conn.execute("INSERT INTO approvals(id, subject_type, subject_id, requested_by, state, payload, reason, tenant_id, at) "
                           "VALUES ($1,'model',$2,$3,'pending',$4,$5,'lx',now())", aid, mid, p.user_id,
                           {"action": "register", "name": name, "metric": mv}, body.get("reason") or "모델 등록")
        await conn.execute("UPDATE models SET status='pending' WHERE id=$1", mid)
        await audit(conn, p, "model.register_request", mid, {"status": "candidate"}, {"status": "pending", "approval_id": aid})
    from .jobs import ops_event
    await ops_event("approval.requested", {"approval_id": aid, "subject_type": "model", "subject_id": mid, "by": p.user_id, "at": now_iso()})
    return {"id": mid, "status": "pending", "approval_id": aid, "as_of": now_iso()}


@router.post("/registry/model-decide")
async def decide_model(body: dict, request: Request):
    """관리자 결정(r3-train) — 모델 등록 결재 승인 = registered · 반려 = candidate. 본문 {model_id, decision, reason?}.
    결재함(/approvals/{id}/decide)으로 결정해도 같은 결과(모델 목록을 읽을 때 반영)."""
    p = require(principal(request), admin=True)
    mid = body.get("model_id")
    dec = body.get("decision")
    if dec not in ("approve", "reject"):
        raise ApiError("bad_request", "decision approve|reject")
    async with db(realm="lx") as conn:
        ar = await conn.fetchrow("SELECT id, requested_by FROM approvals WHERE subject_type='model' AND subject_id=$1 AND state='pending' ORDER BY at DESC LIMIT 1", mid)
        if not ar:
            raise ApiError("not_found", "승인 대기 중인 등록 요청이 없습니다")
        from .approvals import SOLO_NOTE, check_decider, solo_admin   # 결재함과 같은 규칙: 반려 = 사유 필수 · 요청한 사람 ≠ 결정하는 사람(impl-1)
        solo = bool(ar["requested_by"]) and ar["requested_by"] == p.user_id and await solo_admin(conn, p)   # 관리자 계정 하나(10-01) — 스스로 결재 · 기록
        check_decider(p, ar["requested_by"], dec, body.get("reason"), solo=solo)
        aid = ar["id"]
        await conn.execute("UPDATE approvals SET state='decided', decision=$2, decided_by=$3, decided_at=now(), reason=coalesce($4, reason), "
                           "payload = CASE WHEN $5 THEN coalesce(payload,'{}'::jsonb) || '{\"single_admin\": true}'::jsonb ELSE payload END WHERE id=$1",
                           aid, dec, p.user_id, body.get("reason"), solo)
        await conn.execute("UPDATE models SET status=$2 WHERE id=$1", mid, "registered" if dec == "approve" else "candidate")
        await audit(conn, p, f"approval.{dec}", aid, {"subject_type": "model", "subject_id": mid},
                    {"effect": {"model": mid}, **({"single_admin": True, "note": SOLO_NOTE} if solo else {})})
        r = await conn.fetchrow(f"SELECT {MODEL_COLS} FROM models WHERE id=$1", mid)
    from .jobs import ops_event
    await ops_event("approval.decided", {"approval_id": aid, "subject_type": "model", "subject_id": mid, "decision": dec, "by": p.user_id,
                                         "at": now_iso()})
    return {**model_dict(r), "approval_id": aid, "decision": dec, "as_of": now_iso()}


STATUS_LABEL = {"ops": "운영", "pilot": "시범", "first": "첫 결과 전"}


def _status_of(dps: list) -> str:
    """카드 상태 3종(K7) — 운영 = 실결과 있는 ga 배포본 · 시범 = canary·shadow(또는 결과 없는 ga) · 첫 결과 전 = 그 밖."""
    live = [d for d in dps if not d["test"]]
    if any(d["stage"] == "ga" and (d["snapshot_current"] or d["scale"]) for d in live):
        return "ops"
    if any(d["stage"] in ("canary", "shadow", "ga") for d in live):
        return "pilot"
    return "first"


@router.get("/registry/cards")
async def cards(request: Request, public: int | None = None):
    """카드 = 모델 + 규칙 + 대장 스키마(S-6). ?public=1(또는 게스트) = 실결과 있는 배포본이 있는 카드만 · 요약 필드."""
    p = principal(request)
    pub = bool(public) or p.guest
    if not pub:
        require(p, lx=True)
    async with db(realm="lx") as conn:
        cs = await conn.fetch("SELECT id, name, scope, domain, kind, status_history, portable, ledger_schema, intro, crop_url FROM cards ORDER BY id")
        vs = await conn.fetch("SELECT id, card_id, version, model_ids, modules FROM card_versions ORDER BY id")
        ds = await conn.fetch("SELECT id, card_id, stage, snapshot_current, scale, coalesce(test,false) AS test, tenant_id FROM deploys")
        owners = {} if pub else await _card_owners(conn)
    from .catalog import base_of, rebase                  # 크롭 주소 = 이 요청의 기준 주소(바깥 주소에서 이 PC 주소 0 · fix9)
    base = base_of(request)
    items = []
    for c in cs:
        mine = [v for v in vs if v["card_id"] == c["id"]]
        dps = [d for d in ds if d["card_id"] == c["id"]]
        st = _status_of(dps)
        name = (c["name"] or {}).get("ko") if isinstance(c["name"], dict) else c["name"]
        if pub:
            live = [d for d in dps if not d["test"] and d["stage"] in ("ga", "canary") and (d["snapshot_current"] or d["scale"])]
            if not live:
                continue
            if p.realm == "tenant":                       # 기관 계정: 다른 기관 배포본 id 는 내주지 않는다(원칙 39)
                live = [d for d in live if d["tenant_id"] == p.tenant_id]
            items.append({"id": c["id"], "name": name, "scope": c["scope"], "status": st, "status_label": STATUS_LABEL[st],
                          "intro": c["intro"], "crop_url": rebase(c["crop_url"], base), "deploys": [d["id"] for d in live]})
            continue
        mods = (mine[-1]["modules"] if mine else None) or {}
        items.append({"id": c["id"], "name": name, "scope": c["scope"], "status": c["status_history"], "status3": st, "status_label": STATUS_LABEL[st],
                      **({"project": owners[c["id"]]["project"], "owner": owners[c["id"]]["owner"]} if c["id"] in owners else {}),
                      "versions": [v["id"] for v in mine], "modules": {"core": mods.get("core", []), "ext": mods.get("ext", [])},
                      "models": list((mine[-1]["model_ids"] if mine else None) or []),
                      "ledger_schema": c["ledger_schema"], "intro": c["intro"], "crop_url": rebase(c["crop_url"], base),
                      "deploys": [{"id": d["id"], "stage": d["stage"], "tenant_id": d["tenant_id"]} for d in dps if not d["test"]]})
    return {"items": items, "total": len(items), "n": env(len(items), "count", "recorded", "cards" + (" · 실결과 있는 배포본" if pub else "")), "public": pub,
            "as_of": now_iso()}


async def _card_owners(conn) -> dict:
    """카드 → 만든 프로젝트 · 담당(= 그 프로젝트장 · 구현 2차 T1 · 원칙 63). 프로젝트 없이 만든 옛 카드는 없음."""
    rows = await conn.fetch("SELECT l.ref, p.id, p.name, u.name AS lead, u.role FROM project_links l JOIN projects p ON p.id=l.project_id "
                            "LEFT JOIN lx_users u ON u.id=p.lead_id WHERE l.kind='card'")
    word = {"admin": "LX 관리자", "staff": "LX 직원"}
    return {r["ref"]: {"project": {"id": r["id"], "name": r["name"]}, "owner": r["lead"] or word.get(r["role"], "LX")} for r in rows}


ROLES_OK = {"pnu", "jibun", "emd", "ri", "bon", "bu", "san", "status", "use", "date", "area", "permit_no", "owner_type", "lon", "lat"}


def clean_schema(body: dict) -> dict:
    """대장 스키마 검사 — {kind, columns:[{key, label, role}]} · 성명·연락처 열 금지 · 잘못된 항목은 400."""
    from .ledger import KINDS, is_pii
    kind = body.get("kind")
    cols = body.get("columns") or []
    if kind not in KINDS:
        raise ApiError("bad_request", "대장 종류", {"allowed": list(KINDS)})
    if not isinstance(cols, list) or not cols:
        raise ApiError("bad_request", "columns 가 비었습니다")
    clean = []
    for i, c in enumerate(cols):
        if not isinstance(c, dict):              # 문자열·숫자·null 항목 = 400(계약 v1.2-16 · 500 금지)
            raise ApiError("bad_request", "columns 항목은 {key, label, role} 객체여야 합니다", {"index": i, "got": type(c).__name__})
        role = c.get("role")
        if role not in ROLES_OK:
            raise ApiError("bad_request", "알 수 없는 역할", {"role": role, "allowed": sorted(ROLES_OK)})
        label = str(c.get("label") or c.get("key") or "")[:40]
        if is_pii(label):
            raise ApiError("bad_request", "성명·연락처 열은 스키마에 둘 수 없습니다", {"label": label})
        clean.append({"key": str(c.get("key") or role)[:40], "label": label, "role": role})
    return {"kind": kind, "columns": clean}


CORE_MODULES = ["mod-auth", "mod-map", "mod-result", "mod-stats", "mod-report", "mod-feedback", "mod-usage"]


@router.get("/registry/ledger_kinds")
async def ledger_kinds(request: Request):
    """서비스 만들기용 대장 형식 목록 — 대장 종류(이름) + 그 종류의 스키마를 가진 카드(복사해 쓸 수 있는 형식)."""
    require(principal(request), lx=True)
    from .ledger import KINDS
    async with db(realm="lx") as conn:
        rows = await conn.fetch("SELECT id, ledger_schema FROM cards WHERE ledger_schema IS NOT NULL ORDER BY id")
    have = {}
    for r in rows:
        k = (r["ledger_schema"] or {}).get("kind")
        if k and k not in have:
            have[k] = r["id"]
    return {"items": [{"kind": k, "label": v, "ready": k in have} for k, v in KINDS.items()], "as_of": now_iso()}


@router.post("/registry/cards", status_code=201)
async def create_card(body: dict, request: Request):
    """서비스 만들기(r3-train · C5) — 등록된 모델 + 규칙(기존 규칙 중 선택) + 대장 형식 → 새 서비스 카드 + 첫 버전(1.0).
    본문 {name, model_id, rules:[id..], ledger_kind | ledger_schema{kind, columns}, domain?, project_id?}. LX 직원·관리자.
    project_id(구현 2차 T1 · 4차 P1): 발행 요청은 그 프로젝트의 프로젝트장이 한다. 공개 결재 요청에 프로젝트가 붙고(payload project_id · project_name ·
    owner) 카드는 그 프로젝트에 이어진다(공개된 카드의 담당 = 프로젝트장). 그 프로젝트에 이미 카드가 있으면(보완 회차 · 재학습) 새 카드가 아니라
    같은 카드의 새 판을 만들고 그 판의 공개를 결재에 올린다(재학습 결과의 배포는 관리자 승인 · 역할-3 ⓑ)."""
    p = require(principal(request), lx=True)
    if p.role not in ("staff", "admin"):
        raise ApiError("forbidden", "LX 직원·관리자만 서비스를 만듭니다")
    name = str(body.get("name") or "").strip()[:60]
    mid = body.get("model_id")
    rules = body.get("rules") or []
    if not name:
        raise ApiError("bad_request", "서비스 이름을 적어 주세요")
    if not isinstance(rules, list) or not all(isinstance(x, str) for x in rules):
        raise ApiError("bad_request", "rules 는 규칙 id 목록")
    pid = str(body.get("project_id") or "") or None
    async with db(realm="lx") as conn:
        prj = None
        if pid:
            prj = await conn.fetchrow("SELECT id, name, lead_id, round FROM projects WHERE id=$1", pid)
            if not prj:
                raise ApiError("not_found", "프로젝트가 없습니다")
            if prj["lead_id"] != p.user_id:
                raise ApiError("forbidden", "서비스 카드 배포 신청은 프로젝트장이 합니다")
        await sync_model_approvals(conn)
        m = await conn.fetchrow("SELECT id, status, name, task, classes FROM models WHERE id=$1", mid) if mid else None
        if not m:
            raise ApiError("not_found", "모델이 없습니다")
        if m["status"] != "registered":
            raise ApiError("conflict", "등록된 모델로만 서비스를 만듭니다", {"status": m["status"]}, 409)
        # 찾는 분류(데이터-1 · 10-07) — 모델이 더 많은 분류를 내도(예: 4분류 원판) 이 서비스는 고른 분류만 결과로 남긴다(분석 작업 options.classes)
        want = body.get("classes")
        if want is not None:
            if not isinstance(want, list) or not want or not all(isinstance(x, str) and x.strip() for x in want):
                raise ApiError("bad_request", "classes 는 분류 이름 목록")
            have = {str(c).strip().split("_")[0] for c in (m["classes"] or [])}
            off = [x for x in want if x.strip().split("_")[0] not in have]
            if off:
                raise ApiError("bad_request", "이 모델이 찾지 않는 분류입니다: " + ", ".join(off), {"classes": off})
            want = [x.strip() for x in want]
        if rules:
            ok = {r["id"]: r["name"] for r in await conn.fetch("SELECT id, name FROM survey_rules WHERE id = ANY($1::text[])", rules)}
            bad = [x for x in rules if x not in ok]
            if bad:
                raise ApiError("bad_request", "없는 규칙", {"rules": bad})
            fit = rules_fit(m["classes"] or [])
            off = [x for x in rules if not fit.get(x)]
            if off:        # 모델이 찾지 않는 대상의 규칙(예: 곤포사일리지 모델 + 휴경·전용) — 모든 필지가 '부재'로 걸리는 뜻 없는 의심을 막는다
                raise ApiError("bad_request", "이 모델이 찾지 않는 대상의 규칙입니다: " + ", ".join(ok[x] for x in off), {"rules": off})
        if body.get("ledger_schema"):
            schema = clean_schema(body["ledger_schema"])
        else:
            kind = body.get("ledger_kind")
            src = await conn.fetchval("SELECT ledger_schema FROM cards WHERE ledger_schema->>'kind'=$1 ORDER BY id LIMIT 1", kind) if kind else None
            if not src:
                from .ledger import KINDS
                raise ApiError("bad_request", "대장 형식을 골라 주세요", {"allowed": list(KINDS)})
            schema = src
        prev_card = await conn.fetchval("SELECT ref FROM project_links WHERE project_id=$1 AND kind='card' ORDER BY at LIMIT 1", pid) if pid else None
        if prev_card:                               # 같은 프로젝트의 다음 회차 — 같은 카드의 새 판(이미 대기 중인 판이 있으면 거절)
            wait_cv = await conn.fetchval("SELECT a.subject_id FROM approvals a JOIN project_links l ON l.kind='card_version' AND l.ref=a.subject_id "
                                          "AND l.project_id=$1 WHERE a.subject_type='card' AND a.state='pending' LIMIT 1", pid)
            if wait_cv:
                raise ApiError("conflict", "공개 승인을 기다리는 판이 있습니다", {"card_version_id": wait_cv}, 409)
            cid = prev_card
            nums = [float(v) for v in [x["version"] for x in await conn.fetch("SELECT version FROM card_versions WHERE card_id=$1", cid)]
                    if re.fullmatch(r"\d+(\.\d+)?", str(v or ""))]
            ver = f"{int(max(nums, default=0)) + 1}.0"
            cv = f"{cid}@{ver}"
            last_round = await conn.fetchval("SELECT max(round) FROM project_links WHERE project_id=$1 AND kind='card_version'", pid) or 1
            note = f"{prj['round']}차 재학습" if prj["round"] > last_round else "공개 다시 요청"
            note = str(body.get("changelog") or "").strip()[:120] or note      # 바뀐 점 한 줄(예: 모델을 원판으로 되돌림)
            await conn.execute("INSERT INTO card_versions(id, card_id, version, model_ids, modules, changelog, approved_by, approved_at) "
                               "VALUES ($1,$2,$3,$4,$5,$6,NULL,NULL)", cv, cid, ver, [mid],
                               {"core": CORE_MODULES, "ext": {"mod-parcel": bool(rules)}, "rules": rules, **({"classes": want} if want else {})}, note)
        else:
            cid = "card-" + secrets.token_hex(3)
            while await conn.fetchval("SELECT 1 FROM cards WHERE id=$1", cid):
                cid = "card-" + secrets.token_hex(3)
            domain = str(body.get("domain") or name)[:80]
            await conn.execute("INSERT INTO cards(id, name, scope, domain, kind, status_history, portable, ledger_schema) "
                               "VALUES ($1,$2,'local',$3,$4,'검토',true,$5)", cid, {"ko": name, "en": name}, domain,
                               json.dumps({"input": ["ortho"], "output": ["polygon"], "viz": ["layer", "chart"]}), schema)
            cv = f"{cid}@1.0"
            # 서비스 공개 = LX 관리자 승인 뒤(확인 D2-ⓐ · impl-1) — 만든 직원을 승인자로 적지 않는다. 승인자는 결재함에서 승인한 관리자(approvals.decide)
            await conn.execute("INSERT INTO card_versions(id, card_id, version, model_ids, modules, changelog, approved_by, approved_at) "
                               "VALUES ($1,$2,'1.0',$3,$4,$5,NULL,NULL)", cv, cid, [mid],
                               {"core": CORE_MODULES, "ext": {"mod-parcel": bool(rules)}, "rules": rules, **({"classes": want} if want else {})}, "서비스 만들기")
        if prj:                                     # 발행 요청이 어느 프로젝트에서 왔나 · 카드의 담당 = 그 프로젝트장
            from .projects import link
            await link(conn, pid, "card", cid, p.user_id)
            await link(conn, pid, "card_version", cv, p.user_id)
        aid = "ap_" + secrets.token_hex(6)
        mname = await conn.fetchval("SELECT name->>'ko' FROM models WHERE id=$1", mid)
        rnames = [r["name"] for r in await conn.fetch("SELECT name FROM survey_rules WHERE id = ANY($1::text[]) ORDER BY id", rules)] if rules else []
        await conn.execute("INSERT INTO approvals(id, subject_type, subject_id, requested_by, state, payload, reason, tenant_id, at) "
                           "VALUES ($1,'card',$2,$3,'pending',$4,$5,'lx',now())", aid, cv, p.user_id,
                           {"action": "publish", "card_id": cid, "name": name, "model_name": mname, "rules": rnames,
                            "ledger_kind": schema.get("kind"), **({"classes": want} if want else {}),
                            **({"project_id": pid, "project_name": prj["name"], "owner": p.name, "version": cv.split("@")[-1]} if prj else {})},
                           str(body.get("reason") or "").strip()[:200] or (note if prev_card else "서비스 공개"))
        # 규칙을 고른 서비스 = 필지 대조(실태조사까지 · 고른 규칙만). 규칙이 없으면 AI 분석까지만(탐지 서비스)
        await audit(conn, p, "card.create", cid, None, {"card_version_id": cv, "model_id": mid, "rules": rules, "classes": want, "ledger_kind": schema.get("kind"),
                                                        "approval_id": aid, "project_id": pid})
    from .jobs import ops_event
    await ops_event("deploy.changed", {"card_id": cid, "action": "card.create", "by": p.user_id, "at": now_iso()})
    await ops_event("approval.requested", {"approval_id": aid, "subject_type": "card", "subject_id": cv, "by": p.user_id, "at": now_iso()})
    return {"id": cid, "name": name, "card_version_id": cv, "models": [mid], "rules": rules, "ledger_schema": schema,
            "approval_id": aid, "publish": "pending", "project_id": pid, "as_of": now_iso()}


@router.put("/registry/cards/{cid}/ledger_schema")
async def put_ledger_schema(cid: str, body: dict, request: Request):
    """대장 스키마(반입 자동 인식 템플릿) — {kind, columns:[{key, label, role}]} · LX staff/admin. 성명 열 역할 없음."""
    p = require(principal(request), lx=True)
    if p.role not in ("staff", "admin"):
        raise ApiError("forbidden", "LX 영업 계정은 읽기 전용")
    schema = None if body.get("clear") else clean_schema(body)
    async with db(realm="lx") as conn:
        before = await conn.fetchval("SELECT ledger_schema FROM cards WHERE id=$1", cid)
        if before is None and not await conn.fetchval("SELECT 1 FROM cards WHERE id=$1", cid):
            raise ApiError("not_found", f"card {cid} 없음")
        await conn.execute("UPDATE cards SET ledger_schema=$2 WHERE id=$1", cid, schema)
        await audit(conn, p, "card.ledger_schema", cid, before, schema)
    return {"id": cid, "ledger_schema": schema, "as_of": now_iso()}


# 학습 계보(표본 → 학습 → 모델)는 모델 카드(models.card_url → card.json 의 dataset{path, label, run})에서 읽는다 — 지역 고정 문자열 0.
# 카드가 없는 모델만 여기(지역과 무관한 항목).
DATASETS_NO_CARD = {
    "car_v2_obb": ("E:/drone_runs/car_v2_obb/dataset", "드론 차량 OBB 약 18만 장", "car_v2_obb/run"),
    "unsupervised-change": (None, "비지도 변화 지수(학습 없음)", None),
}


def _dataset_of(card_url: str | None, mid: str) -> tuple | None:
    if card_url and card_url.startswith("/files/"):
        f = config.DATA_ROOT / card_url[len("/files/"):]
        try:
            c = json.loads(f.read_text(encoding="utf-8"))
        except Exception:
            c = None
        ds = (c or {}).get("dataset")
        if ds:
            return ds.get("path"), ds.get("label"), ds.get("run")
    return DATASETS_NO_CARD.get(mid)


@router.get("/registry/lineage/{deploy_id}")
async def lineage(deploy_id: str, request: Request):
    p = require(principal(request))
    async with db(p) as conn:
        d = await conn.fetchrow("SELECT id, tenant_id, card_version_id, model_override FROM deploys WHERE id=$1", deploy_id)
        if not d:
            raise ApiError("not_found", f"deploy {deploy_id} 없음")
    async with db(realm="lx") as conn:
        cv = await conn.fetchrow("SELECT id, model_ids FROM card_versions WHERE id=$1", d["card_version_id"])
        jobs = await conn.fetch("SELECT id, label, shards_total FROM jobs WHERE deploy_id=$1 ORDER BY created_at DESC LIMIT 3", deploy_id)
        mids = ([d["model_override"]] if d["model_override"] else []) or list((cv["model_ids"] if cv else []) or [])
        if not d["model_override"] and jobs:            # 적용 흐름이 고른 모델(작업 기록) — 카드 모델과 다를 수 있다(영상 해상도에 맞춤)
            jm = await conn.fetchval("SELECT model_id FROM jobs WHERE id=$1", jobs[0]["id"])
            if jm and jm not in mids:
                mids = [jm]
        cards = {r["id"]: r["card_url"] for r in await conn.fetch("SELECT id, card_url FROM models WHERE id = ANY($1::text[])", mids)}
        snap = await conn.fetchval("SELECT snapshot_current FROM deploys WHERE id=$1", deploy_id)
    chain = []
    for mid in mids:
        ds = _dataset_of(cards.get(mid), mid)
        if ds and ds[0]:
            chain.append({"kind": "dataset", "id": ds[0], "label": ds[1]})
        if ds and ds[2]:
            chain.append({"kind": "run", "id": ds[2]})
        chain.append({"kind": "model", "id": mid})
    if cv:
        chain.append({"kind": "card_version", "id": cv["id"]})
    chain.append({"kind": "deploy", "id": deploy_id})
    chain.append({"kind": "tenant", "id": d["tenant_id"]})
    for j in jobs:
        chain.append({"kind": "job", "id": j["id"], "label": j["label"] or f"{j['shards_total']} shard"})
    if not jobs and snap:                               # 작업 기록 이전의 결과(시드 스냅샷) — 결과 세트만 잇는다
        chain.append({"kind": "result", "id": snap})
    return {"chain": chain, "as_of": now_iso()}


# 서비스 카드 한 벌(구현 3차 · 확인 대장 14차 카드-1 ⓐ · 길-1 ⓑ) — 카드 정보 · 서비스 카드 관리 · 카드로 분석(landxi_api/cards.py).
# 레지스트리 라우터에 붙여 main.py 를 고치지 않는다. 불러오기에 실패해도 게이트웨이는 뜬다(로그 한 줄).
try:
    from . import cards as _cards
    router.include_router(_cards.router)
except Exception as _e:  # noqa: BLE001
    import logging as _logging
    _logging.getLogger("landxi").warning("cards router 건너뜀: %r", _e)


# 기관 분기 공간 1단(구현 3차 · 확인 대장 13차 분기-2 · 분기-3 ⓒ 1단 · 8차 API-형식 ⓐ) — 우리 공간(결과 설명서 · 내려받기 · 공간 안 알림) ·
# LX 관리자 '기관 공간' 목록(landxi_api/spaces.py). 같은 방식으로 붙인다 — 불러오기에 실패해도 게이트웨이는 뜬다(로그 한 줄).
try:
    from . import spaces as _spaces
    router.include_router(_spaces.router)
except Exception as _e:  # noqa: BLE001
    import logging as _logging
    _logging.getLogger("landxi").warning("spaces router 건너뜀: %r", _e)


# 못 한 요청 → 서비스 개선 고리(구현 4차 · 확인 대장 16차 개선-1 · 원칙 98) — 화면 신호(/assist/feedback) · '이제 됩니다'(/assist/notices) ·
# LX 관리자 서비스 관리 '개선 후보'(/improve/items · landxi_api/improve.py). 같은 방식으로 붙인다 — 불러오기에 실패해도 게이트웨이는 뜬다(로그 한 줄).
try:
    from . import improve as _improve
    router.include_router(_improve.router)
except Exception as _e:  # noqa: BLE001
    import logging as _logging
    _logging.getLogger("landxi").warning("improve router 건너뜀: %r", _e)
