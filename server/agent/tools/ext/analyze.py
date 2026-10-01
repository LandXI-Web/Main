"""말로 분석 실행(C2 ②) — 전역 AI 분석 · 실태조사 결과 만들기. 둘 다 쓰기 도구이고 사람이 확인 카드로 승인해야 실행된다.

  analysis_run(region, service?)   시군구 전역 AI 분석. 화면 '분석 → 전역 분석' 버튼과 같은 길(POST /jobs/quote → POST /jobs ·
                                   options.scope='sgg' · 영상·모델은 서버가 고른다). 승인 뒤 · 제출 전에 전력·대기열 검사:
                                     - 같은 지역 전역 분석이 이미 대기열에 있으면 새로 내지 않고 그 작업에 붙는다(analysis_watch · 답에 그 작업의 범위 문장)
                                     - 다른 지역 분석이 대기·진행 중이어도 화면 '전역 분석' 버튼과 같은 규칙으로 대기열에 넣는다(r3-xi 2차 · 한 규칙).
                                       GPU 한 장 규칙은 대기열(스케줄러 공정 분배)과 작업기 전력 게이트가 지킨다. 답은 '다른 지역 분석 n건과 GPU 를 나눠 씀'을 알린다
                                     - 서버가 거절하면(견적 allowed=false · 제출 409) 그 이유를 사용자 말로
                                   제출되면 map_region + analysis_watch{job_id, sgg_cd} → XI맵이 진행 보기에 붙어 결과가 읍면동 순으로 차오른다.
  survey_build(region)             실태조사 결과 만들기(POST /survey/build · CPU 작업 · 필지 적재 → AI 결합 → 규칙 → 의심).

서비스 이름(비닐하우스·건물·경작지·주차장)은 전역 분석 결과 가운데 볼 대상이다 — '비닐하우스 분석해 줘'가 기존 의심 조회로 바뀌지 않게
이 도구가 받는다(HINT). 숫자는 견적·작업 응답의 봉투로만 낸다. 지역 하드코딩 0.
"""
from __future__ import annotations

import json
import re

from .. import Out, ToolError
from ..jobs import eta_value, eta_words
from .map import _regions_in, guard_region, region_action, resolve_region

SERVICES = {"비닐하우스": "비닐하우스", "greenhouse": "비닐하우스", "건물": "건물", "building": "건물", "경작지": "경작지", "farmland": "경작지",
            "주차장": "주차장", "parking": "주차장"}
REGION = {"type": "string", "description": "시군구 이름 또는 5자리 코드(없으면 지금 지도의 지역)"}

SPECS: dict[str, dict] = {
    "analysis_run": {
        "description": "시군구 AI 분석을 새로 실행한다(등록된 항공·드론 영상이 있는 곳 → AI 탐지 · 결과가 지도에 읍면동 순으로 차오름). "
                       "'○○ 전역 분석 실행해 줘' · '○○ 비닐하우스 분석해 줘' · '이 지역 분석 돌려 줘'. 사람이 확인 카드를 승인해야 실행된다.",
        "properties": {"region": REGION,
                       "service": {"type": "string", "enum": ["비닐하우스", "건물", "경작지", "주차장"],
                                   "description": "볼 대상(말했을 때만)"}}},
    "survey_build": {
        "description": "시군구 실태조사 결과 만들기(필지 × AI 분석 결과 대조 → 의심 필지). '실태조사 결과 만들어 줘'. 사람이 확인 카드를 승인해야 실행된다.",
        "properties": {"region": REGION}},
    "survey_wait": {
        "description": "AI 분석이 진행 중인 지역의 실태조사 요청에 답한다(분석이 끝나면 자동으로 이어 만든다).",
        "properties": {"region": REGION, "why": {"type": "string", "enum": ["running", "partial"]}}, "route_only": True},
    "emd_chart": {
        "description": "지금 지도 지역(또는 말한 시군구)의 읍면동별 막대 차트. 실태조사가 있으면 의심 필지, 없으면 AI 분석 탐지 수.",
        "properties": {"region": REGION}, "route_only": True},
}
HANDLERS: dict = {}
WRITE = {"analysis_run", "survey_build"}
CONFIRM = {"analysis_run", "survey_build"}
CLIENT: set[str] = set()
WHY = {"analysis_run": "AI 분석 실행 — 사람 승인 필요", "survey_build": "실태조사 결과 만들기 — 사람 승인 필요",
       "survey_wait": "분석 진행 중 — 끝나면 실태조사 이어 만들기", "emd_chart": "읍면동별 막대 차트"}
SAY = {"analysis_run": "AI 분석 실행", "survey_build": "실태조사 결과 만들기", "survey_wait": "분석 진행 확인", "emd_chart": "읍면동별 차트"}
HINT = ("'○○ 분석해 줘 · 분석 실행 · 분석 돌려 줘'(비닐하우스·건물·경작지·주차장 포함)는 새 분석 실행이다 — analysis_run 을 부르고 "
        "survey_findings 로 바꾸지 않는다. '실태조사 결과 만들어 줘'는 survey_build. 둘 다 확인 카드 승인 뒤에 실행된다.")


