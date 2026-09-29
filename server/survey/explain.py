"""설명 가능성(explain) · 응답 모양 — Finding · 필지 대장 vs 현황 · 이력. 모든 수치는 봉투(F1-CONTRACT §2 · v1.1-1).

정직성 규칙(F2-S 완료 기준 6 · README §6 대응표):
- 임계는 전부 `[추정 초기값]`(basis estimate) — 법령 기준값 아님.
- 대장 결손은 숨기지 않는다: `건축물대장 미대조`(건축HUB 키 대기) · 규칙별 허가 대장 미대조 · 용도지역 미결합 · 소유구분 연속지적 미제공.
- 규칙별 한계 note 1줄(R2 과다 추정 · R1/R6 오탐 요인 · R3 과소 추정 …)을 그대로 싣는다.
"""
from __future__ import annotations

import datetime as dt
import math

from . import rules as R
from .db import AS_OF, FIXED_PHRASE, IMG23, IMG25, LEDGER, SRC_PARCELS, SRC_SUSPECTS, SRC_SURVEY, SRC_TIMELINE

AI_NOTE = "검수 전"
KST = dt.timezone(dt.timedelta(hours=9))
CLS_KO = {"bld": "건물", "crop": "경작지", "park": "주차장", "gh": "비닐하우스", "uncrop": "비경작지"}

# README §6 대응표 — 규칙별로 대조하지 못한 대장(결손)
LEDGER_GAPS = {
    "R1": [("building_ledger", "건축물대장 미대조", "공공데이터포털 건축HUB API 키 대기 — 합법 건축물·농업용 시설 구분 불가"),
           ("farmland_conversion", "농지전용 허가 대장 미대조", "기관 대장 표본 대기")],
    "R2": [("farm_register", "농지원부·경작 신고 미대조", "기관 대장 표본 대기"),
           ("building_ledger", "건축물대장 미대조", "건축HUB API 키 대기")],
    "R3": [("building_ledger", "건축물대장 미대조", "건축HUB API 키 대기"),
           ("farmland_conversion", "농지전용 허가 대장 미대조", "기관 대장 표본 대기")],
    "R4": [("farmland_conversion", "농지전용 허가 대장 미대조", "기관 대장 표본 대기"),
           ("building_ledger", "건축물대장 미대조", "건축HUB API 키 대기")],
    "R5": [("forest_conversion", "산지전용 허가 대장 미대조", "기관 대장 표본 대기"),
           ("building_ledger", "건축물대장 미대조", "건축HUB API 키 대기")],
    "R6": [("building_ledger", "건축물대장 미대조", "건축HUB API 키 대기 — 점용허가·대지 건물 구분 불가"),
           ("occupancy_permit", "도로·하천 점용허가 미대조", "기관 대장 표본 대기")],
}
TH_LABEL = {"R1_bld_m2": ("AI 건물 합계 하한", "m2"), "R2_parcel_min_m2": ("최소 필지면적", "m2"),
            "R2_crop_ratio_max": ("AI 농경 비율 상한", "ratio"), "R2_bld_ratio_max": ("AI 건물 비율 상한", "ratio"),
            "R3_gh_m2": ("AI 비닐하우스 합계 하한", "m2"), "R4_park_m2": ("AI 주차장 합계 하한", "m2"),
            "R5_crop_m2": ("AI 경작지+비닐하우스 하한", "m2"), "R5_crop_ratio": ("필지 대비 비율 하한", "ratio"),
            "R6_bld_m2": ("AI 건물 합계 하한", "m2"), "obj_in_frac": ("객체 과반 포함", "ratio"), "conf_min": ("신뢰도 하한", "ratio")}


def env(value, unit, basis, source, note=None, as_of=AS_OF):
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        value = None
    e = {"value": value, "unit": unit, "basis": basis, "as_of": as_of, "source": source}
    if note:
        e["note"] = note
    return e


def _r(v, n=1):
    return None if v is None else round(float(v), n)


def _split(s):
    return [x for x in (s or "").replace(";", ",").split(",") if x] if isinstance(s, str) else []


def basis_of(row) -> str:
    return "demo" if row.get("demo") else "inferred"


