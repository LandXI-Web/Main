"""프로젝트 — LX 직원의 일 단위(구현 2차 T1 '프로젝트 백본').

확인 대장: 3차 R-D3(프로젝트 = 무엇 · 어디 · 담당 · 단계 6 · 첫 화면 '내 프로젝트') · R-D3 갈림길 ⓐ(직원이 바로 만든다 · 관리자 승인 없음) ·
          4차 P1(프로젝트 → 서비스 카드 발행 요청) · 5차 역할-3 ⓑ(공개된 서비스의 재학습 = 프로젝트장이 시작 · 배포만 관리자 승인) ·
          6차 흐름-1(LX 직원 원스톱 13단계 — 프로젝트 안 단계 6). 원칙 44 · 46 · 49 · 51 · 55 · 61.

GET    /projects?scope=mine|led|joined|archived|all
                                         mine = 내가 만든(프로젝트장) + 참여한(구성원) 진행 중 · led · joined 는 그 한쪽 · archived = 내 보관(끝난) 프로젝트
                                         (관리자는 전체 보관) · all = LX 전체 진행 중. 줄마다 지금 단계 · 다음 할 일 하나 · 마지막 활동
POST   /projects                         {name, task, task_id?, regions:[code..]} → 바로 만들어진다 · 프로젝트장 = 만든 직원
GET    /projects/places                  대상 지역 고르기의 해외 항목(국내 시군구는 GET /regions)
GET    /projects/people                  구성원 고르기(LX 직원 · 관리자)
GET    /projects/{pid}                   한 장 — 단계 6(완료 조건 자동 판정) · 다음 할 일 · 구성원 · 할 수 있는 것(can)
PATCH  /projects/{pid}                   {name?, task?, task_id?, regions?} 프로젝트장 · 관리자 / {lead_id} LX 관리자만
POST   /projects/{pid}/members           {user_id} 프로젝트장 · 관리자
DELETE /projects/{pid}/members/{uid}     프로젝트장 · 관리자
POST   /projects/{pid}/samples           {sample_id} 보관된 학습 표본을 이 프로젝트 학습데이터로 더한다(프로젝트장 · 구성원)
POST   /projects/{pid}/archive           {archived: true|false} 끝난 프로젝트 보관 · 다시 열기(프로젝트장 · 관리자) — 기록은 지우지 않는다
POST   /projects/{pid}/rounds            재학습 — 같은 프로젝트의 다음 회차(학습 단계로 돌아감). 공개된 서비스만 · 프로젝트장 · 구성원만

단계 6(흐름-1 의 LX 직원 부분 · 레일 순서): 데이터 올리기 → 학습데이터 구축 → 학습 → 결과 확인 → 발행 요청 → 서비스 관리.
완료 조건(자동 · 막지 않는 길잡이 — R-D3 §3-2):
  데이터 올리기   대상 지역마다 영상 1개 이상(영상 범위 ∩ 지역 경계 — /regions 와 같은 판정)
  학습데이터 구축 이 프로젝트의 학습 표본(라벨 묶음) 1개 이상
  학습           이번 회차 표본으로 학습한 모델이 '쓸 수 있음'(등록 승인)까지
  결과 확인       대상 지역에서 결과 확인(표본 판정) 한 묶음(20건) — 결과 확인 화면이 한 번에 보는 표본 수
  발행 요청       이번 회차 서비스 카드(또는 새 판)의 공개 결재 승인
  서비스 관리     끝이 없는 단계 — 공개 뒤. 다음 할 일 = 다른 지역에 적용 · 적용 결재 대기
판단 기준 표시(정밀도 기준값 등 · 6차 판단-1·2)는 보류라 여기서 판정하지 않는다.

재학습 권한(역할-3 ⓑ): 서비스가 공개된 프로젝트의 학습(POST /jobs kind train — 이 프로젝트 표본 · 이 프로젝트 모델)은 프로젝트장과 구성원만.
다른 직원 · 관리자는 서버가 거절한다(guard_train · jobs 견적이 부른다). 재학습 결과의 배포는 관리자 승인(모델 등록 · 새 판 공개 결재 · 배포본 모델 교체는 관리자).
"""
from __future__ import annotations

import datetime as dt
import re
import secrets

from fastapi import APIRouter, Request

from . import config
from .deps import ApiError, Principal, audit, db, principal, require
from .envelope import KST, env, now_iso

router = APIRouter()

STAGES = [("ingest", "데이터 올리기"), ("label", "학습데이터 구축"), ("train", "학습"), ("review", "결과 확인"),
          ("publish", "발행 요청"), ("ops", "서비스 관리")]
SCOPES = ("mine", "led", "joined", "archived", "all")
SCOPE_WORD = {"mine": "진행 중 · 내가 만든 · 참여한 프로젝트", "led": "진행 중 · 내가 만든 프로젝트", "joined": "진행 중 · 참여한 프로젝트",
              "archived": "보관한 프로젝트", "all": "진행 중 · LX 전체 프로젝트"}
