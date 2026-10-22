"""XI ChatGEO 국토 변화 탐지 도구 셋(10-22 CHANGE-DEMO-ORDER P0-4).

· run_change_detection(range_id, year_a, year_b) — 변화 탐지 실행(같은 범위 · 같은 두 해의 끝난 결과가 있으면 그것) → 지도에 결과 층 ·
  두 해 가르기 → 요약(구역선 안 건수 · 유형별 · 면적 큰 곳 셋). 하는 일을 채팅에 단계로(영상 확보 → AI 분석 → 구역선 · 필지 교차).
· intersect_parcels(layer_id, filters{유형, 지목, 소유구분, inside_row}) — 조건에 맞는 필지 표(지번 · 지목 · 소유구분 · 유형 · 면적) + 지도 강조 + CSV.
· describe_change(polygon_id) — 그 변화의 두 해 썸네일을 비전 모델(vLLM Gemma 4 · XI ChatGEO 와 같은 모델)에 넣어 1~2문장(AI 의견 · 근거 아님).
꼬리 질문: 직전 답(같은 창 prev_run · Redis 24h)의 변화 결과 · 고른 폴리곤을 기본 대상으로. 화면이 보내는 context.change 가 먼저.
숫자는 봉투로만(지번 · 연도 글자는 whitelist). 지역 이름은 코드에 없다 — 범위 이름은 데이터(change_ranges.name).
"""
from __future__ import annotations

import asyncio
import json
import re
import time

from agent.tools import Out, ToolError

SRC = "변화 탐지 결과(토지피복 U-Net · 두 해 비교 · 결과 확인 전)"
TYPES = ["신축", "소실", "경작 전환", "포장 확대"]
JIMOK = {"도로": "도", "철도": "철", "철도용지": "철", "대지": "대", "임야": "임", "하천": "천", "구거": "구", "잡종지": "잡", "공장": "장",
         "공장용지": "장", "주차장": "차", "주유소": "주", "창고": "창", "학교": "학", "목장": "목", "과수원": "과", "유지": "유", "제방": "제",
         "전": "전", "답": "답"}
# 지목 한 글자 → 이름(지적법 지목 28종 가운데 화면에 나오는 것 · 없으면 글자 그대로)
JNAME = {"도": "도로", "철": "철도용지", "대": "대지", "임": "임야", "천": "하천", "구": "구거", "잡": "잡종지", "장": "공장용지", "차": "주차장",
         "창": "창고용지", "학": "학교용지", "과": "과수원", "목": "목장용지", "유": "유지", "제": "제방", "주": "주유소용지", "전": "전", "답": "답",
         "공": "공원", "체": "체육용지", "원": "유원지", "종": "종교용지", "사": "사적지", "묘": "묘지", "광": "광천지", "염": "염전", "수": "수도용지", "양": "양어장"}
TYPE_WORDS = [(r"건물\s*(이|가)?\s*(생긴|생겼|들어선|새로|지어)|신축|새\s*건물", "신축"), (r"건물\s*(이|가)?\s*(없어|사라|철거|헐)|소실", "소실"),
              (r"경작|농사|밭으로|논으로", "경작 전환"), (r"포장|아스팔트|콘크리트", "포장 확대")]

