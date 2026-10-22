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
    "survey_count": {"description": "현장 확인 필요 필지 · 실태조사 의심 필지 건수(물은 이름 그대로) — '○○ 현장 확인 필요 필지 몇 건' · '우리 시 의심 필지 몇 건' · '비닐하우스 의심 필지 몇 건'(그 서비스 몫).",
                     "properties": {"name": {"type": "string", "enum": ["field_check", "suspects"]}, "region": {"type": "string", "description": "시군구 이름 또는 코드"},
                                    "card": {"type": "string", "description": "서비스(카드) — 그 서비스 몫만"}}},
    "survey_compare": {"description": "두 시군구의 같은 이름 숫자 비교(의심 필지 · 현장 확인 필요) — 막대 둘.",
                       "properties": {"regions": {"type": "array", "items": {"type": "string"}}, "name": {"type": "string", "enum": ["field_check", "suspects"]}},
                       "required": ["regions"]},
    "ai_count": {"description": "AI 분석 결과 수(LX 계정 · 화면 XI맵 큰 숫자와 같은 값) — '○○ AI 분석 결과 몇 건'.",
                 "properties": {"region": {"type": "string", "description": "시군구 이름 또는 코드"}}, "route_only": True},
    "survey_rank": {"description": "실태조사 의심 필지 읍면동 순위('읍면동별 현장 확인 필요 필지 순위' · '의심 필지 많은 동네') — 조건을 버리지 않고 의심 필지 읍면동별 수로.",
                    "properties": {"region": {"type": "string"}, "low": {"type": "boolean"}}, "route_only": True},
    "class_count": {"description": "'○○ 비닐하우스 몇 곳' — 그 지역 그 종류 결과 개수(LX = XI맵 통계 판과 같은 셈 · 기관 = 서비스 결과 · 서비스 요약으로 대신하지 않음).",
                    "properties": {"region": {"type": "string"}, "task": {"type": "string"}}, "route_only": True},
    "region_brief": {"description": "지역을 고르지 않은 화면의 '이 지역 결과 요약' — 전국 요약 두 문장 + 의심 필지가 많은 시군구 막대.", "properties": {}},
    "rule_gap": {"description": "실태조사 조건에 없는 조합(대장 논 · 밭 위 비닐하우스 등) — 이유 한 줄 + 가까운 조건 버튼.", "properties": {"kind": {"type": "string"}},
                 "route_only": True},
}
HANDLERS: dict = {}
WRITE: set[str] = set()
CONFIRM: set[str] = set()
CLIENT: set[str] = set()
WHY = {"class_count": "그 종류 결과 개수", "survey_rank": "실태조사 의심 필지 읍면동 순위", "ai_count": "AI 분석 결과 수(화면과 같은 값)", "survey_count": "건수 확인(물은 이름 그대로)", "survey_compare": "두 지역 같은 이름 숫자 비교", "region_brief": "전국 요약", "rule_gap": "없는 조건 안내"}
SAY = {"class_count": "개수 확인", "survey_rank": "읍면동 순위", "ai_count": "AI 분석 결과 확인", "survey_count": "건수 확인", "survey_compare": "두 지역 비교", "region_brief": "전국 결과 요약", "rule_gap": "조건 확인"}
NAME_KO = {"field_check": "현장 확인 필요 필지", "suspects": "실태조사 의심 필지"}   # 시안 ⓐ-1(10-22 확인) — 의심 필지는 이름표 하나(전체) · 서비스를 말하면 그 서비스 몫만


def allowed(name: str, p) -> bool:
    return getattr(p, "realm", None) in ("lx", "tenant")


COUNT_RX = re.compile(r"몇\s*(건|필지|개|곳)?|건수|얼마나|개수|숫자|총\s*몇")
FIELD_RX = re.compile(r"현장\s*확인\s*(필요)?")
SUS_RX = re.compile(r"의심\s*(필지)?")
AI_RX = re.compile(r"AI\s*(분석\s*)?(결과|탐지)|분석\s*결과")
COUNT_NOT = re.compile(r"차트|그래프|막대|목록|상위|지번|보고서|공문|대장|규칙|유형|등급|읍\s*면\s*동|동별|비교|견줘|법|조문|영상")
CMP_RX = re.compile(r"비교|견줘|대비|어디가\s*(더|많)|차이")
HERE_RX = re.compile(r"(이|우리|여기|이곳)\s*(지역|곳|시|군|구)?.{0,8}(결과|요약|현황|정리)|^결과\s*요약")


