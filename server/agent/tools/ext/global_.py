"""도구 global_summary · global_parcels(C2 ⑦ · C8 해외 결과 · c2-vlm-global) — plan.md 3.1 확장 자리 계약.

해외 첫 화면(landxi/v3/global)이 그리는 값과 **같은 계산**을 서버에서 한다(숫자 한 출처):
  · NDVI 월평균   = 이 기관의 끝난 계절 실행(jobs kind index · 범위 중심이 지역 안)의 index_results 마지막 3건 → 비는 달은 기록 파일(ysykata-ndvi-2025.json)
  · 계절 평균     = 그 계절 달들의 NDVI 월평균 평균(추정)
  · 시가지 변화   = 2017 · 2025 건물 면적(500 m 격자 · 격자가 지역을 90% 이상 덮을 때만) — 화면 Sprawl 탭과 같은 식
  · 낮은 식생     = 그 달 경작지 NDVI 분포(index_results hist)에서 기준 미만 비율 × 경작지 면적(추정)
경계 = landxi/global/data 의 ADM2 파일(화면과 같은 파일). 지역은 변수(지역 이름 하드코딩 0).
허용: 해외 기관(regions.yaml tenants.*.global) · LX. 기관은 자기 배포 범위와 겹치는 지역의 값만 받는다(밖이면 위치만 · 값 0).
결과 지역이 하나면 map_region 으로 지도를 옮기고, NDVI 달을 말하면 map_on(ndvi · 달)으로 그 달 층을 켠다.
"""
from __future__ import annotations

import datetime as dt
import json
import math
import re
from functools import lru_cache
from pathlib import Path

from agent.tools import Out, ToolError

KST = dt.timezone(dt.timedelta(hours=9))
REPO = Path(__file__).resolve().parents[4]
GDATA = REPO / "landxi" / "global" / "data"
V3DATA = REPO / "landxi" / "v3" / "global" / "data"
BOUNDARIES = [   # (나라 iso3, 파일, 이름 키, id 키, 거르기)
    ("KGZ", "kgz-adm2.geojson", lambda p: p.get("name"), lambda p: p.get("code"), lambda p: p.get("level") != "bbox" and p.get("boundary") != "not_acquired"),
    ("MMR", "mm-meiktila-aoi.geojson", lambda p: p.get("locality"), lambda p: "mmr-" + str(p.get("emsr_id") or p.get("area_id")), lambda p: p.get("kind") == "aoi"),
]
SPRAWL_FILES = [GDATA / "kgz-sprawl-2017-2025.json", V3DATA / "kgz-sprawl-ysykata-2017-2025.json"]
NDVI_FILES = [GDATA / "ysykata-ndvi-2025.json"]
COVER_MIN = 0.9
SHARE_MIN = 0.15
SEASON = {3: "Spring", 4: "Spring", 5: "Spring", 6: "Summer", 7: "Summer", 8: "Summer", 9: "Autumn", 10: "Autumn", 11: "Autumn",
          12: "Winter", 1: "Winter", 2: "Winter"}
MONTH_NAMES = {m.lower(): i for i, m in enumerate(["January", "February", "March", "April", "May", "June", "July", "August", "September",
                                                    "October", "November", "December"], 1)}
MONTH_NAMES.update({k[:3]: v for k, v in list(MONTH_NAMES.items())})

REGION = {"type": "string", "description": "해외 지역(district) 이름 — 예: 질문에 나온 지역. 없으면 이 기관의 기본 지역"}
SPECS = {
    "global_summary": {
        "description": "해외(글로벌) 결과 요약 — NDVI 월평균 · 계절 평균 · 시가지(건물 면적) 변화. 해외 지역·NDVI·season·crop·sprawl·built area 질문과 "
                       "'Show/Zoom to <district>' 는 이것으로 답한다(지도를 그 지역으로 옮긴다). Overseas results: NDVI, season, built-area change.",
        "properties": {"region": REGION,
                       "metric": {"type": "string", "enum": ["all", "ndvi", "season", "sprawl"], "description": "보고 싶은 값(기본 all)"},
                       "month": {"type": "string", "description": "달(YYYY-MM 또는 영어 달 이름, 예: June) — NDVI 달"}}},
    "global_parcels": {
        "description": "해외 지역 경작지 중 식생이 낮은 곳(NDVI 기준 미만) 비율·면적 — 'How many fields show low vegetation?' 같은 질문. "
                       "Cropland with low vegetation (NDVI below a threshold) for one month.",
        "properties": {"region": REGION, "month": {"type": "string", "description": "달(YYYY-MM 또는 영어 달 이름) · 없으면 최근 달"},
                       "ndvi_below": {"type": "number", "description": "NDVI 기준(기본 0.2)"}}},
}
HANDLERS: dict = {}
WRITE: set = set()
CONFIRM: set = set()
CLIENT: set = set()
WHY = {"global_summary": "해외 결과 요약(NDVI · 계절 · 시가지 변화)", "global_parcels": "낮은 식생 경작지(NDVI 기준 미만)"}
HINT = ("해외 기관 질문(영어 · 해외 지역 · NDVI · season · sprawl · low vegetation · zoom to a district)은 global_summary 또는 global_parcels 로만 답한다. "
        "지역 이동도 global_summary(region) 가 한다. 영어 질문엔 영어로 답한다.")


# ── 데이터 ─────────────────────────────────────────────────────────────────
def _read(p: Path):
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return None


@lru_cache(maxsize=1)
def districts() -> list[dict]:
    from shapely.geometry import shape
    out = []
    for iso, fn, name, did, keep in BOUNDARIES:
        fc = _read(GDATA / fn) or {}
        for f in fc.get("features") or []:
            pr = f.get("properties") or {}
            if not keep(pr) or not f.get("geometry"):
                continue
            try:
                g = shape(f["geometry"])
            except Exception:
                continue
            b = list(pr.get("bbox") or g.bounds)
            out.append({"id": did(pr), "name": name(pr), "iso": iso, "geom": g, "bbox": [round(x, 5) for x in b]})
    return out


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", re.sub(r"\b(district|rayon|raion|region|city of|\(city\))\b", "", str(s or "").lower()))


def find_district(q: str | None) -> dict | None:
    if not q:
        return None
    n = norm(q)
    if not n:
        return None
    ds = districts()
    for d in ds:
        if norm(d["name"]) == n or d["id"] == q:
            return d
    for d in ds:                                 # 'Ysyk-Ata district' · 'Sokuluk rayon' · 부분 일치(3글자 이상)
        dn = norm(d["name"])
        if len(n) >= 4 and (dn.startswith(n) or n.startswith(dn)):
            return d
    return None


def tenant_is_global(tenant_id: str | None) -> bool:
    try:
        from landxi_api.regions import _cfg
        t = (_cfg().get("tenants") or {}).get(tenant_id or "") or {}
        return bool(t.get("global"))
    except Exception:
        return False


