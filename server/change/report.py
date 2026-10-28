"""국토 변화 탐지 보고서(개조식) — 구간 개요 → 변화 요약(유형 · 안/밖 · 판정) → 필지별 목록(근거 썸네일 A/B) → 권고 조치.

값은 모두 그 결과 파일(changes.geojson · stats.json)과 판정 기록(change_marks) 한 출처 — 지도 · 표 · CSV 와 같은 값.
문장은 명사형 종결 · 불릿 · 숫자(지어낸 수 0). 권고 조치는 유형 · 지목 · 판정에서 정해진 규칙으로만(모델 문장 0).
"""
from __future__ import annotations

import datetime as dt
import html

KST = dt.timezone(dt.timedelta(hours=9))
TYPES = ["신축", "소실", "경작 전환", "포장 확대"]
STATUSES = ["미확인", "현장확인", "불법", "적법", "철거완료"]
JNAME = {"도": "도로", "철": "철도용지", "대": "대지", "임": "임야", "천": "하천", "구": "구거", "잡": "잡종지", "장": "공장용지", "차": "주차장",
         "창": "창고용지", "학": "학교용지", "과": "과수원", "목": "목장용지", "유": "유지", "제": "제방", "주": "주유소용지", "전": "전", "답": "답"}
ORDER = {"신축": 0, "포장 확대": 1, "소실": 2, "경작 전환": 3}
MAX_ROWS = 30
MAX_THUMBS = 8


def _n(v) -> str:
    return f"{v:,}"


def _src_line(run: dict, ya: int, yb: int) -> str:
    """두 시점 영상 한 줄 — 국토지리정보원 두 해 · 또는 등록 영상(공유 데이터 · 내 영상 · 10-23 원칙 329)."""
    import json
    sr = run.get("sources") or {}
    if isinstance(sr, str):
        sr = json.loads(sr)
    if not any((sr.get(k) or {}).get("kind") == "imagery" for k in ("a", "b")):
        return f"국토지리정보원 항공정사영상 {ya}년 → {yb}년"
    def w(s, y):
        if (s or {}).get("kind") != "imagery":
            return f"{y}년 국토지리정보원 항공영상"
        return f"{y}년 {'내 영상' if s.get('own') else '공유 데이터'} · {s.get('name') or '영상'}"
    return f"{w(sr.get('a'), ya)} → {w(sr.get('b'), yb)}"


def _types(bt: dict) -> list[str]:
    """요약에 쓰는 유형 — 국토 변화 기본(TYPES) 다음 카드마다 더한 유형(산사태 취약지구 등 · 10-25) · 식생 증감(참고)은 뺀다."""
    return [t for t in TYPES if t in bt] + [t for t in bt if t not in TYPES and t != "식생 증감"]


def _v(x):
    return x.get("value") if isinstance(x, dict) else x


