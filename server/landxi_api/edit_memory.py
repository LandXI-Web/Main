"""지운 자리 기억(원칙 243 · 10-14 "응 그렇게 해줘" · 마이그레이션 0085).

그 자리 고치기(지우기 · 분류 바꾸기 · 모양 고치기 · 새로 그리기)는 결과 묶음 번호(set_id) · 객체 번호(fid)에 붙는다. 다시 추론하면 새 묶음이라
지운 것이 다시 나타났다. 이제 고친 자리를 **모양 · 분류 · 영상 연도**로도 기억하고, 새 결과가 나오면 저절로 적용한다.

  언제     새 결과가 데이터베이스에 들어온 직후 한 번(작업기 마무리 workers/cpu_worker.finalize · 전국 작업기 national/runner.finish_cell ·
           관리자 POST /ximap/memory/apply). 같은 결과에 두 번 적용하지 않는다(edit_memory_runs 한 줄).
  무엇을   살아 있는 원래 고친 줄(되돌리지 않음 · 메모 아님 · 저절로 적용한 줄 아님) 가운데, 새 결과 범위 안에서
           같은 분석서비스(card_id) 또는 같은 분류(새 결과 · 모델이 찾는 분류)인 것. 시험 작업에는 시험 고치기만, 실제 작업에는 실제 고치기만.
  겹침     새 객체가 기억한 자리와 같은 분류이고, 새 객체의 가운데(면 위 점)가 기억한 모양 안이거나 겹침 비율(IoU)이 0.5 이상.
  적용     지운 자리 → 새 객체 '지움' · 분류 바꾼 자리 → 바꾼 분류 · 모양 고친 자리 → 고친 모양 · 새로 그린 것 → 새 결과에 그 객체가 없으면 그대로 더함.
           적용한 것은 새 고치기 줄(source = 'memory' · by = 원래 고친 사람 · from_edit = 원래 줄)로 남아 되돌릴 수 있다.
           저절로 적용한 줄을 사람이 되돌리면 그 원래 줄은 다음 결과부터 따르지 않는다(사람 판단이 이긴다).
  연도     원래 고친 결과의 영상 연도와 새 결과의 영상 연도가 다르면 적용하지 않고 '다시 확인'(edit_rechecks)으로 둔다.
  재기     지운 자리(같은 연도) 가운데 새 결과가 다시 잡은 곳 수 → 배포 신청서 · XI 재학습 줄의 '지운 자리 n곳 중 다시 잡은 곳 m곳'(memory_for_model).
숫자: 저절로 적용한 줄도 고친 것과 똑같이 결과 수(XI맵 전국 결과 · 분석 · 보고서 · 전국 진행)에 들어간다 — 따로 세는 길 없음(숫자 한 출처).
학습 데이터: 저절로 적용한 줄은 학습 칸(train_tiles)을 만들지 않는다 — 원래 고친 줄이 이미 그 자리 1장을 만든다(같은 자리를 두 번 세지 않음).

같은 코드를 게이트웨이(asyncpg)와 작업기(psycopg)가 함께 쓴다 — SyncConn 이 psycopg 연결을 같은 모양으로 감싼다.
"""
from __future__ import annotations

import asyncio
import json
import re
import secrets
from collections import OrderedDict

IOU = 0.5
YEAR_SQL = "coalesce(i.year, CASE WHEN i.epoch ~ '^[0-9]{4}' THEN left(i.epoch, 4)::int END)"
ACTIONS = ("delete", "reclass", "reshape", "add")
# 새 객체가 기억한 자리와 겹치나 — 가운데(면 위 점)가 그 모양 안 · 또는 겹침 비율 ≥ IOU
MATCH = ("d.geom && p.g AND (ST_Intersects(p.g, ST_PointOnSurface(d.geom)) OR "
         "ST_Area(ST_Intersection(ST_MakeValid(d.geom), ST_MakeValid(p.g))) >= {iou} * ST_Area(ST_Union(ST_MakeValid(d.geom), ST_MakeValid(p.g))))").format(iou=IOU)


# ── psycopg 연결을 asyncpg 모양으로(작업기 · 전국 작업기) ─────────────────────────
_PARAM = re.compile(r"\$(\d+)")


