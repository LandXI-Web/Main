"""도구 parcel_lookup(F3 §3 S-10 · F3-AG) — 지번 또는 PNU → 필지 1(대장 · AI · 이력). 관할 밖이면 거절.

지번 해석은 서버 대장 매칭과 같은 사다리(landxi_api.ledger.parse_jibun + 연속지적 색인). 소유자 성명 0.
"""
from __future__ import annotations

import re

from . import Out, ToolError
from . import scope as S


def _rule_nm(f: dict) -> str:
    """규칙 이름(코드 R1 · L1 대신) — 결과 행의 이름 → 대장 규칙 파일 이름 → 일반 이름."""
    nm = f.get("rule_nm") or f.get("rule_name") or (f.get("explain") or {}).get("name")
    if nm:
        return str(nm)
    rid = str(f.get("rule") or "")
    if rid.startswith("L"):
        from .ledger_findings import _rule_name
        return _rule_name(rid)
    return "실태조사 의심 규칙"


async def parcel_lookup(args: dict, ctx) -> Out:
    p = ctx.principal
    pnu = re.sub(r"\D", "", str(args.get("pnu") or ""))
    jibun = str(args.get("jibun") or "").strip()
    if not pnu and not jibun:
        raise ToolError("bad_request", "지번 또는 PNU 가 필요합니다")
    from landxi_api.ledger import ParcelIndex, parse_jibun
    from landxi_api.regions import tenant_scope
    scope = tenant_scope(p.tenant_id) if p.realm == "tenant" else []
    if scope is None:
        raise ToolError("tool_forbidden", "해당 지역 데이터가 없습니다", 403)
    ix = await ParcelIndex.get(scope or None)
    if not pnu:
        got, why = ix.from_jibun(parse_jibun(jibun))
        if not got:
            raise ToolError("not_found", "해당 지역 데이터가 없습니다" if "관할" in (why or "") else f"필지를 찾지 못했습니다({why})", 404)
        pnu = got
    if len(pnu) != 19:
        raise ToolError("bad_request", "PNU 는 19자리")
    if scope and not any(pnu.startswith(x) for x in scope):
        raise ToolError("tool_forbidden", "이 기관의 데이터가 아닙니다", 403)
    res = await ctx.http.get(f"/survey/parcels/{pnu}", params={"with": "facts,findings,history,ledger"})
    if res.status_code == 404:
        raise ToolError("not_found", "해당 지역 데이터가 없습니다", 404)
    if res.status_code == 403:
        raise ToolError("tool_forbidden", "이 기관의 데이터가 아닙니다", 403)
    if res.status_code >= 400:
        raise ToolError("upstream_error", "필지를 읽지 못했습니다", res.status_code)
    j = res.json()
    out = Out(source=f"GET /api/v1/survey/parcels/{pnu}")
    facts = j.get("facts") or {}
    for key in ("area_m2", "a23_bld_m2", "a23_crop_m2"):
        v = facts.get(key)
        if isinstance(v, dict) and "value" in v:
            out.env(key, {"area_m2": "필지 면적", "a23_bld_m2": "2023 AI 건물 면적(필지 안)", "a23_crop_m2": "2023 AI 경작지 면적(필지 안)"}[key], v)
    addr = S.short_addr(j.get("addr"))
    for m in re.findall(r"\d+(?:-\d+)?", addr + " " + pnu):
        out.whitelist.add(m)
    out.data = {"pnu": pnu, "주소": addr, "지목": facts.get("jimok_nm") or facts.get("jimok"),
                "의심": [{"규칙": _rule_nm(f), "등급": f.get("priority"), "상태": f.get("state")} for f in j.get("findings") or []],
                "대장": [{"종류": x.get("kind_label"), "값": x.get("values")} for x in j.get("ledger") or []] or "올린 대장에 없음",
                "이력": j.get("history_summary") or j.get("history_note"), "소유자": "제공하지 않음(성명 없음)"}
    ll = None
    for f in j.get("findings") or []:
        ll = f.get("lnglat") or ll
    bb = [ll[0] - 0.0006, ll[1] - 0.0005, ll[0] + 0.0006, ll[1] + 0.0005] if ll and ll[0] is not None else None
    out.citations.append({"kind": "parcel", "pnu": pnu, "addr": addr, "bbox": bb, "center": ll, "label": addr,
                          "env_keys": [k for k, _, _ in out.envelopes]})
    if bb:
        out.raw = {"bbox": bb, "features": [{"type": "Feature", "geometry": {"type": "Point", "coordinates": ll}, "properties": {"n": 1, "pnu": pnu}}],
                   "label": f"필지 · {addr}"}
    return out
