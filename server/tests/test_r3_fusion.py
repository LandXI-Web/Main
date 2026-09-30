"""r3-fusion — 대장 결과 유지(사람별 · 기관별 최근 대장) · 이름표 = 값 · 대장 화면 개발 정보 0.

· 이어 열 대장 고르기(pick_recent): 이 사람 기억(시군구 → '*') → 없을 때만 기관 최근 대장 · 지워진·실패 반입은 건너뜀
· 규칙 재평가가 다른 담당자 · 다른 지역 대장의 결과를 지우지 않는다(지우는 범위 = 이번 반입 + 이번 대장 필지)
· GET …/registry/recent: 권한(다른 기관 403) · 남이 올린 대장이면 역할 · 날짜만(이름 · id 없음)
· 같은 기관 다른 담당자가 올려도 그 사람 대장이 먼저 열리지 않는다(올리기 → 결합 → recent)
· 대장 하나를 지우거나 기억이 비어도 내가 올린 대장이 남아 있으면 그 대장이 'mine' 으로 열린다(남의 대장 먼저 0)
· 올리고 지우는 시험은 시험 전용 담당자 두 명(시험 동안만 있음)으로 한다 — 실제 담당자 계정의 기억은 바꾸지 않는다
· GET …/parcels?ledger=1: 결합 필지 전체 = 대장에 이은 필지 수(이름표 '올린 대장 필지' 가 세는 집합) · 필지마다 대장 값
· 사용자에게 가는 글(봉투 출처 · 도구 뜻)에 'V-World' · 규칙 코드 · '에이전트' 0
· (실증 2차) 물어본 대장 지목('논인데 AI가 건물')을 빼고 세지 않는다 — 논 = 답 · 밭 = 전 · 과수원만. 못 거르면 조건을 뺐다고 밝힌다
게이트웨이가 없거나 새 경로가 아직 올라오지 않았으면 해당 시험만 건너뛴다. 기대값은 DB · API 에서 센다(고정 숫자 없음).
"""
import asyncio
import json
import re
import sys
import time
from pathlib import Path

import httpx
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from landxi_api import ledger as LG  # noqa: E402
from landxi_api import config  # noqa: E402

B = f"http://127.0.0.1:{config.API_PORT}/api/v1"
GJ = "gwangju-jeonnam"
BAD = re.compile(r"V-World|브이월드|에이전트|(?<![A-Za-z])[RL][1-9](?![0-9A-Za-z])|L-\*")


# ── 순수 함수 ─────────────────────────────────────────────────────────────
def test_pick_recent_prefers_mine_by_region_then_any():
    mine = [{"import_id": "a", "sgg_cd": "*", "at": "2026-09-30T01", "state": "matched"},
            {"import_id": "b", "sgg_cd": "46110", "at": "2026-09-29T01", "state": "matched"},
            {"import_id": "c", "sgg_cd": "46730", "at": "2026-09-30T02", "state": "matched"}]
    org = [{"import_id": "z", "latest": True, "sgg": ["46110"], "created_at": "2026-09-30T09", "state": "matched"}]
    assert LG.pick_recent(mine, org, "46110") == (mine[1], "mine")          # 그 시군구의 내 대장(기관의 더 새 대장보다 먼저)
    assert LG.pick_recent(mine, org, None) == (mine[0], "mine")             # 시군구 없이 = 내 가장 최근('*')


def test_pick_recent_skips_failed_and_falls_back_to_org():
    mine = [{"import_id": "a", "sgg_cd": "*", "at": "2026-09-30T01", "state": "failed"}]
    org = [{"import_id": "old", "latest": False, "sgg": ["46110"], "created_at": "2026-09-30T10", "state": "matched"},
           {"import_id": "cur", "latest": True, "sgg": ["46110"], "created_at": "2026-09-29T10", "state": "matched"},
           {"import_id": "far", "latest": True, "sgg": ["46730"], "created_at": "2026-09-30T11", "state": "matched"}]
    got, whose = LG.pick_recent(mine, org, "46110")
    assert (got["import_id"], whose) == ("cur", "org")                      # 기관 최근(latest) · 그 시군구를 덮는 것
    assert LG.pick_recent([], [], None) == (None, None)
    assert LG.pick_recent([], [o for o in org if o["import_id"] == "far"], "46110") == (None, None)


