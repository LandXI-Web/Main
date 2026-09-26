"""워커 · 어댑터 인터페이스(F1-CONTRACT §7) — F1-B 프레임 · F1-D 글로벌 어댑터가 같은 모양을 쓴다.

어댑터 모듈은 상단에 ADAPTER 상수를 두고 Adapter 프로토콜을 구현한 클래스를 `Adapter` 이름(또는 make_adapter())으로 낸다.
워커는 server/adapters/**/adapter_*.py 를 스캔해 등록한다(global/ 포함 — F1-D 소유 폴더도 자동).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Protocol

import numpy as np


@dataclass
class Shard:
    id: str
    job_id: str
    bbox4326: tuple[float, float, float, float]
    window: dict | None
    params: dict | None


@dataclass
class Detection:
    geom4326: object          # shapely.Geometry
    cls: str
    cls_en: str
    cid: int
    conf: float
    attrs: dict = field(default_factory=dict)


@dataclass
class ShardResult:
    features: list[Detection]
    metrics: dict
    n: int
    ms: int


# 예: ADAPTER = {"id": "yolo_obb", "kinds": ["infer","reinfer"], "device": "gpu", "input": "raster-window", "output": "polygons", "models": ["car_v2_obb"]}


class Adapter(Protocol):
    def load(self, model: dict, device: str, vram_budget_mib: int) -> None: ...
    def run_shard(self, shard: Shard, read: Callable[[Shard], tuple[np.ndarray, object, object]], opts: dict) -> ShardResult: ...
    def unload(self) -> None: ...


def run_batch_default(adapter, shards: list[Shard], read, opts: dict) -> list[ShardResult]:
    """run_batch 가 없는 어댑터(F1-D 등)는 shard 하나씩."""
    return [adapter.run_shard(s, read, opts) for s in shards]


# ── YOLO 계열 공용(래스터 창 → 모델 입력 → 좌표 되돌리기) ───────────────────
_tf_cache: dict = {}


def to4326(crs_epsg: int):
    t = _tf_cache.get(crs_epsg)
    if t is None:
        from pyproj import Transformer
        t = _tf_cache[crs_epsg] = Transformer.from_crs(crs_epsg, 4326, always_xy=True)
    return t


def prep_chip(img_rgb: np.ndarray, chip: int) -> tuple[np.ndarray, float]:
    """RGB HWC(원본 창) → BGR chip×chip(업샘플 포함) · k = chip / 원본 px."""
    import cv2
    h, w = img_rgb.shape[:2]
    if h != chip or w != chip:
        interp = cv2.INTER_CUBIC if chip > max(h, w) else cv2.INTER_AREA
        img_rgb = cv2.resize(img_rgb, (chip, chip), interpolation=interp)
    k = chip / max(h, w)
    return np.ascontiguousarray(img_rgb[:, :, ::-1]), k


def px_to_4326(xy_model: np.ndarray, k: float, affine, crs_epsg: int) -> np.ndarray:
    """모델 px (N,2) → 원본 창 px → 원 CRS → 4326."""
    col = xy_model[:, 0] / k
    row = xy_model[:, 1] / k
    x = affine.c + col * affine.a + row * affine.b
    y = affine.f + col * affine.d + row * affine.e
    lon, lat = to4326(crs_epsg).transform(x, y)
    return np.stack([lon, lat], 1)


def in_core(cx: float, cy: float, core) -> bool:
    if not core:
        return True
    return core[0] <= cx < core[2] and core[1] <= cy < core[3]
