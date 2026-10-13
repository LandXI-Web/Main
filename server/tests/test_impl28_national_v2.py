"""구현 28 · 전국-새판(10-13 경작지v2-처리 ⓐ "전국 분석은 API 영상을 기본으로 하고, 기관 영상은 지금 모델 그대로 한다.")

① 전국 분석 모델 = 등록된 경작지 새 판(설정 'national.run'.model) — 작업기가 넣은 새 조각 작업은 모두 이 판
② 칸마다 판(national_cells.model_id) · 진행 응답의 '지금 판으로 끝난 곳 + 옛 판이라 다시 할 곳 = 끝난 곳'(장부 한 출처)
③ 다른 판으로 끝난 칸 = 다시 할 차례(next_cell redo) · 실패해도 '끝'(옛 결과) 그대로 · XI맵 객체 묶음은 칸의 지금 판 것만
④ 기관 영상 분석 · 분석하기 · 공개된 분석서비스는 지금 모델 그대로 — 서버의 모델 고르기 함수가 새 판을 고르지 않는다
⑤ 설정의 모델은 등록된 경작지 분할 모델만 · LX 관리자만
실행: python -m pytest server/tests/test_impl28_national_v2.py -q   (게이트웨이 :8700 · GPU 0)
"""
import asyncio
import json
import sys
from pathlib import Path

import httpx
import psycopg

from conftest import B, H

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from national.common import DEF, env_file  # noqa: E402

NEW = "trained/job_01M4QKMB4X8F1JHJHD0D7HSR7Q"     # 경작지 새 판(같은 검증 묶음 API 영상 경작지 88.4% · 원본 89.9%)
OLD = "aerial25/best"                               # 기관 영상 분석 모델(E:\best.pt) — 그대로


def db(autocommit=True):
    return psycopg.connect(env_file()["PG_ADMIN_DSN"], autocommit=autocommit)


def get(t, p):
    r = httpx.get(B + p, headers=H(t), timeout=60)
    assert r.status_code == 200, r.text
    return r.json()


def test_model_registered_and_set(tok):
    assert DEF["model"] == NEW
    with db() as c:
        st, w = c.execute("SELECT status, weights_uri FROM models WHERE id=%s", (NEW,)).fetchone()
        assert st == "registered" and w.endswith("best.pt")
        assert c.execute("SELECT weights_uri FROM models WHERE id=%s", (OLD,)).fetchone()[0] == "E:\\best.pt"
        s = c.execute("SELECT value FROM lx_settings WHERE key='national.run'").fetchone()[0]
        s = json.loads(s) if isinstance(s, str) else s
        assert s.get("model") == NEW
        # 바꾼 뒤 작업기가 넣은 조각 작업은 모두 새 판 — 장부(national_jobs.model_id) = 작업(jobs.model_id)
        rows = c.execute("SELECT n.model_id, j.model_id FROM national_jobs n JOIN jobs j ON j.id=n.job_id WHERE n.model_id IS NOT NULL").fetchall()
        assert rows and all(a == b for a, b in rows)
        assert any(a == NEW for a, _ in rows)


def test_progress_model_split(tok):
    j = get(tok["staff"], "/national/progress")
    assert j["model"]["id"] == NEW and j["model"]["name"]
    with db() as c:
        for a, A in j["assets"].items():
            assert A["model_done"]["value"] + A["redo"]["value"] == A["done"]["value"]
            cur, old = c.execute("SELECT count(*) FILTER (WHERE model_id IS NOT DISTINCT FROM %s), count(*) FILTER (WHERE model_id IS DISTINCT FROM %s) "
                                 "FROM national_cells WHERE asset=%s AND year=%s AND NOT test AND state='done'", (NEW, NEW, a, j["year"])).fetchone()
            assert (A["model_done"]["value"], A["redo"]["value"]) == (cur, old)


def test_redo_queue_and_fail_keeps_old():
    from national import runner
    with db(autocommit=False) as c:
        try:
            year = 2025
            # 옛 판으로 끝난 칸은 다시 할 차례 — 설정에 없는 판을 주면 끝난 칸이 곧바로 차례에 든다(읽기만)
            nxt = runner.next_cell(c, year, ["farm", "river"], "no/such-model")
            assert nxt is not None
            st = c.execute("SELECT state FROM national_cells WHERE asset=%s AND year=%s AND cell_cd=%s", (nxt[0], year, nxt[1])).fetchone()[0]
            if st == "done":
                assert nxt[5] is True
            # 새 판으로 다시 하다 실패해도 칸은 '끝'(옛 결과 그대로) — 시도 횟수만 센다(되돌림)
            cell = c.execute("SELECT asset, cell_cd FROM national_cells WHERE year=%s AND state='done' AND NOT test LIMIT 1", (year,)).fetchone()
            runner.fail_cell(c, cell[0], year, cell[1], "시험", redo=True)
            st, tries = c.execute("SELECT state, tries FROM national_cells WHERE asset=%s AND year=%s AND cell_cd=%s", (cell[0], year, cell[1])).fetchone()
            assert st == "done" and tries >= 1
        finally:
            c.rollback()


