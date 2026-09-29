"""core-flow(코어 ④) — 관리-생산-서비스 한 흐름을 어느 시군구에서나.

① 배포본 지역 = sgg_cd(백필 · 새 적용 필수) ② 적용 → 결재 → 영상 없으면 '영상 등록 필요'(실행 0 · 직원 할 일)
③ 결재 → 영상 → AI 분석 작업 → 결과 스냅샷 → 실태조사 → done 이 같은 deploy_id·job_id 로 감사 기록에 이어진다(계약 호출부 모의 · GPU 0)
④ summary 가 작업 결과 세트(results/{기관}/{작업})를 손 설정 없이 센다 ⑤ LX 관리자 흐름 한 줄(/ops/flows · 관리자 전용).
판정 지역 인자(시험 파일 예외): 기준 남원 52190 · 새 지역 여수 12130(옛 46130).
"""
import asyncio
import json
import time

import httpx
import psycopg
import pytest

from conftest import B, H
from landxi_api import config

NAMWON, YEOSU, YEOSU_OLD = "52190", "12130", "46130"


def adm():
    return psycopg.connect(config.PG_ADMIN_DSN, autocommit=True)


def _cleanup(did: str):
    with adm() as c:
        c.execute("DELETE FROM approvals WHERE subject_type='deploy' AND subject_id=%s", (did,))
        c.execute("DELETE FROM jobs WHERE deploy_id=%s AND coalesce(test,false)", (did,))
        c.execute("DELETE FROM audit_log WHERE subject=%s", (did,))
        c.execute("DELETE FROM deploys WHERE id=%s AND coalesce(test,false)", (did,))


# ── ① 지역 = sgg_cd ─────────────────────────────────────────────────────────
def test_backfill_domestic_deploys_have_sgg():
    with adm() as c:
        rows = c.execute("SELECT id, sgg_cd, ST_XMin(aoi), ST_XMax(aoi), ST_YMin(aoi), ST_YMax(aoi) FROM deploys WHERE NOT coalesce(test,false)").fetchall()
    dom = [r for r in rows if r[2] >= 124 and r[3] <= 132.5 and r[4] >= 32.5 and r[5] <= 39.5]
    assert dom
    assert all(r[1] for r in dom), [r[0] for r in dom if not r[1]]
    # 기준 지역 배포본(남원 기관)은 남원 코드
    with adm() as c:
        nw = c.execute("SELECT DISTINCT sgg_cd FROM deploys WHERE tenant_id='namwon'").fetchall()
    assert {r[0] for r in nw} == {NAMWON}


def test_backfill_idempotent():
    from seed.backfill_deploy_sgg import run
    assert all(x["sgg_cd"] is None for x in run(dry=True)), "두 번째 실행에서 채울 것이 남으면 안 된다(해외만 비움)"


def test_port_domestic_needs_region(live, tok):
    r = httpx.post(B + "/deploys", json={"card_id": "card-farm", "region_profile": "namwon", "test": True}, headers=H(tok["staff"]), timeout=30)
    assert r.status_code == 400, r.text


def test_port_old_code_is_saved_as_current(live, tok):
    r = httpx.post(B + "/deploys", json={"card_id": "card-farm", "region": YEOSU_OLD, "test": True}, headers=H(tok["staff"]), timeout=60)
    assert r.status_code == 201, r.text
    d = r.json()
    try:
        assert d["sgg_cd"] == YEOSU
        assert d["tenant_id"] == "gwangju-jeonnam"           # 관할 기관 자동(regions.yaml tenants)
        assert d["flow"]["state"] == "approval"
        assert "이식" not in d["name"] and "심기" not in d["name"]
    finally:
        _cleanup(d["id"])


# ── ② 영상 없는 시군구 = 실행 0 + 영상 등록 필요 ─────────────────────────────
def _no_imagery_region(tok) -> str:
    j = httpx.get(B + "/regions", params={"has_imagery": 0}, headers=H(tok["staff"]), timeout=60).json()
    cands = [x for x in j["items"] if not x["has_imagery"] and x["sgg_cd"][:2] in ("41", "47", "48", "11")]
    assert cands, "로컬 영상 없는 시군구가 있어야 한다"
    return cands[0]["sgg_cd"]


