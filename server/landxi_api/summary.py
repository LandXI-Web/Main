"""대표 수치 단일 요약(fix-server-summary · 숫자 한 출처의 서버 쪽) — `GET /api/v1/summary?region={sgg_cd}&card={card_id}`.

한 항목 = 기관 × 서비스(카드) × 지역(시군구). 모든 화면·에이전트가 같은 이름의 숫자를 여기서만 읽는다.
  stage     운영 | 시범 | 첫 결과 전 — 실제 보유 결과(배포본 스냅샷의 AI 결과 행 · 실태조사 정본)가 있을 때만 운영/시범.
  imagery   카탈로그 imagery 표(footprint ∩ 시군구 · 또는 imagery.sgg_cd) 기준.
  metrics   네 지표 · 같은 key = 같은 label = 같은 계산식(아래 METRICS). 값이 없으면 value null + note(0 을 지어내지 않는다).

계산식(정본):
  detected       AI 탐지       = 이 항목 배포본 스냅샷 결과 세트(sets.yaml aliases · 작업 결과 세트 results/{기관}/{작업} → 작업)의 detections 행 수
  suspect        의심 필지     = survey_counts(sgg).suspect — survey_sgg.findings(AI × 연속지적 규칙 R1–R6 · 적재 때 확정 · 대장 규칙 제외)
  field_check    현장 확인 필요 = survey_counts(sgg).field_check — R1–R6 의심 중 우선순위 A · 상태 open|assigned 인 서로 다른 필지 수
  review_pending 결과 확인 대기 = survey_counts(sgg).review_pending — R1–R6 의심 중 우선순위 A · 상태 open 인 건수(아직 배정·판정 전)
  실태조사 세 값은 /survey/stats · 에이전트(survey_stats · summary_lookup) · 보고서와 같은 함수(landxi_api.survey.survey_counts)에서 온다.
  적재 중(building)이면 값 None + note '집계 중' + survey_state 'building'.
  reports        기관 신고     = 열린(open) 기관 신고(feedback · 종류 무관) 건수
실태조사 두 지표는 그 지역에서 '필지 대조' 모듈(`*-parcel`)이 켜진 배포본 항목에만 붙는다(서비스 상세·영업 화면과 같은 조건).
기관 신고는 신고의 결과 세트가 이 항목 결과 세트와 같으면 이 항목, 실태조사 신고(survey/·review:)는 실태조사 항목,
결과 세트 없는 신고는 그 기관의 대표 항목(실태조사 항목 → 가장 앞선 단계) 한 곳에 붙는다 — 한 신고는 정확히 한 항목에만 센다(합계 = 기관 전체).

권한(RLS): 게스트 = 공개 배포본(시험 아님 · 운영/시범 · 실결과)만 · 실태조사·신고 값은 null · 기관 세션 = 자기 기관 항목만 ·
LX = 전부. `build(conn, tenant, region, card)` 는 에이전트 도구(fix-agent-scope)가 import 한다.
"""
from __future__ import annotations

import re
import time
from typing import Any

from fastapi import APIRouter, Request
from shapely.geometry import Point, shape
from starlette.concurrency import run_in_threadpool

from . import config
from .deps import db, principal
from .envelope import env, now_iso, today

router = APIRouter()

LX_ALL = "lx"                     # build(tenant=LX_ALL) = LX 세션(전 기관)
TTL = 60                          # 캐시(초) — 응답 as_of 로 표시
STAGE_RUN, STAGE_PILOT, STAGE_FIRST = "운영", "시범", "첫 결과 전"
STAGE_RANK = {"ga": 0, "canary": 1, "shadow": 2, "rolled_back": 3, "draft": 9}

