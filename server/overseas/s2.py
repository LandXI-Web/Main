"""Sentinel-2 L2A 달별 합성 — AWS 공개 원 자료(Earth Search STAC · sentinel-cogs 버킷)만. 메일 · 계정 · 키 없음.

달마다(4–10월) 구름 적은 장면부터 SCL(장면 분류)로 구름 · 그림자 · 빈칸을 걸러 낸 맑은 화소를 화소마다 최대 2개 모아 평균 →
수확 시기 차이(같은 해라도 장면 날짜가 다르면 수확 뒤 맨 밭이 섞임 · 설계 30차 실측 주의)를 달 단위로 맞춘다.

출력 = (달 7 × 띠 6, H, W) uint16 DN(반사율 = DN × 1e-4 — Earth Search 'boa_offset_applied' 로 기준선 차이를 이미 맞춤 · 실측: 물 DN 200 안팎) · 0 = 그 달 맑은 화소 없음.
격자 = 그 범위 중심의 UTM 10 m(원점은 20 m 배수 — S2 격자와 화소가 맞아 같은 띠는 다시 뽑지 않는다). 다른 UTM 띠의 장면은 그 자리에서 다시 투영.
영상은 메모리에서만 쓰고 저장하지 않는다(합성 결과만 · 끝나면 지움).
"""
from __future__ import annotations

import json
import math
import os
import threading
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass

import numpy as np

NET_ENV = {"GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR", "AWS_NO_SIGN_REQUEST": "YES", "CPL_VSIL_CURL_ALLOWED_EXTENSIONS": ".tif",
           "GDAL_HTTP_MULTIRANGE": "YES", "GDAL_HTTP_MERGE_CONSECUTIVE_RANGES": "YES", "GDAL_HTTP_MAX_RETRY": "6",
           "GDAL_HTTP_RETRY_DELAY": "3", "GDAL_CACHEMAX": "1024", "VSI_CACHE": "TRUE", "VSI_CACHE_SIZE": "50000000"}


def net_env():
    """원격 COG 읽기 설정 — 합성을 만드는 CPU 프로세스(학습 데이터 · 나라 작업기)에서만 부른다(GPU 워커의 국내 영상 읽기에는 걸지 않음)."""
    for k, v in NET_ENV.items():
        os.environ.setdefault(k, v)

STAC = "https://earth-search.aws.element84.com/v1/search"
BANDS = ("blue", "green", "red", "nir", "swir16", "swir22")
BAND_KO = ("파랑", "초록", "빨강", "근적외", "단파적외1", "단파적외2")
MONTHS = tuple(range(4, 11))                 # 4–10월 = 7장
VALID_SCL = np.array([2, 4, 5, 6, 7, 11])    # 어두운 곳 · 식생 · 맨땅 · 물 · 분류 안 됨 · 눈 — 구름(8 · 9 · 10) · 그림자(3) · 빈칸(0) · 포화(1)는 버림
MAX_OBS = 2                                  # 화소마다 맑은 관측 최대 2개 평균
CLOUD_MAX = 70                               # 장면 전체 구름 %(STAC) — 넘으면 후보에서 뺌
MAX_ITEMS = 6                                # 달마다 · MGRS 칸마다 SCL 을 볼 장면 수 상한(구름 적은 순)
BLOCK = 2048                                 # 읽기 조각(화소) — 조각마다 스레드 하나
RES = 10


@dataclass
class Grid:
    epsg: int
    x0: float          # 왼쪽 위 x
    y0: float          # 왼쪽 위 y
    w: int
    h: int

    @property
    def transform(self):
        from rasterio.transform import from_origin
        return from_origin(self.x0, self.y0, RES, RES)

    def bounds(self):
        return self.x0, self.y0 - self.h * RES, self.x0 + self.w * RES, self.y0

    def bbox4326(self):
        from pyproj import Transformer
        t = Transformer.from_crs(self.epsg, 4326, always_xy=True)
        l, b, r, tp = self.bounds()
        xs, ys = t.transform([l, r, r, l], [b, b, tp, tp])
        return [min(xs), min(ys), max(xs), max(ys)]


