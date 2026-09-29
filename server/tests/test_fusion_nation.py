"""core-fusion — 행정데이터 융합 + AI 도우미를 어느 기관·시군구에서나.

· 도구 명세·설명문·기본값에 지역 문자열 0(전국 시군구 이름 전부와 대조)
· 기관 경계: 기관 세션이 관할 밖 시군구를 물으면 403 · LX 는 region 인자로
· 대장 규칙 L-* 피연산자: 옛 이름(a23_*) · 일반 이름(ai.<cls>.<field>) 둘 다
· 옛/새 시군구 코드 PNU 는 지금 코드로(contract-parcel-ai §1)
· 규칙 평가 = 저장된 의심과 같은 수(한 출처) · AI 없는 시군구는 판정하지 않는다(ai.has=false)
기대값은 설정·문항 파일·DB 에서 센다(고정 숫자 없음). DB·게이트웨이가 없으면 해당 시험만 건너뛴다.
"""
import asyncio
import re
import sys
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from landxi_api import ledger as LG  # noqa: E402
from landxi_api.deps import CAPS, Principal  # noqa: E402


def _fresh():
    from landxi_api import deps
    deps._pool = deps._pool_sys = deps._redis = None


def _regions():
    from landxi_api.regions import regions_base
    regs, _, _ = regions_base()
    return regs


def _db_up() -> bool:
    try:
        async def ping():
            from landxi_api.deps import close, db
            async with db(realm="lx") as c:
                await c.fetchval("SELECT 1")
            await close()
        _fresh()
        asyncio.run(ping())
        return True
    except Exception:
        return False


# ── 지역 문자열 0 ─────────────────────────────────────────────────────────
def test_tool_specs_have_no_region_names():
    from agent import runner  # noqa: F401 — 대장·요약 도구 등록
    from agent.tools import registry
    names = set()
    for r in _regions():
        nm = (r.get("name") or "").split(" ")[0]
        if len(nm) >= 2:
            names.add(nm)
            if nm[-1] in "시군" and len(nm) >= 3:
                names.add(nm[:-1])
    text = yaml.safe_dump(registry.SPECS, allow_unicode=True)
    hits = sorted(n for n in names if re.search(r"(?<![가-힣])" + re.escape(n) + r"(?![가-힣])", text))
    assert hits == [], hits


def test_tool_sources_have_no_fixed_region():
    """도구 · 규칙 평가 · 도우미 라우터 소스에 특정 기관·시군구 고정값이 없다(시군구 코드 · 기관 id · 영문 지명)."""
    tenants = [t for t in (yaml.safe_load((ROOT / "config" / "regions.yaml").read_text(encoding="utf-8")).get("tenants") or {}) if not t.startswith("lx")]
    files = [*(ROOT / "agent" / "tools").glob("*.py"), ROOT / "agent" / "audit.py", ROOT / "agent" / "report.py",
             ROOT / "landxi_api" / "ledger.py", ROOT / "landxi_api" / "agent.py"]
    codes = {r["sgg_cd"] for r in _regions()} | {r.get("prev_cd") for r in _regions() if r.get("prev_cd")}
    bad = []
    for f in files:
        s = f.read_text(encoding="utf-8")
        for t in tenants:
            if re.search(r"[\"'/]" + re.escape(t) + r"[\"'/\-]", s):
                bad.append((f.name, t))
        for c in re.findall(r"(?<!\d)(\d{5})(?!\d)", s):
            if c in codes:
                bad.append((f.name, c))
    assert bad == [], bad


# ── 기관 경계 · 지역 인자 ────────────────────────────────────────────────
def _scope_cfg():
    return yaml.safe_load((ROOT / "config" / "regions.yaml").read_text(encoding="utf-8")).get("tenants") or {}


def _pick_regions():
    """관할이 겹치지 않는 두 기관과 각 기관의 관할 시군구 하나(설정에서)."""
    from landxi_api.regions import in_scope
    out = []
    for t, v in _scope_cfg().items():
        sc = v.get("sgg") or []
        if t.startswith("lx") or v.get("global") or not sc:
            continue
        r = next((r for r in _regions() if any(in_scope(c, sc) for c in (r["sgg_cd"], r.get("prev_cd")) if c)), None)
        if r:
            out.append((t, r))
    return out


def test_region_guard_other_tenant_region_is_403():
    from agent.tools import ToolError
    from agent.tools import scope as S
    pairs = _pick_regions()
    assert len(pairs) >= 2
    (ta, ra), (tb, rb) = pairs[0], pairs[1]

    class C:
        def __init__(self, p):
            self.principal, self.context = p, {}
    pa = Principal("tenant", "manager", ta, "u_a", caps=CAPS[("tenant", "manager")])
    with pytest.raises(ToolError) as e:
        asyncio.run(S.region_of(C(pa), {"region": rb["name"]}))
    assert e.value.status == 403
    got = asyncio.run(S.region_of(C(pa), {"region": ra["name"]}))
    assert got["sgg"] == ra["sgg_cd"]
    lx = Principal("lx", "staff", None, "u_lx", caps=CAPS[("lx", "staff")])
    for r in (ra, rb):
        g = asyncio.run(S.region_of(C(lx), {"region": r["name"]}))
        assert g["sgg"] == r["sgg_cd"] and r["sgg_cd"] in g["codes"]


def test_old_code_pnu_becomes_current():
    changed = [r for r in _regions() if r.get("prev_cd")]
    if not changed:
        pytest.skip("코드가 바뀐 시군구 없음")
    r = changed[0]
    pnu = r["prev_cd"] + "1" * 14
    assert LG.canon_pnu(pnu) == r["sgg_cd"] + "1" * 14
    assert LG.canon_pnu(r["sgg_cd"] + "2" * 14) == r["sgg_cd"] + "2" * 14


