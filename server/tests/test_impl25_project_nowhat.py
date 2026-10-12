"""구현 25차 — 새 프로젝트에서 '무엇을(업무)' 칸을 뺌(원칙 225 · 10-12 사용자 "무엇을? 하나고르기 이게 꼭 필요한 기능인가??? 난 아니라고 보는데").
실서버(:8700) · GPU 0 · 학습 0 · 영상 등록 0.

확인: ① 업무 없이 만들어진다(task = null) · 이름만 고쳐도 된다(업무를 다시 묻지 않음)
     ② 찾는 것(finds) = 이 프로젝트 학습 데이터에 실제로 붙은 클래스(train_samples.names → 클래스 한 곳 이름) · 학습 데이터 전 = []
     ③ 옛 프로젝트의 업무 값은 그대로 읽힌다(옛 데이터 호환) · 옛 화면이 업무를 보내도 받는다
     ④ 학습 서식 — 업무 없는 프로젝트는 '기본' 서식(서버가 늘 둔다)
     ⑤ 업무 없는 새 프로젝트에 같은 업무 옛 학습 기록(프로젝트 표시 없음)이 붙지 않는다(학습 이력 0)
시험 프로젝트는 끝에서 지운다(학습 데이터 행은 건드리지 않고 잇기만).
"""
import httpx
import psycopg
import pytest

from conftest import B, H
from landxi_api import config


def pg():
    return psycopg.connect(config.PG_ADMIN_DSN, autocommit=True)


@pytest.fixture
def made(live):
    ids = []
    yield ids
    c = pg()
    for pid in ids:
        c.execute("DELETE FROM projects WHERE id=%s", (pid,))
    c.close()


def _new(tok, made, **kw):
    r = httpx.post(B + "/projects", headers=H(tok["staff"]), json={"name": "pytest 무엇을 없음", "regions": ["52190"], **kw}, timeout=60)
    assert r.status_code == 201, r.text
    made.append(r.json()["id"])
    return r.json()


def test_create_without_task(tok, made):
    p = _new(tok, made)
    assert p["task"] is None and p["task_id"] is None and p["finds"] == []
    r = httpx.patch(B + f"/projects/{p['id']}", headers=H(tok["staff"]), json={"name": "pytest 무엇을 없음 2"}, timeout=30)
    assert r.status_code == 200, r.text
    assert r.json()["name"] == "pytest 무엇을 없음 2" and r.json()["task"] is None
    lst = httpx.get(B + "/projects?scope=mine", headers=H(tok["staff"]), timeout=60).json()
    row = next(x for x in lst["items"] if x["id"] == p["id"])
    assert row["task"] is None and row["finds"] == []
    tr = httpx.get(B + f"/projects/{p['id']}/train", headers=H(tok["staff"]), timeout=60)
    assert tr.status_code == 200 and tr.json().get("runs") == []                       # 남의 옛 학습 이력 0


def test_finds_from_uploaded_classes(tok, made):
    c = pg()
    s = c.execute("SELECT id, names FROM train_samples WHERE jsonb_typeof(names) = 'array' AND jsonb_array_length(names) > 0 "
                  "ORDER BY created_at DESC LIMIT 1").fetchone()
    if not s:
        c.close()
        pytest.skip("학습 데이터 묶음 없음")
    p = _new(tok, made)
    c.execute("INSERT INTO project_links(project_id, kind, ref, round, by) VALUES (%s,'sample',%s,1,'pytest')", (p["id"], s[0]))
    want = []
    for lb in s[1]:
        row = c.execute("SELECT c.name, c.status, m.name FROM class_labels l JOIN classes c ON c.id = l.class_id "
                        "LEFT JOIN classes m ON m.id = c.merged_into WHERE l.label=%s", (lb,)).fetchone()
        if row and row[1] == "rejected":
            continue
        nm = (row[2] or row[0]) if row else lb
        if nm not in want:
            want.append(nm)
    c.close()
    got = httpx.get(B + f"/projects/{p['id']}", headers=H(tok["staff"]), timeout=60).json()
    assert got["finds"] == want[:12] and got["task"] is None


def test_old_task_still_read(tok, made):
    p = _new(tok, made, task="비닐하우스", task_id="greenhouse")                     # 옛 화면 · 옛 프로젝트 값
    assert p["task"] == "비닐하우스" and p["task_id"] == "greenhouse"
    r = httpx.patch(B + f"/projects/{p['id']}", headers=H(tok["staff"]), json={"name": "pytest 무엇을 옛 값"}, timeout=30).json()
    assert r["task"] == "비닐하우스"                                                  # 이름만 고치면 업무 값은 그대로


def test_default_template_always_there(tok):
    t = httpx.get(B + "/train-templates", headers=H(tok["staff"]), timeout=30).json()
    assert "기본" in t["items"] and set(["data", "base", "cfg", "train"]) <= set(t["items"]["기본"]["blocks"])
    assert None not in t["tasks"] and "" not in t["tasks"]                           # 업무 없는 프로젝트는 서식 목록에 끼지 않는다