REVIEW_BATCH = 20                 # 결과 확인 화면이 한 번에 보는 표본 수(lx-review SAMPLE) — 한 묶음을 보면 이 단계는 끝
NAME_MAX, TASK_MAX, REGIONS_MAX = 60, 40, 30
ROLE_WORD = {"admin": "LX 관리자", "staff": "LX 직원", "sales": "LX 영업"}


def _iso(v):
    return v.astimezone(KST).isoformat(timespec="seconds") if v else None


def _lx(request: Request) -> Principal:
    p = require(principal(request), lx=True)
    if p.role not in ("staff", "admin"):
        raise ApiError("forbidden", "LX 직원 · 관리자만 프로젝트를 다룹니다")
    return p


# ── 대상 지역 ─────────────────────────────────────────────────────────────────
def _abroad_profiles() -> dict:
    """해외 지역(지역 프로필 중 국내 상자가 아닌 것) — 고르기 목록 · 영상 범위 판정."""
    from .deploys import _domestic_bbox
    out = {}
    for k, v in (config.load_yaml("region_profiles").get("profiles") or {}).items():
        if v.get("bbox") and not _domestic_bbox(v["bbox"]):
            nm = v.get("name") or {}
            out[k] = {"code": k, "name": nm.get("ko") or nm.get("en") or k, "full": nm.get("ko") or nm.get("en") or k, "abroad": True,
                      "bbox": v["bbox"]}
    return out


def clean_regions(codes) -> list[dict]:
    """직원이 고른 지역 코드 → [{code, name, full, abroad}] — 시군구(지금 · 옛 코드) 또는 해외 지역. 없는 코드는 400(지어내지 않는다)."""
    if not isinstance(codes, list) or not codes:
        raise ApiError("bad_request", "대상 지역을 한 곳 이상 골라 주세요")
    if len(codes) > REGIONS_MAX:
        raise ApiError("bad_request", f"대상 지역은 {REGIONS_MAX}곳까지입니다")
    from .regions import region_of
    abroad = _abroad_profiles()
    out, seen = [], set()
    for c in codes:
        c = str((c or {}).get("code") if isinstance(c, dict) else c or "").strip()
        if not c:
            continue
        if re.fullmatch(r"\d{5}", c):
            r = region_of(c)
            if not r:
                raise ApiError("bad_request", "없는 지역입니다", {"region": c})
            item = {"code": r["sgg_cd"], "name": r["name"], "full": r.get("full") or r["name"], "abroad": False}
        elif c in abroad:
            a = abroad[c]
            item = {k: a[k] for k in ("code", "name", "full", "abroad")}
        else:
            raise ApiError("bad_request", "없는 지역입니다", {"region": c})
        if item["code"] not in seen:
            seen.add(item["code"])
            out.append(item)
    if not out:
        raise ApiError("bad_request", "대상 지역을 한 곳 이상 골라 주세요")
    return out


# ── 사람 ─────────────────────────────────────────────────────────────────────
async def _people(conn) -> dict:
    out = {}
    for r in await conn.fetch("SELECT id, role, name, status FROM lx_users"):
        w = ROLE_WORD.get(r["role"], "LX")
        out[r["id"]] = {"id": r["id"], "name": r["name"] or w, "role": r["role"], "role_label": w, "active": r["status"] == "active"}
    return out


def _who(people: dict, uid: str | None) -> dict | None:
    if not uid:
        return None
    x = people.get(uid)
    return {"id": uid, "name": x["name"], "role_label": x["role_label"]} if x else {"id": uid, "name": "LX", "role_label": "LX"}


async def _row(conn, pid: str):
    r = await conn.fetchrow("SELECT * FROM projects WHERE id=$1", pid)
    if not r:
        raise ApiError("not_found", "프로젝트가 없습니다")
    return r


async def _members(conn, pid: str) -> list[str]:
    return [x["user_id"] for x in await conn.fetch("SELECT user_id FROM project_members WHERE project_id=$1 ORDER BY added_at", pid)]


def _is_member(p: Principal, r, members: list[str]) -> bool:
    return bool(p.user_id) and (p.user_id == r["lead_id"] or p.user_id in members)


async def require_member(conn, p: Principal, pid: str):
    """프로젝트 일(표본 올리기 · 학습)은 프로젝트장과 구성원이 한다."""
    r = await _row(conn, pid)
    if not _is_member(p, r, await _members(conn, pid)):
        raise ApiError("forbidden", "이 프로젝트의 프로젝트장 · 구성원만 할 수 있습니다")
    return r


async def link(conn, pid: str, kind: str, ref: str, by: str | None, round_: int | None = None) -> None:
    """프로젝트가 만든 것을 잇는다(학습 표본 · 서비스 카드 · 카드 판). 이미 이어져 있으면 그대로."""
    if round_ is None:
        round_ = await conn.fetchval("SELECT round FROM projects WHERE id=$1", pid) or 1
    size = None
    if kind == "sample":                    # 쓴 저장 공간(표본 파일 크기) — 개인 할당을 붙일 때 셀 수 있게(사용자 7차 답 데이터-1)
        d = await conn.fetchval("SELECT dir FROM train_samples WHERE id=$1", ref)
        if d:
            from starlette.concurrency import run_in_threadpool
            size = await run_in_threadpool(_dir_bytes, d)
    await conn.execute("INSERT INTO project_links(project_id, kind, ref, round, by, bytes) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING",
                       pid, kind, ref, round_, by, size)
    await conn.execute("UPDATE projects SET updated_at=now() WHERE id=$1", pid)


