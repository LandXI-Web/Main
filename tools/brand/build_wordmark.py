"""
Build landxi-wordmark.svg (+ -dark.svg) from the fallback Playwright render.

Why a fallback instead of tracing landxi/assets/brand/promo/brand-wordmark-4x.png
directly: that promo frame has "LAND-XI" clipped at the left edge (part of the L
is off-canvas) and "PLATFORM"'s A/T fused with a white airplane graphic in the
busy map background -- a threshold+trace picks up the plane as part of the
letterforms (confirmed visually: wordmark_mask_raw.png). So per the task's
documented fallback, the wordmark was re-typeset in Archivo Black (900) and
condensed (scaleX + explicit word-gap) to match the promo's measured geometry
(width:cap 9.7:1, word-space 0.54 cap -- see docs/superpowers/proto/2026-08-26-brand-assets.md).
This script traces that clean render (not the promo) to SVG.
"""
import sys, os, subprocess, tempfile
sys.path.insert(0, os.path.dirname(__file__))
import numpy as np
from PIL import Image
from vectorize import clean_mask, mask_to_path_d_cv, bbox_of_mask, write_svg, OUT

REPO = r"F:\Land-XI 플랫폼\01. 디자인"
TOOLS = os.path.dirname(__file__)

# Geometry tuned by iterative render+measure against the promo's own metrics
# (see docs/superpowers/proto/2026-08-26-brand-assets.md): Archivo Black 900,
# scaleX 0.745 + an explicit word-gap, converging on width:cap 9.70:1 and
# word-space:cap 0.545 against the promo's measured 9.7:1 / 0.54.
FAMILY, WEIGHT, LETTER_SPACING_EM, GAP_PX, SCALE_X, FONT_SIZE_PX = (
    "Archivo Black", 900, 0, 296, 0.745, 800,
)

with tempfile.TemporaryDirectory() as td:
    src = os.path.join(td, "wm_render.png")
    subprocess.run(
        ["node", os.path.join(TOOLS, "render-wordmark.mjs"), src, FAMILY, str(WEIGHT),
         str(LETTER_SPACING_EM), str(GAP_PX), str(SCALE_X), str(FONT_SIZE_PX)],
        check=True, cwd=REPO,
    )
    arr = np.array(Image.open(src).convert("L"))

mask = arr > 128
mask = clean_mask(mask, min_area=20, close_k=2)

x0, y0, x1, y1 = bbox_of_mask(mask)
pad = 6
x0 = max(0, x0 - pad); y0 = max(0, y0 - pad)
x1 = min(mask.shape[1], x1 + pad); y1 = min(mask.shape[0], y1 + pad)
crop = mask[y0:y1, x0:x1]

d = mask_to_path_d_cv(crop, epsilon_frac=0.0015, curve_thresh_deg=52)

vb_w, vb_h = x1 - x0, y1 - y0
write_svg([(d, "#FFFFFF")], vb_w, vb_h, os.path.join(OUT, "landxi-wordmark.svg"))
write_svg([(d, "#010102")], vb_w, vb_h, os.path.join(OUT, "landxi-wordmark-dark.svg"))
print("viewBox", vb_w, vb_h)
