"""XI ChatGEO 공공용지 무단점유(11-01 PM 확인 — 공공용지 무단점유 분석서비스 카드 · 무단적치 쓰레기 · 불법 형질변경).

publand — 하나의 도구로:
  · 결과 · 보고서: '전국 공공용지 무단점유 분석 결과와 레포트를 보여줘' → 가장 최근 끝난 결과(전국 · 또는 말한 대상지)
      → 요약(유형별 · 공공용지 대조별 · 시도별) · 표(큰 것부터) · 지도 결과 층(change_show) · 보고서 보기 + 한글(.hwpx) · 엑셀 · 목록 CSV
  · 분석 시작: '○○ 공공용지 무단점유 분석해 줘' · '전국 공공용지 무단점유 분석해 줘' → 분석 서비스 카드와 같은 길(POST /change/runs · 같은 곳 · 같은 영상의
      끝난 결과가 있으면 그것)
숫자는 봉투로만(결과 파일 · 작업 기록에서 센 값). 결과 문구 = "무단 사용 의심 → 현장 확인". 지역 이름은 코드에 없다(결과의 주소 · 대상지 이름).
"""
from __future__ import annotations

import datetime as dt
import io
import json
import re

from agent.tools import Out, ToolError

SRC = "공공용지 무단점유 분석 결과(영상-문장 AI + 토지피복 AI · 연속지적도 대조 · 결과 확인 전)"
WORD = "무단 사용 의심 → 현장 확인"
TYPES = ["무단적치 쓰레기", "불법 형질변경"]
LANDS = ["도로공사 장부", "철도", "LH 사업지구", "도로"]
LAND_WORD = {"도로공사 장부": "고속도로(도로공사 장부)", "철도": "철도용지", "LH 사업지구": "LH 택지(사업지구)", "도로": "지목 도로"}
SIDO = {"11": "서울", "26": "부산", "27": "대구", "28": "인천", "29": "광주", "30": "대전", "31": "울산", "36": "세종", "41": "경기", "42": "강원", "51": "강원",
        "43": "충북", "44": "충남", "45": "전북", "52": "전북", "46": "전남", "47": "경북", "48": "경남", "50": "제주"}
JNAME = {"도": "도로", "철": "철도용지", "대": "대지", "임": "임야", "천": "하천", "구": "구거", "잡": "잡종지", "장": "공장용지", "차": "주차장", "전": "전", "답": "답",
         "창": "창고용지", "학": "학교용지", "과": "과수원", "유": "유지", "제": "제방", "공": "공원", "체": "체육용지", "묘": "묘지"}

SPECS = {
    "publand": {
        "description": "공공용지 무단점유 분석서비스 — 고속도로(도로공사 장부) · 철도용지 · LH 택지 등 공공용지 안 무단적치 쓰레기 · 불법 형질변경. "
                       "'전국 공공용지 무단점유 분석 결과와 레포트를 보여줘' · '○○ 구간 공공용지 무단점유 분석해 줘' · '무단적치 쓰레기 많은 시도'. "
                       "결과 · 표 · 지도 층 · 보고서(한글 · 엑셀)까지. 분석을 시키면 분석 서비스 카드와 같은 작업으로 시작한다.",
        "properties": {"request": {"type": "string", "description": "사용자 문장 그대로"},
                       "run": {"type": "boolean", "description": "분석을 새로 시작해 달라는 요청이면 true"}}},
}
HANDLERS: dict = {}
WRITE: set = set()
CONFIRM: set = set()
CLIENT: set = set()
WHY = {"publand": "공공용지 무단점유 결과(공공용지 대조 · 유형별 · 시도별) → 표 · 지도 층 · 보고서"}
SAY = {"publand": "공공용지 무단점유"}
HINT = "공공용지(고속도로 · 철도 · LH 택지) 무단점유 · 무단적치 쓰레기 · 불법 형질변경 결과나 보고서, 그 분석 시작은 publand 를 부른다."

