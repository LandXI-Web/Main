"""공식 결과로 배포 · 공식에서 내리기(10-31 PM "공식 결과로 배포는 지금 만들어") — LX 관리자 화면 '배포 → 공식 결과'.

관리자가 고른 분석 결과(개인 결과 포함 — 분석 서비스로 낸 것)를 '공식 결과'로 올리면 서비스 결과 장부(메인 · XI맵 · 외부 API · 기관 화면 숫자)에
들어간다. '공식에서 내리기'는 한 단계 되돌리기 — 장부에서 빠지고 낸 사람의 개인 결과로 돌아간다. 기준은 own_scope 한 곳(options.official).

  GET  /official/results              결과 목록(서비스 · 지역 · 영상 · 낸 사람 · 찾은 수 · 공식/개인 · 지금 쓰이는 공식 결과인가)
  GET  /official/results/{작업}/plan   무엇이 바뀌는지(서비스 · 지역 · 건수 · 바꿔 올림이면 지금 공식 결과)
  POST /official/results/{작업}/deploy {replace?}   공식 결과로 배포 — 같은 서비스 · 지역에 지금 공식 결과가 있으면 replace:true 가 있어야(409 replace_needed)
  POST /official/results/{작업}/withdraw           공식에서 내리기
배포본(기관에 공유) 결과 · 공개 판 · 기관에 공유한 대상지 결과는 여기서 바꾸지 않는다(배포 메뉴에서). 분석 중 · 실패한 결과는 올리지 않는다.
"""
from __future__ import annotations

import json

from fastapi import APIRouter, Request

from .deps import ApiError, audit, db, principal, require
from .envelope import env, now_iso
from .own_scope import sql_private

router = APIRouter()

_BASE = ("SELECT j.id, j.card_id, j.state, j.kind, j.imagery_id, j.model_id, j.submitted_by, j.finished_at, j.counts, j.options, j.deploy_id, "
         "coalesce(j.test,false) AS test, j.demo, c.name->>'ko' AS cname, coalesce(u.name, '') AS who, i.sgg_cd AS isgg, i.year AS iyear, i.epoch, "
         "i.name AS iname, i.gsd_m, ({priv}) AS priv, "
         "EXISTS (SELECT 1 FROM deploys d WHERE d.snapshot_current IN (j.id, 'results/' || j.tenant_id || '/' || j.id) "
         "        OR d.snapshot_prev IN (j.id, 'results/' || j.tenant_id || '/' || j.id)) AS in_deploy, "
         "EXISTS (SELECT 1 FROM published_sets p WHERE p.job_id = j.id) AS published, "
         "(SELECT s.replaced_at IS NULL FROM service_results s WHERE s.set_id = j.id ORDER BY s.replaced_at NULLS FIRST LIMIT 1) AS cur "
         "FROM jobs j LEFT JOIN cards c ON c.id = j.card_id LEFT JOIN imagery i ON i.id = j.imagery_id LEFT JOIN lx_users u ON u.id = j.submitted_by ")
BASE = _BASE.replace("{priv}", sql_private("j"))
WHERE_LIST = ("WHERE j.kind = 'infer' AND j.card_id IS NOT NULL AND j.card_id NOT LIKE 'card-global%' AND NOT j.demo AND NOT coalesce(j.test,false) "
              "AND j.id LIKE 'job_%' AND j.state = 'done' ")


def _name(v) -> str:
    if isinstance(v, str) and v.startswith("{"):
        try:
            v = json.loads(v)
        except ValueError:
            return v
    return (v.get("ko") or v.get("en") or "") if isinstance(v, dict) else str(v or "")


def _found(counts) -> int:
    c = counts if isinstance(counts, dict) else (json.loads(counts) if isinstance(counts, str) and counts else {})
    n = 0
    for v in (c or {}).values():
        if isinstance(v, (int, float)):
            n += int(v)
        elif isinstance(v, dict) and isinstance(v.get("n"), (int, float)):
            n += int(v["n"])
    return n


