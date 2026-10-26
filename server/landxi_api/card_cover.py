"""카드 그림 한 쌍(10-25 원칙 339) — 결과 하나 + 지도 틀 → 같은 틀의 '원본' · 'AI 결과' 그림 두 장(1200×900 · 4:3).

  POST /api/v1/cards/{cid}/cover   {source, bbox:[서,남,동,북](경위도), save?, caption?, region?, minconf?, minm2?, classes?}
     source = {"job": id} | {"jobs": [id, …]}        — 탐지 결과(작업의 영상 위) · 국토 변화(그 작업의 두 해) · 두 시기 비교(두 영상)
            | {"layer": "결과 geojson 경로", "imagery": 영상 id}   — 파일로 남은 결과 층
            | {"parcels": 시군구 코드, "imagery": 영상 id}        — 경작 · 휴경 필지 판정(필지 조사 표)
     save=false(기본) → 미리보기 {base, result(data:image/jpeg), labels, legend, frame}
     save=true        → 두 장을 카드 장면으로 저장(장면 올리기와 같은 길 · 예전 그림은 장면 목록에 남음) · 카드 그림 = 결과 ·
                        swipe = {before, after, labels, legend} (분석 서비스 갤러리 · 자세히의 밀어 보기)

틀: 받은 범위의 가운데를 지키고 4:3 으로 넓힌다. 사람 결과가 든 틀은 너비 200 m 이상(사람이 2~4 픽셀 점 — 얼굴 · 사람을 알아볼 수 없게 · 원칙 331).
사람은 작은 점으로(밀집 칸 히트맵을 그리지 않음 · 10-26 '관광지 안전관리(히트맵 X)').
색: XI맵 결과 색과 같은 표(xi-clean/board.js NAMED · kit/change-layer.js TYPES) — 화면 색일 뿐.
"""
from __future__ import annotations

import base64
import io
import json
import re
from pathlib import Path

from starlette.concurrency import run_in_threadpool

from . import config
from .deps import ApiError

W, H = 1200, 900
MIN_PEOPLE_W = 200.0          # 사람 결과 틀의 최소 너비(m) — 1200 px 에 17 cm/px 보다 거칠게
MAX_W = 4000.0                # 틀 최대 너비(m) — 한 장 그림 크기를 넘지 않게
PEOPLE = {"사람", "person", "people", "pedestrian", "보행자"}
# XI맵 결과 색(xi-clean/board.js NAMED · national.js NCOLOR) + 카드에서 쓰던 찾는 것 색 + 국토 변화 · 산사태 유형 색(kit/change-layer.js)
COLOR = {"경작지": "#2E9E5B", "경작": "#2E9E5B", "휴경": "#E8590C", "비닐하우스": "#F59F00", "비닐하우스_단동": "#F59F00", "비닐하우스_다동": "#5C7CFA",
         "건물": "#3182F6", "건축물": "#3182F6", "주차장": "#8B5CF6", "곤포사일리지": "#B07A3A", "해양쓰레기": "#0FA9A0", "styrofoam": "#0FA9A0",
         "차량": "#3182F6", "IRG": "#74B816", "호밀": "#E8590C", "옥수수": "#F59F00", "수단그라스": "#AE3EC9",
         "신축": "#F04452", "소실": "#6B7684", "경작 전환": "#0FA9A0", "포장 확대": "#FF9F1C", "식생 증감": "#74B816",
         "산림 → 나지": "#C2410C", "산림 → 도로": "#FF9F1C", "산림 → 건물": "#F04452"}
SPARE = ["#E8590C", "#D6336C", "#1098AD", "#5C7CFA", "#74B816", "#AE3EC9"]
WORD = {"비닐하우스_단동": "단동", "비닐하우스_다동": "다동", "styrofoam": "해양쓰레기", "식생 증감": None}   # 범례 말(None = 그리지 않음 · 국토 변화 참고 유형)
CMP_COL = {"같은 작물": "#0FA9A0", "작물 바뀜": "#FFB633", "수확·곤포 확인": "#006DF7", "생산기에 없음": "#F04452", "생산기에만 있음": "#727780"}
FARM_G, FARM_F = "#2E9E5B", "#E8590C"


