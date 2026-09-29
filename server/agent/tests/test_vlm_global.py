"""c2-vlm-global — 영상 조각(crop) · 비전 세 줄 파싱 · 도구 권한·관할 · 직행 · 해외 결과 도구(DB·GPU 없이)."""
import asyncio
import json
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from agent.tools import Out, ToolError  # noqa: E402
from agent.tools.ext import global_ as G  # noqa: E402
from agent.tools.ext import vlm as V  # noqa: E402
from agent.vlm import crop as C  # noqa: E402
from agent.vlm import prompt as P  # noqa: E402
from landxi_api.deps import CAPS, Principal  # noqa: E402

NL = chr(10)
NW = Principal("tenant", "manager", "namwon", "u_nw", caps=CAPS[("tenant", "manager")])
GJ = Principal("tenant", "manager", "gwangju-jeonnam", "u_gj", caps=CAPS[("tenant", "manager")])
KG = Principal("tenant", "manager", "kgz-agri", "u_kg", caps=CAPS[("tenant", "manager")])
ST = Principal("lx", "staff", None, "u_st", caps=CAPS[("lx", "staff")])
GUEST = Principal()
SQUARE = {"type": "Polygon", "coordinates": [[[127.5140, 35.4320], [127.5150, 35.4320], [127.5150, 35.4328], [127.5140, 35.4328], [127.5140, 35.4320]]]}


class Ctx:
    def __init__(self, p, lang="ko", context=None):
        self.principal, self.lang, self.context = p, lang, context or {}
        self.run_id, self.state, self.citations = "run_test_vlm", {}, []
        self.tokens_in = self.tokens_out = 0
        self.r = None


# ── 조각 ────────────────────────────────────────────────────────────────
def test_padded_bbox_and_zoom():
    b = C.bbox_of(SQUARE)
    pb = C.padded_bbox(b)
    assert pb[0] < b[0] and pb[2] > b[2] and pb[1] < b[1] and pb[3] > b[3]
    z = C.zoom_for(pb, 0.25)
    assert 17 <= z <= 20
    assert C.zoom_for(pb, 2.0) <= 17                     # 2 m 영상은 원해상도 +1 단계까지만
    assert C.zoom_for(pb, 0.25, max_zoom=18) <= 18


def test_order_sources_hires_recent_first():
    s = [C.Source("a", "2025-04 드론", "2025-04", 0.015, pm_path="x"), C.Source("b", "2025-10 드론", "2025-10", 0.015, pm_path="x"),
         C.Source("c", "2023 항공", "2023", 0.25, raster_path="y"), C.Source("d", "2025-10 위성", "2025-10", 2.0, pm_path="z")]
    o = C.order_sources(s)
    assert [x.id for x in o][:3] == ["b", "a", "c"]           # 같은 시점(2025-10)은 해상도 높은 쪽 한 장
    assert "d" not in [x.id for x in o]


def test_crop_views_draws_outline_and_puts_ai_year_first(monkeypatch):
    import cv2
    tile = np.full((256, 256, 4), (60, 120, 60, 255), np.uint8)
    ok, buf = cv2.imencode(".png", tile)
    monkeypatch.setattr(C, "_tile", lambda src, z, x, y, raster: C._decode(buf.tobytes()))
    monkeypatch.setattr(C, "pm_max_zoom", lambda p: 19)
    srcs = [C.Source("new", "2025-10 드론 1.5cm", "2025-10", 0.015, pm_path="p"), C.Source("old", "2023 항공 25cm", "2023", 0.25, pm_path="q")]
    ai = [{"type": "Polygon", "coordinates": [[[127.5142, 35.4322], [127.5146, 35.4322], [127.5146, 35.4325], [127.5142, 35.4322]]]}]
    res = C.crop_views(srcs, SQUARE, ai, ai_year=2023)
    assert [v.source.id for v in res.views] == ["old", "new"]    # AI 선이 들어간 시점이 첫 장
    assert res.views[0].ai_overlay and not res.views[1].ai_overlay
    im = cv2.imdecode(np.frombuffer(res.views[0].png, np.uint8), cv2.IMREAD_COLOR)
    assert max(im.shape[:2]) == C.OUT_PX
    yellow = (im[:, :, 2] > 200) & (im[:, :, 1] > 170) & (im[:, :, 0] < 80)
    assert yellow.sum() > 200                                      # 필지 경계(노랑)가 그려졌다
    assert all(v.cover == 1.0 for v in res.views)