async def _stats(ctx, r: dict | None, by: str = "rule") -> Out:
    from ..survey import survey_stats
    return await survey_stats({"by": by, **({"region": r["sgg_cd"]} if r else {})}, ctx)


def _place(ctx, r: dict | None) -> str:
    if r:
        return r["name"]
    return "관할 전체" if getattr(ctx.principal, "realm", None) == "tenant" else "전국"


_CARDS: dict = {"t": 0.0, "rows": []}


async def card_names() -> list[tuple[str, str, list[str]]]:
    """서비스(카드) → (id, 화면 이름, 알아들을 낱말) — 카드 표에서(지역 · 서비스 고정값 0 · 5분 보관)."""
    import time
    if time.time() - _CARDS["t"] < 300 and _CARDS["rows"]:
        return _CARDS["rows"]
    from landxi_api.deps import db
    rows = []
    try:
        async with db(realm="lx") as c:
            for r in await c.fetch("SELECT id, name->>'ko' AS nm FROM cards WHERE coalesce(name->>'ko', '') <> ''"):
                nm = re.sub(r"\s*(?:분석\s*)?서비스$", "", str(r["nm"])).strip()
                if "해외" in nm:
                    continue
                words = [w for w in re.split(r"[·\s,()]+", nm) if len(w) >= 2 and w not in ("분석", "관리", "탐지", "위험요소")]
                rows.append((r["id"], nm, words))
    except Exception:  # noqa: BLE001
        rows = []
    _CARDS.update(t=time.time(), rows=rows)
    return rows


async def card_in(t: str) -> tuple[str, str] | None:
    """질문 속 서비스 낱말 → (카드 id, 서비스 이름). 둘 이상이거나 없으면 None."""
    hit = []
    for cid, nm, words in await card_names():
        if any(re.search(r"(?<![가-힣])" + re.escape(w), t) for w in words):
            hit.append((cid, nm))
    return hit[0] if len(hit) == 1 else None


async def _card_share(ctx, r: dict | None, card: str) -> dict | None:
    from landxi_api.deps import db
    from landxi_api import survey as S
    nm = next((n for cid, n, _w in await card_names() if cid == card), None)
    if not nm:
        return None
    from landxi_api import summary as SM
    p = ctx.principal
    try:
        async with db(p) as conn:
            # 서비스 몫 = 대표 수치 요약의 그 서비스 항목 값(화면 카드 숫자와 같은 한 출처 · 한 지역 항목 합 = 지역 숫자 · 10-22 ⓐ)
            tenant = SM.LX_ALL if getattr(p, "realm", None) == "lx" else getattr(p, "tenant_id", None)
            res = await SM.build(conn, tenant, region=r["sgg_cd"] if r else None, card=card)
    except Exception:  # noqa: BLE001
        return None
    ms = [it["metrics"]["suspect"] for it in res.get("items") or [] if (it.get("metrics") or {}).get("suspect", {}).get("value") is not None]
    if not ms:
        return None
    e0 = {x: ms[0][x] for x in ("unit", "basis", "source", "note") if x in ms[0]}
    return {"name": nm, "env": {**e0, "value": sum(int(m["value"]) for m in ms), "as_of": max(str(m.get("as_of") or "") for m in ms)}}


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
    if name == "suspects" and args.get("card"):          # 시안 ⓐ-1 — 서비스를 말하면 그 서비스 몫만(survey_counts 카드 판 · XI맵 · 로그인 화면 카드 숫자와 같은 값)
        share = await _card_share(ctx, r, str(args["card"]))
        if share:
            out.env("card_share", f"{place} {share['name']} 의심 필지", share["env"])
            out.answer = f"{place} {share['name']} 의심 필지는 {{{{card_share}}}}입니다 — 실태조사 의심 필지 전체 {{{{suspects}}}} 가운데 이 서비스 몫입니다."
            out.data = {"지역": place, "물은 숫자": f"{share['name']} 의심 필지"}
            if r:
                await talk.remember(ctx, r["sgg_cd"])
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


