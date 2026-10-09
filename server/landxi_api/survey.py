"""실태조사 API(F2-S · F1-CONTRACT v1.1-22) — `/api/v1/survey/*` 읽기 5 + 상태 쓰기 1 + 보고서 초안 1
+ 전국화(core-survey · contract-parcel-ai.md): POST /survey/build · GET /survey/build/{sgg} · GET /survey/regions · ?sgg= 필터.

정본 = PostGIS survey_* 표(server/survey/pipelines/s5_load_pg.py 가 02. 데이터/survey/ 에서 적재 · README 표와 count 검증).
관문: 게스트 401 · realm tenant 는 RLS 로 자기 기관 행만 · lx staff/admin/sales 읽기. 지역은 데이터(survey_sgg · sgg_cd)에서 — 고정값 없음.
쓰기(POST …/state): tenant manager(자기 기관) · lx staff/admin(시연 쓰기 · basis 'demo' · 24h 뒤 자동 원복). 성명 열 없음.
main.py 확장 훅(F2-B · `importlib.import_module("landxi_api.survey")`)이 이 router 를 /api/v1 에 붙인다.

숫자 한 출처(c2-numbers) — survey_counts(conn, sgg) 하나를 /survey/stats · /summary · 에이전트(survey_stats · summary_lookup) · 보고서가 쓴다.
  의심 필지      = 그 시군구 AI × 연속지적 규칙 R1–R6 의심 행(시군구 실태조사 + 카드 판 · 적재 때 확정 · 상태로 줄지 않음 · 대장 규칙 L-* 제외)
  카드(서비스) 숫자는 card= 로 그 카드 판만(survey_card · survey_findings.card_id — 모델-표기 ⓐ · 카드마다 따로)
  현장 확인 필요 = 같은 시군구 R1–R6 의심 중 우선순위 A · 판정 전(open · 옛 기록 assigned) 서로 다른 필지 수(판정·오탐 처리로 준다)
  적재 중(building)이면 두 값 모두 None + note '집계 중'. 정의·원인 기록 = survey/nation.py '숫자 한 출처' 절.
"""
from __future__ import annotations

import asyncio
import datetime as dt
import json
import re
import secrets
import time
import urllib.parse

import asyncpg
from fastapi import APIRouter, Request
from fastapi.responses import Response
from starlette.concurrency import run_in_threadpool

from . import ledger as LG
from . import regions as RG
from .deps import ApiError, audit, db, principal, redis, require
from .envelope import KST, env, now_iso

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from survey import explain as X  # noqa: E402
from survey import rules as RL  # noqa: E402
from survey import nation as NT  # noqa: E402
from survey.db import AS_OF, FIXED_PHRASE, RULE_IDS, SRC_SUMMARY, SRC_SUSPECTS, STATES  # noqa: E402

router = APIRouter()

FCOLS = ("id, rank, priority, score, rule, rule_nm, pnu, addr, emd, emd_cd, jimok, parcel_m2, yongdo, nongup, evid_m2, conf, "
         "corroboration, img_date, evidence, ai_ids, lon, lat, state, assignee, planned_for, reason, updated_at, updated_by, demo, tenant_id, "
         "verdict, verdict_code, note, import_id")
PCOLS_ALL = "*"
# 현장 확인 배정은 만들지 않는다(원칙 40 · 확인 FR-14 반려) — 판정 전(open) 필지를 바로 확인(inspected) → 종결(closed) 또는 오탐(dismissed).
# 'assigned' 는 옛 기록(배정 기능이 있던 때)의 상태로만 남는다 — 그 필지도 같은 길로 판정한다. 새로 'assigned' 로 바꾸는 길은 없다.
TRANSITIONS = {"open": {"inspected", "dismissed"}, "assigned": {"inspected", "dismissed"}, "inspected": {"closed"},
               "closed": set(), "dismissed": set()}
WRITE_STATES = ("dismissed", "inspected", "closed")
SORTS = {"score": "score DESC, rank ASC", "evid_m2": "evid_m2 DESC NULLS LAST, rank ASC", "updated": "updated_at DESC NULLS LAST, rank ASC",
         "rank": "rank ASC"}
PNU_RE = re.compile(r"^\d{19}$")
EMD_RE = re.compile(r"^\d{8}$")
DEMO_TTL_H = 24
_revert = {"t": 0.0}


# ─────────────────────────── 숫자 한 출처(c2-numbers) ───────────────────────────
SUSPECT_LABEL, FIELD_LABEL = "의심 필지", "현장 확인 필요"


async def card_all_rules(card: str) -> bool:
    """카드의 가장 최근 판이 규칙을 고르지 않았나(전 규칙 = 시군구 실태조사와 같은 범위) — 카드 판이 아직 없을 때 시군구 실태조사로 이을지."""
    async with db(realm="lx") as c:
        m = await c.fetchval("SELECT modules FROM card_versions WHERE card_id=$1 ORDER BY approved_at DESC NULLS LAST, id DESC LIMIT 1", card)
    return not (isinstance(m, dict) and isinstance(m.get("rules"), list) and m.get("rules"))


async def survey_counts_scoped(conn) -> dict:
    """대표 수치 요약(카드 × 지역 항목)용 — {"card": {(sgg, card): 값}, "base": {sgg: 값}}. 값 = counts_from_rows 의 by_sgg 한 칸 모양."""
    out: dict = {"card": {}, "base": {}}
    for r in await conn.fetch(NT.counts_sql("pg", "card"), NT.COUNT_RULES, None, None):
        v = NT.counts_from_rows([dict(r)])["by_sgg"][r["sgg_cd"]]
        out["card"][(r["sgg_cd"], r["card_id"])] = v
    for r in await conn.fetch(NT.counts_sql("pg", "base"), NT.COUNT_RULES, None):
        out["base"][r["sgg_cd"]] = NT.counts_from_rows([dict(r)])["by_sgg"][r["sgg_cd"]]
    return out


async def survey_counts(conn, sgg: str | list[str] | None = None, card: str | None = None) -> dict:
    """→ {sgg_cd, state, suspect, field_check, review_pending, as_of, by_sgg}(정수 · 집계 중이면 None).
    conn = 호출자 연결(RLS 그대로 — 기관 세션은 자기 기관 시군구만). sgg: 코드 5자리(지금/옛) · 목록 · None(볼 수 있는 전체).
    card: 그 카드 판만(모델-표기 ⓐ — 카드마다 따로). 카드 판이 없는 시군구는, 규칙을 고르지 않은(전 규칙) 카드면 시군구 실태조사로."""
    if isinstance(sgg, (list, tuple, set)):
        cs = sorted({c for x in sgg for c in NT.codes(str(x)[:5])}) or None
        one = None
    elif sgg:
        cs = NT.codes(str(sgg)[:5])
        try:
            one = NT.region(str(sgg)[:5])["sgg_cd"]
        except NT.BuildError:
            one = str(sgg)[:5]
    else:
        cs, one = None, None
    if not card:
        rows = await conn.fetch(NT.counts_sql("pg"), NT.COUNT_RULES, cs)
        return NT.counts_from_rows([dict(r) for r in rows], one)
    rows = [dict(r) for r in await conn.fetch(NT.counts_sql("pg", "card"), NT.COUNT_RULES, cs, card)]
    if cs and await card_all_rules(card):
        have = {r["sgg_cd"] for r in rows}
        rows += [dict(r) for r in await conn.fetch(NT.counts_sql("pg", "base"), NT.COUNT_RULES, cs) if r["sgg_cd"] not in have]
    return NT.counts_from_rows(rows, one)


def counts_env(c: dict, key: str) -> dict:
    """survey_counts 값 → 봉투(이름 · 단위 · 출처 · '집계 중' 한 규칙)."""
    busy = c.get("state") == "building"
    v = c.get(key)
    note = NT.COUNTING if busy else (None if v is not None else "실태조사 결과 없음")
    if key == "suspect":
        return X.env(v, "count", "inferred", NT.SUSPECT_SRC, note or "의심 후보 · 검수 전 · 위법 판정 아님", as_of=c.get("as_of") or AS_OF)
    if key == "field_check":
        return X.env(v, "필지", "inferred", NT.FIELD_SRC, note or "현장 확인 전", as_of=now_iso())
    return X.env(v, "count", "recorded", "실태조사 의심 중 우선순위 A · 미조치", note, as_of=now_iso())


