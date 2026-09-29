"""에이전트 설정(F1-CONTRACT v1.1-23) — 백엔드 사슬 · 데이터 경로 · 한도.

URL 은 env 로 바꾼다(LX_LLM_*). 런타임에는 Redis hash `agent:backends` 가 env 를 덮는다(LX 관리자 화면용 · 컨테이너는 건드리지 않음).
모델 승격 자리(C2 · 09-24 결정): BACKENDS['dokpamo'] = 국산 독자 AI 파운데이션 모델(독파모). 기본 꺼짐 · URL·모델명은 env(LX_LLM_DOKPAMO_*) ·
켜지면(LX_LLM_DOKPAMO_ENABLED=1 + URL + 모델명) 작성자 사슬 맨 앞. 외부 호출 금지(host_allowed)는 그대로 — 온프레미스 주소만.
외부 클라우드 LLM 은 없다(LLM_EXTERNAL=off 고정 · 온프레미스만). 허용 호스트는 루프백 + LX_LLM_ALLOW_HOSTS.
"""
from __future__ import annotations

import os
import re
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
    # 모델 승격 자리(독파모) — 연결 전(꺼짐). 켜면 사슬 맨 앞(작성자·계획자)
    "dokpamo": {"base": _env("LX_LLM_DOKPAMO_URL", ""), "model": _env("LX_LLM_DOKPAMO_MODEL", ""),
                "enabled": _env("LX_LLM_DOKPAMO_ENABLED", "0").lower() in ("1", "true", "on", "yes"),
                "label": "국산 모델 연결", "license": "", "family": "국산 독자 AI 파운데이션 모델", "gpu": ""},
}


def backend_on(name: str) -> bool:
    """사슬에 넣을 수 있는 백엔드인가 — 독파모는 켜짐 + URL + 모델명 + 허용 호스트일 때만."""
    b = BACKENDS.get(name) or {}
    if name == "dokpamo":
        return bool(b.get("enabled") and b.get("base") and b.get("model") and host_allowed(b["base"]))
    return bool(b)


def chain() -> list[str]:
    return (["dokpamo"] if backend_on("dokpamo") else []) + ["vllm", "ollama"]


def run_dir(run_id: str) -> Path:
    """run 산출 폴더(LX_DATA_ROOT/agent/<run_id>/) — 도구가 .docx·.png 를 여기에 쓰고 file·image 블록으로 알린다."""
    if not re.fullmatch(r"[A-Za-z0-9_-]{4,64}", run_id or ""):
        raise ValueError("run_id 형식")
    d = ARTIFACT_DIR / run_id
    d.mkdir(parents=True, exist_ok=True)
    return d


RUN_FILE = re.compile(r"^[\w가-힣.() -]{1,100}\.(docx|png|jpg|jpeg|webp|csv|pdf|xlsx)$")


def run_href(run_id: str, name: str) -> str:
    """게이트웨이 내려받기 경로(권한 = run 소유 기관) — 화면에는 글자로 내지 않는다(버튼·이미지 src 로만)."""
    from urllib.parse import quote
    return f"/api/v1/agent/runs/{run_id}/files/{quote(name)}"


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


CHAIN = chain()                        # 계획자·작성자 사슬 (라우터는 별도 · 죽으면 규칙 분류) · 독파모는 켜졌을 때만 맨 앞
