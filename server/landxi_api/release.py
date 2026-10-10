"""분석 서비스 배포 — 추론 · 배포 신청 · 승인 · 기관 공유 · 사용 현황(확인 대장 배포-1 · 2 · 3 ⓐ · 4 · 5 · 원칙 151 · 152 · 158 · 159 · 160).

LX 직원(프로젝트 안 · 프로젝트장 · 구성원):
GET  /release/projects/{pid}/infer                   추론 탭 — 이 프로젝트에서 학습한 모델(판) · 영상(프로젝트 지역 영상 · 공유 데이터셋) · 이 프로젝트 추론 결과 목록
GET  /release/projects/{pid}/infer/ranges?imagery_id 그 영상 안 읍면동(작은 범위로 먼저 돌려 볼 때) — 영상과 겹치는 면적
POST /release/projects/{pid}/infer                   {model_id, imagery_id, emd_cd?} → 지금 있는 분석 작업(POST /jobs · 게이트웨이 작업 대기열 · 전력 규칙)
                                                     작업 options.project_id · project_infer = 이 프로젝트의 추론(배포 신청 없이 · 보는 사람 = 나 · 프로젝트 참여자)
GET  /release/imagery/{iid}/thumb                    영상 미리보기(원칙 153 — 카탈로그 썸네일과 같은 그림 · LX 직원도)
GET  /release/projects/{pid}/apply                   배포 신청서 — 서버 값(모델 · 검증 정확도 · 결과 장면 · 학습 데이터 · 결과 확인) · 지난 판 · 신청 상태 · 판 기록
POST /release/projects/{pid}/apply                   {model_id, memo?, scene_job?, name?, ledger_kind?} 프로젝트장 — 승인 요청 한 줄(approvals subject card · 지금 있는 서비스 공개 승인 흐름)
                                                     거절된 판이면 같은 판을 고쳐서 다시 신청(새 승인 요청 줄) · 아니면 새 판(첫 판이면 새 서비스)
LX 관리자('배포' 메뉴 세 탭):
GET  /release/requests                               신청 — 배포 신청(승인 요청 · 서비스 공개) 목록 + 신청서. 승인 · 거절 = POST /approvals/{id}/decide(거절 사유 필수 · 지금 있는 길)
GET  /release/shares                                 공유 — 승인된 서비스 × 기관 체크 표(지금 상태 = 기관 '서비스 선택'과 같은 판정 brand._services)
PUT  /release/shares                                 {card_id, tenant_id, shared, test?} 한 칸 켜고 끄기(card_shares 에 한 줄씩 쌓는다)
GET  /release/usage                                  사용 현황 — 기관 × 공유한 서비스: LX가 돌린 분석(횟수 · 면적 · 마지막) · 기관이 요청한 분석 + 기관 합계 + 요약(대시보드 칸)
숫자는 모두 서버 기록(분석 작업 · 승인 요청 · 모델 학습 끝 검증 · 기관 사용량 quota.usage_of)에서. 지어낸 값 0.
"""
from __future__ import annotations

import datetime as dt

from fastapi import APIRouter, Request
from starlette.concurrency import run_in_threadpool

from . import projects as PJ
from .deps import ApiError, audit, db, principal, require
from .envelope import KST, env, now_iso

router = APIRouter()
ACC_KEYS = ("mask_mAP50", "metrics/mAP50(M)", "box_mAP50", "metrics/mAP50(B)", "mAP50")
XI = "/landxi/v3/xi-clean/"   # XI맵(전국 · 해외 실시간 분석) — 추론 결과 보기는 지도 서비스로 옮겼다(MAPSVC)
MAPSVC = "/landxi/v3/lx-map/"   # 지도 서비스(원칙 149 · 163) — 추론 '결과 보기'는 XI맵이 아니라 여기로
MEMO_MAX = 300
# 추론 설정(질문 6 ⓐ — 추론 탭 '설정'을 펼치면 두 가지만 · 바꾸면 그 작업에만). 기본값 = 지금까지 서버에 고정이던 값(conf 0.25 · 후처리 최소 넓이 4㎡)
INFER_DEFAULT = {"conf": 0.25, "min_area_m2": 4.0}
INFER_LIMIT = {"conf": (0.05, 0.95), "min_area_m2": (0.0, 500.0)}


def infer_settings(body: dict) -> dict:
    """화면이 보낸 신뢰도 기준 · 최소 크기 → 작업 옵션. 안 보내면 기본값 · 범위 밖이면 사람 말로 거절."""
    out = {}
    for k, (lo, hi) in INFER_LIMIT.items():
        v = body.get(k)
        if v is None or v == "":
            out[k] = INFER_DEFAULT[k]
            continue
        try:
            f = float(v)
        except (TypeError, ValueError):
            f = None
        if f is None or not (lo <= f <= hi):
            raise ApiError("bad_request", "신뢰도 기준은 0.05~0.95 사이로 적어 주세요" if k == "conf" else "최소 크기는 0~500㎡ 사이로 적어 주세요", {"field": k})
        out[k] = round(f, 3)
    return out
ROLE_WORD = {"admin": "LX 관리자", "staff": "LX 직원", "sales": "LX 영업"}


def _iso(v):
    return v.astimezone(KST).isoformat(timespec="seconds") if v else None


def _ko(v) -> str | None:
    return (v or {}).get("ko") if isinstance(v, dict) else v


def acc_of(metrics) -> int | None:
    """학습 끝 검증 값(마스크 기준 먼저 — 분석하기 카드와 같은 출처) → 백분율 정수."""
    mt = metrics or {}
    for k in ACC_KEYS:
        x = mt.get(k)
        v = x.get("value") if isinstance(x, dict) else x
        try:
            if v is not None:
                return round(float(v) * 100)
        except (TypeError, ValueError):
            continue
    return None


def _acc_at(metrics) -> str | None:
    mt = metrics or {}
    for k in ACC_KEYS:
        x = mt.get(k)
        if isinstance(x, dict) and x.get("value") is not None:
            return str(x.get("as_of") or "")[:10] or None
    return None


def acc_env(metrics, source: str = "학습 끝 검증(마스크 기준 · 분석하기 카드와 같은 출처)") -> dict:
    at = _acc_at(metrics)
    return env(acc_of(metrics), "%", "measured", source, as_of=at or None)


def low_acc(acc: dict | None, base: dict | None, prev: dict | None) -> list[dict]:
    """질문 9 ⓑ — 이번 판 정확도가 기반 모델 · 지난 판보다 낮으면 경고 거리(막지 않는다 · 관리자가 보고 판단). 값이 없으면 비교하지 않는다."""
    v = (acc or {}).get("value")
    out = []
    if v is None:
        return out
    for who, e in (("기반 모델", (base or {}).get("acc")), ("지난 판", prev)):
        w = (e or {}).get("value") if isinstance(e, dict) else None
        if w is not None and v < w:
            out.append({"who": who, "acc": e})
    return out


def low_line(low: list[dict]) -> str | None:
    if not low:
        return None
    parts = " · ".join(f"{x['who']} {x['acc']['value']}%" for x in low)
    return f"이번 판 정확도가 {parts}보다 낮습니다"


