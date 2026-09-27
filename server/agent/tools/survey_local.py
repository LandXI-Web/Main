"""실태조사 읽기 — **임시 구현**(F2-S `GET /survey/*` 미도착 시 · 브리프 F2-E §0). 정본 파일 `02. 데이터/survey/`만 읽는다.

- findings: namwon-parcel-suspects.csv(20,872행 · UTF-8 BOM) · 필지 폴리곤: namwon-parcel-survey.gpkg `parcels`(332,084 · pnu → fid 색인 1회)
- stats: namwon-parcel-emd-summary.json(totals · by_emd 39 + 합계 행)
- parcel: gpkg parcels 행 + suspects + namwon-parcel-timeline.json(6,818)
F2-S API 가 뜨면 tools/survey.py 가 HTTP 를 먼저 부르고 이 모듈은 404 때만 쓴다(결과 봉투 source 에 표기).
소유자 성명 열은 없다(연속지적에 없음 · OWNER_NM 미사용).
"""
from __future__ import annotations

import csv
import json
import sqlite3
import struct
import threading
from functools import lru_cache
from pathlib import Path

from .. import config

AS_OF = "2026-09-24"
SRC_CSV = "survey/namwon-parcel-suspects.csv"
SRC_SUM = "survey/namwon-parcel-emd-summary.json"
SRC_GPKG = "survey/namwon-parcel-survey.gpkg"
NOTE_INF = "의심 후보 · AI 추론 · 검수 전 · 위법 판정 아님"
_lock = threading.Lock()


def env(value, unit, source, basis="inferred", note=NOTE_INF, as_of=AS_OF):
    e = {"value": value, "unit": unit, "basis": basis, "as_of": as_of, "source": source}
    if note:
        e["note"] = note
    return e


