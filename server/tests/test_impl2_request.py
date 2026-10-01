"""impl-2 기관 영상 분석 의뢰 · LX 영상 공유 · 저장 공간 보호 — 실서버(:8700).

확인 대장: 6차 GF-2(우리 영상으로 분석 의뢰 · 무상 · LX 관리자 승인/반려) · 2차 D1-ⓑ(기관 영상 허용 + LX 공유 영상 불러오기) ·
5차 역할-4 ⓑ(관리자가 기관마다 고름) · 1차 FR-1(파일을 실제로 받기 · 여러 파일 · 멈춤 · 이어 올리기 · 취소) · 원칙 39 · 49 · 66.
사용자 7차 답(10-01): 기관에는 막는 한도를 두지 않는다 — 올린 양은 사용 현황으로만, 서버 전체 저장 공간이 모자랄 때만 막는다.
GPU — 승인 뒤 실제 분석은 e2e(작은 영상 한 건)에서. 여기서는 승인 → 대기열에 들어간 것까지 보고 곧바로 취소한다(256px 한 칸).
시험 영상은 무작위 화소로 만든 작은 GeoTIFF(남원 덕과면 · 25cm) — 끝에서 의뢰 · 결재 · 올린 파일 · 폴더를 모두 지운다. 공유 · 한도는 되돌린다.
"""
import hashlib
import os
import shutil
import time

import httpx
import psycopg
import pytest

from conftest import B, H, _login
from landxi_api import config

NAMWON_LL = (127.36654, 35.52301)          # 덕과면(관할 안)
SEOUL_LL = (126.9780, 37.5665)             # 관할 밖
SERVICE = "dp-52190-5e85a9-26"             # 남원시 비닐하우스 서비스(25cm 모델)


def pg():
    return psycopg.connect(config.PG_ADMIN_DSN, autocommit=True)


def make_tif(path, ll, seed, px=256, gsd=0.25):
    """무작위 화소 GeoTIFF(EPSG:5186) — 같은 파일이 두 번 나오지 않게 seed 로 내용이 다르다."""
    import numpy as np
    import rasterio
    from rasterio.transform import from_origin
    from rasterio.warp import transform
    xs, ys = transform("EPSG:4326", "EPSG:5186", [ll[0]], [ll[1]])
    arr = np.random.default_rng(seed).integers(0, 255, (3, px, px), dtype="uint8")
    with rasterio.open(path, "w", driver="GTiff", width=px, height=px, count=3, dtype="uint8", crs="EPSG:5186",
                       transform=from_origin(xs[0] - px * gsd / 2, ys[0] + px * gsd / 2, gsd, gsd)) as d:
        d.write(arr)
    return path


def quick_fp(path):
    size = os.path.getsize(path)
    h = hashlib.sha256(f"{size}:".encode())
    with open(path, "rb") as f:
        h.update(f.read(1 << 20))
        if size > (1 << 20):
            f.seek(size - (1 << 20))
            h.update(f.read(1 << 20))
    return h.hexdigest()


def start(t, path, draft=None, name=None):
    return httpx.post(B + "/requests/uploads", headers=H(t), json={"draft_id": draft, "filename": name or os.path.basename(path),
                                                                   "size": os.path.getsize(path), "quick_fp": quick_fp(path)}, timeout=30)


def upload(t, path, draft=None, chunk=64 * 1024):
    r = start(t, path, draft)
    if r.status_code >= 300:
        return r
    st = r.json()
    data = open(path, "rb").read()
    off = st["bytes"]
    while off < len(data):
        rr = httpx.put(B + f"/requests/uploads/{st['id']}?offset={off}", headers={**H(t), "content-type": "application/octet-stream"},
                       content=data[off:off + chunk], timeout=60)
        assert rr.status_code == 200, rr.text
        off = rr.json()["bytes"]
    return httpx.post(B + f"/requests/uploads/{st['id']}/finish", headers=H(t), timeout=120)


@pytest.fixture(scope="module")
def nw(live):
    return _login({"realm": "tenant", "tenant_id": "namwon", "login": "lxadmin@lx.or.kr", "password": config.DEV_PASSWORD, "site": "gov"})


