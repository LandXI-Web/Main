"""데이터-1(10-07) — 원판 모델 되돌림의 서버 몫: 서비스가 찾는 분류만 결과로 남긴다(GPU 워커 keep_classes) · 검증만 학습 작업(eval).
오프라인 시험(게이트웨이 · GPU 없이)."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest  # noqa: E402
from shapely.geometry import box  # noqa: E402

from adapters.base import Detection, ShardResult  # noqa: E402


@pytest.fixture(scope="module")
def keep_classes():
    argv = sys.argv
    sys.argv = ["gpu_worker.py", "--gpu", "0"]          # 워커 모듈은 불러올 때 인자를 읽는다(test_power_gate 와 같은 방식)
    try:
        import importlib
        m = importlib.import_module("workers.gpu_worker")
    finally:
        sys.argv = argv
    return m.keep_classes


def _res(*names):
    feats = [Detection(box(0, 0, 1, 1), ko, en, i, 0.9) for i, (ko, en) in enumerate(names)]
    return ShardResult(feats, {"model_ms": 1}, len(feats), 1)


def test_keep_classes_filters_to_card_classes(keep_classes):
    r = _res(("건물", "building"), ("주차장", "parking"), ("경작지", "farmland"), ("비닐하우스", "greenhouse"))
    out = keep_classes(["비닐하우스"], [r])
    assert [d.cls for d in out[0].features] == ["비닐하우스"] and out[0].n == 1


def test_keep_classes_prefix_and_english(keep_classes):
    r = _res(("비닐하우스_단동", "greenhouse_single"), ("비닐하우스_다동", "greenhouse_multi"), ("건물", "building"))
    assert out_cls(keep_classes(["비닐하우스"], [r])) == ["비닐하우스_단동", "비닐하우스_다동"]
    assert out_cls(keep_classes(["parking", "building"], [r])) == ["건물"]


def test_keep_classes_empty_keeps_all(keep_classes):
    r = _res(("건물", "building"), ("주차장", "parking"))
    assert keep_classes(None, [r])[0] is r and keep_classes([], [r])[0] is r


def test_train_adapter_eval_plan_and_finalize(tmp_path, monkeypatch):
    """검증만 작업은 계획에 eval 을 싣고, 끝나면 결과 파일만 남긴다(모델 행 없음)."""
    from workers.registry_scan import adapter_module
    mod = adapter_module("train/yolo")
    plan = mod.plan({"options": {"base_model": "aerial25/best", "samples": "x.yaml", "eval": True, "imgsz": 1280}})
    assert plan[0]["eval"] is True and plan[0]["imgsz"] == 1280
    assert "eval" not in mod.plan({"options": {"base_model": "aerial25/best", "samples": "x.yaml"}})[0]

    class Cfg:
        DATA_ROOT = tmp_path
    monkeypatch.setattr(mod, "_cfg", lambda: Cfg)
    out = mod.finalize({"id": "job_t", "options": {"eval": True, "base_model": "aerial25/best", "samples": "x.yaml"}},
                       {"eval": {"classes": {"건물": {"mask": {"map50": 0.9}}}}})
    assert out["counts"] == {"eval": 1}
    assert (tmp_path / "models" / "eval" / "job_t.json").exists()


def out_cls(results):
    return [d.cls for d in results[0].features]
