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
       "river_buffer_m": 100, "fetch_max": 4}
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