@lru_cache(maxsize=1)
def suspects() -> list[dict]:
    rows = []
    with open(config.SURVEY_DIR / "namwon-parcel-suspects.csv", encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            for k in ("rank",):
                r[k] = int(r[k])
            for k in ("score", "parcel_m2", "evid_m2", "conf", "lon", "lat"):
                try:
                    r[k] = float(r[k])
                except (TypeError, ValueError):
                    r[k] = None
            r.pop("ai_ids", None)          # 내부 객체 id — 도구 결과에 싣지 않는다(프롬프트 절약)
            rows.append(r)
    return rows


@lru_cache(maxsize=1)
def summary() -> dict:
    return json.loads((config.SURVEY_DIR / "namwon-parcel-emd-summary.json").read_text(encoding="utf-8"))


def emd_names() -> dict[str, str]:
    """읍면동 이름 → 법정동 코드(8자리)."""
    return {k: v.get("emd_cd") for k, v in summary()["by_emd"].items() if v.get("emd_cd")}


def emd_resolve(q: str | None) -> tuple[str | None, str | None]:
    if not q:
        return None, None
    q = str(q).strip()
    names = emd_names()
    if q in names:
        return q, names[q]
    for n, cd in names.items():
        if q == cd or q.startswith(n) or n.startswith(q) or n in q:
            return n, cd
    return None, None


# ── GPKG 필지 폴리곤 ──────────────────────────────────────────────────────
_fid: dict[str, int] | None = None


def _conn():
    return sqlite3.connect(f"file:{config.SURVEY_DIR / 'namwon-parcel-survey.gpkg'}?mode=ro", uri=True, check_same_thread=False)


def warm():
    """pnu → fid 색인(332,084행 · 1회). 기동 뒤 백그라운드로 부른다."""
    global _fid
    with _lock:
        if _fid is None:
            c = _conn()
            _fid = {p: i for i, p in c.execute("SELECT fid, pnu FROM parcels")}
            c.close()
    return len(_fid)


def _wkb(blob: bytes):
    from shapely import wkb
    flags = blob[3]
    env_len = {0: 0, 1: 32, 2: 48, 3: 48, 4: 64}.get((flags >> 1) & 0x07, 0)
    return wkb.loads(bytes(blob[8 + env_len:]))


PARCEL_COLS = ["pnu", "addr", "emd", "emd_cd", "ri", "jibun", "jimok", "jimok_nm", "area_m2", "jiga", "gosi_year", "yongdo", "nongup",
               "a23_bld_m2", "a23_crop_m2", "a23_park_m2", "a23_gh_m2", "a23_bld_n", "a23_bld_in_m2", "a23_bld_conf", "r23_bld", "r23_crop",
               "a25_crop_m2", "a25_uncrop_m2", "a25_gh_m2", "sus_rule", "sus_priority", "sus_score"]


def parcels(pnus: list[str], geom: bool = True) -> dict[str, dict]:
    if _fid is None:
        warm()
    fids = [_fid[p] for p in pnus if p in _fid]
    if not fids:
        return {}
    c = _conn()
    q = f"SELECT geom, {', '.join(PARCEL_COLS)} FROM parcels WHERE fid IN ({','.join('?' * len(fids))})"
    out = {}
    from shapely.geometry import mapping
    for row in c.execute(q, fids):
        d = dict(zip(PARCEL_COLS, row[1:]))
        if geom and row[0]:
            g = _wkb(row[0])
            d["_geom"] = mapping(g)
            d["_bbox"] = list(g.bounds)
        out[d["pnu"]] = d
    c.close()
    return out


@lru_cache(maxsize=1)
def timeline() -> dict[str, dict]:
    j = json.loads((config.SURVEY_DIR / "namwon-parcel-timeline.json").read_text(encoding="utf-8"))
    items = j.get("parcels") if isinstance(j, dict) else j
    return {p["pnu"]: p for p in items or [] if isinstance(p, dict) and p.get("pnu")}


# ── 조회 ─────────────────────────────────────────────────────────────────
JIMOK = {"전": "전", "답": "답", "과": "과수원", "과수원": "과수원", "임야": "임야", "대": "대", "도로": "도로"}


def findings(rule=None, emd=None, priority=None, jimok=None, top=5, sort="score") -> dict:
    """의심 목록(점수 내림차순 · rank 오름차순). total = 조건 일치 전체(봉투)."""
    emd_n, emd_cd = emd_resolve(emd)
    jm = JIMOK.get(str(jimok).strip(), str(jimok).strip()) if jimok else None
    rows = suspects()
    sel = [r for r in rows
           if (not rule or r["rule"] == rule) and (not emd_n or r["emd"] == emd_n)
           and (not priority or r["priority"] == priority) and (not jm or r["jimok"] == jm or (jm == "과수원" and r["jimok"] == "과"))]
    key = {"score": lambda r: (-(r["score"] or 0), r["rank"]), "evid_m2": lambda r: -(r["evid_m2"] or 0)}.get(sort, lambda r: r["rank"])
    sel.sort(key=key)
    top = max(1, min(int(top or 5), 50))
    picked = sel[:top]
    cond = " · ".join(x for x in [rule, emd_n, f"지목 {jm}" if jm else None, f"등급 {priority}" if priority else None] if x) or "전체"
    by_pri = {k: sum(1 for r in sel if r["priority"] == k) for k in "ABC"}
    return {"items": picked, "total": len(sel), "cond": cond, "emd": emd_n, "emd_cd": emd_cd, "jimok": jm,
            "by_priority": by_pri, "source": f"{SRC_CSV}({cond})"}


def stats(by="rule", emd=None, rule=None) -> dict:
    s = summary()
    emd_n, emd_cd = emd_resolve(emd)
    t = s["totals"]
    if emd_n:
        e = s["by_emd"][emd_n]
        return {"scope": emd_n, "emd_cd": emd_cd, "suspects": e["suspects_total"], "suspect_parcels": e["suspect_parcels"],
                "parcels": e["parcels"], "by_rule": e["suspects"], "by_priority": e["priority"], "source": f"{SRC_SUM}#by_emd.{emd_n}"}
    out = {"scope": "남원시 전체", "suspects": t["suspects"], "suspect_parcels": t["suspect_parcels"], "parcels": t["parcels"],
           "by_rule": t["by_rule"], "by_priority": t["by_priority"], "source": f"{SRC_SUM}#totals"}
    if by == "emd":
        out["by_emd"] = [{"emd": k, "emd_cd": v.get("emd_cd"), "n": v["suspects_total"]} for k, v in s["by_emd"].items() if v.get("emd_cd")]
    if rule:
        out["rule_n"] = t["by_rule"].get(rule)
    return out


def rules() -> dict:
    return summary().get("rules") or {}


def parcel(pnu: str) -> dict | None:
    p = parcels([pnu], geom=True).get(pnu)
    if not p:
        return None
    fs = [r for r in suspects() if r["pnu"] == pnu]
    tl = timeline().get(pnu)
    return {"facts": p, "findings": fs, "history": (tl or {}).get("events") or [], "summary": (tl or {}).get("summary")}