# key → (label, unit 기본값, basis) — label 은 화면이 그대로 쓰는 이름. 같은 key = 같은 계산식.
METRICS: dict[str, tuple[str, str, str]] = {
    "detected": ("AI 탐지", "건", "measured"),
    "suspect": ("의심 필지", "count", "inferred"),
    "field_check": ("현장 확인 필요", "필지", "inferred"),
    "review_pending": ("결과 확인 대기", "건", "recorded"),
    "reports": ("기관 신고", "건", "recorded"),
}
SRC = {"detected": "AI 분석 결과", "suspect": "실태조사(필지 대조) 의심 후보 · 검수 전", "field_check": "실태조사(필지 대조) 결과 · 현장 확인 전",
       "review_pending": "실태조사 결과 중 아직 확인하지 않은 것", "reports": "기관이 보낸 신고"}

_cache: dict[str, Any] = {"t": 0.0, "items": None, "at": None}


# ── 작은 도구 ────────────────────────────────────────────────────────────────
_JOB_SET = re.compile(r"^(?:results|demo)/[^/]+/(job_[0-9A-Z]{26})$")


def canonical(set_id: str | None) -> str | None:
    """결과 세트 → detections.job_id 키. ① sets.yaml aliases(옛 스냅샷 이름) ② 작업 결과 세트 results/{기관}/{작업} = 그 작업
    (배포 적용 흐름이 만든 새 결과를 손 설정 없이 센다 — core-flow) ③ 그 밖은 그대로."""
    if not set_id:
        return None
    s = (config.load_yaml("sets").get("aliases") or {}).get(set_id, set_id)
    m = _JOB_SET.match(s)
    return m.group(1) if m else s


def _unit_of(set_id: str | None) -> str:
    """결과 세트의 셈 단위 — sets.yaml layers.count_unit(필지·동) · 그 밖은 '건'."""
    for L in config.load_yaml("sets").get("layers") or []:
        if L.get("set") == set_id and L.get("count_unit") in ("필지", "동"):
            return L["count_unit"]
    return "건"


def _metric(key: str, value, *, unit: str | None = None, as_of: str | None = None, note: str | None = None, basis: str | None = None) -> dict:
    label, u, b = METRICS[key]
    e = env(value, unit or u, basis or b, SRC[key], note, as_of=as_of)
    return {"label": label, **e}


def _name(v) -> str | None:
    return (v or {}).get("ko") if isinstance(v, dict) else v


def _has_parcel(mods) -> bool:
    ext = (mods or {}).get("ext") or {}
    return any(bool(v) and str(k).endswith("-parcel") for k, v in ext.items())


def _regions():
    from .regions import regions_base
    regs, geoms, _ = regions_base()
    by = {r["sgg_cd"]: r for r in regs}
    prev = {r["prev_cd"]: r["sgg_cd"] for r in regs if r.get("prev_cd")}
    return regs, geoms, by, prev


def _sgg_at(x: float, y: float) -> str | None:
    """점 → 지금 코드의 시군구(옛 코드 경계는 건너뛴다)."""
    _, geoms, by, _ = _regions()
    pt = Point(x, y)
    for cd in by:
        g = geoms.get(cd)
        if g is not None and g.contains(pt):
            return cd
    return None


def _cur_code(cd: str | None) -> str | None:
    if not cd:
        return None
    _, _, by, prev = _regions()
    return cd if cd in by else prev.get(cd, cd)


# ── 원천 읽기 ────────────────────────────────────────────────────────────────
async def _sys_facts(set_ids: list[str]) -> dict:
    """시스템(LX) 경로로 읽는 비민감 사실 — 결과 세트 행 수·중심, 카드 이름, 카탈로그 영상 → 시군구. 기관 RLS 와 무관하게 같은 값."""
    from .regions import derived
    out: dict[str, Any] = {"sets": {}, "cards": {}, "img": {}, "dp_hits": {}}
    async with db(realm="lx") as c:
        if set_ids:
            for r in await c.fetch("SELECT job_id, count(*) n, ST_X(ST_Centroid(ST_Extent(geom)::geometry)) x, "
                                   "ST_Y(ST_Centroid(ST_Extent(geom)::geometry)) y FROM detections WHERE job_id = ANY($1::text[]) GROUP BY 1",
                                   set_ids):
                out["sets"][r["job_id"]] = {"n": int(r["n"]), "x": r["x"], "y": r["y"]}
        out["cards"] = {r["id"]: _name(r["name"]) for r in await c.fetch("SELECT id, name FROM cards")}
    dv = await derived()
    out["img"] = dv.get("img") or {}
    for cd, dps in (dv.get("dp") or {}).items():
        for d in dps:
            out["dp_hits"].setdefault(d["id"], set()).add(cd)
    return out