def all_rule_ids() -> list[str]:
    """R1–R6(연속지적 × AI) + L-*(대장 × AI × V-World · F3 §3 S-2)."""
    return list(RULE_IDS) + LG.rule_ids()


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
    if q.get("sgg"):
        add("sgg_cd = ANY(?::text[])", q["sgg"])
    if q["state"] and skip != "state":
        add("state = ANY(?::text[])", q["state"])
    if q["bbox"]:
        add("geom && ST_MakeEnvelope(?, ?, ?, ?, 4326)", *q["bbox"])
    if q["q"]:
        add("(addr ILIKE '%' || ? || '%' OR pnu LIKE ? || '%')", q["q"], q["q"])
    if q["pnu"]:
        add("pnu = ANY(?::text[])", q["pnu"])
    if q.get("ledger") is not None:
        add("pnu IN (SELECT pnu FROM registry_snapshots WHERE import_id = ANY(?::text[]) AND pnu IS NOT NULL)", q["ledger"])
    if q.get("scope"):
        add(SCOPE_SQL, *q["scope"])
    return w, a


# 한 서비스(카드)의 필지 대조 행만(모델-표기 ⓐ · 카드마다 따로) — 카드 판이 있는 시군구는 그 카드 행, 없는 시군구는(전 규칙 카드만) 시군구 실태조사 행
SCOPE_SQL = "((card_id = ? AND sgg_cd = ANY(?::text[])) OR (card_id IS NULL AND sgg_cd = ANY(?::text[])))"


async def card_scope(card: str, sg: list[str] | None) -> tuple:
    """(카드, 카드 판 시군구, 시군구 실태조사로 잇는 시군구) — summary · 카드 숫자와 같은 판정(survey_counts card=)."""
    async with db(realm="lx") as c:
        own = {r["sgg_cd"] for r in await c.fetch("SELECT sgg_cd FROM survey_card WHERE card_id=$1 AND ($2::text[] IS NULL OR sgg_cd = ANY($2::text[]))",
                                                  card, sg or None)}
        base: set = set()
        if await card_all_rules(card):
            base = {r["s"] for r in await c.fetch("SELECT DISTINCT sgg_cd s FROM deploys WHERE card_id=$1 AND sgg_cd IS NOT NULL", card)}
            if sg:
                base = (base | set(sg)) & set(sg)
            base -= own
    return (card, sorted(own), sorted(base))


def sgg_codes(v: str | None) -> list[str]:
    """?sgg= / ?region= (쉼표 여러 개 · 지금/옛 코드) → 시군구 코드 목록(지금 코드 · 옛 코드 둘 다 — 표의 sgg_cd 는 지금 코드)."""
    out: list[str] = []
    for x in _list_param(v, None):
        if not re.match(r"^\d{5}$", x):
            raise ApiError("bad_request", "sgg 는 시군구 코드 5자리")
        out += NT.codes(x)
    return sorted(set(out))


def _where(w):
    return ("WHERE " + " AND ".join(w)) if w else ""


def _row(r) -> dict:
    return dict(r)


@router.get("/survey/findings")
async def findings(request: Request, rule: str | None = None, priority: str | None = None, emd_cd: str | None = None,
                   state: str | None = None, bbox: str | None = None, q: str | None = None, pnu: str | None = None,
                   deploy_id: str | None = None, sort: str = "score", limit: int = 200, offset: int = 0, ledger: str | None = None,
                   sgg: str | None = None, region: str | None = None, card: str | None = None):
    p = _read(principal(request))
    _kick_emd_sweep()
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
    rids = all_rule_ids()
    qq = {"rule": _list_param(rule, set(rids), "rule"), "priority": _list_param(priority, {"A", "B", "C"}, "priority"),
          "emd_cd": _list_param(emd_cd, None), "state": _list_param(state, set(STATES), "state"), "bbox": bb,
          "q": (q or "").strip()[:60] or None, "pnu": _list_param(pnu, None), "sgg": sgg_codes(sgg or region)}
    if ledger:
        qq["ledger"] = await LG.resolve_ledger_param(p, ledger)
    if card:                                       # 그 서비스의 필지 대조 행만(서비스 대시보드 · 카드 숫자와 같은 범위)
        qq["scope"] = await card_scope(card, qq["sgg"] or None)
    try:
        async with db(p) as conn:
            if deploy_id:
                t = await conn.fetchval("SELECT tenant_id FROM deploys WHERE id=$1", deploy_id)
                if t is None:
                    raise ApiError("not_found", f"deploy {deploy_id} 없음")
                if not await conn.fetchval("SELECT EXISTS(SELECT 1 FROM survey_findings WHERE tenant_id=$1)", t):
                    qq["pnu"] = ["__none__"]      # 이 배포본의 기관에는 실태조사 정본이 아직 없다(지역 고정값 없음 — 표에서 판정)
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
    rc = {rid: 0 for rid in rids}
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
    return {"items": [X.finding_item(_row(r)) | {"verdict": r["verdict"], "verdict_code": r["verdict_code"]} for r in rows],
            "total": X.env(int(total), "count", "inferred", "PostGIS survey_findings", "의심 후보 · 검수 전 · 위법 판정 아님"),
            "counts": counts, "by_rule": by_rule, "limit": limit, "offset": offset, "sort": sort,
            "filters": {k: v for k, v in qq.items() if v and k not in ("pnu", "ledger", "sgg", "scope")} | ({"sgg": sgg or region} if (sgg or region) else {}) | ({"deploy_id": deploy_id} if deploy_id else {})
            | ({"card": card} if card else {})
            | ({"ledger": ledger} if ledger else {}),
            "as_of": AS_OF, "source": SRC_SUSPECTS, "fixed": FIXED_PHRASE,
            "db_ms": X.env(round((time.perf_counter() - t0) * 1000, 1), "ms", "measured", "gateway survey.findings · SQL 구간만(조회·집계 · 직렬화 제외 — 서버 전체 처리는 응답 헤더 X-LX-Time-ms)")}


async def _parcel(conn, pnu: str) -> dict | None:
    r = await conn.fetchrow("SELECT p.*, NULL AS geom FROM survey_parcels p WHERE pnu=$1", pnu)
    if not r:
        return None
    d = dict(r)
    if d.get("src") not in (None, "canon"):
        d.update(await _ai_view(conn, d))
    return d


def _pg_params(sql: str, names: list[str]) -> str:
    for i, n in enumerate(names, 1):
        sql = sql.replace(f"%({n})s", f"${i}")
    return sql


async def _ai_view(conn, d: dict) -> dict:
    """전국 경로 필지 — survey_parcel_ai(그 시군구 현재 AI 작업)를 옛 피연산자 이름(a23_* · r23_* · a25_* · chg)으로 펼친다."""
    s = await conn.fetchrow("SELECT job_id, imagery FROM survey_sgg WHERE sgg_cd=$1", d.get("sgg_cd"))
    if not s or not s["job_id"]:
        return {"_img": None}
    sql = _pg_params(f"SELECT * FROM ({RL.ai_src('WHERE sp.sgg_cd = %(sgg)s AND sp.pnu = %(pnu)s')}) q", ["job", "sgg", "pnu"])
    r = await conn.fetchrow(sql, s["job_id"], d["sgg_cd"], d["pnu"])
    out = {"_img": s["imagery"], "_job_id": s["job_id"]}
    if r:
        r = dict(r)
        out.update({NT.LEGACY_OF[k]: (r[k] if r[k] is not None or k.endswith("_conf") else 0) for k in NT.LEGACY_OF if k in r})
        area = max(float(d.get("area_m2") or 1), 1.0)
        for c in ("bld", "crop", "park", "gh"):
            out[f"r23_{c}"] = round(min(float(r.get(f"{c}_hit") or 0) / area, 1.0), 3)
    for pnu_, c, i in await conn.fetch("SELECT pnu, cls, ids FROM survey_parcel_ai WHERE job_id=$1 AND pnu=$2", s["job_id"], d["pnu"]):
        out[f"a23_{c}_ids"] = i
    return out