async def _union_km2(job_ids: list[str]) -> float:
    """분석한 면적(나중 1 ⓑ) — 같은 곳을 여러 번 분석해도 한 번: 작업 범위 ∩ 영상 자리의 합집합 넓이(㎢). 범위 없는 작업은 빼지 않고 0."""
    async with db(realm="lx") as conn:
        v = await conn.fetchval(
            "SELECT ST_Area(ST_Union(CASE WHEN i.footprint IS NULL THEN ST_MakeValid(j.aoi) "
            "ELSE ST_Intersection(ST_MakeValid(j.aoi), ST_MakeValid(i.footprint)) END)::geography) / 1e6 "
            "FROM jobs j LEFT JOIN imagery i ON i.id = j.imagery_id WHERE j.id = ANY($1::text[]) AND j.aoi IS NOT NULL", job_ids)
    return float(v or 0)


def model_label(name, metrics) -> str:
    """모델 이름 — 이름이 없으면 학습 끝 검증 날로('학습 2026.05.16' · 분석하기 카드와 같은 말)."""
    n = _ko(name)
    if n:
        return n
    at = _acc_at(metrics)
    return f"학습 {at.replace('-', '.')}" if at else "기본 모델"


_CODE = __import__("re").compile(r"\s*\((?:[가-힣A-Za-z]+-\d+[^)]*)\)|확인 대장\s+\S+-\d+\s*(?:\([^)]*\)\s*)?(?:사용자 확인\s*(?:\([^)]*\))?\s*)?(?:—\s*)?")


def plain(t: str | None) -> str | None:
    """사람 말만 — 기록 글에 섞인 내부 확인 번호('(데이터-1)' · '확인 대장 데이터-1 …')는 화면에 내지 않는다(사용자 규칙 6)."""
    if not t:
        return t
    return __import__("re").sub(r"\s{2,}", " ", _CODE.sub(" ", str(t))).strip(" ·—") or None


def _gsd(g) -> str:
    from .deploys import gsd_word
    return gsd_word(g) if g is not None else ""


def _lx(request: Request):
    p = require(principal(request), lx=True)
    if p.role not in ("staff", "admin"):
        raise ApiError("forbidden", "LX 직원 · 관리자만")
    return p


async def _people(conn) -> dict:
    out = {}
    for r in await conn.fetch("SELECT id, role, name FROM lx_users"):
        w = ROLE_WORD.get(r["role"], "LX")
        out[r["id"]] = r["name"] or w
    return out


# ── 공유 기록(brand._services · cards._deck_tenant 가 함께 읽는다) ─────────────────────────────
async def latest_shares(conn, tenant: str | None = None) -> dict:
    """서비스 × 기관의 마지막 공유 줄. tenant 를 주면 {card_id: 줄} · 안 주면 {(card_id, tenant_id): 줄}."""
    rows = await conn.fetch("SELECT DISTINCT ON (card_id, tenant_id) card_id, tenant_id, shared, at, by, test, sgg FROM card_shares "
                            "WHERE ($1::text IS NULL OR tenant_id = $1) ORDER BY card_id, tenant_id, at DESC, id DESC", tenant)
    if tenant:
        return {r["card_id"]: dict(r) for r in rows}
    return {(r["card_id"], r["tenant_id"]): dict(r) for r in rows}


async def share_sgg(conn, tenant: str, card: str | None = None):
    """광역 기관에 공유할 때 고른 소속 시군구(나중 13 ⓐ). card 를 주면 그 서비스의 목록(None = 관할 전체) ·
    안 주면 그 기관에 켜진 공유 줄 전체의 합(하나라도 '관할 전체'면 None) — 결과 지도 · 내려받기가 이 목록 밖 시군구 결과를 내주지 않는다."""
    try:
        last = await latest_shares(conn, tenant=tenant)
    except Exception:  # noqa: BLE001 — 공유 기록 표가 없거나 칸이 없는 DB
        return None
    if card is not None:
        x = last.get(card)
        return list(x["sgg"]) if x and x["shared"] and x.get("sgg") else None
    on = [x for x in last.values() if x["shared"]]
    if not on or any(not x.get("sgg") for x in on):
        return None
    return sorted({c for x in on for c in x["sgg"]})


# ── 프로젝트 · 모델 · 영상 ────────────────────────────────────────────────
async def _member_project(conn, p, pid: str):
    r = await PJ._row(conn, pid)
    members = await PJ._members(conn, pid)
    if not (PJ._is_member(p, r, members) or p.is_admin):
        raise ApiError("forbidden", "이 프로젝트의 프로젝트장 · 구성원만 볼 수 있습니다")
    return r, members


async def _deployed_models(conn, pid: str) -> dict:
    """이 프로젝트 서비스의 승인된 판이 쓰는 모델 → 판 번호(가장 늦은 판)."""
    rows = await conn.fetch("SELECT v.version, v.model_ids, v.approved_at FROM project_links l JOIN card_versions v ON v.id = l.ref "
                            "WHERE l.project_id=$1 AND l.kind='card_version' AND v.approved_by IS NOT NULL ORDER BY v.approved_at", pid)
    out = {}
    for r in rows:
        for m in r["model_ids"] or []:
            out[m] = r["version"]
    return out


async def project_models(conn, pid: str) -> list[dict]:
    """이 프로젝트 표본으로 학습한 모델(학습 작업이 있는 것) — 오래된 것부터 n번째 학습. 새 것이 위."""
    sids = await PJ._sample_ids(conn, pid)
    rows = await conn.fetch("SELECT id, name, status, metrics, classes, gsd_trained_m, input, created_at, sample_id, train_job FROM models "
                            "WHERE sample_id = ANY($1::text[]) AND train_job IS NOT NULL AND coalesce(status,'') <> 'retired' "
                            "ORDER BY created_at NULLS FIRST", sids or ["-"])
    dep = await _deployed_models(conn, pid)
    from .registry import STATUS_MODEL
    # 기반 모델(학습 작업 options.base_model = models.id) — 배포 신청서의 '기반보다 낮음' 경고(질문 9 ⓑ)
    tj = [r["train_job"] for r in rows if r["train_job"]]
    bmap = {x["id"]: x["base"] for x in await conn.fetch("SELECT id, options->>'base_model' AS base FROM jobs WHERE id = ANY($1::text[])", tj or ["-"])}
    bids = [b for b in bmap.values() if b]
    bases = {x["id"]: x for x in await conn.fetch("SELECT id, name, metrics FROM models WHERE id = ANY($1::text[])", bids or ["-"])}
    out = []
    for i, r in enumerate(rows):
        b = bases.get(bmap.get(r["train_job"]) or "")
        out.append({"id": r["id"], "name": model_label(r["name"], r["metrics"]), "n": i + 1, "status": r["status"],
                    "status_label": STATUS_MODEL.get(r["status"] or "", r["status"]),
                    "acc": acc_env(r["metrics"]),
                    "classes": [str(c) for c in (r["classes"] or [])], "gsd_m": float(r["gsd_trained_m"]) if r["gsd_trained_m"] is not None else None,
                    "gsd_word": _gsd(r["gsd_trained_m"]), "at": _iso(r["created_at"]), "sample_id": r["sample_id"],
                    "base": {"id": b["id"], "name": model_label(b["name"], b["metrics"]), "acc": acc_env(b["metrics"])} if b else None,
                    "deployed": dep.get(r["id"])})
    out.reverse()
    return out


