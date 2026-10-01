"""운영 읽기 도구(c2-ops · C2 ⑧) — LX 관리자만. LX 관리자 대시보드 Ctrl K 에서 GPU · 대기열 · 경보 · 기관 사용량 · 언어 모델을 말로 묻는다.

원칙:
  - 읽기만 한다. 수치는 게이트웨이 `/ops/*` 응답(사용자 토큰 그대로 · 관리자 권한) 을 봉투로 옮긴다 — 화면(인프라 · 기관)과 같은 한 출처.
  - GPU 는 순번('GPU 0' · 'GPU 1' — 인프라 표와 같은 이름)으로만 부른다. 제품명 · 포트 · 주소 · 경로는 데이터에 싣지 않는다.
  - 조치(재큐 · 우선순위 · 모델 켜기 등)는 '제안' 문장까지만 낸다. 실행은 화면 버튼으로. 언어 모델(vLLM · Ollama)을 내리자는 제안은 만들지 않는다.
  - 기관 계정 · LX 직원 · 영업에게는 도구가 없다(allowed) — 그 계정의 운영 질문은 runner 가 'LX 관리자 화면에서 확인할 수 있습니다.' 한 줄로 닫는다.
"""
from __future__ import annotations

import datetime as dt
import re

from .. import Out, ToolError

ADMIN_LINE = "LX 관리자 화면에서 확인할 수 있습니다."
KST = dt.timezone(dt.timedelta(hours=9))

USAGE_DIMS = {  # dim → (사용자 말, 봉투 단위(칩 표기), 환산). 이름은 XI ChatGEO(원칙 96) · 사용 현황은 '요청 건수'(원칙 91 · 11차 자원-1)
    "llm_requests_month": ("XI ChatGEO 요청 건수", "건", 1),     # 기본 — 기관이 XI ChatGEO 에 요청한 건수(quota.usage_of 의 agent_runs 이번 달)
    "llm_tokens_month": ("XI ChatGEO 토큰 사용량", "tokens", 1),  # '토큰'을 콕 집어 물을 때만(칩 단위 키 — 화면 i18n: ko 토큰 · en tokens)
    "gpu_s_month": ("GPU 시간", "시간", 1 / 3600),
    "area_km2_month": ("분석 면적", "km2", 1),
    "storage_gb": ("저장", "GB", 1),
}
ALERT_KO = {
    "gpu_temp": "GPU 온도 높음", "vram": "GPU 메모리 거의 참", "worker_heartbeat": "작업기 응답 없음", "queue_wait": "대기 시간 길어짐",
    "disk_e": "저장 공간 부족", "vworld_calls": "지도 자료 호출 많음", "job_fail_rate": "작업 실패 많음",
}
POOL_KO = {"a6000": "GPU 서버", "cpu": "일반 서버", "a100": "증설 GPU 서버"}

SPECS: dict[str, dict] = {
    "ops_gpus": {"description": "GPU 장비 상태(LX 관리자) — GPU 순번별 부하 · 메모리 · 전력 · 온도 · 하는 일, 동시 고부하 GPU 수와 전력 규칙 안·초과. "
                                "'GPU 상태' · 'GPU 괜찮아?' · '전력' 질문은 이것으로 확인한다.", "properties": {}},
    "ops_queues": {"description": "분석 작업 대기열 요약(LX 관리자) — 대기 · 진행 작업 수, 서버별 작업기 수. '대기열' · '밀린 작업' 질문.", "properties": {}},
    "ops_alerts": {"description": "경보(LX 관리자) — 지금 열린 경보 수와 이름, 최근 24시간에 닫힌 경보 수. '경보 있어?' · '문제 있나' 질문.", "properties": {}},
    "ops_usage": {"description": "기관별 사용량(LX 관리자) — 이번 달 XI ChatGEO 요청 건수 · GPU 시간 · 분석 면적 · 저장(사용을 막는 값은 없음 — 사용량만). "
                                 "'기관별 사용량' · '기관별 XI ChatGEO 요청 건수' · '이 기관 토큰 얼마나 썼어' 질문. tenant 를 주면 그 기관만.",
                  "properties": {"tenant": {"type": "string", "description": "기관 이름 또는 id(없으면 전 기관)"},
                                 "dim": {"type": "string", "enum": list(USAGE_DIMS), "description": "항목(기본 XI ChatGEO 요청 건수 · 토큰은 콕 집어 물을 때만)"}}},
    "ops_models": {"description": "언어 모델 상태(LX 관리자) — 두뇌 · 라우터 · 예비 모델 켜짐/꺼짐과 GPU 순번, 국산 모델 연결 자리. '언어 모델 상태' 질문.",
                   "properties": {}},
}
# 관리자가 아닌 계정(기관 · LX 직원 · 영업)이 운영을 물을 때 — 모델 앞 직행으로 한 줄(LLM 0 · 지어낸 운영 서사 0)
SPECS["ops_admin_only"] = {"description": "운영 정보 안내 — 이 계정이 볼 수 없는 GPU · 대기열 · 경보 · 기관별 사용량을 물었을 때만 부른다(다른 질문에는 부르지 않는다).",
                           "properties": {}}
CONTRACT = {
    "ops_gpus": (None, "GET", "/api/v1/ops/gpus"),
    "ops_queues": (None, "GET", "/api/v1/ops/queues"),
    "ops_alerts": (None, "GET", "/api/v1/ops/alerts"),
    "ops_usage": (None, "GET", "/api/v1/ops/tenants"),
    "ops_models": (None, "GET", "/api/v1/ops/llm/models"),
}
WHY = {"ops_admin_only": "운영 정보 안내(관리자 화면)", "ops_gpus": "GPU 장비 상태", "ops_queues": "작업 대기열", "ops_alerts": "열린 경보", "ops_usage": "기관별 사용량", "ops_models": "언어 모델 상태"}
SAY = {"ops_admin_only": "확인", "ops_gpus": "GPU 확인", "ops_queues": "대기열 확인", "ops_alerts": "경보 확인", "ops_usage": "기관 사용량 확인", "ops_models": "언어 모델 확인"}
HINT = ("운영 질문(GPU · 대기열 · 경보 · 기관 사용량 · 언어 모델)은 ops_ 도구로 확인하고 숫자는 봉투로만 쓴다. GPU 는 'GPU 0' 처럼 순번으로 부른다. "
        "조치는 '~를 검토하세요' 제안까지만 쓰고, 언어 모델을 끄자는 말은 하지 않는다.")


