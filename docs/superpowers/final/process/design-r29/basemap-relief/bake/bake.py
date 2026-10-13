"""입체 베이스(흰 모형 톤) 굽기 — CPU 만(numpy · scipy · rasterio · GDAL). 사용: python bake.py namwon|bishkek
바로 위에서 본 평면 지도에 건물 그림자 · 건물 둘레 음영 · 지형 음영을 구워 XYZ WebP 조각(z13–18)으로 낸다.
"""
import os, sys, json, math, time
os.environ.setdefault("GDAL_DATA", r"C:\Users\User\anaconda3\envs\gcs\Library\share\gdal")
import numpy as np, geopandas as gpd, rasterio
from rasterio.features import rasterize
from rasterio.warp import reproject, Resampling
from rasterio.transform import from_origin
from scipy.ndimage import gaussian_filter, binary_erosion, zoom
from shapely.geometry import LineString, Polygon, box
from shapely.ops import polygonize, unary_union
from PIL import Image

ROOT = "E:/Land-XI 플랫폼/02. 데이터/basemap-relief/"
R = 6378137.0; ORIG = math.pi * R
CITY = {
    "namwon":  dict(bbox=(127.357, 35.386, 127.423, 35.440), dem="namwon-cop30.tif", osm="namwon-osm.json", bld="namwon-vw-spbd.geojson"),
    "bishkek": dict(bbox=(74.567, 42.849, 74.641, 42.903), dem="bishkek-cop30.tif", osm="bishkek-osm.json", bld="bishkek-overture-buildings.geojson"),
}
# 빛(지도 관례 — 북서에서) · 태양 고도 35° → 그림자 길이 = 높이 × 1.43
SUN_AZ, SUN_ALT = 315.0, 35.0
# 흰 모형 톤(디자인 법전 밝은 회백)
C_GROUND = np.array([236, 238, 241], np.float32)
C_ROAD   = np.array([250, 251, 252], np.float32)
C_WATER  = np.array([218, 227, 235], np.float32)
C_ROOF   = np.array([253, 253, 254], np.float32)
C_SHADE  = np.array([150, 160, 174], np.float32)   # 그림자 · 음영이 끌려가는 차가운 회청

def lonlat2tile(lon, lat, z):
    n = 2 ** z; x = (lon + 180) / 360 * n
    y = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
    return x, y

def tile_origin(x, y, z):
    s = 2 * ORIG / 2 ** z
    return -ORIG + x * s, ORIG - y * s, s

ROAD_W = {"motorway": 20, "trunk": 18, "primary": 14, "secondary": 11, "tertiary": 9, "unclassified": 6, "residential": 6,
          "living_street": 5, "service": 4, "pedestrian": 4, "track": 3, "footway": 1.6, "path": 1.4, "cycleway": 2, "steps": 1.6}
WATER_W = {"river": 30, "canal": 10, "stream": 4, "ditch": 2, "drain": 2}

def load_osm(path):
    j = json.load(open(path, encoding="utf8"))
    roads, rivers, waters = [], [], []
    for e in j["elements"]:
        t = e.get("tags", {})
        if e["type"] == "way" and "geometry" in e:
            co = [(p["lon"], p["lat"]) for p in e["geometry"]]
            if len(co) < 2: continue
            if "highway" in t and t["highway"] in ROAD_W: roads.append((LineString(co), ROAD_W[t["highway"]]))
            elif t.get("waterway") in WATER_W: rivers.append((LineString(co), WATER_W[t["waterway"]]))
            if (t.get("natural") == "water" or t.get("landuse") == "reservoir" or t.get("waterway") == "riverbank") and co[0] == co[-1] and len(co) > 3:
                waters.append(Polygon(co))
        elif e["type"] == "relation" and t.get("natural") == "water":
            ls = [LineString([(p["lon"], p["lat"]) for p in m["geometry"]]) for m in e.get("members", []) if m.get("role") == "outer" and m.get("geometry")]
            waters += list(polygonize(unary_union(ls))) if ls else []
    return roads, rivers, waters

def heights(city, g):
    """건물 높이(m). 국내 = 지상층수 × 3.3 + 1. 해외 = 높이 → 층수 × 3.2 → 없으면 면적 · 용도 추정(README 규칙)."""
    if city == "namwon":
        f = g["gro_flo_co"].apply(lambda v: int(v) if str(v).isdigit() and int(v) > 0 else 1)
        return (f * 3.3 + 1.0).clip(3, 120).values, f.values
    area = g.to_crs(32643).area.values
    h = np.where(area < 100, 4.0, np.where(area < 250, 6.5, np.where(area < 700, 10.0, np.where(area < 2500, 16.0, 13.0))))
    cls = g["class"].fillna("").values
    h = np.where(np.isin(cls, ["house", "detached", "garage", "shed", "hut"]), np.minimum(h, 6.5), h)
    h = np.where((cls == "apartments") & (area > 500), np.maximum(h, 16.0), h)
    nf = g["num_floors"].values.astype(float)
    h = np.where(np.isfinite(nf) & (nf > 0), nf * 3.2 + 1.0, h)
    hh = g["height"].values.astype(float)
    h = np.where(np.isfinite(hh) & (hh > 0), hh, h)
    return np.clip(h, 3, 150), None

