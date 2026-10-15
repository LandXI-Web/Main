"""구현 35 · LX 관리자 '공유 데이터' 줄을 누르면 상세(10-15 공유데이터-상세 · 원칙 255) · 세계 바탕 사다리(EOx-모두교체).

① GET /shared/imagery/{id} — 범위(bbox · 도형) · 해상도 · 범위 면적 · 크기 · 공개 · 쓰인 곳(분석 · 프로젝트 · 기관) · 경로 0 · 직원 403.
② GET /shared/train-data/{id} — 그림 넷(API 아래 경로 · 받으면 JPEG) · 클래스별 장수 · 쓰인 학습 · 직원 403.
③ GET /shared/ledgers/{id} — LX 행정 자료(올린 도형 · 속성 앞 5줄 · 도형 종류) · 기관 대장(원래 열 이름 · 필지 도형) · 없는 것 404.
④ 글로벌 타일 사다리 — 세계 바탕 판(world) · 외부 비상업 원천 0.
실행: python -m pytest server/tests/test_impl35_shared_detail.py -q   (게이트웨이 :8700)
"""
import json

import httpx

from conftest import ADMIN_LOGIN, B, login_lx


def H(t):
    return {"authorization": "Bearer " + t}


def test_imagery_detail(live):
    a, s = login_lx(ADMIN_LOGIN), login_lx()
    im = httpx.get(B + "/projects/imagery?all=1", headers=H(a), timeout=60).json()["items"]
    assert im
    d = httpx.get(B + f"/shared/imagery/{im[0]['id']}", headers=H(a), timeout=60).json()
    assert d["name"] and len(d["bbox"]) == 4 and d["footprint"]["type"] in ("Polygon", "MultiPolygon")
    for k in ("gsd_cm", "area_km2", "bytes"):
        assert d[k]["unit"] and "as_of" in d[k]
    assert set(d["used"]) == {"jobs", "projects", "orgs"}
    assert "path" not in json.dumps(d, ensure_ascii=False).lower().replace("path_", "")   # 파일 경로를 내지 않는다
    assert httpx.get(B + f"/shared/imagery/{im[0]['id']}", headers=H(s), timeout=30).status_code == 403
    assert httpx.get(B + "/shared/imagery/nope-0", headers=H(a), timeout=30).status_code == 404


def test_train_detail(live):
    a, s = login_lx(ADMIN_LOGIN), login_lx()
    td = httpx.get(B + "/shared/train-data", headers=H(a), timeout=60).json()["items"]
    smp = next((x for x in td if x["source"] == "sample"), None)
    if not smp:
        return
    d = httpx.get(B + f"/shared/train-data/{smp['id']}", headers=H(a), timeout=60).json()
    assert d["source"] == "sample" and d["classes"] and all(c["images"]["unit"] == "count" for c in d["classes"])
    assert 1 <= len(d["previews"]) <= 4 and "n" in d["used"]
    r = httpx.get(B + d["previews"][0], headers=H(a), timeout=60)
    assert r.status_code == 200 and r.headers["content-type"] == "image/jpeg"
    assert httpx.get(B + f"/shared/train-data/{smp['id']}", headers=H(s), timeout=30).status_code == 403


def test_ledger_detail(live):
    a = login_lx(ADMIN_LOGIN)
    fc = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {"관리번호": f"T-{i}", "성명": "홍길동"},
         "geometry": {"type": "Polygon", "coordinates": [[[127.0 + i * .01, 35.0], [127.005 + i * .01, 35.0], [127.005 + i * .01, 35.005], [127.0 + i * .01, 35.005], [127.0 + i * .01, 35.0]]]}}
        for i in range(3)]}
    up = httpx.post(B + "/shared/ledgers", headers=H(a), files={"file": ("t35.geojson", json.dumps(fc).encode(), "application/geo+json")},
                    data={"kind": "public_asset", "name": "pytest 행정 자료 35"}, timeout=60)
    assert up.status_code == 201, up.text
    iid = up.json()["id"]
    try:
        d = httpx.get(B + f"/shared/ledgers/{iid}", headers=H(a), timeout=60).json()
        assert d["owner"] == "lx" and d["geom"] == "면" and d["columns"] == ["관리번호"] and len(d["head"]) == 3   # 성명 열은 저장 0
        assert len(d["shape"]["features"]) == 3 and len(d["bbox"]) == 4 and d["fmt"] == "GEOJSON"
    finally:
        httpx.delete(B + f"/shared/ledgers/{iid}", headers=H(a), timeout=60)
    assert httpx.get(B + f"/shared/ledgers/{iid}", headers=H(a), timeout=30).status_code == 404
    org = next((x for x in httpx.get(B + "/shared/ledgers", headers=H(a), timeout=60).json()["items"] if x["owner"] != "lx"), None)
    if org:
        d = httpx.get(B + f"/shared/ledgers/{org['id']}", headers=H(a), timeout=60).json()
        assert d["owner"] == "tenant" and d["tenant"] and len(d["head"]) <= 5
        assert not any(c in ("pnu", "jibun", "status") for c in d["columns"]) or not d["columns"]   # 역할 이름이 아니라 기관 파일의 열 이름


def test_global_tile_world(live):
    r = httpx.get(B + "/proxy/tiles/global/3/6/3", timeout=30)
    assert r.status_code == 200 and r.headers["x-lx-tile-source"] == "world" and r.headers["content-type"] == "image/webp"
