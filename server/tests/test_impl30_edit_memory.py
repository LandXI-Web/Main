"""구현 30 · 지운 자리 기억(원칙 243 · 10-14 "응 그렇게 해줘") — 고친 것은 다시 추론해도 다시 나타나지 않게.

(a) 지우기 → 같은 영상 다시 추론(새 결과 묶음) → 그 자리 새 객체가 저절로 '지움'
(b) 분류 바꾸기 → 다시 추론 → 바꾼 분류 · 모양 고치기 → 고친 모양 · 새로 그린 것 → 새 결과에 없으면 그대로 더함
(c) 다른 연도 영상 → 적용하지 않고 '다시 확인'(그 자리 고치기 칸 recheck)
(d) 저절로 적용한 줄 되돌리기 → 객체가 돌아오고, 그 원래 고치기는 다음 결과부터 따르지 않음
(e) 새 판 '지운 자리 n곳 중 다시 잡은 곳 m곳' 계산(edit_memory_runs · memory_for_model)
(f) 기관 영상 분석 · 공개 서비스 모델 고르기는 그대로(test_impl28 의 test_agency_models_unchanged 를 그대로 부른다)
(g) 전국 결과 객체도 그 자리 고치기(누른 객체 한 줄 · 고친 자리 범위 조회 · 칸 숫자 맞춤 · 되돌리면 그대로)
(h) 학습 칸: 저절로 적용한 줄은 칸을 만들지 않는다(원래 고친 줄이 그 자리 1장)
시험 결과는 모두 시험 표시(작업 test · 고치기 test) · 끝나면 지운다. GPU 0(가짜 결과 묶음은 데이터베이스 줄로만).
실행: python -m pytest server/tests/test_impl30_edit_memory.py -q   (게이트웨이 :8700)
"""
import asyncio
import json
import secrets
import sys
from pathlib import Path

import httpx
import psycopg
import pytest

from conftest import B, H

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from landxi_api import config  # noqa: E402

MODEL = "aerial25/best"
IMG23, IMG20 = "img-52190-2023-aerial", "img-52190-2020-aerial"
X0, Y0 = 127.41, 35.43                      # 시험 객체 자리(가짜 결과 묶음 · 시험 고치기만 따른다)


def db():
    return psycopg.connect(config.PG_ADMIN_DSN, autocommit=True)


def sq(x, y, d=0.0002):
    return f"MULTIPOLYGON((({x} {y},{x + d} {y},{x + d} {y + d},{x} {y + d},{x} {y})))"


def gj(x, y, d=0.0002):
    return {"type": "Polygon", "coordinates": [[[x, y], [x + d, y], [x + d, y + d], [x, y + d], [x, y]]]}


def mkjob(c, img, objs):
    jid = "job_TESTMEM" + secrets.token_hex(6).upper()
    c.execute("INSERT INTO jobs(id, kind, state, tenant_id, model_id, imagery_id, test, demo, options, finished_at) "
              "VALUES (%s,'infer','done','lx',%s,%s,true,false,'{}'::jsonb, now())", (jid, MODEL, img))
    for fid, cls, wkt in objs:
        c.execute("INSERT INTO detections(tenant_id, job_id, fid, cls, cls_en, conf, area_m2, edit_state, geom) "
                  "VALUES ('lx',%s,%s,%s,NULL,0.8, round(ST_Area(ST_Transform(ST_GeomFromText(%s,4326),5186))::numeric,1),'raw',ST_GeomFromText(%s,4326))",
                  (jid, fid, cls, wkt, wkt))
    return jid


def det(c, jid, fid):
    return c.execute("SELECT cls, edit_state, ST_AsText(geom) FROM detections WHERE job_id=%s AND fid=%s", (jid, fid)).fetchone()


def post(t, p, body, ok=200):
    r = httpx.post(B + p, json=body, headers=H(t), timeout=60)
    assert r.status_code == ok, r.text
    return r.json()


JOBS: list = []