def allowed(name: str, p) -> bool:
    if p.realm == "lx":
        return p.role in ("staff", "admin", "sales")
    return p.realm == "tenant" and tenant_is_global(p.tenant_id)


def _kr(b) -> bool:
    return b[0] >= 124 and b[2] <= 132.5 and b[1] >= 32.5 and b[3] <= 39.5


async def deploy_aois(p) -> list:
    """해외 배포 범위(도형) — 기관 = 자기 배포 · LX = 전부."""
    from shapely.geometry import shape
    from landxi_api.deps import db
    async with db(realm="lx") as conn:
        rows = await conn.fetch("SELECT tenant_id, ST_AsGeoJSON(aoi) g FROM deploys WHERE aoi IS NOT NULL")
    out = []
    for r in rows:
        if p.realm == "tenant" and r["tenant_id"] != p.tenant_id:
            continue
        try:
            g = shape(json.loads(r["g"]))
        except Exception:
            continue
        if _kr(g.bounds):
            continue
        out.append(g)
    if not out and p.realm == "tenant":             # 배포 행이 없으면 기관 지역 프로필 범위(regions.yaml → region_profiles.yaml)
        try:
            from landxi_api import config as gcfg
            from landxi_api.regions import _cfg
            from shapely.geometry import box
            prof = ((_cfg().get("tenants") or {}).get(p.tenant_id) or {}).get("profile")
            pr = (gcfg.load_yaml("region_profiles").get("profiles") or gcfg.load_yaml("region_profiles")).get(prof) or {}
            if pr.get("bbox"):
                out.append(box(*pr["bbox"]))
        except Exception:
            pass
    return out


def share_in(district: dict, aoi) -> float:
    """배포 범위 표본점(12×12) 가운데 지역 안 비율(화면 districtsOf 와 같은 식)."""
    from shapely.geometry import Point
    b = aoi.bounds
    n = hit = 0
    for i in range(12):
        for j in range(12):
            x = b[0] + (i + 0.5) / 12 * (b[2] - b[0])
            y = b[1] + (j + 0.5) / 12 * (b[3] - b[1])
            pt = Point(x, y)
            if not aoi.contains(pt):
                continue
            n += 1
            if district["geom"].contains(pt):
                hit += 1
    return hit / n if n else 0.0


async def mine(p) -> list[dict]:
    """이 세션이 값을 볼 수 있는 지역(배포 범위와 15% 이상 겹침) · 겹침 큰 순."""
    aois = await deploy_aois(p)
    got = []
    for d in districts():
        s = max((share_in(d, a) for a in aois if d["geom"].intersects(a)), default=0.0)
        if s >= SHARE_MIN:
            got.append({**d, "share": s})
    return sorted(got, key=lambda d: -d["share"])


def env(value, unit, basis, source, as_of=None, note=None) -> dict:
    e = {"value": value, "unit": unit, "basis": basis, "as_of": as_of or dt.datetime.now(KST).isoformat(timespec="seconds"), "source": source}
    if note:
        e["note"] = note
    return e


def month_key(s: str | None, available: list[str]) -> str | None:
    if not s:
        return None
    s = str(s).strip()
    m = re.fullmatch(r"(\d{4})-(\d{1,2})", s)
    if m:
        return f"{m.group(1)}-{int(m.group(2)):02d}"
    k = MONTH_NAMES.get(s.lower()) or MONTH_NAMES.get(s.lower()[:3])
    if not k:
        return None
    cands = sorted([a for a in available if int(a[5:7]) == k], reverse=True)
    return cands[0] if cands else None


def season_of(m: str) -> str:
    return f"{SEASON[int(m[5:7])]} {m[:4]}"


async def ndvi_months(d: dict, p) -> dict:
    """{month: {env, hist, crop_px, res_m, job}} — 화면 ndviOf 와 같은 순서(끝난 작업 마지막 3건 → 기록 파일로 빈 달)."""
    from shapely.geometry import shape
    from landxi_api.deps import db
    async with db(realm="lx") as conn:
        jobs = await conn.fetch("SELECT id, tenant_id, finished_at, ST_AsGeoJSON(ST_Centroid(aoi)) c FROM jobs WHERE kind='index' AND state='done' "
                                "AND aoi IS NOT NULL AND NOT coalesce(test,false) ORDER BY finished_at")
        jobs = [j for j in jobs if (p.realm == "lx" or j["tenant_id"] == p.tenant_id) and j["c"] and d["geom"].contains(shape(json.loads(j["c"])))]
        jobs = jobs[-3:]
        rows = await conn.fetch("SELECT job_id, key, metrics, at FROM index_results WHERE job_id = ANY($1::text[]) ORDER BY id",
                                [j["id"] for j in jobs]) if jobs else []
    order = {j["id"]: k for k, j in enumerate(jobs)}
    out: dict = {}
    for r in sorted(rows, key=lambda r: order.get(r["job_id"], 0)):
        m = r["metrics"] or {}
        nd = m.get("ndvi_mean")
        if not isinstance(nd, dict) or nd.get("value") is None:
            continue
        out[r["key"]] = {"env": {**nd, "source": nd.get("source") or "Sentinel-2 NDVI"}, "hist": m.get("hist"), "crop_px": m.get("crop_px"),
                         "res_m": m.get("res_m") or 40, "job": r["job_id"]}
    for f in NDVI_FILES:
        j = _read(f) or {}
        aoi = j.get("aoi")
        if not aoi:
            continue
        cx, cy = (aoi[0] + aoi[2]) / 2, (aoi[1] + aoi[3]) / 2
        from shapely.geometry import Point
        if not d["geom"].contains(Point(cx, cy)):
            continue
        for mo in j.get("months") or []:
            if mo.get("month") and mo["month"] not in out and isinstance(mo.get("ndvi_mean"), dict):
                out[mo["month"]] = {"env": mo["ndvi_mean"], "hist": mo.get("hist"), "crop_px": mo.get("crop_px"), "res_m": 40, "job": None}
    return dict(sorted(out.items()))


def _bbox_km2(b) -> float:
    R, RAD = 6371.0088, math.pi / 180
    return R * R * (b[2] - b[0]) * RAD * (math.sin(b[3] * RAD) - math.sin(b[1] * RAD))


@lru_cache(maxsize=1)
def _grids() -> list[dict]:
    from shapely.geometry import shape
    out = []
    for f in SPRAWL_FILES:
        g = _read(f)
        if not g or not (g.get("grid") or {}).get("features"):
            continue
        cells = []
        for ft in g["grid"]["features"]:
            try:
                b = shape(ft["geometry"]).bounds
            except Exception:
                continue
            pr = ft.get("properties") or {}
            cells.append({"b": b, "c": ((b[0] + b[2]) / 2, (b[1] + b[3]) / 2), "b17": float(pr.get("b17") or 0), "b25": float(pr.get("b25") or 0)})
        dl = (g.get("summary") or {}).get("delta_km2") or {}
        out.append({"bbox": g.get("bbox") or (g.get("source_params") or {}).get("bbox"), "cells": cells,
                    "src": dl.get("source") or "Sentinel-2 land cover 2017 vs 2025", "as_of": dl.get("as_of")})
    return out


