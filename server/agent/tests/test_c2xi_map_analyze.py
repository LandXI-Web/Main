"""c2-xi — 말로 지도 제어(map_region · map_zoom · map_view · map_layer) · 말로 분석 실행(analysis_run · survey_build) ·
영상 층(동적 타일 낮은 줌 읽기 · 기관 관할 영상) 테스트. LLM 호출 0 · GPU 0 · 작업 제출 0(가짜 HTTP)."""
import asyncio
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from agent.tools import ToolError  # noqa: E402
from agent.tools.ext import analyze as A  # noqa: E402
from agent.tools.ext import map as M  # noqa: E402


class P:
    def __init__(self, realm="lx", role="staff", tenant_id=None):
        self.realm, self.role, self.tenant_id, self.user_id = realm, role, tenant_id, "u_test"

    @property
    def is_lx(self):
        return self.realm == "lx"


class Res:
    def __init__(self, status, j):
        self.status_code, self._j = status, j

    def json(self):
        return self._j


class Http:
    """경로별 응답 · 부른 기록(calls)."""
    def __init__(self, routes):
        self.routes, self.calls = routes, []

    async def request(self, method, path, **kw):
        self.calls.append((method, path, kw.get("json")))
        st, j = self.routes.get((method, path), (404, {"error": {"code": "not_found"}}))
        return Res(st, j)


class Ctx:
    def __init__(self, p=None, context=None, http=None, checks=None):
        self.principal = p or P()
        self.context = context or {}
        self.http = http
        self.state = {"_c2xi_checks": checks} if checks else {}


def run(c):
    return asyncio.run(c)


# ── 지도 도구 ──────────────────────────────────────────────────────────
def test_map_region_moves_even_without_results():
    out = run(M.map_region({"name": "구례군"}, Ctx()))
    a = out.ui_actions[0]
    assert a["op"] == "map_region" and a["sgg_cd"] == "12730" and len(a["bbox"]) == 4
    assert out.envelopes == []                       # 숫자 0 — 지도 동작만


def test_map_region_by_code_and_tenant_guard():
    ok = run(M.map_region({"sgg_cd": "52190"}, Ctx(P("tenant", "manager", "namwon"))))
    assert ok.ui_actions[0]["name"] == "남원시"
    with pytest.raises(ToolError) as e:
        run(M.map_region({"name": "여수시"}, Ctx(P("tenant", "manager", "namwon"))))
    assert e.value.code == "out_of_scope" and "이 기관의 데이터가 아닙니다" in e.value.message


def test_map_region_unknown():
    with pytest.raises(ToolError):
        run(M.map_region({"name": "없는군"}, Ctx()))


def test_map_zoom_view_layer_actions():
    assert run(M.map_zoom({"delta": 1}, Ctx())).ui_actions == [{"op": "map_zoom", "delta": 1.0}]
    assert run(M.map_zoom({"zoom": 40}, Ctx())).ui_actions == [{"op": "map_zoom", "zoom": 19.0}]
    v = run(M.map_view({"preset": "3d"}, Ctx())).ui_actions[0]
    assert v["pitch"] == 55 and v["bearing"] == -14             # XI맵 '입체' 버튼과 같은 값
    assert run(M.map_view({"preset": "top"}, Ctx())).ui_actions[0]["pitch"] == 0
    assert run(M.map_layer({"layer": "imagery", "on": True}, Ctx())).ui_actions == [{"op": "map_layer", "layer": "imagery", "on": True}]
    assert run(M.map_layer({"layer": "results", "on": False}, Ctx())).ui_actions[0]["on"] is False


def test_route_map_single_action_only():
    c = Ctx()
    assert run(M.route_map("구례군으로 이동해 줘", c))["tool"] == "map_region"
    assert run(M.route_map("지도 확대해 줘", c)) == {"tool": "map_zoom", "args": {"delta": 1}}
    assert run(M.route_map("3D 시점으로 기울여 줘", c))["args"] == {"preset": "3d"}
    assert run(M.route_map("영상 층 켜 줘", c))["args"] == {"layer": "imagery", "on": True}
    assert run(M.route_map("여수시 의심 필지 보여 줘", c)) is None          # 자료 질문은 기존 도구 경로
    assert run(M.route_map("남원시로 이동해서 3D로", c)) is None             # 섞이면 모델 경로


