"""해외 학습 데이터 판 — 키르기스스탄 농경 주 7곳 × 2.5 km 묶음(64 화소 조각 4×4 = 16장) · Sentinel-2 2021 달별 합성(4–10월).

  python -m overseas.dataset build      묶음 고르기 → 합성 · 정답 받기 → 판 파일(학습 장비가 읽음) · 고정 목록(splits.json)
  python -m overseas.dataset status     지금 몇 묶음 받았나

정답(사람이 만든 것이 아니라 공개 위성 판정):
  · ESA WorldCover 2021(v200) = 기본 정답 · 2020(v100)과 분류가 다른 화소는 학습에서 뺀다(두 해가 같은 곳만 배움 · 시험은 2021 그대로).
  · OSM 농경지 구획(ODbL) = 묶음 고르기 · 구획 안 경작지 비율 대조.
  · Esri/Impact Observatory 2021 · 2025 = 대조용(시험 묶음만 · 정답으로 섞지 않음).
같은 검증 묶음: 묶음째 학습 70 · 검증 10 · 시험 20 — 주마다 섞어 나눠 splits.json 에 고정(다시 학습해도 같은 시험 묶음).
영상 원본은 저장하지 않고 합성 값만 판 파일에 둔다(E: 02. 데이터/overseas/kgz/train).
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import os
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from landxi_api import config  # noqa: E402
from overseas import s2  # noqa: E402

import numpy as np  # noqa: E402

COUNTRY = "kgz"
ROOT = config.DATA_ROOT / "overseas" / COUNTRY
TRAIN = ROOT / "train"
BLK = TRAIN / "blocks"
GLOBAL = config.DATA_ROOT / "global"
YEAR = 2021
BLOCK_PX = 256                      # 2.56 km — 64 화소 조각 4×4
PER_OBLAST = 28                     # 주마다 묶음 수 → 7 × 28 × 16 = 3,136장
QUOTA = (("crop", 14), ("built", 4), ("water", 3), ("other", 7))
SPLIT = (("train", 0.7), ("val", 0.1), ("test", 0.2))
SEED = 20261015

NAMES = ["나무", "초지·관목", "경작지", "시가지", "물·습지", "맨땅·눈"]
NAMES_EN = ["tree", "grass_shrub", "cropland", "built", "water", "bare_snow"]
TARGET = {2: ("경작지", "cropland"), 3: ("시가지", "built"), 4: ("물", "water")}     # 결과로 내는 셋(나머지는 배경)
WC_MAP = {10: 0, 20: 1, 30: 1, 40: 2, 50: 3, 60: 5, 70: 5, 80: 4, 90: 4, 95: 4, 100: 5}
ESRI_MAP = {1: 4, 2: 0, 4: 4, 5: 2, 7: 3, 8: 5, 9: 5, 11: 1}
WC_URL = {2021: "https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_{t}_Map.tif",
          2020: "https://esa-worldcover.s3.eu-central-1.amazonaws.com/v100/2020/map/ESA_WorldCover_10m_2020_v100_{t}_Map.tif"}
ESRI = "https://ic.imagery1.arcgis.com/arcgis/rest/services/Sentinel2_10m_LandCover/ImageServer/exportImage"


def log(*a):
    line = time.strftime("%m-%d %H:%M:%S") + " " + " ".join(str(x) for x in a)
    print(line, flush=True)
    try:
        TRAIN.mkdir(parents=True, exist_ok=True)
        with open(TRAIN / "build.log", "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except OSError:
        pass


def lut(m: dict) -> np.ndarray:
    a = np.full(256, 255, np.uint8)
    for k, v in m.items():
        a[k] = v
    return a


WC_LUT, ESRI_LUT = lut(WC_MAP), lut(ESRI_MAP)


def oblasts() -> list[dict]:
    from shapely.geometry import shape
    d = json.loads((GLOBAL / "kgz-adm1.geojson").read_text(encoding="utf-8"))
    return [{"code": f["properties"]["code"], "name": f["properties"]["name"].replace(" Region", ""), "geom": shape(f["geometry"])}
            for f in d["features"]]


def wc_tiles(bbox) -> list[str]:
    out = []
    for la in range(int(math.floor(bbox[1] / 3) * 3), int(bbox[3]) + 1, 3):
        for lo in range(int(math.floor(bbox[0] / 3) * 3), int(bbox[2]) + 1, 3):
            out.append(f"N{la:02d}E{lo:03d}")
    return out


def wc_coarse(bbox, year: int = 2021, step: int = 8):
    """WorldCover 를 대충(약 75 m) — 묶음 고르기용 분류 비율."""
    import rasterio
    from rasterio.windows import from_bounds
    res = 1 / 12000 * step
    W, H = int(math.ceil((bbox[2] - bbox[0]) / res)), int(math.ceil((bbox[3] - bbox[1]) / res))
    out = np.zeros((H, W), np.uint8)
    for t in wc_tiles(bbox):
        try:
            with rasterio.open("/vsicurl/" + WC_URL[year].format(t=t)) as ds:
                l, b, r, tp = ds.bounds
                il, ir, it_, ib = max(bbox[0], l), min(bbox[2], r), min(bbox[3], tp), max(bbox[1], b)
                if il >= ir or ib >= it_:
                    continue
                c0, c1 = int(round((il - bbox[0]) / res)), int(round((ir - bbox[0]) / res))
                r0, r1 = int(round((bbox[3] - it_) / res)), int(round((bbox[3] - ib) / res))
                if c1 <= c0 or r1 <= r0:
                    continue
                a = ds.read(1, window=from_bounds(il, ib, ir, it_, ds.transform), out_shape=(r1 - r0, c1 - c0))
                out[r0:r1, c0:c1] = np.where(a > 0, a, out[r0:r1, c0:c1])
        except Exception as e:  # noqa: BLE001
            log("WorldCover 대충 읽기 실패", t, repr(e)[:120])
    return out, res


def wc_on_grid(grid: s2.Grid, year: int) -> np.ndarray:
    """WorldCover(4326 · 3° 칸) → 묶음 격자(최근접) — 원 분류 값."""
    import rasterio
    from rasterio.enums import Resampling
    from rasterio.vrt import WarpedVRT
    out = np.zeros((grid.h, grid.w), np.uint8)
    for t in wc_tiles(grid.bbox4326()):
        for k in range(4):
            try:
                with rasterio.open("/vsicurl/" + WC_URL[year].format(t=t)) as ds, \
                        WarpedVRT(ds, crs=f"EPSG:{grid.epsg}", transform=grid.transform, width=grid.w, height=grid.h,
                                  resampling=Resampling.nearest, nodata=0) as v:
                    a = v.read(1)
                out = np.where(a > 0, a, out)
                break
            except Exception as e:  # noqa: BLE001
                if "404" in str(e) or "not recognized" in str(e) or "No such file" in str(e):
                    break
                if k == 3:
                    raise
                time.sleep(3)
    return out


def esri_on_grid(grid: s2.Grid, year: int) -> np.ndarray:
    """Esri/Impact Observatory 10 m 토지피복(그 해) → 묶음 격자 — 원 분류 값(대조용 · 키 없음)."""
    import rasterio
    from rasterio.io import MemoryFile
    a = int(dt.datetime(year, 1, 1, tzinfo=dt.timezone.utc).timestamp() * 1000)
    b = int(dt.datetime(year, 12, 31, 23, 59, 59, tzinfo=dt.timezone.utc).timestamp() * 1000)
    l, bo, r, t = grid.bounds()
    u = (f"{ESRI}?bbox={l},{bo},{r},{t}&bboxSR={grid.epsg}&imageSR={grid.epsg}&size={grid.w},{grid.h}&format=tiff&pixelType=U8"
         f"&interpolation=RSP_NearestNeighbor&renderingRule=%7B%22rasterFunction%22%3A%22None%22%7D&time={a},{b}&f=image")
    for k in range(5):
        try:
            raw = urllib.request.urlopen(u, timeout=120).read()
            with MemoryFile(raw) as mf, mf.open() as ds:
                arr = ds.read(1)
            if arr.shape != (grid.h, grid.w):
                raise RuntimeError(f"모양 {arr.shape}")
            return arr
        except Exception:  # noqa: BLE001
            if k == 4:
                raise
            time.sleep(4 * (k + 1))
    return np.zeros((grid.h, grid.w), np.uint8)


def osm_farmland() -> list:
    """OSM 농경지 구획(나라 전체 · Overpass 한 번 받아 둔 것) → shapely 면 목록(4326)."""
    from shapely.geometry import Polygon
    p = ROOT / "raw" / "osm-farmland-kgz.json"
    if not p.exists():
        return []
    d = json.loads(p.read_text(encoding="utf-8"))
    out = []
    for e in d.get("elements", []):
        if e.get("type") == "way" and e.get("geometry") and len(e["geometry"]) >= 4:
            try:
                g = Polygon([(q["lon"], q["lat"]) for q in e["geometry"]])
                if g.is_valid and g.area > 0:
                    out.append(g)
            except Exception:  # noqa: BLE001
                pass
        elif e.get("type") == "relation":
            for m in e.get("members", []):
                if m.get("role") == "outer" and m.get("geometry") and len(m["geometry"]) >= 4:
                    try:
                        g = Polygon([(q["lon"], q["lat"]) for q in m["geometry"]])
                        if g.is_valid and g.area > 0:
                            out.append(g)
                    except Exception:  # noqa: BLE001
                        pass
    return out


def osm_on_grid(grid: s2.Grid, polys, tree) -> np.ndarray:
    from pyproj import Transformer
    from rasterio.features import rasterize
    from shapely.geometry import box
    from shapely.ops import transform as sh_tr
    if tree is None:
        return np.zeros((grid.h, grid.w), np.uint8)
    hit = [polys[int(i)] for i in tree.query(box(*grid.bbox4326()))]
    if not hit:
        return np.zeros((grid.h, grid.w), np.uint8)
    to = Transformer.from_crs(4326, grid.epsg, always_xy=True).transform
    return rasterize([(sh_tr(to, g), 1) for g in hit], out_shape=(grid.h, grid.w), transform=grid.transform, fill=0, dtype="uint8")


# ── 묶음 고르기 ─────────────────────────────────────────────────────────────
def _cands(ob) -> list:
    """주 안 묶음 후보(중심 · WorldCover 대충 비율)."""
    from shapely.geometry import Point
    from shapely.prepared import prep
    b = ob["geom"].bounds
    wc, res = wc_coarse(b)
    pg = prep(ob["geom"])
    half_lat = BLOCK_PX * 10 / 2 / 110_574
    cands = []
    lat = b[1] + half_lat
    while lat < b[3] - half_lat:
        half_lon = BLOCK_PX * 10 / 2 / (111_320 * math.cos(math.radians(lat)))
        lon = b[0] + half_lon
        while lon < b[2] - half_lon:
            if pg.contains(Point(lon, lat)):
                c0, c1 = int((lon - half_lon - b[0]) / res), int((lon + half_lon - b[0]) / res)
                r0, r1 = int((b[3] - lat - half_lat) / res), int((b[3] - lat + half_lat) / res)
                win = wc[max(0, r0):r1, max(0, c0):c1]
                if win.size and (win > 0).mean() > 0.95:
                    n = win.size
                    cands.append((lon, lat, {"crop": float((win == 40).sum() / n), "built": float((win == 50).sum() / n),
                                             "water": float(((win == 80) | (win == 90)).sum() / n), "snow": float((win == 70).sum() / n),
                                             "bare": float((win == 60).sum() / n)}))
            lon += half_lon * 2 * 1.4
        lat += half_lat * 2 * 1.4
    return cands


MOUNTAIN_PER_OBLAST = 5          # 고정 목록 2판(10-15) — 1판 결과 높은 산의 눈 · 빙하를 물로 그린 것(Panfilov 물 161㎢ 대 공개 판정 13㎢)을 고치려 산지 묶음을 더함


def add_mountain(blocks: list[dict]) -> list[dict]:
    """산지(눈 · 빙하 · 맨땅) 묶음을 주마다 MOUNTAIN_PER_OBLAST 개 더한다 — 1판 묶음 · 나눔은 그대로(학습 3 · 검증 1 · 시험 1)."""
    rng = np.random.default_rng(SEED + 1)
    have = [(b["lon"], b["lat"]) for b in blocks]
    out = []
    for ob in oblasts():
        cands = _cands(ob)
        rng.shuffle(cands)
        taken = []
        for lo, la, fr in cands:
            if len(taken) >= MOUNTAIN_PER_OBLAST:
                break
            if not (fr["snow"] >= 0.15 or fr["bare"] >= 0.4):
                continue
            if any(abs(lo - x) < 0.05 and abs(la - y) < 0.05 for x, y in have):
                continue
            have.append((lo, la))
            taken.append({"lon": round(lo, 6), "lat": round(la, 6), "stratum": "mountain", "wc_frac": {k: round(v, 3) for k, v in fr.items()},
                          "oblast": ob["name"], "oblast_code": ob["code"], "added": "2판 산지"})
        for i, t in enumerate(taken):
            t["id"] = f"{ob['name'][:3].lower()}-m{i}"
            t["split"] = "test" if i == 0 else "val" if i == 1 else "train"
        log(f"{ob['name']} 산지 묶음 {len(taken)}")
        out += taken
    return out


def choose_blocks() -> list[dict]:
    rng = np.random.default_rng(SEED)
    out = []
    for ob in oblasts():
        b = ob["geom"].bounds
        wc, res = wc_coarse(b)
        pg = prep(ob["geom"])
        half_lat = BLOCK_PX * 10 / 2 / 110_574
        cands = []
        lat = b[1] + half_lat
        while lat < b[3] - half_lat:
            half_lon = BLOCK_PX * 10 / 2 / (111_320 * math.cos(math.radians(lat)))
            lon = b[0] + half_lon
            while lon < b[2] - half_lon:
                if pg.contains(Point(lon, lat)):
                    c0, c1 = int((lon - half_lon - b[0]) / res), int((lon + half_lon - b[0]) / res)
                    r0, r1 = int((b[3] - lat - half_lat) / res), int((b[3] - lat + half_lat) / res)
                    win = wc[max(0, r0):r1, max(0, c0):c1]
                    if win.size and (win > 0).mean() > 0.95:
                        n = win.size
                        fr = {"crop": float((win == 40).sum() / n), "built": float((win == 50).sum() / n),
                              "water": float(((win == 80) | (win == 90)).sum() / n), "snow": float((win == 70).sum() / n)}
                        cands.append((lon, lat, fr))
                lon += half_lon * 2 * 1.4
            lat += half_lat * 2 * 1.4
        rng.shuffle(cands)
        taken, used = [], set()

        def pick(cond, n, tag):
            k = 0
            for i, (lo, la, fr) in enumerate(cands):
                if k >= n:
                    break
                if i in used or not cond(fr):
                    continue
                used.add(i)
                taken.append({"lon": round(lo, 6), "lat": round(la, 6), "stratum": tag, "wc_frac": {kk: round(v, 3) for kk, v in fr.items()}})
                k += 1
            return n - k
        short = 0
        for tag, n in QUOTA:
            cond = {"crop": lambda f: f["crop"] >= 0.25, "built": lambda f: f["built"] >= 0.08,
                    "water": lambda f: f["water"] >= 0.10, "other": lambda f: f["snow"] < 0.5}[tag]
            short += pick(cond, n, tag)
        if short:
            short = pick(lambda f: f["crop"] >= 0.05, short, "crop")
        if short:
            pick(lambda f: True, short, "other")
        for i, t in enumerate(taken):
            t.update(oblast=ob["name"], oblast_code=ob["code"], id=f"{ob['name'][:3].lower()}-{i:02d}")
        log(f"{ob['name']} 후보 {len(cands)} → 묶음 {len(taken)}", {t: sum(1 for x in taken if x['stratum'] == t) for t, _ in QUOTA})
        out += taken
    # 묶음째 나누기(주마다 섞어 70 · 10 · 20) — 고정 목록
    by: dict[str, list] = {}
    for t in out:
        by.setdefault(t["oblast"], []).append(t)
    for ob, lst in by.items():
        idx = rng.permutation(len(lst))
        n = len(lst)
        n_te, n_va = int(round(n * 0.2)), int(round(n * 0.1))
        for q, i in enumerate(idx):
            lst[i]["split"] = "test" if q < n_te else "val" if q < n_te + n_va else "train"
    return out


def block_grid(b: dict) -> s2.Grid:
    from shapely.geometry import Point
    g = s2.grid_for(Point(b["lon"], b["lat"]).buffer(1e-6))
    cx, cy = g.x0, g.y0
    x0 = math.floor((cx - BLOCK_PX * 10 / 2) / 20) * 20
    y0 = math.ceil((cy + BLOCK_PX * 10 / 2) / 20) * 20
    return s2.Grid(g.epsg, x0, y0, BLOCK_PX, BLOCK_PX)


def build_one(b: dict, polys, tree) -> dict:
    p = BLK / f"{b['id']}.npz"
    if p.exists():
        return {"id": b["id"], "skip": True}
    t0 = time.time()
    g = block_grid(b)
    x21, st21 = s2.composite(g, YEAR, threads=12)
    wc21, wc20 = wc_on_grid(g, 2021), wc_on_grid(g, 2020)
    osm = osm_on_grid(g, polys, tree)
    arrs = {"x2021": x21, "wc2021": wc21, "wc2020": wc20, "osm": osm}
    meta = {"block": b, "grid": st21["grid"], "months2021": st21["months"]}
    if b["split"] == "test":
        arrs["esri2021"] = esri_on_grid(g, 2021)
        arrs["esri2025"] = esri_on_grid(g, 2025)
        x25, st25 = s2.composite(g, 2025, threads=12)
        arrs["x2025"] = x25
        meta["months2025"] = st25["months"]
    tmp = p.with_suffix(".tmp.npz")
    np.savez_compressed(tmp, meta=np.frombuffer(json.dumps(meta, ensure_ascii=False).encode(), np.uint8), **arrs)
    os.replace(tmp, p)
    return {"id": b["id"], "sec": round(time.time() - t0, 1), "clear": min(v["clear_share"] for v in st21["months"].values())}


def build(workers: int = 10):
    TRAIN.mkdir(parents=True, exist_ok=True)
    BLK.mkdir(parents=True, exist_ok=True)
    sp = TRAIN / "splits.json"
    if sp.exists():
        doc = json.loads(sp.read_text(encoding="utf-8"))
        blocks = doc["blocks"]
        log(f"고정 목록 그대로 — 묶음 {len(blocks)}")
        if not any(b.get("stratum") == "mountain" for b in blocks):
            blocks += add_mountain(blocks)
            doc.update(blocks=blocks, version=2, v2="10-15 산지 묶음 추가(1판 묶음 · 나눔 그대로) — 높은 산 눈 · 빙하를 물로 그리던 것 고침")
            sp.write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
            log(f"고정 목록 2판 — 묶음 {len(blocks)}")
    else:
        blocks = choose_blocks()
        sp.write_text(json.dumps({"made_at": dt.datetime.now().isoformat(timespec="seconds"), "seed": SEED, "block_px": BLOCK_PX,
                                  "chip_px": 64, "rule": "묶음째(2.56 km) 주마다 학습 70 · 검증 10 · 시험 20 — 이 목록이 바뀌지 않는 한 같은 시험 묶음",
                                  "blocks": blocks}, ensure_ascii=False, indent=1), encoding="utf-8")
        log(f"고정 목록 만듦 — 묶음 {len(blocks)}")
    polys = osm_farmland()
    tree = None
    if polys:
        from shapely import STRtree
        tree = STRtree(polys)
    log(f"OSM 농경지 구획 {len(polys)}개")
    t0 = time.time()
    done = 0
    with ThreadPoolExecutor(workers) as ex:
        futs = {ex.submit(build_one, b, polys, tree): b for b in blocks}
        for f in as_completed(futs):
            b = futs[f]
            try:
                r = f.result()
                done += 1
                if not r.get("skip"):
                    log(f"묶음 {r['id']} {b['split']} {r['sec']}s · 맑음 최소 {r['clear']:.0%} · {done}/{len(blocks)} · {time.time() - t0:.0f}s")
            except Exception as e:  # noqa: BLE001
                log(f"묶음 {b['id']} 실패 {repr(e)[:200]}")
    pack()


def pack():
    """묶음 파일 → 판 파일 하나(dataset-v1.npz) — 학습 장비 작업이 읽는다."""
    sp = json.loads((TRAIN / "splits.json").read_text(encoding="utf-8"))
    X, Y, Y20, S, I = [], [], [], [], []
    for b in sp["blocks"]:
        p = BLK / f"{b['id']}.npz"
        if not p.exists():
            continue
        d = np.load(p)
        X.append(d["x2021"])
        Y.append(WC_LUT[d["wc2021"]])
        Y20.append(WC_LUT[d["wc2020"]])
        S.append({"train": 0, "val": 1, "test": 2}[b["split"]])
        I.append(b["id"])
    X, Y, Y20 = np.stack(X), np.stack(Y), np.stack(Y20)
    ver = int(sp.get("version", 1))
    out = TRAIN / f"dataset-v{ver}.npz"
    np.savez(out.with_suffix(".tmp.npz"), x=X, y=Y, y2020=Y20, split=np.array(S, np.uint8), ids=np.array(I))
    os.replace(out.with_suffix(".tmp.npz"), out)
    n = {k: int((np.array(S) == v).sum()) * 16 for k, v in (("train", 0), ("val", 1), ("test", 2))}
    info = {"blocks": len(I), "chips": n, "chips_total": len(I) * 16, "year": YEAR, "months": list(s2.MONTHS), "bands": list(s2.BANDS),
            "classes": NAMES, "bytes": out.stat().st_size, "made_at": dt.datetime.now().isoformat(timespec="seconds"),
            "label": "ESA WorldCover 2021(v200) · 학습은 2020(v100)과 같은 화소만"}
    info["version"] = ver
    info["mountain_blocks"] = sum(1 for b in sp["blocks"] if b.get("stratum") == "mountain" and (BLK / f"{b['id']}.npz").exists())
    (TRAIN / f"dataset-v{ver}.json").write_text(json.dumps(info, ensure_ascii=False, indent=1), encoding="utf-8")
    log("판 파일", json.dumps(info, ensure_ascii=False))
    return info


def status():
    sp = TRAIN / "splits.json"
    n = len(json.loads(sp.read_text(encoding="utf-8"))["blocks"]) if sp.exists() else 0
    have = len(list(BLK.glob("*.npz"))) if BLK.exists() else 0
    print(json.dumps({"blocks": n, "done": have}, ensure_ascii=False))


def main():
    s2.net_env()
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["build", "pack", "status", "choose"])
    ap.add_argument("--workers", type=int, default=10)
    a = ap.parse_args()
    if a.cmd == "build":
        build(a.workers)
    elif a.cmd == "pack":
        pack()
    elif a.cmd == "choose":
        print(json.dumps(choose_blocks()[:3], ensure_ascii=False))
    else:
        status()


if __name__ == "__main__":
    main()
