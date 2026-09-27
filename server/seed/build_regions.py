# -*- coding: utf-8 -*-
"""S-3 · S-4 시드 빌드 — 전국 시군구 252(행정경계 SGG_korea) + 하천구역 건물 점유 집계(_처리결과.csv).

실행(conda gcs · GPU 0 · 네트워크 0):
  C:/Users/User/anaconda3/envs/gcs/python.exe server/seed/build_regions.py

산출(server/seed/):
  regions-sgg.json          [{sgg_cd, sido, sido_short, name, full, parent_cd, bbox, center}] 252 — GET /regions 의 뼈대
  sgg-simplified.geojson    같은 252 경계(단순화 0.01° · 좌표 4자리) — /public/stats?geom=1 · /regions/{sgg}?geom=1
  public-river-occupy.json  {as_of, source, total, items:[{sgg_cd, value}]} — GET /public/stats?set=river-occupy
V-World LT_C_ADSIGG_INFO 가 열리면 regions.py 가 90일 캐시로 이름·경계를 덮어쓴다(이 파일은 오프라인 바탕).
"""
from __future__ import annotations

import csv
import datetime as dt
import json
import os
from pathlib import Path

import pyogrio

HERE = Path(__file__).resolve().parent
SHP = Path("E:/행안부/SGG_korea/SGG_korea.shp")
RIVER_CSV = Path("E:/행안부/03. 분석결과_v2/_처리결과.csv")
SHORT = {"강원특별자치도": "강원", "경기도": "경기", "경상남도": "경남", "경상북도": "경북", "광주광역시": "광주", "대구광역시": "대구",
         "대전광역시": "대전", "부산광역시": "부산", "서울특별시": "서울", "세종특별자치시": "세종", "울산광역시": "울산", "인천광역시": "인천",
         "전라남도": "전남", "전북특별자치도": "전북", "제주특별자치도": "제주", "충청남도": "충남", "충청북도": "충북"}


def rnd(c, n=4):
    if isinstance(c[0], (int, float)):
        return [round(c[0], n), round(c[1], n)]
    return [rnd(x, n) for x in c]


def main():
    df = pyogrio.read_dataframe(SHP)
    regions, feats = [], []
    for _, r in df.sort_values("ADM_SECT_C").iterrows():
        full = str(r.SGG_NM).strip()
        parts = full.split(" ", 1)
        sido = parts[0]
        name = parts[1] if len(parts) > 1 else parts[0]
        g = r.geometry
        minx, miny, maxx, maxy = g.bounds
        c = g.representative_point()
        rec = {"sgg_cd": str(r.ADM_SECT_C), "sido": sido, "sido_short": SHORT.get(sido, sido), "name": name, "full": full,
               "parent_cd": str(r.COL_ADM_SE) if str(r.COL_ADM_SE) != str(r.ADM_SECT_C) else None,
               "bbox": [round(minx, 4), round(miny, 4), round(maxx, 4), round(maxy, 4)], "center": [round(c.x, 4), round(c.y, 4)]}
        regions.append(rec)
        s = g.simplify(0.01, preserve_topology=True)
        if not s.is_valid:                       # 섬 많은 시군구는 단순화로 꼬인다 → 유효 도형으로(게이트웨이 기동 3.8 s 절약)
            from shapely.validation import make_valid
            s = make_valid(s)
            if s.geom_type == "GeometryCollection":
                from shapely.geometry import MultiPolygon
                s = MultiPolygon([p for x in s.geoms if x.geom_type in ("Polygon", "MultiPolygon")
                                  for p in (x.geoms if x.geom_type == "MultiPolygon" else [x])])
        gj = json.loads(json.dumps(s.__geo_interface__))
        gj["coordinates"] = rnd(gj["coordinates"], 4)
        feats.append({"type": "Feature", "properties": {"sgg_cd": rec["sgg_cd"], "name": name, "sido": rec["sido_short"]}, "geometry": gj})
    (HERE / "regions-sgg.json").write_text(json.dumps({"source": "행정경계 시군구(SGG_korea · 252)", "n": len(regions), "items": regions},
                                                      ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (HERE / "sgg-simplified.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": feats}, ensure_ascii=False,
                                                            separators=(",", ":")), encoding="utf-8")

    # 하천구역 건물 점유 — CSV '시도약칭_시군구[_구]' → sgg_cd
    key = {}
    for rec in regions:
        key[(rec["sido_short"], rec["name"].replace(" ", ""))] = rec["sgg_cd"]
    sido_only = {}
    for rec in regions:
        sido_only.setdefault(rec["sido_short"], []).append(rec["sgg_cd"])
    rows = list(csv.DictReader(open(RIVER_CSV, encoding="utf-8-sig")))
    items, miss = {}, []
    for row in rows:
        sd, *nm = row["시군구"].split("_")
        cd = key.get((sd, "".join(nm)))
        if not cd and len(sido_only.get(sd, [])) == 1:        # 세종(시군구 = 시도 하나)
            cd = sido_only[sd][0]
        if not cd:
            miss.append(row["시군구"])
            continue
        items[cd] = items.get(cd, 0) + int(row["건물수"])
    as_of = dt.datetime.fromtimestamp(os.path.getmtime(RIVER_CSV)).date().isoformat()
    total = sum(int(r["건물수"]) for r in rows)
    out = {"set": "river-occupy", "as_of": as_of, "source": "전국 하천구역 건물 점유 분석", "total": total, "n_rows": len(rows),
           "unmatched": miss, "items": [{"sgg_cd": k, "value": v} for k, v in sorted(items.items())]}
    (HERE / "public-river-occupy.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("regions", len(regions), "river rows", len(rows), "total", total, "mapped", sum(items.values()), "unmatched", miss)
    build_public_tiles(feats, items)


def build_public_tiles(feats, values):
    """공개 타일 폴더(S-4) — 02. 데이터/tiles/public/river-occupy.pmtiles + xyz MVT(river-occupy/{z}/{x}/{y}.pbf). 시군구 집계만(건물 위치 0)."""
    import shutil
    import subprocess
    data = Path(os.environ.get("LX_DATA_ROOT", "E:/Land-XI 플랫폼/02. 데이터"))
    out = data / "tiles" / "public"
    out.mkdir(parents=True, exist_ok=True)
    fc = {"type": "FeatureCollection", "features": [{**f, "properties": {**f["properties"], "value": values.get(f["properties"]["sgg_cd"], 0)}} for f in feats]}
    src = out / "_river-occupy.geojson"
    src.write_text(json.dumps(fc, ensure_ascii=False), encoding="utf-8")
    ogr = str(Path(os.environ.get("GDAL_BIN", "C:/Users/User/anaconda3/envs/gcs/Library/bin")) / "ogr2ogr.exe")
    pm = out / "river-occupy.pmtiles"
    if pm.exists():
        pm.unlink()
    subprocess.run([ogr, "-f", "PMTiles", str(pm), str(src), "-nln", "river_occupy", "-dsco", "MINZOOM=4", "-dsco", "MAXZOOM=10"], check=True)
    xyz = out / "river-occupy"
    if xyz.exists():
        shutil.rmtree(xyz)
    subprocess.run([ogr, "-f", "MVT", str(xyz), str(src), "-nln", "river_occupy", "-dsco", "MINZOOM=4", "-dsco", "MAXZOOM=9",
                    "-dsco", "COMPRESS=NO", "-dsco", "TILE_EXTENSION=pbf"], check=True)
    src.unlink()
    print("public tiles", pm, pm.stat().st_size, "xyz", sum(1 for _ in xyz.rglob("*.pbf")))


if __name__ == "__main__":
    main()
