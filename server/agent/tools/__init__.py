"""에이전트 도구 = 계약 API 그대로(F1-CONTRACT v1.1-24 · AGENT-SPEC §3.3).

모든 핸들러는 async (args, ctx) → Out. Out 은 봉투(라벨 붙은)·데이터 블록·ui_actions·인용 후보를 담는다.
봉투 id(e1, e2 …)는 runner 가 run 단위로 매긴다 — 핸들러는 key 만 준다.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


class ToolError(Exception):
    def __init__(self, code: str, message: str = "", status: int = 400):
        super().__init__(message or code)
        self.code, self.message, self.status = code, message or code, status


@dataclass
class Out:
    envelopes: list[tuple[str, str, dict]] = field(default_factory=list)   # (key, 한 줄 뜻, Envelope)
    data: Any = None                  # LLM 에 줄 데이터(작게) — 봉투 값은 key 로 참조
    ui_actions: list[dict] = field(default_factory=list)
    citations: list[dict] = field(default_factory=list)                   # {kind, pnu?, addr?, bbox?, center?, set?, label}
    whitelist: set[str] = field(default_factory=set)                      # 도구가 준 문자열 안의 숫자(지번·주소) — 검증기 통과
    source: str = ""
    note: str = ""
    raw: Any = None                   # 서버에만(프론트 도착 도형 등 — ui_actions 로 나감)
    # 명령 바 블록(plan 3.3) — chart {kind:'bar', title, rows:[{label, env:key}]} · file {label, href} · image {src, caption, tag}
    # chart 값은 봉투 key 로만(runner 가 eN 으로 바꾼다 · 숫자 직접 금지). href·src 는 게이트웨이 경로(/agent/runs/{run}/files/{name}).
    blocks: list[dict] = field(default_factory=list)
    answer: str = ""                  # 런타임 답(ext ROUTE 직행 때만 · 봉투 key 자리표 {{key}} 허용 → runner 가 {{env:eN}} 으로)

    def env(self, key: str, meaning: str, e: dict):
        self.envelopes.append((key, meaning, e))
        return key
