"""구현 28 · LX 관리자 '공유 데이터'(10-13 13:42 관리자-공유데이터 · 원칙 238).

① 목록 = 직원 '공유 데이터에서 고르기'와 같은 GET /projects/imagery(관리자는 ?all=1 로 비공개까지 · visible). total 은 직원에게 보이는 수.
② 공개/비공개 · 정보 고치기(이름 · 촬영 연도) = PATCH /catalog/imagery/{id} — LX 관리자만.
③ 지우기 = DELETE /catalog/imagery/{id} — LX 관리자만 · 분석에 쓴 영상은 409.
④ 기관 계정은 목록도 못 본다.
실행: python -m pytest server/tests/test_impl28_shared_data.py -q   (게이트웨이 :8700)
"""
import httpx
import psycopg
import pytest

from conftest import ADMIN_LOGIN, B, config, login_lx, login_tenant

IID = "img-pytest28-shared"
JID = "job_pytest28_shared"


def H(t):
    return {"authorization": "Bearer " + t}


def sql(q, *a):
    with psycopg.connect(config.PG_ADMIN_DSN, autocommit=True) as c:
        cur = c.execute(q, a)
        return cur.fetchall() if cur.description else None


def clean():
    sql("DELETE FROM jobs WHERE id=%s", JID)
    sql("DELETE FROM imagery WHERE id=%s", IID)


@pytest.fixture(scope="module")
def tok():
    clean()
    sql("INSERT INTO imagery(id, name, tier, gsd_m, epoch, kind, layer, sgg_cd, year, export_policy) VALUES "
        "(%s, %s::jsonb, 'raw', 0.25, '2024', 'ortho', '{\"role\":\"imagery\"}'::jsonb, '52190', 2024, 'never')",
        IID, '{"ko":"시험 공유 영상","en":"test"}')
    yield {"staff": login_lx(), "admin": login_lx(ADMIN_LOGIN)}
    clean()


def lst(t, every=False):
    r = httpx.get(B + "/projects/imagery", params={"all": "1"} if every else {}, headers=H(t), timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


def test_same_list_and_visibility(tok):
    s0, a0 = lst(tok["staff"]), lst(tok["admin"], True)
    assert IID in {x["id"] for x in s0["items"]}
    assert s0["total"]["value"] == len(s0["items"]) == a0["total"]["value"]          # 숫자 한 출처
    assert "visible" not in s0["items"][0] and next(x for x in a0["items"] if x["id"] == IID)["visible"] is True
    # 직원은 고치거나 지울 수 없다
    assert httpx.patch(f"{B}/catalog/imagery/{IID}", json={"visible": False}, headers=H(tok["staff"]), timeout=30).status_code == 403
    assert httpx.delete(f"{B}/catalog/imagery/{IID}", headers=H(tok["staff"]), timeout=30).status_code == 403
    # 비공개 → 직원 목록에서 빠지고 수가 하나 준다 · 관리자 목록에는 남는다
    r = httpx.patch(f"{B}/catalog/imagery/{IID}", json={"visible": False}, headers=H(tok["admin"]), timeout=30)
    assert r.status_code == 200, r.text
    s1, a1 = lst(tok["staff"]), lst(tok["admin"], True)
    assert IID not in {x["id"] for x in s1["items"]} and s1["total"]["value"] == s0["total"]["value"] - 1
    assert next(x for x in a1["items"] if x["id"] == IID)["visible"] is False and a1["total"]["value"] == s1["total"]["value"]
    # 정보 고치기
    r = httpx.patch(f"{B}/catalog/imagery/{IID}", json={"name": "시험 공유 영상 2", "year": 2025, "visible": True}, headers=H(tok["admin"]), timeout=30)
    assert r.status_code == 200, r.text
    it = next(x for x in lst(tok["staff"])["items"] if x["id"] == IID)
    assert it["name"] == "시험 공유 영상 2" and it["year"] == 2025
    assert httpx.patch(f"{B}/catalog/imagery/{IID}", json={"name": " "}, headers=H(tok["admin"]), timeout=30).status_code == 400
    assert httpx.patch(f"{B}/catalog/imagery/{IID}", json={"year": 1800}, headers=H(tok["admin"]), timeout=30).status_code == 400


def test_delete_guard_and_delete(tok):
    sql("INSERT INTO jobs(id, kind, state, imagery_id) VALUES (%s, 'infer', 'done', %s)", JID, IID)
    r = httpx.delete(f"{B}/catalog/imagery/{IID}", headers=H(tok["admin"]), timeout=30)
    assert r.status_code == 409, r.text                                                # 분석에 쓴 영상은 지우지 않는다
    sql("DELETE FROM jobs WHERE id=%s", JID)
    r = httpx.delete(f"{B}/catalog/imagery/{IID}", headers=H(tok["admin"]), timeout=30)
    assert r.status_code == 200, r.text
    assert not sql("SELECT 1 FROM imagery WHERE id=%s", IID)
    assert httpx.delete(f"{B}/catalog/imagery/{IID}", headers=H(tok["admin"]), timeout=30).status_code == 404


def test_tenant_cannot_see():
    t = login_tenant("namwon")
    assert httpx.get(B + "/projects/imagery", params={"all": "1"}, headers=H(t), timeout=30).status_code in (401, 403)
