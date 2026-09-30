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
        raise ApiError("forbidden", "LX 직원·관리자만 학습 표본을 다룹니다")
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
    src = "올린 표본 파일"
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
        raise ApiError("not_found", "학습 표본이 없습니다")
    return r


@router.post("/training/samples", status_code=201)
async def upload(request: Request, file: UploadFile = File(...), task_name: str = Form(...), region: str | None = Form(None),
                 org: str | None = Form(None)):
    p = _staff(request)
    task = (task_name or "").strip()[:40]
    if not task:
        raise ApiError("bad_request", "업무 이름을 적어 주세요")
    if not (file.filename or "").lower().endswith(".zip"):
        raise ApiError("bad_request", "라벨 표본 묶음(zip)을 올려 주세요")
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
    return await _ingest(p, sid, root, zp, task, region, org)


async def _ingest(p, sid: str, root: Path, zp: Path, task: str, region: str | None, org: str | None) -> dict:
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
        why = f"그림이 {n}장입니다 — 작은 표본은 {MAX_IMAGES}장 이하입니다"
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
        await audit(conn, p, "train.sample.upload", sid, None, {"images": n, "classes": meta["class_counts"], "task": task, "sgg_cd": region})
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
        raise ApiError("bad_request", "라벨 표본 묶음(zip)을 올려 주세요")
    if size <= 0:
        raise ApiError("bad_request", "빈 파일입니다")
    if size > MAX_ZIP_MB << 20:
        raise ApiError("too_large", f"묶음이 {MAX_ZIP_MB} MB 를 넘습니다 — {MAX_ZIP_MB} MB 이하로 나눠 묶어 주세요",
                       {"size": size, "limit": MAX_ZIP_MB << 20}, 413)
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
         "org": (str(body.get("org") or "").strip()[:60] or None), "at": now_iso()}
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
    return await _ingest(p, sid, root, zp, m["task"], m.get("region"), m.get("org"))


@router.get("/training/samples")
async def list_samples(request: Request):
    _staff(request)
    async with db(realm="lx") as conn:
        rows = await conn.fetch("SELECT * FROM train_samples WHERE status <> 'removed' ORDER BY created_at DESC LIMIT 50")
    return {"items": [_pub(r) for r in rows], "total": len(rows), "as_of": now_iso()}


@router.get("/training/samples/{sid}")
async def get_sample(sid: str, request: Request):
    _staff(request)
    async with db(realm="lx") as conn:
        r = await _row(conn, sid)
    return _pub(r, {"as_of": now_iso()})


def _items(r) -> list[dict]:
    return inspect_tree(Path(r["dir"]) / "data")["items"]


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
