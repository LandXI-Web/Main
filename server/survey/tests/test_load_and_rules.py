"""적재 count = README 표 · 규칙 SQL 재평가 = 정본 20,872(집합 · 점수) · 어댑터 39칸 합 = 정본 · join 뼈대."""
import json
import uuid

from survey import db as S
from survey import rules as R


def test_load_counts_equal_readme(pg):
    E = S.README_COUNTS
    q = lambda sql: pg.execute(sql).fetchone()[0]  # noqa: E731
    C = "sgg_cd IN (SELECT DISTINCT sgg_cd FROM survey_parcels WHERE src = 'canon')"
    F = f"rule LIKE 'R%' AND {C}"
    assert q("SELECT count(*) FROM survey_parcels WHERE src = 'canon'") == E["parcels"]
    assert round(q("SELECT sum(area_m2) FROM survey_parcels WHERE src = 'canon'") / 1e6, 2) == E["area_km2"]
    assert q(f"SELECT count(*) FROM survey_findings WHERE {F}") == E["suspects"]
    assert q(f"SELECT count(DISTINCT pnu) FROM survey_findings WHERE {F}") == E["suspect_parcels"]
    assert q("SELECT count(*) FROM survey_timeline") == E["timeline"]
    assert q(f"SELECT count(*) FROM survey_emd WHERE {C}") == E["emd"]
    assert dict(pg.execute(f"SELECT rule, count(*) FROM survey_findings WHERE {F} GROUP BY 1").fetchall()) == E["by_rule"]
    assert dict(pg.execute(f"SELECT priority, count(*) FROM survey_findings WHERE {F} GROUP BY 1").fetchall()) == E["by_priority"]


def test_findings_emd_json_written_after_verify():
    d = json.loads(S.FINDINGS_EMD_JSON.read_text(encoding="utf-8"))
    assert len(d["items"]) == 39
    assert d["totals"]["suspects"] == 20872 and d["totals"]["by_rule"] == S.README_COUNTS["by_rule"]
    assert d["verified"]["failed"] == 0
    assert sum(i["suspects"] for i in d["items"]) == 20872
    assert sum(i["parcels"] for i in d["items"]) == 332084


def test_no_owner_name_column(pg):
    cols = [r[0] for r in pg.execute("SELECT column_name FROM information_schema.columns WHERE table_name LIKE 'survey_%'").fetchall()]
    assert not [c for c in cols if "owner" in c.lower() or "성명" in c or c.lower().endswith("_nm") and c not in ("rule_nm", "jimok_nm")]


def test_sql_reevaluation_equals_canon(pg):
    rows = pg.execute(R.eval_sql(R.default_thresholds(), emd_cd=False)).fetchall()
    got = {(r[0], r[1]): round(r[5], 1) for r in rows}
    canon = {(r, p): s for r, p, s in pg.execute("SELECT rule, pnu, score FROM survey_findings WHERE rule LIKE 'R%%' AND sgg_cd IN "
                                                  "(SELECT DISTINCT sgg_cd FROM survey_parcels WHERE src = 'canon')").fetchall()}
    assert set(got) == set(canon)
    assert sum(got[k] == canon[k] for k in canon) == len(canon) == 20872


def test_threshold_override_changes_counts(pg):
    th = R.merge_thresholds({"R1_bld_m2": 100})
    n = pg.execute(f"SELECT count(*) FROM ({R.eval_sql(th, ['R1'], emd_cd=False)}) q").fetchone()[0]
    assert 0 < n < 4140


def test_threshold_common_locked():
    import pytest
    with pytest.raises(ValueError):
        R.merge_thresholds({"conf_min": 0.3})
    with pytest.raises(ValueError):
        R.merge_thresholds({"R9": 1})


def test_adapter_plan_39_and_sum_equals_canon():
    import importlib.util
    from adapters.base import Shard
    spec = importlib.util.spec_from_file_location("t_adapter_rules", str(S.config.SERVER_ROOT / "adapters/survey/adapter_rules.py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    job = {"id": "pytest-" + uuid.uuid4().hex[:8], "options": {"sgg_cd": "52190"}}     # 판정 지역(정본) 인자
    shards = m.plan(job)
    assert len(shards) == 39 and all(s["shard_id"].startswith("emd-") for s in shards)
    ad = m.make_adapter()
    tot = {r: 0 for r in S.RULE_IDS}
    ms = []
    try:
        for s in shards:
            res = ad.run_shard(Shard(s["shard_id"], job["id"], tuple(s["bbox"]), None, s["params"]), None, {"job_id": job["id"]})
            for k, v in res.metrics["classes"].items():
                tot[k] += v
            ms.append(res.ms)
            ev = res.metrics["events"][0]
            assert ev["event"] == "survey.finding" and len(ev["data"]["top"]) <= 3
        assert tot == S.README_COUNTS["by_rule"]
        assert max(ms) <= 2000, f"읍면동 1칸 ≤ 2s [목표] — 최대 {max(ms)} ms"
        fin = m.finalize(job)
        assert fin["counts"] == S.README_COUNTS["by_rule"] and fin["survey"]["canon"]["equal"] is True
    finally:
        ad.unload()
        with S.pg() as c:
            S.lx_tx(c)
            c.execute("DELETE FROM survey_runs WHERE job_id=%s", (job["id"],))
            c.commit()


def test_adapter_join_skeleton_smallest_emd():
    import importlib.util
    from adapters.base import Shard
    spec = importlib.util.spec_from_file_location("t_adapter_join", str(S.config.SERVER_ROOT / "adapters/survey/adapter_join.py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    assert m.ADAPTER["hidden"] is True and m.ADAPTER["kinds"] == ["join"]
    # 적재값(a23_*)은 남원 기준 세트(namwon-landcover-2023)에서 왔다. survey_sgg.job_id 는 새 전역 분석으로 바뀔 수 있어(09-30 01:41 재적재)
    # 대조 원천을 명시한다 — 원천을 비우면 '현재 AI 작업'과 대조하므로 차이가 나는 것이 정상.
    sh = [s for s in m.plan({"options": {"emd_cd": ["52190105"], "source_set": "results/lx/namwon-landcover-2023"}})]
    assert len(sh) == 1
    res = m.Adapter().run_shard(Shard(sh[0]["shard_id"], "pytest", tuple(sh[0]["bbox"]), None, sh[0]["params"]), None, {})
    assert res.metrics["parcels"] == 333 and res.metrics["write"] is False
    assert res.metrics["diff_max_m2"] < 1.0, res.metrics


def test_plan_rejects_unknown_rule_and_threshold():
    """F2 통합(F2-S must_fix): R9 · 모르는 임계는 견적 단계 plan() 에서 rule_requires_missing 으로 거절(조용한 전 규칙 대체 0)."""
    import importlib.util
    import pytest
    spec = importlib.util.spec_from_file_location("t_adapter_rules2", str(S.config.SERVER_ROOT / "adapters/survey/adapter_rules.py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    for o in ({"rules": ["R9"]}, {"rules": []}, {"thresholds": {"bogus": 1}}, {"thresholds": {"R1_bld_m2": -1}}):
        with pytest.raises(ValueError, match=r"^rule_requires_missing:"):
            m.plan({"options": o})
    assert len(m.plan({"options": {"rules": ["R1", "R2"], "sgg_cd": "52190"}})) == 39
