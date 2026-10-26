"""카드 8종(10-26) — 끝난 분석 결과를 다시 정리(다시 추론하지 않음 · GPU 0).
작업기 마무리(cpu_worker.finalize)와 같은 단계를 원래 결과(.raw.fgb · NMS 뒤)에 다시 건다:
  ① 신뢰도 하한(카드 기본값 · 눈으로 매긴 표본 근거 · REPORT) ② 영상 빈 곳 자르기(valid_area.clip_feats) ③ 겹침 정리(national.tidy.finalize_clean — 10-26 붙이기 규칙)
쓰기(--go): 백업(DB 행 JSON · 결과 파일 사본) → .fgb · DB 결과 줄 · jobs.counts · 지도 조각(.pmtiles) · 정리 기록. 원래 결과(.raw.fgb)는 그대로.
  python retidy.py JOB CONF [--go] [--db test|main]
"""
import sys, os, json, shutil, datetime as dt
from pathlib import Path
SERVER = Path(r"E:\Land-XI 플랫폼\01. 디자인\server"); sys.path.insert(0, str(SERVER)); os.chdir(SERVER)
sys.stdout.reconfigure(encoding="utf-8")
from landxi_api import config, result_store as R, valid_area as VA
from national import tidy as T
import psycopg, shapely
from shapely import set_srid, to_wkb
from shapely.geometry import MultiPolygon

job, conf = sys.argv[1], float(sys.argv[2])
go = "--go" in sys.argv
which = sys.argv[sys.argv.index("--db") + 1] if "--db" in sys.argv else "main"
KEYS = ("id", "cls", "cls_en", "cid", "conf", "area_m2", "emd", "emd_cd", "edit_state", "job_id", "shard_id", "chip_edge", "merged_from")
BK = config.DATA_ROOT / "_backup" / "cards8-1026"

def dsn():
    d = config.PG_ADMIN_DSN if which == "main" else config.PG_ADMIN_DSN.rsplit("/", 1)[0] + "/" + (os.environ.get("PG_TEST_DB") or config.get("PG_TEST_DB") or "landxi_test")
    import re
    print("DSN:", re.sub(r"://([^:@/]+):[^@]*@", r"://\1:***@", d))
    return d