# ── 틀 ───────────────────────────────────────────────────────────────────────
def _frame(bbox4326, crs: str, people: bool) -> tuple[float, float, float, float]:
    """경위도 범위 → 작업 좌표계(m) 4:3 틀(가운데 유지 · 넓히기만)"""
    from pyproj import Transformer
    try:
        w, s, e, n = (float(v) for v in bbox4326)
    except Exception:
        raise ApiError("bad_request", "범위는 [서, 남, 동, 북] 경위도 네 값입니다") from None
    if not (-180 <= w < e <= 180 and -90 <= s < n <= 90):
        raise ApiError("bad_request", "범위가 올바르지 않습니다")
    t = Transformer.from_crs(4326, crs, always_xy=True).transform
    xs, ys = zip(*(t(x, y) for x, y in ((w, s), (e, s), (e, n), (w, n))))
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    fw = max(max(xs) - min(xs), (max(ys) - min(ys)) * 4 / 3)
    if people:
        fw = max(fw, MIN_PEOPLE_W)
    if fw > MAX_W:
        raise ApiError("bad_request", f"틀이 너무 넓습니다 — 너비 {int(MAX_W / 1000)} km 이하")
    fh = fw * 0.75
    return (cx - fw / 2, cy - fh / 2, cx + fw / 2, cy + fh / 2)


def _frame4326(fr, crs: str) -> list[float]:
    from pyproj import Transformer
    t = Transformer.from_crs(crs, 4326, always_xy=True).transform
    xs, ys = zip(*(t(x, y) for x, y in ((fr[0], fr[1]), (fr[2], fr[1]), (fr[2], fr[3]), (fr[0], fr[3]))))
    return [round(min(xs), 7), round(min(ys), 7), round(max(xs), 7), round(max(ys), 7)]


# ── 영상 읽기 ────────────────────────────────────────────────────────────────
def _raster(path: str, fr):
    import numpy as np
    import rasterio
    from PIL import Image
    from rasterio.enums import Resampling
    from rasterio.windows import from_bounds
    p = Path(path) if Path(path).is_absolute() else config.DATA_ROOT / path
    if not p.exists():
        raise ApiError("not_found", "영상 파일이 없습니다")
    with rasterio.open(p) as ds:
        win = from_bounds(*fr, transform=ds.transform)
        coarse = (fr[2] - fr[0]) / W > abs(ds.transform.a) * 2
        arr = ds.read([1, 2, 3] if ds.count >= 3 else [1, 1, 1], window=win, out_shape=(3, H, W), boundless=True, fill_value=255,
                      resampling=Resampling.average if coarse else Resampling.bilinear)
        try:
            m = ds.read_masks(1, window=win, out_shape=(H, W), boundless=True)
        except Exception:
            m = None
    if arr.dtype != np.uint8:
        lo, hi = np.percentile(arr, 1), np.percentile(arr, 99)
        arr = np.clip((arr - lo) / max(hi - lo, 1) * 255, 0, 255).astype(np.uint8)
    img = np.transpose(arr, (1, 2, 0)).copy()
    # 10-25 원칙 340 — 영상의 빈 곳(마스크 밖 · 창 밖 · 마스크에 없는 흰 · 검은 채움 덩어리)을 재어 둔다(후보 고르기가 빈 곳 있는 틀을 버림)
    from . import valid_area as VA
    ok = (m > 0) if m is not None else np.ones((H, W), bool)
    cell = (fr[2] - fr[0]) / W
    fill = VA.fill_of(ok, np.all(img >= VA.WHITE, 2), np.all(img <= VA.BLACK, 2), img.mean(axis=2).astype(np.uint8), cell * cell)
    bad = ~ok | fill
    img[bad] = 255
    out = Image.fromarray(img, "RGB")
    out.info["invalid"] = float(bad.mean())
    return out


