"""구현 2차 T3 · 기관 분기 플랫폼 브랜드 — 읽기(공개) · 고치기 권한(그 기관 관리자 + LX 관리자) · 대비 검사 · 관할 · 마크 그림.

실행: python -m pytest server/tests/test_impl2_brand.py -q   (게이트웨이 :8700 이 떠 있어야 한다)
운영 DB 를 쓰므로 고친 값은 시험이 끝나면 처음 값으로 되돌린다(표 행 스냅숏 · 마크 파일 · 임시 열람 계정).
"""
import io
import json

import httpx
import psycopg
import pytest
from psycopg.types.json import Jsonb

from landxi_api import config
from landxi_api.auth import hash_password

from conftest import B, BASE, H, _login

COLS = ("platform", "short", "mark_text", "mark_file", "accent", "tint", "contact", "intro", "services")


@pytest.fixture(scope="module", autouse=True)
def restore(live):
    """시험 전 브랜드 행을 적어 두고, 끝나면 그대로 되돌린다(마크 파일도)."""
    with psycopg.connect(config.PG_ADMIN_DSN) as c:
        rows = {r[0]: r[1:] for r in c.execute(f"SELECT tenant_id, {', '.join(COLS)} FROM tenant_brand WHERE tenant_id IN ('namwon','gwangju-jeonnam')").fetchall()}
    yield
    with psycopg.connect(config.PG_ADMIN_DSN, autocommit=True) as c:
        for t, v in rows.items():
            cur = c.execute("SELECT mark_file FROM tenant_brand WHERE tenant_id=%s", (t,)).fetchone()
            c.execute(f"UPDATE tenant_brand SET {', '.join(f'{k}=%s' for k in COLS)} WHERE tenant_id=%s",
                      [Jsonb(x) if k == "intro" else x for k, x in zip(COLS, v)] + [t])
            if cur and cur[0] and cur[0] != v[3]:
                (config.DATA_ROOT / "tenants" / t / "brand" / cur[0]).unlink(missing_ok=True)


@pytest.fixture(scope="module")
def viewer(live):
    """기관 열람 계정(viewer) — 관리자가 아니면 못 고친다. 시험 뒤 지운다."""
    uid, login = "u_namwon_viewer_t3test", "namwon-viewer-t3test"
    with psycopg.connect(config.PG_ADMIN_DSN, autocommit=True) as c:
        c.execute("INSERT INTO tenant_users(id, tenant_id, login, pw_hash, role, status, name) VALUES (%s,'namwon',%s,%s,'viewer','active','시험 열람') "
                  "ON CONFLICT (id) DO NOTHING", (uid, login, hash_password(config.DEV_PASSWORD)))
    yield _login({"realm": "tenant", "tenant_id": "namwon", "login": login, "password": config.DEV_PASSWORD})
    with psycopg.connect(config.PG_ADMIN_DSN, autocommit=True) as c:
        c.execute("DELETE FROM sessions WHERE user_id=%s", (uid,))
        c.execute("DELETE FROM tenant_users WHERE id=%s", (uid,))


def _png(w=128, h=128, color=(31, 111, 74, 255)) -> bytes:
    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGBA", (w, h), color).save(buf, "PNG")
    return buf.getvalue()


# ── 읽기(로그인 전 기관 메인) ──────────────────────────────────────────────
def test_public_read_namwon(live):
    r = httpx.get(B + "/brand/namwon", timeout=30)
    assert r.status_code == 200
    j = r.json()
    assert j["tenant"] == "namwon" and j["platform"] and j["short"]
    assert j["color"]["accent"].startswith("#") and j["color"]["tint"].startswith("#")
    assert j["mark"]["text"] and len(j["mark"]["text"]) <= 2
    assert j["intro"]["headline"] and 1 <= len(j["intro"]["lines"]) <= 3
    assert j["can_edit"] is False and j["can_edit_services"] is False
    cards = [s["card"] for s in j["services"]]
    assert cards[:4] == ["card-living", "card-farm", "card-road", "card-crowd"]      # 남원 실제 사업(체계-2 ⓑ) — 국토변화·LX 적용은 없음
    st = {s["card"]: s for s in j["services"]}
    assert st["card-crowd"]["status"] == "내년" and st["card-crowd"]["open"] is False   # 초안만 있는 다음 해 사업
    assert st["card-farm"]["status"] in ("운영", "시범")
    for s in j["services"]:
        assert s["status"] in ("운영", "시범", "첫 결과 전", "내년") or s["status"].endswith("년 예정")
    body = json.dumps(j, ensure_ascii=False)
    for bad in ("pw_hash", "login", "path_internal", "results/", "DATA_ROOT"):   # 공개 정보만 — 계정 · 경로 0
        assert bad not in body


