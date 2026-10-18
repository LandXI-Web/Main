"""켜진 결과 레이어의 집계 범위 · 거르기 조건 — 한 출처(외부 검수 3차 GPT3-3 · GPT3-4 · 원칙 3 · 193).

  지도 서비스 · XI맵에 켜진 결과 레이어(작업)와 지금 걸린 조건(분류 · 면적 · 읍면동)을
  XI ChatGEO 거르기 · 읍면동 통계 · 보고서 · 지도 서비스 '목록 보기' · 조건 칩 풀기가 모두 같은 식으로 센다.

  clean(d)            화면이 보낸 조건(context.filter · 조건 칩) → 검사한 조건 {cls:[..], emd:[..], area_min, area_op_min, area_max, area_op_max}
  sql(cond, args)     조건 → SQL 조각(detections 열 그대로) · args 에 값을 덧붙인다
  chips(cond)         조건 → 칩 [{k:'cls'|'area'|'emd', label}] (화면 조건 줄 · 답 첫 줄이 같은 말)
  label(cond)         칩 글을 ' · ' 로
  layer_names(jobs)   작업 → 사람이 읽는 레이어 이름('남원시 비닐하우스' · '여주시 하거동 프로젝트 ○○') — 목록 줄과 같은 재료
  scope_line(...)     답 첫 줄 '대상: 켜진 층 n개(이름) · 조건: …'
"""
from __future__ import annotations

import json
import re

KEYS = ("cls", "emd", "area_min", "area_op_min", "area_max", "area_op_max")


def _nf(v: float) -> str:
    return f"{int(round(v)):,}" if abs(v - round(v)) < 0.05 else f"{v:,.1f}"


def clean(d) -> dict:
    """화면에서 온 조건 — 모양이 맞는 것만(글 20자 · 12개 · 숫자). 빈 조건 = {}."""
    if not isinstance(d, dict):
        return {}
    out: dict = {}
    for k in ("cls", "emd"):
        v = d.get(k)
        if isinstance(v, str):
            v = [v]
        if isinstance(v, list):
            v = [str(x)[:40] for x in v if isinstance(x, (str, int)) and str(x).strip()][:24]
            if v:
                out[k] = v
    for side, ops in (("min", (">", ">=")), ("max", ("<", "<="))):
        v = d.get(f"area_{side}")
        try:
            v = float(v) if v is not None and v != "" else None
        except (TypeError, ValueError):
            v = None
        if v is not None and 0 <= v < 1e9:
            out[f"area_{side}"] = v
            op = d.get(f"area_op_{side}")
            out[f"area_op_{side}"] = op if op in ops else ops[0]
    return out


def sql(cond: dict, args: list, col: str = "") -> list[str]:
    """조건 → SQL 조각(args 에 값을 덧붙인다 · 자리표 번호는 args 길이로)."""
    p = f"{col}." if col else ""
    out = []
    if cond.get("cls"):
        args.append(list(cond["cls"]))
        out.append(f"{p}cls = ANY(${len(args)}::text[])")
    if cond.get("emd"):
        args.append(list(cond["emd"]))
        out.append(f"coalesce({p}emd, '') = ANY(${len(args)}::text[])")
    if cond.get("area_min") is not None:
        args.append(float(cond["area_min"]))
        out.append(f"{p}area_m2 {'>=' if cond.get('area_op_min') == '>=' else '>'} ${len(args)}")
    if cond.get("area_max") is not None:
        args.append(float(cond["area_max"]))
        out.append(f"{p}area_m2 {'<=' if cond.get('area_op_max') == '<=' else '<'} ${len(args)}")
    return out


def _ko(c: str) -> str:
    from .spaces import class_ko
    return class_ko(c).replace("다동", "연동")


def chips(cond: dict) -> list[dict]:
    out = []
    if cond.get("cls"):
        out.append({"k": "cls", "label": " · ".join(dict.fromkeys(_ko(c) for c in cond["cls"]))})
    area = []
    if cond.get("area_min") is not None:
        area.append(f"{_nf(float(cond['area_min']))}㎡ {'이상' if cond.get('area_op_min') == '>=' else '넘음'}")
    if cond.get("area_max") is not None:
        area.append(f"{_nf(float(cond['area_max']))}㎡ {'이하' if cond.get('area_op_max') == '<=' else '미만'}")
    if area:
        out.append({"k": "area", "label": " · ".join(area)})
    if cond.get("emd"):
        out.append({"k": "emd", "label": " · ".join(cond["emd"])})
    return out


def label(cond: dict) -> str:
    return " · ".join(c["label"] for c in chips(cond))


