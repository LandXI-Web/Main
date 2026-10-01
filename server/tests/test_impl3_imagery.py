"""impl-3 영상 표준 하나로 · 용량 줄이기 · ECW 받기 — 실서버(:8700) + 모듈 시험.

확인 대장 15차: 영상-1 확인(ECW 는 올라오면 COG 로 변환 · 변환에 쓰는 GDAL 은 설정 한 곳) · 영상-2 ⓐ(표준 = COG · JPEG 90 · 축소판 · 이미 표준이면 다시 압축 0)
· 영상-3 ⓑ(원본은 표준본 확인 뒤 90일 · 정해진 작업이 지우고 감사 기록) · 확인 없이 고칠 고장(받을 수 없는 형식은 고르는 순간 · JP2 를 읽는 GDAL).
GPU 0 — 변환은 CPU. 시험 영상은 남원 25cm 항공 모음에서 잘라 낸 작은 조각 · 무작위 화소(복사본) — 실자산 원본은 읽기만 한다.
끝에서 이 시험이 만든 묶음 · 기록 · 파일을 지운다. 원본 지우기는 시험 칸(02. 데이터/tenants/_imagery_std_test)에서만.
"""
import datetime as dt
import shutil
import time
from pathlib import Path

import httpx
import numpy as np
import psycopg
import pytest
import rasterio
from rasterio.transform import from_origin

from conftest import B, H, login_lx, login_tenant
from landxi_api import config
from landxi_api import imagery_std as S

TEST = config.DATA_ROOT / "tenants" / "_imagery_std_test"
NAMWON_VRT = config.DATA_ROOT / "_work" / "namwon_ap25_2023.vrt"


def pg():
    return psycopg.connect(config.PG_ADMIN_DSN, autocommit=True)


