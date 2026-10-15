"""바퀴 14 재검수 · 속도(구현 36 · 원칙 251) — 실서버(:8700) 시험. 읽기만(기록 · 행을 남기지 않음).

① GET /deploys?geom=bbox — 경계 도형 대신 범위 네모만(관리자 · 대시보드 지도 점이 쓰는 값은 같고, 응답이 9할 작다).
② GET /survey/build/{sgg}?soft=1 — 아직 만들지 않은 시군구는 404(브라우저 콘솔 오류) 대신 빈 상태. 옵션 없으면 그대로 404.
③ GET /public/stats?geom=1 — 만든 본문을 다시 쓰므로 두 번째가 빠르고 내용이 같다.
"""
import time

import httpx
from shapely.geometry import shape

from conftest import B, H


def get(tok, path):
    return httpx.get(B + path, headers=H(tok) if tok else {}, timeout=120)


def test_deploys_bbox_same_extent(tok):
    full = get(tok["admin"], "/deploys").json()["items"]
    box = get(tok["admin"], "/deploys?geom=bbox").json()["items"]
    assert [d["id"] for d in full] == [d["id"] for d in box]
    for f, b in zip(full, box):
        if not f["aoi"]:
            continue
        fb, bb = shape(f["aoi"]).bounds, shape(b["aoi"]).bounds
        assert all(abs(x - y) < 1e-5 for x, y in zip(fb, bb))
        assert len(str(b["aoi"])) <= len(str(f["aoi"]))


def test_survey_build_soft(tok):
    r = get(tok["staff"], "/survey/build/41220?soft=1")
    assert r.status_code == 200 and r.json()["state"] is None
    assert get(tok["staff"], "/survey/build/41220").status_code == 404
    done = get(tok["staff"], "/survey/build/52190?soft=1").json()
    assert done["state"]                                   # 만든 곳은 그대로 상태가 온다


def test_public_stats_body_reused():
    u = "/public/stats?set=river-occupy&by=sigungu&geom=1"
    a = get(None, u)
    t = time.perf_counter()
    b = get(None, u)
    ms = (time.perf_counter() - t) * 1000
    assert a.status_code == b.status_code == 200 and a.json() == b.json() and a.json()["geojson"]["features"]
    assert ms < 400
