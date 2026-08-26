import sys, os
sys.path.insert(0, os.path.dirname(__file__))
import numpy as np
from vectorize import load_upscaled, clean_mask, mask_to_path_d_cv, bbox_of_mask, write_svg, OUT

SCALE = 2
arr = load_upscaled("brand-tagline-2x.png", scale=SCALE)
arr16 = arr.astype(np.int16)
h, w, _ = arr16.shape

border = np.concatenate([
    arr16[:6*SCALE, :, :].reshape(-1, 3), arr16[-6*SCALE:, :, :].reshape(-1, 3),
    arr16[:, :6*SCALE, :].reshape(-1, 3), arr16[:, -6*SCALE:, :].reshape(-1, 3),
])
bg = np.median(border, axis=0)
dist = np.linalg.norm(arr16 - bg[None, None, :], axis=2)
fg = dist > 35

min_area = 600  # drops stray UI-icon fragment specks (area ~80-300px) near frame edges
mask = clean_mask(fg, min_area=min_area, close_k=2)

x0, y0, x1, y1 = bbox_of_mask(mask)
pad = 6
x0 = max(0, x0 - pad); y0 = max(0, y0 - pad)
x1 = min(w, x1 + pad); y1 = min(h, y1 + pad)
crop = mask[y0:y1, x0:x1]

MINT = "#2FC49B"
d = mask_to_path_d_cv(crop, epsilon_frac=0.0025, curve_thresh_deg=58)

vb_w, vb_h = x1 - x0, y1 - y0
write_svg([(d, MINT)], vb_w, vb_h, os.path.join(OUT, "tagline.svg"))
print("viewBox", vb_w, vb_h)
