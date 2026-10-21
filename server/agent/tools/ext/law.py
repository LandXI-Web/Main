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
                       "acts": {"type": "array", "items": {"type": "string"}, "description": "법령 이름(질문에 있을 때만)"},
                       "judge": {"type": "boolean", "description": "법적 판단(괜찮아? · 문제 없어?)을 묻는 질문 — 판단 없이 조문 찾기 안내"}},
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
NOT_LAW = re.compile(r"보고서\s*초안|공문\s*초안|분석\s*(실행|해)|지도|차트|몇\s*건|건수|목록|몇\s*(곳|개|필지)|상위|순위|현황|통계|엑셀|그래프|보여\s*줘")

# 지도 · 통계 질문 말(10-22 C02 298 '해남군 하천구역 안 의심 시설 동네별로 얼마나 돼?') — 주제어(하천구역 · 농막 …)가 서비스 · 층 이름 안에 있어도
# 나눠 세기 · 고르기 · 넓이 · 의심 시설을 묻는 말이면 법 길이 아니다(법 낱말 '조문 · 법령 · 제n조'가 있으면 그대로 법 길).
MAP_STAT = re.compile(r"(?:동네|읍면동|읍\s*면|마을|리|시군구?|지역|구역|분류|종류)\s*별|별로\s|의심\s*(?:시설|필지|건물|건축물|농막|축사|창고)|"
                      r"골라|겹치는|겹친\s|합치면|다\s*합|면적이?\s*(?:얼마|합)|넓이|얼마나\s*(?:많|넓|있)|칠해|색칠|표시해|"
                      r"몇\s*(?:곳|개|동|필지|건)|순으로|큰\s*(?:곳|거|것)|작은\s*(?:곳|거|것)")


def map_question(t: str) -> bool:
    """법 주제어가 있어도 지도 · 통계를 묻는 질문인가(법 낱말이 없을 때만)."""
    return bool(MAP_STAT.search(t or "")) and not LAWQ.search(t or "")

# ── 법령 낱말 없이 묻는 법 질문(WP-3 · 묶음 16) — 주제어 + 묻는 꼴이면 법 길로(지도 · 숫자 말이 함께 있으면 비켜 간다) ─────────
TOPIC_RX = re.compile(r"농지\s*전용|산지\s*전용|전용\s*(허가|신고)|행위\s*제한|농업\s*진흥\s*(구역|지역)|농업\s*보호\s*구역|농막|"
                      r"건축\s*허가|가설\s*건축물|축조\s*신고|처분\s*(명령|의무|통지)|이행\s*강제금|원상\s*회복|임대차|사용대차|"
                      r"취득\s*자격|자격\s*증명|자경|경자유전|대리\s*경작|위탁\s*경영|체험\s*영농|소유\s*(상한|제한)|휴경.{0,6}(허용|기간|사유)|"
                      r"개발\s*행위\s*허가|용도\s*변경|지적\s*재조사|지적\s*불부합|직불금|직불제|부정\s*수급|점용\s*허가|변상금|"
                      r"농지\s*원부|농지\s*대장\s*(?:이란|이\s*뭐|은\s*뭐|발급|열람|등본|어디)|하천\s*(구역|부지|점용)|개발\s*제한\s*구역|그린벨트|농업\s*경영체|증거\s*(로|능력|자료)|"
                      r"(불법|무단)\s*(전용|점용|건축|형질)|허가\s*없이|신고\s*없이|실태\s*조사.{0,8}(기한|주기|절차|근거|대상|언제)|농지.{0,6}태양광.{0,6}(설치|허가)")
QFORM = re.compile(r"어떻게|뭐고|어디서|요건|기준|가능|되나|돼\s*\??$|되요|됩니까|해도|처벌|벌금|과태료|기한|기간|자격|대상|절차|누가|언제|뭐야|뭔지|무엇|"
                   r"이란|란\s*\??$|있나|있어\s*\??$|필요|해야|받아야|경우|근거|원칙|제도|정리해|처분|못\s*하는|할\s*수|쓸\s*수|방법|산정")
