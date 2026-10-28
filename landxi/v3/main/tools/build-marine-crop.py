# 메인 해양쓰레기 카드 그림(10-29 PM: 격자만 보여 무엇인지 모름 → 쓰레기 하나하나 도형) — 드론 2026 결과가 가장 모인 해안 · 브이월드 위성 z19 를 K배 키워 그 위에 주황 도형.
# 쓰기: python build-marine-crop.py yeosu-marine-2026-drone.geojson 19 0 crop-card-marine 1.7  (결과는 ../data/ 에)
import json, math, io, sys, urllib.request
from PIL import Image, ImageDraw
RES = r'E:/Land-XI 플랫폼/01. 디자인/landxi/assets/data/geo/results/'
src, z, minc, tag = sys.argv[1], int(sys.argv[2]), float(sys.argv[3]), sys.argv[4]
K = float(sys.argv[5]) if len(sys.argv) > 5 else 1.0
W, H = 900, 600
def txy(lon, lat):
    n = 2 ** z; x = (lon + 180) / 360 * n
    y = (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n
    return x * 256 * K, y * 256 * K
F = [f for f in json.load(open(RES + src, encoding='utf-8'))['features'] if (f['properties'].get('conf') or 0) >= minc]
def cen(f):
    g=f['geometry']; r = g['coordinates'][0] if g['type']=='Polygon' else g['coordinates'][0][0]; return sum(p[0] for p in r)/len(r), sum(p[1] for p in r)/len(r)
P = [txy(*cen(f)) for f in F]
# 창(900x600) 안에 가장 많이 들어오는 곳
best, bn = None, -1
for (x, y) in P:
    n = sum(1 for (a, b) in P if abs(a - x) < W * .35 and abs(b - y) < H * .35)
    if n > bn: bn, best = n, (x, y)
inwin = [(a, b) for (a, b) in P if abs(a - best[0]) < W * .35 and abs(b - best[1]) < H * .35]
cx = sum(a for a, _ in inwin) / len(inwin); cy = sum(b for _, b in inwin) / len(inwin)
x0, y0 = int(cx - W / 2), int(cy - H / 2)
img = Image.new('RGB', (W, H), (242, 244, 246))
T = 256 * K
for tx in range(int(x0 // T), int((x0 + W) // T) + 1):
    for ty in range(int(y0 // T), int((y0 + H) // T) + 1):
        url = f'https://xdworld.vworld.kr/2d/Satellite/service/{z}/{tx}/{ty}.jpeg'
        try:
            b = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=15).read()
            t = Image.open(io.BytesIO(b)).convert('RGB').resize((round(T) + 1, round(T) + 1), Image.LANCZOS); img.paste(t, (round(tx * T - x0), round(ty * T - y0)))
        except Exception as e: print('miss', url, e)
ov = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(ov)
cnt = 0
for f in F:
    g = f['geometry']; polys = [g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']
    for p in polys:
        ring = [(txy(lo, la)[0] - x0, txy(lo, la)[1] - y0) for lo, la in p[0]]
        if not any(0 <= a < W and 0 <= b < H for a, b in ring): continue
        cnt += 1
        d.polygon(ring, fill=(255, 122, 26, 110), outline=(255, 122, 26, 255), width=2)
img = Image.alpha_composite(img.convert('RGBA'), ov).convert('RGB')
img.save(__import__('pathlib').Path(__file__).parent.parent / 'data' / f'{tag}.webp', 'WEBP', quality=84)
print(tag, 'objects in frame', cnt, 'center', cx, cy)
