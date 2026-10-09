"""실태조사 도구 — survey_findings · survey_stats · survey_parcel · survey_state(확인 카드).

지역 = scope.region_of(): 기관 세션은 관할(regions.tenant_scope) 안 시군구만 · LX 는 region 인자(없으면 전체). 지역 고정값 0.
읽기 순서: 시군구를 정한 질문 → PostGIS survey_findings(사용자 RLS · 그 시군구 PNU) · 기관 전체 질문 → `GET /api/v1/survey/*`(사용자 토큰).
둘 다 없을 때만 survey_local(그 기관 파일이 있을 때). 게스트 0(에이전트 자체가 401).
숫자 한 출처(c2-numbers): survey_stats 의 '의심 필지'(suspects) · '현장 확인 필요'(field_check)는 landxi_api.survey.survey_counts 그대로
(= /survey/stats total · /summary suspect·field_check · XI맵 · 첫 화면 · 보고서). 읍면동 칸은 R1–R6 행만 세어 칸 합 = 합계.
by=emd 결과에는 명령 바 막대 차트 블록(값 = 봉투 key)을 붙인다. 적재 중이면 숫자 대신 '집계 중'.
"""
from __future__ import annotations

import re

from . import Out, ToolError
from . import scope as S
from . import survey_local as L

RULE_NM = {"R1": "무허가 건축 의심", "R2": "휴경·전용 의심", "R3": "용도 불일치(비농지 위 비닐하우스)", "R4": "농지 전용 의심(주차장)",
           "R5": "산지 개간 의심", "R6": "공공용지 점유 의심"}
_NUM_IN_TEXT = re.compile(r"\d+(?:-\d+)?")
SRC_DB = "PostGIS survey_findings"
SET = "survey/findings"               # 지도 층(결과 = 실태조사 의심 · 필터로 지역·대장을 싣는다)
EMD_CHART_MAX = 20                    # 읍면동 막대 수 상한(의심 많은 순)


def chart_block(title: str, rows: list[dict]) -> dict:
    """명령 바 막대 차트(plan 3.3) — 값은 봉투 key 로만(runner 가 eN 으로 바꾼다)."""
    return {"type": "chart", "kind": "bar", "title": title, "rows": rows}


def rule_nm(k: str) -> str:
    """규칙 이름 — R1–R6(실태조사) · L-*(대장 규칙 · 규칙 파일)."""
    if k in RULE_NM:
        return RULE_NM[k]
    try:
        from landxi_api.ledger import ledger_rules
        return (ledger_rules().get(k) or {}).get("name") or ""
    except Exception:
        return ""


def _tenant_guard(ctx, args: dict):
    p = ctx.principal
    t = args.get("tenant_id")
    if t and p.realm == "tenant" and t != p.tenant_id:
        raise ToolError("tool_forbidden", "이 기관의 데이터가 아닙니다", 403)


async def _http(ctx, path: str, params: dict):
    """계약 API. 라우트·행이 없으면 None."""
    try:
        res = await ctx.http.get(path, params={k: v for k, v in params.items() if v not in (None, "")})
    except Exception:
        return None
    if res.status_code in (404, 405):
        return None
    if res.status_code == 403:
        raise ToolError("tool_forbidden", "이 기관의 데이터가 아닙니다", 403)
    if res.status_code >= 400:
        return None
    return res.json()


def _wl(out: Out, *texts):
    for t in texts:
        for m in _NUM_IN_TEXT.findall(str(t or "")):
            out.whitelist.add(m)


def _v(x):
    return x.get("value") if isinstance(x, dict) else x


def _norm(it: dict) -> dict:
    """Finding(봉투) → 공통 행. 봉투는 그대로 _env 에 보관(값을 새로 만들지 않음)."""
    geom = it.get("geometry") or {}
    ll = it.get("lnglat") or (geom.get("coordinates") if geom.get("type") == "Point" else None) or [None, None]
    return {"id": it.get("id"), "rank": _v(it.get("rank")), "priority": it.get("priority"), "score": _v(it.get("score")), "rule": it.get("rule"),
            "rule_nm": it.get("rule_nm"), "pnu": it.get("pnu"), "addr": it.get("addr"), "emd": it.get("emd"), "jimok": it.get("jimok"),
            "parcel_m2": _v(it.get("parcel_m2")), "evid_m2": _v(it.get("evid_m2")), "conf": _v(it.get("conf")), "yongdo": it.get("yongdo"),
            "nongup": it.get("nongup"), "evidence": it.get("evidence"), "lon": ll[0], "lat": ll[1], "state": it.get("state"),
            "_env": {k: it[k] for k in ("score", "parcel_m2", "evid_m2", "conf", "evid_pct") if isinstance(it.get(k), dict)}}