# ─────────────────────────── Finding ───────────────────────────
def finding_item(row: dict) -> dict:
    """survey_findings 행 → Finding(v1.1-22). 대표점은 geometry(Point) · 폴리곤은 PMTiles 층."""
    lon, lat = row.get("lon"), row.get("lat")
    b = "inferred"
    pm = row.get("parcel_m2")
    ev = row.get("evid_m2")
    out = {
        "id": row["id"], "rule": row["rule"], "rule_nm": row["rule_nm"], "priority": row["priority"],
        "rank": env(row.get("rank"), "count", "estimate", SRC_SUSPECTS, "점수 순위(시군구 안)"),
        "score": env(row.get("score"), "score", "estimate", SRC_SUSPECTS, "규칙 기본점 + 근거면적 + 신뢰도 + 보강근거 [추정 초기값]"),
        "pnu": row["pnu"], "addr": row.get("addr"), "emd": row.get("emd"), "emd_cd": row.get("emd_cd"), "jimok": row.get("jimok"),
        "yongdo": row.get("yongdo") or None, "nongup": row.get("nongup") or None,
        "parcel_m2": env(_r(pm), "m2", "measured", f"{SRC_PARCELS} (EPSG:5186 면적)"),
        "evid_m2": env(_r(ev), "m2", b, f"{SRC_SURVEY} suspects", AI_NOTE),
        "evid_pct": env(_r(100 * ev / max(pm, 1), 1) if (ev is not None and pm) else None, "%", b, "evid_m2 ÷ parcel_m2", AI_NOTE),
        "conf": env(_r(row.get("conf"), 3), "ratio", b, "AI 객체 평균 신뢰도(면적 가중)", AI_NOTE),
        "corroboration": _split(row.get("corroboration")), "img_date": row.get("img_date"), "evidence": row.get("evidence"),
        "ai_ids": _split(row.get("ai_ids")), "lnglat": [lon, lat],
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
        "state": row.get("state", "open"), "assignee": row.get("assignee"),
        "planned_for": row["planned_for"].isoformat() if row.get("planned_for") else None,
        "reason": row.get("reason"), "updated_by": row.get("updated_by"),
        "updated_at": row["updated_at"].astimezone(KST).isoformat(timespec="seconds") if row.get("updated_at") else None,
        "basis": basis_of(row),
    }
    if row.get("demo"):
        out["demo_note"] = "시연 쓰기(LX 직원) — 24h 뒤 자동 원복"
    return out


def score_parts(rule: str, p: dict) -> tuple[list[dict], float]:
    """점수 분해(s3_survey.py 식 그대로) — 합계 round(·,1) = findings.score (tests)."""
    d = R.definitions()[rule]
    base = d["base_score"]
    if rule in ("R1", "R6"):
        a, c = p["a23_bld_in_m2"], p["a23_bld_conf"]
    elif rule == "R4":
        a, c = p["a23_park_in_m2"], p["a23_park_conf"]
    elif rule == "R3":
        if p["a25_gh_in_m2"] >= p["a23_gh_in_m2"]:
            a, c = p["a25_gh_in_m2"], p["a25_gh_conf"]
        else:
            a, c = p["a23_gh_in_m2"], p["a23_gh_conf"]
    elif rule == "R5":
        a = p["a23_crop_m2"] + max(p["a23_gh_m2"], p["a25_gh_m2"])
        c = p["a23_crop_conf"] or 0
    else:
        a = p["area_m2"] * (1 - p["r23_farm"])
        c = p["a23_crop_conf"]
    parts = [{"label": f"규칙 기본점({rule})", "points": base},
             {"label": "근거면적 8·log10(㎡) (최대 25)", "points": round(min(25.0, 8 * math.log10(max(a, 1))), 2)},
             {"label": "15 × 평균신뢰도(없으면 0.5)", "points": round(15 * (c if c else 0.5), 2)}]
    if p.get("nongup") == "농업진흥구역" and rule in ("R1", "R4", "R2"):
        parts.append({"label": "보강: 농업진흥구역", "points": 8})
    if rule == "R2" and p["a25_uncrop_m2"] > 0:
        parts.append({"label": "보강: 2025 A02 비경작지 탐지", "points": 12})
    if rule == "R2" and p["a25_crop_m2"] > 0 and p["a25_uncrop_m2"] == 0:
        parts.append({"label": "반증: 2025 A02 경작지 탐지", "points": -15})
    if rule == "R3" and p["a23_gh_in_m2"] > 0 and p["a25_gh_in_m2"] > 0:
        parts.append({"label": "보강: 2023·2025 모두 비닐하우스", "points": 8})
    if rule in ("R1", "R6") and (p.get("chg_built_new_m2") or 0) > 0:
        parts.append({"label": "보강: 2025 신축 변화(built_new)", "points": 10})
    if rule in ("R1", "R4", "R6") and (p["a23_bld_n"] or 0) + (p["a23_park_n"] or 0) >= 3:
        parts.append({"label": "객체 3개 이상", "points": 3})
    raw = base + min(25.0, 8 * math.log10(max(a, 1))) + 15 * (c if c else 0.5) + sum(x["points"] for x in parts[3:])
    return parts, round(raw, 1)


