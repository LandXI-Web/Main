"""학습데이터 구축 — 플랫폼 안 수동 라벨링(10-18 · 원칙 55 · 74 · 확인 L-1 '새로 만든다' · 라벨-1 '1차 수동' · 질문 12 ⓐ 플랫폼 안 그리기).

라벨링 묶음 = 프로젝트의 학습데이터 묶음(train_samples · source='manual') 한 줄. 폴더 모양은 올린 묶음과 같다
(data/images/{train,val} · data/labels/{train,val} · _dataset.yaml) — 학습(POST /jobs samples=[묶음 id])이 그대로 쓰고,
학습 화면 · 공유 데이터 · 미리보기 · 빼기가 같은 길로 읽는다. '라벨 완료' 그림만 학습 목록에 들어간다.

GET    /projects/{pid}/labeling                 묶음(클래스 · 색 · 완료 수) + 그림 목록(상태 · 객체 수 · 누가 · 언제) + 그림을 더할 수 있는 영상
POST   /projects/{pid}/labeling/images          {imagery_id, n?} 프로젝트 영상에서 그림(512 화소 조각)을 n장 더한다(묶음이 없으면 만든다)
PATCH  /projects/{pid}/labeling/classes         {names:[..], colors:[..]} 클래스 더하기 · 이름 바꾸기 · 색 · (쓰지 않은 클래스) 빼기
GET    /labeling/images/{lid}/image?size=       그림(PNG · size 를 주면 작은 JPEG)
PUT    /labeling/images/{lid}                   {shapes:[{c, k:'poly'|'box', p:[[u,v],..]}], state:'todo'|'done'|'check', at?} 저장
DELETE /labeling/images/{lid}                   목록에서 빼기(쓸모없는 그림)

지도 위에서 라벨링(10-18 사용자 "왼쪽에 실제 지도에 라벨링 하는 영상이 보여야" — 아래 '지도 라벨링' 칸):
GET    /projects/{pid}/labeling/map             묶음 + 지도에 펼칠 영상(타일 · 범위) + 영상마다 그린 모양(경위도) + 라벨 완료한 자리 · 그림 + 대상 지역 테두리
GET    /projects/{pid}/labeling/map/spots       ?imagery= 이 프로젝트 AI 결과 자리(가운데 점) — '다음 자리'로 건너가기
PUT    /projects/{pid}/labeling/map/{iid}       {shapes:[{c, k, g:[[경도, 위도],..]}], at?} 그 영상의 모양 저장 → 라벨 완료한 자리의 그림 라벨을 다시 쓴다
POST   /projects/{pid}/labeling/map/{iid}/areas {bbox:[서, 남, 동, 북]} 그 화면 넓이 '라벨 완료' → 영상 격자의 512 화소 그림을 잘라 모양을 다각형 라벨로(같은 묶음)
DELETE /projects/{pid}/labeling/map/areas/{aid} 라벨 완료 풀기(그 자리 그림을 학습 목록에서 뺀다)

그림 자리: 영상 범위 안에서 고르게(무작위 · 겹치지 않게) — 한 변 512 화소 × 영상 해상도(0.1 m 보다 촘촘한 드론 영상은 0.1 m 로 줄여 자른다).
권한: 보기 = LX 직원 · 관리자 / 고치기 = 그 프로젝트의 프로젝트장 · 구성원. 화면 글에 경로 · id 를 쓰지 않는다. 숫자는 센 값.
"""
from __future__ import annotations

import io
import math
import random
import re
import secrets
import shutil
from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.responses import FileResponse, Response
from starlette.concurrency import run_in_threadpool

from .deps import ApiError, audit, db
from .envelope import KST, env, now_iso
from .projects import _dir_bytes, _is_member, _lx, _members, _people, _row, link
from .training import ROOT, _meta_of, write_lists

router = APIRouter()
PX = 512
MAX_IMAGES = 200            # 한 묶음 그림 수 한도(올린 묶음과 같은 200장)
ADD_MAX = 20                # 한 번에 더하는 그림
MAX_SHAPES = 400
MAX_PTS = 400
MAX_CLASSES = 30
GSD_MIN = 0.1               # 이보다 촘촘한 영상(드론)은 이 해상도로 줄여 자른다(한 장에 물체가 들어오게)
COLORS = ["#0FA9A0", "#FF7A45", "#3182F6", "#F04452", "#8C5EFF", "#FFC400", "#00B85C", "#FF5CB8"]
STATES = ("todo", "done", "check")
HEX = re.compile(r"^#[0-9A-Fa-f]{6}$")


def _iso(v):
    return v.astimezone(KST).isoformat(timespec="seconds") if v else None


async def _set_of(conn, pid: str):
    return await conn.fetchrow("SELECT s.* FROM train_samples s JOIN project_links l ON l.kind='sample' AND l.ref=s.id AND l.project_id=$1 "
                               "WHERE s.source='manual' AND s.status <> 'removed' ORDER BY s.created_at LIMIT 1", pid)


async def _can(conn, p, r) -> bool:
    return p.role in ("staff", "admin") and _is_member(p, r, await _members(conn, r["id"]))


async def _need_member(conn, p, pid: str):
    r = await _row(conn, pid)
    if not await _can(conn, p, r):
        raise ApiError("forbidden", "이 프로젝트의 프로젝트장 · 구성원만 라벨링할 수 있습니다")
    return r


async def _imagery_of(conn, r) -> list[dict]:
    """프로젝트 영상 — 대상 지역의 영상(/regions 와 같은 판정) + 프로젝트에 이은 영상. 분석 입력이 되는 정사영상만(지수 · 지형 · 결과 층 빼고)."""
    from .regions import derived
    ids = []
    dv = await derived()
    for g in r["regions"] or []:
        if not g.get("abroad"):
            ids += [x["id"] for x in dv["img"].get(g["code"], [])]
    ids += [x["ref"] for x in await conn.fetch("SELECT ref FROM project_links WHERE project_id=$1 AND kind='imagery'", r["id"])]
    abroad = [g["code"] for g in r["regions"] or [] if g.get("abroad")]
    if abroad:
        from .projects import _abroad_profiles
        prof = _abroad_profiles()
        for c in abroad:
            bb = (prof.get(c) or {}).get("bbox")
            if bb:
                ids += [x["id"] for x in await conn.fetch("SELECT id FROM imagery WHERE footprint IS NOT NULL AND ST_Intersects(footprint, ST_MakeEnvelope($1,$2,$3,$4,4326))", *bb)]
    ids = list(dict.fromkeys(ids))
    if not ids:
        return []
    rows = await conn.fetch("SELECT id, name, gsd_m, year, epoch FROM imagery WHERE id = ANY($1::text[]) AND coalesce(layer->>'role','imagery')='imagery' "
                            "AND coalesce(kind,'ortho') = 'ortho' AND footprint IS NOT NULL AND staff_visible", ids)
    out = []
    for x in rows:
        nm = (x["name"] or {}).get("ko") if isinstance(x["name"], dict) else x["name"]
        ep = str(x["year"] or x["epoch"] or "")
        out.append({"id": x["id"], "name": nm or "영상", "year": int(ep[:4]) if ep[:4].isdigit() else None,
                    "gsd_m": float(x["gsd_m"]) if x["gsd_m"] is not None else None})
    out.sort(key=lambda i: (-(i["year"] or 0), i["name"]))
    return out


