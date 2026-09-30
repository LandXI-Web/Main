"""c2-fusion 확장 — 행정데이터 × AI 융합 질의(모델 앞 결정적 직행 · 숫자는 도구 봉투로만).

fusion_suspects — '의심 필지 몇 건?'
  ① 의심 필지 수 = survey_stats(c2-numbers 한 출처)의 '의심 필지' 봉투 그대로(값을 새로 세지 않는다)
  ② 기관이 대장을 올려 결합을 마쳤으면 '올린 대장과 AI가 어긋난 필지'(대장 규칙 L1 · L2 · 대장 필지 · 중복 제거) — 다른 이름의 숫자.
     그 대장에 대장 규칙 결과가 아직 없으면(기관 임계 평가 전) 첫 화면 큰 숫자와 같은 R1(농지 위 AI 건물 · 대장 필지)로 센다
  ③ 지도 채색 = map_on survey/findings(대장이 있으면 L1 · L2 대장 필지, 없으면 관할 의심 필지)
fusion_chart — '의심 필지 읍면동별 차트' · '대장과 어긋난 필지 읍면동별 차트' → 명령 바 막대 차트(값 = 봉투 key) · 이름을 섞지 않는다
fusion_ledger — '대장상 농지인데 AI가 건물' 같은 대장 규칙 질문 → ledger_findings + 정해진 문장(표시 상한을 '의심 필지'로 부르지 않게)

지역을 고르는 순서(모든 도구 같음): 질문 속 시군구 → 질문 속 읍면동(관할 안에서 하나) → 화면의 대장(context.ledger)의 시군구 → 화면 지역(context.region).
대장 대조 숫자는 그 대장의 시군구가 답하는 지역과 같을 때만 붙인다(다른 지역 숫자를 한 문장에 섞지 않는다).
관할 가드는 runner 의 범위 가드 + survey_stats · 대장 도구 가드 그대로.
"""
from __future__ import annotations

import re

from .. import Out, ToolError

SUSPECT_COUNT = re.compile(r"의심.{0,14}(?:몇|건수|얼마|개수|총|수는|수\s*알려|수를)")
CHART = re.compile(r"차트|그래프|막대|도표")
MIS = "올린 대장과 AI가 어긋난 필지"
LEDGER_RULES = ("L1", "L2")
FALLBACK_RULES = ("R1",)            # 첫 화면 '대장은 농지 · AI는 건물' 과 같은 대체(대장 규칙 결과가 0일 때)
DOC = re.compile(r"보고서|초안|공문|문서")
LEDGER_ASK = re.compile(r"대장|신고|허가")
CHART_MAX = 12
MIS_ASK = re.compile(r"어긋|불일치|대장과\s*(?:AI|ai|에이아이)?\s*(?:가|이|의|랑|와)?\s*(?:다른|안\s*맞)")
RANK = re.compile(r"제일|가장|최다|최소|최대|순위|상위|하위|(?:많은|적은)\s*(?:곳|리|읍|면|동|순|지역|데)")
LEAST = re.compile(r"최소|적은|하위|덜")
TOPN = re.compile(r"(?:상위|하위)\s*\d+")                 # 필지 목록 요청(읍면동 순위 아님)
GOTO = re.compile(r"(?:지도\s*(?:를\s*)?)?(?:이동|(?:으로|로)\s*가\s*(?:줘|자|봐|주세요)|가\s*줘|옮겨|날아가|찾아\s*가|보여\s*(?:줘|주세요|줄래)|띄워\s*(?:줘|주세요))(?:해\s*(?:줘|주세요)|\s*줘)?")
EMD_WORD = re.compile(r"[가-힣]{1,6}(?:읍|면|동)")
GOTO_DATA = r"의심|필지|결과|몇|현황|요약|보고서|차트|대장|건수|통계|분석|목록|상위|얼마|어때|알려|설명|법|조문|영상|사진"

