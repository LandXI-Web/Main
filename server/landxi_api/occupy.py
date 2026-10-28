"""점유의심 조사(카드 ③ · 10-28 지시서 v5 · 사용자 회신 REPLY-v5-CARD3) — ① 국토 변화 · ② 이지목 현황 결과를 필지로 겹쳐 점유의심 목록.

계산(GPU) 없음 — 같은 대상지의 ②(뒤 시점) · ①(앞 → 뒤 시점) 결과를 쓴다. 없으면 그 둘을 작업 대기열에 넣는다(끝난 결과가 있으면 다시 돌리지 않음).
판정 단위 = 필지 = ② 결과의 필지(번호 c0001…) — 판정 저장 · 이력은 ② 결과 위에(PATCH /change/runs/{②}/marks/{필지}) · 지도 · 표 · 통계가 같은 값.
목록 규칙은 config/occupy.yaml 한 곳(바꾸면 다음 요청부터 · 재시작 없음).

POST /change/runs {card_id: card-occupy, range_id, src_a, src_b}  → {job_id: ②, occupy: ①, …} (change.start_run 이 이리로)
GET  /change/runs/{②}/occupy?chg=①&und=0|1&type=&cls=&owner=&min_area=&format=json|csv   목록 · 거르기 · 필지 판정 · CSV
GET  /change/occupy/rule                                         규칙(사람 말 · 카드 '자세히')
"""
from __future__ import annotations

import csv
import io
import json

from fastapi import APIRouter, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response

from .deps import ApiError, principal, require
from .envelope import env, now_iso

router = APIRouter()


def rule() -> dict:
    from . import config
    r = config.load_yaml("occupy") or {}
    return {"ijimok": list(r.get("ijimok") or ["점유의심", "지목미정리"]), "change": list(r.get("change") or ["신축", "경작 전환", "포장 확대"]),
            "min_hit_m2": float(r.get("min_hit_m2") or 1), "undetermined": r.get("undetermined") or "미확정_나지초지",
            "priority": list(r.get("priority") or ["신축", "포장 확대", "경작 전환", "소실"]), "words": list(r.get("words") or [])}


async def start_occupy(request, p, d, year_a, year_b, src_a, src_b, via):
    from .change import range_out, start_run
    sb = src_b or {"kind": "ngii", "year": year_b}
    sa = src_a or {"kind": "ngii", "year": year_a}
    ij = await start_run(request, p, d["id"], 0, int(sb.get("year") or year_b or 0), via=via, src_a=sb, src_b=sb, card_id="card-ijimok")
    ch = await start_run(request, p, d["id"], int(sa.get("year") or year_a or 0), int(sb.get("year") or year_b or 0), via=via, src_a=sa, src_b=sb, card_id="card-change")
    return {"job_id": ij["job_id"], "occupy": ch["job_id"], "cached": bool(ij.get("cached") and ch.get("cached")),
            "state": "done" if ij.get("state") == ch.get("state") == "done" else "queued", "range": range_out(d)}


def _rows(ijfc: dict, chfc: dict | None, marks: dict, R: dict, und: bool) -> list[dict]:
    import geopandas as gpd
    ij = gpd.GeoDataFrame.from_features(ijfc.get("features") or [], crs=4326)
    if not len(ij):
        return []
    ij["fid"] = [f["id"] for f in ijfc["features"]]
    ij = ij.to_crs(5179)
    hits: dict[int, dict] = {}
    if chfc and chfc.get("features"):
        ch = gpd.GeoDataFrame.from_features(chfc["features"], crs=4326).to_crs(5179)
        ch = ch[(~ch.get("hidden", False).fillna(False).astype(bool)) & ch["type"].isin(R["priority"])].reset_index(drop=True)
        if len(ch):
            pairs = gpd.sjoin(ij[["geometry"]].reset_index(), ch[["type", "geometry"]], predicate="intersects", how="inner")
            for row in pairs.itertuples():
                a = ij.geometry.iloc[row.index].intersection(ch.geometry.iloc[row.index_right]).area
                if a >= R["min_hit_m2"]:
                    h = hits.setdefault(int(row.index), {})
                    h[row.type] = h.get(row.type, 0) + 1
    pick = set(R["ijimok"]) | ({R["undetermined"]} if und else set())
    out = []
    for i, pr in enumerate(ijfc["features"]):
        p = pr["properties"]
        hs = hits.get(i, {})
        top = next((t for t in R["priority"] if t in hs and t in R["change"]), None)
        if not (p.get("type") in pick or top):
            continue
        out.append({"id": pr["id"], "jibun": p.get("jibun"), "pnu": p.get("pnu"), "jimok": p.get("jimok"), "owner": p.get("owner"),
                    "chg_type": top or "변화 없음", "chg_n": sum(v for t, v in hs.items() if t in R["change"]),
                    "ijimok": p.get("type"), "layer": p.get("layer"), "cover": p.get("cover"), "area_m2": p.get("area_m2"),
                    "status": (marks.get(pr["id"]) or {}).get("status") or "미확인", "lng": p.get("lng"), "lat": p.get("lat")})
    out.sort(key=lambda r: (0 if r["ijimok"] == "점유의심" else 1, 0 if r["chg_type"] != "변화 없음" else 1, -(r["area_m2"] or 0)))
    return out


