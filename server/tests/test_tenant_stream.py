"""v1.1-16 기관 스트림 GET /api/v1/events/tenant — deploy.changed(실 API) · job.state · finding.state(헬퍼) · usage.delta ·
24h 재생 · Last-Event-ID · 다른 기관 0건 · realm 관문."""
import json
import threading
import time

import httpx

from conftest import B, BASE, H
from workers import bus


def _collect(url, headers, stop_after_s, out):
    ev = eid = None
    t0 = time.time()
    try:
        with httpx.stream("GET", url, headers=headers, timeout=httpx.Timeout(stop_after_s + 10, read=stop_after_s + 5)) as r:
            out.append(("status", r.status_code, None, 0))
            for line in r.iter_lines():
                if line.startswith("event:"):
                    ev = line[6:].strip()
                elif line.startswith("id:"):
                    eid = line[3:].strip()
                elif line.startswith("data:") and ev:
                    out.append((ev, json.loads(line[5:]), eid, time.time()))
                    ev = None
                if line == "" and time.time() - t0 > stop_after_s:
                    break
    except httpx.ReadTimeout:
        pass


def _listen(tok, s=6, extra=""):
    out = []
    th = threading.Thread(target=_collect, args=(BASE + f"/api/v1/events/tenant?access_token={tok}{extra}", {}, s, out), daemon=True)
    th.start()
    time.sleep(1.2)
    return th, out


def test_guest_401_and_cross_tenant_403(live, tok):
    assert httpx.get(B + "/events/tenant", timeout=10).status_code == 401
    r = httpx.get(B + f"/events/tenant?access_token={tok['gj']}&tenant=namwon", timeout=10)
    assert r.status_code == 403
    r = httpx.get(B + f"/events/tenant?access_token={tok['namwon']}", headers={"origin": "http://evil.example"}, timeout=10)
    assert r.status_code == 403


def test_deploy_changed_arrives_within_1s_to_owner_only(live, tok):
    th_n, out_n = _listen(tok["namwon"], 10)
    th_g, out_g = _listen(tok["gj"], 10)
    th_x, out_x = _listen(tok["staff"], 10, "&tenant=namwon")     # LX 직원 세션(XI맵)이 남원 배포본 칩을 받는 경로
    cur = httpx.get(B + "/deploys/dp-nw-farm-25", headers=H(tok["admin"]), timeout=30).json()
    t_write = time.time()
    # 지금 버전 그대로 고정 → 원래 고정 상태로 되돌림(배포 상태는 바뀌지 않는다 · 쓰기 2회 = deploy.changed 2건)
    r = httpx.post(B + "/deploys/dp-nw-farm-25/pin", headers=H(tok["admin"]), json={"card_version_id": cur["card_version_id"]}, timeout=30)
    assert r.status_code == 200, r.text[:200]
    if not cur["pinned"]:
        httpx.post(B + "/deploys/dp-nw-farm-25/pin", headers=H(tok["admin"]), json={"card_version_id": None}, timeout=30)
    for th in (th_n, th_g, th_x):
        th.join(10)
    got = [(e, d, t) for e, d, _, t in out_n if e == "deploy.changed" and d.get("deploy_id") == "dp-nw-farm-25"]
    assert got, out_n
    assert got[0][2] - t_write <= 1.0, got[0][2] - t_write
    assert got[0][1]["tenant_id"] == "namwon" and got[0][1]["action"] == "pin"
    assert not [x for x in out_g if x[0] == "deploy.changed" and x[1].get("deploy_id") == "dp-nw-farm-25"]     # 다른 기관 0건
    assert [x for x in out_x if x[0] == "deploy.changed"]


def test_finding_state_helper_and_replay_and_last_event_id(live, tok):
    e1 = bus.tenant_event("namwon", "finding.state", {"id": "f_R1_pytest", "pnu": "5219025021100010000", "rule": "R1", "from": "open",
                                                      "to": "assigned", "by": "pytest"})
    e2 = bus.tenant_event("namwon", "usage.delta", {"dim": "gpu_s_month", "amount": 0.001, "job_id": "pytest"})
    assert e1 and e2
    out = []
    _collect(BASE + f"/api/v1/events/tenant?access_token={tok['namwon']}&replay=24h", {}, 3, out)
    evs = [x for x in out if x[0] != "status"]
    ids = [x[2] for x in evs]
    assert e1 in ids and e2 in ids
    fs = next(x[1] for x in evs if x[2] == e1)
    assert fs["tenant_id"] == "namwon" and fs["to"] == "assigned" and "at" in fs
    out2 = []
    _collect(BASE + f"/api/v1/events/tenant?access_token={tok['namwon']}", {"last-event-id": e1}, 3, out2)
    ids2 = [x[2] for x in out2 if x[0] != "status"]
    assert e1 not in ids2 and e2 in ids2
    # 다른 기관 스트림에는 없다
    out3 = []
    _collect(BASE + f"/api/v1/events/tenant?access_token={tok['gj']}&replay=24h", {}, 3, out3)
    assert e1 not in [x[2] for x in out3]


def test_job_state_mirrored_to_tenant_stream(live, tok):
    bus.ops_event("job.state", {"job_id": "job_PYTEST_MIRROR", "tenant_id": "namwon", "state": "running", "pool": "a6000", "at": bus.now_iso()})
    out = []
    _collect(BASE + f"/api/v1/events/tenant?access_token={tok['namwon']}&replay=1m&events=job.state", {}, 3, out)
    assert any(x[0] == "job.state" and x[1].get("job_id") == "job_PYTEST_MIRROR" for x in out)
    assert all(x[0] in ("status", "job.state") for x in out)
