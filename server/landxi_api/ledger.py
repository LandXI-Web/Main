"""행정데이터(대장) 반입·융합(F3 최종 명세 §3 S-2 · F3-DIRECTION §3) — 업로드한 대장 × AI 분석 × V-World.

POST /t/{tenant}/survey/registry/import            multipart(file · kind) → 202 {import_id, rows, columns_guess, dropped}
GET  /t/{tenant}/survey/registry/{import_id}        → {columns, mapping, matched, matched_pct, by_step, unmatched[], state}
POST /t/{tenant}/survey/registry/{import_id}/confirm {mapping} → 매칭(PNU → 지번 → 좌표 → V-World) + 규칙 L-* → 202
GET  /t/{tenant}/survey/registry?latest=1           → 반입 목록(종류별 최신)
GET  /t/{tenant}/survey/registry/recent?sgg=        → 이 사람이 마지막으로 올린 대장(사람별 · 시군구별 · 올리기·결합 때 적음) · 없으면 기관 최근 대장(올린 사람 역할·날짜만)
GET  /survey/rules/ledger                           → 규칙 L-* 정의(대장 피연산자 `ledger.<kind>.<col>`)

GET  /t/{tenant}/survey/registry/{import_id}/parcels → 결합된 필지(연속지적 × AI 피연산자 · GeoJSON) — 정적 필지 층이 없는 관할의 지도·표
                                                      ?ledger=1 이면 필지마다 대장 값(상태 · 지번 · 날짜)도 — 이어 연 창이 대장 행 전체로 결합표를 만든다
GET  /t/{tenant}/survey/ledger-schema               → 이 기관 배포 카드의 대장 형식(S-6 · 기관 세션 읽기)

전국(core-fusion): 필지 색인 · 규칙 L-* 는 대장이 가리키는 시군구의 survey_parcels + survey_parcel_ai(contract-parcel-ai)를 읽는다.
그 시군구에 필지가 아직 없으면 POST /survey/build(core-survey)를 요청해 적재를 기다린 뒤 매칭한다. AI 결과가 없는 시군구는 규칙을 돌리지 않는다(ai.has=false · 정직).

원칙: 대장은 LX 가 소유하지 않는다 — 행은 기관 tenant_id(RLS) · payload = allowlist 역할 열만 · 성명·연락처 열은 이름만 기록하고 값 저장 0.
원본 파일은 확인(confirm) 전까지만 02. 데이터/_tmp/ledger/ 에 두고 매칭 뒤 지운다(24h 넘으면 청소).
숫자는 전부 봉투(매칭률 measured · 의심 inferred · 임계 estimate).
"""
from __future__ import annotations

import asyncio
import datetime as dt
import io
import json
import re
import secrets
import time
from pathlib import Path

import yaml
from fastapi import APIRouter, File, Form, Request, UploadFile
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from . import config
from .deps import ApiError, Principal, audit, db, principal, redis, require
from .envelope import KST, env, now_iso

router = APIRouter()
KINDS = {"farm_ledger": "농지대장", "dev_permit": "개발행위 허가", "public_asset": "공유재산", "river_permit": "하천 점용 허가",
         "greenhouse": "시설원예 등록"}
MAX_BYTES = 20 * 1024 * 1024
EXTS = {"xlsx", "csv", "shp", "zip", "gpkg", "geojson", "json"}
RULES_DIR = config.SERVER_ROOT / "survey" / "rules"
TMP = config.DATA_ROOT / "_tmp" / "ledger"
VW_CAP = 300                   # 한 반입의 V-World 조회 상한(일일 쿼터 보호)

# ── 열 역할(allowlist) ────────────────────────────────────────────────────────
ROLES = [  # (role, 키워드 · 앞이 우선)
    ("owner_type", ["소유구분", "소유형태", "소유자구분"]),
    ("pnu", ["pnu", "필지고유번호", "토지고유번호", "고유번호"]),
    ("jibun", ["소재지번", "소재지", "지번주소", "토지소재", "주소", "지번", "addr", "jibun", "address"]),
    ("emd", ["읍면동", "읍면", "법정동"]),
    ("ri", ["법정리", "리명"]),
    ("bon", ["본번"]),
    ("bu", ["부번"]),
    ("san", ["산여부", "대장구분", "산구분"]),
    ("status", ["경작여부", "이용현황", "경작현황", "이용상태", "경작", "현황", "상태", "status"]),
    ("use", ["작물", "품목", "시설종류", "용도", "use", "crop"]),
    ("date", ["허가일", "신고일", "기준일", "등록일", "일자", "날짜", "date"]),
    ("area", ["면적", "area"]),
    ("permit_no", ["허가번호", "관리번호", "등록번호", "permit"]),
    ("lon", ["경도", "lon", "lng", "x좌표"]),
    ("lat", ["위도", "lat", "y좌표"]),
]
PII = ["성명", "이름", "소유자", "소유주", "대표자", "신청인", "연락처", "전화", "휴대", "주민", "생년", "이메일", "email", "name", "phone", "owner"]


def _norm(s: str) -> str:
    return re.sub(r"[\s_\-()\[\]·./]", "", str(s or "")).lower()


def guess_role(col: str) -> str | None:
    n = _norm(col)
    for role, kws in ROLES:
        if any(_norm(k) == n for k in kws):
            return role
    if any(_norm(k) in n for k in PII) and not any(_norm(k) in n for k in ROLES[0][1]):
        return "pii"
    for role, kws in ROLES:
        if any(_norm(k) in n for k in kws if len(_norm(k)) >= 2):
            return role
    return None


def is_pii(col: str) -> bool:
    return guess_role(col) == "pii"


# ── 파일 읽기(스레드) ─────────────────────────────────────────────────────────
def read_table(raw: bytes, ext: str) -> tuple[list[str], list[dict], list | None]:
    """→ (열, 행 dict 목록, 도형 대표점 목록 | None). 값은 문자열(숫자 원형 보존)."""
    import pandas as pd
    pts = None
    if ext == "csv":
        for enc in ("utf-8-sig", "cp949", "euc-kr"):
            try:
                df = pd.read_csv(io.BytesIO(raw), dtype=str, encoding=enc, keep_default_na=False)
                break
            except UnicodeDecodeError:
                continue
        else:
            raise ApiError("bad_request", "CSV 글자 인코딩을 읽을 수 없습니다(UTF-8 · CP949)")
    elif ext == "xlsx":
        df = pd.read_excel(io.BytesIO(raw), dtype=str, engine="openpyxl").fillna("")
    else:
        import tempfile
        import zipfile

        import pyogrio
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / f"in.{ext}"
            p.write_bytes(raw)
            if ext == "zip":
                with zipfile.ZipFile(p) as z:
                    z.extractall(d)
                shp = next(iter(sorted(Path(d).rglob("*.shp"))), None) or next(iter(sorted(Path(d).rglob("*.gpkg"))), None)
                if not shp:
                    raise ApiError("bad_request", "ZIP 안에 SHP·GPKG 가 없습니다")
                p = shp
            gdf = pyogrio.read_dataframe(p, encoding="cp949" if p.suffix == ".shp" and not (p.with_suffix(".cpg")).exists() else None)
        if gdf.crs is not None and gdf.crs.to_epsg() != 4326:
            gdf = gdf.to_crs(4326)
        pts = [(g.representative_point().x, g.representative_point().y) if g is not None and not g.is_empty else None for g in gdf.geometry]
        df = pd.DataFrame(gdf.drop(columns=gdf.geometry.name)).astype(str).replace({"None": "", "nan": ""})
    cols = [str(c) for c in df.columns]
    rows = [{str(k): ("" if v is None else str(v)).strip() for k, v in r.items()} for r in df.to_dict(orient="records")]
    return cols, rows, pts


# ── 규칙 L-* ─────────────────────────────────────────────────────────────────
_rules_cache: dict = {"t": 0.0, "rules": {}}


def ledger_rules() -> dict[str, dict]:
    if time.time() - _rules_cache["t"] > 30:
        out = {}
        for p in sorted(RULES_DIR.glob("L*.yaml")):
            d = yaml.safe_load(p.read_text(encoding="utf-8"))
            out[d["id"]] = d
        _rules_cache.update(t=time.time(), rules=out)
    return _rules_cache["rules"]


def rule_ids() -> list[str]:
    return list(ledger_rules())


def condition_text(d: dict, th: dict | None = None) -> str:
    t = {**(d.get("thresholds") or {}), **(th or {})}
    try:
        return d["condition"].format(**t)
    except Exception:
        return d["condition"]


AI_CLS = {"bld": ("건물", "a23_bld_in_m2", "a23_bld_conf", "r23_bld"), "crop": ("경작지", "a23_crop_in_m2", "a23_crop_conf", "r23_crop"),
          "gh": ("비닐하우스", "a23_gh_in_m2", "a23_gh_conf", "r23_gh"), "park": ("주차장", "a23_park_in_m2", "a23_park_conf", "r23_park")}


def _operand(ref: str, ledger: dict[str, dict], parcel: dict, th: dict):
    if isinstance(ref, dict) and "th" in ref:
        return th.get(ref["th"])
    if not isinstance(ref, str):
        return ref
    if ref.startswith("ledger."):
        _, kind, col = ref.split(".", 2)
        row = ledger.get(kind)
        if row is None:
            return None
        return True if col == "row" else row.get(col)
    if ref.startswith("ai.") and ref.count(".") == 2:          # 일반 피연산자 ai.<cls>.<in_m2|hit_m2|n|conf> · ai.ratio.<cls|farm>
        _, a, b = ref.split(".")
        if a == "ratio":
            return parcel.get(f"r23_{b}")
        col = {"in_m2": f"a23_{a}_in_m2", "hit_m2": f"a23_{a}_m2", "n": f"a23_{a}_n", "conf": f"a23_{a}_conf"}.get(b)
        return parcel.get(col) if col else None
    if ref.startswith("ai.") or ref.startswith("parcel."):
        return parcel.get(ref.split(".", 1)[1])
    return ref


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def eval_cond(c: dict, ledger: dict, parcel: dict, th: dict) -> bool:
    if "all" in c:
        return all(eval_cond(x, ledger, parcel, th) for x in c["all"])
    if "any" in c:
        return any(eval_cond(x, ledger, parcel, th) for x in c["any"])
    op = c["op"]
    a = _operand(c.get("left"), ledger, parcel, th)
    b = _operand(c.get("right"), ledger, parcel, th)
    if op == "exists":
        return a not in (None, "")
    if op == "missing":
        return a in (None, "")
    if op in ("in", "nin"):
        hit = a is not None and str(a) in [str(x) for x in (b or [])]
        return hit if op == "in" else not hit
    if op == "contains_any":
        return a is not None and any(str(x) in str(a) for x in (b or []))
    if op == "eq":
        return str(a) == str(b)
    if op == "ne":
        return str(a) != str(b)
    x, y = _num(a), _num(b)
    if x is None or y is None:
        return False
    return {"gte": x >= y, "gt": x > y, "lte": x <= y, "lt": x < y}[op]


