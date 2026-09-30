"""서버 다시 시작(C9 원스톱 · r3-ops) — LX 관리자 화면(인프라)에서 게이트웨이만 다시 띄운다.

지금까지는 명령줄(`start-landxi.ps1 -Restart gateway`)에서만 할 수 있었다. 화면의 '서버 다시 시작'이 같은 스크립트를
게이트웨이와 분리된 백그라운드 프로세스로 부른다(스크립트가 게이트웨이를 멈추고 → 마이그레이션 → 다시 띄우고 → 헬스를 기다린다).

하지 않는 것(CLAUDE.md §4): 작업기 · Ollama · vLLM · 정적 서버 · Docker 는 건드리지 않는다(-Restart gateway 경로가 그렇다).
decide() 는 순수 함수(테스트 = 모의 상태) · spawn() 만 실제로 프로세스를 띄운다.
"""
from __future__ import annotations

import datetime as dt
import os
import subprocess
from pathlib import Path

SERVER_ROOT = Path(__file__).resolve().parents[1]
SCRIPT = SERVER_ROOT / "start-landxi.ps1"
LOGS = Path(os.environ.get("LX_LOG_DIR") or r"E:\Land-XI 플랫폼\02. 데이터\_logs")
FLAG = "ops:gateway:restarting"          # Redis · 다시 시작 요청 중(연속 누름 막기) — 새 게이트웨이가 뜨면 지운다
FLAG_TTL_S = 120
NL = "\r\n"

MSG = {
    "ok": "서버를 다시 시작합니다. 잠시 연결이 끊겼다가 이어집니다.",
    "restarting": "서버를 다시 시작하는 중입니다. 잠시 뒤 다시 확인하세요.",
    "no_script": "기동 스크립트가 없어 다시 시작할 수 없습니다.",
}


def decide(restarting: bool, script_exists: bool = True) -> dict:
    """→ {ok, code, message, cmd?}"""
    if restarting:
        return {"ok": False, "code": "restarting", "message": MSG["restarting"]}
    if not script_exists:
        return {"ok": False, "code": "no_script", "message": MSG["no_script"]}
    cmd = ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(SCRIPT), "-Restart", "gateway"]
    return {"ok": True, "code": "ok", "message": MSG["ok"], "cmd": cmd}


def spawn(cmd: list[str], delay_s: float = 1.5) -> int:
    """게이트웨이와 분리해 띄운다(창 없음 · 새 프로세스 그룹 · 가능하면 작업 개체 밖). 스크립트가 게이트웨이를 멈춰도 살아남아야 한다.
    delay_s — 이 요청의 202 응답이 화면에 닿은 뒤 멈추도록 잠깐 기다렸다가 스크립트를 부른다.

    기록 = _logs/ops-restart-YYYYmmdd-HHMMSS.log. 예전(r3-ops 2차)에는 DETACHED_PROCESS 로 띄워 PowerShell 이 콘솔 없이 시작하자마자
    아무것도 하지 않고 끝났다(-Command 의 `*>>` 리다이렉트 · Set-Content 도 실행 0 — 한글 경로 문제가 아니었다). 이제 콘솔은 숨긴 채 두고
    (CREATE_NO_WINDOW) 기록 파일은 파이썬이 먼저 열어 머리줄을 쓰고, 그 핸들을 자식의 표준 출력 · 오류로 넘긴다(리다이렉트 문법 0)."""
    LOGS.mkdir(parents=True, exist_ok=True)
    log = LOGS / ("ops-restart-" + dt.datetime.now().strftime("%Y%m%d-%H%M%S") + ".log")
    ps = ("[Console]::OutputEncoding = [Text.Encoding]::UTF8; Start-Sleep -Milliseconds {ms}; "
          "& {cmd}; Write-Output ('[ops-restart] 끝 ' + (Get-Date -Format s) + ' · 종료 코드 ' + $LASTEXITCODE)").format(
        ms=int(delay_s * 1000),
        cmd=" ".join("'" + c.replace("'", "''") + "'" for c in cmd))
    argv = ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps]
    base = getattr(subprocess, "CREATE_NO_WINDOW", 0) | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
    breakaway = getattr(subprocess, "CREATE_BREAKAWAY_FROM_JOB", 0x01000000)
    fh = open(log, "ab")
    fh.write(("[ops-restart] 시작 " + dt.datetime.now().isoformat(timespec="seconds") + " · " + " ".join(cmd) + NL).encode("utf-8"))
    fh.flush()
    kw = dict(cwd=str(SERVER_ROOT), stdout=fh, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL, close_fds=True, env=dict(os.environ))
    try:
        try:
            p = subprocess.Popen(argv, creationflags=base | breakaway, **kw)
        except OSError:                               # 작업 개체가 밖으로 나가기를 막으면(접근 거부) 분리만 하고 띄운다
            p = subprocess.Popen(argv, creationflags=base, **kw)
    except OSError as e:
        fh.write(("[ops-restart] 띄우지 못함 " + str(e) + NL).encode("utf-8"))
        raise
    finally:
        fh.close()                                    # 자식은 자기 핸들을 물려받아 계속 쓴다
    return p.pid
