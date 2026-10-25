import io, json, math, pathlib, asyncio
import numpy as np, rasterio
from rasterio.windows import from_bounds
from rasterio.enums import Resampling
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from shapely import wkb
import asyncpg
DATA = pathlib.Path("E:/Land-XI 플랫폼/02. 데이터")
import re as _re
DSN = _re.search(r"^PG_ADMIN_DSN=(.*)$", pathlib.Path("E:/Land-XI 플랫폼/01. 디자인/server/.env").read_text(encoding="utf-8"), _re.M).group(1).strip()   # 비밀값은 server/.env 에서만
W, H = 1200, 900
FB = "C:/Windows/Fonts/malgunbd.ttf"
def font(px): return ImageFont.truetype(FB, px)

def read_rgb(path, bbox, w, h):
    p = DATA / path if not pathlib.Path(path).is_absolute() else pathlib.Path(path)
    with rasterio.open(p) as ds:
        win = from_bounds(*bbox, transform=ds.transform)
        arr = ds.read([1, 2, 3] if ds.count >= 3 else [1, 1, 1], window=win, out_shape=(3, h, w), boundless=True, fill_value=255,
                      resampling=Resampling.average if (bbox[2]-bbox[0])/w > abs(ds.transform.a)*2 else Resampling.bilinear)
        try:
            m = ds.read_masks(1, window=win, out_shape=(h, w), boundless=True)
        except Exception:
            m = None
    if arr.dtype != np.uint8:
        lo, hi = np.percentile(arr, 1), np.percentile(arr, 99)
        arr = np.clip((arr - lo) / max(hi - lo, 1) * 255, 0, 255).astype(np.uint8)
    img = np.transpose(arr, (1, 2, 0)).copy()
    if m is not None:
        img[m == 0] = 255
    return Image.fromarray(img, "RGB")

async def geoms(sql, *args):
    c = await asyncpg.connect(DSN)
    try:
        rows = await c.fetch(sql, *args)
    finally:
        await c.close()
    return [(wkb.loads(bytes(r["g"])), dict(r)) for r in rows]

def run(coro): return asyncio.run(coro)

def to_px(bbox, w, h):
    sx, sy = w / (bbox[2] - bbox[0]), h / (bbox[3] - bbox[1])
    return lambda x, y: ((x - bbox[0]) * sx, (bbox[3] - y) * sy)

def hexrgb(c, a=255):
    c = c.lstrip("#"); return tuple(int(c[i:i+2], 16) for i in (0, 2, 4)) + (a,)

def draw(img, items, bbox, scale=1):
    """items: [(geom, {fill, line, width, dash, point_r})]"""
    w, h = img.size
    S = 2  # 슈퍼샘플
    ov = Image.new("RGBA", (w * S, h * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    tp = to_px(bbox, w * S, h * S)
    def rings(g):
        if g.geom_type == "Polygon": yield g
        elif g.geom_type in ("MultiPolygon", "GeometryCollection"):
            for x in g.geoms: yield from rings(x)
    for g, st in items:
        if g.geom_type in ("Point", "MultiPoint"):
            pts = [g] if g.geom_type == "Point" else list(g.geoms)
            r = st.get("r", 5) * S
            for p in pts:
                x, y = tp(p.x, p.y)
                d.ellipse([x - r, y - r, x + r, y + r], fill=hexrgb(st["fill"], st.get("fa", 255)), outline=hexrgb(st.get("line", "#FFFFFF")), width=max(1, int(st.get("width", 1.5) * S)))
            continue
        for poly in rings(g):
            ext = [tp(*c[:2]) for c in poly.exterior.coords]
            if len(ext) < 3: continue
            if st.get("fill"):
                d.polygon(ext, fill=hexrgb(st["fill"], st.get("fa", 90)))
            if st.get("halo"):
                d.line(ext + [ext[0]], fill=hexrgb(st["halo"], st.get("ha", 160)), width=int((st.get("width", 2) + 3) * S), joint="curve")
            if st.get("line"):
                if st.get("dash"):
                    dashline(d, ext + [ext[0]], hexrgb(st["line"], st.get("la", 255)), int(st.get("width", 2) * S), 10 * S, 7 * S)
                else:
                    d.line(ext + [ext[0]], fill=hexrgb(st["line"], st.get("la", 255)), width=int(st.get("width", 2) * S), joint="curve")
    ov = ov.resize((w, h), Image.LANCZOS)
    out = img.convert("RGBA"); out.alpha_composite(ov)
    return out.convert("RGB")

def dashline(d, pts, col, width, on, off):
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        L = math.hypot(x1 - x0, y1 - y0); t = 0
        while t < L:
            t2 = min(t + on, L)
            d.line([(x0 + (x1 - x0) * t / L, y0 + (y1 - y0) * t / L), (x0 + (x1 - x0) * t2 / L, y0 + (y1 - y0) * t2 / L)], fill=col, width=width)
            t = t2 + off

def pill(d, xy, text, f, anchor="mm", bg=(25, 31, 40, 200), fg=(255, 255, 255, 255), pad=(18, 9)):
    bb = d.textbbox(xy, text, font=f, anchor=anchor)
    r = [bb[0] - pad[0], bb[1] - pad[1], bb[2] + pad[0], bb[3] + pad[1]]
    d.rounded_rectangle(r, radius=(r[3] - r[1]) // 2, fill=bg)
    d.text(xy, text, font=f, anchor=anchor, fill=fg)
    return r

def compose(left, right, labels=("원본", "AI 결과"), legend=None):
    """left · right = 600×900. 가운데 얇은 선 · 아래 가운데 '원본 | AI 결과' · legend = [(색, 말)] 오른쪽 위 아래쪽"""
    canvas = Image.new("RGB", (W, H), "white")
    canvas.paste(left.resize((W // 2, H)), (0, 0)); canvas.paste(right.resize((W // 2, H)), (W // 2, 0))
    ov = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(ov)
    d.rectangle([W // 2 - 2, 0, W // 2 + 1, H], fill=(255, 255, 255, 235))
    f = font(30)
    y = H - 92                       # 3:2 상자에 맞춰 잘려도(위아래 약 50px) 보이는 자리
    t = f"{labels[0]}   |   {labels[1]}"
    pill(d, (W // 2, y), t, f)
    if legend:
        fl = font(26); x = W // 2 + 28; yy = 92
        for col, word in legend:
            bb = d.textbbox((0, 0), word, font=fl)
            wbox = bb[2] - bb[0] + 58
            d.rounded_rectangle([x, yy - 22, x + wbox, yy + 22], radius=22, fill=(255, 255, 255, 230))
            d.rounded_rectangle([x + 14, yy - 9, x + 32, yy + 9], radius=4, fill=hexrgb(col))
            d.text((x + 42, yy), word, font=fl, anchor="lm", fill=(25, 31, 40, 255))
            yy += 54
    out = canvas.convert("RGBA"); out.alpha_composite(ov)
    return out.convert("RGB")

def half_bbox(cx, cy, width_m):
    """600×900 반쪽(2:3) 상자 — 가운데 · 너비(m)"""
    hgt = width_m * 1.5
    return (cx - width_m / 2, cy - hgt / 2, cx + width_m / 2, cy + hgt / 2)

def save(img, path):
    path = pathlib.Path(path); path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "WEBP", quality=88, method=6)
    return path
