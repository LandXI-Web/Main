"""공공용지 무단점유 분석서비스(11-01 PM 확인) — 영상 범위 안 공공용지에서 무단적치 쓰레기 · 불법 형질변경을 찾고 연속지적도로 땅 주인을 대조한다.

흐름(작업 대기열 GPU 워커 한 장 · 국토 변화 틀과 같은 칸 · 같은 결과 모양):
  1) 공공용지 필지 — 연속지적도(범위 시군구) 중 지목 도로 · 철도용지 · 도로공사 장부(토지마스터) 필지 · LH 사업지구 안 필지(설정 config/publand.yaml)
  2) 칸 — 공공용지 위에 48 m 간격 칸(AI 는 64 m 네모를 본다). 칸 중 공공용지가 30 % 이상인 칸만
  3) AI 판정 — 영상-문장 맞추기(CLIP ViT-L/14 · 전국 분석과 같은 문장) — 유형 확률이 기준 이상이고 반대 문장(도로 · 숲 · 건물 · 공사장 …)보다 높은 칸
  4) 경계 — 걸린 칸 안을 토지피복 AI(ap25)로 읽어 그 유형에 맞는 피복(쓰레기: 건물 · 나지 · 비대상 / 형질변경: 나지)만 남김 → 칸 ∩ 공공용지
  5) 두 시점이면 앞 시점 같은 칸의 확률이 낮은 것 = 신규 · 형질변경은 앞 시점에 맨흙이 아니던 곳만
  6) 필지 대조 — 가장 많이 겹친 필지의 지번 · 지목 · 소유 구분(브이월드 · 분류만) · 대조 결과(도로공사 장부 · 지목 · LH 사업지구)
결과 파일 = 국토 변화와 같은 모양(changes.geojson · stats.json · thumbs) — 지도 서비스 · 표 · 보고서 · XI ChatGEO 가 그대로 읽는다.
표기: 결과는 "무단 사용 의심 → 현장 확인"(자동 판정 · 결과 확인 전). 숫자는 센 값만.
"""
from __future__ import annotations

import json
import os
import time

import numpy as np
from shapely.geometry import box, mapping
from shapely.ops import unary_union

from . import detect as D
from . import imagery as I
from .ranges import to4326

VERSION = "publand-4"         # 4: 겹치는 작은 네모 한 번만 · 3: 합친 뒤 터 넓이 제한 · 덤불 빼기 · 2: 형질변경 터(작은 네모 이음 · 비슷한 맨흙 · 잔해로 넓히기 · 12 m 안 잇기 · 구멍 메움 · 11-01)
WORD = "무단 사용 의심 → 현장 확인"


def cfg() -> dict:
    from landxi_api import config as C
    return C.load_yaml("publand") or {}


def types() -> list[str]:
    return list(cfg().get("types") or ["무단적치 쓰레기", "불법 형질변경"])


# ── 공공용지 ───────────────────────────────────────────────────────────────
# 전국 층 세 가지(설정 public.layers) — 고속도로 = 도로공사 장부 필지 · 철도 = 지목 철도용지 필지 · LH 택지 = 사업지구 경계.
# 처음 한 번 하나의 파일(02. 데이터/publand/public_layers.parquet)로 묶어 두고 범위마다 잘라 쓴다(전국 범위도 같은 길).
_LAYERS: dict = {}


def layers(c: dict | None = None):
    """전국 공공용지 층(5179) — 열: PNU · jibun · jimok · use · addr0(시도 시군구) · land · land_kind · zid(사업지구)."""
    import geopandas as gpd
    import pandas as pd
    from landxi_api import config as LC
    c = c or cfg()
    L = (c.get("public") or {}).get("layers") or {}
    out = LC.DATA_ROOT / "publand" / "public_layers.parquet"
    key = str(out)
    if key in _LAYERS:
        return _LAYERS[key]
    if not out.exists():
        parts = []
        hw = L.get("highway")
        if hw:
            g = gpd.read_file(hw["path"])
            ex = "|".join(hw.get("exclude_sigungu") or [])
            if ex:
                g = g[~g["sigungu_m"].fillna("").str.contains(ex)]
            parts.append(gpd.GeoDataFrame({"PNU": g["PNU"].astype(str), "jibun": g["JIBUN"].astype(str).str.replace(r"\s*[가-힣]$", "", regex=True),
                                           "jimok": g["jimok"], "use": g["use_mst"], "addr0": (g["sido_m"].fillna("") + " " + g["sigungu_m"].fillna("")).str.strip(),
                                           "land": ["도로공사 장부 있음" + (f"({u})" if isinstance(u, str) and u else "") for u in g["use_mst"]],
                                           "land_kind": "도로공사 장부", "zid": None}, geometry=g.geometry.buffer(0), crs=g.crs))
        rl = L.get("rail")
        if rl:
            g = gpd.read_file(rl["path"])
            parts.append(gpd.GeoDataFrame({"PNU": g["PNU"].astype(str), "jibun": g["JIBUN"].astype(str).str.replace(r"\s*[가-힣]$", "", regex=True),
                                           "jimok": "철", "use": None, "addr0": g.get("sgg", pd.Series([None] * len(g))), "land": "지목 철도용지",
                                           "land_kind": "철도", "zid": None}, geometry=g.geometry.buffer(0), crs=g.crs))
        lh = L.get("lh")
        if lh:
            g = gpd.read_file(lh["path"])
            nm = g["zonename"].fillna("").astype(str).str.strip()
            parts.append(gpd.GeoDataFrame({"PNU": None, "jibun": None, "jimok": None, "use": None, "addr0": None,
                                           "land": ["LH 사업지구 안" + (f"({x})" if x else "") for x in nm], "land_kind": "LH 사업지구",
                                           "zid": g["zid"].astype(str)}, geometry=g.geometry.buffer(0), crs=g.crs))
        parts = [x.to_crs(5179) if x.crs is not None and x.crs.to_epsg() != 5179 else x for x in parts]
        G = gpd.GeoDataFrame(pd.concat(parts, ignore_index=True), geometry="geometry", crs=5179)
        out.parent.mkdir(parents=True, exist_ok=True)
        G.to_parquet(out)
    G = gpd.read_parquet(out)
    G.sindex
    _LAYERS[key] = G
    return G


def public_parcels(parcels, rng5179, c: dict | None = None):
    """범위 안 공공용지 — 전국 층(고속도로 장부 · 철도 · LH 사업지구)을 범위로 자른 것 + (시군구 범위면) 연속지적도 지목 도로 필지.
    parcels = parcels.for_range 결과(5179 · 전국 범위는 빈 표)."""
    import geopandas as gpd
    import pandas as pd
    c = c or cfg()
    pc = c.get("public") or {}
    G = layers(c)
    idx = list(G.sindex.query(rng5179, predicate="intersects"))
    P = G.iloc[idx].copy()
    jm = [j for j in (pc.get("jimok") or []) if j != "철"]
    if parcels is not None and len(parcels) and jm:
        have = set(P["PNU"].dropna())
        loc = parcels[parcels["jimok"].isin(jm) & ~parcels["PNU"].isin(have)]
        if len(loc):
            P = pd.concat([P, gpd.GeoDataFrame({"PNU": loc["PNU"], "jibun": loc["jibun"], "jimok": loc["jimok"], "use": loc.get("use"),
                                                "addr0": None, "land": "지목 도로", "land_kind": "도로", "zid": None}, geometry=loc.geometry, crs=5179)],
                          ignore_index=True)
    P = gpd.GeoDataFrame(P, geometry="geometry", crs=5179)
    if len(P) and not rng5179.contains(box(*P.total_bounds)):
        import shapely
        shapely.prepare(rng5179)
        inside = shapely.contains(rng5179, P.geometry.values)          # 범위 안에 통째로 든 것은 그대로(전국 범위에서 수십만 개를 자르지 않게)
        if not inside.all():
            cut = P.loc[~inside, "geometry"].intersection(rng5179)
            P.loc[~inside, "geometry"] = cut
            P = P[~P.geometry.is_empty]
    return P.reset_index(drop=True)


