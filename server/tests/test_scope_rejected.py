"""구현 1차 · 관할 · 광역 · 반려 기능 — 실서버(:8700) 시험. GPU 0(견적은 범위 거절 · 읍면동/그린 범위 견적만 · 실시간·전역 견적 없음).

① 계정 범위 밖 0(원칙 39 · 확인 대장 FR-11): 기관 계정은 지역 목록 · 검색 · 지역 상세 · 읍면동 경계 · 결과 층 · 분석 범위 · 필지 조회 모두 관할 안만.
   분석 견적·등록은 범위가 관할을 조금이라도(경계선 오차 약 10m 밖) 벗어나면 거절 — 분석 기계 사용 0. LX 계정은 그대로 전국.
② 광역 기관(확인 D4-광역): 관할 시군구가 여럿이고, 관할 전체 집계(의심 필지) = 시군구별 값의 합(숫자 한 출처).
③ 반려된 기능 0(원칙 40 · FR-14 · FR-15): 현장 확인 배정 · 시정명령 · 이행강제금 · 원상복구 · 공문 — 서버가 받지 않고, 옛 기록은 취소로 남는다.
판정 지역 인자(시험 파일 예외): 기초 = 남원 52190 · 광역 = 광주전남 · 관할 밖 예 = 여수 12130.
"""
import httpx
import pytest
from shapely.geometry import mapping, shape
from shapely.ops import unary_union

from conftest import B, H

NAMWON, YEOSU = "52190", "12130"
YEOSU_BOX = {"type": "Polygon", "coordinates": [[[127.66, 34.75], [127.67, 34.75], [127.67, 34.76], [127.66, 34.76], [127.66, 34.75]]]}
NAMWON_BOX = {"type": "Polygon", "coordinates": [[[127.38, 35.40], [127.39, 35.40], [127.39, 35.41], [127.38, 35.41], [127.38, 35.40]]]}
OUT = "out_of_scope"


def get(tok, path, **kw):
    return httpx.get(B + path, headers=H(tok) if tok else {}, timeout=120, **kw)


def post(tok, path, body):
    return httpx.post(B + path, headers=H(tok), json=body, timeout=180)


# ── ① 관할 밖 0 ─────────────────────────────────────────────────────────────────────────────
def test_regions_tenant_only_scope(tok):
    from landxi_api import regions as R
    nw = get(tok["namwon"], "/regions").json()["items"]
    assert [x["sgg_cd"] for x in nw] == [NAMWON] and all(x["in_scope"] for x in nw)
    assert get(tok["namwon"], "/regions?public=1").json()["items"] == nw or len(get(tok["namwon"], "/regions?public=1").json()["items"]) == 1
    assert get(tok["namwon"], "/regions", params={"q": "여수"}).json()["items"] == []             # 검색 제안 0
    gj = get(tok["gj"], "/regions").json()["items"]
    assert len(gj) > 1 and all(any(c.startswith(p) for p in R.tenant_scope("gwangju-jeonnam") for c in (x["sgg_cd"], x.get("prev_cd") or ""))
                               for x in gj)
    assert NAMWON not in {x["sgg_cd"] for x in gj}
    assert len(get(tok["staff"], "/regions").json()["items"]) >= 250                               # LX = 전국 그대로
    g = get(tok["namwon"], "/regions?geom=1").json()["items"]
    assert len(g) == 1 and g[0]["geometry"]["type"] in ("Polygon", "MultiPolygon")                 # 관할 경계만(전국 파일 대신)


@pytest.mark.parametrize("path", [f"/regions/{YEOSU}", f"/regions/{YEOSU}/emd", f"/regions/{YEOSU}/results", f"/jobs/scope/{YEOSU}",
                                  f"/survey/build/{YEOSU}"])
def test_region_detail_outside_is_absent(tok, path):
    r = get(tok["namwon"], path)
    assert r.status_code == 404 and "여수" not in r.text                                          # 없는 지역과 같은 답
    if not path.startswith("/survey/build") and not path.startswith("/jobs/scope"):
        assert get(tok["gj"], path).status_code == 200 and get(tok["staff"], path).status_code == 200


def test_quote_outside_rejected_before_planning(tok):
    nw = tok["namwon"]
    for body in ({"kind": "infer", "options": {"scope": "sgg", "sgg_cd": YEOSU}},
                 {"kind": "infer", "aoi": YEOSU_BOX},
                 {"kind": "index", "options": {"emd_cd": "12130250"}},
                 {"kind": "infer"}):                                                               # 위치 없는 기관 요청도 거절
        r = post(nw, "/jobs/quote", body)
        assert r.status_code == 403 and r.json()["error"]["code"] == OUT, (body, r.text[:200])
        s = post(nw, "/jobs", body)
        assert s.status_code == 403 and s.json()["error"]["code"] == OUT
    r = post(tok["gj"], "/jobs/quote", {"kind": "infer", "aoi": NAMWON_BOX})
    assert r.status_code == 403 and r.json()["error"]["code"] == OUT


