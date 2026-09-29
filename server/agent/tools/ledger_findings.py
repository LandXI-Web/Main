"""도구 ledger_findings(F3 §3 S-10) — 대장 × AI × V-World 가 어긋난 필지(규칙 L-*) · 개수 봉투 · 읍면동별 · 지도 도착.

읍면동 집계(by=emd · 기본 상위 8, by=emd 면 상위 20)는 봉투로만 내고, 두 곳 이상이면 명령 바 막대 차트 블록(plan 3.3 · 값 = 봉투 key)을 붙인다.

대장이 없으면 '이 기관에 농지대장이 없습니다 → 올리기' 한 줄(의심 0 · 지어내지 않음). 타 기관 403.
"""
from __future__ import annotations

from . import Out, ToolError
from . import scope as S
from .ledger_ingest import KIND_KO, latest_import, tenant_for

RULE_KIND = {"L1": "farm_ledger", "L2": "farm_ledger", "L3": "dev_permit"}


def _rule_name(rid: str) -> str:
    """규칙 이름(규칙 파일) — 화면·답에는 코드(L1) 대신 이름."""
    try:
        from landxi_api.ledger import ledger_rules
        return (ledger_rules().get(rid) or {}).get("name") or "대장과 다른 필지"
    except Exception:
        return "대장과 다른 필지"


def chart_block(title: str, by_emd: list[dict]) -> dict | None:
    """막대 차트 블록 — 값은 봉투 key 로만(숫자 직접 금지). 읍면동이 두 곳 이상일 때만."""
    if len(by_emd) < 2:
        return None
    return {"kind": "bar", "title": title, "rows": [{"label": r["읍면동"], "env": r["건수"]} for r in by_emd]}


async def emd_rows(ctx, out: Out, import_id: str, rid: str, rn: str, top: int) -> list[dict]:
    """읍면동별 어긋난 필지 수(GET /survey/stats?by=emd&ledger=) → 봉투 emd_n + 차트 블록."""
    st = await ctx.http.get("/survey/stats", params={"by": "emd", "ledger": import_id})
    by_emd: list[dict] = []
    if st.status_code != 200:
        return by_emd
    rows = [x for x in st.json().get("items") or [] if ((x.get("ledger_findings") or {}).get(rid) or {}).get("value")]
    rows.sort(key=lambda x: -x["ledger_findings"][rid]["value"])
    for i, x in enumerate(rows[:top], 1):
        out.env(f"emd_{i}", f"{x['key']} {rn}", x["ledger_findings"][rid])
        by_emd.append({"읍면동": x["key"], "건수": f"emd_{i}"})
    ch = chart_block(f"읍면동별 {rn}", by_emd)
    if ch is not None and hasattr(out, "blocks"):
        out.blocks.append({"type": "chart", **ch})
    return by_emd