def _emd_codes(reg: dict, emd_cd: str | None) -> list[str] | None:
    if not emd_cd:
        return None
    return sorted({c + emd_cd[5:] for c in (reg.get("codes") or [emd_cd[:5]])} | {emd_cd})


def _jimok_ok(r: dict, jm: str | None) -> bool:
    return not jm or r["jimok"] == jm or (jm == "과수원" and r["jimok"] == "과")


# ── 읽기: PostGIS(사용자 RLS · 시군구) ─────────────────────────────────────
async def _db_findings(ctx, reg, rule, priority, emd_cds, limit=2000) -> dict | None:
    try:
        from landxi_api.deps import db
        from landxi_api.survey import FCOLS, X
    except Exception:
        return None
    w, a = ["substr(pnu,1,5) = ANY($1::text[])"], [reg["codes"]]
    # 규칙을 말하지 않으면 R1–R6(의심 필지 한 출처와 같은 범위 · 대장 규칙 L-* 는 ledger_findings)
    for col, val in (("rule", [rule] if rule else list(RULE_NM)), ("priority", [priority] if priority else None), ("emd_cd", emd_cds)):
        if val:
            a.append(val)
            w.append(f"{col} = ANY(${len(a)}::text[])")
    try:
        async with db(ctx.principal) as conn:
            rows = await conn.fetch(f"SELECT {FCOLS} FROM survey_findings WHERE {' AND '.join(w)} ORDER BY score DESC, rank ASC LIMIT {int(limit)}", *a)
            total = await conn.fetchval(f"SELECT count(*) FROM survey_findings WHERE {' AND '.join(w)}", *a)
    except Exception:
        return None
    return {"rows": [_norm(X.finding_item(dict(r))) for r in rows], "total": int(total), "complete": len(rows) >= int(total)}


async def _db_stats(ctx, reg, emd_cds) -> dict | None:
    """PostGIS(사용자 RLS) — 합계는 survey_counts(한 출처) · 규칙·등급·읍면동 칸은 R1–R6 행(칸 합 = 합계)."""
    try:
        from landxi_api.deps import db
        from landxi_api.survey import survey_counts
    except Exception:
        return None
    rules = list(RULE_NM)
    w, a = ["substr(pnu,1,5) = ANY($1::text[])", "rule = ANY($2::text[])"], [reg["codes"], rules]
    if emd_cds:
        a.append(emd_cds)
        w.append("emd_cd = ANY($3::text[])")
    W = " AND ".join(w)
    try:
        async with db(ctx.principal) as conn:
            cnt = await survey_counts(conn, reg["codes"])
            by_rule = {r["rule"]: int(r["n"]) for r in await conn.fetch(f"SELECT rule, count(*) n FROM survey_findings WHERE {W} GROUP BY 1", *a)}
            by_pri = {r["priority"]: int(r["n"]) for r in await conn.fetch(f"SELECT priority, count(*) n FROM survey_findings WHERE {W} GROUP BY 1", *a)}
            by_emd = [(r["emd"], r["emd_cd"], int(r["n"])) for r in await conn.fetch(
                f"SELECT emd, emd_cd, count(*) n FROM survey_findings WHERE {W} GROUP BY 1,2 ORDER BY 3 DESC, 2", *a)]
            fc_emd = None
            if emd_cds:
                fc_emd = int(await conn.fetchval(f"SELECT count(DISTINCT pnu) FROM survey_findings WHERE {W} AND priority = 'A' "
                                                 "AND state IN ('open','assigned')", *a) or 0)
            pw = ["substr(pnu,1,5) = ANY($1::text[])"] + (["emd_cd = ANY($2::text[])"] if emd_cds else [])
            parcels = int(await conn.fetchval(f"SELECT count(*) FROM survey_parcels WHERE {' AND '.join(pw)}", *([a[0]] + ([emd_cds] if emd_cds else []))) or 0)
    except Exception:
        return None
    busy = cnt["state"] == "building"
    if emd_cds:                                   # 읍면동 범위 — 그 읍면동 R1–R6 행(시군구 합계와 같은 식)
        suspects, field = (None if busy else sum(by_rule.values())), (None if busy else fc_emd)
    else:
        suspects, field = cnt["suspect"], cnt["field_check"]
    return {"by_rule": by_rule, "by_priority": by_pri, "suspects": suspects, "field_check": field, "by_emd": by_emd, "parcels": parcels,
            "state": cnt["state"], "as_of": cnt.get("as_of")}


