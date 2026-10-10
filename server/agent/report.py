"""보고서 초안(AG-2 · F1-CONTRACT v1.1-26) — survey_stats · survey_findings → Gemma 4 서술 3단락(문장마다 [n]) → 검증기 → .docx.

.docx 는 F2-S `server/survey/report.py build_draft(emd_cd, rule, top, narrative, fmt='docx', realm, tenant)` 정본 서식으로 만든다.
에이전트 인용 [n] 은 F2-S 문서의 '인용' 번호로 옮기고(같은 값·뜻 봉투) 필지는 '③ No k' 로 표 행을 가리킨다.
F2-S 호출이 실패하면 예외 사유를 artifact.source 에 그대로 적고 같은 여섯 절을 로컬 서식으로 만든다.
검증: 자리표 밖 숫자는 그 문장의 인용 봉투로만 승격(strict) · 봉투 뜻 검사(결정적 규칙 + LLM 교정자 표) → 어긋난 문장 = '봉투 뜻 확인 필요'.
고정 문구: 'AI 추론 · 검수 전 · 현장 확인 전 · 위법 판정 아님'. 법령 근거 = 법령 색인(agent.rag) 조문 원문 인용. 성명 열 0.
대상 = 질문 → 화면 현재 지역 → 없으면 '지역을 알려 주세요'(resolve_target · 지역 고정값 없음). 시군구(5자리)·읍면동 둘 다 된다.
말로 요청(도구 report_draft · tools/ext/report.py)과 서랍 요청(POST /agent/report/draft)이 같은 서식 함수(survey.report build_draft · render_docx)를 쓴다.
"""
from __future__ import annotations

import datetime as dt
import io
import json
import re
import time

from . import audit, backends, config, lint
from .runner import KST, Ctx, emit, finish, persist_start, persist_state, persist_tool, register, run_tool, WHY
from .tools import Out

FIXED = "AI 추론 · 검수 전 · 현장 확인 전 · 위법 판정 아님"
FIXED_LX = "AI 추론 · 검수 전 · 위법 판정 아님"          # 원칙 135 — 보고서는 '현장 확인' 없이(LX 10-09 · 기관 10-10)


def _lx(ctx) -> bool:
    """원칙 135 — 보고서에 '현장 확인'을 쓰지 않는다. LX 계정(10-09) · 기관 계정까지(10-10 확인 8 ⓐ) — 모든 계정. 옛 문구(FIXED)는 계산 확인용으로만 남김."""
    return True


def fixed_of(ctx) -> str:
    return FIXED_LX if _lx(ctx) else FIXED


def writer_of(ctx) -> str:
    """서술 지시문 — LX 계정은 고정 문구에서 '현장 확인 전'을 빼고 '현장 확인' 말을 쓰지 않게 한다."""
    if not _lx(ctx):
        return WRITER
    return WRITER.replace(FIXED, FIXED_LX).replace("'현장조사 대상 후보'로 쓴다", "'검토 대상 후보'로 쓴다") + \
        "\n- '현장 확인' · '현장조사' 라는 말을 쓰지 않는다."
BASIS_KO = {"measured": "실측", "estimate": "추정", "demo": "시연", "history": "이력", "inferred": "AI 추론 · 검수 전", "recorded": "기록"}
UNIT_KO = {"count": "건", "필지": "필지", "m2": "㎡", "ratio": "", "ha": "ha", "tokens": "토큰", "krw_m2": "원/㎡"}

WRITER = """너는 지자체 실태조사 보고서 초안 작성자다(Land-XI · LX). 아래 표와 <data> 블록만 근거로 세 단락을 쓴다.
형식(마크다운):
## 개요
(2문장)
## 소견
(3문장)
## 조치 제안
(2문장)
규칙:
- 모든 문장의 마침표 바로 앞에 근거 인용 [n] 을 붙인다(인용 번호 표의 번호만). 집계 문장은 집계 번호, 목록·상위 문장은 목록 번호, 필지 문장은 그 필지 번호.
- 숫자는 직접 쓰지 말고 '쓸 수 있는 봉투' 표의 자리표만 그대로 쓴다(예 {{env:e4}}). 자리표 뒤 단위 없음. 퍼센트·평균·합계·차이를 스스로 계산하지 않는다.
- 자리표는 표에 적힌 '뜻' 그대로만 쓴다. 문장의 주어가 그 뜻과 같아야 한다(읍면동 집계 봉투를 리·필지의 값처럼 쓰지 않는다).
- 필지는 주소 글자와 인용 [n] 으로 가리킨다. 리 이름·지번 바로 뒤에 집계 자리표를 붙이지 않는다. 필지 봉투는 그 필지 [n] 을 인용한 문장에서만 쓴다.
- '위법'이라 단정하지 않는다. '현장조사 대상 후보'로 쓴다. 조치 제안에 'AI 추론 · 검수 전 · 현장 확인 전 · 위법 판정 아님'을 한 번 넣는다.
- 법령 조문은 쓰지 않는다(⑤ 법적 근거 칸이 조문 원문을 따로 싣는다).
- 이 문서는 보고서까지다. 시정명령 · 이행강제금 · 원상복구 · 고발 같은 행정 처분, 공문, 현장 조사 배정은 쓰지 않는다. 조치 제안은 확인 · 대조 · 검토 순서만 쓴다.
- 규칙은 코드(R1 등) 대신 규칙 이름으로 쓴다. 지역 이름은 한 번만 쓴다('○○면의 ○○면' 금지).
- 보고체(~함 · ~임 또는 ~습니다) 한 가지로."""


def _rule_words(s: str) -> str:
    """글 속 규칙 코드 → 규칙 이름(사용자 말) — survey.report.plain_rules 와 같은 규칙."""
    try:
        from survey.report import plain_rules
        return plain_rules(s)
    except Exception:  # noqa: BLE001
        return s


def _meaning(eid: str, ctx: Ctx) -> str:
    m = ctx.env_meta.get(eid, "")
    m = re.sub(r"^\[\d+\]\s*", "", m)
    return re.sub(r"\s*\([^)]*\)", "", m).strip()


