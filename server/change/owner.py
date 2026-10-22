"""소유구분 — 브이월드 토지소유정보 API(10-22 사용자 허락: "브이월드 토지소유정보 API 연결은 허락한다.").

· 받는 값은 분류만: 소유구분명(국유지 · 공유지 · 개인 · 법인 · 종중 …) + 국가기관구분명(국유지 · 공유지일 때 관리 기관 분류) + 기준 연월.
  성명 · 주소 · 거주지 · 공유인 수 · 변동 원인 같은 값은 받더라도 버린다(저장 · 표시 · 기록 0).
· 키는 서버 설정(server/.env · VWORLD_KEY · VWORLD_DOMAIN)에서만 읽고, 주소 · 키를 기록에 남기지 않는다(오류도 상태 코드만).
· 캐시: 02. 데이터/change/_cache/vworld-owner/{PNU 앞 10자리}/{PNU}.json(분류 값만) — 저장소 밖. 이미 있으면 다시 묻지 않는다.
· 속도: 한 번에 넷 · 요청 사이 0.15초 — 브이월드 하루 한도 안에서(필요한 필지만 묻는다 · 변화 폴리곤이 걸친 필지).
"""
from __future__ import annotations

import json
import threading
import time
from concurrent.futures import ThreadPoolExecutor

from . import DATA

CACHE = DATA / "_cache" / "vworld-owner"
URL = "https://api.vworld.kr/ned/data/getPossessionAttr"
_lock = threading.Lock()
_last = [0.0]
KEEP = ("posesnSeCodeNm", "nationInsttSeCodeNm", "stdrYm")


def _path(pnu: str):
    return CACHE / pnu[:10] / f"{pnu}.json"


def _ask(pnu: str) -> dict | None:
    import requests

    from landxi_api import config
    key, dom = config.VWORLD_KEY, config.VWORLD_DOMAIN
    if not key:
        return None
    with _lock:                                    # 간격 지키기
        wait = 0.15 - (time.time() - _last[0])
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.time()
    for k in range(3):
        try:
            r = requests.get(URL, params={"key": key, "domain": dom, "pnu": pnu, "format": "json", "numOfRows": 10, "pageNo": 1}, timeout=15)
            if r.status_code != 200:
                time.sleep(1 + k)
                continue
            rows = ((r.json().get("possessions") or {}).get("field")) or []
            if isinstance(rows, dict):
                rows = [rows]
            if not rows:
                return {"posesn": None}
            # 소유 줄이 여럿(공유)이면 가장 많은 분류 · 기관 분류를 쓴다 — 사람 단위 값은 버린다
            kinds = [str(x.get("posesnSeCodeNm") or "").strip() for x in rows if x.get("posesnSeCodeNm")]
            inst = [str(x.get("nationInsttSeCodeNm") or "").strip() for x in rows if x.get("nationInsttSeCodeNm")]
            top = max(set(kinds), key=kinds.count) if kinds else None
            return {"posesn": top, "kinds": sorted(set(kinds)), "inst": max(set(inst), key=inst.count) if inst else None,
                    "ym": str(rows[0].get("stdrYm") or "") or None}
        except Exception:  # noqa: BLE001 — 주소 · 키를 남기지 않는다
            time.sleep(1 + k)
    return None


def get(pnu: str) -> dict | None:
    p = _path(pnu)
    if p.exists():
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except Exception:  # noqa: BLE001
            pass
    v = _ask(pnu)
    if v is not None:
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(v, ensure_ascii=False), encoding="utf-8")
    return v


def label(v: dict | None) -> str | None:
    """화면 · 보고서 글 — '국유지(국토교통부)' · '개인' · '공유지' · 여럿이면 '개인 외 1'."""
    if not v or not v.get("posesn"):
        return None
    s = v["posesn"]
    if v.get("inst") and v["inst"] not in s and "구분없음" not in v["inst"]:
        s += f"({v['inst']})"
    extra = [k for k in (v.get("kinds") or []) if k != v["posesn"]]
    if extra:
        s += f" 외 {len(extra)}"
    return s


def fill(pnus: list[str], workers: int = 4) -> dict[str, str]:
    """PNU 목록 → {PNU: 소유구분 글}. 못 받은 PNU 는 빠진다(부르는 쪽이 앞 값을 둔다)."""
    pn = [p for p in dict.fromkeys(pnus) if p and len(str(p)) == 19]
    out: dict[str, str] = {}
    with ThreadPoolExecutor(max_workers=workers) as ex:
        for p, v in zip(pn, ex.map(get, pn)):
            lb = label(v)
            if lb:
                out[p] = lb
    return out
