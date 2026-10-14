"""학습 표본(r3-train · C5 LX 생산 원스톱) — 화면에서 올린 라벨 표본 묶음을 풀어 검사하고, 라벨을 겹친 그림으로 보여 준다.

POST /training/samples                    multipart {file: zip, task_name, region?(sgg_cd), org?} → 표본 id · 장 수 · 클래스별 개수
GET  /training/samples                    표본 목록(최근 순)
GET  /training/samples/{sid}              표본 한 건(장 수 · 클래스별 객체 수·그림 수 · 뺀 그림)
GET  /training/samples/{sid}/preview/{i}  i 번째 그림에 라벨(다각형·상자)을 겹친 JPEG
POST /training/samples/{sid}/exclude      {images:[i..], restore?:bool} → 빼기(학습 목록에서 제외) · 다시 넣기

zip 형식(YOLO): images/{train,val}/*.jpg|png|tif + labels/{train,val}/*.txt + dataset.yaml(names) — 또는 images/ · labels/ 한 폴더
(검증 몫이 없으면 5장마다 1장을 검증으로 나눈다). 이미지 200장 이하(작은 표본 · 기본값). 서버 폴더 경로는 응답에 내지 않는다.

나눠 올리기(r3-train 3차 · 바깥 주소 앞단의 요청 한 번 100초 한도 — 한 번에 받는 올리기는 큰 묶음이 524 로 끊겼다):
POST /training/uploads                    {filename, size, task_name, region?, org?, key?} → 올리기 id · 받은 바이트(같은 key 면 이어 올리기)
PUT  /training/uploads/{uid}?offset=N     본문 = 묶음의 N 바이트부터 한 조각(8 MB 이하) → 받은 바이트. 자리가 어긋나면 409 + 받은 바이트
GET  /training/uploads/{uid}              받은 바이트(끊긴 뒤 이어 올릴 자리)
POST /training/uploads/{uid}/finish       다 받았으면 풀어서 검사 → 표본(POST /training/samples 와 같은 결과)

프로젝트 연결(구현 2차 T1): 올리기에 project_id 가 오면 그 프로젝트의 프로젝트장 · 구성원만 올리고, 표본은 그 프로젝트 학습데이터로 이어진다
(project_links kind sample — 표 모양은 그대로). GET /training/samples?project= 는 그 프로젝트 표본만.
"""
from __future__ import annotations

import hashlib
import io
import json
import re
import secrets
import shutil
import time
import zipfile
from pathlib import Path, PurePosixPath

from fastapi import APIRouter, File, Form, Request, UploadFile
from fastapi.responses import Response
from starlette.concurrency import run_in_threadpool

from . import config
from .deps import ApiError, audit, db, principal, require
from .envelope import env, now_iso

router = APIRouter()
MAX_IMAGES = 200
MAX_ZIP_MB = 400
IMG_EXT = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".bmp"}
ROOT = config.DATA_ROOT / "training" / "samples"
UP_ROOT = config.DATA_ROOT / "training" / "uploads"
CHUNK = 1 << 20                  # 조각 기본 1 MB(화면이 속도를 재서 한 조각이 약 30초가 되게 조절 · 256 KB–8 MB)
CHUNK_MAX = 8 << 20
UP_TTL_S = 24 * 3600             # 끝내지 못한 올리기는 하루 뒤 지운다
PALETTE = [(15, 169, 160), (255, 122, 69), (49, 130, 246), (240, 68, 82), (140, 94, 255), (255, 196, 0), (0, 184, 92), (255, 92, 184)]


def _staff(request: Request):
    p = require(principal(request), lx=True)
    if p.role not in ("staff", "admin"):
        raise ApiError("forbidden", "LX 직원·관리자만 학습 데이터를 다룹니다")
    return p


# ── 검사(순수 함수 · 테스트 대상) ─────────────────────────────────────────
def _names_from_yaml(text: str) -> list[str] | None:
    """dataset.yaml 의 names — 목록형([a, b] · '- a') 또는 사전형('0: a'). PyYAML 이 있으면 그것으로."""
    try:
        import yaml
        y = yaml.safe_load(text) or {}
        n = y.get("names")
        if isinstance(n, dict):
            return [str(n[k]) for k in sorted(n, key=lambda x: int(x))]
        if isinstance(n, list):
            return [str(x) for x in n]
    except Exception:
        pass
    m = re.search(r"^names:\s*\[(.*?)\]", text, re.M)
    if m:
        return [s.strip().strip("'\"") for s in m.group(1).split(",") if s.strip()]
    return None


