"""r3-xi — XI맵 AI 분석 영상 범위 정직화(M12) · 등록 영상(COG) 지역 읍면동·그린 범위 분석(M11) · 규칙 코드 0(M13) ·
확인 카드 지역 이름 · 읍면동 이동. LLM 호출 0 · GPU 0 · 작업 제출 0(견적만).

- 범위 봉투: coverage · emd_covered · emd_total 은 workers.scheduler.sgg_scope 한 곳 — 견적(POST /jobs/quote scope sgg) ·
  확인 카드(GET /jobs/scope) · 작업 옵션이 같은 값 · 같은 문장.
- 읍면동 수 = 영상 footprint 와 1 ha 이상 겹치는 읍면동 수 — PostGIS(ST_Area(ST_Intersection)) 대조.
- 읍면동 · 그린 범위 견적은 영상 id 없이 보내도 서버가 등록 영상(COG)을 고른다 · 영상 밖만 no_imagery.
"""
import asyncio
import json
import re
import sys
from pathlib import Path

import httpx
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from landxi_api import config  # noqa: E402

WEB = ROOT.parent / "landxi" / "v3" / "xi-clean"
PARTIAL = [("48860", "img-48860-2023-aerial"), ("47280", "img-47280-2023-aerial")]     # 경남 산청 · 경북 문경(영상이 일부만 덮음)
COG = [("48860", "img-48860-2023-aerial"), ("47280", "img-47280-2023-aerial")]


def run(c):
    return asyncio.run(c)


# ── 1. 범위 문장(plan 4절 기본값) ─────────────────────────────────────
def test_scope_words_partial_full_en():
    from landxi_api.jobs import scope_words, scope_block
    t = scope_words(0.0568, 3, 11)
    assert t == "영상이 있는 곳만 분석합니다 — 읍면동 3곳, 시군구 면적의 약 6%"
    assert "전역" not in t
    assert scope_words(0.004, 1, 20) == "영상이 있는 곳만 분석합니다 — 읍면동 1곳, 시군구 면적의 1% 미만"
    assert scope_words(0.97, 12, 12) == "시군구 전역을 분석합니다 — 읍면동 12곳"            # 95% 이상일 때만 '전역'
    assert scope_words(0.9499, 11, 12).startswith("영상이 있는 곳만")
    assert scope_words(0.0568, 3, 11, "en") == "Analyzing only where imagery exists — 3 of 11 districts, about 6% of the area"
    assert scope_words(None, 3, 11) is None                                             # 값이 없으면 지어내지 않는다
    b = scope_block({"coverage": 0.0568, "emd_covered": 3, "emd_total": 11, "emds": []})
    assert b["coverage"]["value"] == 0.0568 and b["emd_covered"]["value"] == 3 and b["emd_total"]["value"] == 11
    assert b["rest"] == "나머지는 영상 등록 후 분석" and b["full"] is False
    assert all(b[k]["basis"] in ("measured", "recorded") for k in ("coverage", "emd_covered", "emd_total"))


# ── 2. 읍면동 계수 = DB(PostGIS) 대조 · 비율 = 전역 계획과 같은 값 ────────────────────
def _db_emd_count(sgg: str, img: str) -> tuple[int, float]:
    import psycopg
    from landxi_api.regions import emd_fc
    fc = emd_fc(sgg)
    with psycopg.connect(config.PG_WORKER_DSN) as c:
        fp = c.execute("SELECT ST_AsGeoJSON(footprint) FROM imagery WHERE id=%s", (img,)).fetchone()[0]
        n = 0
        for f in fc["features"]:
            a = c.execute("SELECT ST_Area(ST_Intersection(ST_Transform(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(%s),4326)),5186), "
                          "ST_Transform(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(%s),4326)),5186)))", (json.dumps(f["geometry"]), fp)).fetchone()[0]
            n += 1 if (a or 0) >= 10_000 else 0
        land = c.execute("SELECT ST_Area(ST_Transform(ST_Union(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(g),4326))),5186)) FROM unnest(%s::text[]) g",
                         ([json.dumps(f["geometry"]) for f in fc["features"]],)).fetchone()[0]
    return n, land


