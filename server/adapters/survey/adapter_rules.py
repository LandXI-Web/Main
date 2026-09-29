"""survey/rules — 실태조사 대조 작업 어댑터(F2-S · kind 'survey' · cpu · v1.1-9/22).

plan(job) → 읍면동 칸(shard_id 'emd-{법정동}') · 칸마다 PostGIS 에서 규칙 R1–R6 SQL(server/survey/rules.py · rules/*.yaml 임계
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


def fresh():
    """워커는 오래 산다 — survey.rules · survey.nation 이 바뀌었으면 다시 읽는다(어댑터 파일은 작업마다 새로 읽히지만 의존 모듈은 캐시된다)."""
    import importlib
    import sys as _s
    for name in ("survey.rules", "survey.nation"):
        m = _s.modules.get(name)
        if m is None:
            continue
        try:
            mt = Path(m.__file__).stat().st_mtime
        except Exception:
            continue
        if getattr(m, "_lx_mt", None) != mt:
            m = importlib.reload(m)
            m._lx_mt = mt


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
    """읍면동(법정동코드) 칸 — options.emd_cd · options.sgg_cd 로 좁힐 수 있다. bbox = 그 읍면동 필지 범위(스윕 칸).
    options.build = true(POST /survey/build) → 시군구 1칸(필지 적재 · AI 결합 · 규칙 · 의심 — survey/nation.py)."""
    from survey.db import pg, lx_tx
    o = _opts(job)
    fresh()
    if o.get("build"):
        from survey import nation as N
        rg = N.region(o.get("sgg_cd") or "")
        return [{"shard_id": f"sgg-{rg['sgg_cd']}", "bbox": [round(x, 6) for x in (rg.get("bbox") or [0, 0, 0, 0])],
                 "params": {"stage": "build", "sgg_cd": rg["sgg_cd"], "ai_job_id": o.get("ai_job_id"), "force": bool(o.get("force"))}}]
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
    sg = o.get("sgg_cd") or []
    if isinstance(sg, str):
        sg = [sg]
    with pg() as conn:
        lx_tx(conn)
        if not sg and not want and job.get("deploy_id"):     # 범위를 안 주면 그 배포본의 시군구(배포는 지역 하나에 묶인다)
            d = conn.execute("SELECT sgg_cd FROM deploys WHERE id = %s", (job["deploy_id"],)).fetchone()
            if d and d[0]:
                sg = [d[0]]
        rows = conn.execute("SELECT emd_cd, name, parcels, bbox FROM survey_emd WHERE (%s::text[] IS NULL OR sgg_cd = ANY(%s::text[])) "
                            "ORDER BY emd_cd", (sg or None, sg or None)).fetchall()
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
        fresh()
        if p.get("stage") == "build":
            return self._build(shard, p, opts)
        rules = p.get("rules") or _rules_of(opts)
        th = R.merge_thresholds(p.get("thresholds") or opts.get("thresholds"))
        t0 = time.perf_counter()
        c = self._c()
        try:
            lx_tx(c)
            sgg = p["emd_cd"][:5]
            ss = c.execute("SELECT s.job_id, s.tenant_id, s.priority_cut, EXISTS(SELECT 1 FROM survey_parcels x WHERE x.sgg_cd = s.sgg_cd "
                           "AND x.src = 'canon') FROM survey_sgg s WHERE s.sgg_cd = %s", (sgg,)).fetchone()
            canon = ss is None or ss[3]
            tenant = (ss[1] if ss else None) or "lx"
            if canon:
                if self.cut is None:
                    v = c.execute("SELECT value FROM survey_meta WHERE key='priority_cut'").fetchone()
                    self.cut = v[0] if v else {"A": 76.4, "B": 65.5}
                cut = self.cut
                rows = c.execute(R.eval_sql(th, rules), {"emd_cd": p["emd_cd"]}).fetchall()
            else:            # 전국 경로 — 그 시군구 AI 작업의 결합(survey_parcel_ai) · 등급 절단은 그 시군구 것
                cut = ss[2] or {"A": float("inf"), "B": float("inf")}
                rows = c.execute(R.eval_sql_ai(th, rules, emd_cd=True), {"emd_cd": p["emd_cd"], "sgg": sgg, "job": ss[0]}).fetchall()
            q_ms = int((time.perf_counter() - t0) * 1000)
            classes = {r: 0 for r in rules}
            for rr in rows:
                classes[rr[0]] += 1
            scored = sorted(((round(rr[5], 1), rr[0], rr[1], rr[3]) for rr in rows), key=lambda x: -x[0])
            top = [{"pnu": pnu, "rule": rule, "priority": R.priority_of(s, cut), "score": s,
                    "evid_m2": round(a, 1) if a is not None else None} for s, rule, pnu, a in scored[:3]]
            ms = int((time.perf_counter() - t0) * 1000)
            job_id = opts.get("job_id") or shard.job_id
            c.execute("INSERT INTO survey_runs(job_id, tenant_id, sgg_cd, rules, thresholds, counts, ms_by_emd) VALUES (%s,%s,%s,%s,%s,%s,%s) "
                      "ON CONFLICT (job_id) DO UPDATE SET counts = survey_runs.counts || EXCLUDED.counts, "
                      "ms_by_emd = survey_runs.ms_by_emd || EXCLUDED.ms_by_emd",
                      (job_id, tenant, sgg, json.dumps(rules), json.dumps(th), json.dumps({p["emd_cd"]: classes}),
                       json.dumps({p["emd_cd"]: {"ms": ms, "sql_ms": q_ms, "name": p.get("name"), "n": len(rows)}}, ensure_ascii=False)))
            c.commit()
        except Exception:
            c.rollback()
            raise
        ev = [{"event": "survey.finding", "data": {"emd_cd": p["emd_cd"], "name": p.get("name"), "top": top,
                                                   "basis": "inferred", "note": "규칙 재평가 · 검수 전 · 위법 판정 아님"}}]
        return ShardResult(features=[], metrics={"classes": classes, "events": ev, "ms": ms, "sql_ms": q_ms, "emd_cd": p["emd_cd"],
                                                 "name": p.get("name"), "parcels": p.get("parcels")}, n=len(rows), ms=ms)

    def _build(self, shard, p: dict, opts: dict):
        """시군구 1칸 — survey/nation.build(필지 적재 · AI 결합 · 규칙 · 의심). 긴 작업이라 비행 기록을 20초마다 갱신(고아 감시 오판 방지)
        · 단계마다 survey.progress 이벤트."""
        import threading
        from adapters.base import ShardResult
        from survey import nation as N
        job_id = opts.get("job_id") or shard.job_id
        stop = threading.Event()
        try:
            from workers import bus
        except Exception:                      # 시험(워커 밖)
            bus = None

        def keepalive():
            while not stop.wait(20):
                if bus:
                    try:
                        bus.inflight_touch("cpu", job_id, shard.id)
                    except Exception:
                        pass

        last = {"t": 0.0}

        def progress(stage, done, total, note=None):
            if not bus or (time.time() - last["t"] < 1.0 and done < total):
                return
            last["t"] = time.time()
            try:
                bus.emit(job_id, "survey.progress", {"job_id": job_id, "sgg_cd": p["sgg_cd"], "stage": stage, "done": done, "total": total,
                                                     "note": note, "at": bus.now_iso(ms=True)})
            except Exception:
                pass

        th = threading.Thread(target=keepalive, daemon=True)
        th.start()
        t0 = time.perf_counter()
        try:
            out = N.build(p["sgg_cd"], p.get("ai_job_id"), build_job_id=job_id, progress=progress, force=bool(p.get("force")))
        finally:
            stop.set()
        ms = int((time.perf_counter() - t0) * 1000)
        c = out["counts"]
        return ShardResult(features=[], metrics={"classes": c.get("by_rule") or {}, "build": out, "ms": ms, "sgg_cd": out["sgg_cd"],
                                                 "events": [{"event": "survey.built", "data": {"sgg_cd": out["sgg_cd"], "counts": c,
                                                                                               "state": out["state"]}}]},
                           n=int(c.get("findings") or 0), ms=ms)

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
    if o.get("build"):
        return _finalize_build(job, o)
    with pg() as conn:
        lx_tx(conn)
        row = conn.execute("SELECT rules, thresholds, counts, ms_by_emd FROM survey_runs WHERE job_id=%s", (job.get("id"),)).fetchone()
        sg = o.get("sgg_cd") or []
        sg = [sg] if isinstance(sg, str) else list(sg)
        n_emd = conn.execute("SELECT count(*) FROM survey_emd WHERE (%s::text[] IS NULL OR sgg_cd = ANY(%s::text[]))",
                             (sg or None, sg or None)).fetchone()[0]
        canon_only = conn.execute("SELECT count(*) = 1 AND bool_and(parcels_src ? 'canon') FROM survey_sgg WHERE (%s::text[] IS NULL OR sgg_cd = ANY(%s::text[]))",
                                  (sg or None, sg or None)).fetchone()[0]
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
    if default and full and canon_only:
        out["survey"]["canon"] = {"equal": tot == CANON, "expected_total": 20872, "source": "02. 데이터/survey/README.md 표"}
    return out


def _finalize_build(job: dict, o: dict) -> dict:
    """적재 작업 마감 — survey_sgg 한 행 → counts + survey.done(작업 · ops · 기관 스트림 · contract-parcel-ai.md §3)."""
    from survey import nation as N
    from survey.db import lx_tx, pg
    sgg = N.region(o.get("sgg_cd") or "")["sgg_cd"]
    with pg() as conn:
        lx_tx(conn)
        r = conn.execute("SELECT tenant_id, job_id, state, parcels, joined_parcels, findings, by_rule, by_priority, error FROM survey_sgg "
                         "WHERE sgg_cd=%s", (sgg,)).fetchone()
    if not r:
        return {}
    tenant, ai_job, state, parcels, joined, nf, by_rule, by_pr, err = r
    counts = {"parcels": int(parcels or 0), "joined_parcels": int(joined or 0), "findings": int(nf or 0),
              "by_rule": by_rule or {}, "by_priority": by_pr or {}}
    data = {"sgg_cd": sgg, "tenant_id": tenant, "job_id": job.get("id"), "ai_job_id": ai_job, "state": state, "counts": counts,
            "at": time.strftime("%Y-%m-%dT%H:%M:%S+09:00")}
    if err:
        data["error"] = err
    try:
        from workers import bus
        bus.emit(job.get("id"), "survey.done", data)
        bus.ops_event("survey.done", data)
        bus.tenant_event(tenant, "survey.done", data)
    except Exception:
        pass
    return {"counts": {k: int(v) for k, v in (by_rule or {}).items()},        # 합 = 의심 건수(job.done counts_env)
            "survey": {"sgg_cd": sgg, "tenant_id": tenant, "ai_job_id": ai_job, "state": state, **counts}}
