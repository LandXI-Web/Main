"""바퀴 22 P8b — now21 넣음 제안(10-22 · CYCLE22-PLAN P8) · 기관 세션 · 관할 · 받은 서비스 범위(공간과 같은 판정).

  [제안-보고서틀이름 '보고서에 이름 붙인 틀']
  GET  /api/v1/spaces/me/report/templates                     내 보고서 틀(사람마다 · 최근 쓴 순) — 이름 · 넣은 결과 · 대장 · 범위
  POST /api/v1/spaces/me/report/templates                     {name, cards[], emd?, import_id?} 지금 고른 것을 이름 붙여 둔다(같은 이름이면 바꿔 씀 · 한 사람 20개)
  POST /api/v1/spaces/me/report/templates/{id}/use            고른 순간(최근 쓴 순 정렬)
  POST /api/v1/spaces/me/report/templates/{id}/remove         지움

  [제안-보고서인쇄PDF '보고서 인쇄 · PDF'] 인쇄는 화면(인쇄 모양 CSS) · PDF 는 서버가 한글 문서와 같은 고르기 · 같은 숫자로 짓는다.
  GET  /api/v1/spaces/me/report/multi.pdf?cards=&emd=&import_id=   → 발급 목록에 한 줄(같은 사람 · 같은 고르기면 횟수 +1)

  [제안-hwpx한장요약 '기관 한글(.hwpx) 요약 한 장'] 팀장 · 과장 보고용 — 개요 · 큰 숫자 · 종류별 · 읍면동 다섯 · 작은 지도 한 장(A4 한 쪽)
  GET  /api/v1/spaces/me/report/one.hwpx?cards=&emd=&import_id=

  [제안-메모되돌리기 '같은 메모 한꺼번에 쓴 것을 한 단추로 되돌리기'] 줄을 지우지 않고 되돌린 표시만(지금 메모 · 이력 · 엑셀에서 빠짐)
  POST /api/v1/spaces/me/guides/{card}/parcels/notes/undo     {batch} — 쓴 사람 또는 기관 관리자
  GET  /api/v1/spaces/me/guides/{card}/parcels/notes/last     내가 하루 안에 여러 필지에 한꺼번에 남긴 마지막 묶음(되돌리기 단추 자리)

  [제안-기관공지쓰기 '기관 관리자가 직접 쓰는 공지'] 그 기관 사용자에게만(LX 공지와 따로 · 내리기 = 지우지 않음)
  GET  /api/v1/spaces/me/notices?limit=                       → {items, can_write}
  POST /api/v1/spaces/me/notices                              (기관 관리자) {title, body?, pinned?}
  POST /api/v1/spaces/me/notices/{id}/remove                  (기관 관리자)
숫자 한 출처: 보고서 PDF · 요약 한 장은 farm_more.multi_data(보고서 탭 · 한글 문서 · 엑셀과 같은 행). 지역 이름 · 코드를 코드에 두지 않는다.
"""
from __future__ import annotations

import datetime as dt
import html
import io
import os
import re
import secrets
from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, Request
from fastapi.responses import Response
from starlette.concurrency import run_in_threadpool

from .deps import ApiError, Principal, audit, db
from .envelope import KST, env, now_iso

router = APIRouter()
CARD_RE = re.compile(r"^card-[a-z0-9-]{2,40}$")
IMP_RE = re.compile(r"^imp_[0-9A-Z]{10,40}$")
NAME_MAX, TPL_KEEP = 40, 20
TITLE_MAX, BODY_MAX = 80, 2000


def _me(request: Request) -> Principal:
    from .spaces import _me as me
    return me(request)


def _clean(v, n: int) -> str:
    return " ".join(re.sub(r"[\x00-\x1f\x7f<>]", "", str(v or "")).split())[:n]


def _iso(v) -> str | None:
    return v.astimezone(KST).isoformat(timespec="minutes") if v else None


# ── 보고서 틀 ─────────────────────────────────────────────────────────────
def _tpl(r) -> dict:
    return {"id": r["id"], "name": r["name"], "cards": list(r["cards"] or []), "emd": r["emd"], "import_id": r["import_id"],
            "created_at": _iso(r["created_at"]), "used_at": _iso(r["used_at"])}


