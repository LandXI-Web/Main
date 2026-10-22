"""범위 필지 — 연속지적도(시군구 폴더 · .prj 0바이트 → common.detect_belt_crs) + 토지마스터 용도 + 소유구분.

- 시군구 코드(지금 · 옛) → 연속지적도 폴더 '{시도 줄임} {시군구}' (전국 표 · 특정 지역 이름 없음).
- 토지마스터(_00 사본만) → PNU 별 용도 · 도로구역여부만 캐시(개인 정보 없음).
- 소유구분: 지적대장 _00 사본이 있으면 그 '소유구분' 칸(분류 이름만 · 성명 등은 읽지 않음). 없으면
  토지마스터에 있는 필지 = '고속국도 토지', 없는 필지 = '대장 미연결' (지어내지 않음 · 화면에도 그대로).
"""
from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path

import geopandas as gpd
import pandas as pd

from . import DATA, RAW_ROOT, roadland_cfg, roadland_src

roadland_src()
import common as C  # noqa: E402

# 시도 코드(옛 · PNU 앞 두 자리) → 연속지적도 폴더 시도 이름(전국 표)
SIDO2 = {"11": "서울", "26": "부산", "27": "대구", "28": "인천", "29": "광주", "30": "대전", "31": "울산", "36": "세종",
         "41": "경기", "42": "강원", "51": "강원", "43": "충북", "44": "충남", "45": "전북", "52": "전북", "46": "전남",
         "47": "경북", "48": "경남", "50": "제주"}
CACHE = DATA / "_cache"


def sgg_folder(sgg_cd: str) -> tuple[str, str, Path] | None:
    """시군구 코드 → (시도 줄임, 폴더 이름, shp 경로). 지금 코드면 옛 코드(prev_cd)로 시도를 찾는다."""
    from landxi_api.regions import region_of
    r = region_of(sgg_cd) or {}
    codes = [c for c in (r.get("prev_cd"), r.get("sgg_cd"), sgg_cd) if c]
    name = r.get("name") or ""
    cfg = roadland_cfg()
    root = Path(cfg["paths"]["cadastral_root"])
    for cd in codes:
        sido = SIDO2.get(str(cd)[:2])
        if not sido:
            continue
        cands = [root / sido / f"{sido} {name}"] + list((root / sido).glob(f"{sido} *{name}"))
        for d in cands:
            shp = d / "LSMD_CONT_LDREG.shp"
            if shp.exists():
                return sido, d.name, shp
        if sido == "세종" and (root / sido / "LSMD_CONT_LDREG.shp").exists():
            return sido, sido, root / sido / "LSMD_CONT_LDREG.shp"
    return None


def sgg_codes_for(geom4326) -> list[str]:
    """범위(4326)와 겹치는 시군구 코드(지금 코드)."""
    from landxi_api.regions import region_of, regions_base
    _, geoms, _ = regions_base()
    out = []
    for cd, g in geoms.items():
        try:
            if g.intersects(geom4326):
                r = region_of(cd) or {}
                c = r.get("sgg_cd") or cd           # 지금 코드 하나로(옛 코드 경계가 같이 있어도 한 번)
                if c not in out:
                    out.append(c)
        except Exception:
            continue
    return out


@lru_cache(maxsize=8)
def _cad(sgg_cd: str) -> gpd.GeoDataFrame | None:
    """시군구 연속지적도 전체(5179 · 지목) — 파일 캐시(feather 없이 gpkg)."""
    f = sgg_folder(sgg_cd)
    if not f:
        return None
    sido, folder, shp = f
    CACHE.mkdir(parents=True, exist_ok=True)
    cp = CACHE / f"cad-{folder}.gpkg"
    if cp.exists():
        return gpd.read_file(cp)
    g = gpd.read_file(shp, encoding="euc-kr")
    epsg = C.detect_belt_crs(g.total_bounds, sido, roadland_cfg())
    g = g.set_crs(epsg, allow_override=True).to_crs(5179)
    g["PNU"] = g["PNU"].map(C.normalize_pnu)
    g["jimok"] = g["JIBUN"].map(C.parse_jimok)
    g["jibun"] = g["JIBUN"].astype(str).str.replace(r"\s*[가-힣]\s*$", "", regex=True)
    g = g[["PNU", "jibun", "jimok", "geometry"]]
    g.to_file(cp, driver="GPKG")
    return g