def _cover(d: dict, gb) -> float:
    from shapely.geometry import Point
    b = d["bbox"]
    n = hit = 0
    for i in range(48):
        for j in range(48):
            x = b[0] + (i + 0.5) / 48 * (b[2] - b[0])
            y = b[1] + (j + 0.5) / 48 * (b[3] - b[1])
            if not d["geom"].contains(Point(x, y)):
                continue
            n += 1
            if gb[0] <= x <= gb[2] and gb[1] <= y <= gb[3]:
                hit += 1
    return hit / n if n else 0.0


def sprawl(d: dict) -> dict | None:
    """화면 sprawlOf 와 같은 식 — 격자가 지역을 90% 이상 덮을 때만(부분값을 지역 값처럼 두지 않는다)."""
    from shapely.geometry import Point
    best = max(((g, _cover(d, g["bbox"]) if g.get("bbox") else 0.0) for g in _grids()), key=lambda x: x[1], default=(None, 0))
    g, cov = best
    if not g or cov < COVER_MIN:
        return None
    b = d["bbox"]
    a17 = a25 = 0.0
    for c in g["cells"]:
        x, y = c["c"]
        if not (b[0] <= x <= b[2] and b[1] <= y <= b[3]) or not d["geom"].contains(Point(x, y)):
            continue
        a = _bbox_km2(c["b"])
        a17 += c["b17"] / 100 * a
        a25 += c["b25"] / 100 * a
    r1 = lambda v: round(v * 10) / 10  # noqa: E731
    return {"b17": env(r1(a17), "km2", "estimate", g["src"], g["as_of"]), "b25": env(r1(a25), "km2", "estimate", g["src"], g["as_of"]),
            "delta": env(r1(r1(a25) - r1(a17)), "km2", "estimate", g["src"], g["as_of"], "2025 − 2017"), "cover": cov}


# ── 지역 고르기 · 가드 ────────────────────────────────────────────────────────
class Elsewhere(Exception):
    """말한 곳이 해외 구역 목록에 없다(국내 지명 · 모르는 이름) — 값·지도 동작 없이 한 줄로 답한다."""
    def __init__(self, text: str):
        super().__init__(text)
        self.text = text


KR_PLACE = re.compile(r"[가-힣]|\b(namwon|jeonbuk|jeonnam|jeolla\w*|jeonju|korea\w*|seoul|busan|jeju|gyeong\w*|chungcheong\w*|gangwon\w*|incheon|daegu|"
                      r"daejeon|gwangju|ulsan|sejong|yeosu|mokpo|suncheon|gurye|gangjin|sancheong|hamyang)\b|\b[a-z]+-(si|gun|gu|myeon|eup|dong)\b", re.I)


def elsewhere_text(place: str, my: list[dict], ctx) -> str:
    yours = ", ".join(m["name"] for m in my[:3])
    if KR_PLACE.search(place or ""):
        return "이 기관의 데이터가 아닙니다." if getattr(ctx, "lang", "en") == "ko" else "This is not your organization's data."
    if getattr(ctx, "lang", "en") == "ko":
        return f"'{place}' 은(는) 해외 구역 목록에 없습니다" + (f"(이 기관 지역: {yours})." if yours else ".")
    return f"No district named '{place}' was found" + (f" (your districts: {yours})." if yours else ".")


async def pick(args: dict, ctx) -> tuple[dict, bool, list[dict]]:
    """(지역, 값을 볼 수 있는가, 내 지역들). 이름이 없으면 화면 문맥 지역 → 내 지역 첫째.
    말한 이름이 해외 구역에 없으면(국내 지명 포함) Elsewhere — 다른 지역 값으로 대신 답하지 않는다."""
    p = ctx.principal
    my = await mine(p)
    q = args.get("region") or (ctx.context or {}).get("district") or (ctx.context or {}).get("region")
    d = find_district(q) if q else None
    if q and not d and args.get("region"):
        raise Elsewhere(elsewhere_text(str(args.get("region")), my, ctx))
    if d is None:
        if not my:
            raise ToolError("not_found", "No overseas results for this account yet", 404)
        d = my[0]
    ok = p.realm == "lx" or any(m["id"] == d["id"] for m in my)
    return d, ok, my


def outside_text(d: dict, my: list[dict], ctx) -> str:
    yours = ", ".join(m["name"] for m in my[:3])
    if getattr(ctx, "lang", "en") == "ko":
        return f"{d['name']} 은(는) 이 기관의 지역이 아닙니다. 지도에 위치만 보였습니다" + (f"(이 기관 지역: {yours})." if yours else ".")
    return f"{d['name']} is outside your districts, so the map shows its location only" + (f" (your districts: {yours})." if yours else ".")


def region_action(d: dict) -> dict:
    return {"op": "map_region", "name": d["name"], "district_id": d["id"], "country": d["iso"], "bbox": d["bbox"]}


# ── 도구 ───────────────────────────────────────────────────────────────────
async def global_summary(args: dict, ctx) -> Out:
    out = Out(source="Land-XI global results (Sentinel-2 NDVI · land cover)")
    try:
        d, ok, my = await pick(args, ctx)
    except Elsewhere as e:
        out.data = {"status": "outside", "text": e.text}
        out.answer = e.text
        return out
    out.whitelist |= set(re.findall(r"\d+", d["name"]))
    out.ui_actions.append(region_action(d))
    if not ok:
        out.data = {"district": d["name"], "outside_your_districts": True, "your_districts": [m["name"] for m in my],
                    "note": "Map moved to show the location only. No results are shown for districts outside this account."}
        out.answer = outside_text(d, my, ctx)
        return out
    metric = args.get("metric") or "all"
    nd = await ndvi_months(d, ctx.principal)
    months = list(nd)
    data: dict = {"district": d["name"], "country": d["iso"]}
    out.whitelist |= {"2017", "2025"} | {m[:4] for m in months}         # 연도(기간 글자)
    want = month_key(args.get("month"), months) if args.get("month") else None
    if args.get("month") and not want:
        data["month_note"] = f"No NDVI result for {args.get('month')}"
    if metric in ("all", "ndvi", "season") and months:
        show = [want] if want else months
        data["ndvi_mean"] = {}
        for m in show:
            if m in nd:
                k = out.env(f"ndvi_{m}", f"NDVI mean · {d['name']} · {m}", nd[m]["env"])
                data["ndvi_mean"][m] = k
        seasons: dict = {}
        for m in months:
            seasons.setdefault(season_of(m), []).append(nd[m]["env"]["value"])
        if metric in ("all", "season"):
            data["season_mean_ndvi"] = {}
            for s, vs in seasons.items():
                k = out.env("season_" + s.replace(" ", "_"), f"Season mean NDVI · {d['name']} · {s} ({len(vs)} months)",
                            env(round(sum(vs) / len(vs), 3), "ndvi", "estimate", "mean of monthly NDVI means (Sentinel-2)"))
                data["season_mean_ndvi"][s] = k
        on = want or months[-1]
        out.ui_actions.append({"op": "map_on", "set": "ndvi", "month": on, "label": f"NDVI {on}"})
    elif metric in ("all", "ndvi", "season"):
        data["ndvi_mean"] = "No NDVI result yet for this district"
    if metric in ("all", "sprawl"):
        sp = sprawl(d)
        if sp:
            data["built_area"] = {"2017": out.env("built_2017", f"Built area 2017 · {d['name']}", sp["b17"]),
                                  "2025": out.env("built_2025", f"Built area 2025 · {d['name']}", sp["b25"]),
                                  "change": out.env("built_change", f"Built area change 2017→2025 · {d['name']}", sp["delta"])}
            if metric == "sprawl":
                out.ui_actions.append({"op": "map_on", "set": "sprawl", "label": "Built area change"})
        else:
            data["built_area"] = "No built-area result covering this district"
    out.data = data
    return out


