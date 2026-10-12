"""바퀴 6 · XI맵 빛나는 밀도(원칙 204 · 10-12 답 '빛나는 밀도 → 실제 객체').

① GET /ximap/density?g=0|1 — 전국 결과 객체 중심을 격자 칸으로 센 것. 칸 = [x, y, 묶음 번호, 수] 를 이어 붙인 한 줄.
② 숫자 한 출처: 묶음마다 칸 합 = 전국 결과(GET /ximap/board)의 그 결과 수 · 서비스마다 칸 합 = 전국 결과 서비스 수.
③ 칸 자리는 그 결과가 있는 시군구 범위 안(지어낸 자리 0) · 기관 계정은 볼 수 없다.
실행: python -m pytest server/tests/test_impl20_ximap_glow.py -q   (게이트웨이 :8700 · GPU 0)
"""
import httpx
import pytest

from conftest import B, H


def get(t, p):
    r = httpx.get(B + p, headers=H(t), timeout=60)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def board(tok):
    return get(tok["staff"], "/ximap/board")


@pytest.mark.parametrize("g", [0, 1])
def test_density_sums_match_board(tok, board, g):
    d = get(tok["staff"], f"/ximap/density?g={g}")
    assert d["g"] in (0.02, 0.004) and len(d["cells"]) % 4 == 0 and d["cells"]
    items = [(r["name"], x["svc"], x["n"]["value"]) for r in board["regions"] for x in r["items"]]
    assert sorted((s["region"], s["svc"], s["n"]) for s in d["sets"]) == sorted(items)
    per = [0] * len(d["sets"])
    for i in range(0, len(d["cells"]), 4):
        assert d["cells"][i + 3] > 0
        per[d["cells"][i + 2]] += d["cells"][i + 3]
    for s, n in zip(d["sets"], per):
        assert n == s["n"] == s["n_cells"], s                   # 칸 합 = 그 결과 수
    svc = {}
    for s, n in zip(d["sets"], per):
        svc[s["svc"]] = svc.get(s["svc"], 0) + n
    assert svc == {s["id"]: s["n"]["value"] for s in board["services"]}   # 서비스 수 = 전국 결과 서비스 수


def test_density_cells_inside_regions(tok, board):
    d = get(tok["staff"], "/ximap/density?g=1")
    bbox = {r["name"]: r["bbox"] for r in board["regions"] if r.get("bbox")}
    out = 0
    for i in range(0, len(d["cells"]), 4):
        s = d["sets"][d["cells"][i + 2]]
        b = bbox.get(s["region"])
        if not b:
            continue
        x, y = (d["cells"][i] + 0.5) * d["g"], (d["cells"][i + 1] + 0.5) * d["g"]
        if not (b[0] - 0.01 <= x <= b[2] + 0.01 and b[1] - 0.01 <= y <= b[3] + 0.01):
            out += 1
    assert out == 0


def test_density_scope(tok):
    assert httpx.get(B + "/ximap/density?g=0", headers=H(tok["sales"]), timeout=30).status_code == 200
    assert httpx.get(B + "/ximap/density?g=9", headers=H(tok["staff"]), timeout=30).status_code == 400
    assert httpx.get(B + "/ximap/density?g=0", headers=H(tok["namwon"]), timeout=30).status_code in (401, 403)