def build(*, rng: dict, run: dict, stats: dict, fc: dict, marks: dict, card_name: str | None = None, zones: list | None = None,
          job_id: str | None = None, layer_id: str | None = None) -> dict:
    """보고서 한 장의 내용(화면 미리보기 · PDF 가 같은 것을 그린다)."""
    if stats.get("mode") == "ijimok":
        return build_ijimok(rng=rng, run=run, stats=stats, fc=fc, marks=marks, job_id=job_id, layer_id=layer_id)
    word = str(card_name or "국토 변화 분석서비스").replace(" 분석서비스", "").strip() or "국토 변화"
    ya, yb = run["year_a"], run["year_b"]
    feats = [f for f in fc.get("features") or [] if not f["properties"].get("hidden")]
    inside = [f for f in feats if f["properties"].get("inside_row") == "내"]
    bt = stats.get("by_type") or {}
    st_count = {s: 0 for s in STATUSES}
    for f in feats:
        st_count[(marks.get(f["id"]) or {}).get("status") or "미확인"] += 1
    gsd = "25cm" if stats.get("zoom") == 18 else "51cm"
    made = dt.datetime.now(KST).strftime("%Y. %m. %d.")
    overview = [
        f"대상지: {rng['name']} — {rng.get('kind_label') or '구역선'} · 버퍼 {rng.get('buffer') or '-'} · 분석 범위 {stats.get('range_km2', 0):,.2f}㎢",
        f"비교 영상: {_src_line(run, ya, yb)}(두 시점 같은 격자 · {gsd})",
        "방법: 토지피복 AI(U-Net · 12분류) 두 해 결과의 바뀐 자리 → 50㎡ 이상 변화 폴리곤 → 구역선 · 연속지적도 필지와 겹쳐 봄",
        "성격: AI 탐지 결과(결과 확인 전) — 판정은 현장 확인으로",
    ]
    if job_id:                                                   # H3(10-28 v5) — 근거 레이어 · 작업 ID 가 보고서에 따라간다
        overview.append(f"근거 레이어 ID: {layer_id or job_id} · 작업 ID: {job_id}")
    summary = [f"구역선 안 변화 {_n(stats['n_in'])}건 · 구역선 밖(버퍼) {_n(stats['n_out'])}건 · 면적 합 {_n(round(stats['m2']))}㎡"]
    for t in _types(bt):
        b = bt.get(t)
        if b and b.get("n"):
            summary.append(f"{t}: 구역선 안 {_n(b['in'])}건 · 밖 {_n(b['out'])}건 · {_n(round(b['m2']))}㎡")
    if not stats.get("n"):
        summary.append("두 시점 사이 찾는 변화가 없었음")
    for z in zones or []:                                        # 지구별(올린 도형 하나하나 · 10-25)
        summary.append(f"지구 {z['name']}: 변화 {_n(_v(z['n']) or 0)}건 · {_n(round(_v(z['area']) or 0))}㎡")
    judged = sum(v for k, v in st_count.items() if k != "미확인")
    summary.append("판정 현황: " + " · ".join(f"{k} {_n(v)}" for k, v in st_count.items()) + f"(판정 {_n(judged)}건)")
    rows = sorted(inside, key=lambda f: (ORDER.get(f["properties"]["type"], 9), -f["properties"]["area_m2"]))
    table = []
    for f in rows[:MAX_ROWS]:
        p = f["properties"]
        table.append({"id": f["id"], "jibun": p.get("jibun") or "-", "jimok": JNAME.get(p.get("jimok") or "", p.get("jimok") or "-"),
                      "owner": p.get("owner") or "-", "use": p.get("use") or "-", "type": p["type"], "area": f"{round(p['area_m2']):,}㎡",
                      "status": (marks.get(f["id"]) or {}).get("status") or "미확인", "memo": (marks.get(f["id"]) or {}).get("memo") or "",
                      "at": ((marks.get(f["id"]) or {}).get("at") or "")[:10] or "-"})
    thumbs = [r for r in table if r["type"] != "경작 전환"][:MAX_THUMBS] or table[:MAX_THUMBS]
    # 권고 조치(규칙) — 유형 · 지목 · 판정
    rec = []
    road_new = [r for r in table if r["type"] == "신축" and r["jimok"] in ("도로", "철도용지")]
    if road_new:
        rec.append(f"지목 {'·'.join(sorted({r['jimok'] for r in road_new}))} 필지 위 신축 {_n(len(road_new))}건 — 현장 확인 후 무단 점용 여부 확인 · 점용 허가 대장 대조")
    pave = [r for r in table if r["type"] == "포장 확대"]
    if pave:
        rec.append(f"구역선 안 포장 확대 {_n(len(pave))}건 — 도로구역 안 무단 포장 · 진출입로 설치 여부 확인")
    lost = [r for r in table if r["type"] == "소실"]
    if lost:
        rec.append(f"건물 소실 {_n(len(lost))}건 — 철거 완료 여부 확인 · 대장 정리")
    forest = [r for r in table if str(r["type"]).startswith("산림 →")]
    if forest:
        rec.append(f"산림이 나지 · 도로 · 건물로 바뀐 곳 {_n(len(forest))}건 — 현장 확인 후 사면 상태 · 허가 여부 확인")
    farm = [r for r in table if r["type"] == "경작 전환"]
    if farm:
        rec.append(f"경작 전환 {_n(len(farm))}건 — 두 해 촬영 계절 차이 가능성 · 영상 대조 뒤 경작 점용 여부 확인")
    if st_count.get("불법"):
        rec.append(f"불법 판정 {_n(st_count['불법'])}건 — 원상회복 요구 · 조치 계획 수립")
    if st_count.get("현장확인"):
        rec.append(f"현장확인 대상 {_n(st_count['현장확인'])}건 — 현장 점검 일정 수립 · 사진 · 판정 기록")
    rec.append("다음 해 국토지리정보원 영상 공개 시 같은 대상지로 다시 비교 · 판정 이력 이어 관리")
    return {"title": f"{rng['name']} {word} 변화 탐지 보고(초안)", "made": made, "period": f"{ya}년 → {yb}년", "overview": overview, "summary": summary,
            "status": st_count, "table": table, "more": max(0, len(rows) - MAX_ROWS), "thumbs": [r["id"] for r in thumbs],
            "recommend": rec, "source": f"출처 Land-XI 국토 변화 분석서비스 결과 · 판정 기록 — 지도 · 필지 표 · CSV 와 같은 값 · {made}"}


