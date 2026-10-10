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
끝내지 못한 올리기 · 의뢰하지 않은 파일은 정한 날 수 뒤 정리.
영상 표준(원칙 94 · 확인 대장 15차 영상-1~3): 다 받고 읽은 영상은 표준 한 가지(COG · JPEG 90 · 축소판 · 마스크)로 바꾸고 분석은 표준본으로 한다
(ECW 처럼 서버 파이썬이 못 여는 형식도 그 형식을 읽는 GDAL 로 — imagery_std). 원본은 표준본 확인 뒤 90일에 정해진 작업이 지운다(감사 기록).
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
import os
import re
import secrets
import shutil
import time
from dataclasses import dataclass
from pathlib import Path

from fastapi import APIRouter, Request
from shapely.geometry import mapping, shape
from starlette.concurrency import run_in_threadpool

from . import config
from .deps import ApiError, Principal, audit, db, principal, require
from .envelope import KST, env, now_iso

router = APIRouter()

STATE_WORD = {"pending": "확인 대기", "approved": "분석 준비", "analyzing": "분석 중", "done": "결과 도착", "rejected": "거절",
              "failed": "분석하지 못함", "held": "보류"}
ON_STAGES = ("shadow", "canary", "ga")          # 그 기관에 켜진 서비스(초안 · 되돌림 · 시험 제외)
KIND_WORD = {"drone": "드론", "aerial": "항공", "satellite": "위성"}
CRS_WORD = {5186: "GRS80 중부원점", 5185: "GRS80 서부원점", 5187: "GRS80 동부원점", 5188: "GRS80 동해원점", 5179: "UTM-K(GRS80)",
            5174: "보정 베셀 중부원점", 32652: "UTM 52N(WGS84)", 32651: "UTM 51N(WGS84)", 4326: "경위도(WGS84)", 4737: "경위도(GRS80)",
            3857: "웹 메르카토르"}
QUICK = 1 << 20                                   # 빠른 지문 = sha256(크기 + ':' + 앞 1MB + 뒤 1MB) — 화면과 같은 식
CHIP, OVERLAP, CONF = 1024, 0.125, 0.25           # 분석 작업 칸(배포 흐름과 같은 값)


# ── 설정 한 곳(config/requests.yaml) ─────────────────────────────────────────
def settings() -> dict:
    from . import imagery_std as STD
    s = dict(config.load_yaml("requests") or {})
    s.setdefault("storage_root", "tenants/{tenant}/requests")
    s.setdefault("max_file_gb", 20)
    s.setdefault("chunk_mb", {"start": 1, "max": 8})
    s.setdefault("disk_reserve_gb", 200)
    s.setdefault("partial_ttl_days", 7)
    # 받는 형식 · 원본 보관은 영상 표준 설정 한 곳(config/imagery.yaml — LX 영상 등록과 같은 값 · 원칙 94)
    s["raster_ext"] = STD.accept_raster()
    s["sidecar_ext"] = STD.accept_sidecar()
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
        raise ApiError("forbidden", "기관 계정만 분석을 요청할 수 있습니다")
    return p


@dataclass
class Who:
    """올리는 사람 — 기관 분석 의뢰(기관 사용자)와 LX 영상 등록(데이터 올리기 · LX 직원 · 관리자)이 같은 조각 올리기를 쓴다
    (확인 대장 1차 FR-1 '기존 자산 기준으로' · 원칙 43 같은 일은 같은 모양). owner = request_uploads.tenant_id(기관 id | 'lx') ·
    root = 02. 데이터 기준 올린 영상 폴더(그 아래 drafts/{묶음})."""
    p: Principal
    owner: str
    root: str
    lx: bool = False


LX_OWNER = "lx"
LX_ROOT = "cog/uploads"        # LX 가 올린 영상 칸 — config/imagery.yaml original.owned_roots 의 한 곳(표준본 확인 뒤 90일에 원본 정리)


def _twho(request: Request) -> Who:
    p = _tuser(request)
    return Who(p, p.tenant_id, root_rel(p.tenant_id))


def lx_who(request: Request) -> Who:
    """LX 영상 등록(데이터 올리기 → 영상 등록) — LX 직원 · 관리자만."""
    p = require(principal(request), lx=True)
    if p.role not in ("staff", "admin"):
        raise ApiError("forbidden", "LX 직원·관리자만 영상을 올릴 수 있습니다")
    return Who(p, LX_OWNER, LX_ROOT, True)


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
    from .deploys import card_finds, choose_model, model_block
    if not gsd:
        return {"fits": None}
    pk = await choose_model(conn, d["model_override"], d["card_id"], d["card_version_id"], gsd)
    mb = await model_block(conn, pk["model_id"], finds=await card_finds(conn, d["card_version_id"], d["card_id"])) if pk.get("model_id") else None
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
                          "card": d["card_id"], "sgg_cd": d["sgg_cd"],              # 서비스 대시보드(카드 · 시군구) → 이 의뢰 화면(?service=배포본)
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


def _drop_std(upload_ids: list[str]) -> None:
    """올린 파일을 지울 때 그 표준본도 지우고 기록을 'removed' 로(동기 · 스레드에서). 의뢰에 쓰인 원본 정리는 영상 표준 작업(90일)이 한다."""
    from . import imagery_std as STD
    for uid in upload_ids:
        try:
            rec = STD.get(source=("upload", uid))
        except Exception:  # noqa: BLE001
            rec = None
        if not rec:
            continue
        if rec.get("std_path") and rec["std_path"] != rec["orig_path"]:
            _rm(STD.absolute(rec["std_path"]))
        STD.update(rec["id"], state="removed")


async def _sweep(tenant: str, force: bool = False):
    """끝내지 못한 올리기 · 의뢰하지 않은 파일(partial_ttl_days 뒤) 정리(그 표준본까지).
    분석에 쓰인 원본은 영상 표준 작업이 표준본 확인 날 + 90일에 지운다(config/imagery.yaml original.keep_days — 확인 대장 15차 영상-3 ⓑ)."""
    if not force and time.time() - _last_sweep.get(tenant, 0) < 600:
        return
    _last_sweep[tenant] = time.time()
    s = settings()
    ttl = float(s["partial_ttl_days"]) * 86400
    n = 0
    gone: list[str] = []
    async with db(realm="lx") as conn:
        rows = await conn.fetch("SELECT * FROM request_uploads WHERE tenant_id=$1 AND request_id IS NULL AND state IN ('uploading','done') "
                                "AND updated_at < now() - make_interval(secs => $2)", tenant, ttl)
        for r in rows:
            if not _rm(_path(r), _part(r)):
                continue                                   # 열려 있는 파일 — 다음 정리 때
            await conn.execute("UPDATE request_uploads SET state='removed', updated_at=now() WHERE id=$1", r["id"])
            gone.append(r["id"])
            n += 1
    if gone:
        await run_in_threadpool(_drop_std, gone)
    if n:
        async with db(realm="lx") as conn:
            await conn.execute("INSERT INTO audit_log(actor, realm, action, subject, before, after) VALUES ('system','system',"
                               "'request.upload.sweep',$1,NULL,$2)", tenant, {"removed": n})
        from .quota import invalidate_storage
        invalidate_storage(tenant)


async def _upload_row(conn, uid: str, w: Who, lock_state: str | None = "uploading"):
    if not re.fullmatch(r"ru_[0-9a-f]{12}", uid or ""):
        raise ApiError("not_found", "올리기 기록이 없습니다")
    r = await conn.fetchrow("SELECT * FROM request_uploads WHERE id=$1", uid)
    if not r or r["tenant_id"] != w.owner:
        raise ApiError("not_found", "올리기 기록이 없습니다 — 처음부터 다시 올려 주세요")
    if r["user_id"] != w.p.user_id:
        raise ApiError("forbidden", "다른 사람이 시작한 올리기입니다")
    if lock_state and r["state"] != lock_state:
        raise ApiError("conflict", "이미 끝났거나 취소한 올리기입니다", {"state": r["state"]}, 409)
    return r


