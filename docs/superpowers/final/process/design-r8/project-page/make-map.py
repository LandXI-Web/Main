"""프로젝트 한 장 시안의 작은 지도 — 행정경계(server/seed/sgg-simplified.geojson · 시군구 252)에서 mock/korea-pp.svg 를 만든다.
대상 시군구(HI)는 초록(AI 결과 색)으로 칠하고 이름표를 단다. 좌표는 화면에 쓰지 않는다(그림만).
사용: python docs/superpowers/final/process/design-r8/project-page/make-map.py
"""
import json
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', '..', '..'))
SRC = os.path.join(ROOT, 'server', 'seed', 'sgg-simplified.geojson')
OUT = os.path.join(HERE, 'mock', 'korea-pp.svg')

# 대상 시군구(비닐하우스 2026 — 서버 프로젝트 응답의 regions) · 이름표 자리(점 → 글자, 그림 좌표)
HI = {'43745': ('증평군', (157, 120), (176, 104), 'start'),
      '48870': ('함양군', (163, 199), (186, 190), 'start'),
      '52190': ('남원시', (146, 207), (116, 226), 'end')}
LON0, LAT1, K = 124.6, 38.65, 64.0
CX = math.cos(math.radians(36.0))


def P(lon, lat):
    return (lon - LON0) * K * CX, (LAT1 - lat) * K


def ring(coords, tol):
    out, last = [], None
    for lon, lat in coords:
        x, y = P(lon, lat)
        if last is None or abs(x - last[0]) + abs(y - last[1]) >= tol:
            out.append((x, y)); last = (x, y)
    return out


def path_of(geom):
    polys = [geom['coordinates']] if geom['type'] == 'Polygon' else geom['coordinates']
    d = []
    for poly in polys:
        for i, r in enumerate(poly):
            pts = ring(r, 1.6 if i == 0 else 2.5)
            if len(pts) >= 4:
                d.append('M' + ' '.join(f'{x:.1f} {y:.1f}' for x, y in pts) + 'Z')
    return ''.join(d)


def main():
    g = json.load(open(SRC, encoding='utf-8'))
    base, hi = [], []
    for f in g['features']:
        d = path_of(f['geometry'])
        if not d:
            continue
        (hi if f['properties']['sgg_cd'] in HI else base).append(d)
    style = ("<style>.b{fill:#E6E9ED;stroke:#fff;stroke-width:.7;stroke-linejoin:round}.h{fill:#0FA9A0;stroke:#fff;stroke-width:.9}"
             ".ld{stroke:#1C1F25;stroke-width:1.1;fill:none}.lb{font:600 12px Pretendard,'Noto Sans KR',sans-serif;fill:#1C1F25;"
             "paint-order:stroke;stroke:#fff;stroke-width:3px;stroke-linejoin:round}.dt{fill:#1C1F25;stroke:#fff;stroke-width:1.2}</style>")
    out = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="44 56 296 246" width="296" height="246" aria-hidden="true">', style, '<g>']
    out += [f'<path class="b" d="{d}"/>' for d in base]
    out += [f'<path class="h" d="{d}"/>' for d in hi]
    for name, (ax, ay), (lx, ly), anc in HI.values():
        dx = 3 if anc == 'start' else -3
        out.append(f'<line class="ld" x1="{ax}" y1="{ay}" x2="{lx}" y2="{ly}"/>')
        out.append(f'<circle class="dt" cx="{ax}" cy="{ay}" r="2.6"/>')
        out.append(f'<text class="lb" x="{lx + dx}" y="{ly + 4}" text-anchor="{anc}">{name}</text>')
    out.append('</g></svg>')
    open(OUT, 'w', encoding='utf-8').write('\n'.join(out))
    print('지도', OUT, os.path.getsize(OUT), '바이트 · 시군구', len(base) + len(hi))


if __name__ == '__main__':
    main()
