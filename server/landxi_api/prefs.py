"""개인별 맞춤(10-17 원칙 280 · 283) — 사용자 설정 · 내 일정 · 플랫폼 날짜 일(달력 칸).

  GET    /me/prefs                      내 설정 전부 {options: {screen: 값}, updated_at: {screen: 시각}}
  GET    /me/prefs/{screen}             한 화면(열쇠)의 설정 {screen, options: 값|null, updated_at|null}
  PUT    /me/prefs/{screen}             저장(JSON 그대로 · 32KB) → {screen, options: 값, updated_at}   (POST 도 같다)
      응답의 값 칸 이름은 options — 봉투 검사(envelope.py STRUCT_SUBTREES)가 통째로 데이터로 보는 칸(화면이 정한 JSON 이라 숫자 봉투를 강제하지 않는다).
  DELETE /me/prefs/{screen}             지우기(처음 모양으로) → {ok}                                  (POST /me/prefs/{screen}/reset 도 같다)
      열쇠 = 화면 이름 또는 화면.부분(예: dash.lx-console 대시보드 칸 배치 · lx-map.stats XI맵 통계 판 자리). 80자 · [A-Za-z0-9._-]
      계정 = (realm, tenant_id, user_id) — 로그인한 계정만 자기 것(LX · 기관 모두). 값은 화면이 정한다(서버는 보관만).
  GET    /me/events?from=YYYY-MM-DD&to=  내 일정(직접 적은 것) · 기간 120일까지
  POST   /me/events                     {title, day, time?, note?} → {item}
  PUT    /me/events/{id}                {title?, day?, time?, note?} → {item}
  DELETE /me/events/{id}                → {ok}                                                       (POST /me/events/{id}/remove 도 같다)
  GET    /me/agenda?from=&to=           (LX 계정) 플랫폼에 이미 있는 날짜 일 — 공지 날짜 · 내가 올린 승인 요청과 그 결정 · 내 담당 분석 요청 · 내 프로젝트 시작 ·
                                        내 프로젝트의 학습 시작 · 끝 · 전국 분석(날마다 끝난 읍면동 수). 기록에 있는 것만(지어낸 일정 0).
화면에 내는 값은 이름 · 날짜 · 시각만(작업 id · 경로 · 내부 지표 0 — id 는 그 화면으로 가는 열쇠).
"""
from __future__ import annotations

import datetime as dt
import json
import re
import secrets

from typing import Any

from fastapi import APIRouter, Body, Request

from .deps import ApiError, Principal, db, principal, require
from .envelope import KST, now_iso

router = APIRouter()

SCREEN_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$")
VALUE_MAX = 32 * 1024
TITLE_MAX, NOTE_MAX = 80, 300
RANGE_MAX_DAYS = 120
TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


def _who(request: Request) -> Principal:
    p = require(principal(request))
    if not p.user_id or p.realm not in ("lx", "tenant"):
        raise ApiError("forbidden", "로그인한 계정에서 봅니다")
    return p


def _key(p: Principal) -> tuple[str, str, str]:
    return (p.realm, p.tenant_id or "", p.user_id)


def _iso(t):
    return t.isoformat(timespec="seconds") if t else None


def _screen(s: str) -> str:
    if not SCREEN_RE.match(s or ""):
        raise ApiError("bad_request", "설정 이름은 영문 · 숫자 · . _ - 80자까지입니다")
    return s


def _jv(v):
    if isinstance(v, str):
        try:
            return json.loads(v)
        except ValueError:
            return None
    return v


# ── 사용자 설정(화면 · 열쇠별 JSON) ───────────────────────────────────────────
@router.get("/me/prefs")
async def my_prefs(request: Request):
    p = _who(request)
    r, t, u = _key(p)
    async with db(realm="lx") as conn:
        rows = await conn.fetch("SELECT screen, value, updated_at FROM user_prefs WHERE realm=$1 AND tenant_id=$2 AND user_id=$3 ORDER BY screen", r, t, u)
    return {"options": {x["screen"]: _jv(x["value"]) for x in rows}, "updated_at": {x["screen"]: _iso(x["updated_at"]) for x in rows}, "as_of": now_iso()}


@router.get("/me/prefs/{screen}")
async def my_pref(screen: str, request: Request):
    p = _who(request)
    r, t, u = _key(p)
    async with db(realm="lx") as conn:
        row = await conn.fetchrow("SELECT value, updated_at FROM user_prefs WHERE realm=$1 AND tenant_id=$2 AND user_id=$3 AND screen=$4", r, t, u, _screen(screen))
    return {"screen": screen, "options": _jv(row["value"]) if row else None, "updated_at": _iso(row["updated_at"]) if row else None, "as_of": now_iso()}


