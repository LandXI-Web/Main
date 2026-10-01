"""기관 영상 분석 의뢰(확인 대장 6차 GF-2 · 2차 D1-ⓑ · 5차 역할-4 ⓑ · 1차 FR-1) — 기관은 의뢰하고 결과를 받는다. 모델 · 분석은 LX.

흐름(기관 분기 화면 gov-request):
  영상 고르기 — ① LX 가 이 기관에 공유한 영상 불러오기(catalog.shared_ids · 관리자가 기관마다 켠 영상만)
               ② 우리 영상 파일 조각 올리기(여러 파일 · 멈춤 · 이어 올리기 · 취소 · 한 파일 20GB — 값은 config/requests.yaml)
  → 파일에서 읽은 값 확인(해상도 · 촬영일 · 범위 · 좌표계 — 원칙 49 · 입력 칸 없음)
  → 어느 서비스로(그 기관에 켜진 서비스 = 배포본 · 영상 해상도에 맞는 모델이 있는 서비스만 고를 수 있음)
  → 의뢰(무상 — 비용 · 수수료 표시 없음 · 원칙 60 고침)
  → LX 관리자 결재함(approvals kind 'request' · 판단 근거: 범위 · 면적 · 예상 시간 · 대기열 순번 · 이 기관의 이번 달 사용 — 지금 있는 값만)
  → 승인 = 기존 분석 작업 대기열(jobs · 게이트웨이 대기열로만 · 두 장 동시 고부하는 작업자가 막는다) → 결과 = 그 서비스의 새 시점
     반려 = 사유가 기관 '내 의뢰'에.
관할 밖은 없다(원칙 39): 영상이 관할 밖이면 거절, 일부만 밖이면 관할 안만 분석(범위 판정은 regions 와 같은 규칙 — 연안 바다 포함).
저장 공간(원칙 66 · 사용자 7차 답 10-01): 기관에는 막는 한도를 두지 않는다 — 올린 원본은 기관 사용 현황(저장)으로 기록 · 표시만 하고,
서버 전체 저장 공간이 모자랄 때만 올리기를 막는다(남은 공간 기준 · 설정 한 곳). 분석은 LX 관리자 승인 + 대기열 순번. 같은 파일 두 번 올리기 방지(빠른 지문 · 전체 지문),
끝내지 못한 올리기 · 의뢰하지 않은 파일은 정한 날 수 뒤 정리, 분석이 끝난 원본의 보관 기간은 설정 한 곳(지금 '보관').
기관이 올린 영상은 그 의뢰의 분석에만 쓴다 — 분석 동안만 영상 표에 '의뢰 영상'(layer.role 'request')으로 두고 끝나면 뺀다(다른 분석이 고르지 않게).

GET    /requests/services                 그 기관에 켜진 서비스(?gsd= 영상 해상도에 맞는 모델이 있는가 fits)
GET    /requests/shared-imagery           LX 가 이 기관에 공유한 영상(불러오기 · 분석할 수 있는가 · 이미 결과가 있는 서비스)
POST   /requests/uploads                  {draft_id?, filename, size, quick_fp?} → 올리기 한 건(같은 파일이면 받은 자리부터 이어 올리기)
PUT    /requests/uploads/{uid}?offset=N   한 조각(8MB 이하) — 자리가 어긋나면 409 + 받은 바이트
GET    /requests/uploads/{uid}            받은 바이트
DELETE /requests/uploads/{uid}            취소(받은 조각 지움)
POST   /requests/uploads/{uid}/finish     다 받았으면 지문 확인 → 끝
POST   /requests/drafts/{did}/read        올린 파일에서 읽은 값(해상도 · 촬영일 · 범위 · 좌표계 · 관할) + 미리 보기
DELETE /requests/drafts/{did}             의뢰 전 묶음 지우기
POST   /requests                          {service_id, source: shared|upload, imagery_id | draft_id, memo?} → 결재 대기
GET    /requests                          기관 = 우리 기관 의뢰 · LX = 전부(?tenant_id=)
GET    /requests/timepoints?service=      그 서비스의 결과 시점(서비스 결과 + 의뢰로 더해진 시점)
GET    /requests/{rid}                    한 건(판단 근거 · 미리 보기 · 범위)
"""
from __future__ import annotations

import asyncio
import base64
import datetime as dt
import hashlib
import json
import math
import re
import secrets
import shutil
import time
from pathlib import Path

from fastapi import APIRouter, Request
from shapely.geometry import mapping, shape
from starlette.concurrency import run_in_threadpool

from . import config
from .deps import ApiError, Principal, audit, db, principal, require
from .envelope import KST, env, now_iso

router = APIRouter()

STATE_WORD = {"pending": "확인 대기", "approved": "분석 준비", "analyzing": "분석 중", "done": "결과 도착", "rejected": "반려",
              "failed": "분석하지 못함"}
ON_STAGES = ("shadow", "canary", "ga")          # 그 기관에 켜진 서비스(초안 · 되돌림 · 시험 제외)
KIND_WORD = {"drone": "드론", "aerial": "항공", "satellite": "위성"}
CRS_WORD = {5186: "GRS80 중부원점", 5185: "GRS80 서부원점", 5187: "GRS80 동부원점", 5188: "GRS80 동해원점", 5179: "UTM-K(GRS80)",
            5174: "보정 베셀 중부원점", 32652: "UTM 52N(WGS84)", 32651: "UTM 51N(WGS84)", 4326: "경위도(WGS84)", 4737: "경위도(GRS80)",
            3857: "웹 메르카토르"}
QUICK = 1 << 20                                   # 빠른 지문 = sha256(크기 + ':' + 앞 1MB + 뒤 1MB) — 화면과 같은 식
CHIP, OVERLAP, CONF = 1024, 0.125, 0.25           # 분석 작업 칸(배포 흐름과 같은 값)


# ── 설정 한 곳(config/requests.yaml) ─────────────────────────────────────────
def settings() -> dict:
    s = dict(config.load_yaml("requests") or {})
    s.setdefault("storage_root", "tenants/{tenant}/requests")
    s.setdefault("max_file_gb", 20)
    s.setdefault("chunk_mb", {"start": 1, "max": 8})
    s.setdefault("disk_reserve_gb", 200)
    s.setdefault("partial_ttl_days", 7)
    s.setdefault("retention_after_done", "keep")
    s.setdefault("raster_ext", ["tif", "tiff", "jpg", "jpeg", "jp2", "ecw", "img"])
    s.setdefault("sidecar_ext", ["tfw", "tifw", "jgw", "jpgw", "jpw", "j2w", "wld", "prj", "aux.xml", "ovr"])
    s.setdefault("crs_guess", [5186, 5187, 5185, 5188, 5179, 32652, 32651, 4326])
    return s


def root_rel(tenant: str) -> str:
    """기관 올린 영상 폴더(02. 데이터 기준 상대 경로) — quota.storage_of 가 같은 값을 기관 저장에 넣는다."""
    return str(settings()["storage_root"]).format(tenant=tenant).strip("/")


def _chunk() -> tuple[int, int]:
    c = settings()["chunk_mb"] or {}
    return int(float(c.get("start", 1)) * (1 << 20)), int(float(c.get("max", 8)) * (1 << 20))


def _max_file() -> int:
    return int(float(settings()["max_file_gb"]) * 1e9)


def _ext(name: str) -> str:
    n = (name or "").lower()
    if n.endswith(".aux.xml"):
        return "aux.xml"
    return n.rsplit(".", 1)[-1] if "." in n else ""


def _safe_name(name) -> str:
    base = re.split(r"[\\/]", str(name or ""))[-1]
    s = re.sub(r"[^\w.\-]", "_", base).strip("._ ")[:120]
    return s or "file"


def _gb(x: float) -> str:
    mb = x * 1000
    return f"{x:,.1f}GB" if x >= 1 else f"{mb:,.0f}MB" if mb >= 10 else f"{max(mb, 0.1):,.1f}MB"


def _ymd(v) -> str | None:
    return v.astimezone(KST).strftime("%Y.%m.%d") if v else None


def _iso(v) -> str | None:
    return v.astimezone(KST).isoformat(timespec="seconds") if v else None


def _tuser(request: Request) -> Principal:
    p = require(principal(request))
    if p.realm != "tenant" or not p.tenant_id or p.tenant_id == "lx-demo":
        raise ApiError("forbidden", "기관 계정만 분석을 의뢰할 수 있습니다")
    return p


async def _tenant_name(conn, tid: str) -> str:
    n = await conn.fetchval("SELECT name FROM tenants WHERE id=$1", tid)
    ko = (n or {}).get("ko") if isinstance(n, dict) else n
    ko = re.sub(r"^.*?(특별자치도|특별자치시|광역시|[가-힣]+도)\s+", "", str(ko or "")).strip()
    return re.sub(r"\s*\(.*\)$", "", ko) or "기관"


def _svc_name(name) -> str:
    ko = (name or {}).get("ko") if isinstance(name, dict) else name
    return str(ko or "서비스")


# ═══ 서비스 · 공유 영상 ═════════════════════════════════════════════════════
async def _services(conn, tid: str) -> list:
    return await conn.fetch("SELECT d.id, d.card_id, d.card_version_id, d.model_override, d.year, d.stage, d.sgg_cd, d.snapshot_current, d.flow, "
                            "c.name AS cname, CASE WHEN d.aoi IS NULL THEN NULL ELSE ARRAY[ST_XMin(d.aoi), ST_YMin(d.aoi), ST_XMax(d.aoi), "
                            "ST_YMax(d.aoi)] END AS bb FROM deploys d LEFT JOIN cards c ON c.id=d.card_id "
                            "WHERE d.tenant_id=$1 AND d.stage = ANY($2::text[]) AND NOT coalesce(d.test,false) ORDER BY d.year DESC, d.id",
                            tid, list(ON_STAGES))


async def _fits(conn, d, gsd: float | None) -> dict:
    """그 서비스가 이 해상도 영상을 분석할 모델을 가졌는가(배포 흐름의 모델 고르기와 같은 판정 — deploys.choose_model)."""
    from .deploys import choose_model, model_block
    if not gsd:
        return {"fits": None}
    pk = await choose_model(conn, d["model_override"], d["card_id"], d["card_version_id"], gsd)
    mb = await model_block(conn, pk["model_id"]) if pk.get("model_id") else None
    return {"fits": bool(pk.get("model_id")), "model_id": pk.get("model_id"), "model": mb}


def _scope_bbox(p: Principal) -> list | None:
    from . import regions as R
    boxes = [r["bbox"] for r in R.scope_regions(p) if r.get("bbox")]
    if not boxes:
        return None
    return [min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes)]


