"""한글 문서(HWPX · OWPML · KS X 6101) 공용 짓기 — Land-XI 가 내려주는 모든 문서(10-14 사용자 · 원칙 247 · 250).

"모든 문서는 .docx 가 아니라 .hwp 로 한다" → 형식은 .hwpx("hwpx 로 충분"). 쓰는 곳:
  XI맵 대시보드 '보고서로'(xreport) · 기관 'AI 분석 결과 보고서'(gov_report) · 실태조사 보고서 초안(survey.report) ·
  XI ChatGEO 보고서 초안 · 보고서 작성기 내보내기(agent.report · agent.tools.ext.mapsvc) · 기관 보고서 화면 내려받기(xreport /report/screen.hwpx).
같은 서식: A4 · 좌우 25mm · 함초롬바탕(본문) / 함초롬돋움(제목 · 표) · 제목 · 개요 표 · 장 제목 · 그림 n. · 표 n. · 출처 · 만든 날짜.
한컴 자동화(COM)는 쓰지 않는다(보안 승인 창이 뜨면 서버가 멈춤 · README impl-32) — zip + XML 을 여기서 직접 짓는다. 표준 라이브러리만.
문서에 넣지 않는 것(부르는 쪽 책임): 작업 id · 파일 경로 · 시군구/읍면동 코드 · 내부 규칙 이름 · 내부 지표.
"""
from __future__ import annotations

import datetime as dt
import io
import re
import zipfile
from xml.etree import ElementTree as ET
from xml.sax.saxutils import escape

MEDIA = "application/hwp+zip"
EXT = ".hwpx"

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

_CTRL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")


def T(s) -> str:
    return escape(_CTRL.sub("", str(s if s is not None else "")))


def safe_name(stem: str) -> str:
    """파일 이름 — 경로 글자 · 빈칸 · 가운뎃점은 '_'(화면 · 문서 이름과 같은 규칙) + .hwpx."""
    return re.sub(r"[\\/:*?\"<>|\s—·]+", "_", str(stem or "보고서")).strip("_")[:120] + EXT


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


# 테두리: 1 없음 · 2 없음(글자용) · 3 표 칸 · 4 표 머리 칸(회색 바탕) · 5 큰 숫자 칸 · 6 제목 아래 선 · 7 알림 상자(옅은 주황) · 8 합계 줄
B_CELL, B_HEAD, B_BIG, B_NOTICE, B_TOTAL = 3, 4, 5, 7, 8
BORDERS = [_bf(1), _bf(2), _bf(3, "#C9CED6"), _bf(4, "#C9CED6", "#EEF1F4"), _bf(5, "#C9CED6", "#F7F8FA"), _bf(6, "#191F28", None, ("bottom",)),
           _bf(7, "#F2C59B", "#FFF4E5"), _bf(8, "#C9CED6", "#F2F4F6")]

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
    (900, 1, True, "#4E5968"),     # 8 그림 · 표 번호
    (800, 1, False, "#191F28"),    # 9 표 글(작게 — 칸이 많은 표)
    (800, 1, True, "#333D4B"),     # 10 표 머리(작게)
    (1100, 1, True, "#9A3412"),    # 11 알림 상자 굵게
    (850, 1, False, "#7C2D12"),    # 12 알림 상자 설명
    (1050, 0, True, "#191F28"),    # 13 본문 굵게
]
C_BODY, C_TITLE, C_H, C_SMALL, C_CELL, C_HEAD, C_BIG, C_CAP, C_CELL_S, C_HEAD_S, C_NOTE_B, C_NOTE, C_BOLD = 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13


def _charpr(i, h, font, bold, color):
    ref = " ".join(f'{a}="{font}"' for a in ("hangul", "latin", "hanja", "japanese", "other", "symbol", "user"))
    same = lambda v: " ".join(f'{a}="{v}"' for a in ("hangul", "latin", "hanja", "japanese", "other", "symbol", "user"))  # noqa: E731
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
    ("RIGHT", 130, 0, 0, 0, False),       # 12 표 칸 오른쪽(숫자)
    ("CENTER", 130, 0, 400, 0, False),    # 13 부제(제목 아래 한 줄)
]
P_BODY, P_TITLE, P_H, P_RIGHT, P_CC, P_CL, P_PIC, P_CAP, P_ITEM, P_SMALL, P_TCAP, P_CR, P_SUB = 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13


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