ASK_RX = re.compile(r"공공\s*용지|무단\s*점유|무단\s*적치|형질\s*변경")
RUN_RX = re.compile(r"분석\s*(?:해|시작|돌려|실행)|돌려\s*(?:줘|주)|실행\s*해")
SHOW_RX = re.compile(r"결과|레포트|리포트|보고서|보여|알려|몇|통계|표|많은")
NATION_RX = re.compile(r"전국")


def allowed(name: str, p) -> bool:
    return getattr(p, "realm", None) == "lx" and getattr(p, "role", None) in ("staff", "admin")


async def _get(ctx, path, **params):
    r = await ctx.http.get(path, params={k: v for k, v in params.items() if v is not None})
    if r.status_code >= 400:
        try:
            msg = (r.json().get("error") or {}).get("message")
        except Exception:  # noqa: BLE001
            msg = None
        raise ToolError("publand_error", msg or "공공용지 무단점유 결과를 읽지 못했습니다", r.status_code)
    return r.json()


async def _card(conn) -> str | None:
    """공공용지 무단점유 카드(찾는 묶음 publand · 공개 승인된 판 먼저)."""
    return await conn.fetchval(
        "SELECT v.card_id FROM card_versions v LEFT JOIN models m ON m.id = ANY(v.model_ids) "
        "WHERE v.modules->>'change_types'='publand' OR m.input->>'change_types'='publand' "
        "ORDER BY (v.approved_at IS NOT NULL) DESC, v.approved_at DESC NULLS LAST, v.id DESC LIMIT 1")


async def _runs(ctx, nation: bool, q: str) -> list[dict]:
    """볼 수 있는 공공용지 무단점유 결과(새 것부터) — 남의 개인 결과는 빼고(own_scope)."""
    from landxi_api.deps import db
    p = ctx.principal
    async with db(realm="lx") as conn:
        rows = await conn.fetch(
            "SELECT c.job_id, c.state, c.done_at, g.name, g.source_name, j.options->>'private' AS priv, j.submitted_by, j.state AS jstate "
            "FROM change_runs c JOIN change_ranges g ON g.id=c.range_id JOIN jobs j ON j.id=c.job_id "
            "WHERE j.options->'change'->>'types'='publand' ORDER BY c.created_at DESC LIMIT 200")
    out = []
    for r in rows:
        if r["priv"] == "true" and r["submitted_by"] != getattr(p, "user_id", None) and not getattr(p, "is_admin", False):
            continue
        is_nat = r["source_name"] == "publand:national"
        if nation and not is_nat:
            continue
        if not nation and q:
            toks = [w for w in re.split(r"[\s()·,_\-/]+", r["name"] or "") if len(w) >= 2 and w not in ("공공용지", "구간", "범위")]
            if toks and not any(w in q for w in toks):
                continue
        out.append(dict(r) | {"national": is_nat})
    return out


def _sido(f: dict) -> str:
    a = str(f.get("addr") or "").split()
    pn = str(f.get("pnu") or "")
    return SIDO.get(pn[:2]) or (a[0] if a else "주소 미확인")


def _sgg(f: dict) -> str:
    a = str(f.get("addr") or "").split()
    return " ".join(a[:2]) if len(a) >= 2 else (a[0] if a else "주소 미확인")


