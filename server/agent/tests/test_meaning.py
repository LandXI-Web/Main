"""2차 판정 뒤 — 봉투 '뜻' 오용 · 인용 범위 승격 · 구조 숫자 · nearest · 보고서 .docx 정본 경로(F2-S build_draft). LLM 없이 결정적."""
import asyncio
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from agent import lint, report, runner  # noqa: E402
from agent.tools import Out  # noqa: E402
from landxi_api.deps import CAPS, Principal  # noqa: E402

STAFF = Principal("lx", "staff", None, "u_lx_staff", caps=CAPS[("lx", "staff")])


def env(v, u, basis="inferred"):
    return {"value": v, "unit": u, "basis": basis, "as_of": "2026-09-24", "source": "test"}


def make_ctx(rule="R2") -> runner.Ctx:
    """운봉읍 R2 초안과 같은 모양: ① survey_stats(집계) ② survey_findings(목록 + 필지 2개)."""
    ctx = runner.Ctx(run_id="run_test_meaning", principal=STAFF, token=None, context={})
    o1 = Out(source="GET /api/v1/survey/stats")
    o1.env("suspects", "운봉읍 의심 건수(규칙별 1행 · 전체)", env(1881, "count"))
    o1.env("suspect_parcels", "운봉읍 의심 필지 수(중복 제거)", env(1879, "필지"))
    o1.env("parcels", "운봉읍 연속지적 필지 수", env(31211, "필지", "recorded"))
    o1.env("rule_R1", "운봉읍 R1 무허가 건축 의심 건수", env(431, "count"))
    o1.env("rule_R2", "운봉읍 R2 휴경·전용 의심 건수", env(1309, "count"))
    o1.env("pri_A", "운봉읍 등급 A 건수", env(12, "count"))
    o1.citations.append({"kind": "stats", "emd": "운봉읍", "emd_cd": "52190250", "label": "운봉읍 집계"})
    ctx.steps.append({"i": 1, "tool": "survey_stats"})
    runner.register(ctx, 1, o1)                     # e1..e6 · [1]
    o2 = Out(source="GET /api/v1/survey/findings")
    o2.env("total", "조건(R2 · 운봉읍) 일치 의심 필지 전체", env(1309, "필지"))
    o2.env("shown", "점수 상위로 반환한 필지 수", env(2, "필지", "measured"))
    o2.env("pri_A", "조건 일치 중 등급 A", env(2, "필지"))
    o2.citations.append({"kind": "list", "emd_cd": "52190250", "rule": rule, "label": "R2 목록", "env_keys": ["total", "shown", "pri_A"]})
    for n, (pnu, addr, ev, cf) in enumerate([("5219025021113780003", "운봉읍 공안리 1378-3", 2870.4, 0.967),
                                             ("5219025022111650003", "운봉읍 화수리 1165-3", 3269.1, 0.912)], 1):
        o2.env(f"evid_{n}", f"[{n}] AI 근거 면적", env(ev, "m2"))
        o2.env(f"parcel_{n}", f"[{n}] 필지 면적(연속지적)", env(round(ev + 10), "m2", "recorded"))
        o2.env(f"conf_{n}", f"[{n}] 평균 신뢰도", env(cf, "ratio"))
        o2.citations.append({"kind": "parcel", "pnu": pnu, "addr": addr, "rule": rule, "priority": "A", "label": addr,
                             "env_keys": [f"evid_{n}", f"parcel_{n}", f"conf_{n}"]})
    ctx.steps.append({"i": 2, "tool": "survey_findings"})
    runner.register(ctx, 2, o2)                     # e7.. · [2] 목록 · [3][4] 필지
    return ctx


def test_ctx_shape():
    ctx = make_ctx()
    assert [c["kind"] for c in ctx.citations] == ["stats", "list", "parcel", "parcel"]
    assert ctx.keymap[(1, "parcels")] == "e3" and ctx.keymap[(1, "rule_R1")] == "e4"


