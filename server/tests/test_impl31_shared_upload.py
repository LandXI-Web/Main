"""구현 31 · LX 관리자 '공유 데이터' — 학습 데이터 · 행정 자료 올리기 · 관리(10-14 공유데이터-탭 다시 · 원칙 246).

① 학습 데이터 올리기 = 프로젝트 학습데이터 구축과 같은 길(/training/uploads · zip: images · labels · dataset.yaml) — 프로젝트 없이 = 공유.
   비공개면 직원 목록(이어 쓰기 · 공유 데이터에서 고르기) 어디에도 없음 · 공개면 ?shared=1 에 · 정보 고치기(이름 · 클래스 — 서버 클래스 목록) ·
   지우기(학습에 쓴 묶음은 409) · 프로젝트 학습 데이터는 고치기 · 지우기 403.
② 행정 자료 올리기 = POST /shared/ledgers(기관 대장과 같은 형식 판별 · 성명 열 버림) — GeoJSON · CSV(좌표 열).
   공개면 직원 GET /shared/layers 에 · 도형 GET /shared/layers/{id} · 비공개면 둘 다 없음 · 기관 대장은 고치기 · 지우기 403.
실행: python -m pytest server/tests/test_impl31_shared_upload.py -q   (게이트웨이 :8700)
"""
import io
import json
import zipfile

import httpx
import psycopg
import pytest

from conftest import ADMIN_LOGIN, B, config, login_lx, login_tenant

FAKE_MODEL = "mdl_pytest31_used"


def H(t):
    return {"authorization": "Bearer " + t}


def sql(q, *a):
    with psycopg.connect(config.PG_ADMIN_DSN, autocommit=True) as c:
        cur = c.execute(q, a)
        return cur.fetchall() if cur.description else None


def yolo_zip(names=("건물",), n=3) -> bytes:
    from PIL import Image
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("dataset.yaml", "names: [" + ", ".join(names) + "]\n")
        for i in range(n):
            im = io.BytesIO()
            Image.new("RGB", (64, 64), (40 * i, 120, 90)).save(im, "JPEG")
            z.writestr(f"images/a{i}.jpg", im.getvalue())
            z.writestr(f"labels/a{i}.txt", "0 0.5 0.5 0.4 0.4\n")
    return buf.getvalue()


def upload_sample(tok, name, data, **extra):
    r = httpx.post(B + "/training/uploads", json={"filename": "t.zip", "size": len(data), "task_name": name, **extra}, headers=H(tok), timeout=30)
    assert r.status_code == 201, r.text
    uid = r.json()["id"]
    r = httpx.put(f"{B}/training/uploads/{uid}?offset=0", content=data, headers={**H(tok), "content-type": "application/octet-stream"}, timeout=60)
    assert r.status_code == 200, r.text
    r = httpx.post(f"{B}/training/uploads/{uid}/finish", json={}, headers=H(tok), timeout=120)
    assert r.status_code == 201, r.text
    return r.json()


@pytest.fixture(scope="module")
def tok():
    t = {"staff": login_lx(), "admin": login_lx(ADMIN_LOGIN), "namwon": login_tenant("namwon")}
    made = {"samples": [], "ledgers": []}
    t["made"] = made
    yield t
    sql("DELETE FROM models WHERE id=%s", FAKE_MODEL)
    for sid in made["samples"]:
        httpx.delete(f"{B}/training/samples/{sid}", headers=H(t["admin"]), timeout=30)
        sql("DELETE FROM sample_classes WHERE sample_id=%s", sid)
        sql("DELETE FROM train_samples WHERE id=%s", sid)
    for iid in made["ledgers"]:
        httpx.delete(f"{B}/shared/ledgers/{iid}", headers=H(t["admin"]), timeout=30)


