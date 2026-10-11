"""외부 연동 API 1차 — 결과 가져오기(원칙 54 · 69 · 174 · 178 · 179 · 확인 대장 API-형식3 ⓐ · API-공유끔 ⓐ). 실서버(:8700) · GPU 0.

키 발급(LX 관리자만 · 값 한 번 · 한 방향 암호) · 폐기 · 멈춤 · 공유 거둠 시 멈춤 → 다시 공유하면 이어짐 · 관할 밖 · 없는 시점 404 ·
형식 셋(GeoJSON · SHP · 필지 엑셀 = 기관 화면 내려받기와 같은 값) · 쪽 나눠 받기 · 한도 · 호출 기록 · 화면 토큰과 키 섞지 않음.
시험 키는 모두 test=true · 끝나면 폐기(사유 '시험 끝') — 기록은 지우지 않는다. 시험으로 바꾼 공유 줄(test=true)은 끝에 지워 원래 상태로.
"""
import io
import json
import zipfile

import httpx
import psycopg
import pytest

from conftest import B, BASE, H
from landxi_api import config

X = BASE + "/api/ext/v1"
T = 120


def pg():
    return psycopg.connect(config.PG_ADMIN_DSN, autocommit=True)


@pytest.fixture(scope="module")
def keys(live, tok):
    made = []

    def mk(tenant="namwon", card="card-farm", **kw):
        r = httpx.post(B + "/apikeys", headers=H(tok["admin"]), json={"tenant_id": tenant, "card_id": card, "label": "시험 연동", "test": True, **kw}, timeout=T)
        assert r.status_code == 201, r.text
        j = r.json()
        made.append(j["item"]["id"])
        return j["key"], j["item"]["id"]
    yield mk
    for kid in made:
        httpx.post(B + f"/apikeys/{kid}/revoke", headers=H(tok["admin"]), json={"reason": "시험 끝"}, timeout=T)
    with pg() as c:
        c.execute("DELETE FROM card_shares WHERE test AND note='pytest ext_api'")


def K(key):
    return {"authorization": "Bearer " + key}


def test_issue_admin_only_and_value_once(tok, keys):
    body = {"tenant_id": "namwon", "card_id": "card-farm", "label": "시험 연동", "test": True}
    for who in ("staff", "namwon"):
        assert httpx.post(B + "/apikeys", headers=H(tok[who]), json=body, timeout=T).status_code in (401, 403)
    key, kid = keys()
    assert key.startswith("lxk_") and len(key) > 40
    with pg() as c:
        row = c.execute("SELECT key_hash, last4 FROM api_keys WHERE id=%s", (kid,)).fetchone()
        assert row[0] != key and key not in row[0] and row[1] == key[-4:]
        assert not c.execute("SELECT 1 FROM audit_log WHERE subject=%s AND after::text LIKE %s", (kid, "%" + key + "%")).fetchone()
    lst = httpx.get(B + "/apikeys", headers=H(tok["admin"]), timeout=T)
    assert lst.status_code == 200 and key not in lst.text
    mine = httpx.get(B + "/spaces/me/apikeys", headers=H(tok["namwon"]), timeout=T)      # 기관 관리자 = 보기만 · 값 0
    assert mine.status_code == 200 and key not in mine.text and any(x["id"] == kid for x in mine.json()["items"])
    gj = httpx.get(B + "/spaces/me/apikeys", headers=H(tok["gj"]), timeout=T).json()     # 다른 기관 키는 0
    assert all(x["id"] != kid for x in gj["items"])
    r = httpx.post(B + "/apikeys", headers=H(tok["admin"]), json={**body, "card_id": "card-marine"}, timeout=T)   # 공유되지 않은 서비스
    assert r.status_code == 409


def test_auth_not_mixed(tok, keys):
    key, _ = keys()
    assert httpx.get(X + "/me", timeout=T).status_code == 401
    assert httpx.get(X + "/me", headers=H(tok["namwon"]), timeout=T).status_code == 401        # 화면 로그인 토큰 → 외부 창구 0
    assert httpx.get(X + "/me", headers=K(key + "x"), timeout=T).status_code == 401
    assert httpx.get(B + "/me", headers=K(key), timeout=T).status_code == 401                  # 키 → 화면 API 0
    assert httpx.get(B + "/spaces/me", headers=K(key), timeout=T).status_code == 401
    me = httpx.get(X + "/me", headers=K(key), timeout=T)
    assert me.status_code == 200 and me.json()["area"] == ["남원시"]
    txt = me.text
    for bad in ("job_", "set_", "results/", "E:\\", "GPU", "lxs_", "lxt_"):
        assert bad not in txt
    assert httpx.post(X + "/analyses", headers=K(key), json={}, timeout=T).status_code == 404      # 분석 맡기기 = 1차 없음(원칙 179)
    assert httpx.post(X + "/uploads", headers=K(key), json={}, timeout=T).status_code == 404


