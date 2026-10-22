"""XI맵 융합 대시보드 집계(10-14 11:02 확인 · 원칙 241 · 245) — AI 분석 결과 × 지적(필지 · 지목 · 공시지가) × 지금 도는 분석.

GET /api/v1/ximap/agg?by=&sgg=&task=     LX 계정
  by=task    업무별      — 서비스 결과 장부(GET /ximap/board 와 같은 줄) + 전국 분석 진행 장부(GET /national/region 과 같은 셈 · 자산마다 한 분류씩)
                            = XI맵 말풍선 · 지도 안 숫자와 같은 값. sgg 없으면 전국.
  by=emd     읍면동별    — 그 시군구 읍면동 × 업무(서비스 결과 객체의 읍면동 · 전국 분석 칸 숫자) + 실태조사 의심 필지 · 연속지적 필지 수 · 읍면동 넓이
  by=region  시군구별    — 전국(sgg 없음) 시군구 × 업무(같은 두 장부) + 시군구 넓이
  by=jimok   지목별      — 연속지적 필지(지목 · 필지 수 · 넓이 · 공시지가) × 실태조사 의심 필지 × AI 분석 결과가 걸린 필지(그 시군구 지금 결과만)
  by=rule    의심 종류별 — 실태조사 의심 필지(R1–R6) 읍면동 × 종류
  by=year    해마다      — 업무마다 영상 연도별 결과(서비스 결과 장부의 영상 연도 · 전국 분석 연도)
  by=area    면적 구간별 — 서비스 결과 객체 넓이(㎡) 구간별 수(task 필수)
  by=time    날짜별      — 전국 분석이 끝낸 읍면동 · 찾은 결과(시간 · 날짜 묶음 · 누적) · 지금 분석 중인 칸
숫자는 데이터베이스에서 그 자리에서 센 값만(지어낸 숫자 0) · 화면에는 작업 id · 표 이름 · 경로를 내지 않는다(set 은 집계 안에서만 씀).
대시보드 도구(agent/tools/ext/dash.py)가 같은 함수를 부른다(숫자 한 출처).
"""
from __future__ import annotations

import asyncio
import contextvars
import datetime as dt
import json
import time

from fastapi import APIRouter, Request

from .deps import ApiError, Principal, db, principal, require
from .envelope import KST, now_iso

router = APIRouter()

TASK_OF = {"경작·휴경": "경작지", "경작": "경작지", "건축물": "건물"}          # board.js TASK_OF 와 같은 묶음(새 이름 0)
NCLS = {"farm": ("경작지", "비닐하우스"), "river": ("건물",)}                   # 전국 분석 — 자산마다 보이는 분류(XI맵 national.js NCLS 와 같음)
NAT_NAME = {"farm": "농지 전수", "river": "하천 · 계곡"}
SVC_UNIT = {"경작·휴경": "필지"}                                                 # 결과 하나 = 필지 하나인 서비스(결과 설명서 셈 단위와 같은 말)
UNIT = {"경작지": "곳", "비닐하우스": "동", "건물": "동", "주차장": "곳", "곤포사일리지": "개", "토지피복": "개", "국토 변화": "곳", "해양쓰레기": "개"}
JIMOK = {"답": "답", "전": "전", "과": "과수원", "임": "임야", "구": "구거", "도": "도로", "천": "하천", "대": "대지", "유": "유지", "제": "제방", "잡": "잡종지",
         "창": "창고용지", "장": "공장용지", "학": "학교용지", "목": "목장용지", "광": "광천지", "염": "염전", "주": "주유소용지", "차": "주차장", "철": "철도용지",
         "수": "수도용지", "공": "공원", "체": "체육용지", "원": "유원지", "종": "종교용지", "사": "사적지", "묘": "묘지", "양": "양어장"}
RULES = ("R1", "R2", "R3", "R4", "R5", "R6")
COUNT_RULES = RULES + ("L1", "L2", "L3")      # 지역 숫자 = AI 규칙 + 대장 대조(10-22 현장확인숫자 ⓐ · survey.db COUNT_RULE_IDS 와 같은 값)


def once_sql(a: str = "survey_findings") -> str:
    """같은 필지 · 같은 규칙 한 번(바퀴 16) — survey.db.once_sql 한 곳(경로를 넣고 읽는다)."""
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from survey.db import once_sql as f
    return f(a)


