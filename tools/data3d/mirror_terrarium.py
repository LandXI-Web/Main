#!/usr/bin/env python
"""공개 AWS Terrain Tiles(Terrarium)를 AOI만 로컬 미러 -> MapLibre raster-dem 소스.
usage: python tools/data3d/mirror_terrarium.py <w> <s> <e> <n> <zmin> <zmax> <outdir> [max_mb]
license: AWS Open Data 'Terrain Tiles' — 출처표기(SRTM/NED/Copernicus 등 혼합), 무료·키 불필요.
"""
import math, os, sys, time, urllib.request, json

SRC = "https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png"

def deg2tile(lon, lat, z):
    n = 2 ** z
    x = int((lon + 180.0) / 360.0 * n)
    lat = max(min(lat, 85.05), -85.05)
    y = int((1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n)
    return x, y

def main():
    a = sys.argv[1:]
    w, s, e, n = map(float, a[0:4])
    zmin, zmax = int(a[4]), int(a[5])
    outdir = a[6]
    max_mb = float(a[7]) if len(a) > 7 else 15.0

    total = 0
    got = skipped = 0
    for z in range(zmin, zmax + 1):
        x0, y1 = deg2tile(w, s, z)
        x1, y0 = deg2tile(e, n, z)
        for x in range(x0, x1 + 1):
            for y in range(y0, y1 + 1):
                p = os.path.join(outdir, str(z), str(x), f"{y}.png")
                if os.path.exists(p):
                    total += os.path.getsize(p); skipped += 1; continue
                os.makedirs(os.path.dirname(p), exist_ok=True)
                url = SRC.format(z=z, x=x, y=y)
                for attempt in range(3):
                    try:
                        d = urllib.request.urlopen(url, timeout=30).read(); break
                    except Exception as ex:
                        if attempt == 2:
                            print(f"  MISS {z}/{x}/{y} {ex}", file=sys.stderr); d = None
                        time.sleep(1)
                if not d: continue
                open(p, "wb").write(d)
                total += len(d); got += 1
                if total > max_mb * 1e6:
                    print(f"STOP: {max_mb} MB 초과 (z={z})", file=sys.stderr)
                    finish(outdir, w, s, e, n, zmin, z, total, got, skipped); return
    finish(outdir, w, s, e, n, zmin, zmax, total, got, skipped)

def finish(outdir, w, s, e, n, zmin, zmax, total, got, skipped):
    meta = {"tilejson": "2.2.0", "name": "landxi-terrarium",
            "description": "AWS Open Data Terrain Tiles (Terrarium) AOI mirror",
            "format": "png", "encoding": "terrarium", "tileSize": 256,
            "minzoom": zmin, "maxzoom": zmax, "bounds": [w, s, e, n],
            "attribution": "Elevation: AWS Terrain Tiles (SRTM/Copernicus 등) — Public Domain/CC-BY",
            "tiles": ["./{z}/{x}/{y}.png"]}
    json.dump(meta, open(os.path.join(outdir, "tiles.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(json.dumps({"outdir": outdir, "downloaded": got, "cached": skipped,
                      "bytes": total, "mb": round(total / 1e6, 2),
                      "zoom": [zmin, zmax]}, indent=2))

if __name__ == "__main__":
    main()