def _dup_line(row, same_draft: bool, lx: bool = False) -> str:
    day = _ymd(row["done_at"] or row["created_at"])
    if lx:                                                 # LX 영상 등록 — 묶음 = 한 번 등록(의뢰 아님)
        if same_draft:
            return "이미 함께 올린 파일입니다"
        return f"이미 등록한 영상입니다 — {day}에 올린 파일과 같습니다" if day else "이미 등록한 영상입니다"
    if same_draft:
        return "이미 이 요청에 올린 파일입니다"
    return f"이미 올린 영상입니다 — {day} 분석 요청에 쓰인 파일과 같습니다" if day else "이미 올린 영상입니다"


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
    return await start_upload(_twho(request), body)


async def start_upload(w: Who, body: dict) -> dict:
    """올리기 시작 — 형식 · 크기 · 서버 저장 여유 · 같은 파일을 먼저 검사한다(다 올린 뒤에 거절하지 않게). 같은 파일이면 받은 자리부터 이어 간다.
    기관 저장 한도로는 막지 않는다(사용 현황으로 기록만 — 사용자 7차 답). LX 영상 등록도 같은 길(w.lx — 폴더 cog/uploads)."""
    from . import quota as Q
    from . import imagery_std as STD
    p = w.p
    s = settings()
    name = _safe_name(body.get("filename"))
    ext = _ext(name)
    if ext not in s["raster_ext"] and ext not in s["sidecar_ext"]:
        raise ApiError("bad_ext", "영상 파일만 올릴 수 있습니다 — 다른 파일은 받지 않습니다",
                       {"allowed": list(s["raster_ext"]) + list(s["sidecar_ext"])}, 400)
    if ext in s["raster_ext"]:                             # 이 서버가 지금 바꿀 수 없는 형식(예: ECW 변환기가 없음) — 한 바이트도 받기 전에
        un = await run_in_threadpool(STD.unavailable, w.lx)
        if ext in un:
            raise ApiError("format_unavailable", un[ext], {"ext": ext}, 400)
    try:
        size = int(body.get("size") or 0)
    except (TypeError, ValueError):
        size = 0
    if size <= 0:
        raise ApiError("bad_request", "빈 파일입니다")
    if size > _max_file():
        more = "" if w.lx else " — 더 큰 영상은 LX 담당자와 협의해 주세요"
        raise ApiError("too_large", f"한 파일은 {_gb(_max_file() / 1e9)}까지 올릴 수 있습니다{more}",
                       {"size": size, "limit": _max_file()}, 413)
    quick = str(body.get("quick_fp") or "").strip().lower()[:64] or None
    if quick and not re.fullmatch(r"[0-9a-f]{64}", quick):
        quick = None
    did = str(body.get("draft_id") or "")
    if not re.fullmatch(r"dr_[0-9a-f]{12}", did):
        did = "dr_" + secrets.token_hex(6)
    await _sweep(w.owner)
    async with db(realm="lx") as conn:
        own = await conn.fetch("SELECT DISTINCT tenant_id, user_id, request_id IS NOT NULL AS used FROM request_uploads WHERE draft_id=$1", did)
        if any(o["tenant_id"] != w.owner or o["user_id"] != p.user_id for o in own):
            raise ApiError("forbidden", "다른 사람의 묶음입니다")
        if any(o["used"] for o in own):
            raise ApiError("conflict", "이미 등록한 묶음입니다 — 새로 올려 주세요" if w.lx else "이미 요청한 묶음입니다 — 새 요청으로 올려 주세요", None, 409)
        # 이어 올리기 — 같은 사람 · 같은 묶음(또는 같은 빠른 지문) · 같은 이름 · 같은 크기
        r = await conn.fetchrow("SELECT * FROM request_uploads WHERE tenant_id=$1 AND user_id=$2 AND state='uploading' AND filename=$3 AND size=$4 "
                                "AND (draft_id=$5 OR ($6::text IS NOT NULL AND quick_fp=$6)) ORDER BY created_at DESC LIMIT 1",
                                w.owner, p.user_id, name, size, did, quick)
        if r and _part(r).exists():
            return _up_view(r)
        dup = await _find_dup(conn, w.owner, did, size, quick, None)
        if dup:
            raise ApiError("duplicate", _dup_line(dup, dup["draft_id"] == did, w.lx), {"filename": dup["filename"]}, 409)
        reserved = await conn.fetchval("SELECT coalesce(sum(size),0) FROM request_uploads WHERE state='uploading'")
    # 서버 전체 저장 여유(하드웨어 · 원칙 66) — 모든 기관이 받는 중인 파일의 크기까지 더해서 본다(기관 한도로는 막지 않는다)
    room = await Q.storage_room(w.owner, size + max(0, int(reserved or 0)))
    if room:
        raise ApiError(room["code"], room["line"], room.get("detail"), 413)
    uid = "ru_" + secrets.token_hex(6)
    folder = config.DATA_ROOT / w.root / "drafts" / did
    folder.mkdir(parents=True, exist_ok=True)
    fn, i = name, 1
    async with db(realm="lx") as conn:
        taken = {x["filename"] for x in await conn.fetch("SELECT filename FROM request_uploads WHERE draft_id=$1 AND state IN ('uploading','done')", did)}
        while fn in taken or (folder / fn).exists():
            i += 1
            stem, dot, tail = name.partition(".")
            fn = f"{stem}_{i}{dot}{tail}"
        rel = f"{w.root}/drafts/{did}/{fn}"
        (config.DATA_ROOT / (rel + ".part")).write_bytes(b"")
        r = await conn.fetchrow("INSERT INTO request_uploads(id, tenant_id, user_id, draft_id, filename, size, quick_fp, state, rel_path) "
                                "VALUES ($1,$2,$3,$4,$5,$6,$7,'uploading',$8) RETURNING *", uid, w.owner, p.user_id, did, fn, size, quick, rel)
        await audit(conn, p, _act(w, "upload.start"), uid, None, {"draft_id": did, "size": size, "ext": ext})
    _sha[uid] = (0, hashlib.sha256())
    return _up_view(r, 0)


def _act(w: Who, what: str) -> str:
    """감사 기록 이름 — 기관 의뢰 'request.…' · LX 영상 등록 'imagery.…'"""
    return ("imagery." if w.lx else "request.") + what


@router.get("/requests/uploads/formats")
async def up_formats(request: Request):
    """받는 형식 · 지금 받을 수 없는 형식(한 줄) — 올리는 칸(kit/dropzone.js)이 파일을 고르는 순간 알리는 데 쓴다. 값은 config/imagery.yaml 한 곳."""
    from . import imagery_std as STD
    p = require(principal(request))
    s = settings()
    un = await run_in_threadpool(STD.unavailable, bool(p.is_lx))
    return {"raster": s["raster_ext"], "sidecar": s["sidecar_ext"], "unavailable": un, "limit": {"size": _max_file()}, "as_of": now_iso()}


@router.get("/requests/uploads/{uid}")
async def up_state(uid: str, request: Request):
    return await upload_state(_twho(request), uid)


async def upload_state(w: Who, uid: str) -> dict:
    async with db(realm="lx") as conn:
        r = await _upload_row(conn, uid, w, None)
    return _up_view(r)


@router.put("/requests/uploads/{uid}")
async def up_chunk(uid: str, request: Request, offset: int = 0):
    return await put_chunk(_twho(request), uid, request, offset)


async def put_chunk(w: Who, uid: str, request: Request, offset: int = 0) -> dict:
    """한 조각 — offset 이 지금까지 받은 크기와 같을 때만 붙인다(끊겼다 다시 보내도 두 번 붙지 않는다)."""
    lock = _locks.setdefault(uid, asyncio.Lock())
    async with lock:
        async with db(realm="lx") as conn:
            r = await _upload_row(conn, uid, w)
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
    return await cancel_upload(_twho(request), uid)


