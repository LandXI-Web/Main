"""실태조사 전국화(core-survey · contract-parcel-ai.md) — 어느 시군구든: 필지 적재 → AI × 필지 결합 → 규칙 → 의심.

    build(sgg_cd, ai_job_id=None, *, build_job_id=None, progress=None, force=False) -> dict

① 필지: 로컬 연속지적 전국(LSMD_CONT_LDREG_{시도} SHP · 2022-02 · EPSG:5174) 우선 → 없으면 V-World LP_PA_CBND_BUBUN(페이지 · 디스크 캐시 ·
   호출 상한). PNU 는 지금 시군구 코드로 바꿔 저장(원본은 pnu_src). 주소 = 시도·시군구(regions) + 읍면동(regions.emd_fc) + 리(V-World LT_C_ADRI_INFO).
② 결합: detections(job_id) × 그 시군구 필지 → survey_parcel_ai(작업 × 필지 × 클래스) — 읍면동 단위로 한 번 계산해 저장.
③ 규칙: R1–R6(같은 SQL · rules.eval_sql_ai) → 점수 → 등급(그 시군구 안 상위 5% · 다음 20%) → survey_findings · survey_emd · survey_sgg.
정본 적재(src 'canon') 시군구는 필지·의심을 건드리지 않는다 — 결합만 저장하고 일반 규칙 평가 결과는 회귀 대조로만 남긴다.
지역 문자열 하드코딩 없음(지역은 인자 · 원천 경로는 설정 LX_LSMD_ROOT).
"""
from __future__ import annotations

import csv
import datetime as dt
import hashlib
import io
import json
import math
import subprocess
import time
import urllib.parse
import urllib.request
from pathlib import Path

from . import rules as R
from .db import IMG23, RULE_IDS, lx_tx, pg

import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from landxi_api import config  # noqa: E402

KST = dt.timezone(dt.timedelta(hours=9))
LSMD_ROOT = Path(config.get("LX_LSMD_ROOT", "D:/SSD1/Mobility Convergence/01_LX국토정보기본도및기본공간정보/4. 연속지적도_전국_20220209"))
LSMD_AS_OF = "2022-02"
LSMD_EPSG = 5174                   # 실측: V-World 같은 필지와 1e-7° 일치(2026-09-29 · pyproj/PROJ)
CACHE = config.DATA_ROOT / "cache" / "survey"
VW_PAGE = 1000
VW_MAX_PAGES = int(config.get("LX_SURVEY_VW_MAX_PAGES", "300") or 300)    # 한 번 적재의 V-World 필지 호출 상한(일일 쿼터 보호)
SIDO_DIR = {"11": "서울", "26": "부산", "27": "대구", "28": "인천", "29": "광주", "30": "대전", "31": "울산", "36": "세종", "41": "경기",
            "42": "강원", "43": "충북", "44": "충남", "45": "전북", "46": "전남", "47": "경북", "48": "경남", "50": "제주"}
NEW_SIDO = {"51": "42", "52": "45"}          # 코드만 바뀐 시도(강원특별자치도 · 전북특별자치도) → 2022 원천 코드
JIMOK_NM = {"전": "전", "답": "답", "과": "과수원", "목": "목장용지", "임": "임야", "광": "광천지", "염": "염전", "대": "대", "장": "공장용지",
            "학": "학교용지", "차": "주차장", "주": "주유소용지", "창": "창고용지", "도": "도로", "철": "철도용지", "제": "제방", "천": "하천",
            "구": "구거", "유": "유지", "양": "양어장", "수": "수도용지", "공": "공원", "체": "체육용지", "원": "유원지", "종": "종교용지",
            "사": "사적지", "묘": "묘지", "잡": "잡종지"}
FARM = ("전", "답", "과")


class BuildError(RuntimeError):
    pass


def now_iso() -> str:
    return dt.datetime.now(KST).isoformat(timespec="seconds")


# ─────────────────────────── 지역 · 기관 ───────────────────────────
def region(sgg_cd: str) -> dict:
    """시군구(지금/옛 코드) → {sgg_cd(지금), src_cd(2022 원천 코드), name, sido, full, bbox}."""
    from landxi_api import regions as RG
    r = RG.region_of(str(sgg_cd)[:5])
    if not r:
        raise BuildError(f"unknown_region {sgg_cd}")
    cur = r["sgg_cd"]
    src = r.get("prev_cd") or (NEW_SIDO.get(cur[:2], cur[:2]) + cur[2:])
    return {"sgg_cd": cur, "src_cd": src, "name": r.get("name"), "sido": r.get("sido"), "full": r.get("full") or f"{r.get('sido')} {r.get('name')}",
            "bbox": r.get("bbox")}


def codes(sgg_cd: str) -> list[str]:
    """그 시군구를 가리키는 코드 전부(지금 · 2022 원천)."""
    try:
        r = region(sgg_cd)
        return sorted({r["sgg_cd"], r["src_cd"]})
    except BuildError:
        return [str(sgg_cd)[:5]]


def tenant_for(sgg_cd: str) -> str:
    """관할 기관 = config/regions.yaml tenants.*.sgg 접두가 맞는 첫 기관(없으면 lx)."""
    try:
        cfg = config.load_yaml("regions") or {}
    except Exception:
        cfg = {}
    cs = codes(sgg_cd)
    for tid, t in (cfg.get("tenants") or {}).items():
        if not t or t.get("global") or not t.get("sgg"):
            continue
        if any(c.startswith(px) for px in t["sgg"] for c in cs):
            return tid
    return "lx"


