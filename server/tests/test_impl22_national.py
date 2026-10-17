"""구현 22 · 전국 결과 자산(원칙 136 · 211 · 218 · 10-12 12:45 확인) — 작업기 · 진행 · XI맵 지도 조각.

① GET /national/progress — 숫자 봉투 · 진행 % = 끝난 범위 ÷ 전체 범위(장부와 같음) · 칸 숫자 합 = 장부 합 · 시험 칸은 숫자에 없음 · 기관 계정 막힘
② PUT /national/settings — LX 관리자만
③ GET /tiles/national/... — 판 번호(맞으면 1년 보관 · 옛 판 no-cache) · 칸 층 · 시험 결과는 test=1 일 때만
④ 쉬는 시간 판정 = 재학습 스케줄러(landxi_api.core.quiet)와 같은 규칙 · 같은 설정
⑤ 영상 API 원천 — 영상 목록 · 영상 고르기에 나오지 않음 · 칩 한 장 읽기(국토지리정보원 타일 · 메모리만)
실행: python -m pytest server/tests/test_impl22_national.py -q   (게이트웨이 :8700 · GPU 0 · ⑤는 바깥 인터넷)
"""
import datetime as dt
import gzip
import json
import sys
from pathlib import Path

import httpx
import psycopg
import pytest

from conftest import B, H

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from national.common import KST, env_file, quiet  # noqa: E402

ROOT = B.rsplit("/api/v1", 1)[0]


def db():
    return psycopg.connect(env_file()["PG_ADMIN_DSN"], autocommit=True)


def get(t, p):
    r = httpx.get(B + p, headers=H(t), timeout=60)
    assert r.status_code == 200, r.text
    return r.json()


def test_progress_one_source(tok):
    j = get(tok["staff"], "/national/progress")
    with db() as c:
        year = j["year"]
        for a in ("farm", "river"):
            A = j["assets"][a]
            for k in ("pct", "done_km2", "total_km2", "cells", "done"):
                assert set(A[k]) >= {"value", "unit", "basis", "source"}, k
            tot, done, n = c.execute("SELECT coalesce(sum(target_km2) FILTER (WHERE state<>'skip'),0), coalesce(sum(target_km2) FILTER (WHERE state='done'),0), "
                                     "count(*) FILTER (WHERE state='done') FROM national_cells WHERE asset=%s AND year=%s AND NOT test", (a, year)).fetchone()
            assert A["total_km2"]["value"] == round(float(tot), 1)
            assert A["done"]["value"] == n
            assert A["pct"]["value"] == (round(100.0 * float(done) / float(tot), 1) if tot else 0.0)
            # 칸 숫자 합 = 장부(끝난 칸) 합 — 시험 칸은 장부에 없다
            rows = c.execute("SELECT k, sum((v->>'n')::bigint) FROM national_cells, jsonb_each(counts) e(k, v) WHERE asset=%s AND year=%s AND state='done' AND NOT test GROUP BY k",
                             (a, year)).fetchall()
            assert {k: int(v) for k, v in rows} == {k: v["n"]["value"] for k, v in A["counts"].items()}
        assert j["tonight"]["est_km2"]["basis"] in ("measured", "estimate")
        # 원칙 221 — 학습 장비가 놀 때면 언제든: 일정은 시간대가 아니라 '지금' · 하루 예상 = 속도 × 24시간 · 남은 날 = 남은 ㎢ ÷ 하루 예상
        S = j["schedule"]
        assert S["mode"] == "idle" and isinstance(S["idle_now"], bool)
        assert S["est_km2_day"]["basis"] in ("measured", "estimate") and S["est_km2_day"]["value"] > 0
        on = (c.execute("SELECT value FROM lx_settings WHERE key='national.run'").fetchone() or [{}])[0] or {}
        on = (json.loads(on) if isinstance(on, str) else on).get("assets") or ["farm", "river"]      # 켠 자산만(10-12 하천은 사용자 자료 뒤 다시)
        left = sum(j["assets"][a]["total_km2"]["value"] - j["assets"][a]["done_km2"]["value"] for a in on)
        model = (json.loads(c.execute("SELECT value::text FROM lx_settings WHERE key='national.run'").fetchone()[0]) or {}).get("model") or j["model"]["id"]
        left += float(c.execute("SELECT coalesce(sum(target_km2),0) FROM national_cells WHERE year=%s AND NOT test AND state='done' AND asset = ANY(%s) "
                                "AND model_id IS DISTINCT FROM %s", (year, on, model)).fetchone()[0])   # 구현 28 — 새 판으로 다시 할 끝난 칸도 남은 일
        assert abs(S["days_left"]["value"] - left / S["est_km2_day"]["value"]) < 0.2
        assert set(j["v"]) == {"farm", "river"}