def _dir_bytes(d: str) -> int:
    from pathlib import Path
    try:
        return sum(f.stat().st_size for f in Path(d).rglob("*") if f.is_file())
    except Exception:
        return 0


async def project_of_card(conn, card_id: str) -> dict | None:
    """카드 → 프로젝트 · 담당(= 그 프로젝트장). 알림 · 검토 요청을 받을 사람을 찾는 한 곳(원칙 63)."""
    r = await conn.fetchrow("SELECT p.id, p.name, p.lead_id FROM project_links l JOIN projects p ON p.id=l.project_id "
                            "WHERE l.kind='card' AND l.ref=$1", card_id)
    if not r:
        return None
    lead = await conn.fetchrow("SELECT name, role FROM lx_users WHERE id=$1", r["lead_id"])
    w = ROLE_WORD.get(lead["role"], "LX") if lead else "LX"
    return {"id": r["id"], "name": r["name"], "lead_id": r["lead_id"], "lead_name": (lead["name"] if lead and lead["name"] else w)}


# ── 단계 판정 ─────────────────────────────────────────────────────────────────
async def _facts(conn, r) -> dict:
    """한 프로젝트의 사실 — 영상 · 표본 · 학습 · 모델 등록 · 결과 확인 · 카드 · 배포(모두 서버 기록에서)."""
    pid, rnd_at = r["id"], r["round_at"]
    # 학습 · 모델은 1차면 이 프로젝트 표본으로 한 것 전부(보관된 학습데이터를 불러와 이미 학습한 모델도 이 프로젝트 것) · 2차부터는 그 회차 시작 뒤 것만
    since = rnd_at if r["round"] > 1 else dt.datetime(2000, 1, 1, tzinfo=dt.timezone.utc)
    regions = r["regions"] or []
    # 영상 — 국내 = /regions 와 같은 판정(영상 범위 ∩ 시군구 경계) · 해외 = 지역 상자와 겹치는 영상
    from .regions import derived
    dv = await derived()
    abroad = _abroad_profiles()
    have = {}
    for g in regions:
        if g.get("abroad"):
            bb = (abroad.get(g["code"]) or {}).get("bbox")
            n = await conn.fetchval("SELECT count(*) FROM imagery WHERE footprint IS NOT NULL AND ST_Intersects(footprint, ST_MakeEnvelope($1,$2,$3,$4,4326))",
                                    *bb) if bb else 0
        else:
            n = len(dv["img"].get(g["code"], []))
        have[g["code"]] = int(n or 0)
    samples = await conn.fetch("SELECT s.id, s.task_name, s.n_images, s.created_at, l.round FROM project_links l JOIN train_samples s ON s.id=l.ref "
                               "WHERE l.project_id=$1 AND l.kind='sample' AND s.status <> 'removed' ORDER BY s.created_at DESC", pid)
    sids = [s["id"] for s in samples]
    jobs = await conn.fetch("SELECT id, state, created_at FROM jobs WHERE kind='train' AND created_at >= $2 AND "
                            "(options->>'project_id' = $1 OR (options->'samples') ?| $3::text[]) ORDER BY created_at DESC",
                            pid, since, sids or ["-"])
    models = await conn.fetch("SELECT id, name, status, created_at, train_job FROM models WHERE sample_id = ANY($1::text[]) AND train_job IS NOT NULL "
                              "AND coalesce(created_at, now()) >= $2 ORDER BY created_at DESC NULLS LAST", sids or ["-"], since)
    model = models[0] if models else None
    reg = next((m for m in models if m["status"] == "registered"), None)
    model_ap = None
    if model and model["status"] in ("pending", "candidate"):
        model_ap = await conn.fetchrow("SELECT state, decision, reason FROM approvals WHERE subject_type='model' AND subject_id=$1 ORDER BY at DESC LIMIT 1",
                                       model["id"])
    card = await conn.fetchval("SELECT ref FROM project_links WHERE project_id=$1 AND kind='card' ORDER BY at LIMIT 1", pid)
    cvs = await conn.fetch("SELECT l.ref, l.round, v.approved_by FROM project_links l JOIN card_versions v ON v.id=l.ref "
                           "WHERE l.project_id=$1 AND l.kind='card_version' ORDER BY l.at DESC", pid)
    cv_now = next((v for v in cvs if v["round"] == r["round"]), None)
    cv_ap = None
    if cv_now:
        cv_ap = await conn.fetchrow("SELECT state, decision, reason FROM approvals WHERE subject_type='card' AND subject_id=$1 ORDER BY at DESC LIMIT 1",
                                    cv_now["ref"])
    published = any(v["approved_by"] for v in cvs)
    deploys = await conn.fetch("SELECT id, stage, sgg_cd, region_name FROM deploys WHERE card_id=$1 AND NOT coalesce(test,false)", card) if card else []
    port_wait = await conn.fetchval("SELECT count(*) FROM approvals WHERE subject_type='deploy' AND state='pending' AND payload->>'action'='port' "
                                    "AND subject_id = ANY($1::text[])", [d["id"] for d in deploys]) if deploys else 0
    # 결과 확인 — 결과 확인 화면(lx-review)의 표본 판정(LX 판정 기록) 중 대상 지역 · 이번 회차 것
    codes = [g["code"] for g in regions if not g.get("abroad")]
    judged = 0
    if codes:
        judged = await conn.fetchval(
            "SELECT count(*) FROM feedback f JOIN survey_findings s ON s.id = f.fid WHERE f.set_id LIKE 'review:%' AND f.note LIKE '검수:%' "
            "AND s.sgg_cd = ANY($1::text[]) AND f.at >= $2", codes, rnd_at) or 0
        judged += await conn.fetchval(
            "SELECT count(*) FROM survey_findings s JOIN lx_users u ON u.id = s.updated_by WHERE s.verdict IS NOT NULL "
            "AND s.sgg_cd = ANY($1::text[]) AND s.updated_at >= $2", codes, rnd_at) or 0
    last = [r["updated_at"], *(s["created_at"] for s in samples[:1]), *(j["created_at"] for j in jobs[:1])]
    ap_last = await conn.fetchval("SELECT max(coalesce(a.decided_at, a.at)) FROM approvals a JOIN project_links l ON l.ref=a.subject_id "
                                  "AND l.kind='card_version' AND a.subject_type='card' WHERE l.project_id=$1", pid)
    last_at = max([x for x in [*last, ap_last] if x], default=None)
    return {"have": have, "samples": samples, "jobs": jobs, "model": model, "last_at": last_at, "reg": reg, "model_ap": model_ap, "card": card, "cv_now": cv_now,
            "cv_ap": cv_ap, "published": published, "deploys": deploys, "port_wait": int(port_wait or 0), "judged": int(judged)}


