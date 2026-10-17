"""해외 결과를 화면 숫자 한 출처로 — 공개 판정(Esri) 대신 우리 해외 모델 결과(10-17 사용자 "그래 추천대로 할게" · 원칙 269).

  python -m overseas.publish

① 군별 경작지 파일 district-cropland-{연도}.json(E: · landxi 사본 둘)을 결과 장부(overseas_cells.counts · 지금 판 모델)로 다시 쓴다.
   이 파일 하나를 메인 해외 장면 · XI맵 해외(군 비율) · 해외 기관 구역 대장 대조 · XI ChatGEO(AI 경작지)가 함께 읽는다(숫자 한 출처).
   옛 공개 판정 값은 district-cropland-{연도}-esri.json 으로 남긴다(되돌리기).
② 지도 조각(작업마다 결과 GeoJSON)의 경작지 면을 화소로 구워
   · 확대 장면(경작지 가장 큰 군) — publish/crop-{군}.tif
   · 추이 주 구획(OSM 농경지 면) 비율 — publish/crop-blocks.tif(옛 Esri 화소 판과 같은 격자)
   → landxi/v3/main/tools/build-kgz.py · build-kgz-blocks.py 가 이것을 먼저 읽는다.
"""
from __future__ import annotations

import datetime as dt
import json
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import numpy as np  # noqa: E402
from landxi_api import config  # noqa: E402
from national.common import pg  # noqa: E402
from overseas.runner import root, settings  # noqa: E402

COUNTRY, YEAR = "kgz", 2025
CROP_FILES = [config.DATA_ROOT / "global" / f"district-cropland-{YEAR}.json",
              config.SERVER_ROOT.parent / "landxi" / "v3" / "global" / "data" / f"district-cropland-{YEAR}.json"]
TOOLS = config.SERVER_ROOT.parent / "landxi" / "v3" / "main" / "tools"
SKIP = {"kgz-bishkek-bbox"}          # 경계를 받지 못한 시(둘레 사각형) — 화면 군 목록(41곳)에 넣지 않는다(이웃 군과 겹침)


def pub() -> Path:
    p = root(COUNTRY, YEAR) / "publish"
    p.mkdir(parents=True, exist_ok=True)
    return p


def job_files(c, model: str, cells: list[str] | None = None) -> list[Path]:
    q = ("SELECT o.job_id FROM overseas_jobs o JOIN overseas_cells n ON n.country=o.country AND n.year=o.year AND n.cell_cd=o.cell_cd "
         "WHERE o.country=%s AND o.year=%s AND o.state='done' AND o.model_id=%s AND n.model_id=%s")
    args = [COUNTRY, YEAR, model, model]
    if cells:
        q += " AND o.cell_cd = ANY(%s)"
        args.append(cells)
    out = []
    for (jid,) in c.execute(q, args).fetchall():
        f = config.DATA_ROOT / "results" / "lx" / f"{jid}.geojson"
        if f.exists():
            out.append(f)
    return out


def burn(files: list[Path], bounds, shape_hw, cls: str = "경작지") -> np.ndarray:
    """결과 GeoJSON 의 그 분류 면 → 4326 격자(값 5 = 경작지 · 옛 Esri 등급과 같은 값)."""
    from rasterio.features import rasterize
    from rasterio.transform import from_bounds
    from shapely.geometry import box, shape
    H, W = shape_hw
    tr = from_bounds(*bounds, W, H)
    bb = box(*bounds)
    geoms = []
    for f in files:
        for ft in json.loads(f.read_text(encoding="utf-8"))["features"]:
            if (ft.get("properties") or {}).get("cls") != cls:
                continue
            g = shape(ft["geometry"])
            if g.intersects(bb):
                geoms.append((g, 5))
    if not geoms:
        return np.zeros((H, W), np.uint8)
    return rasterize(geoms, out_shape=(H, W), transform=tr, fill=0, dtype="uint8")


def write4326(path: Path, arr: np.ndarray, bounds):
    import rasterio
    from rasterio.transform import from_bounds
    with rasterio.open(path, "w", driver="GTiff", dtype="uint8", count=1, width=arr.shape[1], height=arr.shape[0], crs="EPSG:4326",
                       transform=from_bounds(*bounds, arr.shape[1], arr.shape[0]), compress="deflate") as d:
        d.write(arr, 1)