# ─────────────────────────── V-World(서버 키 · 디스크 캐시) ───────────────────────────
def _vw(layer: str, *, attr: str | None = None, box: tuple | None = None, point: tuple | None = None, page: int = 1,
        size: int = VW_PAGE, geometry: bool = True, ttl_days: int = 90) -> dict:
    """V-World Data API 한 쪽 → response dict(status · page · result). 같은 질의는 디스크 캐시(ttl_days)."""
    key, dom = config.get("VWORLD_KEY", "") or "", config.get("VWORLD_DOMAIN", "") or ""
    q = {"service": "data", "request": "GetFeature", "data": layer, "size": str(size), "page": str(page), "crs": "EPSG:4326",
         "format": "json", "geometry": "true" if geometry else "false", "attribute": "true"}
    if attr:
        q["attrFilter"] = attr
    if box:
        q["geomFilter"] = "BOX(%.6f,%.6f,%.6f,%.6f)" % tuple(box)
    if point:
        q["geomFilter"] = "POINT(%.7f %.7f)" % tuple(point)
    ck = hashlib.sha1(json.dumps(q, sort_keys=True).encode()).hexdigest()
    cp = CACHE / "vworld" / ck[:2] / (ck + ".json")
    if cp.exists() and time.time() - cp.stat().st_mtime < ttl_days * 86400:
        return json.loads(cp.read_text(encoding="utf-8"))
    if not key:
        raise BuildError("vworld_key_missing")
    url = "https://api.vworld.kr/req/data?" + urllib.parse.urlencode({**q, "key": key, "domain": dom})
    last = None
    for i in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "LandXI-survey/1.0", "Referer": "http://" + dom})
            with urllib.request.urlopen(req, timeout=60) as r:
                resp = json.loads(r.read().decode("utf-8")).get("response", {})
            st = resp.get("status")
            if st in ("OK", "NOT_FOUND"):
                cp.parent.mkdir(parents=True, exist_ok=True)
                cp.write_text(json.dumps(resp, ensure_ascii=False), encoding="utf-8")
                return resp
            last = str((resp.get("error") or {}).get("code") or st)
            if "LIMIT" in last or "SYSTEM" in last:
                time.sleep(3 * (i + 1))
                continue
            raise BuildError(f"vworld {layer} {last}")
        except BuildError:
            raise
        except Exception as e:  # 네트워크 — 다시
            last = type(e).__name__
            time.sleep(2 * (i + 1))
    raise BuildError(f"vworld {layer} {last}")


def _vw_pages(layer: str, attr: str, geometry: bool, max_pages: int, **kw) -> list[dict]:
    out = []
    for page in range(1, max_pages + 1):
        resp = _vw(layer, attr=attr, page=page, geometry=geometry, **kw)
        if resp.get("status") != "OK":
            break
        out += resp["result"]["featureCollection"]["features"]
        if page >= int((resp.get("page") or {}).get("total") or 1):
            break
    return out


def emd_names(sgg_cd: str) -> dict[str, str]:
    """읍면동 코드(8) → 이름 — core-xi regions.emd_fc(V-World LT_C_ADEMD_INFO · 90일 캐시)."""
    from landxi_api import regions as RG
    try:
        fc = RG.emd_fc(sgg_cd)
        return {f["properties"]["emd_cd"]: f["properties"].get("name") for f in fc.get("features") or []}
    except Exception:
        return {}


def ri_names(sgg_cd: str) -> dict[str, str]:
    """리 코드(10) → 이름 — V-World LT_C_ADRI_INFO(속성만 · 90일 캐시). 동 지역은 리가 없다."""
    out: dict[str, str] = {}
    for cd in codes(sgg_cd):
        try:
            for f in _vw_pages("LT_C_ADRI_INFO", f"li_cd:LIKE:{cd}", False, 10):
                p = f.get("properties") or {}
                c = str(p.get("li_cd") or "")
                if c.startswith(cd):
                    out[region(sgg_cd)["sgg_cd"] + c[5:]] = p.get("li_kor_nm")
        except BuildError:
            continue
        if out:
            break
    return out


def jibun_of(pnu: str) -> str:
    san = "산" if pnu[10] == "2" else ""
    bon, bu = int(pnu[11:15]), int(pnu[15:19])
    return f"{san}{bon}" + (f"-{bu}" if bu else "")


# ─────────────────────────── ① 필지 ───────────────────────────
def lsmd_shp(src_cd: str) -> Path | None:
    d = LSMD_ROOT / f"LSMD_CONT_LDREG_{SIDO_DIR.get(src_cd[:2], '')}"
    if not d.exists():
        return None
    return next(iter(sorted(d.glob("*.shp"))), None)


