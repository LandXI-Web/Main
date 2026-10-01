"""프로젝트 — LX 직원의 일 단위(구현 2차 T1 '프로젝트 백본').

확인 대장: 3차 R-D3(프로젝트 = 무엇 · 어디 · 담당 · 단계 6 · 첫 화면 '내 프로젝트') · R-D3 갈림길 ⓐ(직원이 바로 만든다 · 관리자 승인 없음) ·
          4차 P1(프로젝트 → 서비스 카드 발행 요청) · 5차 역할-3 ⓑ(공개된 서비스의 재학습 = 프로젝트장이 시작 · 배포만 관리자 승인) ·
          6차 흐름-1(LX 직원 원스톱 13단계 — 프로젝트 안 단계 6). 원칙 44 · 46 · 49 · 51 · 55 · 61.

GET    /projects?scope=mine|led|joined|archived|all
                                         mine = 내가 만든(프로젝트장) + 참여한(구성원) 진행 중 · led · joined 는 그 한쪽 · archived = 내 보관(끝난) 프로젝트
                                         (관리자는 전체 보관) · all = LX 전체 진행 중. 줄마다 지금 단계 · 다음 할 일 하나 · 마지막 활동
                                         · steps(단계 6의 칸 상태 done|now|wait|skip — 목록의 6칸 진행 막대) · blocked(막힌 곳 — 반려 · 앞 단계 남음 · 결재 대기. 한 장과 같은 판정)
POST   /projects                         {name, task, task_id?, regions:[code..]} → 바로 만들어진다 · 프로젝트장 = 만든 직원
GET    /projects/places                  대상 지역 고르기의 해외 항목(국내 시군구는 GET /regions)
GET    /projects/people                  구성원 고르기(LX 직원 · 관리자)
GET    /projects/{pid}                   한 장 — 단계 6(완료 조건 자동 판정) · 다음 할 일 · 구성원 · 할 수 있는 것(can)
PATCH  /projects/{pid}                   {name?, task?, task_id?, regions?} 프로젝트장 · 관리자 / {lead_id} LX 관리자만
POST   /projects/{pid}/members           {user_id} 프로젝트장 · 관리자
DELETE /projects/{pid}/members/{uid}     프로젝트장 · 관리자
POST   /projects/{pid}/samples           {sample_id} 보관된 학습 표본을 이 프로젝트 학습데이터로 더한다(프로젝트장 · 구성원)
POST   /projects/{pid}/archive           {archived: true|false} 끝난 프로젝트 보관 · 다시 열기(프로젝트장 · 관리자) — 기록은 지우지 않는다
POST   /projects/{pid}/rounds            {reason} 재학습 — 같은 프로젝트의 다음 회차(학습 단계로 돌아감). 공개된 서비스만 · 프로젝트장만.
                                         reason(왜 다시 학습하나 한 줄)은 회차 기록 · 감사 기록에 남고 LX 관리자 결재함(그 회차의 모델 등록 · 새 판 공개)에 같은 말로 보인다
POST   /projects/{pid}/handover          {to, note?} 프로젝트장 넘기기 — 프로젝트장 본인 · LX 관리자(확인 17차 P-5 ⓐ · 원칙 105).
                                         받는 사람에게 알림 한 줄(lx_notices) · 기록 한 줄 · 넘긴 사람은 구성원으로 남는다 · 아직 답하지 않은 기관 검토 요청 · 확인 대기 분석 요청의 받는 사람도 함께
GET    /projects/notices                 나에게 온 알림(본 적 없는 것 — 지금은 프로젝트장 넘겨받음) · POST /projects/notices/{id}/seen 본 때 찍기
GET    /projects/{pid}/log               기록 · 메모 · 파일(확인 17차 P-4 ⓐ) — 자동 기록(감사 기록의 그 프로젝트 줄 · 학습 표본 · 학습 · 결재 · 적용 · 회차 · 넘기기) + 메모 + 파일.
                                         구성원 · 프로젝트장 · LX 관리자만(기관은 안 봄 — 기관과의 대화는 검토 요청). 거르기 = all | auto | memo | file
POST   /projects/{pid}/notes             {text} 메모 한 줄 · POST /projects/{pid}/files (multipart file · text?) 파일 올리기(작은 문서 · 그림 · 크기 한도 · 형식 제한)
GET    /projects/{pid}/files/{nid}       올린 파일 내려받기(같은 사람들만)
DELETE /projects/{pid}/notes/{nid}       메모 · 파일 지우기(제안 S-20) — 쓴 사람 본인 · 프로젝트장 · LX 관리자. 파일은 저장 폴더에서 빠지고(저장 공간이 줄어듦)
                                         내용(글 · 파일 이름)은 남기지 않는다. 기록에는 '누가 · 메모를 지움 / 파일을 지움' 한 줄
기록(GET …/log)의 lead_storage · 파일 올리기 답의 lead_storage = 프로젝트장의 저장 용량(할당 · 쓴 비율 · 90% 넘음) — 파일 올리는 자리의 한 줄 · 창(S-19 · 막지 않음)

단계 6(흐름-1 의 LX 직원 부분 · 레일 순서): 데이터 올리기 → 학습데이터 구축 → 학습 → 결과 확인 → 발행 요청 → 서비스 관리.
완료 조건(자동 · 막지 않는 길잡이 — R-D3 §3-2):
  데이터 올리기   대상 지역마다 영상 1개 이상(영상 범위 ∩ 지역 경계 — /regions 와 같은 판정)
  학습데이터 구축 이 프로젝트의 학습 표본(라벨 묶음) 1개 이상
  학습           이번 회차 표본으로 학습한 모델이 '쓸 수 있음'(등록 승인)까지
  결과 확인       대상 지역에서 결과 확인(표본 판정) 한 묶음(20건) — 결과 확인 화면이 한 번에 보는 표본 수
  발행 요청       이번 회차 서비스 카드(또는 새 판)의 공개 결재 승인
  서비스 관리     끝이 없는 단계 — 공개 뒤. 다음 할 일 = 다른 지역에 적용 · 적용 결재 대기
판단 기준 표시(정밀도 기준값 등 · 6차 판단-1·2)는 보류라 여기서 판정하지 않는다.

재학습 권한(역할-3 ⓑ '프로젝트장이 시작, 배포만 승인' · 구현 확인 2차 J-2 '재학습은 프로젝트장만'): 서비스가 공개된 프로젝트의 학습(POST /jobs kind train —
이 프로젝트 표본 · 이 프로젝트 모델)과 다음 회차 시작(POST /projects/{id}/rounds)은 **프로젝트장만**. 구성원 · 다른 직원 · 관리자는 서버가 거절한다
(guard_train · jobs 견적이 부른다 · next_round). 공개 전 학습은 프로젝트장과 구성원(지금과 같다). 재학습 결과의 배포는 관리자 승인(모델 등록 · 새 판 공개 결재 · 배포본 모델 교체는 관리자).
"""
from __future__ import annotations

