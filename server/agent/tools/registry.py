"""도구 레지스트리 — 명세 · caps 교집합 · 쓰기/확인 표 · 핸들러.

원칙(AGENT-SPEC §0): 에이전트에 새 권한이 없다. 도구 목록 = 사용자 caps 와의 교집합. 쓰기는 jobs_submit · survey_state 둘뿐이고
둘 다 확인 카드(사람 승인) 뒤에만 실행된다. deploys.* · PATCH /results · 쿼터 쓰기 도구는 없다(요청하면 tool_forbidden).
"""
from __future__ import annotations

from . import Out, ToolError, from_contract, jobs, results, survey

RULES = ["R1", "R2", "R3", "R4", "R5", "R6"]
REGION = {"type": "string", "description": "시군구 이름 또는 5자리 코드(질문에 지역이 있을 때만 · 기관 계정은 관할 안)"}

SPECS: dict[str, dict] = {
    "survey_findings": {
        "description": "실태조사 의심 필지 목록(우선순위 점수순 · 지역 = region 또는 관할). R1 무허가 건축 의심(지목 전·답·과수원 위 AI 건물) · R2 휴경·전용 의심 · "
                       "R3 비농지 위 비닐하우스 · R4 농지 위 주차장 · R5 임야 개간 · R6 공공용지(도로·구거·하천) 위 건물. '답 위 건물'=rule R1+jimok 답.",
        "properties": {"region": REGION, "rule": {"type": "string", "enum": RULES}, "emd": {"type": "string", "description": "읍면동 이름"},
                       "jimok": {"type": "string", "enum": ["전", "답", "과"], "description": "지목 한 글자"},
                       "priority": {"type": "string", "enum": ["A", "B", "C"], "description": "사용자가 등급(A·B·C)을 직접 말할 때만"},
                       "top": {"type": "integer", "description": "상위 몇 필지(기본 5 · 최대 20) — 점수순이므로 등급 인자 없이 top 만 쓴다"}}},
    "survey_stats": {
        "description": "실태조사 의심 건수 집계(지역 전체 또는 읍면동). '전체 몇 건' · '몇 필지' 질문은 반드시 이것으로 확인한다.",
        "properties": {"region": REGION, "by": {"type": "string", "enum": ["rule", "priority", "emd"]}, "emd": {"type": "string", "description": "읍면동 이름(없으면 지역 전체)"},
                       "rule": {"type": "string", "enum": RULES}},
        "required": ["by"]},
    "survey_parcel": {
        "description": "한 필지의 대장(지목·면적·용도지역) vs 현황(AI 면적) · 의심 규칙 · 이력.",
        "properties": {"pnu": {"type": "string", "description": "19자리 PNU"}}, "required": ["pnu"]},
    "results_stats": {
        "description": "AI 결과 층의 읍면동·클래스별 개수·면적(봉투).",
        "properties": {"region": REGION, "set": {"type": "string", "description": "results/{tenant}/{name} (없으면 그 지역의 토지피복 결과)"},
                       "by": {"type": "string", "enum": ["emd", "cls"]}, "emd": {"type": "string"}, "cls": {"type": "string", "enum": ["건물", "경작지", "주차장", "비닐하우스"]}}},
    "results_features": {
        "description": "현재 뷰 bbox 안 AI 결과 피처(2,000 한도).",
        "properties": {"region": REGION, "set": {"type": "string"}, "cls": {"type": "string"}, "min_conf": {"type": "number"}}},
    "parcel_at": {
        "description": "좌표의 필지(지번·지목·소유구분 — 성명 없음).",
        "properties": {"lng": {"type": "number"}, "lat": {"type": "number"}}, "required": ["lng", "lat"]},
    "results_parcels_join": {
        "description": "AI 결과 × 필지 공간 결합(지목·클래스 필터).",
        "properties": {"region": REGION, "set": {"type": "string"}, "cls": {"type": "string"}, "jimok": {"type": "string"}, "emd_cd": {"type": "string"}}},
    "catalog_layers": {"description": "현재 뷰의 영상 사다리 · 결과 층 목록.", "properties": {}},
    "jobs_quote": {
        "description": "화면에 그려진 프레임을 분석하는 작업 견적(면적·shard·GPU·s 추정·쿼터). 프레임 분석 요청이면 이것을 먼저 부른다.",
        "properties": {"service": {"type": "string", "enum": ["greenhouse", "building", "farmland", "parking"],
                                   "description": "탐지 대상(비닐하우스=greenhouse)"}}, "required": ["service"]},
    "jobs_submit": {
        "description": "직전 견적대로 GPU 분석 작업 제출. 사람이 확인 카드를 승인해야 실행된다(승인 전 실행 없음). 사용자가 분석 실행을 원하면 jobs_quote 다음에 부른다.",
        "properties": {}},
    "survey_state": {
        "description": "의심 건 판정 기록(확인 · 종결 · 오탐). 현장 확인 배정은 없다. 사람이 확인 카드를 승인해야 실행.",
        "properties": {"finding_id": {"type": "string"}, "state": {"type": "string", "enum": ["dismissed", "inspected", "closed"]},
                       "verdict": {"type": "string", "enum": ["match", "violation", "match_fp", "unclear"]},
                       "reason": {"type": "string"}}, "required": ["finding_id", "state"]},
    # 클라이언트 도구(F2-A window.XI) — 서버는 ui_actions 로만 내려준다
    "map_arrive": {"description": "직전 도구 결과(필지·피처)를 지도에 도착(스윕·락온·숫자)시킨다.",
                   "properties": {"step": {"type": "integer", "description": "결과를 낸 계획 단계 번호(생략 = 마지막)"}}},
    "map_flyto": {"description": "인용된 필지로 지도 이동 + 필지 카드.", "properties": {"pnu": {"type": "string"}}, "required": ["pnu"]},
    "map_on": {"description": "결과 층 켜기.", "properties": {"set": {"type": "string"}}, "required": ["set"]},
    "map_frame": {"description": "직전 결과 범위를 분석 프레임으로 표시.", "properties": {"step": {"type": "integer"}}},
    "drawer_open": {"description": "보고서·통계·의심 큐 서랍 열기.", "properties": {"kind": {"type": "string", "enum": ["report", "stats", "findings"]},
                                                                           "emd": {"type": "string"}, "rule": {"type": "string", "enum": RULES}}, "required": ["kind"]},
    "parcel_card": {"description": "필지 카드 열기.", "properties": {"pnu": {"type": "string"}}, "required": ["pnu"]},
}

