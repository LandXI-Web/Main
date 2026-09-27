"""실태조사 API(F2-S · F1-CONTRACT v1.1-22) — `/api/v1/survey/*` 읽기 5 + 상태 쓰기 1 + 보고서 초안 1.

정본 = PostGIS survey_* 표(server/survey/pipelines/s5_load_pg.py 가 02. 데이터/survey/ 에서 적재 · README 표와 count 검증).
관문: 게스트 401 · realm tenant 는 RLS 로 자기 기관 행만(1차 정본은 tenant 'namwon' — 다른 기관 0건) · lx staff/admin/sales 읽기.
쓰기(POST …/state): tenant manager(자기 기관) · lx staff/admin(시연 쓰기 · basis 'demo' · 24h 뒤 자동 원복). 성명 열 없음.
main.py 확장 훅(F2-B · `importlib.import_module("landxi_api.survey")`)이 이 router 를 /api/v1 에 붙인다.
"""
from __future__ import annotations

import datetime as dt
import json
import re
import time
import urllib.parse

import asyncpg
from fastapi import APIRouter, Request
from fastapi.responses import Response
from starlette.concurrency import run_in_threadpool

from .deps import ApiError, audit, db, principal, redis, require
from .envelope import KST, now_iso

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from survey import explain as X  # noqa: E402
from survey import rules as RL  # noqa: E402
from survey.db import AS_OF, FIXED_PHRASE, RULE_IDS, SRC_SUMMARY, SRC_SUSPECTS, STATES  # noqa: E402

router = APIRouter()

FCOLS = ("id, rank, priority, score, rule, rule_nm, pnu, addr, emd, emd_cd, jimok, parcel_m2, yongdo, nongup, evid_m2, conf, "
         "corroboration, img_date, evidence, ai_ids, lon, lat, state, assignee, planned_for, reason, updated_at, updated_by, demo, tenant_id")
PCOLS_ALL = "*"
TRANSITIONS = {"open": {"assigned", "dismissed"}, "assigned": {"inspected", "dismissed"}, "inspected": {"closed"},
               "closed": set(), "dismissed": set()}
SORTS = {"score": "score DESC, rank ASC", "evid_m2": "evid_m2 DESC NULLS LAST, rank ASC", "updated": "updated_at DESC NULLS LAST, rank ASC",
         "rank": "rank ASC"}
PNU_RE = re.compile(r"^\d{19}$")
EMD_RE = re.compile(r"^\d{8}$")
DEMO_TTL_H = 24
_revert = {"t": 0.0}


def _err_missing(e: Exception):
    raise ApiError("registry_unavailable", "실태조사 표가 적재되지 않았습니다(server/survey/pipelines/s5_load_pg.py)",
                   {"error": type(e).__name__}, 404)


def _read(p):
    return require(p)


def _list_param(v: str | None, allowed: set[str] | None = None, name: str = "") -> list[str]:
    if not v:
        return []
    out = [x.strip() for x in v.split(",") if x.strip()]
    if allowed is not None:
        bad = [x for x in out if x not in allowed]
        if bad:
            raise ApiError("bad_request", f"{name} 값 오류: {', '.join(bad)}", {"allowed": sorted(allowed)})
    return out


async def _maybe_revert_demo(conn):
    """lx staff 시연 쓰기 24h 뒤 자동 원복(10분에 한 번 · 정직 표기: 원복도 이벤트로 남긴다)."""
    if time.time() - _revert["t"] < 600:
        return
    _revert["t"] = time.time()
    rows = await conn.fetch("SELECT id, state FROM survey_findings WHERE demo AND updated_at < now() - interval '24 hours'")
    for r in rows:
        prev = await conn.fetchval("SELECT to_state FROM survey_finding_events WHERE finding_id=$1 AND NOT demo ORDER BY at DESC LIMIT 1", r["id"])
        prev = prev or "open"
        await conn.execute("UPDATE survey_findings SET state=$2, demo=false, updated_at=now(), updated_by='system:demo-revert', "
                           "assignee=CASE WHEN $2='open' THEN NULL ELSE assignee END WHERE id=$1", r["id"], prev)
        await conn.execute("INSERT INTO survey_finding_events(finding_id, from_state, to_state, by, realm, reason, demo) "
                           "VALUES ($1,$2,$3,'system:demo-revert','system','시연 쓰기 24h 자동 원복',false)", r["id"], r["state"], prev)


