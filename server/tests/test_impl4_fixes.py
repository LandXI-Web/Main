"""impl-4 바로 고침 — 실서버(:8700) + 모듈 시험.

구현 확인 3차(10-01 오후 5:03) 후속:
  Q-4 ⓑ   화질 기준 96%(설정 한 곳 config/imagery.yaml check.ssim_min 0.97 → 0.96)
  FR-1    LX 직원 데이터 올리기 '영상 등록' = 파일 끌어 놓기(경로 칸 · 촬영 연도 · 해상도 입력 칸 없음 — 서버가 파일에서 읽는다 · 원칙 41 · 49 ·
          사용자 규칙 2). 기관 분석 요청과 같은 조각 올리기(/catalog/imagery/uploads). 서버 경로 등록은 LX 관리자 도구로만.
  기관-6 ⓐ 못 읽는 파일 — 'LX 담당자에게 보내 확인받기'(POST /reviews/file · 받는 사람 = 그 서비스 담당 LX 직원 → 없으면 LX 관리자).
시험 영상은 남원 25cm 항공 모음에서 잘라 낸 작은 조각(사본 · TFW 만 — 국토지리정보원 도엽 모양). 실자산 원본은 읽기만 한다.
끝에서 이 시험이 만든 영상 행 · 변환 기록 · 표준본 · 올린 파일 · 요청을 모두 지운다(공유 영상 목록에 남기지 않는다). GPU 0.
"""
import json
import os
import shutil
import time
from pathlib import Path

import httpx
import psycopg
import pytest

from conftest import B, H, STAFF_ID
from landxi_api import config
from landxi_api import imagery_std as S

NAMWON_VRT = config.DATA_ROOT / "_work" / "namwon_ap25_2023.vrt"
UP = "/catalog/imagery/uploads"
SERVICE = "dp-52190-5e85a9-26"             # 남원시 비닐하우스 서비스


def pg():
    return psycopg.connect(config.PG_ADMIN_DSN, autocommit=True)


