"""기관 서비스 이력 · 통계(구현 5차 2묶음 · 확인 대장 18차 N-1 ⓐ 묶음 · 기관-9 ⓑ · 시안 design-r9/gov-2 '이력' · '통계·보고서' 탭 · 원칙 117).

  GET /api/v1/history?card=     기관 세션 — 그 서비스에서 일어난 일 한 줄기(시간순): 결과 공개 · AI 분석 · 확인 기록(필지 메모 · 다음 확인 날짜) ·
                                검토 요청 · 분석 요청 · 촬영 요청 · 내려받기. 새로 적는 칸 0 — 서버에 이미 쌓이는 기록을 사람 말로 한 줄씩.
  GET /api/v1/history/stats?card=&period=all|year|month   통계 — 의심 필지 · 현장 확인 필요 · 확인 끝 · 오탐 · 현장 확인 예정 · 읍면별 표 · 월별 확인 기록
부서 사용자는 정해 준 서비스만(원칙 38 — 공간 배정과 같은 기록). 관할 밖 0(원칙 39 — RLS 그대로 · 기관 세션 연결).
숫자는 봉투로만 · 큰 숫자 자리엔 업무 결과만(사용자 규칙 2 · 3). 실태조사(필지 대조)가 없는 서비스는 확인 기록 · 통계 칸이 비어 있다(지어내지 않는다).
"""
from __future__ import annotations

import datetime as dt
import json
import re
import secrets

from fastapi import APIRouter, Request

from . import summary
from .deps import ApiError, Principal, audit, db, pool_sys, principal, require
from .envelope import KST, env, now_iso

router = APIRouter()
CARD_RE = re.compile(r"^card-[a-z0-9-]{2,40}$")
KIND_KO = {"publish": "결과 공개", "analysis": "AI 분석", "check": "확인 기록", "review": "검토 요청", "request": "분석 요청",
           "shoot": "촬영 요청", "download": "내려받기"}
ORDER = list(KIND_KO)
RULES = ["R1", "R2", "R3", "R4", "R5", "R6"]
FMT_KO = {"geojson": "지도 파일", "parcels": "필지 엑셀", "summary": "요약", "report": "보고서 한글 문서", "report_multi": "보고서 한글 문서",   # farm_more.FMT_KO 와 같은 이름표
          "report_xlsx": "보고서 엑셀", "stats": "통계 엑셀", "history": "이력 엑셀", "feedcrop": "사료작물 대장 대조 엑셀", "ledger_compare": "대장과 AI 결과 엑셀"}


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


async def _note_scope(request: Request, card: str, fid: str) -> None:
    """부서 담당자의 메모 쓰기 범위 — 정해 받은 서비스(_gate)의 필지 대조 행(card_scope)에 든 필지 기록만. 밖이면 쓰기 막음."""
    if not CARD_RE.match(card or ""):
        raise ApiError("forbidden", "기관 관리자나 서비스 담당자만 메모를 적을 수 있습니다")
    p = await _gate(request, card)
    sggs = await survey_sggs(p.tenant_id, card)
    if not sggs:
        raise ApiError("forbidden", "기관 관리자나 서비스 담당자만 메모를 적을 수 있습니다")
    sw, sa = await card_scope(card, sggs, 2)
    async with db(p) as c:
        ok = await c.fetchval(f"SELECT 1 FROM survey_findings f WHERE f.id=$1 AND {sw}", fid, *sa)
    if not ok:
        raise ApiError("forbidden", "기관 관리자나 서비스 담당자만 메모를 적을 수 있습니다")


