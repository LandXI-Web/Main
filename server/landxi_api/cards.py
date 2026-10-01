"""서비스 카드 한 벌(구현 3차 · 확인 대장 14차 카드-1 ⓐ · 길-1 ⓑ · 13차 분기-4 ⓐ · 원칙 90 · 93) — 카드 정보 여덟 칸 · 서비스 카드 관리 · 카드로 분석.

  GET  /api/v1/cards/deck                  덱 — LX = 모든 카드(분석하기 갤러리 · 서비스 카드 관리) · 기관 = 그 기관에 켜진 서비스(서비스 선택 · 분석 의뢰)
  GET  /api/v1/cards/{cid}                 카드 한 장 + 상세(지역별 결과 · 결과 장면 · 영상 ↔ 결과 · 조건 · 판) — LX
  PUT  /api/v1/cards/{cid}                 카드 정보 고치기 — 이름 · 무엇을 찾나 · 대표 이미지 · 결과 예시(지역 · 말) · 분류 · 영상 · 시점 · 찾는 것 · 대조
  POST /api/v1/cards/{cid}/scene           결과 장면 올리기(PNG · JPG · WebP · 8MB 이하) → 긴 변 1600 JPG 로 다시 저장 · 고를 수 있는 장면에 더한다
  GET  /api/v1/cards/files/{cid}/{name}    올린 결과 장면(이름에 내용 해시)
  GET  /api/v1/cards/{cid}/fit?region=     이 카드로 그 시군구를 분석할 수 있나 · 결과까지 걸릴 시간(분석하기 오른쪽 칸)
  POST /api/v1/cards/{cid}/analyze         분석 시작 {region} — 게이트웨이 작업 대기열(POST /jobs 와 같은 길 · 서버가 카드 모델과 맞는 영상을 고른다) · 결과는 XI맵

숫자(상태 · 결과 예시 · 쓰이는 곳 · 기관 신고)는 대표 수치 요약(summary.cached_all — GET /summary 와 같은 값) 한 출처 · 지어내지 않는다.
걸리는 시간 = 이 카드로 끝낸 최근 시군구 전역 분석의 실제 시간(작업 기록). 서비스 공개 상태 = 결재 기록 그대로(새 승인 규칙 없음).
기관 세션 = 그 기관 서비스 · 그 기관 관할 결과 · 관할 장면만(원칙 39 — 서버가 내주지 않는다).
"""
from __future__ import annotations

import hashlib
import io
import re

from fastapi import APIRouter, File, Form, Request, UploadFile
from fastapi.responses import Response
from starlette.concurrency import run_in_threadpool

from . import config, summary
from .deps import ApiError, audit, db, principal, require
from .envelope import env, now_iso

router = APIRouter()

CID_RE = re.compile(r"^card-[a-z0-9-]{2,40}$")
FILE_RE = re.compile(r"^scene-[0-9a-f]{12}\.jpg$")
GROUPS = ["농지·시설", "환경", "건축·변화", "안전", "해외"]
LIMITS = {"name": 40, "line": 60, "result_word": 20, "imagery": 40, "timepoints": 40, "finds": 60, "compare": 60, "caption": 40}
SCENE_MAX_BYTES = 8_000_000
SCENE_MIN_PX, SCENE_OUT_PX = 320, 1600
STAGE_KEY = {summary.STAGE_RUN: "ga", summary.STAGE_PILOT: "pilot", summary.STAGE_FIRST: "none"}
STAGE_WORD = {"ga": "운영", "pilot": "시범", "none": "첫 결과 전"}
RANK = {"ga": 0, "pilot": 1, "none": 2}
INPUT_WORD = {"ortho": "정사영상", "satellite": "위성 영상", "video": "드론 동영상", "camera": "차량 카메라", "parcels": "필지"}


# ── 작은 도구 ────────────────────────────────────────────────────────────────
# 화면 용어표(E:/Land-XI 플랫폼/CLAUDE.md §2) — 카드 원천 이름에 남은 옛 말을 보일 때만 바꾼다(서비스 소개 화면 userWords 와 같은 표)
TERMS = [(re.compile("판독"), "AI 분석"), (re.compile("반입"), "데이터 올리기"), (re.compile("검수"), "결과 확인"), (re.compile("조립"), "서비스 만들기"),
         (re.compile("이식"), "다른 지역에 적용"), (re.compile("발행"), "서비스 공개")]


def _words(s: str | None) -> str | None:
    if not s:
        return s
    for rx, to in TERMS:
        s = rx.sub(to, s)
    return s


def _name(v) -> str:
    return _words((v.get("ko") or v.get("en") or "") if isinstance(v, dict) else str(v or "")) or ""


def _short(region_name: str | None, sgg: str | None = None) -> str:
    """시군구 짧은 이름 — 시도를 뗀다(전북특별자치도 남원시 → 남원시 · 충청남도 천안시 서북구 → 천안시 서북구)."""
    if sgg:
        from .regions import region_of
        r = region_of(sgg)
        if r and r.get("name"):
            return r["name"]
    w = str(region_name or "").split()
    return " ".join(w[1:]) if len(w) > 1 else (w[0] if w else "")