def test_guard_pass():
    assert M.GUARD_PASS.search("구례군으로 이동해")
    assert M.GUARD_PASS.search("충주시 전역 분석 실행해 줘")
    assert not M.GUARD_PASS.search("충주시 의심 필지 보여 줘")        # 자료 질문은 가드 그대로


# ── 분석 실행 ──────────────────────────────────────────────────────────
def _checks(same=None, others=(), ok=True):
    async def jobs(codes):
        return same, list(others)

    async def power():
        return {"ok": ok, "hot_now": 2 if not ok else 1, "max_hot": 1}
    return {"jobs": jobs, "power": power}


QUOTE_OK = {"allowed": True, "reasons": [], "emd_total": {"value": 16, "unit": "count", "basis": "recorded", "as_of": "x", "source": "s"},
            "eta_s": {"value": 900, "unit": "s", "basis": "estimate", "as_of": "x", "source": "s"}, "imagery": {"year": 2023},
            "power_budget": {"hold_reason": None}}


def test_analysis_run_submits_and_watches():
    http = Http({("POST", "/jobs/quote"): (200, QUOTE_OK), ("POST", "/jobs"): (202, {"job": {"id": "job_T1", "state": "queued"}})})
    out = run(A.analysis_run({"region": "구례군", "service": "비닐하우스"}, Ctx(http=http, checks=_checks())))
    ops = [a["op"] for a in out.ui_actions]
    assert ops == ["map_region", "analysis_watch"]
    w = out.ui_actions[1]
    assert w["job_id"] == "job_T1" and w["sgg_cd"] == "12730" and w["cls"] == "비닐하우스"
    body = http.calls[0][2]
    assert body["options"]["scope"] == "sgg" and body["options"]["sgg_cd"] == "12730" and body["demo"] is False
    assert [k for k, _, _ in out.envelopes] == ["emd_total"]       # 초 봉투(eta_s) 0 — 예상 소요는 업무 말로
    assert out.data["예상 소요"] == "약 15분" and "약 15분" in out.answer and "구례군" in out.answer
    assert not __import__("re").search(r"\d+(?:\.\d+)?\s?s|초", out.answer)       # '47.9s' · '900초' 같은 표기 0


def test_analysis_run_attaches_to_running_job_same_region():
    http = Http({})
    out = run(A.analysis_run({"region": "12730"}, Ctx(http=http, checks=_checks(same={"id": "job_RUN", "sgg": "12730"}))))
    assert out.ui_actions[1]["job_id"] == "job_RUN" and all(c[0] != "POST" for c in http.calls)   # 새로 내지 않는다(범위 문장 조회 GET 만)


def test_analysis_run_queues_like_button_when_others_run():
    """r3-xi 2차: 말로 분석도 화면 '전역 분석' 버튼과 같은 규칙 — 다른 지역 분석이 돌고 있어도 대기열에 넣는다(GPU 한 장은 대기열 · 작업기 게이트).
    답은 GPU 를 나눠 쓴다는 사실을 알리고, 혼자 쓸 때의 예상 소요는 말하지 않는다. 서버 거절(견적 power_budget)은 그대로 사용자 말로."""
    http = Http({("POST", "/jobs/quote"): (200, QUOTE_OK), ("POST", "/jobs"): (202, {"job": {"id": "job_Q", "state": "queued"}})})
    out = run(A.analysis_run({"region": "12730"}, Ctx(http=http, checks=_checks(others=[{"id": "job_X", "sgg": "52190"}]))))
    assert out.ui_actions[1]["job_id"] == "job_Q" and "대기열에 넣었습니다" in out.answer
    assert "다른 지역 AI 분석 1건과 GPU 한 장을 나눠" in out.answer and "약 15분" not in out.answer
    http2 = Http({("POST", "/jobs/quote"): (200, {"allowed": False, "reasons": ["power_budget"]})})
    with pytest.raises(ToolError) as e:
        run(A.analysis_run({"region": "12730"}, Ctx(http=http2, checks=_checks())))
    assert e.value.code == "power_budget" and "전력" in e.value.message
    assert all(c[1] != "/jobs" for c in http2.calls)                          # 거절이면 제출 0


