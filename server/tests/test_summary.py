"""fix-server-summary — GET /api/v1/summary(대표 수치 단일 요약) 실서버(:8700) e2e + '같은 label 같은 값' 자체 검사.

읽기만 한다(쓰기 0 · GPU 0). 기대값은 고정 숫자가 아니라 같은 원천(PostGIS 표)을 직접 센 값과 대조한다.
"""
import asyncio

import httpx
import psycopg

from conftest import B, H
from landxi_api import config
from landxi_api.envelope import is_env, scan

KEYS = {"detected": "AI 탐지", "field_check": "현장 확인 필요", "review_pending": "결과 확인 대기", "reports": "기관 신고"}
STAGES = {"운영", "시범", "첫 결과 전"}
ITEM_KEYS = {"card", "card_name", "sgg_cd", "region_name", "tenant", "stage", "imagery", "metrics"}


def adm():
    return psycopg.connect(config.PG_ADMIN_DSN, autocommit=True)


def get(tok=None, **q):
    r = httpx.get(B + "/summary", params=q, headers=H(tok) if tok else None, timeout=30)
    assert r.status_code == 200, r.text
    j = r.json()
    scan(j)                                   # 봉투 없는 숫자 0
    return j


def key(it):
    return (it["tenant"], it["card"], it["sgg_cd"])


def check_contract(j):
    assert isinstance(j["as_of"], str) and isinstance(j["items"], list)
    for it in j["items"]:
        assert ITEM_KEYS <= set(it), it.keys()
        assert it["stage"] in STAGES
        assert set(it["imagery"]) == {"has", "label"} and isinstance(it["imagery"]["has"], bool)
        assert set(it["metrics"]) == set(KEYS)
        for k, m in it["metrics"].items():
            assert m["label"] == KEYS[k]                     # 같은 key = 같은 label
            assert is_env(m) and m["source"] and "/" not in m["source"]   # 출처는 사용자 말(경로·API 0)
            if m["value"] is None:
                assert m.get("note"), (k, m)                 # 값이 없으면 이유
        if it["stage"] == "첫 결과 전":
            assert it["metrics"]["detected"]["value"] is None


def test_contract_all_sessions(live, tok):
    for who in (None, "staff", "admin", "sales", "namwon", "gj"):
        check_contract(get(tok[who] if who else None))


def test_rls_other_tenant_zero(live, tok):
    nw = get(tok["namwon"])["items"]
    gj = get(tok["gj"])["items"]
    assert nw and {i["tenant"] for i in nw} == {"namwon"}
    assert gj and {i["tenant"] for i in gj} == {"gwangju-jeonnam"}
    assert get(tok["namwon"], card="card-marine")["items"] == []          # 남의 기관 서비스 = 0
    assert get(tok["gj"], region="52190")["items"] == []
    g = get()["items"]
    assert g and all(i["stage"] != "첫 결과 전" for i in g)
    for i in g:                                                           # 게스트: 기관 자료 값 없음
        for k in ("field_check", "review_pending", "reports"):
            assert i["metrics"][k]["value"] is None


def test_same_label_same_value_across_calls(live, tok):
    """같은 (기관·서비스·지역) 항목은 누가 · 어떤 거르기로 불러도 같은 값."""
    lx = {key(i): i for i in get(tok["staff"])["items"]}
    views = [get(tok["admin"]), get(tok["sales"]), get(tok["namwon"]), get(tok["gj"]), get()]
    for it in lx.values():
        if it["sgg_cd"]:
            views.append(get(tok["staff"], region=it["sgg_cd"]))
        views.append(get(tok["staff"], card=it["card"]))
    for v in views:
        for i in v["items"]:
            ref = lx[key(i)]
            assert i["stage"] == ref["stage"] and i["imagery"] == ref["imagery"]
            for k, m in i["metrics"].items():
                if m["value"] is not None:                                # 게스트가 가린 값은 제외
                    assert m["value"] == ref["metrics"][k]["value"], (key(i), k)
    # 한 항목 = (기관 · 서비스 · 지역) 하나
    items = get(tok["staff"])["items"]
    assert len({key(i) for i in items}) == len(items)


