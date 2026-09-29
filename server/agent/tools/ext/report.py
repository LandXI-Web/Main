"""말로 보고서(C2 ④) — '○○ 보고서 초안' → 실태조사 보고서 .docx(명령 바 file 블록).

  report_draft(region?, emd?, rule?, request?)
    대상 = 질문(인자·문장) → 화면 현재 지역 → 기관 관할 실태조사가 한 곳이면 그곳 → 없으면 '지역을 알려 주세요'(지역 고정값 0).
    서식 = 서랍 보고서와 같은 함수(survey.report · agent.report.compose_docx) — [1] = 요청 지역 연속지적 필지 수, 시도 이름 한 가지,
    의심 건수 = 한 출처(survey_counts · survey_sgg), 법적 근거 = 법령 색인 조문 원문, 개발 문구 0.
ROUTE: '보고서·공문 초안' 문장은 모델 앞에서 결정적으로 직행한다(답 문장도 런타임 — LLM 호출 0).
"""
from __future__ import annotations

import re

from .. import Out, ToolError

RULES = ["R1", "R2", "R3", "R4", "R5", "R6"]
SPECS = {
    "report_draft": {
        "description": "실태조사 보고서·공문 초안(.docx)을 만든다. '○○ 보고서 초안 써 줘' · '○○읍 실태조사 보고서' · '공문 초안'. "
                       "지역은 질문에 있을 때만 region(시군구)·emd(읍면동)로 넘기고, request 에 사용자 문장을 그대로 넣는다.",
        "properties": {"region": {"type": "string", "description": "시군구 이름 또는 5자리 코드(질문에 있을 때만)"},
                       "emd": {"type": "string", "description": "읍면동 이름(질문에 있을 때만)"},
                       "rule": {"type": "string", "enum": RULES, "description": "규칙 한 가지만 다룰 때(무허가 건축=R1 · 휴경=R2 …)"},
                       "request": {"type": "string", "description": "사용자 문장 원문"}}},
}
WRITE: set[str] = set()
CONFIRM: set[str] = set()
CLIENT: set[str] = set()
NO_LLM = {"report_draft"}                      # ROUTE 직행 답이 런타임 문장(LLM 0) — LLM 사슬이 잠시 죽어도 답할 수 있다(runner.needs_llm 이 읽을 자리)
WHY = {"report_draft": "보고서 초안 .docx 만들기"}
SAY = {"report_draft": "보고서 초안 만들기"}
HINT = "보고서·공문 초안 요청은 report_draft 를 한 번 부른다(지역은 질문에 있을 때만). 초안 파일은 명령 바에 내려받기 버튼으로 뜬다."

ASK = re.compile(r"보고서|공문|report", re.I)
DRAFT = re.compile(r"초안|써\s*줘|작성|만들어|뽑아|draft|write", re.I)
RULE_WORDS = {"R1": r"무허가|불법\s*건축", "R2": r"휴경", "R3": r"비닐하우스", "R4": r"주차장", "R5": r"산지|임야|개간", "R6": r"공공용지|도로|구거|하천"}


def allowed(name: str, p) -> bool:
    return getattr(p, "realm", None) in ("lx", "tenant")


def _rule_of(t: str) -> str | None:
    m = re.search(r"\bR([1-6])\b", t, re.I)
    if m:
        return f"R{m.group(1)}"
    hits = [r for r, rx in RULE_WORDS.items() if re.search(rx, t)]
    return hits[0] if len(hits) == 1 else None


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


async def report_draft(args: dict, ctx) -> Out:
    from ... import report as AR
    tgt = await AR.resolve_target(ctx, region=args.get("region"), emd=args.get("emd"), text=args.get("request"))
    if tgt.get("error"):
        code = {"forbidden": "tool_forbidden", "no_data": "not_found"}.get(tgt["error"], "bad_request")
        raise ToolError(code, tgt["message"], 403 if code == "tool_forbidden" else 404 if code == "not_found" else 400)
    rule = args.get("rule") if args.get("rule") in RULES else None
    try:
        res = await AR.compose_docx(ctx, tgt, rule, 10)
    except Exception as e:  # noqa: BLE001
        from survey.report import NotFound
        if isinstance(e, NotFound):
            raise ToolError("not_found", "해당 지역 데이터가 없습니다", 404)
        raise
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
    lang = getattr(ctx, "lang", "ko")
    if lang == "en":
        out.answer = f"Drafted the survey report for {j['place']}. Download the .docx below (AI draft · needs human review)."
    else:
        out.answer = (f"{j['place']} 실태조사 보고서 초안을 만들었습니다"
                      + (f"(의심 {{{{suspects}}}} · 법령 조문 {len(laws)}개 인용)" if c2 else "")
                      + ". 아래 버튼으로 초안 파일을 내려받을 수 있습니다. AI 가 작성한 초안이라 사람 확인이 필요합니다.")
    return out


HANDLERS = {"report_draft": report_draft}
