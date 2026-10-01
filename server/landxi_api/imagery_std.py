"""영상 표준 하나로 · 용량은 가볍게(원칙 94 · 확인 대장 15차 영상-1 확인 · 영상-2 ⓐ JPEG 90 · 영상-3 ⓑ 90일).

들어오는 영상(ECW · TIF · JP2 · COG · 좌표 파일 딸린 JPG · IMG)을 표준 한 가지 = COG · JPEG 품질 90 · 축소판 포함 · 빈 칸은 마스크로 바꿔 보관한다.
값이 중요한 영상(16비트 · 실수 · 다중분광 · 1밴드 · 색표)은 같은 COG 틀에 무손실(ZSTD). 이미 표준(COG · JPEG)이면 다시 압축하지 않는다.
흐름(설계 7차 imagery-std/policy.md 1절): ① 올리기 → ② 파일에서 읽기 → ③ 표준으로 바꾸기 → ④ 확인(크기 · 범위 · 좌표 · 화질 표본) → ⑤ 원본 정리.
  - 기관 분석 의뢰: 파일을 다 받고 읽은 뒤 바로 바꾼다(작은 파일은 그 자리에서 · 큰 파일은 CPU 작업기 대기열). 분석은 표준본으로.
  - LX 영상 등록(데이터 올리기): 영상 등록 작업(kind tile · CPU)의 한 칸이 표준으로 바꾸고 지도 · 분석이 표준본을 읽게 한다.
  - 원본: 표준본을 확인한 날 + 보관 날 수(90) = '원본 지울 날짜'. CPU 작업기(cpu-0)가 하루 한 번 지우고 감사 기록(audit_log)을 남긴다.
    플랫폼이 받은 원본(02. 데이터/tenants · cog/uploads)만 지운다 — 서버 경로로 등록한 LX 보관 영상은 지우지 않는다(원칙 17).
GDAL(설정 한 곳 server/.env): GDAL_BIN(서버 기본) · LX_ECW_GDAL_BIN(ECW · JP2 를 읽는 GDAL · 기본 QGIS 3.28.3 bin).
  형식마다 읽을 수 있는 GDAL 을 고른다(서버 기본이 먼저). ECW 를 읽는 GDAL 이 없으면 ECW 는 받지 않는다 — LX 쪽에는 'ECW 변환기가 이 서버에 없습니다',
  기관에는 쉬운 말 한 줄. ECW 서버 자동 처리의 라이선스(Hexagon)는 정식 오픈 전 확인 사항(README).
GPU 0 — 변환은 CPU(한 건 CPU 4개). 큰 파일 변환은 한 번에 하나(Redis 잠금) · 디스크 여유를 먼저 본다.

GET  /imagery/std/formats          받는 형식 · 지금 받을 수 없는 형식(LX = 'ECW 변환기가 이 서버에 없습니다' · 기관 = 쉬운 말)
GET  /imagery/std/originals        LX 관리자 — 원본 지울 날짜 목록(보기만 · 지우지 않음)
"""
from __future__ import annotations

import datetime as dt
import json
import math
import os
import re
import shutil
import subprocess
import tempfile
import time
import uuid
from pathlib import Path

from . import config

DEFAULT_ECW_BIN = r"C:\Program Files\QGIS 3.28.3\bin"
_NOWIN = getattr(subprocess, "CREATE_NO_WINDOW", 0)
KST = dt.timezone(dt.timedelta(hours=9))
LOSSLESS = {"LZW", "DEFLATE", "ZSTD", "LZMA", "LERC_ZSTD", "LERC_DEFLATE", "PACKBITS", "NONE", None}


class Unreadable(Exception):
    """이 서버의 어느 GDAL 로도 열 수 없는 파일 — code: 'format_unavailable'(형식을 읽는 구성요소가 없음) | 'unreadable'(영상이 아님)."""

    def __init__(self, code: str, line: str):
        super().__init__(line)
        self.code, self.line = code, line


class Deferred(Exception):
    """지금은 바꾸지 않는다(디스크 여유 · 큰 보관 영상) — 나중에 다시."""


class QualityFail(Exception):
    """표준본이 확인 기준(크기 · 범위 · 좌표 · 화질)에 못 미침 — 원본을 그대로 쓰고(지우지 않음) LX 쪽에 한 줄."""

    def __init__(self, checks: dict):
        super().__init__("표준본 확인 기준 미달")
        self.checks = checks


# ═══ 설정 한 곳 ═════════════════════════════════════════════════════════════
def settings() -> dict:
    try:
        s = dict(config.load_yaml("imagery") or {})
    except FileNotFoundError:
        s = {}
    acc = dict(s.get("accept") or {})
    acc.setdefault("raster", ["tif", "tiff", "jpg", "jpeg", "jp2", "j2k", "ecw", "img"])
    acc.setdefault("sidecar", ["tfw", "tifw", "jgw", "jpgw", "jpw", "j2w", "wld", "eww", "prj", "aux.xml", "ovr"])
    st = dict(s.get("standard") or {})
    st.setdefault("blocksize", 512)
    st.setdefault("overview_resampling", "average")
    st["color"] = {"compress": "JPEG", "quality": 90, **(st.get("color") or {})}
    st["value"] = {"compress": "ZSTD", "level": 9, **(st.get("value") or {})}
    st.setdefault("threads", 4)
    og = {"keep_days": 90, "delete": True, "owned_roots": ["tenants", "cog/uploads"], **(s.get("original") or {})}
    ck = {"psnr_min_db": 38, "ssim_min": 0.96, "samples": 4, **(s.get("check") or {})}
    cv = {"inline_max_mb": 64, "big_gb": 2, "auto_max_gb": 50, "wait_minutes": 240, **(s.get("convert") or {})}
    return {"accept": acc, "standard": st, "original": og, "check": ck, "convert": cv}


def accept_raster() -> list[str]:
    return [str(x).lower() for x in settings()["accept"]["raster"]]


def accept_sidecar() -> list[str]:
    return [str(x).lower() for x in settings()["accept"]["sidecar"]]


def ext_of(name: str) -> str:
    n = str(name or "").lower()
    if n.endswith(".aux.xml"):
        return "aux.xml"
    return n.rsplit(".", 1)[-1] if "." in n else ""


def disk_reserve_gb() -> float:
    """서버 디스크를 지키는 선 — 올리기와 같은 한 값(config/requests.yaml disk_reserve_gb · LX 관리자 설정)."""
    try:
        return float((config.load_yaml("requests") or {}).get("disk_reserve_gb") or 200)
    except Exception:  # noqa: BLE001
        return 200.0


# ═══ GDAL 묶음 — 형식마다 읽을 수 있는 쪽을 고른다 ═══════════════════════════════════
NEED = {"ecw": ("ECW",), "jp2": ("JP2OpenJPEG", "JP2ECW", "JP2KAK", "JP2MrSID"), "j2k": ("JP2OpenJPEG", "JP2ECW", "JP2KAK", "JP2MrSID"),
        "tif": ("GTiff",), "tiff": ("GTiff",), "img": ("HFA",), "jpg": ("JPEG",), "jpeg": ("JPEG",), "vrt": ("VRT",)}
_TOOLS: dict = {"t": 0.0, "v": [], "key": None}


