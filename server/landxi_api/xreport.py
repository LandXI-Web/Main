"""XI맵 융합 대시보드 '보고서로' — 화면에 낸 대시보드를 한글 문서(HWPX)로(10-14 사용자 · 원칙 247).

POST /api/v1/ximap/report.hwpx   LX 계정 · body = {"spec": 대시보드 사양}
POST /api/v1/report/screen.hwpx  로그인한 누구나 · body = {"doc": 화면에 보인 보고서(제목 · 문단 · 부속 표 · 근거)} — 기관 보고서 화면 내려받기(10-14 원칙 250)
  문서 짓기는 공용 hwpx.py(모든 내려받는 문서 같은 서식).
  사양 = XI ChatGEO 대시보드 도구(agent/tools/ext/dash.py)가 화면에 준 그것 그대로 — 숫자는 다시 세지 않고 화면 값 그대로(숫자 한 출처).
  문서 = 제목 · 개요 표(지역 · 업무 · 비교 · 자료 · 만든 날짜) · 1. 주요 숫자(표) · 2. 해석 · 3. 차트(그림 n · PNG) · 4. 표 · 출처.

한글 문서 길(README 근거): 이 PC 에 한컴오피스 2020 이 있지만 COM 자동화(HWPFrame.HwpObject)는 보안 승인 창(파일 접근 허용)이
뜨면 서버 프로세스가 멈추고, 승인 모듈(별도 DLL 등록)이 없어 쓰지 않는다. 대신 한글 표준 문서 형식 HWPX(OWPML · KS X 6101 · zip + XML)를
여기서 직접 짓는다 — 한글 2014 이상 · 한컴 뷰어에서 열리고, 한글에서 '다른 이름으로 저장 → .hwp' 가 된다. 외부 서비스 · 유료 라이브러리 0.
글꼴 = 한글 기본 글꼴 함초롬바탕(본문) · 함초롬돋움(제목 · 표). 차트 그림은 matplotlib(Agg)로 화면과 같은 색 규칙으로 그린다.
화면에 내지 않는 것: 작업 id · 파일 경로 · 시군구/읍면동 코드 · 내부 규칙 이름(B1 · H1 …) · 지도 색칠 값.
"""
from __future__ import annotations

import datetime as dt
import io
import re
import threading
from urllib.parse import quote

from fastapi import APIRouter, Request
from fastapi.responses import Response
from starlette.concurrency import run_in_threadpool

from . import hwpx as H
from .deps import ApiError, principal, require
from .envelope import KST
from .hwpx import Doc

router = APIRouter()

# ── 화면(dash.js)과 같은 색 ──────────────────────────────────────────────────────
RAMP = {
    "teal": ["#E3F5F3", "#B5E6E1", "#7FD3CA", "#3FBDB1", "#0FA9A0", "#0B857E", "#07615C"],
    "orange": ["#FFF1E0", "#FFD9AD", "#FFBC70", "#FF9A3C", "#F07B1A", "#C85F0C", "#9A4706"],
    "violet": ["#F1EDFC", "#D9CFF7", "#B9A7F0", "#977DE6", "#7657D6", "#5A3DB4", "#40298A"],
    "red": ["#FDECEC", "#F9C9CB", "#F4A0A4", "#EE757C", "#E34954", "#BE2F3B", "#8F1F29"],
    "blue": ["#E6F0FE", "#C3DAFC", "#93BDFF", "#5E9BFF", "#2F78F0", "#0F55C7", "#003B85"],
}
DIV = ["#1F5FC8", "#6E9DEB", "#BBD1F5", "#ECEEF1", "#F6C6C1", "#EA8277", "#C93A2E"]
CAT = ["#2A78D6", "#EB6834", "#1BAF7A", "#EDA100", "#E87BA4", "#4A3AA7", "#008300", "#E34948"]
INK, INK2, GRID = "#191F28", "#6B7684", "#E5E8EB"


def _hex(c):
    return [int(c[i:i + 2], 16) for i in (1, 3, 5)]


def _mix(a, b, t):
    x, y = _hex(a), _hex(b)
    return "#" + "".join(f"{round(v + (y[i] - v) * t):02x}" for i, v in enumerate(x))


