"""숫자 한 출처(c2-numbers) — 의심 필지 · 현장 확인 필요가 어느 경로든 같은 값 + 읍면동 빈칸 0 + 필지 위치 + 시도 이름 하나.

    cd server && python -m pytest survey/tests/test_numbers.py -q

순수 함수 검사는 DB 없이. 'API 와 같은 값' 검사는 게이트웨이(:8700 · conftest api)가 떠 있을 때만(계정 로그인 = 로그인 API).
"""
import asyncio
import sys
from pathlib import Path

import httpx
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))       # server/
from survey import nation as NT  # noqa: E402

TWO = [("52190", "h_nw"), ("12130", "h_gj")]          # 전북 남원 · 광주전남 여수(서로 다른 시도)


def _get(api, path, h):
    r = httpx.get(api + path, headers=h, timeout=60)
    assert r.status_code == 200, (path, r.text[:300])
    return r.json()


# ── 순수 함수 ──────────────────────────────────────────────────────────────
def test_counts_from_rows_building_and_sum():
    rows = [{"sgg_cd": "11111", "tenant_id": "t", "state": "done", "findings": 10, "field_check": 3, "review_pending": 2, "at": None},
            {"sgg_cd": "22222", "tenant_id": "t", "state": "done", "findings": 5, "field_check": 1, "review_pending": 1, "at": None}]
    c = NT.counts_from_rows(rows)
    assert (c["state"], c["suspect"], c["field_check"], c["review_pending"]) == ("done", 15, 4, 3)
    busy = NT.counts_from_rows(rows + [{"sgg_cd": "33333", "tenant_id": "t", "state": "building", "findings": 7, "field_check": 9,
                                        "review_pending": 9, "at": None}])
    assert busy["state"] == "building" and busy["suspect"] is None and busy["field_check"] is None     # 적재 중 = 숫자 대신 '집계 중'
    assert NT.counts_from_rows([])["state"] == "none"


def test_counts_sql_both_styles():
    assert "$1::text[]" in NT.counts_sql("pg") and "$2" in NT.counts_sql("pg")
    assert "%(rules)s" in NT.counts_sql("psycopg") and "%(codes)s" in NT.counts_sql("psycopg")


def test_sido_label_one_name():
    from landxi_api import regions as RG
    assert RG.sido_label("전남광주통합특별시") == RG.sido_label("12130") == RG.sido_label("12") == "광주전남특별시"
    assert RG.sido_label("52190") == "전북특별자치도"
    assert RG.full_label("전남광주통합특별시 여수시 돌산읍") == "광주전남특별시 여수시 돌산읍"
    assert [r["sgg_cd"] for r in RG.find("전남광주통합특별시 여수시")] == ["12130"]
    r = RG.region_of("12130")
    assert r["sido"] == r["sido_short"] == "광주전남특별시" and r["full"].startswith("광주전남특별시 ")
    assert not [x for x in RG.regions_base()[0] if "전남광주통합특별시" in (x.get("full") or "") + (x.get("sido") or "")]


def test_label_points_rule():
    from workers import postprocess as PP
    got = PP.label_points([(127.6622, 34.7604), (127.7409, 34.7297), (127.39, 35.41), (126.0, 33.0)], "12130")
    assert got[0] == ("학동", "12130128") and got[1][0] == "돌산읍"
    assert got[2][1].startswith("52190")                  # 작업 시군구 밖 → 그 점의 시군구 읍면동
    assert got[3] == (PP.OUTSIDE, None)                   # 바다(어느 시군구에도 없음) → '관할 밖'


