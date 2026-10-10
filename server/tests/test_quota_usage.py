"""기관 사용량 실집계(저장 공간 · GPU 시간 · 분석 면적) + 장부 고장 셋(정리 작업 10-01 · 확인 요청 11차 '확인 없이 고칠 고장').
② 귀속 = 분석을 요청한 기관(작업을 낸 기관 · LX 가 돌린 것은 LX 몫) — 겹치는 가장 좁은 배포본 기관으로 짐작하지 않는다 · 읽는 쪽도 기록 그대로.
① 넓이 = 실제로 분석한 땅(시군구 전역 = 견적의 '읍면동 ∩ 영상' · 그 밖 = 범위 ∩ 영상) — 바깥 테두리(바다 포함)로 재지 않는다.
③ 학습 GPU 시간 = 학습 끝에 사용 기록 한 줄.
지난 기록(usage_events)은 고치지 않는다 — 다시 세어 보기만 하는 도구 server/ops/recount_usage.py.
게이트웨이(:8700)와 DB 에 직접 대조한다. 지역 이름을 하드코딩하지 않는다 — 기관 · 작업은 DB 에서 고른다. GPU 0(분석 · 학습 실행 없음)."""
import datetime as dt
import sys
import time
from pathlib import Path

import httpx
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from landxi_api import config  # noqa: E402
from conftest import H  # noqa: E402
from workers import metering  # noqa: E402
from workers.metering import OWNER_EXPR, STORE_OWNER_EXPR, analysis_area_km2  # noqa: E402

KST = dt.timezone(dt.timedelta(hours=9))
TOL = 0.01          # 값이 같아야 한다(반올림 3자리 · 조회 사이에 새 계량이 들어오면 커질 수만 있어 아래에서 ≥ 로 본다)
FIX_AT = dt.datetime(2026, 10, 1, 10, 0, tzinfo=KST)    # 정리 작업(새 계량 규칙)이 들어간 때 — 이 뒤 기록부터 새 규칙


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
    """이번 달 usage_events 합(기록된 기관 × dim) — 게이트웨이와 같은 규칙(다시 귀속하지 않음)을 SQL 로 직접."""
    rows = c.execute("SELECT u.tenant_id, u.dim, sum(u.amount) FROM usage_events u "
                     "WHERE u.at >= %s AND u.dim IN ('gpu_s','area_km2') GROUP BY 1, 2", (_month_start(),)).fetchall()
    return {(t, d): float(v or 0) for t, d, v in rows}


@pytest.fixture(scope="module")
def ops_tenants(live, tok):
    r = httpx.get(live + "/ops/tenants", headers=H(tok["admin"]), timeout=120)
    assert r.status_code == 200, r.text[:300]
    return {it["tenant_id"]: it for it in r.json()["items"]}


# ── ② 귀속 = 분석을 요청한 기관 ──────────────────────────────────────────────────
def test_owner_rule_is_requesting_tenant():
    """② 모든 작업의 사용량 기관 = 작업을 낸 기관(LX 작업은 'lx' · 기관 작업 · 영업 계량 lx-demo 그대로) — 배포본 범위로 짐작하지 않는다."""
    c = _pg()
    bad = c.execute(f"SELECT j.id, j.tenant_id, ({OWNER_EXPR}) FROM jobs j WHERE ({OWNER_EXPR}) IS DISTINCT FROM j.tenant_id LIMIT 5").fetchall()
    assert not bad, bad
    assert "ST_Intersects" not in OWNER_EXPR and "ST_Area" not in OWNER_EXPR and "ST_Intersects" not in STORE_OWNER_EXPR