AREA_BINS = [(0, 50), (50, 100), (100, 300), (300, 1000), (1000, 3000), (3000, None)]
_C: dict = {}
TTL = 60.0


def _nat_cls_sql(off=()) -> str:
    """전국 분석 자산마다 세는 분류(NCLS) — 끈 클래스를 뺀 SQL 조건(이름은 NCLS 고정값만 · 사용자 값은 넣지 않음)."""
    parts = []
    for a, cs in NCLS.items():
        keep = [c for c in cs if c not in set(off or ())]
        if keep:
            parts.append(f"(asset='{a}' AND k IN ({','.join(repr(c) for c in keep)}))")
    return " OR ".join(parts) or "false"


def task_of(name: str) -> str:
    return TASK_OF.get(name, name)


# 오래된 집계는 그대로 내주고 뒤에서 새로 센다(WP-11 · 원칙 251) — 지목 집계 한 번 6초 · 읍면동 1초를 질문마다 기다리지 않게.
# STALE_MAX 안에서만(그 뒤는 새로 셀 때까지 기다린다). 같은 함수 · 같은 값이라 통계 판과 ChatGEO 답의 숫자는 그대로 한 출처.
STALE_MAX = 7200.0
_SWR = {"task": "agg_task", "emd": "agg_emd", "region": "agg_region", "jimok": "agg_jimok", "rule": "agg_rule", "area": "agg_area"}
_FORCE = contextvars.ContextVar("xdash_force", default=False)
_BUSY: set = set()


def _cache(key, ttl=TTL):
    v = _C.get(key)
    if not v or _FORCE.get():
        return None
    age = time.time() - v[0]
    if age < ttl:
        return v[1]
    if age < STALE_MAX and key[0] in _SWR:
        _kick(key)
        return v[1]
    return None


async def warm(limit: int = 16):
    """게이트웨이 기동 때 실태조사 결과가 있는 시군구의 무거운 집계(지목 · 의심 종류 · 읍면동)를 미리 센다 — 첫 질문이 9초를 기다리지 않게."""
    async with db(realm="lx") as conn:
        sggs = [r["sgg_cd"] for r in await conn.fetch(
            "SELECT sgg_cd FROM survey_sgg WHERE state='done' AND coalesce(findings,0) > 0 ORDER BY findings DESC LIMIT $1", limit)]
    for sgg in sggs:
        for f in (agg_rule, agg_jimok, agg_emd):
            try:
                await f(sgg)
            except Exception:  # noqa: BLE001
                pass


def _kick(key):
    if key in _BUSY:
        return
    _BUSY.add(key)

    async def go():
        tok = _FORCE.set(True)
        try:
            await globals()[_SWR[key[0]]](*key[1:])
        except Exception:  # noqa: BLE001 — 새로 세기 실패면 다음 질문이 다시 시도(오래된 값은 STALE_MAX 까지)
            pass
        finally:
            _FORCE.reset(tok)
            _BUSY.discard(key)
    try:
        asyncio.get_running_loop().create_task(go())
    except RuntimeError:
        _BUSY.discard(key)


def _put(key, val):
    _C[key] = (time.time(), val)
    return val


def _jv(v):
    return json.loads(v) if isinstance(v, str) else (v or {})


def _pre(sgg: str) -> str:
    """구가 있는 시(끝자리 0 · 예 52110)는 구 칸까지(전국 분석 장부 national/region 과 같은 규칙)."""
    return sgg[:4] if sgg.endswith("0") else sgg


async def _board():
    from . import ximap as XM
    if not XM._BOARD.get("v"):
        await XM._rebuild(Principal(realm="lx", role="staff", user_id="system"))
    return XM._BOARD.get("v") or {}, XM._SID


def _codes(sgg: str) -> list[str]:
    from .regions import sgg_codes
    return sgg_codes(sgg) or [sgg]


def _board_region(bd: dict, sgg: str) -> dict | None:
    cs = set(_codes(sgg))
    return next((r for r in bd.get("regions", []) if r["sgg_cd"] in cs or (r.get("prev_cd") and r["prev_cd"] in cs)), None)


async def _nat_year(conn) -> int:
    from .national import _settings
    return int((await _settings(conn))[0]["year"])


def region_name(sgg: str | None) -> str:
    if not sgg:
        return "전국"
    from .regions import city_children, region_of
    r = region_of(sgg)
    if not r:
        kids = city_children(sgg)                      # 구가 있는 시(지도의 시 코드) — 시 이름
        return str(kids[0]["name"]).split()[0] if kids else sgg
    return r.get("name") or sgg