async def _cut(conn, sgg: str | None = None) -> dict | None:
    """등급 절단 — 전국 경로 시군구는 그 시군구 안(survey_sgg.priority_cut) · 정본은 survey_meta."""
    if sgg:
        v = await conn.fetchval("SELECT priority_cut FROM survey_sgg WHERE sgg_cd=$1 AND NOT (parcels_src ? 'canon')", sgg)
        if v:
            return v
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
            cut = await _cut(conn, row.get("sgg_cd") or row["pnu"][:5])
            hist, summ, hnote = await _history(conn, row["pnu"])
            ev = await conn.fetch("SELECT from_state, to_state, by, realm, reason, assignee, planned_for, demo, at, verdict, verdict_code, note FROM survey_finding_events "
                                  "WHERE finding_id=$1 ORDER BY at", fid)
            others = await conn.fetch("SELECT id, rule, rule_nm, priority, state FROM survey_findings WHERE pnu=$1 AND id<>$2", row["pnu"], fid)
    except asyncpg.UndefinedTableError as e:
        _err_missing(e)
    out = X.finding_item(row)
    out["explain"] = LG.explain_ledger(row, parcel) if row["rule"] not in RULE_IDS else X.explain(row, parcel or {}, cut)
    for k in ("verdict", "verdict_code", "note", "import_id"):
        out[k] = row.get(k)
    out["history"] = hist
    out["history_summary"] = summ
    if hnote:
        out["history_note"] = hnote
    out["state_log"] = [{"from": e["from_state"], "to": e["to_state"], "by": e["by"], "realm": e["realm"], "reason": e["reason"],
                         "verdict": e["verdict"], "verdict_code": e["verdict_code"], "note": e["note"],
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
    if p.realm == "tenant" and not RG.region_allowed(p, pnu[:5]):
        raise ApiError("not_found", f"필지 {pnu} 없음(적재된 연속지적 밖이거나 다른 기관)")     # 관할 밖 필지 = 없는 필지(원칙 39)
    want = set(_list_param(request.query_params.get("with") or with_ or "facts,findings,history",
                           {"facts", "findings", "history", "geom", "ledger", "all"}, "with"))
    if "all" in want:
        want = {"facts", "findings", "history", "geom", "ledger"}
    try:
        async with db(p) as conn:
            pr = await _parcel(conn, pnu)
            if not pr:
                raise ApiError("not_found", f"필지 {pnu} 없음(적재된 연속지적 밖이거나 다른 기관)")
            out = {"pnu": pnu, "addr": pr["addr"], "emd": pr["emd"], "emd_cd": pr["emd_cd"], "ri": pr["ri"], "jibun": pr["jibun"],
                   "sgg_cd": pr.get("sgg_cd"), "as_of": pr.get("src_as_of") or AS_OF,
                   "parcel_source": {"canon": "연속지적(적재 정본)", "lsmd": "연속지적(전국)", "vworld": "V-World 연속지적"}.get(pr.get("src") or "canon"),
                   "source": f"PostGIS survey_parcels(src {pr.get('src') or 'canon'})", "fixed": FIXED_PHRASE}
            if "facts" in want:
                out["facts"] = X.parcel_facts(pr, img=pr.get("_img"))
            if "findings" in want:
                rows = await conn.fetch(f"SELECT {FCOLS} FROM survey_findings WHERE pnu=$1 ORDER BY score DESC", pnu)
                cut = await _cut(conn, pr.get("sgg_cd"))
                out["findings"] = [X.finding_item(_row(r)) | {"explain": LG.explain_ledger(_row(r), pr) if r["rule"] not in RULE_IDS
                                                              else X.explain(_row(r), pr, cut)} for r in rows]
                if not rows:
                    out["findings_note"] = "어떤 규칙에도 걸리지 않은 필지"
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
    if "ledger" in want:
        out["ledger"] = await LG.ledger_rows(p, pnu)
        if not out["ledger"]:
            out["ledger_note"] = "이 필지는 올린 대장에 없습니다"
    return out


@router.get("/survey/stats")
async def stats(request: Request, by: str = "emd", ledger: str | None = None, sgg: str | None = None, region: str | None = None,
                card: str | None = None):
    """집계 — 합계(total) = survey_counts '의심 필지'(R1–R6 · 한 출처). 읍면동·등급·상태 칸도 R1–R6 만 센다(칸 합 = 합계).
    대장 규칙(L-*)은 by=rule 의 L 항목과 by=emd&ledger= 의 ledger_findings 로만 나온다. 적재 중이면 칸 없이 '집계 중'."""
    p = _read(principal(request))
    _kick_emd_sweep()
    sg = sgg_codes(sgg or region)
    fw = " WHERE sgg_cd = ANY($1::text[])" if sg else ""        # survey_emd 공통
    fa = [sg] if sg else []
    rw = (" AND " if sg else " WHERE ") + f"rule = ANY(${len(fa) + 1}::text[])"      # survey_findings: R1–R6 만
    ra = fa + [list(RULE_IDS)]
    if card:                                       # 그 서비스의 필지 대조 행만(카드 숫자 · 서비스 대시보드와 같은 범위 · 모델-표기 ⓐ)
        sc = await card_scope(card, sg or None)
        k = len(ra)
        rw += " AND " + SCOPE_SQL.replace("?", f"${k + 1}", 1).replace("?", f"${k + 2}", 1).replace("?", f"${k + 3}", 1)
        ra = ra + list(sc)
    led_ids = await LG.resolve_ledger_param(p, ledger) if ledger else None
    if by not in ("emd", "rule", "priority", "state"):
        raise ApiError("bad_request", "by 는 emd|rule|priority|state")
    src = NT.SUSPECT_SRC
    E = lambda v, note="검수 전": X.env(int(v), "count", "inferred", src, note)  # noqa: E731
    try:
        async with db(p) as conn:
            cnt_all = await survey_counts(conn, sg or None, card=card)
            busy = cnt_all["state"] == "building"
            items: list = []
            if busy:
                pass                                                      # 적재 중 — 칸 숫자를 섞어 내지 않는다
            elif by == "emd":
                emd = await conn.fetch(f"SELECT emd_cd, name, names, parcels, area_ha, top5, bbox, suspect_parcels FROM survey_emd{fw} ORDER BY emd_cd", *fa)
                cnt = await conn.fetch(f"SELECT emd_cd, rule, priority, state, count(*) n FROM survey_findings{fw}{rw} GROUP BY 1,2,3,4", *ra)
                # 읍면동별 현장 확인 필요 — 큰 숫자(survey_counts field_check)와 같은 식(R1–R6 · 우선순위 A · 판정 전 · 서로 다른 필지) ·
                # 칸 합 = 시군구 합(필지는 한 읍면동에만 있다). 기관 서비스 대시보드의 '읍면별 현장 확인 필요' 막대(기관-4 ⓐ)가 쓴다.
                fcm = {r["emd_cd"]: int(r["n"]) for r in await conn.fetch(
                    f"SELECT emd_cd, count(DISTINCT pnu) n FROM survey_findings{fw}{rw} AND priority = 'A' AND state IN ('open','assigned') GROUP BY 1", *ra)}
                agg: dict = {}
                for r in cnt:
                    a = agg.setdefault(r["emd_cd"], {"rule": {}, "prio": {}, "state": {}, "n": 0})
                    a["n"] += r["n"]
                    a["rule"][r["rule"]] = a["rule"].get(r["rule"], 0) + r["n"]
                    a["prio"][r["priority"]] = a["prio"].get(r["priority"], 0) + r["n"]
                    a["state"][r["state"]] = a["state"].get(r["state"], 0) + r["n"]
                for e in emd:
                    a = agg.get(e["emd_cd"], {"rule": {}, "prio": {}, "state": {}, "n": 0})
                    items.append({"key": e["name"], "cd": e["emd_cd"], "names": list(e["names"]),
                                  "parcels": X.env(e["parcels"], "필지", "measured", "survey_emd(연속지적 필지 수)"),
                                  "area_ha": X.env(e["area_ha"], "ha", "measured", SRC_SUMMARY),
                                  "n": E(a["n"]), "suspect_parcels": X.env(int(e["suspect_parcels"] or 0), "필지", "inferred", "survey_emd(적재 검증 = 요약 json)", "검수 전"),
                                  "field_check": X.env(fcm.get(e["emd_cd"], 0), "필지", "inferred", NT.FIELD_SRC, "현장 확인 전"),
                                  "by_rule": {r: E(a["rule"].get(r, 0)) for r in RULE_IDS},
                                  "by_priority": {k: E(a["prio"].get(k, 0)) for k in "ABC"},
                                  "by_state": {s: X.env(int(a["state"].get(s, 0)), "count", "recorded", "survey_findings.state") for s in STATES},
                                  "top5": [{"pnu": t["pnu"], "rule": t["rule"], "priority": t["priority"], "addr": RG.full_label(t["addr"]),
                                            "rank": X.env(t["rank"], "count", "estimate", SRC_SUSPECTS),
                                            "evid_m2": X.env(t["evid_m2"], "m2", "inferred", SRC_SUMMARY, "검수 전")} for t in (e["top5"] or [])],
                                  "bbox": list(e["bbox"] or [])})
                if led_ids is not None:
                    lm = {r["emd_cd"]: r for r in await conn.fetch(
                        "SELECT p.emd_cd, count(DISTINCT s.pnu) matched FROM registry_snapshots s JOIN survey_parcels p ON p.pnu=s.pnu "
                        "WHERE s.import_id = ANY($1::text[]) GROUP BY 1", led_ids)}
                    lf = {(r["emd_cd"], r["rule"]): r["n"] for r in await conn.fetch(
                        "SELECT emd_cd, rule, count(*) n FROM survey_findings WHERE import_id = ANY($1::text[]) GROUP BY 1,2", led_ids)}
                    lsrc = "대장 × 연속지적 매칭(registry_snapshots)"
                    for it in items:
                        it["ledger_matched"] = X.env(int((lm.get(it["cd"]) or {}).get("matched") or 0), "필지", "measured", lsrc)
                        it["ledger_findings"] = {rid: X.env(int(lf.get((it["cd"], rid), 0)), "count", "inferred", "규칙 L-* · 검수 전", "검수 전")
                                                 for rid in LG.rule_ids()}
            elif by == "rule":
                rows = await conn.fetch(f"SELECT rule, priority, count(*) n FROM survey_findings{fw}{rw} GROUP BY 1,2", *ra)
                defs = RL.definitions()
                a: dict = {}
                for r in rows:
                    a.setdefault(r["rule"], {})[r["priority"]] = r["n"]
                items = [{"key": rid, "name": defs[rid]["name"], "condition": RL.condition_text(rid),
                          "n": E(sum(a.get(rid, {}).values())), "by_priority": {k: E(a.get(rid, {}).get(k, 0)) for k in "ABC"},
                          "note": defs[rid].get("note")} for rid in RULE_IDS]
                lrows = await conn.fetch(f"SELECT rule, priority, count(*) n FROM survey_findings WHERE rule LIKE 'L%'{' AND sgg_cd = ANY($1::text[])' if sg else ''} GROUP BY 1,2", *fa)
                la: dict = {}
                for r in lrows:
                    la.setdefault(r["rule"], {})[r["priority"]] = r["n"]
                lsrc = "대장 규칙 L-* · 검수 전"
                for rid, d in LG.ledger_rules().items():
                    items.append({"key": rid, "name": d["name"], "condition": LG.condition_text(d), "requires": d.get("requires") or [],
                                  "n": X.env(int(sum(la.get(rid, {}).values())), "count", "inferred", lsrc, "검수 전 · 의심 필지 합계에 넣지 않음"),
                                  "by_priority": {k: X.env(int(la.get(rid, {}).get(k, 0)), "count", "inferred", lsrc, "검수 전") for k in "ABC"},
                                  "note": d.get("note")})
            elif by == "priority":
                rows = {r["priority"]: r["n"] for r in await conn.fetch(f"SELECT priority, count(*) n FROM survey_findings{fw}{rw} GROUP BY 1", *ra)}
                cut = await _cut(conn, sg[0] if len(sg) else None)
                rc = (cut or {}).get("readme") or {"A_score_ge": (cut or {}).get("A"), "B_score_ge": (cut or {}).get("B")}
                items = [{"key": "A", "n": E(rows.get("A", 0)), "score_ge": X.env(rc.get("A_score_ge"), "score", "estimate", SRC_SUMMARY, "시군구 전체 점수 상위 5%")},
                         {"key": "B", "n": E(rows.get("B", 0)), "score_ge": X.env(rc.get("B_score_ge"), "score", "estimate", SRC_SUMMARY, "다음 20%")},
                         {"key": "C", "n": E(rows.get("C", 0)), "score_ge": None}]
            else:
                rows = {r["state"]: r["n"] for r in await conn.fetch(f"SELECT state, count(*) n FROM survey_findings{fw}{rw} GROUP BY 1", *ra)}
                items = [{"key": s, "n": X.env(int(rows.get(s, 0)), "count", "recorded", "survey_findings.state · survey_finding_events")} for s in STATES]
            parcels_n = await conn.fetchval(f"SELECT coalesce(sum(parcels),0) FROM survey_emd{fw}", *fa)
    except asyncpg.UndefinedTableError as e:
        _err_missing(e)
    out_ledger = {"ledger": ledger, "imports": led_ids} if ledger else {}
    return {**out_ledger, "by": by, "items": items, "total": counts_env(cnt_all, "suspect"), "total_label": SUSPECT_LABEL,
            "field_check": counts_env(cnt_all, "field_check"), "state": cnt_all["state"],
            "parcels": X.env(int(parcels_n), "필지", "measured", "survey_emd(연속지적 필지 수)"), "as_of": cnt_all.get("as_of") or AS_OF,
            "source": src, **({"sgg": sgg or region} if sg else {}), **({"card": card} if card else {})}


@router.get("/survey/rules")
async def rules_(request: Request):
    p = _read(principal(request))
    try:
        async with db(p) as conn:
            rows = await conn.fetch("SELECT id, name, condition, thresholds, basis, counts, base_score, note, coalesce(reviewed,false) AS reviewed, "
                                    "reviewed_at FROM survey_rules ORDER BY id")
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
                      "note": r["note"], "reviewed": bool(r["reviewed"]),
                      "reviewed_at": r["reviewed_at"].astimezone(KST).isoformat(timespec="seconds") if r["reviewed_at"] else None})
    return {"items": items, "total": X.env(len(items), "count", "recorded", "server/survey/rules/*.yaml"), "as_of": AS_OF,
            "note": "임계는 전부 [추정 초기값] — 현장조사 결과로 보정. 공통: 객체 과반 포함 0.5 · 신뢰도 하한 0.5"}


