"""실태조사 보고서 초안 — 서식 `survey-emd` · python-docx · LLM 없이 닫힌다(F2-S · v1.1-22 · v1.1-26).

    build_draft(emd_cd, rule=None, top=20, narrative=None, fmt="dict"|"docx", realm="lx", tenant="") -> dict | bytes

① 개요 ② 집계표(규칙 × 등급 × 상태) ③ 의심 상위 N ④ 근거 영상 표기 ⑤ 법적 근거 [법령 확인 · 2차 RAG] 결손 ⑥ 조치 제안.
모든 수치는 봉투(as_json) · 문서에는 꼬리표 문구. 고정 문구 `AI 추론 · 검수 전 · 현장 확인 전 · 위법 판정 아님`.
narrative(F2-E LLM 서술): 문장마다 `[n]` 인용(citations 번호) 검사 — 하나라도 없거나 범위를 벗어나면 서술을 버리고 정형 문장.
성명 열 없음(연속지적에 소유 정보 없음).
"""
from __future__ import annotations

import datetime as dt
import io
import re

from . import rules as R
from .db import AS_OF, FIXED_PHRASE, IMG23, IMG25, LEDGER, RULE_IDS, SRC_SUSPECTS, STATES
from .explain import env

KST = dt.timezone(dt.timedelta(hours=9))
STATE_KO = {"open": "미조치", "assigned": "배정", "inspected": "조사완료", "closed": "종결", "dismissed": "오탐"}
LAW_CANDIDATES = {"R1": "건축법 · 농지법(농지전용)", "R2": "농지법(농지 이용실태)", "R3": "국토계획법(용도지역 행위제한) · 농지법",
                  "R4": "농지법(농지전용)", "R5": "산지관리법(산지전용)", "R6": "도로법 · 하천법 · 공유수면법(점용)"}
SENT_RE = re.compile(r"[^.!?。…]+[.!?。…]?")
CITE_RE = re.compile(r"\[(\d+)\]")


class NotFound(Exception):
    pass


def _conn(realm: str, tenant: str):
    import psycopg
    from psycopg.rows import dict_row
    from landxi_api import config
    c = psycopg.connect(config.PG_DSN, autocommit=False, row_factory=dict_row)
    c.execute("SELECT set_config('app.realm', %s, true), set_config('app.tenant_id', %s, true)", (realm or "public", tenant or ""))
    return c


def collect(emd_cd: str, rule: str | None = None, top: int = 20, realm: str = "lx", tenant: str = "") -> dict:
    """초안 데이터(봉투 전 원값) — RLS 는 호출자 realm/tenant 그대로."""
    with _conn(realm, tenant) as c:
        e = c.execute("SELECT emd_cd, name, names, parcels, area_ha, farm_parcels, jimok_top, coalesce(sgg_cd, left(emd_cd, 5)) sgg_cd, tenant_id "
                      "FROM survey_emd WHERE emd_cd=%s", (emd_cd,)).fetchone()
        if not e:
            raise NotFound(f"읍면동 {emd_cd} 없음(실태조사를 만들지 않은 곳이거나 다른 기관)")
        sg = c.execute("SELECT sgg_cd, tenant_id, name, sido, imagery, parcels_as_of, priority_cut, parcels_src ? 'canon' AS canon "
                       "FROM survey_sgg WHERE sgg_cd=%s", (e["sgg_cd"],)).fetchone()
        org = c.execute("SELECT name->>'ko' AS ko FROM tenants WHERE id=%s", ((sg or {}).get("tenant_id") or e["tenant_id"],)).fetchone()
        w = "emd_cd=%s" + (" AND rule=%s" if rule else "")
        a = (emd_cd, rule) if rule else (emd_cd,)
        agg = c.execute(f"SELECT rule, priority, state, count(*) n FROM survey_findings WHERE {w} GROUP BY 1,2,3", a).fetchall()
        rows = c.execute(f"SELECT f.*, p.jibun, p.ri, (SELECT count(*) FROM survey_timeline t, jsonb_array_elements(t.events) ev "
                         f"WHERE t.pnu = f.pnu AND ev->>'kind' = 'change') AS n_change "
                         f"FROM survey_findings f LEFT JOIN survey_parcels p USING (pnu) WHERE {w.replace('emd_cd', 'f.emd_cd').replace('rule=', 'f.rule=')} "
                         f"ORDER BY f.score DESC, f.rank LIMIT %s", a + (top,)).fetchall()
        sp = c.execute(f"SELECT count(DISTINCT pnu) FROM survey_findings WHERE {w}", a).fetchone()["count"]
        cut = c.execute("SELECT value FROM survey_meta WHERE key='priority_cut'").fetchone()
    region = _region(e["sgg_cd"], sg)
    region["org"] = (org or {}).get("ko")
    return {"emd": dict(e), "rule": rule, "top": top, "agg": [dict(x) for x in agg], "rows": [dict(x) for x in rows],
            "suspect_parcels": sp, "cut": (cut or {}).get("value") if region["canon"] else ((sg or {}).get("priority_cut") or (cut or {}).get("value")),
            "region": region, "at": dt.datetime.now(KST)}