def test_crop_skips_uncovered(monkeypatch):
    monkeypatch.setattr(C, "_tile", lambda *a: None)
    res = C.crop_views([C.Source("x", "2023", "2023", 0.25, pm_path="p")], SQUARE)
    assert res.views == [] and res.skipped


def test_save_views_ascii_names(tmp_path):
    v = C.View(source=C.Source("x", "l", "2023"), png=b"\x89PNG", cover=1.0, zoom=18)
    C.save_views(C.CropResult(views=[v]), tmp_path / "한글 폴더", "5219025030108240009-abc")
    assert v.path.exists() and v.name.endswith("-1.png") and v.name.isascii()


# ── 비전 세 줄 ──────────────────────────────────────────────────────────
def test_parse_three_lines_ko():
    t = "보이는 것: 노란 선 안에 지붕 3동이 보임.\nAI 결과와 맞는지: 일부 맞음 — 아래쪽은 비닐하우스.\n오탐 가능성: 보통 — 그림자."
    r = P.parse(t, "ko")
    assert r["match_level"] == "일부 맞음" and r["risk_level"] == "보통"
    assert "3" not in r["seen"]                                   # 숫자는 지운다(봉투만)
    assert r["lines"][0].startswith("보이는 것:")


def test_parse_en_and_fallback():
    r = P.parse("**Seen:** a large roof\nMatches AI: no — it is a greenhouse\nFalse-positive risk: high — plastic film", "en")
    assert r["match_level"] == "no" and r["risk_level"] == "high"
    r2 = P.parse("그냥 한 줄", "ko")
    assert len(r2["lines"]) == 3 and r2["lines"][1].endswith("판단할 수 없음")


def test_scrub_keeps_years():
    assert P.scrub_numbers("2023 영상에서 12동 확인", {"2023"}) == "2023 영상에서 확인"


def test_prompt_has_no_numbers():
    sysm, user = P.build({"jimok": "답", "cls": "건물", "ratio": 0.53, "rule_nm": "무허가 건축 의심"}, ["2023 항공 25cm"], True, "ko")
    assert "0.53" not in user and "절반 가까이" in user and "세 줄" in user
    _, en = P.build({"jimok": "답", "cls": "건물", "ratio": 0.8}, ["2023 aerial"], False, "en")
    assert "buildings" in en and "three lines" in en


# ── 도구 권한 · 관할 ──────────────────────────────────────────────────────
def test_vlm_allowed():
    assert V.allowed("vlm_describe", NW) and V.allowed("vlm_describe", GJ) and V.allowed("vlm_describe", ST)
    assert not V.allowed("vlm_describe", KG) and not V.allowed("vlm_describe", GUEST)


def test_vlm_scope_blocks_other_tenant():
    ctx = Ctx(NW)
    with pytest.raises(ToolError) as e:
        asyncio.run(V.resolve_pnu({"pnu": "1213034028104230000"}, ctx))      # 여수 필지 ← 남원 기관
    assert e.value.code == "tool_forbidden"
    ctx = Ctx(GJ)
    with pytest.raises(ToolError) as e:
        asyncio.run(V.resolve_pnu({"pnu": "5219045021110530012"}, ctx))      # 남원 필지 ← 광주전남 기관
    assert e.value.code == "tool_forbidden"
    assert asyncio.run(V.resolve_pnu({"pnu": "5219045021110530012"}, Ctx(NW))) == "5219045021110530012"
    assert asyncio.run(V.resolve_pnu({"pnu": "1213034028104230000"}, Ctx(ST))) == "1213034028104230000"


