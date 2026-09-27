"""F2-B 테스트 공용 — SSE 읽기 · 작업 대기 · 개발 비밀번호(게이트웨이 :8700 필요)."""
import json
import time

import httpx

from conftest import B, BASE, H


def sse(url, until=("snapshot.ready", "job.done", "job.failed", "job.cancelled"), timeout=240, headers=None, max_events=100000):
    out = []
    ev = eid = None
    t0 = time.time()
    with httpx.stream("GET", url, headers=headers or {}, timeout=httpx.Timeout(timeout, read=60)) as r:
        assert r.status_code == 200, r.status_code
        for line in r.iter_lines():
            if line.startswith("event:"):
                ev = line[6:].strip()
            elif line.startswith("id:"):
                eid = line[3:].strip()
            elif line.startswith("data:") and ev:
                out.append((ev, json.loads(line[5:]), eid, time.time() - t0))
                if ev in until or len(out) >= max_events:
                    break
                ev = None
            if time.time() - t0 > timeout:
                break
    return out


def wait_job(tok, jid, states=("done", "failed", "cancelled"), timeout=240):
    j = None
    for _ in range(int(timeout * 2)):
        j = httpx.get(B + f"/jobs/{jid}", headers=H(tok), timeout=30).json()
        if j["state"] in states:
            return j
        time.sleep(0.5)
    return j


def submit(tok, body):
    r = httpx.post(B + "/jobs", headers=H(tok), json=body, timeout=120)
    assert r.status_code == 202, r.text[:400]
    return r.json()["job"]["id"]


HWANG_AOI = {"type": "Polygon", "coordinates": [[[126.9467, 35.9956], [126.9495, 35.9956], [126.9495, 35.9975], [126.9467, 35.9975], [126.9467, 35.9956]]]}
HWANG_SMALL = {"type": "Polygon", "coordinates": [[[126.9467, 35.9956], [126.9474, 35.9956], [126.9474, 35.9961], [126.9467, 35.9961], [126.9467, 35.9956]]]}


def hwang(aoi=None, **kw):
    return {"kind": "infer", "model_id": "car_v2_obb", "imagery_id": "axis-iksan-hwangdeung", "aoi": aoi or HWANG_AOI,
            "options": {"chip": 1024, "overlap": 0.125, "conf": 0.25}, "demo": False, "priority": 0, **kw}


def sleep_job(**opts):
    """개발 모드 테스트 어댑터(test/sleep · cpu) — 고아 감시 · plan 훅 · index.month 필드."""
    return {"kind": "index", "options": {"adapter": "test/sleep", **opts}, "demo": False, "priority": 0, "label": "pytest test/sleep"}


__all__ = ["sse", "wait_job", "submit", "hwang", "sleep_job", "HWANG_AOI", "HWANG_SMALL", "BASE", "B", "H"]