SPECS = {
    "run_change_detection": {
        "description": "국토 변화 탐지 — 대상지(구역선 · 필지 · 행정구역 범위)의 두 해 국토지리정보원 항공영상을 비교해 새로 생긴 건물(신축) · "
                       "없어진 건물(소실) · 경작 전환 · 포장 확대를 찾는다. '2019년과 2024년 비교해서 새로 생긴 것 찾아줘' · '변화 탐지' · "
                       "'철도용지도 같은 방식으로'. 같은 범위 · 같은 두 해 결과가 있으면 그것을 쓴다.",
        "properties": {"range_id": {"type": "string", "description": "대상지 id(없으면 지금 화면 · 직전 답의 대상지)"},
                       "range_query": {"type": "string", "description": "대상지 이름 일부(예: '철도')"},
                       "year_a": {"type": "integer", "description": "앞 해"}, "year_b": {"type": "integer", "description": "뒤 해"}}},
    "intersect_parcels": {
        "description": "변화 탐지 결과 × 필지 — 조건(변화 유형 · 지목 · 소유구분 · 구역선 안/밖)에 맞는 필지 표(지번 · 지목 · 소유구분 · 유형 · 면적) + 지도 강조 + CSV. "
                       "'지목이 도로인데 건물 생긴 필지만 표로'.",
        "properties": {"layer_id": {"type": "string", "description": "변화 탐지 결과 id(없으면 직전 결과)"},
                       "types": {"type": "array", "items": {"type": "string"}, "description": "신축 · 소실 · 경작 전환 · 포장 확대"},
                       "jimok": {"type": "array", "items": {"type": "string"}, "description": "지목 한 글자(도 · 철 · 전 · 답 · 대 · 임 …)"},
                       "owner": {"type": "array", "items": {"type": "string"}, "description": "소유구분"},
                       "inside_row": {"type": "string", "description": "'내'(구역선 안) · '외'(밖)"}}},
    "describe_change": {
        "description": "변화 폴리곤 하나를 두 해 영상 썸네일로 보고 무엇이 바뀌었는지 1~2문장(AI 의견 · 근거 아님). '이거 뭐야?' · '이 변화 설명해 줘'.",
        "properties": {"polygon_id": {"type": "string", "description": "변화 폴리곤 번호(c0001 …) · 없으면 지금 고른 것"},
                       "layer_id": {"type": "string", "description": "변화 탐지 결과 id(없으면 직전 결과)"}}},
}
SPECS["change_report"] = {
    "description": "국토 변화 탐지 결과 보고서(개조식 — 구간 개요 · 변화 요약 · 필지별 목록과 두 해 썸네일 · 권고 조치) 미리보기 + PDF. "
                   "'도로공사 보고용 보고서 만들어줘' · '변화 탐지 보고서'.",
    "properties": {"layer_id": {"type": "string", "description": "변화 탐지 결과 id(없으면 직전 결과)"}}}
HANDLERS: dict = {}
WRITE: set = set()
CONFIRM: set = set()
CLIENT: set = set()
WHY = {"change_report": "변화 탐지 결과 · 판정 → 개조식 보고서 · PDF", "run_change_detection": "두 해 항공영상 → 토지피복 AI → 변화 폴리곤 → 구역선 · 필지 교차",
       "intersect_parcels": "변화 폴리곤 × 필지(지목 · 소유구분) 표", "describe_change": "두 해 썸네일 → AI 비전 의견"}
SAY = {"change_report": "변화 탐지 보고서", "run_change_detection": "변화 탐지", "intersect_parcels": "필지 교차 표", "describe_change": "변화 설명"}
HINT = ("두 해 영상을 비교해 새로 생긴 것 · 없어진 것 · 변화를 찾아 달라는 요청은 run_change_detection 을 부른다(연도를 말하면 year_a · year_b). "
        "변화 결과에서 지목 · 소유구분 · 유형 조건의 필지 표는 intersect_parcels, 고른 변화 하나의 설명은 describe_change.")


def allowed(name: str, p) -> bool:
    if getattr(p, "realm", None) == "lx":
        return getattr(p, "role", None) in ("staff", "admin")
    return name in ("intersect_parcels", "describe_change", "change_report") and getattr(p, "realm", None) == "tenant"


# ── 기억(꼬리 질문) ─────────────────────────────────────────────────────────
async def _mem_get(ctx) -> dict:
    c = (ctx.context or {}).get("change") or {}
    out = {}
    prev = str((ctx.context or {}).get("prev_run") or "").strip()
    if prev and getattr(ctx, "r", None) is not None:
        try:
            raw = await ctx.r.get(f"agent:runs:{prev}:change")
            if raw:
                out = json.loads(raw)
        except Exception:  # noqa: BLE001
            out = {}
    for k in ("job_id", "range_id", "project_id", "sel", "year_a", "year_b"):
        if c.get(k):
            out[k] = c[k]
    return out


