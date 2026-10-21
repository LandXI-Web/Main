"""XI맵 확대 속도(impl-20 ximap-speed · 원칙 157) — 결과 지도 조각을 한 요청 · 판 번호 주소 · 보관으로.

① GET /ximap/board 의 결과 층마다 판(v) = 결과 파일 지문. GET /tiles/mvt/{set}/{z}/{x}/{y}.pbf?v=판 → 1년 보관(immutable) · 다른 판 → no-cache.
② 파일이 바뀌면(다시 구움) 판이 바뀐다 → 옛 주소는 보관되지 않는다(무효화).
③ 얕은 줌(≤12) 조각은 화면이 쓰는 속성(id · cls)만 · 도형 · 객체 수는 그대로. 깊은 줌은 원래 속성 그대로.
④ 그 자리 고치기 층(/ximap/edits)은 보관하지 않는다(no-store). 서명 세트는 서명 없이 403 · 서명 주소는 같은 6시간 칸 안에서 같다.
실행: python -m pytest server/tests/test_impl20_ximap_speed.py -q   (게이트웨이 :8700 · GPU 0)
"""
import gzip
import math
import os
import shutil
import time

import httpx
import pytest

from conftest import B, H

ROOT = B.rsplit("/api/v1", 1)[0]


def get(t, p):
    r = httpx.get(B + p, headers=H(t), timeout=60)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def board(tok):
    return get(tok["staff"], "/ximap/board?fresh=1")


def layers(board):
    return [x["layer"] for r in board["regions"] for x in r["items"] if x["layer"].get("source") == "pmtiles"]


