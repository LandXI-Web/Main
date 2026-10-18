"""해외 경작지 정확도 — 독립 기준 표본 300점(사람이 고해상도 위성 사진을 보고 붙임) · 지도 다섯과 견주기.

  python sample.py pick      표본 고르기 → points.json (지도들이 '경작지'라 한 곳 어디든 · 나라 전체 · 씨앗 고정)
  python sample.py chips     점마다 고해상도 위성 사진 조각(Esri World Imagery · 키 없음) → chips/sheet-*.jpg(20점씩)
  python sample.py score <tag> [model]   labels.json(사람 판독) × 지도 값 → score-<tag>.json · rows-<tag>.json

표본 범위 = 나라 안에서 지도 셋(우리 모델 · GLAD 2019 · WorldCover 2021) 중 하나라도 경작지라 한 곳 —
그 밖은 셋 모두 '경작지 아님'이라 다툼이 없다. 같은 점으로 모든 지도를 재므로 지도끼리 공정하게 견준다.
판독 기준(labels.json): c = 밭 구획(작물 · 갈아엎은 맨 밭 · 수확 뒤 그루터기 포함) · n = 밭 아님(초지 · 비탈 풀밭 · 강바닥 · 마을 · 과수원 · 맨땅) · u = 알 수 없음(구름 · 경계 위 · 사진 흐림).
"""
from __future__ import annotations

import io
import json
import math
import os
import random
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
SRV = HERE.parents[6] / "server"
sys.path.insert(0, str(SRV))
import numpy as np  # noqa: E402
from landxi_api import config  # noqa: E402

os.environ.update({"GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR", "CPL_VSIL_CURL_ALLOWED_EXTENSIONS": ".tif", "GDAL_HTTP_MAX_RETRY": "6",
                   "GDAL_HTTP_RETRY_DELAY": "3", "AWS_NO_SIGN_REQUEST": "YES"})
N, SEED = 300, 20261018
GLAD = config.DATA_ROOT / "global" / "raw" / "glad-cropland-2019-kgz.tif"
WC = "https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_{t}_Map.tif"
ESRI = "https://ic.imagery1.arcgis.com/arcgis/rest/services/Sentinel2_10m_LandCover/ImageServer/exportImage"


def country():
    from shapely.geometry import shape
    from shapely.ops import unary_union
    g = json.loads((config.DATA_ROOT / "global" / "kgz-adm2.geojson").read_text(encoding="utf-8"))
    return unary_union([shape(f["geometry"]).buffer(0) for f in g["features"]])


def model_tree(model: str | None = None):
    from shapely.geometry import shape
    from shapely.strtree import STRtree
    from national.common import pg
    from overseas.publish import job_files
    from overseas.runner import settings
    with pg() as c:
        model = model or settings(c)["model"]
        files = job_files(c, model)
    gs = []
    for f in files:
        for ft in json.loads(f.read_text(encoding="utf-8"))["features"]:
            if (ft.get("properties") or {}).get("cls") == "경작지":
                gs.append(shape(ft["geometry"]))
    print("model", model, "files", len(files), "crop polys", len(gs), flush=True)
    return model, STRtree(gs), gs


def in_tree(tree, gs, x, y) -> int:
    from shapely.geometry import Point
    p = Point(x, y)
    return int(any(gs[i].contains(p) for i in tree.query(p)))


class Glad:
    def __init__(self):
        import rasterio
        self.ds = rasterio.open(GLAD)
        self.a = self.ds.read(1)

    def __call__(self, x, y) -> int:
        r, c = self.ds.index(x, y)
        return int(0 <= r < self.a.shape[0] and 0 <= c < self.a.shape[1] and self.a[r, c] > 0)


import threading  # noqa: E402
_tl = threading.local()                                             # GDAL 파일 손잡이는 실마다 따로(함께 쓰면 멈춤)


