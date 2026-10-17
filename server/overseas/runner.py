"""해외 결과 자산 작업기 — 나라 전체(군 칸)를 학습 장비가 놀 때 하나씩 분석해 결과만 쌓는다(원칙 256 · 260 · 국내 전국 작업기와 같은 틀).

  python -m overseas.runner --loop            나라 전체(설정 'overseas.run' · 켜기 · 나라 · 연도 · 모델) — 남은 칸이 없거나 멈춤이면 끝
  python -m overseas.runner --seed            칸 장부 만들기(군 경계 · 한 번)
  python -m overseas.runner --status          지금 상태 한 줄
  python -m overseas.runner --summary         끝난 칸 숫자(경작지 · 시가지 · 물) 합계

칸 하나:
  ① 달별 합성(CPU · 네트워크 — AWS 공개 Sentinel-2 · 키 없음) — 다음 칸을 미리 굽는다(학습 장비와 상관없음). 파일 = 02. 데이터/overseas/{나라}/{연도}/work
  ② 게이트웨이 작업 대기열로만(kind infer · 우선순위 3 · options.overseas) — 조각(≤ 1,500㎢)을 하나씩 넣고 끝날 때까지 기다린다.
     GPU 워커는 전국 작업과 같은 규칙(정한 한 장 · 작은 묶음 + 쉼 · 사용률 70 % · 140 W · 다른 작업이 오면 비킴)으로 돌린다.
  ③ 칸 마무리 — 숫자(객체 중심이 칸 안) · 낮은 줌 면 · 장부 done(한 거래) → 결과 객체 줄은 지움(E: 결과 묶음 파일 = 지도 조각 · GeoJSON 에 남음)
     → 중간 칩 파일 · 합성 파일 지움.
대기열 규칙(전국 작업기와 겹치지 않게):
  · 사용자 작업(기관 · 직원 분석 · 학습 · 시험)이 대기열에 있거나 돌면 다음 조각을 넣지 않는다(비킴).
  · 전국 작업기 조각이 대기열에 있거나 돌면 그 조각이 끝날 때까지 기다린다(겹쳐 넣지 않음). 전국 작업기는 우리 조각이 있으면 비킨다.
  · 해외 칸 하나가 끝나면 전국 작업기에 차례를 준다(전국 조각 하나가 끝나거나 5분까지 기다림) — 둘이 번갈아.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import os
import shutil
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from landxi_api import config  # noqa: E402
from national.common import KST, pg  # noqa: E402

DEF = {"enabled": True, "country": "kgz", "year": 2025, "model": None}
COUNTRY_NAME = {"kgz": "키르기스스탄"}
ADM1_ORDER = {"kgz": ["Chuy", "Talas", "Issyk-Kul", "Naryn", "Jalal-Abad", "Osh", "Batken"]}
CLS = ("경작지", "시가지", "물")
PRIORITY = 3
PART_KM2 = 1500.0
TRIES = 3
TURN_WAIT_S = 300
OBS = 1                 # 나라 전체 합성은 화소마다 맑은 관측 1개(구름 적은 순 첫 번째) — 받는 양이 절반(학습 묶음은 2개 평균 · 실측 링크 15–45 MB/s)


def root(country: str, year: int) -> Path:
    return config.DATA_ROOT / "overseas" / country / str(year)


_st = {"country": "kgz", "year": 2025}


def out_dir() -> Path:
    p = root(_st["country"], _st["year"])
    p.mkdir(parents=True, exist_ok=True)
    return p


def log(*a):
    line = time.strftime("%m-%d %H:%M:%S") + " " + " ".join(str(x) for x in a)
    print(line, flush=True)
    try:
        with open(out_dir() / "runner.log", "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except OSError:
        pass


def status(**kw):
    p = out_dir() / "runner.json"
    try:
        cur = json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}
    except Exception:  # noqa: BLE001
        cur = {}
    cur = {k: cur[k] for k in ("last_done", "started") if k in cur}
    cur.update(kw, at=dt.datetime.now(KST).isoformat(timespec="seconds"), pid=os.getpid())
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(cur, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, p)


def _jv(v):
    return json.loads(v) if isinstance(v, str) else (v or {})


def settings(c) -> dict:
    row = c.execute("SELECT value FROM lx_settings WHERE key='overseas.run'").fetchone()
    return {**DEF, **(_jv(row[0]) if row else {})}


# ── 하나만 돌게 ────────────────────────────────────────────────────────────
def take_lock() -> bool:
    from national.runner import _alive
    lk = out_dir() / "runner.lock"
    try:
        pid = int(lk.read_text().strip() or 0) if lk.exists() else 0
    except Exception:  # noqa: BLE001
        pid = 0
    if pid and pid != os.getpid() and _alive(pid):
        return False
    lk.write_text(str(os.getpid()))
    return True


def drop_lock():
    lk = out_dir() / "runner.lock"
    try:
        if lk.exists() and lk.read_text().strip() == str(os.getpid()):
            lk.unlink()
    except OSError:
        pass


# ── 칸 장부 ─────────────────────────────────────────────────────────────────
def seed(c, country: str, year: int) -> int:
    """군(ADM2) 경계 → 칸. 경계를 받지 못한 시(비슈케크 = 둘레 사각형)는 이웃 군을 뺀 나머지."""
    from pyproj import Geod
    from shapely.geometry import MultiPolygon, Polygon, shape
    from shapely.ops import unary_union
    n = c.execute("SELECT count(*) FROM overseas_cells WHERE country=%s AND year=%s", (country, year)).fetchone()[0]
    if n:
        return n
    g2 = json.loads((config.DATA_ROOT / "global" / f"{country}-adm2.geojson").read_text(encoding="utf-8"))
    g1 = json.loads((config.DATA_ROOT / "global" / f"{country}-adm1.geojson").read_text(encoding="utf-8"))
    adm1 = [(f["properties"]["code"], f["properties"]["name"].replace(" Region", ""), shape(f["geometry"])) for f in g1["features"]]
    feats = [(f["properties"], shape(f["geometry"])) for f in g2["features"]]
    real = unary_union([g for p, g in feats if "boundary not acquired" not in json.dumps(p) and "(city)" not in p["name"]])
    order = ADM1_ORDER.get(country, [])
    geod = Geod(ellps="WGS84")
    rows = []
    for p, g in feats:
        if "(city)" in p["name"]:
            g = g.difference(real)
        if not g.is_valid:
            g = g.buffer(0)
        polys = [x for x in getattr(g, "geoms", [g]) if isinstance(x, Polygon) and not x.is_empty and abs(geod.geometry_area_perimeter(x)[0]) > 1e6]
        if not polys:
            continue
        mp = MultiPolygon(polys)
        rp = mp.representative_point()
        a1 = next(((cd, nm) for cd, nm, ag in adm1 if ag.contains(rp)), (None, None))
        km2 = abs(geod.geometry_area_perimeter(mp)[0]) / 1e6
        rank = order.index(a1[1]) if a1[1] in order else 99
        rows.append((rank, -km2, p["code"], p["name"], a1, mp))
    rows.sort(key=lambda r: (r[0], r[1]))
    for k, (rank, nk, cd, nm, a1, mp) in enumerate(rows):
        c.execute("INSERT INTO overseas_cells(country, year, cell_cd, adm1, adm1_name, name, ord, area_km2, geom, geom_s) VALUES "
                  "(%s,%s,%s,%s,%s,%s,%s,%s,ST_Multi(ST_GeomFromText(%s,4326)),ST_Multi(ST_SimplifyPreserveTopology(ST_GeomFromText(%s,4326),0.001))) "
                  "ON CONFLICT DO NOTHING", (country, year, cd, a1[0], a1[1], nm, k, round(-nk, 2), mp.wkt, mp.wkt))
    log(f"칸 장부 — {COUNTRY_NAME.get(country, country)} {year} · 군 {len(rows)}")
    return len(rows)


# ── 달별 합성(미리 굽기) ─────────────────────────────────────────────────────
def stack_path(country: str, year: int, cd: str) -> Path:
    return root(country, year) / "work" / f"{cd}.tif"


def imagery_id(country: str, year: int, cd: str) -> str:
    return f"ovs-s2m-{country}-{year}-{cd}"


def prepare(country: str, year: int, cd: str) -> dict:
    """칸 하나 달별 합성 → GeoTIFF(42 띠) + 영상 등록(footprint 없음 — 영상 목록 · 고르기에 나오지 않음)."""
    from pyproj import Transformer
    from shapely import wkt
    from shapely.ops import transform as sh_tr
    from overseas import s2
    from national.runner import _alive
    p = stack_path(country, year, cd)
    meta_p = p.with_suffix(".json")
    lk = p.with_suffix(".lock")
    while True:                                     # 같은 칸을 다른 프로세스가 굽고 있으면 끝날 때까지 기다린다(작업기를 다시 켜도 두 번 굽지 않게)
        if p.exists() and meta_p.exists():
            return json.loads(meta_p.read_text(encoding="utf-8"))
        try:
            pid = int(lk.read_text().strip() or 0) if lk.exists() else 0
        except (OSError, ValueError):
            pid = 0
        if not pid or pid == os.getpid() or not _alive(pid):
            break
        time.sleep(15)
    p.parent.mkdir(parents=True, exist_ok=True)
    lk.write_text(str(os.getpid()))
    with pg() as c:
        row = c.execute("SELECT ST_AsText(geom), name FROM overseas_cells WHERE country=%s AND year=%s AND cell_cd=%s", (country, year, cd)).fetchone()
    geom = wkt.loads(row[0])
    grid = s2.grid_for(geom, pad_m=200)
    gu = sh_tr(Transformer.from_crs(4326, grid.epsg, always_xy=True).transform, geom).buffer(500)
    blocks = s2.blocks_of(grid, mask_geom=gu)
    t0 = time.time()
    log(f"합성 시작 {cd} {row[1]} · 격자 {grid.w}×{grid.h} · 조각 {len(blocks)}")
    stack, st = s2.composite(grid, year, blocks=blocks, log=lambda m: print(time.strftime('%H:%M:%S'), m, flush=True), threads=48,
                               max_obs=OBS)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".tmp.tif")
    s2.write_tif(tmp, stack, grid, {"country": country, "year": year, "cell": cd, "months": st["months"]})
    del stack
    os.replace(tmp, p)
    info = {"cell": cd, "path": str(p), "grid": st["grid"], "months": st["months"], "sec": round(time.time() - t0), "bytes": p.stat().st_size}
    with pg() as c:
        c.execute(
            "INSERT INTO imagery(id, name, tier, gsd_m, epoch, crs, path_internal, license, attribution, export_policy, rights_holder, kind, layer, year, "
            "registered_by, registered_at) VALUES (%s,%s,'raw',10,%s,%s,%s,%s,'Copernicus Sentinel-2(ESA) · AWS 공개 자료','never','ESA Copernicus',"
            "'s2-monthly',%s,%s,'overseas',now()) ON CONFLICT (id) DO UPDATE SET path_internal=EXCLUDED.path_internal, layer=EXCLUDED.layer, crs=EXCLUDED.crs",
            (imagery_id(country, year, cd),
             json.dumps({"ko": f"Sentinel-2 달별 합성 {year} · {row[1]}", "en": f"Sentinel-2 monthly composite {year} · {row[1]}"}, ensure_ascii=False),
             str(year), f"EPSG:{grid.epsg}", str(p), "Copernicus Sentinel-2 공개 자료 — 합성은 분석 뒤 지움 · 결과만 저장",
             json.dumps({"role": "overseas", "source": "sentinel-2-l2a(aws earth search)", "country": country, "cell": cd, "months": list(s2.MONTHS)}),
             year))
        c.execute("UPDATE overseas_cells SET imagery=%s WHERE country=%s AND year=%s AND cell_cd=%s",
                  (json.dumps(st["months"], ensure_ascii=False), country, year, cd))
    meta_p.write_text(json.dumps(info, ensure_ascii=False), encoding="utf-8")
    try:
        lk.unlink()
    except OSError:
        pass
    log(f"합성 끝 {cd} · {info['sec']}s · {info['bytes'] / 1e9:.2f} GB · 맑음 {min(v['clear_share'] for v in st['months'].values()):.0%}–"
        f"{max(v['clear_share'] for v in st['months'].values()):.0%}")
    return info


def drop_stack(country: str, year: int, cd: str):
    p = stack_path(country, year, cd)
    for f in (p, p.with_suffix(".json"), p.with_suffix(".tmp.tif")):
        for k in range(5):
            try:
                if f.exists():
                    f.unlink()
                break
            except OSError:
                time.sleep(2)
    with pg() as c:
        c.execute("UPDATE imagery SET layer = coalesce(layer, '{}'::jsonb) || '{\"removed\": true}'::jsonb WHERE id=%s", (imagery_id(country, year, cd),))


class Prefetch:
    """다음 칸들 합성을 미리 — 칸마다 따로 프로세스(학습 장비와 상관없는 CPU · 네트워크 일 · 동시 MAX_PREP 개)."""
    MAX_PREP = 4

    def __init__(self, country: str, year: int):
        self.country, self.year = country, year
        self.procs: dict = {}

    def alive(self) -> int:
        return sum(1 for p in self.procs.values() if p.poll() is None)

    def start(self, cd: str | None):
        import subprocess
        if not cd or cd in self.procs:
            return
        if stack_path(self.country, self.year, cd).with_suffix(".json").exists():
            return
        if self.alive() >= self.MAX_PREP:
            return
        lf = open(out_dir() / f"prep-{cd}.log", "a", encoding="utf-8")
        self.procs[cd] = subprocess.Popen([sys.executable, "-m", "overseas.runner", "--prepare", cd], cwd=str(Path(__file__).resolve().parents[1]),
                                          stdout=lf, stderr=subprocess.STDOUT, env={**os.environ, "PYTHONIOENCODING": "utf-8"},
                                          creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))

    def get(self, cd: str) -> dict:
        meta = stack_path(self.country, self.year, cd).with_suffix(".json")
        if meta.exists():
            self.procs.pop(cd, None)
            return json.loads(meta.read_text(encoding="utf-8"))
        self.start(cd)
        p = self.procs.get(cd)
        if p is None:                                   # 자리가 없으면 이 프로세스에서 바로
            return prepare(self.country, self.year, cd)
        while p.poll() is None:
            status(state="prepare", cell=cd)
            time.sleep(15)
        self.procs.pop(cd, None)
        if not meta.exists():
            raise RuntimeError(f"합성 실패(종료 코드 {p.returncode}) — prep-{cd}.log")
        return json.loads(meta.read_text(encoding="utf-8"))


# ── 차례(대기열 규칙) ───────────────────────────────────────────────────────
def users_busy(c) -> list[str]:
    rows = c.execute("SELECT j.kind, count(*) FROM jobs j WHERE j.state IN ('queued','running') AND j.pool <> 'cpu' "
                     "AND NOT EXISTS (SELECT 1 FROM national_jobs n WHERE n.job_id=j.id) "
                     "AND NOT EXISTS (SELECT 1 FROM overseas_jobs o WHERE o.job_id=j.id) GROUP BY j.kind").fetchall()
    return [f"{k} {n}" for k, n in rows]


def national_busy(c) -> int:
    return c.execute("SELECT count(*) FROM jobs j JOIN national_jobs n ON n.job_id=j.id WHERE j.state IN ('queued','running')").fetchone()[0]


def wait_turn(c, cd: str | None = None):
    while True:
        st = settings(c)
        if not st.get("enabled", True):
            raise Pause("멈춤")
        u = users_busy(c)
        if u:
            status(state="yield", why="다른 학습 장비 작업", busy=u, cell=cd)
            time.sleep(15)
            continue
        if national_busy(c):
            status(state="yield", why="전국 작업기 조각이 도는 중", cell=cd)
            time.sleep(2)
            continue
        return


def give_turn(c, since: float):
    """해외 칸 하나가 끝나면 전국 작업기에 차례 — 전국 조각 하나가 끝나거나 5분."""
    t0 = time.time()
    nat = config.DATA_ROOT / "national" / "runner.json"
    try:
        ns = json.loads(nat.read_text(encoding="utf-8")).get("state")
    except Exception:  # noqa: BLE001
        ns = None
    if ns in ("paused", "all_done", None):
        return
    while time.time() - t0 < TURN_WAIT_S:
        n = c.execute("SELECT count(*) FROM national_jobs WHERE done_at >= to_timestamp(%s)", (since,)).fetchone()[0]
        if n:
            break
        status(state="turn", why="전국 작업기 차례")
        time.sleep(10)
    while national_busy(c) and time.time() - t0 < TURN_WAIT_S * 2:
        time.sleep(3)


class Pause(Exception):
    pass


# ── 칸 하나 ────────────────────────────────────────────────────────────────
def parts_of(geom) -> list:
    """칸 범위 → 작업 조각(한 면 · PART_KM2 이하 · 측지 넓이) — 큰 군은 격자로."""
    from pyproj import Geod
    from shapely.geometry import Polygon, box
    geod = Geod(ellps="WGS84")

    def km2(p):
        return abs(geod.geometry_area_perimeter(p)[0]) / 1e6
    out = []
    for p in getattr(geom, "geoms", [geom]):
        if not isinstance(p, Polygon) or p.is_empty:
            continue
        a = km2(p)
        if a <= PART_KM2:
            out.append(p)
            continue
        n = math.ceil(math.sqrt(a / (PART_KM2 * 0.6)))
        x0, y0, x1, y1 = p.bounds
        dx, dy = (x1 - x0) / n, (y1 - y0) / n
        for i in range(n):
            for j in range(n):
                q = p.intersection(box(x0 + i * dx, y0 + j * dy, x0 + (i + 1) * dx, y0 + (j + 1) * dy))
                for x in getattr(q, "geoms", [q]):
                    if isinstance(x, Polygon) and km2(x) >= 0.5:
                        if km2(x) > PART_KM2:
                            x = x.buffer(0)
                        out.append(x)
    return out


def run_cell(c, g, country: str, year: int, cd: str, model: str, pf: Prefetch, nxt: list | None) -> dict:
    from shapely import wkt
    from shapely.geometry import mapping
    row = c.execute("SELECT ST_AsText(geom), name, adm1_name, ST_AsText(ST_SimplifyPreserveTopology(geom, 0.001)) FROM overseas_cells "
                    "WHERE country=%s AND year=%s AND cell_cd=%s", (country, year, cd)).fetchone()
    geom = wkt.loads(row[0])
    t0 = time.time()
    for x in nxt or []:                             # 다음 칸들 합성을 미리
        pf.start(x)
    info = pf.get(cd)
    for x in nxt or []:
        pf.start(x)
    iid = imagery_id(country, year, cd)
    parts = parts_of(geom)
    c.execute("UPDATE overseas_cells SET state='running', started_at=now(), err=NULL WHERE country=%s AND year=%s AND cell_cd=%s", (country, year, cd))
    jobs = []
    for k, p in enumerate(parts):
        wait_turn(c, cd)
        prev = c.execute("SELECT o.job_id FROM overseas_jobs o JOIN jobs j ON j.id=o.job_id WHERE o.country=%s AND o.year=%s AND o.cell_cd=%s "
                         "AND o.part=%s AND j.state IN ('queued','running','done') AND j.model_id=%s ORDER BY o.at DESC LIMIT 1",
                         (country, year, cd, k, model)).fetchone()
        if prev:
            jid = prev[0]
        else:
            body = {"kind": "infer", "model_id": model, "imagery_id": iid, "aoi": mapping(p), "priority": PRIORITY,
                    "label": f"overseas/{country}/{year}/{cd}/{k}",
                    "options": {"max_km2": 3000, "chip": 512, "overlap": 64, "min_area_m2": 800,
                                "overseas": {"country": country, "year": year, "cell": cd, "name": row[1], "stack": info["path"],
                                             "clip_wkt": row[3]}}}
            r = g.call("POST", "/jobs", json=body)
            if r.status_code >= 300:
                raise RuntimeError(f"작업 넣기 실패 {r.status_code} {r.text[:300]}")
            jid = r.json()["job"]["id"]
        jobs.append(jid)
        c.execute("INSERT INTO overseas_jobs(job_id, country, year, cell_cd, part, model_id) VALUES (%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING",
                  (jid, country, year, cd, k, model))
        log(f"  조각 {k + 1}/{len(parts)} 넣음 {jid}")
        while True:
            time.sleep(6)
            v = g.call("GET", f"/jobs/{jid}").json()
            v = v.get("job", v)
            s = v.get("state")
            if s in ("done", "failed", "cancelled"):
                c.execute("UPDATE overseas_jobs SET state=%s, done_at=now() WHERE job_id=%s", (s, jid))
                if s != "done":
                    raise RuntimeError(f"작업 {s}: {str(v.get('error') or '')[:200]}")
                if int(v.get("shards_failed") or 0) > 0:
                    raise RuntimeError(f"작업 칩 {v.get('shards_failed')}개 실패 — 칸을 다시")
                break
            status(state="running", cell=cd, name=row[1], part=k + 1, parts=len(parts), done=v.get("shards_done"), total=v.get("shards_total"))
    with c.transaction():
        out = finish_cell(c, country, year, cd, jobs, model, t0, info)
    drop_stack(country, year, cd)
    out["sec"] = round(time.time() - t0)
    return out


def finish_cell(c, country: str, year: int, cd: str, jobs: list[str], model: str, t0: float, info: dict) -> dict:
    inside = ("FROM detections d JOIN overseas_cells n ON n.country=%s AND n.year=%s AND n.cell_cd=%s "
              "WHERE d.job_id = ANY(%s) AND d.cls = ANY(%s) AND coalesce(d.edit_state, 'raw') <> 'deleted' "
              "AND ST_Intersects(n.geom, ST_PointOnSurface(d.geom))")
    args = (country, year, cd, jobs, list(CLS))
    rows = c.execute(f"SELECT d.cls, count(*), coalesce(sum(d.area_m2),0) {inside} GROUP BY d.cls", args).fetchall()
    counts = {k: {"n": int(n), "km2": round(float(a) / 1e6, 3)} for k, n, a in rows}
    c.execute("DELETE FROM overseas_faces WHERE country=%s AND year=%s AND cell_cd=%s", (country, year, cd))
    # 낮은 줌 면 — 면을 녹여 합친 뒤 단순화(lvl 0 ≈ 200 m · 4 ha 이상 / lvl 1 ≈ 80 m · 0.5 ha 이상). 토지 피복은 면이 커서 국내 격자 방식 대신.
    for lvl, tol, min_m2 in ((0, 0.002, 40000), (1, 0.0008, 5000)):
        c.execute(f"INSERT INTO overseas_faces(country, year, cell_cd, lvl, cls, geom) "
                  f"SELECT %s, %s, %s, %s, cls, ST_Multi(ST_CollectionExtract(ST_SimplifyPreserveTopology(ST_UnaryUnion(ST_Collect(geom)), {tol}), 3)) FROM ("
                  f" SELECT d.cls, d.geom {inside} AND d.area_m2 >= %s) q GROUP BY cls", (country, year, cd, lvl) + args + (min_m2,))
    for jid in jobs:
        b = c.execute("SELECT ST_XMin(e), ST_YMin(e), ST_XMax(e), ST_YMax(e) FROM (SELECT ST_Extent(geom) e FROM detections WHERE job_id=%s) q", (jid,)).fetchone()
        rs = c.execute("SELECT result_set FROM jobs WHERE id=%s", (jid,)).fetchone()
        c.execute("UPDATE overseas_jobs SET bbox=%s, result_set=%s WHERE job_id=%s",
                  ([round(float(v), 6) for v in b] if b and b[0] is not None else None, rs[0] if rs else None, jid))
    deleted = c.execute("DELETE FROM detections WHERE job_id = ANY(%s) AND id NOT IN (SELECT det_id FROM result_edits WHERE set_id = ANY(%s) "
                        "AND det_id IS NOT NULL)", (jobs, jobs)).rowcount
    freed = 0
    for jid in jobs:
        d = config.DATA_ROOT / "results" / "lx" / jid / "shards"
        if d.exists():
            freed += sum(f.stat().st_size for f in d.glob("*") if f.is_file())
            shutil.rmtree(d, ignore_errors=True)
    c.execute("UPDATE overseas_cells SET state='done', done_at=now(), counts=%s, err=NULL, model_id=%s, tries=0, next_try_at=NULL, "
              "started_at=coalesce(to_timestamp(%s), started_at) WHERE country=%s AND year=%s AND cell_cd=%s",
              (json.dumps(counts, ensure_ascii=False), model, t0, country, year, cd))
    return {"counts": counts, "jobs": len(jobs), "rows_moved_out": deleted, "freed_mb": round(freed / 1e6, 1),
            "stack_gb": round((info or {}).get("bytes", 0) / 1e9, 2)}


def fail_cell(c, country: str, year: int, cd: str, err: str):
    row = c.execute("UPDATE overseas_cells SET tries=tries+1, err=%s WHERE country=%s AND year=%s AND cell_cd=%s RETURNING tries",
                    (err[:500], country, year, cd)).fetchone()
    tries = row[0] if row else TRIES
    wait = 10 * 2 ** (tries - 1)
    c.execute("UPDATE overseas_cells SET state=%s, next_try_at=now() + make_interval(mins => %s) WHERE country=%s AND year=%s AND cell_cd=%s",
              ("failed" if tries >= TRIES else "todo", wait, country, year, cd))
    log(f"  실패({tries}/{TRIES}) — {wait}분 뒤 다시: {err[:200]}")


def next_cells(c, country: str, year: int, model: str, n: int = 2) -> list:
    return c.execute(
        "SELECT cell_cd, name FROM overseas_cells WHERE country=%s AND year=%s AND NOT test "
        "AND (state='todo' OR (state='failed' AND tries < %s) OR (state='done' AND model_id IS DISTINCT FROM %s AND tries < %s)) "
        "AND coalesce(next_try_at, now() - interval '1 s') <= now() ORDER BY ord LIMIT %s", (country, year, TRIES, model, TRIES, n)).fetchall()


def loop():
    from national.runner import Gate
    with pg() as c:
        st = settings(c)
    _st.update(country=st["country"], year=int(st["year"]))
    from overseas import s2
    s2.net_env()
    if not take_lock():
        print("이미 돌고 있음")
        return
    g = Gate()
    try:
        with pg() as c:
            seed(c, _st["country"], _st["year"])
            c.execute("UPDATE overseas_cells SET state='todo' WHERE state='running' AND country=%s AND year=%s", (_st["country"], _st["year"]))
            pf = Prefetch(_st["country"], _st["year"])
            status(state="start", started=dt.datetime.now(KST).isoformat(timespec="seconds"))
            while True:
                st = settings(c)
                if not st.get("enabled", True):
                    status(state="paused")
                    log("멈춤 설정 — 끝")
                    return
                model = st.get("model")
                if not model:
                    status(state="no_model")
                    log("모델이 정해지지 않음(설정 overseas.run.model) — 끝")
                    return
                country, year = st["country"], int(st["year"])
                nx = next_cells(c, country, year, model, n=2 + Prefetch.MAX_PREP)
                if not nx:
                    # 다시 할 차례를 기다리는 칸(실패 · next_try_at 이 아직)이 있으면 끝내지 않고 기다린다
                    # (10-16 03:43 실측: 두 칸 합성이 실패해 10분 뒤 다시 할 차례였는데 '남은 칸 없음'으로 끝나 하루 넘게 멈춤)
                    wait = c.execute("SELECT min(next_try_at) FROM overseas_cells WHERE country=%s AND year=%s AND NOT test "
                                     "AND ((state IN ('todo','failed') AND tries < %s) OR (state='done' AND model_id IS DISTINCT FROM %s AND tries < %s))",
                                     (country, year, TRIES, model, TRIES)).fetchone()[0]
                    if wait is not None:
                        status(state="wait_retry", until=wait.isoformat(timespec="seconds"))
                        time.sleep(30)
                        continue
                    status(state="all_done", country=country, year=year)
                    log("남은 칸 없음 — 끝")
                    return
                nx = sorted(nx, key=lambda r: not stack_path(country, year, r[0]).with_suffix(".json").exists())   # 합성이 다 된 칸부터(순서는 그다음)
                cd, name = nx[0]
                log(f"칸 {cd} {name} 시작")
                try:
                    res = run_cell(c, g, country, year, cd, model, pf, [x[0] for x in nx[1:]])
                    log(f"칸 {cd} {name} 끝 {json.dumps(res, ensure_ascii=False)}")
                    status(state="cell_done", cell=cd, last_done=dt.datetime.now(KST).isoformat(timespec="seconds"))
                    give_turn(c, time.time() - 1)
                except Pause:
                    c.execute("UPDATE overseas_cells SET state='todo' WHERE country=%s AND year=%s AND cell_cd=%s", (country, year, cd))
                    log(f"칸 {cd} 멈춤 — 다시 켜면 이어서")
                    continue
                except Exception as e:  # noqa: BLE001
                    fail_cell(c, country, year, cd, repr(e))
                    time.sleep(20)
    finally:
        drop_lock()


def summary(country: str = "kgz", year: int = 2025) -> dict:
    with pg() as c:
        cells = c.execute("SELECT state, count(*), coalesce(sum(area_km2),0) FROM overseas_cells WHERE country=%s AND year=%s AND NOT test GROUP BY state",
                          (country, year)).fetchall()
        sums = c.execute("SELECT k, sum((v->>'n')::bigint), sum((v->>'km2')::numeric) FROM overseas_cells, jsonb_each(counts) AS e(k, v) "
                         "WHERE country=%s AND year=%s AND state='done' AND NOT test AND model_id IS NOT DISTINCT FROM "
                         "(SELECT value->>'model' FROM lx_settings WHERE key='overseas.run') GROUP BY k", (country, year)).fetchall()
        model = settings(c).get("model")
        per = c.execute("SELECT cell_cd, name, adm1_name, area_km2, counts, model_id FROM overseas_cells WHERE country=%s AND year=%s AND state='done' "
                        "AND model_id IS NOT DISTINCT FROM %s ORDER BY ord", (country, year, model)).fetchall()
    return {"country": country, "year": year, "model": model, "cells": {s: {"n": int(n), "km2": round(float(a))} for s, n, a in cells},
            "counts": {k: {"n": int(n), "km2": round(float(a), 1)} for k, n, a in sums},
            "per_cell": [{"cell": r[0], "name": r[1], "adm1": r[2], "area_km2": float(r[3] or 0), "counts": _jv(r[4])} for r in per]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--loop", action="store_true")
    ap.add_argument("--seed", action="store_true")
    ap.add_argument("--status", action="store_true")
    ap.add_argument("--summary", action="store_true")
    ap.add_argument("--prepare")
    a = ap.parse_args()
    if a.seed:
        with pg() as c:
            st = settings(c)
            _st.update(country=st["country"], year=int(st["year"]))
            print(seed(c, st["country"], int(st["year"])))
    elif a.prepare:
        from overseas import s2
        s2.net_env()
        with pg() as c:
            st = settings(c)
        _st.update(country=st["country"], year=int(st["year"]))
        print(json.dumps(prepare(st["country"], int(st["year"]), a.prepare), ensure_ascii=False)[:500])
    elif a.status:
        p = out_dir() / "runner.json"
        print(p.read_text(encoding="utf-8") if p.exists() else "{}")
    elif a.summary:
        print(json.dumps(summary(), ensure_ascii=False, indent=1))
    else:
        loop()


if __name__ == "__main__":
    main()