def test_quote_slightly_outside_rejected_inside_ok(tok):
    nw = tok["namwon"]
    fc = get(nw, f"/regions/{NAMWON}/emd").json()
    land = unary_union([shape(f["geometry"]) for f in fc["features"]])
    r = post(nw, "/jobs/quote", {"kind": "infer", "aoi": mapping(land.buffer(0.0003).simplify(0.0005))})   # 관할 경계 밖 약 30m
    assert r.status_code == 403 and r.json()["error"]["code"] == OUT
    r = post(nw, "/jobs/quote", {"kind": "infer", "aoi": fc["features"][0]["geometry"]})      # 화면이 보내는 읍면동 경계 그대로 = 관할 안
    assert r.status_code == 200 and OUT not in (r.json().get("reasons") or [])
    r = post(nw, "/jobs/quote", {"kind": "infer", "aoi": NAMWON_BOX})
    assert r.status_code == 200
    r = post(tok["gj"], "/jobs/quote", {"kind": "infer", "aoi": YEOSU_BOX})                      # 광역 관할의 연안 = 관할
    assert r.status_code == 200, r.text[:200]
    assert post(tok["staff"], "/jobs/quote", {"kind": "infer", "aoi": YEOSU_BOX}).status_code == 200   # LX = 전국


def test_parcels_login_and_scope(tok):
    assert httpx.get(B + "/parcels", params={"lng": 127.3902, "lat": 35.4164}, timeout=30).status_code == 401
    assert get(tok["namwon"], "/parcels", params={"lng": 127.3902, "lat": 35.4164}).status_code == 200
    r = get(tok["namwon"], "/parcels", params={"lng": 127.6622, "lat": 34.7604})
    assert r.status_code == 404 and "pnu" not in r.text
    assert get(tok["staff"], "/parcels", params={"lng": 127.6622, "lat": 34.7604}).status_code == 200


def test_survey_parcel_outside_absent(tok):
    it = get(tok["staff"], "/survey/findings", params={"sgg": YEOSU, "limit": 1}).json()["items"]
    if not it:
        pytest.skip("여수 실태조사 결과 없음")
    pnu = it[0]["pnu"]
    assert get(tok["namwon"], f"/survey/parcels/{pnu}").status_code == 404
    assert get(tok["gj"], f"/survey/parcels/{pnu}").status_code == 200


def test_public_lists_do_not_leak_to_tenant(tok):
    ds = get(tok["namwon"], "/deploys?public=1").json()["items"]
    assert ds and all(d["tenant_id"] == "namwon" for d in ds)
    cards = get(tok["namwon"], "/registry/cards?public=1").json()["items"]
    own = {d["id"] for d in ds}
    assert all(set(c.get("deploys") or []) <= own for c in cards)


# ── ② 광역 — 관할 전체 집계 = 시군구 값의 합(한 출처) ─────────────────────────────────────────────
def test_wide_tenant_total_equals_sum(tok):
    regs = get(tok["gj"], "/survey/regions").json()["items"]
    done = [r for r in regs if r["state"] == "done"]
    assert len(done) >= 2
    st = get(tok["gj"], "/survey/stats", params={"by": "rule"}).json()
    if st.get("state") == "building":
        pytest.skip("실태조사 적재 중")
    assert st["total"]["value"] == sum(int(r["findings"]["value"] or 0) for r in done)
    assert len(get(tok["gj"], "/regions").json()["items"]) > 1


# ── ③ 반려된 기능 0 ───────────────────────────────────────────────────────────────────────────
def test_rejected_features_absent(tok):
    nw = tok["namwon"]
    f = get(nw, "/survey/findings", params={"state": "open", "limit": 1}).json()["items"][0]
    r = post(nw, f"/survey/findings/{f['id']}/state", {"state": "assigned", "assignee": "현장 1팀", "client_id": "pytest-scope-assign"})
    assert r.status_code == 400 and "배정" in r.json()["error"]["message"]
    for k in ("시정명령", "이행강제금", "원상복구", "correction", "penalty", "restore"):
        r = post(nw, "/survey/actions", {"finding_id": f["id"], "kind": k})
        assert r.status_code == 400, k
    acts = get(nw, "/survey/actions", params={"limit": 1000}).json()["items"]
    assert not [a for a in acts if a["kind"] in ("correction", "penalty", "restore") and a["state"] != "cancelled"]   # 옛 기록은 취소로
    from survey import report as S
    assert not hasattr(S, "render_letter")
    txt = S.docx_text(S.build_draft(NAMWON, None, 10, fmt="docx", realm="tenant", tenant="namwon"))
    for w in ("배정", "시정명령", "이행강제금", "공문"):
        assert w not in txt, w
