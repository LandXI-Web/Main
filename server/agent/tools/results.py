"""조회 도구 — catalog_layers · results_stats · results_features · parcel_at · results_parcels_join (계약 §4.1 · §4.5 · v1.1-21).

전부 HTTP(루프백 :8700 · 사용자 Bearer 상속). 응답의 봉투를 그대로 모아 key 를 붙인다(값을 새로 만들지 않는다).
소유자 성명·원본 경로는 데이터 블록에 싣지 않는다(owner_kind 만 · path_internal 제거).
"""
from __future__ import annotations

import re

from . import Out, ToolError

_DROP = {"path_internal", "path", "tiles", "url", "owner_nm", "OWNER_NM", "owner_name"}
_SET_RX = re.compile(r"^results/[a-z0-9_\-]+/[a-z0-9_\-\.]+$", re.I)


def _is_env(o):
    return isinstance(o, dict) and "value" in o and isinstance(o.get("unit"), str) and isinstance(o.get("basis"), str) and "source" in o


def _collect(out: Out, o, label: str, limit: int = 24):
    """응답 트리의 봉투를 모은다(최대 limit) — key 는 경로에서."""
    stack = [(label, o)]
    n = 0
    while stack and n < limit:
        path, cur = stack.pop(0)
        if _is_env(cur):
            k = re.sub(r"[^a-z0-9_]+", "_", path.lower()).strip("_")[:40] or f"v{n}"
            out.env(k, path, cur)
            n += 1
        elif isinstance(cur, dict):
            for k, v in cur.items():
                if k in _DROP:
                    continue
                stack.append((f"{path}.{k}" if path else k, v))
        elif isinstance(cur, list):
            for i, v in enumerate(cur[:40]):
                key = (v.get("key") or v.get("id") or v.get("cls") or i) if isinstance(v, dict) else i
                stack.append((f"{path}[{key}]", v))


def _scrub(o, depth=0):
    if depth > 6:
        return None
    if isinstance(o, dict):
        return {k: _scrub(v, depth + 1) for k, v in o.items() if k not in _DROP}
    if isinstance(o, list):
        return [_scrub(v, depth + 1) for v in o[:20]]
    return o


async def _get(ctx, path: str, params: dict | None = None):
    res = await ctx.http.get(path, params={k: v for k, v in (params or {}).items() if v not in (None, "")})
    if res.status_code == 403:
        raise ToolError("tool_forbidden", "권한 밖(서버 403)", 403)
    if res.status_code == 404:
        try:
            e = res.json().get("error") or {}
        except Exception:
            e = {}
        raise ToolError(e.get("code") or "not_found", e.get("message") or f"{path} 없음", 404)
    if res.status_code >= 400:
        raise ToolError("upstream_error", res.text[:200], res.status_code)
    return res.json()


async def _set(args, ctx) -> str:
    """결과 세트 — 인자 그대로, 없으면 지역(region 인자 · 화면 문맥 · 기관 관할)의 결과 층 중 토지피복 먼저(GET /regions/{sgg}/results).
    모델이 지어낸 세트 이름(형식이 다름)은 버리고 지역으로 찾는다(QA-통계 · 10-11 — 'results/tenant/default/greenhouse' 로 세 번 실패)."""
    s = args.get("set")
    if s and not _SET_RX.match(str(s)):
        s = None
    if not s:
        from . import scope as S
        reg = await S.region_of(ctx, args)
        if not reg.get("sgg"):
            raise ToolError("bad_request", "어느 지역 결과인지 region(시군구)을 알려 주세요")
        j = await _get(ctx, f"/regions/{reg['sgg']}/results")
        items = [it for it in j.get("items") or [] if it.get("set")]
        cls = args.get("cls")
        # 같은 지역에 결과가 여럿이면: 그 대상(cls)을 찾는 서비스의 전역 분석 → 전역 분석 → 토지피복 → 분석 결과 순.
        # 작은 부분 분석(영상 일부)을 지역 결과로 집지 않는다 — 지도 서비스 · 분석하기와 같은 숫자(QA-통계 · 10-11 종단 시험)
        items.sort(key=lambda it: (not (cls and it.get("classes") == [cls] and it.get("full")),
                                   not (it.get("from") == "job" and it.get("full")),
                                   it.get("style") != "landcover", it.get("from") != "job"))
        if not items:
            raise ToolError("not_found", "해당 지역 데이터가 없습니다", 404)
        s = items[0]["set"]
    s = str(s)
    if not _SET_RX.match(s):
        raise ToolError("bad_request", f"set 형식 results/{{tenant}}/{{name}} ({s})")
    return s


async def catalog_layers(args: dict, ctx) -> Out:
    v = ctx.context.get("view") or {}
    j = await _get(ctx, "/catalog/layers", {"z": args.get("z") or v.get("zoom"), "bbox": ",".join(map(str, v["bbox"])) if v.get("bbox") else None})
    out = Out(source="GET /api/v1/catalog/layers")
    items = j.get("items") or []
    out.data = [{"id": it.get("id"), "이름": (it.get("name") or {}).get("ko"), "역할": it.get("role"), "gsd_m": it.get("gsd_m"), "시점": it.get("epoch"),
                 "set": it.get("set")} for it in items if it.get("role") in ("imagery", "result")][:24]
    for it in items:
        if it.get("role") == "result" and _is_env(it.get("count")):
            out.env(f"count_{it['id']}"[:40], f"{(it.get('name') or {}).get('ko')} 개수", it["count"])
    return out


