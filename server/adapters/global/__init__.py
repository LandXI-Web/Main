"""Land-XI Global (F1-D) — 글로벌 어댑터·전처리 공통 도구.

- 패키지 이름이 파이썬 예약어 `global` 이므로 `from server.adapters.global import …` 는 문법 오류다.
  다른 모듈은 `importlib.import_module("server.adapters.global")` 로 부른다(워커 스캔도 문자열 import).
- 산출 규약(F1-D 브리프 §0): 정본은 `LX_DATA_ROOT/global/`, 화면용 사본은 `landxi/global/data/`.
- 멱등: 원천 응답은 `LX_DATA_ROOT/global/raw/` 에 캐시하고 `fetched_at` 을 캐시 메타에서 읽는다.
  `--refresh` 없이 다시 돌리면 산출 파일이 바이트 단위로 같다.
"""
from __future__ import annotations

import hashlib
import json
import os
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

KST = timezone(timedelta(hours=9))
REPO = Path(__file__).resolve().parents[3]
DATA_ROOT = Path(os.environ.get("LX_DATA_ROOT", "E:/Land-XI 플랫폼/02. 데이터"))
GLOBAL_ROOT = DATA_ROOT / "global"
RAW = GLOBAL_ROOT / "raw"
SCREEN = REPO / "landxi" / "global" / "data"
UA = {"user-agent": "Land-XI-F1D/0.1 (+LX GeoAI platform prototype; contact via LX)"}


def now_iso() -> str:
    return datetime.now(KST).isoformat(timespec="seconds")


def env(value, unit: str, basis: str, source: str, as_of: str | None = None, note: str | None = None) -> dict:
    """F1-CONTRACT §2 숫자 봉투."""
    e = {"value": value, "unit": unit, "basis": basis, "as_of": as_of or now_iso()[:10], "source": source}
    if note:
        e["note"] = note
    return e


def _meta_path(p: Path) -> Path:
    return p.with_name(p.name + ".meta.json")


def cached_fetch(url: str, name: str | None = None, *, method: str = "GET", body=None, refresh: bool = False,
                 timeout: float = 120, binary: bool = True) -> tuple[bytes, dict]:
    """원천 응답을 raw/ 에 캐시한다. (내용, 메타{url, fetched_at, sha256, bytes}) 를 돌려준다."""
    import httpx

    RAW.mkdir(parents=True, exist_ok=True)
    key = name or hashlib.sha1((method + url + json.dumps(body, sort_keys=True) if body else method + url).encode()).hexdigest()[:16]
    p = RAW / key
    mp = _meta_path(p)
    if p.exists() and mp.exists() and not refresh:
        return p.read_bytes(), json.loads(mp.read_text(encoding="utf-8"))
    last = None
    for attempt in range(4):
        try:
            with httpx.Client(follow_redirects=True, timeout=timeout, headers=UA) as c:
                r = c.request(method, url, json=body) if body is not None else c.request(method, url)
            r.raise_for_status()
            data = r.content
            meta = {"url": url, "method": method, "body": body, "fetched_at": now_iso(), "bytes": len(data),
                    "sha256": hashlib.sha256(data).hexdigest(), "status": r.status_code}
            p.write_bytes(data)
            mp.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
            return data, meta
        except Exception as ex:  # noqa: BLE001 — 재시도 후 올린다
            last = ex
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"fetch failed {url}: {last}")


def write_out(name: str, obj, *, screen: bool = True, indent=None) -> list[Path]:
    """정본(LX_DATA_ROOT/global) + 화면 사본(landxi/global/data). 같은 내용이면 쓰지 않는다(mtime 보존)."""
    text = json.dumps(obj, ensure_ascii=False, indent=indent, separators=None if indent else (",", ":"))
    out = []
    targets = [GLOBAL_ROOT / name] + ([SCREEN / name] if screen else [])
    for t in targets:
        t.parent.mkdir(parents=True, exist_ok=True)
        if t.exists() and t.read_text(encoding="utf-8") == text:
            out.append(t)
            continue
        t.write_text(text, encoding="utf-8")
        out.append(t)
    return out


def rnd(coords, nd: int = 5):
    """GeoJSON 좌표 반올림(재귀)."""
    if isinstance(coords, (int, float)):
        return round(coords, nd)
    return [rnd(c, nd) for c in coords]
