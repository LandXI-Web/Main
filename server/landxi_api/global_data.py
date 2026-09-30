"""해외 구역 대장 × AI 결과 대조(r3-global · C8 위의 C4·C3 최소).

POST /global/registers            multipart(file · threshold?) → 올린 구역 대장(CSV·XLSX)을 읽고 → 구역 이름을 현지 행정 경계와 맞추고
                                   → AI 경작지 면적과 대조 → 저장 → 결과 한 벌
GET  /global/registers/latest     → 이 사람이 마지막으로 올린 대조 결과(없으면 register: null) — 새로 고침·재로그인 뒤에도 같은 결과
GET  /global/registers/{rid}      → 한 벌(같은 기관만)

원칙
- 구역 단위다(필지가 아니다). 구역 = 해외 도구(global_.districts)와 같은 ADM2 경계 파일 · 지역 이름 하드코딩 0.
- 'AI 값' = 구역 폴리곤 안 Sentinel-2 10 m AI 토지피복의 경작지 면적(pipelines/global/g6_district_cropland.py 산출 · 추정).
- 관할: 값 비교는 이 기관의 구역(배포 범위와 15% 이상 겹침 · global_.mine)만. 밖의 구역 행은 '관할 밖 · 비교 안 함'으로만 남기고 AI 값을 내지 않는다.
- 어긋남 = |AI − 신고| / 신고 > 기준(기본 30%). 숫자는 전부 봉투.
- 기억: 기관 + 사람 단위. 다른 담당자가 올린 대장은 이 사람의 '최근'으로 열리지 않는다.
"""
from __future__ import annotations

import difflib
import io
import json
import re
import secrets
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter, File, Form, Request, UploadFile
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from . import config
from .deps import ApiError, Principal, audit, db, principal, require
from .envelope import env, now_iso

router = APIRouter()
MAX_BYTES = 10 * 1024 * 1024
EXTS = {"csv", "xlsx"}
THRESHOLD = 30.0
YEAR = 2025
CROP_FILES = [config.DATA_ROOT / "global" / f"district-cropland-{YEAR}.json",
              config.SERVER_ROOT.parent / "landxi" / "v3" / "global" / "data" / f"district-cropland-{YEAR}.json"]
SRC_REG = "Uploaded district register"
SRC_AI = f"Sentinel-2 10 m AI land cover · cropland · {YEAR}"
UNIT_WORDS = [("km2", re.compile(r"km\s*2|km²|sq\.?\s*km|square\s*kilomet", re.I)), ("ha", re.compile(r"\bha\b|hectare|га\b", re.I))]
VALUE_WORDS = ["declared", "reported", "register", "registered", "cropland", "farmland", "arable", "sown", "cultivat", "crop", "agri",
               "irrigat", "area", "ha", "площад", "посев", "пашн", "신고", "농지", "경작", "면적"]
STATUS_ORDER = {"mismatch": 0, "match": 1, "no_ai": 2, "outside": 3, "unmatched": 4, "no_value": 5}

DDL = [
    """CREATE TABLE IF NOT EXISTS global_registers(
         id text PRIMARY KEY, tenant_id text NOT NULL, user_id text, filename text, created_at timestamptz NOT NULL DEFAULT now(),
         district_col text, value_col text, unit text, threshold double precision, summary jsonb)""",
    "CREATE INDEX IF NOT EXISTS global_registers_who ON global_registers(tenant_id, user_id, created_at DESC)",
    """CREATE TABLE IF NOT EXISTS global_register_rows(
         register_id text NOT NULL REFERENCES global_registers(id) ON DELETE CASCADE, idx int NOT NULL, raw_name text,
         district_id text, district_name text, declared double precision, ai_value double precision, diff_pct double precision,
         status text NOT NULL, PRIMARY KEY(register_id, idx))""",
]
_READY = {"ok": False}


async def ensure_tables():
    """표 두 개를 한 번 만든다(멱등). 앱 역할은 CREATE 권한이 없어 관리 연결로 만들고 앱·워커 역할에 권한을 준다
    (agent/record.py 와 같은 방식 · 마이그레이션 파일로 옮겨도 그대로 동작)."""
    if _READY["ok"]:
        return
    import asyncpg
    conn = await asyncpg.connect(config.PG_ADMIN_DSN)
    try:
        for s in DDL:
            await conn.execute(s)
        await conn.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON global_registers, global_register_rows TO landxi_app")
        await conn.execute("DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='landxi_worker') THEN "
                           "GRANT SELECT ON global_registers, global_register_rows TO landxi_worker; END IF; END $$")
    finally:
        await conn.close()
    _READY["ok"] = True


