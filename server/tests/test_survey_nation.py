"""core-survey — 실태조사 전국화(contract-parcel-ai.md) 시험.

    cd server && python -m pytest tests/test_survey_nation.py -q

판정 지역(시험 인자 예외 · _common.md): 기준 = 남원 52190, 새 지역 = 여수 12130(옛 46130).
DB 시험은 PostGIS(:5433) 필요 · API 시험은 게이트웨이(:8700)가 없으면 skip.
"""
import sys
import time
from pathlib import Path

import httpx
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from survey import db as S  # noqa: E402
from survey import nation as N  # noqa: E402
from survey import rules as R  # noqa: E402

BASE, NEW, NEW_OLD = "52190", "12130", "46130"
API = "http://127.0.0.1:8700/api/v1"


@pytest.fixture(scope="module")
def pg():
    c = S.pg()
    S.lx_tx(c)
    yield c
    c.rollback()
    c.close()


# ── 순수 함수 ──
def test_class_key_map():
    assert R.class_key("건물") == "bld" and R.class_key(None, "cropland") == "crop"
    assert R.class_key("주차장") == "park" and R.class_key("비닐하우스") == "gh"
    assert R.class_key("차량", "car") == "car"          # 대응표 밖 = 원래 이름


def test_jibun_and_quantile():
    assert N.jibun_of("1213036025200420000") == "산42"
    assert N.jibun_of("1213033021105110002") == "511-2"
    xs = [float(x) for x in range(1, 101)]
    assert abs(N.quantile(xs, 0.95) - 95.05) < 1e-9 and abs(N.quantile(xs, 0.75) - 75.25) < 1e-9


def test_agg_pairs_same_formula_as_canon():
    pairs = [("p1", "a", "건물", "building", 0.9, 100.0, 80.0),     # 과반 · 신뢰도 ok → in
             ("p1", "b", "건물", "building", 0.4, 100.0, 90.0),     # 신뢰도 < 0.5 → hit 만
             ("p1", "c", "건물", "building", 0.9, 100.0, 30.0),     # 과반 아님 → hit 만
             ("p1", "d", "건물", "building", 0.9, 100.0, 0.005)]    # 0.01 이하 → 버림
    a = N._agg_pairs(pairs)[("p1", "bld")]
    assert a["hit"] == 200.0 and a["in"] == 80.0 and a["n"] == 1 and abs(a["cw"] / a["in"] - 0.9) < 1e-9
    assert a["n1"] == 3 and a["hit1"] == 200.0


# ── 지역 · 기관(하드코딩 없이 regions · config 에서) ──
def test_region_codes_and_tenant():
    r = N.region(NEW_OLD)
    assert r["sgg_cd"] == NEW and r["src_cd"] == NEW_OLD
    assert N.region(BASE)["src_cd"] == "45" + BASE[2:]            # 전북특별자치도 → 2022 원천 코드
    assert N.tenant_for(NEW) == "gwangju-jeonnam" and N.tenant_for(BASE) == "namwon"
    assert set(N.codes(NEW)) == {NEW, NEW_OLD}


# ── 규칙 일반화 회귀 ──
def canon_job(pg):
    """정본 대조에 쓰는 AI 결과 — 정본 결과 세트(results/…)가 결합돼 있으면 그것. 새 전역 분석으로 survey_sgg.job_id 가
    최신 작업으로 바뀌어도(정본 의심은 그대로 · nation.build) 정본 열(a23_*)과 같은 결과로 대조한다."""
    row = pg.execute("SELECT job_id FROM survey_parcel_ai WHERE job_id LIKE 'results/%%' AND pnu LIKE %s LIMIT 1", (BASE + "%",)).fetchone()
    return row[0] if row else pg.execute("SELECT job_id FROM survey_sgg WHERE sgg_cd=%s", (BASE,)).fetchone()[0]


def test_generic_rules_on_canon_equal_canon(pg):
    rows = pg.execute(R.eval_sql(R.default_thresholds(), emd_cd=False)).fetchall()
    got = {(r[0], r[1]): round(r[5], 1) for r in rows}
    canon = {(r, p): s for r, p, s in pg.execute("SELECT rule, pnu, score FROM survey_findings WHERE rule LIKE 'R%%' AND sgg_cd=%s "
                                                  "AND card_id IS NULL",           # 정본 = 시군구 실태조사 행(카드 판 제외 · 모델-표기 ⓐ)
                                                  (BASE,)).fetchall()}
    assert set(got) == set(canon) and all(got[k] == canon[k] for k in canon)


def test_join_equals_canon_columns_smallest_emd(pg):
    emd = pg.execute("SELECT emd_cd FROM survey_emd WHERE sgg_cd=%s ORDER BY parcels LIMIT 1", (BASE,)).fetchone()[0]
    job = canon_job(pg)
    agg = N._agg_pairs(pg.execute(N.PAIR_SQL, {"sgg": BASE, "emd": emd, "job": job}).fetchall())
    ref = pg.execute("SELECT pnu, a23_bld_m2, a23_bld_in_m2, a23_crop_m2, a23_park_in_m2 FROM survey_parcels WHERE emd_cd=%s", (emd,)).fetchall()
    g = lambda p, k, f: (agg.get((p, k)) or {}).get(f, 0)  # noqa: E731
    d = max(max(abs(g(p, "bld", "hit") - (b or 0)), abs(g(p, "bld", "in") - (bi or 0)), abs(g(p, "crop", "hit") - (c or 0)),
                abs(g(p, "park", "in") - (pk or 0))) for p, b, bi, c, pk in ref)
    assert d < 0.5, d


