"""해외 첫 화면 '작황 하락' 큰 숫자의 경작지 바탕을 우리 해외 모델로(10-17 바퀴 16 해외-큰숫자 · 원칙 269).

  python -m overseas.croptiles            경작지 바탕 조각(지도 z11 · 약 76 m 화소) 굽기 → 02. 데이터/overseas/{나라}/{연도}/publish/crop-z11/{x}/{y}.png

경작지 = 우리 해외 모델 결과 면(작업마다 GeoJSON · 지금 판 모델). 다만 군별 경작지 파일(district-cropland-{연도}.json 한 출처)이
'공개 판정 값'으로 둔 군(public_used.경작지 · 우리 모델이 크게 부풀린 고지대 군)은 다시 학습할 때까지 같은 해 공개 판정(Esri 2025 · 값 5)으로.
화소 = 경작지가 있으면 (40, 비율×255, 0, 255) — 화면 계산기(global/ndvi-tiles.js cropOf)가 값 40 + 비율로 읽는다(면적 = 화소 면적 × 비율). 없으면 투명.
빈 조각은 파일을 만들지 않는다(게이트웨이가 나라 범위 안이면 투명 한 장 · 밖이면 204). 지역 고정값 없음 — 나라 · 연도 · 모델은 설정과 칸 장부에서.

  python -m overseas.croptiles --z 13     보기용 고운 조각(약 14 m 화소 · 10 m 결과에 가까움) → publish/crop-z13 — 가까이(줌 12–14) 보기만 쓴다(계산은 z11 그대로)
10-18 정확도 점검(원칙 287): 공개 판정 군의 Esri 값을 나라 한 장(raw/esri-lulc-{연도}.tif — 사실은 비슈케크 둘레만 덮음)에서 읽어
9군이 지도에서 통째로 비어 있었다 → 군마다 받아 둔 파일(raw/esri-lulc-{연도}-{군 코드}-*.tif)에서 읽는다.
"""
from __future__ import annotations

import json
import math
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import numpy as np  # noqa: E402
from landxi_api import config  # noqa: E402
from national.common import pg  # noqa: E402
from overseas.publish import CROP_FILES, job_files  # noqa: E402
from overseas.runner import root, settings  # noqa: E402

Z, TS = 11, 256
SS = 4                     # 화소 하나를 4×4 로 나눠 비율
R = 20037508.342789244
RES = 2 * R / (2 ** Z * TS)


def tiles_dir(country: str, year: int, z: int | None = None) -> Path:
    return root(country, year) / "publish" / f"crop-z{z or Z}"


def lon2px(lon):
    return (lon + 180) / 360 * 2 ** Z * TS


def lat2px(lat):
    la = math.radians(lat)
    return (1 - math.asinh(math.tan(la)) / math.pi) / 2 * 2 ** Z * TS


def esri_files(year: int, cell_cds) -> list[Path]:
    """공개 판정 군의 Esri 토지피복 파일 — 군마다 받아 둔 것(raw/esri-lulc-{연도}-{군 코드}-WxH.tif)."""
    raw = config.DATA_ROOT / "global" / "raw"
    out = []
    for cd in cell_cds:
        out += sorted(raw.glob(f"esri-lulc-{year}-{cd}-*.tif"))
    return out