def writer_tables(ctx: Ctx, rule: str) -> str:
    """LLM 이 쓸 수 있는 봉투를 뜻과 함께 표로(다른 규칙 건수는 빼고) — 봉투 뜻 오용을 입력에서 줄인다."""
    parcel_env = {e: c for c in ctx.citations if c.get("kind") == "parcel" for e in (c.get("env") or [])}
    stats_n = next((c["n"] for c in ctx.citations if c.get("kind") == "stats"), None)
    list_n = next((c["n"] for c in ctx.citations if c.get("kind") == "list"), None)
    agg = []
    for (i, k), eid in sorted(ctx.keymap.items(), key=lambda kv: int(kv[1][1:])):
        if eid in parcel_env or k.startswith("score_") or k.startswith("parcel_"):
            continue
        if rule and k.startswith("rule_") and k != f"rule_{rule}":
            continue
        if rule and i == 1 and k in ("suspects", "suspect_parcels") or (rule and i == 1 and k.startswith("pri_")):
            continue                     # 규칙 보고서: 전 규칙 합계·등급은 빼고 그 규칙 봉투만(뜻 섞임 방지)
        n = stats_n if any(s["i"] == i and s["tool"] == "survey_stats" for s in ctx.steps) else list_n
        agg.append(f"{{{{env:{eid}}}}} | {ctx.env_meta[eid]} | 값 {fmt_env(ctx.envs[eid])} | 인용 [{n}]")
    par = []
    for c in ctx.citations:
        if c.get("kind") != "parcel":
            continue
        ev = c.get("env") or []
        bits = [f"{_meaning(e, ctx)} {{{{env:{e}}}}}" for e in ev]
        par.append(f"[{c['n']}] {c.get('addr')} · {c.get('rule') or ''} 등급 {c.get('priority') or ''} · " + " · ".join(bits))
    return ("쓸 수 있는 봉투(집계 · 자리표 | 뜻 | 값 | 인용):\n" + "\n".join(agg)
            + "\n\n필지(인용 번호 · 주소 · 그 필지 봉투 — 그 필지 문장에서만):\n" + "\n".join(par))


# ── 봉투 뜻 검사(2차) — 결정적 규칙 + LLM 교정자 표 ────────────────────────────
def _sent_with_meaning(s: str, ctx: Ctx) -> str:
    return lint.PH.sub(lambda m: f"⟨{m.group(2)}: {ctx.env_meta.get(m.group(2), '?')}⟩" if m.group(1) == "env" else "⟨검증 안 된 숫자⟩", s)


async def _meaning_llm(ctx: Ctx, md: str, rule: str) -> list[dict]:
    """교정자에게 문장 × 자리표 뜻 표를 주고 '주어와 봉투 뜻이 어긋난 문장'만 받는다(JSON). LLM 없으면 [](결정적 규칙만)."""
    sents = []
    for para in md.split("\n"):
        if not para.strip() or para.strip().startswith("#"):
            continue
        for a, b, _ns in lint._sentence_spans(para):
            s = para[a:b].strip()
            if s and "{{env:" in s:
                sents.append(s)
    if not sents:
        return []
    table = "\n".join(f"S{k}: {_sent_with_meaning(s, ctx)}" for k, s in enumerate(sents, 1))
    msgs = [{"role": "system", "content": "너는 보고서 교정자다. 각 문장의 ⟨eN: 뜻⟩ 은 그 자리에 들어갈 실측 값의 뜻이다. "
                                          "문장이 그 값을 뜻과 다른 대상(다른 리·필지·규칙·등급·평균·합계 등)의 값처럼 쓰면 '어긋남'이다. "
                                          "뜻과 문장 주어가 맞으면 어긋남이 아니다. 어긋난 문장만 JSON 배열 [{\"s\": 번호, \"why\": \"짧은 이유\"}] 로 출력하고, 없으면 [] 만 출력한다."},
            {"role": "user", "content": f"보고서 규칙 {rule}.\n{table}"}]
    try:
        r = await backends.chat_stream(msgs, max_tokens=300, temperature=0.0, r=ctx.r)
    except backends.LLMUnavailable:
        ctx.state["meaning_llm"] = "unavailable"
        return []
    ctx.tokens_in += int(r.usage.get("prompt_tokens") or 0)
    ctx.tokens_out += int(r.usage.get("completion_tokens") or 0)
    txt = r.content.strip()
    m = re.search(r"\[.*\]", txt, re.S)
    try:
        arr = json.loads(m.group(0)) if m else []
    except json.JSONDecodeError:
        ctx.state["meaning_llm"] = "parse_error"
        return []
    out = []
    for x in arr if isinstance(arr, list) else []:
        try:
            k = int(str(x.get("s")).lstrip("S"))
        except (TypeError, ValueError, AttributeError):
            continue
        if 1 <= k <= len(sents):
            s = sents[k - 1]
            out.append({"sentence": s, "envs": [m.group(2) for m in lint.PH.finditer(s) if m.group(1) == "env"],
                        "reason": str(x.get("why") or "봉투 뜻과 문장 주어 불일치")[:120], "by": "llm"})
    ctx.state["meaning_llm"] = f"ok · {len(sents)}문장 검사 · {len(out)} 어긋남"
    return out


async def meaning_check(ctx: Ctx, md: str, rule: str) -> list[dict]:
    flags = lint.meaning_rules(md, ctx, rule)
    seen = {f["sentence"] for f in flags}
    for f in await _meaning_llm(ctx, md, rule):
        if f["sentence"] not in seen:
            flags.append(f)
            seen.add(f["sentence"])
    return flags


# ── 평문(종이 · .docx) ─────────────────────────────────────────────────────────
def fmt_env(e: dict, dec: bool = True) -> str:
    v = e.get("value")
    if not isinstance(v, (int, float)) or isinstance(v, bool):
        return "값 없음"
    u = e.get("unit")
    if u == "ratio":
        s = f"{v * 100:.0f}%"
    elif isinstance(v, float) and not v.is_integer():
        s = f"{v:,.1f}" if dec else f"{round(v):,}"
    else:
        s = f"{int(v):,}"
    return f"{s}{UNIT_KO.get(u, u or '')}"


def label_of(eid: str, e: dict, meta: dict, dec: bool = True) -> str:
    """'31,211필지(실측 · ○○읍 연속지적 필지 수)' — 값 옆에 꼬리표와 뜻(오용이 종이에서도 드러나게)."""
    m = re.sub(r"^\[\d+\]\s*", "", meta.get(eid, "") or "")
    m = re.sub(r"\s*\([^)]*\)", "", m).strip()
    tag = BASIS_KO.get(e.get("basis"), "")
    return f"{fmt_env(e, dec)}({' · '.join(x for x in (tag, m) if x)})"


