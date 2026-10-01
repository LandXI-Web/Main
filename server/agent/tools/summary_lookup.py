"""summary_lookup — 실제 보유 데이터(서비스 · 지역 · 상태 · 대표 수치)를 요약 API 와 같은 값으로 (fix-agent-scope).

정본은 `landxi_api.summary.build(conn, tenant, region=None, card=None)`(계약: docs/superpowers/final/fix/fix-server-summary.md).
실태조사 수치(의심 필지 suspect · 현장 확인 필요 field_check · 결과 확인 대기)는 요약이 landxi_api.survey.survey_counts 에서 읽는다
— survey_stats 도구 · /survey/stats · 화면과 같은 값(c2-numbers).
그 모듈이 아직 없으면 같은 시그니처 · 같은 응답 모양의 얇은 어댑터(`build_fallback`)가 대신한다 — 요약 모듈이 생기면 코드 변경 없이 그쪽을 쓴다.
어댑터가 쓰는 값: 배포(stage) · config/sets.yaml aliases(배포 → 결과 세트) · detections 실측 개수 · 결과 위치의 시군구 · 영상 카탈로그.
숫자를 지어내지 않는다: 값이 없으면 value=None + note.
"""
from __future__ import annotations

import inspect
import re
import time

from . import Out, ToolError

LX_ALL = "lx"                                          # summary.build 규약: None = 게스트(공개분) · 'lx' = LX 세션(전 기관) · 그 밖 = 그 기관
STAGE = {"ga": "운영", "canary": "시범"}               # 그 밖(draft · shadow · retired)은 요약에 싣지 않는다
STAGE_SAY = {"운영": "운영 중", "시범": "시범 운영 중", "첫 결과 전": "아직 첫 결과 전"}
_SET_SGG: dict[str, tuple[float, str | None]] = {}     # 결과 세트 → 주 시군구(결과 범위 중심이 들어간 시군구) · 10분 캐시
_CARD_CACHE: dict = {"t": 0.0, "rows": []}
# 카드 이름에서 서비스 낱말을 뽑을 때 버리는 일반 낱말(서비스 이름 전체는 DB cards.name 이 정본)
_GENERIC = {"서비스", "행정서비스", "실태조사", "실태", "조사", "탐지", "관리", "분석", "이용", "해외", "국토", "안전", "위험요소", "피해", "판독"}
# 같은 뜻의 흔한 말(띄어쓰기 없앤 문장에 적용)
_SYN = {"해안쓰레기": "해양쓰레기", "바다쓰레기": "해양쓰레기", "해변쓰레기": "해양쓰레기", "해양폐기물": "해양쓰레기"}


def tenant_arg(p) -> str | None:
    """세션 → build 의 tenant 인자(요약 API 와 같은 규약)."""
    if p.realm == "tenant":
        return p.tenant_id
    return LX_ALL if p.realm == "lx" else None


# ── 정본 or 어댑터 ──────────────────────────────────────────────────────
async def build(conn, tenant: str | None, region: str | None = None, card: str | None = None) -> dict:
    try:
        from landxi_api import summary as _s          # fix-server-summary 가 신설 — 있으면 그것이 정본
    except ImportError:
        _s = None
    if _s is not None and hasattr(_s, "build"):
        r = _s.build(conn, tenant, region=region, card=card)
        return await r if inspect.isawaitable(r) else r
    return await build_fallback(conn, tenant, region=region, card=card)


def _env(value, unit, basis, source, note=None, as_of=None):
    from landxi_api.envelope import env
    return env(value, unit, basis, source, note, as_of)


async def _cards(conn) -> list[dict]:
    if time.time() - _CARD_CACHE["t"] < 60 and _CARD_CACHE["rows"]:
        return _CARD_CACHE["rows"]
    rows = await conn.fetch("SELECT id, name, scope FROM cards ORDER BY id")
    out = []
    for r in rows:
        nm = r["name"]
        nm = (nm or {}).get("ko") if isinstance(nm, dict) else nm
        if isinstance(nm, str) and nm.startswith("{"):
            import json
            try:
                nm = (json.loads(nm) or {}).get("ko")
            except Exception:
                pass
        out.append({"id": r["id"], "name": nm or r["id"], "scope": r["scope"]})
    _CARD_CACHE.update(t=time.time(), rows=out)
    return out


