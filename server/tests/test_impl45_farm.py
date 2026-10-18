"""영농관리 결정(10-18 원칙 291 · impl-45) — 사료작물 견주기 · 곤포 생산량 · 개인정보 파일 이용 약속 · 행정정보 목록 · 직위.
실행: python -m pytest server/tests/test_impl45_farm.py -q (게이트웨이 :8700 · 남원 기관 계정). 시험이 만든 대장 · 약속 · 설정은 끝에 지운다."""
import time

import httpx
import psycopg
import pytest

from conftest import B, TENANT_ID, config, login_tenant
from landxi_api.farm_admin import default_picks, judge

H = lambda t: {"authorization": "Bearer " + t}   # noqa: E731
T = 120


def _sql(q, a=()):
    with psycopg.connect(config.PG_ADMIN_DSN, autocommit=True) as c:
        cur = c.execute(q, a)
        return cur.fetchall() if cur.description else None


# ── 순수 함수 ────────────────────────────────────────────────────────────────
def test_default_picks_by_name_and_skip():
    svcs = [{"card": "card-a", "name": "경작지 분석서비스"}, {"card": "card-b", "name": "사료작물 생산기 분석"}, {"card": "card-c", "name": "곤포사일리지 분석서비스"}]
    p = default_picks(svcs, {})
    assert p == {"growth": None, "harvest": "card-b", "bale": "card-c"}
    assert default_picks(svcs[:1], {}) == {"growth": "card-a", "harvest": None, "bale": None}      # 아무것도 맞지 않으면 생육기에 첫 서비스
    assert default_picks(svcs, {"bale": "-"})["bale"] is None                                      # 일부러 비움
    assert default_picks(svcs, {"growth": "card-c"})["growth"] == "card-c"


def test_judge_only_compares():
    assert judge({"growth": {"found": True}, "harvest": None, "bale": {"found": True}}) == ("ok", [])
    assert judge({"growth": {"found": True}, "harvest": {"found": False}, "bale": {"found": False}}) == ("diff", ["생산기", "곤포사일리지"])
    assert judge({"growth": None, "harvest": None, "bale": None}) == ("none", [])


# ── 서버 ────────────────────────────────────────────────────────────────────
@pytest.fixture(scope="module")
def tok():
    return login_tenant("namwon")


def test_bale_weight_setting(tok):
    before = httpx.get(B + "/spaces/me/settings/farm", headers=H(tok), timeout=T).json()
    try:
        assert httpx.put(B + "/spaces/me/settings/farm", json={"bale_kg": -1}, headers=H(tok), timeout=T).status_code == 400
        r = httpx.put(B + "/spaces/me/settings/farm", json={"bale_kg": 520}, headers=H(tok), timeout=T)
        assert r.status_code == 200 and r.json()["bale_kg"]["value"] == 520.0
        r = httpx.put(B + "/spaces/me/settings/farm", json={"bale_kg": None}, headers=H(tok), timeout=T)
        assert r.status_code == 200 and r.json()["bale_kg"] is None
    finally:
        old = (before.get("bale_kg") or {}).get("value")
        httpx.put(B + "/spaces/me/settings/farm", json={"bale_kg": old}, headers=H(tok), timeout=T)


def test_personal_file_needs_pledge_then_confirm(tok):
    uid = TENANT_ID["namwon"]
    keep = _sql("SELECT id FROM download_pledges WHERE tenant_id='namwon' AND user_id=%s", (uid,))
    since = time.time()
    _sql("DELETE FROM download_pledges WHERE tenant_id='namwon' AND user_id=%s", (uid,))
    try:
        # 개인정보가 없는 파일 = 바로
        assert httpx.get(B + "/spaces/me/guides/card-farm/download?fmt=summary", headers=H(tok), timeout=T).status_code == 200
        r = httpx.get(B + "/spaces/me/ledger/compare.xlsx?card=card-farm", headers=H(tok), timeout=T)
        assert r.status_code == 409 and r.json()["error"]["detail"]["need"] == "pledge"
        assert httpx.post(B + "/spaces/me/pledge", json={"purpose": "시험", "until": "2099-01-01", "agree": True}, headers=H(tok), timeout=T).status_code == 400
        today = time.strftime("%Y-%m-%d")
        r = httpx.post(B + "/spaces/me/pledge", json={"purpose": "조사료 재배 지원 이행 점검(시험)", "until": today, "agree": True}, headers=H(tok), timeout=T)
        assert r.status_code == 200 and r.json()["active"]["until"] == today
        r = httpx.get(B + "/spaces/me/ledger/compare.xlsx?card=card-farm", headers=H(tok), timeout=T)
        assert r.status_code == 409 and r.json()["error"]["detail"]["need"] == "confirm"
        r = httpx.get(B + "/spaces/me/ledger/compare.xlsx?card=card-farm&ok=1", headers=H(tok), timeout=T)
        assert r.status_code in (200, 404)          # 404 = 이 기관에 올린 대장이 없을 때
    finally:
        _sql("DELETE FROM download_pledges WHERE tenant_id='namwon' AND user_id=%s AND id <> ALL(%s)", (uid, [k[0] for k in keep or []]))
        _sql("DELETE FROM space_log WHERE tenant_id='namwon' AND actor=%s AND kind='consent' AND line LIKE '%%이용 약속(%%' AND at >= to_timestamp(%s)", (uid, since))


