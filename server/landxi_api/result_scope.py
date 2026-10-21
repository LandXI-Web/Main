"""켜진 결과 레이어의 집계 범위 · 거르기 조건 — 한 출처(외부 검수 3차 GPT3-3 · GPT3-4 · 원칙 3 · 193).

  지도 서비스 · XI맵에 켜진 결과 레이어(작업)와 지금 걸린 조건(분류 · 면적 · 읍면동)을
  XI ChatGEO 거르기 · 읍면동 통계 · 보고서 · 지도 서비스 '목록 보기' · 조건 칩 풀기가 모두 같은 식으로 센다.

  clean(d)            화면이 보낸 조건(context.filter · 조건 칩) → 검사한 조건 {cls:[..], emd:[..], area_min, area_op_min, area_max, area_op_max}
  sql(cond, args)     조건 → SQL 조각(detections 열 그대로) · args 에 값을 덧붙인다
  chips(cond)         조건 → 칩 [{k:'cls'|'area'|'emd', label}] (화면 조건 줄 · 답 첫 줄이 같은 말)
  label(cond)         칩 글을 ' · ' 로
  layer_names(jobs)   작업 → 사람이 읽는 레이어 이름('남원시 비닐하우스' · '여주시 하거동 프로젝트 ○○') — 목록 줄과 같은 재료
  scope_line(...)     답 첫 줄 '대상: 켜진 층 n개(이름) · 조건: …'
  only_cls()          {작업: [분류]} — 서비스가 보이는 분류보다 많은 분류를 가진 결과(옛 판으로 되돌린 결과 등) · only_sql 이 그 분류만 남긴다
"""
from __future__ import annotations

import json
import re
import time

KEYS = ("cls", "emd", "area_min", "area_op_min", "area_max", "area_op_max")

# 분류 낱말 한 표(CHATGEO-DEV-ORDER WP-5) — (말 정규식, 분류 이름, 위 분류). XI ChatGEO 의 거르기(mapsvc) · 통계(dash) · 범위 검사기(agent/scopecheck)가
# 같은 표를 읽는다. 논 · 밭 · 과수원은 경작지의 아래 분류(결과에 따로 없으면 '경작지 안에서 나누지 않습니다'). 위에서 아래로 먼저 맞는 것.
CLASS_WORDS: list[tuple[str, str, str | None]] = [
    (r"비닐\s*하우스|온실|하우스", "비닐하우스", None),
    (r"건물|건축물", "건물", None),
    (r"경작지|농경지|논밭|경작(?![·ㆍ]?\s*휴경)", "경작지", None),
    (r"휴경지|휴경|농사\s*(?:안|않|못)\s*(?:짓|지은|하는)", "휴경지", None),
    (r"(?<![가-힣])논(?=[이을은의에만과와도로]|\s|,|\?|$)", "논", "경작지"),
    (r"(?<![가-힣])밭(?=[이을은의에만과와도]|\s|,|\?|$)", "밭", "경작지"),
    (r"과수원", "과수원", "경작지"),
    (r"주차장", "주차장", None),
    (r"축사", "축사", None),
    (r"창고", "창고", None),
    (r"농막", "농막", None),
    (r"태양광", "태양광", None),
    (r"나대지", "나대지", None),
    (r"곤포|사일리지", "곤포사일리지", None),
    (r"토지\s*피복", "토지피복", None),
    (r"해양\s*쓰레기|해안\s*쓰레기|바다\s*쓰레기", "해양쓰레기", None),
    (r"차량|자동차", "차량", None),
    (r"스티로폼", "스티로폼", None),
]


def class_names(text: str) -> list[str]:
    """글 안 분류 이름(한 표 · 나온 순)."""
    out = []
    for rx, name, _p in CLASS_WORDS:
        if re.search(rx, text or "") and name not in out:
            out.append(name)
    return out


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


_CLIP: dict[str, list[str]] = {}          # 옛 분석 → 그보다 늦은 같은 서비스 × 지역 분석(옛 분석은 늦은 분석이 덮지 않은 곳만 센다)