def explain(row: dict, parcel: dict, cut: dict | None = None) -> dict:
    """규칙 조건 원문 · 근거면적 · 필지 대비 % · 신뢰도 · 보강근거 · 임계 [추정 초기값] · 대장 결손 · 한계 note."""
    rid = row["rule"]
    d = R.definitions()[rid]
    th = R.default_thresholds()
    cond = R.condition_text(rid, th)
    pm = row.get("parcel_m2") or 0
    ev = row.get("evid_m2") or 0
    pct = 100 * ev / max(pm, 1)
    conf = row.get("conf")
    corro = _split(row.get("corroboration"))
    parts, total = score_parts(rid, parcel)
    th_items = []
    for k in list(d["thresholds"]) + ["obj_in_frac", "conf_min"]:
        lab, unit = TH_LABEL[k]
        th_items.append({"key": k, "label": lab,
                         "value": env(th[k], unit, "estimate", f"server/survey/rules/{rid}.yaml" if k in d["thresholds"] else "s3_survey.py TH 공통",
                                      "[추정 초기값] · 법령 기준 아님 · 현장조사로 보정")})
    gaps = [{"key": k, "label": lab, "note": n} for k, lab, n in LEDGER_GAPS[rid]]
    if not parcel.get("yongdo"):
        gaps.append(_yongdo_gap(parcel))
    gaps.append({"key": "owner_kind", "label": "소유구분 연속지적 미제공", "note": "V-World 연속지적에 소유 정보 없음 · 성명 열 없음"})
    img = row.get("img_date") or parcel.get("_img") or IMG23
    th_txt = " · ".join(f"{t['label']} {t['value']['value']}" for t in th_items[:len(d['thresholds'])])
    lines = [
        f"규칙 {rid} {d['name']}: {cond}",
        f"근거: AI {('건물' if rid in ('R1', 'R6') else '주차장' if rid == 'R4' else '비닐하우스' if rid == 'R3' else '농경 부재 면적' if rid == 'R2' else '경작지+비닐하우스')} "
        f"{ev:,.0f}㎡ — 필지 {pm:,.0f}㎡ 대비 {pct:.0f}% [{img} · AI 추론 · 검수 전]",
        f"신뢰도: {'평균 ' + format(conf, '.2f') if conf else '해당 없음(근거가 AI 부재)'} · 보강근거: {', '.join(corro) if corro else '없음'}",
        f"임계 [추정 초기값]: {th_txt} · 객체 과반 포함 0.5 · 신뢰도 하한 0.5",
        f"대장 결손: {' · '.join(g['label'] for g in gaps[:2])} — 현장조사 전 대조 필요",
        f"한계: {d.get('note')}",
    ]
    prio_note = None
    if cut:
        rc = cut.get("readme") or {"A_score_ge": cut.get("A"), "B_score_ge": cut.get("B")}
        prio_note = f"등급 절단: A ≥ {rc['A_score_ge']} · B ≥ {rc['B_score_ge']}(시군구 전체 점수 상위 5% · 다음 20%)"
    return {
        "rule": rid, "rule_nm": d["name"], "condition": cond, "evidence": row.get("evidence"), "lines": lines,
        "evid_m2": env(_r(ev), "m2", "inferred", f"{SRC_SURVEY} suspects", AI_NOTE),
        "parcel_m2": env(_r(pm), "m2", "measured", f"{SRC_PARCELS} (EPSG:5186 면적)"),
        "evid_pct": env(round(pct, 1), "%", "inferred", "evid_m2 ÷ parcel_m2", AI_NOTE),
        "conf": env(_r(conf, 3), "ratio", "inferred", "AI 객체 평균 신뢰도(면적 가중 · 과반 포함 · ≥0.5)",
                    AI_NOTE if conf else "R2 는 근거가 'AI 농경 부재' — 신뢰도 없음"),
        "corroboration": corro,
        "thresholds": th_items, "threshold_basis": d.get("threshold_basis"),
        "score": env(row.get("score"), "score", "estimate", SRC_SUSPECTS, prio_note),
        "score_parts": [{"label": x["label"], "points": env(x["points"], "score", "estimate", "s3_survey.py 점수식")} for x in parts],
        "score_check": {"recomputed": env(total, "score", "estimate", "explain.score_parts"), "equal": abs(total - (row.get("score") or 0)) < 1e-6},
        "ledger_gaps": gaps,
        "note": d.get("note"),
        "fixed": FIXED_PHRASE,
    }