async def cancel_upload(w: Who, uid: str) -> dict:
    """취소 — 받은 조각(또는 다 받은 파일)을 지운다. 의뢰(LX: 등록)에 쓰인 파일은 지우지 않는다."""
    async with db(realm="lx") as conn:
        r = await _upload_row(conn, uid, w, None)
        if r["request_id"]:
            raise ApiError("conflict", "등록한 영상의 파일은 지울 수 없습니다" if w.lx else "분석 요청에 쓰인 파일은 지울 수 없습니다", None, 409)
        if r["state"] in ("uploading", "done"):
            _rm(_part(r), _path(r))
            await conn.execute("UPDATE request_uploads SET state='cancelled', updated_at=now() WHERE id=$1", uid)
            await audit(conn, w.p, _act(w, "upload.cancel"), uid, None, {"draft_id": r["draft_id"]})
    await run_in_threadpool(_drop_std, [uid])
    _sha.pop(uid, None)
    from .quota import invalidate_storage
    invalidate_storage(w.owner)
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
    return await finish_upload(_twho(request), uid)


async def finish_upload(w: Who, uid: str) -> dict:
    """다 받았으면 → 전체 지문으로 같은 파일 확인(같으면 새로 받은 것은 지우고 409) → 끝."""
    lock = _locks.setdefault(uid, asyncio.Lock())
    async with lock:
        async with db(realm="lx") as conn:
            r = await _upload_row(conn, uid, w)
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
            dup = await _find_dup(conn, w.owner, r["draft_id"], have, None, sha, uid)
            if dup:
                _rm(dest)
                await conn.execute("UPDATE request_uploads SET state='removed', sha256=$2, quick_fp=$3, updated_at=now() WHERE id=$1", uid, sha, quick)
                await audit(conn, w.p, _act(w, "upload.duplicate"), uid, None, {"same_as": dup["id"]})
                line = _dup_line(dup, dup["draft_id"] == r["draft_id"], w.lx)
            else:
                r = await conn.fetchrow("UPDATE request_uploads SET state='done', sha256=$2, quick_fp=$3, done_at=now(), updated_at=now() "
                                        "WHERE id=$1 RETURNING *", uid, sha, quick)
                await audit(conn, w.p, _act(w, "upload.done"), uid, None, {"draft_id": r["draft_id"], "size": have})
                line = None
    _locks.pop(uid, None)
    from .quota import invalidate_storage
    invalidate_storage(w.owner)
    if line:
        raise ApiError("duplicate", line, None, 409)
    return _up_view(r, have)


@router.delete("/requests/drafts/{did}")
async def draft_delete(did: str, request: Request):
    return await delete_draft(_twho(request), did)


async def delete_draft(w: Who, did: str) -> dict:
    """의뢰(LX: 등록)하기 전 묶음을 통째로 지운다(관할 밖 영상 · 잘못 고른 파일)."""
    if not re.fullmatch(r"dr_[0-9a-f]{12}", did or ""):
        raise ApiError("not_found", "묶음이 없습니다")
    async with db(realm="lx") as conn:
        rows = await conn.fetch("SELECT * FROM request_uploads WHERE draft_id=$1 AND tenant_id=$2 AND user_id=$3", did, w.owner, w.p.user_id)
        if any(r["request_id"] for r in rows):
            raise ApiError("conflict", "이미 등록한 묶음입니다" if w.lx else "이미 요청한 묶음입니다", None, 409)
        for r in rows:
            _rm(_part(r), _path(r))
        await conn.execute("UPDATE request_uploads SET state='cancelled', updated_at=now() WHERE draft_id=$1 AND state IN ('uploading','done')", did)
        await audit(conn, w.p, _act(w, "draft.delete"), did, None, {"files": len(rows)})
    await run_in_threadpool(_drop_std, [r["id"] for r in rows])
    folder = config.DATA_ROOT / w.root / "drafts" / did
    shutil.rmtree(folder, ignore_errors=True)
    from .quota import invalidate_storage
    invalidate_storage(w.owner)
    return {"draft_id": did, "state": "cancelled", "as_of": now_iso()}


# ═══ 파일에서 읽기(원칙 49 — 해상도 · 촬영일 · 범위 · 좌표계는 파일에서) ═══════════════════════
class ReadFail(Exception):
    def __init__(self, code: str, line: str):
        super().__init__(line)
        self.code, self.line = code, line


def _meta(path: Path) -> dict:
    """파일에서 읽은 값 — 서버 파이썬이 여는 형식은 그대로, 못 여는 형식(ECW 등)은 그 형식을 읽는 GDAL 명령으로(영상 표준 · imagery_std.inspect).
    정말 못 읽는 파일이면 쉬운 말 한 줄과 다음 할 일만(원칙 100)."""
    from affine import Affine
    from rasterio.coords import BoundingBox
    from . import imagery_std as STD
    try:
        i = STD.inspect(path)
    except STD.Unreadable as u:
        if u.code == "format_unavailable":
            raise ReadFail("format_unavailable", "지금은 이 파일을 읽을 수 없습니다 — TIF 로 저장해 올려 주세요") from None
        raise ReadFail("unreadable", "영상으로 읽을 수 없는 파일이 있습니다 — 지우고 다른 파일로 다시 올려 주세요") from None
    t = Affine.from_gdal(*i["transform"])
    w, h = i["w"], i["h"]
    xs, ys = zip(*(t * c for c in ((0, 0), (w, 0), (0, h), (w, h))))
    return {"name": path.name, "path": path, "w": w, "h": h, "count": i["count"], "dtype": i["dtypes"][0] if i["dtypes"] else "uint8",
            "transform": t, "bounds": BoundingBox(min(xs), min(ys), max(xs), max(ys)), "epsg": i["epsg"], "crs_known": bool(i["crs_wkt"]),
            "georef": not t.is_identity, "tags": i["tags"], "ovr": bool(i["overviews"]), "info": i}


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


def _guess_crs(p: Principal, m: dict, near: dict | None = None) -> int | None:
    """좌표계 기록이 없는 파일(JPG + 좌표 파일 · TFW 만 딸린 도엽 등) — 후보 좌표계로 옮겨 보아 관할 안에 떨어지는 것(없으면 국내에 떨어지는 첫 후보).
    near = 지금 보고 있는 지역(LX 영상 등록 — 그 지역 서랍에서 올렸다면 그 범위에 떨어지는 후보가 먼저 · 영상 등록 작업의 판정과 같은 규칙).
    전국 계정(LX)은 '관할 안' 대신 국내 시군구 땅에 떨어지는가로 본다(바다 · 나라 밖에 떨어지는 후보는 거른다)."""
    from rasterio.warp import transform as wt
    from . import regions as R
    b = m["bounds"]
    cx, cy = (b.left + b.right) / 2, (b.bottom + b.top) / 2
    nb = (near or {}).get("bbox")
    nation = R.scope_of(p) is None
    first, cands = None, []
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
        if nb and nb[0] - 0.02 <= lng <= nb[2] + 0.02 and nb[1] - 0.02 <= lat <= nb[3] + 0.02:
            return int(c)
        cands.append((int(c), lng, lat))
    for c, lng, lat in cands:
        try:
            if (R.sgg_at(lng, lat) is not None) if nation else R.point_in_scope(p, lng, lat):
                return c
        except Exception:
            pass
        if first is None and 124 <= lng <= 132 and 33 <= lat <= 39:
            first = c
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
            raise ReadFail("rotated", "기울어진 영상이 섞여 있어 한 번에 읽지 못했습니다 — 파일을 하나씩 넣어 주세요")
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


def _corners_m(m: dict, epsg: int) -> list:
    """미리 보기 네 모서리 — 파일에서 읽은 값(변환 · 좌표계)으로(서버 파이썬이 못 여는 형식도)."""
    from rasterio.warp import transform as wt
    t, w, h = m["transform"], m["w"], m["h"]
    pts = [t * (0, 0), t * (w, 0), t * (w, h), t * (0, h)]
    xs, ys = wt(f"EPSG:{epsg}", "EPSG:4326", [x for x, _ in pts], [y for _, y in pts])
    return [[round(x, 7), round(y, 7)] for x, y in zip(xs, ys)]


