"""대상지 문맥 · 전국 집계 조회(A6000 지시서 v7.1 1차 회신 §3 · 10-29 PM) — XI ChatGEO 고침 셋.

1. 대상지 문맥: 질문에 내 대상지 이름(낱말)이 있으면 그 대상지의 **최신 결과**(국토 변화 · 이지목 현황 · 점유의심 목록)를 읽는다.
   이름이 없으면 직전 답의 대상지 → 화면 프로젝트의 대상지 → 없으면 '어느 대상지?'를 묻는다. 새로 돌리지 않는다.
     site_report  — 변화 + 지목 불일치 보고서(개조식 답 · 표 · PDF)
     site_parcels — 대상지 필지(구역선 안 · 판정 · 용도별) 표 + PDF
2. 대장 대조 전 응답 금지: 이지목 현황 결과가 있으면 '대장 없음'이라 하지 않는다 — fusion.py 가 ijimok_fallback 을 부른다.
3. nation_lookup — 전국 고속국도 집계 파일(nation_summary · rank · idle)을 읽기만 한다(재계산 없음). 자리는 config/roadland_nation.yaml.
지역 · 노선 고정값 없음 — 대상지 이름은 데이터(change_ranges.name)에서, 전국 값은 집계 파일에서. 숫자는 봉투로만.
"""
from __future__ import annotations

import datetime as dt
import html
import json
import re

from agent.tools import Out, ToolError

SPECS = {
    "site_report": {
        "description": "대상지(내 대상지 이름 · 직전 답 · 지금 프로젝트) 하나의 최신 결과 — 국토 변화(두 해) · 이지목 현황(지목 불일치) · 점유의심 목록 — "
                       "를 모아 보고서(개조식 · 표 · PDF)로 만든다. '서울세종선 안성 구간 2019 이후 변화와 지목 불일치 보고서'. 새로 돌리지 않는다.",
        "properties": {"range_query": {"type": "string", "description": "질문 문장(대상지 이름 낱말)"}, "year_from": {"type": "integer"}}},
    "site_parcels": {
        "description": "대상지 이지목 현황 결과에서 필지를 골라 표로(구역선 안 · 판정 · 토지마스터 용도별) + PDF. '이 구간 구역선 안 지목미정리 · 미확정 필지 용도별로'.",
        "properties": {"range_query": {"type": "string"}, "cls": {"type": "array", "items": {"type": "string"}},
                       "inside": {"type": "boolean", "description": "구역선 안 필지만"}, "by_use": {"type": "boolean"}}},
    "nation_lookup": {
        "description": "전국 고속국도 이지목 집계 조회(분석 필지 · 판정별 · 시도 · 시군구 상위 · 유휴지) — 집계 파일을 읽기만 한다(재계산 없음). "
                       "'전국 고속국도 이지목 상위 시군구 5곳과 점유의심 면적'.",
        "properties": {"top": {"type": "integer", "description": "상위 몇 곳(기본 5)"}}},
}
HANDLERS: dict = {}
WRITE: set = set()
CONFIRM: set = set()
CLIENT: set = set()
NO_LLM = {"site_report", "site_parcels", "nation_lookup"}
WHY = {"site_report": "대상지 최신 결과(국토 변화 · 이지목 현황 · 점유의심) → 보고서 · PDF",
       "site_parcels": "대상지 이지목 현황 필지 → 판정 · 용도별 표 · PDF", "nation_lookup": "전국 고속국도 집계 파일 읽기(재계산 없음)"}
SAY = {"site_report": "대상지 결과 보고서", "site_parcels": "대상지 필지 표", "nation_lookup": "전국 집계 조회"}

GENERIC = {"구간", "대상지", "범위", "필지", "목록", "모니터링", "토지", "창", "가장자리", "포함", "결과", "분석", "보고서", "변화", "지목", "구역선"}
REPORT_RX = re.compile(r"보고서|보고용|보고\s*자료")
WHAT_RX = re.compile(r"변화|지목|이지목|점유|불일치")
TABLE_RX = re.compile(r"표로|목록|리스트|뽑아|필지만|용도별")
CLS_RX = re.compile(r"지목\s*미정리|미확정|점유\s*의심|이지목|지목\s*불일치|대장과\s*다른|용도")
NATION_RX = re.compile(r"전국")
NATION_WHAT = re.compile(r"이지목|지목\s*미정리|점유\s*의심|유휴지|지목\s*불일치")
THIS_RX = re.compile(r"이\s*구간|이\s*대상지|여기|이\s*곳")
CLS_WORD = {"지목미정리": "지목미정리", "미확정_나지초지": "미확정", "정상_지목일치": "정상", "점유의심": "점유의심", "유휴산림화": "유휴산림화",
            "수역구거": "수역구거", "기타": "기타"}
TYPES = ["신축", "소실", "경작 전환", "포장 확대"]


def allowed(name: str, p) -> bool:
    return getattr(p, "realm", None) == "lx" and getattr(p, "role", None) in ("staff", "admin")