def test_analysis_run_no_imagery_reason():
    http = Http({("POST", "/jobs/quote"): (200, {"allowed": False, "reasons": ["no_imagery"]})})
    with pytest.raises(ToolError) as e:
        run(A.analysis_run({"region": "43130"}, Ctx(http=http, checks=_checks())))
    assert e.value.code == "no_imagery" and "영상 등록" in e.value.message
    assert all(c[1] != "/jobs" for c in http.calls)


def test_analysis_allowed_and_route():
    assert A.allowed("analysis_run", P("lx", "staff")) and not A.allowed("analysis_run", P("tenant", "manager", "namwon"))
    assert A.allowed("survey_build", P("tenant", "manager", "namwon")) and not A.allowed("survey_build", P("lx", "sales"))
    c = Ctx()
    assert run(A.route_analyze("충주시 전역 분석 실행해 줘", c)) == {"tool": "analysis_run", "args": {"region": "43130"}}
    assert run(A.route_analyze("남원시 운봉읍 비닐하우스 분석해 줘", c))["args"]["service"] == "비닐하우스"   # 의심 조회로 새지 않는다
    assert run(A.route_analyze("여수시 실태조사 결과 만들어 줘", c))["tool"] == "survey_build"
    assert run(A.route_analyze("남원시 의심 필지 몇 건?", c)) is None
    assert run(A.route_analyze("전역 분석 실행해 줘", Ctx(context={"region": "52190"}))) == {"tool": "analysis_run", "args": {}}


def test_prepare_names_region_for_card():
    a = run(A.prepare({"region": "구례군"}, Ctx()))
    assert a["region"] == "12730" and "구례군" in a["region_name"]


def test_survey_build_running_is_not_error():
    http = Http({("POST", "/survey/build"): (409, {"error": {"code": "survey_build_running", "message": "만드는 중"}})})
    out = run(A.survey_build({"region": "12730"}, Ctx(http=http)))
    assert "이미" in out.data["상태"] and out.ui_actions[0]["op"] == "map_region"


# ── 영상 층 ────────────────────────────────────────────────────────────
def test_read_rgb_low_zoom_uses_fast_path():
    import rasterio
    from rasterio.io import MemoryFile
    from rasterio.transform import from_origin
    from rasterio.windows import Window
    from landxi_api import tiles
    arr = (np.arange(3 * 400 * 400) % 251).astype(np.uint8).reshape(3, 400, 400)
    with MemoryFile() as mf:
        with mf.open(driver="GTiff", width=400, height=400, count=3, dtype="uint8", crs="EPSG:5186", transform=from_origin(0, 400, 1, 1)) as ds:
            ds.write(arr)
        with mf.open() as ds:
            src, m = tiles._read_rgb(ds, Window(0, 0, 400, 400), 50, 50)        # 배율 8 → 가장 가까운 화소 2배 + 면적 평균
            assert src.shape == (3, 50, 50) and m.shape == (50, 50) and m.dtype == np.uint8 and m.max() == 255
            src2, _ = tiles._read_rgb(ds, Window(0, 0, 100, 100), 80, 80)        # 배율 1.25 → bilinear
            assert src2.shape == (3, 80, 80)


def test_tenant_cog_items_only_in_scope():
    from landxi_api.catalog import TENANT_RAW_IMAGERY, tenant_cog_items
    assert TENANT_RAW_IMAGERY is False                     # 기본 = 사용자 결정(09-24 R6) — 기관 빌드에 원본 영상 0
    items = [{"id": "img-a", "role": "imagery", "tier": "raw", "source": "cog", "sgg_cd": "52190", "path": "_work/a.vrt", "signed": False},
             {"id": "img-b", "role": "imagery", "tier": "raw", "source": "cog", "sgg_cd": "12130", "path": "_work/b.vrt", "signed": False},
             {"id": "img-c", "role": "imagery", "tier": "raw", "source": "pmtiles", "set": "imagery/img-c", "sgg_cd": "52190", "path": "x", "signed": True},
             {"id": "ext", "role": "imagery", "source": "external", "sgg_cd": None}]
    got = tenant_cog_items(items, "namwon", set())
    assert [i["id"] for i in got] == ["img-a", "img-c"] and got[0]["signed"] is True and got[0]["path"] is None
    assert got[1]["source"] == "cog" and got[1]["set"] == "cog/img-c"            # LX 전용 PMTiles 세트는 기관에 주지 않는다


