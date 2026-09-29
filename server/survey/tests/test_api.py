"""읽기 API 5 · explain 정직성 · 관문(게스트 401 · 타 기관 0 · 성명 0) · 봉투 규약."""
import json

import httpx

from survey import db as S

BASIS = {"measured", "estimate", "demo", "history", "inferred", "recorded"}


def _get(api, path, h=None, **kw):
    return httpx.get(api + path, headers=h or {}, timeout=30, **kw)


def _envs(o, out=None):
    out = [] if out is None else out
    if isinstance(o, dict):
        if "value" in o and "basis" in o and "unit" in o:
            out.append(o)
        for v in o.values():
            _envs(v, out)
    elif isinstance(o, list):
        for v in o:
            _envs(v, out)
    return out


def test_guest_401(api):
    for p in ("/survey/findings", "/survey/findings/f_R1_5219045021110530012", "/survey/parcels/5219045021110530012",
              "/survey/stats", "/survey/rules", "/survey/reports/draft?emd_cd=52190450"):
        r = _get(api, p)
        assert r.status_code == 401 and r.json()["error"]["code"] == "unauthorized", p


def test_other_tenant_zero(api, h_gj):
    j = _get(api, "/survey/findings?limit=5&sgg=52190", h_gj).json()          # 다른 기관 관할 = 0(자기 관할 행은 있을 수 있다)
    assert j["total"]["value"] == 0 and j["items"] == []
    assert _get(api, "/survey/findings/f_R1_5219045021110530012", h_gj).status_code == 404
    assert _get(api, "/survey/parcels/5219045021110530012", h_gj).status_code == 404
    # 다른 기관 시군구 = 볼 수 있는 실태조사 없음 → 값 없음(None · '실태조사 결과 없음') 또는 0 — 어느 쪽이든 남의 수가 새지 않는다
    assert _get(api, "/survey/stats?by=rule&sgg=52190", h_gj).json()["total"]["value"] in (0, None)


def test_findings_filter_sort_pager(api, h_nw):
    j = _get(api, "/survey/findings?rule=R1&priority=A&limit=5", h_nw).json()
    assert j["total"]["value"] == 759 and len(j["items"]) == 5
    assert j["items"][0]["id"] == "f_R1_5219045021110530012"
    sc = [i["score"]["value"] for i in j["items"]]
    assert sc == sorted(sc, reverse=True)
    assert j["by_rule"]["R1"]["value"] == 759 and j["by_rule"]["R2"]["value"] == 46       # 규칙 탭 = rule 필터 제외
    assert sum(j["counts"].values()) == 759
    p2 = _get(api, "/survey/findings?rule=R1&priority=A&limit=5&offset=5", h_nw).json()
    assert not ({i["id"] for i in p2["items"]} & {i["id"] for i in j["items"]})
    e = _get(api, "/survey/findings?emd_cd=52190450&sort=evid_m2&limit=50", h_nw).json()
    ev = [i["evid_m2"]["value"] for i in e["items"]]
    assert ev == sorted(ev, reverse=True) and e["total"]["value"] == 2085
    b = _get(api, "/survey/findings?bbox=127.57,35.47,127.59,35.48&limit=2000", h_nw).json()
    assert all(127.57 <= i["lnglat"][0] <= 127.59 and 35.47 <= i["lnglat"][1] <= 35.48 for i in b["items"])
    assert _get(api, "/survey/findings?rule=R9", h_nw).status_code == 400
    assert _get(api, "/survey/findings?sort=bogus", h_nw).status_code == 400
    all_ = _get(api, "/survey/findings?limit=1&rule=R1,R2,R3,R4,R5,R6", h_nw).json()     # 대장 규칙(L-*) 행 제외
    assert all_["total"]["value"] == 20872
    assert {k: v["value"] for k, v in all_["by_rule"].items() if k.startswith("R")} == S.README_COUNTS["by_rule"]


def test_envelopes_everywhere(api, h_nw):
    for p in ("/survey/findings?limit=20", "/survey/findings/f_R2_5219033033113950012", "/survey/parcels/5219045021110530012?with=all",
              "/survey/stats?by=emd", "/survey/rules", "/survey/reports/draft?emd_cd=52190450&rule=R1&top=5"):
        r = _get(api, p, h_nw)
        assert r.status_code == 200, (p, r.text[:300])
        envs = _envs(r.json())
        assert envs, p
        for e in envs:
            assert e["basis"] in BASIS and isinstance(e["as_of"], str) and isinstance(e["source"], str), (p, e)