def score_of(d: dict, parcel: dict) -> tuple[float, float | None, float | None]:
    cls = (d.get("evidence") or {}).get("ai", "bld")
    _, a_col, c_col, r_col = AI_CLS.get(cls, AI_CLS["bld"])
    evid = parcel.get(a_col)
    conf = parcel.get(c_col)
    ratio = parcel.get(r_col) or 0
    s = float(d.get("base_score", 30)) + 30 * min(1.0, float(ratio or 0)) + 20 * float(conf if conf is not None else 0.5)
    if cls == "crop":                   # 경작 흔적 '없음' 규칙 — 비율이 낮을수록 강한 근거
        s = float(d.get("base_score", 30)) + 30 * (1 - min(1.0, float(ratio or 0))) + 10
    return round(s, 1), evid, conf


def priority_of(score: float) -> str:
    return "A" if score >= 80 else "B" if score >= 60 else "C"


# ── 매칭 사다리 ──────────────────────────────────────────────────────────────
JIBUN_RX = re.compile(r"(산)?\s*(\d{1,4})(?:\s*-\s*(\d{1,4}))?\s*(번지)?\s*$")


def parse_jibun(s: str) -> dict | None:
    """'○○도 ○○시 ○○면 ○○리 산 12-3' → {emd, ri, san, bon, bu}."""
    s = re.sub(r"\s+", " ", str(s or "")).strip()
    m = JIBUN_RX.search(s)
    if not m:
        return None
    head = s[: m.start()].strip().split()
    emd = next((w for w in reversed(head) if re.search(r"(읍|면|동|가)$", w)), None)
    ri = next((w for w in reversed(head) if re.search(r"리$", w) and w != emd), None)
    san = bool(m.group(1)) or (len(head) > 0 and head[-1] == "산")
    return {"emd": emd, "ri": ri, "san": san, "bon": int(m.group(2)), "bu": int(m.group(3) or 0)}


def cur_code(c5: str) -> str:
    """시군구 코드(옛/새) → 지금 코드(contract-parcel-ai §1 · PNU 는 지금 코드로 저장)."""
    try:
        from .regions import region_of
        r = region_of(c5)
        return r["sgg_cd"] if r else c5
    except Exception:
        return c5


def canon_pnu(pnu: str) -> str:
    return cur_code(pnu[:5]) + pnu[5:] if len(pnu) == 19 else pnu


class ParcelIndex:
    """관할 안 연속지적 색인(PNU 집합 · (읍면동, 리) → PNU 앞 10자리) — 프로세스 캐시 10분(적재 뒤 clear)."""
    _c: dict = {}

    @classmethod
    def clear(cls):
        cls._c.clear()

    @classmethod
    async def get(cls, prefixes: list[str] | None) -> "ParcelIndex":
        key = ",".join(prefixes or ["*"])
        c = cls._c.get(key)
        if c and time.time() - c[0] < 600:
            return c[1]
        async with db(realm="lx") as conn:
            if prefixes:
                pat = [p + "%" for p in prefixes]
                pn = await conn.fetch("SELECT pnu FROM survey_parcels WHERE pnu LIKE ANY($1::text[])", pat)
                ri = await conn.fetch("SELECT DISTINCT emd, ri, substr(pnu,1,10) p10 FROM survey_parcels WHERE pnu LIKE ANY($1::text[])", pat)
            else:
                pn = await conn.fetch("SELECT pnu FROM survey_parcels")
                ri = await conn.fetch("SELECT DISTINCT emd, ri, substr(pnu,1,10) p10 FROM survey_parcels")
        ix = cls()
        ix.pnus = {r["pnu"] for r in pn}
        ix.ri = {}
        for r in ri:
            ix.ri.setdefault((r["emd"] or "", r["ri"] or ""), r["p10"])
            ix.ri.setdefault(("", r["ri"] or ""), r["p10"])          # 리 이름만(읍면동 없이) — 중복이면 먼저 온 것(아래에서 모호 판정)
        ix.ri_amb = {}
        for r in ri:
            ix.ri_amb.setdefault(r["ri"] or "", set()).add(r["p10"])
        cls._c[key] = (time.time(), ix)
        return ix

    def from_jibun(self, j: dict) -> tuple[str | None, str | None]:
        if not j:
            return None, "지번을 읽을 수 없음"
        p10 = None
        if j.get("emd"):
            p10 = self.ri.get((j["emd"], j.get("ri") or ""))
        if not p10 and j.get("ri"):
            cands = self.ri_amb.get(j["ri"], set())
            if len(cands) == 1:
                p10 = next(iter(cands))
            elif len(cands) > 1:
                return None, "같은 이름의 리가 여럿(읍면동 필요)"
        if not p10:
            return None, "관할 연속지적에 없는 읍면동·리"
        pnu = f"{p10}{'2' if j['san'] else '1'}{j['bon']:04d}{j['bu']:04d}"
        return (pnu, None) if pnu in self.pnus else (None, "지번이 연속지적에 없음")


async def _vworld_point(c, key: str, dom: str, lon: float, lat: float) -> str | None:
    r = await c.get("https://api.vworld.kr/req/data", params={
        "service": "data", "request": "GetFeature", "data": "LP_PA_CBND_BUBUN", "key": key, "domain": dom, "geometry": "false",
        "attribute": "true", "format": "json", "crs": "EPSG:4326", "size": 1, "geomFilter": f"POINT({lon} {lat})"})
    j = r.json().get("response", {})
    if j.get("status") != "OK":
        return None
    fs = j["result"]["featureCollection"]["features"]
    return fs[0]["properties"].get("pnu") if fs else None


async def _vworld_search(c, key: str, dom: str, q: str) -> tuple[float, float] | None:
    r = await c.get("https://api.vworld.kr/req/search", params={
        "service": "search", "request": "search", "version": "2.0", "type": "address", "category": "parcel", "query": q, "key": key,
        "domain": dom, "format": "json", "size": 1, "crs": "EPSG:4326"})
    j = r.json().get("response", {})
    if j.get("status") != "OK":
        return None
    it = (j.get("result") or {}).get("items") or []
    if not it:
        return None
    p = it[0].get("point") or {}
    return float(p["x"]), float(p["y"])


async def _vworld_pnu(c, key: str, dom: str, pnu: str) -> bool:
    r = await c.get("https://api.vworld.kr/req/data", params={
        "service": "data", "request": "GetFeature", "data": "LP_PA_CBND_BUBUN", "key": key, "domain": dom, "geometry": "false",
        "attribute": "true", "format": "json", "size": 1, "attrFilter": f"pnu:=:{pnu}"})
    j = r.json().get("response", {})
    return j.get("status") == "OK" and bool(j["result"]["featureCollection"]["features"])


# ── 접근 ────────────────────────────────────────────────────────────────────
def _gate(p: Principal, tenant: str, write: bool = False) -> Principal:
    require(p)
    if p.realm == "tenant":
        if p.tenant_id != tenant:
            raise ApiError("forbidden", "이 기관의 데이터가 아닙니다")
        if write and p.role != "manager":
            raise ApiError("forbidden", "기관 담당자(manager)만 대장을 올릴 수 있습니다")
    elif p.realm == "lx":
        if write and p.role not in ("staff", "admin"):
            raise ApiError("forbidden", "LX 영업 계정은 읽기 전용")
    return p


async def _tenant_exists(tenant: str):
    async with db(realm="lx") as conn:
        if not await conn.fetchval("SELECT 1 FROM tenants WHERE id=$1", tenant):
            raise ApiError("not_found", "해당 기관이 없습니다")


def _ulid() -> str:
    from .jobs import ulid
    return ulid()


def _tmp_path(import_id: str) -> Path:
    return TMP / f"{import_id}.bin"


def _clean_tmp():
    try:
        for p in TMP.glob("*.bin"):
            if time.time() - p.stat().st_mtime > 86400:
                p.unlink(missing_ok=True)
    except Exception:
        pass


# ── 라우트 ──────────────────────────────────────────────────────────────────
@router.post("/t/{tenant}/survey/registry/import", status_code=202)
async def import_ledger(tenant: str, request: Request, file: UploadFile = File(...), kind: str = Form("farm_ledger")):
    p = _gate(principal(request), tenant, write=True)
    await _tenant_exists(tenant)
    if kind not in KINDS:
        raise ApiError("bad_request", "대장 종류를 고르세요", {"allowed": list(KINDS)})
    name = file.filename or "upload"
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if ext not in EXTS:
        raise ApiError("bad_request", "XLSX · CSV · SHP · GPKG 만 올릴 수 있습니다", {"allowed": sorted(EXTS)})
    raw = await file.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise ApiError("bad_request", "20MB까지 올릴 수 있습니다", status=413)
    if ext == "json":
        ext = "geojson"
    try:
        cols, rows, pts = await run_in_threadpool(read_table, raw, ext)
    except ApiError:
        raise
    except Exception as e:
        raise ApiError("bad_request", "파일을 읽을 수 없습니다", {"error": type(e).__name__})
    if not rows:
        raise ApiError("bad_request", "행이 없습니다")
    guess, dropped = {}, []
    for c in cols:
        g = guess_role(c)
        if g == "pii":
            dropped.append(c)
        elif g:
            guess[c] = g
    if pts is not None:
        guess["__geometry__"] = "geom"
    mapping = {}
    for c, role in guess.items():
        mapping.setdefault(role, c)
    iid = "imp_" + _ulid()
    TMP.mkdir(parents=True, exist_ok=True)
    _clean_tmp()
    _tmp_path(iid).write_bytes(ext.encode() + b"\n" + raw)
    async with db(p) if p.realm == "tenant" else db(realm="lx") as conn:
        await conn.execute("INSERT INTO ledger_imports(id, tenant_id, kind, filename, fmt, bytes, rows, columns, columns_guess, dropped, mapping, "
                           "state, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'uploaded',$12)",
                           iid, tenant, kind, name[:200], ext, len(raw), len(rows), [c for c in cols if c not in dropped], guess, dropped,
                           mapping, p.user_id)
        await audit(conn, p, "ledger.import", iid, None, {"tenant": tenant, "kind": kind, "rows": len(rows), "dropped": dropped, "fmt": ext})
    sample = [{c: r.get(c) for c in cols if c not in dropped} for r in rows[:5]]
    return JSONResponse(content=_j({"import_id": iid, "kind": kind, "kind_label": KINDS[kind], "state": "uploaded",
                                    "rows": env(len(rows), "count", "recorded", "대장 파일 행"),
                                    "rejected": env(0, "count", "recorded", "읽기 실패 행"),
                                    "columns": [c for c in cols if c not in dropped], "columns_guess": guess, "mapping": mapping,
                                    "dropped": dropped, "sample": sample, "has_geometry": pts is not None,
                                    "needs": _needs(mapping), "as_of": now_iso()}), status_code=202)


