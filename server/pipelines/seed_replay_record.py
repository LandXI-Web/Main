"""J1 실녹음 — 게이트웨이 SSE(/api/v1/events/jobs/{id})를 실제로 받아 계약 §5.1 리플레이 형식(ndjson: {t, event, data})으로 쓴다.

사용:
  python server/pipelines/seed_replay_record.py --submit j1            # 견적 → 제출 → SSE 녹음(직원 계정)
  python server/pipelines/seed_replay_record.py --job job_…            # 이미 제출된 작업 녹음(스트림 처음부터 재생 가능)
출력: server/fixtures/replay/j1-hwangdeung.ndjson (+ 녹음 요약 .json). t = job.queued 수신 시각 기준 ms(실측).
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from landxi_api import config  # noqa: E402

B = f"http://localhost:{config.API_PORT}/api/v1"
OUT = config.SERVER_ROOT / "fixtures" / "replay"
J1 = {"kind": "infer", "model_id": "car_v2_obb", "imagery_id": "axis-iksan-hwangdeung",
      "aoi": {"type": "Polygon", "coordinates": [[[126.9440, 35.9950], [126.9490, 35.9950], [126.9490, 35.9990], [126.9440, 35.9990], [126.9440, 35.9950]]]},
      "options": {"chip": 1024, "overlap": 0.125, "conf": 0.25}, "demo": False, "priority": 0, "label": "J1 익산 황등 1.36cm × 차량 OBB"}


def login(c: httpx.Client, role: str = "staff") -> str:
    r = c.post(B + "/auth/login", json={"realm": "lx", "login": f"lx-{role}", "password": config.DEV_PASSWORD})
    r.raise_for_status()
    return r.json()["token"]


def record(c: httpx.Client, tok: str, job_id: str, out: Path, t_submit: float | None = None, timeout: float = 600) -> dict:
    url = f"{B}/events/jobs/{job_id}?access_token={tok}"
    lines, t0, first_done, names = [], None, None, []
    ev, data, eid = None, None, None
    start = time.time()
    with c.stream("GET", url, timeout=httpx.Timeout(timeout, read=60)) as r:
        for raw in r.iter_lines():
            if raw.startswith(":"):
                continue
            if raw.startswith("event:"):
                ev = raw[6:].strip()
            elif raw.startswith("data:"):
                data = raw[5:].strip()
            elif raw.startswith("id:"):
                eid = raw[3:].strip()
            elif raw == "" and ev:
                now = time.time()
                if t0 is None:
                    t0 = t_submit or now
                d = json.loads(data or "{}")
                t = int((now - t0) * 1000)
                lines.append({"t": t, "event": ev, "data": d, "id": eid})
                names.append(ev)
                if ev == "shard.done" and first_done is None:
                    first_done = t
                if ev in ("snapshot.ready", "job.failed", "job.cancelled"):
                    break
                ev, data, eid = None, None, None
            if time.time() - start > timeout:
                break
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        for ln in lines:
            f.write(json.dumps({"t": ln["t"], "event": ln["event"], "data": ln["data"]}, ensure_ascii=False) + "\n")
    order = []
    for n in names:
        if not order or order[-1] != n:
            order.append(n)
    summ = {"job_id": job_id, "events": len(lines), "first_shard_done_ms": first_done,
            "t_end_ms": lines[-1]["t"] if lines else None, "order_compressed": order[:12] + (["…"] if len(order) > 12 else []) + order[-3:],
            "counts": {n: names.count(n) for n in sorted(set(names))}, "recorded_at": time.strftime("%Y-%m-%dT%H:%M:%S+09:00"),
            "source": "게이트웨이 SSE 실수신(httpx)"}
    out.with_suffix(".summary.json").write_text(json.dumps(summ, ensure_ascii=False, indent=1), encoding="utf-8")
    return summ


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--submit", choices=["j1"], default=None)
    ap.add_argument("--job", default=None)
    ap.add_argument("--role", default="staff")
    ap.add_argument("--demo", action="store_true")
    ap.add_argument("--out", default=str(OUT / "j1-hwangdeung.ndjson"))
    a = ap.parse_args()
    c = httpx.Client(timeout=60)
    tok = login(c, a.role)
    H = {"authorization": "Bearer " + tok}
    t_submit = None
    job_id = a.job
    if a.submit:
        body = dict(J1, demo=a.demo or a.role == "sales")
        q = c.post(B + "/jobs/quote", headers=H, json=body).json()
        print("quote", json.dumps({k: q[k] for k in ("area_km2", "shards", "gpu_s", "eta_s", "allowed", "reasons")}, ensure_ascii=False))
        t_submit = time.time()
        r = c.post(B + "/jobs", headers=H, json=body)
        r.raise_for_status()
        job_id = r.json()["job"]["id"]
        print("submitted", job_id)
    summ = record(c, tok, job_id, Path(a.out), t_submit)
    print(json.dumps(summ, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