def allowed(name: str, p) -> bool:
    realm, role = getattr(p, "realm", None), getattr(p, "role", None)
    if name == "analysis_run":
        return realm == "lx" and role in ("staff", "admin", "sales")
    if name in ("survey_build", "survey_wait"):
        return (realm == "lx" and role in ("staff", "admin")) or (realm == "tenant" and role == "manager")
    if name == "emd_chart":
        return realm in ("lx", "tenant")
    return False


async def _j(ctx, method: str, path: str, **kw):
    res = await ctx.http.request(method, path, **kw)
    try:
        j = res.json()
    except Exception:
        j = {}
    if res.status_code >= 400:
        e = (j or {}).get("error") or {}
        raise ToolError(e.get("code") or f"http_{res.status_code}", e.get("message") or f"http {res.status_code}", res.status_code)
    return j


REASON = {
    "no_imagery": "이 지역에는 분석할 영상이 아직 없습니다. 영상 등록이 필요합니다.",
    "aoi_outside_footprint": "이 지역에는 분석할 영상이 아직 없습니다. 영상 등록이 필요합니다.",
    "model_input_mismatch": "이 영상에 맞는 AI 모델이 아직 없습니다.",
    "too_large": "범위가 너무 넓어 한 번에 분석할 수 없습니다.",
    "power_budget": "지금은 GPU 전력 규칙(한 번에 한 장)에 걸려 새 분석을 시작하지 않았습니다. 진행 중인 분석이 끝난 뒤 다시 요청해 주세요.",
    "demo_required": "이 계정으로는 예시 분석만 실행할 수 있습니다.",
    "imagery_forbidden": "이 계정으로는 이 영상을 분석할 수 없습니다.",
    "queue_busy": "다른 지역 AI 분석이 GPU 를 쓰고 있어 새 분석을 시작하지 않았습니다. GPU 는 전력 규칙 때문에 한 장씩만 씁니다. 끝난 뒤 다시 요청해 주세요.",
}


def reason_text(reasons) -> tuple[str, str]:
    for k in ("power_budget", "queue_busy", "no_imagery", "aoi_outside_footprint", "model_input_mismatch", "too_large",
              "demo_required", "imagery_forbidden"):
        if k in (reasons or []):
            return k, REASON[k]
    return "not_allowed", "지금은 이 지역 분석을 실행할 수 없습니다."


# ── 전력 · 대기열 검사(제출 전 · 게이트웨이 프로세스 안에서 읽기만) ──────────────────────────────────────
async def gpu_samples() -> list[dict]:
    """ops:gpu:{node}:{i}(GPU 폴러) → GpuSample.gpus[] · 폴러가 없으면 빈 목록(임대만으로 판정)."""
    from landxi_api import config as gcfg
    from landxi_api.deps import redis
    r = await redis()
    out = []
    async for k in r.scan_iter(match=f"ops:gpu:{gcfg.NODE_ID}:*", count=2000):
        h = await r.hgetall(k)
        try:
            g = json.loads(h["json"]) if "json" in h else None
        except Exception:
            g = None
        if isinstance(g, dict):
            out.append(g)
    return out


async def power_state() -> dict:
    """{ok, hot_now, max_hot} — LX 관리자 대시보드 '동시 고부하 GPU'와 같은 함수(ops.power_budget_now)."""
    from landxi_api.ops import power_budget_now
    return await power_budget_now(await gpu_samples())


async def long_jobs(codes: list[str]) -> tuple[dict | None, list[dict]]:
    """GPU 풀의 대기·진행 중 분석 → (같은 지역 시군구 전역 분석 | None, 다른 분석들).
    같은 지역 작업에는 범위 문장(options.scope_text · scope_rest)을 싣는다 — 붙는 답도 확인 카드 · 진행판과 같은 문장(r3-xi 2차)."""
    from landxi_api.deps import db
    async with db(realm="lx") as conn:
        rows = await conn.fetch("SELECT id, state, options->>'sgg_cd' AS sgg, options->>'scope' AS scope, demo, options->>'scope_text' AS scope_text, "
                                "options->>'scope_text_en' AS scope_text_en, options->>'scope_rest' AS scope_rest FROM jobs "
                                "WHERE kind IN ('infer','reinfer') AND state IN ('queued','running') AND pool <> 'cpu' AND NOT coalesce(test, false) "
                                "ORDER BY created_at")
    rows = [dict(x) for x in rows]
    same = next((x for x in rows if x["scope"] == "sgg" and x["sgg"] in codes), None)
    return same, [x for x in rows if x is not same]


async def preflight(codes: list[str], checks=None) -> dict:
    """제출 전 검사 → {'attach': job} | {'others': n}. 거절은 서버(견적 · 제출)만 한다 — 화면 '전역 분석' 버튼과 같은 규칙(r3-xi 2차).
    checks 는 테스트용 주입(long_jobs)."""
    lj_fn = (checks or {}).get("jobs", long_jobs)
    same, others = await lj_fn(codes)
    if same:
        return {"attach": same}
    return {"others": len(others)}