class SyncConn:
    def __init__(self, c):
        self.c = c

    def _run(self, sql: str, args):
        from psycopg.rows import dict_row
        q = _PARAM.sub(lambda m: f"%(p{m.group(1)})s", sql)
        cur = self.c.cursor(row_factory=dict_row)
        cur.execute(q, {f"p{i + 1}": v for i, v in enumerate(args)})
        return cur

    async def fetch(self, sql, *a):
        cur = self._run(sql, a)
        return cur.fetchall() if cur.description else []

    async def fetchrow(self, sql, *a):
        cur = self._run(sql, a)
        return cur.fetchone() if cur.description else None

    async def fetchval(self, sql, *a):
        r = await self.fetchrow(sql, *a)
        return next(iter(r.values())) if r else None

    async def execute(self, sql, *a):
        self._run(sql, a)


def apply_sync(pg_conn, job_id: str, *, force: bool = False) -> dict:
    """작업기용(동기 psycopg · 그 연결의 거래 안에서) — 부른 쪽이 commit 한다."""
    return asyncio.run(apply(SyncConn(pg_conn), job_id, force=force))


def _jl(v):
    if isinstance(v, str):
        try:
            return json.loads(v)
        except ValueError:
            return None
    return v


# ── 결과 묶음 파일(전국 결과 — 객체 줄을 데이터베이스에 쌓지 않는 묶음) ─────────────────
_FILES: "OrderedDict[str, dict]" = OrderedDict()


def result_file_features(job_id: str, tenant: str = "lx") -> dict:
    """결과 묶음 GeoJSON(E: · 작업기 마무리가 쓴 그대로) → {fid: feature}. 최근 6묶음 보관."""
    from . import config
    hit = _FILES.get(job_id)
    if hit is not None:
        _FILES.move_to_end(job_id)
        return hit
    p = config.DATA_ROOT / "results" / (tenant or "lx") / f"{job_id}.geojson"
    out: dict = {}
    if p.exists():
        d = json.loads(p.read_text(encoding="utf-8"))
        for f in d.get("features") or []:
            fid = str((f.get("properties") or {}).get("id") or f.get("id") or "")
            if fid:
                out[fid] = f
    _FILES[job_id] = out
    while len(_FILES) > 6:
        _FILES.popitem(last=False)
    return out


# ── 적용 ──────────────────────────────────────────────────────────────────
async def _job(conn, job_id: str):
    return await conn.fetchrow(
        f"SELECT j.id, j.tenant_id, j.model_id, j.imagery_id, j.card_id, coalesce(j.test, false) AS test, coalesce(j.demo, false) AS demo, "
        f"j.options, {YEAR_SQL} AS year, m.classes FROM jobs j LEFT JOIN imagery i ON i.id = j.imagery_id LEFT JOIN models m ON m.id = j.model_id "
        f"WHERE j.id = $1", job_id)


async def _sgg(conn, job_id: str, opts: dict) -> str | None:
    if opts.get("sgg_cd"):
        return str(opts["sgg_cd"])
    nat = opts.get("national") or {}
    if nat.get("cell"):
        return await conn.fetchval("SELECT sgg_cd FROM national_cells WHERE asset=$1 AND year=$2::int AND cell_cd=$3 LIMIT 1",
                                   str(nat.get("asset")), int(nat.get("year") or 0), str(nat["cell"]))
    return None


async def project_of_model(conn, model_id: str | None) -> str | None:
    """그 모델을 학습한 프로젝트(전국 분석 모델 = 경작지 새 판 → '경작지 v2' 프로젝트) — 서비스 카드가 없는 결과의 학습 데이터가 갈 곳."""
    if not model_id:
        return None
    return await conn.fetchval("SELECT j.options->>'project_id' FROM models m JOIN jobs j ON j.id = m.train_job WHERE m.id = $1", model_id)


def _objects(rows) -> list[dict]:
    """원래 고친 줄 → 객체마다 마지막 모습(지웠나 · 마지막 분류 · 마지막 모양 · 새로 그렸나)."""
    by: "OrderedDict[tuple, list]" = OrderedDict()
    for r in rows:
        by.setdefault((r["set_id"], r["fid"]), []).append(r)
    out = []
    for (_, _), es in by.items():
        es = sorted(es, key=lambda x: x["at"])
        first = es[0]
        add = next((e for e in es if e["action"] == "add"), None)
        dele = next((e for e in reversed(es) if e["action"] == "delete"), None)
        rc = next((e for e in reversed(es) if e["action"] == "reclass"), None)
        rs = next((e for e in reversed(es) if e["action"] == "reshape"), None)
        if add and dele:
            continue                                   # 새로 그렸다가 지운 것 — 기억할 것 없음
        out.append({"first": first, "add": add, "delete": dele, "reclass": rc, "reshape": rs,
                    "cls0": first["cls_before"] if not add else None,
                    "cls": (rc["cls_after"] if rc else None) or (add["cls_after"] if add else None),
                    "year": first["year"], "card_id": first["card_id"]})
    return out


