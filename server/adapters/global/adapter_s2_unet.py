"""해외 AI 분석(kind 'infer' · 모델 adapter 's2_unet') — Sentinel-2 달별 합성(42 띠) 창 → 작은 U-Net → 경작지 · 시가지 · 물 면.

영상 = 해외 작업기(overseas.runner)가 칸(군)마다 만든 합성 GeoTIFF(imagery.kind 's2-monthly') — 창은 작업 options.overseas.stack 에서 읽는다
(gpu_worker 의 기본 창 읽기는 RGB 세 띠만이라). 결과 = 분류마다 이어진 화소 덩어리를 면으로(10 화소 = 0.1 ha 미만은 버림 · 5 m 단순화),
칩 안 '내 몫'(core)만 · 칸(군) 경계 안(대표점)만. 국내 · 기관 모델과 입력이 달라('s2-monthly') 국내 분석에는 고르지 않는다.
"""
from __future__ import annotations

import json
import time
from collections import OrderedDict

from adapters.base import Detection, ShardResult

ADAPTER = {"id": "s2_unet", "kinds": ["infer"], "device": "gpu", "input": "s2-monthly", "output": "polygons", "models": []}
MIN_PX = 10
SIMPLIFY_M = 5.0
_clip_cache: "OrderedDict[str, object]" = OrderedDict()


def _clip(ov: dict):
    """칸(군) 경계(4326 · 준비된 도형) — 작업 options.overseas.clip_wkt."""
    key = f"{ov.get('country')}/{ov.get('cell')}"
    if key in _clip_cache:
        return _clip_cache[key]
    g = None
    try:
        if ov.get("clip_wkt"):
            from shapely import wkt
            from shapely.prepared import prep
            g = prep(wkt.loads(ov["clip_wkt"]))
    except Exception:  # noqa: BLE001
        g = None
    _clip_cache[key] = g
    while len(_clip_cache) > 16:
        _clip_cache.popitem(last=False)
    return g


class Adapter:
    def __init__(self):
        self.net = None

    def load(self, model, device, vram_budget_mib):
        import importlib
        import overseas
        if not hasattr(overseas, "fresh"):
            importlib.reload(overseas)
        fresh = overseas.fresh
        load = fresh("overseas.unet").load
        self.device = device or "cuda:0"
        self.net, self.mu, self.sd, self.cfg = load(model["weights_uri"], self.device)
        self.names = self.cfg["names"]
        self.names_en = self.cfg.get("names_en") or self.names
        self.targets = self.cfg.get("targets") or [2, 3, 4]

    def unload(self):
        self.net = None
        try:
            import torch
            torch.cuda.empty_cache()
        except Exception:  # noqa: BLE001
            pass

    def run_batch(self, shards, read, opts):
        return [self.run_shard(s, read, opts) for s in shards]

    def run_shard(self, shard, read, opts):
        import numpy as np
        import torch
        from pyproj import Transformer
        from rasterio.features import shapes
        from rasterio.windows import Window
        from shapely.geometry import shape as sh_shape
        from shapely.ops import transform as sh_tr
        import importlib
        import overseas
        if not hasattr(overseas, "fresh"):
            importlib.reload(overseas)
        fresh = overseas.fresh
        s2 = fresh("overseas.s2")
        t0 = time.perf_counter()
        ov = (opts or {}).get("overseas") or {}
        w = shard.window or {}
        import rasterio
        win = Window(w["col_off"], w["row_off"], w["width"], w["height"])
        with rasterio.open(ov["stack"]) as ds:              # 칩마다 열고 닫는다(칸이 끝나면 중간 파일을 바로 지울 수 있게)
            raw = ds.read(window=win, boundless=True, fill_value=0)
            tr = ds.window_transform(win)
            epsg = ds.crs.to_epsg()
        if not raw.any():
            return ShardResult(features=[], metrics={"px": {}}, n=0, ms=int((time.perf_counter() - t0) * 1000))
        x = s2.features(raw, len(self.cfg.get("months") or s2.MONTHS))
        h, wd = x.shape[1:]
        ph, pw = (-h) % 4, (-wd) % 4
        if ph or pw:
            x = np.pad(x, ((0, 0), (0, ph), (0, pw)), mode="reflect")
        with torch.no_grad():
            t = (torch.from_numpy(x[None]).to(self.device) - self.mu) / self.sd
            prob = torch.softmax(self.net(t), 1)[0, :, :h, :wd]
            conf, pred = prob.max(0)
        pred = pred.cpu().numpy().astype(np.uint8)
        conf = conf.cpu().numpy()
        nodata = ~(raw.reshape(-1, 6, h, wd)[:, 3] > 0).any(0)          # 어느 달에도 맑은 화소 없음 — 판정하지 않음
        pred[nodata] = 255
        core = w.get("core") or [0, 0, wd, h]
        k = float(w.get("chip") or wd) / float(w.get("width") or wd)
        cx0, cy0, cx1, cy1 = [int(round(v / k)) for v in core]
        keep = np.zeros_like(pred, dtype=bool)
        keep[cy0:cy1, cx0:cx1] = True
        to4326 = Transformer.from_crs(epsg, 4326, always_xy=True).transform
        clip = _clip(ov)
        feats = []
        px = {}
        for c in self.targets:
            m = (pred == c) & keep
            n = int(m.sum())
            if not n:
                continue
            px[self.names_en[c]] = n
            cf = round(float(conf[m].mean()), 3)
            for geom, v in shapes(m.astype(np.uint8), mask=m, transform=tr, connectivity=4):
                g = sh_shape(geom)
                if g.area < MIN_PX * 100:
                    continue
                g = g.simplify(SIMPLIFY_M, preserve_topology=True)
                if not g.is_valid:
                    g = g.buffer(0)
                if g.is_empty:
                    continue
                g4 = sh_tr(to4326, g)
                if clip is not None and not clip.contains(g4.representative_point()):
                    continue
                cls = "물" if c == 4 else self.names[c]
                feats.append(Detection(geom4326=g4, cls=cls, cls_en=self.names_en[c], cid=int(c),
                                       conf=cf, attrs={}))
        return ShardResult(features=feats, metrics={"px": px}, n=len(feats), ms=int((time.perf_counter() - t0) * 1000))