async def class_count(args: dict, ctx) -> Out:
    """'○○ 비닐하우스 몇 곳'(TRIAGE 5 · 개발 ②) — 서비스 요약 대신 그 지역 그 종류 개수. LX = XI맵 통계 판(xdash.agg_task · 서비스 결과가 있으면 서비스 결과만)
    · 기관 = 받은 서비스 결과(기관 통계 화면과 같은 값). 없으면 '○○에는 △△ 결과가 없습니다'."""
    from ... import talk, svcpick
    from .map import resolve_region
    from landxi_api.envelope import env
    task = str(args.get("task") or "")
    if args.get("region"):
        r = resolve_region({"name": args["region"]}, ctx)
    else:
        r, _src, _alts = await talk.resolve(ctx, (ctx.state or {}).get("msg") or "")
    place = _place(ctx, r)
    out = Out(source="XI맵 통계 판과 같은 셈")
    out.scope = {"cls": [task], "kind": "det", "emd": None, **({"sgg": [r["sgg_cd"]]} if r else {})}
    if talk.realm(ctx) == "lx" and r:
        from landxi_api import xdash as XD
        t = await XD.agg_task(r["sgg_cd"])
        rows = [x for x in t.get("rows") or [] if x["k"] == task]
        if any(x.get("src") == "service" for x in rows):
            rows = [x for x in rows if x.get("src") == "service"]   # 물은 범위대로(원칙 312) — 단위가 다른 전국 분석을 더하지 않는다
        if rows:
            n = sum(int(x["n"]) for x in rows)
            out.env("n", f"{place} {task}", env(n, rows[0].get("unit") or "개", "inferred", "XI맵 융합 집계 — 화면 대시보드 큰 숫자와 같은 값"))
            if rows[0].get("year"):
                ctx.state["scope_year"] = rows[0]["year"]
            out.answer = f"{place} {task}는 {{{{n}}}}입니다" + (f"({rows[0]['name']} 결과)." if rows[0]["name"] != task else ".")
            if talk.on_xi(ctx) is False or talk.has_map(ctx) is False:
                href = talk.xi_href(ctx, r["sgg_cd"])
                if href:
                    talk.set_next(ctx, [talk.btn("XI맵에서 보기", href=href)])
            return out
    elif talk.realm(ctx) == "tenant":
        s_ = await svcpick.svc_for(ctx, task)
        st = await svcpick.svc_stats(ctx, s_["card"]) if s_ else None
        hit = [c for c in (st or {}).get("classes") or [] if c.get("n") and (c["name"] == task or task in c["name"])]
        if not hit:                                       # 결과 종류 이름이 다른 말(영어 코드 등)인 서비스 — 서비스 이름으로 찾고 그 서비스 결과 모두
            s2 = await svcpick.svc_by_name(ctx, task)
            st2 = await svcpick.svc_stats(ctx, s2["card"]) if s2 else None
            if st2 and (st2.get("total") or {}).get("n"):
                s_, st = s2, st2
                hit = [{"name": task, "n": st2["total"]["n"]}]
        multi = len(talk.home_all(ctx)) > 1
        if hit and multi:                                 # 여러 시군을 맡은 기관 — 서비스 통계는 관할 전체 값이라 시군별은 서비스 요약(같은 값)에서('우리 시' 규칙)
            try:
                from landxi_api.deps import db
                from ..summary_lookup import build, tenant_arg
                async with db(ctx.principal) as conn:
                    vis = await build(conn, tenant_arg(ctx.principal))
                per = []
                for it in vis.get("items") or []:
                    e = ((it.get("metrics") or {}).get("detected") or {})
                    if it.get("card") == s_["card"] and e.get("value"):
                        per.append((str(it.get("region_name") or "").split(" ")[-1], e))
                per.sort(key=lambda x: -(x[1].get("value") or 0))
                if r:                                     # 물은 시군 하나 · 화면 시군(규칙 ②) — 그 시군 몫만
                    one = [(nm, e) for nm, e in per if nm == r["name"].split(" ")[-1]]
                    if one:
                        out.env("n", f"{place} {s_['name']} 결과", one[0][1])
                        ctx.state["svc_src"] = {"name": s_["name"], "unit": st.get("unit")}
                        out.answer = f"{place} {task}는 {{{{n}}}}입니다."
                        return out
                    per = []
                if per:
                    out.env("n", f"관할 전체 {s_['name']} 결과", {**per[0][1], "value": sum(int(e.get("value") or 0) for _nm, e in per),
                                                              "source": "서비스 요약(시군별 합)"})
                    for i, (nm, e) in enumerate(per[:5]):
                        out.env(f"s{i}", f"{nm} {s_['name']} 결과", e, scope={"sgg": None})
                    ctx.state["svc_src"] = {"name": s_["name"], "unit": st.get("unit")}
                    ctx.state["scope_sets"] = list(s_["sets"])
                    out.scope = {"cls": [task], "kind": "det", "emd": None}
                    out.answer = (f"관할 전체 {task}는 {{{{n}}}}입니다 — " + " · ".join(f"{nm} {{{{s{i}}}}}" for i, (nm, _e) in enumerate(per[:5]))
                                  + ("." if len(per) > 1 else "에만 있습니다."))
                    ctx.state["next"] = [talk.btn(f"{nm} 결과 요약", q=f"{nm} 결과 요약해 줘") for nm, _e in per[:2]]   # 결과가 있는 시군만(규칙 ③ 단추를 바꿔 끼움)
                    return out
            except Exception:  # noqa: BLE001
                pass
            hit = []                                      # 시군별 값을 못 찾으면 관할 전체 값을 그 시군 이름으로 쓰지 않는다
        if hit:
            out.env("n", f"{place} {s_['name']} {hit[0]['name']}", hit[0]["n"])
            ctx.state["svc_src"] = {"name": s_["name"], "unit": st.get("unit")}
            ctx.state["scope_sets"] = list(s_["sets"])
            svc = re.sub(r"\s*분석\s*서비스$", "", s_["name"])
            out.answer = f"{place} {hit[0]['name']}는 {{{{n}}}}입니다({svc} 서비스 결과)."
            return out
        if r:                                              # 받은 서비스에 없으면 — 이 계정 지도 결과 층(지역 결과 목록 · 지도 서비스와 같은 고르기)
            try:
                from ..results import _set
                from . import mapsvc as MS
                sid = await _set({"region": r["sgg_cd"], "cls": task}, ctx)
                job = sid.rsplit("/", 1)[-1] if "/job_" in sid else sid
                classes, _e = await MS._avail([job])
                w, miss = MS._want_cls(task, classes)
                if w and not miss:
                    n, _m2 = await MS._count([job], {"cls": w})
                    if n:
                        names = await __import__("landxi_api.result_scope", fromlist=["layer_names"]).layer_names([job])
                        out.env("n", f"{place} {task}", env(n, "count", "inferred", "지도 위 결과 층(결과 타일과 같은 행)"))
                        ctx.state["scope_sets"] = [job]
                        nm = (names[0]["name"] if names else "") or "지도 위 결과 층"
                        out.answer = f"{place} {task}는 {{{{n}}}}입니다({nm} 결과)."
                        return out
            except Exception:  # noqa: BLE001
                pass
    out.data = {"status": "not_found", "text": f"{place}에는 {task} 결과가 없습니다."}
    out.answer = out.data["text"]
    return out