def test_vlm_describe_blocks_tag_tokens(monkeypatch):
    from agent.vlm import call as VC
    view = C.View(source=C.Source("x", "2023 항공 25cm", "2023", 0.25), png=b"png", cover=1.0, zoom=18, ai_overlay=True, name="a-1.png")

    async def fake_make(args, ctx):
        return {"kind": "필지", "pnu": "5219045021110530012", "geom": SQUARE, "addr": "전북특별자치도 남원시 아영면 아곡리 1053-12",
                "jimok": "답", "cls": "건물", "ratio": 0.53, "rule_nm": "무허가 건축 의심", "ai": [], "ai_year": 2023}, [view]

    async def fake_describe(pngs, prompt, **kw):
        return VC.VlmResult(text="보이는 것: 지붕 2동\nAI 결과와 맞는지: 맞음 — 지붕\n오탐 가능성: 낮음 — 뚜렷함",
                            usage={"prompt_tokens": 800, "completion_tokens": 60}, model="gemma-4-12b-it", power={"ok": True}, gpu_jobs_at_start=0)
    monkeypatch.setattr(V, "make_crops", fake_make)
    monkeypatch.setattr(VC, "describe", fake_describe)
    ctx = Ctx(NW)
    out = asyncio.run(V.vlm_describe({"pnu": "5219045021110530012"}, ctx))
    assert ctx.tokens_in == 800 and ctx.tokens_out == 60 and ctx.state["vlm_tokens"] == 860     # 기관 사용량 = run 토큰
    img = [b for b in out.blocks if b["type"] == "image"]
    assert img and img[0]["tag"] == "AI 의견 · 근거 아님" and img[0]["src"].endswith("/files/a-1.png") and "/agent/runs/" in img[0]["src"]
    assert out.answer.count(NL * 2) == 4 and out.answer.endswith("(AI 의견 · 근거 아님)")
    assert out.answer.split(NL * 2)[0] == "대상: 남원시 아영면 아곡리 1053-12"          # 대상 지번이 첫 줄(다음 조치로 이어지게)
    assert "2" not in out.answer.split(NL * 2)[1]                    # 비전 답의 숫자는 지운다
    assert out.ui_actions[0]["op"] == "map_flyto" and out.citations[0]["pnu"] == "5219045021110530012"


def test_vlm_route():
    c = Ctx(NW)
    assert V.ROUTE("운봉읍 준향리 824-9 영상 보고 설명해 줘", c) == {"tool": "vlm_describe", "args": {"jibun": "운봉읍 준향리 824-9"}, "intent": "vlm"}
    assert V.ROUTE("5219025030108240009 영상 설명해줘", c)["args"] == {"pnu": "5219025030108240009"}
    assert V.ROUTE("여수시 남면 화태리 423 필지 영상 보고 설명해 줘", c)["args"]["jibun"].endswith("화태리 423")
    assert V.ROUTE("의심 필지 몇 건?", c) is None
    assert V.ROUTE("이 필지 영상 설명", c)["args"] == {"prev": True}        # 화면 선택이 없으면 직전 답의 필지(모델 경로로 보내지 않음)
    c.citations = [{"pnu": "5219025030108240009"}]
    assert V.ROUTE("이 필지 영상 설명", c)["args"] == {}                     # 같은 run 인용 · 화면 선택 필지


# ── 해외 결과 ───────────────────────────────────────────────────────────
def test_global_allowed():
    assert G.allowed("global_summary", KG) and G.allowed("global_parcels", ST)
    assert not G.allowed("global_summary", NW) and not G.allowed("global_summary", GUEST)


def test_find_district_and_month():
    assert G.find_district("Ysyk-Ata")["id"] == "92254566B31675215078110"
    assert G.find_district("ysyk ata district")["name"] == "Ysyk-Ata"
    assert G.find_district("Nowhere") is None
    months = ["2025-03", "2025-06", "2025-10"]
    assert G.month_key("June", months) == "2025-06" and G.month_key("2025-10", months) == "2025-10"
    assert G.month_key("Dec", months) is None
    assert G.season_of("2025-10") == "Autumn 2025"


