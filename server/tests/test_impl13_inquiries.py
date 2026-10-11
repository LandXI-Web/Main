"""impl-13 메인-3 — 문의하기 창(로그인 없이 보내기 · 남용 막기 · LX 관리자 '문의' 목록 · 읽음 · 답함 · 시험 표시). GPU 0.

시험으로 넣은 문의는 test = true 로 표시해 남긴다(지우지 않는다 — 원칙 173). 접속 주소는 문서용 주소(2001:db8::/32)를 매번 새로.
"""
import secrets

import httpx

from conftest import B, H


def doc_ip():
    return f"2001:db8::{secrets.token_hex(2)}:{secrets.token_hex(2)}"


def body(**kw):
    return {"name": "시험 담당", "org": "시험 기관", "email": "test@example.com", "kind": "howto",
            "body": "자동 시험 문의입니다 — 지우지 않고 시험으로 표시합니다.", "consent": True, **kw}


def send(b, ip):
    return httpx.post(B + "/public/inquiries", json=b, headers={"x-forwarded-for": ip, "x-lx-site": "app"}, timeout=30)


def test_send_list_mark(live, tok):
    ip = doc_ip()
    r = send(body(), ip)
    assert r.status_code == 201, r.text
    j = httpx.get(B + "/inquiries", headers=H(tok["admin"]), timeout=30).json()
    mine = next(x for x in j["items"] if x["ip"] == ip)
    assert mine["kind_ko"] == "사용 방법" and mine["org"] == "시험 기관" and not mine["read"] and not mine["test"]
    assert mine["email"] == "test@example.com" and mine["phone"] == ""                # 전화 · 메일 두 칸(메인-3)
    iid = mine["id"]
    m = httpx.post(B + f"/inquiries/{iid}/mark", json={"answered": True}, headers=H(tok["admin"]), timeout=30).json()
    assert m["answered"] and m["read"] and m["answered_name"]                     # 답하면 읽은 것 · 누가 했는지
    m = httpx.post(B + f"/inquiries/{iid}/mark", json={"test": True}, headers=H(tok["admin"]), timeout=30).json()
    assert m["test"]
    # LX 관리자만 — 직원 · 기관 · 로그인 없음은 못 본다
    for t in (tok["staff"], tok["namwon"]):
        assert httpx.get(B + "/inquiries", headers=H(t), timeout=30).status_code == 403
    assert httpx.get(B + "/inquiries", timeout=30).status_code in (401, 403)


def test_validation(live):
    ip = doc_ip()
    assert send(body(email="아무거나"), ip).json()["error"]["detail"]["field"] == "email"
    assert send(body(email="", phone="12ab"), ip).json()["error"]["detail"]["field"] == "phone"
    assert send(body(email=""), ip).json()["error"]["detail"]["field"] == "phone"          # 전화 · 메일 하나 이상
    assert send(body(kind="x"), ip).json()["error"]["detail"]["field"] == "kind"
    assert send(body(consent=False), ip).json()["error"]["detail"]["field"] == "consent"
    assert send(body(body="짧음"), ip).json()["error"]["detail"]["field"] == "body"
    assert send(body(name=""), ip).json()["error"]["detail"]["field"] == "name"


def test_rate_limit_and_trap(live, tok):
    ip = doc_ip()
    codes = [send(body(email="", phone="010-0000-0000", website="http://spam"), ip).status_code for _ in range(6)]
    assert codes[:5] == [201] * 5 and codes[5] == 429                             # 같은 접속 주소 시간당 5번까지
    j = httpx.get(B + "/inquiries", headers=H(tok["admin"]), timeout=30).json()
    assert not any(x["ip"] == ip for x in j["items"])                              # 숨은 칸이 채워진 것은 받은 척만(저장 0)
