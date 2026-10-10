"""기관 서비스 이력 · 통계(구현 5차 2묶음 · 확인 대장 18차 N-1 ⓐ 묶음 · 기관-9 ⓑ · 시안 design-r9/gov-2 '이력' · '통계·보고서' 탭 · 원칙 117).

  GET /api/v1/history?card=     기관 세션 — 그 서비스에서 일어난 일 한 줄기(시간순): 결과 공개 · AI 분석 · 확인 기록(필지 메모 · 다음 확인 날짜) ·
                                검토 요청 · 분석 요청 · 촬영 요청 · 내려받기. 새로 적는 칸 0 — 서버에 이미 쌓이는 기록을 사람 말로 한 줄씩.
  GET /api/v1/history/stats?card=&period=all|year|month   통계 — 의심 필지 · 현장 확인 필요 · 확인 끝 · 오탐 · 현장 확인 예정 · 읍면별 표 · 월별 확인 기록
부서 사용자는 정해 준 서비스만(원칙 38 — 공간 배정과 같은 기록). 관할 밖 0(원칙 39 — RLS 그대로 · 기관 세션 연결).
숫자는 봉투로만 · 큰 숫자 자리엔 업무 결과만(사용자 규칙 2 · 3). 실태조사(필지 대조)가 없는 서비스는 확인 기록 · 통계 칸이 비어 있다(지어내지 않는다).
"""
from __future__ import annotations

import datetime as dt
import re
import secrets

from fastapi import APIRouter, Request

from . import summary
from .deps import ApiError, Principal, audit, db, principal, require
from .envelope import KST, env, now_iso

router = APIRouter()
CARD_RE = re.compile(r"^card-[a-z0-9-]{2,40}$")
KIND_KO = {"publish": "결과 공개", "analysis": "AI 분석", "check": "확인 기록", "review": "검토 요청", "request": "분석 요청",
           "shoot": "촬영 요청", "download": "내려받기"}
ORDER = list(KIND_KO)
RULES = ["R1", "R2", "R3", "R4", "R5", "R6"]
FMT_KO = {"geojson": "지도 파일", "parcels": "필지 엑셀", "summary": "요약"}


def _iso(v):
    if v is None:
        return None
    if isinstance(v, dt.datetime):
        return v.astimezone(KST).isoformat(timespec="seconds")
    return str(v)


def _short(addr: str | None) -> str:
    """'전북특별자치도 남원시 운봉읍 권포리 1229-3' → '운봉읍 권포리 1229-3'(읍면동부터)."""
    w = str(addr or "").split()
    for i, x in enumerate(w):
        if re.search(r"[읍면동가]$", x) and i > 0:
            return " ".join(w[i:])
    return " ".join(w[-3:]) if len(w) > 3 else " ".join(w)


def _check_word(e) -> str:
    """서버 상태 기록 → 사람 말(시안 §4 짝)."""
    v, to = (e["verdict"] or e["verdict_code"] or ""), e["to_state"]
    if e["from_state"] == to:                                     # 메모 · 다음 확인 날짜만 적은 기록(기관-9 ⓑ — 상태 그대로)
        return f"다음 확인 {e['planned_for'].month}.{e['planned_for'].day:02d}" if e["planned_for"] else "메모"
    if to == "dismissed" or v in ("match_fp", "fp"):
        return "아님"
    if to == "closed" and v in ("violation", "match", "confirmed"):
        return "맞음"
    if to == "closed":
        return "확인 끝"
    if to == "inspected":
        return "확인함"                                            # 원칙 135 — 화면 말에 현장 확인 없음(10-10 확인 8 ⓐ)
    if to in ("assigned", "hold") or e["planned_for"]:
        return "확인 예정" + (f" {e['planned_for'].month}.{e['planned_for'].day:02d}" if e["planned_for"] else "")
    if to == "open":
        return "다시 확인 전으로"
    return "기록"