def _tool_dirs(bin_dir: Path) -> dict:
    """bin → GDAL 데이터 · 좌표계 · 구성요소 폴더. QGIS · OSGeo4W(root/apps/gdal/…) 와 conda(Library/…) 두 모양."""
    root = bin_dir.parent
    cands = {"GDAL_DATA": [root / "apps" / "gdal" / "share" / "gdal", root / "share" / "gdal"],
             "PROJ_LIB": [root / "share" / "proj", root / "apps" / "proj" / "share" / "proj"],
             "GDAL_DRIVER_PATH": [root / "apps" / "gdal" / "lib" / "gdalplugins", root / "lib" / "gdalplugins"]}
    out: dict[str, str] = {}
    for k, ps in cands.items():
        for p in ps:
            if p.exists():
                out[k] = str(p)
                break
    if "PROJ_LIB" in out:
        out["PROJ_DATA"] = out["PROJ_LIB"]
    return out


def tool_env(t: dict) -> dict:
    e = dict(os.environ)
    for k in ("GDAL_DRIVER_PATH", "GDAL_DATA", "PROJ_LIB", "PROJ_DATA", "CPL_TMPDIR"):
        e.pop(k, None)
    e["PATH"] = str(t["bin"]) + os.pathsep + e.get("PATH", "")
    e.update(t.get("env") or {})
    # ECW 구성요소는 기본으로 실제 메모리의 1/4 을 캐시로 잡는다(512GB 서버 = 128GB 실측) — 변환 한 건 2GB 로(설정은 GDAL 환경 값)
    e.setdefault("ECW_CACHE_MAXMEM", str(2 << 30))
    e.setdefault("GDAL_CACHEMAX", "1024")
    return e


def _ecw_bin() -> Path:
    return Path(config.get("LX_ECW_GDAL_BIN", DEFAULT_ECW_BIN) or DEFAULT_ECW_BIN)


def tools(force: bool = False) -> list[dict]:
    """이 서버의 GDAL 묶음(서버 기본 → ECW 쪽) — 판 · 읽는 형식. 10분 동안 기억한다(설정이 바뀌면 바로 다시 본다)."""
    key = (str(config.GDAL_BIN), str(_ecw_bin()))
    if not force and _TOOLS["key"] == key and time.time() - _TOOLS["t"] < 600:
        return _TOOLS["v"]
    out, seen = [], set()
    for name, b in (("server", Path(config.GDAL_BIN)), ("ecw", _ecw_bin())):
        if str(b).lower() in seen:
            continue
        seen.add(str(b).lower())
        t = {"name": name, "bin": b, "env": _tool_dirs(b), "ok": False, "drivers": set(), "version": None}
        exe = b / "gdalinfo.exe"
        if exe.exists():
            try:
                env = tool_env(t)
                v = subprocess.run([str(exe), "--version"], capture_output=True, text=True, env=env, timeout=60, creationflags=_NOWIN).stdout.strip()
                f = subprocess.run([str(exe), "--formats"], capture_output=True, text=True, env=env, timeout=60, creationflags=_NOWIN).stdout
                t["drivers"] = {m.group(1) for m in re.finditer(r"^\s*([\w\-]+)\s+-raster", f, re.M)}
                t["version"] = v.split(",")[0] if v else None
                t["ok"] = "COG" in t["drivers"]
            except Exception:  # noqa: BLE001
                pass
        out.append(t)
    _TOOLS.update(t=time.time(), v=out, key=key)
    return out


def tool_for(ext: str) -> dict | None:
    need = NEED.get(ext, ("GTiff",))
    for t in tools():
        if t["ok"] and any(d in t["drivers"] for d in need):
            return t
    return None


def exe(t: dict, name: str) -> str:
    return str(Path(t["bin"]) / (name + ".exe"))


def tool_word(t: dict | None) -> str:
    return f"{t['name']} · {t.get('version') or 'GDAL'}" if t else "rasterio"


def unavailable(lx: bool) -> dict[str, str]:
    """받는 형식 중 지금 이 서버가 바꿀 수 없는 것 → 한 줄(LX = 무엇이 없는지 · 기관 = 쉬운 말과 다음 할 일)."""
    out = {}
    for e in accept_raster():
        if tool_for(e) is None:
            out[e] = f"{e.upper()} 변환기가 이 서버에 없습니다" if lx else "지금은 이 파일을 받을 수 없습니다 — TIF 로 저장해 올려 주세요"
    return out


def _decode(b: bytes | None) -> str:
    """GDAL 명령의 출력 — UTF-8 이 아니면(옛 판은 콘솔 코드 페이지로 내보낸다 · '°' 등) 이 PC 의 코드 페이지로."""
    if not b:
        return ""
    try:
        return b.decode("utf-8")
    except UnicodeDecodeError:
        for enc in ("cp949", "mbcs", "latin-1"):
            try:
                return b.decode(enc)
            except (UnicodeDecodeError, LookupError):
                continue
    return b.decode("utf-8", errors="replace")


def run(t: dict, name: str, args: list, timeout: float = 6 * 3600) -> subprocess.CompletedProcess:
    p = subprocess.run([exe(t, name), *map(str, args)], capture_output=True, env=tool_env(t), timeout=timeout, creationflags=_NOWIN)
    p.stdout, p.stderr = _decode(p.stdout), _decode(p.stderr)
    if p.returncode != 0:
        raise RuntimeError(f"{name} {p.returncode}: {(p.stderr or '')[-400:]}")
    return p


# ═══ 파일에서 읽기 ═══════════════════════════════════════════════════════════
_KTM = {(600000, 125): 5185, (600000, 127): 5186, (600000, 129): 5187, (600000, 131): 5188,
        (500000, 125): 5180, (500000, 127): 5181, (550000, 127): 5182, (500000, 129): 5183, (500000, 131): 5184}


def _korea_epsg(wkt: str | None) -> int | None:
    """이름만 다른 국내 좌표계 → 표준 번호(설계 formats.md 1절 — 'KOREA TM_M_WGS84' · NAD83 이름의 중부원점 등).
    원점 · 가산 값 · 축척 · 타원체(GRS80 · WGS84 — 둘은 이 용도에서 같다)를 읽어 맞춘다. 베셀 타원체는 번호를 붙이지 않는다(다시 그려야 함)."""
    if not wkt:
        return None
    try:
        from pyproj import CRS
        import warnings
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            d = {k.lstrip("+"): v for k, _, v in (x.partition("=") for x in CRS.from_wkt(wkt).to_proj4().split())}
    except Exception:  # noqa: BLE001
        return None
    if d.get("proj") != "tmerc" or d.get("units", "m") != "m":
        return None
    ell = d.get("ellps") or {"WGS84": "WGS84", "NAD83": "GRS80"}.get(d.get("datum", ""), "")
    if ell not in ("GRS80", "WGS84"):
        return None
    f = lambda k, dv=0.0: float(d.get(k, dv))  # noqa: E731
    try:
        if abs(f("lat_0") - 38) > 1e-9:
            return None
        if abs(f("lon_0") - 127.5) < 1e-9 and abs(f("k", 1) - 0.9996) < 1e-9 and f("x_0") == 1000000 and f("y_0") == 2000000:
            return 5179
        if abs(f("k", 1) - 1) < 1e-9 and f("x_0") == 200000:
            return _KTM.get((int(f("y_0")), int(round(f("lon_0")))))
    except (TypeError, ValueError):
        return None
    return None


