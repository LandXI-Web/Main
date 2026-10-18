"""Replicate the overseas first-screen crop-drop (ndvi-tiles.js dropOf) in Python and test stricter rules.
usage: python -I drop_diag.py <district name> <out.json>"""
import hashlib, io, json, math, sys, time
from pathlib import Path
SRV = Path("E:/Land-XI 플랫폼/01. 디자인/server")
sys.path.insert(0, str(SRV))
import numpy as np
import httpx
from PIL import Image
from national.common import pg
from shapely import wkt
from rasterio.features import rasterize
from rasterio.transform import Affine
from scipy import ndimage

D = Path("E:/Land-XI 플랫폼/02. 데이터")
CACHE = D / "cache" / "pctiles"
Q = "collection=sentinel-2-l2a&assets=B04&assets=B08&expression=(B08-B04)/(B08%2BB04)&asset_as_band=true&rescale=-0.2,0.8&nodata=0"
CUR = {"2025-09": "fc0ea193863cf9813066103bc5e659a7", "2025-10": "745b598f22c8047594285de8d5591af1"}
PREV = {"2024-09": "cfac26cb756a3a08db296d4890a8ea1e", "2024-10": "a043a62b6e9351a2339f3d8d24695516"}
Z, TS = 11, 256
name = sys.argv[1]
lon2x = lambda lon: (lon + 180) / 360 * 2 ** Z * TS
lat2y = lambda lat: (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * 2 ** Z * TS
y2lat = lambda y: math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / (2 ** Z * TS)))))
with pg() as c:
    g = c.execute("SELECT ST_AsText(geom) FROM overseas_cells WHERE country='kgz' AND year=2025 AND NOT test AND name=%s", (name,)).fetchone()[0]