@router.get("/requests/services")
async def services(request: Request, gsd: float | None = None):
    """그 기관에 켜진 서비스 — gsd(영상 해상도 m)를 주면 그 영상을 분석할 모델이 있는가(fits)도."""
    p = _tuser(request)
    async with db(realm="lx") as conn:
        rows = await _services(conn, p.tenant_id)
        items = []
        for d in rows:
            f = await _fits(conn, d, gsd)
            items.append({"id": d["id"], "name": _svc_name(d["cname"]), "year": d["year"], "fits": f["fits"],
                          "bbox": [round(float(v), 6) for v in d["bb"]] if d["bb"] else None})
        org = await _tenant_name(conn, p.tenant_id)
    return {"items": items, "org": org, "area": {"bbox": _scope_bbox(p)}, "as_of": now_iso()}


async def _results_by_imagery(conn, tid: str) -> dict[str, set]:
    """영상 → 그 영상으로 이미 결과가 있는 서비스(의뢰 결과 · 서비스 적용 분석)."""
    out: dict[str, set] = {}
    for r in await conn.fetch("SELECT imagery_id, deploy_id FROM analysis_requests WHERE tenant_id=$1 AND source='shared' "
                              "AND state IN ('pending','approved','analyzing','done')", tid):
        out.setdefault(r["imagery_id"], set()).add(r["deploy_id"])
    for d in await _services(conn, tid):
        fl = d["flow"] if isinstance(d["flow"], dict) else {}
        iid = ((fl.get("imagery") or {}).get("imagery_id")) if fl.get("state") in ("done", "surveying") else None
        if iid and d["snapshot_current"]:
            out.setdefault(iid, set()).add(d["id"])
    return out


@router.get("/requests/shared-imagery")
async def shared_imagery(request: Request):
    """LX 가 이 기관에 공유한 영상(관리자가 기관 서랍에서 켠 것만 — 5차 역할-4 ⓑ). 원본 경로는 내지 않는다."""
    from .catalog import shared_ids
    from .deploys import gsd_word
    p = _tuser(request)
    ids = sorted(await shared_ids(p.tenant_id))
    async with db(realm="lx") as conn:
        rows = await conn.fetch("SELECT id, name, gsd_m, year, epoch, kind, tier, path_internal, layer, ST_AsGeoJSON(footprint)::json AS fp "
                                "FROM imagery WHERE id = ANY($1::text[]) AND coalesce(kind,'ortho') <> 'terrain'", ids)
        done = await _results_by_imagery(conn, p.tenant_id)

    sb = _scope_bbox(p)

    def inside_all() -> dict:
        """가볍게 — 공유는 관할 안 영상만 켤 수 있으므로(catalog._share_candidates) 여기서는 범위 상자가 관할 상자에 걸치는지만 본다."""
        out = {}
        for r in rows:
            if not r["fp"]:
                continue
            b = shape(r["fp"]).bounds
            out[r["id"]] = sb is None or not (b[2] < sb[0] or b[0] > sb[2] or b[3] < sb[1] or b[1] > sb[3])
        return out
    ok = await run_in_threadpool(inside_all)
    items = []
    for r in rows:
        fp = shape(r["fp"]) if r["fp"] else None
        if fp is not None and not ok.get(r["id"]):
            continue                                   # 관할 밖(공유 뒤 관할이 바뀐 경우) — 내주지 않는다
        lay = r["layer"] or {}
        g = float(r["gsd_m"]) if r["gsd_m"] is not None else None
        ep = str(r["year"] or r["epoch"] or "")
        items.append({"id": r["id"], "name": _svc_name(r["name"]), "year": int(ep[:4]) if ep[:4].isdigit() else None, "gsd_m": g,
                      "gsd_word": gsd_word(g) if g else "", "analyzable": bool(r["path_internal"] or lay.get("cog_path")),
                      "result_services": sorted(done.get(r["id"], set())), "bbox": list(fp.bounds) if fp is not None else None})
    items.sort(key=lambda x: (not x["analyzable"], -(x["year"] or 0), x["name"]))
    return {"items": items, "as_of": now_iso()}


# ═══ 관할 · 범위 이름 ═══════════════════════════════════════════════════════
def _clip(p: Principal, g):
    """영상 범위(4326) → (관할 안 범위 | None, 관할 밖 비율 %). regions.geom_in_scope 와 같은 규칙(연안 바다 포함 · 다른 시군구 땅 제외)."""
    from . import regions as R
    sc = R.scope_of(p)
    if sc is None:
        return g, 0
    if g is None or g.is_empty:
        return None, 100
    if R.geom_in_scope(p, g):
        return g, 0
    if not sc:
        area = R._overseas_area(p)
        if area is None:
            return None, 100
        inside = g.intersection(area.buffer(0.001))
    else:
        u = R._scope_union(p, g.bounds)
        if u is None:
            return None, 100
        inside = g.intersection(u.buffer(R.SEA_REACH))
        other = R._other_land(p, inside.bounds, u) if not inside.is_empty else None
        if other is not None:
            inside = inside.difference(other)
    if inside.is_empty or inside.area < g.area * 0.01:
        return None, 100
    return inside, max(1, round(100 * (1 - inside.area / g.area)))


def _place(p: Principal, g) -> tuple[str, str | None]:
    """범위 → 사람 말('남원시 덕과면' · '남원시 덕과면·사매면' · '… 등 4곳') + 주 시군구 코드."""
    from . import regions as R
    regs = R.scope_regions(p) if R.scope_of(p) is not None else []
    if R.scope_of(p) is None:
        c = g.representative_point()
        cd = R.sgg_at(c.x, c.y)
        regs = [R.region_of(cd)] if cd else []
    x0, y0, x1, y1 = g.bounds
    hits = []
    for r in regs:
        b = r.get("bbox") if r else None
        if not r or (b and (b[2] < x0 or b[0] > x1 or b[3] < y0 or b[1] > y1)):
            continue
        ix = R.emd_index(r["sgg_cd"])
        if ix is None or not len(ix):
            continue
        for i in ix.tree.query(g):
            a = ix.geoms[int(i)].intersection(g).area
            if a > 0:
                hits.append((a, r, ix.names[int(i)]))
    if not hits:
        return ("사업 구역" if R.scope_of(p) == [] else "관할 안"), None
    hits.sort(key=lambda t: -t[0])
    main = hits[0][1]
    names = [n for _, r, n in hits if r is main and n]
    word = main.get("name") or ""
    if len(names) == 1:
        return f"{word} {names[0]}", main["sgg_cd"]
    if len(names) == 2:
        return f"{word} {names[0]}·{names[1]}", main["sgg_cd"]
    return f"{word} {names[0]}·{names[1]} 등 {len(names)}곳", main["sgg_cd"]


# ═══ 조각 올리기 ════════════════════════════════════════════════════════════
_locks: dict[str, asyncio.Lock] = {}
_sha: dict[str, tuple[int, object]] = {}          # 받은 자리까지의 전체 지문(게이트웨이가 다시 뜨면 없어짐 → 끝낼 때 파일로 다시 계산)
_last_sweep: dict[str, float] = {}


def _path(r) -> Path:
    return config.DATA_ROOT / r["rel_path"]


def _part(r) -> Path:
    return config.DATA_ROOT / (r["rel_path"] + ".part")


def _received(r) -> int:
    f = _part(r) if r["state"] == "uploading" else _path(r)
    try:
        return f.stat().st_size
    except FileNotFoundError:
        return 0


def _up_view(r, have: int | None = None) -> dict:
    start, mx = _chunk()
    return {"id": r["id"], "draft_id": r["draft_id"], "filename": r["filename"], "size": int(r["size"]),
            "bytes": _received(r) if have is None else have, "state": r["state"],
            "chunk": {"size": start, "max": {"size": mx}}, "limit": {"size": _max_file()}, "as_of": now_iso()}


def _rm(*paths: Path) -> bool:
    """지운다 → 모두 지웠나(분석 작업자가 아직 열고 있는 파일은 Windows 에서 지워지지 않는다 — 다음 정리 때 다시)."""
    ok = True
    for f in paths:
        try:
            f.unlink()
        except FileNotFoundError:
            pass
        except PermissionError:
            ok = False
    return ok


async def _sweep(tenant: str, force: bool = False):
    """끝내지 못한 올리기 · 의뢰하지 않은 파일(partial_ttl_days 뒤) · 보관 기간이 지난 분석 끝 원본(retention_after_done 이 숫자일 때만) 정리."""
    if not force and time.time() - _last_sweep.get(tenant, 0) < 600:
        return
    _last_sweep[tenant] = time.time()
    s = settings()
    ttl = float(s["partial_ttl_days"]) * 86400
    n = 0
    async with db(realm="lx") as conn:
        rows = await conn.fetch("SELECT * FROM request_uploads WHERE tenant_id=$1 AND request_id IS NULL AND state IN ('uploading','done') "
                                "AND updated_at < now() - make_interval(secs => $2)", tenant, ttl)
        ret = s.get("retention_after_done")
        if isinstance(ret, (int, float)) and not isinstance(ret, bool) and ret > 0:
            rows += await conn.fetch("SELECT u.* FROM request_uploads u JOIN analysis_requests q ON q.id=u.request_id WHERE u.tenant_id=$1 "
                                     "AND u.state='done' AND q.state='done' AND q.updated_at < now() - make_interval(secs => $2)",
                                     tenant, float(ret) * 86400)
        for r in rows:
            if not _rm(_path(r), _part(r)):
                continue                                   # 열려 있는 파일 — 다음 정리 때
            await conn.execute("UPDATE request_uploads SET state='removed', updated_at=now() WHERE id=$1", r["id"])
            n += 1
        if n:
            await conn.execute("INSERT INTO audit_log(actor, realm, action, subject, before, after) VALUES ('system','system',"
                               "'request.upload.sweep',$1,NULL,$2)", tenant, {"removed": n})
    if n:
        from .quota import invalidate_storage
        invalidate_storage(tenant)


async def _upload_row(conn, uid: str, p: Principal, lock_state: str | None = "uploading"):
    if not re.fullmatch(r"ru_[0-9a-f]{12}", uid or ""):
        raise ApiError("not_found", "올리기 기록이 없습니다")
    r = await conn.fetchrow("SELECT * FROM request_uploads WHERE id=$1", uid)
    if not r or r["tenant_id"] != p.tenant_id:
        raise ApiError("not_found", "올리기 기록이 없습니다 — 처음부터 다시 올려 주세요")
    if r["user_id"] != p.user_id:
        raise ApiError("forbidden", "다른 사람이 시작한 올리기입니다")
    if lock_state and r["state"] != lock_state:
        raise ApiError("conflict", "이미 끝났거나 취소한 올리기입니다", {"state": r["state"]}, 409)
    return r


def _dup_line(row, same_draft: bool) -> str:
    if same_draft:
        return "이미 이 의뢰에 올린 파일입니다"
    day = _ymd(row["done_at"] or row["created_at"])
    return f"이미 올린 영상입니다 — {day} 의뢰에 쓰인 파일과 같습니다" if day else "이미 올린 영상입니다"