# ─────────────────────────── 전국화: 시군구 적재(core-survey · contract-parcel-ai.md) ───────────────────────────
def _sgg_row(r) -> dict:
    """survey_sgg 한 행 → 응답(숫자는 봉투 · 집계 dict 는 counts 아래)."""
    d = dict(r)
    for k in ("at", "finished_at"):
        if d.get(k):
            d[k] = d[k].astimezone(KST).isoformat(timespec="seconds")
    asof = d.get("parcels_as_of")
    d["parcels"] = X.env(int(d.get("parcels") or 0), "필지", "measured", "survey_parcels(연속지적)", None, as_of=asof or AS_OF)
    d["joined_parcels"] = X.env(int(d.get("joined_parcels") or 0), "필지", "inferred", "survey_parcel_ai", "AI 결과가 겹친 필지 · 검수 전")
    busy = d.get("state") == "building"
    d["findings"] = X.env(None if busy else int(d.get("findings") or 0), "count", "inferred", NT.SUSPECT_SRC,
                          NT.COUNTING if busy else "의심 후보 · 검수 전 · 위법 판정 아님")
    if d.get("sido"):
        d["sido"] = RG.sido_label(d["sido"])
    d["counts"] = {"by_rule": d.pop("by_rule", None) or {}, "by_priority": d.pop("by_priority", None) or {},
                   "parcels_src": d.pop("parcels_src", None) or {}, "priority_cut": d.pop("priority_cut", None)}
    return d


SGG_COLS = ("sgg_cd, tenant_id, name, sido, state, parcels, parcels_src, parcels_as_of, joined_parcels, findings, by_rule, by_priority, "
            "priority_cut, imagery, bbox, error, at, finished_at")


