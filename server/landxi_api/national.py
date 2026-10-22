"""전국 결과 자산(원칙 136 · 211 · 218 · 10-12 12:45 확인) — 진행 · 설정 · XI맵 지도 조각.

  GET  /api/v1/national/progress             LX — 결과 자산마다 진행(끝난 범위 ㎢ ÷ 전체 범위 ㎢) · 끝난 읍면동 · 마지막 칸 시각 · 칸 숫자 합 ·
                                             작업기 상태(도는 중 · 비킴 · 멈춤) · 일정(학습 장비가 놀 때면 언제든 · 하루 예상 · 남은 날 · 원칙 221) · 지도 조각 판 번호
  PUT  /api/v1/national/settings             LX 관리자 — {enabled, order, year, assets, river_buffer_m, fetch_max(1–16), model} (멈춤 · 재개 = enabled)
                                             model = 전국 분석 모델(등록된 모델만 · 10-13 경작지v2-처리 ⓐ). 바꾸면 다른 판으로 끝난 칸은 새 판으로 다시
                                             분석할 차례가 된다(옛 결과는 새 결과가 나올 때까지 그대로 보임 · 칸마다 판 = national_cells.model_id).
  POST /api/v1/national/retry                LX 관리자 — {asset?} 3번 넘게 실패한 칸을 다시 차례에 넣는다
  GET  /tiles/national/{asset}/{year}/{z}/{x}/{y}.pbf?v=판    XI맵 지도 조각(벡터) — 층 셋:
         cells  칸(읍면동 · 분석할 범위가 있는 곳만) · done 0/1 · 이름 · 칸 숫자(끝난 곳만 — 지어낸 숫자 0) · 줌 ≤ 10(더 가까이는 늘려 씀)
         faces  낮은 줌용 단순화 결과 면 — 줌 ≤ 7 약 200m 칸 · 줌 8~10 약 80m 칸(그 분류가 칸을 덮는 곳)
  GET  /api/v1/national/sets?asset=&bbox=w,s,e,n   LX — 그 범위의 끝난 칸 결과 묶음(객체 지도 조각 · 판 번호) — 줌 11부터 XI맵이 객체를 그린다.
       객체를 누르면 서비스 결과와 같은 그 자리 고치기(ximap.py — 누른 객체만 한 줄로 올림 · 칸 숫자를 고친 만큼 맞춤 · 원칙 243).
       객체는 데이터베이스에 쌓지 않고(C: 디스크) E: 의 결과 묶음 파일(/tiles/mvt 판 번호 주소)에서 읽는다.
       판 = 그 자산 · 연도의 끝난 칸 수 + 마지막 칸 시각 — 작업기가 칸을 마칠 때마다 바뀐다. 판이 맞으면 1년 보관, 옛 판은 no-cache(impl-20 판 번호 방식).
화면 글에 표 이름 · 작업 id · 경로 · 좌표를 쓰지 않는다. 숫자는 장부(national_cells)에서 센 값 하나.
"""
from __future__ import annotations

import datetime as dt
import json
import time
from collections import OrderedDict

from fastapi import APIRouter, Request, Response

from .deps import ApiError, audit, db, principal, require
from .envelope import KST, env, now_iso

router = APIRouter(tags=["national"])
tiles_router = APIRouter(tags=["national"])

ASSETS = {"farm": "농지 전수", "river": "하천 · 계곡"}
CLS = {"farm": ("경작지", "비닐하우스"), "river": ("건물", "경작지", "비닐하우스")}
UNIT = {"경작지": "곳", "비닐하우스": "동", "건물": "동"}
DEF = {"enabled": True, "year": 2025, "assets": ["farm", "river"],
       "order": ["52", "12", "47", "44", "48", "43", "41", "51", "50", "36", "27", "31", "26", "28", "30", "11"],
       "river_buffer_m": 100, "fetch_max": 4, "model": "trained/job_01M4QKMB4X8F1JHJHD0D7HSR7Q"}   # national.common.DEF 와 같은 값(전국 분석 모델 = 경작지 새 판 · 10-13)
QDEF = {"quiet_start": "22:00", "quiet_end": "06:00", "weekend": True}
KM2_PER_HOUR = 53           # 예상의 바탕 — 10-12 14:38 시험 칸 실측(영상 처음 읽기 · 1.69㎢ 114초 · 1㎢ 약 67초 · 영상 읽기가 대부분) [추정] · 실제 칸이 끝나면 그 속도로 바뀐다


def _jv(v):
    return json.loads(v) if isinstance(v, str) else (v or {})