def _judge(r, f) -> dict:
    """사실 → 단계 6(done · now · wait) + 지금 단계 + 다음 할 일 하나. 막지 않는 길잡이 — 순서가 어긋나도 판정은 조건으로."""
    regions = r["regions"] or []
    st = {k: {"key": k, "label": lb, "done": False, "next": None, "target": {}} for k, lb in STAGES}
    # ① 데이터 올리기
    miss = [g for g in regions if not f["have"].get(g["code"])]
    st["ingest"]["done"] = bool(regions) and not miss
    if miss:
        st["ingest"]["next"] = f"{miss[0]['name']} 영상 올리기" + (f" 외 {len(miss) - 1}곳" if len(miss) > 1 else "")
        st["ingest"]["target"] = {"region": miss[0]["code"]}
    # ② 학습데이터 구축
    smp = f["samples"]
    st["label"]["done"] = bool(smp)
    st["label"]["next"] = None if smp else "라벨 묶음 올리기"
    if smp:
        st["label"]["target"] = {"sample": smp[0]["id"]}
    # ③ 학습 — 이번 회차 표본으로 학습한 모델이 '쓸 수 있음'까지
    m, job = f["model"], (f["jobs"][0] if f["jobs"] else None)
    t = st["train"]
    if smp:
        t["target"] = {"sample": smp[0]["id"]}
    if f["reg"]:
        t["done"] = True
        t["target"] = {**t["target"], "model": f["reg"]["id"]}
    elif job and job["state"] in ("queued", "running") and (not m or m["train_job"] != job["id"]):
        t["next"] = "학습 대기 중" if job["state"] == "queued" else "학습 중"
    elif m:
        t["target"] = {**t["target"], "model": m["id"]}
        ap = f["model_ap"]
        if m["status"] == "pending":
            t["next"] = "모델 등록 승인 대기"
        elif ap and ap["decision"] == "reject":
            t["next"] = "모델 등록 반려 · 사유 확인"
            t["reason"] = ap["reason"]
        else:
            t["next"] = "결과 보고 모델 등록 요청"
    elif job and job["state"] == "failed":
        t["next"] = "학습 다시 시작"
    else:
        t["next"] = "학습 시작" if smp else "라벨 묶음 올린 뒤 학습"
    # ④ 결과 확인 — 대상 지역 표본 판정 한 묶음
    rv = st["review"]
    rv["done"] = f["judged"] >= REVIEW_BATCH
    rv["progress"] = {"n": min(f["judged"], REVIEW_BATCH), "total": REVIEW_BATCH}
    if not rv["done"]:
        rv["next"] = f"표본 확인 {min(f['judged'], REVIEW_BATCH)}/{REVIEW_BATCH}"
    dom = next((g for g in regions if not g.get("abroad")), None)
    if dom:
        rv["target"] = {"region": dom["code"]}
    elif regions:
        rv["next"] = None                   # 해외 지역만 — 결과 확인(필지 표본) 대상이 아니다
        rv["skip"] = True
    # ⑤ 발행 요청 — 이번 회차 카드(또는 새 판) 공개 결재
    pb = st["publish"]
    pb["target"] = {k: v for k, v in (("model", f["reg"]["id"] if f["reg"] else None), ("card", f["card"])) if v}
    if f["cv_now"] and f["cv_now"]["approved_by"]:
        pb["done"] = True
    elif f["cv_ap"] and f["cv_ap"]["state"] == "pending":
        pb["next"] = "공개 결재 대기"
    elif f["cv_ap"] and f["cv_ap"]["decision"] == "reject":
        pb["next"] = "공개 반려 · 사유 확인"
        pb["reason"] = f["cv_ap"]["reason"]
    else:
        pb["next"] = "서비스 카드 발행 요청" if r["round"] == 1 or not f["card"] else "새 판 발행 요청"
    # ⑥ 서비스 관리 — 공개 뒤(끝이 없는 단계)
    op = st["ops"]
    if f["card"]:
        op["target"] = {"card": f["card"]}
    ga = sum(1 for d in f["deploys"] if d["stage"] == "ga")
    pilot = sum(1 for d in f["deploys"] if d["stage"] in ("canary", "shadow"))
    if f["port_wait"]:
        op["next"] = "다른 지역 적용 결재 대기"
    elif not f["deploys"]:
        op["next"] = "다른 지역에 적용 요청"
    else:                                   # 지도 범례와 같은 말(운영 = 전면 · 시범 = 시범 운영)
        op["next"] = " · ".join(x for x in (f"운영 {ga}곳" if ga else "", f"시범 {pilot}곳" if pilot else "") if x) or "적용 진행 중"
        op["status_only"] = True
    # 지금 단계 — 공개됐고 이번 회차 판도 공개됐으면 서비스 관리 · 아니면 앞에서부터 끝나지 않은 첫 단계(건너뛸 단계는 넘어감)
    order = [k for k, _ in STAGES]
    if f["published"] and st["publish"]["done"]:
        cur = 5
    else:
        cur = next((i for i, k in enumerate(order[:5]) if not st[k]["done"] and not st[k].get("skip")), 4)
        if r["round"] > 1 and cur < 2:        # 보완 회차는 학습 단계로 돌아간다(데이터 · 라벨은 앞 회차 것을 이어 쓴다)
            cur = 2 if not st["train"]["done"] else cur
    stages = []
    for i, k in enumerate(order):
        s = st[k]
        state = "now" if i == cur else ("done" if s["done"] else "wait")
        stages.append({"index": i, **{x: y for x, y in s.items() if x != "done"}, "state": state, "done": bool(s["done"])})
    now = stages[cur]
    nxt = {"text": now["next"] or ("운영 중" if now["key"] == "ops" else now["label"]), "stage": now["key"], "target": now["target"],
           "status_only": bool(now.get("status_only"))}
    return {"stages": stages, "stage": {"index": cur, "key": now["key"], "label": now["label"]}, "next": nxt, "published": f["published"]}


