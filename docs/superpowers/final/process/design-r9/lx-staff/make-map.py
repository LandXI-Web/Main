"""설계 9차(lx-staff) 시안의 지도 그림 — 행정경계(server/seed/sgg-simplified.geojson · 시군구 252)에서 SVG 를 만든다.
  mock/korea-k4.svg      : 고른 영상 3장의 자리(풋프린트 상자) + 그 자리가 떨어지는 시군구(증평군 · 함양군 · 남원시)를 색칠 — '지역은 영상에서 정해진다'
  mock/korea-k4-empty.svg: 아무것도 안 고른 상태(회백 전국만)
  mock/shape-<코드>.svg   : 영상 한 장의 자리 그림(그 시군구 모양 하나) — 아카이브 목록의 썸네일 자리(제한 영상은 그림 대신 자리로)
좌표는 화면에 쓰지 않는다(그림만). 사용: python docs/superpowers/final/process/design-r9/lx-staff/make-map.py
"""
import json
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', '..', '..'))
SRC = os.path.join(ROOT, 'server', 'seed', 'sgg-simplified.geojson')
MOCK = os.path.join(HERE, 'mock')

# 고른 영상 3장(서버 카탈로그 그대로) — 자리(bounds) · 떨어지는 시군구
PICK = [
    ('img-43745-2023-aerial', '43745', '증평군', [127.54, 36.72, 127.66, 36.86]),
    ('img-48870-2023-aerial', '48870', '함양군', [127.59, 35.32, 127.75, 35.77]),
    ('namwon-aoi-2504', '52190', '남원시', [127.35, 35.52, 127.36, 35.54]),
]
LABEL = {'43745': ((157, 120), (176, 104), 'start'), '48870': ((163, 199), (186, 190), 'start'), '52190': ((146, 207), (116, 226), 'end')}
# 아카이브 목록 썸네일(자리 그림)로 쓸 시군구
SHAPES = ['43745', '48870', '52190', '41670', '44133', '44180', '51130', '12730', '12740']
LON0, LAT1, K = 124.6, 38.65, 64.0
CX = math.cos(math.radians(36.0))
STYLE = ("<style>.b{fill:#E6E9ED;stroke:#fff;stroke-width:.7;stroke-linejoin:round}.h{fill:#0FA9A0;stroke:#fff;stroke-width:.9}"
         ".fp{fill:none;stroke:#006DF7;stroke-width:1.6;stroke-dasharray:3 2}"
         ".ld{stroke:#1C1F25;stroke-width:1.1;fill:none}.lb{font:600 12px Pretendard,'Noto Sans KR',sans-serif;fill:#1C1F25;"
         "paint-order:stroke;stroke:#fff;stroke-width:3px;stroke-linejoin:round}.dt{fill:#1C1F25;stroke:#fff;stroke-width:1.2}</style>")


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


def korea(feats, hi_codes, fps, labels, out_name):
    base, hi = [], []
    for f in feats:
        d = path_of(f['geometry'])
        if not d:
            continue
        (hi if f['properties']['sgg_cd'] in hi_codes else base).append(d)
    out = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="44 56 296 246" width="296" height="246" aria-hidden="true">', STYLE, '<g>']
    out += [f'<path class="b" d="{d}"/>' for d in base]
    out += [f'<path class="h" d="{d}"/>' for d in hi]
    for b in fps:
        x0, y0 = P(b[0], b[3]); x1, y1 = P(b[2], b[1])
        w, h = max(x1 - x0, 6), max(y1 - y0, 6)
        out.append(f'<rect class="fp" x="{x0:.1f}" y="{y0:.1f}" width="{w:.1f}" height="{h:.1f}" rx="1"/>')
    for name, (ax, ay), (lx, ly), anc in labels:
        dx = 3 if anc == 'start' else -3
        out.append(f'<line class="ld" x1="{ax}" y1="{ay}" x2="{lx}" y2="{ly}"/>')
        out.append(f'<circle class="dt" cx="{ax}" cy="{ay}" r="2.6"/>')
        out.append(f'<text class="lb" x="{lx + dx}" y="{ly + 4}" text-anchor="{anc}">{name}</text>')
    out.append('</g></svg>')
    p = os.path.join(MOCK, out_name)
    open(p, 'w', encoding='utf-8').write('\n'.join(out))
    print('지도', out_name, os.path.getsize(p), '바이트')


def shape(feat, code):
    """시군구 하나의 모양 — 96×72 상자에 맞춰 그린다(자리 그림)."""
    geom = feat['geometry']
    polys = [geom['coordinates']] if geom['type'] == 'Polygon' else geom['coordinates']
    pts_all = [P(lon, lat) for poly in polys for lon, lat in poly[0]]
    xs, ys = [p[0] for p in pts_all], [p[1] for p in pts_all]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    s = min(80 / max(x1 - x0, 1e-6), 56 / max(y1 - y0, 1e-6))
    ox, oy = 48 - (x0 + x1) / 2 * s, 36 - (y0 + y1) / 2 * s
    d = []
    for poly in polys:
        pts = [(x * s + ox, y * s + oy) for x, y in (P(lon, lat) for lon, lat in poly[0])]
        if len(pts) >= 4:
            d.append('M' + ' '.join(f'{x:.1f} {y:.1f}' for x, y in pts) + 'Z')
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 72" width="96" height="72" aria-hidden="true">'
           f'<rect width="96" height="72" fill="#F2F4F6"/><path d="{"".join(d)}" fill="#CFE9E7" stroke="#0FA9A0" stroke-width="1.2" stroke-linejoin="round"/></svg>')
    p = os.path.join(MOCK, f'shape-{code}.svg')
    open(p, 'w', encoding='utf-8').write(svg)


def main():
    g = json.load(open(SRC, encoding='utf-8'))
    feats = g['features']
    by = {f['properties']['sgg_cd']: f for f in feats}
    hi = {c for _, c, _, _ in PICK}
    labels = [(n, *LABEL[c]) for _, c, n, _ in PICK]
    korea(feats, hi, [b for _, _, _, b in PICK], labels, 'korea-k4.svg')
    korea(feats, set(), [], [], 'korea-k4-empty.svg')
    for c in SHAPES:
        if c in by:
            shape(by[c], c)
    print('자리 그림', len([c for c in SHAPES if c in by]), '장')


if __name__ == '__main__':
    main()
