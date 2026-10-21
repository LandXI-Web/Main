"""외부 연동 API 3차 — 분석 서비스 카드 하나의 바깥 창구(원칙 184 · 확인 대장 10-11 16:41 API3 · 설계 design-r18/open-api-3).

한 줄: 키 = 신청 시스템 × 분석 서비스 하나(API3-키단위 ⓐ). 승인받은 다른 시스템(LX 내부 · LX 다른 서비스 · 외부 기관)이 그 서비스의
AI 분석 결과를 서비스 결과 장부(지역 × 영상 원천 × 연도 × 서비스 판 — API3-결과장부 ⓐ)에서 조회한다. 기관 공유와는 떨어져 있다(공유를 거둬도 키는 그대로).
분석 호출(범위 + 영상 원천)은 2차 — 영상 원천에서 그때 불러 분석하는 길이 생긴 뒤 연다. 그때까지 분석 주소는 '아직 열리지 않음'(501).
외부 기관 시스템은 보안성 검토 전이라 신청은 받되 승인은 막는다(API3-여는순서 ⓐ). 영상 올리기는 만들지 않는다(원칙 179).

[로그인 없이] (사이트 'API 안내' — landxi/v3/api-guide)
  GET  /api/v1/public/api-catalog               신청 창 · 안내 페이지의 서비스 목록(이름 · 영문 이름 · 결과 조회 가능)과 원천 · 형식 — 숫자 없음
  POST /api/v1/public/api-applications          키 신청 {kind, org?, system, person, phone?, email?, services[], area, rights?, purpose, server_ip?, consent, website?}
                                                 → 201 · 같은 접속 주소 시간당 5번(넘으면 429) · website 칸이 채워져 오면(자동 입력기) 받은 척만
[LX 관리자 — 요청 관리 → 'API 키 신청' 탭] (원칙 122 · 178 — 결재가 아니라 관리)
  GET  /api/v1/api-applications?state=           신청 목록(대기 먼저) · 대기 수
  POST /api/v1/api-applications/{id}/approve     {services[], scope, rights, sources, area_once_km2, area_day_km2, area_month_km2, expires_at, formats, per_min, per_day, tenant_id?}
                                                 → 서비스마다 키 하나 · 키 값은 이 답에서 한 번만. 외부 기관 = 409 security_review(보안성 검토 전)
  POST /api/v1/api-applications/{id}/reject      {reason} — 사유 필수
  POST /api/v1/api-applications/{id}/mark        {test} — 시험 신청 표시
[LX 관리자 — 배포 → API 탭] 신청 시스템 묶음 × 서비스 줄
  GET  /api/v1/apikeys · POST /api/v1/apikeys(신청 없이 바로 — LX 내부용) · PATCH /api/v1/apikeys/{id} · POST /api/v1/apikeys/{id}/revoke · GET /api/v1/apikeys/{id}/calls
  GET  /api/v1/apikeys/usage                     사용 현황 표의 'API 호출' 열(기관이 신청자인 키만 기관 줄에 붙는다)
[기관 관리자] GET /api/v1/spaces/me/apikeys — 그 기관이 신청자인 키만 보기(값 0)
[외부 창구 — 바깥 주소 api.land-xi.dev/v1/* = 게이트웨이 /api/ext/v1/*] 머리글 Authorization: Bearer lxk_…
  GET /me · GET /services · GET /services/{서비스} · GET /services/{서비스}/coverage · GET /services/{서비스}/results · POST /services/{서비스}/results/search
  GET /services/{서비스}/summary · GET /services/{서비스}/exports/{geojson|shp|parcels} · GET /usage
  분석 호출(아직 열리지 않음 — 501): /imagery · /services/{서비스}/analyses[/estimate|/{작업}|/{작업}/results]

지키는 것
  · 키 값은 만들 때 한 번만 보이고 서버에는 한 방향 암호(HMAC-SHA256)와 끝 네 자리만. 화면 로그인 토큰으로는 외부 창구를, 키로는 화면 API 를 못 부른다.
  · 키가 살아 있는 조건 = 폐기 안 됨 · 끝나는 날 전 · 멈춤 아님. 기관 공유는 보지 않는다(API3-1차키 ⓐ).
  · 범위 밖(행정구역 · 사각 범위 · 도형) · 다른 서비스 · 키에 없는 원천 = 404(있다는 것도 알리지 않는다). LX 보유 영상 원천은 LX 내부 키만.
  · 결과는 서비스 결과 장부가 가리키는 결과 묶음(detections)에서 — 지운 결과 제외. 결과마다 원천 · 연도 · 서비스 판 · 분석한 때를 붙인다.
  · 한도 = 키마다 1분 · 하루 호출 수(429 + Retry-After) · 분석 넓이 한도(키 승인 때 정함 · 2차에서 씀).
  · 모든 호출 한 줄(api_calls). 키 값은 어디에도 적지 않는다. 응답에 작업 번호 · 파일 경로 · 장비 이름을 내지 않는다.
"""
from __future__ import annotations

import base64
import datetime as dt
import hashlib
import hmac
import io
import json
import re
import secrets
import time
import zipfile

from fastapi import APIRouter, Request
from fastapi.responses import Response, StreamingResponse
from starlette.concurrency import run_in_threadpool

from . import config
from . import spaces as S
from .deps import ApiError, Principal, audit, db, principal, redis, require
from .svc_rules import SQL_NOT_EXCLUDED  # 서비스 × 시군구 보이기 규칙(원칙 293)
from .envelope import KST, RawJSON, env, now_iso

router = APIRouter()          # 화면용(/api/v1) — LX 관리자 · 기관 관리자 · 공개 신청 창
ext = APIRouter()             # 외부 창구(/api/ext/v1)

PREFIX = "lxk_"
FORMATS = ("geojson", "shp", "parcels")
FMT_WORD = {"geojson": "GeoJSON", "shp": "SHP", "parcels": "필지 엑셀", "summary": "요약"}
PAGE_MAX = 1000
PER_MIN, PER_DAY = 60, 20000                 # 호출 한도 처음 값(표준 가이드 12절) — 키를 승인할 때 LX 관리자가 바꾼다
AREA_ONCE, AREA_DAY, AREA_MONTH = 25, 100, 1000   # 분석 넓이 한도 처음 값(㎢ · API3-분석승인 ⓐ · 2차에서 씀)
DAYS_DEFAULT, DAYS_MAX = 365, 730
BAD_MAX, BAD_WIN = 20, 600                   # 틀린 키 — 접속 주소마다 10분 20번
APPLY_PER_HOUR = 5                           # 키 신청 — 같은 접속 주소 시간당
LABEL_MAX = 60
KEY_ID = re.compile(r"^key_[0-9a-f]{12}$")
APP_ID = re.compile(r"^apa_[0-9a-f]{10}$")
WGS84_PRJ = ('GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],'
             'PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]')

KINDS = {"internal": "LX 내부 시스템", "lx_service": "LX 다른 서비스", "external": "외부 기관 시스템"}
RIGHTS = {"read": "결과 조회", "read_analyze": "결과 조회 + 분석 호출"}
SOURCES = {   # 표준 가이드 5절 — 원천 이름 · 시점 · 누가 쓰나 · 출처 표시
    "ngii-aerial": {"name": "국토지리정보원 항공영상", "when": "연도를 골라 분석(2011–2025)", "who": "승인된 모든 키", "attribution": "국토지리정보원 항공 정사영상"},
    "vworld": {"name": "브이월드 영상", "when": "가장 최근 영상", "who": "승인된 모든 키", "attribution": "브이월드 영상"},
    "lx": {"name": "LX 보유 영상", "when": "등록된 시점", "who": "LX 내부 시스템 키", "attribution": "LX 보유 영상(국토지리정보원 항공 정사영상 등)"},
}
STATE_WORD = {"pending": "대기", "approved": "승인", "rejected": "거절"}
SECURITY_HOLD = "외부 기관 시스템 연동은 보안성 검토(국가정보원)를 마친 뒤 승인합니다. 지금은 신청만 받아 둡니다."
NOT_OPEN = "분석 호출은 아직 열리지 않았습니다. 열리면 API 안내 페이지에 알립니다. 지금은 결과 조회를 씁니다."
CRS_OK = {"4326": 4326, "5186": 5186, "5179": 5179}


def key_hash(raw: str) -> str:
    return hmac.new(config.SESSION_SECRET, ("apikey:" + raw).encode(), hashlib.sha256).hexdigest()


def _iso(v) -> str | None:
    return v.astimezone(KST).isoformat(timespec="seconds") if v else None


def _now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def _day() -> str:
    return dt.datetime.now(KST).strftime("%Y%m%d")


def _clean(v, hi: int) -> str:
    return re.sub(r"[\u0000-\u0008\u000b\u000c\u000e-\u001f]", "", re.sub(r"[ \t]+", " ", str(v or ""))).strip()[:hi]


def state_of(k: dict) -> tuple[str, str]:
    """키 상태(코드, 사람 말) — 폐기 > 끝남 > 멈춤 > 켜짐. 기관 공유는 보지 않는다(API3-1차키 ⓐ)."""
    if k.get("revoked_at"):
        return "revoked", "폐기"
    if k["expires_at"] <= _now():
        return "expired", "기간 끝남"
    if k.get("paused"):
        return "paused", "멈춤"
    return "on", "켜짐"


# ── 범위(키마다 — 전국 · 행정구역 · 사각 범위) ─────────────────────────────────────
def _sido_codes() -> dict[str, str]:
    from . import regions as R
    out: dict[str, str] = {}
    for r in R.regions_base()[0]:
        out.setdefault(r["sgg_cd"][:2], r.get("sido") or "")
    return out


def _bbox(v, field: str = "bbox") -> list[float]:
    try:
        xs = [float(x) for x in (v.split(",") if isinstance(v, str) else v)]
    except (TypeError, ValueError, AttributeError):
        raise ApiError("bad_request", "bbox 는 서,남,동,북 경위도 네 숫자입니다(예: 127.38,35.40,127.41,35.42)", {"field": field})
    if len(xs) != 4 or not (-180 <= xs[0] < xs[2] <= 180 and -90 <= xs[1] < xs[3] <= 90):
        raise ApiError("bad_request", "bbox 는 서,남,동,북 경위도 네 숫자입니다(서 < 동 · 남 < 북)", {"field": field})
    return [round(x, 7) for x in xs]


def scope_clean(v) -> dict:
    """키 범위 → {"all": true} | {"codes": [...]} | {"bbox": [...]}. 행정구역 = 시도 2자리 · 시군구 5자리(regions 목록에 있는 것만)."""
    from . import regions as R
    if v in (None, "", "all") or (isinstance(v, dict) and v.get("all")):
        return {"all": True}
    if not isinstance(v, dict):
        raise ApiError("bad_request", "범위는 전국 · 행정구역 · 사각 범위 가운데 하나로 정해 주세요", {"field": "scope"})
    if v.get("bbox") is not None:
        return {"bbox": _bbox(v["bbox"], "scope")}
    codes = [str(x).strip() for x in (v.get("codes") or []) if str(x).strip()]
    if not codes:
        raise ApiError("bad_request", "범위로 열 시도 · 시군구를 하나 이상 골라 주세요", {"field": "scope"})
    sido = _sido_codes()
    out = []
    for cd in codes:
        if re.fullmatch(r"\d{2}", cd) and cd in sido:
            out.append(cd)
        elif re.fullmatch(r"\d{5}", cd) and R.region_of(cd):
            out.append(R.region_of(cd)["sgg_cd"])
        else:
            raise ApiError("bad_request", "없는 행정구역 코드입니다 — 시도 2자리 · 시군구 5자리", {"field": "scope", "code": cd})
    return {"codes": sorted(set(out))}