def utm_epsg(lon: float, lat: float) -> int:
    return (32600 if lat >= 0 else 32700) + int((lon + 180) // 6) + 1


def grid_for(geom4326, pad_m: float = 0.0, epsg: int | None = None) -> Grid:
    """범위(shapely 4326) → 그 중심 UTM 10 m 격자(원점 20 m 배수)."""
    from pyproj import Transformer
    from shapely.ops import transform as sh_tr
    c = geom4326.centroid
    epsg = epsg or utm_epsg(c.x, c.y)
    g = sh_tr(Transformer.from_crs(4326, epsg, always_xy=True).transform, geom4326)
    l, b, r, t = g.bounds
    l, b = math.floor((l - pad_m) / 20) * 20, math.floor((b - pad_m) / 20) * 20
    r, t = math.ceil((r + pad_m) / 20) * 20, math.ceil((t + pad_m) / 20) * 20
    return Grid(epsg, l, t, int((r - l) // RES), int((t - b) // RES))


# ── STAC ────────────────────────────────────────────────────────────────────
def _post(body: dict, tries: int = 5) -> dict:
    for k in range(tries):
        try:
            req = urllib.request.Request(STAC, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
            return json.load(urllib.request.urlopen(req, timeout=90))
        except Exception:  # noqa: BLE001
            if k == tries - 1:
                raise
            time.sleep(3 * (k + 1))
    return {}


def search(bbox4326, year: int, month: int, cloud_max: float = CLOUD_MAX) -> list[dict]:
    """그 달 장면 — 같은 칸 · 같은 날의 다시 처리된 판은 하나만(번호가 큰 쪽) · 구름 적은 순."""
    import calendar
    last = calendar.monthrange(year, month)[1]
    body = {"collections": ["sentinel-2-l2a"], "bbox": [round(v, 5) for v in bbox4326],
            "datetime": f"{year}-{month:02d}-01T00:00:00Z/{year}-{month:02d}-{last}T23:59:59Z",
            "limit": 200, "query": {"eo:cloud_cover": {"lt": cloud_max}}}
    feats = []
    while True:
        fc = _post(body)
        feats += fc.get("features", [])
        nxt = next((l for l in fc.get("links", []) if l.get("rel") == "next"), None)
        if not nxt or len(feats) > 1000:
            break
        body = nxt.get("body") or {**body, "next": (nxt.get("href") or "").split("next=")[-1]}
    best: dict[tuple, dict] = {}
    for f in feats:
        p = f["properties"]
        key = (p.get("grid:code"), p["datetime"][:10])
        if key not in best or f["id"] > best[key]["id"]:
            best[key] = f
    out = sorted(best.values(), key=lambda f: (f["properties"].get("eo:cloud_cover", 100), f["id"]))
    # 공개 COG 사본이 있는 장면만(일부 옛 장면은 요청자 부담 버킷의 jp2 만 가리킨다 — 계정 · 키가 필요해 쓰지 않음)
    return [f for f in out if all(str((f["assets"].get(b) or {}).get("href", "")).startswith("https://") for b in (*BANDS, "scl"))]


def scale_offset(item: dict, band: str) -> tuple[float, float]:
    rb = (item["assets"][band].get("raster:bands") or [{}])[0]
    return float(rb.get("scale", 1e-4)), float(rb.get("offset", -0.1))


# ── 읽기(그 격자로) ───────────────────────────────────────────────────────────
_tl = threading.local()


def _open(href: str):
    import rasterio
    c = getattr(_tl, "ds", None)
    if c is None:
        c = _tl.ds = {}
    ds = c.get(href)
    if ds is None:
        if len(c) > 24:
            for k in list(c)[:12]:
                try:
                    c.pop(k).close()
                except Exception:  # noqa: BLE001
                    pass
        for k in range(4):
            try:
                ds = rasterio.open(href)
                break
            except Exception:  # noqa: BLE001
                if k == 3:
                    raise
                time.sleep(2 * (k + 1))
        c[href] = ds
    return ds


def read_block(href: str, grid: Grid, r0: int, c0: int, h: int, w: int, nearest: bool) -> np.ndarray | None:
    """원격 COG 한 띠 → 격자의 (r0, c0, h, w) 조각(uint16 · 밖은 0). 같은 UTM 띠면 창 읽기, 아니면 다시 투영."""
    from rasterio.enums import Resampling
    from rasterio.windows import from_bounds
    rs = Resampling.nearest if nearest else Resampling.bilinear
    l = grid.x0 + c0 * RES
    t = grid.y0 - r0 * RES
    r, b = l + w * RES, t - h * RES
    for k in range(4):
        try:
            ds = _open(href)
            epsg = ds.crs.to_epsg() if ds.crs else None
            out = np.zeros((h, w), np.uint16)
            if epsg == grid.epsg:
                sl, sb, sr, st = ds.bounds
                il, ir, it, ib = max(l, sl), min(r, sr), min(t, st), max(b, sb)
                if il >= ir or ib >= it:
                    return None
                cc0, cc1 = int(round((il - l) / RES)), int(round((ir - l) / RES))
                rr0, rr1 = int(round((t - it) / RES)), int(round((t - ib) / RES))
                if cc1 <= cc0 or rr1 <= rr0:
                    return None
                win = from_bounds(il, ib, ir, it, ds.transform)
                out[rr0:rr1, cc0:cc1] = ds.read(1, window=win, out_shape=(rr1 - rr0, cc1 - cc0), resampling=rs)
            else:
                from pyproj import Transformer
                from rasterio.transform import from_origin
                from rasterio.vrt import WarpedVRT
                tb = Transformer.from_crs(grid.epsg, epsg, always_xy=True)
                xs, ys = tb.transform([l, r, r, l], [b, b, t, t])
                sl, sb, sr, st = ds.bounds
                if max(xs) <= sl or min(xs) >= sr or max(ys) <= sb or min(ys) >= st:
                    return None
                with WarpedVRT(ds, crs=f"EPSG:{grid.epsg}", transform=from_origin(l, t, RES, RES), width=w, height=h,
                               resampling=rs, nodata=0) as v:
                    out[:] = v.read(1)
            return out
        except Exception:  # noqa: BLE001
            try:
                _tl.ds.pop(href).close()
            except Exception:  # noqa: BLE001
                pass
            if k == 3:
                raise
            time.sleep(3 * (k + 1))
    return None


def blocks_of(grid: Grid, mask_geom=None, block: int = BLOCK) -> list[tuple[int, int, int, int]]:
    """격자를 조각으로 — mask_geom(격자 좌표계 shapely)이 있으면 그 범위에 걸치는 조각만."""
    from shapely.geometry import box
    out = []
    for r0 in range(0, grid.h, block):
        for c0 in range(0, grid.w, block):
            h, w = min(block, grid.h - r0), min(block, grid.w - c0)
            if mask_geom is not None:
                l, t = grid.x0 + c0 * RES, grid.y0 - r0 * RES
                if not mask_geom.intersects(box(l, t - h * RES, l + w * RES, t)):
                    continue
            out.append((r0, c0, h, w))
    return out


def item_box(item: dict, epsg: int):
    from pyproj import Transformer
    from shapely.geometry import shape
    from shapely.ops import transform as sh_tr
    return sh_tr(Transformer.from_crs(4326, epsg, always_xy=True).transform, shape(item["geometry"]))


def month_composite(grid: Grid, year: int, month: int, *, blocks=None, pool: ThreadPoolExecutor | None = None,
                    stats: dict | None = None, log=None) -> np.ndarray:
    """그 달 합성 (6, H, W) uint16 — 0 = 맑은 화소 없음.
    ① 구름 적은 후보 장면들의 SCL 을 한꺼번에 읽고(작음 · 20 m) ② 메모리에서 장면을 고르고(화소마다 맑은 관측 최대 2개)
    ③ 고른 장면 × 띠 × 조각을 한꺼번에 읽어 더한다 — 원격 읽기는 대기 시간이 길어 한 장면씩 차례로 읽으면 느리다."""
    import threading as _th
    from shapely.geometry import box
    blocks = blocks if blocks is not None else blocks_of(grid)
    st = stats if stats is not None else {}
    gl, gb, gr, gt = grid.bounds()
    gbox = box(gl, gb, gr, gt)
    bbox_of = {bk: box(grid.x0 + bk[1] * RES, grid.y0 - (bk[0] + bk[2]) * RES, grid.x0 + (bk[1] + bk[3]) * RES, grid.y0 - bk[0] * RES)
               for bk in blocks}
    cands = []
    for it in search(grid.bbox4326(), year, month):
        ib = item_box(it, grid.epsg)
        if not ib.intersects(gbox):
            continue
        bl = [bk for bk in blocks if ib.intersects(bbox_of[bk])]
        if bl:
            cands.append((it, bl))
    # 칸(MGRS)마다 구름 적은 순 앞 MAX_ITEMS 장 — 넓은 범위는 여러 칸이라 칸마다 따로 센다
    per: dict = {}
    keep = []
    for it, bl in cands:
        k = it["properties"].get("grid:code")
        if per.get(k, 0) < MAX_ITEMS:
            per[k] = per.get(k, 0) + 1
            keep.append((it, bl))
    cands = keep
    own = pool is None
    pool = pool or ThreadPoolExecutor(48)
    try:
        jobs = [(ci, bk) for ci, (it, bl) in enumerate(cands) for bk in bl]
        scl = dict(zip(jobs, pool.map(lambda j: read_block(cands[j[0]][0]["assets"]["scl"]["href"], grid, *j[1], True), jobs)))
        st["scl_reads"] = st.get("scl_reads", 0) + len(jobs)
        cnt = np.zeros((grid.h, grid.w), np.uint8)
        need_total = sum(h * w for _, _, h, w in blocks)
        chosen = []                                   # (장면, [(조각, 맑은 화소 표시)])
        for ci, (it, bl) in enumerate(cands):
            take, gain = [], 0
            for bk in bl:
                sc = scl.get((ci, bk))
                if sc is None:
                    continue
                r0, c0, h, w = bk
                ok = np.isin(sc, VALID_SCL) & (cnt[r0:r0 + h, c0:c0 + w] < MAX_OBS)
                n = int(ok.sum())
                if n > 0.01 * h * w or n > 20000:
                    take.append((bk, ok))
                    gain += n
            if gain < 0.002 * need_total:
                continue
            for bk, ok in take:
                r0, c0, h, w = bk
                cnt[r0:r0 + h, c0:c0 + w] += ok.astype(np.uint8)
            chosen.append((it, take))
            if log:
                full = int((cnt >= MAX_OBS).sum())
                log(f"  {year}-{month:02d} {it['id']} 구름 {it['properties'].get('eo:cloud_cover', 0):.0f}% · 2개 {full / max(1, need_total):.1%}")
        del scl
        acc = np.zeros((len(BANDS), grid.h, grid.w), np.float32)
        locks = {(bi, bk): _th.Lock() for bi in range(len(BANDS)) for bk in blocks}

        def add(href, bi, bk, ok):
            a = read_block(href, grid, *bk, False)
            if a is None:
                return
            r0, c0, h, w = bk
            m = ok & (a > 0)
            with locks[(bi, bk)]:
                sub = acc[bi, r0:r0 + h, c0:c0 + w]
                sub[m] += a[m]
        futs = [pool.submit(add, it["assets"][band]["href"], bi, bk, ok)
                for it, take in chosen for bi, band in enumerate(BANDS) for bk, ok in take]
        for fu in futs:
            fu.result()
        out = np.zeros((len(BANDS), grid.h, grid.w), np.uint16)

        def fin(job):
            bi, (r0, c0, h, w) = job
            cc = cnt[r0:r0 + h, c0:c0 + w]
            v = acc[bi, r0:r0 + h, c0:c0 + w] / np.maximum(cc, 1)
            out[bi, r0:r0 + h, c0:c0 + w] = np.clip(np.rint(v), 0, 65535).astype(np.uint16)
        list(pool.map(fin, [(bi, bk) for bi in range(len(BANDS)) for bk in blocks]))
        covered = sum(int((cnt[bk[0]:bk[0] + bk[2], bk[1]:bk[1] + bk[3]] >= 1).sum()) for bk in blocks)
    finally:
        if own:
            pool.shutdown()
    st.setdefault("months", {})[f"{year}-{month:02d}"] = {"scenes": [it["id"] for it, _ in chosen], "clear_share": round(covered / max(1, need_total), 4)}
    return out


def composite(grid: Grid, year: int, *, blocks=None, months=MONTHS, log=None, threads: int = 48) -> tuple[np.ndarray, dict]:
    """달별 합성 전부 (7 × 6, H, W) uint16 + 통계(달마다 쓴 장면 · 맑은 화소 비율)."""
    st: dict = {"year": year, "grid": {"epsg": grid.epsg, "x0": grid.x0, "y0": grid.y0, "w": grid.w, "h": grid.h}}
    out = np.zeros((len(months) * len(BANDS), grid.h, grid.w), np.uint16)
    with ThreadPoolExecutor(threads) as pool:
        for k, m in enumerate(months):
            out[k * len(BANDS):(k + 1) * len(BANDS)] = month_composite(grid, year, m, blocks=blocks, pool=pool, stats=st, log=log)
    return out, st


# ── 모델 입력(학습 · 분석 같은 규칙) ─────────────────────────────────────────────
def features(stack: np.ndarray, months: int = len(MONTHS)) -> np.ndarray:
    """(달 × 6, H, W) uint16 DN → (달 × 7, H, W) float32 — 반사율 6 띠 + 초록 정도(NDVI). 맑은 화소가 없는 달은 가까운 달 값으로 채움."""
    nb = len(BANDS)
    x = stack.reshape(months, nb, *stack.shape[1:]).astype(np.float32)
    valid = x[:, 3] > 0                                            # 근적외 0 = 그 달 없음
    if not valid.all():
        filled = x.copy()
        have = valid.copy()
        for d in range(1, months):
            for k in range(months):
                miss = ~have[k]
                if not miss.any():
                    continue
                for j in (k - d, k + d):
                    if 0 <= j < months:
                        m = miss & valid[j]
                        if m.any():
                            filled[k][:, m] = x[j][:, m]
                            have[k] |= m
                            miss = ~have[k]
        x = filled
        valid = have
    refl = np.clip(x * 1e-4, 0, 1.2)                              # Earth Search 는 기준선 04.00 이후 장면의 -1000 을 이미 뺐다(boa_offset_applied) — 반사율 = DN × 1e-4
    refl[~np.broadcast_to(valid[:, None], refl.shape)] = 0
    nd = (refl[:, 3] - refl[:, 2]) / (refl[:, 3] + refl[:, 2] + 1e-6)
    nd[~valid] = 0
    out = np.concatenate([refl, nd[:, None]], 1)                  # (달, 7, H, W)
    return out.reshape(months * (nb + 1), *stack.shape[1:])


def write_tif(path, stack: np.ndarray, grid: Grid, meta: dict | None = None):
    import rasterio
    prof = {"driver": "GTiff", "dtype": "uint16", "count": stack.shape[0], "width": grid.w, "height": grid.h,
            "crs": f"EPSG:{grid.epsg}", "transform": grid.transform, "nodata": 0, "tiled": True, "blockxsize": 512, "blockysize": 512,
            "compress": "deflate", "predictor": 2, "BIGTIFF": "IF_SAFER", "num_threads": "ALL_CPUS"}
    with rasterio.open(path, "w", **prof) as dst:
        dst.write(stack)
        if meta:
            dst.update_tags(landxi=json.dumps(meta, ensure_ascii=False)[:30000])
