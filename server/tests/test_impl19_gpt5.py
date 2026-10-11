"""GPT 바퀴 5 보완(impl-19/gpt5) — 실서버(:8700) · GPU 0 · vLLM 0 · 쓰기 0.

  GPT5-1  서비스 수 한 출처 — 메인 '서비스 n가지'(GET /public/record) = XI맵 전국 결과 '서비스 n가지'(GET /ximap/board n_services)
          · 토지피복 같은 서비스 아닌 전역 분석은 kind=analysis 로 따로(같은 이름의 수에 넣지 않는다)
  GPT5-3  보고서 면적 반올림 — 분류 · 읍면동 ha 칸의 합 = 합계(반올림 전 면적의 합을 한 번 반올림 · 최대 나머지 방식) · 읍면동 하나만 골라도 같음
"""
import httpx
import pytest

from conftest import B, H
from landxi_api.envelope import split_round

CARD = "card-farm"


def v(e):
    return e["value"] if isinstance(e, dict) else e


def test_split_round_sums():
    assert split_round([34.96, 5.86], 1) == [35.0, 5.8]                            # 35.0 + 5.9 = 40.9 였던 꼴 → 합 40.8
    for parts in ([1.25] * 4, [33.3333] * 3, [0.04, 0.04, 0.04], [350.6, 59.4, 0.0], []):
        tot = round(sum(parts), 1)
        assert round(sum(split_round(parts, 1)), 1) == tot
    assert sum(split_round([10.4, 10.4, 10.4], 0)) == 31
    assert split_round([0.0, 0.0], 1) == [0.0, 0.0]


def test_service_count_one_source(tok):
    rec = httpx.get(B + "/public/record", timeout=60).json()
    bd = httpx.get(B + "/ximap/board", headers=H(tok["staff"]), timeout=120).json()
    svc = [s for s in bd["services"] if s["kind"] == "service"]
    assert v(bd["n_services"]) == len(svc) == v(rec["services"]["n"])            # 메인 = XI맵(같은 이름 = 같은 값)
    assert {s["name"] for s in svc} == set(rec["services"]["names"])
    assert all(s["id"] in ("landcover", "ai") for s in bd["services"] if s["kind"] == "analysis")


@pytest.fixture(scope="module")
def rep(tok):
    r = httpx.get(B + "/spaces/me/report", params={"card": CARD}, headers=H(tok["namwon"]), timeout=180)
    if r.status_code == 404:
        pytest.skip("남원 경작·휴경 결과 설명서 없음")
    return r.json()


def _sums_ok(d):
    tot = v(d["area_ha"])
    assert round(sum(v(c["ha"]) for c in d["classes"]), 1) == tot
    assert round(sum(v(e["ha"]) for e in d["emd_rows"]), 1) == tot


def test_report_area_sums(rep, tok):
    _sums_ok(rep)
    for e in rep["emd_rows"][:6]:                                                  # 읍면동 하나만 고른 보고서도(운봉읍 등)
        if e["emd"] == "읍면동 밖":
            continue
        d = httpx.get(B + "/spaces/me/report", params={"card": CARD, "emd": e["emd"]}, headers=H(tok["namwon"]), timeout=120).json()
        _sums_ok(d)
