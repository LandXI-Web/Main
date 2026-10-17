"""10-15 기관XI맵-가벼운타일 · 10-17 줌아웃-보이게(원칙 267) — 결과 PMTiles 의 먼 축척(≤ 12) 조각은 가볍게(속성 id · cls 만 · 도형 단순화),
가까운 줌은 그대로 · 먼 줌에서도 작은 면을 버리지 않는다(같은 화면 칸의 같은 분류만 하나로) · 줌 8 부터 조각이 있다."""
import gzip
import json
from pathlib import Path

import pytest

from pipelines import pmtiles_light as PL
from pipelines.snapshot_pmtiles import build


def _fc(n=60):
    feats = []
    for i in range(n):
        x0, y0 = 127.38 + (i % 10) * 0.004, 35.40 + (i // 10) * 0.004
        ring = [[x0 + 0.0015 * k / 20, y0 + 0.0002 * ((k * 7) % 5)] for k in range(21)]
        ring += [[x0 + 0.0015, y0 + 0.0015], [x0, y0 + 0.0015], ring[0]]
        feats.append({"type": "Feature", "properties": {"id": f"f{i}", "cls": "비닐하우스", "conf": 0.9, "pnu": "5219010100100010000", "area": 12.5},
                      "geometry": {"type": "Polygon", "coordinates": [ring]}})
    return {"type": "FeatureCollection", "features": feats}


def _tiles(path):
    import mapbox_vector_tile as mvt
    from pmtiles.reader import Reader, all_tiles
    out = {}
    with open(path, "rb") as f:
        def get(o, n):
            f.seek(o)
            return f.read(n)
        r = Reader(get)
        meta = r.metadata()
        for (z, x, y), d in all_tiles(r.get_bytes):
            out[(z, x, y)] = mvt.decode(gzip.decompress(d))
    return out, meta


def test_light_far_zooms(tmp_path: Path):
    src = tmp_path / "a.geojson"
    src.write_text(json.dumps(_fc(), ensure_ascii=False), encoding="utf-8")
    try:
        build(src, tmp_path / "full.pmtiles", 10, 14, light=False)
    except Exception as e:  # noqa: BLE001
        pytest.skip(f"GDAL 없음: {e}")
    build(src, tmp_path / "light.pmtiles", 10, 14)
    full, _ = _tiles(tmp_path / "full.pmtiles")
    light, meta = _tiles(tmp_path / "light.pmtiles")
    assert meta.get(PL.MARK, {}).get("v") == PL.VERSION
    near = {k for k in full if k[0] > PL.LIGHT_Z}
    assert near <= set(light)                                        # 가까운 줌 조각 자리 그대로
    assert {k[0] for k in light} >= set(range(PL.FAR_MIN_Z, 15))      # 먼 줌(8 · 9)도 굽는다
    all_ids = {f["properties"]["id"] for k in near for lay in full[k].values() for f in lay["features"]}
    for z in range(PL.FAR_MIN_Z, PL.LIGHT_Z + 1):
        ids = set()
        for k, L in light.items():
            if k[0] != z:
                continue
            for lay in L.values():
                for f in lay["features"]:
                    assert set(f["properties"]) <= {"id", "cls"}      # 먼 축척 = 속성 최소
                    ids.add(f["properties"]["id"])
        if z >= 10:
            assert ids == all_ids                                     # 작은 면을 버리지 않는다(화면에서 2px 넘게 떨어진 60동 — 모두)
        else:
            assert ids and ids <= all_ids                             # 줌 8 · 9: 같은 2px 칸에 든 같은 분류만 하나로
    for k in near:
        for name, lay in light[k].items():
            for f in lay["features"]:
                assert {"conf", "pnu", "area"} <= set(f["properties"])   # 가까운 줌 = 그대로
    # 두 번 돌려도 같다(표시가 있으면 건너뜀)
    assert PL.lighten(tmp_path / "light.pmtiles").get("skip") == "already"


def test_far_same_cell_once():
    """같은 화면 칸의 같은 분류 작은 면은 하나만 · 다른 분류는 따로 · 큰 면은 그대로"""
    from shapely.geometry import box
    ext = 4096
    clip = box(-64, -64, ext + 64, ext + 64)
    tiny = [(box(100 + i, 100, 101 + i, 101), {"id": f"t{i}", "cls": "비닐하우스"}, None) for i in range(5)]
    other = [(box(100, 100, 101, 101), {"id": "b0", "cls": "건물"}, None)]
    big = [(box(1000, 1000, 1400, 1300), {"id": "f0", "cls": "경작지"}, None)]
    out = PL._far(tiny + other + big, ext, clip, 10)
    ids = [p["id"] for _, p, _ in out]
    assert ids.count("t0") == 1 and not {"t1", "t2", "t3", "t4"} & set(ids)
    assert "b0" in ids and "f0" in ids
    g = [g for g, p, _ in out if p["id"] == "t0"][0]
    assert min(g.bounds[2] - g.bounds[0], g.bounds[3] - g.bounds[1]) >= PL.MIN_PX * ext / 512 - 1e-9   # 납작해지지 않게 최소 폭