def _center(ctx, r: dict):
    v = (ctx.context or {}).get("view") or {}
    c, b = v.get("center"), r.get("bbox")
    if isinstance(c, (list, tuple)) and len(c) == 2 and b and b[0] <= c[0] <= b[2] and b[1] <= c[1] <= b[3]:
        return [round(float(c[0]), 6), round(float(c[1]), 6)]
    return None


async def analysis_run(args: dict, ctx) -> Out:
    """확인 카드 승인 뒤에만 불린다(runner · CONFIRM)."""
    ensure_chain_loop()
    r = resolve_region(args, ctx)
    guard_region(r, ctx)
    cls = SERVICES.get(str(args.get("service") or "").strip()) if args.get("service") else None
    codes = [c for c in (r["sgg_cd"], r.get("prev_cd")) if c]
    out = Out(source="AI 분석(작업 대기열)")
    out.whitelist |= set(codes)
    pf = await preflight(codes, (ctx.state or {}).get("_c2xi_checks"))
    watch = {"op": "analysis_watch", "sgg_cd": r["sgg_cd"], "name": r["name"], "bbox": r.get("bbox"), "cls": cls}
    en = getattr(ctx, "lang", "ko") == "en"
    if "attach" in pf:
        return await _attach(out, r, pf["attach"], watch, cls, en, ctx)
    others = int(pf.get("others") or 0)
    body = {"kind": "infer", "demo": getattr(ctx.principal, "role", None) == "sales",
            "options": {"scope": "sgg", "sgg_cd": r["sgg_cd"], "chip": 1024, "overlap": 0.125, "conf": 0.25},
            "label": f"말로 분석 · {r['name']} AI 분석" + (f" · {cls}" if cls else "")}
    c = _center(ctx, r)
    if c:
        body["options"]["center"] = c
    q = await _j(ctx, "POST", "/jobs/quote", json=body)
    if not q.get("allowed"):
        code, text = reason_text(q.get("reasons"))
        raise ToolError(code, text, 409)
    try:
        j = await _j(ctx, "POST", "/jobs", json=body)
    except ToolError as e:
        code, text = reason_text([e.code])
        raise ToolError(e.code, text if code != "not_allowed" else e.message, e.status) from None
    job = j.get("job") or {}
    n_emd = q["emd_total"].get("value") if isinstance(q.get("emd_total"), dict) else None
    sc = scope_of(q, en)                                   # 영상 범위(견적 봉투 그대로 · 확인 카드 · 진행판과 같은 문장)
    for k, meaning in (("coverage", "영상이 덮는 시군구 면적 비율"), ("emd_covered", "영상과 겹치는 읍면동 수"), ("emd_total", "시군구 읍면동 수")):
        if sc and isinstance(q.get(k), dict) and q[k].get("value") is not None:
            out.env(k, meaning, q[k])
    if not sc and n_emd is not None:
        out.env("emd_total", "분석할 읍면동 수", q["emd_total"])
    # 예상 소요는 업무 말로만('약 1분') — 초 봉투를 내면 명령 바에 '47.9s' 칩이 뜬다(규칙 2 · 실증 2차 must_fix 2)
    # 다른 분석과 GPU 를 나눠 쓰면 견적의 예상 소요(혼자 쓸 때)는 맞지 않는다 — 말하지 않고 나눠 쓴다는 사실만(지어내지 않음)
    eta = None if others else eta_words(eta_value(q), "en" if en else "ko")
    out.ui_actions += [region_action(r), {**watch, "job_id": job.get("id"), **({"scope_text": sc["text"], "scope_rest": sc.get("rest")} if sc else {})}]
    out.data = {"지역": r.get("full") or r["name"], "상태": "대기열에 넣음 · 결과가 지도에 읍면동 순으로 차오른다", "대상": cls or "전체",
                "영상": f"{(q.get('imagery') or {}).get('year') or ''} 항공영상".strip(),
                "범위": sc["text"] if sc else None, "나머지": sc.get("rest") if sc else None,
                "읍면동 수": ("emd_covered" if sc else "emd_total") if (sc or n_emd is not None) else None,
                "예상 소요": eta}
    out.data = {k: v for k, v in out.data.items() if v is not None}
    if eta:
        out.whitelist |= set(re.findall(r"\d+", eta))   # 모델 경로 답이 '약 45분'을 그대로 옮겨도 검증기 통과
    if sc:
        out.whitelist |= set(re.findall(r"\d+", sc["text"]))
    what = f" {cls}" if cls else ""
    share_ko = f" 다른 지역 AI 분석 {others}건과 GPU 한 장을 나눠 쓰므로 조금 더 걸립니다." if others else ""
    share_en = f" It shares one GPU with {others} other analys{'is' if others == 1 else 'es'}, so it takes a little longer." if others else ""
    if others:
        out.data["함께 도는 분석"] = f"{others}건"
        out.whitelist.add(str(others))
    if en:
        out.answer = (f"Queued an AI{(' ' + cls) if cls else ''} analysis of {r['name']}. "
                      + (f"{sc['text']}. " if sc else (f"{int(n_emd)} towns. " if n_emd else ""))
                      + (f"About {eta.replace('about ', '')} to results. " if eta else "") + "Results fill in on the map by town."
                      + (f" {sc['rest']}." if sc and sc.get("rest") else "") + share_en)
    elif sc:
        out.answer = (f"{r['name']} AI{what} 분석을 대기열에 넣었습니다. {sc['text']}. "
                      + (f"결과까지 {eta} 걸리고, " if eta else "") + "결과는 지도에 읍면동 순으로 차오릅니다."
                      + (f" {sc['rest']}합니다." if sc.get("rest") else "") + share_ko)
    else:
        out.answer = (f"{r['name']} AI{what} 분석을 대기열에 넣었습니다. "
                      + (f"읍면동 {int(n_emd)}곳을 차례로 분석하고" if n_emd else "읍면동 순으로 분석하고")
                      + (f", 결과까지 {eta} 걸립니다. " if eta else " ") + "결과는 지도에 바로 차오릅니다." + share_ko)
    out.raw = {"job": job, "quote_reasons": q.get("reasons")}
    return out