geom = wkt.loads(g)
b = geom.bounds
tx0, tx1 = int(lon2x(b[0]) // TS), int(lon2x(b[2]) // TS)
ty0, ty1 = int(lat2y(b[3]) // TS), int(lat2y(b[1]) // TS)
W, H = (tx1 - tx0 + 1) * TS, (ty1 - ty0 + 1) * TS
X0, Y0 = tx0 * TS, ty0 * TS
# mask in global-pixel space (affine on lon/lat is not linear in y → rasterize in pixel coords)
from shapely.ops import transform as sh_tr
gpx = sh_tr(lambda x, y, z=None: (np.vectorize(lon2x)(x) - X0, np.vectorize(lat2y)(y) - Y0), geom)
mask = rasterize([(gpx, 1)], out_shape=(H, W), transform=Affine.identity(), fill=0, dtype="uint8").astype(bool)


def tile(sid, x, y, cli):
    path = f"mosaic/tiles/{sid}/WebMercatorQuad/{Z}/{x}/{y}@1x.png"
    key = f"pcdata/{path}?{Q}"
    h = hashlib.sha1(key.encode()).hexdigest()
    bp, mp = CACHE / h[:2] / (h + ".bin"), CACHE / h[:2] / (h + ".json")
    if bp.exists() and mp.exists():
        m = json.loads(mp.read_text(encoding="utf-8"))
        return None if m.get("ctype") == "empty" else bp.read_bytes(), "hit"
    for a in range(4):
        try:
            r = cli.get(f"https://planetarycomputer.microsoft.com/api/data/v1/{path}?{Q}")
            if r.status_code in (204, 404):
                return None, "net"
            if r.status_code == 200:
                return r.content, "net"
        except httpx.HTTPError:
            pass
        time.sleep(1 + a)
    raise RuntimeError("tile miss")


def month(sid, cli, stats):
    v = np.zeros((H, W), np.uint8); ok = np.zeros((H, W), bool)
    for y in range(ty0, ty1 + 1):
        for x in range(tx0, tx1 + 1):
            body, how = tile(sid, x, y, cli); stats[how] = stats.get(how, 0) + 1
            if not body:
                continue
            a = np.asarray(Image.open(io.BytesIO(body)).convert("RGBA"))
            sl = np.s_[(y - ty0) * TS:(y - ty0 + 1) * TS, (x - tx0) * TS:(x - tx0 + 1) * TS]
            v[sl] = a[..., 0]; ok[sl] = a[..., 3] > 127
    return v, ok


def crop():
    f = np.zeros((H, W), np.float32)
    d = D / "overseas/kgz/2025/publish/crop-z11"
    for y in range(ty0, ty1 + 1):
        for x in range(tx0, tx1 + 1):
            p = d / str(x) / f"{y}.png"
            if p.exists():
                a = np.asarray(Image.open(p).convert("RGBA"))
                f[(y - ty0) * TS:(y - ty0 + 1) * TS, (x - tx0) * TS:(x - tx0 + 1) * TS] = np.where((a[..., 3] > 127) & (a[..., 0] == 40), a[..., 1] / 255.0, 0)
    return f


stats = {}
with httpx.Client(timeout=30) as cli:
    A = [month(s, cli, stats) for s in CUR.values()]
    B = [month(s, cli, stats) for s in PREV.values()]
cf = crop()
lat = np.array([y2lat(Y0 + y + 0.5) for y in range(H)])
pa = ((2 * math.pi * 6378137 * np.cos(np.radians(lat))) / (2 ** Z * TS)) ** 2  # m2 per px
PA = np.repeat(pa[:, None], W, axis=1)


def smean(ms):
    s = np.zeros((H, W), np.float32); n = np.zeros((H, W), np.uint8)
    for v, ok in ms:
        s += np.where(ok, v, 0); n += ok
    return s, n


sA, nA = smean(A); sB, nB = smean(B)
inm = mask & (cf > 0)
okm = inm & (nA > 0) & (nB > 0)
mA = np.where(nA > 0, sA / np.maximum(nA, 1), 0) / 255.0 - 0.2   # NDVI
mB = np.where(nB > 0, sB / np.maximum(nB, 1), 0) / 255.0 - 0.2
diff = mB - mA
lim = 0.1 * 255 / 255  # 0.1 NDVI
cur = okm & ((sB / np.maximum(nB, 1) - sA / np.maximum(nA, 1)) >= 25.5)
km2 = lambda m: float((PA * cf)[m].sum() / 1e6)
crop_km2 = float((PA * cf)[inm].sum() / 1e6)
res = {"district": name, "tiles": stats, "grid": [W, H], "crop_km2": round(crop_km2, 1), "coverage": round(float((PA * cf)[okm].sum() / max((PA * cf)[inm].sum(), 1)), 3)}
res["current_rule_km2"] = round(km2(cur), 1)
# breakdown of current drop
nb = ndimage.convolve(cur.astype(np.uint8), np.ones((3, 3), np.uint8), mode="constant") - cur
res["share_isolated"] = round(km2(cur & (nb == 0)) / max(km2(cur), 1e-9), 3)
res["share_low_crop_frac(<0.5)"] = round(km2(cur & (cf < 0.5)) / max(km2(cur), 1e-9), 3)
res["share_prev_low_ndvi(<0.3)"] = round(km2(cur & (mB < 0.3)) / max(km2(cur), 1e-9), 3)
# month consistency: each month pair (Sep vs Sep, Oct vs Oct) both dropped >= 0.1
mon = []
for (va, oka), (vb, okb) in zip(A, B):
    mon.append(np.where(oka & okb, (vb.astype(np.int16) - va.astype(np.int16)) >= 25.5, True))
cons = np.logical_and.reduce(mon)
res["share_one_month_only"] = round(km2(cur & ~cons) / max(km2(cur), 1e-9), 3)
rel = np.where(mB > 0.05, diff / np.maximum(mB, 0.05), 0)
res["mean_prev_ndvi_on_drop"] = round(float(mB[cur].mean()), 3)
res["mean_cur_ndvi_on_drop"] = round(float(mA[cur].mean()), 3)
# stricter variants
var = {}
var["thr0.15"] = okm & (diff >= 0.15)
var["thr0.1+both_months"] = cur & cons
var["thr0.1+prev>=0.3+rel>=25%"] = cur & (mB >= 0.3) & (rel >= 0.25)
strict = cur & cons & (mB >= 0.3) & (rel >= 0.25)
var["both_months+prev>=0.3+rel>=25%"] = strict
lab, n = ndimage.label(strict, structure=np.ones((3, 3)))
sizes = ndimage.sum(np.ones_like(lab), lab, index=np.arange(1, n + 1))
keep = np.isin(lab, np.arange(1, n + 1)[sizes >= 2])
var["strict+min2px"] = keep
var["strict+min2px+cropfrac>=0.5"] = keep & (cf >= 0.5)
res["variants_km2"] = {k: round(km2(m), 1) for k, m in var.items()}
res["histogram_diff_on_crop"] = {f"{lo:.2f}": round(km2(okm & (diff >= lo) & (diff < lo + 0.05)), 1) for lo in np.arange(-0.3, 0.45, 0.05)}
Path(sys.argv[2]).write_text(json.dumps(res, indent=1), encoding="utf-8")
np.savez_compressed(Path(sys.argv[2]).with_suffix(".npz"), cur=cur, strict=keep, cf=cf, mask=mask, mA=mA.astype(np.float16), mB=mB.astype(np.float16), ok=okm,
                    meta=np.array([tx0, ty0, tx1, ty1]))
print(json.dumps(res, indent=1))
