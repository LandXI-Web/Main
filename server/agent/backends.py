"""LLM 백엔드 사슬(F1-CONTRACT v1.1-23) — vLLM Gemma 4(:8000) → 라우터 HyperCLOVA X SEED(:8001) → Ollama(:11434) → llm_unavailable.

- chat_stream(): OpenAI 호환 /chat/completions · tools · tool_choice:'auto' · stream · usage(include_usage) → 이벤트 제너레이터.
  첫 토큰 ms · 토큰/초 · usage 는 전부 이 호출에서 잰다(measured). 상수 없음.
- classify(): 라우터 4클래스(map|report|ops|smalltalk) · ms 실측 · 라우터가 죽으면 규칙 분류(표기 'rules').
- health(): /v1/models 2s · Redis hash agent:models(30s) — 관제(F2-C)·모델 칩이 읽는다.
- 외부 클라우드 호출 0: config.host_allowed() 가 루프백·*.landxi.internal 만 허용.
"""
from __future__ import annotations

import asyncio
import json
import re
import time
from dataclasses import dataclass, field
from typing import Any, AsyncIterator

import contextlib

import httpx

from . import config

INTENTS = ("map", "report", "ops", "smalltalk")


class LLMUnavailable(Exception):
    """사슬 전부 실패 → 503 llm_unavailable."""

    def __init__(self, tried: list[dict]):
        super().__init__("llm_unavailable")
        self.tried = tried


class BackendDown(Exception):
    pass


def _override_key(name: str) -> str:
    return f"{name}_url"


async def resolved(name: str, r=None) -> dict:
    """env 기본값 + Redis agent:backends 덮어쓰기(런타임 · 재기동 없음)."""
    b = dict(config.BACKENDS[name])
    b["name"] = name
    if r is not None:
        try:
            ov = await r.hget("agent:backends", _override_key(name))
            if ov:
                b["base"] = ov
        except Exception:
            pass
    return b


def _allowed(b: dict) -> bool:
    return config.host_allowed(b["base"]) or (re.match(r"^https?://[a-z0-9-]+\.landxi\.internal(:\d+)?/", b["base"]) is not None)


async def probe(b: dict, timeout: float = config.HEALTH_TIMEOUT_S) -> dict:
    """GET /models — ok · ms(실측) · 모델 목록."""
    t0 = time.perf_counter()
    if not _allowed(b):
        return {"ok": False, "ms": 0, "error": "host_not_allowed"}
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(timeout, connect=min(timeout, config.CONNECT_TIMEOUT_S))) as c:
            res = await c.get(b["base"].rstrip("/") + "/models")
            ok = res.status_code == 200
            ids = [m.get("id") for m in (res.json().get("data") or [])] if ok else []
            return {"ok": ok and (b["model"] in ids or not ids), "ms": round((time.perf_counter() - t0) * 1000, 1), "models": ids}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "ms": round((time.perf_counter() - t0) * 1000, 1), "error": type(e).__name__}


async def health(r=None, write: bool = True) -> dict:
    """세 백엔드 헬스 → agent:models 해시(F2-C 관제 LLM 띠 · /agent/models)."""
    out = {}
    names = list(config.BACKENDS)
    bs = [await resolved(n, r) for n in names]
    res = await asyncio.gather(*(probe(b) for b in bs))
    now = time.strftime("%Y-%m-%dT%H:%M:%S+09:00")
    for b, h in zip(bs, res):
        role = ["router"] if b["name"] == "router" else (["planner", "writer"] if b["name"] == "vllm" else ["fallback"])
        out[b["name"]] = {"id": b["model"], "backend": "vllm" if b["name"] in ("vllm", "router") else "ollama", "base": b["base"],
                          "role": role, "ok": h["ok"], "probe_ms": h["ms"], "error": h.get("error"), "license": b["license"],
                          "family": b["family"], "gpu": b["gpu"], "as_of": now}
    if write and r is not None:
        try:
            await r.hset("agent:models", mapping={k: json.dumps(v, ensure_ascii=False) for k, v in out.items()})
            await r.expire("agent:models", config.HEALTH_TTL_S * 4)
        except Exception:
            pass
    return out


# ── 스트리밍 chat ──────────────────────────────────────────────────────────
@dataclass
class ChatResult:
    backend: str
    model: str
    base: str
    content: str = ""
    tool_calls: list[dict] = field(default_factory=list)
    usage: dict = field(default_factory=dict)
    first_token_ms: float | None = None
    total_ms: float = 0.0
    finish: str | None = None
    fallback_from: list[dict] = field(default_factory=list)

    @property
    def completion_tokens(self) -> int:
        return int(self.usage.get("completion_tokens") or 0)

    @property
    def tps(self) -> float | None:
        """토큰/초(실측) = completion_tokens ÷ (전체 − 첫 토큰) — 디코드 구간만."""
        if self.first_token_ms is None or self.completion_tokens < 2:
            return None
        dec = (self.total_ms - self.first_token_ms) / 1000
        return round(self.completion_tokens / dec, 1) if dec > 0 else None


