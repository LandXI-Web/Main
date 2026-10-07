"""설계 11차(lx-dashboard) 시안의 작은 전국 지도 — 행정경계(server/seed/sgg-simplified.geojson)에서 SVG 하나.
  mock/korea-mine.svg : 내 프로젝트의 서비스가 돌고 있는 시군구 7곳(10-07 서버 값)을 색칠 — 구 대시보드 '전국 판'의 자리를 작게 이어받은 그림.
좌표는 화면에 쓰지 않는다(그림만). 사용: python docs/superpowers/final/process/design-r11/lx-dashboard/make-map.py
투영 · 단순화는 설계 9차 make-map.py 와 같다(같은 모양이 나오게).
"""
import json
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', '..', '..'))
SRC = os.path.join(ROOT, 'server', 'seed', 'sgg-simplified.geojson')
MOCK = os.path.join(HERE, 'mock')

# 내 프로젝트 넷이 돌고 있는 시군구(서버 /projects 의 regions · 10-07 16:00)
MINE = ['43745', '48870', '52190', '51130', '41670', '44133', '44180']
LON0, LAT1, K = 124.6, 38.65, 64.0
CX = math.cos(math.radians(36.0))
STYLE = ("<style>.b{fill:#E6E9ED;stroke:#fff;stroke-width:.7;stroke-linejoin:round}.h{fill:#0FA9A0;stroke:#fff;stroke-width:.9}</style>")


def P(lon, lat):
    return (lon - LON0) * K * CX, (LAT1 - lat) * K


def ring(coords, tol):
    out, last = [], None
    for lon, lat in coords:
        x, y = P(lon, lat)
        if last is None or abs(x - last[0]) + abs(y - last[1]) >= tol:
            out.append((x, y)); last = (x, y)
    return out


def path_of(geom, tol=1.6):
    polys = [geom['coordinates']] if geom['type'] == 'Polygon' else geom['coordinates']
    d = []
    for poly in polys:
        for i, r in enumerate(poly):
            pts = ring(r, tol if i == 0 else tol + 0.9)
            if len(pts) >= 4:
                d.append('M' + ' '.join(f'{x:.1f} {y:.1f}' for x, y in pts) + 'Z')
    return ''.join(d)


def main():
    feats = json.load(open(SRC, encoding='utf-8'))['features']
    base, hi = [], []
    for f in feats:
        d = path_of(f['geometry'])
        if d:
            (hi if f['properties']['sgg_cd'] in MINE else base).append(d)
    out = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="44 56 296 246" width="296" height="246" aria-hidden="true">', STYLE, '<g>']
    out += [f'<path class="b" d="{d}"/>' for d in base]
    out += [f'<path class="h" d="{d}"/>' for d in hi]
    out.append('</g></svg>')
    p = os.path.join(MOCK, 'korea-mine.svg')
    open(p, 'w', encoding='utf-8').write('\n'.join(out))
    print('지도', p, os.path.getsize(p), '바이트 · 색칠', len(hi))


if __name__ == '__main__':
    main()