# ── 파일 읽기 ─────────────────────────────────────────────────────────────────
def read_table(raw: bytes, ext: str) -> tuple[list[str], list[dict]]:
    import pandas as pd
    if ext == "csv":
        for enc in ("utf-8-sig", "cp1251", "cp949"):
            try:
                df = pd.read_csv(io.BytesIO(raw), dtype=str, encoding=enc, keep_default_na=False, sep=None, engine="python")
                break
            except (UnicodeDecodeError, ValueError):
                continue
        else:
            raise ApiError("bad_request", "Cannot read the CSV text encoding (UTF-8)")
    else:
        df = pd.read_excel(io.BytesIO(raw), dtype=str, engine="openpyxl").fillna("")
    cols = [str(c).strip() for c in df.columns]
    df.columns = cols
    rows = [{k: ("" if v is None else str(v)).strip() for k, v in r.items()} for r in df.to_dict(orient="records")]
    rows = [r for r in rows if any(v for v in r.values())]
    return cols, rows


def num(v) -> float | None:
    s = str(v or "").strip().replace(" ", "").replace(" ", "")
    if not s:
        return None
    if re.fullmatch(r"-?\d{1,3}(,\d{3})+(\.\d+)?", s):
        s = s.replace(",", "")
    elif re.fullmatch(r"-?\d+,\d+", s):
        s = s.replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


# ── 구역 맞추기 ───────────────────────────────────────────────────────────────
def _districts() -> list[dict]:
    from agent.tools.ext.global_ import districts
    return districts()


def _key(s: str) -> str:
    s = str(s or "").lower()
    s = re.sub(r"\b(district|rayon|raion|region|oblast|city of|\(city\))\b|район|р-н|айыл аймагы", "", s)
    s = re.sub(r"(ский|ская|ское|инский)\b", "", s)
    return re.sub(r"[^a-z0-9а-яёөүң]", "", s)


def _phon(k: str) -> str:
    """로마자 표기 흔들림을 한 모양으로(키르기스어 지명 음역: dzh·dj·zh→j · i→y · 겹자음 하나)."""
    s = k.replace("dzh", "j").replace("dj", "j").replace("zh", "j").replace("kh", "h").replace("ö", "o").replace("ü", "u")
    s = s.replace("i", "y")
    return re.sub(r"(.)\1+", r"\1", s)


@lru_cache(maxsize=1)
def _cyr() -> dict[str, str]:
    """구역 id → 현지(키릴) 이름 — 경계 파일 name_cyr(있을 때만)."""
    out = {}
    try:
        from agent.tools.ext.global_ import GDATA
        fc = json.loads((GDATA / "kgz-adm2.geojson").read_text(encoding="utf-8"))
        for f in fc.get("features") or []:
            p = f.get("properties") or {}
            if p.get("name_cyr") and "�" not in str(p["name_cyr"]):
                out[str(p.get("code"))] = p["name_cyr"]
    except Exception:
        pass
    return out


def resolve(name: str, ds: list[dict] | None = None) -> tuple[dict | None, str]:
    """구역 이름·코드 → (구역, 맞춘 방법 exact|code|local|close|none). 비슷한 이름은 0.85 이상 · 후보가 하나일 때만."""
    ds = ds if ds is not None else _districts()
    raw = str(name or "").strip()
    if not raw:
        return None, "none"
    for d in ds:
        if raw == str(d["id"]):
            return d, "code"
    k = _key(raw)
    if not k:
        return None, "none"
    for d in ds:
        if _key(d["name"]) == k:
            return d, "exact"
    pk = _phon(k)
    for d in ds:                                     # 로마자 표기 차이(Issyk ↔ Ysyk · Djety ↔ Jeti · Chui ↔ Chuy)
        if _phon(_key(d["name"])) == pk:
            return d, "close"
    cyr = _cyr()
    for d in ds:
        if cyr.get(str(d["id"])) and _key(cyr[str(d["id"])]) == k:
            return d, "local"
    scored = sorted(((difflib.SequenceMatcher(None, k, _key(d["name"])).ratio(), d) for d in ds), key=lambda x: -x[0])
    if scored and scored[0][0] >= 0.85 and (len(scored) == 1 or scored[1][0] < scored[0][0] - 0.05):
        return scored[0][1], "close"
    return None, "none"