def render(city, cfg, data, tx0, ty0, nx, ny, z):
    """타일 범위(z 기준 tx0..tx0+nx, ty0..ty0+ny)를 z 해상도로 그린다 → RGB uint8"""
    W, H = nx * 256, ny * 256
    ox, oy, ts = tile_origin(tx0, ty0, z); px = ts / 256
    tr = from_origin(ox, oy, px, px)
    lat_c = (cfg["bbox"][1] + cfg["bbox"][3]) / 2
    gm = px * math.cos(math.radians(lat_c))           # 한 화소의 실제 땅 길이(m)
    k = 1 / math.cos(math.radians(lat_c))              # 땅 m → 메르카토르 m
    t0 = time.time()
    # 지형
    dem = np.zeros((H // 8 + 2, W // 8 + 2), np.float32)
    with rasterio.open(ROOT + "src/" + cfg["dem"]) as d:
        reproject(rasterio.band(d, 1), dem, dst_transform=from_origin(ox, oy, px * 8, px * 8), dst_crs="EPSG:3857", resampling=Resampling.cubic)
    dem = gaussian_filter(dem, max(1.0, 45.0 / (gm * 8))) * 1.6   # 30 m 표고를 땅 45 m 폭으로 매끈하게(줌과 무관하게 같은 모양) · 은은한 과장 1.6
    gy, gx = np.gradient(dem, gm * 8)
    slope = np.arctan(np.hypot(gx, gy)); aspect = np.arctan2(gy, -gx)
    az, zen = math.radians(360 - SUN_AZ + 90), math.radians(45)
    hs = np.cos(zen) * np.cos(slope) + np.sin(zen) * np.sin(slope) * np.cos(az - aspect)
    # 평지(시가지)의 표고 잡음(30 m 표면 모델의 건물 · 나무)은 지우고 산만 음영 — 경사 2°→10° 사이에서 서서히
    wgt = np.clip((np.degrees(slope) - 2.0) / 8.0, 0, 1)
    hill = np.clip(1 + 0.65 * (hs - math.cos(zen)) * wgt, 0.66, 1.10)
    hill = zoom(hill, 8, order=1)[:H, :W]
    # 벡터 → 화소
    def burn(geoms, val=1, dtype="uint8"):
        geoms = [(g, v) for g, v in geoms if g is not None and not g.is_empty]
        return rasterize(geoms, out_shape=(H, W), transform=tr, fill=0, dtype=dtype, all_touched=False) if geoms else np.zeros((H, W), dtype)
    road = burn([(g, 1) for g in data["roads"]])
    water = burn([(g, 1) for g in data["water"]])
    b = data["b"]
    order = np.argsort(b["h"].values)
    hm = burn([(g, float(h)) for g, h in zip(b.geometry.values[order], b["h"].values[order])], dtype="float32")
    bm = hm > 0
    hpx = hm / gm                                      # 높이를 화소 단위로
    # 그림자 — 빛 쪽으로 걸어가며 '가리는 높이'의 최대
    lx, ly = math.sin(math.radians(SUN_AZ)), -math.cos(math.radians(SUN_AZ))
    tanA = math.tan(math.radians(SUN_ALT))
    occ = np.zeros_like(hpx)
    steps = int(hpx.max() / tanA) + 2 if hpx.max() > 0 else 0
    for s in range(1, steps):
        dx, dy = int(round(s * lx)), int(round(s * ly))
        src = hpx[max(0, dy):H + min(0, dy), max(0, dx):W + min(0, dx)] - s * tanA
        dst = occ[max(0, -dy):H + min(0, -dy), max(0, -dx):W + min(0, -dx)]
        np.maximum(dst, src, out=dst)
    shadow = (occ > hpx + 0.3).astype(np.float32)
    shadow = gaussian_filter(shadow, max(0.6, 0.5 / gm))  # 반그림자
    # 건물 둘레 음영(AO 느낌) — 땅에만
    hn = np.minimum(hm, 12.0) / 12.0
    ao = gaussian_filter(hn, 2.5 / gm) * 0.8 + gaussian_filter(hn, 8.0 / gm) * 0.35
    ao = np.where(bm, 0, np.clip(ao, 0, 1))
    edge = bm & ~binary_erosion(bm, iterations=1) if gm < 1.2 else np.zeros_like(bm)
    # 칠하기
    base = np.empty((H, W, 3), np.float32); base[:] = C_GROUND
    base[road > 0] = C_ROAD; base[water > 0] = C_WATER
    base = base * hill[..., None]
    roof = C_ROOF * (0.97 + 0.03 * np.clip(hill, 0.9, 1.05))[..., None]
    base = np.where(bm[..., None], roof, base)
    base = np.where(edge[..., None], base * 0.86, base)
    t_sh = (shadow * np.where(bm, 0.55, 0.62))[..., None]   # 지붕 위 그림자는 조금 옅게
    t_ao = (ao * 0.42)[..., None]
    t = np.clip(t_sh + t_ao * (1 - t_sh), 0, 0.75)
    out = base * (1 - t) + C_SHADE * t * (base / 255.0) * 1.12
    print(f"  render z{z} {W}x{H} steps={steps} {time.time()-t0:.0f}s", flush=True)
    return np.clip(out, 0, 255).astype(np.uint8)

def cut(img, tx0, ty0, z, out_dir, zooms):
    """이 그림에서 z 조각과 아래 줌들(2배씩 줄여)을 자른다"""
    n = 0
    im = Image.fromarray(img)
    for zz in zooms:
        f = 2 ** (z - zz)
        if f > 1: cur = im.resize((im.width // f, im.height // f), Image.LANCZOS)
        else: cur = im
        bx, by = tx0 // f, ty0 // f
        for j in range(cur.height // 256):
            for i in range(cur.width // 256):
                p = f"{out_dir}/{zz}/{bx+i}"; os.makedirs(p, exist_ok=True)
                cur.crop((i * 256, j * 256, i * 256 + 256, j * 256 + 256)).save(f"{p}/{by+j}.webp", "WEBP", quality=86, method=4)
                n += 1
    return n

def main(city):
    cfg = CITY[city]; t0 = time.time()
    w, s, e, n = cfg["bbox"]
    b = gpd.read_file(ROOT + "src/" + cfg["bld"]).to_crs(4326)
    b = b[b.geometry.notna() & b.geometry.is_valid]
    b["h"], fl = heights(city, b)
    b = b.to_crs(3857)
    roads, rivers, waters = load_osm(ROOT + "src/" + cfg["osm"])
    lat_c = (s + n) / 2; k = 1 / math.cos(math.radians(lat_c))
    def buf(items):
        gs = gpd.GeoSeries([g for g, _ in items], crs=4326).to_crs(3857)
        return [g.buffer(wd * k / 2, cap_style=2) for g, (_, wd) in zip(gs, items)]
    data = dict(b=b, roads=buf(roads), water=buf(rivers) + list(gpd.GeoSeries(waters, crs=4326).to_crs(3857)))
    print(city, "buildings", len(b), "roads", len(roads), "water", len(rivers) + len(waters), "h max", float(b["h"].max()), flush=True)
    out = ROOT + "pub/tiles/" + city
    # 1) 넓은 판 — z13 조각 단위로 범위를 덮고 z16 해상도로 → z13–16
    x0, y0 = lonlat2tile(w, n, 13); x1, y1 = lonlat2tile(e, s, 13)
    X0, Y0, NX, NY = int(x0), int(y0), int(x1) - int(x0) + 1, int(y1) - int(y0) + 1
    img = render(city, cfg, data, X0 * 8, Y0 * 8, NX * 8, NY * 8, 16)
    c1 = cut(img, X0 * 8, Y0 * 8, 16, out, [16, 15, 14, 13]); del img
    # 2) 가까운 판 — 범위를 z16 조각 단위로 맞춰 z18 해상도로 → z17–18 (가로 띠로 나눠 굽기)
    x0, y0 = lonlat2tile(w, n, 16); x1, y1 = lonlat2tile(e, s, 16)
    X0, Y0, NX, NY = int(x0), int(y0), int(x1) - int(x0) + 1, int(y1) - int(y0) + 1
    c2 = 0; band = 6
    for yy in range(Y0, Y0 + NY, band):
        nb = min(band, Y0 + NY - yy)
        # 띠 위아래로 1 조각(z16) 더 그려 그림자 · 음영이 띠 경계에서 끊기지 않게
        pad = 1 if yy > Y0 else 0
        img = render(city, cfg, data, X0 * 4, (yy - pad) * 4, NX * 4, (nb + pad + 1) * 4, 18)
        img = img[pad * 1024: pad * 1024 + nb * 1024]
        c2 += cut(img, X0 * 4, yy * 4, 18, out, [18, 17]); del img
    meta = dict(city=city, bbox=cfg["bbox"], minzoom=13, maxzoom=18, sun=dict(azimuth=SUN_AZ, altitude=SUN_ALT), tiles=c1 + c2,
                buildings=int(len(b)), baked_at=time.strftime("%Y-%m-%dT%H:%M:%S+09:00"), seconds=round(time.time() - t0))
    json.dump(meta, open(out + "/meta.json", "w", encoding="utf8"), ensure_ascii=False, indent=1)
    print(meta, flush=True)

if __name__ == "__main__":
    main(sys.argv[1])