def _epsg_of(crs_wkt: str | None, rio_crs=None) -> int | None:
    try:
        if rio_crs is not None:
            return rio_crs.to_epsg() or rio_crs.to_epsg(confidence_threshold=40) or _korea_epsg(rio_crs.to_wkt())
        if crs_wkt:
            from pyproj import CRS
            c = CRS.from_wkt(crs_wkt)
            n = c.to_epsg() or c.to_epsg(min_confidence=40)
            if n:
                return n
            m = re.search(r'ID\["EPSG",\s*(\d+)\]\]\s*$', crs_wkt.strip())   # 다른 판 GDAL 의 WKT2 — 끝의 번호(파일이 적어 둔 표준 번호)
            return int(m.group(1)) if m else _korea_epsg(crs_wkt)
    except Exception:  # noqa: BLE001
        return None
    return None


def _inspect_rio(p: Path) -> dict:
    import warnings
    import rasterio
    from rasterio.enums import ColorInterp, MaskFlags
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        ds = rasterio.open(str(p))
    with ds:
        tags: dict = {}
        for ns in (None, "EXIF"):
            try:
                tags.update(ds.tags(ns=ns) if ns else ds.tags())
            except Exception:  # noqa: BLE001
                pass
        try:
            ist = ds.tags(ns="IMAGE_STRUCTURE")
        except Exception:  # noqa: BLE001
            ist = {}
        try:
            ovr = len(ds.overviews(1))
        except Exception:  # noqa: BLE001
            ovr = 0
        flags = ds.mask_flag_enums[0] if ds.count else []
        mask = "alpha" if MaskFlags.alpha in flags else "nodata" if MaskFlags.nodata in flags else \
            "per_dataset" if (MaskFlags.per_dataset in flags and MaskFlags.all_valid not in flags) else None
        try:
            pal = bool(ds.colormap(1))
        except Exception:  # noqa: BLE001
            pal = False
        ci = [c.name for c in ds.colorinterp]
        nod = ds.nodatavals[0] if ds.nodatavals and all(v == ds.nodatavals[0] for v in ds.nodatavals) else None
        return {"path": str(p), "reader": "rasterio", "driver": ds.driver, "w": ds.width, "h": ds.height, "count": ds.count,
                "dtypes": list(ds.dtypes), "colorinterp": ci, "nodata": nod, "palette": pal, "mask": mask,
                "alpha_band": (ci.index(ColorInterp.alpha.name) + 1) if ColorInterp.alpha.name in ci else None,
                "compression": ist.get("COMPRESSION"), "layout": ist.get("LAYOUT"), "jpeg_quality": ist.get("JPEG_QUALITY"),
                "transform": list(ds.transform.to_gdal()), "crs_wkt": ds.crs.to_wkt() if ds.crs else None,
                "epsg": _epsg_of(None, ds.crs) if ds.crs else None, "overviews": ovr, "tags": tags, "size": _size(p)}


_GDT = {"Byte": "uint8", "UInt16": "uint16", "Int16": "int16", "UInt32": "uint32", "Int32": "int32", "Float32": "float32", "Float64": "float64",
        "Int8": "int8", "UInt64": "uint64", "Int64": "int64"}


def _inspect_cli(p: Path, t: dict) -> dict:
    out = run(t, "gdalinfo", ["-json", str(p)], timeout=300).stdout
    j = json.loads(out)
    bands = j.get("bands") or []
    md = j.get("metadata") or {}
    ist = md.get("IMAGE_STRUCTURE") or {}
    tags = dict(md.get("") or {})
    ci = [str(b.get("colorInterpretation") or "Undefined").lower() for b in bands]
    nods = [b.get("noDataValue") for b in bands]
    flags = [str(f).upper() for f in ((bands[0].get("mask") or {}).get("flags") or [])] if bands else []
    mask = "alpha" if "ALPHA" in flags else "nodata" if "NODATA" in flags else "per_dataset" if ("PER_DATASET" in flags and "ALL_VALID" not in flags) else None
    gt = j.get("geoTransform") or [0, 1, 0, 0, 0, 1]
    wkt = (j.get("coordinateSystem") or {}).get("wkt") or None
    return {"path": str(p), "reader": "cli", "tool": t["name"], "driver": j.get("driverShortName"), "w": j["size"][0], "h": j["size"][1],
            "count": len(bands), "dtypes": [_GDT.get(b.get("type"), str(b.get("type")).lower()) for b in bands], "colorinterp": ci,
            "nodata": nods[0] if nods and all(v == nods[0] for v in nods) else None, "palette": any(b.get("colorTable") for b in bands),
            "mask": mask, "alpha_band": (ci.index("alpha") + 1) if "alpha" in ci else None,
            "compression": ist.get("COMPRESSION"), "layout": ist.get("LAYOUT"), "jpeg_quality": ist.get("JPEG_QUALITY"),
            "transform": list(gt), "crs_wkt": wkt, "epsg": _epsg_of(wkt), "overviews": len((bands[0].get("overviews") or [])) if bands else 0,
            "tags": tags, "size": _size(p)}


def _size(p: Path) -> int | None:
    try:
        return p.stat().st_size
    except OSError:
        return None


def inspect(path) -> dict:
    """원본에서 읽은 값 — 서버 파이썬(rasterio) 먼저, 못 열면 그 형식을 읽는 GDAL 명령(gdalinfo -json)."""
    p = Path(path)
    try:
        return _inspect_rio(p)
    except Exception:  # noqa: BLE001
        pass
    e = ext_of(p.name)
    t = tool_for(e)
    if t is None:
        if e in NEED and e not in ("tif", "tiff", "jpg", "jpeg", "img", "vrt"):
            raise Unreadable("format_unavailable", f"{e.upper()} 변환기가 이 서버에 없습니다")
        raise Unreadable("unreadable", "영상으로 읽을 수 없는 파일입니다")
    try:
        return _inspect_cli(p, t)
    except Exception as x:  # noqa: BLE001
        raise Unreadable("unreadable", "영상으로 읽을 수 없는 파일입니다") from x


def small(info: dict, max_side: int = 1024, bands: list[int] | None = None):
    """작게 읽기(평균) → (배열 bands×h×w, 마스크 h×w uint8). 미리 보기 · 테두리 빈 칸 찾기 · 투명 밴드 판정이 쓴다."""
    import numpy as np
    W, H = info["w"], info["h"]
    k = max(W, H) / max_side
    sw, sh = (max(1, round(W / k)), max(1, round(H / k))) if k > 1 else (W, H)
    bands = bands or ([1, 2, 3] if info["count"] >= 3 else [1, 1, 1])
    if info["reader"] == "rasterio":
        import warnings
        import rasterio
        from rasterio.enums import Resampling
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            with rasterio.open(info["path"]) as ds:
                arr = ds.read(bands, out_shape=(len(bands), sh, sw), resampling=Resampling.average)
                try:
                    m = ds.dataset_mask(out_shape=(sh, sw))
                except Exception:  # noqa: BLE001
                    m = np.full((sh, sw), 255, dtype="uint8")
        return arr, m
    t = tool_for(ext_of(info["path"]))
    with tempfile.TemporaryDirectory(prefix="lxstd-") as td:
        out = Path(td) / "s.tif"
        args = ["-q", "-outsize", sw, sh, "-r", "average", "-of", "GTiff"]
        for b in bands:
            args += ["-b", b]
        run(t, "gdal_translate", [*args, info["path"], str(out)], timeout=1800)
        import rasterio
        with rasterio.open(str(out)) as ds:
            arr = ds.read()
    m = np.full((sh, sw), 255, dtype="uint8")
    return arr, m


# ═══ 규칙 — 어떤 표준으로 ═══════════════════════════════════════════════════════
def _is_color(info: dict) -> bool:
    return set(info["dtypes"]) == {"uint8"} and not info.get("palette")


