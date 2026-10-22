"""해외 첫 화면 '건물 면적 변화'(Sprawl · 2017 → 2025)를 우리 해외 모델로(10-17 바퀴 16 해외-큰숫자 · 원칙 269).

  python -m overseas.sprawl

같은 모델(지금 판 · 설정 overseas.run.model)을 2017 · 2025 Sentinel-2 달별 합성에 돌린 결과(칸 장부 overseas_cells · 작업 GeoJSON)의
'시가지' 면 → 500 m 격자 칸마다 건물(시가지) 비율 b17 · b25(%) · d = b25 − b17.
격자 · 파일 이름 · 모양은 옛 공개 판정 판(Esri/IO 10 m 토지피복)과 같다 — 화면(해외 첫 화면 · 메인 해외 장면) · XI ChatGEO 가 같은 파일을 읽는다(숫자 한 출처).
옛 공개 판정 판은 {이름}-esri.json 으로 한 번 남긴다(되돌리기). 두 해 모두 우리 결과가 있는 칸 장부 안의 격자 칸만 센다(없는 칸은 비움 · 섞지 않음).
"""
from __future__ import annotations

import datetime as dt
import json
import math
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import numpy as np  # noqa: E402
from landxi_api import config  # noqa: E402
from landxi_api.result_store import read_features  # noqa: E402
from national.common import pg  # noqa: E402
from overseas.runner import settings  # noqa: E402

REPO = config.SERVER_ROOT.parent
FILES = [REPO / "landxi" / "global" / "data" / "kgz-sprawl-2017-2025.json",
         REPO / "landxi" / "v3" / "global" / "data" / "kgz-sprawl-ysykata-2017-2025.json"]
Y0, Y1 = 2017, 2025
CLS = "시가지"
PX = 1e-4                       # 그리는 화소(경위도 · 약 8–11 m) — 10 m 결과 면과 비슷하게


def year_files(c, country: str, year: int, model: str, bbox) -> tuple[list[Path], object]:
    """그 해 · 그 모델로 끝난 칸 중 bbox 와 겹치는 칸 → 작업 GeoJSON 들 + 칸 합집합(경위도)."""
    from shapely import wkt
    from shapely.ops import unary_union
    rows = c.execute("SELECT cell_cd, ST_AsText(geom) FROM overseas_cells WHERE country=%s AND year=%s AND state='done' AND model_id=%s "
                     "AND ST_Intersects(geom, ST_MakeEnvelope(%s,%s,%s,%s,4326))", (country, year, model, *bbox)).fetchall()
    cds = [r[0] for r in rows]
    jobs = c.execute("SELECT job_id FROM overseas_jobs WHERE country=%s AND year=%s AND model_id=%s AND state='done' AND cell_cd = ANY(%s)",
                     (country, year, model, cds)).fetchall() if cds else []
    from landxi_api.result_store import vector_path
    files = [vector_path("lx", j) for (j,) in jobs]            # 새 결과 .fgb · 옛 결과 .geojson 둘 다
    return [f for f in files if f is not None], (unary_union([wkt.loads(r[1]) for r in rows]) if rows else None)


def burn(files: list[Path], bbox, W: int, H: int) -> np.ndarray:
    from rasterio.features import rasterize
    from rasterio.transform import from_bounds
    from shapely.geometry import box, shape
    bb = box(*bbox)
    geoms = []
    for f in files:
        for ft in read_features(f):
            if (ft.get("properties") or {}).get("cls") != CLS:
                continue
            g = shape(ft["geometry"])
            if g.intersects(bb):
                geoms.append((g, 1))
    if not geoms:
        return np.zeros((H, W), np.uint8)
    return rasterize(geoms, out_shape=(H, W), transform=from_bounds(*bbox, W, H), fill=0, dtype="uint8")


def env(v, unit, src, as_of, note):
    return {"value": v, "unit": unit, "basis": "estimate", "as_of": as_of, "source": src, "note": note}


