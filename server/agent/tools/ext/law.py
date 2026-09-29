"""법령·지침 근거(C2 ⑤ · RAG) — 관리자가 올린 공개 법령 원문(조·항 단위 · bm25 색인)에서 찾아 원문 그대로 인용한다.

  law_search(query, acts?)  → 조문 원문 + law_ref{법령, 조, 항, 시행일}
    색인에 없는 법령·조문이거나 맞는 조문이 없으면 '법령 데이터에 없습니다'(지어내기 0).
ROUTE: '근거 조문 · ○○법 · 제n조' 질문은 모델 앞에서 결정적으로 직행 — 답 = 조문 원문 그대로(런타임 문장 · 요약 없음 · LLM 호출 0).
"""
from __future__ import annotations

import asyncio
import re

from .. import Out

SPECS = {
    "law_search": {
        "description": "법령·지침 조문 찾기(농지법·건축법·국토계획법·산지관리법·농지 이용실태조사 요령 등 색인된 공개 원문). "
                       "'근거 조문은?' · '○○법 제n조' · '실태조사 요령에서 ~'. 조문 원문과 조·항·시행일을 돌려준다.",
        "properties": {"query": {"type": "string", "description": "사용자 질문 원문"},
                       "acts": {"type": "array", "items": {"type": "string"}, "description": "법령 이름(질문에 있을 때만)"}},
        "required": ["query"]},
}
WRITE: set[str] = set()
CONFIRM: set[str] = set()
CLIENT: set[str] = set()
NO_LLM = {"law_search"}                      # ROUTE 직행 답이 런타임 문장(LLM 0) — LLM 사슬이 잠시 죽어도 답할 수 있다(runner.needs_llm 이 읽을 자리)
WHY = {"law_search": "법령 조문 찾기(원문)"}
SAY = {"law_search": "법령 조문 찾기"}
HINT = ("법령·조문·근거 질문은 law_search 를 부른다. 조문은 도구가 준 원문 그대로 옮기고 「법령」 제n조 제n항 · 시행일을 붙인다. "
        "요약하면 '요약 · 원문 아님'을 붙인다. 도구가 없다고 하면 '법령 데이터에 없습니다'라고만 답한다.")

NOT_FOUND = "법령 데이터에 없습니다"
LAWQ = re.compile(r"조문|법령|근거\s*(법|조)|제\s*\d+\s*조|시행령|시행규칙|실태조사\s*요령|업무처리\s*요령|지침|statute|article|\blaw\b", re.I)
ACTQ = re.compile(r"([가-힣]{2,20}법)(률)?\s*(상|에서|에\s*따르면|위반|에서는|의\s*(규정|조항))")
NOT_ACT = {"방법", "문법", "해법", "기법", "용법", "사용법", "작성법", "계산법", "분석법"}
NOT_LAW = re.compile(r"보고서\s*초안|공문\s*초안|분석\s*(실행|해)|지도|차트|몇\s*건|건수")


def allowed(name: str, p) -> bool:
    return getattr(p, "realm", None) in ("lx", "tenant")


def is_law_question(t: str) -> bool:
    if LAWQ.search(t):
        return True
    m = ACTQ.search(t)
    return bool(m and m.group(1) not in NOT_ACT and not any(m.group(1).endswith(x) for x in NOT_ACT))


def ROUTE(msg: str, ctx):
    t = re.sub(r"\s+", " ", msg or "").strip()
    if not t or len(t) > 160 or NOT_LAW.search(t) or not is_law_question(t):
        return None
    return {"tool": "law_search", "args": {"query": t}}


def _clip(s: str, n: int = 900) -> str:
    return s if len(s) <= n else s[:n].rstrip() + " …"


async def law_search(args: dict, ctx) -> Out:
    from ...rag import index as LAW
    q = str(args.get("query") or "").strip()
    acts = [a for a in (args.get("acts") or []) if isinstance(a, str) and a.strip()] or None
    r = await asyncio.to_thread(LAW.search, q, acts, 2)
    out = Out(source="법령 원문(국가법령정보센터 공개 원문 · 로컬 색인)")
    en = getattr(ctx, "lang", "ko") == "en"
    if not r["found"]:
        out.data = {"결과": NOT_FOUND, "없는 법령": r.get("missing") or []}
        out.answer = "Not in the law data." if en else NOT_FOUND + "."
        return out
    hits = r["hits"]
    top = hits[0]
    body_hits = [h for h in hits if h["act"] == top["act"] and h["article"] == top["article"]][:2]     # 원문은 1위 조문(같은 조의 항까지)만
    lines, data = [], []
    for h in hits[:3]:
        ref = h["ref"]
        out.citations.append({"kind": "law", "label": ref["label"], "law_ref": {"법령": ref["law"], "조": ref["article"], "항": ref["para"], "시행일": ref["effective"]},
                              "text": h["text"]})
        for x in re.findall(r"\d+", h["text"] + " " + ref["label"]):
            out.whitelist.add(x)
    NL = chr(10)
    for h in body_hits:
        body = _clip(h["text"])
        lines.append(h["ref"]["label"] + NL + "“" + body + "”")                 # 원문 그대로(따옴표 안 · 요약 없음)
        data.append({"조문": h["ref"]["label"], "원문": body})
    more = [h["ref"]["label"] for h in hits if h not in body_hits][:2]
    out.data = {"조문": data, "관련 조문": more}
    lead = "Statute text (verbatim, Korean original):" if en else "관련 조문 원문입니다."
    tail = (("See also: " if en else "함께 볼 조문: ") + " · ".join(more)) if more else ""
    note = "" if en else "조문은 국가법령정보센터 공개 원문 그대로이며, 적용 여부는 담당자가 판단합니다."
    out.answer = (NL + NL).join(x for x in [lead, *lines, tail, note] if x)
    return out


HANDLERS = {"law_search": law_search}