def _can(p: Principal, r, members: list[str], published: bool) -> dict:
    mem = _is_member(p, r, members)
    lead = p.user_id == r["lead_id"]
    return {"edit": lead or p.is_admin, "members": lead or p.is_admin, "lead": p.is_admin, "work": mem, "publish": lead,
            "train": mem, "retrain": mem and published, "archive": lead or p.is_admin}


async def view(conn, p: Principal, r, people: dict | None = None, full: bool = True) -> dict:
    people = people or await _people(conn)
    members = await _members(conn, r["id"])
    f = await _facts(conn, r)
    j = _judge(r, f)
    out = {"id": r["id"], "name": r["name"], "task": r["task"], "task_id": r["task_id"],
           "regions": [{k: g.get(k) for k in ("code", "name", "full", "abroad")} for g in (r["regions"] or [])],
           "lead": _who(people, r["lead_id"]), "mine": _is_member(p, r, members),
           "round": env(r["round"], "count", "recorded", "프로젝트 회차"), "state": r["state"],
           "stage": j["stage"], "next": j["next"], "published": j["published"],
           "created_at": _iso(r["created_at"]), "updated_at": _iso(r["updated_at"]), "last_at": _iso(f["last_at"]),
           "lead_is_me": p.user_id == r["lead_id"]}
    if full:
        out.update({"stages": j["stages"],
                    "members": [_who(people, u) for u in members if u != r["lead_id"]],
                    "can": _can(p, r, members, j["published"]),
                    "samples": [{"id": s["id"], "task_name": s["task_name"], "images": env(s["n_images"], "count", "measured", "올린 표본 파일"),
                                 "created_at": _iso(s["created_at"])} for s in f["samples"][:10]],
                    "card": f["card"], "created_by": _who(people, r["created_by"]),
                    "storage": env(int(await conn.fetchval("SELECT coalesce(sum(bytes),0) FROM project_links WHERE project_id=$1", r["id"]) or 0),
                                   "bytes", "measured", "프로젝트 학습데이터 파일(이을 때 잰 크기)"),
                    "rounds": [{"round": env(x.get("round"), "count", "recorded", "프로젝트 회차"), "at": x.get("at"),
                                "by": (_who(people, x.get("by")) or {}).get("name")} for x in (r["rounds"] or [])]})
    return out