def test_pick_recent_own_upload_before_org_when_memory_empty():
    own = [{"import_id": "mine_old", "latest": False, "sgg": ["12130"], "created_at": "2026-09-30T05", "state": "matched"},
           {"import_id": "mine_far", "latest": False, "sgg": ["12730"], "created_at": "2026-09-30T04", "state": "matched"}]
    org = [{"import_id": "colleague", "latest": True, "sgg": ["12130"], "created_at": "2026-09-30T06", "state": "matched"}, *own]
    assert LG.pick_recent([], org, None, own) == (own[0], "mine")            # 기억이 지워져도 내가 올린 대장(동료의 더 새 대장보다 먼저)
    assert LG.pick_recent([], org, "12730", own) == (own[1], "mine")         # 그 시군구를 덮는 내 대장
    gone = [{"import_id": "deleted", "sgg_cd": "*", "at": "2026-09-30T07", "state": None}]
    assert LG.pick_recent(gone, org, None, own)[1] == "mine"                 # 기억이 지운 대장을 가리켜도
    assert LG.pick_recent([], org, None, [])[0]["import_id"] == "colleague"  # 내가 올린 대장이 없을 때만 기관 최근


def test_pick_recent_matching_is_mine():
    mine = [{"import_id": "new", "sgg_cd": "*", "at": "2026-09-30T05", "state": "matching"}]
    assert LG.pick_recent(mine, [], None)[1] == "mine"                       # 올린 직후 새로 고쳐도 내 대장(결합 중)


def test_rescore_delete_is_scoped_to_this_import_and_its_parcels():
    sql = LG.DEL_SCOPED
    assert "import_id=$4" in sql and "pnu = ANY($5::text[])" in sql         # 다른 담당자 · 다른 지역 대장의 다른 필지는 남는다
    assert "state='open'" in sql and "survey_actions" in sql                 # 사람이 손댄 결과는 그대로
    src = (ROOT / "landxi_api" / "ledger.py").read_text(encoding="utf-8")
    body = src[src.index("async def evaluate_rules"):src.index("DEL_SCOPED = (")]
    assert "DELETE FROM survey_findings" not in body                         # 옛 기관 전체 삭제가 남아 있지 않다


def test_user_facing_strings_have_no_dev_terms():
    src = (ROOT / "landxi_api" / "ledger.py").read_text(encoding="utf-8")
    for m in re.finditer(r'env\([^)]*?"(?:count|%|필지|m2|ratio)"[^)]*?,\s*"(?:measured|inferred|estimate|recorded)",\s*(f?"[^"]*"|src)', src):
        arg = m.group(1)
        if arg != "src":
            assert not BAD.search(arg), arg
    assert 'src = "대장 × 연속지적 매칭"' in src
    tools = ROOT / "agent" / "tools"
    lf = (tools / "ledger_findings.py").read_text(encoding="utf-8")
    assert "에이전트 질의" not in lf
    for name in ("ledger_ingest.py", "ledger_match.py", "ledger_rule.py"):
        t = (tools / name).read_text(encoding="utf-8")
        for m in re.finditer(r'out\.env\([^,]+,\s*(f?"[^"]*")', t):
            assert not BAD.search(m.group(1).replace("{_rule_name(k)}", "")), (name, m.group(1))


def test_fusion_meaning_drops_rule_codes():
    from agent.tools.ext import fusion as F
    for m in ("의심 필지(건 · 규칙 R1–R6)", "의심 필지 R1–R6", "의심 필지(중복 제거)"):
        assert not BAD.search(F._clean_meaning(m)), m
        assert "의심 필지" in F._clean_meaning(m)


# ── 게이트웨이(로그인 폼과 같은 /auth/login) ───────────────────────────────
def _login(login, tenant=None):
    body = {"realm": "tenant", "tenant_id": tenant, "login": login, "password": config.DEV_PASSWORD} if tenant else \
        {"realm": "lx", "login": login, "password": config.DEV_PASSWORD}
    r = httpx.post(B + "/auth/login", json=body, timeout=30)
    r.raise_for_status()
    return {"authorization": "Bearer " + r.json()["token"]}


