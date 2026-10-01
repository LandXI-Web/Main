"""r3-train(C5 LX 생산 원스톱) — 학습 표본 검사 · 표본 id 해석 · 모델 등록 결재 · 서비스(카드) 만들기 권한.

순수 함수(표본 검사·학습 목록·이름 기본값)는 게이트웨이 없이 돈다. API 검사는 게이트웨이(:8700)가 떠 있을 때만(아니면 skip).
테스트가 만든 표본·모델·카드 행은 끝에 지운다(운영 목록에 남지 않게)."""
import io
import json
import shutil
import sys
import zipfile
from pathlib import Path

import httpx
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from landxi_api import config  # noqa: E402
from landxi_api.training import inspect_tree, write_lists, render_preview, _names_from_yaml  # noqa: E402
from conftest import H  # noqa: E402

NAMES = ["건물", "비닐하우스"]


def _png(color=(120, 160, 90)) -> bytes:
    from PIL import Image
    b = io.BytesIO()
    Image.new("RGB", (64, 64), color).save(b, "PNG")
    return b.getvalue()


def _zip(n_train=4, n_val=2, yaml=True, extra_img=0) -> bytes:
    """작은 표본 zip — 그림 n 장 · 다각형 라벨(클래스 0 두 개 + 클래스 1 한 개 / 장)."""
    b = io.BytesIO()
    with zipfile.ZipFile(b, "w") as z:
        for split, n in (("train", n_train), ("val", n_val)):
            for i in range(n):
                z.writestr(f"images/{split}/c{split}{i}.png", _png())
                z.writestr(f"labels/{split}/c{split}{i}.txt",
                           "0 0.1 0.1 0.3 0.1 0.3 0.3\n0 0.5 0.5 0.7 0.5 0.7 0.7\n1 0.5 0.5 0.2 0.2\n")
        for i in range(extra_img):
            z.writestr(f"images/train/x{i}.png", _png())
        if yaml:
            z.writestr("dataset.yaml", "names:\n  0: 건물\n  1: 비닐하우스\ntrain: images/train\nval: images/val\n")
    return b.getvalue()


def _unzip(data: bytes, dst: Path) -> Path:
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        z.extractall(dst)
    return dst


# ── 표본 검사(순수) ───────────────────────────────────────────────
def test_inspect_counts_equal_files(tmp_path):
    root = _unzip(_zip(4, 2), tmp_path / "d")
    m = inspect_tree(root)
    assert m["names"] == NAMES
    assert len(m["items"]) == 6 and m["n_train"] == 4 and m["n_val"] == 2 and m["paired"] == 6
    # 클래스별 객체 수 = 라벨 파일의 실제 줄 수(장당 건물 2 · 비닐하우스 1)
    assert m["class_counts"] == {"건물": 12, "비닐하우스": 6}
    assert m["class_images"] == {"건물": 6, "비닐하우스": 6}
    assert m["label_kind"] == "polygon"


def test_inspect_splits_when_no_val(tmp_path):
    root = _unzip(_zip(10, 0), tmp_path / "d")
    m = inspect_tree(root)
    assert m["n_val"] == 2 and m["n_train"] == 8           # 5장마다 1장 검증


def test_inspect_unlabeled_and_bad_class(tmp_path):
    root = _unzip(_zip(2, 1, extra_img=1), tmp_path / "d")
    (root / "labels" / "train" / "ctrain0.txt").write_text("5 0.1 0.1 0.2 0.2 0.3 0.3\n", encoding="utf-8")
    m = inspect_tree(root)
    assert m["paired"] == 3 and len(m["items"]) == 4       # 라벨 없는 그림 = 배경
    assert any(p.get("classes") == [5] for p in m["problems"])


def test_names_yaml_forms():
    assert _names_from_yaml("names: [a, b]\n") == ["a", "b"]
    assert _names_from_yaml("names:\n  - a\n  - b\n") == ["a", "b"]
    assert _names_from_yaml("names:\n  1: b\n  0: a\n") == ["a", "b"]


def test_write_lists_excludes(tmp_path):
    root = _unzip(_zip(4, 2), tmp_path / "d")
    m = inspect_tree(root)
    y = write_lists(tmp_path, m, {0, 5})
    tr = (tmp_path / "_train.txt").read_text(encoding="utf-8").splitlines()
    va = (tmp_path / "_val.txt").read_text(encoding="utf-8").splitlines()
    assert len(tr) == 3 and len(va) == 1
    assert "names:" in y.read_text(encoding="utf-8")


