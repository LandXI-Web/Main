"""survey/rules — 실태조사 대조 작업 어댑터(F2-S · kind 'survey' · cpu · v1.1-9/22).

plan(job) → 읍면동 39칸(shard_id 'emd-52190250') · 칸마다 PostGIS 에서 규칙 R1–R6 SQL(server/survey/rules.py · rules/*.yaml 임계
· job.options.thresholds 오버라이드 허용)로 그 읍면동 필지를 재평가 → survey_runs 에 칸 결과 → ShardResult(metrics.classes{R1..R6} ·
metrics.events[survey.finding 상위 3]) — cpu_worker 가 shard.done{n, classes, ms} · survey.finding · job.progress 를 낸다.
finalize(job) → counts(규칙별) + 정본 대조(기본 임계 · 39칸 · R1–R6 이면 20,872 와 같아야 한다).
모델 추론 아님 · GPU 사용 0.
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))       # server/

ADAPTER = {"id": "survey/rules", "kinds": ["survey"], "device": "cpu", "pool": "cpu", "input": "params", "output": "metrics",
           "models": ["survey/rules"], "owner": "F2-S", "shards": "emd"}

CANON = {"R1": 4140, "R2": 15651, "R3": 20, "R4": 33, "R5": 464, "R6": 564}
ALL_RULES = ["R1", "R2", "R3", "R4", "R5", "R6"]


def _opts(job: dict) -> dict:
    o = job.get("options") or {}
    if isinstance(o, str):
        o = json.loads(o or "{}")
    return o


def _rules_of(o: dict) -> list[str]:
    rs = o.get("rules") or ALL_RULES
    rs = [r for r in rs if r in ALL_RULES]
    return rs or ALL_RULES


def plan(job: dict) -> list[dict]:
    """읍면동(법정동코드) 39칸 — options.emd_cd 로 좁힐 수 있다. bbox = 그 읍면동 필지 범위(스윕 칸)."""
    from survey.db import pg, lx_tx
    o = _opts(job)
    # 견적 단계에서 거절(F2-S must_fix): 모르는 규칙 id · 임계 키/값 오류를 조용히 전 규칙으로 바꾸지 않는다 → 계약 v1.1-22 rule_requires_missing 400
    rs = o.get("rules")
    if rs is not None:
        rs = [rs] if isinstance(rs, str) else list(rs)
        bad = [r for r in rs if r not in ALL_RULES]
        if bad or not rs:
            raise ValueError(f"rule_requires_missing: 모르는 규칙 {bad or '(빈 목록)'} — {'·'.join(ALL_RULES)} 중에서")
    if o.get("thresholds"):
        from survey import rules as R
        try:
            R.merge_thresholds(o.get("thresholds"))
        except ValueError as e:
            raise ValueError(f"rule_requires_missing: {e}") from None
    want = o.get("emd_cd") or []
    if isinstance(want, str):
        want = [want]
    with pg() as conn:
        lx_tx(conn)
        rows = conn.execute("SELECT emd_cd, name, parcels, bbox FROM survey_emd ORDER BY emd_cd").fetchall()
    if not rows:
        raise RuntimeError("survey_emd 비어 있음 — s5_load_pg.py 적재 전")
    out = []
    for cd, name, n, bbox in rows:
        if want and cd not in want:
            continue
        out.append({"shard_id": f"emd-{cd}", "bbox": [round(x, 6) for x in (bbox or [0, 0, 0, 0])],
                    "params": {"emd_cd": cd, "name": name, "parcels": n, "rules": _rules_of(o), "thresholds": o.get("thresholds") or {}}})
    return out


class Adapter:
    def __init__(self):
        self.cut = None
        self.conn = None

    def load(self, model: dict, device: str = "cpu", vram_budget_mib: int = 0):
        return None

    def _c(self):
        from survey.db import pg
        if self.conn is None or self.conn.closed:
            self.conn = pg()
        return self.conn

    def run_shard(self, shard, read=None, opts: dict | None = None):
        from adapters.base import ShardResult
        from survey import rules as R
        from survey.db import lx_tx
        opts = opts or {}
        p = shard.params or {}
        rules = p.get("rules") or _rules_of(opts)
        th = R.merge_thresholds(p.get("thresholds") or opts.get("thresholds"))
        t0 = time.perf_counter()
        c = self._c()
        try:
            lx_tx(c)
            if self.cut is None:
                v = c.execute("SELECT value FROM survey_meta WHERE key='priority_cut'").fetchone()
                self.cut = v[0] if v else {"A": 76.4, "B": 65.5}
            rows = c.execute(R.eval_sql(th, rules), {"emd_cd": p["emd_cd"]}).fetchall()
            q_ms = int((time.perf_counter() - t0) * 1000)
            classes = {r: 0 for r in rules}
            for rr in rows:
                classes[rr[0]] += 1
            scored = sorted(((round(rr[5], 1), rr[0], rr[1], rr[3]) for rr in rows), key=lambda x: -x[0])
            top = [{"pnu": pnu, "rule": rule, "priority": R.priority_of(s, self.cut), "score": s,
                    "evid_m2": round(a, 1) if a is not None else None} for s, rule, pnu, a in scored[:3]]
            ms = int((time.perf_counter() - t0) * 1000)
            job_id = opts.get("job_id") or shard.job_id
            c.execute("INSERT INTO survey_runs(job_id, tenant_id, rules, thresholds, counts, ms_by_emd) VALUES (%s,'namwon',%s,%s,%s,%s) "
                      "ON CONFLICT (job_id) DO UPDATE SET counts = survey_runs.counts || EXCLUDED.counts, "
                      "ms_by_emd = survey_runs.ms_by_emd || EXCLUDED.ms_by_emd",
                      (job_id, json.dumps(rules), json.dumps(th), json.dumps({p["emd_cd"]: classes}),
                       json.dumps({p["emd_cd"]: {"ms": ms, "sql_ms": q_ms, "name": p.get("name"), "n": len(rows)}}, ensure_ascii=False)))
            c.commit()
        except Exception:
            c.rollback()
            raise
        ev = [{"event": "survey.finding", "data": {"emd_cd": p["emd_cd"], "name": p.get("name"), "top": top,
                                                   "basis": "inferred", "note": "규칙 재평가 · 검수 전 · 위법 판정 아님"}}]
        return ShardResult(features=[], metrics={"classes": classes, "events": ev, "ms": ms, "sql_ms": q_ms, "emd_cd": p["emd_cd"],
                                                 "name": p.get("name"), "parcels": p.get("parcels")}, n=len(rows), ms=ms)

    def unload(self):
        if self.conn is not None:
            self.conn.close()
            self.conn = None


def make_adapter():
    return Adapter()


def finalize(job: dict) -> dict:
    """job.done 에 붙는 것 — counts(규칙별 · survey_runs 합) · 정본 대조 · 칸당 ms 실측(중앙값·최대)."""
    from survey.db import pg, lx_tx
    import statistics
    o = _opts(job)
    with pg() as conn:
        lx_tx(conn)
        row = conn.execute("SELECT rules, thresholds, counts, ms_by_emd FROM survey_runs WHERE job_id=%s", (job.get("id"),)).fetchone()
        n_emd = conn.execute("SELECT count(*) FROM survey_emd").fetchone()[0]
        if row:
            conn.execute("UPDATE survey_runs SET finished_at=now() WHERE job_id=%s", (job.get("id"),))
            conn.commit()
    if not row:
        return {}
    rules, th, cnt, ms = row
    tot = {r: 0 for r in rules}
    for v in cnt.values():
        for r, n in v.items():
            tot[r] = tot.get(r, 0) + n
    from survey import rules as R
    default = th == R.default_thresholds()
    full = len(cnt) == n_emd and sorted(rules) == ALL_RULES and not o.get("emd_cd")
    msv = [v["ms"] for v in ms.values()]
    env = lambda v, u, b, s, note=None: {"value": v, "unit": u, "basis": b, "as_of": time.strftime("%Y-%m-%dT%H:%M:%S+09:00"),  # noqa: E731
                                         "source": s, **({"note": note} if note else {})}
    out = {"counts": tot,
           "survey": {"emd_done": len(cnt), "rules": rules, "default_thresholds": default,
                      "total": env(sum(tot.values()), "count", "inferred", "survey_runs 합", "규칙 재평가 · 검수 전 · 위법 판정 아님"),
                      "shard_ms_p50": env(int(statistics.median(msv)) if msv else None, "ms", "measured", "survey_runs.ms_by_emd 중앙값"),
                      "shard_ms_max": env(max(msv) if msv else None, "ms", "measured", "survey_runs.ms_by_emd 최대")}}
    if default and full:
        out["survey"]["canon"] = {"equal": tot == CANON, "expected_total": 20872, "source": "02. 데이터/survey/README.md 표"}
    return out
