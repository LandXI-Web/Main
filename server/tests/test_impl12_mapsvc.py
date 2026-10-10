"""구현 12차 · 지도 서비스(원칙 149 · 163 · 확인 대장 10-10 질문 1 ⓑ) · 영상 고르기(질문 3 ⓐ · 원칙 153). 실서버(:8700) · GPU 0(분석은 넣지 않는다).

  GET /me/analyses                 내가 돌린 분석 — 분석서비스(카드) · 프로젝트 묶음별 · 결과 수 = 작업 기록(counts 합) · XI맵 실시간 · 말로 분석 0 · 기관 계정 403
  GET /cards/{카드}/imagery?region  그 시군구를 덮는 공유 영상 후보 + 이 서비스에 맞나 + 서버가 고를 영상(pick)
  GET /cards/{카드}/fit?imagery=     고른 영상으로 판정 · 후보 밖 영상은 400
  추론 '결과 보기'(release infer href) = 지도 서비스
"""
import httpx
import psycopg

from conftest import B, H
from landxi_api import config

CARD = "card-5e85a9"     # 비닐하우스 분석서비스(정식 · 남원 전역 결과가 있는 카드)


def pg():
    return psycopg.connect(config.PG_ADMIN_DSN, autocommit=True)


def test_my_analyses_groups(live, tok):
    r = httpx.get(B + "/me/analyses", headers=H(tok["staff"]), timeout=60)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["groups"] and j["total"] == sum(len(g["items"]) for g in j["groups"])
    jobs = [it["job"] for g in j["groups"] for it in g["items"]]
    assert len(jobs) == len(set(jobs))
    with pg() as c:
        rows = {x[0]: x for x in c.execute(
            "SELECT j.id, j.card_id, j.options, j.counts, j.submitted_by FROM jobs j WHERE j.id = ANY(%s)", (jobs,)).fetchall()}
    for g in j["groups"]:
        assert g["kind"] in ("card", "project") and g["name"]
        for it in g["items"]:
            jid, card, opt, counts, by = rows[it["job"]]
            assert card or (opt or {}).get("project_infer")                    # 카드 분석 또는 프로젝트 추론만(XI맵 실시간 · 말로 분석 0)
            assert not (opt or {}).get("live")
            assert it["found"]["value"] == sum(int(v or 0) for v in (counts or {}).values())   # 숫자 한 출처 = 작업 기록
            assert it["set"] == f"results/lx/{jid}" and len(it["bounds"]) == 4
            assert it["region"] and "/" not in it["region"]
            if g["kind"] == "card":
                assert by == "u_mail_test"                                    # 카드 분석은 내가 돌린 것만
    body = r.text
    assert "path_internal" not in body and "cog/" not in body


def test_my_analyses_tenant_forbidden(live, tok):
    assert httpx.get(B + "/me/analyses", headers=H(tok["namwon"]), timeout=30).status_code == 403
    assert httpx.get(B + "/me/analyses", timeout=30).status_code == 401


def test_my_analyses_other_staff_empty(live, tok):
    """관리자 계정(카드 분석을 돌리지 않은 사람)에게 직원의 카드 결과가 보이지 않는다 — ?job= 로 한 건만 연다(배포 신청 검토)."""
    mine = httpx.get(B + "/me/analyses", headers=H(tok["staff"]), timeout=60).json()
    card_jobs = [it["job"] for g in mine["groups"] if g["kind"] == "card" for it in g["items"]]
    adm = httpx.get(B + "/me/analyses", headers=H(tok["admin"]), timeout=60).json()
    seen = {it["job"] for g in adm["groups"] for it in g["items"]}
    with pg() as c:
        adm_by = {x[0] for x in c.execute("SELECT id FROM jobs WHERE submitted_by=(SELECT id FROM lx_users WHERE login='lxadmin@lx.or.kr')").fetchall()}
    assert not ((set(card_jobs) - adm_by) & seen)
    one = httpx.get(B + "/me/analyses", params={"job": card_jobs[0]}, headers=H(tok["admin"]), timeout=60).json()
    assert card_jobs[0] in {it["job"] for g in one["groups"] for it in g["items"]}


def test_imagery_options_and_fit(live, tok):
    st = H(tok["staff"])
    r = httpx.get(B + f"/cards/{CARD}/imagery", params={"region": "52190"}, headers=st, timeout=120)
    assert r.status_code == 200, r.text
    j = r.json()
    items = j["items"]
    assert items and items[0]["pick"] and sum(1 for x in items if x["pick"]) == 1     # 서버가 고를 영상이 맨 앞 · 하나
    for x in items:
        assert x["fit"] in ("ok", "rough", "no") and x["fit_text"] and x["range"] and x["footprint"]["type"] in ("Polygon", "MultiPolygon")
        assert x["gsd_word"] and x["when"]
    assert "path" not in r.text and "cog/" not in r.text
    other = next((x for x in items if not x["pick"] and x["fit"] != "no"), None)
    if other:
        f = httpx.get(B + f"/cards/{CARD}/fit", params={"region": "52190", "imagery": other["id"]}, headers=st, timeout=120).json()
        assert f["fits"] is True and f["scope_text"]
    bad = httpx.get(B + f"/cards/{CARD}/fit", params={"region": "52190", "imagery": "no-such-imagery"}, headers=st, timeout=60)
    assert bad.status_code == 400
    assert httpx.get(B + f"/cards/{CARD}/imagery", params={"region": "52190"}, headers=H(tok["namwon"]), timeout=30).status_code == 403


def test_release_result_link_is_map_service(live, tok):
    with pg() as c:
        pid = c.execute("SELECT options->>'project_id' FROM jobs WHERE kind='infer' AND state='done' AND options->>'project_infer'='true' "
                        "AND submitted_by='u_mail_test' ORDER BY finished_at DESC LIMIT 1").fetchone()
    assert pid and pid[0]
    j = httpx.get(B + f"/release/projects/{pid[0]}/infer", headers=H(tok["staff"]), timeout=60).json()
    done = [x for x in j["jobs"] if x["state"] == "done"]
    assert done and all(x["href"].startswith("/landxi/v3/lx-map/?job=") for x in done)
    assert not any("xi-clean" in (x.get("href") or "") for x in j["jobs"])
