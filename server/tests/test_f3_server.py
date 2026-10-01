"""F3 최종 명세 §3 서버 변경 S-1…S-12 — 실서버(:8700) e2e. 시험 데이터는 전부 test 표시 + 끝에서 지운다(지어낸 대장·배포가 화면에 남지 않게).

GPU 0: 학습(train)은 견적·거절 경로만(실제 학습 제출 없음) · 에이전트는 범위 가드(LLM 전 거절)만 · 타일 작업은 CPU.
"""
import asyncio
import csv
import io
import json
import time
import uuid
from pathlib import Path

import httpx
import psycopg
import pytest

from conftest import B, BASE, H
from landxi_api import config
from landxi_api.envelope import is_env, scan


def adm():
    return psycopg.connect(config.PG_ADMIN_DSN, autocommit=True)


def envok(o):
    scan(o)          # 봉투 없는 숫자 0
    return o


# ── S-1 공개 기관 디렉터리 ────────────────────────────────────────────────
def test_s1_public_tenants(live):
    r = httpx.get(B + "/auth/tenants", timeout=20)
    assert r.status_code == 200
    ids = {t["id"] for t in r.json()["items"]}
    assert {"namwon", "gwangju-jeonnam"} <= ids and "lx-demo" not in ids and "lx" not in ids
    for t in r.json()["items"]:
        assert set(t) == {"id", "name", "scope"} and t["scope"] in ("local", "global") and t["name"]["ko"]


# ── S-3 전국 지역 ─────────────────────────────────────────────────────────
def test_s3_regions_public_and_scoped(live, tok):
    g = httpx.get(B + "/regions?public=1", timeout=60).json()
    envok(g)
    assert is_env(g["total"]) and g["total"]["value"] >= 250
    nw = next(x for x in g["items"] if x["sgg_cd"] == "52190")
    assert len(nw["bbox"]) == 4 and "n_findings" not in nw
    s = httpx.get(B + "/regions", headers=H(tok["staff"]), timeout=60).json()
    envok(s)
    nw = next(x for x in s["items"] if x["sgg_cd"] == "52190")
    assert nw["n_findings"]["value"] > 0 and nw["in_scope"] is True
    q = httpx.get(B + "/regions?q=남원", headers=H(tok["staff"]), timeout=30).json()
    assert [x["sgg_cd"] for x in q["items"]] == ["52190"]
    gj = httpx.get(B + "/regions", headers=H(tok["gj"]), timeout=60).json()
    assert gj["items"] and all(x["in_scope"] for x in gj["items"])              # 원칙 39 — 기관 목록 = 관할 시군구만
    assert not [x for x in gj["items"] if x["sgg_cd"] == "52190"]               # 관할 밖(남원)은 목록에 한 줄도 없다
    assert httpx.get(B + "/regions/52190", headers=H(tok["gj"]), timeout=30).status_code == 404
    d = httpx.get(B + "/regions/52190", headers=H(tok["staff"]), timeout=30).json()
    envok(d)
    assert d["parcels"]["value"] > 300000 and isinstance(d["imagery"], list)
    assert httpx.get(B + "/regions/52190", timeout=30).json().get("imagery") is None        # 게스트: 영상 목록 0
    assert httpx.get(B + "/regions/99999", timeout=30).status_code == 404


# ── S-4 공개 통계·표본·공개 타일 ─────────────────────────────────────────
def test_s4_public_stats_sample_tiles(live):
    s = httpx.get(B + "/public/stats?set=river-occupy&by=sigungu", timeout=30).json()
    envok(s)
    assert s["total"]["value"] == 651478 and s["n_sgg"]["value"] == 252 and len(s["items"]) == 252 and s["export_policy"] == "public"
    assert sum(i["value"]["value"] for i in s["items"]) == 651478
    g = httpx.get(B + "/public/stats?set=river-occupy&by=sigungu&geom=1", timeout=60).json()
    assert len(g["geojson"]["features"]) == 252
    assert httpx.get(B + "/public/stats?set=nope", timeout=10).status_code == 404
    p = httpx.get(B + "/public/sample-parcel", timeout=30).json()
    envok(p)
    assert p["pnu_masked"].endswith("-****-****") and "pnu" not in p and p["verdict"] == "현장 확인 필요"
    assert not any(ch.isdigit() for ch in p["place"].split()[-1])                    # 주소는 리까지(지번 0)
    assert p["ai"]["n"]["value"] >= 1 and p["parcel"]["geometry"]["type"] in ("Polygon", "MultiPolygon")
    h = httpx.head(BASE + "/tiles/pmtiles/public/river-occupy.pmtiles", timeout=10)
    assert h.status_code == 200                                                      # 서명 면제
    assert httpx.get(BASE + "/tiles/xyz/public/river-occupy/6/54/25.pbf", timeout=10).status_code in (200, 204)
    assert httpx.get(BASE + "/tiles/xyz/public/../x/1/1/1.pbf", timeout=10).status_code in (400, 404)


# ── S-2 대장 반입·융합·판정·조치 ──────────────────────────────────────────
def _ledger_csv() -> tuple[bytes, list[str]]:
    with adm() as c:
        rows = c.execute("SELECT pnu, addr FROM survey_parcels WHERE a23_bld_in_m2 >= 60 AND jimok IN ('전','답') ORDER BY pnu LIMIT 10").fetchall()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["필지고유번호", "소재지", "경작여부", "작물", "성명", "연락처"])
    pnus = []
    for i, (pnu, addr) in enumerate(rows):
        if i < 5:
            w.writerow([pnu, "", "경작", "벼", "홍길동", "010-0000-0000"])
        else:
            w.writerow(["", addr.replace("전북특별자치도 ", ""), "자경", "고추", "김아무개", "010-1111-2222"])
        pnus.append(pnu)
    w.writerow(["", "남원시 없는면 없는리 99999-1", "경작", "", "", ""])
    w.writerow(["123", "", "경작", "", "", ""])
    return buf.getvalue().encode("utf-8-sig"), pnus