# ── 업무별 ─────────────────────────────────────────────────────────────────────
async def agg_task(sgg: str | None = None) -> dict:
    """[{k 업무, name 화면 이름, n, unit, src service|national}] — XI맵 말풍선(regionRows) · 전국 합계(boardTotal)와 같은 셈."""
    key = ("task", sgg)
    if (c := _cache(key)) is not None:
        return c
    bd, _ = await _board()
    rows = []
    if sgg:
        br = _board_region(bd, sgg)
        for x in (br or {}).get("items", []):
            n = int((x.get("n") or {}).get("value") or 0)
            if n > 0:
                rows.append({"k": task_of(x["name"]), "name": x["name"], "n": n, "unit": SVC_UNIT.get(x["name"]) or UNIT.get(task_of(x["name"]), "개"), "src": "service", "year": x.get("year")})
    else:
        for s in bd.get("services", []):
            n = int((s.get("n") or {}).get("value") or 0)
            if n > 0:
                rows.append({"k": task_of(s["name"]), "name": s["name"], "n": n, "unit": UNIT.get(task_of(s["name"]), "개"), "src": "service"})
    async with db(realm="lx") as conn:
        year = await _nat_year(conn)
        args = [year]
        where = ""
        if sgg:
            where = " AND sgg_cd LIKE ANY (SELECT p || '%' FROM unnest($2::text[]) p)"
            args.append(sorted({_pre(c) for c in _codes(sgg)}))
        sums = await conn.fetch(
            "SELECT asset, k AS cls, sum((v->>'n')::bigint) AS n FROM national_cells, jsonb_each(counts) AS e(k, v) "
            f"WHERE year=$1 AND NOT test AND state='done'{where} GROUP BY asset, k", *args)
    from . import overlap as OV
    dup = []
    for s in sums:
        if s["cls"] in NCLS.get(s["asset"], ()) and int(s["n"] or 0) > 0:
            # 같은 업무의 서비스 결과가 덮은 읍면동은 서비스 결과로 센다(겹친 곳 한 번 · overlap.py) — 남는 곳만 전국 분석 숫자
            hn, _ = await OV.hidden_sum(s["asset"], s["cls"], args[1] if sgg else None)
            n = int(s["n"]) - hn
            if hn > 0:
                dup.append({"k": s["cls"], "name": f"{s['cls']}({NAT_NAME[s['asset']]})", "n": hn, "unit": UNIT.get(s["cls"], "개"), "year": year})
            if n > 0:
                rows.append({"k": s["cls"], "name": f"{s['cls']}({NAT_NAME[s['asset']]})", "n": n, "unit": UNIT.get(s["cls"], "개"), "src": "national", "year": year})
    rows.sort(key=lambda r: -r["n"])
    return _put(key, {"by": "task", "sgg": sgg, "name": region_name(sgg), "rows": rows, "dup": dup, "as_of": now_iso(),
                      "source": "서비스 결과 장부 + 전국 분석 진행 장부(끝난 읍면동 · 같은 업무의 서비스 결과가 덮은 읍면동은 빼고)"})