@pytest.fixture(scope="module")
def admin2(live):
    return _login({"realm": "lx", "login": "lxadmin@lx.or.kr", "password": config.DEV_PASSWORD})


@pytest.fixture(scope="module")
def made(live):
    """이 모듈에서 만든 의뢰 · 묶음 — 끝에서 지운다(파일 · 폴더 · 결재 · 작업)."""
    box = {"rq": [], "dr": []}
    yield box
    c = pg()
    for rid in box["rq"]:
        row = c.execute("SELECT approval_id, job_id, draft_id, tenant_id, imagery_id, source FROM analysis_requests WHERE id=%s", (rid,)).fetchone()
        if row:
            aid, jid, did, tid, iid, src = row
            if did:
                box["dr"].append(did)
            if jid:
                c.execute("DELETE FROM detections WHERE job_id=%s", (jid,))
                c.execute("DELETE FROM usage_events WHERE job_id=%s", (jid,))
                c.execute("DELETE FROM jobs WHERE id=%s", (jid,))
            c.execute("DELETE FROM approvals WHERE id=%s OR (subject_type='request' AND subject_id=%s)", (aid, rid))
            c.execute("DELETE FROM analysis_requests WHERE id=%s", (rid,))
            if src == "upload" and iid:
                c.execute("DELETE FROM imagery WHERE id=%s AND layer->>'role'='request'", (iid,))
            if jid:
                shutil.rmtree(config.DATA_ROOT / "results" / tid / str(jid), ignore_errors=True)
                for ext in (".geojson", ".pmtiles"):
                    (config.DATA_ROOT / "results" / tid / (jid + ext)).unlink(missing_ok=True)
    for did in set(box["dr"]):
        for (rel,) in c.execute("SELECT rel_path FROM request_uploads WHERE draft_id=%s", (did,)).fetchall():
            shutil.rmtree((config.DATA_ROOT / rel).parent, ignore_errors=True)
        # 영상 표준(구현 3차) — 올린 파일마다 남는 변환 기록(표준본은 같은 묶음 폴더 안이라 위에서 함께 지워짐)
        c.execute("DELETE FROM imagery_std WHERE source_kind='upload' AND source_id IN (SELECT id FROM request_uploads WHERE draft_id=%s)", (did,))
        c.execute("DELETE FROM request_uploads WHERE draft_id=%s", (did,))
    c.close()


# ── 조각 올리기 · 이어 올리기 · 취소 ──────────────────────────────────────────────
def test_chunk_upload_resume_and_cancel(nw, made, tmp_path):
    """조각은 받은 자리에만 붙는다(자리가 어긋나면 409 + 받은 바이트) · 같은 파일로 다시 시작하면 받은 자리부터 이어 간다 · 취소하면 조각이 지워진다."""
    f = make_tif(tmp_path / "resume_2025.tif", NAMWON_LL, seed=11)
    data = f.read_bytes()
    s = start(nw, f)
    assert s.status_code == 201, s.text
    st = s.json()
    made["dr"].append(st["draft_id"])
    assert st["bytes"] == 0 and st["size"] == len(data)
    r1 = httpx.put(B + f"/requests/uploads/{st['id']}?offset=0", headers={**H(nw), "content-type": "application/octet-stream"}, content=data[:50000], timeout=30)
    assert r1.status_code == 200 and r1.json()["bytes"] == 50000
    bad = httpx.put(B + f"/requests/uploads/{st['id']}?offset=0", headers={**H(nw), "content-type": "application/octet-stream"}, content=data[:1000], timeout=30)
    assert bad.status_code == 409 and bad.json()["error"]["detail"]["bytes"] == 50000          # 두 번 붙지 않는다
    again = start(nw, f, st["draft_id"])                                                        # 멈췄다가 다시(같은 파일) → 이어 올리기
    assert again.status_code == 201 and again.json()["id"] == st["id"] and again.json()["bytes"] == 50000
    r2 = httpx.put(B + f"/requests/uploads/{st['id']}?offset=50000", headers={**H(nw), "content-type": "application/octet-stream"}, content=data[50000:], timeout=30)
    assert r2.status_code == 200 and r2.json()["bytes"] == len(data)
    fin = httpx.post(B + f"/requests/uploads/{st['id']}/finish", headers=H(nw), timeout=60)
    assert fin.status_code == 200 and fin.json()["state"] == "done", fin.text
    c = pg()
    sha = c.execute("SELECT sha256 FROM request_uploads WHERE id=%s", (st["id"],)).fetchone()[0]
    assert sha == hashlib.sha256(data).hexdigest()                                            # 이어 받은 파일 = 원본 그대로
    # 취소
    g = make_tif(tmp_path / "cancel.tif", NAMWON_LL, seed=12)
    s2 = start(nw, g, st["draft_id"]).json()
    httpx.put(B + f"/requests/uploads/{s2['id']}?offset=0", headers={**H(nw), "content-type": "application/octet-stream"}, content=g.read_bytes()[:3000], timeout=30)
    rel = c.execute("SELECT rel_path FROM request_uploads WHERE id=%s", (s2["id"],)).fetchone()[0]
    assert (config.DATA_ROOT / (rel + ".part")).exists()
    x = httpx.delete(B + f"/requests/uploads/{s2['id']}", headers=H(nw), timeout=30)
    assert x.status_code == 200 and x.json()["state"] == "cancelled"
    assert not (config.DATA_ROOT / (rel + ".part")).exists()
    c.close()


