# -*- coding: utf-8 -*-
"""P16 — 전국 시군구 영상 공급(core-imagery): 로컬 도엽 원천 → 도엽 색인 → 시군구별 VRT → imagery 행.

원천·조건은 config/ladder.yaml `local_sources` 에서만 읽는다(지역 이름·코드 고정값 0).
  index     도엽 폴더 전부(TFW + GeoTIFF 헤더) → 02. 데이터/_work/c01_index.gpkg(시도 폴더 · 파일 · 외곽 4326 · 크기)
  register  시군구 경계(regions_base) ∩ 도엽 외곽 → _work/ap25_2023_{sgg}.vrt(EPSG:5186 · RGB + 알파) + imagery 행
            (id img-{sgg}-{year}-{kind} · tier raw · footprint = 도엽 합집합 ∩ 시군구 · layer.coverage)
            같은 시군구에 같은 해상도 영상이 이미 대부분 덮고 있으면(먼저 준비된 행) 건너뛴다.
  pmtiles   등록한 영상 한 건을 LX 전용 WebP PMTiles(tiles/imagery/{id}.pmtiles · 서명 세트)로 굽는다 — 지도 화면 표시용.
            가장 큰 줌은 원본 창 렌더, 그 아래 줌은 자식 4장을 줄여 만든다(원본을 다시 읽지 않음).
  status    등록 결과 요약.
사용: python server/pipelines/p16_imagery_nation.py index | register [--sgg 코드 …] [--dry] | pmtiles <sgg 또는 imagery id> [--workers N] | status
"""
from __future__ import annotations

import json
import math
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from landxi_api import config  # noqa: E402
from pipelines._common import log  # noqa: E402

WORK = config.DATA_ROOT / "_work"
INDEX = WORK / "c01_index.gpkg"


def sources() -> list[dict]:
    return list(config.load_yaml("ladder").get("local_sources") or [])


def _read_tfw(p: Path):
    v = [float(x) for x in p.read_text(encoding="ascii", errors="ignore").split()[:6]]
    return v          # a, d, b, e, c(x 중심), f(y 중심)


# ── index ───────────────────────────────────────────────────────────────────
def _sheet(args):
    src_id, sido_dir, tif = args
    import rasterio
    tfw = Path(tif).with_suffix(".tfw")
    if not tfw.exists():
        return None
    a, _d, _b, e, cx, cy = _read_tfw(tfw)
    try:
        with rasterio.open(tif) as ds:
            w, h, n, dt = ds.width, ds.height, ds.count, ds.dtypes[0]
    except Exception:
        return None
    x0, y0 = cx - a / 2, cy - e / 2           # 좌상단 모서리
    return {"src": src_id, "sido_dir": sido_dir, "file": str(tif).replace("\\", "/"), "w": w, "h": h, "bands": n, "dtype": dt,
            "res": abs(a), "x0": x0, "y0": y0, "x1": x0 + w * a, "y1": y0 + h * e}


def cmd_index():
    from multiprocessing import Pool

    import fiona
    from pyproj import Transformer
    from shapely.geometry import Polygon, mapping
    rows = []
    for s in sources():
        root = Path(s["root"])
        if not root.exists():
            log(f"[index] 원천 없음 {root}")
            continue
        jobs = []
        for sido in sorted(p for p in root.iterdir() if p.is_dir()):
            for tif in sorted(sido.rglob("*.tif")):
                jobs.append((s["id"], sido.name, str(tif)))
        log(f"[index] {s['id']} 도엽 {len(jobs)}장 헤더 읽기")
        t0 = time.time()
        with Pool(12) as pool:
            for r in pool.imap_unordered(_sheet, jobs, chunksize=16):
                if r:
                    rows.append({**r, "crs": s["crs"]})
        log(f"[index] {len(rows)}장 · {time.time()-t0:.0f}s")
    schema = {"geometry": "Polygon", "properties": {"src": "str", "sido_dir": "str", "file": "str", "w": "int", "h": "int", "bands": "int",
                                                     "dtype": "str", "res": "float", "x0": "float", "y0": "float", "x1": "float", "y1": "float",
                                                     "crs": "str"}}
    tmp = INDEX.with_suffix(".tmp.gpkg")
    if tmp.exists():
        tmp.unlink()
    tfs = {}
    with fiona.open(tmp, "w", driver="GPKG", schema=schema, crs="EPSG:4326", layer="sheets") as out:
        for r in sorted(rows, key=lambda x: x["file"]):
            tf = tfs.setdefault(r["crs"], Transformer.from_crs(r["crs"], 4326, always_xy=True))
            ring = [tf.transform(x, y) for x, y in ((r["x0"], r["y0"]), (r["x1"], r["y0"]), (r["x1"], r["y1"]), (r["x0"], r["y1"]))]
            out.write({"geometry": mapping(Polygon(ring)), "properties": r})
    tmp.replace(INDEX)
    log(f"[index] → {INDEX} ({len(rows)}장)")


