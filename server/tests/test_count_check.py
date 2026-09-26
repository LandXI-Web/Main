import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "seed"))
from count_check import check  # noqa: E402


def test_count_check():
    assert check() == []