def _imagery_of(img_by: dict, sgg: str | None) -> dict:
    if not sgg:
        return {"has": False, "label": None}
    _, _, by, _ = _regions()
    codes = {sgg, (by.get(sgg) or {}).get("prev_cd")} - {None}
    imgs = [i for cd in codes for i in img_by.get(cd, []) if i.get("kind") in ("ortho", None)]
    if not imgs:
        return {"has": False, "label": None}

    def yr(i):
        e = str(i.get("epoch") or i.get("year") or "")
        return e[:4] if e[:4].isdigit() else ""
    def kind_word(nm: str) -> str:
        return "드론영상" if "드론" in nm else "항공영상" if "항공" in nm else "위성영상" if "위성" in nm else "영상"
    # 가장 최근 해 · 같은 해면 종류가 이름에 드러난 영상(드론·항공·위성) 먼저
    best = max(imgs, key=lambda i: (yr(i), kind_word(i.get("name") or "") != "영상", i.get("id") or ""))
    word = kind_word(best.get("name") or "")
    y = yr(best)
    return {"has": True, "label": f"{y}년 {word}" if y else word}


# ── 핵심 ─────────────────────────────────────────────────────────────────────
async def build(conn, tenant: str | None, region: str | None = None, card: str | None = None) -> dict:
    """대표 수치 요약(계약 형식 dict). tenant: None = 게스트(공개분) · 'lx' = LX 세션(전 기관) · 그 밖 = 그 기관만.
    conn: 기관 자료(실태조사·신고)를 읽을 연결. RLS 연결(db(p))이면 RLS 가 한 번 더 막는다 — 다른 기관 연결을 넘기면 빈 목록.
    배포본·결과 세트·카탈로그는 시스템 경로로 읽고 tenant 로 거른다(기관 세션도 LX 가 만든 자기 결과 세트 행 수를 본다)."""
    realm_now, tid_now = await conn.fetchrow("SELECT current_setting('app.realm', true), current_setting('app.tenant_id', true)")
    if tenant not in (None, LX_ALL) and realm_now != "lx" and (tid_now or "") != tenant:
        return {"as_of": today(), "items": []}           # 남의 기관 연결 — 0 을 지어내지 않고 항목 0
    items = await _items(conn, tenant)
    return {"as_of": today(), "items": _filter(items, tenant, region, card)}