def load_index() -> list[dict]:
    import fiona
    from shapely.geometry import shape
    with fiona.open(INDEX, layer="sheets") as src:
        return [{**dict(f["properties"]), "geom": shape(f["geometry"])} for f in src]


# ── VRT ─────────────────────────────────────────────────────────────────────
def _srs_wkt(crs: str) -> str:
    """VRT <SRS> 는 사용자 입력 문자열을 받는다 — 'EPSG:5186' 그대로 두어야 rasterio crs.to_epsg() 가 코드를 돌려준다."""
    from pyproj import CRS
    return CRS.from_user_input(crs).to_string()


def write_vrt(sheets: list[dict], crs: str, dst: Path) -> dict:
    """도엽 모자이크 VRT — RGB(SimpleSource) + 알파(ComplexSource 0·255 : 도엽이 있는 곳만 불투명). 원본 무수정."""
    from xml.sax.saxutils import escape
    res = sheets[0]["res"]
    minx = min(s["x0"] for s in sheets)
    maxy = max(s["y0"] for s in sheets)
    maxx = max(s["x1"] for s in sheets)
    miny = min(s["y1"] for s in sheets)
    W, H = int(round((maxx - minx) / res)), int(round((maxy - miny) / res))
    bands = []
    for b, ci in ((1, "Red"), (2, "Green"), (3, "Blue")):
        srcs = []
        for s in sheets:
            xo, yo = int(round((s["x0"] - minx) / res)), int(round((maxy - s["y0"]) / res))
            srcs.append(f"""    <SimpleSource>
      <SourceFilename relativeToVRT="0">{escape(s['file'])}</SourceFilename>
      <SourceBand>{b}</SourceBand>
      <SourceProperties RasterXSize="{s['w']}" RasterYSize="{s['h']}" DataType="Byte" BlockXSize="{s['w']}" BlockYSize="1" />
      <SrcRect xOff="0" yOff="0" xSize="{s['w']}" ySize="{s['h']}" />
      <DstRect xOff="{xo}" yOff="{yo}" xSize="{s['w']}" ySize="{s['h']}" />
    </SimpleSource>""")
        bands.append(f'  <VRTRasterBand dataType="Byte" band="{b}">\n    <ColorInterp>{ci}</ColorInterp>\n' + "\n".join(srcs) + "\n  </VRTRasterBand>")
    srcs = []
    for s in sheets:
        xo, yo = int(round((s["x0"] - minx) / res)), int(round((maxy - s["y0"]) / res))
        srcs.append(f"""    <ComplexSource>
      <SourceFilename relativeToVRT="0">{escape(s['file'])}</SourceFilename>
      <SourceBand>1</SourceBand>
      <SourceProperties RasterXSize="{s['w']}" RasterYSize="{s['h']}" DataType="Byte" BlockXSize="{s['w']}" BlockYSize="1" />
      <SrcRect xOff="0" yOff="0" xSize="{s['w']}" ySize="{s['h']}" />
      <DstRect xOff="{xo}" yOff="{yo}" xSize="{s['w']}" ySize="{s['h']}" />
      <ScaleOffset>255</ScaleOffset>
      <ScaleRatio>0</ScaleRatio>
    </ComplexSource>""")
    bands.append('  <VRTRasterBand dataType="Byte" band="4">\n    <ColorInterp>Alpha</ColorInterp>\n' + "\n".join(srcs) + "\n  </VRTRasterBand>")
    xml = (f'<VRTDataset rasterXSize="{W}" rasterYSize="{H}">\n  <SRS dataAxisToSRSAxisMapping="1,2">{escape(_srs_wkt(crs))}</SRS>\n'
           f"  <GeoTransform>{minx:.4f}, {res}, 0, {maxy:.4f}, 0, {-res}</GeoTransform>\n" + "\n".join(bands) + "\n</VRTDataset>\n")
    dst.parent.mkdir(parents=True, exist_ok=True)
    tmp = dst.with_suffix(".vrt.tmp")
    tmp.write_text(xml, encoding="utf-8")
    tmp.replace(dst)
    return {"width": W, "height": H, "bounds": [minx, miny, maxx, maxy]}