def _names(v) -> list[str]:
    import json
    v = json.loads(v) if isinstance(v, str) else v
    return [str(x) for x in (v or [])]


def _pub_set(s, counts: dict) -> dict:
    names = _names(s["names"])
    cols = _names(s["colors"]) if s["colors"] else []
    cols = [cols[i] if i < len(cols) and HEX.match(cols[i]) else COLORS[i % len(COLORS)] for i in range(len(names))]
    return {"id": s["id"], "name": s["task_name"], "classes": [{"name": n, "color": c} for n, c in zip(names, cols)],
            **{k: env(counts.get(k, 0), "count", "measured", "라벨링 그림 상태") for k in ("total", "done", "check", "todo")},
            "updated_at": _iso(s["updated_at"])}


async def _counts(conn, sid: str) -> dict:
    rows = await conn.fetch("SELECT state, count(*) AS n FROM label_images WHERE sample_id=$1 AND NOT removed GROUP BY state", sid)
    c = {r["state"]: int(r["n"]) for r in rows}
    c["total"] = sum(c.values())
    return c


def _pub_img(x, people: dict) -> dict:
    who = lambda u: (people.get(u) or {}).get("name") if u else None
    return {"id": x["id"], "seq": x["seq"], "state": x["state"], "shapes": x["shapes"] if isinstance(x["shapes"], list) else _shapes_json(x["shapes"]),
            "by": who(x["updated_by"]), "at": _iso(x["updated_at"]), "done_by": who(x["done_by"]), "done_at": _iso(x["done_at"]),
            "src": f"/labeling/images/{x['id']}/image", "area": bool(x.get("area_id")) if hasattr(x, "get") else False}


def _shapes_json(v):
    import json
    try:
        return json.loads(v) if isinstance(v, str) else (v or [])
    except ValueError:
        return []


# ── 보기 ─────────────────────────────────────────────────────────────────────
@router.get("/projects/{pid}/labeling")
async def get_labeling(pid: str, request: Request):
    p = _lx(request)
    async with db(realm="lx") as conn:
        r = await _row(conn, pid)
        can = await _can(conn, p, r)
        s = await _set_of(conn, pid)
        people = await _people(conn)
        imgs = await conn.fetch("SELECT * FROM label_images WHERE sample_id=$1 AND NOT removed ORDER BY seq", s["id"]) if s else []
        counts = await _counts(conn, s["id"]) if s else {}
        imagery = await _imagery_of(conn, r)
        names = await _first_names(conn, r) if not s else None
    return {"set": _pub_set(s, counts) if s else None, "images": [_pub_img(x, people) for x in imgs], "imagery": imagery, "can_edit": can,
            "start_classes": names, "params": {"max_images": MAX_IMAGES, "add_max": ADD_MAX}, "as_of": now_iso()}


async def _first_names(conn, r) -> list[str]:
    """처음 클래스 — 이 프로젝트가 올린 학습데이터의 클래스 → 프로젝트 업무 이름."""
    row = await conn.fetchrow("SELECT s.names FROM train_samples s JOIN project_links l ON l.kind='sample' AND l.ref=s.id AND l.project_id=$1 "
                              "WHERE s.status <> 'removed' AND coalesce(s.source,'') <> 'manual' ORDER BY s.created_at DESC LIMIT 1", r["id"])
    names = _names(row["names"]) if row else []
    return names or [(r["task"] or r["name"] or "대상")[:40]]


# ── 묶음 만들기 · 그림 더하기 ─────────────────────────────────────────────────
async def _ensure_set(conn, p, r):
    s = await _set_of(conn, r["id"])
    if s:
        return s
    sid = "smp_" + secrets.token_hex(5)
    root = ROOT / sid
    for d in ("pool", "data/images/train", "data/images/val", "data/labels/train", "data/labels/val"):
        (root / d).mkdir(parents=True, exist_ok=True)
    names = await _first_names(conn, r)
    cols = [COLORS[i % len(COLORS)] for i in range(len(names))]
    await run_in_threadpool(write_lists, root, {"names": names, "items": []}, set())
    await conn.execute("INSERT INTO train_samples(id, task_name, dir, names, n_images, n_train, n_val, class_counts, class_images, label_kind, created_by, "
                       "source, colors) VALUES ($1,$2,$3,$4,0,0,0,'{}'::jsonb,'{}'::jsonb,'polygon',$5,'manual',$6)",
                       sid, (r["task"] or r["name"])[:40], str(root), names, p.user_id, cols)
    await link(conn, r["id"], "sample", sid, p.user_id)
    from .core import sample_classes_from_names
    await sample_classes_from_names(conn, sid, names, p.user_id)
    await audit(conn, p, "label.set.create", sid, None, {"project_id": r["id"], "classes": names})
    return await conn.fetchrow("SELECT * FROM train_samples WHERE id=$1", sid)


def _cut(imagery_id: str, gsd: float, n: int, used: set, seed: str, pool: Path, first_seq: int, sid: str) -> list[dict]:
    """영상 범위 안에서 고르게 n장 — 무작위 자리(정해진 격자에 맞춤 · 이미 쓴 칸 빼고) · 빈(어둡거나 한 색) 조각은 건너뛴다."""
    import psycopg
    from pyproj import Transformer
    from shapely import wkb
    from shapely.geometry import Point
    from shapely.ops import transform
    from PIL import Image, ImageStat
    from . import config
    from .train_tiles import _crop_save, utm_epsg
    with psycopg.connect(config.PG_WORKER_DSN.replace("@localhost:", "@127.0.0.1:")) as c:
        row = c.execute("SELECT ST_AsBinary(footprint) FROM imagery WHERE id=%s", (imagery_id,)).fetchone()
    if not row or not row[0]:
        return []
    fp = wkb.loads(bytes(row[0]))
    lon, lat = fp.centroid.x, fp.centroid.y
    epsg = utm_epsg(lon, lat)
    to_utm = Transformer.from_crs(4326, epsg, always_xy=True).transform
    g = transform(to_utm, fp)
    size = PX * gsd
    minx, miny, maxx, maxy = g.bounds
    rng = random.Random(seed)
    out, tried = [], 0
    while len(out) < n and tried < n * 12:
        tried += 1
        gx = math.floor(rng.uniform(minx, maxx) / size)
        gy = math.floor(rng.uniform(miny, maxy) / size)
        key = (f"EPSG:{epsg}", gx, gy)
        if key in used:
            continue
        used.add(key)
        x0, y0 = gx * size, gy * size
        if not g.contains(Point(x0 + size / 2, y0 + size / 2)):
            continue
        seq = first_seq + len(out)
        name = f"{sid}_{seq:04d}"
        path = pool / f"{name}.png"
        try:
            ok = _crop_save(imagery_id, epsg, x0, y0 + size, size, PX, path)
        except Exception:  # noqa: BLE001 — 그 자리 영상을 읽지 못함 → 다른 자리
            ok = False
        if not ok:
            continue
        with Image.open(path) as im:
            st = ImageStat.Stat(im.convert("L"))
            dark = sum(1 for v in im.convert("L").getdata() if v < 4) / (PX * PX)
        if st.stddev[0] < 6 or dark > 0.03:         # 한 색 · 영상 가장자리(검은 띠)
            path.unlink(missing_ok=True)
            continue
        out.append({"seq": seq, "name": name, "crs": f"EPSG:{epsg}", "x0": x0, "y1": y0 + size, "size": size})
    return out