import datetime as dt
import re
import secrets

from fastapi import APIRouter, File, Form, Request, UploadFile
from fastapi.responses import FileResponse

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
REASON_MAX, NOTE_MAX = 200, 300
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


def _name(people: dict, uid: str | None) -> str:
    """기록 줄의 '누가' — 사용 중인 계정은 이름, 사용 중지된 옛 아이디(0015 메일 아이디 정리 · 옛 기록은 그대로)는 역할 말만(시험용 이름을 내지 않는다)."""
    if not uid or uid == "system":
        return "자동"
    x = people.get(uid)
    if not x:
        return "LX"
    return x["name"] if x["active"] else x["role_label"]


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


# ── 저장 공간(한 출처) — 프로젝트 = 이은 학습데이터 파일(이을 때 잰 크기) + 올린 파일 · 사람 = 내가 프로젝트장인 프로젝트의 합 ──────────
# 사용자 7차 답 데이터-1 "직원이 프로젝트를 개설해도 개인의 허용된 정책 안에서" · 17차 P-5 "내 정보에는 할당된 자원(저장 용량)도".
# 프로젝트 한 장의 storage 와 내 정보의 '지금 쓴 양'이 같은 식을 쓴다(숫자 한 출처).
_PROJECT_BYTES = ("(SELECT coalesce(sum(l.bytes),0) FROM project_links l WHERE l.project_id = {p})"
                  " + (SELECT coalesce(sum(n.bytes),0) FROM project_notes n WHERE n.project_id = {p} AND n.removed_at IS NULL)")


async def project_bytes(conn, pid: str) -> int:
    return int(await conn.fetchval("SELECT " + _PROJECT_BYTES.format(p="$1"), pid) or 0)


STORAGE_DEFAULT_KEY = "storage.default_quota_gb"   # lx_settings — 따로 정하지 않은 계정의 할당(LX 관리자가 계정 관리에서 정한다 · 없으면 할당 없음)
STORAGE_WARN_PCT = 90                               # 할당의 이만큼을 넘으면 내 정보 · 파일 올리는 자리에 한 줄 + 창(막지는 않는다 — S-19 · 원칙 91 · 109)


async def storage_default(conn) -> float | None:
    v = await conn.fetchval("SELECT value FROM lx_settings WHERE key=$1", STORAGE_DEFAULT_KEY)
    try:
        return float(v) if v is not None else None
    except (TypeError, ValueError):
        return None


def storage_state(used: int, own, default) -> dict:
    """할당(따로 정한 값 → 없으면 기본값 → 없으면 None '할당 없음') · 쓴 비율 · 90% 넘음. 1 GB = 10^9 바이트(서버 사용 현황 · 화면과 같은 단위)."""
    q = float(own) if own is not None else default
    pct = int(round(used / (q * 1e9) * 100)) if q else None
    return {"quota_gb": q, "quota_own": own is not None, "default_gb": default, "pct": pct, "warn": pct is not None and pct >= STORAGE_WARN_PCT}


async def lead_storage(conn, uid: str) -> dict:
    """내 저장 용량 — 내가 프로젝트장인 프로젝트(진행 중 · 보관)의 저장 공간 합 · 할당(lx_users.storage_quota_gb → 없으면 기본 할당 → 없으면 None).
    → {bytes, projects, quota_gb, quota_own, default_gb, pct, warn}. 할당 값이 없으면 지어내지 않는다(할당 없음)."""
    r = await conn.fetchrow("SELECT count(*) AS n, coalesce(sum(" + _PROJECT_BYTES.format(p="p.id") + "),0) AS b FROM projects p WHERE p.lead_id=$1", uid)
    q = await conn.fetchval("SELECT storage_quota_gb FROM lx_users WHERE id=$1", uid)
    used = int(r["b"] or 0)
    return {"bytes": used, "projects": int(r["n"] or 0), **storage_state(used, q, await storage_default(conn))}


async def storage_all(conn) -> dict:
    """LX 계정마다 저장 용량(계정 관리 목록) — lead_storage 와 같은 식을 한 번에. → {uid: {bytes, projects, quota_gb, …}}"""
    d = await storage_default(conn)
    rows = await conn.fetch("SELECT u.id, u.storage_quota_gb AS q, count(p.id) AS n, coalesce(sum(" + _PROJECT_BYTES.format(p="p.id") + "),0) AS b "
                            "FROM lx_users u LEFT JOIN projects p ON p.lead_id = u.id GROUP BY u.id, u.storage_quota_gb")
    return {r["id"]: {"bytes": int(r["b"] or 0), "projects": int(r["n"] or 0), **storage_state(int(r["b"] or 0), r["q"], d)} for r in rows}


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
    holds: dict[str, str] = {}              # 단계 → 'wait'(결재 대기) · 'reject'(반려) — 목록의 '막힌 곳'이 쓴다(아래 blocked)
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
            holds["train"] = "wait"
        elif ap and ap["decision"] == "reject":
            t["next"] = "모델 등록 반려 · 사유 확인"
            t["reason"] = ap["reason"]
            holds["train"] = "reject"
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
        holds["publish"] = "wait"
    elif f["cv_ap"] and f["cv_ap"]["decision"] == "reject":
        pb["next"] = "공개 반려 · 사유 확인"
        pb["reason"] = f["cv_ap"]["reason"]
        holds["publish"] = "reject"
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
        holds["ops"] = "wait"
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
    return {"stages": stages, "stage": {"index": cur, "key": now["key"], "label": now["label"]}, "next": nxt, "published": f["published"],
            "steps": [("skip" if s.get("skip") and s["state"] != "now" else s["state"]) for s in stages], "blocked": _blocked(stages, cur, holds)}