def test_format_and_realm_guards(nw, tok, tmp_path):
    """형식 밖 파일 · LX 계정의 올리기는 받지 않는다."""
    r = httpx.post(B + "/requests/uploads", headers=H(nw), json={"filename": "memo.docx", "size": 100}, timeout=30)
    assert r.status_code == 400 and r.json()["error"]["code"] == "bad_ext"
    r = httpx.post(B + "/requests/uploads", headers=H(tok["staff"]), json={"filename": "a.tif", "size": 100}, timeout=30)
    assert r.status_code == 403


# ── 파일에서 읽기 · 관할 밖 거절 ─────────────────────────────────────────────────
def test_read_values_and_out_of_scope(nw, made, tmp_path):
    """해상도 · 촬영일(파일 이름) · 범위 · 좌표계는 파일에서 읽는다 · 관할 밖 영상은 읽은 뒤 거절, 의뢰도 거절(원칙 39)."""
    f = make_tif(tmp_path / "덕과_20250415.tif", NAMWON_LL, seed=21)
    u = upload(nw, f)
    assert u.status_code == 200, u.text
    did = u.json()["draft_id"]
    made["dr"].append(did)
    rd = httpx.post(B + f"/requests/drafts/{did}/read", headers=H(nw), timeout=120).json()
    assert rd["ok"] is True and rd["gsd_word"] == "25cm 항공" and rd["date"] == "2025-04-15" and rd["date_src"] == "name"
    assert "덕과면" in rd["place"] and rd["crs_word"] == "GRS80 중부원점" and rd["scope"] == "in"
    assert "_src" not in rd and rd["overlay"]["url"].startswith("data:image/webp")         # 서버 경로는 내지 않는다
    # 관할 밖
    g = make_tif(tmp_path / "seoul.tif", SEOUL_LL, seed=22)
    u2 = upload(nw, g)
    assert u2.status_code == 200, u2.text
    d2 = u2.json()["draft_id"]
    made["dr"].append(d2)
    rd2 = httpx.post(B + f"/requests/drafts/{d2}/read", headers=H(nw), timeout=120).json()
    assert rd2["ok"] is False and rd2["code"] == "out_of_scope" and "관할 밖" in rd2["why"]
    c = httpx.post(B + "/requests", headers=H(nw), json={"service_id": SERVICE, "source": "upload", "draft_id": d2}, timeout=60)
    assert c.status_code == 403 and c.json()["error"]["code"] == "out_of_scope"
    # 다른 기관의 서비스로는 의뢰할 수 없다
    c2 = httpx.post(B + "/requests", headers=H(nw), json={"service_id": "dp-gj-marine-25", "source": "upload", "draft_id": did}, timeout=60)
    assert c2.status_code == 404