@router.get("/spaces/me/report/templates")
async def tpl_list(request: Request):
    p = _me(request)
    async with db(p) as c:
        rows = await c.fetch("SELECT * FROM report_templates WHERE tenant_id=$1 AND user_id=$2 ORDER BY coalesce(used_at, created_at) DESC LIMIT $3",
                             p.tenant_id, p.user_id or "", TPL_KEEP)
    return {"items": [_tpl(r) for r in rows], "max": env(TPL_KEEP, "count", "recorded", "한 사람 보고서 틀 상한"), "as_of": now_iso()}


@router.post("/spaces/me/report/templates", status_code=201)
async def tpl_save(request: Request, body: dict | None = None):
    p = _me(request)
    b = body or {}
    name = _clean(b.get("name"), NAME_MAX)
    if len(name) < 2:
        raise ApiError("bad_request", "틀 이름을 두 글자 이상 적어 주세요", {"field": "name"})
    cards = list(dict.fromkeys(str(x) for x in (b.get("cards") or []) if CARD_RE.match(str(x))))[:8]
    if not cards:
        raise ApiError("bad_request", "넣을 결과를 하나 이상 골라 주세요", {"field": "cards"})
    emd = _clean(b.get("emd"), 40) or None
    imp = str(b.get("import_id") or "").strip() or None
    if imp and not IMP_RE.match(imp):
        raise ApiError("bad_request", "대장을 다시 골라 주세요", {"field": "import_id"})
    from .farm_more import _avail
    ok = {s["card"] for s in await _avail(p)}
    if not set(cards) & ok:
        raise ApiError("not_found", "고른 결과를 보고서로 만들 수 없습니다")
    cards = [x for x in cards if x in ok]
    async with db(p) as c:
        old = await c.fetchrow("SELECT id FROM report_templates WHERE tenant_id=$1 AND user_id=$2 AND name=$3", p.tenant_id, p.user_id or "", name)
        if not old:
            n = await c.fetchval("SELECT count(*) FROM report_templates WHERE tenant_id=$1 AND user_id=$2", p.tenant_id, p.user_id or "")
            if int(n or 0) >= TPL_KEEP:
                raise ApiError("bad_request", f"보고서 틀은 {TPL_KEEP}개까지입니다 — 쓰지 않는 틀을 지워 주세요")
        r = await c.fetchrow(
            "INSERT INTO report_templates(id, tenant_id, user_id, name, cards, emd, import_id, used_at) VALUES ($1,$2,$3,$4,$5,$6,$7,now()) "
            "ON CONFLICT (tenant_id, user_id, name) DO UPDATE SET cards=EXCLUDED.cards, emd=EXCLUDED.emd, import_id=EXCLUDED.import_id, used_at=now() RETURNING *",
            "rt_" + secrets.token_hex(8), p.tenant_id, p.user_id or "", name, cards, emd, imp)
    return {"item": _tpl(r), "replaced": bool(old), "as_of": now_iso()}


@router.post("/spaces/me/report/templates/{tid}/use")
async def tpl_use(tid: str, request: Request):
    p = _me(request)
    async with db(p) as c:
        r = await c.fetchrow("UPDATE report_templates SET used_at=now() WHERE id=$1 AND tenant_id=$2 AND user_id=$3 RETURNING *", tid, p.tenant_id, p.user_id or "")
    if not r:
        raise ApiError("not_found", "보고서 틀이 없습니다")
    return {"item": _tpl(r), "as_of": now_iso()}


@router.post("/spaces/me/report/templates/{tid}/remove")
async def tpl_remove(tid: str, request: Request):
    p = _me(request)
    async with db(p) as c:
        r = await c.fetchval("DELETE FROM report_templates WHERE id=$1 AND tenant_id=$2 AND user_id=$3 RETURNING id", tid, p.tenant_id, p.user_id or "")
    if not r:
        raise ApiError("not_found", "보고서 틀이 없습니다")
    return {"ok": True, "as_of": now_iso()}


