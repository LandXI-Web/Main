"""impl-21 학습-작업흐름-v3 — 프로젝트 학습 화면 기록(GET /projects/{pid}/train). GPU 0 · 쓰기 0(읽기만).

· LX 직원만(기관 거절) · 없는 프로젝트 404
· 줄마다 숫자는 봉투(학습 데이터 n장 · 반복 · 걸린 시간 · 정확도 · 반복마다 정확도) — 개발 모드 봉투 검사 통과
· 반복마다 정확도 칸 수 = 반복 횟수(끝난 학습) · 값은 0–1 · AI 모델 정확도 = 모델 기록 값과 같다(숫자 한 출처)
· 같은 검증 묶음 값은 검증 결과가 있을 때만(지어내지 않음)
"""
import httpx
import pytest

from conftest import B, login_lx, login_tenant


@pytest.fixture(scope="module")
def tok():
    return login_lx()


def H(t):
    return {"authorization": "Bearer " + t}


def _projects(tok):
    r = httpx.get(B + "/projects?scope=all", headers=H(tok), timeout=60)
    assert r.status_code == 200
    return r.json()["items"]


def test_train_board_shape_and_one_source(tok):
    ps = _projects(tok)
    assert ps, "진행 중 프로젝트가 없음"
    models = {m["id"]: m for m in httpx.get(B + "/registry/models?with=train", headers=H(tok), timeout=60).json()["items"]}
    seen_done = 0
    for p in ps:
        r = httpx.get(B + f"/projects/{p['id']}/train", headers=H(tok), timeout=60)
        assert r.status_code == 200, r.text[:300]
        j = r.json()
        assert j["project"] == p["id"] and isinstance(j["runs"], list)
        starts = [x["created_at"] for x in j["runs"]]
        assert starts == sorted(starts, reverse=True), "최근 순이 아님"
        for x in j["runs"]:
            assert x["state"] in ("queued", "running", "done")
            assert x["epochs"]["unit"] == "count" and x["epochs"]["value"] >= 1
            if x["data"] and x["data"].get("images"):
                assert x["data"]["images"]["unit"] == "count" and x["data"]["images"]["value"] > 0
            if x["state"] == "done" and x["model"]:
                seen_done += 1
                m = models.get(x["model"]["id"])
                assert m, "만든 모델이 장부에 없음"
                if x["log"]:
                    vals = x["log"]["value"]
                    assert len(vals) == x["epochs"]["value"], "반복마다 칸 수가 반복 횟수와 다름"
                    assert all(0 <= v <= 1 for v in vals)
                if x["acc"]:
                    mt = m["metrics"] or {}
                    raw = next(float(mt[k]["value"]) for k in ("mask_mAP50", "metrics/mAP50(M)", "box_mAP50", "metrics/mAP50(B)", "mAP50")
                               if isinstance(mt.get(k), dict) and mt[k].get("value") is not None)
                    assert x["acc"]["value"] == round(raw * 100)
            if x["same"]:
                assert x["same"]["value"]["unit"] == "%" and 0 <= x["same"]["value"]["value"] <= 100
    assert seen_done >= 1, "끝난 학습이 하나도 없음"


def test_train_board_guards(tok):
    assert httpx.get(B + "/projects/prj_nope000000/train", headers=H(tok), timeout=30).status_code == 404
    tt = login_tenant("namwon")
    assert httpx.get(B + f"/projects/{_projects(tok)[0]['id']}/train", headers=H(tt), timeout=30).status_code in (401, 403)
