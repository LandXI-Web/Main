"""지역 범위(core-fusion) — 도구가 '어느 시군구 데이터를 읽나'를 한 곳에서 정한다. 지역 고정값 0.

· 기관 세션 = 관할(regions.tenant_scope). 말한 지역이 관할 밖이면 403 '이 기관의 데이터가 아닙니다'.
  지역을 말하지 않으면 그 기관이 실제로 가진 실태조사 시군구(survey_findings · survey_parcels 의 PNU 앞 5자리)로.
· LX 세션 = region 인자(이름 또는 5자리 코드) · 없으면 화면 문맥(context.region) · 그것도 없으면 전체.
· 코드가 바뀐 시군구(옛/새 코드)는 둘 다 같은 지역으로 본다(regions.sgg_codes).
"""
from __future__ import annotations

import re

from . import ToolError

_SIDO_HEAD = re.compile(r"^\S+(?:특별자치도|특별자치시|특별시|광역시|통합특별시|도)\s+")


def short_addr(addr) -> str:
    """주소 머리의 시도 이름을 떼어 짧게(어느 시도든 같은 규칙)."""
    return _SIDO_HEAD.sub("", str(addr or "").strip())


def _regions():
    from landxi_api import regions as R
    return R


def codes_of(sgg: str | None) -> list[str]:
    if not sgg:
        return []
    R = _regions()
    try:
        return R.sgg_codes(str(sgg)[:5])
    except Exception:
        return [str(sgg)[:5]]


def resolve(q) -> list[dict]:
    """시군구 이름 · 어간 · 5자리 코드(지금 · 옛) → regions 행(같은 이름이 여러 시도면 여러 개)."""
    if not q:
        return []
    R = _regions()
    q = str(q).strip()
    if re.fullmatch(r"\d{5}", q):
        try:
            r = R.region_of(q)
        except Exception:
            r = None
        return [r] if r else []
    try:
        return R.find(q)
    except Exception:
        return []


def name_of(sgg: str | None) -> str | None:
    if not sgg:
        return None
    try:
        r = _regions().region_of(sgg)
    except Exception:
        r = None
    return (r or {}).get("name")


async def tenant_sggs(ctx) -> list[str]:
    """기관 세션이 실제로 가진 실태조사 시군구(RLS · 자기 기관 행만). 없으면 []."""
    p = ctx.principal
    try:
        from landxi_api.deps import db
        async with db(p) as conn:
            rows = await conn.fetch("SELECT DISTINCT substr(pnu,1,5) s FROM survey_findings WHERE pnu IS NOT NULL")
            got = [r["s"] for r in rows if r["s"]]
            if not got:
                rows = await conn.fetch("SELECT DISTINCT substr(pnu,1,5) s FROM survey_parcels WHERE tenant_id=$1 LIMIT 50", p.tenant_id)
                got = [r["s"] for r in rows if r["s"]]
    except Exception:
        return []
    out: list[str] = []
    for s in sorted(got):
        c = codes_of(s)[0] if codes_of(s) else s
        if c not in out:
            out.append(c)
    return out


async def region_of(ctx, args: dict) -> dict:
    """→ {sgg: 대표 코드 | None, codes: [지금·옛 코드…], name, full, asked: bool}. 권한 밖이면 ToolError 403."""
    p = ctx.principal
    asked = args.get("region") or args.get("sgg_cd")
    q = asked or (ctx.context or {}).get("region")
    hits = resolve(q)
    if asked and not hits:
        raise ToolError("not_found", f"'{asked}' 지역을 찾지 못했습니다", 404)
    if p.realm == "tenant":
        R = _regions()
        sc = R.tenant_scope(p.tenant_id)
        if hits:
            inside = [h for h in hits if any(R.in_scope(c, sc) for c in codes_of(h["sgg_cd"]))]
            if not inside:
                raise ToolError("tool_forbidden", "이 기관의 데이터가 아닙니다", 403)
            hits = inside
        else:
            own = await tenant_sggs(ctx)
            hits = [h for h in (resolve(s)[:1] for s in own) for h in h]
            if len(hits) != 1:          # 관할 여러 시군구 · 아직 실태조사 없음 → 기관 전체(RLS 가 범위)
                return {"sgg": None, "codes": [c for h in hits for c in codes_of(h["sgg_cd"])], "name": None, "full": None, "asked": False}
    elif p.realm != "lx":
        raise ToolError("tool_forbidden", "로그인이 필요합니다", 401)
    if len(hits) != 1:
        if len(hits) > 1 and asked:
            raise ToolError("bad_request", f"'{asked}' 이름이 여러 시도에 있습니다 — 시도와 함께 말씀해 주세요")
        return {"sgg": None, "codes": [], "name": None, "full": None, "asked": False}
    h = hits[0]
    return {"sgg": h["sgg_cd"], "codes": codes_of(h["sgg_cd"]), "name": h.get("name"), "full": h.get("full"), "asked": bool(asked)}


def in_region(pnu, reg: dict) -> bool:
    cs = reg.get("codes") or []
    return not cs or str(pnu or "")[:5] in cs


def emd_resolve(reg: dict, q) -> tuple[str | None, str | None]:
    """읍면동 이름·코드 → (이름, 10자리 이하 코드). 그 시군구 읍면동 경계(regions.emd_index)에서 찾는다."""
    if not q:
        return None, None
    q = str(q).strip()
    ix = None
    if reg.get("sgg"):
        try:
            ix = _regions().emd_index(reg["sgg"])
        except Exception:
            ix = None
    if ix is None:
        return None, None
    names, codes = list(ix.names), list(ix.codes)
    for n, cd in zip(names, codes):
        if q in (n, cd):
            return n, cd
    for n, cd in zip(names, codes):
        if n and (q.startswith(n) or n.startswith(q) or n in q):
            return n, cd
    return None, None
