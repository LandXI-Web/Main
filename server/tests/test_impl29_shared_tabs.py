"""구현 29 · LX 관리자 '공유 데이터' 탭 셋(10-14 공유데이터-탭 · 비공개-기관공유 · 원칙 240).

① 학습 데이터 탭 = GET /shared/train-data(LX 관리자만) — 장수는 학습 화면과 같은 셈(올린 묶음 n_images · 수정된 부분 /train-data/xi).
② 공개/내리기 = PATCH /training/samples/{id} {shared} — 공개된 묶음만 직원 GET /training/samples?shared=1(학습 화면 '공유 데이터에서 고르기').
③ 행정 자료 탭 = GET /shared/ledgers(읽기만) — 기관이 올린 대장 · 행 수.
④ 비공개 영상은 기관 쪽(요청하기 영상 목록 · 관리자 기관 공유 목록)에서도 빠진다 · 다시 공개하면 돌아온다.
실행: python -m pytest server/tests/test_impl29_shared_tabs.py -q   (게이트웨이 :8700)
"""
import httpx
import psycopg
import pytest

from conftest import ADMIN_LOGIN, B, config, login_lx, login_tenant

SID = "smp_pytest29sh"
IID = "img-pytest29-private"


def H(t):
    return {"authorization": "Bearer " + t}


def sql(q, *a):
    with psycopg.connect(config.PG_ADMIN_DSN, autocommit=True) as c:
        cur = c.execute(q, a)
        return cur.fetchall() if cur.description else None


def clean():
    sql("DELETE FROM imagery_shares WHERE imagery_id=%s", IID)
    sql("DELETE FROM imagery WHERE id=%s", IID)
    sql("DELETE FROM train_samples WHERE id=%s", SID)


@pytest.fixture(scope="module")
def tok():
    clean()
    sql("INSERT INTO train_samples(id, task_name, dir, names, n_images, n_train, n_val, status) VALUES "
        "(%s, '시험 공유 묶음', 'pytest-none', '[\"시험\"]'::jsonb, 7, 6, 1, 'ready')", SID)
    sql("INSERT INTO imagery(id, name, tier, gsd_m, epoch, kind, layer, sgg_cd, year, export_policy) VALUES "
        "(%s, %s::jsonb, 'raw', 0.25, '2024', 'ortho', '{\"role\":\"imagery\"}'::jsonb, '52190', 2024, 'never')",
        IID, '{"ko":"시험 비공개 영상","en":"test"}')
    sql("INSERT INTO imagery_shares(tenant_id, imagery_id, shared_by) VALUES ('namwon', %s, 'pytest') ON CONFLICT DO NOTHING", IID)
    yield {"staff": login_lx(), "admin": login_lx(ADMIN_LOGIN), "namwon": login_tenant("namwon")}
    clean()


def test_train_tab_same_numbers(tok):
    assert httpx.get(B + "/shared/train-data", headers=H(tok["staff"]), timeout=30).status_code == 403
    assert httpx.get(B + "/shared/train-data", headers=H(tok["namwon"]), timeout=30).status_code in (401, 403)
    r = httpx.get(B + "/shared/train-data", headers=H(tok["admin"]), timeout=60)
    assert r.status_code == 200, r.text
    items = r.json()["items"]
    me = next(x for x in items if x["id"] == SID)
    assert me["source"] == "sample" and me["images"]["value"] == 7 and me["shared"] is False and me["classes"] == ["시험"]
    for x in items:                                                     # 숫자 한 출처 — 학습 화면이 읽는 값과 같다
        pid = (x.get("project") or {}).get("id")
        if not pid:
            continue
        if x["source"] == "sample":
            j = httpx.get(B + "/training/samples", params={"project": pid}, headers=H(tok["staff"]), timeout=30).json()
            got = next((s for s in j["items"] if s["id"] == x["id"]), None)
            if got:
                assert got["images"]["value"] == x["images"]["value"]
        else:
            j = httpx.get(B + "/train-data/xi", params={"project": pid}, headers=H(tok["staff"]), timeout=30).json()
            assert j["tiles"]["value"] == x["images"]["value"]


def test_share_and_take_down(tok):
    ids = lambda: {s["id"] for s in httpx.get(B + "/training/samples", params={"shared": "1"}, headers=H(tok["staff"]), timeout=30).json()["items"]}  # noqa: E731
    assert SID not in ids()
    assert httpx.patch(f"{B}/training/samples/{SID}", json={"shared": True}, headers=H(tok["staff"]), timeout=30).status_code == 403
    r = httpx.patch(f"{B}/training/samples/{SID}", json={"shared": True}, headers=H(tok["admin"]), timeout=30)
    assert r.status_code == 200, r.text
    assert SID in ids()
    r = httpx.patch(f"{B}/training/samples/{SID}", json={"shared": False}, headers=H(tok["admin"]), timeout=30)
    assert r.status_code == 200, r.text
    assert SID not in ids()
    assert httpx.patch(f"{B}/training/samples/{SID}", json={}, headers=H(tok["admin"]), timeout=30).status_code == 400


def test_ledgers_read_only(tok):
    assert httpx.get(B + "/shared/ledgers", headers=H(tok["namwon"]), timeout=30).status_code in (401, 403)
    assert httpx.get(B + "/shared/ledgers", headers=H(tok["staff"]), timeout=30).status_code == 403
    r = httpx.get(B + "/shared/ledgers", headers=H(tok["admin"]), timeout=30)
    assert r.status_code == 200, r.text
    n = sql("SELECT count(*) FROM ledger_imports WHERE state <> 'failed'")[0][0]
    assert r.json()["total"] == min(n, 500)
    for x in r.json()["items"]:
        assert set(x) == {"id", "tenant", "name", "rows", "at"}             # 파일 이름 · 경로 없음


def test_private_hidden_from_tenant(tok):
    org = lambda: {x["id"] for x in httpx.get(B + "/requests/shared-imagery", headers=H(tok["namwon"]), timeout=30).json()["items"]}  # noqa: E731
    adm = lambda: {x["id"] for x in httpx.get(B + "/tenants/namwon/imagery-shares", headers=H(tok["admin"]), timeout=60).json()["items"]}  # noqa: E731
    assert IID in org() and IID in adm()
    assert httpx.patch(f"{B}/catalog/imagery/{IID}", json={"visible": False}, headers=H(tok["admin"]), timeout=30).status_code == 200
    assert IID not in org() and IID not in adm()
    assert httpx.patch(f"{B}/catalog/imagery/{IID}", json={"visible": True}, headers=H(tok["admin"]), timeout=30).status_code == 200
    assert IID in org() and IID in adm()
