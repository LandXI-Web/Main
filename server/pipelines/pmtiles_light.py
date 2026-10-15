"""먼 축척 가벼운 조각 — 결과 PMTiles 의 얕은 줌(≤ LIGHT_Z · 시군구 전체가 보이는 줌) 조각을 도형 단순화 · 속성 최소로 다시 굽는다(10-15 기관XI맵-가벼운타일).

- 도형: 화면 1px(조각 512px 기준) 안의 꼭짓점을 줄인다(모양 유지 — 줄여서 비면 그 객체의 외곽 네모).
  화면 1px² 보다 작은 면은 분류별로 넓이를 모아 1px² 마다 1px 네모 하나로(타일 도구의 작은 면 줄이기와 같은 방식 — 진하기 같고 객체 수만 준다).
- 속성: 지도 색 · 고르기에 쓰는 것만(id · cls). 누르면 /ximap/feature 가 원래 속성을 준다(tiles.py SLIM 과 같은 규칙).
- 가까운 줌(> LIGHT_Z) 조각 · 줌 범위 · 층 이름 · 메타데이터는 그대로. 숫자(집계)는 결과 파일이 아니라 데이터베이스 · GeoJSON 에서 나오므로 바뀌지 않는다.
- CPU 만 쓴다(학습 장비 0). 같은 파일을 두 번 돌려도 같다(메타데이터 'lx_light' 표시가 있으면 건너뜀).

사용(CLI): python server/pipelines/pmtiles_light.py <file.pmtiles>...   (--force 표시가 있어도 다시)
"""
from __future__ import annotations

import gzip
import json
import os
import sys
import time
from pathlib import Path

LIGHT_Z = 12
KEEP = ("id", "cls")
TOL_PX = 1.0           # 단순화 허용(화면 px · 조각 512px)
MARK = "lx_light"


def _light_tile(raw: bytes, gz: bool) -> bytes:
    import mapbox_vector_tile as mvt
    from mapbox_vector_tile.encoder import on_invalid_geometry_make_valid
    from shapely.geometry import box, shape

    data = gzip.decompress(raw) if gz else raw
    layers = mvt.decode(data, default_options={"y_coord_down": True})
    out, ext = [], 4096
    for name, L in layers.items():
        ext = int(L.get("extent") or 4096)
        tol = ext / 512 * TOL_PX
        px2 = (ext / 512) ** 2                     # 화면 1px² (조각 단위)
        acc: dict = {}                             # 분류별 1px² 보다 작은 면 넓이 누적
        feats = []
        for f in L.get("features", []):
            try:
                g = shape(f["geometry"])
            except Exception:  # noqa: BLE001
                continue
            if g.is_empty:
                continue
            props = {k: v for k, v in (f.get("properties") or {}).items() if k in KEEP}
            if g.geom_type.endswith("Polygon") and g.area < px2:
                # 1px² 보다 작은 면 — 분류별로 넓이를 모아 1px² 가 찰 때마다 1px 네모 하나(그 자리 · 그 객체 id) — 화면의 진하기는 같고 객체 수만 준다
                k = props.get("cls")
                acc[k] = acc.get(k, 0.0) + g.area
                if acc[k] < px2:
                    continue
                acc[k] -= px2
                c, hw = g.centroid, (ext / 512) / 2
                g = box(c.x - hw, c.y - hw, c.x + hw, c.y + hw)
            elif g.geom_type in ("Polygon", "MultiPolygon", "LineString", "MultiLineString"):
                s = g.simplify(tol, preserve_topology=True)
                if s.is_empty or (g.geom_type.endswith("Polygon") and s.area <= 0):
                    s = g.envelope if g.geom_type.endswith("Polygon") else g
                g = s
            ft = {"geometry": g, "properties": props}
            if f.get("id") is not None:
                ft["id"] = f["id"]
            feats.append(ft)
        out.append({"name": name, "features": feats})
    enc = mvt.encode(out, default_options={"extents": ext, "y_coord_down": True, "on_invalid_geometry": on_invalid_geometry_make_valid})
    return gzip.compress(enc, 6) if gz else enc


def _swap(tmp: Path, path: Path) -> None:
    """tmp → path. Windows 에서 다른 프로세스가 path 를 열어 두었으면 바꿔 넣기가 막힌다 —
    그때는 지금 파일을 옆 이름으로 비켜 두고(열린 채 이름 바꾸기는 됨) 새 파일을 넣는다. 비켜 둔 파일은 지울 수 있으면 지운다."""
    try:
        os.replace(tmp, path)
        return
    except PermissionError:
        pass
    old = path.with_name(path.name + f".old-{int(time.time())}")
    os.replace(path, old)
    os.replace(tmp, path)
    try:
        old.unlink()
    except OSError:
        pass                                # 연 쪽이 닫으면 지워도 된다(되돌림 사본은 backup_dir)


def lighten(path: Path, force: bool = False, backup_dir: Path | None = None, src: Path | None = None) -> dict:
    """path 를 제자리에서 다시 굽는다(임시 파일 → 바꿔 넣기). 되돌림 사본은 backup_dir 에(주면). src = 원래 조각을 읽을 파일(되돌림 사본에서 다시 구울 때)."""
    from pmtiles.reader import Reader, all_tiles
    from pmtiles.tile import Compression, TileType, zxy_to_tileid
    from pmtiles.writer import Writer

    path = Path(path)
    t0 = time.time()
    with open(src or path, "rb") as f:
        def get(off, ln):
            f.seek(off)
            return f.read(ln)
        r = Reader(get)                    # mmap 아님 — Windows 에서 바꿔 넣을 때 파일이 잡혀 있지 않게
        h = r.header()
        meta = r.metadata()
        if h["tile_type"] != TileType.MVT:
            return {"path": str(path), "skip": "not vector"}
        if meta.get(MARK) and not force:
            return {"path": str(path), "skip": "already"}
        gz = h["tile_compression"] == Compression.GZIP
        tiles, before, after = [], 0, 0
        for (z, x, y), data in all_tiles(r.get_bytes):
            if z <= LIGHT_Z:
                before += len(data)
                data = _light_tile(data, gz)
                after += len(data)
            tiles.append((zxy_to_tileid(z, x, y), data))
    tiles.sort(key=lambda t: t[0])
    meta = {**meta, MARK: {"z": LIGHT_Z, "keep": list(KEEP), "tol_px": TOL_PX}}
    tmp = path.with_name(path.stem + ".light.tmp")
    with open(tmp, "wb") as f:
        w = Writer(f)
        for tid, data in tiles:
            w.write_tile(tid, data)
        w.finalize(dict(h), meta)
    if backup_dir:
        backup_dir.mkdir(parents=True, exist_ok=True)
        import shutil
        bk = backup_dir / (path.parent.name + "__" + path.name)
        if not bk.exists():
            shutil.copy2(path, bk)
    _swap(tmp, path)
    return {"path": str(path), "far_before": before, "far_after": after, "s": round(time.time() - t0, 1)}


if __name__ == "__main__":
    a = [x for x in sys.argv[1:] if not x.startswith("--")]
    for p in a:
        print(json.dumps(lighten(Path(p), force="--force" in sys.argv), ensure_ascii=False))
