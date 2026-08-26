import sys, os
sys.path.insert(0, os.path.dirname(__file__))
import numpy as np
import cv2
from vectorize import load_upscaled, clean_mask, mask_to_path_d_cv, bbox_of_mask, write_svg, OUT

SCALE = 2
arr = load_upscaled("brand-lx-lockup-4x.png", scale=SCALE)  # RGB uint8
arr16 = arr.astype(np.int16)
h, w, _ = arr16.shape

border = np.concatenate([
    arr16[:8*SCALE, :, :].reshape(-1, 3), arr16[-8*SCALE:, :, :].reshape(-1, 3),
    arr16[:, :8*SCALE, :].reshape(-1, 3), arr16[:, -8*SCALE:, :].reshape(-1, 3),
])
bg = np.median(border, axis=0)
dist = np.linalg.norm(arr16 - bg[None, None, :], axis=2)
fg = dist > 40

hsv = cv2.cvtColor(arr, cv2.COLOR_RGB2HSV)
hue = hsv[:, :, 0].astype(np.int16)

green_raw = fg & (hue >= 35) & (hue <= 95)
navy_raw = fg & ~green_raw

min_area = 80 * (SCALE * SCALE)  # scale-adjusted speckle floor
green_mask = clean_mask(green_raw, min_area=min_area, close_k=3)
navy_mask = clean_mask(navy_raw, min_area=min_area, close_k=3)

# tight combined viewBox
combo = green_mask | navy_mask
x0, y0, x1, y1 = bbox_of_mask(combo)
pad = 4
x0 = max(0, x0 - pad); y0 = max(0, y0 - pad)
x1 = min(w, x1 + pad); y1 = min(h, y1 + pad)

MINT = "#1FBF8F"
NAVY = "#0F2A4A"

def cropped_path(mask):
    crop = mask[y0:y1, x0:x1]
    return mask_to_path_d_cv(crop, epsilon_frac=0.0022, curve_thresh_deg=60)

green_d = cropped_path(green_mask)
navy_d = cropped_path(navy_mask)

vb_w, vb_h = x1 - x0, y1 - y0
write_svg([(navy_d, NAVY), (green_d, MINT)], vb_w, vb_h, os.path.join(OUT, "lx-lockup.svg"))
print("viewBox", vb_w, vb_h)
print("wrote", os.path.join(OUT, "lx-lockup.svg"))