# ── 기억(직전 답의 대상지) ────────────────────────────────────────────────────
async def _mem_get(ctx) -> dict:
    out = {}
    prev = str((ctx.context or {}).get("prev_run") or "").strip()
    if prev and getattr(ctx, "r", None) is not None:
        for k in (f"agent:runs:{prev}:site", f"agent:runs:{prev}:change"):
            try:
                raw = await ctx.r.get(k)
                if raw:
                    out = {**json.loads(raw), **out}
            except Exception:  # noqa: BLE001
                pass
    c = (ctx.context or {}).get("change") or {}
    for k in ("range_id", "project_id"):
        if c.get(k):
            out[k] = c[k]
    return out


async def _mem_set(ctx, **kw):
    if getattr(ctx, "r", None) is None:
        return
    try:
        await ctx.r.set(f"agent:runs:{ctx.run_id}:site", json.dumps({k: v for k, v in kw.items() if v is not None}, ensure_ascii=False), ex=86400)
        if kw.get("range_id"):     # 다른 도구(국토 변화 · 이지목 현황)의 꼬리 질문도 같은 대상지로
            await ctx.r.set(f"agent:runs:{ctx.run_id}:change", json.dumps({"range_id": kw["range_id"], "job_id": kw.get("job_change")}, ensure_ascii=False), ex=86400)
    except Exception:  # noqa: BLE001
        pass


async def _get(ctx, path, **params):
    r = await ctx.http.get(path, params={k: v for k, v in params.items() if v is not None})
    if r.status_code >= 400:
        try:
            msg = (r.json().get("error") or {}).get("message")
        except Exception:  # noqa: BLE001
            msg = None
        raise ToolError("site_error", msg or "대상지 결과를 읽지 못했습니다", r.status_code)
    return r.json()


# ── 대상지 찾기 ───────────────────────────────────────────────────────────────
def _toks(s: str) -> list[str]:
    return [w for w in re.split(r"[\s()·,_\-/]+", s or "") if len(w) >= 2]


def _hit(w: str, q: str, qt: list[str]) -> bool:
    if w in GENERIC:
        return False
    if w in q:
        return True
    for t in qt:                                   # '서울세종선' ↔ '서울세종고속도로' — 앞 세 글자 이상 같으면
        if t in GENERIC:
            continue
        n = 0
        for a, b in zip(w, t):
            if a != b:
                break
            n += 1
        if n >= 3:
            return True
    return False


async def _runs(range_ids: list[str]) -> dict:
    """대상지마다 끝난 결과(국토 변화 · 이지목 현황) — 최신 순."""
    from landxi_api.deps import db
    async with db(realm="lx") as c:
        rows = await c.fetch("SELECT r.range_id, r.job_id, r.year_a, r.year_b, r.done_at, coalesce(j.card_id,'card-change') AS card, (r.stats->>'n')::int AS n "
                             "FROM change_runs r LEFT JOIN jobs j ON j.id=r.job_id WHERE r.state='done' AND r.range_id = ANY($1::text[]) "
                             "ORDER BY r.done_at DESC", range_ids)
    out: dict = {}
    for r in rows:
        d = out.setdefault(r["range_id"], {"change": [], "ijimok": []})
        if r["card"] == "card-ijimok":
            d["ijimok"].append(dict(r))
        elif r["card"] == "card-change" and int(r["year_a"] or 0) and int(r["year_a"]) != int(r["year_b"] or 0):
            d["change"].append(dict(r))
    return out


async def resolve(ctx, msg: str, mem: dict | None = None) -> dict | None:
    """→ {name, ranges:[{id,name,area}], main(변화 + 이지목 대상지), zone(가장 작은 이지목 대상지), runs} | None"""
    mem = mem if mem is not None else await _mem_get(ctx)
    items = (await _get(ctx, "/change/ranges", brief=1)).get("items") or []      # 내 대상지 · 내 프로젝트 대상지만
    q = re.sub(r"\s+", " ", msg or "")
    qt = _toks(q)
    scored = []
    for x in items:
        ws = [w for w in _toks(x.get("name") or "") if _hit(w, q, qt)]
        if ws:
            scored.append((len(set(ws)), x))
    pick = []
    if scored:
        top = max(s for s, _ in scored)
        pick = [x for s, x in scored if s == top]
    elif mem.get("site_ranges"):
        pick = [x for x in items if x["id"] in mem["site_ranges"]]
    elif mem.get("range_id"):
        pick = [x for x in items if x["id"] == mem["range_id"]]
    elif mem.get("project_id"):
        pick = [x for x in items if x.get("project_id") == mem["project_id"]]
    if not pick:
        return None
    runs = await _runs([x["id"] for x in pick])
    pick = [x for x in pick if x["id"] in runs]
    if not pick:
        return None
    areas = {}
    for x in pick:
        a = x.get("area")
        areas[x["id"]] = float((a or {}).get("value") if isinstance(a, dict) else (a or 0) or 0)
    both = [x for x in pick if runs[x["id"]]["change"] and runs[x["id"]]["ijimok"]]
    main = max(both or [x for x in pick if runs[x["id"]]["change"]] or pick, key=lambda x: str((runs[x["id"]]["change"] or runs[x["id"]]["ijimok"])[0]["done_at"]))
    ij = [x for x in pick if runs[x["id"]]["ijimok"]]
    zone = min(ij, key=lambda x: areas.get(x["id"]) or 1e18) if ij else None
    return {"ranges": pick, "main": main, "zone": zone, "runs": runs, "areas": areas}


