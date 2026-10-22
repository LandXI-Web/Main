"""물은 종류의 결과를 이 계정이 볼 수 있는 서비스에서 찾기(시안 ⓑ-1 층 저절로 켜기 · 원칙 312 물은 범위대로 · 10-22 확인).

  svc_for(ctx, cls)            기관 계정 — 받은 서비스(운영 · 시범) 가운데 그 종류(같은 뜻 묶음) 결과가 있는 서비스 하나
                               → {card, name, sets, classes} | None. 권한 = 기관 공간과 같은 판정(받은 서비스 · 부서 범위 · 관할).
  svc_stats(ctx, card)         그 서비스의 종류별 · 읍면동별 수 · 넓이 — 기관 통계 화면(GET /spaces/me/guides/{card}/class-stats)과 같은 값(숫자 한 출처).
  answer(ctx, cls, t)          켜진 층에 그 종류가 없을 때의 답 — 층을 켜는 지도 동작 + '○○ 층을 켜고 셌습니다' + 숫자 + 보고서 단추.
                               볼 수 있는 결과에 그 종류가 없으면 '공유된 ○○ 결과가 없습니다 — 분석 요청으로 맡길 수 있습니다'.
  report_btn(ctx, cls)         기관 XI ChatGEO 에서 그 종류를 물으면 그 서비스 보고서를 여는 단추(10-22 ChatGEO-경작지보고서열기 ⓐ).
지역 · 서비스 이름 고정값 0(서비스 표 · 결과 설명서 · 결과 행에서 읽는다). LLM 0.
"""
from __future__ import annotations

import re
import time

from .tools import Out

_CACHE: dict = {}
TTL = 300
REPORT_HREF = "/landxi/v3/gov-report/?service={card}&tab=report"
REQUEST_HREF = "/landxi/v3/gov-request/"


def _family(names: set[str]) -> set[str]:
    try:
        from .scopecheck import family
        return family(set(names))
    except Exception:  # noqa: BLE001
        return set(names)


async def _services(p) -> list[dict]:
    """기관이 받은 서비스 중 결과가 있는 것 — [{card, name, sets, classes}] (5분 보관 · 기관 · 사람마다)."""
    key = ("svc", getattr(p, "tenant_id", None), getattr(p, "user_id", None))
    c = _CACHE.get(key)
    if c and time.time() - c[0] < TTL:
        return c[1]
    out = []
    try:
        from landxi_api import spaces as SP
        from landxi_api.deps import db
        svcs = await SP._visible(p, await SP.received(p.tenant_id))
        for s in svcs:
            if s.get("status") == "첫 결과 전":
                continue
            try:
                _svc, g, _rows = await SP._guide_or_404(p, s["card"])
            except Exception:  # noqa: BLE001
                continue
            sets = [str(x) for x in (g.get("body") or {}).get("sets") or [] if x]
            if not sets:
                continue
            async with db(realm="lx") as conn:
                cls = [r["cls"] for r in await conn.fetch(
                    "SELECT DISTINCT cls FROM detections WHERE job_id = ANY($1::text[]) AND edit_state <> 'deleted' AND cls IS NOT NULL", sets)]
            out.append({"card": s["card"], "name": s.get("name") or "", "sets": sets, "classes": cls})
    except Exception:  # noqa: BLE001
        out = []
    _CACHE[key] = (time.time(), out)
    return out


def _cls_ko(c: str) -> str:
    try:
        from landxi_api.spaces import class_ko
        return class_ko(c)
    except Exception:  # noqa: BLE001
        return c


async def svc_for(ctx, cls: str) -> dict | None:
    p = getattr(ctx, "principal", None)
    if getattr(p, "realm", None) != "tenant" or not cls:
        return None
    want = _family({cls})
    for s in await _services(p):
        names = {_cls_ko(c) for c in s["classes"]}
        try:
            from .scopecheck import classes_in
            norm = set().union(*[classes_in(n) or {n} for n in names]) if names else set()
        except Exception:  # noqa: BLE001
            norm = names
        if norm & want:
            return s
    return None


async def svc_by_name(ctx, word: str) -> dict | None:
    """서비스 이름에 그 말이 든 서비스('해양쓰레기' → 해양쓰레기 분석서비스) — 결과 종류 이름이 영어 코드인 서비스(Styrofoam …)도 찾게."""
    p = getattr(ctx, "principal", None)
    if getattr(p, "realm", None) != "tenant" or not word:
        return None
    for s in await _services(p):
        if word in re.sub(r"\s+", "", s["name"]):
            return s
    return None