async def _imagery(conn, r) -> tuple[list, list]:
    """분석할 수 있는 영상(원본이 있는 정사영상) — 프로젝트 대상 지역과 겹치는 것(프로젝트 영상) · 나머지(공유 데이터셋)."""
    from .regions import derived, region_of
    rows = await conn.fetch("SELECT id, name, kind, gsd_m, year, epoch, sgg_cd, ST_Area(footprint::geography)/1e6 AS km2, "
                            "ST_XMin(footprint) x0, ST_YMin(footprint) y0, ST_XMax(footprint) x1, ST_YMax(footprint) y1 FROM imagery "
                            "WHERE path_internal IS NOT NULL AND footprint IS NOT NULL AND kind = 'ortho' "
                            "AND coalesce(layer->>'role','imagery') = 'imagery' ORDER BY year DESC NULLS LAST, id")
    dv = await derived()
    mine = set()
    for g in r["regions"] or []:
        if g.get("abroad"):
            bb = (PJ._abroad_profiles().get(g["code"]) or {}).get("bbox")
            if bb:
                mine |= {x["id"] for x in await conn.fetch("SELECT id FROM imagery WHERE footprint IS NOT NULL AND "
                                                           "ST_Intersects(footprint, ST_MakeEnvelope($1,$2,$3,$4,4326))", *bb)}
        else:
            mine |= {i["id"] for i in dv["img"].get(g["code"], [])}
    proj, shared = [], []
    for x in rows:
        rg = region_of(x["sgg_cd"]) if x["sgg_cd"] else None
        it = {"id": x["id"], "name": _ko(x["name"]) or x["id"], "gsd_m": float(x["gsd_m"]) if x["gsd_m"] is not None else None,
              "gsd_word": _gsd(x["gsd_m"]), "when": str(x["year"]) if x["year"] else (str(x["epoch"])[:7] if x["epoch"] else None),
              "where": rg["name"] if rg else None, "sgg_cd": rg["sgg_cd"] if rg else x["sgg_cd"],
              "area": env(round(float(x["km2"] or 0), 1), "km2", "measured", "영상 범위(footprint) 면적"),
              "bbox": [round(float(v), 5) for v in (x["x0"], x["y0"], x["x1"], x["y1"])]}
        (proj if x["id"] in mine else shared).append(it)
    return proj, shared


async def _infer_jobs(conn, pid: str, people: dict, limit: int = 30) -> list[dict]:
    """이 프로젝트의 추론 결과(추론 탭에서 돌린 분석) — 새 것이 위. 결과 보기 = XI맵 기록 보기(?job=)."""
    rows = await conn.fetch("SELECT j.id, j.state, j.model_id, j.imagery_id, j.options, j.counts, j.shards_total, j.shards_done, j.submitted_by, "
                            "j.created_at, j.finished_at, j.error, ST_Area(j.aoi::geography)/1e6 AS km2, m.name AS mname, m.metrics AS mmetrics, i.name AS iname, i.sgg_cd "
                            "FROM jobs j LEFT JOIN models m ON m.id = j.model_id LEFT JOIN imagery i ON i.id = j.imagery_id "
                            "WHERE j.kind='infer' AND j.options->>'project_id' = $1 AND NOT coalesce(j.test,false) "
                            "ORDER BY j.created_at DESC LIMIT $2", pid, limit)
    from .deps import redis
    rd = await redis()
    out = []
    for x in rows:
        live = await rd.hgetall(f"job:{x['id']}") if x["state"] in ("queued", "running") else {}
        state = live.get("state") or x["state"]
        done = int(live.get("shards_done") or x["shards_done"] or 0)
        total = int(live.get("shards_total") or x["shards_total"] or 0)
        cnt = x["counts"] or {}
        o = x["options"] or {}
        out.append({"job": x["id"], "state": state, "state_label": {"queued": "대기 중", "running": "분석 중", "done": "끝", "failed": "멈춤",
                                                                     "cancelled": "취소"}.get(state, state),
                    "progress": {"shards_done": done, "shards_total": total} if state in ("queued", "running") else None,
                    "model": {"id": x["model_id"], "name": model_label(x["mname"], x["mmetrics"])},
                    "imagery": {"id": x["imagery_id"], "name": _ko(x["iname"]) or ""},
                    "range": o.get("range_name") or "영상 전체",
                    "settings": {k: o[k] for k in INFER_DEFAULT if o.get(k) is not None and float(o[k]) != INFER_DEFAULT[k]} or None,
                    "area": env(round(float(x["km2"]), 2) if x["km2"] is not None else None, "km2", "measured", "분석 범위 면적"),
                    "found": env(sum(int(v or 0) for v in cnt.values()) if state == "done" else None, "count", "inferred", "AI 분석 결과(검수 전)"),
                    "by": people.get(x["submitted_by"]) if x["submitted_by"] else None,
                    "at": _iso(x["created_at"]), "finished_at": _iso(x["finished_at"]),
                    "href": f"{MAPSVC}?job={x['id']}" if state == "done" else None})
    return out


@router.get("/release/projects/{pid}/infer")
async def infer_view(pid: str, request: Request):
    p = _lx(request)
    async with db(realm="lx") as conn:
        r, members = await _member_project(conn, p, pid)
        models = await project_models(conn, pid)
        proj, shared = await _imagery(conn, r)
        people = await _people(conn)
        jobs = await _infer_jobs(conn, pid, people)
    return {"project": {"id": r["id"], "name": r["name"]}, "models": models, "imagery": {"project": proj, "shared": shared},
            "jobs": jobs, "viewers": env(1 + len([m for m in members if m != r["lead_id"]]), "count", "recorded", "프로젝트장 + 구성원"),
            "can": {"run": PJ._is_member(p, r, members)}, "settings": {"default": INFER_DEFAULT, "limit": INFER_LIMIT}, "as_of": now_iso()}


@router.get("/release/projects/{pid}/infer/ranges")
async def infer_ranges(pid: str, imagery_id: str, request: Request):
    """그 영상 안 읍면동 — 영상과 겹치는 면적이 큰 것부터. 작은 범위로 먼저 돌려 볼 때 고른다."""
    p = _lx(request)
    async with db(realm="lx") as conn:
        await _member_project(conn, p, pid)
        x = await conn.fetchrow("SELECT sgg_cd, ST_AsGeoJSON(footprint)::json AS fp FROM imagery WHERE id=$1", imagery_id)
    if not x or not x["fp"]:
        raise ApiError("not_found", "영상이 없습니다")
    return {"items": await run_in_threadpool(_emds_in, x["sgg_cd"], x["fp"]), "as_of": now_iso()}


def _emds_in(sgg_cd: str | None, fp: dict) -> list[dict]:
    from shapely.geometry import shape
    from . import regions as R
    from workers.tiling import area_km2
    from shapely.geometry import mapping
    if not sgg_cd:
        return []
    ix = R.emd_index(sgg_cd)
    if ix is None:
        return []
    f = shape(fp)
    out = []
    for g, cd, nm in zip(ix.geoms, ix.codes, ix.names):
        if not g.intersects(f):
            continue
        inter = g.intersection(f)
        if inter.is_empty:
            continue
        km2 = area_km2(mapping(inter))
        if km2 < 0.01:
            continue
        out.append({"code": cd, "name": nm, "area": env(round(km2, 2), "km2", "measured", "읍면동 ∩ 영상 범위")})
    out.sort(key=lambda e: -e["area"]["value"])
    return out


