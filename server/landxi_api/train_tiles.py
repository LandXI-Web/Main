"""칸 → 학습 그림(결정 3 ⓐ 고치면 저절로 · 10-12 16:18 확인 · 원칙 205 · 228 · 마이그레이션 0055).

XI맵 그 자리 고치기로 고친 자리 둘레 한 칸(학습용 영상 조각 — 영상 + 그 안 모든 테두리)이, 마지막으로 고친 뒤 조용한 시간
(설정 tile_quiet_min · 기본 30분 — 설계 25차 train-unit)이 지나면 학습 데이터 1장이 된다.

  칸      결과 묶음(set_id) 안의 정해진 격자 한 칸. 좌표계 = 그 자리의 UTM(어느 나라든 미터 · 지역 하드코딩 없음).
          한 변 = PX(512) 화소 × 모델이 배운 해상도(models.gsd_trained_m · 없으면 영상 해상도). 고친 것의 가운데가 든 칸.
  빼기    같은 칸에서 같은 객체를 두 사람 이상이 다르게 고쳤으면(사람마다 마지막 고친 결과가 다름) 그 칸은 '둘이 다르게 고침'으로 뺀다.
          칸 안 고친 것을 모두 되돌리면 그 칸도 뺀다(dropped).
  영상    그 결과를 만든 영상 원천(imagery id — 지리원 API 타일 · 기관 영상 등)에서 그 칸을 다시 잘라 쓴다. 영상 파일은 쌓지 않는다 —
          학습 데이터 조각(512 화소 PNG + 테두리 txt)만 02. 데이터/training/xi-tiles/{서비스}/ 에 저장.
  테두리  그 칸에 드는 지금 결과 객체 전부(지운 것 빼고 · 고친 것은 고친 모양 · 새로 그린 것 포함)를 칸 경계로 잘라 YOLO 다각형 줄로.
          분류 순서 = 모델 머리 순서(+ 머리에 없는 새 클래스는 뒤에).
  다시    이미 1장이 된 칸을 또 고치면 기다림으로 돌아가 조용한 시간 뒤 다시 만든다(같은 줄 · version + 1 · 1장 그대로).

시험(test=True)은 시험 고친 기록만 · '시험' 칸 · xi-tiles/{서비스}-test/ 에 만들고 정리할 수 있다(drop_test).
화면 글에 경로 · id 를 쓰지 않는다. 숫자는 센 값.
"""
from __future__ import annotations

import asyncio
import datetime as dt
import hashlib
import json
import math
import secrets
from pathlib import Path

from . import config
from .envelope import KST

PX = 512
QUIET_MIN = 30
ROOT = config.DATA_ROOT / "training" / "xi-tiles"

LIVE = "e.undone_at IS NULL AND e.action <> 'memo' AND (e.cls_after_id IS NULL OR ca.status = 'approved')"
FROM = "FROM result_edits e LEFT JOIN classes ca ON ca.id = e.cls_after_id"