def _dur(s: float | None) -> str | None:
    if s is None:
        return None
    s = float(s)
    if s < 60:
        return "약 1분 안"
    if s < 3600:
        return f"약 {max(1, round(s / 60))}분"
    h, m = int(s // 3600), round((s % 3600) / 60)
    return f"약 {h}시간" + (f" {m}분" if m else "")


def _metric(item: dict | None, key: str) -> dict | None:
    m = ((item or {}).get("metrics") or {}).get(key)
    if not m or m.get("value") is None:
        return None
    return m


def _vnum(v) -> float | None:
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _ver_key(v: str | None):
    try:
        return tuple(int(x) for x in str(v or "0").split("."))
    except ValueError:
        return (0,)


def _clean_cls(c) -> str:
    return str(c or "").replace("_", " ").strip()


def _obj(v):
    """jsonb 값 — 문자열로 싸여 들어온 옛 값이면 한 번 푼다."""
    if isinstance(v, str):
        try:
            import json as _json
            return _json.loads(v)
        except ValueError:
            return None
    return v


def _txt(v, key: str) -> str | None:
    if v is None:
        return None
    s = re.sub(r"\s+", " ", str(v)).strip()
    if len(s) > LIMITS[key]:
        raise ApiError("bad_request", f"{LIMITS[key]}자 안으로 적어 주세요", {"field": key})
    return s or None


# ── 재료 한 번에 ──────────────────────────────────────────────────────────────
async def _load(conn) -> dict:
    from .deploys import _learned, gsd_word
    cards = await conn.fetch("SELECT id, name, scope, kind, owner_id FROM cards ORDER BY id")
    info = {}
    for r in await conn.fetch("SELECT * FROM card_info"):
        d = dict(r)
        for k in ("scene", "scenes", "swipe"):
            d[k] = _obj(d.get(k))
        info[r["card_id"]] = d
    vers = await conn.fetch("SELECT id, card_id, version, model_ids, modules, approved_at FROM card_versions ORDER BY card_id, id")
    models = {r["id"]: r for r in await conn.fetch("SELECT id, task, classes, gsd_trained_m, weights_uri, status, input FROM models")}
    appr = await conn.fetch("SELECT payload->>'card_id' AS cid, state, at FROM approvals WHERE subject_type='card' ORDER BY at")
    jobs = await conn.fetch(
        "SELECT card_id, options->>'sgg_cd' AS sgg, options->>'coverage' AS cov, perf->>'elapsed_s' AS el, finished_at FROM jobs "
        "WHERE card_id IS NOT NULL AND state='done' AND options->>'scope'='sgg' AND NOT coalesce(test,false) AND NOT coalesce(demo,false) "
        "AND perf ? 'elapsed_s' ORDER BY finished_at DESC")
    lead = await conn.fetch("SELECT l.ref, p.id, p.name, p.lead_id, u.name AS lead FROM project_links l JOIN projects p ON p.id=l.project_id "
                            "LEFT JOIN lx_users u ON u.id=p.lead_id WHERE l.kind='card' ORDER BY l.at")
    rules = {r["id"]: r["name"] for r in await conn.fetch("SELECT id, name FROM survey_rules")}
    owner_names = {r["id"]: r["name"] for r in await conn.fetch("SELECT id, name FROM lx_users")}
    return {"cards": cards, "info": info, "vers": vers, "models": models, "appr": appr, "jobs": jobs, "lead": lead, "rules": rules,
            "owner_names": owner_names, "learned": _learned, "gsd_word": gsd_word}


def _owner(m: dict, cid: str, card) -> dict:
    """담당 = 카드를 만든 프로젝트의 프로젝트장(원칙 51 · 63) → 없으면 cards.owner_id → 없으면 미지정."""
    for r in m["lead"]:
        if r["ref"] == cid:
            return {"id": r["lead_id"], "name": r["lead"] or None, "project": {"id": r["id"], "name": r["name"]}}
    oid = card["owner_id"] if card else None
    return {"id": oid, "name": m["owner_names"].get(oid) if oid else None, "project": None}


def _card_core(m: dict, card, items: list[dict], p, *, tenant: str | None = None) -> dict:
    """카드 한 장의 여덟 칸 — items = 이 카드의 요약 항목(기관 세션이면 그 기관 것만)."""
    cid = card["id"]
    inf = m["info"].get(cid) or {}
    vs = [v for v in m["vers"] if v["card_id"] == cid]
    approved = [v for v in vs if v["approved_at"] is not None]
    cur = max(approved or vs, key=lambda v: _ver_key(v["version"]), default=None)
    mids = []
    for v in sorted(vs, key=lambda v: _ver_key(v["version"]), reverse=True):
        mids += [x for x in (v["model_ids"] or []) if x not in mids]
    learned = [m["models"][x] for x in mids if x in m["models"] and m["learned"](m["models"][x])]

    # 상태 · 쓰이는 곳 — 요약 항목 단계(운영 · 시범 · 첫 결과 전)
    keys = [STAGE_KEY.get(it["stage"], "none") for it in items]
    state = min(keys, key=lambda k: RANK[k]) if keys else "none"
    n = {k: keys.count(k) for k in ("ga", "pilot", "none")}
    parts = [f"운영 {n['ga']}" if n["ga"] else "", f"시범 {n['pilot']}" if n["pilot"] else ""]
    uses_text = " · ".join(x for x in parts if x) or (f"첫 결과 전 {n['none']}" if n["none"] else "아직 없음")

    # ⑥ 결과 예시 — LX 가 고른 지역 → 운영 먼저 · 현장 확인 필요 먼저 · 요약 순서
    ranked = sorted(items, key=lambda it: (RANK[STAGE_KEY.get(it["stage"], "none")], 0 if (_vnum((_metric(it, "field_check") or {}).get("value")) or 0) > 0 else 1))
    pick = None
    if inf.get("result_sgg"):
        pick = next((it for it in items if str(it.get("sgg_cd") or "") == inf["result_sgg"]), None)
    pick = pick or next((it for it in ranked if (_vnum((_metric(it, "field_check") or {}).get("value")) or 0) > 0), None) \
        or next((it for it in ranked if (_vnum((_metric(it, "detected") or {}).get("value")) or 0) > 0), None)
    example = None
    if pick:
        fc, det = _metric(pick, "field_check"), _metric(pick, "detected")
        # 결과 말(예: 비닐하우스 동)은 LX 가 정한 지역의 값에만 — 다른 지역의 AI 탐지 수에 그 말을 붙이지 않는다(셈 단위가 같다고 확인한 곳만)
        rw = inf.get("result_word") if (not inf.get("result_sgg") or str(pick.get("sgg_cd") or "") == inf["result_sgg"]) else None
        use, word = (fc, "현장 확인 필요 필지") if fc and (_vnum(fc["value"]) or 0) > 0 else (det, rw or f"AI 탐지 {det['unit'] if det else '건'}")
        if use:
            example = {"value": use["value"], "unit": use.get("unit") or "", "basis": use.get("basis") or "estimate", "as_of": str(use.get("as_of") or "")[:10],
                       "source": use.get("source") or "", "label": use.get("label") or "", "word": word,
                       "region": _short(pick.get("region_name"), pick.get("sgg_cd")), "sgg": pick.get("sgg_cd")}

    # 결과가 있는 시군구(장면이 '다른 지역 결과'인지 가른다)
    result_sggs = {str(it.get("sgg_cd")) for it in items if it.get("sgg_cd") and (_metric(it, "detected") or _metric(it, "field_check"))}
    all_sggs = {str(it.get("sgg_cd")) for it in items if it.get("sgg_cd")}

    def scene_ok(sc) -> bool:
        if not sc or not sc.get("src"):
            return False
        if p.realm != "tenant":
            return True
        from .regions import region_allowed
        return (sc.get("tenant") == p.tenant_id) or bool(sc.get("sgg") and region_allowed(p, sc["sgg"]))

    sc = inf.get("scene") if scene_ok(inf.get("scene")) else None
    scene = None
    if sc:
        ex = bool(sc.get("ex")) or bool(sc.get("sgg") and all_sggs and str(sc["sgg"]) not in all_sggs)
        scene = {"src": sc["src"], "caption": sc.get("caption") or "", "ex": ex}

    # ⑦ 영상 조건 · 걸리는 시간 · 찾는 것 · 대조
    gw = m["gsd_word"]
    img_words = []
    for md in learned:
        w = gw(md["gsd_trained_m"])
        if w and w not in img_words:
            img_words.append(w)
    kind = card["kind"] or {}
    if isinstance(kind, str):
        try:
            import json as _json
            kind = _json.loads(kind)
        except ValueError:
            kind = {}
    if not img_words:
        img_words = [INPUT_WORD.get(x, "") for x in (kind.get("input") or []) if INPUT_WORD.get(x)]
    imagery = inf.get("imagery") or " · ".join(img_words) or None
    job = next((j for j in m["jobs"] if j["card_id"] == cid and _vnum(j["el"])), None)
    time = None
    if job and p.realm != "tenant":
        cov = _vnum(job["cov"])
        reg = _short(None, job["sgg"]).split()[0] if job["sgg"] else ""
        reg = re.sub(r"(시|군|구)$", "", reg) if len(reg) > 2 else reg
        time = {"text": f"{reg} 전역 {_dur(_vnum(job['el']))}".strip(), "seconds": round(_vnum(job["el"]) or 0),
                "region": _short(None, job["sgg"]),
                "coverage": env(round(cov * 100) if cov is not None else None, "%", "measured", "영상 범위 ∩ 시군구 면적")}
    finds = inf.get("finds")
    if not finds and learned:
        cls = []
        for md in learned:
            for c in md["classes"] or []:
                w = _clean_cls(c).split()[0] if c else ""
                if w and w not in cls:
                    cls.append(w)
        finds = " · ".join(cls) or None
    rule_ids = list(((cur["modules"] or {}).get("rules") or [])) if cur else []
    ext = ((cur["modules"] or {}).get("ext") or {}) if cur else {}
    parcel = (card["scope"] or "local") != "global" and (bool(rule_ids) or any(v and str(k).endswith("-parcel") for k, v in (ext.items() if isinstance(ext, dict) else [])))
    compare = inf.get("compare") or (("필지 대조 · " + " · ".join(m["rules"].get(r, r) for r in rule_ids)) if rule_ids else ("필지 대조" if parcel else "없음 — AI 분석까지"))

    # 서비스 공개 상태(결재 기록 그대로)
    mine_ap = [a for a in m["appr"] if a["cid"] == cid]
    last = mine_ap[-1] if mine_ap else None
    pending = any(a["state"] == "pending" for a in mine_ap)
    any_ok = any(v["approved_at"] is not None for v in vs)
    publish = {"pending": pending,
               "label": "공개 결재 중" if pending else "공개 반려" if (last and last["state"] == "rejected" and not any_ok)
               else "공개됨" if any_ok else "공개 전"}
    reports = sum(int(_vnum((_metric(it, "reports") or {}).get("value")) or 0) for it in items)
    own = _owner(m, cid, card)
    can_analyze = bool(learned) and (card["scope"] or "local") != "global"
    out = {
        "id": cid, "name": _name(card["name"]), "scope": card["scope"] or "local", "group": inf.get("grp") or ("해외" if card["scope"] == "global" else None),
        "state": state, "state_label": STAGE_WORD[state],
        "line": _words(inf.get("line")), "scene": scene,
        "where": example["region"] if example else None, "as_of": example["as_of"] if example else None, "example": example,
        "uses": {"text": uses_text, "counts": {"ga": n["ga"], "pilot": n["pilot"], "none": n["none"]}},
        "imagery": imagery, "timepoints": inf.get("timepoints") or "1시점", "finds": finds, "compare": compare, "time": time,
        "version": cur["version"] if cur else None, "owner": own["name"],
        "can_analyze": can_analyze, "cant": None if can_analyze else ("해외 카드는 해외 화면에서 분석합니다" if card["scope"] == "global" else "분석 모델 등록 전"),
        "reports": env(reports, "count", "recorded", "기관이 보낸 신고"), "publish": publish,
    }
    if p.realm == "lx":
        out["project"] = own["project"]
        out["can_edit"] = p.is_admin or (p.role == "staff" and (not own["id"] or own["id"] == p.user_id))
        out["edited"] = {"at": inf["updated_at"].isoformat(timespec="seconds") if inf.get("updated_at") else None,
                         "by": inf.get("updated_by") if not str(inf.get("updated_by") or "").startswith("system:") else None}
        # 다음 할 일(서비스 카드 관리 ⑦) — 결재 기다림 · 기관 신고 · 첫 분석 · 분석 모델 등록 · 다른 지역에 적용
        if publish["pending"]:
            out["next"] = {"text": "공개 결재 기다리는 중", "href": "/landxi/v3/lx-inbox/"}
        elif reports:
            out["next"] = {"text": f"기관 신고 {reports}건 확인", "href": "/landxi/v3/lx-inbox/"}
        elif not can_analyze:
            out["next"] = {"text": "분석 모델 등록" if card["scope"] != "global" else "해외 화면에서 관리", "href": None}
        elif state == "none":
            out["next"] = {"text": "첫 분석", "href": f"/landxi/v3/lx-analyze/?card={cid}#analyze"}
        else:
            out["next"] = {"text": "다른 지역에 적용", "href": "/landxi/v3/lx-deploy/"}
    return out


async def _deck_lx(p) -> dict:
    items, at = await summary.cached_all()
    async with db(realm="lx") as conn:
        m = await _load(conn)
    out = []
    for c in m["cards"]:
        mine = [it for it in items if it["card"] == c["id"]]
        out.append(_card_core(m, c, mine, p))
    out.sort(key=lambda x: (RANK[x["state"]], 0 if x["scene"] else 1, x["scope"] == "global", x["name"]))
    return {"items": out, "total": len(out), "groups": GROUPS, "as_of": now_iso(), "computed_at": at}


async def _deck_tenant(p) -> dict:
    """기관 덱 — 그 기관에 켜진 서비스(브랜드 서비스 목록 순서 · 상태 말 · 사업 연도 = brand._services 와 같은 판정) + 카드 여덟 칸(그 기관 것만)."""
    from . import brand
    row = await brand._tenant(p.tenant_id)
    intro = row["intro"] or {}
    svcs = await brand._services(p.tenant_id, list(row["services"]) if row["services"] else None, intro.get("items") or {}, brand._en(row))
    short = row["short"] or brand._short_default(row)
    items, at = await summary.cached_all()
    own_items = summary._filter(items, p.tenant_id, None, None)
    async with db(realm="lx") as conn:
        m = await _load(conn)
        dps = await conn.fetch("SELECT card_id, min(year) AS year FROM deploys WHERE tenant_id=$1 AND NOT coalesce(test,false) AND stage <> 'draft' "
                               "AND card_id IS NOT NULL GROUP BY card_id ORDER BY card_id", p.tenant_id)
    cards = {c["id"]: c for c in m["cards"]}
    listed = {s["card"] for s in svcs}
    # 서비스 선택에 보이는 서비스(listed) + 그 기관에 적용된 다른 서비스(분석 의뢰에서 고를 수 있는 것 — /requests/services 와 같은 배포 기록)
    extra = [{"card": d["card_id"], "name": None, "line": None, "year": d["year"], "status": None, "open": True, "_extra": True}
             for d in dps if d["card_id"] not in listed]
    out = []
    for s in svcs + extra:
        c = cards.get(s["card"])
        if not c:
            continue
        mine = [it for it in own_items if it["card"] == c["id"]]
        core = _card_core(m, c, mine, p, tenant=p.tenant_id)

        def total(key):
            es = [_metric(it, key) for it in mine]
            es = [e for e in es if e]
            if not es:
                return None
            return {**es[0], "value": sum(_vnum(e["value"]) or 0 for e in es), "as_of": max(str(e.get("as_of") or "") for e in es)}
        fc, det, rp = total("field_check"), total("detected"), total("review_pending")
        use = fc if fc and fc["value"] > 0 else det if det and det["value"] > 0 else None
        inf2 = m["info"].get(c["id"]) or {}
        rw = inf2.get("result_word") if not inf2.get("result_sgg") or {str(it.get("sgg_cd")) for it in mine} == {inf2["result_sgg"]} else None
        word = "현장 확인 필요 필지" if use is fc and fc else (rw or (f"AI 탐지 {det['unit']}" if det else ""))
        core["example"] = {"value": use["value"], "unit": use.get("unit") or "", "basis": use.get("basis") or "estimate", "as_of": str(use.get("as_of") or "")[:10],
                           "source": use.get("source") or "", "label": use.get("label") or "", "word": word, "place": short} if use else None
        dates = [str((_metric(it, k) or {}).get("as_of") or "")[:10] for it in mine for k in ("detected", "field_check")]
        dates = [d for d in dates if d]
        survey = any(it.get("survey_state") or _metric(it, "field_check") for it in mine)
        core.update({
            "line": s.get("line") or core["line"], "name": s.get("name") or core["name"],
            "year": s.get("year"), "status_label": s.get("status") or core["state_label"], "open": bool(s.get("open")),
            "state": STAGE_KEY.get(s.get("status"), core["state"]) if s.get("open") else "none", "listed": not s.get("_extra"),
            "latest": max(dates) if dates else None,
            "todo": {"text": (f"결과 확인 대기 {int(rp['value']):,}건" if rp["value"] else "확인할 결과 없음") if rp else ("확인할 결과 없음" if s.get("open") else "—")},
            "report": survey,
        })
        for k in ("uses", "time", "publish", "reports", "imagery", "timepoints", "finds", "compare", "can_analyze", "cant", "version"):
            core.pop(k, None)
        out.append(core)
    return {"items": out, "total": len(out), "short": short, "as_of": now_iso(), "computed_at": at}


@router.get("/cards/deck")
async def deck(request: Request, fresh: int | None = None):
    p = require(principal(request))
    if fresh and p.is_lx:
        summary.invalidate()
    if p.realm == "tenant":
        return await _deck_tenant(p)
    return await _deck_lx(p)


# ── 카드 한 장(상세) ─────────────────────────────────────────────────────────
async def _one(p, cid: str) -> tuple[dict, dict, list[dict]]:
    if not CID_RE.match(cid or ""):
        raise ApiError("not_found", "카드가 없습니다")
    items, _ = await summary.cached_all()
    async with db(realm="lx") as conn:
        m = await _load(conn)
    card = next((c for c in m["cards"] if c["id"] == cid), None)
    if not card:
        raise ApiError("not_found", "카드가 없습니다")
    mine = [it for it in items if it["card"] == cid]
    return _card_core(m, card, mine, p), m, mine


@router.get("/cards/{cid}")
async def one(cid: str, request: Request):
    p = require(principal(request), lx=True)
    core, m, mine = await _one(p, cid)
    inf = m["info"].get(cid) or {}
    regions = []
    for it in sorted(mine, key=lambda it: (RANK[STAGE_KEY.get(it["stage"], "none")], -(_vnum((_metric(it, "field_check") or {}).get("value")) or 0),
                                           -(_vnum((_metric(it, "detected") or {}).get("value")) or 0))):
        k = STAGE_KEY.get(it["stage"], "none")
        regions.append({"sgg": it.get("sgg_cd"), "name": _short(it.get("region_name"), it.get("sgg_cd")), "full": it.get("region_name"),
                        "state": k, "state_label": STAGE_WORD[k], "imagery": (it.get("imagery") or {}).get("label"),
                        "field_check": _metric(it, "field_check"), "detected": _metric(it, "detected"),
                        "reports": env(int(_vnum((_metric(it, "reports") or {}).get("value")) or 0), "count", "recorded", "기관이 보낸 신고")})
    scenes = [s for s in (inf.get("scenes") or []) if s.get("src")]
    vers = sorted([v for v in m["vers"] if v["card_id"] == cid], key=lambda v: _ver_key(v["version"]), reverse=True)
    return {**core, "regions": regions, "scenes": scenes, "swipe": inf.get("swipe"),
            "scene_pick": inf.get("scene") or None, "result_sgg": inf.get("result_sgg"), "result_word": inf.get("result_word"),
            "info": {k: inf.get(k) for k in ("line", "grp", "imagery", "timepoints", "finds", "compare")}, "groups": GROUPS,
            "versions": [{"version": v["version"], "approved_at": v["approved_at"].isoformat(timespec="seconds") if v["approved_at"] else None} for v in vers],
            "as_of": now_iso()}


# ── 고치기(서비스 카드 관리 ②) ─────────────────────────────────────────────────
def _editor(p, core: dict):
    if p.realm != "lx" or p.role not in ("staff", "admin"):
        raise ApiError("forbidden", "LX 직원 · 관리자만 고칩니다")
    if not core.get("can_edit"):
        raise ApiError("forbidden", "이 카드의 담당 프로젝트장과 LX 관리자만 고칩니다")


@router.put("/cards/{cid}")
async def put(cid: str, body: dict, request: Request):
    p = require(principal(request), lx=True)
    core, m, mine = await _one(p, cid)
    _editor(p, core)
    inf = dict(m["info"].get(cid) or {})
    before = {k: inf.get(k) for k in ("line", "grp", "result_sgg", "result_word", "imagery", "timepoints", "finds", "compare", "scene")}
    upd: dict = {}
    for k in ("line", "result_word", "imagery", "timepoints", "finds", "compare"):
        if k in body:
            upd[k] = _txt(body.get(k), k)
    if "group" in body:
        g = body.get("group") or None
        if g is not None and g not in GROUPS:
            raise ApiError("bad_request", "분류는 정해진 것 중에서 고릅니다", {"allowed": GROUPS})
        upd["grp"] = g
    if "result_sgg" in body:
        v = str(body.get("result_sgg") or "") or None
        if v and v not in {str(it.get("sgg_cd")) for it in mine if it.get("sgg_cd")}:
            raise ApiError("bad_request", "이 카드의 결과가 있는 지역만 고를 수 있습니다")
        upd["result_sgg"] = v
    if "scene" in body:
        src = (body.get("scene") or {}).get("src") if isinstance(body.get("scene"), dict) else body.get("scene")
        if src:
            opt = next((s for s in (inf.get("scenes") or []) if s.get("src") == src), None)
            if not opt:
                raise ApiError("bad_request", "고를 수 있는 결과 장면이 아닙니다")
            upd["scene"] = opt
        else:
            upd["scene"] = None
    name = _txt(body.get("name"), "name") if "name" in body else None
    if "name" in body and not name:
        raise ApiError("bad_request", "이름을 적어 주세요")
    async with db(realm="lx") as conn:
        await conn.execute("INSERT INTO card_info(card_id, updated_by) VALUES ($1,$2) ON CONFLICT (card_id) DO NOTHING", cid, p.user_id)
        for k, v in upd.items():                      # jsonb 칸(scene)은 연결의 jsonb 변환기가 그대로 바꾼다(문자열로 두 번 싸지 않는다)
            await conn.execute(f"UPDATE card_info SET {k}=$2, updated_at=now(), updated_by=$3 WHERE card_id=$1", cid, v, p.user_id)
        if name and name != core["name"]:
            await conn.execute("UPDATE cards SET name = jsonb_build_object('ko', $2::text, 'en', coalesce(name->>'en', $2::text)) WHERE id=$1", cid, name)
        await audit(conn, p, "card.info", cid, before, {**upd, **({"name": name} if name else {})})
    return await one(cid, request)


# ── 결과 장면 올리기 ─────────────────────────────────────────────────────────
def _scene_dir(cid: str):
    return config.DATA_ROOT / "cards" / cid


def _normalize_scene(data: bytes) -> bytes:
    from PIL import Image, UnidentifiedImageError
    try:
        im = Image.open(io.BytesIO(data))
        fmt = im.format
        im.load()
    except (UnidentifiedImageError, OSError, ValueError):
        raise ApiError("bad_request", "그림 파일을 읽을 수 없습니다") from None
    if fmt not in ("PNG", "JPEG", "WEBP"):
        raise ApiError("bad_request", "PNG · JPG · WebP 그림만 올릴 수 있습니다")
    if min(im.size) < SCENE_MIN_PX:
        raise ApiError("bad_request", f"그림이 너무 작습니다 — 짧은 변 {SCENE_MIN_PX}픽셀 이상")
    im = im.convert("RGB")
    im.thumbnail((SCENE_OUT_PX, SCENE_OUT_PX))
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=88, optimize=True)
    return buf.getvalue()


