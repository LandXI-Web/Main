"""도구 ledger_ingest(F3 §3 S-10 · F3-DIRECTION §3) — 기관이 올린 대장의 반입 상태(열 자동 인식 · 행 수 · 확인 필요 열).

파일 자체는 화면의 드롭존(K11)이 POST /t/{tenant}/survey/registry/import 로 올린다. 에이전트는 그 결과를 읽어 다음 단계(매칭)를 안내한다.
가드: 기관 realm 은 자기 기관만 · LX 는 tenant 인자 필요 · 대장이 없으면 '올리기' 한 줄.
"""
from __future__ import annotations

from . import Out, ToolError

KIND_KO = {"farm_ledger": "농지대장", "dev_permit": "개발행위 허가 대장", "public_asset": "공유재산 대장", "river_permit": "하천 점용 허가 대장",
           "greenhouse": "시설원예 등록"}


def tenant_for(ctx, args: dict) -> str:
    p = ctx.principal
    t = args.get("tenant_id")
    if p.realm == "tenant":
        if t and t != p.tenant_id:
            raise ToolError("tool_forbidden", "이 기관의 데이터가 아닙니다", 403)
        return p.tenant_id
    if p.realm == "lx":
        t = t or (ctx.context or {}).get("tenant_id") or (ctx.context or {}).get("tenant") or tenant_of_region(args.get("region") or (ctx.context or {}).get("region"))
        if not t:
            raise ToolError("bad_request", "어느 기관(또는 시군구)의 대장인지 알려 주세요")
        return t
    raise ToolError("tool_forbidden", "로그인이 필요합니다", 401)


def tenant_of_region(q) -> str | None:
    """시군구(이름·코드) → 그 시군구를 관할하는 기관(regions.yaml tenants · 시군구 코드 접두). 여럿이면 가장 좁은 관할."""
    if not q:
        return None
    from . import scope as S
    hits = S.resolve(q)
    if len(hits) != 1:
        return None
    codes = S.codes_of(hits[0]["sgg_cd"])
    try:
        from landxi_api.regions import _cfg
        best = None
        for t, v in (_cfg().get("tenants") or {}).items():
            for px in v.get("sgg") or []:
                if any(c.startswith(px) for c in codes) and (best is None or len(px) > best[1]):
                    best = (t, len(px))
        return best[0] if best else None
    except Exception:
        return None


async def latest_import(ctx, tenant: str, kind: str | None = None, import_id: str | None = None) -> dict | None:
    """대장 한 건 — import_id 가 있으면 그 반입. 없으면 이 사람의 최근 대장(사람별 기억 · r3-fusion) → 없으면 기관 최근 반입."""
    if import_id:
        res = await ctx.http.get(f"/t/{tenant}/survey/registry/{import_id}")
        if res.status_code == 403:
            raise ToolError("tool_forbidden", "이 기관의 데이터가 아닙니다", 403)
        return res.json() if res.status_code == 200 else None
    try:                                                   # 사람별 최근 대장(다른 담당자가 나중에 올린 대장이 먼저 잡히지 않게)
        rr = await ctx.http.get(f"/t/{tenant}/survey/registry/recent", params={k: v for k, v in {"kind": kind}.items() if v})
        if rr.status_code == 403:
            raise ToolError("tool_forbidden", "이 기관의 데이터가 아닙니다", 403)
        if rr.status_code == 200 and (rr.json() or {}).get("import"):
            return rr.json()["import"]
    except ToolError:
        raise
    except Exception:
        pass
    res = await ctx.http.get(f"/t/{tenant}/survey/registry", params={k: v for k, v in {"kind": kind}.items() if v})
    if res.status_code == 403:
        raise ToolError("tool_forbidden", "이 기관의 데이터가 아닙니다", 403)
    if res.status_code != 200:
        return None
    items = res.json().get("items") or []
    return items[0] if items else None


async def ledger_ingest(args: dict, ctx) -> Out:
    tenant = tenant_for(ctx, args)
    kind = args.get("kind")
    imp = await latest_import(ctx, tenant, kind, args.get("import_id"))
    out = Out(source=f"GET /api/v1/t/{tenant}/survey/registry")
    if not imp:
        out.data = {"대장": "없음", "안내": f"이 기관에 {KIND_KO.get(kind or 'farm_ledger', '대장')}이 없습니다 → 올리기",
                    "형식": "XLSX · CSV · SHP · GPKG · 20MB"}
        out.ui_actions.append({"op": "drawer_open", "kind": "ledger", "tab": "upload"})
        return out
    out.env("rows", "올린 대장 행 수", imp["rows"])
    if imp.get("matched_pct"):
        out.env("matched_pct", "필지 결합률", imp["matched_pct"])
    out.data = {"import_id": imp["import_id"], "대장": KIND_KO.get(imp["kind"], imp["kind"]), "상태": imp["state"],
                "열 인식": imp.get("columns_guess"), "쓰지 않는 열(성명·연락처)": imp.get("dropped"), "더 필요한 열": imp.get("needs"),
                "비고": "숫자는 봉투 key 로만 · 성명·연락처 열은 저장하지 않음"}
    out.citations.append({"kind": "ledger", "import_id": imp["import_id"], "label": f"{KIND_KO.get(imp['kind'], imp['kind'])} · {imp.get('filename') or ''}",
                          "env_keys": ["rows"] + (["matched_pct"] if imp.get("matched_pct") else [])})
    return out