# ── 보고서 PDF(인쇄용) ─────────────────────────────────────────────────────
# 글꼴: PDF 에 쓰는 글자만 넣는다(나눠 넣기). 서버 PC 의 한글 글꼴(맑은 고딕 · 본고딕) — 없으면 PDF 는 만들지 않고 알린다(한글 문서 · 인쇄는 그대로).
FONT_DIRS = [os.environ.get("LX_PDF_FONT_DIR") or "", r"C:\Windows\Fonts", "/usr/share/fonts/truetype/nanum", "/usr/share/fonts/opentype/noto"]
FONT_PAIRS = [("malgun.ttf", "malgunbd.ttf"), ("NanumGothic.ttf", "NanumGothicBold.ttf"), ("NotoSansCJK-Regular.ttc", "NotoSansCJK-Bold.ttc")]


def _fonts() -> tuple[bytes, bytes] | None:
    for d in FONT_DIRS:
        if not d:
            continue
        for a, b in FONT_PAIRS:
            fa, fb = Path(d) / a, Path(d) / b
            if fa.exists():
                return fa.read_bytes(), (fb.read_bytes() if fb.exists() else fa.read_bytes())
    return None


PDF_CSS = """@font-face{font-family:kr;src:url(kr.ttf)} @font-face{font-family:kr;font-weight:bold;src:url(krb.ttf)}
body{font-family:kr;font-size:9.5pt;line-height:1.5;color:#1c1f25}
h1{font-size:17pt;margin:0 0 2pt;font-weight:bold} .k{font-size:9pt;color:#4e5968;margin:0} .sub{font-size:10pt;color:#4e5968;margin:0 0 10pt}
h2{font-size:11.5pt;font-weight:bold;margin:14pt 0 5pt;padding-bottom:2pt;border-bottom:0.6pt solid #d1d6db}
table{border-collapse:collapse;width:100%;margin:0 0 4pt} th,td{border:0.5pt solid #d1d6db;padding:2.5pt 5pt;vertical-align:top}
th{background:#f2f4f6;font-weight:bold;text-align:left} td.n,th.n{text-align:right} tr.t td{font-weight:bold;background:#f9fafb}
.cap{font-size:8.5pt;color:#6b7684;margin:0 0 6pt} .note{margin:8pt 0;padding:5pt 8pt;background:#f2f4f6;font-size:9pt}
.src{margin-top:14pt;font-size:8pt;color:#6b7684} img{width:100%}"""


def _e(s) -> str:
    return html.escape(str(s if s is not None else ""))


def _tbl(rows: list[list], right: set[int] | None = None, total: bool = False, cap: str | None = None) -> str:
    right = right or set()
    head = "".join(f"<th class='{'n' if i in right else ''}'>{_e(c)}</th>" for i, c in enumerate(rows[0]))
    body = []
    for ri, r in enumerate(rows[1:]):
        last = total and ri == len(rows) - 2
        body.append(f"<tr class='{'t' if last else ''}'>" + "".join(f"<td class='{'n' if i in right else ''}'>{_e(c)}</td>" for i, c in enumerate(r)) + "</tr>")
    return f"<table><tr>{head}</tr>{''.join(body)}</table>" + (f"<p class='cap'>{_e(cap)}</p>" if cap else "")