SPECS = {
    "fusion_suspects": {
        "description": "의심 필지 수(실태조사 한 출처)와 올린 대장과 AI가 어긋난 필지 수를 함께 확인하고 지도에 칠한다. '의심 필지 몇 건?' 에 쓴다.",
        "properties": {"region": {"type": "string", "description": "시군구 이름 또는 5자리 코드(없으면 화면 지역)"},
                       "emd": {"type": "string", "description": "읍면동 이름(있으면 그 읍면동만)"}},
    },
    "fusion_chart": {
        "description": "읍면동별 막대 차트 — kind=suspect(의심 필지) 또는 mismatch(올린 대장과 AI가 어긋난 필지).",
        "properties": {"kind": {"type": "string", "enum": ["suspect", "mismatch"]},
                       "region": {"type": "string", "description": "시군구 이름 또는 5자리 코드"}},
        "required": ["kind"],
        "route_only": True,
    },
    "fusion_ledger": {
        "description": "대장 규칙 질문('대장상 농지인데 AI가 건물' · '논인데 AI가 건물') — 대장 × AI 대조 필지 수 + 지도. 지목을 물으면 그 지목만.",
        "properties": {"rule_id": {"type": "string", "enum": ["L1", "L2", "L3"]},
                       "jimok": {"type": "string", "description": "물어본 대장 지목(답 · 전 · 과수원, 쉼표) — 논 = 답 · 밭 = 전"}},
        "required": ["rule_id"],
        "route_only": True,
    },
    "fusion_mismatch": {
        "description": "올린 대장과 AI가 어긋난 필지 — 전체 · 질문 속 리/읍면동만 · 가장 많은(적은) 리/읍면동. 대장 대조 목록 한 출처 + 지도 채색 + 막대.",
        "properties": {"order": {"type": "string", "enum": ["most", "least"]},
                       "level": {"type": "string", "enum": ["리", "읍면동"]}},
        "route_only": True,
    },
    "fusion_goto": {
        "description": "읍면동 이름으로 지도를 옮긴다(관할 안 · 시군구를 말하지 않아도).",
        "properties": {"emd": {"type": "string"}, "sgg_cd": {"type": "string"}},
        "required": ["emd", "sgg_cd"],
        "route_only": True,
    },
}
WHY = {"fusion_suspects": "의심 필지 · 대장 대조", "fusion_chart": "읍면동별 차트", "fusion_ledger": "대장 × AI 대조",
       "fusion_mismatch": "대장 × AI 대조", "fusion_goto": "읍면동으로 이동"}
SAY = dict(WHY)
HINT = "'의심 필지 몇 건' 처럼 의심 필지 수를 물으면 fusion_suspects 를 부른다(실태조사 의심 필지 + 올린 대장과 어긋난 필지 + 지도 채색)."


def allowed(name: str, p) -> bool:
    return getattr(p, "realm", None) in ("tenant", "lx")


# ── 공통: 봉투 · 대장 · 지역 ─────────────────────────────────────────────
def _suspect_env(o: Out) -> tuple[str, dict] | None:
    """survey_stats 결과에서 '의심 필지' 봉투 — 키가 바뀌어도 뜻으로 찾는다."""
    for key, meaning, e in o.envelopes:
        if key == "suspect_parcels":
            return meaning, e
    for key, meaning, e in o.envelopes:
        if key == "suspects":
            return meaning, e
    for key, meaning, e in o.envelopes:
        if "의심 필지" in meaning and not key.startswith(("emd_", "rule_", "pri_")):
            return meaning, e
    return None


def _clean_meaning(m: str) -> str:
    """봉투 뜻에서 내부 규칙 코드 · 겹친 단위를 뗀다('의심 필지(건 · 규칙 R1–R6)' → '의심 필지')."""
    s = re.sub(r"\s*\((?:[^()]*규칙[^()]*|중복 제거)\)", "", str(m or ""))
    s = re.sub(r"\s*(?:규칙\s*)?\b[RL]\d(?:\s*[–~-]\s*[RL]?\d)?\b", "", s)       # 남은 규칙 코드(R1–R6 · L1)도 뗀다
    return re.sub(r"\s{2,}", " ", s).strip(" ·")


async def _get(ctx, params: dict) -> dict:
    res = await ctx.http.get("/survey/findings", params=params)
    if res.status_code == 403:
        raise ToolError("tool_forbidden", "이 기관의 데이터가 아닙니다", 403)
    if res.status_code >= 400:
        raise ToolError("upstream_error", "대장 대조 결과를 읽지 못했습니다", res.status_code)
    return res.json()


def _val(x) -> int:
    return int((x or {}).get("value") or 0) if isinstance(x, dict) else int(x or 0)


async def rules_for(ctx, import_id: str) -> tuple[str, ...]:
    """이 대장의 어긋남 규칙 — 대장 규칙(L1 · L2) 결과가 있으면 그것, 없으면 R1(첫 화면 큰 숫자와 같은 대체)."""
    j = await _get(ctx, {"rule": ",".join(LEDGER_RULES + FALLBACK_RULES), "ledger": import_id, "limit": 1})
    by = j.get("by_rule") or {}
    return LEDGER_RULES if sum(_val(by.get(r)) for r in LEDGER_RULES) > 0 else FALLBACK_RULES


async def mismatch_items(ctx, import_id: str, rules: tuple[str, ...] = LEDGER_RULES) -> tuple[dict[str, str], str | None]:
    """대장 필지 가운데 어긋남 규칙 결과가 있는 필지 {pnu: 주소}(중복 제거) — 첫 화면 채색과 같은 목록(GET /survey/findings?ledger=)."""
    pn: dict[str, str] = {}
    as_of = None
    for off in range(0, 20000, 2000):
        j = await _get(ctx, {"rule": ",".join(rules), "ledger": import_id, "limit": 2000, "offset": off, "sort": "evid_m2"})
        items = j.get("items") or []
        as_of = as_of or (j.get("total") or {}).get("as_of")
        for it in items:
            if it.get("pnu"):
                pn.setdefault(str(it["pnu"]), str(it.get("addr") or ""))
        if len(items) < 2000:
            break
    return pn, as_of


