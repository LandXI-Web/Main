"""프로젝트 삭제(10-23 사용자 "프로젝트 삭제하는 기능도 필요하다") — 시험 게이트웨이 · 시험 DB(landxi_test) · GPU 0.

확인: ① 누가 — 프로젝트장 · LX 관리자만(다른 직원 403 · can.delete 없음)
     ② 삭제 창 — 영상 · 학습 자료 · 모델 · 결과 · 파일 · 돌던 작업 수(서버 기록)
     ③ 이름을 똑같이 적어야(다르면 400)
     ④ 막힘 — 배포 신청 중(승인 요청 대기) · 기관에 공유됨이면 409 + 먼저 할 일
     ⑤ 삭제 — 모든 목록에서 빠짐 · 한 장 404 '삭제한 프로젝트입니다' · 돌던 작업 '프로젝트 삭제'로 멈춤 · 학습 자료 removed · 모델 retired ·
        폴더는 02. 데이터/_trash/projects/{프로젝트} 로 옮김(지우지 않음) · 감사 기록 project.delete 한 줄
     ⑥ 30일 정리(retention.purge_projects) — 기한이 지나면 휴지 폴더 · 프로젝트 줄을 지운다(기한 전에는 그대로)
시험이 만든 줄 · 폴더는 끝에서 지운다(감사 기록 줄은 건드리지 않는다).
"""
import secrets
import shutil

import httpx
import psycopg
import pytest

from conftest import B, H, STAFF_ID, _login, drop_account, temp_account
from landxi_api import config

TAG = "pytest_del_" + secrets.token_hex(3)
SID, JOB_T, JOB_R, MID = f"smp_{TAG}", f"job_{TAG}_t", f"job_{TAG}_r", f"trained/job_{TAG}_t"
SDIR = config.DATA_ROOT / "training" / "samples" / TAG
MDIR = config.DATA_ROOT / "models" / "trained" / JOB_T
OTHER = "u_pytest_del_other"


def pg():
    return psycopg.connect(config.PG_ADMIN_DSN, autocommit=True)


@pytest.fixture(scope="module")
def other(live):
    uid, t = temp_account("lx", OTHER, "pytest-del-other@lx.or.kr", "staff", name="시험 직원 삭제")
    yield t
    drop_account("lx", OTHER)


@pytest.fixture(scope="module")
def proj(live, tok):
    """시험 프로젝트 하나 — 영상 1 · 파일 1 · 학습 자료 1(폴더) · 모델 1(폴더) · 돌던 작업 1."""
    r = httpx.get(B + "/projects/imagery", headers=H(tok["staff"]), timeout=60)
    img = [x for x in r.json()["items"] if x.get("region")][0]
    name = f"시험 삭제 {TAG[-6:]}"
    r = httpx.post(B + "/projects", headers=H(tok["staff"]), json={"name": name, "imagery": [img["id"]]}, timeout=60)
    assert r.status_code == 201, r.text
    pid = r.json()["id"]
    r = httpx.post(B + f"/projects/{pid}/files", headers=H(tok["staff"]), files={"file": ("메모.txt", "시험".encode(), "text/plain")}, timeout=60)
    assert r.status_code == 201, r.text
    SDIR.mkdir(parents=True, exist_ok=True)
    (SDIR / "a.txt").write_text("x", encoding="utf-8")
    (MDIR / "weights").mkdir(parents=True, exist_ok=True)
    (MDIR / "weights" / "best.pt").write_bytes(b"0")
    c = pg()
    c.execute("INSERT INTO train_samples(id, task_name, dir, names) VALUES (%s,'시험',%s,'[]'::jsonb)", (SID, str(SDIR)))
    c.execute("INSERT INTO project_links(project_id, kind, ref, round, by) VALUES (%s,'sample',%s,1,%s)", (pid, SID, STAFF_ID))
    c.execute("INSERT INTO jobs(id, tenant_id, submitted_by, kind, state, options, test) VALUES (%s,'lx',%s,'train','done',%s::jsonb,true)",
              (JOB_T, STAFF_ID, f'{{"project_id":"{pid}","samples":["{SID}"]}}'))
    c.execute("INSERT INTO models(id, status, train_job, sample_id, weights_uri, created_at) VALUES (%s,'candidate',%s,%s,%s,now())",
              (MID, JOB_T, SID, str(MDIR / "weights" / "best.pt")))
    c.execute("INSERT INTO jobs(id, tenant_id, submitted_by, kind, state, options, test) VALUES (%s,'lx',%s,'infer','running',%s::jsonb,true)",
              (JOB_R, STAFF_ID, f'{{"project_id":"{pid}"}}'))
    yield {"id": pid, "name": name}
    c.execute("DELETE FROM approvals WHERE subject_id=%s", (MID,))
    c.execute("DELETE FROM models WHERE id=%s", (MID,))
    c.execute("DELETE FROM jobs WHERE id = ANY(%s)", ([JOB_T, JOB_R],))
    c.execute("DELETE FROM train_samples WHERE id=%s", (SID,))
    c.execute("DELETE FROM projects WHERE id=%s", (pid,))
    c.close()
    for d in (SDIR, MDIR, config.DATA_ROOT / "_trash" / "projects" / pid, config.DATA_ROOT / "projects" / pid):
        shutil.rmtree(d, ignore_errors=True)


