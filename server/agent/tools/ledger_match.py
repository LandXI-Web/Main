"""도구 ledger_match(F3 §3 S-10) — 대장 × 연속지적 매칭 결과(결합률 봉투 · 미매칭 사유). 매칭률 < 50% 면 확인 카드(열 확인 표)로 멈춘다.

매칭 실행(confirm)은 사람이 확인 표에서 누른다 — 이 도구는 읽기 + 안내만(쓰기 0).
"""
from __future__ import annotations

from collections import Counter

from . import Out, ToolError
from .ledger_findings import _rule_name
from .ledger_ingest import KIND_KO, latest_import, tenant_for

LOW = 50.0


async def ledger_match(args: dict, ctx) -> Out:
    tenant = tenant_for(ctx, args)
    imp = await latest_import(ctx, tenant, args.get("kind"), args.get("import_id"))
    out = Out(source=f"GET /api/v1/t/{tenant}/survey/registry/{{import_id}}")
    if not imp:
        out.data = {"안내": "이 기관에 올린 대장이 없습니다 → 올리기"}
        out.ui_actions.append({"op": "drawer_open", "kind": "ledger", "tab": "upload"})
        return out
    full = await latest_import(ctx, tenant, import_id=imp["import_id"]) or imp
    if full["state"] in ("uploaded", "failed"):
        out.data = {"import_id": full["import_id"], "상태": "매칭 전", "더 필요한 열": full.get("needs"),
                    "안내": "열 확인 표에서 필지 열(PNU 또는 지번)을 확인하고 매칭을 누르세요"}
        out.ui_actions.append({"op": "drawer_open", "kind": "ledger", "tab": "mapping", "import_id": full["import_id"]})
        return out
    if full["state"] == "matching":
        out.data = {"import_id": full["import_id"], "상태": "매칭 중"}
        return out
    pct = (full.get("matched_pct") or {}).get("value")
    out.env("rows", "대장 행 수", full["rows"])
    out.env("matched", "필지에 붙은 행", full["matched"])
    out.env("matched_pct", "결합률", full["matched_pct"])
    for k, v in (full.get("by_step") or {}).items():
        out.env(f"step_{k}", f"{ {'pnu': 'PNU 직접', 'jibun': '지번 해석', 'geom': '좌표', 'vworld': '공개 자료 조회'}.get(k, k)}로 붙은 행", v)
    reasons = Counter((u.get("reason") or "사유 없음") for u in (full.get("unmatched") or []))
    out.data = {"import_id": full["import_id"], "대장": KIND_KO.get(full["kind"], full["kind"]), "미매칭 사유(상위)": reasons.most_common(3),
                "대장 대조": {_rule_name(k): f"key:finding_{k}" for k in (full.get("findings") or {})}}
    for k, v in (full.get("findings") or {}).items():
        out.env(f"finding_{k}", f"{_rule_name(k)} 필지(올린 대장 × AI 대조)", v)
    if pct is not None and pct < LOW:
        out.note = "결합률이 낮습니다 — 열 확인 표에서 지번·읍면동 열을 다시 고르세요"
        out.ui_actions.append({"op": "drawer_open", "kind": "ledger", "tab": "mapping", "import_id": full["import_id"]})
    out.citations.append({"kind": "ledger", "import_id": full["import_id"], "label": f"{KIND_KO.get(full['kind'], full['kind'])} 매칭",
                          "env_keys": ["rows", "matched", "matched_pct"]})
    return out
