"""fix-admin-usage — 기관 사용량 실집계(저장 공간 · GPU 시간 · 분석 면적).
LX(maker)가 기관을 위해 대신 돌린 작업이 그 기관 사용량으로 잡히는지, 화면이 읽는 /ops/tenants 값이 DB 와 같은지,
한도 미설정이 0% 로 지어지지 않게 limit_set 이 오는지를 게이트웨이(:8700)와 DB 에 직접 대조한다.
지역 이름을 하드코딩하지 않는다 — 기관·배포본은 DB 에서 고른다."""
import datetime as dt
import sys
from pathlib import Path

import httpx
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from landxi_api import config  # noqa: E402
from conftest import H  # noqa: E402
from workers.metering import OWNER_EXPR  # noqa: E402

KST = dt.timezone(dt.timedelta(hours=9))
TOL = 0.01          # 값이 같아야 한다(반올림 3자리 · 조회 사이에 새 계량이 들어오면 커질 수만 있어 아래에서 ≥ 로 본다)


def _pg():
    psycopg = pytest.importorskip("psycopg")
    try:
        c = psycopg.connect(config.PG_ADMIN_DSN, connect_timeout=5)
    except Exception:
        pytest.skip("PostGIS 미기동")
    c.execute("SELECT set_config('app.realm','lx',false), set_config('app.tenant_id','',false)")
    return c


def _month_start():
    n = dt.datetime.now(KST)
    return n.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def _db_sums(c):
    """이번 달 usage_events 합(작업 귀속 기관 × dim) — 게이트웨이와 같은 규칙을 SQL 로 직접."""
    rows = c.execute(
        "SELECT coalesce(CASE WHEN u.tenant_id = 'lx-demo' THEN 'lx-demo' ELSE o.owner END, u.tenant_id), u.dim, sum(u.amount) "
        f"FROM usage_events u LEFT JOIN (SELECT j.id, {OWNER_EXPR} AS owner FROM jobs j) o ON o.id = u.job_id "
        "WHERE u.at >= %s AND u.dim IN ('gpu_s','area_km2') GROUP BY 1, 2", (_month_start(),)).fetchall()
    return {(t, d): float(v or 0) for t, d, v in rows}


@pytest.fixture(scope="module")
def ops_tenants(live, tok):
    r = httpx.get(live + "/ops/tenants", headers=H(tok["admin"]), timeout=120)
    assert r.status_code == 200, r.text[:300]
    return {it["tenant_id"]: it for it in r.json()["items"]}


def test_owner_rule_deploy_id_wins():
    """① deploy_id 가 있는 LX 작업은 그 배포본 기관으로."""
    c = _pg()
    rows = c.execute(f"SELECT j.id, d.tenant_id, {OWNER_EXPR} FROM jobs j JOIN deploys d ON d.id = j.deploy_id "
                     "WHERE NOT j.demo AND j.tenant_id = 'lx' LIMIT 50").fetchall()
    if not rows:
        pytest.skip("deploy_id 가 붙은 LX 작업 없음")
    for jid, dep_t, owner in rows:
        assert owner == dep_t, (jid, dep_t, owner)


def test_owner_rule_narrowest_deploy():
    """② deploy_id 없는 LX 작업은 AOI(없으면 영상 footprint)와 겹치는 가장 좁은 배포본의 기관 — 광역 배포본이 시군구 배포본을 덮어쓰지 않는다."""
    c = _pg()
    rows = c.execute(f"""
        SELECT j.id, {OWNER_EXPR} AS owner,
          (SELECT d.tenant_id FROM deploys d WHERE d.tenant_id <> 'lx-demo' AND NOT coalesce(d.test,false) AND d.aoi IS NOT NULL
             AND ST_Intersects(d.aoi, coalesce(j.aoi, (SELECT i.footprint FROM imagery i WHERE i.id = j.imagery_id)))
           ORDER BY ST_Area(d.aoi) LIMIT 1) AS narrow
        FROM jobs j WHERE NOT j.demo AND j.tenant_id = 'lx' AND j.deploy_id IS NULL AND j.kind IN ('infer','reinfer') LIMIT 300""").fetchall()
    if not rows:
        pytest.skip("대상 작업 없음")
    for jid, owner, narrow in rows:
        assert owner == (narrow or "lx"), (jid, owner, narrow)


