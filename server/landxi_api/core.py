"""핵심 코어 고리 — 클래스 한 곳 · 새 클래스(직원 더함 · 관리자 승인) · 고친 것 → 학습 데이터 · 데이터하우스 · XI 재학습 · 배포 관리 · 학습 서식
(원칙 205 · 213 · 217 · 10-12 12:45 확인 · 마이그레이션 0038).

클래스
  GET  /classes?q=&status=                   클래스 목록(이름 · 다른 이름 · 위 클래스 · 세부/새 물체 · 상태) — 세 화면이 같은 id 를 읽는다.
  GET  /classes/pick?set=                    XI맵 그 자리 고치기의 '분류 바꾸기' 목록 — 이 서비스가 찾는 것 · 같은 모델의 다른 클래스 · 승인 대기(이 서비스) · 그 밖.
  POST /classes                              {name, kind: detail|object, parent_id?, set?, card_id?, test?, force?} — 직원 = 승인 대기 · 관리자 = 바로 승인.
                                             비슷한 이름이 있으면 409 similar(같은 뜻이면 그것을 고르게) · force 로 그래도 더함. 서비스당 승인 대기 상한.
  POST /classes/{id}/decide                  {action: approve|merge|reject, into?, note?} — LX 관리자만. 합치면 고친 기록이 그 클래스로 옮겨 간다.
  DELETE /classes/{id}                       시험 표시 클래스만(시험 정리 — 관리자).
데이터하우스(직원 메뉴 '데이터하우스' · 결정 2 ⓐ)
  GET  /datahouse/classes                    클래스마다 학습 데이터(올린 묶음 장수) · 고친 것 n건 · 쓰는 서비스 · 상태 + 승인 대기
  GET  /datahouse/edits?class=&card=         고친 기록 목록(최근 순) — 누가 · 언제 · 무엇을
XI 재학습 · 배포 관리(LX 관리자 배포 안 · 결정 4 ⓐ · 원칙 213)
  GET  /retrain                              방식(쉬는 시간 자동 기본) · 쉬는 시간대 · 기준 + 서비스마다 줄(지금 판 · 쌓인 고친 것 · 기준 · 상태) + 새 클래스 갈 곳 + 오늘 밤 순서
  PUT  /retrain/settings                     {mode, quiet_start, quiet_end, weekend, min_new} — 관리자
  PUT  /retrain/services/{card}              {mode: auto|manual} — 관리자
  POST /retrain/tick                         {dry?, at?, test?} — 스케줄러 한 번(관리자 · 시험 증명용). 기동 뒤에는 5분마다 저절로(dry 아님).
  POST /retrain/services/{card}/now          수동 '지금 학습'(프로젝트장 · 관리자) — 같은 대기열 · 같은 전력 규칙
학습 서식(결정 ⓑ 블록까지 바꿈)
  GET  /train-templates                      업무별 기본 흐름(블록 · 학습 설정 첫 값) + 바꿀 수 없는 것(잠금)
  PUT  /train-templates/{업무}                {blocks, cfg} — 관리자 · DELETE 로 업무 서식 지우면 '기본'을 씀

학습 데이터 1장이 되는 때(결정 3 ⓐ 고치면 저절로 · 10-12 16:18) — 고친 자리 둘레 한 칸이 조용한 시간 뒤 1장(train_tiles.py).
  데이터하우스 · 학습 화면의 '고친 것 n건'(UNIT · count_units)은 그대로 두고, XI 재학습의 기준 · 대기열은 1장이 된 칸(TILE_UNIT · count_tiles)으로 센다.
  GET  /retrain/tiles?card=&test=           칸 목록(관리자 · 상태 · 고친 수 · 테두리 수) — 증거 · 점검용
  POST /retrain/tiles/scan                  {test?, quiet_min?} 칸 한 번 맞추기(관리자 · 시험 증명용). 기동 뒤에는 스케줄러가 5분마다.
화면 글에 표 이름 · 작업 id · 경로를 쓰지 않는다. 숫자는 서버에서 센 값(봉투).
"""
from __future__ import annotations

import asyncio
import datetime as dt
import difflib
import json
import secrets
from types import SimpleNamespace

from fastapi import APIRouter, Query, Request

from .deps import ApiError, Principal, audit, db, principal, require
from .envelope import KST, env, now_iso

router = APIRouter()

# ── 학습 데이터 단위(결정 3 — 아직 결정 전 · 바꿔 끼우는 곳은 여기 하나) ──────────────────
# 지금: 고친 기록 한 건 = 한 단위('고친 것 n건'). 학습에 넣는 것 = 되돌리지 않음 · 시험 아님 · 메모 아님 ·
#       바꾼 클래스가 승인 대기 · 거절이 아님. 결정이 나면(예: '그 자리 한 칸 = 1장') 이 두 줄과 count_units 만 바꾼다.
UNIT = {"id": "edit", "word": "고친 것", "suffix": "건"}
TILE_UNIT = {"id": "tile", "word": "학습 데이터", "suffix": "장"}           # 결정 3 ⓐ — 고친 자리 한 칸 = 1장(XI 재학습 기준 · 대기열)
LEARNABLE = ("e.undone_at IS NULL AND NOT e.test AND e.action <> 'memo' "
             "AND (e.cls_after_id IS NULL OR ca.status = 'approved')")
PENDING = "e.undone_at IS NULL AND NOT e.test AND e.action <> 'memo' AND ca.status = 'proposed'"
EDITS_FROM = "FROM result_edits e LEFT JOIN classes ca ON ca.id = e.cls_after_id"


async def count_units(conn, *, card_id: str | None = None, class_id: str | None = None, since=None, until=None) -> int:
    """새 학습 데이터(지금 규칙 = 학습에 넣는 고친 기록 건수). class_id = 바꾼 뒤 또는 바꾸기 전 클래스가 그것인 것."""
    q, a = [LEARNABLE], []
    if card_id:
        a.append(card_id); q.append(f"e.card_id = ${len(a)}")
    if class_id:
        a.append(class_id); q.append(f"(e.cls_after_id = ${len(a)} OR (e.cls_after_id IS NULL AND e.cls_before_id = ${len(a)}))")
    if since:
        a.append(since); q.append(f"e.at > ${len(a)}")
    if until:
        a.append(until); q.append(f"e.at <= ${len(a)}")
    return int(await conn.fetchval(f"SELECT count(*) {EDITS_FROM} WHERE {' AND '.join(q)}", *a) or 0)


def units_env(n: int, what: str = "XI맵에서 고친 것") -> dict:
    return env(int(n), "count", "recorded", f"{what}(되돌린 것 · 시험 · 메모 · 승인 전 클래스 뺌)")


def tiles_env(n: int, what: str = "XI맵에서 고친 자리로 만든 학습 데이터") -> dict:
    return env(int(n), "count", "recorded", f"{what}(고친 자리 한 칸 = 1장 · 조용한 시간 뒤 · 둘이 다르게 고친 칸 뺌)")


# ── 공통 ──────────────────────────────────────────────────────────────────
def _iso(t) -> str | None:
    return t.astimezone(KST).isoformat(timespec="seconds") if t else None


def _ko(n) -> str:
    if isinstance(n, str):
        try:
            n = json.loads(n)
        except ValueError:
            return n
    s = (n or {}).get("ko") if isinstance(n, dict) else str(n or "")
    s = (s or "").strip()
    for suf in (" 분석서비스", "분석서비스", " 분석 서비스"):
        if s.endswith(suf):
            s = s[: -len(suf)].strip()
    return s


def _cls_row(r) -> dict:
    return {"id": r["id"], "name": r["name"], "aliases": list(r["aliases"] or []), "kind": r["kind"], "status": r["status"],
            "parent": {"id": r["parent_id"], "name": r["parent_name"]} if r["parent_id"] else None,
            "merged_into": r["merged_into"], "card_id": r["card_id"], "by": r["who"], "at": _iso(r["created_at"]),
            "decided_at": _iso(r["decided_at"]), "note": r["decide_note"], "test": r["test"]}