def chip(out: Path, px=768) -> Path:
    """남원 덕과면 25cm 항공 조각(실제 화소 · 사본) — 좌표계 없이 TFW 만(도엽 모양 · 파일 안에 날짜 없음)."""
    import rasterio
    from rasterio.warp import transform
    from rasterio.windows import Window
    xs, ys = transform("EPSG:4326", "EPSG:5186", [127.36654], [35.52301])
    with rasterio.open(NAMWON_VRT) as s:
        r, c = s.index(xs[0], ys[0])
        w = Window(c - px // 2, r - px // 2, px, px)
        arr, t = s.read([1, 2, 3], window=w), s.window_transform(w)
    with rasterio.open(out, "w", driver="GTiff", width=px, height=px, count=3, dtype="uint8", transform=t) as d:
        d.write(arr)
    out.with_suffix(".tfw").write_text("\n".join(str(v) for v in (t.a, t.d, t.b, t.e, t.c + t.a / 2, t.f + t.e / 2)) + "\n")
    return out


def quick_fp(path):
    import hashlib
    size = os.path.getsize(path)
    h = hashlib.sha256(f"{size}:".encode())
    with open(path, "rb") as f:
        h.update(f.read(1 << 20))
        if size > (1 << 20):
            f.seek(size - (1 << 20))
            h.update(f.read(1 << 20))
    return h.hexdigest()


def start(t, path, draft=None):
    return httpx.post(B + UP, headers=H(t), json={"draft_id": draft, "filename": os.path.basename(path), "size": os.path.getsize(path),
                                                  "quick_fp": quick_fp(path)}, timeout=30)


def upload(t, path, draft=None, chunk=256 * 1024):
    r = start(t, path, draft)
    if r.status_code >= 300:
        return r
    st = r.json()
    data = open(path, "rb").read()
    off = st["bytes"]
    while off < len(data):
        rr = httpx.put(B + f"{UP}/{st['id']}?offset={off}", headers={**H(t), "content-type": "application/octet-stream"},
                       content=data[off:off + chunk], timeout=60)
        assert rr.status_code == 200, rr.text
        off = rr.json()["bytes"]
    return httpx.post(B + f"{UP}/{st['id']}/finish", headers=H(t), timeout=120)


@pytest.fixture(scope="module")
def box(live):
    made = {"img": [], "draft": [], "fb": []}
    yield made
    c = pg()
    for iid in made["img"]:
        for (sp, op) in c.execute("SELECT std_path, orig_path FROM imagery_std WHERE source_kind='imagery' AND source_id=%s", (iid,)).fetchall():
            if sp and sp != op:
                S.absolute(sp).unlink(missing_ok=True)
        c.execute("DELETE FROM imagery_std WHERE source_kind='imagery' AND source_id=%s", (iid,))
        c.execute("DELETE FROM index_results WHERE job_id IN (SELECT id FROM jobs WHERE imagery_id=%s)", (iid,))
        c.execute("DELETE FROM jobs WHERE imagery_id=%s OR options->>'imagery_id'=%s", (iid, iid))
        c.execute("DELETE FROM imagery_shares WHERE imagery_id=%s", (iid,))
        c.execute("DELETE FROM imagery WHERE id=%s", (iid,))
    for did in made["draft"]:
        c.execute("DELETE FROM request_uploads WHERE draft_id=%s AND tenant_id='lx'", (did,))
        shutil.rmtree(config.DATA_ROOT / "cog" / "uploads" / "drafts" / did, ignore_errors=True)
    for rid in made["fb"]:
        c.execute("DELETE FROM review_reads WHERE request_id=%s", (rid,))
        c.execute("DELETE FROM review_messages WHERE request_id=%s", (rid,))
        c.execute("DELETE FROM feedback WHERE id=%s", (rid,))
    c.close()


# ── Q-4 ⓑ ─────────────────────────────────────────────────────────────────────────
def test_quality_threshold_96():
    """화질 기준은 설정 한 곳 — 0.96(구현 확인 3차 Q-4 ⓑ)."""
    assert S.settings()["check"]["ssim_min"] == pytest.approx(0.96)
    assert S.settings()["check"]["psnr_min_db"] == pytest.approx(38)


# ── FR-1 · LX 영상 등록 = 파일 끌어 놓기 ──────────────────────────────────────────────
def test_lx_register_from_files(tok, box, tmp_path):
    """TFW 만 딸린 도엽 사본 + 위치 파일을 조각으로 올리고 {draft_id} 로 등록 → 시군구 · 해상도 · 종류는 파일에서, 촬영 연도는 파일에 없으므로 비움.
    영상 등록 작업(CPU)이 표준본을 만들고 · 같은 묶음 · 같은 파일은 두 번 등록되지 않는다 · 응답에 서버 경로가 없다."""
    st = H(tok["staff"])
    assert httpx.post(B + "/catalog/imagery", headers=st, json={"path": "cog/uploads/x.tif", "region": "52190", "year": 2025}, timeout=30).status_code == 403
    assert httpx.post(B + UP, headers=H(tok["namwon"]), json={"filename": "a.tif", "size": 10}, timeout=30).status_code == 403
    fm = httpx.get(B + UP + "/formats", headers=st, timeout=30).json()
    assert "tif" in fm["raster"] and "tfw" in fm["sidecar"]
    f = chip(tmp_path / "pytest_lx_dogeop.tif")
    u1 = upload(tok["staff"], f)
    assert u1.status_code == 200, u1.text
    did = u1.json()["draft_id"]
    box["draft"].append(did)
    assert upload(tok["staff"], f.with_suffix(".tfw"), did).status_code == 200
    assert httpx.post(B + "/catalog/imagery", headers=H(tok["admin"]), json={"draft_id": did}, timeout=60).status_code == 403   # 다른 사람의 묶음
    r = httpx.post(B + "/catalog/imagery", headers=st, json={"draft_id": did, "near": "52190"}, timeout=120)
    assert r.status_code == 201, r.text
    body = json.dumps(r.json(), ensure_ascii=False)
    assert "cog/" not in body and "drafts" not in body and ":\\\\" not in body                    # 경로 노출 0
    it = r.json()["items"][0]
    box["img"].append(it["id"])
    assert len(r.json()["items"]) == 1 and it["sgg_cd"] == "52190" and it["region"] == "남원시"
    assert it["year"] is None and abs(it["gsd_m"] - 0.25) < 1e-3 and it["kind"] == "aerial"
    s = {}
    for _ in range(240):
        s = httpx.get(B + f"/jobs/{it['job']['id']}", headers=st, timeout=20).json()
        if s["state"] in ("done", "failed"):
            break
        time.sleep(0.5)
    assert s["state"] == "done", s.get("error")
    c = pg()
    name, year, sgg, crs, path, layer = c.execute("SELECT name->>'ko', year, sgg_cd, crs, path_internal, layer FROM imagery WHERE id=%s", (it["id"],)).fetchone()
    rec = S.get(source=("imagery", it["id"]))
    ups = c.execute("SELECT filename, request_id FROM request_uploads WHERE draft_id=%s ORDER BY filename", (did,)).fetchall()
    c.close()
    assert name == "남원시 항공영상" and year is None and sgg == "52190" and crs == "EPSG:5186"
    assert rec["state"] == "ready" and rec["orig_owned"] is True and rec["orig_delete_on"]                 # 플랫폼이 받은 원본 — 90일 뒤 정리
    assert path == rec["std_path"] and layer["cog_path"] == rec["std_path"]
    assert all(rid == it["id"] for _, rid in ups) and len(ups) == 2                                      # 영상 · 위치 파일 모두 이 영상에 쓰임
    det = httpx.get(B + "/regions/52190", headers=st, timeout=60).json()
    assert any(x["id"] == it["id"] for x in det.get("imagery") or [])                                    # 그 지역 '영상 있음'(새로 고침 뒤에도)
    again = httpx.post(B + "/catalog/imagery", headers=st, json={"draft_id": did}, timeout=60)
    assert again.status_code == 409
    dup = start(tok["staff"], f)
    assert dup.status_code == 409 and "이미 등록한 영상" in dup.json()["error"]["message"]
    assert it["id"] not in [x["id"] for x in httpx.get(B + "/catalog/layers", headers=H(tok["namwon"]), timeout=30).json()["items"]]   # 기관 공유 0


def test_lx_register_unreadable(tok, box, tmp_path):
    """이름만 .tif 인 파일 — 등록하지 않고 쉬운 말 한 줄 + 그 파일 이름(화면은 창으로 알린다) · 묶음은 지울 수 있다."""
    st = H(tok["staff"])
    bad = tmp_path / "pytest_not_image.tif"
    bad.write_bytes(b"this is not an image " * 64)
    u = upload(tok["staff"], bad)
    assert u.status_code == 200, u.text
    did = u.json()["draft_id"]
    box["draft"].append(did)
    r = httpx.post(B + "/catalog/imagery", headers=st, json={"draft_id": did}, timeout=60)
    assert r.status_code == 400 and r.json()["error"]["code"] == "unreadable", r.text
    assert r.json()["error"]["detail"]["files"] == ["pytest_not_image.tif"]
    assert "읽을 수 없는" in r.json()["error"]["message"]
    d = httpx.delete(B + f"/catalog/imagery/drafts/{did}", headers=st, timeout=30)
    assert d.status_code == 200 and not (config.DATA_ROOT / "cog" / "uploads" / "drafts" / did).exists()


# ── 기관-6 ⓐ · 못 읽는 파일 — LX 담당자에게 보내 확인받기 ─────────────────────────────────────
def test_unreadable_file_to_lx(tok, box):
    nw = H(tok["namwon"])
    assert httpx.post(B + "/reviews/file", headers=H(tok["staff"]), json={"files": ["a.tif"]}, timeout=30).status_code == 403
    assert httpx.post(B + "/reviews/file", headers=nw, json={"files": []}, timeout=30).status_code == 400
    rc = httpx.get(B + "/reviews/recipient", headers=nw, params={"deploy": SERVICE}, timeout=30).json()["recipient"]
    r = httpx.post(B + "/reviews/file", headers=nw, json={"files": ["C:\\드론\\원본_2025.ecw"], "why": "지금은 이 파일을 받을 수 없습니다",
                                                          "note": "pytest 못 읽는 파일", "deploy": SERVICE}, timeout=30)
    assert r.status_code == 201, r.text
    j = r.json()
    box["fb"].append(j["id"])
    assert j["recipient"]["kind"] == rc["kind"] and j["recipient"].get("name") == rc.get("name")       # 검토 요청과 같은 판정
    assert j["where"] == "못 읽는 파일 · 원본_2025.ecw"                                                    # 이름만(경로는 버림)
    adm = httpx.get(B + "/reviews?box=all", headers=H(tok["admin"]), timeout=30).json()["items"]
    hit = next(x for x in adm if x["id"] == j["id"])                                                    # LX 관리자는 모두 본다
    assert hit["note"] == "pytest 못 읽는 파일" and hit["topic"] == "file" and hit["org"] == "남원시" and hit["sender"]
    mine = httpx.get(B + "/reviews?box=all", headers=nw, timeout=30).json()["items"]
    assert any(x["id"] == j["id"] and x["sender"] == "나" for x in mine)                                 # 기관 '내가 보낸 요청'
    staff = httpx.get(B + "/reviews?box=all", headers=H(tok["staff"]), timeout=30).json()["items"]
    c = pg()
    to = c.execute("SELECT recipient_id FROM feedback WHERE id=%s", (j["id"],)).fetchone()[0]
    c.close()
    assert any(x["id"] == j["id"] for x in staff) == (to == STAFF_ID)                                  # 담당 직원만(아니면 안 보임)
    one = httpx.get(B + f"/reviews/{j['id']}", headers=H(tok["admin"]), timeout=30).json()
    assert one["files"] == ["원본_2025.ecw"] and one["topic"] == "file"
    gj = httpx.post(B + "/reviews/file", headers=H(tok["gj"]), json={"files": ["b.tif"], "deploy": SERVICE}, timeout=30)   # 다른 기관의 서비스를 적어도
    assert gj.status_code == 201 and gj.json()["service"] is None and gj.json()["recipient"]["kind"] == "admin"           # 그 기관 것이 아니면 LX 관리자
    box["fb"].append(gj.json()["id"])


# ── M-3 ⓐ · 필지 대조는 서버가 뒤에서 ────────────────────────────────────────────────
def test_parcel_after_global_analysis(live):
    """배포 흐름 밖에서 끝난 시군구 전역 AI 분석 — 필지 대조 카드면 실태조사(POST /survey/build)를 저절로 잇는다 · 한 번에 하나 ·
    필지 대조가 아닌 카드 · 일부 범위 분석은 잇지 않는다. 실태조사 호출은 가짜(실제 계산 0 · GPU 0). 시험 작업은 끝난 지 100시간 전으로 적어
    돌고 있는 게이트웨이(72시간 창)가 건드리지 않게 한다."""
    import asyncio
    import uuid
    from landxi_api import deploys as dp
    from landxi_api import deps
    tag = uuid.uuid4().hex[:6]
    ok, road, aoi, busy = (f"pytest-parcel-{tag}-{k}" for k in ("ok", "road", "aoi", "busy"))
    calls = []

    async def fake_route(method, path, body, p):
        calls.append((path, body))
        return {"job": {"id": "x"}}

    async def run():
        async with deps.db(realm="lx") as conn:
            for jid, card, scope in ((ok, "card-5e85a9", "sgg"), (road, "card-road", "sgg"), (aoi, "card-5e85a9", "aoi")):
                await conn.execute("INSERT INTO jobs(id, tenant_id, submitted_by, kind, state, priority, pool, card_id, options, test, label, finished_at) "
                                   "VALUES ($1,'lx','u_mail_test','infer','done',0,'a6000',$2,$3,false,'pytest parcel',now() - interval '100 hours')",
                                   jid, card, {"scope": scope, "sgg_cd": "52113"})
                await conn.execute("INSERT INTO detections(tenant_id, job_id, cls, conf) VALUES ('lx',$1,'비닐하우스',0.9)", jid)
        o_route, o_win = dp._call_route, dp.PARCEL_WINDOW_H
        dp._call_route, dp.PARCEL_WINDOW_H = fake_route, 200
        try:
            async with deps.db(realm="lx") as conn:          # 돌고 있는 실태조사가 있으면 다음 차례
                await conn.execute("INSERT INTO jobs(id, tenant_id, kind, state, options, test, label) VALUES ($1,'lx','survey','queued',$2,true,'pytest busy')",
                                   busy, {"build": True, "sgg_cd": "52113"})
            first = await dp.parcel_tick()
            async with deps.db(realm="lx") as conn:
                await conn.execute("DELETE FROM jobs WHERE id=$1", busy)
            second = await dp.parcel_tick()
            return first, second
        finally:
            dp._call_route, dp.PARCEL_WINDOW_H = o_route, o_win
            async with deps.db(realm="lx") as conn:
                await conn.execute("DELETE FROM detections WHERE job_id = ANY($1::text[])", [ok, road, aoi])
                await conn.execute("DELETE FROM jobs WHERE id = ANY($1::text[])", [ok, road, aoi, busy])
                await conn.execute("DELETE FROM audit_log WHERE action='survey.auto' AND after->>'ai_job_id' = ANY($1::text[])", [ok, road, aoi])
            await deps.close()

    first, second = asyncio.run(run())
    assert first is None                                                         # 한 번에 하나
    assert second == ok                                                          # 필지 대조 카드의 전역 분석만
    assert [p for p, _ in calls] == ["/survey/build"]
    body = calls[0][1]
    assert body["sgg_cd"] == "52113" and body["job_id"] == ok and body.get("rules")   # 서비스에서 고른 규칙만


# ── M-4 ⓐ · 공유 영상 그림 · 어디 · 언제 · 순서 ───────────────────────────────────────────────
def test_shares_with_pictures(tok):
    adm, st = H(tok["admin"]), H(tok["staff"])
    j = httpx.get(B + "/tenants/namwon/imagery-shares", headers=adm, timeout=120).json()
    items = j["items"]
    assert items and all(x["kind"] in ("drone", "aerial", "satellite") and x["thumb"] for x in items)
    shared = [x["shared"] for x in items]
    assert shared == sorted(shared, reverse=True)                                      # 공유 중 먼저
    on = [x for x in items if x["shared"]]
    years = [int(x["when"][:4]) for x in on if x["when"]]
    assert years == sorted(years, reverse=True)                                        # 최근 촬영순
    assert any(x["where"] and x["where"].endswith(("일대", "전역")) for x in items)     # 어디(영상 범위에서)
    body = json.dumps(j, ensure_ascii=False)
    assert "cog/" not in body and "path" not in body                                  # 경로 노출 0
    r = httpx.get(B + items[0]["thumb"], headers=adm, timeout=120)
    assert r.status_code in (200, 204) and (r.status_code == 204 or r.headers["content-type"] == "image/jpeg")
    if r.status_code == 200:
        import cv2
        import numpy as np
        im = cv2.imdecode(np.frombuffer(r.content, np.uint8), 1)
        assert im.shape[:2] == (240, 320)
    assert httpx.get(B + items[0]["thumb"], headers=st, timeout=120).status_code in (200, 204)   # LX 직원도(분석하기 영상 고르기 · 원칙 153 · 10-10)
    assert httpx.get(B + items[0]["thumb"], headers=H(tok["namwon"]), timeout=30).status_code == 403   # 기관 계정은 아님
    assert httpx.get(B + items[0]["thumb"], timeout=30).status_code == 401


# ── 기관-12 ⓐ · 기관 메인 배경 사진 ───────────────────────────────────────────────────────
def test_main_photo(tok):
    import cv2
    import numpy as np
    adm = H(tok["admin"])
    T = "gwangju-jeonnam"
    try:
        assert httpx.get(B + f"/tenants/{T}/main-photo", headers=H(tok["staff"]), timeout=30).status_code == 403
        j = httpx.get(B + f"/tenants/{T}/main-photo", headers=adm, timeout=60).json()
        assert "scenes" in j and "imagery" in j
        # 다른 기관의 장면은 못 고른다 · 이 기관에 공유하지 않은 영상도
        assert httpx.put(B + f"/tenants/{T}/main-photo", headers=adm, json={"kind": "scene", "src": "/landxi/v3/service-detail/data/img/namwon-epoch4/4.jpg"},
                         timeout=60).status_code == 400
        assert httpx.put(B + f"/tenants/{T}/main-photo", headers=adm, json={"kind": "imagery", "id": "namwon-aoi-2510"}, timeout=60).status_code == 400
        big = np.random.default_rng(7).integers(0, 255, (1500, 3000, 3), dtype=np.uint8)
        ok, buf = cv2.imencode(".jpg", big)
        r = httpx.post(B + f"/tenants/{T}/main-photo/upload", headers=adm, files={"file": ("pytest.jpg", buf.tobytes(), "image/jpeg")}, timeout=120)
        assert r.status_code == 200, r.text
        pub = httpx.get(B + f"/brand/{T}/main-photo", timeout=30)                       # 로그인 없이 — 고른 한 장(가로 1,600 이하)
        im = cv2.imdecode(np.frombuffer(pub.content, np.uint8), 1)
        assert pub.status_code == 200 and im.shape[1] == 1600 and im.shape[0] == 800
        bad = httpx.post(B + f"/tenants/{T}/main-photo/upload", headers=adm, files={"file": ("x.jpg", b"nope", "image/jpeg")}, timeout=60)
        assert bad.status_code == 400
    finally:
        httpx.put(B + f"/tenants/{T}/main-photo", headers=adm, json={"kind": "default"}, timeout=60)
    assert httpx.get(B + f"/brand/{T}/main-photo", timeout=30).status_code == 404       # 기본(지금 그림)으로 되돌림
