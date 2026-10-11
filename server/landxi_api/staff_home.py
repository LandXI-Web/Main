"""LX 직원 대시보드 칸 셋(확인 대장 직원-4 ⓐ) · 내 정보 두 단(직원-5 ⓐ) — 저장 용량 · 내가 돌린 작업 · 공지.

  GET  /me/storage                  (LX 계정) 내 저장 용량 — 내 정보 창의 값과 같은 한 출처(projects.lead_storage · accounts._storage_out)
                                    + 프로젝트별(내가 프로젝트장인 프로젝트 — 같은 식 _PROJECT_BYTES · 합이 used 와 같다)
                                    + 늘리기 요청 이력(보낸 것 전부 · 최근 순 — 대기 · 승인 · 반려 · 사유)
  GET  /me/jobs                     (LX 계정) 내가 돌린 작업 — 상태별 수(끝남 · 실패 · 취소 · 지금 도는 것) · 종류별 수 · 기간 · 최근 몇 건
                                    (작업 표 jobs.submitted_by = 나 · 시험 작업 제외 · 목록 상한과 무관하게 서버에서 센다)
  GET  /me/analyses                 (LX 계정) 내 분석 목록(지도 서비스) — 분석하기로 내가 돌린 것 + 내가 돌렸거나 참여한 프로젝트의 추론 결과를
                                    분석서비스(카드) · 프로젝트 묶음별로(이름 · 지역 · 영상 · 범위 · 결과 수 · bounds · 결과 세트) — XI맵 실시간 · 말로 분석은 빼고
  GET  /me/analyses/{작업}/formats   (LX 계정) 그 층을 받을 수 있는 형식(GeoJSON · SHP · 필지 엑셀 · 까닭)
  GET  /me/analyses/{작업}/rows      (LX 계정) '목록 보기' — 그 층의 결과 표(넓은 것부터 · cond=지금 조건 JSON)
  POST /me/analyses/filter          (LX 계정) {jobs, cond} → 조건에 맞는 수 · 칩(조건 칩 하나 풀기 — XI ChatGEO 거르기와 같은 식)
  GET  /me/analyses/{작업}/download?fmt=geojson|shp|parcels   층 내려받기(Q6 ⓑ · 외부 API 1차와 같은 값 · 같은 함수 · 동의 한 줄 · 기록)
  GET|POST /me/downloads/consent    동의 한 줄(LX 계정마다 한 번) · GET /me/downloads 내려받기 기록(직원 = 내 것 · 관리자 = LX 전부)
  GET  /announcements?limit=        (LX 계정) LX 전체 공지 — 최근 순 · 내린 것은 빼고. 비어 있으면 빈 목록(지어내지 않는다)
  POST /announcements               (LX 관리자) {title, body?} 공지 쓰기 → 감사 기록 announce.post
  POST /announcements/{id}/remove   (LX 관리자) 공지 내리기(지우지 않고 removed_at) → 감사 기록 announce.remove
화면에 내는 값은 이름 · 크기 · 수 · 시각만(작업 id · 경로 · 내부 지표는 화면이 쓰지 않는다 — card_id · sgg_cd 는 이름을 찾는 열쇠).
"""
from __future__ import annotations

import json
import re
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