CLS_SELECT = ("SELECT c.*, p.name AS parent_name, u.name AS who FROM classes c LEFT JOIN classes p ON p.id = c.parent_id "
              "LEFT JOIN lx_users u ON u.id = c.created_by")


async def sync_models(conn) -> int:
    """새로 등록된 모델의 머리 이름 → 클래스 id(맞춤표에 있는 이름만). 서비스 판이 새로 생기면 찾는 것도 이어 둔다."""
    n = await conn.fetchval(
        "WITH ins AS (INSERT INTO model_classes(model_id, idx, label, class_id) "
        "SELECT m.id, t.i - 1, t.label, l.class_id FROM models m "
        "CROSS JOIN LATERAL jsonb_array_elements_text(CASE WHEN jsonb_typeof(m.classes)='array' THEN m.classes ELSE '[]'::jsonb END) WITH ORDINALITY t(label, i) "
        "LEFT JOIN class_labels l ON l.label = t.label "
        "WHERE NOT EXISTS (SELECT 1 FROM model_classes x WHERE x.model_id = m.id) ON CONFLICT DO NOTHING RETURNING 1) SELECT count(*) FROM ins")
    await conn.execute(
        "INSERT INTO card_classes(card_id, version, class_id, state, how) "
        "SELECT DISTINCT v.card_id, v.version, l.class_id, 'finds', 'head' FROM card_versions v "
        "CROSS JOIN LATERAL jsonb_array_elements_text(CASE WHEN jsonb_typeof(v.modules->'classes')='array' THEN v.modules->'classes' ELSE '[]'::jsonb END) c(label) "
        "JOIN class_labels l ON l.label = c.label WHERE NOT EXISTS (SELECT 1 FROM card_classes x WHERE x.card_id=v.card_id AND x.version=v.version) "
        "ON CONFLICT DO NOTHING")
    await conn.execute(
        "INSERT INTO card_classes(card_id, version, class_id, state, how) "
        "SELECT DISTINCT v.card_id, v.version, mc.class_id, 'finds', 'head' FROM card_versions v CROSS JOIN LATERAL unnest(v.model_ids) mid(model_id) "
        "JOIN model_classes mc ON mc.model_id = mid.model_id AND mc.class_id IS NOT NULL "
        "WHERE NOT EXISTS (SELECT 1 FROM card_classes x WHERE x.card_id=v.card_id AND x.version=v.version) ON CONFLICT DO NOTHING")
    return int(n or 0)


async def label_id(conn, label: str | None) -> str | None:
    if not label:
        return None
    return await conn.fetchval("SELECT class_id FROM class_labels WHERE label=$1", label)


async def tag_edit(conn, eid: str, cls_id: str | None = None) -> None:
    """고친 기록 → 클래스 id(바꾸기 전 · 뒤). 바꾼 클래스를 id 로 받았으면 그 id(승인 대기 클래스 포함)."""
    await conn.execute(
        "UPDATE result_edits e SET cls_before_id = coalesce(e.cls_before_id, (SELECT class_id FROM class_labels WHERE label = e.cls_before)), "
        "cls_after_id = coalesce($2, e.cls_after_id, (SELECT class_id FROM class_labels WHERE label = e.cls_after)) WHERE e.id = $1", eid, cls_id)


async def class_for_edit(conn, cls_id: str) -> dict:
    """그 자리 고치기에서 고른 클래스 — 살아 있는 것(승인 · 승인 대기)만. 합쳐진 것은 합친 곳으로."""
    r = await conn.fetchrow("SELECT id, name, status, merged_into FROM classes WHERE id=$1", cls_id)
    if r and r["status"] == "merged" and r["merged_into"]:
        r = await conn.fetchrow("SELECT id, name, status, merged_into FROM classes WHERE id=$1", r["merged_into"])
    if not r or r["status"] not in ("approved", "proposed"):
        raise ApiError("bad_request", "고를 수 없는 클래스입니다")
    return dict(r)


async def _cur_version(conn, card_id: str):
    rows = await conn.fetch("SELECT version, model_ids, approved_at FROM card_versions WHERE card_id=$1 AND approved_at IS NOT NULL", card_id)
    if not rows:
        return None

    def key(r):
        try:
            return tuple(int(x) for x in str(r["version"]).split("."))
        except ValueError:
            return (0,)
    return max(rows, key=key)


async def _card_meta(conn, set_id: str) -> dict:
    from .ximap import _meta, _resolve  # noqa: F401  (XI맵 결과 묶음 → 서비스 · 모델)
    return await _meta(conn, set_id)


# ── 클래스 ────────────────────────────────────────────────────────────────
@router.get("/classes")
async def list_classes(request: Request, q: str = "", status: str = ""):
    require(principal(request), lx=True)
    async with db(realm="lx") as conn:
        await sync_models(conn)
        rows = await conn.fetch(CLS_SELECT + " ORDER BY c.status <> 'proposed', c.parent_id NULLS FIRST, c.name")
    items = [_cls_row(r) for r in rows]
    if status:
        items = [x for x in items if x["status"] in status.split(",")]
    if q.strip():
        k = q.strip().lower()
        items = [x for x in items if k in x["name"].lower() or any(k in a.lower() for a in x["aliases"])]
    return {"items": items, "pending": env(sum(1 for x in items if x["status"] == "proposed"), "count", "recorded", "승인 대기 클래스"),
            "as_of": now_iso()}


@router.get("/classes/pick")
async def pick_classes(request: Request, set_: str = Query("", alias="set")):
    """XI맵 분류 바꾸기 — 질문 문장 없이 클래스 목록에서 고른다(원칙 205)."""
    p = require(principal(request), lx=True)
    from .ximap import _meta, _resolve
    rs = await _resolve(p, set_)
    async with db(realm="lx") as conn:
        await sync_models(conn)
        meta = await _meta(conn, rs["job_id"])
        card = meta.get("card_id")
        cur = await _cur_version(conn, card) if card else None
        finds = [r["class_id"] for r in await conn.fetch("SELECT class_id FROM card_classes WHERE card_id=$1 AND version=$2 AND state='finds'",
                                                         card, cur["version"])] if cur else []
        model = [r["class_id"] for r in await conn.fetch("SELECT class_id FROM model_classes WHERE model_id=$1 AND class_id IS NOT NULL ORDER BY idx",
                                                         meta.get("model_id"))] if meta.get("model_id") else []
        res = [x for x in [await label_id(conn, c) for c in meta.get("classes") or []] if x]
        rows = await conn.fetch(CLS_SELECT + " WHERE c.status IN ('approved','proposed') ORDER BY c.name")
    by = {r["id"]: _cls_row(r) for r in rows}
    seen: set[str] = set()

    def take(ids):
        out = []
        for i in ids:
            if i in by and i not in seen and by[i]["status"] == "approved":
                seen.add(i); out.append(by[i])
        return out
    a = take(finds or res)
    b = take(model + res)
    pend = [x for x in by.values() if x["status"] == "proposed" and (not card or x["card_id"] in (card, None))]
    seen |= {x["id"] for x in pend}
    rest = [x for x in by.values() if x["id"] not in seen and x["status"] == "approved"]
    return {"service": meta.get("service"), "card_id": card, "version": cur["version"] if cur else meta.get("version"),
            "finds": a, "model": b, "pending": pend, "others": rest, "as_of": now_iso()}


def _similar(name: str, rows) -> list[dict]:
    k = name.strip().lower()
    out = []
    for r in rows:
        words = [r["name"], *(r["aliases"] or [])]
        best = max(difflib.SequenceMatcher(None, k, w.lower()).ratio() for w in words)
        if best >= 0.6 or any(k and (k in w.lower() or w.lower() in k) for w in words):
            out.append({"id": r["id"], "name": r["name"], "status": r["status"], "parent": r["parent_name"]})
    return out[:4]