@pytest.fixture(scope="module")
def gw():
    try:
        ok = httpx.get(B + "/health", timeout=5).json().get("ok")
    except Exception:
        ok = False
    if not ok:
        pytest.skip("게이트웨이 :8700 미기동")
    h = {"gj": _login("gj-manager", GJ), "nw": _login("namwon-manager", "namwon")}
    r = httpx.get(f"{B}/t/{GJ}/survey/registry/recent", headers=h["gj"], timeout=30)
    if r.status_code == 404:
        pytest.skip("새 경로(recent)가 아직 게이트웨이에 없음 — 게이트웨이 재기동 뒤")
    return h


def test_recent_permission_and_shape(gw):
    r = httpx.get(f"{B}/t/{GJ}/survey/registry/recent", headers=gw["nw"], timeout=30)
    assert r.status_code == 403                                              # 다른 기관
    j = httpx.get(f"{B}/t/{GJ}/survey/registry/recent", headers=gw["gj"], timeout=30).json()
    assert set(j) >= {"import", "whose", "uploader"}
    if j["import"]:
        assert j["whose"] in ("mine", "org")
        assert j["import"]["tenant_id"] == GJ
    txt = json.dumps(j, ensure_ascii=False)
    assert "V-World" not in txt and "u_gj" not in txt                         # 개발 정보 · 사람 id 0
    if j.get("uploader"):
        assert set(j["uploader"]) == {"role", "date"}                          # 역할 · 날짜만(이름 없이)


def test_parcels_ledger_is_full_matched_set(gw):
    j = httpx.get(f"{B}/t/{GJ}/survey/registry/recent", headers=gw["gj"], timeout=30).json()
    imp = j.get("import")
    if not imp or imp.get("state") != "matched":
        pytest.skip("결합된 대장 없음")
    iid = imp["import_id"]
    r = httpx.get(f"{B}/t/{GJ}/survey/registry/{iid}/parcels", params={"geom": 0, "ledger": 1}, headers=gw["gj"], timeout=120)
    assert r.status_code == 200
    fc = r.json()
    pn = [f["properties"]["pnu"] for f in fc["features"]]
    assert len(pn) == len(set(pn))                                           # 필지 하나 = 한 줄

    async def distinct_matched():
        from landxi_api import deps
        deps._pool = deps._pool_sys = deps._redis = None
        from landxi_api.deps import close, db
        async with db(realm="lx") as c:
            n = await c.fetchval("SELECT count(DISTINCT s.pnu) FROM registry_snapshots s JOIN survey_parcels p ON p.pnu=s.pnu "
                                 "WHERE s.import_id=$1 AND s.pnu IS NOT NULL", iid)
        await close()
        return int(n)
    assert len(pn) == asyncio.run(distinct_matched())                         # '올린 대장 필지' = 대장에 이은 필지 전체(결과 목록 수 아님)
    with_ledger = [f for f in fc["features"] if f["properties"].get("ledger")]
    assert with_ledger and all(set(f["properties"]["ledger"]) <= {"status", "jibun", "date", "use"} for f in with_ledger)
    assert "V-World" not in r.text


def _csv(pnus):
    return ("﻿PNU,상태\r\n" + "\r\n".join(f"{p},답" for p in pnus)).encode("utf-8")


def _admin(fn):
    """시험 준비 · 정리만 소유자 연결로(대조 · 시험 계정). 화면 판정에는 쓰지 않는다."""
    import asyncpg

    async def run():
        c = await asyncpg.connect(config.PG_ADMIN_DSN)
        try:
            return await fn(c)
        finally:
            await c.close()
    return asyncio.run(run())


TEST_USERS = {"a": ("u_r3ftest_a", "r3f-test-a"), "b": ("u_r3ftest_b", "r3f-test-b")}


