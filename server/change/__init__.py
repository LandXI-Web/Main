"""국토 변화 분석서비스(변화 탐지) — 독립 모듈.

두 해 국토지리정보원 항공정사영상 → 토지피복 U-Net(ap25) ×2 → 피복 전이 → 변화 폴리곤 → 구역선 · 필지 교차.
기존 분석 서비스(경작·휴경 · 비닐하우스 · 건축물 · 주차장)와 표 · 파일 · 작업 종류를 나누지 않는다.

재사용(새로 쓰지 않음): geoai_roadland/src 의 ngii.py(타일 격자 · 주소) · landcover_unet.py(+models/ap25_best.pth)
· common.py(detect_belt_crs · parse_jimok · normalize_pnu) · detect.GROUP(12분류 공식 이름 → 뜻 묶음 · 10-25).
경로는 server/.env 의 LX_ROADLAND_ROOT(없으면 기본값) — 지역 이름은 코드에 없다(범위 · 연도는 데이터).
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

from landxi_api import config as _cfg

ROADLAND = Path(_cfg.get("LX_ROADLAND_ROOT", "E:/도로공사/geoai_roadland"))
RAW_ROOT = Path(_cfg.get("LX_ROADLAND_RAW", str(ROADLAND.parent)))
DATA = _cfg.DATA_ROOT / "change"            # 범위 · 결과 · 썸네일
TILE_CACHE = _cfg.DATA_ROOT / "cache" / "ngii-air"   # {year}/{z}/{col}_{row}.jpg — 범위 · 연도 · 줌 키로 다시 씀


def roadland_src() -> Path:
    src = ROADLAND / "src"
    s = str(src)
    if s not in sys.path:
        sys.path.insert(0, s)
    return src


def roadland_cfg() -> dict:
    roadland_src()
    import common as C  # noqa: E402 — geoai_roadland/src/common.py
    cfg = C.load_config(ROADLAND / "config.yaml")
    # config.yaml 의 상대 경로 · 원자료 루트를 이 PC 경로로(파일은 고치지 않음)
    cfg = dict(cfg)
    paths = dict(cfg.get("paths") or {})
    paths["cadastral_root"] = str(RAW_ROOT / "2025_01_전국연속도")
    paths["land_master_xlsx"] = str(RAW_ROOT / "★전국 고속국도 물량(ex토지마스터 추출)_251229_00.xlsx")
    cfg["paths"] = paths
    return cfg


os.environ.setdefault("PYTHONUTF8", "1")
