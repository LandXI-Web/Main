"""구현 23차 — 프로젝트 진행 현황 카드(원칙 219) · 새 프로젝트 한 창(원칙 220 · 10-12). 실서버(:8700) · GPU 0 · 영상 등록 0(있는 영상을 잇기만).

확인: ① 한 창 만들기 = 이름 · 설명 · 무엇을 · 구성원(여러 명) · 데이터하우스 영상 → 대상지 = 영상 자리(화면이 고르지 않음) · 구성원 한 번에
     ② 영상을 올리는 중(from_upload) = 대상지 비운 채 만들어짐 → 영상이 등록되면 POST /projects/{id}/imagery 로 대상지가 더해짐(이미 있는 지역은 그대로)
     ③ 막는 것 — 대상지 · 영상 둘 다 없음 · LX 계정이 아닌 구성원 · 없는 영상 · 구성원이 아닌 직원이 영상 잇기
     ④ 목록 카드 칸 — 그림(이은 영상 썸네일) · 학습 데이터 n장(학습 화면과 같은 값) · AI 모델 정확도 · 사람 · 설명
     ⑤ GET /projects/imagery — 데이터하우스 영상(이름 · 지역 · 연도 · 종류 · 썸네일) · 경로 노출 0
시험 프로젝트 · 시험 계정은 끝에서 지운다(영상 행은 건드리지 않는다).
"""
import json

import httpx
import psycopg
import pytest

from conftest import B, H, STAFF_ID, _login
from landxi_api import config

OTHER = "u_pytest_staff23"


def pg():
    return psycopg.connect(config.PG_ADMIN_DSN, autocommit=True)


@pytest.fixture(scope="module")
def other(live):
    """다른 직원(시험 계정) — 구성원으로 넣고, 구성원이 아닐 때 막히는지도 본다."""
    from landxi_api.auth import hash_password
    c = pg()
    c.execute("DELETE FROM sessions WHERE user_id=%s", (OTHER,))
    c.execute("DELETE FROM lx_users WHERE id=%s", (OTHER,))
    c.execute("INSERT INTO lx_users(id, login, pw_hash, role, status, name) VALUES (%s,'pytest-staff23',%s,'staff','active','시험 직원 이삼')",
              (OTHER, hash_password(config.DEV_PASSWORD)))
    tok = _login({"realm": "lx", "login": "pytest-staff23", "password": config.DEV_PASSWORD})
    yield tok
    c.execute("DELETE FROM project_members WHERE user_id=%s", (OTHER,))
    c.execute("DELETE FROM sessions WHERE user_id=%s", (OTHER,))
    c.execute("DELETE FROM lx_users WHERE id=%s", (OTHER,))
    c.close()


@pytest.fixture
def made(live):
    ids = []
    yield ids
    c = pg()
    for pid in ids:
        c.execute("DELETE FROM projects WHERE id=%s", (pid,))
    c.close()


@pytest.fixture(scope="module")
def imgs(live, tok):
    """데이터하우스 영상 목록 — 국내 시군구가 있는 영상 둘(서로 다른 지역이면 더 좋음)."""
    r = httpx.get(B + "/projects/imagery", headers=H(tok["staff"]), timeout=60)
    assert r.status_code == 200, r.text
    items = [x for x in r.json()["items"] if x.get("region")]
    assert items, "지역이 있는 영상이 없음"
    a = items[0]
    b = next((x for x in items if x["region"] != a["region"]), items[-1])
    return a, b


def test_imagery_list_plain(tok, imgs):
    r = httpx.get(B + "/projects/imagery", headers=H(tok["staff"]), timeout=60).json()
    body = json.dumps(r, ensure_ascii=False)
    assert ":\\\\" not in body and "cog/" not in body and "path" not in body       # 경로 노출 0
    x = r["items"][0]
    assert set(x) == {"id", "name", "region", "year", "kind", "thumb"} and x["thumb"].endswith("/thumb") and x["kind"] in ("드론", "항공", "위성")
    assert httpx.get(B + "/projects/imagery", headers=H(tok["namwon"]), timeout=30).status_code in (401, 403)   # 기관 계정 0