def test_lx_job_near_tenant_stays_lx():
    """예전 고장 재현 자리 — 기관 배포본 범위와 겹치는 LX 작업(배포본 id 없음)도 LX 몫. 예전 규칙(LEGACY)은 이웃 기관으로 옮겼다."""
    c = _pg()
    rows = c.execute(f"SELECT j.id, ({OWNER_EXPR}), ({metering.LEGACY_OWNER_EXPR}) FROM jobs j WHERE NOT j.demo AND j.tenant_id = 'lx' "
                     "AND j.deploy_id IS NULL AND j.kind IN ('infer','reinfer') LIMIT 300").fetchall()
    if not rows:
        pytest.skip("대상 작업 없음")
    assert all(o == "lx" for _, o, _ in rows)
    # 예전 규칙이 이웃 기관 몫으로 옮기던 작업이 실제로 있었다(남원 · 하동 → 광주전남 같은 것) — 새 규칙은 옮기지 않는다
    moved = [(j, legacy) for j, o, legacy in rows if legacy != "lx"]
    assert moved, "예전 규칙으로도 옮겨지는 작업이 없음 — 재현 자리 없음"


def test_store_owner_keeps_service_results_only():
    """저장 공간 귀속 — 그 기관 배포본(서비스)으로 낸 결과는 그 기관 · 그 밖 LX 작업은 LX(겹치는 범위로 짐작하지 않음)."""
    c = _pg()
    bad = c.execute(f"SELECT j.id FROM jobs j LEFT JOIN deploys d ON d.id = j.deploy_id WHERE j.tenant_id <> 'lx-demo' "
                    f"AND ({STORE_OWNER_EXPR}) IS DISTINCT FROM coalesce(d.tenant_id, j.tenant_id) LIMIT 5").fetchall()
    assert not bad, bad


def test_new_rows_follow_new_rule():
    """정리 작업 뒤 기록된 사용량은 작업을 낸 기관으로 적혀 있다(작업기가 새 규칙으로 쓴다 · 영업 계량 제외)."""
    c = _pg()
    bad = c.execute("SELECT u.id, u.tenant_id, j.tenant_id FROM usage_events u JOIN jobs j ON j.id = u.job_id "
                    "WHERE u.at >= greatest(%s::timestamptz, %s::timestamptz) AND u.tenant_id <> 'lx-demo' AND NOT j.demo "
                    "AND u.tenant_id <> j.tenant_id LIMIT 5", (_month_start(), FIX_AT)).fetchall()
    assert not bad, bad


def test_month_sums_read_recorded_tenant(live, tok):
    """읽는 쪽은 기록된 기관 그대로 센다(지난 기록을 새 규칙으로 다시 귀속하지 않는다) — LX 작업 id 로 기관 이름을 적은 시험 행이
    그 기관 값에 그대로 더해진다."""
    c = _pg()
    t = c.execute("SELECT id FROM tenants WHERE kind='user' ORDER BY id LIMIT 1").fetchone()
    j = c.execute("SELECT id FROM jobs WHERE tenant_id='lx' AND NOT demo AND aoi IS NULL LIMIT 1").fetchone()   # 범위 없는 작업 = 적힌 값 그대로(합집합 밖)
    if not (t and j):
        pytest.skip("기관 · LX 작업 없음")
    tid, jid = t[0], j[0]

    def read():
        r = httpx.get(live + f"/t/{tid}/usage", headers=H(tok["admin"]), timeout=60)
        assert r.status_code == 200, r.text[:200]
        return float(r.json()["dims"]["area_km2_month"]["used"]["value"] or 0)
    time.sleep(10.5)                                    # 게이트웨이 이번 달 합 보관(10 s)
    before = read()
    row = c.execute("INSERT INTO usage_events(tenant_id, dim, amount, job_id, basis) VALUES (%s,'area_km2',123.456,%s,'measured') RETURNING id",
                    (tid, jid)).fetchone()[0]
    c.commit()
    try:
        time.sleep(10.5)
        after = read()
        assert abs(after - before - 123.456) < 0.01, (before, after)       # 작업은 LX 것이지만 기록된 기관(tid) 몫으로 — 다시 귀속 0
    finally:
        c.execute("DELETE FROM usage_events WHERE id=%s", (row,))
        c.commit()
        time.sleep(10.5)                                # 시험 행이 게이트웨이 보관(10 s)에서 빠질 때까지 — 뒤 시험이 지운 행을 보지 않게