async def _find_dup(conn, tenant: str, draft: str, size: int, quick: str | None, sha: str | None, not_id: str | None = None):
    """같은 기관에서 이미 다 받은 같은 파일 — 의뢰에 쓰였거나 같은 묶음(의뢰하지 않고 둔 묶음은 정리 대상이라 막지 않는다)."""
    if not quick and not sha:
        return None
    return await conn.fetchrow(
        "SELECT * FROM request_uploads WHERE tenant_id=$1 AND state='done' AND size=$2 AND id IS DISTINCT FROM $5 "
        "AND (($3::text IS NOT NULL AND quick_fp=$3) OR ($4::text IS NOT NULL AND sha256=$4)) "
        "AND (request_id IS NOT NULL OR draft_id=$6) ORDER BY (draft_id=$6) DESC, done_at DESC LIMIT 1",
        tenant, size, quick, sha, not_id, draft)


@router.post("/requests/uploads", status_code=201)
async def up_start(body: dict, request: Request):
    """올리기 시작 — 형식 · 크기 · 서버 저장 여유 · 같은 파일을 먼저 검사한다(다 올린 뒤에 거절하지 않게). 같은 파일이면 받은 자리부터 이어 간다.
    기관 저장 한도로는 막지 않는다(사용 현황으로 기록만 — 사용자 7차 답)."""
    from . import quota as Q
    p = _tuser(request)
    s = settings()
    name = _safe_name(body.get("filename"))
    ext = _ext(name)
    if ext not in s["raster_ext"] and ext not in s["sidecar_ext"]:
        raise ApiError("bad_ext", "영상 파일(TIF · JPG · JP2 · ECW)과 좌표 파일만 올릴 수 있습니다",
                       {"allowed": list(s["raster_ext"]) + list(s["sidecar_ext"])}, 400)
    try:
        size = int(body.get("size") or 0)
    except (TypeError, ValueError):
        size = 0
    if size <= 0:
        raise ApiError("bad_request", "빈 파일입니다")
    if size > _max_file():
        raise ApiError("too_large", f"한 파일은 {_gb(_max_file() / 1e9)}까지 올릴 수 있습니다 — 더 큰 영상은 LX 담당자와 협의해 주세요",
                       {"size": size, "limit": _max_file()}, 413)
    quick = str(body.get("quick_fp") or "").strip().lower()[:64] or None
    if quick and not re.fullmatch(r"[0-9a-f]{64}", quick):
        quick = None
    did = str(body.get("draft_id") or "")
    if not re.fullmatch(r"dr_[0-9a-f]{12}", did):
        did = "dr_" + secrets.token_hex(6)
    await _sweep(p.tenant_id)
    async with db(realm="lx") as conn:
        own = await conn.fetch("SELECT DISTINCT tenant_id, user_id, request_id IS NOT NULL AS used FROM request_uploads WHERE draft_id=$1", did)
        if any(o["tenant_id"] != p.tenant_id or o["user_id"] != p.user_id for o in own):
            raise ApiError("forbidden", "다른 사람의 묶음입니다")
        if any(o["used"] for o in own):
            raise ApiError("conflict", "이미 의뢰한 묶음입니다 — 새 의뢰로 올려 주세요", None, 409)
        # 이어 올리기 — 같은 사람 · 같은 묶음(또는 같은 빠른 지문) · 같은 이름 · 같은 크기
        r = await conn.fetchrow("SELECT * FROM request_uploads WHERE tenant_id=$1 AND user_id=$2 AND state='uploading' AND filename=$3 AND size=$4 "
                                "AND (draft_id=$5 OR ($6::text IS NOT NULL AND quick_fp=$6)) ORDER BY created_at DESC LIMIT 1",
                                p.tenant_id, p.user_id, name, size, did, quick)
        if r and _part(r).exists():
            return _up_view(r)
        dup = await _find_dup(conn, p.tenant_id, did, size, quick, None)
        if dup:
            raise ApiError("duplicate", _dup_line(dup, dup["draft_id"] == did), {"filename": dup["filename"]}, 409)
        reserved = await conn.fetchval("SELECT coalesce(sum(size),0) FROM request_uploads WHERE state='uploading'")
    # 서버 전체 저장 여유(하드웨어 · 원칙 66) — 모든 기관이 받는 중인 파일의 크기까지 더해서 본다(기관 한도로는 막지 않는다)
    room = await Q.storage_room(p.tenant_id, size + max(0, int(reserved or 0)))
    if room:
        raise ApiError(room["code"], room["line"], room.get("detail"), 413)
    uid = "ru_" + secrets.token_hex(6)
    folder = config.DATA_ROOT / root_rel(p.tenant_id) / "drafts" / did
    folder.mkdir(parents=True, exist_ok=True)
    fn, i = name, 1
    async with db(realm="lx") as conn:
        taken = {x["filename"] for x in await conn.fetch("SELECT filename FROM request_uploads WHERE draft_id=$1 AND state IN ('uploading','done')", did)}
        while fn in taken or (folder / fn).exists():
            i += 1
            stem, dot, tail = name.partition(".")
            fn = f"{stem}_{i}{dot}{tail}"
        rel = f"{root_rel(p.tenant_id)}/drafts/{did}/{fn}"
        (config.DATA_ROOT / (rel + ".part")).write_bytes(b"")
        r = await conn.fetchrow("INSERT INTO request_uploads(id, tenant_id, user_id, draft_id, filename, size, quick_fp, state, rel_path) "
                                "VALUES ($1,$2,$3,$4,$5,$6,$7,'uploading',$8) RETURNING *", uid, p.tenant_id, p.user_id, did, fn, size, quick, rel)
        await audit(conn, p, "request.upload.start", uid, None, {"draft_id": did, "size": size, "ext": ext})
    _sha[uid] = (0, hashlib.sha256())
    return _up_view(r, 0)


@router.get("/requests/uploads/{uid}")
async def up_state(uid: str, request: Request):
    p = _tuser(request)
    async with db(realm="lx") as conn:
        r = await _upload_row(conn, uid, p, None)
    return _up_view(r)


@router.put("/requests/uploads/{uid}")
async def up_chunk(uid: str, request: Request, offset: int = 0):
    """한 조각 — offset 이 지금까지 받은 크기와 같을 때만 붙인다(끊겼다 다시 보내도 두 번 붙지 않는다)."""
    p = _tuser(request)
    lock = _locks.setdefault(uid, asyncio.Lock())
    async with lock:
        async with db(realm="lx") as conn:
            r = await _upload_row(conn, uid, p)
        f = _part(r)
        have = f.stat().st_size if f.exists() else 0
        if not f.exists():
            raise ApiError("not_found", "올리기 기록이 없습니다 — 처음부터 다시 올려 주세요")
        if offset != have:
            raise ApiError("conflict", "이어 올릴 자리가 다릅니다", {"bytes": have, "size": int(r["size"])}, 409)
        data = await request.body()
        if len(data) > _chunk()[1]:
            raise ApiError("too_large", "한 조각이 너무 큽니다", {"size": len(data), "limit": _chunk()[1]}, 413)
        if have + len(data) > int(r["size"]):
            raise ApiError("bad_request", "올린 크기가 파일 크기보다 큽니다", {"bytes": have, "size": int(r["size"])})

        def write():
            with open(f, "ab") as fh:
                fh.write(data)
        await run_in_threadpool(write)
        st = _sha.get(uid)
        if st and st[0] == have:
            st[1].update(data)
            _sha[uid] = (have + len(data), st[1])
        else:
            _sha.pop(uid, None)                          # 지문 이어 쓰기 끊김 — 끝낼 때 파일로 다시 계산
        async with db(realm="lx") as conn:
            await conn.execute("UPDATE request_uploads SET updated_at=now() WHERE id=$1", uid)
    return _up_view(r, have + len(data))


@router.delete("/requests/uploads/{uid}")
async def up_cancel(uid: str, request: Request):
    """취소 — 받은 조각(또는 다 받은 파일)을 지운다. 의뢰에 쓰인 파일은 지우지 않는다."""
    p = _tuser(request)
    async with db(realm="lx") as conn:
        r = await _upload_row(conn, uid, p, None)
        if r["request_id"]:
            raise ApiError("conflict", "의뢰에 쓰인 파일은 지울 수 없습니다", None, 409)
        if r["state"] in ("uploading", "done"):
            _rm(_part(r), _path(r))
            await conn.execute("UPDATE request_uploads SET state='cancelled', updated_at=now() WHERE id=$1", uid)
            await audit(conn, p, "request.upload.cancel", uid, None, {"draft_id": r["draft_id"]})
    _sha.pop(uid, None)
    from .quota import invalidate_storage
    invalidate_storage(p.tenant_id)
    return {"id": uid, "state": "cancelled", "as_of": now_iso()}


def _quick_fp(path: Path, size: int) -> str:
    h = hashlib.sha256(f"{size}:".encode())
    with open(path, "rb") as f:
        h.update(f.read(QUICK))
        if size > QUICK:
            f.seek(size - QUICK)
            h.update(f.read(QUICK))
    return h.hexdigest()


def _sha_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for b in iter(lambda: f.read(8 << 20), b""):
            h.update(b)
    return h.hexdigest()


@router.post("/requests/uploads/{uid}/finish")
async def up_finish(uid: str, request: Request):
    """다 받았으면 → 전체 지문으로 같은 파일 확인(같으면 새로 받은 것은 지우고 409) → 끝."""
    p = _tuser(request)
    lock = _locks.setdefault(uid, asyncio.Lock())
    async with lock:
        async with db(realm="lx") as conn:
            r = await _upload_row(conn, uid, p)
        f = _part(r)
        have = f.stat().st_size if f.exists() else 0
        if have != int(r["size"]):
            raise ApiError("conflict", "아직 다 올라가지 않았습니다", {"bytes": have, "size": int(r["size"])}, 409)
        dest = _path(r)
        f.replace(dest)
        st = _sha.pop(uid, None)
        sha = st[1].hexdigest() if st and st[0] == have else await run_in_threadpool(_sha_file, dest)
        quick = await run_in_threadpool(_quick_fp, dest, have)
        async with db(realm="lx") as conn:
            dup = await _find_dup(conn, p.tenant_id, r["draft_id"], have, None, sha, uid)
            if dup:
                _rm(dest)
                await conn.execute("UPDATE request_uploads SET state='removed', sha256=$2, quick_fp=$3, updated_at=now() WHERE id=$1", uid, sha, quick)
                await audit(conn, p, "request.upload.duplicate", uid, None, {"same_as": dup["id"]})
                line = _dup_line(dup, dup["draft_id"] == r["draft_id"])
            else:
                r = await conn.fetchrow("UPDATE request_uploads SET state='done', sha256=$2, quick_fp=$3, done_at=now(), updated_at=now() "
                                        "WHERE id=$1 RETURNING *", uid, sha, quick)
                await audit(conn, p, "request.upload.done", uid, None, {"draft_id": r["draft_id"], "size": have})
                line = None
    _locks.pop(uid, None)
    from .quota import invalidate_storage
    invalidate_storage(p.tenant_id)
    if line:
        raise ApiError("duplicate", line, None, 409)
    return _up_view(r, have)