# ── 의뢰 → 결재함 → 반려(사유) · 승인(대기열 앞 한도에서 멈춤 — GPU 0) ─────────────────────────────
def test_request_reject_and_approve_flow(nw, tok, admin2, made, tmp_path):
    f = make_tif(tmp_path / "flow_2024.tif", NAMWON_LL, seed=31)
    did = upload(nw, f).json()["draft_id"]
    made["dr"].append(did)
    httpx.post(B + f"/requests/drafts/{did}/read", headers=H(nw), timeout=120)
    c = httpx.post(B + "/requests", headers=H(nw), json={"service_id": SERVICE, "source": "upload", "draft_id": did, "memo": "pytest 반려 확인"}, timeout=60)
    assert c.status_code == 201, c.text
    rq = c.json()
    made["rq"].append(rq["id"])
    assert rq["state"] == "pending" and rq["state_word"] == "확인 대기" and rq["service"]["name"]
    assert not any("수수료" in k or "비용" in k for k, _ in rq["basis"])                     # 무상 — 비용 · 수수료 줄 없음
    keys = [k for k, _ in rq["basis"]]
    assert "범위" in keys and "면적" in keys and "대기열" in keys and "이 기관 이번 달 사용" in keys   # 판단 근거(막는 한도 아님 · 사용 현황)
    assert not any("남은 양" in k or "한도" in k for k in keys)
    ap = [x for x in httpx.get(B + "/approvals?state=pending", headers=H(admin2), timeout=30).json()["items"] if x["subject"]["id"] == rq["id"]]
    assert ap and ap[0]["kind"] == "request" and ap[0]["kind_label"] == "분석 의뢰" and ap[0]["request_reason"] == "pytest 반려 확인"
    aid = ap[0]["id"]
    n = httpx.post(B + f"/approvals/{aid}/decide", headers=H(admin2), json={"decision": "reject"}, timeout=30)
    assert n.status_code == 400 and n.json()["error"]["code"] == "reason_required"
    ok = httpx.post(B + f"/approvals/{aid}/decide", headers=H(admin2), json={"decision": "reject", "reason": "pytest 사유: 영상이 흐립니다"}, timeout=30)
    assert ok.status_code == 200
    mine = [x for x in httpx.get(B + "/requests", headers=H(nw), timeout=30).json()["items"] if x["id"] == rq["id"]][0]
    assert mine["state"] == "rejected" and mine["reason"] == "pytest 사유: 영상이 흐립니다"   # 반려 사유가 기관 '내 의뢰'에

    # 승인 — 기관 한도와 관계없이 기존 분석 대기열로(기관 몫 작업 · 라벨 '분석 의뢰'). 대기열에 들어간 것을 보고 곧바로 취소(GPU 0 에 가깝게)
    g = make_tif(tmp_path / "flow2_2024.tif", NAMWON_LL, seed=32)
    d2 = upload(nw, g).json()["draft_id"]
    made["dr"].append(d2)
    c2 = httpx.post(B + "/requests", headers=H(nw), json={"service_id": SERVICE, "source": "upload", "draft_id": d2, "memo": "pytest 승인 확인"}, timeout=60)
    assert c2.status_code == 201, c2.text
    r2 = c2.json()
    made["rq"].append(r2["id"])
    db = pg()
    before = db.execute("SELECT soft, hard FROM quotas WHERE tenant_id='namwon' AND dim='gpu_s_month'").fetchone()
    try:
        db.execute("UPDATE quotas SET soft=0, hard=0 WHERE tenant_id='namwon' AND dim='gpu_s_month'")      # 한도를 넘어도 막지 않는다
        a2 = httpx.post(B + f"/approvals/{r2['approval_id']}/decide", headers=H(admin2), json={"decision": "approve", "reason": "승인"}, timeout=30)
        assert a2.status_code == 200 and a2.json()["effect"]["state"] == "approved"
        jid = None
        for _ in range(60):
            jid = db.execute("SELECT job_id FROM analysis_requests WHERE id=%s", (r2["id"],)).fetchone()[0]
            if jid:
                break
            time.sleep(0.25)
        assert jid, db.execute("SELECT state, reason FROM analysis_requests WHERE id=%s", (r2["id"],)).fetchone()
        httpx.post(B + f"/jobs/{jid}/cancel", headers=H(admin2), timeout=30)
        j = db.execute("SELECT tenant_id, kind, label, imagery_id, deploy_id FROM jobs WHERE id=%s", (jid,)).fetchone()
        assert j[0] == "namwon" and j[1] == "infer" and j[2].startswith("분석 의뢰") and j[3].startswith("rqimg-") and j[4] is None
        v = httpx.get(B + f"/requests/{r2['id']}", headers=H(nw), timeout=30).json()
        assert v["state"] in ("analyzing", "failed", "done")
    finally:
        db.execute("UPDATE quotas SET soft=%s, hard=%s WHERE tenant_id='namwon' AND dim='gpu_s_month'", before)
        db.close()