def test_progress_scope(tok):
    assert httpx.get(B + "/national/progress", headers=H(tok["namwon"]), timeout=30).status_code == 403
    assert httpx.put(B + "/national/settings", json={"enabled": True}, headers=H(tok["staff"]), timeout=30).status_code == 403
    j = get(tok["staff"], "/national/progress")
    r = httpx.put(B + "/national/settings", json={"enabled": j["enabled"]}, headers=H(tok["admin"]), timeout=30)
    assert r.status_code == 200 and r.json()["settings"]["enabled"] == j["enabled"]


def test_tile_version_cache(tok):
    j = get(tok["staff"], "/national/progress")
    v = j["v"]["farm"]
    u = f"{ROOT}/tiles/national/farm/{j['year']}/6/54/25.pbf"
    r = httpx.get(u + f"?v={v}", timeout=60)
    assert r.status_code == 200 and r.headers["x-lx-ver"] == v
    assert "immutable" in r.headers["cache-control"]
    data = gzip.decompress(r.content) if r.content[:2] == b"\x1f\x8b" else r.content
    assert b"cells" in data                                              # 칸(분석 예정 · 끝남) 층
    old = httpx.get(u + "?v=old", timeout=60)
    assert old.headers["cache-control"] == "no-cache"                     # 옛 판 = 보관 안 함(작업기가 칸을 마치면 주소가 바뀐다)


def test_test_results_hidden_unless_asked(tok):
    """시험 칸 결과(낮 시험)는 XI맵 기본 객체 · 숫자에 들어가지 않는다 — test=1 로만(증거 촬영). 객체 줄은 데이터베이스에 남지 않는다."""
    with db() as c:
        row = c.execute("SELECT job_id, bbox, result_set FROM national_jobs WHERE test AND state='done' AND bbox IS NOT NULL LIMIT 1").fetchone()
        if not row:
            pytest.skip("시험 칸 결과 없음(정리됨)")
        assert c.execute("SELECT count(*) FROM detections WHERE job_id=%s", (row[0],)).fetchone()[0] == 0   # C: 데이터베이스에 객체 0
    bb = ",".join(str(v) for v in row[1])
    a = get(tok["staff"], f"/national/sets?asset=farm&bbox={bb}")
    b = get(tok["staff"], f"/national/sets?asset=farm&bbox={bb}&test=1")
    assert row[2] not in {x["set"] for x in a["sets"]}
    s = next(x for x in b["sets"] if x["set"] == row[2])
    r = httpx.get(f"{ROOT}/tiles/mvt/{s['set']}/14/0/0.pbf?v={s['v']}", timeout=60)
    assert r.status_code in (200, 204) and "immutable" in r.headers["cache-control"]   # 결과 묶음 지도 조각 = 판 번호 주소(1년 보관)


def test_quiet_same_rule_as_retrain():
    from landxi_api.core import quiet as core_quiet
    st = {"quiet_start": "22:00", "quiet_end": "06:00", "weekend": True}
    for d, h in [(12, 13), (12, 22), (13, 5), (13, 6), (17, 14), (18, 9)]:      # 10-12 월 · 10-17 토 · 10-18 일
        at = dt.datetime(2026, 10, d, h, 0, tzinfo=KST)
        assert quiet(st, at) == core_quiet(st, at), at
    assert not quiet(st, dt.datetime(2026, 10, 12, 13, 0, tzinfo=KST))
    assert quiet(st, dt.datetime(2026, 10, 12, 23, 0, tzinfo=KST))


def test_api_imagery_hidden_and_reads():
    from workers import imagery_src as isrc
    with db() as c:
        row = c.execute("SELECT id, footprint IS NULL, layer->>'role' FROM imagery WHERE layer->>'role'='national' ORDER BY id DESC LIMIT 1").fetchone()
        assert row, "영상 API 원천 행 없음"
        iid, nofp, role = row
        assert nofp and role == "national"                                  # footprint 없음 = 영상 고르기 · 겹침 셈에 나오지 않음
        recs = c.execute(isrc.SQL_ROWS).fetchall()
        assert iid not in {r[0] for r in recs}
    ds = isrc.open_imagery(iid)
    assert isinstance(ds, isrc.ApiDataset) and isrc.open_imagery(iid) is ds   # 프로세스에 하나(동시 호출 4 이하)
    from rasterio.windows import Window
    from pyproj import Transformer
    x, y = Transformer.from_crs(4326, 5179, always_xy=True).transform(127.39, 35.41)
    col, rowp = ~ds.transform * (x, y)
    a = ds.read([1, 2, 3], window=Window(int(col), int(rowp), 256, 256), boundless=True, fill_value=0)
    assert a.shape == (3, 256, 256) and a.max() > 0