# ── PDF ───────────────────────────────────────────────────────────────────────
def _e(s) -> str:
    return html.escape(str(s if s is not None else ""))


def _pdf(title: str, body: str, imgs: dict[str, bytes]) -> bytes:
    import io

    import fitz
    from landxi_api.farm_extra import PDF_CSS, _fonts
    f = _fonts()
    if not f:
        raise ToolError("no_font", "PDF 글꼴이 서버에 없습니다", 503)
    arch = fitz.Archive()
    arch.add(f[0], "kr.ttf")
    arch.add(f[1], "krb.ttf")
    for k, v in imgs.items():
        arch.add(v, k)
    css = PDF_CSS + " td img{width:100%} .two td{width:50%} .k2{color:#4e5968;font-size:8.5pt}"
    story = fitz.Story(html=f"<body>{body}</body>", user_css=css, archive=arch)
    buf = io.BytesIO()
    w = fitz.DocumentWriter(buf)
    mb = fitz.paper_rect("a4")
    where = mb + (56, 50, -56, -50)
    more, n = 1, 0
    while more and n < 40:
        dev = w.begin_page(mb)
        more, _ = story.place(where)
        story.draw(dev)
        w.end_page()
        n += 1
    w.close()
    doc = fitz.open(stream=buf.getvalue(), filetype="pdf")
    doc.set_metadata({"title": title, "author": "Land-XI", "creator": "Land-XI", "producer": "Land-XI"})
    for i, pg in enumerate(doc):
        pg.insert_text(fitz.Point(mb.width / 2 - 10, mb.height - 24), f"{i + 1} / {doc.page_count}", fontsize=8, color=(0.42, 0.46, 0.52))
    doc.subset_fonts()
    return doc.tobytes(garbage=3, deflate=True)


def _save(ctx, name: str, data: bytes) -> str:
    from agent import config
    safe = re.sub(r"[^\w가-힣.() -]+", "_", name)[:96]
    (config.run_dir(ctx.run_id) / safe).write_bytes(data)
    return config.run_href(ctx.run_id, safe)


def _table(cols: list[str], rows: list[list], num: set[int] | None = None) -> str:
    num = num or set()
    h = "".join(f"<th{' class=n' if i in num else ''}>{_e(c)}</th>" for i, c in enumerate(cols))
    b = "".join("<tr>" + "".join(f"<td{' class=n' if i in num else ''}>{_e(v)}</td>" for i, v in enumerate(r)) + "</tr>" for r in rows)
    return f"<table><tr>{h}</tr>{b}</table>"


def _kst(s) -> str:
    try:
        t = s if isinstance(s, dt.datetime) else dt.datetime.fromisoformat(str(s))
        return t.astimezone(dt.timezone(dt.timedelta(hours=9))).strftime("%Y.%m.%d")
    except Exception:  # noqa: BLE001
        return str(s or "")[:10]


def _nf(v, d=0) -> str:
    return f"{v:,.{d}f}" if isinstance(v, (int, float)) else str(v)


# ── 결과 읽기 ────────────────────────────────────────────────────────────────
async def _range_geom(ctx, rid: str):
    from shapely.geometry import shape
    g = await _get(ctx, f"/change/ranges/{rid}", years=0)
    return shape(g["geometry"]), g


async def _feats(ctx, job: str) -> list[dict]:
    r = await ctx.http.get(f"/change/runs/{job}/features")
    if r.status_code >= 400:
        raise ToolError("site_error", "결과를 읽지 못했습니다", r.status_code)
    return r.json().get("features") or []


def _in_zone(feats: list[dict], zone) -> list[dict]:
    from shapely.geometry import shape
    out = []
    for f in feats:
        try:
            g = shape(f["geometry"])
            if g.area and g.intersection(zone).area / g.area >= 0.3:
                out.append(f)
        except Exception:  # noqa: BLE001
            continue
    return out


