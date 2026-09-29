"""F2-B v1.1 API — 별칭 세트(19) · 지수 결과(20) · 필지 결합(21) · 측지 면적(12) · index 생략(13) · eta(11) · plan 훅(D0) ·
index.month 필드(10) · cpu job.progress(9) · /ops/gpus v1.1 통과(28) · power_budget(18)."""
import csv
import io
import json

import httpx
import pytest

from _f2b import BASE, B, H, sleep_job, sse, submit, wait_job
from workers.registry_scan import adapter_for_kind, normalize_plan

GH = "results/lx/namwon-greenhouse-2023-vh"


# ── v1.1-19 별칭 ────────────────────────────────────────────────────────────────
def test_alias_stats_by_emd_matches_table(live, tok):
    j = httpx.get(B + f"/results/{GH}/stats?by=emd", headers=H(tok["staff"]), timeout=60).json()
    by = {x["key"]: x["n"]["value"] for x in j["items"]}
    assert by["금지면"] == 319 and by["운봉읍"] == 271 and by["주생면"] == 242 and by["산내면"] == 19
    assert j["total"]["n"]["value"] == 2819
    assert j["items"][0]["n"]["basis"] == "inferred"


def test_alias_features_not_empty(live, tok):
    fc = httpx.get(B + f"/results/{GH}/features?limit=5", headers=H(tok["staff"]), timeout=60).json()
    assert fc["lx"]["total"] == 2819 and len(fc["features"]) == 5
    assert fc["features"][0]["properties"]["job_id"].startswith("job_")


def test_alias_stats_by_cls(live, tok):
    j = httpx.get(B + f"/results/{GH}/stats?by=cls", headers=H(tok["staff"]), timeout=60).json()
    assert sum(x["n"]["value"] for x in j["items"]) == 2819


def test_unknown_set_404_not_silent_zero(live, tok):
    """F2-B 1차 판정 불합격 3: 없는 세트(route prefix 누락 · 오타)는 200·total 0 이 아니라 404 not_found 봉투(set 명시)."""
    for bad in ("lx/namwon-greenhouse-2023-vh", "results/lx/namwon-greenhouse-2023-vhX"):
        for sub in ("stats?by=emd", "features?limit=1"):
            r = httpx.get(B + f"/results/{bad}/{sub}", headers=H(tok["staff"]), timeout=60)
            assert r.status_code == 404, (bad, sub, r.status_code, r.text[:200])
            e = r.json()["error"]
            assert e["code"] == "not_found" and e["detail"]["set"] == bad
    # 정적 시드 세트 · 이름 붙은 게시 세트는 그대로 200
    assert httpx.get(B + "/results/results/lx/namwon-change/stats?by=cls", headers=H(tok["staff"]), timeout=60).status_code == 200


# ── v1.1-21 필지 결합 ──────────────────────────────────────────────────────────
def test_results_parcels_join(live, tok):
    r = httpx.get(B + f"/results/{GH}/parcels?emd_cd=52190250&limit=50", headers=H(tok["staff"]), timeout=120)
    if r.status_code == 404:
        assert r.json()["error"]["code"] == "parcels_unavailable"
        pytest.skip("survey_parcels 없음(F2-S 적재 전)")
    fc = r.json()
    assert fc["type"] == "FeatureCollection" and fc["lx"]["count"]["unit"] == "필지" and fc["lx"]["count"]["basis"] == "inferred"
    assert 0 < len(fc["features"]) <= 50 and fc["lx"]["total"] >= len(fc["features"])
    p = fc["features"][0]["properties"]
    assert p["pnu"].startswith("52190250") and p["n"] >= 1 and p["hit_m2"] > 0
    assert [b["emd_cd"] for b in fc["lx"]["by_emd"]] == ["52190250"]


def test_results_parcels_tenant_own_alias(live, tok):
    """기관 세션: 자기 배포본 스냅샷 별칭(dp-nw-farm-25@2.0 → namwon-landcover-2023)으로 결합 — 자기 기관 필지만 · 1 s 대."""
    r = httpx.get(B + "/results/results/namwon/dp-nw-farm-25@2.0/parcels?emd_cd=52190250&cls=비닐하우스&limit=5", headers=H(tok["namwon"]), timeout=120)
    if r.status_code == 404:
        pytest.skip("survey_parcels 없음")
    fc = r.json()
    assert r.status_code == 200 and fc["lx"]["total"] > 0 and all(f["properties"]["pnu"].startswith("52190250") for f in fc["features"])
    assert fc["lx"]["ms"] < 10000