def _j(o):
    return json.loads(json.dumps(o, ensure_ascii=False, default=str))


def _needs(mapping: dict) -> list[str]:
    """매칭에 필요한 열 중 빠진 것(확인 표가 묻는다)."""
    if any(k in mapping for k in ("pnu", "jibun", "geom")) or ("lon" in mapping and "lat" in mapping) or ("bon" in mapping and ("ri" in mapping or "emd" in mapping)):
        return []
    return ["pnu|jibun"]


async def _live_findings(conn, ids: list[str]) -> dict[str, dict[str, int]]:
    """반입별 규칙 L-* 의심 수 — survey_findings 실시간 집계(한 출처 · 저장된 stats.findings 는 '어떤 규칙을 돌렸나'만 쓴다)."""
    if not ids:
        return {}
    out: dict[str, dict[str, int]] = {}
    for x in await conn.fetch("SELECT import_id, rule, count(*) n FROM survey_findings WHERE import_id = ANY($1::text[]) GROUP BY 1, 2", ids):
        out.setdefault(x["import_id"], {})[x["rule"]] = int(x["n"])
    return out


def _sgg_name(cd: str) -> str | None:
    try:
        from .regions import region_of
        return (region_of(cd) or {}).get("name")
    except Exception:
        return None


def _import_view(r, unmatched: list | None = None, live: dict | None = None) -> dict:
    st = dict(r["stats"] or {})
    if st and live is not None:                    # 의심 수 = 지금 survey_findings 에 있는 것(다른 반입·재평가가 지운 뒤 낡은 숫자 0)
        got = live.get(r["id"]) or {}
        st["findings"] = {k: int(got.get(k, 0)) for k in sorted(set(st.get("findings") or {}) | set(got))}
    out = {"import_id": r["id"], "tenant_id": r["tenant_id"], "kind": r["kind"], "kind_label": KINDS.get(r["kind"]), "filename": r["filename"],
           "state": r["state"], "latest": r["latest"], "columns": r["columns"] or [], "columns_guess": r["columns_guess"] or {},
           "mapping": r["mapping"] or {}, "dropped": r["dropped"] or [], "needs": _needs(r["mapping"] or {}),
           "rows": env(r["rows"], "count", "recorded", "대장 파일 행"),
           "created_at": r["created_at"].astimezone(KST).isoformat(timespec="seconds") if r["created_at"] else None,
           "confirmed_at": r["confirmed_at"].astimezone(KST).isoformat(timespec="seconds") if r["confirmed_at"] else None,
           "error": r["error"]}
    at = out["confirmed_at"] or out["created_at"]
    src = "대장 × 연속지적 매칭"
    if st:
        out["matched"] = env(st.get("matched"), "count", "measured", src, as_of=at)
        out["matched_pct"] = env(st.get("matched_pct"), "%", "measured", src, as_of=at)
        out["by_step"] = {k: env(v, "count", "measured", src, as_of=at) for k, v in (st.get("by_step") or {}).items()}
        out["unmatched_n"] = env(st.get("unmatched"), "count", "measured", src, as_of=at)
        out["findings"] = {k: env(v, "count", "inferred", "대장 대조 · 검수 전", as_of=at) for k, v in (st.get("findings") or {}).items()}
        if st.get("skipped"):
            out["skipped"] = st["skipped"]
        if st.get("sgg"):
            out["sgg"] = [{"sgg_cd": c, "name": _sgg_name(c)} for c in st["sgg"]]
        if isinstance(st.get("ai"), dict):
            a = st["ai"]
            out["ai"] = {"has": bool(a.get("has")),
                         "parcels": env(int(a.get("parcels") or 0), "필지", "measured", "대장 필지 × AI 분석 결합", as_of=at),
                         "sgg": [{"sgg_cd": c, "name": _sgg_name(c), "state": v.get("state"), "year": v.get("year"),
                                            "outside": env(v.get("outside"), "필지", "measured", "영상 범위 밖 대장 필지(판정 안 함)")} for c, v in (a.get("sgg") or {}).items()]}
    if unmatched is not None:
        out["unmatched"] = unmatched
    return out


async def _get_import(p: Principal, tenant: str, iid: str):
    async with db(p) as conn:
        r = await conn.fetchrow("SELECT * FROM ledger_imports WHERE id=$1 AND tenant_id=$2", iid, tenant)
    if not r:
        raise ApiError("not_found", "반입 기록이 없습니다")
    return r


@router.get("/t/{tenant}/survey/registry")
async def list_imports(tenant: str, request: Request, latest: int | None = None, kind: str | None = None):
    p = _gate(principal(request), tenant)
    async with db(p) as conn:
        rows = await conn.fetch("SELECT * FROM ledger_imports WHERE tenant_id=$1 AND ($2::text IS NULL OR kind=$2) "
                                "AND (NOT $3 OR latest) ORDER BY created_at DESC LIMIT 50", tenant, kind, bool(latest))
        live = await _live_findings(conn, [r["id"] for r in rows])
    return {"items": [_import_view(r, live=live) for r in rows], "kinds": KINDS, "as_of": now_iso()}


# ── 사람별 · 기관별 최근 대장(r3-fusion M6) ─────────────────────────────────
RECENT_STATES = ("matched", "matching")
ROLE_KO = {("tenant", "manager"): "기관 담당자", ("tenant", "viewer"): "기관 열람자", ("lx", "staff"): "LX 직원", ("lx", "admin"): "LX 관리자"}


async def remember(conn, tenant: str, user_id: str | None, import_id: str, kind: str, sggs: list[str] | None = None) -> None:
    """(기관, 사람, 시군구, 종류) → 최근 반입. sgg '*' = 시군구와 무관한 그 사람의 가장 최근 대장. 표가 없으면(마이그레이션 전) 건너뛴다."""
    if not user_id or not import_id:
        return
    if not await conn.fetchval("SELECT to_regclass('ledger_recent') IS NOT NULL"):
        return
    for sg in dict.fromkeys(["*", *[cur_code(str(x)) for x in (sggs or []) if x]]):
        await conn.execute("INSERT INTO ledger_recent(tenant_id, user_id, sgg_cd, kind, import_id, at) VALUES ($1,$2,$3,$4,$5,now()) "
                           "ON CONFLICT (tenant_id, user_id, sgg_cd, kind) DO UPDATE SET import_id=EXCLUDED.import_id, at=now()",
                           tenant, user_id, sg, kind, import_id)


def pick_recent(mine: list[dict], org: list[dict], sgg: str | None = None, own: list[dict] | None = None) -> tuple[dict | None, str | None]:
    """이어 열 대장 고르기(순수 함수 · 시험 대상).
    mine = 이 사람의 기억 행 [{import_id, sgg_cd, at, state}] · org = 기관의 결합된 반입 [{import_id, latest, sgg:[코드], created_at, state}]
    · own = 이 사람이 직접 올린 결합된 반입(org 와 같은 모양).
    ① 이 사람의 그 시군구 기억 → ② (시군구를 말하지 않았으면) 이 사람의 '*' 기억 → ③ 기억이 비었으면(지운 대장 · 옛 기억 없음)
    이 사람이 직접 올린 가장 최근 결합 대장 → ④ 그래도 없을 때만 기관 최근 대장(그 시군구를 덮는 것 · latest 먼저).
    이 사람 기억이 가리키는 반입이 지워졌거나 실패했으면 건너뛴다. → (행, 'mine'|'org'|None)"""
    ok = [m for m in mine if m.get("state") in RECENT_STATES]
    key = lambda m: str(m.get("at") or "")  # noqa: E731
    if sgg:
        hit = sorted([m for m in ok if m.get("sgg_cd") == sgg], key=key, reverse=True)
    else:
        hit = sorted([m for m in ok if m.get("sgg_cd") == "*"], key=key, reverse=True) or sorted(ok, key=key, reverse=True)
    if hit:
        return hit[0], "mine"
    cover = lambda o: o.get("state") == "matched" and (not sgg or sgg in (o.get("sgg") or []))  # noqa: E731
    mine_up = sorted([o for o in (own or []) if cover(o)], key=lambda o: str(o.get("created_at") or ""), reverse=True)
    if mine_up:
        return mine_up[0], "mine"                          # 내 기억이 비어도 내가 올린 대장이 남아 있으면 남의 대장보다 먼저
    cand = [o for o in org if o.get("state") == "matched" and (not sgg or sgg in (o.get("sgg") or []))]
    cand.sort(key=lambda o: (bool(o.get("latest")), str(o.get("created_at") or "")), reverse=True)
    return (cand[0], "org") if cand else (None, None)


async def _uploader(conn, r) -> dict:
    """올린 사람 표기 — 역할 · 날짜만(이름 없이)."""
    uid = r["created_by"]
    role = None
    if uid:
        t = await conn.fetchval("SELECT role FROM tenant_users WHERE id=$1", uid)
        role = ROLE_KO.get(("tenant", t)) if t else ROLE_KO.get(("lx", await conn.fetchval("SELECT role FROM lx_users WHERE id=$1", uid) or ""))
    at = r["confirmed_at"] or r["created_at"]
    return {"role": role or "기관 담당자", "date": at.astimezone(KST).date().isoformat() if at else None}