@router.post("/projects/{pid}/labeling/images", status_code=201)
async def add_images(pid: str, body: dict, request: Request):
    p = _lx(request)
    iid = str(body.get("imagery_id") or "")
    try:
        n = max(1, min(ADD_MAX, int(body.get("n") or 10)))
    except (TypeError, ValueError):
        raise ApiError("bad_request", "장 수는 숫자입니다")
    async with db(realm="lx") as conn:
        r = await _need_member(conn, p, pid)
        imagery = {x["id"]: x for x in await _imagery_of(conn, r)}
        if iid not in imagery:
            raise ApiError("bad_request", "이 프로젝트 영상을 골라 주세요")
        s = await _ensure_set(conn, p, r)
        have = await conn.fetch("SELECT crs, x0, y1, size_m, seq FROM label_images WHERE sample_id=$1", s["id"])
        live = await conn.fetchval("SELECT count(*) FROM label_images WHERE sample_id=$1 AND NOT removed", s["id"])
        n = min(n, MAX_IMAGES - int(live or 0))
        if n <= 0:
            raise ApiError("bad_request", f"한 묶음은 {MAX_IMAGES}장까지입니다")
        gsd = max(GSD_MIN, imagery[iid]["gsd_m"] or 0.25)
        used = set()
        for h in have:
            if h["size_m"]:
                used.add((h["crs"], math.floor(h["x0"] / h["size_m"] + 1e-6), math.floor((h["y1"] - h["size_m"]) / h["size_m"] + 1e-6)))
        first = max([h["seq"] for h in have], default=0) + 1
        made = await run_in_threadpool(_cut, iid, gsd, n, used, f"{s['id']}:{iid}:{first}", Path(s["dir"]) / "pool", first, s["id"])
        for m in made:
            await conn.execute("INSERT INTO label_images(id, sample_id, seq, name, imagery_id, crs, x0, y1, size_m, px, split, created_by) "
                               "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)", "li_" + secrets.token_hex(6), s["id"], m["seq"], m["name"], iid,
                               m["crs"], m["x0"], m["y1"], m["size"], PX, "val" if m["seq"] % 5 == 0 else "train", p.user_id)
        await conn.execute("UPDATE train_samples SET updated_at=now() WHERE id=$1", s["id"])
        await audit(conn, p, "label.images.add", s["id"], None, {"imagery": iid, "asked": n, "made": len(made)})
    out = await get_labeling(pid, request)
    out["added"] = env(len(made), "count", "measured", "이번에 더한 그림")
    return out


# ── 그림 · 저장 ──────────────────────────────────────────────────────────────
async def _img(conn, lid: str):
    x = await conn.fetchrow("SELECT i.*, s.dir, s.names, s.status AS s_status FROM label_images i JOIN train_samples s ON s.id=i.sample_id WHERE i.id=$1", lid)
    if not x or x["removed"] or x["s_status"] == "removed":
        raise ApiError("not_found", "그림이 없습니다")
    return x


async def _project_of(conn, sid: str) -> str:
    return await conn.fetchval("SELECT project_id FROM project_links WHERE kind='sample' AND ref=$1 ORDER BY at NULLS LAST LIMIT 1", sid)


@router.get("/labeling/images/{lid}/image")
async def image(lid: str, request: Request, size: int = 0):
    _lx(request)
    async with db(realm="lx") as conn:
        x = await _img(conn, lid)
    f = Path(x["dir"]) / "pool" / f"{x['name']}.png"
    if not f.exists():
        raise ApiError("not_found", "그림 파일이 없습니다")
    if size and size < PX:
        def small():
            from PIL import Image
            with Image.open(f) as im:
                im = im.convert("RGB")
                im.thumbnail((max(48, size), max(48, size)))
                b = io.BytesIO()
                im.save(b, "JPEG", quality=78)
                return b.getvalue()
        return Response(await run_in_threadpool(small), media_type="image/jpeg", headers={"cache-control": "private, max-age=3600"})
    return FileResponse(f, media_type="image/png", headers={"cache-control": "private, max-age=3600"})


def _clean_shapes(raw, n_cls: int) -> list[dict]:
    if not isinstance(raw, list) or len(raw) > MAX_SHAPES:
        raise ApiError("bad_request", f"모양은 한 그림에 {MAX_SHAPES}개까지입니다")
    out = []
    for s in raw:
        if not isinstance(s, dict):
            raise ApiError("bad_request", "모양 형식이 맞지 않습니다")
        try:
            c = int(s.get("c"))
            pts = [[min(1.0, max(0.0, float(u))), min(1.0, max(0.0, float(v)))] for u, v in (s.get("p") or [])]
        except (TypeError, ValueError):
            raise ApiError("bad_request", "모양 형식이 맞지 않습니다")
        if not 0 <= c < n_cls:
            raise ApiError("bad_request", "없는 클래스입니다")
        k = "box" if s.get("k") == "box" else "poly"
        if k == "box":
            xs, ys = [q[0] for q in pts], [q[1] for q in pts]
            if len(pts) < 2:
                raise ApiError("bad_request", "사각형 모양이 맞지 않습니다")
            pts = [[min(xs), min(ys)], [max(xs), min(ys)], [max(xs), max(ys)], [min(xs), max(ys)]]
        if len(pts) < 3 or len(pts) > MAX_PTS:
            raise ApiError("bad_request", "다각형은 꼭짓점 3개 이상입니다")
        area = abs(sum(pts[i][0] * pts[i - 1][1] - pts[i - 1][0] * pts[i][1] for i in range(len(pts)))) / 2
        if area < 1e-6:                                   # 넓이가 없는 모양(한 점 · 한 줄)은 버린다
            continue
        out.append({"c": c, "k": k, "p": [[round(u, 6), round(v, 6)] for u, v in pts]})
    return out