def test_preview_renders(tmp_path):
    root = _unzip(_zip(1, 0), tmp_path / "d")
    it = inspect_tree(root)["items"][0]
    jpg = render_preview(Path(it["img"]), it["label"], NAMES, 128)
    assert jpg[:2] == b"\xff\xd8"


# ── 표본 id 해석 · 이름 기본값(어댑터) ─────────────────────────────
def test_adapter_resolves_sample_ids():
    from adapters import adapter_train_yolo as A
    assert A._one(["smp_abc"]) == "smp_abc" and A._one("x") == "x" and A._one(["a", "b"]) is None
    assert A.dataset_yaml("smp_0000000000") is None           # 없는 표본 = None(견적이 거절)
    assert A.dataset_yaml("../../etc/passwd.yaml") is None
    assert A.plan({"options": {"samples": ["smp_1"], "base_model": "m"}})[0]["epochs"] == 3
    assert A.plan({"options": {"samples": ["smp_1"]}})[0]["batch"] == 4
    assert A.model_name("비닐하우스", "남원시", "2026.09.30") == "비닐하우스 · 남원시 학습 2026.09.30"
    assert A.model_name("비닐하우스", None, "2026.09.30") == "비닐하우스 학습 2026.09.30"


# ── API(게이트웨이) ─────────────────────────────────────────────
def _pg():
    psycopg = pytest.importorskip("psycopg")
    try:
        return psycopg.connect(config.PG_ADMIN_DSN, connect_timeout=5, autocommit=True)
    except Exception:
        pytest.skip("PostGIS 미기동")


def _up(live, tok, data, name="t.zip", task="pytest 표본"):
    return httpx.post(live + "/training/samples", headers=H(tok), files={"file": (name, data, "application/zip")},
                      data={"task_name": task}, timeout=60)


def _drop_sample(sid):
    c = _pg()
    row = c.execute("SELECT dir FROM train_samples WHERE id=%s", (sid,)).fetchone()
    c.execute("DELETE FROM train_samples WHERE id=%s", (sid,))
    if row and row[0] and Path(row[0]).name == sid:
        shutil.rmtree(row[0], ignore_errors=True)


def test_sample_upload_preview_exclude(live, tok):
    r = _up(live, tok["staff"], _zip(4, 2))
    assert r.status_code == 201, r.text
    j = r.json()
    sid = j["id"]
    try:
        assert j["images"]["value"] == 6 and j["train"]["value"] == 4 and j["val"]["value"] == 2
        cls = {c["name"]: c["objects"]["value"] for c in j["classes"]}
        assert cls == {"건물": 12, "비닐하우스": 6}
        body = json.dumps(j, ensure_ascii=False)
        assert str(config.DATA_ROOT).replace("\\", "/") not in body.replace("\\\\", "/").replace("\\", "/")   # 폴더 경로 0
        assert "dir" not in j
        p = httpx.get(live + f"/training/samples/{sid}/preview/0", headers=H(tok["staff"]), timeout=30)
        assert p.status_code == 200 and p.headers["content-type"] == "image/jpeg"
        assert httpx.get(live + f"/training/samples/{sid}/preview/99", headers=H(tok["staff"]), timeout=30).status_code == 404
        e = httpx.post(live + f"/training/samples/{sid}/exclude", headers=H(tok["staff"]), json={"images": [0]}, timeout=30).json()
        assert e["images"]["value"] == 5 and e["excluded"] == [{"index": 0}]
        assert {c["name"]: c["objects"]["value"] for c in e["classes"]} == {"건물": 10, "비닐하우스": 5}
        # 표본 id → 학습 목록(어댑터가 DB 에서 찾는다)
        from adapters import adapter_train_yolo as A
        y = A.dataset_yaml([sid])
        assert y and y.exists()
        assert len(Path(y).parent.joinpath("_train.txt").read_text(encoding="utf-8").splitlines()) == 3
        # 견적: 올린 표본으로 학습 견적이 통과(대기열·전력 규칙은 서버 판정)
        q = httpx.post(live + "/jobs/quote", headers=H(tok["staff"]),
                       json={"kind": "train", "base_model": "aerial25/best", "samples": [sid], "options": {"epochs": 3, "batch": 4}}, timeout=60)
        assert q.status_code == 200, q.text
    finally:
        _drop_sample(sid)