def cells(rng5179, pub, step: float, frame: float, min_ratio: float):
    """공공용지 위 칸 중심 · 칸 중 공공용지 비율 → [(x, y, ratio)]. 약 10 km 조각마다 12 m 격자로 칠해 칸(48 m)마다 비율을 센다(전국도 같은 길)."""
    from rasterio.features import rasterize
    from rasterio.transform import Affine
    if pub is None or not len(pub):
        return []
    sub = step / 4
    n = 200                                            # 조각 한 변 칸 수(48 m × 200 = 9.6 km)
    span = step * n
    mnx, mny, mxx, mxy = pub.total_bounds
    x0, y0 = np.floor(mnx / span) * span, np.floor(mny / span) * span
    si = pub.sindex
    out = []
    for tx in np.arange(x0, mxx, span):
        for ty in np.arange(y0, mxy, span):
            tb = box(tx, ty, tx + span, ty + span)
            idx = list(si.query(tb, predicate="intersects"))
            if not idx:
                continue
            tr = Affine(sub, 0, tx, 0, -sub, ty + span)
            m = rasterize(((pub.geometry.iloc[k], 1) for k in idx), out_shape=(n * 4, n * 4), transform=tr, fill=0, dtype="uint8")
            frac = m.reshape(n, 4, n, 4).mean(axis=(1, 3))
            rr, cc = np.nonzero(frac >= min_ratio)
            for r_, c_ in zip(rr, cc):
                out.append((float(tx + (c_ + 0.5) * step), float(ty + span - (r_ + 0.5) * step), float(frac[r_, c_])))
    return out


# ── AI(영상-문장 맞추기) ─────────────────────────────────────────────────────
def _clip(device: str, c: dict):
    """CLIP 모델 + 문장 특징 — 워커 안에서 한 번 올려 둔다(작업마다 모듈을 다시 읽어도 패키지에 둔 것은 남음)."""
    import change as PKG
    import clip
    import torch
    key = (c.get("clip_model") or "ViT-L/14", str(device), json.dumps(c.get("prompts"), ensure_ascii=False, sort_keys=True))
    hit = getattr(PKG, "_PUBLAND_CLIP", None)
    if hit and hit[0] == key:
        return hit[1]
    kw = {"download_root": c["clip_root"]} if c.get("clip_root") else {}
    m, _ = clip.load(key[0], device=device, **kw)
    m.eval()
    names, txt = [], []
    for k, v in (c.get("prompts") or {}).items():
        for s in v:
            names.append(k)
            txt.append(s)
    with torch.no_grad():
        tf = m.encode_text(clip.tokenize(txt).to(device)).float()
        tf /= tf.norm(dim=-1, keepdim=True)
    idx = {k: [i for i, n in enumerate(names) if n == k] for k in (c.get("prompts") or {})}
    obj = {"m": m, "tf": tf, "idx": idx}
    PKG._PUBLAND_CLIP = (key, obj)
    return obj


def clip_probs(crops: list[np.ndarray], device: str, c: dict, pause=None) -> list[dict]:
    """칸 그림(RGB) 목록 → 문장 묶음별 확률."""
    import torch
    from PIL import Image
    if not crops:
        return []
    M = _clip(device, c)
    m, tf, idx = M["m"], M["tf"], M["idx"]
    mean = torch.tensor([0.48145466, 0.4578275, 0.40821073]).view(1, 3, 1, 1)
    std = torch.tensor([0.26862954, 0.26130258, 0.27577711]).view(1, 3, 1, 1)
    bs = int(c.get("batch") or 32)
    out = []
    for s in range(0, len(crops), bs):
        arr = np.stack([np.asarray(Image.fromarray(x).resize((224, 224), Image.BICUBIC)) for x in crops[s:s + bs]])
        x = (torch.from_numpy(arr).permute(0, 3, 1, 2).float() / 255.0 - mean) / std
        with torch.no_grad():
            f = m.encode_image(x.to(device).type(m.dtype)).float()
            f /= f.norm(dim=-1, keepdim=True)
            p = (100 * f @ tf.T).softmax(-1).cpu().numpy()
        for pp in p:
            out.append({k: float(pp[v].sum()) for k, v in idx.items()})
        if pause:
            pause()
    return out


def decide(pr: dict, c: dict) -> tuple[str, float] | None:
    """칸 확률 → (유형, 확률) 또는 None(걸리지 않음)."""
    best = None
    neg = max([v for k, v in pr.items() if k.startswith("n_")] or [0.0])
    for t, gs in (c.get("groups") or {}).items():
        p = sum(pr.get(g, 0.0) for g in gs)
        if p < float(c.get("min_prob") or 0.3):
            continue
        if c.get("over_negative", True) and p <= neg:
            continue
        others = [sum(pr.get(g, 0.0) for g in gs2) for t2, gs2 in (c.get("groups") or {}).items() if t2 != t]
        if any(o > p for o in others):
            continue
        if any(pr.get(k, 0.0) > v for k, v in (c.get("block") or {}).items()):
            continue
        if any(pr.get(k, 0.0) > v for k, v in ((c.get("block_type") or {}).get(t) or {}).items()):
            continue
        if best is None or p > best[1]:
            best = (t, p)
    return best


def type_prob(pr: dict, t: str, c: dict) -> float:
    return float(sum(pr.get(g, 0.0) for g in (c.get("groups") or {}).get(t, [])))


# ── 경계(토지피복 AI) ────────────────────────────────────────────────────────


def _crop(img, ox, oy, res, x, y, half):
    x0, y0 = int(round((x - half - ox) / res)), int(round((oy - (y + half)) / res))
    n = int(round(2 * half / res))
    H, W = img.shape[:2]
    if x0 < 0 or y0 < 0 or x0 + n > W or y0 + n > H:
        return None, None
    return img[y0:y0 + n, x0:x0 + n], (ox + x0 * res, oy - y0 * res)


def _classes(net, rgb, up: bool, device, pause):
    """토지피복 AI(ap25) 12분류 지도(칸 그림 크기)."""
    import landcover_unet as LC
    x = D.upsample2(rgb) if up else rgb
    cm = LC._predict_one(net, x, device)
    if pause:
        pause()
    return cm[::2, ::2] if up else cm


