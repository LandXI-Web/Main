"""LX 직원 대시보드 칸 셋(확인 대장 직원-4 ⓐ) · 내 정보 두 단(직원-5 ⓐ) — 저장 용량 · 내가 돌린 작업 · 공지.

  GET  /me/storage                  (LX 계정) 내 저장 용량 — 내 정보 창의 값과 같은 한 출처(projects.lead_storage · accounts._storage_out)
                                    + 프로젝트별(내가 프로젝트장인 프로젝트 — 같은 식 _PROJECT_BYTES · 합이 used 와 같다)
                                    + 늘리기 요청 이력(보낸 것 전부 · 최근 순 — 대기 · 승인 · 반려 · 사유)
  GET  /me/jobs                     (LX 계정) 내가 돌린 작업 — 상태별 수(끝남 · 실패 · 취소 · 지금 도는 것) · 종류별 수 · 기간 · 최근 몇 건
                                    (작업 표 jobs.submitted_by = 나 · 시험 작업 제외 · 목록 상한과 무관하게 서버에서 센다)
  GET  /me/analyses                 (LX 계정) 내 분석 목록(지도 서비스) — 분석하기로 내가 돌린 것 + 내가 돌렸거나 참여한 프로젝트의 추론 결과를
                                    분석서비스(카드) · 프로젝트 묶음별로(이름 · 지역 · 영상 · 범위 · 결과 수 · bounds · 결과 세트) — XI맵 실시간 · 말로 분석은 빼고
  GET  /announcements?limit=        (LX 계정) LX 전체 공지 — 최근 순 · 내린 것은 빼고. 비어 있으면 빈 목록(지어내지 않는다)
  POST /announcements               (LX 관리자) {title, body?} 공지 쓰기 → 감사 기록 announce.post
  POST /announcements/{id}/remove   (LX 관리자) 공지 내리기(지우지 않고 removed_at) → 감사 기록 announce.remove
화면에 내는 값은 이름 · 크기 · 수 · 시각만(작업 id · 경로 · 내부 지표는 화면이 쓰지 않는다 — card_id · sgg_cd 는 이름을 찾는 열쇠).
"""
from __future__ import annotations

import secrets

from fastapi import APIRouter, Request

from .deps import ApiError, Principal, audit, db, principal, require
from .envelope import env, now_iso

router = APIRouter()

KIND_KO = {"infer": "AI 분석", "reinfer": "AI 분석", "survey": "결과 갱신", "join": "필지 연결", "index": "위성 지수", "train": "학습", "tile": "영상 준비"}
DONE, FAILED, CANCELLED = "done", "failed", "cancelled"
TITLE_MAX, BODY_MAX = 80, 2000


def _lx(request: Request) -> Principal:
    p = require(principal(request))
    if p.realm != "lx":
        raise ApiError("forbidden", "LX 계정에서 봅니다")
    return p


def _iso(t):
    return t.isoformat(timespec="seconds") if t else None


# ── 저장 용량(프로젝트별 · 늘리기 요청 이력) ─────────────────────────────────────
@router.get("/me/storage")
async def my_storage(request: Request):
    p = _lx(request)
    from .accounts import _storage_out
    from .projects import _PROJECT_BYTES, lead_storage
    async with db(realm="lx") as conn:
        st = _storage_out(await lead_storage(conn, p.user_id))
        rows = await conn.fetch("SELECT p.name, p.state, " + _PROJECT_BYTES.format(p="p.id") + " AS b FROM projects p WHERE p.lead_id=$1 "
                                "ORDER BY 3 DESC, p.name", p.user_id)
        reqs = await conn.fetch("SELECT from_gb, want_gb, why, state, reason, created_at, decided_at FROM storage_requests WHERE user_id=$1 "
                                "ORDER BY created_at DESC LIMIT 20", p.user_id)
    f = lambda x: float(x) if x is not None else None  # noqa: E731
    return {"storage": st,
            "projects": [{"name": r["name"], "archived": r["state"] == "archived", "bytes": int(r["b"] or 0)} for r in rows],
            "requests": [{"from_gb": env(f(r["from_gb"]), "GB", "recorded", "신청할 때의 할당"),
                          "want_gb": env(f(r["want_gb"]), "GB", "recorded", "필요한 용량(신청한 할당)"), "why": r["why"], "state": r["state"], "reason": r["reason"],
                          "at": _iso(r["created_at"]), "decided_at": _iso(r["decided_at"])} for r in reqs],
            "as_of": now_iso()}