async def results_stats(args: dict, ctx) -> Out:
    s = await _set(args, ctx)
    try:
        j = await _get(ctx, f"/results/{s}/stats", {"by": args.get("by") or "emd"})
    except ToolError as e:
        if e.status != 404 or not args.get("set"):
            raise
        s = await _set({**args, "set": None}, ctx)                      # 없는 세트를 짚었으면 지역의 결과로(QA-통계)
        j = await _get(ctx, f"/results/{s}/stats", {"by": args.get("by") or "emd"})
    out = Out(source=f"GET /api/v1/results/{s}/stats")
    items = j.get("items") or []
    emd = args.get("emd")
    cls = args.get("cls")
    # 한 가지만 찾는 서비스의 결과는 줄마다 cls 가 비어 있다 — 그 줄을 cls 거르기로 버리지 않는다(QA-통계)
    sel = [it for it in items if (not emd or str(it.get("key", "")).startswith(str(emd))) and (not cls or it.get("cls") in (cls, None))]
    for it in sel[:16]:
        k = f"{it.get('key')}_{it.get('cls') or ''}"
        if _is_env(it.get("n")):
            out.env(re.sub(r"\W+", "_", k)[:40] + "_n", f"{it.get('key')} {it.get('cls') or ''} 개수", it["n"])
        if _is_env(it.get("area_ha")):
            out.env(re.sub(r"\W+", "_", k)[:40] + "_ha", f"{it.get('key')} {it.get('cls') or ''} 면적", it["area_ha"])
    out.data = {"set": s, "by": args.get("by") or "emd", "행": len(sel), "비고": "AI 추론 · 검수 전"}
    return out


async def results_features(args: dict, ctx) -> Out:
    s = await _set(args, ctx)
    v = ctx.context.get("view") or {}
    bbox = args.get("bbox") or v.get("bbox")
    if not bbox:
        raise ToolError("bad_request", "bbox 가 필요합니다(현재 뷰 없음)")
    j = await _get(ctx, f"/results/{s}/features", {"bbox": ",".join(map(str, bbox)), "cls": args.get("cls"), "min_conf": args.get("min_conf"), "limit": 2000})
    out = Out(source=f"GET /api/v1/results/{s}/features")
    lx = j.get("lx") or {}
    _collect(out, lx, "lx", 6)
    n = len(j.get("features") or [])
    out.env("returned", "반환 피처 수", {"value": n, "unit": "features", "basis": "measured", "as_of": ctx.now(), "source": out.source, "note": "2,000 한도"})
    out.data = {"set": s, "bbox": bbox, "비고": "AI 추론 · 검수 전 · 2,000건 넘으면 results_stats 로"}
    out.raw = {"bbox": bbox, "features": (j.get("features") or [])[:400], "count_key": "returned", "label": f"에이전트 질의 · {s} · 저장 안 됨"}
    return out


async def parcel_at(args: dict, ctx) -> Out:
    try:
        lng, lat = float(args["lng"]), float(args["lat"])
    except (KeyError, TypeError, ValueError):
        raise ToolError("bad_request", "lng · lat 숫자 필요")
    j = await _get(ctx, "/parcels", {"lng": lng, "lat": lat})
    out = Out(source="GET /api/v1/parcels")
    _collect(out, {k: v for k, v in j.items() if k not in _DROP}, "parcel", 6)
    for t in (j.get("jibun"), j.get("pnu")):
        for m in re.findall(r"\d+(?:-\d+)?", str(t or "")):
            out.whitelist.add(m)
    out.data = {"pnu": j.get("pnu"), "지번": j.get("jibun"), "지목": j.get("jimok"), "읍면동": j.get("emd"), "리": j.get("ri"),
                "소유구분": j.get("owner_kind"), "비고": j.get("note")}
    out.citations.append({"kind": "parcel", "pnu": j.get("pnu"), "addr": f"{j.get('emd') or ''} {j.get('ri') or ''} {j.get('jibun') or ''}".strip(),
                          "center": [lng, lat], "label": f"{j.get('emd') or ''} {j.get('jibun') or ''}"})
    return out


async def results_parcels_join(args: dict, ctx) -> Out:
    s = await _set(args, ctx)
    params = {"cls": args.get("cls"), "jimok": args.get("jimok"), "emd_cd": args.get("emd_cd"), "min_conf": args.get("min_conf"), "limit": args.get("limit") or 2000}
    try:
        j = await _get(ctx, f"/results/{s}/parcels", params)
    except ToolError as e:
        if e.status == 404:
            raise ToolError("parcels_unavailable", "필지 결합 API(v1.1-21 · F2-B) 미도착 — survey_findings 를 쓰세요", 404)
        raise
    out = Out(source=f"GET /api/v1/results/{s}/parcels")
    _collect(out, j.get("lx") or {}, "lx", 12)
    out.data = {"set": s, "필지": len(j.get("features") or []), "비고": "AI 추론 · 검수 전 · 지목 기준 연속지적"}
    out.raw = {"features": (j.get("features") or [])[:400], "count_key": next((k for k, _, _ in out.envelopes if "count" in k), None),
               "label": f"에이전트 질의 · 필지 결합 · 저장 안 됨"}
    return out


def scrub(o):
    return _scrub(o)
