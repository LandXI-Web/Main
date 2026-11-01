"""승인된 카드만 직원에게(11-01 PM "승인된 카드만 보인다") — landxi_api.card_gate 한 곳 기준 · 시험 DB(conftest).

① 공개 승인 = card_versions.approved_by · approved_at 이 채워진 판이 하나라도 있음
② 승인 전 카드는 LX 관리자 · 만든 사람(프로젝트장 · 카드 담당 · 공개 요청한 직원)에게만
③ 고를 수 없는 카드는 '없는 카드'(not_found)
"""
import asyncio

import asyncpg
import pytest

from landxi_api import card_gate as G
from landxi_api import config
from landxi_api.deps import ApiError, Principal


def _p(role, uid, realm="lx"):
    return Principal(realm=realm, role=role, user_id=uid, name="시험")


async def _case():
    c = await asyncpg.connect(config.PG_ADMIN_DSN)
    try:
        G.invalidate()
        ok = {r[0] for r in await c.fetch("SELECT DISTINCT card_id FROM card_versions WHERE approved_by IS NOT NULL AND approved_at IS NOT NULL")}
        pend = [r[0] for r in await c.fetch("SELECT id FROM cards c WHERE NOT EXISTS (SELECT 1 FROM card_versions v WHERE v.card_id=c.id AND v.approved_by IS NOT NULL)")]
        allc = [r[0] for r in await c.fetch("SELECT id FROM cards")]
        staff = _p("staff", "u_nobody_test")
        seen = await G.visible_ids(c, staff, allc)
        assert seen == ok & set(allc)
        assert await G.visible_ids(c, _p("admin", "u_mail_lxadmin"), allc) == set(allc)
        if pend:
            cid = pend[0]
            with pytest.raises(ApiError):
                await G.require(c, staff, cid)
            req = await c.fetchval("SELECT a.requested_by FROM approvals a JOIN card_versions v ON v.id=a.subject_id "
                                   "WHERE a.subject_type='card' AND v.card_id=$1 AND a.requested_by IS NOT NULL LIMIT 1", cid)
            own = await c.fetchval("SELECT owner_id FROM cards WHERE id=$1", cid)
            lead = await c.fetchval("SELECT p.lead_id FROM project_links l JOIN projects p ON p.id=l.project_id WHERE l.kind='card' AND l.ref=$1 LIMIT 1", cid)
            for maker in (req, own, lead):
                if maker:
                    assert await G.can_see(c, _p("staff", maker), cid)
        # 기관 · 메인(게스트)도 공개 승인된 카드만(만든 사람 예외 없음)
        assert await G.visible_ids(c, _p("manager", "x", realm="tenant"), allc) == ok & set(allc)
        assert await G.visible_ids(c, _p(None, None, realm=None), allc) == ok & set(allc)
    finally:
        await c.close()


def test_card_gate():
    asyncio.run(_case())