def test_values_match_source_tables(live, tok):
    items = get(tok["staff"])["items"]
    with adm() as c:
        det = dict(c.execute("SELECT job_id, count(*) FROM detections WHERE job_id LIKE 'results/%' GROUP BY 1").fetchall())
        fc = dict(c.execute("SELECT tenant_id, count(DISTINCT pnu) FROM survey_findings WHERE priority='A' "
                            "AND state IN ('open','assigned') GROUP BY 1").fetchall())
        rp = dict(c.execute("SELECT tenant_id, count(*) FROM survey_findings WHERE priority='A' AND state='open' GROUP BY 1").fetchall())
        rep = dict(c.execute("SELECT tenant_id, count(*) FROM feedback WHERE state='open' GROUP BY 1").fetchall())
    # 기관 신고 — 한 신고는 한 항목에만 → 기관 합 = 표의 열린 신고 수
    by_t = {}
    for i in items:
        by_t[i["tenant"]] = by_t.get(i["tenant"], 0) + i["metrics"]["reports"]["value"]
    for t, n in rep.items():
        assert by_t.get(t) == n, (t, by_t.get(t), n)
    # 실태조사 — 기관의 실태조사 항목 합 = 표(현재 정본은 한 시군구씩)
    for t in fc:
        s_fc = sum(i["metrics"]["field_check"]["value"] or 0 for i in items if i["tenant"] == t)
        s_rp = sum(i["metrics"]["review_pending"]["value"] or 0 for i in items if i["tenant"] == t)
        assert s_fc == fc[t] and s_rp == rp[t], (t, s_fc, fc[t], s_rp, rp[t])
    # AI 탐지 — 운영/시범 항목의 값은 결과 세트 행 수 중 하나(지어낸 값 0)
    for i in items:
        v = i["metrics"]["detected"]["value"]
        if v is not None:
            assert v in det.values(), (key(i), v)


def test_gwangju_marine_single_state(live, tok):
    """광주전남 해양쓰레기 = 한 항목 · 한 단계 · 한 수(실결과 행 수) — LX · 기관 · 게스트 · 거르기 모두 같다."""
    with adm() as c:
        n = c.execute("SELECT count(*) FROM detections WHERE job_id='results/lx/yeosu-marine-2025-aerial'").fetchone()[0]
    seen = []
    for j in (get(tok["staff"], card="card-marine"), get(tok["gj"]), get(card="card-marine"), get(tok["gj"], card="card-marine")):
        ms = [i for i in j["items"] if i["tenant"] == "gwangju-jeonnam" and i["card"] == "card-marine"]
        assert len(ms) == 1, ms
        seen.append((ms[0]["stage"], ms[0]["metrics"]["detected"]["value"], ms[0]["sgg_cd"]))
    assert len(set(seen)) == 1, seen
    stage, v, sgg = seen[0]
    assert (stage == "운영" and v == n and n > 0) or (stage == "첫 결과 전" and v is None and n == 0)
    reg = get(tok["staff"], region=sgg)["items"]                          # 지역 거르기(지금 코드)
    assert any(i["card"] == "card-marine" for i in reg)


def test_region_prev_code_alias(live, tok):
    """코드가 바뀐 시군구(옛 46xxx ↔ 새 12xxx) — 어느 코드로 거르든 같은 항목."""
    items = [i for i in get(tok["staff"])["items"] if i["sgg_cd"]]
    r = httpx.get(B + "/regions", headers=H(tok["staff"]), timeout=60).json()
    prev = {x["sgg_cd"]: x.get("prev_cd") for x in r["items"]}
    for i in items:
        p = prev.get(i["sgg_cd"])
        if p:
            a = [key(x) for x in get(tok["staff"], region=i["sgg_cd"])["items"]]
            b = [key(x) for x in get(tok["staff"], region=p)["items"]]
            assert a == b and key(i) in a


def test_build_module_function(live):
    """summary.build(conn, tenant, region, card) — 에이전트 도구가 import 하는 모듈 함수. 응답과 같은 값."""
    from landxi_api import deps, summary

    async def run():
        deps._pool = deps._redis = deps._pool_sys = None          # 앞선 테스트의 다른 이벤트 루프 풀을 물려받지 않는다
        try:
            async with deps.db(realm="tenant", tenant="namwon") as c:
                mine = await summary.build(c, "namwon")
                other = await summary.build(c, "gwangju-jeonnam")         # 남의 기관 연결 → 0
            async with deps.db(realm="lx") as c:
                allx = await summary.build(c, summary.LX_ALL, card="card-farm")
                guest = await summary.build(c, None)
            return mine, other, allx, guest
        finally:
            await deps.close()
    mine, other, allx, guest = asyncio.run(run())
    check_contract(mine)
    assert mine["items"] and {i["tenant"] for i in mine["items"]} == {"namwon"}
    assert other["items"] == []
    assert allx["items"] and {i["card"] for i in allx["items"]} == {"card-farm"}
    assert all(i["metrics"]["reports"]["value"] is None for i in guest["items"])
    lx = {key(x): x for x in allx["items"]}
    for i in mine["items"]:                     # 기관 연결(RLS)로 센 값 = LX 연결로 센 값
        if key(i) in lx:
            assert {k: m["value"] for k, m in i["metrics"].items()} == {k: m["value"] for k, m in lx[key(i)]["metrics"].items()}


def test_fast(live, tok):
    get(tok["staff"])
    r = httpx.get(B + "/summary", headers=H(tok["staff"]), timeout=30)
    assert float(r.headers["x-lx-time-ms"]) <= 300
