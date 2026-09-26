"""결과(F1-CONTRACT §4.5) — features · shards · stats · PATCH(lx staff) · qa(확장: J1 P/R 봉투).

세트 해석: job_… | results/{tenant}/{job_…} → 그 작업의 detections · results/lx/<이름>(시드 정적 세트) → detections(job_id=세트 id).
기관 세션은 자기 배포본 스냅샷 세트(별칭 포함)와 자기 작업만. 게스트는 export_policy=public·cleared 세트만.
"""
from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.responses import Response

from . import config
from .catalog import canonical_set, layer_items, tenant_result_sets
from .deps import ApiError, Principal, audit, db, principal, require
from .envelope import RawJSON, env, now_iso

router = APIRouter()
FEATURE_COLS = ("id, fid, cls, cls_en, cid, conf, area_m2, emd, emd_cd, pnu, edit_state, job_id, shard_id, chip_edge, "
                "ST_AsGeoJSON(geom, 7)::json AS g")


async def resolve(p: Principal, set_or_job: str) -> dict:
    """→ {job_id(detections 키), tenant, demo, kind('job'|'static'), set}"""
    s = canonical_set(set_or_job)
    job_id = None
    if s.startswith("job_"):
        job_id = s
    elif s.startswith("results/") and s.split("/")[-1].startswith("job_"):
        job_id = s.split("/")[-1]
    if job_id:
        async with db(realm="lx") as conn:
            j = await conn.fetchrow("SELECT id, tenant_id, demo, result_set, submitted_by FROM jobs WHERE id=$1", job_id)
        if not j:
            raise ApiError("not_found", f"job {job_id} 없음")
        if not p.is_lx and p.tenant_id != j["tenant_id"]:
            raise ApiError("forbidden", "다른 기관의 결과")
        return {"job_id": job_id, "tenant": j["tenant_id"], "demo": j["demo"], "kind": "job", "set": j["result_set"]}
    # 정적 세트
    if not p.is_lx:
        ok = False
        if p.realm == "tenant":
            ok = s in await tenant_result_sets(p.tenant_id) or set_or_job in await tenant_result_sets(p.tenant_id)
        if not ok:
            _, items = await layer_items(p, None)
            ok = any(i["set"] == s and i["role"] == "result" for i in items)
        if not ok:
            raise ApiError("forbidden", "이 세션에서 열 수 없는 결과 세트", {"set": set_or_job})
    return {"job_id": s, "tenant": "lx", "demo": False, "kind": "static", "set": s}


def _feature(r) -> dict:
    return {"type": "Feature", "id": r["fid"] or str(r["id"]), "geometry": r["g"],
            "properties": {"id": r["fid"] or str(r["id"]), "cls": r["cls"], "cls_en": r["cls_en"], "cid": r["cid"],
                           "conf": round(float(r["conf"]), 3) if r["conf"] is not None else None,
                           "area_m2": float(r["area_m2"]) if r["area_m2"] is not None else None, "emd": r["emd"], "emd_cd": r["emd_cd"],
                           "pnu": r["pnu"], "edit_state": r["edit_state"], "job_id": r["job_id"], "shard_id": r["shard_id"],
                           "chip_edge": r["chip_edge"]}}