def inspect_tree(root: Path) -> dict:
    """풀어 놓은 표본 폴더 검사 → {names, items[{img, label, split}], n_train, n_val, class_counts, class_images, label_kind, problems}.
    그림과 라벨은 같은 이름(확장자만 다름)으로 짝을 짓는다. 라벨 없는 그림은 배경(빈 라벨)으로 센다."""
    ymls = [p for p in root.rglob("*.y*ml") if p.suffix in (".yaml", ".yml")]
    names = None
    for y in sorted(ymls, key=lambda p: len(p.parts)):
        names = _names_from_yaml(y.read_text(encoding="utf-8", errors="replace"))
        if names:
            break
    if not names:
        cls_txt = next(iter(root.rglob("classes.txt")), None)
        if cls_txt:
            names = [s.strip() for s in cls_txt.read_text(encoding="utf-8", errors="replace").splitlines() if s.strip()]
    imgs = sorted(p for p in root.rglob("*") if p.is_file() and p.suffix.lower() in IMG_EXT and "images" in [x.lower() for x in p.parts])
    labels = {}
    for p in root.rglob("*.txt"):
        if "labels" in [x.lower() for x in p.parts]:
            labels[_key(p, "labels")] = p
    items = []
    for im in imgs:
        k = _key(im, "images")
        lb = labels.get(k)
        parts = [x.lower() for x in im.parts]
        split = "val" if ("val" in parts or "valid" in parts or "test" in parts) else "train" if "train" in parts else None
        items.append({"img": im, "label": lb, "split": split})
    if items and not any(i["split"] == "val" for i in items):          # 검증 몫이 없으면 5장마다 1장
        for n, it in enumerate(items):
            it["split"] = "val" if n % 5 == 4 else "train"
    for it in items:
        it["split"] = it["split"] or "train"
    counts: dict[int, int] = {}
    imgs_of: dict[int, int] = {}
    kinds = set()
    problems = []
    for it in items:
        seen = set()
        if not it["label"]:
            continue
        for ln, line in enumerate(it["label"].read_text(encoding="utf-8", errors="replace").splitlines()):
            v = line.split()
            if not v:
                continue
            try:
                c = int(float(v[0]))
                nums = [float(x) for x in v[1:]]
            except ValueError:
                problems.append({"image": it["img"].name, "line": ln + 1, "why": "숫자가 아닌 값"})
                continue
            kinds.add("box" if len(nums) == 4 else "polygon")
            counts[c] = counts.get(c, 0) + 1
            seen.add(c)
        for c in seen:
            imgs_of[c] = imgs_of.get(c, 0) + 1
    names = names or []                                   # 이름이 없으면 지어 붙이지 않는다(올리기에서 거절)
    over = [c for c in counts if c >= len(names)] if names else []
    if over:
        problems.append({"why": "라벨의 클래스 번호가 이름 목록보다 큽니다", "classes": sorted(over)})
    return {"names": names, "items": items, "n_train": sum(1 for i in items if i["split"] == "train"),
            "n_val": sum(1 for i in items if i["split"] == "val"),
            "class_counts": {names[c] if c < len(names) else str(c): n for c, n in sorted(counts.items())},
            "class_images": {names[c] if c < len(names) else str(c): n for c, n in sorted(imgs_of.items())},
            "label_kind": "polygon" if "polygon" in kinds else ("box" if kinds else None), "problems": problems,
            "paired": sum(1 for i in items if i["label"])}


def _key(p: Path, anchor: str) -> str:
    """images/train/a.jpg ↔ labels/train/a.txt 짝 키 = anchor 뒤 경로(확장자 뺌)."""
    parts = list(p.parts)
    low = [x.lower() for x in parts]
    i = len(low) - 1 - low[::-1].index(anchor)
    return "/".join(parts[i + 1:])[: -len(p.suffix)].lower()


def write_lists(root: Path, meta: dict, excluded: set[int]) -> Path:
    """학습 목록(train.txt · val.txt) + dataset.yaml — ultralytics 는 목록의 그림 경로에서 images→labels 로 라벨을 찾는다."""
    tr, va = [], []
    for n, it in enumerate(meta["items"]):
        if n in excluded:
            continue
        (va if it["split"] == "val" else tr).append(Path(it["img"]).as_posix())
    if not va and tr:
        va = tr[-1:]
    (root / "_train.txt").write_text("\n".join(tr) + "\n", encoding="utf-8")
    (root / "_val.txt").write_text("\n".join(va) + "\n", encoding="utf-8")
    y = root / "_dataset.yaml"
    names = "\n".join(f"  {i}: {json.dumps(n, ensure_ascii=False)}" for i, n in enumerate(meta["names"]))
    y.write_text(f"path: {root.as_posix()}\ntrain: {(root / '_train.txt').as_posix()}\nval: {(root / '_val.txt').as_posix()}\nnames:\n{names}\n",
                 encoding="utf-8")
    return y


def _safe_extract(z: zipfile.ZipFile, dst: Path):
    for m in z.infolist():
        name = m.filename
        if m.flag_bits & 0x800 == 0:                        # UTF-8 표시 없는 zip(윈도 탐색기) — cp949 로 다시 읽는다
            try:
                name = m.filename.encode("cp437").decode("cp949")
            except Exception:
                pass
        pp = PurePosixPath(name.replace("\\", "/"))
        if pp.is_absolute() or ".." in pp.parts or name.startswith("__MACOSX"):
            continue
        out = dst.joinpath(*pp.parts)
        if m.is_dir():
            out.mkdir(parents=True, exist_ok=True)
            continue
        out.parent.mkdir(parents=True, exist_ok=True)
        with z.open(m) as s, open(out, "wb") as d:
            shutil.copyfileobj(s, d)


