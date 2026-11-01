"""경작·휴경 시기별 판정(11-01 PM 확정) — 촬영 월 읽기 · 맨흙 나누기(작은 가짜 영상 · 데이터베이스 없이).
다 자란 시기(8월 · 월 모름) = 경작지 안 넓은 맨흙 → 비경작지 / 모내기 철(6월) = 비경작지 안 넓은 맨흙 → 경작지 · 녹색은 그대로."""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from workers import postprocess as P  # noqa: E402
from workers import farm_season as FS  # noqa: E402


def test_shot_month_from_epoch_then_name():
    assert P.shot_month("2025-06") == 6 and P.shot_month("2025-08") == 8
    assert P.shot_month(None, "남원 2025.06 드론") == 6 and P.shot_month("2023", "영상 7월") == 7
    assert P.shot_month("2023", "남원 항공") is None


def _tif(tmp_path):
    import rasterio
    from rasterio.transform import from_origin
    x0, y0 = 226000.0, 302040.0                      # 40 m × 20 m · 5 cm · 왼쪽 반 맨흙(갈색) · 오른쪽 반 풀(녹색)
    w, h = 800, 400
    a = np.zeros((3, h, w), np.uint8)
    a[:, :, : w // 2] = np.array([150, 120, 95], np.uint8)[:, None, None]
    a[:, :, w // 2:] = np.array([70, 120, 50], np.uint8)[:, None, None]
    p = tmp_path / "t.tif"
    with rasterio.open(p, "w", driver="GTiff", width=w, height=h, count=3, dtype="uint8", crs="EPSG:5186", transform=from_origin(x0, y0, 0.05, 0.05)) as ds:
        ds.write(a)
    return p, x0, y0


def _feat(cls, x0, y0):
    from pyproj import Transformer
    from shapely.geometry import box
    from shapely.ops import transform as stx
    t = Transformer.from_crs(5186, 4326, always_xy=True).transform
    return {"geom": stx(t, box(x0 + 1, y0 - 19, x0 + 39, y0 - 1)), "props": {"cls": cls, "cls_en": "x", "id": 7, "fid": "r0c0-7"}}


def test_grown_season_splits_bare_out_of_farmland(tmp_path):
    p, x0, y0 = _tif(tmp_path)
    out, st = FS.split_bare([_feat("경작지", x0, y0)], p, 8)
    cls = sorted(f["props"]["cls"] for f in out)
    assert cls == ["경작지", "비경작지"] and st["split"] == 1 and 300 < st["m2"] < 380
    out, _ = FS.split_bare([_feat("경작지", x0, y0)], p, None)          # 월 모름 = 다 자란 시기
    assert sorted(f["props"]["cls"] for f in out) == ["경작지", "비경작지"]


def test_planting_season_turns_bare_into_farmland_only(tmp_path):
    p, x0, y0 = _tif(tmp_path)
    out, st = FS.split_bare([_feat("경작지", x0, y0)], p, 6)            # 모내기 철 — 경작지는 그대로
    assert [f["props"]["cls"] for f in out] == ["경작지"] and st["split"] == 0
    out, st = FS.split_bare([_feat("비경작지", x0, y0)], p, 6)          # 비경작지 안 맨흙(갈아 둔 논) → 경작지 · 녹색(잡초)은 비경작지
    assert sorted(f["props"]["cls"] for f in out) == ["경작지", "비경작지"] and st["split"] == 1