async def _items(conn, tenant: str | None) -> list[dict]:
    async with db(realm="lx") as c:
        dps = await c.fetch("SELECT id, tenant_id, card_id, stage, sgg_cd, snapshot_current, scale, modules, year, "
                            "region_name, coalesce(test,false) AS test FROM deploys WHERE NOT coalesce(test,false)")
    sets = sorted({canonical(d["snapshot_current"]) for d in dps if d["snapshot_current"]})
    facts = await _sys_facts(sets)
    _, _, by, _ = _regions()

    # 1) 배포본 → 지역: sgg_cd → 결과 중심 → AOI 가 한 시군구에만 걸릴 때 → 없음(광역·해외)
    rows = []
    for d in dps:
        rs = canonical(d["snapshot_current"])
        f = facts["sets"].get(rs) if rs else None
        sgg = _cur_code(d["sgg_cd"])
        if not sgg and f and f["x"] is not None:
            sgg = await run_in_threadpool(_sgg_at, f["x"], f["y"])
        if not sgg:
            hits = {h for h in facts["dp_hits"].get(d["id"], set()) if h in by}
            sgg = next(iter(hits)) if len(hits) == 1 else None
        rows.append({"d": d, "set": rs, "n": (f or {}).get("n", 0), "sgg": sgg})

    # 2) 묶기: (기관, 카드, 지역). 지역 없는 초안(결과 0)은 같은 기관·카드의 결과 있는 항목에 접는다(다음 해 계획 — 상태가 둘로 갈리지 않게)
    groups: dict[tuple, list] = {}
    for r in rows:
        groups.setdefault((r["d"]["tenant_id"], r["d"]["card_id"], r["sgg"]), []).append(r)
    for key in [k for k in groups if k[2] is None]:
        rs = groups[key]
        if all(x["d"]["stage"] == "draft" and not x["n"] for x in rs):
            home = [k for k in groups if k[:2] == key[:2] and k[2] is not None]
            if len(home) == 1:
                groups[home[0]] += groups.pop(key)

    # 3) 실태조사 · 신고(기관 자료 — 넘겨받은 연결 · RLS)
    from .survey import survey_counts                 # 숫자 한 출처(c2-numbers) — /survey/stats · 에이전트와 같은 함수
    sc = await survey_counts(conn, None)
    fb = await conn.fetch("SELECT tenant_id, set_id, count(*) n FROM feedback WHERE state='open' GROUP BY 1,2")
    survey: dict[tuple, dict] = {}
    for cd, v in (sc.get("by_sgg") or {}).items():
        if v["state"] not in ("done", "building"):
            continue
        survey[(v["tenant_id"], _cur_code(cd))] = v
    now = now_iso()

    items = []
    for (t, cid, sgg), rs in groups.items():
        rs.sort(key=lambda x: (STAGE_RANK.get(x["d"]["stage"], 5), -(x["n"] or 0)))
        lead = rs[0]["d"]
        n_det = sum(x["n"] for x in {x["set"]: x for x in rs if x["set"]}.values())
        res_sets = sorted({x["set"] for x in rs if x["set"] and x["n"]})
        parcel = any(_has_parcel(x["d"]["modules"]) for x in rs if x["d"]["stage"] != "draft")
        sv_here = survey.get((t, sgg)) if (parcel and sgg) else None
        busy = bool(sv_here) and sv_here["state"] == "building"
        real = bool(n_det) or bool(sv_here and (busy or sv_here["suspect"]))
        live = [x["d"]["stage"] for x in rs if x["d"]["stage"] != "draft"]
        if real and "ga" in live:
            stage = STAGE_RUN
        elif real and live:
            stage = STAGE_PILOT
        else:
            stage = STAGE_FIRST
        scale = next((x["d"]["scale"] for x in rs if x["d"]["scale"]), None) or {}
        det_asof = scale.get("as_of") if isinstance(scale, dict) else None
        unit = _unit_of(res_sets[0]) if res_sets else "건"
        reg = by.get(sgg) if sgg else None
        none_note = "이 서비스·지역의 실태조사 결과 없음"
        sv_note = "집계 중" if busy else (None if sv_here else none_note)
        m = {
            "detected": _metric("detected", n_det if n_det else None, unit=unit, as_of=det_asof,
                                note=None if n_det else "첫 결과 전"),
            "suspect": _metric("suspect", sv_here["suspect"] if sv_here else None, as_of=(sv_here or {}).get("as_of") or now,
                               note=sv_note or "의심 후보 · 검수 전 · 위법 판정 아님"),
            "field_check": _metric("field_check", sv_here["field_check"] if sv_here else None, as_of=now, note=sv_note),
            "review_pending": _metric("review_pending", sv_here["review_pending"] if sv_here else None, as_of=now, note=sv_note),
        }
        items.append({"card": cid, "card_name": facts["cards"].get(cid), "sgg_cd": sgg,
                      "region_name": (reg or {}).get("full") or _name(lead["region_name"]), "tenant": t, "stage": stage,
                      **({"survey_state": sv_here["state"]} if sv_here else {}),
                      "imagery": _imagery_of(facts["img"], sgg), "metrics": m,
                      "deploy_ids": [x["d"]["id"] for x in rs],
                      "_sets": set(res_sets), "_survey": bool(sv_here), "_rank": min(STAGE_RANK.get(s, 5) for s in live) if live else 9,
                      "_public": any(not x["d"]["test"] and x["d"]["stage"] in ("ga", "canary") and (x["d"]["snapshot_current"] or x["d"]["scale"])
                                     for x in rs),
                      "_prev": (reg or {}).get("prev_cd")})

    # 4) 기관 신고 — 한 신고 = 한 항목
    rep: dict[int, int] = {}
    for f in fb:
        t, sid = f["tenant_id"], f["set_id"] or ""
        mine = [i for i, it in enumerate(items) if it["tenant"] == t]
        if not mine:
            continue
        cs = canonical(sid) if sid else None
        tgt = next((i for i in mine if cs and cs in items[i]["_sets"]), None)
        if tgt is None and (sid.startswith("survey/") or sid.startswith("review:")):
            tgt = next((i for i in mine if items[i]["_survey"]), None)
        if tgt is None:
            tgt = sorted(mine, key=lambda i: (not items[i]["_survey"], items[i]["_rank"], items[i]["card"] or ""))[0]
        rep[tgt] = rep.get(tgt, 0) + int(f["n"])
    for i, it in enumerate(items):
        it["metrics"]["reports"] = _metric("reports", rep.get(i, 0), as_of=now)
    items.sort(key=lambda it: (it["tenant"] or "", it["_rank"], it["card"] or "", it["sgg_cd"] or ""))
    return items


