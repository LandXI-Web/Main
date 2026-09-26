"""index/worldcover_hist — ESA WorldCover 2021 원해상도(10 m) 클래스 면적(ha) · 군 경계 마스크 — F1-CONTRACT §7(선택).

G2 의 PC item/statistics 는 max_size 2048 다운샘플이라 '비율만 유효'. 이 어댑터는 S3 COG 를 원해상도로 읽어
화소별 실제 면적(위도 보정)을 더해 정밀 면적(ha)을 낸다 → ysykata-landcover.json 의 classes[].area_ha 를 채운다.

  python -m server.adapters.global.adapter_worldcover --district Ysyk-Ata          # 계산 + 캐시 갱신
  python -m server.adapters.global.adapter_worldcover --district Ysyk-Ata --no-cache
"""
from __future__ import annotations

import argparse
import importlib
import json
import math
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
G = importlib.import_module("server.adapters.global")
_ndvi = importlib.import_module("server.adapters.global.adapter_ndvi_pc")
Shard, ShardResult = _ndvi.Shard, _ndvi.ShardResult

ADAPTER = {"id": "index/worldcover_hist", "kinds": ["index"], "device": "cpu", "input": "params", "output": "metrics",
           "models": ["index/worldcover_hist"], "owner": "F1-D"}
WC_URL = _ndvi.WC_URL


class WorldCoverAdapter:
    def load(self, model=None, device="cpu", vram_budget_mib=0):
        _ndvi._gdal_env()

    def unload(self):
        pass

    def run_shard(self, shard: Shard, read=None, opts=None) -> ShardResult:
        import numpy as np
        import rasterio
        from rasterio.features import geometry_mask
        from rasterio.windows import from_bounds
        from shapely.geometry import box, mapping, shape
        t0 = time.time()
        geom = shape(shard.params["geometry"])
        areas: dict[int, float] = {}
        for lon in sorted({int(geom.bounds[0] // 3 * 3), int(geom.bounds[2] // 3 * 3)}):
            part = geom.intersection(box(lon, 42, lon + 3, 45))
            if part.is_empty:
                continue
            with rasterio.open("/vsicurl/" + WC_URL.format(lon=f"{lon:02d}")) as ds:
                w = from_bounds(*part.bounds, transform=ds.transform).round_offsets().round_lengths()
                arr = ds.read(1, window=w)
                tr = ds.window_transform(w)
                inside = ~geometry_mask([mapping(part)], out_shape=arr.shape, transform=tr)
                # 화소 면적(m²) — 위도별: dx·dy · cos(lat)
                dlon, dlat = tr.a, -tr.e
                rows = np.arange(arr.shape[0])
                lat = tr.f - (rows + 0.5) * dlat
                px_m2 = (dlon * 111_320.0 * np.cos(np.radians(lat))) * (dlat * 110_574.0)
                for c in np.unique(arr[inside]):
                    sel = (arr == c) & inside
                    areas[int(c)] = areas.get(int(c), 0.0) + float((sel.sum(axis=1) * px_m2).sum())
        tot = sum(areas.values())
        asof = G.now_iso()
        met = {"area_ha": {c: G.env(round(a / 1e4, 1), "ha", "measured", "ESA WorldCover 2021 COG 10 m · latitude-corrected pixel area", as_of=asof) for c, a in areas.items()},
               "pct": {c: round(100 * a / tot, 2) for c, a in areas.items()},
               "total_ha": G.env(round(tot / 1e4, 1), "ha", "measured", "same calc · inside district boundary", as_of=asof), "basis": "measured"}
        return ShardResult(features=[], metrics=met, n=len(areas), ms=int((time.time() - t0) * 1000))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--district", default="Ysyk-Ata")
    ap.add_argument("--no-cache", action="store_true")
    a = ap.parse_args()
    adm2 = json.loads((G.GLOBAL_ROOT / "kgz-adm2.geojson").read_text(encoding="utf-8"))
    f = next(x for x in adm2["features"] if x["properties"]["name"] == a.district)
    ad = WorldCoverAdapter(); ad.load()
    r = ad.run_shard(Shard(id="wc", job_id="cli", bbox4326=tuple(f["properties"]["bbox"]), window=None, params={"geometry": f["geometry"]}))
    print(json.dumps({"ms": r.ms, "total_ha": r.metrics["total_ha"], "pct": r.metrics["pct"]}, ensure_ascii=False))
    if not a.no_cache and a.district == "Ysyk-Ata":
        doc = json.loads((G.GLOBAL_ROOT / "ysykata-landcover.json").read_text(encoding="utf-8"))
        for c in doc["classes"]:
            env = r.metrics["area_ha"].get(c["code"])
            if env:
                c["area_ha"] = env
                c["pct_10m"] = G.env(r.metrics["pct"][c["code"]], "%", "measured", env["source"], as_of=env["as_of"])
        doc["total_ha"] = r.metrics["total_ha"]
        doc["note_10m"] = "area_ha = 원해상도 10 m 재집계(adapter_worldcover) — 정밀 면적"
        G.write_out("ysykata-landcover.json", doc, indent=1)


if __name__ == "__main__":
    main()
