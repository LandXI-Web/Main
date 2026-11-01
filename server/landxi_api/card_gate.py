"""직원이 고를 수 있는 카드 = 공개 승인된 카드만(11-01 PM "승인된 카드만 보인다") — 한 곳 기준.

공개 승인됨 = 그 카드의 판(card_versions) 가운데 하나라도 LX 관리자가 '서비스 공개' 결재를 마친 것
             (approvals.decide 의 subject_type 'card' 승인 → card_versions.approved_by · approved_at 이 채워짐).
             cards.status_history(검토 · 운영 …)는 소개 말이라 기준으로 쓰지 않는다.
승인 전(검토 중 · 승인 요청 중) 카드는 다음 사람에게만 보인다:
  · LX 관리자
  · 만든 사람 — 카드를 만든 프로젝트의 프로젝트장(project_links kind 'card') · 카드 담당(cards.owner_id) · 그 카드의 공개 승인을 요청한 직원(approvals.requested_by)
화면에서 숨기지 않고 서버가 거른다: 직원 분석 서비스 목록(/cards/deck) · 카드 한 장(/cards/{카드} 와 그 아래 경로) · 이 카드로 분석(/cards/{카드}/analyze ·
/change/runs) · XI ChatGEO 안내 단추.
기관 화면 · 메인(게스트)도 같은 기준(공개 승인된 카드만 · 만든 사람 예외 없음) — 그 위에 배포 · 기관 공유 기준이 더해진다.
결과 숫자(메인 · XI맵 · 외부 API · 기관)는 svc_rules.SQL_NOT_EXCLUDED · hit 가 같은 기준으로 거른다.
"""
from __future__ import annotations

import time

from .deps import ApiError

_C: dict = {"t": 0.0, "ok": set(), "makers": {}}
TTL = 20.0


async def _load(conn) -> tuple[set, dict]:
    if time.time() - _C["t"] < TTL:
        return _C["ok"], _C["makers"]
    ok = {r["card_id"] for r in await conn.fetch("SELECT DISTINCT card_id FROM card_versions WHERE approved_by IS NOT NULL AND approved_at IS NOT NULL")}
    makers: dict[str, set] = {}
    for r in await conn.fetch("SELECT id, owner_id FROM cards WHERE owner_id IS NOT NULL"):
        makers.setdefault(r["id"], set()).add(r["owner_id"])
    for r in await conn.fetch("SELECT l.ref AS cid, p.lead_id FROM project_links l JOIN projects p ON p.id = l.project_id "
                              "WHERE l.kind = 'card' AND p.lead_id IS NOT NULL"):
        makers.setdefault(r["cid"], set()).add(r["lead_id"])
    for r in await conn.fetch("SELECT v.card_id, a.requested_by FROM approvals a JOIN card_versions v ON v.id = a.subject_id "
                              "WHERE a.subject_type = 'card' AND a.requested_by IS NOT NULL"):
        makers.setdefault(r["card_id"], set()).add(r["requested_by"])
    _C.update(t=time.time(), ok=ok, makers=makers)
    return ok, makers


def invalidate():
    _C["t"] = 0.0


def _admin(p) -> bool:
    return bool(getattr(p, "is_admin", False)) or getattr(p, "role", None) == "admin"


async def visible_ids(conn, p, ids) -> set:
    """ids 가운데 이 사람이 고를 수 있는 카드."""
    ids = set(ids)
    if getattr(p, "realm", None) == "lx" and _admin(p):          # LX 관리자는 모두
        return ids
    ok, makers = await _load(conn)
    if getattr(p, "realm", None) != "lx":                         # 기관 · 메인(게스트) — 공개 승인된 카드만(만든 사람 예외 없음 · 11-01 PM "메인 기관 화면 기준도 맞춘다")
        return {c for c in ids if c in ok}
    uid = getattr(p, "user_id", None)
    return {c for c in ids if c in ok or (uid and uid in makers.get(c, ()))}


async def can_see(conn, p, cid: str) -> bool:
    return cid in await visible_ids(conn, p, [cid])


async def require(conn, p, cid: str):
    """고를 수 없는 카드면 '없는 카드'(있는지도 드러내지 않음)."""
    if cid and not await can_see(conn, p, cid):
        raise ApiError("not_found", "카드가 없습니다")
