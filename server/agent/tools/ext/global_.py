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
async def pick(args: dict, ctx) -> tuple[dict, bool, list[dict]]:
    """(지역, 값을 볼 수 있는가, 내 지역들). 이름이 없으면 화면 문맥 지역 → 내 지역 첫째."""
    p = ctx.principal
    my = await mine(p)
    q = args.get("region") or (ctx.context or {}).get("district") or (ctx.context or {}).get("region")
    d = find_district(q) if q else None
    if q and not d and args.get("region"):
        raise ToolError("not_found", f"No district named '{args.get('region')}'", 404)
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
    d, ok, my = await pick(args, ctx)
    out = Out(source="Land-XI global results (Sentinel-2 NDVI · land cover)")
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
    d, ok, my = await pick(args, ctx)
    out = Out(source="Land-XI global results (Sentinel-2 NDVI)")
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


def ROUTE(msg: str, ctx):
    p = ctx.principal
    c = ctx.context or {}
    on_global = bool(c.get("country") or c.get("season") or c.get("district")) and p.realm == "lx"
    if not (p.realm == "tenant" and tenant_is_global(p.tenant_id)) and not on_global:
        return None
    q = question_only(msg)
    args: dict = {}
    d = district_in(q)
    if d:
        args["region"] = d["name"]
    m = MONTH_RX.search(q)
    if m:
        args["month"] = m.group(1)
    if LOW_VEG.search(q):
        return {"tool": "global_parcels", "args": args, "intent": "global"}
    if not (GLOBAL_ASK.search(q) or d):
        return None
    if SPRAWL_ASK.search(q):
        args["metric"] = "sprawl"
    elif m or re.search(r"ndvi", q, re.I):
        args["metric"] = "ndvi"
    elif SEASON_ASK.search(q):
        args["metric"] = "season"
    return {"tool": "global_summary", "args": args, "intent": "global"}