@pytest.fixture(scope="module")
def testers(gw):
    """시험 전용 기관 담당자 두 명(광주전남) — 시험 동안만 있고 끝나면 계정 · 세션 · 기억 · 남은 대장을 걷는다.
    실제 담당자 계정(gj-manager · 별칭 담당자)의 기억은 건드리지 않는다. 기관 최근 대장(latest) 표시는 시험 대장을 뺀 가장 최근 결합 대장으로 되돌린다."""
    import secrets
    from argon2 import PasswordHasher
    pw = "r3f-" + secrets.token_urlsafe(12)
    hsh = PasswordHasher().hash(pw)
    ids = [u for u, _ in TEST_USERS.values()]

    async def setup(c):
        for uid, login in TEST_USERS.values():
            await c.execute("INSERT INTO tenant_users(id, tenant_id, login, pw_hash, role, status, name) VALUES ($1,$2,$3,$4,'manager','active','시험 담당자') "
                            "ON CONFLICT (id) DO UPDATE SET pw_hash=EXCLUDED.pw_hash, status='active'", uid, GJ, login, hsh)
    _admin(setup)
    h = {}
    try:
        for k, (_, login) in TEST_USERS.items():
            r = httpx.post(B + "/auth/login", json={"realm": "tenant", "tenant_id": GJ, "login": login, "password": pw}, timeout=30)
            r.raise_for_status()
            h[k] = {"authorization": "Bearer " + r.json()["token"]}
        yield h
    finally:
        async def unlatest(c):                     # 남은 시험 대장이 latest 면 지울 때 다른 대장을 다시 판정하지 않게 먼저 내린다
            await c.execute("UPDATE ledger_imports SET latest=false WHERE created_by = ANY($1::text[])", ids)
            return [r["id"] for r in await c.fetch("SELECT id FROM ledger_imports WHERE created_by = ANY($1::text[])", ids)]
        for iid in _admin(unlatest):
            httpx.delete(f"{B}/t/{GJ}/survey/registry/{iid}", headers=h.get("a") or gw["gj"], timeout=600)

        async def cleanup(c):
            await c.execute("DELETE FROM ledger_recent WHERE user_id = ANY($1::text[])", ids)
            await c.execute("DELETE FROM sessions WHERE user_id = ANY($1::text[])", ids)
            await c.execute("DELETE FROM tenant_users WHERE id = ANY($1::text[])", ids)
            # 기관 최근 대장 표시 = 시험 대장을 뺀 가장 최근 결합 대장(시험 중에 실제 담당자가 올렸으면 그 대장 · 아니면 시험 전 값)
            if not await c.fetchval("SELECT 1 FROM ledger_imports WHERE tenant_id=$1 AND kind='farm_ledger' AND latest", GJ):
                await c.execute("UPDATE ledger_imports SET latest=true WHERE id = (SELECT id FROM ledger_imports WHERE tenant_id=$1 AND kind='farm_ledger' "
                                "AND state='matched' ORDER BY created_at DESC LIMIT 1)", GJ)
        _admin(cleanup)


def _free_pnus(n):
    """이 기관의 어느 대장에도 없는 필지(다른 대장 결과를 건드리지 않게) · 결합된 대장이 있는 시군구에서."""
    async def q(c):
        sg = await c.fetchval("SELECT left(s.pnu, 5) FROM registry_snapshots s JOIN ledger_imports i ON i.id=s.import_id "
                              "WHERE i.tenant_id=$1 AND i.state='matched' AND s.pnu IS NOT NULL ORDER BY i.created_at DESC LIMIT 1", GJ)
        rows = await c.fetch("SELECT p.pnu FROM survey_parcels p WHERE p.pnu LIKE $1 AND NOT EXISTS (SELECT 1 FROM registry_snapshots s "
                             "WHERE s.tenant_id=$2 AND s.pnu=p.pnu) LIMIT $3", (sg or "_") + "%", GJ, n)
        return [r["pnu"] for r in rows]
    return _admin(q)


def _upload(h, pnus, name):
    r = httpx.post(f"{B}/t/{GJ}/survey/registry/import", headers=h, files={"file": (name, _csv(pnus), "text/csv")},
                   data={"kind": "farm_ledger"}, timeout=60)
    assert r.status_code == 202, r.text
    iid = r.json()["import_id"]
    c = httpx.post(f"{B}/t/{GJ}/survey/registry/{iid}/confirm", headers=h, json={"mapping": {"pnu": "PNU", "status": "상태"}}, timeout=60)
    assert c.status_code == 202, c.text
    return iid


def _wait(h, iid):
    t0, st = time.time(), None
    while time.time() - t0 < 300:
        st = httpx.get(f"{B}/t/{GJ}/survey/registry/{iid}", headers=h, timeout=30).json().get("state")
        if st in ("matched", "failed"):
            break
        time.sleep(1.5)
    assert st == "matched"


def _recent(h):
    return httpx.get(f"{B}/t/{GJ}/survey/registry/recent", headers=h, timeout=30).json()


