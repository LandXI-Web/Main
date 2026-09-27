"""S6 · 실태조사 대조 작업 1회를 실제로 돌려 SSE 를 녹음 → 02. 데이터/survey/replay/survey-namwon.ndjson (F2-A off 모드 정본)

    python server/survey/pipelines/s6_replay_record.py [--api http://127.0.0.1:8700] [--login lx-staff]

POST /jobs {kind:'survey'} → GET /events/jobs/{id} 를 끝(job.done)까지 받아 한 줄 = {t, event, data} (t = 첫 이벤트 뒤 ms).
data 에 basis 'recorded' · recorded_at · source(job_id) 를 덧댄다(api-v1.js replay() 가 다시 'demo' 꼬리표를 붙인다).
녹음 끝에 job.done counts 가 정본(R1 4,140 · R2 15,651 · R3 20 · R4 33 · R5 464 · R6 564)과 다르면 파일을 쓰지 않는다.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from landxi_api import config  # noqa: E402
from survey.db import README_COUNTS, REPLAY_DIR  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--api", default=f"http://127.0.0.1:{config.API_PORT}")
    ap.add_argument("--login", default="lx-staff")
    ap.add_argument("--out", default=str(REPLAY_DIR / "survey-namwon.ndjson"))
    a = ap.parse_args()
    B = a.api.rstrip("/") + "/api/v1"
    tok = httpx.post(B + "/auth/login", json={"realm": "lx", "login": a.login, "password": config.DEV_PASSWORD}, timeout=30).json()["token"]
    H = {"authorization": "Bearer " + tok}
    body = {"kind": "survey", "survey_id": "farmland", "rules": ["R1", "R2", "R3", "R4", "R5", "R6"], "label": "F2-S 녹음 · 남원 39 읍면동"}
    q = httpx.post(B + "/jobs/quote", json=body, headers=H, timeout=60).json()
    print("quote shards", q.get("shards"), "eta", (q.get("eta_s") or {}).get("value"), flush=True)
    t_submit = time.time()
    j = httpx.post(B + "/jobs", json=body, headers=H, timeout=60).json()["job"]
    jid = j["id"]
    print("job", jid, flush=True)
    lines, t0 = [], None
    rec_at = time.strftime("%Y-%m-%dT%H:%M:%S+09:00")
    done = None
    with httpx.stream("GET", f"{B}/events/jobs/{jid}", params={"access_token": tok}, timeout=httpx.Timeout(120, read=120)) as r:
        ev, data = None, []
        for line in r.iter_lines():
            if line.startswith("event:"):
                ev = line[6:].strip()
            elif line.startswith("data:"):
                data.append(line[5:].strip())
            elif line == "" and ev:
                d = json.loads("\n".join(data) or "{}")
                now = time.time()
                try:     # 발행 시각(at · ms) 기준 — SSE 도착 시각은 연결 직후 백로그가 한꺼번에 와서 쓰지 않는다
                    import datetime as _dt
                    now = _dt.datetime.fromisoformat(d["at"]).timestamp()
                except Exception:
                    pass
                t0 = t0 or now
                d.update({"basis": "recorded", "recorded_at": rec_at, "source": f"{jid} (실제 실행 녹음)"})
                # 초 단위 at(job.queued/started)이 섞여도 파일 순서대로 단조 증가
                lines.append({"t": max(int((now - t0) * 1000), lines[-1]["t"] if lines else 0), "event": ev, "data": d})
                if ev == "shard.done":
                    print(f"  shard.done {d['shard_id']} n={d['n']} {d['ms']}ms", flush=True)
                if ev == "job.done":
                    done = d
                    break
                ev, data = None, []
    if not done:
        raise SystemExit("job.done 을 받지 못함")
    ok = done["counts"] == README_COUNTS["by_rule"]
    print("job.done counts", done["counts"], "= 정본" if ok else "≠ 정본", f"· 제출→끝 {time.time() - t_submit:.1f}s", flush=True)
    if not ok:
        raise SystemExit("정본과 다름 — 녹음 파일을 쓰지 않는다")
    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join(json.dumps(x, ensure_ascii=False) for x in lines) + "\n", encoding="utf-8")
    print(f"녹음 {len(lines)}줄 → {out}", flush=True)


if __name__ == "__main__":
    main()