def test_one_window_create(tok, imgs, other, made):
    a, _ = imgs
    body = {"name": "pytest 한 창", "description": "  설명 한 줄  ", "task": "비닐하우스", "task_id": "greenhouse",
            "imagery": [a["id"]], "members": [OTHER], "regions": []}
    r = httpx.post(B + "/projects", headers=H(tok["staff"]), json=body, timeout=60)
    assert r.status_code == 201, r.text
    p = r.json()
    made.append(p["id"])
    assert p["description"] == "설명 한 줄"
    assert [g["name"] for g in p["regions"]] == [a["region"]]                       # 대상지 = 고른 영상 자리
    assert [m["id"] for m in p["members"]] == [OTHER] and p["lead"]["id"] == STAFF_ID
    assert p["pic"] == f"/catalog/imagery/{a['id']}/thumb"                          # 카드 그림 = 이은 영상
    assert p["stages"][0]["state"] == "done" and p["stage"]["key"] == "label"       # 영상이 있으니 학습데이터 구축부터
    assert [x["name"] for x in p["people"]][1:] == ["시험 직원 이삼"]
    c = pg()
    links = c.execute("SELECT ref FROM project_links WHERE project_id=%s AND kind='imagery'", (p["id"],)).fetchall()
    c.close()
    assert [x[0] for x in links] == [a["id"]]
    # 목록 카드 칸도 같은 값
    lst = httpx.get(B + "/projects?scope=mine", headers=H(tok["staff"]), timeout=60).json()
    row = next(x for x in lst["items"] if x["id"] == p["id"])
    assert row["pic"] == p["pic"] and row["description"] == "설명 한 줄" and row["train_n"] is None and row["acc"] is None
    assert {x["id"] for x in row["people"]} == {STAFF_ID, OTHER}


def test_create_while_uploading_then_attach(tok, imgs, other, made):
    a, b = imgs
    r = httpx.post(B + "/projects", headers=H(tok["staff"]), json={"name": "pytest 올리는 중", "task": "비닐하우스", "from_upload": True}, timeout=60)
    assert r.status_code == 201, r.text
    p = r.json()
    made.append(p["id"])
    assert p["regions"] == [] and p["stage"]["key"] == "ingest"                     # 대상지는 영상이 등록되면
    # 구성원이 아닌 직원은 잇지 못한다
    assert httpx.post(B + f"/projects/{p['id']}/imagery", headers=H(other), json={"imagery": [a["id"]]}, timeout=30).status_code == 403
    assert httpx.post(B + f"/projects/{p['id']}/imagery", headers=H(tok["staff"]), json={"imagery": ["no-such-img"]}, timeout=30).status_code == 404
    r1 = httpx.post(B + f"/projects/{p['id']}/imagery", headers=H(tok["staff"]), json={"imagery": [a["id"]]}, timeout=60)
    assert r1.status_code == 201, r1.text
    assert [g["name"] for g in r1.json()["regions"]] == [a["region"]]
    r2 = httpx.post(B + f"/projects/{p['id']}/imagery", headers=H(tok["staff"]), json={"imagery": [a["id"], b["id"]]}, timeout=60).json()
    names = [g["name"] for g in r2["regions"]]
    assert names[0] == a["region"] and len(names) == len(set(names)) and b["region"] in names   # 더하기만 · 겹침 없음


def test_create_guards(tok, made):
    base = {"name": "pytest 막힘", "task": "비닐하우스"}
    assert httpx.post(B + "/projects", headers=H(tok["staff"]), json=base, timeout=30).status_code == 400            # 영상 · 대상지 둘 다 없음
    assert httpx.post(B + "/projects", headers=H(tok["staff"]), json={**base, "regions": ["52190"], "members": ["u_nobody"]}, timeout=30).status_code == 400
    assert httpx.post(B + "/projects", headers=H(tok["staff"]), json={**base, "imagery": ["no-such-img"]}, timeout=30).status_code == 400
    c = pg()
    n = c.execute("SELECT count(*) FROM projects WHERE name='pytest 막힘'").fetchone()[0]
    c.close()
    assert n == 0


def test_card_numbers_match_train_screen(tok):
    """학습 데이터 n장 = 학습 화면 '학습 이력' 맨 위 줄과 같은 값(숫자 한 출처)."""
    lst = httpx.get(B + "/projects?scope=all", headers=H(tok["staff"]), timeout=60).json()
    checked = 0
    for p in lst["items"]:
        if not p.get("train_n"):
            continue
        tr = httpx.get(B + f"/projects/{p['id']}/train", headers=H(tok["staff"]), timeout=120)
        if tr.status_code != 200 or not tr.json().get("runs"):
            continue
        d = tr.json()["runs"][0].get("data") or {}
        if (d.get("images") or {}).get("value") is not None:
            assert p["train_n"]["value"] == d["images"]["value"], p["name"]
            checked += 1
    assert checked >= 1