def test_sprawl_same_formula_as_screen():
    sp = G.sprawl(G.find_district("Ysyk-Ata"))
    assert sp and sp["b17"]["unit"] == "km2" and sp["cover"] >= G.COVER_MIN
    assert sp["delta"]["value"] == round((sp["b25"]["value"] - sp["b17"]["value"]) * 10) / 10


def test_global_route():
    c = Ctx(KG, "en")
    r = G.ROUTE("Show June NDVI for Ysyk-Ata" + NL + "(Current area: Ysyk-Ata, Autumn 2025. Answer in English.)", c)
    assert r == {"tool": "global_summary", "args": {"region": "Ysyk-Ata", "month": "June", "metric": "ndvi"}, "intent": "global"}
    assert G.ROUTE("How many fields show low vegetation?", c)["tool"] == "global_parcels"
    assert G.ROUTE("Zoom to Sokuluk", c)["args"] == {"region": "Sokuluk"}
    assert G.ROUTE("Draft a short survey report in English", c)["tool"] == "global_summary"
    assert G.ROUTE("hello", c) is None
    assert G.ROUTE("Show June NDVI", Ctx(NW, "en")) is None                  # 국내 기관은 직행 없음


def _fake_global(monkeypatch):
    yd = G.find_district("Ysyk-Ata")

    async def fake_mine(p):
        return [{**yd, "share": 1.0}] if p.tenant_id == "kgz-agri" else []

    async def fake_ndvi(d, p):
        e = lambda v, m: {"value": v, "unit": "ndvi", "basis": "measured", "as_of": "2026-09-27", "source": "S2"}  # noqa: E731
        return {"2025-06": {"env": e(0.44, "06"), "hist": {"bins": [-0.2, -0.1, 0.0, 0.1, 0.2, 0.3], "counts": [0, 0, 10, 30, 40, 20]},
                            "crop_px": 1000, "res_m": 40, "job": "j"},
                "2025-10": {"env": e(0.25, "10"), "hist": {"bins": [-0.2, -0.1, 0.0, 0.1, 0.2, 0.3], "counts": [0, 0, 20, 30, 30, 20]},
                            "crop_px": 1000, "res_m": 40, "job": "j"}}
    monkeypatch.setattr(G, "mine", fake_mine)
    monkeypatch.setattr(G, "ndvi_months", fake_ndvi)


def test_global_summary_envelopes_and_map(monkeypatch):
    _fake_global(monkeypatch)
    out = asyncio.run(G.global_summary({"region": "Ysyk-Ata", "metric": "ndvi", "month": "June"}, Ctx(KG, "en")))
    keys = [k for k, _, _ in out.envelopes]
    assert keys == ["ndvi_2025-06"] and out.envelopes[0][2]["value"] == 0.44
    ops = [a["op"] for a in out.ui_actions]
    assert ops == ["map_region", "map_on"] and out.ui_actions[1]["month"] == "2025-06"
    assert not out.answer                                           # 값 답은 모델이 봉투로


def test_global_outside_district_location_only(monkeypatch):
    _fake_global(monkeypatch)
    out = asyncio.run(G.global_summary({"region": "Sokuluk"}, Ctx(KG, "en")))
    assert out.envelopes == [] and out.data["outside_your_districts"] and out.ui_actions[0]["op"] == "map_region"
    assert "outside your districts" in out.answer


def test_global_parcels_low_share(monkeypatch):
    _fake_global(monkeypatch)
    out = asyncio.run(G.global_parcels({}, Ctx(KG, "en")))
    env = {k: e for k, _, e in out.envelopes}
    assert out.data["month"] == "2025-10" and env["low_share"]["value"] == 50.0      # NDVI < 0.2 = 20 + 30 of 100
    assert env["crop_km2"]["value"] == 1.6 and env["low_km2"]["value"] == 0.8 and env["low_km2"]["basis"] == "estimate"