@router.post("/survey/build", status_code=202)
async def survey_build(body: dict, request: Request):
    """시군구 실태조사 만들기 — 필지 적재 · AI 결합 · 규칙 · 의심(CPU 작업 · 게이트웨이 대기열). LX staff/admin(전국) · 기관 manager(관할)."""
    p = require(principal(request))
    if p.realm == "lx" and p.role not in ("staff", "admin"):
        raise ApiError("forbidden", "LX 영업 계정은 읽기 전용")
    if p.realm == "tenant" and p.role != "manager":
        raise ApiError("forbidden", "기관 담당자(manager)만 실행할 수 있습니다")
    raw = str((body or {}).get("sgg_cd") or (body or {}).get("region") or "").strip()
    if not re.match(r"^\d{5}$", raw):
        raise ApiError("bad_request", "sgg_cd = 시군구 코드 5자리")
    try:
        rg = NT.region(raw)
    except NT.BuildError:
        raise ApiError("not_found", "해당 지역이 없습니다", {"sgg_cd": raw})
    sgg = rg["sgg_cd"]
    tenant = NT.tenant_for(sgg)
    if p.realm == "tenant" and p.tenant_id != tenant:
        raise ApiError("forbidden", "관할 밖 시군구", {"sgg_cd": sgg})
    ai_job = (body or {}).get("job_id") or None
    async with db(realm="lx") as conn:
        run = await conn.fetchval("SELECT id FROM jobs WHERE kind='survey' AND state IN ('queued','running') AND options->>'build'='true' "
                                  "AND options->>'sgg_cd'=$1 LIMIT 1", sgg)
        if run:
            raise ApiError("survey_build_running", "이 시군구 실태조사를 만드는 중입니다", {"job_id": run, "sgg_cd": sgg}, 409)
        if ai_job:
            ok = await conn.fetchval("SELECT EXISTS(SELECT 1 FROM detections WHERE job_id=$1)", ai_job)
            if not ok:
                raise ApiError("not_found", "AI 결과가 없는 작업", {"job_id": ai_job})
        else:
            ai_job = await run_in_threadpool(_pick_job, sgg)
    from . import jobs as JB
    body2 = {"kind": "survey", "label": f"survey/build {sgg}", "options": {"build": True, "sgg_cd": sgg, "ai_job_id": ai_job,
                                                                            "force": bool((body or {}).get("force"))}}
    rules = (body or {}).get("rules")        # 서비스(카드 버전)에서 고른 규칙만(r3-train · 없으면 전체 규칙)
    if isinstance(rules, list) and rules:
        bad = [x for x in rules if x not in RL.definitions()]
        if bad:
            raise ApiError("bad_request", "없는 규칙", {"rules": bad})
        body2["options"]["rules"] = [str(x) for x in rules]
    # 카드(서비스)의 필지 대조면 그 카드 판으로 따로 저장(모델-표기 ⓐ — 같은 시군구의 다른 카드 · 시군구 실태조사를 덮지 않는다)
    card = str((body or {}).get("card_id") or "").strip() or None
    if card:
        async with db(realm="lx") as conn:
            if not await conn.fetchval("SELECT 1 FROM cards WHERE id=$1", card):
                raise ApiError("not_found", "없는 서비스입니다", {"card_id": card})
        body2["options"].update({"card_id": card, "card_version_id": (body or {}).get("card_version_id"), "deploy_id": (body or {}).get("deploy_id")})
        body2["label"] = f"survey/build {sgg} {card}"
    if (body or {}).get("test"):
        body2["test"] = True
    out = await JB.submit(body2, request)
    await audit_lx(p, "survey.build", sgg, {"ai_job_id": ai_job, "job_id": out["job"]["id"], "tenant_id": tenant, **({"card_id": card} if card else {})})
    return {**out, "sgg_cd": sgg, "tenant_id": tenant, "ai_job_id": ai_job,
            "note": None if ai_job else "AI 분석 결과가 없어 필지만 적재합니다(AI 분석 전)"}


def _pick_job(sgg: str) -> str | None:
    from survey.db import lx_tx, pg
    with pg() as c:
        lx_tx(c)
        return NT.pick_job(c, sgg)


async def audit_lx(p, action: str, subject: str, after: dict):
    try:
        async with db(realm="lx") as conn:
            await audit(conn, p, action, subject, None, after)
    except Exception:
        pass


@router.get("/survey/build/{sgg_cd}")
async def survey_build_state(sgg_cd: str, request: Request):
    p = _read(principal(request))
    cs = sgg_codes(sgg_cd)
    if p.realm == "tenant":
        RG.ensure_region(p, sgg_cd)                      # 관할 밖 = 없는 지역(원칙 39)
    async with db(p) as conn:
        r = await conn.fetchrow(f"SELECT {SGG_COLS}, build_job_id, job_id FROM survey_sgg WHERE sgg_cd = ANY($1::text[])", cs)
    if not r:
        raise ApiError("not_found", "이 시군구는 아직 실태조사를 만들지 않았습니다", {"sgg_cd": sgg_cd})
    d = _sgg_row(r)
    if not p.is_lx:
        d.pop("build_job_id", None)
        d.pop("job_id", None)
    return d


@router.get("/survey/regions")
async def survey_regions(request: Request):
    """실태조사가 만들어진 시군구(세션이 볼 수 있는 것만 · RLS)."""
    p = _read(principal(request))
    async with db(p) as conn:
        rows = await conn.fetch(f"SELECT {SGG_COLS} FROM survey_sgg ORDER BY findings DESC NULLS LAST, sgg_cd")
    items = []
    for r in rows:
        d = _sgg_row(r)
        try:
            rg = NT.region(d["sgg_cd"])
            d["name"] = d.get("name") or rg["name"]
            d["sido"] = RG.sido_label(d.get("sido") or rg["sido"])
            d["full"] = RG.full_label(rg["full"])
            d["bbox"] = d.get("bbox") or rg.get("bbox")
        except NT.BuildError:
            pass
        items.append(d)
    return {"items": items, "total": len(items), "as_of": now_iso()}


# ─────────────────────────── 상태 쓰기(1차 유일한 쓰기) ───────────────────────────
async def _publish(tenant: str, data: dict):
    r = await redis()
    raw = json.dumps(data, ensure_ascii=False)
    # 기관 스트림(v1.1-16 · F2-B /events/tenant 가 tail) + 관제 스트림(§5.2)
    await r.xadd(f"events:tenant:{tenant}", {"event": "finding.state", "data": raw}, maxlen=10000, approximate=True)
    await r.expire(f"events:tenant:{tenant}", 7 * 86400)
    await r.xadd("ops:events", {"event": "finding.state", "data": raw}, maxlen=5000, approximate=True)


VERDICTS = {"match", "violation", "match_fp", "unclear"}      # 현장 일치(의심 맞음) · 위반 확인 · 오탐(AI 틀림) · 판단 보류
# 조치 기록 = 기관이 한 일의 기록(보고서 부속 표). 시정명령 · 이행강제금 · 원상복구처럼 행정 처분을 몰아붙이는 종류는 만들지 않는다(원칙 40 · FR-15 반려).
ACTION_KINDS = {"notice", "revisit", "referral", "none", "other"}
# 화면 말 -> kind(gov-report 4종: 안내 · 재방문 · 이관 · 없음)
ACTION_KO = {"안내": "notice", "재방문": "revisit", "이관": "referral", "없음": "none", "기타": "other"}
REJECTED_KINDS = {"correction", "penalty", "restore", "시정명령", "이행강제금", "원상복구"}