def _delete(h, iid):
    d = httpx.delete(f"{B}/t/{GJ}/survey/registry/{iid}", headers=h, timeout=600)
    assert d.status_code == 200, d.text


def test_colleague_upload_does_not_take_over_my_ledger(gw, testers):
    """같은 기관 다른 담당자(시험 B)가 나중에 올려도 시험 A 의 이어 열기는 자기 대장 · B 는 자기 대장.
    gj-manager(실제 계정)의 이어 열기는 시험 전후가 같다(읽기만)."""
    real_before = _recent(gw["gj"])
    pn = _free_pnus(6)
    if len(pn) < 6:
        pytest.skip("필지 부족")
    a1 = _upload(testers["a"], pn[:3], "r3f_test_A_농지목록.csv")
    mid = _recent(testers["a"])
    assert (mid.get("import") or {}).get("import_id") == a1 and mid["whose"] == "mine"       # 결합 중에도 자기 대장
    _wait(testers["a"], a1)
    b1 = _upload(testers["b"], pn[3:6], "r3f_test_B_농지목록.csv")
    _wait(testers["b"], b1)
    a = _recent(testers["a"])
    assert a["import"]["import_id"] == a1 and a["whose"] == "mine" and not a.get("uploader")  # 동료가 나중에 올려도 내 대장
    b = _recent(testers["b"])
    assert b["import"]["import_id"] == b1 and b["whose"] == "mine"
    real_after = _recent(gw["gj"])
    if real_before.get("whose") == "mine":                                                     # 실제 담당자의 자기 대장은 그대로
        assert (real_after.get("import") or {}).get("import_id") == real_before["import"]["import_id"]
        assert real_after["whose"] == "mine"


def test_deleting_one_ledger_reopens_my_previous_not_colleagues(gw, testers):
    """실증 1차 must_fix: 대장 하나를 지우면 기억이 비어 동료 대장이 먼저 열렸다.
    ① A 가 새 대장을 올렸다 지우면 → A 의 이전 대장(mine) ② A 의 기억 행이 모두 없어도 → A 가 올린 대장(mine)
    ③ A 가 올린 대장이 하나도 없을 때만 → 기관 최근 대장(org · 올린 사람 역할 · 날짜)."""
    a_prev = _recent(testers["a"])
    if a_prev.get("whose") != "mine":
        pytest.skip("앞 시험(A 의 대장)이 먼저 돌아야 함")
    a1 = a_prev["import"]["import_id"]
    pn = _free_pnus(3)
    if len(pn) < 3:
        pytest.skip("필지 부족")
    a2 = _upload(testers["a"], pn, "r3f_test_A2_농지목록.csv")
    _wait(testers["a"], a2)
    assert _recent(testers["a"])["import"]["import_id"] == a2
    _delete(testers["a"], a2)
    r = _recent(testers["a"])
    assert r["import"]["import_id"] == a1 and r["whose"] == "mine" and not r.get("uploader")     # ① 지운 뒤 = 내 이전 대장

    async def wipe(c):
        await c.execute("DELETE FROM ledger_recent WHERE user_id=$1", TEST_USERS["a"][0])
    _admin(wipe)
    r = _recent(testers["a"])
    assert r["import"]["import_id"] == a1 and r["whose"] == "mine" and not r.get("uploader")     # ② 기억이 비어도 내가 올린 대장
    _delete(testers["a"], a1)
    r = _recent(testers["a"])
    if r["import"]:
        assert r["whose"] == "org" and r["import"]["import_id"] not in (a1, a2)                  # ③ 내 대장이 없을 때만 기관 최근
        assert r["uploader"] and set(r["uploader"]) == {"role", "date"} and r["uploader"]["role"] and r["uploader"]["date"]


# ── 실증 2차 must_fix: 물어본 지목('논')을 빼고 답하지 않는다 ─────────────────────────
from types import SimpleNamespace  # noqa: E402

from agent.tools import ledger_findings as LF  # noqa: E402
from agent.tools.ext import fusion as FU  # noqa: E402