def _upload_feed(tok, pnus_hit, pnus_miss):
    lines = ["연번,경영체명,필지고유번호,신청재배작물,신청면적"]
    for i, p in enumerate(pnus_hit + pnus_miss):
        lines.append(f"{i + 1},시험경영체{i},{p},{'IRG' if i % 2 else '호밀'},{1000 + i}")
    raw = ("﻿" + "\r\n".join(lines)).encode("utf-8")
    r = httpx.post(B + "/t/namwon/survey/registry/import", files={"file": ("시험_사료작물_재배신청.csv", raw, "text/csv")}, data={"kind": "feedcrop"},
                   headers=H(tok), timeout=T)
    assert r.status_code == 202, r.text
    j = r.json()
    assert "경영체명" in j["dropped"]                     # 사람 칸은 이름만 기록 · 값 저장 0
    iid = j["import_id"]
    r = httpx.post(B + f"/t/namwon/survey/registry/{iid}/confirm", json={"mapping": {"pnu": "필지고유번호", "use": "신청재배작물", "area": "신청면적"}},
                   headers=H(tok), timeout=T)
    assert r.status_code == 202, r.text
    for _ in range(120):
        d = httpx.get(B + f"/t/namwon/survey/registry/{iid}", headers=H(tok), timeout=T).json()
        if d["state"] in ("matched", "failed"):
            break
        time.sleep(1)
    assert d["state"] == "matched", d
    return iid


def test_feedcrop_compare_and_list(tok):
    par = httpx.get(B + "/spaces/me/guides/card-farm/parcels?limit=400", headers=H(tok), timeout=T).json()
    hit = [x["pnu"] for x in par["items"] if "경작지" in (x.get("classes") or [])][:6]
    assert hit, "남원 경작지 결과 필지가 없습니다"
    miss = [r[0] for r in _sql("SELECT pnu FROM survey_parcels sp WHERE left(pnu, 5) = left(%s, 5) AND NOT EXISTS (SELECT 1 FROM detections d WHERE d.pnu = sp.pnu) LIMIT 3",
                                (hit[0],))]
    iid = _upload_feed(tok, hit, miss)
    try:
        r = httpx.get(B + f"/spaces/me/ledger/feedcrop?import_id={iid}&growth=card-farm&harvest=-&bale=-&geom=1", headers=H(tok), timeout=T)
        assert r.status_code == 200, r.text
        c = r.json()
        assert c["ledger"]["kind_code"] == "feedcrop" and c["ledger"]["parcels"]["value"] == len(set(hit + miss))
        by = {x["pnu"]: x for x in c["items"]}
        assert all(by[p]["slots"]["growth"]["found"] for p in hit)
        assert all(by[p]["k"] == "diff" and by[p]["miss"] == ["생육기"] for p in miss if p in by)
        assert c["ok"]["value"] + c["diff"]["value"] == c["ledger"]["parcels"]["value"]
        assert {x["crop"] for x in c["items"]} <= {"IRG", "호밀"}
        assert c["geojson"]["features"]
        # 서비스 하나와 맞추는 비교 · 보고서는 이 대장을 '최근 대장'으로 고르지 않는다
        cmp = httpx.get(B + "/spaces/me/ledger/compare?card=card-farm", headers=H(tok), timeout=T).json()
        assert (cmp.get("ledger") or {}).get("import_id") != iid
        # 행정정보 목록 — 주제별 · 기준일 · 건수 · 등록자
        assert httpx.patch(B + f"/spaces/me/ledgers/{iid}", json={"base_date": "2026-05-31"}, headers=H(tok), timeout=T).status_code == 200
        L = httpx.get(B + "/spaces/me/ledgers", headers=H(tok), timeout=T).json()
        g = next(g for g in L["groups"] if g["kind"] == "feedcrop")
        it = next(x for x in g["items"] if x["import_id"] == iid)
        assert g["label"] == "사료작물 재배 신청" and it["base_date"] == "2026-05-31" and it["rows"]["value"] == len(hit + miss) and it["who"]
        # 엑셀 = 개인정보가 든 파일(약속 없으면 409)
        assert httpx.get(B + f"/spaces/me/ledger/feedcrop.xlsx?import_id={iid}&growth=card-farm", headers=H(tok), timeout=T).status_code in (200, 409)
    finally:
        httpx.delete(B + f"/t/namwon/survey/registry/{iid}", headers=H(tok), timeout=T)


def test_position_column(tok):
    uid = TENANT_ID["namwon"]
    old = _sql("SELECT position FROM tenant_users WHERE id=%s", (uid,))[0][0]
    try:
        assert httpx.post(B + f"/accounts/users/tenant/{uid}/position", json={"position": "가" * 41}, headers=H(tok), timeout=T).status_code == 400
        r = httpx.post(B + f"/accounts/users/tenant/{uid}/position", json={"position": "주무관"}, headers=H(tok), timeout=T)
        assert r.status_code == 200 and r.json()["position"] == "주무관"
        us = httpx.get(B + "/accounts/users", headers=H(tok), timeout=T).json()["items"]
        assert next(u for u in us if u["id"] == uid)["position"] == "주무관"
        assert httpx.post(B + "/accounts/users/tenant/u_gwangju-jeonnam_mail_lxadmin/position", json={"position": "x"}, headers=H(tok), timeout=T).status_code == 404
    finally:
        _sql("UPDATE tenant_users SET position=%s WHERE id=%s", (old, uid))