async def latest_only(jobs: list[str]) -> list[str]:
    """같은 서비스 × 같은 지역(프로젝트면 같은 범위)의 분석이 여럿 켜져 있으면 곳마다 하나로 센다 — 서비스로 내보내는 '지금' 결과가 먼저,
    그다음 가장 늦게 끝난 분석(10-18 · 숫자 한 출처 · 10-21 되돌림).
    늦은 분석이 옛 분석의 범위를 다 덮으면 옛 분석은 빠진다(시점 비교용 — 통계 · 보고서 · 거르기 숫자에 더하지 않음).
    늦은 분석이 일부만 다시 했으면 옛 분석은 남고, 늦은 분석이 덮은 곳의 옛 객체만 뺀다(clip_sql) — 덮인 곳을 조용히 버리지 않는다.
    끝나지 않은 · 빈 분석은 여기 오지 않는다(_jobs_on 이 끝난 작업만). 입력 순서는 지킨다."""
    await only_cls()                                   # clip_sql 이 서비스 분류만 남길 결과(1분 기억)
    if len(jobs) < 2:
        return list(jobs)
    from .deps import db
    async with db(realm="lx") as c:
        rows = await c.fetch("SELECT id, card_id, options, finished_at FROM jobs WHERE id = ANY($1::text[])", jobs)
        # 서비스 결과 장부의 '지금' 결과(기관에 공유된 판 · 되돌림 반영)가 먼저 — 그다음 늦게 끝난 분석(10-21 비닐하우스 1.0 되돌림)
        cur = {r["set_id"] for r in await c.fetch("SELECT set_id FROM service_results WHERE set_id = ANY($1::text[]) AND replaced_at IS NULL", jobs)}
        by = {}
        for r in rows:
            o = r["options"] if isinstance(r["options"], dict) else json.loads(r["options"] or "{}")
            key = (r["card_id"], str(o.get("sgg_cd") or ""), str(o.get("range_name") or "") if o.get("project_infer") else "", str(o.get("project_id") or "") if o.get("project_infer") else "")
            by[r["id"]] = (key, r["finished_at"])
        groups: dict = {}
        for j in jobs:
            if j in by:
                groups.setdefault(by[j][0], []).append(j)
        drop: set = set()
        for g in groups.values():
            if len(g) < 2:
                continue
            g = sorted(g, key=lambda j: (j in cur, by[j][1].timestamp() if by[j][1] else 0), reverse=True)
            for i, old in enumerate(g[1:], 1):
                newer = g[:i]
                # 옛 분석 범위 가운데 늦은 분석들이 덮지 않은 넓이 비율(작업 범위 = 영상 범위)
                left = await c.fetchval(
                    "SELECT CASE WHEN ST_Area(o.aoi) > 0 THEN ST_Area(ST_Difference(o.aoi, (SELECT ST_Union(n.aoi) FROM jobs n WHERE n.id = ANY($2::text[])))) / ST_Area(o.aoi) END "
                    "FROM jobs o WHERE o.id = $1 AND o.aoi IS NOT NULL", old, newer)
                if left is None or float(left) < 0.02:
                    drop.add(old)
                    _CLIP.pop(old, None)
                else:
                    _CLIP[old] = [n for n in newer if n not in drop]
    return [j for j in jobs if j not in drop]


_ONLY: dict = {"t": 0.0, "v": {}}
_ONLY_TTL = 60.0


