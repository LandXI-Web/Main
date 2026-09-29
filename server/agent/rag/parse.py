"""법령 원문 → 조·항 단위 조각(chunk).

입력 형식(관리자 화면에서 올린 파일 그대로):
- 국가법령정보센터 법령 본문 XML(`<법령>` · 조문단위/항/호)
- 국가법령정보센터 행정규칙 XML(`<AdmRulService>` · 조문형식이 아니면 번호 제목 단위)
- HTML(본문 글자만 뽑아 텍스트 규칙으로)
- 텍스트(`제n조(제목)` · ①② 항 · 첫 줄 = 법령 이름 · `[시행 2026. 9. 18.]`)

조각 = {id, act, kind, article, article_title, para, effective, text, file}
- article: '제34조' · '제34조의2' · 행정규칙 비조문형은 'Ⅰ-1'(장-번호)
- para: '①' 또는 None(항 없는 조)
- effective: 'YYYY-MM-DD'(조문 시행일 · 없으면 법령 시행일)
- text: 원문 그대로(항 본문 + 그 항의 호·목). 조문 제목 줄은 article_title 로.
지어낸 글자는 넣지 않는다 — 파싱이 안 되는 파일은 조각 0 으로 돌려주고 사유를 남긴다.
"""
from __future__ import annotations

import html as _html
import re
import xml.etree.ElementTree as ET

CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳"
ROMAN = "ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ"


class ParseError(Exception):
    pass


def _d(s: str | None) -> str | None:
    s = re.sub(r"\D", "", s or "")
    return f"{s[:4]}-{s[4:6]}-{s[6:8]}" if len(s) == 8 else None


def _t(el, tag: str) -> str:
    x = el.find(tag)
    return (x.text or "").strip() if x is not None and x.text else ""


def _clean(s: str) -> str:
    s = s.replace("\r", "")
    s = re.sub(r"[ \t　]+", " ", s)
    return "\n".join(x.strip() for x in s.split("\n") if x.strip())


def _slug(act: str) -> str:
    return re.sub(r"[^0-9A-Za-z가-힣]+", "", act)[:40] or "law"


def _chunk(act, kind, article, title, para, eff, text, file, order) -> dict:
    cid = f"{_slug(act)}:{article}:{para or '-'}"
    return {"id": cid, "act": act, "kind": kind, "article": article, "article_title": title or None, "para": para,
            "effective": eff, "text": _clean(text), "file": file, "order": order}


# ── 법령 XML ─────────────────────────────────────────────────────────────
def parse_law_xml(root, file: str) -> tuple[dict, list[dict]]:
    info = root.find("기본정보")
    if info is None:
        raise ParseError("법령 기본정보가 없습니다")
    act = _t(info, "법령명_한글")
    kind = _t(info, "법종구분") or "법령"
    eff_law = _d(_t(info, "시행일자"))
    out: list[dict] = []
    jo_root = root.find("조문")
    for u in (jo_root.findall("조문단위") if jo_root is not None else []):
        if _t(u, "조문여부") != "조문":
            continue                                          # 장·절 제목 줄
        no = _t(u, "조문번호")
        br = _t(u, "조문가지번호")
        article = f"제{no}조" + (f"의{br}" if br else "")
        title = _t(u, "조문제목")
        eff = _d(_t(u, "조문시행일자")) or eff_law
        head = _t(u, "조문내용")
        hangs = u.findall("항")
        if not hangs:
            body = [head] + [_t(h, "호내용") for h in u.findall(".//호")]
            txt = "\n".join(x for x in body if x)
            if re.search(r"삭제\s*<", txt) and len(txt) < 40:
                continue
            out.append(_chunk(act, kind, article, title, None, eff, txt, file, len(out)))
            continue
        for h in hangs:
            pno = _t(h, "항번호")
            para = pno if pno and pno[0] in CIRCLED else None
            lines = [_t(h, "항내용")]
            for ho in h.findall("호"):
                lines.append(_t(ho, "호내용"))
                for mok in ho.findall("목"):
                    lines.append(_t(mok, "목내용"))
            txt = "\n".join(x for x in lines if x)
            if para is None:
                txt = (head + "\n" + txt).strip()
            if not txt or (re.fullmatch(r"[①-⑳]?\s*삭제\s*<[^>]*>", txt.strip())):
                continue
            out.append(_chunk(act, kind, article, title, para, eff, txt, file, len(out)))
    return {"act": act, "kind": kind, "effective": eff_law, "file": file}, out


# ── 행정규칙 XML ─────────────────────────────────────────────────────────
def parse_admrul_xml(root, file: str) -> tuple[dict, list[dict]]:
    info = root.find("행정규칙기본정보")
    if info is None:
        raise ParseError("행정규칙 기본정보가 없습니다")
    act = _t(info, "행정규칙명")
    kind = _t(info, "행정규칙종류") or "행정규칙"
    eff = _d(_t(info, "시행일자")) or _d(_t(info, "발령일자"))
    bodies = [(x.text or "") for x in root.iter("조문내용")]
    text = "\n".join(bodies)
    meta = {"act": act, "kind": kind, "effective": eff, "file": file}
    if re.search(r"^\s*제\d+조", text, re.M):
        _, chunks = parse_text(text, file, act=act, effective=eff, kind=kind)
        return meta, chunks
    return meta, _sections(text, act, kind, eff, file)