def _sync_files(root: Path, name: str, split: str, state: str, shapes: list[dict], names: list[str]) -> dict:
    """라벨 완료면 학습 폴더에 그림(하드링크) + 테두리 줄(YOLO 다각형 · 사각형도 네 점), 아니면 학습 폴더에서 뺀다 → 다시 센다 · 학습 목록."""
    import os
    src = root / "pool" / f"{name}.png"
    for sp in ("train", "val"):
        (root / "data" / "images" / sp / f"{name}.png").unlink(missing_ok=True)
        (root / "data" / "labels" / sp / f"{name}.txt").unlink(missing_ok=True)
    if state == "done" and src.exists():
        di = root / "data" / "images" / split
        dl = root / "data" / "labels" / split
        di.mkdir(parents=True, exist_ok=True)
        dl.mkdir(parents=True, exist_ok=True)
        try:
            os.link(src, di / src.name)
        except OSError:
            shutil.copyfile(src, di / src.name)
        lines = [f"{s['c']} " + " ".join(f"{u:.6f} {v:.6f}" for u, v in s["p"]) for s in shapes]
        (dl / f"{name}.txt").write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")
    return _recount_set(root, names)


def _recount_set(root: Path, names: list[str]) -> dict:
    meta = _meta_of(root)
    meta["names"] = names
    write_lists(root, meta, set())
    from .training import _recount
    cc, ci = _recount(meta["items"], names)
    return {"n": len(meta["items"]), "train": sum(1 for i in meta["items"] if i["split"] == "train"),
            "val": sum(1 for i in meta["items"] if i["split"] == "val"), "cc": cc, "ci": ci, "bytes": _dir_bytes(str(root / "data"))}


async def _store_counts(conn, sid: str, m: dict):
    await conn.execute("UPDATE train_samples SET n_images=$2, n_train=$3, n_val=$4, class_counts=$5, class_images=$6, updated_at=now() WHERE id=$1",
                       sid, m["n"], m["train"], m["val"], m["cc"], m["ci"])
    await conn.execute("UPDATE project_links SET bytes=$2 WHERE kind='sample' AND ref=$1", sid, m["bytes"])


@router.put("/labeling/images/{lid}")
async def save(lid: str, body: dict, request: Request):
    p = _lx(request)
    state = body.get("state") or "todo"
    if state not in STATES:
        raise ApiError("bad_request", "상태는 라벨 안 함 · 라벨 완료 · 확인 필요 중 하나입니다")
    async with db(realm="lx") as conn:
        x = await _img(conn, lid)
        pid = await _project_of(conn, x["sample_id"])
        await _need_member(conn, p, pid)
        if x["area_id"]:
            raise ApiError("conflict", "지도에서 라벨 완료한 그림입니다 — 지도에서 고칩니다", None, 409)
        names = _names(x["names"])
        shapes = _clean_shapes(body.get("shapes") or [], len(names))
        seen = body.get("at")
        if seen is not None and x["updated_at"] and seen != _iso(x["updated_at"]):
            raise ApiError("conflict", "다른 사람이 먼저 이 그림을 고쳤습니다 — 다시 불러와 주세요", {"at": _iso(x["updated_at"])}, 409)
        async with conn.transaction():
            await conn.execute("UPDATE label_images SET shapes=$2, n_objects=$3, state=$4, updated_by=$5, updated_at=now(), "
                               "done_by=CASE WHEN $4='done' THEN $5 ELSE NULL END, done_at=CASE WHEN $4='done' THEN now() ELSE NULL END WHERE id=$1",
                               lid, shapes, len(shapes), state, p.user_id)
            m = await run_in_threadpool(_sync_files, Path(x["dir"]), x["name"], x["split"], state, shapes, names)
            await _store_counts(conn, x["sample_id"], m)
            await audit(conn, p, "label.save", lid, {"state": x["state"], "objects": x["n_objects"]}, {"state": state, "objects": len(shapes), "sample": x["sample_id"]})
        people = await _people(conn)
        row = await conn.fetchrow("SELECT * FROM label_images WHERE id=$1", lid)
        s = await conn.fetchrow("SELECT * FROM train_samples WHERE id=$1", x["sample_id"])
        counts = await _counts(conn, x["sample_id"])
    return {"image": _pub_img(row, people), "set": _pub_set(s, counts), "as_of": now_iso()}


@router.delete("/labeling/images/{lid}")
async def remove(lid: str, request: Request):
    p = _lx(request)
    async with db(realm="lx") as conn:
        x = await _img(conn, lid)
        pid = await _project_of(conn, x["sample_id"])
        await _need_member(conn, p, pid)
        if x["area_id"]:
            raise ApiError("conflict", "지도에서 라벨 완료한 그림입니다 — 지도에서 라벨 완료를 풉니다", None, 409)
        await conn.execute("UPDATE label_images SET removed=true, updated_by=$2, updated_at=now() WHERE id=$1", lid, p.user_id)
        m = await run_in_threadpool(_sync_files, Path(x["dir"]), x["name"], x["split"], "todo", [], _names(x["names"]))
        await _store_counts(conn, x["sample_id"], m)
        await audit(conn, p, "label.image.remove", lid, {"state": x["state"]}, None)
        s = await conn.fetchrow("SELECT * FROM train_samples WHERE id=$1", x["sample_id"])
        counts = await _counts(conn, x["sample_id"])
    return {"ok": True, "set": _pub_set(s, counts), "as_of": now_iso()}