@router.get("/t/{tenant}/survey/registry/recent")
async def recent_import(tenant: str, request: Request, sgg: str | None = None, kind: str | None = None):
    """이어 열 대장 — 이 사람이 마지막으로 연(올린) 대장이 먼저. 없을 때만 기관 최근 대장(올린 사람 역할·날짜만).
    → {import(상세 · 미결합 포함) | null, whose: mine|org|null, uploader{role, date} | null}"""
    p = _gate(principal(request), tenant)
    sg = cur_code(str(sgg)) if sgg else None
    async with db(realm="lx") as conn:
        mine = []
        if await conn.fetchval("SELECT to_regclass('ledger_recent') IS NOT NULL"):
            mine = [dict(x) for x in await conn.fetch(
                "SELECT r.import_id, r.sgg_cd, r.at, i.state FROM ledger_recent r JOIN ledger_imports i ON i.id=r.import_id AND i.tenant_id=r.tenant_id "
                "WHERE r.tenant_id=$1 AND r.user_id=$2 AND ($3::text IS NULL OR r.kind=$3)", tenant, p.user_id, kind)]
        def _row(x):
            st = x["stats"] or {}
            return {"import_id": x["id"], "latest": x["latest"], "sgg": [cur_code(str(c)) for c in (st.get("sgg") or [])],
                    "created_at": x["created_at"].isoformat() if x["created_at"] else "", "state": x["state"]}
        org = [_row(x) for x in await conn.fetch("SELECT id, latest, stats, created_at, state FROM ledger_imports WHERE tenant_id=$1 AND state='matched' "
                                                 "AND ($2::text IS NULL OR kind=$2) ORDER BY created_at DESC LIMIT 50", tenant, kind)]
        own = [_row(x) for x in await conn.fetch("SELECT id, latest, stats, created_at, state FROM ledger_imports WHERE tenant_id=$1 AND state='matched' "
                                                 "AND created_by=$3 AND ($2::text IS NULL OR kind=$2) ORDER BY created_at DESC LIMIT 50",
                                                 tenant, kind, p.user_id)] if p.user_id else []
        got, whose = pick_recent(mine, org, sg, own)
        r = await conn.fetchrow("SELECT * FROM ledger_imports WHERE id=$1 AND tenant_id=$2", got["import_id"], tenant) if got else None
        if not r:
            return {"import": None, "whose": None, "uploader": None, "as_of": now_iso()}
        um = await conn.fetch("SELECT row_no, reason, payload FROM registry_snapshots WHERE import_id=$1 AND match_step='none' ORDER BY row_no LIMIT 1000",
                              r["id"])
        live = await _live_findings(conn, [r["id"]])
        up = await _uploader(conn, r) if r["created_by"] != p.user_id else None          # 남이 올린 대장이면 역할 · 날짜(이름 없이)
    unmatched = [{"seq": x["row_no"], "reason": x["reason"], "jibun": (x["payload"] or {}).get("jibun"), "pnu": (x["payload"] or {}).get("pnu")} for x in um]
    return {"import": _import_view(r, unmatched, live), "whose": whose, "uploader": up, "as_of": now_iso()}


@router.get("/t/{tenant}/survey/ledger-schema")
async def ledger_schema(tenant: str, request: Request):
    """이 기관 배포 카드의 대장 형식(S-6 `ledger_schema`) — 기관 세션이 읽는 경로(카드 목록은 LX 전용이라 여기서 기관 것만).
    parcel_tiles = 이 관할의 정적 필지 층(PMTiles)이 있으면 그 주소(화면이 없는 파일을 두드리지 않게 · 콘솔 404 0)."""
    p = _gate(principal(request), tenant)
    async with db(realm="lx") as conn:
        rows = await conn.fetch("SELECT DISTINCT c.id, c.ledger_schema FROM deploys d JOIN cards c ON c.id = d.card_id "
                                "WHERE d.tenant_id=$1 AND c.ledger_schema IS NOT NULL AND NOT coalesce(d.test,false) ORDER BY c.id", tenant)
    items = [{"card_id": r["id"], "ledger_schema": r["ledger_schema"]} for r in rows]
    kinds = []
    for it in items:
        k = (it["ledger_schema"] or {}).get("kind") if isinstance(it["ledger_schema"], dict) else None
        if k and k not in kinds:
            kinds.append(k)
    tiles = config.DATA_ROOT / "survey" / f"{tenant}-parcel-survey.pmtiles"      # 정적 필지 층(있는 관할만) — 없으면 서버 필지(…/parcels)
    return {"items": items, "kinds": kinds, "labels": {k: KINDS.get(k) for k in kinds},
            "parcel_tiles": f"/landxi/data/survey/{tenant}-parcel-survey.pmtiles" if tiles.exists() else None, "as_of": now_iso()}


@router.get("/t/{tenant}/survey/registry/{import_id}/parcels")
async def import_parcels(tenant: str, import_id: str, request: Request, geom: int = 1, limit: int = 20000, ledger: int = 0):
    """결합된 대장 필지(연속지적 × AI 피연산자) — 정적 필지 층(PMTiles)이 없는 관할의 지도 채색 · 표 · 필지 카드용.
    properties = pnu · jimok · yongdo · nongup · area_m2 · bld_m2 · crop_m2 · park_m2 · gh_m2 · r23_farm · ai(분석 여부) · addr.
    AI 값은 규칙과 같은 출처(ai_parcels) — 큰 숫자 · 지도 · 표 · 말 질의가 한 숫자."""
    p = _gate(principal(request), tenant)
    await _get_import(p, tenant, import_id)
    limit = max(1, min(int(limit), 50000))
    async with db(realm="lx") as conn:
        pn = [r["pnu"] for r in await conn.fetch("SELECT DISTINCT pnu FROM registry_snapshots WHERE import_id=$1 AND tenant_id=$2 AND pnu IS NOT NULL LIMIT $3",
                                                  import_id, tenant, limit)]
        ai_rows, ai = await ai_parcels(conn, pn)
        g = {}
        if geom and pn:
            g = {r["pnu"]: r["g"] for r in await conn.fetch(
                "SELECT pnu, ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, 0.000004), 6) g FROM survey_parcels WHERE pnu = ANY($1::text[])", pn)}
        base = {r["pnu"]: dict(r) for r in await conn.fetch(
            "SELECT pnu, jimok, jimok_nm, yongdo, nongup, area_m2, addr, ST_XMin(geom) x0, ST_YMin(geom) y0, ST_XMax(geom) x1, ST_YMax(geom) y1 "
            "FROM survey_parcels WHERE pnu = ANY($1::text[])", pn)}
        led = {}
        if ledger and pn:                                  # 대장 값(allowlist 역할 열만 · 성명 0) — 같은 필지가 여러 행이면 첫 행
            for x in await conn.fetch("SELECT DISTINCT ON (pnu) pnu, payload FROM registry_snapshots WHERE import_id=$1 AND tenant_id=$2 "
                                      "AND pnu = ANY($3::text[]) ORDER BY pnu, row_no", import_id, tenant, pn):
                pay = x["payload"] or {}
                led[x["pnu"]] = {k: pay.get(k) for k in ("status", "jibun", "date", "use") if pay.get(k) not in (None, "")}
    feats = []
    for k in pn:
        b = base.get(k)
        if not b:
            continue
        a = ai_rows.get(k)
        props = {"pnu": k, "jimok": b["jimok"], "yongdo": b["yongdo"] or "", "nongup": b["nongup"] or "", "area_m2": round(float(b["area_m2"] or 0), 1),
                 "addr": b["addr"], "bbox": [round(b["x0"], 7), round(b["y0"], 7), round(b["x1"], 7), round(b["y1"], 7)], "ai": 1 if a else 0}
        if ledger:
            props["ledger"] = led.get(k) or {}
        if a:
            props.update({"bld_m2": round(float(a.get("a23_bld_m2") or 0), 1), "crop_m2": round(float(a.get("a23_crop_m2") or 0), 1),
                          "park_m2": round(float(a.get("a23_park_m2") or 0), 1), "gh_m2": round(float(a.get("a23_gh_m2") or 0), 1),
                          "r23_farm": round(float(a.get("r23_farm") or 0), 3)})
        f = {"type": "Feature", "id": k, "properties": props, "geometry": json.loads(g[k]) if g.get(k) else None}
        feats.append(f)
    return JSONResponse(content=_j({"type": "FeatureCollection", "features": feats, "import_id": import_id,
                                    "ai": {"has": bool(ai.get("has")), "parcels": env(ai.get("parcels"), "필지", "measured", "대장 필지 × AI 분석 결합"),
                                           "sgg": [{"sgg_cd": c, "name": _sgg_name(c), "state": v.get("state"), "year": v.get("year"),
                                            "outside": env(v.get("outside"), "필지", "measured", "영상 범위 밖 대장 필지(판정 안 함)")}
                                                   for c, v in (ai.get("sgg") or {}).items()]},
                                    "count": env(len(feats), "필지", "measured", "대장 × 연속지적 결합"), "as_of": now_iso()}))


@router.get("/t/{tenant}/survey/registry/{import_id}")
async def get_import(tenant: str, import_id: str, request: Request, limit: int = 200):
    p = _gate(principal(request), tenant)
    r = await _get_import(p, tenant, import_id)
    async with db(p) as conn:
        um = await conn.fetch("SELECT row_no, reason, payload FROM registry_snapshots WHERE import_id=$1 AND match_step='none' ORDER BY row_no LIMIT $2",
                              import_id, max(1, min(limit, 1000)))
        live = await _live_findings(conn, [import_id])
    unmatched = [{"seq": x["row_no"], "reason": x["reason"], "jibun": (x["payload"] or {}).get("jibun"), "pnu": (x["payload"] or {}).get("pnu")}
                 for x in um]
    return _import_view(r, unmatched, live)


