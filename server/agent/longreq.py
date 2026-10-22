"""긴 실태조사 요청을 칸마다 정해진 답으로 나눠 답하기(10-22 채택 ChatGEO-제안긴요청 · C19).

'저희 과에서 올해 ○○ 일대 △△에 대해 실태조사를 나가야 하는데 … 표로 정리 · 급한 순서 · 근거 법령 조항도' 처럼 목록 · 법령 · 표를
한 번에 묻는 말은 모델에 맡기면 돌릴 때마다 모양이 달라진다. 칸을 정해 차례로 붙인다(모델 0 · 늘 같은 모양):
  ① 대상     지역(읍면동) · 물은 종류 — 실태조사 의심 필지로 거른다는 것
  ② 급한 순   실태조사 의심 필지 점수 상위 다섯(지도에 표시 · 인용 번호) — 실태조사 의심 필지 모두 가운데
  ③ 근거 조문 「농지법」 실태조사 조문 원문(색인 · 지어내기 0) + 국가법령정보센터 단추
  ④ 표 · 보고서 읍면동별 표(아래 표 블록) · 보고서 초안 단추 · 지난해 비교를 물었으면 싣지 않은 까닭 한 줄
지역 · 지명 고정값 0(질문 → 화면 지역 → 우리 시). 숫자는 봉투로만.
"""
from __future__ import annotations

import re

LONG_RX = re.compile(r"실태\s*조사")
PART_RX = {"list": re.compile(r"급한\s*순|순서로\s*추려|우선\s*순위|추려\s*(?:주|줘)|목록"),
           "law": re.compile(r"법령|조항|조문|근거"),
           "table": re.compile(r"표로|표\s*로도|정리해|읍면동\s*별|합계|보고서"),
           "map": re.compile(r"지도에|칠해|칠하고|색을")}
CMP_RX = re.compile(r"지난\s*해|작년|전년|비교")


def match(msg: str) -> bool:
    t = re.sub(r"\s+", " ", msg or "")
    if len(t) < 60 or not LONG_RX.search(t):
        return False
    return sum(1 for rx in PART_RX.values() if rx.search(t)) >= 3


