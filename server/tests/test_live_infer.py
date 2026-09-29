"""fix-xi-live — XI맵 읍면동 소범위 실시간 분석(작업 대기열 · GPU 한 장).

① 범위 정규화(벡터 타일 조각 → 한 면) · 해상도 사다리(live_plan) · 모델 해상도 맞춤 — 단위(GPU 없음)
② 견적: 서버 범위 천장(클라이언트 max_km2 로 늘릴 수 없음) · 영상 전체(범위 없음)도 같은 천장 · live 는 해상도·범위를 서버가 정해 돌려준다
   · 영업 계정 demo 강제 유지 · live 견적은 GPU 워커에 모델 미리 적재를 부탁한다
③ 워커: 범위 밖 결과 제외(clip_to_aoi) — 단위
④ (GPU 워커 하트비트가 있을 때만) 아주 작은 live 작업 1건: 제출 → 첫 shard.done ≤ 10 s → job.done · 관리자 작업 목록에 같은 작업
   — 게이트웨이 작업 대기열로만, 칩 몇 개(전력 규칙 · 동시 고부하 1장은 워커 임대가 지킨다).
예시 지역(남원) 좌표는 시험 자료일 뿐이다(서비스 코드에는 지역 문자열 없음).
"""
import json
import sys
import time

import httpx
import pytest
from affine import Affine
from shapely.geometry import box, mapping, shape

from conftest import B, BASE, H

IMG = "ap25-namwon-2023"          # 25cm 항공영상(카탈로그 실자산)
MODEL = "aerial25/best"           # 25cm 로 배운 토지피복 모델
LX, LY = 127.39, 35.41            # 예시 지역 안의 한 점


def sq(cx, cy, half_deg):
    return mapping(box(cx - half_deg, cy - half_deg, cx + half_deg, cy + half_deg))


def body(aoi, **opt):
    return {"kind": "infer", "model_id": MODEL, "imagery_id": IMG, "aoi": aoi,
            "options": {"chip": 1024, "overlap": 0.125, "conf": 0.25, "live": True, **opt}}


# ── ① 단위 ───────────────────────────────────────────────────────────────────
def test_normalize_aoi_dissolves_tile_pieces():
    from landxi_api.jobs import normalize_aoi
    # 벡터 타일 두 장에 잘린 한 면(이음새 겹침 0.0001°)
    a = [[[127.0, 35.0], [127.0101, 35.0], [127.0101, 35.01], [127.0, 35.01], [127.0, 35.0]]]
    b = [[[127.01, 35.0], [127.02, 35.0], [127.02, 35.01], [127.01, 35.01], [127.01, 35.0]]]
    g = normalize_aoi({"type": "MultiPolygon", "coordinates": [a, b]})
    assert g["type"] == "Polygon"
    s = shape(g)
    assert abs(s.area - 0.02 * 0.01) < 1e-7
    # Feature · FeatureCollection · 이미 한 면이면 그대로
    assert normalize_aoi({"type": "Feature", "geometry": {"type": "Polygon", "coordinates": a}})["type"] == "Polygon"
    fc = {"type": "FeatureCollection", "features": [{"type": "Feature", "geometry": {"type": "Polygon", "coordinates": a}},
                                                    {"type": "Feature", "geometry": {"type": "Polygon", "coordinates": b}}]}
    assert normalize_aoi(fc)["type"] == "Polygon"
    p = {"type": "Polygon", "coordinates": a}
    assert normalize_aoi(p) is p
    assert normalize_aoi(None) is None


def test_normalize_aoi_islands_keep_largest():
    from landxi_api.jobs import normalize_aoi
    big = [[[127.0, 35.0], [127.02, 35.0], [127.02, 35.02], [127.0, 35.02], [127.0, 35.0]]]
    isle = [[[127.05, 35.05], [127.051, 35.05], [127.051, 35.051], [127.05, 35.051], [127.05, 35.05]]]
    g = shape(normalize_aoi({"type": "MultiPolygon", "coordinates": [big, isle]}))
    assert abs(g.area - 0.0004) < 1e-7