def _mask_poly(m, origin, res):
    from rasterio.features import shapes
    from rasterio.transform import Affine
    from shapely.geometry import shape
    if not m.any():
        return None
    tr = Affine(res, 0, origin[0], 0, -res, origin[1])
    ps = [shape(g).buffer(0) for g, v in shapes(m.astype(np.uint8), mask=m, transform=tr) if v]
    u = unary_union([p for p in ps if not p.is_empty])
    return None if u.is_empty else u


def _pixmask(rgb, t: str, c: dict, res: float):
    """화소 거름 — 풀 · 나무(초록 지수 높음)는 빼고, 쓰레기 · 적치는 잔무늬(어수선함)가 큰 곳 · 형질변경은 맨흙빛(밝은 갈색 · 잔무늬 작음)만.
    토지피복 AI 가 맨흙 · 풀 · 적치를 모두 '비대상지'로 보는 계절 영상(봄 · 겨울)에서 경계를 맞추려는 것(설정 pix)."""
    from scipy import ndimage as ndi
    px = c.get("pix") or {}
    x = rgb.astype(np.float32) / 255.0
    r, g, b = x[..., 0], x[..., 1], x[..., 2]
    s = r + g + b + 1e-6
    exg = (2 * g - r - b) / s                                        # 초록 지수
    veg = exg > float(px.get("veg_exg") or 0.08)
    k = max(3, int(round(float(px.get("tex_m") or 3.0) / res)) | 1)  # 잔무늬 창(약 3 m)
    lum = x.mean(axis=-1)
    m1 = ndi.uniform_filter(lum, k)
    sd = np.sqrt(np.clip(ndi.uniform_filter(lum * lum, k) - m1 * m1, 0, None))
    if t == "불법 형질변경":
        soil = (r > g * 0.95) & (r > b * 1.05) & (lum > float(px.get("soil_lum") or 0.32))
        return ~veg & soil & (sd < float(px.get("soil_tex") or 0.09))
    sat = (x.max(axis=-1) - x.min(axis=-1)) > float(px.get("tarp_sat") or 0.28)   # 천막 · 비닐 · 자재(진한 색)
    return ~veg & ((sd > float(px.get("junk_tex") or 0.07)) | sat)


def _refine(net, cr, org, res, t: str, c: dict, up: bool, device, pause, prev=None):
    """걸린 칸 → 그 유형이 있는 자리(5179 폴리곤 · 없으면 None).
    ① 칸 안 작은 네모(겹침)를 같은 AI 문장으로 다시 보고 그 유형이 걸린 네모만 ② 토지피복 AI 로 그 유형일 수 없는 피복(숲 · 논 · 물 · 도로 등)을 뺀다
    ③ 형질변경 + 앞 시점이 있으면 앞 시점에 이미 맨흙이던 곳을 뺀다."""
    sub, st = float(c.get("sub_m") or 32), float(c.get("sub_step") or 16)
    n = cr.shape[0]
    size = n * res
    cx, cy = org[0] + size / 2, org[1] - size / 2
    offs = np.arange(-(size / 2 - sub / 2), size / 2 - sub / 2 + 0.01, st)
    wins, crops = [], []
    for dx in offs:
        for dy in offs:
            x, y = cx + dx, cy + dy
            sc, _o = _crop(cr, org[0], org[1], res, x, y, sub / 2)
            if sc is None:
                continue
            wins.append(box(x - sub / 2, y - sub / 2, x + sub / 2, y + sub / 2))
            crops.append(sc)
    keep_w = []
    for w, pr in zip(wins, clip_probs(crops, device, c, pause)):
        p = type_prob(pr, t, c)
        neg = max([v for k, v in pr.items() if k.startswith("n_")] or [0.0])
        if p >= float(c.get("sub_min") or 0.3) and p > neg:
            keep_w.append(w)
    if not keep_w:
        return None
    W = unary_union(keep_w)
    cm = _classes(net, cr, up, device, pause)
    keep = np.isin(cm, list((c.get("keep_classes") or {}).get(t) or [10])) & _pixmask(cr, t, c, res)
    if prev is not None:
        ca = _classes(net, prev, up, device, pause)
        keep &= ~np.isin(ca, list(c.get("bare_classes") or [10]))
    from scipy import ndimage as ndi
    kk = max(1, int(round(float((c.get("pix") or {}).get("close_m") or 2.0) / res)))
    keep = ndi.binary_closing(keep, structure=np.ones((2 * kk + 1, 2 * kk + 1), bool))   # 잔무늬 사이 틈을 메워 한 덩어리로
    keep = D._clean(keep, res)
    K = _mask_poly(keep, org, res)
    if K is None:
        return None
    g = W.intersection(K).buffer(0)
    return None if g.is_empty else g