def test_value_match_not_promoted_outside_citation():
    """판정 사례: '평균 신뢰도는 97%' — 1위 필지 conf 0.967 과 값이 같아도 그 필지를 인용하지 않은 문장이면 승격하지 않는다."""
    ctx = make_ctx()
    sc = lint.scope_of(ctx, strict=True)
    r = lint.lint("운봉읍 의심 필지의 평균 신뢰도는 97%임 [1].", ctx.envs, ctx.whitelist, scope=sc)
    assert r.promoted == [] and r.unverified_numbers == ["97%"]
    assert r.unverified[0]["reason"] == "value_outside_citation"
    # 그 필지를 인용한 문장에서는 % ↔ ratio 승격
    r2 = lint.lint("공안리 1378-3 필지의 평균 신뢰도는 97%임 [3].", ctx.envs, ctx.whitelist, scope=sc)
    assert r2.unverified == [] and r2.promoted[0]["env"] == ctx.keymap[(2, "conf_1")]


def test_percent_only_from_cited_parcel_ratio():
    ctx = make_ctx()
    sc = lint.scope_of(ctx, strict=True)
    r = lint.lint("화수리 1165-3 필지 신뢰도 97%임 [4].", ctx.envs, ctx.whitelist, scope=sc)   # 97% 는 [3] 의 값
    assert r.unverified_numbers == ["97%"]


def test_strict_report_needs_citation_env():
    ctx = make_ctx()
    r = lint.lint("운봉읍 연속지적은 31,211필지임.", ctx.envs, ctx.whitelist, scope=lint.scope_of(ctx, strict=True))
    assert r.unverified_numbers == ["31,211"]        # 인용 없는 문장 → 승격 없음
    r2 = lint.lint("운봉읍 연속지적은 31,211필지임 [1].", ctx.envs, ctx.whitelist, scope=lint.scope_of(ctx, strict=True))
    assert r2.unverified == [] and r2.promoted[0]["env"] == "e3"


def test_meaning_parcel_count_after_ri_is_flagged():
    """판정 사례: '공안리 31,211필지(연속지적 필지 수 e3) 및 화수리 431건(R1 건수 e4)는 등급 A로 분류' → 둘 다 뜻 어긋남."""
    ctx = make_ctx()
    md = "## 소견\n특히 공안리 {{env:e3}} 및 화수리 {{env:e4}}는 등급 A로 분류되어 현장 확인이 필요함 [2]."
    flags = lint.meaning_rules(md, ctx, "R2")
    assert len(flags) == 1 and set(flags[0]["envs"]) == {"e3", "e4"}
    assert "연속지적 필지 수" in flags[0]["reason"]


def test_meaning_other_rule_count_flagged():
    ctx = make_ctx()
    flags = lint.meaning_rules("## 개요\n운봉읍 의심 필지는 {{env:e4}}임 [1].", ctx, "R2")
    assert flags and "다른 규칙" in flags[0]["reason"]
    # 문장이 그 규칙을 직접 말하면 정상(비교 문장)
    assert lint.meaning_rules("## 개요\n참고로 R1 무허가 건축 의심은 {{env:e4}}임 [1].", ctx, "R2") == []


def test_meaning_parcel_env_in_other_parcel_sentence():
    ctx = make_ctx()
    e_ev1 = ctx.keymap[(2, "evid_1")]
    flags = lint.meaning_rules(f"화수리 1165-3 의 근거 면적은 {{{{env:{e_ev1}}}}}임 [4].", ctx, "R2")
    assert flags and "다른 필지" in flags[0]["reason"]


def test_meaning_ok_sentences_not_flagged():
    ctx = make_ctx()
    e_cf1, e_ev1 = ctx.keymap[(2, "conf_1")], ctx.keymap[(2, "evid_1")]
    md = ("## 개요\n운봉읍 연속지적 필지 수는 {{env:e3}}이며 R2 의심 건수는 {{env:e5}}임 [1].\n"
          f"## 소견\n공안리 1378-3 은 AI 근거 면적 {{{{env:{e_ev1}}}}}, 평균 신뢰도 {{{{env:{e_cf1}}}}}임 [3].")
    assert lint.meaning_rules(md, ctx, "R2") == []


def test_average_subject_with_single_parcel_value_flagged():
    ctx = make_ctx()
    e_ev1 = ctx.keymap[(2, "evid_1")]
    flags = lint.meaning_rules(f"상위 필지 전체 근거 면적은 {{{{env:{e_ev1}}}}}임 [3].", ctx, "R2")
    assert flags and "필지 한 개의 값" in flags[0]["reason"]