# ── 내가 돌린 작업 ─────────────────────────────────────────────────────────────
@router.get("/me/jobs")
async def my_jobs(request: Request, recent: int = 4):
    p = _lx(request)
    w = "submitted_by=$1 AND NOT coalesce(test,false)"
    async with db(realm="lx") as conn:
        st = await conn.fetch(f"SELECT state, count(*) AS n FROM jobs WHERE {w} GROUP BY state", p.user_id)
        kd = await conn.fetch(f"SELECT kind, count(*) AS n FROM jobs WHERE {w} GROUP BY kind ORDER BY 2 DESC", p.user_id)
        span = await conn.fetchrow(f"SELECT min(created_at) AS a, max(created_at) AS b FROM jobs WHERE {w}", p.user_id)
        rows = await conn.fetch(f"SELECT kind, state, card_id, options, created_at, finished_at FROM jobs WHERE {w} "
                                f"ORDER BY created_at DESC LIMIT {max(0, min(recent, 10))}", p.user_id)
    by = {r["state"]: int(r["n"]) for r in st}
    other = sum(n for s, n in by.items() if s not in (DONE, FAILED, CANCELLED))
    kinds: dict[str, int] = {}
    for r in kd:
        k = KIND_KO.get(r["kind"], "그 밖")
        kinds[k] = kinds.get(k, 0) + int(r["n"])

    def opt(o, k):
        return o.get(k) if isinstance(o, dict) else None
    items = []
    for r in rows:
        o = r["options"]
        if isinstance(o, str):
            import json
            try:
                o = json.loads(o)
            except ValueError:
                o = {}
        items.append({"kind": r["kind"], "kind_ko": KIND_KO.get(r["kind"], "그 밖"), "state": r["state"], "card_id": r["card_id"],
                      "sgg_cd": opt(o, "sgg_cd") or opt(o, "region"), "at": _iso(r["finished_at"] or r["created_at"])})
    cnt = lambda n, what: env(n, "count", "recorded", what)  # noqa: E731
    return {"counts": {"done": cnt(by.get(DONE, 0), "끝난 작업"), "failed": cnt(by.get(FAILED, 0), "실패한 작업"),
                       "cancelled": cnt(by.get(CANCELLED, 0), "취소한 작업"), "running": cnt(other, "대기 · 도는 중")},
            "kinds": [{"label": k, "n": n} for k, n in sorted(kinds.items(), key=lambda x: -x[1])],
            "first": _iso(span["a"]) if span else None, "last": _iso(span["b"]) if span else None,
            "recent": items, "as_of": now_iso()}


# ── 내 분석 목록(지도 서비스 · 원칙 149 · 154 · 163) ─────────────────────────────
# 내가 돌린 분석 = ① 분석하기(서비스 카드)로 내가 돌린 것 ② 프로젝트 추론(배포 전 모델) — 내가 돌렸거나 내가 참여한 프로젝트의 것(보는 사람 = 나 · 프로젝트 참여자).
# XI맵 실시간 · 말로 분석(XI ChatGEO)은 여기 넣지 않는다(XI맵 = 전국 · 해외 실시간 분석 — 원칙 147).
# 결과 도형 · 속성은 지금 있는 결과 타일(/tiles/pmtiles/{set}.pmtiles)과 필지 API(/parcels)를 그대로 쓴다 — 이 목록은 묶음 · 이름 · 범위 · 수만 준다.
MY_ANALYSES_SQL = (
    "SELECT j.id, j.card_id, j.options, j.imagery_id, j.result_set, j.counts, j.finished_at, j.submitted_by, j.model_id, j.snapshot_ready, "
    "ST_AsGeoJSON(ST_Envelope(CASE WHEN i.footprint IS NOT NULL AND ST_Intersects(j.aoi, i.footprint) THEN ST_Intersection(j.aoi, i.footprint) ELSE j.aoi END))::json AS env, "
    "c.name->>'ko' AS cname, i.name AS iname, i.year, i.epoch, i.gsd_m, pr.id AS pid, pr.name AS pname "
    "FROM jobs j LEFT JOIN cards c ON c.id=j.card_id LEFT JOIN imagery i ON i.id=j.imagery_id "
    "LEFT JOIN projects pr ON pr.id = j.options->>'project_id' "
    "WHERE j.kind='infer' AND j.state='done' AND NOT j.demo AND NOT coalesce(j.test,false) AND j.result_set IS NOT NULL "
    # 찾은 것이 0건인 분석도 결과다(결과 타일은 만들지 않음) — '결과 없음'으로 쌓는다(QA-결과없음 · 10-11 종단 시험)
    "AND (j.snapshot_ready OR coalesce((SELECT sum((v)::numeric) FROM jsonb_each_text(coalesce(j.counts,'{}'::jsonb)) AS t(k, v)), 0) = 0) "
    "AND ((j.card_id IS NOT NULL AND j.submitted_by=$1) "
    "  OR (j.options->>'project_infer'='true' AND (j.submitted_by=$1 OR pr.lead_id=$1 "
    "      OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id=pr.id AND m.user_id=$1))) "
    "  OR ($3 AND j.id=$2)) "
    "ORDER BY j.finished_at DESC LIMIT 200")


