"""XI맵 융합 대시보드(10-14 11:02 확인 · 원칙 241 · 245) — XI ChatGEO 도구 ximap_dash.

  ximap_dash(request, region?, task?, kind?)
      XI맵에서 '남원시 현황 보여 줘' · '비닐하우스 어디 많아?' · '농지 이용 실태 어때?' · '전국 분석 얼마나 됐어?' · '남원 함양 비교' →
      ① 뜻 확인(지역 · 업무 · 비교) ② 서버 집계(landxi_api.xdash — 업무별 · 읍면동별 · 시군구별 · 지목별 · 의심 종류별 · 해마다 · 면적 구간별 · 날짜별)
      ③ 결과 성격에 맞춘 대시보드 사양(JSON: 큰 숫자 · 차트 종류 · 색 척도 · 표 · 해석 줄)을 ui_action ximap_dash 로 화면에 보낸다(화면이 대시보드로 전환).
      차트 종류 · 색 척도는 아래 규칙(RULES 표 · README 가시화 규칙표와 같은 글)으로 데이터에 따라 고른다 — 같은 질문 유형도 결과가 다르면 다른 모양.
      숫자는 집계 값 그대로(지어낸 숫자 0) · 모델 호출 0(ROUTE 직행) · vLLM 설정 그대로.
지역 · 지명 고정값 0 — 지역은 질문 속 시군구 → 화면 지역(context.region) → 전국.
"""
from __future__ import annotations

import re
import statistics as st

from .. import Out

SPECS = {
    "ximap_dash": {
        "description": "XI맵 융합 대시보드 — 지역 · 업무 · 비교를 확인하고 AI 분석 결과 × 지적(필지 · 지목 · 공시지가) × 지금 도는 분석을 집계해 화면을 대시보드로 바꾼다.",
        "properties": {"request": {"type": "string", "description": "사용자 문장 원문"},
                       "region": {"type": "string", "description": "시군구 코드(쉼표 · 없으면 화면 지역 또는 전국)"},
                       "task": {"type": "string"}, "kind": {"type": "string"}},
    },
}
WRITE: set[str] = set()
CONFIRM: set[str] = set()
CLIENT = {"ximap_dash"}
NO_LLM = {"ximap_dash"}
WHY = {"ximap_dash": "XI맵 융합 대시보드"}
SAY = {"ximap_dash": "통계 보기"}   # 지도 위(기본) · 대시보드 어느 쪽이든 같은 말(원칙 258)
HINT = "XI맵에서 지역 · 업무 통계 · 현황 · 비교 · 분포를 물으면 ximap_dash(대시보드)."


def allowed(name: str, p) -> bool:
    return getattr(p, "realm", None) == "lx"


# ── 말 → 뜻 ────────────────────────────────────────────────────────────────────
TASK_WORDS = [(r"비닐\s*하우스|온실|하우스", "비닐하우스"), (r"건물|건축물", "건물"), (r"경작지|농경지|논밭|경작", "경작지"), (r"주차장", "주차장"),
              (r"곤포|사일리지", "곤포사일리지"), (r"토지\s*피복", "토지피복"), (r"국토\s*변화", "국토 변화"), (r"해양\s*쓰레기", "해양쓰레기")]
SURVEY_RX = re.compile(r"실태|의심|휴경|전용|무허가|불법|농지\s*이용")
JIMOK_RX = re.compile(r"지목|공시\s*지가|지가|필지|지적")
TIME_RX = re.compile(r"진행|흐름|시간\s*별|날마다|날짜\s*별|오늘|최근|추이|얼마나\s*(?:됐|되었|했|진행)|지금\s*도는|지금\s*분석")
AREA_RX = re.compile(r"면적\s*(?:별|구간)|크기\s*별|넓이\s*별|큰\s*(?:것|거)|작은\s*(?:것|거)|면적\s*분포")
YEAR_RX = re.compile(r"해마다|연도\s*별|년도\s*별|연도")
CMP_RX = re.compile(r"비교|견줘|차이|대비|어디가\s*더|순위|랭킹")
DASH_RX = re.compile(r"대시\s*보드|통계|현황|실태|분포|어디(?:가|에|서)?\s*(?:제일|가장)?\s*많|많은\s*곳|비교|추이|흐름|면적\s*별|지목\s*별|읍면동\s*별|시군구\s*별|"
                     r"순위|어때|어떤가|어떻게\s*돼|얼마나\s*(?:됐|되었|진행|있)|한눈에|정리해|집계|해마다|연도\s*별|진행\s*상황|요약해\s*줘\s*대시")
NOT_RX = re.compile(r"보고서|초안|법령|조문|근거|만\s*(?:보여|남겨|펼쳐|켜)|원래대로|조건\s*(?:풀|없애)|분석\s*(?:실행|돌려)|내려\s*받|으로\s*(?:가|이동)|이동해")


def parse(t: str, ctx_region: str | None = None) -> dict | None:
    t = re.sub(r"\s+", " ", t or "").strip()
    if not t or len(t) > 120 or NOT_RX.search(t) or not DASH_RX.search(t):
        return None
    try:
        from ..summary_lookup import match_regions
        hits = match_regions(t)
    except Exception:  # noqa: BLE001
        hits = []
    exact = [h for h in hits if h.get("name") and h["name"] in t]
    if len(hits) > 1 and len(exact) >= 1 and len(exact) < len(hits):
        hits = exact
    if len(hits) > 1 and len({h.get("parent_cd") for h in hits}) == 1 and hits[0].get("parent_cd") and not CMP_RX.search(t):
        hits = [{"sgg_cd": hits[0]["parent_cd"]}]          # 구가 있는 시 이름만 — 시 전체(구 칸 합)
    regs = list(dict.fromkeys(h["sgg_cd"] for h in hits))
    nation = bool(re.search(r"전국|우리\s*나라|대한민국", t))
    tasks = [k for rx, k in TASK_WORDS if re.search(rx, t)]
    task = tasks[0] if len(set(tasks)) == 1 else None
    if SURVEY_RX.search(t):
        kind = "survey"
    elif len(regs) >= 2 or (CMP_RX.search(t) and (nation or not regs)):
        kind = "compare"
    elif TIME_RX.search(t):
        kind = "time"
    elif AREA_RX.search(t):
        kind = "area"
    elif JIMOK_RX.search(t):
        kind = "jimok"
    elif YEAR_RX.search(t):
        kind = "year"
    else:
        kind = "task" if task else "overview"
    if not regs and not nation and ctx_region and kind not in ("compare",):
        regs = [ctx_region]
    if nation:
        regs = [] if kind != "compare" or len(regs) < 2 else regs
    try:                                                 # 지도 경계의 옛 코드(별칭) → 지금 코드(집계 장부와 같은 코드)
        from landxi_api.regions import region_of
        regs = [((region_of(r) or {}).get("sgg_cd") or r) for r in regs]
    except Exception:  # noqa: BLE001
        pass
    return {"request": t, "region": ",".join(regs), "task": task or "", "kind": kind}


