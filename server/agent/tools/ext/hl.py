"""XI ChatGEO 답 ↔ 지도 강조(10-18 원칙 292 — "대화해서 실제 지도에 하이라이팅 기능을 만들던가. 지도와 동적으로 움직이는게 맞다.")

답이 가리키는 곳(읍면동 · 시군구)을 구조로 화면에 넘긴다 — 글을 읽어 추측하지 않는다.
  collect(ctx, blocks, answer_md) → agent.done 의 map_refs
      { level: 'emd'|'sgg', sgg, unit, what, items: [{k, name, v}], named: [k…], mode: 'mark'|'only', focus: k|None }
      출처(도구 결과만): ① 답을 만든 도구가 남긴 것(ctx.state['map_refs'] — 이 모듈의 map_hl)
                       ② XI맵 통계(ximap_dash 사양의 읍면동 · 시군구 막대 · 순위 줄 — 답 숫자와 같은 값)
                       ③ 읍면동별 차트 블록(map_stats 등 — 줄 이름을 그 시군구 읍면동 경계 이름과 맞춤 · 값 = 봉투)
                       ④ 지도 동작(map_on 읍면동 거르기 · map_flyto/map_region 시군구)
      관할 밖 시군구는 넣지 않는다(region_allowed). 다음 질문이 쓰도록 Redis 에 24시간(agent:runs:{run}:refs).
  map_hl(follow-up) — 앞 답(같은 창 prev_run)의 목록에서 '그중 가장 큰 곳' · '가장 적은 곳' · '상위 3곳' · '송동면만' · '전체 다시'를 고른다.
      숫자는 앞 답의 도구 값 그대로(지어낸 숫자 0) · 모델 호출 0.
지역 · 지명 고정값 0.
"""
from __future__ import annotations

import json
import re

from .. import Out

SPECS = {
    "map_hl": {
        "description": "앞 답이 가리킨 곳들 가운데 고르기(가장 큰 곳 · 가장 적은 곳 · 상위 n곳 · 이름 하나 · 전체) — 지도 강조만 바꾼다.",
        "properties": {"pick": {"type": "string", "description": "top | low | topn | name | all"},
                       "n": {"type": "integer"}, "name": {"type": "string"}},
    },
}
WRITE: set[str] = set()
CONFIRM: set[str] = set()
WHY = {"map_hl": "앞 답 안에서 고르기 · 지도 강조"}
SAY = {"map_hl": "지도에서 그곳 강조"}
TTL = 86400
MAX_ITEMS = 400


def _key(run: str) -> str:
    return f"agent:runs:{run}:refs"


def _num(v):
    try:
        return None if v is None else float(v)
    except (TypeError, ValueError):
        return None


def _unit(u) -> str:
    u = str(u or "")
    return "" if u in ("count", "ratio", "ndvi") else u


# ── ① ~ ④ 답이 가리키는 곳 모으기 ────────────────────────────────────────────────────────
def _from_dash(spec: dict) -> dict | None:
    """XI맵 통계 사양 → 읍면동 · 시군구 줄(막대가 먼저 · 없으면 순위 10줄)."""
    pans = [p for p in (spec.get("panels") or []) if p.get("pick") in ("emd", "sgg") and p.get("type") in ("bar", "rank")
            and any(_num(r.get("v")) is not None for r in p.get("rows") or [])]
    if not pans:
        return None
    p = sorted(pans, key=lambda x: (0 if x.get("type") == "bar" else 1, -len(x.get("rows") or [])))[0]
    lvl = p["pick"]
    sgg = (spec.get("map") or {}).get("sgg") or spec.get("sgg")
    if lvl == "emd" and not sgg:
        return None
    items = [{"k": str(r.get("k")), "name": str(r.get("label") or ""), "v": _num(r.get("v"))} for r in p.get("rows") or [] if r.get("k") and r.get("label")]
    main = spec.get("main") or {}
    return {"level": lvl, "sgg": str(sgg) if sgg else None, "unit": _unit(p.get("unit") or main.get("unit")),
            "what": str(main.get("label") or ""), "items": items, "src": "dash"}