def test_structural_codes_ports_ordinals():
    r = lint.lint("관제 운영 에이전트(AG-6 · 2차) 몫입니다. 관제 화면(:8702)을 보세요. F2-E 결과.", {})
    assert r.unverified == []


def test_nearest_prefers_used_placeholder_then_primary():
    """'한 500건쯤?' → 칩은 같은 답에서 쓴 봉투(280) · 없으면 첫 도구 주 봉투. 값 근접은 마지막."""
    envs = {"e1": env(280, "count"), "e2": env(529, "count"), "e3": env(20852, "count")}
    r = lint.lint("인월면 R1 은 {{env:e1}}임 [1]. 한 500건은 아님.", envs, scope=lint.Scope(primary=["e3"]))
    assert r.unverified[0]["nearest"] == "e1" and r.unverified[0]["nearest_by"] == "used"
    r2 = lint.lint("대략 3만 건.", envs, scope=lint.Scope(primary=["e3"]))
    assert r2.unverified[0]["nearest"] == "e3" and r2.unverified[0]["nearest_by"] == "primary"


def test_render_plain_meaning_labels_and_flag():
    ctx = make_ctx()
    s = "특히 공안리 {{env:e3}}는 등급 A임 [2]."
    txt = report.render_plain(s, ctx.envs, [], ctx.env_meta, [{"sentence": s}])
    assert "31,211필지(기록 · 운봉읍 연속지적 필지 수)" in txt
    assert "[봉투 뜻 확인 필요]" in txt and txt.index("[봉투 뜻 확인 필요]") < txt.index("[2]")


F2S_DICT = {
    "citations": [{"n": 1, "label": "운봉읍 연속지적 필지 수", "value": env(31211, "필지")},
                  {"n": 2, "label": "실태조사 대상 후보(의심) 건수 · R2", "value": env(1309, "count")},
                  {"n": 3, "label": "그중 A등급(전체 점수 상위 5%)", "value": env(2, "count")},
                  {"n": 4, "label": "후보 필지 수", "value": env(1309, "필지")},
                  {"n": 5, "label": "미조치(open) 건수", "value": env(1309, "count")}],
    "top_items": [{"order": 1, "pnu": "5219025021113780003"}, {"order": 2, "pnu": "5219025022111650003"}],
    "table": [{"rule": "R2", "A": env(2, "count"), "B": env(198, "count"), "C": env(0, "count"), "total": env(1309, "count")}],
    "limit": 8,
}


def test_narrative_for_f2s_maps_citations_and_drops_unmapped():
    ctx = make_ctx()
    e_ev1 = ctx.keymap[(2, "evid_1")]
    md = ("## 개요\n운봉읍 연속지적 필지 수는 {{env:e3}}임 [1]. 운봉읍 전체 의심은 {{env:e1}}임 [1].\n"
          f"## 소견\n공안리 1378-3 [3] 의 근거 면적은 {{{{env:{e_ev1}}}}}임.\n"
          "## 조치 제안\n상위 필지는 현장조사 대상 후보임 [2]. AI 추론 · 검수 전 · 현장 확인 전 · 위법 판정 아님.")
    lr = lint.lint(md, ctx.envs, ctx.whitelist, scope=lint.scope_of(ctx, strict=True))
    narr, stat = report.narrative_for_f2s(lr.answer_md, lr, ctx, [], F2S_DICT)
    assert narr["overview"] == ["운봉읍 연속지적 필지 수는 31,211필지(기록 · 운봉읍 연속지적 필지 수)임 [1]."]
    assert stat["dropped_unmapped"] == 1            # 전 규칙 합계 1,881 은 F2-S 인용 목록에 없음 → 거짓 인용 대신 제외
    assert narr["findings"][0].startswith("공안리 1378-3(③ No 1) 의 근거 면적은 2,870㎡(AI 추론 · 검수 전 · AI 근거 면적)")
    assert stat["dropped_fixed"] == 1
    from survey import report as s_report
    ok, bad = s_report.check_narrative(narr, len(F2S_DICT["citations"]))
    assert ok is not None and bad == []