def scope_words(sc: dict) -> list[str]:
    from . import regions as R
    if not sc or sc.get("all"):
        return ["전국"]
    if sc.get("bbox"):
        return ["사각 범위(지도 좌표로 정함)"]
    out, sido = [], _sido_codes()
    for cd in sc.get("codes") or []:
        if len(cd) == 2:
            out.append(R.sido_label(sido.get(cd)) or cd)
        else:
            r = R.region_of(cd)
            out.append((r or {}).get("full") or cd)
    return out


def _scope_sggs(sc: dict) -> set[str] | None:
    """범위 안 시군구 코드(지금 · 옛). None = 전국."""
    from . import regions as R
    if not sc or sc.get("all"):
        return None
    regs = R.regions_base()[0]
    if sc.get("bbox"):
        w, s, e, n = sc["bbox"]
        hit = [r for r in regs if r.get("bbox") and not (r["bbox"][2] < w or r["bbox"][0] > e or r["bbox"][3] < s or r["bbox"][1] > n)]
    else:
        cs = sc.get("codes") or []
        hit = [r for r in regs if any(r["sgg_cd"].startswith(c) or (r.get("prev_cd") or "").startswith(c) for c in cs)]
    out: set[str] = set()
    for r in hit:
        out.add(r["sgg_cd"])
        if r.get("prev_cd"):
            out.add(r["prev_cd"])
    return out


def _scope_geom(sc: dict):
    """범위 도형(shapely) — 전국 = None."""
    from shapely.geometry import box
    from shapely.ops import unary_union
    from . import regions as R
    if not sc or sc.get("all"):
        return None
    if sc.get("bbox"):
        return box(*sc["bbox"])
    _, geoms, _ = R.regions_base()
    sg = _scope_sggs(sc) or set()
    parts = [g for cd, g in geoms.items() if cd in sg]
    return unary_union(parts) if parts else box(0, 0, 0, 0)


# ── 서비스 결과 장부(API3-결과장부 ⓐ) ─────────────────────────────────────────────
_LEDGER = {"at": 0.0}


async def ledger_sync(force: bool = False) -> int:
    """장부 채우기 — 배포본의 지금 · 지난 결과 + 서비스가 붙은 끝난 작업. 같은 서비스 · 시군구 · 원천 · 연도에는 결과 하나만 '지금'(배포본 지금 결과 > 가장 늦게 분석한 것).
    지금 결과는 모두 LX 보유 영상(등록 영상 파일)에서 나온 것 → source 'lx' · 영상 연도. 1분에 한 번만(호출마다 부르되 바로 돌아온다)."""
    if not force and time.time() - _LEDGER["at"] < 60:
        return 0
    _LEDGER["at"] = time.time()
    if not force:                              # 게이트웨이 여러 프로세스 — 1분에 한 번은 모든 프로세스를 통틀어(impl-46 ops)
        try:
            if not await (await redis()).set("lx:ledger_sync", str(time.time()), nx=True, ex=55):
                return 0
        except Exception:  # noqa: BLE001
            pass
    from . import regions as R
    from .summary import canonical
    async with db(realm="lx") as c:
        deps = await c.fetch(
            "SELECT d.card_id, d.sgg_cd, d.snapshot_current, d.snapshot_prev, d.scale, v.version, pv.version AS pversion FROM deploys d "
            "LEFT JOIN card_versions v ON v.id = d.card_version_id LEFT JOIN card_versions pv ON pv.id = d.prev_card_version_id "
            "WHERE d.stage <> 'draft' AND NOT coalesce(d.test, false) AND d.card_id IS NOT NULL AND d.sgg_cd IS NOT NULL")
        jobs = {r["id"]: dict(r) for r in await c.fetch(
            "SELECT j.id, j.card_id, j.imagery_id, j.finished_at, i.sgg_cd AS isgg, i.year AS iyear, i.epoch, i.name AS iname FROM jobs j "
            "LEFT JOIN imagery i ON i.id = j.imagery_id WHERE j.state = 'done' AND NOT coalesce(j.test, false) AND j.id LIKE 'job_%'")}
        latest = {r["card_id"]: r["version"] for r in await c.fetch(
            "SELECT DISTINCT ON (card_id) card_id, version FROM card_versions ORDER BY card_id, approved_at DESC NULLS LAST, id DESC")}
        rank = {"deploy": 3, "deploy_prev": 2, "job": 1, "api": 1}
        cand: dict[tuple, dict] = {}

        def put(card, set_id, sgg, ver, origin, as_of=None):
            if not set_id:
                return
            j = jobs.get(set_id)
            reg = R.region_of(sgg or (j or {}).get("isgg"))
            if j:
                nm = (j["iname"] or {}).get("ko") if isinstance(j["iname"], dict) else str(j["iname"] or "")
                y = S._year_of(j["iyear"], j["epoch"], nm)
                row = {"imagery_id": j["imagery_id"], "analyzed_at": j["finished_at"], "year": int(y) if y else None}
            else:
                y = S._year_of(set_id)
                at = None
                if as_of:
                    try:
                        at = dt.datetime.fromisoformat(str(as_of)).replace(tzinfo=KST) if len(str(as_of)) == 10 else dt.datetime.fromisoformat(str(as_of))
                    except ValueError:
                        at = None
                row = {"imagery_id": None, "analyzed_at": at, "year": int(y) if y else None}
            k = (card, set_id)
            new = {**row, "card_id": card, "set_id": set_id, "sgg_cd": (reg or {}).get("sgg_cd") or sgg, "source": "lx",
                   "service_version": ver, "origin": origin}
            if k not in cand or rank[origin] > rank[cand[k]["origin"]]:
                cand[k] = new

        for d in deps:
            sc = d["scale"] if isinstance(d["scale"], dict) else {}
            put(d["card_id"], canonical(d["snapshot_current"]), d["sgg_cd"], d["version"], "deploy", sc.get("as_of"))
            put(d["card_id"], canonical(d["snapshot_prev"]), d["sgg_cd"], d["pversion"] or d["version"], "deploy_prev")
        for jid, j in jobs.items():
            if j["card_id"] and not j["card_id"].startswith("card-global") and (j["card_id"], jid) not in cand:
                put(j["card_id"], jid, None, latest.get(j["card_id"]), "job")
        n = 0
        for v in cand.values():
            if not v["sgg_cd"]:
                continue
            await c.execute(
                "INSERT INTO service_results(card_id, set_id, sgg_cd, source, year, service_version, imagery_id, analyzed_at, origin) "
                "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (card_id, set_id) DO UPDATE SET sgg_cd=EXCLUDED.sgg_cd, source=EXCLUDED.source, "
                "year=EXCLUDED.year, service_version=EXCLUDED.service_version, imagery_id=EXCLUDED.imagery_id, "
                "analyzed_at=coalesce(EXCLUDED.analyzed_at, service_results.analyzed_at), origin=EXCLUDED.origin",
                v["card_id"], v["set_id"], v["sgg_cd"], v["source"], v["year"], v["service_version"], v["imagery_id"], v["analyzed_at"], v["origin"])
            n += 1
        # 같은 칸(서비스 · 시군구 · 원천 · 연도)에 '지금' 하나 — 배포본 지금 결과 > 늦게 분석한 것 > 늦게 적은 것
        rows = await c.fetch("SELECT id, card_id, sgg_cd, source, year, origin, analyzed_at, at, replaced_at FROM service_results")
        cells: dict[tuple, list] = {}
        for r in rows:
            cells.setdefault((r["card_id"], r["sgg_cd"], r["source"], r["year"]), []).append(r)
        for rs in cells.values():
            rs.sort(key=lambda r: (r["origin"] == "deploy", r["analyzed_at"] or r["at"], r["at"]), reverse=True)
            top = rs[0]
            if top["replaced_at"]:
                await c.execute("UPDATE service_results SET replaced_at=NULL, replaced_by=NULL WHERE id=$1", top["id"])
            for r in rs[1:]:
                if not r["replaced_at"]:
                    await c.execute("UPDATE service_results SET replaced_at=now(), replaced_by=$2 WHERE id=$1", r["id"], top["id"])
    return n


# ── 서비스(카드) ─────────────────────────────────────────────────────────────
def _card_name(n) -> str:
    return (n or {}).get("ko") if isinstance(n, dict) else str(n or "")


async def _services(c, only_with_results: bool = True) -> list[dict]:
    rows = await c.fetch("SELECT c.id, c.api_id, c.name, c.api_sources, c.domain, i.line FROM cards c LEFT JOIN card_info i ON i.card_id = c.id "
                         "WHERE c.api_id IS NOT NULL ORDER BY c.id")
    have = {r["card_id"] for r in await c.fetch("SELECT DISTINCT card_id FROM service_results s WHERE replaced_at IS NULL" + SQL_NOT_EXCLUDED)}
    out = []
    for r in rows:
        if only_with_results and r["id"] not in have:
            continue
        out.append({"card": r["id"], "id": r["api_id"], "name": _card_name(r["name"]), "line": r["line"] or None,
                    "results": r["id"] in have, "analyze_sources": list(r["api_sources"] or [])})
    order = {"building": 0, "farm": 1, "parking": 2, "greenhouse": 3}
    out.sort(key=lambda s: (order.get(s["id"], 9), s["name"]))
    return out


async def _svc_by_card(c, card: str) -> dict | None:
    return next((s for s in await _services(c, False) if s["card"] == card), None)


# ── 사람 말 · 보기 ────────────────────────────────────────────────────────────
async def _counts(conn, key_ids: list[str]) -> dict:
    if not key_ids:
        return {}
    now = dt.datetime.now(KST)
    d0 = now.replace(hour=0, minute=0, second=0, microsecond=0)
    m0 = d0.replace(day=1)
    rows = await conn.fetch("SELECT key_id, count(*) FILTER (WHERE at >= $2) d, count(*) m FROM api_calls "
                            "WHERE key_id = ANY($1::text[]) AND at >= $3 AND status < 400 GROUP BY key_id", key_ids, d0, m0)
    return {r["key_id"]: (r["d"], r["m"]) for r in rows}


async def usage_month(conn) -> dict:
    """사용 현황(원칙 160) — (기관, 서비스)마다 이번 달 API 호출(성공 · 시험 키 제외). 기관이 신청자인 키만 기관 줄에 붙는다."""
    m0 = dt.datetime.now(KST).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    try:
        rows = await conn.fetch("SELECT tenant_id, card_id, count(*) n, max(at) last FROM api_calls WHERE at >= $1 AND status < 400 AND NOT test "
                                "AND tenant_id IS NOT NULL GROUP BY tenant_id, card_id", m0)
        keys = await conn.fetch("SELECT tenant_id, card_id, count(*) n FROM api_keys WHERE revoked_at IS NULL AND expires_at > now() AND NOT test "
                                "AND tenant_id IS NOT NULL GROUP BY tenant_id, card_id")
    except Exception:  # noqa: BLE001 — 표가 없는 DB(되돌린 뒤)
        return {}
    out: dict = {}
    for r in rows:
        out[(r["tenant_id"], r["card_id"])] = {"calls": int(r["n"]), "last": r["last"], "keys": 0}
    for r in keys:
        out.setdefault((r["tenant_id"], r["card_id"]), {"calls": 0, "last": None, "keys": 0})["keys"] = int(r["n"])
    return out


def _area_view(k: dict) -> dict:
    f = lambda v: None if v is None else float(v)   # noqa: E731
    return {"once": f(k.get("area_once_km2")), "day": f(k.get("area_day_km2")), "month": f(k.get("area_month_km2"))}


