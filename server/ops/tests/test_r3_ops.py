"""r3-ops 테스트 — 관리자 영어 GPU 답(M14) · 시군구 이름 사용량 · 전력 예산 판정 한 곳(judge_power).

GPU 0 · 실제 vLLM 조작 0 · DB 0: 게이트웨이 응답은 test_c2_ops 의 FIX(모의)를 쓰고, 판정 함수는 순수 함수로만 부른다.
"""
import copy
import sys
from pathlib import Path

import pytest

SERVER = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(SERVER))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from agent.tools.ext import ops as T  # noqa: E402
from landxi_api.ops import judge_power  # noqa: E402
import test_c2_ops as C  # noqa: E402

ADMIN, NAMWON, STAFF = C.ADMIN, C.NAMWON, C.STAFF
run, envs = C.run, C.envs


def gpu(i, w, util=0.0):
    return {"index": i, "power_w": C.E(w, "W"), "util_ma5": C.E(util, "%")}


# ── 판정 한 곳(judge_power) ─────────────────────────────────────────────
def test_judge_idle_zero():
    j = judge_power([gpu(0, 18.6), gpu(1, 28.0)], 100.0, 1, [])
    assert j["hot"] == [] and j["hot_now"] == 0 and j["ok"] is True


def test_judge_spike_is_smoothed_by_recent_mean():
    # 지금 순간 GPU1 140 W 이지만 최근 6초 평균은 60 W → 고부하 아님(화면 · 답이 순간 튐으로 엇갈리지 않게)
    j = judge_power([gpu(0, 18.6), gpu(1, 140.0)], 100.0, 1, [], {0: 18.5, 1: 60.0})
    assert j["hot_now"] == 0
    # 평균도 높으면 고부하
    j = judge_power([gpu(0, 18.6), gpu(1, 140.0)], 100.0, 1, [], {0: 18.5, 1: 130.0})
    assert j["hot"] == [1] and j["ok"] is True and [p["why"] for p in j["per"]] == [None, "power"]


def test_judge_held_lease_is_not_hot():
    # impl-1: 분석 작업이 GPU 0 을 쥐고 있기만 하고(20 W) GPU 1 이 150 W — 실측으로는 한 장만 고부하(예전: 임대만 보고 '2 / 1 초과')
    j = judge_power([gpu(0, 20.0), gpu(1, 150.0)], 100.0, 1, [0], {1: 150.0})
    assert j["hot"] == [1] and j["hot_now"] == 1 and j["ok"] is True
    assert {p["gpu"]: p["why"] for p in j["per"]} == {0: "held", 1: "power"}


def test_judge_lease_and_power_same_gpu_counts_once():
    j = judge_power([gpu(0, 180.0), gpu(1, 20.0)], 100.0, 1, [0])
    assert j["hot"] == [0] and j["hot_now"] == 1 and j["ok"] is True


# ── M14 영어 GPU 3문 · 한국어 3문 → 같은 직행 도구 ─────────────────────────
EN3 = ["How many GPUs are under high load", "Is the power budget exceeded?", "Which GPU is busy?"]
KO3 = ["GPU 상태 알려 줘", "전력 예산 초과야?", "어느 GPU가 고부하야?"]


@pytest.mark.parametrize("q", EN3 + KO3 + ["How many GPUs are under high load right now?"])
def test_admin_gpu_questions_route_direct(q):
    assert T.ROUTE_FIRST(q, C.Ctx(ADMIN, lang="en")) == {"tool": "ops_gpus", "args": {}}


@pytest.mark.parametrize("q", EN3)
def test_non_admin_english_gpu_questions_one_line(q):
    for p in (NAMWON, STAFF):
        assert T.ROUTE_FIRST(q, C.Ctx(p, lang="en")) == {"tool": "ops_admin_only", "args": {}}


def fix_with(pb, gpus=None):
    f = copy.deepcopy(C.FIX)
    f["/ops/gpus"]["power_budget"] = pb
    if gpus is not None:
        f["/ops/gpus"]["gpus"] = gpus
    return f