def _alias_for(tenant: str, dp_id: str, ver: str | None) -> str | None:
    from landxi_api import config as gcfg
    al = (gcfg.load_yaml("sets") or {}).get("aliases") or {}
    pre = f"results/{tenant}/{dp_id}@"
    if ver and pre + ver in al:
        return al[pre + ver]
    hit = sorted(k for k in al if k.startswith(pre))
    return al[hit[-1]] if hit else None


async def _set_count_and_sgg(set_id: str) -> tuple[int, str | None]:
    """결과 세트의 실측 개수 · 주 시군구(범위 중심을 품은 현행 시군구)."""
    from landxi_api.deps import db
    from landxi_api.regions import regions_base
    async with db(realm="lx") as c:
        row = await c.fetchrow("SELECT count(*) n, ST_X(ST_Centroid(ST_Extent(geom))) x, ST_Y(ST_Centroid(ST_Extent(geom))) y "
                               "FROM detections WHERE job_id=$1 AND edit_state<>'deleted'", set_id)
    n = int(row["n"] or 0)
    cached = _SET_SGG.get(set_id)
    if cached and time.time() - cached[0] < 600:
        return n, cached[1]
    sgg = None
    if n and row["x"] is not None:
        from shapely.geometry import Point
        regs, geoms, _ = regions_base()
        live = {r["sgg_cd"] for r in regs}
        pt = Point(float(row["x"]), float(row["y"]))
        for cd, g in geoms.items():
            if cd in live and g is not None and g.contains(pt):
                sgg = cd
                break
    _SET_SGG[set_id] = (time.time(), sgg)
    return n, sgg


async def build_fallback(conn, tenant: str | None, region: str | None = None, card: str | None = None) -> dict:
    """요약 API 계약 모양({as_of, items[]}) — conn 은 호출자 RLS 연결(배포 · 카드), tenant='lx' 이면 LX(전국)."""
    from landxi_api.envelope import now_iso, today
    from landxi_api.regions import derived, in_scope, regions_base, tenant_scope
    regs, _, _ = regions_base()
    by_cd = {r["sgg_cd"]: r for r in regs}
    prev = {r.get("prev_cd"): r["sgg_cd"] for r in regs if r.get("prev_cd")}
    region = prev.get(region, region)
    cards = {c["id"]: c for c in await _cards(conn)}
    dps = await conn.fetch("SELECT id, tenant_id, card_id, card_version_id, stage, sgg_cd, coalesce(test,false) AS test FROM deploys ORDER BY id")
    dv = await derived()
    at = now_iso()
    items = []
    for d in dps:
        if d["test"] or d["stage"] not in STAGE:
            continue
        if tenant not in (None, LX_ALL) and d["tenant_id"] != tenant:
            continue
        if card and d["card_id"] != card:
            continue
        ver = (d["card_version_id"] or "").split("@")[-1] if "@" in (d["card_version_id"] or "") else None
        set_id = _alias_for(d["tenant_id"], d["id"], ver)
        n, sgg = (await _set_count_and_sgg(set_id)) if set_id else (0, None)
        sgg = d["sgg_cd"] or sgg
        if not sgg:                                   # 결과가 없으면 배포 범위 ∩ 그 기관 관할이 하나일 때만
            sc = tenant_scope(d["tenant_id"])
            hits = [cd for cd, ds in dv["dp"].items() if any(x["id"] == d["id"] for x in ds) and cd in by_cd and sc and in_scope(cd, sc)]
            sgg = hits[0] if len(hits) == 1 else None
        if region and sgg != region:
            continue
        r = by_cd.get(sgg) or {}
        imgs = dv["img"].get(sgg) or []
        src = "AI 탐지 결과 전체(결과 확인 전)"
        stage = STAGE[d["stage"]] if n else "첫 결과 전"
        items.append({
            "card": d["card_id"], "card_name": (cards.get(d["card_id"]) or {}).get("name") or d["card_id"],
            "sgg_cd": sgg, "region_name": r.get("full"), "tenant": d["tenant_id"], "stage": stage,
            "imagery": {"has": bool(imgs), "label": (imgs[0].get("name") if imgs else None)},
            "metrics": {
                "detected": {**_env(n if set_id else None, "count", "inferred", src, None if set_id else "결과 없음", at), "label": "AI 탐지"},
                "suspect": {**_env(None, "count", "inferred", "실태조사 결과", "요약 모듈 연결 전 — 집계하지 않음", at), "label": "의심 필지"},
                "field_check": {**_env(None, "필지", "inferred", "실태조사 결과", "요약 모듈 연결 전 — 집계하지 않음", at), "label": "현장 확인 필요"},
                "review_pending": {**_env(None, "count", "inferred", "결과 확인 대기", "요약 모듈 연결 전 — 집계하지 않음", at), "label": "결과 확인 대기"},
                "reports": {**_env(None, "count", "recorded", "기관 신고", "요약 모듈 연결 전 — 집계하지 않음", at), "label": "기관 신고"},
            },
            "_set": set_id,
        })
    return {"as_of": today(), "items": items, "adapter": "fallback"}