def _year(r) -> int | None:
    from .spaces import _year_of
    y = _year_of(r["iyear"], r["epoch"], _name(r["iname"]))
    return int(y) if y else None


def _item(r) -> dict:
    from .deploys import gsd_word
    from .regions import region_of
    rg = region_of(r["isgg"]) or {}
    yr = _year(r)
    fixed = bool(r["deploy_id"] or r["in_deploy"] or r["published"])
    state = "deploy" if fixed else ("personal" if r["priv"] else "official")
    return {"id": r["id"], "service": r["cname"] or "", "card_id": r["card_id"], "region": rg.get("full") or rg.get("name") or "",
            "sgg_cd": rg.get("sgg_cd") or r["isgg"], "imagery": " · ".join(x for x in (f"{yr}년" if yr else "", gsd_word(r["gsd_m"]) if r["gsd_m"] else "") if x),
            "who": r["who"] or "", "at": r["finished_at"].isoformat(timespec="seconds") if r["finished_at"] else None,
            "found": env(_found(r["counts"]), "개", "measured", "그 결과의 찾은 수"),
            "state": state, "state_label": {"deploy": "배포 결과", "personal": "개인", "official": "공식"}[state],
            "current": bool(r["cur"]) and state == "official", "can": state != "deploy" and r["state"] == "done"}


def _admin(request: Request):
    p = require(principal(request), lx=True)
    if p.role != "admin":
        raise ApiError("forbidden", "LX 관리자만 공식 결과를 바꿉니다")
    return p


@router.get("/official/results")
async def results(request: Request, show: str = "all"):
    _admin(request)
    async with db(realm="lx") as conn:
        rows = await conn.fetch(BASE + WHERE_LIST + "ORDER BY j.finished_at DESC NULLS LAST LIMIT 300")
    items = [_item(r) for r in rows]
    if show == "personal":
        items = [x for x in items if x["state"] == "personal"]
    elif show == "official":
        items = [x for x in items if x["state"] != "personal"]
    return {"items": items, "n": {k: env(sum(1 for x in items if x["state"] == k), "건", "recorded", "결과 목록")
                                  for k in ("personal", "official", "deploy")}, "as_of": now_iso()}


async def _row(conn, jid: str):
    r = await conn.fetchrow(BASE + "WHERE j.id = $1", jid)
    if not r or not r["card_id"] or r["kind"] != "infer" or r["demo"]:
        raise ApiError("not_found", "결과가 없습니다")
    return r


async def _cell(conn, r) -> list[dict]:
    """같은 서비스 · 같은 지역 · 같은 해(장부 한 칸)의 지금 공식 결과 — 이 결과 말고."""
    from .regions import region_of
    rg = region_of(r["isgg"]) or {}
    sgg = rg.get("sgg_cd") or r["isgg"]
    if not sgg:
        return []
    rows = await conn.fetch(
        "SELECT s.set_id, s.origin, s.analyzed_at, s.year, j.model_id, coalesce(u.name,'') AS who, j.counts FROM service_results s "
        "LEFT JOIN jobs j ON j.id = s.set_id LEFT JOIN lx_users u ON u.id = j.submitted_by "
        "WHERE s.card_id = $1 AND s.sgg_cd = $2 AND s.replaced_at IS NULL AND s.set_id <> $3 AND s.year IS NOT DISTINCT FROM $4", r["card_id"], sgg, r["id"], _year(r))
    multi = await conn.fetchval("SELECT coalesce(array_length(model_ids, 1), 0) > 1 FROM card_versions WHERE card_id=$1 ORDER BY approved_at DESC NULLS LAST, id DESC LIMIT 1", r["card_id"])
    out = []
    for x in rows:
        if multi and x["model_id"] and x["model_id"] != r["model_id"]:
            continue                                   # 모델을 둘 이상 쓰는 서비스(사람 · 차량)는 찾는 것마다 따로
        out.append({"set_id": x["set_id"], "deploy": x["origin"] in ("deploy", "deploy_prev"), "who": x["who"],
                    "at": x["analyzed_at"].isoformat(timespec="seconds") if x["analyzed_at"] else None,
                    "found": env(_found(x["counts"]) if x["counts"] is not None else None, "개", "measured", "그 결과의 찾은 수"),
                    "newer": bool(x["analyzed_at"] and r["finished_at"] and x["analyzed_at"] > r["finished_at"])})
    return out