def header_xml() -> str:
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


def _png_of(data: bytes) -> tuple[bytes, int, int]:
    """그림 → (PNG, 폭, 높이). PNG 가 아니면 PNG 로 바꾼다(문서 목록은 image/png 한 가지)."""
    from PIL import Image
    im = Image.open(io.BytesIO(data))
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        b = io.BytesIO()
        im.convert("RGBA" if im.mode in ("RGBA", "LA", "P") else "RGB").save(b, format="PNG")
        data = b.getvalue()
    return data, im.size[0], im.size[1]


def auto_widths(rows: list[list[str]], lo=4, hi=24) -> list[int]:
    """칸 폭 비율 — 칸마다 가장 긴 글(한글 1 · 숫자 · 영문 0.55)에 맞춘다(글자 중간 끊김을 줄인다 · 원칙 9 줄바꿈)."""
    def w(t):
        return sum(1.0 if ord(ch) > 0x2E80 else 0.55 for ch in str(t))
    n = max(len(r) for r in rows)
    return [max(lo, min(hi, round(max(w(r[i]) if i < len(r) else 0 for r in rows) + 1.5))) for i in range(n)]


class Doc:
    """문서 한 벌 — 문단 · 표 · 그림을 차례로 쌓고 package() 로 .hwpx 바이트를 낸다."""

    def __init__(self):
        self.body: list[str] = []
        self.bins: list[tuple[str, bytes]] = []
        self.n_tbl = 0          # 표 번호(표 n.)
        self.n_fig = 0          # 그림 번호(그림 n.)
        self.n_h = 0            # 장 번호(1. 2. …)
        self.plain: list[str] = []
        self._id = 1000

    def nid(self):
        self._id += 1
        return self._id

    @staticmethod
    def _p(inner, para=P_BODY, first=False):
        sec = '<hp:run charPrIDRef="0">' + SEC_PR + '</hp:run>' if first else ''
        return (f'<hp:p id="0" paraPrIDRef="{para}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">'
                f'{sec}{inner}</hp:p>')

    @staticmethod
    def _run(text, char=C_BODY):
        return f'<hp:run charPrIDRef="{char}"><hp:t>{T(text)}</hp:t></hp:run>'

    # ── 글 ──
    def para(self, text, para=P_BODY, char=C_BODY, runs=None):
        inner = "".join(self._run(t, c) for t, c in runs) if runs else self._run(text, char)
        self.body.append(self._p(inner, para, first=not self.body))
        self.plain.append("".join(t for t, _ in runs) if runs else str(text))

    def title(self, text, sub: str | None = None):
        self.para(text, P_TITLE, C_TITLE)
        if sub:
            self.para(sub, P_SUB, C_SMALL)

    def heading(self, text, number=True):
        """장 제목 — number=True 면 '1. ' '2. ' 차례 번호를 붙인다."""
        if number:
            self.n_h += 1
            text = f"{self.n_h}. {text}"
        self.para(text, P_H, C_H)

    def body_text(self, text):
        self.para(text, P_BODY, C_BODY)

    def item(self, text, mark="○"):
        self.para(f"{mark} {text}" if mark else text, P_ITEM, C_BODY)

    def small(self, text):
        self.para(text, P_SMALL, C_SMALL)

    def blank(self):
        self.para("", P_SMALL, C_SMALL)

    # ── 표 ──
    def table(self, rows: list[list], widths: list[int], head_rows=1, head_cols=(), aligns=None, big_row=None,
              total_row=False, small=False, caption: str | None = None):
        """rows[r][c] = 글자 · widths = 칸 폭 비율 · head_rows = 머리 줄 수 · head_cols = 머리처럼 칠할 칸(개요 표의 이름 칸) ·
        aligns = 칸별 'l' · 'c' · 'r' · big_row = 큰 숫자 줄 · total_row = 마지막 줄 합계(회색) · caption = '표 n. …'(표 위)."""
        rows = [[("—" if c is None else str(c)) for c in r] for r in rows if r]
        if not rows:
            return
        n = max(len(r) for r in rows)
        rows = [r + [""] * (n - len(r)) for r in rows]
        widths = auto_widths(rows) if not widths else (list(widths) + [widths[-1]] * n)[:n]
        if caption:
            self.n_tbl += 1
            self.para(f"표 {self.n_tbl}. {caption}", P_TCAP, C_CAP)
        tot = sum(widths) or 1
        ws = [int(TEXT_W * w / tot) for w in widths]
        ws[-1] = TEXT_W - sum(ws[:-1])
        H = 1500 if small else 1700
        hc = set(head_cols or ())
        trs = []
        for ri, r in enumerate(rows):
            tcs = []
            last = total_row and ri == len(rows) - 1 and ri >= head_rows
            for ci, c in enumerate(r):
                head = ri < head_rows or ci in hc
                big = big_row is not None and ri == big_row
                bf = B_HEAD if head else (B_BIG if big else (B_TOTAL if last else B_CELL))
                char = (C_HEAD_S if small else C_HEAD) if (head or last) else (C_BIG if big else (C_CELL_S if small else C_CELL))
                a = (aligns[ci] if aligns and ci < len(aligns) else "l")
                al = P_CC if (ri < head_rows or big or a == "c") else (P_CR if a == "r" else P_CL)
                tcs.append(f'<hp:tc name="" header="{1 if ri < head_rows else 0}" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="{bf}">'
                           '<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">'
                           f'{self._p(self._run(c, char), al)}</hp:subList><hp:cellAddr colAddr="{ci}" rowAddr="{ri}"/><hp:cellSpan colSpan="1" rowSpan="1"/>'
                           f'<hp:cellSz width="{ws[ci]}" height="{2400 if big else H}"/><hp:cellMargin left="{340 if small else 510}" right="{340 if small else 510}" top="141" bottom="141"/></hp:tc>')
            trs.append(f'<hp:tr>{"".join(tcs)}</hp:tr>')
        th = sum(2400 if (big_row is not None and i == big_row) else H for i in range(len(rows)))
        tbl = (f'<hp:tbl id="{self.nid()}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" '
               f'repeatHeader="{1 if head_rows else 0}" rowCnt="{len(rows)}" colCnt="{n}" cellSpacing="0" borderFillIDRef="{B_CELL}" noAdjust="0">'
               f'<hp:sz width="{TEXT_W}" widthRelTo="ABSOLUTE" height="{th}" heightRelTo="ABSOLUTE" protect="0"/>'
               '<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>'
               '<hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:inMargin left="510" right="510" top="141" bottom="141"/>'
               f'{"".join(trs)}</hp:tbl>')
        self.body.append(self._p(f'<hp:run charPrIDRef="{C_BODY}">{tbl}<hp:t/></hp:run>', P_BODY, first=not self.body))
        self.plain.extend(" | ".join(r) for r in rows)

    def overview(self, pairs: list[tuple[str, str]], cols: int = 2):
        """개요 표 — (이름, 값) 쌍을 한 줄에 cols 쌍씩. 이름 칸은 회색 머리 칸."""
        pairs = [(k, "—" if v in (None, "") else v) for k, v in pairs if k]
        if not pairs:
            return
        rows = []
        for i in range(0, len(pairs), cols):
            r = []
            for k, v in pairs[i:i + cols]:
                r += [k, v]
            r += [""] * (2 * cols - len(r))
            rows.append(r)
        self.table(rows, [18, 32] * cols if cols > 1 else [24, 76], head_rows=0, head_cols=tuple(range(0, 2 * cols, 2)), aligns=["c", "l"] * cols)

    def notice(self, text, sub: str | None = None):
        """알림 상자(옅은 주황 · 가운데) — 'AI 추론 · 검수 전 · 위법 판정 아님' 같은 고정 문구."""
        inner = self._p(self._run(text, C_NOTE_B), P_CC) + (self._p(self._run(sub, C_NOTE), P_CC) if sub else "")
        h = 1700 + (1300 if sub else 0)
        tbl = (f'<hp:tbl id="{self.nid()}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" '
               f'repeatHeader="0" rowCnt="1" colCnt="1" cellSpacing="0" borderFillIDRef="{B_NOTICE}" noAdjust="0">'
               f'<hp:sz width="{TEXT_W}" widthRelTo="ABSOLUTE" height="{h}" heightRelTo="ABSOLUTE" protect="0"/>'
               '<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>'
               '<hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:inMargin left="510" right="510" top="141" bottom="141"/>'
               f'<hp:tr><hp:tc name="" header="0" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="{B_NOTICE}">'
               '<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">'
               f'{inner}</hp:subList><hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/>'
               f'<hp:cellSz width="{TEXT_W}" height="{h}"/><hp:cellMargin left="850" right="850" top="400" bottom="400"/></hp:tc></hp:tr></hp:tbl>')
        self.body.append(self._p(f'<hp:run charPrIDRef="{C_BODY}">{tbl}<hp:t/></hp:run>', P_BODY, first=not self.body))
        self.plain.append(text + (f" {sub}" if sub else ""))

    # ── 그림 ──
    def picture(self, png: bytes, w_px: int, h_px: int, max_w=TEXT_W, dpi=150):
        k = len(self.bins) + 1
        bid = f"image{k}"
        self.bins.append((bid, png))
        w = max_w
        h = int(w * h_px / max(1, w_px))
        if h > 52000:                                      # 아주 긴 그림은 높이를 줄인다(쪽 안에)
            h = 52000
            w = int(h * w_px / max(1, h_px))
        org_w, org_h = int(w_px * 7200 / dpi), int(h_px * 7200 / dpi)
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
        self.body.append(self._p(f'<hp:run charPrIDRef="{C_BODY}">{pic}<hp:t/></hp:run>', P_PIC, first=not self.body))

    def figure(self, img: bytes | None, caption: str, note: str | None = None, max_w=TEXT_W):
        """그림 + '그림 n. 제목'(— 읽는 법). 그림이 없으면 아무것도 넣지 않는다."""
        if not img:
            return False
        try:
            png, w, h = _png_of(img)
        except Exception:  # noqa: BLE001
            return False
        self.picture(png, w, h, max_w=max_w)
        self.n_fig += 1
        self.para(f"그림 {self.n_fig}. {caption}" + (f" — {note}" if note else ""), P_CAP, C_CAP)
        return True

    def source(self, src: str, made: str):
        """끝 두 줄 — 출처 · 만든 날짜(모든 문서 같은 자리)."""
        self.blank()
        if src:
            self.small(f"출처: {src}")
        self.para(f"만든 날짜: {made}", P_RIGHT, C_SMALL)

    # ── 꾸러미 ──
    def section_xml(self):
        return f'{XMLH}<hs:sec {NS}>{"".join(self.body)}</hs:sec>'

    def package(self, title: str, made: dt.datetime | None = None, author: str = "Land-XI") -> bytes:
        made = made or dt.datetime.now(dt.timezone(dt.timedelta(hours=9)))
        if made.tzinfo is None:
            made = made.replace(tzinfo=dt.timezone(dt.timedelta(hours=9)))
        if not self.body:
            self.para("")
        items = "".join(f'<opf:item id="{b}" href="BinData/{b}.png" media-type="image/png" isEmbeded="1"/>' for b, _ in self.bins)
        utc = made.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        hpf = (f'{XMLH}<opf:package {NS} version="" unique-identifier="" id=""><opf:metadata><opf:title>{T(title)}</opf:title><opf:language>ko</opf:language>'
               f'<opf:meta name="creator" content="text">{T(author)}</opf:meta><opf:meta name="subject" content="text"/><opf:meta name="description" content="text"/>'
               f'<opf:meta name="lastsaveby" content="text">{T(author)}</opf:meta>'
               f'<opf:meta name="CreatedDate" content="text">{utc}</opf:meta><opf:meta name="ModifiedDate" content="text">{utc}</opf:meta>'
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
        zt = made.timetuple()[:6]
        with zipfile.ZipFile(buf, "w") as z:
            def put(name, data, store=False):
                zi = zipfile.ZipInfo(name, date_time=zt)
                zi.compress_type = zipfile.ZIP_STORED if store else zipfile.ZIP_DEFLATED
                z.writestr(zi, data if isinstance(data, bytes) else data.encode("utf-8"))
            put("mimetype", MEDIA, store=True)          # 맨 앞 · 압축 없음(형식 규칙)
            put("version.xml", version, store=True)
            put("Contents/header.xml", header_xml())
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


# ── 읽기(시험 · 점검) ──────────────────────────────────────────────────────────────
HP = "{http://www.hancom.co.kr/hwpml/2011/paragraph}"
NEED = ["mimetype", "version.xml", "Contents/header.xml", "Contents/section0.xml", "Contents/content.hpf",
        "META-INF/container.xml", "META-INF/manifest.xml", "META-INF/container.rdf", "settings.xml"]


def text_of(blob: bytes) -> str:
    """.hwpx 안 글자 전부(본문 · 표 칸) — 줄마다 한 문단."""
    z = zipfile.ZipFile(io.BytesIO(blob))
    root = ET.fromstring(z.read("Contents/section0.xml"))
    out = []
    for p in root.iter(HP + "p"):
        s = "".join((t.text or "") for r in p.findall(HP + "run") for t in r.findall(HP + "t"))
        if s:
            out.append(s)
    return "\n".join(out)


def check(blob: bytes) -> list[str]:
    """형식 점검 — 고칠 것 목록(빈 목록 = 정상): mimetype 첫 항목 · 압축 없음 · 필수 파일 · XML 읽힘 · 그림 PNG · 머리에 있는 모양만 부름."""
    bad = []
    z = zipfile.ZipFile(io.BytesIO(blob))
    f = {n: z.read(n) for n in z.namelist()}
    first = z.infolist()[0]
    if not (first.filename == "mimetype" and first.compress_type == zipfile.ZIP_STORED and f.get("mimetype") == MEDIA.encode()):
        bad.append("mimetype 이 첫 항목 · 압축 없음이 아님")
    bad += [f"빠진 파일 {n}" for n in NEED if n not in f]
    for n, b in f.items():
        if n.endswith((".xml", ".hpf", ".rdf")):
            try:
                ET.fromstring(b)
            except ET.ParseError as e:
                bad.append(f"XML 오류 {n}: {e}")
    hpf = f.get("Contents/content.hpf", b"").decode("utf-8", "replace")
    for href in re.findall(r'href="([^"]+)"', hpf):
        if href not in f:
            bad.append(f"목록에 있는데 없음 {href}")
    for n in f:
        if n.startswith("BinData/") and f[n][:8] != b"\x89PNG\r\n\x1a\n":
            bad.append(f"PNG 아님 {n}")
    if "Contents/header.xml" in f and "Contents/section0.xml" in f:
        HH = "{http://www.hancom.co.kr/hwpml/2011/head}"
        head = ET.fromstring(f["Contents/header.xml"])
        ids = {k: {e.get("id") for e in head.iter(HH + k)} for k in ("charPr", "paraPr", "borderFill")}
        sec = f["Contents/section0.xml"].decode()
        for k, attr in (("charPr", "charPrIDRef"), ("paraPr", "paraPrIDRef"), ("borderFill", "borderFillIDRef")):
            miss = set(re.findall(rf'{attr}="(\d+)"', sec)) - ids[k]
            if miss:
                bad.append(f"머리에 없는 {k} {sorted(miss)}")
    return bad
