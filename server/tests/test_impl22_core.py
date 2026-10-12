"""바퀴 8 · 핵심 코어 고리(원칙 205 · 213 · 217 · 10-12 12:45 확인) — GPU 0(학습을 대기열에 넣지 않는다).

① 클래스 한 곳: 모델 · 서비스 판 · 결과 · 학습 데이터 묶음 · 고친 기록이 같은 클래스 id 를 가리킨다(결과 글자는 그대로 — 숫자 바뀌지 않음).
② 새 클래스: 직원이 더하면 '승인 대기'(비슷한 이름은 먼저 보여 줌) · 그 클래스로 고친 것은 학습 데이터에 안 들어감 · 관리자만 승인 · 합치기 · 거절.
③ 세부(위 클래스 있음)를 승인하면 위 클래스 서비스의 지금 판에 '배우는 중 · 나누기'로 붙고, 새 물체는 새 모델 프로젝트 후보.
④ 고친 것 → 학습 데이터: 데이터하우스 · 학습 화면 선택지에 '고친 것 n건'(학습에 넣는 것만 센다 — 결정 3 전 규칙 한 곳).
⑤ XI 재학습 · 배포 관리: 서비스마다 줄 · 쉬는 시간 자동 기본 · 수동 · 기준 · 스케줄러 판단(쉬는 시간 · 기준 · 다른 고부하 작업 · 학습 자리 하나) ·
   10-08 비닐하우스 다시 학습(같은 검증 묶음 87% < 지금 판 91%)은 '지금 판보다 낮음 · 후보로 남음'.
⑥ 학습 서식: 업무별 기본 흐름 · 빠질 수 없는 블록 · 관리자만 바꿈.
시험으로 만든 클래스 · 고친 기록 · 재학습 기록은 '시험' 표시 후 지워 0 으로 되돌린다.
실행: python -m pytest server/tests/test_impl22_core.py -q   (게이트웨이 :8700)
"""
import httpx
import psycopg
import pytest

from conftest import ADMIN_LOGIN, B, config, login_lx


def H(t):
    return {"authorization": "Bearer " + t}


@pytest.fixture(scope="module")
def tok():
    return {"staff": login_lx(), "admin": login_lx(ADMIN_LOGIN)}


def get(t, p):
    r = httpx.get(B + p, headers=H(t), timeout=60)
    assert r.status_code == 200, r.text
    return r.json()


def call(t, m, p, body=None):
    return httpx.request(m, B + p, headers=H(t), json=body, timeout=60)


def sql(q, *a):
    with psycopg.connect(config.PG_ADMIN_DSN, autocommit=True) as c:
        cur = c.execute(q, a)
        return cur.fetchall() if cur.description else None


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    # 시험으로 만든 것 — 고친 기록(시험 · 되돌림)은 남는 줄이 아니라 지운다 · 클래스 · 재학습 기록
    ids = [r[0] for r in sql("SELECT id FROM classes WHERE test")]
    sql("UPDATE result_edits SET cls_after_id=NULL WHERE cls_after_id = ANY(%s)", ids)
    sql("DELETE FROM card_classes WHERE class_id = ANY(%s)", ids)
    sql("DELETE FROM class_labels WHERE class_id = ANY(%s)", ids)
    sql("UPDATE classes SET merged_into=NULL WHERE merged_into = ANY(%s)", ids)
    sql("DELETE FROM classes WHERE test")
    sql("DELETE FROM retrain_runs WHERE test")


def _board_pick(t):
    bd = get(t, "/ximap/board")
    for r in bd["regions"]:
        for x in r["items"]:
            if x["svc"] and "비닐하우스" in (x.get("name") or "") and x["layer"]["set"].split("/")[-1].startswith("job_") and x["n"]["value"] > 5:
                return x
    for r in bd["regions"]:
        for x in r["items"]:
            if x["layer"]["set"].split("/")[-1].startswith("job_") and x["n"]["value"] > 5:
                return x
    pytest.skip("고칠 결과 묶음 없음")


# ① 클래스 한 곳 ──────────────────────────────────────────────
def test_one_list_same_id(tok):
    L = get(tok["staff"], "/classes")
    by = {c["name"]: c for c in L["items"]}
    for n in ("건물", "주차장", "경작지", "비닐하우스", "단동 비닐하우스", "다동 비닐하우스"):
        assert n in by, n
    assert by["단동 비닐하우스"]["parent"]["name"] == "비닐하우스" and by["단동 비닐하우스"]["kind"] == "detail"
    gid = by["비닐하우스"]["id"]
    # 모델 머리 · 서비스 판 · 결과 글자 · 학습 데이터 묶음 → 같은 id
    assert sql("SELECT class_id FROM model_classes WHERE model_id='aerial25/best' AND label='비닐하우스'")[0][0] == gid
    assert sql("SELECT class_id FROM card_classes WHERE card_id='card-5e85a9' AND version='2.0'")[0][0] == gid
    assert sql("SELECT class_id FROM class_labels WHERE label='비닐하우스'")[0][0] == gid
    assert sql("SELECT class_id FROM class_labels WHERE label='greenhouse'")[0][0] == gid
    assert (gid,) in sql("SELECT class_id FROM sample_classes WHERE sample_id='smp_94f1ab120e'")
    assert sql("SELECT class_id FROM class_labels WHERE label='비닐하우스_다동'")[0][0] == by["다동 비닐하우스"]["id"]