async def _geoms(ctx, pnus: list[str]) -> dict:
    """필지 폴리곤(PostGIS · 사용자 RLS) → {pnu: {_geom, _bbox}}. 없으면 {}."""
    if not pnus:
        return {}
    try:
        import json
        from landxi_api.deps import db
        async with db(ctx.principal) as conn:
            rows = await conn.fetch("SELECT pnu, ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, 0.000003), 6) g, "
                                    "ST_XMin(geom) x0, ST_YMin(geom) y0, ST_XMax(geom) x1, ST_YMax(geom) y1 FROM survey_parcels WHERE pnu = ANY($1::text[])",
                                    list(pnus))
        return {r["pnu"]: {"_geom": json.loads(r["g"]) if r["g"] else None, "_bbox": [r["x0"], r["y0"], r["x1"], r["y1"]]} for r in rows}
    except Exception:
        return {}


# ── 읽기: 계약 API(기관 전체) ────────────────────────────────────────────
async def _api_findings(ctx, rule, priority, emd_cds):
    """GET /survey/findings(점수순 · 200행 페이지)."""
    base = {"rule": rule or ",".join(RULE_NM), "priority": priority, "emd_cd": ",".join(emd_cds) if emd_cds else None, "sort": "score", "limit": 200}
    first = await _http(ctx, "/survey/findings", {**base, "offset": 0})
    if first is None:
        return None
    items = list(first.get("items") or [])
    total_env = first.get("total")
    n_total = _v(total_env) or len(items)
    off = len(items)
    while off < min(n_total, 2000):
        nxt = await _http(ctx, "/survey/findings", {**base, "offset": off})
        got = (nxt or {}).get("items") or []
        if not got:
            break
        items += got
        off += len(got)
    return {"rows": [_norm(it) for it in items], "total_env": total_env, "complete": len(items) >= n_total}


def _local_tenant(ctx, reg) -> str | None:
    """PostGIS · API 가 없을 때의 대체 파일 기관 — 기관 세션은 자기 기관, LX 는 그 시군구를 관할하는 기관."""
    p = ctx.principal
    if p.realm == "tenant":
        return p.tenant_id if L.available(p.tenant_id) else None
    try:
        from landxi_api.regions import _cfg, in_scope
        for t, v in (_cfg().get("tenants") or {}).items():
            sc = v.get("sgg") or []
            if sc and any(in_scope(c, sc) for c in reg.get("codes") or []) and L.available(t):
                return t
    except Exception:
        pass
    return None