@pytest.mark.parametrize("sgg,img", PARTIAL)
def test_emd_covered_matches_db_and_plan(sgg, img):
    from workers.scheduler import plan_sgg, sgg_scope
    sc = sgg_scope(img, sgg)
    n_db, _ = _db_emd_count(sgg, img)
    assert sc["emd_covered"] == n_db and 0 < sc["emd_covered"] < sc["emd_total"]
    _, _, info = plan_sgg(img, sgg)
    assert sc["coverage"] == info["coverage"] and sc["coverage"] < 0.95            # 비율 = 작업 계획(coverage)과 같은 값 · 일부만 덮음


# ── 3. 등록 영상(COG)이 읍면동 · 그린 범위 후보 ─────────────────────────────────
def _emd_geom(sgg: str, img: str):
    from workers.scheduler import sgg_scope
    from landxi_api.regions import emd_fc
    top = sgg_scope(img, sgg)["emds"][0]["emd_cd"]
    return next(f["geometry"] for f in emd_fc(sgg)["features"] if f["properties"]["emd_cd"] == top)


class _P:
    realm, role, tenant_id, user_id = "lx", "staff", None, "u_test"


async def _auto(geom):
    from landxi_api import deps
    from landxi_api.jobs import _auto_imagery
    try:
        return await _auto_imagery(_P(), geom)
    finally:
        pool = getattr(deps, "_pool", None) or getattr(deps, "POOL", None)
        if pool is not None and hasattr(pool, "close"):
            try:
                await pool.close()
            except Exception:
                pass
        for k in ("_pool", "POOL", "_pools"):
            if hasattr(deps, k):
                try:
                    setattr(deps, k, None if k != "_pools" else {})
                except Exception:
                    pass


@pytest.mark.parametrize("sgg,img", COG)
def test_cog_is_candidate_for_emd_frame(sgg, img):
    got = run(_auto(_emd_geom(sgg, img)))
    assert got["imagery_id"] == img and got["aoi"]["type"] == "Polygon" and got["coverage"] > 0


def test_frame_outside_imagery_is_no_imagery():
    box = {"type": "Polygon", "coordinates": [[[124.20, 33.20], [124.21, 33.20], [124.21, 33.21], [124.20, 33.21], [124.20, 33.20]]]}   # 바다 위
    assert run(_auto(box))["imagery_id"] is None


# ── 4. 답 · 확인 카드 · 진행판 = 같은 범위 문장(도구 값 그대로) ───────────────────────────
class _Res:
    def __init__(self, st, j):
        self.status_code, self._j = st, j

    def json(self):
        return self._j


class _Http:
    def __init__(self, routes):
        self.routes, self.calls = routes, []

    async def request(self, method, path, **kw):
        self.calls.append((method, path))
        st, j = self.routes.get((method, path), (404, {"error": {"code": "not_found"}}))
        return _Res(st, j)


class _Ctx:
    def __init__(self, http=None, lang="ko"):
        class P:
            realm, role, tenant_id, user_id = "lx", "staff", None, "u_test"
        self.principal, self.context, self.http, self.lang = P(), {}, http, lang

        async def jobs(codes):
            return None, []

        async def power():
            return {"ok": True}
        self.state = {"_c2xi_checks": {"jobs": jobs, "power": power}}


def _scope_payload():
    from landxi_api.jobs import scope_block
    b = scope_block({"coverage": 0.0568, "emd_covered": 3, "emd_total": 11, "emds": []})
    return b