def test_sample_upload_rejects(live, tok):
    assert _up(live, tok["staff"], _zip(2, 1, yaml=False)).status_code == 400          # 클래스 이름(dataset.yaml) 없음 — 이름을 지어 붙이지 않는다
    big = _zip(0, 0, extra_img=201)
    assert _up(live, tok["staff"], big).status_code == 400                               # 200장 초과 · 라벨 없음
    assert _up(live, tok["staff"], b"not a zip").status_code == 400
    assert _up(live, tok["sales"], _zip(1, 1)).status_code == 403                        # 영업 = 읽기 전용
    assert _up(live, tok["namwon"], _zip(1, 1)).status_code == 403                       # 기관 계정 = LX 전용 경로


def test_card_create_permissions(live, tok):
    body = {"name": "pytest 서비스", "model_id": "aerial25/best", "rules": ["R3"], "ledger_kind": "farm_ledger"}
    assert httpx.post(live + "/registry/cards", headers=H(tok["sales"]), json=body, timeout=30).status_code == 403
    assert httpx.post(live + "/registry/cards", headers=H(tok["namwon"]), json=body, timeout=30).status_code == 403
    assert httpx.post(live + "/registry/cards", headers=H(tok["staff"]), json={**body, "rules": ["R99"]}, timeout=30).status_code == 400
    assert httpx.post(live + "/registry/cards", headers=H(tok["staff"]), json={**body, "ledger_kind": None}, timeout=30).status_code == 400
    r = httpx.post(live + "/registry/cards", headers=H(tok["staff"]), json=body, timeout=30)
    assert r.status_code == 201, r.text
    cid = r.json()["id"]
    try:
        cards = httpx.get(live + "/registry/cards", headers=H(tok["staff"]), timeout=30).json()["items"]
        mine = next(c for c in cards if c["id"] == cid)
        assert mine["name"] == "pytest 서비스" and mine["models"] == ["aerial25/best"] and mine["ledger_schema"]["kind"] == "farm_ledger"
        # 만든 서비스는 필지 대조 모듈을 켠 채로 — 다른 지역에 적용하면 AI 분석 뒤 실태조사까지 이어진다
        mods = _pg().execute("SELECT modules FROM card_versions WHERE card_id=%s", (cid,)).fetchone()[0]
        assert mods["ext"].get("mod-parcel") is True and mods["rules"] == ["R3"]
    finally:
        c = _pg()
        c.execute("DELETE FROM approvals WHERE subject_type='card' AND subject_id LIKE %s", (cid + "@%",))  # 서비스 공개 결재(impl-1)
        c.execute("DELETE FROM card_versions WHERE card_id=%s", (cid,))
        c.execute("DELETE FROM cards WHERE id=%s", (cid,))


def test_model_register_needs_admin(live, tok):
    c = _pg()
    mid = "trained/pytest-r3"
    c.execute("DELETE FROM approvals WHERE subject_type='model' AND subject_id=%s", (mid,))
    c.execute("INSERT INTO models(id, family, task, status, name, created_at) VALUES (%s,'yolo11-seg','seg','candidate',%s,now()) "
              "ON CONFLICT (id) DO UPDATE SET status='candidate'", (mid, json.dumps({"ko": "pytest 모델"})))
    try:
        # 등록 전 모델로는 서비스를 못 만든다
        r = httpx.post(live + "/registry/cards", headers=H(tok["staff"]),
                       json={"name": "x", "model_id": mid, "rules": [], "ledger_kind": "farm_ledger"}, timeout=30)
        assert r.status_code == 409
        assert httpx.post(live + "/registry/model-register", headers=H(tok["sales"]), json={"model_id": mid}, timeout=30).status_code == 403
        r = httpx.post(live + "/registry/model-register", headers=H(tok["staff"]), json={"model_id": mid}, timeout=30)
        assert r.status_code == 202 and r.json()["status"] == "pending"
        assert httpx.post(live + "/registry/model-decide", headers=H(tok["staff"]), json={"model_id": mid, "decision": "approve"},
                          timeout=30).status_code == 403                      # 직원은 스스로 승인 못 함
        ap = httpx.get(live + "/approvals?state=pending", headers=H(tok["admin"]), timeout=30).json()["items"]
        assert any(a["subject"]["id"] == mid and a["kind"] == "model" for a in ap)   # 관리자 결재함에 한 줄
        r = httpx.post(live + "/registry/model-decide", headers=H(tok["admin"]), json={"model_id": mid, "decision": "approve"}, timeout=30)
        assert r.status_code == 200 and r.json()["status"] == "registered"
        m = [x for x in httpx.get(live + "/registry/models?with=train", headers=H(tok["staff"]), timeout=30).json()["items"] if x["id"] == mid][0]
        assert m["status"] == "registered" and m["name"] == "pytest 모델" and m["status_label"] == "등록"
    finally:
        c.execute("DELETE FROM approvals WHERE subject_type='model' AND subject_id=%s", (mid,))
        c.execute("DELETE FROM models WHERE id=%s", (mid,))