async def _attach(out: Out, r: dict, job: dict, watch: dict, cls, en: bool, ctx) -> Out:
    """같은 지역 분석이 이미 대기·진행 중 — 새로 내지 않고 붙는다. 답에도 그 작업의 범위 문장(작업 옵션 scope_text · 없으면
    GET /jobs/scope)을 넣는다 → 답 · 확인 카드 · 진행판 세 곳이 같은 문장(r3-xi 2차 must_fix 1)."""
    sc = None
    if not en and job.get("scope_text"):
        sc = {"text": job["scope_text"], "rest": job.get("scope_rest"), "full": False}
    if sc is None and getattr(ctx, "http", None) is not None:
        try:
            sc = scope_of(await _j(ctx, "GET", f"/jobs/scope/{job.get('sgg') or r['sgg_cd']}"), en)
        except Exception:                                  # noqa: BLE001 — 범위를 못 세면 문장을 넣지 않는다(지어내지 않음)
            sc = None
    out.ui_actions += [region_action(r), {**watch, "job_id": job["id"],
                                          **({"scope_text": sc["text"], "scope_rest": sc.get("rest")} if sc and not en else {})}]
    out.data = {"지역": r.get("full") or r["name"], "상태": "이미 진행 중인 AI 분석에 연결", "대상": cls or "전체",
                **({"범위": sc["text"]} if sc else {}), **({"나머지": sc["rest"]} if sc and sc.get("rest") else {})}
    if sc:
        out.whitelist |= set(re.findall(r"\d+", sc["text"]))
    if en:
        out.answer = (f"An AI analysis of {r['name']} is already running. " + (f"{sc['text']}. " if sc else "")
                      + "Results fill in on the map by town." + (f" {sc['rest']}." if sc and sc.get("rest") else ""))
    else:
        out.answer = (f"{r['name']} AI 분석이 이미 진행 중입니다. " + (f"{sc['text']}. " if sc else "")
                      + "진행 화면을 붙였고, 결과가 지도에 읍면동 순으로 차오릅니다." + (f" {sc['rest']}합니다." if sc and sc.get("rest") else ""))
    out.raw = {"job": {k: job.get(k) for k in ("id", "state", "sgg")}}
    return out


def scope_of(q: dict, en: bool = False) -> dict | None:
    """견적(또는 GET /jobs/scope) 응답 → {text, rest, full} — 서버가 만든 범위 문장을 그대로(지어내지 않는다). 값이 없으면 None."""
    sc = (q or {}).get("scope") if isinstance((q or {}).get("scope"), dict) else q
    text = (sc or {}).get("text_en" if en else "text")
    if not text:
        return None
    return {"text": text, "rest": (sc or {}).get("rest_en" if en else "rest"), "full": bool((sc or {}).get("full"))}


async def region_jobs(codes: list[str], checks=None) -> dict:
    """그 시군구 전역 AI 분석 작업 상태 → {running, done, partial}(각각 {id, state, n} | None).
    running = 대기·진행 중 · done = 끝난 것 중 가장 최근(탐지 있음) · partial = 중간에 멈춘 것 중 가장 최근(탐지 있음)."""
    fn = (checks or {}).get("region_jobs")
    if fn:
        return await fn(codes)
    from landxi_api.deps import db
    async with db(realm="lx") as conn:
        rows = await conn.fetch(
            "SELECT j.id, j.state, j.finished_at, (SELECT count(*) FROM detections d WHERE d.job_id = j.id) AS n FROM jobs j "
            "WHERE j.kind IN ('infer','reinfer') AND NOT j.demo AND NOT coalesce(j.test, false) AND j.options->>'scope' = 'sgg' "
            "AND j.options->>'sgg_cd' = ANY($1::text[]) ORDER BY j.created_at DESC LIMIT 20", codes)
    rows = [dict(x) for x in rows]
    pick = lambda st: next(({"id": x["id"], "state": x["state"], "n": int(x["n"] or 0)} for x in rows if x["state"] in st and (x["n"] or st == ("queued", "running"))), None)
    return {"running": pick(("queued", "running")), "done": pick(("done",)), "partial": pick(("cancelled", "failed"))}