WRITE = {"jobs_submit", "survey_state"}
CONFIRM = {"jobs_submit", "survey_state"}
CLIENT = from_contract.CLIENT
FORBIDDEN_NAMES = {"deploys", "deploy_rollback", "deploys_rollback", "deploys_write", "quota_write", "tenants_quota", "results_edit", "patch_results",
                   "ops_models_unload", "jobs_requeue", "jobs_priority", "feedback_create"}


def allowed(name: str, p) -> bool:
    caps = set(p.caps or [])
    if p.realm is None:
        return False
    from . import ext
    if name in ext.ALLOWED:                                    # 확장 도구(plan 3.1) — 모듈의 allowed(없으면 기관·LX)
        try:
            return bool(ext.ALLOWED[name](name, p))
        except Exception:  # noqa: BLE001
            return False
    if name in CLIENT or name in ("catalog_layers", "parcel_at"):
        return True
    if name in ("results_stats", "results_features", "results_parcels_join"):
        return bool(caps & {"results.read", "results.read(own)"})
    if name in ("survey_findings", "survey_stats", "survey_parcel"):
        return p.realm == "lx" or (p.realm == "tenant")          # 기관 경계는 핸들러(scope.region_of · 관할 = regions.tenant_scope)
    if name in ("jobs_quote", "jobs_submit"):
        return bool(caps & {"jobs.submit", "jobs.submit(demo only)"})
    if name == "survey_state":
        return (p.realm == "tenant" and p.role == "manager") or (p.realm == "lx" and p.role in ("staff", "admin"))
    return False


def tools_for(p) -> list[dict]:
    # route_only 명세(확장 ROUTE 직행 전용 · plan 3.1)는 모델에게 내놓지 않는다
    return from_contract.build({k: {kk: vv for kk, vv in v.items() if kk != "route_only"} for k, v in SPECS.items()
                                if allowed(k, p) and not v.get("route_only")})


HANDLERS = {
    "survey_findings": survey.survey_findings, "survey_stats": survey.survey_stats, "survey_parcel": survey.survey_parcel,
    "results_stats": results.results_stats, "results_features": results.results_features, "parcel_at": results.parcel_at,
    "results_parcels_join": results.results_parcels_join, "catalog_layers": results.catalog_layers, "jobs_quote": jobs.jobs_quote,
}