# ── register ────────────────────────────────────────────────────────────────
def _poly(g):
    from shapely.geometry import MultiPolygon
    if g.is_empty:
        return None
    if g.geom_type == "Polygon":
        return MultiPolygon([g])
    if g.geom_type == "MultiPolygon":
        return g
    polys = [p for p in getattr(g, "geoms", []) if p.geom_type in ("Polygon", "MultiPolygon")]
    out = [q for p in polys for q in (p.geoms if p.geom_type == "MultiPolygon" else [p])]
    return MultiPolygon(out) if out else None


def plan(sheets: list[dict], only: set[str] | None = None) -> list[dict]:
    """시군구마다 {sgg, name, sheets, footprint, coverage} — 덮는 비율이 원천 설정 min_coverage 이상인 곳만."""
    from shapely.strtree import STRtree
    from shapely.ops import unary_union
    from landxi_api.regions import regions_base
    regions, geoms, _ = regions_base()
    out = []
    by_src: dict[str, list[dict]] = {}
    for s in sheets:
        by_src.setdefault(s["src"], []).append(s)
    for src in sources():
        ss = by_src.get(src["id"]) or []
        if not ss:
            continue
        tree = STRtree([s["geom"] for s in ss])
        for r in regions:
            cd = r["sgg_cd"]
            if only and cd not in only and (r.get("prev_cd") or "") not in only:
                continue
            g = geoms.get(cd)
            if g is None or g.is_empty:
                continue
            idx = [int(i) for i in tree.query(g, predicate="intersects")]
            if not idx:
                continue
            hit = [ss[i] for i in idx]
            fp = _poly(unary_union([s["geom"] for s in hit]).intersection(g))
            if fp is None:
                continue
            cov = fp.area / max(g.area, 1e-12)
            if cov < float(src.get("min_coverage", 0.05)):
                continue
            # VRT 에는 경계 안에 실제로 걸치는 도엽만(모서리만 닿는 것 제외)
            hit = [s for s in hit if s["geom"].intersection(g).area > 0.002 * s["geom"].area]
            out.append({"sgg": cd, "prev_cd": r.get("prev_cd"), "name": r["name"], "src": src, "sheets": hit, "footprint": fp,
                        "coverage": round(min(cov, 1.0), 4)})
    return out


def _existing_cover(conn, cd: str, prev: str | None, fp, gsd: float, own_id: str) -> float:
    """같은 시군구에 이미 있는 같은 급(±20%) 영상이 이번 footprint 를 덮는 비율(내 행 제외)."""
    from shapely.geometry import shape
    from shapely.ops import unary_union
    rows = conn.execute("SELECT id, ST_AsGeoJSON(footprint) FROM imagery WHERE id<>%s AND footprint IS NOT NULL AND gsd_m BETWEEN %s AND %s "
                        "AND (sgg_cd = ANY(%s) OR sgg_cd IS NULL) AND coalesce(layer->>'role','imagery')='imagery'",
                        (own_id, gsd * 0.8, gsd * 1.2, [c for c in (cd, prev) if c])).fetchall()
    gs = [shape(json.loads(r[1])) for r in rows if r[1]]
    if not gs:
        return 0.0
    u = unary_union(gs)
    return u.intersection(fp).area / max(fp.area, 1e-12)


