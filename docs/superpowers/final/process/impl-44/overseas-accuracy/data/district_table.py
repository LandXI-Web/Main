"""Per-district cropland: ledger vs public maps vs what the map tiles actually draw (z11 crop tiles)."""
import json, math, sys
from pathlib import Path
SRV = Path("E:/Land-XI 플랫폼/01. 디자인/server")
sys.path.insert(0, str(SRV))
import numpy as np
from PIL import Image
from national.common import pg
from shapely import wkt
from shapely.ops import transform as sh_tr
from pyproj import Transformer
from rasterio.features import rasterize
from rasterio.transform import Affine

D = Path("E:/Land-XI 플랫폼/02. 데이터")
led = json.loads((D / "global/district-cropland-2025.json").read_text(encoding="utf-8"))
nc = json.loads((D / "overseas/kgz/2025/national-compare.json").read_text(encoding="utf-8"))
tdir = D / "overseas/kgz/2025/publish/crop-z11"
meta = json.loads((tdir / "meta.json").read_text(encoding="utf-8"))
tx0, ty0, tx1, ty1 = meta["tiles"]
TS, Z = 256, 11
R = 20037508.342789244
RES = 2 * R / (2 ** Z * TS)
W, H = (tx1 - tx0 + 1) * TS, (ty1 - ty0 + 1) * TS
frac = np.zeros((H, W), np.uint8)
for x in range(tx0, tx1 + 1):
    for y in range(ty0, ty1 + 1):
        p = tdir / str(x) / f"{y}.png"
        if p.exists():
            a = np.asarray(Image.open(p).convert("RGBA"))
            frac[(y - ty0) * TS:(y - ty0 + 1) * TS, (x - tx0) * TS:(x - tx0 + 1) * TS] = np.where(a[..., 3] > 0, a[..., 1], 0)
tr = Affine(RES, 0, -R + tx0 * TS * RES, 0, -RES, R - ty0 * TS * RES)
to3857 = Transformer.from_crs(4326, 3857, always_xy=True).transform
with pg() as c:
    cells = c.execute("SELECT cell_cd, name, adm1_name, area_km2, ST_AsText(geom) FROM overseas_cells WHERE country='kgz' AND year=2025 AND NOT test").fetchall()
ids = np.zeros((H, W), np.int16)
shapes = [(sh_tr(to3857, wkt.loads(g)), i + 1) for i, (cd, nm, a1, ar, g) in enumerate(cells)]
ids = rasterize(shapes, out_shape=(H, W), transform=tr, fill=0, dtype="int16")
lat = np.degrees(np.arctan(np.sinh(np.pi * (1 - 2 * ((ty0 * TS + np.arange(H) + 0.5) / (2 ** Z * TS))))))
pa = (RES * np.cos(np.radians(lat))) ** 2 / 1e6  # km2 per pixel per row
area_w = (frac.astype(np.float64) / 255.0) * pa[:, None]
tile_km2 = np.bincount(ids.ravel(), weights=area_w.ravel(), minlength=len(cells) + 1)
ncr = {r["cell"]: r for r in nc["rows"]}
rows = []
for i, (cd, nm, a1, ar, g) in enumerate(cells):
    L = (led["districts"].get(cd) or {}).get("crop_ha") or {}
    n = ncr.get(cd, {}).get("경작지", {})
    rows.append({"cell": cd, "name": nm, "adm1": a1, "area_km2": round(ar), "ledger_km2": round((L.get("value") or 0) / 100, 1), "src": L.get("src"),
                 "raw_sum_km2": n.get("ours"), "esri2025": n.get("esri2025"), "wc2021": n.get("worldcover2021"), "tiles_km2": round(float(tile_km2[i + 1]), 1)})
out = Path(sys.argv[1])
out.write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
tot = {k: round(sum((r[k] or 0) for r in rows), 1) for k in ("ledger_km2", "raw_sum_km2", "esri2025", "wc2021", "tiles_km2")}
print(json.dumps(tot, ensure_ascii=False))
for r in sorted(rows, key=lambda r: -(r["area_km2"])):
    pub = [v for v in (r["esri2025"], r["wc2021"]) if v]
    pm = sum(pub) / len(pub) if pub else None
    print(f"{r['name']:<16}{r['adm1']:<11}{r['src'] or '-':<7} ledger {r['ledger_km2']:>7} tiles {r['tiles_km2']:>7} esri {r['esri2025']} wc {r['wc2021']} ratio {(r['ledger_km2'] / pm) if pm else 0:.2f}")