# ── 색 척도 고르기(값의 뜻 · 퍼짐에 따라 — README '가시화 규칙표') ─────────────────────────
RULE_NAME = {"R1": "농지 위 건물", "R3": "비농지 위 비닐하우스"}      # 규칙 이름 중 화면 금칙어 · 긴 괄호 이름은 규칙 조건 그대로 짧게(지목 전·답·과수원 안 AI 건물 · 비농지 안 AI 비닐하우스)
HUE = {"count": "teal", "density": "orange", "ratio": "violet", "suspect": "red", "area": "blue", "money": "blue", "time": "teal"}


def scale_for(vals: list[float], meaning: str) -> dict:
    """meaning: count(수) · density(㎢당) · ratio(%) · suspect(의심) · area(넓이) · money(공시지가) · dev(평균 대비 %).
    퍼짐이 크면(최댓값 ÷ 중앙값 ≥ 6) 단계 색(5단 분위) · 아니면 연속 색. dev 는 발산 색(파랑 ↔ 빨강 · 가운데 회색)."""
    v = sorted(x for x in vals if x is not None)
    if meaning == "dev":
        m = max((abs(x) for x in v), default=1) or 1
        return {"kind": "div", "lo": "blue", "hi": "red", "mid": 0, "max": round(m, 1), "label": "평균보다 적음 · 많음"}
    hue = HUE.get(meaning, "teal")
    if not v:
        return {"kind": "seq", "hue": hue, "min": 0, "max": 1}
    if meaning == "density" and len(v) >= 5:
        # ㎢당(10-15 '밀도 색 기준 조정'): 늘 5단 분위 — 극단값(Q3 + 3·IQR 위)은 분위 계산에서 빼고 맨 위 단계 색 + 지도 꼬리표(값 큰 순)로.
        # 시내 동 하나가 최댓값이어도 나머지 읍면이 옅어지지 않는다.
        q1, q3 = v[int(len(v) * 0.25)], v[min(len(v) - 1, int(len(v) * 0.75))]
        fence = q3 + 3 * (q3 - q1)
        body = [x for x in v if x <= fence] or v
        tail = [x for x in v if x > fence]
        qs = [body[min(len(body) - 1, int(len(body) * q))] for q in (0.2, 0.4, 0.6, 0.8)]
        br = sorted(set(round(x, 2) for x in qs))
        out = {"kind": "step", "hue": hue, "breaks": br, "min": v[0], "max": v[-1]}
        if tail:
            out["tail"] = tail[0]                      # 이 값 이상 = 극단값(꼬리표로 숫자)
        return out
    med = st.median(v) if v else 0
    skew = (v[-1] / med) if med > 0 else (99 if v[-1] > 0 else 1)
    if len(v) >= 6 and skew >= 6:
        qs = [v[min(len(v) - 1, int(len(v) * q))] for q in (0.2, 0.4, 0.6, 0.8)]
        br = sorted(set(round(x, 2) for x in qs))
        return {"kind": "step", "hue": hue, "breaks": br, "min": v[0], "max": v[-1]}
    return {"kind": "seq", "hue": hue, "min": v[0], "max": v[-1]}


def cv(vals: list[float]) -> float:
    v = [x for x in vals if x is not None]
    if len(v) < 3:
        return 1.0
    m = st.mean(v)
    return (st.pstdev(v) / m) if m else 1.0


def _j(w, a, b) -> str:
    """받침에 맞춘 조사 — 이/가 · 은/는 · 을/를 · 으로/로(숫자 · 단위 · ㎡ 포함)."""
    w = str(w or "").rstrip()
    c = w[-1:] if w else ""
    if not c:
        return b
    if "가" <= c <= "힣":
        jong = (ord(c) - 0xAC00) % 28
        if a == "으로":
            return b if jong in (0, 8) else a
        return a if jong else b
    if c.isdigit():
        return a if c in "013678" else b
    return b                                           # ㎡ · ㎢ · 영문 = 받침 없음(제곱미터)


def J(w, a, b) -> str:
    return f"{w}{_j(w, a, b)}"


def _nf(v, d=0):
    if v is None:
        return "—"
    return f"{v:,.{d}f}"


# ── 대시보드 짓기 ────────────────────────────────────────────────────────────────
class _Off:
    """끈 클래스(XI맵 '층' 판 체크박스 · 10-15 원칙 265)를 뺀 집계 — 같은 함수 · 같은 장부, 줄만 거른다(숫자 한 출처)."""

    def __init__(self, XD, off):
        self.XD, self.off = XD, tuple(off)

    async def agg_task(self, sgg=None):
        return self.XD.without(await self.XD.agg_task(sgg), self.off)

    async def agg_emd(self, sgg):
        return self.XD.without(await self.XD.agg_emd(sgg), self.off)

    async def agg_region(self):
        return self.XD.without(await self.XD.agg_region(), self.off)

    async def agg_year(self, sgg):
        return self.XD.without(await self.XD.agg_year(sgg), self.off)

    async def agg_time(self, sgg=None):
        return await self.XD.agg_time(sgg, self.off)

    def __getattr__(self, k):                     # 지목별 · 의심 종류별 · 면적 구간별(업무를 고른 질문)은 그대로
        return getattr(self.XD, k)


def off_classes(ctx) -> list[str]:
    """화면이 보낸 끈 클래스(context.cls_off) — 짧은 이름 문자열만 · 20개까지."""
    c = getattr(ctx, "context", None) or {}
    v = c.get("cls_off") or []
    return [str(x)[:24] for x in v if isinstance(x, str) and x.strip()][:20] if isinstance(v, list) else []