def test_who(proj, tok, other):
    pid = proj["id"]
    assert httpx.get(B + f"/projects/{pid}", headers=H(tok["staff"]), timeout=60).json()["can"]["delete"] is True
    httpx.post(B + f"/projects/{pid}/members", headers=H(tok["staff"]), json={"user_id": OTHER}, timeout=60)
    assert httpx.get(B + f"/projects/{pid}", headers=H(other), timeout=60).json()["can"]["delete"] is False
    assert httpx.get(B + f"/projects/{pid}/delete", headers=H(other), timeout=60).status_code == 403
    assert httpx.request("DELETE", B + f"/projects/{pid}", headers=H(other), json={"name": proj["name"]}, timeout=60).status_code == 403
    r = httpx.get(B + f"/projects/{pid}/delete", headers=H(tok["admin"]), timeout=60)
    assert r.status_code == 200, r.text


def test_check_counts_and_blocks(proj, tok):
    pid = proj["id"]
    d = httpx.get(B + f"/projects/{pid}/delete", headers=H(tok["staff"]), timeout=60).json()
    c = {k: v["value"] for k, v in d["counts"].items()}
    assert c == {"imagery": 1, "samples": 1, "models": 1, "results": 0, "files": 1, "running": 1}, c
    assert d["can_delete"] is True and d["blocked"] == []
    r = httpx.request("DELETE", B + f"/projects/{pid}", headers=H(tok["staff"]), json={"name": "다른 이름"}, timeout=60)
    assert r.status_code == 400
    # 배포 신청 중(모델 승인 요청 대기) — 막힘 + 먼저 할 일
    with pg() as c2:
        c2.execute("INSERT INTO approvals(id, subject_type, subject_id, requested_by, state, at) VALUES (%s,'model',%s,%s,'pending',now())",
                   (f"ap_{TAG}", MID, STAFF_ID))
    d = httpx.get(B + f"/projects/{pid}/delete", headers=H(tok["staff"]), timeout=60).json()
    assert d["can_delete"] is False and d["blocked"][0]["kind"] == "pending" and "승인하거나 거절" in d["blocked"][0]["todo"]
    r = httpx.request("DELETE", B + f"/projects/{pid}", headers=H(tok["staff"]), json={"name": proj["name"]}, timeout=60)
    assert r.status_code == 409, r.text
    with pg() as c2:
        c2.execute("DELETE FROM approvals WHERE id=%s", (f"ap_{TAG}",))
    # 기관에 공유됨(이 프로젝트 서비스의 기관 공유 마지막 줄이 켜짐) — 막힘 + 먼저 할 일(공유 거두기)
    card = f"card_{TAG}"
    with pg() as c2:
        c2.execute("INSERT INTO cards(id) VALUES (%s)", (card,))
        c2.execute("INSERT INTO project_links(project_id, kind, ref, round, by) VALUES (%s,'card',%s,1,%s)", (pid, card, STAFF_ID))
        c2.execute("INSERT INTO card_shares(card_id, tenant_id, shared, by) VALUES (%s,'namwon',true,%s)", (card, STAFF_ID))
    d = httpx.get(B + f"/projects/{pid}/delete", headers=H(tok["staff"]), timeout=60).json()
    assert [b["kind"] for b in d["blocked"]] == ["shared"] and "공유를 거둔" in d["blocked"][0]["todo"], d["blocked"]
    with pg() as c2:                                   # 공유를 거두면(마지막 줄 꺼짐) 풀린다
        c2.execute("INSERT INTO card_shares(card_id, tenant_id, shared, by) VALUES (%s,'namwon',false,%s)", (card, STAFF_ID))
    assert httpx.get(B + f"/projects/{pid}/delete", headers=H(tok["staff"]), timeout=60).json()["blocked"] == []
    with pg() as c2:
        c2.execute("DELETE FROM card_shares WHERE card_id=%s", (card,))
        c2.execute("DELETE FROM project_links WHERE project_id=%s AND ref=%s", (pid, card))
        c2.execute("DELETE FROM cards WHERE id=%s", (card,))