async def _matches(conn, job_id: str, place_edit: str, cls: str, *, any_state: bool = False) -> list:
    st = "coalesce(d.edit_state, 'raw') <> 'deleted'" if any_state else "coalesce(d.edit_state, 'raw') NOT IN ('deleted', 'added')"
    geom = "coalesce(geom_after, geom_before)" if any_state else "coalesce(geom_before, geom_after)"
    return await conn.fetch(
        f"SELECT d.id, coalesce(d.fid, d.id::text) AS fid, d.cls FROM detections d, (SELECT {geom} AS g FROM result_edits WHERE id = $2) p "
        f"WHERE d.job_id = $1 AND {st} AND d.cls = $3 AND {MATCH} ORDER BY d.id", job_id, place_edit, cls)


async def _write(conn, *, eid, det_id, action, cls_after, src, base, job_id):
    await conn.execute(
        "INSERT INTO result_edits(id, tenant_id, set_id, det_id, fid, action, cls_before, cls_after, state_before, geom_before, conf_before, "
        "model_id, card_id, card_version, imagery_id, sgg_cd, source, by_user, test, year, from_edit, project_id, at) "
        "SELECT $1, d.tenant_id, d.job_id, d.id, coalesce(d.fid, d.id::text), $3, d.cls, $4, d.edit_state, ST_Multi(d.geom), d.conf, "
        "$5, $6, $7, $8, $9, 'memory', $10, $11, $12::int, $13, $14, clock_timestamp() FROM detections d WHERE d.id = $2 AND d.job_id = $15",
        eid, det_id, action, cls_after, base["model_id"], base["card_id"], base["card_version"], base["imagery_id"], base["sgg_cd"],
        src["by_user"], base["test"], base["year"], src["id"], base["project_id"], job_id)
    await conn.execute(
        "UPDATE result_edits e SET cls_before_id = (SELECT class_id FROM class_labels WHERE label = e.cls_before), "
        "cls_after_id = (SELECT class_id FROM class_labels WHERE label = e.cls_after) WHERE e.id = $1", eid)


def _eid() -> str:
    return "ed_" + secrets.token_hex(6)