def _guess_alpha(info: dict) -> bool:
    """색 이름이 없는 8비트 4밴드(ECW MULTIBAND 등) — 넷째 밴드가 거의 0 · 255 뿐이면 투명 칸."""
    import numpy as np
    try:
        arr, _ = small(info, 512, [4])
    except Exception:  # noqa: BLE001
        return False
    v = arr[0]
    return bool(v.size) and float(np.isin(v, (0, 255)).mean()) >= 0.98


def _collar(info: dict, s: dict):
    """테두리 빈 칸(가장자리에 이어진 흰색 · 검은색) — 작게 읽어 가장자리부터 이어진 칸만 찾는다(같은 색의 실제 물체 — 흰 비닐하우스 · 지붕 — 는
    가장자리와 이어져 있지 않으면 건드리지 않는다). 경계 한 칸은 유효로 둔다(보수적). → (작은 마스크 uint8 · 비율) | None."""
    arr, m = small(info, 4096)
    return collar_of(arr, m)


def collar_of(arr, m=None, min_frac: float = 0.005):
    """작은 색 배열(3×h×w · uint8) → (테두리 빈 칸 마스크 uint8 0/255 · 비율) | None. 가장자리와 이어진 흰색 · 검은색만."""
    import numpy as np
    from scipy import ndimage
    a = arr[:3]
    if a.dtype != np.uint8:
        return None
    cand = np.all(a >= 250, axis=0) | np.all(a <= 5, axis=0)
    if m is not None:
        cand &= (m > 0)
    border = np.concatenate([cand[0], cand[-1], cand[:, 0], cand[:, -1]])
    if not border.any():
        return None
    lab, _ = ndimage.label(cand)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]).tolist())) - {0}
    col = np.isin(lab, sorted(edge))
    col = ndimage.binary_erosion(col, iterations=1, border_value=1)
    frac = float(col.mean())
    if frac < min_frac:
        return None
    return np.where(col, 0, 255).astype("uint8"), frac


def plan(info: dict, s: dict | None = None) -> dict:
    """원본 → 표준 규칙: as_is(이미 표준) | jpeg(8비트 색 · JPEG 90) | lossless(값이 중요한 영상 · ZSTD). mask: alpha | nodata | keep | collar | None."""
    s = s or settings()
    n = info["count"]
    color = _is_color(info)
    if color and n == 4 and not info.get("alpha_band") and set(info["colorinterp"][:4]) <= {"undefined", "gray", "red", "green", "blue"}:
        if _guess_alpha(info):
            info["alpha_band"] = 4
    jpeg = color and (n == 3 or (n == 4 and info.get("alpha_band") == 4))
    comp = str(info.get("compression") or "").upper() or None
    cog = str(info.get("layout") or "").upper() == "COG"
    if jpeg:
        if cog and comp and "JPEG" in comp:
            return {"rule": "as_is", "why": "이미 COG · JPEG — 다시 압축하지 않음"}
        mask = "alpha" if n == 4 else "nodata" if info.get("nodata") is not None else "keep" if info.get("mask") == "per_dataset" else "collar"
        return {"rule": "jpeg", "bands": [1, 2, 3], "mask": mask}
    if cog and comp in LOSSLESS and comp not in (None, "NONE"):
        return {"rule": "as_is", "why": "이미 COG · 무손실"}
    return {"rule": "lossless", "bands": list(range(1, n + 1)), "mask": None, "palette": bool(info.get("palette"))}


# ═══ 바꾸기 ═══════════════════════════════════════════════════════════════
def _cog_args(rule: dict, s: dict) -> list:
    st = s["standard"]
    th = int(st["threads"])
    a = ["-of", "COG", "-co", f"BLOCKSIZE={int(st['blocksize'])}", "-co", f"OVERVIEW_RESAMPLING={str(st['overview_resampling']).upper()}",
         "-co", f"NUM_THREADS={th}", "-co", "BIGTIFF=IF_SAFER", "--config", "GDAL_NUM_THREADS", str(th), "--config", "GDAL_CACHEMAX", "1024"]
    if rule["rule"] == "jpeg":
        c = st["color"]
        a += ["-co", f"COMPRESS={str(c['compress']).upper()}", "-co", f"QUALITY={int(c['quality'])}"]
    else:
        v = st["value"]
        a += ["-co", f"COMPRESS={str(v['compress']).upper()}", "-co", f"LEVEL={int(v['level'])}"]
        if not rule.get("palette"):
            a += ["-co", "PREDICTOR=YES"]
    return a


def _write_mask_tif(path: Path, arr) -> None:
    import rasterio
    import warnings
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        with rasterio.open(str(path), "w", driver="GTiff", width=arr.shape[1], height=arr.shape[0], count=1, dtype="uint8", compress="deflate",
                           tiled=True, blockxsize=512, blockysize=512, BIGTIFF="IF_SAFER") as d:
            d.write(arr, 1)


def _nodata_mask_full(info: dict, out: Path) -> None:
    """빈 값 표시(nodata) → 마스크(모든 밴드가 빈 값일 때만 빈 칸 — 한 밴드만 0 인 실제 화소는 살린다). 512줄씩."""
    import warnings
    import rasterio
    from rasterio.windows import Window
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        with rasterio.open(info["path"]) as s, rasterio.open(str(out), "w", driver="GTiff", width=s.width, height=s.height, count=1, dtype="uint8",
                                                             compress="deflate", tiled=True, blockxsize=512, blockysize=512, BIGTIFF="IF_SAFER") as d:
            for y in range(0, s.height, 512):
                w = Window(0, y, s.width, min(512, s.height - y))
                d.write(s.dataset_mask(window=w), 1, window=w)
            d.update_tags(**{f"INTERNAL_MASK_FLAGS_{b}": "2" for b in (1, 2, 3)})   # GDAL 바깥 마스크 파일(.msk) 표시 — 데이터셋 하나의 마스크


def _assign_srs(info: dict, epsg: int | None) -> tuple[str | None, int | None]:
    """좌표계는 번호만 정리하고 다시 그리지 않는다(설계 policy.md 2절) — 기록이 없으면 받은 번호(위치로 가려낸 것), 이름만 다른 같은 좌표계는 표준 번호."""
    from pyproj import CRS
    if epsg and not info.get("epsg"):                    # 기록이 없거나 알아보지 못한 좌표계 — 읽기 단계가 위치로 가려낸 번호(화면의 '위치로 확인')
        return CRS.from_epsg(int(epsg)).to_wkt(), int(epsg)
    if info.get("crs_wkt") and info.get("epsg"):
        return CRS.from_epsg(int(info["epsg"])).to_wkt(), int(info["epsg"])
    return info.get("crs_wkt"), info.get("epsg")


def _estimate(info: dict, rule: dict) -> int:
    bpp = {"uint8": 1, "int8": 1, "uint16": 2, "int16": 2, "float32": 4, "uint32": 4, "int32": 4, "float64": 8}
    raw = info["w"] * info["h"] * sum(bpp.get(d, 2) for d in info["dtypes"][: len(rule.get("bands") or info["dtypes"])])
    return int(raw * (0.25 if rule["rule"] == "jpeg" else 1.1))