@pytest.fixture(scope="module")
def world(tok):
    """작업 A(2023 영상)에 시험 고치기 넷 → 새 결과 B(같은 영상) · C(2020 영상)."""
    with db() as c:
        a = mkjob(c, IMG23, [("o1", "비닐하우스", sq(X0, Y0)), ("o2", "건물", sq(X0 + 0.001, Y0)), ("o3", "비닐하우스", sq(X0 + 0.002, Y0))])
        JOBS.append(a)
    s, adm = tok["staff"], tok["admin"]
    e1 = post(s, "/ximap/edits", {"set": a, "fid": "o1", "action": "delete", "test": True})["edit"]["id"]
    e2 = post(s, "/ximap/edits", {"set": a, "fid": "o2", "action": "reclass", "cls": "경작지", "test": True})["edit"]["id"]
    e3 = post(s, "/ximap/edits", {"set": a, "fid": "o3", "action": "reshape", "geometry": gj(X0 + 0.002, Y0, 0.00012), "test": True})["edit"]["id"]
    e4 = post(s, "/ximap/edits", {"set": a, "action": "add", "cls": "비닐하우스", "geometry": gj(X0 + 0.003, Y0), "test": True})["edit"]["id"]
    with db() as c:
        assert c.execute("SELECT count(*) FROM result_edits WHERE id = ANY(%s) AND year = 2023", ([e1, e2, e3, e4],)).fetchone()[0] == 4
        # 새 결과 — 같은 자리(조금 비켜 남 · 같은 분류) + 다른 곳 하나
        objs = [("n1", "비닐하우스", sq(X0 + 0.00002, Y0)), ("n2", "건물", sq(X0 + 0.001, Y0 + 0.00002)), ("n3", "비닐하우스", sq(X0 + 0.002, Y0)),
                ("n9", "비닐하우스", sq(X0 + 0.01, Y0))]
        b = mkjob(c, IMG23, objs)
        cc = mkjob(c, IMG20, objs)
        JOBS.extend([b, cc])
    yield {"a": a, "b": b, "c": cc, "edits": [e1, e2, e3, e4], "staff": s, "admin": adm}
    with db() as c:
        c.execute("DELETE FROM edit_rechecks WHERE set_id = ANY(%s)", (JOBS,))
        c.execute("DELETE FROM edit_memory_runs WHERE job_id = ANY(%s)", (JOBS,))
        c.execute("DELETE FROM train_tiles WHERE set_id = ANY(%s) AND test", (JOBS,))
        c.execute("DELETE FROM result_edits WHERE set_id = ANY(%s) AND test", (JOBS,))
        c.execute("DELETE FROM detections WHERE job_id = ANY(%s)", (JOBS,))
        c.execute("DELETE FROM jobs WHERE id = ANY(%s) AND test", (JOBS,))


def test_a_b_same_year_applies(world):
    r = post(world["admin"], "/ximap/memory/apply", {"set": world["b"]})["result"]
    assert r["applied"]["value"] == 4 and r["recheck"]["value"] == 0
    with db() as c:
        b = world["b"]
        assert det(c, b, "n1")[1] == "deleted"                                   # (a) 지운 자리 → 다시 안 나타남
        assert det(c, b, "n2")[0] == "경작지"                                      # (b) 바꾼 분류
        g3 = det(c, b, "n3")[2]
        g3a = c.execute("SELECT ST_AsText(geom_after) FROM result_edits WHERE id=%s", (world["edits"][2],)).fetchone()[0]
        assert c.execute("SELECT ST_Equals(ST_GeomFromText(%s), ST_GeomFromText(%s))", (g3, g3a)).fetchone()[0]   # 고친 모양
        assert det(c, b, "n9")[1] == "raw"                                       # 다른 곳은 그대로
        added = c.execute("SELECT count(*) FROM detections WHERE job_id=%s AND edit_state='added'", (b,)).fetchone()[0]
        assert added == 1                                                        # 새로 그린 것 → 그대로 더함
        rows = c.execute("SELECT action, source, by_user, from_edit FROM result_edits WHERE set_id=%s ORDER BY action", (b,)).fetchall()
        assert {x[0] for x in rows} == {"add", "delete", "reclass", "reshape"}
        assert all(x[1] == "memory" and x[2] == "u_mail_test" and x[3] in world["edits"] for x in rows)
        run = c.execute("SELECT places, del_places, del_again FROM edit_memory_runs WHERE job_id=%s", (b,)).fetchone()
        assert run == (4, 1, 1)                                                   # (e) 지운 자리 1곳 중 다시 잡은 곳 1곳
    again = post(world["admin"], "/ximap/memory/apply", {"set": world["b"]})["result"]
    assert again["skip"] == "done"                                               # 한 결과에 한 번