async def survey_findings(args: dict, ctx) -> Out:
    _tenant_guard(ctx, args)
    reg = await S.region_of(ctx, args)
    rule = (args.get("rule") or "").upper() or None
    if rule and rule not in RULE_NM:
        raise ToolError("bad_request", f"rule 은 R1–R6 ({rule})")
    top = max(1, min(int(args.get("top") or 5), 20))
    emd_q = args.get("emd") or args.get("emd_cd")
    emd_n, emd_cd = S.emd_resolve(reg, emd_q)
    if emd_q and not emd_n:
        raise ToolError("bad_request", f"읍면동 '{emd_q}' 을 {reg.get('name') or '관할'}에서 찾지 못했습니다")
    emd_cds = _emd_codes(reg, emd_cd)
    jimok = args.get("jimok")
    jm = L.JIMOK.get(str(jimok).strip(), str(jimok).strip()) if jimok else None
    place = reg.get("name") if reg.get("asked") else None
    # 조건 문구에 규칙 이름을 붙인다(코드 'R1' 만 두면 화면·문서에서 지워져 '전체'처럼 읽힌다 · 코드는 뜻 검사용) — 규칙이 없을 때만 '의심 필지 전체'(= survey_stats 칸 합)
    cond = " · ".join(x for x in [place, f"{rule} {RULE_NM[rule]}" if rule else None, emd_n, f"지목 {jm}" if jm else None, f"등급 {args.get('priority')}" if args.get("priority") else None] if x) or "전체"
    note = L.NOTE_INF
    src, total_env, pr, picked = SRC_DB, None, {}, []
    got = await _db_findings(ctx, reg, rule, args.get("priority"), emd_cds) if reg.get("codes") else None
    api = None if got is not None else await _api_findings(ctx, rule, args.get("priority"), emd_cds)
    if got is not None or api is not None:
        rows = (got or api)["rows"]
        if jm:
            rows = [r for r in rows if _jimok_ok(r, jm)]
        complete = (got or api)["complete"]
        if got is not None:
            src = f"{SRC_DB}(시군구 {reg.get('name') or reg.get('sgg')})"
            total_env = L.env(len(rows) if jm else got["total"], "필지", src, note=note, as_of=ctx.now())
        else:
            src = "GET /api/v1/survey/findings"
            total_env = api["total_env"] if not jm else L.env(len(rows), "필지", src + f" → 지목 {jm}", note=note)
        if jm:
            src += f" → 지목 {jm} 필터(에이전트가 거름)"
        picked = rows[:top]
        pr = {k: sum(1 for r in rows if r["priority"] == k) for k in "ABC"} if complete else {}
    else:
        t = _local_tenant(ctx, reg)
        if not t:
            raise ToolError("not_found", "해당 지역 데이터가 없습니다", 404)
        L.use(t)
        f = L.findings(rule=rule, emd=emd_n, priority=args.get("priority"), jimok=jimok, top=top)
        src, note = f["source"], L.NOTE_INF + " · 대체 경로(정본 파일)"
        total_env = L.env(f["total"], "필지", src, note=note)
        picked = [{**r, "_env": {}} for r in f["items"]]
        pr = f["by_priority"]
    out = Out(source=src, note=note)
    narrow = rule or jm or args.get("priority")
    out.env("total", f"조건({cond}) 일치 의심 건" if narrow else f"{cond} 의심 필지 전체", total_env)
    out.env("shown", "점수 상위로 반환한 필지 수", L.env(len(picked), "필지", src + " · 점수 내림차순 상위", basis="measured", note="반환 행 수"))
    for k in "ABC":
        if k in pr:
            out.env(f"pri_{k}", f"조건 일치 중 등급 {k}", L.env(pr[k], "필지", src, note=note))
    out.citations.append({"kind": "list", "emd": emd_n, "emd_cd": emd_cd, "rule": rule, "sgg_cd": reg.get("sgg"), "label": f"{cond} 의심 목록 · 점수순",
                          "env_keys": ["total", "shown"] + [f"pri_{k}" for k in "ABC" if k in pr]})
    pnus = [it["pnu"] for it in picked]
    geo = await _geoms(ctx, pnus)
    if not geo and pnus and _T_local(ctx, reg):
        geo = L.parcels(pnus, geom=True)
    rows_out, feats, xs, ys = [], [], [], []
    for n, it in enumerate(picked, 1):
        g = geo.get(it["pnu"], {})
        E = it.get("_env") or {}
        k_ev, k_pa, k_cf, k_sc = f"evid_{n}", f"parcel_{n}", f"conf_{n}", f"score_{n}"
        out.env(k_ev, f"[{n}] AI 근거 면적", E.get("evid_m2") or L.env(it.get("evid_m2"), "m2", src, note=note))
        out.env(k_pa, f"[{n}] 필지 면적(연속지적)", E.get("parcel_m2") or L.env(it.get("parcel_m2"), "m2", src, basis="recorded", note="연속지적"))
        out.env(k_cf, f"[{n}] 평균 신뢰도", E.get("conf") or L.env(it.get("conf"), "ratio", src, note=note))
        out.env(k_sc, f"[{n}] 우선순위 점수", E.get("score") or L.env(it.get("score"), "count", src, basis="estimate", note="규칙 점수 · 임계 [추정 초기값]"))
        _wl(out, it.get("addr"), it.get("pnu"))
        addr = S.short_addr(it.get("addr"))
        rows_out.append({"n": n, "pnu": it["pnu"], "주소": addr, "지목": it.get("jimok"), "규칙": f"{it.get('rule')} {RULE_NM.get(it.get('rule'), '')}",
                         "등급": it.get("priority"), "점수": k_sc, "근거면적": k_ev, "필지면적": k_pa, "신뢰도": k_cf, "용도지역": it.get("yongdo"),
                         "농업진흥": it.get("nongup"), "상태": it.get("state") or "open"})
        bbox = g.get("_bbox") or ([it["lon"] - 0.0006, it["lat"] - 0.0005, it["lon"] + 0.0006, it["lat"] + 0.0005] if it.get("lon") else None)
        center = [it["lon"], it["lat"]] if it.get("lon") else None
        out.citations.append({"kind": "parcel", "pnu": it["pnu"], "finding_id": it.get("id"), "addr": addr, "bbox": bbox, "center": center,
                              "rule": it.get("rule"), "priority": it.get("priority"), "set": SET, "sgg_cd": str(it["pnu"])[:5],
                              "label": f"{addr} · {it.get('rule')} {it.get('priority')}", "env_keys": [k_ev, k_pa, k_cf],
                              "geom": _round_geom(g.get("_geom"))})
        geom = g.get("_geom") or ({"type": "Point", "coordinates": center} if center else None)
        if geom:
            feats.append({"type": "Feature", "geometry": geom,
                          "properties": {"n": n, "pnu": it["pnu"], "addr": addr, "rule": it.get("rule"), "priority": it.get("priority"),
                                         "jimok": it.get("jimok"), "score": it.get("score"), "evid_m2": it.get("evid_m2")}})
        if bbox:
            xs += [bbox[0], bbox[2]]
            ys += [bbox[1], bbox[3]]
    out.data = {"지역": reg.get("name") or "관할 전체", "조건": cond, "items": rows_out,
                "비고": "숫자는 봉투 key 로만 참조 · AI 추론 검수 전 · 의심 후보이며 위법 판정 아님 · 건축물대장 미대조"}
    if xs:
        out.raw = {"bbox": [min(xs), min(ys), max(xs), max(ys)], "features": feats, "count_key": "shown", "total_key": "total", "set": SET,
                   "filter": {"rule": rule, "emd_cd": emd_cd, "jimok": jm, "priority": args.get("priority"), "sgg_cd": reg.get("sgg")},
                   "label": f"에이전트 질의 · {cond} · 저장 안 됨"}
    return out