async def survey_rank(args: dict, ctx) -> Out:
    """'읍면동별 현장 확인 필요 필지 순위'(TRIAGE 8 · 개발 ③) — 조건(실태조사)을 버리지 않고 실태조사 의심 필지 읍면동별 수(survey_stats 읍면동 칸 · 합 = 시군구 합계)."""
    from ... import talk
    from .map import resolve_region
    if args.get("region"):
        r = resolve_region({"name": args["region"]}, ctx)
    else:
        r, _src, _alts = await talk.resolve(ctx, (ctx.state or {}).get("msg") or "")
    src = await _stats(ctx, r, "emd")
    out = Out(source=src.source, note=src.note)
    place = _place(ctx, r)
    emd = [(k, m, e) for k, m, e in src.envelopes if re.fullmatch(r"emd_\d+", k) and (e or {}).get("value") is not None]
    tot = next(((m, e) for k, m, e in src.envelopes if k == "suspects"), None)
    if not emd:
        out.answer = f"{place}에는 읍면동별로 셀 실태조사 의심 필지가 없습니다."
        return out
    emd.sort(key=lambda x: -(x[2].get("value") or 0))
    if args.get("low"):
        emd = list(reversed(emd))
    rows = []
    for i, (k, m, e) in enumerate(emd[:10]):
        nm = re.sub(r"\s*의심\s*필지.*$", "", m)
        out.env(f"r{i}", f"{nm} 실태조사 의심 필지", e, scope={"emd": [nm], "kind": "suspect"})
        rows.append({"label": nm, "env": f"r{i}"})
    if tot:
        out.env("suspects", tot[0], tot[1])
    out.scope = {"kind": "suspect", "emd": None, "cls": None}
    out.blocks.append({"type": "chart", "kind": "bar", "title": "읍면동별 실태조사 의심 필지", "rows": rows})
    top = " · ".join(f"{r_['label']} {{{{{r_['env']}}}}}" for r_ in rows[:3])
    out.answer = (f"{place} 실태조사 의심 필지 읍면동 순위({'적은' if args.get('low') else '많은'} 곳부터)는 {top}입니다"
                  + (" — 모두 {{suspects}} 가운데입니다." if tot else ".") + ("" if talk.lx_ai(ctx) else " 현장 확인 필요 필지도 이 의심 필지 안에서 고릅니다."))
    out.data = {"지역": place, "순위": [r_["label"] for r_ in rows]}
    if r:
        await talk.remember(ctx, r["sgg_cd"])
        talk.set_next(ctx, [talk.btn("의심 필지 10곳 지도에", q=f"{r['name']} 의심 필지 10곳 보여 줘"), talk.btn("보고서 초안", q=f"{r['name']} 보고서 초안 만들어 줘")])
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


