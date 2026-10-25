"""10-25 원칙 340 — 영상의 빈 곳(알파 · nodata · 흰/검은 채움)은 표준본 · 분석 · 결과 · 카드 그림 어디에도 넣지 않는다.

DB · 게이트웨이 없이 도는 단위 시험(합성 영상).
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
rasterio = pytest.importorskip("rasterio")
from rasterio.transform import from_origin  # noqa: E402

from landxi_api import imagery_std as S  # noqa: E402
from landxi_api import valid_area as VA  # noqa: E402

N = 1024
TR = from_origin(200000, 300000, 0.25, 0.25)        # EPSG:5186 · 25 cm


def _scene(seed=1):
    y, x = np.mgrid[0:N, 0:N]
    base = 60 + 60 * (np.sin(x / 37.0 + seed) + np.cos(y / 53.0)) / 2 + 40
    return np.stack([base, base * 0.9 + 10, base * 0.8 + 20]).astype(np.uint8)   # 부드러운 장면(JPEG 화질 확인을 통과하게)


def _write(p: Path, arr, colorinterp=None):
    with rasterio.open(str(p), "w", driver="GTiff", width=N, height=N, count=arr.shape[0], dtype="uint8", crs="EPSG:5186", transform=TR,
                       tiled=True, blockxsize=256, blockysize=256) as d:
        d.write(arr)
        if colorinterp:
            d.colorinterp = colorinterp
    return p


def test_band4_lossy_alpha_is_alpha_and_dropped(tmp_path):
    from rasterio.enums import ColorInterp as CI
    a = _scene()
    alpha = np.full((N, N), 254, np.uint8)
    alpha[:, :300] = 1                                  # ECW 처럼 번진 알파(0 → 1 · 255 → 254)
    alpha[:, 300:302] = 3
    a[:, :, :300] = 0
    src = _write(tmp_path / "a.tif", np.concatenate([a, alpha[None]]), [CI.undefined] * 4)
    info = S.inspect(src)
    assert S.band4_kind(info)["kind"] == "alpha"
    rule = S.plan(info)
    assert rule["mask"] == "alpha" and "extra_band" not in rule
    out = S.standardize(src, tmp_path / "std" / "a.tif", info=info)
    assert out["checks"]["pass"]
    with rasterio.open(out["std_path"]) as d:
        assert d.count == 3                              # 넷째 밴드 없음
        m = d.dataset_mask()
    assert (m[:, :290] == 0).all() and (m[:, 320:] > 0).all()
    assert not S.band4_path(out["std_path"]).exists()


def test_band4_nir_kept_as_side_file(tmp_path):
    from rasterio.enums import ColorInterp as CI
    a = _scene()
    nir = np.random.default_rng(3).integers(30, 220, size=(1, N, N), dtype=np.uint8)
    src = _write(tmp_path / "n.tif", np.concatenate([a, nir]), [CI.undefined] * 4)
    info = S.inspect(src)
    assert S.band4_kind(info)["kind"] == "value"
    assert S.plan(info).get("extra_band") == 4            # 근적외선은 버리지 않는다


def test_white_fill_not_in_mask_becomes_mask(tmp_path):
    a = _scene()
    a[:, :, 700:] = 255                                   # 가장자리에 이어진 흰 채움(마스크 없음)
    src = _write(tmp_path / "w.tif", a)
    out = S.standardize(src, tmp_path / "std" / "w.tif")
    with rasterio.open(out["std_path"]) as d:
        m = d.dataset_mask()
    assert (m[:, 760:] == 0).all() and (m[:, :650] > 0).all()


def test_fill_of_rules():
    m = np.ones((200, 200), bool)
    white = np.zeros_like(m)
    gray = np.full((200, 200), 120, np.uint8)
    white[:, 180:] = True                                 # 가장자리 흰 채움 → 빈 곳
    white[80:120, 80:120] = True                          # 안쪽 작은 흰 지붕(40×40 칸 · 칸 1 m² → 1600 m² < 5000) → 그대로
    gray[white] = 250
    f = VA.fill_of(m, white, np.zeros_like(m), gray, 1.0)
    assert f[:, 185:].all() and not f[90:110, 90:110].any()
    textured = gray.copy()
    textured[:, 180:] = np.where(np.arange(20) % 2, 243, 255)[None, :]   # 무늬 있는 흰 덩어리(비닐하우스 골) → 그대로
    f2 = VA.fill_of(m, white, np.zeros_like(m), textured, 1.0)
    assert not f2[:, 185:].any()


def test_window_valid_and_mask_chip():
    from rasterio.io import MemoryFile
    from rasterio.windows import Window
    a = _scene()
    a[:, :, :512] = 0
    with MemoryFile() as mf:
        with mf.open(driver="GTiff", width=N, height=N, count=3, dtype="uint8", crs="EPSG:5186", transform=TR) as d:
            d.write(a)
        with mf.open() as d:
            win = Window(256, 0, 512, 512)
            arr = d.read([1, 2, 3], window=win)
            ok = VA.window_valid(d, win, arr)
    assert abs(ok.mean() - 0.5) < 0.01
    out, frac = VA.mask_chip(arr, ok)
    assert abs(frac - 0.5) < 0.01 and out[:, ~ok].min() > 30   # 빈 곳은 평균 색(검정 아님)


def test_tiling_skips_mostly_invalid_cells():
    from shapely.geometry import box
    from workers.tiling import shards
    meta = {"width": 4096, "height": 1024, "transform": TR, "crs": 5186}
    valid = box(200000, 300000 - 256, 200000 + 512 * 0.25 + 30, 300000)   # 왼쪽 칸 하나 + 다음 칸 조금(10% 미만)
    _g, sh = shards(meta, None, chip=1024, overlap=0, footprint_src=[valid])
    assert [s["shard_id"] for s in sh] == ["r000c000"]


def test_clip_feats_drop_and_clip():
    from shapely.geometry import box
    valid = box(127.0, 35.0, 127.001, 35.001)
    feats = [{"geom": box(127.0002, 35.0002, 127.0004, 35.0004), "props": {"id": 1}},       # 안
             {"geom": box(127.0009, 35.0002, 127.0013, 35.0004), "props": {"id": 2}},       # 1/4 만 안 → 뺌
             {"geom": box(127.0007, 35.0002, 127.0011, 35.0004), "props": {"id": 3}}]       # 3/4 안 → 자름
    out, st = VA.clip_feats(feats, valid, 5186)
    assert [f["props"]["id"] for f in out] == [1, 3] and st["dropped"] == 1 and st["clipped"] == 1
    assert out[1]["geom"].bounds[2] <= 127.001 + 1e-9
    out2, st2 = VA.clip_feats(feats, valid, 5186, clip=False)
    assert st2["clipped"] == 0 and len(out2) == 2


def test_window_valid_many_threads_no_crash(tmp_path):
    """10-25 a6000-0 GEOS 충돌 재발 막기 — 칩 읽기 스레드 여럿이 같은 유효 범위로 동시에(준비된 도형을 스레드끼리 나누지 않음).
    충돌은 프로세스를 죽이므로 따로 띄운 파이썬에서 돌려 종료 코드를 본다."""
    import subprocess
    code = r'''
import sys, numpy as np, rasterio
sys.path.insert(0, r"%s")
from concurrent.futures import ThreadPoolExecutor
from rasterio.transform import from_origin
from rasterio.windows import Window
from shapely.geometry import Polygon
from pyproj import Transformer
from landxi_api import valid_area as VA
p = r"%s"
N = 4096
tr = from_origin(200000, 300000, 0.25, 0.25)
a = np.full((3, N, N), 120, np.uint8)
with rasterio.open(p, "w", driver="GTiff", width=N, height=N, count=3, dtype="uint8", crs="EPSG:5186", transform=tr, tiled=True) as d:
    d.write(a)
T = Transformer.from_crs(5186, 4326, always_xy=True).transform
ring = [T(200000 + 512 * np.cos(t) * 1.6 + 512, 300000 - 512 + 512 * np.sin(t) * 1.6) for t in np.linspace(0, 6.28, 400)]
vg = Polygon(ring)
def one(k):
    with rasterio.open(p) as ds:
        x, y = (k * 97) %% (N - 512), (k * 53) %% (N - 512)
        win = Window(x, y, 512, 512)
        arr = ds.read([1, 2, 3], window=win)
        return float(VA.window_valid(ds, win, arr, vg, 5186).mean())
with ThreadPoolExecutor(16) as ex:
    r = list(ex.map(one, range(800)))
print("ok", len(r))
''' % (str(Path(__file__).resolve().parents[1]), str(tmp_path / "t.tif"))
    out = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, timeout=300)
    assert out.returncode == 0 and "ok 800" in out.stdout, (out.returncode, out.stderr[-500:])
