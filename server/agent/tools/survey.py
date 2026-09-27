"""실태조사 도구 — survey_findings · survey_stats · survey_parcel · survey_state(확인 카드).

HTTP 먼저(F2-S `GET /api/v1/survey/*` · 사용자 토큰 상속) → 404/라우트 없음이면 survey_local(정본 파일 임시 구현).
데이터 소유 기관 = namwon(남원). 기관 세션은 자기 기관만 · LX 는 전부 · 게스트 0(에이전트 자체가 401).
"""
from __future__ import annotations

import re

from . import Out, ToolError
from . import survey_local as L

OWNER_TENANT = "namwon"
RULE_NM = {"R1": "무허가 건축 의심", "R2": "휴경·전용 의심", "R3": "용도 불일치(비농지 위 비닐하우스)", "R4": "농지 전용 의심(주차장)",
           "R5": "산지 개간 의심", "R6": "공공용지 점유 의심"}
_NUM_IN_TEXT = re.compile(r"\d+(?:-\d+)?")


def _guard(ctx, args: dict):
    p = ctx.principal
    t = args.get("tenant_id")
    if p.realm == "tenant" and p.tenant_id != OWNER_TENANT:
        raise ToolError("tool_forbidden", f"기관 {p.tenant_id} 세션은 남원 실태조사 데이터를 볼 수 없습니다", 403)
    if t and t != OWNER_TENANT and not p.realm == "lx":
        raise ToolError("tool_forbidden", f"다른 기관({t}) 데이터 조회는 권한 밖입니다", 403)
    if t and t != OWNER_TENANT:
        raise ToolError("not_found", f"기관 {t} 의 실태조사 배포본 없음", 404)


async def _http(ctx, path: str, params: dict):
    """F2-S API. 없으면 None(→ 임시 구현)."""
    try:
        res = await ctx.http.get(path, params={k: v for k, v in params.items() if v not in (None, "")})
    except Exception:
        return None
    if res.status_code in (404, 405):
        return None                     # 라우트 없음(F2-S 미도착) 또는 행 없음 → 정본 파일 임시 구현
    if res.status_code == 403:
        raise ToolError("tool_forbidden", "권한 밖(서버 403)", 403)
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
    """F2-S Finding(봉투) → 공통 행. 봉투는 그대로 _env 에 보관(값을 새로 만들지 않음)."""
    geom = it.get("geometry") or {}
    ll = it.get("lnglat") or (geom.get("coordinates") if geom.get("type") == "Point" else None) or [None, None]
    return {"id": it.get("id"), "rank": _v(it.get("rank")), "priority": it.get("priority"), "score": _v(it.get("score")), "rule": it.get("rule"),
            "rule_nm": it.get("rule_nm"), "pnu": it.get("pnu"), "addr": it.get("addr"), "emd": it.get("emd"), "jimok": it.get("jimok"),
            "parcel_m2": _v(it.get("parcel_m2")), "evid_m2": _v(it.get("evid_m2")), "conf": _v(it.get("conf")), "yongdo": it.get("yongdo"),
            "nongup": it.get("nongup"), "evidence": it.get("evidence"), "lon": ll[0], "lat": ll[1], "state": it.get("state"),
            "_env": {k: it[k] for k in ("score", "parcel_m2", "evid_m2", "conf", "evid_pct") if isinstance(it.get(k), dict)}}


