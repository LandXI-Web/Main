"""계량(F1-CONTRACT §7) — shard 묶음마다 usage_events(dim='gpu_s', amount = 벽시계 s × GPU 1장, basis 'measured').
demo:true 면 tenant_id='lx-demo'(설계서 §10.4 — 기관 사용량에는 넣지 않되 관리자 합계는 정직하게). usage.delta 이벤트도 낸다.

기관 귀속(정리 작업 10-01 · 확인 요청 11차 '확인 없이 고칠 고장' ②): **분석을 요청한 기관**으로 적는다 = 작업을 낸 기관(jobs.tenant_id).
  LX(직원 · 관리자)가 돌린 분석은 LX 몫('lx') · 기관 분석 의뢰가 승인돼 도는 작업은 그 기관(requests._enqueue 가 tenant = 의뢰한 기관) ·
  영업 계량은 lx-demo 그대로. 예전 규칙(2026-09-29 ~ 10-01 · LEGACY_OWNER_EXPR — deploy_id → 그 배포본 기관, 없으면 작업 범위와 겹치는
  **가장 좁은 배포본**의 기관으로 짐작)은 남원 · 하동 분석이 이웃 구례군(광주전남) 몫으로 적히는 고장을 냈다 — 짐작은 하지 않는다.
  지난 기록(usage_events.tenant_id)은 고치지 않는다 — 읽는 쪽(quota._month_sums)도 기록된 기관 그대로 읽는다.
  새 규칙으로 지난 기록을 다시 세어 보는 도구: server/ops/recount_usage.py(기본은 보기만).
넓이(고장 ①): 작업 범위의 바깥 테두리가 아니라 실제로 분석한 땅 — analysis_area_km2().
학습 GPU 시간(고장 ③): gpu_worker.process_train 이 끝에 dim 'gpu_s' 한 줄(학습 벽시계 − 전력 규칙 대기).
"""
from __future__ import annotations

# jobs j 한 행 → 사용량을 가져갈 기관 id(SQL 식 · 별칭 j 필요) — 분석을 요청한 기관 = 작업을 낸 기관 그대로
OWNER_EXPR = "j.tenant_id"

# 저장 공간 귀속(quota.storage_of) — 그 기관 배포본(서비스)으로 낸 결과는 그 기관이 쓰는 저장, 그 밖은 작업을 낸 기관.
# 저장은 지난 기록이 아니라 지금 남아 있는 파일이므로 지금 규칙으로 센다. 겹치는 범위로 짐작하는 규칙(예전 ②)은 쓰지 않는다.
STORE_OWNER_EXPR = """CASE WHEN j.tenant_id <> 'lx-demo' THEN coalesce((SELECT d.tenant_id FROM deploys d WHERE d.id = j.deploy_id), j.tenant_id)
  ELSE j.tenant_id END"""

# 예전 규칙(2026-09-29 ~ 10-01) — 비교용(ops/recount_usage.py · 시험)으로만 남긴다. 계량 · 화면은 쓰지 않는다.
LEGACY_OWNER_EXPR = """CASE WHEN j.tenant_id <> 'lx-demo' AND (SELECT t.kind FROM tenants t WHERE t.id = j.tenant_id) = 'maker' THEN coalesce(
  (SELECT d.tenant_id FROM deploys d WHERE d.id = j.deploy_id),
  (SELECT d.tenant_id FROM deploys d
     WHERE d.tenant_id <> 'lx-demo' AND NOT coalesce(d.test, false) AND d.aoi IS NOT NULL
       AND ST_Intersects(d.aoi, coalesce(j.aoi, (SELECT i.footprint FROM imagery i WHERE i.id = j.imagery_id)))
     ORDER BY ST_Area(d.aoi) ASC, d.id LIMIT 1),
  j.tenant_id) ELSE j.tenant_id END"""


def analysis_area_km2(aoi: dict | None, opts: dict | None, footprint: dict | None = None) -> float | None:
    """실제로 분석한 땅의 넓이(㎢ · EPSG:5186) — 고장 ① '바깥 테두리로 재어 바다까지 셈'을 고친다.
    · 시군구 전역(options.scope 'sgg'): 견적이 계산해 작업에 넘긴 '시군구 읍면동 ∩ 영상' 넓이(options.area_km2 — 확인 카드 · 진행판과 같은 값).
      작업 범위(aoi)는 그 범위를 감싼 바깥 테두리(jobs._hull)라 섬 사이 바다 · 이웃 땅까지 들어가 쓰지 않는다.
    · 그 밖(읍면동 · 그린 범위 · 영상 일부): 작업 범위 ∩ 영상 footprint(영상 밖은 분석하지 않았다).
    · 범위가 없으면 None(계량하지 않음 — 예전과 같음)."""
    from shapely.geometry import mapping, shape
    from workers.tiling import area_km2
    o = opts or {}
    if o.get("scope") == "sgg" and o.get("area_km2") is not None:
        try:
            return round(float(o["area_km2"]), 4)
        except (TypeError, ValueError):
            pass
    if not aoi:
        return None
    g = shape(aoi)
    if not g.is_valid:
        g = g.buffer(0)
    if footprint:
        try:
            f = shape(footprint)
            g = g.intersection(f if f.is_valid else f.buffer(0))
        except Exception:  # noqa: BLE001 — footprint 가 깨졌으면 범위 그대로
            pass
    if g.is_empty:
        return 0.0
    return round(area_km2(mapping(g)), 4)


_owner_cache: dict[str, str] = {}


def owner_of(conn, job_id: str, tenant: str) -> str:
    """작업 → 기관 id(작업당 1회 조회 후 프로세스 캐시). 조회 실패 시 작업을 낸 기관 그대로(계량이 멈추면 안 된다)."""
    if job_id in _owner_cache:
        return _owner_cache[job_id]
    try:
        conn.execute("SAVEPOINT lx_owner")
        row = conn.execute(f"SELECT {OWNER_EXPR} FROM jobs j WHERE j.id = %s", (job_id,)).fetchone()
        conn.execute("RELEASE SAVEPOINT lx_owner")
        t = (row[0] if row and row[0] else None) or tenant
    except Exception:
        try:
            conn.execute("ROLLBACK TO SAVEPOINT lx_owner")
        except Exception:
            pass
        return tenant
    if len(_owner_cache) > 4096:
        _owner_cache.clear()
    _owner_cache[job_id] = t
    return t


def meter(conn, *, tenant: str, demo: bool, job_id: str, dim: str, amount: float, basis: str = "measured"):
    from .bus import lx_tx, now_iso, ops_event, r
    lx_tx(conn)
    t = "lx-demo" if demo else owner_of(conn, job_id, tenant)
    conn.execute("INSERT INTO usage_events(tenant_id, dim, amount, job_id, basis) VALUES (%s,%s,%s,%s,%s)", (t, dim, amount, job_id, basis))
    if dim == "gpu_s":
        r().hincrbyfloat(f"job:{job_id}", "gpu_s", amount)
    ops_event("usage.delta", {"tenant_id": t, "dim": dim + ("_month" if dim in ("gpu_s", "area_km2") else ""), "amount": round(amount, 3),
                              "job_id": job_id, "at": now_iso()})
