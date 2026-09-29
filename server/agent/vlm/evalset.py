"""평가셋 시작(c2-vlm-global 4) — 시군구별 의심 필지 N 곳의 영상 조각 + AI 비전 세 줄 + 사람 판정 칸(CSV).

  python -m agent.vlm.evalset --sgg 52190 --sgg 12130 --n 10 --out "<폴더>" [--no-vlm]

· 필지 고르기: 그 시군구 의심 필지를 규칙별로 번갈아(우선순위 순) — 등록 영상이 덮는 필지만.
· 비전 호출은 한 장씩 차례로(GPU1 vLLM · 전력 확인 · 영상 추론 작업과 겹치면 기다리거나 건너뜀 → vlm-gpu-log.jsonl).
· 정확도 숫자는 쓰지 않는다 — '사람 판정' 칸(맞음·오탐·모름)과 메모 칸은 비워 둔다.
· 이 평가의 토큰은 LX 사용량(usage_events · tenant lx · job 'vlm-evalset')에 남긴다.
"""
from __future__ import annotations

import argparse
import asyncio
import csv
import datetime as dt
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

KST = dt.timezone(dt.timedelta(hours=9))


def pick_parcels(conn, sgg: str, n: int) -> list[dict]:
    rows = conn.execute(
        "SELECT f.id, f.pnu, f.addr, f.rule, f.rule_nm, f.priority, f.jimok, f.evidence, f.img_date, f.evid_m2, f.parcel_m2 "
        "FROM survey_findings f WHERE f.sgg_cd=%s AND f.pnu IS NOT NULL ORDER BY f.rank NULLS LAST LIMIT 400", (sgg,)).fetchall()
    by: dict[str, list] = {}
    for r in rows:
        by.setdefault(r["rule"] or "?", []).append(r)
    out, seen = [], set()
    while len(out) < n * 3 and any(by.values()):
        for k in sorted(by):
            if by[k]:
                r = by[k].pop(0)
                if r["pnu"] not in seen:
                    seen.add(r["pnu"])
                    out.append(r)
    return out