def _filters(q: dict, *, skip: str | None = None) -> tuple[list[str], list]:
    """WHERE 절 · 인자. skip='state'|'rule' 은 그 필터를 뺀다(탭 카운트용)."""
    w, a = [], []

    def add(sql, *vals):
        s = sql
        for v in vals:
            a.append(v)
            s = s.replace("?", f"${len(a)}", 1)
        w.append(s)

    if q["rule"] and skip != "rule":
        add("rule = ANY(?::text[])", q["rule"])
    if q["priority"]:
        add("priority = ANY(?::text[])", q["priority"])
    if q["emd_cd"]:
        add("emd_cd = ANY(?::text[])", q["emd_cd"])
    if q["state"] and skip != "state":
        add("state = ANY(?::text[])", q["state"])
    if q["bbox"]:
        add("geom && ST_MakeEnvelope(?, ?, ?, ?, 4326)", *q["bbox"])
    if q["q"]:
        add("(addr ILIKE '%' || ? || '%' OR pnu LIKE ? || '%')", q["q"], q["q"])
    if q["pnu"]:
        add("pnu = ANY(?::text[])", q["pnu"])
    return w, a


def _where(w):
    return ("WHERE " + " AND ".join(w)) if w else ""


def _row(r) -> dict:
    return dict(r)


@router.get("/survey/findings")
async def findings(request: Request, rule: str | None = None, priority: str | None = None, emd_cd: str | None = None,
                   state: str | None = None, bbox: str | None = None, q: str | None = None, pnu: str | None = None,
                   deploy_id: str | None = None, sort: str = "score", limit: int = 200, offset: int = 0):
    p = _read(principal(request))
    t0 = time.perf_counter()
    if sort not in SORTS:
        raise ApiError("bad_request", "sort 는 score|evid_m2|updated|rank", {"allowed": list(SORTS)})
    limit = max(1, min(int(limit), 2000))
    offset = max(0, int(offset))
    bb = None
    if bbox:
        try:
            bb = [float(x) for x in bbox.split(",")]
            assert len(bb) == 4
        except Exception:
            raise ApiError("bad_request", "bbox = minx,miny,maxx,maxy (EPSG:4326)")
    qq = {"rule": _list_param(rule, set(RULE_IDS), "rule"), "priority": _list_param(priority, {"A", "B", "C"}, "priority"),
          "emd_cd": _list_param(emd_cd, None), "state": _list_param(state, set(STATES), "state"), "bbox": bb,
          "q": (q or "").strip()[:60] or None, "pnu": _list_param(pnu, None)}
    try:
        async with db(p) as conn:
            if deploy_id:
                t = await conn.fetchval("SELECT tenant_id FROM deploys WHERE id=$1", deploy_id)
                if t is None:
                    raise ApiError("not_found", f"deploy {deploy_id} 없음")
                if t != "namwon":      # 1차 실태조사 정본은 남원뿐
                    qq["pnu"] = ["__none__"]
            await _maybe_revert_demo(conn)
            w, a = _filters(qq)
            rows = await conn.fetch(f"SELECT {FCOLS} FROM survey_findings {_where(w)} ORDER BY {SORTS[sort]} "
                                    f"LIMIT {limit} OFFSET {offset}", *a)
            # 탭 카운트 — 한 번의 집계(state × rule · state/rule 필터 제외)로 상태별 · 규칙별 · 총계를 모두 낸다
            wc, ac = _filters({**qq, "state": [], "rule": []})
            cells = await conn.fetch(f"SELECT state, rule, count(*) n FROM survey_findings {_where(wc)} GROUP BY 1, 2", *ac)
    except asyncpg.UndefinedTableError as e:
        _err_missing(e)
    counts = {s: 0 for s in STATES}
    rc = {rid: 0 for rid in RULE_IDS}
    total = 0
    for c in cells:
        in_rule = not qq["rule"] or c["rule"] in qq["rule"]
        in_state = not qq["state"] or c["state"] in qq["state"]
        if in_rule:
            counts[c["state"]] += int(c["n"])
        if in_state:
            rc[c["rule"]] += int(c["n"])
        if in_rule and in_state:
            total += int(c["n"])
    by_rule = {rid: X.env(n, "count", "inferred", "PostGIS survey_findings", "검수 전") for rid, n in rc.items()}
    return {"items": [X.finding_item(_row(r)) for r in rows],
            "total": X.env(int(total), "count", "inferred", "PostGIS survey_findings", "의심 후보 · 검수 전 · 위법 판정 아님"),
            "counts": counts, "by_rule": by_rule, "limit": limit, "offset": offset, "sort": sort,
            "filters": {k: v for k, v in qq.items() if v and k != "pnu"} | ({"deploy_id": deploy_id} if deploy_id else {}),
            "as_of": AS_OF, "source": SRC_SUSPECTS, "fixed": FIXED_PHRASE,
            "db_ms": X.env(round((time.perf_counter() - t0) * 1000, 1), "ms", "measured", "gateway survey.findings · SQL 구간만(조회·집계 · 직렬화 제외 — 서버 전체 처리는 응답 헤더 X-LX-Time-ms)")}