async def mismatch(ctx, import_id: str, rules: tuple[str, ...] = LEDGER_RULES) -> tuple[int, str | None]:
    pn, as_of = await mismatch_items(ctx, import_id, rules)
    return len(pn), as_of


def _ctx_ledger(ctx) -> str | None:
    v = (getattr(ctx, "context", None) or {}).get("ledger")
    return str(v) if v else None


async def ledger_of(ctx, args: dict) -> dict | None:
    """화면의 대장(context.ledger) → 없으면 기관의 최신 농지대장(→ 최신 대장). LX 계정 · 기관 미지정이면 None."""
    from ..ledger_ingest import latest_import, tenant_for
    try:
        t = tenant_for(ctx, args)
    except ToolError as err:
        if err.code == "tool_forbidden":
            raise
        return None
    lid = _ctx_ledger(ctx)
    imp = None
    if lid:
        imp = await latest_import(ctx, t, None, lid)
    return imp or await latest_import(ctx, t, "farm_ledger") or await latest_import(ctx, t)


def ledger_sggs(imp: dict | None) -> list[str]:
    """대장이 가리키는 시군구 코드(서버 결합 기록 sgg · 없으면 AI 결합 sgg)."""
    if not imp:
        return []
    got = [str(x.get("sgg_cd")) for x in (imp.get("sgg") or []) if isinstance(x, dict) and x.get("sgg_cd")]
    if not got and isinstance(imp.get("ai"), dict):
        got = [str(x.get("sgg_cd")) for x in (imp["ai"].get("sgg") or []) if isinstance(x, dict) and x.get("sgg_cd")]
    return list(dict.fromkeys(got))


def _same_region(a: str | None, b: str | None) -> bool:
    if not a or not b:
        return False
    try:
        from .. import scope as S
        return bool(set(S.codes_of(str(a)) + [str(a)]) & set(S.codes_of(str(b)) + [str(b)]))
    except Exception:
        return str(a) == str(b)


async def emd_in_text(ctx, text: str) -> dict | None:
    """질문 속 읍면동 이름 → {emd, sgg_cd}(볼 수 있는 실태조사 읍면동 중 하나로 정해질 때만). 여러 시군구에 같은 이름이면 None."""
    t = str(text or "")
    if not re.search(r"[가-힣]{1,5}(?:읍|면|동)", t):
        return None
    p = ctx.principal
    try:
        from landxi_api.deps import db
        from landxi_api import regions as RG
        from .. import scope as S
        async with db(p) as conn:
            em = [dict(r) for r in await conn.fetch("SELECT name, coalesce(sgg_cd, left(emd_cd, 5)) sgg_cd FROM survey_emd WHERE name IS NOT NULL")]
        if getattr(p, "realm", None) == "tenant":
            sc = RG.tenant_scope(p.tenant_id)
            em = [x for x in em if any(RG.in_scope(c, sc) for c in S.codes_of(x["sgg_cd"]) + [x["sgg_cd"]])]
    except Exception:
        return None
    hits = [x for x in em if len(x["name"]) >= 2 and re.search(re.escape(x["name"]) + r"(?![가-힣]{0,1}(?:리|읍|면)\b)", t)]
    if not hits:
        return None
    best = max(len(x["name"]) for x in hits)
    top = [x for x in hits if len(x["name"]) == best]
    if len({x["sgg_cd"] for x in top}) != 1:
        return None
    return {"emd": top[0]["name"], "sgg_cd": top[0]["sgg_cd"]}


async def pick_region(ctx, args: dict, imp: dict | None) -> tuple[str | None, str | None]:
    """답할 지역(시군구 코드 또는 이름, 읍면동 이름) — 질문 속 시군구 → 질문 속 읍면동 → 화면 대장의 시군구 → None(= 화면 지역)."""
    if args.get("region"):
        return str(args["region"]), args.get("emd")
    msg = (getattr(ctx, "state", None) or {}).get("msg") or ""
    hit = await emd_in_text(ctx, msg) if msg else None
    if hit:
        return hit["sgg_cd"], hit["emd"]
    if imp and _ctx_ledger(ctx) and imp.get("import_id") == _ctx_ledger(ctx):
        sg = ledger_sggs(imp)
        if len(sg) == 1:
            return sg[0], None
    return None, None


def _stats_sgg(st: Out) -> str | None:
    for c in st.citations or []:
        if c.get("sgg_cd"):
            return str(c["sgg_cd"])
    return None