b = R.base("lx", job)
raw_f = b.with_name(b.name + ".raw.fgb")
src = raw_f if raw_f.exists() else R.vector_of_base(b)
g4, props = T.read_raw(src)
feats = [{"geom": T._valid(g), "props": p} for g, p in zip(g4, props)]
n0 = len(feats)
feats = [f for f in feats if float(f["props"].get("conf") or 0) >= conf]
n1 = len(feats)
with psycopg.connect(dsn() if go else config.PG_DSN, autocommit=False) as c:
    c.execute("SELECT set_config('app.realm','lx',false), set_config('app.tenant_id','',false), set_config('app.user_id','',false)")
    jr = c.execute("SELECT imagery_id, tenant_id, options, (SELECT task FROM models WHERE id=j.model_id) FROM jobs j WHERE id=%s", (job,)).fetchone()
    if not jr:
        sys.exit(f"작업이 이 DB 에 없음: {job}")
    iid, tenant, opts, task = jr
    vg = VA.load(iid)
    from workers.postprocess import metric_epsg
    epsg = metric_epsg(feats[0]["geom"].centroid.x, feats[0]["geom"].centroid.y) if feats else 5186
    vst = None
    if vg is not None and feats:
        feats, vst = VA.clip_feats(feats, vg, epsg, min_area=4.0, clip=task not in ("obb", "det"))
    n2 = len(feats)
    out, rec = T.finalize_clean(feats, task=task or "seg", epsg=epsg)
    by = {}
    for f in out:
        by[f["props"]["cls"]] = by.get(f["props"]["cls"], 0) + 1
    old = dict(c.execute("SELECT cls, count(*) FROM detections WHERE job_id=%s GROUP BY 1", (job,)).fetchall())
    summ = {"job": job, "src": src.name, "raw": n0, "conf_min": conf, "after_conf": n1, "after_valid": n2, "valid": vst,
            "seam": rec.get("seam"), "out": len(out), "by_cls": by, "db_before": old}
    print(json.dumps(summ, ensure_ascii=False, default=str))
    if not go:
        sys.exit(0)
    # 백업
    BK.mkdir(parents=True, exist_ok=True)
    rows = c.execute("SELECT id, tenant_id, job_id, shard_id, cls, cls_en, cid, conf, area_m2, ST_AsText(geom), pnu, emd, emd_cd, edited_by, edit_state, chip_edge, fid "
                     "FROM detections WHERE job_id=%s", (job,)).fetchall()
    stamp = dt.datetime.now().strftime("%H%M%S")
    (BK / f"{job}.{which}.detections.{stamp}.json").write_text(json.dumps(rows, ensure_ascii=False, default=str), encoding="utf-8")
    jrow = c.execute("SELECT counts FROM jobs WHERE id=%s", (job,)).fetchone()
    (BK / f"{job}.{which}.jobs-counts.{stamp}.json").write_text(json.dumps(jrow, ensure_ascii=False, default=str), encoding="utf-8")
    edits = c.execute("SELECT count(*) FROM result_edits WHERE set_id=%s", (job,)).fetchone()[0]
    if edits:
        sys.exit(f"고친 자리 {edits}건이 있는 결과 — 손대지 않음")
    counts = {}
    for f in out:
        counts[f["props"]["cls_en"]] = counts.get(f["props"]["cls_en"], 0) + 1
    c.execute("DELETE FROM detections WHERE job_id=%s", (job,))
    with c.cursor().copy("COPY detections (tenant_id, job_id, shard_id, fid, cls, cls_en, cid, conf, area_m2, emd, emd_cd, chip_edge, edit_state, geom) FROM STDIN") as cp:
        for f in out:
            p = f["props"]; g = f["geom"] if f["geom"].geom_type == "MultiPolygon" else MultiPolygon([f["geom"]])
            cp.write_row((tenant, job, p.get("shard_id"), p.get("fid") or p.get("id"), p["cls"], p["cls_en"], p.get("cid"), p.get("conf"), p.get("area_m2"),
                          p.get("emd"), p.get("emd_cd"), bool(p.get("chip_edge")), "raw", to_wkb(set_srid(g, 4326), hex=True, include_srid=True)))
    c.execute("UPDATE jobs SET counts=%s WHERE id=%s", (json.dumps(counts, ensure_ascii=False), job))
    c.commit()
    print("DB 쓰기 끝", which, len(out))
if which != "main":
    sys.exit(0)
# 파일 — 백업 뒤 정리 결과 · 지도 조각 · 기록
for suf in (".fgb", ".pmtiles", "-tidy.json"):
    f = b.with_name(b.name + suf)
    if f.exists():
        shutil.copy2(f, BK / f"{f.name}.{stamp}")
if not raw_f.exists():
    shutil.copy2(src, raw_f)
gj = b.with_name(b.name + ".fgb")
R.write_fgb(gj, [f["geom"] for f in out], [{k: f["props"].get(k) for k in KEYS} for f in out], KEYS)
from pipelines.snapshot_pmtiles import build
snap = b.with_name(b.name + ".pmtiles")
info = build(gj, snap, minzoom=10, maxzoom=17, name=job)
T.tidy_path(b).write_text(json.dumps({**rec, "by": "system:cards8-1026", "conf_min": conf, "valid": vst, "v": T.VERSION, "raw": raw_f.name, "clean": gj.name,
                                      "at": dt.datetime.now().isoformat(timespec="seconds")}, ensure_ascii=False, indent=0, default=str), encoding="utf-8")
print("파일 쓰기 끝", info.get("ms"))