async def _settings(conn) -> tuple[dict, dict]:
    a = await conn.fetchval("SELECT value FROM lx_settings WHERE key='national.run'")
    b = await conn.fetchval("SELECT value FROM lx_settings WHERE key='core.retrain'")
    q = _jv(b)
    return {**DEF, **_jv(a)}, {k: q.get(k, QDEF[k]) for k in QDEF}


def _hm(s) -> int:
    h, m = str(s).split(":")
    return int(h) * 60 + int(m)


def _quiet(q: dict, at: dt.datetime) -> bool:
    at = at.astimezone(KST)
    if q.get("weekend") and at.weekday() >= 5:
        return True
    a, b, t = _hm(q["quiet_start"]), _hm(q["quiet_end"]), at.hour * 60 + at.minute
    return (a <= t < b) if a < b else (t >= a or t < b)


def _runner() -> dict:
    from . import config
    p = config.DATA_ROOT / "national" / "runner.json"
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return {}


_VER: dict = {}


async def versions(conn, year: int) -> dict:
    """판 번호 — 자산마다 끝난 칸 수 + 마지막 칸 시각(5초 보관)."""
    k = year
    c = _VER.get(k)
    if c and time.time() - c[0] < 5:
        return c[1]
    rows = await conn.fetch("SELECT asset, count(*) FILTER (WHERE state='done') AS n, max(done_at) AS last FROM national_cells "
                            "WHERE year=$1 AND NOT test GROUP BY asset", year)
    # 전국 결과를 그 자리에서 고치면(지우기 · 되돌리기 등) 칸 숫자가 바뀐다 — 판에 고친 횟수를 붙여 지도 조각(칸 숫자)도 새로 받게(원칙 243)
    eds = {r["asset"]: int(r["k"]) for r in await conn.fetch(
        "SELECT n.asset, count(*) + count(e.undone_at) AS k FROM result_edits e JOIN national_jobs n ON n.job_id = e.set_id "
        "WHERE n.year=$1 AND NOT e.test GROUP BY n.asset", year)}
    out = {a: "0" for a in ASSETS}
    for r in rows:
        out[r["asset"]] = f"{r['n']}.{int(r['last'].timestamp()) if r['last'] else 0}" + (f".{eds[r['asset']]}" if eds.get(r["asset"]) else "")
    _VER[k] = (time.time(), out)
    return out


async def _net(cnt: dict, asset: str, pre) -> None:
    """같은 업무의 서비스 결과가 덮은 읍면동을 뺀 수(net) — XI맵 업무 합계 · 시군구 말풍선이 쓴다(겹친 곳 한 번 · overlap.py).
    n 은 전국 분석이 찾은 그대로(진행 화면). 뺄 것이 없으면 net 을 싣지 않는다."""
    try:
        from .overlap import hidden_sum
        for cls, v in cnt.items():
            hn, _ = await hidden_sum(asset, cls, pre)
            if hn > 0:
                v["net"] = env(max(0, int(v["n"]["value"] or 0) - hn), "count", "measured", "끝난 칸 AI 분석 결과 가운데 같은 업무의 서비스 결과가 덮은 읍면동을 뺀 수")
    except Exception:  # noqa: BLE001 — 못 세면 싣지 않는다(화면은 n 그대로)
        pass