async def _gate(request: Request, card: str) -> Principal:
    p = require(principal(request), realm="tenant")
    if not CARD_RE.match(card or ""):
        raise ApiError("not_found", "없는 서비스입니다")
    async with db(realm="lx") as c:
        ok = await c.fetchval("SELECT 1 FROM deploys WHERE tenant_id=$1 AND card_id=$2 AND NOT coalesce(test,false)", p.tenant_id, card)
        if not ok:
            raise ApiError("not_found", "없는 서비스입니다")
        if p.role != "manager":                                  # 부서 사용자 = 정해 준 서비스만(원칙 38)
            mine = await c.fetchval("SELECT 1 FROM space_assign WHERE tenant_id=$1 AND user_id=$2 AND card_id=$3", p.tenant_id, p.user_id, card)
            if not mine:
                raise ApiError("not_found", "없는 서비스입니다")
    return p


async def survey_sggs(tenant: str, card: str) -> list[str]:
    """그 서비스가 필지 대조(실태조사)를 하는 시군구 — 대표 수치 요약에 현장 확인 필요 값이 있는 곳(카드와 같은 판정)."""
    items, _ = await summary.cached_all()
    out = []
    for it in items:
        if it["tenant"] == tenant and it["card"] == card and it.get("sgg_cd"):
            fc = ((it.get("metrics") or {}).get("field_check") or {})
            if fc.get("value") is not None or it.get("survey_state"):
                out.append(str(it["sgg_cd"]))
    return sorted(set(out))


async def card_scope(card: str, sggs: list[str], k: int) -> tuple[str, list]:
    """그 서비스의 필지 대조 행만 고르는 조건(별칭 f · 인자 $k 부터 셋) — 카드 판(survey_card)이 있는 시군구는 그 카드 행,
    없는 시군구(규칙을 고르지 않은 카드 · 시군구 실태조사로 잇는 곳)는 시군구 실태조사 행(card_id 없음). 모델-표기 ⓐ · 카드마다 따로."""
    async with db(realm="lx") as c:
        own = {r["sgg_cd"] for r in await c.fetch("SELECT sgg_cd FROM survey_card WHERE card_id=$1 AND sgg_cd = ANY($2::text[])", card, sggs)}
    return (f"((f.card_id = ${k} AND f.sgg_cd = ANY(${k + 1}::text[])) OR (f.card_id IS NULL AND f.sgg_cd = ANY(${k + 2}::text[])))",
            [card, sorted(own), sorted(set(sggs) - own)])