@router.delete("/requests/drafts/{did}")
async def draft_delete(did: str, request: Request):
    """의뢰하기 전 묶음을 통째로 지운다(관할 밖 영상 · 잘못 고른 파일)."""
    p = _tuser(request)
    if not re.fullmatch(r"dr_[0-9a-f]{12}", did or ""):
        raise ApiError("not_found", "묶음이 없습니다")
    async with db(realm="lx") as conn:
        rows = await conn.fetch("SELECT * FROM request_uploads WHERE draft_id=$1 AND tenant_id=$2 AND user_id=$3", did, p.tenant_id, p.user_id)
        if any(r["request_id"] for r in rows):
            raise ApiError("conflict", "이미 의뢰한 묶음입니다", None, 409)
        for r in rows:
            _rm(_part(r), _path(r))
        await conn.execute("UPDATE request_uploads SET state='cancelled', updated_at=now() WHERE draft_id=$1 AND state IN ('uploading','done')", did)
        await audit(conn, p, "request.draft.delete", did, None, {"files": len(rows)})
    folder = config.DATA_ROOT / root_rel(p.tenant_id) / "drafts" / did
    shutil.rmtree(folder, ignore_errors=True)
    from .quota import invalidate_storage
    invalidate_storage(p.tenant_id)
    return {"draft_id": did, "state": "cancelled", "as_of": now_iso()}


# ═══ 파일에서 읽기(원칙 49 — 해상도 · 촬영일 · 범위 · 좌표계는 파일에서) ═══════════════════════
class ReadFail(Exception):
    def __init__(self, code: str, line: str):
        super().__init__(line)
        self.code, self.line = code, line


def _meta(path: Path) -> dict:
    import warnings
    import rasterio
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            ds = rasterio.open(str(path))
    except Exception:
        if _ext(path.name) == "ecw":
            raise ReadFail("ecw", "ECW 파일은 이 서버에서 아직 바로 읽을 수 없습니다 — TIF 로 저장해 올려 주세요") from None
        raise ReadFail("unreadable", "영상으로 읽을 수 없는 파일이 있습니다 — TIF · JPG · JP2 파일인지 확인해 주세요") from None
    with ds:
        epsg = None
        if ds.crs:
            try:
                epsg = ds.crs.to_epsg() or ds.crs.to_epsg(confidence_threshold=40)
            except Exception:
                epsg = None
        tags: dict = {}
        for ns in (None, "EXIF"):
            try:
                tags.update(ds.tags(ns=ns) if ns else ds.tags())
            except Exception:
                pass
        t = ds.transform
        try:
            ovr = bool(ds.overviews(1))
        except Exception:
            ovr = False
        return {"name": path.name, "path": path, "w": ds.width, "h": ds.height, "count": ds.count, "dtype": ds.dtypes[0], "transform": t,
                "bounds": ds.bounds, "epsg": epsg, "crs_known": bool(ds.crs), "georef": not t.is_identity, "tags": tags, "ovr": ovr}


_DATE_TAGS = ("TIFFTAG_DATETIME", "EXIF_DateTimeOriginal", "EXIF_DateTimeDigitized", "EXIF_DateTime", "ACQUISITIONDATETIME",
              "ACQUISITION_DATE", "DATE_ACQUIRED", "IMAGE_DATE")
_RE_YMD = re.compile(r"((?:19|20)\d{2})[:\-/._]?(0[1-9]|1[0-2])[:\-/._]?(0[1-9]|[12]\d|3[01])")


def _date_of(m: dict) -> tuple[str | None, str | None]:
    """촬영일 — 파일 안 기록(TIFF · EXIF) → 파일 이름(20250415 · 2025-04-15) → 파일 이름의 연도. 없으면 None(지어내지 않는다)."""
    today = dt.date.today()

    def ok(y, mo=1, d=1):
        try:
            v = dt.date(int(y), int(mo), int(d))
        except ValueError:
            return False
        return dt.date(1990, 1, 1) <= v <= today + dt.timedelta(days=1)
    for k in _DATE_TAGS:
        v = str(m["tags"].get(k) or "")
        x = _RE_YMD.search(v)
        if x and ok(*x.groups()):
            return f"{x.group(1)}-{x.group(2)}-{x.group(3)}", "file"
    stem = m["name"].rsplit(".", 1)[0]
    x = re.search(r"(?<!\d)((?:19|20)\d{2})[-_.]?(0[1-9]|1[0-2])[-_.]?(0[1-9]|[12]\d|3[01])(?!\d)", stem)
    if x and ok(*x.groups()):
        return f"{x.group(1)}-{x.group(2)}-{x.group(3)}", "name"
    x = re.search(r"(?<!\d)(20\d{2}|199\d)(?!\d)", stem)
    if x and ok(x.group(1)):
        return x.group(1), "name"
    return None, None


def _date_word(d: str | None) -> str | None:
    if not d:
        return None
    return f"{d[:4]}년" if len(d) == 4 else d.replace("-", ".")


def _guess_crs(p: Principal, m: dict) -> int | None:
    """좌표계 기록이 없는 파일(JPG + 좌표 파일 등) — 후보 좌표계로 옮겨 보아 관할 안에 떨어지는 것(없으면 국내에 떨어지는 첫 후보)."""
    from rasterio.warp import transform as wt
    from . import regions as R
    b = m["bounds"]
    cx, cy = (b.left + b.right) / 2, (b.bottom + b.top) / 2
    first = None
    for c in settings()["crs_guess"]:
        try:
            xs, ys = wt(f"EPSG:{int(c)}", "EPSG:4326", [cx], [cy])
        except Exception:
            continue
        lng, lat = xs[0], ys[0]
        if not (math.isfinite(lng) and math.isfinite(lat) and -180 <= lng <= 180 and -90 <= lat <= 90):
            continue
        if int(c) == 4326 and not (abs(cx) <= 180 and abs(cy) <= 90):
            continue
        try:
            if R.point_in_scope(p, lng, lat):
                return int(c)
        except Exception:
            pass
        if first is None and 124 <= lng <= 132 and 33 <= lat <= 39:
            first = int(c)
    return first


def _gsd_m(m: dict, epsg: int) -> float:
    a = abs(m["transform"].a)
    if epsg in (4326, 4737, 4019, 4166):
        b = m["bounds"]
        lat = math.radians((b.bottom + b.top) / 2)
        return a * 111320 * max(0.1, math.cos(lat))
    return a


def _kind(gsd: float) -> str:
    return "drone" if gsd < 0.1 else "aerial" if gsd < 1 else "satellite"


_GDAL_TYPE = {"uint8": "Byte", "uint16": "UInt16", "int16": "Int16", "uint32": "UInt32", "int32": "Int32", "float32": "Float32", "float64": "Float64"}


def _write_vrt(out: Path, metas: list[dict], epsg: int) -> None:
    """여러 파일 · 좌표계를 가려낸 파일 · 3밴드가 아닌 파일 → 가상 모음 파일 하나(분석은 이 파일 하나로 — 모자이크 복사 0).
    북쪽이 위인 영상만(기울어진 영상이 섞이면 거절)."""
    import rasterio.crs
    from xml.sax.saxutils import escape
    for m in metas:
        t = m["transform"]
        if abs(t.b) > 1e-12 or abs(t.d) > 1e-12:
            raise ReadFail("rotated", "기울어진 영상이 섞여 있어 한 번에 읽지 못했습니다 — 파일을 하나씩 의뢰해 주세요")
    res = min(abs(m["transform"].a) for m in metas)
    x0 = min(m["bounds"].left for m in metas)
    x1 = max(m["bounds"].right for m in metas)
    y0 = min(m["bounds"].bottom for m in metas)
    y1 = max(m["bounds"].top for m in metas)
    W, H = max(1, math.ceil((x1 - x0) / res - 1e-6)), max(1, math.ceil((y1 - y0) / res - 1e-6))
    gt = _GDAL_TYPE.get(metas[0]["dtype"], "Byte")
    srs = escape(rasterio.crs.CRS.from_epsg(epsg).to_wkt())
    bands = []
    for b, ci in ((1, "Red"), (2, "Green"), (3, "Blue")):
        src = []
        for m in metas:
            t = m["transform"]
            sb = b if m["count"] >= 3 else 1
            xo, yo = round((m["bounds"].left - x0) / res), round((y1 - m["bounds"].top) / res)
            xs, ys = round(m["w"] * abs(t.a) / res), round(m["h"] * abs(t.e) / res)
            src.append(f'<SimpleSource><SourceFilename relativeToVRT="1">{escape(m["name"])}</SourceFilename><SourceBand>{sb}</SourceBand>'
                       f'<SrcRect xOff="0" yOff="0" xSize="{m["w"]}" ySize="{m["h"]}"/><DstRect xOff="{xo}" yOff="{yo}" xSize="{xs}" ySize="{ys}"/></SimpleSource>')
        bands.append(f'<VRTRasterBand dataType="{gt}" band="{b}"><ColorInterp>{ci}</ColorInterp>{"".join(src)}</VRTRasterBand>')
    out.write_text(f'<VRTDataset rasterXSize="{W}" rasterYSize="{H}"><SRS>{srs}</SRS>'
                   f'<GeoTransform>{x0!r}, {res!r}, 0.0, {y1!r}, 0.0, {-res!r}</GeoTransform>{"".join(bands)}</VRTDataset>', encoding="utf-8")


def _footprint(m: dict, epsg: int):
    from rasterio.warp import transform as wt
    from shapely.geometry import Polygon
    b = m["bounds"]
    n = 8                                              # 가장자리마다 점 8개(좌표계를 옮기면 곧은 변이 휘는 만큼)
    ring = ([(b.left + (b.right - b.left) * i / n, b.bottom) for i in range(n)] + [(b.right, b.bottom + (b.top - b.bottom) * i / n) for i in range(n)]
            + [(b.right - (b.right - b.left) * i / n, b.top) for i in range(n)] + [(b.left, b.top - (b.top - b.bottom) * i / n) for i in range(n)])
    xs, ys = wt(f"EPSG:{epsg}", "EPSG:4326", [x for x, _ in ring], [y for _, y in ring])
    return Polygon([(round(x, 7), round(y, 7)) for x, y in zip(xs, ys)]).buffer(0)


