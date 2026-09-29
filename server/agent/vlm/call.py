"""vLLM :8000 Gemma 4 비전 호출 — 조각 PNG + 필지 정보 → 세 줄.

· 전력 규칙(GPU 한 장씩): 호출 전에 workers.bus.llm_power_request 로 GPU0 영상 추론 워커를 칸 묶음 사이에서 멈추고,
  다른 GPU 전력이 내려갈 때까지 기다린다(최대 3회 · 18 s). 그래도 GPU0 가 바쁘면 호출하지 않는다(겹침 0).
  호출마다 한 줄 기록(LX_DATA_ROOT/agent/vlm-gpu-log.jsonl): 시작 시 돌던 GPU 작업 수 · 전력 확인 결과 · 토큰.
· 토큰은 chat/completions usage 실측 — 호출한 쪽(ext/vlm.py)이 run 토큰에 더해 기관 사용량(llm_tokens)으로 계량된다.
· 외부 호출 0: 백엔드 사슬 설정(config.BACKENDS['vllm'] · host_allowed) 그대로. 폴백(Ollama)은 이미지를 못 보므로 쓰지 않는다.
"""
from __future__ import annotations

import asyncio
import base64
import datetime as dt
import json
import time
from dataclasses import dataclass, field

from .. import backends, config

KST = dt.timezone(dt.timedelta(hours=9))
LOG = config.ARTIFACT_DIR / "vlm-gpu-log.jsonl"
POWER_TRIES = 3


class VlmBusy(Exception):
    """GPU0 영상 추론이 전력 확인 뒤에도 내려가지 않음 — 겹치지 않게 호출하지 않는다."""


class VlmUnavailable(Exception):
    pass


@dataclass
class VlmResult:
    text: str
    usage: dict = field(default_factory=dict)
    model: str = ""
    ms: float = 0.0
    power: dict = field(default_factory=dict)
    gpu_jobs_at_start: int | None = None

    @property
    def tokens(self) -> int:
        return int(self.usage.get("prompt_tokens") or 0) + int(self.usage.get("completion_tokens") or 0)


def image_part(png: bytes) -> dict:
    return {"type": "image_url", "image_url": {"url": "data:image/png;base64," + base64.b64encode(png).decode()}}


async def running_gpu_jobs() -> int | None:
    """지금 돌고 있는 GPU 영상 추론 작업 수(pool a6000 · running). 읽지 못하면 None."""
    try:
        from landxi_api.deps import db
        async with db(realm="lx") as conn:
            return int(await conn.fetchval("SELECT count(*) FROM jobs WHERE state='running' AND pool <> 'cpu'") or 0)
    except Exception:
        return None


def _log(row: dict):
    try:
        LOG.parent.mkdir(parents=True, exist_ok=True)
        with LOG.open("a", encoding="utf-8") as f:
            f.write(json.dumps(row, ensure_ascii=False, default=str) + "\n")
    except Exception:
        pass


async def _power_acquire(holder: str) -> dict:
    try:
        from workers import bus
    except Exception:  # noqa: BLE001 — 버스가 없으면(개발) 협조 없이
        return {"ok": True, "bus": False}
    got = {}
    for k in range(POWER_TRIES):
        got = await asyncio.to_thread(bus.llm_power_request, holder, 1, 60)
        got["try"] = k + 1
        if got.get("ok"):
            return got
    await asyncio.to_thread(bus.llm_power_done, holder)
    raise VlmBusy(json.dumps(got, ensure_ascii=False, default=str))


async def _power_release(holder: str):
    try:
        from workers import bus
        await asyncio.to_thread(bus.llm_power_done, holder)
    except Exception:
        pass


async def describe(pngs: list[bytes], prompt: str, *, system: str | None = None, r=None, run_id: str = "", max_tokens: int = 220) -> VlmResult:
    """이미지 최대 4장 + 질문 → 답(스트림 없이 한 번). 전력 확인 → 호출 → 해제 · 기록 한 줄."""
    b = await backends.resolved("vllm", r)
    if not backends._allowed(b):
        raise VlmUnavailable("host_not_allowed")
    content = [{"type": "text", "text": prompt}] + [image_part(p) for p in pngs[:4]]
    msgs = ([{"role": "system", "content": system}] if system else []) + [{"role": "user", "content": content}]
    holder = "agent:vlm:" + (run_id or "x")
    jobs0 = await running_gpu_jobs()
    t0 = time.perf_counter()
    try:
        power = await _power_acquire(holder)
    except VlmBusy as e:
        _log({"at": dt.datetime.now(KST).isoformat(timespec="seconds"), "run_id": run_id, "gpu_jobs_at_start": jobs0, "called": False,
              "why": "gpu0_busy", "power": str(e)[:300]})
        raise
    try:
        try:
            res = await backends._stream_one_raw(b, msgs, None, max_tokens, 0.1, None, None)
        except backends.BackendDown as e:
            raise VlmUnavailable(str(e)) from e
    finally:
        await _power_release(holder)
    ms = round((time.perf_counter() - t0) * 1000, 1)
    out = VlmResult(text=(res.content or "").strip(), usage=res.usage or {}, model=res.model, ms=ms, power=power, gpu_jobs_at_start=jobs0)
    _log({"at": dt.datetime.now(KST).isoformat(timespec="seconds"), "run_id": run_id, "gpu_jobs_at_start": jobs0, "called": True,
          "power_ok": power.get("ok"), "waited_s": power.get("waited_s"), "other_w": power.get("other_w"), "images": len(pngs[:4]),
          "tokens": out.tokens, "ms": ms, "model": res.model})
    return out
