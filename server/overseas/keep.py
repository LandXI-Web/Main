"""해외 달별 합성 — 대표로 보기 좋은 것만 남기기(10-15 사용자: "다 보관하기 보다는 대표적으로 이쁜 것들만").

  python -m overseas.keep watch     나라 작업기와 함께 — 합성이 다 된 칸마다 7달 참색(빨강 · 초록 · 파랑) 가벼운 판을 떠 둔다
                                    (작업기는 칸이 끝나면 42 띠 합성을 지우므로 그 전에). 작업기가 다 끝나면 스스로 끝.
  python -m overseas.keep finish    주마다 대표 달 1~2장을 고르고(기준은 아래 SCORE) 주 모자이크 · 나라 전체 보기용 대표 판을 만든 뒤
                                    나머지 참색 판은 지운다. 놓친 칸(감시 전에 끝난 칸)은 고른 달만 다시 받아 채운다.
남는 것: 02. 데이터/overseas/{나라}/{연도}/keep/ — 주 모자이크(10 m 참색 COG) · 나라 전체 보기(60 m) · 미리보기 · 목록(keep.json).

고르는 기준(SCORE · 달마다 · 주 안 모든 군을 합쳐):
  맑음   = 그 달 합성에서 맑은 화소가 있는 몫(SCL 로 구름 · 그림자를 거른 뒤) — 높을수록
  고름   = 칸(MGRS)마다 쓴 장면 수가 적을수록(장면을 많이 섞으면 날짜마다 색이 달라 조각 무늬가 생김)
  눈     = 밝은 흰 화소(눈) 몫이 적을수록(4 · 10월 높은 산)
  철     = 6–9월(밭 · 초지가 초록 · 마른 밭이 갈려 보이는 철) 덤
  점수 = 100 × 맑음 − 4 × (칸마다 장면 수 − 1) − 30 × 눈 + (6–9월이면 3)
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import numpy as np  # noqa: E402
from overseas import s2  # noqa: E402
from overseas.runner import root, stack_path  # noqa: E402

COUNTRY, YEAR = "kgz", 2025
PER_OBLAST = 2
OVERVIEW_M = 60


def kdir() -> Path:
    p = root(COUNTRY, YEAR) / "keep"
    p.mkdir(parents=True, exist_ok=True)
    return p


def rgb8(dn: np.ndarray) -> np.ndarray:
    """(3, H, W) DN(빨강 · 초록 · 파랑) → uint8 참색(반사율 0.3 = 흰색 · 감마 0.6 · 0 은 빈칸)."""
    r = np.clip(dn.astype(np.float32) * 1e-4 / 0.3, 0, 1) ** 0.6
    out = np.clip(np.rint(r * 254) + 1, 1, 255).astype(np.uint8)
    out[:, ~(dn > 0).any(0)] = 0
    return out


def write_rgb(path: Path, rgb: np.ndarray, crs, transform):
    import rasterio
    prof = {"driver": "GTiff", "dtype": "uint8", "count": 3, "width": rgb.shape[2], "height": rgb.shape[1], "crs": crs, "transform": transform,
            "nodata": 0, "tiled": True, "blockxsize": 512, "blockysize": 512, "compress": "deflate", "predictor": 2, "BIGTIFF": "IF_SAFER"}
    tmp = path.with_suffix(".tmp.tif")
    with rasterio.open(tmp, "w", **prof) as d:
        d.write(rgb)
    os.replace(tmp, path)


def month_stats(rgb: np.ndarray, months_meta: dict, key: str) -> dict:
    valid = (rgb > 0).any(0)
    n = int(valid.sum())
    snow = float((((rgb[0] > 230) & (rgb[1] > 230) & (rgb[2] > 230)) & valid).sum() / max(1, n))
    m = months_meta.get(key) or {}
    sc = m.get("scenes") or []
    tiles = {x.split("_")[1] for x in sc if "_" in x}
    per_tile = len(sc) / max(1, len(tiles))
    return {"valid_px": n, "clear": float(m.get("clear_share", 0)), "scenes": len(sc), "tiles": len(tiles),
            "scenes_per_tile": round(per_tile, 2), "snow": round(snow, 4)}


def score(st: dict, month: int) -> float:
    return round(100 * st["clear"] - 4 * max(0.0, st["scenes_per_tile"] - 1) - 30 * st["snow"] + (3 if 6 <= month <= 9 else 0), 2)


def extract(cd: str) -> bool:
    """칸 하나 — 42 띠 합성에서 7달 참색 판 + 달마다 통계. 이미 했으면 건너뜀."""
    import rasterio
    out = kdir() / "cells" / cd
    done = out / "stats.json"
    if done.exists():
        return False
    p = stack_path(COUNTRY, YEAR, cd)
    meta_p = p.with_suffix(".json")
    if not (p.exists() and meta_p.exists()):
        return False
    meta = json.loads(meta_p.read_text(encoding="utf-8"))
    out.mkdir(parents=True, exist_ok=True)
    stats = {}
    with rasterio.open(p) as ds:
        for k, m in enumerate(s2.MONTHS):
            idx = [k * 6 + 3, k * 6 + 2, k * 6 + 1]                    # 빨강 · 초록 · 파랑(띠 번호는 1부터)
            rgb = rgb8(ds.read(idx))
            write_rgb(out / f"{YEAR}-{m:02d}.tif", rgb, ds.crs, ds.transform)
            key = f"{YEAR}-{m:02d}"
            stats[key] = month_stats(rgb, meta.get("months") or {}, key)
            stats[key]["score"] = score(stats[key], m)
    done.write_text(json.dumps({"cell": cd, "grid": meta.get("grid"), "months": stats, "at": dt.datetime.now().isoformat(timespec="seconds")},
                               ensure_ascii=False, indent=1), encoding="utf-8")
    return True


def watch():
    """작업기와 함께 — 30초마다 다 된 합성을 찾아 참색 판을 뜬다. 작업기가 끝(all_done · paused)이면 끝."""
    while True:
        w = root(COUNTRY, YEAR) / "work"
        for mp in sorted(w.glob("*.json")) if w.exists() else []:
            cd = mp.stem
            try:
                if extract(cd):
                    print(time.strftime("%H:%M:%S"), "참색 판", cd, flush=True)
            except Exception as e:  # noqa: BLE001 — 그 사이 작업기가 지웠으면 마무리 때 다시 받는다
                print(time.strftime("%H:%M:%S"), "참색 판 실패", cd, repr(e)[:160], flush=True)
        try:
            st = json.loads((root(COUNTRY, YEAR) / "runner.json").read_text(encoding="utf-8")).get("state")
        except Exception:  # noqa: BLE001
            st = None
        if st in ("all_done",):
            print("작업기 끝 — 감시 끝", flush=True)
            return
        time.sleep(30)


def refetch(cd: str, months: list[int]):
    """감시 전에 끝난 칸 — 고른 달만 다시 받아 참색 판(빨강 · 초록 · 파랑 세 띠 · 맑은 관측 1개)."""
    from pyproj import Transformer
    from shapely import wkt
    from shapely.ops import transform as sh_tr
    from national.common import pg
    s2.net_env()
    with pg() as c:
        gw = c.execute("SELECT ST_AsText(geom) FROM overseas_cells WHERE country=%s AND year=%s AND cell_cd=%s", (COUNTRY, YEAR, cd)).fetchone()[0]
    geom = wkt.loads(gw)
    grid = s2.grid_for(geom, pad_m=200)
    gu = sh_tr(Transformer.from_crs(4326, grid.epsg, always_xy=True).transform, geom).buffer(500)
    blocks = s2.blocks_of(grid, mask_geom=gu)
    out = kdir() / "cells" / cd
    out.mkdir(parents=True, exist_ok=True)
    old = s2.BANDS
    try:
        s2.BANDS = ("blue", "green", "red")
        for m in months:
            f = out / f"{YEAR}-{m:02d}.tif"
            if f.exists():
                continue
            st: dict = {}
            arr = s2.month_composite(grid, YEAR, m, blocks=blocks, stats=st, max_obs=1)
            write_rgb(f, rgb8(arr[[2, 1, 0]]), f"EPSG:{grid.epsg}", grid.transform)
            print(time.strftime("%H:%M:%S"), "다시 받음", cd, m, flush=True)
    finally:
        s2.BANDS = old


def finish():
    import rasterio
    from rasterio.enums import Resampling
    from rasterio.merge import merge
    from rasterio.vrt import WarpedVRT
    from national.common import pg
    with pg() as c:
        cells = c.execute("SELECT cell_cd, name, adm1_name, imagery FROM overseas_cells WHERE country=%s AND year=%s AND state<>'skip' ORDER BY ord",
                          (COUNTRY, YEAR)).fetchall()
    # 1) 달마다 점수 — 참색 판을 뜬 칸은 그 통계, 놓친 칸은 장부의 합성 기록(맑음 · 장면)으로
    score_by: dict = {}
    for cd, name, a1, img in cells:
        sp = kdir() / "cells" / cd / "stats.json"
        months = json.loads(sp.read_text(encoding="utf-8"))["months"] if sp.exists() else None
        for k, m in enumerate(s2.MONTHS):
            key = f"{YEAR}-{m:02d}"
            st = (months or {}).get(key)
            if not st:
                mm = (img or {}).get(key) or {}
                sc = mm.get("scenes") or []
                tiles = {x.split("_")[1] for x in sc if "_" in x}
                st = {"clear": float(mm.get("clear_share", 0)), "scenes_per_tile": len(sc) / max(1, len(tiles)), "snow": 0.0}
                st["score"] = score(st, m)
            score_by.setdefault(a1, {}).setdefault(m, []).append(st["score"])
    chosen = {a1: [m for m, _ in sorted(((m, float(np.mean(v))) for m, v in d.items()), key=lambda t: -t[1])[:PER_OBLAST]]
              for a1, d in score_by.items()}
    allm = {}
    for a1, ms in chosen.items():
        for m in ms:
            allm[m] = allm.get(m, 0) + 1
    over_m = max(allm, key=lambda m: (allm[m], float(np.mean([np.mean(score_by[a][m]) for a in score_by]))))
    print("고른 달", chosen, "나라 전체", over_m, flush=True)
    # 2) 놓친 칸은 고른 달만 다시 받기
    for cd, name, a1, img in cells:
        need = sorted(set(chosen.get(a1, [])) | {over_m})
        if any(not (kdir() / "cells" / cd / f"{YEAR}-{m:02d}.tif").exists() for m in need):
            refetch(cd, need)
    # 3) 주 모자이크(10 m · 4326 로 맞춰 합침) · 나라 전체 보기(60 m)
    keep = []
    res_deg = 10 / 111_320

    def mosaic(files, out_path, res):
        srcs = [rasterio.open(f) for f in files]
        vrts = [WarpedVRT(s, crs="EPSG:4326", resampling=Resampling.bilinear, nodata=0) for s in srcs]
        arr, tr = merge(vrts, res=res, nodata=0, method="first")
        for v in vrts:
            v.close()
        for s in srcs:
            s.close()
        prof = {"driver": "GTiff", "dtype": "uint8", "count": 3, "width": arr.shape[2], "height": arr.shape[1], "crs": "EPSG:4326",
                "transform": tr, "nodata": 0, "tiled": True, "blockxsize": 512, "blockysize": 512, "compress": "jpeg", "jpeg_quality": 88,
                "photometric": "ycbcr", "BIGTIFF": "IF_SAFER"}
        with rasterio.open(out_path, "w", **prof) as d:
            d.write(arr)
            d.write_mask(((arr > 0).any(0) * 255).astype(np.uint8))
            d.build_overviews([2, 4, 8, 16, 32], Resampling.average)
        return out_path
    by_ob: dict = {}
    for cd, name, a1, img in cells:
        by_ob.setdefault(a1, []).append(cd)
    for a1, cds in by_ob.items():
        for m in chosen[a1]:
            files = [kdir() / "cells" / cd / f"{YEAR}-{m:02d}.tif" for cd in cds if (kdir() / "cells" / cd / f"{YEAR}-{m:02d}.tif").exists()]
            outp = kdir() / f"{COUNTRY}-{YEAR}-{m:02d}-{a1.lower()}.tif"
            mosaic(files, outp, res_deg)
            keep.append({"kind": "주 대표", "oblast": a1, "month": m, "file": outp.name, "bytes": outp.stat().st_size,
                         "score": round(float(np.mean(score_by[a1][m])), 2), "res_m": 10})
    files = [kdir() / "cells" / cd / f"{YEAR}-{over_m:02d}.tif" for cd, *_ in cells if (kdir() / "cells" / cd / f"{YEAR}-{over_m:02d}.tif").exists()]
    ov = kdir() / f"{COUNTRY}-{YEAR}-{over_m:02d}-country-{OVERVIEW_M}m.tif"
    mosaic(files, ov, OVERVIEW_M / 111_320)
    keep.append({"kind": "나라 전체 보기", "month": over_m, "file": ov.name, "bytes": ov.stat().st_size, "res_m": OVERVIEW_M})
    # 4) 미리보기(작게) — 나라 전체 1장 + 주마다 1장
    prev = kdir() / "preview"
    prev.mkdir(exist_ok=True)
    from PIL import Image
    for it in keep:
        with rasterio.open(kdir() / it["file"]) as d:
            s = max(d.width, d.height) / 900
            a = d.read(out_shape=(3, max(1, int(d.height / s)), max(1, int(d.width / s))), resampling=Resampling.average)
        im = Image.fromarray(np.moveaxis(np.where(a == 0, 255, a), 0, -1).astype(np.uint8))
        it["preview"] = f"preview/{Path(it['file']).stem}.jpg"
        im.save(kdir() / it["preview"], quality=82)
    # 5) 나머지(칸별 참색 판 · 남은 42 띠 합성) 지우기
    import shutil
    freed = 0
    for d in (kdir() / "cells").glob("*"):
        freed += sum(f.stat().st_size for f in d.rglob("*") if f.is_file())
        shutil.rmtree(d, ignore_errors=True)
    w = root(COUNTRY, YEAR) / "work"
    for f in w.glob("*.tif") if w.exists() else []:
        try:
            freed += f.stat().st_size
            f.unlink()
        except OSError:
            pass
    doc = {"made_at": dt.datetime.now().isoformat(timespec="seconds"), "country": COUNTRY, "year": YEAR, "chosen": chosen, "overview_month": over_m,
           "rule": __doc__.split("고르는 기준")[1].strip(), "keep": keep, "kept_bytes": sum(k["bytes"] for k in keep), "freed_bytes": freed}
    (kdir() / "keep.json").write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
    # 증거 폴더에 목록 · 미리보기(작게)만 — 판 자체(E:)는 커밋하지 않는다
    ev = Path(__file__).resolve().parents[2] / "docs" / "superpowers" / "final" / "process" / "impl-38" / "overseas-train" / "keep"
    (ev / "preview").mkdir(parents=True, exist_ok=True)
    (ev / "keep.json").write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
    for it in keep:
        shutil.copy2(kdir() / it["preview"], ev / it["preview"])
    print(json.dumps({k: doc[k] for k in ("chosen", "overview_month", "kept_bytes", "freed_bytes")}, ensure_ascii=False), flush=True)
    return doc


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["watch", "finish", "extract"])
    ap.add_argument("--cell")
    a = ap.parse_args()
    if a.cmd == "watch":
        watch()
    elif a.cmd == "extract":
        print(extract(a.cell))
    else:
        finish()


if __name__ == "__main__":
    main()
