# -*- coding: utf-8 -*-
"""게스트 메인 공개 자료 빌드 — S-4 · S-6 · S-7 · S-3 공개 응답과 같은 모양의 정적 사본(서버 공개 API 가 열리면 화면은 서버를 먼저 읽는다).

실행: conda env gcs 의 python (GPU 사용 0 · 네트워크: V-World 공개 위성 타일만)
  E:/…/envs/gcs/python.exe landxi/v3/main/tools/build-data.py [--token lxs_…]

산출(landxi/v3/main/data/):
  public-stats.json     GET /public/stats?set=river-occupy&by=sigungu 모양 — 전국 하천구역 건물 점유(시군구 집계 + 경계)
  sample-parcel.json    GET /public/sample-parcel 모양 — 익명 필지 카드 1(대장 × AI · 지번 마스킹)
  agent-scene.json      융합 질문 장면(읍면동 집계만 · 필지 위치 0)
  public-deploys.json   GET /registry/cards?public=1 + /deploys?public=1 모양 — 실결과 있는 배포본만(시험 배포 제외)
  crop-*.webp           서비스 카드 크롭(V-World 위성 + 실제 AI 결과 겹침)
"""
import csv, json, math, io, re, sys, argparse, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]            # 01. 디자인
DATA = ROOT.parent / '02. 데이터'
OUT = Path(__file__).resolve().parents[1] / 'data'
OUT.mkdir(exist_ok=True)
RIVER_CSV = Path('E:/행안부/03. 분석결과_v2/_처리결과.csv')
SGG = ROOT / 'landxi/assets/data/geo/sigungu.geojson'
EMD = ROOT / 'landxi/assets/data/geo/namwon-emd.geojson'
RES = ROOT / 'landxi/assets/data/geo'

SHORT = {'강원특별자치도': '강원', '경기도': '경기', '경상남도': '경남', '경상북도': '경북', '광주광역시': '광주', '대구광역시': '대구',
         '대전광역시': '대전', '부산광역시': '부산', '서울특별시': '서울', '세종특별자치시': '세종', '울산광역시': '울산', '인천광역시': '인천',
         '전라남도': '전남', '전북특별자치도': '전북', '제주특별자치도': '제주', '충청남도': '충남', '충청북도': '충북'}


def rnd(c, n=4):
    if isinstance(c[0], (int, float)):
        return [round(c[0], n), round(c[1], n)]
    return [rnd(x, n) for x in c]