def test_results_parcels_tenant_isolation(live, tok):
    r = httpx.get(B + f"/results/{GH}/parcels?limit=1", headers=H(tok["gj"]), timeout=60)
    assert r.status_code == 403


# ── v1.1-12 · 13 · 11 견적 ─────────────────────────────────────────────────────
YSYK = {"type": "Polygon", "coordinates": [[[74.70, 42.75], [75.20, 42.75], [75.20, 43.00], [74.70, 43.00], [74.70, 42.75]]]}


def test_quote_geodesic_area_ysykata_and_index_without_imagery(live, tok):
    q = httpx.post(B + "/jobs/quote", headers=H(tok["staff"]), timeout=60,
                   json={"kind": "index", "model_id": "index/ndvi_pc", "aoi": YSYK, "params": {"months": ["2025-05", "2025-06", "2025-07"]},
                         "options": {"source": "pc-s2-l2a"}}).json()
    assert q["allowed"] is True and q["shards"] == 3 and q["pool"] == "cpu"
    assert abs(q["area_km2"]["value"] - 1133) < 2, q["area_km2"]
    assert q["area_km2"]["source"].startswith("geodesic")
    assert q["eta_s"]["basis"] == "estimate" and q["eta_s"]["unit"] == "s"


def test_quote_korea_keeps_5186(live, tok):
    aoi = {"type": "Polygon", "coordinates": [[[126.944, 35.995], [126.949, 35.995], [126.949, 35.999], [126.944, 35.999], [126.944, 35.995]]]}
    q = httpx.post(B + "/jobs/quote", headers=H(tok["staff"]), timeout=120,
                   json={"kind": "infer", "model_id": "car_v2_obb", "imagery_id": "axis-iksan-hwangdeung", "aoi": aoi,
                         "options": {"chip": 1024, "overlap": 0.125}}).json()
    assert q["area_km2"]["source"] == "shapely area(EPSG:5186)"
    pb = q["power_budget"]
    assert pb["max_hot_gpus"] == 1 and len(pb["leases"]) == 1 and pb["hold_reason"] in (None, "power_budget")


# ── D0 plan 훅 ─────────────────────────────────────────────────────────────────
def test_normalize_plan_unit():
    out = normalize_plan([{"shard_id": "emd-52190250", "emd_cd": "52190250", "name": "운봉읍"}, "x1", {"id": "y", "bbox": [1, 2, 3, 4]}])
    assert out[0] == {"shard_id": "emd-52190250", "bbox": [0, 0, 0, 0], "window": None, "params": {"emd_cd": "52190250", "name": "운봉읍"}}
    assert out[1]["shard_id"] == "x1" and out[2]["bbox"] == [1, 2, 3, 4]


def test_plan_hook_quote_uses_adapter_plan(live, tok):
    q = httpx.post(B + "/jobs/quote", headers=H(tok["staff"]), timeout=60, json=sleep_job(n=5)).json()
    assert q["shards"] == 5 and q["shards_env"]["source"] == "plan(test/sleep)" and q["pool"] == "cpu"


def test_survey_kind_39_shards_via_f2s_adapter(live, tok):
    if not adapter_for_kind("survey"):
        pytest.skip("F2-S survey/rules 어댑터 없음")
    q = httpx.post(B + "/jobs/quote", headers=H(tok["staff"]), timeout=60, json={"kind": "survey", "survey_id": "farmland", "options": {"sgg_cd": "52190"}}).json()     # 전국화 뒤: 시군구 인자(core-survey)
    assert q["shards"] == 39 and q["pool"] == "cpu" and q["eta_s"]["basis"] == "estimate"


def test_unknown_kind_400(live, tok):
    r = httpx.post(B + "/jobs/quote", headers=H(tok["staff"]), timeout=60, json={"kind": "join-nope"})
    assert r.status_code == 400 and r.json()["error"]["code"] == "bad_request"