def _map_png(feats: list[dict], bbox: list[float] | None) -> bytes | None:
    """지도 그림 — 시군구 경계(연한 선) + 찾은 곳(유형 색 점)."""
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        from matplotlib import font_manager
        from shapely.geometry import shape

        from landxi_api import config as LC
        have = {f.name for f in font_manager.fontManager.ttflist}
        plt.rcParams["font.family"] = [next((f for f in ("Malgun Gothic", "NanumGothic", "Noto Sans CJK KR") if f in have), "sans-serif")]
        fig, ax = plt.subplots(figsize=(6.2, 7.4), dpi=150)
        ax.set_facecolor("#F7F8FA")
        fc = json.loads((LC.SERVER_ROOT / "seed" / "sgg-simplified.geojson").read_text(encoding="utf-8"))
        for f in fc["features"]:
            g = shape(f["geometry"])
            for poly in getattr(g, "geoms", [g]):
                x, y = poly.exterior.xy
                ax.fill(x, y, facecolor="#FFFFFF", edgecolor="#D1D6DB", linewidth=0.3, zorder=1)
        col = {"무단적치 쓰레기": "#F04452", "불법 형질변경": "#FF9F1C"}
        for t in TYPES:
            pts = [(f["lng"], f["lat"]) for f in feats if f.get("type") == t and f.get("lng")]
            if pts:
                ax.scatter([p[0] for p in pts], [p[1] for p in pts], s=7, c=col[t], label=t, zorder=3, linewidths=0)
        if bbox:
            ax.set_xlim(bbox[0] - 0.05, bbox[2] + 0.05)
            ax.set_ylim(bbox[1] - 0.05, bbox[3] + 0.05)
        ax.set_aspect(1.25)
        ax.set_xticks([])
        ax.set_yticks([])
        for s in ax.spines.values():
            s.set_visible(False)
        ax.legend(loc="lower right", frameon=False, fontsize=8)
        buf = io.BytesIO()
        fig.tight_layout()
        fig.savefig(buf, format="png")
        plt.close(fig)
        return buf.getvalue()
    except Exception:  # noqa: BLE001
        return None


def _docs(name: str, period: str, feats: list[dict], by_type: dict, by_land: dict, by_sido: list, top: list, png: bytes | None, made: str, now):
    """한글(.hwpx) · 엑셀(.xlsx) — 같은 행(결과 파일 한 출처)."""
    from landxi_api import hwpx as HX
    from landxi_api.farm_more import _book, _info, _save, _sheet
    n = len(feats)
    m2 = sum(float(f.get("area_m2") or 0) for f in feats)
    title = "공공용지 무단점유 분석 결과 보고서(초안)"
    doc = HX.Doc()
    doc.title(title, f"{name} · {period} · 결과 확인 전")
    doc.notice(f"AI 가 찾은 곳은 모두 '{WORD}' 대상입니다. 위법 여부는 현장 확인 · 대부 · 허가 확인으로 판단합니다.")
    doc.heading("개요")
    doc.overview([("분석 서비스", "공공용지 무단점유 분석서비스"), ("범위", name), ("영상", period),
                  ("찾는 것", " · ".join(TYPES)), ("공공용지", "고속도로(도로공사 장부) · 철도용지 · LH 택지(사업지구) · 지목 도로"),
                  ("AI", "영상-문장 맞추기(CLIP ViT-L/14) + 토지피복 AI(경계) · 성능 미측정"),
                  ("찾은 곳", f"{n:,}곳 · 면적 합 {round(m2):,}㎡"), ("만든 날짜", made)], cols=1)
    if png:
        doc.figure(png, f"{name} 공공용지 무단점유 의심 위치", max_w=int(HX.TEXT_W * 0.7), note="빨강 = 무단적치 쓰레기 · 주황 = 불법 형질변경")
    doc.table([["유형", "곳", "면적(㎡)"]] + [[t, f"{v[0]:,}", f"{round(v[1]):,}"] for t, v in by_type.items()] + [["합계", f"{n:,}", f"{round(m2):,}"]],
              [40, 30, 30], aligns=["l", "r", "r"], total_row=True, caption="유형별")
    doc.table([["공공용지 대조", "곳"]] + [[LAND_WORD.get(k, k), f"{v:,}"] for k, v in by_land.items() if v] + [["합계", f"{n:,}"]],
              [60, 40], aligns=["l", "r"], total_row=True, caption="공공용지 대조별")
    if len(by_sido) > 1:
        doc.table([["시도", "무단적치 쓰레기", "불법 형질변경", "합계"]] + [[s, f"{a:,}", f"{b:,}", f"{a + b:,}"] for s, a, b in by_sido],
                  [28, 24, 24, 24], aligns=["l", "r", "r", "r"], caption="시도별")
    doc.heading("큰 것부터(상위 20곳)")
    doc.table([["주소 · 지번", "지목", "소유 구분", "유형", "공공용지 대조", "면적(㎡)"]] +
              [[f"{f.get('addr') or ''} {f.get('jibun') or ''}".strip() or "-", JNAME.get(f.get("jimok") or "", f.get("jimok") or "-"), f.get("owner") or "-",
                f.get("type"), f.get("land") or "-", f"{round(f.get('area_m2') or 0):,}"] for f in top[:20]],
              [34, 10, 16, 14, 16, 10], aligns=["l", "l", "l", "l", "l", "r"], caption=WORD)
    doc.source("Land-XI 공공용지 무단점유 분석서비스 결과 — 수 · 면적은 AI 가 그린 결과의 수와 넓이입니다(결과 확인 전 · 대조 탈락 제외). 지도 서비스 결과 층 · 목록 CSV 와 같은 값입니다.", made)
    hn = HX.safe_name(f"{name}_공공용지무단점유_보고서_{made[:10].replace('.', '')}")
    hb = doc.package(title, now)
    wb = _book()
    _sheet(wb, "목록", ["주소", "지번", "PNU", "지목", "소유 구분", "유형", "시점", "공공용지 대조", "면적(㎡)", "표기"],
           [[f.get("addr"), f.get("jibun"), f.get("pnu"), JNAME.get(f.get("jimok") or "", f.get("jimok")), f.get("owner"), f.get("type"), f.get("new") or "",
             f.get("land"), round(float(f.get("area_m2") or 0), 1), WORD] for f in sorted(feats, key=lambda f: -(f.get("area_m2") or 0))],
           num={8: "#,##0.0"}, widths=[26, 12, 22, 10, 16, 16, 8, 26, 12, 22], total=False)
    _sheet(wb, "유형별", ["유형", "곳", "면적(㎡)"], [[t, v[0], round(v[1])] for t, v in by_type.items()], num={1: "#,##0", 2: "#,##0"}, widths=[20, 12, 14])
    if by_sido:
        _sheet(wb, "시도별", ["시도", "무단적치 쓰레기", "불법 형질변경", "합계"], [[s, a, b, a + b] for s, a, b in by_sido], num={1: "#,##0", 2: "#,##0", 3: "#,##0"},
               widths=[14, 16, 16, 12])
    _info(wb, [("보고서", title), ("범위", name), ("영상", period), ("표기", WORD), ("만든 날짜", made), ("출처", SRC)])
    xn = re.sub(r"\.hwpx$", ".xlsx", hn)
    return hb, hn, _save(wb), xn


