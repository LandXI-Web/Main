import sys, pathlib
from PIL import Image, ImageDraw, ImageFont
fs = sorted(pathlib.Path("out").glob("*.webp")); f = ImageFont.truetype("C:/Windows/Fonts/malgunbd.ttf", 18)
tw, th = 480, 320; cols = 4; rows = (len(fs) + cols - 1) // cols
s = Image.new("RGB", (cols * tw, rows * (th + 26)), "white"); d = ImageDraw.Draw(s)
for i, p in enumerate(fs):
    im = Image.open(p).crop((0, 50, 1200, 850)).resize((tw - 6, th - 4))   # 갤러리 3:2 상자에 맞춘 모습
    x, y = (i % cols) * tw, (i // cols) * (th + 26)
    s.paste(im, (x + 3, y + 24)); d.text((x + 4, y + 2), p.stem, font=f, fill="black")
s.save(sys.argv[1] if len(sys.argv) > 1 else "all.jpg", quality=85)
