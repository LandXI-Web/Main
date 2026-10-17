"""스냅샷 — GeoJSON(4326) → 벡터 PMTiles(conda gcs ogr2ogr 서브프로세스 · layer `results` · promote id).

사용(CLI): python server/pipelines/snapshot_pmtiles.py in.geojson out.pmtiles [minzoom maxzoom]
"""
from __future__ import annotations

import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from landxi_api import config  # noqa: E402


def build(src: Path, dst: Path, minzoom: int = 10, maxzoom: int = 18, layer: str = "results", name: str = "", light: bool = True) -> dict:
    """light = 먼 축척(≤ 12) 조각을 다시 굽는다(pmtiles_light — 10-15 가벼운 조각 · 10-17 줌아웃-보이게: 줌 13 조각에서 모아 작은 면을 버리지 않음 · 줌 8 부터 · 속성 id · cls 만)."""
    dst.parent.mkdir(parents=True, exist_ok=True)
    tmp = dst.with_name(dst.stem + ".tmp.pmtiles")
    if tmp.exists():
        tmp.unlink()
    cmd = [config.gdal_exe("ogr2ogr"), "-f", "PMTiles", str(tmp), str(src), "-nln", layer, "-t_srs", "EPSG:4326",
           "-dsco", f"MINZOOM={minzoom}", "-dsco", f"MAXZOOM={maxzoom}", "-dsco", f"NAME={name or dst.stem}",
           "-lco", f"MINZOOM={minzoom}", "-lco", f"MAXZOOM={maxzoom}"]
    t0 = time.time()
    r = subprocess.run(cmd, env=config.gdal_env(), capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0 or not tmp.exists():
        raise RuntimeError("ogr2ogr PMTiles 실패: " + (r.stderr or "")[-600:])
    if light and minzoom <= 12:
        try:
            from pipelines.pmtiles_light import lighten
            lighten(tmp, force=True)
        except Exception as e:  # noqa: BLE001 — 가벼운 조각을 못 만들면 원래 조각 그대로(결과는 막지 않음)
            print("[snapshot] 가벼운 조각 건너뜀:", e, file=sys.stderr)
    tmp.replace(dst)
    return {"path": str(dst), "bytes": dst.stat().st_size, "ms": int((time.time() - t0) * 1000), "minzoom": minzoom, "maxzoom": maxzoom}


if __name__ == "__main__":
    a = sys.argv[1:]
    print(build(Path(a[0]), Path(a[1]), *(int(x) for x in a[2:4])))