# ── 1차 실증 보완: 분석 → 실태조사 잇기 · 지금 지역 차트 · XI맵 열기 ─────────────────────────────
def _rj(running=None, done=None, partial=None):
    async def f(codes):
        return {"running": running, "done": done, "partial": partial}
    return f


def test_survey_build_waits_while_analysis_runs():
    http = Http({})
    c = Ctx(http=http, checks={"region_jobs": _rj(running={"id": "job_R", "state": "running", "n": 5329})})
    out = run(A.survey_build({"region": "52770"}, c))
    assert http.calls == [] and "이어서 만듭니다" in out.answer          # AI 없이 필지만 적재(no_ai)하지 않는다


def test_survey_build_uses_done_job_and_skips_partial():
    http = Http({("POST", "/survey/build"): (202, {"job": {"id": "job_S"}, "note": None})})
    out = run(A.survey_build({"region": "52770"}, Ctx(http=http, checks={"region_jobs": _rj(done={"id": "job_D", "state": "done", "n": 9})})))
    assert http.calls[0][2] == {"sgg_cd": "52770", "job_id": "job_D"} and "만들고 있습니다" in out.answer
    http2 = Http({})
    out2 = run(A.survey_build({"region": "52750"}, Ctx(http=http2, checks={"region_jobs": _rj(partial={"id": "job_C", "state": "cancelled", "n": 7804})})))
    assert http2.calls == [] and "중간에 멈춰" in out2.answer            # 분석 안 한 곳이 의심으로 잡히지 않게


def test_route_survey_build_while_running_goes_to_wait():
    c = Ctx(checks={"region_jobs": _rj(running={"id": "job_R", "state": "running", "n": 0})})
    assert run(A.route_analyze("순창군 실태조사 결과 만들어 줘", c)) == {"tool": "survey_wait", "args": {"region": "52770"}}
    out = run(A.survey_wait({"region": "52770"}, Ctx()))
    assert "분석이 끝나면" in out.answer and out.envelopes == []


def test_route_chart_uses_current_map_region():
    c = Ctx(context={"region": "46810"})                                  # 지도 경계의 옛 코드도 받는다
    hit = run(A.route_analyze("읍면동별 차트로", c))
    assert hit == {"tool": "emd_chart", "args": {"region": "46810"}}
    assert run(A.route_analyze("강진군 의심 필지 읍면동별 차트로 보여 줘", Ctx()))["args"]["region"] == "12780"
    assert run(A.route_analyze("읍면동별 차트로", Ctx())) is None          # 지역을 모르면 모델이 되묻는다
    assert run(A.route_analyze("대장 읍면동별 차트로", c)) is None          # 대장 차트는 융합 도구
    assert run(A.route_analyze("규칙별 차트로", c)) is None


def test_emd_chart_detections_when_no_survey():
    async def st(codes):
        return "no_ai"

    async def cnt(codes):
        return [("인계면", 7715), ("동계면", 6236), ("적성면", 12)], {"id": "job_R", "state": "running"}
    out = run(A.emd_chart({"region": "52770"}, Ctx(checks={"survey_state": st, "emd_counts": cnt})))
    ch = [b for b in out.blocks if b["type"] == "chart"][0]
    assert [r["label"] for r in ch["rows"]] == ["인계면", "동계면", "적성면"] and ch["rows"][0]["env"] == "emd_1"
    vals = {k: e["value"] for k, _, e in out.envelopes}
    assert vals["emd_1"] == 7715 and vals["detected"] == 7715 + 6236 + 12       # 막대 합 = 합계 봉투(같은 출처)
    assert "{{detected}}" in out.answer and "이어서 만듭니다" in out.answer