def render_plain(md: str, envs: dict, unverified: list[dict], meta: dict | None = None, flags: list[dict] | None = None, dec: bool = True) -> str:
    """자리표 → '387필지(AI 추론 · 검수 전 · ○○면 의심 필지 수)' · 검증 안 된 숫자 → '[검증 안 된 숫자 삭제]' · 뜻 어긋난 문장 → '[봉투 뜻 확인 필요]'."""
    unv = {u["id"]: u for u in unverified}
    meta = meta or {}
    for f in flags or []:
        s = f["sentence"]
        if s in md:
            cm = re.search(r"(\s*(?:\[\d{1,2}(?:\s*[,·]\s*\d{1,2})*\]\s*)*[.!?。]?)$", s)
            cut = cm.start() if cm else len(s)
            md = md.replace(s, s[:cut] + " [봉투 뜻 확인 필요]" + s[cut:], 1)

    def sub(m):
        typ, k = m.group(1), m.group(2)
        if typ == "env" and k in envs:
            return label_of(k, envs[k], meta, dec)
        return "[검증 안 된 숫자 삭제]" if k in unv else ""
    return lint.PH.sub(sub, md)


def _auto_cite(md: str, ctx: Ctx) -> tuple[str, list[str]]:
    """인용 없는 문장: 그 문장이 쓴 자리표·주소가 속한 인용으로만 잇는다(근거 없는 연결은 하지 않음 · 남으면 uncited 표기)."""
    md = lint.attach_trailing_cites(md)
    md, bad = lint.fix_cites(md, {c["n"] for c in ctx.citations})
    ctx.state["bad_cites"] = bad
    env_to_n = {}
    for c in ctx.citations:
        for e in c.get("env") or []:
            env_to_n[e] = c["n"]
    stats_n = next((c["n"] for c in ctx.citations if c.get("kind") == "stats"), None)
    list_n = next((c["n"] for c in ctx.citations if c.get("kind") == "list"), None)
    stats_envs = {eid for (i, _k), eid in ctx.keymap.items() if ctx.steps and any(s["i"] == i and s["tool"] == "survey_stats" for s in ctx.steps)}
    out_lines, left = [], []
    section = ""
    for line in md.split("\n"):
        if line.strip().startswith("#"):
            section = line
        if not line.strip() or line.strip().startswith("#"):
            out_lines.append(line)
            continue
        sents = lint.SENT.findall(line)
        fixed = []
        for s in sents:
            if lint.CITE.search(s) or len(s.strip()) < 12 or "위법 판정 아님" in s:
                fixed.append(s)
                continue
            ids = re.findall(r"\{\{env:([A-Za-z0-9_]+)\}\}", s)
            n = next((env_to_n[i] for i in ids if i in env_to_n), None)
            if n is None and stats_n and any(i in stats_envs for i in ids):
                n = stats_n
            if n is None:
                for c in ctx.citations:
                    a = (c.get("addr") or "").split(" ")[-2:] if c.get("addr") else []
                    if a and " ".join(a) in s:
                        n = c["n"]
                        break
            if n is None and list_n and (re.search(r"필지|대상|후보|현장|목록|상위", s) or ("조치" in section and re.search(r"조사|확인|검토|조치|실시", s))):
                n = list_n                      # 조치·대상 문장의 근거 = 의심 목록 그 자체(목록 인용)
            if n is None:
                left.append(s.strip())
                fixed.append(s)
            else:
                st = s.rstrip()
                end = st[-1] if st and st[-1] in ".!?。" else ""
                fixed.append((st[:-1] if end else st) + f" [{n}]" + end + (" " if s.endswith(" ") else ""))
        out_lines.append("".join(fixed))
    return "\n".join(out_lines), left


def build_docx_local(emd: str, emd_cd: str, rule: str | None, narrative_plain: str, ctx: Ctx, stats_ids: dict, find_ids: dict, run_id: str,
                     model: str) -> bytes:
    from docx import Document
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.oxml.ns import qn
    from docx.shared import Pt, RGBColor

    doc = Document()
    st = doc.styles["Normal"]
    st.font.name = "맑은 고딕"
    st.element.rPr.rFonts.set(qn("w:eastAsia"), "맑은 고딕")
    st.font.size = Pt(10.5)

    def h(text, lvl=1):
        p = doc.add_heading(text, level=lvl)
        for r in p.runs:
            r.font.name = "맑은 고딕"
            r._element.rPr.rFonts.set(qn("w:eastAsia"), "맑은 고딕")
            r.font.color.rgb = RGBColor(0x01, 0x01, 0x02)
        return p

    from .tools.survey import RULE_NM
    rn = RULE_NM.get(rule or "") if rule else None
    h(f"{emd} 실태조사 초안" + (f" — {rn}" if rn else ""), 0)
    meta = doc.add_paragraph()
    meta.add_run(f"초안 · 검토 필요 · {fixed_of(ctx)}\n").bold = True
    meta.add_run(f"대상 {emd} · 연속지적도 × AI 영상 분석 · 판단 기준값 [추정 초기값] · AI 가 작성한 초안(사람 확인 필요) · {dt.datetime.now(KST):%Y-%m-%d %H:%M}")
    h("① 개요 · ② 소견 · ⑥ 조치 제안", 1)
    for para in _rule_words(narrative_plain).split("\n"):
        t = para.strip()
        if not t:
            continue
        if t.startswith("#"):
            p = doc.add_paragraph()
            r = p.add_run(t.lstrip("# ").strip())
            r.bold = True
        else:
            doc.add_paragraph(t)
    h("② 집계표", 1)
    tb = doc.add_table(rows=1, cols=3)
    tb.style = "Table Grid"
    for c, t in zip(tb.rows[0].cells, ["항목", "값", "꼬리표"]):
        c.text = t
    for key, eid in stats_ids.items():
        e = ctx.envs[eid]
        row = tb.add_row().cells
        row[0].text = ctx.env_meta[eid]
        row[1].text = fmt_env(e)
        row[2].text = BASIS_KO.get(e.get("basis"), "")
    h("③ 의심 상위 필지(" + ("검토 대상 후보" if _lx(ctx) else "현장조사 대상 후보") + ")", 1)
    cits = [c for c in ctx.citations if c.get("kind") == "parcel"]
    tb2 = doc.add_table(rows=1, cols=6)
    tb2.style = "Table Grid"
    for c, t in zip(tb2.rows[0].cells, ["[n]", "주소", "PNU", "규칙·등급", "근거면적", "신뢰도"]):
        c.text = t
    for c in cits:
        ev = [ctx.envs.get(x) for x in c.get("env") or []]
        row = tb2.add_row().cells
        row[0].text = f"[{c['n']}]"
        row[1].text = c.get("addr") or ""
        row[2].text = c.get("pnu") or ""
        row[3].text = _rule_words(f"{c.get('rule') or ''} {c.get('priority') or ''}")
        row[4].text = fmt_env(ev[0]) if len(ev) > 0 and ev[0] else "—"
        row[5].text = fmt_env(ev[2]) if len(ev) > 2 and ev[2] else "—"
    h("④ 근거 영상", 1)
    doc.add_paragraph("그 지역 AI 분석 영상(연도·해상도는 실태조사 결과 표기) · AI 추론 · 검수 전")
    h("⑤ 법적 근거", 1)
    try:
        from survey.report import law_basis
        for x in law_basis([rule] if rule else ["R1", "R2", "R3", "R4", "R5", "R6"]):
            doc.add_paragraph(f"{x['label']} — {x['text'] or x['status']}")
    except Exception:  # noqa: BLE001
        doc.add_paragraph("법령 데이터에 없습니다")
    h("근거 목록", 1)
    for c in ctx.citations:
        doc.add_paragraph(_rule_words(f"[{c['n']}] {c.get('label') or c.get('addr') or ''}") + (f" · PNU {c['pnu']}" if c.get("pnu") else ""))
    foot = doc.add_paragraph()
    foot.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    foot.add_run(f"{fixed_of(ctx)} · 소유자 성명 없음(연속지적도에 없음)").italic = True
    bio = io.BytesIO()
    doc.save(bio)
    return bio.getvalue()