def _pdf_html(d: dict, pngs: list[tuple[str, bytes | None]]) -> tuple[str, dict[str, bytes]]:
    from .farm_more import _title
    P = d["picked"]
    one = len(P) == 1
    made = dt.datetime.now(KST).strftime("%Y. %m. %d. %H:%M")
    imgs: dict[str, bytes] = {}
    out = [f"<p class='k'>AI 분석 결과 보고서</p><h1>{_e(d['region'])} {_e(' · '.join(s['short'] for s in P))} 결과</h1>",
           f"<p class='sub'>{_e(_title(d))} · 만든 날 {_e(d['made'])}</p>"]
    ov = [["항목", "내용"], ["지역", d["region"]], ["넣은 결과", " · ".join(s["name"] for s in P)], ["영상", " · ".join(d["shots"]) or "—"],
          ["분석한 날", " · ".join(d["days"]) or "—"], ["만든 날짜", made]]
    if one and P[0]["acc"]["value"] is not None:
        ov.insert(5, ["AI 모델 정확도", f"{P[0]['acc']['value']}%"])
    if d.get("ledger"):
        ov.append(["대장", f"{d['ledger']['name']} · {d['ledger']['parcels']['value']:,}필지"])
    out.append(_tbl(ov))
    out.append("<p class='note'>AI 분석 결과는 참고자료입니다 — 처분은 담당자가 정합니다.</p>")
    if not one:
        out.append("<h2>시점 비교</h2>")
        out.append(_tbl([["결과", "영상", "분석한 날", "AI 분석 결과", "넓이(ha)"]] +
                        [[s["short"], s["shot"] or "—", s["analyzed"] or "—", f"{s['total']['value']:,}{s['unit']}", f"{s['area_ha']['value']:,.1f}"] for s in P],
                        {3, 4}))
    out.append("<h2>종류별</h2>")
    if one:
        s = P[0]
        rows = [["종류", "개수", "넓이(ha)"]]
        for c in s["classes"]:
            y = (c.get("yield") or {}).get("value")
            rows.append([c["name"] + (f" (생산량 {y:,.0f}kg)" if y else ""), f"{c['n']['value']:,}{s['unit']}", f"{c['ha']['value']:,.1f}"])
        rows.append(["합계", f"{s['total']['value']:,}{s['unit']}", f"{s['area_ha']['value']:,.1f}"])
        out.append(_tbl(rows, {1, 2}, total=True))
    else:
        names = []
        for s in P:
            for c in s["classes"]:
                if c["name"] not in names:
                    names.append(c["name"])
        ha = {s["card"]: {c["name"]: c["ha"]["value"] for c in s["classes"]} for s in P}
        rows = [["종류", *[f"{s['short']}(ha)" for s in P]]]
        rows += [[n, *[f"{ha[s['card']][n]:,.1f}" if ha[s["card"]].get(n) is not None else "—" for s in P]] for n in names]
        rows.append(["합계", *[f"{s['area_ha']['value']:,.1f}" for s in P]])
        out.append(_tbl(rows, set(range(1, len(P) + 1)), total=True))
    tr = d.get("transitions")
    if tr:
        out.append("<h2>필지 전이</h2>")
        rows = [[tr["from"]["short"], tr["to"]["short"], "필지", "넓이(ha)"]] + [[x["from"], x["to"], f"{x['n']['value']:,}", f"{x['ha']['value']:,.2f}"] for x in tr["rows"]]
        rows.append(["합계", "", f"{tr['parcels']['value']:,}", f"{sum(x['ha']['value'] for x in tr['rows']):,.2f}"])
        out.append(_tbl(rows, {2, 3}, total=True, cap=f"필지 번호로 맞춤 · 한 필지 = 넓이가 큰 종류 · 종류가 바뀐 필지 {tr['changed']['value']:,}필지"))
    for i, (name, png) in enumerate(pngs):
        if png:
            k = f"map{i}.png"
            imgs[k] = png
            out.append(f"<h2>지도 — {_e(name)}</h2><img src='{k}'/><p class='cap'>{_e(d['region'])} {_e(name)} · 읍면동 경계 위에 AI 분석 결과를 칠했습니다</p>")
    out.append("<h2>읍면동별</h2>")
    if one:
        s = P[0]
        rows = [["읍면동", "개수", "넓이(ha)"]] + [[e["emd"], f"{e['n']:,}", f"{e['ha']['value']:,.1f}"] for e in s["emd_rows"]]
        rows.append(["합계", f"{s['total']['value']:,}", f"{s['area_ha']['value']:,.1f}"])
        out.append(_tbl(rows, {1, 2}, total=True, cap=f"단위: {s['unit']} · ha"))
    else:
        emds = []
        for s in P:
            for e in s["emd_rows"]:
                if e["emd"] not in emds:
                    emds.append(e["emd"])
        m = {s["card"]: {e["emd"]: e["n"] for e in s["emd_rows"]} for s in P}
        rows = [["읍면동", *[f"{s['short']}({s['unit']})" for s in P]]] + [[x, *[f"{m[s['card']].get(x, 0):,}" for s in P]] for x in emds]
        rows.append(["합계", *[f"{s['total']['value']:,}" for s in P]])
        out.append(_tbl(rows, set(range(1, len(P) + 1)), total=True))
    ld = d.get("ledger")
    if ld:
        out.append("<h2>대장과 견준 결과</h2>")
        rows = [["항목", "필지"], ["올린 대장", f"{ld['name']} · {ld['parcels']['value']:,}필지"]]
        if one:
            rows += [[ld["labels"]["found"], f"{ld['per'][0]['found']['value']:,}필지"], [ld["labels"]["missing"], f"{ld['per'][0]['missing']['value']:,}필지"]]
            rows += [[x["label"], f"{x['n']['value']:,}필지"] for x in ld["lines"]]
        else:
            rows += [[ld["labels"]["all"], f"{ld['all']['value']:,}필지"], [ld["labels"]["some"], f"{ld['some']['value']:,}필지"]]
            rows += [[f"{x['short']} AI 결과 없음", f"{x['missing']['value']:,}필지"] for x in ld["per"]]
        out.append(_tbl(rows, {1}))
        out.append("<p class='cap'>필지 목록(지번)은 '행정정보와 비교'에서 봅니다.</p>")
    out.append(f"<p class='src'>출처 Land-XI AI 분석 결과 — 개수 · 넓이는 서비스 대시보드 · 필지 목록 · 내려받기 파일과 같은 값입니다(결과 확인 전 · 지운 결과 제외) · {_e(made)}</p>")
    return "".join(out), imgs