def test_answer_card_board_same_sentence():
    from agent.tools.ext import analyze as A
    b = _scope_payload()
    quote = {"allowed": True, "reasons": [], "coverage": b["coverage"], "emd_covered": b["emd_covered"], "emd_total": b["emd_total"],
             "scope": {k: b[k] for k in ("text", "text_en", "rest", "rest_en", "full")},
             "eta_s": {"value": 70, "unit": "s", "basis": "estimate", "as_of": "x", "source": "s"}, "imagery": {"year": 2023}, "power_budget": {}}
    scope_resp = {"sgg_cd": "48860", "region_name": "산청군", **b}
    http = _Http({("POST", "/jobs/quote"): (200, quote), ("POST", "/jobs"): (202, {"job": {"id": "job_T", "state": "queued"}}),
                  ("GET", "/jobs/scope/48860"): (200, scope_resp)})
    card = run(A.prepare({"region": "산청군"}, _Ctx(http)))
    out = run(A.analysis_run({"region": "48860"}, _Ctx(http)))
    s = b["text"]
    assert "산청군" in card["title"] and s in (card.get("line") or "")                # 확인 카드: 제목(지역 이름 · 사용자 말) + 둘째 줄 범위 문장(확인 16차 규칙 ⑦)
    assert s in out.answer and "나머지는 영상 등록 후 분석" in out.answer                  # 답
    w = next(a for a in out.ui_actions if a["op"] == "analysis_watch")
    assert w["scope_text"] == s and w["scope_rest"] == b["rest"]                     # 진행판(도구 값 → 화면)
    assert "전역" not in out.answer and "전역" not in card["title"] and "전역" not in json.dumps(out.data, ensure_ascii=False)
    keys = [k for k, _, _ in out.envelopes]
    assert {"coverage", "emd_covered", "emd_total"} <= set(keys)
    from agent import lint
    assert not lint.lint(out.answer, {}, out.whitelist).unverified                    # 답의 숫자는 도구 값(검증기 통과)
    en = run(A.analysis_run({"region": "48860"}, _Ctx(http, "en")))
    assert b["text_en"] in en.answer and "region-wide" not in en.answer


def test_prepare_without_http_keeps_region_name():
    from agent.tools.ext import analyze as A
    a = run(A.prepare({"region": "구례군"}, _Ctx(None)))
    assert a["region"] == "12730" and "구례군" in a["title"] and "전역" not in a["title"]
    assert A.SAY["analysis_run"] == "AI 분석 실행"


# ── 5. 읍면동 이동 ───────────────────────────────────────────────────
def test_emd_names_and_route():
    from agent.tools.ext import map as M
    assert M.emd_names_in("옴천면으로 이동") == ["옴천면"]
    assert M.emd_names_in("시천면 보여 줘") == ["시천면"]
    assert M.emd_names_in("화면 확대해 줘") == [] and M.emd_names_in("평면으로 이동") == []

    class C:
        principal = _P()
        context: dict = {}
        state: dict = {}
    r = run(M.route_map("옴천면으로 이동", C()))
    assert r == {"tool": "map_region", "args": {"emd": "옴천면"}}
    r2 = run(M.route_map("시천면 보여 줘", C()))
    assert r2 == {"tool": "map_region", "args": {"emd": "시천면"}}


@pytest.mark.parametrize("emd,sgg", [("옴천면", "12780"), ("시천면", "48860")])
def test_map_region_goes_to_emd(emd, sgg):
    from agent.tools.ext import map as M

    class C:
        principal = _P()
        context: dict = {}
        state: dict = {}
    out = run(M.map_region({"emd": emd}, C()))
    a = out.ui_actions[0]
    assert a["sgg_cd"] == sgg and a["emd_name"] == emd and a["emd_cd"].startswith(sgg) and len(a["emd_bbox"]) == 4
    assert a["bbox"] == a["emd_bbox"] and a["sgg_bbox"] != a["emd_bbox"]


# ── 6. 화면 코드: 규칙 코드로 떨어지지 않는다(M13) · 영상은 서버가 고른다(M11) ──────────────────
def test_web_no_rule_code_fallback_and_server_pick():
    app = (WEB / "app.js").read_text(encoding="utf-8")
    an = (WEB / "analyze.js").read_text(encoding="utf-8")
    assert "|| r.k" not in app and "|| rule }" not in app and "|| f.rule)" not in app and "f.rule || '—'" not in app
    assert "ruleName(" in app and "/survey/rules" in app
    assert "pickImagery" not in an and "source === 'pmtiles'" not in an
    assert "scope_text" in an and "xa-rest" in an
    assert "kit:agent-action-done', { detail: { op: a.op, ok, ...(reason" in app


# ── 7. 게이트웨이(떠 있을 때만) — 견적 · 확인 카드 범위가 같은 값 · COG 읍면동 견적 허용 ──────────────────
@pytest.fixture(scope="module")
def staff():
    B = f"http://127.0.0.1:{config.API_PORT}/api/v1"
    try:
        if not httpx.get(B + "/health", timeout=5).json().get("ok"):
            pytest.skip("게이트웨이 미기동")
        t = httpx.post(B + "/auth/login", json={"realm": "lx", "login": "test@lx.or.kr", "password": config.DEV_PASSWORD}, timeout=30).json()["token"]
    except Exception:
        pytest.skip("게이트웨이 미기동")
    return B, {"authorization": "Bearer " + t}


