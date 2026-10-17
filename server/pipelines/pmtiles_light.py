"""먼 축척 조각 — 결과 PMTiles 의 얕은 줌(≤ LIGHT_Z · 시군구 전체가 보이는 줌) 조각을 다시 굽는다(10-15 가벼운 조각 · 10-17 줌아웃-보이게 원칙 267).

10-17 고침(원칙 267 — "줌 아웃 상태에서는 전혀 모른다"): 멀리서도 객체가 사라지지 않게.
- 얕은 줌 조각은 원래 조각이 아니라 **모든 객체가 들어 있는 첫 줌(BASE_Z = 13)의 조각을 네 장씩 모아** 위로 굽는다(13 → 12 → … → FAR_MIN_Z).
  ogr2ogr 는 얕은 줌에서 조각 크기 한도로 작은 객체를 버린다(남원 토지피복 줌 10: 12만 9천 중 4만 4천만 남음) — 이제 버리지 않는다.
- 화면 1px 보다 작은 면도 **원래 모양 그대로 둔다**(전에는 분류별로 넓이를 모아 1px 네모 하나로 — 비닐하우스 다섯 동이 한 점이 되어 사라졌다).
  같은 분류의 작은 면이 **같은 화면 1px 칸에 여럿**이면 그 칸의 첫 하나만 남긴다(화면에서는 같은 자리 · 같은 색이라 보이는 모양은 같고 조각만 준다).
  너무 작아 조각 눈금(1/8px)에서 사라질 면은 1/4px 네모로 둔다 — 지도는 화면 기준 최소 굵기 테두리로 그려 몇 px 크기로 보인다(xi/fx/arrive.js FAR).
- 1px 보다 큰 면은 화면 0.5px 안에서 꼭짓점을 줄인다(모양 유지). 조각 경계에 걸친 객체 조각은 하나로 합친다(이음선 없음).
- 결과 조각이 없던 줌 8 · 9 도 굽는다(줌 범위 최소 = FAR_MIN_Z) — 시군구보다 멀리 봐도 결과가 보인다.
- 속성: 지도 색 · 고르기에 쓰는 것만(id · cls). 누르면 /ximap/feature 가 원래 속성을 준다(tiles.py SLIM 과 같은 규칙).
- 가까운 줌(> LIGHT_Z) 조각 · 층 이름은 그대로. 숫자(집계)는 결과 파일이 아니라 데이터베이스 · GeoJSON 에서 나오므로 바뀌지 않는다.
- CPU 만 쓴다(학습 장비 0). 같은 파일을 두 번 돌려도 같다(메타데이터 'lx_light' 판이 VERSION 이면 건너뜀).

사용(CLI): python server/pipelines/pmtiles_light.py <file.pmtiles>...   (--force 표시가 있어도 다시)
"""
from __future__ import annotations

import gzip
import json
import os
import sys
import time
from pathlib import Path

LIGHT_Z = 12           # 이 줌 이하 = 먼 축척(다시 굽는 줌)
BASE_Z = 13            # 모든 객체가 들어 있는 첫 줌 — 먼 축척은 이 줌 조각에서 위로 모은다
FAR_MIN_Z = 8          # 먼 축척을 이 줌까지 굽는다(줌 범위 최소)
KEEP = ("id", "cls")
TOL_PX = 0.5           # 작은 면보다 큰 면의 단순화 허용(화면 px · 조각 512px)
SMALL_TOL_PX = 0.25    # 작은 면의 단순화 허용(모양을 거의 그대로)
MIN_PX = 1.0           # 조각 눈금에서 사라질 만큼 작은 면은 이 크기 네모로
# 줌마다: (같은 자리 칸 크기 px, 큰 면 단순화 px, 조각 눈금) — 시군구 전체(줌 ≤ 11)는 2px 칸 · 1px 단순화 · 눈금 1024(화면 0.5px)
#   지도는 작은 객체를 2px 테두리 + 흰 바깥 테두리(약 4px)로 그리므로 2px 칸 안의 같은 분류 작은 면은 화면에서 한 모양이다.
ZOOM_RULE = {12: (1.0, 0.5, 4096)}
FAR_RULE = (2.0, 1.0, 1024)
# 넓은 면 분류(지도에서 1px 테두리 · 옅은 채움 — landxi/xi/fx/arrive.js LARGE_CLS 와 같은 목록)는 같은 자리 칸 · 단순화를 두 배로 —
# 작은 객체(비닐하우스 · 건물 · 주차장 …)는 하나도 버리지 않고, 시군구 전체 조각의 무게는 경작지 조각이 늘리지 않게(기관 XI맵 처음 열기)
LARGE_CLS = {"경작지", "비경작지", "농지", "논", "밭", "과수원", "산림", "초지", "나지", "수역", "토지피복", "식생 늘어남", "식생 줄어듦",
             "farmland", "cropland", "veg_gain", "veg_loss"}
LARGE_K = 2.0
BUF_PX = 8             # 조각 가장자리 여유(화면 px) — 테두리가 조각 경계에서 잘리지 않게
MARK = "lx_light"
VERSION = 2