# ── 클래스 관리(더하기 · 이름 바꾸기 · 색 · 쓰지 않은 클래스 빼기) ────────────────────
@router.patch("/projects/{pid}/labeling/classes")
async def classes(pid: str, body: dict, request: Request):
    """names 는 지금 클래스 순서 그대로(이름 바꾸기 = 같은 자리 새 이름 · 더하기 = 뒤에) · drop = 뺄 클래스 번호(어느 그림에도 쓰지 않은 것만)."""
    p = _lx(request)
    async with db(realm="lx") as conn:
        r = await _need_member(conn, p, pid)
        s = await _ensure_set(conn, p, r)
        old = _names(s["names"])
        new = [" ".join(str(x or "").split())[:40] for x in (body.get("names") or [])]
        cols = [str(c) for c in (body.get("colors") or [])]
        drop = body.get("drop")
        if drop is not None:
            try:
                d = int(drop)
            except (TypeError, ValueError):
                raise ApiError("bad_request", "뺄 클래스 번호가 맞지 않습니다")
            if not 0 <= d < len(old) or len(old) <= 1:
                raise ApiError("bad_request", "클래스는 하나 이상 있어야 합니다")
            used = await conn.fetchval("SELECT count(*) FROM label_images i, jsonb_array_elements(i.shapes) e WHERE i.sample_id=$1 AND NOT i.removed "
                                       "AND (e->>'c')::int = $2", s["id"], d)
            used = int(used or 0) + int(await conn.fetchval("SELECT count(*) FROM label_maps m, jsonb_array_elements(m.shapes) e WHERE m.sample_id=$1 "
                                                            "AND (e->>'c')::int = $2", s["id"], d) or 0)
            if used:
                raise ApiError("conflict", f"이 클래스로 그린 모양이 {used}개 있어 뺄 수 없습니다 — 이름을 바꿔 쓰세요", {"shapes": int(used)}, 409)
            new = [n for i, n in enumerate(old) if i != d]
            oc = _names(s["colors"]) if s["colors"] else []
            cols = [c for i, c in enumerate(oc) if i != d]
        else:
            if len(new) < len(old) or not all(new):
                raise ApiError("bad_request", "클래스 이름을 모두 적어 주세요")
            if len(new) > MAX_CLASSES:
                raise ApiError("bad_request", f"클래스는 {MAX_CLASSES}개까지입니다")
        if len(set(new)) != len(new):
            raise ApiError("bad_request", "같은 이름의 클래스가 있습니다")
        cols = [cols[i] if i < len(cols) and HEX.match(cols[i]) else COLORS[i % len(COLORS)] for i in range(len(new))]
        async with conn.transaction():
            if drop is not None:                         # 뒤 번호를 하나씩 당긴다(쓴 모양이 없는 클래스만 빼므로 그 번호의 모양은 없다)
                rows = await conn.fetch("SELECT id, shapes, state, name, split FROM label_images WHERE sample_id=$1", s["id"])
                for x in rows:
                    sh = _shapes_json(x["shapes"])
                    if any(q["c"] > d for q in sh):
                        sh = [{**q, "c": q["c"] - 1 if q["c"] > d else q["c"]} for q in sh]
                        await conn.execute("UPDATE label_images SET shapes=$2 WHERE id=$1", x["id"], sh)
                        if x["state"] == "done":
                            await run_in_threadpool(_sync_files, Path(s["dir"]), x["name"], x["split"], "done", sh, new)
                for x in await conn.fetch("SELECT imagery_id, shapes FROM label_maps WHERE sample_id=$1", s["id"]):
                    sh = _shapes_json(x["shapes"])
                    if any(q["c"] > d for q in sh):
                        await conn.execute("UPDATE label_maps SET shapes=$3 WHERE sample_id=$1 AND imagery_id=$2", s["id"], x["imagery_id"],
                                           [{**q, "c": q["c"] - 1 if q["c"] > d else q["c"]} for q in sh])
            await conn.execute("UPDATE train_samples SET names=$2, colors=$3, updated_at=now() WHERE id=$1", s["id"], new, cols)
            m = await run_in_threadpool(_recount_set, Path(s["dir"]), new)
            await _store_counts(conn, s["id"], m)
            if new != old:
                from .core import sample_classes_from_names
                await conn.execute("DELETE FROM sample_classes WHERE sample_id=$1", s["id"])
                await sample_classes_from_names(conn, s["id"], new, p.user_id)
            await audit(conn, p, "label.classes", s["id"], {"names": old}, {"names": new})
    return await get_labeling(pid, request)


# ── 지도 라벨링(10-18 사용자 "왼쪽에 실제 지도에 라벨링 하는 영상이 보여야 이쁠거 같은데") ─────────────────────
#   모양은 영상마다 경위도로 한 줄(label_maps). '라벨 완료'는 넓이 — 화면 안에 다 들어오는 영상 격자 칸(512 화소 × 영상 해상도 · 그림 보기와 같은 격자)을
#   그림으로 잘라 label_images 에 넣고(area_id), 그 칸 안의 모양을 잘라 다각형 라벨로 쓴다 → 그림 보기와 같은 묶음 · 같은 폴더 · 같은 학습 목록.
#   모양을 고치면 라벨 완료한 칸의 라벨을 다시 쓴다. 그림 보기가 먼저 만든 칸은 건너뛴다(한 자리 한 그림).
MAP_SHAPES = 2000
AREA_MAX = 40               # 한 번에 라벨 완료하는 그림(칸) 수
SPOTS = 600
_TR: dict = {}


def _tr(a: int, b: int):
    from pyproj import Transformer
    k = (a, b)
    if k not in _TR:
        _TR[k] = Transformer.from_crs(a, b, always_xy=True).transform
    return _TR[k]


def _epsg_of(crs: str) -> int:
    return int(str(crs).split(":")[-1])


def _ring_of(crs: str, x0: float, y1: float, size: float) -> list:
    """UTM 칸 → 경위도 테두리(닫힌 고리 · 지도 그리기용)"""
    f = _tr(_epsg_of(crs), 4326)
    pts = [(x0, y1), (x0 + size, y1), (x0 + size, y1 - size), (x0, y1 - size), (x0, y1)]
    return [[round(a, 7), round(b, 7)] for a, b in (f(x, y) for x, y in pts)]


def _clean_geo(raw, n_cls: int) -> list[dict]:
    if not isinstance(raw, list) or len(raw) > MAP_SHAPES:
        raise ApiError("bad_request", f"모양은 한 영상에 {MAP_SHAPES}개까지입니다")
    out = []
    for s in raw:
        if not isinstance(s, dict):
            raise ApiError("bad_request", "모양 형식이 맞지 않습니다")
        try:
            c = int(s.get("c"))
            g = [[float(a), float(b)] for a, b in (s.get("g") or [])]
        except (TypeError, ValueError):
            raise ApiError("bad_request", "모양 형식이 맞지 않습니다")
        if not 0 <= c < n_cls:
            raise ApiError("bad_request", "없는 클래스입니다")
        if not all(math.isfinite(a) and math.isfinite(b) and -180 <= a <= 180 and -90 <= b <= 90 for a, b in g):
            raise ApiError("bad_request", "모양 자리가 맞지 않습니다")
        if len(g) > 1 and g[0] == g[-1]:
            g = g[:-1]
        k = "box" if s.get("k") == "box" else "poly"
        if k == "box":
            if len(g) < 2:
                raise ApiError("bad_request", "사각형 모양이 맞지 않습니다")
            xs, ys = [q[0] for q in g], [q[1] for q in g]
            g = [[min(xs), max(ys)], [max(xs), max(ys)], [max(xs), min(ys)], [min(xs), min(ys)]]
        if len(g) < 3 or len(g) > MAX_PTS:
            raise ApiError("bad_request", "다각형은 꼭짓점 3개 이상입니다")
        area = abs(sum(g[i][0] * g[i - 1][1] - g[i - 1][0] * g[i][1] for i in range(len(g)))) / 2
        if area < 1e-14:                                  # 넓이가 없는 모양(한 점 · 한 줄)
            continue
        sid = str(s.get("id") or "")[:24] or "s" + secrets.token_hex(4)
        out.append({"id": sid, "c": c, "k": k, "g": [[round(a, 8), round(b, 8)] for a, b in g]})
    return out


def _chip_shapes(geo: list[dict], epsg: int, x0: float, y1: float, size: float) -> list[dict]:
    """경위도 모양 → 그 칸 안 0–1 다각형(위가 0) — 칸 밖은 잘라낸다 · 여러 조각이면 조각마다 한 모양(구멍은 YOLO 다각형에 없음)"""
    from shapely.geometry import Polygon, box
    from shapely.ops import transform
    f = _tr(4326, epsg)
    cell = box(x0, y1 - size, x0 + size, y1)
    out = []
    for s in geo:
        try:
            pg = transform(f, Polygon(s["g"]))
            if not pg.is_valid:
                pg = pg.buffer(0)
            if not pg.intersects(cell):
                continue
            part = pg.intersection(cell)
        except Exception:  # noqa: BLE001 — 모양이 꼬였으면 그 모양만 건너뛴다
            continue
        parts = [part] if part.geom_type == "Polygon" else [q for q in getattr(part, "geoms", []) if q.geom_type == "Polygon"]
        for q in parts:
            if q.area < (size * size) * 1e-6:
                continue
            pts = [[min(1.0, max(0.0, (x - x0) / size)), min(1.0, max(0.0, (y1 - y) / size))] for x, y in list(q.exterior.coords)[:-1]]
            if len(pts) >= 3:
                out.append({"c": s["c"], "k": "poly", "p": [[round(u, 6), round(v, 6)] for u, v in pts]})
    return out