def _key_view(k: dict, cnt: tuple | None, svc: dict | None = None, people: dict | None = None) -> dict:
    st, word = state_of(k)
    d, m = cnt or (0, 0)
    sc = k.get("scope") or {"all": True}
    ar = _area_view(k)
    return {"id": k["id"], "label": k["label"], "last4": k["last4"], "state": st, "state_label": word, "test": bool(k["test"]),
            "service": {"id": (svc or {}).get("id"), "card": k["card_id"], "name": (svc or {}).get("name") or k["card_id"]},
            "scope": _scope_view(sc), "scope_words": scope_words(sc),
            "rights": k.get("rights") or "read", "rights_label": RIGHTS.get(k.get("rights") or "read"),
            "sources": [{"id": s, "label": SOURCES[s]["name"]} for s in SOURCES if s in (k.get("sources") or [])],
            "area": {x: (None if v is None else env(v, "km2", "recorded", f"분석 넓이 한도 — {w}")) for (x, v), w in zip(ar.items(), ("한 번", "하루", "한 달"))},
            "formats": [{"id": f, "label": FMT_WORD[f]} for f in FORMATS if f in (k["formats"] or [])],
            "per_min": env(int(k["per_min"]), "calls", "recorded", "1분 호출 한도"), "per_day": env(int(k["per_day"]), "calls", "recorded", "하루 호출 한도"),
            "expires_at": _iso(k["expires_at"]), "created_at": _iso(k["created_at"]),
            "created_by": (people or {}).get(k.get("created_by") or "", None),
            "revoked_at": _iso(k.get("revoked_at")), "revoke_reason": k.get("revoke_reason"),
            "last_used_at": _iso(k.get("last_used_at")),
            "today": env(int(d), "calls", "recorded", "오늘 호출(성공)"), "month": env(int(m), "calls", "recorded", "이번 달 호출(성공)")}


def _scope_view(sc: dict) -> dict:
    """화면용 범위 — 숫자 봉투 검사를 피하려고 사각 범위는 글자 한 줄('서,남,동,북')로."""
    if sc.get("bbox"):
        return {"bbox": ",".join(f"{x:g}" for x in sc["bbox"])}
    return dict(sc)


def _app_view(a: dict, svcs: dict, people: dict | None = None) -> dict:
    return {"id": a["id"], "kind": a["kind"], "kind_label": KINDS.get(a["kind"], a["kind"]), "org": a["org"] or "", "system": a["system"],
            "person": a["person"] or "", "phone": a["phone"] or "", "email": a["email"] or "",
            "services": [{"card": s, "id": (svcs.get(s) or {}).get("id"), "name": (svcs.get(s) or {}).get("name") or s} for s in (a["services"] or [])],
            "area": a["area"] or "", "rights": a["rights"], "rights_label": RIGHTS.get(a["rights"], a["rights"]), "purpose": a["purpose"] or "",
            "server_ip": a["server_ip"] or "", "tenant_id": a["tenant_id"], "state": a["state"], "state_label": STATE_WORD.get(a["state"], a["state"]),
            "decided_at": _iso(a["decided_at"]), "decided_by": (people or {}).get(a["decided_by"] or "", None), "reason": a["reason"],
            "via": a["via"], "test": bool(a["test"]), "at": _iso(a["at"]),
            "can_approve": a["kind"] != "external", "hold": SECURITY_HOLD if a["kind"] == "external" else None,
            "ip": "이 PC" if (a["ip"] or "") in ("127.0.0.1", "::1", "") else a["ip"]}


async def _people(c) -> dict:
    return {r["id"]: r["name"] for r in await c.fetch("SELECT id, name FROM lx_users")}


# ── 키 설정 검사 ──────────────────────────────────────────────────────────────
def _expires(v, default_days: int | None = DAYS_DEFAULT) -> dt.datetime:
    if v in (None, ""):
        return (dt.datetime.now(KST) + dt.timedelta(days=default_days)).replace(hour=23, minute=59, second=59, microsecond=0)
    try:
        d = dt.date.fromisoformat(str(v)[:10])
    except ValueError:
        raise ApiError("bad_request", "끝나는 날은 2027-10-11 모양으로 적어 주세요")
    at = dt.datetime(d.year, d.month, d.day, 23, 59, 59, tzinfo=KST)
    if at <= dt.datetime.now(KST):
        raise ApiError("bad_request", "끝나는 날은 오늘 뒤여야 합니다")
    if at > dt.datetime.now(KST) + dt.timedelta(days=DAYS_MAX):
        raise ApiError("bad_request", "끝나는 날은 2년 안으로 정해 주세요")
    return at


def _formats(v) -> list[str]:
    if v is None:
        return list(FORMATS)
    fs = [f for f in FORMATS if f in {str(x) for x in (v or [])}]
    if not fs:
        raise ApiError("bad_request", "내줄 형식을 하나 이상 골라 주세요")
    return fs


def _limit(v, default: int, lo: int, hi: int, word: str) -> int:
    if v in (None, ""):
        return default
    try:
        n = int(v)
    except (TypeError, ValueError):
        raise ApiError("bad_request", f"{word}는 숫자로 적어 주세요")
    if not lo <= n <= hi:
        raise ApiError("bad_request", f"{word}는 {lo:,}–{hi:,} 사이로 정해 주세요")
    return n


def _area(v, default: float, word: str) -> float:
    if v in (None, ""):
        return float(default)
    try:
        n = float(v)
    except (TypeError, ValueError):
        raise ApiError("bad_request", f"{word}은 숫자(㎢)로 적어 주세요")
    if not 0 < n <= 100000:
        raise ApiError("bad_request", f"{word}은 0보다 크고 100,000㎢ 안으로 정해 주세요")
    return round(n, 2)


def _rights(v, kind: str) -> str:
    r = str(v or "read")
    if r not in RIGHTS:
        raise ApiError("bad_request", "권한은 결과 조회 · 결과 조회 + 분석 호출 가운데 하나입니다")
    if r == "read_analyze" and kind == "external":
        raise ApiError("bad_request", "외부 기관 시스템은 보안성 검토 전까지 결과 조회만 엽니다")
    return r


def _sources(v, kind: str) -> list[str]:
    ss = [s for s in SOURCES if s in {str(x) for x in (v if v is not None else ["ngii-aerial", "vworld"] + (["lx"] if kind == "internal" else []))}]
    if not ss:
        raise ApiError("bad_request", "쓸 수 있는 영상 원천을 하나 이상 골라 주세요")
    if "lx" in ss and kind != "internal":
        raise ApiError("bad_request", "LX 보유 영상은 LX 내부 시스템 키에만 엽니다")
    return ss


def _settings(body: dict, kind: str) -> dict:
    return {"scope": scope_clean(body.get("scope")), "rights": _rights(body.get("rights"), kind), "sources": _sources(body.get("sources"), kind),
            "area_once_km2": _area(body.get("area_once_km2"), AREA_ONCE, "한 번 분석 넓이 한도"),
            "area_day_km2": _area(body.get("area_day_km2"), AREA_DAY, "하루 분석 넓이 한도"),
            "area_month_km2": _area(body.get("area_month_km2"), AREA_MONTH, "한 달 분석 넓이 한도"),
            "expires_at": _expires(body.get("expires_at")), "formats": _formats(body.get("formats")),
            "per_min": _limit(body.get("per_min"), PER_MIN, 1, 600, "1분 한도"), "per_day": _limit(body.get("per_day"), PER_DAY, 1, 200000, "하루 한도"),
            "test": bool(body.get("test"))}


async def _make_key(c, p: Principal, a: dict, card: str, st: dict) -> tuple[str, dict]:
    raw = PREFIX + secrets.token_urlsafe(32)
    kid = "key_" + secrets.token_hex(6)
    label = (a["system"] or "")[:LABEL_MAX]
    await c.execute("INSERT INTO api_keys(id, tenant_id, card_id, label, key_hash, last4, formats, per_min, per_day, expires_at, test, created_by, "
                    "applicant_id, scope, rights, sources, area_once_km2, area_day_km2, area_month_km2, gen) "
                    "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,3)",
                    kid, a.get("tenant_id"), card, label, key_hash(raw), raw[-4:], st["formats"], st["per_min"], st["per_day"], st["expires_at"],
                    st["test"] or bool(a.get("test")), p.user_id, a["id"], st["scope"], st["rights"], st["sources"],
                    st["area_once_km2"], st["area_day_km2"], st["area_month_km2"])
    await audit(c, p, "apikey.create", kid, None, {"applicant": a["id"], "card_id": card, "scope": st["scope"], "rights": st["rights"],
                                                     "sources": st["sources"], "formats": st["formats"], "per_min": st["per_min"], "per_day": st["per_day"],
                                                     "area": [st["area_once_km2"], st["area_day_km2"], st["area_month_km2"]],
                                                     "expires_at": st["expires_at"].isoformat(), "test": st["test"], "last4": raw[-4:]})
    k = dict(await c.fetchrow("SELECT * FROM api_keys WHERE id=$1", kid))
    return raw, k


# ── [로그인 없이] 안내 페이지 · 키 신청 ─────────────────────────────────────────
@router.get("/public/api-catalog")
async def public_catalog():
    await ledger_sync()
    async with db(realm="lx") as c:
        svcs = await _services(c)
    return {"services": [{"id": s["id"], "name": s["name"], "line": s["line"], "results": True, "analyze": False} for s in svcs],
            "sources": [{"id": k, "name": v["name"], "when": v["when"], "who": v["who"]} for k, v in SOURCES.items()],
            "kinds": [{"id": k, "label": v} for k, v in KINDS.items()], "rights": [{"id": k, "label": v} for k, v in RIGHTS.items()],
            "formats": [{"id": f, "label": FMT_WORD[f]} for f in FORMATS], "base": "https://api.land-xi.dev/v1", "analyze_open": False,
            "external_hold": SECURITY_HOLD, "as_of": now_iso()}


async def _apply_limit(ip: str):
    k = f"lx:apiapply:{ip}"
    try:
        r = await redis()
        n = await r.incr(k)
        if n == 1:
            await r.expire(k, 3600)
        if n <= APPLY_PER_HOUR:
            return
        left = await r.ttl(k)
    except Exception:  # noqa: BLE001 — 제한 저장소가 멈춰도 신청은 받는다
        return
    mins = max(1, round((left if left and left > 0 else 3600) / 60))
    raise ApiError("too_many_attempts", f"신청을 너무 자주 보냈습니다. {mins}분 뒤 다시 보내 주세요.", None, 429)


_TEL = re.compile(r"^[0-9+][0-9\- ]{6,19}$")
_MAIL = re.compile(r"^[^@\s]{1,64}@[^@\s]+\.[^@\s]{2,}$")