@router.post("/cards/{cid}/scene")
async def put_scene(cid: str, request: Request, file: UploadFile = File(...), region: str = Form(""), caption: str = Form(""), use: str = Form("1")):
    p = require(principal(request), lx=True)
    core, m, mine = await _one(p, cid)
    _editor(p, core)
    data = await file.read(SCENE_MAX_BYTES + 1)
    if len(data) > SCENE_MAX_BYTES:
        raise ApiError("bad_request", "그림은 8MB 이하만 올릴 수 있습니다")
    jpg = await run_in_threadpool(_normalize_scene, data)
    name = f"scene-{hashlib.sha256(jpg).hexdigest()[:12]}.jpg"
    d = _scene_dir(cid)

    def _write():
        d.mkdir(parents=True, exist_ok=True)
        (d / name).write_bytes(jpg)
    await run_in_threadpool(_write)
    sgg = str(region or "").strip() or None
    from .regions import region_of
    reg = region_of(sgg) if sgg else None
    if sgg and not reg:
        raise ApiError("bad_request", "해당 지역이 없습니다")
    tenant = next((it.get("tenant") for it in mine if reg and str(it.get("sgg_cd")) == reg["sgg_cd"]), None)
    cap = _txt(caption, "caption") or (reg["name"] if reg else "")
    sc = {"src": f"/api/v1/cards/files/{cid}/{name}", "caption": cap, "sgg": reg["sgg_cd"] if reg else None, "tenant": tenant, "up": True,
          **({"ex": True} if not reg else {})}
    async with db(realm="lx") as conn:
        await conn.execute("INSERT INTO card_info(card_id, updated_by) VALUES ($1,$2) ON CONFLICT (card_id) DO NOTHING", cid, p.user_id)
        cur = _obj(await conn.fetchval("SELECT scenes FROM card_info WHERE card_id=$1", cid)) or []
        cur = [s for s in cur if isinstance(s, dict) and s.get("src") != sc["src"]] + [sc]
        await conn.execute("UPDATE card_info SET scenes=$2, updated_at=now(), updated_by=$3 WHERE card_id=$1", cid, cur, p.user_id)
        if use not in ("0", "false", ""):
            await conn.execute("UPDATE card_info SET scene=$2 WHERE card_id=$1", cid, sc)
        await audit(conn, p, "card.scene", cid, None, {"src": sc["src"], "sgg": sc["sgg"]})
    return await one(cid, request)


