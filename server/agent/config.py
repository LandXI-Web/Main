"""에이전트 설정(F1-CONTRACT v1.1-23) — 백엔드 사슬 · 데이터 경로 · 한도.

URL 은 env 로 바꾼다(LX_LLM_*). 런타임에는 Redis hash `agent:backends` 가 env 를 덮는다(관제·시연용 · 컨테이너는 건드리지 않음).
외부 클라우드 LLM 은 없다(LLM_EXTERNAL=off 고정 · 온프레미스만). 허용 호스트는 루프백 + LX_LLM_ALLOW_HOSTS.
"""
from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import urlparse

SERVER_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = SERVER_ROOT.parent


def _env(k: str, d: str) -> str:
    return os.environ.get(k) or d


DATA_ROOT = Path(_env("LX_DATA_ROOT", "E:/Land-XI 플랫폼/02. 데이터"))
SURVEY_DIR = DATA_ROOT / "survey"
ARTIFACT_DIR = DATA_ROOT / "agent"                # run 별 산출(.docx) — LX_DATA_ROOT/agent/run_…/draft.docx
REPLAY_DIR = REPO_ROOT / "landxi" / "agent" / "data" / "replay"
GATEWAY = _env("LX_AGENT_GATEWAY", "http://127.0.0.1:8700/api/v1")   # 도구 = 계약 API(사용자 토큰 상속 · 루프백)

BACKENDS = {
    # 계획자 · 도구 호출 · 작성자
    "vllm": {"base": _env("LX_LLM_VLLM_URL", "http://127.0.0.1:8000/v1"), "model": _env("LX_LLM_VLLM_MODEL", "gemma-4-12b-it"),
             "label": "vLLM", "license": "Apache-2.0", "family": "Gemma 4 12B-it QAT W4A16", "gpu": "GPU1"},
    # 의도 라우터 4클래스
    "router": {"base": _env("LX_LLM_ROUTER_URL", "http://127.0.0.1:8001/v1"), "model": _env("LX_LLM_ROUTER_MODEL", "hyperclovax-seed-1.5b"),
               "label": "vLLM", "license": "HyperCLOVAX SEED(공공 이용 조건 확인 중)", "family": "HyperCLOVA X SEED 1.5B", "gpu": "GPU1"},
    # 폴백
    "ollama": {"base": _env("LX_LLM_OLLAMA_URL", "http://127.0.0.1:11434/v1"), "model": _env("LX_LLM_OLLAMA_MODEL", "qwen3:4b-instruct"),
               "label": "Ollama", "license": "Apache-2.0", "family": "Qwen3 4B instruct", "gpu": "GPU0/1 상주"},
}
CHAIN = ["vllm", "ollama"]            # 계획자·작성자 사슬 (라우터는 별도 · 죽으면 규칙 분류)
LLM_EXTERNAL = False                   # 외부 클라우드 호출 0 — 바꾸는 코드 경로 없음
ALLOW_HOSTS = {"127.0.0.1", "localhost", "::1"} | {h for h in _env("LX_LLM_ALLOW_HOSTS", "").split(",") if h}

HEALTH_TIMEOUT_S = 2.0
HEALTH_TTL_S = 30
CONNECT_TIMEOUT_S = 0.6
READ_TIMEOUT_S = 90.0
MAX_ROUNDS = 4                         # 도구 왕복 상한
MAX_TOKENS_ANSWER = 700
CONFIRM_TTL_S = 60
RUN_STREAM_MAXLEN = 2000
RUN_STREAM_TTL_S = 24 * 3600


def host_allowed(url: str) -> bool:
    """온프레미스 강제: 루프백(또는 명시 허용 사설 노드)만. 외부 클라우드 URL 이면 False."""
    h = (urlparse(url).hostname or "").lower()
    return h in ALLOW_HOSTS