def chip(out: Path, px=1024, dx=0.0, crs=True) -> Path:
    """남원 덕과면 25cm 항공 조각(실제 화소 · 사본). crs=False 면 좌표계 없이 TFW 만(국토지리정보원 도엽 모양)."""
    from rasterio.warp import transform
    from rasterio.windows import Window
    xs, ys = transform("EPSG:4326", "EPSG:5186", [127.36654 + dx], [35.52301])
    with rasterio.open(NAMWON_VRT) as s:
        r, c = s.index(xs[0], ys[0])
        w = Window(c - px // 2, r - px // 2, px, px)
        arr, t = s.read([1, 2, 3], window=w), s.window_transform(w)
    kw = {"crs": "EPSG:5186"} if crs else {}
    with rasterio.open(out, "w", driver="GTiff", width=px, height=px, count=3, dtype="uint8", transform=t, **kw) as d:
        d.write(arr)
    if not crs:
        out.with_suffix(".tfw").write_text("\n".join(str(v) for v in (t.a, t.d, t.b, t.e, t.c + t.a / 2, t.f + t.e / 2)) + "\n")
    return out


@pytest.fixture(scope="module")
def box():
    TEST.mkdir(parents=True, exist_ok=True)
    made = {"rec": [], "draft": []}
    yield made
    c = pg()
    for rid in made["rec"]:
        c.execute("DELETE FROM imagery_std WHERE id=%s", (rid,))
        c.execute("DELETE FROM audit_log WHERE subject=%s AND action LIKE 'imagery.original%%'", (rid,))
    for did in made["draft"]:
        for (uid, rel) in c.execute("SELECT id, rel_path FROM request_uploads WHERE draft_id=%s", (did,)).fetchall():
            c.execute("DELETE FROM imagery_std WHERE source_kind='upload' AND source_id=%s", (uid,))
            shutil.rmtree((config.DATA_ROOT / rel).parent, ignore_errors=True)
        c.execute("DELETE FROM request_uploads WHERE draft_id=%s", (did,))
    c.close()
    shutil.rmtree(TEST, ignore_errors=True)


# ── 설정 한 곳 · GDAL 묶음 ────────────────────────────────────────────────────
def test_settings_one_place():
    s = S.settings()
    assert s["standard"]["color"]["compress"] == "JPEG" and int(s["standard"]["color"]["quality"]) == 90     # 영상-2 ⓐ
    assert int(s["original"]["keep_days"]) == 90                                                         # 영상-3 ⓑ
    assert "ecw" in S.accept_raster() and "eww" in S.accept_sidecar()
    from landxi_api import requests as RQ
    assert RQ.settings()["raster_ext"] == S.accept_raster()                    # 기관 의뢰와 LX 영상 등록이 같은 값


def test_tools_pick_reader_per_format():
    """형식마다 읽을 수 있는 GDAL — 서버 기본 GDAL 에 없는 JP2 · ECW 는 ECW 쪽 GDAL(설정 LX_ECW_GDAL_BIN)."""
    ts = S.tools(force=True)
    assert ts and ts[0]["name"] == "server" and ts[0]["ok"]
    assert S.tool_for("tif")["name"] == "server"
    ecw = S.tool_for("ecw")
    if ecw is None:
        pytest.skip("이 PC 에 ECW 를 읽는 GDAL 이 없음")
    assert ecw["name"] == "ecw" and "ECW" in ecw["drivers"]
    assert S.tool_for("jp2") is not None                                      # 고장 ②: JP2 를 읽는 GDAL 이 고른다


def test_missing_ecw_converter_line(monkeypatch):
    """ECW 를 읽는 GDAL 이 없으면 — LX 쪽 'ECW 변환기가 이 서버에 없습니다' · 기관은 쉬운 말 한 줄."""
    monkeypatch.setattr(S, "_ecw_bin", lambda: Path("C:/없는/경로/bin"))
    try:
        S.tools(force=True)
        lx, gov = S.unavailable(True), S.unavailable(False)
        assert lx.get("ecw") == "ECW 변환기가 이 서버에 없습니다"
        assert "ecw" in gov and "변환기" not in gov["ecw"] and "TIF" in gov["ecw"]
        assert "tif" not in lx
    finally:
        monkeypatch.undo()
        S.tools(force=True)


# ── 표준 규칙 · 바꾸기 · 확인 ───────────────────────────────────────────────────
def test_color_jpeg90_with_tfw_only(box):
    """좌표계 기록이 없는 도엽(TFW 만) — 위치로 가려낸 번호를 붙이고(다시 그리지 않음) COG · JPEG 90 · 축소판 · 화질 기준 통과."""
    src = chip(TEST / "aerial_tfw.tif", 2048, crs=False)
    out = S.standardize(src, TEST / "std" / "aerial_tfw.tif", epsg=5186)
    assert out["rule"] == "jpeg" and out["checks"]["pass"] and out["checks"]["same_grid"] and out["checks"]["crs"] == 5186
    assert out["checks"]["psnr_db"] >= 38 and (out["checks"]["ssim"] is None or out["checks"]["ssim"] >= 0.97)
    with rasterio.open(out["std_path"]) as d:
        ist = d.tags(ns="IMAGE_STRUCTURE")
        assert ist.get("LAYOUT") == "COG" and "JPEG" in ist.get("COMPRESSION", "") and ist.get("JPEG_QUALITY") == "90"
        assert d.overviews(1) and d.count == 3
    assert out["std_size"] < out["orig_size"] * 0.35                          # 무압축 원본보다 훨씬 작다(실측은 README)


def test_alpha_to_mask_and_value_lossless(box):
    """4밴드(넷째 = 투명 칸) → 색 3밴드 + 마스크 · 16비트 다중분광 → 무손실(값 그대로)."""
    a = np.zeros((4, 512, 512), dtype="uint8")
    with rasterio.open(chip(TEST / "rgb.tif", 512)) as s:
        a[:3] = s.read()
        t = s.transform
    a[3, :, :400] = 255                                                     # 오른쪽 112칸은 빈 칸
    with rasterio.open(TEST / "rgba.tif", "w", driver="GTiff", width=512, height=512, count=4, dtype="uint8", crs="EPSG:5186", transform=t,
                       photometric="RGB", extra_samples=[2]) as d:
        d.write(a)
        d.colorinterp = [rasterio.enums.ColorInterp.red, rasterio.enums.ColorInterp.green, rasterio.enums.ColorInterp.blue, rasterio.enums.ColorInterp.alpha]
    out = S.standardize(TEST / "rgba.tif", TEST / "std" / "rgba.tif")
    assert out["rule"] == "jpeg" and out["mask"] == "alpha" and out["checks"]["pass"]
    with rasterio.open(out["std_path"]) as d:
        m = d.dataset_mask()
        assert d.count == 3 and (m[:, 400:] == 0).all() and (m[:, :400] > 0).all()   # 마스크가 투명 칸과 한 칸도 어긋나지 않음
    v = np.random.default_rng(5).integers(0, 4000, (4, 300, 300), dtype="uint16")
    with rasterio.open(TEST / "ms16.tif", "w", driver="GTiff", width=300, height=300, count=4, dtype="uint16", crs="EPSG:32652",
                       transform=from_origin(300000, 4000000, 2, 2)) as d:
        d.write(v)
    o2 = S.standardize(TEST / "ms16.tif", TEST / "std" / "ms16.tif")
    assert o2["rule"] == "lossless"
    with rasterio.open(o2["std_path"]) as d:
        assert d.count == 4 and (d.read() == v).all() and d.tags(ns="IMAGE_STRUCTURE").get("COMPRESSION") == "ZSTD"


def test_already_standard_not_recompressed(box):
    """이미 COG · JPEG 이면 다시 압축하지 않는다(표준본 = 원본 · 복사 0)."""
    p = TEST / "std" / "aerial_tfw.tif"
    if not p.exists():
        S.standardize(chip(TEST / "aerial_tfw.tif", 2048, crs=False), p, epsg=5186)
    out = S.standardize(p, TEST / "std" / "again.tif")
    assert out["rule"] == "as_is" and Path(out["std_path"]) == p and not (TEST / "std" / "again.tif").exists()


def test_jp2_and_korean_tm_name(box):
    """JP2 — 서버 기본 GDAL 이 못 읽어도 표준본을 만든다 · 이름만 다른 국내 좌표계(NAD83 · WGS84 이름의 중부원점)는 표준 번호."""
    t = S.tool_for("jp2")
    if t is None:
        pytest.skip("JP2 를 읽는 GDAL 이 없음")
    chip(TEST / "for_jp2.tif", 1024)
    S.run(t, "gdal_translate", ["-q", "-of", "JP2OpenJPEG", str(TEST / "for_jp2.tif"), str(TEST / "a.jp2")])
    out = S.standardize(TEST / "a.jp2", TEST / "std" / "a_jp2.tif")
    assert out["rule"] == "jpeg" and out["checks"]["pass"] and out["checks"]["crs"] == 5186
    wkt = ('PROJCS["KOREA TM_M_WGS84",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137,298.257223563]],PRIMEM["Greenwich",0],'
           'UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",200000],PARAMETER["False_Northing",600000],'
           'PARAMETER["Central_Meridian",127],PARAMETER["Scale_Factor",1],PARAMETER["Latitude_Of_Origin",38],UNIT["Meter",1]]')
    assert S._korea_epsg(wkt) == 5186


# ── 원본 지울 날짜 · 정해진 작업(보기만 → 지우기) ─────────────────────────────────────
def test_retention_dry_run_then_delete(box):
    """표준본 확인 날 + 90일 = 원본 지울 날짜. 보기만이면 목록만(파일 그대로) · 지우기는 플랫폼이 받은 원본만 + 감사 기록. 표준본은 남는다."""
    orig = chip(TEST / "old_orig.tif", 256)
    std = TEST / "std" / "old_orig.tif"
    std.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(orig, std)
    outside = Path(config.DATA_ROOT).parent / "02. 데이터_밖_시험.tif"            # 플랫폼 밖(보관 자산 모양) — 지우면 안 된다
    rec = S.ensure("upload", "ru_pytest_std01", orig, tenant="namwon", std_path=std)
    rec2 = S.ensure("upload", "ru_pytest_std02", outside, tenant="namwon", std_path=std)
    box["rec"] += [rec["id"], rec2["id"]]
    assert rec["orig_owned"] is True and rec2["orig_owned"] is False
    long_ago = dt.datetime.now(S.KST) - dt.timedelta(days=91)
    S.update(rec["id"], state="ready", confirmed_at=long_ago, orig_delete_on=S.delete_on(long_ago, 90))
    S.update(rec2["id"], state="ready", confirmed_at=long_ago, orig_delete_on=S.delete_on(long_ago, 90), orig_owned=True)
    assert S.delete_on(dt.datetime(2026, 10, 1, 10, tzinfo=S.KST), 90) == dt.date(2026, 12, 30)
    dry = S.purge(dry_run=True)
    mine = {i["id"]: i for i in dry["items"] if i["id"] in (rec["id"], rec2["id"])}
    assert dry["dry_run"] and mine[rec["id"]]["skip"] is None and orig.exists()            # 보기만 — 그대로
    assert mine[rec2["id"]]["skip"] == "플랫폼이 받은 원본이 아님"
    real = S.purge(dry_run=False)
    assert not orig.exists() and std.exists()                                          # 원본만 지움 · 표준본은 남음
    assert any(i["id"] == rec["id"] and i["skip"] is None for i in real["items"])
    c = pg()
    a = c.execute("SELECT after FROM audit_log WHERE action='imagery.original.delete' AND subject=%s", (rec["id"],)).fetchone()
    assert a and a[0]["keep_days"] == 90
    assert c.execute("SELECT orig_deleted_at FROM imagery_std WHERE id=%s", (rec["id"],)).fetchone()[0] is not None
    assert c.execute("SELECT orig_deleted_at FROM imagery_std WHERE id=%s", (rec2["id"],)).fetchone()[0] is None
    c.close()


# ── 실서버: 받는 형식 · 의뢰 흐름(작은 파일 = 바로 표준) ─────────────────────────────────
@pytest.fixture(scope="module")
def nw(live):
    return login_tenant("namwon")


def test_formats_endpoint(nw, tok):
    g = httpx.get(B + "/requests/uploads/formats", headers=H(nw), timeout=30).json()
    assert "ecw" in g["raster"] and isinstance(g["unavailable"], dict) and g["limit"]["size"] > 0
    lx = httpx.get(B + "/imagery/std/formats", headers=H(tok["admin"]), timeout=30).json()
    assert lx["raster"] == g["raster"]
    o = httpx.get(B + "/imagery/std/originals", headers=H(tok["admin"]), timeout=30)
    assert o.status_code == 200 and o.json()["keep_days"]["value"] == 90
    assert httpx.get(B + "/imagery/std/originals", headers=H(nw), timeout=30).status_code == 403


def test_upload_read_then_standard(nw, tok, box, tmp_path):
    """기관이 올린 영상 → 읽기 → 바로 표준본(작은 파일은 게이트웨이에서) → 기록: 원본 지울 날짜 = 오늘 + 90 · 표준본이 더 작다.
    LX 쪽 판단 근거에만 '표준본' · '원본 지울 날짜'. 묶음을 지우면 표준본도 지운다."""
    from test_impl2_request import upload
    f = chip(tmp_path / "덕과_표준_2025.tif", 2048, dx=0.004)
    u = upload(nw, f)
    assert u.status_code == 200, u.text
    did, uid = u.json()["draft_id"], u.json()["id"]
    box["draft"].append(did)
    rd = httpx.post(B + f"/requests/drafts/{did}/read", headers=H(nw), timeout=120).json()
    assert rd["ok"] is True
    rec = None
    for _ in range(60):
        rec = S.get(source=("upload", uid))
        if rec and rec["state"] not in ("queued", "converting"):
            break
        time.sleep(0.5)
    assert rec and rec["state"] == "ready" and rec["rule"] == "jpeg", rec
    assert rec["orig_owned"] is True and rec["std_size"] < rec["orig_size"]
    assert rec["orig_delete_on"] == (rec["confirmed_at"].astimezone(S.KST).date() + dt.timedelta(days=90))
    assert S.absolute(rec["std_path"]).exists()
    d = httpx.delete(B + f"/requests/drafts/{did}", headers=H(nw), timeout=30)
    assert d.status_code == 200
    assert S.get(source=("upload", uid))["state"] == "removed" and not S.absolute(rec["std_path"]).exists()


def test_bad_file_named_tif_is_refused_on_read(nw, box, tmp_path):
    """영상이 아닌 파일(이름만 .tif) — 쉬운 말 한 줄(전문 용어 없이). 화면은 고르는 순간 먼저 막는다(kit/dropzone.js)."""
    from test_impl2_request import upload
    bad = tmp_path / "항공영상_가짜.tif"
    bad.write_bytes(b"not an image " * 200)
    u = upload(nw, bad)
    assert u.status_code == 200
    box["draft"].append(u.json()["draft_id"])
    rd = httpx.post(B + f"/requests/drafts/{u.json()['draft_id']}/read", headers=H(nw), timeout=60).json()
    assert rd["ok"] is False and rd["code"] == "unreadable" and "TIF" not in rd["why"] and "좌표" not in rd["why"]


# ── LX 데이터 올리기(영상 등록) — ECW 도 표준본으로 · 지도 · 분석은 표준본을 읽는다 ─────────────────────
def test_lx_register_ecw_goes_standard(live, tok):
    """LX 직원 영상 등록(서버 경로) — ECW(수원 망포1지구 드론 · 사본을 02. 데이터/cog/uploads 에) → 영상 등록 작업(CPU)이 메타를 읽고 표준본을 만든다.
    영상 행은 표준본을 가리키고(원본 경로는 따로 남김), 플랫폼이 받은 원본이라 원본 지울 날짜(확인 + 90일)가 붙는다. 끝나면 모두 지운다."""
    import uuid
    src = Path("E:/재조사/1. 드론영상/수원_망포1지구.ecw")
    if not src.exists() or S.tool_for("ecw") is None:
        pytest.skip("ECW 실물 또는 ECW 를 읽는 GDAL 이 없음")
    cp = config.DATA_ROOT / "cog" / "uploads" / f"pytest-{uuid.uuid4().hex[:6]}.ecw"
    cp.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(src, cp)
    st = H(tok["admin"])                                       # 서버 경로 등록 = LX 관리자 도구(impl-4 fixes)
    iid = None
    try:
        r = httpx.post(B + "/catalog/imagery", headers=st, json={"path": str(cp), "region": "41117", "year": 2025, "gsd": 0.025, "kind": "drone",
                                                               "test": True}, timeout=60)
        assert r.status_code == 201, r.text
        iid, jid = r.json()["id"], r.json()["job"]["id"]
        s = {}
        for _ in range(300):
            s = httpx.get(B + f"/jobs/{jid}", headers=st, timeout=20).json()
            if s["state"] in ("done", "failed"):
                break
            time.sleep(1)
        assert s["state"] == "done", s.get("error")
        c = pg()
        path, layer, crs, gsd = c.execute("SELECT path_internal, layer, crs, gsd_m FROM imagery WHERE id=%s", (iid,)).fetchone()
        rec = S.get(source=("imagery", iid))
        assert rec["state"] == "ready" and rec["rule"] == "jpeg" and rec["orig_owned"] is True and rec["orig_delete_on"]
        assert path == rec["std_path"] and layer["cog_path"] == rec["std_path"] and layer["orig_path"].endswith(cp.name)
        assert crs == "EPSG:5186" and abs(float(gsd) - 0.02484) < 1e-4                         # ECW 를 서버가 읽었다(실측이 이김)
        with rasterio.open(S.absolute(rec["std_path"])) as d:
            assert d.tags(ns="IMAGE_STRUCTURE").get("LAYOUT") == "COG" and rasterio.enums.MaskFlags.per_dataset in d.mask_flag_enums[0]   # 흰 테두리는 마스크
        c.close()
    finally:
        c = pg()
        if iid:
            for (sp, op) in c.execute("SELECT std_path, orig_path FROM imagery_std WHERE source_kind='imagery' AND source_id=%s", (iid,)).fetchall():
                if sp and sp != op:
                    S.absolute(sp).unlink(missing_ok=True)
            c.execute("DELETE FROM imagery_std WHERE source_kind='imagery' AND source_id=%s", (iid,))
            c.execute("DELETE FROM index_results WHERE job_id IN (SELECT id FROM jobs WHERE imagery_id=%s)", (iid,))
            c.execute("DELETE FROM jobs WHERE imagery_id=%s", (iid,))
            c.execute("DELETE FROM imagery WHERE id=%s", (iid,))
        c.close()
        cp.unlink(missing_ok=True)