async def ledger_findings(args: dict, ctx) -> Out:
    tenant = tenant_for(ctx, args)
    rid = (args.get("rule_id") or args.get("rule") or "L1").upper()
    kind = RULE_KIND.get(rid, "farm_ledger")
    imp = None
    if args.get("import_id"):                             # 화면의 대장(context.ledger) — 규칙 종류가 같을 때만
        imp = await latest_import(ctx, tenant, None, str(args["import_id"]))
        if imp and imp.get("kind") and imp.get("kind") != kind:
            imp = None
    imp = imp or await latest_import(ctx, tenant, kind)
    out = Out(source="GET /api/v1/survey/findings?ledger=latest")
    if not imp or imp.get("state") != "matched":
        out.data = {"안내": f"이 기관에 {KIND_KO.get(kind, '대장')}이 없습니다 → 올리기" if not imp else "대장을 필지에 이어 붙이는 중입니다"}
        out.ui_actions.append({"op": "drawer_open", "kind": "ledger", "tab": "upload"})
        return out
    ai = imp.get("ai") if isinstance(imp.get("ai"), dict) else None
    if ai is not None and not ai.get("has"):              # 대장은 붙었지만 그 시군구에 AI 결과가 없다 — 0 필지가 아니라 'AI 분석 전'
        names = [x.get("name") for x in ai.get("sgg") or [] if x.get("name")] or [x.get("name") for x in imp.get("sgg") or [] if x.get("name")]
        out.data = {"대장": KIND_KO.get(kind), "지역": names, "상태": "AI 분석 전",
                    "안내": "이 지역은 아직 AI 분석 결과가 없어 대장과 대조하지 못했습니다(영상 등록 · 전역 분석 뒤 자동 대조)"}
        out.env("rows", "올린 대장 행 수", imp["rows"])
        return out
    top = max(1, min(int(args.get("top") or 10), 50))
    res = await ctx.http.get("/survey/findings", params={"rule": rid, "ledger": imp["import_id"], "sort": "score", "limit": 200})
    if res.status_code == 403:
        raise ToolError("tool_forbidden", "이 기관의 데이터가 아닙니다", 403)
    if res.status_code >= 400:
        raise ToolError("upstream_error", "의심 목록을 읽지 못했습니다", res.status_code)
    j = res.json()
    items = j.get("items") or []
    rn = _rule_name(rid)
    out.env("total", f"{rn} 필지(올린 대장 × AI 대조 · 조건에 맞는 전체)", {**(j["total"] or {}), "unit": "필지"})   # 규칙 결과 = 필지당 1건
    out.env("shown", "그중 지도에 표시한 필지(근거 면적 상위 · 표시 상한)", {"value": min(top, len(items)), "unit": "필지", "basis": "measured",
                                                         "as_of": (j["total"] or {}).get("as_of"), "source": "GET /api/v1/survey/findings · 상위", "note": "반환 행 수"})
    by_emd = await emd_rows(ctx, out, imp["import_id"], rid, rn, 20 if str(args.get("by") or "").lower() == "emd" else 8)
    feats, xs, ys, rows_out = [], [], [], []
    from .survey import _geoms
    geo = await _geoms(ctx, [it["pnu"] for it in items[:top]])          # 필지 폴리곤(사용자 RLS) — 없으면 대표점
    for n, it in enumerate(items[:top], 1):
        ll = it.get("lnglat") or [None, None]
        addr = S.short_addr(it.get("addr"))
        k = f"evid_{n}"
        out.env(k, f"[{n}] AI 근거 면적", it["evid_m2"])
        rows_out.append({"n": n, "pnu": it["pnu"], "주소": addr, "지목": it.get("jimok"), "근거면적": k, "등급": it.get("priority")})
        for t in (addr, it["pnu"]):
            for m in __import__("re").findall(r"\d+(?:-\d+)?", str(t)):
                out.whitelist.add(m)
        if ll[0] is not None:
            bb = [ll[0] - 0.0006, ll[1] - 0.0005, ll[0] + 0.0006, ll[1] + 0.0005]
            xs += [bb[0], bb[2]]
            ys += [bb[1], bb[3]]
            out.citations.append({"kind": "parcel", "pnu": it["pnu"], "finding_id": it["id"], "addr": addr, "bbox": bb, "center": ll,
                                  "rule": rid, "set": "survey/findings", "sgg_cd": str(it["pnu"])[:5], "import_id": imp["import_id"],
                                  "label": f"{addr} · {rn}", "env_keys": [k]})
            g = (geo.get(it["pnu"]) or {})
            if g.get("_bbox"):
                bb = g["_bbox"]
                xs[-2:], ys[-2:] = [bb[0], bb[2]], [bb[1], bb[3]]
            feats.append({"type": "Feature", "geometry": g.get("_geom") or {"type": "Point", "coordinates": ll},
                          "properties": {"n": n, "pnu": it["pnu"], "rule": rid, "priority": it.get("priority")}})
    sggs = sorted({str(it.get("pnu") or "")[:5] for it in items if it.get("pnu")})
    out.data = {"조건": rn, "대장": KIND_KO.get(kind), "지역": [S.name_of(c) or c for c in sggs], "items": rows_out, "읍면동별": by_emd,
                "비고": "대장 × AI 분석 × 연속지적 대조 · 검수 전 · 위법 판정 아님"}
    out.citations.insert(0, {"kind": "list", "rule": rid, "import_id": imp["import_id"], "sgg_cd": sggs[0] if len(sggs) == 1 else None,
                             "label": f"{rn} · {KIND_KO.get(kind)} 대조", "env_keys": ["total"]})
    if xs:
        out.raw = {"bbox": [min(xs), min(ys), max(xs), max(ys)], "features": feats, "count_key": "shown", "total_key": "total", "set": "survey/findings",
                   "filter": {"rule": rid, "ledger": imp["import_id"], "sgg_cd": sggs[0] if len(sggs) == 1 else None, "sgg_cds": sggs},
                   "label": f"에이전트 질의 · {rn} · 저장 안 됨"}
    return out
