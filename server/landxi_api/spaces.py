"""기관 분기 공간 1단(구현 3차 · 확인 대장 13차 분기-2 확인 · 분기-3 ⓒ의 1단 · 분기-4 ⓐ · 8차 API-형식 ⓐ · 원칙 38 · 39 · 59 · 72 · 85).

1단 = 모든 기관의 '가벼운 칸'만 — 기관마다 자료 칸(DB 스키마 space_<기관>) · 저장 폴더(tenants/<기관>/space) · 공간 기록(space_log).
상자(컨테이너) · 코드 2차 올리기 · 자동 점검 · 자원 배정 · 서비스별 키(API-키 보류)는 2단 — 여기에 없다.

  [기관 분기 — 우리 공간] 기관 세션만 · 자기 기관만(경로에 기관 id 를 받지 않는다) · 부서 사용자는 배정된 서비스만
  GET  /api/v1/spaces/me                              공간 · 받은 1차 서비스 · 공간 안 알림 · 동의 여부
  GET  /api/v1/spaces/me/guides/{card}                결과 설명서(지금 판 · 여섯 칸 · 바뀐 점 · 지난 판) · 받을 수 있는 파일
  GET  /api/v1/spaces/me/guides/{card}/download?fmt=  내려받기 — geojson(지도 파일) · parcels(필지 엑셀) · summary(요약) · 관할 안만(서버가 자른다)
  POST /api/v1/spaces/me/consent                      내려받기 동의(원칙 59 — 처음 한 번 · 기록)
  POST /api/v1/spaces/me/read                         알림 읽음
  GET  /api/v1/spaces/me/assign                       (기관 관리자) 부서 사용자 · 볼 서비스
  PUT  /api/v1/spaces/me/assign/{user_id}             (기관 관리자) 그 부서 사용자가 볼 서비스 {cards:[…]}
  GET  /api/v1/spaces/me/downloads                    (기관 관리자) 내려받은 기록
  [Land-XI — LX 관리자 대시보드 → 기관 → 기관 공간] 보기 · 지원만(원칙 72 — 고치지 않는다)
  GET  /api/v1/spaces                                 기관마다 한 줄: 받은 1차 서비스 수 · 결과 설명서 최신 판 · 저장 · 방식 · 마지막 갱신
  GET  /api/v1/spaces/{tenant}                        한 기관: 서비스별 판 · 바뀐 점 · 최근 공간 기록

결과 설명서는 사람이 쓰지 않는다 — 1차 서비스를 그 기관에 공개할 때(새 결과 회차 · 새 서비스 버전) 서버가 기록에서 저절로 만든다:
  지문(sig) = 그 기관 × 서비스의 공개 배포본마다 (서비스 버전, 결과 회차). 지문이 처음 보이면 새 판 + 공간 안 알림 한 줄(바뀐 점 한 줄).
  같은 지문이 돌아오면(되돌리기 · 다시 공개) 그 판으로 돌아갈 뿐 새 판을 만들지 않는다. 공간을 처음 볼 때 지난 공개분(직전 회차)도 한 번 채운다(백필 · 알림 없음).
  만드는 때 = 공간 화면 · 관리자 목록을 열 때(20초에 한 번) + 게이트웨이 안 60초 주기(처음 부를 때 시작). 공개한 날은 기록에서(만든 때가 아니다).
'받은 1차 서비스' = 기관 서비스 선택(brand._services)의 켜진 서비스와 같은 판정. 숫자는 서버 값 · 관할 밖 결과는 셈 · 파일 어디에도 없다.
"""
from __future__ import annotations

import asyncio
import datetime as dt
import hashlib
import io
import json
import logging
import re
import secrets
import time
from urllib.parse import quote

from fastapi import APIRouter, Request
from fastapi.responses import Response, StreamingResponse
from starlette.concurrency import run_in_threadpool

from . import config, summary
from .deps import ApiError, Principal, audit, db, principal, require
from .envelope import KST, env, now_iso

router = APIRouter()
log = logging.getLogger("landxi")

TENANT_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,40}$")
CARD_RE = re.compile(r"^card-[a-z0-9-]{2,40}$")
MODE_WORD = {"light": "가벼운 칸", "box": "상자"}
SYNC_EVERY = 20                 # 초 — 화면이 열릴 때 다시 맞춰 보는 최소 간격(기관마다)
LOOP_EVERY = 60                 # 초 — 게이트웨이 안 주기
CONSENT_VER = 1
CONSENT_LINES = [                 # 줄바꿈 기호 = 화면에서 의미 단위로 끊는 자리(법전 §2-1)
    "AI 분석 결과는 참고자료입니다.\n처분은 현장 확인 뒤 사람이 정합니다.",
    "내려받은 파일을 기관 밖에 나눌 때는\n우리 기관이 책임집니다.",
    "누가 · 무엇을 · 언제 내려받았는지 기록이 남고,\n기관 관리자와 LX 관리자가 봅니다.",
]
NOTICE = "AI 분석 결과는 참고자료입니다 — 처분은 현장 확인 뒤 사람이 합니다."
# 믿을 만한 정도 — AI 점수(0–1) 가운데값으로 세 말 중 하나(기본값 · 사용자 결정 전 · 바꾸면 이 표만). 점수는 확률이 아니다.
TRUST = ((0.6, "높음", "AI가 대체로 확신한 결과입니다"),
         (0.35, "보통", "확신한 결과와 아닌 결과가 섞여 있습니다"),
         (0.0, "낮음", "AI가 확신하지 못한 결과가 많습니다 — 다른 회차와 점수를 그대로 견주지 마십시오"))
# 결과 종류의 한글 이름(결과 파일에 영문 코드만 있을 때) — 나머지는 원래 이름(한글이면 그대로)
CLASS_KO = {"styrofoam": "스티로폼", "farmland": "경작지", "cropland": "경작지", "building": "건물", "greenhouse": "비닐하우스", "parking": "주차장",
            "vehicle": "차량", "veg_gain": "식생 늘어남", "veg_loss": "식생 줄어듦", "built_new": "새 건물", "built_gain": "건물 늘어남",
            "built_loss": "건물 줄어듦", "other": "기타 변화"}