def lsmd_extract(rg: dict) -> tuple[Path | None, dict]:
    """로컬 연속지적에서 그 시군구만 → CSV(WKT · 4326) 캐시. 반환 (경로 | None, 실측).
    같은 시군구를 두 곳에서 동시에 뽑지 않게 잠금 파일(.lock) — 다른 쪽이 뽑는 중이면 끝날 때까지 기다린다(최대 20분)."""
    import os
    shp = lsmd_shp(rg["src_cd"])
    if shp is None:
        return None, {"lsmd": "원천 없음"}
    out = CACHE / "parcels" / f"lsmd-{rg['sgg_cd']}.csv"
    if out.exists() and out.stat().st_size > 1000:
        return out, {"lsmd_cache": True}
    out.parent.mkdir(parents=True, exist_ok=True)
    lock = out.with_suffix(".lock")
    t0 = time.time()
    while True:
        try:
            fd = os.open(str(lock), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.write(fd, str(os.getpid()).encode())
            os.close(fd)
            break
        except FileExistsError:
            if out.exists() and out.stat().st_size > 1000:
                return out, {"lsmd_cache": True, "waited_s": round(time.time() - t0, 1)}
            if time.time() - lock.stat().st_mtime > 1200:          # 20분 넘은 잠금 = 죽은 작업
                lock.unlink(missing_ok=True)
                continue
            time.sleep(3)
    try:
        if out.exists() and out.stat().st_size > 1000:
            return out, {"lsmd_cache": True}
        tmp = out.with_name(f"{out.stem}.{os.getpid()}.tmp.csv")
        if tmp.exists():
            tmp.unlink()
        cmd = [config.gdal_exe("ogr2ogr"), "-f", "CSV", str(tmp), str(shp), "--config", "SHAPE_ENCODING", "CP949",
               "-where", f"PNU LIKE '{rg['src_cd']}%'", "-select", "PNU,JIBUN",
               "-s_srs", f"EPSG:{LSMD_EPSG}", "-t_srs", "EPSG:4326", "-lco", "GEOMETRY=AS_WKT"]
        r = subprocess.run(cmd, env=config.gdal_env(), capture_output=True, text=True, encoding="utf-8", errors="replace")
        if r.returncode != 0 or not tmp.exists():
            raise BuildError(f"lsmd ogr2ogr 실패: {r.stderr[-300:]}")
        tmp.replace(out)
    finally:
        lock.unlink(missing_ok=True)
    return out, {"lsmd_extract_s": round(time.time() - t0, 1), "lsmd_file": shp.name}


def vworld_parcels(rg: dict) -> tuple[list[dict], dict]:
    """V-World 연속지적(LP_PA_CBND_BUBUN) — 시군구 bbox 를 칸으로 나눠 그 코드 PNU 만. 호출 상한 VW_MAX_PAGES."""
    bb = rg.get("bbox")
    if not bb:
        raise BuildError("no_bbox")
    nx = max(1, math.ceil((bb[2] - bb[0]) / 0.05))
    ny = max(1, math.ceil((bb[3] - bb[1]) / 0.05))
    feats: dict[str, dict] = {}
    pages = 0
    for i in range(nx):
        for j in range(ny):
            box = (bb[0] + i * (bb[2] - bb[0]) / nx, bb[1] + j * (bb[3] - bb[1]) / ny,
                   bb[0] + (i + 1) * (bb[2] - bb[0]) / nx, bb[1] + (j + 1) * (bb[3] - bb[1]) / ny)
            page = 1
            while True:
                if pages >= VW_MAX_PAGES:
                    return list(feats.values()), {"vworld_pages": pages, "vworld_capped": True}
                resp = _vw("LP_PA_CBND_BUBUN", attr=f"pnu:LIKE:{rg['sgg_cd']}", box=box, page=page, ttl_days=30)
                pages += 1
                if resp.get("status") != "OK":
                    break
                for f in resp["result"]["featureCollection"]["features"]:
                    p = f.get("properties") or {}
                    if str(p.get("pnu", "")).startswith(rg["sgg_cd"]):
                        feats[p["pnu"]] = f
                if page >= int((resp.get("page") or {}).get("total") or 1):
                    break
                page += 1
    return list(feats.values()), {"vworld_pages": pages, "vworld_capped": False}


LOAD_COLS = ("pnu", "pnu_src", "jimok", "jiga", "wkt")


def load_parcels(conn, rg: dict, tenant: str, progress=None) -> dict:
    """그 시군구 필지 → survey_parcels(정본 'canon' 행은 그대로). 반환 실측."""
    t0 = time.time()
    m: dict = {}
    rows: list[tuple] = []
    src, as_of = "lsmd", LSMD_AS_OF
    path, mm = lsmd_extract(rg)
    m.update(mm)
    cur, old = rg["sgg_cd"], rg["src_cd"]
    if path is not None:
        csv.field_size_limit(10 ** 9)
        with open(path, encoding="utf-8", newline="") as f:
            for row in csv.DictReader(f):
                p0 = row["PNU"]
                if len(p0) != 19:
                    continue
                pnu = cur + p0[5:] if p0.startswith(old) else p0
                jb = (row.get("JIBUN") or "").strip()
                jm = jb.split(" ")[-1] if " " in jb else jb[-1:]
                jm = jm if jm in JIMOK_NM else (jb[-1:] if jb[-1:] in JIMOK_NM else "")
                rows.append((pnu, p0, jm, None, row["WKT"]))
    if not rows:
        feats, mm = vworld_parcels(rg)
        m.update(mm)
        src, as_of = "vworld", dt.datetime.now(KST).date().isoformat()
        from shapely.geometry import shape
        for f in feats:
            p = f.get("properties") or {}
            jb = str(p.get("jibun") or "")
            jm = jb[-1:] if jb[-1:] in JIMOK_NM else ""
            try:
                wkt = shape(f["geometry"]).wkt
            except Exception:
                continue
            jiga = p.get("jiga")
            rows.append((p["pnu"], p["pnu"], jm, float(jiga) if jiga not in (None, "") else None, wkt))
    if not rows:
        raise BuildError("parcels_empty — 로컬 연속지적·V-World 모두 필지 없음")
    m["read_s"] = round(time.time() - t0, 1)
    if progress:
        progress("parcels", 0, len(rows), "필지 읽음")
    emd = emd_names(cur)
    ri = ri_names(cur)
    sido_sgg = rg["full"]
    t1 = time.time()
    conn.execute("CREATE TEMP TABLE IF NOT EXISTS _sp_load(pnu text, pnu_src text, jimok text, jiga float8, wkt text) ON COMMIT DROP")
    conn.execute("TRUNCATE _sp_load")
    with conn.cursor().copy("COPY _sp_load(pnu, pnu_src, jimok, jiga, wkt) FROM STDIN") as cp:
        for r in rows:
            cp.write_row(r)
    names = [(c, n) for c, n in emd.items()]
    conn.execute("CREATE TEMP TABLE IF NOT EXISTS _emd_nm(cd text PRIMARY KEY, nm text) ON COMMIT DROP")
    conn.execute("TRUNCATE _emd_nm")
    if names:
        with conn.cursor().copy("COPY _emd_nm(cd, nm) FROM STDIN") as cp:
            for x in names:
                cp.write_row(x)
    conn.execute("CREATE TEMP TABLE IF NOT EXISTS _ri_nm(cd text PRIMARY KEY, nm text) ON COMMIT DROP")
    conn.execute("TRUNCATE _ri_nm")
    if ri:
        with conn.cursor().copy("COPY _ri_nm(cd, nm) FROM STDIN") as cp:
            for x in ri.items():
                cp.write_row(x)
    jm_case = "CASE l.jimok " + " ".join(f"WHEN '{k}' THEN '{v}'" for k, v in JIMOK_NM.items()) + " ELSE l.jimok END"
    san = "CASE WHEN substr(l.pnu, 11, 1) = '2' THEN '산 ' ELSE '' END"
    jibun = (f"{san} || ltrim(substr(l.pnu, 12, 4), '0') || CASE WHEN substr(l.pnu, 16, 4) <> '0000' "
             f"THEN '-' || ltrim(substr(l.pnu, 16, 4), '0') ELSE '' END")
    res = conn.execute(
        f"""INSERT INTO survey_parcels AS sp(pnu, tenant_id, sgg_cd, src, src_as_of, pnu_src, addr, emd, emd_cd, ri, jibun, jimok, jimok_nm,
                                         area_m2, jiga, geom)
        SELECT l.pnu, %(t)s::text, %(sgg)s::text, %(src)s::text, %(asof)s::text, l.pnu_src,
               concat_ws(' ', %(full)s::text, e.nm, r.nm, {jibun}), e.nm, substr(l.pnu, 1, 8), r.nm,
               replace({jibun}, '산 ', '산') || CASE WHEN l.jimok <> '' THEN ' ' || l.jimok ELSE '' END, l.jimok, {jm_case},
               ST_Area(ST_Transform(g.g, 5186)), l.jiga, g.g
        FROM _sp_load l
        CROSS JOIN LATERAL (SELECT ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_GeomFromText(l.wkt, 4326)), 3)) AS g) g
        LEFT JOIN _emd_nm e ON e.cd = substr(l.pnu, 1, 8)
        LEFT JOIN _ri_nm r ON r.cd = substr(l.pnu, 1, 10)
        WHERE NOT ST_IsEmpty(g.g)
        ON CONFLICT (pnu) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, sgg_cd = EXCLUDED.sgg_cd, src = EXCLUDED.src,
               src_as_of = EXCLUDED.src_as_of, pnu_src = EXCLUDED.pnu_src, addr = EXCLUDED.addr, emd = EXCLUDED.emd, emd_cd = EXCLUDED.emd_cd,
               ri = EXCLUDED.ri, jibun = EXCLUDED.jibun, jimok = EXCLUDED.jimok, jimok_nm = EXCLUDED.jimok_nm, area_m2 = EXCLUDED.area_m2,
               jiga = coalesce(EXCLUDED.jiga, sp.jiga), geom = EXCLUDED.geom
        WHERE sp.src IS DISTINCT FROM 'canon'""",
        {"t": tenant, "sgg": cur, "src": src, "asof": as_of, "full": sido_sgg})
    m["inserted"] = res.rowcount
    m["insert_s"] = round(time.time() - t1, 1)
    m["src"] = src
    m["as_of"] = as_of
    m["rows"] = len(rows)
    m["emd_named"] = len(emd)
    m["ri_named"] = len(ri)
    conn.execute("ANALYZE survey_parcels")
    return m


# ─────────────────────────── ② AI × 필지 결합 ───────────────────────────
PAIR_SQL = """
WITH e AS (SELECT ST_SetSRID(ST_Extent(geom)::geometry, 4326) env FROM survey_parcels WHERE sgg_cd = %(sgg)s AND emd_cd = %(emd)s),
d AS MATERIALIZED (SELECT coalesce(d.fid, d.id::text) fid, d.cls, d.cls_en, d.conf, v.g geom, ST_Transform(v.g, 5186) g5
      FROM detections d CROSS JOIN e CROSS JOIN LATERAL (SELECT ST_MakeValid(d.geom) g) v
      WHERE d.job_id = %(job)s AND d.edit_state <> 'deleted' AND d.geom && e.env)
SELECT p.pnu, d.fid, d.cls, d.cls_en, d.conf, ST_Area(d.g5) oarea,
       CASE WHEN ST_Within(d.geom, p.geom) THEN ST_Area(d.g5) ELSE ST_Area(ST_Intersection(d.g5, ST_Transform(p.geom, 5186))) END inter
FROM d JOIN survey_parcels p ON ST_Intersects(p.geom, d.geom)
WHERE p.sgg_cd = %(sgg)s AND p.emd_cd = %(emd)s
"""


def _agg_pairs(pairs, frac=0.5, conf_min=0.5) -> dict:
    """(pnu, fid, cls, cls_en, conf, oarea, inter) → {(pnu, key): 집계} — s3_survey.py join/agg 와 같은 식."""
    out: dict = {}
    for pnu, fid, cls, cls_en, conf, oarea, inter in pairs:
        if inter is None or inter <= 0.01:
            continue
        k = (pnu, R.class_key(cls, cls_en))
        a = out.get(k)
        if a is None:
            a = out[k] = {"cls_ko": cls, "cls_en": cls_en, "hit": 0.0, "in": 0.0, "n": 0, "cw": 0.0, "ids": [], "n1": 0, "hit1": 0.0, "c1": 0.0}
        a["hit"] += inter
        c = float(conf) if conf is not None else 0.0
        if inter >= 1.0:
            a["n1"] += 1
            a["hit1"] += inter
            a["c1"] += c
        if oarea and inter / oarea >= frac and c >= conf_min:
            a["in"] += inter
            a["n"] += 1
            a["cw"] += c * inter
            a["ids"].append((inter, fid))
    return out


def join(conn, sgg: str, tenant: str, job_id: str, progress=None) -> dict:
    """detections(job_id) × 그 시군구 필지 → survey_parcel_ai(읍면동 단위 · 한 번 계산해 저장)."""
    t0 = time.time()
    emds = [r[0] for r in conn.execute("SELECT DISTINCT emd_cd FROM survey_parcels WHERE sgg_cd=%s ORDER BY 1", (sgg,)).fetchall()]
    conn.execute("DELETE FROM survey_parcel_ai WHERE job_id=%s AND sgg_cd=%s", (job_id, sgg))
    n_pairs = n_rows = 0
    for i, emd in enumerate(emds):
        pairs = conn.execute(PAIR_SQL, {"sgg": sgg, "emd": emd, "job": job_id}).fetchall()
        attr = {r[0]: tuple(r[1:]) for r in conn.execute("SELECT pnu, emd, jimok, jimok_nm, area_m2 FROM survey_parcels WHERE sgg_cd=%s AND emd_cd=%s",
                                                         (sgg, emd)).fetchall()} if pairs else {}
        n_pairs += len(pairs)
        agg = _agg_pairs(pairs)
        if agg:
            with conn.cursor().copy("COPY survey_parcel_ai(job_id, pnu, tenant_id, sgg_cd, emd_cd, cls, cls_ko, cls_en, hit_m2, in_m2, n, conf, ids, "
                                    "n1, hit1_m2, conf1_sum, emd, jimok, jimok_nm, parcel_m2) FROM STDIN") as cp:
                for (pnu, key), a in agg.items():
                    ids = ",".join(str(f) for _, f in sorted(a["ids"], key=lambda x: -x[0])[:5])
                    cp.write_row((job_id, pnu, tenant, sgg, pnu[:8], key, a["cls_ko"], a["cls_en"], a["hit"], a["in"], a["n"],
                                  (a["cw"] / a["in"]) if a["in"] > 0 else None, ids or None, a["n1"], a["hit1"], a["c1"]) + attr.get(pnu, (None,) * 4))
            n_rows += len(agg)
        if progress and (i % 5 == 4 or i == len(emds) - 1):
            progress("join", i + 1, len(emds), None)
    joined = conn.execute("SELECT count(DISTINCT pnu) FROM survey_parcel_ai WHERE job_id=%s AND sgg_cd=%s", (job_id, sgg)).fetchone()[0]
    return {"emd": len(emds), "pairs": n_pairs, "rows": n_rows, "joined_parcels": int(joined), "join_s": round(time.time() - t0, 1)}


def set_coverage(conn, sgg: str, job_id: str) -> dict:
    """분석 범위 = AI 작업 범위(jobs.aoi) ∩ 영상 footprint(imagery) ∩ 시군구 필지 범위. 작업 행이 없는 정적 세트 = NULL(전역)."""
    row = conn.execute(
        "SELECT CASE WHEN j.aoi IS NOT NULL AND i.footprint IS NOT NULL THEN ST_Intersection(ST_MakeValid(j.aoi), ST_MakeValid(i.footprint)) "
        "ELSE coalesce(ST_MakeValid(i.footprint), ST_MakeValid(j.aoi)) END FROM jobs j LEFT JOIN imagery i ON i.id = j.imagery_id WHERE j.id = %s",
        (job_id,)).fetchone()
    g = row[0] if row else None
    conn.execute("UPDATE survey_sgg SET coverage = %s::geometry WHERE sgg_cd = %s", (g, sgg))
    n = conn.execute("SELECT count(*) FROM survey_parcels sp WHERE sp.sgg_cd = %s AND ((SELECT coverage FROM survey_sgg WHERE sgg_cd = %s) IS NULL "
                     "OR ST_Intersects((SELECT coverage FROM survey_sgg WHERE sgg_cd = %s), ST_PointOnSurface(sp.geom)))", (sgg, sgg, sgg)).fetchone()[0]
    conn.execute("UPDATE survey_sgg SET covered_parcels = %s WHERE sgg_cd = %s", (n, sgg))
    return {"covered_parcels": int(n), "scoped": g is not None}


# ─────────────────────────── ③ 규칙 → 의심 ───────────────────────────
def quantile(xs: list[float], q: float) -> float:
    """numpy/pandas 기본(linear) 분위 — s3_survey.py 등급 절단과 같은 식."""
    s = sorted(xs)
    if not s:
        return float("inf")
    pos = (len(s) - 1) * q
    lo = math.floor(pos)
    hi = min(lo + 1, len(s) - 1)
    return s[lo] + (s[hi] - s[lo]) * (pos - lo)


def evaluate(conn, sgg: str, job_id: str, th: dict | None = None) -> list[tuple]:
    th = th or R.default_thresholds()
    return conn.execute(R.eval_sql_ai(th), {"sgg": sgg, "job": job_id}).fetchall()


def imagery_label(conn, job_id: str) -> str:
    row = conn.execute("SELECT i.name->>'ko', i.epoch, i.gsd_m FROM jobs j LEFT JOIN imagery i ON i.id = j.imagery_id WHERE j.id=%s", (job_id,)).fetchone()
    if row and row[0]:
        return row[0]
    return "AI 분석 결과"


def _fmt(x) -> str:
    return f"{x:,.0f}"


def findings(conn, sgg: str, tenant: str, job_id: str, rows: list[tuple], img: str) -> dict:
    """규칙 행 → survey_findings(upsert · 상태 기록 보존) · survey_emd · 등급 절단(그 시군구 안)."""
    t0 = time.time()
    defs = R.definitions()
    pn = sorted({r[1] for r in rows})
    ops: dict[str, dict] = {}
    if pn:
        cur = conn.execute(f"SELECT * FROM ({R.ai_src('WHERE sp.sgg_cd = %(sgg)s AND sp.pnu = ANY(%(pnus)s)')}) q",
                           {"sgg": sgg, "job": job_id, "pnus": pn})
        cols = [d.name for d in cur.description]
        ops = {r[0]: dict(zip(cols, r)) for r in cur.fetchall()}
        ids = {}
        for pnu, cls, i in conn.execute("SELECT pnu, cls, ids FROM survey_parcel_ai WHERE job_id=%s AND sgg_cd=%s AND pnu = ANY(%s)", (job_id, sgg, pn)).fetchall():
            ids[(pnu, cls)] = i
        par = {r[0]: r for r in conn.execute(
            "SELECT pnu, addr, emd, emd_cd, jimok_nm, area_m2, yongdo, nongup, ST_X(ST_PointOnSurface(geom)), ST_Y(ST_PointOnSurface(geom)) "
            "FROM survey_parcels WHERE pnu = ANY(%s)", (pn,)).fetchall()}
    items = []
    for rule, pnu, emd_cd, a, c, score in rows:
        o = ops.get(pnu) or {}
        p = par.get(pnu)
        if not p:
            continue
        _, addr, emd, _, jnm, area, yongdo, nongup, lon, lat = p
        base = f"지목 {jnm}·필지 {_fmt(area or 0)}㎡" + (f"·{yongdo}" if yongdo else "") + (f"·{nongup}" if nongup else "")
        pct = (a or 0) / max(area or 1, 1)
        if rule in ("R1", "R6"):
            ev = f"{base} | AI 건물 {int(o.get('bld_n') or 0)}동 {_fmt(a)}㎡(필지 {pct:.0%}), 평균신뢰도 {(c or 0):.2f} [{img}]"
            key = "bld"
        elif rule == "R4":
            ev = f"{base} | AI 주차장 {int(o.get('park_n') or 0)}개 {_fmt(a)}㎡(필지 {pct:.0%}), 평균신뢰도 {(c or 0):.2f} [{img}]"
            key = "park"
        elif rule == "R3":
            ev = f"{base} | AI 비닐하우스 {int(o.get('gh_n') or 0)}동 {_fmt(a)}㎡(필지 {pct:.0%}), 평균신뢰도 {(c or 0):.2f} [{img}]"
            key = "gh"
        elif rule == "R5":
            ev = (f"{base} | AI 경작지 {_fmt(o.get('crop_hit') or 0)}㎡ + 비닐하우스 {_fmt(o.get('gh_hit') or 0)}㎡(필지 {pct:.0%}), "
                  f"경작지 신뢰도 {(c or 0):.2f} [{img}]")
            key = "crop"
        else:
            ev = f"{base} | AI 농경 비율 {(o.get('r_farm') or 0):.0%}(경작지 {_fmt(o.get('crop_hit') or 0)}㎡), 건물 {(o.get('r_bld') or 0):.0%} [{img}]"
            key = "crop"
        corro = ["농업진흥구역"] if (nongup == "농업진흥구역" and rule in ("R1", "R4", "R2")) else []
        items.append({"id": f"f_{rule}_{pnu}", "rule": rule, "rule_nm": defs[rule]["name"], "pnu": pnu, "addr": addr, "emd": emd, "emd_cd": emd_cd,
                      "jimok": jnm, "parcel_m2": area, "yongdo": yongdo, "nongup": nongup, "evid_m2": round(float(a or 0), 1),
                      "conf": None if c is None else round(float(c), 3), "score": round(float(score), 1), "corroboration": ";".join(corro),
                      "evidence": ev, "img_date": img, "ai_ids": ids.get((pnu, key)) or "", "lon": round(lon, 6), "lat": round(lat, 6)})
    scores = [x["score"] for x in items]
    q95, q75 = quantile(scores, 0.95), quantile(scores, 0.75)
    items.sort(key=lambda x: -x["score"])
    for i, x in enumerate(items):
        x["rank"] = i + 1
        x["priority"] = "A" if x["score"] >= q95 else ("B" if x["score"] >= q75 else "C")
    cut = {"A": round(q95, 1) if items else None, "B": round(q75, 1) if items else None}
    conn.execute("CREATE TEMP TABLE IF NOT EXISTS _sf(id text PRIMARY KEY, rank int, priority text, score float8, rule text, rule_nm text, pnu text, "
                 "addr text, emd text, emd_cd text, jimok text, parcel_m2 float8, yongdo text, nongup text, evid_m2 float8, conf float8, "
                 "corroboration text, img_date text, evidence text, ai_ids text, lon float8, lat float8) ON COMMIT DROP")
    conn.execute("TRUNCATE _sf")
    keys = ["id", "rank", "priority", "score", "rule", "rule_nm", "pnu", "addr", "emd", "emd_cd", "jimok", "parcel_m2", "yongdo", "nongup",
            "evid_m2", "conf", "corroboration", "img_date", "evidence", "ai_ids", "lon", "lat"]
    with conn.cursor().copy(f"COPY _sf({', '.join(keys)}) FROM STDIN") as cp:
        for x in items:
            cp.write_row([x[k] for k in keys])
    upd = ", ".join(f"{k} = EXCLUDED.{k}" for k in keys if k != "id")
    conn.execute(f"INSERT INTO survey_findings(tenant_id, sgg_cd, ai_job_id, geom, {', '.join(keys)}) "
                 f"SELECT %s, %s, %s, ST_SetSRID(ST_MakePoint(lon, lat), 4326), {', '.join(keys)} FROM _sf "
                 f"ON CONFLICT (id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, sgg_cd = EXCLUDED.sgg_cd, ai_job_id = EXCLUDED.ai_job_id, "
                 f"geom = EXCLUDED.geom, {upd}", (tenant, sgg, job_id))
    # 이번 평가에 없는 옛 의심 — 아무 기록(상태·판정·조치)이 없는 것만 지운다
    stale = conn.execute(
        "DELETE FROM survey_findings f WHERE f.sgg_cd = %s AND f.rule = ANY(%s) AND f.state = 'open' AND f.verdict IS NULL "
        "AND NOT EXISTS (SELECT 1 FROM _sf s WHERE s.id = f.id) "
        "AND NOT EXISTS (SELECT 1 FROM survey_finding_events e WHERE e.finding_id = f.id) "
        "AND NOT EXISTS (SELECT 1 FROM survey_actions a WHERE a.finding_id = f.id) "
        "AND NOT EXISTS (SELECT 1 FROM finding_verdicts v WHERE v.finding_id = f.id)", (sgg, list(RULE_IDS))).rowcount
    by_rule = {r: 0 for r in RULE_IDS}
    by_pr = {"A": 0, "B": 0, "C": 0}
    for x in items:
        by_rule[x["rule"]] += 1
        by_pr[x["priority"]] += 1
    emd_summary(conn, sgg, tenant, job_id, items)
    return {"findings": len(items), "suspect_parcels": len({x["pnu"] for x in items}), "by_rule": by_rule, "by_priority": by_pr,
            "cut": cut, "stale_removed": stale, "findings_s": round(time.time() - t0, 1)}


def emd_summary(conn, sgg: str, tenant: str, job_id: str, items: list[dict]):
    """survey_emd(읍면동 요약) — 필지 수 · 면적 · 지목 상위 · AI 결합 · 의심(규칙 · 등급) · 상위 5 · 범위."""
    base = conn.execute(
        "SELECT emd_cd, max(emd), count(*), sum(area_m2) / 1e4, count(*) FILTER (WHERE jimok = ANY(%s)), "
        "ST_XMin(ST_Extent(geom)), ST_YMin(ST_Extent(geom)), ST_XMax(ST_Extent(geom)), ST_YMax(ST_Extent(geom)) "
        "FROM survey_parcels WHERE sgg_cd = %s GROUP BY emd_cd", (list(FARM), sgg)).fetchall()
    jt: dict = {}
    for cd, jnm, n in conn.execute("SELECT emd_cd, jimok_nm, count(*) FROM survey_parcels WHERE sgg_cd=%s GROUP BY 1, 2", (sgg,)).fetchall():
        jt.setdefault(cd, []).append((jnm or "", int(n)))
    ai: dict = {}
    for cd, cls, ha in conn.execute("SELECT emd_cd, cls, sum(in_m2) / 1e4 FROM survey_parcel_ai WHERE job_id=%s AND sgg_cd=%s GROUP BY 1, 2",
                                    (job_id, sgg)).fetchall():
        ai.setdefault(cd, {})[cls] = round(float(ha or 0), 2)
    wai = {cd: int(n) for cd, n in conn.execute("SELECT emd_cd, count(DISTINCT pnu) FROM survey_parcel_ai WHERE job_id=%s AND sgg_cd=%s GROUP BY 1",
                                                 (job_id, sgg)).fetchall()}
    by: dict = {}
    for x in items:
        by.setdefault(x["emd_cd"], []).append(x)
    for cd, nm, n, ha, farm, x0, y0, x1, y1 in base:
        xs = by.get(cd, [])
        sus = {r: sum(1 for x in xs if x["rule"] == r) for r in RULE_IDS}
        pr = {k: sum(1 for x in xs if x["priority"] == k) for k in "ABC"}
        top = [{"pnu": x["pnu"], "addr": x["addr"], "rank": x["rank"], "rule": x["rule"], "evid_m2": x["evid_m2"], "priority": x["priority"]}
               for x in sorted(xs, key=lambda x: x["rank"])[:5]]
        jtop = dict(sorted(jt.get(cd, []), key=lambda kv: -kv[1])[:6])
        name = nm or cd
        conn.execute(
            "INSERT INTO survey_emd(emd_cd, tenant_id, sgg_cd, name, names, parcels, area_ha, farm_parcels, jimok_top, ai2023_in_parcels_ha, "
            "parcels_with_ai2023, suspects, suspects_total, suspect_parcels, priority, top5, bbox) "
            "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (emd_cd) DO UPDATE SET tenant_id=EXCLUDED.tenant_id, "
            "sgg_cd=EXCLUDED.sgg_cd, name=EXCLUDED.name, names=EXCLUDED.names, parcels=EXCLUDED.parcels, area_ha=EXCLUDED.area_ha, "
            "farm_parcels=EXCLUDED.farm_parcels, jimok_top=EXCLUDED.jimok_top, ai2023_in_parcels_ha=EXCLUDED.ai2023_in_parcels_ha, "
            "parcels_with_ai2023=EXCLUDED.parcels_with_ai2023, suspects=EXCLUDED.suspects, suspects_total=EXCLUDED.suspects_total, "
            "suspect_parcels=EXCLUDED.suspect_parcels, priority=EXCLUDED.priority, top5=EXCLUDED.top5, bbox=EXCLUDED.bbox",
            (cd, tenant, sgg, name, [name], int(n), round(float(ha or 0), 1), int(farm), json.dumps(jtop, ensure_ascii=False),
             json.dumps(ai.get(cd, {})), wai.get(cd, 0), json.dumps(sus), len(xs), len({x["pnu"] for x in xs}), json.dumps(pr),
             json.dumps(top, ensure_ascii=False), [x0, y0, x1, y1]))


# ─────────────────────────── AI 작업 고르기 ───────────────────────────
def pick_job(conn, sgg: str) -> str | None:
    """그 시군구에 탐지가 있는 가장 최근 완료 AI 작업(탐지 emd_cd 앞 5자리 = 시군구 코드 · 지금/옛)."""
    cs = codes(sgg)
    row = conn.execute(
        "SELECT j.id FROM jobs j WHERE j.state = 'done' AND j.kind IN ('infer','reinfer') AND NOT j.demo AND NOT coalesce(j.test, false) "
        "AND EXISTS (SELECT 1 FROM detections d WHERE d.job_id = j.id AND left(d.emd_cd, 5) = ANY(%s)) "
        "ORDER BY (SELECT count(*) FROM detections d WHERE d.job_id = j.id) DESC, j.finished_at DESC NULLS LAST LIMIT 1", (cs,)).fetchone()
    if row:
        return row[0]
    row = conn.execute("SELECT job_id FROM survey_sgg WHERE sgg_cd = %s", (sgg,)).fetchone()
    return row[0] if row and row[0] else None


def is_canon(conn, sgg: str) -> bool:
    return bool(conn.execute("SELECT EXISTS(SELECT 1 FROM survey_parcels WHERE sgg_cd = %s AND src = 'canon')", (sgg,)).fetchone()[0])


# ─────────────────────────── 전체 ───────────────────────────
def build(sgg_cd: str, ai_job_id: str | None = None, *, build_job_id: str | None = None, progress=None, force: bool = False) -> dict:
    """한 시군구 전체 — ① 필지 ② 결합 ③ 규칙·의심. 반환: survey.done counts + 단계 실측."""
    rg = region(sgg_cd)
    sgg = rg["sgg_cd"]
    tenant = tenant_for(sgg)
    T0 = time.time()
    ms: dict = {}
    with pg() as conn:
        lx_tx(conn)
        conn.execute("INSERT INTO survey_sgg(sgg_cd, tenant_id, name, sido, state, build_job_id, at) VALUES (%s,%s,%s,%s,'building',%s,now()) "
                     "ON CONFLICT (sgg_cd) DO UPDATE SET state = CASE WHEN survey_sgg.state = 'done' AND survey_sgg.parcels_src ? 'canon' "
                     "THEN 'done' ELSE 'building' END, build_job_id = EXCLUDED.build_job_id, name = EXCLUDED.name, sido = EXCLUDED.sido, error = NULL",
                     (sgg, tenant, rg["name"], rg["sido"], build_job_id))
        conn.commit()
    try:
        with pg() as conn:
            lx_tx(conn)
            canon = is_canon(conn, sgg)
            job = ai_job_id or pick_job(conn, sgg)
            # ① 필지
            have = conn.execute("SELECT count(*), min(src), min(src_as_of) FROM survey_parcels WHERE sgg_cd=%s", (sgg,)).fetchone()
            if canon or (have[0] and not force):
                ms["parcels"] = {"reused": True, "rows": int(have[0]), "src": have[1], "as_of": have[2]}
                if progress:
                    progress("parcels", int(have[0]), int(have[0]), "이미 적재")
            else:
                ms["parcels"] = load_parcels(conn, rg, tenant, progress)
            conn.commit()
            lx_tx(conn)
            src_n = {r[0]: int(r[1]) for r in conn.execute("SELECT src, count(*) FROM survey_parcels WHERE sgg_cd=%s GROUP BY 1", (sgg,)).fetchall()}
            as_of = conn.execute("SELECT max(src_as_of) FROM survey_parcels WHERE sgg_cd=%s", (sgg,)).fetchone()[0]
            bbox = conn.execute("SELECT ARRAY[ST_XMin(e), ST_YMin(e), ST_XMax(e), ST_YMax(e)] FROM (SELECT ST_Extent(geom) e FROM survey_parcels "
                                "WHERE sgg_cd=%s) q", (sgg,)).fetchone()[0]
            if not job:
                conn.execute("UPDATE survey_sgg SET state='no_ai', parcels=%s, parcels_src=%s, parcels_as_of=%s, bbox=%s, ms=%s, finished_at=now() "
                             "WHERE sgg_cd=%s", (sum(src_n.values()), json.dumps(src_n), as_of, bbox, json.dumps(ms, ensure_ascii=False), sgg))
                conn.commit()
                return {"sgg_cd": sgg, "tenant_id": tenant, "ai_job_id": None, "state": "no_ai",
                        "counts": {"parcels": sum(src_n.values()), "joined_parcels": 0, "findings": 0, "by_rule": {}, "by_priority": {}}, "ms": ms}
            # ② 결합 · 분석 범위
            ms["coverage"] = set_coverage(conn, sgg, job)
            ms["join"] = join(conn, sgg, tenant, job, progress)
            conn.commit()
            lx_tx(conn)
            # ③ 규칙
            t = time.time()
            rows = evaluate(conn, sgg, job)
            ms["rules"] = {"rows": len(rows), "rules_s": round(time.time() - t, 1)}
            if progress:
                progress("rules", len(rows), len(rows), None)
            img = IMG23 if canon else imagery_label(conn, job)       # 정본 = 적재 때 영상 표기 그대로
            if canon:
                # 정본 시군구 — 의심은 그대로, 일반 규칙 평가 결과는 회귀 대조로만
                by = {r: 0 for r in RULE_IDS}
                for r in rows:
                    by[r[0]] += 1
                cur = {r: int(n) for r, n in conn.execute(
                    "SELECT rule, count(*) FROM survey_findings WHERE sgg_cd=%s AND rule = ANY(%s) GROUP BY 1", (sgg, list(RULE_IDS))).fetchall()}
                pr = {k: int(n) for k, n in conn.execute(
                    "SELECT priority, count(*) FROM survey_findings WHERE sgg_cd=%s AND rule = ANY(%s) GROUP BY 1", (sgg, list(RULE_IDS))).fetchall()}
                ms["regression"] = {"canon": cur, "generic": by, "note": "정본 의심 유지 · 일반 규칙(단일 AI 작업) 평가는 대조로만"}
                fres = {"findings": sum(cur.values()), "by_rule": cur, "by_priority": pr, "cut": None}
            else:
                fres = findings(conn, sgg, tenant, job, rows, img)
                ms["findings"] = {k: v for k, v in fres.items() if k in ("findings_s", "stale_removed", "suspect_parcels")}
            ms["total_s"] = round(time.time() - T0, 1)
            conn.execute("UPDATE survey_sgg SET state='done', tenant_id=%s, job_id=%s, parcels=%s, parcels_src=%s, parcels_as_of=%s, joined_parcels=%s, "
                         "findings=%s, by_rule=%s, by_priority=%s, priority_cut=coalesce(%s, priority_cut), imagery=%s, bbox=%s, ms=%s, "
                         "finished_at=now() WHERE sgg_cd=%s",
                         (tenant, job, sum(src_n.values()), json.dumps(src_n), as_of, ms["join"]["joined_parcels"], fres["findings"],
                          json.dumps(fres["by_rule"]), json.dumps(fres["by_priority"]),
                          json.dumps({"A": fres["cut"]["A"], "B": fres["cut"]["B"], "scope": "sgg"}) if fres.get("cut") else None,
                          img, bbox, json.dumps(ms, ensure_ascii=False), sgg))
            conn.commit()
    except Exception as e:
        with pg() as conn:
            lx_tx(conn)
            conn.execute("UPDATE survey_sgg SET state = CASE WHEN parcels_src ? 'canon' THEN 'done' ELSE 'failed' END, error=%s, "
                         "finished_at=now() WHERE sgg_cd=%s", (f"{type(e).__name__}: {str(e)[:300]}", sgg))
            conn.commit()
        raise
    return {"sgg_cd": sgg, "tenant_id": tenant, "ai_job_id": job, "state": "done",
            "counts": {"parcels": sum(src_n.values()), "joined_parcels": ms["join"]["joined_parcels"], "findings": fres["findings"],
                       "by_rule": fres["by_rule"], "by_priority": fres["by_priority"]}, "ms": ms}


# ─────────────────────────── 읽기 도우미(API · core-fusion) ───────────────────────────
LEGACY_OF = {k: v["legacy"] for k, v in R.operand_map()["operands"].items()}


def ai_operands(conn, pnus: list[str], sgg_cd: str | None = None) -> dict[str, dict]:
    """필지 → 옛 L-*/explain 피연산자 이름(a23_* · r23_* · a25_* · chg_built_new_m2)으로 채운 dict — 전국 경로 필지만.
    conn = psycopg(동기). 정본(canon) 필지는 돌려주지 않는다(옛 열 그대로 쓰면 된다)."""
    if not pnus:
        return {}
    rows = conn.execute("SELECT DISTINCT p.sgg_cd, s.job_id FROM survey_parcels p JOIN survey_sgg s ON s.sgg_cd = p.sgg_cd "
                        "WHERE p.pnu = ANY(%s) AND p.src IS DISTINCT FROM 'canon' AND s.job_id IS NOT NULL", (list(pnus),)).fetchall()
    out: dict[str, dict] = {}
    for sgg, job in rows:
        cur = conn.execute(f"SELECT * FROM ({R.ai_src('WHERE sp.sgg_cd = %(sgg)s AND sp.pnu = ANY(%(pnus)s)')}) q",
                           {"sgg": sgg, "job": job, "pnus": list(pnus)})
        cols = [d.name for d in cur.description]
        ids = {(p, c): i for p, c, i in conn.execute("SELECT pnu, cls, ids FROM survey_parcel_ai WHERE job_id=%s AND pnu = ANY(%s)",
                                                      (job, list(pnus))).fetchall()}
        for r in cur.fetchall():
            d = dict(zip(cols, r))
            o = {LEGACY_OF[k]: d[k] for k in LEGACY_OF if k in d}
            for c in ("bld", "crop", "park", "gh"):
                o[f"a23_{c}_ids"] = ids.get((d["pnu"], c))
                o[f"r23_{c}"] = round(min((d.get(f"{c}_hit") or 0) / max(d.get("area_m2") or 1, 1), 1), 3)
            o["_job_id"] = job
            out[d["pnu"]] = o
    return out