@pytest.mark.parametrize("sgg,img", PARTIAL)
def test_live_quote_and_card_same_scope(staff, sgg, img):
    B, H = staff
    q = httpx.post(B + "/jobs/quote", json={"kind": "infer", "options": {"scope": "sgg", "sgg_cd": sgg}}, headers=H, timeout=120).json()
    c = httpx.get(B + f"/jobs/scope/{sgg}", headers=H, timeout=60).json()
    if "scope" not in q:
        pytest.skip("게이트웨이가 이번 코드로 재기동되지 않음")
    for k in ("coverage", "emd_covered", "emd_total"):
        assert q[k]["value"] == c[k]["value"]
    assert q["scope"]["text"] == c["text"] and "영상이 있는 곳만" in c["text"] and "전역" not in c["text"]
    assert re.search(r"읍면동 (\d+)곳", c["text"]).group(1) == str(c["emd_covered"]["value"])


@pytest.mark.parametrize("sgg,img", COG)
def test_live_emd_quote_uses_cog(staff, sgg, img):
    B, H = staff
    g = _emd_geom(sgg, img)
    q = httpx.post(B + "/jobs/quote", json={"kind": "infer", "aoi": g, "options": {"chip": 1024, "overlap": 0.125, "live": True, "max_km2": 150}},
                   headers=H, timeout=120).json()
    if "imagery" not in q:
        pytest.skip("게이트웨이가 이번 코드로 재기동되지 않음")
    assert q["imagery"]["id"] == img and q["model_id"] and "no_imagery" not in q["reasons"] and q["shards"] > 0


# ── 8. 2차(실증 1차 부족분) — 붙는 답의 범위 문장 · 말로/버튼 한 규칙 · 탐지 수 한 출처 · 계획 줄 ──────────────────
def _jobs_fn(same=None, others=()):
    async def jobs(codes):
        return same, list(others)
    return jobs


def test_attach_answer_has_same_scope_sentence():
    """이미 진행 중인 분석에 붙을 때도 답에 그 작업의 범위 문장(작업 옵션 scope_text) — 확인 카드 · 진행판과 같은 문장(must_fix 1)."""
    from agent.tools.ext import analyze as A
    b = _scope_payload()
    job = {"id": "job_RUN", "sgg": "48860", "scope": "sgg", "scope_text": b["text"], "scope_rest": b["rest"], "scope_text_en": b["text_en"]}
    ctx = _Ctx(_Http({}))
    ctx.state["_c2xi_checks"]["jobs"] = _jobs_fn(same=job)
    out = run(A.analysis_run({"region": "48860"}, ctx))
    assert "이미 진행 중" in out.answer and b["text"] in out.answer and "나머지는 영상 등록 후 분석" in out.answer
    w = next(a for a in out.ui_actions if a["op"] == "analysis_watch")
    assert w["job_id"] == "job_RUN" and w["scope_text"] == b["text"]                 # 진행판도 같은 문장
    assert "전역" not in out.answer
    from agent import lint
    assert not lint.lint(out.answer, {}, out.whitelist).unverified
    # 옵션에 문장이 없는 옛 작업 · 영어 → GET /jobs/scope 값 그대로
    http = _Http({("GET", "/jobs/scope/48860"): (200, {"sgg_cd": "48860", **b})})
    ctx2 = _Ctx(http, "en")
    ctx2.state["_c2xi_checks"]["jobs"] = _jobs_fn(same={"id": "job_OLD", "sgg": "48860", "scope": "sgg"})
    en = run(A.analysis_run({"region": "48860"}, ctx2))
    assert b["text_en"] in en.answer and "already running" in en.answer and ("GET", "/jobs/scope/48860") in http.calls