def test_explain_honesty_each_rule(api, h_nw):
    notes = {}
    for rid in S.RULE_IDS:
        it = _get(api, f"/survey/findings?rule={rid}&limit=1", h_nw).json()["items"][0]
        j = _get(api, f"/survey/findings/{it['id']}", h_nw).json()
        x = j["explain"]
        assert len(x["lines"]) == 6
        assert all("[추정 초기값]" in t["value"]["note"] and t["value"]["basis"] == "estimate" for t in x["thresholds"])
        assert any(g["label"] == "건축물대장 미대조" for g in x["ledger_gaps"])
        assert x["score_check"]["equal"] is True
        assert x["fixed"] == S.FIXED_PHRASE
        notes[rid] = x["note"]
    assert "과다 추정" in notes["R2"] and "2025 반증" in notes["R2"]
    assert "오탐 요인" in notes["R1"] and "오탐 요인" in notes["R6"]
    assert "과소 추정" in notes["R3"]


def test_finding_history_and_parcel_all(api, h_nw):
    j = _get(api, "/survey/findings/f_R2_5219033033113950012", h_nw).json()
    assert [h["kind"] for h in j["history"]] and j["history_summary"] is not None
    p = _get(api, "/survey/parcels/5219045021110530012?with=facts,findings,history", h_nw).json()
    f = p["facts"]
    assert f["ledger"]["jimok_nm"] == "답" and f["ledger"]["owner_kind"] is None
    assert any(g["label"] == "소유구분 연속지적 미제공" for g in f["gaps"])
    assert f["current"]["2023"]["classes"]["bld"]["in_m2"]["value"] > 2400
    assert p["findings"][0]["id"] == "f_R1_5219045021110530012" and "explain" in p["findings"][0]
    assert "history" in p
    miss = _get(api, "/survey/findings?limit=2000", h_nw)       # 용도지역 미결합 결손 표기 확인용 필지
    assert miss.status_code == 200
    keys = set()

    def walk(o):
        if isinstance(o, dict):
            keys.update(o.keys())
            [walk(v) for v in o.values()]
        elif isinstance(o, list):
            [walk(v) for v in o]
    walk(p)
    assert not [k for k in keys if "owner_nm" in k.lower() or "성명" in k or k.lower() in ("owner", "owner_name", "name_owner")]
    assert "OWNER_NM" not in json.dumps(p, ensure_ascii=False)


def test_stats_equal_summary(api, h_nw):
    summ = json.loads((S.SURVEY_DIR / "namwon-parcel-emd-summary.json").read_text(encoding="utf-8"))
    by_cd: dict = {}
    for v in summ["by_emd"].values():
        a = by_cd.setdefault(v["emd_cd"], {"parcels": 0, "n": 0, "rule": {}, "prio": {}})
        a["parcels"] += v["parcels"]
        a["n"] += v["suspects_total"]
        for k, x in v["suspects"].items():
            a["rule"][k] = a["rule"].get(k, 0) + x
        for k, x in v["priority"].items():
            a["prio"][k] = a["prio"].get(k, 0) + x
    j = _get(api, "/survey/stats?by=emd", h_nw).json()
    assert len(j["items"]) == 39
    for it in j["items"]:
        a = by_cd[it["cd"]]
        assert it["parcels"]["value"] == a["parcels"] and sum(v["value"] for v in it["by_rule"].values()) == a["n"]
        assert {k: v["value"] for k, v in it["by_rule"].items()} == a["rule"]
        assert all(it["by_priority"][k]["value"] >= n for k, n in a["prio"].items())       # 대장 규칙(L-*) 행이 더해질 수 있다
    r = _get(api, "/survey/stats?by=rule", h_nw).json()
    assert {i["key"]: i["n"]["value"] for i in r["items"] if i["key"].startswith("R")} == S.README_COUNTS["by_rule"]
    p = _get(api, "/survey/stats?by=priority", h_nw).json()
    # 대장 규칙(L-*) 행이 같은 표에 더해진다 — 정본 R 등급은 하한, 합계는 서로 같아야 한다(숫자 한 출처)
    assert all(i["n"]["value"] >= S.README_COUNTS["by_priority"][i["key"]] for i in p["items"])
    s = _get(api, "/survey/stats?by=state", h_nw).json()
    assert sum(i["n"]["value"] for i in s["items"]) == sum(i["n"]["value"] for i in p["items"]) == r["total"]["value"]


def test_rules_endpoint(api, h_sales):
    j = _get(api, "/survey/rules", h_sales).json()           # sales 읽기 OK
    assert [i["id"] for i in j["items"]] == S.RULE_IDS
    assert all(i["basis"] == "estimate" for i in j["items"])
    assert {i["id"]: i["counts"]["total"]["value"] for i in j["items"]} == S.README_COUNTS["by_rule"]


def test_p95_findings_200_rows(api, h_nw):
    import statistics
    ms = []
    qs = ["limit=200", "rule=R1&priority=A&limit=200", "emd_cd=52190450&limit=200", "state=open&rule=R2&limit=200&sort=evid_m2",
          "priority=B&limit=200&offset=400"]
    for i in range(40):
        r = _get(api, "/survey/findings?" + qs[i % len(qs)], h_nw)
        ms.append(float(r.headers["x-lx-time-ms"]))
    p95 = statistics.quantiles(ms, n=20)[18]
    assert p95 <= 200, f"p95 {p95:.1f} ms"