def is_admin(p) -> bool:
    return getattr(p, "realm", None) == "lx" and getattr(p, "role", None) == "admin"


def allowed(name: str, p) -> bool:
    if name == "ops_admin_only":
        return getattr(p, "realm", None) in ("tenant", "lx") and not is_admin(p)
    return is_admin(p)


# ── 결정적 직행(모델 앞) — 관리자의 짧은 운영 질문 4종(한국어 · 영어) ─────────────────
_RX = [
    ("ops_usage", re.compile(r"(XI\s*ChatGEO|AI\s*도우미|요청\s*건수|토큰|LLM|사용량|쓴\s*양|얼마나\s*썼|\bAI\s+assistant\b|\btokens?\b|\busage\b)", re.I)),
    ("ops_alerts", re.compile(r"(경보|알림|장애|문제\s*있|\balerts?\b|\balarms?\b|\bincidents?\b)", re.I)),
    ("ops_queues", re.compile(r"(대기열|대기\s*중|밀린|큐|작업\s*(현황|요약|몇)|\bqueues?\b|\bbacklog\b|\bpending\s+jobs?\b)", re.I)),
    ("ops_models", re.compile(r"(언어\s*모델|두뇌|라우터|국산\s*모델|독파모|\blanguage\s+models?\b|\bdomestic\s+model\b)", re.I)),
    ("ops_gpus", re.compile(r"(GPU|그래픽|전력|온도|장비|고부하|\bpower\b|\bhigh\s+load\b|\bbusy\b|\btemperature\b)", re.I)),
]
OPS_ASK = re.compile(r"(GPU|그래픽\s*카드|대기열|작업\s*대기|경보|전력\s*예산|고부하|토큰|AI\s*도우미\s*사용량|XI\s*ChatGEO\s*(사용량|요청\s*건수)|기관별\s*(사용량|요청\s*건수)|언어\s*모델\s*(상태|켜|꺼)|서버\s*상태|"
                     r"queue|alert|token|AI\s+assistant\s+usage|usage\s+(by|per|of\s+each)\s+agenc|each\s+agency|language\s+models?\s+status|"
                     r"power\s+budget|high\s+load)", re.I)
# 운영 질문이라도 '분석을 돌려 달라'는 말이면 운영 안내가 아니다(분석 도구에 맡긴다)
_NOT_OPS = re.compile(r"분석\s*(을|를)?\s*(돌려|실행|시작|해\s*줘)|돌려\s*줘|\brun\s+(the\s+)?analy|\banaly[sz]e\b", re.I)
_TAIL = re.compile(r"\n?\((?:Current area:[^)]*?)?\s*Answer in English\.\)\s*$", re.I)       # 해외 화면이 붙이는 문맥 꼬리


def question_only(msg: str) -> str:
    return _TAIL.sub("", str(msg or "")).strip()


def ROUTE(msg: str, ctx):
    """관리자 + 운영 질문 → 한 도구. 두 가지 이상이 섞이면(예: 'GPU 와 대기열') 모델이 고르게 둔다(None).
    관리자가 아닌 계정 + 운영 질문 → ops_admin_only(한 줄 · LLM 0)."""
    p = getattr(ctx, "principal", None)
    q = question_only(msg)
    if not is_admin(p):
        if getattr(p, "realm", None) in ("tenant", "lx") and OPS_ASK.search(q) and not _NOT_OPS.search(q):
            return {"tool": "ops_admin_only", "args": {}}
        return None
    hits = [name for name, rx in _RX if rx.search(q)]
    if len(hits) != 1:
        return None
    args = {}
    if hits[0] == "ops_usage":
        t = tenant_phrase(q)
        if t:
            args["tenant"] = t
        if _TOKEN_ASK.search(q):                 # '토큰'을 콕 집어 물으면 토큰 · 아니면 기본(XI ChatGEO 요청 건수)
            args["dim"] = "llm_tokens_month"
    return {"tool": hits[0], "args": args}


def ROUTE_FIRST(msg: str, ctx):
    """다른 확장 직행(해외 화면 요약 · 지도 등)보다 먼저 묻는 좁은 운영 직행.
    강한 운영 말(OPS_ASK)이 있을 때만 ROUTE 를 따른다 — 해외 기관 화면의 'Show GPU status' · '대기열 요약'이 해외 요약 직행에 먹히지 않게."""
    q = question_only(msg)
    if not OPS_ASK.search(q):
        return None
    return ROUTE(msg, ctx)


def _route_front():
    """확장 불러오기는 파일 이름순으로 ROUTE 를 묻는다(global_ → … → ops). 운영 직행은 맨 앞에 한 번 더 둔다.
    (모듈이 실행될 때마다 옛 자리를 지우고 다시 넣는다 — 뒤에 붙는 기본 ROUTE 는 그대로 두어도 같은 답이다.)"""
    try:
        from . import ROUTES
    except Exception:  # noqa: BLE001
        return
    ROUTES[:] = [r for r in ROUTES if r[0] != "ops"]
    ROUTES.insert(0, ("ops", ROUTE_FIRST))


