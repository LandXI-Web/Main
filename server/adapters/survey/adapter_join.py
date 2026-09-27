"""survey/join — 2023 P4(detections 'results/lx/namwon-landcover-2023') × survey_parcels 재결합 어댑터 뼈대(F2-S · kind 'join').

1차 범위(브리프 §4): 뼈대 + 단위 테스트. plan(job) = 읍면동 39칸 · run_shard = 그 읍면동 필지와 AI 폴리곤을 PostGIS 에서 다시
교차(EPSG:5186 면적 · 객체 과반 포함 · 신뢰도 ≥ 0.5)해 적재값(survey_parcels a23_*)과 대조한 차이만 낸다 — **쓰기 없음**.
전역 재결합(적재값 교체 · 새 추론 결과 반영)은 2차 확산. `hidden: True` — kind 'join' 자동 선택에서 빠진다(죽은 버튼 0).
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

ADAPTER = {"id": "survey/join", "kinds": ["join"], "device": "cpu", "pool": "cpu", "input": "params", "output": "metrics",
           "models": [], "owner": "F2-S", "hidden": True, "stage": "skeleton"}

SOURCE_SET = "results/lx/namwon-landcover-2023"
CLS = {"건물": "bld", "경작지": "crop", "주차장": "park", "비닐하우스": "gh"}

SQL = """
WITH p AS (SELECT pnu, geom, ST_Transform(geom, 5186) g5 FROM survey_parcels WHERE emd_cd = %(emd_cd)s),
d AS (SELECT d.id, d.cls, d.conf, ST_Transform(ST_MakeValid(d.geom), 5186) g5 FROM detections d
      WHERE d.job_id = %(set)s AND d.geom && (SELECT ST_Extent(geom) FROM p)),
x AS (SELECT p.pnu, d.cls, d.conf, ST_Area(ST_Intersection(d.g5, p.g5)) inter, ST_Area(d.g5) oarea
      FROM d JOIN p ON ST_Intersects(d.g5, p.g5))
SELECT pnu, cls, sum(inter) m2,
       sum(inter) FILTER (WHERE inter / NULLIF(oarea, 0) >= %(frac)s AND conf >= %(conf)s) in_m2
FROM x WHERE inter > 0.01 GROUP BY 1, 2
"""


def plan(job: dict) -> list[dict]:
    from adapters.survey.adapter_rules import plan as rules_plan
    return [{**s, "params": {**s["params"], "source_set": (job.get("options") or {}).get("source_set", SOURCE_SET)}} for s in rules_plan(job)]


def finalize(job: dict) -> dict:
    """작업 마감 훅(cpu_worker.finalize_cpu) — 셔드 metrics 를 모아 counts {joined_parcels, parcels}(lx-ingest '결합률 = /jobs/{id}').
    결합률 = joined_parcels / parcels(AI 폴리곤이 하나라도 겹친 필지 / 읍면동 필지 전체) — 화면이 봉투로 나눈다."""
    from survey.db import lx_tx, pg
    jid = job.get("id") or job.get("job_id")
    with pg() as c:
        lx_tx(c)
        rows = c.execute("SELECT metrics FROM index_results WHERE job_id=%s", (jid,)).fetchall()
    parcels = joined = 0
    for (m,) in rows:
        m = m or {}
        parcels += int(m.get("parcels") or 0)
        joined += int(m.get("joined_parcels") or 0)
    return {"counts": {"joined_parcels": joined, "parcels": parcels}}


class Adapter:
    def load(self, model: dict, device: str = "cpu", vram_budget_mib: int = 0):
        return None

    def run_shard(self, shard, read=None, opts: dict | None = None):
        from adapters.base import ShardResult
        from survey.db import lx_tx, pg
        p = shard.params or {}
        t0 = time.perf_counter()
        with pg() as c:
            lx_tx(c)
            rows = c.execute(SQL, {"emd_cd": p["emd_cd"], "set": p.get("source_set", SOURCE_SET), "frac": 0.5, "conf": 0.5}).fetchall()
            got: dict = {}
            for pnu, cls, m2, in_m2 in rows:
                k = CLS.get(cls, cls)
                got.setdefault(pnu, {})[k] = (m2 or 0.0, in_m2 or 0.0)
            ref = {r[0]: r[1:] for r in c.execute(
                "SELECT pnu, a23_bld_m2, a23_crop_m2, a23_park_m2, a23_gh_m2, a23_bld_in_m2, a23_park_in_m2, a23_gh_in_m2 "
                "FROM survey_parcels WHERE emd_cd=%s", (p["emd_cd"],)).fetchall()}
        diff_max = 0.0
        n_diff = 0
        for pnu, r in ref.items():
            g = got.get(pnu, {})
            cand = [abs(g.get(k, (0, 0))[0] - (r[i] or 0)) for i, k in enumerate(("bld", "crop", "park", "gh"))] + \
                   [abs(g.get(k, (0, 0))[1] - (r[4 + i] or 0)) for i, k in enumerate(("bld", "park", "gh"))]
            m = max(cand)
            diff_max = max(diff_max, m)
            n_diff += m > 0.5
        ms = int((time.perf_counter() - t0) * 1000)
        return ShardResult(features=[], metrics={"parcels": len(ref), "joined_parcels": sum(1 for pn in ref if pn in got),
                                                 "pairs": len(rows), "diff_max_m2": round(diff_max, 3),
                                                 "parcels_diff_gt_0_5m2": n_diff, "ms": ms, "write": False,
                                                 "note": "뼈대 — 재결합 대조만(적재값 교체는 2차)"}, n=len(rows), ms=ms)

    def unload(self):
        return None