def test_train_upload_manage(tok):
    a, s = tok["admin"], tok["staff"]
    smp = upload_sample(a, "시험 공유 학습 31", yolo_zip())
    sid = smp["id"]
    tok["made"]["samples"].append(sid)
    assert smp["images"]["value"] == 3 and smp["names"] == ["건물"]
    row = next(x for x in httpx.get(B + "/shared/train-data", headers=H(a), timeout=60).json()["items"] if x["id"] == sid)
    assert row["project"] is None and row["edit"] is True and row["shared"] is False and row["name"] == "시험 공유 학습 31"
    staff_all = lambda: {x["id"] for x in httpx.get(B + "/training/samples", headers=H(s), timeout=30).json()["items"]}  # noqa: E731
    staff_shared = lambda: {x["id"] for x in httpx.get(B + "/training/samples", params={"shared": "1"}, headers=H(s), timeout=30).json()["items"]}  # noqa: E731
    assert sid not in staff_all() and sid not in staff_shared()            # 비공개 = 직원에게 안 보임
    assert httpx.patch(f"{B}/training/samples/{sid}", json={"shared": True}, headers=H(s), timeout=30).status_code == 403
    assert httpx.patch(f"{B}/training/samples/{sid}", json={"shared": True}, headers=H(a), timeout=30).status_code == 200
    assert sid in staff_shared() and sid in staff_all()
    # 정보 고치기 — 이름 · 클래스(목록에 있는 이름만)
    assert httpx.patch(f"{B}/training/samples/{sid}", json={"names": ["없는클래스31"]}, headers=H(a), timeout=30).status_code == 400
    r = httpx.patch(f"{B}/training/samples/{sid}", json={"name": "시험 공유 학습 31 고침", "names": ["비닐하우스"]}, headers=H(a), timeout=60)
    assert r.status_code == 200, r.text
    g = httpx.get(f"{B}/training/samples/{sid}", headers=H(a), timeout=30).json()
    assert g["task_name"] == "시험 공유 학습 31 고침" and g["names"] == ["비닐하우스"] and g["classes"][0]["objects"]["value"] == 3
    assert sql("SELECT count(*) FROM sample_classes sc JOIN classes c ON c.id=sc.class_id WHERE sc.sample_id=%s AND c.name='비닐하우스'", sid)[0][0] == 1
    # 학습에 쓴 묶음은 지우지 않는다
    sql("INSERT INTO models(id, sample_id) VALUES (%s, %s)", FAKE_MODEL, sid)
    assert httpx.delete(f"{B}/training/samples/{sid}", headers=H(a), timeout=30).status_code == 409
    sql("DELETE FROM models WHERE id=%s", FAKE_MODEL)
    # 비공개로 → 다시 안 보임 → 지우기
    assert httpx.patch(f"{B}/training/samples/{sid}", json={"shared": False}, headers=H(a), timeout=30).status_code == 200
    assert sid not in staff_shared() and sid not in staff_all()
    assert httpx.delete(f"{B}/training/samples/{sid}", headers=H(s), timeout=30).status_code == 403
    assert httpx.delete(f"{B}/training/samples/{sid}", headers=H(a), timeout=30).status_code == 200
    assert sid not in {x["id"] for x in httpx.get(B + "/shared/train-data", headers=H(a), timeout=60).json()["items"]}
    assert httpx.get(f"{B}/training/samples/{sid}", headers=H(a), timeout=30).status_code == 404


def test_project_sample_view_only(tok):
    a = tok["admin"]
    linked = sql("SELECT l.ref FROM project_links l JOIN train_samples s ON s.id=l.ref AND s.status<>'removed' WHERE l.kind='sample' LIMIT 1")
    if not linked:
        pytest.skip("프로젝트 학습 데이터 없음")
    sid = linked[0][0]
    assert httpx.patch(f"{B}/training/samples/{sid}", json={"name": "x"}, headers=H(a), timeout=30).status_code == 403
    assert httpx.delete(f"{B}/training/samples/{sid}", headers=H(a), timeout=30).status_code == 403