async def global_parcels(args: dict, ctx) -> Out:
    out = Out(source="Land-XI global results (Sentinel-2 NDVI)")
    try:
        d, ok, my = await pick(args, ctx)
    except Elsewhere as e:
        out.data = {"status": "outside", "text": e.text}
        out.answer = e.text
        return out
    out.ui_actions.append(region_action(d))
    if not ok:
        out.data = {"district": d["name"], "outside_your_districts": True, "your_districts": [m["name"] for m in my]}
        out.answer = outside_text(d, my, ctx)
        return out
    nd = await ndvi_months(d, ctx.principal)
    months = [m for m in nd if nd[m].get("hist")]
    if not months:
        out.data = {"district": d["name"], "note": "No NDVI result yet for this district"}
        return out
    m = month_key(args.get("month"), months) if args.get("month") else months[-1]
    if not m or m not in nd or not nd[m].get("hist"):
        m = months[-1]
    thr = float(args.get("ndvi_below") or 0.2)
    h = nd[m]["hist"]
    bins, counts = h.get("bins") or [], h.get("counts") or []
    edge = min(bins, key=lambda b: abs(b - thr)) if bins else thr     # 분포 칸 경계로 맞춘다(보간 없음)
    below = sum(c for b, c in zip(bins[:-1], counts) if b < edge - 1e-9)
    total = sum(counts) or 1
    share = below / total
    src = f"Sentinel-2 NDVI · cropland mask · {m}"
    crop_km2 = (nd[m].get("crop_px") or 0) * ((nd[m].get("res_m") or 40) / 1000) ** 2
    k_share = out.env("low_share", f"Share of cropland observations with NDVI < {edge:g} · {d['name']} · {m}",
                      env(round(share * 100, 1), "%", "estimate", src, nd[m]["env"].get("as_of"), "pixel-scene observations"))
    data = {"district": d["name"], "month": m, "ndvi_below": edge, "low_vegetation_share": k_share}
    out.whitelist |= {f"{edge:g}", f"{thr:g}", m[:4]}                 # 기준값·연도는 질문·도구 글자(검증기 통과)
    if crop_km2 > 0:
        data["cropland_area"] = out.env("crop_km2", f"Cropland area (mask) · {d['name']}", env(round(crop_km2, 1), "km2", "measured", src, nd[m]["env"].get("as_of")))
        data["low_vegetation_area"] = out.env("low_km2", f"Cropland with NDVI < {edge:g} · {d['name']} · {m}",
                                              env(round(crop_km2 * share, 1), "km2", "estimate", src, nd[m]["env"].get("as_of"), "share × cropland area"))
    data["note"] = "Field boundaries are not mapped for this district — results are cropland area, not a count of fields."
    out.ui_actions.append({"op": "map_on", "set": "ndvi", "month": m, "label": f"NDVI {m}"})
    out.data = data
    return out


HANDLERS.update({"global_summary": global_summary, "global_parcels": global_parcels})

# ── 직행(ROUTE · plan 3.1) — 해외 기관(또는 해외 화면의 LX)의 질문을 모델 앞에서 해외 결과 도구로 ──
LOW_VEG = re.compile(r"low\s+(vegetation|ndvi|greenness)|poor\s+(crop|growth|vegetation)|stress|bare|how many (fields|parcels|plots)|낮은\s*식생|식생이?\s*낮", re.I)
GLOBAL_ASK = re.compile(r"ndvi|vegetation|crop|season|sprawl|built|urban|construction|report|summary|summar|zoom|show|go to|move|fly|district|"
                        r"식생|작황|계절|시가지|건물 면적|보고서|요약|이동|보여", re.I)
SPRAWL_ASK = re.compile(r"sprawl|built|urban|construction|building|시가지|건물", re.I)
SEASON_ASK = re.compile(r"season|crop condition|계절|작황", re.I)
MONTH_RX = re.compile(r"\b(\d{4}-\d{2}|jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sep(t|tember)?|oct(ober)?|nov(ember)?|dec(ember)?)\b", re.I)


AREA_HINT = re.compile(r"\s*\((?:Current area|Area):[^()]*\)\s*$", re.I)


def question_only(msg: str) -> str:
    """해외 화면이 붙이는 문맥 꼬리('(Current area: …)')를 떼고 질문만(지역 이름 오인 방지)."""
    return AREA_HINT.sub("", str(msg or "").split(chr(10) + "(")[0]).strip()


def district_in(q: str) -> dict | None:
    for d in sorted(districts(), key=lambda d: -len(d["name"] or "")):
        nm = str(d["name"] or "")
        if not nm:
            continue
        pat = r"(?<![A-Za-z])" + re.escape(nm).replace(r"\-", "[- ]?").replace(r"\ ", "[- ]?") + r"(?![A-Za-z])"
        if re.search(pat, q, re.I):
            return d
    return None


def _fmt(tpl: str, **k) -> str:
    """'{{key}}' 자리표 글 — k 의 봉투 key 를 {{key}} 로 넣는다(러너가 {{env:eN}} 으로 바꾼다)."""
    return tpl.format(**{n: "{{" + v + "}}" for n, v in k.items()})