def test_model_register_via_admin_inbox(live, tok):
    """관리자 대시보드 결재함(ops-core fromServer 'model' → '모델 등록') 경로 — 결재 한 줄에 성능(학습 끝 검증값)과 이름이 실리고,
    일반 결재 결정(/approvals/{id}/decide)만으로 모델이 '등록'이 된다(학습 화면 서랍을 거치지 않음)."""
    c = _pg()
    mid = "trained/pytest-r3-inbox"
    met = {"metrics/mAP50(M)": {"value": 0.61234, "unit": "ratio", "basis": "measured", "source": "학습 끝 검증", "as_of": "2026-09-30"}}
    c.execute("DELETE FROM approvals WHERE subject_type='model' AND subject_id=%s", (mid,))
    c.execute("INSERT INTO models(id, family, task, status, name, metrics, created_at) VALUES (%s,'yolo11-seg','seg','candidate',%s,%s,now()) "
              "ON CONFLICT (id) DO UPDATE SET status='candidate', metrics=EXCLUDED.metrics", (mid, json.dumps({"ko": "pytest 결재함 모델"}), json.dumps(met)))
    try:
        r = httpx.post(live + "/registry/model-register", headers=H(tok["staff"]), json={"model_id": mid}, timeout=30)
        assert r.status_code == 202
        ap = [a for a in httpx.get(live + "/approvals?state=pending", headers=H(tok["admin"]), timeout=30).json()["items"]
              if a["subject"]["id"] == mid]
        assert len(ap) == 1 and ap[0]["kind"] == "model"
        pl = ap[0]["payload"]
        assert pl["name"] == "pytest 결재함 모델"
        mv = pl["metric"]["value"] if isinstance(pl["metric"], dict) else pl["metric"]
        assert abs(mv - 0.61234) < 1e-9                                    # 결재에 보이는 성능 = DB 학습 끝 검증값
        r = httpx.post(live + f"/approvals/{ap[0]['id']}/decide", headers=H(tok["admin"]), json={"decision": "approve", "reason": "승인"}, timeout=30)
        assert r.status_code == 200
        m = [x for x in httpx.get(live + "/registry/models", headers=H(tok["staff"]), timeout=30).json()["items"] if x["id"] == mid][0]
        assert m["status"] == "registered"
    finally:
        c.execute("DELETE FROM approvals WHERE subject_type='model' AND subject_id=%s", (mid,))
        c.execute("DELETE FROM models WHERE id=%s", (mid,))


def test_screen_name_rules_one_source():
    """서비스 이름·결재 대상 표기 규칙이 직원·관리자 화면에서 같다(이름 한 출처) · 결재함이 '모델 등록'을 그린다 · 로그인 ?next 는 경로만 검사."""
    v3 = Path(__file__).resolve().parents[2] / "landxi" / "v3"
    ops = (v3 / "ops-core/js/data.js").read_text(encoding="utf-8")
    dep = (v3 / "lx-deploy/data.js").read_text(encoding="utf-8")
    con = (v3 / "lx-console/data.js").read_text(encoding="utf-8")
    rule = "(행정서비스|서비스)$/"
    assert rule in ops and rule in dep and rule in con
    assert "model: '모델 등록'" in ops and "request: '분석 의뢰'" in ops
    # impl-1: 서비스 공개(card) · impl-2: 기관 영상 분석 의뢰(request — 6차 GF-2 · LX 관리자 승인/반려)도 결재함에
    assert "['rule', 'quota', 'model', 'card', 'request'].includes(r.kind)" in ops
    assert "whoWhere(d)" in ops                                           # '남원시 남원시' 두 번 금지
    login = (v3 / "login/auth.js").read_text(encoding="utf-8")
    assert "const path = v.split(/[?#]/)[0];" in login