@router.get("/cards/files/{cid}/{name}")
async def scene_file(cid: str, name: str):
    if not CID_RE.match(cid or "") or not FILE_RE.match(name or ""):
        raise ApiError("not_found", "파일 없음")
    f = _scene_dir(cid) / name
    if not f.is_file():
        raise ApiError("not_found", "파일 없음")
    data = await run_in_threadpool(f.read_bytes)
    return Response(content=data, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=604800, immutable", "X-Content-Type-Options": "nosniff"})


# ── 이 카드로 분석(분석하기 오른쪽 칸 · 길-1 ⓑ 카드 먼저) ─────────────────────────────
async def _plan(p, cid: str, region: str) -> dict:
    """이 카드 모델로 그 시군구를 분석할 수 있나 — 적용 전 점검과 같은 판정(deploys.plan_analysis · 한 출처)."""
    from shapely.geometry import mapping
    from .deploys import gsd_word, plan_analysis
    from .regions import regions_base
    regs, geoms, _ = regions_base()
    rg = next((x for x in regs if x["sgg_cd"] == region or x.get("prev_cd") == region), None)
    if not rg:
        raise ApiError("not_found", "해당 지역이 없습니다", {"region": region})
    sgg = rg["sgg_cd"]
    async with db(realm="lx") as conn:
        if not await conn.fetchval("SELECT 1 FROM cards WHERE id=$1", cid):
            raise ApiError("not_found", "카드가 없습니다")
        cv = await conn.fetchval("SELECT id FROM card_versions WHERE card_id=$1 ORDER BY approved_at DESC NULLS LAST, id DESC LIMIT 1", cid)
        if not cv:
            raise ApiError("conflict", "아직 판이 없는 카드입니다", None, 409)
        pl = await plan_analysis(conn, None, cid, cv, sgg, mapping(geoms[sgg]) if sgg in geoms else None)
    img = pl["img"] or {}
    pk = pl["pick"] or {}
    cov = img.get("coverage")
    return {"sgg": sgg, "name": rg["name"], "full": rg.get("full") or rg["name"], "fits": pl["fits"], "note": pl["note"],
            "model_id": pk.get("model_id"), "imagery_id": img.get("imagery_id"),
            "imagery": {"has": bool(img.get("imagery_id")), "word": " ".join(x for x in (f"{img['year']}년" if img.get("year") else "", gsd_word(img.get("gsd_m"))) if x),
                        "coverage": env(round(float(cov) * 100) if cov is not None else None, "%", "measured", "영상 범위 ∩ 시군구 면적")}}


async def _measured_rate(conn, img_id: str | None, up: float) -> tuple[float | None, int]:
    """최근 끝난 AI 분석의 실제 속도(칸/벽시계 초) — 같은 영상 · 같은 해상도 → 같은 영상 → 최근 분석 전체(XI맵 '결과까지'와 같은 규칙)."""
    rows = await conn.fetch("SELECT imagery_id, options, perf FROM jobs WHERE state='done' AND kind='infer' AND perf IS NOT NULL "
                            "AND NOT coalesce(test,false) ORDER BY finished_at DESC LIMIT 100")
    done = []
    for r in rows:
        v = ((r["perf"] or {}).get("chips_per_wall_s") or {}).get("value") if isinstance((r["perf"] or {}).get("chips_per_wall_s"), dict) else (r["perf"] or {}).get("chips_per_wall_s")
        if _vnum(v) and _vnum(v) > 0:
            done.append((r["imagery_id"], float((r["options"] or {}).get("upsample") or 1), float(v)))
    for tier in ([d for d in done if d[0] == img_id and d[1] == up], [d for d in done if d[0] == img_id], done):
        if tier:
            rates = sorted(d[2] for d in tier)
            return rates[len(rates) // 2], len(tier)
    return None, 0


def _job_body(cid: str, name: str, pl: dict) -> dict:
    return {"kind": "infer", "model_id": pl["model_id"], "imagery_id": pl["imagery_id"], "card_id": cid, "label": f"분석하기 · {name}"[:60],
            "options": {"scope": "sgg", "sgg_cd": pl["sgg"], "chip": 1024, "overlap": 0.125, "conf": 0.25}}


@router.get("/cards/{cid}/fit")
async def fit(cid: str, region: str, request: Request):
    p = require(principal(request), lx=True)
    if p.role not in ("staff", "admin"):
        raise ApiError("forbidden", "LX 직원 · 관리자만")
    pl = await _plan(p, cid, region)
    note = "이 지역에 등록된 영상이 없습니다" if pl["fits"] is None else pl["note"]
    out = {"region": pl["sgg"], "name": pl["name"], "full": pl["full"], "fits": pl["fits"], "note": note, "imagery": pl["imagery"],
           "eta": None, "scope_text": None, "running": False, "as_of": now_iso()}
    if pl["fits"]:
        from .jobs import build_quote
        async with db(realm="lx") as conn:
            name = await conn.fetchval("SELECT name->>'ko' FROM cards WHERE id=$1", cid) or cid
            out["running"] = bool(await conn.fetchval(
                "SELECT 1 FROM jobs WHERE card_id=$1 AND state IN ('queued','running') AND options->>'scope'='sgg' AND options->>'sgg_cd'=$2 LIMIT 1", cid, pl["sgg"]))
        try:
            q = await build_quote(p, _job_body(cid, name, pl))
        except ApiError as e:
            out.update(fits=False, note=e.message or "지금은 분석 범위를 계산할 수 없습니다")
            return out
        if not q.get("allowed"):
            why = (q.get("reasons") or [""])[0]
            out.update(fits=False if why != "no_imagery" else None,
                       note={"no_imagery": "이 지역에 등록된 영상이 없습니다", "too_large": "범위가 너무 큽니다 — XI맵에서 읍면동으로 나눠 분석해 주세요",
                             "power_budget": "지금은 GPU 가 바쁩니다 — 잠시 뒤 다시"}.get(why, "지금은 분석할 수 없습니다"))
            return out
        async with db(realm="lx") as conn:
            rate, n = await _measured_rate(conn, (q.get("imagery") or {}).get("id"), float(q.get("upsample") or 1))
        sec = round(q["shards"] / rate + 5) if rate and q.get("shards") else _vnum((q.get("eta_s") or {}).get("value"))
        out["eta"] = {"seconds": sec, "text": _dur(sec), "basis": "최근 분석 기록" if rate else "모델 속도"} if sec else None
        sc = q.get("scope") or {}
        out["scope_text"] = sc.get("text") if isinstance(sc, dict) else None
    return out


@router.post("/cards/{cid}/analyze", status_code=202)
async def analyze(cid: str, body: dict, request: Request):
    p = require(principal(request), lx=True)
    if p.role not in ("staff", "admin"):
        raise ApiError("forbidden", "LX 직원 · 관리자만 분석을 시작합니다")
    region = str(body.get("region") or "")
    pl = await _plan(p, cid, region)
    if not pl["fits"]:
        raise ApiError("conflict", pl["note"] or "이 카드로 이 지역을 분석할 수 없습니다", {"region": pl["sgg"]}, 409)
    async with db(realm="lx") as conn:
        name = await conn.fetchval("SELECT name->>'ko' FROM cards WHERE id=$1", cid) or cid
        busy = await conn.fetchval("SELECT 1 FROM jobs WHERE card_id=$1 AND state IN ('queued','running') AND options->>'scope'='sgg' "
                                   "AND options->>'sgg_cd'=$2 LIMIT 1", cid, pl["sgg"])
    xi = f"/landxi/v3/xi-clean/?region={pl['sgg']}"
    if busy:
        return {"started": False, "running": True, "region": pl["sgg"], "name": pl["name"], "xi": xi, "as_of": now_iso()}
    from .jobs import submit
    res = await submit(_job_body(cid, name, pl), request)                       # 같은 길(POST /jobs) — 대기열 · 전력 규칙 · 작업 기록 그대로
    pos = None
    try:
        pos = res["job"]["state"]
    except Exception:  # noqa: BLE001
        pos = None
    return {"started": True, "running": False, "region": pl["sgg"], "name": pl["name"], "xi": xi, "state": pos, "as_of": now_iso()}