def test_stored_join_generic_regression_table(pg):
    """남원: 저장 결합(survey_parcel_ai) × 일반 규칙 vs 정본 — 두 번째 시점(2025 드론)을 쓰는 R3·R5 만 차이 허용."""
    job = canon_job(pg)
    if not pg.execute("SELECT EXISTS(SELECT 1 FROM survey_parcel_ai WHERE job_id=%s)", (job,)).fetchone()[0]:
        pytest.skip("남원 결합 저장 전(POST /survey/build 52190)")
    gen = {}
    for r in N.evaluate(pg, BASE, job):
        gen[r[0]] = gen.get(r[0], 0) + 1
    # 일반 경로는 분석 범위(survey_sgg.coverage) 안 필지만 평가한다 — 정본도 같은 범위 안 필지만 센다(범위 밖 가장자리 필지 몇 개 차이 제외)
    can = dict(pg.execute("SELECT f.rule, count(*) FROM survey_findings f JOIN survey_parcels sp ON sp.pnu = f.pnu "
                          "WHERE f.sgg_cd=%s AND f.rule LIKE 'R%%' AND ((SELECT coverage FROM survey_sgg WHERE sgg_cd=%s) IS NULL "
                          "OR ST_Intersects((SELECT coverage FROM survey_sgg WHERE sgg_cd=%s), ST_PointOnSurface(sp.geom))) GROUP BY 1",
                          (BASE, BASE, BASE)).fetchall())
    for rule in ("R1", "R2", "R4", "R6"):
        assert gen.get(rule, 0) == can.get(rule, 0), (rule, gen, can)
    for rule in ("R3", "R5"):
        assert gen.get(rule, 0) <= can.get(rule, 0)


# ── 새 지역(여수) ──
def test_new_region_built(pg):
    row = pg.execute("SELECT state, tenant_id, parcels, joined_parcels, findings, priority_cut FROM survey_sgg WHERE sgg_cd=%s", (NEW,)).fetchone()
    if not row or row[0] != "done":
        pytest.skip("여수 실태조사 적재 전")
    state, tenant, parcels, joined, nf, cut = row
    assert tenant == "gwangju-jeonnam" and parcels > 100000 and joined > 0 and nf > 0
    n = pg.execute("SELECT count(*), count(*) FILTER (WHERE priority='A'), count(*) FILTER (WHERE NOT addr LIKE '%%여수시%%'), "
                   "count(*) FILTER (WHERE tenant_id <> %s) FROM survey_findings WHERE sgg_cd=%s AND rule LIKE 'R%%'", (tenant, NEW)).fetchone()
    assert n[0] == nf and n[2] == 0 and n[3] == 0
    assert 0.03 <= n[1] / n[0] <= 0.08            # 등급 A = 그 시군구 안 상위 5%
    assert cut and cut.get("scope") == "sgg"
    # PNU 는 지금 코드 · 읍면동 이름 채움
    assert pg.execute("SELECT count(*) FROM survey_parcels WHERE sgg_cd=%s AND (left(pnu,5)<>%s OR emd IS NULL)", (NEW, NEW)).fetchone()[0] == 0


# ── API(게이트웨이) ──
def _tok(body):
    from landxi_api import config
    r = httpx.post(API + "/auth/login", json={**body, "password": config.DEV_PASSWORD}, timeout=30)
    r.raise_for_status()
    return {"authorization": "Bearer " + r.json()["token"]}


@pytest.fixture(scope="module")
def staff():
    try:
        httpx.get(API + "/health", timeout=3).raise_for_status()
    except Exception:
        pytest.skip("게이트웨이 없음")
    return _tok({"realm": "lx", "login": "test@lx.or.kr"})


@pytest.mark.parametrize("sgg", [BASE, NEW])
def test_result_parcels_first_response_under_3s(pg, staff, sgg):
    job = pg.execute("SELECT job_id FROM survey_sgg WHERE sgg_cd=%s AND state='done'", (sgg,)).fetchone()
    if not job:
        pytest.skip(f"{sgg} 적재 전")
    set_ = job[0] if job[0].startswith("job_") else job[0]
    t = time.perf_counter()
    r = httpx.get(f"{API}/results/{set_}/parcels?limit=2000", headers=staff, timeout=60)
    dt = time.perf_counter() - t
    assert r.status_code == 200 and r.json()["lx"]["how"] == "stored"
    assert r.json()["lx"]["total"] > 0 and dt <= 3.0, dt


def test_findings_sgg_filter_and_regions(staff):
    r = httpx.get(f"{API}/survey/findings?sgg={NEW_OLD}&limit=5", headers=staff, timeout=30)
    assert r.status_code == 200
    assert all(f["pnu"].startswith(NEW) for f in r.json()["items"])
    j = httpx.get(f"{API}/survey/regions", headers=staff, timeout=30).json()
    assert any(x["sgg_cd"] == BASE for x in j["items"])


def test_build_forbidden_outside_jurisdiction():
    try:
        h = _tok({"realm": "tenant", "tenant_id": "namwon", "login": "lxadmin@lx.or.kr", "site": "gov"})
    except Exception:
        pytest.skip("게이트웨이 없음")
    r = httpx.post(f"{API}/survey/build", json={"sgg_cd": NEW}, headers=h, timeout=30)
    assert r.status_code == 403