CHECK_WORD = {"raw": "확인 전", "edited": "고침", "deleted": "지움"}
NO_EMD = {"관할 밖", ""}        # 읍면동 칸에 남은 자리 표시(바다 등 읍면동 밖) — 이름으로 쓰지 않는다
FMT = {"geojson": ("지도 파일", "GeoJSON", "geojson", "application/geo+json"),
       "parcels": ("필지 엑셀", "엑셀", "xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
       "summary": ("요약", "JSON", "json", "application/json")}


# ── 작은 도구 ────────────────────────────────────────────────────────────────
def _iso(v) -> str | None:
    if v is None:
        return None
    if isinstance(v, str):
        return v
    if isinstance(v, dt.datetime):
        return v.astimezone(KST).isoformat(timespec="seconds")
    return v.isoformat()


def _ymd(v) -> str | None:
    s = _iso(v)
    return s[:10] if s else None


def _has_hangul(s: str) -> bool:
    return any("가" <= ch <= "힣" for ch in s or "")


def class_ko(cls: str | None, cls_en: str | None = None) -> str:
    """결과 종류 → 사람 말(한글 이름은 그대로 · '_' 는 띄어쓰기 · 영문 코드는 표에서)."""
    c = str(cls or cls_en or "").strip()
    if _has_hangul(c):
        return c.replace("_", " ")
    for k in (c, str(cls_en or "")):
        v = CLASS_KO.get(k.lower())
        if v:
            return v
    return c or "기타"


def trust_of(median: float | None) -> dict:
    if median is None:
        return {"level": "알 수 없음", "line": "점수가 붙지 않은 결과입니다"}
    for lo, word, line in TRUST:
        if median >= lo:
            return {"level": word, "line": line}
    return {"level": TRUST[-1][1], "line": TRUST[-1][2]}


def _kind_word(gsd: float | None = None, text: str = "") -> str:
    """영상 종류(사용자 말) — 이름에 드러난 종류 먼저, 없으면 해상도(기관 의뢰 화면과 같은 기준)."""
    t = text or ""
    for w in ("드론", "항공", "위성"):
        if w in t:
            return w + "영상"
    if gsd is None:
        return "영상"
    g = float(gsd)
    return "드론영상" if g < 0.1 else "항공영상" if g < 1 else "위성영상"


def _year_of(*vals) -> str | None:
    for v in vals:
        m = re.search(r"(19|20)\d{2}", str(v or ""))
        if m:
            return m.group(0)
    return None


def _cnt(v, src: str, unit: str = "건", note: str | None = None, basis: str = "recorded") -> dict:
    return env(v, unit, basis, src, note)


async def _tenant_name(conn, t: str) -> str:
    v = await conn.fetchval("SELECT name FROM tenants WHERE id=$1", t)
    nm = (v.get("ko") or v.get("en")) if isinstance(v, dict) else v
    return re.sub(r"\s*\(.*\)$", "", str(nm or t))


def _short_org(name: str) -> str:
    """'전북특별자치도 남원시' → '남원시' · 광역 이름은 그대로."""
    w = str(name or "").split()
    return w[-1] if len(w) > 1 and re.search(r"(시|군|구)$", w[-1]) else str(name or "")


# ── 관할(원칙 39 — 서버가 자른다) ─────────────────────────────────────────────
def _scope_principal(tenant: str) -> Principal:
    return Principal(realm="tenant", role="manager", tenant_id=tenant)


def _scope_codes(tenant: str) -> list[str] | None:
    """기관 관할 시군구 코드(지금 · 옛) — None = 전국(그런 기관은 없다 · LX 전용). [] = 국내 관할 없음(해외 기관)."""
    from . import regions as R
    p = _scope_principal(tenant)
    if R.scope_of(p) is None:
        return None
    out: set[str] = set()
    for r in R.scope_regions(p):
        out.add(r["sgg_cd"])
        if r.get("prev_cd"):
            out.add(r["prev_cd"])
    return sorted(out)


def _keep_points(tenant: str, pts: list) -> list[int]:
    """읍면동 · 필지 번호가 없는 결과(바다 등) — 결과 안 한 점이 관할 안인가(regions.geom_in_scope 와 같은 판정을 한 번에)."""
    if not pts:
        return []
    import numpy as np
    import shapely
    from . import regions as R
    p = _scope_principal(tenant)
    ids = [int(r["id"]) for r in pts]
    xs = np.array([float(r["x"]) for r in pts])
    ys = np.array([float(r["y"]) for r in pts])
    sc = R.scope_of(p)
    if sc is None:
        return ids
    if not sc:                                   # 해외 기관 — 사업 구역 안
        area = R._overseas_area(p)
        if area is None:
            return []
        mask = shapely.contains_xy(area.buffer(0.001), xs, ys)
        return [i for i, k in zip(ids, mask) if k]
    bounds = (float(xs.min()), float(ys.min()), float(xs.max()), float(ys.max()))
    u = R._scope_union(p, bounds)
    if u is None:
        return []
    shapely.prepare(u)                           # 거리 판정(dwithin) — 복잡한 해안선을 넓히는(buffer) 것보다 수백 배 빠르다
    pts = shapely.points(xs, ys)
    inside = shapely.dwithin(u, pts, R.SCOPE_TOL)
    reach = shapely.dwithin(u, pts, R.SEA_REACH)
    cand = (~inside) & reach
    mask = inside.copy()
    if cand.any():
        cb = (float(xs[cand].min()), float(ys[cand].min()), float(xs[cand].max()), float(ys[cand].max()))
        other = R._other_land(p, cb, u)
        if other is not None:
            shapely.prepare(other)
        hit = shapely.intersects_xy(other, xs, ys) if other is not None else np.zeros(len(ids), dtype=bool)
        mask = inside | (cand & ~hit)
    return [i for i, k in zip(ids, mask) if k]


_KEEP: dict[tuple, tuple[float, list[int]]] = {}


async def _keep_ids(tenant: str, sets: list[str]) -> list[int]:
    """관할 판정에 모양이 필요한 결과(읍면동 · 필지 번호 없음)의 남길 id — (기관 · 회차 · 행 수 · 마지막 id)마다 6시간 기억."""
    if not sets:
        return []
    async with db(realm="lx") as c:
        rows = await c.fetch("SELECT id, ST_X(ST_PointOnSurface(geom)) x, ST_Y(ST_PointOnSurface(geom)) y FROM detections "
                             "WHERE job_id = ANY($1::text[]) AND coalesce(emd_cd, pnu) IS NULL AND geom IS NOT NULL", sets)
    if not rows:
        return []
    key = (tenant, tuple(sets), len(rows), max(int(r["id"]) for r in rows))
    hit = _KEEP.get(key)
    if hit and time.time() - hit[0] < 6 * 3600:
        return hit[1]
    ids = await run_in_threadpool(_keep_points, tenant, [dict(r) for r in rows])
    _KEEP[key] = (time.time(), ids)
    while len(_KEEP) > 64:
        _KEEP.pop(next(iter(_KEEP)))
    return ids


def _scope_sql(codes: list[str] | None, first: int) -> tuple[str, list]:
    """detections(d) 관할 조건 · 인자 — 코드(읍면동 · 필지 번호 앞 5자리) 안 또는 모양으로 판정한 id."""
    if codes is None:
        return "TRUE", []
    return f"(left(coalesce(d.emd_cd, d.pnu), 5) = ANY(${first}::text[]) OR d.id = ANY(${first + 1}::bigint[]))", [codes]


# ── 받은 1차 서비스 · 공개 배포본 ─────────────────────────────────────────────
async def received(tenant: str) -> list[dict]:
    """그 기관에 켜진 1차 서비스 — 기관 서비스 선택과 같은 판정(brand._services · open)."""
    from . import brand
    try:
        row = await brand._tenant(tenant)
    except ApiError:
        return []
    intro = row["intro"] or {}
    svcs = await brand._services(tenant, list(row["services"]) if row["services"] else None, intro.get("items") or {}, brand._en(row))
    return [s for s in svcs if s.get("open")]


async def _live_rows(tenant: str, card: str) -> list[dict]:
    async with db(realm="lx") as c:
        return [dict(r) for r in await c.fetch(
            "SELECT id, card_version_id, prev_card_version_id, snapshot_current, snapshot_prev, stage, year, scale, sgg_cd, region_name "
            "FROM deploys WHERE tenant_id=$1 AND card_id=$2 AND stage <> 'draft' AND NOT coalesce(test, false) ORDER BY id", tenant, card)]


def _sig(rows: list[dict]) -> str:
    parts = sorted(f"{r.get('card_version_id') or ''}|{summary.canonical(r.get('snapshot_current')) or ''}" for r in rows)
    return hashlib.sha1("\n".join(parts).encode()).hexdigest()[:20]


def _prev_rows(rows: list[dict]) -> list[dict] | None:
    """직전 회차(배포본 기록의 snapshot_prev · prev_card_version_id) — 지난 공개분 채우기. 없으면 None."""
    if not any(r.get("snapshot_prev") for r in rows):
        return None
    out = []
    for r in rows:
        if r.get("snapshot_prev"):
            out.append({**r, "card_version_id": r.get("prev_card_version_id") or r.get("card_version_id"),
                        "snapshot_current": r["snapshot_prev"], "_prev": True})
        else:
            out.append(r)
    return out


# ── 결과 설명서 여섯 칸 ───────────────────────────────────────────────────────
def _layer(set_key: str | None) -> dict:
    for L in config.load_yaml("sets").get("layers") or []:
        if L.get("set") == set_key:
            return L
    return {}


async def _rounds(conn, rows: list[dict]) -> list[dict]:
    """회차(촬영 · 분석한 날 · 공개한 날) — 기록에서만. 공개한 날이 기록에 없으면 None(지어내지 않는다)."""
    out = []
    logs = {r["id"]: r["changelog"] for r in await conn.fetch("SELECT id, changelog FROM card_versions WHERE id = ANY($1::text[])",
                                                              [x.get("card_version_id") for x in rows if x.get("card_version_id")])}
    for r in rows:
        sid = r.get("snapshot_current")
        if not sid:
            continue
        key = summary.canonical(sid)
        shot = analyzed = published = None
        if key and key.startswith("job_"):
            j = await conn.fetchrow("SELECT imagery_id, finished_at FROM jobs WHERE id=$1", key)
            if j:
                analyzed = _ymd(j["finished_at"])
                if j["imagery_id"]:
                    im = await conn.fetchrow("SELECT name, epoch, year, gsd_m FROM imagery WHERE id=$1", j["imagery_id"])
                    if im:
                        nm = (im["name"] or {}).get("ko") if isinstance(im["name"], dict) else str(im["name"] or "")
                        y = _year_of(im["epoch"], im["year"], nm)
                        shot = f"{y}년 {_kind_word(float(im['gsd_m']) if im['gsd_m'] is not None else None, nm)}" if y else _kind_word(
                            float(im["gsd_m"]) if im["gsd_m"] is not None else None, nm)
            if not r.get("_prev"):
                published = await conn.fetchval("SELECT min(at) FROM audit_log WHERE subject=$1 AND action='flow.result' "
                                                "AND after->>'snapshot_current' = $2", r["id"], sid)
                published = published or (j["finished_at"] if j else None)
        else:
            L = _layer(key)
            nm = " ".join(str(x or "") for x in ((L.get("name") or {}).get("ko"), L.get("attribution"), logs.get(r.get("card_version_id")), key))
            y = _year_of(nm) or (str(r["year"]) if r.get("year") and not r.get("_prev") else None)   # 결과 이름 · 서비스 기록의 해 먼저(직전 회차에 사업 연도를 붙이지 않는다)
            shot = f"{y}년 {_kind_word(None, nm)}" if y else _kind_word(None, nm)
            sc = r.get("scale") or {}
            analyzed = sc.get("as_of") if isinstance(sc, dict) and not r.get("_prev") else None    # 배포본 기록의 분석한 날은 지금 회차 것
            if not r.get("_prev"):
                published = await conn.fetchval("SELECT min(at) FROM approvals WHERE subject_type='deploy' AND subject_id=$1 "
                                                "AND decision='approve'", r["id"])
        from .regions import region_of
        reg = region_of(r.get("sgg_cd")) if r.get("sgg_cd") else None
        out.append({"shot": shot, "analyzed": analyzed, "published": _iso(published), "place": (reg or {}).get("name")})
    return out


async def _stats(tenant: str, sets: list[str]) -> dict:
    """관할 안 결과 집계 — 종류 · 시군구 · 읍면동 · 결과 확인 · 점수 가운데값 · 필지 수."""
    if not sets:
        return {"n": 0, "classes": [], "places": [], "emds": [], "checks": {}, "median": None, "no_score": 0, "with_pnu": 0,
                "with_emd": 0, "no_code": 0, "parcels": 0, "parcel_src": None, "shape": None, "example": None}
    codes = _scope_codes(tenant)
    keep = await _keep_ids(tenant, sets) if codes is not None else []
    cond, args = _scope_sql(codes, 2)
    a = [sets] + args + ([keep] if codes is not None else [])
    live = "d.edit_state <> 'deleted'"
    async with db(realm="lx") as c:
        await c.execute("SET LOCAL jit = off")
        await c.execute(f"CREATE TEMP TABLE _k ON COMMIT DROP AS SELECT d.id, d.cls, d.cls_en, d.conf, d.area_m2, d.emd, d.emd_cd, d.pnu, d.edit_state, "
                        f"d.fid, left(coalesce(d.emd_cd, d.pnu), 5) AS c5, GeometryType(d.geom) AS gt FROM detections d "
                        f"WHERE d.job_id = ANY($1::text[]) AND {cond}", *a)
        n = await c.fetchval(f"SELECT count(*) FROM _k d WHERE {live}")
        classes = [dict(r) for r in await c.fetch(f"SELECT cls, cls_en, count(*) n, coalesce(sum(area_m2), 0) a FROM _k d WHERE {live} "
                                                  "GROUP BY 1, 2 ORDER BY 3 DESC")]
        places = [dict(r) for r in await c.fetch(f"SELECT c5, count(*) n FROM _k d WHERE {live} GROUP BY 1 ORDER BY 2 DESC")]
        emds = [dict(r) for r in await c.fetch(f"SELECT emd, count(*) n FROM _k d WHERE {live} AND emd IS NOT NULL AND emd <> ALL($1::text[]) "
                                               "GROUP BY 1 ORDER BY 2 DESC", list(NO_EMD))]
        checks = {r["edit_state"]: int(r["n"]) for r in await c.fetch("SELECT edit_state, count(*) n FROM _k GROUP BY 1")}
        med = await c.fetchval(f"SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY conf) FROM _k d WHERE {live} AND conf IS NOT NULL")
        no_score = await c.fetchval(f"SELECT count(*) FROM _k d WHERE {live} AND conf IS NULL")
        with_pnu = await c.fetchval(f"SELECT count(*) FROM _k d WHERE {live} AND pnu IS NOT NULL")
        with_emd = await c.fetchval(f"SELECT count(*) FROM _k d WHERE {live} AND emd IS NOT NULL AND emd <> ALL($1::text[])", list(NO_EMD))
        no_code = await c.fetchval(f"SELECT count(*) FROM _k d WHERE {live} AND c5 IS NULL")
        gt = await c.fetchval(f"SELECT gt FROM _k d WHERE {live} GROUP BY gt ORDER BY count(*) DESC LIMIT 1")
        ex = await c.fetchrow(f"SELECT cls, cls_en, conf, area_m2, emd, pnu, edit_state FROM _k d WHERE {live} ORDER BY conf DESC NULLS LAST, id LIMIT 1")
        parcels, psrc = 0, None
        if codes is None or codes:
            stored = await c.fetchval("SELECT to_regclass('public.survey_parcel_ai') IS NOT NULL")
            if stored:
                parcels = await c.fetchval("SELECT count(DISTINCT pnu) FROM survey_parcel_ai WHERE job_id = ANY($1::text[]) AND n1 > 0"
                                           + (" AND left(pnu, 5) = ANY($2::text[])" if codes is not None else ""),
                                           *([sets, codes] if codes is not None else [sets]))
                psrc = "stored" if parcels else None
            if not parcels:
                parcels = await c.fetchval(f"SELECT count(DISTINCT pnu) FROM _k d WHERE {live} AND pnu IS NOT NULL")
                psrc = "detections" if parcels else None
    return {"n": int(n or 0), "classes": classes, "places": places, "emds": emds, "checks": checks,
            "median": float(med) if med is not None else None, "no_score": int(no_score or 0), "with_pnu": int(with_pnu or 0),
            "with_emd": int(with_emd or 0), "no_code": int(no_code or 0), "parcels": int(parcels or 0), "parcel_src": psrc,
            "shape": gt, "example": dict(ex) if ex else None}


SRC_DET = "1차 서비스 결과(이 기관 관할 안 · 지운 결과 제외)"
FRAG_NOTE = "분석 칸마다 나눈 결과라 개수를 싣지 않습니다 — 필지 · 물체 단위로 다듬은 결과에만 붙습니다"


def biz_sets(sets: list[str]) -> bool:
    """결과 세트가 업무 결과(손으로 다듬은 필지 · 물체 단위)인가 — 서비스 카드의 '업무 결과만' 판정(cards._raw_ai: 작업 결과 세트 job_… =
    분석 칸마다 잘린 도형 조각)과 같은 기준에, 셈 단위가 도형 조각인 세트(sets.yaml count_unit polygons)와 결과 목록에 없는 세트를 더 뺀다
    (모르면 업무 결과로 보지 않는다). 업무 결과가 아니면 설명서 · 바뀐 점 · 요약 어디에도 개수를 싣지 않는다(사용자 규칙 2 — 폴리곤 수 노출 금지)."""
    if not sets:
        return False
    from .cards import _raw_ai
    if _raw_ai({"_sets": set(sets)}):
        return False
    return all((_layer(s) or {}).get("count_unit") not in (None, "polygons") for s in sets)


async def build_body(tenant: str, card: str, rows: list[dict]) -> dict:
    """결과 설명서 여섯 칸 — 기록에서만(사람이 쓰는 칸 없음). 숫자는 봉투."""
    from .regions import region_of
    sets = sorted({summary.canonical(r["snapshot_current"]) for r in rows if r.get("snapshot_current")} - {None})
    cvs = sorted({r["card_version_id"] for r in rows if r.get("card_version_id")})
    async with db(realm="lx") as c:
        crow = await c.fetchrow("SELECT c.name, c.domain, c.kind, i.line FROM cards c LEFT JOIN card_info i ON i.card_id = c.id WHERE c.id=$1", card)
        vers = [dict(r) for r in await c.fetch("SELECT id, version, model_ids FROM card_versions WHERE id = ANY($1::text[]) ORDER BY id", cvs)] if cvs else []
        mids = sorted({m for v in vers for m in (v["model_ids"] or [])})
        mcls = [x for r in await c.fetch("SELECT classes FROM models WHERE id = ANY($1::text[])", mids) for x in (r["classes"] or [])] if mids else []
        rounds = await _rounds(c, rows)
    from .cards import _name as card_name
    name = card_name(crow["name"]) if crow else card
    st = await _stats(tenant, sets)
    n = st["n"]
    unit = summary._unit_of(sets[0]) if sets else "건"     # 결과 셈 단위(필지 · 동 · 건) — 대표 수치 요약과 같은 표(sets.yaml count_unit)
    biz = biz_sets(sets)                                    # 업무 결과일 때만 개수(도형 조각 수는 어디에도 싣지 않는다)
    kind = "biz" if biz else ("fragments" if sets else "none")
    # 무엇이
    classes = [{"name": class_ko(x["cls"], x["cls_en"]), "code": x["cls_en"] or x["cls"],
                **({"n": _cnt(int(x["n"]), SRC_DET, unit), "area": env(round(float(x["a"] or 0), 1), "m2", "measured", SRC_DET)} if biz else {})}
               for x in st["classes"]]
    if not classes and mcls:
        seen = []
        for x in mcls:
            k = class_ko(x)
            if k not in seen:
                seen.append(k)
        classes = [{"name": k, "code": None, "n": _cnt(None, SRC_DET, note="첫 결과 전")} for k in seen]
    # 어디
    places = []
    for p in st["places"]:
        r = region_of(p["c5"]) if p["c5"] else None
        if r and r.get("name") and r["name"] not in places:
            places.append(r["name"])
    shape_word = {"MULTIPOLYGON": "구역(테두리가 있는 모양)", "POLYGON": "구역(테두리가 있는 모양)", "POINT": "점", "MULTIPOINT": "점",
                  "LINESTRING": "선", "MULTILINESTRING": "선"}.get(str(st["shape"] or "").upper())
    where = {"shape": shape_word, "places": places, "outside_emd": _cnt(st["no_code"] if (n and biz) else None, SRC_DET, note="바다 등 읍면동 밖"),
             "emd": "모든 결과에 읍면동 이름" if n and st["with_emd"] == n else ("일부 결과에 읍면동 이름" if st["with_emd"] else None),
             "parcel": "필지 번호가 붙음" if st["with_pnu"] else ("필지와 이어 봄" if st["parcels"] else None),
             "crs": "경위도(GPS와 같은 좌표)"}
    # 언제
    when = {"rounds": rounds}
    # 어떤 형식 — 파일 셋(8차 API-형식 ⓐ) · 칸 목록(사람 말 · 단위 · 예)
    ex = st["example"] or {}
    fields = [{"name": "결과 번호", "unit": "", "ex": "결과마다 하나 · 바뀌지 않음"},
              {"name": "종류", "unit": "", "ex": class_ko(ex.get("cls"), ex.get("cls_en")) if ex else (classes[0]["name"] if classes else "")},
              {"name": "AI 점수", "unit": "0–1", "ex": f"{float(ex['conf']):.2f}" if ex.get("conf") is not None else ""},
              {"name": "넓이", "unit": "㎡", "ex": f"{float(ex['area_m2']):,.1f}" if ex.get("area_m2") is not None else ""}]
    if st["with_emd"]:
        fields.append({"name": "읍면동", "unit": "", "ex": ex.get("emd") if ex.get("emd") not in NO_EMD else (st["emds"][0]["emd"] if st["emds"] else "")})
    if st["with_pnu"]:
        fields.append({"name": "필지 번호", "unit": "19자리", "ex": "글자로 저장"})
    fields += [{"name": "결과 확인", "unit": "", "ex": "확인 전 · 고침"}, {"name": "회차 · 서비스 버전", "unit": "", "ex": "파일마다 붙음"}]
    files = [{"fmt": "geojson", "label": "지도 파일", "kind": "GeoJSON", "use": "GIS · 기관 시스템에서 열기", "ok": bool(n), "why": None if n else "결과가 나오면 받을 수 있습니다"},
             {"fmt": "parcels", "label": "필지 엑셀", "kind": "엑셀", "use": "필지 목록을 엑셀로", "ok": bool(st["parcels"]),
              "why": None if st["parcels"] else ("이 서비스 결과는 필지와 잇지 않습니다" if n else "결과가 나오면 받을 수 있습니다"),
              "n": _cnt(st["parcels"] or None, "결과가 걸친 필지(관할 안)", "필지")},
             {"fmt": "summary", "label": "요약", "kind": "JSON", "use": "숫자만 · 기관 시스템 · 현황판용", "ok": True, "why": None}]
    fmt = {"files": files, "fields": fields}
    # 믿을 만한 정도
    tr = trust_of(st["median"]) if n else {"level": None, "line": "결과가 나오면 붙습니다"}
    trust = {**tr, "median": env(round(st["median"], 3) if st["median"] is not None else None, "ratio", "measured", "AI 점수 가운데값(관할 안 결과)"),
             "no_score": _cnt(st["no_score"] if (n and biz) else None, SRC_DET, note="AI 점수가 없는 결과"),
             "checks": {CHECK_WORD.get(k, k): _cnt(v, "결과 확인 기록(관할 안)") for k, v in sorted(st["checks"].items())} if biz else {},
             "note": "AI 점수는 확률이 아닙니다 — 회차 · 영상 종류마다 다릅니다"}
    # 버전
    version = {"service": [v["version"] for v in vers if v.get("version")]}
    return {"service": {"name": name, "line": (crow["line"] if crow else None) or (crow["domain"] if crow else None)},
            "what": {"classes": classes, "kind": kind, "note": FRAG_NOTE if kind == "fragments" else None,
                     "total": _cnt(n if biz else None, SRC_DET, unit, note=None if biz else (FRAG_NOTE if sets else "첫 결과 전"))},
            "where": where, "when": when, "format": fmt, "trust": trust, "version": version, "sets": sets,
            "made": now_iso()}


def change_line(prev: dict | None, cur: dict) -> str:
    """바뀐 점 한 줄 — 앞 판과 견준 것만(서버가 쓴다)."""
    cv = cur.get("version", {}).get("service") or []
    tot = (cur.get("what", {}).get("total") or {}).get("value")
    u = (cur.get("what", {}).get("total") or {}).get("unit") or "건"
    rnd = (cur.get("when", {}).get("rounds") or [])
    shot = " · ".join(sorted({r["shot"] for r in rnd if r.get("shot")}))
    kind = cur.get("what", {}).get("kind") or ("biz" if tot is not None else "none")
    if not prev:
        if tot is not None:
            return f"처음 공개 — {shot + ' · ' if shot else ''}결과 {tot:,}{u}"
        if kind == "fragments" or rnd:                     # 결과는 있으나 업무 결과가 아님(분석 칸 도형 조각) — 개수 없이 회차만
            return f"처음 공개 — {shot}" if shot else "처음 공개"
        return "처음 공개 — 첫 결과 전"
    parts = []
    pv = prev.get("version", {}).get("service") or []
    if pv != cv and cv:
        parts.append(f"서비스 버전 {', '.join(pv) or '없음'} → {', '.join(cv)}")
    prnd = prev.get("when", {}).get("rounds") or []
    pshot = " · ".join(sorted({r["shot"] for r in prnd if r.get("shot")}))
    pan = sorted({r.get("analyzed") or "" for r in prnd})
    can = sorted({r.get("analyzed") or "" for r in rnd})
    if (pshot != shot or pan != can) and rnd:
        an = max((a for a in can if a), default="")
        parts.append(f"새 회차 {shot}{' · ' + an.replace('-', '.') + ' 분석' if an else ''}".strip())
    ptot = (prev.get("what", {}).get("total") or {}).get("value")
    pu = (prev.get("what", {}).get("total") or {}).get("unit") or "건"
    pkind = prev.get("what", {}).get("kind") or ("biz" if ptot is not None else "none")
    if tot is not None:                                    # 개수는 업무 결과(필지 · 동 · 다듬은 결과 건수)끼리만 견준다 — 도형 조각 수는 싣지 않는다
        if pkind == "fragments":
            parts.append(f"결과 단위가 {u}{'로' if u == '필지' else '으로'} 바뀜 · {tot:,}{u}" if u in ("필지", "동") else f"결과 {tot:,}{u}")
        elif ptot is None:
            parts.append(f"결과 {tot:,}{u}")
        elif ptot != tot or pu != u:
            parts.append(f"결과 {ptot:,}{pu} → {tot:,}{u}")
    pk = len(prev.get("what", {}).get("classes") or [])
    ck = len(cur.get("what", {}).get("classes") or [])
    if pk != ck and ck:
        parts.append(f"종류 {pk}가지 → {ck}가지")
    return " · ".join(parts) or "결과 회차가 바뀌었습니다"


# ── 공간 맞추기(판 · 알림 · 백필) ────────────────────────────────────────────
_SYNC_AT: dict[str, float] = {}
_LOCKS: dict[str, asyncio.Lock] = {}
_LOOP: dict[str, object] = {"task": None}


async def _user_tenants() -> list[str]:
    async with db(realm="lx") as c:
        return [r["id"] for r in await c.fetch("SELECT id FROM tenants WHERE kind='user' AND coalesce(status, 'active')='active' ORDER BY id")]


async def ensure_space(t: str) -> dict:
    """가벼운 칸 — 공간 줄 · 자료 칸(스키마) · 저장 폴더. 처음이면 공간 기록 한 줄."""
    async with db(realm="lx") as c:
        row = await c.fetchrow("SELECT tenant_id, mode, db_schema, folder, state, created_at FROM spaces WHERE tenant_id=$1", t)
        if not row:
            s = await c.fetchval("SELECT space_ensure_schema($1)", t)
            await c.execute("INSERT INTO spaces(tenant_id, mode, db_schema, folder) VALUES ($1, 'light', $2, $3) ON CONFLICT (tenant_id) DO NOTHING",
                            t, s, f"tenants/{t}/space")
            row = await c.fetchrow("SELECT tenant_id, mode, db_schema, folder, state, created_at FROM spaces WHERE tenant_id=$1", t)
        if not await c.fetchval("SELECT 1 FROM space_log WHERE tenant_id=$1 AND kind='space' LIMIT 1", t):
            await c.execute("INSERT INTO space_log(tenant_id, kind, line, backfill, at) VALUES ($1, 'space', $2, true, $3)",
                            t, "우리 공간이 생겼습니다 — 방식: 가벼운 칸", row["created_at"])
    try:
        (config.DATA_ROOT / row["folder"] / "guides").mkdir(parents=True, exist_ok=True)
    except Exception as e:  # noqa: BLE001
        log.warning("space folder %s: %r", t, e)
    return dict(row)


def _write_guide_file(folder: str, card: str, edition: int, doc: dict):
    try:
        d = config.DATA_ROOT / folder / "guides" / card
        d.mkdir(parents=True, exist_ok=True)
        (d / f"{edition}.json").write_text(json.dumps(doc, ensure_ascii=False, indent=1, default=str), encoding="utf-8")
    except Exception as e:  # noqa: BLE001
        log.warning("space guide file %s/%s: %r", card, edition, e)


async def _add_edition(t: str, card: str, name: str, rows: list[dict], sig: str, backfill: bool, folder: str) -> bool:
    body = await build_body(t, card, rows)
    rnd = body["when"]["rounds"]
    pub = max((r["published"] for r in rnd if r.get("published")), default=None)
    if not pub and not rnd and not any(r.get("_prev") for r in rows):     # 결과 전 서비스 — 공개한 날 = 배포 승인 기록(없으면 비워 둔다)
        async with db(realm="lx") as c:
            pub = _iso(await c.fetchval("SELECT min(at) FROM approvals WHERE subject_type='deploy' AND subject_id = ANY($1::text[]) AND decision='approve'",
                                        [r["id"] for r in rows]))
    async with db(realm="lx") as c:
        await c.execute("SELECT pg_advisory_xact_lock(hashtext($1))", f"space:{t}:{card}")
        if await c.fetchval("SELECT 1 FROM space_guides WHERE tenant_id=$1 AND card_id=$2 AND sig=$3", t, card, sig):
            return False
        prev = await c.fetchrow("SELECT body FROM space_guides WHERE tenant_id=$1 AND card_id=$2 ORDER BY edition DESC LIMIT 1", t, card)
        ed = int(await c.fetchval("SELECT coalesce(max(edition), 0) + 1 FROM space_guides WHERE tenant_id=$1 AND card_id=$2", t, card))
        ch = change_line(prev["body"] if prev else None, body)
        gid = "sg_" + secrets.token_hex(6)
        pub_at = dt.datetime.fromisoformat(pub) if pub else None
        await c.execute("INSERT INTO space_guides(id, tenant_id, card_id, edition, sig, body, change, published_at, backfill) "
                        "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)", gid, t, card, ed, sig, body, ch, pub_at, backfill)
        await c.execute("INSERT INTO space_log(tenant_id, kind, card_id, guide_id, line, backfill, at) VALUES ($1,'guide',$2,$3,$4,$5,$6)",
                        t, card, gid, f"{name} 결과 설명서 {ed}판 — {ch}", backfill, pub_at if backfill and pub_at else dt.datetime.now(KST))
    _write_guide_file(folder, card, ed, {"tenant": t, "card": card, "edition": ed, "change": ch, "published_at": pub, "body": body})
    if not backfill:                                  # 새 결과 알림 = 머리의 종(알림 칸) + 메일 한 줄(18차 N-1 ⓐ 알림 ⓑ · 메일 설정이 없으면 종만)
        try:
            from . import mailer
            asyncio.get_running_loop().create_task(mailer.notify_new_result(t, card, name, ed, ch))
        except Exception as e:  # noqa: BLE001
            log.warning("mail new result %s/%s: %r", t, card, e)
    return True


async def _sync_one(t: str):
    lock = _LOCKS.setdefault(t, asyncio.Lock())
    async with lock:
        sp = await ensure_space(t)
        for s in await received(t):
            card = s["card"]
            rows = await _live_rows(t, card)
            if not rows:
                continue
            sig = _sig(rows)
            async with db(realm="lx") as c:
                have = {r["sig"] for r in await c.fetch("SELECT sig FROM space_guides WHERE tenant_id=$1 AND card_id=$2", t, card)}
            if sig in have:
                continue
            first = not have
            if first:                                            # 지난 공개분(직전 회차)부터 한 번 채운다
                pr = _prev_rows(rows)
                if pr is not None and _sig(pr) != sig:
                    await _add_edition(t, card, s["name"], pr, _sig(pr), True, sp["folder"])
            await _add_edition(t, card, s["name"], rows, sig, first, sp["folder"])


async def sync(tenant: str | None = None, *, force: bool = False):
    """기관 공간 맞추기 — 기관마다 SYNC_EVERY 초에 한 번(force 면 바로). 실패는 로그 한 줄(화면은 지금 있는 판을 그대로 보인다)."""
    _ensure_loop()
    ts = [tenant] if tenant else await _user_tenants()
    for t in ts:
        if not force and time.time() - _SYNC_AT.get(t, 0) < SYNC_EVERY:
            continue
        _SYNC_AT[t] = time.time()
        try:
            await _sync_one(t)
        except Exception as e:  # noqa: BLE001
            log.warning("space sync %s: %r", t, e)


def _ensure_loop():
    """게이트웨이 안 60초 주기(처음 부를 때 시작) — 아무도 화면을 열지 않아도 새 회차 공개가 판 · 알림이 된다."""
    task = _LOOP.get("task")
    if task is not None and not task.done():
        return
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return

    async def run():
        while True:
            await asyncio.sleep(LOOP_EVERY)
            try:
                for t in await _user_tenants():
                    if time.time() - _SYNC_AT.get(t, 0) >= SYNC_EVERY:
                        _SYNC_AT[t] = time.time()
                        await _sync_one(t)
            except Exception as e:  # noqa: BLE001
                log.warning("space loop: %r", e)
    _LOOP["task"] = loop.create_task(run())


# ── 누가 무엇을 보나 ─────────────────────────────────────────────────────────
def _me(request: Request) -> Principal:
    p = require(principal(request), realm="tenant")
    if not p.tenant_id or not TENANT_RE.match(p.tenant_id):
        raise ApiError("forbidden", "기관 계정 전용")
    return p


async def _visible(p: Principal, svcs: list[dict]) -> list[dict]:
    """기관 관리자 = 받은 서비스 전부 · 부서 사용자 = 기관 관리자가 정해 준 서비스만(원칙 38)."""
    if p.is_lx or p.role == "manager":
        return svcs
    async with db(p) as c:
        mine = {r["card_id"] for r in await c.fetch("SELECT card_id FROM space_assign WHERE tenant_id=$1 AND user_id=$2", p.tenant_id, p.user_id)}
    return [s for s in svcs if s["card"] in mine]


async def _current(c, t: str, card: str, rows: list[dict] | None = None) -> dict | None:
    """지금 판 = 지금 공개 배포본의 지문과 같은 판(되돌리면 그 판) · 없으면 가장 최근 판."""
    rows = rows if rows is not None else await _live_rows(t, card)
    sig = _sig(rows) if rows else None
    r = None
    if sig:
        r = await c.fetchrow("SELECT * FROM space_guides WHERE tenant_id=$1 AND card_id=$2 AND sig=$3", t, card, sig)
    if not r:
        r = await c.fetchrow("SELECT * FROM space_guides WHERE tenant_id=$1 AND card_id=$2 ORDER BY edition DESC LIMIT 1", t, card)
    return dict(r) if r else None


def _ed(n) -> dict:
    return env(int(n), "count", "recorded", "결과 설명서 판(서비스마다)")


async def _guide_or_404(p: Principal, card: str) -> tuple[dict, dict, list[dict]]:
    if not CARD_RE.match(card or ""):
        raise ApiError("not_found", "없는 서비스입니다")
    svcs = await _visible(p, await received(p.tenant_id))
    svc = next((s for s in svcs if s["card"] == card), None)
    if not svc:                                       # 받지 않은 서비스 · 부서에 배정되지 않은 서비스 = 없는 서비스(있다는 것도 알리지 않는다)
        raise ApiError("not_found", "없는 서비스입니다")
    rows = await _live_rows(p.tenant_id, card)
    async with db(p) as c:
        g = await _current(c, p.tenant_id, card, rows)
    if not g:
        await sync(p.tenant_id, force=True)
        async with db(p) as c:
            g = await _current(c, p.tenant_id, card, rows)
    if not g:
        raise ApiError("not_found", "결과 설명서가 아직 없습니다")
    return svc, g, rows


# ── [기관 분기] 우리 공간 ─────────────────────────────────────────────────────
@router.get("/spaces/me")
async def space_me(request: Request):
    p = _me(request)
    await sync(p.tenant_id)
    svcs = await _visible(p, await received(p.tenant_id))
    cards = [s["card"] for s in svcs]
    async with db(p) as c:
        sp = await c.fetchrow("SELECT mode, state, created_at FROM spaces WHERE tenant_id=$1", p.tenant_id)
        seen = await c.fetchval("SELECT seen_at FROM space_reads WHERE tenant_id=$1 AND user_id=$2", p.tenant_id, p.user_id)
        cons = await c.fetchrow("SELECT ver, at FROM space_consents WHERE tenant_id=$1 AND user_id=$2", p.tenant_id, p.user_id)
        out_svcs = []
        for s in svcs:
            g = await _current(c, p.tenant_id, s["card"])
            last = await c.fetchrow("SELECT edition, created_at, backfill FROM space_guides WHERE tenant_id=$1 AND card_id=$2 ORDER BY edition DESC LIMIT 1",
                                    p.tenant_id, s["card"])
            out_svcs.append({"card": s["card"], "name": s["name"], "status": s.get("status"),
                             "edition": _ed(g["edition"]) if g else None, "latest": _ed(last["edition"]) if last else None,
                             "version": ", ".join((g["body"].get("version") or {}).get("service") or []) if g else None,
                             "updated": _iso(g["published_at"] or g["created_at"]) if g else None,
                             "new": bool(last and not last["backfill"] and (seen is None or last["created_at"] > seen))})
        notes = await c.fetch("SELECT l.id, l.card_id, l.line, l.at, l.backfill, g.edition, g.change FROM space_log l LEFT JOIN space_guides g ON g.id = l.guide_id "
                              "WHERE l.tenant_id=$1 AND l.kind='guide' AND l.card_id = ANY($2::text[]) ORDER BY l.at DESC, l.id DESC LIMIT 20",
                              p.tenant_id, cards) if cards else []
        org = await _tenant_name(c, p.tenant_id)
    unread = [n for n in notes if not n["backfill"] and (seen is None or n["at"] > seen)]
    names = {s["card"]: s["name"] for s in svcs}
    return {"org": {"name": org, "short": _short_org(org)},
            "space": {"mode": (sp or {}).get("mode", "light"), "mode_word": MODE_WORD.get((sp or {}).get("mode", "light")), "since": _iso((sp or {}).get("created_at"))},
            "role": p.role, "can_assign": p.role == "manager",
            "services": out_svcs,
            "notices": [{"id": str(n["id"]), "card": n["card_id"], "name": names.get(n["card_id"], ""), "line": n["line"],
                         "edition": _ed(n["edition"]) if n["edition"] is not None else None, "change": n["change"],
                         "at": _iso(n["at"]), "past": bool(n["backfill"]), "unread": n in unread} for n in notes],
            "unread": _cnt(len(unread), "공간 안 알림(새 판 · 읽지 않음)"),
            "consent": {"done": bool(cons and cons["ver"] >= CONSENT_VER), "lines": CONSENT_LINES},
            "as_of": now_iso()}


@router.get("/spaces/me/guides/{card}")
async def space_guide(card: str, request: Request):
    p = _me(request)
    await sync(p.tenant_id)
    svc, g, rows = await _guide_or_404(p, card)
    async with db(p) as c:
        hist = await c.fetch("SELECT edition, change, published_at, backfill, created_at, sig FROM space_guides WHERE tenant_id=$1 AND card_id=$2 "
                             "ORDER BY edition DESC", p.tenant_id, card)
    body = dict(g["body"])
    body.pop("sets", None)
    return {"card": card, "name": svc["name"], "status": svc.get("status"),
            "edition": _ed(g["edition"]), "change": g["change"], "published_at": _iso(g["published_at"]), "made_at": _iso(g["created_at"]),
            "past": bool(g["backfill"]), "current": True, "body": body,
            "history": [{"edition": _ed(h["edition"]), "change": h["change"], "published_at": _iso(h["published_at"]), "past": bool(h["backfill"]),
                         "made_at": _iso(h["created_at"]), "current": h["sig"] == g["sig"]} for h in hist],
            "as_of": now_iso()}


@router.post("/spaces/me/consent")
async def space_consent(request: Request, body: dict | None = None):
    p = _me(request)
    if not (body or {}).get("agree"):
        raise ApiError("bad_request", "동의가 필요합니다")
    async with db(p) as c:
        await c.execute("INSERT INTO space_consents(tenant_id, user_id, realm, ver, at) VALUES ($1,$2,'tenant',$3,now()) "
                        "ON CONFLICT (tenant_id, user_id) DO UPDATE SET ver=EXCLUDED.ver, at=now()", p.tenant_id, p.user_id, CONSENT_VER)
        await c.execute("INSERT INTO space_log(tenant_id, kind, line, actor, realm) VALUES ($1,'consent',$2,$3,'tenant')",
                        p.tenant_id, f"{p.name or '담당자'} — 내려받기 이용 약속에 동의", p.user_id)
        await audit(c, p, "space.consent", p.tenant_id, None, {"ver": CONSENT_VER})
    return {"ok": True, "consent": {"done": True}}


@router.post("/spaces/me/read")
async def space_read(request: Request):
    p = _me(request)
    async with db(p) as c:
        await c.execute("INSERT INTO space_reads(tenant_id, user_id, seen_at) VALUES ($1,$2,now()) "
                        "ON CONFLICT (tenant_id, user_id) DO UPDATE SET seen_at=now()", p.tenant_id, p.user_id)
    return {"ok": True}


# ── 내려받기(지도 파일 · 필지 엑셀 · 요약) ────────────────────────────────────
def _fname(org: str, svc: str, edition: int, ext: str) -> str:
    base = re.sub(r"[\\/:*?\"<>|\s]+", "_", f"{_short_org(org)}_{svc}_결과설명서{edition}판").strip("_")
    return f"{base}.{ext}"


def _disposition(name: str) -> str:
    return f"attachment; filename=\"space.{name.rsplit('.', 1)[-1]}\"; filename*=UTF-8''{quote(name)}"


def _round_label(body: dict) -> str:
    rnd = body.get("when", {}).get("rounds") or []
    parts = []
    for r in rnd:
        s = " · ".join(x for x in (r.get("place"), r.get("shot"), (r.get("analyzed") or "").replace("-", ".") + " 분석" if r.get("analyzed") else None) if x)
        if s and s not in parts:
            parts.append(s)
    return " / ".join(parts)


async def _log_download(p: Principal, card: str, g: dict, fmt: str, rows: int, svc_name: str):
    label = FMT[fmt][0]
    async with db(p) as c:
        await c.execute("INSERT INTO space_log(tenant_id, kind, card_id, guide_id, line, actor, realm, detail) VALUES ($1,'download',$2,$3,$4,$5,'tenant',$6)",
                        p.tenant_id, card, g["id"], f"{p.name or '담당자'} — {svc_name} {label} 내려받기({g['edition']}판)", p.user_id,
                        {"fmt": fmt, "rows": rows, "edition": g["edition"]})
        await audit(c, p, "space.download", f"{p.tenant_id}/{card}", None, {"fmt": fmt, "rows": rows, "edition": g["edition"]})


async def _feature_rows(t: str, sets: list[str]):
    """관할 안 결과(지운 것 제외) — 한 번에 2,000줄씩 꺼낸다(시군구 전역 결과도 메모리에 다 올리지 않는다)."""
    codes = _scope_codes(t)
    keep = await _keep_ids(t, sets) if codes is not None else []
    cond, args = _scope_sql(codes, 2)
    a = [sets] + args + ([keep] if codes is not None else [])
    async with db(realm="lx") as c:
        cur = c.cursor(f"SELECT d.id, d.fid, d.cls, d.cls_en, d.conf, d.area_m2, d.emd, d.pnu, d.edit_state, ST_AsGeoJSON(d.geom, 7) AS g "
                       f"FROM detections d WHERE d.job_id = ANY($1::text[]) AND d.edit_state <> 'deleted' AND {cond} ORDER BY d.id", *a, prefetch=2000)
        async for r in cur:
            yield r


async def _geojson(p: Principal, org: str, svc: dict, g: dict):
    body = g["body"]
    sets = body.get("sets") or []
    ver = ", ".join(body.get("version", {}).get("service") or [])
    rl = _round_label(body)
    meta = {"기관": org, "서비스": svc["name"], "결과 설명서": f"{g['edition']}판", "회차": rl, "서비스 버전": ver, "만든 때": now_iso(),
            "안내": NOTICE, "좌표": "경위도(EPSG:4326)",
            "열 설명": {"id": "결과 번호(바뀌지 않음)", "kind": "종류", "code": "종류 코드(원래 결과 파일의 이름)", "score": "AI 점수 0–1(확률 아님)",
                     "area": "넓이 ㎡", "emd": "읍면동(바다 등 읍면동 밖이면 비어 있음)", "parcel": "필지 번호 19자리(글자)", "check": "결과 확인(확인 전 · 고침)",
                     "round": "회차", "version": "서비스 버전", "edition": "결과 설명서 판"}}
    yield b'{"type":"FeatureCollection","lx":' + json.dumps(meta, ensure_ascii=False).encode() + b',"features":['
    first = True
    async for r in _feature_rows(p.tenant_id, sets):
        props = {"id": r["fid"] or str(r["id"]), "kind": class_ko(r["cls"], r["cls_en"]), "code": r["cls_en"] or r["cls"],
                 "score": round(float(r["conf"]), 3) if r["conf"] is not None else None,
                 "area": round(float(r["area_m2"]), 1) if r["area_m2"] is not None else None,
                 "emd": r["emd"] if r["emd"] not in NO_EMD else None, "parcel": r["pnu"], "check": CHECK_WORD.get(r["edit_state"], r["edit_state"]),
                 "round": rl, "version": ver, "edition": g["edition"]}
        f = '{"type":"Feature","id":' + json.dumps(props["id"]) + ',"geometry":' + (r["g"] or "null") + ',"properties":' + json.dumps(props, ensure_ascii=False) + "}"
        yield (b"" if first else b",") + f.encode()
        first = False
    yield b"]}"


async def _parcel_rows(t: str, sets: list[str], src: str | None) -> tuple[list[dict], str]:
    codes = _scope_codes(t)
    if codes is not None and not codes:
        return [], "none"
    pc = " AND left(x.pnu, 5) = ANY($2::text[])" if codes is not None else ""
    args = [sets] + ([codes] if codes is not None else [])
    async with db(realm="lx") as c:
        await c.execute("SET LOCAL jit = off")
        if src == "stored":
            rows = await c.fetch(
                "SELECT x.pnu, max(x.emd) emd, max(x.jimok_nm) jimok, max(x.parcel_m2) parcel_m2, sum(x.n1) n, sum(x.hit1_m2) hit, "
                "sum(x.conf1_sum) / nullif(sum(x.n1), 0) conf, array_agg(DISTINCT x.cls_ko) FILTER (WHERE x.n1 > 0) classes "
                f"FROM survey_parcel_ai x WHERE x.job_id = ANY($1::text[]){pc} GROUP BY x.pnu HAVING sum(x.n1) > 0 ORDER BY sum(x.hit1_m2) DESC NULLS LAST, x.pnu", *args)
            how = "stored"
        else:
            rows = await c.fetch(
                "SELECT x.pnu, max(x.emd) emd, NULL::text jimok, NULL::numeric parcel_m2, count(*) n, sum(x.area_m2) hit, avg(x.conf) conf, "
                "array_agg(DISTINCT x.cls) classes FROM detections x WHERE x.job_id = ANY($1::text[]) AND x.edit_state <> 'deleted' "
                f"AND x.pnu IS NOT NULL{pc} GROUP BY x.pnu ORDER BY sum(x.area_m2) DESC NULLS LAST, x.pnu", *args)
            how = "detections"
        out = [dict(r) for r in rows]
        if out:
            attrs = {a["pnu"]: dict(a) for a in await c.fetch("SELECT pnu, addr, emd, jimok_nm, area_m2 FROM survey_parcels WHERE pnu = ANY($1::text[])",
                                                               [r["pnu"] for r in out])}
            for r in out:
                a = attrs.get(r["pnu"]) or {}
                r["addr"] = a.get("addr")
                r["emd"] = r.get("emd") if r.get("emd") not in NO_EMD else None
                r["emd"] = r["emd"] or a.get("emd")
                r["jimok"] = r.get("jimok") or a.get("jimok_nm")
                r["parcel_m2"] = r.get("parcel_m2") or a.get("area_m2")
    return out, how


def _xlsx(org: str, svc: dict, g: dict, rows: list[dict], how: str) -> bytes:
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    body = g["body"]
    ver = ", ".join(body.get("version", {}).get("service") or [])
    rl = _round_label(body)
    hit_col = "필지와 겹친 넓이(㎡)" if how == "stored" else "AI 결과 넓이(㎡)"
    cols = ["필지 번호", "주소", "읍면동", "지목", "필지 넓이(㎡)", "AI가 본 것", "결과 수", hit_col, "필지 대비 비율(%)", "믿을 만한 정도", "회차", "서비스 버전"]
    wb = Workbook()
    ws = wb.active
    ws.title = "필지"
    ws.append(cols)
    head_fill = PatternFill("solid", fgColor="F2F4F6")
    for cell in ws[1]:
        cell.font = Font(bold=True)
        cell.fill = head_fill
        cell.alignment = Alignment(vertical="center")
    for r in rows:
        pm = float(r["parcel_m2"]) if r.get("parcel_m2") is not None else None
        hit = float(r["hit"]) if r.get("hit") is not None else None
        ratio = round(hit / pm * 100, 1) if pm and hit is not None else None
        conf = float(r["conf"]) if r.get("conf") is not None else None
        ws.append([str(r["pnu"]), r.get("addr") or "", r.get("emd") or "", r.get("jimok") or "", round(pm, 1) if pm is not None else None,
                   " · ".join(sorted({class_ko(x) for x in (r.get("classes") or []) if x})), int(r["n"] or 0),
                   round(hit, 1) if hit is not None else None, ratio, trust_of(conf)["level"] if conf is not None else "", rl, ver])
    for row in ws.iter_rows(min_row=2, min_col=1, max_col=1):
        for cell in row:
            cell.number_format = "@"                      # 19자리 필지 번호 = 글자(엑셀이 1.23E+18 로 바꾸지 않게)
    widths = [22, 34, 12, 10, 14, 22, 10, 18, 16, 14, 34, 12]
    for i, w in enumerate(widths):
        ws.column_dimensions[chr(65 + i)].width = w
    ws.freeze_panes = "A2"
    d = wb.create_sheet("열 설명")
    d.append(["열", "뜻"])
    for k, v in [("필지 번호", "19자리 필지 번호 — 글자로 저장했습니다"), ("주소", "필지 주소(지번)"), ("읍면동", "필지가 있는 읍면동"),
                 ("지목", "대장 지목"), ("필지 넓이(㎡)", "필지 전체 넓이"), ("AI가 본 것", "이 필지에 걸친 AI 결과의 종류"),
                 ("결과 수", "이 필지에 걸친 AI 결과 수"),
                 (hit_col, "AI 결과가 필지와 겹친 넓이" if how == "stored" else "이 필지 번호가 붙은 AI 결과의 넓이 합"),
                 ("필지 대비 비율(%)", "위 넓이 ÷ 필지 넓이"), ("믿을 만한 정도", "AI 점수 평균으로 본 높음 · 보통 · 낮음(점수는 확률이 아님)"),
                 ("회차", "촬영 · 분석한 날"), ("서비스 버전", "결과를 만든 서비스 버전")]:
        d.append([k, v])
    d.column_dimensions["A"].width = 22
    d.column_dimensions["B"].width = 70
    i = wb.create_sheet("안내")
    for k, v in [("기관", org), ("서비스", svc["name"]), ("결과 설명서", f"{g['edition']}판"), ("회차", rl), ("서비스 버전", ver),
                 ("만든 때", now_iso()), ("필지 수", len(rows)), ("안내", NOTICE)]:
        i.append([k, v])
    i.column_dimensions["A"].width = 14
    i.column_dimensions["B"].width = 80
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _summary_doc(org: str, svc: dict, g: dict, parcels: int | None) -> dict:
    b = g["body"]
    tr = b.get("trust") or {}
    return {"기관": org, "서비스": svc["name"], "결과 설명서": f"{g['edition']}판", "회차": b.get("when", {}).get("rounds") or [],
            "서비스 버전": b.get("version", {}).get("service") or [], "만든 때": now_iso(),
            "결과": {"값": (b.get("what", {}).get("total") or {}).get("value"), "단위": (b.get("what", {}).get("total") or {}).get("unit") or "건",
                   "뜻": "이 기관 관할 안 결과(지운 결과 제외)" if b.get("what", {}).get("kind") == "biz" else (b.get("what", {}).get("note") or "첫 결과 전")},
            "종류별": [{"종류": x["name"], "코드": x.get("code"), **({"개수": x["n"].get("value"), "넓이_㎡": (x.get("area") or {}).get("value")} if x.get("n") else {})}
                     for x in b.get("what", {}).get("classes") or []],
            "시군구": b.get("where", {}).get("places") or [],
            "필지": {"값": parcels, "단위": "필지"} if parcels else None,
            "믿을 만한 정도": {"말": tr.get("level"), "뜻": tr.get("line"), "AI 점수 가운데값": (tr.get("median") or {}).get("value"),
                         "참고": tr.get("note")},
            "결과 확인": {k: (v or {}).get("value") for k, v in (tr.get("checks") or {}).items()},
            "안내": NOTICE}


@router.get("/spaces/me/guides/{card}/download")
async def space_download(card: str, request: Request, fmt: str = "geojson"):
    p = _me(request)
    if fmt not in FMT:
        raise ApiError("bad_request", "형식은 geojson · parcels · summary 가운데 하나")
    svc, g, _rows = await _guide_or_404(p, card)
    async with db(p) as c:
        cons = await c.fetchrow("SELECT ver FROM space_consents WHERE tenant_id=$1 AND user_id=$2", p.tenant_id, p.user_id)
        org = await _tenant_name(c, p.tenant_id)
    if not cons or cons["ver"] < CONSENT_VER:
        raise ApiError("conflict", "내려받기 전에 이용 약속에 동의해 주세요", {"need": "consent", "lines": CONSENT_LINES}, 409)
    body = g["body"]
    files = {f["fmt"]: f for f in (body.get("format") or {}).get("files") or []}
    if not files.get(fmt, {}).get("ok"):
        raise ApiError("not_found", files.get(fmt, {}).get("why") or "이 형식은 받을 수 없습니다")
    label, _kind, ext, mime = FMT[fmt]
    name = _fname(org, svc["name"], g["edition"], ext)
    total = (body.get("what", {}).get("total") or {}).get("value") or 0
    if fmt == "geojson":
        await _log_download(p, card, g, fmt, int(total), svc["name"])
        return StreamingResponse(_geojson(p, org, svc, g), media_type=mime, headers={"content-disposition": _disposition(name), "cache-control": "no-store"})
    if fmt == "parcels":
        rows, how = await _parcel_rows(p.tenant_id, body.get("sets") or [], await _parcel_src(p.tenant_id, body.get("sets") or []))
        if not rows:
            raise ApiError("not_found", "이 서비스 결과는 필지와 잇지 않습니다")
        data = await run_in_threadpool(_xlsx, org, svc, g, rows, how)
        await _log_download(p, card, g, fmt, len(rows), svc["name"])
        return Response(data, media_type=mime, headers={"content-disposition": _disposition(name), "cache-control": "no-store"})
    parcels = ((files.get("parcels") or {}).get("n") or {}).get("value")
    data = json.dumps(_summary_doc(org, svc, g, parcels), ensure_ascii=False, indent=1).encode()
    await _log_download(p, card, g, fmt, int(total), svc["name"])
    return Response(data, media_type=mime + "; charset=utf-8", headers={"content-disposition": _disposition(name), "cache-control": "no-store"})


async def _parcel_src(t: str, sets: list[str]) -> str | None:
    if not sets:
        return None
    async with db(realm="lx") as c:
        if await c.fetchval("SELECT to_regclass('public.survey_parcel_ai') IS NOT NULL") and \
                await c.fetchval("SELECT EXISTS(SELECT 1 FROM survey_parcel_ai WHERE job_id = ANY($1::text[]) AND n1 > 0)", sets):
            return "stored"
    return "detections"


# ── 부서 사용자가 볼 서비스(기관 관리자) ─────────────────────────────────────
def _mgr(request: Request) -> Principal:
    p = _me(request)
    if p.role != "manager":
        raise ApiError("forbidden", "기관 관리자만 정할 수 있습니다")
    return p


@router.get("/spaces/me/assign")
async def space_assign_list(request: Request):
    p = _mgr(request)
    svcs = await received(p.tenant_id)
    async with db(p) as c:
        users = await c.fetch("SELECT id, name, dept FROM tenant_users WHERE tenant_id=$1 AND role='viewer' AND coalesce(status,'active')='active' "
                              "ORDER BY dept NULLS LAST, name", p.tenant_id)
        asg = await c.fetch("SELECT user_id, card_id FROM space_assign WHERE tenant_id=$1", p.tenant_id)
    by: dict[str, list[str]] = {}
    for a in asg:
        by.setdefault(a["user_id"], []).append(a["card_id"])
    return {"services": [{"card": s["card"], "name": s["name"]} for s in svcs],
            "users": [{"id": u["id"], "name": u["name"] or "", "dept": u["dept"] or "", "cards": sorted(by.get(u["id"], []))} for u in users],
            "as_of": now_iso()}


@router.put("/spaces/me/assign/{user_id}")
async def space_assign_put(user_id: str, request: Request, body: dict | None = None):
    p = _mgr(request)
    want = [str(x) for x in ((body or {}).get("cards") or []) if isinstance(x, str)]
    ok_cards = {s["card"] for s in await received(p.tenant_id)}
    bad = [x for x in want if x not in ok_cards]
    if bad:
        raise ApiError("bad_request", "우리 기관이 받은 서비스만 고를 수 있습니다", {"cards": bad})
    async with db(p) as c:
        u = await c.fetchrow("SELECT id, name, role FROM tenant_users WHERE id=$1 AND tenant_id=$2", user_id, p.tenant_id)
        if not u or u["role"] != "viewer":
            raise ApiError("not_found", "우리 기관의 부서 사용자가 아닙니다")
        before = sorted(r["card_id"] for r in await c.fetch("SELECT card_id FROM space_assign WHERE tenant_id=$1 AND user_id=$2", p.tenant_id, user_id))
        await c.execute("DELETE FROM space_assign WHERE tenant_id=$1 AND user_id=$2", p.tenant_id, user_id)
        for cid in sorted(set(want)):
            await c.execute("INSERT INTO space_assign(tenant_id, user_id, card_id, by_user) VALUES ($1,$2,$3,$4)", p.tenant_id, user_id, cid, p.user_id)
        names = {s["card"]: s["name"] for s in await received(p.tenant_id)}
        await c.execute("INSERT INTO space_log(tenant_id, kind, line, actor, realm, detail) VALUES ($1,'assign',$2,$3,'tenant',$4)",
                        p.tenant_id, f"{u['name'] or '부서 사용자'} — 볼 서비스: {', '.join(names[x] for x in sorted(set(want))) or '없음'}", p.user_id,
                        {"user": user_id, "cards": sorted(set(want))})
        await audit(c, p, "space.assign", f"{p.tenant_id}/{user_id}", {"cards": before}, {"cards": sorted(set(want))})
    return {"ok": True, "user": user_id, "cards": sorted(set(want))}


@router.get("/spaces/me/downloads")
async def space_downloads(request: Request):
    p = _mgr(request)
    async with db(p) as c:
        rows = await c.fetch("SELECT line, at FROM space_log WHERE tenant_id=$1 AND kind='download' ORDER BY at DESC, id DESC LIMIT 20", p.tenant_id)
        n = await c.fetchval("SELECT count(*) FROM space_log WHERE tenant_id=$1 AND kind='download' AND at >= date_trunc('month', now())", p.tenant_id)
    return {"items": [{"line": r["line"], "at": _iso(r["at"])} for r in rows], "month": _cnt(int(n or 0), "내려받은 기록(이번 달)"), "as_of": now_iso()}


# ── [Land-XI] LX 관리자 — 기관 공간 목록(보기 · 지원만) ──────────────────────
@router.get("/spaces")
async def spaces_list(request: Request):
    require(principal(request), admin=True)
    await sync()
    from .quota import SRC as QSRC, storage_of
    out = []
    async with db(realm="lx") as c:
        sps = {r["tenant_id"]: dict(r) for r in await c.fetch("SELECT tenant_id, mode, state, created_at FROM spaces")}
        tns = await c.fetch("SELECT id, name, scope FROM tenants WHERE kind='user' AND coalesce(status,'active')='active'")
    for t in tns:
        tid = t["id"]
        svcs = await received(tid)
        async with db(realm="lx") as c:
            last = await c.fetchrow("SELECT g.card_id, g.edition, g.created_at, g.published_at, g.change FROM space_guides g WHERE g.tenant_id=$1 "
                                    "ORDER BY coalesce(g.published_at, g.created_at) DESC, g.edition DESC LIMIT 1", tid)
            upd = await c.fetchval("SELECT max(at) FROM space_log WHERE tenant_id=$1", tid)
            dl = await c.fetchval("SELECT count(*) FROM space_log WHERE tenant_id=$1 AND kind='download' AND at >= date_trunc('month', now())", tid)
            nm = await _tenant_name(c, tid)
        st = await storage_of(tid)
        sname = next((s["name"] for s in svcs if last and s["card"] == last["card_id"]), None)
        sp = sps.get(tid) or {}
        out.append({"tenant": tid, "name": nm, "short": re.sub(r"^.*?(특별자치도|특별자치시|광역시)\s+", "", nm), "scope": t["scope"],
                    "services": _cnt(len(svcs), "기관에 켜진 1차 서비스(기관 서비스 선택과 같은 판정)", "count"),
                    "latest": {"service": sname, "edition": _ed(last["edition"]), "at": _iso(last["published_at"] or last["created_at"]),
                               "change": last["change"]} if last else None,
                    "storage": env(st["gb"], "GB", "measured", QSRC["storage_gb"]),
                    "mode": sp.get("mode", "light"), "mode_word": MODE_WORD.get(sp.get("mode", "light")), "state": sp.get("state", "on"),
                    "updated": _iso(upd), "downloads": _cnt(int(dl or 0), "내려받은 기록(이번 달)")})
    out.sort(key=lambda x: (x["scope"] != "local", x["name"]))
    return {"items": out, "as_of": now_iso()}


@router.get("/spaces/{tenant}")
async def space_detail(tenant: str, request: Request):
    require(principal(request), admin=True)
    if not TENANT_RE.match(tenant or ""):
        raise ApiError("not_found", "없는 기관입니다")
    async with db(realm="lx") as c:
        if not await c.fetchval("SELECT 1 FROM tenants WHERE id=$1 AND kind='user'", tenant):
            raise ApiError("not_found", "없는 기관입니다")
    await sync(tenant)
    svcs = await received(tenant)
    async with db(realm="lx") as c:
        nm = await _tenant_name(c, tenant)
        sp = await c.fetchrow("SELECT mode, state, created_at FROM spaces WHERE tenant_id=$1", tenant)
        items = []
        for s in svcs:
            g = await _current(c, tenant, s["card"])
            hist = await c.fetch("SELECT edition, change, published_at, created_at, backfill FROM space_guides WHERE tenant_id=$1 AND card_id=$2 "
                                 "ORDER BY edition DESC LIMIT 6", tenant, s["card"])
            items.append({"card": s["card"], "name": s["name"], "status": s.get("status"),
                          "edition": _ed(g["edition"]) if g else None,
                          "total": (g["body"].get("what", {}).get("total") if g else None),
                          "history": [{"edition": _ed(h["edition"]), "change": h["change"], "at": _iso(h["published_at"] or h["created_at"]),
                                       "past": bool(h["backfill"])} for h in hist]})
        logs = await c.fetch("SELECT kind, line, at FROM space_log WHERE tenant_id=$1 AND kind IN ('guide','download','assign','space') "
                             "ORDER BY at DESC, id DESC LIMIT 12", tenant)
    return {"tenant": tenant, "name": nm, "mode": (sp or {}).get("mode", "light"), "mode_word": MODE_WORD.get((sp or {}).get("mode", "light")),
            "since": _iso((sp or {}).get("created_at")), "services": items,
            "log": [{"kind": r["kind"], "line": r["line"], "at": _iso(r["at"])} for r in logs], "as_of": now_iso()}


# 기관 분기 '요청하기' · 서비스 이력(구현 5차 2묶음 · 확인 대장 18차 촬영-1 ⓑ · N-1 ⓐ · 기관-9 ⓑ) — 촬영 요청(landxi_api/shoots.py) ·
# 서비스 이력 · 통계 · 필지 메모(landxi_api/gov_history.py). 공간 라우터에 붙여 main.py 를 고치지 않는다 — 불러오기에 실패해도 게이트웨이는 뜬다(로그 한 줄).
for _sub in ("shoots", "gov_history"):
    try:
        import importlib as _il
        router.include_router(_il.import_module(f"landxi_api.{_sub}").router)
    except Exception as _e:  # noqa: BLE001
        log.warning("%s router 건너뜀: %r", _sub, _e)