@router.post("/survey/findings/{fid}/note")
async def finding_note(fid: str, body: dict, request: Request):
    """필지 메모 한 줄 + 다음 확인 날짜(확인 대장 18차 기관-9 ⓑ — 판정 버튼 없이). 상태는 그대로 두고 기록 한 줄만 남긴다:
    survey_finding_events(from = to = 지금 상태 · note · planned_for) + survey_findings.note · planned_for. 이력 탭 '확인 기록'에 쌓인다.
    쓰기 = 기관 관리자 + 그 서비스를 정해 받은 부서 담당자(10-21 영농-4 · 원칙 117 — body.card 의 필지 대조 범위 안 필지만) ·
    기관 세션 연결(RLS — 관할 밖 0). 날짜를 비우면 다음 확인 날짜를 지운다."""
    p = require(principal(request), realm="tenant")
    if p.role != "manager":
        await _note_scope(request, str((body or {}).get("card") or ""), fid)
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


async def _can_note(request: Request, card: str, fid: str) -> bool:
    try:
        await _note_scope(request, card, fid)
        return True
    except ApiError:
        return False


@router.get("/survey/findings/{fid}/notes")
async def finding_notes(fid: str, request: Request, limit: int = 5, card: str | None = None):
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
            "can_write": p.role == "manager" or bool(card and await _can_note(request, card, fid)), "as_of": now_iso()}


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


# ── 서비스 필지 메모 · 필지 이력(10-21 원칙 300 · 영농-3 · 영농-4) ─────────────────────────────────
PNU_RE = re.compile(r"^\d{19}$")
NEG_CLS = ("비경작지", "휴경")          # '찾지 못함'과 같은 뜻 — 바뀜 한 줄에서 그대로 이름으로 쓴다(지어내지 않음)


def _person(u) -> str:
    """기록에 누가 — 부서 · 이름 직위(있는 것만)."""
    if not u:
        return ""
    nm = " ".join(x for x in ((u.get("name") or "").strip(), (u.get("position") or "").strip()) if x)
    return " · ".join(x for x in ((u.get("dept") or "").strip(), nm) if x)


async def _users(c, tenant: str) -> dict:
    try:
        rows = await c.fetch("SELECT id, name, dept, position FROM tenant_users WHERE tenant_id=$1", tenant)
    except Exception:  # noqa: BLE001 — 직위 칸이 없는 DB
        rows = await c.fetch("SELECT id, name, dept, NULL::text AS position FROM tenant_users WHERE tenant_id=$1", tenant)
    return {r["id"]: dict(r) for r in rows}


def _clean_note(v) -> str | None:
    return " ".join(re.sub(r"[\x00-\x1f\x7f<>]", "", str(v or "")).split())[:200] or None


@router.post("/spaces/me/guides/{card}/parcels/notes")
async def parcel_notes_batch(card: str, request: Request, body: dict | None = None):
    """필지 메모 — 필지마다 메모 칸 하나(10-21 영농-D1 ⓐ · 기관 화면 전용 · 담당 · 상태 · 날짜 칸 없음). 한 필지도 여러 필지도 한 번에(영농-4) —
    필지마다 한 줄씩 남고(같은 묶음 번호) 가장 최근 줄이 그 필지의 지금 메모 · 이전 줄은 필지 이력에 보인다.
    쓰기 = 그 서비스를 볼 수 있는 기관 사용자(기관 관리자 + 서비스를 정해 받은 부서 담당자 · 원칙 117 · 38).
    고른 필지 번호는 그 서비스 결과 행(관할 · 부서 범위)에 있는 것만 받는다 — 범위 밖 번호는 한 줄도 남기지 않는다(원칙 39)."""
    from .spaces import _me, service_parcel_rows
    p = _me(request)
    b = body or {}
    note = _clean_note(b.get("note"))
    if not note:
        raise ApiError("bad_request", "메모를 적어 주세요", {"field": "note"})
    want = list(dict.fromkeys(str(x) for x in (b.get("pnus") or []) if PNU_RE.match(str(x))))
    if not want:
        raise ApiError("bad_request", "필지를 하나 이상 골라 주세요", {"field": "pnus"})
    if len(want) > 2000:
        raise ApiError("bad_request", "한 번에 2,000필지까지 적습니다", {"field": "pnus"})
    _svc, _g, rows, _per = await service_parcel_rows(p, card)      # 볼 수 없는 서비스 = 404(있다는 것도 알리지 않는다)
    inside = {str(r["pnu"]) for r in rows}
    ok = [x for x in want if x in inside]
    if not ok:
        raise ApiError("not_found", "고른 필지가 이 서비스 결과에 없습니다")
    now = dt.datetime.now(KST)
    batch = "pb_" + secrets.token_hex(8) if len(ok) > 1 else None
    async with db(p) as c:
        await c.executemany("INSERT INTO parcel_notes(id, tenant_id, card_id, pnu, note, batch_id, by_user, at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
                            [("pn_" + secrets.token_hex(8), p.tenant_id, card, x, note, batch, p.user_id or "", now) for x in ok])
        await audit(c, p, "parcel.note", f"{p.tenant_id}/{card}", None, {"parcels": len(ok), "batch": batch})
        who = _person((await _users(c, p.tenant_id)).get(p.user_id))
    return {"card": card, "saved": env(len(ok), "필지", "recorded", "필지 메모"), "skipped": env(len(want) - len(ok), "필지", "recorded", "이 서비스 결과에 없는 필지"), "batch": batch,
            "at": now.isoformat(timespec="seconds"), "who": who}