async def apply(conn, job_id: str, *, force: bool = False) -> dict:
    """새 결과 한 묶음에 기억한 자리를 적용 → {places, applied, recheck, del_places, del_again}."""
    j = await _job(conn, job_id)
    if not j or j["demo"]:
        return {"skip": "no job"}
    have = await conn.fetchrow("SELECT * FROM edit_memory_runs WHERE job_id = $1", job_id)
    if have and not force:
        return {"skip": "done", **{k: have[k] for k in ("places", "applied", "recheck", "del_places", "del_again")}}
    if not await conn.fetchval("SELECT EXISTS (SELECT 1 FROM detections WHERE job_id = $1)", job_id):
        return {"skip": "no rows"}
    opts = _jl(j["options"]) or {}
    mcls = _jl(j["classes"]) or []
    dcls = [r["cls"] for r in await conn.fetch("SELECT DISTINCT cls FROM detections WHERE job_id = $1 AND cls IS NOT NULL", job_id)]
    classes = sorted({str(c) for c in list(mcls) + dcls if c})
    card = j["card_id"]
    if not card:
        card = await conn.fetchval("SELECT card_id FROM service_results WHERE set_id = $1 LIMIT 1", job_id)
    test = bool(j["test"])
    rows = await conn.fetch(
        "WITH ext AS (SELECT coalesce((SELECT aoi FROM jobs WHERE id = $1), (SELECT ST_SetSRID(ST_Extent(geom)::geometry, 4326) FROM detections WHERE job_id = $1)) AS g) "
        f"SELECT e.id, e.set_id, e.fid, e.action, e.cls_before, e.cls_after, e.by_user, e.at, e.card_id, "
        f"coalesce(e.year, (SELECT {YEAR_SQL} FROM imagery i WHERE i.id = e.imagery_id)) AS year, "
        "ST_Intersects(ext.g, coalesce(e.geom_before, e.geom_after)) AS inside "
        "FROM result_edits e, ext WHERE ext.g IS NOT NULL AND e.undone_at IS NULL AND e.action IN ('delete', 'reclass', 'reshape', 'add') "
        "AND e.source <> 'memory' AND e.set_id <> $1 AND e.test = $2 "
        "AND coalesce(e.geom_before, e.geom_after) && ext.g "
        "AND ((e.card_id IS NOT NULL AND e.card_id = $3::text) OR coalesce(e.cls_before, e.cls_after) = ANY($4::text[])) "
        "AND NOT EXISTS (SELECT 1 FROM result_edits x WHERE x.from_edit = e.id AND x.undone_at IS NOT NULL) "
        "ORDER BY e.at", job_id, test, card, classes)
    objs = _objects(rows)
    base = {"model_id": j["model_id"], "card_id": card, "imagery_id": j["imagery_id"], "test": test, "year": j["year"],
            "card_version": await conn.fetchval("SELECT service_version FROM service_results WHERE set_id = $1 LIMIT 1", job_id),
            "sgg_cd": await _sgg(conn, job_id, opts), "project_id": None}
    if not card and opts.get("national"):
        base["project_id"] = await project_of_model(conn, j["model_id"])
    out = {"places": len(objs), "applied": 0, "recheck": 0, "del_places": 0, "del_again": 0}
    touched: set = set()
    for o in objs:
        f = o["first"]
        other_year = j["year"] is not None and o["year"] is not None and int(j["year"]) != int(o["year"])
        if o["add"]:
            if other_year:
                continue                               # 다른 연도 영상에 새로 그린 것을 더하지 않는다(그 자리는 사람이 다시 본다)
            g_src = o["reshape"] or o["add"]           # 마지막 모양
            cls = o["cls"]
            if not cls:
                continue
            inside = await conn.fetchval(
                "SELECT ST_Intersects(coalesce((SELECT aoi FROM jobs WHERE id = $1), (SELECT ST_SetSRID(ST_Extent(geom)::geometry, 4326) FROM detections WHERE job_id = $1)), "
                "ST_PointOnSurface(geom_after)) FROM result_edits WHERE id = $2", job_id, g_src["id"])
            if not inside or await _matches(conn, job_id, g_src["id"], cls, any_state=True):
                continue                               # 새 결과가 이미 그 객체를 찾음 — 더하지 않는다
            eid = _eid()
            fid = "ed-" + eid[3:]
            ref = await conn.fetchrow("SELECT tenant_id, cls_en, cid FROM detections WHERE job_id = $1 AND cls = $2 LIMIT 1", job_id, cls)
            det = await conn.fetchval(
                "INSERT INTO detections(tenant_id, job_id, cls, cls_en, cid, conf, area_m2, geom, edited_by, edit_state, fid) "
                "SELECT $1, $2, $3, $4, $5, NULL, round(ST_Area(ST_Transform(geom_after, 5186))::numeric, 1), geom_after, $6, 'added', $7 "
                "FROM result_edits WHERE id = $8 RETURNING id",
                (ref["tenant_id"] if ref else None) or j["tenant_id"], job_id, cls, ref["cls_en"] if ref else None, ref["cid"] if ref else None,
                f["by_user"], fid, g_src["id"])
            await conn.execute(
                "INSERT INTO result_edits(id, tenant_id, set_id, det_id, fid, action, cls_after, geom_after, model_id, card_id, card_version, imagery_id, sgg_cd, "
                "source, by_user, test, year, from_edit, project_id, at) SELECT $1, $2, $3, $4, $5, 'add', $6, geom_after, $7, $8, $9, $10, $11, 'memory', $12, $13, "
                "$14::int, $15, $16, clock_timestamp() FROM result_edits WHERE id = $17",
                eid, (ref["tenant_id"] if ref else None) or j["tenant_id"], job_id, det, fid, cls, base["model_id"], base["card_id"], base["card_version"],
                base["imagery_id"], base["sgg_cd"], f["by_user"], test, base["year"], o["add"]["id"], base["project_id"], g_src["id"])
            await conn.execute("UPDATE result_edits e SET cls_after_id = (SELECT class_id FROM class_labels WHERE label = e.cls_after) WHERE e.id = $1", eid)
            out["applied"] += 1
            continue
        cls0 = o["cls0"]
        if not cls0:
            continue
        hits = [h for h in await _matches(conn, job_id, f["id"], cls0) if h["id"] not in touched]
        if o["delete"] and not other_year and f["inside"]:
            out["del_places"] += 1
            out["del_again"] += 1 if hits else 0
        if not hits:
            continue
        if other_year:                                 # 영상 연도가 다르면 적용하지 않고 '다시 확인'
            src = o["delete"] or o["reclass"] or o["reshape"]
            for h in hits:
                await conn.execute(
                    "INSERT INTO edit_rechecks(tenant_id, set_id, det_id, fid, from_edit, action, year_edit, year_now, test) "
                    "SELECT d.tenant_id, d.job_id, d.id, $2, $3, $4, $5::int, $6::int, $7 FROM detections d WHERE d.id = $1 ON CONFLICT DO NOTHING",
                    h["id"], h["fid"], src["id"], src["action"], o["year"], j["year"], test)
                out["recheck"] += 1
            continue
        for h in hits:
            touched.add(h["id"])
            if o["delete"]:
                await _write(conn, eid=_eid(), det_id=h["id"], action="delete", cls_after=None, src=o["delete"], base=base, job_id=job_id)
                await conn.execute("UPDATE detections SET edit_state = 'deleted', edited_by = $2 WHERE id = $1", h["id"], o["delete"]["by_user"])
                out["applied"] += 1
                continue
            if o["reclass"] and o["cls"] and o["cls"] != h["cls"]:
                await _write(conn, eid=_eid(), det_id=h["id"], action="reclass", cls_after=o["cls"], src=o["reclass"], base=base, job_id=job_id)
                ref = await conn.fetchrow("SELECT cls_en, cid FROM detections WHERE job_id = $1 AND cls = $2 LIMIT 1", job_id, o["cls"])
                await conn.execute("UPDATE detections SET cls = $2, cls_en = $3, cid = $4, edit_state = 'edited', edited_by = $5 WHERE id = $1",
                                   h["id"], o["cls"], ref["cls_en"] if ref else None, ref["cid"] if ref else None, o["reclass"]["by_user"])
                out["applied"] += 1
            if o["reshape"]:
                eid = _eid()
                await _write(conn, eid=eid, det_id=h["id"], action="reshape", cls_after=None, src=o["reshape"], base=base, job_id=job_id)
                await conn.execute("UPDATE result_edits SET geom_after = (SELECT geom_after FROM result_edits WHERE id = $2) WHERE id = $1", eid, o["reshape"]["id"])
                await conn.execute(
                    "UPDATE detections d SET geom = e.geom_after, area_m2 = round(ST_Area(ST_Transform(e.geom_after, 5186))::numeric, 1), "
                    "edit_state = 'edited', edited_by = $3 FROM result_edits e WHERE e.id = $2 AND d.id = $1", h["id"], o["reshape"]["id"], o["reshape"]["by_user"])
                out["applied"] += 1
    await conn.execute(
        "INSERT INTO edit_memory_runs(job_id, model_id, card_id, year, places, applied, recheck, del_places, del_again, test) "
        "VALUES ($1, $2, $3, $4::int, $5::int, $6::int, $7::int, $8::int, $9::int, $10) ON CONFLICT (job_id) DO UPDATE SET places = EXCLUDED.places, "
        "applied = edit_memory_runs.applied + EXCLUDED.applied, recheck = EXCLUDED.recheck, del_places = EXCLUDED.del_places, "
        "del_again = EXCLUDED.del_again, at = now()",
        job_id, j["model_id"], card, j["year"], out["places"], out["applied"], out["recheck"], out["del_places"], out["del_again"], test)
    return out