# 법적 판단을 묻는 말(괜찮아? · 문제 없어? · 합법이야?) — 판단은 하지 않고 관련 조문 찾기로(원칙 P7 · 묶음 20)
JUDGE_RX = re.compile(r"(개인정보|저작권|초상권|법적으로|법률\s*상|법상|소송).{0,24}(문제\s*(는|가)?\s*(없|안\s*되|되)|괜찮|돼\s*\??$|되나|맞아|아니야)|"
                      r"합법(이야|인가|인지|이에요|일까)|위법(이야|인가|인지|이에요|일까)|불법(이야|인가|인지|이에요|일까)")
LAW_SITE = "https://www.law.go.kr/lsSc.do?menuId=1&query="


def topic_question(t: str) -> bool:
    """법령 이름 · '조문' 낱말 없이 묻는 법 질문('농지전용허가 없이 비닐하우스를 세우면 어떻게 돼')."""
    t = t or ""
    return bool(JUDGE_RX.search(t) or (TOPIC_RX.search(t) and QFORM.search(t) and not map_question(t)))


def site_btn(term: str):
    """국가법령정보센터 검색 단추(막다른 말 0 · 원칙 97) — 찾을 말 그대로."""
    from urllib.parse import quote
    from ... import talk
    term = (term or "").strip()[:40] or "농지법"
    return talk.btn("국가법령정보센터에서 찾기", href=LAW_SITE + quote(term))


def allowed(name: str, p) -> bool:
    return getattr(p, "realm", None) in ("lx", "tenant")


def is_law_question(t: str) -> bool:
    if LAWQ.search(t) or topic_question(t):
        return True
    m = ACTQ.search(t)
    return bool(m and m.group(1) not in NOT_ACT and not any(m.group(1).endswith(x) for x in NOT_ACT))