def _pdf(d: dict, pngs: list[tuple[str, bytes | None]]) -> bytes:
    import fitz
    f = _fonts()
    if not f:
        raise ApiError("worker_unavailable", "PDF 글꼴이 서버에 없습니다 — 한글 문서 · 인쇄로 받아 주세요")
    body, imgs = _pdf_html(d, pngs)
    arch = fitz.Archive()
    arch.add(f[0], "kr.ttf")
    arch.add(f[1], "krb.ttf")
    for k, v in imgs.items():
        arch.add(v, k)
    story = fitz.Story(html=f"<body>{body}</body>", user_css=PDF_CSS, archive=arch)
    buf = io.BytesIO()
    w = fitz.DocumentWriter(buf)
    mb = fitz.paper_rect("a4")
    where = mb + (56, 50, -56, -50)          # 좌우 약 20mm · 위아래 약 18mm
    more, n = 1, 0
    while more and n < 60:
        dev = w.begin_page(mb)
        more, _ = story.place(where)
        story.draw(dev)
        w.end_page()
        n += 1
    w.close()
    doc = fitz.open(stream=buf.getvalue(), filetype="pdf")
    doc.set_metadata({"title": f"AI 분석 결과 보고서 — {d['region']}", "author": "Land-XI", "creator": "Land-XI", "producer": "Land-XI"})
    for i, pg in enumerate(doc):                     # 쪽 번호(아래 가운데)
        pg.insert_text(fitz.Point(mb.width / 2 - 10, mb.height - 24), f"{i + 1} / {doc.page_count}", fontsize=8, color=(0.42, 0.46, 0.52))
    doc.subset_fonts()
    return doc.tobytes(garbage=3, deflate=True)


async def _maps(p: Principal, d: dict, n: int) -> list[tuple[str, bytes | None]]:
    from .gov_report import _png
    out = []
    for s in d["picked"][:n]:
        try:
            out.append((s["short"], await _png(p, s["card"], d["emd"])))
        except ApiError:
            out.append((s["short"], None))
    return out


def _fname(d: dict, what: str, ext: str) -> str:
    stem = f"{d['region']}_{'_'.join(s['short'] for s in d['picked'])}_{what}_{d['made'].replace('.', '')}"
    return re.sub(r"[\\/:*?\"<>|\s—·]+", "_", stem).strip("_")[:120] + ext