def _region(sgg_cd: str, sg: dict | None) -> dict:
    """시군구 이름 · 시도 · 영상 표기 — 데이터(regions · survey_sgg)에서. 정본(canon)이면 옛 두 시점 표기."""
    from . import nation as N
    try:
        rg = N.region(sgg_cd)
    except Exception:
        rg = {"sgg_cd": sgg_cd, "name": (sg or {}).get("name") or sgg_cd, "sido": (sg or {}).get("sido"), "full": (sg or {}).get("name") or sgg_cd}
    canon = bool((sg or {}).get("canon")) if sg else True
    img = [IMG23, IMG25] if canon else [x for x in [(sg or {}).get("imagery")] if x]
    asof = (sg or {}).get("parcels_as_of") or ""
    return {"sgg_cd": rg["sgg_cd"], "name": rg.get("name"), "sido": rg.get("sido"), "full": rg.get("full"), "canon": canon, "imagery": img,
            "ledger": LEDGER if canon else (f"연속지적(전국 · {asof})" if asof else "연속지적(전국)")}


def _table(d: dict) -> dict:
    rules = [d["rule"]] if d["rule"] else RULE_IDS
    t = {r: {"A": 0, "B": 0, "C": 0, **{s: 0 for s in STATES}, "total": 0} for r in rules}
    for x in d["agg"]:
        if x["rule"] not in t:
            continue
        t[x["rule"]][x["priority"]] += x["n"]
        t[x["rule"]][x["state"]] += x["n"]
        t[x["rule"]]["total"] += x["n"]
    return t


def citations(d: dict) -> list[dict]:
    """번호 붙은 사실(서술 문장이 [n]으로 인용) — 각 값은 봉투."""
    e = d["emd"]
    t = _table(d)
    tot = sum(v["total"] for v in t.values())
    a_n = sum(v["A"] for v in t.values())
    src = f"PostGIS survey_findings (emd_cd {e['emd_cd']})"
    c = [
        {"n": 1, "label": f"{e['name']} 연속지적 필지 수", "value": env(e["parcels"], "필지", "measured", LEDGER)},
        {"n": 2, "label": "실태조사 대상 후보(의심) 건수" + (f" · {d['rule']}" if d["rule"] else ""), "value": env(tot, "count", "inferred", src, "검수 전")},
        {"n": 3, "label": f"그중 A등급({d['region']['name']} 전체 점수 상위 5%)", "value": env(a_n, "count", "inferred", src, "검수 전")},
        {"n": 4, "label": "후보 필지 수", "value": env(d["suspect_parcels"], "필지", "inferred", src, "검수 전")},
        {"n": 5, "label": "미조치(open) 건수", "value": env(sum(v["open"] for v in t.values()), "count", "recorded", "survey_findings.state")},
    ]
    k = 6
    for r in t:
        if t[r]["total"]:
            c.append({"n": k, "label": f"{r} {R.definitions()[r]['name']} 건수", "value": env(t[r]["total"], "count", "inferred", src, "검수 전")})
            k += 1
    return c


