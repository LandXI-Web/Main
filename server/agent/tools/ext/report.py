"""말로 보고서(C2 ④) — '○○ 보고서 초안' → 실태조사 보고서 .docx(명령 바 file 블록).
Land-XI 의 문서 기능은 보고서까지다(원칙 40 · 확인 FR-15 반려) — '공문 · 협조 요청 · 시행문'을 청하면 공문은 만들지 않는다고 한 줄 알리고
같은 지역의 실태조사 보고서 초안으로 안내한다(공문 서식 · 공문 경로 없음).

  report_draft(region?, emd?, rule?, request?)
    대상 = 질문(인자·문장) → 화면 현재 지역 → 기관 관할 실태조사가 한 곳이면 그곳 → 없으면 '지역을 알려 주세요'(지역 고정값 0).
    보고서 서식 = 서랍 보고서와 같은 함수(survey.report · agent.report.compose_docx) — [1] = 요청 지역 연속지적 필지 수, 시도 이름 한 가지,
    의심 건수 = 한 출처(survey_counts), 법적 근거 = 법령 색인 조문 원문, 규칙은 이름으로(코드 0), 같은 필지 한 줄, 개발 문구 0.
    가드(plan 3.2): 관할 안인데 결과가 없으면 {"status":"no_data","text":"해당 지역 데이터가 없습니다","next":"XI맵에서 {지역} AI 분석을 먼저 실행하세요"},
    관할 밖이면 {"status":"outside","text":"이 기관의 데이터가 아닙니다"} — 답은 그 글자 그대로(모델이 바꿔 말하지 않게 도구가 답을 정한다).
ROUTE: '보고서 · 공문 · 협조 요청 · 시행문 초안' 문장은 모델 앞에서 결정적으로 보고서로 직행한다(답 문장도 런타임 — LLM 호출 0).
"""
from __future__ import annotations

import re

from .. import Out

RULES = ["R1", "R2", "R3", "R4", "R5", "R6"]
SPECS = {
    "report_draft": {
        "description": "실태조사 보고서 초안(.docx)을 만든다. '○○ 보고서 초안 써 줘' · '○○읍 실태조사 보고서'. 공문은 만들지 않는다 — "
                       "공문 · 협조 요청 · 시행문을 청해도 이 도구로 보고서 초안을 만든다. 지역은 질문에 있을 때만 region(시군구)·emd(읍면동)로 넘기고, "
                       "request 에 사용자 문장을 그대로 넣는다.",
        "properties": {"region": {"type": "string", "description": "시군구 이름 또는 5자리 코드(질문에 있을 때만)"},
                       "emd": {"type": "string", "description": "읍면동 이름(질문에 있을 때만)"},
                       "rule": {"type": "string", "enum": RULES, "description": "규칙 한 가지만 다룰 때(무허가 건축 · 휴경 …)"},
                       "request": {"type": "string", "description": "사용자 문장 원문"}}},
}
WRITE: set[str] = set()
CONFIRM: set[str] = set()
CLIENT: set[str] = set()
NO_LLM = {"report_draft"}                      # ROUTE 직행 답이 런타임 문장(LLM 0) — LLM 사슬이 잠시 죽어도 답할 수 있다(runner.needs_llm 이 읽을 자리)
WHY = {"report_draft": "보고서 초안 .docx 만들기"}
SAY = {"report_draft": "보고서 초안 만들기"}
HINT = ("보고서 초안 요청은 report_draft 를 한 번 부른다(지역은 질문에 있을 때만). 공문 · 협조 요청 · 시행문 요청도 report_draft — 공문은 만들지 않고 보고서로 안내한다. "
        "초안 파일은 명령 바에 내려받기 버튼으로 뜬다. 도구가 status(no_data·outside)와 text 를 주면 그 글자 그대로 답한다.")

ASK = re.compile(r"보고서|공문|협조\s*요청|시행문|report|letter", re.I)
LETTER = re.compile(r"공문|협조\s*요청|시행문|official\s+letter|\bletter\b", re.I)
DRAFT = re.compile(r"초안|써\s*줘|써줘|작성|만들어|뽑아|draft|write", re.I)
RULE_WORDS = {"R1": r"무허가|불법\s*건축", "R2": r"휴경", "R3": r"비닐하우스", "R4": r"주차장", "R5": r"산지|임야|개간", "R6": r"공공용지|도로|구거|하천"}
NO_DATA = "해당 지역 데이터가 없습니다"
NOT_TENANT = "이 기관의 데이터가 아닙니다"


def allowed(name: str, p) -> bool:
    return getattr(p, "realm", None) in ("lx", "tenant")