def _cleanup_import(iid: str):
    with adm() as c:
        fids = [r[0] for r in c.execute("SELECT id FROM survey_findings WHERE import_id=%s", (iid,)).fetchall()]
        if fids:
            c.execute("DELETE FROM survey_finding_events WHERE finding_id = ANY(%s)", (fids,))
            c.execute("DELETE FROM survey_actions WHERE finding_id = ANY(%s)", (fids,))
            c.execute("DELETE FROM feedback WHERE fid = ANY(%s)", (fids,))
            c.execute("DELETE FROM finding_verdicts WHERE finding_id = ANY(%s)", (fids,))
            c.execute("DELETE FROM survey_findings WHERE id = ANY(%s)", (fids,))
        c.execute("DELETE FROM registry_snapshots WHERE import_id=%s", (iid,))
        c.execute("DELETE FROM ledger_imports WHERE id=%s", (iid,))


# 대장 시험은 실기관(namwon · gwangju-jeonnam)이 아니라 시험 기관(lx-demo · 영업 계량 기관 · 공개 디렉터리 제외)에서 돈다.
# 시험 계정은 여기서 만들고 끝에서 지운다 — 실서버 pytest 가 다른 팀·기관의 대장 의심을 지우지 않게.
T = "lx-demo"
T_LOGIN = "pytest-ledger"


@pytest.fixture(scope="module")
def ttok(live):
    with adm() as c:
        pw = c.execute("SELECT pw_hash FROM tenant_users WHERE id='u_namwon_mail_lxadmin'").fetchone()[0]     # 메일 계정과 같은 시험 비밀번호(원칙 77)
        c.execute("INSERT INTO tenant_users(id, tenant_id, login, pw_hash, role, status, name) VALUES ('u_pytest_ledger',%s,%s,%s,'manager','active','시험 담당자') "
                  "ON CONFLICT (id) DO UPDATE SET status='active', pw_hash=EXCLUDED.pw_hash", (T, T_LOGIN, pw))
    t = httpx.post(B + "/auth/login", json={"realm": "tenant", "tenant_id": T, "login": T_LOGIN, "password": config.DEV_PASSWORD}, timeout=30)
    t.raise_for_status()
    yield t.json()["token"]
    with adm() as c:
        for (iid,) in c.execute("SELECT id FROM ledger_imports WHERE tenant_id=%s", (T,)).fetchall():
            _cleanup_import(iid)
        c.execute("DELETE FROM sessions WHERE user_id='u_pytest_ledger'")
        c.execute("DELETE FROM tenant_users WHERE id='u_pytest_ledger'")


def _real_ledger_state() -> dict:
    """실기관 대장 의심 스냅샷 — (기관, 규칙, 반입, 상태) → 건수 · 반입 행 수 · 최신 반입."""
    with adm() as c:
        f = {f"{t}|{r}|{i}|{s}": n for t, r, i, s, n in c.execute(
            "SELECT tenant_id, rule, import_id, state, count(*) FROM survey_findings WHERE rule LIKE 'L%%' AND tenant_id <> %s GROUP BY 1,2,3,4", (T,)).fetchall()}
        imp = {i: (lt, st) for i, lt, st in c.execute("SELECT id, latest, state FROM ledger_imports WHERE tenant_id <> %s", (T,)).fetchall()}
    return {"findings": f, "imports": imp}


def test_s2_ledger_flow(live, tok, ttok):
    before = _real_ledger_state()
    try:
        _ledger_flow(tok, ttok)
    finally:
        after = _real_ledger_state()
    assert after == before                                                             # 실기관 대장 의심 · 반입 상태 그대로


