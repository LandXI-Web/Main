"""경작지 v2 실험 학습 데이터 묶음 · 같은 검증 묶음 만들기(구현 25 · 10-12 모델실험-시작 ⓐ 경작지부터).

정답(테두리)은 AI Hub 토지피복(E:/aerial_dataset · 4분류: 건물 · 주차장 · 경작지 · 비닐하우스 — 지금 모델 aerial25/best 와 같은 머리).
영상은 두 가지:
  file  — AI Hub 원본 조각(그대로 · 같은 디스크면 하드링크라 자리를 더 쓰지 않는다)
  api   — 같은 자리를 국토지리정보원 항공 정사영상 API(같은 해 층)에서 다시 잘라 만든 조각(압축 영상에 강하게).
          자리는 AI Hub 메타(EPSG:5186 · 왼쪽 위 화소 가운데 · 0.25 m · 512 화소)에서 — 경기 2021 조각만 메타가 있다.
          같은 해 층은 같은 원천 정사영상이라 테두리가 그대로 맞는다(10-12 실측: 밝기 상관 0.90–0.93 · 어긋남 0–2 화소).

만드는 것(02. 데이터/training 아래):
  farm-v2/            학습 묶음 — images|labels/{train,val} · dataset.yaml(train 에 XI맵 고친 칸 · 사용자 자료 자리) · bundle.json
  ../eval/farm-api-v1 같은 검증 묶음(API 영상) — 기존 같은 검증 묶음 aerial25-v1 의 경기 2021 칸을 API 로 다시 자른 것
같은 검증 묶음 칸과 겹치는(조각끼리 25% 겹쳐 잘려 있다) 학습 칸은 뺀다(경기 칸만 자리를 알아 겹침을 잴 수 있다).

실행: python pipelines/farm_v2_bundle.py [--api-train 1600] [--api-neg 400] [--file-train 4000] [--file-neg 1000] [--threads 2]
이미 만든 조각은 건너뛴다(다시 실행해도 이어서).
"""
from __future__ import annotations

import argparse
import json
import os
import random
import shutil
import sys
import threading
import time
import zipfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from landxi_api import config  # noqa: E402

SRC = Path("E:/aerial_dataset")
META_ZIPS = [Path("E:/육군본부/304.토지피복지도 항공위성 이미지/01-1.정식개방데이터") / s / "02.라벨링데이터" / f"{p}_AP25_512픽셀_AP25_512픽셀_Meta.zip"
             for s, p in (("Training", "TL"), ("Validation", "VL"))]
API_XML = config.DATA_ROOT / "national" / "imagery-api" / "ngii-air-2025.xml"
TR = config.DATA_ROOT / "training"
OUT = TR / "farm-v2"
EVAL = TR / "eval" / "farm-api-v1"
SAME = TR / "eval" / "aerial25-v1"          # 지금 모델을 잰 같은 검증 묶음(파일 영상 · 3,000칸)
NAMES = ["건물", "주차장", "경작지", "비닐하우스"]
FARM = 2
SEED = 20261012
TILE_M = 128.0


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


def meta_index() -> dict:
    """경기 2021 조각 이름 → (왼쪽 위 x, 왼쪽 위 y) EPSG:5186."""
    cache = TR / "farm-v2-meta.json"
    if cache.exists():
        return json.loads(cache.read_text(encoding="utf-8"))
    out = {}
    for zp in META_ZIPS:
        z = zipfile.ZipFile(zp)
        for n in z.namelist():
            if not n.endswith("_META.json"):
                continue
            m = json.loads(z.read(n).decode("utf-8"))[0]
            if m.get("img_coordinate") != "EPSG:5186" or float(m.get("img_resolution") or 0) != 0.25 or m.get("img_width") != 512:
                continue
            x, y = (float(v) for v in str(m["coordinates"]).split(","))
            out[m["img_id"]] = [x - 0.125, y + 0.125, int(m.get("img_time") or 0)]
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(out), encoding="utf-8")
    return out


def classes_in(lbl: Path) -> set[int]:
    try:
        return {int(ln.split()[0]) for ln in lbl.read_text(encoding="utf-8").splitlines() if ln.strip()}
    except FileNotFoundError:
        return set()


def overlaps(a, b) -> bool:
    return abs(a[0] - b[0]) < TILE_M and abs(a[1] - b[1]) < TILE_M


_tl = threading.local()