async def _api_findings(ctx, rule, priority, emd_cd, jimok):
    """GET /survey/findings(점수순 · 200행 페이지). jimok 은 v1.1-22 에 없는 필터 → 받은 행에서 거른다(표기)."""
    first = await _http(ctx, "/survey/findings", {"rule": rule, "priority": priority, "emd_cd": emd_cd, "sort": "score", "limit": 200, "offset": 0})
    if first is None:
        return None
    items = list(first.get("items") or [])
    total_env = first.get("total")
    n_total = _v(total_env) or len(items)
    # 등급별 건수 봉투는 조건 일치 전체에서 센다(첫 페이지 200행만 세면 '조건 일치 중 등급 A' 가 틀린다 · 2차 판정 뒤)
    off = len(items)
    if True:
        while off < min(n_total, 2000):
            nxt = await _http(ctx, "/survey/findings", {"rule": rule, "priority": priority, "emd_cd": emd_cd, "sort": "score", "limit": 200, "offset": off})
            got = (nxt or {}).get("items") or []
            if not got:
                break
            items += got
            off += len(got)
    rows = [_norm(it) for it in items]
    if jimok:
        jm = L.JIMOK.get(jimok, jimok)
        rows = [r for r in rows if r["jimok"] == jm or (jm == "과수원" and r["jimok"] == "과")]
    return {"rows": rows, "total_env": None if jimok else total_env, "api_total": total_env, "complete": len(items) >= n_total}