def gpus_ctx(pb, lang, gpus=None):
    ctx = C.Ctx(ADMIN, lang=lang)
    f = fix_with(pb, gpus)

    async def get(path, params=None):
        return C.Res(200, f[path])
    ctx.http.get = get
    return ctx


IDLE = [{"index": 0, "util_ma5": C.E(0.0, "%"), "mem_used_mib": C.E(20000, "MiB"), "mem_total_mib": C.E(49140, "MiB"), "temp_c": C.E(40, "°C"),
         "power_w": C.E(18.6, "W"), "power_limit_w": C.E(200, "W"), "external": [], "job_id": None, "worker": "a6000-0"},
        {"index": 1, "util_ma5": C.E(0.0, "%"), "mem_used_mib": C.E(44000, "MiB"), "mem_total_mib": C.E(49140, "MiB"), "temp_c": C.E(41, "°C"),
         "power_w": C.E(28.0, "W"), "power_limit_w": C.E(200, "W"), "external": [{"name": "vllm"}], "job_id": None, "worker": None}]


def test_en_answer_zero_load_says_zero_not_two():
    """M14 재현 — 부하 0% · 전력 20–30 W, 화면 '0 / 1 · 전력 예산 안' → 답도 0 · none · within the limit."""
    pb = {"max_hot": 1, **judge_power([gpu(0, 18.6), gpu(1, 28.0)], 100.0, 1, []), "at": C.AT}
    out = run(T.ops_gpus({}, gpus_ctx(pb, "en", IDLE)))
    e = envs(out)
    assert e["hot"]["value"] == 0 and e["hot_max"]["value"] == 1
    assert out.answer.startswith("As of 00:10:00: GPUs under high load: {{hot}} (limit {{hot_max}}) — none. Power budget: within the limit.")
    assert "high load." not in out.answer.split("none.")[1]            # 어느 GPU 에도 '고부하'를 붙이지 않는다
    assert "{{g0_w}}" in out.answer and "{{g1_w}}" in out.answer        # 전력도 같은 표 값으로


def test_en_answer_names_busy_gpu_and_matches_screen_budget():
    pb = {"max_hot": 1, **judge_power([gpu(0, 20.0), gpu(1, 150.0)], 100.0, 1, [0], {1: 150.0}), "at": C.AT}
    out = run(T.ops_gpus({}, gpus_ctx(pb, "en", IDLE)))
    e = envs(out)
    assert e["hot"]["value"] == 1 and out.data["전력 예산"] == "안"
    assert "— GPU 1. Power budget: within the limit." in out.answer
    assert out.data["GPU"]["GPU 0"]["하는 일"] == "분석 작업"            # 임대 GPU 는 '대기'가 아니라 분석 작업 — 실측이 낮으면 고부하 아님(impl-1)
    assert out.data["GPU"]["GPU 0"]["고부하"] == "아니오"
    assert "GPU 0: load {{g0_load}}, power now {{g0_w}}, running an analysis job." in out.answer
    assert "GPU 1: load {{g1_load}}, power now {{g1_w}}, serving the language model, high load (recent average {{g1_avg}})." in out.answer


def test_ko_and_en_same_envelopes():
    pb = {"max_hot": 1, **judge_power([gpu(0, 20.0), gpu(1, 130.0)], 100.0, 1, [], {1: 130.0}), "at": C.AT}
    ko = envs(run(T.ops_gpus({}, gpus_ctx(pb, "ko", IDLE))))
    en = envs(run(T.ops_gpus({}, gpus_ctx(pb, "en", IDLE))))
    for k in ("hot", "hot_max", "g0_load", "g1_load", "g0_w", "g1_w"):
        assert ko[k]["value"] == en[k]["value"]
    assert ko["hot"]["value"] == 1


