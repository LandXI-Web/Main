"""계량(F1-CONTRACT §7) — shard 묶음마다 usage_events(dim='gpu_s', amount = 벽시계 s × GPU 1장, basis 'measured').
demo:true 면 tenant_id='lx-demo'(설계서 §10.4 — 기관 쿼터에는 넣지 않되 관제 합계는 정직하게). usage.delta 이벤트도 낸다.
"""
from __future__ import annotations

from .bus import lx_tx, now_iso, ops_event, r


def meter(conn, *, tenant: str, demo: bool, job_id: str, dim: str, amount: float, basis: str = "measured"):
    t = "lx-demo" if demo else tenant
    lx_tx(conn)
    conn.execute("INSERT INTO usage_events(tenant_id, dim, amount, job_id, basis) VALUES (%s,%s,%s,%s,%s)", (t, dim, amount, job_id, basis))
    if dim == "gpu_s":
        r().hincrbyfloat(f"job:{job_id}", "gpu_s", amount)
    ops_event("usage.delta", {"tenant_id": t, "dim": dim + ("_month" if dim in ("gpu_s", "area_km2") else ""), "amount": round(amount, 3),
                              "job_id": job_id, "at": now_iso()})