def _footprint(net, cr, org, res, c: dict, up: bool, device, pause, cache: dict | None = None):
    """형질변경 터 — 걸린 칸 그림 안을 작은 네모(설정 fp.win_m · fp.step_m)로 다시 보고, 흙 · 적치 · 버린 것 문장(fp.groups) 확률이
    fp.min_prob 이상이고 반대 문장보다 높은 네모를 모아 한 덩어리로(틈 메움 · 구멍 메움). 포장도로 · 물(토지피복 AI) · 짙은 초록은 뺀다.
    맨흙 · 적치 · 가건물이 섞인 터가 화소 색(봄 · 겨울 영상)으로는 갈라지던 것을 영상-문장 AI 의 넓은 눈으로 잇는다(11-01 PM)."""
    fp = c.get("fp") or {}
    win, st = float(fp.get("win_m") or 16), float(fp.get("step_m") or 8)
    n = cr.shape[0]
    size = n * res
    cx, cy = org[0] + size / 2, org[1] - size / 2
    offs = np.arange(-(size / 2 - win / 2), size / 2 - win / 2 + 0.01, st)
    wins, keys, need, crops = [], [], [], []
    cache = {} if cache is None else cache               # 이웃 칸과 겹치는 네모(칸 48 m · 네모 8 m 간격이라 같은 자리)는 한 번만 본다(같은 블록 안 · 11-01 PM ⓐ)
    for dx in offs:
        for dy in offs:
            x, y = cx + dx, cy + dy
            kk = (round(x, 1), round(y, 1), win)
            if kk not in cache and kk not in need:
                sc, _o = _crop(cr, org[0], org[1], res, x, y, win / 2)
                if sc is None:
                    continue
                need.append(kk)
                crops.append(sc)
            wins.append(box(x - win / 2, y - win / 2, x + win / 2, y + win / 2))
            keys.append(kk)
    for kk, pr in zip(need, clip_probs(crops, device, c, pause)):
        cache[kk] = pr
    gs = list(fp.get("groups") or ["soilwork", "junk", "scrapcar", "container"])
    keep_w, road_w = [], []
    for w, pr in zip(wins, (cache[k0] for k0 in keys)):
        pv = sum(pr.get(g, 0.0) for g in gs)
        neg = max([v for k, v in pr.items() if k.startswith("n_")] or [0.0])
        if pv >= float(fp.get("min_prob") or 0.35) and pv > neg:
            keep_w.append(w)
        elif pr.get("n_road", 0.0) >= float(fp.get("road_prob") or 0.35):
            road_w.append(w)                             # 같은 AI 가 도로 · 선로로 본 네모 — 터를 넓힐 때 넘지 않는다(포장면 · 갓길)
    if not keep_w:
        return None
    gap = float(fp.get("join_m") or 6)
    W = unary_union(keep_w).buffer(gap, join_style=1).buffer(-gap, join_style=1)
    # 뺄 것 — 포장도로 · 물(토지피복 AI) · 짙은 초록(나무 · 풀)
    from scipy import ndimage as ndi
    cm = _classes(net, cr, up, device, pause)
    x = cr.astype(np.float32) / 255.0
    exg = (2 * x[..., 1] - x[..., 0] - x[..., 2]) / (x.sum(axis=-1) + 1e-6)
    k = max(3, int(round(3.0 / res)) | 1)
    green = ndi.uniform_filter(exg, k) > float(fp.get("green_exg") or 0.12)
    lum0 = ndi.uniform_filter(x.mean(axis=-1), k)
    exs0 = ndi.uniform_filter(exg, k)
    shrub = (lum0 < float(fp.get("shrub_lum") or 0.30)) & (exs0 > float(fp.get("shrub_exg") or 0.08))   # 마른 덤불 · 나무 그늘(어둡고 초록기) — 지붕 · 잔해는 초록기가 없어 남는다
    bad = np.isin(cm, list(fp.get("drop_classes") or [3, 11])) | green | shrub
    bad = ndi.binary_opening(bad, structure=np.ones((k, k), bool))           # 작은 점은 무시(덩어리 가운데 몇 화소 초록 · 그림자)
    # 터 넓히기(11-01 PM "조금 더 크게 덩어리로") — 걸린 네모 안(씨앗)의 밝기 · 초록 지수 분포와 이어지는 화소로 grow_m 까지 넓힌다
    # (맨흙 · 회색 잔해 · 길 따라 이어지는 맨흙). 도로 · 물 · 짙은 초록은 넘지 않는다. 넓히는 거리를 묶어 풀밭 전체로 번지지 않게.
    from rasterio.features import rasterize
    from rasterio.transform import Affine
    tr = Affine(res, 0, org[0], 0, -res, org[1])
    if road_w:
        # 도로로 본 네모 가운데 토지피복 AI 도 포장(도로 · 주차장)이 fp.road_pave 이상인 것만 뺀다 — 흙길 · 다져진 길은 터에 남긴다(579 가운데 길)
        pave = np.isin(cm, [2, 3])
        rw = []
        for w in road_w:
            mk = rasterize([(w, 1)], out_shape=cr.shape[:2], transform=tr, fill=0).astype(bool)
            if mk.any() and pave[mk].mean() >= float(fp.get("road_pave") or 0.3):
                rw.append(w)
        if rw:
            bad = bad | rasterize([(unary_union(rw).buffer(-2), 1)], out_shape=cr.shape[:2], transform=tr, fill=0).astype(bool)
    seed = rasterize([(W, 1)], out_shape=cr.shape[:2], transform=tr).astype(bool) & ~bad
    if not seed.any():
        return None
    lum = ndi.uniform_filter(x.mean(axis=-1), k)
    exs = ndi.uniform_filter(exg, k)
    sl, se = lum[seed], exs[seed]
    # 사람이 바꾼 표면(맨흙 · 회색 잔해 · 적치 · 가건물 지붕 · 차량) — 초록이 아니고(씨앗의 초록 지수 범위) 포장도로 · 물이 아니면 어두워도 잇는다.
    # 아주 어두운 곳(나무 그림자)만 뺀다(fp.dark_min). 예전에는 씨앗 밝기 범위만 이어 어두운 지붕 · 회색 잔해에서 멈췄다(11-01 PM).
    ok = (lum > float(fp.get("dark_min") or 0.12)) & (lum < np.percentile(sl, 95) + float(fp.get("grow_lum_hi") or 0.10)) \
        & (exs < np.percentile(se, 90) + 0.01) & ~bad
    # 칸 하나에서 넓힌 터는 fp.max_cell_m2 까지(11-01 PM ⓑ) — 넘기 직전에서 멈춘다(씨앗이 이미 크면 씨앗 그대로)
    cap_px = float(fp.get("max_cell_m2") or 2500) / (res * res)
    m = seed.copy()
    for _ in range(max(1, int(round(float(fp.get("grow_m") or 12) / res)))):
        nm = (ndi.binary_dilation(m) & ok) | m
        if (nm == m).all() or nm.sum() > max(cap_px, seed.sum()):
            break
        m = nm
    cl = max(3, int(round(float(fp.get("close_m") or 4) / res)) | 1)
    m = ndi.binary_fill_holes(ndi.binary_closing(m, structure=np.ones((cl, cl), bool)))
    m = ndi.binary_opening(m, structure=np.ones((k, k), bool)) & ~bad
    lab, _n = ndi.label(m)
    ids = np.unique(lab[seed & m])
    m = np.isin(lab, ids[ids > 0])
    if m.sum() > float(fp.get("grow_max_x") or 2.5) * max(1, int(seed.sum())):   # 씨앗보다 너무 크게 번지면(풀밭 · 포장면) 넓히지 않는다
        m = seed
    g = _mask_poly(m, org, res)
    return None if g is None or g.is_empty else g.buffer(0)


def _shrink_total(g, mem: list, cs: list, c: dict):
    """합친 뒤 너무 큰 형질변경 터 줄이기(11-01 PM) — 버리지 않고 ① 좁은 띠를 끊고(fp.strip_m) ② AI 확률이 높은 칸부터 둘레(fp.keep_m)만 남겨 fp.max_total_m2 까지."""
    fp = c.get("fp") or {}
    mx = float(fp.get("max_total_m2") or 4000)
    if g.area <= mx:
        return g
    r = float(fp.get("strip_m") or 6)
    o = g.buffer(-r, join_style=1).buffer(r, join_style=1).intersection(g).buffer(0)
    if not o.is_empty:
        g = o
    if g.area <= mx:
        return g
    keep = float(fp.get("keep_m") or 32)
    acc = None
    seen = set()
    best = None
    for x in sorted(mem, key=lambda m: -float(m.get("p") or 0)):
        i = x.get("cell")
        if i in seen or i is None or i >= len(cs):
            continue
        seen.add(i)
        q = box(cs[i][0] - keep, cs[i][1] - keep, cs[i][0] + keep, cs[i][1] + keep)
        acc = q if acc is None else acc.union(q)
        cand = g.intersection(acc).buffer(0)
        if cand.area > mx:
            break
        best = cand
    if best is None or best.is_empty:                     # 가장 강한 칸 둘레만으로도 넘으면 그 둘레를 줄여서
        i = next(iter(seen))
        d = keep
        while d > 8:
            d *= 0.8
            best = g.intersection(box(cs[i][0] - d, cs[i][1] - d, cs[i][0] + d, cs[i][1] + d)).buffer(0)
            if best.area <= mx:
                break
    return best


def _fill_holes(g, max_m2: float):
    """작은 구멍 메우기(덩어리 안 몇 ㎡ 빈 곳)."""
    from shapely.geometry import MultiPolygon, Polygon
    polys = list(g.geoms) if hasattr(g, "geoms") else [g]
    out = []
    for q in polys:
        if q.geom_type != "Polygon":
            continue
        holes = [h for h in q.interiors if Polygon(h).area > max_m2]
        out.append(Polygon(q.exterior, holes))
    return MultiPolygon(out) if len(out) > 1 else (out[0] if out else g)