# ── fusion_suspects ─────────────────────────────────────────────────────
async def fusion_suspects(args: dict, ctx) -> Out:
    from .. import survey as SV
    out = Out(source="GET /api/v1/survey/stats · /survey/findings?ledger=")
    imp = await ledger_of(ctx, args)
    region, emd = await pick_region(ctx, args, imp)
    st = await SV.survey_stats({k: v for k, v in {"region": region, "emd": emd}.items() if v}, ctx)
    got = _suspect_env(st)
    if not got:
        raise ToolError("not_found", "해당 지역 데이터가 없습니다", 404)
    meaning, e = got
    out.env("suspect", _clean_meaning(meaning), e)
    out.whitelist |= st.whitelist
    scope = (st.data or {}).get("범위") if isinstance(st.data, dict) else None
    sgg = _stats_sgg(st) or (region if region and re.fullmatch(r"\d{5}", str(region)) else None) or (getattr(ctx, "context", None) or {}).get("region")
    n = None
    led_ok = imp and imp.get("state") == "matched" and (not isinstance(imp.get("ai"), dict) or imp["ai"].get("has"))
    same = led_ok and (not sgg or not ledger_sggs(imp) or any(_same_region(sgg, c) for c in ledger_sggs(imp)))
    if led_ok and same and not emd:
        rules = await rules_for(ctx, imp["import_id"])
        n, as_of = await mismatch(ctx, imp["import_id"], rules)
        out.env("mismatch", f"{MIS}(대장 × AI 대조 · 중복 제거)",
                {"value": n, "unit": "필지", "basis": "inferred", "as_of": as_of or e.get("as_of"),
                 "source": "GET /api/v1/survey/findings?ledger=", "note": "대장 × AI 분석 대조 · 검수 전 · 위법 판정 아님"})
        out.ui_actions.append({"op": "map_on", "set": "survey/findings", "label": MIS,
                               "filter": {"rule": ",".join(rules), "ledger": imp["import_id"]}, "import_id": imp["import_id"]})
        out.citations.append({"kind": "list", "rule": ",".join(rules), "import_id": imp["import_id"], "label": MIS, "env_keys": ["mismatch"]})
    else:
        f = {"sgg_cd": sgg} if sgg else {}
        out.ui_actions.append({"op": "map_on", "set": "survey/findings", "label": "의심 필지", "filter": f})
    out.citations.insert(0, {"kind": "list", "label": _clean_meaning(meaning), "sgg_cd": sgg, "env_keys": ["suspect"]})
    out.data = {"의심 필지": "suspect", "범위": scope, MIS: "mismatch" if n is not None else "대장 없음 · 대조 전",
                "비고": "의심 필지 = 실태조사 전체 · 어긋난 필지 = 올린 대장 필지만 · 검수 전 · 위법 판정 아님"}
    head = f"{scope} " if scope and not str(scope).endswith("관할 전체") else ""
    out.answer = (f"{head}의심 필지는 {{{{suspect}}}}입니다."
                  + (f" {MIS}는 {{{{mismatch}}}}이며 지도에 표시했습니다." if n else f" {MIS}는 없습니다." if n == 0 else ""))
    return out


# ── fusion_chart ────────────────────────────────────────────────────────
_EMD_TOK = re.compile(r"^[가-힣0-9]{1,8}(?:읍|면|동|가)$")
_RI_TOK = re.compile(r"^[가-힣0-9]{1,8}(?:리|동|가)$")


def place_of(addr: str) -> tuple[str | None, str | None]:
    """주소 한 줄 → (읍면동, 리) 이름."""
    toks = [t for t in re.split(r"\s+", addr or "") if t]
    e = next((t for t in toks[1:] if _EMD_TOK.match(t) and not t.endswith(("시", "군", "구"))), None)
    r = None
    if e:
        i = toks.index(e)
        r = next((t for t in toks[i + 1:i + 2] if _RI_TOK.match(t)), None)
    return e, r


def group_by_place(addrs: dict[str, str], level: str | None = None) -> tuple[str, list[tuple[str, int]]]:
    """{pnu: 주소} → ('읍면동'|'리', [(이름, 필지 수)…]) — 읍면동이 두 곳 이상이면 읍면동별, 한 곳이면 리별(한 대장 = 한 면인 경우).
    level='리' · '읍면동' 이면 그 단위로(질문이 단위를 말했을 때)."""
    emd: dict[str, int] = {}
    ri: dict[str, int] = {}
    for pnu, a in addrs.items():
        toks = [t for t in re.split(r"\s+", a or "") if t]
        e = next((t for t in toks[1:] if _EMD_TOK.match(t) and not t.endswith(("시", "군", "구"))), None)
        r = None
        if e:
            i = toks.index(e)
            r = next((t for t in toks[i + 1:i + 2] if _RI_TOK.match(t)), None)
        e = e or "기타"
        emd[e] = emd.get(e, 0) + 1
        key = f"{r}" if r else e
        ri[key] = ri.get(key, 0) + 1
    order = lambda d: sorted(d.items(), key=lambda x: (-x[1], x[0]))  # noqa: E731
    if level == "리":
        return "리", order(ri)
    if level == "읍면동":
        return "읍면동", order(emd)
    if len(emd) >= 2 or len(ri) < 2:
        return "읍면동", order(emd)
    return "리", order(ri)


