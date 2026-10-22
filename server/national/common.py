"""전국 결과 자산 공용 — DB 연결 · 설정 · 쉬는 시간 판정(재학습과 같은 'core.retrain' 시간대 · 같은 대기열 규칙)."""
from __future__ import annotations

import datetime as dt
import json
import sys
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from landxi_api import config  # noqa: E402

KST = ZoneInfo("Asia/Seoul")
ASSETS = ("farm", "river")
ASSET_NAME = {"farm": "농지 전수", "river": "하천 · 계곡"}
# 칸이 끝났을 때 장부에 세는 분류(객체 중심이 칸 안) — 화면 숫자 한 출처
COUNT_CLS = {"farm": ("경작지", "비닐하우스"), "river": ("건물", "경작지", "비닐하우스")}
FACE_CLS = COUNT_CLS
DEF = {"enabled": True, "year": 2025, "assets": ["farm", "river"],
       "order": ["52", "12", "47", "44", "48", "43", "41", "51", "50", "36", "27", "31", "26", "28", "30", "11"],
       "river_buffer_m": 100, "fetch_max": 4,
       "model": "trained/job_01M4QKMB4X8F1JHJHD0D7HSR7Q"}   # 전국 분석 모델 = 경작지 새 판(10-13 경작지v2-처리 ⓐ · 학습 job_01M4QKMB4X8F1JHJHD0D7HSR7Q 의 best) — 기관 영상 분석은 지금 모델 그대로
QUIET_DEF = {"quiet_start": "22:00", "quiet_end": "06:00", "weekend": True}
OUT = config.DATA_ROOT / "national"          # E: 아래(작업 장부 로그 · 영상 API 설명 파일) — C: 에 아무것도 두지 않는다


def env_file() -> dict:
    out = {}
    p = config.SERVER_ROOT / ".env"
    if p.exists():
        for line in p.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                out[k] = v
    return out


def pg():
    import psycopg
    return psycopg.connect(env_file().get("PG_ADMIN_DSN") or config.PG_WORKER_DSN, autocommit=True)


def _jv(v):
    return json.loads(v) if isinstance(v, str) else (v or {})


def settings(c) -> dict:
    row = c.execute("SELECT value FROM lx_settings WHERE key='national.run'").fetchone()
    return {**DEF, **(_jv(row[0]) if row else {})}


def run_year(st: dict) -> int:
    """작업기가 지금 돌리는 해(10-22 바퀴 22 P6 시계열 — 2024 한 해 더). 화면 기본 해('year' · 끝난 해)와 따로 둔다:
    2024 를 돌리는 동안에도 XI맵 · 관리자 숫자는 끝난 2025 그대로(연도가 다른 숫자를 섞지 않음). 없으면 'year'."""
    return int(st.get("run_year") or st["year"])


def train_share() -> bool:
    """학습이 한 장을 쓰는 동안 전국 작업이 다른 한 장으로 이어 가나(pools.yaml power.national.train_share · 파일만 바꾸면 바로 · 기본 꺼짐).
    켜면 작업기(runner.other_gpu)와 워커(gpu_worker.other_job_waiting)가 학습 작업을 '비킬 작업'으로 세지 않는다 —
    학습은 train.gpu 장에서만 돌고(그 워커는 학습 중 칩을 받지 않음), 전국 칩은 두 장 모드의 다른 장이 받는다."""
    try:
        return bool(((config.load_yaml("pools").get("power") or {}).get("national") or {}).get("train_share", False))
    except Exception:  # noqa: BLE001
        return False


def quiet_settings(c) -> dict:
    row = c.execute("SELECT value FROM lx_settings WHERE key='core.retrain'").fetchone()
    v = _jv(row[0]) if row else {}
    return {k: v.get(k, QUIET_DEF[k]) for k in QUIET_DEF}


def _hm(s: str) -> int:
    h, m = str(s).split(":")
    return int(h) * 60 + int(m)


def quiet(st: dict, at: dt.datetime | None = None) -> bool:
    """쉬는 시간인가 — landxi_api.core.quiet 와 같은 규칙(시간대가 밤을 넘어가도 · 주말 하루 종일)."""
    at = (at or dt.datetime.now(KST)).astimezone(KST)
    if st.get("weekend") and at.weekday() >= 5:
        return True
    a, b, t = _hm(st["quiet_start"]), _hm(st["quiet_end"]), at.hour * 60 + at.minute
    return (a <= t < b) if a < b else (t >= a or t < b)


def quiet_end(st: dict, at: dt.datetime | None = None) -> dt.datetime:
    """지금 쉬는 시간이 끝나는 때(주말이면 월요일 quiet_end · 아니면 다음 quiet_end)."""
    at = (at or dt.datetime.now(KST)).astimezone(KST)
    e = _hm(st["quiet_end"])
    t = at.replace(hour=e // 60, minute=e % 60, second=0, microsecond=0)
    if t <= at:
        t += dt.timedelta(days=1)
    while st.get("weekend") and t.weekday() >= 5:
        t += dt.timedelta(days=1)
    return t


def next_quiet_start(st: dict, at: dt.datetime | None = None) -> dt.datetime:
    at = (at or dt.datetime.now(KST)).astimezone(KST)
    t = at.replace(second=0, microsecond=0)
    for _ in range(60 * 24 * 8 // 5):
        if quiet(st, t):
            return t
        t += dt.timedelta(minutes=5)
    return t
