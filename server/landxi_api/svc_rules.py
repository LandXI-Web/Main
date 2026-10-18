"""서비스 × 시군구 보이기 규칙(제안-곤포서비스남원공유 · 10-18 사용자 "곤포사일리지는 남원만.. 남원 자산이기 때문이다 보령은 제외" · 원칙 293).

표 service_region_rules(0111) 의 rule='exclude' 줄 = 그 (서비스, 시군구) 결과를 보이지 않는다 — XI맵 전국 결과 · 시군구 결과 층 ·
서비스 지역 · 메인 실적 숫자 · 외부 API. 결과 자체(작업 · 결과 묶음 · 배포 기록 · service_results)는 그대로 — 줄을 지우면 1분 안에 돌아온다.
어느 서비스 · 어느 시군구든 같은 길(서비스 id · 지역 코드를 코드에 두지 않는다 — 규칙은 데이터).
"""
from __future__ import annotations

import time

from .deps import db

_C: dict = {"t": 0.0, "v": frozenset()}
TTL = 60.0

# service_results(별칭 s) 를 읽는 SQL 에 붙이는 거르기 — 표가 없으면(되돌린 뒤) 아무것도 거르지 않는다
SQL_NOT_EXCLUDED = (" AND NOT EXISTS (SELECT 1 FROM service_region_rules x WHERE x.card_id = s.card_id AND x.sgg_cd = s.sgg_cd AND x.rule = 'exclude')")


async def excluded(conn=None) -> frozenset:
    """{(card_id, sgg_cd)} — 1분 기억."""
    if time.time() - _C["t"] < TTL:
        return _C["v"]
    try:
        if conn is None:
            async with db(realm="lx") as c:
                rows = await _read(c)
        else:
            rows = await _read(conn)
        _C.update(t=time.time(), v=frozenset((r["card_id"], r["sgg_cd"]) for r in rows))
    except Exception:  # noqa: BLE001 — 규칙을 못 읽으면 거르지 않는다(결과가 사라지는 쪽보다 낫다)
        _C.update(t=time.time(), v=frozenset())
    return _C["v"]


async def _read(c):
    if not await c.fetchval("SELECT to_regclass('service_region_rules') IS NOT NULL"):
        return []
    return await c.fetch("SELECT card_id, sgg_cd FROM service_region_rules WHERE rule = 'exclude'")


def hit(ex: frozenset, card: str | None, sgg: str | None) -> bool:
    """이 (서비스, 시군구) 를 뺄까 — 지역 코드는 원래 값과 지금 코드(행정구역 바뀜) 둘 다 본다."""
    if not ex or not card or not sgg:
        return False
    if (card, sgg) in ex:
        return True
    try:
        from .regions import region_of
        r = region_of(sgg)
    except Exception:  # noqa: BLE001
        r = None
    return bool(r) and ((card, r.get("sgg_cd")) in ex or (r.get("prev_cd") and (card, r["prev_cd"]) in ex))


def forget() -> None:
    _C.update(t=0.0)