def _write_chip(root: Path, name: str, split: str, shapes: list[dict], done: bool):
    """한 그림의 학습 폴더 파일(그림 하드링크 + 라벨 줄) — 다시 세기는 부른 쪽이 한 번(_recount_set)"""
    import os
    src = root / "pool" / f"{name}.png"
    for sp in ("train", "val"):
        (root / "data" / "images" / sp / f"{name}.png").unlink(missing_ok=True)
        (root / "data" / "labels" / sp / f"{name}.txt").unlink(missing_ok=True)
    if not done or not src.exists():
        return
    di, dl = root / "data" / "images" / split, root / "data" / "labels" / split
    di.mkdir(parents=True, exist_ok=True)
    dl.mkdir(parents=True, exist_ok=True)
    try:
        os.link(src, di / src.name)
    except OSError:
        shutil.copyfile(src, di / src.name)
    lines = [f"{s['c']} " + " ".join(f"{u:.6f} {v:.6f}" for u, v in s["p"]) for s in shapes]
    (dl / f"{name}.txt").write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")


_ITEMS: dict = {}


async def _map_items(p, ids: list[str]) -> dict:
    """지도에 펼칠 영상 — 카탈로그와 같은 항목(타일 주소 · 범위 · 해상도 · 테두리 · 권한 관문 그대로) · 같은 권한이면 1분 보관(영상 목록은 드물게 바뀐다)"""
    import time
    from .catalog import layer_items, public_view
    k = (p.realm, p.role, p.tenant_id)
    hit = _ITEMS.get(k)
    if hit and time.time() - hit[0] < 60:
        items = hit[1]
    else:
        _, items = await layer_items(p, None)
        if len(_ITEMS) > 50:
            _ITEMS.clear()
        _ITEMS[k] = (time.time(), items)
    want = set(ids)
    out = {}
    for it in items:
        if it["id"] in want and it.get("bounds"):
            v = public_view(it)
            v["footprint"] = it.get("_fp")
            out[it["id"]] = v
    return out


def _outline(r) -> dict:
    """대상 지역 테두리(시군구 · 화면 지도와 같은 그림)"""
    from .regions import _static_geom, region_of
    fs = []
    for g in r["regions"] or []:
        if g.get("abroad"):
            continue
        rr = region_of(g.get("code"))
        geo = _static_geom(rr) if rr else None
        if geo:
            fs.append({"type": "Feature", "properties": {"name": g.get("name") or rr.get("name")}, "geometry": geo})
    return {"type": "FeatureCollection", "features": fs}


async def _map_state(conn, s) -> tuple[dict, list, list]:
    """영상마다 모양 · 라벨 완료한 자리 · 지도에 그릴 그림 칸(그림 보기 칸 포함)"""
    if not s:
        return {}, [], []
    people = await _people(conn)
    who = lambda u: (people.get(u) or {}).get("name") if u else None
    maps = {x["imagery_id"]: {"shapes": _shapes_json(x["shapes"]), "n": x["n_objects"], "by": who(x["updated_by"]), "at": _iso(x["updated_at"])}
            for x in await conn.fetch("SELECT * FROM label_maps WHERE sample_id=$1", s["id"])}
    areas = [{"id": a["id"], "imagery_id": a["imagery_id"], "n": a["n_images"], "by": who(a["done_by"]), "at": _iso(a["done_at"])}
             for a in await conn.fetch("SELECT * FROM label_areas WHERE sample_id=$1 AND NOT removed ORDER BY done_at", s["id"])]
    chips = []
    for x in await conn.fetch("SELECT id, imagery_id, crs, x0, y1, size_m, state, area_id, seq, n_objects FROM label_images "
                              "WHERE sample_id=$1 AND NOT removed AND size_m IS NOT NULL ORDER BY seq", s["id"]):
        chips.append({"id": x["id"], "imagery_id": x["imagery_id"], "state": x["state"], "area": x["area_id"], "seq": x["seq"], "n": x["n_objects"],
                      "ring": _ring_of(x["crs"], x["x0"], x["y1"], x["size_m"])})
    return maps, areas, chips


@router.get("/projects/{pid}/labeling/map")
async def get_map(pid: str, request: Request):
    p = _lx(request)
    async with db(realm="lx") as conn:
        r = await _row(conn, pid)
        can = await _can(conn, p, r)
        s = await _set_of(conn, pid)
        imagery = await _imagery_of(conn, r)
        counts = await _counts(conn, s["id"]) if s else {}
        maps, areas, chips = await _map_state(conn, s)
        names = await _first_names(conn, r) if not s else None
    items = await _map_items(p, [x["id"] for x in imagery])
    imgs = [{**x, "item": items[x["id"]]} for x in imagery if x["id"] in items]
    # 처음 영상 — 모양이 가장 많은 영상 → 이 프로젝트가 AI 분석한 영상 → 항공 해상도(0.05–0.5 m) 중 가장 최근 → 첫 영상
    pick, spots, sign = None, [], None
    if imgs:
        most = max(imgs, key=lambda x: len((maps.get(x["id"]) or {}).get("shapes") or []))
        async with db(realm="lx") as conn:
            ran = {x["imagery_id"] for x in await conn.fetch("SELECT DISTINCT imagery_id FROM jobs WHERE kind='infer' AND state='done' "
                                                             "AND options->>'project_id' = $1", pid)}
            pick = (most if (maps.get(most["id"]) or {}).get("shapes") else None) or next((x for x in imgs if x["id"] in ran), None)                 or next((x for x in imgs if x["gsd_m"] and 0.05 <= x["gsd_m"] <= 0.5), None) or imgs[0]
            spots = await _spots(conn, pid, pick["id"])
        # 처음 영상이 서명 타일(원본 동적 타일 · LX 전용 조각)이면 서명 주소도 같이 — 지도가 서명을 따로 묻는 왕복 한 번을 던다(같은 권한 관문)
        it = pick["item"]
        if it.get("source") == "cog" or it.get("signed"):
            try:
                from .tiles import tiles_sign
                sign = await tiles_sign(it["set"], request)
            except Exception:  # noqa: BLE001 — 지도가 스스로 묻는다
                sign = None
        else:
            sign = None
        pick = pick["id"]
    return {"set": _pub_set(s, counts) if s else None, "imagery": imgs, "pick": pick, "pick_sign": sign, "spots": spots, "maps": maps, "areas": areas, "chips": chips, "outline": _outline(r),
            "can_edit": can, "start_classes": names, "params": {"max_images": MAX_IMAGES, "area_max": AREA_MAX, "px": PX, "gsd_min": GSD_MIN},
            "as_of": now_iso()}


