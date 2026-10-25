"""국토 변화 틀(10-25) 시험 — 시험 게이트웨이(시험 DB)에서만.

① 찾는 변화 묶음: 산사태 취약지구 = 산림 → 나지 · 도로 · 건물(국토 변화 기본값은 그대로)
② 국토 변화 틀 카드(frame) · 최근 쓴 구간(내 것만 · 시험 구간 빼고) · 지구(올린 도형 하나하나)
③ 결과 장부 '찾는 것' 열(0131)

python -m pytest server/change/tests/test_landslide.py -q        (LX_TEST_API_PORT 로 시험 게이트웨이 포트)
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve()
SERVER = HERE.parents[2]
sys.path.insert(0, str(SERVER / "tests"))
sys.path.insert(0, str(SERVER))
import testdb  # noqa: E402

S = testdb.apply()
from landxi_api import config  # noqa: E402

import httpx  # noqa: E402
import psycopg  # noqa: E402

B = f"http://127.0.0.1:{S['port']}/api/v1"


def _tok(login="test@lx.or.kr"):
    r = httpx.post(B + "/auth/login", json={"realm": "lx", "login": login, "password": config.DEV_PASSWORD}, timeout=30)
    r.raise_for_status()
    return r.json()["token"]


def H(t):
    return {"Authorization": "Bearer " + t}


def test_type_sets():
    from change import detect as D
    F, O, R, Bd, C = D.G["forest"], D.G["other"], D.G["road"], D.G["built"], D.G["crop"]
    ga = np.array([[F, F, F, F, C]], np.uint8)
    gb = np.array([[O, R, Bd, F, Bd]], np.uint8)
    m = D.transitions(ga, gb, "landslide")
    assert list(m) == ["산림 → 나지", "산림 → 도로", "산림 → 건물"]
    assert m["산림 → 나지"].tolist() == [[True, False, False, False, False]]
    assert m["산림 → 도로"].tolist() == [[False, True, False, False, False]]
    assert m["산림 → 건물"].tolist() == [[False, False, True, False, False]]       # 경작 → 건물은 산사태 묶음에 없음
    base = D.transitions(ga, gb)                                                      # 국토 변화 기본값 그대로
    assert set(base) == set(D.TYPES)
    assert D.types_of(None) == D.TYPES and D.types_of("landslide")[0] == "산림 → 나지"


def test_card_frame():
    t = _tok()
    c = httpx.get(B + "/cards/card-landslide", headers=H(t), timeout=60).json()
    assert c.get("frame") == "change" and c.get("can_analyze"), c.get("cant")
    ch = httpx.get(B + "/cards/card-change", headers=H(t), timeout=60).json()
    assert ch.get("frame") == "change"



def test_zones_upload_and_parts():
    t = _tok()
    # 남원 산림 두 곳(작은 네모 두 개) — 지구 이름 칸 '지구명'
    fc = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {"지구명": "가지구"}, "geometry": {"type": "Polygon", "coordinates": [[[127.40, 35.38], [127.401, 35.38], [127.401, 35.381], [127.40, 35.381], [127.40, 35.38]]]}},
        {"type": "Feature", "properties": {"지구명": "나지구"}, "geometry": {"type": "Polygon", "coordinates": [[[127.405, 35.38], [127.406, 35.38], [127.406, 35.381], [127.405, 35.381], [127.405, 35.38]]]}}]}
    files = {"file": ("zones-pytest.geojson", json.dumps(fc).encode(), "application/geo+json")}
    r = httpx.post(B + "/change/ranges", headers=H(t), files=files, data={"buffer_m": "50", "name": "zones-pytest", "origin": "card"}, timeout=120)
    assert r.status_code == 200, r.text
    rid = r.json()["id"]
    with psycopg.connect(config.PG_ADMIN_DSN) as cn:
        parts = cn.execute("SELECT parts FROM change_ranges WHERE id=%s", (rid,)).fetchone()[0]
    assert [p["name"] for p in parts] == ["가지구", "나지구"]
    import asyncio

    from landxi_api import change as CH
    feats = {"features": [{"properties": {"lng": 127.4005, "lat": 35.3805, "area_m2": 120.0, "type": "산림 → 나지"}},
                          {"properties": {"lng": 127.4055, "lat": 35.3805, "area_m2": 80.0, "type": "산림 → 도로"}},
                          {"properties": {"lng": 127.4056, "lat": 35.3806, "area_m2": 20.0, "type": "산림 → 건물", "hidden": True}}]}
    z = asyncio.run(CH.zones_of(rid, feats))
    assert [(x["name"], x["n"]["value"], x["area"]["value"]) for x in z] == [("가지구", 1, 120.0), ("나지구", 1, 80.0)]


def test_ledger_target_column():
    with psycopg.connect(config.PG_ADMIN_DSN) as cn:
        assert cn.execute("SELECT 1 FROM information_schema.columns WHERE table_name='service_results' AND column_name='target'").fetchone()
        cv = cn.execute("SELECT modules->>'change_types', model_ids FROM card_versions WHERE id='card-landslide@1.0'").fetchone()
    assert cv[0] == "landslide" and cv[1] == ["change-ap25"]