def _ledger_flow(tok, ttok):
    nw, gj = H(ttok), H(tok["gj"])
    raw, pnus = _ledger_csv()
    r = httpx.post(B + f"/t/{T}/survey/registry/import", headers=nw, files={"file": ("농지대장-시험.csv", raw, "text/csv")},
                   data={"kind": "farm_ledger"}, timeout=60)
    assert r.status_code == 202, r.text
    j = envok(r.json())
    iid = j["import_id"]
    try:
        assert j["rows"]["value"] == 12
        assert set(j["dropped"]) == {"성명", "연락처"}                                     # 성명·연락처 = 이름만 기록 · 값 저장 0
        assert j["columns_guess"]["필지고유번호"] == "pnu" and j["columns_guess"]["소재지"] == "jibun" and j["columns_guess"]["경작여부"] == "status"
        assert all("성명" not in s for s in j["sample"])
        # 타 기관 403(관문 · RLS)
        assert httpx.get(B + f"/t/{T}/survey/registry/{iid}", headers=gj, timeout=20).status_code == 403
        assert httpx.post(B + f"/t/{T}/survey/registry/import", headers=gj, files={"file": ("x.csv", raw, "text/csv")}, timeout=20).status_code == 403
        # 성명 열을 매핑하면 400
        bad = httpx.post(B + f"/t/{T}/survey/registry/{iid}/confirm", headers=nw, json={"mapping": {"pnu": "필지고유번호", "status": "성명"}}, timeout=20)
        assert bad.status_code == 400
        c = httpx.post(B + f"/t/{T}/survey/registry/{iid}/confirm", headers=nw, json={}, timeout=30)
        assert c.status_code == 202, c.text
        for _ in range(120):
            v = httpx.get(B + f"/t/{T}/survey/registry/{iid}", headers=nw, timeout=20).json()
            if v["state"] in ("matched", "failed"):
                break
            time.sleep(0.5)
        envok(v)
        assert v["state"] == "matched", v.get("error")
        assert v["matched"]["value"] == 10 and v["by_step"]["pnu"]["value"] == 5 and v["by_step"]["jibun"]["value"] == 5
        assert v["matched_pct"]["value"] == pytest.approx(83.3, abs=0.1) and v["matched_pct"]["basis"] == "measured"
        assert {u["seq"] for u in v["unmatched"]} == {11, 12} and all(u["reason"] for u in v["unmatched"])
        assert v["findings"]["L1"]["value"] >= 1                                           # 대장 농지 위 건물(AI ≥ 33㎡)
        with adm() as a:
            keys = {k for (p,) in a.execute("SELECT payload FROM registry_snapshots WHERE import_id=%s", (iid,)).fetchall() for k in p}
        assert keys <= {"pnu", "jibun", "status", "use"}                                  # allowlist 역할만
        # 조회: findings?ledger · stats?ledger · parcels?with=ledger
        f = envok(httpx.get(B + f"/survey/findings?rule=L1&ledger={iid}", headers=nw, timeout=30).json())
        assert f["total"]["value"] == v["findings"]["L1"]["value"] and all(it["rule"] == "L1" for it in f["items"])
        fid, pnu = f["items"][0]["id"], f["items"][0]["pnu"]
        st = envok(httpx.get(B + f"/survey/stats?by=emd&ledger={iid}", headers=H(tok["staff"]), timeout=30).json())   # 읍면 표 = 남원 적재(시험 기관은 LX 화면으로 본다)
        assert sum(x["ledger_matched"]["value"] for x in st["items"]) == 10
        pc = httpx.get(B + f"/survey/parcels/{pnu}?with=ledger,findings", headers=H(tok["staff"]), timeout=30)   # 연속지적 = 남원 적재분(RLS)
        assert pc.status_code == 200, pc.text[:300]
        pc = envok(pc.json())
        assert pc["ledger"] and pc["ledger"][0]["kind"] == "farm_ledger" and "성명" not in json.dumps(pc["ledger"], ensure_ascii=False)
        d = envok(httpx.get(B + f"/survey/findings/{fid}", headers=nw, timeout=30).json())
        assert set(d["explain"]["three"]) == {"ledger", "ai", "vworld"}                    # 대장 · AI · V-World 세 값 나란히
        assert httpx.get(B + f"/survey/findings?rule=L1&ledger={iid}", headers=gj, timeout=30).json()["total"]["value"] == 0
        # 상태 확장: (배정 없음 · 원칙 40) open → inspected → closed(match_fp) → 피드백 자동 · 조치 1줄
        for body in ({"state": "inspected", "note": "현장 확인"},):
            assert httpx.post(B + f"/survey/findings/{fid}/state", headers=nw, json=body, timeout=30).status_code == 200
        assert httpx.post(B + f"/survey/findings/{fid}/state", headers=nw, json={"state": "closed"}, timeout=30).json()["error"]["code"] == "verdict_required"
        cl = envok(httpx.post(B + f"/survey/findings/{fid}/state", headers=nw, json={"state": "closed", "verdict": "match_fp", "verdict_code": "FP-01",
                                                                                     "note": "농막(허가)"}, timeout=30).json())
        assert cl["verdict"] == "match_fp" and cl["feedback_id"]
        a = httpx.post(B + "/survey/actions", headers=nw, json={"finding_id": fid, "kind": "revisit", "due": "2026-10-15", "note": "재방문"}, timeout=30)
        assert a.status_code == 201 and a.json()["kind"] == "revisit"
        assert any(x["id"] == a.json()["id"] for x in httpx.get(B + f"/survey/actions?finding_id={fid}", headers=nw, timeout=30).json()["items"])
        rs = envok(httpx.get(B + "/survey/rules/L1/stats", headers=H(tok["staff"]), timeout=30).json())
        assert rs["verdicts"]["match_fp"]["value"] >= 1 and rs["precision"]["unit"] == "%"
        rc = envok(httpx.post(B + "/survey/rules/L1/recalibrate", headers=H(tok["staff"]), json={}, timeout=30).json())
        assert rc["proposed"]["value"] is None and rc["need"]["tp"]["value"] > 0             # 표본 부족 — 지어내지 않음
        # 기관 오버라이드(에이전트 ledger_rule 이 승인 뒤 부르는 길)
        ev = envok(httpx.post(B + f"/t/{T}/survey/rules/evaluate", headers=nw, json={"rule": "L1", "thresholds": {"L1_bld_m2": 5000}}, timeout=60).json())
        assert ev["findings"]["L1"]["value"] == 0
        # 반입 철회 — open 의심·대장 행 삭제(판정 붙은 건 보존)
        dl = envok(httpx.delete(B + f"/t/{T}/survey/registry/{iid}", headers=nw, timeout=30).json())
        assert dl["rows_removed"]["value"] == 12
    finally:
        _cleanup_import(iid)
    assert httpx.get(B + "/survey/findings?rule=L1", headers=nw, timeout=30).json()["total"]["value"] == 0   # 시험 기관 의심 0


def _import_and_match(h, raw) -> str:
    r = httpx.post(B + f"/t/{T}/survey/registry/import", headers=h, files={"file": ("농지대장-시험.csv", raw, "text/csv")},
                   data={"kind": "farm_ledger"}, timeout=60)
    assert r.status_code == 202, r.text
    iid = r.json()["import_id"]
    assert httpx.post(B + f"/t/{T}/survey/registry/{iid}/confirm", headers=h, json={}, timeout=30).status_code == 202
    for _ in range(120):
        v = httpx.get(B + f"/t/{T}/survey/registry/{iid}", headers=h, timeout=20).json()
        if v["state"] in ("matched", "failed"):
            break
        time.sleep(0.5)
    assert v["state"] == "matched", v.get("error")
    return iid


def _live_l(iid):
    with adm() as c:
        return dict(c.execute("SELECT rule, count(*) FROM survey_findings WHERE import_id=%s GROUP BY 1", (iid,)).fetchall())


def test_s2_reimport_supersedes_and_delete_restores(live, tok, ttok):
    """S-2 정합성 — 같은 기관·같은 종류의 새 반입이 이전 반입 의심을 갈아 끼우고, 반입 행의 findings{L*} = survey_findings 실시간 집계(한 출처).
    최신 반입을 지우면 이전 반입이 최신으로 돌아오며 의심도 다시 판정된다. 실기관 상태는 그대로."""
    before = _real_ledger_state()
    h = H(ttok)
    raw, _ = _ledger_csv()
    a = b = None
    try:
        a = _import_and_match(h, raw)
        n_a = _live_l(a).get("L1", 0)
        assert n_a >= 1
        b = _import_and_match(h, raw)
        assert _live_l(a).get("L1", 0) == 0 and _live_l(b).get("L1", 0) == n_a              # 이전 반입의 open 의심 → 새 반입으로
        items = {x["import_id"]: x for x in httpx.get(B + f"/t/{T}/survey/registry", headers=h, timeout=30).json()["items"]}
        assert items[a]["findings"]["L1"]["value"] == 0 and items[b]["findings"]["L1"]["value"] == n_a   # 보고 수 = 실제 수
        assert items[b]["latest"] and not items[a]["latest"]
        dl = httpx.delete(B + f"/t/{T}/survey/registry/{b}", headers=h, timeout=60)
        assert dl.status_code == 200, dl.text[:300]
        b = None
        va = httpx.get(B + f"/t/{T}/survey/registry/{a}", headers=h, timeout=30).json()
        assert va["latest"] and va["findings"]["L1"]["value"] == _live_l(a).get("L1", 0) == n_a    # 이전 최신 복귀 + 재판정
    finally:
        for x in (a, b):
            if x:
                _cleanup_import(x)
    assert _real_ledger_state() == before