@router.get("/national/progress")
async def progress(request: Request):
    require(principal(request), lx=True)
    async with db(realm="lx") as conn:
        st, q = await _settings(conn)
        year = int(st["year"])
        rows = await conn.fetch(
            "SELECT asset, count(*) FILTER (WHERE state<>'skip') AS cells, count(*) FILTER (WHERE state='done') AS done, "
            "count(*) FILTER (WHERE state='failed') AS failed, coalesce(sum(target_km2) FILTER (WHERE state<>'skip'),0) AS km2, "
            "coalesce(sum(target_km2) FILTER (WHERE state='done'),0) AS done_km2, max(done_at) AS last, "
            "count(DISTINCT sgg_cd) FILTER (WHERE state='done') AS sgg_done, count(DISTINCT sgg_cd) FILTER (WHERE state<>'skip') AS sgg "
            "FROM national_cells WHERE year=$1 AND NOT test GROUP BY asset", year)
        sums = await conn.fetch(
            "SELECT asset, k AS cls, sum((v->>'n')::bigint) AS n, sum((v->>'km2')::numeric) AS km2 FROM national_cells, jsonb_each(counts) AS e(k, v) "
            "WHERE year=$1 AND NOT test AND state='done' GROUP BY asset, k", year)
        model = str(st.get("model") or DEF["model"])
        nxt = await conn.fetch(                  # 다음 칸 — 작업기 next_cell 과 같은 차례(새 판으로 다시 할 끝난 칸 포함)
            "SELECT DISTINCT ON (asset) asset, sido, sgg_name, name FROM national_cells WHERE year=$1 AND NOT test "
            "AND (state IN ('todo','running') OR (state='done' AND model_id IS DISTINCT FROM $2 AND tries < 3)) "
            "ORDER BY asset, ord", year, model)
        redo = await conn.fetch(                 # 판 — 끝난 칸 가운데 지금 설정 판으로 만든 칸 · 옛 판이라 다시 할 칸(장부 한 출처)
            "SELECT asset, count(*) FILTER (WHERE model_id IS NOT DISTINCT FROM $2) AS cur, count(*) FILTER (WHERE model_id IS DISTINCT FROM $2) AS old, "
            "coalesce(sum(target_km2) FILTER (WHERE model_id IS DISTINCT FROM $2),0) AS old_km2 FROM national_cells "
            "WHERE year=$1 AND NOT test AND state='done' GROUP BY asset", year, model)
        mrow = await conn.fetchrow("SELECT name FROM models WHERE id=$1", model)
        busy = await conn.fetchval(
            "SELECT count(*) FROM jobs j WHERE j.state IN ('queued','running') AND j.pool <> 'cpu' "
            "AND NOT EXISTS (SELECT 1 FROM national_jobs n WHERE n.job_id=j.id)")
        rate = await conn.fetchrow(
            "SELECT sum(target_km2) AS km2, sum(extract(epoch FROM done_at - started_at)) AS s FROM national_cells "
            "WHERE year=$1 AND NOT test AND state='done' AND started_at IS NOT NULL", year)
        # 최근 속도(최근 6시간에 끝난 칸) — 영상 호출 동시 수 같은 운영 설정이 바뀌면 예상이 그 속도를 따라간다(10-13). 칸 시간이 30분 넘을 때만.
        recent = await conn.fetchrow(
            "SELECT sum(target_km2) AS km2, sum(extract(epoch FROM done_at - started_at)) AS s FROM national_cells "
            "WHERE year=$1 AND NOT test AND state='done' AND started_at IS NOT NULL AND done_at > now() - interval '6 hours'", year)
        ver = await versions(conn, year)
    now = dt.datetime.now(KST)
    mname = (_jv(mrow["name"]).get("ko") if mrow and mrow["name"] else None)
    out = {"year": year, "enabled": bool(st.get("enabled", True)), "assets": {}, "v": ver,
           "model": {"id": model, "name": mname},                  # 전국 분석 모델(관리자 확인용 · 화면에 모델 id 를 쓰지 않는다)
           "imagery": f"국토지리정보원 항공 정사영상 {year} · 25cm · 영상은 저장하지 않음"}
    for a, name in ASSETS.items():
        r = next((x for x in rows if x["asset"] == a), None)
        tot = float(r["km2"]) if r else 0.0
        dk = float(r["done_km2"]) if r else 0.0
        pct = round(100.0 * dk / tot, 1) if tot else 0.0
        cnt = {s["cls"]: {"n": env(int(s["n"] or 0), "count", "measured", "끝난 칸 AI 분석 결과(객체 중심이 칸 안)"),
                          "km2": env(round(float(s["km2"] or 0), 2), "km2", "measured", "끝난 칸 AI 분석 결과 넓이")} for s in sums if s["asset"] == a}
        await _net(cnt, a, None)
        n = next((x for x in nxt if x["asset"] == a), None)
        rd = next((x for x in redo if x["asset"] == a), None)
        out["assets"][a] = {
            "name": name,
            "on": a in st["assets"],                    # 켠 자산만 작업기가 돈다(10-12 하천은 사용자 하천 자료로 범위를 다시 만든 뒤 처음부터)
            "pct": env(pct, "%", "measured", "끝난 칸 분석 범위 ㎢ ÷ 전체 분석 범위 ㎢(진행 장부)"),
            "done_km2": env(round(dk, 1), "km2", "measured", "끝난 칸 분석 범위"), "total_km2": env(round(tot, 1), "km2", "measured", "전체 분석 범위(칸 합)"),
            "cells": env(int(r["cells"]) if r else 0, "count", "measured", "분석할 범위가 있는 읍면동"),
            "done": env(int(r["done"]) if r else 0, "count", "measured", "끝난 읍면동"),
            "failed": env(int(r["failed"]) if r else 0, "count", "measured", "3번 넘게 실패한 읍면동(관리자가 다시)"),
            "sgg_done": env(int(r["sgg_done"]) if r else 0, "count", "measured", "끝난 칸이 있는 시군구"),
            "sgg": env(int(r["sgg"]) if r else 0, "count", "measured", "분석할 범위가 있는 시군구"),
            "last_at": r["last"].astimezone(KST).isoformat(timespec="minutes") if r and r["last"] else None,
            "counts": {k: {**v, "unit": UNIT.get(k, "개")} for k, v in cnt.items()},
            "model_done": env(int(rd["cur"]) if rd else 0, "count", "measured", "끝난 읍면동 가운데 지금 전국 분석 모델로 만든 곳(진행 장부 model_id)"),
            "redo": env(int(rd["old"]) if rd else 0, "count", "measured", "끝난 읍면동 가운데 옛 판 결과라 새 판으로 다시 분석할 곳 — 새 결과가 나올 때까지 옛 결과 그대로"),
            "next": {"sido": n["sido"], "sgg": n["sgg_name"], "emd": n["name"]} if n else None}
    # 일정 — 학습 장비가 놀 때면 언제든(시간대를 기다리지 않음 · 원칙 221). 하루 예상 = 속도 × 24시간(유휴 기준 · 사용자 작업 · 재학습만큼 늦어짐).
    # 속도: 끝난 칸이 있으면 실제(㎢ ÷ 걸린 시간 · 비킨 시간 포함), 없으면 낮 시험 칸 실측 바탕 [추정]
    measured = rate and rate["s"] and float(rate["s"]) > 600
    fresh = recent and recent["s"] and float(recent["s"]) > 1800 and float(recent["km2"] or 0) > 0
    if fresh:
        rate = recent
    kph = float(rate["km2"]) / (float(rate["s"]) / 3600.0) if measured else KM2_PER_HOUR
    left = sum(float(r["km2"]) - float(r["done_km2"]) for r in rows if r["asset"] in st["assets"]) +         sum(float(r["old_km2"]) for r in redo if r["asset"] in st["assets"])          # 새 판으로 다시 할 끝난 칸도 남은 일
    run = _runner()
    out["runner"] = {"state": run.get("state") or "idle", "why": run.get("why"), "at": run.get("at"), "cell": run.get("name") if not run.get("test") else None,
                     "asset": run.get("asset") if not run.get("test") else None,   # 지금 도는 칸의 자산(농지 · 하천 번갈아 — 다른 자산 칸에 '지금 분석 중'을 쓰지 않게)
                     "cd": run.get("cell") if not run.get("test") and run.get("state") == "running" else None}   # 지금 도는 칸(읍면동 코드 · XI맵 '지금 분석 중' 한 줄)
    basis = "measured" if measured else "estimate"
    note = ("최근 6시간에 끝난 칸의 실제 속도" if fresh else "끝난 칸의 실제 속도") if measured else "10-12 시험 칸 속도(1㎢ 약 67초) [추정]"
    sched = {"mode": "idle", "idle_now": not busy, "starts_at": now.isoformat(timespec="minutes"),
             "est_km2_day": env(round(kph * 24), "km2", basis, note + " × 24시간(학습 장비가 놀 때 기준)"),
             "days_left": env(round(left / (kph * 24), 1) if kph else None, "count", basis, "남은 범위 ㎢(새 판으로 다시 할 칸 포함) ÷ 하루 예상(학습 장비가 놀 때 기준)")}
    out["schedule"] = sched
    # 전국 결과 지도 조각 서명(10-22 옆문 닫기 — 로그인 없이 받아지던 /tiles/national 을 LX 세션 뒤로). 6시간 칸이라 30초 다시 읽기에도 주소가 같다
    from .tiles import sign, sign_exp
    exp = sign_exp()
    out["tile_sig"] = {"exp": exp, "sig": sign(f"national/{year}", exp)}
    out["tonight"] = {**sched, "quiet": {**q, "now": _quiet(q, now)}, "est_km2": sched["est_km2_day"]}   # 예전 이름(호환) — 같은 값
    return out


