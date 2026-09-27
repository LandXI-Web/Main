"""S5 · 실태조사 정본 → PostGIS 적재(멱등) + 검증 → findings-emd.json (F2-S · v1.1-22)

    python server/survey/pipelines/s5_load_pg.py              # 마이그레이션 → 적재 → 검증 → findings-emd.json
    python server/survey/pipelines/s5_load_pg.py --verify     # 적재 없이 검증만(표 count = README 표) → findings-emd.json

원천(읽기만 · 수정·재생성 금지): 02. 데이터/survey/{namwon-parcels.gpkg, namwon-parcel-survey.gpkg(parcels·suspects),
namwon-parcel-timeline.json, namwon-parcel-emd-summary.json} + 규칙 근거 열의 원값 재계산용 AI 원천
(results/namwon-landcover-2023.geojson · A02 2025 경작/비닐하우스). gpkg 는 면적을 0.1㎡로 반올림해 저장했기 때문에
임계 경계(예: 32.96㎡ → 33.0)에서 규칙 재평가가 어긋난다 → s3_survey.py 와 같은 교차 계산으로 원값을 되살려 싣는다.
멱등: survey_parcels·timeline·emd·rules 는 트랜잭션 안에서 비우고 다시 싣는다. survey_findings 는 upsert(상태·배정 열 보존).
GPU 사용 0 · conda gcs 없이 시스템 Python(geopandas 1.1 · pyogrio · shapely 2) 로 돈다.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))      # server/
from landxi_api import config  # noqa: E402
from survey import db as S  # noqa: E402
from survey import rules as R  # noqa: E402

T0 = time.time()
ASSET = config.REPO_ROOT / "landxi" / "assets" / "data" / "geo"
KST = dt.timezone(dt.timedelta(hours=9))


def log(*a):
    print(f"[s5 {time.time() - T0:6.1f}s]", *a, flush=True)


# ─────────────────────────── 원값 재계산(s3_survey.py join/agg 와 같은 식) ───────────────────────────
def _join(P, ai, key, clsmap, conf="conf", idcol="id"):
    import geopandas as gpd
    import pandas as pd
    import shapely
    ai = ai.to_crs(5186).reset_index(drop=True)
    ai["geometry"] = shapely.make_valid(ai.geometry.values)
    ai["oarea"] = ai.area
    j = gpd.sjoin(ai[["geometry"]], P[["geometry"]], predicate="intersects", how="inner")
    ia = j.index.values
    pa = j["index_right"].values
    inter = shapely.area(shapely.intersection(ai.geometry.values[ia], P.geometry.values[pa]))
    t = pd.DataFrame({"aidx": ia, "pidx": pa, "inter": inter})
    t = t[t["inter"] > 0.01]
    t["cls"] = ai[key].map(clsmap).values[t["aidx"]]
    t["conf"] = ai[conf].values[t["aidx"]].astype(float)
    t["frac"] = t["inter"] / ai["oarea"].values[t["aidx"]]
    t["oid"] = ai[idcol].values[t["aidx"]]
    return t


def _agg(t, prefix, th):
    import pandas as pd
    out = {}
    a = t.groupby(["pidx", "cls"])["inter"].sum().unstack(fill_value=0)
    for c in a.columns:
        out[f"{prefix}_{c}_m2"] = a[c]
    m = t[(t["frac"] >= th["obj_in_frac"]) & (t["conf"] >= th["conf_min"])].copy()
    m["cw"] = m["conf"] * m["inter"]
    g = m.groupby(["pidx", "cls"]).agg(n=("oid", "count"), ain=("inter", "sum"), cw=("cw", "sum"))
    g["cmean"] = g["cw"] / g["ain"]
    for c in g.index.get_level_values(1).unique():
        s = g.xs(c, level=1)
        out[f"{prefix}_{c}_n"] = s["n"]
        out[f"{prefix}_{c}_in_m2"] = s["ain"]
        out[f"{prefix}_{c}_conf"] = s["cmean"]
    ids = m.sort_values("inter", ascending=False).groupby(["pidx", "cls"])["oid"].apply(lambda x: ",".join(map(str, x[:5])))
    for c in ids.index.get_level_values(1).unique():
        out[f"{prefix}_{c}_ids"] = ids.xs(c, level=1)
    return pd.DataFrame(out)


def build_parcels():
    import geopandas as gpd
    import numpy as np
    import pandas as pd
    import pyogrio
    th = R.default_thresholds()
    P = gpd.read_file(S.SURVEY_DIR / "namwon-parcels.gpkg", layer="parcels", engine="pyogrio")
    log(f"namwon-parcels.gpkg {len(P):,}필지 읽음")
    SV = pyogrio.read_dataframe(S.SURVEY_DIR / "namwon-parcel-survey.gpkg", layer="parcels", read_geometry=False)
    assert (SV["pnu"].values == P["pnu"].values).all(), "두 gpkg 의 필지 순서가 다르다"
    log(f"namwon-parcel-survey.gpkg parcels {len(SV):,} 속성 병합")
    P5 = P.to_crs(5186).reset_index(drop=True)
    A23 = gpd.read_file(config.DATA_ROOT / "results" / "namwon-landcover-2023.geojson", engine="pyogrio")
    log(f"2023 AI {len(A23):,} 폴리곤 — 필지 교차 원값 재계산(CPU)")
    t23 = _join(P5, A23, "cls", {"건물": "bld", "경작지": "crop", "주차장": "park", "비닐하우스": "gh"})
    s23 = _agg(t23, "a23", th)
    F25 = gpd.read_file(ASSET / "results" / "namwon-farmland-2025.geojson", engine="pyogrio")
    G25 = gpd.read_file(ASSET / "results" / "namwon-greenhouse-2025.geojson", engine="pyogrio")
    F25["id"] = "F25-" + F25["id"].str[:8]
    G25["id"] = "G25-" + G25["id"].str[:8]
    t25 = pd.concat([_join(P5, F25, "cls", {"경작지": "crop", "비경작지": "uncrop"}),
                     _join(P5, G25, "cls", {"비닐하우스_단동": "gh", "비닐하우스_다동": "gh"})])
    s25 = _agg(t25, "a25", th)
    log(f"교차 쌍 2023 {len(t23):,} · 2025 {len(t25):,}")
    D = P.drop(columns=["geometry"]).join(s23).join(s25)
    num = ["a23_bld_m2", "a23_crop_m2", "a23_park_m2", "a23_gh_m2", "a23_bld_in_m2", "a23_crop_in_m2", "a23_park_in_m2", "a23_gh_in_m2",
           "a23_bld_n", "a23_crop_n", "a23_park_n", "a23_gh_n", "a25_crop_m2", "a25_uncrop_m2", "a25_gh_m2", "a25_gh_in_m2", "a25_gh_n"]
    for c in num:
        if c not in D:
            D[c] = 0.0
        D[c] = D[c].fillna(0)
    for c in ["a23_bld_conf", "a23_crop_conf", "a23_park_conf", "a23_gh_conf", "a25_gh_conf",
              "a23_bld_ids", "a23_crop_ids", "a23_park_ids", "a23_gh_ids", "a25_gh_ids"]:
        if c not in D:
            D[c] = np.nan
    ar = D["area_m2"].clip(lower=1)
    for c in ["bld", "crop", "park", "gh"]:
        D[f"r23_{c}"] = (D[f"a23_{c}_m2"] / ar).clip(upper=1).round(3)
    D["r23_farm"] = ((D["a23_crop_m2"] + D["a23_gh_m2"]) / ar).clip(upper=1).round(3)
    # 정본 gpkg 에서만 오는 열(변화지수 · 정본 플래그 · 필지 최고 우선순위)
    for c in ["chg", "chg_built_new_m2", "flags", "sus_rule", "sus_priority", "sus_score"]:
        D[c] = SV[c].values
    # 교차검증: 재계산 원값을 0.1㎡ 로 반올림하면 gpkg 저장값과 같아야 한다
    chk = {}
    for c in ["a23_bld_m2", "a23_crop_m2", "a23_park_m2", "a23_gh_m2", "a23_bld_in_m2", "a23_park_in_m2", "a23_gh_in_m2", "a25_gh_m2",
              "r23_farm", "r23_bld"]:
        dif = (D[c].astype(float).round(1 if c.endswith("m2") else 3) - SV[c].fillna(0).astype(float)).abs()
        chk[c] = int((dif > (0.051 if c.endswith("m2") else 0.0005)).sum())
    log("재계산 ↔ gpkg 저장값 불일치(행):", chk)
    if any(chk.values()):
        raise SystemExit("재계산 원값이 정본 gpkg 와 다르다 — 적재 중단")
    D["jiga_ym"] = [f"{y}-{m}" if y else "" for y, m in zip(D["gosi_year"].fillna(""), D["gosi_month"].fillna(""))]
    return D, P.geometry.values


def _nz(v):
    if v is None:
        return None
    try:
        if isinstance(v, float) and math.isnan(v):
            return None
    except Exception:
        pass
    return v


# ─────────────────────────── 적재 ───────────────────────────
PCOLS = ["pnu", "addr", "emd", "emd_cd", "ri", "jibun", "jimok", "jimok_nm", "area_m2", "jiga", "jiga_ym", "yongdo", "nongup",
         "a23_bld_m2", "a23_crop_m2", "a23_park_m2", "a23_gh_m2", "a23_bld_in_m2", "a23_crop_in_m2", "a23_park_in_m2", "a23_gh_in_m2",
         "a23_bld_n", "a23_crop_n", "a23_park_n", "a23_gh_n", "a23_bld_conf", "a23_crop_conf", "a23_park_conf", "a23_gh_conf",
         "a23_bld_ids", "a23_crop_ids", "a23_park_ids", "a23_gh_ids", "r23_bld", "r23_crop", "r23_park", "r23_gh", "r23_farm",
         "a25_crop_m2", "a25_uncrop_m2", "a25_gh_m2", "a25_gh_in_m2", "a25_gh_n", "a25_gh_conf", "a25_gh_ids",
         "chg", "chg_built_new_m2", "flags", "sus_rule", "sus_priority", "sus_score"]
INTS = {"a23_bld_n", "a23_crop_n", "a23_park_n", "a23_gh_n", "a25_gh_n"}
FCOLS = ["id", "rank", "priority", "score", "rule", "rule_nm", "pnu", "addr", "emd", "emd_cd", "jimok", "parcel_m2", "yongdo", "nongup",
         "evid_m2", "conf", "corroboration", "img_date", "evidence", "ai_ids", "lon", "lat"]


def migrate():
    import psycopg
    sql = S.MIGRATION.read_text(encoding="utf-8")
    with psycopg.connect(config.PG_ADMIN_DSN, autocommit=True) as conn:
        conn.execute(sql)
    log("마이그레이션 0002_survey.sql 적용(멱등)")


def load(D, geoms):
    import pandas as pd
    import psycopg
    from shapely import set_srid, to_wkb
    from shapely.geometry import MultiPolygon
    summary = json.loads((S.SURVEY_DIR / "namwon-parcel-emd-summary.json").read_text(encoding="utf-8"))
    susp = pd.read_csv(S.SURVEY_DIR / "namwon-parcel-suspects.csv", encoding="utf-8-sig", dtype={"pnu": str})
    tl = json.loads((S.SURVEY_DIR / "namwon-parcel-timeline.json").read_text(encoding="utf-8"))
    emd_of = dict(zip(D["pnu"], D["emd_cd"]))
    with psycopg.connect(config.PG_ADMIN_DSN, autocommit=False) as conn:
        cur = conn.cursor()
        # 1) 필지
        cur.execute("TRUNCATE survey_parcels")
        t1 = time.time()
        with cur.copy(f"COPY survey_parcels ({', '.join(PCOLS)}, tenant_id, geom) FROM STDIN") as cp:
            rows = D[PCOLS].to_dict("records")
            for row, g in zip(rows, geoms):
                if g is not None and g.geom_type == "Polygon":
                    g = MultiPolygon([g])
                vals = []
                for c in PCOLS:
                    v = _nz(row[c])
                    if v is not None and c in INTS:
                        v = int(v)
                    if isinstance(v, str) and v == "" and c in ("chg", "flags", "sus_rule", "sus_priority"):
                        v = None if c != "chg" else ""
                    vals.append(v)
                cp.write_row(vals + [S.TENANT, to_wkb(set_srid(g, 4326), hex=True, include_srid=True) if g is not None else None])
        log(f"survey_parcels {len(D):,}행 COPY {time.time() - t1:.1f}s")
        # 2) 의심(suspects) — 상태·배정 열 보존 upsert
        susp["id"] = [S.finding_id(r, p) for r, p in zip(susp["rule"], susp["pnu"])]
        susp["emd_cd"] = susp["pnu"].map(emd_of)
        cur.execute("CREATE TEMP TABLE _f (LIKE survey_findings INCLUDING DEFAULTS) ON COMMIT DROP")
        with cur.copy(f"COPY _f ({', '.join(FCOLS)}, geom) FROM STDIN") as cp:
            for row in susp[FCOLS].to_dict("records"):
                vals = [_nz(row[c]) for c in FCOLS]
                vals[1] = int(vals[1])
                cp.write_row(vals + [f"SRID=4326;POINT({row['lon']} {row['lat']})"])
        upd = ", ".join(f"{c}=EXCLUDED.{c}" for c in FCOLS[1:] + ["geom"])
        cur.execute(f"INSERT INTO survey_findings ({', '.join(FCOLS)}, geom) SELECT {', '.join(FCOLS)}, geom FROM _f "
                    f"ON CONFLICT (id) DO UPDATE SET {upd}")
        cur.execute("DELETE FROM survey_findings f WHERE NOT EXISTS (SELECT 1 FROM _f WHERE _f.id = f.id) "
                    "AND NOT EXISTS (SELECT 1 FROM survey_finding_events e WHERE e.finding_id = f.id)")
        log(f"survey_findings {len(susp):,}건 upsert(상태 보존)")
        # 3) 이력
        cur.execute("TRUNCATE survey_timeline")
        with cur.copy("COPY survey_timeline (pnu, events, summary, flags, sus_priority, tenant_id) FROM STDIN") as cp:
            for p in tl["parcels"]:
                cp.write_row([p["pnu"], json.dumps(p["events"], ensure_ascii=False), p.get("summary") or [], p.get("flags") or None,
                              p.get("sus_priority") or None, S.TENANT])
        log(f"survey_timeline {len(tl['parcels']):,}필지")
        # 4) 읍면동(요약 json 의 40 키 → 법정동코드 39 · '광치동-5'(1필지)는 광치동 52190113 에 합친다)
        emd: dict[str, dict] = {}
        for name, v in summary["by_emd"].items():
            e = emd.setdefault(v["emd_cd"], {"name": name.split("-")[0], "names": [], "parcels": 0, "area_ha": 0.0, "farm": 0, "with_ai": 0,
                                             "jimok_top": {}, "ai": {}, "sus": {}, "sus_total": 0, "sus_parcels": 0, "prio": {}, "top5": []})
            e["names"].append(name)
            e["parcels"] += v["parcels"]
            e["area_ha"] = round(e["area_ha"] + v["area_ha"], 1)
            e["farm"] += v["farm_parcels_jeon_dap_gwa"]
            e["with_ai"] += v["parcels_with_ai2023"]
            for k, x in v["jimok_top"].items():
                e["jimok_top"][k] = e["jimok_top"].get(k, 0) + x
            for k, x in v["ai2023_in_parcels_ha"].items():
                e["ai"][k] = round(e["ai"].get(k, 0) + x, 2)
            for k, x in v["suspects"].items():
                e["sus"][k] = e["sus"].get(k, 0) + x
            for k, x in v["priority"].items():
                e["prio"][k] = e["prio"].get(k, 0) + x
            e["sus_total"] += v["suspects_total"]
            e["sus_parcels"] += v["suspect_parcels"]
            e["top5"] = sorted(e["top5"] + v["top5"], key=lambda t: t["rank"])[:5]
        cur.execute("TRUNCATE survey_emd")
        for cd, e in emd.items():
            cur.execute("INSERT INTO survey_emd(emd_cd, name, names, parcels, area_ha, farm_parcels, jimok_top, ai2023_in_parcels_ha, "
                        "parcels_with_ai2023, suspects, suspects_total, suspect_parcels, priority, top5) VALUES "
                        "(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                        (cd, e["name"], e["names"], e["parcels"], e["area_ha"], e["farm"], json.dumps(e["jimok_top"], ensure_ascii=False),
                         json.dumps(e["ai"]), e["with_ai"], json.dumps(e["sus"]), e["sus_total"], e["sus_parcels"], json.dumps(e["prio"]),
                         json.dumps(e["top5"], ensure_ascii=False)))
        cur.execute("UPDATE survey_emd e SET bbox = ARRAY[ST_XMin(x), ST_YMin(x), ST_XMax(x), ST_YMax(x)] "
                    "FROM (SELECT emd_cd, ST_Extent(geom)::box2d AS x FROM survey_parcels GROUP BY emd_cd) b WHERE b.emd_cd = e.emd_cd")
        log(f"survey_emd {len(emd)}행(법정동코드)")
        # 5) 규칙
        th = R.default_thresholds()
        defs = R.definitions()
        cur.execute("TRUNCATE survey_rules")
        for rid, d in defs.items():
            cnt = {"total": int((susp["rule"] == rid).sum()),
                   **{k: int(((susp["rule"] == rid) & (susp["priority"] == k)).sum()) for k in "ABC"}}
            cur.execute("INSERT INTO survey_rules(id, name, condition, thresholds, basis, counts, base_score, note) VALUES "
                        "(%s,%s,%s,%s,'estimate',%s,%s,%s)",
                        (rid, d["name"], R.condition_text(rid, th), json.dumps({**d["thresholds"], **R.COMMON}), json.dumps(cnt),
                         d["base_score"], d.get("note")))
        # 6) 메타(우선순위 절단 · 원천 · 적재 시각)
        cutA = float(susp.loc[susp["priority"] == "A", "score"].min())
        cutB = float(susp.loc[susp["priority"] == "B", "score"].min())
        meta = {
            "priority_cut": {"A": cutA, "B": cutB, "readme": summary["totals"]["priority_cut"]},
            "totals": summary["totals"], "thresholds": th, "generated": summary["generated"], "provenance": summary["provenance"],
            "timeline_note": tl.get("note"), "loaded_at": dt.datetime.now(KST).isoformat(timespec="seconds"),
            "sources": [S.SRC_PARCELS, S.SRC_SURVEY, S.SRC_SUSPECTS, S.SRC_TIMELINE, S.SRC_SUMMARY,
                        "results/namwon-landcover-2023.geojson", "A02 namwon-farmland-2025 · namwon-greenhouse-2025"],
        }
        for k, v in meta.items():
            cur.execute("INSERT INTO survey_meta(key, value, at) VALUES (%s,%s,now()) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, at=now()",
                        (k, json.dumps(v, ensure_ascii=False)))
        # 7) 작업 FK 용 모델 행(kind survey · cpu 어댑터 survey/rules — 모델 추론 아님)
        cur.execute("INSERT INTO models(id, family, version, task, classes, input, metrics, status, adapter) VALUES "
                    "('survey/rules','survey-rules','R1-R6@2026-09-24','index',%s,'[\"parcels\"]','{}','registered','survey/rules') "
                    "ON CONFLICT (id) DO UPDATE SET classes=EXCLUDED.classes, adapter=EXCLUDED.adapter, status=EXCLUDED.status",
                    (json.dumps(S.RULE_IDS),))
        conn.commit()
        with psycopg.connect(config.PG_ADMIN_DSN, autocommit=True) as c2:
            for t in ("survey_parcels", "survey_findings", "survey_timeline", "survey_emd"):
                c2.execute(f"VACUUM ANALYZE {t}")
    log("적재 커밋 · VACUUM ANALYZE")


# ─────────────────────────── 검증 → findings-emd.json ───────────────────────────
def verify(write: bool = True) -> bool:
    import psycopg
    E = S.README_COUNTS
    got: dict = {}
    with psycopg.connect(config.PG_ADMIN_DSN, autocommit=True) as conn:
        q = lambda sql: conn.execute(sql).fetchall()  # noqa: E731
        got["parcels"] = q("SELECT count(*) FROM survey_parcels")[0][0]
        got["area_km2"] = round(q("SELECT sum(area_m2) FROM survey_parcels")[0][0] / 1e6, 2)
        got["suspects"] = q("SELECT count(*) FROM survey_findings")[0][0]
        got["suspect_parcels"] = q("SELECT count(DISTINCT pnu) FROM survey_findings")[0][0]
        got["timeline"] = q("SELECT count(*) FROM survey_timeline")[0][0]
        got["emd"] = q("SELECT count(*) FROM survey_emd")[0][0]
        got["by_rule"] = {r: n for r, n in q("SELECT rule, count(*) FROM survey_findings GROUP BY rule ORDER BY rule")}
        got["by_priority"] = {r: n for r, n in q("SELECT priority, count(*) FROM survey_findings GROUP BY priority ORDER BY priority")}
        brp: dict = {}
        for r, p, n in q("SELECT rule, priority, count(*) FROM survey_findings GROUP BY 1,2"):
            brp.setdefault(r, {"A": 0, "B": 0, "C": 0})[p] = n
        got["by_rule_priority"] = brp
        got["ai2023_objects"] = E["ai2023_objects"]    # 원천 파일 행 수(적재 대상 아님) — 요약 json totals 로 대조
        tot = json.loads((S.SURVEY_DIR / "namwon-parcel-emd-summary.json").read_text(encoding="utf-8"))["totals"]
        got["ai2023_objects"] = tot["ai2023_objects"]
        emd_rows = q("SELECT e.emd_cd, e.name, e.names, e.parcels, e.area_ha, e.suspects, e.suspects_total, e.suspect_parcels, e.priority, "
                     "(SELECT count(*) FROM survey_parcels p WHERE p.emd_cd = e.emd_cd), "
                     "(SELECT json_object_agg(rule, n) FROM (SELECT rule, count(*) n FROM survey_findings f WHERE f.emd_cd = e.emd_cd GROUP BY rule) x), "
                     "(SELECT json_object_agg(priority, n) FROM (SELECT priority, count(*) n FROM survey_findings f WHERE f.emd_cd = e.emd_cd GROUP BY priority) y), "
                     "e.bbox, e.top5 FROM survey_emd e ORDER BY e.emd_cd")
        meta = {k: v for k, v in q("SELECT key, value FROM survey_meta")}
    ok = True
    lines = []
    for k in ["parcels", "area_km2", "suspects", "suspect_parcels", "timeline", "emd", "ai2023_objects"]:
        m = got[k] == E[k]
        ok &= m
        lines.append(f"  {'OK ' if m else 'NG '} {k:<16} {got[k]!s:>10}  (README {E[k]})")
    for k in ["by_rule", "by_priority"]:
        for r, n in E[k].items():
            m = got[k].get(r, 0) == n
            ok &= m
            lines.append(f"  {'OK ' if m else 'NG '} {k}.{r:<9} {got[k].get(r, 0)!s:>10}  (README {n})")
    for r, d in E["by_rule_priority"].items():
        m = got["by_rule_priority"].get(r, {}) == d
        ok &= m
        lines.append(f"  {'OK ' if m else 'NG '} {r} A/B/C       {'/'.join(str(got['by_rule_priority'].get(r, {}).get(k, 0)) for k in 'ABC'):>10}  "
                     f"(README {'/'.join(str(d[k]) for k in 'ABC')})")
    # 읍면동: 적재 표에서 센 값 = 요약 json 값
    emd_bad = 0
    for row in emd_rows:
        cd, name, names, parcels, area_ha, sus, sus_total, sus_p, prio, n_parc, by_rule_db, by_prio_db, bbox, top5 = row
        by_rule_db = by_rule_db or {}
        by_prio_db = by_prio_db or {}
        if n_parc != parcels or sum(by_rule_db.values()) != sus_total or any(by_rule_db.get(r, 0) != sus.get(r, 0) for r in S.RULE_IDS) \
                or any(by_prio_db.get(k, 0) != prio.get(k, 0) for k in "ABC"):
            emd_bad += 1
    ok &= emd_bad == 0
    lines.append(f"  {'OK ' if emd_bad == 0 else 'NG '} emd 39행 필지·규칙·등급 = 요약 json   불일치 {emd_bad}")
    print("검증(표 count = README 표):")
    print("\n".join(lines), flush=True)
    if not ok:
        print("검증 실패 — findings-emd.json 을 쓰지 않는다", flush=True)
        return False
    if write:
        now = dt.datetime.now(KST).isoformat(timespec="seconds")
        out = {
            "title": "남원시 실태조사 의심 — 읍면동 39 × 규칙 × 등급(PostGIS 적재 검증 통과본)",
            "as_of": S.AS_OF, "generated": now,
            "provenance": "V-World 연속지적(수집 2026-09-24) × 2023 25cm AI(검수 전) × 2025 드론 A02 — 규칙 R1–R6 임계 [추정 초기값] · "
                          + S.FIXED_PHRASE,
            "basis": "inferred", "source": "PostGIS survey_findings · survey_emd (server/survey/pipelines/s5_load_pg.py)",
            "verified": {"at": now, "against": "02. 데이터/survey/README.md 표", "checks": len(lines), "failed": 0},
            "totals": {"parcels": got["parcels"], "area_km2": got["area_km2"], "suspects": got["suspects"],
                       "suspect_parcels": got["suspect_parcels"], "timeline_parcels": got["timeline"], "emd": got["emd"],
                       "by_rule": got["by_rule"], "by_priority": got["by_priority"], "by_rule_priority": got["by_rule_priority"],
                       "priority_cut": meta["priority_cut"]["readme"]},
            "items": [{"emd_cd": r[0], "name": r[1], "names": r[2], "parcels": r[3], "area_ha": r[4], "suspects": r[6],
                       "suspect_parcels": r[7], "by_rule": {k: (r[10] or {}).get(k, 0) for k in S.RULE_IDS},
                       "by_priority": {k: (r[11] or {}).get(k, 0) for k in "ABC"}, "bbox": [round(x, 6) for x in (r[12] or [])],
                       "top5": r[13]} for r in emd_rows],
        }
        S.FINDINGS_EMD_JSON.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"findings-emd.json 작성 → {S.FINDINGS_EMD_JSON} ({len(out['items'])}행)", flush=True)
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--verify", action="store_true", help="적재 없이 검증만")
    ap.add_argument("--no-write", action="store_true", help="검증 통과해도 findings-emd.json 을 쓰지 않음")
    a = ap.parse_args()
    if not a.verify:
        migrate()
        D, geoms = build_parcels()
        load(D, geoms)
    ok = verify(write=not a.no_write)
    log("끝" if ok else "실패")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