async def _put(screen: str, body, request: Request):
    p = _who(request)
    r, t, u = _key(p)
    if body is None:
        raise ApiError("bad_request", "저장할 값이 없습니다")
    s = json.dumps(body, ensure_ascii=False)
    if len(s.encode("utf-8")) > VALUE_MAX:
        raise ApiError("bad_request", "설정이 너무 큽니다(32KB까지)")
    async with db(realm="lx") as conn:
        row = await conn.fetchrow(
            "INSERT INTO user_prefs(realm, tenant_id, user_id, screen, value) VALUES ($1,$2,$3,$4,$5::jsonb) "
            "ON CONFLICT (realm, tenant_id, user_id, screen) DO UPDATE SET value=EXCLUDED.value, updated_at=now() RETURNING value, updated_at",
            r, t, u, _screen(screen), s)
    return {"screen": screen, "options": _jv(row["value"]), "updated_at": _iso(row["updated_at"]), "as_of": now_iso()}


@router.put("/me/prefs/{screen}")
async def put_pref(screen: str, request: Request, body: Any = Body(...)):
    return await _put(screen, body, request)


@router.post("/me/prefs/{screen}")
async def post_pref(screen: str, request: Request, body: Any = Body(...)):
    return await _put(screen, body, request)


async def _reset(screen: str, request: Request):
    p = _who(request)
    r, t, u = _key(p)
    async with db(realm="lx") as conn:
        await conn.execute("DELETE FROM user_prefs WHERE realm=$1 AND tenant_id=$2 AND user_id=$3 AND screen=$4", r, t, u, _screen(screen))
    return {"ok": True, "screen": screen, "as_of": now_iso()}


@router.delete("/me/prefs/{screen}")
async def delete_pref(screen: str, request: Request):
    return await _reset(screen, request)


@router.post("/me/prefs/{screen}/reset")
async def reset_pref(screen: str, request: Request):
    return await _reset(screen, request)


# ── 내 일정(직접 적는 것) ───────────────────────────────────────────────────────
def _day(s, field="day") -> dt.date:
    try:
        return dt.date.fromisoformat(str(s or "")[:10])
    except ValueError:
        raise ApiError("bad_request", "날짜는 YYYY-MM-DD 로 적어 주세요", {"field": field})


def _range(frm: str | None, to: str | None) -> tuple[dt.date, dt.date]:
    today = dt.datetime.now(KST).date()
    a = _day(frm, "from") if frm else today.replace(day=1) - dt.timedelta(days=7)
    b = _day(to, "to") if to else a + dt.timedelta(days=45)
    if b < a:
        a, b = b, a
    if (b - a).days > RANGE_MAX_DAYS:
        b = a + dt.timedelta(days=RANGE_MAX_DAYS)
    return a, b


def _event(r) -> dict:
    return {"id": r["id"], "title": r["title"], "day": r["day"].isoformat(), "time": r["at_time"], "note": r["note"],
            "kind": "mine", "updated_at": _iso(r["updated_at"])}


def _clean_event(body: dict, *, partial: bool) -> dict:
    out: dict = {}
    if "title" in body or not partial:
        title = " ".join(str(body.get("title") or "").split())
        if not title:
            raise ApiError("bad_request", "일정 이름을 적어 주세요", {"field": "title"})
        if len(title) > TITLE_MAX:
            raise ApiError("bad_request", f"일정 이름은 {TITLE_MAX}자까지입니다", {"field": "title"})
        out["title"] = title
    if "day" in body or not partial:
        out["day"] = _day(body.get("day"))
    if "time" in body:
        tm = str(body.get("time") or "").strip() or None
        if tm and not TIME_RE.match(tm):
            raise ApiError("bad_request", "시각은 HH:MM 으로 적어 주세요", {"field": "time"})
        out["at_time"] = tm
    if "note" in body:
        note = str(body.get("note") or "").strip() or None
        if note and len(note) > NOTE_MAX:
            raise ApiError("bad_request", f"메모는 {NOTE_MAX}자까지입니다", {"field": "note"})
        out["note"] = note
    return out


@router.get("/me/events")
async def my_events(request: Request):
    p = _who(request)
    r, t, u = _key(p)
    a, b = _range(request.query_params.get("from"), request.query_params.get("to"))
    async with db(realm="lx") as conn:
        rows = await conn.fetch("SELECT * FROM user_events WHERE realm=$1 AND tenant_id=$2 AND user_id=$3 AND day BETWEEN $4 AND $5 "
                                "ORDER BY day, at_time NULLS LAST, created_at", r, t, u, a, b)
    return {"items": [_event(x) for x in rows], "from": a.isoformat(), "to": b.isoformat(), "as_of": now_iso()}


