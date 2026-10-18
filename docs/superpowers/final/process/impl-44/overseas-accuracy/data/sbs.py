"""Side-by-side evidence: reference imagery | before | after, at zoom 13 (3x2 tiles = 768x512 px per panel).
usage: python -I sbs.py <outdir>"""
import io, json, math, sys, time
from pathlib import Path
SRV = Path("E:/Land-XI 플랫폼/01. 디자인/server")
sys.path.insert(0, str(SRV))
import numpy as np
import httpx
from PIL import Image, ImageDraw, ImageFont
from national.common import pg
from shapely import wkt

OUT = Path(sys.argv[1]) if __name__ == "__main__" else None
D = Path("E:/Land-XI 플랫폼/02. 데이터/overseas/kgz/2025/publish")
SCR = Path(__file__).parent
import landxi_api.global_data as gd

FONT = None
for f in ("C:/Windows/Fonts/malgun.ttf", "C:/Windows/Fonts/arial.ttf"):
    if Path(f).exists():
        FONT = ImageFont.truetype(f, 22); break
cli = httpx.Client(timeout=30, headers={"User-Agent": "LandXI-evidence/0.1"})
_img_cache = {}


def esri(z, x, y):
    k = (z, x, y)
    if k not in _img_cache:
        for a in range(3):
            try:
                r = cli.get(f"https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}")
                if r.status_code == 200:
                    _img_cache[k] = Image.open(io.BytesIO(r.content)).convert("RGB"); break
            except httpx.HTTPError:
                pass
            time.sleep(1)
        else:
            _img_cache[k] = Image.new("RGB", (256, 256), (200, 200, 200))
    return _img_cache[k]


def block(fn, z, x0, y0, nx=3, ny=2, mode="RGBA"):
    im = Image.new(mode, (256 * nx, 256 * ny))
    for j in range(ny):
        for i in range(nx):
            t = fn(z, x0 + i, y0 + j)
            if t is not None:
                im.paste(t, (256 * i, 256 * j))
    return im


def cv_old(z, x, y):
    d, meta = D / "crop-z11", json.loads((D / "crop-z11/meta.json").read_text(encoding="utf-8"))
    png = old_cv_png(d, meta, z, x, y)
    return Image.open(io.BytesIO(png)).convert("RGBA") if png else None


def cv_new(z, x, y):
    d, meta = D / "crop-z11", json.loads((D / "crop-z11/meta.json").read_text(encoding="utf-8"))
    if z > meta["z"]:
        d2, m2 = gd._crop_meta(gd.CV_FINE)
        if m2:
            d, meta = d2, m2
    png = gd._cv_png(d, meta, z, x, y)
    return Image.open(io.BytesIO(png)).convert("RGBA") if png else None


def old_cv_png(d, meta, z, x, y):
    """The crop-view rule before 10-18 (z11 cells magnified, 'on' at 5% share, white cell outline) — on the old z11 tiles copy."""
    bz = 11
    f = 2 ** (z - bz)
    base = gd._cv_base(SCR / "crop-z11-before", x // f, y // f)
    if base is None:
        return None
    n = 256 // f
    ox, oy = (x % f) * n, (y % f) * n
    sub = base[0][oy:oy + n, ox:ox + n]
    mean = np.repeat(np.repeat(sub, f, axis=0), f, axis=1)
    on = mean > 12
    if not on.any():
        return None
    alpha = np.where(on, np.clip(128 + (mean.astype(np.int32) * 30) // 255, 128, 158), 0).astype(np.uint8)
    rgba = np.zeros((256, 256, 4), np.uint8); rgba[..., 0], rgba[..., 1], rgba[..., 2] = gd.CV_FILL; rgba[..., 3] = alpha
    pad = np.pad(on, 1, mode="edge"); inner = pad[:-2, 1:-1] & pad[2:, 1:-1] & pad[1:-1, :-2] & pad[1:-1, 2:]
    rgba[on & ~inner] = (255, 255, 255, 235)
    b = io.BytesIO(); Image.fromarray(rgba, "RGBA").save(b, "PNG"); return b.getvalue()


def label(im, text):
    d = ImageDraw.Draw(im)
    w = d.textlength(text, font=FONT) + 20
    d.rectangle([8, 8, 8 + w, 42], fill=(255, 255, 255))
    d.text((18, 12), text, fill=(25, 31, 40), font=FONT)
    return im


def triptych(name, z, x0, y0, title_old, title_new, nx=3, ny=2):
    base = block(esri, z, x0, y0, nx, ny, "RGB")
    old = Image.alpha_composite(base.convert("RGBA"), block(cv_old, z, x0, y0, nx, ny)).convert("RGB")
    new = Image.alpha_composite(base.convert("RGBA"), block(cv_new, z, x0, y0, nx, ny)).convert("RGB")
    W, H = base.size
    out = Image.new("RGB", (W * 3 + 32, H), (255, 255, 255))
    out.paste(label(base.copy(), "Reference imagery (Esri World Imagery)"), (0, 0))
    out.paste(label(old, title_old), (W + 16, 0))
    out.paste(label(new, title_new), (2 * W + 32, 0))
    out.save(OUT / f"{name}.png", optimize=True)
    return f"{name}.png"


def best_tile(name, z=13):
    """z13 3x2 block with the most cropland (new fine tiles) inside a district."""
    with pg() as c:
        g = wkt.loads(c.execute("SELECT ST_AsText(geom) FROM overseas_cells WHERE country='kgz' AND year=2025 AND NOT test AND name=%s", (name,)).fetchone()[0])
    d13 = D / "crop-z13"; m13 = json.loads((d13 / "meta.json").read_text(encoding="utf-8"))
    best, bv = None, -1
    from shapely.geometry import Point
    from shapely.prepared import prep
    pg_ = prep(g)
    tx0, ty0, tx1, ty1 = m13["tiles"]
    for xd in sorted((d13).iterdir()):
        if not xd.is_dir():
            continue
        x = int(xd.name)
        for f in xd.iterdir():
            y = int(f.stem)
            lon = (x + 0.5) / 2 ** z * 360 - 180
            lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + 0.5) / 2 ** z))))
            if not pg_.contains(Point(lon, lat)):
                continue
            v = f.stat().st_size
            if v > bv:
                best, bv = (x, y), v
    return best


if __name__ == "__main__":
    rows = []
    for nm in sys.argv[2:]:
        bt = best_tile(nm)
        if not bt:
            print("no tile", nm); continue
        x0, y0 = bt[0] - 1, bt[1]
        f = triptych(f"crop-{nm.lower()}-z13", 13, x0, y0, "Before: 57 m cells, any share", "After: 14 m cells, half or more")
        rows.append({"district": nm, "z": 13, "x0": x0, "y0": y0, "file": f}); print(f, flush=True)
    (OUT / "sbs-crop.json").write_text(json.dumps(rows, indent=1), encoding="utf-8")