# ── 1. site_report ──────────────────────────────────────────────────────────
async def site_report(args: dict, ctx) -> Out:
    msg = str(args.get("range_query") or (getattr(ctx, "state", None) or {}).get("msg") or "")
    site = await resolve(ctx, msg)
    out = Out(source="대상지 최신 결과(국토 변화 · 이지목 현황 · 점유의심 목록 · 새로 돌리지 않음)", scope={"kind": "change"})
    if not site:
        out.answer = "어느 대상지의 결과를 볼지 정하지 못했습니다 — 대상지 이름을 함께 말해 주세요."
        return out
    main, zone, runs = site["main"], site["zone"], site["runs"]
    yf = int(args.get("year_from") or 0) or next((int(y) for y in re.findall(r"(20\d{2})\s*년?\s*이후", msg)), 0)
    chs = runs[main["id"]]["change"]
    ch = next((r for r in chs if int(r["year_a"]) == yf), None) if yf else None
    ch = ch or (max(chs, key=lambda r: (int(r["year_b"]) - int(r["year_a"]), str(r["done_at"]))) if chs else None)
    ij = (runs[main["id"]]["ijimok"] or [None])[0]
    zj = (runs[zone["id"]]["ijimok"] or [None])[0] if zone else None
    zg, zinfo = await _range_geom(ctx, zone["id"]) if zone else (None, None)
    name = main["name"]
    out.whitelist |= {str(x) for x in re.findall(r"\d+", name)}
    lines, body, imgs, rows_t, rows_c = [], [], {}, [], []
    # 국토 변화
    if ch:
        st = await _get(ctx, f"/change/runs/{ch['job_id']}")
        feats = [f for f in await _feats(ctx, ch["job_id"]) if f["properties"].get("type") in TYPES]
        zin = _in_zone(feats, zg) if zg is not None else []
        ya, yb = int(ch["year_a"]), int(ch["year_b"])
        out.whitelist |= {str(ya), str(yb)}
        base = {"unit": "건", "basis": "inferred", "as_of": str(ch["done_at"]), "source": "국토 변화 분석서비스 결과(토지피복 U-Net · 결과 확인 전)"}
        out.env("ch_n", "대상지 변화 건수", {**base, "value": len(feats)})
        out.env("ch_zone", "구역선 안 변화 건수", {**base, "value": len(zin)})
        for t in TYPES:
            a = sum(1 for f in feats if f["properties"]["type"] == t)
            b = sum(1 for f in zin if f["properties"]["type"] == t)
            m2 = round(sum(f["properties"].get("area_m2") or 0 for f in feats if f["properties"]["type"] == t))
            rows_c.append([t, f"{a:,}", f"{b:,}", f"{m2:,}"])
        lines.append(f"국토 변화({ya}년 → {yb}년 국토지리정보원 항공) — 대상지 {{{{ch_n}}}} · 구역선 안 {{{{ch_zone}}}}")
        out.blocks.append({"type": "rows", "title": f"변화 유형별 · {ya} → {yb}", "cols": ["유형", "대상지", "구역선 안", "면적(㎡)"], "rows": rows_c})
        top = sorted(zin, key=lambda f: -(f["properties"].get("area_m2") or 0)) + sorted([f for f in feats if f not in zin], key=lambda f: -(f["properties"].get("area_m2") or 0))
        cuts = []
        from change.run import run_dir
        for f in top[:10]:
            fid = f["properties"]["id"]
            pa, pb = run_dir(ch["job_id"]) / "thumbs" / f"{fid}_a.png", run_dir(ch["job_id"]) / "thumbs" / f"{fid}_b.png"
            if pa.exists() and pb.exists():
                imgs[f"a_{fid}.png"], imgs[f"b_{fid}.png"] = pa.read_bytes(), pb.read_bytes()
                cuts.append(f)
        ch_st = st
    # 이지목 현황
    zone_cls = {}
    if zj:
        zf = await _feats(ctx, zj["job_id"])
        for f in zf:
            k = CLS_WORD.get(f["properties"].get("type"), f["properties"].get("type"))
            zone_cls[k] = zone_cls.get(k, 0) + 1
        ib = {"unit": "필지", "basis": "inferred", "as_of": str(zj["done_at"]), "source": "이지목 현황 분석서비스 결과(토지피복 AI × 지목 · 결과 확인 전)"}
        out.env("z_n", "구역선 안 판정 필지", {**ib, "value": len(zf)})
        out.env("z_unreg", "구역선 안 지목미정리 필지", {**ib, "value": zone_cls.get("지목미정리", 0)})
        out.env("z_und", "구역선 안 미확정 필지", {**ib, "value": zone_cls.get("미확정", 0)})
        rows_t = [[k, f"{v:,}"] for k, v in sorted(zone_cls.items(), key=lambda kv: -kv[1])]
        lines.append(f"지목 불일치(이지목 현황 · {int(zj['year_b'])}년 영상) — 구역선 안 {{{{z_n}}}} 가운데 지목미정리 {{{{z_unreg}}}} · 미확정 {{{{z_und}}}}")
        out.whitelist.add(str(int(zj["year_b"])))
        out.blocks.append({"type": "rows", "title": "구역선 안 판정별 필지", "cols": ["판정", "필지"], "rows": rows_t})
    occ_n = None
    if ij and ch:
        try:
            oc = await _get(ctx, f"/change/runs/{ij['job_id']}/occupy", chg=ch["job_id"], format="json")
            occ_n = (oc.get("n") or {}).get("value")
            out.env("occ", "점유의심 조사 목록 필지", {"value": occ_n, "unit": "필지", "basis": "inferred", "as_of": oc.get("as_of") or "", "source": "이지목 현황 × 국토 변화(필지 교차)"})
            lines.append("점유의심 조사 목록(이지목 현황 × 국토 변화 · 필지 교차) — {{occ}}")
        except ToolError:
            pass
    if not lines:
        out.answer = f"{name}에는 아직 끝난 결과가 없습니다. 새로 돌리지 않았습니다."
        return out
    out.answer = f"{name} 결과 보고서를 만들었습니다(새로 돌리지 않음).\n\n" + "\n\n".join(lines) + "\n\n필지별 두 시점 컷 · 판정일 · 근거 레이어 · 작업 ID는 PDF에 담았습니다."
    # PDF — 요약 수치 → 유형별 · 판정별 표 → 필지별 두 시점 컷(상위 10) → 판정일 · 근거 레이어 · 작업 ID
    made = dt.datetime.now(dt.timezone(dt.timedelta(hours=9))).strftime("%Y.%m.%d %H:%M")
    title = f"{name} — 변화 · 지목 불일치 보고서"
    body.append(f"<p class=k>XI ChatGEO 보고서 · {made}</p><h1>{_e(title)}</h1>")
    summ = []
    if ch:
        summ.append(["국토 변화", f"{ya} → {yb}", f"대상지 {len(feats):,}건 · 구역선 안 {len(zin):,}건"])
    if zj:
        summ.append(["이지목 현황", str(int(zj["year_b"])), f"구역선 안 {sum(zone_cls.values()):,}필지 · 지목미정리 {zone_cls.get('지목미정리', 0):,} · 미확정 {zone_cls.get('미확정', 0):,}"])
    if occ_n is not None:
        summ.append(["점유의심 조사 목록", "교차", f"{occ_n:,}필지"])
    body.append("<h2>요약 수치</h2>" + _table(["결과", "시점", "값"], summ))
    if rows_c:
        body.append(f"<h2>변화 유형별</h2>" + _table(["유형", "대상지(건)", "구역선 안(건)", "면적(㎡)"], rows_c, {1, 2, 3}))
    if rows_t:
        body.append("<h2>구역선 안 판정별</h2>" + _table(["판정", "필지"], rows_t, {1}))
    if ch and cuts:
        body.append(f"<h2>필지별 두 시점 컷(상위 {len(cuts)} · 구역선 안 먼저)</h2>")
        for f in cuts:
            p = f["properties"]
            body.append(f"<p class=k2>{_e(p['id'])} · {_e(p.get('type'))} · {_nf(round(p.get('area_m2') or 0))}㎡ · 지번 {_e(p.get('jibun') or '-')} · "
                        f"{'구역선 안' if f in zin else '구역선 밖(대상지 안)'}</p>"
                        f"<table class=two><tr><td><img src='a_{p['id']}.png'/><p class=cap>{ya}년</p></td><td><img src='b_{p['id']}.png'/><p class=cap>{yb}년</p></td></tr></table>")
    src = []
    if ch:
        src.append(["국토 변화", ch["job_id"], _kst(ch["done_at"]), f"대상지 '{main['name']}'"])
    if zj:
        src.append(["이지목 현황(구역선)", zj["job_id"], _kst(zj["done_at"]), f"대상지 '{zone['name']}'"])
    if ij and ij is not zj:
        src.append(["이지목 현황(대상지)", ij["job_id"], _kst(ij["done_at"]), f"대상지 '{main['name']}'"])
    body.append("<h2>판정일 · 근거 레이어</h2>" + _table(["근거 레이어", "판정일", "범위"], [[x[0], x[2], x[3]] for x in src])
                + "<p class=src>출처 Land-XI 결과(결과 확인 전) · 숫자는 결과 파일 그대로 · 새로 돌리지 않음</p>")
    pdf = _pdf(title, "".join(body), imgs)
    fn = re.sub(r"[\\/:*?\"<>|\s]+", "_", f"{name}_변화_지목불일치_보고서") + ".pdf"
    out.blocks.append({"type": "file", "label": fn, "href": _save(ctx, fn, pdf)})
    if ch:
        out.ui_actions.append({"op": "change_show", "job_id": ch["job_id"], "year_a": ya, "year_b": yb, "project_id": main.get("project_id")})
    await _mem_set(ctx, site_ranges=[x["id"] for x in site["ranges"]], range_id=main["id"], job_change=ch["job_id"] if ch else None)
    return out