async def _parcel(conn, pnu: str) -> dict | None:
    r = await conn.fetchrow("SELECT p.*, NULL AS geom FROM survey_parcels p WHERE pnu=$1", pnu)
    return dict(r) if r else None


async def _cut(conn) -> dict | None:
    v = await conn.fetchval("SELECT value FROM survey_meta WHERE key='priority_cut'")
    return v


async def _history(conn, pnu: str) -> tuple[list, list, str | None]:
    r = await conn.fetchrow("SELECT events, summary FROM survey_timeline WHERE pnu=$1", pnu)
    if not r:
        return [], [], "이력 대상 아님(2025 A02 또는 변화탐지가 걸린 6,818필지만 이력이 있다)"
    return X.history_items(r["events"]), list(r["summary"] or []), None


@router.get("/survey/findings/{fid}")
async def finding(fid: str, request: Request):
    p = _read(principal(request))
    try:
        async with db(p) as conn:
            r = await conn.fetchrow(f"SELECT {FCOLS} FROM survey_findings WHERE id=$1", fid)
            if not r:
                raise ApiError("not_found", f"finding {fid} 없음")
            row = _row(r)
            parcel = await _parcel(conn, row["pnu"])
            cut = await _cut(conn)
            hist, summ, hnote = await _history(conn, row["pnu"])
            ev = await conn.fetch("SELECT from_state, to_state, by, realm, reason, assignee, planned_for, demo, at FROM survey_finding_events "
                                  "WHERE finding_id=$1 ORDER BY at", fid)
            others = await conn.fetch("SELECT id, rule, rule_nm, priority, state FROM survey_findings WHERE pnu=$1 AND id<>$2", row["pnu"], fid)
    except asyncpg.UndefinedTableError as e:
        _err_missing(e)
    out = X.finding_item(row)
    out["explain"] = X.explain(row, parcel or {}, cut)
    out["history"] = hist
    out["history_summary"] = summ
    if hnote:
        out["history_note"] = hnote
    out["state_log"] = [{"from": e["from_state"], "to": e["to_state"], "by": e["by"], "realm": e["realm"], "reason": e["reason"],
                         "assignee": e["assignee"], "planned_for": e["planned_for"].isoformat() if e["planned_for"] else None,
                         "basis": "demo" if e["demo"] else "recorded", "at": e["at"].astimezone(KST).isoformat(timespec="seconds")} for e in ev]
    out["same_parcel"] = [dict(o) for o in others]
    out["allowed_next"] = sorted(TRANSITIONS.get(row["state"], set()))
    out["as_of"] = AS_OF
    return out


