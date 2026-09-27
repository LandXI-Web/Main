"""영상 등록 타일 작업(F3 최종 명세 §3 S-5) — kind 'tile' · CPU 워커.

POST /catalog/imagery 가 카탈로그 행을 만들고 이 작업을 큐에 넣는다. shard 2칸:
  inspect   래스터 메타(CRS · 해상도 · 범위) → imagery.footprint · gsd_m · crs 갱신(등록 값과 다르면 실측이 이긴다)
  overview  내부 오버뷰가 없으면 외부 .ovr(gdaladdo -ro · 2…64) — /tiles/cog/{id} 동적 타일이 저배율에서 빨라진다
GPU 0 · 원본 파일은 바꾸지 않는다(-ro 외부 오버뷰).
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path

from adapters.base import ShardResult

ADAPTER = {"id": "tile/cog", "kinds": ["tile"], "device": "cpu", "input": "raster-path", "output": "metrics"}
_NOWIN = getattr(subprocess, "CREATE_NO_WINDOW", 0)


def plan(job: dict) -> list[dict]:
    o = job.get("options") or {}
    return [{"shard_id": "inspect", "imagery_id": o.get("imagery_id"), "path": o.get("path")},
            {"shard_id": "overview", "imagery_id": o.get("imagery_id"), "path": o.get("path")}]


def _cfg():
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from landxi_api import config
    return config


def _resolve(path: str) -> str:
    cfg = _cfg()
    return path if (os.path.isabs(path) or ":" in path[:3]) else str(cfg.DATA_ROOT / path)


class Adapter:
    def load(self, model, device, vram_budget_mib):
        return None

    def unload(self):
        return None

    def run_shard(self, shard, read, opts):
        p = shard.params or {}
        path = _resolve(p.get("path") or opts.get("path") or "")
        t0 = time.perf_counter()
        import rasterio
        with rasterio.open(path) as ds:
            epsg = ds.crs.to_epsg() if ds.crs else None
            res = float(abs(ds.res[0]))
            b = ds.bounds
            ovr = ds.overviews(1)
            w, h = ds.width, ds.height
        m = {"basis": "measured", "source": "rasterio(원본 메타)", "width_px": w, "height_px": h}
        if shard.id == "inspect":
            from pyproj import Transformer
            from shapely.geometry import box, mapping
            tf = Transformer.from_crs(epsg or 5186, 4326, always_xy=True)
            xs, ys = [], []
            for x, y in ((b.left, b.bottom), (b.left, b.top), (b.right, b.bottom), (b.right, b.top)):
                lx, ly = tf.transform(x, y)
                xs.append(lx)
                ys.append(ly)
            fp = box(min(xs), min(ys), max(xs), max(ys))
            gsd = res if (epsg and epsg != 4326) else None
            cfg = _cfg()
            import psycopg
            with psycopg.connect(cfg.PG_WORKER_DSN, autocommit=True) as conn:
                conn.execute("UPDATE imagery SET footprint=ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(%s),4326)), crs=%s, "
                             "gsd_m=COALESCE(%s, gsd_m) WHERE id=%s",
                             (json.dumps(mapping(fp)), f"EPSG:{epsg}" if epsg else None, gsd, p.get("imagery_id")))
            m.update({"crs": epsg, "gsd_m": gsd, "bbox4326": [round(v, 6) for v in fp.bounds]})
        else:
            if ovr:
                m.update({"overviews": ovr, "note": "내부 오버뷰 있음 — 건너뜀"})
            elif Path(path + ".ovr").exists():
                m.update({"note": "외부 오버뷰 있음 — 건너뜀"})
            else:
                cfg = _cfg()
                exe = cfg.gdal_exe("gdaladdo")
                levels = [str(2 ** i) for i in range(1, 7) if max(w, h) / 2 ** i >= 256]
                if levels:
                    subprocess.run([exe, "-ro", "-r", "average", "--config", "COMPRESS_OVERVIEW", "DEFLATE", path, *levels],
                                   check=True, capture_output=True, env=cfg.gdal_env(), timeout=6 * 3600, creationflags=_NOWIN)
                m.update({"levels": levels, "note": "외부 오버뷰(.ovr) 생성"})
        ms = int((time.perf_counter() - t0) * 1000)
        m["ms"] = ms
        return ShardResult(features=[], metrics=m, n=1, ms=ms)


def finalize(job: dict) -> dict:
    """카탈로그 행을 '타일 준비됨'으로(layer.tile_ready) — 화면은 /catalog/layers 에서 이 영상을 본다."""
    o = job.get("options") or {}
    cfg = _cfg()
    import psycopg
    with psycopg.connect(cfg.PG_WORKER_DSN, autocommit=True) as conn:
        conn.execute("UPDATE imagery SET layer = coalesce(layer,'{}'::jsonb) || jsonb_build_object('tile_ready', true, 'tile_job', %s::text) "
                     "WHERE id=%s", (job.get("id"), o.get("imagery_id")))
    return {"counts": {"imagery": 1}, "imagery_id": o.get("imagery_id")}