def _meta_of(root: Path) -> dict:
    m = inspect_tree(root / "data")
    return m


def _pub(r, extra: dict | None = None) -> dict:
    """화면용 — 폴더 경로·만든 사람 id 없음. 숫자는 봉투(올린 파일에서 센 값 · 측정)."""
    src = "올린 학습 데이터 파일"
    cc = r["class_counts"] or {}
    ci = r["class_images"] or {}
    ex = list(r["excluded"] or [])
    out = {"id": r["id"], "task_name": r["task_name"], "sgg_cd": r["sgg_cd"], "region_name": r["region_name"], "org": r["org"],
           "names": r["names"], "label_kind": r["label_kind"], "status": r["status"],
           "images": env(r["n_images"], "count", "measured", src), "train": env(r["n_train"], "count", "measured", src),
           "val": env(r["n_val"], "count", "measured", src), "excluded": [{"index": i} for i in ex], "excluded_n": env(len(ex), "count", "measured", "빼기 기록"),
           "classes": [{"name": n, "objects": env(cc.get(n, 0), "count", "measured", src), "images": env(ci.get(n, 0), "count", "measured", src)}
                       for n in (r["names"] or [])],
           "created_at": r["created_at"].isoformat(timespec="seconds") if r["created_at"] else None}
    if extra:
        out.update(extra)
    return out


async def _row(conn, sid: str):
    r = await conn.fetchrow("SELECT * FROM train_samples WHERE id=$1", sid)
    if not r or r["status"] == "removed":
        raise ApiError("not_found", "학습 데이터가 없습니다")
    return r


@router.post("/training/samples", status_code=201)
async def upload(request: Request, file: UploadFile = File(...), task_name: str = Form(...), region: str | None = Form(None),
                 org: str | None = Form(None), project_id: str | None = Form(None)):
    p = _staff(request)
    await _project_ok(p, project_id)
    task = (task_name or "").strip()[:40]
    if not task:
        raise ApiError("bad_request", "업무 이름을 적어 주세요")
    if not (file.filename or "").lower().endswith(".zip"):
        raise ApiError("bad_request", "학습 데이터 묶음(zip)을 올려 주세요")
    sid = "smp_" + secrets.token_hex(5)
    root = ROOT / sid
    (root / "data").mkdir(parents=True, exist_ok=True)
    zp = root / "upload.zip"
    size = 0
    with open(zp, "wb") as f:
        while True:
            b = await file.read(1 << 20)
            if not b:
                break
            size += len(b)
            if size > MAX_ZIP_MB * (1 << 20):
                f.close()
                shutil.rmtree(root, ignore_errors=True)
                raise ApiError("too_large", f"묶음이 {MAX_ZIP_MB} MB 를 넘습니다", status=413)
            f.write(b)
    return await _ingest(p, sid, root, zp, task, region, org, project_id)


async def _project_ok(p, project_id: str | None) -> None:
    """프로젝트 맥락의 올리기 — 그 프로젝트의 프로젝트장 · 구성원만(묶음을 받기 전에 거절)."""
    if project_id:
        from .projects import require_member
        async with db(realm="lx") as conn:
            await require_member(conn, p, str(project_id))


async def _ingest(p, sid: str, root: Path, zp: Path, task: str, region: str | None, org: str | None, project_id: str | None = None) -> dict:
    """받은 묶음(zp) → 풀기 · 검사 · 학습 목록 · 표본 행. 한 번에 올리기와 나눠 올리기가 같은 길."""
    from starlette.concurrency import run_in_threadpool

    def unpack():
        with zipfile.ZipFile(zp) as z:
            _safe_extract(z, root / "data")
    try:
        await run_in_threadpool(unpack)                      # 큰 묶음을 푸는 동안 다른 요청을 막지 않는다
    except zipfile.BadZipFile:
        shutil.rmtree(root, ignore_errors=True)
        raise ApiError("bad_request", "zip 파일을 열 수 없습니다 — 묶음이 끝까지 올라갔는지 확인해 주세요")
    zp.unlink(missing_ok=True)
    meta = await run_in_threadpool(_meta_of, root)
    n = len(meta["items"])
    why = None
    if n == 0:
        why = "그림(images 폴더)이 없습니다"
    elif meta["paired"] == 0:
        why = "라벨(labels 폴더 · 그림과 같은 이름의 .txt)이 없습니다"
    elif n > MAX_IMAGES:
        why = f"그림이 {n}장입니다 — 한 번에 {MAX_IMAGES}장 이하입니다"
    elif not meta["names"]:
        why = "클래스 이름(dataset.yaml 의 names)이 없습니다"
    elif any(pr.get("classes") for pr in meta["problems"]):
        why = "라벨의 클래스 번호가 이름 목록과 맞지 않습니다"
    if why:
        shutil.rmtree(root, ignore_errors=True)
        raise ApiError("bad_request", why, {"images": n, "paired": meta["paired"]})
    write_lists(root, meta, set())
    region_name = None
    if region:
        from .regions import regions_base
        regs, _, _ = regions_base()
        rg = next((x for x in regs if x["sgg_cd"] == region or x.get("prev_cd") == region), None)
        if rg:
            region, region_name = rg["sgg_cd"], rg.get("name") or rg.get("full")
        else:
            region = None
    async with db(realm="lx") as conn:
        await conn.execute(
            "INSERT INTO train_samples(id, task_name, sgg_cd, region_name, org, dir, names, n_images, n_train, n_val, class_counts, class_images, "
            "label_kind, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)",
            sid, task, region, region_name, (org or "").strip()[:60] or None, str(root), meta["names"], n, meta["n_train"], meta["n_val"],
            meta["class_counts"], meta["class_images"], meta["label_kind"], p.user_id)
        await audit(conn, p, "train.sample.upload", sid, None, {"images": n, "classes": meta["class_counts"], "task": task, "sgg_cd": region,
                                                                  "project_id": project_id})
        if project_id:                                       # 프로젝트 학습데이터로 잇는다(프로젝트 → 학습데이터 구축 단계)
            from .projects import link
            await link(conn, str(project_id), "sample", sid, p.user_id)
        from .core import sample_classes_from_names          # 묶음 이름표 → 클래스 한 곳(새 이름 = 새 클래스 · 10-13 데이터-개념 ⓐ)
        await sample_classes_from_names(conn, sid, meta["names"], p.user_id)
        r = await _row(conn, sid)
    return _pub(r, {"as_of": now_iso()})


