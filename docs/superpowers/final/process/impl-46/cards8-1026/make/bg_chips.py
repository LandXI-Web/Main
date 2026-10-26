"""곤포 배경 칸(곤포 없는 1024 칸) 뽑기 — 예시 영상(남원 2025.06 드론) · 카드 모델 결과 범위 안.
후보 = ① 카드 모델이 낮은 신뢰도(0.8 미만)로 잡은 오탐 자리(빈 논 · 물 댄 논 — 눈 확인 REPORT) ② 범위 안 무작위 자리.
거름 = 칸 안에 신뢰도 0.9 이상 곤포 결과가 하나라도 있으면 버림(라벨 없는 곤포가 배경에 들지 않게) → 눈 확인 표(contact)로 한 번 더.
나눔 = 칸 가운데 경도 중앙값 서쪽 = 학습(train) · 동쪽 = 평가(eval) — 공간으로 나눠 새는 것 막기.
  python bg_chips.py OUTDIR
"""
import sys, os, json, random, asyncio
from pathlib import Path
SERVER = Path(r"E:\Land-XI 플랫폼\01. 디자인\server"); sys.path.insert(0, str(SERVER))
from landxi_api import config
import asyncpg, numpy as np, rasterio, shapely
from shapely import wkb
from shapely.geometry import box
from rasterio.windows import from_bounds, Window
from PIL import Image
JOB = "job_01M5RBX85XEVANJZ0QPMNEEH1J"
OUT = Path(sys.argv[1]); C = 1024
async def main():
    c = await asyncpg.connect(config.PG_DSN)
    async with c.transaction(readonly=True):
        await c.execute("SELECT set_config('app.realm','lx',true), set_config('app.tenant_id','',true), set_config('app.user_id','',true)")
        im = await c.fetchrow("SELECT i.path_internal, ST_AsBinary(ST_Transform(j.aoi,5186)) a FROM jobs j JOIN imagery i ON i.id=j.imagery_id WHERE j.id=$1", JOB)
        rows = await c.fetch("SELECT conf, ST_AsBinary(ST_Transform(geom,5186)) g FROM detections WHERE job_id=$1", JOB)
    await c.close()
    # 원래 결과(.raw.fgb · 다시 정리 전) — 낮은 신뢰도 오탐 자리까지
    from national.tidy import read_raw, to_metric
    from landxi_api import result_store as R
    b = R.base("lx", JOB); g4, props = read_raw(b.with_name(b.name + ".raw.fgb"))
    gm = to_metric(g4, 5186)
    hi = [g for g, p in zip(gm, props) if float(p.get("conf") or 0) >= 0.9]
    lo = [g for g, p in zip(gm, props) if float(p.get("conf") or 0) < 0.8]
    aoi = wkb.loads(bytes(im["a"]))
    ds = rasterio.open(config.DATA_ROOT / im["path_internal"]); res = ds.transform.a; half = C * res / 2
    random.seed(26)
    cents = [("fp", g.centroid.x, g.centroid.y) for g in lo]
    x0, y0, x1, y1 = aoi.bounds
    while len([1 for k in cents if k[0] == "rand"]) < 120:
        x, y = random.uniform(x0, x1), random.uniform(y0, y1)
        if aoi.contains(box(x - half, y - half, x + half, y + half)):
            cents.append(("rand", x, y))
    HT = shapely.STRtree(hi)
    kept, taken = [], []
    for kind, x, y in cents:
        bx = box(x - half - 3, y - half - 3, x + half + 3, y + half + 3)
        if len(HT.query(bx, predicate="intersects")):
            continue
        if any(abs(x - a) < 2 * half and abs(y - b_) < 2 * half for a, b_ in taken):
            continue
        win = from_bounds(x - half, y - half, x + half, y + half, transform=ds.transform)
        win = Window(int(round(win.col_off)), int(round(win.row_off)), C, C)
        a = ds.read([1, 2, 3], window=win, boundless=True, fill_value=0)
        if (a.max(axis=0) == 0).mean() > 0.02 or (a.min(axis=0) >= 250).mean() > 0.02:
            continue
        taken.append((x, y)); kept.append((kind, x, y, a))
    xs = sorted(k[1] for k in kept); mid = xs[len(xs) // 2]
    meta = []
    for i, (kind, x, y, a) in enumerate(kept):
        sp = "train" if x < mid else "eval"
        d = OUT / sp / "images"; d.mkdir(parents=True, exist_ok=True); (OUT / sp / "labels").mkdir(parents=True, exist_ok=True)
        nm = f"bg26_{kind}_{i:03d}"
        Image.fromarray(np.transpose(a, (1, 2, 0))).save(d / f"{nm}.jpg", quality=92)
        (OUT / sp / "labels" / f"{nm}.txt").write_text("", encoding="utf-8")
        meta.append({"name": nm, "kind": kind, "split": sp, "x": round(x, 1), "y": round(y, 1)})
    json.dump({"job": JOB, "rule": __doc__.strip().splitlines()[1:5], "mid_x": mid, "chips": meta}, open(OUT / "chips.json", "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    print({s: sum(1 for m in meta if m["split"] == s) for s in ("train", "eval")}, {k: sum(1 for m in meta if m["kind"] == k) for k in ("fp", "rand")})
asyncio.run(main())
