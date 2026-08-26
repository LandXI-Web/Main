"""
Vectorize Land-XI brand marks from promo video frame stills.

Pipeline: threshold/clean promo PNG -> boolean glyph mask -> upscale 2x
(Lanczos, done on the source raster before masking for smoother edges) ->
potrace (via potracer) -> single smoothed SVG path (with correct hole
winding for counters) -> written as landxi/assets/brand/vector/*.svg.

Usage: run with the `yolo` conda env (has opencv, numpy, potracer, Pillow).
"""
import numpy as np
from PIL import Image
import potrace
import cv2
import os

REPO = r"F:\Land-XI 플랫폼\01. 디자인"
PROMO = os.path.join(REPO, "landxi", "assets", "brand", "promo")
OUT = os.path.join(REPO, "landxi", "assets", "brand", "vector")


def load_upscaled(name, scale=2):
    im = Image.open(os.path.join(PROMO, name)).convert("RGB")
    w, h = im.size
    im2 = im.resize((w * scale, h * scale), Image.LANCZOS)
    return np.array(im2)


def clean_mask(mask, min_area=40, close_k=3):
    """mask: bool array. Remove speckle blobs below min_area, close small gaps.
    Preserves holes (counters) -- only prunes tiny disconnected specks."""
    m = (mask.astype(np.uint8)) * 255
    if close_k:
        k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (close_k, close_k))
        m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, k)
        m = cv2.morphologyEx(m, cv2.MORPH_OPEN, k)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(m, connectivity=8)
    out = np.zeros_like(m)
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] >= min_area:
            out[labels == i] = 255
    return out > 0


def mask_to_path_d(mask, turdsize=8, alphamax=1.0, opttolerance=0.2):
    """Trace a boolean mask (True = fill) to an SVG path `d` string via potrace.
    NOTE: the installed `potracer` 0.0.4 pure-python port mis-traces even a
    trivial centered square (confirmed by a standalone test: it returns a
    diamond at the edge midpoints instead of the square's corners, regardless
    of bool inversion or array transpose). Left in place for reference only --
    use mask_to_path_d_cv() below instead."""
    bmp = potrace.Bitmap(mask)
    path = bmp.trace(turdsize=turdsize, turnpolicy=potrace.POTRACE_TURNPOLICY_MINORITY,
                      alphamax=alphamax, opticurve=True, opttolerance=opttolerance)
    d_parts = []
    for curve in path:
        sp = curve.start_point
        d_parts.append(f"M {sp.x:.2f},{sp.y:.2f}")  # potrace _Point has .x/.y
        for seg in curve:
            if seg.is_corner:
                cx, cy = seg.c.x, seg.c.y
                ex, ey = seg.end_point.x, seg.end_point.y
                d_parts.append(f"L {cx:.2f},{cy:.2f} L {ex:.2f},{ey:.2f}")
            else:
                c1x, c1y = seg.c1.x, seg.c1.y
                c2x, c2y = seg.c2.x, seg.c2.y
                ex, ey = seg.end_point.x, seg.end_point.y
                d_parts.append(f"C {c1x:.2f},{c1y:.2f} {c2x:.2f},{c2y:.2f} {ex:.2f},{ey:.2f}")
        d_parts.append("Z")
    return " ".join(d_parts)


def _turn_angles_deg(pts):
    """pts: (n,2) float array, closed polygon. Returns turn angle (deg) at each
    vertex: 0 = perfectly straight through, larger = sharper corner."""
    n = len(pts)
    prev = np.roll(pts, 1, axis=0)
    nxt = np.roll(pts, -1, axis=0)
    v_in = pts - prev
    v_out = nxt - pts
    def ang(v):
        return np.arctan2(v[:, 1], v[:, 0])
    a_in = ang(v_in)
    a_out = ang(v_out)
    d = np.degrees(a_out - a_in)
    d = (d + 180) % 360 - 180
    return np.abs(d)


def contour_to_path_d(contour, epsilon_frac=0.006, curve_thresh_deg=48):
    """contour: (n,1,2) int32 array from cv2.findContours. Simplifies with
    approxPolyDP (kills stem-edge jaggies from compression noise), then walks
    the simplified polygon classifying each vertex as a hard corner (sharp
    turn -> straight line, keeps stems/right-angles crisp) or part of a
    smooth run (shallow turn -> cubic Catmull-Rom/Bezier through it, keeps
    round letterforms round instead of faceted)."""
    peri = cv2.arcLength(contour, True)
    eps = max(0.6, epsilon_frac * peri)
    approx = cv2.approxPolyDP(contour, eps, True)
    pts = approx.reshape(-1, 2).astype(np.float64)
    n = len(pts)
    if n < 3:
        return ""
    turn = _turn_angles_deg(pts)
    is_curve = turn < curve_thresh_deg

    d = [f"M {pts[0][0]:.2f},{pts[0][1]:.2f}"]
    for i in range(n):
        j = (i + 1) % n
        p_i, p_j = pts[i], pts[j]
        if is_curve[i] and is_curve[j]:
            p_prev = pts[(i - 1) % n]
            p_next = pts[(j + 1) % n]
            c1 = p_i + (p_j - p_prev) / 6.0
            c2 = p_j - (p_next - p_i) / 6.0
            d.append(f"C {c1[0]:.2f},{c1[1]:.2f} {c2[0]:.2f},{c2[1]:.2f} {p_j[0]:.2f},{p_j[1]:.2f}")
        else:
            d.append(f"L {p_j[0]:.2f},{p_j[1]:.2f}")
    d.append("Z")
    return " ".join(d)


def mask_to_path_d_cv(mask, epsilon_frac=0.006, curve_thresh_deg=48, min_contour_area=6):
    """Trace a boolean mask to an SVG path `d` string using cv2.findContours
    (RETR_CCOMP, so outer glyph outlines and their hole/counter contours both
    come back at one nesting level) + contour_to_path_d() per contour.
    Combine with fill-rule="evenodd" in the <path> so holes cut correctly."""
    m8 = (mask.astype(np.uint8)) * 255
    contours, hierarchy = cv2.findContours(m8, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    parts = []
    for c in contours:
        if cv2.contourArea(c) < min_contour_area:
            continue
        d = contour_to_path_d(c, epsilon_frac=epsilon_frac, curve_thresh_deg=curve_thresh_deg)
        if d:
            parts.append(d)
    return " ".join(parts)


def bbox_of_mask(mask):
    ys, xs = np.where(mask)
    if len(xs) == 0:
        return 0, 0, mask.shape[1], mask.shape[0]
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def write_svg(path_specs, width, height, out_path, extra_defs=""):
    """path_specs: list of (d, fill) tuples, already in the target coord space."""
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width:.2f} {height:.2f}">']
    if extra_defs:
        parts.append(extra_defs)
    for d, fill in path_specs:
        parts.append(f'<path d="{d}" fill="{fill}" fill-rule="evenodd"/>')
    parts.append("</svg>")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write("\n".join(parts))


def render_svg_to_png(svg_path, png_path, width_px):
    """Render an SVG to a PNG of given pixel width using a headless browser-free
    rasterizer (cairosvg) if available, else fall back to a crude PIL box (only
    used for the comparison sheet, not shipped assets)."""
    try:
        import cairosvg
        cairosvg.svg2png(url=svg_path, write_to=png_path, output_width=width_px)
        return True
    except Exception as e:
        print("cairosvg render failed:", e)
        return False