def test_c_other_year_recheck(world, tok):
    r = post(world["admin"], "/ximap/memory/apply", {"set": world["c"]})["result"]
    assert r["applied"]["value"] == 0 and r["recheck"]["value"] >= 3
    with db() as c:
        assert det(c, world["c"], "n1")[1] == "raw" and det(c, world["c"], "n2")[0] == "건물"   # 적용하지 않음
        assert c.execute("SELECT count(*) FROM detections WHERE job_id=%s AND edit_state='added'", (world["c"],)).fetchone()[0] == 0
    f = httpx.get(B + "/ximap/feature", params={"set": world["c"], "fid": "n1"}, headers=H(tok["staff"]), timeout=60).json()
    assert f["recheck"] and f["recheck"][0]["action"] == "delete" and f["recheck"][0]["year"] == 2023   # '이전에 지운 자리'


def test_d_undo_memory_row(world):
    with db() as c:
        eid = c.execute("SELECT id FROM result_edits WHERE set_id=%s AND action='delete' AND source='memory'", (world["b"],)).fetchone()[0]
    f = httpx.get(B + "/ximap/feature", params={"set": world["b"], "fid": "n1"}, headers=H(world["staff"]), timeout=60).json()
    assert any(h["id"] == eid and h["memory"] and h.get("mine") for h in f["history"])   # 원래 고친 사람이 되돌릴 수 있다
    post(world["staff"], f"/ximap/edits/{eid}/undo", {})
    with db() as c:
        assert det(c, world["b"], "n1")[1] == "raw"                              # (d) 되돌리면 돌아옴
        objs = [("m1", "비닐하우스", sq(X0, Y0))]
        b2 = mkjob(c, IMG23, objs)
        JOBS.append(b2)
    post(world["admin"], "/ximap/memory/apply", {"set": b2})
    with db() as c:
        assert det(c, b2, "m1")[1] == "raw"                                      # 사람이 되돌린 자리는 다음 결과부터 따르지 않음


def test_e_release_line(world):
    from landxi_api.edit_memory import SyncConn, memory_for_model, memory_line
    with db() as c:
        m = asyncio.run(memory_for_model(SyncConn(c), MODEL, test=True))
    assert m and m["places"]["value"] >= 1 and m["again"]["value"] >= 1
    assert memory_line(m).startswith("지운 자리 ") and "다시 잡은 곳" in memory_line(m)


def test_h_memory_rows_make_no_tiles(world):
    from landxi_api.edit_memory import SyncConn
    from landxi_api.train_tiles import scan
    with db() as c:
        asyncio.run(scan(SyncConn(c), test=True, quiet_min=0, make=False))
        sets = {r[0] for r in c.execute("SELECT DISTINCT set_id FROM train_tiles WHERE test AND set_id = ANY(%s)", (JOBS,)).fetchall()}
    assert world["a"] in sets and world["b"] not in sets


def test_f_agency_models_unchanged():
    from test_impl28_national_v2 import test_agency_models_unchanged
    test_agency_models_unchanged()