def _rule_of(t: str) -> str | None:
    m = re.search(r"\bR([1-6])\b", t, re.I)
    if m:
        return f"R{m.group(1)}"
    hits = [r for r, rx in RULE_WORDS.items() if re.search(rx, t)]
    return hits[0] if len(hits) == 1 else None


def asked_letter(t: str) -> bool:
    """공문 · 협조 요청 · 시행문을 청했는가 — 만들지 않고 보고서로 안내한다(원칙 40)."""
    return bool(LETTER.search(t or ""))


LETTER_KO = "공문은 만들지 않습니다(Land-XI 는 보고서까지). 대신 "
LETTER_EN = "Land-XI drafts reports only, not official letters. Instead, "


def ROUTE(msg: str, ctx):
    t = re.sub(r"\s+", " ", msg or "").strip()
    if not t or len(t) > 120 or not ASK.search(t) or not DRAFT.search(t):
        return None
    if re.search(r"법령|조문|근거\s*조", t) and not re.search(r"초안", t):
        return None
    args = {"request": t}
    r = _rule_of(t)
    if r:
        args["rule"] = r
    return {"tool": "report_draft", "args": args}


def guard(status: str, lang: str, region: str | None = None) -> Out:
    """가드 결과(plan 3.2) — data = {status, text, next}, 답 = text(+ next) 그대로."""
    out = Out(source="실태조사 결과")
    if status == "outside":
        text = "This is not your agency's data" if lang == "en" else NOT_TENANT
        nxt = None
    else:
        text = "No data for this area yet" if lang == "en" else NO_DATA
        nxt = ((f"Run AI analysis for {region} on the XI map first" if lang == "en" else f"XI맵에서 {region} AI 분석을 먼저 실행하세요")
               if region else ("Run AI analysis for this area on the XI map first" if lang == "en" else "XI맵에서 이 지역 AI 분석을 먼저 실행하세요"))
    out.data = {"status": status, "text": text, **({"next": nxt} if nxt else {})}
    out.answer = f"{text}." + (f" {nxt}." if nxt else "")
    return out


async def report_draft(args: dict, ctx) -> Out:
    from ... import report as AR
    from .. import ToolError
    lang = getattr(ctx, "lang", "ko")
    letter = asked_letter(args.get("request") or "") or args.get("kind") == "letter"
    tgt = await AR.resolve_target(ctx, region=args.get("region"), emd=args.get("emd"), text=args.get("request"))
    if tgt.get("error") == "forbidden":
        return guard("outside", lang)
    if tgt.get("error") == "no_data":
        return guard("no_data", lang, tgt.get("region"))
    if tgt.get("error"):
        raise ToolError("bad_request", tgt["message"], 400)
    from survey.report import NotFound
    rule = args.get("rule") if args.get("rule") in RULES else None
    try:
        res = await AR.compose_docx(ctx, tgt, rule, 10)
    except NotFound:
        return guard("no_data", lang, tgt.get("sgg_name") or tgt.get("place"))
    j = res["json"]
    c2 = next((c for c in j["citations"] if c["kind"] == "suspects"), None)
    laws = [x for x in j["law"] if x["status"] != "법령 데이터에 없습니다"]
    out = Out(source="실태조사 보고서 서식")
    if c2:
        out.env("suspects", c2["label"], c2["value"])
    out.data = {"보고서": j["title"], "대상": j["place"], "시도": j.get("sido"), "인용 1": j["citations"][0]["label"],
                "의심 건수": "suspects" if c2 else None, "법령 근거 조문": len(laws), "파일": "명령 바에서 내려받기"}
    for x in laws[:4]:
        out.citations.append({"kind": "law", "label": x["label"], "law_ref": x["law_ref"]})
    out.blocks.append({"type": "file", "label": res["filename"], "href": res["href"]})
    ctx.state["artifact"] = {"docx_url": res["docx_url"], "href": res["href"], "filename": res["filename"], "place": res["place"]}
    if lang == "en":
        out.answer = (LETTER_EN if letter else "") + f"Drafted the survey report for {j['place']}. Download the .docx below (AI draft · needs human review)."
    else:
        out.answer = ((LETTER_KO if letter else "") + f"{j['place']} 실태조사 보고서 초안을 만들었습니다"
                      + (f"(의심 {{{{suspects}}}} · 법령 조문 {len(laws)}개 인용)" if c2 else "")
                      + ". 아래 버튼으로 초안 파일을 내려받을 수 있습니다. AI 가 작성한 초안이라 사람 확인이 필요합니다.")
    return out


HANDLERS = {"report_draft": report_draft}