# ── v1.1-9 · 10 · 20 cpu progress · index.month · /results/{set}/index ────────────
def test_cpu_job_progress_and_index_month_fields(live, tok):
    jid = submit(tok["staff"], sleep_job(n=3, month="2025-05", sleep_first_s=0.4))
    evs = sse(BASE + f"/api/v1/events/jobs/{jid}?access_token={tok['staff']}", until=("job.done", "job.failed"), timeout=60)
    names = [e for e, *_ in evs]
    assert names.count("index.month") == 3
    m = next(d for e, d, *_ in evs if e == "index.month")
    for k in ("hist", "p10", "p50", "p90", "valid_px", "ms", "ndvi_mean", "n_scenes"):
        assert m.get(k) is not None, k
    assert len(m["hist"]["counts"]) == 20 and len(m["hist"]["bins"]) == 21
    prog = [d for e, d, *_ in evs if e == "job.progress"]
    assert prog and prog[-1]["shards_done"] == 3 == prog[-1]["shards_total"] and prog[-1]["final"] is True
    done = next(d for e, d, *_ in evs if e == "job.done")
    assert done["chips_per_wall_s"]["value"] and done["chips_per_gpu_s"]["value"] is None
    j = httpx.get(B + f"/results/{jid}/index", headers=H(tok["staff"]), timeout=30).json()
    assert j["total"] == 3 and j["items"][0]["p50"]["value"] == 0.43 and j["items"][0]["hist"]["counts"][11] == 40
    c = httpx.get(B + f"/results/{jid}/index?format=csv", headers=H(tok["staff"]), timeout=30)
    rows = list(csv.reader(io.StringIO(c.content.decode("utf-8-sig"))))
    assert rows[0][:5] == ["month", "ndvi_mean", "p10", "p50", "p90"] and len(rows) == 4 and rows[1][3] == "0.43"
    g = httpx.get(B + f"/results/{jid}/index?format=geojson", headers=H(tok["staff"]), timeout=30).json()
    assert g["type"] == "FeatureCollection" and len(g["features"][0]["properties"]["months"]) == 3


def test_index_other_tenant_forbidden(live, tok):
    items = httpx.get(B + "/jobs?limit=20", headers=H(tok["staff"]), timeout=30).json()["items"]
    j = next((x for x in items if x["kind"] == "index"), None)
    if not j:
        pytest.skip("index 작업 없음")
    r = httpx.get(B + f"/results/{j['id']}/index", headers=H(tok["gj"]), timeout=30)
    assert r.status_code in (403, 404)


# ── v1.1-28 /ops/gpus 통과 ────────────────────────────────────────────────────
def test_ops_gpus_v11_fields_no_500(live, tok):
    for _ in range(3):
        r = httpx.get(B + "/ops/gpus", headers=H(tok["admin"]), timeout=30)
        assert r.status_code == 200, r.text[:300]
        g = r.json()["gpus"][0]
        for k in ("util_ma5", "power_w"):
            assert {"value", "unit", "basis", "source"} <= set(g[k]), k
        assert "caution" in g and "fault" in g


# ── 확장 라우터 훅(D0) ──────────────────────────────────────────────────────────
def test_ext_router_hook_absent_and_present():
    import subprocess
    import sys
    from pathlib import Path
    root = str(Path(__file__).resolve().parents[1])
    code = r'''
import sys, types, json
sys.path.insert(0, r"%s")
from fastapi import APIRouter
fake = types.ModuleType("landxi_api.agent"); fake.router = APIRouter()
@fake.router.get("/agent/_pytest_ping")
def _p(): return {"ok": True}
sys.modules["landxi_api.agent"] = fake
sys.modules["landxi_api.survey"] = None          # 없음 흉내 → ModuleNotFoundError → 조용히 건너뜀
import landxi_api.main as m
print(json.dumps({"ext": m.EXT_ROUTERS, "paths": [r.path for r in m.app.routes if "_pytest_ping" in getattr(r, "path", "")]}))
''' % root
    out = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=120)
    last = [ln for ln in out.stdout.splitlines() if ln.startswith("{")][-1]
    d = json.loads(last)
    assert {k: d["ext"][k] for k in ("survey", "agent")} == {"survey": "absent", "agent": "mounted"} and d["paths"] == ["/api/v1/agent/_pytest_ping"]
    bad = code.replace('sys.modules["landxi_api.survey"] = None', 'b = types.ModuleType("landxi_api.survey")\nsys.modules["landxi_api.survey"] = b')
    out = subprocess.run([sys.executable, "-c", bad], capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=120)
    assert out.returncode != 0 and "router" in out.stderr            # 있는데 깨졌으면 기동 실패로 드러난다