_KIND_ORDER = {"reject": 0, "before": 1, "wait": 2}


def _blocked(stages: list, cur: int, holds: dict) -> list[dict]:
    """막힌 곳 — 같은 판정에서: 반려 · 앞 단계가 남음(지금 단계보다 앞인데 끝나지 않았고 건너뛰는 단계도 아님) · 결재 대기.
    목록의 한 칸이 첫 줄만 보이도록 '내가 손댈 것'부터 — 반려 → 앞 단계 남음 → 결재 대기(남이 처리), 같으면 단계 순서. 없으면 빈 목록."""
    out = []
    for i, s in enumerate(stages):
        k = s["key"]
        if holds.get(k):
            out.append({"kind": holds[k], "stage": k, "label": s["label"], "text": s["next"]})
        elif i < cur and not s["done"] and not s.get("skip"):
            prog = s.get("progress")
            out.append({"kind": "before", "stage": k, "label": s["label"],
                        "text": f"{s['label']} {prog['n']}/{prog['total']}" if prog else f"{s['label']} 남음"})
    out.sort(key=lambda b: (_KIND_ORDER[b["kind"]], [x["key"] for x in stages].index(b["stage"])))
    return out


def _can(p: Principal, r, members: list[str], published: bool) -> dict:
    mem = _is_member(p, r, members)
    lead = p.user_id == r["lead_id"]
    # 공개된 서비스의 재학습(학습 시작 · 다음 회차) = 프로젝트장만(역할-3 ⓑ · J-2) — 관리자도 아니다(관리자는 프로젝트장을 바꾸고 배포를 승인한다)
    # 프로젝트장 넘기기 = 프로젝트장 본인 · LX 관리자(확인 17차 P-5 ⓐ) · 기록 · 메모 · 파일 = 구성원 · 프로젝트장 · LX 관리자(P-4 ⓐ — 기관은 안 봄)
    return {"edit": lead or p.is_admin, "members": lead or p.is_admin, "lead": lead or p.is_admin, "work": mem, "publish": lead,
            "train": lead if published else mem, "retrain": lead and published, "archive": lead or p.is_admin,
            "log": mem or p.is_admin}


async def _cards(conn, pid: str) -> list[str]:
    return [x["ref"] for x in await conn.fetch("SELECT ref FROM project_links WHERE project_id=$1 AND kind='card'", pid)]


async def _sample_ids(conn, pid: str) -> list[str]:
    return [x["ref"] for x in await conn.fetch("SELECT ref FROM project_links WHERE project_id=$1 AND kind='sample'", pid)]


_TRAIN_OF = "kind='train' AND (options->>'project_id' = $1 OR (options->'samples') ?| $2::text[])"


async def _basis(conn, r, f, blocked: list) -> dict:
    """재학습 근거(확인 17차 P-3 ⓐ) — 시간 띠 하나(서버 기록의 실제 시각) + 칩 셋(기관 검토 요청 · 새 영상 시점 · 앞 단계 남음) + 근거가 적은가.
    띠의 점: 학습 표본 · 학습 끝 · 모델 승인 · 서비스 공개 · n차 시작 · 프로젝트 만듦 · (마지막 학습 뒤) 새 영상 · 기관 검토 요청 — 시각순, 지금 앞에 넷까지
    (넘치면 '프로젝트 만듦' 부터 · 그다음 오래된 것부터 뺀다). 근거가 적어도 막지 않는다(원칙 70 — 참고 표시, 판단은 프로젝트장)."""
    pid = r["id"]
    sids = await _sample_ids(conn, pid)
    trained = await conn.fetchval(f"SELECT max(finished_at) FROM jobs WHERE state='done' AND {_TRAIN_OF}", pid, sids or ["-"])
    model_ok = await conn.fetchval("SELECT max(a.decided_at) FROM approvals a JOIN models m ON m.id = a.subject_id WHERE a.subject_type='model' "
                                   "AND a.decision='approve' AND m.sample_id = ANY($1::text[])", sids or ["-"])
    pub = await conn.fetchval("SELECT max(v.approved_at) FROM project_links l JOIN card_versions v ON v.id = l.ref "
                              "WHERE l.project_id=$1 AND l.kind='card_version' AND v.approved_by IS NOT NULL", pid)
    since = trained or r["created_at"]
    cards = await _cards(conn, pid)
    rv = await conn.fetchrow("SELECT count(*) AS n, max(at) AS last FROM feedback WHERE kind='review' AND card_id = ANY($1::text[]) AND at > $2",
                             cards or ["-"], since)
    # 새 영상 시점 — 마지막 학습 뒤 대상 지역에 등록된 영상(지역 판정은 단계 판정 · /regions 와 같다)
    from .regions import derived
    dv = await derived()
    ids = {i["id"] for g in (r["regions"] or []) if not g.get("abroad") for i in dv["img"].get(g["code"], [])}
    img = await conn.fetchrow("SELECT count(*) AS n, max(registered_at) AS last FROM imagery WHERE id = ANY($1::text[]) AND registered_at > $2",
                              list(ids) or ["-"], since)
    n_img = int(img["n"] or 0)
    ab = _abroad_profiles()
    for g in r["regions"] or []:
        bb = (ab.get(g["code"]) or {}).get("bbox") if g.get("abroad") else None
        if bb:
            x = await conn.fetchrow("SELECT count(*) AS n, max(registered_at) AS last FROM imagery WHERE footprint IS NOT NULL AND registered_at > $5 "
                                    "AND ST_Intersects(footprint, ST_MakeEnvelope($1,$2,$3,$4,4326))", *bb, since)
            n_img += int(x["n"] or 0)
            if x["last"] and (not img["last"] or x["last"] > img["last"]):
                img = {"n": img["n"], "last": x["last"]}
    pts = []
    smp = f["samples"][0] if f["samples"] else None
    if smp:
        pts.append({"kind": "sample", "label": f"표본 {int(smp['n_images'] or 0):,}장" if smp["n_images"] else "학습 표본", "at": smp["created_at"]})
    if trained:
        pts.append({"kind": "train", "label": "학습 끝", "at": trained})
    if model_ok:
        pts.append({"kind": "model", "label": "모델 승인", "at": model_ok})
    if pub:
        pts.append({"kind": "publish", "label": "서비스 공개", "at": pub})
    for x in r["rounds"] or []:
        if (x.get("round") or 1) > 1 and x.get("at"):
            pts.append({"kind": "round", "label": f"{x['round']}차 시작", "at": dt.datetime.fromisoformat(x["at"])})
    pts.append({"kind": "created", "label": "프로젝트 만듦", "at": r["created_at"]})
    if n_img and img["last"]:
        pts.append({"kind": "imagery", "label": "새 영상", "at": img["last"], "signal": True})
    if rv["n"] and rv["last"]:
        pts.append({"kind": "review", "label": f"검토 요청 {int(rv['n'])}건", "at": rv["last"], "signal": True})
    pts.sort(key=lambda x: x["at"])
    while len(pts) > 4:
        drop = next((x for x in pts if x["kind"] == "created"), None) or next((x for x in pts if not x.get("signal")), pts[0])
        pts.remove(drop)
    before = next((b for b in blocked if b["kind"] == "before"), None)
    return {"points": [{**x, "at": _iso(x["at"])} for x in pts], "now": now_iso(), "trained_at": _iso(trained),
            "reviews": env(int(rv["n"] or 0), "count", "recorded", "기관 검토 요청(마지막 학습 뒤 · 이 프로젝트 서비스)"),
            "imagery": env(n_img, "count", "recorded", "새 영상(마지막 학습 뒤 · 대상 지역에 등록)"),
            "before": before["text"] if before else None,
            "thin": not rv["n"] and not n_img}


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
           "steps": j["steps"], "blocked": j["blocked"],
           "created_at": _iso(r["created_at"]), "updated_at": _iso(r["updated_at"]), "last_at": _iso(f["last_at"]),
           "lead_is_me": p.user_id == r["lead_id"]}
    if full:
        out.update({"stages": j["stages"],
                    "members": [_who(people, u) for u in members if u != r["lead_id"]],
                    "can": _can(p, r, members, j["published"]),
                    "samples": [{"id": s["id"], "task_name": s["task_name"], "images": env(s["n_images"], "count", "measured", "올린 표본 파일"),
                                 "created_at": _iso(s["created_at"])} for s in f["samples"][:10]],
                    "card": f["card"], "created_by": _who(people, r["created_by"]),
                    "storage": env(await project_bytes(conn, r["id"]), "bytes", "measured",
                                   "프로젝트 저장 공간(학습데이터 파일 — 이을 때 잰 크기 + 올린 파일)"),
                    "rounds": [{"round": env(x.get("round"), "count", "recorded", "프로젝트 회차"), "at": x.get("at"),
                                "by": (_who(people, x.get("by")) or {}).get("name"), "reason": x.get("reason")} for x in (r["rounds"] or [])],
                    # 재학습 근거(띠 · 칩) — 재학습 칸이 열리는 공개된 서비스만
                    "basis": await _basis(conn, r, f, j["blocked"]) if j["published"] else None})
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