@router.post("/public/api-applications", status_code=201)
async def apply(body: dict, request: Request):
    from .accounts import client_ip
    kind = str(body.get("kind") or "")
    if kind not in KINDS:
        raise ApiError("bad_request", "신청 구분을 골라 주세요", {"field": "kind"})
    org = _clean(body.get("org"), 80)
    system = _clean(body.get("system"), LABEL_MAX)
    if not system:
        raise ApiError("bad_request", "쓰는 시스템 이름을 적어 주세요", {"field": "system"})
    person = _clean(body.get("person"), 40)
    if not person:
        raise ApiError("bad_request", "담당자 이름을 적어 주세요", {"field": "person"})
    phone, email = _clean(body.get("phone"), 20), _clean(body.get("email"), 120)
    if not phone and not email:
        raise ApiError("bad_request", "연락받을 전화나 메일 주소를 하나 이상 적어 주세요", {"field": "phone"})
    if phone and not _TEL.match(phone):
        raise ApiError("bad_request", "전화번호를 확인해 주세요", {"field": "phone"})
    if email and not _MAIL.match(email):
        raise ApiError("bad_request", "메일 주소를 확인해 주세요", {"field": "email"})
    async with db(realm="lx") as c:
        svcs = await _services(c)
    by = {s["id"]: s["card"] for s in svcs} | {s["card"]: s["card"] for s in svcs}
    want = [by[str(x)] for x in (body.get("services") or []) if str(x) in by]
    if not want:
        raise ApiError("bad_request", "쓰려는 분석 서비스를 하나 이상 골라 주세요", {"field": "services"})
    area = _clean(body.get("area"), 200)
    if not area:
        raise ApiError("bad_request", "쓰려는 범위를 적어 주세요(예: 전국 · 전북특별자치도 · 남원시)", {"field": "area"})
    rights = str(body.get("rights") or "read")
    if rights not in RIGHTS:
        raise ApiError("bad_request", "권한을 골라 주세요", {"field": "rights"})
    purpose = _clean(body.get("purpose"), 1000)
    if len(purpose) < 5:
        raise ApiError("bad_request", "쓰는 목적을 5자 이상 적어 주세요", {"field": "purpose"})
    server_ip = _clean(body.get("server_ip"), 200)
    if body.get("consent") is not True:
        raise ApiError("bad_request", "개인정보 수집에 동의해야 신청할 수 있습니다", {"field": "consent"})
    ip = client_ip(request)
    await _apply_limit(ip)
    if _clean(body.get("website"), 200):                  # 사람에게는 보이지 않는 칸 — 채워졌으면 자동 입력기
        return {"ok": True, "at": now_iso()}
    site = request.headers.get("x-lx-site") if request.headers.get("x-forwarded-for") else None
    aid = "apa_" + secrets.token_hex(5)
    async with db(realm="lx") as c:
        await c.execute("INSERT INTO api_applicants(id, kind, org, system, person, phone, email, services, area, rights, purpose, server_ip, consent_at, site, ip) "
                        "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now(),$13,$14)",
                        aid, kind, org or None, system, person, phone or None, email or None, sorted(set(want)), area, rights, purpose, server_ip or None, site, ip)
    return {"ok": True, "at": now_iso(), "hold": SECURITY_HOLD if kind == "external" else None}


# ── [LX 관리자] 요청 관리 → API 키 신청 ───────────────────────────────────────────
@router.get("/api-applications")
async def apps_list(request: Request, state: str = "all"):
    require(principal(request), admin=True)
    await ledger_sync()
    async with db(realm="lx") as c:
        rows = await c.fetch("SELECT * FROM api_applicants WHERE via = 'form' AND ($1 = 'all' OR state = $1) "
                             "ORDER BY (state = 'pending') DESC, at DESC LIMIT 200", state)
        svcs = {s["card"]: s for s in await _services(c, False)}
        people = await _people(c)
        n = await c.fetchval("SELECT count(*) FROM api_applicants WHERE via = 'form' AND state = 'pending' AND NOT test")
        keys = {}
        for r in await c.fetch("SELECT * FROM api_keys WHERE applicant_id = ANY($1::text[]) ORDER BY created_at", [r["id"] for r in rows]):
            keys.setdefault(r["applicant_id"], []).append(dict(r))
    items = []
    for r in rows:
        v = _app_view(dict(r), svcs, people)
        v["keys"] = [_key_view(k, None, svcs.get(k["card_id"])) for k in keys.get(r["id"], [])]
        items.append(v)
    return {"items": items, "pending": env(int(n), "count", "recorded", "기다리는 API 키 신청(시험 제외)"),
            "defaults": _defaults(), "options": _options(list(svcs.values())), "as_of": now_iso()}


def _defaults() -> dict:
    return {"per_min": env(PER_MIN, "calls", "recorded", "1분 호출 한도 처음 값"), "per_day": env(PER_DAY, "calls", "recorded", "하루 호출 한도 처음 값"),
            "days": env(DAYS_DEFAULT, "count", "recorded", "끝나는 날 처음 값(일)"),
            "area_once_km2": env(AREA_ONCE, "km2", "recorded", "한 번 분석 넓이 한도 처음 값"),
            "area_day_km2": env(AREA_DAY, "km2", "recorded", "하루 분석 넓이 한도 처음 값"),
            "area_month_km2": env(AREA_MONTH, "km2", "recorded", "한 달 분석 넓이 한도 처음 값")}


def _options(svcs: list[dict]) -> dict:
    from . import regions as R
    sido = _sido_codes()
    regs = R.regions_base()[0]
    return {"kinds": [{"id": k, "label": v} for k, v in KINDS.items()], "rights": [{"id": k, "label": v} for k, v in RIGHTS.items()],
            "sources": [{"id": k, "label": v["name"], "internal_only": k == "lx"} for k, v in SOURCES.items()],
            "formats": [{"id": f, "label": FMT_WORD[f]} for f in FORMATS],
            "services": [{"card": s["card"], "id": s["id"], "name": s["name"], "results": s["results"]} for s in svcs if s["results"]],
            "regions": [{"code": cd, "name": R.sido_label(nm) or nm, "sgg": [{"code": r["sgg_cd"], "name": r["name"]} for r in regs if r["sgg_cd"][:2] == cd]}
                        for cd, nm in sorted(sido.items(), key=lambda kv: kv[0])],
            "analyze_open": False, "external_hold": SECURITY_HOLD}


async def _app_or_404(c, aid: str) -> dict:
    if not APP_ID.match(aid or ""):
        raise ApiError("not_found", "없는 신청입니다")
    r = await c.fetchrow("SELECT * FROM api_applicants WHERE id=$1", aid)
    if not r:
        raise ApiError("not_found", "없는 신청입니다")
    return dict(r)


@router.post("/api-applications/{aid}/approve")
async def app_approve(aid: str, body: dict, request: Request):
    p = require(principal(request), admin=True)
    async with db(realm="lx") as c:
        a = await _app_or_404(c, aid)
        if a["state"] != "pending":
            raise ApiError("conflict", "이미 처리한 신청입니다", None, 409)
        if a["kind"] == "external":                       # API3-여는순서 ⓐ — 외부 기관은 보안성 검토 뒤
            raise ApiError("security_review", SECURITY_HOLD, None, 409)
        st = _settings(body, a["kind"])
        svcs = {s["card"]: s for s in await _services(c, False)}
        want = [str(x) for x in (body.get("services") or a["services"] or [])]
        want = [x for x in dict.fromkeys(want) if x in svcs]
        if not want:
            raise ApiError("bad_request", "키를 만들 서비스를 하나 이상 골라 주세요")
        if body.get("tenant_id"):
            a["tenant_id"] = str(body["tenant_id"])[:40]
        out = []
        async with c.transaction():
            for card in want:
                raw, k = await _make_key(c, p, a, card, st)
                out.append({"key": raw, "item": _key_view(k, None, svcs.get(card), {p.user_id: p.name})})
            await c.execute("UPDATE api_applicants SET state='approved', decided_by=$2, decided_at=now(), tenant_id=$3 WHERE id=$1", aid, p.user_id, a["tenant_id"])
            await audit(c, p, "apikey.application.approve", aid, {"state": "pending"}, {"state": "approved", "services": want, "keys": [x["item"]["id"] for x in out]})
    return {"keys": out, "once": "키 값은 지금 한 번만 보입니다. 신청한 담당자에게 안전한 길로 전하세요.", "as_of": now_iso()}


@router.post("/api-applications/{aid}/reject")
async def app_reject(aid: str, body: dict, request: Request):
    p = require(principal(request), admin=True)
    reason = _clean((body or {}).get("reason"), 300)
    if not reason:
        raise ApiError("reason_required", "거절 사유를 적어 주세요. 신청한 담당자에게 이 사유로 연락합니다.", None, 400)
    async with db(realm="lx") as c:
        a = await _app_or_404(c, aid)
        if a["state"] != "pending":
            raise ApiError("conflict", "이미 처리한 신청입니다", None, 409)
        await c.execute("UPDATE api_applicants SET state='rejected', decided_by=$2, decided_at=now(), reason=$3 WHERE id=$1", aid, p.user_id, reason)
        await audit(c, p, "apikey.application.reject", aid, {"state": "pending"}, {"state": "rejected", "reason": reason})
        a = await _app_or_404(c, aid)
        svcs = {s["card"]: s for s in await _services(c, False)}
    return {"item": _app_view(a, svcs, {p.user_id: p.name}), "as_of": now_iso()}


@router.post("/api-applications/{aid}/mark")
async def app_mark(aid: str, body: dict, request: Request):
    p = require(principal(request), admin=True)
    if "test" not in (body or {}):
        raise ApiError("bad_request", "바꿀 것이 없습니다")
    async with db(realm="lx") as c:
        a = await _app_or_404(c, aid)
        await c.execute("UPDATE api_applicants SET test=$2 WHERE id=$1", aid, bool(body["test"]))
        await audit(c, p, "apikey.application.mark", aid, {"test": a["test"]}, {"test": bool(body["test"])})
    return {"ok": True}


# ── [LX 관리자] 배포 → API — 신청 시스템 묶음 × 서비스 줄 ────────────────────────────
@router.get("/apikeys")
async def keys_list(request: Request):
    require(principal(request), admin=True)
    await ledger_sync()
    async with db(realm="lx") as c:
        apps = {r["id"]: dict(r) for r in await c.fetch("SELECT * FROM api_applicants WHERE state = 'approved' OR via = 'admin' ORDER BY at")}
        ks = [dict(r) for r in await c.fetch("SELECT * FROM api_keys WHERE gen >= 3 ORDER BY created_at DESC")]
        old = await c.fetchval("SELECT count(*) FROM api_keys WHERE gen < 3")
        cnt = await _counts(c, [k["id"] for k in ks])
        people = await _people(c)
        svcs = {s["card"]: s for s in await _services(c, False)}
    groups = []
    for aid, a in apps.items():
        mine = [k for k in ks if k["applicant_id"] == aid]
        if not mine and a["via"] != "admin":
            continue
        v = _app_view(a, svcs, people)
        v["keys"] = [_key_view(k, cnt.get(k["id"]), svcs.get(k["card_id"]), people) for k in mine]
        v["live"] = env(sum(1 for k in mine if state_of(k)[0] == "on"), "count", "recorded", "켜진 키")
        groups.append(v)
    groups.sort(key=lambda g: (-g["live"]["value"], g["system"]))
    live = sum(g["live"]["value"] for g in groups)
    return {"items": groups, "keys": env(len(ks), "count", "recorded", "만든 키(폐기 · 시험 포함)"),
            "live": env(live, "count", "recorded", "지금 켜진 키"),
            "old_keys": env(int(old or 0), "count", "recorded", "1차(기관 × 공유 서비스) 키 — 모두 폐기 · 기록만"),
            "defaults": _defaults(), "options": _options(list(svcs.values())), "as_of": now_iso()}


@router.get("/apikeys/usage")
async def keys_usage(request: Request):
    require(principal(request), admin=True)
    async with db(realm="lx") as c:
        u = await usage_month(c)
    return {"items": [{"org": t, "service": cid, "calls": env(v["calls"], "calls", "recorded", "이번 달 API 호출(성공 · 시험 키 제외)"),
                       "keys": env(v["keys"], "count", "recorded", "켜진 키(시험 제외)"), "last": _iso(v["last"])} for (t, cid), v in u.items()],
            "as_of": now_iso()}