async def fusion_chart(args: dict, ctx) -> Out:
    from .. import survey as SV
    kind = str(args.get("kind") or "suspect")
    imp = await ledger_of(ctx, args)
    region, _emd = await pick_region(ctx, args, imp)
    if kind == "mismatch":
        out = Out(source="GET /api/v1/survey/findings?ledger=")
        if not imp or imp.get("state") != "matched":
            out.data = {"안내": "올린 대장이 없습니다 → 대장 올리기" if not imp else "대장을 필지에 이어 붙이는 중입니다"}
            out.answer = "올린 대장이 없어 대조 전입니다. 대장을 올리면 AI 결과와 대조합니다." if not imp else "대장을 필지에 이어 붙이는 중입니다. 끝나면 다시 물어 주세요."
            return out
        if isinstance(imp.get("ai"), dict) and not imp["ai"].get("has"):
            out.data = {"상태": "AI 분석 전"}
            out.answer = "이 대장 지역은 아직 AI 분석 결과가 없어 대조하지 못했습니다."
            return out
        rules = await rules_for(ctx, imp["import_id"])
        addrs, as_of = await mismatch_items(ctx, imp["import_id"], rules)
        base = {"unit": "필지", "basis": "inferred", "as_of": as_of, "source": "GET /api/v1/survey/findings?ledger=",
                "note": "대장 × AI 분석 대조 · 검수 전 · 위법 판정 아님"}
        out.env("mismatch", f"{MIS}(대장 × AI 대조 · 중복 제거)", {**base, "value": len(addrs)})
        level, groups = group_by_place(addrs)
        rows = []
        for i, (nm, n) in enumerate(groups[:CHART_MAX], 1):
            out.env(f"emd_{i}", f"{nm} {MIS}", {**base, "value": n})
            rows.append({"label": nm, "env": f"emd_{i}"})
        if rows:
            out.blocks.append({"type": "chart", "kind": "bar", "title": f"{level}별 {MIS}", "rows": rows})
        out.ui_actions.append({"op": "map_on", "set": "survey/findings", "label": MIS,
                               "filter": {"rule": ",".join(rules), "ledger": imp["import_id"]}, "import_id": imp["import_id"]})
        out.citations.append({"kind": "list", "rule": ",".join(rules), "import_id": imp["import_id"], "label": MIS, "env_keys": ["mismatch"]})
        out.data = {"차트": f"{level}별 {MIS}", "합계": "mismatch", "막대": [r["label"] for r in rows],
                    "비고": "올린 대장 필지만 · 의심 필지(실태조사 전체)와 다른 숫자"}
        out.answer = (f"{MIS}는 {{{{mismatch}}}}입니다. {level}별로 막대 차트에 나누어 보였습니다." if rows else f"{MIS}는 없습니다.")
        return out
    # kind == suspect — 실태조사 의심 필지(survey_stats 한 출처 · 읍면동 막대는 survey_stats 가 만든 블록 그대로)
    st = await SV.survey_stats({k: v for k, v in {"region": region, "by": "emd"}.items() if v}, ctx)
    out = Out(source=st.source, note=st.note)
    for k, m, e in st.envelopes:
        out.env(k, _clean_meaning(m), e)
    out.whitelist |= st.whitelist
    out.blocks.extend(b for b in st.blocks if b.get("type") == "chart")
    got = _suspect_env(st)
    scope = (st.data or {}).get("범위") if isinstance(st.data, dict) else None
    sgg = _stats_sgg(st) or (region if region and re.fullmatch(r"\d{5}", str(region)) else None)
    key = next((k for k, _, e in st.envelopes if got and e is got[1]), None)
    out.data = {"차트": "읍면동별 의심 필지", "범위": scope, "합계": key}
    if sgg:
        out.ui_actions.append({"op": "map_on", "set": "survey/findings", "label": "의심 필지", "filter": {"sgg_cd": sgg}})
    head = f"{scope} " if scope else ""
    order = args.get("order")
    if order in ("most", "least") and out.blocks and key:
        vals = {k: e.get("value") for k, _, e in out.envelopes if isinstance(e, dict)}
        rows = [r for r in (out.blocks[0].get("rows") or []) if isinstance(vals.get(r.get("env")), (int, float))]
        if rows:
            v = (max if order == "most" else min)(vals[r["env"]] for r in rows)
            top = [r for r in rows if vals[r["env"]] == v]
            names = "·".join(r["label"] for r in top)
            word = "많은" if order == "most" else "적은"
            each = "각 " if len(top) > 1 else ""
            out.data["순위"] = {"이름": names, "값": top[0]["env"], "기준": f"가장 {word} 읍면동"}
            out.answer = (f"{head}의심 필지가 가장 {word} 읍면동은 {names}({each}{{{{{top[0]['env']}}}}})입니다. "
                          f"전체 의심 필지는 {{{{{key}}}}}이고, 읍면동별로 막대 차트에 나누어 보였습니다.")
            return out
    if out.blocks and key:
        out.answer = f"{head}의심 필지는 {{{{{key}}}}}입니다. 읍면동별로 막대 차트에 나누어 보였습니다."
    elif key:
        out.answer = f"{head}의심 필지는 {{{{{key}}}}}입니다. 읍면동별 차트는 시군구를 함께 말씀해 주시면 보여 드립니다."
    else:
        raise ToolError("not_found", "해당 지역 데이터가 없습니다", 404)
    return out