def test_fit_upsample():
    from landxi_api.jobs import fit_upsample
    assert fit_upsample({"gsd_trained_m": 0.25}, {"gsd_m": 0.25}) == 1.0
    assert fit_upsample({"gsd_trained_m": 0.02}, {"gsd_m": 0.0136}) == 0.68      # 드론 1.36cm → 차량 모델 2cm
    assert fit_upsample({"gsd_trained_m": 0.02}, {"gsd_m": 0.25}) == 1.0         # 영상이 더 거칠면 키우지 않는다
    assert fit_upsample({"gsd_trained_m": None}, {"gsd_m": 0.25}) == 1.0


def _meta():
    # 25cm · EPSG:5186 · 가로세로 200km 가상 래스터(예시 지역 근처 원점)
    return {"width": 800000, "height": 800000, "transform": Affine(0.25, 0, 150000.0, 0, -0.25, 450000.0), "crs": 5186, "res": 0.25}


def test_live_plan_steps_resolution_down_to_cap():
    from landxi_api import jobs
    meta = _meta()
    small = sq(LX, LY, 0.005)          # ≈ 1㎢
    u, _, sh = jobs.live_plan(meta, small, None, 1024, 0.125, 1.0)
    assert u == 1.0 and 0 < len(sh) <= jobs.LIVE_MAX_SHARDS
    big = sq(LX, LY, 0.05)             # ≈ 100㎢ — 원 해상도로는 상한을 넘는다
    u2, _, sh2 = jobs.live_plan(meta, big, None, 1024, 0.125, 1.0, key="pytest-live-big")
    assert u2 < 1.0 and len(sh2) <= jobs.LIVE_MAX_SHARDS
    # 같은 키 두 번째 = 고른 해상도부터(견적 → 제출 사이 사다리 반복 없음)
    u3, _, sh3 = jobs.live_plan(meta, big, None, 1024, 0.125, 1.0, key="pytest-live-big")
    assert (u3, len(sh3)) == (u2, len(sh2))


