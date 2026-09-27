"""도구 ledger_findings(F3 §3 S-10) — 대장 × AI × V-World 가 어긋난 필지(규칙 L-*) · 개수 봉투 · 읍면동별 · 지도 도착.

대장이 없으면 '이 기관에 농지대장이 없습니다 → 올리기' 한 줄(의심 0 · 지어내지 않음). 타 기관 403.
"""
from __future__ import annotations

from . import Out, ToolError
from .ledger_ingest import KIND_KO, latest_import, tenant_for

RULE_KIND = {"L1": "farm_ledger", "L2": "farm_ledger", "L3": "dev_permit"}


async def ledger_findings(args: dict, ctx) -> Out:
    tenant = tenant_for(ctx, args)
    rid = (args.get("rule_id") or args.get("rule") or "L1").upper()
    kind = RULE_KIND.get(rid, "farm_ledger")
    imp = await latest_import(ctx, tenant, kind)
    out = Out(source="GET /api/v1/survey/findings?ledger=latest")
    if not imp or imp.get("state") != "matched":
        out.data = {"안내": f"이 기관에 {KIND_KO.get(kind, '대장')}이 없습니다 → 올리기"}
        out.ui_actions.append({"op": "drawer_open", "kind": "ledger", "tab": "upload"})
        return out
    top = max(1, min(int(args.get("top") or 10), 50))
    res = await ctx.http.get("/survey/findings", params={"rule": rid, "ledger": imp["import_id"], "sort": "score", "limit": 200})
    if res.status_code == 403:
        raise ToolError("tool_forbidden", "이 기관의 데이터가 아닙니다", 403)
    if res.status_code >= 400:
        raise ToolError("upstream_error", "의심 목록을 읽지 못했습니다", res.status_code)
    j = res.json()
    items = j.get("items") or []
    out.env("total", f"규칙 {rid} · 대장과 다른 필지", j["total"])
    st = await ctx.http.get("/survey/stats", params={"by": "emd", "ledger": imp["import_id"]})
    by_emd = []
    if st.status_code == 200:
        rows = [x for x in st.json().get("items") or [] if ((x.get("ledger_findings") or {}).get(rid) or {}).get("value")]
        rows.sort(key=lambda x: -x["ledger_findings"][rid]["value"])
        for i, x in enumerate(rows[:8], 1):
            out.env(f"emd_{i}", f"{x['key']} 규칙 {rid} 의심", x["ledger_findings"][rid])
            by_emd.append({"읍면동": x["key"], "건수": f"emd_{i}"})
    feats, xs, ys, rows_out = [], [], [], []
    for n, it in enumerate(items[:top], 1):
        ll = it.get("lnglat") or [None, None]
        addr = str(it.get("addr") or "").replace("전북특별자치도 ", "")
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
                                  "rule": rid, "label": f"{addr} · {rid}", "env_keys": [k]})
            feats.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": ll},
                          "properties": {"n": n, "pnu": it["pnu"], "rule": rid, "priority": it.get("priority")}})
    out.data = {"규칙": rid, "대장": KIND_KO.get(kind), "items": rows_out, "읍면동별": by_emd,
                "비고": "대장 × AI 판독 × V-World 연속지적 대조 · 검수 전 · 위법 판정 아님"}
    out.citations.insert(0, {"kind": "list", "rule": rid, "label": f"규칙 {rid} · {KIND_KO.get(kind)} 대조", "env_keys": ["total"]})
    if xs:
        out.raw = {"bbox": [min(xs), min(ys), max(xs), max(ys)], "features": feats, "count_key": "total", "total_key": "total",
                   "filter": {"rule": rid, "ledger": imp["import_id"]}, "label": f"에이전트 질의 · 규칙 {rid} · 저장 안 됨"}
    return out
