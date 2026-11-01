"""개인 분석 결과 — 낸 사람만(10-31 PM "분석서비스를 통해서 개인이 분석한건 지도서비스에 보여주고 개인만 봐야지").

공식에서 내리기(options.official=false)는 개인 결과 · 공식 결과로 배포(options.official=true)는 공식 결과가 먼저다.
개인 결과 = 분석 서비스 카드에서 직원 · 관리자가 직접 돌린 분석(options.private) · 내 영상(own-…)으로 낸 분석 · 국토 변화 시점에 내 영상을 쓴 분석.
  → 낸 사람의 지도 서비스('내 분석')에만 보인다. 서비스 결과 장부 · XI맵 · 외부 API · 메인 공개 숫자 · 시군구 · 읍면동 요약 ·
    필지 대조(실태조사 잇기) · 카드 그림 자동 후보 · 기관 화면 · XI ChatGEO 지역 결과에는 들어가지 않는다.
공식 결과가 되는 길은 그대로 — 배포(배포 신청 → 승인 → 기관에 공유 · deploy_id · 배포본 지금/지난 결과) · 공개 판(published_sets)에
  쓰인 작업은 개인 결과가 아니다.
기준은 여기 한 곳(SQL 조각). 다른 모듈은 sql_public('j') 를 WHERE 에 붙인다(asyncpg · psycopg 모두 — 자리표 없음).
"""
from __future__ import annotations


def sql_private(a: str = "j") -> str:
    """작업 별칭 a 가 개인 결과면 참인 SQL 식."""
    return (f"(coalesce({a}.options->>'official', '') = 'false' OR (coalesce({a}.options->>'official', '') <> 'true' AND ("   # 관리자 '공식 결과로 배포' · '공식에서 내리기'가 먼저(official.py)
            f"coalesce({a}.options->>'private', '') = 'true' OR coalesce({a}.imagery_id, '') LIKE 'own-%' "
            f"OR coalesce({a}.options->'change'->'src_a'->>'id', '') LIKE 'own-%' OR coalesce({a}.options->'change'->'src_b'->>'id', '') LIKE 'own-%'))) "
            f"AND {a}.deploy_id IS NULL "
            f"AND NOT EXISTS (SELECT 1 FROM deploys _d WHERE _d.snapshot_current IN ({a}.id, 'results/' || {a}.tenant_id || '/' || {a}.id) "
            f"OR _d.snapshot_prev IN ({a}.id, 'results/' || {a}.tenant_id || '/' || {a}.id)) "
            f"AND NOT EXISTS (SELECT 1 FROM published_sets _p WHERE _p.job_id = {a}.id) "
            f"AND NOT EXISTS (SELECT 1 FROM change_runs _r JOIN change_shares _s ON _s.range_id = _r.range_id WHERE _r.job_id = {a}.id)")   # 기관에 공유한 대상지의 결과


def sql_public(a: str = "j") -> str:
    """' AND NOT (개인 결과)' — 공식 결과만 읽는 쿼리의 WHERE 뒤에 붙인다."""
    return f" AND NOT ({sql_private(a)})"


def sql_others(a: str, user_param: str) -> str:
    """다른 사람의 개인 결과면 참인 SQL 식(재사용 막기 — NOT EXISTS 안에)."""
    return f"(({sql_private(a)}) AND {a}.submitted_by IS DISTINCT FROM {user_param})"


def sql_visible(a: str, user_param: str) -> str:
    """' AND (공식 결과 · 또는 내 개인 결과)' — 남의 개인 결과만 뺀다(재사용 · 열기). user_param = 보는 사람 id 자리표('$5' · '%s')."""
    return f" AND NOT {sql_others(a, user_param)}"


async def others_private(conn, p, job_id: str | None) -> bool:
    """이 작업이 다른 사람의 개인 결과인가(보는 사람 = p). 관리자도 남의 개인 결과는 열지 않는다(10-31 PM '개인만 봐야지')."""
    if not job_id:
        return False
    return bool(await conn.fetchval(f"SELECT 1 FROM jobs j WHERE j.id = $1 AND ({sql_private('j')}) AND j.submitted_by IS DISTINCT FROM $2",
                                    str(job_id), getattr(p, "user_id", None) or ""))


async def guard(p, job_id: str | None, conn=None) -> None:
    """남의 개인 결과면 막는다(없는 것처럼 — 결과가 있다는 것도 알리지 않는다)."""
    if not job_id or not str(job_id).startswith("job_"):
        return
    from .deps import ApiError, db
    if conn is None:
        async with db(realm="lx") as c:
            hit = await others_private(c, p, job_id)
    else:
        hit = await others_private(conn, p, job_id)
    if hit:
        raise ApiError("not_found", "결과가 없습니다")


async def is_private(conn, job_id: str | None) -> bool:
    """개인 결과인가(낸 사람과 상관없이) — 공개되는 곳(카드 그림)에 쓰면 안 되는 결과."""
    if not job_id:
        return False
    return bool(await conn.fetchval(f"SELECT 1 FROM jobs j WHERE j.id = $1 AND ({sql_private('j')})", str(job_id)))