# ── 2. site_parcels ─────────────────────────────────────────────────────────
def _cls_asked(t: str) -> list[str]:
    out = []
    if re.search(r"지목\s*미정리", t):
        out.append("지목미정리")
    if re.search(r"미확정", t):
        out.append("미확정_나지초지")
    if re.search(r"점유\s*의심", t):
        out.append("점유의심")
    if re.search(r"정상", t):
        out.append("정상_지목일치")
    return out or ["지목미정리", "점유의심", "미확정_나지초지"]


async def site_parcels(args: dict, ctx) -> Out:
    msg = str(args.get("range_query") or (getattr(ctx, "state", None) or {}).get("msg") or "")
    site = await resolve(ctx, msg)
    out = Out(source="이지목 현황 분석서비스 결과(토지피복 AI × 지목 · 토지마스터 용도 · 결과 확인 전)", scope={"kind": "det"})
    if not site:
        out.answer = "어느 대상지의 필지를 볼지 정하지 못했습니다 — 대상지 이름을 함께 말해 주세요."
        return out
    inside = args.get("inside")
    if inside is None:
        inside = bool(re.search(r"구역선\s*(안|내)", msg))
    rg = site["zone"] if inside else site["main"]
    runs = site["runs"][rg["id"]]["ijimok"] if rg else []
    if not runs:
        out.answer = f"{(rg or site['main'])['name']}에는 아직 이지목 현황 결과가 없습니다. 새로 돌리지 않았습니다."
        return out
    j = runs[0]
    cls = [c for c in (args.get("cls") or _cls_asked(msg))]
    feats = [f for f in await _feats(ctx, j["job_id"]) if f["properties"].get("type") in cls]
    by_use = args.get("by_use", True)
    base = {"unit": "필지", "basis": "inferred", "as_of": str(j["done_at"]), "source": out.source}
    words = " · ".join(CLS_WORD.get(c, c) for c in cls)
    out.env("n", f"{words} 필지 수", {**base, "value": len(feats)})
    tot = len(await _feats(ctx, j["job_id"]))
    out.env("tot", "판정한 필지", {**base, "value": tot})
    uses: dict = {}
    for f in feats:
        u = f["properties"].get("use") or "용도 없음(토지마스터 밖)"
        d = uses.setdefault(u, {c: 0 for c in cls})
        d[f["properties"]["type"]] += 1
    urows = [[u] + [f"{d[c]:,}" for c in cls] + [f"{sum(d.values()):,}"] for u, d in sorted(uses.items(), key=lambda kv: -sum(kv[1].values()))]
    ucols = ["용도"] + [CLS_WORD.get(c, c) for c in cls] + ["합"]
    out.blocks.append({"type": "rows", "title": f"{rg['name']} · {words} · 용도별", "cols": ucols, "rows": urows})
    feats.sort(key=lambda f: (str(f["properties"].get("use") or ""), -(f["properties"].get("area_m2") or 0)))
    from .change import JNAME
    prow = [[f["properties"].get("jibun") or "-", JNAME.get(f["properties"].get("jimok") or "", f["properties"].get("jimok") or "-"),
             f["properties"].get("use") or "-", CLS_WORD.get(f["properties"]["type"], f["properties"]["type"]), f["properties"].get("cover") or "-",
             f"{round((f['properties'].get('comp') or {}).get('도로', 0) * 100)}%", f"{round(f['properties'].get('area_m2') or 0):,}"] for f in feats]
    out.blocks.append({"type": "rows", "title": f"{words} 필지(용도 순)", "cols": ["지번", "지목", "용도", "판정", "실제 쓰임", "피복 도로 비율", "면적(㎡)"],
                       "rows": prow[:50], "ids": [f["properties"]["id"] for f in feats[:50]], "more": max(0, len(prow) - 50)})
    out.whitelist |= {str(int(j["year_b"]))} | {str(x) for x in re.findall(r"\d+", rg["name"])}
    out.answer = (f"{rg['name']}({int(j['year_b'])}년 영상 · 이지목 현황 결과 · 새로 돌리지 않음){' 구역선 안' if inside else ''} 판정 필지 {{{{tot}}}} 가운데 "
                  f"{words} 필지는 {{{{n}}}}입니다. 토지마스터 용도별로 표에 나눴고, 필지 목록과 함께 PDF로 담았습니다.")
    made = dt.datetime.now(dt.timezone(dt.timedelta(hours=9))).strftime("%Y.%m.%d %H:%M")
    title = f"{rg['name']} — {words} 필지 · 용도별"
    body = [f"<p class=k>XI ChatGEO 보고서 · {made}</p><h1>{_e(title)}</h1>",
            "<h2>요약 수치</h2>" + _table(["항목", "값"], [["판정한 필지" + (" (구역선 안)" if inside else ""), f"{tot:,}필지"], [words, f"{len(feats):,}필지"]]),
            "<h2>용도별 · 판정별</h2>" + _table(ucols, urows, set(range(1, len(ucols)))),
            "<h2>필지 목록</h2>" + _table(["지번", "지목", "용도", "판정", "실제 쓰임", "피복 도로 비율", "면적(㎡)"], prow, {5, 6}),
            "<h2>판정일 · 근거 레이어</h2>" + _table(["근거 레이어", "판정일", "범위"], [["이지목 현황", _kst(j["done_at"]), rg["name"]]])
            + "<p class=src>용도 = 토지마스터 용도(법면 값 없음 · 10-29 E0) · 피복 도로 비율 = 필지 안 토지피복 AI 도로 몫 · 결과 확인 전</p>"]
    pdf = _pdf(title, "".join(body), {})
    fn = re.sub(r"[\\/:*?\"<>|\s]+", "_", f"{rg['name']}_{words.replace(' · ', '_')}_용도별") + ".pdf"
    out.blocks.append({"type": "file", "label": fn, "href": _save(ctx, fn, pdf)})
    out.ui_actions.append({"op": "change_show", "job_id": j["job_id"], "year_a": int(j["year_b"]), "year_b": int(j["year_b"]), "project_id": rg.get("project_id")})
    out.ui_actions.append({"op": "change_hl", "job_id": j["job_id"], "ids": [f["properties"]["id"] for f in feats]})
    await _mem_set(ctx, site_ranges=[x["id"] for x in site["ranges"]], range_id=rg["id"])
    return out