def _preview_info(info: dict) -> str | None:
    """서버 파이썬이 못 여는 형식(ECW 등)의 미리 보기 — 그 형식을 읽는 GDAL 로 작게 읽어서(웨이블릿 영상은 작게 읽기가 빠르다)."""
    import numpy as np
    from . import imagery_std as STD
    arr, mask = STD.small(info, 640)
    return _encode_preview(arr.astype("float32"), mask, info["dtypes"][0] if info["dtypes"] else "uint8")


def _encode_preview(arr, mask, dtype: str) -> str | None:
    """3×h×w + 마스크 → webp 데이터 주소. 가장자리와 이어진 흰색 · 검은색 테두리(드론 영상의 빈 칸)는 투명하게."""
    import numpy as np
    try:
        import cv2
    except Exception:
        return None
    from . import imagery_std as STD
    if dtype != "uint8":
        for i in range(3):
            v = arr[i][mask > 0] if (mask > 0).any() else arr[i]
            lo, hi = (np.percentile(v, 2), np.percentile(v, 98)) if v.size else (0, 1)
            arr[i] = np.clip((arr[i] - lo) / max(hi - lo, 1e-6) * 255, 0, 255)
    else:
        try:
            c = STD.collar_of(arr.astype("uint8"), mask)
            if c is not None:
                mask = np.minimum(mask, c[0])
        except Exception:  # noqa: BLE001
            pass
    rgba = np.dstack([arr[2], arr[1], arr[0], mask.astype("float32")]).astype("uint8")
    ok, buf = cv2.imencode(".webp", rgba, [cv2.IMWRITE_WEBP_QUALITY, 80])
    return "data:image/webp;base64," + base64.b64encode(buf.tobytes()).decode() if ok else None


def _preview(src: Path) -> str | None:
    """작은 미리 보기(가로 · 세로 640 이하 · 투명 테두리) — 큰 영상에 겹 해상도(오버뷰)가 없으면 만들지 않는다(읽기가 느려짐)."""
    import warnings
    import numpy as np
    import rasterio
    from rasterio.enums import Resampling
    try:
        import cv2  # noqa: F401
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
    return _encode_preview(arr, mask, ds.dtypes[0])


def read_files(p: Principal, org: str, folder: Path, names: list[str]) -> dict:
    """묶음 안 파일 → 읽은 값. 동기(스레드에서). 실패는 {ok: False, code, why(사용자 말)}."""
    from shapely.ops import unary_union
    from .deploys import gsd_word
    from .jobs import aoi_area
    s = settings()
    rasters = [n for n in names if _ext(n) in s["raster_ext"]]
    if not rasters:
        return {"ok": False, "code": "no_raster", "why": "영상 파일이 없습니다 — 영상 파일을 함께 올려 주세요"}
    try:
        metas = [_meta(folder / n) for n in rasters]
        if not all(m["georef"] for m in metas):
            return {"ok": False, "code": "no_georef", "why": "위치 정보가 없는 영상입니다 — 영상과 함께 받은 위치 파일도 같이 올려 주세요"}
        guessed = False
        for m in metas:
            if m["epsg"] is None:
                g = _guess_crs(p, m)
                if g is None:
                    return {"ok": False, "code": "no_crs", "why": "위치 기준을 알아볼 수 없는 영상입니다 — 영상과 함께 받은 파일을 모두 같이 올려 주세요"}
                m["epsg"], guessed = g, guessed or not m["crs_known"]
        if len({m["epsg"] for m in metas}) > 1:
            return {"ok": False, "code": "mixed_crs", "why": "위치 기준이 서로 다른 파일이 섞여 있습니다 — 파일을 나눠 따로 요청해 주세요"}
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
        if any(m["info"].get("reader") == "cli" for m in metas):     # 서버 파이썬이 못 여는 형식(ECW 등) — 첫 파일을 그 형식을 읽는 GDAL 로
            ov = {"coordinates": _corners_m(metas[0], epsg), "url": _preview_info(metas[0]["info"])}
        else:
            ov = {"coordinates": _corners(src), "url": _preview(src)}
    except Exception:
        ov = None
    if inside is None:
        return {**base, "ok": False, "code": "out_of_scope", "why": f"관할 밖 영상입니다 — {org} 관할 안의 영상만 분석을 요청할 수 있습니다",
                "overlay": ov}
    place, sgg = _place(p, inside)
    area, _ = aoi_area(mapping(inside if inside.geom_type == "Polygon" else max(getattr(inside, "geoms", [inside]), key=lambda x: x.area)))
    return {**base, "ok": True, "place": place, "sgg_cd": sgg, "scope": "partial" if out_pct else "in",
            "out_pct": env(out_pct, "%", "measured", "영상 범위 − 관할(읍면동 경계 · 연안 바다)") if out_pct else None,
            "area_km2": env(round(area, 3), "km2", "measured", "분석 범위(영상 범위 ∩ 관할 · EPSG:5186)"),
            "aoi": mapping(inside), "overlay": ov, "_src": str(src), "_epsg": epsg,
            "_files": {m["name"]: {"epsg": m["epsg"] if not m["crs_known"] or not m["info"].get("epsg") else None} for m in metas}}


def read_each(p: Principal, folder: Path, names: list[str], near: dict | None = None) -> dict:
    """LX 영상 등록(데이터 올리기) — 묶음 안 영상 파일을 하나씩 읽는다(파일 하나 = 영상 하나 · 곁 파일은 같은 이름의 영상 파일에 붙어 함께 읽힌다).
    시군구 · 촬영일 · 해상도 · 종류는 파일에서(원칙 41 지역을 먼저 고르지 않는다 · 원칙 49 입력 칸 없음). 촬영일이 파일에 없으면 없다고 둔다(지어내지 않는다).
    동기(스레드에서). → {ok, items:[{name, sgg_cd, place, date, date_src, gsd_m, kind, epsg, crs_guessed, footprint}]} |
      {ok: False, code, why(사용자 말), files:[못 읽은 파일 이름]}"""
    from . import regions as R
    s = settings()
    rasters = [n for n in names if _ext(n) in s["raster_ext"]]
    if not rasters:
        return {"ok": False, "code": "no_raster", "why": "영상 파일이 없습니다 — 영상 파일을 함께 올려 주세요", "files": names}
    nb = (near or {}).get("bbox")
    items, bad = [], []
    for n in rasters:
        try:
            m = _meta(folder / n)
        except ReadFail as e:
            bad.append((n, e.code, "영상으로 읽을 수 없는 파일입니다" if e.code == "unreadable" else e.line))
            continue
        if not m["georef"]:
            bad.append((n, "no_georef", "어디를 찍은 영상인지 알 수 없습니다 — 영상과 함께 받은 위치 파일(TFW 등)도 같이 올려 주세요"))
            continue
        guessed = False
        if m["epsg"] is None:
            g = _guess_crs(p, m, near)
            if g is None:
                bad.append((n, "no_crs", "어디를 찍은 영상인지 알 수 없습니다 — 영상과 함께 받은 파일을 모두 같이 올려 주세요"))
                continue
            m["epsg"], guessed = g, True
        try:
            fp = _footprint(m, m["epsg"])
        except Exception:
            bad.append((n, "no_crs", "어디를 찍은 영상인지 알 수 없습니다 — 영상과 함께 받은 파일을 모두 같이 올려 주세요"))
            continue
        place, sgg = _place(p, fp)
        if not sgg and nb and fp.intersects(shape({"type": "Polygon", "coordinates": [[[nb[0], nb[1]], [nb[2], nb[1]], [nb[2], nb[3]], [nb[0], nb[3]], [nb[0], nb[1]]]]})):
            sgg, place = near.get("sgg_cd"), near.get("name") or place   # 바다에 걸친 도엽 등 — 대표점이 땅이 아니면 보고 있던 지역(범위가 겹칠 때만)
        if not sgg:
            bad.append((n, "no_region", "국내 시군구 안의 영상인지 알 수 없습니다 — 위치 파일을 함께 올렸는지 확인해 주세요"))
            continue
        gsd = _gsd_m(m, m["epsg"])
        date, date_src = _date_of(m)
        items.append({"name": n, "sgg_cd": sgg, "place": place, "date": date, "date_src": date_src, "gsd_m": round(gsd, 4), "kind": _kind(gsd),
                      "epsg": m["epsg"], "crs_guessed": guessed, "footprint": mapping(fp)})
    if bad:
        whys = {w for _, _, w in bad}
        return {"ok": False, "code": bad[0][1] if len(whys) == 1 else "mixed", "why": bad[0][2] if len(whys) == 1 else "등록할 수 없는 파일이 섞여 있습니다",
                "files": [n for n, _, _ in bad], "reasons": {n: w for n, _, w in bad}}
    return {"ok": True, "items": items}


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
    if rd.get("ok"):                                     # 읽었으면 바로 표준으로(영상 표준 · 원칙 94) — 분석은 표준본으로
        await _kick_std(p.tenant_id, org, did, rows, rd)
    return {**_public_read(rd), "draft_id": did, "size": sum(int(r["size"]) for r in rows), "as_of": now_iso()}