def test_s2_rule_activate_approval(live, tok):
    st, ad = H(tok["staff"]), H(tok["admin"])
    r = httpx.post(B + "/survey/rules/L3/activate", headers=st, json={"thresholds": {"L3_bld_m2": 12}, "note": "pytest"}, timeout=30)
    assert r.status_code == 202, r.text
    aid = r.json()["approval_id"]
    try:
        assert httpx.post(B + "/survey/rules/L3/activate", headers=st, json={}, timeout=30).status_code == 409      # 중복 대기 0
        ap = envok(httpx.get(B + "/approvals?state=pending", headers=ad, timeout=30).json())
        assert any(x["id"] == aid and x["kind"] == "rule" for x in ap["items"])
        assert httpx.post(B + f"/approvals/{aid}/decide", headers=st, json={"decision": "approve"}, timeout=30).status_code == 403
        d = httpx.post(B + f"/approvals/{aid}/decide", headers=ad, json={"decision": "reject", "reason": "pytest"}, timeout=30)
        assert d.status_code == 200 and d.json()["decision"] == "reject"
        assert httpx.post(B + f"/approvals/{aid}/decide", headers=ad, json={"decision": "approve"}, timeout=30).status_code == 409
    finally:
        with adm() as c:
            c.execute("DELETE FROM approvals WHERE id=%s", (aid,))
            c.execute("UPDATE survey_rules SET pending=NULL WHERE id='L3'")


# ── S-5 영상 등록 ─────────────────────────────────────────────────────────
def test_s5_register_imagery(live, tok):
    import numpy as np
    import rasterio
    from rasterio.transform import from_origin
    p = config.DATA_ROOT / "_tmp" / f"pytest-img-{uuid.uuid4().hex[:6]}.tif"
    p.parent.mkdir(parents=True, exist_ok=True)
    with rasterio.open(p, "w", driver="GTiff", width=200, height=200, count=3, dtype="uint8", crs="EPSG:5186",
                       transform=from_origin(262000, 312000, 0.25, 0.25)) as ds:
        ds.write(np.full((3, 200, 200), 120, dtype="uint8"))
    st = H(tok["staff"])
    iid = None
    try:
        assert httpx.post(B + "/catalog/imagery", headers=H(tok["namwon"]), json={"path": str(p), "region": "52190", "year": 2025}, timeout=30).status_code == 403
        assert httpx.post(B + "/catalog/imagery", headers=st, json={"path": "없는/파일.tif", "region": "52190", "year": 2025}, timeout=30).status_code == 404
        r = httpx.post(B + "/catalog/imagery", headers=st, json={"path": str(p), "region": "52190", "year": 2025, "gsd": 0.25, "kind": "drone",
                                                               "test": True}, timeout=60)
        assert r.status_code == 201, r.text
        j = envok(r.json())
        iid = j["id"]
        assert j["tier"] == "raw" and j["source"] == "cog" and j["job"]["kind"] == "tile"          # catalog/layers 항목 형식 그대로
        jid = j["job"]["id"]
        for _ in range(120):
            s = httpx.get(B + f"/jobs/{jid}", headers=st, timeout=20).json()
            if s["state"] in ("done", "failed"):
                break
            time.sleep(0.5)
        assert s["state"] == "done", s.get("error")
        for _ in range(20):                                                                 # 마감 훅(tile/cog finalize) → tile_ready
            it = httpx.get(B + f"/catalog/imagery/{iid}", headers=st, timeout=30).json()
            if it.get("tile_ready"):
                break
            time.sleep(0.5)
        assert it["tile_ready"] is True and it["sgg_cd"] == "52190"
        with adm() as c:
            fp, crs = c.execute("SELECT ST_AsText(ST_Envelope(footprint)), crs FROM imagery WHERE id=%s", (iid,)).fetchone()
        assert fp and crs == "EPSG:5186"
        assert iid not in [x["id"] for x in httpx.get(B + "/catalog/layers", headers=H(tok["namwon"]), timeout=30).json()["items"]]   # 원본 = LX 만
    finally:
        with adm() as c:
            if iid:
                c.execute("DELETE FROM index_results WHERE job_id IN (SELECT id FROM jobs WHERE imagery_id=%s)", (iid,))
                c.execute("DELETE FROM jobs WHERE imagery_id=%s", (iid,))
                c.execute("DELETE FROM imagery WHERE id=%s", (iid,))
                # 영상 표준(구현 3차) — 등록 작업이 만든 표준본(02. 데이터/cog/std) · 변환 기록
                for (sp, op) in c.execute("SELECT std_path, orig_path FROM imagery_std WHERE source_kind='imagery' AND source_id=%s", (iid,)).fetchall():
                    if sp and sp != op:
                        (config.DATA_ROOT / sp).unlink(missing_ok=True)
                c.execute("DELETE FROM imagery_std WHERE source_kind='imagery' AND source_id=%s", (iid,))
        p.unlink(missing_ok=True)