def test_voice_queues_like_button_and_says_sharing():
    """다른 지역 분석이 돌고 있어도 말로 분석은 대기열에 넣는다(버튼과 한 규칙) — 범위 문장 + 'GPU 를 나눠 씀', 혼자일 때의 예상 소요는 빼기."""
    from agent.tools.ext import analyze as A
    b = _scope_payload()
    quote = {"allowed": True, "reasons": [], "coverage": b["coverage"], "emd_covered": b["emd_covered"], "emd_total": b["emd_total"],
             "scope": {k: b[k] for k in ("text", "text_en", "rest", "rest_en", "full")},
             "eta_s": {"value": 70, "unit": "s", "basis": "estimate", "as_of": "x", "source": "s"}, "imagery": {"year": 2023}, "power_budget": {"hold_reason": "power_budget"}}
    http = _Http({("POST", "/jobs/quote"): (200, quote), ("POST", "/jobs"): (202, {"job": {"id": "job_N", "state": "queued"}})})
    ctx = _Ctx(http)
    ctx.state["_c2xi_checks"]["jobs"] = _jobs_fn(others=[{"id": "a", "sgg": "48870"}, {"id": "b", "sgg": "52190"}])
    out = run(A.analysis_run({"region": "48860"}, ctx))
    assert ("POST", "/jobs") in http.calls and b["text"] in out.answer
    assert "다른 지역 AI 분석 2건과 GPU 한 장을 나눠 쓰므로" in out.answer and "약 1분" not in out.answer
    from agent import lint
    assert not lint.lint(out.answer, {}, out.whitelist).unverified
    import inspect
    assert "queue_busy" not in inspect.getsource(A.preflight) and not hasattr(A, "LONG_JOBS_MAX")


def test_plan_line_label_not_region_wide():
    """확인 카드 위 계획 줄(kit i18n tool.analysis_run)에 '전역' 0 — 영상이 17%만 덮는 곳에서도 보이는 줄(must_fix 2)."""
    ko = json.loads((ROOT.parent / "landxi" / "v3" / "kit" / "i18n" / "ko.json").read_text(encoding="utf-8"))
    assert ko["tool.analysis_run"] == "AI 분석 실행" and "전역" not in ko["tool.analysis_run"]


def test_job_counts_done_uses_final_not_shard_sum(monkeypatch):
    """끝난 작업의 jobs.counts = 마감(전역 NMS) 수 — 칸별 합(겹침 포함)이 남지 않는다(must_fix 3 · 부여 11,999 ↔ 9,670)."""
    from workers import scheduler as S

    class R:
        def hgetall(self, k):
            return {"building": "3322", "farmland": "4933", "greenhouse": "3690", "parking": "54"}
    monkeypatch.setattr(S, "r", lambda: R())
    fin = {"building": 2930, "farmland": 3701, "greenhouse": 2988, "parking": 51}
    assert S.job_counts("j", {"state": "done", "counts": json.dumps(fin)}) == fin
    clean = {"n": 9675, "by": {"building": 2931, "farmland": 3703, "greenhouse": 2990, "parking": 51}}
    assert S.job_counts("j", {"state": "running", "counts": "{}", "counts_clean": json.dumps(clean)}) == clean["by"]
    assert sum(S.job_counts("j", {"state": "running"}).values()) == 11999                 # 정리 전이면 칸별 합(예전과 같음)


def test_clean_count_drops_chip_overlap_duplicates(tmp_path, monkeypatch):
    """겹쳐 도는 두 칸이 같은 건물을 함께 잡으면 하나로 센다 · 다른 종류 · 떨어진 것은 따로 · 4 ㎡ 미만 제외(마감과 같은 규칙)."""
    from workers import scheduler as S

    def sq(x, y, d=0.0002):
        return {"type": "Polygon", "coordinates": [[[x, y], [x + d, y], [x + d, y + d], [x, y + d], [x, y]]]}

    def fc(*fs):
        return {"type": "FeatureCollection", "features": [{"type": "Feature", "geometry": g, "properties": {"cls": c, "cls_en": e, "conf": p}}
                                                          for g, c, e, p in fs]}
    (tmp_path / "a.geojson").write_text(json.dumps(fc((sq(127.0, 36.0), "건물", "building", 0.9), (sq(127.01, 36.0), "건물", "building", 0.8))), encoding="utf-8")
    (tmp_path / "b.geojson").write_text(json.dumps(fc((sq(127.00002, 36.00001), "건물", "building", 0.7),       # a 의 첫 건물과 같은 것(겹침 칸)
                                                      (sq(127.00002, 36.00001), "경작지", "farmland", 0.6),     # 다른 종류는 따로
                                                      (sq(127.02, 36.0, 0.00001), "건물", "building", 0.9))),   # 약 1 ㎡ — 제외
                                        encoding="utf-8")
    events = []

    class R:
        def __init__(self):
            self.h = {}

        def smembers(self, k):
            return {"a", "b"}

        def hset(self, k, f, v):
            self.h[f] = v
    rr = R()
    monkeypatch.setattr(S, "r", lambda: rr)
    monkeypatch.setattr(S, "emit", lambda jid, ev, d: events.append((ev, d)))
    monkeypatch.setattr(S.bus, "shard_dir", lambda t, j, d: tmp_path)
    c = S.CleanCount("job_t", {"tenant_id": "lx"})
    c.step()
    assert c.n == 3 and c.by == {"building": 2, "farmland": 1} and c.cls == {"건물": 2, "경작지": 1}
    assert events and events[-1][0] == "counts.clean" and events[-1][1]["n"] == 3 and json.loads(rr.h["counts_clean"])["shards"] == 2
    c.step()
    assert len(events) == 1                                                            # 바뀐 게 없으면 다시 보내지 않는다