# ── 기관 이름 풀기 — 묻는 기관 하나만(느슨한 앞말 맞춤 금지) ─────────────────────────
_ALL_T = re.compile(r"기관별|기관마다|각\s*기관|모든\s*기관|전\s*기관|기관\s*전체|\beach\s+agenc|\ball\s+agenc|\bevery\s+agenc|\bby\s+agenc|\bper\s+agenc", re.I)
_TOKEN_ASK = re.compile(r"토큰|\btokens?\b", re.I)
_FILL_KO = re.compile(r"XI\s*ChatGEO|AI\s*도우미|요청\s*건수|사용량|토큰|LLM|이번\s*달|지난\s*달|얼마나|얼마|몇|썼(어|나|니|는지)?|쓴\s*양|사용|현황|요약|알려\s*(줘|주세요)?|보여\s*(줘|주세요)?|"
                      r"확인|기관|합계|전체|상태|\?|\.|,|!", re.I)
_FILL_EN = {"how", "much", "many", "does", "do", "did", "has", "have", "had", "is", "are", "was", "the", "a", "an", "of", "for", "this", "last", "month",
            "used", "use", "uses", "usage", "ai", "assistant", "tokens", "token", "llm", "show", "me", "what", "whats", "tell", "please", "total",
            "agency", "agencies", "s", "by", "per", "in", "so", "far", "consumed", "spent", "xi", "chatgeo", "requests", "request"}
_PARTICLE = re.compile(r"(은|는|이|가|의|을|를|에서|도|만|께서)$")


def tenant_phrase(q: str) -> str | None:
    """질문에서 기관을 가리키는 말만 남긴다(없으면 None = 전 기관)."""
    q = question_only(q)
    if _ALL_T.search(q):
        return None
    words = []
    for w in re.split(r"\s+", _FILL_KO.sub(" ", q)):
        w = re.sub(r"[^\w\-가-힣]", "", w)
        if len(w) > 2:
            w = _PARTICLE.sub("", w)
        if len(w) >= 2 and w.lower() not in _FILL_EN:
            words.append(w)
    return " ".join(words) or None


def _names(meta: dict, tid: str) -> set[str]:
    nm = (meta or {}).get("name") or {}
    out = {tid.lower(), _tname(meta, tid).lower(), _tname_en(meta, tid).lower()}
    if isinstance(nm, dict):
        for v in nm.values():
            if v:
                out.add(str(v).lower())
                out.add(re.sub(r"\s*\(.*\)$", "", str(v)).lower())
    short = _tname(meta, tid)
    core = re.sub(r"(특별시|광역시|시|군|구)$", "", short)
    if len(core) >= 2 and core != short:
        out.add(core.lower())                    # '남원시' → '남원'
    en = _tname_en(meta, tid)
    core_en = re.sub(r"-(si|gun|gu)$", "", en, flags=re.I)
    if len(core_en) >= 3 and core_en != en:
        out.add(core_en.lower())                 # 'Namwon-si' → 'namwon'
    return {x for x in out if len(x) >= 2}


def match_exact(want: str, metas: dict[str, dict]) -> list[str]:
    """기관 이름이 질문에 통째로 들어 있으면 가장 긴 이름의 기관만(없으면 [])."""
    q = re.sub(r"\s+", " ", str(want or "").lower()).strip()
    if not q:
        return []
    best, hit = 0, []
    for tid, meta in metas.items():
        ln = max((len(n) for n in _names(meta, tid) if n in q), default=0)
        if ln > best:
            best, hit = ln, [tid]
        elif ln and ln == best:
            hit.append(tid)
    return hit


def match_tenants(want: str, metas: dict[str, dict]) -> list[str]:
    """묻는 말 → 기관 id 목록. ① 기관 이름이 통째로 들어 있으면 가장 긴 이름의 기관만 ② 아니면 낱말이 가장 많이 들어맞는 기관.
    '키르기스 토지자원청' → 토지자원청 하나(농업부 섞임 0). '키르기스' 만이면 두 기관(합계 없이)."""
    q = re.sub(r"\s+", " ", str(want or "").lower()).strip()
    if not q:
        return []
    hit = match_exact(q, metas)
    if hit:
        return hit
    words = [w for w in q.split(" ") if len(w) >= 2]
    score = {tid: sum(1 for w in words if any(w in n for n in _names(meta, tid))) for tid, meta in metas.items()}
    top = max(score.values(), default=0)
    return [tid for tid, s in score.items() if s and s == top]


def _eun(w: str | None) -> str:
    """'목포시' → '목포시는' · '산청군' → '산청군은'(받침으로 조사)."""
    w = str(w or "")
    if not w:
        return w
    c = ord(w[-1]) - 0xAC00
    return w + ("은" if 0 <= c <= 11171 and c % 28 else "는")


# ── 시군구 이름 → 소속 기관(r3-ops) — '목포시 사용량'은 목포시를 관할하는 기관 값으로 답한다(LLM 0) ─────────
def _regions_find(q: str) -> list[dict]:
    try:
        from landxi_api.regions import find
        return find(q)
    except Exception:  # noqa: BLE001
        return []


def _tenant_prefixes() -> dict[str, list[str]]:
    """기관 id → 관할 시군구 코드 접두(국내 기관만 · LX·영업·해외 제외) — regions 설정(관할 가드와 같은 표)."""
    try:
        from landxi_api.regions import _cfg
        ts = (_cfg().get("tenants") or {})
    except Exception:  # noqa: BLE001
        return {}
    return {tid: [str(x) for x in (t or {}).get("sgg") or []] for tid, t in ts.items()
            if tid not in ("lx", "lx-demo") and not (t or {}).get("global") and (t or {}).get("sgg")}


def sgg_owner(phrase: str, metas: dict[str, dict], find=_regions_find, prefixes: dict | None = None) -> dict | None:
    """질문 낱말 → 시군구 한 곳 + 그곳을 관할하는 기관 id(가장 긴 접두 · 없으면 None).
    → {'region': 행, 'tenant': id | None} · 시군구를 하나로 못 정하면 None(여러 곳 '중구' 등)."""
    prefixes = _tenant_prefixes() if prefixes is None else prefixes
    cands = [str(phrase or "").strip()] + [w for w in re.split(r"\s+", str(phrase or "")) if len(w) >= 2]
    for q in cands:
        if not q:
            continue
        rs = find(q)
        uniq = {r["sgg_cd"]: r for r in rs}
        if len(uniq) != 1:
            continue
        r = next(iter(uniq.values()))
        codes = [c for c in (r.get("sgg_cd"), r.get("prev_cd")) if c]
        best, owner = 0, None
        for tid, pxs in prefixes.items():
            if tid not in metas:
                continue
            for px in pxs:
                if any(c.startswith(px) for c in codes) and len(px) > best:
                    best, owner = len(px), tid
        return {"region": r, "tenant": owner}
    return None


