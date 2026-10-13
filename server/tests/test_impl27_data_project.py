"""구현 27 · 데이터하우스 없앰 · 새 프로젝트 한 창(10-13 10:41 확인 · 원칙 230 · 231 · 232).

① 구성원 찾기(GET /projects/people?q=) — 가입 승인된 LX 계정(LX 직원 · 관리자 · 사용 중)만. 나 자신 · 잠긴 · 사용 중지 · 영업 · 기관 계정은 없다.
   이름 · 메일 일부로 찾고, 메일은 응답에 내지 않는다. q 없이 부르면 예전 목록 그대로(프로젝트 한 장의 구성원 더하기 · 넘기기).
② 학습데이터 구축에서 올린 묶음의 이름표 → 클래스 한 곳(있는 이름은 그 클래스 · 새 이름은 새 클래스).
실행: python -m pytest server/tests/test_impl27_data_project.py -q   (게이트웨이 :8700)
"""
import asyncio

import asyncpg
import httpx
import psycopg
import pytest

from conftest import ADMIN_ID, B, STAFF_ID, config, login_lx

TMP = [("u_pytest27_find", "pytest27-find@lx.or.kr", "staff", "active", "시험 찾기 직원"),
       ("u_pytest27_lock", "pytest27-lock@lx.or.kr", "staff", "locked", "시험 잠긴 직원"),
       ("u_pytest27_off", "pytest27-off@lx.or.kr", "staff", "disabled", "시험 중지 직원"),
       ("u_pytest27_sales", "pytest27-sales@lx.or.kr", "sales", "active", "시험 영업")]


def H(t):
    return {"authorization": "Bearer " + t}


def sql(q, *a):
    with psycopg.connect(config.PG_ADMIN_DSN, autocommit=True) as c:
        cur = c.execute(q, a)
        return cur.fetchall() if cur.description else None


@pytest.fixture(scope="module")
def tok():
    for uid, *_ in TMP:
        sql("DELETE FROM lx_users WHERE id=%s", uid)
    for uid, login, role, status, name in TMP:
        sql("INSERT INTO lx_users(id, login, pw_hash, role, status, name) VALUES (%s,%s,'x',%s,%s,%s)", uid, login, role, status, name)
    yield login_lx()
    for uid, *_ in TMP:
        sql("DELETE FROM lx_users WHERE id=%s", uid)


def people(t, q=None):
    r = httpx.get(B + "/projects/people", params={} if q is None else {"q": q}, headers=H(t), timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["items"]


def test_people_search_signed_up_lx_only(tok):
    every = people(tok, "")
    ids = {x["id"] for x in every}
    assert STAFF_ID not in ids                                                   # 나 자신 없음
    assert ADMIN_ID in ids and "u_pytest27_find" in ids
    assert not ids & {"u_pytest27_lock", "u_pytest27_off", "u_pytest27_sales"}   # 잠긴 · 사용 중지 · 영업 없음
    assert all(set(x) == {"id", "name", "role_label"} for x in every)           # 메일 · 상태는 내지 않음
    assert [x["id"] for x in people(tok, "찾기")] == ["u_pytest27_find"]        # 이름 일부
    assert [x["id"] for x in people(tok, "pytest27-find")] == ["u_pytest27_find"]   # 메일 일부
    assert ADMIN_ID in {x["id"] for x in people(tok, "LXADMIN")}               # 메일 일부 · 큰 글자
    assert people(tok, "잠긴") == [] and people(tok, "pytest27-lock") == []
    assert people(tok, "없는사람xyz") == []
    # 기관 계정 이름으로 찾아도 기관 계정은 나오지 않는다
    tn = sql("SELECT id, name FROM tenant_users WHERE status='active' AND name IS NOT NULL LIMIT 1")
    if tn:
        assert tn[0][0] not in {x["id"] for x in people(tok, tn[0][1])}
    # q 없이 = 예전 목록(나 포함 · 구성원 더하기 · 넘기기 창)
    assert STAFF_ID in {x["id"] for x in people(tok)}


def test_sample_names_to_classes():
    from landxi_api.core import sample_classes_from_names
    sid, new = "smp_pytest27", "시험 이름표 새 클래스"

    async def go():
        c = await asyncpg.connect(config.PG_ADMIN_DSN)
        try:
            made = await sample_classes_from_names(c, sid, ["비닐하우스", new, "greenhouse"], STAFF_ID)
            rows = await c.fetch("SELECT c.name, c.status FROM sample_classes s JOIN classes c ON c.id=s.class_id WHERE s.sample_id=$1 ORDER BY c.name", sid)
            again = await sample_classes_from_names(c, sid, [new], STAFF_ID)
            return made, [tuple(r) for r in rows], again
        finally:
            ids = [r["class_id"] for r in await c.fetch("SELECT class_id FROM class_labels WHERE label=$1", new)]
            await c.execute("DELETE FROM sample_classes WHERE sample_id=$1", sid)
            await c.execute("DELETE FROM class_labels WHERE label=$1", new)
            await c.execute("DELETE FROM classes WHERE id = ANY($1::text[])", ids)
            await c.close()
    made, rows, again = asyncio.run(go())
    assert made == 1 and again == 0                                             # 새 이름 하나만 새 클래스 · 두 번째는 그 클래스
    assert rows == [("비닐하우스", "approved"), (new, "approved")]               # greenhouse = 비닐하우스(이름표)
    assert sql("SELECT count(*) FROM classes WHERE name=%s", new)[0][0] == 0
