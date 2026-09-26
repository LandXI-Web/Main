"""계약 검사(F1-CONTRACT §13) — 라우트 응답 키 집합 = 픽스처 키 집합(+선택 키) · 봉투 자리 = 봉투 · SSE 이벤트 이름 · 오류 코드.
값은 검사하지 않는다. 게이트웨이 :8700 가 떠 있어야 한다(없으면 skip)."""
import json
from pathlib import Path

import httpx
import pytest

from conftest import BASE, H
from landxi_api.envelope import is_env, scan

FIX = Path(__file__).resolve().parents[1] / "fixtures" / "contract"


def fx(name):
    return json.loads((FIX / f"{name}.json").read_text(encoding="utf-8"))


def check_shape(resp, fix, path="$", optional=(), nested=None):
    nested = nested or {}
    if isinstance(fix, dict) and is_env(fix):
        assert is_env(resp), f"{path}: 봉투여야 함 → {resp!r}"[:300]
        return
    if isinstance(fix, dict):
        assert isinstance(resp, dict), f"{path}: dict 여야 함"
        fk, rk = set(fix), set(resp)
        missing = fk - rk - {"detail"}
        assert not missing, f"{path}: 빠진 키 {missing}"
        extra = rk - fk - set(optional)
        assert not extra, f"{path}: 계약에 없는 키 {extra}"
        for k in fk:
            if k in ("coordinates", "geometry", "aoi", "footprint", "options", "counts", "modules", "detail", "params", "metrics", "perf", "chain"):
                continue
            sub_opt = nested.get(f"{k}[]", nested.get(k, []))
            if fix[k] is None or resp[k] is None:
                continue
            if k in ("pools",):
                for pk, pv in resp[k].items():
                    check_shape(pv, next(iter(fix[k].values())), f"{path}.{k}.{pk}", nested.get("pools.*", []))
                continue
            if k in ("by_tenant", "dims", "ladder", "name", "region_name", "classes", "ext"):
                continue
            check_shape(resp[k], fix[k], f"{path}.{k}", sub_opt, nested)
    elif isinstance(fix, list) and fix and isinstance(fix[0], dict):
        assert isinstance(resp, list), f"{path}: list 여야 함"
        for i, it in enumerate(resp[:5]):
            src = fix[0] if not (it.get("state") == "pending" and len(fix) > 1) else fix[1]
            if it.get("state") == "pending":
                continue
            check_shape(it, src, f"{path}[{i}]", optional, nested)


CASES = [
    ("health", "GET", "/api/v1/health", None, None),
    ("me", "GET", "/api/v1/me", "admin", None),
    ("catalog_layers", "GET", "/api/v1/catalog/layers?build=lx", "staff", None),
    ("catalog_imagery", "GET", "/api/v1/catalog/imagery/ap25-namwon-2023", "admin", None),
    ("tiles_sign", "GET", "/tiles/sign?set=results/namwon/dp-nw-farm-25@2.1", "namwon", None),
    ("jobs_quote", "POST", "/api/v1/jobs/quote", "staff", {"kind": "infer", "model_id": "car_v2_obb", "imagery_id": "axis-iksan-hwangdeung",
                                                              "aoi": {"type": "Polygon", "coordinates": [[[126.9440, 35.9950], [126.9450, 35.9950], [126.9450, 35.9960], [126.9440, 35.9960], [126.9440, 35.9950]]]},
                                                              "options": {"chip": 1024, "overlap": 0.125}, "demo": False}),
    ("jobs_list", "GET", "/api/v1/jobs?limit=3", "staff", None),
    ("results_features", "GET", "/api/v1/results/results/lx/namwon-landcover-2023/features?limit=2", "staff", None),
    ("results_stats", "GET", "/api/v1/results/results/lx/namwon-landcover-2023/stats?by=emd", "staff", None),
    ("parcels", "GET", "/api/v1/parcels?lng=127.39&lat=35.416", None, None),
    ("registry_models", "GET", "/api/v1/registry/models", "staff", None),
    ("registry_cards", "GET", "/api/v1/registry/cards", "staff", None),
    ("registry_lineage", "GET", "/api/v1/registry/lineage/dp-nw-farm-25", "staff", None),
    ("deploys_list", "GET", "/api/v1/deploys", "admin", None),
    ("deploy", "GET", "/api/v1/deploys/dp-nw-farm-25", "admin", None),
    ("tenants", "GET", "/api/v1/tenants", "admin", None),
    ("usage", "GET", "/api/v1/t/namwon/usage", "namwon", None),
    ("ops_nodes", "GET", "/api/v1/ops/nodes", "admin", None),
    ("ops_gpus", "GET", "/api/v1/ops/gpus", "admin", None),
    ("ops_queues", "GET", "/api/v1/ops/queues", "admin", None),
    ("ops_storage", "GET", "/api/v1/ops/storage", "admin", None),
    ("ops_alerts", "GET", "/api/v1/ops/alerts", "admin", None),
    ("ops_models", "GET", "/api/v1/ops/models", "admin", None),
    ("ops_tenants", "GET", "/api/v1/ops/tenants", "admin", None),
    ("ops_bench", "GET", "/api/v1/ops/bench", "admin", None),
    ("ops_join_token", "POST", "/api/v1/ops/nodes/join-token", "admin", {}),
]