@router.get("/official/results/{jid}/plan")
async def plan(jid: str, request: Request):
    _admin(request)
    async with db(realm="lx") as conn:
        r = await _row(conn, jid)
        it = _item(r)
        cell = await _cell(conn, r)
    from .svc_rules import excluded, hit
    hidden = hit(await excluded(), r["card_id"], it["sgg_cd"])
    why = None
    if it["state"] == "deploy":
        why = "기관에 공유한 배포 결과입니다 — 배포 메뉴에서 바꿉니다"
    elif r["state"] != "done":
        why = "분석이 끝난 결과만 올릴 수 있습니다"
    rep = [c for c in cell if not c["deploy"] and not c["newer"]]
    stay = [c for c in cell if c["deploy"] or c["newer"]]
    return {"item": it, "can": why is None, "why": why, "replace": rep[0] if rep else None, "stays": stay[0] if stay else None,
            "hidden": hidden, "as_of": now_iso()}


async def _set(jid: str, p, value: bool, replace: bool = False) -> dict:
    async with db(realm="lx") as conn:
        r = await _row(conn, jid)
        it = _item(r)
        if it["state"] == "deploy":
            raise ApiError("conflict", "기관에 공유한 배포 결과입니다 — 배포 메뉴에서 바꿉니다", None, 409)
        if r["state"] != "done":
            raise ApiError("conflict", "분석이 끝난 결과만 공식 결과로 배포합니다", None, 409)
        if value:
            rep = [c for c in await _cell(conn, r) if not c["deploy"] and not c["newer"]]
            if rep and not replace:
                raise ApiError("replace_needed", "같은 서비스 · 같은 지역에 지금 공식 결과가 있습니다 — 바꿔 올릴지 확인해 주세요", {"replace": rep[0]}, 409)
        before = {"official": (r["options"] or {}).get("official") if isinstance(r["options"], dict) else None, "state": it["state"]}
        await conn.execute("UPDATE jobs SET options = coalesce(options, '{}'::jsonb) || jsonb_build_object('official', $2::boolean) WHERE id = $1", jid, value)
        await audit(conn, p, "result.official_deploy" if value else "result.official_withdraw", jid, before,
                    {"official": value, "card_id": r["card_id"], "sgg_cd": it["sgg_cd"], "found": val_of(it["found"]), "replace": replace})
    try:                                               # 장부를 바로 다시 채운다(메인 · XI맵 · 외부 API 가 같은 장부)
        from .ext_api import ledger_sync
        await ledger_sync(force=True)
        from . import gov_report
        gov_report._REC.update(t=0.0)
    except Exception as e:  # noqa: BLE001 — 1분 안에 다음 채우기가 반영한다
        print(f"[official] 장부 바로 채우기 실패 {e!r}", flush=True)
    async with db(realm="lx") as conn:
        return {"item": _item(await _row(conn, jid)), "as_of": now_iso()}


def val_of(e):
    return e.get("value") if isinstance(e, dict) else e


@router.post("/official/results/{jid}/deploy")
async def deploy(jid: str, request: Request, body: dict | None = None):
    p = _admin(request)
    return await _set(jid, p, True, bool((body or {}).get("replace")))


@router.post("/official/results/{jid}/withdraw")
async def withdraw(jid: str, request: Request):
    p = _admin(request)
    return await _set(jid, p, False)