@router.post("/t/{tenant}/survey/registry/{import_id}/confirm", status_code=202)
async def confirm_import(tenant: str, import_id: str, request: Request, body: dict | None = None):
    p = _gate(principal(request), tenant, write=True)
    r = await _get_import(p, tenant, import_id)
    if r["state"] == "matching":
        raise ApiError("conflict", "매칭 중입니다", status=409)
    mapping = dict((body or {}).get("mapping") or r["mapping"] or {})
    cols = set(r["columns"] or []) | {"__geometry__"}
    bad = [c for c in mapping.values() if c not in cols]
    if bad:
        raise ApiError("bad_request", "파일에 없는 열입니다", {"columns": bad})
    pii = [c for c in mapping.values() if is_pii(c) or c in (r["dropped"] or [])]
    if pii:
        raise ApiError("bad_request", "성명·연락처 열은 쓸 수 없습니다", {"columns": pii})
    unknown = [k for k in mapping if k not in {x[0] for x in ROLES} | {"geom"}]
    if unknown:
        raise ApiError("bad_request", "알 수 없는 역할", {"roles": unknown, "allowed": [x[0] for x in ROLES] + ["geom"]})
    if _needs(mapping):
        raise ApiError("bad_request", "필지를 찾을 열(PNU 또는 지번)을 골라 주세요", {"needs": _needs(mapping)})
    if not _tmp_path(import_id).exists():
        raise ApiError("conflict", "원본 파일이 만료되었습니다 — 다시 올려 주세요", status=409)
    async with db(p) as conn:
        await conn.execute("UPDATE ledger_imports SET mapping=$2, state='matching', error=NULL WHERE id=$1", import_id, mapping)
    async with db(realm="lx") as conn:
        await remember(conn, tenant, p.user_id, import_id, r["kind"])          # 결합 중에 새로 고쳐도 이 사람의 대장이 열린다
    h = request.headers.get("authorization", "")
    token = h[7:].strip() if h.lower().startswith("bearer ") else None
    asyncio.get_running_loop().create_task(_run_match(p, tenant, import_id, r["kind"], mapping, token))
    return {"import_id": import_id, "state": "matching", "mapping": mapping, "poll": f"/api/v1/t/{tenant}/survey/registry/{import_id}", "as_of": now_iso()}


async def resume_stuck_imports() -> dict:
    """게이트웨이 재기동으로 끊긴 매칭(state=matching)을 이어 돌린다 — 원본 임시 파일이 남아 있으면 다시 매칭,
    없으면 failed + 사용자 문구. 기동 시 lifespan 이 1회 부른다(S-12 기동 안정 · 멈춘 채 남는 반입 0)."""
    from .deps import CAPS
    out = {"resumed": [], "failed": []}
    async with db(realm="lx") as conn:
        rows = await conn.fetch("SELECT id, tenant_id, kind, mapping, created_by FROM ledger_imports WHERE state='matching'")             if await conn.fetchval("SELECT to_regclass('ledger_imports') IS NOT NULL") else []
        for r in rows:
            if not _tmp_path(r["id"]).exists():
                await conn.execute("UPDATE ledger_imports SET state='failed', error=$2 WHERE id=$1", r["id"],
                                   "서버가 다시 시작되어 매칭이 멈췄습니다 — 파일을 다시 올려 주세요")
                out["failed"].append(r["id"])
    for r in rows:
        if r["id"] in out["failed"]:
            continue
        pr = Principal("tenant", "manager", r["tenant_id"], r["created_by"] or "u_boot", caps=CAPS[("tenant", "manager")])
        asyncio.get_running_loop().create_task(_run_match(pr, r["tenant_id"], r["id"], r["kind"], dict(r["mapping"] or {})))
        out["resumed"].append(r["id"])
    return out


async def _run_match(p: Principal, tenant: str, iid: str, kind: str, mapping: dict, token: str | None = None):
    t0 = time.perf_counter()
    try:
        st = await match_and_evaluate(p, tenant, iid, kind, mapping, token)
        st["ms"] = round((time.perf_counter() - t0) * 1000)
        async with db(realm="lx") as conn:
            await conn.execute("UPDATE ledger_imports SET latest=false WHERE tenant_id=$1 AND kind=$2 AND id<>$3", tenant, kind, iid)
            await conn.execute("UPDATE ledger_imports SET state='matched', stats=$2, latest=true, confirmed_at=now() WHERE id=$1", iid, st)
            await audit(conn, p, "ledger.confirm", iid, None, {k: v for k, v in st.items() if k != "skipped"})
            await remember(conn, tenant, p.user_id, iid, kind, list(st.get("sgg") or []))
        r = await redis()
        ev = {"import_id": iid, "tenant_id": tenant, "kind": kind, "state": "matched", "at": now_iso()}
        await r.xadd(f"events:tenant:{tenant}", {"event": "ledger.matched", "data": json.dumps(ev, ensure_ascii=False)}, maxlen=10000, approximate=True)
    except Exception as e:  # noqa: BLE001
        async with db(realm="lx") as conn:
            await conn.execute("UPDATE ledger_imports SET state='failed', error=$2 WHERE id=$1", iid, f"{type(e).__name__}: {str(e)[:200]}")
    finally:
        _tmp_path(iid).unlink(missing_ok=True)
        try:
            from .regions import _derived
            _derived["t"] = 0
        except Exception:
            pass


async def match_and_evaluate(p: Principal, tenant: str, iid: str, kind: str, mapping: dict, token: str | None = None) -> dict:
    blob = _tmp_path(iid).read_bytes()
    ext, raw = blob.split(b"\n", 1)
    cols, rows, pts = await run_in_threadpool(read_table, raw, ext.decode())
    from .regions import tenant_scope
    scope = tenant_scope(tenant)
    role_of = {v: k for k, v in mapping.items()}
    recs = []
    for i, row in enumerate(rows):
        pay = {}
        for col, val in row.items():
            role = role_of.get(col)
            if role and role not in ("geom",) and val != "":
                pay[role] = val
        if pts is not None and "geom" in mapping and pts[i]:
            pay["lon"], pay["lat"] = round(pts[i][0], 7), round(pts[i][1], 7)
        recs.append({"row": i + 1, "payload": pay, "pnu": None, "step": "none", "reason": None})
    # ⓪ 대장이 가리키는 시군구 → 필지가 없으면 적재(core-survey POST /survey/build) 뒤 매칭
    targets = await _target_sggs(scope, recs)
    build = await _ensure_parcels(targets, token) if targets else {}
    ix = await ParcelIndex.get([c for t in targets for c in _codes(t)] if targets else (scope if scope is not None else ["__none__"]))
    # ① PNU 직접 · ② 지번 파싱
    for rc in recs:
        pay = rc["payload"]
        pnu = canon_pnu(re.sub(r"\D", "", pay.get("pnu", "")))
        if pnu:
            if len(pnu) == 19 and pnu in ix.pnus:
                rc.update(pnu=pnu, step="pnu")
                continue
            rc["reason"] = "PNU 가 관할 연속지적에 없음" if len(pnu) == 19 else "PNU 자리수 오류(19자리)"
            rc["_pnu_try"] = pnu if len(pnu) == 19 else None
        j = None
        if pay.get("jibun"):
            j = parse_jibun(pay["jibun"])
        elif pay.get("bon"):
            j = {"emd": pay.get("emd"), "ri": pay.get("ri"), "san": str(pay.get("san", "")).strip() in ("산", "2", "Y", "y", "1", "true"),
                 "bon": int(re.sub(r"\D", "", pay["bon"]) or 0), "bu": int(re.sub(r"\D", "", pay.get("bu", "") or "0") or 0)}
        if j:
            if pay.get("emd") and not j.get("emd"):
                j["emd"] = pay["emd"]
            if pay.get("ri") and not j.get("ri"):
                j["ri"] = pay["ri"]
            got, why = ix.from_jibun(j)
            if got:
                rc.update(pnu=got, step="jibun", reason=None)
                continue
            rc["reason"] = rc["reason"] or why
    # ③ 좌표(도형 대표점 · 경도/위도) → 연속지적 포함
    pend = [rc for rc in recs if rc["step"] == "none" and _num(rc["payload"].get("lon")) and _num(rc["payload"].get("lat"))]
    if pend:
        async with db(realm="lx") as conn:
            for rc in pend:
                pnu = await conn.fetchval("SELECT pnu FROM survey_parcels WHERE ST_Contains(geom, ST_SetSRID(ST_MakePoint($1,$2),4326)) LIMIT 1",
                                          float(rc["payload"]["lon"]), float(rc["payload"]["lat"]))
                if pnu and (not scope or any(pnu.startswith(x) for x in scope)):
                    rc.update(pnu=pnu, step="geom", reason=None)
    # ④ V-World(키 · 호출 상한)
    pend = [rc for rc in recs if rc["step"] == "none"]
    vw_calls = 0
    if pend:
        from .proxy import vworld_key
        key, dom = vworld_key()
        if key:
            import httpx
            async with httpx.AsyncClient(timeout=15, headers={"User-Agent": "LandXI-gateway/0.1"}) as c:
                for rc in pend:
                    if vw_calls >= VW_CAP:
                        rc["reason"] = (rc["reason"] or "") + " · 공개 자료 조회 상한"
                        continue
                    pay = rc["payload"]
                    try:
                        if rc.get("_pnu_try"):
                            vw_calls += 1
                            if await _vworld_pnu(c, key, dom, rc["_pnu_try"]):
                                rc.update(pnu=rc["_pnu_try"], step="vworld", reason=None)
                                continue
                        pt = None
                        if _num(pay.get("lon")) and _num(pay.get("lat")):
                            pt = (float(pay["lon"]), float(pay["lat"]))
                        elif pay.get("jibun"):
                            vw_calls += 1
                            pt = await _vworld_search(c, key, dom, pay["jibun"])
                        if pt:
                            vw_calls += 1
                            got = await _vworld_point(c, key, dom, *pt)
                            got = canon_pnu(got) if got else got
                            if got and (not scope or any(got.startswith(x) for x in scope)):
                                rc.update(pnu=got, step="vworld", reason=None)
                            elif got:
                                rc["reason"] = "관할 밖 필지"
                    except Exception:
                        rc["reason"] = rc["reason"] or "공개 자료 조회 실패"
    # 저장(allowlist payload · 성명 0)
    async with db(realm="lx") as conn:
        await conn.execute("DELETE FROM registry_snapshots WHERE import_id=$1", iid)
        await conn.executemany("INSERT INTO registry_snapshots(tenant_id, import_id, kind, pnu, match_step, row_no, payload, reason) "
                               "VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
                               [(tenant, iid, kind, rc["pnu"], rc["step"], rc["row"], rc["payload"],
                                 None if rc["step"] != "none" else (rc["reason"] or "매칭 열 없음")) for rc in recs])
    by_step = {k: sum(1 for rc in recs if rc["step"] == k) for k in ("pnu", "jibun", "geom", "vworld")}
    matched = sum(by_step.values())
    st = {"rows": len(recs), "matched": matched, "matched_pct": round(100 * matched / max(len(recs), 1), 1), "by_step": by_step,
          "unmatched": len(recs) - matched, "vworld_calls": vw_calls, "sgg": targets, "parcels_build": build}
    st.update(await evaluate_rules(tenant, iid, kind))
    return st