# ── 같은 파일 두 번 올리기 방지 ─────────────────────────────────────────────────
def test_duplicate_blocked(nw, made, tmp_path):
    f = make_tif(tmp_path / "dup_2024.tif", NAMWON_LL, seed=41)
    u = upload(nw, f)
    did = u.json()["draft_id"]
    made["dr"].append(did)
    same = start(nw, f, did)                                          # 같은 묶음에 같은 파일
    assert same.status_code == 409 and same.json()["error"]["code"] == "duplicate" and "이미 이 요청에" in same.json()["error"]["message"]
    renamed = start(nw, f, did, name="다른이름.tif")                  # 이름만 바꿔도 지문이 같다
    assert renamed.status_code == 409 and renamed.json()["error"]["code"] == "duplicate"
    httpx.post(B + f"/requests/drafts/{did}/read", headers=H(nw), timeout=120)
    c = httpx.post(B + "/requests", headers=H(nw), json={"service_id": SERVICE, "source": "upload", "draft_id": did, "memo": "pytest 중복 확인"}, timeout=60)
    assert c.status_code == 201, c.text
    made["rq"].append(c.json()["id"])
    later = start(nw, f)                                              # 의뢰에 쓰인 파일을 새 묶음으로 다시
    assert later.status_code == 409 and "이미 올린 영상" in later.json()["error"]["message"]


# ── 저장 공간 — 기관 한도로 막지 않고, 서버 전체 저장 여유가 모자랄 때만 막는다(사용자 7차 답) ─────────────────
def test_storage_server_guard_only(nw):
    """기관 저장 한도를 넘어도 올리기는 받는다(사용 현황으로 기록만) · 서버 디스크 여유 선(설정 한 곳)을 넘으면 거절 + 한 줄 · 한 파일 한도."""
    db = pg()
    before = db.execute("SELECT soft, hard FROM quotas WHERE tenant_id='namwon' AND dim='storage_gb'").fetchone()
    try:
        db.execute("UPDATE quotas SET soft=0.0001, hard=0.0001 WHERE tenant_id='namwon' AND dim='storage_gb'")
        r = httpx.post(B + "/requests/uploads", headers=H(nw), json={"filename": "big_2025.tif", "size": 10 ** 9}, timeout=30)
        assert r.status_code == 201, r.text
        httpx.delete(B + f"/requests/uploads/{r.json()['id']}", headers=H(nw), timeout=30)
        db.execute("DELETE FROM request_uploads WHERE id=%s", (r.json()["id"],))
        shutil.rmtree(config.DATA_ROOT / "tenants" / "namwon" / "requests" / "drafts" / r.json()["draft_id"], ignore_errors=True)
    finally:
        db.execute("UPDATE quotas SET soft=%s, hard=%s WHERE tenant_id='namwon' AND dim='storage_gb'", before)
        db.close()
    yml = config.CONFIG_DIR / "requests.yaml"
    orig = yml.read_text(encoding="utf-8")
    try:
        yml.write_text(orig.replace("disk_reserve_gb: 200", "disk_reserve_gb: 99999999"), encoding="utf-8")
        time.sleep(0.05)
        r = httpx.post(B + "/requests/uploads", headers=H(nw), json={"filename": "any_2025.tif", "size": 1000}, timeout=30)
        assert r.status_code == 413 and r.json()["error"]["code"] == "disk_full" and "서버 저장 공간" in r.json()["error"]["message"]
    finally:
        yml.write_text(orig, encoding="utf-8")
    big = httpx.post(B + "/requests/uploads", headers=H(nw), json={"filename": "huge.tif", "size": 10 ** 12}, timeout=30)
    assert big.status_code == 413 and big.json()["error"]["code"] == "too_large"               # 한 파일 한도(설정 한 곳)