# ── DB · API(같은 값) ─────────────────────────────────────────────────────
@pytest.mark.parametrize("sgg,hname", TWO)
def test_one_source_everywhere(api, request, sgg, hname, pg):
    h = request.getfixturevalue(hname)
    ref = NT.counts_sync(pg, sgg)
    assert ref["state"] == "done" and ref["suspect"] > 0
    st = _get(api, f"/survey/stats?by=emd&sgg={sgg}", h)
    assert st["total"]["value"] == ref["suspect"] and st["field_check"]["value"] == ref["field_check"]
    assert sum(i["n"]["value"] for i in st["items"]) == ref["suspect"]                     # 읍면동 칸 합 = 합계
    for by in ("rule", "priority", "state"):
        j = _get(api, f"/survey/stats?by={by}&sgg={sgg}", h)
        assert j["total"]["value"] == ref["suspect"]
        assert sum(i["n"]["value"] for i in j["items"] if not str(i["key"]).startswith("L")) == ref["suspect"], by
    # 카드 항목 = 그 카드 판의 값(모델-표기 ⓐ · 카드마다 따로) — 같은 식(counts_sync card=)으로 낸 값과 같다
    sm = _get(api, f"/summary?region={sgg}", h)
    got = [it for it in sm["items"] if (it["metrics"].get("suspect") or {}).get("value") is not None]
    assert got
    for it in got:
        rc = NT.counts_sync(pg, sgg, card=it["card"])
        assert (it["metrics"]["suspect"]["value"], it["metrics"]["field_check"]["value"]) == (rc["suspect"], rc["field_check"]), it["card"]
    rg = _get(api, "/survey/regions", h)
    assert [i["findings"]["value"] for i in rg["items"] if i["sgg_cd"] == sgg] == [ref["suspect"]]
    rr = _get(api, f"/regions/{sgg}", h)
    assert rr["n_findings"]["value"] == ref["suspect"]


@pytest.mark.parametrize("sgg,who", [("52190", ("tenant", "manager", "namwon")), ("12130", ("tenant", "manager", "gwangju-jeonnam")),
                                     ("12130", ("lx", "staff", None))])
def test_agent_survey_stats_same_value_and_chart(api, pg, sgg, who):
    """에이전트 survey_stats(by=emd) — suspects · field_check = survey_counts, 막대 차트 블록(값 = 봉투 key) · 3번 같은 값."""
    from agent.runner import Ctx
    from agent.tools import survey as T
    from landxi_api import deps
    from landxi_api.deps import CAPS, Principal
    ref = NT.counts_sync(pg, sgg)
    p = Principal(who[0], who[1], who[2], "u_test", caps=CAPS[(who[0], who[1])])

    async def go():
        try:
            outs = []
            for _ in range(3):
                ctx = Ctx(run_id="t_num", principal=p, token=None, context={})
                outs.append(await T.survey_stats({"by": "emd", "region": sgg}, ctx))
            return outs
        finally:
            await deps.close()
    deps._pool = deps._pool_sys = deps._redis = None
    outs = asyncio.run(go())
    for o in outs:
        e = {k: v for k, _, v in o.envelopes}
        assert e["suspects"]["value"] == ref["suspect"] and "field_check" not in e         # 원칙 135 — 답에 '현장 확인 필요' 0(LX 10-09 · 기관 10-10)
        assert "suspect_parcels" not in e                                                  # '의심 필지' 는 한 봉투(두 값 0)
        ch = [b for b in o.blocks if b.get("type") == "chart"]
        assert len(ch) == 1 and ch[0]["kind"] == "bar" and ch[0]["rows"]
        assert all(r["env"] in e and isinstance(r["label"], str) for r in ch[0]["rows"])     # 값은 봉투 key 로만
        assert all(isinstance(e[r["env"]]["value"], int) for r in ch[0]["rows"])
    assert len({o.envelopes[0][2]["value"] for o in outs}) == 1