def _body(b: dict, messages: list[dict], tools: list[dict] | None, max_tokens: int, temperature: float, extra: dict | None) -> dict:
    body: dict[str, Any] = {"model": b["model"], "messages": messages, "stream": True, "stream_options": {"include_usage": True},
                            "temperature": temperature, "max_tokens": max_tokens}
    if tools:
        body["tools"] = tools
        body["tool_choice"] = "auto"
    if extra:
        body.update(extra)
    return body


@contextlib.asynccontextmanager
async def _power(holder: str):
    """전력 규칙(F2 통합 · F2-E must_fix): GPU1 LLM 호출 직전 workers.bus.llm_power_request() → GPU0 추론 워커가 칸 묶음 사이에서 멈추고
    다른 GPU 전력이 100 W 아래로 내려갈 때까지(최대 6 s) 기다린다 · 호출 뒤 llm_power_done(). Redis 가 없으면 협조 없이 진행(개발)."""
    got = None
    try:
        from workers import bus
        got = await asyncio.to_thread(bus.llm_power_request, holder)
    except Exception:  # noqa: BLE001
        got = None
    try:
        yield got
    finally:
        if got is not None:
            try:
                from workers import bus
                await asyncio.to_thread(bus.llm_power_done, holder)
            except Exception:  # noqa: BLE001
                pass


async def _stream_one(b: dict, messages, tools, max_tokens, temperature, extra, on_delta) -> ChatResult:
    async with _power("agent:" + b.get("name", "llm")):
        return await _stream_one_raw(b, messages, tools, max_tokens, temperature, extra, on_delta)


async def _stream_one_raw(b: dict, messages, tools, max_tokens, temperature, extra, on_delta) -> ChatResult:
    if not _allowed(b):
        raise BackendDown("host_not_allowed")
    res = ChatResult(backend=b["name"], model=b["model"], base=b["base"])
    calls: dict[int, dict] = {}
    t0 = time.perf_counter()
    timeout = httpx.Timeout(config.READ_TIMEOUT_S, connect=config.CONNECT_TIMEOUT_S)
    try:
        async with httpx.AsyncClient(timeout=timeout) as c:
            async with c.stream("POST", b["base"].rstrip("/") + "/chat/completions",
                                json=_body(b, messages, tools, max_tokens, temperature, extra)) as resp:
                if resp.status_code != 200:
                    txt = (await resp.aread()).decode("utf-8", "replace")[:300]
                    raise BackendDown(f"http_{resp.status_code}: {txt}")
                async for line in resp.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    d = line[5:].strip()
                    if d == "[DONE]":
                        break
                    try:
                        j = json.loads(d)
                    except json.JSONDecodeError:
                        continue
                    if j.get("usage"):
                        res.usage = j["usage"]
                    for ch in j.get("choices") or []:
                        dl = ch.get("delta") or {}
                        if ch.get("finish_reason"):
                            res.finish = ch["finish_reason"]
                        piece = dl.get("content")
                        if (piece or dl.get("tool_calls")) and res.first_token_ms is None:
                            res.first_token_ms = round((time.perf_counter() - t0) * 1000, 1)
                        if piece:
                            res.content += piece
                            if on_delta:
                                await on_delta(piece)
                        for tc in dl.get("tool_calls") or []:
                            k = tc.get("index", 0)
                            cc = calls.setdefault(k, {"id": tc.get("id") or f"call_{k}", "name": "", "arguments": ""})
                            f = tc.get("function") or {}
                            if tc.get("id"):
                                cc["id"] = tc["id"]
                            if f.get("name"):
                                cc["name"] += f["name"]
                            if f.get("arguments"):
                                cc["arguments"] += f["arguments"]
    except (httpx.ConnectError, httpx.ConnectTimeout, httpx.RemoteProtocolError, OSError) as e:
        raise BackendDown(type(e).__name__) from e
    res.total_ms = round((time.perf_counter() - t0) * 1000, 1)
    res.tool_calls = [calls[k] for k in sorted(calls)]
    # Ollama/qwen 계열이 도구 호출을 본문 JSON 으로 낼 때(폴백 파서 · 같은 인터페이스)
    if not res.tool_calls and tools and res.content.strip().startswith(("{", "<tool_call>", "[")):
        parsed = parse_inline_tool_calls(res.content, {t["function"]["name"] for t in tools})
        if parsed:
            res.tool_calls, res.content = parsed, ""
    return res


_INLINE = re.compile(r"<tool_call>\s*(\{.*?\})\s*</tool_call>", re.S)