def test_ko_answer_regression():
    pb = {"max_hot": 1, "hot_now": 0, "ok": True, "hot": [], "per": [], "at": C.AT}
    out = run(T.ops_gpus({}, gpus_ctx(pb, "ko", IDLE)))
    assert out.answer.startswith("00:10:00 기준 동시 고부하 GPU는 {{hot}}(한도 {{hot_max}})로 고부하인 GPU 없음 · 전력 예산 안입니다.")
    assert "GPU 0은 부하 {{g0_load}}, 지금 전력 {{g0_w}}" in out.answer
    for bad in ("A6000", "RTX", "NVIDIA", "vLLM", "관제", "AG-"):
        assert bad not in out.answer


# ── 시군구 이름 사용량 ───────────────────────────────────────────────────
REG = {"목포시": {"sgg_cd": "12110", "prev_cd": "46110", "name": "목포시", "name_en": "Mokpo-si"},
       "남원시": {"sgg_cd": "52190", "prev_cd": None, "name": "남원시", "name_en": "Namwon-si"},
       "산청군": {"sgg_cd": "48860", "prev_cd": None, "name": "산청군", "name_en": "Sancheong-gun"},
       "중구": [{"sgg_cd": "11140", "name": "중구"}, {"sgg_cd": "26110", "name": "중구"}]}
PFX = {"namwon": ["52190"], "gwangju-jeonnam": ["12", "29", "46"]}


def fake_find(q):
    v = REG.get(q)
    return v if isinstance(v, list) else ([v] if v else [])


def test_sgg_owner_pure():
    metas = {"namwon": {}, "gwangju-jeonnam": {}, "lx": {}}
    assert T.sgg_owner("목포시", metas, fake_find, PFX)["tenant"] == "gwangju-jeonnam"
    assert T.sgg_owner("남원시", metas, fake_find, PFX)["tenant"] == "namwon"
    s = T.sgg_owner("산청군", metas, fake_find, PFX)
    assert s["region"]["sgg_cd"] == "48860" and s["tenant"] is None
    assert T.sgg_owner("중구", metas, fake_find, PFX) is None            # 여러 곳이면 정하지 않는다


@pytest.mark.parametrize("q,want", [("목포시 AI 도우미 사용량", "목포시"), ("산청군 AI 도우미 사용량", "산청군"), ("남원시 토큰 얼마나 썼어?", "남원시")])
def test_sgg_usage_routes_direct(q, want):
    assert T.ROUTE_FIRST(q, C.Ctx(ADMIN)) == {"tool": "ops_usage", "args": {"tenant": want}}


@pytest.fixture
def fake_regions(monkeypatch):
    monkeypatch.setattr(T, "_regions_find", fake_find)
    monkeypatch.setattr(T, "_tenant_prefixes", lambda: PFX)
    # sgg_owner 기본 인자는 정의 때 묶이므로 함수 자체를 감싼다
    orig = T.sgg_owner
    monkeypatch.setattr(T, "sgg_owner", lambda phrase, metas: orig(phrase, metas, fake_find, PFX))


def test_mokpo_usage_is_agency_value_with_inclusion_line(fake_regions):
    out = run(T.ops_usage({"tenant": "목포시"}, C.Ctx(ADMIN)))
    e = envs(out)
    assert list(out.data["기관"]) == ["광주전남특별시"] and "합계" not in out.data
    assert e["gwangju_jeonnam_u"]["value"] == 97225                        # = 기관 화면 표(/ops/tenants llm_tokens_month)
    assert out.answer.endswith("목포시는 광주전남특별시 기관 사용량에 포함됩니다.")
    assert not out.blocks


def test_namwon_usage_no_extra_line(fake_regions):
    out = run(T.ops_usage({"tenant": "남원시"}, C.Ctx(ADMIN)))
    assert list(out.data["기관"]) == ["남원시"] and envs(out)["namwon_u"]["value"] == 856313
    assert "포함됩니다" not in out.answer


def test_sancheong_no_account_one_line(fake_regions):
    out = run(T.ops_usage({"tenant": "산청군"}, C.Ctx(ADMIN)))
    assert out.answer == "산청군은 기관 계정이 없습니다." and not out.envelopes