def test_ext_contract_shape():
    for m in (V, G):
        assert set(m.SPECS) == set(m.HANDLERS) and not (m.WRITE or m.CONFIRM or m.CLIENT)
        assert all(n in m.WHY for n in m.SPECS) and isinstance(m.HINT, str) and callable(m.ROUTE) and callable(m.allowed)
        for s in m.SPECS.values():
            json.dumps(s)


def test_route_ignores_area_hint():
    c = Ctx(KG, "en")
    assert G.ROUTE("Zoom to Sokuluk(Current area: Ysyk-Ata, Autumn 2025. Answer in English.)", c)["args"] == {"region": "Sokuluk"}
    assert G.ROUTE("Zoom to Sokuluk (Current area: Ysyk-Ata, Autumn 2025. Answer in English.)", c)["args"] == {"region": "Sokuluk"}


def test_vlm_route_top_suspect():
    c = Ctx(GJ)
    assert V.ROUTE("화양면 의심 필지 영상 설명해 줘", c)["args"] == {"suspect_top": True, "emd": "화양면"}
    assert V.ROUTE("의심 필지 영상 보고 설명해 줘", c)["args"] == {"suspect_top": True}
    assert "suspect_top" in V.SPECS["vlm_describe"]["properties"]


# ── 직전 답을 가리키는 영상 요청(실증 must_fix ①) ──────────────────────────────
PREV = ["1278034021102010005", "1278025023100950000", "1278031021108050012"]      # 강진 상위 3(직전 답 순서)


def test_ref_rank_words():
    assert V.ref_rank("1위 필지 영상 보고 설명해 줘") == (1, True)
    assert V.ref_rank("3위 필지 영상 설명") == (3, True)
    assert V.ref_rank("세 번째 필지 영상 보고 설명해줘") == (3, True)
    assert V.ref_rank("Describe the image of the top parcel") == (1, True)
    assert V.ref_rank("그 필지 영상 설명해 줘") == (1, False)
    assert V.ref_rank("해당 필지 영상 확인해 줘") == (1, False)
    assert V.ref_rank("운봉읍 준향리 824-9 영상 보고 설명해 줘") == (0, False)
    assert V.ref_rank("2023년 영상 설명해 줘") == (0, False)


def test_route_rank_goes_to_vlm():
    gj = Ctx(GJ)
    assert V.ROUTE("1위 필지 영상 보고 설명해 줘", gj) == {"tool": "vlm_describe", "args": {"rank": 1}, "intent": "vlm"}
    assert V.ROUTE("2위 필지 영상도 설명해 줘", gj)["args"] == {"rank": 2}
    assert V.ROUTE("그 필지 영상 설명해 줘", gj)["args"] == {"prev": True}
    sel = Ctx(GJ, context={"pnu": PREV[1]})                                   # 화면에서 고른 필지
    assert V.ROUTE("이 필지 영상 설명", sel)["args"] == {}
    assert V.ROUTE("1위 필지 영상 보고 설명해 줘", sel)["args"] == {"rank": 1}   # 순위를 말하면 직전 목록이 먼저
    assert V.ROUTE("1위 필지 몇 건?", gj) is None
    assert V.ROUTE("1위 필지는 영상으로 보면 어떤 모습이야?", gj)["args"] == {"rank": 1}
    assert V.ROUTE("영상 층 켜 줘", gj) is None and V.ROUTE("영상 층 꺼 줘", gj) is None
    assert {"rank", "prev"} <= set(V.SPECS["vlm_describe"]["properties"])


