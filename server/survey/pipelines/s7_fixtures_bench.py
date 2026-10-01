"""S7 · 계약 응답 예시(F2-A·F2-E off 모드 · server/survey/fixtures/survey-*.json) + API 지연 실측 표(p50/p95).

    python server/survey/pipelines/s7_fixtures_bench.py [--api http://127.0.0.1:8700] [--n 100] [--bench-out <json>]

픽스처는 실제 응답을 그대로 저장한다(목 아님 · 파일 머리 `_fixture` 에 출처·시각). 지연은 서버 헤더 X-LX-Time-ms(게이트웨이
미들웨어가 잰 요청 처리 시간) 와 클라이언트 왕복을 둘 다 적는다.
"""
from __future__ import annotations

import argparse
import json
import statistics
import sys
import time
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from landxi_api import config  # noqa: E402

FIX = Path(__file__).resolve().parents[1] / "fixtures"
CASES = {
    "survey-findings.json": "/survey/findings?rule=R1&priority=A&limit=5",
    "survey-finding.json": "/survey/findings/f_R1_5219045021110530012",
    "survey-parcel.json": "/survey/parcels/5219045021110530012?with=facts,findings,history",
    "survey-stats-emd.json": "/survey/stats?by=emd",
    "survey-rules.json": "/survey/rules",
    "survey-report-draft.json": "/survey/reports/draft?emd_cd=52190450&rule=R1&top=20&format=json",
}
BENCH = {
    "findings 200행(전체 · score)": "/survey/findings?limit=200",
    "findings 200행(R1·A)": "/survey/findings?rule=R1&priority=A&limit=200",
    "findings 200행(읍면동 · evid_m2)": "/survey/findings?emd_cd=52190450&sort=evid_m2&limit=200",
    "findings 200행(상태 open · R2 · offset 400)": "/survey/findings?state=open&rule=R2&limit=200&offset=400",
    "findings/{id} + explain + history": "/survey/findings/f_R2_5219033033113950012",
    "parcels/{pnu}?with=facts,findings,history": "/survey/parcels/5219045021110530012?with=facts,findings,history",
    "stats?by=emd": "/survey/stats?by=emd",
    "stats?by=rule": "/survey/stats?by=rule",
    "rules": "/survey/rules",
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--api", default=f"http://127.0.0.1:{config.API_PORT}")
    ap.add_argument("--n", type=int, default=100)
    ap.add_argument("--bench-out", default=None)
    ap.add_argument("--no-fixtures", action="store_true")
    a = ap.parse_args()
    B = a.api.rstrip("/") + "/api/v1"
    tok = httpx.post(B + "/auth/login", json={"realm": "tenant", "tenant_id": "namwon", "login": "lxadmin@lx.or.kr", "site": "gov",
                                              "password": config.DEV_PASSWORD}, timeout=30).json()["token"]
    H = {"authorization": "Bearer " + tok}
    cl = httpx.Client(headers=H, timeout=60)
    now = time.strftime("%Y-%m-%dT%H:%M:%S+09:00")
    if not a.no_fixtures:
        FIX.mkdir(parents=True, exist_ok=True)
        for name, path in CASES.items():
            r = cl.get(B + path)
            r.raise_for_status()
            body = r.json()
            body = {"_fixture": {"request": "GET /api/v1" + path, "realm": "tenant namwon-manager", "recorded_at": now,
                                 "note": "실제 응답 저장(목 아님) · F2-S s7"}, **body}
            (FIX / name).write_text(json.dumps(body, ensure_ascii=False, indent=1), encoding="utf-8")
            print("fixture", name, len(r.content), "B", flush=True)
    rows = []
    for label, path in BENCH.items():
        cl.get(B + path)            # 데움
        srv, rtt, size = [], [], 0
        for _ in range(a.n):
            t0 = time.perf_counter()
            r = cl.get(B + path)
            rtt.append((time.perf_counter() - t0) * 1000)
            srv.append(float(r.headers.get("x-lx-time-ms", "nan")))
            size = len(r.content)
        q = lambda xs, p: statistics.quantiles(xs, n=100)[p - 1]  # noqa: E731
        row = {"label": label, "path": path, "n": a.n, "bytes": size,
               "server_p50_ms": round(statistics.median(srv), 1), "server_p95_ms": round(q(srv, 95), 1),
               "rtt_p50_ms": round(statistics.median(rtt), 1), "rtt_p95_ms": round(q(rtt, 95), 1)}
        rows.append(row)
        print(f"{label:<44} 서버 p50 {row['server_p50_ms']:>6} · p95 {row['server_p95_ms']:>6} ms │ 왕복 p95 {row['rtt_p95_ms']:>6} ms │ {size:,} B",
              flush=True)
    out = {"measured_at": now, "api": a.api, "n_per_route": a.n, "basis": "measured",
           "source": "X-LX-Time-ms(게이트웨이 미들웨어) · httpx 왕복(127.0.0.1)", "rows": rows}
    if a.bench_out:
        Path(a.bench_out).write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
        print("bench →", a.bench_out)


if __name__ == "__main__":
    main()