def _default_narrative(d: dict, cites: list[dict]) -> dict:
    e = d["emd"]
    v = {c["n"]: c["value"]["value"] for c in cites}
    rules_txt = ", ".join(f"{c['label'].split(' 건수')[0]} {c['value']['value']:,}건 [{c['n']}]" for c in cites[5:]) or "해당 규칙 후보 없음"
    return {
        "overview": [f"{d['region']['name']} {e['name']}의 연속지적 {v[1]:,}필지를 "
                     f"{(d['region']['imagery'] or ['영상'])[0]} AI 결과와 대조했다 [1].",
                     f"규칙에 걸린 실태조사 대상 후보는 {v[2]:,}건이며 후보 필지는 {v[4]:,}필지다 [2][4]."],
        "findings": [f"규칙별로는 {rules_txt}이다.",
                     f"점수 상위 5%인 A등급은 {v[3]:,}건으로 현장 확인 우선 대상이다 [3]."],
        "actions": [f"미조치 {v[5]:,}건 가운데 A등급부터 현장조사 담당을 배정한다 [5][3].",
                    "현장 확인 전에 건축물대장과 허가 대장을 먼저 대조해 오탐을 줄인다 [2]."],
    }


def check_narrative(narrative, n_cites: int) -> tuple[dict | None, list[str]]:
    """문장마다 [n] 인용(1..n_cites) — 통과하면 정규화한 dict, 아니면 (None, 사유)."""
    if narrative is None:
        return None, ["서술 없음 — 정형 문장"]
    if isinstance(narrative, str):
        narrative = {"overview": [narrative]}
    elif isinstance(narrative, list):
        narrative = {"overview": narrative}
    out, bad = {}, []
    for sec, paras in narrative.items():
        if sec not in ("overview", "findings", "actions"):
            bad.append(f"알 수 없는 절 {sec}")
            continue
        paras = [paras] if isinstance(paras, str) else list(paras or [])
        keep = []
        for para in paras:
            for s in (m.group(0).strip() for m in SENT_RE.finditer(para or "")):
                if not s:
                    continue
                refs = [int(x) for x in CITE_RE.findall(s)]
                if not refs:
                    bad.append(f"인용 없음: {s[:40]}")
                elif any(r < 1 or r > n_cites for r in refs):
                    bad.append(f"인용 번호 범위 밖: {s[:40]}")
            keep.append(para)
        out[sec] = keep
    return (None, bad) if bad else (out, [])