SECTION = {"개요": "overview", "소견": "findings", "조치": "actions"}
_UNIT_FAMILY = {"count": "n", "필지": "n", "m2": "m2", "ratio": "r", "%": "r", "ha": "ha"}


def _f2s_cite_for(eid: str, ctx: Ctx, f2s_cites: list[dict]) -> int | None:
    """에이전트 봉투 → F2-S 인용 번호(같은 값 · 같은 단위 계열 · 뜻 낱말이 겹치는 것). 없으면 None."""
    e = ctx.envs.get(eid) or {}
    v, fam = e.get("value"), _UNIT_FAMILY.get(e.get("unit"))
    if v is None or fam is None:
        return None
    meaning = ctx.env_meta.get(eid, "")
    words = {"연속지적": "연속지적", "등급 A": "A등급", "필지 수": "필지 수", "의심 건수": "건수", "건수": "건수"}
    m_rules = set(re.findall(r"R[1-6]", meaning))
    best, bs = None, -1
    for c in f2s_cites:
        cv = c.get("value") or {}
        if cv.get("value") != v or _UNIT_FAMILY.get(cv.get("unit")) != fam:
            continue
        label = c.get("label") or ""
        if not _same_meaning(meaning, label, m_rules):
            continue                                   # 같은 값이라도 뜻이 다른 봉투(미조치 · A등급 · 연속지적 · 다른 규칙)는 인용하지 않는다
        sc = sum(1 for a, b in words.items() if a in meaning and b in label)
        if sc > bs:
            best, bs = c["n"], sc
    return best


def _same_meaning(meaning: str, label: str, m_rules: set[str]) -> bool:
    """F2-S 인용 라벨의 한정어가 봉투 뜻에도 있어야 같은 뜻(3차 판정: 같은 값 · 같은 뜻 봉투만 인용)."""
    quals = [("미조치", ("미조치", "open")), ("A등급", ("등급 A", "A등급")), ("연속지적", ("연속지적",))]
    for q, need in quals:
        if (q in label) != any(n in meaning for n in need):
            return False
    l_rules = set(re.findall(r"R[1-6]", label)) | {r for r, nm in _rule_names().items() if nm and nm in label}
    return not (l_rules and m_rules and not (l_rules & m_rules))


def _rule_names() -> dict:
    try:
        from survey.report import rule_name
        return {r: rule_name(r) for r in ("R1", "R2", "R3", "R4", "R5", "R6")}
    except Exception:  # noqa: BLE001
        return {}


def _f2s_table_ptr(eid: str, ctx: Ctx, f2s: dict) -> str | None:
    """등급·규칙 건수 봉투가 F2-S ② 집계표 칸과 같은 값이면 그 칸을 가리킨다(인용 목록엔 없지만 문서 표에 있는 사실)."""
    e = ctx.envs.get(eid) or {}
    v, meaning = e.get("value"), ctx.env_meta.get(eid, "")
    gm = re.search(r"등급\s?([ABC])", meaning)
    for row in f2s.get("table") or []:
        if row.get("rule") and row["rule"] not in meaning and "조건" not in meaning:
            continue
        for col in ([gm.group(1)] if gm else ["total"]):
            if (row.get(col) or {}).get("value") == v:
                return f"② 집계표 {row.get('name') or row.get('rule') or ''} {col if col != 'total' else '계'}".replace("  ", " ")   # 규칙 이름(서식 표) · 이름이 없는 표만 코드(문서에 넣을 때 plain_rules 가 이름으로)
    return None


