"""관문(사용자 결정 2026-09-24 · 계약 §3·§4.1·§4.2) + 배포 상태기계(§4.7) + 봉투 500."""
import httpx
import pytest

from conftest import BASE, H

B = BASE + "/api/v1"


def test_public_catalog_has_no_own_imagery(live):
    j = httpx.get(B + "/catalog/layers?build=public", timeout=60).json()
    own = [i["id"] for i in j["items"] if i["role"] == "imagery" and i["source"] in ("pmtiles", "xyz", "cog")]
    assert own == [], own
    imagery = [i["id"] for i in j["items"] if i["role"] == "imagery"]
    assert "xdworld-satellite" in imagery
    assert all(i["export_policy"] == "public" for i in j["items"] if i["role"] == "result")


def test_guest_cannot_escalate_build(live):
    j = httpx.get(B + "/catalog/layers?build=lx", timeout=60).json()
    assert j["build"] == "public"


def test_tenant_catalog_no_raw_or_cog(live, tok):
    j = httpx.get(B + "/catalog/layers", headers=H(tok["namwon"]), timeout=60).json()
    assert j["build"] == "tenant"
    assert not [i for i in j["items"] if i["tier"] == "raw" or i["source"] == "cog"]


def test_tenant_raw_routes_403(live, tok):
    r = httpx.get(B + "/catalog/imagery/axis-iksan-hwangdeung", headers=H(tok["namwon"]), timeout=30)
    assert r.status_code == 403 and r.json()["error"]["code"] == "imagery_forbidden"
    r = httpx.get(BASE + "/tiles/cog/axis-iksan-hwangdeung/18/222800/102100.webp", headers=H(tok["namwon"]), timeout=30)
    assert r.status_code == 403
    r = httpx.get(BASE + "/tiles/sign?set=imagery/axis_iksan_hwangdeung", headers=H(tok["namwon"]), timeout=30)
    assert r.status_code == 403
    r = httpx.get(BASE + "/tiles/pmtiles/imagery/axis_iksan_hwangdeung.pmtiles", headers={"range": "bytes=0-126"}, timeout=30)
    assert r.status_code == 403


def test_unsigned_tenant_result_set_403_and_signed_206(live, tok):
    r = httpx.get(BASE + "/tiles/pmtiles/results/namwon/dp-nw-farm-25@2.1.pmtiles", headers={"range": "bytes=0-126"}, timeout=30)
    assert r.status_code == 403
    s = httpx.get(BASE + "/tiles/sign?set=results/namwon/dp-nw-farm-25@2.1", headers=H(tok["namwon"]), timeout=30).json()
    r = httpx.get(s["url"], headers={"range": "bytes=0-126"}, timeout=30)
    assert r.status_code == 206 and r.content[:7] == b"PMTiles" and r.headers["accept-ranges"] == "bytes" and "etag" in r.headers
    # 다른 기관은 서명을 받을 수 없다
    r = httpx.get(BASE + "/tiles/sign?set=results/namwon/dp-nw-farm-25@2.1", headers=H(tok["gj"]), timeout=30)
    assert r.status_code == 403


def test_public_set_unsigned_206_and_xyz_204(live):
    r = httpx.get(BASE + "/tiles/pmtiles/results/lx/namwon-landcover-2023.pmtiles", headers={"range": "bytes=0-126"}, timeout=30)
    assert r.status_code == 206
    r = httpx.get(BASE + "/tiles/xyz/namwon_ap25_2023/3/0/0.webp", timeout=30)
    assert r.status_code == 204


def test_envelope_missing_500_dev(live):
    r = httpx.get(B + "/_dev/envelope-probe", timeout=30)
    assert r.status_code == 500 and r.json()["error"]["code"] == "envelope_missing"


def test_sales_demo_required(live, tok):
    body = {"kind": "infer", "model_id": "car_v2_obb", "imagery_id": "axis-iksan-hwangdeung", "demo": False,
            "aoi": {"type": "Polygon", "coordinates": [[[126.9440, 35.9950], [126.9442, 35.9950], [126.9442, 35.9952], [126.9440, 35.9952], [126.9440, 35.9950]]]}}
    r = httpx.post(B + "/jobs", json=body, headers=H(tok["sales"]), timeout=60)
    assert r.status_code == 403 and r.json()["error"]["code"] == "demo_required"