@router.put("/national/settings")
async def put_settings(request: Request, body: dict):
    p = require(principal(request), lx=True, admin=True)
    async with db(realm="lx") as conn:
        st, _ = await _settings(conn)
        old = dict(st)
        if "enabled" in body:
            st["enabled"] = bool(body["enabled"])
        if "order" in body and isinstance(body["order"], list):
            st["order"] = [str(x) for x in body["order"]][:40]
        if "year" in body:
            y = int(body["year"])
            if not 2011 <= y <= 2100:
                raise ApiError("bad_request", "연도")
            st["year"] = y
        if "assets" in body:
            st["assets"] = [a for a in body["assets"] if a in ASSETS] or st["assets"]
        if "river_buffer_m" in body:
            st["river_buffer_m"] = max(20, min(500, int(body["river_buffer_m"])))
        if "model" in body:                                     # 전국 분석 모델(10-13 경작지v2-처리 ⓐ) — 등록된 분할 모델만 · 경작지를 찾는 모델만
            m = await conn.fetchrow("SELECT status, task, classes FROM models WHERE id=$1", str(body["model"]))
            cls = _jv(m["classes"]) if m and isinstance(m["classes"], str) else ((m["classes"] if m else None) or [])
            if not m or m["status"] != "registered" or m["task"] != "seg" or "경작지" not in cls:
                raise ApiError("bad_request", "전국 분석 모델은 등록된 경작지 분할 모델만")
            st["model"] = str(body["model"])
        if "fetch_max" in body:                                 # 영상 호출 동시 수 상한(10-13 · 16 위는 사용자 결정) — 워커가 이 아래에서 자동 조절
            fm = int(body["fetch_max"])
            if not 1 <= fm <= 16:
                raise ApiError("bad_request", "영상 호출 동시 수(1–16)")
            st["fetch_max"] = fm
        await conn.execute("INSERT INTO lx_settings(key, value, updated_by, updated_at) VALUES ('national.run', $1, $2, now()) "
                           "ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_by=EXCLUDED.updated_by, updated_at=now()",
                           st, p.user_id)                       # jsonb 는 연결 코덱이 직렬화(json.dumps 를 두 번 하면 글자 하나로 들어간다)
        await audit(conn, p, "national.settings", "national.run", old, st)
    return {"settings": {"enabled": st["enabled"], "year": st["year"], "order": st["order"], "assets": st["assets"], "model": st.get("model") or DEF["model"],
                         "fetch_max": env(int(st.get("fetch_max", 4)), "count", "recorded", "영상 호출 동시 수 상한(관리자 설정 · 실제 쓰는 값은 그 아래에서 자동)"),
                         "river_buffer_m": env(st["river_buffer_m"], "m2" if False else "count", "recorded", "하천 띠 폭(양쪽 · m)")}}