def test_catalog_hides_api_source(tok):
    j = get(tok["staff"], "/catalog/layers?stage=domestic&build=lx&locale=ko")
    assert not [it for it in j.get("items", []) if str(it.get("id", "")).startswith("nat-ngii-air-")]


def test_idle_anytime_and_gpu_cap():
    """원칙 221 — 작업기는 시간대를 보지 않고(쉬는 시간 판정 안 씀) 조각을 작게 · 워커는 전국 작업을 한 장에서 사용률 · 전력 상한 아래로."""
    import inspect
    from landxi_api import config as cfg
    from national import runner
    src = inspect.getsource(runner.loop) + inspect.getsource(runner.run_cell) + inspect.getsource(runner.wait_turn)
    assert "quiet(" not in src                                   # 쉬는 시간을 기다리지 않는다
    assert runner.MAX_PART_KM2 <= 15                             # 조각이 작아 몇 분 안에 비킨다
    nat = cfg.load_yaml("pools")["power"]["national"]
    lim = cfg.load_yaml("pools")["power"]["power_limit_w"]
    assert nat["gpu"] in (0, [0], [0, 1]) and nat["util_max"] <= 70 and nat["power_max_w"] <= 0.7 * lim and nat["chunk"] <= 8


def test_fetch_governor_auto():
    """영상 호출 동시 수 자동 조절(10-13) — 오류율 > 1% · 응답 p50 > 기준×2 면 한 단계 내림 + 쉼, 30분 안정이면 상한까지 한 단계 올림."""
    from workers import imagery_src as isrc
    now = [1000.0]
    g = isrc.FetchGovernor(16, None, clock=lambda: now[0])
    assert g.level == 16 and g.steps() == [1, 2, 4, 8, 16]
    for _ in range(isrc.FETCH_WINDOW * 3):
        g.record(True, 0.5)                       # 기준 0.5초
    assert g.level == 16
    for k in range(isrc.FETCH_WINDOW):
        g.record(k >= 3, 0.5)                     # 오류 3/200 = 1.5%
    assert g.level == 8 and g.rest_until > now[0]
    for _ in range(isrc.FETCH_WINDOW):
        g.record(True, 1.2)                       # 기준의 2배 넘음
    assert g.level == 4
    now[0] += isrc.FETCH_STABLE_S + 1
    for _ in range(isrc.FETCH_WINDOW):
        g.record(True, 0.5)
    assert g.level == 8                           # 30분 안정 → 한 단계
    now[0] += isrc.FETCH_STABLE_S + 1
    for _ in range(isrc.FETCH_WINDOW * 2):
        g.record(True, 0.5)
    assert g.level == 16                          # 상한까지만
    g.set_cap(4)
    assert g.level == 4 and g.cap == 4            # 관리자가 상한을 내리면 바로
    g.set_cap(8)
    assert g.level == 8                           # 상한을 올리면 한 단계
    g.set_cap(99)
    assert g.cap == isrc.FETCH_HARD_MAX           # 16 위는 사용자 결정
    # 동시 수를 올려도 응답 시간만 늘면(서버가 줄 세움 · 처리량 그대로) — 낮은 동시 수에서 잰 기준으로 내려온다
    h = isrc.FetchGovernor(4, None, clock=lambda: now[0])
    for _ in range(isrc.FETCH_WINDOW * 3):
        h.record(True, 1.0)
    h.set_cap(8)
    assert h.level == 8
    for _ in range(isrc.FETCH_WINDOW):
        h.record(True, 2.5)
    assert h.level == 4
    # 서버가 빠를 때(수십 ms) 두 배 흔들림은 내리지 않는다
    q = isrc.FetchGovernor(4, None, clock=lambda: now[0])
    for _ in range(isrc.FETCH_WINDOW * 3):
        q.record(True, 0.04)
    for _ in range(isrc.FETCH_WINDOW):
        q.record(True, 0.09)
    assert q.level == 4


def test_fetch_max_setting_bounds(tok):
    """fetch_max 는 관리자 API 로만 · 1–16 밖은 거절(설정은 바뀌지 않음)."""
    with db() as c:
        before = c.execute("SELECT value FROM lx_settings WHERE key='national.run'").fetchone()[0]
    r = httpx.put(B + "/national/settings", headers=H(tok["admin"]), json={"fetch_max": 17}, timeout=30)
    assert r.status_code == 400, r.text
    r = httpx.put(B + "/national/settings", headers=H(tok["staff"]), json={"fetch_max": 8}, timeout=30)
    assert r.status_code in (401, 403)
    with db() as c:
        assert c.execute("SELECT value FROM lx_settings WHERE key='national.run'").fetchone()[0] == before