def test_public_read_gwangju_and_unknown(live):
    j = httpx.get(B + "/brand/gwangju-jeonnam", timeout=30).json()
    assert [s["card"] for s in j["services"]] == ["card-marine"]                       # 광주전남: 해양쓰레기
    assert j["services"][0]["year"] == 2025
    for t in ("lx-demo", "lx", "nope-org", "UPPER"):
        assert httpx.get(B + f"/brand/{t}", timeout=30).status_code == 404
    assert httpx.get(BASE + "/files/brand/namwon/..%2F..%2Fsecret.png", timeout=30).status_code == 404
    assert httpx.get(BASE + "/files/brand/namwon/mark-zzzz.png", timeout=30).status_code == 404


# ── 고치기 권한 · 관할 ────────────────────────────────────────────────────────
def test_edit_permissions(tok, viewer):
    body = {"contact": "063-620-6114"}
    assert httpx.put(B + "/brand/namwon", json=body, timeout=30).status_code == 401                          # 게스트
    assert httpx.put(B + "/brand/namwon", json=body, headers=H(tok["staff"]), timeout=30).status_code == 403  # LX 직원
    assert httpx.put(B + "/brand/namwon", json=body, headers=H(tok["sales"]), timeout=30).status_code == 403  # LX 영업
    assert httpx.put(B + "/brand/namwon", json=body, headers=H(viewer), timeout=30).status_code == 403       # 기관 열람 계정
    assert httpx.put(B + "/brand/namwon", json=body, headers=H(tok["gj"]), timeout=30).status_code == 403    # 다른 기관 관리자
    assert httpx.put(B + "/brand/gwangju-jeonnam", json=body, headers=H(tok["namwon"]), timeout=30).status_code == 403
    r = httpx.put(B + "/brand/namwon", json={"platform": "남원시 GeoVision 플랫폼(시험)"}, headers=H(tok["namwon"]), timeout=30)   # 그 기관 관리자
    assert r.status_code == 200 and r.json()["platform"] == "남원시 GeoVision 플랫폼(시험)" and r.json()["can_edit"] is True
    assert httpx.get(B + "/brand/namwon", timeout=30).json()["platform"] == "남원시 GeoVision 플랫폼(시험)"     # 메인에 바로 반영
    r = httpx.put(B + "/brand/namwon", json={"platform": "남원시 GeoVision 플랫폼(관리자)"}, headers=H(tok["admin"]), timeout=30)   # LX 관리자도
    assert r.status_code == 200 and r.json()["platform"] == "남원시 GeoVision 플랫폼(관리자)"


def test_services_list_is_lx_admin_only(tok):
    r = httpx.put(B + "/brand/namwon", json={"services": ["card-farm"]}, headers=H(tok["namwon"]), timeout=30)
    assert r.status_code == 403
    r = httpx.put(B + "/brand/namwon", json={"services": ["card-farm", "card-living"]}, headers=H(tok["admin"]), timeout=30)
    assert r.status_code == 200 and [s["card"] for s in r.json()["services"]] == ["card-farm", "card-living"]
    r = httpx.put(B + "/brand/namwon", json={"services": ["card-living", "card-farm", "card-road", "card-crowd"]}, headers=H(tok["admin"]), timeout=30)
    assert r.status_code == 200


def test_summary_stays_in_own_tenant(tok):
    for k, t in (("namwon", "namwon"), ("gj", "gwangju-jeonnam")):
        items = httpx.get(B + "/summary", headers=H(tok[k]), timeout=60).json()["items"]
        assert items and all(i["tenant"] == t for i in items)                              # 계정 범위 밖 0(원칙 39)