# 아직 도는 내 분석(대기 · 분석 중) — 끝나면 위 목록에 층으로 쌓인다(지도 서비스 왼쪽 위 한 줄)
MY_RUNNING_SQL = (
    "SELECT j.id, j.state, j.card_id, j.options, c.name->>'ko' AS cname, pr.name AS pname FROM jobs j "
    "LEFT JOIN cards c ON c.id=j.card_id LEFT JOIN projects pr ON pr.id = j.options->>'project_id' "
    "WHERE j.kind='infer' AND j.state IN ('queued','running') AND NOT j.demo AND NOT coalesce(j.test,false) AND j.submitted_by=$1 "
    "AND (j.card_id IS NOT NULL OR j.options->>'project_infer'='true') ORDER BY j.created_at DESC LIMIT 20")


def _jload(v):
    if isinstance(v, str):
        import json
        try:
            return json.loads(v)
        except ValueError:
            return {}
    return v or {}


def _name_ko(v) -> str:
    v = _jload(v) if isinstance(v, str) and v.startswith("{") else v
    if isinstance(v, dict):
        return str(v.get("ko") or v.get("en") or "")
    return str(v or "")


@router.get("/me/analyses")
async def my_analyses(request: Request, job: str | None = None):
    """job = 이 결과를 열어 달라(추론 '결과 보기' · 배포 신청 결과 장면) — LX 관리자는 남의 결과도 그 한 건을 연다(배포 신청 검토)."""
    p = _lx(request)
    from shapely.geometry import shape
    from .deploys import gsd_word
    from .regions import region_of
    from .spaces import CLASS_KO
    async with db(realm="lx") as conn:
        rows = await conn.fetch(MY_ANALYSES_SQL, p.user_id, job or "", bool(job and p.is_admin))
        run = await conn.fetch(MY_RUNNING_SQL, p.user_id)
    groups: dict[str, dict] = {}
    for r in rows:
        o = _jload(r["options"])
        cnt = _jload(r["counts"])
        proj = bool(o.get("project_infer"))
        key = f"project:{r['pid']}" if proj else f"card:{r['card_id']}"
        gname = f"프로젝트 추론 — {r['pname']}" if proj else (r["cname"] or "분석 서비스")
        g = groups.setdefault(key, {"key": key, "name": gname, "kind": "project" if proj else "card", "items": []})
        sgg = o.get("sgg_cd")
        rg = region_of(sgg) if sgg else None
        region = " ".join(x for x in ((rg or {}).get("name") or "", o.get("range_name") or "" if proj else "") if x)
        if proj:
            scope = "배포 전 모델"
        elif o.get("scope_full"):
            scope = f"전역 · 읍면동 {o.get('emd_total')}곳" if o.get("emd_total") else "전역"
        elif o.get("coverage") is not None:
            pc = float(o["coverage"]) * 100                                      # 1% 미만을 '0%'로 적지 않는다(분석하기 범위 문장과 같은 말 · QA-결과없음)
            scope = "영상 있는 1% 미만" if pc < 1 else f"영상 있는 {round(pc)}%"
        else:
            scope = ""
        yr = str(r["year"] or (str(r["epoch"])[:4] if r["epoch"] else ""))
        try:
            b = [round(v, 6) for v in shape(r["env"]).bounds] if r["env"] else None
        except Exception:  # noqa: BLE001
            b = None
        total = sum(int(v or 0) for v in cnt.values()) if cnt else 0              # 끝난 분석의 빈 집계 = 찾은 것 0건(QA-결과없음)
        fin = _iso(r["finished_at"])
        g["items"].append({
            "job": r["id"], "set": r["result_set"], "region": region or "—", "sgg_cd": (rg or {}).get("sgg_cd") or sgg,
            "scope": scope,
            "imagery": {"id": r["imagery_id"], "name": _name_ko(r["iname"]), "year": yr or None, "word": " ".join(x for x in (yr, gsd_word(r["gsd_m"])) if x)},
            "found": env(total, "count", "inferred", "AI 분석 결과(검수 전)", as_of=fin),
            "by_class": [{"cls": CLASS_KO.get(k, k), "n": int(v or 0)} for k, v in sorted(cnt.items(), key=lambda x: -int(x[1] or 0))],
            "bounds": b, "finished_at": fin, "mine": r["submitted_by"] == p.user_id,
            "empty": not r["snapshot_ready"]})                                   # 찾은 것 0건 — 지도에 그릴 결과 층이 없다(범위만)
    running = []
    for r in run:
        o = _jload(r["options"])
        rg = region_of(o.get("sgg_cd")) if o.get("sgg_cd") else None
        running.append({"job": r["id"], "state": r["state"], "name": f"프로젝트 추론 — {r['pname']}" if o.get("project_infer") else (r["cname"] or "분석 서비스"),
                        "region": " ".join(x for x in ((rg or {}).get("name") or "", o.get("range_name") or "") if x) or "—"})
    out = list(groups.values())
    for g in out:
        g["n"] = len(g["items"])
        g["last"] = g["items"][0]["finished_at"] if g["items"] else None
    return {"groups": out, "total": sum(g["n"] for g in out), "running": running, "as_of": now_iso()}