async def survey_findings(args: dict, ctx) -> Out:
    _guard(ctx, args)
    rule = (args.get("rule") or "").upper() or None
    if rule and rule not in RULE_NM:
        raise ToolError("bad_request", f"rule 은 R1–R6 ({rule})")
    top = max(1, min(int(args.get("top") or 5), 20))
    emd_n, emd_cd = L.emd_resolve(args.get("emd") or args.get("emd_cd"))
    if (args.get("emd") or args.get("emd_cd")) and not emd_n:
        raise ToolError("bad_request", f"읍면동 '{args.get('emd') or args.get('emd_cd')}' 을 남원 39개 법정동에서 찾지 못함")
    jimok = args.get("jimok")
    jm = L.JIMOK.get(str(jimok).strip(), str(jimok).strip()) if jimok else None
    cond = " · ".join(x for x in [rule, emd_n, f"지목 {jm}" if jm else None, f"등급 {args.get('priority')}" if args.get("priority") else None] if x) or "전체"
    api = await _api_findings(ctx, rule, args.get("priority"), emd_cd, jimok)
    if api is not None:
        rows = api["rows"]
        src = "GET /api/v1/survey/findings" + (f" → 지목 {jm} 필터(v1.1-22 에 jimok 인자 없음 · 에이전트가 거름)" if jm else "")
        note = L.NOTE_INF
        total_env = api["total_env"] or L.env(len(rows), "필지", src, note=note, as_of=(api["api_total"] or {}).get("as_of", L.AS_OF))
        picked = rows[:top]
        # 전 행을 다 받았을 때만 등급별 건수 봉투를 낸다(일부 행으로 센 값은 봉투로 내지 않음)
        pr = {k: sum(1 for r in rows if r["priority"] == k) for k in "ABC"} if api.get("complete") else {}
    else:
        f = L.findings(rule=rule, emd=emd_n, priority=args.get("priority"), jimok=jimok, top=top)
        src, note = f["source"], L.NOTE_INF + " · F2-S API 미도착 → 정본 파일 임시 구현"
        total_env = L.env(f["total"], "필지", src, note=note)
        picked = [{**r, "_env": {}} for r in f["items"]]
        pr = f["by_priority"]
    out = Out(source=src, note=note)
    out.env("total", f"조건({cond}) 일치 의심 필지 전체", total_env)
    out.env("shown", "점수 상위로 반환한 필지 수", L.env(len(picked), "필지", src + " · 점수 내림차순 상위", basis="measured", note="반환 행 수"))
    for k in "ABC":
        if k in pr:
            out.env(f"pri_{k}", f"조건 일치 중 등급 {k}", L.env(pr[k], "필지", src, note=note))
    out.citations.append({"kind": "list", "emd": emd_n, "emd_cd": emd_cd, "rule": rule, "label": f"{cond} 의심 목록 · 점수순 · {src}",
                          "env_keys": ["total", "shown"] + [f"pri_{k}" for k in "ABC" if k in pr]})
    pnus = [it["pnu"] for it in picked]
    geo = L.parcels(pnus, geom=True) if pnus else {}
    rows_out, feats, xs, ys = [], [], [], []
    for n, it in enumerate(picked, 1):
        g = geo.get(it["pnu"], {})
        E = it.get("_env") or {}
        k_ev, k_pa, k_cf, k_sc = f"evid_{n}", f"parcel_{n}", f"conf_{n}", f"score_{n}"
        out.env(k_ev, f"[{n}] AI 근거 면적", E.get("evid_m2") or L.env(it.get("evid_m2"), "m2", SRC_ROW(it), note=note))
        out.env(k_pa, f"[{n}] 필지 면적(연속지적)", E.get("parcel_m2") or L.env(it.get("parcel_m2"), "m2", SRC_ROW(it), basis="recorded", note="V-World 연속지적 2026-09-24"))
        out.env(k_cf, f"[{n}] 평균 신뢰도", E.get("conf") or L.env(it.get("conf"), "ratio", SRC_ROW(it), note=note))
        out.env(k_sc, f"[{n}] 우선순위 점수", E.get("score") or L.env(it.get("score"), "count", SRC_ROW(it), basis="estimate", note="규칙 점수 · 임계 [추정 초기값]"))
        _wl(out, it.get("addr"), it.get("pnu"))
        addr = str(it.get("addr") or "").replace("전북특별자치도 ", "")
        rows_out.append({"n": n, "pnu": it["pnu"], "주소": addr, "지목": it.get("jimok"), "규칙": f"{it.get('rule')} {RULE_NM.get(it.get('rule'), '')}",
                         "등급": it.get("priority"), "점수": k_sc, "근거면적": k_ev, "필지면적": k_pa, "신뢰도": k_cf, "용도지역": it.get("yongdo"),
                         "농업진흥": it.get("nongup"), "상태": it.get("state") or "open"})
        bbox = g.get("_bbox") or ([it["lon"] - 0.0006, it["lat"] - 0.0005, it["lon"] + 0.0006, it["lat"] + 0.0005] if it.get("lon") else None)
        center = [it["lon"], it["lat"]] if it.get("lon") else None
        out.citations.append({"kind": "parcel", "pnu": it["pnu"], "finding_id": it.get("id"), "addr": addr, "bbox": bbox, "center": center,
                              "rule": it.get("rule"), "priority": it.get("priority"), "set": "survey/namwon-parcel-survey",
                              "label": f"{addr} · {it.get('rule')} {it.get('priority')}", "env_keys": [k_ev, k_pa, k_cf],
                              "geom": _round_geom(g.get("_geom"))})
        if g.get("_geom"):
            feats.append({"type": "Feature", "geometry": g["_geom"],
                          "properties": {"n": n, "pnu": it["pnu"], "addr": addr, "rule": it.get("rule"), "priority": it.get("priority"),
                                         "jimok": it.get("jimok"), "score": it.get("score"), "evid_m2": it.get("evid_m2")}})
        if bbox:
            xs += [bbox[0], bbox[2]]
            ys += [bbox[1], bbox[3]]
    out.data = {"조건": cond, "items": rows_out,
                "비고": "숫자는 봉투 key 로만 참조 · AI 추론 검수 전 · 의심 후보이며 위법 판정 아님 · 건축물대장 미대조"}
    if xs:
        out.raw = {"bbox": [min(xs), min(ys), max(xs), max(ys)], "features": feats, "count_key": "shown", "total_key": "total",
                   "filter": {"rule": rule, "emd_cd": emd_cd, "jimok": jm, "priority": args.get("priority")},
                   "label": f"에이전트 질의 · {cond} · 저장 안 됨"}
    return out


def _round_geom(g):
    if not g:
        return None

    def r(c):
        return [round(c[0], 6), round(c[1], 6)] if isinstance(c[0], (int, float)) else [r(x) for x in c]
    return {"type": g["type"], "coordinates": r(g["coordinates"])}


def SRC_ROW(it) -> str:
    return f"{L.SRC_CSV}#rank={it.get('rank')}"