# ── 경로 ─────────────────────────────────────────────────────────────────────
@router.get("/projects")
async def list_projects(request: Request, scope: str = "mine"):
    p = _lx(request)
    if scope not in SCOPES:
        raise ApiError("bad_request", "scope 는 " + " | ".join(SCOPES))
    mine = "(p.lead_id=$1 OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id=p.id AND m.user_id=$1))"
    where = {"mine": f"p.state='active' AND {mine}", "led": "p.state='active' AND p.lead_id=$1",
             "joined": "p.state='active' AND p.lead_id<>$1 AND EXISTS (SELECT 1 FROM project_members m WHERE m.project_id=p.id AND m.user_id=$1)",
             "archived": "p.state='archived'" + ("" if p.is_admin else f" AND {mine}"), "all": "p.state='active'"}[scope]
    async with db(realm="lx") as conn:
        people = await _people(conn)
        rows = await conn.fetch(f"SELECT p.* FROM projects p WHERE {where} AND ($1::text IS NOT NULL) ORDER BY p.updated_at DESC LIMIT 200", p.user_id)
        items = [await view(conn, p, r, people, full=False) for r in rows]
        counts = {k: int(await conn.fetchval(f"SELECT count(*) FROM projects p WHERE {w} AND ($1::text IS NOT NULL)", p.user_id))
                  for k, w in (("led", "p.state='active' AND p.lead_id=$1"),
                               ("joined", "p.state='active' AND p.lead_id<>$1 AND EXISTS (SELECT 1 FROM project_members m WHERE m.project_id=p.id AND m.user_id=$1)"),
                               ("archived", "p.state='archived'" + ("" if p.is_admin else f" AND {mine}")), ("all", "p.state='active'"))}
    items.sort(key=lambda x: x.get("last_at") or "", reverse=True)          # 마지막 활동이 최근인 것부터
    return {"items": items, "total": env(len(items), "count", "recorded", SCOPE_WORD[scope]), "scope": scope,
            "counts": {k: env(v, "count", "recorded", SCOPE_WORD[k]) for k, v in counts.items()}, "as_of": now_iso()}


@router.get("/projects/places")
async def places(request: Request):
    _lx(request)
    return {"items": [{k: a[k] for k in ("code", "name", "full", "abroad")} for a in _abroad_profiles().values()], "as_of": now_iso()}


@router.get("/projects/people")
async def people_list(request: Request):
    _lx(request)
    async with db(realm="lx") as conn:
        ppl = await _people(conn)
    items = [{"id": x["id"], "name": x["name"], "role_label": x["role_label"]} for x in ppl.values() if x["active"] and x["role"] in ("staff", "admin")]
    return {"items": sorted(items, key=lambda x: (x["role_label"], x["name"])), "as_of": now_iso()}


@router.post("/projects", status_code=201)
async def create(body: dict, request: Request):
    """프로젝트 만들기 — 입력은 이름 · 무엇을 · 어디 세 칸. 관리자 승인 없이 바로 만들어진다(R-D3 갈림길 ⓐ). 프로젝트장 = 만든 직원."""
    p = _lx(request)
    name = str(body.get("name") or "").strip()[:NAME_MAX]
    task = str(body.get("task") or "").strip()[:TASK_MAX]
    if not name:
        raise ApiError("bad_request", "프로젝트 이름을 적어 주세요")
    if not task:
        raise ApiError("bad_request", "무엇을 하는지(업무 · 탐지 대상) 골라 주세요")
    regions = clean_regions(body.get("regions"))
    task_id = str(body.get("task_id") or "").strip()[:40] or None
    pid = "prj_" + secrets.token_hex(5)
    async with db(realm="lx") as conn:
        await conn.execute("INSERT INTO projects(id, name, task, task_id, regions, lead_id, round, round_at, rounds, created_by) "
                           "VALUES ($1,$2,$3,$4,$5,$6,1,now(),$7,$6)", pid, name, task, task_id, regions, p.user_id,
                           [{"round": 1, "at": now_iso(), "by": p.user_id}])
        await audit(conn, p, "project.create", pid, None, {"name": name, "task": task, "regions": [g["code"] for g in regions]})
        out = await view(conn, p, await _row(conn, pid))
    from .jobs import ops_event
    await ops_event("project.changed", {"project_id": pid, "action": "create", "by": p.user_id, "at": now_iso()})
    return {**out, "as_of": now_iso()}


@router.get("/projects/{pid}")
async def get_project(pid: str, request: Request):
    p = _lx(request)
    async with db(realm="lx") as conn:
        out = await view(conn, p, await _row(conn, pid))
    return {**out, "as_of": now_iso()}