@router.post("/survey/findings/{fid}/state")
async def set_state(fid: str, body: dict, request: Request):
    """상태 쓰기(F3 §3 S-2): {state(inspected|closed|dismissed), verdict, verdict_code, note, planned_for, reason, client_id?}. 배정(assigned) 없음.
    closed + verdict match_fp(또는 dismissed) → 오탐 피드백 자동(feedback kind 'fp' · 재학습 표본). client_id 없으면 서버가 만든다."""
    p = require(principal(request))
    if p.realm == "tenant" and p.role != "manager":
        raise ApiError("forbidden", "기관 담당자(manager)만 상태를 바꿀 수 있습니다")
    if p.realm == "lx" and p.role not in ("staff", "admin"):
        raise ApiError("forbidden", "LX 영업 계정은 읽기 전용")
    to = body.get("state")
    if p.realm == "lx" and body.get("verdict") and to in (None, "", "sample"):
        return await _lx_verdict(p, fid, body)       # LX 표본 검수 = 판정만 영구 기록(기관 필지 상태는 그대로)
    if to == "assigned":
        raise ApiError("bad_request", "현장 확인 배정은 제공하지 않습니다 — 판정(확인 · 오탐)만 기록합니다", {"allowed": list(WRITE_STATES)})
    if to not in WRITE_STATES:
        raise ApiError("bad_request", "state 는 dismissed|inspected|closed")
    cid = str(body.get("client_id") or "").strip() or ("srv_" + secrets.token_hex(8))
    if len(cid) > 80:
        raise ApiError("bad_request", "client_id(멱등 키 · 80자 이하)")
    reason = (body.get("reason") or None)
    verdict = body.get("verdict") or None
    vcode = (str(body.get("verdict_code")).strip()[:40] if body.get("verdict_code") else None)
    note = (str(body.get("note")).strip()[:500] if body.get("note") else None)
    if verdict and verdict not in VERDICTS:
        raise ApiError("bad_request", "verdict 는 match|violation|match_fp|unclear", {"allowed": sorted(VERDICTS)})
    if to == "closed" and not verdict:
        raise ApiError("verdict_required", "종결(closed)에는 판정(verdict)이 필요합니다", {"allowed": sorted(VERDICTS)}, 400)
    planned = body.get("planned_for")
    pdate = None
    if planned:
        try:
            pdate = dt.date.fromisoformat(str(planned)[:10])
        except Exception:
            raise ApiError("bad_request", "planned_for = YYYY-MM-DD")
    if to == "dismissed" and not (reason or note):
        raise ApiError("bad_request", "오탐(dismissed)은 사유(reason 또는 note) 필수")
    reason = reason or (note if to == "dismissed" else None)
    demo = p.realm == "lx"
    by = p.user_id or "unknown"
    fb_id = None
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
            new_assignee = r["assignee"]                 # 담당(배정)은 새로 쓰지 않는다 — 옛 기록의 값만 그대로
            await conn.execute("UPDATE survey_findings SET state=$2, assignee=$3, planned_for=COALESCE($4, planned_for), reason=$5, "
                               "updated_at=$6, updated_by=$7, demo=$8, verdict=COALESCE($9, verdict), verdict_code=COALESCE($10, verdict_code), "
                               "note=COALESCE($11, note) WHERE id=$1",
                               fid, to, new_assignee, pdate, reason, now, by, demo or bool(r["demo"]), verdict, vcode, note)
            await conn.execute("INSERT INTO survey_finding_events(tenant_id, finding_id, from_state, to_state, by, realm, reason, assignee, "
                               "planned_for, demo, at, client_id, verdict, verdict_code, note) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)",
                               r["tenant_id"], fid, cur, to, by, p.realm, reason, new_assignee, pdate, demo, now, cid, verdict, vcode, note)
            if (to == "closed" and verdict == "match_fp") or to == "dismissed":
                # 오탐 → 재학습 표본(feedback · lx-review 정밀도 보드 · 학습 samples)
                fb_id = "fb_" + secrets.token_hex(8)
                await conn.execute("INSERT INTO feedback(id, tenant_id, job_id, set_id, fid, pnu, lnglat, kind, note, state) VALUES "
                                   "($1,$2,NULL,$3,$4,$5,CASE WHEN $6::float8 IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint($6,$7),4326) END,'fp',$8,'open')",
                                   fb_id, r["tenant_id"], f"survey/{r['rule']}", fid, r["pnu"], r["lon"], r["lat"],
                                   (note or reason or "현장 확인 결과 오탐")[:500])
            await audit(conn, p, "finding.state", fid, {"state": cur}, {"state": to, "reason": reason, "assignee": new_assignee,
                                                                      "planned_for": planned, "client_id": cid, "demo": demo, "verdict": verdict,
                                                                      "verdict_code": vcode, "feedback": fb_id})
            r2 = await conn.fetchrow(f"SELECT {FCOLS} FROM survey_findings WHERE id=$1", fid)
    except asyncpg.UndefinedTableError as e:
        _err_missing(e)
    at = now.isoformat(timespec="milliseconds")
    data = {"id": fid, "pnu": r["pnu"], "rule": r["rule"], "priority": r["priority"], "emd_cd": r["emd_cd"], "from": cur, "to": to,
            "by": by, "realm": p.realm, "assignee": new_assignee, "reason": reason, "client_id": cid, "at": at, "verdict": verdict,
            "lnglat": [r["lon"], r["lat"]], "basis": "demo" if demo else "recorded", "tenant_id": r["tenant_id"]}
    await _publish(r["tenant_id"], data)
    try:
        from . import summary as SM
        SM.invalidate()                   # 현장 확인 필요(요약 60 s 캐시)가 바로 같은 값이 되게
    except Exception:
        pass
    out = X.finding_item(_row(r2))
    for k in ("verdict", "verdict_code", "note"):
        out[k] = r2[k]
    out["event"] = {"from": cur, "to": to, "at": at, "basis": data["basis"], "verdict": verdict}
    out["allowed_next"] = sorted(TRANSITIONS.get(to, set()))
    if fb_id:
        out["feedback_id"] = fb_id
    if demo:
        out["demo_note"] = f"LX 직원 시연 쓰기 — basis 'demo' · {DEMO_TTL_H}h 뒤 자동 원복"
    return out


# ─────────────────────────── 조치(F3 §3 S-2) ───────────────────────────
@router.post("/survey/actions", status_code=201)
async def create_action(body: dict, request: Request):
    """조치 한 줄(안내 · 재방문 · 이관 · 없음) — 행정 문서가 아니라 기관이 한 일의 기록. 기관 manager · LX staff/admin.
    시정명령 · 이행강제금 · 원상복구 종류는 받지 않는다(원칙 40)."""
    p = require(principal(request))
    if p.realm == "tenant" and p.role != "manager":
        raise ApiError("forbidden", "기관 담당자(manager)만 조치를 기록할 수 있습니다")
    if p.realm == "lx" and p.role not in ("staff", "admin"):
        raise ApiError("forbidden", "LX 영업 계정은 읽기 전용")
    fid = body.get("finding_id")
    raw_kind = str(body.get("kind") or "")
    if raw_kind in REJECTED_KINDS:
        raise ApiError("bad_request", "시정명령 · 이행강제금 · 원상복구는 기록하지 않습니다(보고서까지)", {"allowed": sorted(ACTION_KINDS)})
    kind = ACTION_KO.get(raw_kind, raw_kind or "other")
    if kind not in ACTION_KINDS:
        raise ApiError("bad_request", "kind 는 " + "|".join(sorted(ACTION_KINDS)), {"allowed": sorted(ACTION_KINDS)})
    law = (str(body.get("law")).strip()[:120] if body.get("law") else None)
    due = None
    if body.get("due"):
        try:
            due = dt.date.fromisoformat(str(body["due"])[:10])
        except Exception:
            raise ApiError("bad_request", "due = YYYY-MM-DD")
    aid = "act_" + secrets.token_hex(8)
    async with db(p) as conn:
        f = await conn.fetchrow("SELECT id, pnu, tenant_id FROM survey_findings WHERE id=$1", fid) if fid else None
        if fid and not f:
            raise ApiError("not_found", f"finding {fid} 없음")
        tenant = (f["tenant_id"] if f else None) or p.tenant_id
        if not tenant:
            raise ApiError("bad_request", "finding_id 가 필요합니다")
        await conn.execute("INSERT INTO survey_actions(id, tenant_id, finding_id, pnu, kind, note, due, by, law) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
                           aid, tenant, fid, f["pnu"] if f else body.get("pnu"), kind, (body.get("note") or "")[:500] or None, due, p.user_id, law)
        await audit(conn, p, "survey.action", aid, None, {"finding_id": fid, "kind": kind, "due": str(due) if due else None})
        row = await conn.fetchrow("SELECT * FROM survey_actions WHERE id=$1", aid)
    return _action(row)


def _action(r) -> dict:
    return {"id": r["id"], "tenant_id": r["tenant_id"], "finding_id": r["finding_id"], "pnu": r["pnu"], "kind": r["kind"], "note": r["note"],
            "law": r["law"],
            "due": r["due"].isoformat() if r["due"] else None, "state": r["state"], "by": r["by"],
            "at": r["at"].astimezone(KST).isoformat(timespec="seconds") if r["at"] else None}


@router.get("/survey/actions")
async def list_actions(request: Request, finding_id: str | None = None, state: str | None = None, limit: int = 200):
    p = _read(principal(request))
    async with db(p) as conn:
        rows = await conn.fetch("SELECT * FROM survey_actions WHERE ($1::text IS NULL OR finding_id=$1) AND ($2::text IS NULL OR state=$2) "
                                "ORDER BY at DESC LIMIT $3", finding_id, state, max(1, min(limit, 1000)))
    return {"items": [_action(r) for r in rows], "total": X.env(len(rows), "count", "recorded", "survey_actions"), "as_of": now_iso()}


@router.post("/survey/actions/{aid}")
async def update_action(aid: str, body: dict, request: Request):
    p = require(principal(request))
    if (p.realm == "tenant" and p.role != "manager") or (p.realm == "lx" and p.role not in ("staff", "admin")):
        raise ApiError("forbidden", "권한 없음")
    st = body.get("state")
    if st not in ("open", "done", "cancelled"):
        raise ApiError("bad_request", "state 는 open|done|cancelled")
    async with db(p) as conn:
        r = await conn.fetchrow("UPDATE survey_actions SET state=$2 WHERE id=$1 RETURNING *", aid, st)
        if not r:
            raise ApiError("not_found", f"action {aid} 없음")
        await audit(conn, p, "survey.action.state", aid, None, {"state": st})
    return _action(r)


# ─────────────────────────── 규칙 활성화 · 통계 · 재보정 ───────────────────────────
def _rule_def(rid: str) -> dict:
    if rid in RULE_IDS:
        d = RL.definitions()[rid]
        return {"id": rid, "name": d["name"], "thresholds": d.get("thresholds") or {}, "condition": RL.condition_text(rid)}
    d = LG.ledger_rules().get(rid)
    if not d:
        raise ApiError("not_found", f"규칙 {rid} 없음")
    return {"id": rid, "name": d["name"], "thresholds": d.get("thresholds") or {}, "condition": LG.condition_text(d)}


