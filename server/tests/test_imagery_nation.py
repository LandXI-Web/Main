"""core-imagery — 전국 시군구 영상 공급(도엽 색인 → 시군구 VRT → imagery 행 → best_imagery · open_imagery · /catalog/layers?region=).

판정 지역(시험 인자만 · 코드에는 지역 고정값 0): 여수 12130(옛 46130 · 전남) · 남원 52190(전북 · 기존 행) · 청양 44790(충남) ·
가평 41820(경기 · 로컬 영상 없음). GPU 불필요(창 읽기만).
"""
import httpx
import pytest
from shapely.geometry import box

from landxi_api import config
from workers import imagery_src as isrc

NEW, OLD, BASE, CHUNG, NONE = "12130", "46130", "52190", "44790", "41820"


def test_index_has_all_source_folders():
    from pipelines.p16_imagery_nation import INDEX, load_index, sources
    assert INDEX.exists()
    rows = load_index()
    assert len(rows) > 5000
    from pathlib import Path
    for s in sources():
        dirs = {p.name for p in Path(s["root"]).iterdir() if p.is_dir()}
        assert dirs <= {r["sido_dir"] for r in rows}         # 시도 폴더마다 도엽이 색인됐다


def test_choose_rules():
    t = box(0, 0, 10, 10)
    rows = [
        {"id": "chip", "gsd_m": 0.05, "year": 2025, "fp": box(0, 0, 1, 1), "readable": True},          # 1% → 후보 아님
        {"id": "old25", "gsd_m": 0.25, "year": 2020, "fp": box(0, 0, 10, 10), "readable": True},
        {"id": "new25", "gsd_m": 0.25, "year": 2023, "fp": box(0, 0, 10, 8), "readable": True},
        {"id": "sat", "gsd_m": 10, "year": 2026, "fp": box(0, 0, 10, 10), "readable": True},
        {"id": "tileonly", "gsd_m": 0.05, "year": 2026, "fp": box(0, 0, 10, 10), "readable": False},   # 원본 경로 없음
    ]
    b = isrc.choose(rows, t)
    assert b["id"] == "new25" and b["coverage"] == 0.8
    assert isrc.choose([rows[0]], t) is None


@pytest.mark.parametrize("cd", [NEW, OLD, BASE, CHUNG])
def test_best_imagery_three_regions(cd):
    r = isrc.best_imagery_sync(cd)
    assert r["imagery_id"], r
    assert r["source"] == "local" and abs(r["gsd_m"] - 0.25) < 1e-6 and r["year"] == 2023 and 0 < r["coverage"] <= 1


def test_old_and_new_code_same():
    assert isrc.best_imagery_sync(OLD)["imagery_id"] == isrc.best_imagery_sync(NEW)["imagery_id"]


def test_no_local_imagery_honest():
    r = isrc.best_imagery_sync(NONE)
    assert r["imagery_id"] is None and r["reason"] == "no_imagery" and r["next"] == "영상 등록"
    assert r["vworld"]["allowed"] is False                     # 약관 판정 = 분석 입력으로 쓰지 않음


def test_open_imagery_reads_chip():
    """gpu_worker 가 부를 open_imagery 로 여수 VRT 에서 512 칩 한 장 — RGB 값 · 알파 255(도엽 안)."""
    from pyproj import Transformer
    from rasterio.windows import from_bounds
    iid = isrc.best_imagery_sync(NEW)["imagery_id"]
    ds = isrc.open_imagery(iid)
    assert ds.count == 4 and ds.crs.to_epsg() == 5186 and abs(ds.res[0] - 0.25) < 1e-9
    assert isrc.open_imagery(iid) is ds                        # 같은 스레드 = 같은 핸들
    from pipelines.p16_imagery_nation import load_index
    import psycopg
    from shapely.geometry import shape
    import json
    with psycopg.connect(config.PG_WORKER_DSN) as c:
        fp = shape(json.loads(c.execute("SELECT ST_AsGeoJSON(footprint) FROM imagery WHERE id=%s", (iid,)).fetchone()[0]))
    sheet = next(s for s in load_index() if fp.contains(s["geom"].centroid))
    cx, cy = Transformer.from_crs(4326, 5186, always_xy=True).transform(sheet["geom"].centroid.x, sheet["geom"].centroid.y)
    win = from_bounds(cx - 64, cy - 64, cx + 64, cy + 64, transform=ds.transform)
    a = ds.read(window=win, boundless=True, fill_value=0)
    assert a.shape == (4, 512, 512)
    assert a[3].min() == 255 and a[:3].std() > 1


def test_worker_path_is_vrt():
    iid = isrc.best_imagery_sync(NEW)["imagery_id"]
    assert isrc.imagery_path(iid).endswith(".vrt")
    with pytest.raises(isrc.ImageryUnavailable):
        isrc.imagery_path("img-00000-1900-none")


# ── 게이트웨이(기동 중일 때) ────────────────────────────────────────────────
def test_regions_has_imagery(live):
    r = httpx.get(live + "/regions", params={"has_imagery": 1, "public": 1}, timeout=60).json()
    cds = {i["sgg_cd"] for i in r["items"]}
    assert {NEW, BASE, CHUNG} <= cds and NONE not in cds
    assert len(cds) >= 60


def test_catalog_region_old_new(live, tok):
    from conftest import H
    for cd in (NEW, OLD):
        j = httpx.get(live + "/catalog/layers", params={"region": cd}, headers=H(tok["staff"]), timeout=60).json()
        own = [i for i in j["items"] if i["role"] == "imagery" and i["source"] != "external"]
        assert own and all(i["sgg_cd"] == NEW for i in own), [i["id"] for i in own]
        it = own[0]
        assert it["tile_ready"] and it["bounds"] and it["gsd_m"] == 0.25 and it["coverage"]["value"] > 0
        assert j["region"]["sgg_cd"] == NEW


def test_catalog_region_tenant_no_raw(live, tok):
    from conftest import H
    j = httpx.get(live + "/catalog/layers", params={"region": NEW}, headers=H(tok["gj"]), timeout=60).json()
    assert not [i for i in j["items"] if i.get("tier") == "raw"]


def test_best_imagery_route(live, tok):
    from conftest import H
    j = httpx.get(live + "/catalog/best_imagery", params={"region": OLD}, headers=H(tok["staff"]), timeout=60).json()
    assert j["imagery_id"] and j["source"] == "local"
    j = httpx.get(live + "/catalog/best_imagery", params={"region": NONE}, headers=H(tok["staff"]), timeout=60).json()
    assert j["imagery_id"] is None and j["next"] == "영상 등록"
