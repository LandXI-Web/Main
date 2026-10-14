"""XI맵 융합 대시보드 '보고서로' — 화면에 낸 대시보드를 한글 문서(HWPX)로(10-14 사용자 · 원칙 247).

POST /api/v1/ximap/report.hwpx   LX 계정 · body = {"spec": 대시보드 사양}
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
import zipfile
from urllib.parse import quote
from xml.sax.saxutils import escape

from fastapi import APIRouter, Request
from fastapi.responses import Response
from starlette.concurrency import run_in_threadpool

from .deps import ApiError, principal, require
from .envelope import KST

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


_CTRL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")


def T(s) -> str:
    return escape(_CTRL.sub("", str(s if s is not None else "")))


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


# ── HWPX(OWPML) 짓기 ──────────────────────────────────────────────────────────────
NS = ('xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" '
      'xmlns:hp10="http://www.hancom.co.kr/hwpml/2016/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" '
      'xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" '
      'xmlns:hhs="http://www.hancom.co.kr/hwpml/2011/history" xmlns:hm="http://www.hancom.co.kr/hwpml/2011/master-page" '
      'xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf" xmlns:dc="http://purl.org/dc/elements/1.1/" '
      'xmlns:opf="http://www.idpf.org/2007/opf/" xmlns:ooxmlchart="http://www.hancom.co.kr/hwpml/2016/ooxmlchart" '
      'xmlns:hwpunitchar="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar" xmlns:epub="http://www.idpf.org/2007/ops" '
      'xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0"')
XMLH = '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>'
FONTS = ("함초롬바탕", "함초롬돋움")            # 0 = 바탕(본문) · 1 = 돋움(제목 · 표)
LANGS = ("HANGUL", "LATIN", "HANJA", "JAPANESE", "OTHER", "SYMBOL", "USER")
PAGE_W, PAGE_H, M_LR, M_T, M_B, M_HF = 59528, 84188, 7087, 5668, 4252, 4252   # A4 · 좌우 25mm · 위 20mm · 아래 15mm
TEXT_W = PAGE_W - 2 * M_LR


def _fontfaces():
    ti = ('<hh:typeInfo familyType="FCAT_GOTHIC" weight="6" proportion="4" contrast="0" strokeVariation="1" armStyle="1" '
          'letterform="1" midline="1" xHeight="1"/>')
    out = []
    for lg in LANGS:
        fs = "".join(f'<hh:font id="{i}" face="{f}" type="TTF" isEmbedded="0">{ti}</hh:font>' for i, f in enumerate(FONTS))
        out.append(f'<hh:fontface lang="{lg}" fontCnt="{len(FONTS)}">{fs}</hh:fontface>')
    return f'<hh:fontfaces itemCnt="{len(LANGS)}">{"".join(out)}</hh:fontfaces>'


def _bf(i, line=None, fill=None, sides=("left", "right", "top", "bottom")):
    b = "".join(f'<hh:{s}Border type="{"SOLID" if line and s in sides else "NONE"}" width="0.12 mm" color="{line or "#000000"}"/>'
                for s in ("left", "right", "top", "bottom"))
    fb = f'<hc:fillBrush><hc:winBrush faceColor="{fill}" hatchColor="#FF000000" alpha="0"/></hc:fillBrush>' if fill else ""
    return (f'<hh:borderFill id="{i}" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0">'
            '<hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/>'
            f'{b}<hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/>{fb}</hh:borderFill>')


# 테두리: 1 없음 · 2 없음(글자용) · 3 표 칸(옅은 회색 선) · 4 표 머리 칸(회색 바탕) · 5 큰 숫자 칸(옅은 바탕) · 6 제목 아래 선
BORDERS = [_bf(1), _bf(2), _bf(3, "#C9CED6"), _bf(4, "#C9CED6", "#EEF1F4"), _bf(5, "#C9CED6", "#F7F8FA"), _bf(6, "#191F28", None, ("bottom",))]

# 글자 모양: (높이 1/100pt, 글꼴, 굵게, 색)
CHARS = [
    (1000, 0, False, "#000000"),   # 0 바탕글
    (1050, 0, False, "#191F28"),   # 1 본문
    (1800, 1, True, "#191F28"),    # 2 제목
    (1250, 1, True, "#191F28"),    # 3 장 제목(1. 2. …)
    (900, 1, False, "#4E5968"),    # 4 작은 글(만든 날짜 · 주석)
    (950, 1, False, "#191F28"),    # 5 표 글
    (950, 1, True, "#333D4B"),     # 6 표 머리
    (1500, 1, True, "#191F28"),    # 7 큰 숫자
    (900, 1, True, "#4E5968"),     # 8 그림 번호
]


def _charpr(i, h, font, bold, color):
    ref = " ".join(f'{a}="{font}"' for a in ("hangul", "latin", "hanja", "japanese", "other", "symbol", "user"))
    same = lambda v: " ".join(f'{a}="{v}"' for a in ("hangul", "latin", "hanja", "japanese", "other", "symbol", "user"))
    return (f'<hh:charPr id="{i}" height="{h}" textColor="{color}" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="2">'
            f'<hh:fontRef {ref}/><hh:ratio {same(100)}/><hh:spacing {same(0)}/><hh:relSz {same(100)}/><hh:offset {same(0)}/>'
            f'{"<hh:bold/>" if bold else ""}<hh:underline type="NONE" shape="SOLID" color="#000000"/><hh:strikeout shape="NONE" color="#000000"/>'
            '<hh:outline type="NONE"/><hh:shadow type="NONE" color="#B2B2B2" offsetX="10" offsetY="10"/></hh:charPr>')


# 문단 모양: (정렬, 줄 간격 %, 위 여백, 아래 여백, 왼쪽 들여, 다음과 함께)
PARAS = [
    ("JUSTIFY", 160, 0, 0, 0, False),     # 0 바탕글
    ("JUSTIFY", 165, 0, 600, 0, False),   # 1 본문
    ("CENTER", 130, 0, 400, 0, False),    # 2 제목
    ("LEFT", 140, 1600, 600, 0, True),    # 3 장 제목
    ("RIGHT", 130, 0, 0, 0, False),       # 4 오른쪽(만든 날짜)
    ("CENTER", 130, 0, 0, 0, False),      # 5 표 칸 가운데
    ("LEFT", 130, 0, 0, 0, False),        # 6 표 칸 왼쪽
    ("CENTER", 130, 400, 200, 0, True),   # 7 그림
    ("CENTER", 130, 0, 800, 0, False),    # 8 그림 번호
    ("LEFT", 165, 0, 400, 1000, False),   # 9 해석 줄(○ 들여)
    ("LEFT", 130, 0, 200, 0, False),      # 10 작은 글 왼쪽
    ("LEFT", 130, 0, 200, 0, True),       # 11 표 번호(표와 함께)
]


def _parapr(i, align, line, prev, nxt, left, keep):
    mg = (f'<hh:margin><hc:intent value="{-left if left else 0}" unit="HWPUNIT"/><hc:left value="{left}" unit="HWPUNIT"/>'
          f'<hc:right value="0" unit="HWPUNIT"/><hc:prev value="{prev}" unit="HWPUNIT"/><hc:next value="{nxt}" unit="HWPUNIT"/></hh:margin>'
          f'<hh:lineSpacing type="PERCENT" value="{line}" unit="HWPUNIT"/>')
    return (f'<hh:paraPr id="{i}" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="1" suppressLineNumbers="0" checked="0">'
            f'<hh:align horizontal="{align}" vertical="BASELINE"/><hh:heading type="NONE" idRef="0" level="0"/>'
            f'<hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="KEEP_WORD" widowOrphan="0" keepWithNext="{1 if keep else 0}" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/>'
            '<hh:autoSpacing eAsianEng="0" eAsianNum="0"/>'
            f'<hp:switch><hp:case hp:required-namespace="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar">{mg}</hp:case><hp:default>{mg}</hp:default></hp:switch>'
            '<hh:border borderFillIDRef="2" offsetLeft="0" offsetRight="0" offsetTop="0" offsetBottom="0" connect="0" ignoreMargin="0"/></hh:paraPr>')


def header_xml(n_pic: int, n_tbl: int) -> str:
    chars = "".join(_charpr(i, *c) for i, c in enumerate(CHARS))
    paras = "".join(_parapr(i, *p) for i, p in enumerate(PARAS))
    return (f'{XMLH}<hh:head {NS} version="1.4" secCnt="1"><hh:beginNum page="1" footnote="1" endnote="1" pic="1" tbl="1" equation="1"/>'
            f'<hh:refList>{_fontfaces()}<hh:borderFills itemCnt="{len(BORDERS)}">{"".join(BORDERS)}</hh:borderFills>'
            f'<hh:charProperties itemCnt="{len(CHARS)}">{chars}</hh:charProperties>'
            '<hh:tabProperties itemCnt="1"><hh:tabPr id="0" autoTabLeft="0" autoTabRight="0"/></hh:tabProperties>'
            f'<hh:paraProperties itemCnt="{len(PARAS)}">{paras}</hh:paraProperties>'
            '<hh:styles itemCnt="1"><hh:style id="0" type="PARA" name="바탕글" engName="Normal" paraPrIDRef="0" charPrIDRef="0" nextStyleIDRef="0" langID="1042" lockForm="0"/></hh:styles>'
            '</hh:refList><hh:compatibleDocument targetProgram="HWP201X"><hh:layoutCompatibility/></hh:compatibleDocument>'
            '<hh:docOption><hh:linkinfo path="" pageInherit="0" footnoteInherit="0"/></hh:docOption><hh:trackchageConfig flags="56"/></hh:head>')


SEC_PR = ('<hp:secPr id="" textDirection="HORIZONTAL" spaceColumns="1134" tabStop="8000" tabStopVal="4000" tabStopUnit="HWPUNIT" outlineShapeIDRef="0" '
          'memoShapeIDRef="0" textVerticalWidthHead="0" masterPageCnt="0"><hp:grid lineGrid="0" charGrid="0" wonggojiFormat="0"/>'
          '<hp:startNum pageStartsOn="BOTH" page="0" pic="0" tbl="0" equation="0"/>'
          '<hp:visibility hideFirstHeader="0" hideFirstFooter="0" hideFirstMasterPage="0" border="SHOW_ALL" fill="SHOW_ALL" hideFirstPageNum="0" hideFirstEmptyLine="0" showLineNumber="0"/>'
          '<hp:lineNumberShape restartType="0" countBy="0" distance="0" startNumber="0"/>'
          f'<hp:pagePr landscape="WIDELY" width="{PAGE_W}" height="{PAGE_H}" gutterType="LEFT_ONLY"><hp:margin header="{M_HF}" footer="{M_HF}" gutter="0" left="{M_LR}" right="{M_LR}" top="{M_T}" bottom="{M_B}"/></hp:pagePr>'
          '<hp:footNotePr><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/><hp:noteLine length="-1" type="SOLID" width="0.12 mm" color="#000000"/>'
          '<hp:noteSpacing betweenNotes="283" belowLine="567" aboveLine="850"/><hp:numbering type="CONTINUOUS" newNum="1"/><hp:placement place="EACH_COLUMN" beneathText="0"/></hp:footNotePr>'
          '<hp:endNotePr><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/><hp:noteLine length="14692344" type="SOLID" width="0.12 mm" color="#000000"/>'
          '<hp:noteSpacing betweenNotes="0" belowLine="567" aboveLine="850"/><hp:numbering type="CONTINUOUS" newNum="1"/><hp:placement place="END_OF_DOCUMENT" beneathText="0"/></hp:endNotePr>'
          + "".join(f'<hp:pageBorderFill type="{t}" borderFillIDRef="1" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER"><hp:offset left="1417" right="1417" top="1417" bottom="1417"/></hp:pageBorderFill>' for t in ("BOTH", "EVEN", "ODD"))
          + '</hp:secPr><hp:ctrl><hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="1" sameSz="1" sameGap="0"/></hp:ctrl>')


class Doc:
    def __init__(self):
        self.body: list[str] = []
        self.bins: list[tuple[str, bytes]] = []
        self.n_tbl = 0
        self.plain: list[str] = []
        self._id = 1000

    def nid(self):
        self._id += 1
        return self._id

    @staticmethod
    def _p(inner, para=1, first=False):
        sec = '<hp:run charPrIDRef="0">' + SEC_PR + '</hp:run>' if first else ''
        return (f'<hp:p id="0" paraPrIDRef="{para}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">'
                f'{sec}{inner}</hp:p>')

    @staticmethod
    def _run(text, char=1):
        return f'<hp:run charPrIDRef="{char}"><hp:t>{T(text)}</hp:t></hp:run>'

    def para(self, text, para=1, char=1, runs=None):
        inner = "".join(self._run(t, c) for t, c in runs) if runs else self._run(text, char)
        self.body.append(self._p(inner, para, first=not self.body))
        self.plain.append("".join(t for t, _ in runs) if runs else str(text))

    def table(self, rows: list[list], widths: list[int], head_rows=1, head_col=False, aligns=None, big_row=None):
        """rows[r][c] = 글자 · widths = 칸 폭 비율. head_rows = 머리 줄 수 · head_col = 첫 칸을 머리처럼."""
        self.n_tbl += 1
        tot = sum(widths)
        ws = [int(TEXT_W * w / tot) for w in widths]
        ws[-1] = TEXT_W - sum(ws[:-1])
        H = 1700
        trs = []
        for ri, r in enumerate(rows):
            tcs = []
            for ci, c in enumerate(r):
                head = ri < head_rows or (head_col and ci == 0)
                big = big_row is not None and ri == big_row
                bf = 4 if head else (5 if big else 3)
                char = 6 if head else (7 if big else 5)
                al = 5 if (head or big or (aligns and aligns[ci] == "c")) else (6 if not aligns or aligns[ci] == "l" else 4)
                tcs.append(f'<hp:tc name="" header="{1 if ri < head_rows else 0}" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="{bf}">'
                           '<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">'
                           f'{self._p(self._run(c, char), al)}</hp:subList><hp:cellAddr colAddr="{ci}" rowAddr="{ri}"/><hp:cellSpan colSpan="1" rowSpan="1"/>'
                           f'<hp:cellSz width="{ws[ci]}" height="{2400 if big else H}"/><hp:cellMargin left="510" right="510" top="141" bottom="141"/></hp:tc>')
            trs.append(f'<hp:tr>{"".join(tcs)}</hp:tr>')
        th = sum(2400 if (big_row is not None and i == big_row) else H for i in range(len(rows)))
        tbl = (f'<hp:tbl id="{self.nid()}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" '
               f'repeatHeader="1" rowCnt="{len(rows)}" colCnt="{len(widths)}" cellSpacing="0" borderFillIDRef="3" noAdjust="0">'
               f'<hp:sz width="{TEXT_W}" widthRelTo="ABSOLUTE" height="{th}" heightRelTo="ABSOLUTE" protect="0"/>'
               '<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>'
               '<hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:inMargin left="510" right="510" top="141" bottom="141"/>'
               f'{"".join(trs)}</hp:tbl>')
        self.body.append(self._p(f'<hp:run charPrIDRef="1">{tbl}<hp:t/></hp:run>', 1, first=not self.body))
        self.plain.extend(" | ".join(str(c) for c in r) for r in rows)

    def picture(self, png: bytes, w_px: int, h_px: int, max_w=TEXT_W):
        k = len(self.bins) + 1
        bid = f"image{k}"
        self.bins.append((bid, png))
        w = max_w
        h = int(w * h_px / max(1, w_px))
        if h > 52000:                                      # 아주 긴 그림은 높이를 줄인다(쪽 안에)
            h = 52000
            w = int(h * w_px / max(1, h_px))
        org_w, org_h = int(w_px * 7200 / 150), int(h_px * 7200 / 150)
        pic = (f'<hp:pic id="{self.nid()}" zOrder="0" numberingType="PICTURE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="{self.nid()}" reverse="0">'
               f'<hp:offset x="0" y="0"/><hp:orgSz width="{org_w}" height="{org_h}"/><hp:curSz width="{w}" height="{h}"/><hp:flip horizontal="0" vertical="0"/>'
               '<hp:rotationInfo angle="0" centerX="0" centerY="0" rotateimage="1"/><hp:renderingInfo><hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>'
               f'<hc:scaMatrix e1="{w / org_w:.6f}" e2="0" e3="0" e4="0" e5="{h / org_h:.6f}" e6="0"/><hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/></hp:renderingInfo>'
               f'<hp:imgRect><hc:pt0 x="0" y="0"/><hc:pt1 x="{org_w}" y="0"/><hc:pt2 x="{org_w}" y="{org_h}"/><hc:pt3 x="0" y="{org_h}"/></hp:imgRect>'
               f'<hp:imgClip left="0" right="{w_px * 75}" top="0" bottom="{h_px * 75}"/><hp:inMargin left="0" right="0" top="0" bottom="0"/>'
               f'<hp:imgDim dimwidth="{w_px * 75}" dimheight="{h_px * 75}"/><hc:img binaryItemIDRef="{bid}" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/><hp:effects/>'
               f'<hp:sz width="{w}" widthRelTo="ABSOLUTE" height="{h}" heightRelTo="ABSOLUTE" protect="0"/>'
               '<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>'
               '<hp:outMargin left="0" right="0" top="0" bottom="0"/></hp:pic>')
        self.body.append(self._p(f'<hp:run charPrIDRef="1">{pic}<hp:t/></hp:run>', 7, first=not self.body))

    def section_xml(self):
        return f'{XMLH}<hs:sec {NS}>{"".join(self.body)}</hs:sec>'

    def package(self, title: str, made: dt.datetime) -> bytes:
        items = "".join(f'<opf:item id="{b}" href="BinData/{b}.png" media-type="image/png" isEmbeded="1"/>' for b, _ in self.bins)
        hpf = (f'{XMLH}<opf:package {NS} version="" unique-identifier="" id=""><opf:metadata><opf:title>{T(title)}</opf:title><opf:language>ko</opf:language>'
               '<opf:meta name="creator" content="text">Land-XI</opf:meta><opf:meta name="subject" content="text"/><opf:meta name="description" content="text"/>'
               '<opf:meta name="lastsaveby" content="text">Land-XI</opf:meta>'
               f'<opf:meta name="CreatedDate" content="text">{made.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}</opf:meta>'
               f'<opf:meta name="ModifiedDate" content="text">{made.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}</opf:meta>'
               '<opf:meta name="keyword" content="text"/></opf:metadata>'
               f'<opf:manifest><opf:item id="header" href="Contents/header.xml" media-type="application/xml"/>{items}'
               '<opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/><opf:item id="settings" href="settings.xml" media-type="application/xml"/></opf:manifest>'
               '<opf:spine><opf:itemref idref="header" linear="yes"/><opf:itemref idref="section0" linear="yes"/></opf:spine></opf:package>')
        version = (f'{XMLH}<hv:HCFVersion xmlns:hv="http://www.hancom.co.kr/hwpml/2011/version" tagetApplication="WORDPROCESSOR" major="5" minor="1" micro="0" '
                   'buildNumber="1" os="1" xmlVersion="1.4" application="Hancom Office Hangul" appVersion="11, 0, 0, 0 WIN32LEWindows_10"/>')
        container = (f'{XMLH}<ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf"><ocf:rootfiles>'
                     '<ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/>'
                     '<ocf:rootfile full-path="Preview/PrvText.txt" media-type="text/plain"/>'
                     '<ocf:rootfile full-path="META-INF/container.rdf" media-type="application/rdf+xml"/></ocf:rootfiles></ocf:container>')
        P = "http://www.hancom.co.kr/hwpml/2016/meta/pkg#"
        rdf = (f'{XMLH}<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
               f'<rdf:Description rdf:about=""><ns0:hasPart xmlns:ns0="{P}" rdf:resource="Contents/header.xml"/></rdf:Description>'
               f'<rdf:Description rdf:about="Contents/header.xml"><rdf:type rdf:resource="{P}HeaderFile"/></rdf:Description>'
               f'<rdf:Description rdf:about=""><ns0:hasPart xmlns:ns0="{P}" rdf:resource="Contents/section0.xml"/></rdf:Description>'
               f'<rdf:Description rdf:about="Contents/section0.xml"><rdf:type rdf:resource="{P}SectionFile"/></rdf:Description>'
               f'<rdf:Description rdf:about=""><rdf:type rdf:resource="{P}Document"/></rdf:Description></rdf:RDF>')
        manifest = f'{XMLH}<odf:manifest xmlns:odf="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"/>'
        settings = (f'{XMLH}<ha:HWPApplicationSetting xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0">'
                    '<ha:CaretPosition listIDRef="0" paraIDRef="0" pos="0"/></ha:HWPApplicationSetting>')
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as z:
            def put(name, data, store=False):
                zi = zipfile.ZipInfo(name, date_time=made.timetuple()[:6])
                zi.compress_type = zipfile.ZIP_STORED if store else zipfile.ZIP_DEFLATED
                z.writestr(zi, data if isinstance(data, bytes) else data.encode("utf-8"))
            put("mimetype", "application/hwp+zip", store=True)          # 맨 앞 · 압축 없음(형식 규칙)
            put("version.xml", version, store=True)
            put("Contents/header.xml", header_xml(len(self.bins), self.n_tbl))
            for b, data in self.bins:
                put(f"BinData/{b}.png", data, store=True)
            put("Contents/section0.xml", self.section_xml())
            put("Preview/PrvText.txt", "\r\n".join(self.plain)[:1024])
            put("settings.xml", settings)
            put("META-INF/container.rdf", rdf)
            put("Contents/content.hpf", hpf)
            put("META-INF/container.xml", container)
            put("META-INF/manifest.xml", manifest)
        return buf.getvalue()


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
    d.para(f"{title} 보고", 2, 2)
    # 개요 표
    ov = [["지역", region or "—", "업무", means.get("업무", "—")],
          ["비교", means.get("비교", "—"), "만든 날짜", made_t],
          ["자료", " · ".join(spec.get("fuse") or []) or "AI 분석 결과", "작성", "Land-XI XI맵"]]
    d.table(ov, [14, 36, 14, 36], head_rows=0, head_col=False, aligns=["c", "l", "c", "l"])
    _mark_head_cols(d, (0, 2))
    if spec.get("note"):
        d.para(f"※ {spec['note']}", 10, 4)
    sec = 0
    kp = spec.get("kpis") or []
    if kp:
        sec += 1
        d.para(f"{sec}. 주요 숫자", 3, 3)
        heads = [str(k.get("label", "")) for k in kp[:4]]
        vals = [f"{nf(k.get('value'), k.get('d') or 0)}{k.get('unit') or ''}" for k in kp[:4]]
        rows = [heads, vals]
        subs = [str(k.get("sub") or "") for k in kp[:4]]
        if any(subs):
            rows.append(subs)
        d.table(rows, [1] * len(heads), head_rows=1, big_row=1, aligns=["c"] * len(heads))
    say = [_say_clean(x) for x in (spec.get("say") or []) if _say_clean(x)]
    if say or spec.get("live"):
        sec += 1
        d.para(f"{sec}. 해석", 3, 3)
        for s in say:
            d.para(f"○ {s}", 9, 1)
        if spec.get("live"):
            d.para(f"○ 지금 분석 중: {spec['live']}", 9, 1)
    panels = spec.get("panels") or []
    charts = [p for p in panels if p.get("type") in CHART]
    fig_n = 0
    if charts:
        sec += 1
        d.para(f"{sec}. 차트", 3, 3)
        with _MPL_LOCK:
            for p in charts:
                try:
                    r = CHART[p["type"]](p)
                except Exception:                              # 그림 하나가 안 되면 그 그림만 빼고(문서는 낸다)
                    r = None
                if not r:
                    continue
                fig_n += 1
                d.picture(*r)
                cap = f"그림 {fig_n}. {p.get('title', '')}"
                if p.get("unit") and p["type"] not in ("scatter",):
                    cap += f" (단위: {p['unit']})"
                d.para(cap, 8, 8)
                if CHART_NOTE.get(p["type"]):
                    d.body.pop()
                    d.plain.pop()
                    d.para(f"{cap} — {CHART_NOTE[p['type']]}", 8, 8)
    tabs = [p for p in panels if p.get("type") in ("rank", "table")]
    if tabs:
        sec += 1
        d.para(f"{sec}. 표", 3, 3)
        tn = 0
        for p in tabs:
            tn += 1
            unit = p.get("unit") or ""
            d.para(f"표 {tn}. {p.get('title', '')}{f' (단위: {unit})' if unit and p['type'] == 'rank' else ''}", 11, 8)
            if p["type"] == "rank":
                ex = p.get("extra")
                head = ["순위", "이름", "수"] + ([str(ex.get("label", ""))] if ex else [])
                rows = [head]
                for i, r in enumerate(p.get("rows") or []):
                    row = [str(i + 1), str(r.get("label", "")), nf(r.get("v"))]
                    if ex:
                        row.append(nf(r.get(ex.get("key")), 1) if r.get(ex.get("key")) is not None else "—")
                    rows.append(row)
                d.table(rows, [8, 36, 28, 28][:len(head)], aligns=["c", "l", "r", "r"][:len(head)])
            else:
                num = set(p.get("num") or [])
                rows = [[str(c) for c in p.get("cols") or []]] + [[_table_cell(c, i) for i, c in enumerate(r)] for r in p.get("rows") or []]
                n = len(rows[0]) or 1
                d.table(rows, [1] * n, aligns=["r" if i in num else "l" for i in range(n)])
            d.para("", 10, 4)
    # 출처 · 만든 날짜
    src = " · ".join(spec.get("fuse") or []) or "AI 분석 결과"
    d.para(f"출처: Land-XI XI맵 융합 대시보드({src}) · 숫자는 대시보드 화면과 같은 값입니다.", 10, 4)
    d.para(f"만든 날짜: {made_t}", 4, 4)
    name = re.sub(r"[\\/:*?\"<>|\s—·]+", "_", f"{title}_보고서_{made.replace('. ', '').rstrip('.')}").strip("_") + ".hwpx"
    return d.package(title + " 보고", now), name


def _mark_head_cols(d: Doc, cols: tuple[int, ...]):
    """개요 표 — 지정한 칸(이름 칸)만 머리 칸 모양으로(바탕 회색 · 굵게)."""
    t = d.body[-1]
    for c in cols:
        t = re.sub(rf'(<hp:tc [^>]*?borderFillIDRef=")3(">(?:(?!</hp:tc>).)*?<hp:cellAddr colAddr="{c}")', r"\g<1>4\2", t, flags=re.S)
    t = re.sub(r'(borderFillIDRef="4">(?:(?!</hp:tc>).)*?)<hp:run charPrIDRef="5">', r'\1<hp:run charPrIDRef="6">', t, flags=re.S)
    d.body[-1] = t


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
    return Response(blob, media_type="application/hwp+zip",
                    headers={"content-disposition": f"attachment; filename=\"report.hwpx\"; filename*=UTF-8''{quote(name)}", "cache-control": "no-store"})
