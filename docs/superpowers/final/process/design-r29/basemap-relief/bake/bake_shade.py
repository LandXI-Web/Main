"""정사 바탕용 입체 겹침 조각 굽기 — CPU 만(numpy · scipy · rasterio). 사용: python bake_shade.py namwon|bishkek
흰 모형 판(bake.py)과 같은 자료 · 같은 해(북서 315° · 35°)로 '어둡게 하는 양'만 알파로 굽는다.
 - 지형 층 terrain: 해를 등진 비탈 어둡게(평지 0) → z13–16
 - 지형 밝힘 층 light: 해를 받는 비탈 살짝 밝게(흰 색 + 알파) → z13–16 · 짙은 숲 위에서도 산 모양이 읽히게
 - 건물 층 bldg: 건물 둘레 은은한 음영 + 아주 옅은 그림자(정사에 실제 그림자가 있어 이중 그림자 방지) → z13–18
조각 = RGBA WebP(검은 회청 + 알파). 검은 색을 알파 a 로 얹으면 결과 = 바탕 × (1 − a) → 곱하기(multiply)와 같다.
강도(약 · 중 · 강)는 시안에서 층 불투명도로 바꾼다.
"""
import os, sys, math, time, json
sys.path.insert(0, os.path.dirname(__file__))
import numpy as np, geopandas as gpd, rasterio
from rasterio.warp import reproject, Resampling
from rasterio.transform import from_origin
from rasterio.features import rasterize
from scipy.ndimage import gaussian_filter, zoom
from PIL import Image
import bake as B

C_INK = (18, 24, 34)          # 그림자 색(아주 어두운 회청)
A_TERRAIN_MAX = 0.70
A_LIGHT_MAX = 0.30          # 지형 음영 최대 어둡게(강 = 불투명도 1)
A_BLDG_MAX = 0.50