def _split(v):
    import re
    return [x.strip() for x in re.split(r"[,·|]", v) if x.strip()] if v else None


@router.get("/change/occupy/rule")
async def get_rule(request: Request):
    require(principal(request))
    r = rule()
    return {"words": r["words"], "ijimok": r["ijimok"], "change": r["change"], "undetermined": r["undetermined"], "as_of": now_iso()}


@router.get("/change/runs/{job_id}/occupy")
async def occupy_rows(job_id: str, request: Request, chg: str | None = None, und: int = 0, type: str | None = None, cls: str | None = None,
                      owner: str | None = None, min_area: float = 0, format: str = "json"):
    from .change import _features, marks_of, run_row
    p = require(principal(request))
    d = await run_row(p, job_id)
    if d["state"] != "done":
        raise ApiError("not_ready", "이지목 현황 분석이 아직 끝나지 않았습니다", status=409)
    chfc, chg_state = None, None
    if chg:
        c = await run_row(p, chg)
        if c["range_id"] != d["range_id"]:
            raise ApiError("bad_request", "같은 대상지의 국토 변화 결과가 아닙니다")
        chg_state = c["state"]
        if c["state"] == "done":
            chfc = await run_in_threadpool(_features, chg)
    R = rule()
    ijfc = await run_in_threadpool(_features, job_id)
    rows = await run_in_threadpool(_rows, ijfc, chfc, await marks_of(p, job_id), R, bool(und))
    # 소유구분 — 목록에 오른 필지만 브이월드 토지소유정보(분류만 · 캐시 · 10-28 PM 회신 3: 조회는 카드 ③에서만)
    pn = [r["pnu"] for r in rows if r.get("pnu")]
    if pn:
        def _own():
            from change import owner as OW
            return OW.fill(pn)
        try:
            got = await run_in_threadpool(_own)
            for r in rows:
                if r.get("pnu") in got:
                    r["owner"] = got[r["pnu"]]
        except Exception:  # noqa: BLE001
            pass
    allrows = rows
    ft, fc_, fo = _split(type), _split(cls), _split(owner)
    rows = [r for r in rows if (not ft or r["chg_type"] in ft) and (not fc_ or r["ijimok"] in fc_) and (not fo or any(o in (r["owner"] or "") for o in fo))
            and (r["area_m2"] or 0) >= (min_area or 0)]
    if format == "csv":
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(["지번", "PNU", "지목", "소유구분", "변화유형", "변화 건수", "이지목 판정", "면적(㎡)", "판정상태"])
        for r in rows:
            w.writerow([r["jibun"], r["pnu"], r["jimok"], r["owner"], r["chg_type"], r["chg_n"], r["ijimok"], r["area_m2"], r["status"]])
        from urllib.parse import quote
        name = f"점유의심조사_{d['range_name']}_{d['year_b']}.csv"
        return Response("﻿" + buf.getvalue(), media_type="text/csv; charset=utf-8", headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(name)}"})
    src = "이지목 현황 × 국토 변화(필지 교차 · config/occupy.yaml 규칙)"
    by_st = {}
    for r in rows:
        by_st[r["status"]] = by_st.get(r["status"], 0) + 1
    return {"job_id": job_id, "chg": chg, "chg_state": chg_state, "n": env(len(rows), "필지", "inferred", src), "n_all": env(len(allrows), "필지", "inferred", src),
            "area": env(round(sum(r["area_m2"] or 0 for r in rows), 1), "m2", "inferred", src),
            "by_status": {k: env(v, "필지", "recorded", "판정 기록") for k, v in by_st.items()},
            "filters": {"type": sorted({r["chg_type"] for r in allrows}), "cls": sorted({r["ijimok"] for r in allrows}), "owner": sorted({r["owner"] or "대장 미연결" for r in allrows})},
            "rule": R["words"], "items_raw": rows, "as_of": now_iso()}