def test_build_docx_uses_f2s_canonical_path(monkeypatch):
    """F2-S server/survey/report.py 가 있으면 정본 경로(fmt='docx', realm, tenant)가 선택된다 — 로컬 임시 서식 아님."""
    from survey import report as s_report
    calls = []

    def fake(emd_cd, rule=None, top=20, narrative=None, fmt="dict", realm="lx", tenant=""):
        calls.append({"emd_cd": emd_cd, "rule": rule, "fmt": fmt, "realm": realm, "tenant": tenant, "narrative": narrative})
        return F2S_DICT if fmt == "dict" else b"PK-docx-bytes"
    monkeypatch.setattr(s_report, "build_draft", fake)
    ctx = make_ctx()
    md = "## 개요\n운봉읍 연속지적 필지 수는 {{env:e3}}임 [1]."
    lr = lint.lint(md, ctx.envs, ctx.whitelist, scope=lint.scope_of(ctx, strict=True))
    data, src, info = asyncio.run(report.build_docx("운봉읍", "52190250", "R2", 8, lr.answer_md, lr, ctx, {}, {}, "gemma", []))
    assert data == b"PK-docx-bytes" and info["path"] == "f2s"
    assert "F2-S 정본 서식" in src and "미도착" not in src
    assert [c["fmt"] for c in calls] == ["dict", "docx"] and calls[1]["realm"] == "lx" and calls[1]["tenant"] == "lx"
    assert calls[1]["narrative"]["overview"][0].endswith("[1].")


def test_build_docx_failure_reason_is_recorded(monkeypatch):
    from survey import report as s_report

    def boom(*a, **k):
        raise TypeError("build_draft() got an unexpected keyword argument 'format'")
    monkeypatch.setattr(s_report, "build_draft", boom)
    ctx = make_ctx()
    lr = lint.lint("## 개요\n운봉읍 연속지적 필지 수는 {{env:e3}}임 [1].", ctx.envs, ctx.whitelist, scope=lint.scope_of(ctx, strict=True))
    data, src, info = asyncio.run(report.build_docx("운봉읍", "52190250", "R2", 8, lr.answer_md, lr, ctx, {}, {}, "gemma", []))
    assert info["path"] == "local" and data[:2] == b"PK"
    assert "F2-S build_draft TypeError: build_draft() got an unexpected keyword argument 'format'" in src
    assert "미도착" not in src


@pytest.mark.skipif(not (Path(__file__).resolve().parents[2] / "survey" / "report.py").exists(), reason="F2-S 없음")
def test_real_f2s_build_draft_signature():
    import inspect
    from survey import report as s_report
    ps = inspect.signature(s_report.build_draft).parameters
    assert {"emd_cd", "rule", "top", "narrative", "fmt", "realm", "tenant"} <= set(ps)


def test_compare_direction_flagged():
    """'인월면 R1 280건' 뒤 '말씀하신 500건보다 많은 수치' → 비교 방향 반대(뜻 어긋남)."""
    envs = {"e4": env(280, "count")}
    md = "인월면 R1 무허가 건축 의심 건수는 {{env:e4}}입니다. 사용자가 말씀하신 {{unv:u1}}건보다 많은 수치로 확인되었습니다."
    f = lint.compare_check(md, envs, [{"id": "u1", "value": 500.0}])
    assert f and "비교 방향" in f[0]["reason"]
    assert lint.compare_check(md.replace("많은", "적은"), envs, [{"id": "u1", "value": 500.0}]) == []


# ── 3차 판정: 집계 문장의 F2-S 인용 번호 = 같은 값 · 같은 뜻 봉투 ─────────────────────────────
# 판정 지적: '해당 지역의 R1 무허가 건축 의심 건수는 387건임 [1]'([1] = 아영면 연속지적 필지 수 21,080) — 거짓 인용.
# 아래 F2-S 인용 목록은 server/survey/report.py build_draft('52190450', 'R1', 8, fmt='dict') 실호출(2026-09-27 05:1x)과 같은 라벨·값.
AY_F2S = {
    "citations": [{"n": 1, "label": "아영면 연속지적 필지 수", "value": env(21080, "필지", "measured")},
                  {"n": 2, "label": "실태조사 대상 후보(의심) 건수 · R1", "value": env(387, "count")},
                  {"n": 3, "label": "그중 A등급(전체 점수 상위 5%)", "value": env(67, "count")},
                  {"n": 4, "label": "후보 필지 수", "value": env(387, "필지")},
                  {"n": 5, "label": "미조치(open) 건수", "value": env(387, "count", "recorded")},
                  {"n": 6, "label": "R1 무허가 건축 의심 건수", "value": env(387, "count")}],
    "top_items": [{"order": 1, "pnu": "5219045021110530012"}],
    "table": [{"rule": "R1", "A": env(67, "count"), "B": env(272, "count"), "C": env(48, "count"), "total": env(387, "count")}],
    "limit": 8,
}