def test_no_imagery_region_stays_as_staff_todo(live, tok):
    sgg = _no_imagery_region(tok)
    r = httpx.post(B + "/deploys", json={"card_id": "card-farm", "region": sgg, "test": True}, headers=H(tok["staff"]), timeout=60)
    assert r.status_code == 201, r.text
    d = r.json()
    try:
        assert d["flow"]["has_imagery"] is False and d["flow"]["todo"] == "영상 등록"
        a = httpx.post(B + f"/approvals/{d['approval_id']}/decide", json={"decision": "approve"}, headers=H(tok["admin"]), timeout=60)
        assert a.status_code == 200, a.text
        f = None
        for _ in range(40):
            f = httpx.get(B + f"/deploys/{d['id']}/flow", headers=H(tok["admin"]), timeout=30).json()
            if f["flow"]["state"] not in ("approval", "starting"):
                break
            time.sleep(0.5)
        assert f["flow"]["state"] == "need_imagery", f["flow"]
        assert f["flow"]["label"] == "영상 등록 필요" and f["flow"]["todo"] == "영상 등록"
        assert f["stage"] == "draft"                         # 실행 없이 직원 할 일(적용 요청)로 남는다
        assert f["analysis"] is None
        with adm() as c:
            n = c.execute("SELECT count(*) FROM jobs WHERE deploy_id=%s", (d["id"],)).fetchone()[0]
            acts = [x[0] for x in c.execute("SELECT action FROM audit_log WHERE subject=%s ORDER BY at", (d["id"],)).fetchall()]
        assert n == 0
        assert acts[0] == "deploy.port" and "flow.need_imagery" in acts
        # 다시 실행도 같은 판정(영상 없음)
        rr = httpx.post(B + f"/deploys/{d['id']}/flow", json={}, headers=H(tok["staff"]), timeout=60)
        assert rr.status_code == 200 and rr.json()["flow"]["state"] == "need_imagery"
    finally:
        _cleanup(d["id"])


# ── ③ 한 흐름(계약 호출부 모의 · GPU 0) ───────────────────────────────────────
def test_flow_chain_same_ids_mocked():
    """결재 → 영상 → POST /jobs(모의) → 작업 done → 스냅샷 → POST /survey/build(모의) → 실태조사 작업 done → done.
    모든 단계의 감사 기록이 같은 deploy_id · job_id 로 이어진다. 판정은 실연결(보고서)이고 여기서는 흐름 기계만 본다."""
    from landxi_api import deploys as dp
    from landxi_api import deps
    did = "dp-pytest-flow-" + str(int(time.time()))
    jid = "job_" + "0" * 20 + str(int(time.time()))[-6:]
    sj = "job_" + "1" * 20 + str(int(time.time()))[-6:]
    calls = []

    async def fake_route(method, path, body, p):
        calls.append((method, path, body))
        if path == "/jobs":
            async with deps.db(realm="lx") as conn:
                await conn.execute("INSERT INTO jobs(id, tenant_id, submitted_by, kind, state, priority, pool, deploy_id, card_id, result_set, test, label) "
                                   "VALUES ($1,'lx',$2,'infer','done',0,'a6000',$3,'card-farm',$4,true,'pytest flow')",
                                   jid, p.user_id, body["deploy_id"], f"results/lx/{jid}")
            return {"job": {"id": jid, "result_set": f"results/lx/{jid}"}}
        if path == "/survey/build":
            async with deps.db(realm="lx") as conn:
                await conn.execute("INSERT INTO jobs(id, tenant_id, submitted_by, kind, state, priority, pool, deploy_id, test, label, counts) "
                                   "VALUES ($1,'lx',$2,'survey','done',0,'cpu',$3,true,'pytest survey',$4)", sj, p.user_id, did, {"A": 3})
            return {"job": {"id": sj}, "state": "queued"}
        raise AssertionError(path)

    async def fake_img(sgg, geom=None):
        return {"imagery_id": "ap25-namwon-2023", "gsd_m": 0.25, "year": 2023, "coverage": 1.0, "source": "local"}

    async def run():
        from landxi_api.regions import regions_base
        from shapely.geometry import mapping
        _, geoms, _ = regions_base()
        async with deps.db(realm="lx") as conn:
            await conn.execute(
                "INSERT INTO deploys(id, name, tenant_id, card_id, card_version_id, region_name, aoi, stage, gpu_pool, modules, year, basis, sgg_cd, test, flow) "
                "VALUES ($1,'pytest','lx','card-farm','card-farm@2.1',$2,ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($3),4326)),'draft','a6000',$4,2026,"
                "'measured',$5,true,$6)", did, {"ko": "pytest"}, json.dumps(mapping(geoms[NAMWON])),
                {"core": dp.CORE, "ext": {"mod-farm-parcel": True}}, NAMWON, dp._flow_new("approval"))
            await conn.execute("INSERT INTO approvals(id, subject_type, subject_id, requested_by, decided_by, decision, state, payload, at, decided_at) "
                               "VALUES ($1,'deploy',$2,'u_lx_staff','u_lx_admin','approve','decided',$3,now(),now())",
                               "ap_pytest_" + did[-6:], did, {"action": "port"})
        o_route, o_img = dp._call_route, dp.best_imagery
        dp._call_route, dp.best_imagery = fake_route, fake_img
        try:
            f = await dp.flow_start(did, "u_lx_admin")
            assert f["state"] == "analyzing" and f["job_id"] == jid
            await dp.flow_tick({did})                             # 작업 done → 스냅샷 → survey/build
            await dp.flow_tick({did})                             # 실태조사 작업 done → done
            async with deps.db(realm="lx") as conn:
                d = await conn.fetchrow("SELECT stage, snapshot_current, flow FROM deploys WHERE id=$1", did)
                aud = await conn.fetch("SELECT action, after FROM audit_log WHERE subject=$1 ORDER BY id", did)
            return d, aud
        finally:
            dp._call_route, dp.best_imagery = o_route, o_img
            await deps.close()

    try:
        d, aud = asyncio.run(run())
        assert d["stage"] == "shadow"                              # 결재 통과 + 영상 있음 = 시범
        assert d["snapshot_current"] == f"results/lx/{jid}"
        assert d["flow"]["state"] == "done", d["flow"]
        jobs_call = next(b for m, p, b in calls if p == "/jobs")
        assert jobs_call["options"]["scope"] == "sgg" and jobs_call["options"]["sgg_cd"] == NAMWON and jobs_call["deploy_id"] == did
        sv = next(b for m, p, b in calls if p == "/survey/build")
        assert sv["sgg_cd"] == NAMWON and sv["job_id"] == jid
        acts = [a["action"] for a in aud]
        for want in ("deploy.rollout", "flow.analyze", "flow.result", "flow.survey", "flow.done"):
            assert want in acts, acts
        linked = [a for a in aud if a["action"].startswith("flow.")]
        assert all((a["after"] or {}).get("deploy_id") == did for a in linked)
        assert all((a["after"] or {}).get("job_id") == jid for a in linked if a["action"] in ("flow.analyze", "flow.result", "flow.survey", "flow.done"))
    finally:
        with adm() as c:
            c.execute("DELETE FROM jobs WHERE id = ANY(%s)", ([jid, sj],))
            c.execute("DELETE FROM approvals WHERE subject_id=%s", (did,))
            c.execute("DELETE FROM audit_log WHERE subject=%s", (did,))
            c.execute("DELETE FROM deploys WHERE id=%s", (did,))