@lru_cache(maxsize=1)
def land_master() -> pd.DataFrame:
    """토지마스터(_00) → PNU · 시군구 · 읍면동 · 용도 · 도로구역여부 (캐시 csv)."""
    CACHE.mkdir(parents=True, exist_ok=True)
    cp = CACHE / "landmaster-use.csv"
    if cp.exists():
        return pd.read_csv(cp, dtype=str).set_index("PNU")
    import openpyxl
    cfg = roadland_cfg()
    xl = Path(cfg["paths"]["land_master_xlsx"])
    rows = []
    if xl.exists() and xl.name.endswith("_00.xlsx"):
        wb = openpyxl.load_workbook(xl, read_only=True)
        cols = cfg["land_master"]["columns"]
        for sh in wb.sheetnames:
            if sh in cfg["land_master"]["data_sheets_skip"]:
                continue
            for i, r in enumerate(wb[sh].iter_rows(values_only=True)):
                if i == 0 or not r or not r[cols["pnu"]]:
                    continue
                rr = list(r) + [None] * 12
                rows.append({"PNU": C.normalize_pnu(rr[cols["pnu"]]), "emd": rr[4], "road_yn": rr[cols["road_yn"]], "use": rr[cols["use"]]})
    df = pd.DataFrame(rows, columns=["PNU", "emd", "road_yn", "use"]).drop_duplicates("PNU")
    df.to_csv(cp, index=False, encoding="utf-8")
    return df.set_index("PNU")


OWNER_COLS = ["소유구분", "소유형태", "소유자구분"]


@lru_cache(maxsize=1)
def owner_kind() -> dict[str, str]:
    """지적대장 _00 사본의 소유구분(분류 이름만). 사본이 없으면 빈 표."""
    cp = CACHE / "owner-kind.json"
    if cp.exists():
        return json.loads(cp.read_text(encoding="utf-8"))
    out: dict[str, str] = {}
    for xl in sorted(RAW_ROOT.glob("지적대장*_00.xlsx")):
        try:
            import openpyxl
            wb = openpyxl.load_workbook(xl, read_only=True)
            for ws in wb.worksheets:
                it = ws.iter_rows(values_only=True)
                head = [str(h or "").strip() for h in next(it, [])]
                pi = next((i for i, h in enumerate(head) if h.upper() == "PNU" or h == "고유번호"), None)
                oi = next((i for i, h in enumerate(head) if h in OWNER_COLS), None)
                if pi is None or oi is None:
                    continue
                for r in it:
                    if r and r[pi] and r[oi]:
                        out[C.normalize_pnu(r[pi])] = str(r[oi]).strip()
        except Exception:
            continue
    CACHE.mkdir(parents=True, exist_ok=True)
    cp.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    return out


def owner_of(pnu: str, in_master: bool) -> str:
    ok = owner_kind()
    if pnu in ok:
        return ok[pnu]
    return "고속국도 토지" if in_master else "대장 미연결"


def for_range(range5179, sgg_cds: list[str]) -> gpd.GeoDataFrame:
    """범위(5179)에 걸치는 필지 — PNU · 지번 · 지목 · 용도(토지마스터) · 소유구분 · 시군구 · 읍면동."""
    parts = []
    for cd in sgg_cds:
        g = _cad(cd)
        if g is None or not len(g):
            continue
        idx = list(g.sindex.query(range5179, predicate="intersects"))
        if idx:
            parts.append(g.iloc[idx].assign(sgg_cd=cd))
    if not parts:
        return gpd.GeoDataFrame(columns=["PNU", "jibun", "jimok", "use", "owner", "sgg_cd", "geometry"], geometry="geometry", crs=5179)
    out = gpd.GeoDataFrame(pd.concat(parts, ignore_index=True), crs=5179).drop_duplicates("PNU")
    lm = land_master()
    out["use"] = out["PNU"].map(lm["use"]) if len(lm) else None
    out["in_master"] = out["PNU"].isin(lm.index) if len(lm) else False
    out["owner"] = [owner_of(p, m) for p, m in zip(out["PNU"], out["in_master"])]
    return out.reset_index(drop=True)


def by_pnus(pnus: list[str]) -> gpd.GeoDataFrame:
    """PNU 목록 → 필지 면(시군구 = PNU 앞 다섯 자리 옛 코드)."""
    pn = [C.normalize_pnu(p) for p in pnus if p]
    pn = [p for p in pn if p and len(p) == 19]
    parts = []
    for cd in sorted({p[:5] for p in pn}):
        g = _cad(cd)
        if g is None:
            continue
        parts.append(g[g["PNU"].isin(set(pn))])
    if not parts:
        return gpd.GeoDataFrame(columns=["PNU", "geometry"], geometry="geometry", crs=5179)
    return gpd.GeoDataFrame(pd.concat(parts, ignore_index=True), crs=5179)


_PNU_RE = re.compile(r"\d{19}")


def parse_pnus(text: str) -> list[str]:
    return list(dict.fromkeys(_PNU_RE.findall(text or "")))