@router.get("/classes/similar")
async def similar_classes(request: Request, name: str = ""):
    """새 클래스를 더하기 전에 — 같은 이름(다른 이름 포함) · 비슷한 이름(같은 뜻이면 그것을 고르게). 화면은 이것을 먼저 부른다(오류 응답 없이)."""
    require(principal(request), lx=True, roles=("staff", "admin"))
    nm = " ".join(name.split())[:40]
    if not nm:
        return {"same": None, "similar": []}
    async with db(realm="lx") as conn:
        rows = await conn.fetch("SELECT c.id, c.name, c.aliases, c.status, p.name AS parent_name FROM classes c LEFT JOIN classes p ON p.id=c.parent_id "
                                "WHERE c.status IN ('approved','proposed')")
    same = next((r for r in rows if r["name"].lower() == nm.lower() or nm.lower() in [a.lower() for a in r["aliases"] or []]), None)
    return {"same": {"id": same["id"], "name": same["name"], "status": same["status"]} if same else None,
            "similar": _similar(nm, rows)}


MAX_PROPOSED = 3                                        # 서비스당 승인 대기 상한(남발 막기)


@router.post("/classes", status_code=201)
async def add_class(request: Request, body: dict):
    p = require(principal(request), lx=True, roles=("staff", "admin"))
    name = " ".join(str(body.get("name") or "").split())[:40]
    kind = str(body.get("kind") or "object")
    parent = str(body.get("parent_id") or "") or None
    test = bool(body.get("test"))
    if not name:
        raise ApiError("bad_request", "클래스 이름을 적어 주세요")
    if kind not in ("detail", "object"):
        raise ApiError("bad_request", "세부 · 새 물체 중 하나를 고르세요")
    if kind == "detail" and not parent:
        raise ApiError("bad_request", "세부는 위 클래스를 골라 주세요")
    if kind == "object":
        parent = None
    card = str(body.get("card_id") or "") or None
    from_edit = None
    async with db(realm="lx") as conn:
        if not card and body.get("set"):
            from .ximap import _meta, _resolve
            rs = await _resolve(p, str(body["set"]))
            card = (await _meta(conn, rs["job_id"])).get("card_id")
            from_edit = rs["job_id"]
        if parent:
            pr = await conn.fetchrow("SELECT id, status FROM classes WHERE id=$1", parent)
            if not pr or pr["status"] != "approved":
                raise ApiError("bad_request", "위 클래스는 승인된 클래스여야 합니다")
        rows = await conn.fetch("SELECT c.id, c.name, c.aliases, c.status, p.name AS parent_name FROM classes c LEFT JOIN classes p ON p.id=c.parent_id "
                                "WHERE c.status IN ('approved','proposed')")
        same = [r for r in rows if r["name"].lower() == name.lower() or name.lower() in [a.lower() for a in r["aliases"] or []]]
        if same:
            raise ApiError("conflict", f"'{same[0]['name']}' 클래스가 이미 있습니다 — 목록에서 고르세요", {"similar": _similar(name, same)}, 409)
        sim = _similar(name, rows)
        if sim and not body.get("force"):
            raise ApiError("conflict", "비슷한 클래스가 있습니다 — 같은 뜻이면 그것을 고르세요", {"similar": sim}, 409)
        admin = p.role == "admin"
        if not admin and card:
            n = await conn.fetchval("SELECT count(*) FROM classes WHERE status='proposed' AND card_id=$1 AND NOT test", card)
            if n >= MAX_PROPOSED and not test:
                raise ApiError("conflict", f"이 서비스에 승인 대기 클래스가 {MAX_PROPOSED}개 있습니다 — 관리자 결정 뒤 더할 수 있습니다", None, 409)
        cid = "cl_" + secrets.token_hex(5)
        await conn.execute("INSERT INTO classes(id, name, parent_id, kind, status, card_id, created_by, created_from, test, decided_by, decided_at) "
                           "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
                           cid, name, parent, kind, "approved" if admin else "proposed", card, p.user_id, from_edit, test,
                           p.user_id if admin else None, dt.datetime.now(KST) if admin else None)
        if admin:
            await conn.execute("INSERT INTO class_labels(label, class_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", name, cid)
        await audit(conn, p, "class.add", cid, None, {"name": name, "kind": kind, "parent": parent, "card": card, "test": test})
        r = await conn.fetchrow(CLS_SELECT + " WHERE c.id=$1", cid)
    return {"class": _cls_row(r)}


@router.post("/classes/{cid}/decide")
async def decide_class(cid: str, request: Request, body: dict):
    p = require(principal(request), admin=True)
    action = str(body.get("action") or "")
    note = (str(body.get("note") or "").strip()[:300]) or None
    if action not in ("approve", "merge", "reject"):
        raise ApiError("bad_request", "action = approve · merge · reject")
    async with db(realm="lx") as conn:
        c = await conn.fetchrow("SELECT * FROM classes WHERE id=$1", cid)
        if not c:
            raise ApiError("not_found", "그 클래스가 없습니다")
        if c["status"] != "proposed":
            raise ApiError("conflict", "승인 대기 클래스만 결정할 수 있습니다", None, 409)
        into = None
        if action == "approve":
            await conn.execute("UPDATE classes SET status='approved', decided_by=$2, decided_at=now(), decide_note=$3 WHERE id=$1", cid, p.user_id, note)
            await conn.execute("INSERT INTO class_labels(label, class_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", c["name"], cid)
            # 세부 → 그 위 클래스를 찾는 서비스의 지금 판에 '배우는 중 · 나누기'로 붙는다(학습 뒤 승인된 새 판에서 찾음)
            if c["parent_id"]:
                for r in await conn.fetch("SELECT DISTINCT card_id FROM card_classes WHERE class_id=$1", c["parent_id"]):
                    cur = await _cur_version(conn, r["card_id"])
                    if cur:
                        await conn.execute("INSERT INTO card_classes(card_id, version, class_id, state, how) VALUES ($1,$2,$3,'learning','split') "
                                           "ON CONFLICT DO NOTHING", r["card_id"], cur["version"], cid)
        elif action == "merge":
            into = str(body.get("into") or "")
            t = await conn.fetchrow("SELECT id, name, status FROM classes WHERE id=$1", into)
            if not t or t["status"] != "approved" or t["id"] == cid:
                raise ApiError("bad_request", "합칠 곳은 승인된 다른 클래스여야 합니다")
            await conn.execute("UPDATE classes SET status='merged', merged_into=$2, decided_by=$3, decided_at=now(), decide_note=$4 WHERE id=$1",
                               cid, into, p.user_id, note)
            await conn.execute("UPDATE classes SET aliases = array_append(aliases, $2) WHERE id=$1 AND NOT ($2 = ANY(aliases))", into, c["name"])
            await conn.execute("INSERT INTO class_labels(label, class_id) VALUES ($1,$2) ON CONFLICT (label) DO UPDATE SET class_id=EXCLUDED.class_id", c["name"], into)
            # 고친 기록 · 고친 결과가 합친 클래스로 옮겨 간다(이름이 바뀌어도 이어짐)
            await conn.execute("UPDATE detections d SET cls=$3 FROM result_edits e WHERE e.cls_after_id=$1 AND e.undone_at IS NULL AND d.id=e.det_id AND d.cls=$2",
                               cid, c["name"], t["name"])
            await conn.execute("UPDATE result_edits SET cls_after_id=$2 WHERE cls_after_id=$1", cid, into)
        else:
            await conn.execute("UPDATE classes SET status='rejected', decided_by=$2, decided_at=now(), decide_note=$3 WHERE id=$1", cid, p.user_id, note)
        await audit(conn, p, "class.decide", cid, {"status": c["status"]}, {"action": action, "into": into, "note": note})
        r = await conn.fetchrow(CLS_SELECT + " WHERE c.id=$1", cid)
    return {"class": _cls_row(r)}