async def build(args: dict, off: list[str] | None = None) -> dict:
    from landxi_api import xdash as XD
    if off:
        XD = _Off(XD, off)
    kind = args.get("kind") or "overview"
    regs = [r for r in str(args.get("region") or "").split(",") if r]
    task = args.get("task") or None
    if kind == "compare" and len(regs) >= 2:
        return await _compare(XD, regs, task)
    if kind == "compare" or not regs:
        if kind == "time":
            return await _time(XD, None)
        return await _national(XD, task, kind)
    sgg = regs[0]
    if kind == "survey":
        return await _survey(XD, sgg)
    if kind == "jimok":
        return await _jimok(XD, sgg, task)
    if kind == "time":
        return await _time(XD, sgg)
    if kind == "area":
        return await _area(XD, sgg, task)
    if kind == "year":
        return await _year(XD, sgg)
    if task:
        return await _task(XD, sgg, task)
    return await _overview(XD, sgg)


def _live(t: dict | None) -> str | None:
    return (t or {}).get("running")


def _emd_series(e: dict, names: list[str]) -> list[dict]:
    out = []
    for r in e["rows"]:
        n = sum(r["vals"].get(c, 0) for c in names)
        out.append({"k": r["cd"], "label": r["name"], "v": n, "km2": r.get("km2"), "farm_km2": r.get("farm_km2"), "parcels": r.get("parcels"), "suspects": r.get("suspects")})
    return out


def _density(rows: list[dict], area_key: str = "km2") -> list[dict]:
    for r in rows:
        a = r.get(area_key)
        r["d"] = round(r["v"] / a, 1) if a and a > 0.01 else None
    return rows


def _map_panel(level, sgg, rows, key, meaning, title, unit):
    vals = {r["k"]: r.get(key) for r in rows if r.get(key) is not None}
    return {"level": level, "sgg": sgg, "title": title, "unit": unit, "values": vals,
            "labels": {r["k"]: r["label"] for r in rows}, "scale": scale_for(list(vals.values()), meaning), "meaning": meaning}


def _bar_or_donut(title, rows, unit, pick=None, meaning="count"):
    """규칙 B1 — 항목 ≤ 6 이고 모두 0 보다 크면 도넛(구성) · 그 밖은 막대(많은 순 · 16개까지)."""
    rows = [r for r in rows if r.get("v")]
    if 2 <= len(rows) <= 6:
        return {"type": "donut", "title": title, "unit": unit, "rows": rows}
    rows = sorted(rows, key=lambda r: -r["v"])[:16]
    return {"type": "bar", "title": title, "unit": unit, "rows": rows, "pick": pick, "scale": scale_for([r["v"] for r in rows], meaning)}


async def _overview(XD, sgg) -> dict:
    t, e, tm = await XD.agg_task(sgg), await XD.agg_emd(sgg), await XD.agg_time(sgg)
    rows = t["rows"]
    name = t["name"]
    tot = sum(r["n"] for r in rows)
    kp = [{"label": "AI 분석 결과", "value": tot, "unit": "개", "sub": f"업무 {len(rows)}가지"}]
    for r in rows[:3]:
        kp.append({"label": r["name"], "value": r["n"], "unit": r["unit"]})
    cols = [c["name"] for c in e["cols"]]
    emd = [r for r in _density(_emd_series(e, cols)) if r["v"]]
    panels = [_bar_or_donut("업무별", [{"k": r["name"], "label": r["name"], "v": r["n"]} for r in rows], "개")]
    # 규칙 H1 — 읍면동 ≥ 4 · 업무 ≥ 3 이면 히트맵 격자(업무마다 따로 칠함) · 아니면 누적 막대
    used = [c for c in cols if sum(r["vals"].get(c, 0) for r in e["rows"]) > 0]
    top = sorted(e["rows"], key=lambda r: -sum(r["vals"].get(c, 0) for c in used))[:14]
    if len(top) >= 4 and len(used) >= 3:
        panels.append({"type": "heat", "title": "읍면동 × 업무", "cols": used, "rows": [{"k": r["cd"], "label": r["name"], "vals": [r["vals"].get(c, 0) for c in used]} for r in top],
                       "norm": "col", "scale": {"kind": "seq", "hue": "teal"}, "pick": "emd"})
    elif top:
        panels.append({"type": "stack", "title": "읍면동별 업무", "series": used, "rows": [{"k": r["cd"], "label": r["name"], "vals": [r["vals"].get(c, 0) for c in used]} for r in top], "pick": "emd"})
    dens = [r["d"] for r in emd if r["d"] is not None]
    # 규칙 M1 — 지도: 읍면동 ㎢당 결과(밀도 · 주황). 퍼짐이 작으면(변동계수 < 0.35) 평균 대비 %(발산)
    if dens and cv(dens) < 0.35:
        avg = st.mean(dens)
        for r in emd:
            r["dev"] = round((r["d"] - avg) / avg * 100, 1) if r["d"] is not None and avg else None
        mp = _map_panel("emd", sgg, emd, "dev", "dev", "평균 대비 ㎢당 AI 분석 결과", "%")
    else:
        mp = _map_panel("emd", sgg, emd, "d", "density", "㎢당 AI 분석 결과", "개/㎢")
    panels.append({"type": "rank", "title": "읍면동 순위", "unit": "개", "rows": sorted(emd, key=lambda r: -r["v"])[:10], "pick": "emd", "extra": {"key": "d", "label": "㎢당"}})
    if len(tm["points"]) >= 3:
        panels.append(_line(tm, "전국 분석 · 찾은 결과(누적)"))
    say = []
    if rows:
        say.append(f"{name}에서 가장 많은 결과는 {rows[0]['name']} {_nf(rows[0]['n'])}{rows[0]['unit']}입니다.")
    if emd:
        b = max(emd, key=lambda r: r["v"])
        say.append(f"읍면동 중 {J(b['label'], '이', '가')} {_nf(b['v'])}개로 가장 많습니다.")
    if dens:
        b = max((r for r in emd if r["d"] is not None), key=lambda r: r["d"])
        say.append(f"㎢당으로는 {b['label']} {_nf(b['d'], 1)}개가 가장 촘촘합니다.")
    return {"kind": "overview", "rule": ["B1", "H1" if panels[1]["type"] == "heat" else "S1", "M1" if mp["scale"]["kind"] != "div" else "M2", "R1"],
            "title": f"{name} · AI 분석 결과", "means": [["지역", name], ["업무", "모든 업무"], ["비교", "업무 · 읍면동"]],
            "fuse": ["AI 분석 결과", "지금 도는 분석"], "live": _live(tm), "kpis": kp, "panels": panels, "map": mp, "say": say, "sgg": sgg,
            "main": {"label": "AI 분석 결과", "value": tot, "unit": "개"}}


