"""설계 10차(lx-staff) — K-4 갈림길 그림: V-World 배경 지도(공개 타일) 위에 시군구 경계와 '직접 그린 범위'(예시)를 올린다.
  mock/img/vw/z11-<x>-<y>.png : V-World 배경 지도 타일(xdworld.vworld.kr 2d/Base — 공개 서비스, 제한 영상 아님) 3×2 장
  mock/vmap.json              : 타일 배치 · 남원시 경계(행정경계 server/seed/sgg-simplified.geojson)를 타일 화소 좌표로 바꾼 path · 예시로 그린 범위
좌표는 화면에 쓰지 않는다(그림만). 사용: python docs/superpowers/final/process/design-r10/lx-staff/make-map.py
korea-k3.svg · korea-k4*.svg · shape-*.svg 는 design-r9/lx-staff 의 것을 그대로 복사해 쓴다.
"""
import json
import math
import os
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', '..', '..'))
SRC = os.path.join(ROOT, 'server', 'seed', 'sgg-simplified.geojson')
MOCK = os.path.join(HERE, 'mock')
VW = os.path.join(MOCK, 'img', 'vw')
Z = 11
TX, TY = (1747, 1749), (807, 808)          # 남원시 둘레(3×2 장)
CODE, NAME = '52190', '남원시'
NEIGH = {'52130': '정읍시', '52710': '완주군', '52770': '순창군', '52790': '임실군', '48870': '함양군', '46730': '구례군', '46770': '곡성군'}


def px(lon, lat):
    n = 256 * (2 ** Z)
    x = (lon + 180) / 360 * n
    la = math.radians(lat)
    y = (1 - math.log(math.tan(la) + 1 / math.cos(la)) / math.pi) / 2 * n
    return x - TX[0] * 256, y - TY[0] * 256


def path_of(geom, tol=1.2):
    polys = [geom['coordinates']] if geom['type'] == 'Polygon' else geom['coordinates']
    d = []
    for poly in polys:
        pts, last = [], None
        for lon, lat in poly[0]:
            x, y = px(lon, lat)
            if last is None or abs(x - last[0]) + abs(y - last[1]) >= tol:
                pts.append((x, y)); last = (x, y)
        if len(pts) >= 4:
            d.append('M' + ' '.join(f'{x:.1f} {y:.1f}' for x, y in pts) + 'Z')
    return ''.join(d)


def centroid(geom):
    polys = [geom['coordinates']] if geom['type'] == 'Polygon' else geom['coordinates']
    pts = [px(lon, lat) for poly in polys for lon, lat in poly[0]]
    return sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)


def main():
    os.makedirs(VW, exist_ok=True)
    tiles = []
    for x in range(TX[0], TX[1] + 1):
        for y in range(TY[0], TY[1] + 1):
            fn = f'z{Z}-{x}-{y}.png'
            p = os.path.join(VW, fn)
            if not os.path.exists(p):
                urllib.request.urlretrieve(f'https://xdworld.vworld.kr/2d/Base/service/{Z}/{x}/{y}.png', p)
            tiles.append({'x': (x - TX[0]) * 256, 'y': (y - TY[0]) * 256, 'src': f'img/vw/{fn}'})
    g = json.load(open(SRC, encoding='utf-8'))
    by = {f['properties']['sgg_cd']: f for f in g['features']}
    nw = by[CODE]
    cx, cy = centroid(nw['geometry'])
    # 예시로 그린 범위 — 남원시 안 운봉읍 쪽 다각형(그림용 · 실제 값 아님)
    draw = [(127.52, 35.44), (127.56, 35.45), (127.585, 35.425), (127.575, 35.395), (127.535, 35.39), (127.515, 35.41)]
    draw_d = 'M' + ' '.join('%.1f %.1f' % px(lon, lat) for lon, lat in draw) + 'Z'
    out = {
        'z': Z, 'w': (TX[1] - TX[0] + 1) * 256, 'h': (TY[1] - TY[0] + 1) * 256, 'tiles': tiles,
        'pick': {'code': CODE, 'name': NAME, 'd': path_of(nw['geometry']), 'cx': round(cx, 1), 'cy': round(cy, 1)},
        'neigh': [{'code': c, 'name': n, 'd': path_of(by[c]['geometry']), 'cx': round(centroid(by[c]['geometry'])[0], 1), 'cy': round(centroid(by[c]['geometry'])[1], 1)} for c, n in NEIGH.items() if c in by],
        'draw': {'d': draw_d, 'label': '직접 그린 범위(예시)'},
    }
    json.dump(out, open(os.path.join(MOCK, 'vmap.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    print('타일', len(tiles), '장 · 남원 중심', round(cx), round(cy), '· 이웃', len(out['neigh']))


if __name__ == '__main__':
    main()
