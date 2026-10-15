"""10-15 기관XI맵-가벼운타일 — 결과 PMTiles 의 먼 축척(≤ 12) 조각은 가볍게(속성 id · cls 만 · 도형 단순화), 가까운 줌은 그대로 · 객체 수는 같다."""
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
    assert meta.get(PL.MARK, {}).get("z") == PL.LIGHT_Z
    assert set(full) == set(light)                                   # 같은 조각 자리
    for k, L in light.items():
        z = k[0]
        for name, lay in L.items():
            ids_full = {f["properties"]["id"] for f in full[k][name]["features"]}
            ids_light = {f["properties"]["id"] for f in lay["features"]}
            assert ids_full == ids_light                              # 객체를 빼지 않는다
            for f in lay["features"]:
                if z <= PL.LIGHT_Z:
                    assert set(f["properties"]) <= {"id", "cls"}      # 먼 축척 = 속성 최소
                else:
                    assert {"conf", "pnu", "area"} <= set(f["properties"])   # 가까운 줌 = 그대로
    # 두 번 돌려도 같다(표시가 있으면 건너뜀)
    assert PL.lighten(tmp_path / "light.pmtiles").get("skip") == "already"
