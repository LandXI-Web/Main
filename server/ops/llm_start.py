"""언어 모델 '켜기'(C9 원스톱 · c2-ops) — 꺼져 있을 때만, 전력·GPU 점유 검사 뒤 기존 가동 스크립트를 백그라운드로 부른다.

규칙(2026-09-26 전력 셧다운 · CLAUDE.md §4):
  - 끄기·재시작은 없다. 켜진 모델은 절대 다시 띄우지 않는다(두뇌가 켜져 있으면 두뇌 컨테이너를 건드리는 명령을 만들지 않는다).
  - 다른 GPU 가 고부하면 거절(두 장 동시 고부하 금지). 대상 GPU 가 바쁘면 거절(분석 작업이 도는 중).
  - 두뇌(Gemma 4)가 꺼져 있으면 infra/llm/launch-vllm.ps1(드라이버·VRAM·전력 사전 점검 포함)을 부른다. 라우터도 꺼져 있으면 -Router.
  - 두뇌는 켜져 있고 라우터만 꺼져 있으면 docker compose … up -d --no-recreate router (두뇌 컨테이너 재생성 0).
decide() 는 순수 함수(테스트 = 모의 상태) · spawn() 만 실제로 프로세스를 띄운다.
"""
from __future__ import annotations

import os
import subprocess
from pathlib import Path

SERVER_ROOT = Path(__file__).resolve().parents[1]
LLM_DIR = SERVER_ROOT.parent / "infra" / "llm"
SCRIPT = LLM_DIR / "launch-vllm.ps1"
COMPOSE = LLM_DIR / "docker-compose.vllm.yml"
ENV_FILE = LLM_DIR / ".env"
SLOTS = ("brain", "router")                     # 켜기가 있는 줄(예비 모델 · 국산 모델 연결은 켜기 없음)
BUSY_UTIL_PCT = 30                              # launch-vllm.ps1 $BusyUtilPct 와 같은 선

MSG = {
    "already_on": "이미 켜져 있습니다.",
    "starting": "켜는 중입니다. 몇 분 뒤 상태가 바뀝니다.",
    "power": "다른 GPU 가 고부하라 지금은 켤 수 없습니다. 작업이 끝난 뒤 다시 누르세요.",
    "busy": "이 모델이 쓰는 GPU 에서 분석 작업이 도는 중입니다. 끝난 뒤 다시 누르세요.",
    "bad_slot": "켤 수 있는 모델이 아닙니다.",
    "no_script": "가동 스크립트가 없어 켤 수 없습니다.",
    "ok": "켜기를 시작했습니다. 준비되기까지 몇 분 걸립니다.",
}


def gpu_index(label) -> int | None:
    """'GPU1' · 'GPU 1' → 1 · 그 밖 None."""
    s = "".join(ch for ch in str(label or "") if ch.isdigit() or ch == "/")
    return int(s) if s.isdigit() else None


def decide(slot: str, on: dict, power: dict, gpus: list[dict], target_gpu: int = 1, starting: bool = False,
           script_exists: bool = True) -> dict:
    """→ {ok, code, message, cmd?}. on = {'brain': bool, 'router': bool} · power = power_budget_now() 모양({ok, hot:[idx]}) ·
    gpus = [{'index': i, 'util': %}] (이동평균 부하)."""
    def no(code):
        return {"ok": False, "code": code, "message": MSG[code]}
    if slot not in SLOTS:
        return no("bad_slot")
    if on.get(slot):
        return no("already_on")
    if starting:
        return no("starting")
    other_hot = [i for i in (power.get("hot") or []) if i != target_gpu]
    other_busy = [g["index"] for g in gpus if g.get("index") != target_gpu and (g.get("util") or 0) >= BUSY_UTIL_PCT]
    if power.get("ok") is False or other_hot or other_busy:
        return no("power")
    tgt = next((g for g in gpus if g.get("index") == target_gpu), None)
    if tgt and (tgt.get("util") or 0) >= BUSY_UTIL_PCT:
        return no("busy")
    if slot == "brain":
        if not script_exists:
            return no("no_script")
        cmd = ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(SCRIPT), "-Gpu", str(target_gpu)]
        if not on.get("router"):
            cmd.append("-Router")                 # 둘 다 꺼져 있을 때만 함께(두뇌가 꺼져 있으니 재생성해도 켜진 것을 내리지 않는다)
        return {"ok": True, "code": "ok", "message": MSG["ok"], "cmd": cmd}
    # 라우터만: 두뇌 컨테이너는 그대로(--no-recreate · 서비스 이름 router 하나)
    cmd = ["docker", "compose", "-f", str(COMPOSE), "--env-file", str(ENV_FILE), "--profile", "router", "up", "-d", "--no-recreate", "router"]
    return {"ok": True, "code": "ok", "message": MSG["ok"], "cmd": cmd}


def spawn(cmd: list[str]) -> int:
    """백그라운드(창 없음 · 부모와 분리)로 띄우고 pid 를 돌려준다. 출력은 infra/llm/logs/ops-start-*.log."""
    import datetime as dt
    logs = LLM_DIR / "logs"
    logs.mkdir(parents=True, exist_ok=True)
    f = open(logs / ("ops-start-" + dt.datetime.now().strftime("%Y%m%d-%H%M%S") + ".log"), "ab")
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0) | getattr(subprocess, "DETACHED_PROCESS", 0) | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
    env = dict(os.environ)
    p = subprocess.Popen(cmd, cwd=str(LLM_DIR), stdout=f, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL, creationflags=flags, env=env,
                         close_fds=True)
    return p.pid