def make_ay_ctx() -> runner.Ctx:
    """take4 초안(run_260927044056c8b7da)과 같은 봉투: ① survey_stats 아영면 ② survey_findings R1 목록 + 필지 1."""
    ctx = runner.Ctx(run_id="run_test_ay", principal=STAFF, token=None, context={})
    o1 = Out(source="GET /api/v1/survey/stats")
    o1.env("parcels", "아영면 연속지적 필지 수", env(21080, "필지", "measured"))
    o1.env("rule_R1", "아영면 R1 무허가 건축 의심 건수", env(387, "count"))
    o1.env("open", "아영면 미조치(open) 건수", env(387, "count", "recorded"))
    o1.citations.append({"kind": "stats", "emd": "아영면", "emd_cd": "52190450", "label": "아영면 집계"})
    ctx.steps.append({"i": 1, "tool": "survey_stats"})
    runner.register(ctx, 1, o1)                     # e1 parcels · e2 rule_R1 · e3 open · [1]
    o2 = Out(source="GET /api/v1/survey/findings")
    o2.env("total", "조건(R1 · 아영면) 일치 의심 필지 전체", env(387, "필지"))
    o2.env("shown", "점수 상위로 반환한 필지 수", env(8, "필지", "measured"))
    o2.env("pri_A", "조건 일치 중 등급 A", env(67, "필지"))
    o2.env("pri_B", "조건 일치 중 등급 B", env(272, "필지"))
    o2.citations.append({"kind": "list", "emd_cd": "52190450", "rule": "R1", "label": "R1 목록", "env_keys": ["total", "shown", "pri_A", "pri_B"]})
    o2.env("evid_1", "[1] AI 근거 면적", env(2415.2, "m2"))
    o2.citations.append({"kind": "parcel", "pnu": "5219045021110530012", "addr": "아영면 아곡리 1053-12", "rule": "R1", "priority": "A",
                         "label": "아곡리 1053-12", "env_keys": ["evid_1"]})
    ctx.steps.append({"i": 2, "tool": "survey_findings"})
    runner.register(ctx, 2, o2)                     # [2] 목록 · [3] 필지
    return ctx


AY_MD = ("## 개요\n아영면의 연속지적 필지 수는 {{env:%(parcels)s}}임 [1]. 해당 지역의 R1 무허가 건축 의심 건수는 {{env:%(rule_R1)s}}임 [1].\n"
         "## 소견\n조건(R1 · 아영면) 일치 의심 필지 전체는 {{env:%(total)s}}임 [2]. 이 중 등급 A는 {{env:%(pri_A)s}}이며 등급 B는 {{env:%(pri_B)s}}임 [2]. "
         "점수 상위로 반환한 필지 수는 {{env:%(shown)s}}임 [2]. 등급 B는 {{env:%(pri_B)s}}임 [2].\n"
         "## 조치 제안\n아곡리 1053-12 [3] 의 현장 확인이 필요함.")


def _ay_narr(f2s):
    ctx = make_ay_ctx()
    k = {n: ctx.keymap[(i, n)] for (i, n) in ctx.keymap}
    lr = lint.lint(AY_MD % k, ctx.envs, ctx.whitelist, scope=lint.scope_of(ctx, strict=True))
    return ctx, lr, *report.narrative_for_f2s(lr.answer_md, lr, ctx, [], f2s)


