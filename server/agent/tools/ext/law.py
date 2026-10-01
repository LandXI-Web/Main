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
LAWQ = re.compile(r"조문|법령|근거\s*(법|조)|제\s*\d+\s*조|시행령|시행규칙|실태조사\s*요령|업무처리\s*요령|지침|statute|article|provision|legal\s+basis|\blaw\b", re.I)
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


# 영어 답의 법령 이름(색인 정식 이름 → 영어) — 표에 없으면 한국어 이름 그대로
EN_ACT_NAME = {"농지법": "Farmland Act", "농지법 시행령": "Enforcement Decree of the Farmland Act",
               "농지법 시행규칙": "Enforcement Rule of the Farmland Act", "건축법": "Building Act",
               "국토의 계획 및 이용에 관한 법률": "National Land Planning and Utilization Act", "산지관리법": "Mountainous Districts Management Act"}


def _en_ref(ref: dict) -> str:
    """'Article 23 of the Farmland Act (「농지법」 제23조 농지의 임대차 또는 사용대차), paragraph 1 · in force 2026-09-18'."""
    law, art = ref.get("law") or "", ref.get("article") or ""
    name = EN_ACT_NAME.get(law)
    m = re.fullmatch(r"제(\d+)조(?:의(\d+))?", art)
    if m:
        no = m.group(1) + (f"-{m.group(2)}" if m.group(2) else "")
        head = f"Article {no} of the {name}" if name else f"Article {no} of 「{law}」"
    else:
        head = f"Section {art.replace('-', '.')} of 「{law}」"
    ko = f"「{law}」 {art}" + (f" {ref['title']}" if ref.get("title") else "")
    pm = re.fullmatch(r"제(\d+)항", ref.get("para") or "")
    return head + f" ({ko})" + (f", paragraph {pm.group(1)}" if pm else "") + (f" · in force {ref['effective']}" if ref.get("effective") else "")


async def law_search(args: dict, ctx) -> Out:
    from ...rag import index as LAW
    q = str(args.get("query") or "").strip()
    acts = [a for a in (args.get("acts") or []) if isinstance(a, str) and a.strip()] or None
    en = getattr(ctx, "lang", "ko") == "en" or not re.search(r"[가-힣]", q)
    qk = LAW.ko_query(q) if en else q                                       # 영어 질문 → 로컬 용어 표로 한국어 검색어(번역 모델 없음)
    r = await asyncio.to_thread(LAW.search, qk, acts, 3) if qk else {"found": False, "hits": [], "reason": "no_term"}
    out = Out(source="법령 원문(국가법령정보센터 공개 원문 · 로컬 색인)")
    loose = None
    if not r["found"] and not en and not r.get("missing"):
        # 확인 16차 규칙 ② — 풀어 쓴 질문('허가 없이 지은 건물에 물리는 이행강제금은 얼마야?')은 질문 그대로는 못 찾는다.
        # 막다른 '법령 데이터에 없습니다' 대신, 법령 낱말 하나로 다시 찾아 가장 가까운 조문을 원문 그대로 보인다(지어내기 0 · 무엇으로 찾았는지 밝힘).
        terms = loose_terms(q)
        tries = ([" ".join(terms[:2])] if len(terms) >= 2 else []) + terms
        for term in tries:
            r2 = await asyncio.to_thread(LAW.search, term, acts, 3)
            top = (r2.get("hits") or [None])[0]
            body = ((top or {}).get("text") or "") + " " + (((top or {}).get("ref") or {}).get("label") or "")
            if r2.get("found") and any(w in body for w in term.split()):      # 찾은 조문에 그 낱말이 실제로 있을 때만(엉뚱한 조문 0)
                r, loose = r2, term.split()[0]
                break
    if not r["found"]:
        out.data = {"결과": NOT_FOUND, "없는 법령": r.get("missing") or []}
        out.answer = "Not in the law data." if en else "그 말로는 색인된 법령에서 맞는 조문을 찾지 못했습니다. 법령 이름이나 조문 낱말로 물으면 원문을 찾습니다."
        if not en:
            from ... import talk
            talk.set_next(ctx, [talk.btn("농지 전용 근거 조문 알려 줘"), talk.btn("건축법 이행강제금 조문 알려 줘")])
            ctx.state["cannot"] = {"kind": "law"}
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
    more_h = [h for h in hits if h not in body_hits and not (h["act"] == top["act"] and h["article"] == top["article"])][:2]
    more = [h["ref"]["label"] for h in more_h]
    out.data = {"조문": data, "관련 조문": more}
    if en:
        lead = (f"The provision on this is {_en_ref(top['ref'])}. The original Korean text is quoted below; "
                "whether it applies to a case is for the officer in charge to decide.")
        tail = ("See also: " + " · ".join(_en_ref(h["ref"]) for h in more_h)) if more_h else ""
        note = ""
    else:
        lead = (f"질문 그대로는 맞는 조문을 찾지 못해 '{loose}'{'으로' if _batchim(loose) not in (0, 8) else '로'} 찾은 조문 원문입니다." if loose
                else "관련 조문 원문입니다.")
        tail = ("함께 볼 조문: " + " · ".join(more)) if more else ""
        note = ("금액 · 기준은 조례와 고시에 따라 달라 여기서 계산하지 않으며, 적용 여부는 담당자가 판단합니다." if loose and re.search(r"얼마|금액|몇\s*원", q)
                else "조문은 국가법령정보센터 공개 원문 그대로이며, 적용 여부는 담당자가 판단합니다.")
        if more_h:
            from ... import talk
            talk.set_next(ctx, [talk.btn(f"{_short_ref(h['ref'])} 원문", q=f"{_short_ref(h['ref'])} 조문 알려 줘") for h in more_h[:2]])
    out.answer = (NL + NL).join(x for x in [lead, *lines, tail, note] if x)
    return out