async def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--sgg", action="append", required=True)
    ap.add_argument("--n", type=int, default=10)
    ap.add_argument("--out", required=True)
    ap.add_argument("--no-vlm", action="store_true")
    a = ap.parse_args(argv)
    import psycopg
    from psycopg.rows import dict_row
    from landxi_api import config as gcfg
    from landxi_api.catalog import resolve_set_path
    from agent.tools.ext.vlm import AI_CLS_OF_RULE
    from agent.vlm import call as VC
    from agent.vlm import crop as C
    from agent.vlm import prompt as VP
    out_dir = Path(a.out)
    img_dir = out_dir / "crops"
    img_dir.mkdir(parents=True, exist_ok=True)
    conn = psycopg.connect(gcfg.PG_ADMIN_DSN, row_factory=dict_row)
    rows_out, tokens = [], 0
    for sgg in a.sgg:
        got = 0
        for f in pick_parcels(conn, sgg, a.n):
            if got >= a.n:
                break
            p = conn.execute("SELECT ST_AsGeoJSON(geom) g, jimok_nm, jimok FROM survey_parcels WHERE pnu=%s LIMIT 1", (f["pnu"],)).fetchone()
            if not p or not p["g"]:
                continue
            geom = json.loads(p["g"])
            bb = C.padded_bbox(C.bbox_of(geom))
            srows = conn.execute(C.SQL_SOURCES.replace("$1", "%s").replace("$2", "%s").replace("$3", "%s").replace("$4", "%s"), bb).fetchall()
            srcs = C.sources_from_rows([dict(x) for x in srows], gcfg.DATA_ROOT, resolve_set_path)
            if not srcs:
                continue
            cls, ratio, year = None, None, None
            ev = f["evidence"]
            try:
                evj = json.loads(ev) if isinstance(ev, str) and ev.strip().startswith("{") else None
            except Exception:
                evj = None
            if evj and isinstance(evj.get("ai"), dict):
                cls, ratio, year = evj["ai"].get("cls"), evj["ai"].get("ratio"), evj["ai"].get("year")
            cls = cls or AI_CLS_OF_RULE.get(str(f["rule"] or "")[:2])
            if ratio is None and f["evid_m2"] and f["parcel_m2"]:
                ratio = float(f["evid_m2"]) / float(f["parcel_m2"])
            ai = [json.loads(x["g"]) for x in conn.execute(
                "SELECT d.cls, ST_AsGeoJSON(ST_Intersection(d.geom, s.geom)) g FROM detections d, survey_parcels s "
                "WHERE s.pnu=%s AND ST_Intersects(d.geom, s.geom) LIMIT 120", (f["pnu"],)).fetchall()
                  if x["g"] and (cls is None or str(x["cls"]).startswith(cls))]
            res = C.crop_views(srcs, geom, ai[:80], year or 2023)
            if not res.views:
                continue
            views = C.save_views(res, img_dir, f"{sgg}-{f['pnu'][-10:]}")
            got += 1
            row = {"no": len(rows_out) + 1, "시군구": sgg, "주소": f["addr"], "pnu": f["pnu"], "규칙": f"{f['rule']} {f['rule_nm'] or ''}".strip(),
                   "등급": f["priority"], "지목": p["jimok_nm"] or p["jimok"], "AI 클래스": cls, "영상 시점": " / ".join(v.source.label for v in views),
                   "조각": " / ".join(f"crops/{v.name}" for v in views), "AI 보이는 것": "", "AI 결과와 맞는지": "", "AI 오탐 가능성": "",
                   "AI 오탐 등급": "", "토큰": "", "사람 판정(맞음·오탐·모름)": "", "사람 메모": ""}
            if not a.no_vlm:
                labels = [v.source.label for v in views]
                sysm, user = VP.build({"jimok": row["지목"], "cls": cls, "ratio": ratio, "rule_nm": f["rule_nm"]}, labels,
                                      bool(views and views[0].ai_overlay), "ko")
                try:
                    vr = await VC.describe([v.png for v in views], user, system=sysm, run_id="vlm-evalset")
                    pr = VP.parse(vr.text, "ko", {x for lb in labels for x in __import__("re").findall(r"\d{4}", lb)})
                    row.update({"AI 보이는 것": pr["seen"], "AI 결과와 맞는지": pr["match"], "AI 오탐 가능성": pr["risk"],
                                "AI 오탐 등급": pr["risk_level"] or "", "토큰": vr.tokens})
                    tokens += vr.tokens
                except (VC.VlmBusy, VC.VlmUnavailable) as e:
                    row["AI 보이는 것"] = f"(비전 호출 안 함: {type(e).__name__})"
            rows_out.append(row)
            print(row["no"], row["주소"], row["AI 오탐 등급"], row["토큰"], flush=True)
    if tokens:
        try:
            conn.execute("INSERT INTO usage_events(tenant_id, dim, amount, job_id, basis) VALUES ('lx','llm_tokens',%s,'vlm-evalset','measured')", (tokens,))
            conn.commit()
        except Exception as e:  # noqa: BLE001
            print("usage_events 기록 실패", e)
    cols = list(rows_out[0].keys()) if rows_out else []
    with (out_dir / "evalset.csv").open("w", encoding="utf-8-sig", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=cols)
        w.writeheader()
        w.writerows(rows_out)
    (out_dir / "evalset.json").write_text(json.dumps({"at": dt.datetime.now(KST).isoformat(timespec="seconds"), "n": len(rows_out),
                                                      "tokens": tokens, "rows": rows_out}, ensure_ascii=False, indent=1), encoding="utf-8")
    return rows_out


if __name__ == "__main__":
    asyncio.run(main())