def test_board_uses_clean_count():
    an = (WEB / "analyze.js").read_text(encoding="utf-8")
    assert "'counts.clean'" in an and "[...JOB_EVENTS, 'counts.clean']" in an
    assert "clean != null ? clean" in an


def test_gpu_gate_remembers_other_gpu_hot_while_idle():
    """쉬는 작업기도 다른 GPU 고부하를 기억해(히스테리시스) vLLM 생성의 한 순간 틈에 첫 묶음을 시작하지 않는다(GPU 두 장 동시 100 W 초과 0)."""
    src = (ROOT / "workers" / "gpu_worker.py").read_text(encoding="utf-8")
    loop = src[src.index("def nvml_loop"):src.index("def other_gpu_hot")]
    assert 'state["other_last_hot"]' in loop and "OTHER_HOT_W" in loop


# ── 9. 3차(실증 2차 부족분) — 실태조사 적재 중에도 머리 · 막대 누르기가 동작 ──────────────────
def _app():
    return (WEB / "app.js").read_text(encoding="utf-8")


def test_stats_building_is_not_no_result():
    """적재 중(state 'building') 집계는 빈 칸 — 캐시하지 않고, 가진 목록을 지우지 않고, 끝날 때까지 다시 받는다."""
    app = _app()
    swr = app[app.index("function swr("):app.index("const PRE =")]
    assert "j?.state !== 'building'" in swr and "c.j?.state !== 'building'" in swr
    us = app[app.index("function useStats("):app.index("let statsT")]
    assert "S.statsBuilding = !emdSt.failed && emdSt.state === 'building'" in us
    assert "if (!emdSt.failed && !S.statsBuilding)" in us and "watchStats()" in us
    assert "ruleSt.state !== 'building'" in us
    ws = app[app.index("function watchStats("):app.index("async function regionStats(")]
    assert "/survey/stats?by=emd" in ws and "refresh()" in ws and "15000" in ws


def test_hud_counting_not_empty_while_building():
    """지금 시군구 칸은 그 시군구만 따로 받는다(sgg=) · 그 시군구가 만드는 중이면 '집계 중'(아직 결과가 없습니다 아님)."""
    app = _app()
    rs = app[app.index("async function regionStats("):app.index("/** 규칙 이름(사용자 말)")]
    assert "by: 'emd', sgg: r.code" in rs and "=== 'building'" in rs
    rf = app[app.index("async function refresh()"):app.index("async function summaryBig(")]
    assert rf.index("regionStats(S.region)") < rf.index("q = hudQuery(S.region, S.cond)")
    assert "hudState(big, 'counting')" in rf
    assert rf.index("hudState(big, 'counting')") < rf.index("hudState(big, 'empty')")
    hs = app[app.index("function hudState("):app.index("let failToast")]
    assert "'집계 중'" in hs and "st !== 'counting'" in hs


def _node():
    import shutil
    n = shutil.which("node")
    if not n:
        pytest.skip("node 없음")
    return n