@router.delete("/classes/{cid}")
async def drop_test_class(cid: str, request: Request):
    """시험 정리 — 시험 표시 클래스와 그 클래스를 가리키던 시험 고친 기록의 클래스 표시를 지운다."""
    p = require(principal(request), admin=True)
    async with db(realm="lx") as conn:
        c = await conn.fetchrow("SELECT id, test FROM classes WHERE id=$1", cid)
        if not c:
            raise ApiError("not_found", "그 클래스가 없습니다")
        if not c["test"]:
            raise ApiError("forbidden", "시험 표시 클래스만 지울 수 있습니다")
        if await conn.fetchval("SELECT 1 FROM result_edits WHERE (cls_after_id=$1 OR cls_before_id=$1) AND NOT test", cid):
            raise ApiError("conflict", "실제 고친 기록이 이 클래스를 가리킵니다", None, 409)
        await conn.execute("UPDATE result_edits SET cls_after_id=NULL WHERE cls_after_id=$1", cid)
        await conn.execute("UPDATE result_edits SET cls_before_id=NULL WHERE cls_before_id=$1", cid)
        await conn.execute("DELETE FROM card_classes WHERE class_id=$1", cid)
        await conn.execute("DELETE FROM class_labels WHERE class_id=$1", cid)
        await conn.execute("UPDATE classes SET merged_into=NULL WHERE merged_into=$1", cid)
        await conn.execute("DELETE FROM classes WHERE id=$1", cid)
        await audit(conn, p, "class.drop_test", cid, None, None)
    return {"ok": True}


# ── 데이터하우스 ───────────────────────────────────────────────────────────
@router.get("/datahouse/classes")
async def datahouse_classes(request: Request):
    p = require(principal(request), lx=True)
    async with db(realm="lx") as conn:
        await sync_models(conn)
        rows = await conn.fetch(CLS_SELECT + " WHERE c.status IN ('approved','proposed') ORDER BY c.name")
        smp = await conn.fetch("SELECT sc.class_id, s.id, s.class_images, s.n_images, s.names FROM sample_classes sc JOIN train_samples s ON s.id = sc.sample_id")
        lab = {r["id"]: [] for r in rows}
        for r in await conn.fetch("SELECT label, class_id FROM class_labels"):
            lab.setdefault(r["class_id"], []).append(r["label"])
        edits = {r["k"]: r for r in await conn.fetch(
            f"SELECT coalesce(e.cls_after_id, e.cls_before_id) AS k, count(*) FILTER (WHERE {LEARNABLE}) AS n, "
            f"count(*) FILTER (WHERE {PENDING}) AS np, max(e.at) FILTER (WHERE {LEARNABLE}) AS last "
            f"{EDITS_FROM} GROUP BY 1")}
        svc = {}
        for r in await conn.fetch("SELECT cc.class_id, cc.state, cc.card_id, cc.version, c.name FROM card_classes cc JOIN cards c ON c.id = cc.card_id"):
            cur = await _cur_version(conn, r["card_id"])
            if cur and cur["version"] == r["version"]:
                svc.setdefault(r["class_id"], []).append({"card_id": r["card_id"], "name": _ko(r["name"]), "state": r["state"]})
        nmodels = {r["class_id"]: r["n"] for r in await conn.fetch(
            "SELECT mc.class_id, count(DISTINCT mc.model_id) AS n FROM model_classes mc JOIN models m ON m.id = mc.model_id "
            "WHERE m.status = 'registered' AND mc.class_id IS NOT NULL GROUP BY 1")}
        tot = await count_units(conn)
        npend_e = int(await conn.fetchval(f"SELECT count(*) {EDITS_FROM} WHERE {PENDING}") or 0)
    items = []
    for r in rows:
        x = _cls_row(r)
        imgs, sets = 0, 0
        names = set(lab.get(r["id"], [])) | {r["name"]}
        for s in smp:
            if s["class_id"] != r["id"]:
                continue
            ci = s["class_images"] if isinstance(s["class_images"], dict) else json.loads(s["class_images"] or "{}")
            imgs += sum(int(v) for k, v in (ci or {}).items() if k in names)
            sets += 1
        e = edits.get(r["id"])
        x.update({"samples": env(imgs, "count", "measured", "올린 학습 데이터 묶음에서 이 클래스가 든 그림"),
                  "sample_sets": env(sets, "count", "recorded", "학습 데이터 묶음"),
                  "edits": units_env(int(e["n"]) if e else 0), "edits_pending": env(int(e["np"]) if e else 0, "count", "recorded", "승인 대기 클래스로 고친 것"),
                  "last_edit": _iso(e["last"]) if e else None, "services": svc.get(r["id"], []),
                  "models": env(int(nmodels.get(r["id"], 0)), "count", "recorded", "등록된 AI 모델")})
        items.append(x)
    return {"items": items, "edits": units_env(tot), "edits_pending": env(npend_e, "count", "recorded", "승인 대기 클래스로 고친 것"),
            "pending": env(sum(1 for x in items if x["status"] == "proposed"), "count", "recorded", "승인 대기 클래스"),
            "unit": UNIT, "can_decide": p.role == "admin", "as_of": now_iso()}


@router.get("/datahouse/units")
async def datahouse_units(request: Request, card: str = "", project: str = ""):
    """학습 화면 '학습 데이터' 블록의 선택지 — 이 서비스(또는 프로젝트의 서비스)에서 XI맵으로 고친 것 n건(학습에 넣는 것만)."""
    require(principal(request), lx=True)
    async with db(realm="lx") as conn:
        if not card and project:
            card = await conn.fetchval("SELECT ref FROM project_links WHERE project_id=$1 AND kind='card' LIMIT 1", project) or ""
        n = await count_units(conn, card_id=card) if card else 0
        npend = int(await conn.fetchval(f"SELECT count(*) {EDITS_FROM} WHERE {PENDING} AND e.card_id=$1", card) or 0) if card else 0
    return {"card_id": card or None, "units": units_env(n), "pending": env(npend, "count", "recorded", "승인 대기 클래스로 고친 것"), "unit": UNIT, "as_of": now_iso()}


ACT = {"delete": "지움", "reclass": "클래스 바꿈", "reshape": "모양 고침", "add": "새로 그림", "memo": "메모"}


@router.get("/datahouse/edits")
async def datahouse_edits(request: Request, cls: str = "", card: str = "", limit: int = 50, test: int = 0):
    require(principal(request), lx=True)
    q, a = ["e.undone_at IS NULL", "e.action <> 'memo'"], []
    if not test:
        q.append("NOT e.test")
    if cls:
        a.append(cls); q.append(f"(e.cls_after_id = ${len(a)} OR e.cls_before_id = ${len(a)})")
    if card:
        a.append(card); q.append(f"e.card_id = ${len(a)}")
    a.append(max(1, min(int(limit), 200)))
    async with db(realm="lx") as conn:
        rows = await conn.fetch(
            f"SELECT e.id, e.action, e.at, e.test, e.sgg_cd, e.card_id, cb.name AS before, ca.name AS after, ca.status AS ast, u.name AS who, c.name AS cname "
            f"FROM result_edits e LEFT JOIN classes ca ON ca.id = e.cls_after_id LEFT JOIN classes cb ON cb.id = e.cls_before_id "
            f"LEFT JOIN lx_users u ON u.id = e.by_user LEFT JOIN cards c ON c.id = e.card_id WHERE {' AND '.join(q)} ORDER BY e.at DESC LIMIT ${len(a)}", *a)
    from .regions import regions_base
    try:
        names = {r.get("sgg_cd"): r.get("name") for r in regions_base()[0]}
    except Exception:  # noqa: BLE001
        names = {}
    return {"items": [{"id": r["id"], "action": ACT.get(r["action"], r["action"]), "at": _iso(r["at"]), "who": r["who"] or "LX 직원",
                       "service": _ko(r["cname"]) if r["cname"] else None, "region": names.get(r["sgg_cd"]),
                       "before": r["before"], "after": r["after"], "pending": r["ast"] == "proposed", "test": r["test"]} for r in rows],
            "as_of": now_iso()}