def test_mokpo_usage_english(fake_regions):
    out = run(T.ops_usage({"tenant": "Mokpo-si"}, C.Ctx(ADMIN, lang="en")))
    # 영어 이름은 regions 검색에 없으므로 기관 이름 · 낱말 맞춤으로 간다 — 숫자 없는 한 줄 또는 기관 값(지어낸 값 0)
    assert "{{" in out.answer or out.answer == "No agency has that name."
    out = run(T.ops_usage({"tenant": "목포시"}, C.Ctx(ADMIN, lang="en")))
    assert out.answer.endswith("Mokpo-si is included in Gwangju-Jeonnam's agency usage.")


def test_real_regions_mokpo_and_sancheong():
    """실제 시군구 표(regions) + 관할 설정 — 서로 다른 시도 두 곳(광주전남 목포 · 경남 산청)."""
    out = run(T.ops_usage({"tenant": "목포시"}, C.Ctx(ADMIN)))
    assert list(out.data["기관"]) == ["광주전남특별시"] and "포함됩니다" in out.answer
    out = run(T.ops_usage({"tenant": "산청군"}, C.Ctx(ADMIN)))
    assert out.answer == "산청군은 기관 계정이 없습니다."


# ═══ r3-ops 실증 1차 must_fix 해결 ═════════════════════════════════════════════════════════════
# (1) 14:38 '2 / 1 전력 예산 초과' — GPU 0 은 분석 임대를 쥐었지만 전력 규칙으로 멈춰(20 W) 있었다. 임대만 보고 센 것이 오판.
def test_judge_yielded_lease_is_not_hot():
    j = judge_power([gpu(0, 20.2), gpu(1, 199.7)], 100.0, 1, [0], {0: 20.3, 1: 199.1}, yield_gpu=[0])
    assert j["hot"] == [1] and j["hot_now"] == 1 and j["ok"] is True
    assert {p["gpu"]: (p["hot"], p["why"]) for p in j["per"]} == {0: (False, "yield"), 1: (True, "power")}


def test_judge_yield_flag_never_hides_real_power():
    # 멈춤 표시가 남아 있어도 전력이 기준을 넘으면 고부하로 센다(측정이 이긴다)
    j = judge_power([gpu(0, 150.0), gpu(1, 199.0)], 100.0, 1, [0], {0: 150.0, 1: 199.0}, yield_gpu=[0])
    assert j["hot"] == [0, 1] and j["ok"] is False


def test_judge_unsampled_lease_stays_conservative():
    j = judge_power([gpu(1, 20.0)], 100.0, 1, [0], yield_gpu=[0])
    assert j["hot"] == [0]


def test_judge_lease_not_yielded_counts_only_by_measure():
    # impl-1: 멈춤 표시가 없어도 임대만으로는 세지 않는다 — 실측(전력)이 기준 아래면 'held'
    j = judge_power([gpu(0, 20.0), gpu(1, 150.0)], 100.0, 1, [0], {1: 150.0}, yield_gpu=[])
    assert j["hot_now"] == 1 and j["ok"] is True and j["per"][0]["why"] == "held"
    j = judge_power([gpu(0, 130.0), gpu(1, 150.0)], 100.0, 1, [0], {0: 125.0, 1: 150.0}, yield_gpu=[])
    assert j["hot_now"] == 2 and j["ok"] is False                        # 두 장이 실제로 기준을 넘으면 초과


def test_count_overlap_measured():
    from landxi_api.ops import count_overlap
    S = lambda at, a, b: {"at": at, "gpus": [gpu(0, a), gpu(1, b)]}  # noqa: E731
    xs = [S("14:37:44", 126.3, 30.2), S("14:37:48", 77.0, 90.9), S("14:38:00", 20.3, 199.1), S("14:45:11", 119.1, 46.5),
          S("x1", 130.0, 120.0), S("x2", 101.0, 100.5)]
    o = count_overlap(xs, 100.0)
    assert o == {"n": 2, "last_at": "x2", "samples": 6}
    assert count_overlap([], 100.0)["n"] == 0