def _lerp(r, t):
    t = max(0.0, min(1.0, t))
    p = t * (len(r) - 1)
    i = int(p)
    return r[-1] if i >= len(r) - 1 else _mix(r[i], r[i + 1], p - i)


def color_of(sc, v):
    """dash.js colorOf 와 같은 셈."""
    if v is None:
        return "#E5E8EB"
    sc = sc or {}
    if sc.get("kind") == "div":
        m = sc.get("max") or 1
        return _lerp(DIV, 0.5 + max(-1, min(1, v / m)) / 2)
    r = RAMP.get(sc.get("hue")) or RAMP["teal"]
    if sc.get("kind") == "step":
        b = sc.get("breaks") or []
        k = next((i for i, x in enumerate(b) if v < x), len(b))
        return r[[1, 2, 3, 4, 6][min(k, 4)]]
    lo, hi = sc.get("min") or 0, sc.get("max") if sc.get("max") is not None else 1
    return _lerp(r[1:], (v - lo) / (hi - lo) if hi > lo else 1)


def nf(v, d=0) -> str:
    """dash.js nf(toLocaleString ko-KR · 소수 최대 d 자리 · 뒤 0 없음)와 같은 글자."""
    if v is None or isinstance(v, bool):
        return "—"
    try:
        x = float(v)
    except (TypeError, ValueError):
        return "—"
    if x != x:
        return "—"
    d = max(0, min(3, int(d or 0)))
    from decimal import ROUND_HALF_UP, Decimal                 # 화면(toLocaleString)은 반올림 = 0.5 올림
    q = Decimal(repr(x)).quantize(Decimal(1).scaleb(-d), rounding=ROUND_HALF_UP)
    s = f"{q:,.{d}f}"
    if d and "." in s:
        s = s.rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


# ── 차트 그림(PNG) ────────────────────────────────────────────────────────────────
_MPL_LOCK = threading.Lock()
_FONT = None


def _font():
    global _FONT
    if _FONT is None:
        from matplotlib import font_manager as fm
        import os
        for p in (r"C:\Windows\Fonts\malgun.ttf", "/usr/share/fonts/truetype/nanum/NanumGothic.ttf"):
            if os.path.exists(p):
                fm.fontManager.addfont(p)
                _FONT = fm.FontProperties(fname=p).get_name()
                break
        else:
            _FONT = "sans-serif"
    return _FONT


def _fig(h_in: float):
    import matplotlib
    matplotlib.use("Agg", force=False)
    from matplotlib.figure import Figure
    import matplotlib as mpl
    mpl.rcParams["font.family"] = _font()
    mpl.rcParams["axes.unicode_minus"] = False
    f = Figure(figsize=(7.2, h_in), dpi=150)
    f.patch.set_facecolor("white")
    return f


def _clean(ax, grid_x=False, grid_y=False):
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    for s in ("left", "bottom"):
        ax.spines[s].set_color(GRID)
    ax.tick_params(colors=INK2, labelsize=8, length=0)
    if grid_x:
        ax.xaxis.grid(True, color=GRID, lw=0.6)
    if grid_y:
        ax.yaxis.grid(True, color=GRID, lw=0.6)
    ax.set_axisbelow(True)


def _png(f) -> tuple[bytes, int, int]:
    b = io.BytesIO()
    f.savefig(b, format="png", dpi=150, facecolor="white", bbox_inches="tight", pad_inches=0.08)
    data = b.getvalue()
    from PIL import Image
    w, h = Image.open(io.BytesIO(data)).size
    return data, w, h


def _short(s, n=10):
    s = str(s)
    return s if len(s) <= n else s[: n - 1] + "…"