# ── ④ summary 가 작업 결과 세트를 센다 ─────────────────────────────────────────
def test_summary_counts_job_result_set():
    from landxi_api.summary import canonical
    j = "job_01M3PAZR4AZHAB8P56XKGNG8RD"
    assert canonical(f"results/lx/{j}") == j
    assert canonical(f"results/gwangju-jeonnam/{j}") == j
    assert canonical("results/namwon/dp-nw-farm-25@2.1") == "results/lx/namwon-farmland-2025"   # 옛 별칭 그대로(회귀 0)


def test_summary_namwon_unchanged_by_backfill(live, tok):
    """기준 지역: 백필 뒤에도 같은 수치 — summary 항목의 AI 탐지 = 그 배포본 스냅샷 결과 행 수(원천 직접 셈)."""
    from landxi_api.summary import canonical
    j = httpx.get(B + "/summary", params={"region": NAMWON}, headers=H(tok["admin"]), timeout=60).json()
    farm = next(i for i in j["items"] if i["card"] == "card-farm" and i["tenant"] == "namwon")
    with adm() as c:
        snap = c.execute("SELECT snapshot_current FROM deploys WHERE id='dp-nw-farm-25'").fetchone()[0]
        n = c.execute("SELECT count(*) FROM detections WHERE job_id=%s", (canonical(snap),)).fetchone()[0]
    assert farm["sgg_cd"] == NAMWON and farm["metrics"]["detected"]["value"] == n


# ── ⑤ LX 관리자 흐름 한 줄 ──────────────────────────────────────────────────
def test_ops_flows_admin_only(live, tok):
    assert httpx.get(B + "/ops/flows", headers=H(tok["staff"]), timeout=30).status_code == 403
    r = httpx.get(B + "/ops/flows", headers=H(tok["admin"]), timeout=60)
    assert r.status_code == 200, r.text
    for it in r.json()["items"]:
        assert {"flow", "analysis", "usage", "gpu_s", "stage", "audit"} <= set(it)


def test_lineage_has_no_region_literals(live, tok):
    j = httpx.get(B + "/registry/lineage/dp-nw-farm-25", headers=H(tok["admin"]), timeout=30).json()
    assert not any(c.get("id") == "P4-2026-09-24" for c in j["chain"])
    src = (config.SERVER_ROOT / "landxi_api" / "registry.py").read_text(encoding="utf-8")
    assert "dp-nw-farm-25" not in src and "남원" not in src
