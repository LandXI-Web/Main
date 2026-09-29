"""계량(F1-CONTRACT §7) — shard 묶음마다 usage_events(dim='gpu_s', amount = 벽시계 s × GPU 1장, basis 'measured').
demo:true 면 tenant_id='lx-demo'(설계서 §10.4 — 기관 쿼터에는 넣지 않되 관제 합계는 정직하게). usage.delta 이벤트도 낸다.

기관 귀속(fix-admin-usage · 2026-09-29): LX(maker)가 기관을 위해 대신 돌린 작업은 그 기관 id 로 기록한다.
  ① 작업의 deploy_id → 그 배포본의 기관
  ② 없으면 작업 AOI(없으면 영상 footprint)와 겹치는 배포본 중 **가장 좁은 것**의 기관(지역 하드코딩 없음 · 광역 배포본보다 시군구 배포본 우선)
  ③ 그래도 없으면 작업을 낸 기관 그대로.
같은 규칙을 게이트웨이(quota.py 저장 공간 귀속)와 백필이 OWNER_EXPR 한 곳에서 쓴다.
"""
from __future__ import annotations

# jobs j 한 행 → 사용량을 가져갈 기관 id(SQL 식 · 별칭 j 필요). maker 가 아닌 기관이 직접 낸 작업은 그대로.
OWNER_EXPR = """CASE WHEN j.tenant_id <> 'lx-demo' AND (SELECT t.kind FROM tenants t WHERE t.id = j.tenant_id) = 'maker' THEN coalesce(
  (SELECT d.tenant_id FROM deploys d WHERE d.id = j.deploy_id),
  (SELECT d.tenant_id FROM deploys d
     WHERE d.tenant_id <> 'lx-demo' AND NOT coalesce(d.test, false) AND d.aoi IS NOT NULL
       AND ST_Intersects(d.aoi, coalesce(j.aoi, (SELECT i.footprint FROM imagery i WHERE i.id = j.imagery_id)))
     ORDER BY ST_Area(d.aoi) ASC, d.id LIMIT 1),
  j.tenant_id) ELSE j.tenant_id END"""

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
