"""레지스트리 · 계보(F1-CONTRACT §4.6) — models · cards · card_versions · lineage."""
from __future__ import annotations

from fastapi import APIRouter, Request

from .deps import ApiError, db, principal, require
from .envelope import now_iso

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


@router.get("/registry/cards")
async def cards(request: Request):
    require(principal(request), lx=True)
    async with db(realm="lx") as conn:
        cs = await conn.fetch("SELECT id, name, scope, domain, kind, status_history, portable FROM cards ORDER BY id")
        vs = await conn.fetch("SELECT id, card_id, version, model_ids, modules FROM card_versions ORDER BY id")
    items = []
    for c in cs:
        mine = [v for v in vs if v["card_id"] == c["id"]]
        mods = (mine[-1]["modules"] if mine else None) or {}
        items.append({"id": c["id"], "name": (c["name"] or {}).get("ko") if isinstance(c["name"], dict) else c["name"],
                      "scope": c["scope"], "status": c["status_history"],
                      "versions": [v["id"] for v in mine], "modules": {"core": mods.get("core", []), "ext": mods.get("ext", [])}})
    return {"items": items, "total": len(items), "as_of": now_iso()}


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