# ═══ 표준으로 바꾸기(영상 표준 · 원칙 94 · 확인 대장 15차 영상-1 · 영상-2 ⓐ) ═══════════════════════════
_std_tasks: set = set()


def _std_name(filename: str) -> str:
    stem, _, ext = filename.rpartition(".")
    stem = stem or filename
    return f"{stem}.tif" if ext.lower() in ("tif", "tiff") else f"{stem}_{ext.lower()}.tif"


async def _kick_std(tenant: str, org: str, did: str, rows, rd: dict) -> list[dict]:
    """읽기가 끝난 묶음의 영상 파일 → 표준본(같은 묶음 std/ 폴더). 작은 파일은 게이트웨이에서 바로(몇 초) · 큰 파일은 CPU 작업기 대기열.
    이미 기록이 있으면 건너뛴다(같은 묶음을 다시 읽어도 한 번). → 기록들."""
    from . import imagery_std as STD
    s = STD.settings()
    files = rd.get("_files") or {}
    folder = config.DATA_ROOT / root_rel(tenant) / "drafts" / did
    raster = settings()["raster_ext"]
    out = []
    for r in rows:
        if r["state"] != "done" or _ext(r["filename"]) not in raster:
            continue
        rec = await run_in_threadpool(STD.ensure, "upload", r["id"], _path(r), tenant=tenant, std_path=folder / "std" / _std_name(r["filename"]))
        out.append(rec)
        if rec["state"] != "queued" or rec.get("job_id"):
            continue
        epsg = (files.get(r["filename"]) or {}).get("epsg") or (rd.get("_epsg") if rd.get("crs_guessed") else None)
        if int(r["size"]) <= float(s["convert"]["inline_max_mb"]) * 1e6:
            t = asyncio.create_task(run_in_threadpool(STD.run_record, rec["id"], epsg=epsg))
            _std_tasks.add(t)
            t.add_done_callback(_std_tasks.discard)
        else:
            try:
                await STD.enqueue(rec["id"], f"영상 표준 · {org} 올린 영상", epsg)
            except Exception as e:  # noqa: BLE001 — 대기열이 없으면 분석 시작 때 다시
                await run_in_threadpool(STD.update, rec["id"], error=f"대기열에 넣지 못함 — 분석 시작 때 다시({type(e).__name__})")
    return out


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
            raise ApiError("conflict", "이 영상은 이 서비스로 이미 분석했거나 요청했습니다", None, 409)
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
            raise ApiError("conflict", "이미 요청한 묶음입니다", None, 409)
        folder = config.DATA_ROOT / root_rel(p.tenant_id) / "drafts" / draft
        try:
            rd = json.loads((folder / "_읽은값.json").read_text(encoding="utf-8"))
        except Exception:
            rd = await run_in_threadpool(read_files, p, org, folder, [r["filename"] for r in rows])
        if not rd.get("ok"):
            raise ApiError(rd.get("code") or "unreadable", rd.get("why") or "영상을 읽지 못했습니다", None, 403 if rd.get("code") == "out_of_scope" else 409)
        await _kick_std(p.tenant_id, org, draft, rows, rd)        # 읽기를 건너뛰고 바로 의뢰한 경우에도 표준본을 만든다(이미 있으면 그대로)
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
        from .spaces import helpdesk_of
        lead = await helpdesk_of(conn, p.tenant_id, d["card_id"]) or await _card_lead(conn, d["card_id"], d["card_version_id"])   # 기관 × 서비스 헬프데스크 담당 먼저(질문 17 ⓑ)
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
         "memo": r["memo"], "reason": r["reason"] if r["state"] in ("rejected", "failed") else (r.get("held_reason") if r["state"] == "held" else None),
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


async def _std_rows(rid: str) -> list[dict]:
    """의뢰에 쓰인 올린 영상 파일의 표준 변환 기록(원본 지울 날짜 · 원본 · 표준본 크기 — 숫자 한 출처 imagery_std)."""
    from . import imagery_std as STD
    async with db(realm="lx") as conn:
        ids = [x["id"] for x in await conn.fetch("SELECT id, filename FROM request_uploads WHERE request_id=$1 AND state='done'", rid)
               if _ext(x["filename"]) in settings()["raster_ext"]]
    out = []
    for i in ids:
        v = await run_in_threadpool(STD.get, None, source=("upload", i))
        if v:
            out.append(v)
    return out


def _std_line(recs: list[dict]) -> tuple[str | None, str | None]:
    """→ (표준본 한 줄, 원본 지울 날짜 한 줄) — LX 쪽 판단 근거. 경로 · 도구는 내지 않는다."""
    from . import imagery_std as STD
    if not recs:
        return None, None
    st = {v["state"] for v in recs}
    if st <= {"ready"}:
        o = sum(int(v.get("orig_size") or 0) for v in recs)
        n = sum(int(v.get("std_size") or 0) for v in recs)
        line = ((f"표준본 {_gb(n / 1e9)} · 원본의 {round(100 * n / o)}%" if n < o else f"표준본 {_gb(n / 1e9)} · 원본의 {n / o:.1f}배")
                if o and n and n != o else "표준본 확인(이미 표준 형식)")
    elif "converting" in st or "queued" in st:
        line = "표준본으로 바꾸는 중"
    else:
        line = next((v.get("error") for v in recs if v.get("error")), None) or "원본으로 분석"
    days = sorted(v["orig_delete_on"] for v in recs if v.get("orig_delete_on") and not v.get("orig_deleted_at"))
    gone = any(v.get("orig_deleted_at") for v in recs)
    keep = int(STD.settings()["original"]["keep_days"])
    when = STD.date_word(days[0]) if days else ("지웠습니다" if gone else (f"표준본 확인 뒤 {keep}일" if ("converting" in st or "queued" in st) else None))
    return line, when


async def basis(conn, r, lx: bool = False) -> list:
    """결재 판단 근거 — 범위 · 면적 · 영상 · 예상 시간 · 분석 모델 · 대기열 · 이 기관 이번 달 사용(막는 값이 아니라 보여 주는 값). 지금 있는 값만(없으면 줄을 만들지 않는다).
    LX 쪽(관리자 · 직원)에는 올린 영상의 표준본 · 원본 지울 날짜(영상 표준 · 확인 대장 15차 영상-3 ⓑ)도."""
    from . import quota as Q
    m = dict(r["meta"] or {})
    rows: list = []
    put = lambda k, v: rows.append([k, v]) if v else None   # noqa: E731
    put("기관 · 서비스", f"{m.get('org') or ''} · {m.get('service') or ''}".strip(" ·"))
    shared = r["source"] == "shared"
    put("영상", " · ".join(x for x in [m.get("label") if shared else None, _date_word(m.get("date")), m.get("gsd_word"), "LX 공유 영상" if shared else None] if x))
    if not shared:
        put("올린 파일", f"{m.get('files') or 1}개 · {_gb((m.get('size') or 0) / 1e9)}")
        if lx:
            try:
                line, when = _std_line(await _std_rows(r["id"]))
            except Exception:  # noqa: BLE001
                line = when = None
            put("표준본", line)
            put("원본 지울 날짜", when)
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