async def only_cls(conn=None) -> dict[str, list[str]]:
    """{작업 id: [보이는 분류]} — 기관에 공유된 서비스(배포본)가 지금 내보내는 결과가 그 서비스가 보이는 분류(배포본 흐름의 모델 분류)보다
    많은 분류를 가진 경우만(예: 서비스를 옛 판 결과로 되돌림 — 옛 판은 건물 · 경작지 등도 함께 찾았다 · 10-21 사용자 "되돌리자 그럼").
    그 결과는 서비스 분류만 센다 · 그린다 · 답한다(다른 분류 객체는 지우지 않고 보관). 분석할 때 이미 분류를 고른 결과 · 분류가 같은 결과는 그대로.
    어느 서비스 · 어느 지역이든 같은 규칙(배포 기록이 정본 · 지역 · 서비스 id 를 코드에 두지 않음). 60초 기억."""
    if time.time() - _ONLY["t"] < _ONLY_TTL:
        return _ONLY["v"]
    from .deps import db
    from .summary import canonical

    async def run(c):
        out: dict[str, list[str]] = {}
        rows = await c.fetch("SELECT snapshot_current, flow->'model'->'classes' AS cls FROM deploys WHERE stage <> 'draft' AND NOT coalesce(test, false) "
                             "AND snapshot_current IS NOT NULL AND jsonb_typeof(flow->'model'->'classes') = 'array' "
                             "AND jsonb_array_length(flow->'model'->'classes') > 0")
        for r in rows:
            jid = canonical(r["snapshot_current"])
            want = r["cls"] if isinstance(r["cls"], list) else json.loads(r["cls"] or "[]")
            want = [str(x) for x in want if x]
            if not jid or not jid.startswith("job_") or not want:
                continue
            oc = await c.fetchval("SELECT options->'classes' FROM jobs WHERE id=$1", jid)
            if oc and (oc if isinstance(oc, list) else json.loads(oc)):
                continue                                   # 분석할 때 이미 서비스 분류만 찾음
            have = {x["cls"] for x in await c.fetch("SELECT DISTINCT cls FROM detections WHERE job_id=$1 AND cls IS NOT NULL", jid)}
            if have & set(want) and have - set(want):
                out[jid] = sorted(set(out.get(jid, [])) | (have & set(want)))
        return out
    try:
        if conn is None:
            async with db(realm="lx") as c:
                v = await run(c)
        else:
            v = await run(conn)
        _ONLY.update(t=time.time(), v=v)
    except Exception:  # noqa: BLE001 — 못 읽으면 직전 값(처음이면 거르지 않음)
        _ONLY.update(t=time.time())
    return _ONLY["v"]


def only_sql(jobs, args: list, col: str = "") -> list[str]:
    """only_cls 가 정한 결과는 서비스 분류 객체만 — SQL 조각(detections 열 그대로 · 먼저 only_cls() 를 한 번 불러 둔다)."""
    p = f"{col}." if col else ""
    out = []
    for j in ([jobs] if isinstance(jobs, str) else list(jobs or [])):
        keep = _ONLY["v"].get(j)
        if not keep:
            continue
        args.append(j)
        a = len(args)
        args.append(list(keep))
        out.append(f"NOT ({p}job_id = ${a} AND coalesce({p}cls, '') <> ALL(${a + 1}::text[]))")
    return out


def clip_sql(jobs, args: list, col: str = "") -> list[str]:
    """latest_only 가 남긴 옛 분석(늦은 분석이 일부만 다시 한 경우)의 객체 중 늦은 분석 범위 안의 것을 빼는 SQL 조각 — 겹친 곳 한 번.
    + 서비스 분류만 보이는 결과(only_sql)도 같은 조각에 — 거르기 · 통계 · 보고서가 같은 수."""
    p = f"{col}." if col else ""
    out = only_sql(jobs, args, col)
    for old in ([jobs] if isinstance(jobs, str) else list(jobs or [])):
        nw = _CLIP.get(old)
        if not nw:
            continue
        args.append(old)
        a = len(args)
        args.append(list(nw))
        out.append(f"NOT ({p}job_id = ${a} AND EXISTS (SELECT 1 FROM jobs nj WHERE nj.id = ANY(${a + 1}::text[]) AND ST_Intersects(nj.aoi, ST_PointOnSurface({p}geom))))")
    return out


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
    return f"{head} · 조건: {lb}" if lb else head     # 조건이 없으면 조건 줄을 달지 않는다