def _range_aoi(sgg_cd: str | None, fp: dict, emd_cd: str | None) -> tuple[dict, str]:
    from shapely.geometry import mapping, shape
    from . import regions as R
    from .jobs import normalize_aoi
    f = shape(fp)
    if emd_cd:
        ix = R.emd_index(sgg_cd) if sgg_cd else None
        if ix is None or emd_cd not in ix.codes:
            raise ApiError("bad_request", "그 영상 안에 없는 읍면동입니다")
        k = ix.codes.index(emd_cd)
        g = ix.geoms[k].intersection(f)
        if g.is_empty:
            raise ApiError("bad_request", "그 읍면동은 영상 범위 밖입니다")
        return normalize_aoi(mapping(g.simplify(0.00005))), ix.names[k] or "읍면동"
    return normalize_aoi(mapping(f.simplify(0.00005))), "영상 전체"


@router.post("/release/projects/{pid}/infer", status_code=202)
async def infer_run(pid: str, body: dict, request: Request):
    """이 프로젝트 모델로 분석(배포 신청 없이) — 지금 있는 분석 작업 길(POST /jobs)로만: 대기열 · 전력 예산(GPU 한 장씩) · 범위 천장 그대로."""
    p = _lx(request)
    mid, iid, emd = str(body.get("model_id") or ""), str(body.get("imagery_id") or ""), str(body.get("emd_cd") or "") or None
    st = infer_settings(body)
    async with db(realm="lx") as conn:
        r, members = await _member_project(conn, p, pid)
        if not PJ._is_member(p, r, members):
            raise ApiError("forbidden", "추론은 프로젝트장 · 구성원이 합니다")
        models = await project_models(conn, pid)
        m = next((x for x in models if x["id"] == mid), None)
        if not m:
            raise ApiError("bad_request", "이 프로젝트에서 학습한 모델을 골라 주세요")
        img = await conn.fetchrow("SELECT id, name, sgg_cd, path_internal, ST_AsGeoJSON(footprint)::json AS fp FROM imagery WHERE id=$1", iid)
        if not img or not img["path_internal"] or not img["fp"]:
            raise ApiError("bad_request", "분석할 수 있는 영상을 골라 주세요")
        busy = await conn.fetchval("SELECT 1 FROM jobs WHERE kind='infer' AND state IN ('queued','running') AND options->>'project_id'=$1 "
                                   "AND model_id=$2 AND imagery_id=$3 AND coalesce(options->>'emd_cd','')=$4 LIMIT 1", pid, mid, iid, emd or "")
    if busy:
        raise ApiError("conflict", "같은 모델 · 같은 범위의 추론이 이미 돌고 있습니다", None, 409)
    aoi, rname = await run_in_threadpool(_range_aoi, img["sgg_cd"], img["fp"], emd)
    from .jobs import INFER_MAX_KM2, submit
    job_body = {"kind": "infer", "model_id": mid, "imagery_id": iid, "aoi": aoi,
                "label": f"추론 · {r['name']}"[:60],
                "options": {"project_id": pid, "project_infer": True, "chip": 1024, "overlap": 0.125, "conf": st["conf"], "min_area_m2": st["min_area_m2"],
                            "max_km2": INFER_MAX_KM2,
                            "range_name": rname, **({"emd_cd": emd} if emd else {}), **({"sgg_cd": img["sgg_cd"]} if img["sgg_cd"] else {})}}
    res = await submit(job_body, request)
    async with db(realm="lx") as conn:
        await audit(conn, p, "project.infer", pid, None, {"job_id": res["job"]["id"], "model_id": mid, "imagery_id": iid, "emd_cd": emd, **st})
    return {"job": res["job"]["id"], "state": res["job"]["state"], "range": rname, "settings": st, "as_of": now_iso()}


@router.get("/release/imagery/{iid}/thumb")
async def imagery_thumb(iid: str, request: Request):
    """영상 미리보기 — 카탈로그 썸네일(관리자 화면)과 같은 그림 · 같은 캐시. LX 직원 · 관리자."""
    import asyncio
    import hashlib
    import json

    from fastapi import Response

    from . import catalog as C
    from . import config
    _lx(request)
    async with db(realm="lx") as conn:
        r = await conn.fetchrow("SELECT id, name, kind, gsd_m, year, epoch, path_internal, pmtiles_set, layer, ST_AsGeoJSON(footprint)::json AS fp "
                                "FROM imagery WHERE id=$1 AND coalesce(layer->>'role','imagery')='imagery'", iid)
    if not r:
        raise ApiError("not_found", "영상이 없습니다")
    row = dict(r)
    key = hashlib.sha1(json.dumps([row["path_internal"], row["pmtiles_set"], (row["layer"] or {}).get("cog_path"), row["fp"]], default=str).encode()).hexdigest()[:12]
    out = config.DATA_ROOT / "cache" / "thumbs" / f"{iid}-{key}.jpg"
    hdr = {"Cache-Control": "private, max-age=86400"}
    if out.exists():
        return Response(content=out.read_bytes(), media_type="image/jpeg", headers=hdr)
    if out.with_suffix(".none").exists():
        return Response(status_code=204)
    C._thumb_gate = C._thumb_gate or asyncio.Semaphore(2)
    async with C._thumb_gate:
        try:
            ok = await run_in_threadpool(C._thumb_make, row, out)
        except Exception:  # noqa: BLE001
            ok = False
    if not ok:
        out.parent.mkdir(parents=True, exist_ok=True)
        out.with_suffix(".none").touch()
        return Response(status_code=204)
    return Response(content=out.read_bytes(), media_type="image/jpeg", headers=hdr)


# ── 배포 신청 ─────────────────────────────────────────────────────────────
async def _card_of(conn, pid: str) -> str | None:
    return await conn.fetchval("SELECT ref FROM project_links WHERE project_id=$1 AND kind='card' ORDER BY at LIMIT 1", pid)


async def _versions(conn, pid: str, card: str | None, people: dict) -> list[dict]:
    """이 서비스의 판 기록 — 판마다 마지막 승인 요청 상태(검토 중 · 승인 · 거절) · 사유 · 메모. 새 판이 위."""
    if not card:
        return []
    vs = await conn.fetch("SELECT id, version, model_ids, changelog, approved_by, approved_at FROM card_versions WHERE card_id=$1", card)
    aps = await conn.fetch("SELECT id, subject_id, state, decision, reason, payload, requested_by, decided_by, at, decided_at FROM approvals "
                           "WHERE subject_type='card' AND subject_id = ANY($1::text[]) ORDER BY at", [v["id"] for v in vs])
    from .cards import _ver_key
    out = []
    for v in sorted(vs, key=lambda x: _ver_key(x["version"]), reverse=True):
        mine = [a for a in aps if a["subject_id"] == v["id"]]
        last = mine[-1] if mine else None
        pl = (last["payload"] or {}) if last else {}
        if v["approved_by"]:
            state = "approved"
        elif last and (last["state"] or "") == "pending":
            state = "pending"
        elif last and last["decision"] == "reject":
            state = "rejected"
        else:
            state = "none"
        mrow = await conn.fetchrow("SELECT name, metrics FROM models WHERE id = ANY($1::text[]) LIMIT 1", list(v["model_ids"] or [])) if v["model_ids"] else None
        mname, macc = (model_label(mrow["name"], mrow["metrics"]), mrow["metrics"]) if mrow else (None, None)
        out.append({"id": v["id"], "version": v["version"], "state": state,
                    "state_label": {"approved": "승인", "pending": "검토 중", "rejected": "거절", "none": "신청 기록 없음"}[state],
                    "model": {"id": (v["model_ids"] or [None])[0], "name": mname, "acc": acc_env(macc)},
                    "approved_at": _iso(v["approved_at"]), "approved_by": people.get(v["approved_by"]) if v["approved_by"] else None,
                    "requested_at": _iso(last["at"]) if last else None, "decided_at": _iso(last["decided_at"]) if last else None,
                    "reason": plain(last["reason"] if last and last["decision"] == "reject" else (last["reason"] if last and v["approved_by"] else None)),
                    "memo": pl.get("memo"), "changelog": plain(v["changelog"]), "test": bool(pl.get("test")),
                    "tries": env(len(mine), "count", "recorded", "이 판의 배포 신청 횟수"), "approval_id": last["id"] if last else None})
    return out


