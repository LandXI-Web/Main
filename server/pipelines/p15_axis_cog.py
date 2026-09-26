"""P15 — B04 AXIS 익산 황등 3·4지구 1.36cm 정사 → COG + axis.db 자동차 라벨 → GT GeoJSON(J1 비교용).

원천(읽기만): E:/Auto_Label_project/data/images/익산_황등3,4지구.tif (61,582×108,889 · EPSG:5186 · JPEG 512 타일 · 오버뷰 8단 [실측])
             E:/Auto_Label_project/data/axis.db (SQLite · 읽기 전용 URI 로 연다)
산출:
  cog/axis_iksan_hwangdeung.tif          COG · WEBP · GoogleMapsCompatible (tiles/cog 렌더 · lx 전용 · export never)
  results/lx/axis-hwangdeung-gt.geojson  자동차 라벨(decision=yes · superseded 아님) 픽셀→5186→4326
  results/lx/axis-hwangdeung-reviewed.geojson  검토된 256px 타일(yes|no) = '라벨 있는 칩' 마스크 · unsure 타일 = ignore
  results/lx/axis-hwangdeung-gt-summary.json   영상 전체·AOI 안 GT 수(봉투 measured) · 자기 일치 판정 근거(audit)

주의(설계서 §10.3): axis.db 의 '자동차 2,462'는 두 영상 합이고 decision=no(음성 판정)까지 센 수다. 여기서는
황등 · decision=yes · superseded_by IS NULL 만 GT 로 센다.
사용: python p15_axis_cog.py gt | cog | aoi
"""
from __future__ import annotations

import json
import sqlite3
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
import rasterio
from pyproj import Transformer
from shapely.geometry import Polygon, box, mapping, shape
from shapely.ops import transform as sh_transform, unary_union

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from landxi_api import config  # noqa: E402
from pipelines._common import log, manifest_add  # noqa: E402

SRC = Path(r"E:/Auto_Label_project/data/images/익산_황등3,4지구.tif")
DB = "file:E:/Auto_Label_project/data/axis.db?mode=ro"
IMAGE_ID = 2          # axis.db image.id (황등)
CAR_CLASS = 16        # axis.db class.id '자동차'
OUT_COG = config.DATA_ROOT / "cog" / "axis_iksan_hwangdeung.tif"
OUT_DIR = config.DATA_ROOT / "results" / "lx"
TODAY = time.strftime("%Y-%m-%d")
# J1 AOI (F1-CONTRACT §4.4 예시와 같은 범위) — 4326
J1_AOI = [[126.9440, 35.9950], [126.9490, 35.9950], [126.9490, 35.9990], [126.9440, 35.9990], [126.9440, 35.9950]]

to4326 = Transformer.from_crs(5186, 4326, always_xy=True).transform
to5186 = Transformer.from_crs(4326, 5186, always_xy=True).transform


def env(value, unit, basis, source, note=None):
    e = {"value": value, "unit": unit, "basis": basis, "as_of": TODAY, "source": source}
    if note:
        e["note"] = note
    return e


def load_labels():
    c = sqlite3.connect(DB, uri=True)
    rows = c.execute(
        """SELECT l.id, l.decision, l.source, l.sam_refined, l.round_no, l.model_version, l.polygon_geojson,
                  t.id, t.x0, t.y0, t.x1, t.y1
           FROM label l JOIN tile t ON t.id = l.tile_id
           WHERE t.image_id = ? AND l.class_id = ? AND l.superseded_by IS NULL""", (IMAGE_ID, CAR_CLASS)).fetchall()
    audit = c.execute("SELECT action, count(*) FROM audit GROUP BY action").fetchall()
    car_refs = c.execute("SELECT count(*) FROM audit WHERE lower(coalesce(after_json,'')||coalesce(before_json,'')) LIKE '%car_v2%' "
                         "OR lower(coalesce(after_json,'')) LIKE '%drone_runs%'").fetchone()[0]
    heads = c.execute("SELECT count(*), max(version) FROM head WHERE class_id = ?", (CAR_CLASS,)).fetchone()
    return rows, dict(audit), car_refs, heads


