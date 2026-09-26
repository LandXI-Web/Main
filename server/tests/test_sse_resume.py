"""SSE 재개 — 한 번 끊고 Last-Event-ID(헤더)와 ?last_event_id= 로 이어 받으면 중복·누락이 없다(완료된 J1 스트림 재생)."""
import httpx
import pytest

from conftest import BASE, H


def read_events(url, headers, n):
    out = []
    ev = eid = None
    with httpx.stream("GET", url, headers=headers, timeout=httpx.Timeout(60, read=30)) as r:
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("text/event-stream")
        assert r.headers.get("x-accel-buffering") == "no" and "no-store" in r.headers.get("cache-control", "")
        for line in r.iter_lines():
            if line.startswith("event:"):
                ev = line[6:].strip()
            elif line.startswith("id:"):
                eid = line[3:].strip()
            elif line == "" and ev:
                out.append((eid, ev))
                ev = None
                if len(out) >= n:
                    break
    return out


def done_job(tok):
    items = httpx.get(BASE + "/api/v1/jobs?state=done&limit=200", headers=H(tok), timeout=30).json()["items"]
    j = next((x for x in items if x["model_id"] == "car_v2_obb"), None)
    if not j:
        pytest.skip("완료된 J1 없음")
    return j["id"]


def test_resume_header_and_query(live, tok):
    jid = done_job(tok["staff"])
    url = BASE + f"/api/v1/events/jobs/{jid}?access_token={tok['staff']}"
    full = read_events(url, {}, 60)
    first = read_events(url, {}, 20)
    assert first == full[:20]
    rest_h = read_events(url, {"last-event-id": first[-1][0]}, 40)
    assert rest_h == full[20:60]
    rest_q = read_events(url + f"&last_event_id={first[-1][0]}", {}, 40)
    assert rest_q == full[20:60]
    assert full[0][1] == "job.queued"


def test_sse_requires_token(live, tok):
    jid = done_job(tok["staff"])
    r = httpx.get(BASE + f"/api/v1/events/jobs/{jid}", timeout=30)
    assert r.status_code == 401
    r = httpx.get(BASE + f"/api/v1/events/jobs/{jid}?access_token={tok['gj']}", timeout=30)
    assert r.status_code in (403, 404)   # RLS: 다른 기관 작업은 존재를 드러내지 않는다