def _line(tm, title):
    pts = [{"t": p["t"], "v": p["n_sum"]} for p in tm["points"]]
    return {"type": "line", "title": title, "unit": "개", "points": pts, "grain": tm["unit"]}


async def _task(XD, sgg, task) -> dict:
    t, e = await XD.agg_task(sgg), await XD.agg_emd(sgg)
    name = t["name"]
    trows = [r for r in t["rows"] if r["k"] == task]
    if not trows:
        return await _overview(XD, sgg) | {"note": f"{name}에는 {task} 결과가 아직 없습니다."}
    cols = [r["name"] for r in trows]
    unit = trows[0]["unit"]
    tot = sum(r["n"] for r in trows)
    emd = [r for r in _density(_emd_series(e, cols), "farm_km2" if any(c.endswith("(농지 전수)") for c in cols) else "km2") if r["v"]]
    kp = [{"label": f"{task}", "value": tot, "unit": unit, "sub": " · ".join(f"{r['name']} {_nf(r['n'])}" for r in trows) if len(trows) > 1 else None},
          {"label": "결과가 있는 읍면동", "value": len(emd), "unit": "곳"}]
    dens = [r["d"] for r in emd if r["d"] is not None]
    if dens:
        kp.append({"label": "㎢당 가장 촘촘한 곳", "value": max(dens), "unit": f"{unit}/㎢", "sub": max(emd, key=lambda r: r["d"] or 0)["label"], "d": 1})
    panels = [_bar_or_donut(f"읍면동별 {task}", emd, unit, pick="emd")]
    # 규칙 P1 — 점 ≥ 6 이면 산점(넓이 × 수)
    sc = [r for r in emd if (r.get("farm_km2") or r.get("km2"))]
    if len(sc) >= 6:
        akey = "farm_km2" if all(r.get("farm_km2") for r in sc) else "km2"
        panels.append({"type": "scatter", "title": "넓이 × 수", "x": {"label": "농지 범위" if akey == "farm_km2" else "읍면동 넓이", "unit": "㎢"}, "y": {"label": task, "unit": unit},
                       "pts": [{"k": r["k"], "label": r["label"], "x": r[akey], "y": r["v"]} for r in sc], "pick": "emd"})
    ar = await XD.agg_area(sgg, task)
    if ar["n"] >= 20:                                   # 규칙 A1 — 객체 넓이가 있으면 면적 구간 막대
        panels.append({"type": "hist", "title": f"{task} 면적 구간별", "unit": unit, "bins": [{"label": b["label"], "v": b["n"]} for b in ar["bins"]]})
    if len(trows) > 1:
        panels.append({"type": "donut", "title": "결과 출처별", "unit": unit, "rows": [{"k": r["name"], "label": r["name"], "v": r["n"]} for r in trows]})
    panels.append({"type": "rank", "title": "읍면동 순위", "unit": unit, "rows": sorted(emd, key=lambda r: -r["v"])[:10], "pick": "emd", "extra": {"key": "d", "label": "㎢당"}})
    mp = _map_panel("emd", sgg, emd, "d" if dens else "v", "density" if dens else "count", f"㎢당 {task}" if dens else f"{task} 수", f"{unit}/㎢" if dens else unit)
    say = []
    if emd:
        s = sorted(emd, key=lambda r: -r["v"])
        say.append(f"{J(task, '은', '는')} {s[0]['label']} {_nf(s[0]['v'])}{unit}" + (f" · {s[1]['label']} {_nf(s[1]['v'])}" if len(s) > 1 else "") + (f" · {s[2]['label']} {_nf(s[2]['v'])}" if len(s) > 2 else "") + " 순으로 많습니다.")
        top3 = sum(r["v"] for r in s[:3])
        tsum = sum(r["v"] for r in s)
        if tsum:
            say.append(f"위 세 곳이 {name} {task}의 {_nf(top3 / tsum * 100)}%를 차지합니다.")
    if ar["n"] >= 20:
        b = max(ar["bins"], key=lambda b: b["n"])
        say.append(f"면적은 {J(b['label'], '이', '가')} {_nf(b['n'])}{J(unit, '으로', '로')} 가장 많습니다.")
    return {"kind": "task", "rule": [panels[0]["type"] == "donut" and "B1d" or "B1b", "P1" if any(p["type"] == "scatter" for p in panels) else "-", "A1" if ar["n"] >= 20 else "-",
                                     "M3" + mp["scale"]["kind"]],
            "title": f"{name} · {task}", "means": [["지역", name], ["업무", task], ["비교", "읍면동 · 면적"]], "fuse": ["AI 분석 결과", "읍면동 넓이"],
            "kpis": kp, "panels": panels, "map": mp, "say": say, "sgg": sgg, "main": {"label": task, "value": tot, "unit": unit}}