def tile_of(lng, lat, z):
    n = 2 ** z
    x = int((lng + 180) / 360 * n)
    y = int((1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n)
    return x, y


def first_tile(L, z, sig=""):
    """그 층 범위 안에서 내용이 있는 조각 하나(가운데부터 둘레로)"""
    b = L["bounds"]
    cx, cy = tile_of((b[0] + b[2]) / 2, (b[1] + b[3]) / 2, z)
    for d in range(0, 4):
        for dx in range(-d, d + 1):
            for dy in range(-d, d + 1):
                u = f"{ROOT}/tiles/mvt/{L['set']}/{z}/{cx + dx}/{cy + dy}.pbf?v={L['v']}{sig}"
                r = httpx.get(u, timeout=60)
                if r.status_code == 200:
                    return u, r
    return None, None


def test_board_layers_have_version_and_immutable_tiles(board):
    ls = [L for L in layers(board) if not L.get("signed") and L.get("bounds")]
    assert ls and all(L.get("v") and len(L["v"]) == 10 for L in layers(board))
    L = max(ls, key=lambda L: (L["bounds"][2] - L["bounds"][0]))
    u, r = first_tile(L, 14)
    assert r is not None, L["set"]
    assert r.headers["cache-control"] == "public, max-age=31536000, immutable"
    assert r.headers["x-lx-ver"] == L["v"] and r.headers.get("content-encoding") == "gzip"
    old = httpx.get(u.replace("v=" + L["v"], "v=0000000000"), timeout=60)
    assert old.status_code == 200 and old.headers["cache-control"] == "no-cache"   # 옛 판 주소 = 보관 안 함
    assert httpx.get(f"{ROOT}/tiles/mvt/{L['set']}/3/0/0.pbf?v={L['v']}", timeout=30).status_code == 204   # 줌 밖 = 빈 조각


def test_slim_low_zoom_keeps_id_cls_and_geometry(board):
    import mapbox_vector_tile as mvt
    import sys
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
    from landxi_api import config, tiles
    L = next(L for L in layers(board) if not L.get("signed") and L.get("bounds"))
    path = config.DATA_ROOT / tiles.resolve_set_path(L["set"])
    ver = tiles.tile_ver(path)
    assert ver == L["v"]
    for z in (10, 11, 12):
        b = L["bounds"]
        x, y = tile_of((b[0] + b[2]) / 2, (b[1] + b[3]) / 2, z)
        data, comp = tiles._pm_get(path, ver, z, x, y)
        if not data:
            continue
        raw = gzip.decompress(data) if comp == 2 else data
        a, s = mvt.decode(raw), mvt.decode(tiles.slim_mvt(raw))
        for name in a:
            assert len(a[name]["features"]) == len(s[name]["features"])
            for fa, fs in zip(a[name]["features"], s[name]["features"]):
                assert fa["geometry"] == fs["geometry"]
                assert set(fs["properties"]) <= {"id", "cls"}
                assert all(fs["properties"][k] == fa["properties"][k] for k in fs["properties"])
                assert ("id" in fa["properties"]) == ("id" in fs["properties"])
        return
    pytest.skip("얕은 줌 조각 없음")


def test_rebake_changes_version(tok):
    """결과 파일이 바뀌면 판이 바뀌고 옛 주소는 보관되지 않는다(시험용 사본 · 끝에 지움)."""
    import sys
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
    from landxi_api import config, tiles
    src = config.DATA_ROOT / "results" / "namwon-landcover-2023.pmtiles"
    if not src.exists():
        pytest.skip("원본 결과 없음")
    dst = config.DATA_ROOT / "results" / "lx" / "zz-speed-test.pmtiles"
    shutil.copyfile(src, dst)
    try:
        set_id = "results/lx/zz-speed-test"
        v1 = tiles.set_tile_ver(set_id)
        x, y = tile_of(127.4236, 35.4325, 14)                      # 사본의 범위 가운데(원본 머리 center)
        u = f"{ROOT}/tiles/mvt/{set_id}/14/{x}/{y}.pbf"
        # 규칙 없는 결과 세트 = 모르면 닫힘(10-22 옆문 닫기 2차) — 서명 없이 403, LX 서명으로 연다
        assert httpx.get(u + "?v=" + v1, timeout=60).status_code == 403
        sg = httpx.get(f"{ROOT}/tiles/sign", params={"set": set_id}, headers=H(tok["staff"]), timeout=60).json()["url"]
        q = "&" + sg.split("?", 1)[1]
        r1 = httpx.get(u + "?v=" + v1 + q, timeout=60)
        assert r1.headers["x-lx-ver"] == v1 and "immutable" in r1.headers["cache-control"]
        t = time.time() + 5
        os.utime(dst, (t, t))                                      # 다시 구운 것과 같음(고친 시각이 바뀜)
        v2 = tiles.set_tile_ver(set_id)
        assert v2 != v1
        r2 = httpx.get(u + "?v=" + v1 + q, timeout=60)
        assert r2.headers["x-lx-ver"] == v2 and r2.headers["cache-control"] == "no-cache"
        assert "immutable" in httpx.get(u + "?v=" + v2 + q, timeout=60).headers["cache-control"]
    finally:
        dst.unlink(missing_ok=True)
        for d in (config.DATA_ROOT / "cache" / "mvt").glob("*"):
            if d.is_dir() and d.name.split("-")[-1] in (locals().get("v1"), locals().get("v2")):
                shutil.rmtree(d, ignore_errors=True)


def test_edits_layer_not_cached(tok, board):
    sets = ",".join(L["set"] for L in layers(board)[:3])
    r = httpx.get(B + "/ximap/edits?sets=" + sets, headers=H(tok["staff"]), timeout=60)
    assert r.status_code == 200 and r.headers["cache-control"] == "no-store"


def test_sign_url_stable(tok, board):
    L = layers(board)[0]
    sg = lambda: httpx.get(f"{ROOT}/tiles/sign", params={"set": L["set"]}, headers=H(tok["staff"]), timeout=30).json()["url"]
    a, b = sg(), sg()
    assert a == b                                                  # 같은 6시간 칸 = 같은 서명 주소(보관이 이어짐)


def test_signed_sets_need_signature(board):
    s = [L for L in layers(board) if L.get("signed")]
    if not s:
        pytest.skip("LX 전국 결과에 서명 세트 없음")
    L = s[0]
    assert httpx.get(f"{ROOT}/tiles/mvt/{L['set']}/14/0/0.pbf?v={L['v']}", timeout=30).status_code == 403