def test_answer_yielded_gpu_ko_en_matches_screen():
    """14:38 재현 — 화면 '1 / 1 · 전력 예산 안' · GPU 0 '분석 잠시 멈춤'. 답도 1 · GPU 1 · within · GPU 0 은 멈춤(고부하 아님)."""
    pb = {"max_hot": 1, **judge_power([gpu(0, 20.3), gpu(1, 199.1)], 100.0, 1, [0], {0: 20.3, 1: 199.1}, yield_gpu=[0]),
          "overlap": {"n": C.E(0, "count")}, "at": C.AT}
    busy = copy.deepcopy(IDLE)
    busy[0]["job_id"] = "job_x"
    busy[1]["util_ma5"] = C.E(87.0, "%")
    en = run(T.ops_gpus({}, gpus_ctx(pb, "en", busy)))
    assert envs(en)["hot"]["value"] == 1 and en.data["전력 예산"] == "안"
    assert en.answer.startswith("As of 00:10:00: GPUs under high load: {{hot}} (limit {{hot_max}}) — GPU 1. Power budget: within the limit.")
    assert "analysis job paused by the power rule." in en.answer and en.answer.count(", high load") == 1
    assert "high load (recent average {{g1_avg}})." in en.answer
    assert "Both GPUs under high load at once in the last 2 hours: {{overlap}}." in en.answer
    ko = run(T.ops_gpus({}, gpus_ctx(pb, "ko", busy)))
    assert ko.answer.startswith("00:10:00 기준 동시 고부하 GPU는 {{hot}}(한도 {{hot_max}})로 GPU 1이 고부하 · 전력 예산 안입니다.")
    assert "전력 규칙으로 잠시 멈춘 상태" in ko.answer and envs(ko)["overlap"]["value"] == 0
    assert ko.data["GPU"]["GPU 0"]["고부하"] == "아니오"


# (1) LLM 쪽 예고 — 두 세션이 겹쳐도 먼저 끝난 쪽이 예고를 지우지 않는다(작업기는 계속 양보). 운영 Redis 0번과 섞이지 않게 15번 DB.
@pytest.fixture
def bus15(monkeypatch):
    import redis as _redis
    from workers import bus, nvml_power
    try:
        c = _redis.Redis.from_url(bus.config.REDIS_URL, db=15, decode_responses=True, socket_connect_timeout=2)
        c.ping()
    except Exception:  # noqa: BLE001
        pytest.skip("Redis 없음")
    c.delete(bus.LLM_REQ, bus.LLM_CALLS, bus.LLM_OVERLAP)
    monkeypatch.setattr(bus, "_r", c)
    monkeypatch.setattr(nvml_power, "read_avg", lambda: {0: 20.0, 1: 30.0})
    yield bus, c
    c.delete(bus.LLM_REQ, bus.LLM_CALLS, bus.LLM_OVERLAP)


def test_llm_announce_survives_overlapping_calls(bus15):
    bus, c = bus15
    assert bus.llm_power_request("agent:vllm#a")["ok"]
    assert bus.llm_power_request("agent:vllm#b")["ok"]
    bus.llm_power_done("agent:vllm#a")
    assert c.get(bus.LLM_REQ) == "agent:vllm#b"          # b 가 아직 생성 중 — 작업기는 계속 멈춰 있다
    bus.llm_power_done("agent:vllm#b")
    assert c.get(bus.LLM_REQ) is None and c.zcard(bus.LLM_CALLS) == 0


def test_llm_announce_retry_same_holder_is_one_entry(bus15):
    bus, c = bus15
    for _ in range(3):                                   # VLM 재시도처럼 같은 이름으로 여러 번
        bus.llm_power_request("agent:vlm:run1", 1, 60)
    assert c.zcard(bus.LLM_CALLS) == 1 and 50 <= c.ttl(bus.LLM_REQ) <= 60
    bus.llm_power_done("agent:vlm:run1")
    assert c.get(bus.LLM_REQ) is None


