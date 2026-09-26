"""YOLO OBB 어댑터 — B05 car_v2_obb(yolo11x-obb · mAP50 .992) · car_v1/infer_orthomosaic.ipynb 방식(1024 칩 · 겹침 · 칩 내 NMS · 전역 NMS).

칩 내 NMS 는 ultralytics predict(iou 0.5)가 한다. 이웃 칩과 겹치는 폭의 절반(core 밖)에 중심이 있는 박스는 이웃에게 맡긴다(P4 규칙).
"""
from __future__ import annotations

import time

import numpy as np
from shapely.geometry import Polygon

from adapters.base import Detection, Shard, ShardResult, in_core, prep_chip, px_to_4326

ADAPTER = {"id": "yolo_obb", "kinds": ["infer", "reinfer"], "device": "gpu", "input": "raster-window", "output": "polygons",
           "models": ["car_v2_obb"]}
KO = {"vehicle": "차량", "car": "차량"}


class Adapter:
    def __init__(self):
        self.model = None
        self.names = {}
        self.batch = 16
        self.device = "cuda:0"

    def load(self, model: dict, device: str, vram_budget_mib: int) -> None:
        from ultralytics import YOLO
        if vram_budget_mib < 3000:
            raise RuntimeError("vram_budget")
        self.device = device
        self.model = YOLO(model["weights_uri"], task="obb")
        self.names = self.model.names
        self.imgsz = int(model.get("tile_size") or 1024)
        # 예산 안에서 배치: x-obb 1024 fp16 ≈ 배치당 0.35 GB [bench 로 확인] — 여유 있게
        self.batch = 16 if vram_budget_mib >= 12000 else 8
        dummy = [np.zeros((self.imgsz, self.imgsz, 3), np.uint8)] * 2
        self.model.predict(dummy, imgsz=self.imgsz, device=self.device, half=True, verbose=False)

    def unload(self) -> None:
        self.model = None

    def run_batch(self, shards: list[Shard], read, opts: dict) -> list[ShardResult]:
        conf = float(opts.get("conf", 0.25))
        imgs, meta = [], []
        for s in shards:
            arr, affine, crs = read(s)
            chip = int((s.window or {}).get("chip", self.imgsz))
            if arr is None:
                imgs.append(None)
                meta.append(None)
                continue
            bgr, k = prep_chip(arr, chip)
            imgs.append(bgr)
            meta.append((k, affine, crs, chip))
        live = [i for i, im in enumerate(imgs) if im is not None]
        out: list[ShardResult | None] = [None] * len(shards)
        t0 = time.perf_counter()
        preds = []
        for b in range(0, len(live), self.batch):
            idx = live[b:b + self.batch]
            preds += self.model.predict([imgs[i] for i in idx], imgsz=meta[idx[0]][3], conf=conf, iou=0.5, device=self.device,
                                        half=True, verbose=False)
        dt_ms = (time.perf_counter() - t0) * 1000
        per = int(dt_ms / max(1, len(live)))
        for i, s in enumerate(shards):
            if imgs[i] is None:
                out[i] = ShardResult([], {"empty": True}, 0, 0)
        for i, r in zip(live, preds):
            s = shards[i]
            k, affine, crs, chip = meta[i]
            core = (s.window or {}).get("core")
            feats = []
            ob = r.obb
            if ob is not None and len(ob):
                corners = ob.xyxyxyxy.cpu().numpy()     # (N,4,2) 모델 px
                cf = ob.conf.cpu().numpy()
                cl = ob.cls.cpu().numpy().astype(int)
                for j in range(len(cf)):
                    c4 = corners[j]
                    cx, cy = c4[:, 0].mean(), c4[:, 1].mean()
                    if not in_core(cx, cy, core):
                        continue
                    edge = bool((c4 <= 1).any() or (c4 >= chip - 1).any())
                    ll = px_to_4326(c4, k, affine, crs)
                    g = Polygon(ll)
                    if not g.is_valid or g.area == 0:
                        continue
                    en = self.names.get(int(cl[j]), "vehicle")
                    feats.append(Detection(g, KO.get(en, en), en, int(cl[j]), round(float(cf[j]), 3), {"chip_edge": edge}))
            out[i] = ShardResult(feats, {"model_ms": per}, len(feats), per)
        return out

    def run_shard(self, shard: Shard, read, opts: dict) -> ShardResult:
        return self.run_batch([shard], read, opts)[0]