def as_json(d: dict, narrative=None) -> dict:
    e = d["emd"]
    t = _table(d)
    cites = citations(d)
    narr, why = check_narrative(narrative, len(cites))
    src = f"PostGIS survey_findings (emd_cd {e['emd_cd']})"
    th = R.default_thresholds()
    rules = [d["rule"]] if d["rule"] else RULE_IDS
    rg = d["region"]
    return {
        "template": "survey-emd", "emd_cd": e["emd_cd"], "emd": e["name"], "rule": d["rule"], "limit": d["top"],
        "org": rg.get("org"), "sgg_cd": rg["sgg_cd"], "sgg": rg["name"], "sido": rg.get("sido"), "region_full": rg.get("full"),
        "title": f"{rg['name']} {e['name']} 실태조사 대상 후보 보고서(초안)", "fixed": FIXED_PHRASE,
        "overview": {"org": rg.get("org"), "sgg": rg["name"], "emd": e["name"], "parcels": env(e["parcels"], "필지", "measured", rg["ledger"]),
                     "area_ha": env(e["area_ha"], "ha", "measured", "survey_emd"),
                     "imagery": rg["imagery"], "ledger": rg["ledger"],
                     "rules": [{"id": r, "name": R.definitions()[r]["name"], "condition": R.condition_text(r, th)} for r in rules],
                     "thresholds_note": "임계는 전부 [추정 초기값] — 법령 기준 아님 · 현장조사로 보정"},
        "table": [{"rule": r, "name": R.definitions()[r]["name"],
                   **{k: env(v[k], "count", "inferred", src, "검수 전") for k in ("A", "B", "C", "total")},
                   "by_state": {s: env(v[s], "count", "recorded", "survey_findings.state") for s in STATES}} for r, v in t.items()],
        "top_items": [{"order": i + 1, "id": x["id"], "pnu": x["pnu"], "addr": x["addr"], "jibun": x.get("jibun"), "jimok": x["jimok"],
                       "rule": x["rule"], "priority": x["priority"], "state": x["state"],
                       "rank": env(x["rank"], "count", "estimate", SRC_SUSPECTS),
                       "evid_m2": env(round(x["evid_m2"], 1), "m2", "inferred", SRC_SUSPECTS, "검수 전"),
                       "evid_pct": env(round(100 * x["evid_m2"] / max(x["parcel_m2"] or 1, 1), 1), "%", "inferred", "evid ÷ 필지", "검수 전"),
                       "conf": env(None if x["conf"] is None else round(x["conf"], 3), "ratio", "inferred", SRC_SUSPECTS, "검수 전"),
                       "imagery": "4시점(AOI 안: 2023 · 2025-04/06/08/10)" if x["n_change"] else "2시점(2023 25cm · 2025 A02)",
                       "img_date": x["img_date"]} for i, x in enumerate(d["rows"])],
        "imagery_note": {"aoi_in": env(sum(1 for x in d["rows"] if x["n_change"]), "count", "recorded", "survey_timeline change 이벤트"),
                         "aoi_out": env(sum(1 for x in d["rows"] if not x["n_change"]), "count", "recorded", "survey_timeline"),
                         "canon": rg["canon"], "imagery": rg["imagery"],
                         "note": ("드론 4시점은 0.8×0.9km AOI(A01)만 덮는다 — 그 밖은 2023 ↔ 2025 두 시점(README §5)" if rg["canon"]
                                  else "AI 분석 영상 한 시점 — 시점 비교(변화)는 두 번째 영상 등록 후")},
        "law": [{"rule": r, "candidates": LAW_CANDIDATES[r], "status": "[법령 확인 · 2차 RAG]"} for r in rules],
        "actions": {"field_targets": env(sum(v["A"] for v in t.values()), "count", "inferred", src, "A등급 우선 · 검수 전"),
                    "checklist": ["건축물대장 대조(건축HUB API 키 대기)", "농지·산지전용 허가 대장 대조(기관 대장 표본 대기)",
                                  "현장 사진·측량 확인", "결과 입력: 조사완료(inspected) → 종결(closed) 또는 오탐(dismissed · 사유)"],
                    "fixed": FIXED_PHRASE},
        "citations": cites,
        "narrative": narr or _default_narrative(d, cites),
        "narrative_source": "llm(인용 검사 통과)" if narr else "정형 문장(LLM 미사용)",
        "narrative_rejected": why if (narrative is not None and not narr) else [],
        "as_of": AS_OF, "generated": d["at"].isoformat(timespec="seconds"), "source": src,
        "filename": filename(f"{rg['name']}_{e['name']}", d["at"]),
    }


def filename(emd_name: str, at: dt.datetime | None = None) -> str:
    at = at or dt.datetime.now(KST)
    return f"실태조사_초안_{emd_name}_{at:%Y%m%d}.docx"


# ─────────────────────────── docx ───────────────────────────
TAG = {"inferred": "AI 추론 · 검수 전", "recorded": "기록", "measured": "실측", "estimate": "추정"}