def _corners(src: Path) -> list:
    """미리 보기 그림을 지도에 얹을 네 모서리(왼위 · 오른위 · 오른아래 · 왼아래 · 경위도)."""
    import rasterio
    from rasterio.warp import transform as wt
    with rasterio.open(str(src)) as ds:
        t, w, h = ds.transform, ds.width, ds.height
        pts = [t * (0, 0), t * (w, 0), t * (w, h), t * (0, h)]
        xs, ys = wt(ds.crs, "EPSG:4326", [x for x, _ in pts], [y for _, y in pts])
    return [[round(x, 7), round(y, 7)] for x, y in zip(xs, ys)]


def _preview(src: Path) -> str | None:
    """작은 미리 보기(가로 · 세로 640 이하 · 투명 테두리) — 큰 영상에 겹 해상도(오버뷰)가 없으면 만들지 않는다(읽기가 느려짐)."""
    import warnings
    import numpy as np
    import rasterio
    from rasterio.enums import Resampling
    try:
        import cv2
    except Exception:
        return None
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        with rasterio.open(str(src)) as ds:
            w, h = ds.width, ds.height
            try:
                has_ovr = bool(ds.overviews(1))
            except Exception:
                has_ovr = False
            if w * h > 4e8 and not has_ovr:
                return None
            k = max(w, h) / 640
            pw, ph = (max(1, round(w / k)), max(1, round(h / k))) if k > 1 else (w, h)
            bands = [1, 2, 3] if ds.count >= 3 else [1, 1, 1]
            arr = ds.read(bands, out_shape=(3, ph, pw), resampling=Resampling.average).astype("float32")
            try:
                mask = ds.dataset_mask(out_shape=(ph, pw))
            except Exception:
                mask = np.full((ph, pw), 255, dtype="uint8")
    if ds.dtypes[0] != "uint8":
        for i in range(3):
            v = arr[i][mask > 0] if (mask > 0).any() else arr[i]
            lo, hi = (np.percentile(v, 2), np.percentile(v, 98)) if v.size else (0, 1)
            arr[i] = np.clip((arr[i] - lo) / max(hi - lo, 1e-6) * 255, 0, 255)
    rgba = np.dstack([arr[2], arr[1], arr[0], mask.astype("float32")]).astype("uint8")
    ok, buf = cv2.imencode(".webp", rgba, [cv2.IMWRITE_WEBP_QUALITY, 80])
    return "data:image/webp;base64," + base64.b64encode(buf.tobytes()).decode() if ok else None


def read_files(p: Principal, org: str, folder: Path, names: list[str]) -> dict:
    """묶음 안 파일 → 읽은 값. 동기(스레드에서). 실패는 {ok: False, code, why(사용자 말)}."""
    from shapely.ops import unary_union
    from .deploys import gsd_word
    from .jobs import aoi_area
    s = settings()
    rasters = [n for n in names if _ext(n) in s["raster_ext"]]
    if not rasters:
        return {"ok": False, "code": "no_raster", "why": "영상 파일(TIF · JPG · JP2 · ECW)이 없습니다"}
    try:
        metas = [_meta(folder / n) for n in rasters]
        if not all(m["georef"] for m in metas):
            return {"ok": False, "code": "no_georef", "why": "위치 정보가 없는 영상입니다 — 좌표 파일(JGW · TFW 등)을 함께 올려 주세요"}
        guessed = False
        for m in metas:
            if m["epsg"] is None:
                g = _guess_crs(p, m)
                if g is None:
                    return {"ok": False, "code": "no_crs", "why": "좌표계를 알아볼 수 없는 영상입니다 — 좌표계 파일(PRJ)을 함께 올려 주세요"}
                m["epsg"], guessed = g, guessed or not m["crs_known"]
        if len({m["epsg"] for m in metas}) > 1:
            return {"ok": False, "code": "mixed_crs", "why": "좌표계가 서로 다른 파일이 섞여 있습니다 — 좌표계별로 따로 의뢰해 주세요"}
        epsg = metas[0]["epsg"]
        need_vrt = len(metas) > 1 or guessed or metas[0]["count"] < 3 or not metas[0]["crs_known"]
        src = folder / "_모음.vrt" if need_vrt else folder / rasters[0]
        if need_vrt:
            _write_vrt(src, metas, epsg)
        fp = unary_union([_footprint(m, epsg) for m in metas]).buffer(0)
    except ReadFail as e:
        return {"ok": False, "code": e.code, "why": e.line}
    gsd = min(_gsd_m(m, epsg) for m in metas)
    date, date_src = next(((d, w) for d, w in (_date_of(m) for m in metas) if d), (None, None))
    inside, out_pct = _clip(p, fp)
    base = {"n": len(rasters), "gsd_m": round(gsd, 4), "gsd_word": gsd_word(gsd), "kind": _kind(gsd), "kind_word": KIND_WORD[_kind(gsd)],
            "date": date, "date_word": _date_word(date), "date_src": date_src, "crs_word": CRS_WORD.get(epsg) or f"EPSG {epsg}",
            "crs_guessed": guessed, "footprint": mapping(fp), "bbox": list(fp.bounds)}
    try:
        ov = {"coordinates": _corners(src), "url": _preview(src)}
    except Exception:
        ov = None
    if inside is None:
        return {**base, "ok": False, "code": "out_of_scope", "why": f"관할 밖 영상입니다 — {org} 관할 안의 영상만 의뢰할 수 있습니다",
                "overlay": ov}
    place, sgg = _place(p, inside)
    area, _ = aoi_area(mapping(inside if inside.geom_type == "Polygon" else max(getattr(inside, "geoms", [inside]), key=lambda x: x.area)))
    return {**base, "ok": True, "place": place, "sgg_cd": sgg, "scope": "partial" if out_pct else "in",
            "out_pct": env(out_pct, "%", "measured", "영상 범위 − 관할(읍면동 경계 · 연안 바다)") if out_pct else None,
            "area_km2": env(round(area, 3), "km2", "measured", "분석 범위(영상 범위 ∩ 관할 · EPSG:5186)"),
            "aoi": mapping(inside), "overlay": ov, "_src": str(src), "_epsg": epsg}


def _public_read(rd: dict) -> dict:
    return {k: v for k, v in rd.items() if not k.startswith("_")}


@router.post("/requests/drafts/{did}/read")
async def draft_read(did: str, request: Request):
    """올린 파일에서 읽은 값 — '이렇게 읽었습니다'(입력 칸 없음 · 원칙 49). 같은 파일 묶음이면 저장해 둔 값을 다시 쓴다."""
    p = _tuser(request)
    if not re.fullmatch(r"dr_[0-9a-f]{12}", did or ""):
        raise ApiError("not_found", "묶음이 없습니다")
    async with db(realm="lx") as conn:
        rows = await conn.fetch("SELECT * FROM request_uploads WHERE draft_id=$1 AND tenant_id=$2 AND state IN ('uploading','done') ORDER BY created_at",
                                did, p.tenant_id)
        org = await _tenant_name(conn, p.tenant_id)
    if not rows:
        raise ApiError("not_found", "올린 파일이 없습니다")
    if any(r["user_id"] != p.user_id for r in rows):
        raise ApiError("forbidden", "다른 사람의 묶음입니다")
    if any(r["state"] == "uploading" for r in rows):
        raise ApiError("not_ready", "아직 올리는 중인 파일이 있습니다", None, 409)
    folder = config.DATA_ROOT / root_rel(p.tenant_id) / "drafts" / did
    names = [r["filename"] for r in rows]
    key = hashlib.sha1("|".join(sorted(r["id"] for r in rows)).encode()).hexdigest()
    cache = folder / "_읽은값.json"
    rd = None
    try:
        c = json.loads(cache.read_text(encoding="utf-8"))
        if c.get("_key") == key:
            rd = c
    except Exception:
        rd = None
    if rd is None:
        rd = await run_in_threadpool(read_files, p, org, folder, names)
        rd["_key"] = key
        try:
            cache.write_text(json.dumps(rd, ensure_ascii=False), encoding="utf-8")
        except Exception:
            pass
    return {**_public_read(rd), "draft_id": did, "size": sum(int(r["size"]) for r in rows), "as_of": now_iso()}


# ═══ 의뢰 ══════════════════════════════════════════════════════════════════
def _eta(area_km2: float | None, gsd: float | None, model: dict | None, upsample: float = 1.0) -> dict | None:
    """예상 시간 — 모델 실측 속도(models.perf chips/s)가 있을 때만(지금 있는 값만 · 지어내지 않는다). 칸 수 ≈ 면적 ÷ (칸 한 변)²."""
    cps = ((model or {}).get("perf") or {}).get("chips_per_s", {}).get("value") if model else None
    if not (area_km2 and gsd and cps):
        return None
    side = CHIP * gsd / max(upsample, 1e-6) * (1 - OVERLAP)
    chips = max(1, math.ceil(area_km2 * 1e6 / (side * side)))
    return env(round(chips / float(cps) + 3.0, 1), "s", "estimate", f"모델 실측 속도 × 칸 {chips}", "대기 순서 제외")


def _eta_word(e: dict | None) -> str | None:
    s = (e or {}).get("value")
    if s is None:
        return None
    return "약 1분 안" if s < 60 else f"약 {round(s / 60)}분" if s < 3600 else f"약 {s / 3600:.1f}시간"


async def _card_lead(conn, card_id: str | None, cv: str | None) -> str | None:
    """담당 프로젝트장 = 서비스 카드의 담당 LX 직원(cards.owner_id · 검토 요청과 같은 규칙) → 없으면 그 서비스 공개를 요청한 LX 직원
    → 없으면 None(LX 관리자가 받는다 · 관리자는 늘 함께 본다 — 원칙 72)."""
    try:
        o = await conn.fetchval("SELECT owner_id FROM cards WHERE id=$1", card_id) if card_id else None
    except Exception:  # noqa: BLE001 — 담당 칸이 아직 없는 DB
        o = None
    if o or not cv:
        return o
    return await conn.fetchval("SELECT requested_by FROM approvals WHERE subject_type='card' AND subject_id=$1 AND requested_by IS NOT NULL "
                               "ORDER BY at DESC LIMIT 1", cv)


