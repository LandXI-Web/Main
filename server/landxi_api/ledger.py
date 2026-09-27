"""행정데이터(대장) 반입·융합(F3 최종 명세 §3 S-2 · F3-DIRECTION §3) — 업로드한 대장 × AI 판독 × V-World.

POST /t/{tenant}/survey/registry/import            multipart(file · kind) → 202 {import_id, rows, columns_guess, dropped}
GET  /t/{tenant}/survey/registry/{import_id}        → {columns, mapping, matched, matched_pct, by_step, unmatched[], state}
POST /t/{tenant}/survey/registry/{import_id}/confirm {mapping} → 매칭(PNU → 지번 → 좌표 → V-World) + 규칙 L-* → 202
GET  /t/{tenant}/survey/registry?latest=1           → 반입 목록(종류별 최신)
GET  /survey/rules/ledger                           → 규칙 L-* 정의(대장 피연산자 `ledger.<kind>.<col>`)

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
    """'전북 남원시 대강면 방동리 산 12-3' → {emd, ri, san, bon, bu}."""
    s = re.sub(r"\s+", " ", str(s or "")).strip()
    m = JIBUN_RX.search(s)
    if not m:
        return None
    head = s[: m.start()].strip().split()
    emd = next((w for w in reversed(head) if re.search(r"(읍|면|동|가)$", w)), None)
    ri = next((w for w in reversed(head) if re.search(r"리$", w) and w != emd), None)
    san = bool(m.group(1)) or (len(head) > 0 and head[-1] == "산")
    return {"emd": emd, "ri": ri, "san": san, "bon": int(m.group(2)), "bu": int(m.group(3) or 0)}


class ParcelIndex:
    """관할 안 연속지적 색인(PNU 집합 · (읍면동, 리) → PNU 앞 10자리) — 프로세스 캐시 10분."""
    _c: dict = {}

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
    src = "대장 × 연속지적 매칭(PNU → 지번 → 좌표 → V-World)"
    if st:
        out["matched"] = env(st.get("matched"), "count", "measured", src, as_of=at)
        out["matched_pct"] = env(st.get("matched_pct"), "%", "measured", src, as_of=at)
        out["by_step"] = {k: env(v, "count", "measured", src, as_of=at) for k, v in (st.get("by_step") or {}).items()}
        out["unmatched_n"] = env(st.get("unmatched"), "count", "measured", src, as_of=at)
        out["findings"] = {k: env(v, "count", "inferred", "규칙 L-* · 검수 전", as_of=at) for k, v in (st.get("findings") or {}).items()}
        if st.get("skipped"):
            out["skipped"] = st["skipped"]
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
    asyncio.get_running_loop().create_task(_run_match(p, tenant, import_id, r["kind"], mapping))
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


async def _run_match(p: Principal, tenant: str, iid: str, kind: str, mapping: dict):
    t0 = time.perf_counter()
    try:
        st = await match_and_evaluate(p, tenant, iid, kind, mapping)
        st["ms"] = round((time.perf_counter() - t0) * 1000)
        async with db(realm="lx") as conn:
            await conn.execute("UPDATE ledger_imports SET latest=false WHERE tenant_id=$1 AND kind=$2 AND id<>$3", tenant, kind, iid)
            await conn.execute("UPDATE ledger_imports SET state='matched', stats=$2, latest=true, confirmed_at=now() WHERE id=$1", iid, st)
            await audit(conn, p, "ledger.confirm", iid, None, {k: v for k, v in st.items() if k != "skipped"})
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


async def match_and_evaluate(p: Principal, tenant: str, iid: str, kind: str, mapping: dict) -> dict:
    blob = _tmp_path(iid).read_bytes()
    ext, raw = blob.split(b"\n", 1)
    cols, rows, pts = await run_in_threadpool(read_table, raw, ext.decode())
    from .regions import tenant_scope
    scope = tenant_scope(tenant)
    ix = await ParcelIndex.get(scope if scope is not None else ["__none__"])     # [] = 전국(LX) · None = 국내 관할 없음(해외 기관)
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
    # ① PNU 직접 · ② 지번 파싱
    for rc in recs:
        pay = rc["payload"]
        pnu = re.sub(r"\D", "", pay.get("pnu", ""))
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
                        rc["reason"] = (rc["reason"] or "") + " · V-World 조회 상한"
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
                            if got and (not scope or any(got.startswith(x) for x in scope)):
                                rc.update(pnu=got, step="vworld", reason=None)
                            elif got:
                                rc["reason"] = "관할 밖 필지"
                    except Exception:
                        rc["reason"] = rc["reason"] or "V-World 조회 실패"
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
          "unmatched": len(recs) - matched, "vworld_calls": vw_calls}
    st.update(await evaluate_rules(tenant, iid, kind))
    return st


async def evaluate_rules(tenant: str, iid: str, kind: str, rules: list[str] | None = None, th_override: dict | None = None) -> dict:
    """규칙 L-*(requires ⊂ 이 기관의 최신 대장) → survey_findings(rule L*, import_id). 대장 없으면 skipped(의심 0 · 정직)."""
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
            return {"findings": {r: 0 for r in todo}, "skipped": skipped}
        parcels = await conn.fetch("SELECT p.*, ST_X(ST_PointOnSurface(p.geom)) AS lon, ST_Y(ST_PointOnSurface(p.geom)) AS lat, NULL AS geom "
                                   "FROM survey_parcels p WHERE pnu = ANY($1::text[])", pnus)
        pmap = {r["pnu"]: dict(r) for r in parcels}
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
                    continue                      # AI 판독·연속지적 결합이 없는 필지(관할 밖 · 적재 전) — 판정 안 함
                if not eval_cond(d["when_"], ledger_by[pn], par, th):
                    continue
                s, evid, conf = score_of(d, par)
                lrow = ledger_by[pn].get(d["kind"]) or {}
                ev = {"ledger": {"kind": d["kind"], "col": led_col, "value": lrow.get(led_col)},
                      "ai": {"cls": cls_nm, "ratio": round(float(par.get(r_col) or 0), 3), "m2": round(float(par.get(a_col) or 0), 1), "year": 2023},
                      "vworld": {"layer": "LP_PA_CBND_BUBUN", "col": "jimok", "value": par.get("jimok_nm") or par.get("jimok")}}
                hits.append((finding_id(rid, tenant, pn), s, priority_of(s), rid, d["name"], pn, par, evid, conf, ev))
            hits.sort(key=lambda h: -h[1])
            # 같은 기관 · 같은 종류 대장의 반입(이전 반입 + 이번 반입)이 만든 의심 중 사람이 손대지 않은 것(open · demo 아님)만 갈아 끼운다.
            # 다른 기관 · 다른 종류 반입 · 판정·조치가 붙은 의심은 건드리지 않는다.
            await conn.execute("DELETE FROM survey_findings WHERE rule=$1 AND tenant_id=$2 AND state='open' AND NOT demo "
                               "AND import_id IN (SELECT id FROM ledger_imports WHERE tenant_id=$2 AND kind=$3) "
                               "AND id NOT IN (SELECT finding_id FROM survey_actions WHERE finding_id IS NOT NULL)", rid, tenant, kind)
            for rank, h in enumerate(hits, 1):
                fid, s, pr, rid_, nm, pn, par, evid, conf, ev = h
                await conn.execute(
                    "INSERT INTO survey_findings(id, tenant_id, rank, priority, score, rule, rule_nm, pnu, addr, emd, emd_cd, jimok, parcel_m2, yongdo, "
                    "nongup, evid_m2, conf, corroboration, img_date, evidence, ai_ids, lon, lat, state, import_id, geom) VALUES "
                    "($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,'open',$24,ST_SetSRID(ST_MakePoint($22,$23),4326)) "
                    "ON CONFLICT (id) DO UPDATE SET rank=EXCLUDED.rank, priority=EXCLUDED.priority, score=EXCLUDED.score, evid_m2=EXCLUDED.evid_m2, "
                    "conf=EXCLUDED.conf, evidence=EXCLUDED.evidence, import_id=EXCLUDED.import_id",
                    fid, tenant, rank, pr, s, rid_, nm, pn, par.get("addr"), par.get("emd"), par.get("emd_cd"), par.get("jimok"), par.get("area_m2"),
                    par.get("yongdo"), par.get("nongup"), evid, conf, "대장", "2023", json.dumps(ev, ensure_ascii=False),
                    getattr_ids(par, cls), par.get("lon"), par.get("lat"), iid)
            counts[rid] = len(hits)
    return {"findings": counts, "skipped": skipped}


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
        src = "AI 판독 2023 · survey_parcels"
        for k, u in (("ratio", "ratio"), ("m2", "m2")):
            if isinstance(ai.get(k), (int, float)) and not isinstance(ai.get(k), bool):
                ai[k] = env(ai[k], u, "inferred", src, "검수 전")
    return {"rule": row["rule"], "name": d.get("name"), "condition": condition_text(d),
            "three": ev,
            "thresholds": [{"key": k, "value": env(v, "ratio" if v < 1 else "m2", "estimate", f"server/survey/rules/{row['rule']}.yaml",
                                                  "[추정 초기값] · 법령 기준 아님")} for k, v in th.items()],
            "note": d.get("note"), "fixed": "AI 추론 · 검수 전 · 현장 확인 전 · 위법 판정 아님"}


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
                      "thresholds": [{"key": k, "value": env(v, "ratio" if v < 1 else "m2", "estimate", f"server/survey/rules/{rid}.yaml",
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
            "findings": {k: env(v, "count", "inferred", f"규칙 {k} · 기관 임계 · 검수 전") for k, v in (st.get("findings") or {}).items()},
            "skipped": st.get("skipped"), "as_of": now_iso()}
