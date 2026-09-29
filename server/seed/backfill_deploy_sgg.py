"""배포본 sgg_cd 1회 백필(core-flow · 2026-09-29) — 지우지 않고 비어 있는 sgg_cd 만 채운다(멱등).

판정 순서(지역 문자열 고정값 0 · 전부 표·경계에서 계산):
  ① AOI 가 한 시군구 안에 거의 다 들어가면(AOI 면적의 90% 이상) 그 시군구
  ② 스냅샷 결과 세트(sets.yaml aliases 정규화)의 AI 결과 중심이 들어가는 시군구
  ③ 같은 기관·같은 카드의 다른 배포본이 이미 가진 시군구(다음 해 계획 초안 — summary 의 '초안 접기'와 같은 규칙)
  ④ 그 밖(해외 · 광역 전체) = 비워 둔다(region_profile 이 지역) — 보고서에 목록
사용: python server/seed/backfill_deploy_sgg.py [--dry]
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from landxi_api import config  # noqa: E402


def _canonical(set_id: str | None) -> str | None:
    if not set_id:
        return None
    return (config.load_yaml("sets").get("aliases") or {}).get(set_id, set_id)


def plan(conn) -> list[dict]:
    from shapely.geometry import Point, shape
    from landxi_api.regions import regions_base
    regs, geoms, _ = regions_base()
    cur_codes = {r["sgg_cd"] for r in regs}
    rows = conn.execute("SELECT id, tenant_id, card_id, sgg_cd, snapshot_current, ST_AsGeoJSON(aoi)::text FROM deploys ORDER BY id").fetchall()
    out: list[dict] = []
    known: dict[tuple, str] = {(r[1], r[2]): r[3] for r in rows if r[3]}
    for did, tenant, card, sgg, snap, aoi in rows:
        if sgg:
            continue
        how, got = None, None
        g = shape(json.loads(aoi)) if aoi else None
        if g is not None and not g.is_empty:
            a = g.area
            for cd in cur_codes:
                gs = geoms.get(cd)
                if gs is None or not gs.intersects(g):
                    continue
                try:
                    if gs.intersection(g).area >= 0.9 * a:
                        got, how = cd, "AOI ⊂ 시군구"
                        break
                except Exception:
                    continue
        if not got and snap:
            c = conn.execute("SELECT ST_X(ST_Centroid(ST_Extent(geom)::geometry)), ST_Y(ST_Centroid(ST_Extent(geom)::geometry)) "
                             "FROM detections WHERE job_id=%s", (_canonical(snap),)).fetchone()
            if c and c[0] is not None:
                pt = Point(c[0], c[1])
                got = next((cd for cd in cur_codes if geoms.get(cd) is not None and geoms[cd].contains(pt)), None)
                how = "결과 중심" if got else None
        if got:
            known.setdefault((tenant, card), got)
        elif (tenant, card) in known:
            got, how = known[(tenant, card)], "같은 기관·카드 배포본"
        out.append({"id": did, "sgg_cd": got, "how": how or "비움(해외·광역)"})
    return out


def run(dry: bool = False) -> list[dict]:
    import psycopg
    with psycopg.connect(config.PG_ADMIN_DSN) as conn:
        pl = plan(conn)
        if not dry:
            for x in pl:
                if x["sgg_cd"]:
                    conn.execute("UPDATE deploys SET sgg_cd=%s WHERE id=%s AND sgg_cd IS NULL", (x["sgg_cd"], x["id"]))
                    conn.execute("INSERT INTO audit_log(actor, realm, action, subject, before, after) VALUES ('system','system','deploy.backfill_sgg',%s,%s,%s)",
                                 (x["id"], json.dumps({"sgg_cd": None}), json.dumps({"sgg_cd": x["sgg_cd"], "how": x["how"]}, ensure_ascii=False)))
            conn.commit()
    return pl


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args()
    for x in run(a.dry):
        print(f"{x['id']:24s} {x['sgg_cd'] or '-':6s} {x['how']}")
