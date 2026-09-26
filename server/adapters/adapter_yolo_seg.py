"""YOLO 분할 어댑터 — P4 p4_infer.py 방식(1024 칩 · overlap 128 · batch 16 fp16 · 박스 중심 core 규칙 · retina_masks False).

클래스명은 가중치에서 읽는다(model.names). upsample(옵션): 원본 창 chip/u px 을 u 배로 키워 모델에 넣는다 —
드론 cm 학습 모델(Vinyl_house 등)을 25cm 항공에 옮길 때의 도메인 이식 실험(J2b). 결과는 '도메인 이식 · 검수 전'.
"""
from __future__ import annotations

import time

import numpy as np
from shapely.geometry import Polygon

from adapters.base import Detection, Shard, ShardResult, in_core, prep_chip, px_to_4326

ADAPTER = {"id": "yolo_seg", "kinds": ["infer", "reinfer"], "device": "gpu", "input": "raster-window", "output": "polygons",
           "models": ["aerial25/best", "namwon/Vinyl_house/train", "namwon/Vinyl_house/train2", "namwon/cultivate_uncultivate/train",
                      "namwon/Silage/train", "namwon/growth_baseline/train", "namwon/growth_baseline/train2",
                      "namwon/growth_baseline/train22", "namwon/production_baseline/train"]}
EN = {"건물": "building", "주차장": "parking", "경작지": "farmland", "비닐하우스": "greenhouse", "비닐하우스_단동": "greenhouse_single",
      "비닐하우스_다동": "greenhouse_multi", "비경작지": "non_farmland", "곤포사일리지": "silage_bale"}


class Adapter:
    def __init__(self):
        self.model = None
        self.names = {}
        self.batch = 16
        self.imgsz = 1024
        self.device = "cuda:0"

    def load(self, model: dict, device: str, vram_budget_mib: int) -> None:
        from ultralytics import YOLO
        if vram_budget_mib < 4000:
            raise RuntimeError("vram_budget")
        self.device = device
        self.model = YOLO(model["weights_uri"], task="segment")
        self.names = self.model.names
        self.imgsz = int(model.get("tile_size") or 1024)
        self.batch = 16 if vram_budget_mib >= 14000 else 8
        dummy = [np.zeros((1024, 1024, 3), np.uint8)] * 2
        self.model.predict(dummy, imgsz=self.imgsz, device=self.device, half=True, verbose=False, retina_masks=False)

    def unload(self) -> None:
        self.model = None

    def run_batch(self, shards: list[Shard], read, opts: dict) -> list[ShardResult]:
        conf = float(opts.get("conf", 0.25))
        imgsz = int(opts.get("imgsz", self.imgsz))
        imgs, meta = [], []
        for s in shards:
            arr, affine, crs = read(s)
            chip = int((s.window or {}).get("chip", 1024))
            if arr is None:
                imgs.append(None)
                meta.append(None)
                continue
            bgr, k = prep_chip(arr, chip)
            imgs.append(bgr)
            meta.append((k, affine, crs, chip))
        live = [i for i, im in enumerate(imgs) if im is not None]
        out: list[ShardResult | None] = [None] * len(shards)
        for i in range(len(shards)):
            if imgs[i] is None:
                out[i] = ShardResult([], {"empty": True}, 0, 0)
        t0 = time.perf_counter()
        preds = []
        for b in range(0, len(live), self.batch):
            idx = live[b:b + self.batch]
            preds += self.model.predict([imgs[i] for i in idx], imgsz=imgsz, conf=conf, device=self.device, half=True, verbose=False,
                                        retina_masks=False)
        per = int((time.perf_counter() - t0) * 1000 / max(1, len(live)))
        for i, r in zip(live, preds):
            s = shards[i]
            k, affine, crs, chip = meta[i]
            core = (s.window or {}).get("core")
            feats = []
            if r.masks is not None and r.boxes is not None and len(r.boxes):
                bx = r.boxes.xyxy.cpu().numpy()
                cl = r.boxes.cls.cpu().numpy().astype(int)
                cf = r.boxes.conf.cpu().numpy()
                for j, poly in enumerate(r.masks.xy):
                    if len(poly) < 3:
                        continue
                    cx, cy = (bx[j, 0] + bx[j, 2]) / 2, (bx[j, 1] + bx[j, 3]) / 2
                    if not in_core(cx, cy, core):
                        continue
                    edge = bool(bx[j, 0] <= 1 or bx[j, 1] <= 1 or bx[j, 2] >= chip - 1 or bx[j, 3] >= chip - 1)
                    g = Polygon(px_to_4326(np.asarray(poly, dtype=np.float64), k, affine, crs))
                    if not g.is_valid:
                        g = g.buffer(0)
                    if g.is_empty:
                        continue
                    ko = self.names.get(int(cl[j]), str(cl[j]))
                    feats.append(Detection(g, ko, EN.get(ko, ko), int(cl[j]), round(float(cf[j]), 3), {"chip_edge": edge}))
            out[i] = ShardResult(feats, {"model_ms": per}, len(feats), per)
        return out

    def run_shard(self, shard: Shard, read, opts: dict) -> ShardResult:
        return self.run_batch([shard], read, opts)[0]