@router.get("/spaces/me/report/multi.pdf")
async def report_pdf(request: Request, cards: str | None = None, emd: str | None = None, import_id: str | None = None):
    from .farm_more import _issue, multi_data
    p = _me(request)
    d = await multi_data(p, cards, emd, import_id, with_avail=False)
    pngs = await _maps(p, d, 4)
    blob = await run_in_threadpool(_pdf, d, pngs)
    await _issue(p, d, (import_id or "").strip() or None, "pdf")
    name = _fname(d, "AI분석결과보고서", ".pdf")
    return Response(blob, media_type="application/pdf",
                    headers={"content-disposition": f"attachment; filename=\"report.pdf\"; filename*=UTF-8''{quote(name)}", "cache-control": "no-store",
                             "access-control-expose-headers": "Content-Disposition"})


# ── 요약 한 장(한글 문서) ─────────────────────────────────────────────────────
ONE_CLS, ONE_EMD = 6, 5


def _one_hwpx(d: dict, png: bytes | None) -> tuple[bytes, str]:
    from . import hwpx as HX
    from .farm_more import _title
    now = dt.datetime.now(KST)
    P = d["picked"]
    L = sorted(P, key=lambda s: str(s.get("analyzed") or ""))[-1]          # 가장 최근 결과가 큰 숫자(보고서 탭 대시보드와 같은 규칙)
    doc = HX.Doc()
    doc.title("AI 분석 결과 요약", f"{d['region']} · {_title(d)}")
    doc.overview([("지역", d["region"]), ("넣은 결과", " · ".join(s["name"] for s in P)), ("영상", " · ".join(d["shots"]) or "—"),
                  ("분석한 날", " · ".join(d["days"]) or "—")])
    rows = [["항목", "값"], [f"AI 분석 결과 · {L['short']}" if len(P) > 1 else "AI 분석 결과", f"{L['total']['value']:,}{L['unit']}"],
            ["넓이", f"{L['area_ha']['value']:,.1f} ha"]]
    if len(P) > 1:
        F = sorted(P, key=lambda s: str(s.get("analyzed") or ""))[0]
        if F["unit"] == L["unit"]:
            rows.append([f"{F['short']} → {L['short']}", f"{L['total']['value'] - F['total']['value']:+,}{L['unit']}"])
    ld = d.get("ledger")
    if ld:
        rows.append(["올린 대장", f"{ld['name']} · {ld['parcels']['value']:,}필지"])
        for x in (ld.get("lines") or [])[:2]:
            rows.append([x["label"], f"{x['n']['value']:,}필지"])
    doc.heading("한눈에")
    doc.table(rows, [60, 40], aligns=["l", "r"])
    cls = sorted(L["classes"], key=lambda c: -(c["n"]["value"] or 0))
    rows = [["종류", "개수", "넓이(ha)"]] + [[c["name"], f"{c['n']['value']:,}{L['unit']}", f"{c['ha']['value']:,.1f}"] for c in cls[:ONE_CLS]]
    if len(cls) > ONE_CLS:
        rest = cls[ONE_CLS:]
        rows.append([f"그 밖 {len(rest)}종", f"{sum(c['n']['value'] for c in rest):,}{L['unit']}", f"{sum(c['ha']['value'] for c in rest):,.1f}"])
    rows.append(["합계", f"{L['total']['value']:,}{L['unit']}", f"{L['area_ha']['value']:,.1f}"])
    doc.heading("종류별" + (f" · {L['short']}" if len(P) > 1 else ""))
    doc.table(rows, [44, 28, 28], aligns=["l", "r", "r"], total_row=True)
    emds = sorted([e for e in L["emd_rows"] if e["emd"] != "읍면동 밖"], key=lambda e: -e["n"])[:ONE_EMD]
    if emds:
        doc.heading(f"읍면동 많은 곳 {len(emds)}")
        doc.table([["읍면동", "개수", "넓이(ha)"]] + [[e["emd"], f"{e['n']:,}{L['unit']}", f"{e['ha']['value']:,.1f}"] for e in emds], [44, 28, 28], aligns=["l", "r", "r"])
    if png:
        doc.figure(png, f"{d['region']} {L['short']} AI 분석 결과", None, max_w=int(HX.TEXT_W * 0.5))
    doc.notice("AI 분석 결과는 참고자료입니다 — 처분은 담당자가 정합니다. 자세한 표는 보고서 한글 문서 · 엑셀에 있습니다.")
    doc.source("Land-XI AI 분석 결과 — 보고서 탭 · 한글 문서 · 엑셀과 같은 값입니다.", now.strftime("%Y. %m. %d. %H:%M"))
    return doc.package(f"AI 분석 결과 요약 — {d['region']} · {_title(d)}", now), _fname(d, "요약한장", HX.EXT)