def test_ledger_upload_manage(tok):
    a, s, g = tok["admin"], tok["staff"], tok["namwon"]
    gj = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {"구분": "시험", "성명": "홍길동"}, "geometry": {"type": "Polygon", "coordinates": [[[127.38, 35.41], [127.39, 35.41], [127.39, 35.42], [127.38, 35.41]]]}},
        {"type": "Feature", "properties": {"구분": "시험2", "성명": "김"}, "geometry": {"type": "Point", "coordinates": [127.385, 35.415]}}]}
    files = {"file": ("시험31.geojson", json.dumps(gj, ensure_ascii=False).encode("utf-8"), "application/geo+json")}
    assert httpx.post(B + "/shared/ledgers", data={"kind": "farm_ledger", "name": "x"}, files=files, headers=H(s), timeout=60).status_code == 403
    r = httpx.post(B + "/shared/ledgers", data={"kind": "farm_ledger", "name": "시험 행정 자료 31"}, files=files, headers=H(a), timeout=60)
    assert r.status_code == 201, r.text
    j = r.json()
    iid = j["id"]
    tok["made"]["ledgers"].append(iid)
    assert j["owner"] == "lx" and j["rows"]["value"] == 2 and j["shared"] is False and j["dropped"] == ["성명"]
    lay = lambda: {x["id"] for x in httpx.get(B + "/shared/layers", headers=H(s), timeout=30).json()["items"]}  # noqa: E731
    assert iid not in lay() and httpx.get(f"{B}/shared/layers/{iid}", headers=H(s), timeout=30).status_code == 404
    assert httpx.patch(f"{B}/shared/ledgers/{iid}", json={"shared": True, "name": "시험 행정 자료 31 고침", "kind": "dev_permit"}, headers=H(a), timeout=30).status_code == 200
    one = next(x for x in httpx.get(B + "/shared/layers", headers=H(s), timeout=30).json()["items"] if x["id"] == iid)
    assert one["name"] == "시험 행정 자료 31 고침" and one["kind_label"] == "개발행위 허가" and one["bbox"]
    fc = httpx.get(f"{B}/shared/layers/{iid}", headers=H(s), timeout=30).json()
    assert len(fc["features"]) == 2 and all("성명" not in f["properties"] for f in fc["features"])
    assert httpx.get(B + "/shared/layers", headers=H(g), timeout=30).status_code in (401, 403)
    assert httpx.patch(f"{B}/shared/ledgers/{iid}", json={"shared": False}, headers=H(a), timeout=30).status_code == 200
    assert iid not in lay()
    # 기관 대장은 읽기만
    org = next((x for x in httpx.get(B + "/shared/ledgers", headers=H(a), timeout=30).json()["items"] if x["owner"] == "tenant"), None)
    if org:
        assert httpx.patch(f"{B}/shared/ledgers/{org['id']}", json={"name": "x"}, headers=H(a), timeout=30).status_code == 403
        assert httpx.delete(f"{B}/shared/ledgers/{org['id']}", headers=H(a), timeout=30).status_code == 403
    # CSV(좌표 열)
    csv = "구분,경도,위도,연락처\n시험,127.38,35.41,010\n시험2,127.39,35.42,011\n".encode("utf-8")
    r = httpx.post(B + "/shared/ledgers", data={"kind": "public_asset", "name": "시험 CSV 31"}, files={"file": ("t.csv", csv, "text/csv")}, headers=H(a), timeout=60)
    assert r.status_code == 201, r.text
    tok["made"]["ledgers"].append(r.json()["id"])
    assert r.json()["located"]["value"] == 2 and "연락처" in r.json()["dropped"]
    # 지우기
    for x in list(tok["made"]["ledgers"]):
        assert httpx.delete(f"{B}/shared/ledgers/{x}", headers=H(a), timeout=30).status_code == 200
        tok["made"]["ledgers"].remove(x)
    assert iid not in {x["id"] for x in httpx.get(B + "/shared/ledgers", headers=H(a), timeout=30).json()["items"]}