# ── 나눠 올리기(바깥 주소 · 요청 한 번 100초 한도) ────────────────────────────
def _up_dir(uid: str) -> Path:
    if not re.fullmatch(r"up_[0-9a-f]{16}", uid or ""):
        raise ApiError("not_found", "올리기 기록이 없습니다")
    return UP_ROOT / uid


def _up_meta(uid: str, p) -> tuple[Path, dict]:
    d = _up_dir(uid)
    try:
        m = json.loads((d / "meta.json").read_text(encoding="utf-8"))
    except Exception:
        raise ApiError("not_found", "올리기 기록이 없습니다 — 처음부터 다시 올려 주세요")
    if m.get("user") != p.user_id:
        raise ApiError("forbidden", "다른 사람이 시작한 올리기입니다")
    return d, m


def _received(d: Path) -> int:
    f = d / "part"
    return f.stat().st_size if f.exists() else 0


def _up_view(uid: str, d: Path, m: dict) -> dict:
    return {"id": uid, "size": int(m["size"]), "bytes": _received(d), "chunk": {"size": CHUNK, "max": {"size": CHUNK_MAX}},
            "limit": {"size": MAX_ZIP_MB << 20}, "as_of": now_iso()}


def _sweep_uploads():
    """하루 지난 미완 올리기 정리(요청이 올 때 가볍게)."""
    try:
        now = time.time()
        for d in UP_ROOT.glob("up_*"):
            f = d / "meta.json"
            if now - (f.stat().st_mtime if f.exists() else d.stat().st_mtime) > UP_TTL_S:
                shutil.rmtree(d, ignore_errors=True)
    except Exception:
        pass


def up_key(user: str, key: str) -> str:
    return hashlib.sha1(f"{user}|{key}".encode("utf-8")).hexdigest()[:16]


@router.post("/training/uploads", status_code=201)
async def up_start(body: dict, request: Request):
    """나눠 올리기 시작 — 크기·이름·업무를 먼저 검사한다(다 올린 뒤에 거절하지 않게). 같은 사람·같은 파일(key)이면 받은 자리부터 이어 간다."""
    p = _staff(request)
    task = str(body.get("task_name") or "").strip()[:40]
    name = str(body.get("filename") or "")
    try:
        size = int(body.get("size") or 0)
    except (TypeError, ValueError):
        size = 0
    if not task:
        raise ApiError("bad_request", "업무 이름을 적어 주세요")
    if not name.lower().endswith(".zip"):
        raise ApiError("bad_request", "학습 데이터 묶음(zip)을 올려 주세요")
    if size <= 0:
        raise ApiError("bad_request", "빈 파일입니다")
    if size > MAX_ZIP_MB << 20:
        raise ApiError("too_large", f"묶음이 {MAX_ZIP_MB} MB 를 넘습니다 — {MAX_ZIP_MB} MB 이하로 나눠 묶어 주세요",
                       {"size": size, "limit": MAX_ZIP_MB << 20}, 413)
    await _project_ok(p, body.get("project_id"))
    _sweep_uploads()
    k = str(body.get("key") or "")[:200]
    uid = "up_" + (up_key(p.user_id, f"{k}|{task}") if k else secrets.token_hex(8))
    d = UP_ROOT / uid
    meta_f = d / "meta.json"
    if meta_f.exists():
        m = json.loads(meta_f.read_text(encoding="utf-8"))
        if int(m.get("size") or 0) == size and m.get("user") == p.user_id:
            return _up_view(uid, d, m)                       # 이어 올리기 — 받은 자리부터
        shutil.rmtree(d, ignore_errors=True)
    d.mkdir(parents=True, exist_ok=True)
    m = {"user": p.user_id, "filename": name[:120], "size": size, "task": task, "region": body.get("region") or None,
         "org": (str(body.get("org") or "").strip()[:60] or None), "project": (str(body.get("project_id") or "") or None), "at": now_iso()}
    meta_f.write_text(json.dumps(m, ensure_ascii=False), encoding="utf-8")
    (d / "part").write_bytes(b"")
    return _up_view(uid, d, m)