def _font(run, size=None, bold=None, color=None):
    from docx.oxml.ns import qn
    from docx.shared import Pt, RGBColor
    run.font.name = "맑은 고딕"
    rpr = run._element.get_or_add_rPr()
    rf = rpr.find(qn("w:rFonts"))
    if rf is None:
        rf = rpr.makeelement(qn("w:rFonts"), {})
        rpr.append(rf)
    for k in ("w:ascii", "w:hAnsi", "w:eastAsia", "w:cs"):
        rf.set(qn(k), "맑은 고딕")
    if size:
        run.font.size = Pt(size)
    if bold is not None:
        run.bold = bold
    if color:
        run.font.color.rgb = RGBColor.from_string(color)
    return run


def _p(doc, text="", size=10, bold=False, color=None, align=None, space_after=4):
    from docx.shared import Pt
    p = doc.add_paragraph()
    if text:
        _font(p.add_run(text), size, bold, color)
    p.paragraph_format.space_after = Pt(space_after)
    if align:
        p.alignment = align
    return p


def _shade(cell, hex_fill):
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn
    tcpr = cell._element.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), hex_fill)
    tcpr.append(shd)


def _tbl(doc, header: list[str], rows: list[list], widths=None, size=8.5, head_fill="E8ECEF"):
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.shared import Cm
    t = doc.add_table(rows=1, cols=len(header))
    t.style = "Table Grid"
    for i, h in enumerate(header):
        c = t.rows[0].cells[i]
        c.text = ""
        _font(c.paragraphs[0].add_run(h), size, True)
        c.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
        _shade(c, head_fill)
    for r in rows:
        cells = t.add_row().cells
        for i, v in enumerate(r):
            cells[i].text = ""
            s = "" if v is None else (f"{v:,}" if isinstance(v, int) else (f"{v:,.1f}" if isinstance(v, float) else str(v)))
            _font(cells[i].paragraphs[0].add_run(s), size)
            if isinstance(v, (int, float)):
                cells[i].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.RIGHT
    if widths:
        for row in t.rows:
            for i, w in enumerate(widths):
                row.cells[i].width = Cm(w)
    return t