def test_recovery_keeps_train_with_live_worker():
    """게이트웨이 재기동 sweep 이 살아 있는 워커의 대기열에 있는 학습을 '재부팅'으로 실패시키지 않는다(워커가 죽었을 때만 실패)."""
    from workers import bus, recovery
    alive = [k.split(":")[1] for k in bus.r().scan_iter(match="worker:*:hb", count=2000) if bus.worker_alive(k.split(":")[1])]
    if not alive:
        pytest.skip("살아 있는 워커 없음")
    jid = "job_pytest_r3_train_recovery"
    key = f"job:{jid}"
    try:
        bus.r().hset(key, mapping={"kind": "train", "state": "running", "pool": bus.r().hget(f"worker:{alive[0]}:hb", "pool") or "a6000",
                                   "workers": json.dumps([alive[0]]), "shards_total": 1})
        st = {"resumed": 0, "requeued": 0, "failed": 0, "jobs": []}
        recovery.recover_one(jid, None, st, "pytest")
        assert st["failed"] == 0 and bus.r().hget(key, "state") == "running"
        bus.r().hset(key, "workers", json.dumps(["no-such-worker-r3"]))
        bus.r().hset(key, "pool", "no-such-pool-r3")
        recovery.recover_one(jid, None, st, "pytest")            # 워커가 정말 없으면 정직하게 실패
        assert bus.r().hget(key, "state") == "failed"
    finally:
        bus.r().delete(key)
        c = _pg()
        c.execute("DELETE FROM audit_log WHERE subject=%s", (jid,))


# ══ 3차(실증 3차 must_fix) ═══════════════════════════════════════════════════
def _mk_card(c, cid: str, model_id: str, rules=None):
    """시험 카드 + 첫 버전(서비스 만들기와 같은 모양)."""
    c.execute("DELETE FROM card_versions WHERE card_id=%s", (cid,))
    c.execute("DELETE FROM cards WHERE id=%s", (cid,))
    c.execute("INSERT INTO cards(id, name, scope, domain, kind, status_history, portable) VALUES (%s,%s,'local','pytest','{}','검토',true)",
              (cid, json.dumps({"ko": "pytest 서비스"})))
    c.execute("INSERT INTO card_versions(id, card_id, version, model_ids, modules, changelog, approved_at) VALUES (%s,%s,'1.0',%s,%s,'pytest',now())",
              (cid + "@1.0", cid, [model_id], json.dumps({"core": [], "ext": {"mod-parcel": bool(rules)}, **({"rules": rules} if rules is not None else {})})))


def _rm_card(c, cid: str):
    for (did,) in c.execute("SELECT id FROM deploys WHERE card_id=%s", (cid,)).fetchall():
        c.execute("DELETE FROM approvals WHERE subject_type='deploy' AND subject_id=%s", (did,))
        c.execute("DELETE FROM deploys WHERE id=%s", (did,))
    c.execute("DELETE FROM approvals WHERE subject_type='card' AND subject_id LIKE %s", (cid + "@%",))     # 서비스 공개 결재(impl-1)
    c.execute("DELETE FROM card_versions WHERE card_id=%s", (cid,))
    c.execute("DELETE FROM cards WHERE id=%s", (cid,))


def test_chunked_upload_resume_and_limits(live, tok):
    """나눠 올리기 — 조각마다 한 요청(바깥 주소 100초 한도) · 자리가 어긋나면 409 + 받은 자리 · 같은 파일(key)이면 이어 올리기 ·
    끝내면 한 번에 올리기와 같은 표본(값 = 올린 파일의 실제 개수) · 크기 한도는 시작 때 거절(다 올린 뒤가 아니라)."""
    data = _zip(4, 2)
    key = f"t.zip|{len(data)}|pytest"
    st = httpx.post(live + "/training/uploads", headers=H(tok["staff"]),
                    json={"filename": "t.zip", "size": len(data), "task_name": "pytest 표본", "key": key}, timeout=30)
    assert st.status_code == 201, st.text
    u = st.json()
    uid = u["id"]
    assert u["bytes"] == 0 and u["size"] == len(data) and u["limit"]["size"] >= 7 << 20
    half = len(data) // 2
    hput = {**H(tok["staff"]), "content-type": "application/octet-stream"}
    r = httpx.put(live + f"/training/uploads/{uid}?offset=0", headers=hput, content=data[:half], timeout=30)
    assert r.status_code == 200 and r.json()["bytes"] == half
    r = httpx.put(live + f"/training/uploads/{uid}?offset=0", headers=hput, content=data[:half], timeout=30)    # 같은 조각 두 번 = 두 번 붙지 않음
    assert r.status_code == 409 and r.json()["error"]["detail"]["bytes"] == half
    again = httpx.post(live + "/training/uploads", headers=H(tok["staff"]),
                       json={"filename": "t.zip", "size": len(data), "task_name": "pytest 표본", "key": key}, timeout=30).json()
    assert again["id"] == uid and again["bytes"] == half                                   # 끊긴 뒤 이어 올리기
    assert httpx.post(live + f"/training/uploads/{uid}/finish", headers=H(tok["staff"]), timeout=30).status_code == 409   # 덜 받음
    assert httpx.get(live + f"/training/uploads/{uid}", headers=H(tok["admin"]), timeout=30).status_code == 403            # 다른 사람
    r = httpx.put(live + f"/training/uploads/{uid}?offset={half}", headers=hput, content=data[half:], timeout=30)
    assert r.status_code == 200 and r.json()["bytes"] == len(data)
    f = httpx.post(live + f"/training/uploads/{uid}/finish", headers=H(tok["staff"]), timeout=60)
    assert f.status_code == 201, f.text
    j = f.json()
    try:
        assert j["images"]["value"] == 6 and {c["name"]: c["objects"]["value"] for c in j["classes"]} == {"건물": 12, "비닐하우스": 6}
        assert str(config.DATA_ROOT).replace("\\", "/") not in json.dumps(j, ensure_ascii=False).replace("\\\\", "/")
    finally:
        _drop_sample(j["id"])
    big = httpx.post(live + "/training/uploads", headers=H(tok["staff"]), json={"filename": "b.zip", "size": 10 << 30, "task_name": "x"}, timeout=30)
    assert big.status_code == 413 and "MB" in big.json()["error"]["message"]
    assert httpx.post(live + "/training/uploads", headers=H(tok["staff"]), json={"filename": "b.txt", "size": 10, "task_name": "x"}, timeout=30).status_code == 400
    assert httpx.post(live + "/training/uploads", headers=H(tok["sales"]), json={"filename": "b.zip", "size": 10, "task_name": "x"}, timeout=30).status_code == 403
    assert httpx.post(live + "/training/uploads", headers=H(tok["namwon"]), json={"filename": "b.zip", "size": 10, "task_name": "x"}, timeout=30).status_code == 403