def _year(shot: str | None, analyzed: str | None) -> str | None:
    m = re.search(r"(19|20)\d{2}", str(shot or "")) or re.search(r"(19|20)\d{2}", str(analyzed or ""))
    return m.group(0) if m else None


TRACE_LOW, TRACE_HIGH = 0.05, 0.30          # 필지 대비 비율 — 5% 아래 = '흔적 없음' · 30% 이상 = 그 종류(10-22 FARM-ADMIN §1-4 · 한 필지 두 문장 어긋남)


def _trace_noun(cls: str) -> str:
    """'경작지' → '경작'(흔적 없음 앞에 붙는 말) · 그 밖은 그대로."""
    return cls[:-1] if cls.endswith("지") and len(cls) > 2 else cls


def change_line(results: list, parcel_m2: float) -> dict | None:
    """필지 '바뀜' 한 줄 — 필지 카드 · XI맵 위 띠 · 이력이 모두 이 한 함수의 글(숫자 한 출처).
    가장 최근 두 결과의 주된 종류만 보지 않고 필지 넓이 대비 비율로 본다: 이전 해 < 5% 이고 올해 ≥ 30% 면 '2023 경작 흔적 없음 → 2025 경작지'
    (96㎡ 조각 하나로 '두 해 모두 경작지'라 하던 것). 필지 넓이를 모르면 종류 이름만으로(예전 규칙)."""
    if len(results) < 2:
        return None
    a, z = results[-2], results[-1]
    ya, yz = a["year"] or a["shot"], z["year"] or z["shot"]

    def share(r, cls):
        if not parcel_m2:
            return None
        v = sum(float(x["area"]["value"] or 0) for x in r["classes"] if x["name"] == cls)
        return v / parcel_m2

    sa, sz = share(a, z["cls"]), share(z, z["cls"])
    ra, rz = share(a, a["cls"]), share(z, a["cls"])
    one = a["cls"] == z["cls"]                     # 주된 종류 이름이 같을 때만 비율로 가른다('모두 경작지'가 96㎡ 조각 하나에서 나오던 것)
    if one and sa is not None and sa < TRACE_LOW and sz >= TRACE_HIGH:
        line, same = f"{ya} {_trace_noun(z['cls'])} 흔적 없음 → {yz} {z['cls']}", False
    elif one and ra is not None and ra >= TRACE_HIGH and rz < TRACE_LOW:
        line, same = f"{ya} {a['cls']} → {yz} {_trace_noun(a['cls'])} 흔적 없음", False
    elif one:
        line, same = f"{ya} · {yz} 모두 {z['cls']}", True
    else:
        line, same = f"{ya} {a['cls']} → {yz} {z['cls']}", False
    return {"from": {"year": a["year"], "cls": a["cls"]}, "to": {"year": z["year"], "cls": z["cls"]}, "same": same, "line": line,
            **({"share": {"from": round(sa * 100, 1), "to": round(sz * 100, 1)}} if sa is not None else {})}