def test_asked_jimok_words():
    A = LF.asked_jimok
    assert A("도암면 대장에서 논인데 AI가 건물로 본 필지 몇 건") == ["답"]
    assert A("대장상 답인데 건물") == ["답"] and A("대장상 전인데 건물") == ["전"] and A("밭인데 AI가 주차장") == ["전"]
    assert A("과수원인데 건물") == ["과수원"] and A("전·답 중 건물") == ["답", "전"] and A("지목이 답인 필지") == ["답"]
    for q in ("대장상 농지인데 AI가 건물로 본 필지 몇 건", "대장 전체에서 건물", "논산시 대장 건물", "답변해 줘 대장 건물", "논의 결과", "논·밭·과수원 건물"):
        assert A(q) == [], q                                                     # 농지 전체 · 지명 · 다른 낱말은 거르지 않는다
    assert [LF.jimok_of(v) for v in ("답", "논", "전", "밭", "과", "과수원", "")] == ["답", "답", "전", "전", "과수원", "과수원", None]


class _Res:
    def __init__(self, code, j):
        self.status_code, self._j = code, j

    def json(self):
        return self._j


def _envv(v):
    return {"value": v, "unit": "count", "basis": "inferred", "as_of": "2026-09-30T00:00:00+09:00", "source": "PostGIS survey_findings"}


def _fake_ctx(items, msg, evidence=True):
    """가짜 게이트웨이 — 대장 1건(결합 · AI 있음) · 규칙 결과 items(점수순) · 한 번에 50행(페이지를 넘겨 읽는지)."""
    imp = {"import_id": "imp_t", "state": "matched", "kind": "farm_ledger", "rows": _envv(len(items)), "ai": {"has": True}}
    rows = [{"id": f"f{i}", "pnu": f"4681034021100{i:06d}", "addr": f"전라남도 강진군 도암면 {e}리 {i}", "emd": "도암면", "jimok": "답",
             "evid_m2": _envv(100 + i), "priority": "A", "lnglat": [126.7 + i * 1e-4, 34.5],
             **({"evidence": {"ledger": {"col": "status", "value": jm}}} if evidence else {})} for i, (jm, e) in enumerate(items)]

    class Http:
        async def get(self, path, params=None):
            q = dict(params or {})
            if path.endswith("/survey/registry/recent"):
                return _Res(200, {"import": imp, "whose": "mine"})
            if path == "/survey/findings":
                off, lim = int(q.get("offset") or 0), int(q.get("limit") or 200)
                return _Res(200, {"items": rows[off:off + min(lim, 50)], "total": _envv(len(rows))})
            if path == "/survey/stats":
                return _Res(200, {"items": [{"key": "도암면", "ledger_findings": {"L1": _envv(len(rows))}}]})
            return _Res(404, {})
    p = SimpleNamespace(realm="tenant", role="manager", tenant_id=GJ)
    return SimpleNamespace(principal=p, http=Http(), context={}, envs={}, state={"msg": msg}, now=lambda: "2026-09-30T00:00:00+09:00")


def _env(out, key):
    return next(v for k, _, v in out.envelopes if k == key)


def _label(out, key):
    return next(m for k, m, _ in out.envelopes if k == key)


@pytest.fixture()
def no_geom(monkeypatch):
    from agent.tools import survey as SV

    async def none(ctx, pnus):
        return {}
    monkeypatch.setattr(SV, "_geoms", none)


DOAM = [("답", "항촌")] * 62 + [("전", "석문")] * 60 + [("과수원", "석문")] * 3      # 실증 2차 도암면 모양(답 62 · 전 60 · 과수원 3 = 125)


def test_ledger_findings_counts_only_asked_jimok(no_geom):
    """'논인데 건물' = 62 · '농지인데 건물' = 125(회귀 0) · jimok 인자 '전' = 60."""
    o = asyncio.run(LF.ledger_findings({"rule_id": "L1"}, _fake_ctx(DOAM, "도암면 대장에서 논인데 AI가 건물로 본 필지 몇 건")))
    assert _env(o, "total")["value"] == 62
    assert "답(논)" in _label(o, "total") and "답(논)" in o.data["조건"] and "지목" not in o.data
    assert _env(o, "emd_1")["value"] == 62                                      # 읍면동별도 거른 값
    o2 = asyncio.run(LF.ledger_findings({"rule_id": "L1"}, _fake_ctx(DOAM, "대장상 농지인데 AI가 건물로 본 필지 몇 건")))
    assert _env(o2, "total")["value"] == 125
    o3 = asyncio.run(LF.ledger_findings({"rule_id": "L1", "jimok": "전"}, _fake_ctx(DOAM, "")))
    assert _env(o3, "total")["value"] == 60
    for out in (o, o2, o3):
        txt = json.dumps([out.data, [m for _, m, _ in out.envelopes]], ensure_ascii=False)
        assert not BAD.search(txt), txt


