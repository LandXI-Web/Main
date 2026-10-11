"""숫자 질문을 같은 이름 · 같은 출처로(확인 16차 대화-1 규칙 ⑤ · ③ · ④) — 모델 없이 바로 답한다.

  survey_count(name, region?)        '현장 확인 필요 필지 몇 건' · '의심 필지 몇 건' — 물은 이름의 숫자를 먼저, 다른 이름은 다음 문장(숫자 한 출처 =
                                     survey_stats = /summary metrics · XI맵 큰 숫자 · 첫 화면). 기관의 '우리 시'는 관할.
  survey_compare(regions, name)      '구례군과 남원시 의심 필지 수 비교' — 같은 이름의 숫자끼리만 나란히 + 막대 둘(다른 이름의 숫자는 섞지 않는다).
  region_brief()                     '이 지역 결과 요약'인데 지역을 고르지 않은 화면 — 전국 요약 두 문장 + 의심 필지가 많은 시군구 막대 + 지역 버튼.

지역을 고르는 순서는 talk.resolve(지명 > 우리 시 > 화면 지역 > 직전 지역). 지역 고정값 0. 숫자는 봉투(도구 결과)로만.
"""
from __future__ import annotations

import re

from .. import Out, ToolError

SPECS = {
    "survey_count": {"description": "현장 확인 필요 필지 · 의심 필지 건수(물은 이름 그대로) — '○○ 현장 확인 필요 필지 몇 건' · '우리 시 의심 필지 몇 건'.",
                     "properties": {"name": {"type": "string", "enum": ["field_check", "suspects"]}, "region": {"type": "string", "description": "시군구 이름 또는 코드"}}},
    "survey_compare": {"description": "두 시군구의 같은 이름 숫자 비교(의심 필지 · 현장 확인 필요) — 막대 둘.",
                       "properties": {"regions": {"type": "array", "items": {"type": "string"}}, "name": {"type": "string", "enum": ["field_check", "suspects"]}},
                       "required": ["regions"]},
    "ai_count": {"description": "AI 분석 결과 수(LX 계정 · 화면 XI맵 큰 숫자와 같은 값) — '○○ AI 분석 결과 몇 건'.",
                 "properties": {"region": {"type": "string", "description": "시군구 이름 또는 코드"}}, "route_only": True},
    "region_brief": {"description": "지역을 고르지 않은 화면의 '이 지역 결과 요약' — 전국 요약 두 문장 + 의심 필지가 많은 시군구 막대.", "properties": {}},
    "rule_gap": {"description": "실태조사 조건에 없는 조합(대장 논 · 밭 위 비닐하우스 등) — 이유 한 줄 + 가까운 조건 버튼.", "properties": {"kind": {"type": "string"}},
                 "route_only": True},
}
HANDLERS: dict = {}
WRITE: set[str] = set()
CONFIRM: set[str] = set()
CLIENT: set[str] = set()
WHY = {"ai_count": "AI 분석 결과 수(화면과 같은 값)", "survey_count": "건수 확인(물은 이름 그대로)", "survey_compare": "두 지역 같은 이름 숫자 비교", "region_brief": "전국 요약", "rule_gap": "없는 조건 안내"}
SAY = {"ai_count": "AI 분석 결과 확인", "survey_count": "건수 확인", "survey_compare": "두 지역 비교", "region_brief": "전국 결과 요약", "rule_gap": "조건 확인"}
NAME_KO = {"field_check": "현장 확인 필요 필지", "suspects": "의심 필지"}


def allowed(name: str, p) -> bool:
    return getattr(p, "realm", None) in ("lx", "tenant")


