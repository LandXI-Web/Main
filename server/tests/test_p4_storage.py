"""바퀴 22 P4 저장 형식 · 정리(10-22 now21) — 결과 자리(연-월) · FlatGeobuf 두 형식 읽기 · 학습 그림 JPEG · 이력 번호 · 필지 공통 한 벌 · 기관 권한 계정."""
from __future__ import annotations

import re

import pytest

from landxi_api import config, result_store as R


def test_month_of_ulid_and_legacy():
    from landxi_api.jobs import ulid
    j = "job_" + ulid()
    assert re.fullmatch(r"\d{4}-\d{2}", R.month_of(j))
    assert R.month_of("namwon-landcover-2023") is None
    assert R.month_of("job_" + "0" * 20 + "123456") is None          # 시험 번호(ULID 아님) → 옛 자리
    b = R.base("lx", j)
    assert b.parent.name == R.month_of(j) and b.parent.parent.name == "lx"


def test_legacy_place_wins_when_present(tmp_path, monkeypatch):
    from landxi_api.jobs import ulid
    monkeypatch.setattr(config, "DATA_ROOT", tmp_path)
    j = "job_" + ulid()
    (tmp_path / "results" / "lx").mkdir(parents=True)
    (tmp_path / "results" / "lx" / f"{j}.geojson").write_text('{"type":"FeatureCollection","features":[]}', encoding="utf-8")
    assert R.base("lx", j) == tmp_path / "results" / "lx" / j            # 옛 자리에 있으면 옛 자리(그대로 읽힘)
    assert R.vector_path("lx", j).suffix == ".geojson"


def test_fgb_roundtrip_7_digits_and_both_formats(tmp_path):
    from shapely.geometry import MultiPolygon, Polygon
    g = [Polygon([(127.123456789, 35.1), (127.2, 35.1), (127.2, 35.2)]), MultiPolygon([Polygon([(127, 35), (127.01, 35), (127.01, 35.01)])])]
    props = [{"id": "a", "cls": "경작지", "cid": 3, "conf": 0.91, "chip_edge": True, "emd": None},
             {"id": "b", "cls": "비닐하우스", "cid": None, "conf": None, "chip_edge": False, "emd": "운봉읍"}]
    out = tmp_path / "x.fgb"
    R.write_fgb(out, g, props, ("id", "cls", "cid", "conf", "chip_edge", "emd"))
    fs = R.read_features(out)
    assert [f["properties"]["id"] for f in fs] == ["a", "b"]
    assert fs[0]["properties"]["cid"] == 3 and fs[1]["properties"]["cid"] is None and fs[1]["properties"]["emd"] == "운봉읍"
    x = fs[0]["geometry"]["coordinates"][0][0][0]
    assert abs(x - 127.1234568) < 1e-9                                    # 소수 7자리
    assert len(R.read_features(out, (126.99, 34.99, 127.02, 35.02))) == 1   # 공간 색인 범위 읽기
    gj = tmp_path / "y.geojson"
    gj.write_text('{"type":"FeatureCollection","features":[{"type":"Feature","geometry":{"type":"Point","coordinates":[1,2]},"properties":{"id":"p"}}]}',
                  encoding="utf-8")
    assert R.read_features(gj)[0]["properties"]["id"] == "p"


def test_training_images_jpeg95(tmp_path):
    from PIL import Image
    from landxi_api.train_tiles import IMG_NEW, save_img
    assert IMG_NEW == ".jpg"
    im = Image.new("RGB", (64, 64), (120, 130, 140))
    save_img(im, tmp_path / "a.jpg")
    with Image.open(tmp_path / "a.jpg") as j:
        assert j.format == "JPEG"


def test_labeling_new_set_jpeg_old_set_png(tmp_path):
    from landxi_api.labeling import _img_ext, _pool_file
    (tmp_path / "new" / "pool").mkdir(parents=True)
    assert _img_ext(tmp_path / "new") == ".jpg"
    (tmp_path / "old" / "pool").mkdir(parents=True)
    (tmp_path / "old" / "pool" / "s_0001.png").write_bytes(b"x")
    assert _img_ext(tmp_path / "old") == ".png"                           # 옛 묶음은 그대로
    assert _pool_file(tmp_path / "old", "s_0001").suffix == ".png"


def test_four_band_plan_splits_real_fourth_band(monkeypatch):
    from landxi_api.imagery_std import band4_path, plan
    info = {"count": 4, "dtypes": ["uint8"] * 4, "palette": False, "colorinterp": ["red", "green", "blue", "undefined"], "alpha_band": None,
            "nodata": None, "mask": None, "compression": None, "layout": None, "path": "x.tif"}
    import landxi_api.imagery_std as S
    monkeypatch.setattr(S, "_guess_alpha", lambda info: False)           # 넷째 밴드가 실제 값(투명 칸 아님)
    r = plan(info)
    assert r["rule"] == "jpeg" and r["bands"] == [1, 2, 3] and r["extra_band"] == 4
    assert band4_path("cog/std/a.tif").name == "a.b4.tif"


def test_migration_numbers_continue():
    """이력 번호는 이어서 한 번호씩(0118 부터 겹침 0 · 옛 겹침 0004 · 0008 은 그대로)."""
    from migrate import dup_numbers
    assert not {k: v for k, v in dup_numbers().items() if k >= 118}


def _pg(sql, args=(), realm="lx", tenant=""):
    import psycopg
    with psycopg.connect(config.PG_WORKER_DSN.replace("@localhost:", "@127.0.0.1:")) as c:
        c.execute("SELECT set_config('app.realm', %s, false), set_config('app.tenant_id', %s, false)", (realm, tenant))
        return c.execute(sql, args).fetchall()


def test_parcels_one_national_set():
    try:
        rows = _pg("SELECT tenant_id, count(*) FROM survey_parcels GROUP BY 1")
        dflt = _pg("SELECT column_default FROM information_schema.columns WHERE table_name='survey_parcels' AND column_name='tenant_id'")
    except Exception as e:  # noqa: BLE001
        pytest.skip(f"DB 없음: {e!r}")
    assert {t for t, _ in rows} == {"lx"}                                 # 주인 한 벌
    assert "namwon" not in str(dflt[0][0])                                # 기본값에 지역 이름 없음


def test_tenant_role_cannot_escape_with_realm_lx():
    """기관 권한 계정은 app.realm 을 lx 로 바꿔도 자기 범위만(1단계 칸막이 · RESTRICTIVE)."""
    dsn = config.PG_TENANT_DSN
    if not dsn:
        pytest.skip("PG_TENANT_DSN 없음")
    import psycopg
    with psycopg.connect(dsn.replace("@localhost:", "@127.0.0.1:")) as c:
        c.execute("SELECT set_config('app.realm','lx',false), set_config('app.tenant_id','namwon',false)")
        sgg = {r[0] for r in c.execute("SELECT DISTINCT sgg_cd FROM survey_parcels WHERE sgg_cd IN ('52190','12130','52730')").fetchall()}
        assert sgg == {"52190"}
        ten = {r[0] for r in c.execute("SELECT DISTINCT tenant_id FROM survey_findings LIMIT 50").fetchall()}
        assert ten <= {"namwon"}
