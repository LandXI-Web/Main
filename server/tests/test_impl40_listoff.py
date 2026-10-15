"""구현 40 · 지도 서비스 '목록' — 끈 클래스 빠짐(10-15 원칙 265). 실서버 DB · GPU 0.

  GET /me/analyses/{작업}/rows?off=["건물"]  끈 클래스(보이는 이름) 줄은 표와 수에서 빠짐 · 나머지 조건(cond)과 함께 걸림
"""
import json

import httpx

from conftest import B, H
from test_impl14_b import NAMWON_GH
from test_impl15_gptb import _n


def test_rows_off_classes(tok):
    t = tok["staff"]
    url = B + f"/me/analyses/{NAMWON_GH}/rows"
    full = httpx.get(url, params={"limit": 200}, headers=H(t), timeout=60).json()
    names = sorted({it["properties"]["cls"] for it in full["items"]})
    assert full["n"] == _n("job_id=%s", (NAMWON_GH,)) and names
    off = names[0]
    r = httpx.get(url, params={"limit": 200, "off": json.dumps([off], ensure_ascii=False)}, headers=H(t), timeout=60).json()
    assert r["n"] < full["n"] and all(it["properties"]["cls"] != off for it in r["items"])
    # 조건과 함께 — 면적 조건 + 끈 클래스
    cond = '{"area_min":1000,"area_op_min":">"}'
    a = httpx.get(url, params={"limit": 200, "cond": cond}, headers=H(t), timeout=60).json()
    b = httpx.get(url, params={"limit": 200, "cond": cond, "off": json.dumps([off], ensure_ascii=False)}, headers=H(t), timeout=60).json()
    assert b["n"] == a["n"] - sum(1 for it in a["items"] if it["properties"]["cls"] == off) and b["label"] == a["label"]
    # 잘못된 off 는 무시(전체 그대로)
    bad = httpx.get(url, params={"limit": 5, "off": "not-json"}, headers=H(t), timeout=60).json()
    assert bad["n"] == full["n"]