def cmd_gt():
    with rasterio.open(SRC) as ds:
        tr = ds.transform
    rows, audit, car_refs, heads = load_labels()

    def px2geo(x, y):
        return tr.c + x * tr.a, tr.f + y * tr.e

    gt, tiles_yes, tiles_no, tiles_unsure = [], [], [], []
    for lid, dec, src, sam, rnd, mv, poly, tid, x0, y0, x1, y1 in rows:
        tb = Polygon([px2geo(x0, y0), px2geo(x1, y0), px2geo(x1, y1), px2geo(x0, y1)])
        (tiles_yes if dec == "yes" else tiles_no if dec == "no" else tiles_unsure).append((tid, tb))
        if dec == "yes" and poly:
            pts = json.loads(poly)
            if isinstance(pts, dict):
                pts = pts.get("coordinates", [[]])[0]
            g = Polygon([px2geo(p[0], p[1]) for p in pts]).buffer(0)
            if g.is_empty:
                continue
            gt.append({"type": "Feature", "geometry": mapping(sh_transform(to4326, g)),
                       "properties": {"id": f"AXIS-{lid}", "cls": "자동차", "cls_en": "vehicle", "source": src,
                                      "sam_refined": bool(sam), "round": rnd, "area_m2": round(g.area, 2), "tile_id": tid}})
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    fc = {"type": "FeatureCollection", "name": "axis-hwangdeung-gt", "features": gt}
    (OUT_DIR / "axis-hwangdeung-gt.geojson").write_text(json.dumps(fc, ensure_ascii=False), encoding="utf-8")

    def tiles_fc(items, kind):
        return [{"type": "Feature", "geometry": mapping(sh_transform(to4326, g)), "properties": {"tile_id": t, "kind": kind}} for t, g in items]
    rv = {"type": "FeatureCollection", "name": "axis-hwangdeung-reviewed",
          "features": tiles_fc(tiles_yes, "yes") + tiles_fc(tiles_no, "no") + tiles_fc(tiles_unsure, "ignore")}
    (OUT_DIR / "axis-hwangdeung-reviewed.geojson").write_text(json.dumps(rv), encoding="utf-8")

    aoi = sh_transform(to5186, Polygon(J1_AOI))
    in_aoi = [f for f in gt if aoi.contains(sh_transform(to5186, shape(f["geometry"])).centroid)]
    rev_in = sum(1 for _, g in tiles_yes + tiles_no if aoi.intersects(g))
    summary = {
        "image": str(SRC).replace("\\", "/"), "image_id": IMAGE_ID, "class": "자동차(class_id 16)",
        "gt_total": env(len(gt), "count", "measured", "axis.db label(decision=yes · superseded 아님 · 황등)",
                        "axis.db '자동차 2,462'는 두 영상 합 + 음성 판정(no) 포함 수 — GT 아님"),
        "gt_in_aoi": env(len(in_aoi), "count", "measured", "axis-hwangdeung-gt.geojson ∩ J1 AOI(중심점)"),
        "reviewed_tiles": env(len(tiles_yes) + len(tiles_no), "count", "measured", "axis.db tile(256px) · decision yes|no"),
        "reviewed_tiles_in_aoi": env(rev_in, "count", "measured", "reviewed ∩ J1 AOI"),
        "ignore_tiles": env(len(tiles_unsure), "count", "measured", "decision=unsure(auto) — P/R 에서 제외"),
        "aoi": J1_AOI,
        "self_consistency": {
            "car_model_in_axis_loop": car_refs > 0,
            "evidence": f"axis.db audit {sum(audit.values())}행 중 car_v2*/drone_runs 참조 {car_refs}건 · 자동 라벨은 DINOv2 헤드(class16 v1–{heads[1]}) + AXIS 자체 YOLO seg 루프",
            "verdict": "자기 일치 아님(AXIS 루프가 car_v2_obb 를 쓰지 않음)" if car_refs == 0 else "자기 일치(주의)"},
        "match_rule": "OBB(예측) ↔ SAM 폴리곤(GT) IoU ≥ 0.5 · 검토된 타일(yes|no) 안의 예측·GT 만 · unsure 타일 제외",
        "built_at": time.strftime("%Y-%m-%dT%H:%M:%S+09:00")}
    (OUT_DIR / "axis-hwangdeung-gt-summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=1), encoding="utf-8")
    log("GT", len(gt), "in AOI", len(in_aoi), "reviewed tiles", len(tiles_yes) + len(tiles_no), "rev in AOI", rev_in, "car refs", car_refs)
    manifest_add({"id": "axis-hwangdeung-gt.geojson", "step": "P15", "kind": "vector-geojson", "assets": ["B04"],
                  "path": "results/lx/axis-hwangdeung-gt.geojson", "count": len(gt), "count_unit": "features",
                  "provenance": "실측(axis.db 검수 라벨 · decision=yes · 황등만)", "cmd": "python server/pipelines/p15_axis_cog.py gt"})
    return summary


def cmd_aoi():
    """GT·검토 타일이 가장 많이 들어가는 ≈0.2km² 창을 찾아 보여 준다(영상용 AOI 역산 참고)."""
    gt = json.loads((OUT_DIR / "axis-hwangdeung-gt.geojson").read_text(encoding="utf-8"))["features"]
    rv = json.loads((OUT_DIR / "axis-hwangdeung-reviewed.geojson").read_text(encoding="utf-8"))["features"]
    pts = np.array([shape(f["geometry"]).centroid.coords[0] for f in gt])
    rpts = np.array([shape(f["geometry"]).centroid.coords[0] for f in rv if f["properties"]["kind"] != "ignore"])
    w, h = 0.0050, 0.0040
    best = []
    for x in np.arange(126.9419, 126.9512 - w, 0.0005):
        for y in np.arange(35.9915, 36.0048 - h, 0.0005):
            n = int(((pts[:, 0] >= x) & (pts[:, 0] < x + w) & (pts[:, 1] >= y) & (pts[:, 1] < y + h)).sum())
            r = int(((rpts[:, 0] >= x) & (rpts[:, 0] < x + w) & (rpts[:, 1] >= y) & (rpts[:, 1] < y + h)).sum())
            best.append((n, r, round(x, 4), round(y, 4)))
    best.sort(reverse=True)
    for b in best[:10]:
        print(b)


def cmd_cog():
    OUT_COG.parent.mkdir(parents=True, exist_ok=True)
    tmp = OUT_COG.with_suffix(".tmp.tif")
    cmd = [config.gdal_exe("gdal_translate"), "-of", "COG", str(SRC), str(tmp),
           "-co", "COMPRESS=WEBP", "-co", "QUALITY=85", "-co", "TILING_SCHEME=GoogleMapsCompatible",
           "-co", "NUM_THREADS=32", "-co", "BLOCKSIZE=512", "-co", "OVERVIEW_RESAMPLING=AVERAGE", "-co", "BIGTIFF=YES",
           "-a_srs", "EPSG:5186", "--config", "GDAL_CACHEMAX", "8192"]
    t0 = time.time()
    log("COG 시작")
    r = subprocess.run(cmd, env=config.gdal_env(), capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0:
        log("COG 실패", r.stderr[-1500:])
        sys.exit(1)
    tmp.replace(OUT_COG)
    dt = time.time() - t0
    log(f"COG 완료 {OUT_COG.stat().st_size/1e9:.2f}GB {dt/60:.1f}분")
    manifest_add({"id": "axis_iksan_hwangdeung.cog", "step": "P15", "kind": "raster-cog", "assets": ["B04"],
                  "path": "cog/axis_iksan_hwangdeung.tif", "src": str(SRC).replace("\\", "/"), "crs": "EPSG:3857 (GoogleMapsCompatible)",
                  "gsd_m": 0.0136, "bytes": OUT_COG.stat().st_size, "format": "webp q85",
                  "provenance": "실측(원본 무수정 재투영 COG · lx 전용 · export never)", "cmd": "python server/pipelines/p15_axis_cog.py cog",
                  "elapsed_s": round(dt, 1)})


def _tiles_for(b, z):
    import math
    n = 2 ** z

    def tx(lon):
        return int((lon + 180) / 360 * n)

    def ty(lat):
        return int((1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n)
    return [(z, x, y) for x in range(tx(b[0]), tx(b[2]) + 1) for y in range(ty(b[3]), ty(b[1]) + 1)]


def _render_one(args):
    src, z, x, y = args
    from landxi_api.tiles import _render
    try:
        return z, x, y, _render(src, z, x, y)
    except Exception as e:  # pragma: no cover
        return z, x, y, None


def cmd_pmtiles(maxz_full: int = 21, maxz_aoi: int = 22):
    """원본(또는 COG)에서 WebP 256 타일을 구워 LX 전용 PMTiles(cog/axis_iksan_hwangdeung.pmtiles · 서명 필수 세트)로.
    z14–21 영상 전체 · z22 는 J1 AOI(+50m) 만(1.36cm 원본 ≈ z23 급 — 영상 하강 장면용)."""
    import math
    from multiprocessing import Pool
    from pmtiles.tile import Compression, TileType, zxy_to_tileid
    from pmtiles.writer import Writer
    src = str(OUT_COG) if OUT_COG.exists() else str(SRC)
    full = [126.94188, 35.99146, 126.95118, 36.00481]
    a = np.array(J1_AOI)
    pad = 0.0006
    aoi_b = [a[:, 0].min() - pad, a[:, 1].min() - pad, a[:, 0].max() + pad, a[:, 1].max() + pad]
    jobs = []
    for z in range(14, maxz_full + 1):
        jobs += [(src, *t) for t in _tiles_for(full, z)]
    for z in range(maxz_full + 1, maxz_aoi + 1):
        jobs += [(src, *t) for t in _tiles_for(aoi_b, z)]
    log(f"PMTiles 굽기 {len(jobs)} 타일 · src {Path(src).name}")
    t0 = time.time()
    out = {}
    with Pool(24) as pool:
        for i, (z, x, y, buf) in enumerate(pool.imap_unordered(_render_one, jobs, chunksize=16)):
            if buf:
                out[zxy_to_tileid(z, x, y)] = (z, x, y, buf)
            if i % 2000 == 0:
                log(f"  {i}/{len(jobs)} · {len(out)} 타일 · {time.time()-t0:.0f}s")
    dst = OUT_COG.with_suffix(".pmtiles")
    tmp = dst.with_suffix(".tmp.pmtiles")
    nbytes = 0
    with open(tmp, "wb") as f:
        w = Writer(f)
        for tid in sorted(out):
            nbytes += len(out[tid][3])
            w.write_tile(tid, out[tid][3])
        zs = [v[0] for v in out.values()]
        hdr = {"tile_type": TileType.WEBP, "tile_compression": Compression.NONE, "min_zoom": min(zs), "max_zoom": max(zs),
               "min_lon_e7": int(full[0] * 1e7), "min_lat_e7": int(full[1] * 1e7), "max_lon_e7": int(full[2] * 1e7), "max_lat_e7": int(full[3] * 1e7),
               "center_zoom": 18, "center_lon_e7": int((J1_AOI[0][0] + J1_AOI[1][0]) / 2 * 1e7), "center_lat_e7": int((J1_AOI[0][1] + J1_AOI[2][1]) / 2 * 1e7)}
        w.finalize(hdr, {"name": "axis_iksan_hwangdeung", "format": "webp", "type": "baselayer",
                         "attribution": "B04 AXIS 드론 정사 1.36cm · LX 내부 · export never",
                         "note": f"z14–{maxz_full} 영상 전체 · z{maxz_full+1}–{maxz_aoi} J1 AOI(+50m) · rasterio 재투영 렌더"})
    tmp.replace(dst)
    dt = time.time() - t0
    log(f"PMTiles 완료 {dst} {dst.stat().st_size/1e6:.1f}MB · {len(out)} 타일 · {dt:.0f}s")
    manifest_add({"id": "axis_iksan_hwangdeung.pmtiles", "step": "P15", "kind": "raster-pmtiles", "assets": ["B04"],
                  "path": "cog/axis_iksan_hwangdeung.pmtiles", "src": str(SRC).replace("\\", "/"), "crs": "EPSG:3857 (XYZ)",
                  "bounds": full, "minzoom": min(zs), "maxzoom": max(zs), "count": len(out), "count_unit": "tiles", "format": "webp",
                  "bytes": dst.stat().st_size, "gsd_m": 0.0136,
                  "provenance": "실측(원본 무수정 재투영 렌더 · LX 세션 전용 서명 세트 · export never)",
                  "cmd": "python server/pipelines/p15_axis_cog.py pmtiles", "elapsed_s": round(dt, 1)})


if __name__ == "__main__":
    what = sys.argv[1] if len(sys.argv) > 1 else "gt"
    {"gt": cmd_gt, "cog": cmd_cog, "aoi": cmd_aoi, "pmtiles": cmd_pmtiles}[what]()
