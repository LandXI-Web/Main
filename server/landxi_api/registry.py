"""레지스트리 · 계보(F1-CONTRACT §4.6) — models · cards · card_versions · lineage."""
from __future__ import annotations

from fastapi import APIRouter, Request

from .deps import ApiError, audit, db, principal, require
from .envelope import env, now_iso

router = APIRouter()
MODEL_COLS = "id, family, version, weights_uri, task, classes, input, gsd_trained_m, metrics, perf, status, image, tile_size, infer_shape, card_url, adapter"


def model_dict(r) -> dict:
    return {"id": r["id"], "family": r["family"], "task": r["task"], "classes": r["classes"] or [], "weights_uri": r["weights_uri"],
            "input": r["input"] or [], "gsd_trained_m": float(r["gsd_trained_m"]) if r["gsd_trained_m"] is not None else None,
            "tile_size": r["tile_size"], "infer_shape": list(r["infer_shape"]) if r["infer_shape"] else None, "image": r["image"],
            "metrics": r["metrics"] or {}, "perf": r["perf"], "status": r["status"], "card_url": r["card_url"]}


@router.get("/registry/models")
async def models(request: Request):
    require(principal(request), lx=True)
    async with db(realm="lx") as conn:
        rows = await conn.fetch(f"SELECT {MODEL_COLS} FROM models ORDER BY id")
    return {"items": [model_dict(r) for r in rows], "total": len(rows), "as_of": now_iso()}


@router.get("/registry/models/{mid:path}")
async def model(mid: str, request: Request):
    require(principal(request), lx=True)
    async with db(realm="lx") as conn:
        r = await conn.fetchrow(f"SELECT {MODEL_COLS} FROM models WHERE id=$1", mid)
    if not r:
        raise ApiError("not_found", f"model {mid} 없음")
    return model_dict(r)


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
            items.append({"id": c["id"], "name": name, "scope": c["scope"], "status": st, "status_label": STATUS_LABEL[st],
                          "intro": c["intro"], "crop_url": c["crop_url"], "deploys": [d["id"] for d in live]})
            continue
        mods = (mine[-1]["modules"] if mine else None) or {}
        items.append({"id": c["id"], "name": name, "scope": c["scope"], "status": c["status_history"], "status3": st, "status_label": STATUS_LABEL[st],
                      "versions": [v["id"] for v in mine], "modules": {"core": mods.get("core", []), "ext": mods.get("ext", [])},
                      "models": list((mine[-1]["model_ids"] if mine else None) or []),
                      "ledger_schema": c["ledger_schema"], "intro": c["intro"], "crop_url": c["crop_url"],
                      "deploys": [{"id": d["id"], "stage": d["stage"], "tenant_id": d["tenant_id"]} for d in dps if not d["test"]]})
    return {"items": items, "total": len(items), "n": env(len(items), "count", "recorded", "cards" + (" · 실결과 있는 배포본" if pub else "")), "public": pub,
            "as_of": now_iso()}


ROLES_OK = {"pnu", "jibun", "emd", "ri", "bon", "bu", "san", "status", "use", "date", "area", "permit_no", "owner_type", "lon", "lat"}


@router.put("/registry/cards/{cid}/ledger_schema")
async def put_ledger_schema(cid: str, body: dict, request: Request):
    """대장 스키마(반입 자동 인식 템플릿) — {kind, columns:[{key, label, role}]} · LX staff/admin. 성명 열 역할 없음."""
    p = require(principal(request), lx=True)
    if p.role not in ("staff", "admin"):
        raise ApiError("forbidden", "LX 영업 계정은 읽기 전용")
    from .ledger import KINDS, is_pii
    kind = body.get("kind")
    cols = body.get("columns") or []
    if body.get("clear"):
        schema = None
    else:
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
        schema = {"kind": kind, "columns": clean}
    async with db(realm="lx") as conn:
        before = await conn.fetchval("SELECT ledger_schema FROM cards WHERE id=$1", cid)
        if before is None and not await conn.fetchval("SELECT 1 FROM cards WHERE id=$1", cid):
            raise ApiError("not_found", f"card {cid} 없음")
        await conn.execute("UPDATE cards SET ledger_schema=$2 WHERE id=$1", cid, schema)
        await audit(conn, p, "card.ledger_schema", cid, before, schema)
    return {"id": cid, "ledger_schema": schema, "as_of": now_iso()}


DATASETS = {
    "aerial25/best": ("E:/aerial_dataset", "항공 토지피복 15.3만 칩", "aerial_v2_finetune44"),
    "namwon/cultivate_uncultivate/train": ("E:/namwon/cultivate_uncultivate", "남원 경작/비경작 1,825장", "cultivate_uncultivate/train"),
    "namwon/Vinyl_house/train2": ("E:/namwon/Vinyl_house", "남원 비닐하우스 1,956장", "Vinyl_house/train2"),
    "car_v2_obb": ("E:/drone_runs/car_v2_obb/dataset", "드론 차량 OBB 약 18만 장", "car_v2_obb/run"),
    "unsupervised-change": (None, "비지도 변화 지수(학습 없음)", None),
}


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
    chain = []
    mids = ([d["model_override"]] if d["model_override"] else []) or list((cv["model_ids"] if cv else []) or [])
    for mid in mids:
        ds = DATASETS.get(mid)
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
    if deploy_id == "dp-nw-farm-25" and not jobs:
        chain.append({"kind": "job", "id": "P4-2026-09-24", "label": "남원 전역 재추론 22,737칩"})
    return {"chain": chain, "as_of": now_iso()}