# ─────────────────────────── 필지 대장 vs 현황 ───────────────────────────
def _yongdo_gap(p: dict) -> dict:
    if p.get("src") in (None, "canon"):
        return {"key": "yongdo", "label": "용도지역 미결합", "note": "대표점이 용도지역 폴리곤 밖"}
    return {"key": "yongdo", "label": "용도지역 미결합", "note": "용도지역·농업진흥지역 층 대조 전(연속지적만 적재)"}


def parcel_facts(p: dict, img: str | None = None) -> dict:
    canon = p.get("src") in (None, "canon")
    img23 = img or IMG23
    src23 = f"{SRC_SURVEY} parcels · {img23}" if canon else f"survey_parcel_ai · {img23}"
    src25 = f"{SRC_SURVEY} parcels · {IMG25}"
    area = p.get("area_m2") or 0

    def cls23(c):
        o = {"m2": env(_r(p[f"a23_{c}_m2"]), "m2", "inferred", src23, "필지 안 교차면적 합(모든 객체) · 검수 전"),
             "ratio": env(_r(p.get(f"r23_{c}"), 3), "ratio", "inferred", "a23_m2 ÷ 필지면적", AI_NOTE),
             "in_m2": env(_r(p.get(f"a23_{c}_in_m2")), "m2", "inferred", src23, "객체 과반 포함 · 신뢰도 ≥ 0.5 · 규칙 근거"),
             "n": env(int(p.get(f"a23_{c}_n") or 0), "count", "inferred", src23, "과반 포함 객체 수"),
             "conf": env(_r(p.get(f"a23_{c}_conf"), 3), "ratio", "inferred", src23, AI_NOTE)}
        o["ai_ids"] = _split(p.get(f"a23_{c}_ids"))
        return o

    jiga = p.get("jiga")
    ledger = {
        "jimok": p.get("jimok"), "jimok_nm": p.get("jimok_nm"),
        "area_m2": env(_r(area), "m2", "measured", f"{SRC_PARCELS} (V-World 연속지적 도형 · EPSG:5186)" if canon else "연속지적 도형 · EPSG:5186",
                       as_of=p.get("src_as_of") or AS_OF),
        "jiga": env(int(jiga) if jiga is not None and not (isinstance(jiga, float) and math.isnan(jiga)) else None, "krw_m2", "recorded",
                    "V-World 연속지적 공시지가", None if jiga else "공란(도로·구거 등 비과세 필지 다수)", as_of=p.get("jiga_ym") or AS_OF),
        "yongdo": p.get("yongdo") or None, "nongup": p.get("nongup") or None,
        "owner_kind": None, "source": LEDGER if canon else ("연속지적(전국) " + str(p.get("src_as_of") or "")).strip(),
        "as_of": p.get("src_as_of") or AS_OF,
    }
    gaps = []
    if not p.get("yongdo"):
        gaps.append(_yongdo_gap(p))
    gaps.append({"key": "owner_kind", "label": "소유구분 연속지적 미제공", "note": "V-World 연속지적에 소유 정보 없음 · 성명 열 없음"})
    gaps.append({"key": "building_ledger", "label": "건축물대장 미대조", "note": "건축HUB API 키 대기"})
    current = {
        "2023": {"src": img23, "basis": "inferred", "classes": {c: cls23(c) for c in ("bld", "crop", "park", "gh")},
                 "farm_ratio": env(_r(p.get("r23_farm"), 3), "ratio", "inferred", "(경작지+비닐하우스) ÷ 필지면적", AI_NOTE)},
        "2025": {"src": IMG25, "basis": "inferred", "classes": {
            "crop": {"m2": env(_r(p.get("a25_crop_m2")), "m2", "inferred", src25, AI_NOTE)},
            "uncrop": {"m2": env(_r(p.get("a25_uncrop_m2")), "m2", "inferred", src25, AI_NOTE)},
            "gh": {"m2": env(_r(p.get("a25_gh_m2")), "m2", "inferred", src25, AI_NOTE),
                   "in_m2": env(_r(p.get("a25_gh_in_m2")), "m2", "inferred", src25, "과반 포함 · 신뢰도 ≥ 0.5"),
                   "n": env(int(p.get("a25_gh_n") or 0), "count", "inferred", src25), "ai_ids": _split(p.get("a25_gh_ids"))}},
            "note": "A02 는 2025 단일 시점 추론(촬영월 미상)" if canon else "두 번째 시점 AI 결과 없음"},
        "change": {"chg": p.get("chg") or None,
                   "built_new_m2": env(_r(p.get("chg_built_new_m2")), "m2", "inferred", "A04 비지도 변화지수(드론 4시점 AOI)",
                                       "변화 지수(비지도) · 검수 전")},
    }
    # 대장 vs 현황 한 줄 대조(카드 표)
    b23 = p["a23_bld_m2"] or 0
    f23 = (p["a23_crop_m2"] or 0) + (p["a23_gh_m2"] or 0)
    vs = [
        {"item": "지목", "ledger": p.get("jimok_nm"), "current": f"AI 건물 {b23:,.0f}㎡ · 농경 {f23:,.0f}㎡(2023)",
         "match": None, "note": "지목과 현황의 일치 판정은 규칙(R1–R6)으로만 — 위법 판정 아님"},
        {"item": "면적", "ledger": f"{area:,.0f}㎡", "current": f"AI 객체 합 {(b23 + f23 + (p['a23_park_m2'] or 0)):,.0f}㎡(2023)"},
        {"item": "2025", "ledger": "—", "current": f"A02 경작 {(p['a25_crop_m2'] or 0):,.0f}㎡ · 비경작 {(p['a25_uncrop_m2'] or 0):,.0f}㎡ · "
                                                  f"비닐하우스 {(p['a25_gh_m2'] or 0):,.0f}㎡"},
    ]
    return {"ledger": ledger, "current": current, "vs": vs, "gaps": gaps,
            "flags": _split(p.get("flags")), "sus_rule": p.get("sus_rule") or None, "sus_priority": p.get("sus_priority") or None,
            "sus_score": env(p.get("sus_score"), "score", "estimate", SRC_SUSPECTS) if p.get("sus_score") is not None else None}