def api_ds(year: int):
    import rasterio
    c = getattr(_tl, "ds", None)
    if c is None:
        c = _tl.ds = {}
    if year not in c:
        xml = API_XML.read_text(encoding="utf-8").replace("air_2025", f"air_{year}")
        p = TR / "farm-v2-api" / f"ngii-air-{year}.xml"
        p.parent.mkdir(parents=True, exist_ok=True)
        if not p.exists():
            p.write_text(xml, encoding="utf-8")
        os.environ.setdefault("GDAL_HTTP_TIMEOUT", "30")
        c[year] = rasterio.open(str(p))
    return c[year]


def api_crop(ul: tuple[float, float], year: int) -> np.ndarray | None:
    """API 영상에서 그 자리 512×512(0.25 m · EPSG:5186 격자)를 다시 자른다 — 메모리에서만(영상 파일 보관 0)."""
    from rasterio.transform import from_origin
    from rasterio.warp import Resampling, reproject, transform_bounds
    src = api_ds(year)
    x0, y0 = ul
    b = transform_bounds("EPSG:5186", src.crs, x0, y0 - TILE_M, x0 + TILE_M, y0)
    win = src.window(b[0] - 4, b[1] - 4, b[2] + 4, b[3] + 4).round_offsets().round_lengths()
    for k, wait in enumerate((0, 2, 4, 8, 16)):
        if wait:
            time.sleep(wait)
        try:
            arr = src.read([1, 2, 3], window=win)
            break
        except Exception:  # noqa: BLE001
            arr = None
    if arr is None or arr.mean() < 3:          # 빈 칸(가림 · 영상 없음)
        return None
    dst = np.zeros((3, 512, 512), np.uint8)
    for i in range(3):
        reproject(arr[i], dst[i], src_transform=src.window_transform(win), src_crs=src.crs,
                  dst_transform=from_origin(x0, y0, 0.25, 0.25), dst_crs="EPSG:5186", resampling=Resampling.bilinear)
    return dst


def put_file(name: str, split_src: str, dest: Path, tag: str = "") -> bool:
    img = SRC / "images" / split_src / f"{name}.png"
    lbl = SRC / "labels" / split_src / f"{name}.txt"
    if not img.exists():
        return False
    di, dl = dest / "images", dest / "labels"
    out_i, out_l = di / f"{tag}{name}.png", dl / f"{tag}{name}.txt"
    if out_i.exists() and out_l.exists():
        return True
    di.mkdir(parents=True, exist_ok=True)
    dl.mkdir(parents=True, exist_ok=True)
    for a, b in ((img, out_i), (lbl, out_l)):
        if b.exists():
            continue
        try:
            os.link(a, b)
        except OSError:
            if a.exists():
                shutil.copyfile(a, b)
            else:
                b.write_text("", encoding="utf-8")
    return True


_API_EXT: dict = {}


def _api_ext(dest: Path) -> str:
    """새로 굽는 영상 API 조각의 형식 — 새 묶음은 JPEG 95(10-22 now21 저장보안-파일-학습그림 ⓐ), PNG 로 만든 옛 묶음은 PNG 그대로.
    원천(AI 허브) 그림은 지금처럼 하드링크(자리를 더 쓰지 않음 — 다시 굽지 않는다)."""
    if dest not in _API_EXT:
        _API_EXT[dest] = ".png" if next((dest / "images").glob("api_*.png"), None) else ".jpg"
    return _API_EXT[dest]