@router.get("/history")
async def history(request: Request, card: str, limit: int = 200):
    p = await _gate(request, card)
    limit = max(1, min(int(limit or 200), 500))
    sggs = await survey_sggs(p.tenant_id, card)
    items: list[dict] = []
    async with db(realm="lx") as c:
        users = {r["id"]: r for r in await c.fetch("SELECT id, name, dept FROM tenant_users WHERE tenant_id=$1", p.tenant_id)}
        who = lambda uid: " ".join(x for x in ((users.get(uid) or {}).get("name") or "", ((users.get(uid) or {}).get("dept") or "")) if x) if uid in users else ""  # noqa: E731
        # 결과 공개 · AI 분석 — 결과 설명서 판(LX 가 새 판 · 회차를 열 때)
        for g in await c.fetch("SELECT edition, change, published_at, created_at, backfill, body FROM space_guides WHERE tenant_id=$1 AND card_id=$2 ORDER BY edition", p.tenant_id, card):
            if g["published_at"] or not g["backfill"]:            # 공개한 날을 모르는 지난 판(처음 채운 것)은 날짜를 지어내지 않고 줄을 만들지 않는다
                items.append({"kind": "publish", "at": _iso(g["published_at"] or g["created_at"]), "title": f"{g['edition']}판",
                              "sub": g["change"] or "", "who": "LX"})
            body = g["body"] or {}
            for rd in ((body.get("when") or {}).get("rounds") or []):
                if rd.get("analyzed") and not any(x["kind"] == "analysis" and x.get("_key") == (rd.get("shot"), rd.get("analyzed")) for x in items):
                    tot = (body.get("what") or {}).get("total") or {}
                    n = tot.get("value") if isinstance(tot, dict) else None
                    unit = (tot.get("unit") if isinstance(tot, dict) else None) or "건"
                    items.append({"kind": "analysis", "at": str(rd["analyzed"])[:10] + "T00:00:00+09:00", "_key": (rd.get("shot"), rd.get("analyzed")),
                                  "title": f"{rd.get('shot') or '영상'} 분석 끝", "sub": f"{n:,}{unit if unit != 'count' else '건'}" if isinstance(n, (int, float)) else "", "who": "LX"})
        # 확인 기록 — 필지 상태 기록(메모 · 다음 확인 날짜) · 필지 대조가 있는 서비스만
        if sggs:
            sw, sa = await card_scope(card, sggs, 3)
            rows = await c.fetch(
                "SELECT e.at, e.from_state, e.to_state, e.verdict, e.verdict_code, e.note, e.reason, e.planned_for, e.assignee, e.by, f.addr, f.pnu "
                "FROM survey_finding_events e JOIN survey_findings f ON f.id = e.finding_id "
                f"WHERE e.tenant_id=$1 AND {sw} AND NOT coalesce(e.demo,false) ORDER BY e.at DESC LIMIT $2", p.tenant_id, limit, *sa)
            for e in rows:
                memo = (e["note"] or e["reason"] or "").strip()
                nxt = f"다음 확인 {e['planned_for'].month}.{e['planned_for'].day:02d}" if e["planned_for"] and e["to_state"] != "assigned" and e["from_state"] != e["to_state"] else ""
                items.append({"kind": "check", "at": _iso(e["at"]), "title": f"{_short(e['addr'])} — {_check_word(e)}",
                              "sub": " · ".join(x for x in (nxt, f"메모 '{memo}'" if memo else "") if x), "who": (e["assignee"] or who(e["by"]) or "").strip(),
                              "pnu": e["pnu"]})
        # 검토 요청
        for f in await c.fetch("SELECT f.id, f.at, f.status, f.sender_id, f.ctx, (SELECT body FROM review_messages m WHERE m.request_id=f.id ORDER BY at LIMIT 1) AS first "
                               "FROM feedback f WHERE f.kind='review' AND f.tenant_id=$1 AND f.card_id=$2 ORDER BY f.at DESC LIMIT $3", p.tenant_id, card, limit):
            ctx = f["ctx"] or {}
            items.append({"kind": "review", "at": _iso(f["at"]), "title": f"{ctx.get('where') or '필지'}" + (f" — \"{f['first']}\"" if f["first"] else ""),
                          "sub": {"answered": "LX 답 도착", "seen": "LX 확인 중"}.get(f["status"] or "", "보냄"), "who": who(f["sender_id"]), "id": f["id"]})
        # 분석 요청
        for q in await c.fetch("SELECT q.id, q.created_at, q.state, q.requested_by, q.meta FROM analysis_requests q JOIN deploys d ON d.id=q.deploy_id "
                               "WHERE q.tenant_id=$1 AND d.card_id=$2 ORDER BY q.created_at DESC LIMIT $3", p.tenant_id, card, limit):
            m = q["meta"] or {}
            word = {"pending": "LX 확인 중", "approved": "분석 준비", "analyzing": "분석 중", "done": "결과 도착", "rejected": "거절", "failed": "분석하지 못함"}.get(q["state"], q["state"])
            items.append({"kind": "request", "at": _iso(q["created_at"]), "title": f"{m.get('label') or '영상'} 분석 요청", "sub": word, "who": who(q["requested_by"]), "id": q["id"]})
        # 촬영 요청(찍은 뒤 이 서비스로 분석하려는 것)
        try:
            for s in await c.fetch("SELECT id, created_at, state, requested_by, place, area_km2 FROM shoot_requests WHERE tenant_id=$1 AND card_id=$2 ORDER BY created_at DESC LIMIT $3",
                                   p.tenant_id, card, limit):
                word = {"sent": "LX 확인 중", "answered": "답 도착", "accepted": "진행", "cancelled": "취소", "rejected": "거절"}.get(s["state"], s["state"])
                items.append({"kind": "shoot", "at": _iso(s["created_at"]), "title": f"{s['place'] or '범위'} {float(s['area_km2']):.1f}㎢ 촬영 요청", "sub": word,
                              "who": who(s["requested_by"]), "id": s["id"]})
        except Exception:  # noqa: BLE001 — 촬영 요청 표가 아직 없는 서버
            pass
        # 내려받기
        for d in await c.fetch("SELECT at, actor, detail FROM space_log WHERE tenant_id=$1 AND card_id=$2 AND kind='download' ORDER BY at DESC LIMIT $3", p.tenant_id, card, limit):
            det = d["detail"] or {}
            items.append({"kind": "download", "at": _iso(d["at"]), "title": f"{FMT_KO.get(det.get('fmt'), '자료')} 내려받음", "sub": "", "who": who(d["actor"])})
    items.sort(key=lambda x: str(x["at"] or ""), reverse=True)
    for x in items:
        x.pop("_key", None)
        x["kind_ko"] = KIND_KO[x["kind"]]
    items = items[:limit]
    counts = {k: env(sum(1 for x in items if x["kind"] == k), "count", "recorded", f"이력 — {KIND_KO[k]}") for k in ORDER}
    return {"card": card, "items": items, "counts": counts, "total": env(len(items), "count", "recorded", "이 서비스 이력"),
            "survey": bool(sggs), "as_of": now_iso()}