def _filter(items: list[dict], tenant: str | None, region: str | None, card: str | None) -> list[dict]:
    out = []
    for it in items:
        if tenant is None:
            if not it["_public"] or it["stage"] == STAGE_FIRST:
                continue
        elif tenant != LX_ALL and it["tenant"] != tenant:
            continue
        if card and it["card"] != card:
            continue
        if region:
            codes = [c for c in (it["sgg_cd"], it["_prev"]) if c]
            if not any(c == region or (len(region) < 5 and c.startswith(region)) for c in codes):
                continue
        o = {k: v for k, v in it.items() if not k.startswith("_")}
        if tenant is None:                     # 게스트: 기관 자료(실태조사·신고)는 값 없이
            o["metrics"] = {**o["metrics"], **{k: _metric(k, None, note="로그인 후 확인") for k in ("suspect", "field_check", "review_pending", "reports")}}
        out.append(o)
    return out


async def cached_all() -> tuple[list[dict], str]:
    """LX 전체 항목(60 s 캐시) — 게이트웨이 응답용. 계산식은 build 와 같다(_items)."""
    if _cache["items"] is not None and time.time() - _cache["t"] < TTL:
        return _cache["items"], _cache["at"]
    async with db(realm="lx") as c:
        items = await _items(c, LX_ALL)
    _cache.update(t=time.time(), items=items, at=now_iso())
    return items, _cache["at"]


def invalidate():
    _cache["t"] = 0.0


@router.get("/summary")
async def summary(request: Request, region: str | None = None, card: str | None = None, fresh: int | None = None):
    p = principal(request)
    tenant = None if p.guest else (LX_ALL if p.is_lx else p.tenant_id)
    if fresh and p.is_lx:
        invalidate()
    items, at = await cached_all()
    return {"as_of": today(), "computed_at": at, "items": _filter(items, tenant, (region or "").strip() or None, (card or "").strip() or None)}