@router.post("/me/events", status_code=201)
async def post_event(body: dict, request: Request):
    p = _who(request)
    r, t, u = _key(p)
    v = _clean_event(body or {}, partial=False)
    async with db(realm="lx") as conn:
        n = await conn.fetchval("SELECT count(*) FROM user_events WHERE realm=$1 AND tenant_id=$2 AND user_id=$3", r, t, u)
        if int(n or 0) >= 2000:
            raise ApiError("bad_request", "일정은 2,000개까지입니다 — 지난 일정을 지워 주세요")
        row = await conn.fetchrow("INSERT INTO user_events(id, realm, tenant_id, user_id, title, day, at_time, note) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
                                  "ev_" + secrets.token_hex(5), r, t, u, v["title"], v["day"], v.get("at_time"), v.get("note"))
    return {"item": _event(row), "as_of": now_iso()}


@router.put("/me/events/{eid}")
async def put_event(eid: str, body: dict, request: Request):
    p = _who(request)
    r, t, u = _key(p)
    v = _clean_event(body or {}, partial=True)
    if not v:
        raise ApiError("bad_request", "바꿀 것이 없습니다")
    sets = ", ".join(f"{k}=${i + 5}" for i, k in enumerate(v))
    async with db(realm="lx") as conn:
        row = await conn.fetchrow(f"UPDATE user_events SET {sets}, updated_at=now() WHERE id=$1 AND realm=$2 AND tenant_id=$3 AND user_id=$4 RETURNING *",
                                  eid, r, t, u, *v.values())
    if not row:
        raise ApiError("not_found", "일정이 없습니다")
    return {"item": _event(row), "as_of": now_iso()}


async def _remove(eid: str, request: Request):
    p = _who(request)
    r, t, u = _key(p)
    async with db(realm="lx") as conn:
        ok = await conn.fetchval("DELETE FROM user_events WHERE id=$1 AND realm=$2 AND tenant_id=$3 AND user_id=$4 RETURNING id", eid, r, t, u)
    if not ok:
        raise ApiError("not_found", "일정이 없습니다")
    return {"ok": True, "as_of": now_iso()}


@router.delete("/me/events/{eid}")
async def delete_event(eid: str, request: Request):
    return await _remove(eid, request)


@router.post("/me/events/{eid}/remove")
async def remove_event(eid: str, request: Request):
    return await _remove(eid, request)


# ── 플랫폼 날짜 일(LX 계정 · 기록에 있는 것만) ─────────────────────────────────────
V3 = "/landxi/v3/"
DECISION_KO = {"approve": "승인", "approved": "승인", "ga": "승인", "reject": "거절", "rejected": "거절"}


def _k(t: dt.datetime | None) -> tuple[str, str] | None:
    if not t:
        return None
    x = t.astimezone(KST)
    return x.date().isoformat(), x.strftime("%H:%M")


def _short_org(name) -> str:
    ko = ((_jv(name) or {}).get("ko") or "").strip() if name else ""
    parts = ko.split()
    return parts[-1] if parts else ko


async def _try(conn, out: list, fn):
    """표 하나가 없거나 질문이 실패해도 나머지 일은 낸다(그 묶음만 비움)."""
    tr = conn.transaction()
    await tr.start()
    try:
        await fn(out)
        await tr.commit()
    except Exception:  # noqa: BLE001
        await tr.rollback()