def narrative_for_f2s(md: str, lr, ctx: Ctx, flags: list[dict], f2s: dict) -> tuple[dict, dict]:
    """에이전트 초안(자리표 · 에이전트 인용 [n]) → F2-S build_draft(narrative=) 입력.
    인용 번호는 F2-S 문서의 '인용' 목록 번호로 옮긴다(같은 값·뜻 봉투) · 필지 인용은 '(③ No k · 주소)' 로 문서 표 행을 가리킨다.
    고정 문구 문장은 F2-S 가 ⑥에 이미 싣는다(뺌) · 인용을 못 옮긴 문장은 싣지 않고 센다(정직 표기)."""
    f2s_cites = f2s.get("citations") or []
    order = {x["pnu"]: x["order"] for x in f2s.get("top_items") or []}
    by_n = {c["n"]: c for c in ctx.citations}
    fallback_list = next((c["n"] for c in f2s_cites if "후보" in (c.get("label") or "") and "건수" in (c.get("label") or "")), 2)
    # 필지 문장(신뢰도·근거면적) = ③ 의심 상위 표 인용(집계 '후보 필지 수' 로 잘못 짚지 않는다)
    fallback_parcel = next((c["n"] for c in f2s_cites if c.get("kind") == "list" or "의심 상위" in (c.get("label") or "")), fallback_list)
    flagged = {f["sentence"] for f in flags}
    key_of = {eid: k for (_i, k), eid in ctx.keymap.items()}
    parcel_env = {e for c in ctx.citations if c.get("kind") == "parcel" for e in (c.get("env") or [])}
    out = {"overview": [], "findings": [], "actions": []}
    stat = {"kept": 0, "dropped_uncited": 0, "dropped_fixed": 0, "dropped_unmapped": 0, "flagged": 0}
    sec = "overview"

    def inline(mm):
        refs = []
        for x in re.findall(r"\d{1,2}", mm.group(0)):
            c = by_n.get(int(x))
            if c and c.get("kind") == "parcel":
                k = order.get(c.get("pnu"))
                refs.append(f"③ No {k}" if k else f"PNU {c.get('pnu')}")
        return f"({' · '.join(refs)})" if refs else ""

    for para in md.split("\n"):
        p = para.strip()
        if not p:
            continue
        if p.startswith("#"):
            sec = next((v for k, v in SECTION.items() if k in p), sec)
            continue
        for a, b, ns in lint._sentence_spans(para):
            s = para[a:b].strip()
            if len(s) < 4:
                continue
            body = lint.CITE.sub("", s).strip()
            if "위법 판정 아님" in body and len(re.sub(r"AI 추론 · 검수 전 ·( 현장 확인 전 ·)? 위법 판정 아님", "", body)) < 30:
                stat["dropped_fixed"] += 1
                continue
            if not ns:
                stat["dropped_uncited"] += 1
                continue
            nums, unmapped, tptr, agg = [], False, [], 0
            for m in lint.PH.finditer(s):
                eid = m.group(2)
                if m.group(1) != "env" or eid in parcel_env:
                    continue
                agg += 1                              # 집계 숫자(필지 봉투 아님)
                if key_of.get(eid) == "shown":
                    tptr.append(f"③ 의심 상위 {f2s.get('limit') or ''}건 표".replace("  ", " "))
                    continue
                n2 = _f2s_cite_for(eid, ctx, f2s_cites)
                if n2:
                    nums.append(n2)
                    continue
                t = _f2s_table_ptr(eid, ctx, f2s)
                if t:
                    tptr.append(t)
                else:
                    unmapped = True
            if unmapped:                          # F2-S 문서 '인용' 목록에 없는 사실 → 거짓 인용 대신 싣지 않는다(센다)
                stat["dropped_unmapped"] += 1
                continue
            kinds = {(by_n.get(n) or {}).get("kind") for n in ns}
            if agg and not nums:                  # 집계 숫자가 표 칸만 가리키고 같은 값 인용이 없다 → 대체 번호(거짓 인용) 대신 싣지 않는다
                stat["dropped_unmapped"] += 1
                continue
            if not nums:
                nums.append(fallback_parcel if kinds == {"parcel"} else fallback_list)
            core = re.sub(r"\s*" + lint.CITE.pattern, inline, s).strip().rstrip(".。 ")
            text = render_plain(core, ctx.envs, lr.unverified, ctx.env_meta, [{"sentence": core}] if s in flagged else None, dec=False)
            if s in flagged:
                stat["flagged"] += 1
            ptr = f" ({' · '.join(dict.fromkeys(tptr))})" if tptr else ""
            out[sec].append(f"{text}{ptr} {''.join(f'[{n}]' for n in dict.fromkeys(nums))}.")
            stat["kept"] += 1
    return {k: v for k, v in out.items() if v}, stat


def _tenant(p) -> str:
    from .runner import tenant_of
    return tenant_of(p)


async def build_docx(emd, emd_cd, rule, top, md, lr, ctx, stats_ids, find_ids, model, flags) -> tuple[bytes, str, dict]:
    """F2-S server/survey/report.py build_draft(fmt='docx', realm, tenant) 정본 서식 우선. 실패하면 사유를 그대로 source 에 적고 로컬 서식."""
    import asyncio
    p = ctx.principal
    realm, tenant = p.realm, _tenant(p)
    info: dict = {"path": None}
    try:
        from survey import report as s_report      # F2-S · server/survey/report.py
    except Exception as e:  # noqa: BLE001
        why = f"F2-S import {type(e).__name__}: {str(e)[:140]}"
        s_report = None
    if s_report is not None:
        try:
            f2s = await asyncio.to_thread(s_report.build_draft, emd_cd, rule, top, None, "dict", realm, tenant)
            narr, stat = narrative_for_f2s(lr.answer_md, lr, ctx, flags, f2s)
            ok, bad = s_report.check_narrative(narr, len(f2s.get("citations") or []), f2s.get("citations") or [])
            data = await asyncio.to_thread(s_report.build_draft, emd_cd, rule, top, narr, "docx", realm, tenant)
            if not isinstance(data, (bytes, bytearray)):
                raise TypeError(f"build_draft(fmt='docx') 가 {type(data).__name__} 을 돌려줌")
            nar = "AI 서술 인용 검사 통과" if ok else f"AI 서술 기각({len(bad)}건) → 자동 작성 문장"
            src = (f"실태조사 보고서 서식 · {nar} · 서술 {stat['kept']}문장"
                   + (f" · 뜻 확인 필요 {stat['flagged']}" if stat["flagged"] else "")
                   + (f" · 인용 없는 문장 {stat['dropped_uncited']} 제외" if stat["dropped_uncited"] else "")
                   + (f" · 인용 목록에 없는 문장 {stat['dropped_unmapped']} 제외" if stat["dropped_unmapped"] else ""))
            info = {"path": "f2s", "narrative_ok": bool(ok), "narrative_rejected": bad, **stat}
            return bytes(data), src, info
        except Exception as e:  # noqa: BLE001
            why = f"F2-S build_draft {type(e).__name__}: {str(e)[:160]}"
    plain = render_plain(lr.answer_md, ctx.envs, lr.unverified, ctx.env_meta, flags)
    data = build_docx_local(emd, emd_cd, rule, plain, ctx, stats_ids, find_ids, ctx.run_id, model)
    return data, "실태조사 보고서 간이 서식", {"path": "local", "error": why}


async def _repair_cites(ctx: Ctx, md: str, uncited: list[str]) -> tuple[str, list[str]]:
    """검토 패스: 인용 없는 문장에만 [n] 을 붙이게 한 번 더 묻는다. 내용이 바뀌면(인용 말고 한 글자라도) 버리고 원문 + 표기 유지."""
    table = "\n".join(f"[{c['n']}] {c.get('addr') or c.get('label')}" for c in ctx.citations)
    bullets = "\n".join(f"- {u}" for u in uncited)
    msgs = [{"role": "system", "content": "너는 교정자다. 초안의 문장 내용을 한 글자도 바꾸지 말고, 지정된 문장 끝(마침표 앞)에 인용 번호 [n] 만 붙여 전체 초안을 그대로 출력한다."},
            {"role": "user", "content": f"인용 번호 표:\n{table}\n\n인용이 없는 문장:\n{bullets}\n\n초안:\n{md}"}]
    try:
        r = await backends.chat_stream(msgs, max_tokens=900, temperature=0.0, r=ctx.r)
    except backends.LLMUnavailable:
        return md, uncited
    ctx.tokens_in += int(r.usage.get("prompt_tokens") or 0)
    ctx.tokens_out += int(r.usage.get("completion_tokens") or 0)
    norm = lambda t: re.sub(r"\s+", "", lint.CITE.sub("", t))      # noqa: E731
    fixed = r.content.strip()
    if norm(fixed) != norm(md):
        ctx.state["repair"] = "rejected_changed_text"
        return md, uncited
    fixed, bad = lint.fix_cites(fixed, {c["n"] for c in ctx.citations})
    ctx.state["repair"] = "ok"
    ctx.state.setdefault("bad_cites", []).extend(bad)
    return fixed, lint.uncited_sentences(fixed)