def convert(info: dict, dst: Path, rule: dict, *, epsg: int | None = None, s: dict | None = None, work: Path | None = None) -> dict:
    """원본 → 표준본(dst). 쓰는 동안은 dst.part — 다 쓰고 확인한 뒤에 이름을 바꾼다."""
    s = s or settings()
    e = ext_of(info["path"])
    t = tool_for(e)
    if t is None:
        raise Unreadable("format_unavailable", f"{e.upper()} 변환기가 이 서버에 없습니다")
    dst.parent.mkdir(parents=True, exist_ok=True)
    work = work or dst.parent
    part = dst.with_name(dst.name + ".part.tif")
    tmp: list[Path] = []
    srs_wkt, out_epsg = _assign_srs(info, epsg)
    src = info["path"]
    args = _cog_args(rule, s)
    mask_frac = None
    try:
        if rule["rule"] == "jpeg":
            mk = rule.get("mask")
            small_mask = None
            if mk == "collar":
                c = _collar(info, s)
                if c is not None:
                    small_mask, mask_frac = c
            if small_mask is not None or (mk == "nodata" and info["reader"] == "rasterio"):
                # 빈 칸 마스크를 붙여야 할 때 — 두 걸음(실측: 가상 파일로 마스크를 얹으면 2~4배 느리고, 큰 ECW 는 한 코어로 수십 분):
                # ① 원본 → 임시 GeoTIFF(타일 · 빠른 무손실 압축 · 그 형식을 읽는 GDAL) ② 임시 파일 옆에 마스크(.msk) ③ 임시 → 표준본(마스크 그대로)
                tmp_tif = work / (dst.stem + ".tmp.tif")
                msk = Path(str(tmp_tif) + ".msk")
                tmp += [tmp_tif, msk]
                pre = ["-q", "-of", "GTiff", "-b", 1, "-b", 2, "-b", 3, "-a_nodata", "none", "-co", "TILED=YES", "-co", "BLOCKXSIZE=512",
                       "-co", "BLOCKYSIZE=512", "-co", "BIGTIFF=YES", "-co", "COMPRESS=ZSTD", "-co", "ZSTD_LEVEL=1", "-co", "NUM_THREADS=4",
                       "--config", "GDAL_NUM_THREADS", "4"]
                if out_epsg:
                    pre += ["-a_srs", f"EPSG:{out_epsg}"]
                run(t, "gdal_translate", [*pre, src, str(tmp_tif)])
                if small_mask is not None:
                    sm = work / (dst.stem + ".mask_small.tif")
                    tmp.append(sm)
                    _write_mask_tif(sm, small_mask)
                    run(tool_for("tif"), "gdal_translate", ["-q", "-outsize", info["w"], info["h"], "-r", "nearest", "-of", "GTiff", "-co", "TILED=YES",
                                                         "-co", "COMPRESS=DEFLATE", "-co", "BIGTIFF=IF_SAFER",
                                                         *sum((["-mo", f"INTERNAL_MASK_FLAGS_{b}=2"] for b in (1, 2, 3)), []), str(sm), str(msk)])
                else:
                    _nodata_mask_full(info, msk)
                run(tool_for("tif"), "gdal_translate", [*args, str(tmp_tif), str(part)])
            else:
                extra = ["-b", 1, "-b", 2, "-b", 3]
                if mk == "alpha":
                    extra += ["-mask", int(info.get("alpha_band") or 4)]
                elif mk == "nodata":                                # 명령 쪽에서만 읽히는 파일 — 첫 밴드의 빈 값 표시를 마스크로
                    extra += ["-mask", 1, "-a_nodata", "none"]
                if out_epsg:                                         # 번호만 정리(다시 그리지 않음)
                    extra += ["-a_srs", f"EPSG:{out_epsg}"]
                run(t, "gdal_translate", [*args, *extra, src, str(part)])
        else:
            extra = []
            if out_epsg:
                extra += ["-a_srs", f"EPSG:{out_epsg}"]
            run(t, "gdal_translate", [*args, *extra, src, str(part)])
    except Exception:
        part.unlink(missing_ok=True)
        raise
    finally:
        for f in tmp:
            f.unlink(missing_ok=True)
    return {"part": part, "tool": tool_word(t), "epsg": out_epsg, "collar": mask_frac}


