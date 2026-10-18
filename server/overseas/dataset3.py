"""해외 학습 데이터 3판 — 10-18 '경작지 모델 다시 학습'(원칙 289 · 사용자 "전혀 모델이 안맞는거 같은데").

  python -m overseas.dataset3 hardneg     틀리기 쉬운 곳 묶음 고르기(지금 모델이 경작지라 했는데 공개 지도 셋 모두 아니라 한 곳)
  python -m overseas.dataset3 build       묶음마다 2025 달별 합성(나라 작업과 같은 맑은 관측 1개) · Esri 2025 · GLAD 2019 를 묶음 파일에 더함
  python -m overseas.dataset3 pack        판 파일 dataset-v3.npz(학습 장비 작업이 읽는다)

무엇이 틀렸나(사람 판독 300점 · impl-45/overseas/data · score-before.json):
  · 지금 모델 경작지는 '밭 아님'을 밭으로 칠한 곳이 많다(틀린 경작지 55곳 중 34곳은 학습 정답 WorldCover 도 '초지', 눈 · 맨땅 6곳).
  · 까닭 ① 학습은 2021 영상(화소마다 맑은 관측 2개 평균)인데 나라 작업은 2025 영상(맑은 관측 1개) — 입력 모양이 달라
          2021 시험 묶음 성적(경작지 F1 0.89)이 2025 에서 그대로 나오지 않는다(OSM 농경지 구획 안 맞춤 0.83 → 0.70 · impl-38 eval).
    까닭 ② 정답이 WorldCover 하나 — 초지 · 비탈 풀밭을 경작지로 둔 곳 · 그 반대가 섞여 있다(사람 판독 정확도 0.80).
    까닭 ③ 묶음 231개(약 1,500㎢)가 경작지 · 시가지 · 물 중심이라 산기슭 초지 · 높은 산이 적다.
고친 것:
  · 입력 = 2021(맑은 관측 2개) + 2025(맑은 관측 1개 · 나라 작업과 같음) 두 해를 같은 묶음 정답으로 함께 배움.
  · 정답 = 공개 지도 셋(WorldCover 2021 · Esri 2025 · GLAD 2019) 중 둘 이상이 경작지면 경작지 · 하나만이면 배우지 않음(255) ·
           셋 모두 아니면 WorldCover 분류 그대로. 사람 판독 300점에서 이 '둘 이상' 정답이 가장 잘 맞았다(정확도 0.835 · 겹침 0.767).
  · 틀리기 쉬운 곳 묶음(hardneg) — 지금 모델이 경작지라 했는데 셋 모두 아니라 한 곳 · 사람 판독 점에서 3 km 넘게 떨어진 곳만(시험 섞임 없음).
영상 원본은 저장하지 않는다(합성 값만 묶음 파일에).
"""
from __future__ import annotations

import argparse
import json
import math
import os
import random
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import numpy as np  # noqa: E402
from landxi_api import config  # noqa: E402
from overseas import s2  # noqa: E402
from overseas.dataset import BLK, TRAIN, WC_LUT, block_grid, esri_on_grid, log, wc_on_grid  # noqa: E402

GLAD = config.DATA_ROOT / "global" / "raw" / "glad-cropland-2019-kgz.tif"
HARD = TRAIN / "hardneg.json"
EVAL_PTS = Path(__file__).resolve().parents[2] / "docs" / "superpowers" / "final" / "process" / "impl-45" / "overseas" / "data" / "points.json"
N_HARD = 60
SEED = 20261018
CROP = 2


def glad_on_grid(grid: s2.Grid) -> np.ndarray:
    import rasterio
    from rasterio.enums import Resampling
    from rasterio.vrt import WarpedVRT
    with rasterio.open(GLAD) as ds, WarpedVRT(ds, crs=f"EPSG:{grid.epsg}", transform=grid.transform, width=grid.w, height=grid.h,
                                              resampling=Resampling.nearest, nodata=0) as v:
        return (v.read(1) > 0).astype(np.uint8)