async def _mem_set(ctx, **kw):
    if getattr(ctx, "r", None) is None:
        return
    cur = await _mem_get(ctx)
    cur.update({k: v for k, v in kw.items() if v is not None})
    try:
        await ctx.r.set(f"agent:runs:{ctx.run_id}:change", json.dumps(cur, ensure_ascii=False), ex=86400)
    except Exception:  # noqa: BLE001
        pass


async def _get(ctx, path, **params):
    r = await ctx.http.get(path, params={k: v for k, v in params.items() if v is not None})
    if r.status_code >= 400:
        try:
            msg = (r.json().get("error") or {}).get("message")
        except Exception:  # noqa: BLE001
            msg = None
        raise ToolError("change_error", msg or "변화 탐지 결과를 읽지 못했습니다", r.status_code)
    return r.json()


async def _emit(ctx, event, data):
    try:
        from agent import runner as RN
        await RN.emit(ctx, event, data)
    except Exception:  # noqa: BLE001
        pass


STEP_I = (91, 92, 93)


async def _steps(ctx, ya, yb, done: int):
    steps = [{"i": STEP_I[0], "tool": "change_imagery", "say": f"국토지리정보원 항공영상 확보 · {ya}년 · {yb}년"},
             {"i": STEP_I[1], "tool": "change_infer", "say": "토지피복 AI 분석 · 두 해"},
             {"i": STEP_I[2], "tool": "change_join", "say": "변화 폴리곤 · 구역선 · 필지 겹쳐 보기"}]
    if done == 0:
        await _emit(ctx, "agent.plan", {"steps": steps, "round": 1, "route": {"intent": "map", "backend": "runtime"}})
    for k in range(done):
        await _emit(ctx, "agent.tool.result", {"i": STEP_I[k], "tool": steps[k]["tool"], "ok": True, "ui_actions": [], "summary": steps[k]["say"]})


async def _resolve_range(ctx, args, mem) -> dict:
    rid = args.get("range_id")
    q = (args.get("range_query") or "").strip()
    if q:
        items = (await _get(ctx, "/change/ranges"))["items"]
        hit = [x for x in items if q in (x.get("name") or "") or q in (x.get("source_name") or "")]
        if not hit:
            raise ToolError("not_found", f"'{q}' 대상지를 찾지 못했습니다 — 프로젝트에서 대상지를 먼저 정해 주세요", 404)
        return await _get(ctx, f"/change/ranges/{hit[0]['id']}")       # 목록 줄에는 영상 연도가 없다 — 한 건으로 다시
    if not rid:
        rid = mem.get("range_id")
    if not rid and mem.get("project_id"):
        items = (await _get(ctx, "/change/ranges", project_id=mem["project_id"]))["items"]
        rid = items[0]["id"] if items else None
    if not rid:
        items = (await _get(ctx, "/change/ranges"))["items"]
        if len(items) == 1:
            rid = items[0]["id"]
    if not rid:
        raise ToolError("no_range", "어느 대상지를 비교할지 정하지 못했습니다 — 프로젝트(구역선)를 연 지도에서 물어봐 주세요", 400)
    return await _get(ctx, f"/change/ranges/{rid}")


def _v(e):
    return (e or {}).get("value")