def pick_columns(cols: list[str], rows: list[dict], ds: list[dict] | None = None) -> tuple[str | None, str | None, str]:
    """(구역 열, 값 열, 단위). 구역 열 = 경계와 가장 많이 맞는 열. 값 열 = 머리글 낱말 → 숫자 비율 50% 이상 열."""
    ds = ds if ds is not None else _districts()
    sample = rows[:200]
    best, hits = None, 0
    for c in cols:
        n = sum(1 for r in sample if resolve(r.get(c, ""), ds)[0] is not None)
        if n > hits:
            best, hits = c, n
    numeric = [c for c in cols if c != best and sample and sum(1 for r in sample if num(r.get(c)) is not None) >= 0.5 * len(sample)]
    val = None
    for w in VALUE_WORDS:
        val = next((c for c in numeric if w in c.lower()), None)
        if val:
            break
    val = val or (numeric[0] if numeric else None)
    unit = "ha"
    if val:
        for u, rx in UNIT_WORDS:
            if rx.search(val):
                unit = u
                break
    return best, val, unit


@lru_cache(maxsize=1)
def _crop_doc() -> dict:
    for p in CROP_FILES:
        try:
            return json.loads(Path(p).read_text(encoding="utf-8"))
        except Exception:
            continue
    return {}


def ai_value(did: str) -> dict | None:
    """구역 AI 경작지 면적 봉투(ha) · 없으면 None."""
    d = (_crop_doc().get("districts") or {}).get(str(did))
    e = (d or {}).get("crop_ha")
    return e if isinstance(e, dict) and e.get("value") is not None else None


def compare(rows: list[dict], dcol: str, vcol: str | None, unit: str, mine_ids: set[str], threshold: float = THRESHOLD,
            ds: list[dict] | None = None, ai=ai_value) -> list[dict]:
    """행마다 {idx, raw_name, district_id, district_name, declared(ha), ai(ha), diff_pct, status, how}."""
    ds = ds if ds is not None else _districts()
    out = []
    for i, r in enumerate(rows):
        d, how = resolve(r.get(dcol, ""), ds)
        dec = num(r.get(vcol)) if vcol else None
        if dec is not None and unit == "km2":
            dec *= 100.0
        rec = {"idx": i, "raw_name": str(r.get(dcol, ""))[:120], "district_id": d["id"] if d else None, "district_name": d["name"] if d else None,
               "declared": dec, "ai": None, "diff_pct": None, "how": how}
        if not d:
            rec["status"] = "unmatched"
        elif d["id"] not in mine_ids:
            rec["status"] = "outside"                      # 관할 밖 — AI 값을 내지 않는다
        elif dec is None or dec <= 0:
            rec["status"] = "no_value"
        else:
            e = ai(d["id"])
            if not e:
                rec["status"] = "no_ai"
            else:
                a = float(e["value"])
                rec["ai"] = a
                rec["diff_pct"] = (a - dec) / dec * 100.0
                rec["status"] = "mismatch" if abs(rec["diff_pct"]) > threshold else "match"
        out.append(rec)
    return out


def summarize(recs: list[dict], threshold: float) -> dict:
    n = len(recs)
    matched = sum(1 for r in recs if r["district_id"])
    comp = [r for r in recs if r["status"] in ("match", "mismatch")]
    mis = [r for r in comp if r["status"] == "mismatch"]
    return {"rows": n, "matched": matched, "match_pct": round(100.0 * matched / n, 1) if n else 0.0, "compared": len(comp),
            "mismatched": len(mis), "outside": sum(1 for r in recs if r["status"] == "outside"),
            "unmatched": sum(1 for r in recs if r["status"] == "unmatched"), "no_ai": sum(1 for r in recs if r["status"] == "no_ai"),
            "no_value": sum(1 for r in recs if r["status"] == "no_value"), "threshold": threshold}


