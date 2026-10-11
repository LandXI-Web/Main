"""impl-13 분야(카테고리) 관리(now 질문 5 '이대로 구현' · 원칙 165) — 코드 상수 → 분야 표 · 관리자 만들기 · 이름 · 순서 · 서비스 여러 분야 · 신청서 값.

시험으로 만든 분야 · 바꾼 순서 · 카드 분야는 끝나면 되돌린다(진행 중 데이터 0 변경). GPU 0.
"""
import secrets

import httpx
import psycopg

from conftest import B, H
from landxi_api import config
from landxi_api.categories import clean_form, kinds_from

OLD = ["농지·시설", "환경", "건축·변화", "안전", "해외"]          # 옛 상수(cards.py GROUPS) — 이름 · 순서 그대로 옮겼다


def _pg():
    return psycopg.connect(config.PG_ADMIN_DSN, autocommit=True)


def test_moved_from_constant(tok):
    j = httpx.get(B + "/categories", headers=H(tok["staff"]), timeout=30).json()
    names = [g["name"] for g in j["items"]]
    assert names[:5] == OLD or set(OLD) <= set(names)                       # 옛 다섯 분야가 그대로 있다(관리자가 순서를 바꿨을 수 있음)
    with _pg() as c:
        n_cards = c.execute("SELECT count(*) FROM cards").fetchone()[0]
        lost = c.execute("SELECT count(*) FROM card_info i WHERE i.grp IS NOT NULL AND NOT EXISTS "
                         "(SELECT 1 FROM card_group_of o JOIN card_groups g ON g.id=o.group_id WHERE o.card_id=i.card_id AND g.name=i.grp)").fetchone()[0]
    assert lost == 0                                                        # 지금 분야 값을 잃지 않았다
    assert sum(g["n"] for g in j["items"]) >= n_cards - 1
    assert "requests" not in j                                              # 직원에게는 목록만
    deck = httpx.get(B + "/cards/deck", headers=H(tok["staff"]), timeout=120).json()
    assert deck["groups"] == names                                          # 분석하기 거르기 칩 = 분야 표 순서
    assert all(isinstance(c["groups"], list) and (c["group"] == (c["groups"] or [None])[0]) for c in deck["items"])
    assert httpx.get(B + "/categories", headers=H(tok["namwon"]), timeout=30).status_code == 403


def test_admin_manage_and_card_groups(tok):
    a, s = H(tok["admin"]), H(tok["staff"])
    nm = "시험분야" + secrets.token_hex(2)
    assert httpx.post(B + "/categories", json={"name": nm}, headers=s, timeout=30).status_code == 403     # 만드는 것은 LX 관리자
    before = [g["id"] for g in httpx.get(B + "/categories", headers=a, timeout=30).json()["items"]]
    gid = None
    try:
        r = httpx.post(B + "/categories", json={"name": nm, "descr": "시험"}, headers=a, timeout=30)
        assert r.status_code == 201, r.text
        gid = r.json()["id"]
        assert httpx.post(B + "/categories", json={"name": nm}, headers=a, timeout=30).status_code == 409   # 같은 이름
        nm2 = nm + "바뀜"
        assert httpx.patch(B + f"/categories/{gid}", json={"name": nm2}, headers=a, timeout=30).json()["name"] == nm2
        ids = [g["id"] for g in httpx.get(B + "/categories", headers=a, timeout=30).json()["items"]]
        assert ids[-1] == gid
        new = [gid] + [x for x in ids if x != gid]
        assert httpx.put(B + "/categories/order", json={"ids": new}, headers=a, timeout=30).status_code == 200
        assert httpx.put(B + "/categories/order", json={"ids": new[:-1]}, headers=a, timeout=30).status_code == 400   # 전체를 보내야
        # 서비스 하나를 두 분야에 — 서비스 카드 고치기(PUT /cards) · 분야 표 이름으로
        cid = "card-farm"
        one = httpx.get(B + f"/cards/{cid}", headers=a, timeout=120).json()
        old = one["groups"]
        assert one["all_groups"][0] == nm2                                  # 고를 수 있는 분야 = 표 순서
        r = httpx.put(B + f"/cards/{cid}", json={"groups": old + [nm2]}, headers=a, timeout=120)
        assert r.status_code == 200 and nm2 in r.json()["groups"] and r.json()["groups"][0] == nm2   # 분야 순서대로
        deck = httpx.get(B + "/cards/deck", headers=s, timeout=120).json()
        assert deck["groups"][0] == nm2 and nm2 in next(c for c in deck["items"] if c["id"] == cid)["groups"]
        lst = {g["id"]: g for g in httpx.get(B + "/categories", headers=a, timeout=30).json()["items"]}
        assert lst[gid]["n"] == 1                                           # 쓰는 서비스 수
        assert httpx.put(B + f"/cards/{cid}", json={"groups": ["없는 분야"]}, headers=a, timeout=120).status_code == 400
        assert httpx.put(B + f"/cards/{cid}", json={"groups": old}, headers=a, timeout=120).json()["groups"] == old
        log = httpx.get(B + "/categories", headers=a, timeout=30).json()["log"]
        assert any(nm2 in x["text"] for x in log)
    finally:
        with _pg() as c:
            if gid:
                c.execute("DELETE FROM card_groups WHERE id=%s", (gid,))
                c.execute("DELETE FROM card_group_log WHERE group_id=%s OR after->>'name' LIKE %s", (gid, nm + "%"))
            for i, g in enumerate(before):
                c.execute("UPDATE card_groups SET ord=%s WHERE id=%s", ((i + 1) * 10, g))
            c.execute("DELETE FROM card_group_log WHERE action IN ('order','card.groups') AND at > now() - interval '10 minutes' AND by IN "
                      "(SELECT id FROM lx_users WHERE role='admin')")


def test_form_values():
    ok = {"grp-farm", "grp-build"}
    f = clean_form({"groups": ["grp-farm", "grp-build", "grp-farm"], "desc": "  비닐하우스를   분석합니다 ", "imagery_kinds": ["항공", "드론"], "new_group": "하천"}, ok)
    assert f == {"groups": ["grp-farm", "grp-build"], "desc": "비닐하우스를 분석합니다", "imagery_kinds": ["드론", "항공"], "new_group": "하천"}
    for bad in ({"groups": ["grp-x"]}, {"imagery_kinds": ["라이다"]}, {"desc": "가" * 61}):
        try:
            clean_form(bad, ok)
            raise AssertionError(bad)
        except Exception as e:  # noqa: BLE001
            assert "ApiError" in type(e).__name__
    assert kinds_from("드론·항공 50cm 이하") == ["드론", "항공"] and kinds_from(None) == []
