"""구현 38 · 해외-1단계(10-15 해외-학습데이터 "이대로 시작" · 원칙 256 · 260)

① 해외 결과 장부(overseas_cells · overseas_jobs · overseas_faces) = 국내 전국 장부와 같은 모양 · 국내 장부에 섞이지 않음
② 위성(5 m 이상) 범위 천장은 화소 수 기준(10 m = 3,000㎢) · 항공 · 드론 천장은 그대로(150㎢)
③ 해외 학습(train/s2unet)은 대기열로만 · LX 직원 · 관리자만 · 판 파일은 02. 데이터/overseas 아래만
④ 해외 모델(입력 's2-monthly')은 국내 · 기관 모델 고르기에 나오지 않는다(test_agency_models_unchanged 와 함께)
⑤ 달별 합성 입력 규칙 — 맑은 화소가 없는 달은 가까운 달로 채움 · 후처리는 해외 칸 이름을 그대로(시군구 찾기 없음)
실행: python -m pytest server/tests/test_impl38_overseas.py -q   (게이트웨이 :8700 · GPU 0)
"""
import asyncio
import sys
from pathlib import Path

import httpx
import numpy as np
import psycopg

from conftest import B, H

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from national.common import env_file  # noqa: E402


def db():
    return psycopg.connect(env_file()["PG_ADMIN_DSN"], autocommit=True)


def test_overseas_ledger_tables():
    with db() as c:
        for t in ("overseas_cells", "overseas_jobs", "overseas_faces"):
            assert c.execute("SELECT to_regclass(%s)", (t,)).fetchone()[0] == t
        cols = {r[0] for r in c.execute("SELECT column_name FROM information_schema.columns WHERE table_name='overseas_cells'")}
        assert {"country", "year", "cell_cd", "state", "counts", "model_id", "geom", "geom_s"} <= cols
        assert c.execute("SELECT value FROM lx_settings WHERE key='overseas.run'").fetchone()
        # 국내 장부에는 해외 칸이 없다(숫자 한 출처 — 국내 XI맵 · 관리자 숫자 그대로)
        assert c.execute("SELECT count(*) FROM national_cells WHERE asset NOT IN ('farm','river')").fetchone()[0] == 0


def test_infer_ceiling():
    from landxi_api.jobs import INFER_MAX_KM2, infer_ceiling_km2
    assert infer_ceiling_km2({"gsd_m": 0.25}) == INFER_MAX_KM2
    assert infer_ceiling_km2({"gsd_m": 0.51}) == INFER_MAX_KM2
    assert infer_ceiling_km2({"gsd_m": 1.0}) == INFER_MAX_KM2
    assert infer_ceiling_km2({"gsd_m": 10}) == 3000.0
    assert infer_ceiling_km2(None) == INFER_MAX_KM2


def test_train_s2_guard(tok):
    body = {"kind": "train", "options": {"trainer": "train/s2unet", "dataset": "../server/.env"}}
    r = httpx.post(B + "/jobs/quote", json=body, headers=H(tok["staff"]), timeout=60)
    assert r.status_code == 404                                   # 02. 데이터/overseas 밖 · 없는 판 파일
    r = httpx.post(B + "/jobs/quote", json={**body, "options": {**body["options"], "dataset": "overseas/kgz/train/dataset-v1.npz"}},
                   headers=H(tok["namwon"]), timeout=60)
    assert r.status_code in (401, 403)                            # 기관 계정은 학습 못 함
    r = httpx.post(B + "/jobs/quote", json={**body, "options": {**body["options"], "dataset": "overseas/kgz/train/dataset-v1.npz"}},
                   headers=H(tok["staff"]), timeout=60)
    if r.status_code == 200:                                      # 판 파일이 있으면 견적 = 학습 한 칸 · 대기열(GPU 풀)
        q = r.json()
        assert q["shards"] == 1 and q["pool"] != "cpu"


def test_overseas_models_not_picked_for_agency():
    from landxi_api import config
    from landxi_api.jobs import _pick_model

    async def run():
        import asyncpg
        c = await asyncpg.connect(config.PG_ADMIN_DSN)
        try:
            m = await _pick_model(c, "ortho", 0.25)
            ov = await c.fetch("SELECT id FROM models WHERE adapter='s2_unet'")
            return (m["id"] if m else None), [r["id"] for r in ov]
        finally:
            await c.close()
    picked, ov = asyncio.run(run())
    assert picked not in ov


def test_features_fill_and_postprocess_place():
    from shapely.geometry import box
    from overseas import s2
    from workers import postprocess
    x = np.zeros((42, 4, 4), np.uint16)
    x[18:24] = 1500                                               # 7월만 맑음
    x[21] = 3000                                                  # 근적외
    f = s2.features(x)
    assert f.shape == (49, 4, 4)
    assert np.allclose(f[6::7], f[6::7][3])                       # 다른 달은 7월 값으로 채움(초록 정도 같음)
    feats = [{"geom": box(74.30, 42.80, 74.301, 42.801), "props": {"cls": "경작지", "cls_en": "cropland", "cid": 2, "conf": 0.9, "id": "a"}}]
    out, st = postprocess.run(feats, task="seg", min_area=800, place=("Sokuluk", "92254566B0000"))
    assert out and out[0]["props"]["emd"] == "Sokuluk" and out[0]["props"]["emd_cd"] == "92254566B0000"


def test_runner_parts_under_ceiling():
    from pyproj import Geod
    from shapely.geometry import box
    from overseas.runner import parts_of
    g = box(74.0, 40.3, 77.9, 41.4)                               # 큰 군(약 3만㎢ 둘레)
    ps = parts_of(g)
    geod = Geod(ellps="WGS84")
    assert len(ps) > 1 and all(abs(geod.geometry_area_perimeter(p)[0]) / 1e6 <= 3000 for p in ps)