def test_emd_chart_survey_done_uses_survey_stats(monkeypatch):
    from agent.tools import survey as SV
    from agent.tools import Out as O

    async def fake(args, ctx):
        o = O(source="s")
        o.env("suspects", "합", {"value": 3})
        o.env("emd_1", "a", {"value": 3})
        o.blocks.append({"type": "chart", "kind": "bar", "title": "t", "rows": [{"label": "강진읍", "env": "emd_1"}]})
        assert args == {"by": "emd", "region": "12780"}
        return o
    monkeypatch.setattr(SV, "survey_stats", fake)

    async def st(codes):
        return "done"
    out = run(A.emd_chart({"region": "46810"}, Ctx(checks={"survey_state": st})))
    assert out.blocks[0]["rows"][0]["label"] == "강진읍" and "{{suspects}}" in out.answer


def test_chain_tick_builds_once_per_done_job():
    class R:
        def __init__(self):
            self.h = {}

        async def hget(self, k, f):
            return self.h.get(f)

        async def hset(self, k, f, v):
            self.h[f] = v
    calls = []

    async def cands():
        return [{"id": "job_D", "sgg": "52770", "submitted_by": "u_lx_staff"}]

    async def build(x):
        calls.append(x["id"])
        return {"job": {"id": "job_S"}}
    r = R()
    got = run(A.chain_tick(cands, build, r))
    assert got[0]["state"] == "requested" and got[0]["survey_job"] == "job_S"
    run(A.chain_tick(cands, build, r))
    assert calls == ["job_D"]                                              # 같은 분석으로 두 번 만들지 않는다

    async def busy(x):
        raise ToolError("survey_build_running", "만드는 중", 409)
    r2 = R()
    assert run(A.chain_tick(cands, busy, r2))[0]["state"] == "retry"        # 만드는 중이면 다음 순찰에서 다시


def test_screen_open_route_and_action():
    hit = run(M.route_map("XI맵 열어 줘", Ctx(context={"region": "52190"})))
    assert hit == {"tool": "screen_open", "args": {}}
    out = run(M.screen_open({}, Ctx(context={"region": "52190"})))
    a = out.ui_actions[0]
    assert a["op"] == "screen_open" and a["href"] == "/landxi/v3/xi-clean/?region=52190" and "XI맵" in out.answer
    assert not M.allowed("screen_open", P("tenant", "manager", "namwon")) and M.allowed("screen_open", P("lx", "staff"))
    assert run(M.route_map("여수시로 XI맵 열어 줘", Ctx()))["args"] == {"region": "12130"}


def test_route_survey_build_partial_answers_without_card():
    c = Ctx(checks={"region_jobs": _rj(partial={"id": "job_C", "state": "cancelled", "n": 10})})
    hit = run(A.route_analyze("순창군 실태조사 결과 만들어 줘", c))
    assert hit == {"tool": "survey_wait", "args": {"region": "52770", "why": "partial"}}
    assert "중간에 멈춰" in run(A.survey_wait(hit["args"], Ctx())).answer


# ── 3차: 예상 시간 업무 말 · 타일 주소 기준 = 요청 호스트 ─────────────────────────
def test_eta_words_business_language():
    from agent.tools.jobs import eta_words
    assert eta_words(47.9) == "약 1분" and eta_words(14.6) == "약 1분"
    assert eta_words(493.7) == "약 8분" and eta_words(1069) == "약 18분" and eta_words(1500) == "약 25분"
    assert eta_words(4200) == "약 1시간 10분" and eta_words(3600) == "약 1시간"
    assert eta_words(47.9, "en") == "about 1 min" and eta_words(None) is None and eta_words("x") is None


