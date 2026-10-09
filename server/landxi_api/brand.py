"""기관 분기 플랫폼 브랜드(구현 2차 T3 · 확인 대장 6차 GF-1 · GF-3 · GF-5 ⓐ · 5차 체계-2 ⓑ · 원칙 48 · 64 · 67).

기관마다 같은 틀, 다른 내용 — 마크 · 플랫폼 이름 · 기관색(진한 1 + 연한 1) · 메인 소개 글(머리 · 설명 · 서비스 소개) · 문의처 ·
그 기관에 켜진 서비스 목록. 서버가 정본(표 tenant_brand · migrations/0012_brand.sql).

  GET    /api/v1/brand/{기관}          로그인 없이(기관별 메인이 읽는다) — 공개 정보만(숫자 0 · 계정 0 · 경로 0)
  GET    /api/v1/brand/{기관}/main     로그인 없이 — 기관 메인의 그림(설정 config/gov-main.yaml · 저해상 크롭만 · 제한 영상 0)과
                                      업무 결과 셋(업무 결과 하나 · 서비스 수 · 최근 분석한 날 — 기관-2 ⓐ 시안 · 필지 · 좌표 · 목록 0)
  PUT    /api/v1/brand/{기관}          고치기 — 그 기관의 관리자(manager) + LX 관리자만 · 기관색은 대비 검사를 통과할 때만 저장
  POST   /api/v1/brand/{기관}/mark     마크 그림 올리기(PNG · JPG · WebP · 1MB 이하 · 가로세로 64–2048) → 512 안쪽 PNG 로 다시 저장
  DELETE /api/v1/brand/{기관}/mark     그림 마크 지우기(글자 마크로)
  GET    /files/brand/{기관}/{파일}     마크 그림(이름에 내용 해시 — 오래 보관해도 된다)

서비스 목록은 LX 관리자만 정한다(원칙 67). 상태 말(운영 · 시범 · 첫 결과 전)은 대표 수치 요약(summary.py)과 같은 판정이고,
초안만 있는 다음 해 사업은 '내년'(그 뒤 해는 'YYYY년 예정') — 결과가 없으면 숫자를 지어내지 않는다.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import io
import re

from fastapi import APIRouter, File, Request, UploadFile
from fastapi.responses import Response
from starlette.concurrency import run_in_threadpool

from . import config, summary
from .deps import ApiError, audit, db, pool, principal, require
from .envelope import KST

router = APIRouter()
API = "/api/v1"

TENANT_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,40}$")
HEX_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")
MARK_FILE_RE = re.compile(r"^mark-[0-9a-f]{12}\.png$")
MARK_MAX_BYTES = 1_000_000
MARK_MIN_PX, MARK_MAX_PX, MARK_OUT_PX = 64, 2048, 512
MARK_FORMATS = {"PNG", "JPEG", "WEBP"}

# 기본값(씨앗이 없는 새 기관) — 옛 포털 자산 brand.js THEMES.lx 와 같은 값
DEFAULT_ACCENT, DEFAULT_TINT = "#006DF7", "#E8F1FF"
LIMITS = {"platform": 30, "short": 12, "mark_line": 6, "headline_line": 20, "line": 60, "item": 40, "contact": 30}

LIVE_RANK = {"운영": 0, "시범": 1, "첫 결과 전": 2}


# ── 대비 검사(옛 포털 brandGuard 규칙 + 검정 톤 금지) ─────────────────────────────
def _lum(hexv: str) -> float:
    c = [int(hexv[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    c = [v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4 for v in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def contrast(a: str, b: str) -> float:
    x, y = sorted((_lum(a), _lum(b)), reverse=True)
    return round((x + 0.05) / (y + 0.05), 2)


def check_colors(accent: str, tint: str) -> list[dict]:
    """→ 걸린 것 목록(비면 통과). 화면(gov-select/brand.js)이 같은 식으로 미리 보여 주고, 저장은 여기서만 결정한다."""
    bad: list[dict] = []
    if not HEX_RE.match(accent or ""):
        return [{"key": "accent", "why": "진한 색은 #RRGGBB 형식이어야 합니다"}]
    if not HEX_RE.match(tint or ""):
        return [{"key": "tint", "why": "연한 바탕은 #RRGGBB 형식이어야 합니다"}]
    on_white = contrast(accent, "#FFFFFF")
    if on_white < 4.5:
        bad.append({"key": "accent", "why": f"진한 색이 흰 바탕에서 잘 읽히지 않습니다(대비 {on_white} — 4.5 이상)"})
    if _lum(accent) < 0.05:
        bad.append({"key": "accent", "why": "검정에 가까운 색은 기관색으로 쓸 수 없습니다"})
    if contrast(tint, "#FFFFFF") > 1.6:
        bad.append({"key": "tint", "why": "연한 바탕이 너무 짙습니다(흰 바탕과 차이 1.6 이하)"})
    if contrast(accent, tint) < 3.0:
        bad.append({"key": "tint", "why": "진한 색과 연한 바탕의 차이가 작습니다(대비 3 이상)"})
    return bad


# ── 읽기 ────────────────────────────────────────────────────────────────────
async def _tenant(tenant: str):
    """이용 기관(kind user · active · 영업 계량 기관 제외)만. 없으면 404 — 있는 기관인지 추측하지 않는다."""
    if not TENANT_RE.match(tenant or ""):
        raise ApiError("not_found", "없는 기관입니다")
    pl = await pool()
    row = await pl.fetchrow(
        "SELECT t.id, t.name, t.scope, t.locale, b.platform, b.short, b.mark_text, b.mark_file, b.accent, b.tint, b.contact, "
        "b.intro, b.services, b.updated_at FROM tenants t LEFT JOIN tenant_brand b ON b.tenant_id = t.id "
        "WHERE t.id = $1 AND t.kind = 'user' AND t.status = 'active' AND t.id <> 'lx-demo'", tenant)
    if not row:
        raise ApiError("not_found", "없는 기관입니다")
    return row


def _en(row) -> bool:
    return (row["locale"] or "ko") == "en"


def _name_ko(row) -> str:
    """기관 이름(그 기관의 말) — 해외 기관(locale en)은 영문 이름."""
    n = row["name"] or {}
    if not isinstance(n, dict):
        return str(n)
    return (n.get("en") if _en(row) else n.get("ko")) or n.get("ko") or n.get("en") or row["id"]


def _short_default(row) -> str:
    if _en(row):
        return _name_ko(row)
    words = _name_ko(row).split()
    return words[-1] if words else row["id"]


def _mark_default(row, short: str) -> str:
    if _en(row):
        caps = "".join(w[0] for w in short.split() if w[:1].isalpha() and w[:1].isupper())
        return (caps or short)[:4]
    return short[:2]


def _year_now() -> int:
    return dt.datetime.now(KST).year


async def _services(tenant: str, order: list[str] | None, items_intro: dict, en: bool = False) -> list[dict]:
    """그 기관에 켜진 서비스 — 배포 기록이 있는 카드만(시험 배포 제외). 순서 = 브랜드 services(LX 관리자) → 없으면 해 · 카드 순.
    기관 공유(확인 대장 배포-5 · 원칙 152): LX 관리자가 '배포 → 기관 공유'에서 켠 서비스는 더하고(목록 끝) 끈 서비스는 뺀다.
    공유 기록이 없는 서비스는 지금까지처럼 배포 기록으로 판정한다(운영 중인 공유 상태를 바꾸지 않는다)."""
    async with db(realm="lx") as c:
        dps = await c.fetch("SELECT card_id, stage, year FROM deploys WHERE tenant_id = $1 AND NOT coalesce(test, false)", tenant)
        try:
            from .release import latest_shares
            sh = await latest_shares(c, tenant=tenant)
        except Exception:  # noqa: BLE001 — 공유 기록 표가 없으면(되돌린 뒤) 배포 기록만
            sh = {}
        ids = sorted({d["card_id"] for d in dps if d["card_id"]} | set(sh))
        cards = {r["id"]: r for r in await c.fetch("SELECT id, name, intro FROM cards WHERE id = ANY($1::text[])", ids)} if ids else {}
    by: dict[str, dict] = {}
    for d in dps:
        b = by.setdefault(d["card_id"], {"live": [], "draft": []})
        (b["draft"] if d["stage"] == "draft" else b["live"]).append(d)
    if order:
        want = [c for c in order if c in by]
    else:   # 기본: LX 가 뒤에서 돌린 적용(shadow) · 되돌린 것만 있는 카드는 기관 서비스로 보이지 않는다
        want = sorted((c for c, b in by.items() if b["draft"] or any(x["stage"] in ("ga", "canary") for x in b["live"])),
                      key=lambda c: (min([x["year"] or 9999 for x in by[c]["live"] + by[c]["draft"]]), c))
    shared_on = {cid for cid, r in sh.items() if r["shared"] and cid in cards}
    want = [c for c in want if not (c in sh and not sh[c]["shared"])] + sorted((c for c in shared_on if c not in want), key=lambda c: (sh[c]["at"], c))
    all_items, _ = await summary.cached_all()
    stage_of: dict[str, str] = {}
    for it in all_items:
        if it["tenant"] == tenant and it["card"] in by:
            s = it["stage"]
            if it["card"] not in stage_of or LIVE_RANK.get(s, 9) < LIVE_RANK.get(stage_of[it["card"]], 9):
                stage_of[it["card"]] = s
    now_y = _year_now()
    out = []
    for cid in want:
        b = by.get(cid) or {"live": [], "draft": []}
        live_years = [x["year"] for x in b["live"] if x["year"]]
        draft_years = [x["year"] for x in b["draft"] if x["year"]]
        if b["live"] or cid in shared_on:
            status = stage_of.get(cid, summary.STAGE_FIRST)
            since = min(live_years) if live_years else (min(draft_years) if draft_years else sh[cid]["at"].astimezone(KST).year if cid in sh else None)
        else:
            y = min(draft_years) if draft_years else None
            status = "내년" if y == now_y + 1 else f"{y}년 예정" if y and y > now_y + 1 else summary.STAGE_FIRST
            since = y
        cr = cards.get(cid)
        nm = (cr["name"] or {}) if cr else {}
        intro = (cr["intro"] or {}) if cr else {}
        nm_s = ((nm.get("en") if en else None) or nm.get("ko") or nm.get("en")) if isinstance(nm, dict) else nm
        out.append({"card": cid, "name": nm_s or cid,
                    "line": items_intro.get(cid) or intro.get("headline") or "",
                    "year": since, "status": status, "open": bool(b["live"]) or cid in shared_on})
    return out


def _mark_url(tenant: str, f: str | None) -> str | None:
    return f"/files/brand/{tenant}/{f}" if f and MARK_FILE_RE.match(f) else None


async def _payload(row, request: Request | None = None) -> dict:
    t = row["id"]
    intro = row["intro"] or {}
    items = intro.get("items") or {}
    short = row["short"] or _short_default(row)
    mark_text = row["mark_text"] or _mark_default(row, short)
    accent, tint = row["accent"] or DEFAULT_ACCENT, row["tint"] or DEFAULT_TINT
    name = row["name"] or {}
    out = {
        "tenant": t, "scope": row["scope"], "locale": row["locale"] or "ko",
        "name": {"ko": name.get("ko"), "en": name.get("en")} if isinstance(name, dict) else {"ko": str(name), "en": None},
        "platform": row["platform"] or _name_ko(row), "short": short,
        "mark": {"text": [s for s in mark_text.split("\n") if s][:2], "image": _mark_url(t, row["mark_file"])},
        "color": {"accent": accent, "tint": tint},
        "intro": {"headline": intro.get("headline") or "", "lines": [s for s in (intro.get("lines") or []) if s][:3], "items": items},
        "contact": row["contact"] or "",
        "services": await _services(t, list(row["services"]) if row["services"] else None, items, _en(row)),
        "updated_at": row["updated_at"].astimezone(KST).isoformat(timespec="seconds") if row["updated_at"] else None,
    }
    if request is not None:
        p = principal(request)
        out["can_edit"] = _can_edit(p, t)
        out["can_edit_services"] = p.is_admin
    return out


def _can_edit(p, tenant: str) -> bool:
    return p.is_admin or (p.realm == "tenant" and p.role == "manager" and p.tenant_id == tenant)


def _editor(request: Request, tenant: str):
    p = require(principal(request))
    if not _can_edit(p, tenant):
        raise ApiError("forbidden", "이 기관의 관리자와 LX 관리자만 고칠 수 있습니다")
    return p


@router.get(API + "/brand/{tenant}")
async def get_brand(tenant: str, request: Request):
    return await _payload(await _tenant(tenant), request)


# ── 기관 메인(로그인 전) — 결과 장면 작게 · 업무 결과 셋(확인 대장 '기관 화면 확인' 기관-2 ⓐ · 원칙 116) ───────────
# 그림은 설정 한 곳(config/gov-main.yaml — LX 관리자가 고르는 화면은 다음 설계) · 로그인 전이므로 저해상 크롭만 · 제한 영상 0 · 그 기관 것만.
# 숫자는 대표 수치 요약(summary.cached_all — 로그인 뒤 서비스 카드 · 대시보드와 같은 값) 가운데 그 기관의 업무 결과 하나(현장 확인 필요 →
# 다듬은 결과의 AI 탐지) · 서비스 수 · 처음 사업 연도 · 최근 분석한 날만 — 필지 · 좌표 · 목록은 없다.
_MAIN_PIC_RE = re.compile(r"/landxi/[\w./-]+\.(?:jpg|jpeg|png|webp)", re.I)
_MAIN_PICS: dict[str, tuple[float, int]] = {}


def _main_pic(src, max_px: int, restricted: list[str]) -> str | None:
    """설정에 적힌 그림 → 내도 되는 주소(아니면 None). 저장소 화면 파일(/landxi/…)만 · 제한 영상 이름 0 · 긴 변 max_px 이하(서버가 잰다)."""
    s = str(src or "").strip()
    if not _MAIN_PIC_RE.fullmatch(s) or ".." in s or any(r and r in s for r in restricted):
        return None
    f = config.REPO_ROOT / s.lstrip("/")
    try:
        mt = f.stat().st_mtime
    except OSError:
        return None
    hit = _MAIN_PICS.get(s)
    if not hit or hit[0] != mt:
        from PIL import Image
        try:
            with Image.open(f) as im:
                px = max(im.size)
        except Exception:  # noqa: BLE001
            px = 1 << 30
        hit = _MAIN_PICS[s] = (mt, px)
    return s if hit[1] <= max_px else None


def _svc_short(name: str) -> str:
    return re.sub(r"\s*(행정서비스|서비스)$", "", str(name or "")).strip()


async def _main_facts(tenant: str, svcs: list[dict]) -> dict:
    from .cards import _metric, _raw_ai, _vnum
    from .envelope import env
    items, _at = await summary.cached_all()
    mine = [it for it in items if it["tenant"] == tenant]
    head = None
    for key in ("field_check", "detected"):                  # 현장 확인 필요(필지 대조) → 없으면 다듬은 결과의 AI 탐지(분석 칸 도형 수 0 · 사용자 규칙 2)
        for s in svcs:
            if not s.get("open"):
                continue
            es = [_metric(it, key) for it in mine if it["card"] == s["card"] and (key == "field_check" or not _raw_ai(it))]
            es = [e for e in es if e and (_vnum(e["value"]) or 0) > 0]
            if not es:
                continue
            total = int(sum(_vnum(e["value"]) or 0 for e in es))
            if key == "field_check":
                head = {"env": env(total, "필지", "inferred", es[0].get("source") or "실태조사", "현장 확인 전"), "label": "현장 확인 필요"}
            else:
                head = {"env": env(total, es[0].get("unit") or "건", es[0].get("basis") or "inferred", es[0].get("source") or "AI 분석", "결과 확인 전"),
                        "label": "AI 탐지"}
            head["service"], head["card"] = _svc_short(s.get("name")), s["card"]
            break
        if head:
            break
    dates = [str((_metric(it, "detected") or {}).get("as_of") or "")[:10] for it in mine if _metric(it, "detected") and not _raw_ai(it)]
    years = [s["year"] for s in svcs if s.get("year")]
    return {"result": head, "services": env(len(svcs), "count", "recorded", "기관에 열린 서비스(LX 관리자가 정한 목록)"),
            "since": str(min(years)) if years else None, "latest": max((d for d in dates if d), default=None)}


@router.get(API + "/brand/{tenant}/main")
async def get_brand_main(tenant: str):
    """기관 메인(로그인 전) — 배경 그림 · 서비스별 결과 장면(작게) · 업무 결과 셋. 로그인 없이(그 기관 메인이 읽는다)."""
    row = await _tenant(tenant)
    cfg = config.load_yaml("gov-main") or {}
    t = ((cfg.get("tenants") or {}).get(row["id"])) or {}
    max_px = int(cfg.get("max_px") or 800)
    restricted = [str(x) for x in (cfg.get("restricted") or [])]
    intro = row["intro"] or {}
    svcs = await _services(row["id"], list(row["services"]) if row["services"] else None, intro.get("items") or {}, _en(row))
    open_cards = {s["card"] for s in svcs if s.get("open")}
    scenes = {}
    for cid, sc in (t.get("scenes") or {}).items():
        sc = sc if isinstance(sc, dict) else {"src": sc}
        src = _main_pic(sc.get("src"), max_px, restricted)
        if src and cid in open_cards:                         # 열린 서비스의 결과 장면만(아직 시작 전인 서비스는 시작 시기만)
            scenes[cid] = {"src": src, "caption": str(sc.get("caption") or "")[:60]}
    bg = _main_pic(t.get("background"), max_px, restricted)
    from .catalog import _main_meta, _main_view          # 확인 18차 기관-12 ⓐ — LX 관리자가 고른 배경 사진(가로 1,600 이하 한 장)이 있으면 그것이 먼저
    chosen = _main_view(row["id"], _main_meta(row["id"]))
    background = {"src": chosen["url"], "api": True} if chosen else ({"src": bg} if bg else None)   # api = 서버 길(화면이 API 주소를 앞에 붙인다)
    return {"tenant": row["id"], "background": background, "scenes": scenes,
            "facts": await _main_facts(row["id"], svcs), "as_of": dt.datetime.now(KST).isoformat(timespec="seconds")}


# ── 고치기 ──────────────────────────────────────────────────────────────────
_CTRL = re.compile(r"[\x00-\x08\x0b-\x1f\x7f<>]")


def _txt(v, key: str, limit: int, *, lines: int = 1, required: bool = False) -> str:
    if v is None:
        v = ""
    if not isinstance(v, str):
        raise ApiError("bad_request", "글자만 넣을 수 있습니다", {"key": key})
    v = _CTRL.sub("", v.replace("\r\n", "\n").replace("\r", "\n"))
    parts = [s.strip() for s in v.split("\n")]
    parts = [s for s in parts if s]
    if len(parts) > lines:
        raise ApiError("bad_request", f"{lines}줄까지 쓸 수 있습니다" if lines > 1 else "한 줄로 써 주세요", {"key": key})
    if any(len(s) > limit for s in parts):
        raise ApiError("bad_request", f"한 줄에 {limit}자까지 쓸 수 있습니다", {"key": key})
    if required and not parts:
        raise ApiError("bad_request", "비워 둘 수 없습니다", {"key": key})
    return "\n".join(parts)


@router.put(API + "/brand/{tenant}")
async def put_brand(tenant: str, body: dict, request: Request):
    p = _editor(request, tenant)
    row = await _tenant(tenant)
    cur_intro = row["intro"] or {}
    new = {
        "platform": row["platform"] or _name_ko(row), "short": row["short"] or _short_default(row),
        "mark_text": row["mark_text"] or _mark_default(row, row["short"] or _short_default(row)),
        "accent": row["accent"] or DEFAULT_ACCENT, "tint": row["tint"] or DEFAULT_TINT, "contact": row["contact"] or "",
        "intro": {"headline": cur_intro.get("headline") or "", "lines": list(cur_intro.get("lines") or []), "items": dict(cur_intro.get("items") or {})},
        "services": list(row["services"]) if row["services"] else None,
    }
    if "platform" in body:
        new["platform"] = _txt(body["platform"], "platform", LIMITS["platform"], required=True)
    if "short" in body:
        new["short"] = _txt(body["short"], "short", LIMITS["short"], required=True)
    if "mark_text" in body:
        mt = body["mark_text"]
        if isinstance(mt, list):
            mt = "\n".join(str(s) for s in mt)
        new["mark_text"] = _txt(mt, "mark_text", LIMITS["mark_line"], lines=2, required=True)
    if "contact" in body:
        new["contact"] = _txt(body["contact"], "contact", LIMITS["contact"])
    for k in ("accent", "tint"):
        if k in body:
            v = str(body[k] or "").strip().upper()
            if not HEX_RE.match(v):
                raise ApiError("bad_request", "색은 #RRGGBB 형식이어야 합니다", {"key": k})
            new[k] = v
    if "intro" in body:
        ib = body["intro"] or {}
        if not isinstance(ib, dict):
            raise ApiError("bad_request", "소개 글 형식이 맞지 않습니다", {"key": "intro"})
        if "headline" in ib:
            new["intro"]["headline"] = _txt(ib["headline"], "intro.headline", LIMITS["headline_line"], lines=2, required=True)
        if "lines" in ib:
            ls = ib["lines"] or []
            if not isinstance(ls, list) or len(ls) > 3:
                raise ApiError("bad_request", "설명은 세 줄까지 쓸 수 있습니다", {"key": "intro.lines"})
            ls = [_txt(s, f"intro.lines[{i}]", LIMITS["line"]) for i, s in enumerate(ls)]
            ls = [s for s in ls if s]
            if not ls:
                raise ApiError("bad_request", "설명은 한 줄 이상 써 주세요", {"key": "intro.lines"})
            new["intro"]["lines"] = ls
        if "items" in ib:
            it = ib["items"] or {}
            if not isinstance(it, dict) or len(it) > 20:
                raise ApiError("bad_request", "서비스 소개 형식이 맞지 않습니다", {"key": "intro.items"})
            new["intro"]["items"] = {str(k)[:60]: _txt(v, f"intro.items.{k}", LIMITS["item"]) for k, v in it.items() if str(k).startswith("card-")}
    if "services" in body:
        if not p.is_admin:
            raise ApiError("forbidden", "서비스 목록은 LX 관리자가 정합니다")
        sv = body["services"]
        if sv is not None and (not isinstance(sv, list) or len(sv) > 20 or not all(isinstance(s, str) and s.startswith("card-") for s in sv)):
            raise ApiError("bad_request", "서비스 목록 형식이 맞지 않습니다", {"key": "services"})
        new["services"] = list(dict.fromkeys(sv)) if sv else None
    bad = check_colors(new["accent"], new["tint"])
    if bad:
        raise ApiError("bad_request", "기관색이 대비 검사를 통과하지 못했습니다 — 저장하지 않았습니다", {"bad": bad})
    before = {k: (row[k] if k != "intro" else row["intro"]) for k in ("platform", "short", "mark_text", "accent", "tint", "contact", "intro")}
    async with db(p) as conn:
        await conn.execute(
            "INSERT INTO tenant_brand(tenant_id, platform, short, mark_text, accent, tint, contact, intro, services, updated_at, updated_by) "
            "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),$10) ON CONFLICT (tenant_id) DO UPDATE SET platform=EXCLUDED.platform, short=EXCLUDED.short, "
            "mark_text=EXCLUDED.mark_text, accent=EXCLUDED.accent, tint=EXCLUDED.tint, contact=EXCLUDED.contact, intro=EXCLUDED.intro, "
            "services=EXCLUDED.services, updated_at=now(), updated_by=EXCLUDED.updated_by",
            tenant, new["platform"], new["short"], new["mark_text"], new["accent"], new["tint"], new["contact"], new["intro"],
            new["services"], f"{p.realm}:{p.user_id}")
        await audit(conn, p, "brand.update", tenant, before, {k: new[k] for k in before})
    return await _payload(await _tenant(tenant), request)


# ── 마크 그림 ────────────────────────────────────────────────────────────────
def _brand_dir(tenant: str):
    return config.DATA_ROOT / "tenants" / tenant / "brand"


def _normalize_mark(data: bytes) -> bytes:
    """검사 + 다시 저장(PNG · 메타데이터 없음 · 512 안쪽). 걸리면 ApiError."""
    from PIL import Image, UnidentifiedImageError
    try:
        im = Image.open(io.BytesIO(data))
        fmt = (im.format or "").upper()
        w, h = im.size
    except (UnidentifiedImageError, OSError, ValueError):
        raise ApiError("bad_request", "PNG · JPG · WebP 그림만 올릴 수 있습니다")
    if fmt not in MARK_FORMATS:
        raise ApiError("bad_request", "PNG · JPG · WebP 그림만 올릴 수 있습니다")
    if not (MARK_MIN_PX <= w <= MARK_MAX_PX and MARK_MIN_PX <= h <= MARK_MAX_PX):
        raise ApiError("bad_request", f"가로·세로 {MARK_MIN_PX}–{MARK_MAX_PX} 픽셀 그림만 올릴 수 있습니다")
    try:
        im.load()
        im = im.convert("RGBA")
        im.thumbnail((MARK_OUT_PX, MARK_OUT_PX))
        buf = io.BytesIO()
        im.save(buf, "PNG", optimize=True)
    except (OSError, ValueError):
        raise ApiError("bad_request", "그림 파일을 읽을 수 없습니다")
    return buf.getvalue()


@router.post(API + "/brand/{tenant}/mark")
async def put_mark(tenant: str, request: Request, file: UploadFile = File(...)):
    p = _editor(request, tenant)
    row = await _tenant(tenant)
    data = await file.read(MARK_MAX_BYTES + 1)
    if len(data) > MARK_MAX_BYTES:
        raise ApiError("bad_request", "마크 그림은 1MB 이하만 올릴 수 있습니다")
    png = await run_in_threadpool(_normalize_mark, data)
    name = f"mark-{hashlib.sha256(png).hexdigest()[:12]}.png"
    d = _brand_dir(tenant)

    def _write():
        d.mkdir(parents=True, exist_ok=True)
        (d / name).write_bytes(png)
    await run_in_threadpool(_write)
    old = row["mark_file"]
    async with db(p) as conn:
        await conn.execute(
            "INSERT INTO tenant_brand(tenant_id, mark_file, updated_at, updated_by) VALUES ($1,$2,now(),$3) "
            "ON CONFLICT (tenant_id) DO UPDATE SET mark_file=EXCLUDED.mark_file, updated_at=now(), updated_by=EXCLUDED.updated_by",
            tenant, name, f"{p.realm}:{p.user_id}")
        await audit(conn, p, "brand.mark", tenant, {"mark_file": old}, {"mark_file": name})
    if old and old != name and MARK_FILE_RE.match(old):
        try:
            (d / old).unlink(missing_ok=True)
        except OSError:
            pass
    return await _payload(await _tenant(tenant), request)


@router.delete(API + "/brand/{tenant}/mark")
async def del_mark(tenant: str, request: Request):
    p = _editor(request, tenant)
    row = await _tenant(tenant)
    old = row["mark_file"]
    async with db(p) as conn:
        await conn.execute("UPDATE tenant_brand SET mark_file=NULL, updated_at=now(), updated_by=$2 WHERE tenant_id=$1",
                           tenant, f"{p.realm}:{p.user_id}")
        await audit(conn, p, "brand.mark", tenant, {"mark_file": old}, {"mark_file": None})
    if old and MARK_FILE_RE.match(old):
        try:
            (_brand_dir(tenant) / old).unlink(missing_ok=True)
        except OSError:
            pass
    return await _payload(await _tenant(tenant), request)


@router.get("/files/brand/{tenant}/{name}")
async def mark_file(tenant: str, name: str):
    if not TENANT_RE.match(tenant) or not MARK_FILE_RE.match(name):
        raise ApiError("not_found", "파일 없음")
    f = _brand_dir(tenant) / name
    if not f.is_file():
        raise ApiError("not_found", "파일 없음")
    data = await run_in_threadpool(f.read_bytes)
    return Response(content=data, media_type="image/png", headers={"Cache-Control": "public, max-age=604800, immutable",
                                                                    "X-Content-Type-Options": "nosniff"})