@router.post("/apikeys", status_code=201)
async def key_create(body: dict, request: Request):
    """신청 없이 바로 만들기(LX 내부용 · 설계 1절) — 신청 시스템 줄이 없으면 함께 만든다(via admin · 승인됨)."""
    p = require(principal(request), admin=True)
    card = str(body.get("card_id") or "")
    async with db(realm="lx") as c:
        svcs = {s["card"]: s for s in await _services(c, False)}
        if card not in svcs:
            raise ApiError("not_found", "없는 분석 서비스입니다")
        aid = str(body.get("applicant_id") or "")
        if aid:
            a = await _app_or_404(c, aid)
            if a["state"] != "approved" and a["via"] != "admin":
                raise ApiError("conflict", "승인한 신청 시스템에만 키를 더할 수 있습니다", None, 409)
        else:
            kind = str(body.get("kind") or "internal")
            if kind not in KINDS:
                raise ApiError("bad_request", "신청 구분을 골라 주세요")
            system = _clean(body.get("system") or body.get("label"), LABEL_MAX)
            if not system:
                raise ApiError("bad_request", "쓰는 시스템 이름을 적어 주세요(예: LX 공간정보 업무 시스템)")
            a = {"id": "apa_" + secrets.token_hex(5), "kind": kind, "system": system, "org": _clean(body.get("org"), 80) or None,
                 "tenant_id": (str(body["tenant_id"])[:40] if body.get("tenant_id") else None), "test": bool(body.get("test"))}
        if a["kind"] == "external":
            raise ApiError("security_review", SECURITY_HOLD, None, 409)
        st = _settings(body, a["kind"])
        async with c.transaction():
            if not aid:
                await c.execute("INSERT INTO api_applicants(id, kind, org, system, services, rights, tenant_id, state, decided_by, decided_at, via, test) "
                                "VALUES ($1,$2,$3,$4,$5,$6,$7,'approved',$8,now(),'admin',$9)",
                                a["id"], a["kind"], a["org"], a["system"], [card], st["rights"], a["tenant_id"], p.user_id, a["test"])
            raw, k = await _make_key(c, p, a, card, st)
    return {"key": raw, "once": "키 값은 지금 한 번만 보입니다. 쓰는 시스템 담당자에게 안전한 길로 전하세요.",
            "item": _key_view(k, None, svcs.get(card), {p.user_id: p.name}), "applicant": {"id": a["id"], "system": a["system"]}, "as_of": now_iso()}


async def _key_or_404(c, kid: str) -> dict:
    if not KEY_ID.match(kid or ""):
        raise ApiError("not_found", "없는 키입니다")
    r = await c.fetchrow("SELECT * FROM api_keys WHERE id=$1", kid)
    if not r:
        raise ApiError("not_found", "없는 키입니다")
    return dict(r)


@router.patch("/apikeys/{kid}")
async def key_patch(kid: str, body: dict, request: Request):
    p = require(principal(request), admin=True)
    async with db(realm="lx") as c:
        k = await _key_or_404(c, kid)
        if k["revoked_at"]:
            raise ApiError("conflict", "폐기한 키는 바꿀 수 없습니다 — 새 키를 만들어 주세요", None, 409)
        kind = (await c.fetchval("SELECT kind FROM api_applicants WHERE id=$1", k["applicant_id"])) or "internal"
        sets = []
        if "paused" in body:
            if not isinstance(body["paused"], bool):
                raise ApiError("bad_request", "paused 는 true | false")
            sets.append(("paused", body["paused"]))
        if "expires_at" in body:
            sets.append(("expires_at", _expires(body["expires_at"])))
        if "formats" in body:
            sets.append(("formats", _formats(body["formats"])))
        if "scope" in body:
            sets.append(("scope", scope_clean(body["scope"])))
        if "sources" in body:
            sets.append(("sources", _sources(body["sources"], kind)))
        if "rights" in body:
            sets.append(("rights", _rights(body["rights"], kind)))
        for col, w, d in (("area_once_km2", "한 번 분석 넓이 한도", AREA_ONCE), ("area_day_km2", "하루 분석 넓이 한도", AREA_DAY),
                          ("area_month_km2", "한 달 분석 넓이 한도", AREA_MONTH)):
            if col in body:
                sets.append((col, _area(body[col], d, w)))
        if "label" in body:
            lb = _clean(body.get("label"), LABEL_MAX)
            if not lb:
                raise ApiError("bad_request", "쓰는 시스템 이름을 적어 주세요")
            sets.append(("label", lb))
        if not sets:
            raise ApiError("bad_request", "바꿀 것이 없습니다")
        before, after = {}, {}
        for col, v in sets:
            before[col], after[col] = (k[col].isoformat() if isinstance(k[col], dt.datetime) else k[col]), (v.isoformat() if isinstance(v, dt.datetime) else v)
            await c.execute(f"UPDATE api_keys SET {col}=$2 WHERE id=$1", kid, v)
        await audit(c, p, "apikey.update", kid, json.loads(json.dumps(before, default=str)), json.loads(json.dumps(after, default=str)))
        k = dict(await c.fetchrow("SELECT * FROM api_keys WHERE id=$1", kid))
        cnt = await _counts(c, [kid])
        svc = await _svc_by_card(c, k["card_id"])
    return {"item": _key_view(k, cnt.get(kid), svc), "as_of": now_iso()}


@router.post("/apikeys/{kid}/revoke")
async def key_revoke(kid: str, request: Request, body: dict | None = None):
    p = require(principal(request), admin=True)
    reason = _clean((body or {}).get("reason"), 200) or None
    async with db(realm="lx") as c:
        k = await _key_or_404(c, kid)
        if k["revoked_at"]:
            raise ApiError("conflict", "이미 폐기한 키입니다", None, 409)
        await c.execute("UPDATE api_keys SET revoked_at=now(), revoked_by=$2, revoke_reason=$3 WHERE id=$1", kid, p.user_id, reason)
        await audit(c, p, "apikey.revoke", kid, None, {"reason": reason, "applicant": k.get("applicant_id"), "card_id": k["card_id"], "test": k["test"]})
        k = dict(await c.fetchrow("SELECT * FROM api_keys WHERE id=$1", kid))
        cnt = await _counts(c, [kid])
        svc = await _svc_by_card(c, k["card_id"])
    return {"item": _key_view(k, cnt.get(kid), svc), "as_of": now_iso()}


WHAT_WORD = {"me": "키 확인", "services": "서비스 목록", "service": "서비스 설명", "coverage": "결과가 있는 곳", "results": "결과 쪽 받기",
             "search": "결과 도형 조회", "summary": "요약", "export": "파일", "usage": "사용량", "analyses": "분석 호출", "imagery": "영상 원천",
             "timepoints": "결과 시점(1차)", "none": "없는 주소"}


def _call_view(r) -> dict:
    return {"at": _iso(r["at"]), "what": WHAT_WORD.get(r["what"] or "", r["what"] or ""), "fmt": FMT_WORD.get(r["fmt"] or ""),
            "rows": None if r["rows"] is None else env(int(r["rows"]), "features", "recorded", "내준 결과 수"),
            "bytes": None if r["bytes"] is None else env(int(r["bytes"]), "bytes", "measured", "내준 크기"),
            "ok": r["status"] < 400, "code": r["code"], "http_status": r["status"], "ip": r["ip"], "test": bool(r["test"])}


@router.get("/apikeys/{kid}/calls")
async def key_calls(kid: str, request: Request, limit: int = 50):
    require(principal(request), admin=True)
    async with db(realm="lx") as c:
        k = await _key_or_404(c, kid)
        rows = await c.fetch("SELECT * FROM api_calls WHERE key_id=$1 ORDER BY at DESC, id DESC LIMIT $2", kid, max(1, min(int(limit), 500)))
        n = await c.fetchval("SELECT count(*) FROM api_calls WHERE key_id=$1", kid)
    return {"key": {"id": k["id"], "label": k["label"], "last4": k["last4"]}, "items": [_call_view(r) for r in rows],
            "total": int(n), "as_of": now_iso()}


# ── [기관 관리자] 받은 API 키 — 그 기관이 신청자인 키만 보기 ─────────────────────────────
@router.get("/spaces/me/apikeys")
async def my_keys(request: Request):
    p = require(principal(request), realm="tenant")
    if p.role != "manager":
        raise ApiError("forbidden", "기관 관리자만 볼 수 있습니다")
    async with db(realm="lx") as c:
        ks = [dict(r) for r in await c.fetch("SELECT * FROM api_keys WHERE tenant_id=$1 AND gen >= 3 AND revoked_at IS NULL ORDER BY created_at DESC", p.tenant_id)]
        cnt = await _counts(c, [k["id"] for k in ks])
        svcs = {s["card"]: s for s in await _services(c, False)}
    items = []
    for k in ks:
        v = _key_view(k, cnt.get(k["id"]), svcs.get(k["card_id"]))
        v.pop("created_by", None)
        items.append(v)
    return {"items": items, "note": "API 키는 기관 시스템이 신청하고 LX 관리자가 승인합니다. 키 값은 승인할 때 한 번만 전해 드리며 여기에는 보이지 않습니다.",
            "as_of": now_iso()}


# ── 외부 창구 ─────────────────────────────────────────────────────────────────
class Ctx:
    def __init__(self, k: dict, app: dict, svc: dict):
        self.k, self.app, self.svc = k, app, svc


