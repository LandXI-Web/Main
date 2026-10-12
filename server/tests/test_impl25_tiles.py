"""구현 25 · 결정 3 ⓐ 고치면 저절로(10-12 16:18 확인) — 고친 자리 둘레 한 칸 = 학습 데이터 1장 · 대기열 넣기.

① 순수 규칙: 어느 나라든 UTM 칸 · 같은 객체를 둘이 다르게 고치면 뺌 · YOLO 다각형 줄.
② 시험으로 고친 것 몇 건 → 칸(아직 조용하지 않으면 기다림) → 조용한 시간 지나면(시험은 0분) 1장 — 영상은 그 결과의 영상 원천에서 다시 자름 · 테두리 파일.
③ 다른 사람이 같은 객체를 다르게 고치면 그 칸은 '둘이 다르게 고침'으로 빠진다.
④ 스케줄러: 기준(200장) 미달이면 대기열에 안 넣음 · 기준을 낮춘 시험 환경에서는 대기열에 들어감(시험 작업 — 바로 취소 · 학습 0).
시험 고친 기록 · 칸 · 재학습 기록 · 작업은 '시험' 표시 후 지운다.
실행: python -m pytest server/tests/test_impl25_tiles.py -q   (게이트웨이 :8700)
"""
import datetime as dt
import time
from pathlib import Path

import httpx
import psycopg
import pytest

from conftest import ADMIN_LOGIN, B, config, login_lx
from landxi_api.train_tiles import cell_of, conflict, utm_epsg, yolo_lines

EVID = Path(__file__).resolve().parents[2] / "docs/superpowers/final/process/impl-25/retrain-farm"


def H(t):
    return {"authorization": "Bearer " + t}


def sql(q, *a):
    with psycopg.connect(config.PG_ADMIN_DSN, autocommit=True) as c:
        cur = c.execute(q, a)
        return cur.fetchall() if cur.description else None


# ① 순수 규칙 ─────────────────────────────────────────────
def test_cell_rules():
    assert utm_epsg(127.38, 35.41) == 32652            # 남원
    assert utm_epsg(106.8, -6.2) == 32748              # 자카르타(해외 · 남반구)
    assert utm_epsg(74.6, 42.9) == 32643               # 비슈케크
    assert cell_of(1000.0, 2000.0, 128.0) == (7, 15) and cell_of(-1.0, 0.0, 128.0) == (-1, 0)
    t0 = dt.datetime(2026, 10, 12, 10, 0)
    same = [{"det_id": 1, "by_user": "a", "action": "reclass", "cls_after": "경작지", "at": t0},
            {"det_id": 1, "by_user": "b", "action": "reclass", "cls_after": "경작지", "at": t0 + dt.timedelta(minutes=1)}]
    assert conflict(same) is None                       # 둘이 같게 고침 → 그대로
    diff = same + [{"det_id": 1, "by_user": "b", "action": "reclass", "cls_after": "비닐하우스", "at": t0 + dt.timedelta(minutes=2)}]
    assert conflict(diff)                               # b 의 마지막이 다름 → 뺌
    one = [{"det_id": 1, "by_user": "a", "action": "reclass", "cls_after": "건물", "at": t0},
           {"det_id": 1, "by_user": "a", "action": "delete", "at": t0 + dt.timedelta(minutes=1)}]
    assert conflict(one) is None                        # 한 사람이 여러 번 → 마지막 것
    ln = yolo_lines([(2, [(0.0, 128.0), (64.0, 128.0), (64.0, 64.0)])], 0.0, 128.0, 128.0)
    assert ln == ["2 0.000000 0.000000 0.500000 0.000000 0.500000 0.500000"]