def _load_parts(dirs) -> dict:
    """체크포인트(parts/p*.jsonl) → {블록: 기록} — 같은 블록은 먼저 읽은 것."""
    out: dict = {}
    for d0 in dirs:
        pd = d0 / "parts"
        if not pd.exists():
            continue
        for f in sorted(pd.glob("p*.jsonl")):
            for ln in f.read_text(encoding="utf-8").splitlines():
                try:
                    rec = json.loads(ln)
                    out.setdefault(tuple(rec["blk"]), rec)
                except Exception:  # noqa: BLE001
                    pass
    return out


# ── 한 범위 ─────────────────────────────────────────────────────────────────
def compute(*, run_id: str, rng5179, line5179, year_a: int, year_b: int, zoom: int, net, parcels, src_a=None, src_b=None,
            device="cuda", pause=None, progress=None, log=print, out=None, part=None, resume=None) -> dict:
    t0 = time.perf_counter()
    c = cfg()
    pk, pn = (int(part[0]), int(part[1])) if part else (0, 1)          # 이 칸(shard)이 맡는 블록 = 블록 번호 % pn == pk
    T = types()
    SB = dict(src_b or {"kind": "ngii", "year": year_b})
    SA = dict(src_a or SB)
    for s in (SA, SB):
        if s.get("kind") == "imagery" and not s.get("path"):
            from workers import imagery_src
            s["path"] = imagery_src.imagery_path(s["id"])
    two = not (SA.get("kind") == SB.get("kind") and (SA.get("id") == SB.get("id") if SA.get("kind") == "imagery" else int(SA.get("year") or 0) == int(SB.get("year") or 0)))
    (out / "thumbs").mkdir(parents=True, exist_ok=True)
    # 시점마다 그 해 가장 고운 영상(국토지리정보원 25cm 해 · 51cm 해가 섞여도 칸 그림은 224로 같게 맞춘다) — 등록 영상은 25cm 격자
    try:
        av = I.available_years(rng5179.bounds, [int(s.get("year")) for s in (SA, SB) if s.get("kind") != "imagery"])
    except Exception:  # noqa: BLE001
        av = {}
    zb = 18 if SB.get("kind") == "imagery" else int(av.get(int(SB.get("year") or 0)) or zoom)
    za = 18 if SA.get("kind") == "imagery" else int(av.get(int(SA.get("year") or 0)) or zoom)
    zoom = zb
    up = zoom == 17
    step, frame = float(c.get("cell_m") or 48), float(c.get("frame_m") or 64)
    if progress:
        progress("prepare", 0, 1)
    pub = public_parcels(parcels, rng5179, c)
    cs = cells(rng5179, pub, step, frame, float(c.get("min_public_ratio") or 0.3))
    log("공공용지 필지", 0 if pub is None else len(pub), "칸", len(cs))
    # 칸을 영상 블록(16×16 타일)으로 묶는다 — 블록마다 영상을 한 번 받는다
    span = I.NG.tile_span_m(zoom) * 16
    by_blk: dict[tuple, list[int]] = {}
    for i, (x, y, _r) in enumerate(cs):
        by_blk.setdefault((int((x - I.NG.ORIGIN_X) // span), int((I.NG.ORIGIN_Y - y) // span)), []).append(i)
    half = frame / 2
    probs_b: dict[int, dict] = {}
    probs_a: dict[int, dict] = {}
    pieces: list[dict] = []
    tiles = {"b": 0, "a": 0}
    seen = 0
    keys = sorted(by_blk)
    # 이어서(체크포인트) — 블록마다 찾은 조각을 parts/p{k}.jsonl 에 한 줄씩. 다시 받은 칸 · 이어 받은 작업(resume)은 끝난 블록을 다시 하지 않는다
    pdir = out / "parts"
    pdir.mkdir(parents=True, exist_ok=True)
    for d0 in (resume or []):
        for f in sorted((d0 / "parts").glob("p*.jsonl")) if (d0 / "parts").exists() else []:
            dst = pdir / (f.name if f.name.startswith("pr_") else f"pr_{d0.name}_{f.name}")
            if not dst.exists():
                tmp = dst.with_suffix(f".tmp{pk}")
                tmp.write_bytes(f.read_bytes())
                os.replace(tmp, dst)
    done_blk = _load_parts([out, *(resume or [])])
    mine_keys = [k for bi, k in enumerate(keys) if bi % pn == pk]
    ckf = pdir / f"p{pk}.jsonl"
    if ckf.exists() and ckf.stat().st_size and not ckf.read_bytes().endswith(b"\n"):
        with open(ckf, "a", encoding="utf-8") as fp0:
            fp0.write("\n")                                  # 전원이 끊겨 잘린 줄 — 다음 줄이 붙지 않게(잘린 줄의 블록은 다시 돈다)
    ck = open(ckf, "a", encoding="utf-8")
    try:
        from workers import bus as _bus
        _r = _bus.r() if str(run_id).startswith("job_") else None     # 작업 대기열 작업만(시험 계산은 Redis 에 쓰지 않음)
    except Exception:  # noqa: BLE001
        _r = None
    nkey = f"job:{run_id}"
    try:
        from landxi_api import config as _LC
        first = str(((_LC.load_yaml("pools").get("power") or {}).get("national") or {}).get("gpu", [0])[0])
    except Exception:  # noqa: BLE001
        first = "0"
    _second = pn > 1 and str(os.environ.get("CUDA_VISIBLE_DEVICES") or "0").split(",")[0] != first
    pause0 = pause

    def _gp():
        """쉼 + 두 장 감시 — 합 전력 · 온도로 한 장 모드(power:single)가 되면 두 번째 장 칸은 풀릴 때까지 멈춘다(긴 칸은 워커 읽기 쪽 판정을 거치지 않으므로 여기서 · 11-01 셧다운)."""
        if pause0:
            pause0()
        while _second and _r is not None and _r.exists("power:single"):
            time.sleep(2)
            if pause0:
                pause0()
    pause = _gp

    def _tick(nb: int = 1):
        """블록 진행 — 칸이 여럿이어도 한 작업의 진행률 하나(Redis 합)."""
        if _r is None:
            return None
        try:
            return int(_r.hincrby(nkey, "pl_done", nb))
        except Exception:  # noqa: BLE001
            return None
    skip = [k for k in mine_keys if k in done_blk]
    if _r is not None:                                 # 진행률 = 체크포인트에 남은 끝난 블록 수(다시 받은 칸이 두 번 세지 않게 · 두 칸이 같은 값을 적음)
        try:
            _r.hset(nkey, "pl_done", len(done_blk))
        except Exception:  # noqa: BLE001
            pass
    if skip:
        log("이어서 - 끝난 블록", len(skip))
    t_pw = [0.0]

    def _power():
        """두 장 전력 · 온도 기록(장마다 30초 평균 판정은 PowerThrottle · 여기는 1분마다 기록 · 첫 칸만)."""
        if pk != 0 or time.time() - t_pw[0] < 60:
            return
        t_pw[0] = time.time()
        try:
            import subprocess
            o = subprocess.run(["nvidia-smi", "--query-gpu=index,power.draw,utilization.gpu,temperature.gpu", "--format=csv,noheader,nounits"],
                               capture_output=True, text=True, timeout=10).stdout.strip().replace("\n", " | ")
            with open(out / "power.log", "a", encoding="utf-8") as fp:
                fp.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} {o}\n")
        except Exception:  # noqa: BLE001
            pass

    def _ser(x):
        return {"type": x["type"], "p": x["p"], "pa": x["pa"], "cell": x["cell"], "sq": list(x["sq"].bounds),
                "cov": x["cov"].wkb_hex if x.get("cov") is not None else None, "chg": bool(x.get("chg"))}
    seen_blk = [0]

    def _blk_done(kk, n_before):
        """블록 끝 — 체크포인트 한 줄 · 진행률(모든 칸 합)."""
        rec = {"blk": list(kk), "pieces": [_ser(x) for x in pieces[n_before:]], "seen": seen - seen_blk[0]}
        seen_blk[0] = seen
        ck.write(json.dumps(rec, ensure_ascii=False) + "\n")
        ck.flush()
        os.fsync(ck.fileno())                            # 전원이 끊겨도 끝난 블록은 남게(11-01 셧다운)
        d = _tick(1)
        if progress:
            progress("infer", d if d is not None else 0, len(keys))
    for bi, k in enumerate(keys):
        if bi % pn != pk or k in done_blk:
            continue
        if _r is not None and pn > 1:
            try:
                if not _r.set(f"plblk:{run_id}:{k[0]}:{k[1]}", "1", nx=True, ex=int((c.get("fp") or {}).get("claim_s") or 900)):
                    continue                                 # 다른 장비가 이 블록을 맡음
            except Exception:  # noqa: BLE001
                pass
        _power()
        n_before = len(pieces)
        ids = by_blk[k]
        xs, ys = [cs[i][0] for i in ids], [cs[i][1] for i in ids]
        fpx = float((c.get("fp") or {}).get("frame_extra_m") or 16)       # 형질변경 터는 칸 그림보다 둘레를 조금 더 본다
        bb = (min(xs) - half - fpx - 2, min(ys) - half - fpx - 2, max(xs) + half + fpx + 2, max(ys) + half + fpx + 2)
        tspan = I.NG.tile_span_m(zoom)
        want_t = {(int((x0 - I.NG.ORIGIN_X) // tspan), int((I.NG.ORIGIN_Y - y0) // tspan))
                  for i in ids for x0 in (cs[i][0] - half, cs[i][0], cs[i][0] + half - 0.01) for y0 in (cs[i][1] - half + 0.01, cs[i][1], cs[i][1] + half)}
        need = (lambda c_, r_, z_, _w=want_t: (c_, r_) in _w)        # 칸이 걸친 타일만 받는다(고속도로 · 철도처럼 길쭉한 곳에서 블록 전체를 받지 않게)
        B, (ox, oy, res), gb_n, _ = I.fetch_source(SB, bb, zoom, need=need, workers=24)
        tiles["b"] += gb_n
        if gb_n == 0:
            _blk_done(k, n_before)
            continue
        crops, okids, origins = [], [], {}
        for i in ids:
            cr, org = _crop(B, ox, oy, res, cs[i][0], cs[i][1], half)
            if cr is None or (cr.max(axis=-1) > 0).mean() < 0.8:
                continue
            crops.append(cr)
            okids.append(i)
            origins[i] = org
        if not crops:
            _blk_done(k, n_before)
            continue
        seen += len(crops)
        for i, pr in zip(okids, clip_probs(crops, device, c, pause)):
            probs_b[i] = pr
        hits = [(i, decide(probs_b[i], c)) for i in okids]
        hits = [(i, h) for i, h in hits if h]
        crop_b = dict(zip(okids, crops))
        A = None
        acr = {}
        if two:                                       # 두 시점 — 앞 시점 영상(같은 칸 · 그 해 가장 고운 격자)
            sa_ = I.NG.tile_span_m(za)
            want_a = {(int((x0 - I.NG.ORIGIN_X) // sa_), int((I.NG.ORIGIN_Y - y0) // sa_))
                      for i in ids for x0 in (cs[i][0] - half, cs[i][0], cs[i][0] + half - 0.01) for y0 in (cs[i][1] - half + 0.01, cs[i][1], cs[i][1] + half)}
            A, (oxa, oya, resa), ga_n, _ = I.fetch_source(SA, bb, za, need=(lambda c_, r_, z_, _w=want_a: (c_, r_) in _w), workers=24)
            tiles["a"] += ga_n
            if ga_n:
                for i in okids:
                    cr, _o = _crop(A, oxa, oya, resa, cs[i][0], cs[i][1], half)
                    if cr is not None and (cr.max(axis=-1) > 0).mean() >= 0.8:
                        if cr.shape[:2] != crop_b[i].shape[:2]:
                            from PIL import Image
                            cr = np.asarray(Image.fromarray(cr).resize((crop_b[i].shape[1], crop_b[i].shape[0]), Image.BICUBIC))
                        acr[i] = cr
                hit_a = [i for i, _h in hits if i in acr]
                for i, pr in zip(hit_a, clip_probs([acr[i] for i in hit_a], device, c, pause)):
                    probs_a[i] = pr
            else:
                A = None
        # 두 시점 형질변경(토지피복 AI 변화) — 앞 시점 숲 · 풀 · 밭 · 논이던 공공용지가 뒤 시점 맨흙(나지)으로 바뀐 곳
        chg = c.get("change") or {}
        if acr and chg.get("on", True):
            frm, to = list(chg.get("from") or [0, 5, 7, 8, 9]), list(chg.get("to") or [10])
            cmin = float(chg.get("min_m2") or 100)
            for i in okids:
                if i not in acr:
                    continue
                pr = probs_b.get(i) or {}
                if any(pr.get(k, 0.0) > v for k, v in (c.get("block") or {}).items()):
                    continue
                if sum(pr.get(k, 0.0) for k in (chg.get("evidence") or ["soilwork", "junk", "scrapcar", "container"])) < float(chg.get("min_evidence") or 0.2):
                    continue                              # 영상-문장 AI 가 흙 · 적치 흔적을 보지 못한 칸(계절 차이 · 잔디 깎기 등)은 뺀다
                cb = _classes(net, crop_b[i], up, device, pause)
                ca = _classes(net, acr[i], up, device, pause)
                m = D._clean(np.isin(ca, frm) & np.isin(cb, to), res)
                K = _mask_poly(m, origins[i], res)
                x, y = cs[i][0], cs[i][1]
                sq = box(x - step / 2, y - step / 2, x + step / 2, y + step / 2)
                if K is None:
                    continue
                K = K.intersection(sq).buffer(0)
                if K.is_empty or K.area < cmin:
                    continue
                pieces.append({"type": "불법 형질변경", "p": round(type_prob(pr, "불법 형질변경", c) + type_prob(pr, "무단적치 쓰레기", c), 3), "pa": 0.0,
                               "cell": i, "sq": sq, "cov": K, "chg": True})
        if not hits:
            _blk_done(k, n_before)
            continue
        fp_cache: dict = {}                               # 이 블록에서 본 작은 네모(겹침 한 번만)
        for i, (t, p) in hits:
            x, y = cs[i][0], cs[i][1]
            cr, org = _crop(B, ox, oy, res, x, y, half)
            prev = None
            if t == "불법 형질변경":
                prev = acr.get(i)
            cov = None
            try:
                cov = _refine(net, cr, org, res, t, c, up, device, pause, prev=prev)
            except Exception as e:  # noqa: BLE001
                log("경계 건너뜀", type(e).__name__)
            sq = box(x - step / 2, y - step / 2, x + step / 2, y + step / 2)
            pa = type_prob(probs_a[i], t, c) if i in probs_a else None
            pieces.append({"type": t, "p": p, "pa": pa, "cell": i, "sq": sq, "cov": cov})
            if (c.get("fp") or {}).get("on", True):
                try:
                    cr2, org2 = _crop(B, ox, oy, res, x, y, half + fpx)
                    if cr2 is None:
                        cr2, org2 = cr, org
                    fpg = _footprint(net, cr2, org2, res, c, up, device, pause, cache=fp_cache)
                except Exception as e:  # noqa: BLE001
                    fpg = None
                    log("형질변경 터 건너뜀", type(e).__name__)
                if fpg is not None:
                    pt = type_prob(probs_b[i], "불법 형질변경", c) + type_prob(probs_b[i], "무단적치 쓰레기", c)
                    pas = (type_prob(probs_a[i], "불법 형질변경", c) + type_prob(probs_a[i], "무단적치 쓰레기", c)) if i in probs_a else None
                    pieces.append({"type": "불법 형질변경", "p": round(pt, 3), "pa": pas, "cell": i, "sq": fpg.envelope.union(sq), "cov": fpg, "fp": True})
        _blk_done(k, n_before)
    ck.close()
    (pdir / f"p{pk}.done").write_text(str(len(pieces)), encoding="utf-8")
    # 나눠 돈 칸 — 모두 끝났는지 보고, 마지막으로 끝난 칸 하나만 합친다(나머지는 빈 결과로 끝)
    if pn > 1:
        if not all((pdir / f"p{j}.done").exists() for j in range(pn)):
            return {"_final": False, "part": [pk, pn], "pieces": len(pieces), "seconds": round(time.perf_counter() - t0, 1)}
        t_w = time.time()
        while time.time() - t_w < 1800:
            miss = set(keys) - set(_load_parts([out, *(resume or [])]))
            if not miss:
                break
            time.sleep(10)
            if pause:
                pause()
        else:
            raise RuntimeError(f"합치기 전 빠진 블록 {len(set(keys) - set(_load_parts([out, *(resume or [])])))}개")
        try:
            fd = os.open(str(pdir / "merge.lock"), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.close(fd)
        except FileExistsError:
            return {"_final": False, "part": [pk, pn], "pieces": len(pieces), "seconds": round(time.perf_counter() - t0, 1)}
    # 합치기 — 모든 칸 · 이어 받은 블록의 조각(체크포인트가 한 출처)
    from shapely import wkb as _wkb
    recs = _load_parts([out, *(resume or [])])
    pieces = []
    seen = 0
    for rec in recs.values():
        seen += int(rec.get("seen") or 0)
        for x in rec.get("pieces") or []:
            pieces.append({"type": x["type"], "p": x["p"], "pa": x["pa"], "cell": x["cell"], "sq": box(*x["sq"]),
                           "cov": _wkb.loads(bytes.fromhex(x["cov"])) if x.get("cov") else None, "chg": x.get("chg")})
    log("합치기 - 블록", len(recs), "조각", len(pieces))
    if progress:
        progress("polygons", 1, 1)
    if os.environ.get("PUBLAND_DEBUG") and probs_b:
        (out / "cells.json").write_text(json.dumps([{"i": i, "x": cs[i][0], "y": cs[i][1], "b": probs_b.get(i), "a": probs_a.get(i)} for i in range(len(cs))],
                                                   ensure_ascii=False), encoding="utf-8")
    # 붙은 칸끼리 한 덩어리 · 공공용지 안만 · 피복 경계(없으면 칸 그대로)
    psx = pub.sindex if pub is not None and len(pub) else None

    def _pub_near(g):
        """조각 둘레 공공용지(전국에서 수십만 도형을 한 번에 합치지 않게 · 둘레만)."""
        if psx is None:
            return None
        ii = list(psx.query(g, predicate="intersects"))
        return unary_union([pub.geometry.iloc[j] for j in ii]) if ii else None
    feats = []
    min_a = float(c.get("min_area_m2") or 50)
    new_th = float(c.get("new_max_prob") or 0.15)
    for t in T:
        mine = [x for x in pieces if x["type"] == t]
        if not mine:
            continue
        jm = float((c.get("fp") or {}).get("join_m") or 6) if t == "불법 형질변경" else 0.5
        u = unary_union([x["sq"] for x in mine]).buffer(jm).buffer(-jm)
        parts = list(u.geoms) if hasattr(u, "geoms") else [u]
        for part in parts:
            mem = [x for x in mine if x["sq"].intersects(part) and x["sq"].intersection(part).area > 1]
            covs = [x["cov"] for x in mem if x["cov"] is not None]
            if not covs:                                  # 칸 안에 그 유형에 맞는 피복이 없으면(숲 · 풀 · 포장도로뿐) 버린다
                continue
            g = unary_union(covs)
            if t == "불법 형질변경":                        # 가까운(fp.join_m · 6 m 이면 12 m 안) 조각을 잇고 작은 구멍을 메운다
                jm2 = float((c.get("fp") or {}).get("join_m") or 6)
                g = _fill_holes(g.buffer(jm2, join_style=1).buffer(-jm2, join_style=1), float((c.get("fp") or {}).get("hole_m2") or 150))
            if psx is not None:
                pu = _pub_near(g)
                g = g.intersection(pu) if pu is not None else box(0, 0, 0, 0)
            g = g.buffer(0)
            if g.is_empty or g.area < min_a:
                continue
            g = g.buffer(2, join_style=1).buffer(-2, join_style=1).simplify(0.4, preserve_topology=True)   # 칸 모서리 다듬기
            if g.is_empty or g.area < min_a:
                continue
            if t == "불법 형질변경":
                g = _shrink_total(g, mem, cs, c)
                if g.is_empty or g.area < min_a:
                    continue
            if t == "불법 형질변경" and all(x.get("fp") for x in mem) and g.area < float((c.get("fp") or {}).get("min_m2") or 300):
                continue                                  # 터 판정만으로 생긴 작은 조각은 버린다(큰 터만)
            pas = [x["pa"] for x in mem if x["pa"] is not None]
            new = None
            if two:
                new = "신규" if any(x.get("chg") for x in mem) or (pas and max(pas) < new_th) else ("이전부터" if pas else None)
            feats.append({"type": t, "geom": g, "score": round(max(x["p"] for x in mem), 3), "cells": len(mem), "new": new,
                          "score_a": round(max(pas), 3) if pas else None})
    feats.sort(key=lambda f: -f["score"])
    # 필지 대조 — 공공용지 층에서 가장 많이 겹친 것. LH 사업지구(경계뿐)는 연속지적도에서 그 자리 필지를 찾는다
    line = line5179 if line5179 is not None else rng5179
    linep = line if line.geom_type.endswith("Polygon") else line.buffer(1)
    sidx = pub.sindex if pub is not None and len(pub) else None
    rows = []
    for k, f in enumerate(feats):
        p = f["geom"]
        prow = None
        cand = list(sidx.query(p, predicate="intersects")) if sidx is not None else []
        pc_ = [j for j in cand if pub["land_kind"].iloc[j] != "LH 사업지구"] or cand
        if pc_:
            best = max(pc_, key=lambda j: pub.geometry.iloc[j].intersection(p).area)
            prow = pub.iloc[best]
        inter = p.intersection(linep).area if p.intersects(linep) else 0.0
        inside = inter >= 0.3 * p.area or linep.contains(p.representative_point())
        g = (lambda key: None if prow is None or prow.get(key) is None or (isinstance(prow.get(key), float) and np.isnan(prow.get(key))) else prow.get(key))
        rows.append({"id": f"c{k + 1:04d}", "type": f["type"], "area_m2": round(p.area, 1), "inside_row": "내" if inside else "외",
                     "pnu": g("PNU"), "jibun": g("jibun"), "jimok": g("jimok"), "owner": None, "use": g("use") if isinstance(g("use"), str) else None,
                     "sgg_cd": None, "pnus": [x for x in (pub["PNU"].iloc[j] for j in cand) if isinstance(x, str)][:20], "land": g("land"),
                     "land_kind": g("land_kind"), "addr": None, "score": f["score"], "score_a": f["score_a"],
                     "new": f["new"], "cells": f["cells"], "word": WORD, "hidden": False, "geom": p})
    # LH 사업지구 · 전국 범위(연속지적도를 읽지 않음) — 걸린 곳 시군구의 연속지적도에서 가장 많이 겹친 필지
    from . import parcels as PA
    for r in rows:
        if r.get("pnu"):
            continue
        hit = None
        if parcels is not None and len(parcels):
            ii = list(parcels.sindex.query(r["geom"], predicate="intersects"))
            if ii:
                hit = parcels.iloc[max(ii, key=lambda j: parcels.geometry.iloc[j].intersection(r["geom"]).area)]
        if hit is None:
            try:
                for cd in PA.sgg_codes_for(to4326(r["geom"])):
                    gg = PA._cad(cd)
                    if gg is None:
                        continue
                    ii = list(gg.sindex.query(r["geom"], predicate="intersects"))
                    if ii:
                        hit = gg.iloc[max(ii, key=lambda j: gg.geometry.iloc[j].intersection(r["geom"]).area)]
                        break
            except Exception as e:  # noqa: BLE001
                log("연속지적도 찾기 건너뜀", type(e).__name__)
        if hit is not None:
            r["pnu"], r["jibun"], r["jimok"] = hit.get("PNU"), hit.get("jibun"), hit.get("jimok")
    # 소유구분(브이월드 · 분류만) · 법정동 이름 → 개인 · 종중이면 대조 탈락(도로공사 장부 필지는 그대로)
    if progress:
        progress("owner", 0, 1)
    try:
        import importlib

        from . import owner as OW
        OW = importlib.reload(OW)
        got = OW.fill([r["pnu"] for r in rows if r.get("pnu")])
        for r in rows:
            if r.get("pnu") in got:
                r["owner"] = got[r["pnu"]]
            if r.get("pnu"):
                r["addr"] = OW.place(r["pnu"])
                r["sgg_cd"] = str(r["pnu"])[:5]
    except Exception as e:  # noqa: BLE001
        log("소유구분 조회 건너뜀", type(e).__name__)
    drop = set((c.get("public") or {}).get("drop_owner") or [])
    for r in rows:
        if r.get("land_kind") != "도로공사 장부" and str(r.get("owner") or "") in drop:
            r["hidden"] = True
            r["land"] = f"{r.get('land') or ''} · {r['owner']} 소유 — 대조 탈락".strip(" ·")
            r["word"] = None
    # 썸네일(앞 · 뒤 같은 자리 · 한 시점이면 같은 그림)
    from concurrent.futures import ThreadPoolExecutor
    import shutil

    def one(row):
        p = row["geom"]
        mnx, mny, mxx, mxy = p.bounds
        side = max(48.0, 2.2 * max(mxx - mnx, mxy - mny))
        cx, cy = (mnx + mxx) / 2, (mny + mxy) / 2
        for tag, sv in (("b", SB), ("a", SA)) if two else (("b", SB),):
            tz = (zb if tag == "b" else za) if sv.get("kind") != "imagery" else 18
            pad = I.NG.tile_span_m(tz)
            bb = (cx - side / 2 - pad, cy - side / 2 - pad, cx + side / 2 + pad, cy + side / 2 + pad)
            img, (ox, oy, res), _, _ = I.fetch_source(sv, bb, tz, workers=3)
            g = D.Grid(ox, oy, res, img.shape[0], img.shape[1])
            D.thumb(img, g, p).save(out / "thumbs" / f"{row['id']}_{tag}.png", optimize=True)
        if not two:
            shutil.copyfile(out / "thumbs" / f"{row['id']}_b.png", out / "thumbs" / f"{row['id']}_a.png")
    with ThreadPoolExecutor(max_workers=4) as ex:
        for k, _ in enumerate(ex.map(one, rows)):
            if progress and (k % 10 == 0 or k == len(rows) - 1):
                progress("thumbs", k + 1, len(rows))
    fc = {"type": "FeatureCollection", "features": []}
    for row in rows:
        g4 = to4326(row["geom"])
        props = {k: v for k, v in row.items() if k != "geom"}
        props["thumb_a"] = f"thumbs/{row['id']}_a.png"
        props["thumb_b"] = f"thumbs/{row['id']}_b.png"
        cpt = g4.representative_point()
        props["lng"], props["lat"] = round(cpt.x, 6), round(cpt.y, 6)
        fc["features"].append({"type": "Feature", "id": row["id"], "geometry": mapping(g4), "properties": props})
    (out / "changes.geojson").write_text(json.dumps(fc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    from .run import VERSION as RV, summarize
    vis = [r for r in rows if not r["hidden"]]
    stats = summarize(vis, T)
    stats.update({"n_all": len(rows), "version": f"{RV}+{VERSION}", "types": "publand", "mode": "publand", "two": two, "year_a": year_a, "year_b": year_b, "zoom": zoom,
                  "n_new": sum(1 for r in vis if r.get("new") == "신규") if two else None,
                  "by_land": {k: sum(1 for r in vis if r.get("land_kind") == k) for k in ("도로공사 장부", "도로", "철도", "LH 사업지구")},
                  "dropped": sum(1 for r in rows if r["hidden"]), "public_parcels": 0 if pub is None else int(len(pub)),
                  "public_m2": round(float(pub.geometry.area.sum()), 1) if pub is not None and len(pub) else 0.0, "cells": len(cs), "cells_seen": seen,
                  "parts": pn, "blocks": len(keys), "resumed_blocks": len(skip),
                  "sources": {k: {x: v[x] for x in ("kind", "year", "id") if x in v} for k, v in (("a", SA), ("b", SB))},
                  "gsd_m": 0.255 if zoom == 18 else 0.51, "range_km2": round(rng5179.area / 1e6, 3), "tiles": tiles, "word": WORD,
                  "seconds": round(time.perf_counter() - t0, 1)})
    (out / "stats.json").write_text(json.dumps(stats, ensure_ascii=False, indent=1), encoding="utf-8")
    return stats