async def _survey(XD, sgg) -> dict:
    ru, jm, t, e = await XD.agg_rule(sgg), await XD.agg_jimok(sgg), await XD.agg_task(sgg), await XD.agg_emd(sgg)
    name = ru["name"]
    if not ru["total"]:
        return await _overview(XD, sgg) | {"note": f"{name}에는 실태조사 의심 필지가 아직 없습니다."}
    farm = next((r for r in t["rows"] if r["k"] == "경작지"), None)
    r2 = next((c for c in ru["cols"] if c["k"] == "R2"), None)
    ru = {**ru, "cols": [{**c, "name": RULE_NAME.get(c["k"], c["name"])} for c in ru["cols"]]}   # 집계 보관본은 그대로(복사해서 이름만)
    parcels = sum(r["parcels"] for r in jm["rows"])
    kp = [{"label": r2["name"] if r2 and r2["n"] else "의심 필지", "value": r2["n"] if r2 and r2["n"] else ru["total"], "unit": "필지"},
          {"label": "의심 필지", "value": ru["total"], "unit": "필지", "sub": f"전체 필지의 {_nf(ru['total'] / parcels * 100, 1)}%" if parcels else None}]
    if farm:
        kp.append({"label": "AI " + farm["name"], "value": farm["n"], "unit": farm["unit"]})
    kp.append({"label": "연속지적 필지", "value": parcels, "unit": "필지"})
    cols = [c for c in ru["cols"] if c["n"]]
    top = sorted(ru["rows"], key=lambda r: -sum(r["vals"].values()))[:14]
    panels = [{"type": "stack", "title": "읍면동별 의심 종류", "series": [c["name"] for c in cols],
               "rows": [{"k": r["cd"], "label": r["name"], "vals": [r["vals"].get(c["k"], 0) for c in cols]} for r in top], "pick": "emd", "unit": "필지"}]
    jr = [r for r in jm["rows"] if r["suspects"]]
    panels.append(_bar_or_donut("지목별 의심 필지", [{"k": r["k"], "label": r["name"], "v": r["suspects"]} for r in jr], "필지", meaning="suspect"))
    panels.append({"type": "bar", "title": "의심 종류별", "unit": "필지", "orient": "h", "rows": [{"k": c["k"], "label": c["name"], "v": c["n"]} for c in sorted(cols, key=lambda c: -c["n"])],
                   "scale": scale_for([c["n"] for c in cols], "suspect")})
    jt = [r for r in jm["rows"] if r["parcels"]][:8]
    panels.append({"type": "table", "title": "지목 × 의심 · 공시지가", "cols": ["지목", "필지", "의심 필지", "의심 비율", "공시지가 중앙값(원/㎡)"],
                   "rows": [[r["name"], r["parcels"], r["suspects"], round(r["suspects"] / r["parcels"] * 100, 1) if r["parcels"] else None, r["jiga_med"]] for r in jt],
                   "num": [1, 2, 3, 4], "dl": f"{name}-지목별.csv"})
    # 규칙 M4 — 지도: 읍면동 의심 비율(의심 필지 ÷ 필지 · 보라)
    em = []
    for r in e["rows"]:
        if r.get("parcels") and r.get("suspects") is not None:
            em.append({"k": r["cd"], "label": r["name"], "v": r["suspects"], "ratio": round(r["suspects"] / r["parcels"] * 100, 2)})
    mp = _map_panel("emd", sgg, em, "ratio", "ratio", "필지 중 의심 비율", "%")
    say = []
    if top:
        s0 = top[0]
        say.append(f"의심 필지는 {s0['name']} {_nf(sum(s0['vals'].values()))}필지가 가장 많습니다.")
    if jr:
        js = sorted(jr, key=lambda r: -r["suspects"])
        tot = sum(r["suspects"] for r in jr)
        say.append(f"지목은 {js[0]['name']} {_nf(js[0]['suspects'] / tot * 100)}%" + (f", {js[1]['name']} {_nf(js[1]['suspects'] / tot * 100)}%" if len(js) > 1 else "") + "입니다.")
    if em:
        b = max(em, key=lambda r: r["ratio"])
        say.append(f"필지 중 의심 비율은 {b['label']} {_nf(b['ratio'], 1)}%가 가장 높습니다.")
    return {"kind": "survey", "rule": ["S2", "B1", "T1", "M4"], "title": f"{name} · 농지 이용", "means": [["지역", name], ["업무", "실태조사 의심"], ["비교", "읍면동 · 지목"]],
            "fuse": ["AI 분석 결과", "연속지적 · 지목", "공시지가"], "kpis": kp, "panels": panels, "map": mp, "say": say, "sgg": sgg,
            "main": {"label": kp[0]["label"], "value": kp[0]["value"], "unit": "필지"}}


async def _jimok(XD, sgg, task) -> dict:
    jm, e = await XD.agg_jimok(sgg), await XD.agg_emd(sgg)
    name = jm["name"]
    rows = jm["rows"]
    if not rows:
        return await _overview(XD, sgg) | {"note": f"{name}에는 연속지적 필지가 아직 없습니다."}
    parcels = sum(r["parcels"] for r in rows)
    clsset = sorted({c for r in rows for c in r["ai"]}, key=lambda c: -sum(r["ai"].get(c, 0) for r in rows))
    want = [task] if task and task in clsset else clsset
    kp = [{"label": "연속지적 필지", "value": parcels, "unit": "필지"}, {"label": "지목", "value": len(rows), "unit": "가지"}]
    if want:
        n_ai = sum(r["ai"].get(want[0], 0) for r in rows) if len(want) == 1 else sum(r.get("ai_any", 0) for r in rows)
        kp.append({"label": f"AI {J(want[0], '이', '가')} 걸린 필지" if len(want) == 1 else "AI 분석 결과가 걸린 필지", "value": n_ai, "unit": "필지"})
    jg = [r for r in rows if r["jiga_med"]]
    top = rows[:8]
    panels = [_bar_or_donut("지목별 필지", [{"k": r["k"], "label": r["name"], "v": r["parcels"]} for r in top], "필지")]
    if clsset:
        panels.append({"type": "stack", "title": "지목별 AI 분석 결과가 걸린 필지", "series": want, "unit": "필지",
                       "rows": [{"k": r["k"], "label": r["name"], "vals": [r["ai"].get(c, 0) for c in want]} for r in top]})
    if jg:
        panels.append({"type": "bar", "title": "지목별 공시지가 중앙값", "unit": "원/㎡", "orient": "h",
                       "rows": [{"k": r["k"], "label": r["name"], "v": r["jiga_med"]} for r in sorted(jg, key=lambda r: -r["jiga_med"])[:8]],
                       "scale": scale_for([r["jiga_med"] for r in jg], "money")})
    em = [{"k": r["cd"], "label": r["name"], "v": r["parcels"], "km2": r.get("km2")} for r in e["rows"] if r.get("parcels")]
    em = _density(em)
    mp = _map_panel("emd", sgg, em, "d", "density", "㎢당 필지", "필지/㎢") if em else None
    say = [f"{name} 연속지적 필지는 {_nf(parcels)}필지이고 {J(rows[0]['name'], '이', '가')} {_nf(rows[0]['parcels'] / parcels * 100)}%로 가장 많습니다."]
    if jg:
        b = max(jg, key=lambda r: r["jiga_med"])
        say.append(f"공시지가 중앙값은 {J(b['name'], '이', '가')} ㎡당 {_nf(b['jiga_med'])}원으로 가장 높습니다.")
    else:
        say.append("공시지가 자료가 있는 곳만 공시지가를 보여 드립니다.")
    return {"kind": "jimok", "rule": ["B1", "S3", "B2" if jg else "-", "M1"], "title": f"{name} · 지적", "means": [["지역", name], ["업무", "지목 · 공시지가"], ["비교", "지목"]],
            "fuse": ["연속지적 · 지목", "공시지가", "AI 분석 결과"], "kpis": kp, "panels": panels, "map": mp, "say": say, "sgg": sgg,
            "main": {"label": "연속지적 필지", "value": parcels, "unit": "필지"}}


