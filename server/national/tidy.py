"""AI 분석 결과 겹침 정리 1단(원칙 301 · 315 · now21 겹침-숫자세기 · 필지묶음 · 붙은경계 · 시점 · 원본보관 · 1단착수 ⓐ · 제안-농지하천한층).

설계: docs/superpowers/recon-1021/OVERLAP-DESIGN.md · 결과: docs/superpowers/final/process/impl-46/overlap-c22/RESULT.md
도형만 다룬다 — 다시 추론하지 않는다(학습 장비 0). AI 가 낸 원래 결과는 지우지 않는다(원본보관 ⓐ).

정리 규칙(한 곳 — 새 분석 마무리(cpu_worker) · 전국 결과 다시 정리(이 파일 CLI)가 같은 함수를 쓴다)
  ⓑ 칸 경계에서 잘린 것 붙이기(seam_merge) — 같은 분류 · 다른 칩 · 칩 가장자리에 닿은 경계가 (작은 쪽의 10% 넘게 겹치거나 0.3 m 안에 붙어) 있으면 하나로.
     같은 칩 안에서 붙은 두 경계(0.5 m 안)는 합치지 않고 '합칠까요?' 후보로만 남긴다(실제로 두 논배미일 수 있음 · 사람이 정함 — now22 Q2 전까지 목록만).
  ⓐ 분석 단위(읍면동 칸 · 조각)를 넘는 중복 빼기(own_keep) — 경계 대표점이 이 조각 안인 것만 이 조각의 결과(숫자를 세는 규칙과 같음).
     대표점이 이웃 칸(분석 범위가 있는 칸) 안이면 이웃 칸 결과가 그린다. 어느 칸에도 없으면 남긴다(아무도 그리지 않는 곳을 비우지 않게).
     그다음 같은 분류 · 작은 쪽의 절반 넘게 겹친 경계가 다른 조각에 또 있으면 믿음 정도가 낮은 쪽을 뺀다(cross_dedupe).
  농지 · 하천 한 층 — 하천 · 계곡 결과의 경작지 · 비닐하우스가 농지 전수 결과와 같은 경계(작은 쪽 절반 넘게 겹침)면 하천 쪽을 뺀다.
     경작지 · 비닐하우스는 농지 전수 층 하나로 보이고, 하천 결과에는 농지 결과에 없는 것만 남는다.
  고친 자리(result_edits)가 있는 경계는 붙이지도 빼지도 않는다(고치기 · 되돌리기 · 학습 칸이 그 번호를 쓴다).

파일
  원래 결과  옛 결과 = {작업}.geojson 그대로(손대지 않음) · 새 분석 = {작업}.raw.fgb
  정리 결과  {작업}.fgb(화면 · 내려받기 · 보고서가 읽는 것 — result_store.vector_of_base 가 .fgb 를 먼저 읽는다) + 지도 조각 {작업}.pmtiles 다시 굽기
  정리 기록  {작업}-tidy.json — 판 · 원래 파일 이름 · 들어온 수 · 남은 수 · 붙임 · 뺀 까닭별 수 · '합칠까요?' 후보 목록
  바뀐 것이 없으면 정리 기록만 쓴다(원래 파일이 곧 정리 결과).
숫자: 칸 숫자(national_cells.counts)는 원래 결과 → 정리 결과의 차이만큼만 고친다(고치기로 바뀐 숫자는 그대로 둔다 · 한 출처).

사용(CLI · CPU · 낮은 우선순위로)
  python -m national.tidy --asset farm --year 2025 --sgg 52190 [--dry]     한 시군구
  python -m national.tidy --asset farm --year 2025 --all [--workers 4]     전국(끝난 시군구는 건너뜀 · 다시 돌려도 같음)
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
import time
from pathlib import Path

import numpy as np
import shapely
from pyproj import Transformer

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

VERSION = 1
SEAM_RATIO = 0.10        # 칸 경계 붙이기 — 작은 쪽 대비 겹친 비율
SEAM_GAP_M = 0.3         # 칸 경계 붙이기 — 맞닿음 거리
CAND_GAP_M = 0.5         # 같은 칩 안 '합칠까요?' 후보 거리
DUP_RATIO = 0.5          # 같은 것을 두 번 — 작은 쪽 대비 겹친 비율(작업기 NMS 와 같은 문턱)
# 10-26 카드 8종 점검(사료작물 칸 격자 · 단동 비닐하우스 토막) — 드론 2 cm 모델은 칩마다 칸 크기 조각을 내고, 조각이 칩 가장자리에 닿지 않아도
# 이웃 칩 조각과 맞닿는다(가장자리 표시 없음 · 틈 0 m · 겹침 0.3 %). 아래 분류만 가장자리 표시 없이도 붙인다(농지 전수 '경작지' · '비닐하우스'는 그대로).
CROP_CLS = {"IRG", "수단그라스", "옥수수", "호밀"}               # 사료작물 — 다른 칩 · 맞닿음(0.3 m) 또는 둘 다 가장자리이고 1 m 안이면 하나로
GH_CLS = {"비닐하우스_단동", "비닐하우스_다동"}                  # 단동 · 다동 — 다른 칩 · 작은 쪽의 10 % 넘게 겹치거나, 끝과 끝이 맞닿아(0.3 m) 합친 모양이 더 길어질 때 하나로
                                                              # (옆으로 붙어 선 두 동은 합치면 덜 길쭉해지므로 따로 둔다)
CROP_EDGE_GAP_M = 1.0
KEYS = ("id", "cls", "cls_en", "cid", "conf", "area_m2", "emd", "emd_cd", "edit_state", "job_id", "shard_id", "chip_edge", "merged_from")
SHARED_CLS = ("경작지", "비닐하우스")      # 농지 · 하천 한 층 — 농지 전수 층이 그리는 분류
# '합칠까요?' 후보를 내는 면 분류(붙은 두 건물 · 비닐하우스는 원래 따로인 것이 보통 — 후보로 내지 않음)
FIELD_CLS = {"경작지", "비경작지", "농지", "논", "밭", "과수원", "초지", "나지", "토지피복", "farmland", "cropland"}
KST = dt.timezone(dt.timedelta(hours=9))


def _tr(epsg: int = 5186):
    f = Transformer.from_crs(4326, epsg, always_xy=True)
    b = Transformer.from_crs(epsg, 4326, always_xy=True)
    return (lambda c: np.column_stack(f.transform(c[:, 0], c[:, 1]))), (lambda c: np.column_stack(b.transform(c[:, 0], c[:, 1])))


def to_metric(geoms, epsg: int = 5186):
    fwd, _ = _tr(epsg)
    return shapely.transform(np.asarray(geoms, dtype=object), fwd)


def to_lnglat(geoms, epsg: int = 5186):
    _, back = _tr(epsg)
    return shapely.transform(np.asarray(geoms, dtype=object), back)


def _valid(g):
    """고친 도형은 면만(선 · 점 조각은 버림)."""
    if g is None or g.is_empty:
        return g
    if not g.is_valid:
        try:
            g = shapely.make_valid(g)
        except shapely.errors.GEOSException:                              # 고칠 수 없는 도형(차원이 섞인 묶음 등) — 면 조각만 따로 고침
            ps = [x for x in shapely.get_parts(g) if x.geom_type in ("Polygon", "MultiPolygon")]
            try:
                g = shapely.union_all([x.buffer(0) for x in ps]) if ps else shapely.Polygon()
            except shapely.errors.GEOSException:
                return shapely.Polygon()
    if g.geom_type in ("Polygon", "MultiPolygon"):
        return g
    parts = shapely.get_parts(g)
    while any(x.geom_type == "GeometryCollection" for x in parts):        # 묶음 안 묶음까지 풀기
        parts = np.concatenate([shapely.get_parts(x) if x.geom_type == "GeometryCollection" else np.array([x], dtype=object) for x in parts])
    ps = [x for x in shapely.get_parts(np.asarray([x for x in parts if x.geom_type in ("Polygon", "MultiPolygon")], dtype=object)) if not x.is_empty] if len(parts) else []
    if not ps:
        return shapely.Polygon()
    try:
        return shapely.union_all(ps)
    except shapely.errors.GEOSException:
        return shapely.MultiPolygon(ps).buffer(0)


def _multi(gs: list) -> list:
    """한 파일 안 도형 종류를 하나로(면 · 여러 면이 섞이면 모두 여러 면)."""
    if any(g.geom_type == "MultiPolygon" for g in gs) and any(g.geom_type == "Polygon" for g in gs):
        return [shapely.MultiPolygon([g]) if g.geom_type == "Polygon" else g for g in gs]
    return gs


# ── ⓑ 칸 경계에서 잘린 것 붙이기 ────────────────────────────────────────────────────────────────
def seam_merge(geoms: list, props: list[dict], *, keep_ids: set | None = None, obb: bool = False) -> tuple[list, list[dict], dict, list[dict]]:
    """geoms = 미터 좌표 도형(같은 작업 · NMS 뒤) · props = 속성(cls · conf · shard_id · chip_edge · id).
    → (도형, 속성, 통계, '합칠까요?' 후보). 붙인 경계: id = 가장 넓은 조각의 id · conf = 넓이 가중 · merged_from = 나머지 id."""
    n = len(geoms)
    st = {"in": n, "merged_pieces": 0, "merged_into": 0, "candidates": 0}
    if n < 2 or obb:
        return list(geoms), list(props), st, []
    keep_ids = keep_ids or set()
    G = np.asarray(geoms, dtype=object)
    A = shapely.area(G)
    tree = shapely.STRtree(G)
    i, j = tree.query(G, predicate="dwithin", distance=max(CAND_GAP_M, CROP_EDGE_GAP_M))
    m = i < j
    i, j = i[m], j[m]
    parent = list(range(n))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    cands = []
    if len(i):
        cls = np.array([p.get("cls") for p in props], dtype=object)
        same = cls[i] == cls[j]
        i, j = i[same], j[same]
        inter = shapely.area(shapely.intersection(G[i], G[j]))
        ratio = inter / np.maximum(np.minimum(A[i], A[j]), 1e-9)
        gap = shapely.distance(G[i], G[j])
        for a, b, r, d in zip(i.tolist(), j.tolist(), ratio.tolist(), gap.tolist()):
            pa, pb = props[a], props[b]
            if r > DUP_RATIO:                       # 같은 작업 안의 중복은 작업기 NMS 몫(여기 오지 않음)
                continue
            if str(pa.get("id")) in keep_ids or str(pb.get("id")) in keep_ids:
                continue
            sa, sb = pa.get("shard_id"), pb.get("shard_id")
            if sa is not None and sb is not None and sa != sb:
                edge = pa.get("chip_edge") or pb.get("chip_edge")
                if edge is None and pa.get("chip_edge") is None and pb.get("chip_edge") is None:
                    edge = True                     # 칩 가장자리 기록이 없는 옛 결과 — 다른 칩이면 칸 경계로 본다
                c_ = pa.get("cls")
                crop = c_ in CROP_CLS and (d < SEAM_GAP_M or (pa.get("chip_edge") and pb.get("chip_edge") and d < CROP_EDGE_GAP_M))
                gh = c_ in GH_CLS and (r >= SEAM_RATIO or (d < SEAM_GAP_M and _end_to_end(G[a], G[b])))
                if crop or gh or (edge and (r >= SEAM_RATIO or d < SEAM_GAP_M)):
                    ra, rb = find(a), find(b)
                    if ra != rb:
                        parent[rb] = ra
                continue
            if sa == sb and d < CAND_GAP_M and pa.get("cls") in FIELD_CLS:   # 같은 칩 안에서 붙은 면(논밭) — 사람이 정함(후보만)
                cands.append({"a": pa.get("id"), "b": pb.get("id"), "cls": pa.get("cls"), "gap_m": round(d, 2), "overlap": round(r, 3)})
    groups: dict[int, list[int]] = {}
    for k in range(n):
        groups.setdefault(find(k), []).append(k)
    out_g, out_p = [], []
    for root, ks in groups.items():
        if len(ks) == 1:
            out_g.append(G[ks[0]])
            out_p.append(props[ks[0]])
            continue
        ks.sort(key=lambda k: -A[k])
        u = shapely.union_all(G[ks])
        if u.geom_type == "MultiPolygon":            # 0.3 m 안에 떨어진 조각 — 틈을 메워 한 면으로(닫기) · 사료작물은 1 m 틈까지
            gap = CROP_EDGE_GAP_M / 2 + 0.05 if props[ks[0]].get("cls") in CROP_CLS else SEAM_GAP_M
            u = shapely.buffer(shapely.buffer(u, gap, join_style="mitre"), -gap, join_style="mitre")
        u = _valid(u)
        w = sum(float(A[k]) for k in ks)
        p = dict(props[ks[0]])
        p["conf"] = round(sum(float(props[k].get("conf") or 0) * float(A[k]) for k in ks) / max(w, 1e-9), 3)
        p["area_m2"] = round(float(u.area), 1)
        p["chip_edge"] = True
        p["merged_from"] = ",".join(str(props[k].get("id")) for k in ks[1:])
        out_g.append(u)
        out_p.append(p)
        st["merged_pieces"] += len(ks)
        st["merged_into"] += 1
    st["candidates"] = len(cands)
    st["out"] = len(out_g)
    return out_g, out_p, st, cands


def _elong(g) -> float:
    try:
        r = g.minimum_rotated_rectangle
        xs, ys = r.exterior.coords.xy
        a = ((xs[0] - xs[1]) ** 2 + (ys[0] - ys[1]) ** 2) ** 0.5
        b = ((xs[1] - xs[2]) ** 2 + (ys[1] - ys[2]) ** 2) ** 0.5
        lo, hi = sorted([a, b])
        return hi / lo if lo > 0 else 99.0
    except Exception:  # noqa: BLE001
        return 1.0


def _end_to_end(ga, gb) -> bool:
    """두 조각을 합친 모양이 각 조각보다 길쭉해지면 = 한 동의 앞뒤 토막(칸 경계에서 잘림) · 옆으로 붙은 두 동이면 덜 길쭉해진다."""
    u = shapely.union_all([shapely.buffer(ga, SEAM_GAP_M, join_style="mitre"), shapely.buffer(gb, SEAM_GAP_M, join_style="mitre")])
    return _elong(u) > max(_elong(ga), _elong(gb)) * 1.15


# ── ⓐ 분석 단위를 넘는 중복 빼기 ─────────────────────────────────────────────────────────────────
def own_keep(pts, own_part, cell, siblings: list, other_cells) -> np.ndarray:
    """대표점(경위도) 배열 → 이 조각이 그릴 것(True). siblings = 같은 칸 다른 조각 범위 · other_cells = 다른 칸 범위 STRtree(4326) 또는 None."""
    pts = np.asarray(pts, dtype=object)
    n = len(pts)
    keep = np.zeros(n, dtype=bool)
    if n == 0:
        return keep
    shapely.prepare(own_part)
    in_own = shapely.contains(own_part, pts) | shapely.touches(own_part, pts)
    keep |= in_own
    rest = np.where(~in_own)[0]
    if not len(rest):
        return keep
    rp = pts[rest]
    in_cell = shapely.contains(cell, rp) if cell is not None else np.zeros(len(rest), dtype=bool)
    for k, idx in enumerate(rest):
        p = rp[k]
        if in_cell[k]:
            if any(s.contains(p) for s in siblings):
                continue                               # 같은 칸 다른 조각 몫
            # 칸 안이지만 어느 조각에도 없음(영상 없는 틈 등) — 가장 가까운 조각이 그린다
            d_own = own_part.distance(p)
            if all(d_own <= s.distance(p) for s in siblings):
                keep[idx] = True
            continue
        if other_cells is not None and len(other_cells.query(p, predicate="intersects")):
            continue                                   # 이웃 칸 몫(그 칸 결과가 그린다)
        keep[idx] = True                               # 아무 칸에도 없음 — 남긴다
    return keep


def cross_dedupe(geoms: list, props: list[dict], owners: list, *, keep_ids: set | None = None, prefer: dict | None = None) -> set[int]:
    """다른 조각(owners 가 다름)끼리 같은 분류 · 작은 쪽 절반 넘게 겹침 → 뺄 번호 모음. prefer = {owner: 순위}(작을수록 남김 · 없으면 conf)."""
    keep_ids = keep_ids or set()
    n = len(geoms)
    drop: set[int] = set()
    if n < 2:
        return drop
    G = np.asarray(geoms, dtype=object)
    A = shapely.area(G)
    tree = shapely.STRtree(G)
    i, j = tree.query(G, predicate="intersects")
    m = i < j
    i, j = i[m], j[m]
    if not len(i):
        return drop
    ow = np.asarray(owners, dtype=object)
    cls = np.array([p.get("cls") for p in props], dtype=object)
    sel = (ow[i] != ow[j]) & (cls[i] == cls[j])
    i, j = i[sel], j[sel]
    if not len(i):
        return drop
    inter = shapely.area(shapely.intersection(G[i], G[j]))
    ratio = inter / np.maximum(np.minimum(A[i], A[j]), 1e-9)
    big = ratio > DUP_RATIO
    conf = np.array([float(p.get("conf") or 0) for p in props])
    pr = prefer or {}
    order = sorted(zip(i[big].tolist(), j[big].tolist()), key=lambda ab: -max(conf[ab[0]], conf[ab[1]]))
    for a, b in order:
        if a in drop or b in drop:
            continue
        ka, kb = str(props[a].get("id")) in keep_ids, str(props[b].get("id")) in keep_ids
        if ka and kb:
            continue
        if ka or kb:
            drop.add(b if ka else a)
            continue
        ra, rb = pr.get(owners[a], 0), pr.get(owners[b], 0)
        if ra != rb:
            drop.add(b if ra < rb else a)
        else:
            drop.add(b if (conf[a], str(props[b].get("id"))) >= (conf[b], str(props[a].get("id"))) else a)
    return drop


# ── 파일 ───────────────────────────────────────────────────────────────────────────────────
def tidy_path(base: Path) -> Path:
    return base.with_name(base.name + "-tidy.json")


def raw_path(base: Path) -> Path | None:
    """AI 가 낸 원래 결과 파일 — 정리 기록이 가리키는 것(.raw.fgb 또는 옛 .geojson) · 정리 전이면 결과 파일 그대로."""
    from landxi_api.result_store import vector_of_base
    t = tidy_path(base)
    if t.exists():
        try:
            nm = json.loads(t.read_text(encoding="utf-8")).get("raw")
            if nm and (base.parent / nm).exists():
                return base.parent / nm
        except (OSError, ValueError):
            pass
    r = base.with_name(base.name + ".raw.fgb")
    return r if r.exists() else vector_of_base(base)


def read_raw(path: Path) -> tuple[list, list[dict]]:
    """결과 파일(.geojson · .fgb) → (경위도 도형, 속성) — pyogrio 로 빠르게."""
    from pyogrio.raw import read
    meta, _f, geom, data = read(str(path))
    fields = list(meta.get("fields") if meta.get("fields") is not None else [])
    gs = shapely.from_wkb(geom) if geom is not None and len(geom) else []
    props = []
    for k in range(len(gs)):
        p = {}
        for c, name in enumerate(fields):
            v = data[c][k]
            if hasattr(v, "item"):
                v = v.item()
            if isinstance(v, float) and v != v:
                v = None
            p[name] = v
        if p.get("cid") is not None and isinstance(p["cid"], float) and p["cid"].is_integer():
            p["cid"] = int(p["cid"])
        props.append(p)
    return list(gs), props


def write_clean(base: Path, raw_file: Path, geoms4326: list, props: list[dict], record: dict, *, pmtiles: bool = True, minzoom: int = 10, maxzoom: int = 17) -> dict:
    """정리 결과 .fgb + 지도 조각 + 정리 기록. 원래 파일은 그대로 둔다(같은 이름 .fgb 면 먼저 .raw.fgb 로 옮김 — 지우지 않음)."""
    from landxi_api.result_store import write_fgb
    clean = base.with_name(base.name + ".fgb")
    if raw_file.resolve() == clean.resolve():
        keep = base.with_name(base.name + ".raw.fgb")
        if not keep.exists():
            os.replace(clean, keep)
        raw_file = keep
    info = {}
    keep = [k for k, g in enumerate(geoms4326) if g is not None and not g.is_empty]
    geoms4326, props = [geoms4326[k] for k in keep], [props[k] for k in keep]
    snap = base.with_name(base.name + ".pmtiles")
    if record.get("changed") and not geoms4326:          # 모두 이웃 몫 — 빈 결과. 옛 지도 조각은 지우지 않고 옆으로(.raw.pmtiles) 옮겨 그리지 않게
        write_fgb(clean, [], [], KEYS)
        if snap.exists():
            os.replace(snap, base.with_name(base.name + ".raw.pmtiles"))
        pmtiles = False
    elif record.get("changed"):
        write_fgb(clean, _multi([shapely.force_2d(g) for g in geoms4326]), [{k: p.get(k) for k in KEYS} for p in props], KEYS)
        if pmtiles:
            from pipelines.snapshot_pmtiles import build
            for t in range(5):
                try:
                    info = build(clean, snap, minzoom=minzoom, maxzoom=maxzoom, name=base.name)
                    break
                except (PermissionError, OSError):          # 지도 조각을 읽는 중이면 잠깐 뒤 다시(Windows 파일 잠금)
                    if t == 4:
                        raise
                    time.sleep(1.5)
    rec = {**record, "v": VERSION, "raw": raw_file.name, "clean": clean.name if record.get("changed") else raw_file.name,
           "at": dt.datetime.now(KST).isoformat(timespec="seconds"), "pmtiles_ms": info.get("ms")}
    tidy_path(base).write_text(json.dumps(rec, ensure_ascii=False, indent=0), encoding="utf-8")
    return rec


# ── 새 분석 마무리(작업기 cpu_worker.finalize) ────────────────────────────────────────────────────
def finalize_clean(feats: list[dict], *, task: str, label: str | None = None, aoi: dict | None = None, national: dict | None = None,
                   epsg: int | None = None) -> tuple[list[dict], dict]:
    """작업기 마무리 — NMS 뒤 결과(경위도 shapely · props) → (정리 결과, 정리 기록). 원래 결과는 부르는 쪽이 .raw.fgb 로 남긴다.
    ⓑ 칸 경계 붙이기는 모든 분석 · ⓐ 조각 몫 · 농지 · 하천 한 층은 전국 분석 조각(national = {asset, year, cell})만."""
    rec = {"by": "finalize", "in": len(feats), "out": len(feats), "seam": {}, "candidates": [], "dropped": {}, "changed": False}
    if not feats:
        return feats, rec
    if epsg is None:
        from workers.postprocess import metric_epsg
        c0 = feats[0]["geom"].centroid
        epsg = metric_epsg(c0.x, c0.y)
    gm = [_valid(g) for g in to_metric([f["geom"] for f in feats], epsg)]
    props = [dict(f["props"]) for f in feats]
    mg, mp, sst, cands = seam_merge(gm, props, obb=(task in ("obb", "det")))   # 상자 결과(차량 · 사람)는 칸 경계에서 붙이지 않는다(붙은 두 사람이 하나가 되지 않게)
    rec["seam"], rec["candidates"] = sst, cands
    keep = np.ones(len(mg), dtype=bool)
    if national and national.get("cell") and aoi and len(mg):
        try:
            keep, why = _national_keep(mg, mp, national, aoi, label, epsg)
            rec["dropped"] = why
        except Exception as e:  # noqa: BLE001 — 정리를 못 해도 결과는 막지 않는다(원래대로)
            rec["dropped"] = {"error": repr(e)[:200]}
            keep = np.ones(len(mg), dtype=bool)
    g4 = to_lnglat(mg, epsg)
    out = []
    for k in np.where(keep)[0]:
        g = g4[k]
        if g is None or g.is_empty:
            continue
        p = mp[k]
        p["area_m2"] = round(float(mg[k].area), 1)
        out.append({"geom": g, "props": p})
    rec["out"] = len(out)
    rec["changed"] = rec["out"] != rec["in"] or sst.get("merged_into", 0) > 0
    return out, rec


def _national_keep(mg: list, mp: list[dict], nat: dict, aoi: dict, label: str | None, epsg: int) -> tuple[np.ndarray, dict]:
    from shapely.geometry import shape
    asset, year, cd = nat.get("asset"), int(nat.get("year")), str(nat.get("cell"))
    own = shape(aoi)
    with _pg() as c:
        c.execute("SELECT set_config('app.realm','lx',false), set_config('app.tenant_id','',false)")
        row = c.execute("SELECT ST_AsBinary(geom_s), ST_AsBinary(target) FROM national_cells WHERE asset=%s AND year=%s AND cell_cd=%s",
                        (asset, year, cd)).fetchone()
        cell_g = shapely.from_wkb(bytes(row[0])) if row and row[0] else None
        sibs = []
        if row and row[1]:
            from national.runner import split_parts
            parts = split_parts(shapely.from_wkb(bytes(row[1])))
            k = None
            try:
                k = int(str(label or "").rsplit("/", 1)[-1])
            except ValueError:
                k = None
            sibs = [p for i, p in enumerate(parts) if (i != k if k is not None else not p.equals_exact(own, 1e-7))]
        cds, cgs, ctree = _cells_tree(c, asset, year)
        ci = cds.index(cd) if cd in cds else None

        class _Other:
            def query(self, p, predicate="intersects"):
                return [h for h in ctree.query(p, predicate=predicate) if h != ci]
        rp = to_lnglat(shapely.point_on_surface(np.asarray(mg, dtype=object)), epsg)
        keep = own_keep(rp, own, cell_g, sibs, _Other())
        why = {"owner": int((~keep).sum()), "farm_layer": 0}
        if asset == "river":
            sh = [k for k in np.where(keep)[0] if mp[k].get("cls") in SHARED_CLS]
            if sh:
                b4 = shapely.bounds(to_lnglat([mg[k] for k in sh], epsg))
                fg, fc = _farm_ref(c, year, (float(b4[:, 0].min()), float(b4[:, 1].min()), float(b4[:, 2].max()), float(b4[:, 3].max())))
                if fg:
                    FT = shapely.STRtree(np.asarray(fg, dtype=object))
                    for k in sh:
                        for h in FT.query(mg[k], predicate="intersects"):
                            if fc[h] == mp[k].get("cls") and mg[k].intersection(fg[h]).area / max(min(mg[k].area, fg[h].area), 1e-9) > DUP_RATIO:
                                keep[k] = False
                                why["farm_layer"] += 1
                                break
    return keep, why


# ── 전국 결과 다시 정리(시군구 하나씩) ─────────────────────────────────────────────────────────────
def _pg():
    from national.common import pg
    return pg()


def _edited(c, jobs: list[str]) -> dict[str, set]:
    rows = c.execute("SELECT set_id, fid FROM result_edits WHERE set_id = ANY(%s) AND fid IS NOT NULL", (jobs,)).fetchall()
    out: dict[str, set] = {}
    for s, f in rows:
        out.setdefault(s, set()).add(str(f))
    return out


def _cells_tree(c, asset: str, year: int):
    rows = c.execute("SELECT cell_cd, ST_AsBinary(geom_s) FROM national_cells WHERE asset=%s AND year=%s AND NOT test AND state <> 'skip' AND geom_s IS NOT NULL",
                     (asset, year)).fetchall()
    cds = [r[0] for r in rows]
    gs = shapely.from_wkb([bytes(r[1]) for r in rows])
    return cds, gs, shapely.STRtree(gs)


def _sgg_jobs(c, asset: str, year: int, sgg: str) -> list[dict]:
    rows = c.execute(
        "SELECT n.job_id, n.cell_cd, n.part, ST_AsBinary(j.aoi), n.bbox, j.tenant_id, ST_AsBinary(c.geom_s) FROM national_jobs n "
        "JOIN national_cells c ON c.asset=n.asset AND c.year=n.year AND c.cell_cd=n.cell_cd "
        "JOIN jobs j ON j.id=n.job_id WHERE n.asset=%s AND n.year=%s AND c.sgg_cd=%s AND NOT n.test AND NOT c.test AND c.state='done' "
        "AND n.state='done' AND n.model_id IS NOT DISTINCT FROM c.model_id ORDER BY n.cell_cd, n.part", (asset, year, sgg)).fetchall()
    return [{"job": r[0], "cell": r[1], "part": r[2], "aoi": shapely.from_wkb(bytes(r[3])) if r[3] else None, "bbox": r[4], "tenant": r[5] or "lx",
             "cell_g": shapely.from_wkb(bytes(r[6])) if r[6] else None} for r in rows]


def _farm_ref(c, year: int, bbox) -> tuple[list, list]:
    """농지 · 하천 한 층 — 이 범위에 걸친 농지 전수 정리 결과의 경작지 · 비닐하우스(미터 좌표)."""
    from landxi_api.result_store import base, read_features, vector_of_base
    x0, y0, x1, y1 = bbox
    rows = c.execute(
        "SELECT n.job_id FROM national_jobs n JOIN national_cells c ON c.asset=n.asset AND c.year=n.year AND c.cell_cd=n.cell_cd "
        "WHERE n.asset='farm' AND n.year=%s AND NOT n.test AND c.state='done' AND n.state='done' AND n.model_id IS NOT DISTINCT FROM c.model_id "
        "AND n.bbox IS NOT NULL AND n.bbox[1] <= %s AND n.bbox[3] >= %s AND n.bbox[2] <= %s AND n.bbox[4] >= %s", (year, x1, x0, y1, y0)).fetchall()
    gs, cl = [], []
    for (jid,) in rows:
        p = vector_of_base(base("lx", jid))
        if not p:
            continue
        for f in read_features(p, bbox=(x0, y0, x1, y1)):
            k = (f.get("properties") or {}).get("cls")
            if k in SHARED_CLS and (f.get("properties") or {}).get("edit_state") != "deleted":
                gs.append(shapely.from_geojson(json.dumps(f["geometry"])))
                cl.append(k)
    return ([_valid(g) for g in to_metric(gs)] if gs else []), cl


def tidy_sgg(asset: str, year: int, sgg: str, *, dry: bool = False, pmtiles: bool = True, log=print) -> dict:
    """시군구 하나 — 그 안 끝난 칸의 지금 판 조각 결과를 정리(ⓑ → ⓐ → 다른 조각 중복 → 농지 · 하천 한 층). dry = 파일 · 숫자를 쓰지 않음."""
    from national.common import COUNT_CLS
    from landxi_api.result_store import base
    t0 = time.time()
    with _pg() as c:
        c.execute("SELECT set_config('app.realm','lx',false), set_config('app.tenant_id','',false)")
        jobs = _sgg_jobs(c, asset, year, sgg)
        if not jobs:
            return {"sgg": sgg, "jobs": 0}
        edited = _edited(c, [j["job"] for j in jobs])
        cds, cgs, ctree = _cells_tree(c, asset, year)
        cell_ix = {cd: k for k, cd in enumerate(cds)}
        # 1) 조각마다 원래 결과 읽기 · ⓑ 붙이기
        G, P, OWN, RAWPT = [], [], [], []
        per = {}
        for jb in jobs:
            b = base(jb["tenant"], jb["job"])
            rf = raw_path(b)
            if rf is None or not rf.exists():
                continue
            g4, props = read_raw(rf)
            gm = [_valid(g) for g in to_metric([_valid(g) for g in g4])] if g4 else []   # 투영 뒤에도 고친 도형만(GEOS 위상 오류 막기)
            ok = [k for k, g in enumerate(gm) if g is not None and not g.is_empty]
            gm = [gm[k] for k in ok]
            props = [props[k] for k in ok]
            # 칸 숫자의 바탕 = 숫자를 셀 때 읽은 결과(옛 결과 = 원래 결과 · 새 분석 = 마무리 때 정리한 결과)
            bp, bg = props, gm
            rec0 = _record(b)
            if rec0.get("by") == "finalize":
                from landxi_api.result_store import vector_of_base
                cf = vector_of_base(b)
                if cf is not None and cf.resolve() != rf.resolve():
                    g0, bp = read_raw(cf)
                    bg = to_metric([_valid(g) for g in g0]) if g0 else []
            base_rp = to_lnglat(shapely.point_on_surface(np.asarray(bg, dtype=object))) if len(bg) else []
            mg, mp, sst, cands = seam_merge(gm, props, keep_ids=edited.get(jb["job"]))
            per[jb["job"]] = {"jb": jb, "base": b, "raw": rf, "seam": sst, "cands": cands, "n_in": len(gm),
                              "raw_counts": (bp, base_rp)}
            for g, p in zip(mg, mp):
                G.append(g)
                P.append(p)
                OWN.append(jb["job"])
        if not G:
            return {"sgg": sgg, "jobs": len(jobs), "objs": 0}
        GA = np.asarray(G, dtype=object)
        RP = to_lnglat(shapely.point_on_surface(GA))
        # 2) ⓐ 이 조각 몫만
        keep = np.zeros(len(G), dtype=bool)
        by_job: dict[str, list[int]] = {}
        for k, o in enumerate(OWN):
            by_job.setdefault(o, []).append(k)
        sib = {}
        for jb in jobs:
            sib.setdefault(jb["cell"], []).append(jb)
        for jid, ks in by_job.items():
            jb = per[jid]["jb"]
            own = jb["aoi"] if jb["aoi"] is not None else jb["cell_g"]
            others = [s["aoi"] for s in sib[jb["cell"]] if s["job"] != jid and s["aoi"] is not None]
            ci = cell_ix.get(jb["cell"])
            # 다른 칸 범위만 보는 나무(이 칸은 빼고)
            class _Other:
                def query(self, p, predicate="intersects", _ci=ci):
                    hit = ctree.query(p, predicate=predicate)
                    return [h for h in hit if h != _ci]
            kk = own_keep(RP[ks], own, jb["cell_g"], others, _Other())
            ed = edited.get(jid, set())
            for a, ok in zip(ks, kk):
                keep[a] = ok or str(P[a].get("id")) in ed
        why = {"owner": int((~keep).sum())}
        # 3) 다른 조각끼리 남은 중복
        idx = np.where(keep)[0]
        allk = set().union(*edited.values()) if edited else set()
        d = cross_dedupe([G[k] for k in idx], [P[k] for k in idx], [OWN[k] for k in idx], keep_ids=allk)
        for t in d:
            keep[idx[t]] = False
        why["dup"] = len(d)
        # 4) 농지 · 하천 한 층(하천 결과의 경작지 · 비닐하우스 중 농지 결과와 같은 것)
        why["farm_layer"] = 0
        if asset == "river":
            sh = [k for k in np.where(keep)[0] if P[k].get("cls") in SHARED_CLS and str(P[k].get("id")) not in allk]
            if sh:
                b4 = shapely.bounds(to_lnglat([G[k] for k in sh]))
                bb = (float(b4[:, 0].min()), float(b4[:, 1].min()), float(b4[:, 2].max()), float(b4[:, 3].max()))
                fg, fc = _farm_ref(c, year, bb)
                if fg:
                    FT = shapely.STRtree(np.asarray(fg, dtype=object))
                    FA = shapely.area(np.asarray(fg, dtype=object))
                    for k in sh:
                        hit = FT.query(G[k], predicate="intersects")
                        for h in hit:
                            if fc[h] != P[k].get("cls"):
                                continue
                            r = G[k].intersection(fg[h]).area / max(min(G[k].area, FA[h]), 1e-9)
                            if r > DUP_RATIO:
                                keep[k] = False
                                why["farm_layer"] += 1
                                break
        # 5) 칸 숫자 차이(원래 결과 → 정리 결과 · 대표점이 칸 안인 것 · 세는 분류만)
        cnt_cls = set(COUNT_CLS[asset])
        delta: dict[str, dict[str, list]] = {}
        for jid, v in per.items():
            props, rp = v["raw_counts"]
            cg = v["jb"]["cell_g"]
            if not len(rp):
                continue
            inside = shapely.contains(cg, np.asarray(rp, dtype=object)) | shapely.touches(cg, np.asarray(rp, dtype=object))
            dc = delta.setdefault(v["jb"]["cell"], {})
            for p, ins in zip(props, inside):
                if ins and p.get("cls") in cnt_cls and p.get("edit_state") != "deleted":
                    x = dc.setdefault(p["cls"], [0, 0.0])
                    x[0] -= 1
                    x[1] -= float(p.get("area_m2") or 0)
        for k in np.where(keep)[0]:
            jid = OWN[k]
            cg = per[jid]["jb"]["cell_g"]
            p = P[k]
            if p.get("cls") in cnt_cls and p.get("edit_state") != "deleted" and (cg.contains(RP[k]) or cg.touches(RP[k])):
                x = delta.setdefault(per[jid]["jb"]["cell"], {}).setdefault(p["cls"], [0, 0.0])
                x[0] += 1
                x[1] += float(p.get("area_m2") or 0)
        # 6) 쓰기
        G4 = to_lnglat(G)
        st = {"sgg": sgg, "asset": asset, "year": year, "jobs": len(per), "in": sum(v["n_in"] for v in per.values()),
              "out": int(keep.sum()), "merged_pieces": sum(v["seam"]["merged_pieces"] for v in per.values()),
              "merged_into": sum(v["seam"]["merged_into"] for v in per.values()), "candidates": sum(len(v["cands"]) for v in per.values()),
              "dropped": why, "changed_jobs": 0, "delta": {cd: {k: [x[0], round(x[1] / 1e6, 4)] for k, x in v.items()} for cd, v in delta.items()}}
        if dry:
            st["sec"] = round(time.time() - t0, 1)
            return st
        for jid, v in per.items():
            ks = by_job.get(jid, [])
            kept = [k for k in ks if keep[k]]
            rec = {"in": v["n_in"], "out": len(kept), "seam": v["seam"], "candidates": v["cands"],
                   "dropped": {"owner": sum(1 for k in ks if not keep[k])}, "changed": len(kept) != v["n_in"] or v["seam"]["merged_into"] > 0}
            if rec["changed"]:
                st["changed_jobs"] += 1
            write_clean(v["base"], v["raw"], [G4[k] for k in kept], [P[k] for k in kept], rec, pmtiles=pmtiles)
        # 숫자 — 칸마다 차이만큼(고치기로 바뀐 값은 그대로). 이미 같은 판 · 같은 조각으로 고친 칸은 건너뜀(다시 돌려도 두 번 빼지 않음)
        stt = _state(asset, year, sgg)
        done = dict(stt.get("cells") or {}) if stt.get("v") == VERSION else {}
        sig = {}
        for jb in jobs:
            sig.setdefault(jb["cell"], []).append(jb["job"])
        applied = {}
        with c.transaction():
            for cd, dv in delta.items():
                key = ",".join(sorted(sig.get(cd, [])))
                if done.get(cd) == key:
                    continue
                row = c.execute("SELECT counts FROM national_cells WHERE asset=%s AND year=%s AND cell_cd=%s FOR UPDATE", (asset, year, cd)).fetchone()
                cnt = dict(row[0] or {}) if row else {}
                for k, (dn, da) in dv.items():
                    x = dict(cnt.get(k) or {"n": 0, "km2": 0})
                    x["n"] = max(0, int(x.get("n") or 0) + dn)
                    x["km2"] = round(max(0.0, float(x.get("km2") or 0) + da / 1e6), 3)
                    cnt[k] = x
                c.execute("UPDATE national_cells SET counts=%s WHERE asset=%s AND year=%s AND cell_cd=%s", (json.dumps(cnt, ensure_ascii=False), asset, year, cd))
                applied[cd] = {k: [dn, round(da / 1e6, 4)] for k, (dn, da) in dv.items()}
                done[cd] = key
        _state_put(asset, year, sgg, {"v": VERSION, "at": dt.datetime.now(KST).isoformat(timespec="seconds"), "cells": done,
                                      "applied": {**(stt.get("applied") or {}), **applied}, "stats": {k: v for k, v in st.items() if k != "delta"}})
    st["sec"] = round(time.time() - t0, 1)
    log(json.dumps({k: v for k, v in st.items() if k != "delta"}, ensure_ascii=False))
    return st


def _sggs(asset: str, year: int) -> list[str]:
    with _pg() as c:
        return [r[0] for r in c.execute("SELECT sgg_cd FROM national_cells WHERE asset=%s AND year=%s AND NOT test AND state='done' "
                                         "GROUP BY sgg_cd ORDER BY count(*) DESC", (asset, year)).fetchall()]


def _state_dir(asset: str, year: int) -> Path:
    from landxi_api import config as C
    return C.DATA_ROOT / "_logs" / "tidy" / f"{asset}-{year}"


def _state(asset: str, year: int, sgg: str) -> dict:
    try:
        return json.loads((_state_dir(asset, year) / f"{sgg}.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def _state_put(asset: str, year: int, sgg: str, d: dict) -> None:
    p = _state_dir(asset, year) / f"{sgg}.json"
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".part")
    tmp.write_text(json.dumps(d, ensure_ascii=False, indent=0), encoding="utf-8")
    os.replace(tmp, p)


def _record(b: Path) -> dict:
    try:
        return json.loads(tidy_path(b).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def _done_sggs(asset: str, year: int) -> set[str]:
    """이 판으로 정리를 마친 시군구(정리 상태 파일) — 다시 돌릴 때 건너뜀."""
    d = _state_dir(asset, year)
    out = set()
    for f in d.glob("*.json") if d.exists() else []:
        try:
            if json.loads(f.read_text(encoding="utf-8")).get("v") == VERSION:
                out.add(f.stem)
        except (OSError, ValueError):
            pass
    return out


def _low_priority():
    try:
        import psutil
        p = psutil.Process()
        p.nice(psutil.BELOW_NORMAL_PRIORITY_CLASS if os.name == "nt" else 10)
    except Exception:  # noqa: BLE001
        pass


def _one(a):
    asset, year, sgg, logf = a
    _low_priority()
    try:
        out = tidy_sgg(asset, year, sgg, log=lambda s: None)
    except Exception as e:  # noqa: BLE001 — 한 시군구가 실패해도 나머지는 계속(다시 돌리면 그 시군구만)
        out = {"sgg": sgg, "error": repr(e)[:300]}
    with open(logf, "a", encoding="utf-8") as f:
        f.write(json.dumps({k: v for k, v in out.items() if k != "delta"}, ensure_ascii=False) + "\n")
    return out


def main():
    for s_ in (sys.stdout, sys.stderr):
        try:
            s_.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass
    ap = argparse.ArgumentParser()
    ap.add_argument("--asset", default="farm", choices=("farm", "river"))
    ap.add_argument("--year", type=int, default=2025)
    ap.add_argument("--sgg", default="")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--workers", type=int, default=3)
    ap.add_argument("--log", default="")
    a = ap.parse_args()
    _low_priority()
    if a.sgg:
        for s in a.sgg.split(","):
            r = tidy_sgg(a.asset, a.year, s.strip(), dry=a.dry)
            print(json.dumps(r, ensure_ascii=False))
        return
    if not a.all:
        ap.error("--sgg 또는 --all")
    todo = [s for s in _sggs(a.asset, a.year) if s not in _done_sggs(a.asset, a.year)]
    from landxi_api import config as _C
    logf = a.log or str(_C.DATA_ROOT / "_logs" / "tidy" / f"tidy-{a.asset}-{a.year}.jsonl")
    Path(logf).parent.mkdir(parents=True, exist_ok=True)
    print(f"시군구 {len(todo)}곳 · 일꾼 {a.workers} · 기록 {logf}", flush=True)
    from concurrent.futures import ProcessPoolExecutor
    t0 = time.time()
    with ProcessPoolExecutor(max_workers=max(1, a.workers)) as ex:
        for k, r in enumerate(ex.map(_one, [(a.asset, a.year, s, logf) for s in todo]), 1):
            print(f"{k}/{len(todo)} {r.get('sgg')} 조각 {r.get('jobs')} · {r.get('in')} → {r.get('out')} · {round(time.time() - t0)}s", flush=True)


if __name__ == "__main__":
    main()