def hardneg():
    """지금 모델 경작지 면 안 무작위 점 → GLAD · WorldCover · Esri 모두 '경작지 아님'인 점 → 서로 6 km · 평가 점에서 3 km 넘게 떨어진 것 N_HARD 개."""
    sys.path.insert(0, str(EVAL_PTS.parent))
    import sample as SM  # impl-45 평가 도구(같은 지도 읽기)
    from shapely.geometry import Point
    rnd = random.Random(SEED)
    model, tree, gs = SM.model_tree()
    gl = SM.Glad()
    ev = [(p["lon"], p["lat"]) for p in json.loads(EVAL_PTS.read_text(encoding="utf-8"))["points"]]
    area = np.array([g.area for g in gs])
    pr = area / area.sum()
    out = []
    km = lambda a, b: math.hypot((a[0] - b[0]) * 111.32 * math.cos(math.radians(a[1])), (a[1] - b[1]) * 110.57)  # noqa: E731
    tries = 0
    while len(out) < N_HARD and tries < 4000:
        tries += 1
        g = gs[int(np.searchsorted(np.cumsum(pr), rnd.random()))]
        b = g.bounds
        for _ in range(20):
            x, y = rnd.uniform(b[0], b[2]), rnd.uniform(b[1], b[3])
            if g.contains(Point(x, y)):
                break
        else:
            continue
        if gl(x, y) or any(km((x, y), e) < 3 for e in ev) or any(km((x, y), (o["lon"], o["lat"])) < 6 for o in out):
            continue
        if SM.wc_val(x, y) == 40 or SM.esri_val(x, y) == 5:
            continue
        out.append({"id": f"hn-{len(out):02d}", "lon": round(x, 6), "lat": round(y, 6), "stratum": "hardneg",
                    "split": "val" if len(out) % 10 == 9 else "train"})
        log(f"틀리기 쉬운 곳 {len(out)}/{N_HARD} · 시도 {tries}")
    HARD.write_text(json.dumps({"made_at": time.strftime("%Y-%m-%dT%H:%M:%S"), "model": model, "seed": SEED, "blocks": out}, ensure_ascii=False, indent=1),
                    encoding="utf-8")


def blocks() -> list[dict]:
    sp = json.loads((TRAIN / "splits.json").read_text(encoding="utf-8"))["blocks"]
    hn = json.loads(HARD.read_text(encoding="utf-8"))["blocks"] if HARD.exists() else []
    return sp + hn


def add25(b: dict) -> dict:
    """묶음 파일에 2025(맑은 관측 1개) · Esri 2025 · GLAD 2019 를 더한다(있으면 건너뜀). 틀리기 쉬운 곳 묶음은 새 파일(2021 없음)."""
    p = BLK / f"{b['id']}.npz"
    t0 = time.time()
    arrs, meta = {}, {"block": b}
    if p.exists():
        with np.load(p) as d:                                       # 닫고 나서 덮어쓴다(열린 채면 Windows 가 바꾸기를 막는다)
            arrs = {k: d[k] for k in d.files if k != "meta"}
            meta = json.loads(bytes(d["meta"]).decode())
        if "x2025o1" in arrs and "glad2019" in arrs and "esri2025" in arrs:
            return {"id": b["id"], "skip": True}
    g = block_grid(b)
    if "wc2021" not in arrs:
        arrs["wc2021"] = wc_on_grid(g, 2021)
    if "esri2025" not in arrs:
        arrs["esri2025"] = esri_on_grid(g, 2025)
    arrs["glad2019"] = glad_on_grid(g)
    x25, st = s2.composite(g, 2025, threads=12, max_obs=1)
    arrs["x2025o1"] = x25
    meta["months2025o1"] = st["months"]
    tmp = p.with_suffix(".tmp.npz")
    np.savez_compressed(tmp, meta=np.frombuffer(json.dumps(meta, ensure_ascii=False).encode(), np.uint8), **arrs)
    os.replace(tmp, p)
    return {"id": b["id"], "sec": round(time.time() - t0, 1), "clear": min(v["clear_share"] for v in st["months"].values())}