def main():
    import rasterio
    from pyproj import Transformer
    from rasterio.features import rasterize
    from rasterio.transform import Affine
    from rasterio.warp import Resampling, reproject
    from shapely import wkt
    from shapely.geometry import shape
    from shapely.ops import transform as sh_tr
    from PIL import Image

    global Z, SS, RES
    if "--z" in sys.argv:
        Z = int(sys.argv[sys.argv.index("--z") + 1])
        SS = 4 if Z <= 11 else 2
        RES = 2 * R / (2 ** Z * TS)
    with pg() as c:
        st = settings(c)
        country, year, model = st["country"], int(st["year"]), st["model"]
        b = c.execute("SELECT ST_XMin(e), ST_YMin(e), ST_XMax(e), ST_YMax(e) FROM (SELECT ST_Extent(geom) e FROM overseas_cells "
                      "WHERE country=%s AND year=%s AND NOT test) q", (country, year)).fetchone()
        cells = c.execute("SELECT cell_cd, name, ST_AsText(geom) FROM overseas_cells WHERE country=%s AND year=%s AND NOT test",
                          (country, year)).fetchall()
        files = job_files(c, model)
    doc = json.loads(CROP_FILES[0].read_text(encoding="utf-8"))
    pub_names = set((doc.get("public_used") or {}).get("경작지") or [])
    # 격자(z11 화소에 맞춤)
    tx0, tx1 = int(lon2px(b[0]) // TS), int(lon2px(b[2]) // TS)
    ty0, ty1 = int(lat2px(b[3]) // TS), int(lat2px(b[1]) // TS)
    W, H = (tx1 - tx0 + 1) * TS, (ty1 - ty0 + 1) * TS
    tr = Affine(RES, 0, -R + tx0 * TS * RES, 0, -RES, R - ty0 * TS * RES)
    to3857 = Transformer.from_crs(4326, 3857, always_xy=True).transform
    print(f"격자 {W}×{H} · 조각 {(tx1 - tx0 + 1) * (ty1 - ty0 + 1)} · 결과 파일 {len(files)}", flush=True)
    from shapely.strtree import STRtree
    from shapely.geometry import box
    geoms = []
    for f in files:
        for ft in json.loads(f.read_text(encoding="utf-8"))["features"]:
            if (ft.get("properties") or {}).get("cls") == "경작지":
                geoms.append(sh_tr(to3857, shape(ft["geometry"])))
    tree = STRtree(geoms)
    pub = [sh_tr(to3857, wkt.loads(g)) for cd, nm, g in cells if nm in pub_names]
    esri_srcs = [rasterio.open(f) for f in esri_files(year, [cd for cd, nm, g in cells if nm in pub_names])]
    print(f"공개 판정 Esri 파일 {len(esri_srcs)}", flush=True)
    print(f"우리 모델 경작지 면 {len(geoms)} · 공개 판정 군 {len(pub)} — {sorted(pub_names)}", flush=True)
    # 조각 줄마다 4배 촘촘히 그린 뒤 화소마다 경작지 비율(0–1) — 작은 밭도 면적만큼 센다(가운데 한 점 규칙이면 약 18% 덜 셈 · 10-17 실측)
    out = tiles_dir(country, year, Z)
    tmp = out.with_name(out.name + ".tmp")
    shutil.rmtree(tmp, ignore_errors=True)
    n, tot = 0, 0.0
    for ty in range(ty0, ty1 + 1):
        y0 = R - ty * TS * RES
        trb = Affine(RES / SS, 0, -R + tx0 * TS * RES, 0, -RES / SS, y0)
        bw, bh = W * SS, TS * SS
        band = box(-R + tx0 * TS * RES, y0 - TS * RES, -R + (tx1 + 1) * TS * RES, y0)
        gs = [geoms[i] for i in tree.query(band)]
        hi = rasterize([(g, 1) for g in gs], out_shape=(bh, bw), transform=trb, fill=0, dtype="uint8") if gs else np.zeros((bh, bw), np.uint8)
        if pub:
            pb = [g for g in pub if g.intersects(band)]
            if pb:
                inpub = rasterize([(g, 1) for g in pb], out_shape=(bh, bw), transform=trb, fill=0, dtype="uint8")
                es = np.zeros((bh, bw), np.uint8)
                for src in esri_srcs:              # 군 파일마다(겹치면 경작지 하나라도 있으면 경작지)
                    sb = src.bounds
                    if not box(*to3857(sb.left, sb.bottom), *to3857(sb.right, sb.top)).intersects(band):
                        continue
                    one = np.zeros((bh, bw), np.uint8)
                    reproject(rasterio.band(src, 1), one, dst_transform=trb, dst_crs="EPSG:3857", resampling=Resampling.nearest)
                    es = np.where(one == 5, 5, es)
                hi = np.where(inpub == 1, (es == 5).astype(np.uint8), hi)
        frac = hi.reshape(TS, SS, W, SS).sum(axis=(1, 3), dtype=np.uint16) / (SS * SS)
        lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (ty + 0.5) / 2 ** Z))))
        tot += float(frac.sum()) * (RES * math.cos(math.radians(lat))) ** 2 / 1e6
        for tx in range(tx0, tx1 + 1):
            a = frac[:, (tx - tx0) * TS:(tx - tx0 + 1) * TS]
            if not a.any():
                continue
            rgba = np.zeros((TS, TS, 4), np.uint8)
            on = a > 0
            rgba[on, 0] = 40
            rgba[on, 1] = np.clip(np.round(a[on] * 255), 1, 255).astype(np.uint8)
            rgba[on, 3] = 255
            p = tmp / str(tx) / f"{ty}.png"
            p.parent.mkdir(parents=True, exist_ok=True)
            Image.fromarray(rgba, "RGBA").save(p, optimize=True)
            n += 1
    meta = {"country": country, "year": year, "model": model, "z": Z, "tiles": [tx0, ty0, tx1, ty1], "written": n,
            "public_used": sorted(pub_names), "km2": round(tot, 1), "frac": "G = cropland share of the pixel (1–255)",
            "source": "Land-XI overseas model cropland (Sentinel-2 2025 · 10 m) · public map in high districts until retraining"}
    (tmp / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    shutil.rmtree(out, ignore_errors=True)
    tmp.rename(out)
    print(json.dumps(meta, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
