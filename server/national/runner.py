"""전국 결과 자산 작업기 — 학습 장비가 놀 때면 언제든(낮 포함) 칸(읍면동)을 하나씩 분석해 결과만 연도별로 쌓는다(원칙 136 · 211 · 218 · 221).

  python -m national.runner --loop            예약 작업(LandXI-National · 15분마다 · 이미 돌면 그대로)이 부른다. 멈춤 설정이거나 남은 칸이 없을 때만 끝난다.
  python -m national.runner --test CELL [--asset farm]   낮 시험 — 칸 하나만(시험 표시 · XI맵 숫자에 들어가지 않음).
  python -m national.runner --cleanup-test    시험 칸 결과 정리(결과 객체 · 작업 · 면 · 중간 파일)
  python -m national.runner --status          지금 상태 한 줄

규칙(재학습 스케줄러와 같은 대기열 규칙 · 원칙 4 GPU 전력):
  · 시간대를 기다리지 않는다(10-12 원칙 221 — "유휴인데 왜 굳이 밤에 돌리나"). 설정 'national.run'.enabled=false 면 멈춤.
  · 학습 장비 작업은 언제나 하나 — 게이트웨이 작업 대기열로만 넣고(우선순위 가장 낮음 3), 한 조각이 끝나야 다음 조각.
  · 다른 GPU 작업(학습 · 재학습 · 기관/직원 AI 분석 · 시험)이 대기열에 있거나 돌고 있으면 다음 조각을 넣지 않고 기다린다(비킴).
    조각은 작게(MAX_PART_KM2 · 몇 분) — 사용자 작업이 들어오면 지금 조각이 끝나는 대로 비킨다(대기열 우선순위로 사용자 칩이 먼저 돈다).
  · GPU 한 장만 · 풀로드 금지 — 워커가 전국 작업(options.national)을 정한 한 장에서 작은 묶음 + 묶음 사이 쉼으로 돌린다(pools.yaml power.national).
  · 재학습의 '쉬는 시간 자동'은 그대로 — 쉬는 시간에 재학습 차례가 있으면 자리를 비운다.
  · 재학습이 오늘 밤 차례를 기다리면(GET /retrain 의 tonight) 다음 칸을 넣지 않고 자리를 비운다(최대 15분 · 학습이 들어오면 끝날 때까지).
  · 영상은 국토지리정보원 항공 타일(키 없음)을 칩마다 불러 메모리에서만 쓴다(workers.imagery_src.ApiDataset · 동시 호출 수는
    관리자 상한 fetch_max(1–16) 아래에서 오류율 · 응답 시간으로 자동 조절 · 지수 대기).
  · 칸이 끝나면: 칸 숫자(객체 중심이 칸 안인 것만) · 낮은 줌 면(격자) → 결과 객체 줄은 데이터베이스에서 지움(C: 디스크에 쌓지 않음 ·
    객체는 E: 결과 묶음 파일 = 지도 조각 · GeoJSON 에 남음) → 중간 칩 파일 바로 지움 → 장부 done(판 번호가 바뀜).
  · 실패하면 다시(10 · 20 · 40분 뒤) — 3번 넘게 실패하면 failed(관리자가 다시).
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
from national.common import ASSETS, COUNT_CLS, FACE_CLS, KST, OUT, env_file, pg, settings  # noqa: E402

API = "http://127.0.0.1:8700/api/v1"
MODEL = "aerial25/best"                 # 항공 25cm 4분류 모델(경작지 · 건물 · 비닐하우스 · 주차장)
PRIORITY = 3                            # 가장 낮음 — 기관 · 직원 분석이 언제나 먼저
MAX_PART_KM2 = 10.0                     # 조각을 작게 — 사용자 작업이 오면 몇 분 안에 비키게(원칙 221 · 게이트웨이 천장 150㎢ 보다 훨씬 작게)
TRIES = 3
LOCK = OUT / "runner.lock"
STATUS = OUT / "runner.json"
LOGF = OUT / "runner.log"
YIELD_TRAIN_S = 900


class Pause(Exception):
    """멈춤 설정 — 칸을 실패로 세지 않고 다시 켜면 이어서(끝난 조각은 다시 하지 않는다)."""


def log(*a):
    line = time.strftime("%m-%d %H:%M:%S") + " " + " ".join(str(x) for x in a)
    print(line, flush=True)
    try:
        OUT.mkdir(parents=True, exist_ok=True)
        with open(LOGF, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except OSError:
        pass


def status(**kw):
    try:
        cur = json.loads(STATUS.read_text(encoding="utf-8")) if STATUS.exists() else {}
    except Exception:  # noqa: BLE001
        cur = {}
    cur = {k: cur[k] for k in ("last_done",) if k in cur}       # 지난 상태의 칸 이름 · 시험 표시는 남기지 않는다(마지막 칸 시각만)
    cur.update(kw, at=dt.datetime.now(KST).isoformat(timespec="seconds"), pid=os.getpid())
    tmp = STATUS.with_suffix(".tmp")
    tmp.write_text(json.dumps(cur, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, STATUS)


# ── 하나만 돌게(잠금 파일 + PID 살아 있나) ─────────────────────────────────────
def _alive(pid: int) -> bool:
    if pid <= 0:
        return False
    try:
        import ctypes
        h = ctypes.windll.kernel32.OpenProcess(0x1000, False, pid)       # PROCESS_QUERY_LIMITED_INFORMATION
        if not h:
            return False
        code = ctypes.c_ulong()
        ctypes.windll.kernel32.GetExitCodeProcess(h, ctypes.byref(code))
        ctypes.windll.kernel32.CloseHandle(h)
        return code.value == 259                                         # STILL_ACTIVE
    except Exception:  # noqa: BLE001
        return False


def take_lock() -> bool:
    OUT.mkdir(parents=True, exist_ok=True)
    try:
        pid = int(LOCK.read_text().strip() or 0) if LOCK.exists() else 0
    except Exception:  # noqa: BLE001
        pid = 0
    if pid and pid != os.getpid() and _alive(pid):
        return False
    LOCK.write_text(str(os.getpid()))
    return True


def drop_lock():
    try:
        if LOCK.exists() and LOCK.read_text().strip() == str(os.getpid()):
            LOCK.unlink()
    except OSError:
        pass


# ── 게이트웨이 ──────────────────────────────────────────────────────────────
class Gate:
    def __init__(self):
        import requests
        self.s = requests.Session()
        self.h = {}

    def login(self):
        e = env_file()
        pw = os.environ.get("LX_PW") or e.get("DEV_PASSWORD")
        user = os.environ.get("LX_ADMIN_LOGIN") or e.get("LX_ADMIN_LOGIN") or "lxadmin@lx.or.kr"
        r = self.s.post(API + "/auth/login", json={"realm": "lx", "login": user, "password": pw}, timeout=30)
        r.raise_for_status()
        tok = r.json().get("token")
        self.h = {"Authorization": "Bearer " + tok} if tok else {}

    def call(self, method: str, path: str, **kw):
        """게이트웨이가 잠깐 다시 켜지는 동안(다른 작업의 재기동)은 기다렸다 다시 — 최대 약 5분."""
        import requests
        r = None
        for k in range(30):
            try:
                r = self.s.request(method, API + path, headers=self.h, timeout=60, **kw)
            except requests.RequestException:
                time.sleep(min(30, 2 ** min(k, 4)))
                continue
            if r.status_code == 401:
                self.login()
                continue
            if r.status_code in (502, 503) and k < 29:
                time.sleep(10)
                continue
            return r
        if r is None:
            raise RuntimeError("게이트웨이 응답 없음")
        return r


# ── 영상 API 원천(연도별 한 줄 · 영상 파일 없음) ─────────────────────────────
XML = """<GDAL_WMS>
  <Service name="TMS">
    <ServerUrl>https://map.ngii.go.kr/airmapprime/map/wmts?service=WMTS&amp;request=GetTile&amp;version=1.0.0&amp;layer=mapprime:air_{year}&amp;style=&amp;format=image/jpeg&amp;tilematrixset=NGIS_AIR&amp;tilematrix=${{z}}&amp;tilerow=${{y}}&amp;tilecol=${{x}}</ServerUrl>
  </Service>
  <DataWindow>
    <UpperLeftX>-200000</UpperLeftX>
    <UpperLeftY>4000000</UpperLeftY>
    <LowerRightX>16912760.32</LowerRightX>
    <LowerRightY>-13112760.32</LowerRightY>
    <TileLevel>18</TileLevel>
    <TileCountX>1</TileCountX>
    <TileCountY>1</TileCountY>
    <YOrigin>top</YOrigin>
  </DataWindow>
  <Projection>EPSG:5179</Projection>
  <BlockSizeX>256</BlockSizeX>
  <BlockSizeY>256</BlockSizeY>
  <BandsCount>3</BandsCount>
  <MaxConnections>{conn}</MaxConnections>
  <Timeout>30</Timeout>
  <UserAgent>Mozilla/5.0 (LandXI)</UserAgent>
  <Referer>https://map.ngii.go.kr/</Referer>
  <ZeroBlockHttpCodes>204,404</ZeroBlockHttpCodes>