# ── 읍면동별(그 시군구) ──────────────────────────────────────────────────────────
async def agg_emd(sgg: str) -> dict:
    """[{cd, name, km2, farm_km2, vals {업무 이름: n}, suspects, parcels}] + cols(업무 이름 · 단위). 업무 이름 = agg_task 의 name(말풍선과 같은 줄)."""
    key = ("emd", sgg)
    if (c := _cache(key)) is not None:
        return c
    bd, SID = await _board()
    br = _board_region(bd, sgg)
    sets = {}
    for x in (br or {}).get("items", []):
        sid = SID.get((x.get("layer") or {}).get("set"))
        if sid:
            sets[sid] = x["name"]
    codes = _codes(sgg)
    pre = sorted({_pre(c) for c in codes})
    emd: dict[str, dict] = {}

    def row(cd, name=None):
        r = emd.setdefault(cd, {"cd": cd, "name": name, "km2": None, "farm_km2": None, "vals": {}, "suspects": None, "parcels": None})
        if name and not r["name"]:
            r["name"] = name
        return r
    from . import overlap as OV
    cov = await OV.covered()
    async with db(realm="lx") as conn:
        year = await _nat_year(conn)
        cells = await conn.fetch(
            "SELECT asset, cell_cd, name, emd_km2, target_km2, state, counts FROM national_cells "
            "WHERE year=$1 AND NOT test AND sgg_cd LIKE ANY (SELECT p || '%' FROM unnest($2::text[]) p)", year, pre)
        for c in cells:
            r = row(c["cell_cd"], c["name"])
            if c["emd_km2"] is not None:
                r["km2"] = round(float(c["emd_km2"]), 3)
            if c["asset"] == "farm" and c["state"] != "skip" and c["target_km2"] is not None:
                r["farm_km2"] = round(float(c["target_km2"]), 3)
            if c["state"] == "done":
                cnt = _jv(c["counts"])
                for cls in NCLS.get(c["asset"], ()):
                    if cls in cov.get((c["asset"], c["cell_cd"]), ()):
                        continue                         # 그 읍면동은 같은 업무의 서비스 결과가 센다(overlap.py)
                    n = int((cnt.get(cls) or {}).get("n") or 0)
                    nm = f"{cls}({NAT_NAME[c['asset']]})"
                    r["vals"][nm] = r["vals"].get(nm, 0) + n
        if sets:
            from .result_scope import only_cls, only_sql
            await only_cls(conn)
            da = [list(sets)]
            ow = "".join(" AND " + x for x in only_sql(list(sets), da))      # 서비스 분류만 보이는 결과
            det = await conn.fetch(
                "SELECT job_id, emd_cd, max(emd) AS emd, count(*)::int AS n FROM detections WHERE job_id = ANY($1::text[]) "
                f"AND coalesce(edit_state,'raw') <> 'deleted' AND emd_cd IS NOT NULL{ow} GROUP BY 1, 2", *da)
            # 읍면동이 비어 있는 결과(일부 묶음) — 객체 가운데가 든 읍면동 칸(전국 분석 장부의 읍면동 경계)으로
            ma = [list(sets), year]
            mw = "".join(" AND " + x for x in only_sql(list(sets), ma, "d"))
            miss = await conn.fetch(
                "SELECT d.job_id, c.cell_cd AS emd_cd, max(c.name) AS emd, count(*)::int AS n FROM detections d "
                "JOIN national_cells c ON c.asset='farm' AND c.year=$2 AND NOT c.test AND ST_Intersects(c.geom_s, ST_PointOnSurface(d.geom)) "
                f"WHERE d.job_id = ANY($1::text[]) AND coalesce(d.edit_state,'raw') <> 'deleted' AND d.emd_cd IS NULL AND d.geom IS NOT NULL{mw} GROUP BY 1, 2",
                *ma)
            for d in [*det, *miss]:
                r = row(d["emd_cd"], d["emd"])
                nm = sets[d["job_id"]]
                r["vals"][nm] = r["vals"].get(nm, 0) + int(d["n"])
        sc = list(codes)
        try:
            for s in await conn.fetch(
                    "SELECT emd_cd, count(*)::int AS n FROM survey_findings WHERE sgg_cd = ANY($1::text[]) AND rule = ANY($2::text[]) AND " + once_sql() + " GROUP BY 1", sc, list(COUNT_RULES)):
                row(s["emd_cd"])["suspects"] = int(s["n"])
            for s in await conn.fetch("SELECT emd_cd, name, parcels FROM survey_emd WHERE sgg_cd = ANY($1::text[])", sc):
                r = row(s["emd_cd"], s["name"])
                r["parcels"] = int(s["parcels"] or 0)
        except Exception:  # noqa: BLE001 — 실태조사 표가 없으면 그 칸만 비움
            pass
    task = await agg_task(sgg)
    cols = [{"name": t["name"], "k": t["k"], "unit": t["unit"], "n": t["n"]} for t in task["rows"]]
    rows = [r for r in emd.values() if r["name"]]
    rows.sort(key=lambda r: r["cd"])
    return _put(key, {"by": "emd", "sgg": sgg, "name": region_name(sgg), "cols": cols, "rows": rows, "year": year, "as_of": now_iso(),
                      "source": "서비스 결과 객체의 읍면동 + 전국 분석 칸(읍면동) + 실태조사 의심 필지 · 연속지적 필지"})