@pytest.mark.parametrize("sgg,who", [("12110", ("tenant", "manager", "gwangju-jeonnam")), ("52190", ("tenant", "manager", "namwon"))])
def test_agent_findings_total_label_matches_emd(api, request, sgg, who):
    """보고서 초안 근거 — 규칙 없이 부르면 '의심 필지 전체' = 그 읍면동 칸(n) · 규칙을 주면 이름을 붙여 '일치 의심 건'(전체로 읽히지 않게)."""
    from agent.runner import Ctx
    from agent.tools import survey as T
    from landxi_api import deps
    from landxi_api.deps import CAPS, Principal
    h = request.getfixturevalue("h_gj" if who[2] == "gwangju-jeonnam" else "h_nw") if who[2] else None
    st = _get(api, f"/survey/stats?by=emd&sgg={sgg}", h)
    top = max(st["items"], key=lambda i: i["n"]["value"])
    r1 = top["by_rule"]["R1"]["value"]
    p = Principal(who[0], who[1], who[2], "u_test", caps=CAPS[(who[0], who[1])])

    async def go():
        try:
            a = await T.survey_findings({"emd": top["key"], "region": sgg, "top": 3}, Ctx(run_id="t_f1", principal=p, token=None, context={}))
            b = await T.survey_findings({"emd": top["key"], "region": sgg, "rule": "R1", "top": 3}, Ctx(run_id="t_f2", principal=p, token=None, context={}))
            return a, b
        finally:
            await deps.close()
    deps._pool = deps._pool_sys = deps._redis = None
    a, b = asyncio.run(go())
    ta = next((lab, v) for k, lab, v in a.envelopes if k == "total")
    tb = next((lab, v) for k, lab, v in b.envelopes if k == "total")
    assert ta[1]["value"] == top["n"]["value"] and "의심 필지 전체" in ta[0]
    assert tb[1]["value"] == r1 and "무허가 건축" in tb[0] and "전체" not in tb[0]


def test_detections_emd_blank_zero():
    """K15 — 읍면동 빈칸(관할 밖 표지 제외) = 0. 채우기를 한 번 돌린 뒤 · 경계 미수신(pending)만 예외."""
    from workers import postprocess as PP
    r = PP.fill_blank(50000)
    c = PP.blank_counts()
    assert c["blank"] <= r["pending"], (c, r)


def test_parcels_inside_boundary(pg):
    """여수 등 적재 시군구 — 경계 +3 km 밖 필지 0(원점 100 km 밀림은 제자리로)."""
    for (sgg,) in pg.execute("SELECT sgg_cd FROM survey_sgg WHERE state IN ('done','no_ai')").fetchall():
        r = NT.fix_parcel_offsets(pg, sgg, dry=True)
        assert r.get("outside", 0) == 0, r


def test_no_second_sido_name_in_loaded_text(pg):
    from landxi_api import regions as RG
    for src in RG.SIDO_LABEL:
        for t, col in (("survey_parcels", "addr"), ("survey_findings", "addr"), ("survey_sgg", "sido")):
            n = pg.execute(f"SELECT count(*) FROM {t} WHERE {col} LIKE %s", ("%" + src + "%",)).fetchone()[0]
            assert n == 0, (t, n)


def test_regions_list_keeps_prev_cd(api, h_gj):
    """/regions 항목에 옛 코드(prev_cd)가 있어야 XI맵이 시군구 경계(옛 46xxx)와 새 코드(12xxx)를 잇는다
    (없으면 광주전남 기관이 목포 12110 을 열어도 46110 으로 바뀌어 '관할 밖'이 된다 · 2차 실증에서 찾음)."""
    items = _get(api, "/regions?limit=400", h_gj)["items"]
    mok = next(x for x in items if x["sgg_cd"] == "12110")
    assert mok.get("prev_cd") == "46110" and mok.get("in_scope") is True
    assert next(x for x in items if x["sgg_cd"] == "12130").get("prev_cd") == "46130"


def test_shared_sse_one_stream_per_browser():
    """탭끼리 한 스트림 — 상시 방송 스트림(/events/tenant · /events/ops)은 Web Locks 로 뽑힌 한 탭만 연결을 연다.
    게이트웨이가 HTTP/1.1 이라 탭마다 열면 탭 6개에서 로그인·XI맵 요청이 모두 멈췄다(2차 실증)."""
    src = (Path(__file__).resolve().parents[3] / "landxi" / "shared" / "api-v1.js").read_text(encoding="utf-8")
    assert "navigator.locks.request" in src and "BroadcastChannel" in src
    assert r"SHARED_SSE = /^\/events\/(?:tenant|ops)" in src
    login = (Path(__file__).resolve().parents[3] / "landxi" / "v3" / "login" / "auth.js").read_text(encoding="utf-8")
    xi = (Path(__file__).resolve().parents[3] / "landxi" / "v3" / "xi-clean" / "app.js").read_text(encoding="utf-8")
    assert "SLOW_TXT" in login and "서버 응답이 늦습니다" in xi          # 멈추면 말없이 두지 않는다