# ── XI 재학습 · 배포 관리 ───────────────────────────────────────────────────
SET_KEY = "core.retrain"
DEF = {"mode": "auto", "quiet_start": "22:00", "quiet_end": "06:00", "weekend": True, "min_new": 200,
       "tile_quiet_min": 30, "submit": False}     # tile_quiet_min = 고친 뒤 이만큼 조용하면 1장 · submit = 대기열 넣기 켬(환경 LX_RETRAIN_SUBMIT=1 도 켬)
LAST: dict = {"tick": None, "decisions": []}


async def settings(conn) -> dict:
    v = await conn.fetchval("SELECT value FROM lx_settings WHERE key=$1", SET_KEY)
    v = json.loads(v) if isinstance(v, str) else (v or {})
    return {**DEF, **v}


def _st_out(st: dict) -> dict:
    return {**st, "min_new": env(int(st["min_new"]), "count", "recorded", "재학습 기준(관리자 설정)"),
            "tile_quiet_min": env(int(st.get("tile_quiet_min", 30)), "min", "recorded", "고친 뒤 이만큼 조용하면 1장(관리자 설정)")}


def _hm(s: str) -> int:
    h, m = str(s).split(":")
    return int(h) * 60 + int(m)


def quiet(st: dict, at: dt.datetime) -> bool:
    """쉬는 시간인가 — 시간대(밤을 넘어가도) · 주말 하루 종일."""
    at = at.astimezone(KST)
    if st.get("weekend") and at.weekday() >= 5:
        return True
    a, b, t = _hm(st["quiet_start"]), _hm(st["quiet_end"]), at.hour * 60 + at.minute
    return (a <= t < b) if a < b else (t >= a or t < b)


async def busy_gpu(conn) -> list[str]:
    """학습 장비를 쓰는 다른 작업(학습 · AI 분석 · 전국 분석 등 GPU 풀) — 있으면 학습을 넣지 않고 다음 차례로(전력 규칙 · 한 장)."""
    rows = await conn.fetch("SELECT kind, count(*) AS n FROM jobs WHERE state IN ('queued','running') AND pool <> 'cpu' AND NOT coalesce(test,false) GROUP BY kind")
    out = [f"{r['kind']} {r['n']}" for r in rows]
    try:
        from .jobs import power_budget
        pb = await power_budget()
        if pb.get("hold_reason"):
            out.append("power")
    except Exception:  # noqa: BLE001
        pass
    return out


async def _project(conn, card_id: str) -> dict | None:
    from .projects import project_of_card
    return await project_of_card(conn, card_id)


async def _verdict(conn, card_id: str, cur) -> dict | None:
    """이 서비스의 가장 최근 다시 학습 판 — 같은 검증 묶음에서 지금 판 모델보다 나아졌나(나아진 것만 배포 신청 후보)."""
    if not cur or not cur["model_ids"]:
        return None
    base = cur["model_ids"][0]
    names = [r["name"] for r in await conn.fetch("SELECT c.name FROM card_classes cc JOIN classes c ON c.id=cc.class_id "
                                                  "WHERE cc.card_id=$1 AND cc.version=$2 AND cc.state='finds'", card_id, cur["version"])]
    labels = {r["label"] for r in await conn.fetch("SELECT l.label FROM class_labels l JOIN card_classes cc ON cc.class_id=l.class_id "
                                                    "WHERE cc.card_id=$1 AND cc.version=$2 AND cc.state='finds'", card_id, cur["version"])}
    rows = await conn.fetch(
        "SELECT m.id, m.status, m.classes, m.created_at, j.options FROM models m JOIN jobs j ON j.id = m.train_job "
        "WHERE j.options->>'base_model' = $1 AND m.status IN ('candidate','pending','registered') AND m.created_at > coalesce($2, '2000-01-01'::timestamptz) "
        "AND (j.options->'retrain'->>'card_id' = $3 OR j.options->'retrain' IS NULL) ORDER BY m.created_at DESC", base, cur["approved_at"], card_id)
    for r in rows:
        mc = json.loads(r["classes"]) if isinstance(r["classes"], str) else (r["classes"] or [])
        if not mc or not set(mc) <= labels:
            continue
        from .project_train import _evals, _same_bundle
        s = _same_bundle(_evals(), r["id"], list(mc), base)
        if not s or "base" not in s:
            return {"model": r["id"], "at": _iso(r["created_at"]), "status": r["status"], "value": None, "base": None, "better": None,
                    "classes": names}
        v, b = s["value"]["value"], s["base"]["value"]["value"]
        return {"model": r["id"], "at": _iso(r["created_at"]), "status": r["status"], "value": s["value"], "base": s["base"]["value"],
                "better": v > b, "classes": names}
    return None


async def retrain_gate(conn, model_id: str) -> str | None:
    """XI 재학습으로 만든 판은 같은 검증 묶음에서 나아진 경우만 배포 신청 후보 — 아니면 그 까닭(배포 신청이 부른다)."""
    o = await conn.fetchval("SELECT j.options FROM models m JOIN jobs j ON j.id=m.train_job WHERE m.id=$1", model_id)
    o = json.loads(o) if isinstance(o, str) else (o or {})
    rt = o.get("retrain") if isinstance(o, dict) else None
    if not rt:
        return None
    cur = await _cur_version(conn, rt.get("card_id") or "")
    vd = await _verdict(conn, rt.get("card_id") or "", cur)
    if not vd or vd["model"] != model_id or not vd["better"]:
        return "같은 검증 묶음에서 지금 판보다 나아지지 않아 배포 신청 후보가 아닙니다"
    return None


async def _rows(conn, st: dict, test: bool = False) -> list[dict]:
    """서비스마다 줄 — 지금 판 · 쌓인 고친 것 · 기준 · 방식 · 상태 · 새 클래스(세부 → 나누기)."""
    modes = {r["card_id"]: r["mode"] for r in await conn.fetch("SELECT card_id, mode FROM retrain_services")}
    cards = await conn.fetch("SELECT c.id, c.name FROM cards c WHERE EXISTS (SELECT 1 FROM card_versions v WHERE v.card_id=c.id AND v.approved_at IS NOT NULL "
                             "AND cardinality(v.model_ids) > 0) ORDER BY c.id")
    out = []
    for c in cards:
        cur = await _cur_version(conn, c["id"])
        if not cur or not cur["model_ids"]:
            continue
        if not await conn.fetchval("SELECT 1 FROM models WHERE id=$1 AND weights_uri IS NOT NULL", cur["model_ids"][0]):
            continue                                       # 가중치가 없는 모델(지표 · 규칙)은 다시 학습하지 않는다
        last = await conn.fetchrow("SELECT * FROM retrain_runs WHERE card_id=$1 AND state='queued' AND NOT test ORDER BY at DESC LIMIT 1", c["id"])
        from .train_tiles import count_tiles
        n = await count_tiles(conn, card_id=c["id"], since=last["units_until"] if last else None, test=test)
        job = await conn.fetchrow("SELECT id, state FROM jobs WHERE id=$1", last["job_id"]) if last and last["job_id"] else None
        detail = [dict(r) for r in await conn.fetch(
            "SELECT c.id, c.name, c.status FROM card_classes cc JOIN classes c ON c.id=cc.class_id WHERE cc.card_id=$1 AND cc.version=$2 AND cc.how='split'",
            c["id"], cur["version"])]
        pend = [dict(r) for r in await conn.fetch(
            "SELECT c.id, c.name, c.kind, c.status FROM classes c WHERE c.status='proposed' AND c.card_id=$1 AND NOT c.test", c["id"])]
        vd = await _verdict(conn, c["id"], cur)
        pr = await _project(conn, c["id"])
        mode = modes.get(c["id"], st["mode"])
        if job and job["state"] in ("queued", "running"):
            state = ("live", "학습 중" if job["state"] == "running" else "학습 대기열")
        elif vd and vd["better"] and vd["model"] not in cur["model_ids"]:
            state = ("ok", "나아짐 · 배포 신청 후보")
        elif vd and vd["better"] is False and vd["model"] not in cur["model_ids"]:
            state = ("down", "지금 판보다 낮음 · 후보로 남음")
        elif n >= st["min_new"]:
            state = ("now", "기준 닿음 · 쉬는 시간에 학습" if mode == "auto" else "기준 닿음 · 수동")
        else:
            state = ("", "쌓는 중")
        out.append({"card_id": c["id"], "service": _ko(c["name"]), "version": cur["version"],
                    "units": tiles_env(n), "min_new": env(int(st["min_new"]), "count", "recorded", "재학습 기준(관리자 설정)"),
                    "mode": mode, "state": state[1], "tone": state[0],
                    "split": [{"id": d["id"], "name": d["name"]} for d in detail],
                    "pending": [{"id": d["id"], "name": d["name"], "kind": d["kind"]} for d in pend],
                    "verdict": vd, "project": {"id": pr["id"], "name": pr["name"], "lead": pr["lead_id"]} if pr else None})
    return out


