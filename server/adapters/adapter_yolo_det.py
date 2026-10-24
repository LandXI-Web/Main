"""YOLO 탐지(가로세로 상자) 어댑터 — 사람 탐지(people_yolo11l · 춘향제 드론 정사 1.8cm · 640 칸) 등 '한 개씩 세는' 모델.

차량 어댑터(adapter_yolo_obb)와 같은 틀: 칸 안 NMS 는 ultralytics predict(iou 0.5) · 이웃 칸과 겹치는 폭의 절반(core 밖)에 중심이 있는 상자는 이웃에게 맡긴다.
결과는 상자(작은 사각형 · 위치 · 점수)만 낸다 — 영상 조각(사람 그림)은 저장하지 않는다(원칙 331 · 사람이 보이는 영상).
지도에는 상자 가운데 점과 10 m 격자(㎡당 사람 수)로 그린다(cpu_worker 마무리 · task 'det').
"""
from __future__ import annotations

import time

import numpy as np
from shapely.geometry import Polygon

from adapters.base import Detection, Shard, ShardResult, in_core, prep_chip, px_to_4326

ADAPTER = {"id": "yolo_det", "kinds": ["infer", "reinfer"], "device": "gpu", "input": "raster-window", "output": "polygons",
           "models": ["people/yolo11l-2025-08-25"]}
KO = {"people": "사람", "person": "사람", "pedastrian": "사람", "pedestrian": "사람"}


class Adapter:
    def __init__(self):
        self.model = None
        self.names = {}
        self.batch = 16
        self.device = "cuda:0"
        self.imgsz = 640

    def load(self, model: dict, device: str, vram_budget_mib: int) -> None:
        from ultralytics import YOLO
        if vram_budget_mib < 3000:
            raise RuntimeError("vram_budget")
        self.device = device
        self.model = YOLO(model["weights_uri"], task="detect")
        self.names = self.model.names
        self.imgsz = int(model.get("tile_size") or 640)
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
                                        half=True, verbose=False, max_det=1000)
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
            bx = r.boxes
            if bx is not None and len(bx):
                xyxy = bx.xyxy.cpu().numpy()          # (N,4) 모델 px
                cf = bx.conf.cpu().numpy()
                cl = bx.cls.cpu().numpy().astype(int)
                for j in range(len(cf)):
                    x0, y0, x1, y1 = xyxy[j]
                    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
                    if not in_core(cx, cy, core):
                        continue
                    edge = bool(x0 <= 1 or y0 <= 1 or x1 >= chip - 1 or y1 >= chip - 1)
                    c4 = np.array([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], dtype=float)
                    g = Polygon(px_to_4326(c4, k, affine, crs))
                    if not g.is_valid or g.area == 0:
                        continue
                    en = str(self.names.get(int(cl[j]), "people"))
                    feats.append(Detection(g, KO.get(en.lower(), en), en, int(cl[j]), round(float(cf[j]), 3), {"chip_edge": edge}))
            out[i] = ShardResult(feats, {"model_ms": per}, len(feats), per)
        return out

    def run_shard(self, shard: Shard, read, opts: dict) -> ShardResult:
        return self.run_batch([shard], read, opts)[0]