async def survey_stats(args: dict, ctx) -> Out:
    import asyncio
    _guard(ctx, args)
    by = args.get("by") or "rule"
    emd_n, emd_cd = L.emd_resolve(args.get("emd") or args.get("emd_cd"))
    if (args.get("emd") or args.get("emd_cd")) and not emd_n:
        raise ToolError("bad_request", f"읍면동 '{args.get('emd') or args.get('emd_cd')}' 을 남원 39개 법정동에서 찾지 못함")
    a_emd, a_rule, a_pri = await asyncio.gather(_http(ctx, "/survey/stats", {"by": "emd"}), _http(ctx, "/survey/stats", {"by": "rule"}),
                                                _http(ctx, "/survey/stats", {"by": "priority"}))
    scope = emd_n or "남원시 전체"
    if a_emd is not None:
        src, note = "GET /api/v1/survey/stats", L.NOTE_INF
        out = Out(source=src, note=note)
        if emd_n:
            row = next((x for x in a_emd.get("items") or [] if x.get("cd") == emd_cd), None)
            if row is None:
                raise ToolError("not_found", f"{emd_n} 집계 없음", 404)
            out.env("suspects", f"{scope} 의심 건수(규칙별 1행 · 전체)", row["n"])
            out.env("suspect_parcels", f"{scope} 의심 필지 수(중복 제거)", row["suspect_parcels"])
            out.env("parcels", f"{scope} 연속지적 필지 수", row["parcels"])
            for k, v in sorted((row.get("by_rule") or {}).items()):
                out.env(f"rule_{k}", f"{scope} {k} {RULE_NM.get(k, '')} 건수", v)
            for k, v in sorted((row.get("by_priority") or {}).items()):
                out.env(f"pri_{k}", f"{scope} 등급 {k} 건수", v)
        else:
            out.env("suspects", f"{scope} 의심 건수(규칙별 1행 · 전체)", a_emd["total"])
            items = a_emd.get("items") or []
            sp = sum(_v(x.get("suspect_parcels")) or 0 for x in items)
            base = dict(items[0]["suspect_parcels"]) if items else L.env(None, "필지", src)
            out.env("suspect_parcels", f"{scope} 의심 필지 수(중복 제거 · 39 읍면동 합)",
                    {**base, "value": sp, "source": "GET /api/v1/survey/stats?by=emd Σ suspect_parcels"})
            out.env("parcels", f"{scope} 연속지적 필지 수", a_emd["parcels"])
            for x in (a_rule or {}).get("items") or []:
                out.env(f"rule_{x['key']}", f"{scope} {x['key']} {RULE_NM.get(x['key'], '')} 건수", x["n"])
            for x in (a_pri or {}).get("items") or []:
                out.env(f"pri_{x['key']}", f"{scope} 등급 {x['key']} 건수", x["n"])
            if by == "emd":
                top = sorted(items, key=lambda x: -(_v(x.get("n")) or 0))[:8]
                for i, e in enumerate(top, 1):
                    out.env(f"emd_{i}", f"{e['key']} 의심 건수", e["n"])
    else:
        s = L.stats(by=by, emd=emd_n, rule=args.get("rule"))
        src, note = s["source"], L.NOTE_INF + " · F2-S API 미도착 → 정본 파일 임시 구현"
        out = Out(source=src, note=note)
        out.env("suspects", f"{scope} 의심 건수(규칙별 1행 · 전체)", L.env(s["suspects"], "count", src, note=note))
        out.env("suspect_parcels", f"{scope} 의심 필지 수(중복 제거)", L.env(s["suspect_parcels"], "필지", src, note=note))
        out.env("parcels", f"{scope} 연속지적 필지 수", L.env(s["parcels"], "필지", src, basis="recorded", note="V-World 연속지적 수집 2026-09-24"))
        for k, v in sorted(s["by_rule"].items()):
            out.env(f"rule_{k}", f"{scope} {k} {RULE_NM.get(k, '')} 건수", L.env(v, "count", src, note=note))
        for k, v in sorted(s["by_priority"].items()):
            out.env(f"pri_{k}", f"{scope} 등급 {k} 건수", L.env(v, "count", src, note=note))
    out.data = {"범위": scope, "읍면동코드": emd_cd, "규칙": dict(RULE_NM), "비고": "건수 = 의심 후보(규칙별 1행) · 필지 수는 중복 제거 · 임계 [추정 초기값]"}
    out.citations.append({"kind": "stats", "emd": emd_n, "emd_cd": emd_cd, "label": f"{scope} 집계 · {src}"})
    return out