COUNT_RX = re.compile(r"몇\s*(건|필지|개|곳)?|건수|얼마나|개수|숫자|총\s*몇")
FIELD_RX = re.compile(r"현장\s*확인\s*(필요)?")
SUS_RX = re.compile(r"의심\s*(필지)?")
AI_RX = re.compile(r"AI\s*(분석\s*)?(결과|탐지)|분석\s*결과")
COUNT_NOT = re.compile(r"차트|그래프|막대|목록|상위|지번|보고서|공문|대장|규칙|유형|등급|읍\s*면\s*동|동별|비교|견줘|법|조문|영상")
CMP_RX = re.compile(r"비교|견줘|대비|어디가\s*(더|많)|차이")
HERE_RX = re.compile(r"(이|우리|여기|이곳)\s*(지역|곳|시|군|구)?.{0,8}(결과|요약|현황|정리)|^결과\s*요약")


async def _stats(ctx, r: dict | None) -> Out:
    from ..survey import survey_stats
    return await survey_stats({"by": "rule", **({"region": r["sgg_cd"]} if r else {})}, ctx)


def _place(ctx, r: dict | None) -> str:
    if r:
        return r["name"]
    return "관할 전체" if getattr(ctx.principal, "realm", None) == "tenant" else "전국"


async def survey_count(args: dict, ctx) -> Out:
    from ... import talk
    from .map import resolve_region
    name = args.get("name") if args.get("name") in NAME_KO else "field_check"
    if args.get("region"):
        r = resolve_region({"name": args["region"]}, ctx)
    else:
        r, _src, _alts = await talk.resolve(ctx, (ctx.state or {}).get("msg") or "")
    src = await _stats(ctx, r)
    out = Out(source=src.source, note=src.note)
    keys = {k: (m, e) for k, m, e in src.envelopes}
    for k in ("field_check", "suspects"):
        if k in keys:
            out.env(k, keys[k][0], keys[k][1])
    out.whitelist |= src.whitelist | ({r["sgg_cd"]} if r else set())
    place = _place(ctx, r)
    busy = any((keys.get(k, (None, {}))[1] or {}).get("value") is None for k in ("field_check", "suspects") if k in keys)
    if name not in keys or busy:
        out.answer = f"{place} 실태조사 결과를 지금 집계하고 있습니다. 끝나면 같은 질문에 숫자로 답합니다."
        talk.set_next(ctx, [talk.btn("다시 물어보기", q=(ctx.state or {}).get("msg") or f"{place} {'의심' if talk.lx_ai(ctx) else '현장 확인 필요'} 필지 몇 건이야?")])
        return out
    other = "suspects" if name == "field_check" else "field_check"
    s1 = f"{place} {NAME_KO[name]}는 {{{{{name}}}}}입니다."
    if talk.lx_ai(ctx):                                   # 원칙 135 — LX 답은 '현장 확인' 문장 · 버튼 없이
        s2 = ""
    elif other in keys:
        s2 = (f"의심 필지 {{{{suspects}}}} 가운데 먼저 현장에서 확인할 필지입니다." if name == "field_check"
              else f"그 가운데 먼저 현장에서 확인할 필지(현장 확인 필요)는 {{{{field_check}}}}입니다.")
    else:
        s2 = ""
    out.answer = (s1 + " " + s2).strip()
    out.data = {"지역": place, "물은 숫자": NAME_KO[name]}
    if r:
        await talk.remember(ctx, r["sgg_cd"])
        nm = r["name"]
        see = (talk.btn("AI 분석 결과만 보여 줘", q="AI 분석 결과 층만 켜 줘") if talk.lx_ai(ctx) and talk.on_xi(ctx) and talk.has_map(ctx) is not False
               else talk.btn("현장 확인 필요 필지만 보여 줘") if talk.on_xi(ctx) and talk.has_map(ctx) is not False
               else talk.btn("지도에서 보기", href=talk.xi_href(ctx, r["sgg_cd"])) if talk.xi_href(ctx, r["sgg_cd"]) else None)
        talk.set_next(ctx, [see, talk.btn("읍면동별 차트", q=f"{nm} 의심 필지 읍면동별 차트로 보여 줘"),
                            talk.btn("보고서 초안", q=f"{nm} 보고서 초안 만들어 줘")])
    return out