# ── 대장 대조 전 응답 대신(fusion.py) ───────────────────────────────────────
async def ijimok_fallback(ctx, msg: str):
    """대장이 없을 때 — 대상지(질문 이름 · 직전 답)의 이지목 현황 결과가 있으면 그것이 대조 결과다(대장 없음이라 하지 않는다)."""
    if getattr(getattr(ctx, "principal", None), "realm", None) != "lx":
        return None
    try:
        site = await resolve(ctx, msg)
    except Exception:  # noqa: BLE001
        return None
    if not site or not any(site["runs"][x["id"]]["ijimok"] for x in site["ranges"]):
        return None
    return await site_parcels({"range_query": msg}, ctx)


# ── 3. nation_lookup ────────────────────────────────────────────────────────
def _nation_files() -> dict:
    from pathlib import Path

    from landxi_api import config as C
    cfg = C.load_yaml("roadland_nation") or {}
    d = Path(str(cfg.get("dir") or ""))
    if not d.is_absolute():
        d = C.DATA_ROOT / d
    out = {}
    for k in ("nation_summary", "rank", "idle"):
        f = d / f"{k}.json"
        if f.exists():
            out[k] = json.loads(f.read_text(encoding="utf-8"))
    out["_label"] = str(cfg.get("label") or "")
    return out