@router.get("/projects/notices")
async def notices(request: Request):
    """나에게 온 알림 중 아직 안 본 것(프로젝트장 넘겨받음 — P-5 ⓐ · 저장 용량 늘리기 요청 승인 · 반려 — S-19). 대시보드 '내 프로젝트' · 프로젝트 목록 맨 위에 한 줄씩.
    by_word · note_word = 덧말의 이름표(넘긴 사람 · 메모 / 처리한 사람 · 사유)."""
    p = _lx(request)
    async with db(realm="lx") as conn:
        people = await _people(conn)
        rows = await conn.fetch("SELECT n.id, n.kind, n.project_id, n.text, n.note, n.by, n.at, p.name AS pname FROM lx_notices n "
                                "LEFT JOIN projects p ON p.id = n.project_id WHERE n.user_id=$1 AND n.seen_at IS NULL ORDER BY n.at DESC LIMIT 20", p.user_id)
    words = {"project.lead": ("넘긴 사람", "메모"), "account.storage": ("처리한 사람", "사유")}
    items = [{"id": x["id"], "kind": x["kind"], "project": {"id": x["project_id"], "name": x["pname"]} if x["project_id"] else None,
              "text": x["text"], "note": x["note"], "by": _name(people, x["by"]), "at": _iso(x["at"]),
              "by_word": words.get(x["kind"], ("보낸 사람", "메모"))[0], "note_word": words.get(x["kind"], ("보낸 사람", "메모"))[1]} for x in rows]
    return {"items": items, "total": env(len(items), "count", "recorded", "lx_notices(본 적 없는 것)"), "as_of": now_iso()}