def image_id(cd: str, src: dict) -> str:
    return f"img-{cd}-{src['year']}-{src['kind']}"


def vrt_path(cd: str, src: dict) -> Path:
    return WORK / f"{src['id'].split('-')[0]}_{src['year']}_{cd}.vrt"


def cmd_register(only: set[str] | None = None, dry: bool = False):
    import psycopg
    from shapely.geometry import mapping
    t0 = time.time()
    sheets = load_index()
    items = plan(sheets, only)
    log(f"[register] 도엽 {len(sheets)}장 · 후보 시군구 {len(items)}곳")
    done, skipped = [], []
    with psycopg.connect(config.PG_ADMIN_DSN, autocommit=True) as c:
        for it in items:
            src, cd = it["src"], it["sgg"]
            iid = image_id(cd, src)
            cover = _existing_cover(c, cd, it["prev_cd"], it["footprint"], float(src["gsd_m"]), iid)
            if cover >= 0.5:
                skipped.append({"sgg": cd, "name": it["name"], "why": f"같은 급 영상이 이미 {cover:.0%} 덮음"})
                continue
            vp = vrt_path(cd, src)
            rel = vp.relative_to(config.DATA_ROOT).as_posix()
            name = f"{it['name']} {src['name_suffix']}"
            layer = {"role": "imagery", "cog_path": rel, "source_kind": src["kind"], "tile_ready": True, "coverage": it["coverage"],
                     "n_sheets": len(it["sheets"]), "local_source": src["id"], "index": INDEX.name}
            if not dry:
                info = write_vrt(it["sheets"], src["crs"], vp)
                layer["px"] = [info["width"], info["height"]]
                old = c.execute("SELECT layer FROM imagery WHERE id=%s", (iid,)).fetchone()
                if old and old[0]:                     # 구운 PMTiles 등 이전 값은 유지
                    for k in ("pmtiles_set", "pmtiles_minzoom", "pmtiles_maxzoom", "tile_job"):
                        if k in old[0]:
                            layer[k] = old[0][k]
                c.execute(
                    "INSERT INTO imagery(id, name, tier, gsd_m, epoch, crs, footprint, path_internal, license, attribution, export_policy, "
                    "security_review, rights_holder, ladder, kind, layer, sgg_cd, year, registered_by, registered_at) VALUES "
                    "(%s,%s,'raw',%s,%s,%s,ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(%s),4326)),%s,%s,%s,'never','pending',%s,%s,'ortho',%s,%s,%s,%s,now()) "
                    "ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, gsd_m=EXCLUDED.gsd_m, epoch=EXCLUDED.epoch, crs=EXCLUDED.crs, "
                    "footprint=EXCLUDED.footprint, path_internal=EXCLUDED.path_internal, license=EXCLUDED.license, attribution=EXCLUDED.attribution, "
                    "rights_holder=EXCLUDED.rights_holder, ladder=EXCLUDED.ladder, layer=EXCLUDED.layer, sgg_cd=EXCLUDED.sgg_cd, year=EXCLUDED.year",
                    (iid, json.dumps({"ko": name, "en": name}, ensure_ascii=False), src["gsd_m"], str(src["year"]), src["crs"],
                     json.dumps(mapping(it["footprint"])), rel, src["license"], src["attribution"], src["rights_holder"],
                     json.dumps(src["ladder"]), json.dumps(layer, ensure_ascii=False), cd, int(src["year"]), "p16_imagery_nation"))
            done.append({"id": iid, "sgg": cd, "name": it["name"], "coverage": it["coverage"], "sheets": len(it["sheets"])})
    for d in done:
        print(json.dumps(d, ensure_ascii=False))
    for s in skipped:
        print(json.dumps({"skip": s}, ensure_ascii=False))
    log(f"[register] 등록 {len(done)} · 건너뜀 {len(skipped)} · {time.time()-t0:.0f}s{' (dry)' if dry else ''}")
    return done, skipped