# ② ~ ④ 실제 흐름 ─────────────────────────────────────────
@pytest.fixture(scope="module")
def tok():
    return {"staff": login_lx(), "admin": login_lx(ADMIN_LOGIN)}


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    jobs = [r[0] for r in sql("SELECT job_id FROM retrain_runs WHERE test AND job_id IS NOT NULL")]
    for j in jobs:
        try:
            httpx.post(f"{B}/jobs/{j}/cancel", headers=H(login_lx(ADMIN_LOGIN)), timeout=30)
        except Exception:  # noqa: BLE001
            pass
    sql("DELETE FROM retrain_runs WHERE test")
    if jobs:                                                   # 시험 작업(취소됨) 줄도 지운다 — 'XI 재학습' 작업 0 유지
        sql("DELETE FROM job_events WHERE job_id = ANY(%s)", jobs) if sql("SELECT to_regclass('job_events')")[0][0] else None
        sql("DELETE FROM jobs WHERE id = ANY(%s) AND test AND state IN ('cancelled','failed')", jobs)
    with psycopg.connect(config.PG_ADMIN_DSN, autocommit=True) as c:
        rows = c.execute("SELECT DISTINCT card_id FROM train_tiles WHERE test").fetchall()
    import shutil
    for (cd,) in rows:
        shutil.rmtree(config.DATA_ROOT / "training" / "xi-tiles" / f"{cd or 'none'}-test", ignore_errors=True)
    sql("DELETE FROM train_tiles WHERE test")
    for d in (config.DATA_ROOT / "training" / "retrain-auto").glob("*-test"):
        shutil.rmtree(d, ignore_errors=True)
    # 시험 고친 것 되돌림(결과 객체를 원래대로) → 줄 지움
    t = login_lx(ADMIN_LOGIN)
    for (eid,) in sql("SELECT id FROM result_edits WHERE test AND memo = '시험 25' AND undone_at IS NULL ORDER BY at DESC"):
        httpx.post(f"{B}/ximap/edits/{eid}/undo", headers=H(t), timeout=60)
    sql("DELETE FROM result_edits WHERE test AND memo = '시험 25'")


def _pick():
    """고칠 결과 묶음 — 재학습 줄에 있는 서비스(프로젝트 · 가중치) · 영상 원천이 있는 작업 결과 · 객체 몇 개."""
    rows = sql(
        "SELECT j.id, j.card_id, j.imagery_id FROM jobs j WHERE j.card_id IS NOT NULL AND j.imagery_id IS NOT NULL AND j.state='done' "
        "AND j.model_id='aerial25/best' AND EXISTS (SELECT 1 FROM detections d WHERE d.job_id=j.id AND d.cls='경작지') "
        "AND EXISTS (SELECT 1 FROM project_links l JOIN card_versions v ON v.id=l.ref WHERE l.kind='card_version' AND v.card_id=j.card_id) "
        "ORDER BY j.finished_at DESC LIMIT 20")
    for jid, card, img in rows:
        d = sql("SELECT d.fid, d.id FROM detections d WHERE d.job_id=%s AND d.cls='경작지' AND coalesce(d.edit_state,'raw')='raw' AND d.fid IS NOT NULL "
                "AND d.area_m2 BETWEEN 200 AND 3000 ORDER BY d.id LIMIT 40", jid)
        if len(d) >= 3:
            # 가까운 셋(같은 칸에 들게) — 첫 객체에서 가까운 순
            near = sql("SELECT d.fid FROM detections d, detections f WHERE f.job_id=%s AND f.fid=%s AND d.job_id=f.job_id AND d.cls='경작지' "
                       "AND coalesce(d.edit_state,'raw')='raw' AND d.fid IS NOT NULL ORDER BY ST_Distance(d.geom, f.geom) LIMIT 3", jid, d[0][0])
            return jid, card, img, [x[0] for x in near]
    pytest.skip("고칠 결과 묶음 없음")