def test_edit_points_to_class_id(tok):
    t = tok["staff"]
    x = _board_pick(t)
    s = x["layer"]["set"]
    f = get(t, f"/results/{s}/features?limit=1")["features"][0]
    pk = get(t, "/classes/pick?" + str(httpx.QueryParams({"set": s})))
    assert pk["finds"] or pk["model"]
    cur = f["properties"]["cls"]
    other = next(c for c in pk["finds"] + pk["model"] + pk["others"] if c["name"] != cur and c["status"] == "approved")
    r = call(t, "POST", "/ximap/edits", {"set": s, "fid": f["id"], "action": "reclass", "cls_id": other["id"], "test": True}).json()
    assert r["feature"]["properties"]["cls"] == other["name"]
    eid = r["edit"]["id"]
    row = sql("SELECT cls_before_id, cls_after_id, test FROM result_edits WHERE id=%s", eid)[0]
    assert row[1] == other["id"] and row[2] is True
    assert row[0] == sql("SELECT class_id FROM class_labels WHERE label=%s", cur)[0][0]
    u = call(t, "POST", f"/ximap/edits/{eid}/undo", {}).json()
    assert u["feature"]["properties"]["cls"] == cur


# ② ③ 새 클래스 ───────────────────────────────────────────────
def test_new_class_flow(tok):
    s_, a_ = tok["staff"], tok["admin"]
    x = _board_pick(s_)
    st = x["layer"]["set"]
    gh = next(c for c in get(s_, "/classes")["items"] if c["name"] == "비닐하우스")
    # 비슷한 이름 먼저(화면은 GET 으로 먼저 묻는다) → 서버도 POST 에서 한 번 더 막음(409 similar)
    sm = get(s_, "/classes/similar?name=연동 비닐하우스")
    assert sm["same"] is None and {"단동 비닐하우스", "다동 비닐하우스"} <= {c["name"] for c in sm["similar"]}
    assert get(s_, "/classes/similar?name=비닐하우스_다동")["same"]["name"] == "다동 비닐하우스"
    r = call(s_, "POST", "/classes", {"name": "연동 비닐하우스", "kind": "detail", "parent_id": gh["id"], "set": st, "test": True})
    assert r.status_code == 409 and r.json()["error"]["detail"]["similar"]
    # 이미 있는 이름(다른 이름 포함)은 더할 수 없음
    r = call(s_, "POST", "/classes", {"name": "비닐하우스_다동", "kind": "object", "test": True, "force": True})
    assert r.status_code == 409
    r = call(s_, "POST", "/classes", {"name": "연동 비닐하우스", "kind": "detail", "parent_id": gh["id"], "set": st, "test": True, "force": True})
    assert r.status_code == 201, r.text
    c = r.json()["class"]
    assert c["status"] == "proposed" and c["parent"]["id"] == gh["id"] and c["test"]
    # 직원은 결정 못 함
    assert call(s_, "POST", f"/classes/{c['id']}/decide", {"action": "approve"}).status_code == 403
    # 승인 대기 클래스로 고친 것 = 학습에 안 들어감
    f = get(s_, f"/results/{st}/features?limit=1")["features"][0]
    e = call(s_, "POST", "/ximap/edits", {"set": st, "fid": f["id"], "action": "reclass", "cls_id": c["id"], "test": True}).json()
    sql("UPDATE result_edits SET test=false WHERE id=%s", e["edit"]["id"])          # 시험 줄을 잠깐 실제처럼 세어 본다(곧 되돌림)
    try:
        dh = get(s_, "/datahouse/classes")
        mine = next(i for i in dh["items"] if i["id"] == c["id"])
        assert mine["edits"]["value"] == 0 and mine["edits_pending"]["value"] == 1 and mine["status"] == "proposed"
        assert dh["edits_pending"]["value"] >= 1
        # 관리자 승인 → 세부는 비닐하우스 서비스 지금 판에 '배우는 중 · 나누기'
        ok = call(a_, "POST", f"/classes/{c['id']}/decide", {"action": "approve"})
        assert ok.status_code == 200 and ok.json()["class"]["status"] == "approved"
        assert sql("SELECT state, how FROM card_classes WHERE card_id='card-5e85a9' AND class_id=%s", c["id"]) == [("learning", "split")]
        mine = next(i for i in get(s_, "/datahouse/classes")["items"] if i["id"] == c["id"])
        assert mine["edits"]["value"] == 1                                            # 승인되면 학습에 들어간다
        rt = next(r for r in get(a_, "/retrain")["services"] if r["card_id"] == "card-5e85a9")
        assert [d["name"] for d in rt["split"]] == ["연동 비닐하우스"]
    finally:
        sql("UPDATE result_edits SET test=true WHERE id=%s", e["edit"]["id"])
        call(s_, "POST", f"/ximap/edits/{e['edit']['id']}/undo", {})
    # 합치기 · 거절
    o = call(s_, "POST", "/classes", {"name": "시험 태양광", "kind": "object", "card_id": "card-45424f", "test": True, "force": True}).json()["class"]
    m = call(s_, "POST", "/classes", {"name": "시험 하우스 묶음", "kind": "object", "card_id": "card-45424f", "test": True, "force": True}).json()["class"]
    rj = call(a_, "POST", f"/classes/{o['id']}/decide", {"action": "reject", "note": "시험"}).json()["class"]
    assert rj["status"] == "rejected"
    mg = call(a_, "POST", f"/classes/{m['id']}/decide", {"action": "merge", "into": gh["id"]}).json()["class"]
    assert mg["status"] == "merged" and mg["merged_into"] == gh["id"]
    assert sql("SELECT class_id FROM class_labels WHERE label='시험 하우스 묶음'")[0][0] == gh["id"]
    sql("UPDATE classes SET aliases = array_remove(aliases, '시험 하우스 묶음') WHERE id=%s", gh["id"])
    sql("DELETE FROM class_labels WHERE label='시험 하우스 묶음'")
    # 새 물체(승인) → 새 모델 프로젝트 후보
    n = call(a_, "POST", "/classes", {"name": "시험 새 물체", "kind": "object", "test": True, "force": True}).json()["class"]
    assert n["status"] == "approved"                                                # 관리자가 더하면 바로 승인
    assert any(cd["id"] == n["id"] for cd in get(a_, "/retrain")["candidates"])
    # 시험 정리 — 시험 클래스만 지울 수 있음
    assert call(a_, "DELETE", "/classes/cl_building").status_code == 403
    for cid in (c["id"], o["id"], m["id"], n["id"]):
        assert call(a_, "DELETE", f"/classes/{cid}").status_code == 200
    assert sql("SELECT count(*) FROM classes WHERE test")[0][0] == 0