def main():
    import rasterio
    with pg() as c:
        model = settings(c)["model"]
        cells = c.execute("SELECT cell_cd, name, counts, ST_XMin(geom), ST_YMin(geom), ST_XMax(geom), ST_YMax(geom) FROM overseas_cells "
                          "WHERE country=%s AND year=%s AND state='done' AND model_id=%s", (COUNTRY, YEAR, model)).fetchall()
        n_all = c.execute("SELECT count(*) FROM overseas_cells WHERE country=%s AND year=%s AND NOT test", (COUNTRY, YEAR)).fetchone()[0]
        if len(cells) < n_all:
            raise SystemExit(f"끝난 칸 {len(cells)}/{n_all} — 나라 전체가 끝난 뒤에 바꾼다")
        mname = (c.execute("SELECT name->>'ko' FROM models WHERE id=%s", (model,)).fetchone() or [model])[0]
        # ① 군별 경작지 — 장부 한 출처
        day = dt.date.today().isoformat()
        src = "Land-XI overseas model (Sentinel-2 monthly composite 2025 · 10 m · U-Net) · district result ledger"
        dists = {}
        for cd, name, counts, *_ in cells:
            if cd in SKIP:
                continue
            k = counts or {}

            def ha(key):
                return int(round(float((k.get(key) or {}).get("km2") or 0) * 100))
            dists[cd] = {"name": name, "iso": "KGZ",
                         "crop_ha": {"value": ha("경작지"), "unit": "ha", "basis": "estimate", "as_of": day, "source": src + " · cropland",
                                     "note": "AI result polygons whose centre lies in the district"},
                         "built_ha": {"value": ha("시가지"), "unit": "ha", "basis": "estimate", "as_of": day, "source": src + " · built-up"},
                         "water_ha": {"value": ha("물"), "unit": "ha", "basis": "estimate", "as_of": day, "source": src + " · water"},
                         "valid_share": 1.0, "px_m": 10, "model": model}
        for p in CROP_FILES:
            old = json.loads(p.read_text(encoding="utf-8")) if p.exists() else {"districts": {}}
            bak = p.with_name(p.stem + "-esri.json")
            if p.exists() and not bak.exists() and "Esri" in json.dumps({k: v for k, v in old.items() if k != "districts"}):
                shutil.copy2(p, bak)                                       # 옛 공개 판정 값(되돌리기)
            keep = {k: v for k, v in (old.get("districts") or {}).items() if v.get("iso") != "KGZ"}   # 다른 나라(미얀마)는 그대로
            doc = {"source": src, "year": YEAR, "class": {"crops": "경작지"}, "license": "Copernicus Sentinel-2 (ESA) · Land-XI 분석 결과",
                   "model": model, "model_name": mname, "px_target_m": 10, "fetched_at": dt.datetime.now().astimezone().isoformat(timespec="seconds"),
                   "previous": bak.name if bak.exists() else None, "districts": {**dists, **keep}}
            p.write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
        tot = sum(v["crop_ha"]["value"] for v in dists.values())
        print("군별 경작지", len(dists), "군", tot, "ha", flush=True)
        # ② 확대 장면 — 경작지 가장 큰 군의 우리 판정 화소(약 40 m · 화면 글 "약 40 m 칸"과 같게)
        best = max((x for x in cells if x[0] not in SKIP), key=lambda x: float(((x[2] or {}).get("경작지") or {}).get("km2") or 0))
        cd, name, counts, x0, y0, x1, y1 = best
        b = [round(v, 5) for v in (x0, y0, x1, y1)]
        W = int((b[2] - b[0]) * 111_320 * np.cos(np.radians((b[1] + b[3]) / 2)) / 40)
        H = int((b[3] - b[1]) * 110_574 / 40)
        arr = burn(job_files(c, model, [cd]), b, (H, W))
        for f in pub().glob("crop-9*.tif"):
            f.unlink()
        write4326(pub() / f"crop-{cd}.tif", arr, b)
        print("확대 장면", name, W, H, int((arr == 5).sum()), flush=True)
        # ③ 추이 주 구획 — 옛 Esri 화소 판과 같은 격자
        tif = config.DATA_ROOT / "global" / "raw" / f"esri-lulc-{YEAR}.tif"
        with rasterio.open(tif) as d:
            bb, hw = list(d.bounds), d.shape
        arr = burn(job_files(c, model), bb, hw)
        write4326(pub() / "crop-blocks.tif", arr, bb)
        print("구획 판", hw, int((arr == 5).sum()), flush=True)
    for s in ("build-kgz.py", "build-kgz-blocks.py"):
        r = subprocess.run([sys.executable, str(TOOLS / s)], capture_output=True, text=True, encoding="utf-8", errors="replace")
        print(s, r.returncode, (r.stdout or r.stderr)[-300:], flush=True)


if __name__ == "__main__":
    main()