# ═══ 요청 관리(LX 관리자 · now 페이지 질문 16 ⓐ · 원칙 122) — 순번 · 급함 · 담당 · 보류 · 승인 · 거절 ═══════════════════
# 분석은 한 번에 한 건(전력 규칙) — 순번은 그 한 줄에 선 차례. 급함 = 맨 앞(분석 작업 우선순위 0) · 보류 = 승인 전에 잠시 멈춤(사유가 기관 '내 요청'에).
# 담당 = 요청의 담당 LX 직원(lead_user · 비면 'LX 관리자가 봄'). 조정은 모두 처리 기록(audit_log request.*)에 누가 언제.
MANAGE_STATES = ("pending", "held", "approved", "analyzing")
MANAGE_ACT = {"up": "순번 올림", "down": "순번 내림", "urgent": "급함", "calm": "급함 풂", "assign": "담당 바꿈", "hold": "보류", "resume": "보류 풂"}
LOG_WORD = {"request.order": "순번", "request.urgent": "급함", "request.assign": "담당", "request.hold": "보류", "request.resume": "보류 풂",
            "approval.approve": "승인", "approval.reject": "거절"}


def _manage_sort(rows: list, running: set) -> list:
    """순번 순서 — 지금 분석 중 → 급함 → 관리자가 정한 순번 → 들어온 순."""
    def key(r):
        run = r["state"] == "analyzing" and r["job_id"] in running
        qo = r["queue_order"] if r["queue_order"] is not None else 10 ** 6
        return (0 if run else 1, 0 if r["urgent"] else 1, qo, r["created_at"])
    return sorted(rows, key=key)


async def _manage_rows(conn) -> tuple[list, set]:
    rows = await conn.fetch(f"SELECT {REQ_COLS} FROM analysis_requests q JOIN deploys d ON d.id=q.deploy_id LEFT JOIN cards c ON c.id=d.card_id "
                            "WHERE q.state = ANY($1::text[]) ORDER BY q.created_at LIMIT 200", list(MANAGE_STATES))
    jobs = [r["job_id"] for r in rows if r["job_id"]]
    running = {x["id"] for x in await conn.fetch("SELECT id FROM jobs WHERE id = ANY($1::text[]) AND state='running'", jobs)} if jobs else set()
    return _manage_sort(rows, running), running


async def _staff(conn) -> list[dict]:
    from .approvals import ROLE_WORD
    return [{"id": u["id"], "name": u["name"] or ROLE_WORD.get(u["role"], "LX"), "role": ROLE_WORD.get(u["role"], "LX"), "dept": u["dept"]}
            for u in await conn.fetch("SELECT id, name, role, dept FROM lx_users WHERE status='active' AND role IN ('staff','admin') "
                                      "ORDER BY role DESC, name NULLS LAST, id")]


async def _sync_job_priority(conn, r) -> None:
    """요청의 분석 작업이 아직 시작 전이면 급함을 작업 우선순위에 바로 반영(작업기가 매번 다시 읽는다)."""
    if not r or not r["job_id"]:
        return
    from .deps import redis
    j = await conn.fetchrow("SELECT state, options FROM jobs WHERE id=$1", r["job_id"])
    if not j or j["state"] != "queued":
        return
    opts = j["options"] if isinstance(j["options"], dict) else {}
    prio = 0 if r["urgent"] else (2 if opts.get("scope") == "sgg" else 1)
    await conn.execute("UPDATE jobs SET priority=$2 WHERE id=$1", r["job_id"], prio)
    try:
        await (await redis()).hset(f"job:{r['job_id']}", "priority", prio)
    except Exception:  # noqa: BLE001
        pass


def _name_ko(v) -> str | None:
    return (v.get("ko") if isinstance(v, dict) else v) or None


@router.get("/requests/manage")
async def manage_list(request: Request):
    """요청 관리 — 분석 요청(순번 순서) + 맨 위 띠(지금 분석 중 · 기다리는 분석 · 동시에 도는 분석 · 최근 기다린 시간) + 처리 기록."""
    require(principal(request), admin=True)
    from .approvals import people
    from .jobs import power_budget
    async with db(realm="lx") as conn:
        rows, running = await _manage_rows(conn)
    rows = [r for r in await _sync(rows) if r["state"] in MANAGE_STATES]
    async with db(realm="lx") as conn:
        who = await people(conn)
        staff = await _staff(conn)
        q = await conn.fetchrow("SELECT count(*) FILTER (WHERE state='running') ru, count(*) FILTER (WHERE state='queued') qu FROM jobs "
                                "WHERE state IN ('queued','running') AND NOT demo AND pool <> 'cpu'")
        p95 = await conn.fetchval("SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY greatest(0, extract(epoch FROM started_at-created_at))) FROM jobs "
                                  "WHERE started_at IS NOT NULL AND created_at > now() - interval '24 hours' AND pool <> 'cpu' AND NOT demo")
        tn = {t["id"]: _name_ko(t["name"]) for t in await conn.fetch("SELECT id, name FROM tenants")}
        logs = await conn.fetch(
            "SELECT a.actor, a.action, a.subject, a.after, a.at FROM audit_log a WHERE a.action = ANY($1::text[]) AND "
            "(a.action LIKE 'request.%' OR a.subject IN (SELECT id FROM approvals WHERE subject_type='request')) ORDER BY a.at DESC LIMIT 30",
            list(LOG_WORD))
        rq_of = {x["id"]: x["subject_id"] for x in await conn.fetch(
            "SELECT id, subject_id FROM approvals WHERE subject_type='request' AND id = ANY($1::text[])", [lg["subject"] for lg in logs])} if logs else {}
        names = {x["id"]: x for x in await conn.fetch(
            "SELECT q.id, q.meta->>'org' org, q.meta->>'service' svc FROM analysis_requests q WHERE q.id = ANY($1::text[])",
            [rq_of.get(lg["subject"], lg["subject"]) for lg in logs])} if logs else {}
    try:
        pb = await power_budget()
        conc = {"hot_now": int(pb.get("hot_now") or 0), "max_hot_gpus": int(pb.get("max_hot_gpus") or 1)}
    except Exception:  # noqa: BLE001
        conc = None
    staff_name = {s["id"]: s["name"] for s in staff}
    busy = int(q["ru"] or 0) > 0
    items, prev_n, n = [], None, 0
    for r in rows:
        m = dict(r["meta"] or {})
        run = r["state"] == "analyzing" and r["job_id"] in running
        n += 1
        if run:
            eta = "분석 중"
        elif r["state"] == "held":
            eta = "보류 — 풀면 순서대로"
        elif prev_n is None:
            eta = "지금 분석이 끝난 뒤" if busy else ("곧 시작" if r["state"] in ("approved", "analyzing") else "승인하면 바로")
        else:
            eta = f"{prev_n}번 끝난 뒤"
        if r["state"] != "held":
            prev_n = n
        a = m.get("area_km2")
        ov = m.get("overlay")
        items.append({"id": r["id"], "n": n, "state": r["state"], "state_word": "분석 중" if run else STATE_WORD.get(r["state"], r["state"]),
                      "org": m.get("org") or tn.get(r["tenant_id"]), "tenant_id": r["tenant_id"],
                      "service": m.get("service") or _svc_name(r["cname"]), "created_at": _iso(r["created_at"]),
                      "place": m.get("place"), "area_word": (f"약 {float(a):,.2f}㎢" if float(a) < 10 else f"약 {float(a):,.0f}㎢") if a is not None else None,
                      "image_word": " · ".join(x for x in [m.get("gsd_word"), KIND_WORD.get(m.get("kind") or "", "")] if x) or None,
                      "source": r["source"], "imagery_id": r["imagery_id"] if r["source"] == "shared" else None,
                      "overlay": ov.get("url") if isinstance(ov, dict) else None,
                      "urgent": bool(r["urgent"]), "held_reason": r["held_reason"] if r["state"] == "held" else None,
                      "assignee": {"id": r["lead_user"], "name": staff_name.get(r["lead_user"]) or who.get(r["lead_user"])} if r["lead_user"] else None,
                      "eta": eta, "approval_id": r["approval_id"], "requested_by_name": who.get(r["requested_by"]),
                      "memo": r["memo"], "running": run, "can_decide": r["state"] in ("pending", "held")})
    log = []
    for lg in logs:
        rid = rq_of.get(lg["subject"], lg["subject"])
        nm = names.get(rid)
        if not nm:                                      # 지워진 요청(시험 정리 등)의 기록은 화면에 내지 않는다
            continue
        after = lg["after"] if isinstance(lg["after"], dict) else {}
        what = LOG_WORD.get(lg["action"], lg["action"])
        if lg["action"] == "request.order":
            what = "순번 올림" if after.get("dir") == "up" else "순번 내림"
        elif lg["action"] == "request.urgent":
            what = "급함" if after.get("urgent") else "급함 풂"
        elif lg["action"] == "request.assign":
            what = f"담당 — {staff_name.get(after.get('user_id')) or 'LX 관리자가 봄'}"
        log.append({"at": _iso(lg["at"]), "who": who.get(lg["actor"]) or "LX 관리자", "what": what,
                    "target": " · ".join(x for x in [(nm or {}).get("org"), (nm or {}).get("svc")] if x) or "분석 요청",
                    "reason": after.get("reason")})
    return {"items": items, "staff": staff,
            "strip": {"running": env(int(q["ru"] or 0), "count", "measured", "jobs(state running · GPU 대기열)"),
                      "waiting": env(int(q["qu"] or 0), "count", "measured", "jobs(state queued · GPU 대기열)"),
                      "concurrent": conc,
                      "wait_s": env(round(float(p95), 1) if p95 is not None else None, "s", "measured", "jobs(started_at − created_at · 24h 상위 5%)",
                                    None if p95 is not None else "시작된 분석 없음")},
            "log": log, "as_of": now_iso()}