# ── 대상 지역 · 파일 (말로 요청 · 서랍 요청 공통) ─────────────────────────────────────────
NEED_REGION = "지역을 알려 주세요(예: ○○시 보고서 초안)"


def file_href(run_id: str, name: str) -> str:
    from urllib.parse import quote
    return f"/api/v1/agent/runs/{run_id}/files/{quote(name)}"


async def _visible(ctx: Ctx) -> tuple[list[dict], list[dict]]:
    """이 계정이 볼 수 있는 실태조사 시군구·읍면동(RLS + 기관 관할)."""
    from landxi_api.deps import db
    from landxi_api import regions as RG
    from .tools import scope as SC
    p = ctx.principal
    async with db(p) as conn:
        sg = [dict(r) for r in await conn.fetch("SELECT sgg_cd, name FROM survey_sgg WHERE state='done' ORDER BY sgg_cd")]
        em = [dict(r) for r in await conn.fetch("SELECT emd_cd, name, coalesce(sgg_cd, left(emd_cd, 5)) sgg_cd FROM survey_emd")]
    if p.realm == "tenant":
        sc = RG.tenant_scope(p.tenant_id)
        sg = [x for x in sg if any(RG.in_scope(c, sc) for c in SC.codes_of(x["sgg_cd"]))]
        keep = {x["sgg_cd"] for x in sg}
        em = [x for x in em if x["sgg_cd"] in keep]
    return sg, em


def _stem(nm: str) -> str | None:
    return nm[:-1] if len(nm) >= 3 and nm[-1] in "시군구" else None


def _codes(c) -> set:
    from .tools import scope as SC
    return set(SC.codes_of(str(c))) | {str(c)}


NO_DATA = "해당 지역 데이터가 없습니다"
NOT_TENANT = "이 기관의 데이터가 아닙니다"


def in_jurisdiction(ctx: Ctx, sgg_cd: str) -> bool:
    """기관 관할 시군구인가(regions.tenant_scope · 실태조사 결과 유무와 무관). LX 계정은 전국."""
    p = ctx.principal
    if getattr(p, "realm", None) != "tenant":
        return True
    from landxi_api import regions as RG
    from .tools import scope as SC
    sc = RG.tenant_scope(getattr(p, "tenant_id", None))
    return any(RG.in_scope(c, sc) for c in (SC.codes_of(sgg_cd) or [sgg_cd]))


def guard_of(ctx: Ctx, hits: list[dict]) -> dict:
    """말한 시군구에 실태조사 결과가 없을 때 — 관할 안이면 no_data + 다음 할 일, 관할 밖이면 forbidden(plan 3.2 문구 그대로)."""
    inside = [h for h in hits if in_jurisdiction(ctx, h["sgg_cd"])]
    if inside:
        nm = inside[0].get("name") or inside[0]["sgg_cd"]
        return {"error": "no_data", "message": NO_DATA, "region": nm, "sgg_cd": inside[0]["sgg_cd"],
                "next": f"XI맵에서 {nm} AI 분석을 먼저 실행하세요"}
    return {"error": "forbidden", "message": NOT_TENANT}


async def resolve_target(ctx: Ctx, region=None, emd=None, text: str | None = None) -> dict:
    """보고서 대상 = 질문(인자·문장) → 화면 현재 지역 → 기관 관할이 한 곳이면 그곳 → 없으면 '지역을 알려 주세요'.
    반환 {level: sgg|emd, code, name, sgg, sgg_name, place} 또는 {error, message}. 지역 고정값 없음."""
    from .tools import scope as SC
    sg, em = await _visible(ctx)
    by_sgg = {x["sgg_cd"]: x for x in sg}
    blob = " ".join(str(x) for x in (region, emd, text) if x)

    def out_sgg(s):
        return {"level": "sgg", "code": s["sgg_cd"], "name": s["name"], "sgg": s["sgg_cd"], "sgg_name": s["name"], "place": s["name"]}

    def out_emd(e):
        s = by_sgg.get(e["sgg_cd"]) or {"name": SC.name_of(e["sgg_cd"]) or e["sgg_cd"]}
        return {"level": "emd", "code": e["emd_cd"], "name": e["name"], "sgg": e["sgg_cd"], "sgg_name": s["name"], "place": f"{s['name']} {e['name']}"}
    # ① 코드
    for c in (emd, region):
        c = str(c or "").strip()
        if re.fullmatch(r"\d{8,10}", c):
            e = next((x for x in em if x["emd_cd"] == c), None)
            return out_emd(e) if e else {"error": "no_data", "message": "해당 지역 데이터가 없습니다"}
        if re.fullmatch(r"\d{5}", c):
            s = next((x for x in sg if _codes(x["sgg_cd"]) & _codes(c)), None)
            return out_sgg(s) if s else guard_of(ctx, SC.resolve(c) or [{"sgg_cd": c, "name": SC.name_of(c) or c}])
    # ② 이름(질문 문장 · 인자)
    named = [x for x in sg if x["name"] and (x["name"] in blob or (_stem(x["name"]) and re.search(re.escape(_stem(x["name"])) + r"(?![가-힣]{2,}[시군구])", blob)))]
    if not named:
        for w in re.findall(r"[가-힣]{1,6}(?:시|군|구)(?![가-힣])", blob):
            hits = SC.resolve(w)
            if not hits:
                continue
            inside = [x for x in sg if any(_codes(h["sgg_cd"]) & _codes(x["sgg_cd"]) for h in hits)]
            if not inside:
                return guard_of(ctx, hits)
            named = inside
            break
    ctx_reg = str((ctx.context or {}).get("region") or (ctx.context or {}).get("sgg_cd") or "")
    pool = named or [x for x in sg if ctx_reg and (x["name"] == ctx_reg or _codes(x["sgg_cd"]) & _codes(ctx_reg))]
    keep = {x["sgg_cd"] for x in pool}
    cands = [e for e in em if e["name"] and len(e["name"]) >= 2 and (not keep or e["sgg_cd"] in keep)]
    q_emd = str(emd or "").strip()
    e_hit = sorted([e for e in cands if e["name"] in blob or (q_emd and not q_emd.isdigit() and (q_emd == e["name"] or e["name"].startswith(q_emd)))],
                   key=lambda e: -len(e["name"]))
    if e_hit:
        same = {e["sgg_cd"] for e in e_hit if e["name"] == e_hit[0]["name"]}
        if len(same) > 1:
            return {"error": "ambiguous", "message": f"'{e_hit[0]['name']}' 이 여러 시군구에 있습니다 — 시군구와 함께 말씀해 주세요"}
        return out_emd(e_hit[0])
    if pool:
        return out_sgg(pool[0])
    # ③ 화면 현재 지역이 없고 기관 관할 실태조사가 한 곳이면 그곳
    if ctx.principal.realm == "tenant" and len(sg) == 1:
        return out_sgg(sg[0])
    return {"error": "need_region", "message": NEED_REGION}


