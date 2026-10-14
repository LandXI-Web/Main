# -*- coding: utf-8 -*-
"""영상 여는 도우미(core-imagery 계약) — 워커·파이프라인이 imagery id 하나로 추론 입력을 연다.

  open_imagery(imagery_id)        → rasterio 데이터셋(VRT · GeoTIFF · COG 공통 · 스레드별 캐시 · 닫지 말 것)
  imagery_path(imagery_id)        → 실제 파일 경로(path_internal · 없으면 layer.cog_path)
  best_imagery_sync(sgg, geom)    → catalog.best_imagery 와 같은 결과(동기 · 워커용)
  choose(rows, target)            → 순위 규칙(서버·워커 공용)

영상 행이 없거나 파일이 없으면 ImageryUnavailable. V-World 위성 영상은 분석 입력으로 쓰지 않는다(config/ladder.yaml vworld_analysis).
"""
from __future__ import annotations

import json
import os
import sys
import threading
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from landxi_api import config  # noqa: E402

_local = threading.local()
MIN_COVER = 0.02          # 대상 범위의 2% 미만만 덮는 영상(작은 칩 · 가장자리)은 후보에서 뺀다


class ImageryUnavailable(RuntimeError):
    pass


def _resolve(p: str) -> str:
    return p if (":" in p[:3] or os.path.isabs(p)) else str(config.DATA_ROOT / p)


def _row(imagery_id: str):
    import psycopg
    with psycopg.connect(config.PG_WORKER_DSN) as c:
        return c.execute("SELECT path_internal, layer FROM imagery WHERE id=%s", (imagery_id,)).fetchone()


def imagery_path(imagery_id: str) -> str:
    c = getattr(_local, "path", None)
    if c is None:
        c = _local.path = {}
    if imagery_id not in c:
        row = _row(imagery_id)
        if not row:
            raise ImageryUnavailable(f"영상 행 없음: {imagery_id}")
        layer = row[1] or {}
        p = row[0] or layer.get("cog_path")
        if not p:
            raise ImageryUnavailable(f"분석에 쓸 원본 경로가 없는 영상: {imagery_id}")
        full = _resolve(p)
        if not os.path.exists(full):
            raise ImageryUnavailable(f"영상 파일 없음: {imagery_id}")
        c[imagery_id] = full
    return c[imagery_id]


# ── 영상 API 원천(전국 결과 자산 · 원칙 136 · 218) ─────────────────────────────────
# imagery 행 layer.role = 'national' · path_internal = GDAL WMS 설명 파일(.xml · 국토지리정보원 항공 타일 · 키 없음).
# 영상 파일을 만들지 않는다 — 칩 창을 읽을 때 그 칸의 타일만 불러 메모리에서 쓴다(디스크 보관 0 · 프로세스 메모리의 작은 타일 캐시만).
# 정중한 호출(10-13 영상호출-단계상향): 타일 호출을 직접 하고, 프로세스 전체의 동시 호출 수를 자동 조절 장치(FetchGovernor)가 정한다.
#   상한 = 관리자 설정 fetch_max(lx_settings national.run · 1–16 · 1분마다 다시 읽음). 실제 쓰는 값은 그 아래에서 자동:
#   최근 200회 창마다 오류(429 · 5xx · 연결 끊김 · 시간 초과) 비율 > 1% 또는 응답 시간 p50 > 기준 × 2(기준 = 최근 3시간 지난 창 p50 중앙값 ·
#   더 낮은 동시 수에서 잰 창이 있으면 그것 — 올려도 응답만 늘고 처리량이 그대로면 내려온다)
#   → 한 단계 내림(1 · 2 · 4 · 8 · 16) + 30초 쉼. 30분 동안 내림이 없으면 상한까지 한 단계 올림.
# 실패한 타일은 2 · 4 · 8 · 16 초 기다렸다 다시(지수 대기) · 그래도 안 되면 칸 실패(작업기가 칸을 다시 넣는다). 404 · 204(바다 등 영상 없음)만 빈 칸.
# 요청 머리에는 브라우저 이름 · 출처 페이지만(메일 · 계정 · 키 없음).
_API: dict = {}
_API_LOCK = threading.Lock()
_API_ROLE: dict = {}
API_RETRY_S = (2, 4, 8, 16)
FETCH_HARD_MAX = 16          # 이 위는 사용자 결정(10-13)
FETCH_WINDOW = 200           # 판정 창(호출 수)
FETCH_ERR_MAX = 0.01         # 오류율 상한
FETCH_SLOW_X = 2.0           # 응답 시간 p50 이 기준의 몇 배면 내림
FETCH_SLOW_MIN_S = 0.25      # 기준보다 이만큼(초) 넘게 늘었을 때만 '늦어짐'(서버가 빠를 때 40→85ms 흔들림으로 내려가지 않게)
FETCH_BASE_MIN = 3           # 기준을 세우는 데 필요한 지난 창 수
FETCH_BASE_AGE_S = 3 * 3600  # 기준에 쓰는 지난 창의 나이(낮 · 밤 서버 속도 변화를 따라감)
FETCH_REST_S = 30            # 내린 뒤 쉼
FETCH_STABLE_S = 1800        # 이만큼 안정이면 한 단계 올림
FETCH_OUTAGE_RATE = 0.5      # 한 창의 오류율이 이만큼이면 서비스 장애로 보고
FETCH_OUTAGE_REST_S = 300    # 장애 때 쉼(5분)
TILE_CACHE = 768             # 타일 캐시(이웃 칩이 겹치는 타일 · 약 150MB)