async def _candidates(conn) -> list[dict]:
    """승인된 새 물체(위 클래스 없음 · 씨앗이 아닌 것) → 새 모델 프로젝트 후보(결정 5 ⓐ). 세부는 위 클래스 서비스 줄의 '나누기'로."""
    rows = await conn.fetch(CLS_SELECT + " WHERE c.kind='object' AND c.status='approved' AND c.created_by IS NOT NULL ORDER BY c.decided_at DESC")
    out = []
    for r in rows:
        n = await count_units(conn, class_id=r["id"])
        has_model = await conn.fetchval("SELECT 1 FROM model_classes WHERE class_id=$1", r["id"])
        if has_model:
            continue
        out.append({"id": r["id"], "name": r["name"], "units": units_env(n), "test": r["test"], "at": _iso(r["decided_at"])})
    return out


def _tonight(rows: list[dict], st: dict) -> list[dict]:
    """오늘 밤 순서 — 학습 자리 하나를 차례로(기준 닿은 자동 서비스 → 세부 나누기). 전국 분석 등 다른 고부하 작업이 있으면 그 뒤."""
    out = []
    for r in rows:
        if r["mode"] == "auto" and r["units"]["value"] >= st["min_new"] and r["tone"] not in ("live",):
            out.append({"card_id": r["card_id"], "service": r["service"], "what": "나누기 학습" if r["split"] else "다시 학습"})
    return out


@router.get("/retrain")
async def retrain_view(request: Request):
    p = require(principal(request), lx=True)
    async with db(realm="lx") as conn:
        await sync_models(conn)
        st = await settings(conn)
        rows = await _rows(conn, st)
        cands = await _candidates(conn)
        busy = await busy_gpu(conn)
        runs = await conn.fetch("SELECT r.*, c.name AS cname FROM retrain_runs r LEFT JOIN cards c ON c.id=r.card_id ORDER BY r.at DESC LIMIT 10")
    if p.role != "admin":                                  # LX 직원(프로젝트장)은 자기 서비스 줄만
        rows = [r for r in rows if r["project"] and r["project"]["lead"] == p.user_id]
    now = dt.datetime.now(KST)
    return {"settings": _st_out(st), "quiet_now": quiet(st, now), "busy": bool(busy), "services": rows, "candidates": cands,
            "tonight": _tonight(rows, st), "unit": TILE_UNIT,
            "runs": [{"id": r["id"], "service": _ko(r["cname"]), "mode": r["mode"], "state": r["state"], "why": r["why"], "at": _iso(r["at"]),
                      "units": tiles_env(r["n_tiles"], "그때 넣은 학습 데이터") if r["n_tiles"] is not None else units_env(r["n_units"], "그때 센 고친 것"),
                      "by": r["by_user"], "test": r["test"]} for r in runs],
            "last_tick": LAST["tick"], "can_manage": p.role == "admin", "as_of": now_iso()}


def _hm_ok(s) -> str:
    s = str(s or "")
    try:
        h, m = s.split(":")
        assert 0 <= int(h) < 24 and 0 <= int(m) < 60
    except Exception:  # noqa: BLE001
        raise ApiError("bad_request", "시각은 22:00 처럼 적어 주세요")
    return f"{int(h):02d}:{int(m):02d}"


@router.put("/retrain/settings")
async def put_settings(request: Request, body: dict):
    p = require(principal(request), admin=True)
    async with db(realm="lx") as conn:
        st = await settings(conn)
        before = dict(st)
        if "mode" in body:
            if body["mode"] not in ("auto", "manual"):
                raise ApiError("bad_request", "mode = auto · manual")
            st["mode"] = body["mode"]
        if "quiet_start" in body:
            st["quiet_start"] = _hm_ok(body["quiet_start"])
        if "quiet_end" in body:
            st["quiet_end"] = _hm_ok(body["quiet_end"])
        if "weekend" in body:
            st["weekend"] = bool(body["weekend"])
        if "tile_quiet_min" in body:
            n = int(body["tile_quiet_min"] or 0)
            if not 1 <= n <= 24 * 60:
                raise ApiError("bad_request", "조용한 시간은 1분 이상 하루 이하로 적어 주세요")
            st["tile_quiet_min"] = n
        if "submit" in body:
            st["submit"] = bool(body["submit"])
        if "min_new" in body:
            n = int(body["min_new"] or 0)
            if not 1 <= n <= 100000:
                raise ApiError("bad_request", "기준은 1 이상이어야 합니다")
            st["min_new"] = n
        await conn.execute("INSERT INTO lx_settings(key, value, updated_by, updated_at) VALUES ($1,$2,$3,now()) "
                           "ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_by=EXCLUDED.updated_by, updated_at=now()",
                           SET_KEY, st, p.user_id)
        await audit(conn, p, "retrain.settings", SET_KEY, before, st)
    return {"settings": _st_out(st)}


@router.put("/retrain/services/{card_id}")
async def put_service(card_id: str, request: Request, body: dict):
    p = require(principal(request), admin=True)
    mode = str(body.get("mode") or "")
    if mode not in ("auto", "manual"):
        raise ApiError("bad_request", "mode = auto · manual")
    async with db(realm="lx") as conn:
        if not await conn.fetchval("SELECT 1 FROM cards WHERE id=$1", card_id):
            raise ApiError("not_found", "그 서비스가 없습니다")
        old = await conn.fetchval("SELECT mode FROM retrain_services WHERE card_id=$1", card_id)
        await conn.execute("INSERT INTO retrain_services(card_id, mode, updated_by) VALUES ($1,$2,$3) "
                           "ON CONFLICT (card_id) DO UPDATE SET mode=EXCLUDED.mode, updated_by=EXCLUDED.updated_by, updated_at=now()", card_id, mode, p.user_id)
        await audit(conn, p, "retrain.service", card_id, {"mode": old}, {"mode": mode})
    return {"card_id": card_id, "mode": mode}


def decide(rows: list[dict], st: dict, busy: list[str], at: dt.datetime, manual_card: str | None = None) -> list[dict]:
    """스케줄러 판단(순수 함수 · 시험이 그대로 부른다). 학습 자리 하나 — 한 번에 하나만 'queue'."""
    out, taken = [], False
    q = quiet(st, at)
    for r in rows:
        n, need = r["units"]["value"], st["min_new"]
        man = manual_card == r["card_id"]
        if r["tone"] == "live":
            why = ("live", "이미 학습 대기열 · 학습 중")
        elif not man and r["mode"] == "manual":
            why = ("manual", "수동 — 사람이 누를 때만")
        elif not man and n < need:
            why = ("below", f"기준 미달 {n}/{need}")
        elif man and n < 1:
            why = ("below", "새 학습 데이터가 없습니다")
        elif not man and not q:
            why = ("not_quiet", "쉬는 시간이 아님")
        elif busy:
            why = ("busy", "다른 고부하 작업이 있어 다음 차례")
        elif not r["project"]:
            why = ("no_project", "이 서비스의 프로젝트가 없음")
        elif taken:
            why = ("wait_slot", "학습 자리 하나 — 다음 차례")
        else:
            why = ("queue", "대기열에 넣음")
            taken = True
        out.append({"card_id": r["card_id"], "service": r["service"], "mode": "split" if r["split"] else "same",
                    "class_id": r["split"][0]["id"] if r["split"] else None, "n": n, "code": why[0], "why": why[1]})
    return out