def test_resolve_rank_from_prev_run(monkeypatch):
    seen = {}

    async def fake_prev(ctx, rank=1, want_list=True):
        seen["rank"], seen["list"] = rank, want_list
        return list(PREV) if want_list else [PREV[1]]
    monkeypatch.setattr(V, "prev_parcels", fake_prev)
    assert asyncio.run(V.resolve_pnu({"rank": 1}, Ctx(GJ))) == PREV[0]
    assert asyncio.run(V.resolve_pnu({"rank": 3}, Ctx(GJ))) == PREV[2] and seen["rank"] == 3
    assert asyncio.run(V.resolve_pnu({"prev": True}, Ctx(GJ))) == PREV[1] and seen["list"] is False      # '그 필지' = 직전 답이 말한 필지
    assert asyncio.run(V.resolve_pnu({"prev": True}, Ctx(GJ, context={"pnu": PREV[2]}))) == PREV[2]    # 화면에서 고른 필지가 먼저
    with pytest.raises(ToolError) as e:                                        # 목록보다 큰 순위 → 지번으로 다시
        asyncio.run(V.resolve_pnu({"rank": 9}, Ctx(GJ)))
    assert e.value.code == "not_found" and "지번" in e.value.message
    with pytest.raises(ToolError) as e:                                        # 직전 목록이 관할 밖(강진 ← 남원 기관) → 막힘
        asyncio.run(V.resolve_pnu({"rank": 1}, Ctx(NW)))
    assert e.value.code == "tool_forbidden"


def test_resolve_rank_prefers_same_run_citations(monkeypatch):
    async def boom(ctx, rank=1, want_list=True):
        raise AssertionError("같은 run 에 목록이 있으면 직전 run 을 읽지 않는다")
    monkeypatch.setattr(V, "prev_parcels", boom)
    c = Ctx(GJ)
    c.citations = [{"kind": "list"}, *({"kind": "parcel", "pnu": x} for x in PREV)]
    assert asyncio.run(V.resolve_pnu({"rank": 2}, c)) == PREV[1]


def _fake_db(monkeypatch, rows, got=None):
    import contextlib
    from landxi_api import deps
    got = {} if got is None else got

    class Conn:
        async def fetch(self, sql, *a):
            got["sql"], got["args"] = sql, a
            return rows

        async def fetchrow(self, sql, *a):
            raise AssertionError("화면이 준 직전 run 이 없으면 읽지 않는다")

    @contextlib.asynccontextmanager
    async def fake_db(*a, **k):
        yield Conn()
    monkeypatch.setattr(deps, "db", fake_db)
    return got


LIST_CITES = [{"kind": "list"}, *({"kind": "parcel", "pnu": x} for x in PREV)]


def test_prev_parcels_reads_latest_list(monkeypatch):
    rows = [{"id": "run_b", "state": "done", "vlm": True, "citations": json.dumps([{"kind": "parcel", "pnu": PREV[0]}])},   # 직전 = 영상 설명(필지 1개)
            {"id": "run_a", "state": "done", "vlm": False, "citations": LIST_CITES}]
    got = _fake_db(monkeypatch, rows)
    c = Ctx(GJ)
    assert asyncio.run(V.prev_parcels(c, 1, want_list=False)) == [PREV[0]]  # '그 필지' = 바로 앞 답이 말한 필지
    assert asyncio.run(V.prev_parcels(c, 1)) == PREV                        # '1위' = 영상 설명 답만 건너뛴 바로 앞 목록 답
    assert asyncio.run(V.prev_parcels(c, 2)) == PREV
    assert got["args"][0] == "u_gj" and got["args"][2] == "run_test_vlm" and "user_id=$1" in got["sql"]
    assert "vlm_describe" in got["args"][4]


def test_prev_parcels_stops_at_rejected_or_failed(monkeypatch):
    """2차 실증: 곡성 '데이터 없음'(rejected) 뒤 '1위 필지'가 더 오래된 강진 필지로 풀렸다 → 바로 앞 답이 목록이 아니면 []."""
    old = {"id": "run_old", "state": "done", "vlm": False, "citations": LIST_CITES}
    for state, cites in (("rejected", None), ("failed", None), ("tool", None), ("planning", None), ("done", None), ("done", [])):
        _fake_db(monkeypatch, [{"id": "run_new", "state": state, "vlm": False, "citations": cites}, old])
        assert asyncio.run(V.prev_parcels(Ctx(GJ), 1)) == [], state
        assert asyncio.run(V.prev_parcels(Ctx(GJ), 1, want_list=False)) == [], state