def test_ledger_findings_says_when_jimok_cannot_be_split(no_geom):
    """결과에 대장 지목이 없으면 거르지 못한다 — 조건 없이 센 값이라고 밝힌다(물은 조건의 값처럼 보이지 않게)."""
    items = [("답", "항촌")] * 5 + [("전", "석문")] * 4
    o = asyncio.run(LF.ledger_findings({"rule_id": "L1"}, _fake_ctx(items, "논인데 AI가 건물로 본 대장 필지", evidence=False)))
    assert _env(o, "total")["value"] == 9
    assert "지목 조건 없이" in _label(o, "total") and "나누지 못했습니다" in o.data["지목"]


def test_fusion_route_and_answer_keep_jimok(no_geom):
    c = SimpleNamespace(principal=SimpleNamespace(realm="tenant", role="manager", tenant_id=GJ), context={}, lang="ko")
    r = FU.ROUTE("도암면 대장에서 논인데 AI가 건물로 본 필지 몇 건", c)
    assert r == {"tool": "fusion_ledger", "args": {"rule_id": "L1", "jimok": "답"}}
    assert FU.ROUTE("대장상 농지인데 AI가 건물로 본 필지 몇 건", c) == {"tool": "fusion_ledger", "args": {"rule_id": "L1"}}
    o = asyncio.run(FU.fusion_ledger(r["args"], _fake_ctx(DOAM, "")))
    assert _env(o, "total")["value"] == 62 and "답(논)" in o.answer and "{{total}}" in o.answer
    o2 = asyncio.run(FU.fusion_ledger(r["args"], _fake_ctx(DOAM, "", evidence=False)))
    assert o2.answer.startswith("지목별로는 나누지 못했습니다. 지목 조건 없이") and _env(o2, "total")["value"] == 125
    assert not BAD.search(o.answer + o2.answer)


def test_live_jimok_split_matches_server_results(gw):
    """실제 대장(광주전남 두 담당자가 이어 여는 대장): 논(답)으로 거른 수 = 서버 규칙 결과 중 대장 지목 답의 수 · 세 지목 합 = 전체."""
    heads = [gw["gj"]]
    try:
        heads.append(_login("gwangju-jeonnam-manager", GJ))
    except Exception:
        pass
    seen = 0
    for h in heads:
        imp = (_recent(h) or {}).get("import") or {}
        if imp.get("state") != "matched" or (imp.get("kind") or "farm_ledger") != "farm_ledger":
            continue
        allr = httpx.get(f"{B}/survey/findings", params={"rule": "L1", "ledger": imp["import_id"], "limit": 2000}, headers=h, timeout=60).json()
        tot = int(allr["total"]["value"] or 0)
        if not tot or tot > 2000:
            continue
        by = {}
        for it in allr["items"]:
            v = LF.jimok_of(LF._ledger_value(it))              # 서버 근거는 JSON 글자로 온다
            by[v] = by.get(v, 0) + 1

        async def go(q, h=h, imp=imp):
            async with httpx.AsyncClient(base_url=B, headers=h, timeout=120) as http:
                ctx = SimpleNamespace(principal=SimpleNamespace(realm="tenant", role="manager", tenant_id=GJ), http=http, context={}, envs={},
                                      state={"msg": q}, now=lambda: "")
                return await LF.ledger_findings({"rule_id": "L1", "import_id": imp["import_id"]}, ctx)
        o = asyncio.run(go("대장에서 논인데 AI가 건물로 본 필지 몇 건"))
        if None in by:
            assert "지목" in o.data                                            # 못 거르면 밝힌다
        else:
            assert _env(o, "total")["value"] == by.get("답", 0), (imp.get("file_name"), by)
            assert sum(by.values()) == tot
            assert _env(asyncio.run(go("대장상 농지인데 AI가 건물로 본 필지 몇 건")), "total")["value"] == tot
        seen += 1
    if not seen:
        pytest.skip("대조 결과가 있는 대장 없음")