def _item(r, p: Principal) -> tuple[str, str, bool, dict]:
    """작업 한 줄 → (묶음 열쇠, 묶음 이름, 프로젝트 여부, 줄) — 목록 · 내려받기 · XI ChatGEO 보고서가 같은 값을 쓴다(숫자 한 출처)."""
    from shapely.geometry import shape
    from .deploys import gsd_word
    from .regions import region_of
    from .spaces import CLASS_KO
    o = _jload(r["options"])
    cnt = _jload(r["counts"])
    proj = bool(o.get("project_infer"))
    key = f"project:{r['pid']}" if proj else f"card:{r['card_id']}"
    gname = f"프로젝트 추론 — {r['pname']}" if proj else (r["cname"] or "분석 서비스")
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
    item = {
        "job": r["id"], "set": r["result_set"], "region": region or "—", "sgg_cd": (rg or {}).get("sgg_cd") or sgg,
        "scope": scope,
        "imagery": {"id": r["imagery_id"], "name": _name_ko(r["iname"]), "year": yr or None, "word": " ".join(x for x in (yr, gsd_word(r["gsd_m"])) if x)},
        "found": env(total, "count", "inferred", "AI 분석 결과(검수 전)", as_of=fin),
        "by_class": [{"cls": CLASS_KO.get(k, k), "n": int(v or 0)} for k, v in sorted(cnt.items(), key=lambda x: -int(x[1] or 0))],
        "bounds": b, "finished_at": fin, "mine": r["submitted_by"] == p.user_id,
        "empty": not r["snapshot_ready"]}                                    # 찾은 것 0건 — 지도에 그릴 결과 층이 없다(범위만)
    return key, gname, proj, item


async def my_job(p: Principal, job: str) -> dict | None:
    """이 사람의 지도 서비스에 있는 결과 한 건(목록과 같은 판정 · 같은 줄) + 묶음 이름 · 카드 · 모델. 없으면 None(있다는 것도 알리지 않는다)."""
    sql = MY_ANALYSES_SQL.replace("ORDER BY j.finished_at DESC LIMIT 200", "")
    async with db(realm="lx") as conn:
        r = await conn.fetchrow(f"SELECT q.* FROM ({sql}) q WHERE q.id = $2", p.user_id, job, bool(p.is_admin))
    if not r:
        return None
    key, gname, proj, item = _item(r, p)
    return {**item, "group": gname, "group_key": key, "project": proj, "card_id": r["card_id"], "model_id": r["model_id"]}


@router.get("/me/analyses")
async def my_analyses(request: Request, job: str | None = None):
    """job = 이 결과를 열어 달라(추론 '결과 보기' · 배포 신청 결과 장면) — LX 관리자는 남의 결과도 그 한 건을 연다(배포 신청 검토)."""
    p = _lx(request)
    from .regions import region_of
    async with db(realm="lx") as conn:
        rows = await conn.fetch(MY_ANALYSES_SQL, p.user_id, job or "", bool(job and p.is_admin))
        run = await conn.fetch(MY_RUNNING_SQL, p.user_id)
    groups: dict[str, dict] = {}
    for r in rows:
        key, gname, proj, item = _item(r, p)
        g = groups.setdefault(key, {"key": key, "name": gname, "kind": "project" if proj else "card", "items": []})
        g["items"].append(item)
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