def _chart_harness(tmp_path, body: str) -> str:
    """app.js 의 막대 누르기 함수(emdMatch · emdOf · chartEmd)를 떼어 node 로 돌린다(가짜 api · 지역)."""
    import subprocess
    app = _app()
    seg = app[app.index("/** 읍면동 이름 · 코드로 목록에서 찾기"):app.index("document.addEventListener('kit:chart-pick'")]
    js = (
        "const norm = (s) => String(s || '').split(' ').join('').toLowerCase();\n"
        "const K = { devlog() {} };\n"
        "const S = { remd: [], emds: [], region: null, regions: [] };\n"
        "const regionEmds = () => [];\n"
        "const byCode = (cd) => S.regions.find((r) => String(cd).startsWith(r.code)) || null;\n"
        "const CALLS = [];\n"
        "const DB = { '41550': [['4155035000', '금광면'], ['4155036000', '죽산면']], '48860': [['4886031000', '시천면'], ['4886032000', '삼장면']] };\n"
        "const api = async (p) => { CALLS.push(p); const m = p.split('/'); if (m[1] !== 'regions' || m[3] !== 'emd') throw new Error(p);"
        " return { features: (DB[m[2]] || []).map(([cd, nm]) => ({ properties: { emd_cd: cd, name: nm, bbox: [0, 0, 1, 1] }, geometry: null })) }; };\n"
        + seg + "\n" + body
    )
    f = tmp_path / "h.mjs"
    f.write_text(js, encoding="utf-8")
    r = subprocess.run([_node(), str(f)], capture_output=True, text=True, encoding="utf-8", timeout=60)
    assert r.returncode == 0, r.stderr
    return r.stdout.strip()


def test_chart_pick_finds_emd_without_stats(tmp_path):
    """집계 목록(S.emds)이 비어 있어도(적재 중) 막대 누르기가 읍면동을 찾는다:
    지금 시군구 경계 · 답에 나온 다른 시군구 경계(서버) · 끝내 없으면 null(화면은 알림)."""
    out = _chart_harness(tmp_path, """
S.regions = [{ code: '41550', name: '안성시', sido: '경기도' }, { code: '48860', name: '산청군', sido: '경상남도' }];
S.region = S.regions[1];
(async () => {
  const a = await chartEmd('', '시천면', '');                                   // 지금 시군구(산청) — 집계 목록 없이 경계 조회로
  const b = await chartEmd('', '금광면', '안성시 읍면동별 의심 필지입니다');       // 답이 안성 — 산청에 있어도 안성 경계에서
  const c = await chartEmd('', '없는면', '안성시');                               // 어디에도 없음
  console.log(JSON.stringify({ a: [a.e.cd, a.r.code], b: [b.e.cd, b.r.code], c, calls: CALLS }));
})();
""")
    j = json.loads(out)
    assert j["a"] == ["4886031000", "48860"]
    assert j["b"] == ["4155035000", "41550"]
    assert j["c"] is None
    assert "/regions/48860/emd" in j["calls"] and "/regions/41550/emd" in j["calls"]


def test_chart_pick_tells_user_when_not_found():
    app = _app()
    h = app[app.index("document.addEventListener('kit:chart-pick'"):app.index("function hasAnswer()")]
    assert "await chartEmd(" in h and "K.toast(" in h and "찾지 못했습니다" in h and "ok: false" in h
    click = app[app.index("const b = e.target.closest?.('.k-ck .k-bar')"):app.index("/** 읍면동 이름 · 코드로")]
    assert ".k-ck-bt" in click and "hint" in click


def test_tile_render_header_ascii():
    """영상 타일 응답 머리 값은 ASCII 만(한글이면 게이트웨이가 500 — 원본 경로로 그리는 영상)."""
    src = (ROOT / "landxi_api" / "tiles.py").read_text(encoding="utf-8")
    line = next(l for l in src.splitlines() if '"X-LX-Render"' in l)
    val = line.split('"X-LX-Render":', 1)[1].split("}", 1)[0]
    assert val.isascii()


def test_live_region_stats_scoped(staff):
    """화면이 적재 중에 쓰는 시군구 한정 집계(?by=emd&sgg=) — 산청 칸이 읍면동 코드 · 범위와 함께 온다."""
    B, H = staff
    j = httpx.get(B + "/survey/stats", params={"by": "emd", "sgg": "48860"}, headers=H, timeout=60).json()
    if j.get("state") == "building":
        pytest.skip("산청 실태조사를 만드는 중")
    items = [i for i in j["items"] if i.get("cd") and len(i.get("bbox") or []) == 4]
    assert items and all(str(i["cd"]).startswith("48") for i in items)
    assert any(i["key"] == "시천면" for i in items)