def _all_pages(key, edition=None, limit=1000):
    feats, cur, n = [], None, 0
    while True:
        p = {"limit": limit, **({"cursor": cur} if cur else {}), **({"edition": edition} if edition and not cur else {})}
        r = httpx.get(X + "/results", headers=K(key), params=p, timeout=T)
        assert r.status_code == 200, r.text
        j = r.json()
        feats += j["features"]
        cur = j["lx"]["next"]
        n += 1
        if not cur:
            return feats, j["lx"]["total"], n


def test_formats_same_as_screen_download(tok, keys):
    key, _ = keys()
    feats, total, pages = _all_pages(key, limit=1000)
    assert len(feats) == total and len({f["id"] for f in feats}) == total
    assert all(f["properties"]["emd"] is None or isinstance(f["properties"]["emd"], str) for f in feats)
    small, total2, pages2 = _all_pages(key, limit=500)
    assert total2 == total and len(small) == total and pages2 >= pages
    gx = httpx.get(X + "/exports/geojson", headers=K(key), timeout=600)
    assert gx.status_code == 200
    g = gx.json()
    assert len(g["features"]) == total
    scr = httpx.get(B + "/spaces/me/guides/card-farm/download", headers=H(tok["namwon"]), params={"fmt": "geojson"}, timeout=600)   # 기관 화면 내려받기
    if scr.status_code == 409:                                    # 이용 약속 전 — 동의 후 다시
        httpx.post(B + "/spaces/me/consent", headers=H(tok["namwon"]), json={"agree": True}, timeout=T)
        scr = httpx.get(B + "/spaces/me/guides/card-farm/download", headers=H(tok["namwon"]), params={"fmt": "geojson"}, timeout=600)
    assert scr.status_code == 200
    s = scr.json()
    assert len(s["features"]) == total
    assert sorted(f["id"] for f in s["features"]) == sorted(f["id"] for f in g["features"]) == sorted(f["id"] for f in feats)
    sh = httpx.get(X + "/exports/shp", headers=K(key), timeout=600)
    assert sh.status_code == 200 and sh.headers["content-type"] == "application/zip"
    import shapefile
    z = zipfile.ZipFile(io.BytesIO(sh.content))
    stem = [n for n in z.namelist() if n.endswith(".shp")][0][:-4]
    rd = shapefile.Reader(shp=io.BytesIO(z.read(stem + ".shp")), shx=io.BytesIO(z.read(stem + ".shx")), dbf=io.BytesIO(z.read(stem + ".dbf")), encoding="utf-8")
    assert len(rd) == total and z.read(stem + ".cpg") == b"UTF-8" and b"WGS_1984" in z.read(stem + ".prj")
    kinds = {r["kind"] for r in rd.records()}
    assert kinds == {f["properties"]["kind"] for f in feats}                       # 한글 종류 이름 그대로
    px = httpx.get(X + "/exports/parcels", headers=K(key), timeout=600)
    ps = httpx.get(B + "/spaces/me/guides/card-farm/download", headers=H(tok["namwon"]), params={"fmt": "parcels"}, timeout=600)
    assert px.status_code == 200 and ps.status_code == 200
    from openpyxl import load_workbook
    a = load_workbook(io.BytesIO(px.content))["필지"]
    b = load_workbook(io.BytesIO(ps.content))["필지"]
    ra = [r[0] for r in a.iter_rows(min_row=2, values_only=True)]
    rb = [r[0] for r in b.iter_rows(min_row=2, values_only=True)]
    assert ra == rb and all(isinstance(x, str) and len(x) == 19 for x in ra)
    sm = httpx.get(X + "/summary", headers=K(key), timeout=T)
    ss = httpx.get(B + "/spaces/me/guides/card-farm/download", headers=H(tok["namwon"]), params={"fmt": "summary"}, timeout=T)
    assert sm.json()["결과"] == json.loads(ss.content)["결과"]


def test_timepoints_and_404(tok, keys):
    key, _ = keys()
    tp = httpx.get(X + "/timepoints", headers=K(key), timeout=T).json()["items"]
    assert len(tp) >= 2 and sum(1 for x in tp if x["current"]) == 1
    old = min(x["edition"] for x in tp)
    r = httpx.get(X + "/results", headers=K(key), params={"edition": old, "limit": 3}, timeout=T)
    assert r.status_code == 200 and r.json()["lx"]["when"]["edition"] == old
    assert httpx.get(X + "/results", headers=K(key), params={"edition": 999}, timeout=T).status_code == 404
    assert httpx.get(X + "/exports/gpkg", headers=K(key), timeout=T).status_code == 404
    gk, _ = keys("gwangju-jeonnam", "card-marine")                       # 다른 기관 키 — 남원 결과 0
    feats, total, _p = _all_pages(gk)
    assert total == len(feats)
    nk = {f["id"] for f in _all_pages(key)[0]}
    assert not nk & {f["id"] for f in feats}
    assert all(not (f["properties"]["parcel"] or "").startswith("52190") for f in feats)