@router.get("/spaces/me/parcels/{pnu}/history")
async def parcel_history(pnu: str, request: Request, card: str, geom: int = 0, limit: int = 10):
    """필지 이력(영농-3) — 그 서비스의 결과(판마다 · 영상 시점마다)가 이 필지에서 본 것 · 올린 대장의 값 · 메모 · 다음 확인 날짜 · 검토 요청을 한 줄기로(새것 먼저).
    맨 위 '바뀜' 한 줄 = 가장 최근 두 결과의 주된 종류(넓이가 큰 종류). 결과가 없는 해는 줄을 만들지 않는다(지어내지 않음).
    숫자: 결과 필지 번호가 붙은 결과 = 필지 목록과 같은 결과 넓이 · 필지 번호가 없는 결과 = 필지와 겹친 넓이(필지 엑셀과 같은 저장 값 · 없으면 겹친 면 넓이).
    geom=1 → 가장 최근 두 결과의 이 필지 결과 면(시점 비교 화면이 두 쪽에 겹친다). 기관 세션 · 볼 수 있는 서비스 · 관할 안 필지만."""
    from .spaces import _guide_or_404, _me, _only, _scope_codes, class_ko
    p = _me(request)
    if not PNU_RE.match(pnu or ""):
        raise ApiError("not_found", "필지가 없습니다")
    svc, g, _rows = await _guide_or_404(p, card)
    codes = _scope_codes(p.tenant_id, await _only(p, card))
    if codes is not None and pnu[:5] not in codes:
        raise ApiError("not_found", "필지가 없습니다")
    limit = max(1, min(int(limit or 10), 50))
    async with db(p) as c:
        eds = await c.fetch("SELECT edition, body, published_at, created_at FROM space_guides WHERE tenant_id=$1 AND card_id=$2 ORDER BY edition", p.tenant_id, card)
        users = await _users(c, p.tenant_id)
        pnotes = await c.fetch("SELECT note, by_user, at, batch_id FROM parcel_notes WHERE tenant_id=$1 AND card_id=$2 AND pnu=$3 ORDER BY at DESC LIMIT 50",
                               p.tenant_id, card, pnu)
        fnotes = await c.fetch("SELECT e.at, e.note, e.planned_for, e.by, e.assignee FROM survey_finding_events e JOIN survey_findings f ON f.id = e.finding_id "
                               "WHERE f.pnu=$1 AND e.tenant_id=$2 AND NOT coalesce(e.demo,false) AND (e.note IS NOT NULL OR e.planned_for IS NOT NULL) "
                               "ORDER BY e.at DESC LIMIT 20", pnu, p.tenant_id)
        revs = await c.fetch("SELECT f.at, f.status, f.sender_id, (SELECT body FROM review_messages m WHERE m.request_id=f.id ORDER BY at LIMIT 1) AS first "
                             "FROM feedback f WHERE f.kind='review' AND f.tenant_id=$1 AND f.pnu=$2 ORDER BY f.at DESC LIMIT 20", p.tenant_id, pnu)
        leds = await c.fetch("SELECT DISTINCT ON (i.kind) i.kind, i.filename, i.name, i.base_date, i.created_at, r.payload FROM registry_snapshots r "
                             "JOIN ledger_imports i ON i.id = r.import_id AND i.tenant_id = r.tenant_id "
                             "WHERE r.tenant_id=$1 AND r.pnu=$2 AND i.state='matched' ORDER BY i.kind, i.created_at DESC, r.row_no", p.tenant_id, pnu)
    # 결과 — 판마다 결과 세트(같은 세트는 처음 나온 판으로 한 번)
    rounds, seen = [], set()
    for e in eds:
        b = e["body"] or {}
        rd = ((b.get("when") or {}).get("rounds") or [{}])[0]
        for s in b.get("sets") or []:
            if s in seen:
                continue
            seen.add(s)
            rounds.append({"set": s, "edition": e["edition"], "shot": rd.get("shot"), "analyzed": rd.get("analyzed"),
                           "year": _year(rd.get("shot"), rd.get("analyzed"))})
    sets = [r["set"] for r in rounds]
    found: dict[str, dict] = {}
    shapes: dict[str, list] = {}
    addr = None
    parcel_m2 = 0.0
    if sets:
        async with db(realm="lx") as c:
            await c.execute("SET LOCAL jit = off")
            pa = await c.fetchrow("SELECT addr, area_m2 FROM survey_parcels WHERE pnu=$1", pnu)
            addr = pa["addr"] if pa else None
            parcel_m2 = float(pa["area_m2"] or 0) if pa else 0.0
            spa = await c.fetch("SELECT job_id, cls_ko, sum(hit1_m2) m2 FROM survey_parcel_ai WHERE pnu=$1 AND job_id = ANY($2::text[]) AND n1 > 0 GROUP BY 1, 2",
                                pnu, sets)
        # 결과 면 × 필지 공간 결합 = 시스템 읽기 경로(pool_sys) — RLS 보안 장벽이 공간 인덱스(&&)를 막아 결과 세트 전체(13만 줄)를 훑던 것(0.38초 → 수 ms · impl-46 속도).
        # 읽는 범위는 위에서 정한 그대로(볼 수 있는 서비스의 결과 세트 · 관할 안 필지) — 위 연결도 realm lx 라 RLS 로 거르던 것이 없다
        async with (await pool_sys()).acquire() as c:
            det = await c.fetch(
                "WITH pg AS (SELECT geom FROM survey_parcels WHERE pnu=$1) "
                "SELECT d.job_id, d.cls, d.cls_en, (d.pnu IS NOT NULL) tagged, "
                "CASE WHEN d.pnu IS NOT NULL THEN d.area_m2 ELSE ST_Area(ST_Intersection(d.geom, pg.geom)::geography) END m2"
                + (", ST_AsGeoJSON(ST_SimplifyPreserveTopology(CASE WHEN d.pnu IS NOT NULL THEN d.geom ELSE ST_Intersection(d.geom, pg.geom) END, 0.000003), 6) g "
                   if geom else " ")
                + "FROM detections d, pg WHERE d.job_id = ANY($2::text[]) AND d.edit_state <> 'deleted' AND d.geom && pg.geom "
                "AND (d.pnu = $1 OR (d.pnu IS NULL AND ST_Intersects(d.geom, pg.geom)))", pnu, sets)
        stored = {}
        for r in spa:
            stored.setdefault(r["job_id"], {})[r["cls_ko"]] = float(r["m2"] or 0)
        live: dict[str, dict] = {}
        for r in det:
            k = class_ko(r["cls"], r["cls_en"])
            m2 = float(r["m2"] or 0)
            if not r["tagged"] and m2 < 1:                         # 경계에 스친 면은 이 필지 결과가 아니다
                continue
            live.setdefault(r["job_id"], {}).setdefault("by", {})
            live[r["job_id"]]["by"][k] = live[r["job_id"]]["by"].get(k, 0.0) + m2
            live[r["job_id"]]["tagged"] = live[r["job_id"]].get("tagged") or r["tagged"]
            if geom and r.get("g"):
                shapes.setdefault(r["job_id"], []).append({"type": "Feature", "properties": {"cls": k}, "geometry": json.loads(r["g"])})
        for s in sets:
            lv = live.get(s) or {}
            by = lv["by"] if lv.get("tagged") else (stored.get(s) or lv.get("by") or {})   # 필지 번호가 붙은 결과 = 그 결과 · 아니면 저장된 겹친 넓이
            if not lv.get("tagged") and stored.get(s):
                shapes[s] = [f for f in shapes.get(s, []) if f["properties"]["cls"] in stored[s]]
            by = {k: v for k, v in by.items() if v >= 1}
            if by:
                found[s] = by
    src = "이 서비스의 AI 분석 결과 × 연속지적 필지"
    results = []
    for r in rounds:
        by = found.get(r["set"])
        if not by:
            continue                                                # 결과 없는 해는 줄을 만들지 않는다
        top = max(by.items(), key=lambda kv: kv[1])[0]
        results.append({"edition": f"{r['edition']}판", "_ed": r["edition"], "shot": r["shot"], "year": r["year"], "analyzed": str(r["analyzed"])[:10] if r["analyzed"] else None,
                        "cls": top, "classes": [{"name": k, "area": env(round(v, 1), "m2", "measured", src)} for k, v in sorted(by.items(), key=lambda kv: -kv[1])],
                        "_set": r["set"]})
    results.sort(key=lambda x: (x["year"] or "", x["analyzed"] or "", x["_ed"]))
    change = change_line(results, parcel_m2)
    items = []
    for r in results:
        items.append({"kind": "result", "at": r["analyzed"], "_k": r["analyzed"] or r["year"] or "", "year": r["year"],
                      "title": f"AI 분석 · {r['cls']}", "sub": " · ".join(x for x in (r["shot"], f"{r['classes'][0]['area']['value']:,.0f}㎡") if x),
                      "area": r["classes"][0]["area"]})
    from .ledger import KINDS
    for L in leds:
        pl = L["payload"] or {}
        v = str(pl.get("status") or pl.get("use") or "").strip()
        d0 = L["base_date"] or (L["created_at"].astimezone(KST).date() if L["created_at"] else None)
        items.append({"kind": "ledger", "at": d0.isoformat() if d0 else None, "title": f"{KINDS.get(L['kind']) or '대장'}" + (f" · {v}" if v else ""),
                      "sub": ("기준일 " if L["base_date"] else "올린 날 ") + (d0.strftime("%Y.%m.%d") if d0 else "")})
    for n in pnotes:
        items.append({"kind": "note", "at": _iso(n["at"]), "title": f"메모 '{n['note']}'", "sub": "여러 필지 함께" if n["batch_id"] else "",
                      "who": _person(users.get(n["by_user"]))})
    for n in fnotes:
        items.append({"kind": "note", "at": _iso(n["at"]), "title": f"메모 '{n['note']}'" if n["note"] else "다음 확인 날짜",
                      "sub": f"다음 확인 {n['planned_for'].month}.{n['planned_for'].day:02d}" if n["planned_for"] else "",
                      "who": (n["assignee"] or _person(users.get(n["by"])) or "").strip()})
    for f in revs:
        items.append({"kind": "review", "at": _iso(f["at"]), "title": "검토 요청" + (f" '{f['first']}'" if f["first"] else ""),
                      "sub": {"answered": "LX 답 도착", "seen": "LX 확인 중"}.get(f["status"] or "", "보냄"), "who": _person(users.get(f["sender_id"]))})
    items.sort(key=lambda x: str(x.get("_k") or x["at"] or ""), reverse=True)    # 분석한 날을 모르는 결과는 그 해(영상 해)로 줄 세움 — 날짜를 지어내지 않는다
    KO = {"result": "AI 분석", "ledger": "대장", "note": "메모", "review": "검토 요청"}
    for x in items:
        x.pop("_k", None)
        x["kind_ko"] = KO[x["kind"]]
    out = {"pnu": pnu, "addr": _short(addr) if addr else None, "card": card, "service": svc["name"], "change": change,
           "results": [{k: v for k, v in r.items() if not k.startswith("_")} for r in results],
           "items": items[:limit], "more": env(max(0, len(items) - limit), "줄", "recorded", "필지 이력"), "total": len(items),
           "memo": ({"note": pnotes[0]["note"], "at": _iso(pnotes[0]["at"]), "who": _person(users.get(pnotes[0]["by_user"]))} if pnotes else None),
           "can_write": True, "as_of": now_iso()}
    if geom:
        out["shapes"] = [{"year": r["year"], "shot": r["shot"], "cls": r["cls"],
                          "fc": {"type": "FeatureCollection", "features": shapes.get(r["_set"], [])}} for r in results[-2:]]
    return out