@router.patch("/projects/{pid}")
async def patch_project(pid: str, body: dict, request: Request):
    p = _lx(request)
    async with db(realm="lx") as conn:
        r = await _row(conn, pid)
        if "lead_id" in body:                      # 프로젝트장 바꾸기 = LX 관리자(확인 대장 1 · R-D3 §3-4)
            if not p.is_admin:
                raise ApiError("forbidden", "프로젝트장은 LX 관리자가 바꿉니다")
            nl = str(body.get("lead_id") or "")
            u = await conn.fetchrow("SELECT id, role, status FROM lx_users WHERE id=$1", nl)
            if not u or u["status"] != "active" or u["role"] not in ("staff", "admin"):
                raise ApiError("bad_request", "LX 직원 · 관리자만 프로젝트장이 됩니다")
            await conn.execute("UPDATE projects SET lead_id=$2, updated_at=now() WHERE id=$1", pid, nl)
            await conn.execute("DELETE FROM project_members WHERE project_id=$1 AND user_id=$2", pid, nl)
            if r["lead_id"] != nl:                 # 앞 프로젝트장은 구성원으로 남긴다(이력 · 일이 끊기지 않게)
                await conn.execute("INSERT INTO project_members(project_id, user_id, added_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
                                   pid, r["lead_id"], p.user_id)
            await audit(conn, p, "project.lead", pid, {"lead_id": r["lead_id"]}, {"lead_id": nl})
        edits = {k: body[k] for k in ("name", "task", "task_id", "regions") if k in body}
        if edits:
            if not (p.user_id == r["lead_id"] or p.is_admin):
                raise ApiError("forbidden", "프로젝트장이 고칩니다")
            name = str(edits.get("name", r["name"]) or "").strip()[:NAME_MAX]
            task = str(edits.get("task", r["task"]) or "").strip()[:TASK_MAX]
            if not name or not task:
                raise ApiError("bad_request", "이름과 무엇을은 비울 수 없습니다")
            regions = clean_regions(edits["regions"]) if "regions" in edits else r["regions"]
            tid = (str(edits.get("task_id") or "").strip()[:40] or None) if "task_id" in edits else r["task_id"]
            await conn.execute("UPDATE projects SET name=$2, task=$3, task_id=$4, regions=$5, updated_at=now() WHERE id=$1", pid, name, task, tid, regions)
            await audit(conn, p, "project.edit", pid, {"name": r["name"], "task": r["task"]}, {"name": name, "task": task})
        out = await view(conn, p, await _row(conn, pid))
    return {**out, "as_of": now_iso()}


@router.post("/projects/{pid}/members", status_code=201)
async def add_member(pid: str, body: dict, request: Request):
    p = _lx(request)
    uid = str(body.get("user_id") or "")
    async with db(realm="lx") as conn:
        r = await _row(conn, pid)
        if not (p.user_id == r["lead_id"] or p.is_admin):
            raise ApiError("forbidden", "구성원은 프로젝트장이 더합니다")
        u = await conn.fetchrow("SELECT id, role, status FROM lx_users WHERE id=$1", uid)
        if not u or u["status"] != "active" or u["role"] not in ("staff", "admin"):
            raise ApiError("bad_request", "LX 직원 · 관리자만 구성원이 됩니다")
        if uid != r["lead_id"]:
            await conn.execute("INSERT INTO project_members(project_id, user_id, added_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", pid, uid, p.user_id)
            await conn.execute("UPDATE projects SET updated_at=now() WHERE id=$1", pid)
            await audit(conn, p, "project.member.add", pid, None, {"user_id": uid})
        out = await view(conn, p, await _row(conn, pid))
    return {**out, "as_of": now_iso()}


@router.delete("/projects/{pid}/members/{uid}")
async def remove_member(pid: str, uid: str, request: Request):
    p = _lx(request)
    async with db(realm="lx") as conn:
        r = await _row(conn, pid)
        if not (p.user_id == r["lead_id"] or p.is_admin):
            raise ApiError("forbidden", "구성원은 프로젝트장이 뺍니다")
        await conn.execute("DELETE FROM project_members WHERE project_id=$1 AND user_id=$2", pid, uid)
        await audit(conn, p, "project.member.remove", pid, {"user_id": uid}, None)
        out = await view(conn, p, await _row(conn, pid))
    return {**out, "as_of": now_iso()}


@router.post("/projects/{pid}/samples", status_code=201)
async def add_sample(pid: str, body: dict, request: Request):
    """보관된 학습 표본을 이 프로젝트의 학습데이터로 더한다(원칙 74 — 아카이브된 학습데이터 불러와 학습에 더하기)."""
    p = _lx(request)
    sid = str(body.get("sample_id") or "")
    async with db(realm="lx") as conn:
        await require_member(conn, p, pid)
        if not await conn.fetchval("SELECT 1 FROM train_samples WHERE id=$1 AND status <> 'removed'", sid):
            raise ApiError("not_found", "학습 표본이 없습니다")
        await link(conn, pid, "sample", sid, p.user_id)
        await audit(conn, p, "project.sample", pid, None, {"sample_id": sid})
        out = await view(conn, p, await _row(conn, pid))
    return {**out, "as_of": now_iso()}