# ── ③ 워커 범위 밖 결과 제외(GPU 없음) ────────────────────────────────────────────
def test_clip_to_aoi_drops_outside_features():
    argv = sys.argv
    sys.argv = ["gpu_worker.py", "--gpu", "0"]
    try:
        import importlib
        gw = importlib.import_module("workers.gpu_worker")
    finally:
        sys.argv = argv
    from adapters.base import Detection, ShardResult
    aoi = {"type": "Polygon", "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]}
    inside = Detection(box(0.2, 0.2, 0.3, 0.3), "건물", "building", 1, 0.9)
    outside = Detection(box(1.5, 1.5, 1.6, 1.6), "건물", "building", 1, 0.9)
    res = [ShardResult([inside, outside], {}, 2, 10)]
    out = gw.clip_to_aoi("job_pytest_clip", {"aoi": json.dumps(aoi)}, res)
    assert out[0].n == 1 and out[0].features == [inside]
    # 범위 없는 작업은 그대로
    assert gw.clip_to_aoi("job_pytest_noaoi", {"aoi": ""}, res)[0].n == 2


# ── ② 견적(게이트웨이) ─────────────────────────────────────────────────────────
def test_quote_live_small_allowed_server_plans(live, tok):
    q = httpx.post(B + "/jobs/quote", headers=H(tok["staff"]), json=body(sq(LX, LY, 0.004)), timeout=60).json()
    assert q["allowed"], q
    assert q["upsample"] == 1.0                           # 25cm 모델 × 25cm 영상 = 원 해상도
    assert q["aoi"]["type"] == "Polygon"                  # 서버가 정규화한 범위를 돌려준다(화면 프레임)
    from landxi_api.jobs import LIVE_MAX_SHARDS
    assert 0 < q["shards"] <= LIVE_MAX_SHARDS


def test_quote_live_multipolygon_pieces_normalized(live, tok):
    a = [[[LX - 0.004, LY - 0.003], [LX + 0.00005, LY - 0.003], [LX + 0.00005, LY + 0.003], [LX - 0.004, LY + 0.003], [LX - 0.004, LY - 0.003]]]
    b = [[[LX, LY - 0.003], [LX + 0.004, LY - 0.003], [LX + 0.004, LY + 0.003], [LX, LY + 0.003], [LX, LY - 0.003]]]
    q = httpx.post(B + "/jobs/quote", headers=H(tok["staff"]), json=body({"type": "MultiPolygon", "coordinates": [a, b]}), timeout=60).json()
    assert q["allowed"], q
    assert q["aoi"]["type"] == "Polygon"


def test_quote_server_ceiling_cannot_be_raised_by_client(live, tok):
    big = sq(LX, LY, 0.08)             # ≈ 260㎢ > 서버 천장
    q = httpx.post(B + "/jobs/quote", headers=H(tok["staff"]), json=body(big, max_km2=100000), timeout=120).json()
    assert not q["allowed"] and "aoi_too_large" in q["reasons"], q
    r = httpx.post(B + "/jobs", headers=H(tok["staff"]), json=body(big, max_km2=100000), timeout=120)
    assert r.status_code == 400 and r.json()["error"]["code"] == "aoi_too_large"


def test_quote_whole_imagery_without_aoi_hits_same_ceiling(live, tok):
    b = body(None)
    b.pop("aoi")
    q = httpx.post(B + "/jobs/quote", headers=H(tok["staff"]), json=b, timeout=120).json()
    assert not q["allowed"] and "aoi_too_large" in q["reasons"], q


def test_sales_demo_rule_kept(live, tok):
    q = httpx.post(B + "/jobs/quote", headers=H(tok["sales"]), json=body(sq(LX, LY, 0.003)), timeout=60).json()
    assert "demo_required" in q["reasons"]
    q2 = httpx.post(B + "/jobs/quote", headers=H(tok["sales"]), json={**body(sq(LX, LY, 0.003)), "demo": True}, timeout=60).json()
    assert q2["allowed"], q2


def _gpu_workers():
    from workers.bus import r
    return [h for h in (r().hgetall(k) for k in r().scan_iter(match="worker:*:hb", count=2000)) if h.get("device") == "gpu"]


def test_live_quote_prewarms_model(live, tok):
    ws = _gpu_workers()
    if not ws:
        pytest.skip("GPU 워커 없음")
    from workers.bus import r
    httpx.post(B + "/jobs/quote", headers=H(tok["staff"]), json=body(sq(LX, LY, 0.003)), timeout=60).raise_for_status()
    for _ in range(40):                                    # 워커가 적재(또는 이미 올라 있음) — 전력 규칙으로 미뤄질 수 있어 20 s 까지
        have = all(MODEL in json.loads(r().hget(f"worker:{w['id']}:vram", "models") or "[]") for w in ws)
        if have:
            break
        time.sleep(0.5)
    assert have


# ── ④ 실제 소범위 작업 1건(칩 몇 개 · 대기열) ────────────────────────────────────
def test_live_job_first_result_fast_and_listed_for_admin(live, tok):
    if not _gpu_workers():
        pytest.skip("GPU 워커 없음")
    from _f2b import sse
    aoi = sq(LX, LY, 0.002)            # ≈ 0.16㎢ · 칩 몇 개
    b = {**body(aoi), "priority": 0, "label": "pytest live-infer"}
    httpx.post(B + "/jobs/quote", headers=H(tok["staff"]), json=b, timeout=60).raise_for_status()   # 화면과 같은 순서(견적 → 실행)
    time.sleep(1.5)
    t0 = time.time()
    r = httpx.post(B + "/jobs", headers=H(tok["staff"]), json=b, timeout=60)
    assert r.status_code == 202, r.text[:300]
    jid = r.json()["job"]["id"]
    assert r.json()["job"]["options"].get("upsample") == 1.0      # 서버가 고른 해상도가 작업 옵션에 남는다
    evs = sse(BASE + f"/api/v1/events/jobs/{jid}?access_token={tok['staff']}", until=("job.done", "job.failed", "job.cancelled"), timeout=240)
    names = [e[0] for e in evs]
    assert "job.done" in names, names[-5:]
    first = next(e for e in evs if e[0] == "shard.done")
    # 첫 결과 ≤ 10 s(대기열이 비어 있을 때 기준 — 다른 작업·전력 규칙 대기가 있으면 그만큼 늦는다: 그땐 대기 사유를 확인)
    waited = any((e[1].get("power_gate") or {}).get("waiting") for e in evs if e[0] == "job.progress")
    assert first[3] <= 10 or waited, f"첫 결과 {first[3]:.1f}s"
    # 관리자 작업 목록(같은 작업 id · 일원화) — 시험 작업은 기본 목록에서 빠지므로 include_test
    items = httpx.get(B + "/jobs?include_test=1&limit=50", headers=H(tok["admin"]), timeout=30).json()["items"]
    assert any(x["id"] == jid for x in items)
    print(f"live job {jid}: first {first[3]:.1f}s · total {time.time() - t0:.1f}s")