# ── 시군구별(전국) ───────────────────────────────────────────────────────────────
async def agg_region() -> dict:
    key = ("region",)
    if (c := _cache(key)) is not None:
        return c
    bd, _ = await _board()
    regs: dict[str, dict] = {}
    from .regions import region_of

    def row(cd, name, sido=None):
        r0 = region_of(cd) or {}
        cd2 = r0.get("sgg_cd") or cd
        r = regs.setdefault(cd2, {"cd": cd2, "name": r0.get("name") or name, "sido": sido or r0.get("sido_short") or r0.get("sido"), "vals": {}, "km2": None})
        return r
    for b in bd.get("regions", []):
        r = row(b["sgg_cd"], b["name"], b.get("sido"))
        for x in b["items"]:
            n = int((x.get("n") or {}).get("value") or 0)
            if n > 0:
                r["vals"][x["name"]] = r["vals"].get(x["name"], 0) + n
    async with db(realm="lx") as conn:
        year = await _nat_year(conn)
        rows = await conn.fetch(
            "SELECT asset, sgg_cd, max(sgg_name) AS sgg_name, max(sido) AS sido, k AS cls, sum((v->>'n')::bigint) AS n "
            "FROM national_cells, jsonb_each(counts) AS e(k, v) WHERE year=$1 AND NOT test AND state='done' GROUP BY asset, sgg_cd, k", year)
        km = await conn.fetch("SELECT sgg_cd, sum(emd_km2) AS km2 FROM national_cells WHERE year=$1 AND NOT test AND asset='farm' GROUP BY 1", year)
    from . import overlap as OV
    hid = await OV.hidden_by_sgg()
    for s in rows:
        if s["cls"] not in NCLS.get(s["asset"], ()):
            continue
        n = int(s["n"] or 0) - hid.get((s["asset"], s["cls"], s["sgg_cd"]), (0, 0))[0]   # 서비스 결과가 덮은 읍면동은 빼고(overlap.py)
        if n <= 0:
            continue
        r = row(s["sgg_cd"], s["sgg_name"], s["sido"])
        nm = f"{s['cls']}({NAT_NAME[s['asset']]})"
        r["vals"][nm] = r["vals"].get(nm, 0) + n
    kmap = {k["sgg_cd"]: float(k["km2"] or 0) for k in km}
    for r in regs.values():
        v = kmap.get(r["cd"]) or sum(v for c, v in kmap.items() if c.startswith(_pre(r["cd"])) and c != r["cd"] and r["cd"].endswith("0"))
        r["km2"] = round(v, 1) if v else None
    task = await agg_task(None)
    cols = [{"name": t["name"], "k": t["k"], "unit": t["unit"], "n": t["n"]} for t in task["rows"]]
    out = [r for r in regs.values() if r["vals"]]
    out.sort(key=lambda r: -sum(r["vals"].values()))
    return _put(key, {"by": "region", "sgg": None, "name": "전국", "cols": cols, "rows": out, "year": year, "as_of": now_iso(),
                      "source": "서비스 결과 장부 + 전국 분석 진행 장부(시군구 합)"})