def _decode(raw: bytes, gz: bool) -> dict:
    import mapbox_vector_tile as mvt
    return mvt.decode(gzip.decompress(raw) if gz else raw, default_options={"y_coord_down": True})


def _union(gs: list):
    """조각 경계에 걸친 같은 객체 조각 합치기 — 꼬인 모양(자기 교차)은 고쳐서 합친다"""
    from shapely.ops import unary_union
    from shapely.validation import make_valid
    try:
        return unary_union(gs)
    except Exception:  # noqa: BLE001 — GEOS TopologyException
        try:
            return unary_union([make_valid(g).buffer(0) for g in gs])
        except Exception:  # noqa: BLE001
            return max(gs, key=lambda g: g.area)


def _gather(children: list, ext: int) -> dict:
    """자식 조각 넷(부모 좌표로 옮김) → 층 이름 → {객체 열쇠: [모양, 속성, id]} — 조각 경계에 걸친 같은 객체는 합친다."""
    from shapely import affinity
    from shapely.ops import unary_union
    out: dict = {}
    for (cx, cy), layers in children:
        for name, feats in layers.items():
            box_ = out.setdefault(name, {})
            for g, props, fid in feats:
                g = affinity.affine_transform(g, [0.5, 0, 0, 0.5, cx * ext / 2, cy * ext / 2])
                k = props.get("id", fid)
                if k is None:
                    k = ("_", len(box_))
                if k in box_:
                    box_[k][0].append(g)
                else:
                    box_[k] = [[g], props, fid]
    merged: dict = {}
    for name, box_ in out.items():
        lst = []
        for k, (gs, props, fid) in box_.items():
            g = gs[0] if len(gs) == 1 else _union(gs)
            lst.append((g, props, fid))
        merged[name] = lst
    return merged