@router.post("/survey/findings/{fid}/note")
async def finding_note(fid: str, body: dict, request: Request):
    """필지 메모 한 줄 + 다음 확인 날짜(확인 대장 18차 기관-9 ⓑ — 판정 버튼 없이). 상태는 그대로 두고 기록 한 줄만 남긴다:
    survey_finding_events(from = to = 지금 상태 · note · planned_for) + survey_findings.note · planned_for. 이력 탭 '확인 기록'에 쌓인다.
    쓰기 = 기관 담당자(manager)만(상태 쓰기와 같은 규칙) · 기관 세션 연결(RLS — 관할 밖 0). 날짜를 비우면 다음 확인 날짜를 지운다."""
    p = require(principal(request), realm="tenant")
    if p.role != "manager":
        raise ApiError("forbidden", "기관 관리자만 메모를 적을 수 있습니다")
    note = " ".join(re.sub(r"[\x00-\x1f\x7f<>]", "", str(body.get("note") or "")).split())[:200] or None
    raw = str(body.get("planned_for") or "").strip()
    pdate = None
    if raw:
        try:
            pdate = dt.date.fromisoformat(raw[:10])
        except ValueError:
            raise ApiError("bad_request", "다음 확인 날짜를 다시 골라 주세요", {"field": "planned_for"}) from None
        today = dt.datetime.now(KST).date()
        if pdate < today or pdate > today + dt.timedelta(days=730):
            raise ApiError("bad_request", "다음 확인 날짜는 오늘부터 2년 안으로 골라 주세요", {"field": "planned_for"})
    if not note and not pdate and not body.get("clear_date"):
        raise ApiError("bad_request", "메모나 다음 확인 날짜를 적어 주세요")
    now = dt.datetime.now(KST)
    async with db(p) as conn:
        r = await conn.fetchrow("SELECT id, tenant_id, state, planned_for, note FROM survey_findings WHERE id=$1 FOR UPDATE", fid)
        if not r:
            raise ApiError("not_found", "필지 기록이 없습니다")
        clear = bool(body.get("clear_date")) and not pdate
        await conn.execute("UPDATE survey_findings SET note=COALESCE($2, note), planned_for=CASE WHEN $4 THEN NULL ELSE COALESCE($3, planned_for) END, "
                           "updated_at=$5, updated_by=$6 WHERE id=$1", fid, note, pdate, clear, now, p.user_id)
        await conn.execute("INSERT INTO survey_finding_events(tenant_id, finding_id, from_state, to_state, by, realm, planned_for, demo, at, client_id, note) "
                           "VALUES ($1,$2,$3,$3,$4,'tenant',$5,false,$6,$7,$8)", r["tenant_id"], fid, r["state"], p.user_id, pdate, now,
                           "note_" + secrets.token_hex(8), note)
        await audit(conn, p, "finding.note", fid, {"planned_for": r["planned_for"].isoformat() if r["planned_for"] else None},
                    {"planned_for": pdate.isoformat() if pdate else None, "note": bool(note)})
        r2 = await conn.fetchrow("SELECT note, planned_for FROM survey_findings WHERE id=$1", fid)
    return {"id": fid, "note": r2["note"], "planned_for": r2["planned_for"].isoformat() if r2["planned_for"] else None,
            "at": now.isoformat(timespec="seconds")}