@router.get("/projects/{pid}/labeling/map/spots")
async def map_spots(pid: str, request: Request, imagery: str = ""):
    """이 프로젝트가 돌린 AI 분석 결과의 자리(가운데 점) — 그 영상 범위 안 · 큰 것부터 · 라벨할 곳으로 건너가기(결과 모양은 내지 않는다)"""
    p = _lx(request)
    async with db(realm="lx") as conn:
        r = await _row(conn, pid)
        if imagery not in {x["id"] for x in await _imagery_of(conn, r)}:
            raise ApiError("bad_request", "이 프로젝트 영상을 골라 주세요")
        return {"spots": await _spots(conn, pid, imagery), "as_of": now_iso()}


async def _spots(conn, pid: str, iid: str) -> list:
    rows = await conn.fetch(
        "SELECT ST_X(ST_PointOnSurface(d.geom)) AS x, ST_Y(ST_PointOnSurface(d.geom)) AS y, d.cls FROM detections d "
        "JOIN jobs j ON j.id = d.job_id AND j.kind='infer' AND j.state='done' AND j.options->>'project_id' = $1 "
        "JOIN imagery i ON i.id = $2 AND i.footprint IS NOT NULL "
        "WHERE d.edit_state <> 'deleted' AND d.geom && i.footprint AND ST_Intersects(d.geom, i.footprint) "
        "ORDER BY d.area_m2 DESC NULLS LAST LIMIT $3", pid, iid, SPOTS)
    return [[round(x["x"], 7), round(x["y"], 7), x["cls"]] for x in rows]


async def _resync_areas(conn, s, iid: str, geo: list[dict]) -> int:
    """그 영상의 라벨 완료한 칸 그림 라벨을 지금 모양으로 다시 쓴다 → 바뀐 그림 수"""
    rows = await conn.fetch("SELECT id, name, split, crs, x0, y1, size_m, shapes FROM label_images WHERE sample_id=$1 AND imagery_id=$2 "
                            "AND area_id IS NOT NULL AND NOT removed", s["id"], iid)
    if not rows:
        return 0
    names = _names(s["names"])
    root = Path(s["dir"])
    changed = []
    for x in rows:
        sh = _chip_shapes(geo, _epsg_of(x["crs"]), x["x0"], x["y1"], x["size_m"])
        if sh != _shapes_json(x["shapes"]):
            changed.append((x, sh))
    for x, sh in changed:
        await conn.execute("UPDATE label_images SET shapes=$2, n_objects=$3, updated_at=now() WHERE id=$1", x["id"], sh, len(sh))

    def files():
        for x, sh in changed:
            _write_chip(root, x["name"], x["split"], sh, True)
        return _recount_set(root, names)
    if changed:
        await _store_counts(conn, s["id"], await run_in_threadpool(files))
    return len(changed)


async def _map_out(conn, s) -> dict:
    counts = await _counts(conn, s["id"])
    maps, areas, chips = await _map_state(conn, s)
    s2 = await conn.fetchrow("SELECT * FROM train_samples WHERE id=$1", s["id"])
    return {"set": _pub_set(s2, counts), "maps": maps, "areas": areas, "chips": chips, "as_of": now_iso()}


@router.put("/projects/{pid}/labeling/map/{iid}")
async def save_map(pid: str, iid: str, body: dict, request: Request):
    p = _lx(request)
    async with db(realm="lx") as conn:
        r = await _need_member(conn, p, pid)
        if iid not in {x["id"] for x in await _imagery_of(conn, r)}:
            raise ApiError("bad_request", "이 프로젝트 영상을 골라 주세요")
        s = await _ensure_set(conn, p, r)
        geo = _clean_geo(body.get("shapes") or [], len(_names(s["names"])))
        old = await conn.fetchrow("SELECT * FROM label_maps WHERE sample_id=$1 AND imagery_id=$2", s["id"], iid)
        seen = body.get("at")
        if old and seen is not None and old["updated_at"] and seen != _iso(old["updated_at"]):
            raise ApiError("conflict", "다른 사람이 먼저 이 영상의 라벨을 고쳤습니다 — 다시 불러와 주세요", {"at": _iso(old["updated_at"])}, 409)
        async with conn.transaction():
            await conn.execute("INSERT INTO label_maps(sample_id, imagery_id, shapes, n_objects, updated_by, updated_at) VALUES ($1,$2,$3,$4,$5,now()) "
                               "ON CONFLICT (sample_id, imagery_id) DO UPDATE SET shapes=EXCLUDED.shapes, n_objects=EXCLUDED.n_objects, "
                               "updated_by=EXCLUDED.updated_by, updated_at=now()", s["id"], iid, geo, len(geo), p.user_id)
            n = await _resync_areas(conn, s, iid, geo)
            await conn.execute("UPDATE train_samples SET updated_at=now() WHERE id=$1", s["id"])
            await audit(conn, p, "label.map.save", s["id"], {"objects": old["n_objects"] if old else 0}, {"imagery": iid, "objects": len(geo), "images": n})
        return await _map_out(conn, s)