def _far(feats: list, ext: int, clip, z: int) -> list:
    """한 줌 높인(멀어진) 조각의 객체 — 작은 면은 원래 모양 · 같은 칸(1~2px)의 같은 분류 작은 면은 하나만 · 큰 면은 0.5~1px 단순화."""
    from shapely.geometry import box
    px = ext / 512
    occ, tol, _ = ZOOM_RULE.get(z, FAR_RULE)
    seen: set = set()
    out = []
    for g, props, fid in feats:
        if g.is_empty:
            continue
        try:
            if not g.intersects(clip):
                continue
        except Exception:  # noqa: BLE001 — 꼬인 모양은 고쳐서
            from shapely.validation import make_valid
            g = make_valid(g)
        t = g.geom_type
        k = LARGE_K if props.get("cls") in LARGE_CLS else 1.0
        if t.endswith("Polygon"):
            x0, y0, x1, y1 = g.bounds
            cs = occ * k * px
            if max(x1 - x0, y1 - y0) < cs:                      # 화면 칸(작은 객체 1~2px · 넓은 면 2~4px) 보다 작은 면
                cell = (props.get("cls"), int((x0 + x1) / 2 // cs), int((y0 + y1) / 2 // cs))
                if cell in seen:
                    continue                                   # 같은 칸 · 같은 분류 = 화면에서 같은 자리(보이는 모양 같음)
                seen.add(cell)
                if min(x1 - x0, y1 - y0) < MIN_PX * px:            # 조각 눈금에서 납작해질 면 — 그 자리 · 그 길이로 최소 폭 네모
                    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
                    hw, hh = max(x1 - x0, MIN_PX * px) / 2, max(y1 - y0, MIN_PX * px) / 2
                    g = box(cx - hw, cy - hh, cx + hw, cy + hh)
                else:
                    s = g.simplify(SMALL_TOL_PX * px, preserve_topology=True)
                    g = s if not s.is_empty and s.area > 0 else g.envelope
            else:
                s = g.simplify(tol * k * px, preserve_topology=True)
                g = s if not s.is_empty and s.area > 0 else g.envelope
        elif t.endswith("LineString"):
            s = g.simplify(tol * px, preserve_topology=True)
            g = s if not s.is_empty else g
        out.append((g, props, fid))
    return out


def _encode(layers: dict, ext: int, gz: bool, clip, z: int) -> bytes | None:
    import mapbox_vector_tile as mvt
    from mapbox_vector_tile.encoder import on_invalid_geometry_make_valid
    from shapely import affinity
    eo = ZOOM_RULE.get(z, FAR_RULE)[2]
    k = eo / ext
    out = []
    for name, feats in layers.items():
        fl = []
        for g, props, fid in feats:
            try:
                inside = clip.contains(g)
            except Exception:  # noqa: BLE001
                inside = False
            if not inside:
                try:
                    g = g.intersection(clip)
                except Exception:  # noqa: BLE001 — 꼬인 모양
                    from shapely.validation import make_valid
                    g = make_valid(g).buffer(0).intersection(clip)
                if g.is_empty:
                    continue
                if g.geom_type == "GeometryCollection":
                    polys = [p for p in g.geoms if p.geom_type.endswith("Polygon")]
                    if not polys:
                        continue
                    from shapely.ops import unary_union
                    g = unary_union(polys)
            if k != 1:
                g = affinity.scale(g, k, k, origin=(0, 0))
            ft = {"geometry": g, "properties": {a: v for a, v in props.items() if a in KEEP}}
            if fid is not None:
                ft["id"] = fid
            fl.append(ft)
        if fl:
            out.append({"name": name, "features": fl})
    if not out:
        return None
    enc = mvt.encode(out, default_options={"extents": eo, "y_coord_down": True, "on_invalid_geometry": on_invalid_geometry_make_valid})
    return gzip.compress(enc, 6, mtime=0) if gz else enc


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
    from shapely.geometry import box, shape

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
        mk = meta.get(MARK)
        if mk and isinstance(mk, dict) and mk.get("v") == VERSION and not force:
            return {"path": str(path), "skip": "already"}
        gz = h["tile_compression"] == Compression.GZIP
        raw = {(z, x, y): data for (z, x, y), data in all_tiles(r.get_bytes)}
    zs = sorted({k[0] for k in raw})
    if not zs:
        return {"path": str(path), "skip": "empty"}
    base = max(min(BASE_Z, zs[-1]), zs[0])
    before = sum(len(d) for k, d in raw.items() if k[0] <= LIGHT_Z)
    near = {k: d for k, d in raw.items() if k[0] >= base and (k[0] > LIGHT_Z or k[0] == base)}
    far_out: dict = {}
    if base > FAR_MIN_Z:
        # 첫 줌(base) 조각을 풀어 둔다 — 층 → [(모양, 속성, id)]
        ext = 4096
        cur: dict = {}
        for (z, x, y), d in raw.items():
            if z != base:
                continue
            L = _decode(d, gz)
            lay = {}
            for name, l in L.items():
                ext = int(l.get("extent") or ext)
                fl = []
                for ft in l.get("features", []):
                    try:
                        g = shape(ft["geometry"])
                    except Exception:  # noqa: BLE001
                        continue
                    if g.is_empty:
                        continue
                    if not g.is_valid:
                        g = g.buffer(0)
                    props = {k: v for k, v in (ft.get("properties") or {}).items() if k in KEEP}
                    fl.append((g, props, ft.get("id")))
                lay[name] = fl
            cur[(x, y)] = lay
        buf = ext / 512 * BUF_PX
        clip = box(-buf, -buf, ext + buf, ext + buf)
        for z in range(base - 1, FAR_MIN_Z - 1, -1):
            parents: dict = {}
            for (x, y), lay in cur.items():
                parents.setdefault((x // 2, y // 2), []).append(((x % 2, y % 2), lay))
            nxt: dict = {}
            for (px_, py_), ch in parents.items():
                merged = _gather(ch, ext)
                lay = {name: _far(fl, ext, clip, z) for name, fl in merged.items()}
                lay = {k: v for k, v in lay.items() if v}
                if not lay:
                    continue
                data = _encode(lay, ext, gz, clip, z)
                if data:
                    far_out[(z, px_, py_)] = data
                nxt[(px_, py_)] = lay
            cur = nxt
    tiles = [(zxy_to_tileid(*k), d) for k, d in {**near, **far_out}.items()]
    after = sum(len(d) for k, d in far_out.items())
    tiles.sort(key=lambda t: t[0])
    hh = dict(h)
    hh["min_zoom"] = min(int(h["min_zoom"]), FAR_MIN_Z) if base > FAR_MIN_Z else int(h["min_zoom"])
    meta = {**meta, MARK: {"v": VERSION, "z": LIGHT_Z, "base": base, "min": hh["min_zoom"], "keep": list(KEEP), "rule": {str(z): ZOOM_RULE.get(z, FAR_RULE) for z in range(FAR_MIN_Z, LIGHT_Z + 1)}, "large_k": LARGE_K}}
    for vl in meta.get("vector_layers") or []:
        if isinstance(vl, dict) and "minzoom" in vl:
            vl["minzoom"] = min(int(vl["minzoom"]), hh["min_zoom"])
    tmp = path.with_name(path.stem + ".light.tmp")
    with open(tmp, "wb") as f:
        w = Writer(f)
        for tid, data in tiles:
            w.write_tile(tid, data)
        w.finalize(hh, meta)
    if backup_dir:
        backup_dir.mkdir(parents=True, exist_ok=True)
        import shutil
        bk = backup_dir / (path.parent.name + "__" + path.name)
        if not bk.exists():
            shutil.copy2(path, bk)
    _swap(tmp, path)
    by_z: dict = {}
    for k, d in far_out.items():
        by_z[k[0]] = by_z.get(k[0], 0) + len(d)
    return {"path": str(path), "far_before": before, "far_after": after, "far_by_z": dict(sorted(by_z.items())), "base": base, "s": round(time.time() - t0, 1)}


if __name__ == "__main__":
    a = [x for x in sys.argv[1:] if not x.startswith("--")]
    for p in a:
        print(json.dumps(lighten(Path(p), force="--force" in sys.argv), ensure_ascii=False))