def _codes(sgg: str) -> list[str]:
    try:
        from .regions import sgg_codes
        return sgg_codes(sgg) or [sgg]
    except Exception:
        return [sgg]


async def _target_sggs(scope: list[str] | None, recs: list[dict]) -> list[str]:
    """대장이 가리키는 시군구(지금 코드) — PNU 앞 5자리 → 주소 속 시군구 이름(관할 안) → V-World 주소 검색 표본(최대 5행).
    관할 밖 코드는 버린다. 행의 1% 미만만 가리키는 시군구는 버린다(오기 한두 줄로 다른 시군구 전체를 적재하지 않게)."""
    from collections import Counter

    from .regions import in_scope, regions_base
    if scope is None:
        return []
    cnt: Counter = Counter()
    for rc in recs:
        d = re.sub(r"\D", "", rc["payload"].get("pnu", ""))
        if len(d) == 19:
            cnt[cur_code(d[:5])] += 1
    if not cnt:
        regs, _, _ = regions_base()
        cand = [r for r in regs if any(in_scope(c, scope) for c in _codes(r["sgg_cd"]))]
        keys = [(r["sgg_cd"], (r.get("name") or "").split(" ")[0]) for r in cand]
        keys = [(cd, nm) for cd, nm in keys if len(nm) >= 2]
        for rc in recs[:3000]:
            txt = " ".join(str(rc["payload"].get(k) or "") for k in ("jibun", "emd", "ri"))
            for cd, nm in keys:
                if re.search(r"(^|\s)" + re.escape(nm) + r"(\s|$)", txt):
                    cnt[cd] += 1
        if not cnt and len(cand) == 1:
            cnt[cand[0]["sgg_cd"]] = len(recs)
    if not cnt:
        from .proxy import vworld_key
        key, dom = vworld_key()
        sample = [rc["payload"]["jibun"] for rc in recs if rc["payload"].get("jibun")][:5]
        if key and sample:
            import httpx
            async with httpx.AsyncClient(timeout=15, headers={"User-Agent": "LandXI-gateway/0.1"}) as c:
                for q in sample:
                    try:
                        pt = await _vworld_search(c, key, dom, q)
                        got = await _vworld_point(c, key, dom, *pt) if pt else None
                    except Exception:
                        got = None
                    if got:
                        cnt[cur_code(got[:5])] += 1
    n = max(len(recs), 1)
    return sorted(cd for cd, k in cnt.items() if any(in_scope(c, scope) for c in _codes(cd)) and (k >= 0.01 * n or len(cnt) == 1))


BUILD_WAIT_S = 1200


async def _ensure_parcels(targets: list[str], token: str | None) -> dict:
    """시군구마다 필지가 적재돼 있는지 · 없으면(또는 AI 없이 적재됐는데 그 뒤 AI 작업이 끝났으면) POST /survey/build 를 요청하고
    끝날 때까지 기다린다 → {sgg: state}(done · no_ai · failed · building · http_4xx · unavailable)."""
    out: dict[str, str] = {}
    need: dict[str, str | None] = {}
    async with db(realm="lx") as conn:
        if not await conn.fetchval("SELECT to_regclass('survey_sgg') IS NOT NULL"):
            return {t: "unavailable" for t in targets}
        have = {r["sgg_cd"]: dict(r) for r in await conn.fetch("SELECT sgg_cd, state, job_id FROM survey_sgg WHERE sgg_cd = ANY($1::text[])", targets)}
        n = {r["s"]: r["n"] for r in await conn.fetch("SELECT sgg_cd s, count(*) n FROM survey_parcels WHERE sgg_cd = ANY($1::text[]) GROUP BY 1", targets)}
        running = {r["s"] for r in await conn.fetch("SELECT options->>'sgg_cd' s FROM jobs WHERE kind='survey' AND state IN ('queued','running') "
                                                     "AND options->>'build'='true' AND options->>'sgg_cd' = ANY($1::text[])", targets)}
        for t in targets:
            h = have.get(t)
            if (h and h["state"] == "building") or t in running:
                out[t] = "building"
                need[t] = "__wait__"
                continue
            if not n.get(t) or not h:
                need[t] = None
                continue
            out[t] = h["state"]
            if h["state"] == "no_ai":                     # 적재 뒤 AI 전역 분석이 끝났으면 그 작업으로 다시 결합
                j = await conn.fetchval("SELECT id FROM jobs WHERE kind='infer' AND state='done' AND NOT demo AND NOT coalesce(test,false) "
                                        "AND options->>'sgg_cd' = ANY($1::text[]) ORDER BY finished_at DESC LIMIT 1", _codes(t))
                if j:
                    need[t] = j
    if not need:
        return out
    ask = {t: j for t, j in need.items() if j != "__wait__"}
    async with db(realm="lx") as conn:
        t_req = await conn.fetchval("SELECT now()")
    if ask and not token:
        out.update({t: "unavailable" for t in ask})
    elif ask:
        import httpx
        base = f"http://127.0.0.1:{config.API_PORT}/api/v1"
        async with httpx.AsyncClient(timeout=30, headers={"authorization": f"Bearer {token}"}) as c:
            for t, job in ask.items():
                body = {"sgg_cd": t, **({"job_id": job} if job else {})}
                try:
                    r = await c.post(f"{base}/survey/build", json=body)
                    out[t] = "building" if r.status_code in (200, 202, 409) else f"http_{r.status_code}"
                except Exception as e:  # noqa: BLE001
                    out[t] = f"error:{type(e).__name__}"
    wait = [t for t in need if out.get(t) == "building"]
    t_end = time.monotonic() + BUILD_WAIT_S
    await asyncio.sleep(1.0)
    while wait and time.monotonic() < t_end:
        async with db(realm="lx") as conn:
            rows = {r["sgg_cd"]: r for r in await conn.fetch("SELECT sgg_cd, state, finished_at FROM survey_sgg WHERE sgg_cd = ANY($1::text[])", wait)}
        for t in list(wait):
            r = rows.get(t)
            fresh = r is not None and (need.get(t) == "__wait__" or (r["finished_at"] is not None and r["finished_at"] >= t_req))
            if r is not None and r["state"] in ("done", "no_ai", "failed") and fresh:
                out[t] = r["state"]
                wait.remove(t)
        if wait:
            await asyncio.sleep(2.0)
    ParcelIndex.clear()
    return out


async def ai_parcels(conn, pnus: list[str]) -> tuple[dict[str, dict], dict]:
    """대장 필지 → 규칙이 읽는 필지 행(연속지적 + AI 피연산자) · AI 상태.
    AI 피연산자 = 그 시군구의 현재 AI 작업(survey_sgg.job_id)으로 거른 survey_parcel_ai(contract-parcel-ai §2.2) — 옛 이름(a23_* · r23_*)으로 펼친다.
    survey_parcel_ai 에 그 작업 행이 없는 시군구(정본 적재 시군구)는 survey_parcels 의 옛 열을 그대로 쓴다.
    AI 가 없는 시군구(survey_sgg.state no_ai · 작업 없음)와 작업 범위(jobs.aoi) 밖 필지는 결과에 넣지 않는다(판정 안 함 · 정직).
    → ({pnu: 행}, {has, parcels, sgg:{코드: {state, job_id, year}}})"""
    if not pnus:
        return {}, {"has": False, "parcels": 0, "sgg": {}}
    rows = await conn.fetch("SELECT p.*, ST_X(ST_PointOnSurface(p.geom)) AS lon, ST_Y(ST_PointOnSurface(p.geom)) AS lat, NULL AS geom "
                            "FROM survey_parcels p WHERE pnu = ANY($1::text[])", pnus)
    pmap = {r["pnu"]: dict(r) for r in rows}
    by_sgg: dict[str, list[str]] = {}
    for pn, r in pmap.items():
        by_sgg.setdefault(r.get("sgg_cd") or pn[:5], []).append(pn)
    has_sgg_tbl = await conn.fetchval("SELECT to_regclass('survey_sgg') IS NOT NULL AND to_regclass('survey_parcel_ai') IS NOT NULL")
    info: dict[str, dict] = {}
    out: dict[str, dict] = {}
    for sgg, pl in by_sgg.items():
        sg = await conn.fetchrow("SELECT state, job_id FROM survey_sgg WHERE sgg_cd=$1", sgg) if has_sgg_tbl else None
        job = sg["job_id"] if sg else None
        state = sg["state"] if sg else None
        year = None
        if job:
            jr = await conn.fetchrow("SELECT j.id, i.year, i.epoch, (j.aoi IS NOT NULL) has_aoi FROM jobs j LEFT JOIN imagery i ON i.id=j.imagery_id WHERE j.id=$1", job)
            if jr:
                year = jr["year"] or (str(jr["epoch"])[:4] if jr["epoch"] else None)
            else:
                m = re.search(r"(19|20)\d{2}", job)
                year = m.group(0) if m else None
        if state in ("no_ai", "failed", "building") or not job:
            info[sgg] = {"state": state or "none", "job_id": None, "year": None, "parcels": 0}
            continue
        ops = await _ai_operands(conn, pl, sgg, job)
        cover = set(pl)
        if ops is not None and await conn.fetchval("SELECT EXISTS(SELECT 1 FROM jobs WHERE id=$1)", job):
            # 분석한 곳만 — 작업 범위(aoi) ∩ 영상 범위(footprint) 안의 필지(대표점). 영상 밖 필지를 'AI 가 아무것도 못 봄'으로 판정하지 않는다
            cover = {r["pnu"] for r in await conn.fetch(
                "SELECT p.pnu FROM survey_parcels p JOIN jobs j ON j.id=$2 LEFT JOIN imagery i ON i.id=j.imagery_id "
                "WHERE p.pnu = ANY($1::text[]) AND (j.aoi IS NULL OR ST_Intersects(j.aoi, ST_PointOnSurface(p.geom))) "
                "AND (i.footprint IS NULL OR ST_Intersects(i.footprint, ST_PointOnSurface(p.geom)))", pl, job)}
        for pn in pl:
            if pn not in cover:
                continue
            r = pmap[pn]
            if ops is not None:
                r.update({"a23_bld_in_m2": 0.0, "a23_bld_m2": 0.0, "a23_crop_m2": 0.0, "a23_park_m2": 0.0, "a23_gh_m2": 0.0,
                          "r23_bld": 0.0, "r23_crop": 0.0, "r23_park": 0.0, "r23_gh": 0.0, "r23_farm": 0.0})
                r.update(ops.get(pn) or {})
            r["_ai_year"] = year
            out[pn] = r
        info[sgg] = {"state": state, "job_id": job, "year": year, "parcels": sum(1 for pn in pl if pn in out), "outside": len(pl) - len(cover & set(pl)),
                     "source": "survey_parcel_ai" if ops is not None else "survey_parcels"}
    return out, {"has": bool(out), "parcels": len(out), "sgg": info}