# ── 말로 지도 제어(M4 · r3-global) — 해외 화면 전용 도구 global_map ────────────────────────────────
# 지도 동작만 있는 짧은 문장은 모델 앞에서 이 도구로 간다(NDVI 요약으로 새지 않음 · 토큰 0). 답은 동작 한 줄뿐이고 숫자는 없다.
# 동작 성공 여부는 화면이 kit:agent-action-done {op, ok, reason} 으로 알린다(plan 3.1). 실패 문장 교체는 명령 바(r3-route) 몫.
LAYERS = {"imagery": "imagery layer", "results": "results layer", "districts": "district boundaries", "mismatch": "mismatched districts"}
LAYERS_KO = {"imagery": "영상 층", "results": "결과 층", "districts": "구역 경계", "mismatch": "어긋난 구역"}
SPECS["global_map"] = {
    "description": "해외 지도 동작 — Zoom in/out · turn the imagery (satellite) layer off/on · tilt to 3D / top view · go to a district. "
                   "Overseas map control only: no numbers.",
    "properties": {"op": {"type": "string", "enum": ["zoom", "layer", "view", "goto"]},
                   "delta": {"type": "number", "description": "zoom steps (+ in, - out)"},
                   "zoom": {"type": "number", "description": "absolute zoom level"},
                   "layer": {"type": "string", "enum": [*LAYERS, "last"], "description": "last = the layer changed in the previous answer"},
                   "on": {"type": "boolean"},
                   "preset": {"type": "string", "enum": ["3d", "top"]},
                   "region": {"type": "string", "description": "district name for op goto (or zoom in/out on a district)"}},
    "required": ["op"]}
WHY["global_map"] = "해외 지도 동작(확대·층·시점·이동)"
SAY = {"global_map": "Map control", "global_mismatch": "Compare register and AI", "global_findings": "Summarize findings"}

D_IN = re.compile(r"\bzoom(?:\s+the\s+map)?\s+in\b|\bzoom\s*-?in\b|\bcloser\b|\bmagnify\b|확대|줌\s*인", re.I)
D_OUT = re.compile(r"\bzoom(?:\s+the\s+map)?\s+out\b|\bzoom\s*-?out\b|\bfurther\s+out\b|\bwider\s+view\b|축소|줌\s*아웃", re.I)
Z_ABS = re.compile(r"\bzoom(?:\s+level)?(?:\s+to)?\s+(\d{1,2}(?:\.\d)?)\b|줌\s*(\d{1,2})", re.I)
MORE = re.compile(r"\bmore\b|\ba lot\b|\bfurther\b|많이", re.I)
V_3D = re.compile(r"\btilt|\b3\s*-?d\b|three[- ]d|perspective|\boblique|입체|기울", re.I)
V_TOP = re.compile(r"top[- ]?down|\btop\s+view|\bflat\b|\b2\s*-?d\b|straight\s+down|reset\s+(the\s+)?(tilt|view|pitch)|\buntilt|평면|위에서", re.I)
L_OFF = re.compile(r"\b(turn|switch|shut)\s+(\w+\s+){0,3}?off\b|\bhide\b|\bremove\b|\bdisable\b|\bwithout\b|꺼|끄|숨겨", re.I)
L_ON = re.compile(r"\b(turn|switch)\s+(\w+\s+){0,3}?(back\s+)?on\b|\bbring\s+(\w+\s+)?back\b|\benable\b|\brestore\b|\bshow\b|\bdisplay\b|켜|보이게|다시", re.I)
L_NAME = [("mismatch", re.compile(r"mismatch|어긋", re.I)),
          ("imagery", re.compile(r"imager|satellite|\bimage\b|base\s*map|\bphoto|영상|위성", re.I)),
          ("results", re.compile(r"\bresults?\s+layer|\bndvi\s+layer|\boverlay|결과\s*층", re.I)),
          ("districts", re.compile(r"boundar|border|district\s+lines|경계", re.I))]
L_PRON = re.compile(r"\bit\b|\bthat\b|\bthe\s+layer\b|\bback\s+on\b|다시\s*켜", re.I)
BACK_ON = re.compile(r"back\s+on|다시\s*켜", re.I)
GOTO = re.compile(r"\b(go|move|fly|pan|jump|navigate|head|return)\s+(back\s+)?(over\s+)?to\b|\btake\s+me\s+(back\s+)?to\b|"
                  r"\bcenter\s+(the\s+map\s+)?on\b|\bshow\s+me\s+where\b|로\s*이동|으로\s*이동|로\s*가\s*줘|으로\s*가\s*줘", re.I)
DATA_ASK = re.compile(r"ndvi|vegetation|crop|season|sprawl|built|urban|construction|how\s+many|how\s+much|summar|report|average|mean|chang|"
                      r"mismatch|match|register|declared|finding|list\b|describe|compare|value|result(?!s?\s+layer)|area\b|식생|작황|요약|보고서|몇|어긋|대장", re.I)
DATA_STRONG = re.compile(r"ndvi|vegetation|crop|sprawl|built|how\s+many|summar|mismatch|register", re.I)


# 'Zoom in on Ak-Suu' · 'zoom out to Sokuluk' · 'zoom into Ak-Suu' — 지명이 붙은 확대(실증 must_fix 1). 'Zoom to {구역}'(in/out 없음)은 기존 계약(값 요약).
ZOOM_AT = re.compile(r"\bzoom(?:\s+the\s+map)?\s+(?:(?P<dir>in|out)\s+(?:on|to|at|onto|over|around|towards?|into)|(?P<into>into))\s+(?P<place>.+)$", re.I)
PLACE_TAIL = re.compile(r"\s+(please|a\s+little|a\s+bit|slightly|more|a\s+lot|now|for\s+me)\s*$", re.I)
NOT_PLACE = re.compile(r"^(the\s+|this\s+|that\s+|my\s+|our\s+|current\s+)*(map|it|this|that|here|there|area|view|screen|cent(er|re)|middle|image|imagery|"
                       r"satellite(\s+imagery)?|district|region|rayon|place|location|spot|field|fields|a\s+little|a\s+bit|more|further|slightly|closer)$", re.I)


def zoom_place(t: str) -> tuple[int, str] | None:
    """'zoom in/out on|to|at {이름}' → (방향 ±1, 이름). 이름이 지도·이것 같은 말이면 None(그냥 확대)."""
    m = ZOOM_AT.search(t)
    if not m:
        return None
    place = re.split(r"[.?!,;]| and | then ", m.group("place"))[0].strip()
    for _ in range(3):
        place = PLACE_TAIL.sub("", place).strip()
    place = re.sub(r"^the\s+", "", place, flags=re.I).strip()
    if not place or NOT_PLACE.match(place):
        return None
    return (-1 if (m.group("dir") or "").lower() == "out" else 1), place


def _place_after_goto(q: str) -> str:
    m = GOTO.search(q)
    if not m:
        return ""
    rest = q[m.end():].strip()
    rest = re.split(r"[.?!,;]| and | then ", rest)[0]
    return re.sub(r"^(the\s+)|(\s+(district|rayon|raion|region))$", "", rest.strip(), flags=re.I).strip()