async def compose_docx(ctx: Ctx, tgt: dict, rule: str | None = None, top: int = 10) -> dict:
    """말로 요청한 보고서 — 서랍 요청과 같은 서식 함수(survey.report)로 .docx 를 run 폴더에 둔다(자동 작성 문장 · 인용 검사 · 법령 조문)."""
    import asyncio
    from survey import report as s_report
    p = ctx.principal
    realm, tenant = p.realm, _tenant(p)

    def build():
        d = s_report.collect(tgt["code"], rule, top, realm, tenant)
        j = s_report.as_json(d)
        blob, _ = s_report.render_docx(d)
        return j, blob
    j, blob = await asyncio.to_thread(build)
    d = config.ARTIFACT_DIR / ctx.run_id
    d.mkdir(parents=True, exist_ok=True)
    fname = j["filename"]
    (d / fname).write_bytes(blob)
    (d / "draft.docx").write_bytes(blob)
    return {"json": j, "bytes": len(blob), "filename": fname, "href": file_href(ctx.run_id, fname),
            "docx_url": f"/api/v1/agent/runs/{ctx.run_id}/draft.docx", "place": j["place"]}


_DUP_PLACE = re.compile(r"([가-힣]{2,}(?:시|군|구|읍|면|동|리))(?:의|에서의)?\s+\1(?![가-힣])")


def drop_coercive(md: str) -> str:
    """보고서까지(원칙 40) — 모델 서술에서 처분·공문·배정 문장(survey.report.COERCIVE)을 뺀다. 절 제목은 그대로."""
    try:
        from survey.report import COERCIVE
    except Exception:  # noqa: BLE001
        return md
    out = []
    for line in md.split("\n"):
        if not line.strip() or line.strip().startswith("#"):
            out.append(line)
            continue
        keep = [s for s in lint.SENT.findall(line) if not COERCIVE.search(lint.CITE.sub("", s))]
        out.append("".join(keep).rstrip() if keep else "")
    return "\n".join(out)


def dedupe_place(md: str) -> str:
    """'도암면의 도암면 의심 필지' 처럼 같은 지역 이름이 겹친 곳을 한 번으로(모델 서술 · 봉투 뜻 복창)."""
    prev = None
    while prev != md:
        prev, md = md, _DUP_PLACE.sub(r"\1", md)
    return md