# ── S-6 카드 확장 ─────────────────────────────────────────────────────────
def test_s6_cards(live, tok):
    s = envok(httpx.get(B + "/registry/cards", headers=H(tok["staff"]), timeout=30).json())
    farm = next(c for c in s["items"] if c["id"] == "card-farm")
    assert farm["ledger_schema"]["kind"] == "farm_ledger" and farm["intro"]["headline"] and farm["status_label"] in ("운영", "시범", "첫 결과 전")
    g = envok(httpx.get(B + "/registry/cards?public=1", timeout=30).json())
    assert g["public"] and g["items"] and all(c["status_label"] in ("운영", "시범") for c in g["items"])
    assert all("ledger_schema" not in c and "versions" not in c for c in g["items"])
    bad = httpx.put(B + "/registry/cards/card-farm/ledger_schema", headers=H(tok["staff"]),
                    json={"kind": "farm_ledger", "columns": [{"key": "nm", "label": "소유자 성명", "role": "status"}]}, timeout=20)
    assert bad.status_code == 400
    for cols in (["pnu"], [None], [1, {"key": "p", "role": "pnu"}]):                     # 계약 v1.2-16 — 객체 아닌 항목 = 400(500 금지)
        b2 = httpx.put(B + "/registry/cards/card-farm/ledger_schema", headers=H(tok["staff"]), json={"kind": "farm_ledger", "columns": cols}, timeout=20)
        assert b2.status_code == 400 and b2.json()["error"]["code"] == "bad_request", b2.text[:200]
    assert httpx.put(B + "/registry/cards/card-farm/ledger_schema", headers=H(tok["sales"]), json={"clear": True}, timeout=20).status_code == 403
    keep = farm["ledger_schema"]
    ok = httpx.put(B + "/registry/cards/card-farm/ledger_schema", headers=H(tok["staff"]), json=keep, timeout=20)
    assert ok.status_code == 200 and ok.json()["ledger_schema"]["kind"] == "farm_ledger"


# ── S-7 배포 확장(심기 · 결재 · 건강 · 공개) ───────────────────────────────
def test_s7_port_approval_health(live, tok):
    st, ad = H(tok["staff"]), H(tok["admin"])
    ci = {"name": "시험시", "short": "시험", "mark": "", "color": "#006DF7", "tint": "#F2F7FF", "unit_word": "읍면동", "crs": "EPSG:5186",
          "contact": "", "seal": ""}
    r = httpx.post(B + "/deploys", headers=st, json={"card_id": "card-farm", "region": "52130", "ci": ci, "test": True}, timeout=60)
    assert r.status_code == 201, r.text
    d = envok(r.json())
    did = d["id"]
    try:
        assert d["stage"] == "draft" and d["sgg_cd"] == "52130" and d["approval_id"] and d["ci"]["color"] == "#006DF7"
        assert d["results"]["value"] == 0
        assert httpx.post(B + "/deploys", headers=H(tok["namwon"]), json={"card_id": "card-farm", "region": "52130"}, timeout=20).status_code == 403
        assert httpx.post(B + "/deploys", headers=st, json={"card_id": "card-farm", "region": "52130", "ci": {"x": 1}}, timeout=20).status_code == 400
        ro = httpx.post(B + f"/deploys/{did}/rollout", headers=ad, json={"stage": "shadow"}, timeout=20)
        assert ro.status_code == 409 and ro.json()["error"]["code"] == "approval_required"
        ap = envok(httpx.get(B + "/approvals?state=pending", headers=ad, timeout=30).json())
        assert any(x["id"] == d["approval_id"] and x["kind"] == "deploy" for x in ap["items"])
        assert any(x["id"] == d["approval_id"] for x in httpx.get(B + "/approvals?state=pending", headers=st, timeout=30).json()["items"])
        assert httpx.get(B + "/approvals", headers=H(tok["sales"]), timeout=20).status_code == 403
        dec = httpx.post(B + f"/approvals/{d['approval_id']}/decide", headers=ad, json={"decision": "approve"}, timeout=30)
        assert dec.status_code == 200
        assert httpx.post(B + f"/deploys/{did}/rollout", headers=ad, json={"stage": "shadow"}, timeout=20).json()["stage"] == "shadow"
        h = envok(httpx.get(B + "/deploys?with=health", headers=ad, timeout=60).json())
        assert all(it["health"]["next_action"] in ("retrain", "sample_review", "update_deploy", "none") for it in h["items"])
        assert did not in [x["id"] for x in h["items"]]                                    # 시험 배포본 기본 제외
        pub = envok(httpx.get(B + "/deploys?public=1", timeout=30).json())
        assert pub["items"] and all(x["stage"] in ("ga", "canary") for x in pub["items"]) and did not in [x["id"] for x in pub["items"]]
        assert "approvals" not in pub["items"][0]
    finally:
        assert httpx.delete(B + f"/deploys/{did}", headers=ad, timeout=30).status_code == 200


# ── S-8 작업 계획·학습·전력 예산 ─────────────────────────────────────────
def test_s8_quote_train_power_budget(live, tok):
    st = H(tok["staff"])
    body = {"kind": "train", "base_model": "namwon/Vinyl_house/train", "samples": "namwon/Vinyl_house/train2", "options": {"epochs": 5}}
    q = httpx.post(B + "/jobs/quote", headers=st, json=body, timeout=60)
    assert q.status_code == 200, q.text
    qq = envok(q.json())
    assert qq["shards"] == 1 and qq["pool"] == "a6000" and qq["gpu_s"]["value"] is None and "power_budget" in qq
    q2 = httpx.post(B + "/jobs/quote", headers=st, json={**body, "options": {"epochs": 5, "gpus": 2}}, timeout=60).json()
    assert q2["allowed"] is False and "power_budget" in q2["reasons"]
    s2 = httpx.post(B + "/jobs", headers=st, json={**body, "options": {"epochs": 5, "gpus": 2}, "label": "pytest power"}, timeout=60)
    assert s2.status_code == 409 and s2.json()["error"]["code"] == "power_budget"         # 두 장 동시 고부하 = 서버 거절
    q3 = httpx.post(B + "/jobs/quote", headers=st, json={**body, "options": {"epochs": 500}}, timeout=60).json()
    assert "too_large" in q3["reasons"]
    assert httpx.post(B + "/jobs/quote", headers=H(tok["sales"]), json=body, timeout=30).status_code == 403
    assert httpx.post(B + "/jobs/quote", headers=st, json={**body, "samples": "없는 표본"}, timeout=30).status_code == 404
    months = [f"{2015 + i // 12}-{i % 12 + 1:02d}" for i in range(130)]
    qi = httpx.post(B + "/jobs/quote", headers=st, json={"kind": "index", "model_id": "index/ndvi_pc", "params": {"months": months},
                                                         "aoi": {"type": "Polygon", "coordinates": [[[74.3, 42.8], [74.4, 42.8], [74.4, 42.9], [74.3, 42.9], [74.3, 42.8]]]}},
                    timeout=60).json()
    assert "too_large" in qi["reasons"]
    jl = httpx.get(B + "/jobs?limit=200", headers=st, timeout=30).json()
    assert not any(str(j.get("options", {}).get("adapter", "")).startswith("test") for j in jl["items"])     # 시험 작업 기본 제외


