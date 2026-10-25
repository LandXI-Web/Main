"""영상의 빈 곳 정리(10-25 원칙 340) — 등록 영상의 '영상이 있는 곳'(유효 범위)을 재고, 지난 분석 결과 중 빈 곳 위의 것을 뺀다.

  python -m ops.nodata_clean scan [--ids a,b] [--force]          유효 범위 재기 → 02. 데이터/imagery/valid/{영상}.geojson (DB 쓰지 않음)
  python -m ops.nodata_clean report [--out f.json]                결과(작업)마다 빈 곳 위 결과 수(뺄 것 · 자를 것) — 바꾸지 않음
  python -m ops.nodata_clean footprint [--test] [--apply]         영상 범위(imagery.footprint)를 유효 범위로(예전 범위는 백업 표)
  python -m ops.nodata_clean apply [--test] [--jobs a,b] [--apply] 빈 곳 위 결과 정리(기본은 미리 보기)

정리 규칙(valid_area.clip_feats 와 같음): 결과가 절반 넘게 빈 곳 위 → 지움(edit_state 'deleted' · 고치기와 같은 길 · 되돌릴 수 있음)
  · 걸친 면 결과 → 유효 범위로 자름(면적 다시) · 상자 결과(차량 · 사람)는 자르지 않음.
백업: 바꾸기 전 원래 줄을 detections_nodata_bak 표에(통째) · 결과 파일은 {작업}.nodata-orig.fgb 로 · 감사 기록은 새 줄만 더한다(고치지 않음).
숫자: jobs.counts 를 남은 결과로 다시 센다(한 출처).
영상 API(전국 · 국토지리정보원 타일) · 해외 · 파일 없는 영상은 건너뛴다(빈 타일은 작업기가 정확한 0 채움으로 뺀다).
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import shutil
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
ACTOR = "system:nodata-1025"
BAK = "detections_nodata_bak"
FP_BAK = "imagery_footprint_bak"


def _use_test(test: bool):
    if test:
        sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tests"))
        import testdb
        testdb.apply()
        from landxi_api import config
        why = testdb.guard(config)
        if why:
            raise SystemExit(f"시험 DB 아님: {why}")


def _pg():
    import psycopg
    from landxi_api import config
    c = psycopg.connect(config.PG_ADMIN_DSN, autocommit=False)
    return c


def _full(p: str) -> str:
    from landxi_api import config
    return p if (":" in p[:3] or os.path.isabs(p)) else str(config.DATA_ROOT / p)


def local_imagery(c, ids: list[str] | None = None) -> list[tuple[str, str]]:
    rows = c.execute("SELECT id, coalesce(path_internal, layer->>'cog_path'), coalesce(layer->>'role','imagery'), coalesce(kind,'ortho') "
                     "FROM imagery ORDER BY id").fetchall()
    out = []
    for iid, p, role, kind in rows:
        if ids and iid not in ids:
            continue
        if not p or role == "national" or kind == "terrain" or str(p).lower().endswith(".xml"):
            continue
        f = _full(p)
        if os.path.exists(f):
            out.append((iid, f))
    return out


def cmd_scan(a):
    from landxi_api import valid_area as VA
    with _pg() as c:
        todo = local_imagery(c, a.ids.split(",") if a.ids else None)
    if a.part:
        k, n = (int(x) for x in a.part.split("/"))
        todo = todo[k::n]
    for iid, f in todo:
        if not a.force and VA.path_of(iid).exists():
            continue
        try:
            import rasterio
            with rasterio.open(f) as d:
                if d.dtypes[0] != "uint8" or d.count < 3:       # 값 영상(위성 다중분광 등) — 마스크만
                    pass
            g, rec = VA.compute(f)
            VA.store(iid, g, rec)
            print(iid, json.dumps(rec, ensure_ascii=False), flush=True)
        except Exception as e:  # noqa: BLE001
            print(iid, "ERROR", repr(e)[:200], flush=True)


def _jobs(c, jobs: list[str] | None):
    from landxi_api import valid_area as VA
    q = ("SELECT j.id, j.card_id, j.imagery_id, j.tenant_id, coalesce(m.task,'seg'), j.result_set FROM jobs j LEFT JOIN models m ON m.id = j.model_id "
         "WHERE j.state = 'done' AND j.imagery_id IS NOT NULL AND EXISTS(SELECT 1 FROM detections d WHERE d.job_id = j.id)")
    rows = c.execute(q).fetchall()
    out = []
    for jid, card, iid, ten, task, rs in rows:
        if jobs and jid not in jobs:
            continue
        if VA.path_of(iid).exists():
            out.append({"job": jid, "card": card, "imagery": iid, "tenant": ten, "task": task, "result_set": rs})
    return out


def _judge(c, j: dict):
    """그 작업의 결과 줄 → (지울 id, 자를 {id: (새 도형 wkb, 면적)}, 전체 수)"""
    import shapely
    from pyproj import Transformer
    from shapely import wkb
    from shapely.ops import transform as stx
    from landxi_api import valid_area as VA
    from workers.postprocess import metric_epsg
    vg = VA.load(j["imagery"])
    rows = c.execute("SELECT id, ST_AsBinary(geom), area_m2 FROM detections WHERE job_id = %s AND coalesce(edit_state,'raw') <> 'deleted'",
                     (j["job"],)).fetchall()
    if vg is None:
        return [], {}, len(rows)
    if not rows:
        return [], {}, 0
    g0 = wkb.loads(bytes(rows[0][1]))
    c0 = g0.centroid
    epsg = metric_epsg(c0.x, c0.y)
    fwd = Transformer.from_crs(4326, epsg, always_xy=True).transform
    back = Transformer.from_crs(epsg, 4326, always_xy=True).transform
    vm = VA._to_src(vg, epsg)
    geoms = [wkb.loads(bytes(r[1])) for r in rows]
    inside = shapely.contains(vg, geoms)
    drop, clip = [], {}
    box_task = j["task"] in ("obb", "det")
    for (rid, _b, area), g, ok in zip(rows, geoms, inside):
        if ok:
            continue
        gm = stx(fwd, g)
        a0 = gm.area
        if a0 <= 0:
            if not vm.intersects(gm):
                drop.append(rid)
            continue
        inter = gm.intersection(vm)
        a1 = inter.area
        if a1 < a0 * (1 - VA.DROP_FRAC):
            drop.append(rid)
        elif not box_task and a1 < a0 * (1 - VA.CLIP_FRAC) and a0 - a1 >= VA.CLIP_M2:
            polys = [p for p in getattr(inter, "geoms", [inter]) if p.geom_type == "Polygon" and not p.is_empty]
            if not polys:
                drop.append(rid)
                continue
            from shapely.geometry import MultiPolygon
            ng = stx(back, MultiPolygon(polys))
            clip[rid] = (shapely.to_wkb(ng), round(float(a1), 1))
    return drop, clip, len(rows)


def cmd_report(a):
    out = []
    with _pg() as c:
        for j in _jobs(c, a.jobs.split(",") if a.jobs else None):
            drop, clip, n = _judge(c, j)
            r = {**{k: j[k] for k in ("job", "card", "imagery")}, "n": n, "drop": len(drop), "clip": len(clip)}
            out.append(r)
            print(json.dumps(r, ensure_ascii=False), flush=True)
    if a.out:
        Path(a.out).write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")


def _recount(c, jid: str) -> dict:
    rows = c.execute("SELECT cls_en, count(*) FROM detections WHERE job_id = %s AND coalesce(edit_state,'raw') <> 'deleted' GROUP BY 1",
                     (jid,)).fetchall()
    return {k: int(n) for k, n in rows}


def _rewrite_files(j: dict, log=print):
    """결과 파일(.fgb · 지도 조각)을 남은 결과로 다시 — 원래 파일은 {작업}.nodata-orig.* 로(지우지 않음)."""
    from landxi_api import result_store as RS
    from landxi_api.results import FEATURE_COLS  # noqa: F401
    import psycopg
    from landxi_api import config
    from shapely import wkb
    base = RS.base(j["tenant"] or "lx", j["job"])
    cur = RS.vector_of_base(base)
    if cur is None:
        return {"files": "none"}
    keep = base.with_name(base.name + ".nodata-orig" + ("".join(cur.suffixes[-2:]) if cur.name.endswith(".gz") else cur.suffix))
    if not keep.exists():
        shutil.copy2(cur, keep)
    snap = base.with_name(base.name + ".pmtiles")
    if snap.exists():
        sk = base.with_name(base.name + ".nodata-orig.pmtiles")
        if not sk.exists():
            shutil.copy2(snap, sk)
    keys = ("id", "cls", "cls_en", "cid", "conf", "area_m2", "emd", "emd_cd", "edit_state", "job_id", "shard_id", "chip_edge")
    with psycopg.connect(config.PG_ADMIN_DSN) as c:
        rows = c.execute("SELECT coalesce(fid, id::text), cls, cls_en, cid, conf, area_m2, emd, emd_cd, edit_state, job_id, shard_id, chip_edge, "
                         "ST_AsBinary(geom) FROM detections WHERE job_id = %s AND coalesce(edit_state,'raw') <> 'deleted' ORDER BY id",
                         (j["job"],)).fetchall()
    geoms = [wkb.loads(bytes(r[-1])) for r in rows]
    props = [{k: (float(v) if hasattr(v, "is_finite") else v) for k, v in zip(keys, r[:-1])} for r in rows]
    fgb = base.with_name(base.name + ".fgb")
    RS.write_fgb(fgb, geoms, props, keys)
    info = {}
    if snap.exists() or True:
        from pipelines.snapshot_pmtiles import build
        task = j["task"]
        try:
            if task == "det":
                from workers import postprocess
                disp = base.with_name(base.name + ".display.geojson")
                postprocess.det_display([{"geom": g, "props": p} for g, p in zip(geoms, props)], disp, cell_m=10.0)
                info = build(disp, snap, minzoom=12, maxzoom=20, name=j["job"])
            else:
                info = build(fgb, snap, minzoom=12 if task == "obb" else 10, maxzoom=20 if task == "obb" else 17, name=j["job"])
        except Exception as e:  # noqa: BLE001
            log(j["job"], "pmtiles", repr(e)[:200])
    rec = {"by": ACTOR, "at": dt.datetime.now().isoformat(timespec="seconds"), "orig": keep.name, "n": len(rows), "pmtiles_ms": info.get("ms")}
    base.with_name(base.name + "-nodata.json").write_text(json.dumps(rec, ensure_ascii=False), encoding="utf-8")
    return rec


def cmd_apply(a):
    from psycopg.types.json import Jsonb
    todo_all = []
    with _pg() as c:
        c.execute(f"CREATE TABLE IF NOT EXISTS {BAK} (LIKE detections INCLUDING DEFAULTS)")
        c.execute(f"ALTER TABLE {BAK} ADD COLUMN IF NOT EXISTS bak_at timestamptz DEFAULT now()")
        c.execute(f"ALTER TABLE {BAK} ADD COLUMN IF NOT EXISTS bak_action text")
        c.commit()
        jobs = _jobs(c, a.jobs.split(",") if a.jobs else None)
        for j in jobs:
            drop, clip, n = _judge(c, j)
            if not drop and not clip:
                continue
            before = _recount(c, j["job"])
            r = {"job": j["job"], "card": j["card"], "imagery": j["imagery"], "n": n, "drop": len(drop), "clip": len(clip), "before": before}
            if a.apply:
                ids = drop + list(clip)
                c.execute(f"INSERT INTO {BAK} SELECT d.*, now(), CASE WHEN d.id = ANY(%s) THEN 'deleted' ELSE 'clipped' END "
                          "FROM detections d WHERE d.id = ANY(%s)", (drop, ids))
                if drop:
                    c.execute("UPDATE detections SET edit_state = 'deleted', edited_by = %s WHERE id = ANY(%s)", (ACTOR, drop))
                for rid, (gw, area) in clip.items():
                    c.execute("UPDATE detections SET geom = ST_Multi(ST_SetSRID(ST_GeomFromWKB(%s), 4326)), area_m2 = %s WHERE id = %s",
                              (gw, area, rid))
                after = _recount(c, j["job"])
                c.execute("UPDATE jobs SET counts = %s WHERE id = %s", (Jsonb(after), j["job"]))
                c.execute("INSERT INTO audit_log(actor, realm, action, subject, before, after) VALUES (%s,'system','result.nodata_clean',%s,%s,%s)",
                          (ACTOR, j["job"], Jsonb({"counts": before}), Jsonb({"counts": after, "deleted": len(drop), "clipped": len(clip),
                                                                              "backup": BAK, "rule": "원칙 340 영상 빈 곳"})))
                c.commit()
                r["after"] = after
                if not a.test:
                    r["files"] = _rewrite_files(j)
            todo_all.append(r)
            print(json.dumps(r, ensure_ascii=False, default=str), flush=True)
    if a.out:
        Path(a.out).write_text(json.dumps(todo_all, ensure_ascii=False, indent=1, default=str), encoding="utf-8")


def cmd_footprint(a):
    """영상 범위 = 유효 범위(≈2 m 칸 · 단순화) — 예전 범위는 백업 표(imagery_footprint_bak)에."""
    from psycopg.types.json import Jsonb
    from shapely import to_wkb
    from landxi_api import valid_area as VA
    with _pg() as c:
        c.execute(f"CREATE TABLE IF NOT EXISTS {FP_BAK} (id text, footprint geometry, bak_at timestamptz DEFAULT now())")
        for iid, _f in local_imagery(c, a.ids.split(",") if a.ids else None):
            g = VA.load(iid)
            if g is None:
                continue
            old = c.execute("SELECT ST_Area(footprint::geography), ST_NPoints(footprint) FROM imagery WHERE id=%s", (iid,)).fetchone()
            g2 = g.simplify(0.00003, preserve_topology=True).buffer(0)
            # 예전 범위(도엽 · 시군구로 정한 범위) ∩ 영상이 있는 곳 — 범위를 넓히지 않고 빈 곳만 뺀다
            nw = c.execute("SELECT ST_AsBinary(ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_Intersection(footprint, ST_SetSRID(ST_GeomFromWKB(%s),4326))),3))) "
                           "FROM imagery WHERE id=%s", (to_wkb(g2), iid)).fetchone()[0]
            if nw is None:
                continue
            from shapely import from_wkb
            g2 = from_wkb(bytes(nw))
            if g2.is_empty:
                continue
            new = c.execute("SELECT ST_Area(ST_SetSRID(ST_GeomFromWKB(%s),4326)::geography)", (to_wkb(g2),)).fetchone()
            print(iid, "km2", round((old[0] or 0) / 1e6, 3), "→", round(new[0] / 1e6, 3), "pts", old[1], "→", int(__import__("shapely").get_num_coordinates(g2)), flush=True)
            if a.apply:
                c.execute(f"INSERT INTO {FP_BAK}(id, footprint) SELECT id, footprint FROM imagery WHERE id=%s", (iid,))
                c.execute("UPDATE imagery SET footprint = ST_Multi(ST_SetSRID(ST_GeomFromWKB(%s),4326)) WHERE id=%s", (to_wkb(g2), iid))
                c.execute("INSERT INTO audit_log(actor, realm, action, subject, after) VALUES (%s,'system','imagery.valid_footprint',%s,%s)",
                          (ACTOR, iid, Jsonb({"km2_before": round((old[0] or 0) / 1e6, 3), "km2_after": round(new[0] / 1e6, 3), "backup": FP_BAK})))
                c.commit()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["scan", "report", "apply", "footprint"])
    ap.add_argument("--ids")
    ap.add_argument("--jobs")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--test", action="store_true")
    ap.add_argument("--out")
    ap.add_argument("--part", help="k/n — n 개로 나눠 k 번째만(나란히 재기)")
    a = ap.parse_args()
    _use_test(a.test)
    {"scan": cmd_scan, "report": cmd_report, "apply": cmd_apply, "footprint": cmd_footprint}[a.cmd](a)


if __name__ == "__main__":
    main()