def test_analysis_run_answer_has_no_seconds_and_lints_clean():
    from agent import lint
    q = {**QUOTE_OK, "eta_s": {"value": 47.9, "unit": "s", "basis": "estimate", "as_of": "x", "source": "s"}}
    http = Http({("POST", "/jobs/quote"): (200, q), ("POST", "/jobs"): (202, {"job": {"id": "job_T2", "state": "queued"}})})
    out = run(A.analysis_run({"region": "구례군"}, Ctx(http=http, checks=_checks())))
    assert "약 1분" in out.answer and "47.9" not in out.answer and "읍면동 16곳" in out.answer
    # 모델 경로가 '약 45분'을 옮겨도 검증기가 '확인되지 않음'으로 바꾸지 않는다
    q2 = {**QUOTE_OK, "eta_s": {"value": 2700, "unit": "s", "basis": "estimate", "as_of": "x", "source": "s"}}
    http2 = Http({("POST", "/jobs/quote"): (200, q2), ("POST", "/jobs"): (202, {"job": {"id": "job_T3", "state": "queued"}})})
    out2 = run(A.analysis_run({"region": "구례군"}, Ctx(http=http2, checks=_checks())))
    assert out2.data["예상 소요"] == "약 45분"
    lr = lint.lint("결과까지 약 45분 걸립니다.", {}, out2.whitelist)
    assert not lr.unverified


def test_jobs_quote_no_internal_metrics():
    from agent.tools import jobs as J
    q = {"allowed": True, "reasons": [], "pool": "gpu", "area_km2": {"value": 3.2, "unit": "km2", "basis": "measured", "as_of": "x", "source": "s"},
         "shards_env": {"value": 120, "unit": "count", "basis": "measured", "as_of": "x", "source": "s"},
         "gpu_s": {"value": 88.1, "unit": "gpu_s", "basis": "estimate", "as_of": "x", "source": "s"},
         "eta_s": {"value": 47.9, "unit": "s", "basis": "estimate", "as_of": "x", "source": "s"}}

    async def plan(args, ctx):
        return [{"kind": "infer", "model_id": "m1", "imagery_id": "i1", "aoi": {}, "options": {}, "demo": False, "label": "t",
                 "_meta": {"model": "m1", "imagery": "i1", "gsd_m": 0.25, "cls": "비닐하우스"}}]
    orig = J.plan_body
    J.plan_body = plan
    try:
        out = run(J.jobs_quote({}, Ctx(http=Http({("POST", "/jobs/quote"): (200, q)}))))
    finally:
        J.plan_body = orig
    assert [k for k, _, _ in out.envelopes] == ["area_km2"] and out.data["예상 소요"] == "약 1분"


class _Req:
    def __init__(self, host, scheme="http"):
        self.headers = {"host": host}
        self.url = type("U", (), {"scheme": scheme})()


def test_tile_urls_follow_request_host():
    from landxi_api import catalog as C, config
    pb = config.PUBLIC_BASE
    u = pb + "/tiles/cog/img-x/{z}/{x}/{y}.webp?exp=1&sig=a"
    assert C.rebase(u, C.base_of(_Req("127.0.0.1:8700"))) == "http://127.0.0.1:8700/tiles/cog/img-x/{z}/{x}/{y}.webp?exp=1&sig=a"
    assert C.rebase(u, C.base_of(_Req("localhost.:8700"))).startswith("http://localhost.:8700/tiles/cog/")
    assert C.rebase([u], C.base_of(_Req("127.0.0.1:8700")))[0].startswith("http://127.0.0.1:8700/")
    # 믿을 수 없는 호스트 이름(헤더 주입)은 PUBLIC_BASE 그대로
    assert C.rebase(u, C.base_of(_Req("evil.example.com"))) == u
    assert C.rebase(u, C.base_of(_Req("localhost:8700/x?"))) == u
    assert C.base_of(None) == pb and C.rebase(None, "http://127.0.0.1:8700") is None
    assert C.rebase("https://other/tiles/a", "http://127.0.0.1:8700") == "https://other/tiles/a"


def test_stream_on_api_host_guard():
    from landxi_api import events as E

    class R:
        def __init__(self, host, origin):
            self.headers = {"host": host, **({"origin": origin} if origin else {})}
    page = "http://localhost:4173"
    assert E.stream_on_api_host(R("localhost:8700", page)) and E.stream_on_api_host(R("127.0.0.1:8700", page))
    assert not E.stream_on_api_host(R("s1.localhost:8700", page))          # 스트림 전용 이름은 통과
    assert not E.stream_on_api_host(R("localhost:8700", None))              # 서버 간 중계(Origin 없음) 통과
    assert not E.stream_on_api_host(R("localhost:8700", "http://evil.example"))   # 허용 밖 오리진은 기존 403 판정
    assert E.moved_stream().status_code == 204