def test_model_imagery_match_rules():
    """해상도 판정·대신할 모델 판정(순수) — 대상을 모두 찾는 모델만 대신 쓴다(비닐하우스 2cm → 25cm 항공 모델 가능 · 곤포사일리지 불가)."""
    from landxi_api import deploys as D
    assert D.gsd_word(0.02) == "2cm 드론" and D.gsd_word(0.25) == "25cm 항공" and D.gsd_word(0.015) == "1.5cm 드론" and D.gsd_word(10) == "10m 위성"
    assert D.gsd_fits(0.25, 0.25) and D.gsd_fits(0.05, 0.02) and not D.gsd_fits(0.25, 0.02)
    aerial = ["건물", "주차장", "경작지", "비닐하우스"]
    assert D.covers(aerial, ["비닐하우스_단동", "비닐하우스_다동"])
    assert not D.covers(aerial, ["곤포사일리지"]) and not D.covers(aerial, [])
    t = D.mismatch_text({"gsd_m": 0.02}, {"gsd_m": 0.25})
    assert "2cm 드론" in t and "25cm 항공" in t
    fv = D.flow_view({"state": "need_imagery", "reason": "model_mismatch", "note": "n", "imagery": {"imagery_id": "x", "gsd_m": 0.25},
                      "model_id": "m", "model": {"id": "m", "name": "곤포", "substitute": False}})
    assert fv["label"] == "맞는 영상 등록 필요" and fv["has_imagery"] is False and fv["model"]["name"] == "곤포" and fv["note"] == "n"


def test_deploy_fit_blocks_mismatch(live, tok):
    """적용 전 점검 — 2cm 드론 모델 서비스는 25cm 항공 영상만 있는 시군구에 적용할 수 없다(말없이 기본 모델로 바꾸지 않음).
    25cm 모델 서비스는 같은 시군구에 그 모델로. 결재 요청(POST /deploys)도 같은 판정으로 409."""
    c = _pg()
    sgg = c.execute("SELECT sgg_cd FROM imagery i WHERE gsd_m = 0.25 AND path_internal IS NOT NULL AND sgg_cd IS NOT NULL "
                    "AND NOT EXISTS (SELECT 1 FROM imagery j WHERE j.gsd_m < 0.1 AND j.footprint IS NOT NULL AND i.footprint IS NOT NULL "
                    "AND ST_Intersects(j.footprint, i.footprint)) ORDER BY sgg_cd LIMIT 1").fetchone()
    if not sgg or not c.execute("SELECT 1 FROM models WHERE id='namwon/Silage/train'").fetchone():
        pytest.skip("25cm 영상 시군구 · 드론 모델 없음")
    sgg = sgg[0]
    _mk_card(c, "card-pytest-drone", "namwon/Silage/train")
    _mk_card(c, "card-pytest-aerial", "aerial25/best", ["R3"])
    try:
        r = httpx.get(live + f"/deploy-fit?region={sgg}&card_id=card-pytest-drone", headers=H(tok["staff"]), timeout=60)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["fits"] is False and "해상도" in j["note"] and j["model"] is None and j["service_model"]["gsd_word"] == "2cm 드론"
        r = httpx.post(live + "/deploys", headers=H(tok["staff"]), json={"card_id": "card-pytest-drone", "region": sgg, "test": True}, timeout=60)
        assert r.status_code == 409 and r.json()["error"]["code"] == "model_input_mismatch"
        assert not c.execute("SELECT 1 FROM deploys WHERE card_id='card-pytest-drone'").fetchone()      # 결재 요청을 만들지 않았다
        j = httpx.get(live + f"/deploy-fit?region={sgg}&card_id=card-pytest-aerial", headers=H(tok["staff"]), timeout=60).json()
        assert j["fits"] is True and j["model"]["id"] == "aerial25/best" and j["model"]["substitute"] is False
        assert httpx.get(live + f"/deploy-fit?region={sgg}&card_id=card-pytest-aerial", headers=H(tok["namwon"]), timeout=30).status_code == 403
    finally:
        _rm_card(c, "card-pytest-drone")
        _rm_card(c, "card-pytest-aerial")