WAIT_TEXT = "{name} AI 분석이 진행 중입니다. 분석이 끝나면 실태조사 결과를 이어서 만듭니다."
PARTIAL_TEXT = ("{name} AI 분석이 중간에 멈춰 분석하지 않은 곳이 남아 있습니다. 분석하지 않은 필지가 의심으로 잘못 잡히지 않게 "
                "이 결과로는 실태조사를 만들지 않았습니다. AI 분석을 끝까지 실행하면 이어서 만듭니다.")


async def survey_build(args: dict, ctx) -> Out:
    """확인 카드 승인 뒤에만(runner · CONFIRM). 적재가 이미 도는 중이면 그대로 알린다.
    · 같은 지역 전역 분석이 대기·진행 중이면 지금 만들지 않는다(AI 없이 필지만 적재되지 않게) — 분석이 끝나면 자동으로 이어 만든다(chain_tick).
    · 끝난 전역 분석이 있으면 그 작업을 명시해 대조한다. 중간에 멈춘 분석만 있으면 만들지 않는다(분석 안 한 곳이 의심으로 잡히지 않게)."""
    r = resolve_region(args, ctx)
    guard_region(r, ctx)
    ensure_chain_loop()
    codes = [c for c in (r["sgg_cd"], r.get("prev_cd")) if c]
    name = r.get("full") or r["name"]
    out = Out(source="실태조사 결과 만들기(작업 대기열)")
    out.whitelist |= set(codes)
    try:
        rj = await region_jobs(codes, (ctx.state or {}).get("_c2xi_checks"))
    except Exception:                                   # noqa: BLE001 — 조회 실패면 서버가 작업을 고른다(기존 길)
        rj = {}
    out.ui_actions.append(region_action(r))
    if rj.get("running"):
        out.data = {"지역": name, "상태": "AI 분석 진행 중 — 분석이 끝나면 실태조사 결과를 이어서 만든다(지금은 만들지 않음)"}
        out.answer = WAIT_TEXT.format(name=r["name"])
        return out
    job = (rj.get("done") or {}).get("id")
    if not job and rj.get("partial"):
        out.data = {"지역": name, "상태": "AI 분석이 중간에 멈춤 — 분석 안 한 곳이 의심으로 잡히지 않게 실태조사를 만들지 않음"}
        out.answer = PARTIAL_TEXT.format(name=r["name"])
        return out
    body = {"sgg_cd": r["sgg_cd"], **({"job_id": job} if job else {})}
    try:
        j = await _j(ctx, "POST", "/survey/build", json=body)
        state, note = "실태조사 결과를 만드는 중(필지 × AI 결과 대조)", j.get("note")
    except ToolError as e:
        if e.code != "survey_build_running":
            raise
        state, note = "이미 이 지역 실태조사 결과를 만드는 중", None
    out.data = {"지역": name, "상태": state, **({"비고": note} if note else {})}
    out.answer = f"{r['name']} 실태조사 결과를 만들고 있습니다. 끝나면 지도와 숫자에 바로 반영됩니다." if not note else \
        f"{r['name']}에는 아직 AI 분석 결과가 없어 필지만 먼저 올립니다. AI 분석을 실행하면 끝난 뒤 실태조사 결과를 이어서 만듭니다."
    return out


# ── 분석 상태로 답하기(확인 카드 없이 · ROUTE 전용) — 분석 중 '실태조사 만들어 줘' ─────────────────────────────
async def survey_wait(args: dict, ctx) -> Out:
    r = resolve_region(args, ctx)
    ensure_chain_loop()
    out = Out(source="AI 분석(작업 대기열)")
    out.whitelist |= {r["sgg_cd"]}
    if args.get("why") == "partial":
        out.data = {"지역": r.get("full") or r["name"], "상태": "AI 분석이 중간에 멈춤 — 실태조사를 만들지 않음"}
        out.answer = PARTIAL_TEXT.format(name=r["name"])
        return out
    out.data = {"지역": r.get("full") or r["name"], "상태": "AI 분석 진행 중 — 끝나면 실태조사 결과를 자동으로 이어서 만든다"}
    out.answer = WAIT_TEXT.format(name=r["name"])
    return out