@router.post("/projects/{pid}/archive")
async def archive(pid: str, body: dict, request: Request):
    """끝난 프로젝트 보관 · 다시 열기 — 프로젝트장 · 관리자. 기록(표본 · 카드 · 이력)은 그대로 두고 '내 프로젝트'에서만 빠진다.
    공개된 서비스는 그대로 돈다(담당 = 그 프로젝트장 그대로)."""
    p = _lx(request)
    on = body.get("archived", True) is not False
    async with db(realm="lx") as conn:
        r = await _row(conn, pid)
        if not (p.user_id == r["lead_id"] or p.is_admin):
            raise ApiError("forbidden", "보관은 프로젝트장이 합니다")
        await conn.execute("UPDATE projects SET state=$2, updated_at=now() WHERE id=$1", pid, "archived" if on else "active")
        await audit(conn, p, "project.archive" if on else "project.reopen", pid, {"state": r["state"]}, {"state": "archived" if on else "active"})
        out = await view(conn, p, await _row(conn, pid))
    return {**out, "as_of": now_iso()}


@router.post("/projects/{pid}/rounds", status_code=201)
async def next_round(pid: str, request: Request, body: dict | None = None):
    """재학습 — 같은 프로젝트가 다음 회차로 학습 단계에 돌아간다(새 프로젝트를 만들지 않는다 · 이력이 한 줄로 이어진다).
    공개된 서비스만 · 프로젝트장과 구성원만(역할-3 ⓑ). 재학습 결과의 배포는 관리자 승인(모델 등록 · 새 판 공개 결재)."""
    p = _lx(request)
    async with db(realm="lx") as conn:
        r = await require_member(conn, p, pid)
        f = await _facts(conn, r)
        if not f["published"]:
            raise ApiError("conflict", "공개 전에는 같은 회차에서 다시 학습합니다", status=409)
        busy = [j for j in f["jobs"] if j["state"] in ("queued", "running")]
        if busy:
            raise ApiError("conflict", "이번 회차 학습이 아직 돌고 있습니다", status=409)
        n = int(r["round"]) + 1
        hist = list(r["rounds"] or []) + [{"round": n, "at": now_iso(), "by": p.user_id, "reason": str((body or {}).get("reason") or "")[:200] or None}]
        await conn.execute("UPDATE projects SET round=$2, round_at=now(), rounds=$3, updated_at=now() WHERE id=$1", pid, n, hist)
        await audit(conn, p, "project.round", pid, {"round": r["round"]}, {"round": n})
        out = await view(conn, p, await _row(conn, pid))
    from .jobs import ops_event
    await ops_event("project.changed", {"project_id": pid, "action": "round", "round": n, "by": p.user_id, "at": now_iso()})
    return {**out, "as_of": now_iso()}


# ── 재학습 권한(역할-3 ⓑ) — jobs 견적(학습)이 부른다 ─────────────────────────────────
async def guard_train(p: Principal, samples, base_model: str | None, project_id: str | None) -> None:
    """서비스가 공개된 프로젝트의 학습은 그 프로젝트장 · 구성원만. 이 학습이 어느 프로젝트의 것인가 =
    ① 본문 project_id(밝혔으면 그것만) ② 없으면 고른 학습 표본이 이어진 프로젝트 ③ 표본도 없이 모델만 다시 학습하면 그 모델을 만든(또는 그 모델로 공개된) 프로젝트.
    공개 전 프로젝트 · 프로젝트와 무관한 학습은 그대로(지금까지와 같다)."""
    sids = [str(x) for x in (samples if isinstance(samples, list) else [samples] if samples else []) if x]
    async with db(realm="lx") as conn:
        pids = set()
        if project_id:                      # 어느 프로젝트의 학습인지 밝혔으면 그 프로젝트로 판정(다른 프로젝트의 보관 표본을 불러와 더해 쓸 수 있다)
            if not await conn.fetchval("SELECT 1 FROM projects WHERE id=$1", str(project_id)):
                raise ApiError("not_found", "프로젝트가 없습니다")
            pids.add(str(project_id))
        elif sids:
            pids |= {x["project_id"] for x in await conn.fetch("SELECT project_id FROM project_links WHERE kind='sample' AND ref = ANY($1::text[])", sids)}
        elif base_model:
            pids |= {x["project_id"] for x in await conn.fetch(
                "SELECT l.project_id FROM models m JOIN project_links l ON l.kind='sample' AND l.ref=m.sample_id WHERE m.id=$1 "
                "UNION SELECT l.project_id FROM card_versions v JOIN project_links l ON l.kind='card_version' AND l.ref=v.id WHERE $1 = ANY(v.model_ids)",
                base_model)}
        for pid in pids:
            r = await conn.fetchrow("SELECT * FROM projects WHERE id=$1", pid)
            if not r:
                continue
            pub = await conn.fetchval("SELECT 1 FROM project_links l JOIN card_versions v ON v.id=l.ref WHERE l.project_id=$1 AND l.kind='card_version' "
                                      "AND v.approved_by IS NOT NULL LIMIT 1", pid)
            if pub and not _is_member(p, r, await _members(conn, pid)):
                raise ApiError("forbidden", "공개된 서비스의 재학습은 프로젝트장과 구성원만 시작합니다", {"project": r["name"]})