def _now() -> float:
    import time as _t
    return _t.time()


class FetchGovernor:
    """프로세스 전체 동시 호출 수 — 상한(cap · 관리자 설정) 아래에서 오류율 · 응답 시간으로 자동 조절."""

    def __init__(self, cap: int, log_dir: Path | None = None, clock=None):
        self.clock = clock or _now
        self.cv = threading.Condition()
        self.cap = max(1, min(FETCH_HARD_MAX, int(cap)))
        self.level = self.cap                      # 관리자가 정한 상한에서 시작(오류가 나면 내려간다)
        self.inflight = 0
        self.rest_until = 0.0
        self.last_change = self.clock()             # 마지막 단계 바꿈(또는 시작) — 30분 안정 판정
        self.win: list = []                         # (ok, sec)
        self.hist: list = []                        # 지난 창 (시각, 동시 수, p50) — 기준(파일에 남겨 워커를 다시 켜도 이어 씀)
        self.total = {"calls": 0, "errors": 0, "bytes": 0, "empty": 0, "retries": 0}
        self.events: list = []
        self.kinds: dict = {}                       # 이 창의 오류 종류(HTTP 429 · 5xx · 연결 끊김 · 시간 초과)
        self.log_dir = log_dir
        self._load_hist()

    def steps(self) -> list[int]:
        return sorted({s for s in (1, 2, 4, 8, 16) if s <= self.cap} | {self.cap})

    def set_cap(self, cap: int):
        """관리자가 상한을 바꿈 — 내리면 바로 그 아래로. 올리면 지금 단계가 옛 상한(안정)일 때 한 단계 바로 올리고, 그 뒤로는 30분 안정마다 한 단계."""
        cap = max(1, min(FETCH_HARD_MAX, int(cap)))
        with self.cv:
            if cap == self.cap:
                return
            old, self.cap = self.cap, cap
            if cap < self.level:
                self._change(cap, f"상한 {old}→{cap}")
            elif self.level == old and self.rest_until <= self.clock():
                nxt = next((s for s in self.steps() if s > self.level), self.level)
                self._change(nxt, f"상한 {old}→{cap}")
            self.cv.notify_all()

    def _change(self, lvl: int, why: str):
        ev = {"at": self.clock(), "from": self.level, "to": lvl, "cap": self.cap, "why": why}
        self.level = lvl
        self.last_change = self.clock()
        self.events = (self.events + [ev])[-50:]
        self._write("fetch-events.jsonl", ev)

    def acquire(self):
        with self.cv:
            while True:
                wait = self.rest_until - self.clock()
                if wait <= 0 and self.inflight < self.level:
                    self.inflight += 1
                    return
                self.cv.wait(timeout=max(0.05, min(wait, 1.0)) if wait > 0 else 1.0)

    def release(self):
        with self.cv:
            self.inflight -= 1
            self.cv.notify_all()

    def record(self, ok: bool, sec: float, nbytes: int = 0, empty: bool = False, retry: bool = False, kind: str | None = None):
        with self.cv:
            if not ok:
                self.kinds[kind or "?"] = self.kinds.get(kind or "?", 0) + 1
            t = self.total
            t["calls"] += 1
            t["errors"] += 0 if ok else 1
            t["bytes"] += nbytes
            t["empty"] += 1 if empty else 0
            t["retries"] += 1 if retry else 0
            self.win.append((ok, sec))
            if len(self.win) >= FETCH_WINDOW:
                self._judge()

    def _judge(self):
        import statistics as _s
        w, self.win = self.win, []
        kinds, self.kinds = self.kinds, {}
        errs = sum(1 for ok, _ in w if not ok)
        lat = sorted(s for ok, s in w if ok)
        p50 = _s.median(lat) if lat else None
        p90 = lat[int(0.9 * (len(lat) - 1))] if lat else None
        base = self._base()
        rate = errs / len(w)
        row = {"at": self.clock(), "level": self.level, "cap": self.cap, "calls": len(w), "errors": errs, "err_rate": round(rate, 4),
               "p50_ms": round(p50 * 1000) if p50 else None, "p90_ms": round(p90 * 1000) if p90 else None,
               "base_ms": round(base * 1000) if base else None, "kinds": kinds, "bytes_total": self.total["bytes"], "calls_total": self.total["calls"]}
        down = None
        if rate > FETCH_ERR_MAX:
            down = f"오류율 {rate:.1%}"
        elif p50 and base and p50 > FETCH_SLOW_X * base and p50 - base > FETCH_SLOW_MIN_S:   # 수십 ms 흔들림은 늦어진 것이 아님
            down = f"응답 p50 {p50 * 1000:.0f}ms > 기준 {base * 1000:.0f}ms×{FETCH_SLOW_X:g}"
        if down:
            st = self.steps()
            lower = max([s for s in st if s < self.level] or [st[0]])
            if lower < self.level:
                self._change(lower, down)
            else:
                self.last_change = self.clock()
            self.rest_until = self.clock() + (FETCH_OUTAGE_REST_S if rate >= FETCH_OUTAGE_RATE else FETCH_REST_S)   # 절반 넘게 실패 = 서비스 장애 → 길게 쉼
            row["action"] = "down"
            row["why"] = down
        else:
            if p50:
                self.hist = (self.hist + [(self.clock(), self.level, p50)])[-48:]
                self._save_hist()
            if self.level < self.cap and self.clock() - self.last_change >= FETCH_STABLE_S:
                nxt = next((s for s in self.steps() if s > self.level), self.level)
                self._change(nxt, "30분 안정")
                row["action"] = "up"
        row["level_after"] = self.level
        self._write("fetch-windows.jsonl", row)
        self.cv.notify_all()

    def _base(self):
        """기준 응답 시간 = 최근 3시간 안의 지난 창 p50 중앙값(최근 12창). 지금보다 낮은 동시 수에서 잰 창이 3개 이상이면 그것으로 —
        동시 수를 올려 응답 시간만 늘고(서버가 줄 세움) 처리량이 늘지 않으면 내려오게. 지난 창이 3개 미만이면 판정하지 않는다."""
        import statistics as _s
        now = self.clock()
        recent = [h for h in self.hist if now - h[0] <= FETCH_BASE_AGE_S]
        low = [h[2] for h in recent if h[1] < self.level][-12:]
        pick = low if len(low) >= FETCH_BASE_MIN else [h[2] for h in recent][-12:]
        return _s.median(pick) if len(pick) >= FETCH_BASE_MIN else None

    def _load_hist(self):
        if not self.log_dir:
            return
        try:
            j = json.loads((Path(self.log_dir) / "fetch-base.json").read_text(encoding="utf-8"))
            rows = [tuple(x) for x in j.get("hist", [])]
        except Exception:  # noqa: BLE001 — 없으면 창 기록(fetch-windows.jsonl)에서
            rows = []
            try:
                import datetime as _dt
                for line in (Path(self.log_dir) / "fetch-windows.jsonl").read_text(encoding="utf-8").splitlines()[-200:]:
                    r = json.loads(line)
                    if r.get("p50_ms") and r.get("action") != "down":
                        rows.append((_dt.datetime.fromisoformat(r["at"]).timestamp(), int(r["level"]), r["p50_ms"] / 1000.0))
            except Exception:  # noqa: BLE001
                rows = []
        self.hist = [x for x in rows if self.clock() - x[0] <= FETCH_BASE_AGE_S][-48:]

    def _save_hist(self):
        if not self.log_dir:
            return
        try:
            p = Path(self.log_dir) / "fetch-base.json"
            tmp = p.with_suffix(".tmp")
            tmp.write_text(json.dumps({"hist": self.hist}), encoding="utf-8")
            os.replace(tmp, p)
        except OSError:
            pass

    def snapshot(self) -> dict:
        with self.cv:
            return {"level": self.level, "cap": self.cap, "inflight": self.inflight, "total": dict(self.total),
                    "resting": self.rest_until > self.clock(), "events": self.events[-5:]}

    def _write(self, name: str, row: dict):
        if not self.log_dir:
            return
        try:
            import datetime as _dt
            r = dict(row, at=_dt.datetime.fromtimestamp(row["at"]).isoformat(timespec="seconds"), pid=os.getpid())
            with open(Path(self.log_dir) / name, "a", encoding="utf-8") as f:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")
        except OSError:
            pass