# ── 읍면동별 차트(ROUTE 전용 · 지금 지도 지역) — 실태조사가 있으면 의심 필지(숫자 한 출처 = survey_stats), 없으면 AI 탐지 ───
async def emd_chart(args: dict, ctx) -> Out:
    r = resolve_region(args, ctx)
    codes = [c for c in (r["sgg_cd"], r.get("prev_cd")) if c]
    ck = (ctx.state or {}).get("_c2xi_checks") or {}
    sv_state = await (ck["survey_state"](codes) if "survey_state" in ck else survey_state(codes))
    if sv_state == "done":
        from ..survey import survey_stats
        out = await survey_stats({"by": "emd", "region": r["sgg_cd"]}, ctx)
        if any(b.get("type") == "chart" for b in out.blocks):
            out.answer = f"{r['name']} 읍면동별 의심 필지입니다. 모두 {{{{suspects}}}}건이고, 막대를 누르면 그 읍면동으로 갑니다."
        return out
    rows, job = await (ck["emd_counts"](codes) if "emd_counts" in ck else emd_counts(codes))
    if not rows:
        raise ToolError("not_found", "해당 지역 데이터가 없습니다", 404)
    import datetime as _dt
    now = _dt.datetime.now(_dt.timezone(_dt.timedelta(hours=9))).isoformat(timespec="seconds")
    running = job and job.get("state") in ("queued", "running")
    src = "AI 분석 결과(탐지)"
    note = "분석 진행 중 · 지금까지" if running else "AI 탐지 · 실태조사 전"
    out = Out(source=src, note=note)
    total = 0
    blk = []
    for i, (nm, n) in enumerate(rows[:12], 1):
        out.env(f"emd_{i}", f"{nm} AI 탐지(건)", {"value": int(n), "unit": "count", "basis": "measured", "as_of": now, "source": src, "note": note})
        blk.append({"label": nm, "env": f"emd_{i}"})
        total += int(n)
    out.env("detected", f"{r['name']} AI 탐지(읍면동 확인된 것 · 위 막대 합)", {"value": total, "unit": "count", "basis": "measured", "as_of": now,
                                                                         "source": src, "note": note})
    out.blocks.append({"type": "chart", "kind": "bar", "title": f"{r['name']} 읍면동별 AI 탐지", "rows": blk})
    out.data = {"지역": r.get("full") or r["name"], "상태": "실태조사 전 — AI 탐지를 읍면동별로 셈" + (" · 분석 진행 중" if running else ""),
                "합계": "detected"}
    out.answer = (f"{r['name']}은 아직 실태조사 결과가 없어 AI 분석 탐지를 읍면동별로 보여 드립니다(합계 {{{{detected}}}}건)."
                  + (" 분석이 끝나면 실태조사 결과를 이어서 만듭니다." if running else ""))
    return out


async def survey_state(codes: list[str]) -> str | None:
    from landxi_api.deps import db
    async with db(realm="lx") as conn:
        return await conn.fetchval("SELECT state FROM survey_sgg WHERE sgg_cd = ANY($1::text[]) ORDER BY (state = 'done') DESC LIMIT 1", codes)


async def emd_counts(codes: list[str]) -> tuple[list[tuple[str, int]], dict | None]:
    """가장 최근 전역 분석(진행 중 포함 · 탐지 있음)의 읍면동별 탐지 수(많은 순 · 읍면동 이름 없는 것 제외)."""
    from landxi_api.deps import db
    async with db(realm="lx") as conn:
        job = await conn.fetchrow(
            "SELECT j.id, j.state FROM jobs j WHERE j.kind IN ('infer','reinfer') AND NOT j.demo AND NOT coalesce(j.test, false) "
            "AND j.options->>'scope' = 'sgg' AND j.options->>'sgg_cd' = ANY($1::text[]) "
            "AND EXISTS (SELECT 1 FROM detections d WHERE d.job_id = j.id) ORDER BY j.created_at DESC LIMIT 1", codes)
        if not job:
            return [], None
        rows = await conn.fetch("SELECT emd, count(*) AS n FROM detections WHERE job_id = $1 AND emd IS NOT NULL AND emd <> '' "
                                "GROUP BY emd ORDER BY n DESC, emd", job["id"])
    return [(x["emd"], int(x["n"])) for x in rows], dict(job)


# ── 분석 끝 → 실태조사 자동(배포 경로 deploys._after_infer 와 같은 연결 · 말로 · 화면 버튼 어느 쪽으로 낸 전역 분석이든) ─────
CHAIN_KEY = "agent:c2xi:chain"          # Redis hash: job_id → {state, sgg, at, survey_job?}
CHAIN_EVERY_S = 20
CHAIN_LOOKBACK_H = 48
_chain = {"task": None}


CHAIN_SINCE_KEY = "agent:c2xi:chain:since"    # 이 연결이 처음 켜진 시각(한 번만 · 재기동해도 유지) — 그 전에 끝난 분석은 소급하지 않는다


async def chain_since(r=None) -> float:
    import time
    if r is None:
        from landxi_api.deps import redis
        r = await redis()
    await r.set(CHAIN_SINCE_KEY, str(time.time()), nx=True)
    return float(await r.get(CHAIN_SINCE_KEY) or time.time())