IJ_ORDER = ["점유의심", "지목미정리", "유휴산림화", "수역구거", "기타", "미확정_나지초지", "정상_지목일치"]


def build_ijimok(*, rng: dict, run: dict, stats: dict, fc: dict, marks: dict, job_id: str | None, layer_id: str | None) -> dict:
    """이지목 현황(카드 ② · 10-28 v5) 보고 — 판정 층별 필지 수 · 면적 → 이지목 필지 목록(근거 영상 한 장) → 권고 조치. 값은 결과 파일 · 판정 기록 한 출처."""
    yr = run["year_b"]
    feats = fc.get("features") or []
    bt = stats.get("by_type") or {}
    st_count = {s: 0 for s in STATUSES}
    for f in feats:
        st_count[(marks.get(f["id"]) or {}).get("status") or "미확인"] += 1
    made = dt.datetime.now(KST).strftime("%Y. %m. %d.")
    overview = [f"대상지: {rng['name']} — {rng.get('kind_label') or '구역선'} · 분석 범위 {stats.get('range_km2', 0):,.2f}㎢ · 필지 {_n(stats['n'])}개",
                f"영상: {_src_line(run, yr, yr).split(' → ')[-1]}({'25cm' if stats.get('zoom') == 18 else '51cm'})",
                "방법: 토지피복 AI(U-Net · 12분류) → 필지마다 실제 쓰임 → 지목과 견줌(판정 층 7종)",
                "성격: AI 판정(결과 확인 전) — 판단은 현장점검으로"]
    if job_id:
        overview.append(f"근거 레이어 ID: {layer_id or job_id} · 작업 ID: {job_id}")
    summary = [f"{t.replace('_', ' ')}: {_n(bt[t]['n'])}필지 · {_n(round(bt[t]['m2']))}㎡" for t in IJ_ORDER if (bt.get(t) or {}).get("n")]
    summary.append("판정 현황: " + " · ".join(f"{k} {_n(v)}" for k, v in st_count.items()))
    rows = sorted([f for f in feats if f["properties"]["type"] not in ("정상_지목일치", "미확정_나지초지")],
                  key=lambda f: (IJ_ORDER.index(f["properties"]["type"]) if f["properties"]["type"] in IJ_ORDER else 9, -f["properties"]["area_m2"]))
    table = []
    for f in rows[:MAX_ROWS]:
        p = f["properties"]
        m = marks.get(f["id"]) or {}
        table.append({"id": f["id"], "jibun": p.get("jibun") or "-", "jimok": JNAME.get(p.get("jimok") or "", p.get("jimok") or "-"), "owner": p.get("owner") or "-",
                      "use": p.get("use") or "-", "type": str(p["type"]).replace("_", " "), "area": f"{round(p['area_m2']):,}㎡",
                      "status": m.get("status") or "미확인", "memo": m.get("memo") or "", "at": (m.get("at") or "")[:10] or "-"})
    rec = []
    for t, w in (("점유의심", "도로 지목인데 경작 · 건물로 쓰이는 필지 — 현장점검 뒤 점용 허가 대장 대조"),
                 ("지목미정리", "도로로 쓰이는데 지목이 도로가 아닌 필지 — 지목 변경(대장 정리) 대상"),
                 ("유휴산림화", "도로 지목인데 산림으로 덮인 필지 — 유휴지 활용 · 처분 검토"),
                 ("수역구거", "도로 지목인데 수역 · 구거인 필지 — 현장점검 · 지목 정리 검토")):
        if (bt.get(t) or {}).get("n"):
            rec.append(f"{t} {_n(bt[t]['n'])}필지 — {w}")
    rec.append("다음 해 영상 공개 시 같은 대상지로 다시 판정 · 판정 이력 이어 관리")
    return {"title": f"{rng['name']} 이지목 현황 보고(초안)", "made": made, "period": f"{yr}년", "overview": overview, "summary": summary, "status": st_count,
            "table": table, "more": max(0, len(rows) - MAX_ROWS), "thumbs": [r["id"] for r in table[:MAX_THUMBS]], "recommend": rec, "one": True,
            "source": f"출처 Land-XI 이지목 현황 분석서비스 결과 · 판정 기록 — 지도 · 필지 표 · CSV 와 같은 값 · {made}"}