@router.post("/requests", status_code=201)
async def create(body: dict, request: Request):
    """의뢰 — 곧바로 돌지 않고 LX 관리자 결재함에 들어간다(무상 · 원칙 60 고침). 영상 범위는 관할 안만. 기관 한도로 막지 않는다(사용자 7차 답)."""
    from .catalog import shared_ids
    from .deploys import choose_model, gsd_word
    from .jobs import aoi_area, fit_upsample, ops_event, tenant_event
    p = _tuser(request)
    sid = str(body.get("service_id") or "")
    src = body.get("source")
    memo = (str(body.get("memo") or "").strip()[:200]) or None
    if src not in ("shared", "upload"):
        raise ApiError("bad_request", "영상을 먼저 골라 주세요")
    async with db(realm="lx") as conn:
        d = next((x for x in await _services(conn, p.tenant_id) if x["id"] == sid), None)
        org = await _tenant_name(conn, p.tenant_id)
    if not d:
        raise ApiError("not_found", "이 기관에 켜진 서비스가 아닙니다")
    meta: dict = {"service": _svc_name(d["cname"]), "org": org}
    draft = imagery_id = None
    if src == "shared":
        imagery_id = str(body.get("imagery_id") or "")
        if imagery_id not in await shared_ids(p.tenant_id):
            raise ApiError("not_found", "공유된 영상이 아닙니다")
        async with db(realm="lx") as conn:
            img = await conn.fetchrow("SELECT id, name, gsd_m, year, epoch, path_internal, layer, ST_AsGeoJSON(footprint)::json AS fp FROM imagery WHERE id=$1",
                                      imagery_id)
            done = await _results_by_imagery(conn, p.tenant_id)
        if not img or not img["fp"] or not (img["path_internal"] or (img["layer"] or {}).get("cog_path")):
            raise ApiError("imagery_unavailable", "이 영상은 지도 보기 전용이라 분석에 쓸 수 없습니다", None, 409)
        if sid in done.get(imagery_id, set()):
            raise ApiError("conflict", "이 영상은 이 서비스로 이미 분석했거나 의뢰했습니다", None, 409)
        inside, out_pct = await run_in_threadpool(_clip, p, shape(img["fp"]).buffer(0))
        if inside is None:
            raise ApiError("out_of_scope", "관할 밖 영상입니다", None, 403)
        gsd = float(img["gsd_m"] or 0) or None
        ep = str(img["year"] or img["epoch"] or "")
        place, sgg = await run_in_threadpool(_place, p, inside)
        meta.update({"label": _svc_name(img["name"]), "date": ep[:4] if ep[:4].isdigit() else None, "gsd_m": gsd, "gsd_word": gsd_word(gsd) if gsd else "",
                     "kind": _kind(gsd) if gsd else None, "place": place, "sgg_cd": sgg, "out_pct": out_pct, "shared": True})
    else:
        draft = str(body.get("draft_id") or "")
        if not re.fullmatch(r"dr_[0-9a-f]{12}", draft):
            raise ApiError("bad_request", "올린 영상을 먼저 골라 주세요")
        async with db(realm="lx") as conn:
            rows = await conn.fetch("SELECT * FROM request_uploads WHERE draft_id=$1 AND tenant_id=$2 AND state IN ('uploading','done')", draft, p.tenant_id)
        if not rows or any(r["user_id"] != p.user_id for r in rows):
            raise ApiError("not_found", "올린 파일이 없습니다")
        if any(r["state"] == "uploading" for r in rows):
            raise ApiError("not_ready", "아직 올리는 중인 파일이 있습니다", None, 409)
        if any(r["request_id"] for r in rows):
            raise ApiError("conflict", "이미 의뢰한 묶음입니다", None, 409)
        folder = config.DATA_ROOT / root_rel(p.tenant_id) / "drafts" / draft
        try:
            rd = json.loads((folder / "_읽은값.json").read_text(encoding="utf-8"))
        except Exception:
            rd = await run_in_threadpool(read_files, p, org, folder, [r["filename"] for r in rows])
        if not rd.get("ok"):
            raise ApiError(rd.get("code") or "unreadable", rd.get("why") or "영상을 읽지 못했습니다", None, 403 if rd.get("code") == "out_of_scope" else 409)
        inside = shape(rd["aoi"])
        gsd = float(rd["gsd_m"])
        date = rd.get("date")
        meta.update({"label": f"{_date_word(date) + ' ' if date else ''}{rd['kind_word']} 영상", "date": date, "date_src": rd.get("date_src"),
                     "gsd_m": gsd, "gsd_word": rd["gsd_word"], "kind": rd["kind"], "place": rd["place"], "sgg_cd": rd.get("sgg_cd"),
                     "out_pct": (rd.get("out_pct") or {}).get("value") or 0, "crs_word": rd.get("crs_word"), "files": rd.get("n"),
                     "size": sum(int(r["size"]) for r in rows), "src": rd["_src"], "epsg": rd["_epsg"], "footprint": rd["footprint"],
                     "overlay": rd.get("overlay")})
    area, _ = aoi_area(mapping(inside if inside.geom_type == "Polygon" else max(getattr(inside, "geoms", [inside]), key=lambda x: x.area)))
    async with db(realm="lx") as conn:
        pk = await choose_model(conn, d["model_override"], d["card_id"], d["card_version_id"], meta["gsd_m"])
        if not pk.get("model_id"):
            raise ApiError("model_mismatch", "이 영상 해상도로는 이 서비스를 분석할 수 없습니다 — 해상도에 맞는 서비스를 골라 주세요", None, 409)
        model = await conn.fetchrow("SELECT id, name, perf, gsd_trained_m FROM models WHERE id=$1", pk["model_id"])
        up = fit_upsample(model, {"gsd_m": meta["gsd_m"]}) if model else 1.0
        eta = _eta(area, meta["gsd_m"], dict(model) if model else None, up)
        meta.update({"area_km2": round(area, 4), "eta_s": (eta or {}).get("value"), "model": _svc_name(model["name"]) if model and model["name"] else None,
                     "model_gsd_word": gsd_word(model["gsd_trained_m"]) if model and model["gsd_trained_m"] else None})
        lead = await _card_lead(conn, d["card_id"], d["card_version_id"])
        rid, aid = "rq_" + secrets.token_hex(6), "ap_" + secrets.token_hex(6)
        await conn.execute(
            "INSERT INTO analysis_requests(id, tenant_id, requested_by, deploy_id, source, imagery_id, draft_id, meta, aoi, memo, state, approval_id, lead_user) "
            "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,ST_SetSRID(ST_GeomFromGeoJSON($9),4326),$10,'pending',$11,$12)",
            rid, p.tenant_id, p.user_id, sid, src, imagery_id, draft, meta, json.dumps(mapping(inside)), memo, aid, lead)
        if draft:
            await conn.execute("UPDATE request_uploads SET request_id=$2, updated_at=now() WHERE draft_id=$1 AND state='done'", draft, rid)
        await conn.execute("INSERT INTO approvals(id, subject_type, subject_id, requested_by, state, payload, reason, tenant_id, at) "
                           "VALUES ($1,'request',$2,$3,'pending',$4,$5,$6,now())", aid, rid, p.user_id,
                           {"service": meta["service"], "org": org, "label": meta["label"], "lead_user": lead}, memo, p.tenant_id)
        await audit(conn, p, "request.create", rid, None, {"deploy_id": sid, "source": src, "approval_id": aid, "area_km2": round(area, 4)})
    await ops_event("approval.requested", {"approval_id": aid, "subject_type": "request", "subject_id": rid, "tenant_id": p.tenant_id,
                                           "by": p.user_id, "lead_user": lead, "at": now_iso()})
    await tenant_event(p.tenant_id, "request.changed", {"request_id": rid, "state": "pending"})
    return await get_request(rid, request)


# ═══ 목록 · 한 건 · 시점 ═══════════════════════════════════════════════════
REQ_COLS = ("q.*, ST_AsGeoJSON(q.aoi, 7)::json AS aoi_g, d.card_id, d.card_version_id, d.model_override, d.year AS dyear, c.name AS cname")


def _view(r, p: Principal | None = None, org: str | None = None) -> dict:
    m = dict(r["meta"] or {})
    res = m.get("result") or {}
    v = {"id": r["id"], "state": r["state"], "state_word": STATE_WORD.get(r["state"], r["state"]), "tenant_id": r["tenant_id"],
         "org": org or m.get("org"), "service": {"id": r["deploy_id"], "name": m.get("service") or _svc_name(r["cname"])},
         "source": r["source"], "label": m.get("label"), "place": m.get("place"), "date": m.get("date"), "date_word": _date_word(m.get("date")),
         "gsd_word": m.get("gsd_word"), "kind_word": KIND_WORD.get(m.get("kind") or "", ""),
         "area_km2": env(m.get("area_km2"), "km2", "measured", "분석 범위(영상 범위 ∩ 관할)") if m.get("area_km2") is not None else None,
         "memo": r["memo"], "reason": r["reason"] if r["state"] in ("rejected", "failed") else None,
         "created_at": _iso(r["created_at"]), "decided_at": _iso(r["decided_at"]),
         "mine": bool(p and r["requested_by"] == p.user_id)}
    if r["state"] == "done":
        tp = f"{v['date_word'] or _ymd(r['created_at'])} · {m.get('gsd_word') or ''} · {m.get('place') or ''}".replace(" ·  · ", " · ").strip(" ·")
        v["result"] = {"result_set": r["result_set"], "counts": res.get("counts") or {},
                       "total": env(res.get("total"), "count", "inferred", "AI 분석 결과(결과 확인 전)"), "timepoint": tp}
    return v


async def _sync(rows: list) -> list:
    """분석 중 의뢰 → 작업 상태(작업 표 · 끝난 상태만)로 결과 도착 · 분석하지 못함. 끝나면 의뢰 영상을 영상 표에서 뺀다(다른 분석이 쓰지 않게).
    승인됐는데 작업이 없는 의뢰(게이트웨이가 그 사이 다시 뜬 경우)는 한 번 더 대기열에 넣는다."""
    from .jobs import tenant_event
    out = list(rows)
    for r in out:
        if r["state"] == "approved" and not r["job_id"] and r["decided_at"] and (dt.datetime.now(KST) - r["decided_at"]).total_seconds() > 90:
            after_decided(r["id"], "approve", r["decided_by"] or "system", notify=False)
    todo = [i for i, r in enumerate(out) if r["state"] == "analyzing" and r["job_id"]]
    for i in todo:
        r = out[i]
        async with db(realm="lx") as conn:
            j = await conn.fetchrow("SELECT state, counts FROM jobs WHERE id=$1", r["job_id"])
        st = j["state"] if j else "failed"
        if st not in ("done", "failed", "cancelled"):
            continue
        m = dict(r["meta"] or {})
        if st == "done":
            async with db(realm="lx") as conn:          # 사람 말 분류 이름(결과 표와 같은 한 출처 · 지운 것 제외)
                by = {x["cls"] or x["cls_en"] or "기타": int(x["n"]) for x in await conn.fetch(
                    "SELECT cls, cls_en, count(*) n FROM detections WHERE job_id=$1 AND edit_state <> 'deleted' GROUP BY 1, 2 ORDER BY 3 DESC", r["job_id"])}
            if not by:
                by = j["counts"] or {}
                if isinstance(by, str):
                    by = json.loads(by)
            m["result"] = {"counts": by, "total": int(sum(v for v in by.values() if isinstance(v, (int, float))))}
            new, reason = "done", None
        else:
            new, reason = "failed", "분석하지 못했습니다 — LX 담당자가 확인합니다"
        async with db(realm="lx") as conn:
            hit = await conn.fetchval("UPDATE analysis_requests SET state=$2, reason=$3, meta=$4, updated_at=now() WHERE id=$1 AND state='analyzing' "
                                      "RETURNING id", r["id"], new, reason, m)
            if not hit:
                continue
            if r["source"] == "upload" and r["imagery_id"]:       # 의뢰 영상은 분석이 끝나면 범위를 지워 다른 분석 · 지역 영상 목록이 고르지 않게(작업 기록이 가리켜 행은 둔다)
                await conn.execute("UPDATE imagery SET footprint=NULL, sgg_cd=NULL, layer = coalesce(layer,'{}'::jsonb) || '{\"retired\": true}'::jsonb "
                                   "WHERE id=$1 AND layer->>'role'='request'", r["imagery_id"])
            await conn.execute("INSERT INTO audit_log(actor, realm, action, subject, before, after) VALUES ('system','system',$1,$2,NULL,$3)",
                               f"request.{new}", r["id"], {"job_id": r["job_id"], "tenant_id": r["tenant_id"]})
            out[i] = await conn.fetchrow(f"SELECT {REQ_COLS} FROM analysis_requests q JOIN deploys d ON d.id=q.deploy_id "
                                         "LEFT JOIN cards c ON c.id=d.card_id WHERE q.id=$1", r["id"])
        await tenant_event(r["tenant_id"], "request.changed", {"request_id": r["id"], "state": new})
    return out