# ── 질문 → 지역 · 서비스 ────────────────────────────────────────────────
def match_regions(text: str) -> list[dict]:
    """문장 속 시군구(이름 · 어간) — runner.scope_guard 와 같은 규칙. 같은 이름이 여러 시도에 있으면 []."""
    from landxi_api.regions import regions_base
    t = re.sub(r"\s+", " ", text or "")
    regs, _, _ = regions_base()
    hits = []
    for r in regs:
        nm = r["name"] or ""
        city = nm.split(" ")[0]
        for key in {nm, city}:
            if not key:
                continue
            stem = key[:-1] if len(key) >= 3 and key[-1] in "시군" else None
            if re.search(r"(^|[\s·,(])" + re.escape(key), t) or (stem and re.search(r"(^|[\s·,(])" + re.escape(stem) + r"(?![가-힣]{2,}[시군구])", t)):
                hits.append({**r, "_key": key})
                break
    by_key: dict = {}
    for h in hits:
        by_key.setdefault(h["_key"], set()).add((h["full"] or "").split(" ")[0])
    if any(len(v) > 1 for v in by_key.values()):
        return []
    return hits


def card_words(cards: list[dict]) -> dict[str, str]:
    """{서비스 낱말: card_id} — DB 카드 이름에서(일반 낱말 제외 · 두 글자 이상)."""
    out: dict[str, str] = {}
    for c in cards:
        nm = re.sub(r"\(.*?\)", " ", c["name"] or "")
        for w in re.split(r"[\s·,/]+", nm):
            w = w.strip()
            if len(w) < 2 or w in _GENERIC:
                continue
            out.setdefault(w, c["id"])
            if w.endswith("관리") and len(w) >= 4:
                out.setdefault(w[:-2], c["id"])
    return out


def match_card(text: str, cards: list[dict]) -> str | None:
    t = re.sub(r"\s+", "", text or "")
    for a, b in _SYN.items():
        t = t.replace(a, b)
    words = card_words(cards)
    found = {cid for w, cid in words.items() if w in t}
    return next(iter(found)) if len(found) == 1 else None