# ── 지목별 ─────────────────────────────────────────────────────────────────────
async def agg_jimok(sgg: str) -> dict:
    key = ("jimok", sgg)
    if (c := _cache(key, 300)) is not None:
        return c
    bd, SID = await _board()
    br = _board_region(bd, sgg)
    sets = [s for s in (SID.get((x.get("layer") or {}).get("set")) for x in (br or {}).get("items", [])) if s]
    codes = _codes(sgg)
    async with db(realm="lx") as conn:
        par = await conn.fetch(
            "SELECT jimok, count(*)::int AS n, sum(area_m2) AS m2, count(jiga)::int AS nj, "
            "percentile_cont(0.5) WITHIN GROUP (ORDER BY jiga) FILTER (WHERE jiga > 0) AS jiga_med "
            "FROM survey_parcels WHERE sgg_cd = ANY($1::text[]) GROUP BY 1", codes)
        sus = {r["jimok"]: int(r["n"]) for r in await conn.fetch(
            "SELECT jimok, count(DISTINCT pnu)::int AS n FROM survey_findings WHERE sgg_cd = ANY($1::text[]) AND rule = ANY($2::text[]) GROUP BY 1", codes, list(RULES))}
        ai = await conn.fetch(
            "SELECT jimok, cls_ko, count(DISTINCT pnu)::int AS n FROM survey_parcel_ai WHERE sgg_cd = ANY($1::text[]) AND job_id = ANY($2::text[]) GROUP BY 1, 2",
            codes, sets) if sets else []
        anyp = {r["jimok"]: int(r["n"]) for r in await conn.fetch(
            "SELECT jimok, count(DISTINCT pnu)::int AS n FROM survey_parcel_ai WHERE sgg_cd = ANY($1::text[]) AND job_id = ANY($2::text[]) GROUP BY 1",
            codes, sets)} if sets else {}
    rows = {}
    for p in par:
        k = p["jimok"] or "—"
        rows[k] = {"k": k, "name": JIMOK.get(k, k), "parcels": int(p["n"]), "km2": round(float(p["m2"] or 0) / 1e6, 3), "jiga_n": int(p["nj"] or 0),
                   "jiga_med": round(float(p["jiga_med"])) if p["jiga_med"] else None, "suspects": sus.get(p["jimok"], 0), "ai": {}}
    for a in ai:
        k = a["jimok"] or "—"
        r = rows.setdefault(k, {"k": k, "name": JIMOK.get(k, k), "parcels": 0, "km2": 0, "jiga_n": 0, "jiga_med": None, "suspects": sus.get(k, 0), "ai": {}})
        r["ai"][a["cls_ko"]] = r["ai"].get(a["cls_ko"], 0) + int(a["n"])
    for k, r in rows.items():
        r["ai_any"] = anyp.get(None if k == "—" else k, 0)        # AI 분석 결과가 하나라도 걸린 필지(분류가 둘이어도 한 번)
    out = sorted(rows.values(), key=lambda r: -r["parcels"])
    return _put(key, {"by": "jimok", "sgg": sgg, "name": region_name(sgg), "rows": out, "as_of": now_iso(),
                      "source": "연속지적 필지(지목 · 넓이 · 공시지가) × 실태조사 의심 필지 × AI 분석 결과가 걸린 필지"})


# ── 의심 종류별(읍면동 × 종류) ───────────────────────────────────────────────────
async def agg_rule(sgg: str) -> dict:
    key = ("rule", sgg)
    if (c := _cache(key)) is not None:
        return c
    codes = _codes(sgg)
    try:
        import sys
        from pathlib import Path
        sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
        from survey import rules as RL
        defs = RL.definitions()
    except Exception:  # noqa: BLE001
        defs = {}
    async with db(realm="lx") as conn:
        rows = await conn.fetch(
            "SELECT emd_cd, max(emd) AS emd, rule, count(*)::int AS n FROM survey_findings WHERE sgg_cd = ANY($1::text[]) AND rule = ANY($2::text[]) AND " + once_sql() + " GROUP BY 1, 3",
            codes, list(COUNT_RULES))
        fc = await conn.fetchval(
            "SELECT count(DISTINCT pnu) FROM survey_findings WHERE sgg_cd = ANY($1::text[]) AND rule = ANY($2::text[]) AND priority='A' AND state IN ('open','assigned')",
            codes, list(COUNT_RULES))
    emd: dict[str, dict] = {}
    for r in rows:
        e = emd.setdefault(r["emd_cd"], {"cd": r["emd_cd"], "name": r["emd"], "vals": {}})
        e["vals"][r["rule"]] = int(r["n"])
    try:
        from .ledger import ledger_rules
        ldefs = ledger_rules()
    except Exception:  # noqa: BLE001
        ldefs = {}
    have = {r["rule"] for r in rows}
    ks = list(RULES) + [k for k in COUNT_RULES if k not in RULES and k in have]      # 대장 대조 칸은 건이 있을 때만
    cols = [{"k": k, "name": (defs.get(k) or ldefs.get(k) or {}).get("name", k)} for k in ks]
    tot = {k: sum(e["vals"].get(k, 0) for e in emd.values()) for k in ks}
    return _put(key, {"by": "rule", "sgg": sgg, "name": region_name(sgg), "cols": [c | {"n": tot[c["k"]]} for c in cols], "rows": sorted(emd.values(), key=lambda e: e["cd"]),
                      "total": sum(tot.values()), "field_check": int(fc or 0), "as_of": now_iso(), "source": "실태조사 의심 필지(AI × 연속지적 규칙 · 대장 대조)"})