@router.get("/survey/parcels/{pnu}")
async def parcel(pnu: str, request: Request, with_: str | None = None):
    p = _read(principal(request))
    if not PNU_RE.match(pnu):
        raise ApiError("bad_request", "pnu 는 19자리 숫자")
    want = set(_list_param(request.query_params.get("with") or with_ or "facts,findings,history",
                           {"facts", "findings", "history", "geom", "all"}, "with"))
    if "all" in want:
        want = {"facts", "findings", "history", "geom"}
    try:
        async with db(p) as conn:
            pr = await _parcel(conn, pnu)
            if not pr:
                raise ApiError("not_found", f"필지 {pnu} 없음(남원 연속지적 밖이거나 다른 기관)")
            out = {"pnu": pnu, "addr": pr["addr"], "emd": pr["emd"], "emd_cd": pr["emd_cd"], "ri": pr["ri"], "jibun": pr["jibun"],
                   "as_of": AS_OF, "source": "PostGIS survey_parcels ← survey/namwon-parcel-survey.gpkg", "fixed": FIXED_PHRASE}
            if "facts" in want:
                out["facts"] = X.parcel_facts(pr)
            if "findings" in want:
                rows = await conn.fetch(f"SELECT {FCOLS} FROM survey_findings WHERE pnu=$1 ORDER BY score DESC", pnu)
                cut = await _cut(conn)
                out["findings"] = [X.finding_item(_row(r)) | {"explain": X.explain(_row(r), pr, cut)} for r in rows]
                if not rows:
                    out["findings_note"] = "규칙 R1–R6 어디에도 걸리지 않은 필지"
            if "history" in want:
                hist, summ, hnote = await _history(conn, pnu)
                out["history"] = hist
                out["history_summary"] = summ
                if hnote:
                    out["history_note"] = hnote
            if "geom" in want:
                out["geometry"] = json.loads(await conn.fetchval("SELECT ST_AsGeoJSON(geom, 7) FROM survey_parcels WHERE pnu=$1", pnu))
    except asyncpg.UndefinedTableError as e:
        _err_missing(e)
    return out