async def nation_lookup(args: dict, ctx) -> Out:
    top = max(1, min(10, int(args.get("top") or 5)))
    F = _nation_files()
    ns, rk, idl = F.get("nation_summary"), F.get("rank"), F.get("idle")
    out = Out(source=f"전국 고속국도 이지목 집계 파일(재계산 없음){' · ' + F['_label'] if F.get('_label') else ''}", scope={"kind": "nation", "sgg": "nation"})
    if not ns or not rk:
        out.answer = "전국 고속국도 집계 파일이 이 서버에 없습니다. 새로 계산하지 않았습니다."
        return out
    base = {"basis": "inferred", "as_of": str(ns.get("created") or ""), "source": out.source}
    out.env("an", "분석 필지", {**base, "value": ns["analyzed_parcels"], "unit": "필지"})
    out.env("ij", "이지목 필지", {**base, "value": ns["ijimok_total"]["parcels"], "unit": "필지"})
    oc = ns["classes"].get("점유의심") or {}
    jo = ns["classes"].get("전용점유") or {}
    out.env("oc_n", "점유의심 필지", {**base, "value": oc.get("parcels"), "unit": "필지"})
    out.env("oc_m2", "점유의심 면적", {**base, "value": round(oc.get("area_m2") or 0), "unit": "m2"})
    out.env("jo_n", "전용점유 필지", {**base, "value": jo.get("parcels"), "unit": "필지"})
    out.env("jo_m2", "전용점유 면적", {**base, "value": round(jo.get("area_m2") or 0), "unit": "m2"})
    sg = (rk.get("sigungu") or {}).get("top10_by_parcels") or []
    rows = []
    for i, r in enumerate(sg[:top], 1):
        k = out.env(f"s{i}", f"{r['시도']} {r['시군구']} 이지목 필지", {**base, "value": r["parcels"], "unit": "필지"})
        out.env(f"s{i}m", f"{r['시도']} {r['시군구']} 이지목 면적", {**base, "value": round(r["area_m2"]), "unit": "m2"})
        rows.append([str(i), f"{r['시도']} {r['시군구']}", f"{r['parcels']:,}", f"{round(r['area_m2']):,}"])
        out.whitelist.add(str(i))
    out.blocks.append({"type": "rows", "title": f"이지목 필지 상위 시군구 {len(rows)}곳", "cols": ["순위", "시군구", "이지목 필지", "면적(㎡)"], "rows": rows})
    out.blocks.append({"type": "rows", "title": "점유 관련 판정(전국)", "cols": ["판정", "필지", "면적(㎡)"],
                       "rows": [["점유의심", f"{oc.get('parcels'):,}", f"{round(oc.get('area_m2') or 0):,}"], ["전용점유", f"{jo.get('parcels'):,}", f"{round(jo.get('area_m2') or 0):,}"]]})
    names = " · ".join(f"{r['시군구']}({{{{s{i}}}}})" for i, r in enumerate(sg[:top], 1))
    out.answer = (f"전국 고속국도 분석 필지 {{{{an}}}} 가운데 이지목은 {{{{ij}}}}입니다(집계 파일 · 재계산 없음).\n\n"
                  f"이지목 필지 상위 시군구 {len(rows)}곳: {names}\n\n"
                  f"점유의심은 {{{{oc_n}}}} · 면적 {{{{oc_m2}}}}, 전용점유는 {{{{jo_n}}}} · 면적 {{{{jo_m2}}}}입니다. "
                  "시군구별 점유의심 면적은 집계 파일에 없습니다.")
    out.whitelist.add(str(len(rows)))
    made = dt.datetime.now(dt.timezone(dt.timedelta(hours=9))).strftime("%Y.%m.%d %H:%M")
    title = "전국 고속국도 이지목 · 점유의심 요약"
    sd = (rk.get("sido") or {}).get("top10_by_parcels") or []
    body = [f"<p class=k>XI ChatGEO 보고서 · {made}</p><h1>{_e(title)}</h1>",
            "<h2>요약 수치</h2>" + _table(["항목", "필지", "면적(㎡)"], [["분석 필지", f"{ns['analyzed_parcels']:,}", "-"],
                                                                     ["이지목", f"{ns['ijimok_total']['parcels']:,}", f"{round(ns['ijimok_total']['area_m2']):,}"],
                                                                     ["점유의심", f"{oc.get('parcels'):,}", f"{round(oc.get('area_m2') or 0):,}"],
                                                                     ["전용점유", f"{jo.get('parcels'):,}", f"{round(jo.get('area_m2') or 0):,}"]], {1, 2}),
            "<h2>판정별</h2>" + _table(["판정", "필지", "면적(㎡)"], [[k, f"{v['parcels']:,}", f"{round(v['area_m2']):,}"] for k, v in ns["classes"].items()], {1, 2}),
            f"<h2>이지목 상위 시군구 {len(rows)}곳</h2>" + _table(["순위", "시군구", "이지목 필지", "면적(㎡)"], rows, {2, 3}),
            "<h2>이지목 상위 시도 5곳</h2>" + _table(["시도", "이지목 필지", "면적(㎡)"], [[r["시도"], f"{r['parcels']:,}", f"{round(r['area_m2']):,}"] for r in sd[:5]], {1, 2})]
    if idl:
        body.append("<h2>유휴지</h2>" + _table(["항목", "값"], [["유휴지 필지", f"{idl.get('idle_parcels'):,}"], ["기준", (idl.get("definition") or {}).get("idle_standard") or "-"]]))
    body.append("<h2>근거</h2>" + _table(["집계 파일", "만든 때", "판"], [["nation_summary · rank · idle", str(ns.get("created") or ""), str(ns.get("version") or "")]])
                + "<p class=src>시군구별 점유의심 면적은 집계 파일에 없음 · 노선별 표 없음(원천에 노선명 없음) · 재계산 없음</p>")
    pdf = _pdf(title, "".join(body), {})
    fn = "전국_고속국도_이지목_점유의심_요약.pdf"
    out.blocks.append({"type": "file", "label": fn, "href": _save(ctx, fn, pdf)})
    return out