async def ai_count(args: dict, ctx) -> Out:
    """LX 계정의 숫자 질문(원칙 135) — AI 분석 결과(요약 한 출처 · 화면 XI맵 큰 숫자와 같은 계산 talk.ai_result).
    LX 직원이 '현장 확인 필요 필지 몇 건'이라고 물어도 이 답(LX 화면에는 그 숫자가 없다)."""
    from ... import talk
    from .map import resolve_region
    if args.get("region"):
        r = resolve_region({"name": args["region"]}, ctx)
    else:
        r, _src, _alts = await talk.resolve(ctx, (ctx.state or {}).get("msg") or "")
    place = _place(ctx, r)
    ar = await talk.ai_result(ctx, r["sgg_cd"] if r else None)
    out = Out(source="요약(AI 분석 결과)")
    out.whitelist |= {r["sgg_cd"]} if r else set()
    nm = r["name"] if r else None
    if not ar:
        out.answer = f"{place}에는 아직 숫자로 셀 수 있는 AI 분석 결과가 없습니다."
        talk.set_next(ctx, [talk.btn(f"{nm} 결과 요약 보기", q=f"{nm} 결과 요약해 줘")] if nm else [])
        return out
    out.env("ai_result", f"{place} {talk.AI_LABEL}", ar["env"])
    svc = talk.ai_services(ar)
    out.whitelist |= set(re.findall(r"\d[\d,.]*", svc))
    out.answer = f"{place} {talk.AI_LABEL}는 {{{{ai_result}}}}입니다" + (f"({svc})." if svc else ".")
    out.data = {"지역": place, "숫자": talk.AI_LABEL, "서비스": svc}
    if r:
        await talk.remember(ctx, r["sgg_cd"])
        see = (talk.btn("AI 분석 결과만 보여 줘", q="AI 분석 결과 층만 켜 줘") if talk.on_xi(ctx) and talk.has_map(ctx) is not False
               else talk.btn("지도에서 보기", href=talk.xi_href(ctx, r["sgg_cd"])) if talk.xi_href(ctx, r["sgg_cd"]) else None)
        talk.set_next(ctx, [see, talk.btn(f"{nm} 결과 요약 보기", q=f"{nm} 결과 요약해 줘"),
                            talk.btn("보고서 초안", q=f"{nm} 보고서 초안 만들어 줘")])
    return out


async def survey_compare(args: dict, ctx) -> Out:
    from ... import talk
    from .map import resolve_region
    name = args.get("name") if args.get("name") in NAME_KO else "suspects"
    regs = [resolve_region({"name": x}, ctx) for x in (args.get("regions") or [])[:2]]
    if len(regs) < 2:
        raise ToolError("bad_request", "비교할 지역이 둘이어야 합니다", 400)
    out = Out(source="실태조사 결과(필지 대조)")
    rows, parts, missing = [], [], []
    for i, r in enumerate(regs):
        try:
            st = await _stats(ctx, r)
        except ToolError:
            missing.append(r["name"])
            continue
        e = next((e for k, m, e in st.envelopes if k == name), None)
        if not e or e.get("value") is None:
            missing.append(r["name"])
            continue
        key = f"r{i}"
        out.env(key, f"{r['name']} {NAME_KO[name]}", e)
        rows.append({"label": r["name"], "env": key})
        parts.append(f"{r['name']} {{{{{key}}}}}")
        out.whitelist |= {r["sgg_cd"]}
    if rows:
        out.blocks.append({"type": "chart", "kind": "bar", "title": f"{NAME_KO[name]} 비교", "rows": rows})
    s1 = f"{NAME_KO[name]}는 {' · '.join(parts)}입니다(아래 막대)." if parts else ""
    s2 = " · ".join(missing) + f"{talk.josa(missing[-1], ('은', '는'))} 아직 실태조사 결과가 없습니다." if missing else ""
    out.answer = (s1 + " " + s2).strip() or "두 지역 모두 아직 실태조사 결과가 없습니다."
    out.data = {"비교": [r["name"] for r in regs], "숫자 이름": NAME_KO[name]}
    nxt = []
    for r in regs[:2]:
        if talk.on_xi(ctx):
            nxt.append(talk.btn(f"{r['name']}로 이동", q=f"{r['name']}{talk.josa(r['name'], ('으로', '로'))} 이동해 줘"))
        elif talk.xi_href(ctx, r["sgg_cd"]):
            nxt.append(talk.btn(f"XI맵에서 {r['name']} 보기", href=talk.xi_href(ctx, r["sgg_cd"])))
    talk.set_next(ctx, nxt)
    return out