def test_delete(proj, tok):
    pid = proj["id"]
    r = httpx.request("DELETE", B + f"/projects/{pid}", headers=H(tok["staff"]), json={"name": proj["name"]}, timeout=120)
    assert r.status_code == 200, r.text
    assert r.json()["stopped"]["value"] == 1
    for s in ("mine", "led", "archived", "all"):
        ids = [x["id"] for x in httpx.get(B + f"/projects?scope={s}", headers=H(tok["admin"]), timeout=60).json()["items"]]
        assert pid not in ids, s
    g = httpx.get(B + f"/projects/{pid}", headers=H(tok["staff"]), timeout=60)
    assert g.status_code == 404 and "삭제한 프로젝트" in g.text
    assert httpx.request("DELETE", B + f"/projects/{pid}", headers=H(tok["staff"]), json={"name": proj["name"]}, timeout=60).status_code == 404
    with pg() as c:
        assert c.execute("SELECT state, error FROM jobs WHERE id=%s", (JOB_R,)).fetchone() == ("cancelled", "프로젝트 삭제")
        assert c.execute("SELECT status FROM train_samples WHERE id=%s", (SID,)).fetchone()[0] == "removed"
        assert c.execute("SELECT status FROM models WHERE id=%s", (MID,)).fetchone()[0] == "retired"
        st, by, info = c.execute("SELECT state, deleted_by, deleted_info FROM projects WHERE id=%s", (pid,)).fetchone()
        assert st == "deleted" and by == STAFF_ID and info["prev_state"] == "active"
        a = c.execute("SELECT actor, before->>'name' FROM audit_log WHERE action='project.delete' AND subject=%s", (pid,)).fetchall()
        assert a == [(STAFF_ID, proj["name"])]
    trash = config.DATA_ROOT / "_trash" / "projects" / pid
    assert not SDIR.exists() and not MDIR.exists() and not (config.DATA_ROOT / "projects" / pid).exists()
    assert (trash / "training" / "samples" / TAG / "a.txt").is_file()
    assert (trash / "models" / "trained" / JOB_T / "weights" / "best.pt").is_file()
    assert any((trash / "projects" / pid / "files").iterdir())


def test_purge_after_keep_days(proj):
    from landxi_api import retention
    pid = proj["id"]
    trash = config.DATA_ROOT / "_trash" / "projects" / pid
    with psycopg.connect(config.PG_WORKER_DSN if getattr(config, "PG_WORKER_DSN", None) else config.PG_ADMIN_DSN) as c:
        c.execute("SELECT set_config('app.realm','lx',true), set_config('app.tenant_id','',true)")
        out = retention.purge_projects(c, 30, dry=False)            # 기한 전 — 그대로
        c.commit()
    assert trash.exists()
    with pg() as c:
        c.execute("UPDATE projects SET deleted_at = now() - interval '31 days' WHERE id=%s", (pid,))
    with psycopg.connect(config.PG_WORKER_DSN if getattr(config, "PG_WORKER_DSN", None) else config.PG_ADMIN_DSN) as c:
        c.execute("SELECT set_config('app.realm','lx',true), set_config('app.tenant_id','',true)")
        out = retention.purge_projects(c, 30, dry=False)
        c.commit()
    assert out["projects"] >= 1
    assert not trash.exists()
    with pg() as c:
        assert c.execute("SELECT 1 FROM projects WHERE id=%s", (pid,)).fetchone() is None
        assert c.execute("SELECT state FROM jobs WHERE id=%s", (JOB_R,)).fetchone()[0] == "cancelled"   # 작업 기록은 남음
        assert c.execute("SELECT count(*) FROM audit_log WHERE action='project.delete' AND subject=%s", (pid,)).fetchone()[0] == 1
