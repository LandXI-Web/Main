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
    """기관 영상 층 — 원본 · 동적 타일은 LX 관리자가 그 기관에 공유한 영상만(구현 확인 2차 J-16 완료 · 10-01 결정 '공유하면 그 기관 지도에도 보임' ·
    원칙 94). 공유 안 된 영상 · 다른 기관 공유분 · LX 전용 세트는 0, 공유분도 서명 주소로만(원본 경로 · 바로 열리는 주소 없음)."""
    shared = {}
    for t in ("namwon", "gwangju-jeonnam"):
        s = httpx.get(B + f"/tenants/{t}/imagery-shares", headers=H(tok["admin"]), timeout=60).json()
        shared[t] = {x["id"] for x in s["items"] if x["shared"]}
    for key, t in (("namwon", "namwon"), ("gj", "gwangju-jeonnam")):
        j = httpx.get(B + "/catalog/layers", headers=H(tok[key]), timeout=60).json()
        assert j["build"] == "tenant"
        raw = [i for i in j["items"] if i["tier"] == "raw" or i["source"] == "cog"]
        assert all(i["id"] in shared[t] for i in raw), [i["id"] for i in raw if i["id"] not in shared[t]]   # 공유한 영상만
        assert all(i["signed"] and not i.get("url") and not i.get("path") and i["set"] == f"cog/{i['id']}" for i in raw)
        others = set().union(*(v for k, v in shared.items() if k != t)) - shared[t]
        assert not [i for i in j["items"] if i["role"] == "imagery" and i["id"] in others]   # 다른 기관에만 공유한 영상 0(참조 층은 공유 대상 아님)
        assert not [i for i in j["items"] if i["set"] in ("imagery/axis_iksan_hwangdeung", "results/lx/axis-hwangdeung-gt")]   # LX 전용 세트 0


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
    """S-7: 이식(draft) → 심기 결재 → shadow → canary → ga(승인) · 롤백 왕복. 시험 행은 끝에서 지운다(관제 결재함 오염 0)."""
    import psycopg
    from landxi_api import config
    a = H(tok["admin"])
    aoi = {"type": "Polygon", "coordinates": [[[74.20, 42.80], [74.45, 42.80], [74.45, 42.95], [74.20, 42.95], [74.20, 42.80]]]}
    r = httpx.post(B + "/deploys", headers=a, json={"from_deploy_id": "dp-nw-change", "tenant_id": "kgz-land", "region_profile": "kgz-sokuluk",
                                                   "aoi": aoi, "name": "소쿨룩 시가지 변화 · 2026 (테스트)", "gpu_pool": "cpu", "year": 2026,
                                                   "id": "dp-kgz-land-change-26-test", "test": True}, timeout=30)
    assert r.status_code == 201, r.text
    d = r.json()
    did = d["id"]
    before = httpx.get(B + "/deploys/dp-nw-farm-25", headers=a, timeout=30).json()
    t0 = None
    with psycopg.connect(config.PG_ADMIN_DSN) as c:
        t0 = c.execute("SELECT now()").fetchone()[0]
    try:
        assert d["stage"] == "draft" and d["card_version_id"] == "card-change@1.0" and d["from_deploy_id"] == "dp-nw-change" and d["approval_id"]
        r = httpx.post(B + f"/deploys/{did}/rollout", headers=a, json={"stage": "ga"}, timeout=30)
        assert r.status_code == 409 and r.json()["error"]["code"] == "invalid_stage_transition"
        r = httpx.post(B + f"/deploys/{did}/rollout", headers=a, json={"stage": "shadow"}, timeout=30)
        assert r.status_code == 409 and r.json()["error"]["code"] == "approval_required"          # 심기 결재 전
        # 요청한 관리자는 스스로 결재할 수 없다(impl-1 R&R) — 다른 관리자(시험 안에서만 쓰는 두 번째 관리자 계정)가 결재.
        # (관리자 계정이 하나뿐이면 스스로 결재가 열린다 — 10-01 사용자 결정 · test_impl2_cleanup.py. 여기는 두 관리자일 때의 규칙)
        from conftest import drop_account, temp_account
        uid2, t2 = temp_account("lx", "u_pytest_guard_admin2", "pytest-guard-admin2@lx.or.kr", "admin", name="시험 관리자")
        try:
            assert httpx.post(B + f"/approvals/{d['approval_id']}/decide", headers=a, json={"decision": "approve"}, timeout=30).status_code == 409
            assert httpx.post(B + f"/approvals/{d['approval_id']}/decide", headers=H(t2), json={"decision": "approve"}, timeout=30).status_code == 200
        finally:
            drop_account("lx", uid2)
        for st in ("shadow", "canary"):
            assert httpx.post(B + f"/deploys/{did}/rollout", headers=a, json={"stage": st}, timeout=30).status_code == 200
        r = httpx.post(B + f"/deploys/{did}/rollout", headers=a, json={"stage": "ga"}, timeout=30)
        assert r.status_code == 409 and r.json()["error"]["code"] == "approval_required"
        assert httpx.post(B + f"/deploys/{did}/approve", headers=a, json={"decision": "approve", "reason": "test"}, timeout=30).status_code == 200
        assert httpx.post(B + f"/deploys/{did}/rollout", headers=a, json={"stage": "ga"}, timeout=30).json()["stage"] == "ga"
        r = httpx.post(B + f"/deploys/{did}/modules", headers=a, json={"ext": {"mod-auth": False}}, timeout=30)
        assert r.status_code == 400 and r.json()["error"]["code"] == "module_locked"
        # 롤백: 스냅샷 current ↔ prev
        r = httpx.post(B + "/deploys/dp-nw-farm-25/rollback", headers=a, json={}, timeout=30).json()
        assert r["stage"] == "rolled_back" and r["snapshot_current"] == before["snapshot_prev"] and r["snapshot_prev"] == before["snapshot_current"]
        assert r["card_version_id"] == before["prev_card_version_id"]
        # 되돌려 놓기: canary → ga(승인) → 버전 되돌림 → canary → ga
        assert httpx.post(B + "/deploys/dp-nw-farm-25/rollout", headers=a, json={"stage": "canary"}, timeout=30).status_code == 200
        httpx.post(B + "/deploys/dp-nw-farm-25/approve", headers=a, json={"decision": "approve", "reason": "test restore"}, timeout=30)
        httpx.post(B + "/deploys/dp-nw-farm-25/rollout", headers=a, json={"stage": "ga"}, timeout=30)
        httpx.post(B + "/deploys/dp-nw-farm-25/rollback", headers=a, json={}, timeout=30)       # 버전 되돌림(2.0 → 2.1)
        httpx.post(B + "/deploys/dp-nw-farm-25/rollout", headers=a, json={"stage": "canary"}, timeout=30)
        httpx.post(B + "/deploys/dp-nw-farm-25/approve", headers=a, json={"decision": "approve", "reason": "test restore 2"}, timeout=30)
        after = httpx.post(B + "/deploys/dp-nw-farm-25/rollout", headers=a, json={"stage": "ga"}, timeout=30).json()
        assert after["card_version_id"] == before["card_version_id"] and after["snapshot_current"] == before["snapshot_current"]
    finally:
        httpx.delete(B + f"/deploys/{did}", headers=a, timeout=30)
        with psycopg.connect(config.PG_ADMIN_DSN, autocommit=True) as c:        # 시험 결재 행(test restore) 정리 — S-9 시드 정리 기준
            c.execute("DELETE FROM approvals WHERE subject_id='dp-nw-farm-25' AND reason LIKE 'test restore%%' AND at >= %s", (t0,))
            c.execute("UPDATE deploys SET stage='ga' WHERE id='dp-nw-farm-25' AND stage <> 'ga'")


def test_audit_log_written(live):
    import psycopg
    from landxi_api import config
    with psycopg.connect(config.PG_ADMIN_DSN) as c:
        n = c.execute("SELECT count(*) FROM audit_log WHERE action LIKE 'deploy.%'").fetchone()[0]
    assert n > 0