def test_prev_parcels_rank_never_uses_single_parcel_answer(monkeypatch):
    """바로 앞 답이 필지 1개짜리(다른 확인자의 단일 필지 답 · 목록 아님)면 '1위'를 그 필지로 대신하지 않는다."""
    single = {"id": "run_one", "state": "done", "vlm": False, "citations": [{"kind": "parcel", "pnu": PREV[2]}]}
    _fake_db(monkeypatch, [single, {"id": "run_old", "state": "done", "vlm": False, "citations": LIST_CITES}])
    assert asyncio.run(V.prev_parcels(Ctx(GJ), 1)) == []
    assert asyncio.run(V.prev_parcels(Ctx(GJ), 1, want_list=False)) == [PREV[2]]     # '그 필지'는 그 필지
    _fake_db(monkeypatch, [{"id": "run_l1", "state": "done", "vlm": False, "citations": [{"kind": "list"}, {"kind": "parcel", "pnu": PREV[2]}]}])
    assert asyncio.run(V.prev_parcels(Ctx(GJ), 1)) == [PREV[2]]                    # 1건짜리 목록 답은 목록
    assert asyncio.run(V.prev_parcels(Ctx(GJ), 2)) == []                           # 목록보다 큰 순위


def test_prev_parcels_vlm_skip_then_stop(monkeypatch):
    """영상 설명 답만 건너뛴다 — 그 앞이 거절이면 거기서 멈춘다(더 오래된 목록으로 가지 않음)."""
    rows = [{"id": "r3", "state": "done", "vlm": True, "citations": [{"kind": "parcel", "pnu": PREV[0]}]},
            {"id": "r2", "state": "rejected", "vlm": False, "citations": None},
            {"id": "r1", "state": "done", "vlm": False, "citations": LIST_CITES}]
    _fake_db(monkeypatch, rows)
    assert asyncio.run(V.prev_parcels(Ctx(GJ), 1)) == []


def test_rank_miss_answers_notice_not_other_parcel(monkeypatch):
    """순위를 못 풀면 '어느 필지인지 찾지 못했습니다 — 지번으로 말씀해 주세요' 답 · 같은 run 에서 suspect_top 으로 다른 필지를 대신하지 않음."""
    async def no_prev(ctx, rank=1, want_list=True):
        return []

    async def no_top(*a, **k):
        raise AssertionError("순위를 못 푼 run 에서 1위 의심 필지로 대신하지 않는다")
    monkeypatch.setattr(V, "prev_parcels", no_prev)
    monkeypatch.setattr(V, "top_suspect", no_top)
    c = Ctx(GJ)
    c.state["msg"] = "1위 필지 영상 보고 설명해 줘"
    out = asyncio.run(V.vlm_describe({"rank": 1}, c))
    assert out.answer.startswith("어느 필지인지 찾지 못했습니다 — 지번으로 말씀해 주세요") and not out.blocks and not out.citations
    out = asyncio.run(V.vlm_describe({"suspect_top": True}, c))                  # 모델이 이어서 '의심 1위'로 다시 불러도
    assert "지번으로" in out.answer and not out.blocks
    out = asyncio.run(V.crop_tiles({"rank": 1}, c))
    assert "지번으로" in out.answer
    e = Ctx(GJ)
    e.lang = "en"
    e.state["msg"] = "Describe the imagery of the top parcel"
    out = asyncio.run(V.vlm_describe({"rank": 1}, e))
    assert out.answer.startswith("I couldn't tell which parcel")


# ── 영상 판독 흉내 가드(실증 must_fix ②) ─────────────────────────────────────
FAKE = ("강진군 도암면 덕서리 201-5 [1] 필지의 영상을 분석한 결과입니다." + NL + NL
        + "AI 분석 결과와 유사한 형태의 건축물이 확인되며, 실제 현황과 대조가 필요합니다. AI 의견 · 근거 아님")