def _cite_values_match(narr, f2s):
    """모든 집계 문장: 인용 [n] 의 F2-S 값이 그 문장에 쓴 숫자 중 하나와 같아야 한다(대체 번호 = 거짓 인용 금지)."""
    import re as _re
    val = {c["n"]: c["value"]["value"] for c in f2s["citations"]}
    for sec in narr.values():
        for line in sec:
            ns = [int(x) for x in _re.findall(r"\[(\d+)\]", line)]
            nums = {float(x.replace(",", "")) for x in _re.findall(r"(\d[\d,]*(?:\.\d+)?)(?=필지|건|㎡)", line)}
            if "③ No" in line and not nums - {1.0}:
                continue                              # 필지 목록 문장(집계 숫자 없음)
            for n in ns:
                assert float(val[n]) in nums, f"거짓 인용 [{n}]={val[n]} · 문장 숫자 {sorted(nums)} · {line}"


def test_ay_aggregate_sentences_cite_same_value_same_meaning():
    ctx, lr, narr, stat = _ay_narr(AY_F2S)
    ov = narr["overview"]
    assert ov[0].startswith("아영면의 연속지적 필지 수는 21,080필지") and ov[0].endswith("[1].")          # 21,080 ↔ [1]
    assert "387건" in ov[1] and ov[1].endswith("[2].") and "[1]" not in ov[1]                          # 387 R1 ↔ [2] (에이전트 [1] 이어도)
    fnd = narr["findings"]
    assert fnd[0].startswith("조건(R1 · 아영면) 일치 의심 필지 전체는 387") and fnd[0].endswith("[2].")
    assert "67필지" in fnd[1] and fnd[1].endswith("[3].") and "② 집계표 R1 B" in fnd[1]              # A 67 ↔ [3] · B 는 표 칸
    assert not any("8필지" in x for x in fnd)          # 반환 8필지: F2-S 인용 목록에 같은 값 없음 → 대체 [2](387) 대신 제외
    assert not any(x.startswith("등급 B는 272") for x in fnd)   # 표 칸만 가리키는 집계 문장 → 제외(거짓 인용 0)
    assert stat["dropped_unmapped"] == 2
    _cite_values_match(narr, AY_F2S)


def test_ay_same_value_other_meaning_never_cited():
    """387 은 [2] 후보 · [4] 후보 필지 · [5] 미조치 · [6] R1 건수 모두 같은 값 — 미조치 뜻 라벨은 R1 건수 문장의 인용이 될 수 없다."""
    ctx = make_ay_ctx()
    e_r1, e_open = ctx.keymap[(1, "rule_R1")], ctx.keymap[(1, "open")]
    assert report._f2s_cite_for(e_r1, ctx, AY_F2S["citations"]) == 2
    assert report._f2s_cite_for(e_open, ctx, AY_F2S["citations"]) == 5
    assert report._f2s_cite_for(ctx.keymap[(1, "parcels")], ctx, AY_F2S["citations"]) == 1
    swapped = {**AY_F2S, "citations": [AY_F2S["citations"][4]] + [c for c in AY_F2S["citations"] if c["n"] != 5]}
    assert report._f2s_cite_for(e_r1, ctx, swapped["citations"]) == 2          # 미조치가 먼저 와도 R1 건수 ↔ [2]


@pytest.mark.skipif(not (Path(__file__).resolve().parents[2] / "survey" / "report.py").exists(), reason="F2-S 없음")
def test_ay_real_f2s_build_draft_citations():
    """F2-S 정본 build_draft(dict) 실호출(PostGIS) — 인용 목록이 바뀌어도 같은 값·같은 뜻 봉투로만 옮겨지는지(21,080↔[1] · 387 R1↔[2])."""
    from survey import report as s_report
    try:
        f2s = s_report.build_draft("52190450", "R1", 8, None, "dict", "lx", "lx")
    except Exception as e:  # noqa: BLE001
        pytest.skip(f"PostGIS 없음: {type(e).__name__}")
    ctx, lr, narr, stat = _ay_narr(f2s)
    byl = {c["label"]: c["n"] for c in f2s["citations"]}
    assert narr["overview"][0].endswith(f"[{byl['아영면 연속지적 필지 수']}].")
    assert narr["overview"][1].endswith(f"[{byl['실태조사 대상 후보(의심) 건수 · R1']}].")
    _cite_values_match(narr, f2s)
    ok, bad = s_report.check_narrative(narr, len(f2s["citations"]))
    assert ok is not None and bad == []