@router.get("/results/{set_path:path}/features")
async def features(set_path: str, request: Request, bbox: str | None = None, cls: str | None = None, limit: int = 2000,
                   offset: int = 0, min_conf: float | None = None):
    p = principal(request)
    rs = await resolve(p, set_path)
    bb = [float(v) for v in bbox.split(",")] if bbox else None
    limit = max(1, min(limit, 10000))
    where = ["job_id=$1", "edit_state <> 'deleted'"]
    args: list = [rs["job_id"]]
    if bb:
        args.append(bb)
        where.append(f"geom && ST_MakeEnvelope(${len(args)}[1], ${len(args)}[2], ${len(args)}[3], ${len(args)}[4], 4326)")
    if cls:
        args.append(cls.split(","))
        where.append(f"(cls = ANY(${len(args)}) OR cls_en = ANY(${len(args)}))")
    if min_conf is not None:
        args.append(min_conf)
        where.append(f"conf >= ${len(args)}")
    w = " AND ".join(where)
    async with db(realm="lx") as conn:
        total = await conn.fetchval(f"SELECT count(*) FROM detections WHERE {w}", *args)
        rows = await conn.fetch(f"SELECT {FEATURE_COLS} FROM detections WHERE {w} ORDER BY id LIMIT {limit} OFFSET {int(offset)}", *args)
    basis = "demo" if rs["demo"] else "inferred"
    fc = {"type": "FeatureCollection", "features": [_feature(r) for r in rows],
          "lx": {"count": env(int(total), "count", basis, f"detections(job_id={rs['job_id']})",
                              "필터 적용 · 검수 전" if (bb or cls or min_conf) else "검수 전"),
                 "total": int(total), "limit": limit, "offset": offset}}
    return RawJSON(fc)


def _shard_dir(tenant: str, job_id: str, demo: bool) -> Path:
    if demo:
        return config.DATA_ROOT / "cache" / "demo" / job_id / "shards"
    return config.DATA_ROOT / "results" / tenant / job_id / "shards"


@router.get("/results/{job_id}/shards/{shard_file}")
async def shard_geojson(job_id: str, shard_file: str, request: Request, exp: str | None = None, sig: str | None = None):
    """세션(Bearer) 또는 shard.done 이 준 서명 쿼리(exp·sig · 12h) — 프론트는 헤더 없이 fetch 한다."""
    from .tiles import verify
    p = principal(request)
    if verify(f"shards/{job_id}", exp, sig):
        async with db(realm="lx") as conn:
            j = await conn.fetchrow("SELECT id, tenant_id, demo FROM jobs WHERE id=$1", job_id)
        if not j:
            raise ApiError("not_found")
        rs = {"job_id": job_id, "tenant": j["tenant_id"], "demo": j["demo"]}
    else:
        rs = await resolve(require(p), job_id)
    if not shard_file.endswith(".geojson") or "/" in shard_file or ".." in shard_file:
        raise ApiError("not_found")
    f = _shard_dir(rs["tenant"], rs["job_id"], rs["demo"]) / shard_file
    if not f.exists():
        raise ApiError("not_found", f"shard {shard_file} 없음")
    return Response(content=f.read_bytes(), media_type="application/geo+json", headers={"Cache-Control": "private, max-age=86400"})


@router.get("/results/{set_path:path}/stats")
async def stats(set_path: str, request: Request, by: str = "emd"):
    p = principal(request)
    rs = await resolve(p, set_path)
    if rs["set"] in ("results/lx/namwon-landcover-2023",) and by in ("emd", "cls"):
        src = "results/namwon-landcover-2023-emd-stats.json"
        d = json.loads((config.DATA_ROOT / src).read_text(encoding="utf-8"))
        items = []
        if by == "emd":
            for nm, e in d["by_emd"].items():
                for cls_, v in e.items():
                    if not isinstance(v, dict):
                        continue
                    items.append({"key": nm, "cd": e.get("cd"), "cls": cls_,
                                  "n": env(v["n"], "polygons", "inferred", src, "검수 전", as_of="2026-09-24"),
                                  "area_ha": env(v["area_ha"], "ha", "inferred", src, as_of="2026-09-24"),
                                  "conf_mean": env(None, "ratio", "inferred", src, "읍면동별 평균 conf 없음(전체만)", as_of="2026-09-24")})
        else:
            for cls_, v in d["total"].items():
                items.append({"key": cls_, "cd": None, "n": env(v["n"], "polygons", "inferred", src, as_of="2026-09-24"),
                              "area_ha": env(v["area_ha"], "ha", "inferred", src, as_of="2026-09-24"),
                              "conf_mean": env(v["conf_mean"], "ratio", "inferred", src, as_of="2026-09-24")})
        tn = sum(v["n"] for v in d["total"].values())
        ta = sum(v["area_ha"] for v in d["total"].values())
        return {"items": items, "total": {"n": env(tn, "polygons", "inferred", src, "검수 전", as_of="2026-09-24"),
                                          "area_ha": env(round(ta, 2), "ha", "inferred", src, as_of="2026-09-24")},
                "source": src, "as_of": now_iso()}
    key = "emd" if by == "emd" else "cls"
    async with db(realm="lx") as conn:
        rows = await conn.fetch(f"SELECT {key} AS k, max(emd_cd) AS cd, count(*) AS n, sum(area_m2)/1e4 AS ha, avg(conf) AS c "
                                f"FROM detections WHERE job_id=$1 AND edit_state<>'deleted' GROUP BY {key} ORDER BY n DESC", rs["job_id"])
    basis = "demo" if rs["demo"] else "inferred"
    src = f"detections(job_id={rs['job_id']}) GROUP BY {key}"
    items = [{"key": r["k"], "cd": r["cd"] if by == "emd" else None, "n": env(int(r["n"]), "count", basis, src),
              "area_ha": env(round(float(r["ha"] or 0), 3), "ha", basis, src),
              "conf_mean": env(round(float(r["c"] or 0), 3), "ratio", basis, src)} for r in rows]
    return {"items": items, "total": {"n": env(sum(int(r["n"]) for r in rows), "count", basis, src),
                                      "area_ha": env(round(sum(float(r["ha"] or 0) for r in rows), 3), "ha", basis, src)},
            "source": src, "as_of": now_iso()}