def test_tenant_words_come_from_config():
    from agent import audit
    tw = audit.tenant_words()
    from landxi_api.regions import in_scope
    for t, v in _scope_cfg().items():
        if t.startswith("lx"):
            continue
        assert t in tw and tw[t], t
        for px in v.get("sgg") or []:
            if len(px) == 5:
                r = next((r for r in _regions() if px in (r["sgg_cd"], r.get("prev_cd"))), None)
                if r:
                    stem = r["name"][:-1] if r["name"][-1] in "시군" else r["name"]
                    assert stem.lower() in tw[t]
        assert in_scope  # 관할 판정 함수 존재


# ── 규칙 피연산자 ───────────────────────────────────────────────────────
def test_generic_and_legacy_operands_agree():
    par = {"a23_bld_in_m2": 40.0, "a23_bld_m2": 55.0, "a23_bld_n": 2, "a23_bld_conf": 0.7, "r23_bld": 0.2, "r23_farm": 0.05}
    for gen, old in (("ai.bld.in_m2", "ai.a23_bld_in_m2"), ("ai.bld.hit_m2", "ai.a23_bld_m2"), ("ai.bld.n", "ai.a23_bld_n"),
                     ("ai.bld.conf", "ai.a23_bld_conf"), ("ai.ratio.bld", "ai.r23_bld"), ("ai.ratio.farm", "ai.r23_farm")):
        assert LG._operand(gen, {}, par, {}) == LG._operand(old, {}, par, {})


def test_ledger_rules_read_known_operands():
    for rid, d in LG.ledger_rules().items():
        refs = []

        def walk(c):
            if "all" in c or "any" in c:
                for x in c.get("all") or c.get("any"):
                    walk(x)
            else:
                refs.extend(x for x in (c.get("left"), c.get("right")) if isinstance(x, str) and x.startswith("ai."))
        walk(d["when_"])
        for ref in refs:
            assert LG._operand(ref, {}, {"a23_bld_in_m2": 1, "r23_crop": 0.1, "r23_gh": 0.1}, {}) is not None, (rid, ref)


# ── DB: 한 출처 · 정직 ─────────────────────────────────────────────────
def test_evaluate_matches_stored_findings():
    """최신 반입(규칙이 도는 대장)마다 다시 평가한 의심 수 = survey_findings 에 저장된 그 반입의 의심 수(한 출처)."""
    if not _db_up():
        pytest.skip("PostGIS 미기동")
    _fresh()

    async def go():
        from landxi_api.deps import close, db
        try:
            async with db(realm="lx") as c:
                imps = await c.fetch("SELECT id, tenant_id, kind FROM ledger_imports WHERE latest AND state='matched' ORDER BY created_at DESC LIMIT 4")
                stored = {}
                for i in imps:
                    stored[i["id"]] = {r["rule"]: int(r["n"]) for r in await c.fetch(
                        "SELECT rule, count(*) n FROM survey_findings WHERE import_id=$1 AND state='open' GROUP BY 1", i["id"])}
            touched = {}
            for i in imps:
                acted = 0
                async with db(realm="lx") as c:
                    acted = await c.fetchval("SELECT count(*) FROM survey_findings WHERE import_id=$1 AND state<>'open'", i["id"])
                if acted:
                    continue                      # 사람이 손댄 의심이 있는 반입은 재평가 대조에서 뺀다(상태가 남는다)
                st = await LG.evaluate_rules(i["tenant_id"], i["id"], i["kind"])
                touched[i["id"]] = (st, stored[i["id"]])
            return touched
        finally:
            await close()
    got = asyncio.run(go())
    for iid, (st, before) in got.items():
        after = {k: v for k, v in (st.get("findings") or {}).items() if v}
        assert after == {k: v for k, v in before.items() if v}, (iid, after, before)
        if not (st.get("ai") or {}).get("has"):
            assert not after, iid                 # AI 없는 시군구는 판정 0


def test_ai_parcels_honest_without_ai():
    """AI 가 없는 시군구(survey_sgg.state no_ai)의 필지는 규칙 행에 들어가지 않는다."""
    if not _db_up():
        pytest.skip("PostGIS 미기동")
    _fresh()

    async def go():
        from landxi_api.deps import close, db
        try:
            async with db(realm="lx") as c:
                sg = await c.fetchrow("SELECT sgg_cd FROM survey_sgg WHERE state='no_ai' LIMIT 1")
                if not sg:
                    return None
                pn = [r["pnu"] for r in await c.fetch("SELECT pnu FROM survey_parcels WHERE sgg_cd=$1 LIMIT 50", sg["sgg_cd"])]
                return await LG.ai_parcels(c, pn)
        finally:
            await close()
    got = asyncio.run(go())
    if got is None:
        pytest.skip("AI 없이 적재된 시군구 없음")
    rows, ai = got
    assert rows == {} and ai["has"] is False


# ── HTTP(게이트웨이) ────────────────────────────────────────────────────
def _gw():
    import httpx
    try:
        r = httpx.get("http://127.0.0.1:8700/api/v1/openapi.json", timeout=5)
        return r.json().get("paths") or {}
    except Exception:
        return None


def test_ledger_schema_route_for_tenant_session():
    paths = _gw()
    if paths is None:
        pytest.skip("게이트웨이 미기동")
    if not any(p.endswith("/survey/ledger-schema") for p in paths):
        pytest.skip("게이트웨이가 아직 이 코드로 다시 뜨지 않음")
    assert any(p.endswith("/survey/registry/{import_id}/parcels") for p in paths)