# ── 도구 핸들러 ─────────────────────────────────────────────────────────
async def summary_lookup(args: dict, ctx) -> Out:
    from landxi_api.deps import db
    from landxi_api.regions import regions_base
    p = ctx.principal
    region, card = args.get("region"), args.get("card")
    regs, _, _ = regions_base()
    by_cd = {r["sgg_cd"]: r for r in regs}
    sgg = None
    if region:
        region = str(region).strip()
        if re.fullmatch(r"\d{5}", region):
            sgg = region
        else:
            m = match_regions(region if region.endswith(("시", "군", "구")) or " " in region else region + " ")
            m = m or match_regions(region)
            if not m:
                raise ToolError("not_found", "해당 지역 데이터가 없습니다", 404)
            sgg = m[0]["sgg_cd"]
    async with db(p) as conn:
        cards = await _cards(conn)
        if card and card not in {c["id"] for c in cards}:
            card = match_card(str(card), cards)
        res = await build(conn, tenant_arg(p), region=sgg, card=card)
    items = [it for it in (res.get("items") or [])]
    out = Out(source="요약(서비스 · 지역 · 상태)")
    rows = []
    for k, it in enumerate(items[:8]):
        mk = {}
        for key, e in (it.get("metrics") or {}).items():
            if isinstance(e, dict) and e.get("value") is not None:
                env = {x: e[x] for x in ("value", "unit", "basis", "as_of", "source", "note") if x in e}
                mk[key] = out.env(f"i{k}_{key}", f"{it.get('region_name') or ''} {it.get('card_name') or ''} · {e.get('label') or key}".strip(), env)
                mk[key + "_label"] = e.get("label") or key
        rows.append({"서비스": it.get("card_name"), "지역": it.get("region_name"), "상태": it.get("stage"),
                     "영상": (it.get("imagery") or {}).get("label") if (it.get("imagery") or {}).get("has") else "없음", "수치": mk})
        for w in (it.get("region_name") or "", it.get("card_name") or ""):
            out.whitelist |= set(re.findall(r"\d[\d,.]*", w))
    out.data = {"결과": rows, "기준일": res.get("as_of")}
    out.raw = {"items": items, "sgg": sgg, "card": card}
    # 한 지역으로 모이면 지도를 그 시군구로(범위 bbox · 없으면 중심)
    cds = {it.get("sgg_cd") for it in items if it.get("sgg_cd") and it.get("stage") != "첫 결과 전"} or         {it.get("sgg_cd") for it in items if it.get("sgg_cd")}           # 결과가 없으면(항목 0) 지도는 그대로
    if len(cds) == 1:
        r = by_cd.get(next(iter(cds))) or {}
        if r.get("bbox") or r.get("center"):
            out.ui_actions.append({"op": "map_flyto", "bbox": r.get("bbox"), "center": r.get("center"), "region": r.get("sgg_cd")})
    return out


def say(items: list[dict], ids_by_item: list[dict], asked_region: bool) -> str:
    """결정적 답 문장(런타임 · LLM 호출 0) — 숫자는 {{env:eN}} 자리표로만(칩이 단위를 낸다)."""
    if not items:
        return "해당 지역 데이터가 없습니다"
    if len(items) == 1:
        it, ids = items[0], ids_by_item[0]
        head = f"{it.get('region_name') or ''} {it.get('card_name') or ''}".strip()
        s = f"{head}는 {STAGE_SAY.get(it.get('stage'), it.get('stage') or '')}입니다."
        nums = [f"{lab} {{{{env:{eid}}}}}" for lab, eid in ids.get("nums", [])]
        if nums:
            s += " " + " · ".join(nums) + "입니다."
        return s
    pairs = [(it, ids) for it, ids in zip(items, ids_by_item) if it.get("stage") != "첫 결과 전"]    # '결과가 있는 서비스'만
    if not pairs:
        return "해당 지역 데이터가 없습니다"
    if len(pairs) == 1:
        return say([pairs[0][0]], [pairs[0][1]], asked_region)
    parts = []
    one = len({it.get("sgg_cd") for it, _ in pairs}) == 1             # 한 지역이면 지역 이름은 한 번만(확인 16차 규칙 ⑥ — 짧게)
    lead = (pairs[0][0].get("region_name") or "").split(" ")[-1] if one else ""
    for it, ids in pairs[:6]:
        lab = (it.get("card_name") or "") if one else f"{it.get('region_name') or ''} {it.get('card_name') or ''}".strip()
        det = next((eid for l, eid in ids.get("nums", []) if l == "AI 탐지"), None)
        parts.append(f"{lab}({STAGE_SAY.get(it.get('stage'), it.get('stage') or '')}" + (f" · AI 탐지 {{{{env:{det}}}}})" if det else ")"))
    more = " 등" if len(pairs) > 6 else ""
    return (f"{lead}에서 " if lead else "") + "결과가 있는 서비스는 " + ", ".join(parts) + more + "입니다."
