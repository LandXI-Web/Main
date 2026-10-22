"""결과 원본 파일의 자리와 형식 — 한 곳(10-22 now21 저장보안-파일-결과형식 ⓐ · 저장보안-파일-결과폴더 ⓐ · 바퀴 22 P4).

자리
  새 결과   results/{주인}/{연-월}/{작업}.fgb · {작업}.pmtiles · {작업}/(조각 shards · qa.json)
            연-월 = 작업 번호(ULID)에 든 만든 시각(한국 시각) — 데이터베이스를 보지 않고 경로가 정해진다.
  옛 결과   results/{주인}/{작업}.geojson · {작업}.pmtiles · {작업}/ — 그대로 읽힌다(옛 자리에 무엇이든 있으면 옛 자리).
  세트 이름(results/{주인}/{작업})은 바뀌지 않는다. 서명 · 화면 · 기록이 쓰는 이름은 그대로, 실제 파일 자리만 이 모듈이 정한다.

형식
  새 결과   FlatGeobuf(.fgb · 공간 색인 · '이 범위만 읽기') · 좌표 소수 7자리(약 1cm)
  옛 결과   GeoJSON(.geojson · .geojson.gz) — 읽는 쪽은 두 형식을 모두 읽는다(read_features).
  GeoJSON 은 내려받을 때 만든다(내려받기 · 보고서는 DB 결과 줄 또는 이 파일에서 그때그때 만든다).
"""
from __future__ import annotations

import datetime as dt
import gzip
import json
import os
from pathlib import Path

from . import config

PRECISION = 7                                   # 좌표 소수 자리(경위도 1e-7° ≈ 1cm)
INT_FIELDS = {"cid", "n", "fid_n"}              # 빈 값이 섞여 실수로 적힌 정수 열 — 읽을 때 정수로
VECTOR_EXT = (".fgb", ".geojson", ".geojson.gz")
SIDE_EXT = VECTOR_EXT + (".pmtiles", "-summary.json")
_CROCK = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
_KST = dt.timezone(dt.timedelta(hours=9))


def _root() -> Path:
    return config.DATA_ROOT / "results"


def month_of(job_id: str | None) -> str | None:
    """작업 번호(job_ + ULID 26자) → 만든 달 'YYYY-MM'(한국 시각). ULID 가 아니면 None(옛 자리)."""
    s = str(job_id or "")
    if s.startswith("job_"):
        s = s[4:]
    if len(s) != 26:
        return None
    t = 0
    try:
        for ch in s[:10].upper():
            t = t * 32 + _CROCK.index(ch)
    except ValueError:
        return None
    if not (1.6e12 < t < 4.1e12):                  # 2020 ~ 2099 사이의 밀리초가 아니면 ULID 가 아니다(시험 번호 등)
        return None
    return dt.datetime.fromtimestamp(t / 1000, _KST).strftime("%Y-%m")


def _legacy(tenant: str, job_id: str) -> Path:
    return _root() / (tenant or "lx") / job_id


def _has_any(b: Path) -> bool:
    if b.exists():
        return True
    return any(b.with_name(b.name + e).exists() for e in SIDE_EXT)


def base(tenant: str | None, job_id: str) -> Path:
    """결과 한 건의 바탕 경로(확장자 없음) — 폴더 = base, 파일 = base + .fgb/.geojson/.pmtiles.
    옛 자리에 이미 무엇이 있으면(돌던 작업 · 옛 결과) 옛 자리, 아니면 새 자리(연-월)."""
    t = tenant or "lx"
    old = _legacy(t, job_id)
    m = month_of(job_id)
    if not m or _has_any(old):
        return old
    return _root() / t / m / job_id


def base_of_set(set_id: str | None) -> Path | None:
    """세트 이름 results/{주인}/{작업} → 바탕 경로. 이름이 다른 모양이면 그 이름 그대로(DATA_ROOT 기준)."""
    s = str(set_id or "").strip("/")
    if not s or ".." in s:
        return None
    parts = s.split("/")
    if len(parts) == 3 and parts[0] == "results":
        return base(parts[1], parts[2])
    return config.DATA_ROOT / s


def job_dir(tenant: str | None, job_id: str) -> Path:
    return base(tenant, job_id)


def shard_dir(tenant: str | None, job_id: str) -> Path:
    return base(tenant, job_id) / "shards"


def snapshot_path(tenant: str | None, job_id: str) -> Path:
    b = base(tenant, job_id)
    return b.with_name(b.name + ".pmtiles")


def vector_path(tenant: str | None, job_id: str) -> Path | None:
    """결과 원본 파일(.fgb 먼저 · 옛 .geojson · .geojson.gz) — 없으면 None."""
    return vector_of_base(base(tenant, job_id))


def vector_of_base(b: Path | None) -> Path | None:
    if b is None:
        return None
    for e in VECTOR_EXT:
        p = b.with_name(b.name + e)
        if p.exists():
            return p
    return None


def new_vector_path(tenant: str | None, job_id: str) -> Path:
    b = base(tenant, job_id)
    return b.with_name(b.name + ".fgb")


def files_of_base(b: Path | None) -> list[Path]:
    """결과 한 건이 차지하는 것 전부(폴더 + 곁 파일) — 보관 정리 · 저장 사용량이 같이 쓴다."""
    if b is None:
        return []
    return [b] + [b.with_name(b.name + e) for e in SIDE_EXT]