@router.get("/survey/stats")
async def stats(request: Request, by: str = "emd"):
    p = _read(principal(request))
    if by not in ("emd", "rule", "priority", "state"):
        raise ApiError("bad_request", "by 는 emd|rule|priority|state")
    src = "PostGIS survey_findings (= " + SRC_SUMMARY + ")"
    E = lambda v, note="검수 전": X.env(int(v), "count", "inferred", src, note)  # noqa: E731
    try:
        async with db(p) as conn:
            if by == "emd":
                emd = await conn.fetch("SELECT emd_cd, name, names, parcels, area_ha, top5, bbox, suspect_parcels FROM survey_emd ORDER BY emd_cd")
                cnt = await conn.fetch("SELECT emd_cd, rule, priority, state, count(*) n FROM survey_findings GROUP BY 1,2,3,4")
                agg: dict = {}
                for r in cnt:
                    a = agg.setdefault(r["emd_cd"], {"rule": {}, "prio": {}, "state": {}, "n": 0})
                    a["n"] += r["n"]
                    a["rule"][r["rule"]] = a["rule"].get(r["rule"], 0) + r["n"]
                    a["prio"][r["priority"]] = a["prio"].get(r["priority"], 0) + r["n"]
                    a["state"][r["state"]] = a["state"].get(r["state"], 0) + r["n"]
                items = []
                for e in emd:
                    a = agg.get(e["emd_cd"], {"rule": {}, "prio": {}, "state": {}, "n": 0})
                    items.append({"key": e["name"], "cd": e["emd_cd"], "names": list(e["names"]),
                                  "parcels": X.env(e["parcels"], "필지", "measured", "survey/namwon-parcels.gpkg"),
                                  "area_ha": X.env(e["area_ha"], "ha", "measured", SRC_SUMMARY),
                                  "n": E(a["n"]), "suspect_parcels": X.env(int(e["suspect_parcels"] or 0), "필지", "inferred", "survey_emd(적재 검증 = 요약 json)", "검수 전"),
                                  "by_rule": {r: E(a["rule"].get(r, 0)) for r in RULE_IDS},
                                  "by_priority": {k: E(a["prio"].get(k, 0)) for k in "ABC"},
                                  "by_state": {s: X.env(int(a["state"].get(s, 0)), "count", "recorded", "survey_findings.state") for s in STATES},
                                  "top5": [{"pnu": t["pnu"], "rule": t["rule"], "priority": t["priority"], "addr": t["addr"],
                                            "rank": X.env(t["rank"], "count", "estimate", SRC_SUSPECTS),
                                            "evid_m2": X.env(t["evid_m2"], "m2", "inferred", SRC_SUMMARY, "검수 전")} for t in (e["top5"] or [])],
                                  "bbox": list(e["bbox"] or [])})
            elif by == "rule":
                rows = await conn.fetch("SELECT rule, priority, count(*) n FROM survey_findings GROUP BY 1,2")
                defs = RL.definitions()
                a: dict = {}
                for r in rows:
                    a.setdefault(r["rule"], {})[r["priority"]] = r["n"]
                items = [{"key": rid, "name": defs[rid]["name"], "condition": RL.condition_text(rid),
                          "n": E(sum(a.get(rid, {}).values())), "by_priority": {k: E(a.get(rid, {}).get(k, 0)) for k in "ABC"},
                          "note": defs[rid].get("note")} for rid in RULE_IDS]
            elif by == "priority":
                rows = {r["priority"]: r["n"] for r in await conn.fetch("SELECT priority, count(*) n FROM survey_findings GROUP BY 1")}
                cut = await _cut(conn)
                rc = (cut or {}).get("readme", {})
                items = [{"key": "A", "n": E(rows.get("A", 0)), "score_ge": X.env(rc.get("A_score_ge"), "score", "estimate", SRC_SUMMARY, "전체 점수 상위 5%")},
                         {"key": "B", "n": E(rows.get("B", 0)), "score_ge": X.env(rc.get("B_score_ge"), "score", "estimate", SRC_SUMMARY, "다음 20%")},
                         {"key": "C", "n": E(rows.get("C", 0)), "score_ge": None}]
            else:
                rows = {r["state"]: r["n"] for r in await conn.fetch("SELECT state, count(*) n FROM survey_findings GROUP BY 1")}
                items = [{"key": s, "n": X.env(int(rows.get(s, 0)), "count", "recorded", "survey_findings.state · survey_finding_events")} for s in STATES]
            total = await conn.fetchval("SELECT count(*) FROM survey_findings")
            parcels_n = await conn.fetchval("SELECT coalesce(sum(parcels),0) FROM survey_emd")
    except asyncpg.UndefinedTableError as e:
        _err_missing(e)
    return {"by": by, "items": items, "total": E(total, "의심 후보 · 검수 전 · 위법 판정 아님"),
            "parcels": X.env(int(parcels_n), "필지", "measured", "survey/namwon-parcels.gpkg"), "as_of": AS_OF, "source": src}