async def run_change_detection(args: dict, ctx) -> Out:
    t0 = time.perf_counter()
    mem = await _mem_get(ctx)
    rg = await _resolve_range(ctx, args, mem)
    ys = sorted(y["year"] for y in rg.get("imagery_years") or [])
    want = [int(y) for y in (args.get("year_a"), args.get("year_b")) if y]
    if len(want) < 2 and mem.get("year_a") and mem.get("year_b") and not args.get("year_a"):
        want = [int(mem["year_a"]), int(mem["year_b"])]
    if len(want) < 2 and len(rg.get("years") or []) >= 2:
        want = [rg["years"][0]["year"], rg["years"][-1]["year"]]
    if len(want) < 2 and len(ys) >= 2:
        want = [ys[0], ys[-1]]
    if len(want) < 2:
        raise ToolError("no_imagery", "이 대상지에는 비교할 두 해 영상이 없습니다", 409)
    ya, yb = sorted(want[:2])
    missing = [y for y in (ya, yb) if y not in ys]
    if missing:
        out = Out(source="국토지리정보원 영상 목록")
        out.whitelist |= {str(y) for y in ys + [ya, yb]}
        out.answer = (f"{' · '.join(f'{y}년' for y in missing)} 국토지리정보원 영상이 이 대상지에 없습니다. "
                      f"있는 해: {' · '.join(f'{y}년' for y in ys)}.")
        return out
    await _steps(ctx, ya, yb, 0)
    r = await ctx.http.post("/change/runs", json={"range_id": rg["id"], "year_a": ya, "year_b": yb})
    if r.status_code >= 400:
        raise ToolError("change_error", ((r.json() or {}).get("error") or {}).get("message") or "변화 탐지를 시작하지 못했습니다", r.status_code)
    run = r.json()
    job = run["job_id"]
    if run.get("cached"):
        for k in (1, 2, 3):
            await asyncio.sleep(0.35)
            await _steps(ctx, ya, yb, k)
    else:
        last = -1
        deadline = time.time() + 15 * 60
        while time.time() < deadline:
            st = await _get(ctx, f"/change/runs/{job}")
            stage = 0
            if st["state"] == "running":
                stage = 1
            if st["state"] == "done":
                stage = 3
            if st["state"] == "failed":
                raise ToolError("change_failed", "변화 탐지가 끝나지 못했습니다 — 잠시 뒤 다시 해 주세요", 500)
            if stage != last:
                await _steps(ctx, ya, yb, stage)
                last = stage
            await _emit(ctx, "agent.tool.progress", {"i": 1, "ui_actions": []})
            if stage == 3:
                break
            await asyncio.sleep(3)
        else:
            out = Out(source=SRC)
            out.answer = "변화 탐지를 대기열에 넣었습니다. 끝나면 이 대상지 지도에서 결과를 볼 수 있습니다."
            return out
    st = await _get(ctx, f"/change/runs/{job}")
    s = st["stats"] or {}
    bt = s.get("by_type") or {}
    # 범위 줄 — 대상지 시군구 · '국토 변화' · 두 해(화면 지역이 다른 곳이어도 대상지 기준)
    out = Out(source=SRC, scope={"kind": "change", "sgg": list(rg.get("sgg") or []), "cls": ["국토 변화"]})
    ctx.state["scope_cond"] = f"{ya}년 → {yb}년 항공영상"
    out.whitelist |= {str(ya), str(yb)}
    k_in = out.env("n_in", "구역선 안 변화 건수", s["n_in"])
    parts = []
    for t in TYPES:
        if t in bt:
            key = "in_" + str(TYPES.index(t))
            out.env(key, f"구역선 안 {t} 건수", bt[t]["in"])
            parts.append(f"{t} {{{{{key}}}}}")
    out.env("n_all", "범위 전체 변화 건수", s["n"])
    out.env("n_out", "구역선 밖(버퍼) 변화 건수", s["n_out"])
    tops = []
    for k, x in enumerate(s.get("top_in") or [], 1):
        key = f"top{k}"
        out.env(key, f"면적 큰 곳 {k} 면적", x["area"])
        jb = x.get("jibun") or "지번 없음"
        out.whitelist.add(str(jb))
        tops.append(f"{jb}({x['type']} · {{{{{key}}}}})")
    name = rg.get("name") or "대상지"
    head = f"{name} {ya}년 → {yb}년 비교 결과, 구역선 안 변화 {{{{{k_in}}}}}건입니다."
    body = (" " + " · ".join(parts) + ".") if parts else ""
    tail = f" 면적이 큰 곳은 {', '.join(tops)}입니다." if tops else ""
    out.answer = head + body + tail + " 구역선 밖(버퍼) {{n_out}}건은 옅게 표시했습니다."
    out.data = {"대상지": name, "앞 해": f"{ya}년", "뒤 해": f"{yb}년", "캐시": bool(run.get("cached"))}
    out.ui_actions.append({"op": "change_show", "job_id": job, "range_id": rg["id"], "project_id": rg.get("project_id"),
                           "year_a": ya, "year_b": yb, "bbox": rg.get("bbox"), "name": name})
    await _mem_set(ctx, job_id=job, range_id=rg["id"], project_id=rg.get("project_id"), year_a=ya, year_b=yb, sel=None)
    from agent import talk
    talk.set_next(ctx, [talk.btn("지목이 도로인데 건물 생긴 필지 표로", q="지목이 도로인데 건물 생긴 필지만 소유구분이랑 같이 표로"),
                        talk.btn("구역선 안 변화 필지 표", q="구역선 안 변화 필지 표로 보여 줘")])
    ctx.state["change_ms"] = round((time.perf_counter() - t0) * 1000)
    return out