def ch_bar(p):
    rows = [r for r in (p.get("rows") or [])]
    if not rows:
        return None
    vals = [r.get("v") or 0 for r in rows]
    labels = [str(r.get("label", "")) for r in rows]
    cols = [color_of(p.get("scale"), v) if p.get("scale") else CAT[0] for v in vals]
    short = all(len(x) <= 4 for x in labels)
    time_like = all(re.match(r"^\d{1,2}[:\-]\d{2}$", x) for x in labels)
    vert = p.get("orient") != "h" and ((7 <= len(rows) <= 12 and short) or (len(rows) > 12 and time_like))
    d = p.get("d") or 0
    if vert:
        f = _fig(3.0)
        ax = f.add_subplot(111)
        x = range(len(rows))
        ax.bar(x, vals, color=cols, width=0.68)
        every = -(-len(rows) // 8) if len(rows) > 12 else 1
        ax.set_xticks(list(x))
        ax.set_xticklabels([lb if i % every == 0 else "" for i, lb in enumerate(labels)], fontsize=8)
        for i, v in enumerate(vals):
            if len(rows) <= 12:
                ax.text(i, v, nf(v, d), ha="center", va="bottom", fontsize=7.5, color=INK)
        _clean(ax, grid_y=True)
        ax.yaxis.set_major_formatter(_fmt())
    else:
        f = _fig(max(1.6, 0.3 * len(rows) + 0.5))
        ax = f.add_subplot(111)
        y = list(range(len(rows)))[::-1]
        ax.barh(y, vals, color=cols, height=0.62)
        ax.set_yticks(y)
        ax.set_yticklabels([_short(lb, 12) for lb in labels], fontsize=8.5, color=INK)
        mx = max(vals) or 1
        for yy, v in zip(y, vals):
            ax.text(v + mx * 0.01, yy, nf(v, d), va="center", fontsize=8, color=INK)
        ax.set_xlim(0, mx * 1.14)
        _clean(ax, grid_x=True)
        ax.xaxis.set_major_formatter(_fmt())
    return _png(f)


def _fmt():
    from matplotlib.ticker import FuncFormatter
    return FuncFormatter(lambda v, _: nf(v, 1 if abs(v) < 10 and v != int(v) else 0))


def ch_hist(p):
    b = p.get("bins") or []
    if not b:
        return None
    f = _fig(2.8)
    ax = f.add_subplot(111)
    vals = [x.get("v") or 0 for x in b]
    ax.bar(range(len(b)), vals, color=[RAMP["blue"][min(6, 2 + i)] for i in range(len(b))], width=0.72)
    ax.set_xticks(range(len(b)))
    ax.set_xticklabels([str(x.get("label", "")) for x in b], fontsize=8)
    for i, v in enumerate(vals):
        ax.text(i, v, nf(v), ha="center", va="bottom", fontsize=8, color=INK)
    _clean(ax, grid_y=True)
    ax.yaxis.set_major_formatter(_fmt())
    return _png(f)


def ch_donut(p):
    rows = [r for r in (p.get("rows") or []) if (r.get("v") or 0) > 0]
    if not rows:
        return None
    tot = sum(r["v"] for r in rows) or 1
    d = p.get("d") or 0
    f = _fig(2.8)
    ax = f.add_axes([0.02, 0.04, 0.42, 0.92])
    ax.pie([r["v"] for r in rows], colors=[CAT[i % len(CAT)] for i in range(len(rows))], startangle=90, counterclock=False,
           wedgeprops={"width": 0.36, "edgecolor": "white", "linewidth": 1.5})
    ax.text(0, 0.06, nf(tot, d), ha="center", va="center", fontsize=12, fontweight="bold", color=INK)
    ax.text(0, -0.2, str(p.get("unit") or ""), ha="center", va="center", fontsize=8, color=INK2)
    ax.set_aspect("equal")
    lg = f.add_axes([0.48, 0.04, 0.5, 0.92])
    lg.axis("off")
    n = len(rows)
    for i, r in enumerate(rows):
        y = 1 - (i + 0.5) / max(n, 6)
        lg.add_patch(__import__("matplotlib.patches", fromlist=["Rectangle"]).Rectangle((0, y - 0.025), 0.035, 0.05, color=CAT[i % len(CAT)], transform=lg.transAxes))
        lg.text(0.06, y, _short(r.get("label", ""), 14), va="center", fontsize=9, color=INK, transform=lg.transAxes)
        lg.text(0.98, y, f"{nf(r['v'], d)}{p.get('unit') or ''} · {nf(r['v'] / tot * 100, 1)}%", va="center", ha="right", fontsize=9, color=INK, transform=lg.transAxes)
    return _png(f)


def ch_stack(p):
    rows, ser = p.get("rows") or [], p.get("series") or []
    if not rows:
        return None
    f = _fig(max(1.8, 0.3 * len(rows) + 0.9))
    ax = f.add_subplot(111)
    y = list(range(len(rows)))[::-1]
    left = [0.0] * len(rows)
    for j, s in enumerate(ser):
        v = [(r.get("vals") or [])[j] if j < len(r.get("vals") or []) else 0 for r in rows]
        v = [x or 0 for x in v]
        ax.barh(y, v, left=left, color=CAT[j % len(CAT)], height=0.62, label=str(s))
        left = [a + b for a, b in zip(left, v)]
    mx = max(left) or 1
    for yy, t in zip(y, left):
        ax.text(t + mx * 0.01, yy, nf(t), va="center", fontsize=8, color=INK)
    ax.set_xlim(0, mx * 1.14)
    ax.set_yticks(y)
    ax.set_yticklabels([_short(r.get("label", ""), 12) for r in rows], fontsize=8.5, color=INK)
    _clean(ax, grid_x=True)
    ax.xaxis.set_major_formatter(_fmt())
    ax.legend(loc="lower center", bbox_to_anchor=(0.5, 1.0), ncol=min(len(ser), 5), frameon=False, fontsize=8, handlelength=1, handleheight=0.8)
    return _png(f)


def ch_heat(p):
    cols, rows = p.get("cols") or [], p.get("rows") or []
    if not cols or not rows:
        return None
    r = RAMP.get((p.get("scale") or {}).get("hue")) or RAMP["teal"]
    cmax = [max([1] + [(rw.get("vals") or [0] * len(cols))[j] or 0 for rw in rows]) for j in range(len(cols))]
    f = _fig(max(2.0, 0.3 * len(rows) + 0.7))
    ax = f.add_subplot(111)
    from matplotlib.patches import Rectangle
    for i, rw in enumerate(rows):
        for j in range(len(cols)):
            v = (rw.get("vals") or [])[j] if j < len(rw.get("vals") or []) else 0
            v = v or 0
            bg = _lerp(r, 0.12 + 0.88 * (v / cmax[j]) ** 0.5) if v else "#F2F4F6"
            ax.add_patch(Rectangle((j, len(rows) - 1 - i), 0.96, 0.9, color=bg))
            if v:
                rr, gg, bb = _hex(bg)
                ink = "#1C1F25" if (0.299 * rr + 0.587 * gg + 0.114 * bb) > 150 else "#FFFFFF"
                ax.text(j + 0.48, len(rows) - 1 - i + 0.45, nf(v), ha="center", va="center", fontsize=7.5, color=ink)
    ax.set_xlim(0, len(cols))
    ax.set_ylim(0, len(rows))
    ax.set_xticks([j + 0.48 for j in range(len(cols))])
    ax.set_xticklabels([str(c).replace("(", "\n(") for c in cols], fontsize=7.5, color=INK)
    ax.xaxis.tick_top()
    ax.set_yticks([len(rows) - 1 - i + 0.45 for i in range(len(rows))])
    ax.set_yticklabels([_short(rw.get("label", ""), 10) for rw in rows], fontsize=8.5, color=INK)
    for s in ax.spines.values():
        s.set_visible(False)
    ax.tick_params(length=0)
    return _png(f)


def ch_line(p):
    pts = p.get("points") or []
    if len(pts) < 2:
        return None
    g = p.get("grain")

    def lab(x):
        t = str(x.get("t", ""))
        return t[5:16].replace("T", " ") if g == "hour" else t[5:10] if g == "day" else t
    f = _fig(2.6)
    ax = f.add_subplot(111)
    xs = list(range(len(pts)))
    vs = [x.get("v") or 0 for x in pts]
    ax.fill_between(xs, vs, color="#0FA9A0", alpha=0.12, lw=0)
    ax.plot(xs, vs, color="#0FA9A0", lw=2)
    ax.plot([xs[-1]], [vs[-1]], "o", color="#0FA9A0", ms=5)
    every = max(1, -(-len(pts) // 6))
    ticks = [i for i in xs if i % every == 0 or i == len(pts) - 1]
    ax.set_xticks(ticks)
    ax.set_xticklabels([lab(pts[i]) for i in ticks], fontsize=8)
    ax.set_ylim(0, (max(vs) or 1) * 1.08)
    ax.annotate(nf(vs[-1]), (xs[-1], vs[-1]), textcoords="offset points", xytext=(-4, 6), ha="right", fontsize=8, color=INK)
    _clean(ax, grid_y=True)
    ax.yaxis.set_major_formatter(_fmt())
    return _png(f)


def ch_scatter(p):
    pts = p.get("pts") or []
    if not pts:
        return None
    xs, ys = [q.get("x") or 0 for q in pts], [q.get("y") or 0 for q in pts]
    k = sum(ys) / (sum(xs) or 1)
    f = _fig(3.0)
    ax = f.add_subplot(111)
    xh, yh = max(xs) or 1, max(ys) or 1
    x2 = min(xh, yh / (k or 1))
    ax.plot([0, x2], [0, k * x2], color=INK2, lw=1, ls="--")
    ax.scatter(xs, ys, s=46, c=["#F07B1A" if y > k * x else "#0FA9A0" for x, y in zip(xs, ys)], alpha=0.85, edgecolors="white", linewidths=1.2)
    top = sorted(pts, key=lambda q: -(q.get("y") or 0))[:5]
    for q in top:
        ax.annotate(_short(q.get("label", ""), 8), (q.get("x") or 0, q.get("y") or 0), textcoords="offset points", xytext=(5, 3), fontsize=7.5, color=INK)
    xl, yl = p.get("x") or {}, p.get("y") or {}
    ax.set_xlabel(f"{xl.get('label', '')}({xl.get('unit', '')})", fontsize=8, color=INK2)
    ax.set_ylabel(f"{yl.get('label', '')}({yl.get('unit', '')})", fontsize=8, color=INK2)
    _clean(ax, grid_y=True)
    ax.yaxis.set_major_formatter(_fmt())
    return _png(f)


CHART = {"bar": ch_bar, "hist": ch_hist, "donut": ch_donut, "stack": ch_stack, "heat": ch_heat, "line": ch_line, "scatter": ch_scatter}
CHART_NOTE = {"scatter": "주황 = 넓이에 비해 많은 곳 · 청록 = 적은 곳 · 점선 = 평균", "heat": "업무마다 많은 칸이 짙습니다"}


# ── 대시보드 사양 → 문서 ─────────────────────────────────────────────────────────
_CODE = re.compile(r"\b\d{5,10}\b")                        # 시군구 · 읍면동 코드가 글자에 섞이면 뺀다


def _say_clean(s: str) -> str:
    return _CODE.sub("", str(s or "")).strip()


def _table_cell(c, i):
    if isinstance(c, (int, float)) and not isinstance(c, bool):
        return nf(c, 1 if i == 3 else 0)                      # dash.js table() 과 같은 자리수
    return "—" if c is None else str(c)


def build_hwpx(spec: dict, now: dt.datetime | None = None) -> tuple[bytes, str]:
    now = now or dt.datetime.now(KST)
    made = now.strftime("%Y. %m. %d.")
    made_t = now.strftime("%Y. %m. %d. %H:%M")
    title = str(spec.get("title") or "대시보드")
    means = dict((str(a), str(b)) for a, b in (spec.get("means") or []) if a)
    region = means.get("지역", "")
    d = Doc()
    d.title(f"{title} 보고")
    d.overview([("지역", region or "—"), ("업무", means.get("업무", "—")), ("비교", means.get("비교", "—")), ("만든 날짜", made_t),
                ("자료", " · ".join(spec.get("fuse") or []) or "AI 분석 결과"), ("작성", "Land-XI XI맵")])
    if spec.get("note"):
        d.small(f"※ {spec['note']}")
    kp = spec.get("kpis") or []
    if kp:
        d.heading("주요 숫자")
        heads = [str(k.get("label", "")) for k in kp[:4]]
        vals = [f"{nf(k.get('value'), k.get('d') or 0)}{k.get('unit') or ''}" for k in kp[:4]]
        rows = [heads, vals]
        subs = [str(k.get("sub") or "") for k in kp[:4]]
        if any(subs):
            rows.append(subs)
        d.table(rows, [1] * len(heads), head_rows=1, big_row=1, aligns=["c"] * len(heads))
    say = [_say_clean(x) for x in (spec.get("say") or []) if _say_clean(x)]
    if say or spec.get("live"):
        d.heading("해석")
        for s in say:
            d.item(s)
        if spec.get("live"):
            d.item(f"지금 분석 중: {spec['live']}")
    panels = spec.get("panels") or []
    charts = [p for p in panels if p.get("type") in CHART]
    if charts:
        d.heading("차트")
        with _MPL_LOCK:
            for p in charts:
                try:
                    r = CHART[p["type"]](p)
                except Exception:                              # 그림 하나가 안 되면 그 그림만 빼고(문서는 낸다)
                    r = None
                if not r:
                    continue
                cap = str(p.get("title", ""))
                if p.get("unit") and p["type"] not in ("scatter",):
                    cap += f" (단위: {p['unit']})"
                d.figure(r[0], cap, CHART_NOTE.get(p["type"]))
    tabs = [p for p in panels if p.get("type") in ("rank", "table")]
    if tabs:
        d.heading("표")
        for p in tabs:
            unit = p.get("unit") or ""
            cap = f"{p.get('title', '')}{f' (단위: {unit})' if unit and p['type'] == 'rank' else ''}"
            if p["type"] == "rank":
                ex = p.get("extra")
                head = ["순위", "이름", "수"] + ([str(ex.get("label", ""))] if ex else [])
                rows = [head]
                for i, r in enumerate(p.get("rows") or []):
                    row = [str(i + 1), str(r.get("label", "")), nf(r.get("v"))]
                    if ex:
                        row.append(nf(r.get(ex.get("key")), 1) if r.get(ex.get("key")) is not None else "—")
                    rows.append(row)
                d.table(rows, [8, 36, 28, 28][:len(head)], aligns=["c", "l", "r", "r"][:len(head)], caption=cap)
            else:
                num = set(p.get("num") or [])
                rows = [[str(c) for c in p.get("cols") or []]] + [[_table_cell(c, i) for i, c in enumerate(r)] for r in p.get("rows") or []]
                n = len(rows[0]) or 1
                d.table(rows, [1] * n, aligns=["r" if i in num else "l" for i in range(n)], caption=cap)
            d.blank()
    src = " · ".join(spec.get("fuse") or []) or "AI 분석 결과"
    d.source(f"Land-XI XI맵 융합 대시보드({src}) · 숫자는 대시보드 화면과 같은 값입니다.", made_t)
    name = H.safe_name(f"{title}_보고서_{made.replace('. ', '').rstrip('.')}")
    return d.package(title + " 보고", now), name


def hwpx_response(blob: bytes, name: str) -> Response:
    """한글 문서 내려받기 응답 — 모든 문서 같은 머리(파일 이름 = UTF-8 · 화면이 읽는 X-LX-Report-Name)."""
    return Response(blob, media_type=H.MEDIA,
                    headers={"content-disposition": f"attachment; filename=\"report.hwpx\"; filename*=UTF-8''{quote(name)}",
                             "x-lx-report-name": quote(name), "cache-control": "no-store",
                             "access-control-expose-headers": "Content-Disposition, X-LX-Report-Name"})


@router.post("/ximap/report.hwpx")
async def report_hwpx(request: Request):
    require(principal(request), lx=True)
    try:
        body = await request.json()
    except Exception:
        raise ApiError("bad_request", "대시보드 사양이 필요합니다")
    spec = (body or {}).get("spec") if isinstance(body, dict) else None
    if not isinstance(spec, dict) or not spec.get("title") or not isinstance(spec.get("panels") or [], list):
        raise ApiError("bad_request", "대시보드 사양이 필요합니다")
    blob, name = await run_in_threadpool(build_hwpx, spec)
    return hwpx_response(blob, name)


# ── 화면에서 본 보고서 → 한글 문서(기관 보고서 화면 '내려받기' — 브라우저가 문서를 짓던 것을 서버 한 곳으로 · 같은 서식) ─────────────
_LIM = {"title": 120, "meta": 300, "h": 80, "para": 2000, "cell": 200, "note": 400, "foot": 400}


def _s(v, n) -> str:
    return re.sub(r"\s+", " ", str(v if v is not None else "")).strip()[:n]


def build_screen(doc: dict, now: dt.datetime | None = None) -> tuple[bytes, str]:
    """doc = {title, author?, meta?, overview?:[[이름, 값]], notice?, sections:[{h, paras[]}], tables:[{h, note?, head[], rows[][]}], notes[], foot?, file?}
    — 화면에 보인 글 · 숫자 그대로(서버는 다시 세지 않는다 · 숫자 한 출처). 같은 서식(제목 · 개요 표 · 장 제목 · 표 n. · 출처 · 만든 날짜)."""
    now = now or dt.datetime.now(KST)
    made_t = now.strftime("%Y. %m. %d. %H:%M")
    title = _s(doc.get("title"), _LIM["title"]) or "보고서"
    d = Doc()
    d.title(title, _s(doc.get("meta"), _LIM["meta"]) or None)
    ov = doc.get("overview") if isinstance(doc.get("overview"), list) else []
    ov = [(_s(x[0], 40), _s(x[1], _LIM["cell"])) for x in ov[:12] if isinstance(x, (list, tuple)) and len(x) >= 2]
    if ov:
        d.overview(ov + [("만든 날짜", made_t)])
    if doc.get("notice"):
        d.notice(_s(doc["notice"], _LIM["foot"]))
    for sec in (doc.get("sections") or [])[:12]:
        if not isinstance(sec, dict):
            continue
        paras = [_s(p, _LIM["para"]) for p in (sec.get("paras") or [])[:40] if _s(p, 10)]
        if not paras:
            continue
        d.heading(re.sub(r"^[①-⑳]\s*", "", _s(sec.get("h"), _LIM["h"])))
        for p in paras:
            d.body_text(p)
    tabs = [t for t in (doc.get("tables") or [])[:8] if isinstance(t, dict) and t.get("head")]
    if tabs:
        d.heading("부속 표")
        for t in tabs:
            head = [_s(c, 40) for c in t["head"][:12]]
            rows = [[_s(c, _LIM["cell"]) for c in r[:len(head)]] for r in (t.get("rows") or [])[:300] if isinstance(r, list)]
            num = [bool(rows) and all(re.fullmatch(r"—|-|[\d,.]+%?", r[i] if i < len(r) else "—") for r in rows) for i in range(len(head))]
            d.table([head] + (rows or [["없음"] + [""] * (len(head) - 1)]), None, aligns=["r" if x else "l" for x in num],
                    small=len(head) > 6, caption=re.sub(r"^부속\s*표\s*\d+\s*·\s*", "", _s(t.get("h"), _LIM["h"])))
            if t.get("note"):
                d.small(_s(t["note"], _LIM["note"]))
    notes = [_s(x, _LIM["note"]) for x in (doc.get("notes") or [])[:60] if _s(x, 5)]
    if notes:
        d.heading("근거")
        for x in notes:
            d.small(x)
    if doc.get("foot"):
        d.blank()
        d.small(_s(doc["foot"], _LIM["foot"]))
    d.source(_s(doc.get("source"), _LIM["note"]) or "Land-XI · 화면에 보인 글과 숫자 그대로", made_t)
    stem = _s(doc.get("file"), 100) or f"{title}_{now:%Y%m%d}"
    return d.package(title, now, _s(doc.get("author"), 60) or "Land-XI"), H.safe_name(re.sub(r"\.(hwpx|docx)$", "", stem))


@router.post("/report/screen.hwpx")
async def report_screen(request: Request):
    """기관 · LX 화면 어디서나 — 로그인한 사람만. 받은 글만 문서로 짓는다(자료를 읽지 않음 → 계정 범위 밖 자료 0)."""
    require(principal(request))
    try:
        body = await request.json()
    except Exception:
        raise ApiError("bad_request", "문서 내용이 필요합니다")
    doc = (body or {}).get("doc") if isinstance(body, dict) else None
    if not isinstance(doc, dict) or not doc.get("title"):
        raise ApiError("bad_request", "문서 내용이 필요합니다")
    blob, name = await run_in_threadpool(build_screen, doc)
    return hwpx_response(blob, name)