def test_card_rules_fit_model(live, tok):
    """서비스 만들기 — 모델이 찾지 않는 대상의 규칙은 고를 수 없다(곤포사일리지 + 휴경·전용 = 400). 규칙 없는 서비스 = 필지 대조 꺼짐(AI 분석까지)."""
    c = _pg()
    if not c.execute("SELECT 1 FROM models WHERE id='namwon/Silage/train' AND status='registered'").fetchone():
        pytest.skip("드론 모델 없음")
    r = httpx.get(live + "/registry/model-rules?model_id=namwon/Silage/train", headers=H(tok["staff"]), timeout=30)
    assert r.status_code == 200 and r.json()["items"] and not any(x["fits"] for x in r.json()["items"])
    fits = {x["id"]: x["fits"] for x in httpx.get(live + "/registry/model-rules?model_id=aerial25/best", headers=H(tok["staff"]), timeout=30).json()["items"]}
    assert fits.get("R2") and fits.get("R3")
    body = {"name": "pytest 곤포", "model_id": "namwon/Silage/train", "rules": ["R2"], "ledger_kind": "farm_ledger"}
    r = httpx.post(live + "/registry/cards", headers=H(tok["staff"]), json=body, timeout=30)
    assert r.status_code == 400 and "휴경" in r.json()["error"]["message"]
    r = httpx.post(live + "/registry/cards", headers=H(tok["staff"]), json={**body, "rules": []}, timeout=30)
    assert r.status_code == 201, r.text
    cid = r.json()["id"]
    try:
        mods = c.execute("SELECT modules FROM card_versions WHERE card_id=%s", (cid,)).fetchone()[0]
        assert mods["ext"].get("mod-parcel") is False and mods["rules"] == []
    finally:
        _rm_card(c, cid)


def test_survey_uses_card_rules_only():
    """실태조사는 서비스(카드 버전)에서 고른 규칙만 계산한다 — 배포 흐름 → /survey/build(rules) → 작업 칸 → nation.build → 규칙 SQL."""
    import asyncio
    import inspect
    from survey import rules as R
    from survey import nation as N
    from adapters.survey import adapter_rules as AR
    sql = R.eval_sql_ai(R.default_thresholds(), ["R2"])
    assert "'R2'" in sql and "'R1'" not in sql and "'R4'" not in sql
    c0 = _pg()
    for rs in (["R4"], ["R2", "R3"], None):              # R1 을 뺀 묶음도 열 이름(rule…)이 선다(3차 실측: 'column "rule" does not exist')
        c0.execute("EXPLAIN " + R.eval_sql_ai(R.default_thresholds(), rs), {"sgg": "44133", "job": "job_pytest"})
    assert "rules" in inspect.signature(N.build).parameters and "rules" in inspect.signature(N.evaluate).parameters
    sh = AR.plan({"options": {"build": True, "sgg_cd": "44180", "rules": ["R2"]}})
    assert sh[0]["params"]["rules"] == ["R2"]
    assert AR.plan({"options": {"build": True, "sgg_cd": "44180"}})[0]["params"]["rules"] is None      # 옛 카드 = 전체 규칙
    from landxi_api import deploys as D
    c = _pg()
    _mk_card(c, "card-pytest-rules", "aerial25/best", ["R3"])
    async def rules_then_close():
        from landxi_api import deps
        try:
            return await D.card_rules({"card_version_id": "card-pytest-rules@1.0"})
        finally:                                         # 이 이벤트 루프에서 만든 연결 풀을 닫는다(다음 시험의 다른 루프가 옛 풀을 쓰지 않게)
            if deps._pool is not None:
                await deps._pool.close()
                deps._pool = None
    try:
        assert asyncio.run(rules_then_close()) == ["R3"]
    finally:
        _rm_card(c, "card-pytest-rules")
    src = (Path(__file__).resolve().parents[1] / "landxi_api" / "survey.py").read_text(encoding="utf-8")
    assert 'body2["options"]["rules"]' in src