def utm_epsg(lon: float, lat: float) -> int:
    z = int((lon + 180) // 6) + 1
    return (32600 if lat >= 0 else 32700) + max(1, min(60, z))


def cell_of(x: float, y: float, size: float) -> tuple[int, int]:
    return int(math.floor(x / size)), int(math.floor(y / size))


def outcome(e: dict) -> tuple:
    """한 사람이 그 객체를 마지막으로 고친 결과(비교용) — 무엇을 · 어느 분류로 · 어떤 모양으로."""
    g = e.get("g_after") or ""
    return (e["action"], e.get("cls_after") or "", hashlib.md5(g.encode()).hexdigest() if e["action"] in ("reshape", "add") else "")


def conflict(edits: list[dict]) -> str | None:
    """같은 객체를 두 사람 이상이 다르게 고쳤나 → 까닭 | None(순수 함수 · 시험이 그대로 부른다)."""
    by_obj: dict = {}
    for e in sorted(edits, key=lambda x: x["at"]):
        key = e.get("det_id") or e.get("fid")
        by_obj.setdefault(key, {})[e["by_user"]] = outcome(e)          # 사람마다 마지막 것
    for _, per in by_obj.items():
        if len(per) > 1 and len(set(per.values())) > 1:
            return "같은 객체를 두 사람이 다르게 고침"
    return None


def yolo_lines(polys: list[tuple[int, list]], x0: float, y1: float, size: float) -> list[str]:
    """칸 좌표(UTM) 다각형 → YOLO 다각형 줄(0–1 · 위가 0). polys = [(분류 번호, [(x, y), …]), …]."""
    out = []
    for ci, ring in polys:
        pts = []
        for x, y in ring:
            u = min(1.0, max(0.0, (x - x0) / size))
            v = min(1.0, max(0.0, (y1 - y) / size))
            pts.append(f"{u:.6f} {v:.6f}")
        if len(pts) >= 3:
            out.append(f"{ci} " + " ".join(pts))
    return out


async def _settings(conn) -> dict:
    from .core import settings
    return await settings(conn)


async def _gsd(conn, model_id: str | None, imagery_id: str | None) -> float:
    g = await conn.fetchval("SELECT gsd_trained_m FROM models WHERE id=$1", model_id) if model_id else None
    if not g and imagery_id:
        g = await conn.fetchval("SELECT gsd_m FROM imagery WHERE id=$1", imagery_id)
    return float(g or 0.25)


async def _names(conn, model_id: str | None) -> list[str]:
    v = await conn.fetchval("SELECT classes FROM models WHERE id=$1", model_id) if model_id else None
    v = json.loads(v) if isinstance(v, str) else v
    return [str(x) for x in v] if isinstance(v, list) else []


async def scan(conn, *, test: bool = False, quiet_min: int | None = None, now: dt.datetime | None = None, make: bool = True) -> dict:
    """고친 기록 → 칸 묶기 · 상태 맞추기 · 조용해진 칸은 1장으로 만든다. 돌려주는 값 = 이번에 센 것."""
    now = now or dt.datetime.now(KST)
    st = await _settings(conn)
    q = int(st.get("tile_quiet_min", QUIET_MIN) if quiet_min is None else quiet_min)
    rows = await conn.fetch(
        f"SELECT e.id, e.set_id, e.det_id, e.fid, e.action, e.cls_after, e.by_user, e.at, e.card_id, e.model_id, e.imagery_id, "
        f"ST_X(ST_Centroid(coalesce(e.geom_after, e.geom_before))) AS lon, ST_Y(ST_Centroid(coalesce(e.geom_after, e.geom_before))) AS lat, "
        f"md5(coalesce(ST_AsBinary(e.geom_after), ''::bytea)) AS g_after "
        f"{FROM} WHERE {LIVE} AND e.test = $1 AND coalesce(e.geom_after, e.geom_before) IS NOT NULL", test)
    cells: dict = {}
    gsd_c: dict = {}
    from pyproj import Transformer
    tf: dict = {}
    for r in rows:
        k = (r["model_id"], r["imagery_id"])
        if k not in gsd_c:
            gsd_c[k] = await _gsd(conn, r["model_id"], r["imagery_id"])
        size = PX * gsd_c[k]
        epsg = utm_epsg(r["lon"], r["lat"])
        if epsg not in tf:
            tf[epsg] = Transformer.from_crs(4326, epsg, always_xy=True)
        x, y = tf[epsg].transform(r["lon"], r["lat"])
        gx, gy = cell_of(x, y, size)
        key = (r["set_id"], f"EPSG:{epsg}", gx, gy)
        c = cells.setdefault(key, {"edits": [], "size": size, "epsg": epsg, "card_id": r["card_id"], "model_id": r["model_id"],
                                   "imagery_id": r["imagery_id"]})
        c["edits"].append(dict(r))
    seen = set()
    out = {"cells": len(cells), "waiting": 0, "made": 0, "conflict": 0, "empty": 0, "failed": 0, "dropped": 0, "kept": 0, "quiet_min": q}
    for key, c in cells.items():
        set_id, crs, gx, gy = key
        eids = sorted(e["id"] for e in c["edits"])
        last = max(e["at"] for e in c["edits"])
        users = sorted({e["by_user"] for e in c["edits"]})
        why = conflict(c["edits"])
        old = await conn.fetchrow("SELECT * FROM train_tiles WHERE set_id=$1 AND crs=$2 AND gx=$3 AND gy=$4 AND test=$5", set_id, crs, gx, gy, test)
        seen.add(old["id"] if old else None)
        size = c["size"]
        bbox = await conn.fetchval("SELECT ST_AsText(ST_Transform(ST_MakeEnvelope($1::float8,$2::float8,$3::float8,$4::float8,$5::int), 4326))",
                                   gx * size, gy * size, (gx + 1) * size, (gy + 1) * size, c["epsg"])
        state = "conflict" if why else "waiting"
        if old and old["state"] == "made" and sorted(old["edit_ids"] or []) == eids and not why:
            out["kept"] += 1
            continue
        if old and old["state"] in ("conflict",) and why and sorted(old["edit_ids"] or []) == eids:
            out["conflict"] += 1
            continue
        tid = old["id"] if old else "tt_" + secrets.token_hex(5)
        if old:
            await conn.execute("UPDATE train_tiles SET state=$2, why=$3, edit_ids=$4, n_edits=$5, users=$6, last_edit_at=$7, card_id=$8, model_id=$9, "
                               "imagery_id=$10, size_m=$11, px=$12, bbox=ST_GeomFromText($13, 4326), updated_at=now() WHERE id=$1",
                               tid, state if why or old["state"] != "made" else "waiting", why, eids, len(eids), users, last, c["card_id"], c["model_id"],
                               c["imagery_id"], size, PX, bbox)
        else:
            await conn.execute("INSERT INTO train_tiles(id, card_id, set_id, model_id, imagery_id, crs, gx, gy, size_m, px, bbox, state, why, edit_ids, "
                               "n_edits, users, last_edit_at, test) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,ST_GeomFromText($11,4326),$12,$13,$14,$15,$16,$17,$18)",
                               tid, c["card_id"], set_id, c["model_id"], c["imagery_id"], crs, gx, gy, size, PX, bbox, state, why, eids, len(eids), users, last, test)
        if why:
            out["conflict"] += 1
            continue
        if not make or (now - last.astimezone(KST)).total_seconds() < q * 60:
            out["waiting"] += 1
            continue
        res = await make_tile(conn, tid)
        out[res] = out.get(res, 0) + 1
    # 칸 안 고친 것을 모두 되돌렸거나 다른 칸으로 옮겨 간 칸 → 뺀다
    stale = await conn.fetch("SELECT id FROM train_tiles WHERE test=$1 AND state IN ('waiting','made','conflict') AND NOT (id = ANY($2::text[]))",
                             test, [x for x in seen if x])
    for s in stale:
        await conn.execute("UPDATE train_tiles SET state='dropped', why='고친 것을 모두 되돌림', updated_at=now() WHERE id=$1", s["id"])
        out["dropped"] += 1
    return out


async def make_tile(conn, tid: str) -> str:
    """한 칸 → 영상 조각(그 영상 원천에서 다시 자름) + 테두리 파일. → 'made' | 'empty' | 'failed'."""
    t = await conn.fetchrow("SELECT * FROM train_tiles WHERE id=$1", tid)
    epsg = int(t["crs"].split(":")[1])
    size, px = float(t["size_m"]), int(t["px"])
    x0, y0 = t["gx"] * size, t["gy"] * size
    x1, y1 = x0 + size, y0 + size
    names = await _names(conn, t["model_id"])
    dets = await conn.fetch(
        "SELECT d.cls, ST_AsGeoJSON(ST_Intersection(ST_MakeValid(ST_Transform(d.geom, $2::int)), ST_MakeEnvelope($3::float8,$4::float8,$5::float8,$6::float8,$2::int))) AS g "
        "FROM detections d WHERE d.job_id=$1 AND coalesce(d.edit_state,'raw') <> 'deleted' AND d.geom IS NOT NULL "
        "AND ST_Intersects(d.geom, ST_Transform(ST_MakeEnvelope($3::float8,$4::float8,$5::float8,$6::float8,$2::int), 4326))", t["set_id"], epsg, x0, y0, x1, y1)
    polys = []
    for d in dets:
        cls = d["cls"] or ""
        if cls not in names:
            names.append(cls)
        g = json.loads(d["g"]) if d["g"] else None
        if not g:
            continue
        parts = []
        if g["type"] == "Polygon":
            parts = [g["coordinates"]]
        elif g["type"] == "MultiPolygon":
            parts = g["coordinates"]
        elif g["type"] == "GeometryCollection":
            for s in g.get("geometries") or []:
                parts += [s["coordinates"]] if s["type"] == "Polygon" else (s["coordinates"] if s["type"] == "MultiPolygon" else [])
        for p in parts:
            if p and len(p[0]) >= 4:
                polys.append((names.index(cls), p[0][:-1]))
    lines = yolo_lines(polys, x0, y1, size)
    sub = (t["card_id"] or "none") + ("-test" if t["test"] else "")
    d_img, d_lbl = ROOT / sub / "images", ROOT / sub / "labels"
    img_p, lbl_p = d_img / f"{tid}.png", d_lbl / f"{tid}.txt"
    try:
        ok = await asyncio.to_thread(_crop_save, t["imagery_id"], epsg, x0, y1, size, px, img_p)
    except Exception as e:  # noqa: BLE001
        await conn.execute("UPDATE train_tiles SET state='failed', why=$2, updated_at=now() WHERE id=$1", tid, f"영상을 다시 자르지 못함: {type(e).__name__}")
        return "failed"
    if not ok:
        await conn.execute("UPDATE train_tiles SET state='empty', why='그 자리 영상을 영상 원천에서 읽지 못함', updated_at=now() WHERE id=$1", tid)
        return "empty"
    d_lbl.mkdir(parents=True, exist_ok=True)
    lbl_p.write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")
    await conn.execute("UPDATE train_tiles SET state='made', why=NULL, names=$2, n_objects=$3, img_path=$4, lbl_path=$5, made_at=now(), "
                       "version=version+1, updated_at=now() WHERE id=$1", tid, json.dumps(names, ensure_ascii=False), len(lines), str(img_p), str(lbl_p))
    return "made"


def _crop_save(imagery_id: str | None, epsg: int, x0: float, y1: float, size: float, px: int, out: Path) -> bool:
    """영상 원천에서 칸(UTM · px×px)을 다시 잘라 PNG 로 — 메모리에서만 읽는다(지리원 API 는 그 칸 타일만)."""
    if not imagery_id:
        return False
    import numpy as np
    from rasterio.transform import from_origin
    from rasterio.warp import Resampling, reproject, transform_bounds
    from workers.imagery_src import open_imagery
    src = open_imagery(imagery_id)
    b = transform_bounds(f"EPSG:{epsg}", src.crs, x0, y1 - size, x0 + size, y1)
    pad = 4 * max(abs(src.res[0]), abs(src.res[1]))
    win = src.window(b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad).round_offsets().round_lengths()
    if win.width <= 0 or win.height <= 0:
        return False
    n = min(3, src.count)
    arr = src.read(list(range(1, n + 1)), window=win, boundless=True, fill_value=0)
    if arr.size == 0 or float(arr.mean()) < 1:
        return False
    if arr.dtype != np.uint8:
        hi = float(np.percentile(arr, 99.5)) or 1.0
        arr = np.clip(arr.astype("float32") / hi * 255, 0, 255).astype(np.uint8)
    dst = np.zeros((3, px, px), np.uint8)
    wt = src.window_transform(win)
    for i in range(3):
        reproject(arr[min(i, n - 1)], dst[i], src_transform=wt, src_crs=src.crs, dst_transform=from_origin(x0, y1, size / px, size / px),
                  dst_crs=f"EPSG:{epsg}", resampling=Resampling.bilinear)
    if float(dst.mean()) < 1:
        return False
    from PIL import Image
    out.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(dst.transpose(1, 2, 0)).save(out)
    return True


async def count_tiles(conn, *, card_id: str | None = None, since=None, test: bool = False) -> int:
    """학습 데이터(장) — 1장이 된 칸. since = 지난번 학습에 넣은 시각 뒤에 1장이 된(또는 다시 만든) 것."""
    q, a = ["state='made'", "test=$1"], [test]
    if card_id:
        a.append(card_id); q.append(f"card_id=${len(a)}")
    if since:
        a.append(since); q.append(f"made_at > ${len(a)}")
    return int(await conn.fetchval(f"SELECT count(*) FROM train_tiles WHERE {' AND '.join(q)}", *a) or 0)


def run_dataset(run_dir: Path, tiles: list[dict], base_yaml: Path | None) -> dict:
    """학습 한 건의 dataset.yaml — 지난 학습 데이터(프로젝트 표본) + 이 서비스의 XI맵 칸(분류 순서를 지난 묶음에 맞춰 다시 씀).
    칸 영상은 하드링크(같은 디스크면 자리를 더 쓰지 않음). 검증은 지난 묶음의 검증 그대로(같은 검증 묶음 비교는 그 뒤 따로)."""
    import os
    import shutil
    import yaml
    base = yaml.safe_load(base_yaml.read_text(encoding="utf-8")) if base_yaml and base_yaml.exists() else None
    names = None
    if base:
        nm = base.get("names")
        names = [str(v) for _, v in sorted(nm.items())] if isinstance(nm, dict) else [str(v) for v in (nm or [])]
    if not names:
        names = []
        for t in tiles:
            for n in (json.loads(t["names"]) if isinstance(t["names"], str) else (t["names"] or [])):
                if n not in names:
                    names.append(n)
    di, dl = run_dir / "images", run_dir / "labels"
    di.mkdir(parents=True, exist_ok=True)
    dl.mkdir(parents=True, exist_ok=True)
    dropped = 0
    for t in tiles:
        tn = json.loads(t["names"]) if isinstance(t["names"], str) else (t["names"] or [])
        src_i, src_l = Path(t["img_path"]), Path(t["lbl_path"])
        if not src_i.exists():
            continue
        dst_i = di / src_i.name
        if not dst_i.exists():
            try:
                os.link(src_i, dst_i)
            except OSError:
                shutil.copyfile(src_i, dst_i)
        lines = []
        for ln in (src_l.read_text(encoding="utf-8").splitlines() if src_l.exists() else []):
            p = ln.split()
            if not p:
                continue
            nm = tn[int(p[0])] if int(p[0]) < len(tn) else None
            if nm in names:
                lines.append(" ".join([str(names.index(nm))] + p[1:]))
            else:
                dropped += 1
        (dl / (src_i.stem + ".txt")).write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")
    train = [di.as_posix()]
    val = di.as_posix()
    if base:
        root = Path(base.get("path") or base_yaml.parent)
        if not root.is_absolute():
            root = base_yaml.parent / root
        tr = base.get("train")
        for x in (tr if isinstance(tr, list) else [tr]):
            if x:
                p = Path(x)
                train.insert(0, (p if p.is_absolute() else root / p).as_posix())
        v = base.get("val")
        if v:
            pv = Path(v if not isinstance(v, list) else v[0])
            val = (pv if pv.is_absolute() else root / pv).as_posix()
    body = "train:\n" + "".join(f"  - {t}\n" for t in train) + f"val: {val}\nnames:\n" + "".join(f"  {i}: \"{n}\"\n" for i, n in enumerate(names))
    y = run_dir / "dataset.yaml"
    y.write_text(body, encoding="utf-8")
    return {"yaml": y, "tiles": len(tiles), "names": names, "dropped_lines": dropped, "base": bool(base)}


async def drop_test(conn) -> int:
    """시험 칸 정리 — 줄 · 파일."""
    import shutil
    rows = await conn.fetch("SELECT id, card_id FROM train_tiles WHERE test")
    for sub in {(r["card_id"] or "none") + "-test" for r in rows}:
        shutil.rmtree(ROOT / sub, ignore_errors=True)
    await conn.execute("DELETE FROM train_tiles WHERE test")
    return len(rows)