def test_sets_only_current_model(tok):
    """새 판으로 바꿔 끼운 칸 — XI맵 객체 묶음은 그 칸의 지금 판 작업 것만(옛 판 묶음은 E: 에 남되 내주지 않음)."""
    with db() as c:
        r = c.execute("SELECT c.asset, c.cell_cd, ST_XMin(c.geom_s), ST_YMin(c.geom_s), ST_XMax(c.geom_s), ST_YMax(c.geom_s) FROM national_cells c "
                      "WHERE c.model_id=%s AND c.state='done' AND NOT c.test AND EXISTS (SELECT 1 FROM national_jobs n WHERE n.asset=c.asset AND n.year=c.year "
                      "AND n.cell_cd=c.cell_cd AND n.model_id IS DISTINCT FROM c.model_id AND n.result_set IS NOT NULL) "
                      "AND EXISTS (SELECT 1 FROM national_jobs n WHERE n.asset=c.asset AND n.year=c.year AND n.cell_cd=c.cell_cd AND n.model_id=c.model_id "
                      "AND n.result_set IS NOT NULL) LIMIT 1", (NEW,)).fetchone()
        assert r, "새 판으로 바꿔 끼운 칸이 아직 없음"
        asset, cd, w, s, e, n = r
        old = {x[0] for x in c.execute("SELECT result_set FROM national_jobs WHERE asset=%s AND cell_cd=%s AND model_id IS DISTINCT FROM %s AND result_set IS NOT NULL",
                                       (asset, cd, NEW)).fetchall()}
        new = {x[0] for x in c.execute("SELECT result_set FROM national_jobs WHERE asset=%s AND cell_cd=%s AND model_id=%s AND result_set IS NOT NULL",
                                       (asset, cd, NEW)).fetchall()}
    j = get(tok["staff"], f"/national/sets?asset={asset}&bbox={w},{s},{e},{n}")
    got = {x["set"] for x in j["sets"]}
    assert not (got & old)
    assert new <= got or not new


def test_agency_models_unchanged():
    """기관 영상 분석 · 분석하기 · 공개된 분석서비스 — 서버의 모델 고르기(deploys.choose_model · jobs._pick_model)가 새 판을 고르지 않는다."""
    from landxi_api import config
    from landxi_api.deploys import choose_model
    from landxi_api.jobs import _pick_model

    async def run():
        import asyncpg
        c = await asyncpg.connect(config.PG_ADMIN_DSN)
        await c.set_type_codec("jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog")
        await c.set_type_codec("json", encoder=json.dumps, decoder=json.loads, schema="pg_catalog")
        try:
            picks = []
            for d in await c.fetch("SELECT id, card_id, card_version_id, model_override FROM deploys WHERE NOT coalesce(test,false)"):
                for g in (None, 0.018, 0.12, 0.25, 0.51):
                    picks.append((await choose_model(c, d["model_override"], d["card_id"], d["card_version_id"], g))["model_id"])
            ana = await _pick_model(c, "ortho", 0.25)
            cards = [m for r in await c.fetch("SELECT model_ids FROM card_versions") for m in (r["model_ids"] or [])]
            return picks, ana["id"] if ana else None, cards
        finally:
            await c.close()
    picks, ana, cards = asyncio.run(run())
    assert picks and NEW not in picks
    assert OLD in picks                                   # 25cm 항공 분석서비스는 지금 모델(E:\best.pt)
    assert ana == OLD
    assert NEW not in cards


def test_settings_model_guard(tok):
    assert httpx.put(B + "/national/settings", json={"model": NEW}, headers=H(tok["staff"]), timeout=30).status_code == 403
    r = httpx.put(B + "/national/settings", json={"model": "no/such-model"}, headers=H(tok["admin"]), timeout=30)
    assert r.status_code == 400
    r = httpx.put(B + "/national/settings", json={"model": "namwon/Silage/train"}, headers=H(tok["admin"]), timeout=30)
    assert r.status_code == 400                           # 경작지를 찾지 않는 모델
    r = httpx.put(B + "/national/settings", json={"model": NEW}, headers=H(tok["admin"]), timeout=30)
    assert r.status_code == 200 and r.json()["settings"]["model"] == NEW