async def _area(XD, sgg, task) -> dict:
    t = await XD.agg_task(sgg)
    task = task or next((r["k"] for r in t["rows"] if r["src"] == "service" and r["k"] != "토지피복"), None) or "비닐하우스"
    ar = await XD.agg_area(sgg, task)
    if ar["n"] < 1:
        return await (_task(XD, sgg, task) if sgg else _national(XD, task, "task")) | {"note": f"{task} 넓이 자료가 없습니다."}
    name = ar["name"]
    big = max(ar["bins"], key=lambda b: b["n"])
    kp = [{"label": task, "value": ar["n"], "unit": ar["unit"]}, {"label": "가장 많은 면적 구간", "value": big["n"], "unit": ar["unit"], "sub": big["label"]},
          {"label": "넓이 합", "value": round(sum(b["km2"] for b in ar["bins"]), 3), "unit": "㎢", "d": 3}]
    panels = [{"type": "hist", "title": f"{task} 면적 구간별 수", "unit": ar["unit"], "bins": [{"label": b["label"], "v": b["n"]} for b in ar["bins"]]},
              {"type": "donut", "title": "면적 구간별 넓이 합", "unit": "㎢", "rows": [{"k": b["label"], "label": b["label"], "v": b["km2"]} for b in ar["bins"] if b["km2"]], "d": 3}]
    mp = None
    if sgg:
        e = await XD.agg_emd(sgg)
        cols = [r["name"] for r in t["rows"] if r["k"] == task]
        emd = [r for r in _density(_emd_series(e, cols)) if r["v"]]
        if emd:
            mp = _map_panel("emd", sgg, emd, "v", "count", f"{task} 수", ar["unit"])
            panels.append({"type": "rank", "title": "읍면동 순위", "unit": ar["unit"], "rows": sorted(emd, key=lambda r: -r["v"])[:10], "pick": "emd"})
    small = ar["bins"][0]["n"] + ar["bins"][1]["n"]
    say = [f"{task} {_nf(ar['n'])}{ar['unit']} 중 {J(big['label'], '이', '가')} {_nf(big['n'])}{J(ar['unit'], '으로', '로')} 가장 많습니다.",
           f"100㎡ 미만 작은 것은 {_nf(small)}{ar['unit']}입니다."]
    return {"kind": "area", "rule": ["A1", "B1", "M5"], "title": f"{name} · {task} 면적", "means": [["지역", name], ["업무", task], ["비교", "면적 구간"]],
            "fuse": ["AI 분석 결과"], "kpis": kp, "panels": panels, "map": mp, "say": say, "sgg": sgg, "main": {"label": task, "value": ar["n"], "unit": ar["unit"]}}


async def _year(XD, sgg) -> dict:
    y = await XD.agg_year(sgg)
    name = y["name"]
    yrs = sorted({p["year"] for s in y["series"] for p in s["points"]})
    kp = [{"label": f"{yy}년 영상 결과", "value": sum(p["n"] for s in y["series"] for p in s["points"] if p["year"] == yy), "unit": "개"} for yy in yrs]
    panels = []
    multi = [s for s in y["series"] if len(s["points"]) >= 3]
    if multi:                                           # 규칙 L1 — 세 해 이상이면 선
        for s in multi[:2]:
            panels.append({"type": "line", "title": s["name"], "unit": s["unit"], "points": [{"t": str(p["year"]), "v": p["n"]} for p in s["points"]], "grain": "year"})
    panels.append(_bar_or_donut("영상 연도별 결과", [{"k": str(yy), "label": f"{yy}년", "v": k["value"]} for yy, k in zip(yrs, kp)], "개"))
    panels.append({"type": "stack", "title": "영상 연도별 업무", "series": [str(x) for x in yrs], "unit": "개",
                   "rows": [{"k": s["name"], "label": s["name"], "vals": [next((p["n"] for p in s["points"] if p["year"] == yy), 0) for yy in yrs]} for s in y["series"]]})
    say = [f"{name} 결과는 {', '.join(f'{yy}년 영상' for yy in yrs)}에서 나왔습니다."] + [f"{yy}년 영상 결과 {_nf(k['value'])}개입니다." for yy, k in zip(yrs, kp)]
    return {"kind": "year", "rule": ["L1" if multi else "S4"], "title": f"{name} · 해마다", "means": [["지역", name], ["업무", "모든 업무"], ["비교", "영상 연도"]],
            "fuse": ["AI 분석 결과"], "kpis": kp, "panels": panels, "map": None, "say": say, "sgg": sgg,
            "main": {"label": kp[-1]["label"] if kp else "결과", "value": kp[-1]["value"] if kp else 0, "unit": "개"}}


