"""같은 분류 × 같은 곳은 한 번만 센다 — 서비스 결과와 전국 분석이 겹치는 읍면동(10-18 · 숫자 한 출처 · 원칙 3).

  규칙: 한 시군구에서 같은 업무(예: 비닐하우스)의 서비스 결과가 있으면, 그 서비스가 분석한 범위가 절반 이상 덮은 읍면동은
        서비스 결과로 센다(기관과 같은 숫자). 서비스 범위 밖 읍면동만 전국 분석 숫자를 더한다 — 덮인 곳을 버리지 않고, 겹친 곳을 두 번 세지 않는다.
  서비스 범위 = 그 분석의 영상 범위(작업 aoi).
  대상 = 그 업무 한 분류만 내는 서비스 결과(분석 작업 · 결과 분류 하나 — 예: 비닐하우스 서비스 · 여러 분류를 찾았어도 서비스가 그 한 분류만 보이는 결과 포함). 여러 분류를 한 숫자로 내는 결과(경작·휴경 4분류 합)
        · 미리 올린 결과 묶음(분석 범위 기록 없음 · 표본일 수 있음)은 같은 셈이 아니어서 대신 세지 않는다(전국 분석 숫자를 버리지 않음).

  covered()          {(asset, cell_cd): {업무, ..}} + 숨긴 전국 분석 수 — 60초 기억
  hidden_by_sgg()    {(asset, 분류, sgg_cd): (n, km2)} — 서비스 결과로 대신 센 전국 분석 칸의 수(직원 화면 참고 줄 · 합에서 빼기)
화면 · 답에는 표 이름 · 작업 id 를 내지 않는다.
"""
from __future__ import annotations

import json
import time

from .deps import db

TTL = 60.0
MIN_COVER = 0.5          # 읍면동 넓이의 절반 이상을 서비스가 분석했으면 그 읍면동은 서비스 결과로
_C: dict = {"t": 0.0, "v": None}


async def _compute() -> dict:
    from . import xdash as XD
    bd, SID = await XD._board()
    want = []                                             # (sid, 업무, 시군구 앞자리들)
    for r in bd.get("regions", []):
        for x in r.get("items", []):
            k = XD.task_of(x.get("name") or "")
            if not any(k in cs for cs in XD.NCLS.values()):
                continue
            sid = SID.get((x.get("layer") or {}).get("set"))
            if sid:
                want.append((sid, k, sorted({XD._pre(c) for c in XD._codes(r["sgg_cd"])})))
    cov: dict[tuple, set] = {}
    hid: dict[tuple, list] = {}
    if not want:
        return {"cov": cov, "hid": hid}
    async with db(realm="lx") as conn:
        year = await XD._nat_year(conn)
        one = {r["id"] for r in await conn.fetch(
            "SELECT id FROM jobs WHERE id = ANY($1::text[]) AND aoi IS NOT NULL AND (SELECT count(*) FROM jsonb_object_keys(coalesce(counts, '{}'::jsonb))) = 1",
            [w[0] for w in want])}
        # 여러 분류를 찾은 결과라도 서비스가 그 업무 한 분류만 보이면(옛 판으로 되돌린 결과 등 · result_scope.only_cls) 같은 셈
        from .result_scope import only_cls
        only = await only_cls(conn)
        ok_aoi = {r["id"] for r in await conn.fetch("SELECT id FROM jobs WHERE id = ANY($1::text[]) AND aoi IS NOT NULL", [w[0] for w in want])}
        for sid, k, pre in want:
            if sid not in one and not (sid in ok_aoi and only.get(sid) == [k]):
                continue
            assets = [a for a, cs in XD.NCLS.items() if k in cs]
            rows = await conn.fetch(
                "WITH f AS (SELECT aoi AS g FROM jobs WHERE id=$1) "
                "SELECT c.asset, c.cell_cd, c.sgg_cd, c.state, c.counts FROM national_cells c, f "
                "WHERE f.g IS NOT NULL AND c.year=$2 AND NOT c.test AND c.asset = ANY($3::text[]) "
                "AND c.sgg_cd LIKE ANY (SELECT p || '%' FROM unnest($4::text[]) p) AND c.geom_s && f.g "
                "AND ST_Area(ST_Intersection(c.geom_s, f.g)) >= $5 * ST_Area(c.geom_s)", sid, year, assets, pre, MIN_COVER)
            for c in rows:
                key = (c["asset"], c["cell_cd"])
                if k in cov.get(key, set()):
                    continue
                cov.setdefault(key, set()).add(k)
                if c["state"] != "done":
                    continue
                cnt = c["counts"] if isinstance(c["counts"], dict) else json.loads(c["counts"] or "{}")
                v = cnt.get(k) or {}
                h = hid.setdefault((c["asset"], k, c["sgg_cd"]), [0, 0.0])
                h[0] += int(v.get("n") or 0)
                h[1] += float(v.get("km2") or 0)
    return {"cov": cov, "hid": hid}


async def _get() -> dict:
    if _C["v"] is None or time.time() - _C["t"] >= TTL:
        try:
            _C["v"] = await _compute()
        except Exception:  # noqa: BLE001 — 계산을 못 하면 빼지 않는다(예전 셈 그대로 · 다음 판에서 다시)
            _C["v"] = _C["v"] or {"cov": {}, "hid": {}}
        _C["t"] = time.time()
    return _C["v"]


async def covered() -> dict[tuple, set]:
    """{(asset, cell_cd): {업무}} — 그 전국 분석 칸의 그 업무는 서비스 결과가 센다."""
    return (await _get())["cov"]


async def hidden_by_sgg() -> dict[tuple, tuple]:
    """{(asset, 분류, sgg_cd): (n, km2)} — 서비스 결과로 대신 센 전국 분석 칸의 수 · 넓이."""
    return {k: (v[0], v[1]) for k, v in (await _get())["hid"].items()}


async def hidden_sum(asset: str, cls: str, pre: list[str] | None = None) -> tuple[int, float]:
    """한 자산 · 분류에서 뺄 수 · 넓이 — pre = 시군구 앞자리들(없으면 전국)."""
    n, km2 = 0, 0.0
    for (a, c, sgg), (hn, hk) in (await hidden_by_sgg()).items():
        if a == asset and c == cls and (pre is None or any(sgg.startswith(p) for p in pre)):
            n += hn
            km2 += hk
    return n, km2