HANDLERS.update({"site_report": site_report, "site_parcels": site_parcels, "nation_lookup": nation_lookup})


# ── 모델 앞 직행 ─────────────────────────────────────────────────────────────
async def ROUTE_FIRST(msg: str, ctx):
    if getattr(ctx, "lang", "ko") != "ko" or getattr(getattr(ctx, "principal", None), "realm", None) != "lx":
        return None
    t = re.sub(r"\s+", " ", msg or "").strip()
    if not t or len(t) > 160:
        return None
    if NATION_RX.search(t) and NATION_WHAT.search(t):
        return {"tool": "nation_lookup", "args": {"top": int(m.group(1)) if (m := re.search(r"(\d{1,2})\s*곳", t)) else 5}}
    if not (WHAT_RX.search(t) or CLS_RX.search(t)):
        return None
    mem = await _mem_get(ctx)
    try:
        site = await resolve(ctx, t, mem) if (not THIS_RX.search(t) or mem) else None
    except Exception:  # noqa: BLE001
        return None
    if not site:
        return None
    if REPORT_RX.search(t) and WHAT_RX.search(t):
        return {"tool": "site_report", "args": {"range_query": t}}
    if TABLE_RX.search(t) and CLS_RX.search(t):
        return {"tool": "site_parcels", "args": {"range_query": t}}
    return None


def _route_front():
    """운영 · 이어 묻기(hl) 다음, 지도 서비스 직행(mapsvc_first)보다 앞 — 대상지 이름이 든 보고서가 지역 보고서로 먹히지 않게."""
    try:
        from . import ROUTES
    except Exception:  # noqa: BLE001
        return
    ROUTES[:] = [r for r in ROUTES if r[0] != "site_first"]
    at = next((i for i, r in enumerate(ROUTES) if r[0] == "mapsvc_first"), 0)
    ROUTES.insert(at, ("site_first", ROUTE_FIRST))


_route_front()