@router.post("/national/retry")
async def retry(request: Request, body: dict | None = None):
    p = require(principal(request), lx=True, admin=True)
    a = (body or {}).get("asset")
    async with db(realm="lx") as conn:
        n = await conn.fetchval("WITH u AS (UPDATE national_cells SET state='todo', tries=0, next_try_at=NULL WHERE state='failed' "
                                "AND ($1::text IS NULL OR asset=$1) RETURNING 1) SELECT count(*) FROM u", a)
        # 새 판으로 다시 하다 3번 넘게 실패한 끝난 칸(옛 결과 그대로) — 다시 차례에(결과는 새 판이 나올 때까지 그대로)
        n += await conn.fetchval("WITH u AS (UPDATE national_cells SET tries=0, next_try_at=NULL WHERE state='done' AND tries >= 3 "
                                 "AND ($1::text IS NULL OR asset=$1) RETURNING 1) SELECT count(*) FROM u", a)
        await audit(conn, p, "national.retry", a or "all", None, {"n": n})
    return {"requeued": int(n)}


# ── 지도 조각 ───────────────────────────────────────────────────────────────
_TC: "OrderedDict[tuple, bytes]" = OrderedDict()
TC_MAX = 4000
PX = 40075016.68 / 256.0


async def _tile(asset: str, year: int, z: int, x: int, y: int, test: bool) -> bytes:
    env3857 = "ST_TileEnvelope($1, $2, $3)"
    tol = PX / (2 ** z) * 0.6                 # 화면 1px 의 절반 남짓 — 보이지 않는 꼭짓점만 덜어낸다
    parts = []
    async with db(realm="lx") as conn:
        if z <= 10:
            b = await conn.fetchval(
                f"WITH t AS (SELECT {env3857} AS e), q AS ("
                " SELECT ST_AsMVTGeom(ST_SimplifyPreserveTopology(ST_Transform(c.geom_s, 3857), $6), t.e, 4096, 16, true) AS g, c.cell_cd AS cd, "
                " (c.state='done')::int AS done, c.sido, c.sgg_name AS sgg, c.name, "
                " CASE WHEN c.state='done' THEN (c.counts->'경작지'->>'n')::int END AS n1, CASE WHEN c.state='done' THEN (c.counts->'경작지'->>'km2')::float END AS a1, "
                " CASE WHEN c.state='done' THEN (c.counts->'비닐하우스'->>'n')::int END AS n2, CASE WHEN c.state='done' THEN (c.counts->'건물'->>'n')::int END AS n3 "
                " FROM national_cells c, t WHERE c.asset=$4 AND c.year=$5 AND NOT c.test AND c.state<>'skip' AND c.geom_s && ST_Transform(t.e, 4326)) "
                "SELECT ST_AsMVT(q, 'cells', 4096, 'g') FROM q WHERE g IS NOT NULL", z, x, y, asset, year, tol)
            parts.append(b or b"")
        if z <= 10:
            lvl = 0 if z <= 7 else 1
            # 1px 보다 작은 도형은 낮은 확대에서 뺀다(10-22 now21 인프라-전국조각보관 ⓐ) — 화면 한 점(1px × 1px)보다 넓이가 작은 면은 그려도 보이지 않는데
            # 조각 크기만 키운다(z6 한 장 855KB 의 대부분). 기준 넓이 = (그 확대의 1px 길이)² · 웹 메르카토르 넓이(화면과 같은 투영).
            b = await conn.fetchval(
                f"WITH t AS (SELECT {env3857} AS e), s AS ("
                " SELECT ST_Transform(f.geom, 3857) AS g3, f.cls "
                " FROM national_faces f, t WHERE f.asset=$4 AND f.year=$5 AND f.lvl=$8 AND f.geom && ST_Transform(t.e, 4326) "
                " AND (EXISTS (SELECT 1 FROM national_cells c WHERE c.asset=f.asset AND c.year=f.year AND c.cell_cd=f.cell_cd AND c.state='done' AND NOT c.test) "
                "      OR ($6 AND f.cell_cd LIKE 'test:%%'))), q AS ("
                " SELECT ST_AsMVTGeom(ST_SimplifyPreserveTopology(s.g3, $7), t.e, 4096, 16, true) AS g, s.cls FROM s, t WHERE ST_Area(s.g3) >= $9) "
                "SELECT ST_AsMVT(q, 'faces', 4096, 'g') FROM q WHERE g IS NOT NULL", z, x, y, asset, year, test, tol * 0.5, lvl, (PX / (2 ** z)) ** 2)
            parts.append(b or b"")
    return b"".join(parts)