async def _sample_of(conn, pid: str, model_sample: str | None) -> dict | None:
    if not model_sample:
        return None
    sids = await PJ._sample_ids(conn, pid)
    if model_sample not in sids:
        return None
    s = await conn.fetchrow("SELECT id, task_name, n_images, created_at FROM train_samples WHERE id=$1", model_sample)
    if not s:
        return None
    return {"id": s["id"], "images": env(s["n_images"], "count", "measured", "올린 표본 파일"), "at": _iso(s["created_at"]), "task": s["task_name"]}


@router.get("/release/projects/{pid}/apply")
async def apply_view(pid: str, request: Request):
    p = _lx(request)
    async with db(realm="lx") as conn:
        r, members = await _member_project(conn, p, pid)
        people = await _people(conn)
        models = await project_models(conn, pid)
        card = await _card_of(conn, pid)
        cinfo = await conn.fetchrow("SELECT id, name, intro, ledger_schema FROM cards WHERE id=$1", card) if card else None
        versions = await _versions(conn, pid, card, people)
        f = await PJ._facts(conn, r)
        jobs = [j for j in await _infer_jobs(conn, pid, people) if j["state"] == "done"]
        samples = {m["id"]: await _sample_of(conn, pid, m["sample_id"]) for m in models}
        orgs = await _orgs(conn)
    j = PJ._judge(r, f)
    rv = next((s for s in j["stages"] if s["key"] == "review"), {})
    shared = []                                         # 이 서비스를 지금 공유받은 기관(기관 '서비스 선택'과 같은 판정)
    if card:
        eff = await _effective(orgs)
        shared = [{"id": o["id"], "name": o["name"], "year": (eff[o["id"]].get(card) or {}).get("year")} for o in orgs if card in eff[o["id"]]]
    live = [v for v in versions if v["state"] == "approved"]
    prev = live[0] if live else None
    open_v = next((v for v in versions if v["state"] in ("pending", "rejected")), None)
    if open_v and prev and float(open_v["version"] or 0) < float(prev["version"] or 0):
        open_v = None                                   # 더 새 판이 승인됐으면 옛 거절 판은 지난 일
    status = {"state": open_v["state"], "version": open_v["version"], "at": open_v["requested_at"], "reason": open_v["reason"],
              "memo": open_v["memo"], "tries": open_v["tries"], "decided_at": open_v["decided_at"]} if open_v else \
             ({"state": "approved", "version": prev["version"], "at": prev["approved_at"], "by": prev["approved_by"]} if prev else {"state": "none"})
    kinds = []
    if not card:
        from .ledger import KINDS
        async with db(realm="lx") as conn:
            have = {x["k"] for x in await conn.fetch("SELECT DISTINCT ledger_schema->>'kind' AS k FROM cards WHERE ledger_schema IS NOT NULL")}
        kinds = [{"kind": k, "label": v} for k, v in KINDS.items() if k in have]
    reg = [m for m in models if m["status"] == "registered"]
    pick = (open_v and open_v["model"]["id"]) or next((s["target"].get("model") for s in j["stages"] if s["key"] == "train"), None) or (reg[0]["id"] if reg else None)
    return {"project": {"id": r["id"], "name": r["name"], "task": r["task"]},
            "service": {"id": card, "name": _ko(cinfo["name"]) if cinfo else None, "line": ((cinfo["intro"] or {}).get("headline") if cinfo else None),
                        "default_name": (f"{r['task']} 분석서비스" if r["task"] else r["name"])[:60]},
            "first": prev is None, "prev": prev, "next_version": open_v["version"] if open_v and open_v["state"] == "rejected" else _next_ver(versions),
            "models": [{**m, "sample": samples.get(m["id"]), "can_apply": m["status"] == "registered",
                        "low": low_line(low_acc(m["acc"], m.get("base"), (prev or {}).get("model", {}).get("acc")))} for m in models],
            "pick": pick, "scenes": jobs[:12],
            "review": rv.get("progress"), "review_done": bool(rv.get("done")), "review_skip": bool(rv.get("skip")),
            "status": status, "versions": versions, "shared": shared, "ledger_kinds": kinds,
            "can": {"apply": p.user_id == r["lead_id"], "lead": (people.get(r["lead_id"]) if r["lead_id"] else None)}, "as_of": now_iso()}


def _next_ver(versions: list) -> str:
    nums = []
    for v in versions:
        try:
            nums.append(float(v["version"]))
        except (TypeError, ValueError):
            pass
    return f"{int(max(nums, default=0)) + 1}.0"