@router.patch("/results/{job_id}/features/{fid}")
async def patch_feature(job_id: str, fid: str, body: dict, request: Request):
    p = require(principal(request), lx=True, roles=("staff", "admin"))
    rs = await resolve(p, job_id)
    state = body.get("edit_state", "edited")
    if state not in ("edited", "deleted", "raw"):
        raise ApiError("bad_request", "edit_state edited|deleted|raw")
    async with db(realm="lx") as conn:
        row = await conn.fetchrow(f"SELECT {FEATURE_COLS} FROM detections WHERE job_id=$1 AND (fid=$2 OR id::text=$2)", rs["job_id"], fid)
        if not row:
            raise ApiError("not_found", f"feature {fid} 없음")
        sets, args = ["edit_state=$3", "edited_by=$4"], [rs["job_id"], fid, state, p.user_id]
        if body.get("geometry"):
            args.append(json.dumps(body["geometry"]))
            sets.append(f"geom=ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(${len(args)}),4326))")
            sets.append("area_m2=round(ST_Area(ST_Transform(ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($%d),4326)),5186))::numeric,1)" % len(args))
        if body.get("cls"):
            args.append(body["cls"])
            sets.append(f"cls=${len(args)}")
        await conn.execute(f"UPDATE detections SET {', '.join(sets)} WHERE job_id=$1 AND (fid=$2 OR id::text=$2)", *args)
        new = await conn.fetchrow(f"SELECT {FEATURE_COLS} FROM detections WHERE job_id=$1 AND (fid=$2 OR id::text=$2)", rs["job_id"], fid)
        await audit(conn, p, "result.patch", f"{rs['job_id']}/{fid}", {"edit_state": row["edit_state"], "cls": row["cls"]},
                    {"edit_state": state, "cls": new["cls"]})
    return RawJSON(_feature(new))


@router.get("/results/{job_id}/qa")
async def qa(job_id: str, request: Request):
    """확장(계약 변경 요청 §B-1): J1 정답 대비 P/R 봉투 — results/lx/{job}/qa.json."""
    p = require(principal(request))
    rs = await resolve(p, job_id)
    f = config.DATA_ROOT / "results" / rs["tenant"] / rs["job_id"] / "qa.json"
    if rs["demo"]:
        f = config.DATA_ROOT / "cache" / "demo" / rs["job_id"] / "qa.json"
    if not f.exists():
        raise ApiError("not_found", "qa 없음(GT 없는 영상이거나 스냅샷 전)")
    return json.loads(f.read_text(encoding="utf-8"))
