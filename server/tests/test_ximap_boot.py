"""impl-38 ximap-boot — XI맵 첫 화면 묶음(GET /ximap/boot)과 결과 목록 미리 계산.

· 묶음은 줄마다 경로 하나의 응답(application/x-ndjson · gzip 이면 줄마다 비움) — 맨 앞 줄 = 보낼 경로, 끝 줄 = 걸린 시간
· 묶음의 각 응답 = 같은 사람이 그 API 를 따로 부른 응답과 같은 값(숫자 한 출처 — 시각 칸만 다름)
· 기관 = 첫 지역(기관 이름 · 관할 한 곳)의 읍면동 경계 · 결과 목록 · 요약을 함께 · 관할 밖 지역을 주소로 줘도 그 지역 자료는 없음
· LX = 전국 결과 · 판 번호 · 밀도 · 영상 서명 · 로그인 없으면 401
· 결과 목록(GET /regions/{sgg}/results)은 같은 권한 범위 · 같은 결과 판이면 미리 센 목록 — 판이 바뀌면 새로 센다
판정 지역 인자(시험 파일만): 기준 52190.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from conftest import B, BASE, H  # noqa: E402

BASE_SGG = "52190"
TIME_KEYS = {"as_of", "at", "expires_at", "generated_at", "now", "server_time"}


def _boot(t, q=""):
    rows = []
    with httpx.stream("GET", B + "/ximap/boot" + q, headers={**H(t), "accept-encoding": "gzip"}, timeout=120) as r:
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("application/x-ndjson")
        for ln in r.iter_lines():
            if ln:
                rows.append(json.loads(ln))
    return rows


def _norm(x):
    if isinstance(x, dict):
        return {k: _norm(v) for k, v in x.items() if k not in TIME_KEYS}
    if isinstance(x, list):
        return [_norm(v) for v in x]
    return x


def _same_as_direct(t, rows, skip=lambda p: False):
    items = {x["p"]: x for x in rows if "p" in x}
    n = 0
    for p, x in items.items():
        if skip(p) or p.startswith("/tiles/sign"):
            continue
        d = httpx.get((BASE if p.startswith("/tiles") else B) + p, headers=H(t), timeout=120)
        assert x["s"] == d.status_code, p
        if d.status_code == 200:
            assert _norm(x["b"]) == _norm(d.json()), p
            n += 1
    return items, n


def test_boot_tenant_same_values_and_home(tok):
    rows = _boot(tok["namwon"], "?service=card-farm")
    assert "plan" in rows[0] and "/me" in rows[0]["plan"]
    assert "took" in rows[-1]
    assert any(x.get("final") for x in rows)
    home = next(x for x in rows if "home" in x)["home"]
    assert home == BASE_SGG                                    # 기관 이름이 시군구 하나(남원시) → 그 시군구
    items, n = _same_as_direct(tok["namwon"], rows, skip=lambda p: p == "/auth/session")
    for p in ("/me", "/auth/tenants", "/regions?geom=1", "/survey/stats?by=emd", f"/regions/{BASE_SGG}/emd", f"/regions/{BASE_SGG}/results",
              f"/summary?region={BASE_SGG}", "/spaces/me/guides/card-farm"):
        assert items[p]["s"] == 200, p
    assert n >= 15
    assert all(x["s"] == 200 for x in items.values())


def test_boot_tenant_out_of_scope_region(tok):
    rows = _boot(tok["gj"], f"?region={BASE_SGG}")              # 관할 밖 시군구를 주소로 줘도 그 지역 자료는 묶음에 없다
    home = next(x for x in rows if "home" in x)["home"]
    assert home != BASE_SGG
    assert not any(x.get("p", "").startswith(f"/regions/{BASE_SGG}/") for x in rows)


def test_boot_lx_board_and_signs(tok):
    rows = _boot(tok["staff"])
    items, n = _same_as_direct(tok["staff"], rows, skip=lambda p: p in ("/auth/session", "/ximap/density?g=0"))
    for p in ("/me", "/ximap/board", "/national/progress", "/catalog/layers?stage=domestic&build=lx&locale=ko"):
        assert items[p]["s"] == 200, p
    assert "/survey/stats?by=emd" not in items                 # LX 첫 화면은 기다리지 않는 큰 집계 — 따로 받는다
    signs = [p for p in items if p.startswith("/tiles/sign?set=cog%2F")]
    assert signs and all(items[p]["s"] == 200 and "sig=" in items[p]["b"]["url"] for p in signs)
    assert n >= 9


def test_boot_needs_login(live):
    assert httpx.get(B + "/ximap/boot", timeout=30).status_code == 401


def test_region_results_cached_same(tok):
    u = B + f"/regions/{BASE_SGG}/results"
    a = httpx.get(u, headers=H(tok["namwon"]), timeout=120).json()
    b = httpx.get(u, headers=H(tok["namwon"]), timeout=120).json()
    assert _norm(a) == _norm(b) and a["items"]
    s = httpx.get(u, headers=H(tok["staff"]), timeout=120).json()   # 다른 권한 범위(LX)는 따로 센다 — 기관 목록을 빌려 쓰지 않는다
    assert {i["id"] for i in a["items"]} <= {i["id"] for i in s["items"]}