@router.get("/national/region")
async def region_summary(request: Request, codes: str = "", year: int | None = None):
    """한 시군구(지도 경계 코드 · 옛 코드 별칭 쉼표 구분)의 전국 결과 — 진행 장부(national_cells)에서 센 값 한 출처(GET /national/progress 와 같은 장부).
    구가 있는 시는 구 칸을 모두 합친다. 끝난 읍면동이 없으면 done = 0 · counts 비어 있음(지어낸 숫자 없음)."""
    require(principal(request), lx=True)
    cs = [c.strip() for c in codes.split(",") if c.strip().isdigit() and len(c.strip()) == 5][:8]
    if not cs:
        raise ApiError("bad_request", "시군구 코드")
    pre = sorted({c[:4] if c.endswith("0") else c for c in cs})
    async with db(realm="lx") as conn:
        if year is None:
            year = int((await _settings(conn))[0]["year"])
        rows = await conn.fetch(
            "SELECT asset, count(*) FILTER (WHERE state<>'skip') AS cells, count(*) FILTER (WHERE state='done') AS done, max(done_at) AS last "
            "FROM national_cells WHERE year=$1 AND NOT test AND sgg_cd LIKE ANY (SELECT p || '%' FROM unnest($2::text[]) p) GROUP BY asset", year, pre)
        sums = await conn.fetch(
            "SELECT asset, k AS cls, sum((v->>'n')::bigint) AS n, sum((v->>'km2')::numeric) AS km2 FROM national_cells, jsonb_each(counts) AS e(k, v) "
            "WHERE year=$1 AND NOT test AND state='done' AND sgg_cd LIKE ANY (SELECT p || '%' FROM unnest($2::text[]) p) GROUP BY asset, k", year, pre)
    out = {"year": year, "assets": {}}
    for a, name in ASSETS.items():
        r = next((x for x in rows if x["asset"] == a), None)
        cnt = {s["cls"]: {"n": env(int(s["n"] or 0), "count", "measured", "끝난 칸 AI 분석 결과(객체 중심이 칸 안)"),
                          "km2": env(round(float(s["km2"] or 0), 2), "km2", "measured", "끝난 칸 AI 분석 결과 넓이"), "unit": UNIT.get(s["cls"], "개")}
               for s in sums if s["asset"] == a}
        await _net(cnt, a, pre)
        out["assets"][a] = {"name": name, "cells": env(int(r["cells"]) if r else 0, "count", "measured", "분석할 범위가 있는 읍면동"),
                            "done": env(int(r["done"]) if r else 0, "count", "measured", "끝난 읍면동"),
                            "last_at": r["last"].astimezone(KST).isoformat(timespec="minutes") if r and r["last"] else None, "counts": cnt}
    return out