# ── fusion_mismatch ─────────────────────────────────────────────────────
def place_in_text(text: str, addrs: dict[str, str]) -> tuple[str, str] | None:
    """질문 속 리 · 읍면동 이름(대장 대조 목록 주소에 실제로 있는 이름만) → (이름, '리'|'읍면동'). 긴 이름 먼저."""
    t = str(text or "")
    names: dict[str, str] = {}
    for a in addrs.values():
        e, r = place_of(a)
        if e:
            names.setdefault(e, "읍면동")
        if r:
            names.setdefault(r, "리")
    for nm in sorted(names, key=len, reverse=True):
        if len(nm) >= 2 and nm in t:
            return nm, names[nm]
    return None


def _level_asked(text: str) -> str | None:
    """질문이 말한 단위 — '리는 · 리별' → 리, '읍면동 · 면은 · 읍별' → 읍면동, 없으면 None."""
    t = str(text or "")
    if re.search(r"읍면동|읍면|(?<![가-힣])(?:읍|면|동)(?:별|은|는|이|가|으로)", t):
        return "읍면동"
    if re.search(r"(?<![가-힣])리(?:별|는|가|로|$|\s|\?)", t):
        return "리"
    return None


async def _ledger_ready(ctx, args: dict, out: Out) -> dict | None:
    """대조할 대장(없거나 결합 중 · AI 분석 전이면 안내 문장을 out 에 두고 None)."""
    imp = await ledger_of(ctx, args)
    if not imp or imp.get("state") != "matched":
        out.data = {"안내": "올린 대장이 없습니다 → 대장 올리기" if not imp else "대장을 필지에 이어 붙이는 중입니다"}
        out.answer = "올린 대장이 없어 대조 전입니다. 대장을 올리면 AI 결과와 대조합니다." if not imp else "대장을 필지에 이어 붙이는 중입니다. 끝나면 다시 물어 주세요."
        return None
    if isinstance(imp.get("ai"), dict) and not imp["ai"].get("has"):
        out.data = {"상태": "AI 분석 전"}
        out.answer = "이 대장 지역은 아직 AI 분석 결과가 없어 대조하지 못했습니다."
        return None
    return imp