def _ip(request: Request) -> str:
    return ((request.headers.get("cf-connecting-ip") or request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
            or (request.client.host if request.client else ""))[:64]


def _err(code: str, message: str, status: int, headers: dict | None = None, detail: dict | None = None) -> ApiError:
    e = ApiError(code, message, detail, status)
    e.headers = headers or {}
    return e


async def _bad_try(ip: str) -> None:
    try:
        r = await redis()
        k = f"apik:bad:{ip}"
        n = await r.incr(k)
        if n == 1:
            await r.expire(k, BAD_WIN)
    except Exception:  # noqa: BLE001
        pass


async def _auth(request: Request, need_fmt: str | None, service: str | None) -> Ctx:
    ip = _ip(request)
    try:
        r = await redis()
        bad = int(await r.get(f"apik:bad:{ip}") or 0)
    except Exception:  # noqa: BLE001
        r, bad = None, 0
    if bad >= BAD_MAX:
        raise _err("too_many_attempts", "틀린 키로 너무 많이 불렀습니다. 10분 뒤 다시 해 주세요.", 429, {"retry-after": str(BAD_WIN)})
    h = request.headers.get("authorization", "")
    tok = h[7:].strip() if h.lower().startswith("bearer ") else ""
    if not tok:
        raise _err("unauthorized", "API 키가 필요합니다 — 머리글 Authorization: Bearer <키>", 401)
    if not tok.startswith(PREFIX):
        await _bad_try(ip)
        raise _err("unauthorized", "화면 로그인으로는 부를 수 없습니다 — 승인받은 API 키를 쓰세요", 401)
    async with db(realm="lx") as c:
        row = await c.fetchrow("SELECT * FROM api_keys WHERE key_hash=$1", key_hash(tok))
    if not row:
        await _bad_try(ip)
        raise _err("unauthorized", "맞지 않는 API 키입니다", 401)
    k = dict(row)
    request.state.api_key = k
    if k["revoked_at"]:
        raise _err("key_revoked", "폐기된 키입니다 — 새 키를 신청해 주세요", 401)
    if k["expires_at"] <= _now():
        raise _err("key_expired", "기간이 끝난 키입니다 — LX 관리자에게 기간 연장을 요청하세요", 401)
    if k["paused"]:
        raise _err("key_paused", "LX 관리자가 멈춘 키입니다", 403)
    if int(k.get("gen") or 1) < 3:                    # 1차 키(기관 × 공유) — 새 주소에서는 쓰지 않는다(API3-1차키 ⓐ)
        raise _err("key_revoked", "지난 방식의 키입니다 — 새로 신청해 주세요", 401)
    if need_fmt and need_fmt not in (k["formats"] or []):
        raise _err("forbidden", f"이 키에 {FMT_WORD.get(need_fmt, need_fmt)} 형식이 없습니다", 403)
    if r is not None:                               # 한도 — 키마다 1분 · 하루
        try:
            now = time.time()
            mk, dk = f"apik:min:{k['id']}:{int(now // 60)}", f"apik:day:{k['id']}:{_day()}"
            n_m = await r.incr(mk)
            if n_m == 1:
                await r.expire(mk, 120)
            if n_m > int(k["per_min"]):
                raise _err("rate_limited", f"1분 한도({k['per_min']}회)를 넘었습니다. 잠시 뒤 다시 해 주세요.", 429, {"retry-after": str(60 - int(now % 60))})
            n_d = await r.incr(dk)
            if n_d == 1:
                await r.expire(dk, 2 * 86400)
            if n_d > int(k["per_day"]):
                tom = (dt.datetime.now(KST) + dt.timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
                raise _err("rate_limited", f"하루 한도({k['per_day']:,}회)를 넘었습니다. 내일 다시 해 주세요.", 429,
                           {"retry-after": str(int((tom - dt.datetime.now(KST)).total_seconds()))})
        except ApiError:
            raise
        except Exception:  # noqa: BLE001 — 저장소가 멈추면 한도는 건너뛴다(호출 기록은 남는다)
            pass
    await ledger_sync()
    async with db(realm="lx") as c:
        app = dict(await c.fetchrow("SELECT * FROM api_applicants WHERE id=$1", k["applicant_id"]) or {}) or {"kind": "internal", "system": k["label"]}
        svc = await _svc_by_card(c, k["card_id"])
    if not svc:
        raise _err("not_found", "없는 서비스입니다", 404)
    if service is not None and service != svc["id"]:   # 키에 없는 서비스 — 있다는 것도 알리지 않는다
        raise _err("not_found", "없는 서비스입니다", 404)
    return Ctx(k, app, svc)


async def _log(request: Request, what: str, fmt: str | None, status: int, code: str | None, rows: int | None, nbytes: int | None, t0: float):
    k = getattr(request.state, "api_key", None) or {}
    try:
        async with db(realm="lx") as c:
            await c.execute("INSERT INTO api_calls(key_id, tenant_id, card_id, method, path, what, fmt, rows, bytes, status, code, ip, ms, test, applicant_id) "
                            "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)",
                            k.get("id"), k.get("tenant_id"), k.get("card_id"), request.method, request.url.path[:200], what, fmt,
                            rows, nbytes, status, code, _ip(request), int((time.perf_counter() - t0) * 1000), bool(k.get("test")), k.get("applicant_id"))
            if k.get("id") and status < 400:
                await c.execute("UPDATE api_keys SET last_used_at=now() WHERE id=$1", k["id"])
    except Exception:  # noqa: BLE001 — 기록 실패가 응답을 막지 않는다
        pass


async def _serve(request: Request, what: str, fmt: str | None, fn, service: str | None = None):
    """키 확인 → 일 → 호출 기록. fn(ctx) → (응답, 결과 수). 스트림 응답은 다 보낸 뒤 크기를 적는다."""
    t0 = time.perf_counter()
    try:
        ctx = await _auth(request, fmt if fmt in FORMATS else None, service)
        resp, rows = await fn(ctx)
    except ApiError as e:
        await _log(request, what, fmt, e.status, e.code, None, None, t0)
        return RawJSON(e.body(), status_code=e.status, headers=getattr(e, "headers", None) or {})
    except Exception:
        await _log(request, what, fmt, 500, "server_error", None, None, t0)
        raise
    if isinstance(resp, StreamingResponse):
        inner = resp.body_iterator
        done = {"n": 0}

        async def counted():
            try:
                async for chunk in inner:
                    b = chunk if isinstance(chunk, (bytes, bytearray)) else str(chunk).encode()
                    done["n"] += len(b)
                    yield b
            finally:
                await _log(request, what, fmt, resp.status_code, None, rows, done["n"], t0)
        resp.body_iterator = counted()
        return resp
    await _log(request, what, fmt, resp.status_code, None, rows, len(resp.body or b""), t0)
    return resp


def _json(o, status: int = 200) -> Response:
    return Response(json.dumps(o, ensure_ascii=False, default=str).encode(), status_code=status, media_type="application/json; charset=utf-8",
                    headers={"cache-control": "no-store"})


# ── 결과 고르기(키 범위 · 원천 → 장부 칸 → 결과 조건) ──────────────────────────────────
class Pick:
    def __init__(self, cells: list[dict], cond: str, args: list, area: dict, crs: int):
        self.cells, self.cond, self.args, self.area, self.crs = cells, cond, args, area, crs
        self.by_set = {c["set_id"]: c for c in cells}
        self.sets = list(self.by_set)


def _in_scope_code(code: str, sc: dict) -> bool:
    """요청한 행정구역 코드(2 · 5 · 10자리)가 키 범위 안인가 — 키 범위보다 넓으면 밖으로 본다."""
    from . import regions as R
    if not sc or sc.get("all"):
        return True
    if sc.get("bbox"):
        r = R.region_of(code[:5]) if len(code) >= 5 else None
        b = (r or {}).get("bbox")
        w, s, e, n = sc["bbox"]
        return bool(b) and not (b[2] < w or b[0] > e or b[3] < s or b[1] > n)
    sg = _scope_sggs(sc) or set()
    if len(code) == 2:
        return any(c == code for c in sc.get("codes") or [])
    return code[:5] in sg


async def _pick(ctx: Ctx, region: str | None, bbox: str | None, source: str | None, year, kind: str | None = None, since: str | None = None,
                crs: str | None = None, geometry: dict | None = None) -> Pick:
    from . import regions as R
    from shapely.geometry import box, shape
    k, sc = ctx.k, ctx.k.get("scope") or {"all": True}
    keysrc = list(k.get("sources") or [])
    if source not in (None, ""):
        if source not in SOURCES:
            raise ApiError("bad_request", "source 는 ngii-aerial · vworld · lx 가운데 하나입니다")
        if source not in keysrc:
            raise ApiError("not_found", "이 키로 쓸 수 없는 영상 원천입니다")
    yr = None
    if year not in (None, ""):
        try:
            yr = int(year)
        except (TypeError, ValueError):
            raise ApiError("bad_request", "year 는 네 자리 연도입니다")
    epsg = CRS_OK.get(str(crs or "4326").replace("EPSG:", ""))
    if not epsg:
        raise ApiError("bad_request", "crs 는 4326 · 5186 · 5179 가운데 하나입니다")
    codes = [x.strip() for x in str(region or "").split(",") if x.strip()]
    for cd in codes:
        if not re.fullmatch(r"\d{2}|\d{5}|\d{10}", cd):
            raise ApiError("bad_request", "region 은 시도 2자리 · 시군구 5자리 · 읍면동 10자리 코드입니다")
        if len(cd) >= 5 and not R.region_of(cd[:5]):
            raise ApiError("not_found", "없는 행정구역입니다")
        if not _in_scope_code(cd, sc):
            raise ApiError("not_found", "없는 결과입니다")       # 범위 밖 — 있다는 것도 알리지 않는다
    sg_scope = _scope_sggs(sc)
    bb = _bbox(bbox) if bbox not in (None, "") else None
    geo = None
    if geometry is not None:
        try:
            geo = shape(geometry)
            if geo.geom_type not in ("Polygon", "MultiPolygon") or not geo.is_valid or geo.is_empty:
                raise ValueError
            n_pts = sum(len(p.exterior.coords) for p in (geo.geoms if geo.geom_type == "MultiPolygon" else [geo]))
            if n_pts > 10000:
                raise ApiError("bad_geometry", "도형 꼭짓점은 10,000개까지입니다", None, 422)
            x0, y0, x1, y1 = geo.bounds
            if not (-180 <= x0 <= x1 <= 180 and -90 <= y0 <= y1 <= 90):
                raise ValueError
        except ApiError:
            raise
        except Exception:  # noqa: BLE001
            raise ApiError("bad_geometry", "도형이 맞지 않습니다 — 경위도 Polygon · MultiPolygon", None, 422)
    sgeo = _scope_geom(sc)
    for g in ([box(*bb)] if bb else []) + ([geo] if geo is not None else []):
        if sgeo is not None and not sgeo.intersects(g):
            raise ApiError("not_found", "없는 결과입니다")
    async with db(realm="lx") as c:
        rows = [dict(r) for r in await c.fetch("SELECT * FROM service_results s WHERE card_id=$1 AND replaced_at IS NULL" + SQL_NOT_EXCLUDED, k["card_id"])]
    cells = []
    for r in rows:
        if r["source"] not in keysrc:
            continue
        if source and r["source"] != source:
            continue
        if yr is not None and r["year"] != yr:
            continue
        reg = R.region_of(r["sgg_cd"]) or {}
        rc = {c for c in (reg.get("sgg_cd"), reg.get("prev_cd"), r["sgg_cd"]) if c}
        if sg_scope is not None and not (rc & sg_scope):
            continue
        if codes and not any((cd[:5] in rc) if len(cd) >= 5 else any(x.startswith(cd) for x in rc) for cd in codes):
            continue
        rb = reg.get("bbox")
        for g in ([box(*bb)] if bb else []) + ([geo] if geo is not None else []):
            if rb and not box(*rb).intersects(g):
                rc = None
                break
        if rc is None:
            continue
        if since:
            try:
                s_at = dt.datetime.fromisoformat(since.replace("Z", "+00:00"))
                if s_at.tzinfo is None:
                    s_at = s_at.replace(tzinfo=KST)
            except ValueError:
                raise ApiError("bad_request", "since 는 ISO 8601 시각입니다(예: 2026-10-01T00:00:00+09:00)")
            if not r["analyzed_at"] or r["analyzed_at"] <= s_at:
                continue
        cells.append({**r, "region": reg.get("name"), "region_full": reg.get("full")})
    if yr is None:                                  # 연도를 안 주면 곳마다(시군구 × 원천) 가장 최근
        best: dict[tuple, int] = {}
        for x in cells:
            kk = (x["sgg_cd"], x["source"])
            best[kk] = max(best.get(kk, -1), x["year"] or 0)
        cells = [x for x in cells if (x["year"] or 0) == best[(x["sgg_cd"], x["source"])]]
    cond, args = ["d.job_id = ANY($1::text[])", "d.edit_state <> 'deleted'"], [[x["set_id"] for x in cells]]
    emds = [cd for cd in codes if len(cd) == 10]
    if emds:
        args.append(emds)
        cond.append(f"(d.emd_cd = ANY(${len(args)}::text[]) OR left(d.pnu, 10) = ANY(${len(args)}::text[]))")
    for g in ([sc["bbox"]] if sc.get("bbox") else []) + ([bb] if bb else []):
        args.extend(g)
        n = len(args)
        cond.append(f"ST_Intersects(d.geom, ST_MakeEnvelope(${n - 3}, ${n - 2}, ${n - 1}, ${n}, 4326))")
    if geo is not None:
        args.append(json.dumps(geometry))
        cond.append(f"ST_Intersects(d.geom, ST_SetSRID(ST_GeomFromGeoJSON(${len(args)}), 4326))")
    if kind:
        args.append(str(kind))
        cond.append(f"(d.cls_en = ${len(args)} OR d.cls = ${len(args)})")
    area = {"region": codes or None, "bbox": bb, "geometry": bool(geo is not None), "key_scope": scope_words(sc)}
    return Pick(cells, " AND ".join(cond), args, area, epsg)


def _imagery_meta(cells: list[dict]) -> list[dict]:
    out, seen = [], set()
    for x in cells:
        kk = (x["source"], x["year"])
        if kk in seen:
            continue
        seen.add(kk)
        base = SOURCES.get(x["source"], {}).get("attribution") or x["source"]
        out.append({"source": x["source"], "year": x["year"], "attribution": f"{base} {x['year']}" if x["year"] else base})
    return out


def _props3(r, cell: dict) -> dict:
    return {"id": r["fid"] or str(r["id"]), "kind": S.class_ko(r["cls"], r["cls_en"]), "code": r["cls_en"] or r["cls"],
            "score": round(float(r["conf"]), 3) if r["conf"] is not None else None,
            "area_m2": round(float(r["area_m2"]), 1) if r["area_m2"] is not None else None,
            "emd": r["emd"] if r["emd"] not in S.NO_EMD else None, "emd_cd": r["ecd"],
            "parcel": r["pnu"], "check": S.CHECK_WORD.get(r["edit_state"], r["edit_state"]),
            "source": cell["source"], "year": cell["year"], "service_version": cell["service_version"], "analyzed_at": _iso(cell["analyzed_at"])}


def _props(r, rl: str, ver: str, edition: int | None) -> dict:
    """1차 모양(LX 지도 서비스 레이어 내려받기 · staff_home 이 같은 열을 쓴다) — 그대로 둔다."""
    return {"id": r["fid"] or str(r["id"]), "kind": S.class_ko(r["cls"], r["cls_en"]), "code": r["cls_en"] or r["cls"],
            "score": round(float(r["conf"]), 3) if r["conf"] is not None else None,
            "area": round(float(r["area_m2"]), 1) if r["area_m2"] is not None else None,
            "emd": r["emd"] if r["emd"] not in S.NO_EMD else None, "parcel": r["pnu"], "check": S.CHECK_WORD.get(r["edit_state"], r["edit_state"]),
            "round": rl, "version": ver, "edition": edition}


_COLS = "d.id, d.fid, d.job_id, d.cls, d.cls_en, d.conf, d.area_m2, d.emd, coalesce(d.emd_cd, left(d.pnu, 10)) AS ecd, d.pnu, d.edit_state"
_TOTAL: dict[str, tuple[float, int]] = {}


async def _total(pk: Pick) -> int:
    if not pk.sets:
        return 0
    key = pk.cond + json.dumps(pk.args, default=str, sort_keys=True)
    hit = _TOTAL.get(key)
    if hit and time.time() - hit[0] < 600:
        return hit[1]
    async with db(realm="lx") as c:
        n = int(await c.fetchval(f"SELECT count(*) FROM detections d WHERE {pk.cond}", *pk.args))
    _TOTAL[key] = (time.time(), n)
    while len(_TOTAL) > 256:
        _TOTAL.pop(next(iter(_TOTAL)))
    return n


def _geo_sql(pk: Pick) -> str:
    return "ST_AsGeoJSON(d.geom, 7)" if pk.crs == 4326 else f"ST_AsGeoJSON(ST_Transform(d.geom, {pk.crs}), 3)"


def _cursor(last: int) -> str:
    return base64.urlsafe_b64encode(f"r3:{last}".encode()).decode().rstrip("=")


def _uncursor(c: str) -> int:
    try:
        tag, last = base64.urlsafe_b64decode(c + "=" * (-len(c) % 4)).decode().split(":")
        assert tag == "r3"
        return int(last)
    except Exception:  # noqa: BLE001
        raise ApiError("bad_request", "cursor 가 맞지 않습니다 — 앞 쪽 답의 next 값을 그대로 넣어 주세요")


def _svc_meta(ctx: Ctx, cells: list[dict]) -> dict:
    vers = sorted({x["service_version"] for x in cells if x.get("service_version")})
    return {"id": ctx.svc["id"], "name": ctx.svc["name"], "version": ", ".join(vers) or None}


async def _page(ctx: Ctx, pk: Pick, cursor: str | None, limit: int):
    after = _uncursor(cursor) if cursor else 0
    n = max(1, min(int(limit or PAGE_MAX), PAGE_MAX))
    rows = []
    if pk.sets:
        args = pk.args + [after]
        async with db(realm="lx") as c:
            rows = await c.fetch(f"SELECT {_COLS}, {_geo_sql(pk)} AS g FROM detections d WHERE {pk.cond} AND d.id > ${len(args)} "
                                 f"ORDER BY d.id LIMIT {n + 1}", *args)
    more = len(rows) > n
    rows = rows[:n]
    feats = []
    for r in rows:
        pr = _props3(r, pk.by_set[r["job_id"]])
        feats.append({"type": "Feature", "id": pr["id"], "geometry": json.loads(r["g"]) if r["g"] else None, "properties": pr})
    total = await _total(pk)
    meta = {"service": _svc_meta(ctx, pk.cells), "area": pk.area, "imagery": _imagery_meta(pk.cells), "total": total, "count": len(feats),
            "next": _cursor(int(rows[-1]["id"])) if more and rows else None, "crs": f"EPSG:{pk.crs}", "gaps": [], "notice": S.NOTICE}
    return _json({"type": "FeatureCollection", "lx": meta, "features": feats}), len(feats)


@ext.get("/me")
async def x_me(request: Request):
    async def run(ctx: Ctx):
        k = ctx.k
        try:
            r = await redis()
            used_d = int(await r.get(f"apik:day:{k['id']}:{_day()}") or 0)
        except Exception:  # noqa: BLE001
            used_d = None
        async with db(realm="lx") as c:
            vers = [r["service_version"] for r in await c.fetch("SELECT DISTINCT service_version FROM service_results s WHERE card_id=$1 AND replaced_at IS NULL " + SQL_NOT_EXCLUDED + " "
                                                                  "AND service_version IS NOT NULL", k["card_id"])]
        ar = _area_view(k)
        sc = k.get("scope") or {"all": True}
        return _json({"system": ctx.app.get("system") or k["label"], "kind": ctx.app.get("kind"), "kind_label": KINDS.get(ctx.app.get("kind"), ""),
                      "service": {"id": ctx.svc["id"], "name": ctx.svc["name"], "version": ", ".join(sorted(vers)) or None},
                      "rights": k.get("rights") or "read", "rights_label": RIGHTS.get(k.get("rights") or "read"),
                      "scope": {**sc, "words": scope_words(sc)}, "sources": list(k.get("sources") or []),
                      "formats": [f for f in FORMATS if f in (k["formats"] or [])],
                      "limits": {"per_min": k["per_min"], "per_day": k["per_day"], "used_today": used_d,
                                 "area_once_km2": ar["once"], "area_day_km2": ar["day"], "area_month_km2": ar["month"]},
                      "expires_at": _iso(k["expires_at"]), "analyses": {"open": False, "message": NOT_OPEN},
                      "notice": S.NOTICE, "as_of": now_iso()}), None
    return await _serve(request, "me", None, run)


def _svc_doc(ctx: Ctx, kinds: list[dict], vers: list[str]) -> dict:
    return {"id": ctx.svc["id"], "name": ctx.svc["name"], "line": ctx.svc.get("line"), "version": ", ".join(vers) or None,
            "kinds": kinds, "formats": [f for f in FORMATS if f in (ctx.k["formats"] or [])],
            "sources": {"results": list(ctx.k.get("sources") or []), "analyze": ctx.svc.get("analyze_sources") or []},
            "analyses": {"open": False, "message": NOT_OPEN}}


async def _kinds(ctx: Ctx) -> tuple[list[dict], list[str]]:
    async with db(realm="lx") as c:
        cells = [dict(r) for r in await c.fetch("SELECT set_id, service_version FROM service_results s WHERE card_id=$1 AND replaced_at IS NULL " + SQL_NOT_EXCLUDED + " "
                                                 "AND source = ANY($2::text[])", ctx.k["card_id"], list(ctx.k.get("sources") or []))]
        ks = await c.fetch("SELECT DISTINCT cls, cls_en FROM detections WHERE job_id = ANY($1::text[]) AND edit_state <> 'deleted' LIMIT 50",
                           [x["set_id"] for x in cells]) if cells else []
    kinds, seen = [], set()
    for r in ks:
        code = r["cls_en"] or r["cls"]
        if code in seen:
            continue
        seen.add(code)
        kinds.append({"code": code, "name": S.class_ko(r["cls"], r["cls_en"])})
    return kinds, sorted({x["service_version"] for x in cells if x["service_version"]})


@ext.get("/services")
async def x_services(request: Request):
    async def run(ctx: Ctx):
        kinds, vers = await _kinds(ctx)
        return _json({"items": [_svc_doc(ctx, kinds, vers)], "as_of": now_iso()}), 1
    return await _serve(request, "services", None, run)


@ext.get("/services/{service}")
async def x_service(service: str, request: Request):
    async def run(ctx: Ctx):
        kinds, vers = await _kinds(ctx)
        return _json({**_svc_doc(ctx, kinds, vers), "as_of": now_iso()}), None
    return await _serve(request, "service", None, run, service)


@ext.get("/services/{service}/coverage")
async def x_coverage(service: str, request: Request, region: str | None = None, bbox: str | None = None, source: str | None = None, year: str | None = None):
    async def run(ctx: Ctx):
        # 결과가 있는 곳은 연도를 모두 보인다(가장 최근만이 아니라) — 연도를 주면 그 연도만
        pk = await (_pick_all_years(ctx, region, bbox, source) if year in (None, "") else _pick(ctx, region, bbox, source, year))
        cells = pk.cells
        n = {}
        if cells:
            async with db(realm="lx") as c:
                n = {r["job_id"]: int(r["n"]) for r in await c.fetch(
                    "SELECT d.job_id, count(*) n FROM detections d WHERE d.job_id = ANY($1::text[]) AND d.edit_state <> 'deleted' GROUP BY 1",
                    [x["set_id"] for x in cells])}
        items = [{"region": {"code": x["sgg_cd"], "name": x["region_full"] or x["region"]}, "source": x["source"], "year": x["year"],
                  "service_version": x["service_version"], "analyzed_at": _iso(x["analyzed_at"]), "count": n.get(x["set_id"], 0)}
                 for x in sorted(cells, key=lambda x: (x["sgg_cd"], -(x["year"] or 0)))]
        return _json({"service": _svc_meta(ctx, cells), "area": pk.area, "items": items, "notice": S.NOTICE, "as_of": now_iso()}), len(items)
    return await _serve(request, "coverage", None, run, service)


async def _pick_all_years(ctx: Ctx, region, bbox, source) -> Pick:
    """연도마다 모두(coverage 용) — _pick 은 연도가 없으면 곳마다 가장 최근만 남긴다."""
    async with db(realm="lx") as c:
        years = sorted({r["year"] for r in await c.fetch("SELECT DISTINCT year FROM service_results s WHERE card_id=$1 AND replaced_at IS NULL" + SQL_NOT_EXCLUDED, ctx.k["card_id"])},
                       key=lambda y: (y is None, y))
    cells, area = [], None
    for y in years:
        if y is None:
            continue
        pk = await _pick(ctx, region, bbox, source, y)
        cells += pk.cells
        area = pk.area
    pk0 = await _pick(ctx, region, bbox, source, None)
    for x in pk0.cells:
        if x["year"] is None:
            cells.append(x)
    return Pick(cells, pk0.cond, pk0.args, area or pk0.area, pk0.crs)


@ext.get("/services/{service}/results")
async def x_results(service: str, request: Request, region: str | None = None, bbox: str | None = None, source: str | None = None,
                    year: str | None = None, kind: str | None = None, since: str | None = None, cursor: str | None = None,
                    limit: int = PAGE_MAX, crs: str | None = None):
    async def run(ctx: Ctx):
        pk = await _pick(ctx, region, bbox, source, year, kind, since, crs)
        return await _page(ctx, pk, cursor, limit)
    return await _serve(request, "results", "geojson", run, service)


@ext.post("/services/{service}/results/search")
async def x_search(service: str, request: Request, body: dict | None = None, cursor: str | None = None, limit: int = PAGE_MAX):
    async def run(ctx: Ctx):
        b = body or {}
        if not isinstance(b.get("geometry"), dict):
            raise ApiError("bad_geometry", "본문에 geometry(경위도 Polygon · MultiPolygon)를 넣어 주세요", None, 422)
        pk = await _pick(ctx, None, None, b.get("source"), b.get("year"), b.get("kind"), b.get("since"), b.get("crs"), b["geometry"])
        return await _page(ctx, pk, b.get("cursor") or cursor, b.get("limit") or limit)
    return await _serve(request, "search", "geojson", run, service)


@ext.get("/services/{service}/summary")
async def x_summary(service: str, request: Request, region: str | None = None, bbox: str | None = None, source: str | None = None, year: str | None = None):
    async def run(ctx: Ctx):
        pk = await _pick(ctx, region, bbox, source, year)
        kinds, emds, places = [], [], {}
        total, area = 0, 0.0
        if pk.sets:
            async with db(realm="lx") as c:
                for r in await c.fetch(f"SELECT d.cls, d.cls_en, count(*) n, coalesce(sum(d.area_m2), 0) a FROM detections d WHERE {pk.cond} GROUP BY 1, 2 ORDER BY 3 DESC", *pk.args):
                    kinds.append({"kind": S.class_ko(r["cls"], r["cls_en"]), "code": r["cls_en"] or r["cls"], "count": int(r["n"]), "area_m2": round(float(r["a"]), 1)})
                    total += int(r["n"])
                    area += float(r["a"])
                for r in await c.fetch(f"SELECT d.emd, coalesce(d.emd_cd, left(d.pnu, 10)) ecd, count(*) n FROM detections d WHERE {pk.cond} "
                                       f"AND d.emd IS NOT NULL AND d.emd <> ALL(${len(pk.args) + 1}::text[]) GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 300",
                                       *pk.args, list(S.NO_EMD)):
                    emds.append({"emd": r["emd"], "emd_cd": r["ecd"], "count": int(r["n"])})
                for r in await c.fetch(f"SELECT d.job_id, count(*) n FROM detections d WHERE {pk.cond} GROUP BY 1", *pk.args):
                    cell = pk.by_set[r["job_id"]]
                    key = cell["region_full"] or cell["region"] or cell["sgg_cd"]
                    places[key] = places.get(key, 0) + int(r["n"])
        return _json({"service": _svc_meta(ctx, pk.cells), "area": pk.area, "imagery": _imagery_meta(pk.cells),
                      "total": total, "area_m2": round(area, 1), "kinds": kinds,
                      "regions": [{"region": k2, "count": v} for k2, v in sorted(places.items(), key=lambda kv: -kv[1])],
                      "emds": emds, "notice": S.NOTICE, "as_of": now_iso()}), total
    return await _serve(request, "summary", "summary", run, service)


@ext.get("/services/{service}/exports/{fmt}")
async def x_export(service: str, fmt: str, request: Request, region: str | None = None, bbox: str | None = None, source: str | None = None,
                   year: str | None = None, kind: str | None = None):
    async def run(ctx: Ctx):
        if fmt not in FORMATS:
            raise ApiError("not_found", "형식은 geojson · shp · parcels 가운데 하나입니다")
        pk = await _pick(ctx, region, bbox, source, year, kind)
        meta = _svc_meta(ctx, pk.cells)
        img = _imagery_meta(pk.cells)
        rl = " / ".join(" · ".join(str(s) for s in (x["region"], x["attribution"]) if s) for x in
                        [{"region": c2["region"], "attribution": next((i["attribution"] for i in img if i["source"] == c2["source"] and i["year"] == c2["year"]), "")}
                         for c2 in pk.cells])[:300]
        ver = meta["version"] or ""
        base = re.sub(r"[\\/:*?\"<>|\s]+", "_", f"LandXI_{ctx.svc['name']}_{dt.datetime.now(KST):%Y%m%d}")
        if fmt == "geojson":
            total = await _total(pk)
            head = {"service": meta, "area": pk.area, "imagery": img, "total": total, "crs": "EPSG:4326", "notice": S.NOTICE, "made": now_iso()}

            async def gen():
                yield b'{"type":"FeatureCollection","lx":' + json.dumps(head, ensure_ascii=False).encode() + b',"features":['
                if pk.sets:
                    first = True
                    async with db(realm="lx") as c:
                        cur = c.cursor(f"SELECT {_COLS}, ST_AsGeoJSON(d.geom, 7) AS g FROM detections d WHERE {pk.cond} ORDER BY d.id", *pk.args, prefetch=2000)
                        async for r in cur:
                            pr = _props3(r, pk.by_set[r["job_id"]])
                            f = '{"type":"Feature","id":' + json.dumps(pr["id"]) + ',"geometry":' + (r["g"] or "null") + ',"properties":' + json.dumps(pr, ensure_ascii=False) + "}"
                            yield (b"" if first else b",") + f.encode()
                            first = False
                yield b"]}"
            return StreamingResponse(gen(), media_type="application/geo+json",
                                     headers={"content-disposition": S._disposition(base + ".geojson"), "cache-control": "no-store"}), total
        if fmt == "shp":
            rows = []
            if pk.sets:
                async with db(realm="lx") as c:
                    rows = await c.fetch(f"SELECT {_COLS}, ST_AsGeoJSON(d.geom, 7) AS g FROM detections d WHERE {pk.cond} ORDER BY d.id", *pk.args)
            stem = re.sub(r"[^0-9A-Za-z가-힣_]+", "_", base)[:60] or "landxi"
            data, n = await run_in_threadpool(_shp_zip, rows, stem, rl, ver, None)
            return Response(data, media_type="application/zip", headers={"content-disposition": S._disposition(base + "_shp.zip"), "cache-control": "no-store"}), n
        # 필지 엑셀 — 같은 결과 묶음의 필지 행(spaces._parcel_rows · _xlsx 그대로) 가운데 이 조건의 결과가 걸친 필지만
        if not pk.sets:
            raise ApiError("not_found", "이 조건에는 필지와 이은 결과가 없습니다")
        async with db(realm="lx") as c:
            keep = {r["pnu"] for r in await c.fetch(f"SELECT DISTINCT d.pnu FROM detections d WHERE {pk.cond} AND d.pnu IS NOT NULL", *pk.args)}
        rows, how = await S._parcel_rows("lx", pk.sets, await S._parcel_src("lx", pk.sets), None)
        rows = [r for r in rows if r["pnu"] in keep] if how == "detections" else [r for r in rows if r["pnu"] in keep or not keep]
        if not rows:
            raise ApiError("not_found", "이 조건에는 필지와 이은 결과가 없습니다")
        info = [("서비스", ctx.svc["name"]), ("범위", " · ".join(pk.area["key_scope"])), ("영상", " · ".join(i["attribution"] for i in img)),
                ("서비스 판", ver), ("만든 때", now_iso()), ("필지 수", len(rows)), ("안내", S.NOTICE)]
        g = {"body": {"version": {"service": [ver] if ver else []}, "when": {"rounds": [{"place": c2["region"], "shot": next((i["attribution"] for i in img if i["source"] == c2["source"] and i["year"] == c2["year"]), ""),
                                                                                          "analyzed": (_iso(c2["analyzed_at"]) or "")[:10]} for c2 in pk.cells]}}, "edition": None}
        data = await run_in_threadpool(S._xlsx, "LX", {"name": ctx.svc["name"]}, g, rows, how, info)
        return Response(data, media_type=S.FMT["parcels"][3], headers={"content-disposition": S._disposition(base + "_필지.xlsx"), "cache-control": "no-store"}), len(rows)
    return await _serve(request, "export", fmt if fmt in FORMATS else None, run, service)


@ext.get("/usage")
async def x_usage(request: Request):
    async def run(ctx: Ctx):
        async with db(realm="lx") as c:
            cnt = await _counts(c, [ctx.k["id"]])
        d, m = cnt.get(ctx.k["id"], (0, 0))
        return _json({"calls": {"today": int(d), "month": int(m)}, "analyses": {"area_km2": {"today": 0, "month": 0}, "open": False},
                      "limits": {"per_min": ctx.k["per_min"], "per_day": ctx.k["per_day"], **{f"area_{x}_km2": v for x, v in _area_view(ctx.k).items()}},
                      "as_of": now_iso()}), None
    return await _serve(request, "usage", None, run)


def _shp_zip(rows: list, name: str, rl: str, ver: str, edition: int | None) -> tuple[bytes, int]:
    """SHP 묶음 — 1차와 같은 함수(LX 지도 서비스 레이어 내려받기도 쓴다)."""
    import shapefile
    shp, shx, dbf = io.BytesIO(), io.BytesIO(), io.BytesIO()
    w = shapefile.Writer(shp=shp, shx=shx, dbf=dbf, shapeType=shapefile.POLYGON, encoding="utf-8")
    for f, t, size, dec in (("id", "C", 40, 0), ("kind", "C", 40, 0), ("code", "C", 40, 0), ("score", "N", 8, 3), ("area", "N", 16, 1),
                            ("emd", "C", 40, 0), ("parcel", "C", 19, 0), ("check", "C", 10, 0), ("round", "C", 160, 0), ("version", "C", 40, 0),
                            ("edition", "N", 6, 0)):
        w.field(f, t, size=size, decimal=dec)
    n = 0
    for r in rows:
        if not r["g"]:
            continue
        geo = json.loads(r["g"])
        if geo.get("type") not in ("Polygon", "MultiPolygon"):
            continue
        p = _props(r, rl, ver, edition)
        w.shape(geo)
        w.record(p["id"], p["kind"], p["code"], p["score"], p["area"], p["emd"] or "", p["parcel"] or "", p["check"] or "", (p["round"] or "")[:160],
                 p["version"] or "", edition)
        n += 1
    w.close()
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr(name + ".shp", shp.getvalue())
        z.writestr(name + ".shx", shx.getvalue())
        z.writestr(name + ".dbf", dbf.getvalue())
        z.writestr(name + ".prj", WGS84_PRJ)
        z.writestr(name + ".cpg", "UTF-8")
        z.writestr("읽어 주세요.txt", "\n".join([
            "열 설명 — id 결과 번호(바뀌지 않음) · kind 종류 · code 종류 코드 · score AI 점수 0–1(확률 아님) · area 넓이 ㎡ · emd 읍면동 ·",
            "parcel 필지 번호 19자리(글자) · check 결과 확인(확인 전 · 고침) · round 지역 · 영상 · version 서비스 판",
            "좌표 — 경위도(EPSG:4326) · 글자 — UTF-8(.cpg)", S.NOTICE, ""]))
    return out.getvalue(), n


# ── 분석 호출(2차) — 아직 열리지 않음 ──────────────────────────────────────────────
async def _not_open(request: Request, service: str | None):
    async def run(ctx: Ctx):
        if (ctx.k.get("rights") or "read") != "read_analyze":
            raise ApiError("forbidden", "이 키는 결과 조회만 합니다 — 분석 호출 권한이 없습니다", None, 403)
        raise ApiError("not_open", NOT_OPEN, {"open": False}, 501)
    return await _serve(request, "analyses", None, run, service)


@ext.get("/imagery")
async def x_imagery(request: Request):
    return await _not_open(request, None)


@ext.api_route("/services/{service}/analyses", methods=["GET", "POST"])
async def x_analyses(service: str, request: Request):
    return await _not_open(request, service)


@ext.api_route("/services/{service}/analyses/{rest:path}", methods=["GET", "POST", "DELETE"])
async def x_analyses_one(service: str, rest: str, request: Request):
    return await _not_open(request, service)


@ext.api_route("/{rest:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def x_none(rest: str, request: Request):
    """없는 길(1차 주소 /results · /timepoints · /exports 포함 — API3-1차키 ⓐ · 영상 올리기 — 원칙 179) — 404 · 기록."""
    async def run(ctx: Ctx):
        raise ApiError("not_found", "없는 주소입니다 — 주소 목록은 API 안내를 보세요")
    return await _serve(request, "none", None, run)
