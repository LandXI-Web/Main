#!/usr/bin/env python
"""사용 기록 다시 세어 보기(정리 작업 10-01 · 확인 요청 11차 '확인 없이 고칠 고장' ①②③) — 기본은 **보기만**(SELECT).

계량은 10-01 정리 작업부터 새 규칙으로 쓴다(workers/metering.py):
  ② 귀속 = 분석을 요청한 기관(작업을 낸 기관 · LX 가 돌린 것은 'lx') — 예전엔 겹치는 가장 좁은 배포본 기관으로 짐작해 이웃 기관 몫으로 적혔다.
  ① 넓이 = 실제로 분석한 땅(시군구 전역 = 견적의 '읍면동 ∩ 영상' 넓이) — 예전엔 범위의 바깥 테두리(바다 포함)로 쟀다.
  ③ 학습 GPU 시간 = 학습 끝에 한 줄 — 예전엔 기록이 없었다.
지난 기록(usage_events)은 고치지 않는 것이 원칙이다. 이 도구는 지난 기록을 새 규칙으로 다시 세면 어떻게 달라지는지 **보여 주기만** 한다.
사용자가 지난 기록도 고치기로 정했을 때만 --write 로 쓴다(기간을 반드시 준다 · 바꾼 행은 audit_log 'usage.recount' 에 남긴다).

  python server/ops/recount_usage.py                              # 이번 달 · 보기만
  python server/ops/recount_usage.py --since 2026-09-01 --until 2026-10-01
  python server/ops/recount_usage.py --since 2026-09-01 --until 2026-10-01 --json
  python server/ops/recount_usage.py --since 2026-09-01 --until 2026-10-01 --write          # 귀속 · 넓이만 고쳐 쓴다
  python server/ops/recount_usage.py --since 2026-09-01 --until 2026-10-01 --write --train  # + 학습 GPU 시간 추정 행(basis estimate)
학습 시간은 DB 에 전력 규칙 대기 시간이 없어 '시작 → 끝' 벽시계로만 추정한다(basis 'estimate' — 실측 행과 구분).
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from landxi_api import config  # noqa: E402
from workers.metering import OWNER_EXPR  # noqa: E402

KST = dt.timezone(dt.timedelta(hours=9))


def _period(a) -> tuple[dt.datetime, dt.datetime]:
    now = dt.datetime.now(KST)
    since = dt.datetime.fromisoformat(a.since).replace(tzinfo=KST) if a.since else now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    until = dt.datetime.fromisoformat(a.until).replace(tzinfo=KST) if a.until else now + dt.timedelta(seconds=1)
    return since, until


def owner_moves(c, since, until) -> list[dict]:
    """② 기록된 기관 ≠ 분석을 요청한 기관 — (기록 → 새 규칙, dim) 별 합."""
    rows = c.execute(
        f"SELECT u.tenant_id AS was, ({OWNER_EXPR}) AS now_, u.dim, count(*), sum(u.amount) FROM usage_events u JOIN jobs j ON j.id = u.job_id "
        "WHERE u.at >= %s AND u.at < %s AND u.dim IN ('gpu_s','area_km2') AND u.tenant_id <> 'lx-demo' "
        f"AND u.tenant_id <> ({OWNER_EXPR}) GROUP BY 1, 2, 3 ORDER BY 5 DESC", (since, until)).fetchall()
    return [{"기록": r[0], "새 규칙": r[1], "항목": r[2], "행": int(r[3]), "합": round(float(r[4] or 0), 3)} for r in rows]


def area_fixes(c, since, until) -> list[dict]:
    """① 시군구 전역 작업의 넓이 — 기록(바깥 테두리) vs 견적의 실제 분석 땅(options.area_km2)."""
    rows = c.execute(
        "SELECT u.id, u.job_id, u.tenant_id, u.amount, (j.options->>'area_km2')::float FROM usage_events u JOIN jobs j ON j.id = u.job_id "
        "WHERE u.at >= %s AND u.at < %s AND u.dim = 'area_km2' AND j.options->>'scope' = 'sgg' AND j.options ? 'area_km2' "
        "AND abs(u.amount - (j.options->>'area_km2')::float) > 0.01 ORDER BY u.amount DESC", (since, until)).fetchall()
    return [{"행": int(r[0]), "작업": r[1], "기관": r[2], "기록 ㎢": round(float(r[3]), 2), "실제 분석 땅 ㎢": round(float(r[4]), 2)} for r in rows]


def train_missing(c, since, until) -> list[dict]:
    """③ 학습 작업 가운데 GPU 시간 기록이 없는 것 — 시작 → 끝 벽시계(전력 대기 포함 · 추정)."""
    rows = c.execute(
        "SELECT j.id, j.tenant_id, j.state, extract(epoch FROM (j.finished_at - j.started_at)) FROM jobs j "
        "WHERE j.kind = 'train' AND j.created_at >= %s AND j.created_at < %s AND j.started_at IS NOT NULL AND j.finished_at IS NOT NULL "
        "AND NOT EXISTS (SELECT 1 FROM usage_events u WHERE u.job_id = j.id AND u.dim = 'gpu_s') ORDER BY j.created_at", (since, until)).fetchall()
    return [{"작업": r[0], "기관": r[1], "상태": r[2], "추정 GPU 초": round(float(r[3] or 0), 1)} for r in rows]


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="사용 기록 다시 세어 보기(기본 보기만)")
    ap.add_argument("--since", help="시작(포함) YYYY-MM-DD — 없으면 이번 달 1일")
    ap.add_argument("--until", help="끝(제외) YYYY-MM-DD — 없으면 지금")
    ap.add_argument("--json", action="store_true", help="결과를 JSON 한 덩어리로")
    ap.add_argument("--write", action="store_true", help="고쳐 쓴다(귀속 · 넓이) — --since · --until 필수")
    ap.add_argument("--train", action="store_true", help="--write 와 함께: 학습 GPU 시간 추정 행을 더한다(basis estimate)")
    a = ap.parse_args(argv)
    if a.write and not (a.since and a.until):
        print("--write 는 --since 와 --until 을 함께 주어야 합니다(기간을 분명히).", file=sys.stderr)
        return 2
    since, until = _period(a)
    import psycopg
    from psycopg.types.json import Jsonb
    with psycopg.connect(config.PG_ADMIN_DSN) as c:
        c.execute("SELECT set_config('app.realm','lx',false), set_config('app.tenant_id','',false)")
        out = {"기간": [since.isoformat(timespec="seconds"), until.isoformat(timespec="seconds")],
               "귀속(②)": owner_moves(c, since, until), "넓이(①)": area_fixes(c, since, until), "학습(③)": train_missing(c, since, until),
               "쓰기": bool(a.write)}
        if a.write:
            n1 = c.execute(f"UPDATE usage_events u SET tenant_id = ({OWNER_EXPR}) FROM jobs j WHERE j.id = u.job_id AND u.at >= %s AND u.at < %s "
                           f"AND u.dim IN ('gpu_s','area_km2') AND u.tenant_id <> 'lx-demo' AND u.tenant_id <> ({OWNER_EXPR})", (since, until)).rowcount
            n2 = c.execute("UPDATE usage_events u SET amount = (j.options->>'area_km2')::float FROM jobs j WHERE j.id = u.job_id AND u.at >= %s "
                           "AND u.at < %s AND u.dim = 'area_km2' AND j.options->>'scope' = 'sgg' AND j.options ? 'area_km2' "
                           "AND abs(u.amount - (j.options->>'area_km2')::float) > 0.01", (since, until)).rowcount
            n3 = 0
            if a.train:
                for t in out["학습(③)"]:
                    if t["추정 GPU 초"] > 0:
                        c.execute("INSERT INTO usage_events(tenant_id, dim, amount, job_id, basis) VALUES (%s,'gpu_s',%s,%s,'estimate')",
                                  (t["기관"], t["추정 GPU 초"], t["작업"]))
                        n3 += 1
            c.execute("INSERT INTO audit_log(actor, realm, action, subject, after) VALUES ('system','system','usage.recount',%s,%s)",
                      (f"{since.date()}~{until.date()}", Jsonb({"owner_rows": n1, "area_rows": n2, "train_rows": n3})))
            c.commit()
            out["쓴 행"] = {"귀속": n1, "넓이": n2, "학습": n3}
        else:
            c.rollback()
    if a.json:
        print(json.dumps(out, ensure_ascii=False, indent=1, default=str))
        return 0
    print(f"기간 {out['기간'][0]} ~ {out['기간'][1]} · {'고쳐 씀' if a.write else '보기만(DB 는 바꾸지 않음)'}")
    print(f"② 귀속이 달라지는 기록 {len(out['귀속(②)'])}묶음")
    for r in out["귀속(②)"]:
        print(f"   {r['기록']} → {r['새 규칙']} · {r['항목']} {r['행']}행 · 합 {r['합']:,}")
    print(f"① 넓이가 달라지는 시군구 전역 기록 {len(out['넓이(①)'])}행")
    for r in out["넓이(①)"][:20]:
        print(f"   {r['작업']} · {r['기관']} · 기록 {r['기록 ㎢']:,}㎢ → 실제 {r['실제 분석 땅 ㎢']:,}㎢")
    print(f"③ GPU 시간 기록이 없는 학습 {len(out['학습(③)'])}건")
    for r in out["학습(③)"]:
        print(f"   {r['작업']} · {r['기관']} · {r['상태']} · 추정 {r['추정 GPU 초']:,}초")
    if a.write:
        print("쓴 행:", out["쓴 행"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