# ── 공통 ─────────────────────────────────────────────────────────────────
async def _get(ctx, path: str, params: dict | None = None) -> dict:
    if not is_admin(ctx.principal):
        raise ToolError("tool_forbidden", ADMIN_LINE, 403)
    res = await ctx.http.get(path, params=params or None)
    if res.status_code in (401, 403):
        raise ToolError("tool_forbidden", ADMIN_LINE, 403)
    if res.status_code != 200:
        raise ToolError("upstream_error", "운영 정보를 지금 읽을 수 없습니다", 502)
    return res.json()


def _v(e):
    return e.get("value") if isinstance(e, dict) else e


def _e(value, unit: str, source: str, as_of: str | None, basis: str = "measured", note: str | None = None) -> dict:
    out = {"value": value, "unit": unit, "basis": basis, "as_of": as_of or dt.datetime.now(KST).isoformat(timespec="seconds"), "source": source}
    if note:
        out["note"] = note
    return out


def _en(ctx) -> bool:
    return getattr(ctx, "lang", "ko") == "en"


def _first_sugg(data: dict) -> str:
    s = [x for x in data.get("제안") or [] if x != "지금 조치할 것은 없습니다."]
    return (" " + s[0]) if s else ""


def gpu_name(i) -> str:
    return f"GPU {i}"


def _hm(iso: str | None) -> str | None:
    if not iso:
        return None
    try:
        d = dt.datetime.fromisoformat(iso).astimezone(KST)
        return d.strftime("%m.%d %H:%M")
    except Exception:
        return None


def _tname(t: dict | None, tid: str) -> str:
    """화면(ops-infra tenantName)과 같은 규칙: LX · 시도 머리말 · 괄호 설명을 뺀 이름."""
    if tid == "lx":
        return "LX"
    nm = (t or {}).get("name") or {}
    s = nm.get("ko") or nm.get("en") if isinstance(nm, dict) else str(nm or "")
    s = re.sub(r"^.*?(특별자치도|특별자치시|광역시)\s+", "", s or "")
    return re.sub(r"\s*\(.*\)$", "", s) or tid


def _tname_en(t: dict | None, tid: str) -> str:
    """영어 답의 기관 이름 — 괄호 설명을 뺀 영어 이름(없으면 id)."""
    if tid == "lx":
        return "LX"
    nm = (t or {}).get("name") or {}
    s = (nm.get("en") if isinstance(nm, dict) else None) or ""
    return re.sub(r"\s*\(.*\)$", "", s).strip() or tid


_U_EN = {"장": "GPUs", "대": "workers", "개": "models", "시간": "hours", "건": "requests"}



def _u(ctx, unit: str, en: str | None = None) -> str:
    """칩 단위 — 영어 답이면 영어 단위(값은 그대로 · 한 출처)."""
    return (en or _U_EN.get(unit, unit)) if _en(ctx) else unit


def _global_viewer(ctx) -> bool:
    """해외 기관 화면(영어 화면)에서 묻는 중인가 — 해외 기관 계정 또는 해외 화면 문맥."""
    p = getattr(ctx, "principal", None)
    c = getattr(ctx, "context", None) or {}
    if c.get("country"):
        return True
    if getattr(p, "realm", None) != "tenant":
        return False
    try:
        from landxi_api.regions import _cfg
        return bool(((_cfg().get("tenants") or {}).get(getattr(p, "tenant_id", None) or "") or {}).get("global"))
    except Exception:  # noqa: BLE001
        return False