async def _time(XD, sgg) -> dict:
    tm = await XD.agg_time(sgg)
    name = tm["name"]
    pts = tm["points"]
    if not pts:
        return await (_overview(XD, sgg) if sgg else _national(XD, None, "overview")) | {"note": f"{name}에는 끝난 전국 분석 칸이 아직 없습니다."}
    last = pts[-1]
    spark = [p["n_sum"] for p in pts][-24:]
    kp = [{"label": "전국 분석 · 찾은 결과", "value": last["n_sum"], "unit": "개", "spark": spark},
          {"label": "끝난 읍면동", "value": last["cells_sum"], "unit": "곳", "spark": [p["cells_sum"] for p in pts][-24:]}]
    grain = "시간" if tm["unit"] == "hour" else "날짜"
    panels = [_line(tm, "찾은 결과(누적)"),
              {"type": "bar", "title": f"{grain}마다 끝난 읍면동", "unit": "곳", "rows": [{"k": p["t"], "label": p["t"][11:16] if tm["unit"] == "hour" else p["t"][5:10], "v": p["cells"]} for p in pts][-24:],
               "scale": scale_for([p["cells"] for p in pts], "time")}]
    mp = None
    if not sgg:
        rg = await XD.agg_region()
        nat = [{"k": r["cd"], "label": r["name"], "v": sum(v for c, v in r["vals"].items() if c.endswith(")"))} for r in rg["rows"]]
        nat = [r for r in nat if r["v"]]
        if nat:
            mp = _map_panel("sgg", None, nat, "v", "count", "시군구별 전국 분석 결과", "개")
            panels.append({"type": "rank", "title": "시군구 순위", "unit": "개", "rows": sorted(nat, key=lambda r: -r["v"])[:10], "pick": "sgg"})
    elif sgg:
        e = await XD.agg_emd(sgg)
        cols = [c["name"] for c in e["cols"] if c["name"].endswith(")")]
        emd = [r for r in _emd_series(e, cols) if r["v"]]
        if emd:
            mp = _map_panel("emd", sgg, emd, "v", "count", "전국 분석 결과", "개")
    best = max(pts, key=lambda p: p["n"])
    say = [f"지금까지 읍면동 {_nf(last['cells_sum'])}곳을 끝내 {_nf(last['n_sum'])}개를 찾았습니다.",
           f"가장 많이 찾은 {J(grain, '은', '는')} {best['t'][5:16].replace('T', ' ')} · {_nf(best['n'])}개입니다."]
    if tm.get("running"):
        say.append(f"지금 {J(tm['running'], '을', '를')} 분석하고 있습니다.")
    return {"kind": "time", "rule": ["L1", "K1", "B1", "M6"], "title": f"{name} · 전국 분석 흐름", "means": [["지역", name], ["업무", "전국 분석"], ["비교", grain]],
            "fuse": ["지금 도는 분석", "AI 분석 결과"], "live": tm.get("running"), "kpis": kp, "panels": panels, "map": mp, "say": say, "sgg": sgg,
            "main": {"label": "찾은 결과", "value": last["n_sum"], "unit": "개"}}


async def _national(XD, task, kind) -> dict:
    t, rg, tm = await XD.agg_task(None), await XD.agg_region(), await XD.agg_time(None)
    cols = [c["name"] for c in rg["cols"] if (not task or c["k"] == task)]
    rows = []
    for r in rg["rows"]:
        v = sum(r["vals"].get(c, 0) for c in cols)
        if v:
            rows.append({"k": r["cd"], "label": r["name"], "sido": r.get("sido"), "v": v, "km2": r.get("km2"), "vals": r["vals"]})
    rows = _density(rows)
    trows = [r for r in t["rows"] if not task or r["k"] == task]
    tot = sum(r["n"] for r in trows)
    unit = trows[0]["unit"] if task and trows else "개"
    kp = [{"label": f"전국 · {task}" if task else "전국 · AI 분석 결과", "value": tot, "unit": unit, "spark": [p["n_sum"] for p in tm["points"]][-24:] if not task else None},
          {"label": "결과가 있는 시군구", "value": len(rows), "unit": "곳"}]
    if tm["points"]:
        kp.append({"label": "전국 분석 끝난 읍면동", "value": tm["points"][-1]["cells_sum"], "unit": "곳"})
    panels = []
    if not task:
        panels.append(_bar_or_donut("업무별", [{"k": r["name"], "label": r["name"], "v": r["n"]} for r in trows], "개"))
    top = sorted(rows, key=lambda r: -r["v"])[:15]
    if kind == "compare" or not task:
        used = [c for c in cols if sum(r["vals"].get(c, 0) for r in top) > 0]
        panels.append({"type": "stack", "title": "시군구별 업무", "series": used, "unit": unit, "rows": [{"k": r["k"], "label": r["label"], "vals": [r["vals"].get(c, 0) for c in used]} for r in top], "pick": "sgg"})
        # 규칙 H2 — 시도 × 업무 히트맵(시도 ≥ 3)
        sidos: dict = {}
        for r in rows:
            s = sidos.setdefault(r["sido"] or "—", {c: 0 for c in used})
            for c in used:
                s[c] += r["vals"].get(c, 0)
        if len(sidos) >= 3 and len(used) >= 3:
            panels.append({"type": "heat", "title": "시도 × 업무", "cols": used, "rows": [{"k": k, "label": k, "vals": [v[c] for c in used]} for k, v in sorted(sidos.items(), key=lambda x: -sum(x[1].values()))],
                           "norm": "col", "scale": {"kind": "seq", "hue": "violet"}})
    else:
        panels.append(_bar_or_donut(f"시군구별 {task}", top, unit, pick="sgg"))
    if len(tm["points"]) >= 3:
        panels.append(_line(tm, "전국 분석 · 찾은 결과(누적)"))
    panels.append({"type": "rank", "title": "시군구 순위", "unit": unit, "rows": top[:10], "pick": "sgg", "extra": {"key": "d", "label": "㎢당"}})
    dens = [r["d"] for r in rows if r.get("d") is not None]
    if kind == "compare" and dens:                      # 규칙 M2 — 비교 = 평균 대비(발산)
        avg = st.mean(dens)
        for r in rows:
            r["dev"] = round((r["d"] - avg) / avg * 100, 1) if r.get("d") is not None and avg else None
        mp = _map_panel("sgg", None, rows, "dev", "dev", "평균 대비 ㎢당 결과", "%")
    else:
        mp = _map_panel("sgg", None, rows, "v", "count", f"시군구별 {task or 'AI 분석 결과'}", unit)
    say = []
    if top:
        say.append(f"{J(task or 'AI 분석 결과', '은', '는')} {top[0]['label']} {_nf(top[0]['v'])}{J(unit, '이', '가')} 가장 많습니다.")
    if trows and not task:
        say.append(f"업무는 {J(trows[0]['name'], '이', '가')} {_nf(trows[0]['n'] / tot * 100 if tot else 0)}%입니다.")
    if tm.get("running"):
        say.append(f"지금 {J(tm['running'], '을', '를')} 분석하고 있습니다.")
    return {"kind": "national" if kind != "compare" else "compare", "rule": ["K1", "B1", "S5", "H2", "L1", "M" + ("2" if kind == "compare" else "7")],
            "title": f"전국 · {task or 'AI 분석 결과'}", "means": [["지역", "전국"], ["업무", task or "모든 업무"], ["비교", "시군구 · 시도"]],
            "fuse": ["AI 분석 결과", "지금 도는 분석"], "live": tm.get("running"), "kpis": kp, "panels": panels, "map": mp, "say": say, "sgg": None,
            "main": {"label": kp[0]["label"], "value": tot, "unit": unit}}


