"""워커 쪽(동기 psycopg) DB 읽기 · 쓰기 — 범위 도형 · 실행 끝 기록."""
from __future__ import annotations

import json


def _conn():
    from workers import bus
    c = bus.pg()
    bus.lx_tx(c)
    return c


def range_geoms(range_id: str):
    from shapely import wkb
    with _conn() as c:
        row = c.execute("SELECT ST_AsBinary(geom), ST_AsBinary(line), sgg FROM change_ranges WHERE id=%s", (range_id,)).fetchone()
    if not row:
        raise KeyError(f"range {range_id} 없음")
    rng = wkb.loads(bytes(row[0]))
    line = wkb.loads(bytes(row[1])) if row[1] else None
    return rng, line, list(row[2] or [])


def run_done(job_id: str, stats: dict):
    with _conn() as c:
        c.execute("UPDATE change_runs SET state='done', stats=%s::jsonb, done_at=now(), version=coalesce(%s, version) WHERE job_id=%s",
                  (json.dumps(stats, ensure_ascii=False), stats.get("version"), job_id))     # 실제로 계산한 방식(워커가 다시 읽은 판)
        c.commit()


def types_of(job_id: str) -> str | None:
    """작업 기록의 찾는 변화 묶음(options.change.types · 10-25 산사태 취약지구) — 없으면 None(국토 변화 기본)."""
    with _conn() as c:
        row = c.execute("SELECT options->'change'->>'types' FROM jobs WHERE id=%s", (job_id,)).fetchone()
    return row[0] if row and row[0] else None


def sources_of(job_id: str):
    """작업 기록의 시점별 영상 출처(없으면 None · None = 국토지리정보원 두 해)."""
    with _conn() as c:
        row = c.execute("SELECT options->'change'->'src_a', options->'change'->'src_b' FROM jobs WHERE id=%s", (job_id,)).fetchone()
    if not row:
        return None, None
    return row[0], row[1]