@router.get("/survey/rules")
async def rules_(request: Request):
    p = _read(principal(request))
    try:
        async with db(p) as conn:
            rows = await conn.fetch("SELECT id, name, condition, thresholds, basis, counts, base_score, note FROM survey_rules ORDER BY id")
    except asyncpg.UndefinedTableError as e:
        _err_missing(e)
    defs = RL.definitions()
    items = []
    for r in rows:
        c = r["counts"] or {}
        items.append({"id": r["id"], "name": r["name"], "condition": r["condition"], "basis": "estimate",
                      "thresholds": [{"key": k, "label": X.TH_LABEL.get(k, (k, ""))[0],
                                      "value": X.env(v, X.TH_LABEL.get(k, ("", "ratio"))[1] or "ratio", "estimate",
                                                     f"server/survey/rules/{r['id']}.yaml", "[추정 초기값] · 법령 기준 아님")}
                                     for k, v in (r["thresholds"] or {}).items()],
                      "threshold_basis": defs[r["id"]].get("threshold_basis"), "jimok": defs[r["id"]]["jimok"],
                      "requires": defs[r["id"]].get("requires"),
                      "base_score": X.env(r["base_score"], "score", "estimate", "s3_survey.py BASE_SCORE"),
                      "counts": {k: X.env(v, "count", "inferred", SRC_SUSPECTS, "검수 전") for k, v in c.items()},
                      "note": r["note"]})
    return {"items": items, "total": X.env(len(items), "count", "recorded", "server/survey/rules/*.yaml"), "as_of": AS_OF,
            "note": "임계는 전부 [추정 초기값] — 현장조사 결과로 보정. 공통: 객체 과반 포함 0.5 · 신뢰도 하한 0.5"}


# ─────────────────────────── 상태 쓰기(1차 유일한 쓰기) ───────────────────────────
async def _publish(tenant: str, data: dict):
    r = await redis()
    raw = json.dumps(data, ensure_ascii=False)
    # 기관 스트림(v1.1-16 · F2-B /events/tenant 가 tail) + 관제 스트림(§5.2)
    await r.xadd(f"events:tenant:{tenant}", {"event": "finding.state", "data": raw}, maxlen=10000, approximate=True)
    await r.expire(f"events:tenant:{tenant}", 7 * 86400)
    await r.xadd("ops:events", {"event": "finding.state", "data": raw}, maxlen=5000, approximate=True)