async def _compare(XD, regs, task) -> dict:
    ts = [await XD.agg_task(s) for s in regs[:6]]
    names = [t["name"] for t in ts]
    tasks = []
    for t in ts:
        for r in t["rows"]:
            if (not task or r["k"] == task) and r["name"] not in tasks:
                tasks.append(r["name"])
    rows = [{"k": s, "label": t["name"], "vals": [next((r["n"] for r in t["rows"] if r["name"] == c), 0) for c in tasks]} for s, t in zip(regs, ts)]
    kp = [{"label": t["name"], "value": sum(r["n"] for r in t["rows"] if not task or r["k"] == task), "unit": "개"} for t in ts]
    panels = [{"type": "stack", "title": "지역별 업무", "series": tasks, "unit": "개", "rows": rows, "pick": "sgg"},
              {"type": "heat", "title": "지역 × 업무", "cols": tasks, "rows": rows, "norm": "col", "scale": {"kind": "seq", "hue": "orange"}}]
    for t in ts:
        panels.append({"type": "donut", "title": f"{t['name']} 업무 구성", "unit": "개", "rows": [{"k": r["name"], "label": r["name"], "v": r["n"]} for r in t["rows"] if not task or r["k"] == task]})
    rg = await XD.agg_region()
    sel = [r for r in rg["rows"] if r["cd"] in regs]
    mrows = _density([{"k": r["cd"], "label": r["name"], "v": sum(v for c, v in r["vals"].items() if c in tasks), "km2": r.get("km2")} for r in sel])
    dens = [r["d"] for r in mrows if r.get("d") is not None]
    mp = None
    if dens:
        avg = st.mean(dens)
        for r in mrows:
            r["dev"] = round((r["d"] - avg) / avg * 100, 1) if r.get("d") is not None and avg else None
        mp = _map_panel("sgg", None, mrows, "dev", "dev", "평균 대비 ㎢당 결과", "%")
    b = max(kp, key=lambda k: k["value"]) if kp else None
    say = [f"{', '.join(names)} 가운데 {J(b['label'], '이', '가')} {_nf(b['value'])}개로 가장 많습니다."] if b else []
    for c in tasks[:2]:
        vs = [(rw["label"], rw["vals"][tasks.index(c)]) for rw in rows]
        vs.sort(key=lambda x: -x[1])
        say.append(f"{c}: " + " · ".join(f"{n} {_nf(v)}" for n, v in vs) + ".")
    return {"kind": "compare", "rule": ["S5", "H3", "B1d", "M2"], "title": f"{' · '.join(names)} 비교", "means": [["지역", " · ".join(names)], ["업무", task or "모든 업무"], ["비교", "지역"]],
            "fuse": ["AI 분석 결과", "지금 도는 분석"], "kpis": kp, "panels": panels, "map": mp, "say": say, "sgg": None, "regions": regs,
            "main": {"label": kp[0]["label"] if kp else "", "value": kp[0]["value"] if kp else 0, "unit": "개"}}


async def ximap_dash(args: dict, ctx) -> Out:
    from landxi_api.envelope import env
    out = Out(source="XI맵 융합 집계(서비스 결과 장부 · 전국 분석 진행 장부 · 연속지적 · 실태조사)")
    ctx.state["talk_kind"] = None
    if not args.get("kind"):
        c = getattr(ctx, "context", None) or {}
        args = parse(args.get("request") or "", c.get("region")) or {**args, "kind": "overview"}
    off = off_classes(ctx)
    spec = await build(args, off)
    if off:
        spec["off"] = off                         # 끈 클래스를 뺀 숫자(화면 왼쪽 위 '보이는 것 기준'과 같은 기준)
    m = spec.get("main") or {}
    out.ui_actions.append({"op": "ximap_dash", "spec": spec})
    # 답 끝 다음 단계(10-15 원칙 262 — 먼저 지도에만 가시화 · 통계는 원할 때 한 단계 더): 화면이 눌림을 받아 2 · 3단계로(새 질문 아님)
    ctx.state["next"] = [{"label": "통계 보기", "q": "통계 보기"}, {"label": "크게 보기", "q": "크게 보기"}]
    out.env("n", m.get("label") or "결과", env(m.get("value") or 0, m.get("unit") or "개", "inferred", "XI맵 융합 집계 — 화면 대시보드 큰 숫자와 같은 값"))
    out.data = {"status": "ok", "제목": spec["title"], "수": "n"}
    lead = spec.get("note") or ""
    # 답은 짧게(10-15 원칙 258 — 지도 위에서 보여 주므로 '대시보드로' 말 없음) · 첫 해석 줄 하나만 덧붙임
    first = (spec.get("say") or [""])[0]
    out.answer = (f"{lead} " if lead else "") + f"{spec['title']} — {m.get('label') or ''} {{{{n}}}}." + (f" {first}" if first else "")
    return out


HANDLERS = {"ximap_dash": ximap_dash}


def ROUTE(msg: str, ctx):
    p = getattr(ctx, "principal", None)
    c = getattr(ctx, "context", None) or {}
    if c.get("page") != "xi-clean" or getattr(p, "realm", None) != "lx" or getattr(ctx, "lang", "ko") == "en":
        return None
    a = parse(msg, c.get("region"))
    if not a:
        return None
    return {"tool": "ximap_dash", "args": a, "intent": "map"}