@pytest.mark.parametrize("name,method,path,who,body", CASES, ids=[c[0] for c in CASES])
def test_route_shape(live, tok, name, method, path, who, body):
    f = fx(name)
    h = H(tok[who]) if who else {}
    r = httpx.request(method, BASE + path, headers=h, json=body, timeout=180)
    assert r.status_code == f["status"], r.text[:300]
    j = r.json()
    scan(j) if name not in ("results_features",) else scan(j["lx"])
    check_shape(j, f["body"], "$", f.get("optional", []), f.get("optional_nested", {}))


def test_job_shape(live, tok):
    items = httpx.get(BASE + "/api/v1/jobs?limit=1", headers=H(tok["staff"]), timeout=30).json()["items"]
    if not items:
        pytest.skip("작업 없음")
    j = httpx.get(BASE + f"/api/v1/jobs/{items[0]['id']}", headers=H(tok["staff"]), timeout=30).json()
    check_shape(j, fx("job")["body"])


def test_error_shape(live, tok):
    r = httpx.get(BASE + "/api/v1/jobs/job_nope", headers=H(tok["staff"]), timeout=30)
    assert r.status_code == 404
    check_shape(r.json(), fx("error")["body"])


def test_sse_event_names_and_errors_documented():
    s = json.loads((FIX / "_sse_and_errors.json").read_text(encoding="utf-8"))
    import re
    src = "\n".join(p.read_text(encoding="utf-8") for p in (Path(__file__).resolve().parents[1] / "workers").glob("*.py"))
    src += (Path(__file__).resolve().parents[1] / "landxi_api" / "jobs.py").read_text(encoding="utf-8")
    emitted = set(re.findall(r'(?:emit|publish)\([^,]+,\s*"([a-z]+\.[a-z]+)"', src))
    assert emitted <= set(s["jobs"]), emitted - set(s["jobs"])
    assert {"job.queued", "job.started", "shard.started", "shard.done", "shard.failed", "job.progress", "job.done", "snapshot.ready",
            "job.cancelled", "job.failed", "index.month"} <= emitted
    from landxi_api.deps import ERROR_STATUS
    assert set(s["errors"]) <= set(ERROR_STATUS)


def test_envelope_scan_rejects_bare_number():
    from landxi_api.envelope import EnvelopeMissing
    with pytest.raises(EnvelopeMissing):
        scan({"area": 12.5})
    scan({"area": {"value": 12.5, "unit": "km2", "basis": "measured", "as_of": "x", "source": "y"}, "shards_total": 3})