async def _ai_operands(conn, pnus: list[str], sgg: str, job: str) -> dict | None:
    """survey_parcel_ai(그 작업) → {pnu: {a23_<c>_in_m2 · a23_<c>_m2 · a23_<c>_n · a23_<c>_conf · a23_<c>_ids · r23_<c> · r23_farm}}.
    그 작업 행이 하나도 없으면 None(옛 열을 쓴다). core-survey 서버 함수(survey.nation.ai_operands)가 있으면 그것을 쓴다."""
    try:
        from survey import nation  # type: ignore
        fn = getattr(nation, "ai_operands", None)
    except Exception:
        fn = None
    n = await conn.fetchval("SELECT count(*) FROM (SELECT 1 FROM survey_parcel_ai WHERE sgg_cd=$1 AND job_id=$2 LIMIT 1) x", sgg, job)
    if not n:
        return None
    if fn is not None:                                   # core-survey 규칙과 같은 식(psycopg · 스레드)
        def _nation():
            from survey.db import lx_tx, pg
            with pg() as c:
                lx_tx(c)
                return fn(c, list(pnus), sgg)
        try:
            got = await run_in_threadpool(_nation)
            return got or None                           # 정본(canon) 적재 필지는 돌려주지 않는다 → 옛 열(같은 규칙 · 회귀 0)
        except Exception:
            pass
    rows = await conn.fetch("SELECT a.pnu, a.cls, a.hit_m2, a.in_m2, a.n, a.conf, a.ids, p.area_m2 FROM survey_parcel_ai a JOIN survey_parcels p ON p.pnu=a.pnu "
                            "WHERE a.job_id=$1 AND a.pnu = ANY($2::text[]) AND p.src IS DISTINCT FROM 'canon'", job, pnus)
    out: dict[str, dict] = {}
    for r in rows:
        c = r["cls"]
        d = out.setdefault(r["pnu"], {})
        area = float(r["area_m2"] or 0)
        d[f"a23_{c}_m2"] = float(r["hit_m2"] or 0)
        d[f"a23_{c}_in_m2"] = float(r["in_m2"] or 0)
        d[f"a23_{c}_n"] = int(r["n"] or 0)
        d[f"a23_{c}_conf"] = r["conf"]
        d[f"a23_{c}_ids"] = r["ids"]
        d[f"r23_{c}"] = round(min(1.0, float(r["hit_m2"] or 0) / area), 3) if area else 0.0
    for d in out.values():
        d["r23_farm"] = round(min(1.0, (d.get("r23_crop") or 0) + (d.get("r23_gh") or 0)), 3)
    return out or None


async def evaluate_rules(tenant: str, iid: str, kind: str, rules: list[str] | None = None, th_override: dict | None = None) -> dict:
    """규칙 L-*(requires ⊂ 이 기관의 최신 대장) → survey_findings(rule L*, import_id). 대장 없으면 skipped(의심 0 · 정직).
    필지 AI 값 = ai_parcels(대장이 가리키는 시군구의 survey_parcel_ai) — AI 가 없는 필지는 판정하지 않고 ai.has=false 로 알린다."""
    defs = ledger_rules()
    async with db(realm="lx") as conn:
        latest = {r["kind"]: r["id"] for r in await conn.fetch(
            "SELECT DISTINCT ON (kind) kind, id FROM ledger_imports WHERE tenant_id=$1 AND (state='matched' OR id=$2) "
            "ORDER BY kind, (id=$2) DESC, created_at DESC", tenant, iid)}
    todo = [rid for rid, d in defs.items() if (rules is None or rid in rules) and kind in (d.get("requires") or [])]
    skipped = {rid: "rule_requires_missing: " + ",".join(x for x in (defs[rid].get("requires") or []) if x not in latest)
               for rid in todo if any(x not in latest for x in (defs[rid].get("requires") or []))}
    todo = [r for r in todo if r not in skipped]
    counts: dict[str, int] = {}
    if not todo:
        return {"findings": counts, "skipped": skipped}
    async with db(realm="lx") as conn:
        led_rows = await conn.fetch("SELECT kind, pnu, payload FROM registry_snapshots WHERE import_id = ANY($1::text[]) AND pnu IS NOT NULL",
                                    list(latest.values()))
        ledger_by: dict[str, dict] = {}
        for x in led_rows:
            ledger_by.setdefault(x["pnu"], {})[x["kind"]] = dict(x["payload"] or {})
        pnus = [pn for pn, lk in ledger_by.items() if kind in lk]
        if not pnus:
            return {"findings": {}, "skipped": skipped, "ai": {"has": False, "parcels": 0, "sgg": {}}}
        pmap, ai = await ai_parcels(conn, pnus)
        if not ai.get("has"):                   # AI 결과가 없는 시군구 — 규칙을 돌리지 않는다(0 필지가 아니라 'AI 분석 전' · 낡은 의심은 걷는다)
            for rid in todo:
                await conn.execute(DEL_SCOPED, rid, tenant, kind, iid, pnus)
            return {"findings": {}, "skipped": skipped, "ai": ai}
        active_th = {r["id"]: (r["thresholds"] or {}) for r in await conn.fetch(
            "SELECT id, thresholds FROM survey_rules WHERE id = ANY($1::text[]) AND coalesce(state,'active')='active'", todo)}
        for rid in todo:
            d = defs[rid]
            th = {**(d.get("thresholds") or {}), **active_th.get(rid, {}), **(th_override or {})}     # 결재로 적용된 임계가 YAML 초기값을 덮는다
            cls = (d.get("evidence") or {}).get("ai", "bld")
            cls_nm, a_col, _, r_col = AI_CLS.get(cls, AI_CLS["bld"])
            led_col = (d.get("evidence") or {}).get("ledger", "status")
            hits = []
            for pn in pnus:
                par = pmap.get(pn)
                if not par:
                    continue                      # AI 분석 · 연속지적 결합이 없는 필지(관할 밖 · 적재 전 · 영상 밖) — 판정 안 함
                if not eval_cond(d["when_"], ledger_by[pn], par, th):
                    continue
                s, evid, conf = score_of(d, par)
                lrow = ledger_by[pn].get(d["kind"]) or {}
                ev = {"ledger": {"kind": d["kind"], "col": led_col, "value": lrow.get(led_col)},
                      "ai": {"cls": cls_nm, "ratio": round(float(par.get(r_col) or 0), 3), "m2": round(float(par.get(a_col) or 0), 1),
                             "year": int(par["_ai_year"]) if str(par.get("_ai_year") or "").isdigit() else par.get("_ai_year")},
                      "vworld": {"layer": "LP_PA_CBND_BUBUN", "col": "jimok", "value": par.get("jimok_nm") or par.get("jimok")}}
                hits.append((finding_id(rid, tenant, pn), s, priority_of(s), rid, d["name"], pn, par, evid, conf, ev))
            hits.sort(key=lambda h: -h[1])
            # 이번 반입이 만든 의심 + 이번 대장과 같은 필지의 의심(같은 기관 · 같은 종류 반입) 중 사람이 손대지 않은 것만 갈아 끼운다.
            # 다른 담당자 · 다른 지역 대장이 만든 다른 필지의 결과는 그대로 둔다(그 사람이 다시 열 때 같은 숫자 · r3-fusion M6).
            await conn.execute(DEL_SCOPED, rid, tenant, kind, iid, pnus)
            for rank, h in enumerate(hits, 1):
                fid, s, pr, rid_, nm, pn, par, evid, conf, ev = h
                await conn.execute(
                    "INSERT INTO survey_findings(id, tenant_id, rank, priority, score, rule, rule_nm, pnu, addr, emd, emd_cd, jimok, parcel_m2, yongdo, "
                    "nongup, evid_m2, conf, corroboration, img_date, evidence, ai_ids, lon, lat, state, import_id, geom, sgg_cd) VALUES "
                    "($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,'open',$24,ST_SetSRID(ST_MakePoint($22,$23),4326),$25) "
                    "ON CONFLICT (id) DO UPDATE SET rank=EXCLUDED.rank, priority=EXCLUDED.priority, score=EXCLUDED.score, evid_m2=EXCLUDED.evid_m2, "
                    "conf=EXCLUDED.conf, evidence=EXCLUDED.evidence, import_id=EXCLUDED.import_id",
                    fid, tenant, rank, pr, s, rid_, nm, pn, par.get("addr"), par.get("emd"), par.get("emd_cd"), par.get("jimok"), par.get("area_m2"),
                    par.get("yongdo"), par.get("nongup"), evid, conf, "대장", str(par.get("_ai_year") or ""), json.dumps(ev, ensure_ascii=False),
                    getattr_ids(par, cls), par.get("lon"), par.get("lat"), iid, par.get("sgg_cd") or pn[:5])
            counts[rid] = len(hits)
    return {"findings": counts, "skipped": skipped, "ai": ai}