def wc_val(x, y) -> int:
    import rasterio
    t = f"N{int(math.floor(y / 3) * 3):02d}E{int(math.floor(x / 3) * 3):03d}"
    if not hasattr(_tl, "wc"):
        _tl.wc = {}
    for k in range(4):
        try:
            if t not in _tl.wc:
                _tl.wc[t] = rasterio.open("/vsicurl/" + WC.format(t=t))
            return int(next(_tl.wc[t].sample([(x, y)]))[0])
        except Exception:  # noqa: BLE001
            time.sleep(2)
    return -1


def esri_val(x, y, year: int = 2025) -> int:
    import datetime as dt
    from rasterio.io import MemoryFile
    a = int(dt.datetime(year, 1, 1, tzinfo=dt.timezone.utc).timestamp() * 1000)
    b = int(dt.datetime(year, 12, 31, 23, 59, tzinfo=dt.timezone.utc).timestamp() * 1000)
    d = 0.00015
    u = (f"{ESRI}?bbox={x - d},{y - d},{x + d},{y + d}&bboxSR=4326&imageSR=4326&size=3,3&format=tiff&pixelType=U8"
         f"&interpolation=RSP_NearestNeighbor&renderingRule=%7B%22rasterFunction%22%3A%22None%22%7D&time={a},{b}&f=image")
    for k in range(4):
        try:
            with MemoryFile(urllib.request.urlopen(u, timeout=60).read()) as mf, mf.open() as ds:
                return int(ds.read(1)[1, 1])
        except Exception:  # noqa: BLE001
            time.sleep(3)
    return -1


def shown_val(x, y) -> int:
    """화면에 칠한 경작지(보기용 고운 조각 z13 · 칸 절반 이상) — 공개 판정 군 포함."""
    from PIL import Image
    from overseas.runner import root
    n = 2 ** 13
    fx = (x + 180) / 360 * n
    fy = (1 - math.asinh(math.tan(math.radians(y))) / math.pi) / 2 * n
    f = root("kgz", 2025) / "publish" / "crop-z13" / str(int(fx)) / f"{int(fy)}.png"
    if not f.exists():
        return 0
    a = np.asarray(Image.open(f).convert("RGBA"))
    px = a[int((fy % 1) * 256), int((fx % 1) * 256)]
    return int(px[3] > 0 and px[1] >= 128)


def pick():
    from shapely.geometry import Point
    from shapely.prepared import prep
    rnd = random.Random(SEED)
    C = country()
    pc = prep(C)
    b = C.bounds
    model, tree, gs = model_tree()
    gl = Glad()
    pts, tried = [], 0
    pool = ThreadPoolExecutor(16)
    while len(pts) < N:
        cands = []
        while len(cands) < 200:
            x, y = rnd.uniform(b[0], b[2]), rnd.uniform(b[1], b[3])
            if pc.contains(Point(x, y)):
                cands.append((x, y))
        tried += len(cands)
        m = [in_tree(tree, gs, x, y) for x, y in cands]
        g = [gl(x, y) for x, y in cands]
        need = [i for i in range(len(cands)) if not (m[i] or g[i])]
        w = dict(zip(need, pool.map(lambda i: wc_val(*cands[i]), need)))
        for i, (x, y) in enumerate(cands):
            if m[i] or g[i] or w.get(i) == 40:
                pts.append({"id": len(pts) + 1, "lon": round(x, 6), "lat": round(y, 6)})
                if len(pts) >= N:
                    break
        print("tried", tried, "kept", len(pts), flush=True)
    (HERE / "points.json").write_text(json.dumps({"seed": SEED, "n": N, "tried": tried, "model": model,
                                                  "domain": "inside Kyrgyzstan where our model, GLAD 2019 or WorldCover 2021 says cropland",
                                                  "points": pts}, indent=1), encoding="utf-8")


def tile_img(z, x, y):
    from PIL import Image
    u = f"https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
    for k in range(4):
        try:
            return Image.open(io.BytesIO(urllib.request.urlopen(u, timeout=60).read())).convert("RGB")
        except Exception:  # noqa: BLE001
            time.sleep(2)
    return Image.new("RGB", (256, 256), (128, 128, 128))