@router.get("/national/recent")
async def recent(request: Request, n: int = 12, year: int | None = None):
    """방금 끝난 읍면동 — 전국 작업기가 최근에 마친 칸(끝난 시각 순)과 그 칸의 결과 묶음(객체 지도 조각 주소 · 판 번호).
    XI맵 왼쪽 위 결과 표시 시안 B('방금 찾은 것')가 쓴다. 숫자는 진행 장부(national_cells)에서 센 값 한 출처 · 지어낸 값 0.
    today = 오늘(KST) 끝난 칸 수 · 그 칸들의 결과 객체 합(자산마다 보이는 분류만 — XI맵 합계와 같은 셈)."""
    require(principal(request), lx=True)
    n = max(1, min(40, int(n)))
    from .tiles import set_tile_ver, sign, sign_exp
    exp = sign_exp()
    day0 = dt.datetime.now(KST).replace(hour=0, minute=0, second=0, microsecond=0)
    async with db(realm="lx") as conn:
        if year is None:
            year = int((await _settings(conn))[0]["year"])
        rows = await conn.fetch(
            "SELECT c.asset, c.cell_cd, c.name, c.sgg_name, c.sido, c.done_at, c.counts, "
            "ST_X(ST_PointOnSurface(c.geom_s)) AS lng, ST_Y(ST_PointOnSurface(c.geom_s)) AS lat, "
            "(SELECT j.result_set FROM national_jobs j WHERE j.asset=c.asset AND j.year=c.year AND j.cell_cd=c.cell_cd AND j.state='done' "
            " AND j.result_set IS NOT NULL AND NOT j.test AND j.model_id IS NOT DISTINCT FROM c.model_id ORDER BY j.part LIMIT 1) AS result_set, "
            "(SELECT j.bbox FROM national_jobs j WHERE j.asset=c.asset AND j.year=c.year AND j.cell_cd=c.cell_cd AND j.state='done' "
            " AND j.result_set IS NOT NULL AND NOT j.test AND j.model_id IS NOT DISTINCT FROM c.model_id ORDER BY j.part LIMIT 1) AS bbox "
            "FROM national_cells c WHERE c.year=$1 AND NOT c.test AND c.state='done' AND c.done_at IS NOT NULL ORDER BY c.done_at DESC LIMIT $2", year, n)
        today = await conn.fetch(
            "SELECT asset, k AS cls, sum((v->>'n')::bigint) AS n FROM national_cells, jsonb_each(counts) AS e(k, v) "
            "WHERE year=$1 AND NOT test AND state='done' AND done_at >= $2 GROUP BY asset, k", year, day0)
        tc = int(await conn.fetchval("SELECT count(DISTINCT cell_cd) FROM national_cells WHERE year=$1 AND NOT test AND state='done' AND done_at >= $2", year, day0) or 0)
    vis = {"farm": ("경작지", "비닐하우스"), "river": ("건물",)}       # 자산마다 보이는 분류(XI맵 national.js NCLS 와 같은 규칙 — 겹쳐 세지 않게)
    items = []
    for r in rows:
        cnt = _jv(r["counts"])
        counts = {k: {"n": int((cnt.get(k) or {}).get("n") or 0), "unit": UNIT.get(k, "개")} for k in vis.get(r["asset"], ()) if int((cnt.get(k) or {}).get("n") or 0) > 0}
        v = set_tile_ver(r["result_set"]) if r["result_set"] else None
        q = f"exp={exp}&sig={sign(r['result_set'], exp)}" if v else None     # 결과 묶음 서명(10-22 옆문 닫기 2차 · LX 전용 목록)
        items.append({"asset": r["asset"], "asset_name": ASSETS.get(r["asset"], r["asset"]), "cd": r["cell_cd"], "name": r["name"], "sgg": r["sgg_name"], "sido": r["sido"],
                      "at": r["done_at"].astimezone(KST).isoformat(timespec="minutes") if r["done_at"] else None,
                      "center": [round(float(r["lng"]), 5), round(float(r["lat"]), 5)] if r["lng"] is not None else None,
                      "counts": counts, "set": r["result_set"] if v else None, "v": v, "q": q, "bounds": list(r["bbox"]) if r["bbox"] else None})
    tn = sum(int(t["n"] or 0) for t in today if t["cls"] in vis.get(t["asset"], ()))
    return {"year": year, "as_of": now_iso(), "today": {"cells": env(tc, "count", "measured", "오늘(KST) 끝난 읍면동"),
                                                         "n": env(tn, "count", "measured", "오늘 끝난 칸의 AI 분석 결과(자산마다 보이는 분류만)")},
            "items": items, "source": "전국 분석 진행 장부"}