def test_scope_formats(keys):
    key, _ = keys(formats=["parcels"])
    assert httpx.get(X + "/results", headers=K(key), timeout=T).status_code == 403
    assert httpx.get(X + "/exports/shp", headers=K(key), timeout=T).status_code == 403
    assert httpx.get(X + "/exports/parcels", headers=K(key), timeout=600).status_code == 200


def test_pause_unshare_revoke(tok, keys):
    key, kid = keys()
    A = H(tok["admin"])
    assert httpx.patch(B + f"/apikeys/{kid}", headers=A, json={"paused": True}, timeout=T).json()["item"]["state"] == "paused"
    r = httpx.get(X + "/me", headers=K(key), timeout=T)
    assert r.status_code == 403 and r.json()["error"]["code"] == "key_paused"
    assert httpx.patch(B + f"/apikeys/{kid}", headers=A, json={"paused": False}, timeout=T).json()["item"]["state"] == "on"
    assert httpx.get(X + "/me", headers=K(key), timeout=T).status_code == 200
    # 공유를 거두면 멈춤 → 다시 공유하면 이어짐(API-공유끔 ⓐ)
    sh = {"card_id": "card-farm", "tenant_id": "namwon", "test": True, "note": "pytest ext_api"}
    assert httpx.put(B + "/release/shares", headers=A, json={**sh, "shared": False}, timeout=T).status_code == 200
    r = httpx.get(X + "/me", headers=K(key), timeout=T)
    assert r.status_code == 403 and r.json()["error"]["code"] == "key_paused"
    st = [k for row in httpx.get(B + "/apikeys", headers=A, timeout=T).json()["items"] for k in row["keys"] if k["id"] == kid][0]
    assert st["state"] == "unshared"
    assert httpx.put(B + "/release/shares", headers=A, json={**sh, "shared": True}, timeout=T).status_code == 200
    assert httpx.get(X + "/me", headers=K(key), timeout=T).status_code == 200
    with pg() as c:
        c.execute("DELETE FROM card_shares WHERE test AND note='pytest ext_api'")
    # 끝나는 날 · 폐기
    assert httpx.patch(B + f"/apikeys/{kid}", headers=A, json={"expires_at": "2020-01-01"}, timeout=T).status_code == 400
    assert httpx.post(B + f"/apikeys/{kid}/revoke", headers=A, json={"reason": "시험 끝"}, timeout=T).json()["item"]["state"] == "revoked"
    r = httpx.get(X + "/me", headers=K(key), timeout=T)
    assert r.status_code == 401 and r.json()["error"]["code"] == "key_revoked"
    assert httpx.post(B + f"/apikeys/{kid}/revoke", headers=A, json={}, timeout=T).status_code == 409
    k2, kid2 = keys()
    with pg() as c:
        c.execute("UPDATE api_keys SET expires_at = now() - interval '1 minute' WHERE id=%s", (kid2,))
    r = httpx.get(X + "/me", headers=K(k2), timeout=T)
    assert r.status_code == 401 and r.json()["error"]["code"] == "key_expired"


def test_limit_and_log(tok, keys):
    key, kid = keys(per_min=3)
    codes = [httpx.get(X + "/me", headers=K(key), timeout=T).status_code for _ in range(5)]
    assert codes[:3] == [200, 200, 200] and codes[3:] == [429, 429]
    r = httpx.get(X + "/me", headers=K(key), timeout=T)
    assert r.status_code == 429 and int(r.headers["retry-after"]) > 0
    calls = httpx.get(B + f"/apikeys/{kid}/calls", headers=H(tok["admin"]), timeout=T).json()
    assert calls["total"] == 6 and sum(1 for x in calls["items"] if x["ok"]) == 3 and all(x["test"] for x in calls["items"])
    with pg() as c:
        assert c.execute("SELECT count(*) FROM api_calls WHERE key_id=%s", (kid,)).fetchone()[0] == 6
    u = httpx.get(B + "/apikeys/usage", headers=H(tok["admin"]), timeout=T)
    assert u.status_code == 200                                              # 시험 키 호출은 사용 현황 합계에서 빠진다
    with pg() as c:
        real = c.execute("SELECT count(*) FROM api_calls WHERE tenant_id='namwon' AND card_id='card-farm' AND status < 400 AND NOT test "
                         "AND at >= date_trunc('month', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul'").fetchone()[0]
    row = [x for x in u.json()["items"] if x["org"] == "namwon" and x["service"] == "card-farm"]
    assert (row[0]["calls"]["value"] if row else 0) == real
