# -*- coding: utf-8 -*-
"""imagery.sgg_cd 채우기(소유 시군구) — 등록(S-5) 전부터 있던 영상 행은 sgg_cd 가 비어 있다(lx-train · lx-ingest 요청).

판정 순서(지역 고정값 0 · 전부 /regions 뼈대와 영상 이름·범위에서):
  ① 영상 이름(ko) 낱말 → regions.find() 로 시군구 1곳이 정해지면 그 코드
  ② 영상 id 낱말 → V-World 영문 이름(name_en 'Namwon-si' → 'namwon') 과 같으면 그 코드
  ③ 범위(footprint)와 가장 많이 겹치는 시군구(겹침 비율 기록)
이미 값이 있는 행은 건드리지 않는다(--force 로 다시 계산). 실행: python server/seed/backfill_imagery_sgg.py [--dry] [--force]
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import psycopg
from shapely.geometry import shape

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from landxi_api import config  # noqa: E402
from landxi_api.regions import find, regions_base  # noqa: E402


def decide(row, regions, geoms) -> tuple[str | None, str]:
    name = row["name"] or {}
    ko = name.get("ko") if isinstance(name, dict) else str(name)
    for tok in re.findall(r"[가-힣]{2,}", ko or ""):
        hit = [r for r in find(tok) if r["sgg_cd"] in geoms]
        if len({r["sgg_cd"] for r in hit}) == 1:
            return hit[0]["sgg_cd"], f"이름 '{tok}'"
    en = {}
    for r in regions:
        stem = re.sub(r"[-\s](si|gun|gu)$", "", (r.get("name_en") or "").strip().lower())
        if stem:
            en.setdefault(stem, []).append(r["sgg_cd"])
    for tok in re.split(r"[-_\s]", row["id"].lower()):
        if len(en.get(tok, [])) == 1:
            return en[tok][0], f"id '{tok}'"
    if row["fp"]:
        g = shape(row["fp"])
        best, share = None, 0.0
        for cd, gs in geoms.items():
            if not gs.intersects(g):
                continue
            s = gs.intersection(g).area / max(g.area, 1e-12)
            if s > share:
                best, share = cd, s
        if best:
            return best, f"범위 겹침 {share:.0%}"
    return None, "판정 불가"


def main():
    dry, force = "--dry" in sys.argv, "--force" in sys.argv
    regions, geoms, src = regions_base()
    with psycopg.connect(config.PG_ADMIN_DSN, autocommit=True) as c:
        cur = c.cursor(row_factory=psycopg.rows.dict_row)
        rows = cur.execute("SELECT id, name, sgg_cd, ST_AsGeoJSON(footprint)::json AS fp FROM imagery ORDER BY id").fetchall()
        for r in rows:
            if r["sgg_cd"] and not force:
                continue
            cd, why = decide(r, regions, geoms)
            print(json.dumps({"id": r["id"], "sgg_cd": cd, "why": why}, ensure_ascii=False))
            if cd and not dry:
                c.execute("UPDATE imagery SET sgg_cd=%s WHERE id=%s", (cd, r["id"]))
    print(f"[backfill] 뼈대 = {src}")


if __name__ == "__main__":
    main()