@router.get("/national/sets")
async def sets(request: Request, asset: str = "farm", bbox: str = "", year: int | None = None, test: int = 0):
    require(principal(request), lx=True)
    if asset not in ASSETS:
        raise ApiError("bad_request", "결과 자산")
    try:
        w, so, e, n = [float(v) for v in bbox.split(",")]
    except ValueError:
        raise ApiError("bad_request", "bbox = 서,남,동,북") from None
    from .tiles import set_tile_ver
    async with db(realm="lx") as conn:
        if year is None:
            year = int((await _settings(conn))[0]["year"])
        rows = await conn.fetch(
            "SELECT n.result_set, n.bbox FROM national_jobs n WHERE n.asset=$1 AND n.year=$2 AND n.state='done' AND n.result_set IS NOT NULL "
            "AND n.bbox IS NOT NULL AND n.bbox[1] <= $5 AND n.bbox[3] >= $3 AND n.bbox[2] <= $6 AND n.bbox[4] >= $4 "
            "AND (CASE WHEN n.test THEN $7 ELSE EXISTS (SELECT 1 FROM national_cells c WHERE c.asset=n.asset AND c.year=n.year AND c.cell_cd=n.cell_cd AND c.state='done' "
            "     AND n.model_id IS NOT DISTINCT FROM c.model_id) END) "          # 칸의 지금 판 결과 묶음만(새 판으로 바꿔 끼운 칸의 옛 묶음은 내주지 않음)
            "LIMIT 200", asset, year, w, so, e, n, bool(test))
    out = []
    from .tiles import sign, sign_exp
    exp = sign_exp()
    for r in rows:
        v = set_tile_ver(r["result_set"])
        if v:      # 작업 결과 묶음 = 서명 주소로만(10-22 옆문 닫기 2차) — LX 전용 목록이라 묶음마다 서명을 함께 준다(조각마다 /tiles/sign 을 부르지 않게)
            out.append({"set": r["result_set"], "v": v, "bounds": list(r["bbox"]), "q": f"exp={exp}&sig={sign(r['result_set'], exp)}"})
    return {"asset": asset, "year": year, "sets": out}


@tiles_router.get("/tiles/national/{asset}/{year}/{z}/{x}/{y}.pbf")
async def national_tile(asset: str, year: int, z: int, x: int, y: int, v: str | None = None, test: int = 0,
                        exp: str | None = None, sig: str | None = None):
    if asset not in ASSETS or not (0 <= z <= 16):
        raise ApiError("not_found", "결과 자산 없음")
    from .tiles import verify
    if not verify(f"national/{year}", exp, sig):            # LX 세션이 받은 진행 장부의 서명만(10-22 옆문 닫기)
        raise ApiError("forbidden", "서명 없는 전국 결과 조각")
    async with db(realm="lx") as conn:
        ver = (await versions(conn, year)).get(asset, "0")
    t = bool(test)
    key = (asset, year, z, x, y, ver, t)
    data = _TC.get(key)
    if data is None:
        data = await _tile(asset, year, z, x, y, t)
        _TC[key] = data
        while len(_TC) > TC_MAX:
            _TC.popitem(last=False)
    else:
        _TC.move_to_end(key)
    cache = "public, max-age=31536000, immutable" if (v == ver and not t) else "no-cache"
    hdr = {"Cache-Control": cache, "ETag": f'"n{ver}-{z}-{x}-{y}{"t" if t else ""}"', "X-LX-Ver": ver}
    if not data:
        return Response(status_code=204, headers=hdr)
    return Response(content=data, media_type="application/x-protobuf", headers=hdr)
