"""국토 변화 분석서비스(변화 탐지) — kind 'index' · 모델 change-ap25(토지피복 U-Net ap25) · GPU 워커 한 장 · 작업 대기열로만.

작업 options.change = {range_id, year_a, year_b, zoom, run_id} — 범위(EPSG:5179 면)는 DB change_ranges 에서 읽는다.
칸 하나('change') = 범위 전체(블록 16×16 타일씩 받아 추론 · 끝에 유형별로 이어 붙임 · server/change/run.py).
- 영상은 이 어댑터가 국토지리정보원 영상 API 에서 스스로 받는다(디스크 캐시) — gpu_worker 의 창 읽기 없음(options.change).
- 전력: 1024 칸마다 workers.power_throttle(30초 평균 ≤ 설정 상한 160 W · ≤ 70 % · 목표 약 145 W · 62 % — config/pools.yaml) · XI ChatGEO 그림 질문이 오면 비킴.
- 고아 감시 · 전력 임대: 진행할 때마다 비행 기록 · power:hot 임대를 연장(긴 칸이 재배정되지 않게).
결과 = Detection(유형 · 4326) — 표준 마무리(fgb · pmtiles · detections)도 그대로 + 속성 · 썸네일은 DATA/change/runs/{작업}/.
"""
from __future__ import annotations

import json
import os
import sys
import time

from adapters.base import Detection, ShardResult

ADAPTER = {"id": "change/unet", "kinds": ["index"], "device": "gpu", "input": "params", "output": "polygons", "models": ["change-ap25"]}
CID = {"신축": 1, "소실": 2, "경작 전환": 3, "포장 확대": 4, "식생 증감": 5}
EN = {"신축": "new_building", "소실": "lost_building", "경작 전환": "to_farmland", "포장 확대": "to_paved", "식생 증감": "vegetation"}


def plan(job: dict) -> list[dict]:
    o = (job.get("options") or {}).get("change") or {}
    aoi = job.get("aoi")
    if isinstance(aoi, str) and aoi:
        aoi = json.loads(aoi)
    bbox = list(o.get("bbox4326") or [0, 0, 0, 0])
    if aoi and not o.get("bbox4326"):
        from shapely.geometry import shape
        bbox = list(shape(aoi).bounds)
    return [{"shard_id": "change", "bbox": bbox, "window": None, "params": dict(o)}]


def _main_attr(name):
    m = sys.modules.get("__main__")
    return getattr(m, name, None) if m else None


class Adapter:
    def __init__(self):
        self.net = None
        self.thr = None

    def load(self, model, device, vram_budget_mib):
        server = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        if server not in sys.path:
            sys.path.insert(0, server)
        from change import roadland_src
        roadland_src()
        import landcover_unet as LC
        self.device = device or "cuda:0"
        self.net = LC.load_model(model["weights_uri"], device=self.device)
        try:
            from workers.power_throttle import PowerThrottle, nvml_window
            phys = int((os.environ.get("CUDA_VISIBLE_DEVICES") or "0").split(",")[0] or 0)
            self.thr = PowerThrottle(nvml_window(phys), duty0=0.5)        # 상한 · 목표는 config/pools.yaml 한 곳(power_throttle.limits)
        except Exception:  # noqa: BLE001
            self.thr = None

    def unload(self):
        self.net = None
        try:
            import torch
            torch.cuda.empty_cache()
        except Exception:  # noqa: BLE001
            pass

    def _touch(self, job_id, shard_id):
        try:
            from workers import bus
            bus.inflight_touch("a6000", job_id, shard_id)
            lease = _main_attr("lease")
            rr = _main_attr("r")
            if lease and lease.get("slot") is not None and rr:
                rr().expire(f"power:hot:{lease['slot']}", 20)
            a = _main_attr("A")
            if rr and a is not None:                      # 두 장 모드 — 이 장의 열은 우리 사용자 분석 몫(XI ChatGEO 가 이 장을 기다리지 않게 · 결정11)
                from workers import pair_guard
                if pair_guard.two_on():
                    pair_guard.mark_busy(rr(), int(a.gpu), job_id)
        except Exception:  # noqa: BLE001
            pass

    def run_shard(self, shard, read, opts):
        import importlib

        from change import db_sync, detect as _D, imagery as _I, run as R, worker_hooks as _H
        importlib.reload(_I)
        db_sync = importlib.reload(db_sync)
        importlib.reload(_D)                              # 계산 방식(change/detect · run)을 고치면 워커를 다시 켜지 않아도 다음 작업부터 반영
        R = importlib.reload(R)
        H = importlib.reload(_H)                          # 진행 · 멈춤 · 숨(worker_hooks)도 작업마다 다시 읽는다
        p = shard.params or {}
        job_id = shard.job_id
        t0 = time.perf_counter()
        try:
            ctl = None
            ctl = H.Control(job_id, shard.id, thr=self.thr, touch=lambda: self._touch(job_id, shard.id),
                            emit=_main_attr("emit"), llm_wanted=_main_attr("llm_wanted"), attempt=int((opts or {}).get("_attempt") or 0))
            rng, line, sgg = db_sync.range_geoms(p["range_id"])
            from change import parcels as P
            par = P.for_range(rng, sgg)
            ctl.check()
            from change import imagery as I
            av = I.available_years(rng.bounds)
            stats = R.compute(run_id=job_id, rng5179=rng, line5179=line, year_a=int(p["year_a"]), year_b=int(p["year_b"]),
                              zoom=int(p["zoom"]), net=self.net, parcels=par, device=self.device, pause=ctl.pause, progress=ctl.progress,
                              thumb_zoom=av)
        except H.JobStopped:
            # 취소됨 · 시간초과 — 결과 없이 칸을 끝낸다(워커가 다시 넣지 않게 · GPU 를 바로 놓음)
            return ShardResult(features=[], metrics={"change": {"stopped": True}, "basis": "inferred", "source": "change/unet"}, n=0,
                               ms=int((time.perf_counter() - t0) * 1000))
        except Exception as e:  # noqa: BLE001
            if ctl is not None:
                ctl.failed(e)
            raise
        feats = []
        fc = json.loads((R.run_dir(job_id) / "changes.geojson").read_text(encoding="utf-8"))
        from shapely.geometry import shape
        for f in fc["features"]:
            t = f["properties"]["type"]
            feats.append(Detection(geom4326=shape(f["geometry"]), cls=t, cls_en=EN.get(t, "change"), cid=CID.get(t, 0), conf=1.0,
                                   attrs={"change_id": f["id"]}))
        ms = int((time.perf_counter() - t0) * 1000)
        ctl.set(chg_stage="done", chg_frac=1.0)
        db_sync.run_done(job_id, stats)
        return ShardResult(features=feats, metrics={"change": stats, "basis": "inferred", "source": "change/unet"}, n=len(feats), ms=ms)


def make_adapter():
    return Adapter()