@router.post("/release/projects/{pid}/apply", status_code=201)
async def apply(pid: str, body: dict, request: Request):
    """배포 신청(프로젝트장) — 신청서 = 서버 값 + 메모 한 칸. 지금 있는 서비스 공개 승인 흐름(registry.create_card_as · approvals)에 그대로 싣는다."""
    p = _lx(request)
    mid = str(body.get("model_id") or "")
    memo = str(body.get("memo") or "").strip()[:MEMO_MAX] or None
    scene_job = str(body.get("scene_job") or "") or None
    test = bool(body.get("test"))
    async with db(realm="lx") as conn:
        r, members = await _member_project(conn, p, pid)
        if p.user_id != r["lead_id"]:
            raise ApiError("forbidden", "배포 신청은 프로젝트장이 합니다")
        people = await _people(conn)
        models = await project_models(conn, pid)
        m = next((x for x in models if x["id"] == mid), None)
        if not m:
            raise ApiError("bad_request", "이 프로젝트에서 학습한 모델을 골라 주세요")
        if m["status"] != "registered":
            raise ApiError("conflict", "모델 등록 승인 뒤에 배포 신청할 수 있습니다", {"status": m["status"]}, 409)
        card = await _card_of(conn, pid)
        versions = await _versions(conn, pid, card, people)
        f = await PJ._facts(conn, r)
        scene = None
        if scene_job:
            js = [x for x in await _infer_jobs(conn, pid, people) if x["state"] == "done" and x["job"] == scene_job]
            if not js:
                raise ApiError("bad_request", "이 프로젝트에서 끝난 추론 결과만 결과 장면으로 고를 수 있습니다")
            x = js[0]
            scene = {"job": x["job"], "imagery": x["imagery"]["name"], "range": x["range"], "found": x["found"],
                     "area": x["area"], "at": x["finished_at"], "href": x["href"]}
        sample = await _sample_of(conn, pid, m["sample_id"])
        prev = next((v for v in versions if v["state"] == "approved"), None)
        pend = next((v for v in versions if v["state"] == "pending"), None)
        if pend:
            raise ApiError("conflict", "검토 중인 배포 신청이 있습니다", {"version": pend["version"]}, 409)
        rej = next((v for v in versions if v["state"] == "rejected"), None)
        if rej and prev and float(rej["version"]) < float(prev["version"]):
            rej = None
    j = PJ._judge(r, f)
    rv = next((s for s in j["stages"] if s["key"] == "review"), {})
    # 신청서 = 신청한 때의 서버 값(숫자는 봉투 그대로 — 관리자 화면이 같은 값을 본다)
    form = {"model": {"id": m["id"], "name": m["name"], "n": m["n"], "classes": m["classes"], "gsd_word": m["gsd_word"], "at": m["at"]},
            "acc": m["acc"], "prev": ({"version": prev["version"], "acc": prev["model"]["acc"], "model": prev["model"]["name"],
                                       "at": prev["approved_at"]} if prev else None),
            "sample": ({"images": sample["images"], "at": sample["at"]} if sample else None),
            "base": m.get("base"), "low": low_line(low_acc(m["acc"], m.get("base"), prev["model"]["acc"] if prev else None)),
            "review": rv.get("progress"), "review_skip": bool(rv.get("skip")), "scene": scene}
    extra = {"memo": memo, "form": form, "kind_word": "배포 신청", **({"test": True} if test else {})}
    if rej:                                          # 거절된 판을 고쳐서 다시 신청 — 같은 판 번호 · 새 승인 요청 한 줄
        return await _reapply(p, pid, r, rej, m, extra)
    from .registry import create_card_as
    async with db(realm="lx") as conn:
        if card:
            c = await conn.fetchrow("SELECT name, ledger_schema FROM cards WHERE id=$1", card)
            last = await conn.fetchval("SELECT modules FROM card_versions WHERE card_id=$1 ORDER BY approved_at DESC NULLS LAST, id DESC LIMIT 1", card) or {}
            from .registry import rules_fit
            fit = rules_fit(m["classes"])
            rules = [x for x in (last.get("rules") or []) if fit.get(x)]
            have = {c2.split("_")[0] for c2 in m["classes"]}
            classes = [x for x in (last.get("classes") or []) if str(x).split("_")[0] in have] or None
            cbody = {"name": _ko(c["name"]) or r["name"], "model_id": mid, "rules": rules, "ledger_kind": (c["ledger_schema"] or {}).get("kind"),
                     "project_id": pid, "changelog": (memo or "배포 신청")[:120], "reason": memo or "배포 신청",
                     **({"classes": classes} if classes else {})}
        else:
            kind = str(body.get("ledger_kind") or "")
            if not kind:
                kind = await conn.fetchval("SELECT ledger_schema->>'kind' FROM cards WHERE ledger_schema IS NOT NULL ORDER BY id LIMIT 1")
            cbody = {"name": str(body.get("name") or f"{r['task'] or r['name']} 분석서비스").strip()[:60], "model_id": mid, "rules": [],
                     "ledger_kind": kind, "project_id": pid, "reason": memo or "배포 신청"}
    res = await create_card_as(p, cbody, extra)
    return {"approval_id": res["approval_id"], "version": res["card_version_id"].split("@")[-1], "card": res["id"], "state": "pending", "as_of": now_iso()}


async def _reapply(p, pid: str, r, rej: dict, m: dict, extra: dict) -> dict:
    import secrets
    cv = rej["id"]
    async with db(realm="lx") as conn:
        mods = await conn.fetchval("SELECT modules FROM card_versions WHERE id=$1 FOR UPDATE", cv) or {}
        from .registry import rules_fit
        fit = rules_fit(m["classes"])
        have = {c.split("_")[0] for c in m["classes"]}
        mods = {**mods, "rules": [x for x in (mods.get("rules") or []) if fit.get(x)]}
        if mods.get("classes"):
            mods["classes"] = [x for x in mods["classes"] if str(x).split("_")[0] in have] or None
            if not mods["classes"]:
                mods.pop("classes")
        mods["ext"] = {**(mods.get("ext") or {}), "mod-parcel": bool(mods["rules"])}
        memo = extra.get("memo")
        await conn.execute("UPDATE card_versions SET model_ids=$2, modules=$3, changelog=coalesce($4, changelog) WHERE id=$1 AND approved_by IS NULL",
                           cv, [m["id"]], mods, (memo or None) and memo[:120])
        old = await conn.fetchrow("SELECT payload FROM approvals WHERE id=$1", rej["approval_id"])
        pl = {k: v for k, v in dict((old["payload"] if old else None) or {}).items() if k not in ("request_reason", "single_admin", "memo", "form", "test")}
        cname = await conn.fetchval("SELECT c.name->>'ko' FROM card_versions v JOIN cards c ON c.id=v.card_id WHERE v.id=$1", cv)
        aid = "ap_" + secrets.token_hex(6)
        await conn.execute("INSERT INTO approvals(id, subject_type, subject_id, requested_by, state, payload, reason, tenant_id, at) "
                           "VALUES ($1,'card',$2,$3,'pending',$4,$5,'lx',now())", aid, cv, p.user_id,
                           {**pl, "action": "publish", "name": cname or pl.get("name"), "model_name": m["name"], "again": True,
                            "project_id": pid, "project_name": r["name"], "owner": p.name, "version": rej["version"], **extra},
                           memo or "고쳐서 다시 신청")
        await audit(conn, p, "card.reapply", cv, {"approval_id": rej["approval_id"]}, {"approval_id": aid, "model_id": m["id"]})
    from .jobs import ops_event
    await ops_event("approval.requested", {"approval_id": aid, "subject_type": "card", "subject_id": cv, "by": p.user_id, "at": now_iso()})
    return {"approval_id": aid, "version": rej["version"], "card": cv.split("@")[0], "state": "pending", "again": True, "as_of": now_iso()}