@router.get("/training/uploads/{uid}")
async def up_state(uid: str, request: Request):
    p = _staff(request)
    d, m = _up_meta(uid, p)
    return _up_view(uid, d, m)


@router.put("/training/uploads/{uid}")
async def up_chunk(uid: str, request: Request, offset: int = 0):
    """한 조각 — offset 이 지금까지 받은 크기와 같을 때만 붙인다(끊겼다 다시 보내도 두 번 붙지 않는다)."""
    p = _staff(request)
    d, m = _up_meta(uid, p)
    have = _received(d)
    if offset != have:
        raise ApiError("conflict", "이어 올릴 자리가 다릅니다", {"bytes": have, "size": int(m["size"])}, 409)
    data = await request.body()
    if len(data) > CHUNK_MAX:
        raise ApiError("too_large", "한 조각이 너무 큽니다", {"size": len(data), "limit": CHUNK_MAX}, 413)
    if have + len(data) > int(m["size"]):
        raise ApiError("bad_request", "올린 크기가 파일 크기보다 큽니다", {"bytes": have, "size": int(m["size"])})
    with open(d / "part", "ab") as f:
        f.write(data)
    try:
        (d / "meta.json").touch()                              # 하루 정리 기준 = 마지막 조각 시각
    except Exception:
        pass
    return _up_view(uid, d, m)


@router.post("/training/uploads/{uid}/finish", status_code=201)
async def up_finish(uid: str, request: Request):
    p = _staff(request)
    d, m = _up_meta(uid, p)
    have = _received(d)
    if have != int(m["size"]):
        raise ApiError("conflict", "아직 다 올라가지 않았습니다", {"bytes": have, "size": int(m["size"])}, 409)
    sid = "smp_" + secrets.token_hex(5)
    root = ROOT / sid
    (root / "data").mkdir(parents=True, exist_ok=True)
    zp = root / "upload.zip"
    shutil.move(str(d / "part"), str(zp))
    shutil.rmtree(d, ignore_errors=True)
    return await _ingest(p, sid, root, zp, m["task"], m.get("region"), m.get("org"), m.get("project"))


@router.get("/training/samples")
async def list_samples(request: Request, project: str | None = None, shared: int = 0):
    p = _staff(request)
    async with db(realm="lx") as conn:
        if shared:                                           # 관리자가 공개한 학습 데이터(학습 화면 '공유 데이터에서 고르기' · 10-14 공유데이터-탭)
            rows = await conn.fetch("SELECT * FROM train_samples WHERE status <> 'removed' AND staff_shared ORDER BY created_at DESC LIMIT 50")
        elif project:                                        # 프로젝트 학습데이터만(프로젝트 맥락의 '이전에 올린 표본')
            rows = await conn.fetch("SELECT s.* FROM train_samples s JOIN project_links l ON l.kind='sample' AND l.ref=s.id AND l.project_id=$1 "
                                    "WHERE s.status <> 'removed' ORDER BY s.created_at DESC LIMIT 50", project)
        elif p.role == "admin":
            rows = await conn.fetch("SELECT * FROM train_samples WHERE status <> 'removed' ORDER BY created_at DESC LIMIT 50")
        else:                                                # 직원 — 공유 데이터의 비공개 묶음(프로젝트 없음 · 남이 올림)은 빼고(10-14 원칙 246)
            rows = await conn.fetch("SELECT s.* FROM train_samples s WHERE s.status <> 'removed' AND (s.staff_shared OR s.created_by = $1 "
                                    "OR EXISTS (SELECT 1 FROM project_links l WHERE l.kind='sample' AND l.ref=s.id)) "
                                    "ORDER BY s.created_at DESC LIMIT 50", p.user_id)
    return {"items": [_pub(r) for r in rows], "total": len(rows), "as_of": now_iso()}