# 풀어 쓴 질문에서 법령 낱말 뽑기 — 질문 말(얼마 · 알려 · 해 줘 · 물리는 …)을 빼고 긴 낱말부터(그 낱말 하나로 색인을 다시 찾는다)
_LOOSE_STOP = re.compile(r"^(얼마|얼마야|얼마인가|알려|알려줘|줘|주세요|해줘|보여|보여줘|무엇|뭐야|어떻게|어떤|무슨|하는|하나|되나|되는|있나|있는|없이|지은|짓는|물리는|"
                         r"부과|받는|내는|하면|않으면|안|못|그|이|저|때|경우|대한|관련|대해|위한|건물에|농사를|관한)$")


# 일상어 → 조문 낱말(작은 사전 · 늘리는 곳은 여기 한 곳)
LOOSE_SYN = {"건물": "건축물", "집": "건축물", "농사": "농업경영", "팔아야": "처분", "팔": "처분", "땅": "토지", "벌금": "과태료", "허가없이": "허가"}


def loose_terms(q: str) -> list[str]:
    words = []
    for w in re.findall(r"[가-힣]{2,}", q or ""):
        w = re.sub(r"(은|는|이|가|을|를|에|에서|의|으로|로|과|와|도|만|이야|인가요|인가|이에요|예요)$", "", w)
        w = LOOSE_SYN.get(w, w)
        if len(w) >= 2 and not _LOOSE_STOP.match(w) and w not in words:
            words.append(w)
    return sorted(words, key=len, reverse=True)[:4]


def _short_ref(ref: dict) -> str:
    """'「건축법」 제80조의2(…) 제2항 · 시행 …' → '건축법 제80조의2'(버튼 글)."""
    return f"{ref.get('law') or ''} {ref.get('article') or ''}".strip()


def _batchim(w: str) -> int:
    ch = (w or "")[-1:]
    return (ord(ch) - 0xAC00) % 28 if ch and "가" <= ch <= "힣" else 0


HANDLERS = {"law_search": law_search}