def _sections(text: str, act, kind, eff, file) -> list[dict]:
    """비조문형 요령: 'Ⅰ. 총칙' 장 · '1. 목 적' 번호 절 단위."""
    out, chap, sec, title, buf = [], "", None, "", []
    skip = False                                          # 부칙(시행일·재검토기한)은 조각으로 두지 않는다

    def flush():
        if sec is not None and buf and not skip:
            art = f"{chap}-{sec}" if chap else f"{sec}"
            out.append(_chunk(act, kind, art, title, None, eff, "\n".join(buf), file, len(out)))

    for line in text.replace("\r", "").split("\n"):
        s = line.strip()
        if not s:
            continue
        if re.match(r"^부\s*칙", s):
            flush()
            skip, sec, buf = True, None, []
            continue
        m = re.match(rf"^([{ROMAN}])\s*[.．]\s*(.+)$", s)
        if m:
            flush()
            chap, sec, title, buf, skip = m.group(1), None, "", [], False
            continue
        m = re.match(r"^(\d{1,2})\s*[.．]\s*(\S.{0,40})$", s)
        # 새 절 = 앞 절 번호 + 1(장 첫머리는 1) — 절 안의 '1. 2. …' 목록은 본문으로 둔다
        if m and not skip and int(m.group(1)) == (int(sec) + 1 if sec and sec.isdigit() else 1):
            flush()
            t = m.group(2).strip()
            sec, title, buf = m.group(1), re.sub(r"\s+", "", t) if len(t) < 16 else t, [s]
            continue
        if skip:
            continue
        if sec is None:
            sec, title, buf = "0", "머리말", []
        buf.append(s)
    flush()
    return out


# ── 텍스트 · HTML ────────────────────────────────────────────────────────
ART_RE = re.compile(r"^\s*제\s*(\d+)\s*조(?:\s*의\s*(\d+))?\s*(?:\(([^)]{1,60})\))?")
EFF_RE = re.compile(r"\[?\s*시행\s*(?:일)?\s*[:：]?\s*(\d{4})\s*[.\-]\s*(\d{1,2})\s*[.\-]\s*(\d{1,2})")


def parse_text(text: str, file: str, act: str | None = None, effective: str | None = None, kind: str = "법령") -> tuple[dict, list[dict]]:
    lines = [x.strip() for x in text.replace("\r", "").split("\n")]
    lines = [x for x in lines if x]
    if not act:
        for x in lines[:5]:
            if not EFF_RE.search(x) and not ART_RE.match(x) and len(x) <= 60:
                act = re.sub(r"\s*\(약칭[^)]*\)", "", x).strip()
                break
    if not act:
        raise ParseError("법령 이름을 찾지 못했습니다(첫 줄에 법령 이름)")
    if not effective:
        m = EFF_RE.search("\n".join(lines[:8]))
        effective = f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}" if m else None
    out: list[dict] = []
    art = title = None
    body: list[str] = []

    def flush():
        if not art or not body:
            return
        joined = "\n".join(body)
        parts = re.split(rf"(?=[{CIRCLED}])", joined)
        head = parts[0].strip()
        paras = [p.strip() for p in parts[1:] if p.strip()]
        if not paras:
            out.append(_chunk(act, kind, art, title, None, effective, head, file, len(out)))
            return
        for p in paras:
            if re.fullmatch(r"[①-⑳]\s*삭제\s*<[^>]*>", p):
                continue
            out.append(_chunk(act, kind, art, title, p[0], effective, p, file, len(out)))

    for x in lines:
        m = ART_RE.match(x)
        if m and (m.group(3) or len(x) < 120):
            flush()
            art = f"제{m.group(1)}조" + (f"의{m.group(2)}" if m.group(2) else "")
            title = m.group(3)
            body = [x]
            continue
        if art:
            body.append(x)
    flush()
    return {"act": act, "kind": kind, "effective": effective, "file": file}, out


def html_to_text(b: str) -> str:
    b = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", b)
    b = re.sub(r"(?i)<br\s*/?>|</(p|div|li|tr|h\d)>", "\n", b)
    b = re.sub(r"<[^>]+>", " ", b)
    return _html.unescape(b)


def decode(raw: bytes) -> str:
    for enc in ("utf-8-sig", "cp949", "euc-kr"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", "replace")


def parse_file(name: str, raw: bytes) -> tuple[dict, list[dict]]:
    """파일 하나 → (법령 정보, 조각). 형식은 내용으로 판단한다."""
    txt = decode(raw)
    head = txt.lstrip()[:400]
    if head.startswith("<?xml") or head.startswith("<법령") or head.startswith("<AdmRulService"):
        try:
            root = ET.fromstring(raw)
        except ET.ParseError as e:
            raise ParseError(f"XML 을 읽지 못했습니다({e})")
        if root.tag == "법령":
            return parse_law_xml(root, name)
        if root.tag == "AdmRulService":
            return parse_admrul_xml(root, name)
        raise ParseError("국가법령정보센터 법령·행정규칙 XML 이 아닙니다")
    if re.search(r"(?i)<html|<body|<div", head):
        return parse_text(html_to_text(txt), name)
    return parse_text(txt, name)