def _T_local(ctx, reg) -> bool:
    t = _local_tenant(ctx, reg)
    if t:
        L.use(t)
    return bool(t)


def _round_geom(g):
    if not g:
        return None

    def r(c):
        return [round(c[0], 6), round(c[1], 6)] if isinstance(c[0], (int, float)) else [r(x) for x in c]
    return {"type": g["type"], "coordinates": r(g["coordinates"])}


async def survey_stats(args: dict, ctx) -> Out:
    import asyncio
    _tenant_guard(ctx, args)
    reg = await S.region_of(ctx, args)
    by = args.get("by") or "rule"
    emd_q = args.get("emd") or args.get("emd_cd")
    emd_n, emd_cd = S.emd_resolve(reg, emd_q)
    if emd_q and not emd_n:
        raise ToolError("bad_request", f"읍면동 '{emd_q}' 을 {reg.get('name') or '관할'}에서 찾지 못했습니다")
    emd_cds = _emd_codes(reg, emd_cd)
    scope = emd_n or f"{reg.get('name') or '관할'} 전체"
    note = L.NOTE_INF
    d = await _db_stats(ctx, reg, emd_cds) if reg.get("codes") else None
    if d is not None:
        src = f"{SRC_DB}(시군구 {reg.get('name') or reg.get('sgg')})"
        if d["state"] == "none" and d["parcels"] == 0:
            raise ToolError("not_found", "해당 지역 데이터가 없습니다", 404)
        busy = d["state"] == "building"
        bnote = "집계 중" if busy else note
        out = Out(source=src, note=bnote)
        out.env("suspects", f"{scope} 의심 필지(전체 규칙)", L.env(d["suspects"], "count", src, note=bnote, as_of=d.get("as_of") or ctx.now()))
        out.env("field_check", f"{scope} 현장 확인 필요(우선순위 A · 판정 전 필지)",
                L.env(d["field_check"], "필지", src, note="집계 중" if busy else "현장 확인 전", as_of=ctx.now()))
        out.env("parcels", f"{scope} 연속지적 필지 수", L.env(d["parcels"], "필지", "PostGIS survey_parcels", basis="recorded", note="연속지적", as_of=ctx.now()))
        if not busy:
            for k, v in sorted(d["by_rule"].items()):
                out.env(f"rule_{k}", f"{scope} {k} {rule_nm(k)} 건수", L.env(v, "count", src, note=note, as_of=ctx.now()))
            for k, v in sorted(d["by_priority"].items()):
                out.env(f"pri_{k}", f"{scope} 등급 {k} 건수", L.env(v, "count", src, note=note, as_of=ctx.now()))
            if by == "emd" and not emd_n:
                rows = []
                for i, (nm, _cd, n) in enumerate(d["by_emd"][:EMD_CHART_MAX], 1):
                    out.env(f"emd_{i}", f"{nm} 의심 필지(건)", L.env(n, "count", src, note=note, as_of=ctx.now()))
                    rows.append({"label": nm, "env": f"emd_{i}"})
                if rows:
                    out.blocks.append(chart_block(f"{reg.get('name') or '관할'} 읍면동별 의심 필지", rows))
    else:
        a_emd, a_rule, a_pri = await asyncio.gather(_http(ctx, "/survey/stats", {"by": "emd"}), _http(ctx, "/survey/stats", {"by": "rule"}),
                                                    _http(ctx, "/survey/stats", {"by": "priority"}))
        if a_emd is not None:
            src = "GET /api/v1/survey/stats"
            out = Out(source=src, note=note)
            if emd_n:
                row = next((x for x in a_emd.get("items") or [] if x.get("cd") in (emd_cds or [])), None)
                if row is None:
                    raise ToolError("not_found", f"{emd_n} 집계 없음", 404)
                out.env("suspects", f"{scope} 의심 필지(전체 규칙)", row["n"])
                out.env("parcels", f"{scope} 연속지적 필지 수", row["parcels"])
                for k, v in sorted((row.get("by_rule") or {}).items()):
                    out.env(f"rule_{k}", f"{scope} {k} {rule_nm(k)} 건수", v)
                for k, v in sorted((row.get("by_priority") or {}).items()):
                    out.env(f"pri_{k}", f"{scope} 등급 {k} 건수", v)
            else:
                out.env("suspects", f"{scope} 의심 필지(전체 규칙)", a_emd["total"])
                if a_emd.get("field_check"):
                    out.env("field_check", f"{scope} 현장 확인 필요(우선순위 A · 판정 전 필지)", a_emd["field_check"])
                items = a_emd.get("items") or []
                out.env("parcels", f"{scope} 연속지적 필지 수", a_emd["parcels"])
                for x in (a_rule or {}).get("items") or []:
                    out.env(f"rule_{x['key']}", f"{scope} {x['key']} {rule_nm(x['key'])} 건수", x["n"])
                for x in (a_pri or {}).get("items") or []:
                    out.env(f"pri_{x['key']}", f"{scope} 등급 {x['key']} 건수", x["n"])
                if by == "emd":
                    top = [x for x in sorted(items, key=lambda x: -(_v(x.get("n")) or 0)) if _v(x.get("n"))][:EMD_CHART_MAX]
                    rows = []
                    for i, e in enumerate(top, 1):
                        out.env(f"emd_{i}", f"{e['key']} 의심 필지(건)", e["n"])
                        rows.append({"label": e["key"], "env": f"emd_{i}"})
                    if rows:
                        out.blocks.append(chart_block(f"{reg.get('name') or '관할'} 읍면동별 의심 필지", rows))
        else:
            t = _local_tenant(ctx, reg)
            if not t:
                raise ToolError("not_found", "해당 지역 데이터가 없습니다", 404)
            L.use(t)
            s = L.stats(by=by, emd=emd_n, rule=args.get("rule"), scope_name=reg.get("name"))
            src, note = s["source"], L.NOTE_INF + " · 대체 경로(정본 파일)"
            out = Out(source=src, note=note)
            out.env("suspects", f"{scope} 의심 필지(전체 규칙)", L.env(s["suspects"], "count", src, note=note))
            out.env("parcels", f"{scope} 연속지적 필지 수", L.env(s["parcels"], "필지", src, basis="recorded", note="연속지적"))
            for k, v in sorted(s["by_rule"].items()):
                out.env(f"rule_{k}", f"{scope} {k} {rule_nm(k)} 건수", L.env(v, "count", src, note=note))
            for k, v in sorted(s["by_priority"].items()):
                out.env(f"pri_{k}", f"{scope} 등급 {k} 건수", L.env(v, "count", src, note=note))
    lx = getattr(ctx.principal, "realm", None) == "lx"
    if lx:                                                # 원칙 135 — LX 계정 답에는 '현장 확인 필요' 숫자를 싣지 않는다(계산은 그대로)
        out.envelopes = [x for x in out.envelopes if x[0] != "field_check"]
    out.data = {"범위": scope, "읍면동코드": emd_cd, "시군구": reg.get("sgg"), "규칙": dict(RULE_NM),
                "비고": "'의심 필지' 는 suspects 봉투 하나로만 말한다(규칙 R1–R6 의심 건 · 다른 화면과 같은 값)"
                        + ("" if lx else " · '현장 확인 필요' 는 field_check") + " · 임계 [추정 초기값]"
                        + (" · 지금 집계 중" if "집계 중" in (out.note or "") else "")}
    out.citations.append({"kind": "stats", "emd": emd_n, "emd_cd": emd_cd, "sgg_cd": reg.get("sgg"), "label": f"{scope} 집계"})
    return out