# ── 해마다 ─────────────────────────────────────────────────────────────────────
async def agg_year(sgg: str | None) -> dict:
    t = await agg_task(sgg)
    bd, _ = await _board()
    out: dict[str, dict] = {}
    # 줄 = 업무 화면 이름(서비스 결과 · 전국 분석을 섞지 않는다 — 모델 · 범위가 다르므로 한 줄로 더하지 않음)
    if sgg:
        for r in t["rows"]:
            y = r.get("year")
            if y:
                out.setdefault(r["name"], {}).setdefault(int(y), 0)
                out[r["name"]][int(y)] += r["n"]
    else:
        for b in bd.get("regions", []):
            for x in b["items"]:
                n = int((x.get("n") or {}).get("value") or 0)
                if x.get("year") and n:
                    out.setdefault(x["name"], {}).setdefault(int(x["year"]), 0)
                    out[x["name"]][int(x["year"])] += n
        for r in t["rows"]:
            if r["src"] == "national":
                out.setdefault(r["name"], {}).setdefault(int(r["year"]), 0)
                out[r["name"]][int(r["year"])] += r["n"]
    series = [{"name": k, "k": task_of(k.split("(")[0]), "unit": UNIT.get(task_of(k.split("(")[0]), "개"), "points": [{"year": y, "n": n} for y, n in sorted(v.items())]} for k, v in out.items()]
    series.sort(key=lambda s: -sum(p["n"] for p in s["points"]))
    return {"by": "year", "sgg": sgg, "name": region_name(sgg), "series": series, "as_of": now_iso(), "source": "서비스 결과 장부의 영상 연도 + 전국 분석 연도"}


# ── 면적 구간별 ─────────────────────────────────────────────────────────────────
def _bin_label(a, b):
    f = lambda v: f"{v:,}"  # noqa: E731
    return f"{f(b)}㎡ 미만" if a == 0 else (f"{f(a)}㎡ 이상" if b is None else f"{f(a)}–{f(b)}㎡")


async def agg_area(sgg: str | None, task: str) -> dict:
    key = ("area", sgg, task)
    if (c := _cache(key)) is not None:
        return c
    bd, SID = await _board()
    regs = [_board_region(bd, sgg)] if sgg else bd.get("regions", [])
    sets_all, sets_cls, lc = [], [], []
    for r in regs or []:
        for x in (r or {}).get("items", []):
            sid = SID.get((x.get("layer") or {}).get("set"))
            if not sid:
                continue
            if task_of(x["name"]) == task:
                sets_all.append(sid)
            elif x["name"] == "토지피복":
                lc.append((r["sgg_cd"], sid))            # 토지피복 안의 같은 분류 — 그 시군구에 그 업무 서비스 결과가 없을 때만(같은 객체를 두 번 세지 않게)
        if lc and not any(task_of(x["name"]) == task for x in (r or {}).get("items", [])):
            sets_cls += [sid for _, sid in lc]
        lc = []
    cls_names = [task] + [k for k, v in TASK_OF.items() if v == task]
    cases = " ".join(f"WHEN area_m2 >= {a}{f' AND area_m2 < {b}' if b else ''} THEN {i}" for i, (a, b) in enumerate(AREA_BINS))
    from .result_scope import only_cls, only_sql
    async with db(realm="lx") as conn:
        await only_cls(conn)
        aa = [sets_all, sets_cls, cls_names]
        ow = "".join(" AND " + x for x in only_sql(sets_all, aa))          # 서비스 분류만 보이는 결과(옛 판으로 되돌린 결과 등)
        rows = await conn.fetch(
            f"SELECT CASE {cases} END AS b, count(*)::int AS n, sum(area_m2) AS m2 FROM detections "
            "WHERE coalesce(edit_state,'raw') <> 'deleted' AND area_m2 IS NOT NULL AND "
            f"(job_id = ANY($1::text[]) OR (job_id = ANY($2::text[]) AND cls = ANY($3::text[]))){ow} GROUP BY 1",
            *aa) if (sets_all or sets_cls) else []
    got = {r["b"]: r for r in rows}
    bins = [{"label": _bin_label(a, b), "lo": a, "hi": b, "n": int((got.get(i) or {}).get("n") or 0),
             "km2": round(float((got.get(i) or {}).get("m2") or 0) / 1e6, 4)} for i, (a, b) in enumerate(AREA_BINS)]
    return _put(key, {"by": "area", "sgg": sgg, "name": region_name(sgg), "task": task, "unit": UNIT.get(task, "개"), "bins": bins,
                      "n": sum(b["n"] for b in bins), "as_of": now_iso(), "source": "서비스 결과 · 시군구 전역 분석 객체 넓이"})