@router.post("/projects/notices/{nid}/seen")
async def notice_seen(nid: str, request: Request):
    p = _lx(request)
    async with db(realm="lx") as conn:
        n = await conn.execute("UPDATE lx_notices SET seen_at=now() WHERE id=$1 AND user_id=$2 AND seen_at IS NULL", nid, p.user_id)
    return {"ok": n.endswith("1"), "as_of": now_iso()}


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
        if "lead_id" in body:                      # 프로젝트장 바꾸기 = 넘기기와 같은 길(프로젝트장 본인 · LX 관리자 — 확인 17차 P-5 ⓐ)
            if str(body.get("lead_id") or "") != r["lead_id"]:
                await _handover(conn, p, r, str(body.get("lead_id") or ""), None)
                r = await _row(conn, pid)
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
    공개된 서비스만 · 프로젝트장만(역할-3 ⓑ · J-2). 재학습 결과의 배포는 관리자 승인(모델 등록 · 새 판 공개 결재)."""
    p = _lx(request)
    async with db(realm="lx") as conn:
        r = await _row(conn, pid)
        if p.user_id != r["lead_id"]:
            raise ApiError("forbidden", RETRAIN_LEAD)
        f = await _facts(conn, r)
        if not f["published"]:
            raise ApiError("conflict", "공개 전에는 같은 회차에서 다시 학습합니다", status=409)
        busy = [j for j in f["jobs"] if j["state"] in ("queued", "running")]
        if busy:
            raise ApiError("conflict", "이번 회차 학습이 아직 돌고 있습니다", status=409)
        n = int(r["round"]) + 1
        reason = " ".join(str((body or {}).get("reason") or "").split())[:REASON_MAX] or None     # 왜 다시 학습하나(P-3 ⓐ — 화면의 작은 창에서 하나)
        hist = list(r["rounds"] or []) + [{"round": n, "at": now_iso(), "by": p.user_id, "reason": reason}]
        await conn.execute("UPDATE projects SET round=$2, round_at=now(), rounds=$3, updated_at=now() WHERE id=$1", pid, n, hist)
        await audit(conn, p, "project.round", pid, {"round": r["round"]}, {"round": n, "reason": reason})
        out = await view(conn, p, await _row(conn, pid))
    from .jobs import ops_event
    await ops_event("project.changed", {"project_id": pid, "action": "round", "round": n, "by": p.user_id, "at": now_iso()})
    return {**out, "as_of": now_iso()}


# ── 프로젝트장 넘기기(확인 17차 P-5 ⓐ · 원칙 105 · 63) ───────────────────────────────────────
async def _handover(conn, p: Principal, r, to: str, note: str | None) -> dict:
    """프로젝트장을 넘긴다 — 프로젝트장 본인 · LX 관리자. 받는 사람 = 사용 중인 LX 직원 · 관리자.
    넘긴 사람(앞 프로젝트장)은 구성원으로 남고(일 · 기록이 끊기지 않게), 아직 답하지 않은 기관 검토 요청과 확인 대기 분석 요청의 받는 사람도 함께 바뀐다
    (새 요청은 원래대로 '그 서비스 프로젝트장'에게 — messages._owner · 원칙 63). 받는 사람에게 알림 한 줄 · 감사 기록 한 줄."""
    if not (p.user_id == r["lead_id"] or p.is_admin):
        raise ApiError("forbidden", "프로젝트장 넘기기는 프로젝트장과 LX 관리자가 합니다")
    u = await conn.fetchrow("SELECT id, role, status FROM lx_users WHERE id=$1", to)
    if not u or u["status"] != "active" or u["role"] not in ("staff", "admin"):
        raise ApiError("bad_request", "LX 직원 · 관리자만 프로젝트장이 됩니다")
    old, pid = r["lead_id"], r["id"]
    if to == old:
        raise ApiError("bad_request", "이미 이 프로젝트의 프로젝트장입니다")
    await conn.execute("UPDATE projects SET lead_id=$2, updated_at=now() WHERE id=$1", pid, to)
    await conn.execute("DELETE FROM project_members WHERE project_id=$1 AND user_id=$2", pid, to)
    await conn.execute("INSERT INTO project_members(project_id, user_id, added_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", pid, old, p.user_id)
    cards = await _cards(conn, pid)
    moved = {"reviews": 0, "requests": 0}
    if cards:
        x = await conn.execute("UPDATE feedback SET recipient_id=$1 WHERE kind='review' AND card_id = ANY($2::text[]) AND recipient_id=$3 "
                               "AND coalesce(status, 'sent') <> 'answered'", to, cards, old)
        moved["reviews"] = int(x.split()[-1] or 0)
        x = await conn.execute("UPDATE analysis_requests SET lead_user=$1 WHERE state='pending' AND lead_user=$3 "
                               "AND deploy_id IN (SELECT id FROM deploys WHERE card_id = ANY($2::text[]))", to, cards, old)
        moved["requests"] = int(x.split()[-1] or 0)
    if to != p.user_id:                          # 관리자가 스스로 맡을 때는 알림이 필요 없다
        await conn.execute("INSERT INTO lx_notices(id, user_id, kind, project_id, text, note, by) VALUES ($1,$2,'project.lead',$3,$4,$5,$6)",
                           "nt_" + secrets.token_hex(6), to, pid, f"'{r['name']}' 프로젝트장을 넘겨받았습니다", note, p.user_id)
    await audit(conn, p, "project.lead", pid, {"lead_id": old}, {"lead_id": to, "note": note, **moved})
    return moved


@router.post("/projects/{pid}/handover")
async def handover(pid: str, body: dict, request: Request):
    p = _lx(request)
    to = str(body.get("to") or "").strip()
    note = " ".join(str(body.get("note") or "").split())[:NOTE_MAX] or None
    if not to:
        raise ApiError("bad_request", "받을 사람을 골라 주세요")
    async with db(realm="lx") as conn:
        r = await _row(conn, pid)
        moved = await _handover(conn, p, r, to, note)
        out = await view(conn, p, await _row(conn, pid))
    from .jobs import ops_event
    await ops_event("project.changed", {"project_id": pid, "action": "lead", "by": p.user_id, "at": now_iso()})
    return {**out, "moved": {k: env(v, "count", "recorded", "받는 사람이 함께 바뀐 기관 요청") for k, v in moved.items()}, "as_of": now_iso()}


# ── 기록 · 메모 · 파일(확인 17차 P-4 ⓐ) ─────────────────────────────────────────────
FILE_MAX_MB = 20                                   # 한 파일 크기 한도 — 작은 문서 · 그림(영상 · 학습데이터는 데이터 올리기로)
FILE_TYPES = {"pdf": "application/pdf", "hwp": "application/x-hwp", "hwpx": "application/hwp+zip",
              "doc": "application/msword", "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              "xls": "application/vnd.ms-excel", "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              "ppt": "application/vnd.ms-powerpoint", "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
              "txt": "text/plain; charset=utf-8", "csv": "text/csv; charset=utf-8",
              "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "gif": "image/gif", "webp": "image/webp"}
LOG_KINDS = ("all", "auto", "memo", "file")
_AUDIT_WORD = {"project.create": "프로젝트 만듦", "project.edit": "프로젝트 고침", "project.member.add": "구성원 더함", "project.member.remove": "구성원 뺌",
               "project.lead": "프로젝트장 넘김", "project.archive": "끝난 프로젝트로 보관", "project.reopen": "다시 엶", "project.round": "재학습 시작",
               "project.note.remove": "메모를 지움"}
_REMOVED_WORD = {"memo": "메모를 지움", "file": "파일을 지움"}


async def _logger(conn, p: Principal, pid: str):
    """기록을 보고 쓰는 사람 — 구성원 · 프로젝트장 · LX 관리자(기관 계정은 _lx 에서 이미 0)."""
    r = await _row(conn, pid)
    if not (p.is_admin or _is_member(p, r, await _members(conn, pid))):
        raise ApiError("forbidden", "기록은 이 프로젝트의 프로젝트장 · 구성원과 LX 관리자가 봅니다")
    return r


def _ko(v) -> str:
    return ((v or {}).get("ko") or (v or {}).get("en") or "") if isinstance(v, dict) else (v or "")


def can_remove_note(p: Principal | None, r, by: str | None) -> bool:
    """메모 · 파일을 지울 수 있는 사람 — 쓴 사람 본인 · 프로젝트장 · LX 관리자(S-20)."""
    return bool(p and p.user_id) and (p.user_id == by or p.user_id == r["lead_id"] or p.is_admin)


async def _log_items(conn, r, people: dict, p: Principal | None = None) -> list[dict]:
    """한 프로젝트의 기록 — 자동(감사 기록 · 학습 표본 · 학습 · 결재 · 적용) + 메모 + 파일. 시각 내림차순. 지어낸 줄 0(모두 서버 기록).
    p(보는 사람)가 있으면 메모 · 파일 줄마다 지울 수 있는지(can_remove) 붙인다. 지운 메모 · 파일은 줄이 빠지고 '○○ · 메모를 지움' 한 줄만 남는다(내용 없음)."""
    pid = r["id"]
    out: list[dict] = []
    add = lambda at, kind, text, who, **kw: out.append({"at": at, "kind": kind, "text": text, "who": who, **kw}) if at else None  # noqa: E731
    # ① 감사 기록의 그 프로젝트 줄 — 만듦 · 고침 · 구성원 · 넘기기 · 보관 · 회차(사유)
    for a in await conn.fetch("SELECT action, actor, before, after, at FROM audit_log WHERE subject=$1 AND action = ANY($2::text[]) ORDER BY at DESC LIMIT 200",
                              pid, list(_AUDIT_WORD)):
        b, x, act = a["before"] or {}, a["after"] or {}, a["action"]
        text, sub = _AUDIT_WORD[act], None
        if act in ("project.member.add", "project.member.remove"):
            sub = _name(people, x.get("user_id") or b.get("user_id"))
        elif act == "project.lead":
            sub = f"{_name(people, b.get('lead_id'))} → {_name(people, x.get('lead_id'))}" + (f" · {x['note']}" if x.get("note") else "")
        elif act == "project.round":
            text = f"{x.get('round')}차 재학습 시작"
            sub = f"사유 {x['reason']}" if x.get("reason") else None
        elif act == "project.edit" and b.get("name") != x.get("name"):
            sub = f"이름 {b.get('name')} → {x.get('name')}"
        elif act == "project.note.remove":
            text = _REMOVED_WORD.get(x.get("kind"), text)
        add(a["at"], "auto", text, _name(people, a["actor"]), sub=sub, group="project")
    # ② 학습 표본 올림
    for s in await conn.fetch("SELECT s.n_images, s.created_at, s.created_by FROM project_links l JOIN train_samples s ON s.id = l.ref "
                              "WHERE l.project_id=$1 AND l.kind='sample' AND s.status <> 'removed'", pid):
        add(s["created_at"], "auto", f"학습 표본 {int(s['n_images'] or 0):,}장 올림" if s["n_images"] else "학습 표본 올림", _name(people, s["created_by"]),
            group="train")
    # ③ 학습 — 끝 · 실패 · 진행 중(이 프로젝트 표본 또는 이 프로젝트로 낸 학습)
    sids = await _sample_ids(conn, pid)
    done = 0
    for j in await conn.fetch(f"SELECT state, created_at, finished_at, submitted_by FROM jobs WHERE {_TRAIN_OF} ORDER BY created_at", pid, sids or ["-"]):
        if j["state"] == "done":
            done += 1
            add(j["finished_at"], "auto", "학습 끝", _name(people, j["submitted_by"]), sub=f"{done}번째 학습", group="train")
        elif j["state"] == "failed":
            add(j["finished_at"] or j["created_at"], "auto", "학습 실패", _name(people, j["submitted_by"]), group="train")
        elif j["state"] in ("queued", "running"):
            add(j["created_at"], "auto", "학습 시작", _name(people, j["submitted_by"]), sub="진행 중", group="train")
    # ④ 결재 — 모델 등록 · 서비스 공개 · 다른 지역에 적용 · 운영 전환(요청은 대기 중일 때만 · 결정은 승인 · 반려)
    from .regions import region_of
    deps = {d["id"]: d for d in await conn.fetch("SELECT d.id, d.sgg_cd, d.region_name FROM deploys d JOIN project_links l ON l.ref = d.card_id AND l.kind='card' "
                                                 "WHERE l.project_id=$1 AND NOT coalesce(d.test, false)", pid)}
    cvs = {v["id"]: v for v in await conn.fetch("SELECT v.id, v.version, v.approved_by, v.approved_at FROM project_links l JOIN card_versions v ON v.id = l.ref "
                                                "WHERE l.project_id=$1 AND l.kind='card_version'", pid)}
    mids = [m["id"] for m in await conn.fetch("SELECT id FROM models WHERE sample_id = ANY($1::text[])", sids or ["-"])]
    aps = await conn.fetch("SELECT subject_type, subject_id, requested_by, decided_by, decision, reason, state, at, decided_at, payload FROM approvals "
                           "WHERE (subject_type='model' AND subject_id = ANY($1::text[])) OR (subject_type='card' AND subject_id = ANY($2::text[])) "
                           "OR (subject_type='deploy' AND subject_id = ANY($3::text[]))", mids or ["-"], list(cvs) or ["-"], list(deps) or ["-"])
    carded = set()
    for a in aps:
        st, pl = a["subject_type"], a["payload"] or {}
        if st == "model":
            what = "모델 등록"
        elif st == "card":
            v = cvs.get(a["subject_id"])
            what, carded = "서비스 공개", carded | {a["subject_id"]}
            if v and v["version"]:
                what += f" · {v['version']}판"
        else:
            d = deps.get(a["subject_id"]) or {}
            place = (region_of(d["sgg_cd"]) or {}).get("name") if d.get("sgg_cd") else None
            place = place or _ko(d.get("region_name")).split(" ")[-1] or "다른 지역"
            what = f"{place} 적용" if pl.get("action") == "port" else f"{place} 운영 전환"
        if a["decision"] in ("approve", "reject"):
            word = "승인" if a["decision"] == "approve" else "반려"
            sub = "시범" if st == "deploy" and pl.get("action") == "port" and a["decision"] == "approve" else None
            if a["decision"] == "reject" and a["reason"]:
                sub = f"사유 {a['reason']}"
            add(a["decided_at"] or a["at"], "auto", f"{what} {word}", _name(people, a["decided_by"]), sub=sub, group="approval")
        elif (a["state"] or "pending") == "pending":
            add(a["at"], "auto", f"{what} 요청", _name(people, a["requested_by"]), sub="결재 대기", group="approval")
    for vid, v in cvs.items():                       # 결재 행 없이 공개된 판(이관 · 옛 기록)도 한 줄
        if vid not in carded and v["approved_by"] and v["approved_at"]:
            add(v["approved_at"], "auto", "서비스 공개" + (f" · {v['version']}판" if v["version"] else ""), _name(people, v["approved_by"]), group="approval")
    # ⑤ 메모 · 파일
    for n in await conn.fetch("SELECT id, kind, body, file_name, file_ext, bytes, by, at FROM project_notes WHERE project_id=$1 AND removed_at IS NULL", pid):
        rm = can_remove_note(p, r, n["by"])
        if n["kind"] == "file":
            add(n["at"], "file", n["body"] or "파일", _name(people, n["by"]), id=n["id"], can_remove=rm,
                file={"id": n["id"], "name": n["file_name"], "type": n["file_ext"], "bytes": env(int(n["bytes"] or 0), "bytes", "measured", "올린 파일 크기")})
        else:
            add(n["at"], "memo", n["body"] or "", _name(people, n["by"]), id=n["id"], can_remove=rm)
    out.sort(key=lambda x: x["at"], reverse=True)
    return [{**x, "at": _iso(x["at"])} for x in out]


@router.get("/projects/{pid}/log")
async def project_log(pid: str, request: Request, kind: str = "all", limit: int = 200):
    p = _lx(request)
    if kind not in LOG_KINDS:
        raise ApiError("bad_request", "kind 는 " + " | ".join(LOG_KINDS))
    async with db(realm="lx") as conn:
        r = await _logger(conn, p, pid)
        items = await _log_items(conn, r, await _people(conn), p)
        st = _storage_line(await lead_storage(conn, r["lead_id"]), p.user_id == r["lead_id"])
    counts = {k: sum(1 for x in items if k == "all" or x["kind"] == k) for k in LOG_KINDS}
    pick = [x for x in items if kind == "all" or x["kind"] == kind][:max(1, min(int(limit or 200), 200))]
    return {"items": pick, "counts": {k: env(v, "count", "recorded", "프로젝트 기록(감사 기록 · 학습 · 결재 · 메모 · 파일)") for k, v in counts.items()},
            "file_max_mb": env(FILE_MAX_MB, "MB", "recorded", "한 파일 크기 한도(설정 한 곳 · projects.FILE_MAX_MB)"), "file_types": sorted(FILE_TYPES),
            "lead_storage": st, "as_of": now_iso()}


def _storage_line(st: dict, lead_is_me: bool) -> dict:
    """파일 올리는 자리의 저장 용량 한 줄 — 올린 파일은 프로젝트장의 저장 용량에 더해진다(lead_storage 한 출처). 할당을 넘어도 막지 않는다(S-19 기본 · 원칙 91)."""
    return {"quota_gb": env(st["quota_gb"], "GB", "recorded", "프로젝트장에게 할당된 저장 용량(없으면 할당 없음)"),
            "used": env(st["bytes"], "bytes", "measured", "프로젝트장이 프로젝트장인 프로젝트의 저장 공간 합"),
            "pct": env(st["pct"], "%", "measured", "할당 가운데 쓴 비율"), "warn": st["warn"], "lead_is_me": lead_is_me}


@router.post("/projects/{pid}/notes", status_code=201)
async def add_note(pid: str, body: dict, request: Request):
    """메모 한 줄 — 구성원 · 프로젝트장 · LX 관리자."""
    p = _lx(request)
    text = " ".join(str(body.get("text") or "").split())[:NOTE_MAX]
    if not text:
        raise ApiError("bad_request", "메모를 적어 주세요")
    nid = "pn_" + secrets.token_hex(6)
    async with db(realm="lx") as conn:
        await _logger(conn, p, pid)
        await conn.execute("INSERT INTO project_notes(id, project_id, kind, body, by) VALUES ($1,$2,'memo',$3,$4)", nid, pid, text, p.user_id)
        await conn.execute("UPDATE projects SET updated_at=now() WHERE id=$1", pid)
        await audit(conn, p, "project.note", pid, None, {"note_id": nid})
    return {"id": nid, "kind": "memo", "at": now_iso()}


def _ext(name: str) -> str:
    return name.rsplit(".", 1)[-1].lower() if "." in name else ""


@router.post("/projects/{pid}/files", status_code=201)
async def add_file(pid: str, request: Request, file: UploadFile = File(...), text: str = Form("")):
    """파일 올리기 — 작은 문서 · 그림(형식 FILE_TYPES · 한 파일 FILE_MAX_MB 까지)을 프로젝트 저장 폴더(02. 데이터/projects/{프로젝트}/files)에.
    크기는 프로젝트 저장 공간 · 프로젝트장의 저장 용량에 더해진다. 서버 저장 공간(하드웨어)이 모자라면 받지 않는다(기관 올리기와 같은 선)."""
    p = _lx(request)
    import re as _re
    name = _re.sub(r"[\x00-\x1f\\/:*?\"<>|]", "", (file.filename or "").split("\\")[-1].split("/")[-1]).strip()[:120]
    ext = _ext(name)
    if not name or ext not in FILE_TYPES:
        raise ApiError("bad_request", "올릴 수 있는 파일은 문서(PDF · 한글 · 워드 · 엑셀 · 파워포인트 · 글 · CSV)와 그림(PNG · JPG · GIF · WEBP)입니다",
                       {"field": "file", "why": "type"})
    note = " ".join(str(text or "").split())[:NOTE_MAX] or None
    nid = "pn_" + secrets.token_hex(6)
    rel = f"projects/{pid}/files/{nid}.{ext}"
    async with db(realm="lx") as conn:
        await _logger(conn, p, pid)
    from .quota import storage_room
    room = await storage_room("lx", FILE_MAX_MB * 1024 * 1024)
    if room:
        raise ApiError("conflict", room["line"], {"why": "disk"}, status=409)
    dest = config.DATA_ROOT / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    size, cap = 0, FILE_MAX_MB * 1024 * 1024
    try:
        with open(dest, "wb") as fh:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > cap:
                    raise ApiError("bad_request", f"파일은 {FILE_MAX_MB}MB 까지 올릴 수 있습니다", {"field": "file", "why": "size", "max_mb": FILE_MAX_MB})
                fh.write(chunk)
        if not size:
            raise ApiError("bad_request", "빈 파일입니다", {"field": "file", "why": "empty"})
    except Exception:
        dest.unlink(missing_ok=True)
        raise
    async with db(realm="lx") as conn:
        await conn.execute("INSERT INTO project_notes(id, project_id, kind, body, file_name, file_ext, file_rel, bytes, by) "
                           "VALUES ($1,$2,'file',$3,$4,$5,$6,$7,$8)", nid, pid, note, name, ext, rel, size, p.user_id)
        await conn.execute("UPDATE projects SET updated_at=now() WHERE id=$1", pid)
        await audit(conn, p, "project.file", pid, None, {"note_id": nid, "name": name, "bytes": size})
        lead = await conn.fetchval("SELECT lead_id FROM projects WHERE id=$1", pid)
        st = _storage_line(await lead_storage(conn, lead), p.user_id == lead)
    return {"id": nid, "kind": "file", "name": name, "bytes": env(size, "bytes", "measured", "올린 파일 크기"), "lead_storage": st, "at": now_iso()}


@router.delete("/projects/{pid}/notes/{nid}")
async def remove_note(pid: str, nid: str, request: Request):
    """메모 · 파일 지우기(S-20) — 쓴 사람 본인 · 프로젝트장 · LX 관리자. 파일은 프로젝트 저장 폴더에서 빠지고(저장 공간 숫자가 줄어듦 — _PROJECT_BYTES 한 곳),
    메모 · 파일의 내용(글 · 파일 이름)은 남기지 않는다. 기록에는 '누가 · 메모를 지움 / 파일을 지움' 한 줄만(감사 기록 project.note.remove)."""
    p = _lx(request)
    async with db(realm="lx") as conn:
        r = await _logger(conn, p, pid)
        n = await conn.fetchrow("SELECT id, kind, by, file_rel, removed_at FROM project_notes WHERE id=$1 AND project_id=$2 FOR UPDATE", nid, pid)
        if not n or n["removed_at"]:
            raise ApiError("not_found", "이미 지웠거나 없는 메모 · 파일입니다")
        if not can_remove_note(p, r, n["by"]):
            raise ApiError("forbidden", "쓴 사람 · 프로젝트장 · LX 관리자만 지웁니다")
        if n["kind"] == "file" and n["file_rel"]:
            try:
                (config.DATA_ROOT / n["file_rel"]).unlink(missing_ok=True)
            except OSError:
                raise ApiError("conflict", "지금은 파일을 지울 수 없습니다. 잠시 뒤 다시 해 주세요", status=409)
        await conn.execute("UPDATE project_notes SET removed_at=now(), removed_by=$2, body=NULL, file_name=NULL, file_ext=NULL, file_rel=NULL WHERE id=$1",
                           nid, p.user_id)
        if n["kind"] == "file":       # 올릴 때 감사 기록에 적힌 파일 이름도 남기지 않는다(내용은 남기지 않음 — 크기만 남김)
            await conn.execute("UPDATE audit_log SET after = after - 'name' WHERE action='project.file' AND subject=$1 AND after->>'note_id' = $2", pid, nid)
        await conn.execute("UPDATE projects SET updated_at=now() WHERE id=$1", pid)
        await audit(conn, p, "project.note.remove", pid, {"note_id": nid, "kind": n["kind"]}, {"note_id": nid, "kind": n["kind"], "by": n["by"]})
        st = await project_bytes(conn, pid)
    return {"ok": True, "kind": n["kind"], "storage": env(st, "bytes", "measured", "프로젝트 저장 공간(학습데이터 파일 — 이을 때 잰 크기 + 올린 파일)"),
            "as_of": now_iso()}


@router.get("/projects/{pid}/files/{nid}")
async def get_file(pid: str, nid: str, request: Request):
    p = _lx(request)
    async with db(realm="lx") as conn:
        await _logger(conn, p, pid)
        n = await conn.fetchrow("SELECT file_name, file_ext, file_rel FROM project_notes WHERE id=$1 AND project_id=$2 AND kind='file' AND removed_at IS NULL",
                                nid, pid)
    path = config.DATA_ROOT / n["file_rel"] if n and n["file_rel"] else None
    if not path or not path.is_file():
        raise ApiError("not_found", "파일이 없습니다")
    from urllib.parse import quote
    return FileResponse(path, media_type=FILE_TYPES.get(n["file_ext"], "application/octet-stream"),
                        headers={"Content-Disposition": f"attachment; filename=\"file.{n['file_ext']}\"; filename*=UTF-8''{quote(n['file_name'])}"})


# ── 재학습 권한(역할-3 ⓑ · J-2) — jobs 견적(학습)이 부른다 ─────────────────────────────────
RETRAIN_LEAD = "공개된 서비스의 재학습은 프로젝트장이 시작합니다"


async def guard_train(p: Principal, samples, base_model: str | None, project_id: str | None) -> None:
    """서비스가 공개된 프로젝트의 학습(= 재학습)은 그 프로젝트장만. 이 학습이 어느 프로젝트의 것인가 =
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
            if pub and p.user_id != r["lead_id"]:
                raise ApiError("forbidden", RETRAIN_LEAD, {"project": r["name"]})