async def chain_candidates() -> list[dict]:
    """이 연결이 켜진 뒤 끝난 시군구 전역 분석 중 실태조사가 그 작업보다 오래됐거나 없는 것(배포 흐름이 맡은 작업 · 예시·시험 제외)."""
    from landxi_api.deps import db
    from landxi_api.regions import sgg_codes
    since = await chain_since()
    async with db(realm="lx") as conn:
        rows = await conn.fetch(
            "SELECT j.id, j.options->>'sgg_cd' AS sgg, j.submitted_by, j.finished_at FROM jobs j "
            "WHERE j.kind = 'infer' AND j.state = 'done' AND j.options->>'scope' = 'sgg' AND NOT j.demo AND NOT coalesce(j.test, false) "
            "AND j.deploy_id IS NULL AND j.finished_at > greatest(now() - make_interval(hours => $1), to_timestamp($2)) "
            "AND EXISTS (SELECT 1 FROM detections d WHERE d.job_id = j.id) ORDER BY j.finished_at", CHAIN_LOOKBACK_H, since)
        rows = [dict(x) for x in rows]
        for x in rows:
            s = await conn.fetchrow("SELECT state, job_id, finished_at FROM survey_sgg WHERE sgg_cd = ANY($1::text[]) LIMIT 1", sgg_codes(x["sgg"]))
            x.update({"sv_state": s["state"] if s else None, "sv_job": s["job_id"] if s else None, "sv_at": s["finished_at"] if s else None})
    out = []
    for x in rows:
        if x["sv_job"] == x["id"] or x["sv_state"] == "building":
            continue
        if x["sv_state"] == "done" and x["sv_at"] and x["finished_at"] and x["sv_at"] > x["finished_at"]:
            continue                                     # 실태조사가 이 분석보다 새것
        out.append(x)
    return out


async def chain_tick(cands_fn=None, build_fn=None, r=None) -> list[dict]:
    """한 번 훑기 — 이어 만들 작업마다 POST /survey/build{sgg_cd, job_id}(작업을 명시 · 시스템 LX 직원 권한). 반환 = 이번에 요청한 것."""
    if r is None:
        from landxi_api.deps import redis
        r = await redis()
    cands = await (cands_fn or chain_candidates)()
    done = []
    for x in cands:
        seen = await r.hget(CHAIN_KEY, x["id"])
        if seen:
            try:
                st = json.loads(seen).get("state")
            except Exception:
                st = None
            if st in ("requested", "gave_up"):
                continue
        try:
            res = await (build_fn or _build_via_route)(x)
            rec = {"state": "requested", "sgg": x["sgg"], "survey_job": ((res or {}).get("job") or {}).get("id")}
        except Exception as e:                             # noqa: BLE001 — 만드는 중(409)이면 다음 번에 다시
            code = getattr(e, "code", type(e).__name__)
            n = (json.loads(seen).get("tries", 0) if seen else 0) + 1
            rec = {"state": "retry" if n < 6 else "gave_up", "sgg": x["sgg"], "error": str(code)[:60], "tries": n}
        await r.hset(CHAIN_KEY, x["id"], json.dumps(rec, ensure_ascii=False))
        done.append({"job_id": x["id"], **rec})
    return done


async def _build_via_route(x: dict) -> dict:
    from landxi_api.deploys import _call_route
    from landxi_api.deps import Principal
    p = Principal(realm="lx", role="staff", user_id=x.get("submitted_by") or "system", name="chain")
    return await _call_route("POST", "/survey/build", {"sgg_cd": x["sgg"], "job_id": x["id"]}, p)


async def chain_loop():
    import asyncio
    while True:
        try:
            got = await chain_tick()
            for g in got:
                print(f"[agent.c2xi] 분석 끝 → 실태조사 {g.get('sgg')} {g.get('state')}", flush=True)
        except Exception as e:                             # noqa: BLE001
            print(f"[agent.c2xi] chain 실패: {type(e).__name__}: {str(e)[:160]}", flush=True)
        await asyncio.sleep(CHAIN_EVERY_S)


def ensure_chain_loop() -> bool:
    """게이트웨이 이벤트 루프에 이어 만들기 순찰을 한 번만 띄운다(시험 · 루프 없음이면 띄우지 않음)."""
    import asyncio
    import os
    import sys
    if os.environ.get("LX_C2XI_CHAIN", "1") == "0" or "pytest" in sys.modules:
        return False
    t = _chain["task"]
    if t is not None and not t.done():
        return True
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return False
    _chain["task"] = loop.create_task(chain_loop())
    return True


# ── 확인 카드 전 인자 해석(PREPARE) · 모델 앞 직행(ROUTE) ─────────────────────────────────────────────
async def prepare(args: dict, ctx) -> dict:
    """지역 이름 → 코드 · 관할 가드(확인 카드에 '어느 지역'이 보이게). GPU·견적·모델 적재는 승인 뒤에만(승인 전 모델 적재 0).
    analysis_run 은 확인 카드 제목(title · plan 3.4)에 지역 이름과 영상 범위 문장을 담는다 — GET /jobs/scope(DB·도형 계산만)의 글자 그대로."""
    r = resolve_region(args, ctx)
    name = r.get("full") or r["name"]
    out = {"region": r["sgg_cd"], "region_name": name}
    if args.get("service"):
        out["service"] = SERVICES.get(str(args["service"]).strip(), args["service"])
    en = getattr(ctx, "lang", "ko") == "en"
    sc = None
    if getattr(ctx, "http", None) is not None:
        try:
            j = await _j(ctx, "GET", f"/jobs/scope/{r['sgg_cd']}")
            sc = scope_of(j, en)
            if sc is None and j.get("reason") == "no_imagery":
                out["scope_text"] = "Imagery registration needed" if en else "영상 등록 필요"
        except Exception:                                  # noqa: BLE001 — 범위를 못 세면 지역 이름만(지어내지 않음)
            sc = None
    what = f" {out['service']}" if out.get("service") else ""
    if sc:
        out["scope_text"] = sc["text"]
        out["title"] = (f"AI{what} analysis of {r['name']} · {sc['text']}" if en else f"{r['name']} AI{what} 분석 실행 · {sc['text']}")
    else:
        out["title"] = f"AI{what} analysis of {r['name']}" if en else f"{r['name']} AI{what} 분석 실행"
    return out