def size_of_base(b: Path | None) -> int:
    """결과 한 건의 바이트(폴더 안 전부 + 곁 파일) — 작업이 끝날 때 jobs.result_bytes 에 적는다(저장 현황이 폴더를 훑지 않게 · 0122)."""
    n = 0
    for f in files_of_base(b):
        try:
            if f.is_dir():
                for dp, _dn, fn in os.walk(f):
                    for x in fn:
                        try:
                            n += os.path.getsize(os.path.join(dp, x))
                        except OSError:
                            pass
            elif f.is_file():
                n += f.stat().st_size
        except OSError:
            pass
    return n


def rel(p: Path) -> str:
    try:
        return Path(p).relative_to(config.DATA_ROOT).as_posix()
    except ValueError:
        return Path(p).as_posix()


def drop_empty(d: Path) -> bool:
    """빈 폴더면 지운다(합친 뒤 남은 작업 폴더 · 그 위 빈 달 폴더는 두지 않는다 — 결과 폴더 자체는 남김)."""
    try:
        d.rmdir()
    except OSError:
        return False
    return True


# ── 쓰기 ─────────────────────────────────────────────────────────────────────
def _round_geom(g):
    import numpy as np
    import shapely
    return shapely.transform(g, lambda c: np.round(c, PRECISION))


def _column(vals: list):
    """한 속성 열 → numpy 배열(FlatGeobuf 형) — 정수(빈 값 있으면 실수) · 실수 · 참거짓 · 글자."""
    import numpy as np
    kinds = {type(v) for v in vals if v is not None}
    if kinds and kinds <= {bool}:
        if any(v is None for v in vals):
            return np.array(["" if v is None else ("true" if v else "false") for v in vals], dtype=object)
        return np.array(vals, dtype=bool)
    if kinds and kinds <= {int}:
        if any(v is None for v in vals):
            return np.array([np.nan if v is None else float(v) for v in vals], dtype="float64")
        return np.array(vals, dtype="int64")
    if kinds and kinds <= {int, float}:
        return np.array([np.nan if v is None else float(v) for v in vals], dtype="float64")
    return np.array([None if v is None else (v if isinstance(v, str) else json.dumps(v, ensure_ascii=False)) for v in vals], dtype=object)


def write_fgb(path: Path, geoms: list, props: list[dict], fields: tuple[str, ...], layer: str = "results") -> dict:
    """도형(shapely) + 속성 → FlatGeobuf(좌표 소수 7자리 · 공간 색인). 쓰는 동안은 .part.fgb — 다 쓴 뒤 이름을 바꾼다."""
    import shapely
    from pyogrio.raw import write
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.stem + ".part.fgb")         # 확장자가 .fgb 가 아니면 GDAL 이 폴더(여러 층)로 만든다
    tmp.unlink(missing_ok=True)
    wkb = shapely.to_wkb([_round_geom(g) for g in geoms]) if geoms else []
    cols = [_column([p.get(k) for p in props]) for k in fields]
    kinds = {g.geom_type for g in geoms}
    gtype = kinds.pop() if len(kinds) == 1 else "Unknown"
    if not geoms:
        gtype = "MultiPolygon"
    write(str(tmp), geometry=wkb, field_data=cols, fields=list(fields), driver="FlatGeobuf", geometry_type=gtype,
          crs="EPSG:4326", layer=layer, layer_options={"SPATIAL_INDEX": "YES"})
    os.replace(tmp, path)
    return {"path": str(path), "bytes": path.stat().st_size, "features": len(geoms)}


# ── 읽기(두 형식) ─────────────────────────────────────────────────────────────
def _clean(v):
    try:
        import math
        if isinstance(v, float) and math.isnan(v):
            return None
    except Exception:  # noqa: BLE001
        pass
    if hasattr(v, "item"):
        v = v.item()
    return v


def read_features(path: Path | str | None, bbox: tuple[float, float, float, float] | None = None) -> list[dict]:
    """결과 원본 파일 → GeoJSON Feature 목록(dict). .fgb 는 bbox 를 주면 그 범위만 읽는다(공간 색인)."""
    if not path:
        return []
    p = Path(path)
    if not p.exists():
        return []
    name = p.name.lower()
    if name.endswith(".fgb"):
        import shapely
        from pyogrio.raw import read
        from shapely.geometry import mapping
        meta, _fids, geom, data = read(str(p), bbox=bbox) if bbox else read(str(p))
        fields = list(meta.get("fields") if meta.get("fields") is not None else [])
        gs = shapely.from_wkb(geom) if geom is not None and len(geom) else []
        out = []
        for i, g in enumerate(gs):
            props = {k: _clean(data[j][i]) for j, k in enumerate(fields)}
            for k in INT_FIELDS & props.keys():
                if isinstance(props[k], float) and props[k].is_integer():
                    props[k] = int(props[k])
            out.append({"type": "Feature", "id": props.get("id"), "geometry": mapping(g) if g is not None else None,
                        "properties": props})
        return out
    if name.endswith(".gz"):
        with gzip.open(p, "rt", encoding="utf-8") as f:
            d = json.load(f)
    else:
        d = json.loads(p.read_text(encoding="utf-8"))
    feats = d.get("features") or []
    if bbox:
        from shapely.geometry import box, shape
        bb = box(*bbox)
        feats = [f for f in feats if f.get("geometry") and shape(f["geometry"]).intersects(bb)]
    return feats


def features_of_job(tenant: str | None, job_id: str) -> list[dict]:
    return read_features(vector_path(tenant, job_id))