async def publand(args: dict, ctx) -> Out:
    from agent import config as AC
    from landxi_api.deps import db
    from landxi_api.envelope import env
    t = re.sub(r"\s+", " ", args.get("request") or ctx.state.get("msg") or "").strip()
    nation = bool(NATION_RX.search(t))
    want_run = bool(args.get("run")) or (bool(RUN_RX.search(t)) and not SHOW_RX.search(t))
    async with db(realm="lx") as conn:
        cid = await _card(conn)
    if not cid:
        raise ToolError("no_card", "공공용지 무단점유 분석서비스 카드가 아직 없습니다", 404)
    runs = await _runs(ctx, nation, t)
    done = [r for r in runs if r["state"] == "done"]
    live = [r for r in runs if r["state"] in ("queued", "running") and r["jstate"] in ("queued", "running")]
    out = Out(source=SRC, scope={"kind": "change", "sgg": "nation" if nation else None, "cls": TYPES})
    if want_run or not (done or live):
        if not nation:
            out.answer = ("어느 범위를 분석할지 알려 주세요 — '전국 공공용지 무단점유 분석해 줘' 또는 분석 서비스의 공공용지 무단점유 카드에서 영상을 고르면 그 범위를 분석합니다."
                          if not done else "")
            if not done:
                return out
        else:
            r = await ctx.http.post("/change/ranges/national", json={"card_id": cid})
            if r.status_code >= 400:
                raise ToolError("publand_error", ((r.json() or {}).get("error") or {}).get("message") or "전국 범위를 만들지 못했습니다", r.status_code)
            rg = r.json()
            r = await ctx.http.post("/change/runs", json={"range_id": rg["id"], "src_b": {"kind": "ngii", "year": 2024}, "via": "chatgeo", "card_id": cid, "later": True})
            if r.status_code >= 400:
                raise ToolError("publand_error", ((r.json() or {}).get("error") or {}).get("message") or "분석을 시작하지 못했습니다", r.status_code)
            run = r.json()
            if not run.get("cached"):
                out.whitelist.add("2024")
                out.answer = (f"전국 공공용지(고속도로 · 철도 · LH 택지) 무단점유 분석을 {'이어 보여 드립니다' if run.get('attached') else '시작했습니다'} — "
                              "2024년 국토지리정보원 항공영상. 진행은 아래 작업 카드에서 보고, 끝나면 지도와 알림으로 받습니다.")
                out.blocks.append({"type": "job", "job_id": run["job_id"], "label": "전국 공공용지 무단점유 분석", "href": f"../lx-map/?change={run['job_id']}",
                                   "show": {"op": "change_show", "job_id": run["job_id"], "range_id": rg["id"], "bbox": rg.get("bbox"), "name": rg.get("name")}})
                return out
            runs = await _runs(ctx, nation, t)
            done = [r for r in runs if r["state"] == "done"]
    if not done:
        j = live[0]
        out.answer = f"{j['name']} 공공용지 무단점유 분석이 아직 진행 중입니다. 끝나면 결과와 보고서를 보여 드립니다."
        out.blocks.append({"type": "job", "job_id": j["job_id"], "label": f"{j['name']} 공공용지 무단점유 분석", "href": f"../lx-map/?change={j['job_id']}"})
        return out
    job = done[0]["job_id"]
    st = await _get(ctx, f"/change/runs/{job}")
    fc = await _get(ctx, f"/change/runs/{job}/features")
    feats = [f["properties"] | {"id": f["id"]} for f in fc.get("features") or [] if not f["properties"].get("hidden")]
    name = st.get("range_name") or "대상지"
    pa, pb = st["period"]["a"], st["period"]["b"]
    two = (st.get("stats") or {}).get("publand", {}).get("two")
    period = f"{pa['word']} → {pb['word']}" if two else pb["word"]
    for k0 in ("a", "b"):
        out.whitelist |= set(re.findall(r"\d[\d,.]*", str(st["period"][k0].get("word") or "")))
    out.whitelist |= {str(pa["year"]), str(pb["year"]), str(name)}
    by_type = {t0: [sum(1 for f in feats if f["type"] == t0), sum(float(f.get("area_m2") or 0) for f in feats if f["type"] == t0)] for t0 in TYPES}
    by_land = {k: sum(1 for f in feats if f.get("land_kind") == k) for k in LANDS}
    sid: dict[str, list] = {}
    for f in feats:
        s = sid.setdefault(_sido(f), [0, 0])
        s[0 if f["type"] == TYPES[0] else 1] += 1
    by_sido = sorted(((k, v[0], v[1]) for k, v in sid.items()), key=lambda x: -(x[1] + x[2]))
    sgg: dict[str, int] = {}
    for f in feats:
        sgg[_sgg(f)] = sgg.get(_sgg(f), 0) + 1
    top_sgg = sorted(sgg.items(), key=lambda x: -x[1])[:5]
    top = sorted(feats, key=lambda f: -(f.get("area_m2") or 0))
    n = len(feats)
    kn = out.env("n", "찾은 곳(무단 사용 의심)", env(n, "곳", "inferred", SRC))
    kt = [out.env(f"t{i}", f"{t0} 곳", env(by_type[t0][0], "곳", "inferred", SRC)) for i, t0 in enumerate(TYPES)]
    km = out.env("m2", "면적 합(㎡)", env(round(sum(v[1] for v in by_type.values())), "m2", "inferred", SRC))
    kl = {k: out.env(f"l{i}", f"{LAND_WORD[k]} 안 곳", env(v, "곳", "inferred", SRC)) for i, (k, v) in enumerate(by_land.items()) if v}
    kp = out.env("pp", "공공용지 필지(층)", st["stats"]["publand"]["public_parcels"]) if (st.get("stats") or {}).get("publand", {}).get("public_parcels") else None
    nn = (st.get("stats") or {}).get("publand", {}).get("n_new")
    kw = out.env("new", "앞 시점에 없던 곳(신규)", nn) if nn and nn.get("value") is not None else None
    for s, _a, _b in by_sido[:5]:
        out.whitelist.add(s)
    for s, _v in top_sgg:
        out.whitelist |= set(s.split())
    lines = [f"{name} 공공용지 무단점유 — {period}",
             f"찾은 곳 {{{{{kn}}}}}(면적 합 {{{{{km}}}}}) — 무단적치 쓰레기 {{{{{kt[0]}}}}} · 불법 형질변경 {{{{{kt[1]}}}}}" + (f" · 신규 {{{{{kw}}}}}" if kw else ""),
             "공공용지 대조 — " + " · ".join(f"{LAND_WORD[k]} {{{{{v}}}}}" for k, v in kl.items()) + (f" (분석한 공공용지 필지 {{{{{kp}}}}})" if kp else "")]
    if len(by_sido) > 1:
        lines.append("많은 시도 — " + " · ".join(f"{s} {a + b:,}곳" for s, a, b in by_sido[:5]))
        for s, a, b in by_sido[:5]:
            out.whitelist.add(f"{a + b:,}")
    lines.append(f"모두 {WORD}(자동 판정 · 결과 확인 전). 지도에 결과 층을 띄우고 보고서(한글 · 엑셀)를 만들었습니다.")
    out.answer = "\n\n".join(lines)
    out.blocks.append({"type": "rows", "title": f"{name} · 큰 것부터 10곳", "cols": ["주소 · 지번", "지목", "소유 구분", "유형", "공공용지 대조", "면적(㎡)"],
                       "rows": [[f"{f.get('addr') or ''} {f.get('jibun') or ''}".strip() or "-", JNAME.get(f.get("jimok") or "", f.get("jimok") or "-"),
                                 f.get("owner") or "-", f["type"], f.get("land") or "-", f"{round(f.get('area_m2') or 0):,}"] for f in top[:10]]})
    for f in top[:10]:
        out.whitelist |= set(re.findall(r"\d[\d,.\-]*", f"{f.get('addr') or ''} {f.get('jibun') or ''} {f.get('land') or ''} {round(f.get('area_m2') or 0):,}"))
    out.ui_actions.append({"op": "change_show", "job_id": job, "range_id": st.get("range_id"), "year_a": pa["year"], "year_b": pb["year"], "name": name})
    # 보고서 — 보기(report.json) · 한글 · 엑셀 · 목록 CSV
    now = dt.datetime.now(dt.timezone(dt.timedelta(hours=9)))
    made = now.strftime("%Y.%m.%d %H:%M")
    bbox = None
    if feats:
        xs, ys = [f["lng"] for f in feats if f.get("lng")], [f["lat"] for f in feats if f.get("lat")]
        bbox = [min(xs), min(ys), max(xs), max(ys)] if xs else None
    import asyncio

    def build():
        png = _map_png(feats, bbox)
        return png, _docs(name, period, feats, {k: v for k, v in by_type.items()}, by_land, by_sido, top, png, made, now)
    png, (hb, hn, xb, xn) = await asyncio.to_thread(build)
    d0 = AC.run_dir(ctx.run_id)
    (d0 / hn).write_bytes(hb)
    (d0 / "draft.hwpx").write_bytes(hb)
    (d0 / xn).write_bytes(xb)
    if png:
        (d0 / "publand-map.png").write_bytes(png)
    try:
        from landxi_api import xreport as XR
        spec = {"kind": "publand", "title": f"{name} 공공용지 무단점유", "src": SRC,
                "kpis": [{"label": "찾은 곳", "value": n, "unit": "곳"}, *({"label": t0, "value": by_type[t0][0], "unit": "곳"} for t0 in TYPES),
                         {"label": "면적 합", "value": round(sum(v[1] for v in by_type.values()) / 1e4, 1), "unit": "ha", "d": 1}],
                "panels": [{"type": "donut", "title": "유형별", "unit": "곳", "rows": [{"k": t0, "label": t0, "v": by_type[t0][0]} for t0 in TYPES]},
                           {"type": "donut", "title": "공공용지 대조별", "unit": "곳", "rows": [{"k": k, "label": LAND_WORD[k], "v": v} for k, v in by_land.items() if v]},
                           *([{"type": "bar", "title": "시도별", "unit": "곳", "rows": [{"k": s, "label": s, "v": a + b} for s, a, b in by_sido[:17]]}] if len(by_sido) > 1 else []),
                           {"type": "rank", "title": "많은 시군구", "unit": "곳", "rows": [{"k": s, "label": s, "v": v} for s, v in top_sgg]}],
                "say": [f"{name}에서 공공용지 안 무단 사용 의심 {n:,}곳을 찾았습니다.", f"모두 {WORD} 대상입니다(자동 판정 · 결과 확인 전)."],
                "note": "영상-문장 맞추기 AI + 토지피복 AI · 성능 미측정 · 연속지적도 대조"}
        files = {"hwpx": {"href": AC.run_href(ctx.run_id, hn), "name": hn}, "xlsx": {"href": AC.run_href(ctx.run_id, xn), "name": xn}}
        (d0 / "report.json").write_text(json.dumps(XR.view_doc(spec, now, files), ensure_ascii=False, default=str), encoding="utf-8")
        out.blocks.append({"type": "report", "label": f"{name} 공공용지 무단점유 보고서", "href": AC.run_href(ctx.run_id, "report.json")})
    except Exception:  # noqa: BLE001
        pass
    out.blocks.append({"type": "file", "label": hn, "href": AC.run_href(ctx.run_id, hn)})
    out.blocks.append({"type": "file", "label": xn, "href": AC.run_href(ctx.run_id, xn)})
    out.blocks.append({"type": "file", "label": f"{name}_목록.csv", "href": f"/api/v1/change/runs/{job}/occupy?format=csv"})
    if png:
        out.blocks.append({"type": "image", "src": AC.run_href(ctx.run_id, "publand-map.png"), "caption": "보고서 지도 그림", "tag": "공공용지 무단점유"})
    for f in top[:2]:
        out.blocks.append({"type": "image", "src": f"/api/v1/change/runs/{job}/thumbs/{f['id']}_b.png", "caption": f"{f.get('addr') or ''} {f.get('jibun') or ''} · {f['type']}",
                           "tag": "근거 영상"})
    ctx.state["artifact"] = {"file_url": f"/api/v1/agent/runs/{ctx.run_id}/draft.hwpx", "href": AC.run_href(ctx.run_id, hn), "filename": hn, "place": name}
    out.data = {"범위": name, "영상": period, "보고서": hn}
    return out