async def _range_sgg(ctx, run: dict) -> list[str]:
    try:
        return list((await _get(ctx, f"/change/ranges/{run['range_id']}", years=0)).get("sgg") or [])
    except Exception:  # noqa: BLE001
        return []


async def _layer(ctx, args, mem) -> str:
    job = args.get("layer_id") or mem.get("job_id")
    if not job:
        raise ToolError("no_layer", "먼저 변화 탐지 결과가 있어야 합니다 — '두 해 비교해서 변화 찾아 줘'라고 물어봐 주세요", 400)
    return str(job)


async def intersect_parcels(args: dict, ctx) -> Out:
    mem = await _mem_get(ctx)
    job = await _layer(ctx, args, mem)
    types = [t for t in (args.get("types") or []) if t in TYPES + ["식생 증감"]]
    jimok = [JIMOK.get(j, j)[:1] for j in (args.get("jimok") or []) if j]
    owner = [o for o in (args.get("owner") or []) if o]
    inside = args.get("inside_row") if args.get("inside_row") in ("내", "외") else None
    q = {"type": ",".join(types) or None, "jimok": ",".join(jimok) or None, "owner": ",".join(owner) or None, "inside": inside}
    res = await _get(ctx, f"/change/runs/{job}/parcels", **q)
    st = await _get(ctx, f"/change/runs/{job}")
    rows = res.get("items_raw") or []
    cls = sorted({{"신축": "건물", "소실": "건물", "경작 전환": "경작지"}[t] for t in types if t in ("신축", "소실", "경작 전환")})
    sgg = await _range_sgg(ctx, st)
    # 범위 검사기(scopecheck) — '건물 생긴 필지'처럼 분류를 말한 질문이 변화 숫자를 다른 분류로 보고 빼지 않게 분류를 적는다
    out = Out(source="변화 탐지 결과 × 연속지적도(필지 교차)", scope={"kind": "change", "cls": cls, "sgg": sgg} if cls else {"kind": "det", "sgg": sgg})
    k = out.env("n", "조건에 맞는 필지(변화) 수", res["n"])
    out.env("area", "조건에 맞는 변화 면적 합", res["area"])
    cond = []
    if jimok:
        cond.append("지목 " + "·".join(JNAME.get(j, j) for j in jimok))
    if types:
        cond.append("·".join(types))
    if inside:
        cond.append("구역선 " + ("안" if inside == "내" else "밖"))
    if owner:
        cond.append("소유구분 " + "·".join(owner))
    cl = " · ".join(cond) or "모든 변화"
    for r in rows:
        out.whitelist |= {str(r.get("jibun") or ""), str(r.get("pnu") or "")}
    if not rows:
        out.answer = f"{st['range_name']}에서 조건({cl})에 맞는 필지는 없습니다."
        return out
    out.blocks.append({"type": "rows", "title": f"{st['range_name']} · {cl}", "cols": ["지번", "지목", "소유구분", "변화 유형", "면적", "구역선"],
                       "rows": [[r.get("jibun") or "-", JNAME.get(r.get("jimok") or "", r.get("jimok") or "-"), r.get("owner") or "-", r["type"], f"{round(r['area_m2']):,}㎡",
                                 "안" if r.get("inside_row") == "내" else "밖"] for r in rows[:50]],
                       "ids": [r["id"] for r in rows[:50]], "more": max(0, len(rows) - 50)})
    from urllib.parse import urlencode
    qs = urlencode({**{k2: v for k2, v in q.items() if v}, "format": "csv"})
    pa, pb = st["period"]["a"]["year"], st["period"]["b"]["year"]
    out.blocks.append({"type": "file", "label": f"변화탐지_필지표_{pa}-{pb}.csv", "href": f"/api/v1/change/runs/{job}/parcels?{qs}"})
    out.ui_actions.append({"op": "change_hl", "job_id": job, "ids": [r["id"] for r in rows]})
    out.answer = (f"{st['range_name']}에서 조건({cl})에 맞는 필지 {{{{{k}}}}}건을 표로 정리하고 지도에 강조했습니다. "
                  "줄을 누르면 그 자리로 갑니다. 표는 CSV로 내려받을 수 있습니다.")
    await _mem_set(ctx, job_id=job)
    return out