async def fusion_mismatch(args: dict, ctx) -> Out:
    """올린 대장과 AI가 어긋난 필지 — 대조 목록(fusion_chart mismatch 와 같은 목록 · 같은 묶음)에서만 센다.
    ① 질문 속 리/읍면동 → 그곳의 어긋난 필지 ② '가장 많은/적은' → 순위 1곳 ③ 그 밖 → 전체. 막대(같은 봉투) + 지도 채색."""
    out = Out(source="GET /api/v1/survey/findings?ledger=")
    imp = await _ledger_ready(ctx, args, out)
    if imp is None:
        return out
    msg = (getattr(ctx, "state", None) or {}).get("msg") or ""
    rules = await rules_for(ctx, imp["import_id"])
    addrs, as_of = await mismatch_items(ctx, imp["import_id"], rules)
    base = {"unit": "필지", "basis": "inferred", "as_of": as_of, "source": "GET /api/v1/survey/findings?ledger=",
            "note": "대장 × AI 분석 대조 · 검수 전 · 위법 판정 아님"}
    out.env("mismatch", f"{MIS}(대장 × AI 대조 · 중복 제거)", {**base, "value": len(addrs)})
    place = place_in_text(msg, addrs)
    level = args.get("level") or _level_asked(msg)
    if place and not args.get("order"):
        level = place[1]
    level, groups = group_by_place(addrs, level)
    rows = []
    for i, (nm, n) in enumerate(groups[:CHART_MAX], 1):
        out.env(f"emd_{i}", f"{nm} {MIS}", {**base, "value": n})
        rows.append({"label": nm, "env": f"emd_{i}"})
    if len(rows) >= 2:
        out.blocks.append({"type": "chart", "kind": "bar", "title": f"{level}별 {MIS}", "rows": rows})
    flt = {"rule": ",".join(rules), "ledger": imp["import_id"]}
    order = args.get("order") if args.get("order") in ("most", "least") else None
    focus = None
    if order and groups:
        v = (max if order == "most" else min)(n for _, n in groups)
        top = [(nm, n) for nm, n in groups if n == v]
        k = next((r["env"] for r in rows if r["label"] == top[0][0]), None)
        if not k:
            out.env("top", f"{top[0][0]} {MIS}", {**base, "value": v})
            k = "top"
        names = "·".join(nm for nm, _ in top)
        word = "많은" if order == "most" else "적은"
        josa = "는" if level == "리" else "은"
        each = "각 " if len(top) > 1 else ""
        out.answer = (f"{MIS}가 가장 {word} {level}{josa} {names}({each}{{{{{k}}}}})입니다. "
                      f"올린 대장 전체로는 {{{{mismatch}}}}이고, {level}별로 막대 차트에 나누어 보였습니다.")
        focus = top[0][0] if len(top) == 1 else None
        out.data = {"순위": names, "값": k, "기준": f"가장 {word} {level}", "전체": "mismatch"}
    elif place:
        nm = place[0]
        n = sum(1 for a in addrs.values() if nm in place_of(a))
        out.env("place", f"{nm} {MIS}", {**base, "value": n})
        focus = nm
        out.answer = (f"{nm}에서 {MIS}는 {{{{place}}}}입니다." + (" 지도에 표시했습니다." if n else "")
                      + " 올린 대장 전체로는 {{mismatch}}입니다.")
        out.data = {"지역": nm, "필지": "place", "전체": "mismatch"}
    else:
        out.answer = f"{MIS}는 {{{{mismatch}}}}입니다." + (" 지도에 표시했습니다." if addrs else "")
        out.data = {"전체": "mismatch", "막대": [r["label"] for r in rows]}
    if focus:
        flt["place"] = focus
    if addrs:
        out.ui_actions.append({"op": "map_on", "set": "survey/findings", "label": f"{focus} · {MIS}" if focus else MIS,
                               "filter": flt, "import_id": imp["import_id"]})
    out.citations.append({"kind": "list", "rule": ",".join(rules), "import_id": imp["import_id"], "label": MIS, "env_keys": ["mismatch"]})
    return out


# ── fusion_goto ─────────────────────────────────────────────────────────
async def _emd_bbox(ctx, emd: str, sgg_cd: str):
    try:
        from landxi_api.deps import db
        async with db(ctx.principal) as conn:
            r = await conn.fetchrow("SELECT emd_cd, bbox FROM survey_emd WHERE name = $1 AND coalesce(sgg_cd, left(emd_cd, 5)) = $2 LIMIT 1", emd, sgg_cd)
        if r and r["bbox"] and len(r["bbox"]) == 4:
            return [float(x) for x in r["bbox"]], r["emd_cd"]
    except Exception:
        pass
    return None, None


async def fusion_goto(args: dict, ctx) -> Out:
    """읍면동으로 지도 이동 — 시군구 관할 가드(map_region 과 같은 판정) · 읍면동 경계 범위(없으면 시군구 범위)."""
    from . import map as MP
    emd, sgg = str(args.get("emd") or "").strip(), str(args.get("sgg_cd") or "").strip()
    if not emd or not sgg:
        raise ToolError("bad_request", "읍면동을 찾지 못했습니다")
    r = MP.resolve_region({"sgg_cd": sgg}, ctx)
    bbox, emd_cd = await _emd_bbox(ctx, emd, sgg)
    a = MP.region_action(r)
    nm = f"{r.get('name') or ''} {emd}".strip()
    a.update({"name": nm, "emd": emd, "emd_cd": emd_cd})
    if bbox:
        a["bbox"] = bbox
        a["center"] = [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2]
    out = Out(source="지도 동작(브라우저)")
    out.ui_actions.append(a)
    out.whitelist |= {r["sgg_cd"]}
    out.data = {"이동": nm, "실행": "됨 — 브라우저가 지도를 이 읍면동으로 옮겼다"}
    out.answer = f"지도를 {nm}으로 옮겼습니다."
    return out