async def region_brief(args: dict, ctx) -> Out:
    """전국(기관은 관할) 요약 — 결과가 있는 시군구 수 · 서비스 수 + 의심 필지가 많은 시군구 다섯(막대) + 지역 버튼 셋."""
    from ... import talk
    from ..summary_lookup import build, tenant_arg
    from landxi_api.deps import db
    from landxi_api.envelope import env, now_iso
    async with db(ctx.principal) as conn:
        vis = await build(conn, tenant_arg(ctx.principal))
    items = [it for it in (vis.get("items") or []) if it.get("sgg_cd")]
    with_res = [it for it in items if it.get("stage") in ("운영", "시범")]
    sggs = {it["sgg_cd"] for it in with_res}
    cards = {it["card"] for it in with_res}
    at = now_iso()
    out = Out(source="보유 결과 요약(요약 API 와 같은 값)")
    out.env("n_regions", "결과가 있는 시군구 수", env(len(sggs), "곳", "recorded", "보유 결과 요약", None, at))
    out.env("n_cards", "결과가 있는 서비스 수", env(len(cards), "개", "recorded", "보유 결과 요약", None, at))
    best: dict = {}
    for it in with_res:
        e = ((it.get("metrics") or {}).get("suspect") or {})
        if e.get("value") is None:
            continue
        nm = str(it.get("region_name") or "").split(" ")[-1]
        if it["sgg_cd"] not in best or (best[it["sgg_cd"]][1].get("value") or 0) < e["value"]:
            best[it["sgg_cd"]] = (nm, {k: e[k] for k in ("value", "unit", "basis", "as_of", "source") if k in e})
    top = sorted(best.items(), key=lambda kv: -(kv[1][1].get("value") or 0))[:5]
    rows = []
    for i, (cd, (nm, e)) in enumerate(top):
        out.env(f"t{i}", f"{nm} 의심 필지", e)
        rows.append({"label": nm, "env": f"t{i}"})
    if rows:
        out.blocks.append({"type": "chart", "kind": "bar", "title": "의심 필지가 많은 시군구", "rows": rows})
    scope = "관할" if getattr(ctx.principal, "realm", None) == "tenant" else "전국"
    out.answer = (f"아직 지역을 고르지 않아 {scope} 요약입니다 — 결과가 있는 시군구 {{{{n_regions}}}}, 서비스 {{{{n_cards}}}}입니다."
                  + (" 의심 필지가 많은 곳부터 아래 막대에 두었습니다." if rows else ""))
    out.data = {"범위": scope}
    talk.set_next(ctx, [talk.btn(nm, q=f"{nm} 결과 요약해 줘") for _cd, (nm, _e) in top[:3]])
    return out