@router.get("/spaces/me/report/one.hwpx")
async def report_one(request: Request, cards: str | None = None, emd: str | None = None, import_id: str | None = None):
    from .farm_more import _issue, multi_data
    from .xreport import hwpx_response
    p = _me(request)
    d = await multi_data(p, cards, emd, import_id, with_avail=False)
    L = sorted(d["picked"], key=lambda s: str(s.get("analyzed") or ""))[-1]
    png = None
    try:
        from .gov_report import _png
        png = await _png(p, L["card"], d["emd"])
    except ApiError:
        png = None
    blob, name = await run_in_threadpool(_one_hwpx, d, png)
    await _issue(p, d, (import_id or "").strip() or None, "one")
    return hwpx_response(blob, name)


# ── 메모 묶음 되돌리기 ───────────────────────────────────────────────────────
BATCH_RE = re.compile(r"^pb_[0-9a-f]{16}$")


@router.get("/spaces/me/guides/{card}/parcels/notes/last")
async def notes_last(card: str, request: Request):
    """내가 하루 안에 여러 필지에 한꺼번에 남긴 마지막 묶음(되돌리지 않은 것) — 필지 목록 위 '되돌리기' 한 줄."""
    p = _me(request)
    if not CARD_RE.match(card):
        raise ApiError("not_found", "서비스가 없습니다")
    async with db(p) as c:
        r = await c.fetchrow("SELECT batch_id, max(note) note, count(*) n, max(at) at FROM parcel_notes WHERE tenant_id=$1 AND card_id=$2 AND by_user=$3 "
                             "AND batch_id IS NOT NULL AND undone_at IS NULL AND at > now() - interval '1 day' GROUP BY batch_id ORDER BY max(at) DESC LIMIT 1",
                             p.tenant_id, card, p.user_id or "")
    if not r:
        return {"batch": None, "as_of": now_iso()}
    return {"batch": r["batch_id"], "note": r["note"], "n": env(int(r["n"]), "필지", "recorded", "필지 메모"), "at": _iso(r["at"]), "as_of": now_iso()}


@router.post("/spaces/me/guides/{card}/parcels/notes/undo")
async def notes_undo(card: str, request: Request, body: dict | None = None):
    """같은 메모 한꺼번에 쓴 것을 한 번에 되돌리기 — 쓴 사람 또는 기관 관리자. 줄은 지우지 않고 되돌린 표시만(지금 메모 · 이력 · 엑셀에서 빠짐)."""
    p = _me(request)
    batch = str((body or {}).get("batch") or "")
    if not CARD_RE.match(card) or not BATCH_RE.match(batch):
        raise ApiError("bad_request", "되돌릴 메모 묶음을 골라 주세요", {"field": "batch"})
    async with db(p) as c:
        owner = await c.fetchval("SELECT by_user FROM parcel_notes WHERE tenant_id=$1 AND card_id=$2 AND batch_id=$3 LIMIT 1", p.tenant_id, card, batch)
        if owner is None:
            raise ApiError("not_found", "메모 묶음이 없습니다")
        if owner != (p.user_id or "") and p.role != "manager":
            raise ApiError("forbidden", "쓴 사람이나 기관 관리자만 되돌립니다")
        rows = await c.fetch("UPDATE parcel_notes SET undone_at=now(), undone_by=$4 WHERE tenant_id=$1 AND card_id=$2 AND batch_id=$3 AND undone_at IS NULL RETURNING pnu",
                             p.tenant_id, card, batch, p.user_id or "")
        if rows:
            await audit(c, p, "parcel.note.undo", f"{p.tenant_id}/{card}", {"batch": batch}, {"parcels": len(rows)})
    return {"card": card, "batch": batch, "undone": env(len(rows), "필지", "recorded", "되돌린 필지 메모"), "pnus": [r["pnu"] for r in rows], "as_of": now_iso()}