# ── 봉투로 내보내기 ────────────────────────────────────────────────────────────
def view(reg: dict, rows: list[dict], with_geom: bool = True) -> dict:
    s = reg.get("summary") or {}
    at = reg.get("created_at")
    as_of = at.isoformat(timespec="seconds") if hasattr(at, "isoformat") else (at or now_iso())
    ai_as_of = (_crop_doc().get("fetched_at") or as_of)
    r1 = lambda v: None if v is None else round(float(v), 1)  # noqa: E731
    items = []
    geoms = {d["id"]: d for d in _districts()} if with_geom else {}
    feats = []
    for r in sorted(rows, key=lambda r: (STATUS_ORDER.get(r["status"], 9), -abs(r.get("diff_pct") or 0), r["idx"])):
        it = {"index": r["idx"], "name": r.get("raw_name"), "district": r.get("district_name"), "district_id": r.get("district_id"),
              "status": r["status"]}
        if r.get("declared") is not None and r["status"] != "unmatched":
            it["declared"] = env(r1(r["declared"]), "ha", "recorded", SRC_REG, as_of=as_of)
        if r.get("ai") is not None:
            it["ai"] = env(r1(r["ai"]), "ha", "estimate", SRC_AI, as_of=ai_as_of)
            it["diff"] = env(r1(r["diff_pct"]), "%", "estimate", "AI − declared, as a share of declared", as_of=as_of)
        items.append(it)
        d = geoms.get(r.get("district_id"))
        if d and r["status"] in ("match", "mismatch"):
            from shapely.geometry import mapping
            feats.append({"type": "Feature", "properties": {"district_id": d["id"], "name": d["name"], "status": r["status"]},
                          "geometry": mapping(d["geom"]), "bbox": d["bbox"]})
    src_m = "District names matched to local boundaries"
    return {
        "register": {"id": reg["id"], "filename": reg.get("filename"), "created_at": as_of, "district_col": reg.get("district_col"),
                     "value_col": reg.get("value_col"), "unit": reg.get("unit"), "level": "district"},
        "summary": {
            "rows": env(s.get("rows", 0), "count", "recorded", SRC_REG, as_of=as_of),
            "matched": env(s.get("matched", 0), "count", "measured", src_m, as_of=as_of),
            "match_pct": env(s.get("match_pct", 0.0), "%", "measured", src_m, as_of=as_of),
            "compared": env(s.get("compared", 0), "count", "measured", "Districts in your area with both values", as_of=as_of),
            "mismatched": env(s.get("mismatched", 0), "count", "estimate", f"AI cropland differs from declared by more than {s.get('threshold', THRESHOLD):g}%", as_of=as_of),
            "outside": env(s.get("outside", 0), "count", "recorded", "Rows outside your districts · not compared", as_of=as_of),
            "unmatched": env(s.get("unmatched", 0), "count", "measured", "Rows with no matching district name", as_of=as_of),
            "threshold": env(s.get("threshold", THRESHOLD), "%", "recorded", "Mismatch threshold", as_of=as_of),
        },
        "items": items,
        "geojson": {"type": "FeatureCollection", "features": feats},
        "as_of": as_of,
    }


# ── 저장·읽기 ─────────────────────────────────────────────────────────────────
def _gate(p: Principal, write: bool = False) -> Principal:
    require(p)
    if p.realm == "tenant":
        from agent.tools.ext.global_ import tenant_is_global
        if not tenant_is_global(p.tenant_id):
            raise ApiError("forbidden", "Overseas accounts only")
        if write and p.role not in ("manager", "admin", "staff"):
            raise ApiError("forbidden", "Only the organization manager can upload a register")
    elif p.realm == "lx":
        if write and p.role not in ("staff", "admin"):
            raise ApiError("forbidden", "Read-only account")
    return p


def _tenant(p: Principal) -> str:
    return p.tenant_id or ("lx" if p.realm == "lx" else "")


async def mine_ids(p: Principal) -> set[str]:
    from agent.tools.ext.global_ import districts, mine
    if p.realm == "lx":
        return {d["id"] for d in districts()}
    return {d["id"] for d in await mine(p)}