# ── ops_gpus ─────────────────────────────────────────────────────────────
async def ops_gpus(args: dict, ctx) -> Out:
    g = await _get(ctx, "/ops/gpus")
    at = g.get("at")
    out = Out(source="GPU 장비 기록(인프라 화면과 같은 값)")
    rows = {}
    sugg = []
    for x in sorted([x for x in g.get("gpus") or [] if isinstance(x, dict)], key=lambda x: x.get("index", 0)):
        i = x.get("index")
        nm = gpu_name(i)
        load = _v(x.get("util_ma5")) if _v(x.get("util_ma5")) is not None else _v(x.get("util_pct"))
        mu, mt = _v(x.get("mem_used_mib")), _v(x.get("mem_total_mib"))
        w, wl, t = _v(x.get("power_w")), _v(x.get("power_limit_w")), _v(x.get("temp_c"))
        row = {"부하": out.env(f"g{i}_load", f"{nm} 부하(이동평균)", _e(round(load or 0, 0), "%", "GPU 장비 기록 · 부하", at))}
        if mu is not None:
            row["메모리 사용"] = out.env(f"g{i}_mem", f"{nm} 메모리 사용", _e(round(mu / 1024, 1), "GB", "GPU 장비 기록 · 메모리", at))
        if mt:
            row["메모리 전체"] = out.env(f"g{i}_memt", f"{nm} 메모리 전체", _e(round(mt / 1024, 0), "GB", "GPU 장비 기록 · 메모리", at))
        if w is not None:
            row["전력"] = out.env(f"g{i}_w", f"{nm} 전력", _e(round(w, 0), "W", "GPU 장비 기록 · 전력", at))
        if wl:
            row["전력 상한"] = out.env(f"g{i}_wl", f"{nm} 전력 상한", _e(round(wl, 0), "W", "GPU 장비 기록 · 전력 상한(관리자 설정)", at))
        if t is not None:
            row["온도"] = out.env(f"g{i}_t", f"{nm} 온도", _e(round(t, 0), "°C", "GPU 장비 기록 · 온도", at))
        llm = any(re.search(r"llama|vllm|ollama|python", str(e.get("name") or ""), re.I) for e in x.get("external") or [] if isinstance(e, dict))
        # 인프라 표 '작업' 칸(gpuWork)과 같은 규칙: 작업 → 분석 · 언어 모델이 쓰는 중(작업기 없음 또는 부하 10% 이상) → 언어 모델 · 그 밖 대기
        row["하는 일"] = "분석 작업" if x.get("job_id") else ("언어 모델" if llm and (not x.get("worker") or (load or 0) >= 10) else "대기")
        if x.get("fault"):
            row["상태"] = "장애"
            sugg.append(f"{nm} 에 장애 표시가 있습니다. 인프라 화면에서 이 GPU 의 작업을 확인하세요.")
        elif x.get("caution"):
            row["상태"] = "주의"
        if t is not None and t >= 85:
            sugg.append(f"{nm} 온도가 높습니다. 이 GPU 로 가는 분석 작업의 우선순위를 낮추는 것을 검토하세요.")
        rows[nm] = row
    pb = g.get("power_budget") or {}
    data = {"GPU": rows}
    busy: list[str] = []
    if pb.get("max_hot") is not None:
        # 판정은 게이트웨이 judge_power 한 곳(인프라 화면 큰 숫자 '동시 고부하 GPU n / m' 과 같은 봉투) — 여기서 다시 세지 않는다
        hot_idx = [int(i) for i in (pb.get("hot") or []) if str(i).lstrip("-").isdigit()]
        why = {p.get("gpu"): p.get("why") for p in pb.get("per") or [] if isinstance(p, dict)}
        judged = {p.get("gpu"): p for p in pb.get("per") or [] if isinstance(p, dict)}
        jat = pb.get("at") or at
        for i in hot_idx:
            nm = gpu_name(i)
            busy.append(nm)
            if nm in rows:
                rows[nm]["고부하"] = "예"
                if why.get(i) == "lease":
                    rows[nm]["하는 일"] = "분석 작업"          # 분석 작업 임대를 쥔 GPU — 화면 작업 칸 'AI 분석'과 같게(작업기 프로세스를 언어 모델로 읽지 않는다)
                    rows[nm]["고부하 까닭"] = "분석 작업"
                if why.get(i) == "power":
                    # 판정에 쓴 전력(최근 평균) — 지금 전력이 기준 아래여도 왜 고부하인지 같은 숫자로 말한다(실증 2차 must_fix 1)
                    jw = _v(judged[i].get("power_w")) if i in judged else None
                    if jw is not None:
                        rows[nm]["판정 전력"] = out.env(f"g{i}_avg", f"{nm} 최근 평균 전력(판정)",
                                                     _e(round(jw, 0), "W", "GPU 장비 기록 · 최근 평균 전력(판정)", jat))
                    if rows[nm]["하는 일"] == "대기":
                        rows[nm]["하는 일"] = "사용 중"        # 'idle' 과 'high load' 를 한 문장에 쓰지 않는다
        for i, w in why.items():                         # 분석 작업기가 전력 규칙으로 멈춘 GPU(judge_power why='yield') — 고부하로 세지 않는다
            nm = gpu_name(i)
            if w == "yield" and nm in rows:
                rows[nm]["하는 일"] = "분석 멈춤"
            elif w == "held" and nm in rows:            # 분석 작업이 쥐고 있지만 실측(전력)은 기준 아래 — 고부하 아님(impl-1 · 화면 작업 칸 'AI 분석')
                rows[nm]["하는 일"] = "분석 작업"
        for nm, row in rows.items():
            row.setdefault("고부하", "아니오")
        data["동시 고부하 GPU"] = out.env("hot", "동시 고부하 GPU", _e(int(pb.get("hot_now") or 0), _u(ctx, "장"), "전력 예산(인프라 화면 큰 숫자)", pb.get("at") or at))
        data["동시 고부하 최대"] = out.env("hot_max", "동시 고부하 GPU 최대", _e(int(pb["max_hot"]), _u(ctx, "장"), "전력 규칙", pb.get("at") or at, basis="recorded"))
        data["고부하 GPU"] = busy
        data["전력 예산"] = "안" if pb.get("ok", True) else "초과"
        data["판정 시각"] = hms(jat)                   # 인프라 화면 큰 숫자 아래 'hh:mm:ss 기준' 과 같은 표본 시각
        ov = _v((pb.get("overlap") or {}).get("n"))
        if isinstance(ov, (int, float)):                 # 전력 실측으로 본 '두 장 동시 고부하' 표본 수(최근 2시간 · 인프라 화면 같은 값)
            data["두 장 동시 고부하(최근 2시간)"] = out.env("overlap", "두 장 동시 고부하(최근 2시간)",
                                                    _e(int(ov), _u(ctx, "회", "times"), "GPU 전력 실측(2초 표본)", pb.get("at") or at))
        if pb.get("ok") is False:
            sugg.append("동시 고부하 GPU 가 전력 규칙(최대 장수)을 넘었습니다. 새 분석 작업은 대기열에서 기다리게 두는 것을 검토하세요.")
    data["제안"] = sugg or ["지금 조치할 것은 없습니다."]
    out.data = data
    out.answer = _gpu_answer_en(rows, data) if _en(ctx) else _gpu_answer_ko(rows, data)
    return out


def hms(iso: str | None) -> str | None:
    """판정 시각 hh:mm:ss(KST) — 인프라 화면 'hh:mm:ss 기준' 과 같은 표기."""
    if not iso:
        return None
    try:
        return dt.datetime.fromisoformat(iso).astimezone(KST).strftime("%H:%M:%S")
    except Exception:  # noqa: BLE001
        return None