def put_api(name: str, split_src: str, dest: Path, meta: dict) -> str:
    from PIL import Image
    out_i, out_l = dest / "images" / f"api_{name}{_api_ext(dest)}", dest / "labels" / f"api_{name}.txt"
    if out_i.exists() and out_l.exists():
        return "have"
    x, y, t = meta[name]
    year = int(str(t)[:4]) if t else int(name.rsplit("_", 1)[-1])
    arr = api_crop((x, y), year)
    if arr is None:
        return "empty"
    out_i.parent.mkdir(parents=True, exist_ok=True)
    out_l.parent.mkdir(parents=True, exist_ok=True)
    im = Image.fromarray(arr.transpose(1, 2, 0))
    im.save(out_i, "JPEG", quality=95) if out_i.suffix == ".jpg" else im.save(out_i)
    lbl = SRC / "labels" / split_src / f"{name}.txt"
    shutil.copyfile(lbl, out_l) if lbl.exists() else out_l.write_text("", encoding="utf-8")
    return "made"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--api-train", type=int, default=1600)
    ap.add_argument("--api-neg", type=int, default=400)
    ap.add_argument("--file-train", type=int, default=4000)
    ap.add_argument("--file-neg", type=int, default=1000)
    ap.add_argument("--val-api", type=int, default=150)
    ap.add_argument("--val-file", type=int, default=150)
    ap.add_argument("--threads", type=int, default=2)
    ap.add_argument("--plan-only", action="store_true")
    a = ap.parse_args()
    rnd = random.Random(SEED)
    meta = meta_index()
    log("메타", len(meta))

    same = json.loads((SAME / "bundle.json").read_text(encoding="utf-8"))["list"]
    same_set = set(same)
    # 1) 같은 검증 묶음(API) — aerial25-v1 의 경기 2021 칸 중 메타가 있는 것(경작지 있든 없든 그대로 · 잘못 찾은 것도 잰다)
    val_cmp = [n for n in same if n in meta and n.endswith("_2021")]
    cmp_ul = [meta[n][:2] for n in val_cmp]

    def far(n):
        return n not in meta or not any(overlaps(meta[n][:2], u) for u in cmp_ul)

    def farm(n, split):
        return FARM in classes_in(SRC / "labels" / split / f"{n}.txt")

    tr_names = sorted(p.stem for p in (SRC / "images" / "train").glob("*.png") if not p.stem.endswith("_1024"))
    va_names = sorted(p.stem for p in (SRC / "images" / "val").glob("*.png") if not p.stem.endswith("_1024"))
    tr_names = [n for n in tr_names if n not in same_set and far(n)]
    gg = [n for n in tr_names if n in meta]
    rnd.shuffle(gg)
    api_pos, api_neg = [], []
    for n in gg:
        if len(api_pos) >= a.api_train and len(api_neg) >= a.api_neg:
            break
        if farm(n, "train"):
            if len(api_pos) < a.api_train:
                api_pos.append(n)
        elif len(api_neg) < a.api_neg:
            api_neg.append(n)
    used = set(api_pos) | set(api_neg)
    rest = [n for n in tr_names if n not in used]
    rnd.shuffle(rest)
    f_pos, f_neg = [], []
    for n in rest:
        if len(f_pos) >= a.file_train and len(f_neg) >= a.file_neg:
            break
        if farm(n, "train"):
            if len(f_pos) < a.file_train:
                f_pos.append(n)
        elif len(f_neg) < a.file_neg:
            f_neg.append(n)
    va = [n for n in va_names if n not in same_set and far(n)]
    rnd.shuffle(va)
    va_api = [n for n in va if n in meta and farm(n, "val")][: a.val_api]
    va_file = [n for n in va if n not in meta and farm(n, "val")][: a.val_file]
    plan = {"val_cmp": len(val_cmp), "api_pos": len(api_pos), "api_neg": len(api_neg), "file_pos": len(f_pos), "file_neg": len(f_neg),
            "val_api": len(va_api), "val_file": len(va_file)}
    log("계획", plan)
    if a.plan_only:
        return

    # 2) 파일 조각(하드링크)
    for n in f_pos + f_neg:
        put_file(n, "train", OUT / "_t", "")
    for n in va_file:
        put_file(n, "val", OUT / "_v", "")
    # 같은 검증 묶음 파일판(비교용 · 같은 칸의 원본 영상) — aerial25-v1 c4 와 같은 칸 중 경기 2021 만
    for n in val_cmp:
        put_file(n, "test", EVAL / "file", "")

    # 3) API 조각 — 같은 검증 묶음 먼저, 다음 학습
    jobs = [(n, "test", EVAL / "api") for n in val_cmp] + [(n, "val", OUT / "_v") for n in va_api] + \
           [(n, "train", OUT / "_t") for n in api_pos + api_neg]
    cnt = {"made": 0, "have": 0, "empty": 0, "fail": 0}
    t0 = time.time()
    lock = threading.Lock()

    def one(j):
        n, sp, d = j
        try:
            r = put_api(n, sp, d, meta)
        except Exception as e:  # noqa: BLE001
            r = "fail"
            log("실패", n, repr(e)[:120])
        with lock:
            cnt[r] += 1
            k = sum(cnt.values())
            if k % 50 == 0:
                log(f"API 조각 {k}/{len(jobs)}", cnt, f"{(time.time() - t0) / max(1, cnt['made']):.2f}s/장")
        return n, r

    with ThreadPoolExecutor(max_workers=max(1, min(3, a.threads))) as ex:
        res = dict(ex.map(one, jobs))
    log("API 끝", cnt, f"{time.time() - t0:.0f}s")

    # 4) 폴더 정리(images|labels/{train,val}) · dataset.yaml · bundle.json
    for part, sub in (("_t", "train"), ("_v", "val")):
        for kind in ("images", "labels"):
            s, d = OUT / part / kind, OUT / kind / sub
            d.mkdir(parents=True, exist_ok=True)
            if s.exists():
                for f in s.iterdir():
                    f.replace(d / f.name)
    for part in ("_t", "_v"):
        shutil.rmtree(OUT / part, ignore_errors=True)
    for sub in ("api", "file"):
        (EVAL / sub / "dataset.yaml").write_text(
            f"path: {(EVAL / sub).as_posix()}\ntrain: images\nval: images\nnames:\n" + "".join(f"  {i}: \"{v}\"\n" for i, v in enumerate(NAMES)),
            encoding="utf-8")
    n_cmp_api = sum(1 for q in (EVAL / "api" / "images").glob("*") if q.suffix in (".png", ".jpg"))
    ntr = sum(1 for q in (OUT / "images" / "train").glob("*") if q.suffix in (".png", ".jpg"))
    nva = sum(1 for q in (OUT / "images" / "val").glob("*") if q.suffix in (".png", ".jpg"))
    nobj = {}
    for f in (OUT / "labels" / "train").glob("*.txt"):
        for ln in f.read_text(encoding="utf-8").splitlines():
            if ln.strip():
                c = int(ln.split()[0])
                nobj[NAMES[c]] = nobj.get(NAMES[c], 0) + 1
    bundle = {"name": "farm-v2", "task": "경작지", "classes": NAMES, "seed": SEED, "at": time.strftime("%Y-%m-%dT%H:%M:%S"),
              "train": {"images": ntr, "api": len([1 for n in api_pos + api_neg if res.get(n) in ("made", "have")]),
                        "file": len(f_pos) + len(f_neg), "with_farm_api": len(api_pos), "with_farm_file": len(f_pos),
                        "objects": nobj, "xi_tiles": "dataset.yaml train 목록에 XI맵 고친 칸 폴더(있을 때)"},
              "val_internal": {"images": nva, "api": len(va_api), "file": len(va_file), "note": "학습 중 반복마다 정확도 · 가장 나은 반복 고르기용"},
              "compare": {"bundle": "farm-api-v1", "images": n_cmp_api, "from": "aerial25-v1 의 경기 2021 칸(같은 칸 · 같은 정답 · API 영상)",
                          "file_twin": "farm-api-v1/file(같은 칸 원본 영상)"},
              "sources": {"labels": "AI Hub 토지피복(E:/aerial_dataset · 4분류)", "api": "국토지리정보원 항공 정사영상 API 같은 해 층(2021)",
                          "excluded": "같은 검증 묶음 aerial25-v1 3,000칸 이름 · 경기 칸은 그 칸과 겹치는 자리도"},
              "api_result": cnt}
    (OUT / "bundle.json").write_text(json.dumps(bundle, ensure_ascii=False, indent=1), encoding="utf-8")
    write_yaml()
    log("묶음", json.dumps(bundle, ensure_ascii=False)[:600])


def write_yaml(extra: list[str] | None = None):
    """dataset.yaml — train 은 목록(이 묶음 + XI맵 고친 칸 폴더 + 사용자 자료 자리). 자리 폴더가 비어 있으면 넣지 않는다."""
    tr = ["images/train"]
    xi = TR / "xi-tiles"
    for d in sorted(xi.glob("*/images")) if xi.exists() else []:
        if any(d.iterdir()) and "test" not in d.parent.name:
            tr.append(d.as_posix())
    nas = TR / "farm-nas"            # 사용자가 NAS 에서 옮겨 줄 '9_crop_항공_농경지' · 남원 경작/비경작 라벨 자리(images/ · labels/)
    if (nas / "images").exists() and any((nas / "images").iterdir()):
        tr.append((nas / "images").as_posix())
    tr += extra or []
    body = (f"path: {OUT.as_posix()}\ntrain:\n" + "".join(f"  - {t}\n" for t in tr) + "val: images/val\nnames:\n"
            + "".join(f"  {i}: \"{v}\"\n" for i, v in enumerate(NAMES)))
    (OUT / "dataset.yaml").write_text(body, encoding="utf-8")
    return tr


if __name__ == "__main__":
    main()