@router.get("/requests")
async def list_requests(request: Request, tenant_id: str | None = None, service: str | None = None):
    p = require(principal(request))
    if p.realm == "tenant":
        tid = p.tenant_id
    elif p.is_lx and p.role in ("admin", "staff"):
        tid = tenant_id
    else:
        raise ApiError("forbidden", "기관 계정 또는 LX 관리자 · 직원만")
    async with db(realm="lx") as conn:
        rows = await conn.fetch(f"SELECT {REQ_COLS} FROM analysis_requests q JOIN deploys d ON d.id=q.deploy_id LEFT JOIN cards c ON c.id=d.card_id "
                                "WHERE ($1::text IS NULL OR q.tenant_id=$1) AND ($2::text IS NULL OR q.deploy_id=$2) ORDER BY q.created_at DESC LIMIT 100",
                                tid, service)
    rows = await _sync(rows)
    items = [_view(r, p) for r in rows]
    return {"items": items, "total": len(items),
            "pending": env(sum(1 for i in items if i["state"] == "pending"), "count", "recorded", "analysis_requests(state pending)"),
            "as_of": now_iso()}


@router.get("/requests/timepoints")
async def timepoints(request: Request, service: str):
    """그 서비스의 결과 시점 — 서비스 결과(배포본 결과) + 의뢰로 더해진 시점(결과 도착 순). 서비스 대시보드의 시점 고르기가 쓴다."""
    p = require(principal(request))
    async with db(realm="lx") as conn:
        d = await conn.fetchrow("SELECT d.id, d.tenant_id, d.year, d.snapshot_current, c.name AS cname FROM deploys d LEFT JOIN cards c ON c.id=d.card_id "
                                "WHERE d.id=$1", service)
        if not d or (not p.is_lx and d["tenant_id"] != p.tenant_id):
            raise ApiError("not_found", "서비스가 없습니다")
        rows = await conn.fetch(f"SELECT {REQ_COLS} FROM analysis_requests q JOIN deploys d ON d.id=q.deploy_id LEFT JOIN cards c ON c.id=d.card_id "
                                "WHERE q.deploy_id=$1 AND q.state IN ('analyzing','done') ORDER BY q.created_at", service)
    rows = await _sync(rows)
    items = []
    if d["snapshot_current"]:
        items.append({"kind": "service", "label": f"{d['year']}년 서비스 결과" if d["year"] else "서비스 결과", "year": d["year"],
                      "result_set": d["snapshot_current"]})
    for r in rows:
        if r["state"] != "done":
            continue
        v = _view(r, p)
        items.append({"kind": "request", "request_id": r["id"], "label": v["result"]["timepoint"], "date": v["date"], "result_set": r["result_set"],
                      "counts": v["result"]["counts"], "total": v["result"]["total"], "at": v["decided_at"]})
    return {"service": {"id": d["id"], "name": _svc_name(d["cname"])}, "items": items, "as_of": now_iso()}


async def basis(conn, r) -> list:
    """결재 판단 근거 — 범위 · 면적 · 영상 · 예상 시간 · 분석 모델 · 한도 남은 양(지금 값). 지금 있는 값만(없으면 줄을 만들지 않는다)."""
    from . import quota as Q
    m = dict(r["meta"] or {})
    rows: list = []
    put = lambda k, v: rows.append([k, v]) if v else None   # noqa: E731
    put("기관 · 서비스", f"{m.get('org') or ''} · {m.get('service') or ''}".strip(" ·"))
    shared = r["source"] == "shared"
    put("영상", " · ".join(x for x in [m.get("label") if shared else None, _date_word(m.get("date")), m.get("gsd_word"), "LX 공유 영상" if shared else None] if x))
    if not shared:
        put("올린 파일", f"{m.get('files') or 1}개 · {_gb((m.get('size') or 0) / 1e9)}")
    rng = m.get("place")
    if rng and m.get("out_pct"):
        rng += f" · 관할 밖 약 {m['out_pct']}%는 분석하지 않음"
    put("범위", rng)
    if m.get("area_km2") is not None:
        a = float(m["area_km2"])
        put("면적", f"약 {a:,.2f}㎢" if a < 10 else f"약 {a:,.0f}㎢")
    put("예상 시간", _eta_word({"value": m.get("eta_s")}) if m.get("eta_s") is not None else None)
    put("분석 모델", " · ".join(x for x in [m.get("model"), m.get("model_gsd_word")] if x))
    if r["state"] in ("pending", "approved"):          # 분석 순번 — 지금 같은 대기열에 먼저 들어 있는 분석
        try:
            n = await conn.fetchval("SELECT count(*) FROM jobs WHERE state IN ('queued','running') AND NOT demo AND pool <> 'cpu'")
            put("대기열", "지금 대기 중인 분석 없음 — 승인하면 바로 시작" if not n else f"앞에 분석 {int(n)}건 — 승인하면 그 뒤 순서")
        except Exception:  # noqa: BLE001
            pass
    # 이 기관의 인프라 사용 현황(막는 한도가 아니라 보여 주는 값 — 사용자 7차 답) · 기관 화면 · 관리자 기관 화면과 같은 한 출처
    use = []
    for dim, word, unit, k in (("gpu_s_month", "GPU", "시간", 1 / 3600), ("area_km2_month", "분석", "㎢", 1), ("storage_gb", "저장", "GB", 1)):
        try:
            u = float(await Q.used(r["tenant_id"], dim) or 0) * k
        except Exception:  # noqa: BLE001
            continue
        use.append(f"{word} {u:,.1f}{unit}" if u < 100 else f"{word} {u:,.0f}{unit}")
    put("이 기관 이번 달 사용", " · ".join(use))
    return rows


@router.get("/requests/{rid}")
async def get_request(rid: str, request: Request):
    p = require(principal(request))
    async with db(realm="lx") as conn:
        r = await conn.fetchrow(f"SELECT {REQ_COLS} FROM analysis_requests q JOIN deploys d ON d.id=q.deploy_id LEFT JOIN cards c ON c.id=d.card_id "
                                "WHERE q.id=$1", rid)
    if not r or (p.realm == "tenant" and r["tenant_id"] != p.tenant_id) or not (p.realm == "tenant" or (p.is_lx and p.role in ("admin", "staff"))):
        raise ApiError("not_found", "의뢰가 없습니다")
    r = (await _sync([r]))[0]
    m = dict(r["meta"] or {})
    v = _view(r, p)
    async with db(realm="lx") as conn:
        v["basis"] = await basis(conn, r)
        who = None
        if p.is_lx:
            from .approvals import people
            who = (await people(conn)).get(r["requested_by"])
    v.update({"aoi": r["aoi_g"], "footprint": m.get("footprint"), "overlay": m.get("overlay"), "requested_by_name": who,
              "approval_id": r["approval_id"], "as_of": now_iso()})
    return v


# ═══ 결재 → 분석(approvals.decide 가 부른다) ═════════════════════════════════════
async def on_decided(conn, rid: str, decision: str, reason: str | None, user: str) -> dict:
    """결재 트랜잭션 안 — 승인 = 분석 준비(바로 뒤에 after_decided 가 대기열에 넣는다) · 반려 = 사유가 기관 '내 의뢰'에."""
    new = "approved" if decision == "approve" else "rejected"
    n = await conn.execute("UPDATE analysis_requests SET state=$2, reason=$3, decided_by=$4, decided_at=now(), updated_at=now() "
                           "WHERE id=$1 AND state='pending'", rid, new, reason if new == "rejected" else None, user)
    if n.endswith(" 0"):
        raise ApiError("conflict", "이미 결정된 의뢰입니다", None, 409)
    return {"request": rid, "state": new}


_tasks: set = set()


def after_decided(rid: str, decision: str, user: str, notify: bool = True):
    """결재 응답을 막지 않게 배경에서 — 승인이면 분석 작업을 대기열에 넣는다."""
    async def run():
        from .jobs import tenant_event
        if notify:
            async with db(realm="lx") as conn:
                t = await conn.fetchval("SELECT tenant_id FROM analysis_requests WHERE id=$1", rid)
            if t:
                await tenant_event(t, "request.changed", {"request_id": rid, "state": "approved" if decision == "approve" else "rejected"})
        if decision == "approve":
            await start_analysis(rid, user)
    task = asyncio.create_task(run())
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
    return task


FAIL_LINE = {"quota_exceeded": None, "too_large": "범위가 한 번에 분석하기에 너무 넓습니다 — LX 담당자가 나눠 분석합니다",
             "model_input_mismatch": "이 영상에 맞는 분석 모델이 없습니다", "no_imagery": "영상을 찾을 수 없습니다",
             "imagery_unavailable": "영상 파일을 읽을 수 없습니다", "out_of_scope": "관할 밖 영상입니다",
             "aoi_outside_footprint": "분석 범위가 영상 밖입니다", "aoi_too_large": "범위가 한 번에 분석하기에 너무 넓습니다 — LX 담당자가 나눠 분석합니다"}