HANDLERS["publand"] = publand


def ROUTE_FIRST(msg: str, ctx):
    """모델 앞 직행 — 공공용지 · 무단점유 · 무단적치 · 형질변경 낱말 + (결과 · 보고서 · 분석) 요청이면 이 도구."""
    if getattr(getattr(ctx, "principal", None), "realm", None) != "lx" or getattr(ctx, "lang", "ko") != "ko":
        return None
    t = re.sub(r"\s+", " ", msg or "").strip()
    if not t or len(t) > 160 or not ASK_RX.search(t):
        return None
    if not (SHOW_RX.search(t) or RUN_RX.search(t)):
        return None
    return {"tool": "publand", "args": {"request": t, "run": bool(RUN_RX.search(t) and not SHOW_RX.search(t))}}


def _route_front():
    """대상지 · 지도 서비스 직행보다 앞(‘보고서’ 낱말이 지역 보고서로 먹히지 않게)."""
    try:
        from . import ROUTES
    except Exception:  # noqa: BLE001
        return
    ROUTES[:] = [r for r in ROUTES if r[0] != "publand_first"]
    at = next((i for i, r in enumerate(ROUTES) if r[0] in ("site_first", "mapsvc_first")), 0)
    ROUTES.insert(at, ("publand_first", ROUTE_FIRST))


_route_front()