def ROUTE(msg: str, ctx):
    t = re.sub(r"\s+", " ", msg or "").strip()
    if not t or len(t) > 160 or NOT_LAW.search(t) or map_question(t) or not is_law_question(t):
        return None
    if JUDGE_RX.search(t) and not LAWQ.search(t):
        return {"tool": "law_search", "args": {"query": t, "judge": True}}
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
    old_name = bool(re.search(r"농지\s*원부", q))
    if old_name:                                                              # 옛 이름(농지원부 → 농지대장) — 지금 조문 이름으로 찾는다
        q = "농지대장 발급" if re.search(r"떼|발급|등본|열람|어디서", q) else "농지대장"
    acts = [a for a in (args.get("acts") or []) if isinstance(a, str) and a.strip()] or None
    en = getattr(ctx, "lang", "ko") == "en" or not re.search(r"[가-힣]", q)
    if args.get("judge") and not en:
        # 법적 판단(괜찮아? · 문제 없어?)은 하지 않는다 — 판단은 담당자 · 법무, 여기서는 관련 조문만 찾아 준다(묶음 20 · 근거 없는 안심 0)
        from ... import talk
        out = Out(source="법령 원문(국가법령정보센터 공개 원문 · 로컬 색인)")
        out.data = {"결과": "법적 판단 안 함"}
        out.answer = "적용 여부는 담당자 · 법무 판단입니다. 관련 조문은 찾아 드립니다."
        subj = " ".join(LAW.key_nouns(q)[:2]) or q
        talk.set_next(ctx, [talk.btn("관련 조문 찾기", q=f"{subj} 관련 조문 알려 줘"), site_btn(subj)])
        ctx.state["cannot"] = {"kind": "law_judge"}
        return out
    qk = LAW.ko_query(q) if en else q                                       # 영어 질문 → 로컬 용어 표로 한국어 검색어(번역 모델 없음)
    r = await asyncio.to_thread(LAW.search, qk, acts, 3) if qk else {"found": False, "hits": [], "reason": "no_term"}
    out = Out(source="법령 원문(국가법령정보센터 공개 원문 · 로컬 색인)")
    loose = None
    if not r["found"] and not en and not r.get("missing"):
        # 확인 16차 규칙 ② — 풀어 쓴 질문('허가 없이 지은 건물에 물리는 이행강제금은 얼마야?')은 질문 그대로는 못 찾는다.
        # 막다른 '법령 데이터에 없습니다' 대신, 법령 낱말 하나로 다시 찾아 가장 가까운 조문을 원문 그대로 보인다(지어내기 0 · 무엇으로 찾았는지 밝힘).
        # WP-3: 다시 찾는 낱말은 질문의 대상 말(조사 · 서술 뗀 것) 가운데 넓은 말(농지 · 사업 · 지역 …)이 아닌 것만,
        # 찾은 조문의 제목이 그 낱말 자체일 때만 받는다('이행강제금' ↔ 제80조(이행강제금) · '원상회복' ↔ 제42조(원상회복 등)) — 곁가지 조문 0.
        terms = sorted([w for w in LAW.key_nouns(LAW.plain_query(q)) if w not in LAW.BROAD and w not in LAW.GENERIC and len(w) >= 2],
                       key=len, reverse=True)[:3]
        for term in terms:
            r2 = await asyncio.to_thread(LAW.search, term, acts, 3)
            top = (r2.get("hits") or [None])[0]
            if r2.get("found") and top and _title_is(top, term):
                r, loose = r2, term
                break
    if not r["found"]:
        tm = [m for m in LAW.topic_acts(LAW.plain_query(q)) if not LAW.resolve_act(m)]
        missing = tm or [m for m in (r.get("missing") or []) if re.search(r"(법|법률|령|규칙|요령|지침|고시)$", m) and " " not in m.strip()]
        out.data = {"결과": NOT_FOUND, "없는 법령": missing}
        if en:
            out.answer = "Not in the law data."
            return out
        from ... import talk
        subj = " ".join(LAW.key_nouns(LAW.plain_query(q))[:2])
        if missing:                                       # 색인에 없는 법령(하천법 · 공익직불법 …) — 솔직히 없다고 + 찾을 곳(묶음 24)
            out.answer = f"「{missing[0]}」은 색인된 법령에 없어 조문을 인용하지 않습니다. 국가법령정보센터에서 확인해 주세요."
            talk.set_next(ctx, [site_btn(missing[0]), talk.btn("농지 전용 근거 조문 알려 줘")])
        else:                                             # 대상 말과 맞는 조문이 없다 — 곁가지 조문을 대신 내지 않는다(P7)
            out.answer = (f"질문의 말과 맞는 조문을 찾지 못했습니다. 국가법령정보센터에서 '{subj}'{'으로' if _batchim(subj) not in (0, 8) else '로'} 확인해 주세요." if subj
                          else "질문의 말과 맞는 조문을 찾지 못했습니다. 국가법령정보센터에서 확인해 주세요.")
            talk.set_next(ctx, [site_btn(subj or q), talk.btn("농지 전용 근거 조문 알려 줘")])
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
        if old_name:
            lead = "농지원부는 지금 이름이 농지대장입니다. " + lead
        from ... import talk
        talk.set_next(ctx, [talk.btn(f"{_short_ref(h['ref'])} 원문", q=f"{_short_ref(h['ref'])} 조문 알려 줘") for h in more_h[:2]]
                      + [site_btn(_short_ref(top["ref"]).split(" ")[0])])      # 원문 출처(국가법령정보센터)도 늘 — 막다른 말 0
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


def _title_is(hit: dict, term: str) -> bool:
    """찾은 조문 제목의 주제가 그 낱말 자체인가 — '이행강제금' = '이행강제금' · '원상회복 등' · '휴경, 임대(사용대), …'(쉼표 · 가운뎃점 · 및 · 과/와 로 나눈 조각)."""
    from ...rag import index as LAW
    t = str(hit.get("article_title") or (hit.get("ref") or {}).get("title") or "")
    t = re.sub(r"^[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+\.\s*\d*\.?\s*", "", t)
    parts = re.split(r"[,ㆍ·()]|\s+(?:및|또는)\s+|(?<=[가-힣])(?:과|와)\s+", t)
    want = LAW.norm_ko(term)
    return any(re.sub(r"등$", "", LAW.norm_ko(x)) == want for x in parts if x.strip())


def _short_ref(ref: dict) -> str:
    """'「건축법」 제80조의2(…) 제2항 · 시행 …' → '건축법 제80조의2'(버튼 글)."""
    return f"{ref.get('law') or ''} {ref.get('article') or ''}".strip()


def _batchim(w: str) -> int:
    ch = (w or "")[-1:]
    return (ord(ch) - 0xAC00) % 28 if ch and "가" <= ch <= "힣" else 0


HANDLERS = {"law_search": law_search}