async def survey_parcel(args: dict, ctx) -> Out:
    _tenant_guard(ctx, args)
    pnu = str(args.get("pnu") or "").strip()
    if not re.fullmatch(r"\d{19}", pnu):
        raise ToolError("bad_request", "pnu 는 19자리 숫자")
    await S.region_of(ctx, {"sgg_cd": pnu[:5]})          # 관할 밖 필지 → 403
    api = await _http(ctx, f"/survey/parcels/{pnu}", {"with": "facts,findings,history"})
    d = None
    if api is None:
        reg = {"codes": S.codes_of(pnu[:5])}
        if _T_local(ctx, reg):
            d = L.parcel(pnu)
        if not d:
            raise ToolError("not_found", "해당 지역 데이터가 없습니다", 404)
    out = Out(source=L.src(L.SRC_GPKG) if api is None else f"GET /api/v1/survey/parcels/{pnu}")
    if d:
        f = d["facts"]
        addr = S.short_addr(f.get("addr"))
        _wl(out, f.get("addr"), pnu, f.get("jibun"))
        src = L.src(L.SRC_GPKG)
        out.env("area", "필지 면적(연속지적)", L.env(f.get("area_m2"), "m2", src, basis="recorded", note="연속지적"))
        out.env("bld", "AI 건물 면적(필지 안)", L.env(f.get("a23_bld_m2"), "m2", src))
        out.env("crop", "AI 경작지 면적(필지 안)", L.env(f.get("a23_crop_m2"), "m2", src))
        if f.get("jiga"):
            out.env("jiga", "공시지가", L.env(f.get("jiga"), "krw_m2", src, basis="recorded", note=f"기준 {f.get('gosi_year') or ''}"))
        out.data = {"pnu": pnu, "주소": addr, "지목": f.get("jimok_nm") or f.get("jimok"), "용도지역": f.get("yongdo"), "농업진흥": f.get("nongup"),
                    "의심": [{"규칙": x["rule"], "등급": x["priority"], "근거": x.get("evidence")} for x in d["findings"]],
                    "이력요약": d.get("summary") or "이력 · 단일 시점", "소유자": "연속지적 미제공(성명 없음)"}
        out.citations.append({"kind": "parcel", "pnu": pnu, "addr": addr, "bbox": f.get("_bbox"), "set": SET, "sgg_cd": pnu[:5], "label": addr})
    else:
        out.data = {k: api.get(k) for k in ("pnu", "facts", "findings") if k in api}
    return out


async def survey_state(args: dict, ctx) -> Out:
    """쓰기(확인 카드 뒤에만 runner 가 부른다) — POST /survey/findings/{id}/state."""
    fid = str(args.get("finding_id") or "")
    state = args.get("state")
    if state not in ("dismissed", "inspected", "closed"):         # 현장 확인 배정 없음(원칙 40)
        raise ToolError("bad_request", "state 는 dismissed|inspected|closed")
    res = await ctx.http.post(f"/survey/findings/{fid}/state", json={k: args.get(k) for k in ("state", "reason", "verdict")} | {"client_id": ctx.run_id})
    if res.status_code == 404:
        raise ToolError("registry_unavailable", "실태조사 상태 쓰기 API 없음 — 저장 안 됨", 404)
    if res.status_code >= 400:
        raise ToolError((res.json().get("error") or {}).get("code", "bad_request"), res.text[:200], res.status_code)
    out = Out(source=f"POST /api/v1/survey/findings/{fid}/state")
    out.data = {"finding": fid, "state": state}
    return out