</GDAL_WMS>
"""


def api_ok(year: int) -> bool:
    """영상 API 가 그림을 주나 — 타일 하나(전북 전주 · 25cm 층). '접속 지연' 안내 페이지(404 html) · 5xx · 끊김이면 False.
    장애 동안 칸을 실패로 세지 않고 기다리게(10-13 실측: 국토지리정보원이 몇 분 동안 안내 페이지를 줌)."""
    import requests
    res = 17112760.32 / (256 * 2 ** 18)
    x, y = int((965000 + 200000) / res / 256), int((4000000 - 1745000) / res / 256)
    url = (f"https://map.ngii.go.kr/airmapprime/map/wmts?service=WMTS&request=GetTile&version=1.0.0&layer=mapprime:air_{year}&style=&format=image/jpeg"
           f"&tilematrixset=NGIS_AIR&tilematrix=18&tilerow={y}&tilecol={x}")
    try:
        r = requests.get(url, headers={"User-Agent": "Mozilla/5.0 (LandXI)", "Referer": "https://map.ngii.go.kr/"}, timeout=30)
        return r.status_code == 200 and (r.headers.get("content-type") or "").startswith("image/")
    except Exception:  # noqa: BLE001
        return False


def wait_api(year: int, cd: str | None = None):
    """영상 API 가 돌아올 때까지 기다림(2분마다 타일 하나) — 멈춤 설정이면 Pause."""
    first = True
    while not api_ok(year):
        if first:
            log("영상 API 응답 없음(접속 지연 안내 · 오류) — 돌아올 때까지 기다림")
            first = False
        status(state="yield", why="영상 API 응답 없음", cell=cd)
        time.sleep(120)
        with pg() as c2:
            if not settings(c2).get("enabled", True):
                raise Pause("멈춤")
    if not first:
        log("영상 API 다시 응답 — 이어서")


def imagery_id(year: int) -> str:
    return f"nat-ngii-air-{year}"


def ensure_imagery(c, year: int, conn_max: int) -> str:
    """국토지리정보원 항공 정사영상 {year} 층 — 25.5cm(2020~) · EPSG:5179 타일. footprint 를 두지 않는다(영상 목록 · 영상 고르기에 나오지 않게)."""
    p = OUT / "imagery-api" / f"ngii-air-{year}.xml"
    p.parent.mkdir(parents=True, exist_ok=True)
    body = XML.format(year=year, conn=max(1, min(16, int(conn_max))))     # 동시 호출 상한(관리자 fetch_max · 1–16) — 워커의 자동 조절 장치가 이 아래에서 쓴다
    if not p.exists() or p.read_text(encoding="utf-8") != body:
        p.write_text(body, encoding="utf-8")
    iid = imagery_id(year)
    c.execute(
        "INSERT INTO imagery(id, name, tier, gsd_m, epoch, crs, path_internal, license, attribution, export_policy, rights_holder, kind, layer, year, "
        "registered_by, registered_at) VALUES (%s,%s,'raw',%s,%s,'EPSG:5179',%s,%s,'국토지리정보원','never','국토지리정보원','ortho',%s,%s,'national',now()) "
        "ON CONFLICT (id) DO UPDATE SET path_internal=EXCLUDED.path_internal, layer=EXCLUDED.layer",
        (iid, json.dumps({"ko": f"국토지리정보원 항공 정사영상 {year} · 영상 API", "en": f"NGII aerial ortho {year} · tile API"}, ensure_ascii=False),
         0.255 if year >= 2020 else 0.51, str(year), str(p), "공개 영상 API — 영상은 저장하지 않고 분석 결과만 저장",
         json.dumps({"role": "national", "source": "ngii-air-wmts", "year": year}), year))
    return iid


# ── 칸 고르기 · 비키기 ──────────────────────────────────────────────────────
def other_gpu(c) -> list[str]:
    """학습 장비를 쓰는 다른 작업(전국 작업기 것 빼고 · 시험 포함) — 있으면 비킨다."""
    rows = c.execute("SELECT j.kind, count(*) FROM jobs j WHERE j.state IN ('queued','running') AND j.pool <> 'cpu' "
                     "AND NOT EXISTS (SELECT 1 FROM national_jobs n WHERE n.job_id=j.id) GROUP BY j.kind").fetchall()
    return [f"{k} {n}" for k, n in rows]


def next_cell(c, year: int, assets) -> tuple | None:
    return c.execute(
        "SELECT asset, cell_cd, sgg_name, name, tries FROM national_cells WHERE year=%s AND asset = ANY(%s) AND NOT test "
        "AND (state='todo' OR (state='failed' AND tries < %s AND coalesce(next_try_at, now()) <= now())) "
        "AND coalesce(next_try_at, now() - interval '1 s') <= now() ORDER BY ord, asset LIMIT 1", (year, list(assets), TRIES)).fetchone()


def split_parts(geom):
    """칸 범위 → 작업 조각(한 면 · 140㎢ 이하) — 큰 조각은 격자로 나눈다."""
    from shapely.geometry import Polygon, box
    from national.targets import km2
    out = []
    for p in getattr(geom, "geoms", [geom]):
        if not isinstance(p, Polygon) or p.is_empty:
            continue
        a = km2(p)
        if a <= MAX_PART_KM2:
            out.append(p)
            continue
        n = math.ceil(math.sqrt(a / (MAX_PART_KM2 * 0.7)))
        x0, y0, x1, y1 = p.bounds
        dx, dy = (x1 - x0) / n, (y1 - y0) / n
        for i in range(n):
            for j in range(n):
                q = p.intersection(box(x0 + i * dx, y0 + j * dy, x0 + (i + 1) * dx, y0 + (j + 1) * dy))
                out += [x for x in getattr(q, "geoms", [q]) if isinstance(x, Polygon) and km2(x) >= 0.01]
    return out


# ── 한 칸 ───────────────────────────────────────────────────────────────────
def run_cell(c, g: Gate, asset: str, year: int, cd: str, iid: str, *, test: bool = False) -> dict:
    from shapely import wkt
    from shapely.geometry import mapping
    row = c.execute("SELECT ST_AsText(target), name, sgg_name, target_km2 FROM national_cells WHERE asset=%s AND year=%s AND cell_cd=%s",
                    (asset, year, cd)).fetchone()
    if not row or not row[0]:
        raise RuntimeError("칸 범위 없음")
    parts = split_parts(wkt.loads(row[0]))
    key = ("test:" if test else "") + cd
    if not test:
        c.execute("UPDATE national_cells SET state='running', started_at=now(), err=NULL WHERE asset=%s AND year=%s AND cell_cd=%s", (asset, year, cd))
    t0 = time.time()
    status(state="running", asset=asset, cell=cd, name=f"{row[2]} {row[1]}", parts=len(parts), test=test)
    jobs = []
    for k, p in enumerate(parts):
        if not test:                              # 조각마다 멈춤 · 다른 학습 장비 작업(비킴)을 다시 본다
            wait_turn(c, g, asset, cd)
        body = {"kind": "infer", "model_id": MODEL, "imagery_id": iid, "aoi": mapping(p), "priority": PRIORITY, "test": test,
                "label": f"{'test/' if test else ''}national/{asset}/{year}/{cd}/{k}", "options": {"max_km2": 150, "national": {"asset": asset, "year": year, "cell": cd}}}
        prev = c.execute("SELECT n.job_id FROM national_jobs n JOIN jobs j ON j.id=n.job_id WHERE n.asset=%s AND n.year=%s AND n.cell_cd=%s AND n.part=%s "
                         "AND j.state IN ('queued','running','done') ORDER BY n.at DESC LIMIT 1", (asset, year, key, k)).fetchone()
        if prev:                                 # 끊겼다 다시 이어 하기 — 같은 조각의 작업이 아직 살아 있거나 끝났으면 그것을 쓴다
            jid = prev[0]
        else:
            r = g.call("POST", "/jobs", json=body)
            if r.status_code >= 300:
                raise RuntimeError(f"작업 넣기 실패 {r.status_code} {r.text[:200]}")
            jid = r.json()["job"]["id"]
        jobs.append(jid)
        c.execute("INSERT INTO national_jobs(job_id, asset, year, cell_cd, part, test) VALUES (%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING",
                  (jid, asset, year, key, k, test))
        log(f"  조각 {k + 1}/{len(parts)} 넣음 {jid} · {round(p.area * 1e4, 2)}")
        # 한 조각씩 끝까지(학습 장비 작업은 언제나 하나)
        while True:
            time.sleep(8)
            v = g.call("GET", f"/jobs/{jid}").json()
            v = v.get("job", v)
            stt = v.get("state")
            if stt in ("done", "failed", "cancelled"):
                c.execute("UPDATE national_jobs SET state=%s, done_at=now() WHERE job_id=%s", (stt, jid))
                if stt != "done":
                    raise RuntimeError(f"작업 {stt}: {str(v.get('error') or '')[:200]}")
                if int(v.get("shards_failed") or 0) > 0:           # 칩 일부를 못 읽음(영상 API 장애 등) — 빈 결과로 '끝'을 만들지 않는다
                    raise RuntimeError(f"작업 칩 {v.get('shards_failed')}개 실패 — 칸을 다시")
                break
            status(state="running", asset=asset, cell=cd, part=k + 1, parts=len(parts), done=v.get("shards_done"), total=v.get("shards_total"), test=test)
    out = finish_cell(c, asset, year, cd, jobs, test=test)
    out["sec"] = round(time.time() - t0)
    return out


def finish_cell(c, asset: str, year: int, cd: str, jobs: list[str], *, test: bool = False) -> dict:
    key = ("test:" if test else "") + cd
    inside = ("FROM detections d JOIN national_cells n ON n.asset=%s AND n.year=%s AND n.cell_cd=%s "
              "WHERE d.job_id = ANY(%s) AND d.cls = ANY(%s) AND ST_Intersects(n.geom_s, ST_PointOnSurface(d.geom))")
    args = (asset, year, cd, jobs, list(COUNT_CLS[asset]))
    # 1) 칸 숫자 — 객체 중심이 이 읍면동 안인 것만(칩이 경계를 넘어 읽은 이웃 칸 객체는 이웃 칸이 센다) · 진행 막대 · 요약의 한 출처
    rows = c.execute(f"SELECT d.cls, count(*), coalesce(sum(d.area_m2),0) {inside} GROUP BY d.cls", args).fetchall()
    counts = {k: {"n": int(n), "km2": round(float(a) / 1e6, 3)} for k, n, a in rows}
    # 2) 낮은 줌용 면 — 격자 칸 중 그 분류 넓이가 기준을 넘는 칸을 녹여 하나로(작음 · 객체 모양은 결과 묶음 파일의 지도 조각에)
    c.execute("DELETE FROM national_faces WHERE asset=%s AND year=%s AND cell_cd=%s", (asset, year, key))
    for lvl, g, min_m2 in ((0, 0.002, 3600), (1, 0.0008, 1500)):
        c.execute(f"INSERT INTO national_faces(asset, year, cell_cd, lvl, cls, geom) "
                  f"SELECT %s, %s, %s, %s, cls, ST_Multi(ST_Union(ST_MakeEnvelope(gx * {g}, gy * {g}, gx * {g} + {g}, gy * {g} + {g}, 4326))) FROM ("
                  f" SELECT d.cls, floor(ST_X(ST_PointOnSurface(d.geom)) / {g})::int gx, floor(ST_Y(ST_PointOnSurface(d.geom)) / {g})::int gy, sum(d.area_m2) a "
                  f" {inside} GROUP BY 1, 2, 3) q WHERE a >= %s GROUP BY cls", (asset, year, key, lvl) + args + (min_m2,))
    # 3) 결과 객체 줄은 지운다 — 데이터베이스(C: 디스크)에 쌓지 않음. 객체는 E: 결과 묶음 파일(지도 조각 · GeoJSON)에 남아 있다
    for jid in jobs:
        b = c.execute("SELECT ST_XMin(e), ST_YMin(e), ST_XMax(e), ST_YMax(e) FROM (SELECT ST_Extent(geom) e FROM detections WHERE job_id=%s) q", (jid,)).fetchone()
        rs = c.execute("SELECT result_set FROM jobs WHERE id=%s", (jid,)).fetchone()
        c.execute("UPDATE national_jobs SET bbox=%s, result_set=%s WHERE job_id=%s",
                  ([round(float(v), 6) for v in b] if b and b[0] is not None else None, rs[0] if rs else None, jid))
    deleted = c.execute("DELETE FROM detections WHERE job_id = ANY(%s)", (jobs,)).rowcount
    # 4) 중간 칩 파일은 바로 지움(결과는 결과 묶음 파일에 남음)
    freed = 0
    for jid in jobs:
        d = config.DATA_ROOT / "results" / "lx" / jid / "shards"
        if d.exists():
            freed += sum(f.stat().st_size for f in d.glob("*") if f.is_file())
            shutil.rmtree(d, ignore_errors=True)
    if not test:
        c.execute("UPDATE national_cells SET state='done', done_at=now(), counts=%s, err=NULL WHERE asset=%s AND year=%s AND cell_cd=%s",
                  (json.dumps(counts, ensure_ascii=False), asset, year, cd))
    return {"counts": counts, "jobs": len(jobs), "rows_moved_out": deleted, "freed_mb": round(freed / 1e6, 1)}


def fail_cell(c, asset: str, year: int, cd: str, err: str):
    row = c.execute("UPDATE national_cells SET tries=tries+1, err=%s WHERE asset=%s AND year=%s AND cell_cd=%s RETURNING tries",
                    (err[:500], asset, year, cd)).fetchone()
    tries = row[0] if row else TRIES
    wait = 10 * 2 ** (tries - 1)
    c.execute("UPDATE national_cells SET state=%s, next_try_at=now() + make_interval(mins => %s) WHERE asset=%s AND year=%s AND cell_cd=%s",
              ("failed" if tries >= TRIES else "todo", wait, asset, year, cd))
    log(f"  실패({tries}/{TRIES}) — {wait}분 뒤 다시: {err[:200]}")


# ── 고리(학습 장비가 놀 때면 언제든) ───────────────────────────────────────────
def retrain_waiting(g: Gate) -> bool:
    try:
        j = g.call("GET", "/retrain").json()
        return bool(j.get("quiet_now")) and bool(j.get("tonight"))
    except Exception:  # noqa: BLE001
        return False


_turn = {"yield_retrain_at": 0.0, "train_seen": 0.0}


def wait_turn(c, g: Gate, asset: str | None = None, cd: str | None = None):
    """다음 조각을 넣어도 되나 — 멈춤이면 Pause. 다른 학습 장비 작업이 있거나(비킴) 재학습 차례(쉬는 시간 · 최대 15분)면 기다린다."""
    while True:
        if not settings(c).get("enabled", True):
            raise Pause("멈춤")
        busy = other_gpu(c)
        if busy:
            if any(x.startswith("train") for x in busy):
                _turn["train_seen"] = time.time()
            status(state="yield", why="다른 학습 장비 작업", busy=busy, asset=asset, cell=cd)
            time.sleep(20)
            continue
        if not g.h:
            g.login()
        if retrain_waiting(g) and time.time() - _turn["train_seen"] > 3600:
            if not _turn["yield_retrain_at"]:
                _turn["yield_retrain_at"] = time.time()
            if time.time() - _turn["yield_retrain_at"] < YIELD_TRAIN_S:
                status(state="yield", why="재학습 차례", asset=asset, cell=cd)
                time.sleep(30)
                continue
        _turn["yield_retrain_at"] = 0.0
        return


def loop(force_window: bool = False):
    """학습 장비가 놀 때면 언제든(시간대를 기다리지 않음 · 원칙 221). force_window 는 예전 --now 호환(같은 동작)."""
    if not take_lock():
        print("이미 돌고 있음")
        return
    g = Gate()
    try:
        with pg() as c:
            # 지난번에 끊긴 칸(프로세스가 멈춤) — 잠금을 잡았으니 다른 작업기는 없다 → 다시 차례에(끝난 조각은 이어 씀)
            c.execute("UPDATE national_cells SET state='todo' WHERE state='running'")
            while True:
                st = settings(c)
                if not st.get("enabled", True):
                    status(state="paused")
                    log("멈춤 설정 — 끝")
                    return
                year = int(st["year"])
                try:
                    wait_turn(c, g)
                except Pause:
                    continue
                iid = ensure_imagery(c, year, int(st.get("fetch_max", 4)))
                try:
                    wait_api(year)
                except Pause:
                    continue
                nxt = next_cell(c, year, st["assets"])
                if not nxt:
                    status(state="all_done", year=year)
                    log("남은 칸 없음 — 끝")
                    return
                asset, cd, sgg_name, name, tries = nxt
                log(f"칸 {asset} {cd} {sgg_name} {name} 시작")
                try:
                    res = run_cell(c, g, asset, year, cd, iid)
                    log(f"칸 {asset} {cd} 끝 {res}")
                    status(state="cell_done", asset=asset, cell=cd, last_done=dt.datetime.now(KST).isoformat(timespec="seconds"))
                except Pause as e:
                    c.execute("UPDATE national_cells SET state='todo' WHERE asset=%s AND year=%s AND cell_cd=%s", (asset, year, cd))
                    log(f"칸 {asset} {cd} 멈춤({e}) — 다시 켜면 이어서")
                    continue
                except Exception as e:  # noqa: BLE001
                    if not api_ok(year):                 # 영상 API 장애 — 칸 탓이 아니므로 실패로 세지 않고 차례로 되돌린다(끝난 조각은 이어 씀)
                        c.execute("UPDATE national_cells SET state='todo' WHERE asset=%s AND year=%s AND cell_cd=%s", (asset, year, cd))
                        log(f"칸 {asset} {cd} 영상 API 장애로 멈춤 — 돌아오면 이어서: {repr(e)[:160]}")
                        continue
                    fail_cell(c, asset, year, cd, repr(e))
                    time.sleep(30)
    finally:
        drop_lock()


def run_test(cd: str, asset: str):
    """낮 시험 — 칸 하나(시험 표시). 진행 장부(national_cells)는 바꾸지 않는다."""
    if not take_lock():
        print("이미 돌고 있음")
        return
    g = Gate()
    g.login()
    try:
        with pg() as c:
            st = settings(c)
            year = int(st["year"])
            busy = other_gpu(c)
            if busy:
                print("다른 학습 장비 작업이 있어 시험을 미룸:", busy)
                return
            iid = ensure_imagery(c, year, int(st.get("fetch_max", 4)))
            log(f"시험 칸 {asset} {cd}")
            res = run_cell(c, g, asset, year, cd, iid, test=True)
            log(f"시험 끝 {res}")
            status(state="test_done", asset=asset, cell=cd, test=True, result=res)
            print(json.dumps(res, ensure_ascii=False))
    finally:
        drop_lock()


def cleanup_test():
    with pg() as c:
        jobs = [r[0] for r in c.execute("SELECT job_id FROM national_jobs WHERE test").fetchall()]
        n = c.execute("DELETE FROM detections WHERE job_id = ANY(%s)", (jobs,)).rowcount if jobs else 0
        c.execute("DELETE FROM national_faces WHERE cell_cd LIKE 'test:%%'")
        for jid in jobs:
            d = config.DATA_ROOT / "results" / "lx" / jid
            shutil.rmtree(d, ignore_errors=True)
            for ext in (".geojson", ".pmtiles"):
                f = d.with_name(jid + ext)
                if f.exists():
                    f.unlink()
        c.execute("DELETE FROM national_jobs WHERE test")
        print(json.dumps({"jobs": len(jobs), "detections": n}))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--loop", action="store_true")
    ap.add_argument("--now", action="store_true", help="예전 호환(지금은 언제나 학습 장비가 놀 때 돈다)")
    ap.add_argument("--test")
    ap.add_argument("--asset", default="farm", choices=ASSETS)
    ap.add_argument("--cleanup-test", action="store_true")
    ap.add_argument("--status", action="store_true")
    a = ap.parse_args()
    if a.test:
        run_test(a.test, a.asset)
    elif a.cleanup_test:
        cleanup_test()
    elif a.status:
        print(STATUS.read_text(encoding="utf-8") if STATUS.exists() else "{}")
    else:
        loop(force_window=a.now)


if __name__ == "__main__":
    main()