def test_image_guard_blocks_fake_reading():
    from agent import lint
    V.install_guard()
    assert getattr(lint.action_check, "_vlm_guard", False)
    md, flags = lint.action_check(FAKE, {"survey_findings", "map_arrive"}, "ko")
    assert "분석한 결과" not in md and "근거 아님" not in md and "건축물이 확인" not in md
    assert md.endswith(V.IMG_NA["ko"]) and len([f for f in flags if f["claims"] == ["image"]]) >= 2


def test_image_guard_keeps_real_vlm_and_normal_answers():
    from agent import lint
    V.install_guard()
    assert lint.action_check(FAKE, {"vlm_describe", "map_flyto"}, "ko")[0] == FAKE        # 비전 도구가 돈 run 은 그대로
    ok = "강진군 의심 필지는 {{env:e1}}건이며 1위는 도암면 덕서리 201-5 [1]입니다. AI가 2023 항공영상에서 건물을 탐지했습니다."
    assert lint.action_check(ok, {"survey_findings", "map_arrive"}, "ko") == (ok, [])
    en = "June 2025 NDVI in Ysyk-Ata is {{env:e1}} based on the satellite imagery [1]."
    assert lint.action_check(en, {"global_summary", "map_region"}, "en") == (en, [])
    md, _ = lint.action_check("The image shows a large greenhouse. (AI opinion · not evidence)", {"survey_findings"}, "en")
    assert md == V.IMG_NA["en"]


def test_install_guard_once():
    from agent import lint
    V.install_guard()
    f = lint.action_check
    V.install_guard()
    assert lint.action_check is f


def test_prev_parcels_uses_screen_prev_run(monkeypatch):
    import contextlib
    from landxi_api import deps
    asked = {}

    class Conn:
        async def fetchrow(self, sql, *a):
            asked["val"] = a
            return {"state": asked.get("state", "done"), "vlm": False, "citations": json.dumps([{"kind": "parcel", "pnu": x} for x in PREV])}

        async def fetch(self, sql, *a):
            raise AssertionError("화면이 준 직전 run 이 있으면 최근 run 검색을 하지 않는다")

    @contextlib.asynccontextmanager
    async def fake_db(*a, **k):
        yield Conn()
    monkeypatch.setattr(deps, "db", fake_db)
    c = Ctx(GJ, context={"prev_run": "run_prev_list"})
    assert asyncio.run(V.prev_parcels(c, 2)) == PREV and asked["val"][:3] == ("run_prev_list", "u_gj", "tenant")
    asked["state"] = "rejected"                                            # 이 창의 바로 앞 답이 거절이면 거기서 끝(다른 창 답으로 넘어가지 않음)
    assert asyncio.run(V.prev_parcels(c, 1)) == []


def test_question_rank_beats_model_prev(monkeypatch):
    async def fake_prev(ctx, rank=1, want_list=True):
        return list(PREV) if want_list else [PREV[1]]
    monkeypatch.setattr(V, "prev_parcels", fake_prev)
    c = Ctx(GJ)
    c.state["msg"] = "1위 필지 현장 모습이 어떤지 알려 줘"                   # 모델이 prev 로 불러도 질문의 '1위'가 이긴다
    assert asyncio.run(V.resolve_pnu({"prev": True}, c)) == PREV[0]
    c.state["msg"] = "그 필지 현장 모습 알려 줘"
    assert asyncio.run(V.resolve_pnu({"prev": True}, c)) == PREV[1]


def test_runner_sees_guard_after_ext_load():
    from agent import runner                                               # 러너가 부르는 lint.action_check 가 가드를 거친다
    from agent.tools import registry
    registry.ensure_ext()
    assert getattr(runner.lint.action_check, "_vlm_guard", False)
    md, flags = runner.lint.action_check(FAKE, set(["survey_findings", "map_arrive"]), "ko")
    assert md == V.IMG_NA["ko"] and flags