# ── 레이어 내려받기(Q6 ⓑ · 원칙 59 · 외부 API 1차와 같은 값 · 같은 함수) ──────────────────────
# 형식 셋 = GeoJSON(ext_api._props 열) · SHP(ext_api._shp_zip) · 필지 엑셀(spaces._parcel_rows · _xlsx). 행 = spaces._feature_rows(지운 결과 제외).
# 처음 한 번 동의 한 줄(LX 계정마다 · space_consents 'lx') · 내려받을 때마다 기록 한 줄(space_log 'lx' · 감사 기록) — LX 관리자가 본다.
DL_FORMATS = {"geojson": ("GeoJSON", "geojson", "application/geo+json"), "shp": ("SHP", "zip", "application/zip"),
              "parcels": ("필지 엑셀", "xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
DL_CONSENT_VER = 1
DL_CONSENT_LINE = "AI 분석 결과는 참고자료이며, 내려받으면 누가 · 무엇을 · 언제 받았는지 기록이 남습니다."
_BAD_NAME = re.compile(r'[\\/:*?"<>|\s]+')


@router.get("/me/downloads/consent")
async def dl_consent_get(request: Request):
    p = _lx(request)
    async with db(realm="lx") as conn:
        v = await conn.fetchval("SELECT ver FROM space_consents WHERE tenant_id='lx' AND user_id=$1", p.user_id)
    return {"done": bool(v and v >= DL_CONSENT_VER), "line": DL_CONSENT_LINE, "formats": [{"fmt": k, "label": f[0]} for k, f in DL_FORMATS.items()]}


@router.post("/me/downloads/consent")
async def dl_consent_post(request: Request, body: dict | None = None):
    p = _lx(request)
    if not (body or {}).get("agree"):
        raise ApiError("bad_request", "동의가 필요합니다")
    async with db(realm="lx") as conn:
        await conn.execute("INSERT INTO space_consents(tenant_id, user_id, realm, ver, at) VALUES ('lx',$1,'lx',$2,now()) "
                           "ON CONFLICT (tenant_id, user_id) DO UPDATE SET ver=EXCLUDED.ver, at=now()", p.user_id, DL_CONSENT_VER)
        await audit(conn, p, "mapsvc.consent", p.user_id, None, {"ver": DL_CONSENT_VER})
    return {"ok": True, "done": True}


def _dl_name(x: dict, ext: str) -> str:
    day = (x.get("finished_at") or "")[:10].replace("-", "")
    base = _BAD_NAME.sub("_", f"{x['region']}_{x['group']}_AI분석_{day}").strip("_")
    return f"{base}.{ext}"


@router.get("/me/analyses/{job}/formats")
async def dl_formats(job: str, request: Request):
    """내려받을 수 있는 형식(화면이 못 받는 형식은 미리 막는다) — 필지 엑셀 = 필지 번호가 붙은 결과가 있을 때만(spaces._parcel_src 와 같은 판정)."""
    from . import spaces as S
    p = _lx(request)
    x = await my_job(p, job)
    if not x:
        raise ApiError("not_found", "이 계정의 지도 서비스에 없는 결과입니다")
    have = not x["empty"]
    pc = False
    if have:
        async with db(realm="lx") as conn:
            pc = bool(await conn.fetchval("SELECT EXISTS(SELECT 1 FROM detections WHERE job_id=$1 AND pnu IS NOT NULL AND edit_state <> 'deleted')", job))
        pc = pc or (await S._parcel_src("lx", [job])) == "stored"
    why = {"geojson": None if have else "찾은 것이 없습니다", "shp": None if have else "찾은 것이 없습니다",
           "parcels": None if pc else ("찾은 것이 없습니다" if not have else "이 결과는 필지와 잇지 않았습니다")}
    return {"items": [{"fmt": k, "label": f[0], "ok": why[k] is None, "why": why[k]} for k, f in DL_FORMATS.items()]}


@router.get("/me/analyses/{job}/download")
async def dl_layer(job: str, request: Request, fmt: str = "geojson", test: bool = False):
    from fastapi.responses import Response, StreamingResponse
    from starlette.concurrency import run_in_threadpool
    from . import ext_api as X
    from . import spaces as S
    p = _lx(request)
    if fmt not in DL_FORMATS:
        raise ApiError("bad_request", "형식은 geojson · shp · parcels 가운데 하나입니다")
    x = await my_job(p, job)
    if not x:
        raise ApiError("not_found", "이 계정의 지도 서비스에 없는 결과입니다")
    async with db(realm="lx") as conn:
        v = await conn.fetchval("SELECT ver FROM space_consents WHERE tenant_id='lx' AND user_id=$1", p.user_id)
    if not v or v < DL_CONSENT_VER:
        raise ApiError("conflict", "내려받기 전에 동의해 주세요", {"need": "consent", "line": DL_CONSENT_LINE}, 409)
    if x["empty"]:
        raise ApiError("not_found", "찾은 것이 없는 분석이라 내려받을 결과가 없습니다")
    label, ext, mime = DL_FORMATS[fmt]
    day = (x["finished_at"] or "")[:10]
    rl = " · ".join(s for s in (x["region"], x["imagery"]["word"], (day.replace("-", ".") + " 분석") if day else "") if s)
    name = _dl_name(x, ext)
    sets = [job]
    if fmt == "parcels":
        rows, how = await S._parcel_rows("lx", sets, await S._parcel_src("lx", sets), None)
        if not rows:
            raise ApiError("not_found", "이 결과는 필지와 잇지 않았습니다")
        info = [("서비스", x["group"]), ("지역", x["region"]), ("영상", x["imagery"]["name"] or x["imagery"]["word"]), ("분석한 날", day),
                ("만든 때", now_iso()), ("필지 수", len(rows)), ("안내", S.NOTICE)]
        g = {"body": {"version": {"service": []}, "when": {"rounds": [{"place": x["region"], "shot": x["imagery"]["word"], "analyzed": day}]}}, "edition": None}
        data = await run_in_threadpool(S._xlsx, "LX", {"name": x["group"]}, g, rows, how, info)
        n = len(rows)
        resp = Response(data, media_type=mime, headers={"content-disposition": S._disposition(name), "cache-control": "no-store"})
    elif fmt == "shp":
        rows = [r async for r in S._feature_rows("lx", sets)]
        stem = re.sub(r"[^0-9A-Za-z가-힣_]+", "_", name.rsplit(".", 1)[0])[:60] or "landxi"
        data, n = await run_in_threadpool(X._shp_zip, rows, stem, rl, "", None)
        resp = Response(data, media_type=mime, headers={"content-disposition": S._disposition(name.rsplit(".", 1)[0] + "_shp.zip"), "cache-control": "no-store"})
    else:
        n = int(x["found"]["value"] or 0)
        meta = {"서비스": x["group"], "지역": x["region"], "영상": x["imagery"]["name"] or x["imagery"]["word"], "분석한 날": day,
                "만든 때": now_iso(), "안내": S.NOTICE, "좌표": "경위도(EPSG:4326)"}

        async def gen():
            yield b'{"type":"FeatureCollection","lx":' + json.dumps(meta, ensure_ascii=False).encode() + b',"features":['
            first = True
            async for r in S._feature_rows("lx", sets):
                pr = X._props(r, rl, "", None)
                f = '{"type":"Feature","id":' + json.dumps(pr["id"]) + ',"geometry":' + (r["g"] or "null") + ',"properties":' + json.dumps(pr, ensure_ascii=False) + "}"
                yield (b"" if first else b",") + f.encode()
                first = False
            yield b"]}"
        resp = StreamingResponse(gen(), media_type=mime, headers={"content-disposition": S._disposition(name), "cache-control": "no-store"})
    async with db(realm="lx") as conn:
        who = await conn.fetchval("SELECT name FROM lx_users WHERE id=$1", p.user_id)
        await conn.execute("INSERT INTO space_log(tenant_id, kind, card_id, line, actor, realm, detail) VALUES ('lx','download',$1,$2,$3,'lx',$4)",
                           x["card_id"], f"{who or 'LX 직원'} — {x['group']} · {x['region']} {label} 내려받기" + (" (시험)" if test else ""), p.user_id,
                           {"fmt": fmt, "rows": n, "job": job, **({"test": True} if test else {})})
        await audit(conn, p, "mapsvc.download", job, None, {"fmt": fmt, "rows": n})
    return resp


# ── 조건 칩 풀기 · 목록 보기(외부 검수 3차 GPT3-3 · 도형목록) — 거르기 · 통계 · 보고서와 같은 식(result_scope 한 출처) ──
async def _my_jobs(p: Principal, jobs) -> list[str]:
    ok = []
    for j in [str(x) for x in (jobs or [])][:24]:
        if j not in ok and await my_job(p, j):
            ok.append(j)
    return ok


@router.post("/me/analyses/filter")
async def my_filter_count(request: Request, body: dict | None = None):
    """{jobs, cond} → 조건에 맞는 수 · 칩 — 지도 서비스 조건 칩 하나를 풀 때(XI ChatGEO 답과 같은 수 · 같은 말)."""
    from . import result_scope as RSC
    p = _lx(request)
    b = body or {}
    jobs = await _my_jobs(p, b.get("jobs"))
    cond = RSC.clean(b.get("cond"))
    n = 0
    if jobs:
        a: list = [jobs]
        w = ["job_id = ANY($1::text[])", "edit_state <> 'deleted'"] + RSC.sql(cond, a)
        async with db(realm="lx") as conn:
            n = int(await conn.fetchval(f"SELECT count(*) FROM detections WHERE {' AND '.join(w)}", *a))
    return {"n": n, "label": RSC.label(cond), "chips": RSC.chips(cond), "params": cond}   # params = 조건 그대로(구조 필드)


@router.get("/me/analyses/{job}/rows")
async def my_rows(job: str, request: Request, offset: int = 0, limit: int = 50, cond: str | None = None):
    """'목록 보기' — 그 레이어의 결과 표(넓은 것부터 · 지금 걸린 조건 그대로) · 줄 = 결과 타일과 같은 행(분류 · 면적 · 신뢰도 · 읍면동 · 가운데 · 범위)."""
    from . import result_scope as RSC
    from .spaces import class_ko
    p = _lx(request)
    if not await my_job(p, job):
        raise ApiError("not_found", "이 계정의 지도 서비스에 없는 결과입니다")
    try:
        c = RSC.clean(json.loads(cond)) if cond else {}
    except ValueError:
        c = {}
    a: list = [job]
    w = ["job_id = $1", "edit_state <> 'deleted'"] + RSC.sql(c, a)
    lim, off = max(1, min(int(limit), 200)), max(0, int(offset))
    async with db(realm="lx") as conn:
        n = int(await conn.fetchval(f"SELECT count(*) FROM detections WHERE {' AND '.join(w)}", *a))
        rows = await conn.fetch(f"SELECT id, cls, cls_en, conf, area_m2, emd, ST_X(ST_PointOnSurface(geom)) AS x, ST_Y(ST_PointOnSurface(geom)) AS y, "
                                f"ST_XMin(geom) AS w, ST_YMin(geom) AS s, ST_XMax(geom) AS e, ST_YMax(geom) AS nn FROM detections "
                                f"WHERE {' AND '.join(w)} ORDER BY area_m2 DESC NULLS LAST, id LIMIT {lim} OFFSET {off}", *a)
    # 속성 = 결과 타일 속성과 같은 이름(properties · 데이터 구조) · 가운데 · 범위는 좌표(center · bbox)
    items = [{"id": str(r["id"]), "properties": {"cls": class_ko(r["cls"], r["cls_en"]),
                                                  "area_m2": round(float(r["area_m2"]), 1) if r["area_m2"] is not None else None,
                                                  "conf": round(float(r["conf"]), 3) if r["conf"] is not None else None, "emd": r["emd"] or None},
              "center": [round(r["x"], 7), round(r["y"], 7)], "bbox": [round(r["w"], 7), round(r["s"], 7), round(r["e"], 7), round(r["nn"], 7)]} for r in rows]
    return {"n": n, "offset": off, "items": items, "label": RSC.label(c)}


@router.get("/me/downloads")
async def dl_log(request: Request, limit: int = 20):
    """내려받기 기록 — LX 직원 = 내 기록 · LX 관리자 = LX 계정 전부(원칙 59)."""
    p = _lx(request)
    async with db(realm="lx") as conn:
        rows = await conn.fetch("SELECT line, at FROM space_log WHERE tenant_id='lx' AND kind='download' AND ($1 OR actor=$2) ORDER BY at DESC, id DESC LIMIT $3",
                                bool(p.is_admin), p.user_id, max(1, min(limit, 100)))
    return {"items": [{"line": r["line"], "at": _iso(r["at"])} for r in rows], "as_of": now_iso()}


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