# ── 전국 결과 ─────────────────────────────────────────────────────────────
def _nat_pick():
    from landxi_api.edit_memory import result_file_features
    from landxi_api.national import CLS
    with db() as c:
        rows = c.execute("SELECT n.job_id, n.asset, n.year, n.cell_cd FROM national_jobs n JOIN national_cells k ON k.asset=n.asset AND k.year=n.year "
                         "AND k.cell_cd=n.cell_cd AND k.state='done' AND NOT k.test AND k.model_id IS NOT DISTINCT FROM n.model_id "
                         "WHERE n.state='done' AND NOT n.test AND n.result_set IS NOT NULL ORDER BY n.done_at DESC LIMIT 30").fetchall()
        for jid, asset, year, cd in rows:
            feats = result_file_features(jid)
            for fid, f in list(feats.items())[:400]:
                cls = (f.get("properties") or {}).get("cls")
                if cls not in CLS[asset]:
                    continue
                if c.execute("SELECT 1 FROM detections WHERE job_id=%s AND fid=%s", (jid, fid)).fetchone():
                    continue
                inside = c.execute("SELECT ST_Intersects(geom_s, ST_PointOnSurface(ST_SetSRID(ST_GeomFromGeoJSON(%s),4326))) FROM national_cells "
                                   "WHERE asset=%s AND year=%s AND cell_cd=%s", (json.dumps(f["geometry"]), asset, year, cd)).fetchone()[0]
                if inside:
                    return jid, asset, year, cd, fid, cls
    pytest.skip("전국 결과 객체 없음")


def test_g_national_edit(tok):
    jid, asset, year, cd, fid, cls = _nat_pick()
    s = tok["staff"]
    f = httpx.get(B + "/ximap/feature", params={"set": f"results/lx/{jid}", "fid": fid}, headers=H(s), timeout=60)
    assert f.status_code == 200, f.text
    f = f.json()
    assert f["meta"]["service"] in ("농지 전수", "하천 · 계곡") and f["can_edit"]
    with db() as c:
        n0 = c.execute("SELECT (counts->%s->>'n')::int FROM national_cells WHERE asset=%s AND year=%s AND cell_cd=%s", (cls, asset, year, cd)).fetchone()[0]
    ids = []
    try:
        # 시험 고치기 — 칸 숫자는 그대로 · 고친 자리 범위 조회에 나옴
        e = post(s, "/ximap/edits", {"set": f"results/lx/{jid}", "fid": fid, "action": "delete", "test": True})
        ids.append(e["edit"]["id"])
        g = f["geometry"]["coordinates"][0][0] if f["geometry"]["type"] == "Polygon" else f["geometry"]["coordinates"][0][0][0]
        box = f"{g[0] - 0.01},{g[1] - 0.01},{g[0] + 0.01},{g[1] + 0.01}"
        live = httpx.get(B + "/ximap/edits", params={"bbox": box}, headers=H(s), timeout=60).json()
        assert any(x["properties"]["edit"] == e["edit"]["id"] for x in live["features"])
        post(s, f"/ximap/edits/{e['edit']['id']}/undo", {})
        # 실제 고치기 → 진행 장부 칸 숫자 -1 → 되돌리면 그대로(숫자 한 출처)
        e = post(s, "/ximap/edits", {"set": f"results/lx/{jid}", "fid": fid, "action": "delete"})
        ids.append(e["edit"]["id"])
        reg = httpx.get(B + "/national/progress", headers=H(s), timeout=60).json()
        with db() as c:
            n1 = c.execute("SELECT (counts->%s->>'n')::int FROM national_cells WHERE asset=%s AND year=%s AND cell_cd=%s", (cls, asset, year, cd)).fetchone()[0]
            proj = c.execute("SELECT project_id, year FROM result_edits WHERE id=%s", (e["edit"]["id"],)).fetchone()
        assert n1 == n0 - 1
        assert proj[0] == "prj_aa6c836803" and proj[1] == year            # 학습 데이터 → 경작지 v2 프로젝트 · 영상 연도
        assert reg["v"][asset].count(".") == 2                             # 판에 고친 횟수(지도 조각도 새로)
        post(s, f"/ximap/edits/{e['edit']['id']}/undo", {})
        with db() as c:
            n2 = c.execute("SELECT (counts->%s->>'n')::int FROM national_cells WHERE asset=%s AND year=%s AND cell_cd=%s", (cls, asset, year, cd)).fetchone()[0]
        assert n2 == n0
    finally:
        with db() as c:
            c.execute("DELETE FROM result_edits WHERE id = ANY(%s)", (ids,))
            c.execute("DELETE FROM detections WHERE job_id=%s AND fid=%s AND NOT EXISTS (SELECT 1 FROM result_edits e WHERE e.det_id = detections.id)", (jid, fid))