HANDLERS.update({"class_count": class_count, "survey_rank": survey_rank, "ai_count": ai_count, "survey_count": survey_count, "survey_compare": survey_compare, "region_brief": region_brief, "rule_gap": rule_gap})
GAP_RX = re.compile(r"(대장|지목).{0,14}(논|밭|답|전|과수원|농지).{0,24}비닐\s*하우스|비닐\s*하우스.{0,14}(대장|지목).{0,10}(논|밭|농지)")


# 규칙 한 가지 · 읍면동을 말한 건수 질문은 직행하지 않는다(시군구 전체 숫자로 답하지 않게 — 모델이 survey_stats 에 규칙 · 읍면동을 싣는다 · 10-14 재검수)
NARROW_RX = re.compile(r"무허가|불법\s*건축|(?<!대장 )(?<!대장)농지\s*위\s*건물|휴경|비닐하우스|주차장|임야|개간|공공용지|구거|하천"
                       r"|[가-힣]{2,6}(?:읍|면|동)(?=\s|$|[의에은는이가을를서])")


HOWMANY_RX = re.compile(r"몇\s*(?:곳|개|동|채|군데)|얼마나\s*(?:있|많)")
TASK_WORDS_ASK = [(r"비닐\s*하우스|온실", "비닐하우스"), (r"건물|건축물", "건물"), (r"경작지|농경지", "경작지"), (r"주차장", "주차장"), (r"해양\s*쓰레기", "해양쓰레기")]
RANK_RX = re.compile(r"순위|많은\s*(?:곳|동네|순)|적은\s*곳|상위|하위|랭킹")
EMD_ASK = re.compile(r"읍면동|동네|읍\s*면|면\s*별|동\s*별")
EMD_WORD = re.compile(r"[가-힣]{2,6}(?:읍|면|동)(?=\s|$|[의에은는이가을를서])")


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
    # 개발 ②(TRIAGE 5) — '○○ 비닐하우스 몇 곳'(지도 통계 판 · 켜진 층 직행이 잡지 않은 화면) = 그 지역 그 종류 개수(서비스 요약으로 대신하지 않음)
    if not (has_field or has_sus) and HOWMANY_RX.search(t) and len(named) <= 1 and not EMD_WORD.search(t) and not re.search(r"보고서|차트|법|조문|대장|비교|만\s*보여", t):
        tk = [k for rx, k in TASK_WORDS_ASK if re.search(rx, t)]
        if len(set(tk)) == 1:
            return {"tool": "class_count", "args": {"task": tk[0], **({"region": named[0]["sgg_cd"]} if named else {})}}
    # 개발 ③(TRIAGE 8) — '읍면동별 현장 확인 필요 필지 순위' · '의심 필지 많은 동네' = 실태조사 의심 필지 읍면동 순위(조건을 버리지 않는다)
    if (has_field or has_sus) and RANK_RX.search(t) and EMD_ASK.search(t) and len(named) <= 1 and not re.search(r"보고서|공문|법|조문|지번|목록|\d+\s*곳\s*(?:보여|지번)", t):
        return {"tool": "survey_rank", "args": {**({"region": named[0]["sgg_cd"]} if named else {}), **({"low": True} if re.search(r"적은|하위", t) else {})}}
    # 시안 ⓐ-1 — '비닐하우스 의심 필지 몇 건'(서비스 낱말 · 읍면동 없음) = 그 서비스 몫(카드 판 · 화면 카드 숫자와 같은 값)
    if has_sus and not has_field and COUNT_RX.search(t) and not COUNT_NOT.search(t) and len(named) <= 1 and not EMD_WORD.search(t):
        cd = await card_in(t)
        if cd:
            return {"tool": "survey_count", "args": {"name": "suspects", "card": cd[0], **({"region": named[0]["sgg_cd"]} if named else {})}}
    if (has_field or has_sus) and NARROW_RX.search(t):
        return None
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