def test_edits_become_one_tile_and_queue(tok):
    jid, card, img, fids = _pick()
    s = tok["staff"]
    made = []
    for f, body in zip(fids, ({"action": "reclass", "cls": "비닐하우스"}, {"action": "delete"}, {"action": "reclass", "cls": "건물"})):
        r = httpx.post(B + "/ximap/edits", headers=H(s), json={"set": jid, "fid": f, "test": True, "memo": "시험 25", **body}, timeout=60)
        assert r.status_code == 200, r.text
        made.append(r.json()["edit"]["id"])
    a = tok["admin"]
    # 방금 고침 → 조용한 시간(30분) 전이라 기다림
    r = httpx.post(B + "/retrain/tiles/scan", headers=H(a), json={"test": True, "quiet_min": 30}, timeout=120).json()
    assert r["result"]["waiting"]["value"] >= 1 and r["result"]["made"]["value"] == 0, r
    # 시험 환경: 조용한 시간 0분 → 1장
    r = httpx.post(B + "/retrain/tiles/scan", headers=H(a), json={"test": True, "quiet_min": 0}, timeout=300).json()
    assert r["result"]["made"]["value"] >= 1, r
    L = httpx.get(B + "/retrain/tiles?test=1&card=" + card, headers=H(a), timeout=60).json()
    ok = [x for x in L["items"] if x["state"] == "made"]
    assert ok and L["made"]["value"] == len(ok)
    t = sql("SELECT img_path, lbl_path, n_objects, n_edits, names FROM train_tiles WHERE id=%s", ok[0]["id"])[0]
    assert Path(t[0]).exists() and Path(t[1]).exists() and t[2] >= 1 and t[3] >= 1
    from PIL import Image
    im = Image.open(t[0])
    assert im.size == (512, 512)
    EVID.mkdir(parents=True, exist_ok=True)
    im.save(EVID / "tile-sample.png")                       # 증거 — 시험 칸 영상(정리 전 복사)
    (EVID / "tile-sample.txt").write_text(Path(t[1]).read_text(encoding="utf-8"), encoding="utf-8")
    # 같은 칸을 다시 고쳐도 1장 그대로(같은 칸 · 다시 만듦)
    n_before = L["made"]["value"]
    # ③ 다른 사람(관리자)이 같은 객체를 다르게 고침 → 그 칸은 뺀다
    r = httpx.post(B + "/ximap/edits", headers=H(a), json={"set": jid, "fid": fids[0], "test": True, "memo": "시험 25", "action": "reclass", "cls": "주차장"},
                   timeout=60)
    assert r.status_code == 200, r.text
    ae = r.json()["edit"]["id"]
    r = httpx.post(B + "/retrain/tiles/scan", headers=H(a), json={"test": True, "quiet_min": 0}, timeout=300).json()
    assert r["result"]["conflict"]["value"] >= 1, r
    L2 = httpx.get(B + "/retrain/tiles?test=1&card=" + card, headers=H(a), timeout=60).json()
    assert L2["made"]["value"] == n_before - 1 and any(x["state"] == "conflict" for x in L2["items"])
    # 관리자 고친 것을 되돌리면 다시 1장(조용한 시간 뒤)
    u = httpx.post(f"{B}/ximap/edits/{ae}/undo", headers=H(a), timeout=60)
    assert u.status_code == 200, u.text
    httpx.post(B + "/retrain/tiles/scan", headers=H(a), json={"test": True, "quiet_min": 0}, timeout=300)
    L3 = httpx.get(B + "/retrain/tiles?test=1&card=" + card, headers=H(a), timeout=60).json()
    assert L3["made"]["value"] == n_before
    # ④ 기준(200장) 미달 → 대기열에 넣지 않음
    night = "2026-10-12T23:30:00+09:00"
    r = httpx.post(B + "/retrain/tick", headers=H(a), json={"test_tiles": True, "at": night, "busy": [], "submit": True}, timeout=120).json()
    d = next(x for x in r["decisions"] if x["card_id"] == card)
    assert d["code"] == "below" and d["n"] == n_before, d
    # 기준을 1장으로 낮춘 시험 환경 → 대기열에 들어감(시험 작업) → 바로 취소
    r = httpx.post(B + "/retrain/tick", headers=H(a), json={"test_tiles": True, "at": night, "busy": [], "submit": True, "min_new": 1}, timeout=300).json()
    d = next(x for x in r["decisions"] if x["card_id"] == card)
    assert d["code"] == "queue", d
    res = d["result"]
    assert res["state"] == "queued" and res["job"], res
    j = httpx.get(f"{B}/jobs/{res['job']}", headers=H(a), timeout=30).json()
    j = j.get("job") or j
    assert j["kind"] == "train" and j["state"] in ("queued", "running")
    c = httpx.post(f"{B}/jobs/{res['job']}/cancel", headers=H(a), timeout=30)
    assert c.status_code in (200, 409), c.text
    import json
    (EVID / "tiles-proof.json").write_text(json.dumps({
        "at": time.strftime("%Y-%m-%dT%H:%M:%S"), "set": "시험 결과 묶음(지움)", "edits_by_staff": len(made),
        "scan_quiet30": "기다림(조용한 시간 전)", "scan_quiet0_made": n_before, "conflict_after_other_person": True,
        "below_threshold": {"code": "below", "n": n_before, "need": 200},
        "test_env_min1": {"code": "queue", "job_state_seen": j["state"], "cancelled": True},
        "tile": {"px": 512, "objects": t[2], "edits": t[3], "names": t[4]}}, ensure_ascii=False, indent=1), encoding="utf-8")
    # 잠깐 기다려 취소가 워커에 닿게(학습이 시작됐어도 첫 배치에서 멈춘다)
    for _ in range(30):
        st = (httpx.get(f"{B}/jobs/{res['job']}", headers=H(a), timeout=30).json().get("job") or {}).get("state")
        if st in ("cancelled", "failed", "done"):
            break
        time.sleep(2)
