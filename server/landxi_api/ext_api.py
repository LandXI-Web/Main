"""외부 연동 API 1차 — 결과 가져오기만(원칙 54 · 69 · 174 · 178 · 179 · 확인 대장 API-형식3 ⓐ · API-공유끔 ⓐ · 설계 design-r15/open-api-2).

한 줄: 기관에 공유된 분석 서비스 하나 = 키 하나. 키를 든 기관의 다른 시스템은 그 기관 관할 · 그 서비스의 AI 분석 결과(지난 결과 포함)를 가져간다.
분석 맡기기 · 외부 영상 올리기는 1차에 만들지 않는다(원칙 179 — 보안 검토 review-r16 기록만).

[LX 관리자 — 배포 → API 탭] 키는 LX 관리자가 만들고 관리한다(원칙 178 · 기관 관리자 발급 아님)
  GET  /api/v1/apikeys                    기관 × 공유된 서비스 줄마다 키 목록(상태 · 끝나는 날 · 마지막 호출 · 오늘 · 이번 달 호출)
  POST /api/v1/apikeys                    {tenant_id, card_id, label, expires_at?, formats?, per_min?, per_day?, test?} → 키 값은 이 답에서 한 번만
  PATCH /api/v1/apikeys/{id}              {paused?, expires_at?, formats?, label?} 멈춤 · 다시 켜기 · 끝나는 날 · 범위
  POST /api/v1/apikeys/{id}/revoke        {reason?} 폐기(되살리지 않는다 · 기록은 남는다)
  GET  /api/v1/apikeys/{id}/calls         그 키의 최근 호출 기록(감사)
[기관 관리자 — 기관 정보] 받은 키를 보기만(키 값 0 · 끝 네 자리만)
  GET  /api/v1/spaces/me/apikeys
[외부 창구 — 바깥 주소 api.land-xi.dev/v1/* = 게이트웨이 /api/ext/v1/*] 머리글 Authorization: Bearer lxk_…
  GET  /api/ext/v1/me                     키 확인 — 기관 · 서비스 · 판 · 관할 · 범위 · 한도 남은 양 · 끝나는 날
  GET  /api/ext/v1/timepoints             결과 시점(결과 설명서 판 — 지난 결과 포함)
  GET  /api/ext/v1/results?edition=&cursor=&limit=   GeoJSON 한 쪽(최대 1,000개) · 다음 쪽 열쇠
  GET  /api/ext/v1/summary?edition=       요약(기관 화면 '요약' 내려받기와 같은 값)
  GET  /api/ext/v1/exports/{geojson|shp|parcels}?edition=   파일(기관 화면 내려받기와 같은 값 · 같은 관할 자르기 · SHP 는 같은 값을 SHP 로)

지키는 것
  · 키 값은 만들 때 한 번만 보이고, 서버에는 한 방향 암호(HMAC-SHA256)와 끝 네 자리만. 화면 로그인 토큰(lxs_ · lxt_)으로는 외부 창구를 못 부르고,
    키(lxk_)로는 화면 API(/api/v1)를 못 부른다(auth.resolve 가 lxk_ 를 손님으로 본다).
  · 키가 살아 있는 조건 = 폐기 안 됨 · 끝나는 날 전 · 멈춤 아님 · 그 서비스가 그 기관에 지금 공유됨(release._effective — 기관 '서비스 선택'과 한 판정).
    공유를 거두면 키는 멈추고(호출 거절 · 기록) 다시 공유하면 그대로 이어진다(API-공유끔 ⓐ).
  · 관할 밖 · 다른 서비스 · 없는 시점 = 404(있다는 것도 알리지 않는다). 결과는 spaces.py 내려받기 함수를 그대로 쓴다(숫자 한 출처 · 원칙 39).
  · 한도 = 키마다 1분 · 하루 호출 수(LX 관리자가 키를 만들 때 정함). 넘으면 429 + 다시 해도 되는 때(Retry-After).
  · 모든 호출 한 줄(api_calls — 시각 · 키 · 기관 · 서비스 · 무엇을 · 형식 · 몇 건 · 크기 · 결과 코드 · 접속 주소). 키 값은 어디에도 적지 않는다.
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
from .envelope import KST, RawJSON, env, now_iso

router = APIRouter()          # 화면용(/api/v1) — LX 관리자 · 기관 관리자
ext = APIRouter()             # 외부 창구(/api/ext/v1)

PREFIX = "lxk_"
FORMATS = ("geojson", "shp", "parcels")
FMT_WORD = {"geojson": "GeoJSON", "shp": "SHP", "parcels": "필지 엑셀"}
PAGE_MAX = 1000
PER_MIN, PER_DAY = 60, 20000                 # 초기값(제안 · 설계 3절) — 키를 만들 때 LX 관리자가 바꾼다
DAYS_DEFAULT, DAYS_MAX = 365, 730
BAD_MAX, BAD_WIN = 20, 600                   # 틀린 키 — 접속 주소마다 10분 20번(화면 로그인 제한과 따로)
LABEL_MAX = 60
KEY_ID = re.compile(r"^key_[0-9a-f]{12}$")
WGS84_PRJ = ('GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],'
             'PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]')


def key_hash(raw: str) -> str:
    return hmac.new(config.SESSION_SECRET, ("apikey:" + raw).encode(), hashlib.sha256).hexdigest()


def _iso(v) -> str | None:
    return v.astimezone(KST).isoformat(timespec="seconds") if v else None


def _now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def _day() -> str:
    return dt.datetime.now(KST).strftime("%Y%m%d")


def state_of(k: dict, shared: bool) -> tuple[str, str]:
    """키 상태(코드, 사람 말) — 폐기 > 끝남 > 멈춤(관리자) > 멈춤(공유 거둠) > 켜짐."""
    if k.get("revoked_at"):
        return "revoked", "폐기"
    if k["expires_at"] <= _now():
        return "expired", "기간 끝남"
    if k.get("paused"):
        return "paused", "멈춤"
    if not shared:
        return "unshared", "멈춤 · 공유 거둠"
    return "on", "켜짐"


# ── 공유 판정(기관 '서비스 선택'과 한 판정) ─────────────────────────────────────
async def _orgs_shared() -> tuple[dict, dict, dict]:
    """(기관 {id: 줄}, 공유 {tenant: {card: svc}}, 서비스 이름 {card: name})."""
    from .release import _effective, _orgs, _services_list
    async with db(realm="lx") as c:
        orgs = await _orgs(c)
        svcs = {s["id"]: s for s in await _services_list(c)}
    eff = await _effective(orgs)
    return {o["id"]: o for o in orgs}, eff, svcs


async def _shared(tenant: str, card: str) -> bool:
    from .brand import _services
    async with db(realm="lx") as c:
        row = await c.fetchrow("SELECT b.services FROM tenants t LEFT JOIN tenant_brand b ON b.tenant_id = t.id "
                               "WHERE t.id=$1 AND t.kind='user' AND t.status='active'", tenant)
    if not row:
        return False
    svcs = await _services(tenant, list(row["services"]) if row["services"] else None, {})
    return any(s["card"] == card for s in svcs)


async def _counts(conn, key_ids: list[str]) -> dict:
    """키마다 오늘 · 이번 달 성공 호출 수(api_calls)."""
    if not key_ids:
        return {}
    now = dt.datetime.now(KST)
    d0 = now.replace(hour=0, minute=0, second=0, microsecond=0)
    m0 = d0.replace(day=1)
    rows = await conn.fetch("SELECT key_id, count(*) FILTER (WHERE at >= $2) d, count(*) m FROM api_calls "
                            "WHERE key_id = ANY($1::text[]) AND at >= $3 AND status < 400 GROUP BY key_id", key_ids, d0, m0)
    return {r["key_id"]: (r["d"], r["m"]) for r in rows}


async def usage_month(conn) -> dict:
    """사용 현황(원칙 160) — (기관, 서비스)마다 이번 달 API 호출(성공 · 시험 키 제외) · 마지막 호출. release.usage 가 부른다."""
    m0 = dt.datetime.now(KST).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    try:
        rows = await conn.fetch("SELECT tenant_id, card_id, count(*) n, max(at) last FROM api_calls WHERE at >= $1 AND status < 400 AND NOT test "
                                "GROUP BY tenant_id, card_id", m0)
        keys = await conn.fetch("SELECT tenant_id, card_id, count(*) n FROM api_keys WHERE revoked_at IS NULL AND expires_at > now() AND NOT test "
                                "GROUP BY tenant_id, card_id")
    except Exception:  # noqa: BLE001 — 표가 없는 DB(되돌린 뒤)
        return {}
    out: dict = {}
    for r in rows:
        out[(r["tenant_id"], r["card_id"])] = {"calls": int(r["n"]), "last": r["last"], "keys": 0}
    for r in keys:
        out.setdefault((r["tenant_id"], r["card_id"]), {"calls": 0, "last": None, "keys": 0})["keys"] = int(r["n"])
    return out


def _key_view(k: dict, shared: bool, cnt: tuple | None, people: dict | None = None) -> dict:
    st, word = state_of(k, shared)
    d, m = cnt or (0, 0)
    return {"id": k["id"], "label": k["label"], "last4": k["last4"], "state": st, "state_label": word, "test": bool(k["test"]),
            "formats": [{"id": f, "label": FMT_WORD[f]} for f in FORMATS if f in (k["formats"] or [])],
            "per_min": env(int(k["per_min"]), "calls", "recorded", "1분 호출 한도"), "per_day": env(int(k["per_day"]), "calls", "recorded", "하루 호출 한도"),
            "expires_at": _iso(k["expires_at"]), "created_at": _iso(k["created_at"]),
            "created_by": (people or {}).get(k.get("created_by") or "", None),
            "revoked_at": _iso(k.get("revoked_at")), "revoke_reason": k.get("revoke_reason"),
            "last_used_at": _iso(k.get("last_used_at")),
            "today": env(int(d), "calls", "recorded", "오늘 호출(성공)"), "month": env(int(m), "calls", "recorded", "이번 달 호출(성공)")}


# ── [LX 관리자] 키 만들기 · 멈춤 · 폐기 · 끝나는 날 · 사용량 ───────────────────────
@router.get("/apikeys")
async def keys_list(request: Request):
    require(principal(request), admin=True)
    orgs, eff, svcs = await _orgs_shared()
    async with db(realm="lx") as c:
        ks = [dict(r) for r in await c.fetch("SELECT * FROM api_keys ORDER BY created_at DESC")]
        cnt = await _counts(c, [k["id"] for k in ks])
        people = {r["id"]: r["name"] for r in await c.fetch("SELECT id, name FROM lx_users")}
    pairs: dict = {}
    for tid, m in eff.items():
        for cid in m:
            pairs[(tid, cid)] = True
    for k in ks:                                   # 공유를 거둔 줄도 키가 있으면 남긴다(멈춘 키가 보이게)
        pairs.setdefault((k["tenant_id"], k["card_id"]), False)
    rows = []
    for (tid, cid), on in pairs.items():
        o = orgs.get(tid) or {"id": tid, "name": tid}
        mine = [k for k in ks if k["tenant_id"] == tid and k["card_id"] == cid]
        name = (svcs.get(cid) or {}).get("name") or ((eff.get(tid) or {}).get(cid) or {}).get("name") or cid
        rows.append({"org": {"id": tid, "name": o.get("name")}, "service": {"id": cid, "name": name}, "shared": on,
                     "keys": [_key_view(k, on, cnt.get(k["id"]), people) for k in mine],
                     "live": env(sum(1 for k in mine if state_of(k, on)[0] == "on"), "count", "recorded", "켜진 키")})
    rows.sort(key=lambda r: (not r["shared"], r["org"]["id"], r["service"]["name"]))
    total = sum(len(r["keys"]) for r in rows)
    return {"items": rows, "keys": env(total, "count", "recorded", "만든 키(폐기 · 시험 포함)"),
            "live": env(sum(r["live"]["value"] for r in rows), "count", "recorded", "지금 켜진 키"),
            "defaults": {"per_min": env(PER_MIN, "calls", "recorded", "1분 호출 한도 초기값"), "per_day": env(PER_DAY, "calls", "recorded", "하루 호출 한도 초기값"),
                         "days": env(DAYS_DEFAULT, "count", "recorded", "끝나는 날 초기값(일)")},
            "formats": [{"id": f, "label": FMT_WORD[f]} for f in FORMATS], "as_of": now_iso()}


@router.get("/apikeys/usage")
async def keys_usage(request: Request):
    """배포 → 사용 현황 표의 'API 호출' 열(원칙 160) — (기관, 서비스)마다 이번 달 성공 호출(시험 키 제외) · 켜진 키 · 마지막 호출."""
    require(principal(request), admin=True)
    async with db(realm="lx") as c:
        u = await usage_month(c)
    return {"items": [{"org": t, "service": cid, "calls": env(v["calls"], "calls", "recorded", "이번 달 API 호출(성공 · 시험 키 제외)"),
                       "keys": env(v["keys"], "count", "recorded", "켜진 키(시험 제외)"), "last": _iso(v["last"])} for (t, cid), v in u.items()],
            "as_of": now_iso()}


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


@router.post("/apikeys", status_code=201)
async def key_create(body: dict, request: Request):
    p = require(principal(request), admin=True)
    tid, cid = str(body.get("tenant_id") or ""), str(body.get("card_id") or "")
    label = re.sub(r"\s+", " ", str(body.get("label") or "")).strip()[:LABEL_MAX]
    if not label:
        raise ApiError("bad_request", "쓰는 시스템 이름을 적어 주세요(예: 남원 영농관리 시스템)")
    orgs, eff, svcs = await _orgs_shared()
    if tid not in orgs:
        raise ApiError("not_found", "없는 기관입니다")
    if cid not in (eff.get(tid) or {}):
        raise ApiError("conflict", "그 기관에 공유된 서비스에만 키를 만들 수 있습니다", None, 409)
    exp = _expires(body.get("expires_at"))
    fmts = _formats(body.get("formats"))
    per_min = _limit(body.get("per_min"), PER_MIN, 1, 600, "1분 한도")
    per_day = _limit(body.get("per_day"), PER_DAY, 1, 200000, "하루 한도")
    raw = PREFIX + secrets.token_urlsafe(32)
    kid = "key_" + secrets.token_hex(6)
    test = bool(body.get("test"))
    async with db(realm="lx") as c:
        await c.execute("INSERT INTO api_keys(id, tenant_id, card_id, label, key_hash, last4, formats, per_min, per_day, expires_at, test, created_by) "
                        "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
                        kid, tid, cid, label, key_hash(raw), raw[-4:], fmts, per_min, per_day, exp, test, p.user_id)
        await audit(c, p, "apikey.create", kid, None, {"tenant_id": tid, "card_id": cid, "label": label, "formats": fmts, "per_min": per_min,
                                                         "per_day": per_day, "expires_at": exp.isoformat(), "test": test, "last4": raw[-4:]})
        k = dict(await c.fetchrow("SELECT * FROM api_keys WHERE id=$1", kid))
    return {"key": raw, "once": "키 값은 지금 한 번만 보입니다. 기관 담당자에게 안전한 길로 전하세요.",
            "item": _key_view(k, True, None, {p.user_id: p.name}), "org": {"id": tid, "name": orgs[tid]["name"]},
            "service": {"id": cid, "name": (svcs.get(cid) or {}).get("name") or cid}, "as_of": now_iso()}


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
        sets, before, after = [], {}, {}
        if "paused" in body:
            if not isinstance(body["paused"], bool):
                raise ApiError("bad_request", "paused 는 true | false")
            sets.append(("paused", body["paused"]))
        if "expires_at" in body:
            sets.append(("expires_at", _expires(body["expires_at"])))
        if "formats" in body:
            sets.append(("formats", _formats(body["formats"])))
        if "label" in body:
            lb = re.sub(r"\s+", " ", str(body.get("label") or "")).strip()[:LABEL_MAX]
            if not lb:
                raise ApiError("bad_request", "쓰는 시스템 이름을 적어 주세요")
            sets.append(("label", lb))
        if not sets:
            raise ApiError("bad_request", "바꿀 것이 없습니다")
        for col, v in sets:
            before[col], after[col] = k[col], v
            await c.execute(f"UPDATE api_keys SET {col}=$2 WHERE id=$1", kid, v)
        await audit(c, p, "apikey.update", kid, before, after)
        k = dict(await c.fetchrow("SELECT * FROM api_keys WHERE id=$1", kid))
        cnt = await _counts(c, [kid])
    return {"item": _key_view(k, await _shared(k["tenant_id"], k["card_id"]), cnt.get(kid)), "as_of": now_iso()}


@router.post("/apikeys/{kid}/revoke")
async def key_revoke(kid: str, request: Request, body: dict | None = None):
    p = require(principal(request), admin=True)
    reason = str((body or {}).get("reason") or "").strip()[:200] or None
    async with db(realm="lx") as c:
        k = await _key_or_404(c, kid)
        if k["revoked_at"]:
            raise ApiError("conflict", "이미 폐기한 키입니다", None, 409)
        await c.execute("UPDATE api_keys SET revoked_at=now(), revoked_by=$2, revoke_reason=$3 WHERE id=$1", kid, p.user_id, reason)
        await audit(c, p, "apikey.revoke", kid, None, {"reason": reason, "tenant_id": k["tenant_id"], "card_id": k["card_id"], "test": k["test"]})
        k = dict(await c.fetchrow("SELECT * FROM api_keys WHERE id=$1", kid))
        cnt = await _counts(c, [kid])
    return {"item": _key_view(k, False, cnt.get(kid)), "as_of": now_iso()}


WHAT_WORD = {"me": "키 확인", "timepoints": "결과 시점", "results": "결과 쪽 받기", "summary": "요약", "export": "파일", "none": "없는 주소"}


def _call_view(r) -> dict:
    return {"at": _iso(r["at"]), "what": WHAT_WORD.get(r["what"] or "", r["what"] or ""), "fmt": FMT_WORD.get(r["fmt"] or ""),
            "edition": r["edition"] and env(int(r["edition"]), "count", "recorded", "결과 시점(판)"),
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


# ── [기관 관리자] 받은 API 키 — 보기만 ──────────────────────────────────────────
@router.get("/spaces/me/apikeys")
async def my_keys(request: Request):
    p = require(principal(request), realm="tenant")
    if p.role != "manager":
        raise ApiError("forbidden", "기관 관리자만 볼 수 있습니다")
    async with db(realm="lx") as c:
        ks = [dict(r) for r in await c.fetch("SELECT * FROM api_keys WHERE tenant_id=$1 AND revoked_at IS NULL ORDER BY created_at DESC", p.tenant_id)]   # 폐기한 키는 LX 쪽 기록에만
        cnt = await _counts(c, [k["id"] for k in ks])
    names = {s["card"]: s["name"] for s in await S.received(p.tenant_id)}
    shared_cache: dict = {}
    items = []
    for k in ks:
        if k["card_id"] not in shared_cache:
            shared_cache[k["card_id"]] = await _shared(p.tenant_id, k["card_id"])
        v = _key_view(k, shared_cache[k["card_id"]], cnt.get(k["id"]))
        v.pop("created_by", None)
        items.append({**v, "service": {"id": k["card_id"], "name": names.get(k["card_id"]) or "공유가 거두어진 서비스"}})
    return {"items": items, "note": "키는 LX 관리자가 만들고 관리합니다. 키 값은 만들 때 한 번만 전해 드리며 여기에는 보이지 않습니다.",
            "as_of": now_iso()}


# ── 외부 창구 ─────────────────────────────────────────────────────────────────
class Ctx:
    def __init__(self, k: dict, org: str, svc: dict):
        self.k, self.org, self.svc = k, org, svc
        self.p = Principal(realm="tenant", role="manager", tenant_id=k["tenant_id"])   # 그 기관 관리자와 같은 관할(부서 좁힘 없음 · 광역 공유 시군구는 S._only 가 자른다)
        self.edition: int | None = None


def _ip(request: Request) -> str:
    return ((request.headers.get("cf-connecting-ip") or request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
            or (request.client.host if request.client else ""))[:64]


def _err(code: str, message: str, status: int, headers: dict | None = None) -> ApiError:
    e = ApiError(code, message, None, status)
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


async def _auth(request: Request, need_fmt: str | None) -> Ctx:
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
        raise _err("unauthorized", "화면 로그인으로는 부를 수 없습니다 — LX 관리자가 만든 API 키를 쓰세요", 401)
    async with db(realm="lx") as c:
        row = await c.fetchrow("SELECT * FROM api_keys WHERE key_hash=$1", key_hash(tok))
    if not row:
        await _bad_try(ip)
        raise _err("unauthorized", "맞지 않는 API 키입니다", 401)
    k = dict(row)
    request.state.api_key = k
    if k["revoked_at"]:
        raise _err("key_revoked", "폐기된 키입니다 — LX 관리자에게 새 키를 받으세요", 401)
    if k["expires_at"] <= _now():
        raise _err("key_expired", "기간이 끝난 키입니다 — LX 관리자에게 기간 연장을 요청하세요", 401)
    if k["paused"]:
        raise _err("key_paused", "LX 관리자가 멈춘 키입니다", 403)
    from .brand import _services
    async with db(realm="lx") as c:
        b = await c.fetchrow("SELECT t.name, b.services FROM tenants t LEFT JOIN tenant_brand b ON b.tenant_id = t.id "
                             "WHERE t.id=$1 AND t.kind='user' AND t.status='active'", k["tenant_id"])
    svcs = await _services(k["tenant_id"], list(b["services"]) if b and b["services"] else None, {}) if b else []
    svc = next((s for s in svcs if s["card"] == k["card_id"]), None)
    if not svc:                                     # API-공유끔 ⓐ — 공유를 거두면 멈춤(다시 공유하면 이어짐)
        raise _err("key_paused", "이 서비스의 공유가 거두어져 키가 멈췄습니다 — 다시 공유되면 그대로 이어집니다", 403)
    if need_fmt and need_fmt not in (k["formats"] or []):
        raise _err("forbidden", f"이 키의 범위에 {FMT_WORD.get(need_fmt, need_fmt)} 형식이 없습니다", 403)
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
    async with db(realm="lx") as c:
        org = await S._tenant_name(c, k["tenant_id"])
    return Ctx(k, org or k["tenant_id"], svc)


async def _log(request: Request, what: str, fmt: str | None, status: int, code: str | None, rows: int | None, nbytes: int | None,
               edition: int | None, t0: float):
    k = getattr(request.state, "api_key", None) or {}
    try:
        async with db(realm="lx") as c:
            await c.execute("INSERT INTO api_calls(key_id, tenant_id, card_id, method, path, what, fmt, edition, rows, bytes, status, code, ip, ms, test) "
                            "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)",
                            k.get("id"), k.get("tenant_id"), k.get("card_id"), request.method, request.url.path[:200], what, fmt, edition,
                            rows, nbytes, status, code, _ip(request), int((time.perf_counter() - t0) * 1000), bool(k.get("test")))
            if k.get("id") and status < 400:
                await c.execute("UPDATE api_keys SET last_used_at=now() WHERE id=$1", k["id"])
    except Exception:  # noqa: BLE001 — 기록 실패가 응답을 막지 않는다
        pass


async def _serve(request: Request, what: str, fmt: str | None, fn):
    """키 확인 → 일 → 호출 기록. fn(ctx) → (응답, 결과 수). 스트림 응답은 다 보낸 뒤 크기를 적는다."""
    t0 = time.perf_counter()
    ctx = None
    try:
        ctx = await _auth(request, fmt if fmt in FORMATS else None)
        resp, rows = await fn(ctx)
    except ApiError as e:
        await _log(request, what, fmt, e.status, e.code, None, None, ctx.edition if ctx else None, t0)
        return RawJSON(e.body(), status_code=e.status, headers=getattr(e, "headers", None) or {})
    except Exception:
        await _log(request, what, fmt, 500, "server_error", None, None, ctx.edition if ctx else None, t0)
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
                await _log(request, what, fmt, resp.status_code, None, rows, done["n"], ctx.edition, t0)
        resp.body_iterator = counted()
        return resp
    await _log(request, what, fmt, resp.status_code, None, rows, len(resp.body or b""), ctx.edition, t0)
    return resp


def _json(o, status: int = 200) -> Response:
    return Response(json.dumps(o, ensure_ascii=False, default=str).encode(), status_code=status, media_type="application/json; charset=utf-8",
                    headers={"cache-control": "no-store"})


async def _edition(ctx: Ctx, edition) -> dict:
    """결과 시점(결과 설명서 판) — 없으면 지금 판. 받지 않은(열리지 않은) 서비스 · 없는 판 = 404."""
    _svc, cur, _rows = await S._guide_or_404(ctx.p, ctx.k["card_id"])
    if edition in (None, ""):
        g = cur
    else:
        try:
            n = int(edition)
        except (TypeError, ValueError):
            raise ApiError("bad_request", "edition 은 결과 시점 번호(숫자)입니다")
        async with db(realm="lx") as c:
            r = await c.fetchrow("SELECT * FROM space_guides WHERE tenant_id=$1 AND card_id=$2 AND edition=$3", ctx.k["tenant_id"], ctx.k["card_id"], n)
        if not r:
            raise ApiError("not_found", "없는 결과 시점입니다")
        g = dict(r)
    ctx.edition = int(g["edition"])
    return g


def _when(g: dict) -> dict:
    return {"edition": int(g["edition"]), "round": S._round_label(g["body"]), "published_at": _iso(g.get("published_at")),
            "change": g.get("change"), "past": bool(g.get("backfill"))}


def _scope_words(ctx: Ctx, only: list[str] | None) -> list[str]:
    from . import regions as R
    out = []
    for r in R.scope_regions(ctx.p):
        if only is not None and r["sgg_cd"] not in only and (r.get("prev_cd") or "") not in only:
            continue
        nm = r.get("name") or r["sgg_cd"]
        if nm not in out:
            out.append(nm)
    return out


@ext.get("/me")
async def x_me(request: Request):
    async def run(ctx: Ctx):
        k = ctx.k
        only = await S._only(ctx.p, k["card_id"])
        try:
            r = await redis()
            used_d = int(await r.get(f"apik:day:{k['id']}:{_day()}") or 0)
        except Exception:  # noqa: BLE001
            used_d = None
        ver = None
        try:
            _s, g, _r = await S._guide_or_404(ctx.p, k["card_id"])
            ver = ", ".join((g["body"].get("version") or {}).get("service") or []) or None
        except ApiError:
            g = None
        return _json({"org": ctx.org, "service": ctx.svc["name"], "service_version": ver, "label": k["label"],
                      "area": _scope_words(ctx, only), "formats": [f for f in FORMATS if f in (k["formats"] or [])],
                      "limits": {"per_min": k["per_min"], "per_day": k["per_day"], "used_today": used_d},
                      "expires_at": _iso(k["expires_at"]), "latest": _when(g) if g else None,
                      "notice": S.NOTICE, "as_of": now_iso()}), None
    return await _serve(request, "me", None, run)


@ext.get("/timepoints")
async def x_timepoints(request: Request):
    async def run(ctx: Ctx):
        _s, cur, _r = await S._guide_or_404(ctx.p, ctx.k["card_id"])
        async with db(realm="lx") as c:
            hist = await c.fetch("SELECT edition, change, published_at, backfill, created_at, sig, body FROM space_guides WHERE tenant_id=$1 AND card_id=$2 "
                                 "ORDER BY edition DESC", ctx.k["tenant_id"], ctx.k["card_id"])
        items = []
        for h in hist:
            hb = dict(h)
            tot = ((hb["body"] or {}).get("what") or {}).get("total") or {}
            items.append({**_when(hb), "current": h["sig"] == cur["sig"], "headline": {"value": tot.get("value"), "unit": tot.get("unit") or "건"}})
        return _json({"service": ctx.svc["name"], "items": items, "as_of": now_iso()}), len(items)
    return await _serve(request, "timepoints", None, run)


def _cursor(edition: int, last: int) -> str:
    return base64.urlsafe_b64encode(f"{edition}:{last}".encode()).decode().rstrip("=")


def _uncursor(c: str) -> tuple[int, int]:
    try:
        e, last = base64.urlsafe_b64decode(c + "=" * (-len(c) % 4)).decode().split(":")
        return int(e), int(last)
    except Exception:  # noqa: BLE001
        raise ApiError("bad_request", "cursor 가 맞지 않습니다 — 앞 쪽 답의 next 값을 그대로 넣어 주세요")


def _props(r, rl: str, ver: str, edition: int) -> dict:
    return {"id": r["fid"] or str(r["id"]), "kind": S.class_ko(r["cls"], r["cls_en"]), "code": r["cls_en"] or r["cls"],
            "score": round(float(r["conf"]), 3) if r["conf"] is not None else None,
            "area": round(float(r["area_m2"]), 1) if r["area_m2"] is not None else None,
            "emd": r["emd"] if r["emd"] not in S.NO_EMD else None, "parcel": r["pnu"], "check": S.CHECK_WORD.get(r["edit_state"], r["edit_state"]),
            "round": rl, "version": ver, "edition": edition}


_TOTAL: dict[tuple, tuple[float, int]] = {}


async def _total(t: str, sets: list, only, codes, keep, cond: str, args: list) -> int:
    """이 시점 · 이 관할의 결과 수(지운 것 제외) — 내려받기 GeoJSON 의 결과 수와 같은 조건 · 10분 기억."""
    key = (t, tuple(sets), tuple(only or ()), len(keep))
    hit = _TOTAL.get(key)
    if hit and time.time() - hit[0] < 600:
        return hit[1]
    if not sets:
        return 0
    c2, a2 = S._scope_sql(codes, 2)
    async with db(realm="lx") as c:
        n = int(await c.fetchval(f"SELECT count(*) FROM detections d WHERE d.job_id = ANY($1::text[]) AND d.edit_state <> 'deleted' AND {c2}",
                                 sets, *a2, *([keep] if codes is not None else [])))
    _TOTAL[key] = (time.time(), n)
    while len(_TOTAL) > 256:
        _TOTAL.pop(next(iter(_TOTAL)))
    return n


@ext.get("/results")
async def x_results(request: Request, edition: str | None = None, cursor: str | None = None, limit: int = PAGE_MAX):
    async def run(ctx: Ctx):
        after = 0
        ed = edition
        if cursor:
            ce, after = _uncursor(cursor)
            if ed not in (None, "") and str(ce) != str(ed):
                raise ApiError("bad_request", "cursor 와 edition 이 다른 시점입니다")
            ed = ce
        g = await _edition(ctx, ed)
        n = max(1, min(int(limit or PAGE_MAX), PAGE_MAX))
        body = g["body"]
        sets = body.get("sets") or []
        t = ctx.k["tenant_id"]
        only = await S._only(ctx.p, ctx.k["card_id"])
        codes = S._scope_codes(t, only)
        keep = (await S._keep_ids(t, sets) if only is None else []) if codes is not None else []
        cond, args = S._scope_sql(codes, 3)
        a = [sets, after] + args + ([keep] if codes is not None else [])
        async with db(realm="lx") as c:
            rows = await c.fetch(f"SELECT d.id, d.fid, d.cls, d.cls_en, d.conf, d.area_m2, d.emd, d.pnu, d.edit_state, ST_AsGeoJSON(d.geom, 7) AS g "
                                 f"FROM detections d WHERE d.job_id = ANY($1::text[]) AND d.edit_state <> 'deleted' AND d.id > $2 AND {cond} "
                                 f"ORDER BY d.id LIMIT {n + 1}", *a) if sets else []
        more = len(rows) > n
        rows = rows[:n]
        rl = S._round_label(body)
        ver = ", ".join((body.get("version") or {}).get("service") or [])
        feats = [{"type": "Feature", "id": (pr := _props(r, rl, ver, ctx.edition))["id"], "geometry": json.loads(r["g"]) if r["g"] else None,
                  "properties": pr} for r in rows]
        total = await _total(t, sets, only, codes, keep, cond, args)
        meta = {"org": ctx.org, "service": ctx.svc["name"], "when": _when(g), "total": total, "count": len(feats),
                "next": _cursor(ctx.edition, int(rows[-1]["id"])) if more and rows else None, "crs": "EPSG:4326", "notice": S.NOTICE}
        return _json({"type": "FeatureCollection", "lx": meta, "features": feats}), len(feats)
    return await _serve(request, "results", "geojson", run)


@ext.get("/summary")
async def x_summary(request: Request, edition: str | None = None):
    async def run(ctx: Ctx):
        g = await _edition(ctx, edition)
        files = {f["fmt"]: f for f in (g["body"].get("format") or {}).get("files") or []}
        parcels = ((files.get("parcels") or {}).get("n") or {}).get("value")
        doc = S._summary_doc(ctx.org, ctx.svc, g, parcels)
        doc["결과 시점"] = _when(g)
        return _json(doc), None
    return await _serve(request, "summary", "summary", run)


def _shp_zip(rows: list, name: str, rl: str, ver: str, edition: int) -> tuple[bytes, int]:
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
            "parcel 필지 번호 19자리(글자) · check 결과 확인(확인 전 · 고침) · round 회차 · version 서비스 버전 · edition 결과 시점",
            "좌표 — 경위도(EPSG:4326) · 글자 — UTF-8(.cpg)", S.NOTICE, ""]))
    return out.getvalue(), n


@ext.get("/exports/{fmt}")
async def x_export(fmt: str, request: Request, edition: str | None = None):
    async def run(ctx: Ctx):
        if fmt not in FORMATS:
            raise ApiError("not_found", "형식은 geojson · shp · parcels 가운데 하나입니다")
        g = await _edition(ctx, edition)
        body = g["body"]
        files = {f["fmt"]: f for f in (body.get("format") or {}).get("files") or []}
        base = S._fname(ctx.org, ctx.svc["name"], g["edition"], "x")[:-2]
        total = int(((body.get("what") or {}).get("total") or {}).get("value") or 0)
        if fmt == "geojson":
            if not files.get("geojson", {}).get("ok"):
                raise ApiError("not_found", files.get("geojson", {}).get("why") or "이 시점은 GeoJSON 으로 받을 수 없습니다")
            return StreamingResponse(S._geojson(ctx.p, ctx.org, ctx.svc, g), media_type="application/geo+json",
                                     headers={"content-disposition": S._disposition(base + ".geojson"), "cache-control": "no-store"}), total
        if fmt == "parcels":
            if not files.get("parcels", {}).get("ok"):
                raise ApiError("not_found", files.get("parcels", {}).get("why") or "이 서비스 결과는 필지와 잇지 않습니다")
            sets = body.get("sets") or []
            rows, how = await S._parcel_rows(ctx.k["tenant_id"], sets, await S._parcel_src(ctx.k["tenant_id"], sets), await S._only(ctx.p, ctx.k["card_id"]))
            if not rows:
                raise ApiError("not_found", "이 서비스 결과는 필지와 잇지 않습니다")
            data = await run_in_threadpool(S._xlsx, ctx.org, ctx.svc, g, rows, how)
            return Response(data, media_type=S.FMT["parcels"][3], headers={"content-disposition": S._disposition(base + ".xlsx"), "cache-control": "no-store"}), len(rows)
        if not files.get("geojson", {}).get("ok"):          # SHP = GeoJSON 과 같은 결과 · 같은 자르기
            raise ApiError("not_found", files.get("geojson", {}).get("why") or "이 시점은 SHP 로 받을 수 없습니다")
        rows = [r async for r in S._feature_rows(ctx.k["tenant_id"], body.get("sets") or [], await S._only(ctx.p, ctx.k["card_id"]))]
        rl = S._round_label(body)
        ver = ", ".join((body.get("version") or {}).get("service") or [])
        stem = re.sub(r"[^0-9A-Za-z가-힣_]+", "_", base)[:60] or "landxi"
        data, n = await run_in_threadpool(_shp_zip, rows, stem, rl, ver, int(g["edition"]))
        return Response(data, media_type="application/zip", headers={"content-disposition": S._disposition(base + "_shp.zip"), "cache-control": "no-store"}), n
    return await _serve(request, "export", fmt if fmt in FORMATS else None, run)


@ext.api_route("/{rest:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def x_none(rest: str, request: Request):
    """1차에 없는 길(분석 맡기기 · 영상 올리기 포함 — 원칙 179) — 404 · 기록."""
    async def run(ctx: Ctx):
        raise ApiError("not_found", "없는 주소입니다")
    return await _serve(request, "none", None, run)