# ── S-9 관제 일원화 ───────────────────────────────────────────────────────
def test_s9_ops_unified(live, tok):
    ad = H(tok["admin"])
    g = httpx.get(B + "/ops/gpus", headers=ad, timeout=30).json()
    pb = g["power_budget"]
    assert set(pb) >= {"max_hot", "hot_now", "ok"} and pb["max_hot"] == 1 and isinstance(pb["ok"], bool)
    # 브라우저 스트림은 스트림 전용 호스트 이름으로(c2-xi 3차 · API 호스트 이름이면 204)
    with httpx.stream("GET", B + "/events/ops", headers={**ad, "origin": "http://localhost:4173", "host": "s1.localhost:8700"}, timeout=10) as r:
        assert r.status_code == 200
    assert httpx.get(B + "/events/ops", headers={**ad, "origin": "http://evil.example"}, timeout=10).status_code == 403
    assert httpx.get(B + "/events/ops", headers={**H(tok["staff"]), "origin": "http://localhost:4173"}, timeout=10).status_code == 403
    ap = envok(httpx.get(B + "/approvals?state=pending", headers=ad, timeout=30).json())
    assert is_env(ap["pending"]) and set(ap["counts"]) == {"deploy", "deploy_ga", "rule", "quota", "model", "card", "request"}      # impl-1: 모델 등록 · 서비스 공개 · impl-2: 분석 의뢰
    q = httpx.post(B + "/approvals", headers=H(tok["namwon"]), json={"subject_type": "quota", "payload": {"dim": "gpu_s_month", "hard": 40000},
                                                                      "reason": "pytest"}, timeout=30)
    assert q.status_code == 201
    aid = q.json()["approval_id"]
    try:
        assert httpx.post(B + "/approvals", headers=H(tok["namwon"]), json={"subject_type": "quota", "subject_id": "gwangju-jeonnam",
                                                                            "payload": {"dim": "gpu_s_month"}}, timeout=20).status_code == 403
        assert httpx.post(B + f"/approvals/{aid}/decide", headers=ad, json={"decision": "reject"}, timeout=30).status_code == 400   # 반려 = 사유 필수(impl-1)
        assert httpx.post(B + f"/approvals/{aid}/decide", headers=ad, json={"decision": "reject", "reason": "pytest"}, timeout=30).status_code == 200
    finally:
        with adm() as c:
            c.execute("DELETE FROM approvals WHERE id=%s", (aid,))
    with adm() as c:
        assert c.execute("SELECT count(*) FROM deploys WHERE id LIKE '%%-test%%'").fetchone()[0] == 0          # 시드 정리
        assert c.execute("SELECT count(*) FROM approvals WHERE reason LIKE 'test restore%%'").fetchone()[0] == 0


# ── S-10 에이전트 범위 가드·도구 ──────────────────────────────────────────
def test_s10_redteam_50_and_guard(live, tok):
    from agent import runner
    import yaml
    n_cases = len(yaml.safe_load((Path(runner.__file__).parent / "redteam.yaml").read_text(encoding="utf-8")))
    assert n_cases >= 50                                   # 50문(F2-E·F3) + 이후 추가 문항(관할 밖 안내 등)
    res = asyncio.run(runner.redteam_eval(store=True))
    assert res["n"] == n_cases and res["accuracy"]["value"] == 100.0, res["failed"]
    o = httpx.get(B + "/ops/llm", headers=H(tok["admin"]), timeout=30).json()
    assert o["redteam"]["accuracy"]["value"] == 100.0 and o["redteam"]["cases"]["value"] == n_cases
    assert runner.dedupe_units("의심은 {{env:e2}}필지이고 {{env:e3}} 건, {{env:e4}}건물") == "의심은 {{env:e2}}이고 {{env:e3}}, {{env:e4}}건물"
    names = {t["function"]["name"] for t in runner.registry.tools_for(_P("tenant", "manager", "namwon"))}
    assert {"ledger_ingest", "ledger_match", "ledger_rule", "ledger_findings", "parcel_lookup"} <= names
    assert "ledger_rule" in runner.registry.CONFIRM


def _P(realm, role, tenant):
    from landxi_api.deps import CAPS, Principal
    return Principal(realm, role, tenant, "u_t", caps=CAPS[(realm, role)])


def test_s10_agent_run_out_of_scope_no_llm(live, tok):
    """기관 세션의 관할 밖 질문 → 도구·LLM 호출 없이 거절 문구(SSE agent.rejected). LLM 사슬이 죽어 있으면 503 이라 건너뜀."""
    r = httpx.post(B + "/agent/runs", headers=H(tok["namwon"]), json={"message": "여수시 해안 쓰레기 몇 곳이야?"}, timeout=30)
    if r.status_code == 503:
        pytest.skip("LLM 사슬 응답 없음")
    assert r.status_code == 202
    url = BASE + r.json()["events_url"] + "?access_token=" + tok["namwon"]
    got = None
    with httpx.stream("GET", url, timeout=30) as s:
        ev = None
        for line in s.iter_lines():
            if line.startswith("event:"):
                ev = line[6:].strip()
            elif line.startswith("data:") and ev in ("agent.rejected", "agent.route", "agent.done", "agent.failed"):
                got = (ev, json.loads(line[5:]))
                break
    assert got and got[0] == "agent.rejected" and got[1]["message"] == "이 기관의 데이터가 아닙니다"


# ── S-11 글로벌 타일 사다리·캐시 ─────────────────────────────────────────
def test_s11_global_tile_ladder(live, tok):
    try:
        a = httpx.get(B + "/proxy/tiles/global/3/6/3", timeout=30)
    except httpx.HTTPError:
        pytest.skip("외부망 없음")
    if a.status_code == 502:
        pytest.skip("상류 전부 응답 없음(외부망)")
    assert a.status_code == 200 and a.headers["content-type"].startswith("image/") and a.headers["x-lx-tile-source"] in ("eox", "pc", "vworld")
    b = httpx.get(B + "/proxy/tiles/global/3/6/3", timeout=30)
    assert b.headers["x-lx-cache"] == "hit"
    w = httpx.post(B + "/proxy/tiles/warm", headers=H(tok["staff"]), json={"bbox": [74.2, 42.8, 74.5, 42.95], "zmin": 6, "zmax": 8}, timeout=30)
    assert w.status_code == 202 and w.json()["queued"] >= 3
    assert httpx.get(B + "/proxy/tiles/global/3/99/3", timeout=10).status_code == 400
    s = envok(httpx.get(B + "/proxy/global/s2-index?deploy_id=dp-kgz-agri-farm-26", headers=H(tok["admin"]), timeout=30).json())
    assert "months" in s