def chip(p, z: int = 16, size: int = 320):
    from PIL import Image, ImageDraw
    n = 2 ** z
    fx = (p["lon"] + 180) / 360 * n * 256
    fy = (1 - math.asinh(math.tan(math.radians(p["lat"]))) / math.pi) / 2 * n * 256
    x0, y0 = int(fx - size / 2), int(fy - size / 2)
    im = Image.new("RGB", (size, size))
    for tx in range(x0 // 256, (x0 + size) // 256 + 1):
        for ty in range(y0 // 256, (y0 + size) // 256 + 1):
            im.paste(tile_img(z, tx, ty), (tx * 256 - x0, ty * 256 - y0))
    d = ImageDraw.Draw(im)
    c = size // 2
    m_px = 156543.03 * math.cos(math.radians(p["lat"])) / n
    r = max(4, int(10 / m_px))                                      # 반지름 약 10 m
    d.ellipse([c - r, c - r, c + r, c + r], outline=(255, 0, 0), width=2)
    d.rectangle([0, 0, 40, 16], fill=(0, 0, 0))
    d.text((4, 2), str(p["id"]), fill=(255, 255, 255))
    return im


def chips():
    from PIL import Image
    P = json.loads((HERE / "points.json").read_text(encoding="utf-8"))["points"]
    out = HERE / "chips"
    out.mkdir(exist_ok=True)
    with ThreadPoolExecutor(12) as ex:
        ims = list(ex.map(chip, P))
    per, cols = 20, 5
    for s in range(0, len(P), per):
        sh = Image.new("RGB", (cols * 324, 4 * 324), (255, 255, 255))
        for k, im in enumerate(ims[s:s + per]):
            sh.paste(im, ((k % cols) * 324, (k // cols) * 324))
        sh.save(out / f"sheet-{s // per + 1:02d}.jpg", quality=88)
    print("sheets", (len(P) + per - 1) // per)


def metrics(pred, truth) -> dict:
    tp = sum(1 for p, t in zip(pred, truth) if p and t)
    fp = sum(1 for p, t in zip(pred, truth) if p and not t)
    fn = sum(1 for p, t in zip(pred, truth) if not p and t)
    tn = len(truth) - tp - fp - fn
    r = lambda a, b: round(a / b, 3) if b else None  # noqa: E731
    return {"n": len(truth), "accuracy": r(tp + tn, len(truth)), "iou": r(tp, tp + fp + fn), "precision": r(tp, tp + fp), "recall": r(tp, tp + fn),
            "tp": tp, "fp": fp, "fn": fn, "tn": tn}


def score(tag: str = "before", model: str | None = None):
    P = json.loads((HERE / "points.json").read_text(encoding="utf-8"))["points"]
    L = json.loads((HERE / "labels.json").read_text(encoding="utf-8"))["labels"]
    model, tree, gs = model_tree(model)
    gl = Glad()
    with ThreadPoolExecutor(12) as ex:
        wc = list(ex.map(lambda p: wc_val(p["lon"], p["lat"]), P))
        es = list(ex.map(lambda p: esri_val(p["lon"], p["lat"]), P))
    rows = []
    for p, w, e in zip(P, wc, es):
        rows.append({**p, "label": L.get(str(p["id"])), "ours": in_tree(tree, gs, p["lon"], p["lat"]), "shown": shown_val(p["lon"], p["lat"]),
                     "glad2019": gl(p["lon"], p["lat"]), "wc2021": int(w == 40), "esri2025": int(e == 5), "wc_raw": w, "esri_raw": e})
    ok = [r for r in rows if r["label"] in ("c", "n")]
    truth = [r["label"] == "c" for r in ok]
    res = {"tag": tag, "model": model, "labelled": len(ok), "unsure": len(rows) - len(ok), "crop_share": round(sum(truth) / max(1, len(truth)), 3),
           "maps": {k: metrics([r[k] for r in ok], truth) for k in ("ours", "shown", "glad2019", "wc2021", "esri2025")}}
    res["maps"]["consensus_2of3"] = metrics([int(r["glad2019"] + r["wc2021"] + r["esri2025"] >= 2) for r in ok], truth)
    (HERE / f"score-{tag}.json").write_text(json.dumps(res, indent=1), encoding="utf-8")
    (HERE / f"rows-{tag}.json").write_text(json.dumps(rows), encoding="utf-8")
    print(json.dumps(res, indent=1))


# ── 같은 점에서 모델끼리 견주기(전과 후 · 나라 작업과 같은 입력) ──────────────────────────────────────────
WIN = HERE / "win"
WPX = 96                                                            # 점 둘레 960 m(모델 입력 칩 64 화소보다 넉넉히) — 가운데 화소 값을 쓴다


def _win_one(p):
    from overseas import s2
    f = WIN / f"{p['id']}.npz"
    if f.exists():
        return p["id"], "skip"
    from shapely.geometry import Point
    g0 = s2.grid_for(Point(p["lon"], p["lat"]).buffer(1e-6))
    x0 = math.floor((g0.x0 - WPX * 10 / 2) / 20) * 20
    y0 = math.ceil((g0.y0 + WPX * 10 / 2) / 20) * 20
    g = s2.Grid(g0.epsg, x0, y0, WPX, WPX)
    st, info = s2.composite(g, 2025, threads=6, max_obs=1)
    np.savez_compressed(f, x=st, epsg=g.epsg, x0=g.x0, y0=g.y0)
    return p["id"], "ok"


def windows():
    """점마다 2025 달별 합성(맑은 관측 1개 = 나라 작업과 같음) 960 m 창 → win/{id}.npz(분석 입력만 · 영상 원본 없음)."""
    from overseas import s2
    s2.net_env()
    WIN.mkdir(exist_ok=True)
    P = json.loads((HERE / "points.json").read_text(encoding="utf-8"))["points"]
    with ThreadPoolExecutor(8) as ex:
        for i, (pid, st) in enumerate(ex.map(_win_one, P)):
            if i % 25 == 0:
                print("win", i, pid, st, flush=True)


def model_on_windows(weights: str) -> dict:
    """모델 파일 하나를 창마다 CPU 로 돌려 가운데 화소 분류 → {id: 경작지 0/1}."""
    import torch
    from overseas import s2, unet
    net, mu, sd, cfg = unet.load(weights, "cpu")
    out = {}
    for f in sorted(WIN.glob("*.npz")):
        d = np.load(f)
        x = torch.from_numpy(s2.features(d["x"], len(s2.MONTHS))[None]).float()
        x = (x - mu) / sd
        with torch.no_grad():
            k = int(net(x).argmax(1)[0, WPX // 2, WPX // 2])
        out[f.stem] = int(k == 2)
    return out


def mscore(tag: str, weights: str):
    L = json.loads((HERE / "labels.json").read_text(encoding="utf-8"))["labels"]
    pred = model_on_windows(weights)
    ids = [i for i in pred if L.get(i) in ("c", "n")]
    res = {"tag": tag, "weights": Path(weights).parent.name, "input": "Sentinel-2 2025 monthly composite, 1 clear obs (same as national run), 960 m window per point",
           "metrics": metrics([pred[i] for i in ids], [L[i] == "c" for i in ids])}
    (HERE / f"mscore-{tag}.json").write_text(json.dumps(res, indent=1), encoding="utf-8")
    print(json.dumps(res, indent=1))


if __name__ == "__main__":
    a = sys.argv[1]
    if a == "pick":
        pick()
    elif a == "chips":
        chips()
    elif a == "score":
        score(*(sys.argv[2:4]))
    elif a == "windows":
        windows()
    elif a == "mscore":
        mscore(sys.argv[2], sys.argv[3])