# ── fusion_ledger ───────────────────────────────────────────────────────
async def fusion_ledger(args: dict, ctx) -> Out:
    """대장 규칙 질문 → ledger_findings 그대로 + 정해진 문장. '그중 지도에 표시한 필지'(표시 상한)와 조건 필지 수의 이름을 나눈다."""
    from .. import ledger_findings as LF
    a = {"rule_id": args.get("rule_id") or "L1", "top": 10}
    if args.get("jimok"):
        a["jimok"] = args["jimok"]                       # 물어본 대장 지목(논 = 답 · 밭 = 전 · 과수원) — 빼고 세지 않는다
    lid = _ctx_ledger(ctx)
    if lid:
        a["import_id"] = lid
    out = await LF.ledger_findings(a, ctx)
    keys = {k for k, _, _ in out.envelopes}
    if "total" in keys:
        rn = (out.data or {}).get("조건") if isinstance(out.data, dict) else None
        feats = bool((out.raw or {}).get("features")) if isinstance(out.raw, dict) else False
        miss = (out.data or {}).get("지목") if isinstance(out.data, dict) else None
        out.answer = ((f"{miss.split(' — ')[0]}. 지목 조건 없이 " if miss else "")
                      + f"올린 대장에서 '{rn or '대장과 다른 필지'}' 조건에 맞는 필지는 {{{{total}}}}입니다."
                      + (" 그중 근거 면적이 큰 {{shown}}을 지도에 표시했습니다." if feats else ""))
    else:
        d = out.data if isinstance(out.data, dict) else {}
        out.answer = str(d.get("안내") or "대장 대조 결과가 없습니다").rstrip(".") + "."
    return out


HANDLERS = {"fusion_suspects": fusion_suspects, "fusion_chart": fusion_chart, "fusion_ledger": fusion_ledger,
            "fusion_mismatch": fusion_mismatch, "fusion_goto": fusion_goto}


def _regions_in(msg: str) -> dict:
    try:
        from ..summary_lookup import match_regions
        hits = match_regions(msg)
        if len({h["sgg_cd"] for h in hits}) == 1:
            return {"region": hits[0]["sgg_cd"]}
    except Exception:
        pass
    return {}


def ROUTE(msg: str, ctx):
    """모델 앞 직행 — ① 의심/대장 대조 차트 ② 대장 규칙 질문 ③ '의심 필지 몇 건?'. 영어 질문은 모델 경로(같은 도구)."""
    p = getattr(ctx, "principal", None)
    q = msg or ""
    if getattr(p, "realm", None) not in ("tenant", "lx") or getattr(ctx, "lang", "ko") == "en":
        return None
    if DOC.search(q):
        return None                                      # 보고서 · 공문은 보고서 도구의 길
    c = getattr(ctx, "context", None) or {}
    if CHART.search(q) and re.search(r"의심|어긋|대장|불일치", q):
        a = {**_regions_in(q), "kind": "mismatch" if re.search(r"어긋|대장|불일치", q) else "suspect"}
        if RANK.search(q) and a["kind"] == "suspect":
            a["order"] = "least" if LEAST.search(q) else "most"
        return {"tool": "fusion_chart", "args": a}
    if CHART.search(q):
        return None
    if MIS_ASK.search(q):                                # 대장 대조 결과를 이어 묻는 질문(전체 · 리/읍면 · 순위) — 대조 목록 한 출처
        a = {}
        if RANK.search(q):
            a["order"] = "least" if LEAST.search(q) else "most"
        lv = _level_asked(q)
        if lv:
            a["level"] = lv
        return {"tool": "fusion_mismatch", "args": a}
    if RANK.search(q) and re.search(r"의심", q) and not re.search(r"대장", q) and not TOPN.search(q):   # '상위 5곳' = 필지 목록(모델 경로)
        return {"tool": "fusion_chart", "args": {**_regions_in(q), "kind": "suspect", "order": "least" if LEAST.search(q) else "most"}}
    if LEDGER_ASK.search(q) and c.get("mode") != "ledger":
        from .. import ledger_rule
        got = ledger_rule.parse(q)
        if got and not got.get("thresholds") and not re.search(r"다시\s*(뽑|계산|적용)|기준\s*을?\s*바꿔|임계", q):
            from ..ledger_findings import asked_jimok
            jm = asked_jimok(q) if got["rule"] in ("L1", "L2") else []
            return {"tool": "fusion_ledger", "args": {"rule_id": got["rule"], **({"jimok": ",".join(jm)} if jm else {})}}
    if SUSPECT_COUNT.search(q) and not re.search(r"대장|신고|허가", q):
        return {"tool": "fusion_suspects", "args": _regions_in(q)}
    if GOTO.search(q) and EMD_WORD.search(GOTO.sub(" ", q)) and not re.search(GOTO_DATA, q):
        return _route_goto(q, ctx)                       # 읍면동 이름만으로 지도 이동(DB 로 이름 확인 · 비동기)
    return None


async def _route_goto(q: str, ctx) -> dict | None:
    """'병영면으로 지도 이동해 줘' → 관할 읍면동 하나로 정해지면 fusion_goto. 질문 속 시군구가 다른 곳이면 None(시군구 이동 · 관할 가드 길)."""
    hit = await emd_in_text(ctx, GOTO.sub(" ", q))
    if not hit:
        return None
    try:
        from ..summary_lookup import match_regions
        regs = match_regions(q)
    except Exception:
        regs = []
    if any(not _same_region(h["sgg_cd"], hit["sgg_cd"]) for h in regs):
        return None
    return {"tool": "fusion_goto", "args": {"emd": hit["emd"], "sgg_cd": hit["sgg_cd"]}}