# ═══ 확인 — 크기 · 범위 · 좌표 · 화질 표본 ═══════════════════════════════════════════
def _windows(dst: Path, n: int, side: int = 1024) -> list:
    """표준본에서 영상이 있는 곳(마스크가 모두 유효) 네모 몇 개 — 고르게 흩어서."""
    import numpy as np
    import rasterio
    with rasterio.open(str(dst)) as d:
        W, H = d.width, d.height
        side = min(side, W, H)
        gw, gh = max(1, W // side), max(1, H // side)
        m = d.dataset_mask(out_shape=(gh * 4, gw * 4))
    ok = []
    for j in range(gh):
        for i in range(gw):
            if (m[j * 4:(j + 1) * 4, i * 4:(i + 1) * 4] > 0).all():
                ok.append((i * side, j * side))
    if not ok:
        ok = [((W - side) // 2, (H - side) // 2)]
    idx = sorted(set(int(round(x)) for x in np.linspace(0, len(ok) - 1, min(n, len(ok)))))
    return [(ok[k][0], ok[k][1], side) for k in idx]


def _read_src_window(info: dict, x: int, y: int, side: int, bands: list[int]):
    import rasterio
    from rasterio.windows import Window
    if info["reader"] == "rasterio":
        with rasterio.open(info["path"]) as s:
            return s.read(bands, window=Window(x, y, side, side))
    t = tool_for(ext_of(info["path"]))
    with tempfile.TemporaryDirectory(prefix="lxstd-") as td:
        out = Path(td) / "w.tif"
        args = ["-q", "-srcwin", x, y, side, side, "-of", "GTiff"]
        for b in bands:
            args += ["-b", b]
        run(t, "gdal_translate", [*args, info["path"], str(out)], timeout=900)
        with rasterio.open(str(out)) as s:
            return s.read()


def verify(info: dict, part: Path, rule: dict, epsg: int | None, s: dict | None = None) -> dict:
    import numpy as np
    import rasterio
    s = s or settings()
    ck = s["check"]
    with rasterio.open(str(part)) as d:
        same = (d.width == info["w"] and d.height == info["h"]
                and all(abs(a - b) <= 1e-6 * max(1.0, abs(b)) for a, b in zip(d.transform.to_gdal(), info["transform"])))
        e2 = d.crs.to_epsg() if d.crs else None
        crs_ok = (e2 == epsg) if epsg else True
        layout = d.tags(ns="IMAGE_STRUCTURE").get("LAYOUT")
        ovr = len(d.overviews(1)) if d.count else 0
        bands = list(range(1, d.count + 1))
    out = {"same_grid": bool(same), "crs": e2, "crs_ok": bool(crs_ok), "cog": layout == "COG", "overviews": ovr}
    # 화질(설계 diet.md 와 같은 정의): PSNR = 표본 칸 전체를 한데 모은 평균 제곱 오차로 · SSIM = 밝기, 표본 창 평균. 낱 창의 가장 나쁜 값도 남긴다.
    sse, cnt, rng, psnrs, ssims = 0.0, 0, 255.0, [], []
    try:
        from skimage.metrics import structural_similarity as _ssim
    except Exception:  # noqa: BLE001
        _ssim = None
    for x, y, side in _windows(part, int(ck["samples"])):
        a = _read_src_window(info, x, y, side, (rule.get("bands") or bands)[:3] if rule["rule"] == "jpeg" else bands).astype("float64")
        with rasterio.open(str(part)) as d:
            from rasterio.windows import Window
            b = d.read(bands[:a.shape[0]], window=Window(x, y, side, side)).astype("float64")
        rng = 255.0 if set(info["dtypes"]) == {"uint8"} else max(1.0, float(np.nanmax(a) - np.nanmin(a)))
        e2 = float(((a - b) ** 2).sum())
        sse, cnt = sse + e2, cnt + a.size
        psnrs.append(99.0 if e2 == 0 else 10 * math.log10(rng * rng / (e2 / a.size)))
        if _ssim is not None and a.shape[0] >= 1:
            ya = a[:3].mean(0) if a.shape[0] >= 3 else a[0]
            yb = b[:3].mean(0) if b.shape[0] >= 3 else b[0]
            ssims.append(float(_ssim(ya, yb, data_range=rng)))
    out["psnr_db"] = (99.0 if sse == 0 else round(10 * math.log10(rng * rng / (sse / cnt)), 2)) if cnt else None
    out["ssim"] = round(float(np.mean(ssims)), 4) if ssims else None
    out["psnr_worst_window"] = round(min(psnrs), 2) if psnrs else None
    out["ssim_worst_window"] = round(min(ssims), 4) if ssims else None
    out["windows"] = len(psnrs)
    good_q = (out["psnr_db"] is None or out["psnr_db"] >= float(ck["psnr_min_db"])) and (out["ssim"] is None or out["ssim"] >= float(ck["ssim_min"]))
    out["pass"] = bool(same and crs_ok and out["cog"] and good_q)
    return out


def standardize(src, dst, *, epsg: int | None = None, info: dict | None = None) -> dict:
    """원본 → 표준본 → 확인(어긋나면 한 번 더). → {rule, std_path, std_size, orig_size, seconds, checks, tool, epsg}.
    이미 표준이면(as_is) 표준본 = 원본(복사 0)."""
    s = settings()
    t0 = time.time()
    info = info or inspect(src)
    rule = plan(info, s)
    if rule["rule"] == "as_is":
        return {"rule": "as_is", "std_path": str(src), "std_size": info.get("size"), "orig_size": info.get("size"), "seconds": round(time.time() - t0, 1),
                "checks": {"why": rule["why"], "pass": True}, "tool": "—", "epsg": info.get("epsg")}
    need = _estimate(info, rule)
    free = shutil.disk_usage(Path(dst).parent if Path(dst).parent.exists() else config.DATA_ROOT).free
    if free - need < disk_reserve_gb() * 1e9:
        raise Deferred("서버 저장 공간이 모자라 표준본을 만들지 못했습니다 — 공간이 생기면 다시 만듭니다")
    dst = Path(dst)
    cv = None
    for attempt in (1, 2):                                # 변환 중 오류(디스크 · 읽기 끊김)만 한 번 더 — 같은 설정의 화질 미달은 다시 해도 같다
        try:
            cv = convert(info, dst, rule, epsg=epsg, s=s)
            break
        except Unreadable:
            raise
        except Exception:
            if attempt == 2:
                raise
            time.sleep(5)
    ck = verify(info, cv["part"], rule, cv["epsg"], s)
    if cv.get("collar") is not None:
        ck["collar"] = round(cv["collar"], 4)
    if not ck["pass"]:
        cv["part"].unlink(missing_ok=True)
        raise QualityFail(ck)
    dst.unlink(missing_ok=True)
    os.replace(cv["part"], dst)
    return {"rule": rule["rule"], "mask": rule.get("mask"), "std_path": str(dst), "std_size": _size(dst), "orig_size": info.get("size"),
            "seconds": round(time.time() - t0, 1), "checks": ck, "tool": cv["tool"], "epsg": cv["epsg"]}


# ═══ 변환 기록 · 원본 지울 날짜(imagery_std · 마이그레이션 0017) ═══════════════════════
def _pg():
    import psycopg
    from psycopg.types.json import Jsonb  # noqa: F401
    conn = psycopg.connect(config.PG_WORKER_DSN, autocommit=True)
    conn.execute("SELECT set_config('app.realm','lx',false), set_config('app.tenant_id','',false)")
    return conn


COLS = ("id", "source_kind", "source_id", "tenant_id", "orig_path", "orig_size", "orig_format", "orig_owned", "std_path", "std_size", "rule",
        "state", "checks", "tool", "seconds", "job_id", "error", "confirmed_at", "orig_delete_on", "orig_deleted_at", "created_at", "updated_at")


def _row(r) -> dict | None:
    return dict(zip(COLS, r)) if r else None


def rel(p) -> str:
    """02. 데이터 안이면 상대 경로(기록 · 화면에 절대 경로를 남기지 않게), 밖이면 그대로."""
    try:
        return Path(p).resolve().relative_to(config.DATA_ROOT.resolve()).as_posix()
    except Exception:  # noqa: BLE001
        return str(p)


def absolute(p) -> Path:
    q = str(p or "")
    return Path(q) if (":" in q[:3] or os.path.isabs(q)) else config.DATA_ROOT / q


def owned(path) -> bool:
    """플랫폼이 받은 원본인가 — 02. 데이터 아래 owned_roots(기관 올린 영상 · LX 올린 영상) 안만. 그 밖(보관 영상 · 다른 드라이브)은 지우지 않는다."""
    try:
        r = Path(path).resolve().relative_to(config.DATA_ROOT.resolve()).as_posix()
    except Exception:  # noqa: BLE001
        return False
    return any(r == x.strip("/") or r.startswith(x.strip("/") + "/") for x in settings()["original"]["owned_roots"])


def get(rec_id: str | None = None, *, source: tuple[str, str] | None = None) -> dict | None:
    with _pg() as c:
        if rec_id:
            return _row(c.execute(f"SELECT {', '.join(COLS)} FROM imagery_std WHERE id=%s", (rec_id,)).fetchone())
        return _row(c.execute(f"SELECT {', '.join(COLS)} FROM imagery_std WHERE source_kind=%s AND source_id=%s", source).fetchone())


def ensure(source_kind: str, source_id: str, orig_path, *, tenant: str = "lx", std_path=None) -> dict:
    """변환 기록 한 줄(같은 원본이면 그 줄) — 처음엔 'queued'."""
    from psycopg.types.json import Jsonb  # noqa: F401
    p = Path(orig_path)
    with _pg() as c:
        r = c.execute(f"SELECT {', '.join(COLS)} FROM imagery_std WHERE source_kind=%s AND source_id=%s", (source_kind, source_id)).fetchone()
        if r:
            return _row(r)
        rid = "std_" + uuid.uuid4().hex[:12]
        c.execute("INSERT INTO imagery_std(id, source_kind, source_id, tenant_id, orig_path, orig_size, orig_format, orig_owned, std_path, state) "
                  "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,'queued') ON CONFLICT (source_kind, source_id) DO NOTHING",
                  (rid, source_kind, source_id, tenant, rel(p), _size(p), ext_of(p.name).upper(), owned(p), rel(std_path) if std_path else None))
        return _row(c.execute(f"SELECT {', '.join(COLS)} FROM imagery_std WHERE source_kind=%s AND source_id=%s", (source_kind, source_id)).fetchone())


def update(rec_id: str, **f) -> None:
    from psycopg.types.json import Jsonb
    if not f:
        return
    sets, vals = [], []
    for k, v in f.items():
        sets.append(f"{k}=%s")
        vals.append(Jsonb(v) if isinstance(v, (dict, list)) else v)
    with _pg() as c:
        c.execute(f"UPDATE imagery_std SET {', '.join(sets)}, updated_at=now() WHERE id=%s", (*vals, rec_id))


def claim(rec_id: str, job_id: str | None = None, stale_s: int = 900) -> bool:
    """이 기록을 지금 바꾸는 쪽이 하나만 되게 — queued · failed(다시) · 오래 멈춘 converting(바꾸는 동안 5분마다 새로 적으므로 15분 = 멈춤)만 잡는다."""
    with _pg() as c:
        r = c.execute("UPDATE imagery_std SET state='converting', job_id=coalesce(%s, job_id), error=NULL, updated_at=now() WHERE id=%s AND "
                      "(state IN ('queued','failed','deferred') OR (state='converting' AND updated_at < now() - make_interval(secs => %s))) RETURNING id",
                      (job_id, rec_id, stale_s)).fetchone()
        return bool(r)


def delete_on(confirmed: dt.datetime, keep_days: int) -> dt.date:
    return confirmed.astimezone(KST).date() + dt.timedelta(days=int(keep_days))


def run_record(rec_id: str, *, job_id: str | None = None, epsg: int | None = None, std_path=None, force: bool = False) -> dict:
    """기록 한 줄을 표준으로 바꾸고 확인 → 기록 갱신(ready · 원본 지울 날짜 | failed · 사람 말). 게이트웨이(작은 파일)와 CPU 작업기(큰 파일)가 같이 쓴다."""
    rec = get(rec_id)
    if not rec:
        raise KeyError(rec_id)
    if rec["state"] == "ready" and not force:
        return rec
    if not claim(rec_id, job_id):
        return get(rec_id)
    s = settings()
    src = absolute(rec["orig_path"])
    dst = absolute(std_path or rec["std_path"]) if (std_path or rec["std_path"]) else src.parent / "std" / (src.stem + ".tif")
    lock = None
    alive = _touch(rec_id)                                 # 바꾸는 동안 기록을 5분마다 새로 적는다(오래 걸려도 다른 쪽이 '멈춘 변환'으로 보고 가로채지 않게)
    try:
        if not src.exists():
            raise Unreadable("unreadable", "원본 파일이 없습니다")
        big = (rec.get("orig_size") or 0) > float(s["convert"]["big_gb"]) * 1e9
        if big:
            lock = _big_lock(rec_id)
        out = standardize(src, dst, epsg=epsg)
        cur = get(rec_id) or {}
        if cur.get("state") == "removed":                  # 바꾸는 사이 올린 파일을 지웠다 — 표준본도 남기지 않는다
            if Path(out["std_path"]).resolve() != src.resolve():
                Path(out["std_path"]).unlink(missing_ok=True)
            return cur
        now = dt.datetime.now(KST)
        keep = int(s["original"]["keep_days"])
        same = Path(out["std_path"]).resolve() == src.resolve()
        update(rec_id, state="ready", std_path=rel(out["std_path"]), std_size=out.get("std_size"), rule=out["rule"], checks=out["checks"],
               tool=out["tool"], seconds=out["seconds"], error=None, confirmed_at=now,
               orig_delete_on=None if (same or not rec["orig_owned"]) else delete_on(now, keep))
        return {**get(rec_id), "_epsg": out.get("epsg")}
    except Deferred as d:
        update(rec_id, state="deferred", error=str(d))
        return get(rec_id)
    except Unreadable as u:
        update(rec_id, state="failed", error=u.line)
        return get(rec_id)
    except QualityFail as q:
        update(rec_id, state="failed", error="표준본 화질이 확인 기준에 못 미쳐 원본으로 분석합니다(원본은 지우지 않음)", checks=q.checks)
        return get(rec_id)
    except Exception as e:  # noqa: BLE001
        update(rec_id, state="failed", error="표준본을 만들지 못했습니다 — 원본으로 분석합니다", checks={"detail": repr(e)[:600]})
        return get(rec_id)
    finally:
        alive()
        if lock:
            lock()


def _touch(rec_id: str):
    import threading
    stop = threading.Event()

    def beat():
        while not stop.wait(300):
            try:
                with _pg() as c:
                    c.execute("UPDATE imagery_std SET updated_at=now() WHERE id=%s AND state='converting'", (rec_id,))
            except Exception:  # noqa: BLE001
                pass
    threading.Thread(target=beat, daemon=True).start()
    return stop.set


def _big_lock(rec_id: str):
    """큰 파일 변환은 한 번에 하나 — Redis 잠금(30분마다 늘림 · 작업기가 죽으면 저절로 풀림). → 푸는 함수."""
    import threading
    import redis
    rd = redis.Redis.from_url(config.REDIS_URL, decode_responses=True)
    key = "imagery_std:big"
    while not rd.set(key, rec_id, nx=True, ex=1800):
        time.sleep(5)
    stop = threading.Event()

    def keep():
        while not stop.wait(600):
            try:
                rd.expire(key, 1800)
            except Exception:  # noqa: BLE001
                pass
    th = threading.Thread(target=keep, daemon=True)
    th.start()

    def release():
        stop.set()
        try:
            if rd.get(key) == rec_id:
                rd.delete(key)
        except Exception:  # noqa: BLE001
            pass
    return release


# ═══ 원본 정리 — 정해진 작업(CPU 작업기 하루 한 번) ═══════════════════════════════════
def due(today: dt.date | None = None) -> list[dict]:
    today = today or dt.datetime.now(KST).date()
    with _pg() as c:
        rows = c.execute(f"SELECT {', '.join(COLS)} FROM imagery_std WHERE state='ready' AND orig_owned AND orig_delete_on IS NOT NULL "
                         "AND orig_delete_on <= %s AND orig_deleted_at IS NULL AND std_path IS DISTINCT FROM orig_path ORDER BY orig_delete_on", (today,)).fetchall()
    return [_row(r) for r in rows]


def purge(dry_run: bool | None = None, today: dt.date | None = None, log=print) -> dict:
    """원본 지울 날짜가 지난 원본을 지운다 → 기록(imagery_std.orig_deleted_at) + 감사 기록(audit_log 'imagery.original.delete').
    dry_run(보기만)이면 지울 목록만 돌려준다. 지우기 전에 한 번 더 본다: 플랫폼이 받은 원본인가 · 표준본이 있나(크기 > 0)."""
    from psycopg.types.json import Jsonb
    s = settings()
    dry = (not bool(s["original"]["delete"])) if dry_run is None else bool(dry_run)
    out = {"dry_run": dry, "items": [], "deleted": 0, "bytes": 0, "skipped": 0}
    for r in due(today):
        src, std = absolute(r["orig_path"]), absolute(r["std_path"])
        why = None
        if not owned(src):
            why = "플랫폼이 받은 원본이 아님"
        elif not std.exists() or (_size(std) or 0) <= 0:
            why = "표준본이 없음"
        item = {"id": r["id"], "source": f"{r['source_kind']}:{r['source_id']}", "tenant": r["tenant_id"], "orig": r["orig_path"],
                "size": r["orig_size"], "delete_on": str(r["orig_delete_on"]), "skip": why}
        out["items"].append(item)
        if why:
            out["skipped"] += 1
            continue
        if dry:
            continue
        try:
            src.unlink(missing_ok=True)
        except PermissionError:
            item["skip"] = "열려 있는 파일 — 다음 정리 때"
            out["skipped"] += 1
            continue
        with _pg() as c:
            c.execute("UPDATE imagery_std SET orig_deleted_at=now(), updated_at=now() WHERE id=%s", (r["id"],))
            c.execute("INSERT INTO audit_log(actor, realm, action, subject, before, after) VALUES ('system','system','imagery.original.delete',%s,%s,%s)",
                      (r["id"], Jsonb({"orig": r["orig_path"], "size": r["orig_size"], "delete_on": str(r["orig_delete_on"])}),
                       Jsonb({"std": r["std_path"], "std_size": r["std_size"], "tenant": r["tenant_id"], "source": item["source"],
                              "keep_days": int(s["original"]["keep_days"])})))
        out["deleted"] += 1
        out["bytes"] += int(r["orig_size"] or 0)
        log(f"원본 지움 {r['id']} {r['orig_path']} ({r['orig_size']} B)")
    return out


def date_word(d) -> str | None:
    if not d:
        return None
    return (d if isinstance(d, str) else d.isoformat())[:10].replace("-", ".")


def view(r: dict | None, lx: bool = True) -> dict | None:
    """화면에 내는 모양 — 경로 · 도구 · 작업 번호는 내지 않는다(원칙 11)."""
    if not r:
        return None
    st = r["state"]
    word = {"queued": "표준으로 바꿀 차례", "converting": "표준으로 바꾸는 중", "ready": "표준본 확인", "failed": "원본으로 씀",
            "deferred": "표준 변환 미룸", "removed": "지움"}.get(st, st)
    from .envelope import env
    out = {"state": st, "state_word": word, "rule": r.get("rule"),
           "orig_size": env(r.get("orig_size"), "bytes", "measured", "imagery_std(원본 크기)"),
           "std_size": env(r.get("std_size"), "bytes", "measured", "imagery_std(표준본 크기)"),
           "delete_on": date_word(r.get("orig_delete_on")), "deleted": bool(r.get("orig_deleted_at")), "kept": bool(st == "ready" and not r.get("orig_delete_on"))}
    if lx and r.get("error"):
        out["error"] = r["error"]
    return out


# ═══ 큰 파일 — CPU 작업기 대기열(게이트웨이에서 부른다) ═══════════════════════════════
async def enqueue(rec_id: str, label: str, epsg: int | None = None) -> str:
    """표준으로 바꾸기 작업 한 건(kind tile · pool cpu · 어댑터 tile/cog · shard 1) — 기관 의뢰로 올린 큰 파일. 분석 작업과 같은 대기열 기록(jobs · Redis)."""
    from starlette.concurrency import run_in_threadpool
    from . import jobs as J
    from .deps import db, redis
    from .envelope import now_iso
    job_id = "job_" + J.ulid()
    rs = f"results/lx/{job_id}"
    opts = {"std_id": rec_id, "epsg": epsg}
    async with db(realm="lx") as conn:
        await conn.execute(
            "INSERT INTO jobs(id, tenant_id, submitted_by, kind, state, priority, demo, pool, model_id, imagery_id, deploy_id, card_id, aoi, options, "
            "shards_total, result_set, label, test) VALUES ($1,'lx','system','tile','queued',0,false,'cpu',NULL,NULL,NULL,NULL,NULL,$2,1,$3,$4,false)",
            job_id, opts, rs, label)
        await conn.execute("INSERT INTO audit_log(actor, realm, action, subject, before, after) VALUES ('system','system','job.submit',$1,NULL,$2)",
                           job_id, {"kind": "tile", "std_id": rec_id})
    await run_in_threadpool(update, rec_id, state="queued", job_id=job_id)
    r = await redis()
    now = now_iso()
    await r.hset(f"job:{job_id}", mapping={
        "id": job_id, "state": "queued", "tenant_id": "lx", "demo": "0", "kind": "tile", "pool": "cpu", "priority": 0, "model_id": "",
        "imagery_id": "", "options": json.dumps(opts), "aoi": "", "shards_total": 1, "shards_done": 0, "shards_failed": 0, "counts": "{}", "gpu_s": 0,
        "result_set": rs, "created_at": now, "submitted_by": "system", "centroid": "null", "queued_at_ms": int(time.time() * 1000),
        "adapter": "tile/cog", "deploy_id": "", "label": label})
    await r.xadd("jobs:cpu", {"job_id": job_id, "priority": 0}, maxlen=10000, approximate=True)
    await J.publish(job_id, "job.queued", {"job_id": job_id, "position": 0, "pool": "cpu", "at": now})
    await J.ops_event("job.state", {"job_id": job_id, "tenant_id": "lx", "state": "queued", "aoi_centroid": None, "pool": "cpu", "at": now})
    return job_id


# ═══ 화면에 내는 값(LX) ═════════════════════════════════════════════════════
try:
    from fastapi import APIRouter, Request
    router = APIRouter()

    @router.get("/imagery/std/formats")
    async def formats(request: Request):
        """받는 형식 · 지금 받을 수 없는 형식 — LX 는 무엇이 없는지('ECW 변환기가 이 서버에 없습니다'), 기관은 쉬운 말 한 줄."""
        from starlette.concurrency import run_in_threadpool
        from .deps import principal, require
        p = require(principal(request))
        un = await run_in_threadpool(unavailable, bool(p.is_lx))
        return {"raster": accept_raster(), "sidecar": accept_sidecar(), "unavailable": un}

    @router.get("/imagery/std/originals")
    async def originals(request: Request, days: int = 120):
        """LX 관리자 — 원본 지울 날짜(보기만 · 지우지 않음): 앞으로 days 일 안에 지울 원본 · 이미 지운 원본 수."""
        from starlette.concurrency import run_in_threadpool
        from .deps import principal, require
        require(principal(request), admin=True)
        until = dt.datetime.now(KST).date() + dt.timedelta(days=int(days))

        def q():
            with _pg() as c:
                rows = c.execute(f"SELECT {', '.join(COLS)} FROM imagery_std WHERE state='ready' AND orig_delete_on IS NOT NULL AND orig_deleted_at IS NULL "
                                 "AND orig_delete_on <= %s ORDER BY orig_delete_on LIMIT 500", (until,)).fetchall()
                gone = c.execute("SELECT count(*), coalesce(sum(orig_size),0) FROM imagery_std WHERE orig_deleted_at IS NOT NULL").fetchone()
            return [_row(r) for r in rows], gone
        from .envelope import env, now_iso
        rows, gone = await run_in_threadpool(q)
        return {"items": [{"tenant_id": r["tenant_id"], "source_kind": r["source_kind"], **view(r)} for r in rows],
                "deleted": {"n": int(gone[0]), "bytes": int(gone[1])},
                "keep_days": env(int(settings()["original"]["keep_days"]), "day", "recorded", "config/imagery.yaml original.keep_days"), "as_of": now_iso()}
except Exception:  # noqa: BLE001 — 작업기(FastAPI 없이 부를 때)
    router = None


if __name__ == "__main__":                       # python -m landxi_api.imagery_std purge --dry-run | tools | convert <src> <dst>
    import sys
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:  # noqa: BLE001
        pass
    a = sys.argv[1:]
    if a[:1] == ["tools"]:
        for t in tools(True):
            print(t["name"], t["version"], t["ok"], sorted(d for d in t["drivers"] if d in {"ECW", "JP2OpenJPEG", "JP2ECW", "GTiff", "HFA", "JPEG", "COG"}))
    elif a[:1] == ["purge"]:
        print(json.dumps(purge(dry_run="--dry-run" in a), ensure_ascii=False, indent=1, default=str))
    elif a[:1] == ["convert"] and len(a) >= 3:
        print(json.dumps(standardize(a[1], a[2]), ensure_ascii=False, indent=1, default=str))