# ④ 고친 것 → 학습 데이터 ──────────────────────────────────────
def test_units_one_rule(tok):
    dh = get(tok["staff"], "/datahouse/classes")
    real = sql("SELECT count(*) FROM result_edits e LEFT JOIN classes ca ON ca.id=e.cls_after_id WHERE e.undone_at IS NULL AND NOT e.test "
               "AND e.action <> 'memo' AND (e.cls_after_id IS NULL OR ca.status='approved')")[0][0]
    assert dh["edits"]["value"] == real and dh["unit"]["id"] == "edit"
    u = get(tok["staff"], "/datahouse/units?project=prj_3fdba452d5")
    assert u["card_id"] == "card-5e85a9" and u["units"]["value"] >= 0
    gh = next(i for i in dh["items"] if i["name"] == "비닐하우스")
    assert gh["samples"]["value"] == 130 and any(s["card_id"] == "card-5e85a9" for s in gh["services"])   # 올린 묶음 class_images(비닐하우스 130)


# ⑤ XI 재학습 · 배포 관리 ─────────────────────────────────────
def test_retrain_view(tok):
    R = get(tok["admin"], "/retrain")
    assert R["settings"]["mode"] in ("auto", "manual") and R["settings"]["min_new"]["value"] >= 1
    gh = next(r for r in R["services"] if r["card_id"] == "card-5e85a9")
    vd = gh["verdict"]
    assert vd and vd["value"]["value"] == 87 and vd["base"]["value"] == 91 and vd["better"] is False
    assert gh["state"] == "지금 판보다 낮음 · 후보로 남음"
    assert all(r["card_id"] != "card-change" for r in R["services"])               # 가중치 없는 모델(지표)은 다시 학습하지 않음
    # 직원은 자기 서비스 줄만(프로젝트장)
    S = get(tok["staff"], "/retrain")
    assert all(r["project"] and r["project"]["lead"] == "u_mail_test" for r in S["services"])
    assert call(tok["staff"], "PUT", "/retrain/settings", {"mode": "manual"}).status_code == 403