# ── ① 넓이 = 실제로 분석한 땅 ─────────────────────────────────────────────────────
SQ = {"type": "Polygon", "coordinates": [[[127.0, 35.0], [127.02, 35.0], [127.02, 35.02], [127.0, 35.02], [127.0, 35.0]]]}
HALF = {"type": "Polygon", "coordinates": [[[127.0, 35.0], [127.01, 35.0], [127.01, 35.02], [127.0, 35.02], [127.0, 35.0]]]}


def test_area_sgg_uses_land_not_hull():
    """① 시군구 전역 — 바깥 테두리(aoi) 대신 견적의 '읍면동 ∩ 영상' 넓이(options.area_km2)."""
    assert analysis_area_km2(SQ, {"scope": "sgg", "area_km2": 145.71}) == 145.71
    hull = analysis_area_km2(SQ, {})
    assert hull and hull > 3                            # 같은 범위를 테두리로 재면 약 4㎢(이 범위) — 시군구 값과 다르다


def test_area_clipped_to_imagery():
    """① 읍면동 · 그린 범위 — 범위 ∩ 영상 footprint(영상 밖은 분석하지 않았다) · 겹침 없음 = 0 · 범위 없음 = 계량 안 함."""
    full, half = analysis_area_km2(SQ, {}), analysis_area_km2(SQ, {}, HALF)
    assert half == pytest.approx(full / 2, rel=0.02)
    far = {"type": "Polygon", "coordinates": [[[128.0, 36.0], [128.01, 36.0], [128.01, 36.01], [128.0, 36.01], [128.0, 36.0]]]}
    assert analysis_area_km2(SQ, {}, far) == 0.0
    assert analysis_area_km2(None, {}) is None


def _fn_src(rel: str, name: str) -> str:
    """작업기 파일은 불러오면 명령줄 인자를 읽는다 — 파일에서 함수 글만 꺼내 본다(불러오기 · GPU 0)."""
    import ast
    f = Path(__file__).resolve().parents[1] / rel
    text = f.read_text(encoding="utf-8")
    node = next(n for n in ast.walk(ast.parse(text)) if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == name)
    return ast.get_source_segment(text, node)


def test_cpu_worker_meters_land_area():
    """① 작업기가 넓이를 analysis_area_km2 로 잰다(작업 범위 넓이 그대로 쓰던 줄이 없다)."""
    src = _fn_src("workers/cpu_worker.py", "finalize")
    assert "analysis_area_km2(" in src and 'amount=round(area_km2(json.loads(jh["aoi"]))' not in src


def test_recorded_sgg_area_matches_land_from_now():
    """① 정리 작업 뒤 시군구 전역 작업의 넓이 기록 = 견적의 실제 분석 땅(options.area_km2)."""
    c = _pg()
    bad = c.execute("SELECT u.job_id, u.amount, (j.options->>'area_km2')::float FROM usage_events u JOIN jobs j ON j.id = u.job_id "
                    "WHERE u.dim='area_km2' AND u.at >= %s AND j.options->>'scope'='sgg' AND j.options ? 'area_km2' "
                    "AND abs(u.amount - (j.options->>'area_km2')::float) > 0.01 LIMIT 5", (FIX_AT,)).fetchall()
    assert not bad, bad