async def draft(ctx: Ctx, body: dict):
    started = time.perf_counter()
    tgt = await resolve_target(ctx, region=body.get("region"), emd=body.get("emd_cd") or body.get("emd"))
    emd_n, emd_cd = (tgt.get("name"), tgt.get("code")) if not tgt.get("error") else (None, None)
    rule = (body.get("rule") or "").upper() or None          # 규칙 없음 = 전체(R1–R6) — 의심 필지 전체가 읍면동 칸 합과 같은 값(숫자 한 출처)
    top = max(3, min(int(body.get("top") or 10), 20))
    await persist_start(ctx, f"보고서 초안 · {tgt.get('place') or body.get('emd_cd')} · {rule or '전체 규칙'} · 상위 {top}", intent="report")
    route = {"intent": "report", "ms": 0.0, "backend": "direct", "model": "서식 요청(라우터 생략)"}
    await emit(ctx, "agent.route", route)
    if not emd_n:
        await emit(ctx, "agent.failed", {"error": "bad_request", "message": tgt.get("message") or NEED_REGION})
        await persist_state(ctx, state="failed", error="bad_request")
        return
    sgg_level = tgt["level"] == "sgg"
    emd_arg = {} if sgg_level else {"emd": emd_n}
    rg0 = {"region": tgt["sgg"]}
    rarg = {"rule": rule} if rule else {}                 # 규칙 없음 = 인자를 빼서 R1–R6 전체
    steps = [{"i": 1, "tool": "survey_stats", "args": {"by": "rule", **emd_arg, **rg0}, "why": WHY["survey_stats"], "by": "template"},
             {"i": 2, "tool": "survey_findings", "args": {**rarg, **emd_arg, "top": top, **rg0}, "why": WHY["survey_findings"], "by": "template"},
             {"i": 3, "tool": "llm_write", "args": {"paragraphs": 3}, "why": WHY["llm_write"], "by": "template"},
             {"i": 4, "tool": "llm_review", "args": {"lint": "strict", "meaning": "rules+llm"}, "why": WHY.get("llm_review", "검토: 숫자 검증기 · 봉투 뜻 검사"), "by": "template"},
             {"i": 5, "tool": "survey_reports_draft", "args": {"template": "survey-emd", "emd_cd": emd_cd, "rule": rule, "format": "docx"},
              "why": WHY["survey_reports_draft"], "by": "template"}]
    await emit(ctx, "agent.plan", {"steps": steps, "round": 1, "route": route, "template": "survey-emd", "emd": emd_n, "emd_cd": emd_cd, "rule": rule})
    rg = rg0                                               # 읍면동 이름은 전국에서 겹친다 — 초안 대상 시군구로 묶는다
    r1 = await run_tool(ctx, 1, "survey_stats", {"by": "rule", **emd_arg, **rg}, by="template")
    r2 = await run_tool(ctx, 2, "survey_findings", {**rarg, **emd_arg, "top": top, **rg}, by="template")
    if not (r1["ok"] and r2["ok"]):
        await emit(ctx, "agent.failed", {"error": "tool_failed", "message": "집계·목록 도구 실패"})
        await persist_state(ctx, state="failed", error="tool_failed")
        return
    await emit(ctx, "agent.tool.call", {"i": 3, "tool": "llm_write", "args": {"paragraphs": 3}, "by": "template"})
    messages = [{"role": "system", "content": writer_of(ctx)},
                {"role": "user", "content": f"대상: {tgt['place']} · 규칙 {rule or '전체(R1–R6)'}.\n인용 번호 표(이 번호만 쓴다 · 봉투 eN 번호와 다르다):\n"
                                             + "\n".join(f"[{c['n']}] {c.get('addr') or c.get('label')}" for c in ctx.citations) + "\n\n"
                                             + writer_tables(ctx, rule) + "\n\n" + r1["block"] + "\n\n" + r2["block"]
                                             + "\n\n위 표의 자리표와 인용 번호만으로 세 단락을 써라."}]
    t0 = time.perf_counter()

    async def on_delta(piece):
        await emit(ctx, "agent.token", {"delta": piece})
    await persist_state(ctx, state="writing")
    try:
        res = await backends.chat_stream(messages, tools=None, max_tokens=900, temperature=0.3, on_delta=on_delta, r=ctx.r)
    except backends.LLMUnavailable as e:
        await emit(ctx, "agent.failed", {"error": "llm_unavailable", "tried": e.tried, "message": "LLM 백엔드 사슬 전부 응답 없음 — F2-S 정형 초안(GET /survey/reports/draft)은 LLM 없이 받을 수 있음"})
        await persist_state(ctx, state="failed", error="llm_unavailable")
        return
    ms = round((time.perf_counter() - t0) * 1000, 1)
    ctx.tokens_in += int(res.usage.get("prompt_tokens") or 0)
    ctx.tokens_out += int(res.usage.get("completion_tokens") or 0)
    step3 = {"i": 3, "tool": "llm_write", "args": {"paragraphs": 3}, "ms": ms, "ok": True, "by": "template", "result_ref": f"{res.backend}:{res.model}"}
    ctx.steps.append(step3)
    await persist_tool(ctx, step3)
    await emit(ctx, "agent.tool.result", {"i": 3, "tool": "llm_write", "ok": True, "ms": ms, "source": f"{res.model} · {res.backend}",
                                          "summary": {}, "ui_actions": [], "first_token_ms": res.first_token_ms, "tps": res.tps})
    md, uncited = _auto_cite(drop_coercive(dedupe_place(_rule_words(res.content))), ctx)
    if uncited:
        md, uncited = await _repair_cites(ctx, md, uncited)
    # ④ 검토: 숫자 검증기(strict — 그 문장의 인용 봉투로만 승격 · % 는 인용 필지 ratio 만) + 봉투 뜻 검사(규칙 + 교정자 표)
    await emit(ctx, "agent.tool.call", {"i": 4, "tool": "llm_review", "args": {"lint": "strict", "meaning": "rules+llm"}, "by": "template"})
    t_r = time.perf_counter()
    md, bad = lint.fix_cites(audit.scrub_answer(md), {c["n"] for c in ctx.citations})
    ctx.state.setdefault("bad_cites", []).extend(bad)
    lr = lint.lint(md, ctx.envs, ctx.whitelist, scope=lint.scope_of(ctx, strict=True))
    flags = await meaning_check(ctx, lr.answer_md, rule)
    uncited = lint.uncited_sentences(lr.answer_md)
    ms_r = round((time.perf_counter() - t_r) * 1000, 1)
    step_r = {"i": 4, "tool": "llm_review", "args": {"lint": "strict", "meaning": "rules+llm"}, "ms": ms_r, "ok": True, "by": "template",
              "result_ref": f"검증 안 된 숫자 {len(lr.unverified)} · 봉투 뜻 확인 필요 {len(flags)} · {ctx.state.get('meaning_llm', '')}"}
    ctx.steps.append(step_r)
    await persist_tool(ctx, step_r)
    await emit(ctx, "agent.tool.result", {"i": 4, "tool": "llm_review", "ok": True, "ms": ms_r, "source": step_r["result_ref"], "summary": {}, "ui_actions": [],
                                          "meaning_flags": flags, "unverified": lr.unverified})
    # ⑤ .docx
    await emit(ctx, "agent.tool.call", {"i": 5, "tool": "survey_reports_draft", "args": steps[4]["args"], "by": "template"})
    t1 = time.perf_counter()
    stats_ids = {k: v for (i, k), v in ctx.keymap.items() if i == 1}
    find_ids = {k: v for (i, k), v in ctx.keymap.items() if i == 2}
    b = config.BACKENDS.get(res.backend, {})
    data, src, docx_info = await build_docx(emd_n, emd_cd, rule, top, lr.answer_md, lr, ctx, stats_ids, find_ids, f"{res.model} · {b.get('label')}", flags)
    d = config.ARTIFACT_DIR / ctx.run_id
    d.mkdir(parents=True, exist_ok=True)
    fname = f"실태조사_초안_{tgt['place'].replace(' ', '_')}_{dt.datetime.now(KST):%Y%m%d}.docx"
    (d / "draft.docx").write_bytes(data)
    (d / fname).write_bytes(data)
    ms4 = round((time.perf_counter() - t1) * 1000, 1)
    step4 = {"i": 5, "tool": "survey_reports_draft", "args": steps[4]["args"], "ms": ms4, "ok": True, "by": "template", "result_ref": src[:300]}
    ctx.steps.append(step4)
    await persist_tool(ctx, step4)
    size = {"value": len(data), "unit": "bytes", "basis": "measured", "as_of": dt.datetime.now(KST).isoformat(timespec="seconds"), "source": src}
    artifact = {"docx_url": f"/api/v1/agent/runs/{ctx.run_id}/draft.docx", "href": file_href(ctx.run_id, fname), "filename": fname, "place": tgt["place"], "bytes": size, "source": src,
                "template": "survey-emd", "fixed": fixed_of(ctx), "law": "법령 조문 인용", "docx": docx_info}
    await emit(ctx, "agent.tool.result", {"i": 5, "tool": "survey_reports_draft", "ok": True, "ms": ms4, "source": src, "summary": {},
                                          "ui_actions": [], "artifact": artifact})
    await finish(ctx, md, res, started, route, {"first_token_ms": res.first_token_ms}, artifact=artifact, lint_result=lr,
                 extra={"uncited": uncited, "meaning_flags": flags, "meaning_llm": ctx.state.get("meaning_llm"), "bad_cites": ctx.state.get("bad_cites") or [], "cite_repair": ctx.state.get("repair"), "report": {"emd": emd_n, "emd_cd": emd_cd, "level": tgt["level"], "place": tgt["place"], "rule": rule, "top": top}})