def _region_cd(ctx) -> str | None:
    c = getattr(ctx, "context", None) or {}
    cd = str(c.get("region") or "").strip()
    return cd[:5] if cd else None


def _from_blocks(ctx, blocks: list) -> dict | None:
    """읍면동별 차트(줄 = 이름 + 봉투) → 그 시군구 읍면동 코드. 지금 화면 지역 · 이 답이 다룬 지역 경계 이름과 맞는 줄만."""
    charts = [b for b in blocks or [] if isinstance(b, dict) and b.get("type") == "chart" and (b.get("rows") or [])]
    if not charts:
        return None
    acts = ctx.state.get("ui_acts") or []
    cands = [str(a.get("region") or a.get("sgg_cd") or "")[:5] for a in acts if a.get("op") in ("map_flyto", "map_region")]
    cands = [c for c in cands + [_region_cd(ctx)] if c]
    try:
        from landxi_api.regions import emd_index, region_of
    except Exception:  # noqa: BLE001
        return None
    for b in charts:
        for cd in dict.fromkeys(cands):
            r = region_of(cd)
            ix = emd_index(r["sgg_cd"]) if r else None
            if not ix:
                continue
            by = {str(n): c for n, c in zip(ix.names, ix.codes) if n}
            items = []
            for row in b["rows"]:
                lab = str(row.get("label") or "").strip()
                k = by.get(lab)
                if not k:
                    continue
                e = (ctx.envs or {}).get(row.get("env")) if row.get("env") else None
                items.append({"k": str(k), "name": lab, "v": _num((e or {}).get("value")), "env": row.get("env")})
            if items and len(items) >= max(1, len(b["rows"]) // 2):
                u = _unit(next((((ctx.envs or {}).get(it.get("env")) or {}).get("unit") for it in items if it.get("env")), ""))
                what = re.sub(r"^\s*(?:읍면동|시군구)\s*별\s*", "", str(b.get("title") or "")).strip()
                if what in ("개수", "수", "건수", ""):          # 줄 봉투의 뜻('운봉읍 AI 분석 결과 수') → 'AI 분석 결과'
                    m0 = str((ctx.env_meta or {}).get(items[0].get("env")) or "")
                    what = re.sub(r"\s*(?:개수|건수|수)$", "", m0[len(items[0]["name"]):] if m0.startswith(items[0]["name"]) else "").strip()
                return {"level": "emd", "sgg": r["sgg_cd"], "unit": u, "what": what, "items": items, "src": "chart"}
    return None


def _from_acts(ctx) -> dict | None:
    acts = ctx.state.get("ui_acts") or []
    for a in acts:                                         # 말로 거르기('산내면만') — 거른 읍면동만 남긴다
        names = a.get("emd") if a.get("op") == "map_filter" and not a.get("clear") else None
        names = [names] if isinstance(names, str) else names
        cd = _region_cd(ctx)
        if names and cd:
            try:
                from landxi_api.regions import emd_index, region_of
                r = region_of(cd)
                ix = emd_index(r["sgg_cd"]) if r else None
            except Exception:  # noqa: BLE001
                ix = None
            by = {str(n): str(c) for n, c in zip(ix.names, ix.codes) if n} if ix else {}
            items = [{"k": by[n], "name": n, "v": None} for n in names if n in by]
            if items:
                return {"level": "emd", "sgg": r["sgg_cd"], "unit": "", "what": "", "items": items, "src": "act", "mode": "only",
                        "focus": items[0]["k"] if len(items) == 1 else None}
    for a in acts:
        f = a.get("filter") if a.get("op") == "map_on" else None
        if isinstance(f, dict) and f.get("emd_cd"):
            cd = str(f["emd_cd"])
            try:
                from landxi_api.regions import emd_index
                ix = emd_index(cd[:5])
                nm = next((n for n, c in zip(ix.names, ix.codes) if str(c) == cd), None) if ix else None
            except Exception:  # noqa: BLE001
                nm = None
            if nm:
                return {"level": "emd", "sgg": cd[:5], "unit": "", "what": "", "items": [{"k": cd, "name": nm, "v": None}], "src": "act", "mode": "only", "focus": cd}
    for a in acts:
        if a.get("op") in ("map_flyto", "map_region") and (a.get("region") or a.get("sgg_cd")) and not a.get("emd_cd"):
            cd = str(a.get("region") or a.get("sgg_cd"))[:5]
            try:
                from landxi_api.regions import region_of
                r = region_of(cd)
            except Exception:  # noqa: BLE001
                r = None
            if r:
                nm = str(r.get("name") or r.get("sgg_nm") or "").split(" ")[-1]
                if nm:
                    return {"level": "sgg", "sgg": r["sgg_cd"], "unit": "", "what": "", "items": [{"k": r["sgg_cd"], "name": nm, "v": None}], "src": "act"}
    return None


def _scoped(ctx, refs: dict | None) -> dict | None:
    if not refs or not refs.get("items"):
        return None
    try:
        from landxi_api.regions import region_allowed
        p = ctx.principal
        if refs["level"] == "emd":
            if not region_allowed(p, refs.get("sgg")):
                return None
        else:
            refs["items"] = [it for it in refs["items"] if region_allowed(p, it["k"])]
    except Exception:  # noqa: BLE001
        return None
    return refs if refs["items"] else None


async def collect(ctx, blocks: list, answer_md: str) -> dict | None:
    """agent.done 에 실을 map_refs(없으면 None). 지도가 없는 화면 · 영어 답은 0."""
    c = getattr(ctx, "context", None) or {}
    if c.get("has_map") is False or getattr(ctx, "lang", "ko") != "ko" or c.get("country"):
        return None
    refs = ctx.state.get("map_refs")
    base = ctx.state.get("map_refs_base")
    if not refs:
        dash = next((a for a in ctx.state.get("ui_acts") or [] if a.get("op") == "ximap_dash" and isinstance(a.get("spec"), dict)), None)
        refs = (_from_dash(dash["spec"]) if dash else None) or _from_blocks(ctx, blocks) or _from_acts(ctx)
        refs = _scoped(ctx, refs)
        base = refs
    if not refs:
        return None
    md = str(answer_md or "")
    named = [it["k"] for it in refs["items"] if it.get("name") and it["name"] in md]
    if refs.get("all"):
        named = [it["k"] for it in refs["items"]]           # '전체 다시 보기' — 앞 답의 곳 모두
    out = {**refs, "items": refs["items"][:MAX_ITEMS], "named": named[:MAX_ITEMS if refs.get("all") else 24], "mode": refs.get("mode") or "mark", "focus": refs.get("focus"), "run": ctx.run_id}
    r = getattr(ctx, "r", None)
    if r is not None and base:
        try:
            keep = {k: base.get(k) for k in ("level", "sgg", "unit", "what", "src")}
            keep["items"] = [{k: it.get(k) for k in ("k", "name", "v")} for it in base["items"][:MAX_ITEMS]]
            await r.set(_key(ctx.run_id), json.dumps(keep, ensure_ascii=False), ex=TTL)
        except Exception:  # noqa: BLE001
            pass
    return out


# ── 이어 묻기(앞 답 목록 안에서 고르기) ──────────────────────────────────────────────────────
TOP_RX = re.compile(r"(?:가장|제일)\s*(?:큰|많은|높은|넓은|촘촘한)|1\s*위|최대")
LOW_RX = re.compile(r"(?:가장|제일)\s*(?:작은|적은|낮은|좁은|드문)|꼴찌|최소")
TOPN_RX = re.compile(r"(?:상위|위에서|큰\s*순(?:서)?\s*(?:으로)?|많은\s*순(?:서)?\s*(?:으로)?)\s*(\d{1,2})\s*(?:곳|개|군데)?|(\d{1,2})\s*(?:곳|군데)\s*만")
ALL_RX = re.compile(r"^(?:그\s*)?(?:전체|전부|모두|다)\s*(?:다시)?\s*(?:보여\s*(?:줘|주세요)|보기|표시)?\s*[?.!]?$|^다시\s*(?:전체|전부|모두|다)\s*(?:보여\s*(?:줘|주세요)|보기)?\s*[?.!]?$")
REF_RX = re.compile(r"그\s*중|그중|거기서|여기서|이\s*중|이중|앞\s*답|방금")
STOP_RX = re.compile(r"보고서|초안|법령|조문|근거|분석\s*(?:실행|돌려|해\s*줘)|내려\s*받|몇\s*(?:개|건|필지|곳)|얼마|비교|추이|현황|통계|대시\s*보드|요약")
NAME_TAIL = r"\s*(?:만|만요|만\s*(?:보여\s*(?:줘|주세요)|보기|남겨\s*(?:줘|주세요)|강조(?:해\s*줘)?|표시(?:해\s*줘)?)|은|는|쪽|으로|로|은요|는요)?\s*[?.!]?\s*$"


async def _base(ctx) -> dict | None:
    prev = str((getattr(ctx, "context", None) or {}).get("prev_run") or "").strip()
    r = getattr(ctx, "r", None)
    if not prev or r is None:
        return None
    try:
        raw = await r.get(_key(prev))
        return json.loads(raw) if raw else None
    except Exception:  # noqa: BLE001
        return None


def _parse(msg: str, base: dict) -> dict | None:
    t = re.sub(r"\s+", " ", msg or "").strip()
    if not t or len(t) > 32:
        return None
    try:
        from .dash import TASK_WORDS
        if any(re.search(rx, t) for rx, _ in TASK_WORDS):
            return None                                    # 새 업무를 말하면 새 질문(통계 · 요약 길)
    except Exception:  # noqa: BLE001
        pass
    if STOP_RX.search(t):
        return None
    items = base.get("items") or []
    names = sorted({it["name"] for it in items if it.get("name")}, key=len, reverse=True)
    body = REF_RX.sub("", t).strip()
    for nm in names:
        if re.match(r"^" + re.escape(nm) + NAME_TAIL, body):
            return {"pick": "name", "name": nm}
    if ALL_RX.search(body):
        return {"pick": "all"}
    m = TOPN_RX.search(t)
    if m and (REF_RX.search(t) or len(t) <= 14):
        n = int(m.group(1) or m.group(2))
        if 1 <= n <= 20:
            return {"pick": "topn", "n": n}
    valued = any(_num(it.get("v")) is not None for it in items)
    if valued and REF_RX.search(t) or (valued and len(t) <= 16):
        if TOP_RX.search(t):
            return {"pick": "top"}
        if LOW_RX.search(t):
            return {"pick": "low"}
    return None


async def ROUTE(msg: str, ctx):
    c = getattr(ctx, "context", None) or {}
    if c.get("page") != "xi-clean" or getattr(ctx, "lang", "ko") != "ko" or c.get("country"):
        return None
    base = await _base(ctx)
    if not base or not base.get("items"):
        return None
    a = _parse(msg, base)
    if not a:
        return None
    if a["pick"] == "name" and c.get("sets"):
        return None                                        # 결과 층이 켜져 있으면 '○○만' = 지금처럼 말로 거르기(mapsvc) — 거른 읍면동은 collect 가 강조한다
    return {"tool": "map_hl", "args": a, "intent": "map"}


def _fmt(v) -> str:
    if v is None:
        return "—"
    return f"{v:,.0f}" if float(v).is_integer() else f"{v:,.1f}"


async def map_hl(args: dict, ctx) -> Out:
    from landxi_api.envelope import env
    from .. import ToolError
    from ... import talk
    out = Out(source="앞 답의 도구 결과(같은 창)")
    base = await _base(ctx)
    if not base or not base.get("items"):
        raise ToolError("not_found", "앞 답에 고를 곳이 없습니다")
    items = list(base["items"])
    valued = sorted([it for it in items if _num(it.get("v")) is not None], key=lambda it: -float(it["v"]))
    pick = str(args.get("pick") or "")
    unit, what = base.get("unit") or "", base.get("what") or ""
    sel, mode = [], "only"
    if pick == "top" and valued:
        sel = valued[:1]
        out.env("v", f"{sel[0]['name']} {what}".strip(), env(sel[0]["v"], unit or "count", "inferred", "앞 답의 도구 값"))
        out.answer = f"그중 가장 많은 곳은 {sel[0]['name']}입니다 — {(what + ' ') if what else ''}{{{{v}}}}."
    elif pick == "low" and valued:
        sel = valued[-1:]
        out.env("v", f"{sel[0]['name']} {what}".strip(), env(sel[0]["v"], unit or "count", "inferred", "앞 답의 도구 값"))
        out.answer = f"그중 가장 적은 곳은 {sel[0]['name']}입니다 — {(what + ' ') if what else ''}{{{{v}}}}."
    elif pick == "topn" and valued:
        n = max(1, min(20, int(args.get("n") or 3)))
        sel = valued[:n]
        parts = []
        for i, it in enumerate(sel):
            out.env(f"v{i}", it["name"], env(it["v"], unit or "count", "inferred", "앞 답의 도구 값"))
            parts.append(f"{it['name']} {{{{v{i}}}}}")
        out.answer = f"{(what + ' ') if what else ''}많은 {len(sel)}곳은 " + " · ".join(parts) + "입니다."
    elif pick == "name":
        nm = str(args.get("name") or "")
        sel = [it for it in items if it.get("name") == nm][:1]
        if not sel:
            raise ToolError("not_found", f"앞 답에 {nm}이 없습니다")
        if _num(sel[0].get("v")) is not None:
            out.env("v", f"{nm} {what}".strip(), env(sel[0]["v"], unit or "count", "inferred", "앞 답의 도구 값"))
            out.answer = f"{nm}만 지도에 남겼습니다 — {(what + ' ') if what else ''}{{{{v}}}}."
        else:
            out.answer = f"{nm}만 지도에 남겼습니다."
    elif pick == "all":
        sel, mode = items, "mark"
        out.answer = f"앞 답의 {len(items):,}곳을 다시 모두 표시합니다."
    if not sel:
        raise ToolError("not_found", "앞 답에 값이 있는 곳이 없습니다")
    ks = {it["k"] for it in sel}
    ctx.state["map_refs"] = {**{k: base.get(k) for k in ("level", "sgg", "unit", "what", "src")}, "items": sel if mode == "only" else items,
                             "mode": mode, "focus": sel[0]["k"] if len(sel) == 1 else None, "all": pick == "all"}
    ctx.state["map_refs_base"] = base                      # 다음 이어 묻기도 같은 목록에서(고른 것만이 아니라 전체)
    out.data = {"status": "ok", "고른 곳": [it["name"] for it in sel][:10]}
    out.whitelist |= {it["name"] for it in sel}
    if base.get("level") == "emd" and base.get("sgg"):
        await talk.remember(ctx, str(base["sgg"]))
    rest = [it for it in valued if it["k"] not in ks]
    btns = []
    if pick != "low" and len(valued) > 1:
        btns.append(talk.btn("그중 가장 적은 곳", q="그중 가장 적은 곳은?"))
    if pick != "top" and len(valued) > 1:
        btns.append(talk.btn("그중 가장 많은 곳", q="그중 가장 많은 곳은?"))
    if mode == "only" and (rest or len(items) > len(sel)):
        btns.insert(0, talk.btn("전체 다시 보기", q="전체 다시 보기"))      # 하나만 남겼으면 되돌리기가 가장 가까운 일
    talk.set_next(ctx, btns[:3])
    return out


HANDLERS = {"map_hl": map_hl}