def render_docx(d: dict, narrative=None) -> tuple[bytes, str]:
    from docx import Document
    from docx.enum.section import WD_ORIENT
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.shared import Cm, Pt
    j = as_json(d, narrative)
    doc = Document()
    sec = doc.sections[0]
    sec.orientation = WD_ORIENT.PORTRAIT
    sec.page_width, sec.page_height = Cm(21.0), Cm(29.7)
    sec.left_margin = sec.right_margin = Cm(1.8)
    sec.top_margin = sec.bottom_margin = Cm(1.6)
    st = doc.styles["Normal"]
    st.font.name = "맑은 고딕"
    st.font.size = Pt(10)
    from docx.oxml.ns import qn
    st.element.rPr.rFonts.set(qn("w:eastAsia"), "맑은 고딕")
    # 머리
    hdr = sec.header.paragraphs[0]
    _font(hdr.add_run(" · ".join(x for x in ["Land-XI 실태조사", j.get("org"), f"{j['sgg']} {j['emd']}", "초안"] if x)), 8, False, "6B7780")
    _p(doc, j["title"], 17, True, "14202A", space_after=2)
    _p(doc, f"작성 {j['generated'][:16].replace('T', ' ')} · 기관 {j.get('org') or '—'} · 대상 {j.get('region_full') or j['sgg']} {j['emd']}"
            + (f" · 규칙 {j['rule']}" if j["rule"] else " · 규칙 R1–R6") + f" · 상위 {j['limit']}건", 9, False, "56626B")
    box = doc.add_table(rows=1, cols=1)
    box.style = "Table Grid"
    c = box.rows[0].cells[0]
    _shade(c, "FFF4E5")
    c.text = ""
    _font(c.paragraphs[0].add_run(FIXED_PHRASE), 11, True, "9A3412")
    c.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
    _font(c.add_paragraph().add_run("이 문서는 현장조사 대상 후보 목록이다. 규칙 임계는 [추정 초기값]이며 법령 기준이 아니다. "
                                    "수치 꼬리표: AI 추론 · 검수 전 / 기록 / 실측 / 추정."), 8.5, False, "7C2D12")
    # ① 개요
    _p(doc, "", space_after=2)
    _p(doc, "① 개요", 12.5, True, "14202A")
    o = j["overview"]
    _tbl(doc, ["항목", "내용", "꼬리표"], [
        ["기관", o.get("org") or "—", ""],
        ["대상", f"{j.get('region_full') or o['sgg']} {o['emd']} (법정동 {j['emd_cd']})", ""],
        ["필지 수", f"{o['parcels']['value']:,}필지 · {o['area_ha']['value']:,.1f} ha", TAG["measured"]],
        ["영상", " / ".join(o["imagery"]), "기록"],
        ["대장", o["ledger"] + " (연속지적 표기 지목 · 토지대장 원본과 다를 수 있음)", "기록"],
        ["규칙", "; ".join(f"{r['id']} {r['name']}: {r['condition']}" for r in o["rules"]), TAG["estimate"]],
        ["임계", o["thresholds_note"], TAG["estimate"]],
    ], widths=[3.0, 11.6, 2.8])
    for s in j["narrative"].get("overview", []):
        _p(doc, s, 9.5, space_after=2)
    # ② 집계표
    _p(doc, "", space_after=2)
    _p(doc, "② 집계표 — 규칙 × 등급 × 상태", 12.5, True, "14202A")
    rows = []
    for r in j["table"]:
        rows.append([f"{r['rule']} {r['name']}", r["A"]["value"], r["B"]["value"], r["C"]["value"], r["total"]["value"],
                     *[r["by_state"][s]["value"] for s in STATES]])
    tot = ["계"] + [sum(x[i] for x in rows) for i in range(1, 10)]
    _tbl(doc, ["규칙", "A", "B", "C", "계", *[STATE_KO[s] for s in STATES]], rows + [tot],
         widths=[4.6, 1.2, 1.2, 1.4, 1.4, 1.5, 1.2, 1.5, 1.2, 1.2])
    _p(doc, f"꼬리표: 등급·건수 = AI 추론 · 검수 전 / 상태 = 기록. 등급 A = {j['sgg']} 전체 점수 상위 5%, B = 다음 20%.",
       8, False, "56626B")
    for s in j["narrative"].get("findings", []):
        _p(doc, s, 9.5, space_after=2)
    # ③ 의심 상위 N
    _p(doc, "", space_after=2)
    _p(doc, f"③ 의심 상위 {j['limit']}건 (점수순)", 12.5, True, "14202A")
    strip = (j.get("region_full") or "") + " "
    trs = [[x["order"], x["pnu"], (x["addr"] or "").replace(strip, ""), x["jimok"], x["rule"], x["priority"],
            x["evid_m2"]["value"], f"{x['evid_pct']['value']:.0f}%", "-" if x["conf"]["value"] is None else f"{x['conf']['value']:.2f}",
            STATE_KO.get(x["state"], x["state"])] for x in j["top_items"]]
    _tbl(doc, ["No", "PNU", "소재지", "지목", "규칙", "등급", "근거면적㎡", "필지 대비", "신뢰도", "상태"], trs,
         widths=[0.9, 3.4, 3.8, 1.1, 1.0, 1.0, 1.9, 1.5, 1.3, 1.5], size=7.5)
    _p(doc, "꼬리표: 근거면적·비율·신뢰도 = AI 추론 · 검수 전. 소유자 성명은 싣지 않는다(연속지적에 없음).", 8, False, "56626B")
    # ④ 근거 영상
    _p(doc, "", space_after=2)
    _p(doc, "④ 근거 영상 표기", 12.5, True, "14202A")
    im = j["imagery_note"]
    if im.get("canon"):
        _tbl(doc, ["구분", "건수(상위 N 안)", "영상"], [
            ["드론 AOI 안(4시점)", im["aoi_in"]["value"], "2023 25cm 항공 · 2025-04/06/08/10 드론(A01 · 변화지수 비지도)"],
            ["AOI 밖(2시점)", im["aoi_out"]["value"], "2023 25cm 항공 · 2025 드론(A02 · 촬영월 미상)"],
        ], widths=[4.0, 3.0, 10.4])
    else:
        _tbl(doc, ["구분", "건수(상위 N 안)", "영상"], [
            ["AI 분석 영상", im["aoi_in"]["value"] + im["aoi_out"]["value"], " / ".join(im.get("imagery") or []) or "—"],
        ], widths=[4.0, 3.0, 10.4])
    _p(doc, im["note"], 8, False, "56626B")
    # ⑤ 법적 근거(결손)
    _p(doc, "", space_after=2)
    _p(doc, "⑤ 법적 근거 — [법령 확인 · 2차 RAG]", 12.5, True, "14202A")
    _tbl(doc, ["규칙", "검토 후보 법령(확인 전)", "상태"], [[x["rule"], x["candidates"], x["status"]] for x in j["law"]], widths=[1.6, 11.0, 4.8])
    _p(doc, "이 초안은 법적 판단을 하지 않는다. 조문 대조는 2차 법령 RAG 에서 확인한다.", 8, False, "56626B")
    # ⑥ 조치 제안
    _p(doc, "", space_after=2)
    _p(doc, "⑥ 조치 제안", 12.5, True, "14202A")
    a = j["actions"]
    _p(doc, f"현장조사 우선 대상: A등급 {a['field_targets']['value']:,}건 (AI 추론 · 검수 전)", 10, True)
    for s in a["checklist"]:
        _p(doc, "□ " + s, 9.5, space_after=1)
    for s in j["narrative"].get("actions", []):
        _p(doc, s, 9.5, space_after=2)
    _p(doc, a["fixed"], 10.5, True, "9A3412", space_after=6)
    # 인용
    _p(doc, "인용", 10, True, "14202A")
    for c in j["citations"]:
        v = c["value"]
        _p(doc, f"[{c['n']}] {c['label']}: {v['value']:,}{ {'count': '건', '필지': '필지'}.get(v['unit'], ' ' + v['unit'])} — {TAG.get(v['basis'], v['basis'])} · {v['source']}", 8, False, "56626B", space_after=0)
    _p(doc, f"서술: {j['narrative_source']}" + (f" · 버린 LLM 서술 사유 {len(j['narrative_rejected'])}건" if j["narrative_rejected"] else ""),
       8, False, "56626B")
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue(), j["filename"]


def build_draft(emd_cd: str, rule: str | None = None, top: int = 20, narrative=None, fmt: str = "dict",
                realm: str = "lx", tenant: str = ""):
    """F2-E 가 import — fmt 'dict' → 봉투 JSON · 'docx' → bytes. realm/tenant 는 호출자의 RLS."""
    d = collect(emd_cd, rule, top, realm, tenant)
    if fmt == "docx":
        return render_docx(d, narrative)[0]
    return as_json(d, narrative)


if __name__ == "__main__":   # python -m survey.report <법정동 8자리> R1 20 out.docx
    import sys
    emd, rl, n, out = sys.argv[1], (sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] != "-" else None), \
        int(sys.argv[3]) if len(sys.argv) > 3 else 20, sys.argv[4] if len(sys.argv) > 4 else None
    blob, name = render_docx(collect(emd, rl, n))
    p = out or name
    open(p, "wb").write(blob)
    print(p, len(blob), "bytes")