def _why_ko(k: str, row: dict) -> str:
    if row.get("고부하") != "예":
        return ""
    if "판정 전력" in row:
        return f", 최근 평균 전력 {{{{g{k}_avg}}}}로 고부하"
    return ", 작업이 이 GPU를 쓰고 있어 고부하" if row.get("고부하 까닭") == "분석 작업" else ", 고부하"


def _gpu_answer_ko(rows: dict, data: dict) -> str:
    parts = []
    if "동시 고부하 GPU" in data:
        who = (", ".join(data["고부하 GPU"]) + "이 고부하") if data["고부하 GPU"] else "고부하인 GPU 없음"
        head = f"{data['판정 시각']} 기준 " if data.get("판정 시각") else ""
        parts.append(f"{head}동시 고부하 GPU는 {{{{hot}}}}(최대 {{{{hot_max}}}})로 {who} · 전력 예산 {data['전력 예산']}입니다.")
        if "두 장 동시 고부하(최근 2시간)" in data:
            parts.append("최근 2시간 두 장이 함께 고부하였던 적은 {{overlap}}입니다.")
    for nm, row in rows.items():
        k = nm.split(" ")[1]
        bits = ([f"부하 {{{{g{k}_load}}}}"] + ([f"지금 전력 {{{{g{k}_w}}}}"] if "전력" in row else []) + ([f"메모리 {{{{g{k}_mem}}}}"] if "메모리 사용" in row else [])
                + ([f"온도 {{{{g{k}_t}}}}"] if "온도" in row else []))
        doing = {"분석 작업": "분석 작업 중", "언어 모델": "언어 모델 사용 중", "사용 중": "사용 중",
                 "분석 멈춤": "분석 작업이 전력 규칙으로 잠시 멈춘 상태"}.get(row["하는 일"], "대기 중")
        parts.append(f"{nm}은 {', '.join(bits)}로 {doing}{_why_ko(k, row)}입니다.")
    return " ".join(parts) + _first_sugg(data)


def _gpu_answer_en(rows: dict, data: dict) -> str:
    """영어 답 — 한국어와 같은 봉투·같은 판정(고부하 수 · 어느 GPU · 전력 예산). 'How many GPUs are under high load' ·
    'Is the power budget exceeded?' · 'Which GPU is busy?' 세 질문에 한 문장이 모두 답한다(첫 문장 = 화면 큰 숫자 · 같은 판정 시각)."""
    parts = []
    if "동시 고부하 GPU" in data:
        who = ", ".join(data["고부하 GPU"]) or "none"
        head = f"As of {data['판정 시각']}: " if data.get("판정 시각") else ""
        parts.append(f"{head}GPUs under high load: {{{{hot}}}} (limit {{{{hot_max}}}}) — {who}. "
                     f"Power budget: {'within the limit' if data['전력 예산'] == '안' else 'exceeded'}.")
        if "두 장 동시 고부하(최근 2시간)" in data:
            parts.append("Both GPUs under high load at once in the last 2 hours: {{overlap}}.")
    doing_en = {"분석 작업": "running an analysis job", "언어 모델": "serving the language model", "사용 중": "in use",
                "분석 멈춤": "analysis job paused by the power rule"}
    for nm, row in rows.items():
        k = nm.split(" ")[1]
        hot = ""
        if row.get("고부하") == "예":
            hot = (f", high load (recent average {{{{g{k}_avg}}}})" if "판정 전력" in row
                   else ", high load (a job holds this GPU)" if row.get("고부하 까닭") == "분석 작업" else ", high load")
        parts.append(f"{nm}: load {{{{g{k}_load}}}}" + (f", power now {{{{g{k}_w}}}}" if "전력" in row else "")
                     + f", {doing_en.get(row['하는 일'], 'idle')}" + hot + ".")
    return " ".join(parts)


# ── ops_queues ───────────────────────────────────────────────────────────
async def ops_queues(args: dict, ctx) -> Out:
    q = await _get(ctx, "/ops/queues")
    at = q.get("as_of")
    out = Out(source="작업 대기열(인프라 화면과 같은 값)")
    pools = q.get("pools") or {}
    qn = sum(int(p.get("queued") or 0) for p in pools.values())
    rn = sum(int(p.get("running") or 0) for p in pools.values())
    data = {"대기": out.env("queued", "대기 중인 분석 작업", _e(qn, _u(ctx, "count", "jobs"), "작업 대기열 · 대기", at)),
            "진행": out.env("running", "진행 중인 분석 작업", _e(rn, _u(ctx, "count", "jobs"), "작업 대기열 · 진행", at))}
    by = {}
    for k, p in pools.items():
        nm = POOL_KO.get(k, "증설 서버")
        by[nm] = {"대기": out.env(f"{k}_q", f"{nm} 대기", _e(int(p.get("queued") or 0), _u(ctx, "count", "jobs"), f"작업 대기열 · {nm}", at)),
                  "진행": out.env(f"{k}_r", f"{nm} 진행", _e(int(p.get("running") or 0), _u(ctx, "count", "jobs"), f"작업 대기열 · {nm}", at)),
                  "작업기": out.env(f"{k}_w", f"{nm} 작업기", _e(int(p.get("workers") or 0), _u(ctx, "대"), f"작업기 기록 · {nm}", at))}
    data["서버별"] = by
    sugg = []
    for k, p in pools.items():
        nm = POOL_KO.get(k, "증설 서버")
        if int(p.get("queued") or 0) > 0 and int(p.get("workers") or 0) == 0:
            sugg.append(f"{nm} 에 대기 작업이 있는데 작업기가 없습니다. 인프라 화면에서 작업기 상태를 확인하세요.")
        elif int(p.get("queued") or 0) > 0 and int(p.get("running") or 0) == 0:
            sugg.append(f"{nm} 에 대기 작업이 있는데 진행 중인 작업이 없습니다. 전력 예산(동시 고부하 GPU)을 확인하세요.")
    data["제안"] = sugg or ["지금 조치할 것은 없습니다."]
    out.data = data
    ws = ", ".join(f"{POOL_KO.get(k, '증설 서버')} {{{{{k}_w}}}}" for k in pools)
    out.answer = f"대기 중인 분석 작업은 {{{{queued}}}}, 진행 중인 작업은 {{{{running}}}}입니다. 작업기는 {ws}입니다." + _first_sugg(data)
    if _en(ctx):
        out.answer = "Analysis queue — waiting: {{queued}}, running: {{running}}."
    return out