def parse_inline_tool_calls(text: str, names: set[str]) -> list[dict]:
    """JSON 강제 파서: {"name":..,"arguments":{..}} · [..] · <tool_call>{..}</tool_call> 셋 다 받는다."""
    blobs: list[Any] = []
    for m in _INLINE.finditer(text):
        try:
            blobs.append(json.loads(m.group(1)))
        except json.JSONDecodeError:
            pass
    if not blobs:
        try:
            j = json.loads(text.strip())
            blobs = j if isinstance(j, list) else [j]
        except json.JSONDecodeError:
            return []
    out = []
    for i, b in enumerate(blobs):
        if not isinstance(b, dict):
            continue
        n = b.get("name") or (b.get("function") or {}).get("name")
        a = b.get("arguments") or b.get("parameters") or (b.get("function") or {}).get("arguments") or {}
        if n in names:
            out.append({"id": f"inline_{i}", "name": n, "arguments": a if isinstance(a, str) else json.dumps(a, ensure_ascii=False)})
    return out


async def chat_stream(messages: list[dict], *, tools: list[dict] | None = None, max_tokens: int = 512, temperature: float = 0.2,
                      extra: dict | None = None, on_delta=None, r=None, chain: list[str] | None = None,
                      on_fallback=None) -> ChatResult:
    """사슬을 순서대로 시도. 연결 실패만 다음으로 넘긴다(부분 스트림 뒤 실패는 그대로 오류)."""
    tried: list[dict] = []
    for name in chain or config.CHAIN:
        b = await resolved(name, r)
        t0 = time.perf_counter()
        try:
            res = await _stream_one(b, messages, tools, max_tokens, temperature, extra, on_delta)
            res.fallback_from = tried
            return res
        except BackendDown as e:
            tried.append({"backend": name, "base": b["base"], "error": str(e)[:160], "ms": round((time.perf_counter() - t0) * 1000, 1)})
            if on_fallback:
                await on_fallback(tried[-1])
    raise LLMUnavailable(tried)


# ── 라우터(의도 4클래스) ─────────────────────────────────────────────────────
ROUTER_PROMPT = (
    "다음 사용자 문장의 의도를 map, report, ops, smalltalk 중 하나의 영어 단어로만 답하라.\n"
    "map: 지도·필지·의심·건수·분석 실행·프레임·보여줘·찾아줘\n"
    "report: 보고서·초안·공문·문서 작성\n"
    "ops: GPU·서버·큐·장애·관제·쿼터·배포\n"
    "smalltalk: 인사·잡담·기능 질문\n"
    "예) '운봉읍 비닐하우스 보여줘' → map\n예) '아영면 실태조사 보고서 초안 써줘' → report\n"
    "예) 'GPU1 왜 느려?' → ops\n예) '안녕' → smalltalk\n문장: "
)
_RULES = [
    ("report", re.compile(r"보고서|초안|공문|문서|작성해")),
    ("ops", re.compile(r"GPU|gpu|서버|큐|관제|장애|쿼터|배포|롤백|워커")),
    ("map", re.compile(r"필지|의심|보여|찾아|몇\s*건|건수|지도|분석|프레임|비닐|건물|경작|읍|면|동|R[1-6]")),
]


def rule_classify(text: str) -> str:
    for k, rx in _RULES:
        if rx.search(text):
            return k
    return "smalltalk"


async def classify(text: str, r=None) -> dict:
    """라우터 :8001 → 실패 시 규칙 분류. 반환 {intent, ms, backend, model, raw}."""
    b = await resolved("router", r)
    t0 = time.perf_counter()
    try:
        if not _allowed(b):
            raise BackendDown("host_not_allowed")
        async with _power("agent:router"), httpx.AsyncClient(timeout=httpx.Timeout(8.0, connect=config.CONNECT_TIMEOUT_S)) as c:
            res = await c.post(b["base"].rstrip("/") + "/chat/completions",
                               json={"model": b["model"], "temperature": 0, "max_tokens": 4,
                                     "messages": [{"role": "user", "content": ROUTER_PROMPT + text[:300]}]})
            res.raise_for_status()
            raw = (res.json()["choices"][0]["message"].get("content") or "").strip().lower()
        ms = round((time.perf_counter() - t0) * 1000, 1)
        intent = next((k for k in INTENTS if k in raw), None)
        # 1.5B 라우터가 형식을 어기면 규칙으로 보정(표기 · 숨기지 않음)
        if intent is None:
            return {"intent": rule_classify(text), "ms": ms, "backend": "router+rules", "model": b["model"], "raw": raw[:40]}
        return {"intent": intent, "ms": ms, "backend": "vllm", "model": b["model"], "raw": raw[:40]}
    except Exception as e:  # noqa: BLE001
        ms = round((time.perf_counter() - t0) * 1000, 1)
        return {"intent": rule_classify(text), "ms": ms, "backend": "rules", "model": "규칙 분류(라우터 없음)", "error": type(e).__name__}


async def first_alive(r=None) -> tuple[str | None, list[dict]]:
    """POST /agent/runs 직전 신선한 헬스 — 사슬 중 첫 생존 백엔드와 전환 기록(ms 실측)."""
    tried = []
    for name in config.CHAIN:
        b = await resolved(name, r)
        h = await probe(b, timeout=1.5)
        if h["ok"]:
            return name, tried
        tried.append({"backend": name, "base": b["base"], "error": h.get("error") or "not_ok", "ms": h["ms"]})
    return None, tried