@router.get("/survey/findings/{fid}/notes")
async def finding_notes(fid: str, request: Request, limit: int = 5):
    """그 필지에 적은 메모 · 다음 확인 날짜(최근 순) — 필지 카드 아래 몇 줄. 기관 세션(관할 밖 0)."""
    p = require(principal(request), realm="tenant")
    async with db(p) as conn:
        rows = await conn.fetch("SELECT e.at, e.note, e.planned_for, e.by, e.assignee FROM survey_finding_events e WHERE e.finding_id=$1 "
                                "AND NOT coalesce(e.demo,false) AND (e.note IS NOT NULL OR e.planned_for IS NOT NULL) ORDER BY e.at DESC LIMIT $2",
                                fid, max(1, min(int(limit or 5), 20)))
        users = {u["id"]: u for u in await conn.fetch("SELECT id, name, dept FROM tenant_users WHERE tenant_id=$1", p.tenant_id)} if rows else {}
    who = lambda uid: " ".join(x for x in ((users.get(uid) or {}).get("dept") or "", (users.get(uid) or {}).get("name") or "") if x)  # noqa: E731
    return {"items": [{"at": _iso(r["at"]), "note": r["note"], "planned_for": r["planned_for"].isoformat() if r["planned_for"] else None,
                       "who": (r["assignee"] or who(r["by"]) or "").strip()} for r in rows],
            "can_write": p.role == "manager", "as_of": now_iso()}


def _months(rows, now: dt.datetime, period: str) -> list[dict]:
    """월별 확인 기록 — 기록이 없는 달은 0(빈칸으로 두지 않는다) · 이번 달까지 · 전체는 최근 여섯 달(더 오래된 기록이 있으면 그 달부터) ·
    올해 = 1월부터 · 이번 달 = 한 칸."""
    have = {r["m"]: int(r["n"]) for r in rows}
    end = (now.year, now.month)
    if period == "month":
        start = end
    elif period == "year":
        start = (now.year, 1)
    else:
        y, m = now.year, now.month - 5
        while m < 1:
            y, m = y - 1, m + 12
        first = min(have) if have else None
        start = min((y, m), (int(first[:4]), int(first[5:7]))) if first else (y, m)
    out, (y, m) = [], start
    while (y, m) <= end and len(out) < 36:
        k = f"{y:04d}-{m:02d}"
        out.append({"month": k, "n": env(have.get(k, 0), "count", "recorded", "확인 기록")})
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return out