async def svc_stats(ctx, card: str) -> dict | None:
    """기관 통계 화면과 같은 값 — 사용자 토큰으로 GET /spaces/me/guides/{card}/class-stats(권한 그대로)."""
    http = getattr(ctx, "http", None)
    if http is None:
        return None
    try:
        r = await http.get(f"/spaces/me/guides/{card}/class-stats")
        if r.status_code != 200:
            return None
        return r.json()
    except Exception:  # noqa: BLE001
        return None


EMD_RX = re.compile(r"읍면동|동네|읍\s*면\s*별|면\s*별|순위|많은\s*곳|상위")
EXTREME_RX = re.compile(r"(?:제일|가장)\s*(?:큰|작은|넓은|좁은)|최대|최소")
AREA_RX = re.compile(r"면적|넓이|얼마나\s*넓|㎡|헥타르|ha\b|㏊")


async def answer(ctx, cls: str, t: str, region_name: str | None = None) -> Out | None:
    """켜진 층에 물은 종류가 없을 때 — 볼 수 있는 서비스 결과로 답(층 저절로 켜기). 기관 계정이 아니면 None(지금 답 그대로)."""
    from landxi_api.envelope import env
    from . import talk
    p = getattr(ctx, "principal", None)
    if getattr(p, "realm", None) != "tenant":
        return None
    if len(talk.home_all(ctx)) > 1:
        return None                                       # 여러 시군을 맡은 기관 — 서비스 통계가 관할 전체 값이라 한 시군 이름으로 쓰지 않는다(지금 답 그대로 · '우리 시' 규칙)
    place = region_name or (talk.here(ctx) or {}).get("name") or "우리 시"
    out = Out(source="서비스 결과(기관 통계 화면과 같은 값)")
    s = await svc_for(ctx, cls)
    if not s:
        return None                                       # 받은 서비스에 그 종류가 없으면 지금 답 그대로(지도 결과 층에 있을 수 있다 — 없다고 단정하지 않는다)
    if EXTREME_RX.search(t or ""):
        return None                                       # '제일 큰 · 작은 것'은 서비스 통계(합 · 읍면동 칸)로 답할 수 없다 — 지금 답 그대로
    st = await svc_stats(ctx, s["card"])
    if not st or not st.get("classes"):
        return None
    try:                                                  # 읍면동을 말했으면 그 읍면동 칸만(시 전체 숫자로 답하지 않는다 · WP-1)
        from .scopecheck import asked_scope
        em = (await asked_scope(ctx, t)).get("emd") or []
    except Exception:  # noqa: BLE001
        em = []
    if em:
        row = next((e for e in st.get("emds") or [] if e.get("emd") == em[0]), None)
        if not row:
            return None
        st = {**st, "classes": [{"name": k, **v} for k, v in (row.get("by") or {}).items()],
              "total": {"n": row.get("n"), "area": row.get("area")}, "emds": []}
        place = f"{place} {em[0]}"
    unit = st.get("unit") or "건"
    svc = re.sub(r"\s*분석\s*서비스$", "", s["name"]) or s["name"]
    rows = st["classes"]
    want = _family({cls})
    try:
        from .scopecheck import classes_in
        hit = [c for c in rows if (classes_in(c["name"]) or {c["name"]}) & want]
    except Exception:  # noqa: BLE001
        hit = [c for c in rows if c["name"] == cls]
    area = bool(AREA_RX.search(t or ""))
    parts = []
    for i, c in enumerate(rows[:4]):
        v = c.get("area") if area else (c.get("n") or c.get("area"))
        if not v:
            continue
        if area and isinstance(v, dict) and v.get("unit") == "m2" and v.get("value") is not None:
            v = env(round(float(v["value"]) / 10000, 1), "ha", v.get("basis") or "measured", v.get("source") or "서비스 결과", as_of=v.get("as_of"))
        out.env(f"c{i}", f"{place} {s['name']} {c['name']} {'넓이' if area else '수'}", v,
                scope={"cls": [c["name"]], "kind": "det", "emd": (em[:1] or None)})
        parts.append(f"{c['name']} {{{{c{i}}}}}")
    tot = (st.get("total") or {}).get("area" if area else "n")
    if tot and len(rows) > 1:
        if area and isinstance(tot, dict) and tot.get("unit") == "m2" and tot.get("value") is not None:
            tot = env(round(float(tot["value"]) / 10000, 1), "ha", tot.get("basis") or "measured", tot.get("source") or "서비스 결과", as_of=tot.get("as_of"))
        out.env("tot", f"{place} {s['name']} 결과 {'넓이' if area else '수'} 모두", tot, scope={"cls": sorted({c['name'] for c in rows}), "kind": "det", "emd": (em[:1] or None)})
    if not parts:
        return None
    if EMD_RX.search(t or "") and st.get("emds"):               # '경작지 읍면동별로 세어 줘' — 같은 통계(기관 통계 화면 읍면동별 칸)
        want_names = {c["name"] for c in hit} or {c["name"] for c in rows}
        ems = []
        for e in st["emds"]:
            if e.get("out"):
                continue
            v = None
            by = e.get("by") or {}
            vals = [by[k].get("area" if area else "n") for k in by if k in want_names]
            vals = [x for x in vals if isinstance(x, dict) and x.get("value") is not None]
            if vals:
                v = {**vals[0], "value": round(sum(float(x["value"]) for x in vals), 1)}
            if v and v.get("value"):
                if area and v.get("unit") == "m2":
                    v = env(round(float(v["value"]) / 10000, 1), "ha", v.get("basis") or "measured", v.get("source") or "서비스 결과", as_of=v.get("as_of"))
                ems.append((e["emd"], v))
        ems.sort(key=lambda x: -float(x[1]["value"]))
        if ems:
            out.envelopes.clear()
            brows = []
            for i, (nm, v) in enumerate(ems[:12]):
                out.env(f"m{i}", f"{nm} {' · '.join(sorted(want_names))} {'넓이' if area else '수'}", v, scope={"emd": [nm], "cls": sorted(want_names), "kind": "det"})
                brows.append({"label": nm, "env": f"m{i}"})
            out.blocks.append({"type": "chart", "kind": "bar", "title": f"읍면동별 {' · '.join(sorted(want_names))}", "rows": brows})
            parts = [f"{nm} {{{{m{i}}}}}" for i, (nm, _v) in enumerate(ems[:5])]
    layer_word = hit[0]["name"] if hit else cls
    on_now = set(str(x) for x in ((getattr(ctx, "context", None) or {}).get("sets") or []))
    already = bool(on_now & set(s["sets"]))
    lead = f"켜진 {layer_word} 층으로 셌습니다." if already else f"{layer_word} 층을 켜고 셌습니다."
    by_emd = any(k.startswith("m") for k, _m, _e in out.envelopes)
    body = (f"{place} {svc} 서비스 결과 읍면동별(많은 곳부터) — " + " · ".join(parts) + "." if by_emd else
            f"{place} {svc} 서비스 결과 — " + " · ".join(parts) + (" (모두 {{tot}})" if tot and len(rows) > 1 else "") + ".")
    out.answer = lead + " " + body
    if not already:
        out.ui_actions.append({"op": "map_layer", "layer": "results", "on": True, "add": True, "sets": s["sets"]})
    out.scope = {"cls": sorted({c["name"] for c in rows}), "kind": "det", "emd": (em[:1] or None)}
    out.data = {"status": "ok", "서비스": s["name"], "단위": unit, "켠 층": layer_word}
    if not already:
        ctx.state["act_claims"] = [lead]
    ctx.state["svc_src"] = {"name": s["name"], "unit": unit}
    ctx.state["scope_sets"] = list(s["sets"])
    talk.set_next(ctx, [talk.btn(f"{svc} 보고서 열기", href=REPORT_HREF.format(card=s["card"])),
                        talk.btn(f"{layer_word} 읍면동별로 보기", q=f"{layer_word} 읍면동별로 세어 줘")], front=True)
    return out


async def report_btn(ctx, cls_set: set[str]) -> dict | None:
    """기관 XI ChatGEO 에서 물은 종류의 서비스 보고서 단추(없으면 None)."""
    from . import talk
    p = getattr(ctx, "principal", None)
    if getattr(p, "realm", None) != "tenant" or not cls_set:
        return None
    for c in sorted(cls_set):
        s = await svc_for(ctx, c)
        if s:
            svc = re.sub(r"\s*분석\s*서비스$", "", s["name"]) or s["name"]
            return talk.btn(f"{svc} 보고서 열기", href=REPORT_HREF.format(card=s["card"]))
    return None