# ── LX 관리자 '공유 데이터' · 학습 데이터 탭(10-14 공유데이터-탭 · 원칙 232 · 240) ─────────────────────────
# 학습 데이터는 프로젝트 안(원칙 232) — 관리자는 보기 · 직원에게 공개 · 내리기(비공개)만. 새 묶음을 만들지 않는다.
# 줄 = 프로젝트 학습데이터(올린 묶음 · train_samples × project_links) + 그 프로젝트가 만든 분석서비스에서 XI맵으로 고친
# 수정된 부분(train_tiles 1장이 된 칸 · 학습 화면 /train-data/xi 와 같은 셈 — 숫자 한 출처). 수정된 부분은 XI 재학습으로만 학습해서 공개 칸이 없다.
@router.get("/shared/train-data")
async def shared_train_data(request: Request):
    require(principal(request), admin=True)
    from .core import project_cards
    from .train_tiles import count_tiles
    src = "올린 학습 데이터 파일"
    items = []
    async with db(realm="lx") as conn:
        pname = {r["id"]: r["name"] for r in await conn.fetch("SELECT id, name FROM projects")}
        first = {}
        for r in await conn.fetch("SELECT l.ref, l.project_id FROM project_links l JOIN projects p ON p.id=l.project_id WHERE l.kind='sample' "
                                  "ORDER BY l.at NULLS LAST, l.project_id"):
            first.setdefault(r["ref"], r["project_id"])          # 처음 올린 프로젝트(다른 프로젝트가 더해 쓴 줄은 겹쳐 세지 않는다)
        for s in await conn.fetch("SELECT * FROM train_samples WHERE status <> 'removed' ORDER BY created_at DESC"):
            pid = first.get(s["id"])
            items.append({"id": s["id"], "source": "sample", "project": {"id": pid, "name": pname.get(pid)} if pid else None,
                          "name": s["task_name"], "classes": list(s["names"] or []), "images": env(s["n_images"], "count", "measured", src),
                          "shared": bool(s["staff_shared"]), "edit": not pid,     # 프로젝트 없는 묶음 = 공유 데이터에서 올린 것(고치기 · 지우기)
                          "at": s["created_at"].isoformat(timespec="seconds") if s["created_at"] else None})
        for pid in [r["project_id"] for r in await conn.fetch("SELECT project_id FROM project_links WHERE kind='card' UNION "
                                                              "SELECT DISTINCT project_id FROM train_tiles WHERE project_id IS NOT NULL")]:
            if pid not in pname:
                continue
            cards = await project_cards(conn, pid)
            n = 0
            for c in cards:
                n += await count_tiles(conn, card_id=c)
            n += await count_tiles(conn, project_id=pid)           # 전국 결과를 고친 곳(원칙 243 · 학습 화면과 같은 셈)
            if not n:
                continue
            t = await conn.fetchrow("SELECT max(made_at) AS at, (SELECT array_agg(DISTINCT x) FROM train_tiles t2, jsonb_array_elements_text(coalesce(t2.names,'[]'::jsonb)) x "
                                    "WHERE (t2.card_id = ANY($1::text[]) OR (t2.card_id IS NULL AND t2.project_id = $2)) AND t2.state='made' AND NOT t2.test) AS names "
                                    "FROM train_tiles WHERE (card_id = ANY($1::text[]) OR (card_id IS NULL AND project_id = $2)) AND state='made' AND NOT test", cards, pid)
            items.append({"id": f"edits:{pid}", "source": "edits", "project": {"id": pid, "name": pname.get(pid)},
                          "classes": sorted(t["names"] or []) if t else [], "images": env(n, "count", "measured", "XI맵에서 고친 곳이 모인 학습 데이터"),
                          "shared": None, "at": t["at"].isoformat(timespec="seconds") if t and t["at"] else None})
    items.sort(key=lambda x: x["at"] or "", reverse=True)
    return {"items": items, "total": len(items), "as_of": now_iso()}


@router.patch("/training/samples/{sid}")
async def sample_share(sid: str, body: dict, request: Request):
    """LX 관리자 — 학습 데이터 공개 · 비공개(공개된 묶음은 학습 화면 '공유 데이터에서 고르기'에 나온다).
    공유 데이터에서 올린 묶음(프로젝트 없음)은 정보 고치기도 — 이름(task_name) · 클래스 이름(서버 클래스 목록의 이름으로 맞춤 · 10-14 원칙 246).
    프로젝트 학습 데이터는 공개/비공개만(학습 데이터는 프로젝트 안 · 원칙 232)."""
    p = require(principal(request), admin=True)
    if not any(k in body for k in ("shared", "name", "names")):
        raise ApiError("bad_request", "바꿀 것이 없습니다")
    async with db(realm="lx") as conn:
        r = await _row(conn, sid)
        before, after = {}, {}
        if ("name" in body or "names" in body) and await _linked(conn, sid):
            raise ApiError("forbidden", "프로젝트 학습 데이터는 그 프로젝트에서 고칩니다")
        if "shared" in body:
            want = bool(body.get("shared"))
            await conn.execute("UPDATE train_samples SET staff_shared=$2, updated_at=now() WHERE id=$1", sid, want)
            before["shared"], after["shared"] = bool(r["staff_shared"]), want
        if "name" in body:
            nm = " ".join(str(body.get("name") or "").split())[:40]
            if not nm:
                raise ApiError("bad_request", "이름을 적어 주세요")
            await conn.execute("UPDATE train_samples SET task_name=$2, updated_at=now() WHERE id=$1", sid, nm)
            before["name"], after["name"] = r["task_name"], nm
        if "names" in body:
            old = list(r["names"] or [])
            new = [" ".join(str(x or "").split())[:40] for x in (body.get("names") or [])]
            if len(new) != len(old) or not all(new):
                raise ApiError("bad_request", "클래스 이름을 모두 골라 주세요")
            if len(set(new)) != len(new):
                raise ApiError("bad_request", "같은 클래스를 두 번 고를 수 없습니다")
            if new != old:
                from .core import _same_name, sample_classes_from_names
                for a, b in zip(old, new):
                    if a != b and not await _same_name(conn, b):
                        raise ApiError("bad_request", "클래스 목록에 있는 이름을 골라 주세요", {"name": b})
                if await _used(conn, sid):
                    raise ApiError("conflict", "학습에 쓴 학습 데이터라 클래스를 바꿀 수 없습니다", None, 409)
                root = Path(r["dir"])
                meta = await run_in_threadpool(_meta_of, root)
                meta["names"] = new
                cc, ci = await run_in_threadpool(_recount, meta["items"], new)
                await run_in_threadpool(write_lists, root, meta, set(int(i) for i in (r["excluded"] or [])))
                await conn.execute("UPDATE train_samples SET names=$2, class_counts=$3, class_images=$4, updated_at=now() WHERE id=$1", sid, new, cc, ci)
                await conn.execute("DELETE FROM sample_classes WHERE sample_id=$1", sid)
                await sample_classes_from_names(conn, sid, new, p.user_id)
                before["names"], after["names"] = old, new
        await audit(conn, p, "sample.edit" if set(after) - {"shared"} else "sample.share", sid, before, after)
    return {"ok": True, "id": sid, **after, "as_of": now_iso()}


