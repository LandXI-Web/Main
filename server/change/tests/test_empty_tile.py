"""국토지리정보원 남색 빈 칸(영상 없는 해 · 10-30 2016 열기) — 없음으로 보고, 일부만 남색이면 그 화소를 0 으로."""
import numpy as np

from change import imagery as I


def test_all_navy_is_missing():
    a = np.zeros((256, 256, 3), np.uint8) + np.array(I.EMPTY_RGB, np.uint8)
    assert I._drop_empty(a) is None


def test_flat_tile_is_missing():
    assert I._drop_empty(np.full((256, 256, 3), 120, np.uint8)) is None


def test_partial_navy_zeroed():
    rng = np.random.default_rng(0)
    a = rng.integers(30, 200, (256, 256, 3), dtype=np.uint8)
    a[:, :100] = I.EMPTY_RGB
    b = I._drop_empty(a)
    assert b is not None
    assert b[:, :100].max() == 0 and b[:, 100:].max() > 0


def test_real_tile_kept():
    rng = np.random.default_rng(1)
    a = rng.integers(30, 200, (256, 256, 3), dtype=np.uint8)
    assert np.array_equal(I._drop_empty(a), a)


def test_year_min():
    assert I.YEAR_MIN <= 2016