# ── LX 관리자: 신청 · 공유 · 사용 현황 ──────────────────────────────────────
@router.get("/release/requests")
async def requests_list(request: Request):
    """배포 신청 목록(서비스 공개 승인 요청) — 검토 중이 위 · 그다음 처리한 것(새 것이 위). 신청서 = 신청 때 서버 값 + 메모(payload)."""
    p = require(principal(request), admin=True)
    async with db(realm="lx") as conn:
        people = await _people(conn)
        rows = await conn.fetch("SELECT a.*, v.version, v.card_id, v.approved_by AS v_ok, c.name AS cname, c.intro FROM approvals a "
                                "JOIN card_versions v ON v.id = a.subject_id JOIN cards c ON c.id = v.card_id "
                                "WHERE a.subject_type='card' ORDER BY a.at DESC LIMIT 200")
        other = await conn.fetch("SELECT subject_type, count(*) n FROM approvals WHERE state='pending' AND subject_type <> 'card' GROUP BY 1")
        from .approvals import KIND_LABEL, solo_admin
        solo = await solo_admin(conn, p)
    items = []
    for x in rows:
        pl = x["payload"] or {}
        fm = pl.get("form")
        if isinstance(fm, dict) and "low" not in fm:      # 경고 줄이 생기기 전(10-10 전) 신청서 — 신청서에 적힌 값으로 같은 판정
            fm = {**fm, "low": low_line(low_acc(fm.get("acc"), fm.get("base"), (fm.get("prev") or {}).get("acc")))}
        st = x["state"] or ("decided" if x["decision"] else "pending")
        state = "pending" if st == "pending" else ("approved" if x["decision"] == "approve" else "rejected")
        items.append({"id": x["id"], "state": state, "state_label": {"pending": "검토 중", "approved": "승인", "rejected": "거절"}[state],
                      "service": {"id": x["card_id"], "name": _ko(x["cname"]) or pl.get("name"), "line": (x["intro"] or {}).get("headline")},
                      "version": x["version"], "project": {"id": pl.get("project_id"), "name": pl.get("project_name")},
                      "by": people.get(x["requested_by"]) if x["requested_by"] else None, "at": _iso(x["at"]),
                      "decided_by": people.get(x["decided_by"]) if x["decided_by"] else None, "decided_at": _iso(x["decided_at"]),
                      "reason": plain(x["reason"]) if st != "pending" else None, "memo": pl.get("memo"), "form": fm,
                      "model_name": pl.get("model_name"), "again": bool(pl.get("again")), "test": bool(pl.get("test")),
                      "can_decide": st == "pending" and (x["requested_by"] != p.user_id or solo)})
    items.sort(key=lambda i: (i["state"] != "pending", -(dt.datetime.fromisoformat(i["at"]).timestamp() if i["at"] else 0)))
    pend = sum(1 for i in items if i["state"] == "pending")
    return {"items": items, "pending": env(pend, "count", "recorded", "배포 신청(승인 요청 · 서비스 공개) 검토 중"),
            "decided": env(len(items) - pend, "count", "recorded", "배포 신청 처리함"),
            "rejected": env(sum(1 for i in items if i["state"] == "rejected"), "count", "recorded", "배포 신청 거절"),
            "other": [{"kind": o["subject_type"], "label": KIND_LABEL.get(o["subject_type"], o["subject_type"]), "n": int(o["n"])} for o in other],
            "as_of": now_iso()}


def _wide_regions(tid: str) -> list[dict]:
    from .spaces import _wide_regions as W
    return W(tid)


def _org_kind(tid: str) -> dict:
    from . import regions as R
    sc = R.tenant_scope(tid)
    if sc is None:
        return {"word": "해외", "wide": False, "n": None}
    if len(sc) == 1 and len(sc[0]) == 5:
        return {"word": "시군구", "wide": False, "n": 1}
    regs, _, _ = R.regions_base()
    n = len({x["sgg_cd"] for x in regs if R.in_scope(x["sgg_cd"], sc)})
    return {"word": f"광역 · 소속 시군구 {n}", "wide": True, "n": n}


async def _orgs(conn) -> list[dict]:
    rows = await conn.fetch("SELECT t.id, t.name, b.short, b.services FROM tenants t LEFT JOIN tenant_brand b ON b.tenant_id = t.id "
                            "WHERE t.kind='user' AND t.status='active' AND t.id <> 'lx-demo' ORDER BY t.id")
    out = []
    for r in rows:
        nm = _ko(r["name"]) or r["id"]
        short = r["short"] or nm.split("(")[0].replace("전북특별자치도 ", "").strip()
        out.append({"id": r["id"], "name": short, "full": nm, "order": list(r["services"]) if r["services"] else None, **_org_kind(r["id"])})
    return out


async def _effective(orgs: list) -> dict:
    """기관마다 지금 '서비스 선택'에 보이는 서비스 — brand._services 그대로(기관 화면과 한 판정)."""
    from .brand import _services
    out = {}
    for o in orgs:
        svcs = await _services(o["id"], o["order"], {})
        out[o["id"]] = {s["card"]: s for s in svcs}
    return out


async def _services_list(conn) -> list[dict]:
    """승인된 판이 있는 서비스(배포 신청이 승인된 것 · 옛 승인 포함) — 판 번호 · 운영/시범 상태."""
    from .registry import STATUS_LABEL, _status_of
    from .cards import _ver_key
    cs = await conn.fetch("SELECT id, name FROM cards ORDER BY id")
    vs = await conn.fetch("SELECT card_id, version FROM card_versions WHERE approved_by IS NOT NULL")
    ds = await conn.fetch("SELECT card_id, stage, snapshot_current, scale, coalesce(test,false) AS test FROM deploys")
    out = []
    for c in cs:
        mine = sorted([v["version"] for v in vs if v["card_id"] == c["id"]], key=_ver_key)
        dps = [d for d in ds if d["card_id"] == c["id"]]
        if not mine and not dps:
            continue
        st = _status_of(dps)
        out.append({"id": c["id"], "name": _ko(c["name"]) or c["id"], "version": mine[-1] if mine else None, "state": st,
                    "state_label": {"ops": "운영", "pilot": "시범", "first": "첫 결과 전"}.get(st, STATUS_LABEL.get(st, ""))})
    return out


@router.get("/release/shares")
async def shares(request: Request):
    require(principal(request), admin=True)
    async with db(realm="lx") as conn:
        orgs = await _orgs(conn)
        svcs = await _services_list(conn)
        last = await latest_shares(conn)
    eff = await _effective(orgs)
    rows = []
    for s in svcs:
        cells = {}
        for o in orgs:
            on = s["id"] in eff[o["id"]]
            x = last.get((s["id"], o["id"]))
            cells[o["id"]] = {"shared": on, "at": _iso(x["at"]) if x and x["shared"] == on else None,
                              "year": (eff[o["id"]].get(s["id"]) or {}).get("year"), "test": bool(x and x["test"] and x["shared"] == on),
                              "sgg": list(x["sgg"]) if on and x and x["shared"] and x.get("sgg") else None}   # 광역 — 고른 소속 시군구(None = 전체 · 나중 13 ⓐ)
        rows.append({**s, "cells": cells, "n": sum(1 for c in cells.values() if c["shared"])})
    rows.sort(key=lambda r: (-r["n"], r["state"] != "ops", r["name"]))
    for o in orgs:                                       # 광역 기관 — 소속 시군구 목록(공유할 때 고른다 · 나중 13 ⓐ)
        o["regions"] = _wide_regions(o["id"]) if o.get("wide") else None
    return {"orgs": [{k: o[k] for k in ("id", "name", "full", "word", "wide", "n", "regions")} for o in orgs], "items": rows,
            "services": env(len(rows), "count", "recorded", "승인된 판 · 배포 기록이 있는 서비스"), "as_of": now_iso()}