async def _linked(conn, sid: str) -> bool:
    return bool(await conn.fetchval("SELECT 1 FROM project_links WHERE kind='sample' AND ref=$1 LIMIT 1", sid))


async def _used(conn, sid: str) -> bool:
    """학습에 쓴 묶음 — 이 묶음으로 만든 모델 또는 이 묶음을 쓴 학습 작업(기다림 · 도는 중 포함)."""
    return bool(await conn.fetchval(
        "SELECT 1 FROM models WHERE sample_id=$1 UNION ALL SELECT 1 FROM jobs WHERE kind='train' AND "
        "((jsonb_typeof(options->'samples')='array' AND options->'samples' ? $1) OR options->>'samples' = $1) LIMIT 1", sid))


@router.delete("/training/samples/{sid}")
async def sample_delete(sid: str, request: Request):
    """LX 관리자 — 공유 데이터에서 올린 학습 데이터(프로젝트 없음) 지우기. 학습에 쓴 묶음은 지우지 않는다(409 · 영상과 같은 규칙)."""
    p = require(principal(request), admin=True)
    async with db(realm="lx") as conn:
        r = await _row(conn, sid)
        if await _linked(conn, sid):
            raise ApiError("forbidden", "프로젝트 학습 데이터는 그 프로젝트에서 다룹니다")
        if await _used(conn, sid):
            raise ApiError("conflict", "학습에 쓴 학습 데이터라 지울 수 없습니다", None, 409)
        async with conn.transaction():
            await conn.execute("DELETE FROM sample_classes WHERE sample_id=$1", sid)
            await conn.execute("UPDATE train_samples SET status='removed', staff_shared=false, updated_at=now() WHERE id=$1", sid)
            await audit(conn, p, "sample.delete", sid, {"name": r["task_name"], "images": r["n_images"]}, None)
    d = Path(r["dir"])
    if d.is_dir() and d.parent.resolve() == ROOT.resolve():   # 서버 학습 데이터 폴더 안의 그 묶음만
        shutil.rmtree(d, ignore_errors=True)
    return {"ok": True, "id": sid, "as_of": now_iso()}


@router.get("/training/samples/{sid}")
async def get_sample(sid: str, request: Request):
    _staff(request)
    async with db(realm="lx") as conn:
        r = await _row(conn, sid)
    return _pub(r, {"as_of": now_iso()})


_ITEMS: dict = {}   # (묶음, 바뀐 시각) → 그림 목록 — 미리보기 한 장마다 폴더 전체를 다시 훑지 않는다(9장 동시 1.6초 → 0.2초 · impl-34 속도)


def _items(r) -> list[dict]:
    key = (r["id"], str(r.get("updated_at")), r["dir"])
    hit = _ITEMS.get(key)
    if hit is None:
        hit = inspect_tree(Path(r["dir"]) / "data")["items"]
        if len(_ITEMS) > 64:
            _ITEMS.clear()
        _ITEMS[key] = hit
    return hit