def layers(cfg, data, tx0, ty0, nx, ny, z, want_terrain=True):
    W, H = nx * 256, ny * 256
    ox, oy, ts = B.tile_origin(tx0, ty0, z); px = ts / 256
    tr = from_origin(ox, oy, px, px)
    lat_c = (cfg["bbox"][1] + cfg["bbox"][3]) / 2
    gm = px * math.cos(math.radians(lat_c))
    out = {}
    if want_terrain:
        dem = np.zeros((H // 8 + 2, W // 8 + 2), np.float32)
        with rasterio.open(B.ROOT + "src/" + cfg["dem"]) as d:
            reproject(rasterio.band(d, 1), dem, dst_transform=from_origin(ox, oy, px * 8, px * 8), dst_crs="EPSG:3857", resampling=Resampling.cubic)
        dem = gaussian_filter(dem, max(1.0, 45.0 / (gm * 8))) * 1.6
        gy, gx = np.gradient(dem, gm * 8)
        slope = np.arctan(np.hypot(gx, gy)); aspect = np.arctan2(gy, -gx)
        az, zen = math.radians(360 - B.SUN_AZ + 90), math.radians(45)
        hs = np.cos(zen) * np.cos(slope) + np.sin(zen) * np.sin(slope) * np.cos(az - aspect)
        wgt = np.clip((np.degrees(slope) - 2.0) / 8.0, 0, 1)
        d = (hs - math.cos(zen)) * wgt
        out["terrain"] = zoom(np.clip(-d * 1.8, 0, 1) ** 0.8 * A_TERRAIN_MAX, 8, order=1)[:H, :W]   # 해를 등진 비탈
        out["light"] = zoom(np.clip(d * 1.8, 0, 1) ** 0.8 * A_LIGHT_MAX, 8, order=1)[:H, :W]       # 해를 받는 비탈
    b = data["b"]; order = np.argsort(b["h"].values)
    geoms = [(g, float(h)) for g, h in zip(b.geometry.values[order], b["h"].values[order]) if g is not None and not g.is_empty]
    hm = rasterize(geoms, out_shape=(H, W), transform=tr, fill=0, dtype="float32") if geoms else np.zeros((H, W), np.float32)
    bm = hm > 0; hpx = hm / gm
    lx, ly = math.sin(math.radians(B.SUN_AZ)), -math.cos(math.radians(B.SUN_AZ))
    tanA = math.tan(math.radians(B.SUN_ALT))
    occ = np.zeros_like(hpx)
    steps = int(hpx.max() / tanA) + 2 if hpx.max() > 0 else 0
    for s in range(1, steps):
        dx, dy = int(round(s * lx)), int(round(s * ly))
        src = hpx[max(0, dy):H + min(0, dy), max(0, dx):W + min(0, dx)] - s * tanA
        dst = occ[max(0, -dy):H + min(0, -dy), max(0, -dx):W + min(0, -dx)]
        np.maximum(dst, src, out=dst)
    shadow = gaussian_filter((occ > hpx + 0.3).astype(np.float32), max(1.2, 1.5 / gm))   # 더 무르게(정사 그림자와 겹쳐도 경계가 안 보이게)
    hn = np.minimum(hm, 9.0) / 9.0                                     # 낮은 집(1–2층)도 둘레 음영이 보이게
    ao = gaussian_filter(hn, 3.0 / gm) * 1.1 + gaussian_filter(hn, 10.0 / gm) * 0.35
    a = np.clip(ao, 0, 1) * 0.85 + shadow * 0.22                         # 둘레 음영 위주 · 그림자는 아주 옅게
    a = np.where(bm, 0, a)                                               # 지붕 위는 0(정사 지붕 그대로)
    out["bldg"] = np.clip(a, 0, 1) * A_BLDG_MAX
    print(f"  layers z{z} {W}x{H} steps={steps}", flush=True)
    return out

def cut(alpha, tx0, ty0, z, out_dir, zooms, ink=C_INK):
    rgba = np.zeros(alpha.shape + (4,), np.uint8); rgba[..., :3] = ink
    rgba[..., 3] = np.clip(alpha * 255 + 0.5, 0, 255).astype(np.uint8)
    im = Image.fromarray(rgba, "RGBA"); n = 0
    for zz in zooms:
        f = 2 ** (z - zz)
        cur = im.resize((im.width // f, im.height // f), Image.LANCZOS) if f > 1 else im
        bx, by = tx0 // f, ty0 // f
        for j in range(cur.height // 256):
            for i in range(cur.width // 256):
                p = f"{out_dir}/{zz}/{bx+i}"; os.makedirs(p, exist_ok=True)
                cur.crop((i * 256, j * 256, i * 256 + 256, j * 256 + 256)).save(f"{p}/{by+j}.webp", "WEBP", quality=88, alpha_quality=90, method=4)
                n += 1
    return n

def main(city):
    cfg = B.CITY[city]; t0 = time.time()
    w, s, e, n = cfg["bbox"]
    b = gpd.read_file(B.ROOT + "src/" + cfg["bld"]).to_crs(4326)
    b = b[b.geometry.notna() & b.geometry.is_valid]
    b["h"], _ = B.heights(city, b); b = b.to_crs(3857)
    data = dict(b=b)
    out = B.ROOT + "pub/tiles/" + city + "-shade"
    x0, y0 = B.lonlat2tile(w, n, 13); x1, y1 = B.lonlat2tile(e, s, 13)
    X0, Y0, NX, NY = int(x0), int(y0), int(x1) - int(x0) + 1, int(y1) - int(y0) + 1
    L = layers(cfg, data, X0 * 8, Y0 * 8, NX * 8, NY * 8, 16)
    c = cut(L["terrain"], X0 * 8, Y0 * 8, 16, out + "/terrain", [16, 15, 14, 13])
    c += cut(L["light"], X0 * 8, Y0 * 8, 16, out + "/light", [16, 15, 14, 13], ink=(255, 253, 246))
    c += cut(L["bldg"], X0 * 8, Y0 * 8, 16, out + "/bldg", [16, 15, 14, 13]); del L
    x0, y0 = B.lonlat2tile(w, n, 16); x1, y1 = B.lonlat2tile(e, s, 16)
    X0, Y0, NX, NY = int(x0), int(y0), int(x1) - int(x0) + 1, int(y1) - int(y0) + 1
    band = 6
    for yy in range(Y0, Y0 + NY, band):
        nb = min(band, Y0 + NY - yy); pad = 1 if yy > Y0 else 0
        L = layers(cfg, data, X0 * 4, (yy - pad) * 4, NX * 4, (nb + pad + 1) * 4, 18, want_terrain=False)
        c += cut(L["bldg"][pad * 1024: pad * 1024 + nb * 1024], X0 * 4, yy * 4, 18, out + "/bldg", [18, 17]); del L
    meta = dict(city=city, layers=dict(terrain=[13, 16], light=[13, 16], bldg=[13, 18]), max_alpha=dict(terrain=A_TERRAIN_MAX, light=A_LIGHT_MAX, bldg=A_BLDG_MAX),
                sun=dict(azimuth=B.SUN_AZ, altitude=B.SUN_ALT), tiles=c, baked_at=time.strftime("%Y-%m-%dT%H:%M:%S+09:00"), seconds=round(time.time() - t0))
    json.dump(meta, open(out + "/meta.json", "w", encoding="utf8"), ensure_ascii=False, indent=1)
    print(meta, flush=True)

if __name__ == "__main__":
    main(sys.argv[1])
