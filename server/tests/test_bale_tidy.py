"""곤포 뭉치(10-31 XI 웹 개편 7) — 칩 경계에서 둘로 나뉜 뭉치 붙이기 · 낱개 곤포(약 2㎡) 최소 크기 · 칩 가장자리 토막이 큰 조각을 지우지 않게(데이터베이스 없이)."""
from __future__ import annotations

import sys
from pathlib import Path

from shapely.geometry import Point, box

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from national import tidy as T  # noqa: E402
from workers import postprocess as PP  # noqa: E402


def _p(i, cls="곤포사일리지", shard="r0c0", edge=False, conf=0.97):
    return {"id": f"{shard}-{i}", "cls": cls, "shard_id": shard, "chip_edge": edge, "conf": conf}


def test_bale_pieces_from_two_chips_merge_without_edge_flag():
    a, b = box(0, 0, 14, 5), box(12.5, 0, 18, 5)                    # 겹침 = 작은 쪽의 27 % · 가장자리 표시 없음(남원 6월 철도 옆 뭉치)
    g, p, st, _ = T.seam_merge([a, b], [_p(1, shard="r0c4"), _p(2, shard="r0c5")])
    assert st["merged_into"] == 1 and len(g) == 1 and abs(g[0].area - 90) < 0.5
    g, _, st, _ = T.seam_merge([a, b], [_p(1, cls="건물", shard="r0c4"), _p(2, cls="건물", shard="r0c5")])
    assert st["merged_into"] == 0                                    # 다른 분류는 지금 규칙 그대로(가장자리 표시 있어야)


def _f(g, shard, conf, cls="곤포사일리지"):
    from pyproj import Transformer
    from shapely.ops import transform as stx
    t = Transformer.from_crs(5186, 4326, always_xy=True).transform
    return {"geom": stx(t, g), "props": {"cls": cls, "cls_en": "silage_bale", "cid": 0, "conf": conf, "shard_id": shard, "chip_edge": False}}


def test_single_bale_kept_and_edge_stub_does_not_erase_larger_piece(monkeypatch):
    monkeypatch.setattr(PP, "resolve_sgg", lambda *a, **k: None)
    monkeypatch.setattr(PP, "emd_index_for", lambda *a, **k: None)
    x0, y0 = 226000.0, 302000.0
    one = Point(x0, y0).buffer(0.75)                                  # 곤포 한 개(지름 1.5 m · 약 1.8㎡)
    big = box(x0 + 10, y0, x0 + 18, y0 + 1.5)                         # 칩 c7 이 본 뭉치(12㎡)
    stub = box(x0 + 15, y0, x0 + 18, y0 + 1.5)                        # 칩 c8 가장자리 토막(신뢰도 더 높음)
    feats = [_f(one, "r0c1", 0.97), _f(big, "r0c7", 0.96), _f(stub, "r0c8", 0.98)]
    old, _ = PP.run([dict(x) for x in feats], task="seg", min_area=4.0)
    assert len(old) == 1 and old[0]["props"]["area_m2"] < 5            # 예전: 낱개 지워짐 · 큰 조각 대신 토막만
    new, _ = PP.run([dict(x) for x in feats], task="seg", min_area=4.0, cls_min_area=PP.SMALL_CLS_MIN_AREA)
    areas = sorted(f["props"]["area_m2"] for f in new)
    assert len(new) == 2 and areas[0] > 1.5 and areas[1] > 11