# ── S-12 기동 안정 · 가동 시간 ────────────────────────────────────────────
def test_s12_uptime(live, tok):
    u = envok(httpx.get(B + "/ops/uptime", headers=H(tok["admin"]), timeout=30).json())
    gw = next(x for x in u["items"] if x["name"] == "gateway")
    assert gw["uptime_s"]["value"] >= 0 and gw["boot_at"]
    assert any(x["name"] and x["name"].startswith("cpu") for x in u["items"])
    assert httpx.get(B + "/ops/uptime", headers=H(tok["staff"]), timeout=10).status_code == 403
    ps = (config.SERVER_ROOT / "start-landxi.ps1").read_bytes()
    assert ps.startswith(b"\xef\xbb\xbf")                                                   # PS 5.1 한글 경로 = BOM 필수
    t = ps.decode("utf-8-sig")
    assert "Power-Check" in t and ".workers.lock" in t and "-Watch" in t


# ── S-2 · S-12 재기동으로 끊긴 대장 매칭 ─────────────────────────────────
def test_s12_ledger_resume_after_restart(live):
    """state=matching 인데 원본 임시 파일이 없는 반입 → 기동 복구가 failed + 사용자 문구로 닫는다(멈춘 채 남는 반입 0)."""
    from landxi_api import deps, ledger
    iid = "imp_pytest_" + uuid.uuid4().hex[:8]
    with adm() as c:
        c.execute("INSERT INTO ledger_imports(id, tenant_id, kind, filename, state, mapping, created_by) "
                  "VALUES (%s,'lx-demo','farm_ledger','시험.csv','matching','{\"pnu\":\"필지고유번호\"}','u_t')", (iid,))
    try:
        async def go():
            deps._pool = None                       # 앞선 asyncio.run 이 남긴(닫힌 루프의) 풀은 버리고 이 루프에서 새로
            try:
                return await ledger.resume_stuck_imports()
            finally:
                if deps._pool is not None:
                    await deps._pool.close()
                    deps._pool = None
        res = asyncio.run(go())
        assert iid in res["failed"]
        with adm() as c:
            st, err = c.execute("SELECT state, error FROM ledger_imports WHERE id=%s", (iid,)).fetchone()
        assert st == "failed" and "다시 올려" in err
    finally:
        with adm() as c:
            c.execute("DELETE FROM ledger_imports WHERE id=%s", (iid,))


# ── lx-ingest 요청: kind:join 마감 counts {joined_parcels, parcels} ───────
def test_join_finalize_counts(live):
    from adapters.survey import adapter_join
    jid = "job_pytest_join_" + uuid.uuid4().hex[:6]
    with adm() as c:
        for i, (pa, jo) in enumerate(((120, 80), (30, 0))):
            c.execute("INSERT INTO index_results(tenant_id, job_id, shard_id, key, metrics) VALUES ('lx',%s,%s,%s,%s)",
                      (jid, f"s{i}", f"s{i}", json.dumps({"parcels": pa, "joined_parcels": jo})))
    try:
        assert adapter_join.finalize({"id": jid}) == {"counts": {"joined_parcels": 80, "parcels": 150}}
    finally:
        with adm() as c:
            c.execute("DELETE FROM index_results WHERE job_id=%s", (jid,))


# ── lx-train 요청: 카탈로그 영상 항목에 소유 시군구 ─────────────────────
def test_catalog_imagery_sgg(live, tok):
    items = httpx.get(B + "/catalog/layers?build=lx", headers=H(tok["staff"]), timeout=60).json()["items"]
    img = [i for i in items if "sgg_cd" in i]                                     # imagery 표에서 온 항목만 이 키를 가진다
    assert img and any(len(i["sgg_cd"] or "") == 5 for i in img)


# ── lx-ingest 요청: 코드가 바뀐 시군구(전남광주 12xxx)도 실제 경계 ────────
def test_regions_renamed_codes_real_boundary(live, tok):
    from landxi_api.regions import regions_base
    regs, _, src = regions_base()
    news = [r for r in regs if r.get("prev_cd")]
    if not news:
        pytest.skip("V-World 캐시 없음(뼈대만)")
    cd = news[0]["sgg_cd"]
    g = httpx.get(B + f"/regions/{cd}?geom=1", headers=H(tok["staff"]), timeout=60).json()["geometry"]
    ring = g["coordinates"][0] if g["type"] == "Polygon" else g["coordinates"][0][0]
    assert len(ring) > 5                                                           # 사각형(5점) 아님


# ── 3차 화면 요청: 담당 재지정 · 목록 판정 · 조치 5종+조문 · LX 표본 판정 · 검수 전 떼기 ──
def _one_open_finding(tenant="namwon"):
    with adm() as c:
        return c.execute("SELECT id, rule FROM survey_findings WHERE tenant_id=%s AND state='open' AND NOT demo ORDER BY rank LIMIT 1",
                         (tenant,)).fetchone()


def _restore_finding(fid, snap):
    with adm() as c:
        c.execute("DELETE FROM survey_finding_events WHERE finding_id=%s AND at >= %s", (fid, snap["t0"]))
        c.execute("DELETE FROM survey_actions WHERE finding_id=%s AND at >= %s", (fid, snap["t0"]))
        c.execute("DELETE FROM finding_verdicts WHERE finding_id=%s AND at >= %s", (fid, snap["t0"]))
        c.execute("UPDATE survey_findings SET state=%s, assignee=%s, reason=%s, verdict=%s, verdict_code=%s, note=%s, updated_at=%s, "
                  "updated_by=%s, demo=%s WHERE id=%s", (snap["state"], snap["assignee"], snap["reason"], snap["verdict"], snap["verdict_code"],
                                                         snap["note"], snap["updated_at"], snap["updated_by"], snap["demo"], fid))


