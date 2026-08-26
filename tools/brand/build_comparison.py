"""Build shots/brand/vector-vs-promo.jpg: for each of the three brand marks,
a row of [promo crop] [rasterized SVG] [50% overlay]. Run after all three
build_*.py + PNG exports."""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
import numpy as np
import cv2
from PIL import Image
from vectorize import bbox_of_mask

REPO = r"F:\Land-XI 플랫폼\01. 디자인"
PROMO = os.path.join(REPO, "landxi", "assets", "brand", "promo")
VEC = os.path.join(REPO, "landxi", "assets", "brand", "vector")
SHOTS = os.path.join(REPO, "shots", "brand")


def tight_crop_promo(name, kind):
    """Crop the promo source to its own content bbox (same detection logic used
    by the build_*.py scripts) so it lines up with the tight-cropped vector for
    the overlay column."""
    im = Image.open(os.path.join(PROMO, name)).convert("RGB")
    arr = np.array(im).astype(np.int16)
    h, w, _ = arr.shape
    if kind == "white":
        hsv = cv2.cvtColor(np.array(im), cv2.COLOR_RGB2HSV)
        mask = (hsv[:, :, 1] < 60) & (hsv[:, :, 2] > 190)
    else:
        b = 6
        border = np.concatenate([
            arr[:b, :, :].reshape(-1, 3), arr[-b:, :, :].reshape(-1, 3),
            arr[:, :b, :].reshape(-1, 3), arr[:, -b:, :].reshape(-1, 3),
        ])
        bg = np.median(border, axis=0)
        dist = np.linalg.norm(arr - bg[None, None, :], axis=2)
        mask = dist > 30
    x0, y0, x1, y1 = bbox_of_mask(mask)
    pad = 4
    x0 = max(0, x0 - pad); y0 = max(0, y0 - pad)
    x1 = min(w, x1 + pad); y1 = min(h, y1 + pad)
    return im.crop((x0, y0, x1, y1))

ROWS = [
    ("landxi-wordmark.svg (fallback re-typeset, Archivo Black condensed)", "brand-wordmark-4x.png", "landxi-wordmark.png", "#12121a", "white"),
    ("lx-lockup.svg (traced)", "brand-lx-lockup-4x.png", "lx-lockup.png", "#eef0f2", "distance"),
    ("tagline.svg (traced)", "brand-tagline-2x.png", "tagline.png", "#e0e4e6", "distance"),
]

CELL_W = 900
LABEL_H = 34
PAD = 10


def fit(im, w, bg):
    ratio = w / im.width
    h = max(1, round(im.height * ratio))
    im2 = im.resize((w, h), Image.LANCZOS)
    canvas = Image.new("RGB", (w, h), bg)
    if im2.mode == "RGBA":
        canvas.paste(im2, (0, 0), im2)
    else:
        canvas.paste(im2, (0, 0))
    return canvas


def overlay(promo_bg, svg_rgba, bg):
    # svg_rgba resized to same size as promo_bg canvas, composited at 50% alpha
    # over the promo image (promo tinted toward gray so the white/colored trace
    # reads clearly on top).
    base = promo_bg.convert("L").convert("RGB")
    base = Image.blend(base, Image.new("RGB", base.size, bg), 0.35)
    if svg_rgba.mode != "RGBA":
        svg_rgba = svg_rgba.convert("RGBA")
    r, g, b, a = svg_rgba.split()
    a = a.point(lambda v: int(v * 0.72))
    svg_half = Image.merge("RGBA", (r, g, b, a))
    out = base.convert("RGBA")
    out.alpha_composite(svg_half)
    return out.convert("RGB")


rows_imgs = []
for label, promo_name, svg_png_name, bg, kind in ROWS:
    promo = tight_crop_promo(promo_name, kind)
    svg_raw = Image.open(os.path.join(VEC, svg_png_name))  # RGBA, transparent bg

    promo_cell = fit(promo, CELL_W, bg)

    svg_cell_bg = Image.new("RGB", (CELL_W, 1), bg)  # placeholder, real size after fit
    svg_ratio = CELL_W / svg_raw.width
    svg_h = max(1, round(svg_raw.height * svg_ratio))
    svg_resized = svg_raw.resize((CELL_W, svg_h), Image.LANCZOS)
    svg_cell = Image.new("RGB", (CELL_W, svg_h), bg)
    svg_cell.paste(svg_resized, (0, 0), svg_resized)

    # common height for the row = max of the two cells, letterbox both centered
    row_h = max(promo_cell.height, svg_cell.height)

    def letterbox(im, h, bg):
        canvas = Image.new("RGB", (CELL_W, h), bg)
        y = (h - im.height) // 2
        canvas.paste(im, (0, y))
        return canvas

    promo_lb = letterbox(promo_cell, row_h, bg)
    svg_lb = letterbox(svg_cell, row_h, bg)

    # overlay: align svg (resized+letterboxed) over promo (resized+letterboxed)
    promo_rgba = promo_lb.convert("RGBA")
    svg_lb_rgba = svg_lb.convert("RGBA")
    # rebuild alpha for svg_lb from svg_resized's alpha channel, placed at same y offset
    alpha_canvas = Image.new("L", (CELL_W, row_h), 0)
    y = (row_h - svg_cell.height) // 2
    if svg_resized.mode == "RGBA":
        alpha_canvas.paste(svg_resized.split()[3], (0, y))
    svg_lb_rgba.putalpha(alpha_canvas)
    ov = overlay(promo_lb, svg_lb_rgba, bg)

    strip = Image.new("RGB", (CELL_W * 3 + PAD * 2, row_h + LABEL_H), "#1a1a1f")
    strip.paste(promo_lb, (0, LABEL_H))
    strip.paste(svg_lb, (CELL_W + PAD, LABEL_H))
    strip.paste(ov, (2 * (CELL_W + PAD), LABEL_H))

    from PIL import ImageDraw
    d = ImageDraw.Draw(strip)
    d.text((6, 6), f"{label}  |  promo crop", fill="#ffffff")
    d.text((CELL_W + PAD + 6, 6), "vector (rasterized)", fill="#ffffff")
    d.text((2 * (CELL_W + PAD) + 6, 6), "50% overlay", fill="#ffffff")

    rows_imgs.append(strip)

total_h = sum(im.height for im in rows_imgs) + 20 * (len(rows_imgs) - 1)
sheet_w = rows_imgs[0].width
sheet = Image.new("RGB", (sheet_w, total_h), "#1a1a1f")
y = 0
for im in rows_imgs:
    sheet.paste(im, (0, y))
    y += im.height + 20

os.makedirs(SHOTS, exist_ok=True)
out_path = os.path.join(SHOTS, "vector-vs-promo.jpg")
sheet.convert("RGB").save(out_path, quality=92)
print("wrote", out_path, sheet.size)