# ── 대비 검사 ────────────────────────────────────────────────────────────────
@pytest.mark.parametrize("colors,key", [
    ({"accent": "#9FD3B5"}, "accent"),                       # 흰 바탕에서 안 읽힘
    ({"accent": "#0A0A0A"}, "accent"),                       # 검정 톤
    ({"tint": "#557766"}, "tint"),                           # 연한 바탕이 짙음
    ({"accent": "#1F6F4A", "tint": "#2A7F55"}, "tint"),      # 두 색 차이가 작음
])
def test_contrast_rejects(tok, colors, key):
    before = httpx.get(B + "/brand/namwon", timeout=30).json()["color"]
    r = httpx.put(B + "/brand/namwon", json=colors, headers=H(tok["namwon"]), timeout=30)
    assert r.status_code == 400
    bad = r.json()["error"]["detail"]["bad"]
    assert any(b["key"] == key for b in bad)
    assert httpx.get(B + "/brand/namwon", timeout=30).json()["color"] == before          # 저장하지 않았다


def test_contrast_passes_and_format(tok):
    r = httpx.put(B + "/brand/namwon", json={"accent": "#1f5f8a", "tint": "#e8f0f6"}, headers=H(tok["namwon"]), timeout=30)
    assert r.status_code == 200 and r.json()["color"] == {"accent": "#1F5F8A", "tint": "#E8F0F6"}
    assert httpx.put(B + "/brand/namwon", json={"accent": "green"}, headers=H(tok["namwon"]), timeout=30).status_code == 400


def test_intro_structure(tok):
    ok = {"headline": "영상을 AI로 분석해\n남원시 업무를 돕습니다", "lines": ["첫째 줄입니다.", "둘째 줄입니다."], "items": {"card-farm": "농지 한 줄"}}
    r = httpx.put(B + "/brand/namwon", json={"intro": ok}, headers=H(tok["namwon"]), timeout=30)
    assert r.status_code == 200 and r.json()["intro"]["headline"] == ok["headline"]
    assert {s["card"]: s["line"] for s in r.json()["services"]}["card-farm"] == "농지 한 줄"
    for bad in ({"headline": "한\n두\n세 줄"}, {"headline": "가" * 21}, {"lines": ["a", "b", "c", "d"]}, {"lines": []}):
        assert httpx.put(B + "/brand/namwon", json={"intro": bad}, headers=H(tok["namwon"]), timeout=30).status_code == 400
    r = httpx.put(B + "/brand/namwon", json={"platform": "<b>남원</b>시"}, headers=H(tok["namwon"]), timeout=30)
    assert r.status_code == 200 and "<" not in r.json()["platform"]


# ── 마크 그림 ────────────────────────────────────────────────────────────────
def test_mark_upload_rules(tok):
    up = lambda t, data, name="m.png", typ="image/png": httpx.post(B + f"/brand/{t}/mark", files={"file": (name, data, typ)}, headers=H(tok["namwon"]), timeout=60)
    assert up("gwangju-jeonnam", _png()).status_code == 403                                    # 다른 기관
    assert up("namwon", b"not an image", "m.txt", "text/plain").status_code == 400             # 형식
    assert up("namwon", _png(16, 16)).status_code == 400                                        # 너무 작음
    assert up("namwon", b"\x89PNG" + b"0" * 1_000_100).status_code == 400                      # 1MB 넘음
    r = up("namwon", _png(900, 300))
    assert r.status_code == 200
    img = r.json()["mark"]["image"]
    assert img and img.startswith("/files/brand/namwon/mark-") and img.endswith(".png")
    f = httpx.get(BASE + img, timeout=30)
    assert f.status_code == 200 and f.headers["content-type"] == "image/png"
    from PIL import Image
    assert max(Image.open(io.BytesIO(f.content)).size) <= 512                                   # 512 안쪽으로 다시 저장
    r = httpx.delete(B + "/brand/namwon/mark", headers=H(tok["admin"]), timeout=30)              # LX 관리자도 지운다
    assert r.status_code == 200 and r.json()["mark"]["image"] is None
    assert httpx.get(BASE + img, timeout=30).status_code == 404