@router.put("/release/shares")
async def share_set(body: dict, request: Request):
    p = require(principal(request), admin=True)
    cid, tid, on = str(body.get("card_id") or ""), str(body.get("tenant_id") or ""), body.get("shared")
    if not isinstance(on, bool):
        raise ApiError("bad_request", "shared 는 true | false")
    async with db(realm="lx") as conn:
        orgs = {o["id"]: o for o in await _orgs(conn)}
        if tid not in orgs:
            raise ApiError("not_found", "없는 기관입니다")
        if not await conn.fetchval("SELECT 1 FROM cards WHERE id=$1", cid):
            raise ApiError("not_found", "없는 서비스입니다")
        if on and not await conn.fetchval("SELECT 1 FROM card_versions WHERE card_id=$1 AND approved_by IS NOT NULL", cid):
            raise ApiError("conflict", "승인된 판이 없는 서비스는 공유할 수 없습니다", None, 409)
        sgg = None                                       # 광역 기관 — 소속 시군구까지(나중 13 ⓐ) · 없거나 전부면 관할 전체
        if on and body.get("sgg") is not None:
            codes = {x["code"] for x in _wide_regions(tid)}
            if not codes:
                raise ApiError("bad_request", "시군구는 광역 기관에 공유할 때만 고릅니다")
            want = sorted({str(x) for x in (body.get("sgg") or [])})
            if not want:
                raise ApiError("bad_request", "시군구를 하나 이상 고르거나 공유를 거두어 주세요")
            if any(x not in codes for x in want):
                raise ApiError("bad_request", "그 기관 관할 안의 시군구만 고를 수 있습니다")
            sgg = None if set(want) == codes else want
        await conn.execute("INSERT INTO card_shares(card_id, tenant_id, shared, by, test, note, sgg) VALUES ($1,$2,$3,$4,$5,$6,$7)",
                           cid, tid, on, p.user_id, bool(body.get("test")), str(body.get("note") or "")[:120] or None, sgg)
        await audit(conn, p, "card.share" if on else "card.unshare", cid, None, {"tenant_id": tid, "test": bool(body.get("test")), "sgg": sgg})
    from .jobs import ops_event
    await ops_event("deploy.changed", {"card_id": cid, "tenant_id": tid, "action": "share" if on else "unshare", "by": p.user_id, "at": now_iso()})
    eff = await _effective([orgs[tid]])
    return {"card_id": cid, "tenant_id": tid, "shared": cid in eff[tid], "sgg": sgg, "as_of": now_iso()}


def _month_start():
    n = dt.datetime.now(KST)
    return n.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


@router.get("/release/usage")
async def usage(request: Request):
    """사용 현황 — 기관 × 지금 공유된 서비스. LX가 돌린 분석 = 그 서비스로 돌린 분석 작업(끝남 · 시험 제외) 중 그 기관 관할(배포본의 기관 ·
    작업 기관 · 분석한 시군구가 관할 안). 기관이 요청한 분석 = 그 기관의 분석 요청(그 서비스 배포본). 기관 합계 = 기관 사용량(quota.usage_of)과 같은 값."""
    require(principal(request), admin=True)
    from . import regions as R
    from .quota import usage_of
    async with db(realm="lx") as conn:
        orgs = await _orgs(conn)
        svcs = {s["id"]: s for s in await _services_list(conn)}
        jobs = await conn.fetch("SELECT j.id, j.card_id, j.tenant_id, j.deploy_id, d.tenant_id AS dt, coalesce(j.options->>'sgg_cd', i.sgg_cd, d.sgg_cd) AS sgg, "
                                "ST_Area(j.aoi::geography)/1e6 AS km2, j.finished_at FROM jobs j LEFT JOIN deploys d ON d.id = j.deploy_id "
                                "LEFT JOIN imagery i ON i.id = j.imagery_id WHERE j.kind IN ('infer','reinfer') AND j.state='done' "
                                "AND j.card_id IS NOT NULL AND NOT coalesce(j.test,false) AND NOT coalesce(j.demo,false)")
        reqs = await conn.fetch("SELECT r.tenant_id, d.card_id, r.state, r.created_at FROM analysis_requests r JOIN deploys d ON d.id = r.deploy_id")
    eff = await _effective(orgs)
    scope = {o["id"]: R.tenant_scope(o["id"]) for o in orgs}

    def owner(j) -> str | None:
        if j["dt"] and j["dt"] not in ("lx", "lx-demo"):
            return j["dt"]
        if j["tenant_id"] and j["tenant_id"] not in ("lx", "lx-demo"):
            return j["tenant_id"]
        if j["sgg"]:
            for tid, sc in scope.items():
                if sc and R.in_scope(str(j["sgg"]), sc):
                    return tid
        return None
    by = {}
    for j in jobs:
        t = owner(j)
        if t:
            by.setdefault((t, j["card_id"]), []).append(j)
    rq = {}
    for x in reqs:
        rq.setdefault((x["tenant_id"], x["card_id"]), []).append(x)
    ms = _month_start()
    rows, totals = [], []
    for o in orgs:
        mine = eff[o["id"]]
        n_runs = 0
        last_o = None
        for cid, s in mine.items():
            js = by.get((o["id"], cid), [])
            rs = rq.get((o["id"], cid), [])
            area = await _union_km2(job_ids=[j["id"] for j in js]) if js else 0.0
            last_lx = max((j["finished_at"] for j in js if j["finished_at"]), default=None)
            last_rq = max((x["created_at"] for x in rs), default=None)
            last = max([x for x in (last_lx, last_rq) if x], default=None)
            n_runs += len(js) + len(rs)
            last_o = max([x for x in (last_o, last) if x], default=None)
            wait = sum(1 for x in rs if x["state"] in ("pending", "approved", "analyzing"))
            rows.append({"org": {"id": o["id"], "name": o["name"]}, "service": {"id": cid, "name": (svcs.get(cid) or {}).get("name") or s.get("name")},
                         "year": s.get("year"),
                         "lx_runs": env(len(js), "count", "recorded", "그 서비스로 돌린 분석 작업(끝남 · 시험 제외 · 그 기관 관할)"),
                         "lx_month": env(sum(1 for j in js if j["finished_at"] and j["finished_at"] >= ms), "count", "recorded", "이번 달"),
                         "area": env(round(area, 1) if js else None, "km2", "measured", "분석한 면적 — 작업 범위 ∩ 영상 합집합(겹친 곳은 한 번)"),
                         "lx_last": _iso(last_lx),
                         "org_runs": env(len(rs), "count", "recorded", "기관이 요청한 분석(분석 요청)"),
                         "org_wait": env(wait, "count", "recorded", "기관 분석 요청 중 처리 전"), "org_last": _iso(last_rq), "last": _iso(last)})
        u = await usage_of(o["id"])
        d = u.get("dims") or {}
        totals.append({"org": {"id": o["id"], "name": o["name"], "word": o["word"]}, "services": env(len(mine), "count", "recorded", "공유된 서비스"),
                       "runs": env(n_runs, "count", "recorded", "LX가 돌린 분석 + 기관이 요청한 분석(공유된 서비스)"), "last": _iso(last_o),
                       "chat": (d.get("llm_requests_month") or {}).get("used"), "storage": (d.get("storage_gb") or {}).get("used")})
    month = sum(r["lx_month"]["value"] for r in rows) + sum(1 for x in reqs if x["created_at"] >= ms and (x["tenant_id"], x["card_id"]) in {(r["org"]["id"], r["service"]["id"]) for r in rows})
    last_all = max([r["last"] for r in rows if r["last"]], default=None)
    return {"items": rows, "totals": totals,
            "summary": {"shared": env(len(rows), "count", "recorded", "기관 × 공유된 서비스"),
                        "orgs": env(sum(1 for t in totals if t["services"]["value"]), "count", "recorded", "공유받은 기관"),
                        "month": env(month, "count", "recorded", "이번 달 분석(공유된 서비스 · LX + 기관 요청)"), "last": last_all},
            "as_of": now_iso()}