@router.post("/requests/{rid}/manage")
async def manage(rid: str, body: dict, request: Request):
    """{action: up|down|urgent|calm|assign|hold|resume, reason?, user_id?} — 급함 · 보류는 사유 필수(보류 사유는 기관 '내 요청'에 보인다)."""
    from .jobs import ops_event, tenant_event
    p = require(principal(request), admin=True)
    act = str(body.get("action") or "")
    if act not in MANAGE_ACT:
        raise ApiError("bad_request", "action 은 up|down|urgent|calm|assign|hold|resume")
    reason = str(body.get("reason") or "").strip()[:200] or None
    if act in ("urgent", "hold") and not reason:
        raise ApiError("reason_required", "사유를 적어 주세요 — 처리 기록에 남고, 보류 사유는 기관에도 보입니다", None, 400)
    async with db(realm="lx") as conn:
        async with conn.transaction():
            r = await conn.fetchrow("SELECT id, tenant_id, state, urgent, approval_id, job_id FROM analysis_requests WHERE id=$1 FOR UPDATE", rid)
            if not r or r["state"] not in MANAGE_STATES:
                raise ApiError("not_found", "관리할 분석 요청이 없습니다")
            after: dict = {"tenant_id": r["tenant_id"]}
            if act in ("up", "down"):
                rows, _ = await _manage_rows(conn)
                ids = [x["id"] for x in rows]
                i = ids.index(rid)
                j = i - 1 if act == "up" else i + 1
                if not (0 <= j < len(ids)):
                    raise ApiError("conflict", "더 옮길 수 없습니다", None, 409)
                if rows[j]["urgent"] != r["urgent"]:
                    raise ApiError("conflict", "급함 요청과는 순서를 바꿀 수 없습니다 — 급함을 켜거나 풀어 주세요", None, 409)
                ids[i], ids[j] = ids[j], ids[i]
                for k, x in enumerate(ids):
                    await conn.execute("UPDATE analysis_requests SET queue_order=$2 WHERE id=$1", x, k + 1)
                action, after["dir"] = "request.order", act
            elif act in ("urgent", "calm"):
                await conn.execute("UPDATE analysis_requests SET urgent=$2, updated_at=now() WHERE id=$1", rid, act == "urgent")
                action, after["urgent"] = "request.urgent", act == "urgent"
            elif act == "assign":
                uid = body.get("user_id") or None
                if uid and not await conn.fetchval("SELECT 1 FROM lx_users WHERE id=$1 AND status='active' AND role IN ('staff','admin')", uid):
                    raise ApiError("not_found", "없는 LX 직원입니다")
                await conn.execute("UPDATE analysis_requests SET lead_user=$2, updated_at=now() WHERE id=$1", rid, uid)
                action, after["user_id"] = "request.assign", uid
            elif act == "hold":
                if r["state"] != "pending":
                    raise ApiError("conflict", "확인 대기인 요청만 보류할 수 있습니다", None, 409)
                await conn.execute("UPDATE analysis_requests SET state='held', held_reason=$2, updated_at=now() WHERE id=$1", rid, reason)
                action = "request.hold"
            else:
                if r["state"] != "held":
                    raise ApiError("conflict", "보류 중인 요청이 아닙니다", None, 409)
                await conn.execute("UPDATE analysis_requests SET state='pending', held_reason=NULL, updated_at=now() WHERE id=$1", rid)
                action = "request.resume"
            if reason:
                after["reason"] = reason
            await audit(conn, p, action, rid, None, after)
            await _sync_job_priority(conn, await conn.fetchrow("SELECT job_id, urgent FROM analysis_requests WHERE id=$1", rid))
    if act in ("hold", "resume"):
        await tenant_event(r["tenant_id"], "request.changed", {"request_id": rid, "state": "held" if act == "hold" else "pending"})
    await ops_event("approval.requested", {"approval_id": r["approval_id"], "subject_type": "request", "subject_id": rid, "action": act, "at": now_iso()})
    return {"id": rid, "action": act, "done": MANAGE_ACT[act], "as_of": now_iso()}


@router.get("/requests/{rid}")
async def get_request(rid: str, request: Request):
    p = require(principal(request))
    async with db(realm="lx") as conn:
        r = await conn.fetchrow(f"SELECT {REQ_COLS} FROM analysis_requests q JOIN deploys d ON d.id=q.deploy_id LEFT JOIN cards c ON c.id=d.card_id "
                                "WHERE q.id=$1", rid)
    if not r or (p.realm == "tenant" and r["tenant_id"] != p.tenant_id) or not (p.realm == "tenant" or (p.is_lx and p.role in ("admin", "staff"))):
        raise ApiError("not_found", "분석 요청이 없습니다")
    r = (await _sync([r]))[0]
    m = dict(r["meta"] or {})
    v = _view(r, p)
    async with db(realm="lx") as conn:
        v["basis"] = await basis(conn, r, lx=bool(p.is_lx))
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
                           "WHERE id=$1 AND state IN ('pending','held')", rid, new, reason if new == "rejected" else None, user)
    if n.endswith(" 0"):
        raise ApiError("conflict", "이미 결정된 분석 요청입니다", None, 409)
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