@router.get("/history/stats")
async def stats(request: Request, card: str, period: str = "all"):
    p = await _gate(request, card)
    sggs = await survey_sggs(p.tenant_id, card)
    if not sggs:
        return {"card": card, "survey": False, "as_of": now_iso()}
    now = dt.datetime.now(KST)
    since = {"year": dt.datetime(now.year, 1, 1, tzinfo=KST), "month": dt.datetime(now.year, now.month, 1, tzinfo=KST)}.get(period)
    src = "실태조사(AI × 연속지적 규칙 R1–R6) · 상태 기록"
    sw, sa = await card_scope(card, sggs, 2)                    # 이 서비스의 필지 대조 행만(카드마다 따로) — $2..$4
    sw3 = sw.replace("$4", "$5").replace("$3", "$4").replace("$2", "$3")         # 같은 조건 · $3..$5
    async with db(p) as c:                                       # 기관 세션 연결 — 관할 밖 0(RLS)
        tot = await c.fetchrow(
            "SELECT count(*) AS suspect, count(DISTINCT pnu) FILTER (WHERE priority='A' AND state IN ('open','assigned')) AS field_check, "
            "count(*) FILTER (WHERE priority='A') AS prio_a, count(*) FILTER (WHERE state='closed') AS closed, "
            "count(*) FILTER (WHERE state='dismissed' OR verdict IN ('match_fp','fp')) AS fp, "
            "count(*) FILTER (WHERE planned_for IS NOT NULL AND state NOT IN ('closed','dismissed')) AS planned "
            f"FROM survey_findings f WHERE {sw} AND f.rule = ANY($1::text[])", RULES, *sa)
        emd = await c.fetch(
            "SELECT f.emd_cd, coalesce(e.name, f.emd) AS name, count(*) AS suspect, count(*) FILTER (WHERE f.priority='A') AS prio_a, "
            "count(DISTINCT f.pnu) FILTER (WHERE f.priority='A' AND f.state IN ('open','assigned')) AS field_check, "
            "count(*) FILTER (WHERE f.state='closed') AS closed, count(*) FILTER (WHERE f.state='dismissed' OR f.verdict IN ('match_fp','fp')) AS fp "
            f"FROM survey_findings f LEFT JOIN survey_emd e ON e.emd_cd=f.emd_cd WHERE {sw} AND f.rule = ANY($1::text[]) "
            "GROUP BY 1,2 ORDER BY prio_a DESC, suspect DESC", RULES, *sa)
        mon = await c.fetch(
            "SELECT to_char(date_trunc('month', e.at AT TIME ZONE 'Asia/Seoul'), 'YYYY-MM') AS m, count(*) AS n FROM survey_finding_events e "
            f"JOIN survey_findings f ON f.id=e.finding_id WHERE e.tenant_id=$1 AND {sw3} AND NOT coalesce(e.demo,false) "
            "AND ($2::timestamptz IS NULL OR e.at >= $2) GROUP BY 1 ORDER BY 1", p.tenant_id, since, *sa)
        recent = await c.fetchval("SELECT count(*) FROM survey_finding_events e JOIN survey_findings f ON f.id=e.finding_id WHERE e.tenant_id=$1 "
                                  f"AND {sw3} AND NOT coalesce(e.demo,false) AND ($2::timestamptz IS NULL OR e.at >= $2)", p.tenant_id, since, *sa)
    E = lambda v, unit, note=None: env(int(v or 0), unit, "inferred", src, note)  # noqa: E731
    return {"card": card, "survey": True, "period": period,
            "numbers": {"suspect": E(tot["suspect"], "필지", "검수 전 · 위법 판정 아님"), "field_check": E(tot["field_check"], "필지", "현장 확인 전"),
                        "prio_a": E(tot["prio_a"], "필지"), "closed": env(int(tot["closed"] or 0), "필지", "recorded", "상태 기록 · 확인 끝"),
                        "fp": env(int(tot["fp"] or 0), "필지", "recorded", "상태 기록 · 오탐(AI가 잘못 봄)"),
                        "planned": env(int(tot["planned"] or 0), "필지", "recorded", "다음 확인 날짜가 적힌 필지")},
            "emd": [{"cd": r["emd_cd"], "name": r["name"] or "읍면동 밖", "suspect": E(r["suspect"], "필지"), "prio_a": E(r["prio_a"], "필지"),
                     "field_check": E(r["field_check"], "필지"), "closed": env(int(r["closed"] or 0), "필지", "recorded", "상태 기록"),
                     "fp": env(int(r["fp"] or 0), "필지", "recorded", "상태 기록")} for r in emd],
            "monthly": _months(mon, now, period),
            "checks": env(int(recent or 0), "count", "recorded", "확인 기록(기간 안)"), "as_of": now_iso()}