# ── 기관 공지(기관 관리자가 직접) ─────────────────────────────────────────────
def _ntc(r, users: dict) -> dict:
    u = users.get(r["by_user"]) or {}
    who = " · ".join(x for x in ((u.get("dept") or "").strip(), " ".join(y for y in ((u.get("name") or "").strip(), (u.get("position") or "").strip()) if y)) if x)
    return {"id": r["id"], "title": r["title"], "body": r["body"] or "", "pinned": bool(r["pinned"]), "at": _iso(r["at"]), "by": who or "기관 관리자"}


async def _users(c, tenant: str) -> dict:
    from .gov_history import _users as u
    return await u(c, tenant)


@router.get("/spaces/me/notices")
async def notices(request: Request, limit: int = 10):
    p = _me(request)
    async with db(p) as c:
        rows = await c.fetch("SELECT * FROM tenant_notices WHERE tenant_id=$1 AND removed_at IS NULL ORDER BY pinned DESC, at DESC LIMIT $2",
                             p.tenant_id, max(1, min(int(limit or 10), 50)))
        n = await c.fetchval("SELECT count(*) FROM tenant_notices WHERE tenant_id=$1 AND removed_at IS NULL", p.tenant_id)
        users = await _users(c, p.tenant_id) if rows else {}
    return {"items": [_ntc(r, users) for r in rows], "total": env(int(n or 0), "count", "recorded", "기관 공지(내리지 않은 것)"), "can_write": _can_write(p), "as_of": now_iso()}


def _can_write(p: Principal) -> bool:
    return p.role == "manager" and p.tenant_id != "lx-demo"


@router.post("/spaces/me/notices", status_code=201)
async def notice_post(request: Request, body: dict | None = None):
    p = _me(request)
    if not _can_write(p):
        raise ApiError("forbidden", "기관 관리자만 공지를 씁니다")
    b = body or {}
    title = _clean(b.get("title"), TITLE_MAX + 1)
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f<>]", "", str(b.get("body") or "")).strip()
    if not title:
        raise ApiError("bad_request", "제목을 적어 주세요", {"field": "title"})
    if len(title) > TITLE_MAX or len(text) > BODY_MAX:
        raise ApiError("bad_request", f"제목은 {TITLE_MAX}자, 본문은 {BODY_MAX}자까지입니다")
    nid = "tn_" + secrets.token_hex(6)
    async with db(p) as c:
        r = await c.fetchrow("INSERT INTO tenant_notices(id, tenant_id, title, body, pinned, by_user) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *",
                             nid, p.tenant_id, title, text or None, bool(b.get("pinned")), p.user_id or "")
        await audit(c, p, "tenant.notice.post", nid, None, {"title": title})
        users = await _users(c, p.tenant_id)
    return {"item": _ntc(r, users), "as_of": now_iso()}


@router.post("/spaces/me/notices/{nid}/remove")
async def notice_remove(nid: str, request: Request):
    p = _me(request)
    if not _can_write(p):
        raise ApiError("forbidden", "기관 관리자만 공지를 내립니다")
    async with db(p) as c:
        r = await c.fetchrow("UPDATE tenant_notices SET removed_at=now(), removed_by=$3 WHERE id=$1 AND tenant_id=$2 AND removed_at IS NULL RETURNING title",
                             nid, p.tenant_id, p.user_id or "")
        if not r:
            raise ApiError("not_found", "공지가 없습니다")
        await audit(c, p, "tenant.notice.remove", nid, {"title": r["title"]}, None)
    return {"ok": True, "as_of": now_iso()}