def drop(cond: dict, keys) -> dict:
    """칩 하나 풀기 — 'area' 는 면적 위 · 아래 둘 다."""
    out = dict(cond)
    for k in keys:
        if k == "area":
            for x in ("area_min", "area_op_min", "area_max", "area_op_max"):
                out.pop(x, None)
        else:
            out.pop(k, None)
    return out


async def latest_only(jobs: list[str]) -> list[str]:
    """같은 서비스 × 같은 지역(프로젝트면 같은 범위)의 분석이 여럿 켜져 있으면 가장 늦게 끝난 것 하나만(10-18 · 숫자 한 출처).
    이전 분석은 시점 비교용이라 통계 · 보고서 · 거르기 숫자에 더하지 않는다. 입력 순서는 지킨다."""
    if len(jobs) < 2:
        return list(jobs)
    from .deps import db
    async with db(realm="lx") as c:
        rows = await c.fetch("SELECT id, card_id, options, finished_at FROM jobs WHERE id = ANY($1::text[])", jobs)
    by = {}
    for r in rows:
        o = r["options"] if isinstance(r["options"], dict) else json.loads(r["options"] or "{}")
        key = (r["card_id"], str(o.get("sgg_cd") or ""), str(o.get("range_name") or "") if o.get("project_infer") else "", str(o.get("project_id") or "") if o.get("project_infer") else "")
        by[r["id"]] = (key, r["finished_at"])
    best: dict = {}
    for j in jobs:
        if j not in by:
            continue
        k, at = by[j]
        if k not in best or (at is not None and (by[best[k]][1] is None or at > by[best[k]][1])):
            best[k] = j
    keep = set(best.values())
    return [j for j in jobs if j not in by or j in keep]


async def layer_names(jobs: list[str]) -> list[dict]:
    """작업 → {job, name, region, sgg} — 지도 서비스 목록 줄과 같은 재료(카드 이름 · 프로젝트 이름 · 지역 이름 · 범위 이름)."""
    if not jobs:
        return []
    from .deps import db
    from .regions import region_of
    async with db(realm="lx") as c:
        rows = await c.fetch("SELECT j.id, j.options, j.finished_at, c.name->>'ko' AS cname, pr.name AS pname FROM jobs j LEFT JOIN cards c ON c.id=j.card_id "
                             "LEFT JOIN projects pr ON pr.id = j.options->>'project_id' WHERE j.id = ANY($1::text[])", jobs)
    by = {r["id"]: r for r in rows}
    out = []
    for j in jobs:
        r = by.get(j)
        if not r:
            continue
        o = r["options"] if isinstance(r["options"], dict) else json.loads(r["options"] or "{}")
        proj = bool(o.get("project_infer"))
        rg = region_of(o.get("sgg_cd")) if o.get("sgg_cd") else None
        reg = " ".join(x for x in ((rg or {}).get("name") or "", (o.get("range_name") or "") if proj else "") if x)
        svc = f"프로젝트 {r['pname']}" if proj and r["pname"] else re.sub(r"\s*분석\s*서비스$", "", r["cname"] or "분석 서비스")
        out.append({"job": j, "name": " ".join(x for x in (reg, svc) if x), "region": reg, "sgg": (rg or {}).get("sgg_cd") or o.get("sgg_cd"), "_at": r["finished_at"]})
    # 같은 이름의 층이 둘 이상 켜져 있으면 분석한 날로 구분한다('남원시 비닐하우스 · 남원시 비닐하우스' 처럼 같은 말이 겹치지 않게)
    cnt: dict[str, int] = {}
    for x in out:
        cnt[x["name"]] = cnt.get(x["name"], 0) + 1
    for x in out:
        at = x.pop("_at", None)
        if cnt[x["name"]] > 1 and at:
            x["name"] = f"{x['name']}({at.month}월 {at.day}일 분석)"
    if len({x["name"] for x in out}) < len(out):           # 날까지 같으면 번호
        total: dict[str, int] = {}
        for x in out:
            total[x["name"]] = total.get(x["name"], 0) + 1
        seen: dict[str, int] = {}
        for x in out:
            n0 = x["name"]
            seen[n0] = seen.get(n0, 0) + 1
            if total[n0] > 1:
                x["name"] = f"{n0} {seen[n0]}"
    return out


def scope_line(names: list[dict], cond: dict | None = None, why: str = "켜진 층") -> str:
    """답 첫 줄 — 대상(레이어 n개 · 이름) · 조건. why = '켜진 층' | '질문의 지역' | '지금 보는 지역'."""
    nm = [x["name"] for x in names]
    shown = " · ".join(nm[:3]) + (f" 외 {len(nm) - 3}개" if len(nm) > 3 else "")
    head = f"대상: {why} {len(nm)}개({shown})" if why == "켜진 층" else f"대상: {shown}({why})"
    lb = label(cond or {})
    return f"{head} · 조건: {lb or '없음'}"