import os  # noqa: E402

from . import config  # noqa: E402

SUBMIT = os.environ.get("LX_RETRAIN_SUBMIT") == "1"          # 또는 설정 core.retrain.submit(관리자)


class _Req:
    def __init__(self, p: Principal):
        self.state = SimpleNamespace(principal=p)


async def _enqueue(conn_rows: dict, d: dict, *, test: bool, by: str, submit: bool | None = None) -> dict:
    """대기열에 학습 한 건 — 지금 판 모델에서 이어 학습(세부면 나누기). 학습 데이터 = 지난 학습 데이터(프로젝트 표본) + 이 서비스의 XI맵 칸(1장이 된 것).
    제출은 그 서비스 프로젝트장 이름으로 같은 작업 길(/jobs) · 전력 규칙은 서버 · 학습 장비 한 장."""
    from .jobs import submit as submit_job
    from .train_tiles import run_dataset
    r = conn_rows[d["card_id"]]
    async with db(realm="lx") as conn:
        cur = await _cur_version(conn, d["card_id"])
        smp = await conn.fetchval("SELECT s.id FROM project_links l JOIN train_samples s ON s.id=l.ref WHERE l.project_id=$1 AND l.kind='sample' "
                                  "ORDER BY s.created_at DESC LIMIT 1", r["project"]["id"])
        tpl = await templates(conn)
        until = await conn.fetchval("SELECT now()")
        st = await settings(conn)
        tiles = [dict(x) for x in await conn.fetch("SELECT id, names, img_path, lbl_path FROM train_tiles WHERE card_id=$1 AND state='made' AND test=$2 "
                                                   "ORDER BY made_at", d["card_id"], test)]
    on = (SUBMIT or bool(st.get("submit"))) if submit is None else submit
    cfg = (tpl.get(r["service"]) or tpl.get("기본") or {}).get("params") or {}
    rid = "rt_" + secrets.token_hex(5)
    job_id, state, why = None, "queued", None
    if not on:
        state, why = "held", "대기열 넣기가 꺼져 있습니다(관리자 설정)"
    elif not tiles:
        state, why = "held", "1장이 된 학습 데이터가 없습니다"
    else:
        from .training import sample_yaml
        base = await asyncio.to_thread(sample_yaml, smp) if smp and not test else None     # 시험은 칸만(지난 학습 데이터를 끌어오지 않음)
        run_dir = config.DATA_ROOT / "training" / "retrain-auto" / (rid + ("-test" if test else ""))
        ds = await asyncio.to_thread(run_dataset, run_dir, tiles, base)
        body = {"kind": "train", "base_model": cur["model_ids"][0], "samples": ds["yaml"].as_posix(), "priority": 2, "test": test,
                "project_id": r["project"]["id"], "label": f"XI 재학습 · {r['service']}",
                "options": {"epochs": int(cfg.get("epochs", 3)), "imgsz": int(cfg.get("imgsz", 640)), "batch": int(cfg.get("batch", 4)),
                            "project_id": r["project"]["id"], "task_name": r["service"],
                            "retrain": {"card_id": d["card_id"], "mode": d["mode"], "class_id": d["class_id"], "units": d["n"], "tiles": len(tiles),
                                        "base_sample": smp, "unit": TILE_UNIT["id"], "until": until.isoformat()}}}
        try:
            j = await submit_job(body, _Req(Principal(realm="lx", role="staff", user_id=r["project"]["lead"])))
            job_id = j["job"]["id"]
        except ApiError as e:
            state, why = "held", e.message
    async with db(realm="lx") as conn:
        await conn.execute("INSERT INTO retrain_runs(id, card_id, mode, class_id, n_units, units_until, job_id, state, why, by_user, test, n_tiles) "
                           "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)", rid, d["card_id"], d["mode"], d["class_id"], d["n"], until, job_id, state, why, by,
                           test, len(tiles))
    return {"run": rid, "job": job_id, "state": state, "why": why, "tiles": tiles_env(len(tiles), "이번 학습에 넣은 학습 데이터")}


async def tick(*, dry: bool = False, at: dt.datetime | None = None, test: bool = False, manual_card: str | None = None,
               by: str = "auto", rows_override: list[dict] | None = None, busy_override: list[str] | None = None,
               st_override: dict | None = None, submit: bool | None = None) -> dict:
    """스케줄러 한 번 — 기준에 닿은 자동 서비스를 쉬는 시간에 대기열로(학습 장비 한 장 · 다른 고부하 작업과 겹치지 않게)."""
    at = at or dt.datetime.now(KST)
    async with db(realm="lx") as conn:
        st = {**(await settings(conn)), **(st_override or {})}
        rows = rows_override if rows_override is not None else await _rows(conn, st, test=bool(test and submit is not None))
        busy = busy_override if busy_override is not None else await busy_gpu(conn)
    if manual_card:
        rows = [r for r in rows if r["card_id"] == manual_card]
    ds = decide(rows, st, busy, at, manual_card)
    by_card = {r["card_id"]: r for r in rows}
    for d in ds:
        if d["code"] != "queue":
            continue
        if dry:
            d["result"] = {"state": "dry"}
            async with db(realm="lx") as conn:
                await conn.execute("INSERT INTO retrain_runs(id, card_id, mode, class_id, n_units, units_until, state, why, by_user, test) "
                                   "VALUES ($1,$2,$3,$4,$5,now(),'dry','시험 — 대기열에 넣지 않음',$6,true)",
                                   "rt_" + secrets.token_hex(5), d["card_id"], d["mode"], d["class_id"], d["n"], by)
        else:
            d["result"] = await _enqueue(by_card, d, test=test, by=by, submit=submit)
    out = {"at": at.isoformat(timespec="seconds"), "quiet": quiet(st, at), "busy": busy, "decisions": ds, "dry": dry}
    if not dry and rows_override is None and not manual_card and not test:
        LAST.update(tick=now_iso(), decisions=ds)
    return out


@router.post("/retrain/tick")
async def tick_api(request: Request, body: dict):
    """관리자 · 시험 — 한 번 돌려 판단을 본다. rows 를 주면(시험) 그 줄로 판단만(dry 강제)."""
    require(principal(request), admin=True)
    at = dt.datetime.fromisoformat(body["at"]) if body.get("at") else None
    if body.get("test_tiles"):                             # 시험 환경 — 시험 칸으로 센 줄 · 기준을 낮춰 · 대기열 넣기까지(시험 작업)
        st = {k: body[k] for k in ("min_new",) if body.get(k) is not None}
        busy = body.get("busy") if isinstance(body.get("busy"), list) else None
        return await tick(at=at, test=True, busy_override=busy, st_override=st, submit=bool(body.get("submit")), by="시험")
    rows = body.get("rows")
    busy = body.get("busy") if isinstance(body.get("busy"), list) else None
    return await tick(dry=bool(body.get("dry")) or rows is not None or busy is not None, at=at, test=True, rows_override=rows, busy_override=busy, by="시험")


@router.post("/retrain/services/{card_id}/now")
async def train_now(card_id: str, request: Request, body: dict | None = None):
    p = require(principal(request), lx=True, roles=("staff", "admin"))
    async with db(realm="lx") as conn:
        pr = await _project(conn, card_id)
    if p.role != "admin" and (not pr or pr["lead_id"] != p.user_id):
        raise ApiError("forbidden", "지금 학습은 이 서비스의 프로젝트장이나 LX 관리자가 합니다")
    dry = bool((body or {}).get("dry"))
    out = await tick(dry=dry, manual_card=card_id, test=bool((body or {}).get("test")) or dry, by=p.user_id or "lx")
    d = next((x for x in out["decisions"] if x["card_id"] == card_id), None)
    if not d:
        raise ApiError("not_found", "다시 학습할 수 있는 서비스가 아닙니다")
    if d["code"] != "queue":
        raise ApiError("conflict", d["why"], {"code": d["code"]}, 409)
    return {"decision": d}