def render_preview(img_path: Path, label_path: Path | None, names: list[str], size: int = 512) -> bytes:
    """그림 + 라벨(다각형 · 상자)을 겹친 JPEG — 클래스마다 한 색, 반투명 채움 + 선."""
    from PIL import Image, ImageDraw
    im = Image.open(img_path)
    try:
        im.seek(0)
    except Exception:
        pass
    im = im.convert("RGB")
    w, h = im.size
    over = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(over)
    lw = max(2, round(max(w, h) / 256))
    if label_path and label_path.exists():
        for line in label_path.read_text(encoding="utf-8", errors="replace").splitlines():
            v = line.split()
            if len(v) < 5:
                continue
            try:
                c = int(float(v[0]))
                nums = [float(x) for x in v[1:]]
            except ValueError:
                continue
            col = PALETTE[c % len(PALETTE)]
            if len(nums) == 4:
                cx, cy, bw, bh = nums
                box = [(cx - bw / 2) * w, (cy - bh / 2) * h, (cx + bw / 2) * w, (cy + bh / 2) * h]
                d.rectangle(box, fill=col + (60,), outline=col + (255,), width=lw)
            else:
                pts = [(nums[i] * w, nums[i + 1] * h) for i in range(0, len(nums) - 1, 2)]
                if len(pts) >= 3:
                    d.polygon(pts, fill=col + (70,))
                    d.line(pts + [pts[0]], fill=col + (255,), width=lw)
    out = Image.alpha_composite(im.convert("RGBA"), over).convert("RGB")
    out.thumbnail((size, size))
    b = io.BytesIO()
    out.save(b, "JPEG", quality=82)
    return b.getvalue()


@router.get("/training/samples/{sid}/preview/{i}")
async def preview(sid: str, i: int, request: Request, size: int = 512):
    _staff(request)
    async with db(realm="lx") as conn:
        r = await _row(conn, sid)
    from starlette.concurrency import run_in_threadpool
    items = await run_in_threadpool(_items, r)
    if i < 0 or i >= len(items):
        raise ApiError("not_found", "그림 번호가 범위 밖입니다")
    it = items[i]
    data = await run_in_threadpool(render_preview, Path(it["img"]), it["label"], list(r["names"] or []), max(128, min(1024, size)))
    return Response(data, media_type="image/jpeg", headers={"cache-control": "private, max-age=600",
                                                            "x-lx-split": it["split"], "x-lx-excluded": "1" if i in (r["excluded"] or []) else "0"})


@router.post("/training/samples/{sid}/exclude")
async def exclude(sid: str, body: dict, request: Request):
    """빼기 — 뺀 그림은 학습 목록(train/val)에서 빠지고, 장 수·클래스별 개수를 다시 센다(값 = 남은 파일)."""
    p = _staff(request)
    idx = body.get("images")
    if not isinstance(idx, list) or not all(isinstance(x, int) for x in idx):
        raise ApiError("bad_request", "images 는 그림 번호 목록")
    async with db(realm="lx") as conn:
        r = await _row(conn, sid)
        root = Path(r["dir"])
        meta = inspect_tree(root / "data")
        cur = set(r["excluded"] or [])
        ex = (cur - set(idx)) if body.get("restore") else (cur | {x for x in idx if 0 <= x < len(meta["items"])})
        keep = [it for n, it in enumerate(meta["items"]) if n not in ex]
        if not [it for it in keep if it["split"] == "train"]:
            raise ApiError("bad_request", "학습할 그림이 남지 않습니다")
        write_lists(root, meta, ex)
        # 남은 그림으로 다시 센다
        sub = {"items": keep}
        cc, ci = _recount(sub["items"], meta["names"])
        await conn.execute("UPDATE train_samples SET excluded=$2, n_images=$3, n_train=$4, n_val=$5, class_counts=$6, class_images=$7, "
                           "updated_at=now() WHERE id=$1", sid, sorted(ex), len(keep), sum(1 for i in keep if i["split"] == "train"),
                           sum(1 for i in keep if i["split"] == "val"), cc, ci)
        await audit(conn, p, "train.sample.exclude", sid, sorted(cur), sorted(ex))
        r = await _row(conn, sid)
    return _pub(r, {"as_of": now_iso()})


def _recount(items: list[dict], names: list[str]) -> tuple[dict, dict]:
    cc: dict[str, int] = {}
    ci: dict[str, int] = {}
    for it in items:
        if not it["label"]:
            continue
        seen = set()
        for line in Path(it["label"]).read_text(encoding="utf-8", errors="replace").splitlines():
            v = line.split()
            if not v:
                continue
            try:
                c = int(float(v[0]))
            except ValueError:
                continue
            k = names[c] if c < len(names) else str(c)
            cc[k] = cc.get(k, 0) + 1
            seen.add(k)
        for k in seen:
            ci[k] = ci.get(k, 0) + 1
    return cc, ci


def sample_yaml(sid: str) -> Path | None:
    """학습 어댑터용(동기) — 표본 id → 학습 목록 dataset.yaml. 없거나 뺀 표본이면 None."""
    if not re.fullmatch(r"smp_[0-9a-f]{6,20}", sid or ""):
        return None
    import psycopg
    with psycopg.connect(config.PG_WORKER_DSN) as conn:
        row = conn.execute("SELECT dir, status FROM train_samples WHERE id=%s", (sid,)).fetchone()
    if not row or row[1] == "removed":
        return None
    y = Path(row[0]) / "_dataset.yaml"
    return y if y.exists() else None