# ── pmtiles ─────────────────────────────────────────────────────────────────
def _tile_range(b, z):
    n = 2 ** z

    def tx(lon):
        return min(n - 1, max(0, int((lon + 180) / 360 * n)))

    def ty(lat):
        return min(n - 1, max(0, int((1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n)))
    return tx(b[0]), ty(b[3]), tx(b[2]), ty(b[1])


def _tile_box(z, x, y):
    from shapely.geometry import box
    n = 2 ** z

    def lat(yy):
        return math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * yy / n))))
    return box(x / n * 360 - 180, lat(y + 1), (x + 1) / n * 360 - 180, lat(y))


def _render_leaf(args):
    src, z, x, y = args
    from landxi_api.tiles import _render
    try:
        return z, x, y, _render(src, z, x, y)
    except Exception:
        return z, x, y, None


def _decode(buf):
    import cv2
    import numpy as np
    return cv2.imdecode(np.frombuffer(buf, np.uint8), cv2.IMREAD_UNCHANGED)


def _parent(children: dict, z: int, x: int, y: int):
    """자식 4장(z+1) → 부모 1장(z) — BGRA 512 모자이크를 256 으로 줄인다."""
    import cv2
    import numpy as np
    canvas = np.zeros((512, 512, 4), np.uint8)
    any_ = False
    for dx in (0, 1):
        for dy in (0, 1):
            b = children.get((z + 1, 2 * x + dx, 2 * y + dy))
            if b is None:
                continue
            im = _decode(b)
            if im is None:
                continue
            if im.shape[2] == 3:
                im = np.dstack([im, np.full(im.shape[:2], 255, np.uint8)])
            canvas[dy * 256:(dy + 1) * 256, dx * 256:(dx + 1) * 256] = im
            any_ = True
    if not any_:
        return None
    small = cv2.resize(canvas, (256, 256), interpolation=cv2.INTER_AREA)
    if small[:, :, 3].max() == 0:
        return None
    ok, out = cv2.imencode(".webp", small, [cv2.IMWRITE_WEBP_QUALITY, 82])
    return out.tobytes() if ok else None


def _resolve_id(key: str) -> tuple[str, str, dict, object]:
    import psycopg
    from shapely.geometry import shape
    with psycopg.connect(config.PG_ADMIN_DSN) as c:
        row = c.execute("SELECT id, path_internal, layer, ST_AsGeoJSON(footprint) FROM imagery WHERE id=%s OR "
                        "(sgg_cd=%s AND layer->>'local_source' IS NOT NULL) ORDER BY id LIMIT 1", (key, key)).fetchone()
    if not row:
        raise SystemExit(f"imagery 없음: {key}")
    p = row[1]
    full = p if (":" in p[:3] or os.path.isabs(p)) else str(config.DATA_ROOT / p)
    return row[0], full, row[2] or {}, shape(json.loads(row[3]))