def test_model_list_base_is_job_record(live, tok):
    """결과 확인의 '기반 모델' = 학습 작업이 고른 기반 모델(작업 기록) — 화면 선택 상자 값이 아님."""
    c = _pg()
    row = c.execute("SELECT m.id, j.model_id FROM models m JOIN jobs j ON j.id = m.train_job WHERE j.kind='train' LIMIT 1").fetchone()
    if not row:
        pytest.skip("학습으로 만든 모델 없음")
    items = httpx.get(live + "/registry/models?with=train", headers=H(tok["staff"]), timeout=30).json()["items"]
    m = next(x for x in items if x["id"] == row[0])
    assert m["base_model"] == row[1]
    flow = (Path(__file__).resolve().parents[2] / "landxi" / "v3" / "lx-train" / "flow.js").read_text(encoding="utf-8")
    assert "m.id === model.base_model" in flow and "baseSel.value) || null" not in flow
    assert "retryBtn(() => showModel(mid))" in flow                          # 목록 요청 실패 = 안내 + 다시 시도(빈 칸으로 멈추지 않음)


def test_screen_fixes_static():
    """배포 지도 표식 = 지역마다 자기 자리(마커 위치를 CSS 가 덮지 않음) · 적용 화면에 좌표계 코드·색 코드 글자 0 ·
    관리자 계정이 LX 직원 입구(app)로 들어오면 LX 직원 대시보드(입구별 첫 화면 표 — 역할 탭 · '문' 대신 입구 · 원칙 27) · 관리자 모델 교체 = 실제로 분석에 쓴 모델."""
    v3 = Path(__file__).resolve().parents[2] / "landxi" / "v3"
    css = (v3 / "lx-deploy/lx-deploy.css").read_text(encoding="utf-8")
    pin = next(ln for ln in css.splitlines() if ln.startswith(".dp-pin{"))
    assert "position" not in pin and "transform" not in pin
    dep = (v3 / "lx-deploy/data.js").read_text(encoding="utf-8")
    assert "r.center = [(r.tight[0] + r.tight[2]) / 2" in dep
    app = (v3 / "lx-deploy/app.js").read_text(encoding="utf-8")
    assert "placeholder: '#RRGGBB'" not in app and "CRS_WORD[o] || o" in app and "/deploy-fit?region=" in app
    login = (v3 / "login/auth.js").read_text(encoding="utf-8")
    gate = (v3 / "kit/auth-gate.js").read_text(encoding="utf-8")
    assert "landingFor({ key }, SITE)" in login and "await enter(s);" in login
    assert "LANDING_AT = { app: { 'lx/admin': 'lx-console' } }" in gate
    ops = (v3 / "ops-infra/js/data.js").read_text(encoding="utf-8")
    assert "d.flow?.model?.id" in ops


def test_model_swap_must_fit_imagery(live, tok):
    """관리자 모델 교체 — 그 지역 영상 해상도와 맞지 않는 모델(2cm 드론 → 25cm 항공 지역)은 교체를 막는다(흐름이 말없이 무시하지 않게)."""
    c = _pg()
    row = c.execute("SELECT id, model_override FROM deploys WHERE (flow->'imagery'->>'gsd_m')::float = 0.25 AND NOT coalesce(test,false) LIMIT 1").fetchone()
    if not row or not c.execute("SELECT 1 FROM models WHERE id='namwon/Silage/train'").fetchone():
        pytest.skip("25cm 영상 흐름 배포본 · 드론 모델 없음")
    r = httpx.post(live + f"/deploys/{row[0]}/model", headers=H(tok["admin"]), json={"model_id": "namwon/Silage/train"}, timeout=30)
    assert r.status_code == 409 and r.json()["error"]["code"] == "model_input_mismatch" and "해상도" in r.json()["error"]["message"]
    assert c.execute("SELECT model_override FROM deploys WHERE id=%s", (row[0],)).fetchone()[0] == row[1]      # 바뀌지 않음