async def last_layer(ctx) -> str | None:
    """'Turn it back on' — 같은 사람의 앞 답(화면이 준 prev_run 까지)이 끈·켠 층."""
    p = ctx.principal
    uid = getattr(p, "user_id", None)
    if not uid:
        return None
    prev = str((ctx.context or {}).get("prev_run") or "").strip()
    try:
        from landxi_api.deps import db
        async with db(realm="lx") as conn:
            rows = await conn.fetch(
                "SELECT t.args FROM agent_tool_calls t JOIN agent_runs r ON r.id=t.run_id WHERE t.tool='global_map' AND r.user_id=$1 "
                "AND r.id<>$2 AND ($3='' OR r.created_at <= (SELECT created_at FROM agent_runs WHERE id=$3)) "
                "AND r.created_at > now() - interval '2 hours' ORDER BY r.created_at DESC, t.i DESC LIMIT 6", uid, ctx.run_id or "", prev)
    except Exception:
        return None
    for r in rows:
        a = r["args"] if isinstance(r["args"], dict) else (json.loads(r["args"]) if r["args"] else {})
        if a.get("op") == "layer" and a.get("layer") in LAYERS:
            return a["layer"]
    return None


def map_command(q: str, ctx) -> dict | None:
    """지도 동작 한 가지만 있는 문장 → global_map 인자. 자료 질문 낱말이 섞이면 None(해외 결과 도구 · 모델)."""
    t = re.sub(r"\s+", " ", q or "").strip()
    if not t or len(t) > 90:
        return None
    goto = GOTO.search(t)
    if DATA_ASK.search(t) and not (goto and not DATA_STRONG.search(t)):
        return None
    cand: list[dict] = []
    if goto:
        cand.append({"op": "goto", "region": (district_in(t) or {}).get("name") or _place_after_goto(t)})
    elif zoom_place(t) and not Z_ABS.search(t):
        sign, place = zoom_place(t)
        if re.fullmatch(r"\d{1,2}(?:\.\d)?", place):
            cand.append({"op": "zoom", "zoom": float(place)})
        else:
            cand.append({"op": "zoom", "delta": sign * (2 if MORE.search(t) else 1), "region": (district_in(t) or {}).get("name") or place})
    else:
        m = Z_ABS.search(t)
        if m:
            cand.append({"op": "zoom", "zoom": float(m.group(1) or m.group(2))})
        elif D_IN.search(t):
            cand.append({"op": "zoom", "delta": 2 if MORE.search(t) else 1})
        elif D_OUT.search(t):
            cand.append({"op": "zoom", "delta": -2 if MORE.search(t) else -1})
    if V_3D.search(t):
        cand.append({"op": "view", "preset": "3d"})
    elif V_TOP.search(t):
        cand.append({"op": "view", "preset": "top"})
    off, on = L_OFF.search(t), L_ON.search(t)
    if off or on:
        layer = next((k for k, rx in L_NAME if rx.search(t)), None)
        if layer is None and L_PRON.search(t):
            layer = "last"                           # 'Turn it back on' — 도구가 앞 답이 바꾼 층으로 푼다(없으면 영상 층)
        if layer:
            cand.append({"op": "layer", "layer": layer, "on": (not off) or bool(BACK_ON.search(t))})
    if len(cand) != 1:
        return None
    return cand[0]


def _say(ctx, en: str, ko: str) -> str:
    return ko if getattr(ctx, "lang", "en") == "ko" else en


async def global_map(args: dict, ctx) -> Out:
    op = args.get("op")
    out = Out(source="Map action (browser)")
    if op == "zoom" and str(args.get("region") or "").strip():
        # 지명이 붙은 확대 — 지명부터 푼다. 관할이면 그 구역으로 옮긴 뒤 확대(동작 하나 · 끝 신호 하나), 관할 밖 해외 구역이면 위치만 + 가드 한 줄,
        # 국내 지명·모르는 이름이면 지도를 움직이지 않고 거절한다(지금 구역을 확대하고 성공이라 말하지 않는다).
        p = ctx.principal
        my = await mine(p)
        place = str(args["region"]).strip()
        d = find_district(place) or district_in(place)
        if not d:
            out.data = {"status": "outside" if KR_PLACE.search(place) else "not_found", "text": elsewhere_text(place, my, ctx)}
            out.answer = out.data["text"]
            return out
        out.whitelist |= set(re.findall(r"\d+", d["name"]))
        delta = max(-4.0, min(4.0, float(args.get("delta") or 1)))
        if p.realm == "lx" or any(m["id"] == d["id"] for m in my):
            out.ui_actions.append({**region_action(d), "zoom_delta": delta})
            out.answer = _say(ctx, f"Moved the map to {d['name']} and zoomed {'in' if delta > 0 else 'out'}.",
                              f"지도를 {d['name']}(으)로 옮겨 {'확대' if delta > 0 else '축소'}했습니다.")
        else:
            out.ui_actions.append(region_action(d))
            out.data = {"status": "outside", "text": outside_text(d, my, ctx)}
            out.answer = out.data["text"]
        out.data = out.data or {"op": op, "district": d["name"], "done": "sent to the map"}
        return out
    if op == "zoom":
        a = {"op": "map_zoom"}
        if args.get("zoom") is not None:
            a["zoom"] = max(1.0, min(18.0, float(args["zoom"])))
            out.answer = _say(ctx, "Zoomed the map to the requested level.", "요청한 줌 단계로 지도를 맞췄습니다.")
        else:
            a["delta"] = max(-4.0, min(4.0, float(args.get("delta") or 1)))
            out.answer = _say(ctx, "Zoomed in." if a["delta"] > 0 else "Zoomed out.", "지도를 확대했습니다." if a["delta"] > 0 else "지도를 축소했습니다.")
        out.ui_actions.append(a)
    elif op == "view":
        pre = args.get("preset") if args.get("preset") in ("3d", "top") else "3d"
        out.ui_actions.append({"op": "map_view", "preset": pre, "pitch": 55.0 if pre == "3d" else 0.0, "bearing": -14.0 if pre == "3d" else 0.0})
        out.answer = _say(ctx, "Tilted the map to 3D." if pre == "3d" else "Back to the top view.",
                          "지도를 입체(3D)로 기울였습니다." if pre == "3d" else "위에서 보는 시점으로 돌렸습니다.")
    elif op == "layer":
        layer = args.get("layer")
        if layer not in LAYERS:
            layer = (await last_layer(ctx) if layer == "last" else None) or "imagery"
        args["layer"] = layer
        on = args.get("on")
        on = True if on is None else (on if isinstance(on, bool) else str(on).lower() not in ("false", "0", "off"))
        out.ui_actions.append({"op": "map_layer", "layer": layer, "on": on})
        out.answer = _say(ctx, f"Turned the {LAYERS[layer]} {'on' if on else 'off'}.", f"{LAYERS_KO[layer]}을 {'켰' if on else '껐'}습니다.")
    elif op == "goto":
        p = ctx.principal
        my = await mine(p)
        place = str(args.get("region") or "").strip()
        d = find_district(place) if place else None
        if not d:
            out.data = {"status": "outside" if KR_PLACE.search(place) else "not_found", "text": elsewhere_text(place or "?", my, ctx)}
            out.answer = out.data["text"]
            return out
        out.ui_actions.append(region_action(d))
        out.whitelist |= set(re.findall(r"\d+", d["name"]))
        if p.realm == "lx" or any(m["id"] == d["id"] for m in my):
            out.answer = _say(ctx, f"Moved the map to {d['name']}.", f"지도를 {d['name']}(으)로 옮겼습니다.")
        else:
            out.data = {"status": "outside", "text": outside_text(d, my, ctx)}
            out.answer = out.data["text"]
    else:
        raise ToolError("bad_request", "op is zoom|layer|view|goto")
    out.data = out.data or {"op": op, "done": "sent to the map"}
    return out


