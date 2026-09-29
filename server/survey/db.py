"""실태조사 공용 — 경로 · 정본 수치(README 표) · 출처 문자열 · 동기 PG 연결(파이프라인·어댑터·테스트).

게이트웨이(비동기)는 landxi_api.deps.db 를 쓰고, 여기 것은 워커·파이프라인용(psycopg 3).
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))   # server/
from landxi_api import config  # noqa: E402

SURVEY_DIR = config.DATA_ROOT / "survey"
REPLAY_DIR = SURVEY_DIR / "replay"
FINDINGS_EMD_JSON = SURVEY_DIR / "findings-emd.json"
RULES_DIR = Path(__file__).resolve().parent / "rules"
MIGRATION = config.SERVER_ROOT / "migrations" / "0002_survey.sql"

# ── 정본 적재 재현 전용(s5_load_pg · README 표 검증) — 런타임 경로는 지역을 데이터(survey_sgg · sgg_cd)에서 읽는다 ──
TENANT = "namwon"                         # s5_load_pg 만 쓴다(정본 파일의 기관)
AS_OF = "2026-09-24"                      # V-World 수집 · s3 결합 시각(README)
SRC_PARCELS = "survey/namwon-parcels.gpkg"
SRC_SURVEY = "survey/namwon-parcel-survey.gpkg"
SRC_SUSPECTS = "survey/namwon-parcel-suspects.csv"
SRC_SUMMARY = "survey/namwon-parcel-emd-summary.json"
SRC_TIMELINE = "survey/namwon-parcel-timeline.json"
IMG23 = "2023년 항공 정사영상(25cm)"
IMG25 = "2025년 드론 정사영상(촬영월 확인 전)"
LEDGER = "연속지적도(2026-09-24 기준)"
FIXED_PHRASE = "AI 추론 · 검수 전 · 현장 확인 전 · 위법 판정 아님"
AI_DRAFT = "AI 가 작성한 초안 · 사람 확인 필요"          # 보고서 서술 꼬리표(사용자 말)
AUTO_DRAFT = "자동 작성 문장 · 사람 확인 필요"
REPORT_SRC = "실태조사 결과(AI 분석 × 연속지적도)"         # 보고서 인용 출처(사용자 말 · 표 이름·코드 없음)
STATE_SRC = "현장조사 기록"


def imagery_label(s: str | None) -> str | None:
    """영상 표기(적재 때 문자열 그대로) → 사용자 말 '2023년 항공 정사영상(25cm)'. 연도·해상도·종류만 쓴다(도엽·AOI·코드 없음)."""
    import re
    if not s:
        return None
    t = str(s)
    y = re.search(r"(19|20)\d\d", t)
    r = re.search(r"(\d+(?:\.\d+)?)\s*(cm|m)(?![A-Za-z])", t)
    kind = "드론" if "드론" in t else "위성" if ("위성" in t or "satellite" in t.lower()) else "항공"
    out = (f"{y.group(0)}년 " if y else "") + f"{kind} 정사영상"
    if r:
        out += f"({r.group(1)}{r.group(2)})"
    elif "촬영월" in t:
        out += "(촬영월 확인 전)"
    return out

# README 표 — 적재 검증의 정답(하나라도 다르면 findings-emd.json 을 쓰지 않는다)
README_COUNTS = {
    "parcels": 332084,
    "area_km2": 749.25,
    "suspects": 20872,
    "suspect_parcels": 20852,
    "timeline": 6818,
    "emd": 39,
    "by_rule": {"R1": 4140, "R2": 15651, "R3": 20, "R4": 33, "R5": 464, "R6": 564},
    "by_priority": {"A": 1053, "B": 7386, "C": 12433},
    "by_rule_priority": {"R1": {"A": 759, "B": 2750, "C": 631}, "R2": {"A": 46, "B": 4295, "C": 11310},
                         "R3": {"A": 0, "B": 6, "C": 14}, "R4": {"A": 9, "B": 24, "C": 0},
                         "R5": {"A": 236, "B": 228, "C": 0}, "R6": {"A": 3, "B": 83, "C": 478}},
    "ai2023_objects": 129420,
}
RULE_IDS = ["R1", "R2", "R3", "R4", "R5", "R6"]
STATES = ["open", "assigned", "inspected", "closed", "dismissed"]


def pg(dsn: str | None = None):
    import psycopg
    return psycopg.connect(dsn or config.PG_WORKER_DSN, autocommit=False)


def lx_tx(conn):
    conn.execute("SELECT set_config('app.realm','lx',true), set_config('app.tenant_id','',true)")


def finding_id(rule: str, pnu: str) -> str:
    return f"f_{rule}_{pnu}"