@router.post("/projects/{pid}/labeling/map/{iid}/areas", status_code=201)
async def map_area(pid: str, iid: str, body: dict, request: Request):
    """bbox(화면 넓이) 안에 다 들어오는 영상 격자 칸 → 그림으로 잘라 '라벨 완료'(그 안 모양 = 다각형 라벨 · 모양 없는 칸 = 대상 없는 그림)"""
    p = _lx(request)
    try:
        w, so, e, n = [float(v) for v in body.get("bbox") or []]
        assert w < e and so < n
    except Exception:  # noqa: BLE001
        raise ApiError("bad_request", "화면 범위가 맞지 않습니다")
    async with db(realm="lx") as conn:
        r = await _need_member(conn, p, pid)
        imagery = {x["id"]: x for x in await _imagery_of(conn, r)}
        if iid not in imagery:
            raise ApiError("bad_request", "이 프로젝트 영상을 골라 주세요")
        s = await _ensure_set(conn, p, r)
        gsd = max(GSD_MIN, imagery[iid]["gsd_m"] or 0.25)
        size = PX * gsd
        fp_wkb = await conn.fetchval("SELECT ST_AsBinary(footprint) FROM imagery WHERE id=$1", iid)
        have = await conn.fetch("SELECT crs, x0, y1, size_m FROM label_images WHERE sample_id=$1 AND NOT removed AND size_m IS NOT NULL", s["id"])
        live = int(await conn.fetchval("SELECT count(*) FROM label_images WHERE sample_id=$1 AND NOT removed", s["id"]) or 0)
        first = int(await conn.fetchval("SELECT coalesce(max(seq), 0) FROM label_images WHERE sample_id=$1", s["id"]) or 0) + 1
        mp = await conn.fetchrow("SELECT shapes FROM label_maps WHERE sample_id=$1 AND imagery_id=$2", s["id"], iid)
        geo = _shapes_json(mp["shapes"]) if mp else []

        def plan():
            from shapely import wkb
            from shapely.geometry import Polygon, box
            from shapely.ops import transform
            from .train_tiles import utm_epsg
            fp = wkb.loads(bytes(fp_wkb))
            epsg = utm_epsg(fp.centroid.x, fp.centroid.y)          # 그림 보기 자르기(_cut)와 같은 좌표계 · 같은 격자
            f = _tr(4326, epsg)
            view = transform(f, Polygon([(w, so), (e, so), (e, n), (w, n)]))
            fpu = transform(f, fp).buffer(0)
            taken = {(h["crs"], math.floor(h["x0"] / h["size_m"] + 1e-6), math.floor((h["y1"] - h["size_m"]) / h["size_m"] + 1e-6))
                     for h in have if abs(h["size_m"] - size) < 1e-6}
            mnx, mny, mxx, mxy = view.bounds
            if (mxx - mnx) * (mxy - mny) > (size * size) * AREA_MAX * 6:
                return epsg, None, 0
            cells, skipped = [], 0
            for gx in range(math.floor(mnx / size), math.floor(mxx / size) + 1):
                for gy in range(math.floor(mny / size), math.floor(mxy / size) + 1):
                    c = box(gx * size, gy * size, (gx + 1) * size, (gy + 1) * size)
                    if not view.contains(c) or fpu.intersection(c).area < c.area * 0.97:
                        continue
                    if (f"EPSG:{epsg}", gx, gy) in taken:
                        skipped += 1
                        continue
                    cells.append((gx, gy))
            return epsg, cells, skipped
        epsg, cells, skipped = await run_in_threadpool(plan)
        if cells is None or len(cells) > AREA_MAX:
            raise ApiError("bad_request", f"한 번에 그림 {AREA_MAX}장 넓이까지입니다 — 조금 확대해 주세요", {"cells": len(cells or [])})
        if not cells:
            msg = "이 화면의 칸은 이미 그림이 있습니다" if skipped else f"화면을 조금 넓게 보여 주세요 — 라벨 완료는 그림 한 장(약 {round(size)} m) 넓이부터입니다"
            raise ApiError("bad_request", msg, {"skipped": skipped, "wider": not skipped})
        if live + len(cells) > MAX_IMAGES:
            raise ApiError("bad_request", f"한 묶음은 {MAX_IMAGES}장까지입니다 — 남은 {max(0, MAX_IMAGES - live)}장", {"room": MAX_IMAGES - live})
        names = _names(s["names"])
        root = Path(s["dir"])
        aid = "la_" + secrets.token_hex(6)

        def cut():
            from PIL import Image
            from .train_tiles import _crop_save
            made = []
            for k, (gx, gy) in enumerate(cells):
                seq = first + k
                name = f"{s['id']}_{seq:04d}"
                path = root / "pool" / f"{name}.png"
                x0, y1 = gx * size, (gy + 1) * size
                try:
                    ok = _crop_save(iid, epsg, x0, y1, size, PX, path)
                except Exception:  # noqa: BLE001 — 그 자리 영상을 읽지 못함
                    ok = False
                if not ok:
                    continue
                with Image.open(path) as im:
                    g = im.convert("L")
                    dark = sum(1 for v in g.getdata() if v < 4) / (PX * PX)
                if dark > 0.03:                             # 영상 가장자리(검은 띠)
                    path.unlink(missing_ok=True)
                    continue
                sh = _chip_shapes(geo, epsg, x0, y1, size)
                split = "val" if seq % 5 == 0 else "train"
                _write_chip(root, name, split, sh, True)
                made.append({"seq": seq, "name": name, "x0": x0, "y1": y1, "shapes": sh, "split": split})
            return made, (_recount_set(root, names) if made else None)
        made, m = await run_in_threadpool(cut)
        if not made:
            raise ApiError("bad_request", "이 자리 영상을 자르지 못했습니다 — 영상 안쪽에서 다시 해 주세요")
        xs, ys = [q["x0"] for q in made], [q["y1"] for q in made]
        async with conn.transaction():
            ax0, ay0, ax1, ay1 = min(xs), min(ys) - size, max(xs) + size, max(ys)
            f = _tr(epsg, 4326)
            ring = [[round(a, 7), round(b, 7)] for a, b in (f(x, y) for x, y in ((ax0, ay1), (ax1, ay1), (ax1, ay0), (ax0, ay0), (ax0, ay1)))]
            await conn.execute("INSERT INTO label_areas(id, sample_id, imagery_id, crs, x0, y0, x1, y1, ring, n_images, done_by) "
                               "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)", aid, s["id"], iid, f"EPSG:{epsg}", ax0, ay0, ax1, ay1, ring,
                               len(made), p.user_id)
            for q in made:
                await conn.execute("INSERT INTO label_images(id, sample_id, seq, name, imagery_id, crs, x0, y1, size_m, px, split, created_by, area_id, "
                                   "state, shapes, n_objects, updated_by, updated_at, done_by, done_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,"
                                   "'done',$14,$15,$12,now(),$12,now())", "li_" + secrets.token_hex(6), s["id"], q["seq"], q["name"], iid,
                                   f"EPSG:{epsg}", q["x0"], q["y1"], size, PX, q["split"], p.user_id, aid, q["shapes"], len(q["shapes"]))
            await _store_counts(conn, s["id"], m)
            await audit(conn, p, "label.map.area", aid, None, {"sample": s["id"], "imagery": iid, "images": len(made),
                                                                "objects": sum(len(q["shapes"]) for q in made), "skipped": skipped})
        out = await _map_out(conn, s)
    out["added"] = env(len(made), "count", "measured", "이번에 라벨 완료한 그림")
    out["skipped"] = env(skipped, "count", "measured", "이미 그림이 있어 건너뛴 칸")
    return out


@router.delete("/projects/{pid}/labeling/map/areas/{aid}")
async def map_area_undo(pid: str, aid: str, request: Request):
    p = _lx(request)
    async with db(realm="lx") as conn:
        await _need_member(conn, p, pid)
        s = await _set_of(conn, pid)
        a = await conn.fetchrow("SELECT * FROM label_areas WHERE id=$1 AND sample_id=$2 AND NOT removed", aid, s["id"]) if s else None
        if not a:
            raise ApiError("not_found", "라벨 완료한 자리가 없습니다")
        rows = await conn.fetch("SELECT id, name, split FROM label_images WHERE area_id=$1 AND NOT removed", aid)

        def files():
            for x in rows:
                _write_chip(Path(s["dir"]), x["name"], x["split"], [], False)
            return _recount_set(Path(s["dir"]), _names(s["names"]))
        m = await run_in_threadpool(files)
        async with conn.transaction():
            await conn.execute("UPDATE label_areas SET removed=true WHERE id=$1", aid)
            await conn.execute("UPDATE label_images SET removed=true, updated_by=$2, updated_at=now() WHERE area_id=$1", aid, p.user_id)
            await _store_counts(conn, s["id"], m)
            await audit(conn, p, "label.map.area.undo", aid, {"images": len(rows)}, None)
        return await _map_out(conn, s)