def build(workers: int = 8):
    bs = blocks()
    log(f"3판 묶음 {len(bs)}(틀리기 쉬운 곳 {sum(1 for b in bs if b.get('stratum') == 'hardneg')}) — 2025 맑은 관측 1개 · Esri 2025 · GLAD 2019")
    t0, done = time.time(), 0
    with ThreadPoolExecutor(workers) as ex:
        futs = {ex.submit(add25, b): b for b in bs}
        for f in as_completed(futs):
            b = futs[f]
            try:
                r = f.result()
                done += 1
                if not r.get("skip"):
                    log(f"3판 묶음 {r['id']} {b['split']} {r['sec']}s · 맑음 최소 {r['clear']:.0%} · {done}/{len(bs)} · {time.time() - t0:.0f}s")
            except Exception as e:  # noqa: BLE001
                log(f"3판 묶음 {b['id']} 실패 {repr(e)[:200]}")


def label(d) -> np.ndarray:
    """정답 — 공개 지도 셋 중 둘 이상이 경작지면 경작지 · 하나만이면 255(배우지 않음) · 셋 모두 아니면 WorldCover 분류."""
    y = WC_LUT[d["wc2021"]].copy()
    votes = (d["wc2021"] == 40).astype(np.uint8) + (d["esri2025"] == 5).astype(np.uint8) + d["glad2019"].astype(np.uint8)
    y[votes >= 2] = CROP
    y[votes == 1] = 255
    y[d["wc2021"] == 0] = 255
    return y


def pack():
    X, Y, S, I = [], [], [], []
    for b in blocks():
        p = BLK / f"{b['id']}.npz"
        if not p.exists():
            continue
        with np.load(p) as d:
            if "x2025o1" not in d.files or "glad2019" not in d.files:
                continue
            y = label(d)
            sp = {"train": 0, "val": 1, "test": 2}[b["split"]]
            for k in ("x2021", "x2025o1"):
                if k in d.files:
                    X.append(d[k])
                    Y.append(y)
                    S.append(sp)
                    I.append(f"{b['id']}:{k[1:5]}")
    X, Y = np.stack(X), np.stack(Y)
    out = TRAIN / "dataset-v3.npz"
    np.savez(out.with_suffix(".tmp.npz"), x=X, y=Y, y2020=Y, split=np.array(S, np.uint8), ids=np.array(I))
    os.replace(out.with_suffix(".tmp.npz"), out)
    Sa = np.array(S)
    info = {"version": 3, "samples": len(I), "blocks": len({i.split(':')[0] for i in I}),
            "chips": {k: int((Sa == v).sum()) * 16 for k, v in (("train", 0), ("val", 1), ("test", 2))},
            "years": ["2021 (clear obs ≤2)", "2025 (clear obs 1 · same as national run)"], "months": list(s2.MONTHS), "bands": list(s2.BANDS),
            "label": "cropland = 2 or more of ESA WorldCover 2021 · Esri 2025 · GLAD 2019 cropland; only 1 = ignored; else WorldCover class",
            "crop_px_share": round(float((Y == CROP).mean()), 4), "ignored_px_share": round(float((Y == 255).mean()), 4),
            "hardneg_blocks": sum(1 for i in I if i.startswith("hn-")), "made_at": time.strftime("%Y-%m-%dT%H:%M:%S"), "bytes": out.stat().st_size}
    (TRAIN / "dataset-v3.json").write_text(json.dumps(info, ensure_ascii=False, indent=1), encoding="utf-8")
    log("3판 판 파일", json.dumps(info, ensure_ascii=False))
    return info


def main():
    s2.net_env()
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["hardneg", "build", "pack"])
    ap.add_argument("--workers", type=int, default=8)
    a = ap.parse_args()
    {"hardneg": hardneg, "build": lambda: build(a.workers), "pack": pack}[a.cmd]()


if __name__ == "__main__":
    main()
