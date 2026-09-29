"""비전 질문 만들기 · 세 줄 파싱 · 숫자 걸러내기.

답 형식(세 줄 고정):
  보이는 것: …
  AI 결과와 맞는지: 맞음|일부 맞음|맞지 않음 — 이유
  오탐 가능성: 높음|보통|낮음 — 이유
숫자는 모델에 쓰지 말라고 하고, 그래도 나오면 지운다(숫자는 도구 봉투로만 — 영상 시점 연도만 예외).
"""
from __future__ import annotations

import re

TAG = {"ko": "AI 의견 · 근거 아님", "en": "AI opinion · not evidence"}
KEYS = {
    "ko": ("보이는 것", "AI 결과와 맞는지", "오탐 가능성"),
    "en": ("Seen", "Matches AI", "False-positive risk"),
}
RISK = {"ko": ("높음", "보통", "낮음"), "en": ("high", "medium", "low")}
MATCH = {"ko": ("맞음", "일부 맞음", "맞지 않음"), "en": ("yes", "partly", "no")}

CLS_EN = {"건물": "buildings", "비닐하우스": "greenhouses", "경작지": "cropland", "주차장": "parking lots"}


def lang_of(text: str) -> str:
    """한글 비율 30% 미만이면 영어(plan 3.6)."""
    s = re.sub(r"[\s\d\W_]+", "", text or "")
    if not s:
        return "ko"
    ko = len(re.findall(r"[가-힣]", s))
    return "ko" if ko / len(s) >= 0.3 else "en"


def ratio_word(r: float | None, lang: str) -> str:
    if r is None:
        return "알 수 없음" if lang == "ko" else "unknown"
    if lang == "ko":
        return "대부분" if r >= 0.6 else "절반 가까이" if r >= 0.35 else "일부" if r >= 0.1 else "아주 조금"
    return "most" if r >= 0.6 else "nearly half" if r >= 0.35 else "part" if r >= 0.1 else "a small part"


def build(info: dict, labels: list[str], ai_first: bool, lang: str = "ko") -> tuple[str, str]:
    """(system, user) — info: {jimok, cls, ratio, rule_nm, kind('필지'|'피처')}. 숫자는 넣지 않는다(비율은 말로)."""
    cls = info.get("cls") or ("AI 탐지" if lang == "ko" else "AI detection")
    if lang == "ko":
        sys = ("너는 LX 실태조사 '결과 확인'을 돕는 영상 검수 보조다. 첨부한 항공·드론 영상 조각만 보고 판단한다. "
               "추측을 사실처럼 말하지 않는다. 숫자(면적·개수·비율·좌표)를 쓰지 않는다. 위법 여부를 판단하지 않는다.")
        views = " · ".join(f"{k}) {lb}" for k, lb in enumerate(labels, 1))
        lines = [f"영상 {len(labels)}장: {views}.",
                 "노란 선 = " + ("필지 경계" if info.get("kind", "필지") == "필지" else "결과 피처 경계") + "."
                 + (f" 하늘색 선 = AI 가 {cls}(으)로 탐지한 윤곽(1번 영상에만)." if ai_first else ""),
                 f"대장 지목: {info.get('jimok') or '알 수 없음'}. AI 결과: {cls} — 필지의 {ratio_word(info.get('ratio'), 'ko')}."
                 + (f" 의심 규칙: {info['rule_nm']}." if info.get("rule_nm") else ""),
                 "정확히 아래 세 줄로만 답한다(각 줄 한 문장 · 숫자 쓰지 말 것):",
                 "보이는 것: (노란 선 안에 실제로 보이는 것)",
                 "AI 결과와 맞는지: 맞음|일부 맞음|맞지 않음 — (이유)",
                 "오탐 가능성: 높음|보통|낮음 — (이유 · 그림자·비닐·공사·영상 흐림 등)"]
    else:
        cls = CLS_EN.get(cls, cls)
        sys = ("You assist LX field survey review. Judge only from the attached aerial or drone image crops. "
               "Do not state guesses as facts. Do not write numbers (area, count, ratio, coordinates). Do not judge legality.")
        views = " · ".join(f"{k}) {lb}" for k, lb in enumerate(labels, 1))
        lines = [f"{len(labels)} image(s): {views}.",
                 "Yellow line = " + ("parcel boundary" if info.get("kind", "필지") == "필지" else "result feature boundary") + "."
                 + (f" Cyan lines = AI-detected {cls} (image 1 only)." if ai_first else ""),
                 f"Registered land category: {info.get('jimok') or 'unknown'}. AI result: {cls} over {ratio_word(info.get('ratio'), 'en')} of the parcel.",
                 "Answer in exactly these three lines (one sentence each, no numbers):",
                 "Seen: (what is actually visible inside the yellow line)",
                 "Matches AI: yes|partly|no — (why)",
                 "False-positive risk: high|medium|low — (why: shadows, plastic, construction, blur …)"]
    return sys, "\n".join(lines)


_NUM = re.compile(r"\s*(?:약\s*)?\d[\d,.]*\s*(?:%|퍼센트|㎡|m²|m2|㎞|km|m|개|동|채|곳|배|년|월|cm)?")


def scrub_numbers(s: str, keep: set[str]) -> str:
    def rep(m):
        tok = re.sub(r"\D", "", m.group(0))
        return m.group(0) if tok in keep else ""
    out = _NUM.sub(rep, s)
    return re.sub(r"\s{2,}", " ", out).replace(" ,", ",").strip()


def parse(text: str, lang: str = "ko", keep: set[str] | None = None) -> dict:
    """모델 답 → {seen, match, match_level, risk, risk_level, lines[3]}. 형식이 어긋나면 앞 세 줄."""
    keep = keep or set()
    raw = [re.sub(r"^[\s*\-•\d.)]+", "", ln).replace("**", "").strip() for ln in (text or "").splitlines()]
    raw = [ln for ln in raw if ln]
    keys = KEYS[lang]
    alt = KEYS["en" if lang == "ko" else "ko"]
    got: dict[int, str] = {}
    for ln in raw:
        for i, (k, a) in enumerate(zip(keys, alt)):
            m = re.match(r"^(" + re.escape(k) + "|" + re.escape(a) + r")\s*[:：]\s*(.*)$", ln, re.I)
            if m and i not in got:
                got[i] = m.group(2).strip()
                break
    if len(got) < 3:
        rest = [ln for ln in raw if not any(re.match(r"^(" + re.escape(k) + ")", ln, re.I) for k in keys + alt)]
        for i in range(3):
            if i not in got and rest:
                got[i] = rest.pop(0)
    vals = [scrub_numbers(got.get(i, ""), keep) for i in range(3)]
    none = "판단할 수 없음" if lang == "ko" else "cannot tell"
    vals = [v or none for v in vals]
    rb = r"(?!\w)" if lang == "en" else ""
    risk_level = next((lv for lv in RISK[lang] if re.search(r"(?<!\w)" + lv + rb, vals[2], re.I)), None)
    match_level = None
    for lv in sorted(MATCH[lang], key=len, reverse=True):     # '일부 맞음' · '맞지 않음' 을 '맞음' 보다 먼저
        if re.search(r"(?<!\w)" + re.escape(lv) + rb, vals[1], re.I):
            match_level = lv
            break
    lines = [f"{k}: {v}" for k, v in zip(keys, vals)]
    return {"seen": vals[0], "match": vals[1], "match_level": match_level, "risk": vals[2], "risk_level": risk_level, "lines": lines}
