"""바퀴 5 · XI맵 — 열자마자 전국 결과 · 그 자리 고치기(원칙 196 10-11 18:52 고침 · 191 · 182).

① 전국 결과 한 번 호출: 시군구 × 서비스 → 수(봉투) · 끝난 시각 · 영상 · 그릴 결과 층 · 밀도(칠하기용). 같은 분석(모델 · 영상 · 분류가 같음)은 한 번만.
② 수 = 그 결과 묶음 객체 수(겹침 정리 후) — 결과 조회(GET /results/{묶음}/features 의 count)와 같은 값(숫자 한 출처).
③ 고치기 다섯(분류 바꾸기 · 모양 고치기 · 지우기 · 새로 그리기 · 메모)이 원래 모양을 남기고 기록되며, 되돌리면 그대로 돌아온다(모두 시험 표시).
④ 지운 것 · 새로 그린 것은 전국 결과 수에 곧바로 반영되고, 되돌리면 원래 수.
⑤ 영업 계정은 볼 수만 있다(고치기 403) · 편집용 단순화 모양은 꼭짓점이 원래보다 적다.
실행: python -m pytest server/tests/test_impl18_ximap.py -q   (게이트웨이 :8700 · GPU 0)
"""
import httpx
import pytest

from conftest import B, H


def get(t, p):
    r = httpx.get(B + p, headers=H(t), timeout=60)
    assert r.status_code == 200, r.text
    return r.json()


def post(t, p, body):
    return httpx.post(B + p, headers=H(t), json=body, timeout=60)


@pytest.fixture(scope="module")
def board(tok):
    return get(tok["staff"], "/ximap/board?fresh=1")


def test_board_one_call(board):
    assert board["n_regions"]["value"] == len(board["regions"]) > 0
    for r in board["regions"]:
        assert r["items"] and r["n"]["value"] == sum(x["n"]["value"] for x in r["items"])
        for x in r["items"]:
            assert x["layer"]["set"] and x["layer"]["path"].endswith(".pmtiles")
        sets = [x["layer"]["set"] for x in r["items"]]
        assert len(sets) == len(set(sets))
    assert {s["id"] for s in board["services"]} == {x["svc"] for r in board["regions"] for x in r["items"]}


def test_count_matches_results(tok, board):
    r = next(r for r in board["regions"] for x in r["items"] if x["layer"]["set"].split("/")[-1].startswith("job_"))
    x = next(x for x in r["items"] if x["layer"]["set"].split("/")[-1].startswith("job_"))
    fc = get(tok["staff"], f"/results/{x['layer']['set']}/features?limit=1")
    assert fc["lx"]["total"] == x["n"]["value"]


def _pick(tok, board):
    x = next(x for r in board["regions"] for x in r["items"] if x["layer"]["set"].split("/")[-1].startswith("job_") and x["n"]["value"] > 10)
    s = x["layer"]["set"]
    f = get(tok["staff"], f"/results/{s}/features?limit=1")["features"][0]
    return s, f["id"], x


def test_edit_and_undo(tok, board):
    t = tok["staff"]
    s, fid, x = _pick(tok, board)
    f0 = get(t, f"/ximap/feature?set={s}&fid={fid}")
    assert f0["edit"]["n_vertices_edit"]["value"] <= f0["edit"]["n_vertices"]["value"]
    cls0, area0 = f0["properties"]["cls"], f0["properties"]["area_m2"]
    other = next((c for c in f0["meta"]["classes"] if c != cls0), None)
    ids = []
    if other:
        r = post(t, "/ximap/edits", {"set": s, "fid": fid, "action": "reclass", "cls": other, "test": True}).json()
        assert r["feature"]["properties"]["cls"] == other
        ids.append(r["edit"]["id"])
        r = post(t, f"/ximap/edits/{ids.pop()}/undo", {}).json()
        assert r["feature"]["properties"]["cls"] == cls0
    r = post(t, "/ximap/edits", {"set": s, "fid": fid, "action": "reshape", "geometry": f0["edit"]["geometry"], "test": True}).json()
    r = post(t, f"/ximap/edits/{r['edit']['id']}/undo", {}).json()
    assert r["feature"]["properties"]["area_m2"] == area0 and r["feature"]["properties"]["edit_state"] == f0["properties"]["edit_state"]
    m = post(t, "/ximap/edits", {"set": s, "fid": fid, "action": "memo", "memo": "시험 메모", "test": True}).json()
    hist = get(t, f"/ximap/feature?set={s}&fid={fid}")["history"]
    assert hist[0]["action"] == "memo" and hist[0]["test"]
    post(t, f"/ximap/edits/{m['edit']['id']}/undo", {})


def test_delete_add_counts(tok, board):
    t = tok["staff"]
    s, fid, x = _pick(tok, board)
    n0 = x["n"]["value"]
    f0 = get(t, f"/ximap/feature?set={s}&fid={fid}")
    d = post(t, "/ximap/edits", {"set": s, "fid": fid, "action": "delete", "test": True}).json()
    a = post(t, "/ximap/edits", {"set": s, "action": "add", "cls": f0["properties"]["cls"], "geometry": f0["edit"]["geometry"], "test": True}).json()
    a2 = post(t, "/ximap/edits", {"set": s, "action": "add", "cls": f0["properties"]["cls"], "geometry": f0["edit"]["geometry"], "test": True}).json()
    try:
        live = get(t, f"/ximap/edits?sets={s}")
        assert {e["properties"]["action"] for e in live["features"]} >= {"delete", "add"}
        b = get(t, "/ximap/board?fresh=1")
        n1 = next(i["n"]["value"] for r in b["regions"] for i in r["items"] if i["layer"]["set"] == s)
        assert n1 == n0 + 1                                   # -1 지움 +2 새로 그림
    finally:
        for e in (a2, a, d):
            post(t, f"/ximap/edits/{e['edit']['id']}/undo", {})
    b = get(t, "/ximap/board?fresh=1")
    assert next(i["n"]["value"] for r in b["regions"] for i in r["items"] if i["layer"]["set"] == s) == n0
    assert get(t, f"/ximap/feature?set={s}&fid={fid}")["properties"]["edit_state"] == f0["properties"]["edit_state"]


def test_sales_read_only(tok, board):
    s, fid, _ = _pick(tok, board)
    st = tok.get("sales")
    if not st:
        pytest.skip("영업 계정 토큰 없음")
    assert httpx.get(B + "/ximap/board", headers=H(st), timeout=30).status_code == 200
    assert post(st, "/ximap/edits", {"set": s, "fid": fid, "action": "delete"}).status_code == 403


def test_summary_project_link(tok):
    j = get(tok["staff"], "/ximap/edits/summary")
    assert "total" in j and isinstance(j["items"], list)