def test_llm_announce_keeps_longest_expiry(bus15):
    bus, c = bus15
    bus.llm_power_request("agent:vlm:run2", 1, 60)
    bus.llm_power_request("agent:router#x", 1, 30)
    assert c.ttl(bus.LLM_REQ) >= 50                      # 짧은 호출이 긴 호출의 예고를 줄이지 않는다
    bus.llm_power_done("agent:router#x")
    assert c.get(bus.LLM_REQ) == "agent:vlm:run2"


def test_llm_overlap_recorded_when_gpu0_stays_hot(bus15, monkeypatch):
    bus, c = bus15
    from workers import nvml_power
    monkeypatch.setattr(nvml_power, "read_avg", lambda: {0: 150.0, 1: 30.0})
    out = bus.llm_power_request("agent:vllm#h", wait_max_s=0.3)
    assert out["ok"] is False and c.llen(bus.LLM_OVERLAP) == 1
    bus.llm_power_done("agent:vllm#h")


# (2) 서버 다시 시작(C9 원스톱 · M8 재현 조건) — 명령줄 없이 화면에서
def test_gateway_restart_decide():
    from ops import gateway_restart as G
    d = G.decide(restarting=False, script_exists=True)
    assert d["ok"] and d["cmd"][-2:] == ["-Restart", "gateway"] and d["cmd"][d["cmd"].index("-File") + 1].endswith("start-landxi.ps1")
    assert G.decide(restarting=True)["code"] == "restarting"
    assert G.decide(restarting=False, script_exists=False)["code"] == "no_script"
    for m in G.MSG.values():                             # 화면 문구 — 경로 · 포트 · 명령 노출 0
        for bad in (".ps1", "8700", "gateway", "powershell", "E:"):
            assert bad not in m
    assert G.SCRIPT.exists()


def test_gateway_restart_never_touches_llm_or_workers():
    from ops import gateway_restart as G
    cmd = " ".join(G.decide(False)["cmd"]).lower()
    for bad in ("vllm", "ollama", "docker", "workers", "-stop", " all"):
        assert bad not in cmd


def test_gateway_restart_route_admin_only():
    src = (SERVER / "landxi_api" / "ops.py").read_text(encoding="utf-8")
    i = src.index('@router.post("/ops/gateway/restart")')
    body = src[i:i + 1400]
    assert "require(principal(request), admin=True)" in body and "audit(" in body and "status_code=202" in body


def test_login_notice_says_what_to_do_when_server_down():
    js = (SERVER.parent / "landxi" / "v3" / "login" / "auth.js").read_text(encoding="utf-8")
    assert "서버에 연결할 수 없습니다 — 잠시 뒤 다시 불러오기를 누르세요" in js
    assert "e.status >= 502" in js                        # 관문(바깥 주소)이 서버를 못 찾을 때도 옛 디렉터리로 새지 않는다


# ── 실증 2차 must_fix (2026-09-30 15:07–15:18) ───────────────────────────
# (1) 판정 전력(최근 평균)을 행 · 답에 함께 — '1 / 1' 인데 행은 20 W · 33 W, 답은 'power 86 W, idle, high load' 이던 일
def test_power_hot_gpu_says_recent_average_not_idle():
    pb = {"max_hot": 1, **judge_power([gpu(0, 20.0), gpu(1, 86.0)], 100.0, 1, [], {0: 20.0, 1: 118.4}), "at": C.AT}
    quiet = copy.deepcopy(IDLE)
    quiet[1]["power_w"] = C.E(86.0, "W")
    quiet[1]["external"] = []                            # 언어 모델 표시 없음 · 부하 0 → 예전 답은 'idle, high load'
    en = run(T.ops_gpus({}, gpus_ctx(pb, "en", quiet)))
    assert envs(en)["g1_avg"]["value"] == 118 and envs(en)["g1_w"]["value"] == 86
    assert "GPU 1: load {{g1_load}}, power now {{g1_w}}, in use, high load (recent average {{g1_avg}})." in en.answer
    assert "idle, high load" not in en.answer
    ko = run(T.ops_gpus({}, gpus_ctx(pb, "ko", quiet)))
    assert "GPU 1은 부하 {{g1_load}}, 지금 전력 {{g1_w}}" in ko.answer and "사용 중, 최근 평균 전력 {{g1_avg}}로 고부하입니다." in ko.answer