def test_tenant_isolation_rls(live, tok):
    j = httpx.get(B + "/deploys", headers=H(tok["gj"]), timeout=30).json()
    assert {d["tenant_id"] for d in j["items"]} <= {"gwangju-jeonnam"}
    r = httpx.get(B + "/t/namwon/usage", headers=H(tok["gj"]), timeout=30)
    assert r.status_code == 403


def test_deploy_state_machine(live, tok):
    a = H(tok["admin"])
    aoi = {"type": "Polygon", "coordinates": [[[74.20, 42.80], [74.45, 42.80], [74.45, 42.95], [74.20, 42.95], [74.20, 42.80]]]}
    r = httpx.post(B + "/deploys", headers=a, json={"from_deploy_id": "dp-nw-change", "tenant_id": "kgz-land", "region_profile": "kgz-sokuluk",
                                                   "aoi": aoi, "name": "소쿨룩 시가지 변화 · 2026 (테스트)", "gpu_pool": "cpu", "year": 2026,
                                                   "id": "dp-kgz-land-change-26-test"}, timeout=30)
    assert r.status_code == 201, r.text
    d = r.json()
    assert d["stage"] == "draft" and d["card_version_id"] == "card-change@1.0" and d["from_deploy_id"] == "dp-nw-change"
    did = d["id"]
    r = httpx.post(B + f"/deploys/{did}/rollout", headers=a, json={"stage": "ga"}, timeout=30)
    assert r.status_code == 409 and r.json()["error"]["code"] == "invalid_stage_transition"
    for st in ("shadow", "canary"):
        assert httpx.post(B + f"/deploys/{did}/rollout", headers=a, json={"stage": st}, timeout=30).status_code == 200
    r = httpx.post(B + f"/deploys/{did}/rollout", headers=a, json={"stage": "ga"}, timeout=30)
    assert r.status_code == 409 and r.json()["error"]["code"] == "approval_required"
    assert httpx.post(B + f"/deploys/{did}/approve", headers=a, json={"decision": "approve", "reason": "test"}, timeout=30).status_code == 200
    assert httpx.post(B + f"/deploys/{did}/rollout", headers=a, json={"stage": "ga"}, timeout=30).json()["stage"] == "ga"
    r = httpx.post(B + f"/deploys/{did}/modules", headers=a, json={"ext": {"mod-auth": False}}, timeout=30)
    assert r.status_code == 400 and r.json()["error"]["code"] == "module_locked"
    # 롤백: 스냅샷 current ↔ prev
    before = httpx.get(B + "/deploys/dp-nw-farm-25", headers=a, timeout=30).json()
    r = httpx.post(B + "/deploys/dp-nw-farm-25/rollback", headers=a, json={}, timeout=30).json()
    assert r["stage"] == "rolled_back" and r["snapshot_current"] == before["snapshot_prev"] and r["snapshot_prev"] == before["snapshot_current"]
    assert r["card_version_id"] == before["prev_card_version_id"]
    # 되돌려 놓기: shadow → canary → ga(승인)
    for st in ("canary",):
        assert httpx.post(B + "/deploys/dp-nw-farm-25/rollout", headers=a, json={"stage": st}, timeout=30).status_code == 200
    httpx.post(B + "/deploys/dp-nw-farm-25/approve", headers=a, json={"decision": "approve", "reason": "test restore"}, timeout=30)
    httpx.post(B + "/deploys/dp-nw-farm-25/rollout", headers=a, json={"stage": "ga"}, timeout=30)
    httpx.post(B + "/deploys/dp-nw-farm-25/rollback", headers=a, json={}, timeout=30)       # 버전 되돌림(2.0 → 2.1)
    httpx.post(B + "/deploys/dp-nw-farm-25/rollout", headers=a, json={"stage": "canary"}, timeout=30)
    httpx.post(B + "/deploys/dp-nw-farm-25/approve", headers=a, json={"decision": "approve", "reason": "test restore 2"}, timeout=30)
    after = httpx.post(B + "/deploys/dp-nw-farm-25/rollout", headers=a, json={"stage": "ga"}, timeout=30).json()
    assert after["card_version_id"] == before["card_version_id"] and after["snapshot_current"] == before["snapshot_current"]


def test_audit_log_written(live):
    import psycopg
    from landxi_api import config
    with psycopg.connect(config.PG_ADMIN_DSN) as c:
        n = c.execute("SELECT count(*) FROM audit_log WHERE action LIKE 'deploy.%'").fetchone()[0]
    assert n > 0