# ── 날짜별(지금 도는 전국 분석) ──────────────────────────────────────────────────
def without(res: dict, off) -> dict:
    """끈 클래스(XI맵 '층' 판 체크박스)를 뺀 집계 사본 — 업무 줄 k · 읍면동/시군구 칸 · 해마다 줄. 원본(캐시)은 그대로.
    k = 업무 이름(task_of) = 화면 클래스 이름(XI맵 visRows 와 같은 기준)."""
    off = set(off or ())
    if not off or not isinstance(res, dict):
        return res
    out = dict(res)
    if "rows" in res and res.get("by") == "task":
        out["rows"] = [r for r in res["rows"] if r.get("k") not in off]
    if "cols" in res:
        drop = {c["name"] for c in res["cols"] if c.get("k") in off}
        out["cols"] = [c for c in res["cols"] if c.get("k") not in off]
        rows = [{**r, "vals": {k: v for k, v in (r.get("vals") or {}).items() if k not in drop}} for r in res.get("rows", [])]
        out["rows"] = [r for r in rows if r["vals"]] if res.get("by") == "region" else rows
    if "series" in res:
        out["series"] = [x for x in res["series"] if x.get("k") not in off]
    out["off"] = sorted(off)
    return out


async def agg_time(sgg: str | None = None, off=()) -> dict:
    off = tuple(sorted(set(off or ())))
    key = ("time", sgg, off)
    if (c := _cache(key, 30)) is not None:
        return c
    async with db(realm="lx") as conn:
        year = await _nat_year(conn)
        args = [year]
        where = ""
        if sgg:
            where = " AND sgg_cd LIKE ANY (SELECT p || '%' FROM unnest($2::text[]) p)"
            args.append(sorted({_pre(c) for c in _codes(sgg)}))
        span = await conn.fetchrow(f"SELECT min(done_at) a, max(done_at) b FROM national_cells WHERE year=$1 AND NOT test AND state='done'{where}", *args)
        unit = "hour" if span["a"] and (span["b"] - span["a"]) < dt.timedelta(days=4) else "day"
        rows = await conn.fetch(
            f"SELECT date_trunc('{unit}', done_at AT TIME ZONE 'Asia/Seoul') AS t, count(*)::int AS cells, "
            f"coalesce(sum((SELECT sum((v->>'n')::bigint) FROM jsonb_each(counts) e(k, v) WHERE {_nat_cls_sql(off)})), 0)::bigint AS n "
            f"FROM national_cells WHERE year=$1 AND NOT test AND state='done' AND done_at IS NOT NULL{where} GROUP BY 1 ORDER BY 1", *args)
        run = await conn.fetchrow(
            f"SELECT sgg_name, name FROM national_cells WHERE year=$1 AND NOT test AND state='running'{where} ORDER BY started_at DESC NULLS LAST LIMIT 1", *args)
    pts, cc, cn = [], 0, 0
    for r in rows:
        cc += r["cells"]
        cn += int(r["n"])
        pts.append({"t": r["t"].isoformat(timespec="minutes"), "cells": r["cells"], "n": int(r["n"]), "cells_sum": cc, "n_sum": cn})
    return _put(key, {"by": "time", "sgg": sgg, "name": region_name(sgg), "unit": unit, "points": pts,
                      "running": f"{run['sgg_name']} {run['name']}" if run else None, "as_of": now_iso(), "source": "전국 분석 진행 장부(끝난 읍면동 시각)"})


AGG = {"task": lambda s, t: agg_task(s), "emd": lambda s, t: agg_emd(s), "region": lambda s, t: agg_region(), "jimok": lambda s, t: agg_jimok(s),
       "rule": lambda s, t: agg_rule(s), "year": lambda s, t: agg_year(s), "area": lambda s, t: agg_area(s, t), "time": lambda s, t: agg_time(s)}
NEED_SGG = {"emd", "jimok", "rule"}


@router.get("/ximap/agg")
async def agg(request: Request, by: str = "task", sgg: str | None = None, task: str | None = None):
    require(principal(request), lx=True)
    if by not in AGG:
        raise ApiError("bad_request", "by = " + " | ".join(AGG))
    if sgg is not None and not (sgg.isdigit() and len(sgg) == 5):
        raise ApiError("bad_request", "시군구 코드 5자리")
    if by in NEED_SGG and not sgg:
        raise ApiError("bad_request", "시군구가 필요합니다")
    if by == "area" and not task:
        raise ApiError("bad_request", "업무 이름이 필요합니다")
    return await AGG[by](sgg, task)