def cmd_pmtiles(key: str, workers: int = 16):
    from multiprocessing import Pool

    import psycopg
    from pmtiles.tile import Compression, TileType, zxy_to_tileid
    from pmtiles.writer import Writer
    iid, path, layer, fp = _resolve_id(key)
    src_cfg = next((s for s in sources() if s["id"] == layer.get("local_source")), None) or {}
    zr = src_cfg.get("pmtiles") or {"minzoom": 11, "maxzoom": 18}
    zmin, zmax = int(zr["minzoom"]), int(zr["maxzoom"])
    fpp = fp.buffer(0.0005)
    x0, y0, x1, y1 = _tile_range(fp.bounds, zmax)
    leaves = [(path, zmax, x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1) if _tile_box(zmax, x, y).intersects(fpp)]
    log(f"[pmtiles] {iid} z{zmax} {len(leaves)}장 렌더 · 원천 {Path(path).name} · 프로세스 {workers}")
    t0 = time.time()
    tiles: dict[tuple, bytes] = {}
    with Pool(workers) as pool:
        for i, (z, x, y, buf) in enumerate(pool.imap_unordered(_render_leaf, leaves, chunksize=8)):
            if buf:
                tiles[(z, x, y)] = buf
            if i % 2000 == 0:
                log(f"  {i}/{len(leaves)} · {len(tiles)}장 · {time.time()-t0:.0f}s")
    log(f"[pmtiles] z{zmax} {len(tiles)}장 · {time.time()-t0:.0f}s")
    level = {k: v for k, v in tiles.items()}
    for z in range(zmax - 1, zmin - 1, -1):
        parents = {(z, x // 2, y // 2) for (_, x, y) in level}
        nxt = {}
        for (pz, px, py) in parents:
            b = _parent(level, pz, px, py)
            if b:
                nxt[(pz, px, py)] = b
        tiles.update(nxt)
        level = nxt
        log(f"  z{z} {len(nxt)}장")
    dst = config.DATA_ROOT / "tiles" / "imagery" / f"{iid}.pmtiles"
    dst.parent.mkdir(parents=True, exist_ok=True)
    tmp = dst.with_suffix(".tmp.pmtiles")
    b = fp.bounds
    c = fp.representative_point()
    with open(tmp, "wb") as f:
        w = Writer(f)
        for tid, buf in sorted((zxy_to_tileid(z, x, y), buf) for (z, x, y), buf in tiles.items()):
            w.write_tile(tid, buf)
        w.finalize({"tile_type": TileType.WEBP, "tile_compression": Compression.NONE, "min_zoom": zmin, "max_zoom": zmax,
                    "min_lon_e7": int(b[0] * 1e7), "min_lat_e7": int(b[1] * 1e7), "max_lon_e7": int(b[2] * 1e7), "max_lat_e7": int(b[3] * 1e7),
                    "center_zoom": zmin + 3, "center_lon_e7": int(c.x * 1e7), "center_lat_e7": int(c.y * 1e7)},
                   {"name": iid, "format": "webp", "type": "baselayer", "attribution": src_cfg.get("attribution", ""),
                    "note": "LX 내부 · 원본 무수정 재투영 렌더(서명 세트)"})
    tmp.replace(dst)
    set_id = f"imagery/{iid}"
    with psycopg.connect(config.PG_ADMIN_DSN, autocommit=True) as c2:
        c2.execute("UPDATE imagery SET layer = coalesce(layer,'{}'::jsonb) || jsonb_build_object('pmtiles_set', %s::text, "
                   "'pmtiles_minzoom', %s::int, 'pmtiles_maxzoom', %s::int) WHERE id=%s", (set_id, zmin, zmax, iid))
    log(f"[pmtiles] 완료 {dst.name} {dst.stat().st_size/1e6:.1f}MB · {len(tiles)}장 · {time.time()-t0:.0f}s")
    return {"id": iid, "set": set_id, "tiles": len(tiles), "bytes": dst.stat().st_size, "elapsed_s": round(time.time() - t0, 1)}


def cmd_status():
    import psycopg
    with psycopg.connect(config.PG_ADMIN_DSN) as c:
        rows = c.execute("SELECT id, sgg_cd, name->>'ko', layer->>'coverage', layer->>'n_sheets', layer->>'pmtiles_set' FROM imagery "
                         "WHERE layer->>'local_source' IS NOT NULL ORDER BY sgg_cd").fetchall()
    for r in rows:
        print(json.dumps(r, ensure_ascii=False))
    print(f"{len(rows)} rows")


if __name__ == "__main__":
    a = sys.argv[1:]
    what = a[0] if a else "status"
    if what == "index":
        cmd_index()
    elif what == "register":
        only = set(a[a.index("--sgg") + 1:]) if "--sgg" in a else None
        only = {x for x in (only or []) if not x.startswith("--")} or None
        cmd_register(only, dry="--dry" in a)
    elif what == "pmtiles":
        n = int(a[a.index("--workers") + 1]) if "--workers" in a else 16
        cmd_pmtiles(a[1], n)
    else:
        cmd_status()
