"""J2b — 남원 비닐하우스 재추론(namwon/Vinyl_house/train2 · yolo11x-seg · 드론 cm 학습) × 2023 25cm 항공(ap25-namwon-2023).

도메인 이식 실험(드론 → 항공 25cm) — 정답 아님 · 검수 전. 설계서 §3.3 R2 · 브리프 F1-B §4.
  ab     도엽 35710074 에서 upsample 1/2/4 세 작업을 큐로 돌리고(kind infer · P1) 시각 점검 이미지 3장을 만든다
  global 전역 작업 제출(kind reinfer · P1 · publish_as namwon-greenhouse-2023-vh) — 스케줄러가 P0 시연을 앞세운다
  table  읍면동 대조표(A02 2025 드론 1,674 · P4 2023 25cm 728 · J2b n) → results/lx/namwon-greenhouse-2023-vh-emd.json
사용: python server/pipelines/j2b_vinyl.py ab | global --upsample 2 | table --job job_…
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from landxi_api import config  # noqa: E402

B = f"http://localhost:{config.API_PORT}/api/v1"
MODEL = "namwon/Vinyl_house/train2"
IMG = "ap25-namwon-2023"
SHEET = "35710074"
SHOTS = config.REPO_ROOT / "shots" / "f1" / "B"
DATA = config.DATA_ROOT


def log(*a):
    print(time.strftime("%H:%M:%S"), "[j2b]", *a, flush=True)


def client():
    c = httpx.Client(timeout=120)
    tok = c.post(B + "/auth/login", json={"realm": "lx", "login": "lx-staff", "password": config.DEV_PASSWORD}).json()["token"]
    c.headers["authorization"] = "Bearer " + tok
    return c


def sheet_aoi() -> dict:
    import geopandas as gpd
    g = gpd.read_file(DATA / "_work" / "c01_namwon_sheets.gpkg")
    g = g[g.sheet.astype(str) == SHEET].to_crs(4326)
    from shapely.geometry import mapping
    return mapping(g.geometry.iloc[0].simplify(0.00001))


def wait(c, job_id: str, every: float = 3) -> dict:
    while True:
        j = c.get(f"{B}/jobs/{job_id}").json()
        if j["state"] in ("done", "failed", "cancelled") and (j["snapshot_ready"] or j["state"] != "done"):
            return j
        time.sleep(every)


def render(job_geojson: Path, out: Path, title: str, aoi: dict):
    """도엽 전체(축소) + 탐지 밀집 구역 확대 — 25cm 원본(VRT) 위에 폴리곤."""
    import cv2
    import numpy as np
    import rasterio
    from pyproj import Transformer
    from rasterio.windows import from_bounds
    from shapely.geometry import shape
    from shapely.ops import transform as T
    fc = json.loads(job_geojson.read_text(encoding="utf-8")) if job_geojson.exists() else {"features": []}
    to = Transformer.from_crs(4326, 5186, always_xy=True).transform
    geoms = [(T(to, shape(f["geometry"])), f["properties"]) for f in fc["features"]]
    ds = rasterio.open(DATA / "_work" / "namwon_ap25_2023.vrt")
    sb = T(to, shape(aoi)).bounds
    W = 1400
    win = from_bounds(*sb, transform=ds.transform)
    H = int(W * win.height / win.width)
    a = ds.read(indexes=[1, 2, 3], window=win, out_shape=(3, H, W))
    im = np.ascontiguousarray(a.transpose(1, 2, 0)[:, :, ::-1])
    inv = ~ds.window_transform(win)
    k = W / win.width
    col = {"비닐하우스_단동": (255, 200, 0), "비닐하우스_다동": (0, 140, 255)}   # BGR — 단동 하늘색 · 다동 주황
    for g, p in geoms:
        for poly in getattr(g, "geoms", [g]):
            pts = np.array([inv * xy for xy in poly.exterior.coords]) * k
            cv2.polylines(im, [pts.astype(np.int32)], True, col.get(p.get("cls"), (0, 255, 0)), 1)
    # 밀집 구역 확대(가장 많은 400m 창)
    zoom = None
    if geoms:
        cs = np.array([[g.centroid.x, g.centroid.y] for g, _ in geoms])
        best, bc = -1, cs[0]
        for c in cs[:: max(1, len(cs) // 400)]:
            n = int(((abs(cs[:, 0] - c[0]) < 200) & (abs(cs[:, 1] - c[1]) < 150)).sum())
            if n > best:
                best, bc = n, c
        zb = (bc[0] - 200, bc[1] - 150, bc[0] + 200, bc[1] + 150)
        zw = from_bounds(*zb, transform=ds.transform)
        za = ds.read(indexes=[1, 2, 3], window=zw, out_shape=(3, 600, 800), boundless=True)
        zoom = np.ascontiguousarray(za.transpose(1, 2, 0)[:, :, ::-1])
        zinv = ~ds.window_transform(zw)
        zk = 800 / zw.width
        for g, p in geoms:
            if not g.intersects(__import__("shapely.geometry", fromlist=["box"]).box(*zb)):
                continue
            for poly in getattr(g, "geoms", [g]):
                pts = np.array([zinv * xy for xy in poly.exterior.coords]) * zk
                cv2.polylines(zoom, [pts.astype(np.int32)], True, col.get(p.get("cls"), (0, 255, 0)), 2)
        cv2.rectangle(im, tuple((np.array(inv * (zb[0], zb[3])) * k).astype(int)), tuple((np.array(inv * (zb[2], zb[1])) * k).astype(int)), (255, 255, 255), 2)
    canvas = np.full((max(H, 600) + 70, W + (820 if zoom is not None else 0), 3), 245, np.uint8)
    canvas[70:70 + H, :W] = im
    if zoom is not None:
        canvas[70:670, W + 20:W + 820] = zoom
    n1 = sum(1 for _, p in geoms if p.get("cls") == "비닐하우스_단동")
    n2 = sum(1 for _, p in geoms if p.get("cls") == "비닐하우스_다동")
    from PIL import Image, ImageDraw, ImageFont
    pil = Image.fromarray(canvas[:, :, ::-1])
    d = ImageDraw.Draw(pil)
    try:
        f = ImageFont.truetype("C:/Windows/Fonts/malgun.ttf", 22)
        fs = ImageFont.truetype("C:/Windows/Fonts/malgun.ttf", 16)
    except Exception:
        f = fs = ImageFont.load_default()
    d.text((16, 10), title, fill=(17, 28, 45), font=f)
    d.text((16, 40), f"도엽 {SHEET} · 탐지 {len(geoms):,} (단동 {n1:,} · 다동 {n2:,}) · 하늘색=단동 · 주황=다동 · 도메인 이식(드론→25cm) · 검수 전 · [AI 추론]",
           fill=(80, 90, 100), font=fs)
    out.parent.mkdir(parents=True, exist_ok=True)
    pil.save(out, quality=90)
    return len(geoms), n1, n2


def cmd_ab(ups=(1, 2, 4), existing: dict | None = None):
    c = client()
    aoi = sheet_aoi()
    jobs = dict(existing or {})
    for u in ups:
        if u in jobs:
            continue
        body = {"kind": "infer", "model_id": MODEL, "imagery_id": IMG, "aoi": aoi, "priority": 1, "demo": False,
                "options": {"chip": 1024, "overlap": 0.125, "conf": 0.25, "upsample": u, "max_km2": 10},
                "label": f"J2b A/B 도엽 {SHEET} upsample {u}"}
        q = c.post(B + "/jobs/quote", json=body).json()
        r = c.post(B + "/jobs", json=body)
        r.raise_for_status()
        jid = r.json()["job"]["id"]
        jobs[u] = jid
        log(f"A/B upsample {u}: {jid} shards {q['shards']} · gpu_s {q['gpu_s']['value']} · eta {q['eta_s']['value']}s")
    res = {}
    for u, jid in jobs.items():
        j = wait(c, jid)
        gj = DATA / "results" / "lx" / f"{jid}.geojson"
        n, n1, n2 = render(gj, SHOTS / f"j2b-ab-upsample{u}.jpg", f"J2b A/B · Vinyl_house/train2 × 25cm 항공 · upsample ×{u}", aoi)
        res[u] = {"job_id": jid, "state": j["state"], "shards": j["shards_total"], "n": n, "single": n1, "multi": n2,
                  "gpu_s": j["gpu_s"]["value"], "elapsed": j.get("finished_at")}
        log(f"upsample {u}: n={n} (단동 {n1} · 다동 {n2}) shards {j['shards_total']}")
    (DATA / "results" / "lx" / "namwon-greenhouse-2023-vh-ab.json").write_text(json.dumps({"sheet": SHEET, "runs": res, "at": time.strftime("%Y-%m-%dT%H:%M:%S+09:00")},
                                                                                         ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps(res, ensure_ascii=False, indent=1))


def cmd_global(u: float):
    c = client()
    body = {"kind": "reinfer", "model_id": MODEL, "imagery_id": IMG, "priority": 1, "demo": False,
            "options": {"chip": 1024, "overlap": 0.125, "conf": 0.25, "upsample": u, "publish_as": "namwon-greenhouse-2023-vh"},
            "label": f"J2b 남원 전역 비닐하우스 재추론 · upsample {u:g}"}
    q = c.post(B + "/jobs/quote", json=body).json()
    log("quote", json.dumps({k: q[k] for k in ("area_km2", "shards", "gpu_s", "eta_s", "allowed", "reasons", "pool")}, ensure_ascii=False))
    r = c.post(B + "/jobs", json=body)
    log("submit", r.status_code, json.dumps({k: r.json()["job"][k] for k in ("id", "kind", "state", "priority", "shards_total", "result_set")},
                                            ensure_ascii=False))
    print(r.json()["job"]["id"])


def cmd_table(job_id: str):
    """읍면동 대조표 — 세 출처는 해상도·연도·모델이 모두 다르다. 어느 쪽도 정답이 아니다(표기)."""
    emd = json.loads((config.REPO_ROOT / "landxi/assets/data/geo/namwon-emd.geojson").read_text(encoding="utf-8"))
    names = [(f["properties"]["nm"], f["properties"]["cd"]) for f in emd["features"]]
    a02 = json.loads((config.REPO_ROOT / "landxi/assets/data/geo/results/namwon-greenhouse-2025.geojson").read_text(encoding="utf-8"))
    p4 = json.loads((DATA / "results/namwon-landcover-2023-emd-stats.json").read_text(encoding="utf-8"))
    vh = json.loads((DATA / "results/lx" / f"{job_id}.geojson").read_text(encoding="utf-8"))
    cnt = lambda fs: __import__("collections").Counter(f["properties"].get("emd") for f in fs)  # noqa: E731
    ca, cv = cnt(a02["features"]), cnt(vh["features"])
    rows = []
    for nm, cd in names:
        rows.append({"emd": nm, "emd_cd": cd, "a02_2025_drone": ca.get(nm, 0),
                     "p4_2023_25cm_aerial25": (p4["by_emd"].get(nm, {}).get("비닐하우스") or {}).get("n", 0), "j2b_2023_25cm_vinyl": cv.get(nm, 0)})
    rows.sort(key=lambda r: -r["j2b_2023_25cm_vinyl"])
    tot = {"a02_2025_drone": len(a02["features"]), "p4_2023_25cm_aerial25": p4["total"]["비닐하우스"]["n"], "j2b_2023_25cm_vinyl": len(vh["features"])}
    out = {"job_id": job_id, "rows": rows, "total": tot,
           "note": "A02 = 2025 드론 1.8cm AOI 판독(남원 일부 · 필지 결합) · P4 = 2023 25cm × aerial25/best(4클래스) · J2b = 2023 25cm × Vinyl_house/train2(드론 학습 · 도메인 이식). "
                   "해상도·연도·모델·범위가 달라 어느 쪽도 정답이 아니다 · 검수 전",
           "basis": {"a02": "inferred", "p4": "inferred", "j2b": "inferred"}, "at": time.strftime("%Y-%m-%dT%H:%M:%S+09:00")}
    (DATA / "results/lx/namwon-greenhouse-2023-vh-emd.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps(tot, ensure_ascii=False))
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("what", choices=["ab", "global", "table"])
    ap.add_argument("--upsample", type=float, default=2)
    ap.add_argument("--job")
    a = ap.parse_args()
    if a.what == "ab":
        ex = {}
        if a.job:          # --job 1=job_…,2=job_…,4=job_… (이미 제출된 A/B 작업을 이어 받기)
            ex = {float(k) if "." in k else int(k): v for k, v in (x.split("=") for x in a.job.split(","))}
        cmd_ab(existing=ex)
    elif a.what == "global":
        cmd_global(a.upsample)
    else:
        cmd_table(a.job)