def test_infra_row_shows_judged_average_and_time():
    js = (SERVER.parent / "landxi" / "v3" / "ops-infra" / "js" / "data.js").read_text(encoding="utf-8")
    inf = (SERVER.parent / "landxi" / "v3" / "ops-infra" / "js" / "infra.js").read_text(encoding="utf-8")
    assert "고부하 · 최근 평균 ${Math.round(p.power_w)} W" in js and "export function judgedAt()" in js
    assert "hotNote(g)" in inf and "기준 · " in inf and "power_budget?.at" in inf


# (2) 같은 표본 = 같은 판정 — 답과 인프라 큰 숫자가 같은 판정 시각이면 값이 같다(표본 하나에 판정 하나 · Redis)
class FakeR:
    def __init__(self, stream):
        self.stream, self.kv, self.h = stream, {}, {}

    async def xrevrange(self, key, count=None):
        return list(reversed(self.stream))[:count]

    async def xrange(self, key):
        return list(self.stream)

    async def get(self, k):
        return self.kv.get(k)

    async def set(self, k, v, ex=None, nx=False):
        if nx and k in self.kv:
            return None
        self.kv[k] = v
        return True

    async def hgetall(self, k):
        return self.h.get(k, {})


def _sample(i, at, w0, w1):
    import json as _j
    return (f"{i}-0", {"json": _j.dumps({"at": at, "gpus": [{"index": 0, "power_w": w0}, {"index": 1, "power_w": w1}]})})


def test_same_sample_same_judgment(monkeypatch):
    import datetime as _dt
    from landxi_api import ops as O, jobs as J
    now = _dt.datetime.now(O.KST)
    ts = [(now - _dt.timedelta(seconds=s)).isoformat(timespec="seconds") for s in (4, 2, 0)]
    fr = FakeR([_sample(1, ts[0], 20, 150), _sample(2, ts[1], 20, 140), _sample(3, ts[2], 20, 130)])
    leases = {"v": []}

    async def fake_redis():
        return fr

    async def fake_pb():
        return {"leases": leases["v"], "max_hot_gpus": 1, "power_limit_w": 200}
    monkeypatch.setattr(O, "redis", fake_redis)
    monkeypatch.setattr(J, "power_budget", fake_pb)
    O.OVERLAP_CACHE.update(at=0.0, v=None)
    gl = [{"index": 0, "power_w": C.E(20, "W")}, {"index": 1, "power_w": C.E(60, "W")}]
    a = run(O.power_budget_now(gl))
    assert a["hot"] == [1] and a["at"] == ts[2] and a["sample"] == "3-0"
    p1 = [p for p in a["per"] if p["gpu"] == 1][0]
    assert p1["power_w"] == 140.0 and p1["power_now_w"] == 130.0 and p1["basis"] == "avg"
    # 같은 표본 사이에 상태가 바뀌어도(다른 임대 · 지금 전력) 같은 표본이면 같은 판정 — 화면과 답이 엇갈리지 않는다
    leases["v"] = [{"holder": "w0"}]
    fr.h["worker:w0:hb"] = {"gpu": "0"}
    b = run(O.power_budget_now([{"index": 0, "power_w": C.E(20, "W")}, {"index": 1, "power_w": C.E(10, "W")}]))
    assert b == a
    # 새 표본이 오면 다시 판정 — 판정 시각이 바뀐다
    fr.stream.append(_sample(4, _dt.datetime.now(O.KST).isoformat(timespec="seconds"), 20, 200))
    c = run(O.power_budget_now(gl))
    assert c["sample"] == "4-0" and c["hot_now"] == 1 and c["ok"] is True          # GPU 0 임대 · 20 W = 쥐고만 있음(impl-1)
    assert {p["gpu"]: p["why"] for p in c["per"]} == {0: "held", 1: "power"}
    # 부른 쪽이 GPU 목록을 비워 보내도(분석 제출 검사 등) 판정은 표본의 GPU 목록으로 — 캐시가 잘못된 판정으로 채워지지 않는다
    fr.stream.append(_sample(5, _dt.datetime.now(O.KST).isoformat(timespec="seconds"), 20, 200))
    d = run(O.power_budget_now([]))
    assert d["sample"] == "5-0" and 1 in d["hot"] and {p["gpu"] for p in d["per"]} == {0, 1}