# ── ③ 학습 GPU 시간 ──────────────────────────────────────────────────────────────
def test_train_meters_gpu_seconds():
    """③ 학습 끝(성공 · 실패)에 사용 기록 한 줄 — dim gpu_s · 벽시계 − 전력 대기 · 작업의 기관. GPU 없이: 코드 자리 + 계량 함수로 확인."""
    src = _fn_src("workers/gpu_worker.py", "process_train")
    assert 'dim="gpu_s"' in src and 'el - held["s"]' in src and "meter(" in src
    c = _pg()
    jid = "job_pytest_train_meter"
    c.execute("DELETE FROM usage_events WHERE job_id=%s", (jid,))
    c.execute("INSERT INTO jobs(id, tenant_id, submitted_by, kind, state, priority, demo, pool, label, test) "
              "VALUES (%s,'lx','pytest','train','done',0,false,'a6000','pytest 학습 계량',true) ON CONFLICT (id) DO NOTHING", (jid,))
    c.commit()
    try:
        metering._owner_cache.pop(jid, None)
        metering.meter(c, tenant="lx", demo=False, job_id=jid, dim="gpu_s", amount=42.5)
        c.commit()
        row = c.execute("SELECT tenant_id, dim, amount FROM usage_events WHERE job_id=%s", (jid,)).fetchone()
        assert row and row[0] == "lx" and row[1] == "gpu_s" and float(row[2]) == 42.5
    finally:
        c.execute("DELETE FROM usage_events WHERE job_id=%s", (jid,))
        c.execute("DELETE FROM jobs WHERE id=%s", (jid,))
        c.commit()


def test_recount_tool_reads_only():
    """다시 세어 보기 도구 — 기본은 보기만(9월 기록 합이 그대로) · 기간 없이 쓰기는 거절."""
    from ops import recount_usage as RC
    c = _pg()
    q = "SELECT count(*), coalesce(sum(amount),0) FROM usage_events WHERE at >= '2026-09-01' AND at < '2026-10-01'"
    n0 = c.execute(q).fetchone()
    c.commit()
    assert RC.main(["--since", "2026-09-01", "--until", "2026-10-01", "--json"]) == 0
    assert RC.main(["--write"]) == 2
    n1 = c.execute(q).fetchone()
    assert n1 == n0                                     # 보기만 — 지난 기록을 바꾸지 않음


# ── 화면이 읽는 값 = DB ───────────────────────────────────────────────────────────
def test_gpu_area_match_db(ops_tenants):
    """/ops/tenants 의 GPU 시간 · 분석 면적 = DB 기록 합(기관 전부 · 지역 이름 없이)."""
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


def test_area_month_union_counts_overlap_once(live, tok):
    """나중 1 ⓑ — 분석한 면적 = 겹치지 않는 실제 면적. 같은 작업(같은 땅)을 두 번 적어도 한 번만 센다."""
    c = _pg()
    t = c.execute("SELECT id FROM tenants WHERE kind='user' ORDER BY id LIMIT 1").fetchone()
    j = c.execute("SELECT id FROM jobs WHERE tenant_id='lx' AND NOT demo AND aoi IS NOT NULL AND kind='infer' LIMIT 1").fetchone()
    if not (t and j):
        pytest.skip("기관 · 범위 있는 작업 없음")
    tid, jid = t[0], j[0]

    def read():
        r = httpx.get(live + f"/t/{tid}/usage", headers=H(tok["admin"]), timeout=60)
        assert r.status_code == 200, r.text[:200]
        return float(r.json()["dims"]["area_km2_month"]["used"]["value"] or 0)
    time.sleep(10.5)
    rows = []
    try:
        before = read()
        rows.append(c.execute("INSERT INTO usage_events(tenant_id, dim, amount, job_id, basis) VALUES (%s,'area_km2',50,%s,'measured') RETURNING id",
                              (tid, jid)).fetchone()[0])
        c.commit()
        time.sleep(10.5)
        once = read()
        rows.append(c.execute("INSERT INTO usage_events(tenant_id, dim, amount, job_id, basis) VALUES (%s,'area_km2',50,%s,'measured') RETURNING id",
                              (tid, jid)).fetchone()[0])
        c.commit()
        time.sleep(10.5)
        twice = read()
        assert once >= before
        assert abs(twice - once) < 0.01, (before, once, twice)          # 같은 땅 두 번 = 한 번
    finally:
        for r in rows:
            c.execute("DELETE FROM usage_events WHERE id=%s", (r,))
        c.commit()
        time.sleep(10.5)
