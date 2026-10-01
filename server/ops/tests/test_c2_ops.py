"""c2-ops 테스트 — 운영 읽기 도구(ext/ops.py) · 언어 모델 켜기 결정(ops/llm_start.py · 모의 상태) · 사용량 항목(quota.py).

GPU 0 · 실제 vLLM 조작 0: 켜기는 decide() 순수 함수만 부르고 spawn() 은 부르지 않는다.
"""
import asyncio
import json
import sys
from pathlib import Path

import pytest

SERVER = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(SERVER))

from agent.tools import ToolError  # noqa: E402
from agent.tools.ext import ops as T  # noqa: E402
from landxi_api.deps import CAPS, Principal  # noqa: E402
from ops import llm_start as L  # noqa: E402

ADMIN = Principal("lx", "admin", None, "u_mail_lxadmin", caps=CAPS[("lx", "admin")])
STAFF = Principal("lx", "staff", None, "u_mail_test", caps=CAPS[("lx", "staff")])
NAMWON = Principal("tenant", "manager", "namwon", "u_nw", caps=CAPS[("tenant", "manager")])
GJ = Principal("tenant", "manager", "gwangju-jeonnam", "u_gj", caps=CAPS[("tenant", "manager")])
AT = "2026-09-30T00:10:00+09:00"


def E(v, u):
    return {"value": v, "unit": u, "basis": "measured", "as_of": AT, "source": "x"}