async def answer(ctx, msg: str, started: float, scr: dict):
    from . import runner as R
    from . import scopecheck as SC
    from . import talk
    t = re.sub(r"\s+", " ", msg or "")
    route = {"intent": "map", "ms": 0, "backend": "runtime", "model": "긴 실태조사 요청(칸마다)"}
    await R.emit(ctx, "agent.route", {**route, "pii": scr["pii"], "lang": ctx.lang})
    await R.persist_state(ctx, intent="long_survey")
    reg, _src, _alts = await talk.resolve(ctx, t)
    asked = await SC.asked_scope(ctx, t)
    emd = (asked.get("emd") or [None])[0]
    words = SC._ask_words(t)
    base = {"region": reg["sgg_cd"]} if reg else {}
    a1 = {**base, "by": "emd", **({"emd": emd} if emd else {})}
    a2 = {**base, "top": 5, **({"emd": emd} if emd else {})}
    plan = [{"i": 1, "tool": "survey_stats", "args": a1, "why": R.WHY.get("survey_stats", ""), "by": "runtime"},
            {"i": 2, "tool": "survey_findings", "args": a2, "why": R.WHY.get("survey_findings", ""), "by": "runtime"},
            {"i": 3, "tool": "map_arrive", "args": {}, "why": R.WHY.get("map_arrive", ""), "by": "runtime"}]
    ctx.state["plan"] = plan
    await R.emit(ctx, "agent.plan", {"steps": plan, "round": 1, "route": route, "model": {"id": "런타임", "backend": "runtime"}})
    r1 = await R.run_tool(ctx, 1, "survey_stats", a1, by="runtime")
    if not r1.get("ok") and emd and not R.guard_text(ctx, r1):          # 그 읍면동 이름을 못 찾음 — 시군구 전체로(답 첫 칸에 그 읍면동은 밝힌다)
        a1 = {k: v for k, v in a1.items() if k != "emd"}
        a2 = {k: v for k, v in a2.items() if k != "emd"}
        emd = None
        r1 = await R.run_tool(ctx, 1, "survey_stats", a1, by="runtime")
    g = R.guard_text(ctx, r1)
    if g:
        await R.finish(ctx, g, None, started, route, {}, lint_on=False)
        return
    r2 = await R.run_tool(ctx, 2, "survey_findings", a2, by="runtime") if r1.get("ok") else {"ok": False}
    if r2.get("ok") and (r2.get("raw") or {}).get("features"):
        await R.run_tool(ctx, 3, "map_arrive", {}, by="runtime")
    place = " ".join(x for x in ((reg or {}).get("name") or ("관할 전체" if talk.realm(ctx) == "tenant" else "전국"), emd or "") if x)
    lines = []
    # ① 대상
    what = " · ".join(words) if words else "물으신 시설"
    lines.append(f"① 대상: {place} {what} — 영상 AI 분석 결과를 필지와 맞춘 실태조사 의심 필지로 걸렀습니다(현장조사 대상 후보 · 위법 판정 아님).")
    # ② 급한 순
    total = ctx.env_id("suspects", 1) if r1.get("ok") else None
    shown = ctx.env_id("shown", 2) if r2.get("ok") else None
    parcels = [c for c in ctx.citations if c.get("step") == 2 and c.get("kind") == "parcel"]
    if parcels and shown:
        items = " · ".join(f"{k}위 {c.get('addr') or c.get('label')} [{c['n']}]" for k, c in enumerate(parcels, 1))
        lines.append(f"② 급한 순: 점수 상위 {{{{env:{shown}}}}}을 지도에 표시했습니다 — {items}"
                     + (f" (실태조사 의심 필지 {{{{env:{total}}}}} 가운데)." if total else "."))
    else:
        lines.append(f"② 급한 순: {place}에는 실태조사 의심 필지가 없습니다.")
    # ③ 근거 조문(원문 그대로)
    try:
        from .rag import index as LAW
        a = LAW.article("농지법", "제54조", 1)
    except Exception:  # noqa: BLE001
        a = None
    if a:
        body = re.split(r"\s*<개정|\n", a["text"])[0].strip()
        body = body if len(body) <= 160 else body[:158].rstrip() + "…"
        ctx.citations.append({"kind": "law", "label": a["ref"]["label"], "text": a["text"], "n": len(ctx.citations) + 1, "step": 4,
                              "law_ref": {"법령": a["ref"]["law"], "조": a["ref"]["article"], "항": a["ref"]["para"], "시행일": a["ref"]["effective"]}})
        for x in re.findall(r"\d+", a["text"] + " " + a["ref"]["label"]):
            ctx.whitelist.add(x)
        lines.append(f"③ 근거 조문: {a['ref']['label']} “{body}”")
    else:
        lines.append("③ 근거 조문: 색인된 법령에서 맞는 조문을 찾지 못했습니다 — 국가법령정보센터에서 확인해 주세요.")
    # ④ 표 · 보고서
    rows = []
    for (i, key), eid in sorted(ctx.keymap.items(), key=lambda kv: int(kv[1][1:])):
        if i == 1 and re.fullmatch(r"emd_\d+", key):
            rows.append({"label": re.sub(r"\s*의심\s*필지.*$", "", ctx.env_meta.get(eid) or ""), "env": eid})
    if rows:
        ctx.blocks.append({"type": "table", "title": "읍면동별 실태조사 의심 필지", "rows": rows[:12], "step": 1})
    tail = "④ 표 · 보고서: 읍면동별 표를 아래에 두었습니다 — 보고서는 '보고서 초안' 단추로 만듭니다." if rows else "④ 표 · 보고서: '보고서 초안' 단추로 만듭니다."
    if CMP_RX.search(t):
        tail += " 지난해와 견준 숫자는 이 답에 싣지 않았습니다 — 두 시점 영상은 지도에서 나란히 볼 수 있습니다."
    lines.append(tail)
    nm = (reg or {}).get("name") or ""
    from .tools.ext import law as _law
    talk.set_next(ctx, [talk.btn("보고서 초안", q=f"{nm} 보고서 초안 만들어 줘".strip()),
                        talk.btn("읍면동별 차트", q=f"{nm} 의심 필지 읍면동별 차트로 보여 줘".strip()),
                        _law.site_btn("농지법 실태조사")])
    if reg:
        await talk.remember(ctx, reg["sgg_cd"])
    ctx.state["rounds"] = 0
    await R.finish(ctx, "\n".join(lines), None, started, route, {}, lint_on=False)