# ── 구역 대장 × AI 대조(C4 최소) · 어긋난 구역·요약(C3 최소) — 값은 landxi_api.global_data 한 곳에서 ────────
SPECS["global_mismatch"] = {
    "description": "Uploaded district register vs AI cropland — how many districts don't match, which ones (declared vs AI, difference). "
                   "구역 대장과 AI 경작지 면적 대조 — 어긋난 구역 수·목록.",
    "properties": {"list": {"type": "boolean", "description": "list the mismatched districts"},
                   "region": {"type": "string", "description": "only this district"}}}
SPECS["global_findings"] = {
    "description": "One-paragraph English summary of this organization's overseas findings: register comparison + NDVI + built-area change. "
                   "해외 결과 요약 한 단락.",
    "properties": {}}
WHY["global_mismatch"] = "구역 대장 × AI 대조"
WHY["global_findings"] = "해외 결과 요약(한 단락)"


async def _register(ctx):
    from landxi_api import global_data as GD
    reg, rows = await GD.load(ctx.principal)
    return GD.view(reg, rows, with_geom=False) if reg else None


def _no_register(ctx) -> str:
    return _say(ctx, "No district register has been uploaded from this account yet. Open the Register tab on the map and upload a CSV or XLSX "
                     "with district names and declared cropland (ha).",
                "이 계정에서 올린 구역 대장이 아직 없습니다. 지도의 Register 탭에서 구역 이름과 신고 농지 면적(ha)이 든 CSV·XLSX 를 올려 주세요.")


ROW_KEYS = {"rows", "matched", "outside", "unmatched"}
DIST_KEYS = {"compared", "mismatched"}


def _pl(n, one: str, many: str) -> str:
    return one if n == 1 else many


def _reg_envs(out: Out, v: dict, ctx=None) -> dict:
    """대장 요약 봉투 — 단위는 명령 바 칩이 읽는 말로(행 · 구역). 값은 global_data 한 곳."""
    s = v["summary"]
    ko = getattr(ctx, "lang", "en") == "ko"

    def u(k):
        e = dict(s[k])
        if k in ROW_KEYS:
            e["unit"] = "행"
        elif k in DIST_KEYS:
            e["unit"] = "곳" if ko else "districts"
        return e
    return {k: out.env("reg_" + k, m, u(k)) for k, m in (
        ("rows", "Rows in the uploaded register"), ("matched", "Rows matched to a local district"), ("match_pct", "Share of rows matched"),
        ("compared", "Districts compared (in your area, both values)"), ("mismatched", "Districts that don't match"),
        ("outside", "Rows outside your districts (not compared)"), ("unmatched", "Rows with no matching district"),
        ("threshold", "Mismatch threshold"))}


def _mis_items(out: Out, v: dict, only: dict | None = None) -> list[dict]:
    got = []
    for it in v["items"]:
        if it["status"] != "mismatch" or (only and it.get("district_id") != only["id"]):
            continue
        k = len(got)
        got.append({"name": it["district"], "declared": out.env(f"mis{k}_declared", f"Declared cropland · {it['district']}", it["declared"]),
                    "ai": out.env(f"mis{k}_ai", f"AI cropland · {it['district']}", it["ai"]),
                    "diff": out.env(f"mis{k}_diff", f"AI - declared · {it['district']}", it["diff"])})
        out.whitelist |= set(re.findall(r"\d+", it["district"] or ""))
    return got


async def global_mismatch(args: dict, ctx) -> Out:
    out = Out(source="District register × AI land cover")
    v = await _register(ctx)
    if not v:
        out.data = {"status": "no_data", "text": _no_register(ctx)}
        out.answer = out.data["text"]
        return out
    only = None
    if args.get("region"):
        my = await mine(ctx.principal)
        only = find_district(args["region"])
        if not only:
            out.answer = elsewhere_text(str(args["region"]), my, ctx)
            out.data = {"status": "outside" if KR_PLACE.search(str(args["region"])) else "not_found", "text": out.answer}
            return out
        if ctx.principal.realm != "lx" and not any(m["id"] == only["id"] for m in my):
            out.ui_actions.append(region_action(only))          # 답이 말하는 '위치만 보였다'를 실제로 한다(실증 must_fix 2)
            out.answer = outside_text(only, my, ctx)
            out.data = {"status": "outside", "text": out.answer}
            return out
    k = _reg_envs(out, v, ctx)
    s = {x: (v["summary"][x] or {}).get("value") for x in v["summary"]}
    mis = _mis_items(out, v, only)
    if s["compared"] == 0:
        en = ("None of the rows are in your districts, so nothing was compared" if s["outside"] else "No district in the register could be compared")
        en += _fmt(" ({o} outside your districts).", o=k["outside"]) if s["outside"] else "."
        ko = "관할 구역 안의 행이 없어 비교하지 못했습니다" + (_fmt("(관할 밖 {o}행).", o=k["outside"]) if s["outside"] else ".")
    else:
        en = _fmt("{m} " + _pl(s["mismatched"], "district doesn't", "districts don't") + " match out of {c} " + _pl(s["compared"], "district", "districts")
                  + " compared — the AI cropland area differs from the declared area by more than {t}.", m=k["mismatched"], c=k["compared"], t=k["threshold"])
        ko = _fmt("비교한 {c}개 구역 중 {m}개가 어긋납니다(AI 경작지 면적이 신고 면적과 {t} 넘게 차이).", m=k["mismatched"], c=k["compared"], t=k["threshold"])
        if mis:
            en += " " + "; ".join(m["name"] + _fmt(": declared {d}, AI {a} ({p})", d=m["declared"], a=m["ai"], p=m["diff"]) for m in mis[:5]) + "."
            ko += " " + "; ".join(m["name"] + _fmt(": 신고 {d}, AI {a}({p})", d=m["declared"], a=m["ai"], p=m["diff"]) for m in mis[:5]) + "."
        if s["outside"]:
            en += _fmt(" {o} " + _pl(s["outside"], "row", "rows") + " outside your districts " + _pl(s["outside"], "was", "were") + " not compared.", o=k["outside"])
            ko += _fmt(" 관할 밖 {o}행은 비교하지 않았습니다.", o=k["outside"])
    en += " District level, not parcels."
    ko += " 필지가 아닌 구역 단위입니다."
    out.answer = _say(ctx, en, ko)
    out.data = {"register": v["register"]["filename"], "summary": k, "mismatched": [m["name"] for m in mis], "level": "district"}
    out.ui_actions.append({"op": "map_on", "set": "mismatch", "label": "Mismatched districts", "register_id": v["register"]["id"]})
    return out


