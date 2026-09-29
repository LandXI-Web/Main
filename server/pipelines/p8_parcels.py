"""P8 — 시군구 필지(전국) 적재 · 벡터 PMTiles(선택). 지역은 인자(core-survey · 하드코딩 없음).

    python server/pipelines/p8_parcels.py --sgg 12130                 # 필지 적재 + AI 결합 + 규칙(= POST /survey/build 와 같은 일)
    python server/pipelines/p8_parcels.py --sgg 12130 --parcels-only  # 필지만(AI 결과 없어도)
    python server/pipelines/p8_parcels.py --sgg 12130 --pmtiles        # + parcels/{sgg}-parcels.pmtiles(z12–17 · layer parcels · promote_id pnu)

원천: 로컬 연속지적 전국(LSMD_CONT_LDREG_{시도} · 2022-02 · EPSG:5174) → 없으면 V-World LP_PA_CBND_BUBUN(server/survey/nation.py).
화면 운영 경로는 POST /api/v1/survey/build(게이트웨이 대기열 · CPU) — 이 스크립트는 같은 함수를 직접 부르는 운영자 도구다.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from landxi_api import config  # noqa: E402
from pipelines._common import log  # noqa: E402


def pmtiles(sgg: str) -> Path:
    out = config.DATA_ROOT / "parcels" / f"{sgg}-parcels.pmtiles"
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_suffix(".tmp.pmtiles")
    if tmp.exists():
        tmp.unlink()
    dsn = config.PG_WORKER_DSN.replace("postgresql://", "")
    user_pw, rest = dsn.split("@", 1)
    user, pw = user_pw.split(":", 1)
    hostport, dbname = rest.split("/", 1)
    host, port = hostport.split(":")
    pg = f"PG:host={host} port={port} dbname={dbname} user={user} password={pw}"
    sql = (f"SELECT pnu, jibun, jimok, jimok_nm, emd, emd_cd, ri, round(area_m2::numeric, 1) AS area_m2, src_as_of AS as_of, geom "
           f"FROM survey_parcels WHERE sgg_cd = '{sgg}'")
    cmd = [config.gdal_exe("ogr2ogr"), "-f", "PMTiles", str(tmp), pg, "-sql", sql, "-nln", "parcels", "-t_srs", "EPSG:4326",
           "-dsco", "MINZOOM=12", "-dsco", "MAXZOOM=17", "-dsco", f"NAME={sgg}-parcels", "-lco", "MINZOOM=12", "-lco", "MAXZOOM=17",
           "--config", "OGR_MVT_MAX_SIZE", "1000000"]
    r = subprocess.run(cmd, env=config.gdal_env(), capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0:
        raise SystemExit(f"P8 PMTiles 실패: {r.stderr[-800:]}")
    tmp.replace(out)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sgg", required=True, help="시군구 코드 5자리(지금/옛 코드 모두)")
    ap.add_argument("--job", default=None, help="AI 작업 id(생략 = 그 시군구 최근 완료 작업)")
    ap.add_argument("--parcels-only", action="store_true")
    ap.add_argument("--pmtiles", action="store_true")
    ap.add_argument("--force", action="store_true", help="필지를 다시 읽는다(정본 적재 행은 그대로)")
    a = ap.parse_args()
    from survey import nation as N
    from survey.db import lx_tx, pg
    rg = N.region(a.sgg)
    t0 = time.time()
    if a.parcels_only:
        with pg() as c:
            lx_tx(c)
            m = N.load_parcels(c, rg, N.tenant_for(rg["sgg_cd"]))
            c.commit()
        out = {"sgg_cd": rg["sgg_cd"], "parcels": m}
    else:
        out = N.build(rg["sgg_cd"], a.job, build_job_id="p8-cli", force=a.force,
                      progress=lambda st, d, t, n=None: log(f"P8 {st} {d}/{t} {n or ''}"))
    if a.pmtiles:
        out["pmtiles"] = str(pmtiles(rg["sgg_cd"]))
    out["elapsed_s"] = round(time.time() - t0, 1)
    print(json.dumps(out, ensure_ascii=False, indent=1, default=str))


if __name__ == "__main__":
    main()
