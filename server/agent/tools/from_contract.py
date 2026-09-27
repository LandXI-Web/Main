"""계약 → 도구 스키마(AGENT-SPEC §3.3 · F1-CONTRACT v1.1-24).

`server/fixtures/contract/*.json` 의 method·path 가 도구의 정본 엔드포인트다(v1.1-21·22 의 신설 경로는 계약 본문 그대로 아래 V11 표).
도구 이름 = 계약 API 이름 그대로. 인자 스키마는 경로의 {param} + 쿼리 키에서 만들고, 설명·열거값만 registry 가 덧붙인다.
계약에 없는 도구를 만들면 build() 가 ValueError(= 테스트 실패).
"""
from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from urllib.parse import parse_qsl, urlsplit

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures" / "contract"

# 도구 id → (픽스처 파일 | None, method, path) · None = v1.1 신설(계약 본문 정본)
CONTRACT = {
    "catalog_layers": ("catalog_layers", None, None),
    "results_stats": ("results_stats", None, None),
    "results_features": ("results_features", None, None),
    "parcel_at": ("parcels", None, None),
    "results_parcels_join": (None, "GET", "/api/v1/results/{set}/parcels?cls=&jimok=&emd_cd=&min_conf=&limit=2000"),        # v1.1-21
    "survey_findings": (None, "GET", "/api/v1/survey/findings?deploy_id=&rule=&priority=&emd_cd=&state=&bbox=&q=&sort=&limit=&offset="),  # v1.1-22
    "survey_stats": (None, "GET", "/api/v1/survey/stats?by="),                                                                 # v1.1-22
    "survey_parcel": (None, "GET", "/api/v1/survey/parcels/{pnu}?with="),                                                     # v1.1-22
    "survey_state": (None, "POST", "/api/v1/survey/findings/{id}/state"),                                                     # v1.1-22 (확인)
    "jobs_quote": ("jobs_quote", None, None),
    "jobs_submit": ("jobs_submit", None, None),
}
CLIENT = {"map_on", "map_arrive", "map_flyto", "map_frame", "drawer_open", "parcel_card"}   # F2-A window.XI 브리지(ui_actions)


@lru_cache(maxsize=1)
def fixtures() -> dict[str, dict]:
    out = {}
    for p in FIXTURES.glob("*.json"):
        if p.name.startswith("_"):
            continue
        try:
            j = json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            continue
        if isinstance(j, dict) and j.get("path"):
            out[p.stem] = {"method": j.get("method", "GET"), "path": j["path"]}
    return out


def endpoint(tool: str) -> dict:
    if tool in CLIENT:
        return {"method": "CLIENT", "path": "window.XI", "query": [], "params": [], "source": "F2-A bridge"}
    if tool not in CONTRACT:
        raise ValueError(f"계약에 없는 도구: {tool}")
    fx, m, p = CONTRACT[tool]
    if fx:
        f = fixtures().get(fx)
        if not f:
            raise ValueError(f"픽스처 {fx}.json 없음 — 계약 도구 {tool}")
        m, p = f["method"], f["path"]
        src = f"fixtures/contract/{fx}.json"
    else:
        src = "F1-CONTRACT v1.1"
    u = urlsplit(p)
    return {"method": m, "path": u.path, "query": [k for k, _ in parse_qsl(u.query, keep_blank_values=True)],
            "params": re.findall(r"\{(\w+)\}", u.path), "source": src}


def build(specs: dict[str, dict]) -> list[dict]:
    """registry 명세(설명·인자 보강) + 계약 엔드포인트 → OpenAI tools[]."""
    tools = []
    for name, s in specs.items():
        ep = endpoint(name)                      # 계약 밖이면 ValueError
        props = dict(s.get("properties") or {})
        tools.append({"type": "function", "function": {
            "name": name,
            "description": f"{s['description']} [{ep['method']} {ep['path']}]",
            "parameters": {"type": "object", "properties": props, "required": list(s.get("required") or [])}}})
    return tools