# ── ops_alerts ───────────────────────────────────────────────────────────
def _alert_ko(rule: str) -> str:
    for k, v in ALERT_KO.items():
        if str(rule or "").startswith(k):
            return v
    return "운영 경보"


async def ops_alerts(args: dict, ctx) -> Out:
    a = await _get(ctx, "/ops/alerts")
    now = dt.datetime.now(KST)
    out = Out(source="경보 기록(LX 관리자 대시보드와 같은 값)")
    items = [x for x in a.get("items") or [] if isinstance(x, dict)]
    # 화면 '경보 N'(ops-core openAlerts)과 같은 규칙: 닫히지 않은 것 · 언어 모델 상주로 차는 GPU 메모리 경보 제외
    open_ = [x for x in items if not x.get("closed_at") and not str(x.get("rule") or "").startswith("vram_")]

    def recent(x):
        try:
            return dt.datetime.fromisoformat(x["closed_at"]) >= now - dt.timedelta(hours=24)
        except Exception:
            return False
    closed24 = [x for x in items if x.get("closed_at") and recent(x)]
    at = a.get("last_check") or now.isoformat(timespec="seconds")
    data = {"열린 경보": out.env("open", "지금 열린 경보", _e(len(open_), _u(ctx, "count", "alerts"), "경보 기록 · 열린 것", at)),
            "최근 24시간 닫힌 경보": out.env("closed24", "최근 24시간에 닫힌 경보", _e(len(closed24), _u(ctx, "count", "alerts"), "경보 기록 · 24시간", at))}
    data["목록"] = [{"경보": _alert_ko(x.get("rule")), "장비": gpu_name(x["gpu"]) if x.get("gpu") is not None else None,
                   "수준": "장애" if x.get("level") == "fault" else "주의", "시작": _hm(x.get("opened_at"))} for x in open_[:6]]
    sugg = []
    for x in open_:
        ko = _alert_ko(x.get("rule"))
        if ko == "작업기 응답 없음":
            sugg.append("작업기 응답이 없습니다. 인프라 화면에서 그 작업기의 마지막 응답 시각을 확인하세요.")
        elif ko == "저장 공간 부족":
            sugg.append("저장 공간이 부족합니다. 기관 화면에서 저장 사용량이 큰 기관을 확인하세요.")
        elif ko == "GPU 온도 높음":
            sugg.append("GPU 온도가 높습니다. 그 GPU 로 가는 분석 작업의 우선순위를 낮추는 것을 검토하세요.")
        elif ko == "작업 실패 많음":
            sugg.append("최근 작업 실패가 많습니다. 배포 화면에서 실패한 작업의 서비스를 확인하세요.")
    data["제안"] = sorted(set(sugg)) or ["지금 조치할 것은 없습니다."]
    out.data = data
    names = ", ".join(sorted({f"{x['경보']}" + (f"({x['장비']})" if x.get("장비") else "") for x in data["목록"]}))
    out.answer = ("지금 열린 경보는 {{open}}" + (f"({names})" if names else "") + "이고, 최근 24시간에 닫힌 경보는 {{closed24}}입니다."
                  + (_first_sugg(data) or " 지금 조치할 것은 없습니다."))
    if _en(ctx):
        out.answer = "Open alerts: {{open}}. Closed in the last 24 hours: {{closed24}}." + ("" if open_ else " Nothing needs action now.")
    return out


# ── ops_usage ────────────────────────────────────────────────────────────
USAGE_EN = {"llm_requests_month": "XI ChatGEO requests", "llm_tokens_month": "XI ChatGEO tokens", "gpu_s_month": "GPU time", "area_km2_month": "analysis area",
            "storage_gb": "storage"}
INT_DIMS = {"llm_requests_month", "llm_tokens_month"}       # 건수 · 토큰은 정수