async def _rule_stats(conn, rid: str) -> dict:
    rows = await conn.fetch("SELECT state, verdict, count(*) n FROM survey_findings WHERE rule=$1 GROUP BY 1,2", rid)
    by_state = {s: 0 for s in STATES}
    ver = {"match": 0, "violation": 0, "match_fp": 0, "unclear": 0}
    for r in rows:
        by_state[r["state"]] = by_state.get(r["state"], 0) + r["n"]
        if r["verdict"] in ver:
            ver[r["verdict"]] += r["n"]
    tp = ver["match"] + ver["violation"]
    fp = ver["match_fp"] + by_state.get("dismissed", 0)
    fbk = await conn.fetchval("SELECT count(*) FROM feedback WHERE set_id=$1 AND kind='fp'", f"survey/{rid}")
    return {"by_state": by_state, "verdicts": ver, "tp": tp, "fp": fp, "feedback_fp": int(fbk or 0), "total": sum(by_state.values())}


@router.get("/survey/rules/{rid}/stats")
async def rule_stats(rid: str, request: Request):
    """규칙 정밀도 보드(lx-review) — 현장 판정(verdict)이 쌓인 만큼만 정밀도. 표본 0 이면 null(추정하지 않음)."""
    p = _read(principal(request))
    d = _rule_def(rid)
    async with db(p) as conn:
        st = await _rule_stats(conn, rid)
    async with db(realm="lx") as conn:
        pend = await conn.fetchval("SELECT count(*) FROM approvals WHERE subject_type='rule' AND subject_id=$1 AND state='pending'", rid)
    src = "survey_findings.verdict(현장 판정) · 오탐 = match_fp + dismissed"
    n = st["tp"] + st["fp"]
    lx = await _lx_stats(rid)
    field_blk = {"judged": X.env(n, "count", "recorded", src),
                 "precision": X.env(round(100 * st["tp"] / n, 1) if n else None, "%", "measured", src, None if n else "현장 판정 표본 없음")}
    async with db(realm="lx") as conn:
        rv = await conn.fetchval("SELECT coalesce(reviewed,false) FROM survey_rules WHERE id=$1", rid)
    return {"id": rid, "name": d["name"], "condition": d["condition"], "lx": lx, "field": field_blk, "reviewed": bool(rv),
            "gate": X.env(REVIEW_GATE["precision"], "%", "estimate", "검수 전 떼기 조건(정밀도)", "[추정 초기값]"),
            "gate_samples": X.env(REVIEW_GATE["samples"], "count", "recorded", "검수 전 떼기 조건(표본)"),
            "total": X.env(st["total"], "count", "inferred", "survey_findings", "검수 전 포함"),
            "by_state": {k: X.env(v, "count", "recorded", "survey_findings.state") for k, v in st["by_state"].items()},
            "verdicts": {k: X.env(v, "count", "recorded", "survey_findings.verdict") for k, v in st["verdicts"].items()},
            "judged": X.env(n, "count", "recorded", src),
            "precision": X.env(round(100 * st["tp"] / n, 1) if n else None, "%", "measured", src, None if n else "현장 판정 표본 없음"),
            "fp_reports": X.env(st["feedback_fp"], "count", "recorded", "feedback kind fp"),
            "thresholds": [{"key": k, "value": X.env(v, "ratio" if v < 1 else "m2", "estimate", f"server/survey/rules/{rid}.yaml", "[추정 초기값]")}
                           for k, v in d["thresholds"].items()],
            "pending_activation": bool(pend), "as_of": now_iso()}


@router.post("/survey/rules/{rid}/recalibrate")
async def rule_recalibrate(rid: str, request: Request, body: dict | None = None, scope: str | None = None):
    """재보정 제안 — 현장 판정된 건의 근거면적 분포에서 임계 후보를 낸다(제안만 · 적용은 activate → 결재).
    표본(오탐 ≥ 5 · 정탐 ≥ 5)이 모자라면 제안 null + 더 필요한 수. ?scope=lx = LX 표본 검수 판정만."""
    p = require(principal(request), lx=True)
    d = _rule_def(rid)
    scope = scope or (body or {}).get("scope") or "field"
    async with db(p) as conn:
        if scope == "lx":
            lv = await conn.fetch(
                "SELECT DISTINCT ON (v.finding_id) v.finding_id, v.verdict, f.evid_m2 FROM finding_verdicts v JOIN survey_findings f ON f.id=v.finding_id "
                "WHERE v.rule=$1 AND v.realm='lx' ORDER BY v.finding_id, v.at DESC", rid)
            tp = [r["evid_m2"] for r in lv if r["verdict"] == "match" and r["evid_m2"] is not None]
            fp = [r["evid_m2"] for r in lv if r["verdict"] == "match_fp" and r["evid_m2"] is not None]
        else:
            tp = [r["evid_m2"] for r in await conn.fetch(
                "SELECT evid_m2 FROM survey_findings WHERE rule=$1 AND verdict IN ('match','violation') AND evid_m2 IS NOT NULL", rid)]
            fp = [r["evid_m2"] for r in await conn.fetch(
                "SELECT evid_m2 FROM survey_findings WHERE rule=$1 AND (verdict='match_fp' OR state='dismissed') AND evid_m2 IS NOT NULL", rid)]
    key = next(iter(d["thresholds"]), None)
    cur = d["thresholds"].get(key) if key else None
    need = {"tp": max(0, 5 - len(tp)), "fp": max(0, 5 - len(fp))}
    prop = None
    if key and not need["tp"] and not need["fp"] and cur is not None and cur >= 1:
        fps, tps = sorted(fp), sorted(tp)
        f80 = fps[int(0.8 * (len(fps) - 1))]
        t20 = tps[int(0.2 * (len(tps) - 1))]
        prop = round(min(max(cur, (f80 + t20) / 2), t20), 1) if t20 > cur else cur
    src = "현장 판정(verdict) 분포 · 오탐 80분위 ↔ 정탐 20분위"
    u = "m2" if (cur or 0) >= 1 else "ratio"
    return {"id": rid, "key": key, "scope": scope, "current": X.env(cur, u, "estimate", f"server/survey/rules/{rid}.yaml", "[추정 초기값]"),
            "proposed": X.env(prop, u, "estimate", src, None if prop is not None else "현장 판정 표본 부족"),
            "samples": {"tp": X.env(len(tp), "count", "recorded", "verdict match·violation"),
                        "fp": X.env(len(fp), "count", "recorded", "verdict match_fp·dismissed")},
            "need": {k: X.env(v, "count", "recorded", "재보정 최소 표본 5") for k, v in need.items()}, "as_of": now_iso()}


@router.post("/survey/rules/{rid}/activate", status_code=202)
async def rule_activate(rid: str, request: Request, body: dict | None = None):
    """규칙(임계) 활성화 요청 → 결재함 행(approvals · state pending). 관리자가 /approvals/{id}/decide 로 승인하면 적용."""
    p = require(principal(request), lx=True)
    if p.role == "sales":
        raise ApiError("forbidden", "LX 영업 계정은 읽기 전용")
    d = _rule_def(rid)
    th = dict((body or {}).get("thresholds") or {})
    bad = [k for k in th if k not in d["thresholds"]]
    if bad:
        raise ApiError("bad_request", "이 규칙에 없는 임계", {"keys": bad, "allowed": list(d["thresholds"])})
    for k, v in th.items():
        try:
            th[k] = float(v)
        except (TypeError, ValueError):
            raise ApiError("bad_request", f"{k} 는 숫자")
    review = bool((body or {}).get("review")) if (body or {}).get("review") is not None else not th
    if review:                                    # 검수 전 떼기 = LX 표본 ≥ 100 · 정밀도 ≥ 조건(서버가 판정)
        lx = await _lx_stats(rid)
        k, pr = lx["judged"]["value"] or 0, lx["precision"]["value"]
        if k < REVIEW_GATE["samples"] or pr is None or pr < REVIEW_GATE["precision"]:
            raise ApiError("conflict", f"표본 {k}/{REVIEW_GATE['samples']}", {"judged": k, "precision": pr, "need": REVIEW_GATE}, 409)
    aid = "ap_" + secrets.token_hex(6)
    async with db(realm="lx") as conn:
        dup = await conn.fetchval("SELECT id FROM approvals WHERE subject_type='rule' AND subject_id=$1 AND state='pending'", rid)
        if dup:
            raise ApiError("conflict", "이미 결재 대기 중입니다", {"approval_id": dup}, 409)
        await conn.execute("INSERT INTO approvals(id, subject_type, subject_id, requested_by, state, payload, reason, at) "
                           "VALUES ($1,'rule',$2,$3,'pending',$4,$5,now())", aid, rid, p.user_id,
                           {"thresholds": th or d["thresholds"], "name": d["name"], "note": (body or {}).get("note"), "review": review},
                           (body or {}).get("note"))
        await conn.execute("UPDATE survey_rules SET pending=$2 WHERE id=$1", rid, th or d["thresholds"])
        await audit(conn, p, "rule.activate.request", rid, None, {"approval_id": aid, "thresholds": th})
    from .jobs import ops_event
    await ops_event("approval.requested", {"approval_id": aid, "subject_type": "rule", "subject_id": rid, "by": p.user_id, "at": now_iso()})
    return {"approval_id": aid, "state": "pending", "review": review, "subject": {"type": "rule", "id": rid, "name": d["name"]}, "as_of": now_iso()}