# ── 재기(배포 신청 · XI 재학습 줄) ──────────────────────────────────────────────
async def memory_for_model(conn, model_id: str | None, *, test: bool = False) -> dict | None:
    """그 판(모델)이 낸 새 결과들에서 — 지운 자리(같은 연도) n곳 중 다시 잡은 곳 m곳. 잰 결과가 없으면 None(지어내지 않음)."""
    if not model_id:
        return None
    r = await conn.fetchrow("SELECT coalesce(sum(del_places), 0) AS n, coalesce(sum(del_again), 0) AS m, count(*) AS runs FROM edit_memory_runs "
                            "WHERE model_id = $1 AND test = $2", model_id, test)
    if not r or not int(r["n"] or 0):
        return None
    from .envelope import env
    return {"places": env(int(r["n"]), "count", "measured", "지운 자리(그 판의 새 결과 범위 · 같은 영상 연도)"),
            "again": env(int(r["m"]), "count", "measured", "그중 새 결과가 다시 잡은 곳(같은 분류 · 가운데가 지운 모양 안이거나 겹침 0.5 이상)"),
            "runs": int(r["runs"])}


def memory_line(m: dict | None) -> str | None:
    if not m:
        return None
    return f"지운 자리 {m['places']['value']:,}곳 중 다시 잡은 곳 {m['again']['value']:,}곳"