async def bell_extra(p: Principal) -> list[dict]:
    """알림 칸(종)의 다른 할 일 — messages._extra 가 부른다. 처리하면 저절로 빠진다.
    · LX 관리자: 촬영 요청 답 기다림(state sent) → 기관에서 온 요청 화면(#shoots)
    · 기관: 내가 보낸 촬영 요청에 LX 답 도착(answered — 진행 · 취소를 정할 것) → 요청하기 · 보낸 요청
    · 기관: 새 결과 — 볼 수 있는 서비스의 새 판 가운데 읽지 않은 것(우리 공간의 알림 기록과 같은 판정) → 그 서비스(여럿이면 내 서비스)"""
    out: list[dict] = []
    async with db(realm="lx") as c:
        if p.realm == "lx" and (p.is_admin or p.role == "staff"):
            # 관리자 = 모두 · 직원 = 그 기관 촬영 요청 담당으로 지정된 것만(LX 관리자 '기관 한 곳' 화면 · now 질문 17 ⓑ)
            try:
                rows = await c.fetch("SELECT s.id, s.place, s.created_at, t.name AS tname FROM shoot_requests s LEFT JOIN tenants t ON t.id=s.tenant_id "
                                     "WHERE s.state='sent' AND ($1::text IS NULL OR s.tenant_id IN (SELECT tenant_id FROM tenant_shoot_staff WHERE user_id=$1)) "
                                     "ORDER BY s.created_at DESC LIMIT 20", None if p.is_admin else p.user_id)
            except Exception:  # noqa: BLE001 — 담당 표가 없는 DB
                rows = await c.fetch("SELECT s.id, s.place, s.created_at, t.name AS tname FROM shoot_requests s LEFT JOIN tenants t ON t.id=s.tenant_id "
                                     "WHERE s.state='sent' ORDER BY s.created_at DESC LIMIT 20") if p.is_admin else []
            if rows:
                nm = lambda t: (t.get("ko") if isinstance(t, dict) else str(t or "")).split()[-1] if t else ""  # noqa: E731
                out.append({"kind": "shoot", "n": len(rows), "href": "/landxi/v3/lx-inbox/#shoots",
                            "items": [{"id": r["id"], "title": " · ".join(x for x in (nm(r["tname"]), r["place"]) if x), "at": _iso(r["created_at"])} for r in rows[:3]]})
        if p.realm == "tenant" and p.tenant_id and p.tenant_id != "lx-demo":
            rows = await c.fetch("SELECT id, place, updated_at FROM shoot_requests WHERE tenant_id=$1 AND requested_by=$2 AND state='answered' "
                                 "ORDER BY updated_at DESC LIMIT 20", p.tenant_id, p.user_id)
            if rows:
                out.append({"kind": "shoot_ans", "n": len(rows), "href": "/landxi/v3/gov-request/?tab=sent",
                            "items": [{"id": r["id"], "title": f"{r['place'] or '그린 범위'} 촬영 요청", "at": _iso(r["updated_at"])} for r in rows[:3]]})
            seen = await c.fetchval("SELECT seen_at FROM space_reads WHERE tenant_id=$1 AND user_id=$2", p.tenant_id, p.user_id)
            cards = None
            if p.role != "manager":
                cards = [r["card_id"] for r in await c.fetch("SELECT card_id FROM space_assign WHERE tenant_id=$1 AND user_id=$2", p.tenant_id, p.user_id)]
            if cards is None or cards:
                rows = await c.fetch(
                    "SELECT l.card_id, l.kind, l.line, l.at, g.edition FROM space_log l LEFT JOIN space_guides g ON g.id = l.guide_id "
                    "WHERE l.tenant_id=$1 AND l.kind IN ('guide','version') AND NOT coalesce(l.backfill,false) AND ($2::timestamptz IS NULL OR l.at > $2) "
                    "AND ($3::text[] IS NULL OR l.card_id = ANY($3::text[])) ORDER BY l.at DESC LIMIT 10", p.tenant_id, seen, cards)
                if rows:
                    one = len({r["card_id"] for r in rows}) == 1
                    out.append({"kind": "result", "n": len(rows),
                                "href": "/landxi/v3/gov-select/?" + (f"service={rows[0]['card_id']}" if one else "list=1"),
                                "items": [{"title": str(r["line"] or "") if r["kind"] == "version" else str(r["line"] or "").split(" — ")[0], "at": _iso(r["at"])} for r in rows[:3]]})   # 새 판 알림은 달라진 점 한 줄까지(나중 19)
    return out