# ── 공지 ───────────────────────────────────────────────────────────────────────
def _ann(r) -> dict:
    return {"id": r["id"], "title": r["title"], "body": r["body"] or "", "by_name": r["by_name"] or "LX 관리자", "at": _iso(r["at"])}


@router.get("/announcements")
async def list_announcements(request: Request, limit: int = 20):
    _lx(request)
    async with db(realm="lx") as conn:
        rows = await conn.fetch("SELECT * FROM lx_announcements WHERE removed_at IS NULL ORDER BY at DESC LIMIT $1", max(1, min(limit, 100)))
        n = await conn.fetchval("SELECT count(*) FROM lx_announcements WHERE removed_at IS NULL")
    return {"items": [_ann(r) for r in rows], "total": int(n or 0), "as_of": now_iso()}


@router.post("/announcements", status_code=201)
async def post_announcement(body: dict, request: Request):
    p = require(principal(request), admin=True)
    title = " ".join(str(body.get("title") or "").split())
    text = str(body.get("body") or "").strip()
    if not title:
        raise ApiError("bad_request", "제목을 적어 주세요", {"field": "title"})
    if len(title) > TITLE_MAX or len(text) > BODY_MAX:
        raise ApiError("bad_request", f"제목은 {TITLE_MAX}자, 본문은 {BODY_MAX}자까지입니다")
    aid = "an_" + secrets.token_hex(5)
    async with db(realm="lx") as conn:
        nm = await conn.fetchval("SELECT name FROM lx_users WHERE id=$1", p.user_id)
        r = await conn.fetchrow("INSERT INTO lx_announcements(id, title, body, by, by_name) VALUES ($1,$2,$3,$4,$5) RETURNING *",
                                aid, title, text or None, p.user_id, nm or "LX 관리자")
        await audit(conn, p, "announce.post", aid, None, {"title": title})
    return {"item": _ann(r), "at": now_iso()}


@router.post("/announcements/{aid}/remove")
async def remove_announcement(aid: str, request: Request):
    p = require(principal(request), admin=True)
    async with db(realm="lx") as conn:
        r = await conn.fetchrow("UPDATE lx_announcements SET removed_at=now(), removed_by=$2 WHERE id=$1 AND removed_at IS NULL RETURNING title",
                                aid, p.user_id)
        if not r:
            raise ApiError("not_found", "공지가 없습니다")
        await audit(conn, p, "announce.remove", aid, {"title": r["title"]}, None)
    return {"ok": True, "at": now_iso()}