DEL_SCOPED = ("DELETE FROM survey_findings WHERE rule=$1 AND tenant_id=$2 AND state='open' AND NOT demo "
              "AND import_id IN (SELECT id FROM ledger_imports WHERE tenant_id=$2 AND kind=$3) "
              "AND (import_id=$4 OR pnu = ANY($5::text[])) "
              "AND id NOT IN (SELECT finding_id FROM survey_actions WHERE finding_id IS NOT NULL)")


def finding_id(rid: str, tenant: str, pnu: str) -> str:
    """규칙 L-* 의심 id — 기관별(같은 필지를 두 기관이 올려도 서로의 의심을 덮어쓰지 않는다)."""
    return f"f_{rid}_{tenant}_{pnu}"


def getattr_ids(par: dict, cls: str) -> str | None:
    return par.get({"bld": "a23_bld_ids", "crop": "a23_crop_ids", "gh": "a23_gh_ids", "park": "a23_park_ids"}.get(cls, "a23_bld_ids"))


def explain_ledger(row: dict, parcel: dict | None = None) -> dict:
    """규칙 L-* 설명(대장 · AI · V-World 세 값 나란히) — survey.py 가 finding 상세에서 부른다."""
    d = ledger_rules().get(row["rule"], {})
    try:
        ev = json.loads(row.get("evidence") or "{}")
    except Exception:
        ev = {}
    th = d.get("thresholds") or {}
    ai = ev.get("ai") if isinstance(ev.get("ai"), dict) else None
    if ai:                                  # 저장된 AI 값(맨 숫자) → 봉투(봉투 없는 숫자 0)
        src = f"AI 분석 {ai.get('year') or ''} · 필지 결합".replace("  ", " ")
        for k, u in (("ratio", "ratio"), ("m2", "m2")):
            if isinstance(ai.get(k), (int, float)) and not isinstance(ai.get(k), bool):
                ai[k] = env(ai[k], u, "inferred", src, "검수 전")
    return {"rule": row["rule"], "name": d.get("name"), "condition": condition_text(d),
            "three": ev,
            "thresholds": [{"key": k, "value": env(v, "ratio" if v < 1 else "m2", "estimate", "대장 대조 기준 초기값",
                                                  "[추정 초기값] · 법령 기준 아님")} for k, v in th.items()],
            "note": d.get("note"), "fixed": "AI 추론 · 검수 전 · 위법 판정 아님"}   # 원칙 135


async def ledger_rows(p: Principal, pnu: str) -> list[dict]:
    async with db(p) as conn:
        rows = await conn.fetch("SELECT s.kind, s.import_id, s.match_step, s.payload, i.created_at, i.latest FROM registry_snapshots s "
                                "JOIN ledger_imports i ON i.id=s.import_id WHERE s.pnu=$1 ORDER BY i.created_at DESC LIMIT 20", pnu)
    return [{"kind": r["kind"], "kind_label": KINDS.get(r["kind"]), "import_id": r["import_id"], "match_step": r["match_step"], "latest": r["latest"],
             "values": {k: v for k, v in (r["payload"] or {}).items() if k not in ("lon", "lat")},
             "as_of": r["created_at"].astimezone(KST).isoformat(timespec="seconds") if r["created_at"] else None} for r in rows]


async def resolve_ledger_param(p: Principal, v: str) -> list[str]:
    """findings?ledger= · stats?ledger= 값 → import id 목록(latest | 종류 | import id)."""
    async with db(p) as conn:
        if v in ("1", "latest", "true"):
            rows = await conn.fetch("SELECT id FROM ledger_imports WHERE latest AND state='matched'")
        elif v in KINDS:
            rows = await conn.fetch("SELECT id FROM ledger_imports WHERE latest AND state='matched' AND kind=$1", v)
        else:
            rows = await conn.fetch("SELECT id FROM ledger_imports WHERE id=$1", v)
    return [r["id"] for r in rows]


@router.get("/survey/rules/ledger")
async def rules_ledger(request: Request):
    require(principal(request))
    items = []
    for rid, d in ledger_rules().items():
        items.append({"id": rid, "name": d["name"], "kind": d.get("kind"), "requires": d.get("requires") or [],
                      "condition": condition_text(d), "when_": d.get("when_"),
                      "thresholds": [{"key": k, "value": env(v, "ratio" if v < 1 else "m2", "estimate", "대장 대조 기준 초기값",
                                                            "[추정 초기값] · 법령 기준 아님")} for k, v in (d.get("thresholds") or {}).items()],
                      "note": d.get("note")})
    return {"items": items, "kinds": KINDS, "as_of": now_iso()}


@router.delete("/t/{tenant}/survey/registry/{import_id}")
async def delete_import(tenant: str, import_id: str, request: Request):
    """반입 철회 — 이 반입의 대장 행 · 사람이 손대지 않은(open · demo 아님) 규칙 L-* 의심을 지운다. 판정·조치가 붙은 의심은 남긴다(기록 보존)."""
    p = _gate(principal(request), tenant, write=True)
    r = await _get_import(p, tenant, import_id)
    async with db(realm="lx") as conn:
        nf = await conn.fetchval("WITH d AS (DELETE FROM survey_findings WHERE import_id=$1 AND state='open' AND NOT demo "
                                 "AND id NOT IN (SELECT finding_id FROM survey_actions WHERE finding_id IS NOT NULL) RETURNING 1) SELECT count(*) FROM d", import_id)
        ns = await conn.fetchval("WITH d AS (DELETE FROM registry_snapshots WHERE import_id=$1 RETURNING 1) SELECT count(*) FROM d", import_id)
        await conn.execute("DELETE FROM ledger_imports WHERE id=$1", import_id)
        if await conn.fetchval("SELECT to_regclass('ledger_recent') IS NOT NULL"):     # 지운 대장을 가리키는 기억은 그 사람의 이전 대장으로 되돌린다
            gone = await conn.fetch("DELETE FROM ledger_recent WHERE import_id=$1 RETURNING tenant_id, user_id, sgg_cd, kind", import_id)
            for g in gone:                       # 같은 사람이 올린 가장 최근 결합 대장(그 시군구를 덮는 것) · 없으면 기억 없음(→ 이어 열기가 기관 최근 대장)
                prev = await conn.fetchrow(
                    "SELECT id, coalesce(confirmed_at, created_at) AS at FROM ledger_imports WHERE tenant_id=$1 AND created_by=$2 AND kind=$3 "
                    "AND state='matched' AND id<>$5 AND ($4='*' OR (jsonb_typeof(stats->'sgg')='array' AND stats->'sgg' ? $4)) "
                    "ORDER BY created_at DESC LIMIT 1", g["tenant_id"], g["user_id"], g["kind"], g["sgg_cd"], import_id)
                if prev:
                    await conn.execute("INSERT INTO ledger_recent(tenant_id, user_id, sgg_cd, kind, import_id, at) VALUES ($1,$2,$3,$4,$5,$6) "
                                       "ON CONFLICT (tenant_id, user_id, sgg_cd, kind) DO NOTHING",
                                       g["tenant_id"], g["user_id"], g["sgg_cd"], g["kind"], prev["id"], prev["at"])
        back = None
        if r["latest"]:
            back = await conn.fetchval("UPDATE ledger_imports SET latest=true WHERE id = (SELECT id FROM ledger_imports WHERE tenant_id=$1 AND kind=$2 "
                                       "AND state='matched' ORDER BY created_at DESC LIMIT 1) RETURNING id", tenant, r["kind"])
        await audit(conn, p, "ledger.delete", import_id, {"rows": r["rows"]}, {"findings_removed": int(nf), "rows_removed": int(ns), "restored": back})
    if back:                                     # 최신 반입을 지우면 이전 최신 반입의 의심을 다시 판정(대장 행은 남아 있다)
        await evaluate_rules(tenant, back, r["kind"])          # 수는 survey_findings 실시간 집계라 stats 갱신 불필요
    _tmp_path(import_id).unlink(missing_ok=True)
    try:
        from .regions import _derived
        _derived["t"] = 0
    except Exception:
        pass
    return {"deleted": import_id, "findings_removed": env(int(nf), "count", "recorded", "survey_findings(open · 이 반입)"),
            "rows_removed": env(int(ns), "count", "recorded", "registry_snapshots"), "as_of": now_iso()}


@router.post("/t/{tenant}/survey/rules/evaluate")
async def evaluate_tenant_rule(tenant: str, body: dict, request: Request):
    """기관 오버라이드(F3-DIRECTION §3 · 에이전트 ledger_rule 확인 카드 뒤) — 규칙 L-* 를 이 기관의 최신 대장에 임계를 바꿔 다시 적용.
    결재(전 기관 적용)는 /survey/rules/{id}/activate — 여기는 이 기관 결과만."""
    p = _gate(principal(request), tenant, write=True)
    rid = body.get("rule")
    d = ledger_rules().get(rid or "")
    if not d:
        raise ApiError("not_found", "규칙이 없습니다", {"allowed": rule_ids()})
    th = {}
    for k, v in (body.get("thresholds") or {}).items():
        if k not in (d.get("thresholds") or {}):
            raise ApiError("bad_request", "이 규칙에 없는 임계", {"key": k, "allowed": list(d.get("thresholds") or {})})
        try:
            th[k] = float(v)
        except (TypeError, ValueError):
            raise ApiError("bad_request", f"{k} 는 숫자")
    async with db(p) as conn:
        imp = await conn.fetchrow("SELECT id, kind FROM ledger_imports WHERE tenant_id=$1 AND kind=$2 AND latest AND state='matched'", tenant, d["kind"])
    if not imp:
        raise ApiError("rule_requires_missing", f"이 기관에 {KINDS.get(d['kind'], d['kind'])}이 없습니다 — 먼저 올려 주세요",
                       {"requires": d.get("requires")}, 400)
    st = await evaluate_rules(tenant, imp["id"], imp["kind"], rules=[rid], th_override=th)
    async with db(realm="lx") as conn:
        await audit(conn, p, "rule.evaluate.tenant", rid, None, {"tenant": tenant, "thresholds": th, "findings": st.get("findings")})
    return {"rule": rid, "tenant_id": tenant, "import_id": imp["id"], "condition": condition_text(d, th),
            "findings": {k: env(v, "count", "inferred", "대장 대조 · 기관 임계 · 검수 전") for k, v in (st.get("findings") or {}).items()},
            "skipped": st.get("skipped"), "as_of": now_iso()}