async def prepare_build(args: dict, ctx) -> dict:
    r = resolve_region(args, ctx)
    name = r.get("full") or r["name"]
    return {"region": r["sgg_cd"], "region_name": name, "title": f"{r['name']} 실태조사 결과 만들기"}


PREPARE = {"analysis_run": prepare, "survey_build": prepare_build}

RUN_RX = re.compile(r"분석.{0,8}(실행|돌려|시작|해\s*줘|해줘|해\s*주세요|진행)|(돌려|실행해)\s*(줘|주세요)")
BUILD_RX = re.compile(r"실태조사.{0,12}(만들|생성|돌려|실행|시작)")
NOT_RUN = re.compile(r"보고서|차트|몇|건수|목록|결과\s*(보여|알려)|설명|법|조문|의심\s*필지")
SERVICE_RX = re.compile(r"비닐하우스|건물|경작지|주차장")


CHART_RX = re.compile(r"(읍\s*면\s*동|동별|읍면별|읍·면·동).{0,16}(차트|그래프|막대|도표)|(차트|그래프|막대|도표).{0,16}읍\s*면\s*동")
NOT_CHART = re.compile(r"대장|규칙|유형|등급|필지\s*목록|보고서|법|조문|영상\s*설명")


async def route_chart(t: str, ctx) -> dict | None:
    """'읍면동별 차트로' — 지역을 말하지 않으면 지금 지도 지역(context.region). 대장·규칙·등급 차트는 다른 도구."""
    if not CHART_RX.search(t) or NOT_CHART.search(t) or not allowed("emd_chart", ctx.principal):
        return None
    regs = _regions_in(t)
    if len({h["_key"] for h in regs}) > 1:
        return None
    if regs:
        return {"tool": "emd_chart", "args": {"region": regs[0]["sgg_cd"]}}
    cur = (ctx.context or {}).get("region")
    return {"tool": "emd_chart", "args": {"region": str(cur)}} if cur else None


async def route_analyze(msg: str, ctx) -> dict | None:
    """'○○ 전역 분석 실행해 줘' · '○○ 비닐하우스 분석해 줘' → analysis_run · '실태조사 결과 만들어 줘' → survey_build(권한 안일 때만)
    · 분석이 진행 중인 지역의 실태조사 요청 → survey_wait(확인 카드 없이 '끝나면 이어서 만듭니다') · '읍면동별 차트로' → emd_chart."""
    t = re.sub(r"\s+", " ", msg or "").strip()
    if not t or len(t) > 80:
        return None
    ch = await route_chart(t, ctx)
    if ch:
        return ch
    if NOT_RUN.search(t):
        return None
    p = ctx.principal
    tool = "survey_build" if BUILD_RX.search(t) else "analysis_run" if RUN_RX.search(t) else None
    if not tool or not allowed(tool, p):
        return None
    regs = _regions_in(t)
    if len({h["_key"] for h in regs}) > 1:
        return None
    args = {}
    if regs:
        args["region"] = regs[0]["sgg_cd"]
    elif not (ctx.context or {}).get("region"):
        return None                                    # 지역이 없으면 모델이 되묻는다
    m = SERVICE_RX.search(t)
    if tool == "analysis_run" and m:
        args["service"] = m.group(0)
    if tool == "survey_build":
        try:
            r = resolve_region(args, ctx)
            rj = await region_jobs([c for c in (r["sgg_cd"], r.get("prev_cd")) if c], (ctx.state or {}).get("_c2xi_checks"))
            if rj.get("running"):
                return {"tool": "survey_wait", "args": {"region": r["sgg_cd"]}}
            if rj.get("partial") and not rj.get("done"):              # 멈춘 분석만 — 확인 카드 없이 이유 한 줄
                return {"tool": "survey_wait", "args": {"region": r["sgg_cd"], "why": "partial"}}
        except Exception:                              # noqa: BLE001 — 판정 못 하면 확인 카드 길 그대로
            pass
    return {"tool": tool, "args": args}


ROUTE = route_analyze

HANDLERS.update({"analysis_run": analysis_run, "survey_build": survey_build, "survey_wait": survey_wait, "emd_chart": emd_chart})

ensure_chain_loop()                                    # 게이트웨이 기동 때(이벤트 루프 안에서 불림) 이어 만들기 순찰을 띄운다 · 시험·루프 밖이면 아무것도 안 함
