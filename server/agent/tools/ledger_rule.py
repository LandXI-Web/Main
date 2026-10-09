"""도구 ledger_rule(F3 §3 S-10) — 자연어 조건 → 규칙 L-* + 임계(기관 오버라이드) → 확인 카드. 저장·적용은 사람이 '실행'을 눌러야 된다.

해석은 결정적(규칙 사전 · 숫자 추출) — LLM 이 규칙을 지어내지 않는다. 사전에 없는 조건은 거절 문구로 돌려준다.
승인 뒤 = POST /t/{tenant}/survey/rules/evaluate {rule, thresholds} (이 기관 결과만 다시 계산 · 전 기관 적용은 결재).
"""
from __future__ import annotations

import re

from . import Out, ToolError
from .ledger_findings import _rule_name
from .ledger_ingest import tenant_for

LEXICON = [  # (규칙, 패턴, 임계 키)
    ("L1", re.compile(r"(대장|농지).{0,12}(건물|건축|집|창고)|건물.{0,10}(농지|대장)"), "L1_bld_m2"),
    ("L2", re.compile(r"(경작|자경|임차).{0,14}(흔적|안\s*보|없|휴경|방치)|휴경"), "L2_crop_ratio"),
    ("L3", re.compile(r"(허가|개발행위).{0,14}(건물|착공|공사).{0,6}(없|안)|미착공|착공\s*전"), "L3_bld_m2"),
]
NUM = re.compile(r"(\d+(?:\.\d+)?)\s*(㎡|m2|제곱미터|평|%|퍼센트)?")


def parse(text: str) -> dict | None:
    t = str(text or "")
    for rid, rx, key in LEXICON:
        if rx.search(t):
            th = {}
            m = NUM.search(t)
            if m:
                v, u = float(m.group(1)), (m.group(2) or "")
                if u == "평":
                    v = round(v * 3.3058, 1)
                if key.endswith("ratio"):
                    v = v / 100 if (u in ("%", "퍼센트") or v > 1) else v
                th[key] = v
            return {"rule": rid, "thresholds": th}
    return None


def prepare(args: dict, ctx) -> dict:
    """확인 카드에 올릴 내용(쓰기 전) — runner.confirm_then 이 부른다."""
    tenant = tenant_for(ctx, args)
    got = parse(args.get("text"))
    if not got:
        raise ToolError("bad_request", "이 조건은 아직 규칙으로 만들 수 없습니다 — 대장 농지 위 건물 · 경작 흔적 없음 · 허가 필지 건물 없음 중에서 말씀해 주세요")
    return {"tenant_id": tenant, **got}


async def ledger_rule_exec(args: dict, ctx) -> Out:
    """승인 뒤에만 — 기관 결과 재계산."""
    tenant = args["tenant_id"]
    res = await ctx.http.post(f"/t/{tenant}/survey/rules/evaluate", json={"rule": args["rule"], "thresholds": args.get("thresholds") or {}})
    if res.status_code == 403:
        raise ToolError("tool_forbidden", "이 기관의 데이터가 아닙니다", 403)
    if res.status_code >= 400:
        e = (res.json().get("error") or {}) if res.headers.get("content-type", "").startswith("application/json") else {}
        raise ToolError(e.get("code", "bad_request"), e.get("message") or res.text[:200], res.status_code)
    j = res.json()
    out = Out(source=f"POST /api/v1/t/{tenant}/survey/rules/evaluate")
    for k, v in (j.get("findings") or {}).items():
        out.env(f"finding_{k}", f"{_rule_name(k)} 필지(기관 기준으로 다시 계산)", v)
    out.data = {"규칙": _rule_name(j.get("rule") or ""), "조건": j.get("condition"), "적용": "이 기관 결과만(전 기관 적용은 승인 요청)"}
    out.ui_actions.append({"op": "map_on", "set": "survey/findings", "filter": {"rule": j.get("rule"), "ledger": "latest"}, "label": j.get("condition")})
    return out


async def ledger_rule(args: dict, ctx) -> Out:            # 등록용(실제 실행은 confirm_then → ledger_rule_exec)
    return await ledger_rule_exec(prepare(args, ctx), ctx)