async def ops_usage(args: dict, ctx) -> Out:
    dim = args.get("dim") or "llm_requests_month"
    if dim not in USAGE_DIMS:
        raise ToolError("bad_request", "없는 항목입니다")
    u = await _get(ctx, "/ops/tenants")
    t = await _get(ctx, "/tenants")
    tmeta = {x["id"]: x for x in t.get("items") or []}
    ko, unit, k = USAGE_DIMS[dim]
    unit = _u(ctx, unit)
    en = _en(ctx)
    label = USAGE_EN[dim] if en else ko
    items = [it for it in u.get("items") or [] if it.get("tenant_id") == "lx" or (tmeta.get(it.get("tenant_id")) or {}).get("kind") == "user"]
    # 영업 계량(lx-demo) 등 제외 — 기관 화면과 같은 기관 목록 + LX
    want = str(args.get("tenant") or "").strip()
    picked = None
    via = None          # 시군구 이름으로 물었을 때 {'region', 'tenant'}
    out = Out(source=f"기관 사용량(기관 화면과 같은 값) · {ko}")
    if want:
        phrase = tenant_phrase(want) or want
        metas = {it["tenant_id"]: tmeta.get(it["tenant_id"]) or {} for it in items}
        hit = match_exact(phrase, metas)
        if not hit:
            via = sgg_owner(phrase, metas)
            if via and via["tenant"]:
                hit = [via["tenant"]]
            elif via:
                # 시군구는 찾았지만 그곳을 맡은 기관 계정이 없다 — 숫자 없이 한 줄(LLM 0)
                r = via["region"]
                out.data = {"시군구": r.get("name"), "안내": "이 시군구 기관 계정 없음"}
                out.answer = (f"{r.get('name_en') or r.get('name')} has no agency account." if en
                              else f"{_eun(r.get('name'))} 기관 계정이 없습니다.")
                return out
            else:
                hit = match_tenants(phrase, metas)
        picked = set(hit)
        if not picked:
            out.data = {"안내": "그 이름의 기관이 없습니다"}
            out.answer = "No agency has that name." if en else "그 이름의 기관이 없습니다."
            return out
    rows, total, n = {}, 0.0, 0
    rows_ids: set = set()
    for it in items:
        tid = it.get("tenant_id")
        if picked is not None and tid not in picked:
            continue
        meta = tmeta.get(tid) or {}
        nm = _tname_en(meta, tid) if en else _tname(meta, tid)
        d = (it.get("dims") or {}).get(dim) or {}
        used = _v(d.get("used"))
        e = d.get("used") or {}
        val = None if used is None else (int(round(used * k)) if dim in INT_DIMS else round(used * k, 1))
        key = re.sub(r"\W", "_", tid)
        row = {ko: out.env(f"{key}_u", f"{nm} 이번 달 {ko}", _e(val, unit, f"기관 사용량 · {ko}", e.get("as_of"), note=e.get("note")))}
        # 사용을 막는 값은 없다(원칙 83 · 11차 — 기관 · LX 직원 모두) — 사용량만 답한다(예전 '한도' 칸은 없앰)
        rows[nm] = row
        rows_ids.add(tid)
        if val is not None:
            total += val
            n += 1
    data = {"항목": label, "달": (u.get("items") or [{}])[0].get("month"), "기관": rows}
    # 합계는 '기관별(전 기관)' 질문에만 — 기관을 말했으면 그 기관 값만(합계가 그 기관 값처럼 읽히지 않게)
    if len(rows) > 1 and picked is None:
        data["합계"] = out.env("sum", f"이번 달 {ko} 합계", _e(int(total) if dim in INT_DIMS else round(total, 1), unit, f"기관 사용량 · {ko} 합계",
                                                          u.get("as_of")))
    out.data = data
    # 답 — 사용량 많은 순 · 사용량만(짧게). 막대 차트 한 장(값 = 같은 봉투)
    order = sorted(rows.items(), key=lambda kv: -(_v(next(e for kk, _, e in out.envelopes if kk == kv[1][ko])) or 0))
    lines = [f"{nm} {{{{{row[ko]}}}}}" for nm, row in order]
    if en:
        out.answer = f"{label[0].upper() + label[1:]} this month: " + ", ".join(lines) + "." + (" Total: {{sum}}." if "합계" in data else "")
    else:
        out.answer = f"이번 달 {_eun(ko)} " + ", ".join(lines) + "입니다." + (" 합계는 {{sum}}입니다." if "합계" in data else "")
    if via and via.get("tenant") in rows_ids:
        r = via["region"]
        tn = _tname_en(tmeta.get(via["tenant"]), via["tenant"]) if en else _tname(tmeta.get(via["tenant"]), via["tenant"])
        data["포함"] = f"{r.get('name')} → {tn}"
        out.answer += (f" {r.get('name_en') or r.get('name')} is included in {tn}'s agency usage." if en
                       else f" {_eun(r.get('name'))} {tn} 기관 사용량에 포함됩니다.")
    if len(rows) > 1:
        out.blocks.append({"type": "chart", "kind": "bar", "title": (f"{label[0].upper() + label[1:]} this month" if en else f"이번 달 {ko}"),
                           "rows": [{"label": nm, "env": row[ko]} for nm, row in order]})
    return out


# ── ops_models ───────────────────────────────────────────────────────────
async def ops_models(args: dict, ctx) -> Out:
    m = await _get(ctx, "/ops/llm/models")
    out = Out(source="언어 모델 상태(인프라 화면과 같은 값)")
    at = m.get("as_of")
    rows = []
    for x in m.get("items") or []:
        rows.append({"역할": x.get("role"), "이름": x.get("name"), "상태": "켜짐" if x.get("on") else "꺼짐", "GPU": x.get("gpu")})
    pr = m.get("promo") or {}
    on_n = _v(m.get("on_n"))
    data = {"켜진 언어 모델": out.env("on", "켜진 언어 모델", _e(on_n, _u(ctx, "개"), "언어 모델 헬스", at)),
            "모델": rows, "국산 모델 연결": pr.get("state") or "연결 전"}
    off = [r for r in rows if r["상태"] == "꺼짐" and r["역할"] in ("두뇌", "라우터")]
    data["제안"] = [f"{r['역할']}({r['이름']})가 꺼져 있습니다. 인프라 화면의 '켜기' 버튼으로 켤 수 있습니다." for r in off] or ["지금 조치할 것은 없습니다."]
    out.data = data
    ls = ", ".join(f"{r['역할']} {r['이름']} {r['상태']}" + (f"({r['GPU']})" if r.get("GPU") else "") for r in rows)
    out.answer = f"켜진 언어 모델은 {{{{on}}}}입니다. {ls}. 국산 모델 연결은 {data['국산 모델 연결']}입니다." + _first_sugg(data)
    if _en(ctx):
        out.answer = "Language models on: {{on}}. Domestic model link: " + ("not connected" if data["국산 모델 연결"] == "연결 전" else "connected") + "."
    return out


async def ops_admin_only(args: dict, ctx) -> Out:
    out = Out(source="안내")
    out.data = {"안내": ADMIN_LINE}
    # 해외 기관 화면은 영어 화면 — 한국어로 물어도 영어 한 줄(한국어 문장은 그 화면에서 오류 문구로 바뀐다)
    out.answer = "You can check this on the LX admin dashboard." if (_en(ctx) or _global_viewer(ctx)) else ADMIN_LINE
    return out


HANDLERS = {"ops_admin_only": ops_admin_only, "ops_gpus": ops_gpus, "ops_queues": ops_queues, "ops_alerts": ops_alerts, "ops_usage": ops_usage, "ops_models": ops_models}
WRITE: set = set()
CONFIRM: set = set()
CLIENT: set = set()
_route_front()
