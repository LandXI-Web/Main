"""Crop-drop side by side at z13: imagery | old rule | new rule (from drop_diag npz).  python -I drop_sbs.py <npz> <name> <outdir>"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import numpy as np
from PIL import Image
import sbs  # noqa  (uses its esri(), label(), block())

npz, name, out = np.load(sys.argv[1]), sys.argv[2], Path(sys.argv[3])
tx0, ty0, tx1, ty1 = [int(v) for v in npz["meta"]]
cur, strict = npz["cur"], npz["strict"]
H, W = cur.shape
# densest 48x32 z11-pixel window (= 3x2 z13 tiles) by old-rule drop count
k = 64
best, bv = None, -1
for y in range(0, H - 128 + 1, 16):
    for x in range(0, W - 192 + 1, 16):
        v = cur[y:y + 128, x:x + 192].sum()
        if v > bv:
            best, bv = (x, y), v
# align to z13 tile boundaries: one z13 tile = 64 z11 px
gx, gy = tx0 * 256 + best[0], ty0 * 256 + best[1]
X13, Y13 = gx // 64, gy // 64
px0, py0 = X13 * 64 - tx0 * 256, Y13 * 64 - ty0 * 256
RED = (240, 68, 82)


def paint(m):
    sub = m[py0:py0 + 128, px0:px0 + 192]
    big = np.repeat(np.repeat(sub, 4, axis=0), 4, axis=1)
    rgba = np.zeros(big.shape + (4,), np.uint8)
    rgba[big] = (*RED, 225)
    return Image.fromarray(rgba, "RGBA")


base = sbs.block(sbs.esri, 13, X13, Y13, 3, 2, "RGB")
o = Image.alpha_composite(base.convert("RGBA"), paint(cur)).convert("RGB")
n = Image.alpha_composite(base.convert("RGBA"), paint(strict)).convert("RGB")
Wd, Hd = base.size
img = Image.new("RGB", (Wd * 3 + 32, Hd), (255, 255, 255))
img.paste(sbs.label(base.copy(), "Reference imagery"), (0, 0))
img.paste(sbs.label(o, f"Before rule: {int(cur[py0:py0+128, px0:px0+192].sum())} cells"), (Wd + 16, 0))
img.paste(sbs.label(n, f"After rule: {int(strict[py0:py0+128, px0:px0+192].sum())} cells"), (2 * Wd + 32, 0))
img.save(out / f"drop-{name.lower()}-z13.png", optimize=True)
print(out / f"drop-{name.lower()}-z13.png", X13, Y13)