# ─────────────────────────── LX 표본 검수(판정만 · 상태 불변) ───────────────────────────
REVIEW_GATE = {"samples": 100, "precision": 80.0}          # 검수 전 떼기 조건(명세 §2.6 · 표본 100 · 정밀도 임계 추정 초기값 80%)
LX_VERDICT = {"match": "match", "violation": "match", "match_fp": "match_fp", "unclear": "unclear"}


async def _lx_verdict(p, fid: str, body: dict) -> dict:
    v = LX_VERDICT.get(body.get("verdict") or "")
    if not v:
        raise ApiError("bad_request", "verdict 는 match|match_fp|unclear", {"allowed": ["match", "match_fp", "unclear"]})
    if p.role not in ("staff", "admin"):
        raise ApiError("forbidden", "LX 영업 계정은 읽기 전용")
    vcode = str(body.get("verdict_code")).strip()[:40] if body.get("verdict_code") else None
    note = str(body.get("note")).strip()[:500] if body.get("note") else None
    async with db(p) as conn:
        r = await conn.fetchrow(f"SELECT {FCOLS} FROM survey_findings WHERE id=$1", fid)
        if not r:
            raise ApiError("not_found", f"finding {fid} 없음")
        vid = await conn.fetchval("INSERT INTO finding_verdicts(realm, tenant_id, finding_id, rule, verdict, verdict_code, note, by) "
                                  "VALUES ('lx',$1,$2,$3,$4,$5,$6,$7) RETURNING id", r["tenant_id"], fid, r["rule"], v, vcode, note, p.user_id)
        await audit(conn, p, "finding.verdict.lx", fid, None, {"verdict": v, "verdict_code": vcode})
    out = X.finding_item(_row(r))
    out["lx_verdict"] = {"id": str(vid), "verdict": v, "verdict_code": vcode, "at": now_iso(), "basis": "recorded"}
    out["allowed_next"] = sorted(TRANSITIONS.get(r["state"], set()))
    out["lx_stats"] = await _lx_stats(r["rule"])
    return out


async def _lx_stats(rid: str) -> dict:
    """LX 표본 검수 통계 — 필지당 마지막 LX 판정만 · 기관 현장 판정(tenant · dismissed)은 섞지 않는다."""
    async with db(realm="lx") as conn:
        rows = await conn.fetch("SELECT verdict, count(*) n FROM (SELECT DISTINCT ON (finding_id) finding_id, verdict FROM finding_verdicts "
                                "WHERE rule=$1 AND realm='lx' ORDER BY finding_id, at DESC) t GROUP BY 1", rid)
    ver = {"match": 0, "match_fp": 0, "unclear": 0}
    for r in rows:
        ver[r["verdict"]] = int(r["n"])
    n = ver["match"] + ver["match_fp"]
    src = "LX 표본 검수 판정(필지당 마지막)"
    return {"judged": X.env(n + ver["unclear"], "count", "recorded", src),
            "precision": X.env(round(100 * ver["match"] / n, 1) if n else None, "%", "measured", src, None if n else "표본 검수 전"),
            "verdicts": {k: X.env(v, "count", "recorded", src) for k, v in ver.items()}}


# ─────────────────────────── 보고서 초안(LLM 없이) ───────────────────────────
@router.get("/survey/reports/draft")
async def report_draft(request: Request, emd_cd: str, rule: str | None = None, top: int = 20, format: str = "json"):
    p = _read(principal(request))
    if not EMD_RE.match(emd_cd):
        raise ApiError("bad_request", "emd_cd = 법정동 8자리")
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


# ─────────────────────────── 관리 작업(c2-numbers · CPU · 게이트웨이 안) ───────────────────────────
# 읍면동 빈칸 채우기는 주기 작업(분석 중 칸 결과 · 취소된 작업 · 들여온 결과 세트) — 실태조사 경로가 처음 불릴 때 한 번 켜진다.
# 한 번에 한 묶음(limit 행)만 스레드에서 돌려 이벤트 루프를 막지 않는다. GPU 0.
EMD_SWEEP_S = 30
_sweep = {"task": None, "last": None, "runs": 0}
_maint: dict = {"running": None, "last": {}}


def _kick_emd_sweep():
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return
    t = _sweep["task"]
    if t is None or t.done():
        _sweep["task"] = loop.create_task(_emd_sweep_loop())


async def _emd_sweep_loop():
    from workers import postprocess as PP
    while True:
        try:
            while True:
                r = await run_in_threadpool(PP.fill_blank, 20000)
                _sweep.update(last={**r, "at": now_iso()}, runs=_sweep["runs"] + 1)
                if r["filled"] + r["outside"] < 20000 or r["filled"] + r["outside"] == 0:
                    break
        except Exception as e:  # noqa: BLE001 — 다음 주기에 다시
            _sweep["last"] = {"error": f"{type(e).__name__}: {str(e)[:200]}", "at": now_iso()}
        await asyncio.sleep(EMD_SWEEP_S)


def _maint_run(task: str, sgg: str | None) -> dict:
    """관리 작업 본체(스레드) — emd_fill: detections 읍면동 빈칸 전부 · parcel_offsets: 시군구 필지 위치 검사 · sido: 시도 표기 하나."""
    from survey.db import lx_tx, pg
    from workers import postprocess as PP
    t0 = time.time()
    if task == "emd_fill":
        before = PP.blank_counts()
        tot = {"filled": 0, "outside": 0, "pending": 0, "rounds": 0}
        while True:
            r = PP.fill_blank(50000)
            tot["rounds"] += 1
            for k in ("filled", "outside"):
                tot[k] += r[k]
            tot["pending"] = r["pending"]
            if r["filled"] + r["outside"] == 0:
                break
        return {"task": task, "before": before, "after": PP.blank_counts(), **tot, "s": round(time.time() - t0, 1)}
    with pg() as conn:
        lx_tx(conn)
        if task == "parcel_offsets":
            cds = [sgg] if sgg else [r[0] for r in conn.execute("SELECT sgg_cd FROM survey_sgg ORDER BY 1").fetchall()]
            res = [NT.fix_parcel_offsets(conn, c) for c in cds]
        elif task == "sido":
            res = NT.relabel_sido(conn)
        else:
            raise ValueError(task)
        conn.commit()
    return {"task": task, "result": res, "s": round(time.time() - t0, 1)}


@router.post("/survey/maintenance", status_code=202)
async def maintenance(body: dict, request: Request):
    """LX 관리자 관리 작업(CPU · 백그라운드) — {task: emd_fill | parcel_offsets | sido, sgg_cd?}. 한 번에 하나."""
    p = require(principal(request), admin=True)
    task = str((body or {}).get("task") or "")
    if task not in ("emd_fill", "parcel_offsets", "sido"):
        raise ApiError("bad_request", "task 는 emd_fill|parcel_offsets|sido")
    sgg = (body or {}).get("sgg_cd")
    if sgg and not re.match(r"^\d{5}$", str(sgg)):
        raise ApiError("bad_request", "sgg_cd = 시군구 코드 5자리")
    if _maint["running"]:
        raise ApiError("conflict", "관리 작업이 이미 돌고 있습니다", {"task": _maint["running"]}, 409)
    _maint["running"] = task

    async def go():
        try:
            r = await run_in_threadpool(_maint_run, task, sgg)
        except Exception as e:  # noqa: BLE001
            r = {"task": task, "error": f"{type(e).__name__}: {str(e)[:300]}"}
        _maint["last"][task] = {**r, "at": now_iso()}
        _maint["running"] = None
        try:
            from . import summary as SM
            SM.invalidate()
        except Exception:
            pass
        await audit_lx(p, "survey.maintenance", task, {k: v for k, v in r.items() if k != "result"} | {"sgg_cd": sgg})
    asyncio.get_running_loop().create_task(go())
    return {"task": task, "state": "started", "as_of": now_iso()}


@router.get("/survey/maintenance")
async def maintenance_state(request: Request):
    require(principal(request), admin=True)
    # 관리 기록은 화면 숫자가 아니다 — 봉투 검사 밖 구조 블록(detail)에 싣는다
    return {"running": _maint["running"], "detail": {"last": _maint["last"], "emd_sweep": _sweep["last"], "emd_sweep_runs": _sweep["runs"]},
            "as_of": now_iso()}