def _ngii(src: dict, fr, zoom: int):
    """국토 변화 시점 영상(국토지리정보원 그 해 타일 · 등록 영상) — 변화 작업이 쓴 것과 같은 길(change.imagery.fetch_source) · 틀은 EPSG:5179"""
    from PIL import Image
    from change import imagery as CI
    img, (ox, oy, res), got, _tot = CI.fetch_source(src, fr, zoom, workers=8)
    if not got:
        raise ApiError("not_found", "그 해 영상이 이 자리에 없습니다")
    c0, r0 = int(round((fr[0] - ox) / res)), int(round((oy - fr[3]) / res))
    c1, r1 = int(round((fr[2] - ox) / res)), int(round((oy - fr[1]) / res))
    return Image.fromarray(img[max(r0, 0):r1, max(c0, 0):c1]).resize((W, H), Image.LANCZOS)


# ── 그리기 ───────────────────────────────────────────────────────────────────
def _hex(c, a=255):
    c = c.lstrip("#")
    return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4)) + (a,)


def _draw(img, items, fr):
    """items: [(shapely 도형(틀 좌표계), {fill, fa, line, width, halo, r})] — 너무 작은 도형(6 px 미만)은 점으로"""
    from PIL import Image, ImageDraw
    S = 2
    ov = Image.new("RGBA", (W * S, H * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    sx, sy = W * S / (fr[2] - fr[0]), H * S / (fr[3] - fr[1])
    tp = lambda x, y: ((x - fr[0]) * sx, (fr[3] - y) * sy)  # noqa: E731

    def rings(g):
        if g.geom_type == "Polygon":
            yield g
        elif hasattr(g, "geoms"):
            for x in g.geoms:
                yield from rings(x)

    for g, st in items:
        b = g.bounds
        small = g.geom_type in ("Point", "MultiPoint") or max((b[2] - b[0]) * sx, (b[3] - b[1]) * sy) < 6 * S
        if small:
            c = g.centroid
            x, y = tp(c.x, c.y)
            r = st.get("r", 5) * S
            d.ellipse([x - r, y - r, x + r, y + r], fill=_hex(st.get("line") or st["fill"]), outline=(255, 255, 255, 255), width=max(1, int((0.8 if r < 3 * S else 1.5) * S)))
            continue
        for poly in rings(g):
            ext = [tp(*c[:2]) for c in poly.exterior.coords]
            if len(ext) < 3:
                continue
            if st.get("fill"):
                d.polygon(ext, fill=_hex(st["fill"], st.get("fa", 95)))
            if st.get("halo"):
                d.line(ext + [ext[0]], fill=_hex(st["halo"], 150), width=int((st.get("width", 3) + 3) * S), joint="curve")
            if st.get("line"):
                d.line(ext + [ext[0]], fill=_hex(st["line"]), width=int(st.get("width", 3) * S), joint="curve")
    ov = ov.resize((W, H), Image.LANCZOS)
    out = img.convert("RGBA")
    out.alpha_composite(ov)
    return out.convert("RGB")


def _jpg(img) -> bytes:
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=90, optimize=True)
    return buf.getvalue()


class _Col:
    def __init__(self):
        self.spare = 0
        self.got: dict[str, str] = {}

    def __call__(self, cls: str) -> str:
        if cls not in self.got:
            known = COLOR.get(cls) or COLOR.get(str(cls).lower())
            self.got[cls] = known or SPARE[self.spare % len(SPARE)]
            if not known:
                self.spare += 1
        return self.got[cls]


def _legend(pairs) -> list[list[str]]:
    from .spaces import CLASS_KO
    out, seen = [], set()
    for col, cls in pairs:
        w = WORD[cls] if cls in WORD else WORD.get(str(cls).lower(), CLASS_KO.get(str(cls).lower(), cls))
        if w and w not in seen:
            seen.add(w)
            out.append([col, w])
    return out


def _poly_style(col):
    return {"fill": col, "fa": 95, "line": col, "width": 3, "halo": "#FFFFFF"}


FIELD_CLS = {"경작지", "비경작지", "경작", "휴경", "IRG", "호밀", "옥수수", "수단그라스"}


def _dissolve(items):
    """그림에만 — 논밭 결과는 같은 분류끼리 붙은 조각을 한 덩어리로(분석 칸 경계에서 잘린 네모 금이 그림에 보이지 않게).
    건물 · 비닐하우스 · 차량처럼 낱개 결과는 그대로."""
    import shapely
    out, by = [], {}
    for g, c in items:
        (by.setdefault(c, []) if c in FIELD_CLS else out).append(g if c in FIELD_CLS else (g, c))
    for c, gs in by.items():
        u = shapely.union_all([x.buffer(0.3, join_style=2) for x in gs]).buffer(-0.3, join_style=2)
        out += [(p, c) for p in getattr(u, "geoms", [u]) if not p.is_empty and p.area >= FIELD_MIN_M2]   # 합친 뒤 남는 자투리는 그리지 않음(점으로 찍히던 것 · 10-26)
    return out


FIELD_MIN_M2 = 30.0            # 논밭 결과 그림 — 이보다 작은 자투리(칸 경계 조각)는 그리지 않음
PEOPLE_COL = "#F04452"


def _people_dots(pts):
    """사람 점 → 작은 점(10-26 사용자 '관광지 안전관리(히트맵 X)') — 점은 사람 모습이 아닌 표시(틀 너비 200 m 이상 · 원칙 331) — 카드 크기에서도 보이게 반지름 4 px"""
    from shapely.geometry import Point
    return [(Point(x, y), {"fill": PEOPLE_COL, "r": 4.0}) for x, y in pts]


def _epsg(crs: str | None) -> int:
    m = re.search(r"(\d{4,5})$", str(crs or ""))
    return int(m.group(1)) if m else 5186


def _when(ep: str | None, year) -> str:
    s = str(ep or year or "")
    m = re.match(r"((?:19|20)\d{2})(?:[-.](\d{1,2}))?", s)
    if not m:
        return s or "원본"
    return f"{m.group(1)}.{int(m.group(2)):02d}" if m.group(2) else m.group(1)


# ── 원천별 그리기 ─────────────────────────────────────────────────────────────
DSQL = ("SELECT ST_AsBinary(ST_Transform(geom, $6::int)) g, cls, conf, area_m2 FROM detections WHERE job_id = ANY($1) AND conf >= $7 "
        "AND coalesce(edit_state, 'raw') <> 'deleted' AND geom && ST_Transform(ST_MakeEnvelope($2, $3, $4, $5, $6::int), 4326)")
# 경작 · 휴경 — 필지 단위 집계(10-25 사용자 승인 '필지 단위 집계' · 지금 2023 카드 그림과 같은 모양): 필지 하나 = 한 분류(덮인 넓이가 많은 쪽)
FARM_CLS = {"경작지": "경작", "비경작지": "휴경"}
PARCEL_COVER_MIN = 0.3        # 필지 넓이 중 AI 결과가 덮은 몫이 이보다 적으면 칠하지 않음(판단 근거 부족)
PSQL = """
WITH d AS (SELECT geom, cls FROM detections WHERE job_id = ANY($1) AND coalesce(edit_state, 'raw') <> 'deleted' AND cls = ANY($2)
           AND ($3::float8 IS NULL OR geom && ST_Transform(ST_MakeEnvelope($3, $4, $5, $6, $7::int), 4326))),
     e AS (SELECT ST_SetSRID(ST_Extent(geom), 4326) g FROM d),
     p AS (SELECT sp.pnu, sp.geom FROM survey_parcels sp, e WHERE sp.jimok IN ('전', '답', '과') AND sp.geom && e.g
           AND ($3::float8 IS NULL OR sp.geom && ST_Transform(ST_MakeEnvelope($3, $4, $5, $6, $7::int), 4326)))
SELECT p.pnu, ST_AsBinary(ST_Transform(p.geom, $7::int)) g, d.cls, sum(ST_Area(ST_Intersection(p.geom, d.geom)::geography)) a,
       max(ST_Area(p.geom::geography)) pa
FROM p JOIN d ON ST_Intersects(p.geom, d.geom) GROUP BY p.pnu, p.geom, d.cls"""


def is_farm(classes) -> bool:
    cs = {c for c in classes if c}
    return bool(cs) and cs <= set(FARM_CLS)


async def parcel_view(conn, jobs, srid: int, fr=None) -> list[tuple]:
    """AI 결과(경작지 · 비경작지) → [(필지 도형(srid), '경작'|'휴경', 몫)] — 필지마다 덮인 넓이가 많은 분류 · 덮인 몫 30% 이상만"""
    from shapely import wkb
    a = (fr[0], fr[1], fr[2], fr[3]) if fr else (None, None, None, None)
    rows = await conn.fetch(PSQL, list(jobs), list(FARM_CLS), *a, int(srid))
    per: dict = {}
    for r in rows:
        x = per.setdefault(r["pnu"], {"g": r["g"], "pa": float(r["pa"] or 0), "by": {}})
        x["by"][r["cls"]] = x["by"].get(r["cls"], 0.0) + float(r["a"] or 0)
    out = []
    for x in per.values():
        tot = sum(x["by"].values())
        if x["pa"] <= 0 or tot / x["pa"] < PARCEL_COVER_MIN:
            continue
        cls, aa = max(x["by"].items(), key=lambda kv: kv[1])
        out.append((wkb.loads(bytes(x["g"])), FARM_CLS[cls], round(aa / tot, 3)))
    return out


async def _rows(conn, jobs, fr, srid, minconf=0.0):
    from shapely import wkb
    rows = await conn.fetch(DSQL, jobs, *fr, srid, float(minconf or 0))
    return [(wkb.loads(bytes(r["g"])), r["cls"], float(r["area_m2"] or 0)) for r in rows]


async def render(conn, source: dict, bbox4326, opts: dict | None = None) -> dict:
    """→ {base: bytes, result: bytes, labels: [원본 말, 결과 말], legend: [[색, 말]…], frame: 경위도 틀, people: bool}"""
    opts = opts or {}
    minconf, minm2 = float(opts.get("minconf") or 0), float(opts.get("minm2") or 0)
    only = set(opts.get("classes") or [])
    col = _Col()
    if not isinstance(source, dict):
        raise ApiError("bad_request", "결과(source)를 골라 주세요")

    # ① 작업(탐지 · 국토 변화 · 두 시기 비교)
    jobs = source.get("jobs") or ([source["job"]] if source.get("job") else [])
    if jobs:
        jobs = [str(j) for j in jobs][:4]
        rs = await conn.fetch("SELECT j.id, j.options, j.imagery_id, i.path_internal, i.crs, i.epoch, i.year FROM jobs j "
                              "LEFT JOIN imagery i ON i.id = j.imagery_id WHERE j.id = ANY($1)", jobs)
        if len(rs) != len(jobs):
            raise ApiError("not_found", "없는 결과입니다")
        by = {r["id"]: r for r in rs}
        first = by[jobs[0]]
        o = first["options"] if isinstance(first["options"], dict) else json.loads(first["options"] or "{}")
        if o.get("change"):                                        # 국토 변화 · 산사태 — 해 A(원본) · 해 B + 변화 자리(AI 결과)
            ch = o["change"]
            ya, yb = int(ch["year_a"]), int(ch["year_b"])
            fr = _frame(bbox4326, "EPSG:5179", False)
            rows = [x for x in await _rows(conn, [first["id"]], fr, 5179) if x[2] >= minm2 and (not only or x[1] in only) and WORD.get(x[1], x[1])]
            sa, sb = ch.get("src_a") or {"kind": "ngii", "year": ya}, ch.get("src_b") or {"kind": "ngii", "year": yb}
            zoom = int(ch.get("zoom") or 18)

            def go():
                A, B = _ngii(sa, fr, zoom), _ngii(sb, fr, zoom)
                its = [(g, {**_poly_style(col(c)), "fa": 70, "width": 3.5}) for g, c, _ in rows]
                return _jpg(A), _jpg(_draw(B, its, fr))
            base, res = await run_in_threadpool(go)
            return {"base": base, "result": res, "labels": [str(ya), str(yb)], "legend": _legend((col(c), c) for _, c, _ in rows),
                    "frame": _frame4326(fr, "EPSG:5179"), "people": False, "n": len(rows)}
        if o.get("compare"):                                       # 두 시기 비교 — 생육기 영상(원본) · 생산기 영상 + 필지 판정(AI 결과)
            cm = o["compare"]
            g_, p_ = cm.get("growth"), cm.get("production")
            ims = {r["id"]: r for r in await conn.fetch("SELECT j.id, i.path_internal, i.crs, i.epoch, i.year FROM jobs j JOIN imagery i ON i.id = j.imagery_id "
                                                         "WHERE j.id = ANY($1)", [g_, p_])}
            if g_ not in ims or p_ not in ims:
                raise ApiError("not_found", "두 시기 영상을 찾지 못했습니다")
            crs = ims[g_]["crs"] or "EPSG:5186"
            fr = _frame(bbox4326, crs, False)
            f = config.DATA_ROOT / "compare" / f"{first['id']}.json"
            if not f.is_file():
                raise ApiError("not_found", "비교 결과 파일이 없습니다")

            def go():
                from pyproj import Transformer
                from shapely.geometry import box, shape
                from shapely.ops import transform as stx
                T = Transformer.from_crs(4326, crs, always_xy=True).transform
                J = json.loads(f.read_text(encoding="utf-8"))
                bx = box(*fr)
                fe = [(stx(T, shape(x["geometry"])), x["properties"].get("status")) for x in (J.get("geo") or {}).get("features", [])]
                fe = [(g, s) for g, s in fe if s in CMP_COL and g.intersects(bx)]
                its = [(g, {"fill": CMP_COL[s], "fa": 45, "line": CMP_COL[s], "width": 4, "halo": "#FFFFFF"}) for g, s in fe]
                A, B = _raster(ims[g_]["path_internal"], fr), _raster(ims[p_]["path_internal"], fr)
                st = sorted({s for _, s in fe}, key=list(CMP_COL).index)
                return _jpg(A), _jpg(_draw(B, its, fr)), [[CMP_COL[s], s] for s in st], len(fe)
            base, res, leg, n = await run_in_threadpool(go)
            la, lb = _when(ims[g_]["epoch"], ims[g_]["year"]), _when(ims[p_]["epoch"], ims[p_]["year"])
            return {"base": base, "result": res, "labels": [la, lb], "legend": leg, "frame": _frame4326(fr, crs), "people": False, "n": n}
        # 탐지 — 첫 작업의 영상 위에 모든 작업(사람 · 차량처럼 둘)의 결과
        if not first["path_internal"]:
            raise ApiError("bad_request", "영상이 없는 결과입니다")
        crs = first["crs"] or "EPSG:5186"
        srid = _epsg(crs)
        has_people = bool(await conn.fetchval("SELECT EXISTS(SELECT 1 FROM detections WHERE job_id = ANY($1) AND cls = ANY($2))", jobs, list(PEOPLE)))
        fr = _frame(bbox4326, crs, has_people)
        rows = [x for x in await _rows(conn, jobs, fr, srid, minconf) if not only or x[1] in only]
        path = first["path_internal"]
        if rows and is_farm(c for _, c, _ in rows) and not opts.get("raw"):
            pv = await parcel_view(conn, jobs, srid, fr)
            if pv:                                               # 경작 · 휴경 = 필지 단위(필지 정보가 없는 곳이면 AI 경계 그대로)
                def go_p():
                    L = _raster(path, fr)
                    its = [(g, {"fill": FARM_G, "fa": 95, "line": FARM_G, "width": 2.5, "halo": "#FFFFFF"}) for g, c, _ in pv if c == "경작"]
                    its += [(g, {"fill": FARM_F, "fa": 120, "line": FARM_F, "width": 3, "halo": "#FFFFFF"}) for g, c, _ in pv if c == "휴경"]
                    return _jpg(L), _jpg(_draw(L, its, fr))
                base, res = await run_in_threadpool(go_p)
                leg = [x for x in ([FARM_G, "경작"], [FARM_F, "휴경"]) if any(c == x[1] for _, c, _ in pv)]
                return {"base": base, "result": res, "labels": ["원본", "AI 결과"], "legend": leg, "frame": _frame4326(fr, crs), "people": False,
                        "n": len(pv), "parcel": True}

        def go():
            L = _raster(path, fr)
            ppl = [(g.centroid.x, g.centroid.y) for g, c, _ in rows if c in PEOPLE]
            its = _people_dots(ppl) if ppl else []
            its += [(g, _poly_style(col(c))) for g, c in _dissolve([(g, c) for g, c, _ in rows if c not in PEOPLE])]
            return _jpg(L), _jpg(_draw(L, its, fr))
        base, res = await run_in_threadpool(go)
        leg = ([[PEOPLE_COL, "사람"]] if any(c in PEOPLE for _, c, _ in rows) else []) + _legend((col(c), c) for _, c, _ in rows if c not in PEOPLE)
        return {"base": base, "result": res, "labels": ["원본", "AI 결과"], "legend": leg, "frame": _frame4326(fr, crs), "people": has_people, "n": len(rows)}

    # ② 결과 층 파일(geojson) + 영상
    if source.get("layer") or source.get("parcels"):
        im = await conn.fetchrow("SELECT path_internal, crs FROM imagery WHERE id = $1", str(source.get("imagery") or ""))
        if not im or not im["path_internal"]:
            raise ApiError("bad_request", "영상을 골라 주세요")
        crs = im["crs"] or "EPSG:5186"
        srid = _epsg(crs)
        if source.get("layer"):
            rel = str(source["layer"]).replace("\\", "/")
            root = config.SERVER_ROOT.parent / "landxi" / "assets" / "data" / "geo"          # 결과 층 파일은 이 폴더 아래만
            lp = (root / rel.split("geo/", 1)[-1]).resolve()
            if not rel.endswith(".geojson") or ".." in rel or root.resolve() not in lp.parents or not lp.is_file():
                raise ApiError("not_found", "결과 층 파일이 없습니다")
            people = False
            fr = _frame(bbox4326, crs, people)

            def go():
                from pyproj import Transformer
                from shapely.geometry import box, shape
                from shapely.ops import transform as stx
                T = Transformer.from_crs(4326, crs, always_xy=True).transform
                bx = box(*fr)
                J = json.loads(lp.read_text(encoding="utf-8"))
                fe = []
                for x in J.get("features", []):
                    pr = x.get("properties") or {}
                    if float(pr.get("conf") or 1) < minconf:
                        continue
                    g = stx(T, shape(x["geometry"]))
                    if g.intersects(bx):
                        fe.append((g, str(pr.get("cls") or "결과")))
                L = _raster(im["path_internal"], fr)
                return _jpg(L), _jpg(_draw(L, [(g, _poly_style(col(c))) for g, c in fe], fr)), fe
            base, res, fe = await run_in_threadpool(go)
            return {"base": base, "result": res, "labels": ["원본", "AI 결과"], "legend": _legend((col(c), c) for _, c in fe),
                    "frame": _frame4326(fr, crs), "people": False, "n": len(fe)}
        # 경작 · 휴경 필지 판정(필지 조사 표 — 휴경 의심 규칙 · AI 경작지 비율)
        sgg = str(source["parcels"])
        fr = _frame(bbox4326, crs, False)
        from shapely import wkb
        rows = await conn.fetch(
            "SELECT ST_AsBinary(ST_Transform(sp.geom, $6::int)) g, "
            "EXISTS(SELECT 1 FROM survey_findings f WHERE f.pnu = sp.pnu AND f.rule = 'R2' AND f.sgg_cd = $1 AND f.ai_job_id IS NULL) "
            "AND coalesce(sp.a23_gh_in_m2, 0) + coalesce(sp.a23_bld_in_m2, 0) < 0.03 * sp.area_m2 AS fal, "
            "coalesce(sp.a23_crop_in_m2, 0) / nullif(sp.area_m2, 0) AS cr "
            "FROM survey_parcels sp WHERE sp.sgg_cd = $1 AND sp.jimok IN ('전', '답') AND sp.geom && ST_Transform(ST_MakeEnvelope($2, $3, $4, $5, $6::int), 4326)",
            sgg, *fr, srid)
        ps = [(wkb.loads(bytes(r["g"])), bool(r["fal"]), float(r["cr"] or 0)) for r in rows]

        def go():
            import numpy as np
            from rasterio.features import geometry_mask
            from rasterio.transform import from_bounds as tfb
            L = _raster(im["path_internal"], fr)
            arr = np.asarray(L).astype(float)
            its = []
            for g, fal, cr in ps:
                if fal:
                    m = ~geometry_mask([g], (H, W), tfb(*fr, W, H))
                    px = arr[m]
                    if len(px) and (px.mean() > 125 or px[:, 2].mean() > px[:, 1].mean()):   # 밝은 지붕 · 푸른 비닐 = 전용(휴경 칸에 넣지 않음)
                        continue
                    its.append((g, {"fill": FARM_F, "fa": 120, "line": FARM_F, "width": 3, "halo": "#FFFFFF"}))
                elif cr >= 0.5:
                    its.append((g, {"fill": FARM_G, "fa": 95, "line": FARM_G, "width": 2.5, "halo": "#FFFFFF"}))
            return _jpg(L), _jpg(_draw(L, its, fr))
        base, res = await run_in_threadpool(go)
        return {"base": base, "result": res, "labels": ["원본", "AI 결과"], "legend": [[FARM_G, "경작"], [FARM_F, "휴경"]],
                "frame": _frame4326(fr, crs), "people": False, "n": len(ps)}
    raise ApiError("bad_request", "결과(source)를 골라 주세요")


def data_url(b: bytes) -> str:
    return "data:image/jpeg;base64," + base64.b64encode(b).decode()


def check_labels(v) -> list[str] | None:
    if v is None:
        return None
    if not isinstance(v, list) or len(v) != 2 or not all(isinstance(x, str) and 0 < len(x.strip()) <= 12 for x in v):
        raise ApiError("bad_request", "이름표는 두 개(각 12자 이하)입니다")
    return [x.strip() for x in v]


def check_legend(v) -> list[list[str]]:
    out = []
    for x in (v or [])[:6]:
        if isinstance(x, (list, tuple)) and len(x) == 2 and re.fullmatch(r"#[0-9A-Fa-f]{6}", str(x[0])) and 0 < len(str(x[1])) <= 12:
            out.append([str(x[0]), str(x[1])])
    return out