async def save(p: Principal, filename: str, dcol: str, vcol: str | None, unit: str, threshold: float, recs: list[dict]) -> dict:
    await ensure_tables()
    rid = "greg_" + now_iso()[:10].replace("-", "") + secrets.token_hex(5)
    s = summarize(recs, threshold)
    async with db(realm="lx") as conn:
        await conn.execute("INSERT INTO global_registers(id, tenant_id, user_id, filename, district_col, value_col, unit, threshold, summary) "
                           "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)", rid, _tenant(p), p.user_id, filename[:200], dcol, vcol, unit, threshold,
                           json.dumps(s))
        await conn.executemany("INSERT INTO global_register_rows(register_id, idx, raw_name, district_id, district_name, declared, ai_value, diff_pct, status) "
                               "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
                               [(rid, r["idx"], r["raw_name"], r["district_id"], r["district_name"], r["declared"], r["ai"], r["diff_pct"], r["status"])
                                for r in recs])
        try:
            await audit(conn, p, "global.register.upload", rid, None, {"rows": s["rows"], "matched": s["matched"], "mismatched": s["mismatched"]})
        except Exception:
            pass
    return {"id": rid, "tenant_id": _tenant(p), "user_id": p.user_id, "filename": filename, "district_col": dcol, "value_col": vcol,
            "unit": unit, "threshold": threshold, "summary": s, "created_at": now_iso()}


async def load(p: Principal, rid: str | None = None) -> tuple[dict | None, list[dict]]:
    """rid 가 없으면 이 사람(기관 + 사용자)의 최근 대조. 다른 기관 것은 읽지 않는다."""
    await ensure_tables()
    async with db(realm="lx") as conn:
        if rid:
            reg = await conn.fetchrow("SELECT * FROM global_registers WHERE id=$1 AND tenant_id=$2", rid, _tenant(p))
        else:
            reg = await conn.fetchrow("SELECT * FROM global_registers WHERE tenant_id=$1 AND user_id IS NOT DISTINCT FROM $2 "
                                      "ORDER BY created_at DESC LIMIT 1", _tenant(p), p.user_id)
        if not reg:
            return None, []
        rows = await conn.fetch("SELECT idx, raw_name, district_id, district_name, declared, ai_value AS ai, diff_pct, status "
                                "FROM global_register_rows WHERE register_id=$1 ORDER BY idx", reg["id"])
    reg = dict(reg)
    if isinstance(reg.get("summary"), str):
        reg["summary"] = json.loads(reg["summary"])
    return reg, [dict(r) for r in rows]


# ── 라우트 ──────────────────────────────────────────────────────────────────
@router.post("/global/registers", status_code=201)
async def upload(request: Request, file: UploadFile = File(...), threshold: float | None = Form(None)):
    p = _gate(principal(request), write=True)
    name = file.filename or "register"
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if ext not in EXTS:
        raise ApiError("bad_request", "Upload a CSV or XLSX file", {"allowed": sorted(EXTS)})
    raw = await file.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise ApiError("bad_request", "Files up to 10 MB", status=413)
    try:
        cols, rows = await run_in_threadpool(read_table, raw, ext)
    except ApiError:
        raise
    except Exception as e:
        raise ApiError("bad_request", "Cannot read this file", {"error": type(e).__name__})
    if not rows:
        raise ApiError("bad_request", "The file has no rows")
    ds = _districts()
    dcol, vcol, unit = await run_in_threadpool(pick_columns, cols, rows, ds)
    if not dcol:
        raise ApiError("bad_request", "No column with district names or codes was found")
    th = float(threshold) if threshold and 0 < float(threshold) < 1000 else THRESHOLD
    recs = compare(rows, dcol, vcol, unit, await mine_ids(p), th, ds)
    reg = await save(p, name, dcol, vcol, unit, th, recs)
    return JSONResponse(content=json.loads(json.dumps(view(reg, recs), default=str)), status_code=201)


@router.get("/global/registers/latest")
async def latest(request: Request):
    p = _gate(principal(request))
    reg, rows = await load(p)
    if not reg:
        return {"register": None, "as_of": now_iso()}
    return view(reg, rows)


@router.get("/global/registers/{rid}")
async def one(rid: str, request: Request):
    p = _gate(principal(request))
    reg, rows = await load(p, rid)
    if not reg:
        raise ApiError("not_found", "No such register for this organization")
    return view(reg, rows)
