"""P8 — 남원 필지(국토정보기본도 2.0 · 2021-12) → 4326 벡터 PMTiles `parcels/namwon-parcels.pmtiles`.

원천(읽기만): D:/SSD1/Mobility Convergence/01_LX국토정보기본도및기본공간정보/1. 국토정보기본도2.0_202112/전라북도/남원시/45190.shp
  EPSG:5186 · 328,966 필지 [실측 ogrinfo] · 속성 35 중 필지 카드에 필요한 것만 싣는다(소유자 개인정보 없음 — OWNER_NM 은 '개인/국유' 구분뿐).
산출: layer `parcels` · promote_id pnu · z12–17 (F1-CONTRACT §4.2 sets.yaml `reference/parcels-namwon`)
V-World Data API(연속지적) 권한이 반영되기 전의 '대체 소스'다 — 기준 2021-12 를 카드에 반드시 표기한다.
"""
from __future__ import annotations

import json
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from landxi_api import config  # noqa: E402
from pipelines._common import log, manifest_add  # noqa: E402

SRC = Path(r"D:/SSD1/Mobility Convergence/01_LX국토정보기본도및기본공간정보/1. 국토정보기본도2.0_202112/전라북도/남원시/45190.shp")
OUT = config.DATA_ROOT / "parcels" / "namwon-parcels.pmtiles"
FIELDS = "PNU,EMD_CD,EMD_NM,RI_NM,JIBUN,JIMOK,PAREA,OWNER_NM,JIGA_ILP,JIGA_STD_Y,RN_NM"


def main():
    if not SRC.exists():
        log("P8 원천 없음:", SRC)
        sys.exit(2)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    tmp = OUT.with_suffix(".tmp.pmtiles")
    if tmp.exists():
        tmp.unlink()
    sql = (f"SELECT PNU AS pnu, EMD_CD AS emd_cd, EMD_NM AS emd, RI_NM AS ri, JIBUN AS jibun, JIMOK AS jimok, "
           f"PAREA AS area_m2, OWNER_NM AS owner_kind, JIGA_ILP AS price_krw_m2, JIGA_STD_Y AS price_year, RN_NM AS road FROM \"45190\"")
    cmd = [config.gdal_exe("ogr2ogr"), "-f", "PMTiles", str(tmp), str(SRC), "-dialect", "OGRSQL", "-sql", sql,
           "-s_srs", "EPSG:5186", "-t_srs", "EPSG:4326", "-nln", "parcels",
           "-dsco", "MINZOOM=12", "-dsco", "MAXZOOM=17", "-dsco", "NAME=namwon-parcels",
           "-dsco", "DESCRIPTION=국토정보기본도 2.0 남원 필지(2021-12) · Land-XI P8",
           "-lco", "MINZOOM=12", "-lco", "MAXZOOM=17",
           "--config", "OGR_MVT_MAX_SIZE", "1000000"]
    t0 = time.time()
    log("P8 ogr2ogr 시작", " ".join(cmd[:6]))
    r = subprocess.run(cmd, env=config.gdal_env(), capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0:
        log("P8 실패", r.stderr[-2000:])
        sys.exit(1)
    tmp.replace(OUT)
    dt = time.time() - t0
    info = subprocess.run([config.gdal_exe("ogrinfo"), "-so", "-al", str(OUT)], env=config.gdal_env(), capture_output=True,
                          text=True, encoding="utf-8", errors="replace").stdout
    log(f"P8 완료 {OUT} {OUT.stat().st_size/1e6:.1f}MB {dt:.0f}s")
    n = 328966
    manifest_add({
        "id": "namwon-parcels.pmtiles", "step": "P8", "kind": "vector-pmtiles", "assets": ["C04"],
        "path": "parcels/namwon-parcels.pmtiles", "src": str(SRC).replace("\\", "/"), "crs": "EPSG:4326 (MVT 3857)",
        "minzoom": 12, "maxzoom": 17, "layer": "parcels", "promote_id": "pnu", "count": n, "count_unit": "필지(src)",
        "bytes": OUT.stat().st_size, "as_of": "2021-12",
        "provenance": "실측(국토정보기본도 2.0 2021-12 · 속성 11/35 · 기준시점 2021-12 표기 필수)",
        "cmd": "python server/pipelines/p8_parcels.py", "elapsed_s": round(dt, 1)})
    (config.DATA_ROOT / "parcels" / "namwon-parcels.meta.json").write_text(json.dumps({
        "source": str(SRC).replace("\\", "/"), "features_src": n, "as_of": "2021-12", "fields": FIELDS.split(","),
        "built_at": time.strftime("%Y-%m-%dT%H:%M:%S+09:00"), "elapsed_s": round(dt, 1), "ogrinfo_head": info[:1200]},
        ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