def history_items(events: list[dict] | None, summary: list[str] | None = None) -> list[dict]:
    """timeline 이벤트(kind ledger|ai|change) → 봉투 입힌 이력."""
    out = []
    for e in events or []:
        k = e.get("kind")
        it = {"t": e.get("t"), "kind": k, "src": e.get("src")}
        if k == "ledger":
            it["basis"] = "recorded"
            it["jimok"] = e.get("jimok")
            it["area_m2"] = env(_r(e.get("area_m2")), "m2", "measured", SRC_TIMELINE)
            it["jiga"] = env(e.get("jiga_won_m2"), "krw_m2", "recorded", "V-World 연속지적 공시지가", as_of=e.get("t") or AS_OF)
        elif k == "ai":
            it["basis"] = "inferred"
            it["area_m2"] = {c: env(_r(v), "m2", "inferred", SRC_TIMELINE, AI_NOTE) for c, v in (e.get("area_m2") or {}).items()}
            it["label"] = " · ".join(f"{CLS_KO.get(c, c)} {v:,.0f}㎡" for c, v in (e.get("area_m2") or {}).items() if v)
            it["objects"] = [{"id": o.get("id"), "cls": o.get("cls"), "m2": env(_r(o.get("m2")), "m2", "inferred", SRC_TIMELINE),
                              "conf": env(_r(o.get("conf"), 3), "ratio", "inferred", SRC_TIMELINE)} for o in (e.get("objects") or [])]
        elif k == "change":
            it["basis"] = "inferred"
            it["from_t"] = e.get("from")
            it["cls"] = e.get("cls")
            it["m2"] = env(_r(e.get("m2")), "m2", "inferred", SRC_TIMELINE, "변화 지수(비지도) · 검수 전")
            it["n_env"] = env(e.get("n"), "count", "inferred", SRC_TIMELINE)
            it["score_max"] = env(e.get("score_max"), "ratio", "inferred", SRC_TIMELINE)
        out.append(it)
    return out