async def loop():
    """5분마다 한 번 — 기동 뒤 저절로. 실패해도 게이트웨이는 그대로."""
    await asyncio.sleep(60)
    while True:
        try:
            from .train_tiles import scan
            async with db(realm="lx") as conn:
                await scan(conn)                           # 고친 기록 → 칸 → 조용해지면 1장(결정 3 ⓐ)
        except Exception as e:  # noqa: BLE001
            print(f"[gateway] 학습 칸 맞추기 실패: {e!r}", flush=True)
        try:
            await tick()
        except Exception as e:  # noqa: BLE001
            print(f"[gateway] retrain tick 실패: {e!r}", flush=True)
        await asyncio.sleep(300)


@router.get("/retrain/tiles")
async def tiles_list(request: Request, card: str = "", test: int = 0, limit: int = 100):
    """XI맵 고친 자리 칸 목록(관리자) — 상태 · 고친 수 · 사람 수 · 테두리 수 · 1장이 된 때. 화면에는 경로를 내지 않는다."""
    require(principal(request), admin=True)
    q, a = ["test=$1"], [bool(test)]
    if card:
        a.append(card); q.append(f"card_id=${len(a)}")
    a.append(max(1, min(int(limit), 500)))
    async with db(realm="lx") as conn:
        rows = await conn.fetch(f"SELECT id, card_id, state, why, n_edits, cardinality(users) AS nu, n_objects, size_m, px, last_edit_at, made_at, version, "
                                f"ST_AsGeoJSON(bbox) AS bbox FROM train_tiles WHERE {' AND '.join(q)} ORDER BY updated_at DESC LIMIT ${len(a)}", *a)
        from .train_tiles import count_tiles
        n = await count_tiles(conn, card_id=card or None, test=bool(test))
    def c(v, what, unit="count"):
        return env(v, unit, "recorded", what) if v is not None else None
    return {"items": [{"id": r["id"], "card_id": r["card_id"], "state": r["state"], "why": r["why"], "edits": c(r["n_edits"], "이 칸에서 고친 것"),
                       "people": c(r["nu"], "고친 사람"), "objects": c(r["n_objects"], "이 칸 테두리"), "size_m": c(float(r["size_m"]), "칸 한 변", "m"),
                       "px": c(r["px"], "조각 화소", "px"), "last_edit": _iso(r["last_edit_at"]), "made": _iso(r["made_at"]),
                       "version": c(r["version"], "다시 만든 차례"), "bbox": json.loads(r["bbox"]) if r["bbox"] else None} for r in rows],
            "made": tiles_env(n), "unit": TILE_UNIT, "as_of": now_iso()}


@router.post("/retrain/tiles/scan")
async def tiles_scan(request: Request, body: dict | None = None):
    """칸 한 번 맞추기(관리자 · 시험 증명용) — test 면 시험 고친 기록만 · quiet_min 으로 조용한 시간을 바꿔 볼 수 있다(시험만)."""
    require(principal(request), admin=True)
    body = body or {}
    test = bool(body.get("test"))
    qm = int(body["quiet_min"]) if test and body.get("quiet_min") is not None else None
    from .train_tiles import scan
    async with db(realm="lx") as conn:
        res = await scan(conn, test=test, quiet_min=qm)
    return {"result": {k: env(v, "min" if k == "quiet_min" else "count", "recorded", f"칸 맞추기 {k}") for k, v in res.items()}, "test": test,
            "as_of": now_iso()}


# ── 학습 서식(업무별 기본 흐름) ─────────────────────────────────────────────
TPL_KEY = "train.templates"
BLOCKS = ("data", "base", "cfg", "train", "eval", "test", "deploy")
MUST = ("data", "base", "cfg", "train")
CAPS = {"epochs": 50, "imgsz": (640, 1280), "batch": (4, 8)}
LOCKED = ["학습 장비 배정(프로젝트 하나에 한 장)", "반복 · 크기 · 장수 상한", "쉬는 시간대", "검증 묶음", "배포 승인"]


async def templates(conn) -> dict:
    v = await conn.fetchval("SELECT value FROM lx_settings WHERE key=$1", TPL_KEY)
    v = json.loads(v) if isinstance(v, str) else (v or {})
    if "기본" not in v:
        v["기본"] = {"blocks": ["data", "base", "cfg", "train", "eval", "deploy"], "params": {"epochs": 3, "imgsz": 640, "batch": 4}}
    for t in v.values():                                   # 옛 이름(cfg) → params(구조 블록)
        if "cfg" in t and "params" not in t:
            t["params"] = t.pop("cfg")
    return v


@router.get("/train-templates")
async def get_templates(request: Request):
    p = require(principal(request), lx=True)
    async with db(realm="lx") as conn:
        v = await templates(conn)
        tasks = [r["task"] for r in await conn.fetch("SELECT DISTINCT task FROM projects WHERE task IS NOT NULL ORDER BY task")]
        row = await conn.fetchrow("SELECT updated_at, updated_by FROM lx_settings WHERE key=$1", TPL_KEY)
    return {"items": v, "tasks": tasks, "blocks": list(BLOCKS), "must": list(MUST), "caps": {"params": {"epochs": CAPS["epochs"], "imgsz": list(CAPS["imgsz"]), "batch": list(CAPS["batch"])}},
            "locked": LOCKED, "updated_at": _iso(row["updated_at"]) if row else None, "can_manage": p.role == "admin", "as_of": now_iso()}


@router.put("/train-templates/{task}")
async def put_template(task: str, request: Request, body: dict):
    p = require(principal(request), admin=True)
    task = task.strip()[:40]
    blocks = [b for b in BLOCKS if b in (body.get("blocks") or [])]
    if not all(b in blocks for b in MUST):
        raise ApiError("bad_request", "학습 데이터 · 기반 모델 · 학습 설정 · 학습 블록은 빠질 수 없습니다")
    if "deploy" in blocks and "eval" not in blocks:
        raise ApiError("bad_request", "배포 신청 앞에는 평가가 있어야 합니다")
    c = body.get("params") or body.get("cfg") or {}
    cfg = {"epochs": max(1, min(int(c.get("epochs", 3)), CAPS["epochs"])),
           "imgsz": int(c.get("imgsz", 640)) if int(c.get("imgsz", 640)) in CAPS["imgsz"] else 640,
           "batch": int(c.get("batch", 4)) if int(c.get("batch", 4)) in CAPS["batch"] else 4}
    async with db(realm="lx") as conn:
        v = await templates(conn)
        before = v.get(task)
        v[task] = {"blocks": blocks, "params": cfg}
        await conn.execute("INSERT INTO lx_settings(key, value, updated_by, updated_at) VALUES ($1,$2,$3,now()) "
                           "ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_by=EXCLUDED.updated_by, updated_at=now()", TPL_KEY, v, p.user_id)
        await audit(conn, p, "train.template", task, before, v[task])
    return {"task": task, "template": v[task]}


@router.delete("/train-templates/{task}")
async def del_template(task: str, request: Request):
    p = require(principal(request), admin=True)
    if task == "기본":
        raise ApiError("bad_request", "기본 흐름은 지울 수 없습니다")
    async with db(realm="lx") as conn:
        v = await templates(conn)
        before = v.pop(task, None)
        await conn.execute("UPDATE lx_settings SET value=$2, updated_by=$3, updated_at=now() WHERE key=$1", TPL_KEY, v, p.user_id)
        await audit(conn, p, "train.template.drop", task, before, None)
    return {"ok": True}