def ring_centroid(coords):
    pts = []
    def walk(c):
        if isinstance(c[0], (int, float)): pts.append(c)
        else: [walk(x) for x in c]
    walk(coords)
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    return [(min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2], [min(xs), min(ys), max(xs), max(ys)]


# ── 1. 전국 하천구역 건물 점유(S-4) ──────────────────────────
def build_stats():
    rows = list(csv.DictReader(open(RIVER_CSV, encoding='utf-8-sig')))
    as_of = '2026-04-12'   # _처리결과.csv 처리 완료일(파일 수정 시각)
    g = json.load(open(SGG, encoding='utf-8'))
    by_key = {}
    for r in rows:
        sd, *nm = r['시군구'].split('_')
        by_key.setdefault((sd, ''.join(nm)), 0)
        by_key[(sd, ''.join(nm))] += int(r['건물수'])
    feats, used = [], set()
    for f in g['features']:
        p = f['properties']; sd = SHORT[p['sido']]; nm = p['name']
        v = 0; hit = False
        for (k_sd, k_nm), n in by_key.items():
            # 같은 시도 + 이름 일치 · 통합시(부천시 · 전주시)는 구 합산 · 편입(군위군)은 이름만
            if (k_nm == nm and (k_sd == sd or nm == '군위군')) or (k_sd == sd and k_nm.startswith(nm) and k_nm != nm and nm.endswith('시') and not any(ff['properties']['name'] == k_nm for ff in g['features'])):
                v += n; hit = True; used.add((k_sd, k_nm))
        c, bb = ring_centroid(f['geometry']['coordinates'])
        feats.append({'type': 'Feature', 'properties': {'sgg_cd': p['code'], 'name': nm, 'sido': SHORT[p['sido']], 'value': v if hit else None, 'lat': round(c[1], 3)},
                      'geometry': {'type': f['geometry']['type'], 'coordinates': rnd(f['geometry']['coordinates'], 4)}})
    miss = [k for k in by_key if k not in used]
    total = sum(int(r['건물수']) for r in rows)
    mapped = sum(f['properties']['value'] or 0 for f in feats)
    print('stats: rows', len(rows), 'total', total, 'mapped', mapped, 'unmatched', miss)
    vals = sorted(v for v in (f['properties']['value'] for f in feats) if v)
    q = [vals[int(len(vals) * t)] for t in (0.2, 0.4, 0.6, 0.8)]
    top = max(feats, key=lambda f: f['properties']['value'] or 0)['properties']
    env = {'value': total, 'unit': 'count', 'basis': 'measured', 'source': '하천구역 건물 점유 분석', 'as_of': as_of}
    out = {'set': 'river-occupy', 'by': 'sigungu', 'export_policy': 'public', 'as_of': as_of,
           'total': env, 'n_sgg': {'value': len(rows), 'unit': 'count', 'basis': 'measured', 'source': '하천구역 건물 점유 분석', 'as_of': as_of},
           'breaks': q, 'top': {'name': top['name'], 'sido': top['sido'], 'value': top['value']},
           'geojson': {'type': 'FeatureCollection', 'features': feats}}
    json.dump(out, open(OUT / 'public-stats.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))


# ── 2. 익명 필지 카드(S-4 sample-parcel) ──────────────────────
def build_parcel():
    import geopandas as gpd
    from shapely.geometry import mapping, box
    S = gpd.read_file(DATA / 'survey/namwon-parcel-survey.gpkg', layer='suspects', engine='pyogrio')
    c = S[(S.rule == 'R1') & (S.priority == 'A') & S.jimok.isin(['답', '전']) & S.evid_m2.between(90, 260) & (S.conf >= 0.8) & S.parcel_m2.between(700, 2600)]
    c = c.sort_values('score', ascending=False)
    print('parcel candidates', len(c))
    row = c.iloc[0]
    P = gpd.read_file(DATA / 'survey/namwon-parcels.gpkg', layer='parcels', engine='pyogrio', where=f"pnu = '{row.pnu}'")
    par = P.iloc[0]
    minx, miny, maxx, maxy = par.geometry.bounds
    A = gpd.read_file(DATA / 'results/namwon-landcover-2023.geojson', engine='pyogrio', bbox=(minx - .0004, miny - .0004, maxx + .0004, maxy + .0004))
    ids = set(str(row.ai_ids).replace(' ', '').split(',')) if row.ai_ids else set()
    A_in = A[A['id'].isin(ids)] if ids else A[A.geometry.intersects(par.geometry)]
    A_near = A[(A.cls == '건물')]
    emd_full = str(row.addr)
    m = re.match(r'^(\S+)\s+(\S+)\s+(\S+)(?:\s+(\S+리))?', emd_full)
    place = ' '.join(x for x in (m.groups() if m else []) if x)
    place = place.replace('전북특별자치도', '전북')
    area = lambda g: round(float(gpd.GeoSeries([g], crs=4326).to_crs(5186).area.iloc[0]), 1)
    evid = round(float(row.evid_m2), 1)
    out = {
        'place': place,                                    # 리 까지만(지번 없음)
        'pnu_masked': row.pnu[:10] + '-****-****',
        'ledger': {'jimok': row.jimok, 'area': {'value': round(float(row.parcel_m2)), 'unit': '㎡', 'basis': 'recorded', 'source': 'V-World 연속지적도', 'as_of': '2026-09-24'},
                   'yongdo': row.yongdo or None},
        'ai': {'cls': '건물', 'area': {'value': evid, 'unit': '㎡', 'basis': 'inferred', 'source': '2023년 25cm 항공영상 AI 판독', 'as_of': '2026-09-24'},
               'n': int(len(A_in)), 'year': 2023},
        'verdict': '현장 확인 필요',
        'bbox': [round(x, 6) for x in (minx, miny, maxx, maxy)],
        'parcel': {'type': 'Feature', 'properties': {}, 'geometry': json.loads(json.dumps(mapping(par.geometry)))},
        'ai_fc': {'type': 'FeatureCollection', 'features': [{'type': 'Feature', 'properties': {'in': True}, 'geometry': json.loads(json.dumps(mapping(g)))} for g in A_in.geometry]
                  + [{'type': 'Feature', 'properties': {'in': False}, 'geometry': json.loads(json.dumps(mapping(g)))} for g in A_near[~A_near['id'].isin(ids)].geometry]},
    }
    out['parcel']['geometry']['coordinates'] = rnd(out['parcel']['geometry']['coordinates'], 7)
    for f in out['ai_fc']['features']: f['geometry']['coordinates'] = rnd(f['geometry']['coordinates'], 7)
    print('parcel', place, row.jimok, row.parcel_m2, evid, len(A_in), len(out['ai_fc']['features']))
    json.dump(out, open(OUT / 'sample-parcel.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))


# ── 3. 융합 질문 장면(읍면동 집계만) ──────────────────────────
def build_agent():
    s = json.load(open(DATA / 'survey/namwon-parcel-emd-summary.json', encoding='utf-8'))
    g = json.load(open(EMD, encoding='utf-8'))
    feats = []
    for f in g['features']:
        nm = f['properties']['nm']; e = s['by_emd'].get(nm)
        v = e['suspects']['R1'] if e else 0
        feats.append({'type': 'Feature', 'properties': {'nm': nm, 'v': v}, 'geometry': {'type': f['geometry']['type'], 'coordinates': rnd(f['geometry']['coordinates'], 4)}})
    p0 = g['features'][0]['properties']
    vals = sorted(f['properties']['v'] for f in feats)
    total = s['totals']['by_rule']['R1']
    out = {'region': f"{SHORT.get(p0['sido'], p0['sido'])} {p0['sgg']}", 'ask': '대장상 농지인데 AI가 건물로 본 필지',
           'answer': {'value': total, 'unit': 'parcels', 'basis': 'inferred', 'source': '기관 행정 대장 × AI 판독', 'as_of': s['generated'][:10]},
           'max': vals[-1], 'geojson': {'type': 'FeatureCollection', 'features': feats}}
    print('agent', out['region'], total)
    json.dump(out, open(OUT / 'agent-scene.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))


# ── 4. 공개 배포본(S-6 · S-7 ?public=1) ──────────────────────
def build_deploys(token):
    def get(p):
        rq = urllib.request.Request('http://127.0.0.1:8700/api/v1' + p, headers={'Authorization': 'Bearer ' + token})
        return json.load(urllib.request.urlopen(rq, timeout=10))
    cards = get('/registry/cards')
    deps = get('/deploys')
    test = lambda d: re.search(r'-test(-\d+)?$', d['id']) or re.search(r'\(테스트\)|\btest\b', d.get('name') or '', re.I)
    live = [d for d in deps['items'] if not test(d)]
    items = []
    for d in live:
        c, bb = ring_centroid(d['aoi']['coordinates']) if d.get('aoi') else (None, None)
        items.append({'id': d['id'], 'card_id': d['card_id'], 'stage': d['stage'], 'tenant_id': d.get('tenant_id'), 'region_name': d.get('region_name'),
                      'scale': d.get('scale'), 'updated_at': d.get('updated_at'), 'center': rnd(c, 4) if c else None, 'bbox': [round(x, 4) for x in bb] if bb else None})
    used = {d['card_id'] for d in items if d.get('scale')}
    cs = [{'id': c['id'], 'name': c['name'], 'status': c['status'], 'scope': c.get('scope')} for c in cards['items'] if c['id'] in used]
    out = {'as_of': deps.get('as_of') or cards.get('as_of'), 'cards': cs, 'deploys': items}
    print('deploys', len(items), 'cards', [c['name'] for c in cs])
    json.dump(out, open(OUT / 'public-deploys.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))


# ── 5. 서비스 카드 크롭(V-World 위성 + 실제 결과) ───────────────
def tile_xy(lon, lat, z):
    n = 2 ** z; x = (lon + 180) / 360 * n
    y = (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n
    return x, y


def crop(name, fc_path, z, W=900, H=600, pick=None):
    from PIL import Image, ImageDraw
    fc = json.load(open(fc_path, encoding='utf-8'))
    feats = fc['features']
    # 결과가 가장 촘촘한 칸을 중심으로
    cells = {}
    for f in feats:
        c, _ = ring_centroid(f['geometry']['coordinates'])
        x, y = tile_xy(c[0], c[1], z)
        k = (int(x * 256 // (W * .8)), int(y * 256 // (H * .8)))
        cells.setdefault(k, []).append((x, y))
    k = max(cells, key=lambda k: len(cells[k])) if not pick else pick
    pts = cells[k]
    cx = sum(p[0] for p in pts) / len(pts) * 256; cy = sum(p[1] for p in pts) / len(pts) * 256
    x0, y0 = int(cx - W / 2), int(cy - H / 2)
    img = Image.new('RGB', (W, H), (242, 244, 246))
    for tx in range(x0 // 256, (x0 + W) // 256 + 1):
        for ty in range(y0 // 256, (y0 + H) // 256 + 1):
            url = f'https://xdworld.vworld.kr/2d/Satellite/service/{z}/{tx}/{ty}.jpeg'
            try:
                b = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=15).read()
                img.paste(Image.open(io.BytesIO(b)).convert('RGB'), (tx * 256 - x0, ty * 256 - y0))
            except Exception as e:
                print('tile miss', url, e)
    ov = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(ov)
    def polys(g):
        if g['type'] == 'Polygon': return [g['coordinates']]
        if g['type'] == 'MultiPolygon': return g['coordinates']
        return []
    for f in feats:
        for p in polys(f['geometry']):
            ring = [((tile_xy(lon, lat, z)[0] * 256 - x0), (tile_xy(lon, lat, z)[1] * 256 - y0)) for lon, lat in p[0]]
            if all(-50 < a < W + 50 and -50 < b < H + 50 for a, b in ring[:1]) and len(ring) > 2:
                d.polygon(ring, fill=(15, 169, 160, 70), outline=(15, 169, 160, 255))
    img = Image.alpha_composite(img.convert('RGBA'), ov).convert('RGB')
    img.save(OUT / f'crop-{name}.webp', 'WEBP', quality=82)
    print('crop', name, len(pts))


if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('--token'); ap.add_argument('--only')
    a = ap.parse_args()
    steps = (a.only or 'stats,parcel,agent,deploys,crops').split(',')
    if 'stats' in steps: build_stats()
    if 'parcel' in steps: build_parcel()
    if 'agent' in steps: build_agent()
    if 'deploys' in steps and a.token: build_deploys(a.token)
    if 'crops' in steps:
        crop('card-farm', RES / 'results/namwon-farmland-2025.geojson', 16)
        crop('card-marine', RES / 'results/yeosu-marine-2025-aerial-grid100.geojson', 16)
        crop('card-change', RES / 'namwon-change.geojson', 17)