async def _fail(rid: str, code: str, line: str | None, detail: str | None = None):
    from .jobs import tenant_event
    async with db(realm="lx") as conn:
        t = await conn.fetchval("UPDATE analysis_requests SET state='failed', reason=$2, updated_at=now() WHERE id=$1 RETURNING tenant_id", rid,
                                line or "분석을 시작하지 못했습니다 — LX 담당자가 확인합니다")
        await conn.execute("INSERT INTO audit_log(actor, realm, action, subject, before, after) VALUES ('system','system','request.failed',$1,NULL,$2)",
                           rid, {"code": code, "detail": (detail or "")[:300]})
    if t:
        await tenant_event(t, "request.changed", {"request_id": rid, "state": "failed"})


async def _enqueue(q: dict, body: dict, tenant: str, user: str | None) -> dict:
    """jobs.submit 과 같은 기록(작업 표 + Redis 작업 해시 + 풀 대기열 + job.queued) — 기관 몫 작업(tenant = 의뢰한 기관).
    분석은 게이트웨이 대기열로만 돈다(작업자가 전력 규칙 · 두 장 동시 고부하 금지를 지킨다)."""
    from . import jobs as J
    from .deps import redis
    job_id = "job_" + J.ulid()
    rs = f"results/{tenant}/{job_id}"
    img, aoi = q["_img"], q["_aoi"]
    opts = dict(body.get("options") or {})
    if q.get("_opts"):
        opts.update(q["_opts"])
    prio = 1 if opts.get("scope") == "sgg" else 0
    model_id = (q.get("_model") or {}).get("id") or body.get("model_id")
    imagery_id = body.get("imagery_id") or (img or {}).get("id")
    async with db(realm="lx") as conn:
        await conn.execute(
            "INSERT INTO jobs(id, tenant_id, submitted_by, kind, state, priority, demo, pool, model_id, imagery_id, deploy_id, card_id, aoi, "
            "options, shards_total, result_set, label, test) VALUES ($1,$2,$3,$4,'queued',$5,false,$6,$7,$8,NULL,NULL,"
            "CASE WHEN $9::text IS NULL THEN NULL ELSE ST_SetSRID(ST_GeomFromGeoJSON($9),4326) END,$10,$11,$12,$13,$14)",
            job_id, tenant, user, q["kind"], prio, q["pool"], model_id, imagery_id, json.dumps(aoi) if aoi else None, opts, q["shards"], rs,
            body.get("label"), bool(body.get("test")))
        await conn.execute("INSERT INTO audit_log(actor, realm, action, subject, before, after) VALUES ($1,'tenant','job.submit',$2,NULL,$3)",
                           user or "system", job_id, {"kind": q["kind"], "model_id": model_id, "imagery_id": imagery_id, "request_id": opts.get("request_id")})
    r = await redis()
    now = now_iso()
    await r.hset(f"job:{job_id}", mapping={
        "id": job_id, "state": "queued", "tenant_id": tenant, "demo": "0", "kind": q["kind"], "pool": q["pool"],
        "priority": prio, "model_id": model_id or "", "imagery_id": imagery_id or "",
        "options": json.dumps(opts), "aoi": json.dumps(aoi) if aoi else "", "shards_total": q["shards"], "shards_done": 0,
        "shards_failed": 0, "counts": "{}", "gpu_s": 0, "result_set": rs, "created_at": now, "submitted_by": user or "",
        "centroid": json.dumps(J._centroid(aoi, img)), "queued_at_ms": int(time.time() * 1000), "adapter": q.get("_adapter") or "",
        "deploy_id": ""})
    if q.get("_plan"):
        await r.set(f"jobplan:{job_id}", json.dumps(q["_plan"], ensure_ascii=False, separators=(",", ":")), ex=3600)
    await r.xadd(f"jobs:{q['pool']}", {"job_id": job_id, "priority": prio}, maxlen=10000, approximate=True)
    async with db(realm="lx") as conn:
        pos = await conn.fetchval("SELECT count(*) FROM jobs WHERE pool=$1 AND state IN ('queued','running') AND id<>$2 AND priority<=$3",
                                  q["pool"], job_id, prio)
    await J.publish(job_id, "job.queued", {"job_id": job_id, "position": int(pos), "pool": q["pool"], "at": now})
    await J.ops_event("job.state", {"job_id": job_id, "tenant_id": tenant, "state": "queued", "aoi_centroid": J._centroid(aoi, img),
                                    "pool": q["pool"], "at": now})
    return {"id": job_id, "result_set": rs}


async def _register_upload_imagery(r) -> str:
    """올린 영상 → 분석 동안만 쓰는 의뢰 영상 한 줄(layer.role 'request' — 영상 목록 · 다른 분석의 영상 고르기에 나오지 않는다)."""
    m = dict(r["meta"] or {})
    iid = f"rqimg-{r['id'][3:]}"
    year = int(str(m.get("date") or "0")[:4] or 0) or None
    async with db(realm="lx") as conn:
        await conn.execute(
            "INSERT INTO imagery(id, name, tier, gsd_m, epoch, crs, footprint, path_internal, license, attribution, export_policy, security_review, "
            "rights_holder, ladder, kind, layer, sgg_cd, year, registered_by, registered_at) VALUES ($1,$2,'raw',$3,$4,$5,"
            "ST_SetSRID(ST_GeomFromGeoJSON($6),4326),$7,'기관 제공(분석 의뢰 전용)',$8,'never','pending',$8,$9,'ortho',$10,$11,$12,$13,now()) "
            "ON CONFLICT (id) DO NOTHING",
            iid, {"ko": f"{m.get('org')} 의뢰 영상", "en": "request imagery"}, m.get("gsd_m"), m.get("date"), f"EPSG:{m.get('epsg')}",
            json.dumps(m["footprint"]), m["src"], m.get("org") or "기관", {"stage": "request", "from": 12, "to": 22, "order": 999},
            {"role": "request", "request_id": r["id"], "tenant": r["tenant_id"], "source_kind": m.get("kind")}, m.get("sgg_cd"), year, r["requested_by"])
        await conn.execute("UPDATE analysis_requests SET imagery_id=$2 WHERE id=$1", r["id"], iid)
    return iid


async def start_analysis(rid: str, user: str) -> None:
    """승인된 의뢰 → 영상 · 모델(배포 흐름과 같은 모델 고르기) → 관할 확인 → 기관 한도 확인 → 기존 분석 작업 대기열."""
    from . import jobs as J
    from .deploys import choose_model
    try:
        async with db(realm="lx") as conn:
            # 한 번만 — 같은 의뢰를 두 곳에서 동시에 시작하지 않게(5분 안 재시도 0)
            claim = await conn.fetchval("UPDATE analysis_requests SET meta = coalesce(meta,'{}'::jsonb) || jsonb_build_object('starting_at', "
                                        "extract(epoch FROM now())) WHERE id=$1 AND state='approved' AND job_id IS NULL AND "
                                        "coalesce((meta->>'starting_at')::float, 0) < extract(epoch FROM now()) - 300 RETURNING id", rid)
            r = await conn.fetchrow(f"SELECT {REQ_COLS} FROM analysis_requests q JOIN deploys d ON d.id=q.deploy_id LEFT JOIN cards c ON c.id=d.card_id "
                                    "WHERE q.id=$1", rid) if claim else None
        if not r or r["state"] != "approved":
            return
        m = dict(r["meta"] or {})
        iid = r["imagery_id"] if r["source"] == "shared" else await _register_upload_imagery(r)
        async with db(realm="lx") as conn:
            pk = await choose_model(conn, r["model_override"], r["card_id"], r["card_version_id"], m.get("gsd_m"))
            img = await conn.fetchrow("SELECT id, gsd_m FROM imagery WHERE id=$1", iid)
            model = await conn.fetchrow("SELECT * FROM models WHERE id=$1", pk.get("model_id")) if pk.get("model_id") else None
        if not model or not img:
            await _fail(rid, "model_mismatch" if not model else "no_imagery", FAIL_LINE["model_input_mismatch"] if not model else FAIL_LINE["no_imagery"])
            return
        tp = Principal(realm="tenant", role="manager", tenant_id=r["tenant_id"], user_id=r["requested_by"])
        lx = Principal(realm="lx", role="admin", user_id=user, name="request")
        aoi = r["aoi_g"]
        area = float(m.get("area_km2") or 0)
        opts = {"chip": CHIP, "conf": CONF, "overlap": OVERLAP, "request_id": rid}
        if area > J.INFER_MAX_KM2 and m.get("sgg_cd"):          # 시군구를 덮는 공유 영상 = 시군구 전역 분석(배포 흐름과 같은 길)
            body = {"kind": "infer", "model_id": model["id"], "imagery_id": iid, "options": {**opts, "scope": "sgg", "sgg_cd": m["sgg_cd"]}}
            guard = {"options": {"sgg_cd": m["sgg_cd"]}}
        else:
            body = {"kind": "infer", "model_id": model["id"], "imagery_id": iid, "aoi": aoi,
                    "options": {**opts, "upsample": J.fit_upsample(model, img), "max_km2": J.INFER_MAX_KM2}}
            guard = {"aoi": aoi}
        body["label"] = f"분석 의뢰 · {m.get('org') or ''} · {m.get('service') or ''}".strip(" ·")
        await J.scope_guard(tp, guard)                          # 관할 밖 0(원칙 39) — 기관 계정 기준으로 한 번 더
        q = await J.build_quote(lx, body)
        q["_tenant"] = r["tenant_id"]
        # 기관 한도로는 막지 않는다(사용자 7차 답) — 관리자가 승인한 분석은 대기열 순번대로. 막는 것은 작업 크기 · 전력(두 장 동시 고부하) 같은 기계 조건만
        reasons = [x for x in (q.get("reasons") or []) if x != "quota_exceeded"]
        if reasons:
            await _fail(rid, reasons[0], FAIL_LINE.get(reasons[0]), ",".join(reasons))
            return
        job = await _enqueue(q, body, r["tenant_id"], r["requested_by"])
        async with db(realm="lx") as conn:
            await conn.execute("UPDATE analysis_requests SET state='analyzing', job_id=$2, result_set=$3, updated_at=now() WHERE id=$1 AND state='approved'",
                               rid, job["id"], job["result_set"])
            await conn.execute("INSERT INTO audit_log(actor, realm, action, subject, before, after) VALUES ($1,'lx','request.analyze',$2,NULL,$3)",
                               user, rid, {"job_id": job["id"], "imagery_id": iid, "model_id": model["id"], "tenant_id": r["tenant_id"]})
        await J.tenant_event(r["tenant_id"], "request.changed", {"request_id": rid, "state": "analyzing"})
    except ApiError as e:
        await _fail(rid, e.code, FAIL_LINE.get(e.code) or (e.message if e.code == "quota_exceeded" else None), e.message)
    except Exception as e:  # noqa: BLE001 — 흐름 오류는 '분석하지 못함' + 기록
        await _fail(rid, "error", None, repr(e))
