"""12분류 공식 이름 → 뜻 묶음(10-25) 시험 — DB · GPU 없이.

python -m pytest server/change/tests/test_groups.py -q
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from change import detect as D  # noqa: E402

# 0 비대상지 · 1 건물 · 2 주차장 · 3 도로 · 4 가로수 · 5 논 · 6 비닐하우스 · 7 밭 · 8 활엽수림 · 9 침엽수림 · 10 나지 · 11 수역
WANT = {0: 0, 1: 1, 2: 2, 3: 2, 4: 0, 5: 3, 6: 3, 7: 3, 8: 4, 9: 4, 10: 6, 11: 5}


def test_group_map_official():
    got = D.group_map(np.arange(12, dtype=np.uint8)).tolist()
    assert got == [WANT[c] for c in range(12)]
    assert D.GNAME[D.G["other"]] == "나지"


def test_landslide_counts_bare_not_excluded():
    ga = D.group_map(np.array([[8, 9, 8, 8, 9]], np.uint8))          # 활엽 · 침엽 · 활엽 · 활엽 · 침엽
    gb = D.group_map(np.array([[10, 0, 2, 1, 4]], np.uint8))         # 나지 · 비대상지 · 주차장 · 건물 · 가로수
    m = D.transitions(ga, gb, "landslide")
    assert m["산림 → 나지"].tolist() == [[True, False, False, False, False]]   # 비대상지 · 가로수는 세지 않음
    assert m["산림 → 도로"].tolist() == [[False, False, True, False, False]]   # 주차장 = 도로 쪽
    assert m["산림 → 건물"].tolist() == [[False, False, False, True, False]]


def test_change_types():
    ga = D.group_map(np.array([[10, 10, 5, 10, 0, 7, 2]], np.uint8))  # 나지 · 나지 · 논 · 나지 · 비대상지 · 밭 · 주차장
    gb = D.group_map(np.array([[7, 3, 3, 1, 1, 10, 1]], np.uint8))    # 밭 · 도로 · 도로 · 건물 · 건물 · 나지 · 건물
    m = D.transitions(ga, gb)
    assert m["경작 전환"].tolist() == [[True, False, False, False, False, False, False]]
    assert m["포장 확대"].tolist() == [[False, True, True, False, False, False, False]]
    assert m["신축"].tolist() == [[False, False, False, True, False, False, False]]   # 비대상지 → 건물 · 주차장 → 건물은 세지 않음
    assert not m["경작 전환"][0, 5] and not m["포장 확대"][0, 5]                        # 밭 → 나지는 국토 변화 유형 아님


def test_burn_road_bare():
    gm = D.group_map(np.array([[10, 1, 0, 7]], np.uint8))
    rm = np.array([[True, True, True, True]])
    assert D.burn_road(gm, rm).tolist() == [[D.G["road"], D.G["road"], 0, D.G["crop"]]]