def _e(s) -> str:
    return html.escape(str(s if s is not None else ""))


def html_body(r: dict, yr: tuple[int, int]) -> str:
    """PDF 용 HTML(썸네일은 a_{id}.png · b_{id}.png 이름으로 묶음에 넣는다)."""
    li = lambda xs: "<ul>" + "".join(f"<li>{_e(x)}</li>" for x in xs) + "</ul>"  # noqa: E731
    one = r.get("one")
    out = [f"<p class='k'>{'이지목 현황' if one else '국토 변화 모니터링'} · {_e(r['period'])}</p><h1>{_e(r['title'])}</h1><p class='sub'>만든 날 {_e(r['made'])}</p>",
           "<h2>□ 구간 개요</h2>", li(r["overview"]), f"<h2>□ {'판정 요약' if one else '변화 요약'}</h2>", li(r["summary"]),
           f"<h2>□ {'이지목 필지 목록' if one else '필지별 목록(구역선 안)'}</h2>"]
    head = ["번호", "지번", "지목", "소유구분", "이지목 판정" if one else "변화 유형", "면적", "판정", "판정일"]
    rows = "".join("<tr>" + "".join(f"<td>{_e(x)}</td>" for x in (t["id"], t["jibun"], t["jimok"], t["owner"], t["type"], t["area"], t["status"], t.get("at", "-"))) + "</tr>"
                   for t in r["table"])
    out.append("<table><tr>" + "".join(f"<th>{h}</th>" for h in head) + "</tr>" + rows + "</table>")
    if r["more"]:
        out.append(f"<p class='cap'>그 밖 {r['more']:,}건은 필지 표(CSV)에서 봅니다.</p>")
    if r["thumbs"]:
        out.append(f"<h2>□ 근거 영상({yr[1]}년)</h2><table>" if one else f"<h2>□ 근거 영상({yr[0]}년 · {yr[1]}년)</h2><table>")
        by = {t["id"]: t for t in r["table"]}
        for fid in r["thumbs"]:
            t = by.get(fid) or {}
            out.append(f"<tr><td style='width:22%'>{_e(fid)}<br/>{_e(t.get('jibun'))}<br/>{_e(t.get('type'))} · {_e(t.get('area'))}</td>"
                       + (f"<td><img src='b_{fid}.png'/></td><td></td></tr>" if one else f"<td><img src='a_{fid}.png'/></td><td><img src='b_{fid}.png'/></td></tr>"))
        out.append("</table>")
    out.append("<h2>□ 권고 조치</h2>")
    out.append(li(r["recommend"]))
    out.append(f"<p class='src'>{_e(r['source'])}</p>")
    return "".join(out)