async def describe_change(args: dict, ctx) -> Out:
    mem = await _mem_get(ctx)
    job = await _layer(ctx, args, mem)
    pid = str(args.get("polygon_id") or mem.get("sel") or "").strip()
    if not re.fullmatch(r"c\d{4}", pid):
        raise ToolError("no_polygon", "어느 변화인지 정하지 못했습니다 — 지도에서 변화 폴리곤을 눌러 고른 뒤 물어봐 주세요", 400)
    fc = (await ctx.http.get(f"/change/runs/{job}/features", params={"hidden": 1})).json()
    f = next((x for x in fc.get("features") or [] if x.get("id") == pid), None)
    if not f:
        raise ToolError("not_found", "그 변화 폴리곤을 찾지 못했습니다", 404)
    pr = f["properties"]
    st = await _get(ctx, f"/change/runs/{job}")
    ya, yb = st["period"]["a"]["year"], st["period"]["b"]["year"]
    pngs = []
    for t in ("a", "b"):
        rr = await ctx.http.get(f"/change/runs/{job}/thumbs/{pid}_{t}.png")
        if rr.status_code != 200:
            raise ToolError("no_image", "그 변화의 영상 썸네일이 없습니다", 404)
        pngs.append(rr.content)
    area = round(float(pr["area_m2"]))
    prompt = (f"두 장은 같은 자리의 항공영상입니다. 첫 장은 {ya}년, 둘째 장은 {yb}년입니다. 빨간 선 안이 AI가 찾은 변화(유형: {pr['type']}, "
              f"넓이 약 {area}㎡)입니다. 빨간 선 안에서 {ya}년에는 무엇이었고 {yb}년에는 무엇이 보이는지 한국어 1~2문장으로 씁니다. "
              "보이는 것만 씁니다(건물 · 가설건축물 · 컨테이너 · 비닐하우스 · 포장면 · 나지 · 경작지 · 수목 등). 추측이면 '~로 보입니다'. "
              "넓이를 쓸 때는 '약 {area}㎡'만 씁니다. 법 위반 여부는 판단하지 않습니다.").replace("{area}", str(area))
    from agent.vlm import call as V
    try:
        res = await V.describe(pngs, prompt, r=ctx.r, run_id=ctx.run_id, max_tokens=160)
        text = re.sub(r"\s+", " ", res.text or "").strip()
        ctx.tokens_in += int(res.usage.get("prompt_tokens") or 0)
        ctx.tokens_out += int(res.usage.get("completion_tokens") or 0)
    except Exception as e:  # noqa: BLE001
        text = ""
        ctx.state["vlm_error"] = type(e).__name__
    out = Out(source="AI 비전 의견(vLLM · 두 해 썸네일) · 근거 아님", scope={"kind": "change", "sgg": await _range_sgg(ctx, st), "cls": ["국토 변화"]})
    k = out.env("area", "변화 면적", {"value": area, "unit": "m2", "basis": "inferred", "as_of": st.get("done_at") or "", "source": SRC})
    jb = pr.get("jibun") or ""
    out.whitelist |= {str(ya), str(yb), str(jb), str(area), f"{area:,}"}
    loc = f"{jb}({JNAME.get(pr.get('jimok') or '', pr.get('jimok') or '-')} · {pr.get('owner') or '-'})" if jb else "이 자리"
    head = f"{loc} {pr['type']} {{{{{k}}}}} — "
    if not text:
        text = "AI 비전 응답을 받지 못했습니다(장비가 바쁨). 두 해 썸네일을 직접 견줘 보세요."
    text = re.sub(r"약\s*[\d,\.]+\s*(㎡|m2|제곱미터)", f"약 {{{{{k}}}}}", text)
    out.answer = head + text + " (AI 의견 · 근거 아님)"
    for t, y in (("a", ya), ("b", yb)):
        out.blocks.append({"type": "image", "src": f"/api/v1/change/runs/{job}/thumbs/{pid}_{t}.png", "caption": f"{y}년 · {pid}",
                           "tag": "국토지리정보원 항공영상"})
    out.ui_actions.append({"op": "change_hl", "job_id": job, "ids": [pid], "focus": True})
    await _mem_set(ctx, job_id=job, sel=pid)
    return out