async def global_findings(args: dict, ctx) -> Out:
    """한 단락 — 대장 대조(있으면) + 내 구역 NDVI 최근 달 + 시가지 변화. 숫자는 전부 이 도구의 봉투."""
    out = Out(source="Land-XI global results")
    p = ctx.principal
    my = await mine(p)
    en, ko = [], []
    v = await _register(ctx)
    if v:
        k = _reg_envs(out, v, ctx)
        mis = _mis_items(out, v)
        sv = {x: (v["summary"][x] or {}).get("value") for x in v["summary"]}
        en.append(_fmt("The uploaded district register has {r} " + _pl(sv["rows"], "row", "rows") + "; {m} matched local district names ({p}).",
                       r=k["rows"], m=k["matched"], p=k["match_pct"]))
        ko.append(_fmt("올린 구역 대장 {r}행 중 {m}행이 현지 구역 이름과 맞았습니다({p}).", r=k["rows"], m=k["matched"], p=k["match_pct"]))
        lst_en = "; ".join(m["name"] + _fmt(" (declared {d}, AI {a}, {p})", d=m["declared"], a=m["ai"], p=m["diff"]) for m in mis[:3])
        lst_ko = "; ".join(m["name"] + _fmt(" 신고 {d}, AI {a}, {p}", d=m["declared"], a=m["ai"], p=m["diff"]) for m in mis[:3])
        en.append(_fmt("Of {c} " + _pl(sv["compared"], "district", "districts") + " compared with the AI cropland map, {m} " + _pl(sv["mismatched"], "district differs", "districts differ")
                       + " from the declared area by more than {t}", c=k["compared"], m=k["mismatched"], t=k["threshold"]) + (": " + lst_en if mis else "") + ".")
        ko.append(_fmt("AI 경작지 지도와 비교한 {c}개 구역 중 {m}개가 신고 면적과 {t} 넘게 다릅니다", c=k["compared"], m=k["mismatched"], t=k["threshold"])
                  + ("(" + lst_ko + ")" if mis else "") + ".")
        if (v["summary"]["outside"] or {}).get("value"):
            en.append(_fmt("{o} " + _pl(sv["outside"], "row", "rows") + " outside your districts " + _pl(sv["outside"], "was", "were") + " not compared.", o=k["outside"]))
            ko.append(_fmt("관할 밖 {o}행은 비교하지 않았습니다.", o=k["outside"]))
        out.ui_actions.append({"op": "map_on", "set": "mismatch", "label": "Mismatched districts", "register_id": v["register"]["id"]})
    for d in my[:2]:
        nd = await ndvi_months(d, p)
        if nd:
            m = list(nd)[-1]
            e = out.env("ndvi_last_" + re.sub(r"\W", "", d["id"])[-6:], f"NDVI mean · {d['name']} · {m}", nd[m]["env"])
            mon = dt.date(int(m[:4]), int(m[5:7]), 1).strftime("%b %Y")
            out.whitelist |= {m[:4]}
            en.append(f"In {d['name']}, the latest NDVI mean was " + _fmt("{e}", e=e) + f" ({mon}).")
            ko.append(f"{d['name']}의 최근 NDVI 평균은 " + _fmt("{e}", e=e) + f"입니다({m}).")
        sp = sprawl(d)
        if sp:
            e = out.env("built_change_" + re.sub(r"\W", "", d["id"])[-6:], f"Built area change 2017→2025 · {d['name']}", sp["delta"])
            out.whitelist |= {"2017", "2025"}
            en.append("Built area changed by " + _fmt("{e}", e=e) + " from 2017 to 2025.")
            ko.append("건물 면적은 2017→2025 사이 " + _fmt("{e}", e=e) + " 변했습니다.")
    if not en:
        out.data = {"status": "no_data", "text": _no_register(ctx)}
        out.answer = out.data["text"]
        return out
    names = ", ".join(m["name"] for m in my[:3])
    lead_en = f"Findings for {names or 'your districts'} (district level, not parcels): "
    lead_ko = f"{names or '관할 구역'} 결과 요약(필지가 아닌 구역 단위): "
    out.answer = _say(ctx, lead_en + " ".join(en), lead_ko + " ".join(ko))
    out.data = {"districts": [m["name"] for m in my[:3]], "has_register": bool(v)}
    return out


HANDLERS.update({"global_map": global_map, "global_mismatch": global_mismatch, "global_findings": global_findings})

REG_ASK = re.compile(r"(don'?t|do\s+not|doesn'?t|not)\s+match|mismatch|discrepan|register|ledger|declared|reported\s+(area|cropland)|어긋|대장|불일치", re.I)
REG_LIST = re.compile(r"\bshow\b|\blist\b|\bwhich\b|\bwhat\s+are\b|\bname\b|보여|목록|어느|어떤", re.I)
FIND_ASK = re.compile(r"summar\w*\s+(the\s+|my\s+|our\s+)?(findings|results?|register|comparison)|\bfindings\b|overall\s+summary|결과\s*요약", re.I)


def ROUTE(msg: str, ctx):
    p = ctx.principal
    c = ctx.context or {}
    on_global = bool(c.get("country") or c.get("season") or c.get("district")) and p.realm == "lx"
    if not (p.realm == "tenant" and tenant_is_global(p.tenant_id)) and not on_global:
        return None
    q = question_only(msg)
    mc = map_command(q, ctx)                # 지도 동작만 있는 문장 — NDVI 요약으로 새지 않는다(M4)
    if mc:
        return {"tool": "global_map", "args": mc, "intent": "map"}
    args: dict = {}
    d = district_in(q)
    if d:
        args["region"] = d["name"]
    else:
        kr = KR_PLACE.search(q)                     # 국내 지명(한글 · 로마자) — 해외 도구가 '이 기관의 데이터가 아닙니다'로 막는다
        if kr:
            args["region"] = q[:40] if re.search(r"[가-힣]", q) else kr.group(0)
    if FIND_ASK.search(q) and "region" not in args:
        return {"tool": "global_findings", "args": {}, "intent": "global"}
    if REG_ASK.search(q):
        return {"tool": "global_mismatch", "args": {**({"region": args["region"]} if args.get("region") else {}),
                                                     "list": bool(REG_LIST.search(q))}, "intent": "global"}
    m = MONTH_RX.search(q)
    if m:
        args["month"] = m.group(1)
    if LOW_VEG.search(q):
        return {"tool": "global_parcels", "args": args, "intent": "global"}
    if not (GLOBAL_ASK.search(q) or d or args.get("region")):
        return None
    if SPRAWL_ASK.search(q):
        args["metric"] = "sprawl"
    elif m or re.search(r"ndvi", q, re.I):
        args["metric"] = "ndvi"
    elif SEASON_ASK.search(q):
        args["metric"] = "season"
    return {"tool": "global_summary", "args": args, "intent": "global"}