def _xml_conf(path: str) -> dict:
    """GDAL WMS 설명 파일에서 타일 주소 · 층 · 크기 · 상한(MaxConnections) · 요청 머리."""
    import xml.etree.ElementTree as ET
    root = ET.parse(path).getroot()

    def g(k, d=None):
        v = root.findtext(k)
        return v if v is not None else d
    return {"url": g("Service/ServerUrl"), "z": int(g("DataWindow/TileLevel", "18")), "bx": int(g("BlockSizeX", "256")),
            "by": int(g("BlockSizeY", "256")), "bands": int(g("BandsCount", "3")), "conn": int(g("MaxConnections", "4")),
            "timeout": float(g("Timeout", "30")), "ua": g("UserAgent", "Mozilla/5.0"), "referer": g("Referer", ""),
            "zero": {int(x) for x in (g("ZeroBlockHttpCodes", "204,404") or "").split(",") if x.strip()}}


def _cap_setting(default: int) -> int:
    """관리자 설정(lx_settings 'national.run'.fetch_max · PUT /national/settings) — 없으면 설명 파일 값."""
    import psycopg
    with psycopg.connect(config.PG_WORKER_DSN) as c:
        row = c.execute("SELECT value->>'fetch_max' FROM lx_settings WHERE key='national.run'").fetchone()
    return int(row[0]) if row and row[0] else int(default)