async def change_report(args: dict, ctx) -> Out:
    mem = await _mem_get(ctx)
    job = await _layer(ctx, args, mem)
    r = await _get(ctx, f"/change/runs/{job}/report.json")
    st = await _get(ctx, f"/change/runs/{job}")
    out = Out(source="국토 변화 분석서비스 결과 · 판정 기록", scope={"kind": "change", "sgg": await _range_sgg(ctx, st), "cls": ["국토 변화"]})
    s = st.get("stats") or {}
    k1 = out.env("n_in", "구역선 안 변화 건수", s["n_in"])
    k2 = out.env("n_out", "구역선 밖(버퍼) 변화 건수", s["n_out"])
    stt = r.get("status") or {}
    parts = []
    for i, name in enumerate(["현장확인", "불법", "적법", "철거완료"]):
        if (stt.get(name) or {}).get("value"):
            key = f"st{i}"
            out.env(key, f"판정 {name} 건수", stt[name])
            parts.append(f"{name} {{{{{key}}}}}")
    pa, pb = st["period"]["a"]["year"], st["period"]["b"]["year"]
    out.whitelist |= {str(pa), str(pb)}
    lines = [f"{r['title']}을 만들었습니다(개조식 · 근거 썸네일 포함).",
             f"□ 구간 개요 — {st['range_name']} · 국토지리정보원 영상 {pa}년 → {pb}년",
             f"□ 변화 요약 — 구역선 안 {{{{{k1}}}}} · 밖(버퍼) {{{{{k2}}}}}" + (f" · 판정 {' · '.join(parts)}" if parts else ""),
             f"□ 필지별 목록 · □ 권고 조치 {len(r.get('recommend') or [])}항목 — 미리보기에서 봅니다."]
    out.answer = "\n\n".join(lines)          # 개조식 한 줄씩 문단
    name = f"{st['range_name']}_변화탐지보고_{pa}-{pb}.pdf"
    out.blocks.append({"type": "file", "label": name, "href": f"/api/v1/change/runs/{job}/report.pdf"})
    fid = (r.get("thumbs") or [None])[0]
    if fid:
        for t, y in (("a", pa), ("b", pb)):
            out.blocks.append({"type": "image", "src": f"/api/v1/change/runs/{job}/thumbs/{fid}_{t}.png", "caption": f"{y}년 · {fid}", "tag": "보고서 근거 영상"})
    from agent import talk
    talk.set_next(ctx, [talk.btn("보고서 미리보기", href="/landxi/v3/change-report/?" + __import__("urllib.parse").parse.urlencode({"job": job})),
                        talk.btn("현장점검 목록", href="/landxi/v3/change-field/?" + __import__("urllib.parse").parse.urlencode({"job": job}))], front=True)
    await _mem_set(ctx, job_id=job)
    return out