# (3) 서버 다시 시작 기록 — 한글 경로에 ops-restart-*.log 가 남고, 자식 출력 · 종료 코드가 적힌다
def test_gateway_restart_spawn_writes_log(tmp_path, monkeypatch):
    import time as _t
    from ops import gateway_restart as G
    d = tmp_path / "로그 폴더"
    monkeypatch.setattr(G, "LOGS", d)
    G.spawn(["powershell", "-NoProfile", "-Command", "Write-Output 다시시작확인; exit 0"], delay_s=0.1)
    logs = []
    for _ in range(60):
        logs = list(d.glob("ops-restart-*.log"))
        if logs and "종료 코드" in logs[0].read_bytes().decode("utf-8", "replace"):
            break
        _t.sleep(0.25)
    assert logs, "기록 파일이 없다"
    txt = logs[0].read_bytes().decode("utf-8", "replace")
    assert "[ops-restart] 시작" in txt and "다시시작확인" in txt and "종료 코드 0" in txt


def test_gateway_restart_spawn_not_detached():
    """DETACHED_PROCESS 로 띄우면 PowerShell 이 아무것도 하지 않고 끝난다(실측 · 기록 0 · 스크립트 실행 0)."""
    src = (SERVER / "ops" / "gateway_restart.py").read_text(encoding="utf-8")
    body = src[src.index("def spawn("):]
    base = [ln for ln in body.splitlines() if ln.strip().startswith("base = ")][0]
    assert "DETACHED_PROCESS" not in base and "CREATE_NO_WINDOW" in base
    assert "stdout=fh" in body and "& {cmd} *>>" not in body


def test_lease_hot_gpu_is_analysis_not_language_model():
    """15:29:31 실측 — 임대를 쥔 GPU 0 을 작업기 프로세스(python) 때문에 'serving the language model, high load' 로 쓰던 일.
    impl-1: 44 W(기준 아래)면 쥐고 있기만 한 것 — 분석 작업이지만 고부하는 아니다."""
    pb = {"max_hot": 1, **judge_power([gpu(0, 44.0), gpu(1, 29.0)], 100.0, 1, [0], {0: 44.0, 1: 29.0}), "at": C.AT}
    g = copy.deepcopy(IDLE)
    g[0]["external"] = [{"name": "python.exe"}]
    g[0]["util_ma5"] = C.E(20.0, "%")
    en = run(T.ops_gpus({}, gpus_ctx(pb, "en", g)))
    assert "GPU 0: load {{g0_load}}, power now {{g0_w}}, running an analysis job." in en.answer and "high load (a job" not in en.answer
    ko = run(T.ops_gpus({}, gpus_ctx(pb, "ko", g)))
    assert "로 분석 작업 중입니다." in ko.answer and "고부하입니다" not in ko.answer.split("GPU 0은")[1].split("GPU 1은")[0]
    js = (SERVER.parent / "landxi" / "v3" / "ops-infra" / "js" / "data.js").read_text(encoding="utf-8")
    assert "why === 'held'" in js and "고부하 · 작업 중" in js