@router.get("/me/agenda")
async def my_agenda(request: Request):
    p = _who(request)
    if p.realm != "lx":
        raise ApiError("forbidden", "LX 계정에서 봅니다")
    a, b = _range(request.query_params.get("from"), request.query_params.get("to"))
    ta = dt.datetime.combine(a, dt.time.min, KST)
    tb = dt.datetime.combine(b + dt.timedelta(days=1), dt.time.min, KST)
    me = p.user_id
    items: list[dict] = []

    def put(kind, t, title, href=None, key=None):
        k = _k(t)
        if k and a.isoformat() <= k[0] <= b.isoformat():
            items.append({"id": f"{kind}:{key or secrets.token_hex(3)}", "kind": kind, "day": k[0], "time": k[1], "title": title, "href": href})

    async with db(realm="lx") as conn:
        async def notices(_):
            for r in await conn.fetch("SELECT id, title, at FROM lx_announcements WHERE removed_at IS NULL AND at >= $1 AND at < $2 ORDER BY at", ta, tb):
                put("notice", r["at"], f"공지 · {r['title']}", None, r["id"])

        async def approvals(_):
            from .approvals import KIND_LABEL
            rows = await conn.fetch("SELECT id, subject_type, decision, state, at, decided_at FROM approvals WHERE requested_by=$1 "
                                    "AND ((at >= $2 AND at < $3) OR (decided_at >= $2 AND decided_at < $3)) ORDER BY at", me, ta, tb)
            for r in rows:
                lab = KIND_LABEL.get(r["subject_type"], r["subject_type"])
                put("approval", r["at"], f"승인 요청 · {lab}", V3 + "lx-inbox/#approvals", r["id"] + ".a")
                if r["decided_at"]:
                    put("approval", r["decided_at"], f"{DECISION_KO.get(str(r['decision'] or ''), '처리')} · {lab}", V3 + "lx-inbox/#approvals", r["id"] + ".d")

        async def requests(_):
            w = "" if p.is_admin else " AND q.lead_user=$4"
            args = [ta, tb, me] if not p.is_admin else [ta, tb]
            sql = ("SELECT q.id, q.created_at, q.decided_at, q.state, q.meta->>'service' AS svc, t.name AS tname FROM analysis_requests q "
                   "LEFT JOIN tenants t ON t.id=q.tenant_id WHERE ((q.created_at >= $1 AND q.created_at < $2) OR (q.decided_at >= $1 AND q.decided_at < $2))"
                   + ("" if p.is_admin else " AND q.lead_user=$3") + " ORDER BY q.created_at")
            for r in await conn.fetch(sql, *args):
                who = " · ".join(x for x in (_short_org(r["tname"]), r["svc"]) if x)
                put("request", r["created_at"], f"분석 요청 · {who}", V3 + "lx-inbox/#requests", r["id"] + ".c")
                if r["decided_at"]:
                    put("request", r["decided_at"], f"분석 요청 처리 · {who}", V3 + "lx-inbox/#requests", r["id"] + ".d")

        async def projects(_):
            rows = await conn.fetch("SELECT p.id, p.name, p.created_at FROM projects p WHERE p.state<>'deleted' AND (p.lead_id=$1 OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id=p.id AND m.user_id=$1)) "
                                    "AND p.created_at >= $2 AND p.created_at < $3 ORDER BY p.created_at", me, ta, tb)
            for r in rows:
                put("project", r["created_at"], f"프로젝트 시작 · {r['name']}", V3 + "lx-project/?project=" + r["id"], r["id"])

        async def trains(_):
            rows = await conn.fetch(
                "SELECT j.id, j.state, j.created_at, j.finished_at, p.id AS pid, p.name FROM jobs j JOIN projects p ON p.id = j.options->>'project_id' "
                "WHERE j.kind='train' AND NOT coalesce(j.test,false) AND coalesce(j.options->>'eval','') NOT IN ('true','1') AND p.state<>'deleted' "
                "AND (p.lead_id=$1 OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id=p.id AND m.user_id=$1)) "
                "AND ((j.created_at >= $2 AND j.created_at < $3) OR (j.finished_at >= $2 AND j.finished_at < $3)) ORDER BY j.created_at", me, ta, tb)
            for r in rows:
                href = V3 + "lx-project/?project=" + r["pid"]
                put("train", r["created_at"], f"학습 시작 · {r['name']}", href, r["id"] + ".s")
                if r["finished_at"] and r["state"] == "done":
                    put("train", r["finished_at"], f"학습 끝 · {r['name']}", href, r["id"] + ".e")

        async def national(_):
            from .national import ASSETS
            rows = await conn.fetch("SELECT (done_at AT TIME ZONE 'Asia/Seoul')::date AS d, asset, year, count(*) AS n FROM national_cells "
                                    "WHERE NOT test AND state='done' AND done_at >= $1 AND done_at < $2 GROUP BY 1, 2, 3 ORDER BY 1", ta, tb)
            for r in rows:                     # 해마다 따로 한 줄(연도가 다른 숫자를 더하지 않음 · 10-22 P6)
                items.append({"id": f"national:{r['asset']}:{r['year']}:{r['d'].isoformat()}", "kind": "national", "day": r["d"].isoformat(), "time": None,
                              "title": f"전국 분석 {r['year']}년 영상 · {ASSETS.get(r['asset'], r['asset'])} {int(r['n']):,}개 읍면동", "href": V3 + "xi-clean/"})

        for fn in (notices, approvals, requests, projects, trains, national):
            await _try(conn, items, fn)

    items.sort(key=lambda x: (x["day"], x["time"] or "99:99", x["title"]))
    return {"items": items, "from": a.isoformat(), "to": b.isoformat(), "as_of": now_iso(), "source": "플랫폼 기록(공지 · 승인 · 분석 요청 · 프로젝트 · 학습 · 전국 분석)"}