async def rule_gap(args: dict, ctx) -> Out:
    """농지(논 · 밭 · 과수원) 위 비닐하우스는 영농시설이라 의심 조건(R1–R6 · L1–L3)에 없다 — 물은 것과 다른 조건(건물 등)으로 바꿔 세지 않는다(실태 28 · C4)."""
    from ... import talk
    out = Out(source="실태조사 조건(규칙 목록)")
    out.data = {"조건": "농지 위 비닐하우스 — 의심 조건 아님(영농시설)"}
    out.answer = ("대장상 논 · 밭에 있는 비닐하우스는 영농시설이라 실태조사 의심 조건에 없어 따로 세지 않습니다. "
                  "가까운 조건인 '비농지 위 비닐하우스(용도 불일치)' 필지나 비닐하우스 AI 분석 결과를 볼 수 있습니다.")
    talk.set_next(ctx, [talk.btn("비농지 위 비닐하우스 필지 보기", q="비닐하우스 의심 필지 10곳 보여 줘"),
                        talk.btn("비닐하우스 AI 분석 결과만 보기", q="비닐하우스 결과만 보여 줘"),
                        talk.btn("대장 농지 위 건물 필지 보기", q="대장상 농지인데 AI가 건물로 본 필지 보여 줘")])
    if isinstance(getattr(ctx, "state", None), dict):
        ctx.state["cannot"] = {"kind": "other"}
    return out


HANDLERS.update({"ai_count": ai_count, "survey_count": survey_count, "survey_compare": survey_compare, "region_brief": region_brief, "rule_gap": rule_gap})
GAP_RX = re.compile(r"(대장|지목).{0,14}(논|밭|답|전|과수원|농지).{0,24}비닐\s*하우스|비닐\s*하우스.{0,14}(대장|지목).{0,10}(논|밭|농지)")


async def ROUTE(msg: str, ctx):
    """숫자 질문 · 두 지역 비교 · 지역 없는 '이 지역 결과 요약' — 맞으면 위 도구로 바로(모델 0)."""
    from ... import talk
    t = re.sub(r"\s+", " ", msg or "").strip()
    if not t or len(t) > 80 or getattr(ctx, "lang", "ko") == "en":
        return None
    if GAP_RX.search(t) and not re.search(r"비농지|대\s*·|잡종지|공장|창고", t):
        return {"tool": "rule_gap", "args": {"kind": "farm_greenhouse"}}
    groups = talk.regions_in(t)
    named = [talk.pick(ctx, g)[0] for g in groups]
    has_field, has_sus = bool(FIELD_RX.search(t)), bool(SUS_RX.search(t))
    # 두 지역 비교(같은 이름의 숫자끼리)
    if len(named) == 2 and CMP_RX.search(t) and (has_field or has_sus or re.search(r"필지|건수|몇", t)) and not re.search(r"영상|시점|대장", t):
        return {"tool": "survey_compare", "args": {"regions": [r["sgg_cd"] for r in named], "name": "field_check" if has_field and not has_sus else "suspects"}}
    # LX 계정 — AI 분석 결과 수 · '현장 확인 필요 몇 건'도 AI 분석 결과로(원칙 135 · 화면과 같은 값)
    if talk.lx_ai(ctx) and (has_field or (AI_RX.search(t) and not has_sus)) and COUNT_RX.search(t) and not COUNT_NOT.search(t) and not CMP_RX.search(t) and len(named) <= 1:
        return {"tool": "ai_count", "args": {**({"region": named[0]["sgg_cd"]} if named else {})}}
    # 건수 질문(물은 이름 그대로)
    if (has_field or has_sus) and COUNT_RX.search(t) and not COUNT_NOT.search(t) and len(named) <= 1:
        return {"tool": "survey_count", "args": {"name": "field_check" if has_field else "suspects", **({"region": named[0]["sgg_cd"]} if named else {})}}
    # '이 지역 결과 요약' — 지역이 정해지면 요약 직행(런너) · 정해지지 않으면 전국 요약
    if HERE_RX.search(t) and not named and not re.search(r"보고서|차트|법|조문|대장", t):
        r, _src, _alts = await talk.resolve(ctx, t)
        if r:
            return {"tool": "summary_lookup", "args": {"region": r["sgg_cd"]}, "runtime_summary": True, "region_name": r.get("full")}
        return {"tool": "region_brief", "args": {}}
    return None