def test_owner_rule_tenant_job_untouched():
    """③ 기관(user)이 직접 낸 작업은 그 기관 그대로 · 영업 계량(lx-demo)은 옮기지 않는다."""
    c = _pg()
    bad = c.execute(f"SELECT j.id FROM jobs j JOIN tenants t ON t.id = j.tenant_id WHERE (t.kind = 'user' OR j.tenant_id = 'lx-demo') "
                    f"AND ({OWNER_EXPR}) <> j.tenant_id LIMIT 5").fetchall()
    assert not bad, bad


def test_gpu_area_match_db(ops_tenants):
    """/ops/tenants 의 GPU 시간 · 분석 면적 = DB 작업 귀속 합(기관 전부 · 지역 이름 없이)."""
    c = _pg()
    db = _db_sums(c)
    users = [t for (t,) in c.execute("SELECT id FROM tenants WHERE kind = 'user'").fetchall()]
    assert users
    for t in users:
        it = ops_tenants[t]
        for dim, base in (("gpu_s_month", "gpu_s"), ("area_km2_month", "area_km2")):
            api_v = it["dims"][dim]["used"]["value"]
            db_v = db.get((t, base), 0.0)
            # 게이트웨이 캐시(10s) 동안 새 계량이 들어오면 DB 쪽이 조금 클 수 있다 — 그 반대는 없다
            assert api_v <= db_v + TOL and api_v >= db_v - max(TOL, db_v * 0.05), (t, dim, api_v, db_v)
            assert it["dims"][dim]["used"]["basis"] == "measured"


def test_lx_run_jobs_counted_for_tenant(ops_tenants):
    """LX 가 기관 관할에서 대신 돌린 GPU 작업이 있으면 그 기관 GPU 시간은 0 이 아니다(0% 원인 회귀 방지)."""
    c = _pg()
    rows = c.execute(f"SELECT ({OWNER_EXPR}) AS o, sum(u.amount) FROM usage_events u JOIN jobs j ON j.id = u.job_id "
                     "WHERE u.dim = 'gpu_s' AND u.at >= %s AND j.tenant_id = 'lx' AND NOT j.demo GROUP BY 1", (_month_start(),)).fetchall()
    moved = [(o, float(v)) for o, v in rows if o != "lx" and float(v or 0) > 0]
    if not moved:
        pytest.skip("이번 달 LX 가 기관 관할에서 돌린 GPU 작업 없음")
    for o, v in moved:
        assert ops_tenants[o]["dims"]["gpu_s_month"]["used"]["value"] > 0, (o, v)


def test_storage_real(ops_tenants):
    """저장 공간 = 기관 몫 결과 파일 + DB 행 — 결과·대장이 있는 기관은 0 이 아니고, breakdown 합과 같다."""
    c = _pg()
    has = {t for (t,) in c.execute(
        "SELECT DISTINCT tenant_id FROM registry_snapshots UNION SELECT DISTINCT tenant_id FROM survey_findings "
        "UNION SELECT tenant_id FROM deploys WHERE snapshot_current IS NOT NULL").fetchall()}
    users = {t for (t,) in c.execute("SELECT id FROM tenants WHERE kind = 'user'").fetchall()}
    for t in users:
        st = ops_tenants[t]["dims"]["storage_gb"]
        v = st["used"]["value"]
        b = st.get("breakdown") or {}
        assert v is not None and v >= 0
        if b:
            assert abs(v - (b["files_gb"]["value"] + b["db_gb"]["value"])) <= 0.002, (t, v, b)
        if t in has:
            assert v > 0, (t, "결과·대장이 있는데 저장 0")


def test_limit_set_flag(ops_tenants):
    """한도 미설정(hard null)은 limit_set false — 화면이 0% 를 지어내지 않고 실사용량만 보이게."""
    for t, it in ops_tenants.items():
        for dim, v in it["dims"].items():
            assert v["limit_set"] == (v["hard"] is not None), (t, dim)


def test_tenant_reads_only_own_usage(live, tok):
    """기관 담당자는 자기 기관 사용량만(같은 값) · 다른 기관은 403."""
    c = _pg()
    me = "namwon" if c.execute("SELECT 1 FROM tenants WHERE id='namwon'").fetchone() else None
    if not me:
        pytest.skip("시드 기관 없음")
    r = httpx.get(live + f"/t/{me}/usage", headers=H(tok["namwon"]), timeout=60)
    assert r.status_code == 200
    other = c.execute("SELECT id FROM tenants WHERE kind='user' AND id <> %s LIMIT 1", (me,)).fetchone()[0]
    r2 = httpx.get(live + f"/t/{other}/usage", headers=H(tok["namwon"]), timeout=60)
    assert r2.status_code == 403