HANDLERS = {"run_change_detection": run_change_detection, "intersect_parcels": intersect_parcels, "describe_change": describe_change,
            "change_report": change_report}


# ── 모델 앞 직행(결정적) ─────────────────────────────────────────────────────
YEAR_RX = re.compile(r"(20\d{2})\s*년?")
RUN_RX = re.compile(r"(새로\s*생긴|생겨난|변화|달라진|바뀐|없어진|사라진|탐지|새로\s*들어선)")
CMP_RX = re.compile(r"비교|견줘|대조|사이")
RANGE_RX = re.compile(r"구역선|도로구역|고속국도|철도|대상지|범위\s*안")
RAIL_RX = re.compile(r"(철도|철도용지|철길)[^.?!]{0,12}(같은\s*방식|똑같이|마찬가지|도\s*해|도\s*찾아|도\s*비교|도\b)")
DESC_RX = re.compile(r"^(이거|이게|이건|저거|요거|이\s*변화|이\s*폴리곤|선택한\s*거|고른\s*거)\s*(뭐|무엇|뭔|설명|어떤)|^뭐야\??$|무엇이\s*바뀌|뭐가\s*바뀌|뭐가\s*생긴")
REPORT_RX = re.compile(r"보고서|보고용|보고\s*자료")
TABLE_RX = re.compile(r"표로|목록|리스트|소유구분|필지만")
JIMOK_RX = re.compile(r"지목(?:이|은|가)?\s*(" + "|".join(sorted(JIMOK, key=len, reverse=True)) + r")")


def _years(t: str) -> list[int]:
    out = []
    for m in YEAR_RX.finditer(t):
        y = int(m.group(1))
        if 2000 <= y <= 2100 and y not in out:
            out.append(y)
    return out[:2]


def _has_change_ctx(ctx) -> bool:
    c = (ctx.context or {}).get("change") or {}
    return bool(c.get("range_id") or c.get("job_id") or c.get("project_id")) or bool((ctx.context or {}).get("prev_run"))


def ROUTE(msg: str, ctx):
    if getattr(ctx, "lang", "ko") != "ko":
        return None
    t = re.sub(r"\s+", " ", msg or "").strip()
    if not t or len(t) > 120:
        return None
    lx = getattr(ctx.principal, "realm", None) == "lx"
    if lx and RAIL_RX.search(t):
        return {"tool": "run_change_detection", "args": {"range_query": "철도"}}
    ys = _years(t)
    if lx and RUN_RX.search(t) and ((len(ys) == 2 and (CMP_RX.search(t) or RANGE_RX.search(t))) or (RANGE_RX.search(t) and _has_change_ctx(ctx))):
        a = {}
        if len(ys) == 2:
            a = {"year_a": min(ys), "year_b": max(ys)}
        return {"tool": "run_change_detection", "args": a}
    c = (ctx.context or {}).get("change") or {}
    if REPORT_RX.search(t) and c.get("job_id"):
        return {"tool": "change_report", "args": {}}
    if DESC_RX.search(t) and (c.get("sel") or c.get("job_id")):
        return {"tool": "describe_change", "args": {}}
    if TABLE_RX.search(t) and (c.get("job_id") or (ctx.context or {}).get("prev_run")) and (JIMOK_RX.search(t) or "변화" in t or "건물" in t or "소유" in t):
        a: dict = {}
        m = JIMOK_RX.search(t)
        if m:
            a["jimok"] = [JIMOK[m.group(1)]]
        tys = [ty for rx, ty in TYPE_WORDS if re.search(rx, t)]
        if tys:
            a["types"] = tys
        if re.search(r"구역선\s*(안|내)", t):
            a["inside_row"] = "내"
        elif re.search(r"구역선\s*밖", t):
            a["inside_row"] = "외"
        return {"tool": "intersect_parcels", "args": a}
    return None
