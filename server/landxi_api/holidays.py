"""공휴일(10-18 확인 대장 '제안-공휴일빨강') — GET /holidays?year=YYYY → {year, source, items:[{day, name}]}.

달력에서 공휴일을 빨갛게 · 이름을 보여 주는 한 출처.
  1) server/.env 에 HOLIDAY_API_KEY 가 있으면 공공데이터포털 '특일 정보'(한국천문연구원 SpcdeInfoService/getRestDeInfo)에서 그 해를 받아
     메모리에 해마다 한 번 담아 둔다(하루 뒤 다시 · 받지 못하면 아래 표로).  source = "api"
  2) 키가 없거나 받지 못하면 내장 표(2026 · 2027 — 대체공휴일 포함).                         source = "table"
     표에 없는 해는 법정 고정일(신정 · 삼일절 · 어린이날 · 현충일 · 광복절 · 개천절 · 한글날 · 성탄절)만 내고 source = "fixed" (음력 공휴일은 키가 있어야 정확).
키는 코드 · 문서에 적지 않는다(config 가 .env 에서 읽음).
"""
from __future__ import annotations

import time

import httpx
from fastapi import APIRouter, Request

from . import config
from .deps import ApiError, principal, require

router = APIRouter()

# 내장 표 — 대체공휴일 규칙: 설날 · 추석은 일요일/다른 공휴일과 겹칠 때, 삼일절 · 광복절 · 개천절 · 한글날 · 부처님오신날 · 어린이날 · 성탄절은 토 · 일 · 공휴일과 겹칠 때 다음 평일. 현충일 · 신정은 대체 없음.
TABLE: dict[int, list[tuple[str, str]]] = {
    2026: [
        ("01-01", "신정"), ("02-16", "설날 연휴"), ("02-17", "설날"), ("02-18", "설날 연휴"),
        ("03-01", "삼일절"), ("03-02", "삼일절 대체공휴일"), ("05-05", "어린이날"),
        ("05-24", "부처님오신날"), ("05-25", "부처님오신날 대체공휴일"), ("06-03", "전국동시지방선거일"),
        ("06-06", "현충일"), ("08-15", "광복절"), ("08-17", "광복절 대체공휴일"),
        ("09-24", "추석 연휴"), ("09-25", "추석"), ("09-26", "추석 연휴"),
        ("10-03", "개천절"), ("10-05", "개천절 대체공휴일"), ("10-09", "한글날"), ("12-25", "성탄절"),
    ],
    2027: [
        ("01-01", "신정"), ("02-05", "설날 연휴"), ("02-06", "설날"), ("02-07", "설날 연휴"), ("02-08", "설날 대체공휴일"),
        ("03-01", "삼일절"), ("05-05", "어린이날"), ("05-13", "부처님오신날"), ("06-06", "현충일"),
        ("08-15", "광복절"), ("08-16", "광복절 대체공휴일"),
        ("09-14", "추석 연휴"), ("09-15", "추석"), ("09-16", "추석 연휴"),
        ("10-03", "개천절"), ("10-04", "개천절 대체공휴일"), ("10-09", "한글날"), ("10-11", "한글날 대체공휴일"),
        ("12-25", "성탄절"), ("12-27", "성탄절 대체공휴일"),
    ],
}
FIXED = [("01-01", "신정"), ("03-01", "삼일절"), ("05-05", "어린이날"), ("06-06", "현충일"), ("08-15", "광복절"), ("10-03", "개천절"), ("10-09", "한글날"), ("12-25", "성탄절")]
URL = "https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo"
_cache: dict[int, tuple[float, list[dict]]] = {}      # 해 → (받은 시각, 목록)
TTL = 24 * 3600


async def _from_api(year: int, key: str) -> list[dict] | None:
    try:
        async with httpx.AsyncClient(timeout=10, headers={"User-Agent": "LandXI-gateway/0.1"}) as c:
            r = await c.get(URL, params={"serviceKey": key, "solYear": year, "numOfRows": 60, "_type": "json"})
        r.raise_for_status()
        items = (((r.json().get("response") or {}).get("body") or {}).get("items") or {})
        items = items.get("item") if isinstance(items, dict) else None
        if isinstance(items, dict):
            items = [items]
        out = []
        for it in items or []:
            s = str(it.get("locdate", ""))
            if len(s) == 8 and it.get("isHoliday", "Y") == "Y":
                out.append({"day": f"{s[:4]}-{s[4:6]}-{s[6:]}", "name": str(it.get("dateName", "")).strip() or "공휴일"})
        return sorted(out, key=lambda x: x["day"]) or None
    except Exception:
        return None


@router.get("/holidays")
async def holidays(request: Request, year: int = 0):
    require(principal(request))
    if year < 2000 or year > 2100:
        raise ApiError("bad_request", "연도는 2000~2100 사이로 보냅니다")
    key = config.get("HOLIDAY_API_KEY", "") or ""
    if key:
        hit = _cache.get(year)
        if not hit or time.time() - hit[0] > TTL:
            got = await _from_api(year, key)
            if got:
                _cache[year] = (time.time(), got)
            hit = _cache.get(year)
        if hit:
            return {"year": year, "source": "api", "items": hit[1]}
    if year in TABLE:
        return {"year": year, "source": "table", "items": [{"day": f"{year}-{d}", "name": n} for d, n in TABLE[year]]}
    return {"year": year, "source": "fixed", "items": [{"day": f"{year}-{d}", "name": n} for d, n in FIXED]}