def build(c, path: Path, country: str, model: str, mname: str) -> dict:
    from rasterio.features import rasterize
    from rasterio.transform import from_bounds
    old = json.loads(path.read_text(encoding="utf-8"))
    bak = path.with_name(path.stem + "-esri.json")
    if not bak.exists() and "Esri" in json.dumps(old.get("summary") or {}):
        shutil.copyfile(path, bak)
    base = json.loads(bak.read_text(encoding="utf-8")) if bak.exists() else old
    bbox = base.get("bbox") or base["source_params"]["bbox"]
    cell_m = int(base.get("cell_m") or 500)
    # 같은 격자(옛 판의 칸 크기 · 원점 = bbox 왼쪽 위)
    f0 = base["grid"]["features"][0]
    xs = [p[0] for p in f0["geometry"]["coordinates"][0]]
    ys = [p[1] for p in f0["geometry"]["coordinates"][0]]
    dlon, dlat = max(xs) - min(xs), max(ys) - min(ys)
    nx, ny = int(round((bbox[2] - bbox[0]) / dlon)), int(round((bbox[3] - bbox[1]) / dlat))
    W, H = int(round((bbox[2] - bbox[0]) / PX)), int(round((bbox[3] - bbox[1]) / PX))
    f17, u17 = year_files(c, country, Y0, model, bbox)
    f25, u25 = year_files(c, country, Y1, model, bbox)
    if not f17 or not f25 or u17 is None or u25 is None:
        raise SystemExit(f"{path.name}: {Y0} 또는 {Y1} 결과가 없음 — 먼저 그 해를 돌린다")
    a17, a25 = burn(f17, bbox, W, H), burn(f25, bbox, W, H)
    ok = rasterize([(u17.intersection(u25), 1)], out_shape=(H, W), transform=from_bounds(*bbox, W, H), fill=0, dtype="uint8")
    as_of = dt.date.today().isoformat()
    src = f"Land-XI overseas model (Sentinel-2 monthly composite {Y0} vs {Y1} · 10 m · U-Net) · built-up · {cell_m} m grid"
    feats, tot17, tot25, valid = [], 0.0, 0.0, 0
    for j in range(ny):
        for i in range(nx):
            x0, y1 = bbox[0] + i * dlon, bbox[3] - j * dlat
            c0, c1 = int(round(i * dlon / PX)), int(round((i + 1) * dlon / PX))
            r0, r1 = int(round(j * dlat / PX)), int(round((j + 1) * dlat / PX))
            v = ok[r0:r1, c0:c1]
            n = int(v.sum())
            if n < 0.5 * v.size:                 # 두 해 모두 우리 결과가 있는 칸 장부 안이 절반 넘는 칸만
                continue
            valid += 1
            m = v == 1
            b17 = float(a17[r0:r1, c0:c1][m].sum()) / n
            b25 = float(a25[r0:r1, c0:c1][m].sum()) / n
            ym = y1 - dlat / 2
            km2 = (dlon * 111.32 * math.cos(math.radians(ym))) * (dlat * 110.57)
            tot17 += b17 * km2
            tot25 += b25 * km2
            if b17 == 0 and b25 == 0:
                continue
            x1, y0 = x0 + dlon, y1 - dlat
            feats.append({"type": "Feature", "id": len(feats), "properties": {"id": f"r{j:03d}c{i:03d}", "b17": round(100 * b17, 1), "b25": round(100 * b25, 1),
                                                                               "d": round(100 * (b25 - b17), 1)},
                          "geometry": {"type": "Polygon", "coordinates": [[[round(x0, 5), round(y0, 5)], [round(x1, 5), round(y0, 5)], [round(x1, 5), round(y1, 5)],
                                                                            [round(x0, 5), round(y1, 5)], [round(x0, 5), round(y0, 5)]]]}})
    doc = {
        "source": "Land-XI overseas model · district result ledger", "model": model, "model_name": mname,
        "years": [Y0, Y1], "license": "Copernicus Sentinel-2 (ESA) · Land-XI 분석 결과", "fetched_at": dt.datetime.now().astimezone().isoformat(timespec="seconds"),
        "cell_m": cell_m, "bbox": bbox, "previous": bak.name if bak.exists() else None,
        "note": "same model on both years (no model-year mix) · cells where both years have Land-XI results",
        "summary": {
            "built_2017_km2": env(round(tot17, 1), "km2", src, as_of, f"{cell_m} m grid sum · approx."),
            "built_2025_km2": env(round(tot25, 1), "km2", src, as_of, f"{cell_m} m grid sum · approx."),
            "delta_km2": env(round(tot25 - tot17, 1), "km2", src, as_of, f"{Y1} − {Y0} · approx."),
            "cells": env(len(feats), "count", src, as_of, "cells with built > 0"),
            "valid_cells": env(valid, "count", src, as_of, "cells with ≥50% area covered by both years"),
        },
        "grid": {"type": "FeatureCollection", "features": feats},
    }
    path.write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")
    return {"file": path.name, "b17": round(tot17, 1), "b25": round(tot25, 1), "delta": round(tot25 - tot17, 1), "cells": len(feats), "valid": valid,
            "esri": {k: (base.get("summary") or {}).get(k, {}).get("value") for k in ("built_2017_km2", "built_2025_km2", "delta_km2")}}


def main():
    with pg() as c:
        st = settings(c)
        mname = (c.execute("SELECT name->>'ko' FROM models WHERE id=%s", (st["model"],)).fetchone() or [st["model"]])[0]
        for p in FILES:
            print(json.dumps(build(c, p, st["country"], st["model"], mname), ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