FAIL_LINE = {"too_large": "범위가 한 번에 분석하기에 너무 넓습니다 — LX 담당자가 나눠 분석합니다",
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
    if opts.get("request_id"):                       # 분석 요청 — 급함 = 0(맨 앞) · 그 밖 = 1 · 시군구 전역 = 2(요청 관리 · 질문 16 ⓐ)
        async with db(realm="lx") as conn:
            urgent = await conn.fetchval("SELECT urgent FROM analysis_requests WHERE id=$1", opts["request_id"])
        prio = 0 if urgent else (2 if opts.get("scope") == "sgg" else 1)
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


_waiting: set = set()


async def _std_source(r) -> tuple[str | None, str | None]:
    """의뢰에 쓰인 올린 파일들의 표준본 → 분석 원천(파일 하나 또는 표준본 모음). 아직 바꾸는 중이면 기다린다(작업기 대기열 · 설정 wait_minutes).
    표준본을 만들지 못한 파일은 원본을 쓴다(서버 파이썬이 여는 형식만) — 원본도 못 읽으면 (None, 사유).
    기다리는 동안 의뢰의 시작 표시를 새로 적어 다른 곳(목록 보기의 다시 시작)이 같은 분석을 두 번 넣지 않게 한다."""
    from . import imagery_std as STD
    s = STD.settings()
    async with db(realm="lx") as conn:
        rows = await conn.fetch("SELECT * FROM request_uploads WHERE request_id=$1 AND state='done' ORDER BY created_at", r["id"])
        org = await _tenant_name(conn, r["tenant_id"])
    raster = settings()["raster_ext"]
    rows = [x for x in rows if _ext(x["filename"]) in raster]
    if not rows:
        return None, "올린 영상 파일이 없습니다"
    m = dict(r["meta"] or {})
    folder = _path(rows[0]).parent
    rd = {"_epsg": m.get("epsg"), "crs_guessed": False}
    try:
        rd = json.loads((folder / "_읽은값.json").read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        pass
    deadline = time.time() + float(s["convert"]["wait_minutes"]) * 60
    kicked = revived = False
    while True:
        recs = {}
        for x in rows:
            recs[x["id"]] = await run_in_threadpool(STD.get, None, source=("upload", x["id"]))
        # 바꾸던 쪽이 사라진 기록(게이트웨이가 다시 뜸 — 바꾸는 동안은 5분마다 기록을 새로 적는다) → 한 번 다시 줄 세운다
        dead = [v for v in recs.values() if v and v["state"] == "converting" and v.get("updated_at")
                and (dt.datetime.now(KST) - v["updated_at"]).total_seconds() > 900]
        if dead and not revived:
            for v in dead:
                await run_in_threadpool(STD.update, v["id"], state="queued", job_id=None)
            revived, kicked = True, False
            continue
        if not kicked and any(v is None or (v["state"] == "queued" and not v.get("job_id")) for v in recs.values()):
            await _kick_std(r["tenant_id"], org, r["draft_id"], rows, rd)          # 게이트웨이가 다시 떠 끊긴 경우
            kicked = True
            continue
        if all(v and v["state"] in ("ready", "failed", "deferred", "removed") for v in recs.values()) or time.time() > deadline:
            break
        async with db(realm="lx") as conn:
            await conn.execute("UPDATE analysis_requests SET meta = coalesce(meta,'{}'::jsonb) || jsonb_build_object('starting_at', extract(epoch FROM now())) "
                               "WHERE id=$1", r["id"])
        await asyncio.sleep(5)
    paths = []
    for x in rows:
        v = recs.get(x["id"])
        if v and v["state"] == "ready" and v.get("std_path"):
            paths.append(STD.absolute(v["std_path"]))
        elif STD.ext_of(x["filename"]) in ("tif", "tiff", "jpg", "jpeg", "jp2", "img") and _path(x).exists():
            paths.append(_path(x))                            # 표준본이 없으면 원본(서버 파이썬이 여는 형식)
        else:
            return None, ("서버 저장 공간이 모자라 분석하지 못했습니다 — LX 담당자가 확인합니다" if v and v["state"] == "deferred"
                          else "영상 파일을 읽을 수 없습니다 — LX 담당자가 확인합니다")
    if len(paths) == 1 and not (rd.get("crs_guessed") and paths[0] == _path(rows[0])):
        return str(paths[0]), None
    # 여러 파일(또는 위치로 가려낸 좌표계의 원본) — 표준본 모음 파일 하나(복사 0)
    def build():
        metas = [_meta(pth) for pth in paths]
        ep = int(m.get("epsg") or rd.get("_epsg") or metas[0]["epsg"] or 5186)
        for mm in metas:
            mm["name"] = os.path.relpath(mm["path"], folder).replace("\\", "/")
        out = folder / "_모음_표준.vrt"
        _write_vrt(out, metas, ep)
        return str(out)
    try:
        return await run_in_threadpool(build), None
    except ReadFail as e:
        return None, e.line


async def _register_upload_imagery(r, src: str | None = None) -> str:
    """올린 영상 → 분석 동안만 쓰는 의뢰 영상 한 줄(layer.role 'request' — 영상 목록 · 다른 분석의 영상 고르기에 나오지 않는다).
    분석 원천 = 표준본(영상 표준) — 없으면 읽기 때 만든 원본 모음."""
    m = dict(r["meta"] or {})
    if src:
        m["src"] = src
    iid = f"rqimg-{r['id'][3:]}"
    year = int(str(m.get("date") or "0")[:4] or 0) or None
    async with db(realm="lx") as conn:
        await conn.execute(
            "INSERT INTO imagery(id, name, tier, gsd_m, epoch, crs, footprint, path_internal, license, attribution, export_policy, security_review, "
            "rights_holder, ladder, kind, layer, sgg_cd, year, registered_by, registered_at) VALUES ($1,$2,'raw',$3,$4,$5,"
            "ST_SetSRID(ST_GeomFromGeoJSON($6),4326),$7,'기관 제공(분석 요청 전용)',$8,'never','pending',$8,$9,'ortho',$10,$11,$12,$13,now()) "
            "ON CONFLICT (id) DO NOTHING",
            iid, {"ko": f"{m.get('org')} 분석 요청 영상", "en": "request imagery"}, m.get("gsd_m"), m.get("date"), f"EPSG:{m.get('epsg')}",
            json.dumps(m["footprint"]), m["src"], m.get("org") or "기관", {"stage": "request", "from": 12, "to": 22, "order": 999},
            {"role": "request", "request_id": r["id"], "tenant": r["tenant_id"], "source_kind": m.get("kind")}, m.get("sgg_cd"), year, r["requested_by"])
        await conn.execute("UPDATE analysis_requests SET imagery_id=$2 WHERE id=$1", r["id"], iid)
    return iid


async def start_analysis(rid: str, user: str) -> None:
    """승인된 의뢰 → 영상 · 모델(배포 흐름과 같은 모델 고르기) → 관할 확인 → 기존 분석 작업 대기열(사용을 막는 값 없음 — 작업 크기 · 전력 같은 장비 조건만)."""
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
        if r["source"] == "upload":
            if rid in _waiting:                               # 이 게이트웨이가 이미 표준본을 기다리는 중
                return
            _waiting.add(rid)
            try:
                src, why = await _std_source(r)
            finally:
                _waiting.discard(rid)
            if not src:
                await _fail(rid, "imagery_unavailable", why or FAIL_LINE["imagery_unavailable"])
                return
            async with db(realm="lx") as conn:                # 기다리는 사이 다른 쪽이 시작했으면 여기서 멈춘다(두 번 넣지 않게)
                again = await conn.fetchrow("SELECT state, job_id FROM analysis_requests WHERE id=$1", rid)
            if not again or again["state"] != "approved" or again["job_id"]:
                return
            iid = await _register_upload_imagery(r, src)
        else:
            iid = r["imagery_id"]
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
        body["label"] = f"분석 요청 · {m.get('org') or ''} · {m.get('service') or ''}".strip(" ·")
        await J.scope_guard(tp, guard)                          # 관할 밖 0(원칙 39) — 기관 계정 기준으로 한 번 더
        q = await J.build_quote(lx, body)
        q["_tenant"] = r["tenant_id"]
        # 기관 한도로는 막지 않는다(사용자 7차 답) — 관리자가 승인한 분석은 대기열 순번대로. 막는 것은 작업 크기 · 전력(두 장 동시 고부하) 같은 기계 조건만
        reasons = list(q.get("reasons") or [])
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
        await _fail(rid, e.code, FAIL_LINE.get(e.code), e.message)
    except Exception as e:  # noqa: BLE001 — 흐름 오류는 '분석하지 못함' + 기록
        await _fail(rid, "error", None, repr(e))
