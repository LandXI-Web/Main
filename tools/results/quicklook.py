# -*- coding: utf-8 -*-
"""결과 GeoJSON 퀵룩 PNG (PIL 렌더 — 이 환경의 matplotlib Agg 는 savefig 시 크래시)."""
import os, math
import geopandas as gpd
from shapely.geometry import box
from PIL import Image, ImageDraw, ImageFont

REPO = r"F:\Land-XI 플랫폼\01. 디자인"
G = os.path.join(REPO, "landxi", "assets", "data", "geo")
R = os.path.join(G, "results")
SH = os.path.join(REPO, "shots", "results")
os.makedirs(SH, exist_ok=True)

PAL = ["#2ec27e", "#f5c211", "#3584e4", "#e01b24", "#c061cb", "#ff7800", "#26a269", "#b5835a"]
BG, PANEL, LINE, TXT = (15, 18, 22), (21, 26, 32), (58, 67, 78), (233, 237, 242)
AOI = (127.3481, 35.5276, 127.3567, 35.5347)
W = 1100

def font(sz):
    for f in ("malgun.ttf", "C:/Windows/Fonts/malgun.ttf", "arial.ttf"):
        try: return ImageFont.truetype(f, sz)
        except Exception: pass
    return ImageFont.load_default()

SIGU = gpd.read_file(os.path.join(G, "sigungu.geojson"))

SETS = [
    ("namwon-farmland-2025", "남원 농지이용 2025 (드론) · 필지 단위", True),
    ("namwon-greenhouse-2025", "남원 비닐하우스 2025 (드론) · 필지 단위", True),
    ("yeosu-marine-2025-aerial", "여수 해양쓰레기 2025 (항공) · 탐지 객체", False),
    ("yeosu-marine-2026-drone", "여수 해양쓰레기 2026 (드론) · 탐지 객체", False),
]

for fid, title, show_aoi in SETS:
    g = gpd.read_file(os.path.join(R, fid + ".geojson"))
    b = list(g.total_bounds)
    if show_aoi:
        b = [min(b[0], AOI[0]), min(b[1], AOI[1]), max(b[2], AOI[2]), max(b[3], AOI[3])]
    padx = (b[2] - b[0]) * 0.05; pady = (b[3] - b[1]) * 0.05
    b = [b[0] - padx, b[1] - pady, b[2] + padx, b[3] + pady]
    lat = (b[1] + b[3]) / 2
    kx = 1.0 / math.cos(math.radians(lat))          # 위도 보정
    top = 56                                        # 제목 영역
    H = int(top + W * (b[3] - b[1]) * kx / (b[2] - b[0]))
    H = max(H, 420)
    sx = W / (b[2] - b[0]); sy = (H - top) / (b[3] - b[1])

    def P(x, y): return (( x - b[0]) * sx, top + (b[3] - y) * sy)

    img = Image.new("RGB", (W, H), BG)
    dr = ImageDraw.Draw(img, "RGBA")
    dr.rectangle([0, top, W, H], fill=PANEL)

    pad = max(b[2] - b[0], b[3] - b[1]) * 0.5
    for geom in SIGU.cx[b[0] - pad:b[2] + pad, b[1] - pad:b[3] + pad].geometry:
        for poly in (geom.geoms if geom.geom_type == "MultiPolygon" else [geom]):
            dr.line([P(*c) for c in poly.exterior.coords], fill=LINE, width=1)

    classes = list(g["cls"].value_counts().index)
    col = {c: PAL[i % len(PAL)] for i, c in enumerate(classes)}
    minpx = 2.0
    for cls, geom in zip(g["cls"], g.geometry):
        c = col[cls]
        for poly in (geom.geoms if geom.geom_type == "MultiPolygon" else [geom]):
            pts = [P(*xy) for xy in poly.exterior.coords]
            if len(pts) < 3: continue
            xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
            if max(xs) - min(xs) < minpx and max(ys) - min(ys) < minpx:
                cx, cy = (max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2
                dr.ellipse([cx - 2, cy - 2, cx + 2, cy + 2], fill=c)
            else:
                dr.polygon(pts, fill=c, outline=c)

    if show_aoi:
        x0, y0 = P(AOI[0], AOI[3]); x1, y1 = P(AOI[2], AOI[1])
        dr.rectangle([x0 - 3, y0 - 3, x1 + 3, y1 + 3], outline=(255, 45, 85), width=3)
        dr.text((x0 - 3, y0 - 20), "정사영상 AOI", font=font(14), fill=(255, 45, 85))

    f14, f13 = font(15), font(13)
    dr.text((14, 16), "%s — %d건" % (title, len(g)), font=f14, fill=TXT)
    dr.text((W - 250, 20), "bbox %.3f,%.3f ~ %.3f,%.3f" % tuple(g.total_bounds), font=font(11), fill=(123, 135, 148))
    ly = H - 14 - 20 * len(classes)
    dr.rectangle([10, ly - 10, 300, H - 8], fill=(15, 18, 22, 220), outline=LINE)
    for i, c in enumerate(classes):
        y = ly + i * 20
        dr.rectangle([20, y + 3, 32, y + 15], fill=col[c])
        dr.text((40, y), "%s  %d" % (c, int((g["cls"] == c).sum())), font=f13, fill=TXT)
    p = os.path.join(SH, fid + ".png")
    img.save(p)
    print("wrote", p, os.path.getsize(p), img.size)