@router.post("/survey/findings/{fid}/state")
async def set_state(fid: str, body: dict, request: Request):
    p = require(principal(request))
    if p.realm == "tenant" and p.role != "manager":
        raise ApiError("forbidden", "기관 담당자(manager)만 상태를 바꿀 수 있습니다")
    if p.realm == "lx" and p.role not in ("staff", "admin"):
        raise ApiError("forbidden", "LX 영업 계정은 읽기 전용")
    to = body.get("state")
    if to not in ("assigned", "dismissed", "inspected", "closed"):
        raise ApiError("bad_request", "state 는 assigned|dismissed|inspected|closed")
    cid = str(body.get("client_id") or "").strip()
    if not cid or len(cid) > 80:
        raise ApiError("bad_request", "client_id(멱등 키 · 80자 이하) 필수")
    reason = (body.get("reason") or None)
    assignee = (body.get("assignee") or None)
    planned = body.get("planned_for")
    pdate = None
    if planned:
        try:
            pdate = dt.date.fromisoformat(str(planned)[:10])
        except Exception:
            raise ApiError("bad_request", "planned_for = YYYY-MM-DD")
    if to == "dismissed" and not reason:
        raise ApiError("bad_request", "오탐(dismissed)은 사유(reason) 필수")
    demo = p.realm == "lx"
    by = p.user_id or "unknown"
    try:
        async with db(p) as conn:
            dup = await conn.fetchrow("SELECT finding_id, from_state, to_state, at FROM survey_finding_events WHERE client_id=$1", cid)
            if dup:
                if dup["finding_id"] != fid:
                    raise ApiError("conflict", "client_id 가 다른 finding 에 이미 쓰였습니다", {"client_id": cid}, 409)
                r = await conn.fetchrow(f"SELECT {FCOLS} FROM survey_findings WHERE id=$1", fid)
                out = X.finding_item(_row(r))
                out["idempotent"] = True
                out["event"] = {"from": dup["from_state"], "to": dup["to_state"], "at": dup["at"].astimezone(KST).isoformat(timespec="seconds")}
                return out
            r = await conn.fetchrow(f"SELECT {FCOLS} FROM survey_findings WHERE id=$1 FOR UPDATE", fid)
            if not r:
                raise ApiError("not_found", f"finding {fid} 없음")
            cur = r["state"]
            allowed = TRANSITIONS.get(cur, set())
            if to not in allowed:
                raise ApiError("finding_state_invalid", f"{cur} → {to} 전이 불가(역방향·종결 뒤 변경 금지)",
                               {"from": cur, "to": to, "allowed": sorted(allowed)}, 409)
            now = dt.datetime.now(KST)
            new_assignee = assignee if to == "assigned" else r["assignee"]
            await conn.execute("UPDATE survey_findings SET state=$2, assignee=$3, planned_for=COALESCE($4, planned_for), reason=$5, "
                               "updated_at=$6, updated_by=$7, demo=$8 WHERE id=$1",
                               fid, to, new_assignee, pdate, reason, now, by, demo or bool(r["demo"]))
            await conn.execute("INSERT INTO survey_finding_events(tenant_id, finding_id, from_state, to_state, by, realm, reason, assignee, "
                               "planned_for, demo, at, client_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
                               r["tenant_id"], fid, cur, to, by, p.realm, reason, new_assignee, pdate, demo, now, cid)
            await audit(conn, p, "finding.state", fid, {"state": cur}, {"state": to, "reason": reason, "assignee": new_assignee,
                                                                      "planned_for": planned, "client_id": cid, "demo": demo})
            r2 = await conn.fetchrow(f"SELECT {FCOLS} FROM survey_findings WHERE id=$1", fid)
    except asyncpg.UndefinedTableError as e:
        _err_missing(e)
    at = now.isoformat(timespec="milliseconds")
    data = {"id": fid, "pnu": r["pnu"], "rule": r["rule"], "priority": r["priority"], "emd_cd": r["emd_cd"], "from": cur, "to": to,
            "by": by, "realm": p.realm, "assignee": new_assignee, "reason": reason, "client_id": cid, "at": at,
            "lnglat": [r["lon"], r["lat"]], "basis": "demo" if demo else "recorded", "tenant_id": r["tenant_id"]}
    await _publish(r["tenant_id"], data)
    out = X.finding_item(_row(r2))
    out["event"] = {"from": cur, "to": to, "at": at, "basis": data["basis"]}
    out["allowed_next"] = sorted(TRANSITIONS.get(to, set()))
    if demo:
        out["demo_note"] = f"LX 직원 시연 쓰기 — basis 'demo' · {DEMO_TTL_H}h 뒤 자동 원복"
    return out


# ─────────────────────────── 보고서 초안(LLM 없이) ───────────────────────────
@router.get("/survey/reports/draft")
async def report_draft(request: Request, emd_cd: str, rule: str | None = None, top: int = 20, format: str = "json"):
    p = _read(principal(request))
    if not EMD_RE.match(emd_cd):
        raise ApiError("bad_request", "emd_cd = 법정동 8자리(예 52190450)")
    if rule and rule not in RULE_IDS:
        raise ApiError("bad_request", "rule 은 R1..R6")
    if format not in ("json", "docx"):
        raise ApiError("bad_request", "format 은 json|docx")
    top = max(1, min(int(top), 200))
    from survey import report
    realm, tenant = p.rls()
    try:
        d = await run_in_threadpool(report.collect, emd_cd, rule, top, realm, tenant)
    except report.NotFound as e:
        raise ApiError("not_found", str(e))
    if format == "json":
        return report.as_json(d)
    blob, name = await run_in_threadpool(report.render_docx, d, None)
    q = urllib.parse.quote(name)
    return Response(blob, media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    headers={"Content-Disposition": f"attachment; filename=\"survey-draft-{emd_cd}.docx\"; filename*=UTF-8''{q}",
                             "X-LX-Report-Name": q, "Cache-Control": "no-store"})