# ── LX 영상 공유 — 공유된 것만 보이고 불러온다 ───────────────────────────────────────
def test_shared_imagery_only(nw, tok, admin2):
    """관리자가 기관마다 켠 영상만 — 기관의 불러오기 목록 · 지도 영상 층 모두. 관할 밖 영상은 켤 수 없다."""
    A = H(admin2)
    iid = "img-52190-2020-aerial"                                     # 남원 관할 LX 영상(원본 · 처음엔 공유 안 됨)
    lst = httpx.get(B + "/tenants/namwon/imagery-shares", headers=A, timeout=60).json()["items"]
    row = next(x for x in lst if x["id"] == iid)
    was = row["shared"]
    try:
        httpx.put(B + f"/tenants/namwon/imagery-shares/{iid}", headers=A, json={"shared": False}, timeout=30)
        time.sleep(0.2)
        ids = [x["id"] for x in httpx.get(B + "/requests/shared-imagery", headers=H(nw), timeout=60).json()["items"]]
        assert iid not in ids
        on = httpx.put(B + f"/tenants/namwon/imagery-shares/{iid}", headers=A, json={"shared": True}, timeout=30)
        assert on.status_code == 200 and on.json()["shared"] is True
        items = httpx.get(B + "/requests/shared-imagery", headers=H(nw), timeout=60).json()["items"]
        hit = next(x for x in items if x["id"] == iid)
        assert hit["analyzable"] is True and "path" not in hit
        # 공유되지 않은 LX 영상은 기관 지도 층에도 없다
        lay = httpx.get(B + "/catalog/layers?build=tenant", headers=H(nw), timeout=60).json()["items"]
        shared_now = set(ids) | {iid}
        own = [x["id"] for x in lay if x["role"] == "imagery" and x["source"] != "external"]
        assert set(own) <= shared_now
        # 관할 밖 영상은 켤 수 없다 · 다른 기관은 이 영상을 볼 수 없다
        bad = httpx.put(B + f"/tenants/gwangju-jeonnam/imagery-shares/{iid}", headers=A, json={"shared": True}, timeout=30)
        assert bad.status_code == 403 and bad.json()["error"]["code"] == "out_of_scope"
        gj = [x["id"] for x in httpx.get(B + "/requests/shared-imagery", headers=H(tok["gj"]), timeout=60).json()["items"]]
        assert iid not in gj
        # 기관 · 직원은 공유를 바꿀 수 없다
        assert httpx.put(B + f"/tenants/namwon/imagery-shares/{iid}", headers=H(nw), json={"shared": True}, timeout=30).status_code == 403
        assert httpx.put(B + f"/tenants/namwon/imagery-shares/{iid}", headers=H(tok["staff"]), json={"shared": True}, timeout=30).status_code == 403
    finally:
        httpx.put(B + f"/tenants/namwon/imagery-shares/{iid}", headers=A, json={"shared": was}, timeout=30)


def test_shared_request_needs_share(nw, tok):
    """공유되지 않은 영상으로는 의뢰할 수 없다(다른 기관 영상 id 를 알아도)."""
    r = httpx.post(B + "/requests", headers=H(tok["gj"]), json={"service_id": "dp-gj-marine-25", "source": "shared", "imagery_id": "ap25-namwon-2023"}, timeout=60)
    assert r.status_code == 404