def validate(name: str, args: dict) -> dict:
    """계약 밖 인자 → 400(LLM 에 되돌려 다시 부르게). 열거값 검사."""
    spec = SPECS.get(name)
    if spec is None:
        raise ToolError("tool_forbidden", f"도구 '{name}' 은 에이전트에 없습니다(계약 밖 또는 금지)", 403)
    props = spec.get("properties") or {}
    clean = {}
    for k, v in (args or {}).items():
        if k not in props:
            continue                                  # 모르는 인자는 버린다(로그에 남음)
        en = props[k].get("enum")
        if en and v not in en:
            raise ToolError("bad_request", f"{name}.{k} 는 {en} 중 하나 ({v})")
        clean[k] = v
    for k in spec.get("required") or []:
        if k not in clean:
            raise ToolError("bad_request", f"{name} 에 {k} 가 필요")
    return clean


def ensure_ext() -> dict:
    """tools/ext/*.py 확장을 한 번 합친다(runner 가 불러올 때 · 테스트는 직접)."""
    import sys
    from . import ext
    return ext.load(sys.modules[__name__], from_contract)


def client_action(name: str, args: dict, ctx) -> Out:
    """클라이언트 도구 → ui_actions (서버는 실행하지 않음 · 브라우저가 window.XI 로).
    확장 CLIENT 도구(map_region·map_zoom·map_view·map_layer·analysis_watch …)는 핸들러가 없으면 {op: 이름, **인자} 그대로 나간다."""
    out = Out(source="window.XI (F2-A 브리지)")
    step = args.get("step")
    prev = ctx.last_raw(step)
    if name == "map_arrive":
        if not prev or not (prev.get("features") or prev.get("bbox")):
            raise ToolError("bad_request", "도착시킬 결과가 없습니다(먼저 조회 도구)")
        out.ui_actions.append({"op": "map_on", "set": prev.get("set") or "survey/findings", "label": prev.get("label"), "filter": prev.get("filter"),
                               "sgg_cd": (prev.get("filter") or {}).get("sgg_cd"), "import_id": (prev.get("filter") or {}).get("ledger")})
        out.ui_actions.append({"op": "map_arrive", "bbox": prev.get("bbox"), "features": prev.get("features"),
                               "sgg_cd": (prev.get("filter") or {}).get("sgg_cd"), "import_id": (prev.get("filter") or {}).get("ledger"),
                               "count_env": ctx.env_id(prev.get("count_key"), prev.get("_step")), "total_env": ctx.env_id(prev.get("total_key"), prev.get("_step"))})
        out.data = {"도착": len(prev.get("features") or []), "비고": "브라우저가 도착(스윕·락온·숫자)을 실행"}
    elif name == "map_frame":
        if not prev or not prev.get("bbox"):
            raise ToolError("bad_request", "프레임으로 만들 결과 범위가 없습니다")
        b = prev["bbox"]
        out.ui_actions.append({"op": "map_frame", "geojson": {"type": "Polygon", "coordinates": [[[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]], [b[0], b[1]]]]}})
    elif name in ("map_flyto", "parcel_card"):
        pnu = str(args.get("pnu") or "")
        c = ctx.citation_for(pnu)
        if not c:
            raise ToolError("bad_request", f"인용에 없는 필지({pnu}) — 먼저 조회")
        out.ui_actions.append({"op": "map_flyto", "bbox": c.get("bbox"), "center": c.get("center"), "pnu": pnu})
        out.ui_actions.append({"op": "parcel_card", "pnu": pnu, "center": c.get("center")})
    elif name == "map_on":
        out.ui_actions.append({"op": "map_on", "set": args["set"], "label": "에이전트 질의 · 저장 안 됨"})
    elif name == "drawer_open":
        from . import scope as S
        prev_f = (prev or {}).get("filter") or {}
        reg = {"sgg": prev_f.get("sgg_cd") or (ctx.context or {}).get("region")}
        n, cd = S.emd_resolve(reg, args.get("emd"))
        out.ui_actions.append({"op": "drawer_open", "kind": args["kind"], "tab": "draft" if args["kind"] == "report" else None,
                               "emd_cd": cd, "emd": n, "rule": args.get("rule")})
    elif name not in ("map_arrive", "map_frame"):
        out.ui_actions.append({"op": name, **args})
    out.data = out.data or {"ui": [a["op"] for a in out.ui_actions]}
    return out