def _row(card, n, mode="auto", project=True, tone=""):
    return {"card_id": card, "service": card, "units": {"value": n}, "mode": mode, "tone": tone, "split": [],
            "project": {"id": "p", "name": "p", "lead": "u"} if project else None}


def test_scheduler_decisions(tok):
    a = tok["admin"]
    night, day = "2026-10-13T23:30:00+09:00", "2026-10-13T14:00:00+09:00"            # 화요일
    rows = [_row("A", 250), _row("B", 300), _row("C", 10), _row("D", 400, mode="manual"), _row("E", 999, project=False), _row("F", 500, tone="live")]
    r = call(a, "POST", "/retrain/tick", {"at": night, "rows": rows, "busy": []}).json()
    code = {d["card_id"]: d["code"] for d in r["decisions"]}
    assert r["dry"] and r["quiet"]
    assert code == {"A": "queue", "B": "wait_slot", "C": "below", "D": "manual", "E": "no_project", "F": "live"}   # 학습 자리 하나
    assert next(d for d in r["decisions"] if d["card_id"] == "A")["result"]["state"] == "dry"
    r = call(a, "POST", "/retrain/tick", {"at": day, "rows": rows, "busy": []}).json()
    assert {d["card_id"]: d["code"] for d in r["decisions"]}["A"] == "not_quiet"
    r = call(a, "POST", "/retrain/tick", {"at": night, "rows": rows, "busy": ["national 1"]}).json()
    assert {d["card_id"]: d["code"] for d in r["decisions"]}["A"] == "busy"           # 다른 고부하(전국 분석 등)와 겹치지 않음
    r = call(a, "POST", "/retrain/tick", {"at": "2026-10-17T14:00:00+09:00", "rows": rows, "busy": []}).json()   # 토요일 낮
    assert r["quiet"] and {d["card_id"]: d["code"] for d in r["decisions"]}["A"] == "queue"
    # 실제 서비스 줄 — 지금은 기준 미달(고친 것 0) · 지금 학습은 409(대기열에 넣지 않음)
    r = call(a, "POST", "/retrain/tick", {"at": night, "dry": True}).json()
    assert all(d["code"] != "queue" for d in r["decisions"])
    nw = call(a, "POST", "/retrain/services/card-389c45/now", {})
    assert nw.status_code == 409
    assert sql("SELECT count(*) FROM jobs WHERE label LIKE 'XI 재학습%%'")[0][0] == 0


def test_service_mode_and_settings(tok):
    a = tok["admin"]
    st0 = get(a, "/retrain")["settings"]
    assert call(a, "PUT", "/retrain/services/card-45424f", {"mode": "manual"}).status_code == 200
    assert next(r for r in get(a, "/retrain")["services"] if r["card_id"] == "card-45424f")["mode"] == "manual"
    sql("DELETE FROM retrain_services WHERE card_id='card-45424f'")
    r = call(a, "PUT", "/retrain/settings", {"quiet_start": "23:00", "min_new": 150}).json()["settings"]
    assert r["quiet_start"] == "23:00" and r["min_new"]["value"] == 150
    call(a, "PUT", "/retrain/settings", {"quiet_start": st0["quiet_start"], "min_new": st0["min_new"]["value"]})
    assert call(a, "PUT", "/retrain/settings", {"quiet_start": "25:00"}).status_code == 400


# ⑥ 학습 서식 ─────────────────────────────────────────────────
def test_templates(tok):
    a, s_ = tok["admin"], tok["staff"]
    T = get(s_, "/train-templates")
    assert T["items"]["기본"]["blocks"][:4] == ["data", "base", "cfg", "train"] and not T["can_manage"]
    assert "학습 장비 배정(프로젝트 하나에 한 장)" in T["locked"]
    assert call(s_, "PUT", "/train-templates/주차장", {"blocks": ["data", "base", "cfg", "train"]}).status_code == 403
    assert call(a, "PUT", "/train-templates/주차장", {"blocks": ["data", "base", "train"]}).status_code == 400
    r = call(a, "PUT", "/train-templates/주차장", {"blocks": ["data", "base", "cfg", "train", "eval", "test", "deploy"], "params": {"epochs": 99, "imgsz": 1280, "batch": 8}})
    assert r.status_code == 200 and r.json()["template"]["params"] == {"epochs": 50, "imgsz": 1280, "batch": 8}   # 상한은 서버가 지킴
    assert get(s_, "/train-templates")["items"]["주차장"]["blocks"][-2:] == ["test", "deploy"]
    assert call(a, "DELETE", "/train-templates/주차장").status_code == 200
    assert "주차장" not in get(s_, "/train-templates")["items"]