class ApiDataset:
    """rasterio 데이터셋처럼 쓰는 얇은 감싸개 — 워커 · 스케줄러가 부르는 속성만(read · count · crs · transform · window_transform · 크기).
    크기 · 좌표는 GDAL 이 설명 파일로 정하고, 창 읽기는 타일을 직접 불러(동시 수 = FetchGovernor) 붙인다."""

    def __init__(self, path: str):
        import rasterio
        import requests
        from collections import OrderedDict
        from concurrent.futures import ThreadPoolExecutor
        self.path = path
        self._ds = rasterio.open(path)
        self._lock = threading.Lock()
        for k in ("count", "crs", "transform", "width", "height", "res", "bounds", "profile", "dtypes", "nodata"):
            setattr(self, k, getattr(self._ds, k))
        self.closed = False
        self.reads = 0
        self.retries = 0
        self.conf = _xml_conf(path)
        self._conf_at = _now()
        self._stats_at = 0.0
        try:
            cap = _cap_setting(self.conf["conn"])
        except Exception:  # noqa: BLE001
            cap = self.conf["conn"]
        self.gov = FetchGovernor(cap, Path(path).parent)
        self._http = requests.Session()
        ad = requests.adapters.HTTPAdapter(pool_connections=4, pool_maxsize=FETCH_HARD_MAX * 2)
        self._http.mount("https://", ad)
        self._http.mount("http://", ad)
        self._pool = ThreadPoolExecutor(max_workers=FETCH_HARD_MAX * 2, thread_name_prefix="tile")
        self._cache: OrderedDict = OrderedDict()
        self._pending: dict = {}
        self._clock = threading.Lock()

    def window_transform(self, win):
        return self._ds.window_transform(win)

    def _refresh(self):
        """관리자 설정 national.run.fetch_max 를 1분마다 다시 읽어 상한을 맞춘다 — 워커 · 작업기를 다시 켜지 않아도 된다. 30초마다 상태 파일."""
        now = _now()
        if now - self._conf_at >= 60:
            self._conf_at = now
            try:
                self.gov.set_cap(_cap_setting(self.conf["conn"]))
            except Exception:  # noqa: BLE001
                pass
        if now - self._stats_at >= 30:
            self._stats_at = now
            try:
                p = Path(self.path).parent / "fetch-stats.json"
                tmp = p.with_suffix(".tmp")
                tmp.write_text(json.dumps(dict(self.gov.snapshot(), pid=os.getpid(), at=now), ensure_ascii=False), encoding="utf-8")
                os.replace(tmp, p)
            except OSError:
                pass

    def _fetch(self, x: int, y: int):
        """타일 하나 → (밴드, by, bx) uint8 · 영상 없음(204 · 404)이면 None. 실패하면 지수 대기 뒤 다시."""
        import io
        import time as _t
        import numpy as np
        from PIL import Image
        c = self.conf
        url = c["url"].replace("${z}", str(c["z"])).replace("${x}", str(x)).replace("${y}", str(y))
        hdr = {"User-Agent": c["ua"]}
        if c["referer"]:
            hdr["Referer"] = c["referer"]
        last = None
        for k, wait in enumerate((0,) + API_RETRY_S):
            if wait:
                self.retries += 1
                _t.sleep(wait)
            self.gov.acquire()
            t0 = _t.perf_counter()
            try:
                r = self._http.get(url, headers=hdr, timeout=(10, c["timeout"]))
                sec = _t.perf_counter() - t0
                html = "html" in (r.headers.get("content-type") or "").lower()
                if r.status_code in c["zero"] and not html:
                    self.gov.record(True, sec, len(r.content), empty=True, retry=k > 0)
                    return None
                if r.status_code in c["zero"]:
                    # 10-13 실측: 국토지리정보원이 '접속 지연' 안내 페이지(html)를 404 로 준다 — 영상 없음(바다)이 아니라 오류. 빈 칸으로 세면 결과 0 칸이 '끝'이 된다
                    self.gov.record(False, sec, len(r.content), retry=k > 0, kind=f"HTTP {r.status_code} 안내 페이지")
                    last = f"HTTP {r.status_code} 안내 페이지(접속 지연)"
                    continue
                if r.status_code != 200:
                    self.gov.record(False, sec, len(r.content), retry=k > 0, kind=f"HTTP {r.status_code}")
                    last = f"HTTP {r.status_code}"
                    continue
                a = np.asarray(Image.open(io.BytesIO(r.content)).convert("RGB"), dtype=np.uint8)
                if a.shape[0] != c["by"] or a.shape[1] != c["bx"]:
                    raise ValueError(f"타일 크기 {a.shape}")
                self.gov.record(True, sec, len(r.content), retry=k > 0)
                return a.transpose(2, 0, 1)
            except Exception as e:  # noqa: BLE001 — 연결 끊김 · 시간 초과 · 깨진 그림
                self.gov.record(False, _t.perf_counter() - t0, retry=k > 0, kind=type(e).__name__)
                last = repr(e)
            finally:
                self.gov.release()
        raise ImageryUnavailable(f"영상 API 읽기 실패(다시 {len(API_RETRY_S)}번): {last}")

    def _tile(self, x: int, y: int):
        """캐시 · 같은 타일 동시 요청은 하나로 → future."""
        from concurrent.futures import Future
        key = (x, y)
        with self._clock:
            if key in self._cache:
                self._cache.move_to_end(key)
                f = Future()
                f.set_result(self._cache[key])
                return f
            f = self._pending.get(key)
            if f is not None:
                return f
            f = self._pool.submit(self._fetch, x, y)
            self._pending[key] = f

        def done(ff, key=key):
            with self._clock:
                self._pending.pop(key, None)
                if ff.exception() is None:
                    self._cache[key] = ff.result()
                    while len(self._cache) > TILE_CACHE:
                        self._cache.popitem(last=False)
        f.add_done_callback(done)
        return f

    def _read_tiles(self, bands: list[int], c0: int, r0: int, w: int, h: int):
        import numpy as np
        bx, by = self.conf["bx"], self.conf["by"]
        out = np.zeros((len(bands), h, w), dtype=np.uint8)
        if c0 + w <= 0 or r0 + h <= 0 or c0 >= self.width or r0 >= self.height:
            return out
        xs = range(max(c0, 0) // bx, (min(c0 + w, self.width) - 1) // bx + 1)
        ys = range(max(r0, 0) // by, (min(r0 + h, self.height) - 1) // by + 1)
        futs = {(x, y): self._tile(x, y) for y in ys for x in xs}
        bi = [b - 1 for b in bands]
        for (x, y), f in futs.items():
            t = f.result()
            if t is None:
                continue
            tx0, ty0 = x * bx, y * by
            cx0, cy0 = max(c0, tx0), max(r0, ty0)
            cx1, cy1 = min(c0 + w, tx0 + bx), min(r0 + h, ty0 + by)
            out[:, cy0 - r0:cy1 - r0, cx0 - c0:cx1 - c0] = t[bi, cy0 - ty0:cy1 - ty0, cx0 - tx0:cx1 - tx0]
        return out

    def read(self, indexes=None, window=None, boundless=False, fill_value=0, **kw):
        self._refresh()
        integral = window is not None and all(float(v).is_integer() for v in (window.col_off, window.row_off, window.width, window.height))
        if integral and not kw and not fill_value and self.dtypes[0] == "uint8":
            one = isinstance(indexes, int)
            bands = [indexes] if one else (list(indexes) if indexes is not None else list(range(1, self.count + 1)))
            if all(1 <= b <= min(self.count, self.conf["bands"]) for b in bands):
                self.reads += 1
                a = self._read_tiles(bands, int(window.col_off), int(window.row_off), int(window.width), int(window.height))
                return a[0] if one else a
        # 그 밖(소수 창 · 다른 형식) — 예전처럼 GDAL 로(한 번에 한 창 · 동시 연결은 설명 파일 MaxConnections)
        import time as _t
        last = None
        for k, wait in enumerate((0,) + API_RETRY_S):
            if wait:
                self.retries += 1
                _t.sleep(wait)
            try:
                with self._lock:
                    self.reads += 1
                    if not boundless:
                        return self._ds.read(indexes, window=window, **kw)
                    return self._ds.read(indexes, window=window, boundless=True, fill_value=fill_value, **kw)
            except Exception as e:  # noqa: BLE001
                last = e
        raise ImageryUnavailable(f"영상 API 읽기 실패(다시 {len(API_RETRY_S)}번): {last}")

    def close(self):          # 프로세스 안에서 함께 쓰는 핸들 — 닫지 않는다
        pass


def _is_api(imagery_id: str) -> bool:
    if imagery_id not in _API_ROLE:
        row = _row(imagery_id)
        _API_ROLE[imagery_id] = bool(row and isinstance(row[1], dict) and row[1].get("role") == "national")
    return _API_ROLE[imagery_id]


def open_imagery(imagery_id: str):
    """rasterio 데이터셋 — 같은 스레드에서 다시 부르면 같은 핸들(워커 창 읽기 반복용). 영상 API 원천은 프로세스에 하나(ApiDataset)."""
    import rasterio
    if _is_api(imagery_id):
        p = imagery_path(imagery_id)
        with _API_LOCK:
            d = _API.get(p)
            if d is None:
                os.environ.setdefault("GDAL_HTTP_TIMEOUT", "30")
                d = _API[p] = ApiDataset(p)
        return d
    c = getattr(_local, "ds", None)
    if c is None:
        c = _local.ds = {}
    ds = c.get(imagery_id)
    if ds is None or ds.closed:
        ds = c[imagery_id] = rasterio.open(imagery_path(imagery_id))
    return ds


# ── 추론 입력 고르기 ─────────────────────────────────────────────────────────
def _year(r: dict) -> int:
    y = r.get("year")
    if y:
        return int(y)
    import re
    m = re.search(r"(19|20)\d{2}", str(r.get("epoch") or ""))
    return int(m.group(0)) if m else 0


def choose(rows: list[dict], target) -> dict | None:
    """rows: [{id, gsd_m, year, epoch, fp(shapely), readable}] · target: shapely(4326) → 가장 좋은 한 건(+coverage) 또는 None.
    순서: 대상의 절반 이상을 덮는가 → 해상도 급(≤10cm · ≤50cm · ≤2m · 그 밖) → 최근 연도 → 덮는 비율."""
    best, key = None, None
    ta = max(target.area, 1e-12)
    for r in rows:
        if not r.get("readable") or r.get("fp") is None:
            continue
        try:
            cov = r["fp"].intersection(target).area / ta
        except Exception:
            continue
        if cov < MIN_COVER:
            continue
        g = float(r["gsd_m"]) if r.get("gsd_m") is not None else 99.0
        tier = 0 if g <= 0.1 else 1 if g <= 0.5 else 2 if g <= 2 else 3
        k = (0 if cov >= 0.5 else 1, tier, -_year(r), -cov)
        if key is None or k < key:
            best, key = {**r, "coverage": round(min(cov, 1.0), 4)}, k
    return best


def vworld_allowed() -> dict:
    v = (config.load_yaml("ladder") or {}).get("vworld_analysis") or {}
    return {"allowed": bool(v.get("allowed")), "reason": v.get("reason")}


def result(best: dict | None, target_ok: bool) -> dict:
    if not target_ok:
        return {"imagery_id": None, "reason": "no_region"}
    if best is None:
        v = vworld_allowed()
        return {"imagery_id": None, "reason": "no_imagery", "vworld": v,
                "next": "영상 등록"}
    return {"imagery_id": best["id"], "gsd_m": float(best["gsd_m"]) if best.get("gsd_m") is not None else None, "year": _year(best) or None,
            "coverage": best["coverage"], "source": "local", "name": best.get("name"), "sgg_cd": best.get("sgg_cd"),
            "partial": best["coverage"] < 0.95}


SQL_ROWS = ("SELECT id, name, gsd_m, year, epoch, sgg_cd, path_internal, layer, ST_AsGeoJSON(footprint) AS fp FROM imagery "
            "WHERE footprint IS NOT NULL AND coalesce(layer->>'role','imagery')='imagery' AND coalesce(kind,'ortho') <> 'terrain'")


_FP_GEOM: dict = {}   # (영상 id, 범위 GeoJSON 글) → 고친 도형 — 같은 범위를 부를 때마다 다시 풀지 않는다(83장 기준 0.6초 → 0.05초 · impl-34 속도)


def _fp_geom(iid, fp):
    from shapely.geometry import shape
    if not fp:
        return None
    key = (iid, fp if isinstance(fp, str) else json.dumps(fp, sort_keys=True))
    g = _FP_GEOM.get(key)
    if g is None:
        g = shape(json.loads(fp) if isinstance(fp, str) else fp).buffer(0)
        if len(_FP_GEOM) > 4000:
            _FP_GEOM.clear()
        _FP_GEOM[key] = g
    return g


def rows_from(records) -> list[dict]:
    out = []
    for r in records:
        r = dict(r)
        layer = r.get("layer") or {}
        if isinstance(layer, str):
            layer = json.loads(layer)
        fp = r.get("fp")
        p = r.get("path_internal") or layer.get("cog_path")
        name = r.get("name")
        if isinstance(name, str):
            try:
                name = json.loads(name)
            except Exception:
                pass
        out.append({"id": r["id"], "name": name.get("ko") if isinstance(name, dict) else name, "gsd_m": r.get("gsd_m"), "year": r.get("year"),
                    "epoch": r.get("epoch"), "sgg_cd": r.get("sgg_cd"), "fp": _fp_geom(r["id"], fp),
                    "readable": bool(p) and os.path.exists(_resolve(p))})
    return out


def target_geom(sgg_cd: str | None, geom_4326: dict | None):
    """대상 = geom(주면) ∩ 시군구(주면) · 옛/새 시군구 코드 모두."""
    from shapely.geometry import shape
    from landxi_api.regions import regions_base
    t = None
    if sgg_cd:
        regions, geoms, _ = regions_base()
        cd = str(sgg_cd)
        g = geoms.get(cd)
        if g is None:                     # 옛 코드로 물으면 새 코드 경계
            r = next((x for x in regions if x.get("prev_cd") == cd), None)
            g = geoms.get(r["sgg_cd"]) if r else None
        t = g
    if geom_4326:
        gg = shape(geom_4326 if geom_4326.get("type") != "Feature" else geom_4326["geometry"]).buffer(0)
        t = gg if t is None else (t.intersection(gg) if t.intersects(gg) else gg)
    return t


def best_imagery_sync(sgg_cd: str | None, geom_4326: dict | None = None) -> dict:
    import psycopg
    from psycopg.rows import dict_row
    t = target_geom(sgg_cd, geom_4326)
    if t is None or t.is_empty:
        return result(None, False)
    with psycopg.connect(config.PG_WORKER_DSN, row_factory=dict_row) as c:
        recs = c.execute(SQL_ROWS).fetchall()
    return result(choose(rows_from(recs), t), True)