def _snap(fid):
    with adm() as c:
        r = c.execute("SELECT state, assignee, reason, verdict, verdict_code, note, updated_at, updated_by, demo, now() FROM survey_findings WHERE id=%s",
                      (fid,)).fetchone()
    return dict(zip(("state", "assignee", "reason", "verdict", "verdict_code", "note", "updated_at", "updated_by", "demo", "t0"), r))


def test_no_assign_actions_law_and_list_verdict(live, tok):
    """현장 확인 배정 · 시정명령 · 이행강제금 · 원상복구 없음(원칙 40 · 확인 대장 FR-14·FR-15 반려) — 판정과 기록(안내 · 재방문 · 이관)만."""
    row = _one_open_finding()
    if not row:
        pytest.skip("열린 의심 없음")
    fid = row[0]
    nw = H(tok["namwon"])
    snap = _snap(fid)
    try:
        r = httpx.post(B + f"/survey/findings/{fid}/state", headers=nw, json={"state": "assigned", "assignee": "현장 1팀"}, timeout=30)
        assert r.status_code == 400 and "배정" in r.json()["error"]["message"]
        r = httpx.post(B + f"/survey/findings/{fid}/state", headers=nw, json={"state": "inspected", "assignee": "현장 2팀"}, timeout=30)
        assert r.status_code == 200 and not r.json().get("assignee") and r.json()["allowed_next"] == ["closed"]     # 담당은 쓰지 않는다
        for k in ("시정명령", "이행강제금", "원상복구", "correction", "penalty", "restore"):
            assert httpx.post(B + "/survey/actions", headers=nw, json={"finding_id": fid, "kind": k}, timeout=30).status_code == 400, k
        a = httpx.post(B + "/survey/actions", headers=nw, json={"finding_id": fid, "kind": "안내", "law": "농지법 제42조", "due": "2026-10-31"}, timeout=30)
        assert a.status_code == 201 and a.json()["kind"] == "notice" and a.json()["law"] == "농지법 제42조"
        assert httpx.post(B + "/survey/actions", headers=nw, json={"finding_id": fid, "kind": "재방문"}, timeout=30).json()["kind"] == "revisit"
        it = httpx.get(B + f"/survey/findings?pnu=&state=inspected&limit=2000", headers=nw, timeout=30).json()["items"]
        assert all("verdict" in x and "verdict_code" in x for x in it)
    finally:
        _restore_finding(fid, snap)


def test_lx_sample_verdict_keeps_state(live, tok):
    row = _one_open_finding()
    if not row:
        pytest.skip("열린 의심 없음")
    fid, rid = row
    st = H(tok["staff"])
    snap = _snap(fid)
    before = envok(httpx.get(B + f"/survey/rules/{rid}/stats", headers=st, timeout=30).json())
    try:
        r = httpx.post(B + f"/survey/findings/{fid}/state", headers=st, json={"verdict": "match_fp", "verdict_code": "fp", "note": "검수:오탐"}, timeout=30)
        assert r.status_code == 200, r.text
        j = envok(r.json())
        assert j["state"] == "open" and j["lx_verdict"]["verdict"] == "match_fp"          # 기관 필지 상태 불변
        after = envok(httpx.get(B + f"/survey/rules/{rid}/stats", headers=st, timeout=30).json())
        assert after["lx"]["verdicts"]["match_fp"]["value"] >= before["lx"]["verdicts"]["match_fp"]["value"]
        assert after["field"]["judged"]["value"] == before["field"]["judged"]["value"]      # 기관 현장 판정과 섞지 않음
        assert httpx.post(B + f"/survey/findings/{fid}/state", headers=H(tok["sales"]), json={"verdict": "match"}, timeout=30).status_code == 403
        rc = envok(httpx.post(B + f"/survey/rules/{rid}/recalibrate?scope=lx", headers=st, json={}, timeout=30).json())
        assert rc["scope"] == "lx"
        rl = httpx.get(B + "/survey/rules", headers=st, timeout=30).json()["items"]
        assert all("reviewed" in x for x in rl)
    finally:
        _restore_finding(fid, snap)


def test_review_gate_and_reviewed_on_approve(live, tok):
    st, ad = H(tok["staff"]), H(tok["admin"])
    rid = "L3"
    r = httpx.post(B + f"/survey/rules/{rid}/activate", headers=st, json={"note": "검수 전 떼기"}, timeout=30)
    assert r.status_code == 409 and "표본" in r.json()["error"]["message"]                    # 표본 < 100 → 서버가 거절
    with adm() as c:
        ver0 = c.execute("SELECT version, thresholds FROM survey_rules WHERE id=%s", (rid,)).fetchone()
        for i in range(100):
            c.execute("INSERT INTO finding_verdicts(realm, tenant_id, finding_id, rule, verdict, note, by) VALUES ('lx','namwon',%s,%s,%s,'pytest','u_t')",
                      (f"f_pytest_{i}", rid, "match" if i < 90 else "match_fp"))
    aid = None
    try:
        r = httpx.post(B + f"/survey/rules/{rid}/activate", headers=st, json={"note": "검수 전 떼기 · pytest"}, timeout=30)
        assert r.status_code == 202 and r.json()["review"] is True, r.text
        aid = r.json()["approval_id"]
        assert httpx.post(B + f"/approvals/{aid}/decide", headers=ad, json={"decision": "approve"}, timeout=30).json()["effect"]["reviewed"] is True
        s = envok(httpx.get(B + f"/survey/rules/{rid}/stats", headers=st, timeout=30).json())
        assert s["reviewed"] is True and s["lx"]["precision"]["value"] == 90.0
    finally:
        with adm() as c:
            c.execute("DELETE FROM finding_verdicts WHERE note='pytest'")
            if aid:
                c.execute("DELETE FROM approvals WHERE id=%s", (aid,))
            if ver0:
                c.execute("UPDATE survey_rules SET reviewed=false, reviewed_at=NULL, pending=NULL, version=%s, thresholds=%s WHERE id=%s",
                          (ver0[0], json.dumps(ver0[1]) if ver0[1] is not None else None, rid))
            else:                                                                       # 승인이 새로 만든 규칙 행(대장 규칙 L-*)은 지운다
                c.execute("DELETE FROM survey_rules WHERE id=%s", (rid,))