async def survey_parcel(args: dict, ctx) -> Out:
    _guard(ctx, args)
    pnu = str(args.get("pnu") or "").strip()
    if not re.fullmatch(r"\d{19}", pnu):
        raise ToolError("bad_request", "pnu 는 19자리 숫자")
    api = await _http(ctx, f"/survey/parcels/{pnu}", {"with": "facts,findings,history"})
    d = L.parcel(pnu) if api is None else None
    if api is None and not d:
        raise ToolError("not_found", f"필지 {pnu} 없음(남원 연속지적)", 404)
    out = Out(source=L.SRC_GPKG if api is None else f"GET /api/v1/survey/parcels/{pnu}")
    if d:
        f = d["facts"]
        addr = str(f.get("addr") or "").replace("전북특별자치도 ", "")
        _wl(out, f.get("addr"), pnu, f.get("jibun"))
        out.env("area", "필지 면적(연속지적)", L.env(f.get("area_m2"), "m2", L.SRC_GPKG, basis="recorded", note="V-World 연속지적 2026-09-24"))
        out.env("bld", "2023 AI 건물 면적(필지 안)", L.env(f.get("a23_bld_m2"), "m2", L.SRC_GPKG))
        out.env("crop", "2023 AI 경작지 면적(필지 안)", L.env(f.get("a23_crop_m2"), "m2", L.SRC_GPKG))
        if f.get("jiga"):
            out.env("jiga", "공시지가", L.env(f.get("jiga"), "krw_m2", L.SRC_GPKG, basis="recorded", note=f"기준 {f.get('gosi_year') or ''}"))
        out.data = {"pnu": pnu, "주소": addr, "지목": f.get("jimok_nm") or f.get("jimok"), "용도지역": f.get("yongdo"), "농업진흥": f.get("nongup"),
                    "의심": [{"규칙": x["rule"], "등급": x["priority"], "근거": x.get("evidence")} for x in d["findings"]],
                    "이력요약": d.get("summary") or "이력 · 2023 단일 시점", "소유자": "연속지적 미제공(성명 없음)"}
        out.citations.append({"kind": "parcel", "pnu": pnu, "addr": addr, "bbox": f.get("_bbox"), "set": "survey/namwon-parcel-survey", "label": addr})
    else:
        out.data = {k: api.get(k) for k in ("pnu", "facts", "findings") if k in api}
    return out


async def survey_state(args: dict, ctx) -> Out:
    """쓰기(확인 카드 뒤에만 runner 가 부른다) — POST /survey/findings/{id}/state."""
    fid = str(args.get("finding_id") or "")
    state = args.get("state")
    if state not in ("assigned", "dismissed", "inspected", "closed"):
        raise ToolError("bad_request", "state 는 assigned|dismissed|inspected|closed")
    res = await ctx.http.post(f"/survey/findings/{fid}/state", json={k: args.get(k) for k in ("state", "reason", "assignee", "planned_for")} | {"client_id": ctx.run_id})
    if res.status_code == 404:
        raise ToolError("registry_unavailable", "실태조사 상태 쓰기 API(F2-S) 미도착 — 저장 안 됨", 404)
    if res.status_code >= 400:
        raise ToolError((res.json().get("error") or {}).get("code", "bad_request"), res.text[:200], res.status_code)
    out = Out(source=f"POST /api/v1/survey/findings/{fid}/state")
    out.data = {"finding": fid, "state": state}
    return out
