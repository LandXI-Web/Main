"""작업 도구 — jobs_quote(조회) · jobs_submit(쓰기 · 확인 카드 필수 · sales demo:true 강제).

프레임은 LLM 이 만들지 않는다: 화면 context.frame(사람이 그린 사각/다각)만 쓴다. 모델·영상 선택은 XI맵 견적 카드와 같은 규칙
(모델 학습 GSD 에 가장 가까운, 프레임을 덮는 자체 영상).
"""
from __future__ import annotations

import math

from . import Out, ToolError

SERVICE_CLS = {"greenhouse": "비닐하우스", "비닐하우스": "비닐하우스", "building": "건물", "건물": "건물", "farmland": "경작지", "경작지": "경작지",
               "parking": "주차장", "주차장": "주차장"}
PREFER = {"비닐하우스": ["namwon/Vinyl_house/train2", "namwon/Vinyl_house/train", "aerial25/best"],
          "건물": ["aerial25/best"], "경작지": ["namwon/cultivate_uncultivate/train", "aerial25/best"], "주차장": ["aerial25/best"]}


def _bbox(geom: dict) -> list[float]:
    xs, ys = [], []

    def walk(c):
        if isinstance(c, (list, tuple)) and c and isinstance(c[0], (int, float)):
            xs.append(c[0])
            ys.append(c[1])
        elif isinstance(c, (list, tuple)):
            for x in c:
                walk(x)
    walk(geom.get("coordinates"))
    return [min(xs), min(ys), max(xs), max(ys)]


async def _j(ctx, method: str, path: str, **kw):
    res = await ctx.http.request(method, path, **kw)
    try:
        j = res.json()
    except Exception:
        j = {}
    if res.status_code >= 400:
        e = (j or {}).get("error") or {}
        code = e.get("code") or f"http_{res.status_code}"
        raise ToolError("tool_forbidden" if res.status_code == 403 and code in ("forbidden",) else code, e.get("message") or code, res.status_code)
    return j


async def plan_body(args: dict, ctx) -> dict:
    frame = ctx.context.get("frame")
    if isinstance(frame, dict) and frame.get("type") == "Feature":
        frame = frame.get("geometry")
    if not frame or frame.get("type") not in ("Polygon", "MultiPolygon"):
        raise ToolError("frame_required", "지도에서 프레임(사각·다각)을 먼저 그려 주세요 — 에이전트는 분석 범위를 만들지 않습니다", 400)
    cls = SERVICE_CLS.get(str(args.get("service") or args.get("cls") or "").strip(), None)
    models = (await _j(ctx, "GET", "/registry/models")).get("items") or []
    by_id = {m["id"]: m for m in models}
    if args.get("model_id") and args["model_id"] in by_id:
        cands = [by_id[args["model_id"]]]
    else:
        if not cls:
            raise ToolError("bad_request", "service 는 greenhouse|building|farmland|parking 중 하나")
        cands = [by_id[i] for i in PREFER.get(cls, []) if i in by_id]
    if not cands:
        raise ToolError("not_found", f"'{cls}' 을 탐지하는 등록 모델 없음", 404)
    layers = (await _j(ctx, "GET", "/catalog/layers", params={"z": 16})).get("items") or []
    b = _bbox(frame)
    imgs = [it for it in layers if it.get("role") == "imagery" and it.get("source") != "external" and it.get("gsd_m") and it.get("bounds")
            and b[0] >= it["bounds"][0] and b[2] <= it["bounds"][2] and b[1] >= it["bounds"][1] and b[3] <= it["bounds"][3]]
    if not imgs:
        raise ToolError("aoi_outside_footprint", "프레임을 덮는 자체 영상이 없습니다(외부 위성 층은 분석 불가)", 400)
    # 선호 순서대로: 모델 학습 GSD 의 2.5배 안에 드는 자체 영상이 있으면 그 모델 · 영상은 가장 가까운 GSD → 최신 시점
    # 후보 쌍(모델 선호 순 × 학습 GSD 가까운 영상 → 최신 시점). 원본 래스터가 없는 층은 견적에서 떨어진다 → 다음 후보(jobs_quote)
    pairs = []
    for m in cands:
        g = float(m.get("gsd_trained_m") or 0.25)
        near = [it for it in imgs if abs(math.log(float(it["gsd_m"]) / g)) < 0.92]
        near.sort(key=lambda it: (round(abs(math.log(float(it["gsd_m"]) / g)), 2), -int(str(it.get("epoch") or "0").replace("-", "")[:6] or 0)))
        pairs += [(m, it) for it in near]
    if not pairs:
        m = cands[-1]
        g = float(m.get("gsd_trained_m") or 0.25)
        pairs = [(m, sorted(imgs, key=lambda it: abs(math.log(float(it["gsd_m"]) / g)))[0])]
    demo = ctx.principal.role == "sales"
    return [{"kind": "infer", "model_id": m["id"], "imagery_id": it["id"], "aoi": frame,
             "options": {"chip": 1024, "overlap": 0.125, "conf": 0.25}, "demo": demo, "label": f"에이전트 · {cls or m['id']}",
             "_meta": {"model": m["id"], "imagery": (it.get("name") or {}).get("ko") or it["id"], "gsd_m": it["gsd_m"], "cls": cls}} for m, it in pairs]


