"""구현 26차 — LX 직원 대시보드 '메모'(나만 보는 짧은 글 · 원칙 201 · 226). 실서버(:8700) · GPU 0.

확인: ① 쓰기 · 읽기(고정이 위 · 최근 순) · 고정 · 지우기 ② 남의 메모는 보이지 않고 고칠 수 없다 ③ 빈 글 · 200자 넘는 글은 거절
시험 메모는 끝에서 지운다.
"""
import httpx

from conftest import B, H


def _mine(tok, who="staff"):
    return httpx.get(B + "/me/memos?limit=50", headers=H(tok[who]), timeout=30).json()


def test_memo_cycle(tok):
    made = []
    try:
        for t in ("pytest 메모 하나", "pytest 메모 둘"):
            r = httpx.post(B + "/me/memos", headers=H(tok["staff"]), json={"body": t}, timeout=30)
            assert r.status_code == 201, r.text
            made.append(r.json()["item"]["id"])
        r = httpx.post(B + f"/me/memos/{made[0]}/pin", headers=H(tok["staff"]), json={"pinned": True}, timeout=30)
        assert r.status_code == 200 and r.json()["item"]["pinned"] is True
        items = [x for x in _mine(tok)["items"] if x["id"] in made]
        assert [x["id"] for x in items] == [made[0], made[1]]                # 고정이 위
        # 남의 메모 — 관리자 계정으로는 보이지 않고 고칠 수 없다
        if "admin" in tok:
            assert all(x["id"] not in made for x in _mine(tok, "admin")["items"])
            r = httpx.post(B + f"/me/memos/{made[1]}/remove", headers=H(tok["admin"]), json={}, timeout=30)
            assert r.status_code == 404
        assert httpx.post(B + "/me/memos", headers=H(tok["staff"]), json={"body": "  "}, timeout=30).status_code == 400
        assert httpx.post(B + "/me/memos", headers=H(tok["staff"]), json={"body": "가" * 201}, timeout=30).status_code == 400
    finally:
        for mid in made:
            httpx.post(B + f"/me/memos/{mid}/remove", headers=H(tok["staff"]), json={}, timeout=30)
    assert all(x["id"] not in made for x in _mine(tok)["items"])