FIX = {
    "/ops/gpus": {"node": "node-x", "at": AT, "gpus": [
        {"index": 0, "name": "NVIDIA RTX A6000", "util_ma5": E(12.4, "%"), "util_pct": E(3, "%"), "mem_used_mib": E(20231, "MiB"),
         "mem_total_mib": E(49140, "MiB"), "temp_c": E(53, "°C"), "power_w": E(18.1, "W"), "power_limit_w": E(200, "W"),
         "external": [{"pid": 1, "name": "llama-server.exe"}], "job_id": None, "caution": False, "fault": False},
        {"index": 1, "name": "NVIDIA RTX A6000", "util_ma5": E(0.0, "%"), "mem_used_mib": E(30000, "MiB"), "mem_total_mib": E(49140, "MiB"),
         "temp_c": E(88, "°C"), "power_w": E(60.2, "W"), "power_limit_w": E(200, "W"), "external": [], "job_id": "job_1", "caution": True, "fault": False}],
        "power_budget": {"max_hot": 1, "hot_now": 0, "ok": True, "hot": [], "at": AT}},
    "/ops/queues": {"pools": {"a6000": {"queued": 2, "running": 1, "workers": 1}, "cpu": {"queued": 0, "running": 0, "workers": 2}},
                    "lanes": [], "as_of": AT},
    "/ops/alerts": {"items": [
        {"id": "a1", "rule": "worker_heartbeat_missing_30s", "level": "fault", "gpu": None, "opened_at": AT, "closed_at": None},
        {"id": "a2", "rule": "vram_gt_95_5m", "level": "caution", "gpu": 1, "opened_at": AT, "closed_at": None},
        {"id": "a3", "rule": "gpu_temp_gt_85_5m", "level": "caution", "gpu": 0, "opened_at": "2026-09-20T00:00:00+09:00",
         "closed_at": "2026-09-20T00:10:00+09:00"}], "total": 3, "last_check": AT},
    "/ops/tenants": {"items": [
        {"tenant_id": t, "month": "2026-09", "dims": {
            "llm_tokens_month": {"used": E(v, "tokens"), "soft": s, "hard": h, "policy": "queue_low"},
            "llm_requests_month": {"used": E(v // 1000, "count"), "soft": None, "hard": None},
            "gpu_s_month": {"used": E(7200.0, "gpu_s"), "soft": None, "hard": None}}}
        for t, v, s, h in [("gwangju-jeonnam", 97225, 1.2e6, 1.8e6), ("kgz-agri", 41194, None, None), ("kgz-land", 2724, None, None), ("lx", 1599304, None, None),
                           ("lx-demo", 10, 3e5, 4e5), ("namwon", 856313, 2e6, 3e6)]], "as_of": AT},
    "/tenants": {"items": [
        {"id": "gwangju-jeonnam", "kind": "user", "name": {"ko": "광주전남특별시", "en": "Gwangju-Jeonnam"}},
        {"id": "kgz-agri", "kind": "user", "name": {"ko": "키르기스 농업부(이식아타)", "en": "Kyrgyz Ministry of Agriculture (Ysyk-Ata)"}},
        {"id": "kgz-land", "kind": "user", "name": {"ko": "키르기스 토지자원청(소쿨룩·비슈케크)", "en": "Kyrgyz State Agency on Land Resources (Sokuluk · Bishkek)"}},
        {"id": "lx", "kind": "maker", "name": {"ko": "LX 한국국토정보공사", "en": "LX Korea Land and Geospatial InformatiX Corporation"}},
        {"id": "lx-demo", "kind": "maker", "name": {"ko": "LX 영업 계량"}},
        {"id": "namwon", "kind": "user", "name": {"ko": "전북특별자치도 남원시", "en": "Namwon-si"}}]},
    "/ops/llm/models": {"items": [
        {"slot": "brain", "role": "두뇌", "name": "Gemma 4", "on": True, "gpu": "GPU 1", "can_start": False},
        {"slot": "router", "role": "라우터", "name": "HyperCLOVA X SEED", "on": False, "gpu": "GPU 1", "can_start": True},
        {"slot": "fallback", "role": "예비", "name": "예비 모델", "on": True, "gpu": "GPU 0·1", "can_start": False}],
        "promo": {"state": "연결 전", "connected": False}, "on_n": E(2, "count"), "as_of": AT},
}


class Res:
    def __init__(self, code, body):
        self.status_code, self._b = code, body

    def json(self):
        return self._b


class Http:
    def __init__(self, admin=True):
        self.admin, self.calls = admin, []

    async def get(self, path, params=None):
        self.calls.append(path)
        if not self.admin:
            return Res(403, {"error": {"code": "forbidden"}})
        return Res(200, FIX[path])


class Ctx:
    def __init__(self, p, admin=True, lang="ko", context=None):
        self.principal, self.http, self.context, self.lang = p, Http(admin), context or {}, lang


def run(coro):
    return asyncio.get_event_loop_policy().new_event_loop().run_until_complete(coro)


def envs(out):
    return {k: e for k, _, e in out.envelopes}


# ── 권한 · 직행 ──────────────────────────────────────────────────────────
def test_allowed_admin_only():
    for n in T.SPECS:
        if n == "ops_admin_only":
            assert not T.allowed(n, ADMIN) and not T.allowed(n, Principal())
            assert T.allowed(n, NAMWON) and T.allowed(n, GJ) and T.allowed(n, STAFF)
            continue
        assert T.allowed(n, ADMIN)
        for p in (STAFF, NAMWON, GJ, Principal()):
            assert not T.allowed(n, p)


@pytest.mark.parametrize("q", ["GPU 상태 알려 줘", "대기열 요약", "경보 있어?", "기관별 AI 도우미 사용량", "우리 토큰 얼마나 썼어"])
def test_non_admin_ops_question_one_line(q):
    for p in (NAMWON, GJ, STAFF):
        r = T.ROUTE(q, Ctx(p))
        assert r == {"tool": "ops_admin_only", "args": {}}
        out = run(T.ops_admin_only({}, Ctx(p)))
        assert out.answer == "LX 관리자 화면에서 확인할 수 있습니다." and not out.envelopes


@pytest.mark.parametrize("q", ["운봉읍 의심 필지 몇 건?", "여수시 보고서 초안", "농지법 제2조", "이 필지 영상 설명해 줘"])
def test_non_admin_normal_question_not_hijacked(q):
    assert T.ROUTE(q, Ctx(NAMWON)) is None and T.ROUTE(q, Ctx(ADMIN)) is None


@pytest.mark.parametrize("q,tool", [("GPU 상태", "ops_gpus"), ("대기열 요약", "ops_queues"), ("경보 있어?", "ops_alerts"),
                                    ("기관별 AI 도우미 사용량", "ops_usage"), ("언어 모델 상태", "ops_models")])
def test_route_four_questions(q, tool):
    r = T.ROUTE(q, Ctx(ADMIN))
    assert r and r["tool"] == tool and "tenant" not in r["args"]
    assert T.ROUTE(q, Ctx(NAMWON))["tool"] == "ops_admin_only" and T.ROUTE(q, Ctx(STAFF))["tool"] == "ops_admin_only"


def test_route_tenant_and_mixed():
    assert T.ROUTE("남원 토큰 얼마나 썼어", Ctx(ADMIN)) == {"tool": "ops_usage", "args": {"tenant": "남원", "dim": "llm_tokens_month"}}
    assert T.ROUTE("남원 XI ChatGEO 요청 건수", Ctx(ADMIN)) == {"tool": "ops_usage", "args": {"tenant": "남원"}}
    assert T.ROUTE("GPU 와 대기열 상태 알려 줘", Ctx(ADMIN)) is None          # 둘 이상 → 모델이 고른다
    assert T.OPS_ASK.search("GPU 상태") and T.ADMIN_LINE == "LX 관리자 화면에서 확인할 수 있습니다."


def test_handler_refuses_non_admin():
    with pytest.raises(ToolError) as e:
        run(T.ops_gpus({}, Ctx(NAMWON, admin=False)))
    assert e.value.code == "tool_forbidden" and e.value.message == T.ADMIN_LINE


# ── 수치 = /ops/* 응답 ────────────────────────────────────────────────────
def test_gpus_values_and_no_product_name():
    out = run(T.ops_gpus({}, Ctx(ADMIN)))
    e = envs(out)
    assert e["g0_load"]["value"] == 12 and e["g0_w"]["value"] == 18 and e["g1_t"]["value"] == 88
    assert e["g0_mem"]["value"] == round(20231 / 1024, 1) and e["g0_memt"]["value"] == 48
    assert e["hot"]["value"] == 0 and e["hot_max"]["value"] == 1
    blob = json.dumps({"d": out.data, "e": out.envelopes}, ensure_ascii=False)
    for bad in ("A6000", "NVIDIA", "llama", "8000", "8001", "11434", "/api", ".ps1", "E:/", "관제", "AG-"):
        assert bad not in blob, bad
    assert set(out.data["GPU"]) == {"GPU 0", "GPU 1"}
    assert out.data["GPU"]["GPU 0"]["하는 일"] == "언어 모델" and out.data["GPU"]["GPU 1"]["하는 일"] == "분석 작업"
    assert any("우선순위" in s for s in out.data["제안"])                  # 온도 88 → 제안만


def test_queues_sum_matches_screen():
    out = run(T.ops_queues({}, Ctx(ADMIN)))
    e = envs(out)
    assert e["queued"]["value"] == 2 and e["running"]["value"] == 1
    assert "GPU 서버" in out.data["서버별"] and "일반 서버" in out.data["서버별"]


def test_alerts_open_rule_matches_ops_core():
    out = run(T.ops_alerts({}, Ctx(ADMIN)))
    e = envs(out)
    assert e["open"]["value"] == 1                                          # vram_ 제외 · 닫힌 것 제외(ops-core openAlerts 와 같은 규칙)
    assert out.data["목록"][0]["경보"] == "작업기 응답 없음"


def test_usage_default_is_xi_chatgeo_requests():
    """기관별 사용량의 기본 = XI ChatGEO 요청 건수(원칙 91 · 96 · 11차 자원-1) — 답 · 차트 제목에 'AI 도우미' 0."""
    r = T.ROUTE("기관별 사용량 보여 줘", Ctx(ADMIN))
    assert r == {"tool": "ops_usage", "args": {}}
    out = run(T.ops_usage(r["args"], Ctx(ADMIN)))
    e = envs(out)
    assert e["namwon_u"]["value"] == 856 and e["namwon_u"]["unit"] == "건" and e["sum"]["value"] == 856 + 97 + 41 + 2 + 1599
    assert out.data["항목"] == "XI ChatGEO 요청 건수" and out.answer.startswith("이번 달 XI ChatGEO 요청 건수는 ")
    assert out.blocks[0]["title"] == "이번 달 XI ChatGEO 요청 건수"
    assert "AI 도우미" not in out.answer and "AI 도우미" not in out.blocks[0]["title"]
    assert "AI 도우미" not in str(T.SPECS["ops_usage"]) and "AI 도우미" not in str(T.USAGE_DIMS)


def test_usage_llm_tokens_four_tenants():
    out = run(T.ops_usage({"dim": "llm_tokens_month"}, Ctx(ADMIN)))
    e = envs(out)
    assert e["namwon_u"]["value"] == 856313 and e["gwangju_jeonnam_u"]["value"] == 97225
    assert e["kgz_agri_u"]["value"] == 41194 and e["lx_u"]["value"] == 1599304
    assert "lx_demo_u" not in e                                             # 영업 계량 제외
    assert e["namwon_u"]["unit"] == "tokens"     # 칩 단위 키 — 화면 i18n 이 ko '토큰' · en 'tokens'
    assert set(out.data["기관"]) == {"남원시", "광주전남특별시", "키르기스 농업부", "키르기스 토지자원청", "LX"}
    # 사용을 막는 값은 없다(원칙 83 · 11차 — 기관 · LX 직원 모두) — 답에 '한도' 칸 · 봉투가 없다
    assert not any(k.endswith("_h") for k in e) and all("한도" not in row for row in out.data["기관"].values())
    assert e["sum"]["value"] == 856313 + 97225 + 41194 + 2724 + 1599304


def test_usage_one_tenant_and_dim():
    out = run(T.ops_usage({"tenant": "남원"}, Ctx(ADMIN)))
    assert list(out.data["기관"]) == ["남원시"] and "합계" not in out.data
    out = run(T.ops_usage({"dim": "gpu_s_month", "tenant": "LX"}, Ctx(ADMIN)))
    assert envs(out)["lx_u"]["value"] == 2.0 and envs(out)["lx_u"]["unit"] == "시간"
    # r3-ops: 없는 이름은 오류(→ 모델 경로 · LLM 호출) 대신 한 줄로 닫는다(숫자 0 · LLM 0)
    out = run(T.ops_usage({"tenant": "없는기관"}, Ctx(ADMIN)))
    assert out.answer == "그 이름의 기관이 없습니다." and not out.envelopes


def test_models_rows_and_promo_no_shutdown_suggestion():
    out = run(T.ops_models({}, Ctx(ADMIN)))
    assert envs(out)["on"]["value"] == 2
    assert out.data["국산 모델 연결"] == "연결 전" and len(out.data["모델"]) == 3
    blob = json.dumps(out.data, ensure_ascii=False)
    assert "켜기" in blob and "끄" not in blob and "내리" not in blob and "재시작" not in blob


# ── 언어 모델 켜기(모의 상태) ─────────────────────────────────────────────
IDLE = [{"index": 0, "util": 0}, {"index": 1, "util": 0}]
PB_OK = {"ok": True, "hot": []}


@pytest.mark.parametrize("slot", ["brain", "router"])
def test_start_locked_while_on(slot):
    d = L.decide(slot, {"brain": True, "router": True}, PB_OK, IDLE)
    assert not d["ok"] and d["code"] == "already_on" and "cmd" not in d


def test_start_brain_when_both_off_uses_script_with_router():
    d = L.decide("brain", {"brain": False, "router": False}, PB_OK, IDLE)
    assert d["ok"] and d["cmd"][-1] == "-Router" and str(L.SCRIPT) in d["cmd"] and "-Stop" not in d["cmd"]


def test_start_brain_only_keeps_router():
    d = L.decide("brain", {"brain": False, "router": True}, PB_OK, IDLE)
    assert d["ok"] and "-Router" not in d["cmd"]


def test_start_router_only_never_recreates_brain():
    d = L.decide("router", {"brain": True, "router": False}, PB_OK, IDLE)
    assert d["ok"] and "--no-recreate" in d["cmd"] and d["cmd"][-1] == "router" and "gemma" not in d["cmd"] and "down" not in d["cmd"]


def test_start_power_rule():
    assert L.decide("brain", {}, {"ok": False, "hot": [0]}, IDLE)["code"] == "power"
    assert L.decide("brain", {}, PB_OK, [{"index": 0, "util": 80}, {"index": 1, "util": 0}])["code"] == "power"   # 다른 GPU 고부하
    assert L.decide("brain", {}, PB_OK, [{"index": 0, "util": 0}, {"index": 1, "util": 55}])["code"] == "busy"    # 대상 GPU 분석 중
    assert L.decide("fallback", {}, PB_OK, IDLE)["code"] == "bad_slot"                                           # 예비 모델은 켜기 없음
    assert L.decide("brain", {}, PB_OK, IDLE, starting=True)["code"] == "starting"
    assert L.gpu_index("GPU1") == 1 and L.gpu_index("GPU0/1 상주") is None


def test_no_stop_or_restart_anywhere():
    src = (SERVER / "ops" / "llm_start.py").read_text(encoding="utf-8")
    assert "-Stop" not in src and "restart" not in src.lower().replace("재시작은 없다", "") and " down" not in src


# ── 사용량 항목(quota.py) ────────────────────────────────────────────────
def test_quota_has_llm_tokens_dim():
    from landxi_api import quota
    assert "llm_tokens_month" in quota.DIMS and quota.UNIT["llm_tokens_month"] == "tokens"
    assert quota.MONTH_DIM["llm_tokens_month"] == "llm_tokens"


# ── 실증 1차 must_fix ────────────────────────────────────────────────────
KGZ = Principal("tenant", "manager", "kgz-land", "u_kgz_land_manager", caps=CAPS[("tenant", "manager")])
GLOBAL_CTX = {"country": "KGZ", "season": "Autumn 2025"}
HANGUL = __import__("re").compile(r"[가-힣]")
TAIL = "\n(Current area: Sokuluk. Answer in English.)"


@pytest.mark.parametrize("q", ["GPU 상태", "대기열 요약", "경보 있어?", "기관별 AI 도우미 사용량", "Are there any alerts?" + TAIL,
                               "Show GPU status" + TAIL, "Queue summary" + TAIL])
def test_global_agency_ops_question_english_one_line(q):
    """① 해외 기관 화면: 운영 질문 모두 한 줄 안내 · 영어(한국어로 물어도) · LLM 0."""
    ctx = Ctx(KGZ, context=GLOBAL_CTX, lang="ko" if HANGUL.search(q) else "en")
    assert T.ROUTE_FIRST(q, ctx) == {"tool": "ops_admin_only", "args": {}}
    out = run(T.ops_admin_only({}, ctx))
    assert out.answer == "You can check this on the LX admin dashboard." and not out.envelopes
    assert T.SAY["ops_admin_only"] == "확인"          # 해외 화면이 계획 줄 '확인' → 'Check' 로 바꾼다(모르는 한국어면 오류 문구)


def test_global_agency_by_tenant_config_without_context():
    from landxi_api.regions import _cfg
    if not ((_cfg().get("tenants") or {}).get("kgz-land") or {}).get("global"):
        pytest.skip("regions.yaml 에 kgz-land global 없음")
    assert run(T.ops_admin_only({}, Ctx(KGZ, lang="ko"))).answer == "You can check this on the LX admin dashboard."
    assert run(T.ops_admin_only({}, Ctx(NAMWON, lang="ko"))).answer == T.ADMIN_LINE        # 국내 기관은 한국어 그대로


def test_ops_route_runs_before_global_summary():
    """① 해외 요약 직행(global_ · 파일 이름순 앞)이 '대기열 요약' · 'Show GPU status'를 먼저 먹지 않는다."""
    from agent.tools import ext, registry
    registry.ensure_ext()
    assert ext.ROUTES and ext.ROUTES[0][0] == "ops"
    for q in ["대기열 요약", "Show GPU status" + TAIL]:
        ctx = Ctx(KGZ, context=GLOBAL_CTX)
        first = None
        for mod, fn in ext.ROUTES:
            hit = run(ext.maybe(fn(q, ctx)))
            if isinstance(hit, dict) and hit.get("tool") in registry.SPECS and registry.allowed(hit["tool"], KGZ):
                first = hit
                break
        assert first and first["tool"] == "ops_admin_only", (q, first)


@pytest.mark.parametrize("q", ["Sokuluk NDVI summary", "이 지역 GPU로 분석 돌려 줘", "Show crop condition", "운봉읍 의심 필지 몇 건?"])
def test_front_route_does_not_hijack_normal_questions(q):
    for p in (KGZ, NAMWON):
        assert T.ROUTE_FIRST(q, Ctx(p, context=GLOBAL_CTX if p is KGZ else {})) is None


def test_usage_one_named_agency_only():
    """② '키르기스 토지자원청 AI 도우미 사용량' → 토지자원청 하나 · 농업부 섞임 0 · 합계 0."""
    r = T.ROUTE("키르기스 토지자원청 AI 도우미 사용량", Ctx(ADMIN))
    assert r["tool"] == "ops_usage" and r["args"]["tenant"] == "키르기스 토지자원청"
    out = run(T.ops_usage(r["args"], Ctx(ADMIN)))
    assert list(out.data["기관"]) == ["키르기스 토지자원청"] and "합계" not in out.data and not out.blocks
    assert envs(out)["kgz_land_u"]["value"] == 2 and "kgz_agri_u" not in envs(out)
    assert "농업부" not in out.answer and "합계" not in out.answer
    for w in ["kgz-land", "토지자원청", "Kyrgyz State Agency on Land Resources"]:
        assert list(run(T.ops_usage({"tenant": w}, Ctx(ADMIN))).data["기관"]) == ["키르기스 토지자원청"], w
    for w, nm in [("남원시는 토큰 얼마나 썼어", "남원시"), ("광주전남의 AI 도우미 사용량", "광주전남특별시"), ("LX 사용량", "LX")]:
        r = T.ROUTE(w, Ctx(ADMIN))
        assert list(run(T.ops_usage(r["args"], Ctx(ADMIN))).data["기관"]) == [nm], w


def test_usage_ambiguous_name_lists_both_without_total():
    out = run(T.ops_usage({"tenant": "키르기스"}, Ctx(ADMIN)))
    assert set(out.data["기관"]) == {"키르기스 농업부", "키르기스 토지자원청"} and "합계" not in out.data and "합계" not in out.answer


@pytest.mark.parametrize("q", ["How many tokens has each agency used?", "Token usage by agency"])
def test_admin_english_usage_direct_and_english(q):
    """③ 관리자 영어 질문(토큰) → 모델 앞 직행 · 영어 기관명 · 한글 0 · 단위 한 번('tokens' 칩만)."""
    r = T.ROUTE(q, Ctx(ADMIN, lang="en"))
    assert r == {"tool": "ops_usage", "args": {"dim": "llm_tokens_month"}}
    out = run(T.ops_usage(r["args"], Ctx(ADMIN, lang="en")))
    assert not HANGUL.search(out.answer), out.answer
    assert "Namwon-si" in out.answer and "Kyrgyz State Agency on Land Resources" in out.answer and "Total: {{sum}}" in out.answer
    assert "}} tokens" not in out.answer and "}} 토큰" not in out.answer                   # 자리표 뒤 단위 글자 0 — 칩이 단위를 낸다
    e = envs(out)
    assert e["namwon_u"]["value"] == 856313 and e["namwon_u"]["unit"] == "tokens" and e["sum"]["value"] == 856313 + 97225 + 41194 + 2724 + 1599304
    b = out.blocks[0]
    assert b["title"] == "XI ChatGEO tokens this month" and not any(HANGUL.search(x["label"]) for x in b["rows"])


@pytest.mark.parametrize("q", ["How much AI assistant usage does each agency have?", "XI ChatGEO usage by agency"])
def test_admin_english_usage_default_requests(q):
    """영어 '사용량' 질문의 기본 = XI ChatGEO 요청 건수(차트 제목 · 단위 requests)."""
    r = T.ROUTE(q, Ctx(ADMIN, lang="en"))
    assert r == {"tool": "ops_usage", "args": {}}
    out = run(T.ops_usage(r["args"], Ctx(ADMIN, lang="en")))
    assert not HANGUL.search(out.answer), out.answer
    assert out.blocks[0]["title"] == "XI ChatGEO requests this month" and envs(out)["namwon_u"]["unit"] == "requests"


def test_admin_english_one_agency():
    r = T.ROUTE("How many tokens has Namwon used?", Ctx(ADMIN, lang="en"))
    assert r["tool"] == "ops_usage" and r["args"]["tenant"] and r["args"]["dim"] == "llm_tokens_month"
    out = run(T.ops_usage(r["args"], Ctx(ADMIN, lang="en")))
    assert list(out.data["기관"]) == ["Namwon-si"] and "Total" not in out.answer


@pytest.mark.parametrize("q,tool", [("Show GPU status", "ops_gpus"), ("Are there any alerts?", "ops_alerts"), ("Queue summary", "ops_queues"),
                                    ("Language model status", "ops_models")])
def test_admin_english_other_tools_no_hangul(q, tool):
    r = T.ROUTE(q, Ctx(ADMIN, lang="en"))
    assert r and r["tool"] == tool
    out = run(T.HANDLERS[tool](r["args"], Ctx(ADMIN, lang="en")))
    assert out.answer and not HANGUL.search(out.answer), out.answer
    assert not any(HANGUL.search(str(e.get("unit"))) for _, _, e in out.envelopes), [e.get("unit") for _, _, e in out.envelopes]