async def jobs_quote(args: dict, ctx) -> Out:
    tried, q, body, meta, bad_img = [], None, None, None, set()
    for cand in (await plan_body(args, ctx))[:16]:
        meta = cand.pop("_meta")
        if cand["imagery_id"] in bad_img:
            continue
        try:
            q = await _j(ctx, "POST", "/jobs/quote", json=cand)
            body = cand
            break
        except ToolError as e:
            tried.append(f"{meta['model']}×{cand['imagery_id']}: {e.code}")
            bad_img.add(cand["imagery_id"])
            if e.code in ("quota_exceeded", "tool_forbidden", "demo_required"):
                raise
    if q is None:
        raise ToolError("cog_unavailable", "프레임을 덮는 영상 중 원본 래스터로 추론 가능한 것이 없습니다 · " + " · ".join(tried), 400)
    if tried:
        meta["skipped"] = tried
    ctx.state["pending_submit"] = {"body": body, "quote": q, "meta": meta}
    out = Out(source="POST /api/v1/jobs/quote")
    for k, lab in (("area_km2", "프레임 면적"), ("shards_env", "shard 수"), ("gpu_s", "예상 GPU·s"), ("eta_s", "예상 소요")):
        if isinstance(q.get(k), dict):
            out.env(k, lab, q[k])
    rem = ((q.get("quota") or {}).get("remaining"))
    if isinstance(rem, dict):
        out.env("quota_remaining", f"기관 쿼터 잔여({(q.get('quota') or {}).get('dim')})", rem)
    out.data = {"모델": meta["model"], "영상": meta["imagery"], "대상": meta["cls"], "허용": q.get("allowed"), "사유": q.get("reasons"),
                "풀": q.get("pool"), "시연": body["demo"], "비고": "제출은 jobs_submit — 사람이 확인 카드를 승인해야 실행"}
    out.raw = {"quote": q, "meta": meta}
    return out


async def jobs_submit_exec(ctx) -> Out:
    """확인 카드 승인 뒤에만 runner 가 부른다."""
    ps = ctx.state.get("pending_submit")
    if not ps:
        raise ToolError("bad_request", "견적(jobs_quote) 없이 제출할 수 없습니다")
    body = dict(ps["body"])
    if ctx.principal.role == "sales":
        body["demo"] = True
    j = await _j(ctx, "POST", "/jobs", json=body)
    job = j.get("job") if isinstance(j.get("job"), dict) else j
    out = Out(source="POST /api/v1/jobs")
    if isinstance(job.get("shards_env"), dict):
        out.env("shards", "제출 shard 수", job["shards_env"])
    out.data = {"job_id": job.get("id"), "상태": job.get("state"), "풀": job.get("pool"), "모델": body["model_id"], "시연": body.get("demo")}
    out.ui_actions.append({"op": "job_theater", "job_id": job.get("id"), "frame": body["aoi"], "model_id": body["model_id"],
                           "imagery_id": body["imagery_id"], "demo": body.get("demo"), "shards_total": job.get("shards_total") or job.get("shards")})
    out.raw = {"job": job}
    return out


async def await_job(ctx, job_id: str, timeout_s: float = 240.0) -> dict | None:
    """제출한 작업의 끝(job.done · job.failed)을 Redis events:{job} 스트림에서 기다린다 — 그동안 LLM 은 쉰다
    (GPU 전력 규칙: GPU0 실추론과 GPU1 LLM 생성을 겹치지 않게 순차). 반환 = job.done data 또는 None(시간 초과)."""
    import asyncio
    import json
    import time
    if ctx.r is None or not job_id:
        return None
    key, cur, t_end = f"events:{job_id}", "0-0", time.monotonic() + timeout_s
    while time.monotonic() < t_end:
        res = await ctx.r.xread({key: cur}, block=2000, count=200)
        for _s, entries in res or []:
            for eid, f in entries:
                cur = eid
                ev = f.get("event")
                if ev in ("job.done", "job.failed", "job.cancelled"):
                    try:
                        d = json.loads(f.get("data") or "{}")
                    except Exception:
                        d = {}
                    d["_event"] = ev
                    return d
        await asyncio.sleep(0)
    return None


def job_done_out(out: Out, d: dict | None, job_id: str) -> Out:
    """job.done 봉투를 도구 결과에 싣는다(counts_env · gpu_s · chips_per_gpu_s · chips_per_wall_s)."""
    if not d:
        out.note = "작업 진행 중(대기 시간 초과) — 극장·관제에서 이어서 확인"
        return out
    if d.get("_event") != "job.done":
        out.note = f"{d.get('_event')} · {d.get('error') or ''}"
        return out
    for k, lab in (("counts_env", "탐지 수(전역 NMS 뒤)"), ("gpu_s", "이 작업 GPU·s"), ("chips_per_gpu_s", "GPU 초당 칩"), ("chips_per_wall_s", "벽시계 칩/s")):
        if isinstance(d.get(k), dict):
            out.env(k, lab, d[k])
    out.data = {**(out.data or {}), "완료": True, "클래스별": d.get("counts"), "결과세트": d.get("result_set")}
    return out
