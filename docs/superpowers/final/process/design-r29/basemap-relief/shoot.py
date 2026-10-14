"""설계 29차 · XI맵 입체 베이스 시안 촬영 — 바깥 주소(또는 --local = 로컬 관문 :4180) PC 1440×900. 시안은 정적 조각만 읽어 로그인 없음 · GPU 0.
사용: python shoot.py [--local] [--ortho]  (--ortho = 정사 바탕 판만 찍고 log-shots-ortho.json 에 기록)"""
import json, os, sys, datetime
from playwright.sync_api import sync_playwright
sys.stdout.reconfigure(encoding='utf-8')
ROOT = "E:/Land-XI 플랫폼/01. 디자인"
ORIGIN = 'http://127.0.0.1:4180' if '--local' in sys.argv else 'https://app.land-xi.dev'
MOCK = ORIGIN + '/landxi/proto/review/mock/basemap-relief/index.html'
OUT = os.path.join(ROOT, 'docs/superpowers/final/process/design-r29/basemap-relief')
SHOTS = os.path.join(OUT, 'shots'); os.makedirs(SHOTS, exist_ok=True)
ARGS_GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
SCENES = [
    ('namwon-relief-z140', '?city=namwon&base=relief&ai=0&z=14.0', '남원 · 새 베이스(도심 + 둘레 산)'),
    ('namwon-relief-z166', '?city=namwon&base=relief&ai=0&z=16.6&c=127.3905,35.4105', '남원 · 새 베이스 가까이(건물 그림자 · 둘레 음영)'),
    ('namwon-ai-z166', '?city=namwon&base=relief&z=16.6&c=127.3905,35.4105', '남원 · 새 베이스 + AI 결과(건물 · 경작지 · 비닐하우스 · 주차장)'),
    ('namwon-ai-z140', '?city=namwon&base=relief&z=14.0', '남원 · 새 베이스 + AI 결과(넓게)'),
    ('namwon-now-z166', '?city=namwon&base=now&z=16.6&c=127.3905,35.4105', '남원 · 지금 XI맵 베이스(브이월드 영상) + AI 결과 — 비교'),
    ('bishkek-relief-z140', '?city=bishkek&base=relief&ai=0&z=14.0', '비슈케크 · 새 베이스'),
    ('bishkek-relief-z166', '?city=bishkek&base=relief&ai=0&z=16.6&c=74.6040,42.8760', '비슈케크 · 새 베이스 가까이'),
    ('bishkek-ai-z150', '?city=bishkek&base=relief&z=15.0&c=74.5800,42.8920', '비슈케크 · 새 베이스 + AI 결과(2017→2025 새로 생긴 시가지 · 경작지)'),
    ('bishkek-now-z150', '?city=bishkek&base=now&z=15.0&c=74.5800,42.8920', '비슈케크 · 지금 XI맵 베이스(Sentinel-2 영상 · z13 이상은 확대만) + AI 결과 — 비교'),
]
NC, BC = '&c=127.3905,35.4105', '&c=74.6040,42.8760'
SCENES_ORTHO = [
    ('namwon-ortho-z150', '?city=namwon&base=ortho&shade=0&ai=0&z=15.0', '남원 · 정사만(국토지리정보원 · 브이월드 영상)'),
    ('namwon-shade1-z150', '?city=namwon&base=ortho&shade=1&ai=0&z=15.0', '남원 · 정사 + 입체 약'),
    ('namwon-shade2-z150', '?city=namwon&base=ortho&shade=2&ai=0&z=15.0', '남원 · 정사 + 입체 중'),
    ('namwon-shade3-z150', '?city=namwon&base=ortho&shade=3&ai=0&z=15.0', '남원 · 정사 + 입체 강'),
    ('namwon-ortho-z170', '?city=namwon&base=ortho&shade=0&ai=0&z=17.0' + NC, '남원 가까이 · 정사만'),
    ('namwon-shade2-z170', '?city=namwon&base=ortho&shade=2&ai=0&z=17.0' + NC, '남원 가까이 · 정사 + 입체 중(건물 둘레 음영)'),
    ('namwon-shade3-z170', '?city=namwon&base=ortho&shade=3&ai=0&z=17.0' + NC, '남원 가까이 · 정사 + 입체 강'),
    ('namwon-shade2-ai-z166', '?city=namwon&base=ortho&shade=2&z=16.6' + NC, '남원 · 정사 + 입체 중 + AI 결과'),
    ('bishkek-ortho-z140', '?city=bishkek&base=ortho&shade=0&ai=0&z=14.0', '비슈케크 · 정사만(Sentinel-2 2025-08-27 · 10 m)'),
    ('bishkek-shade1-z140', '?city=bishkek&base=ortho&shade=1&ai=0&z=14.0', '비슈케크 · 정사 + 입체 약'),
    ('bishkek-shade2-z140', '?city=bishkek&base=ortho&shade=2&ai=0&z=14.0', '비슈케크 · 정사 + 입체 중'),
    ('bishkek-shade3-z140', '?city=bishkek&base=ortho&shade=3&ai=0&z=14.0', '비슈케크 · 정사 + 입체 강'),
    ('bishkek-shade2-z166', '?city=bishkek&base=ortho&shade=2&ai=0&z=16.6' + BC, '비슈케크 가까이 · 정사 + 입체 중(10 m 영상 확대)'),
    ('bishkek-shade2-ai-z150', '?city=bishkek&base=ortho&shade=2&z=15.0&c=74.5800,42.8920', '비슈케크 · 정사 + 입체 중 + AI 결과(새로 생긴 시가지 · 경작지)'),
]
if '--ortho' in sys.argv: SCENES = SCENES_ORTHO
log = []
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS_GL)
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=1, locale='ko-KR')
    for name, qs, note in SCENES:
        pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
        pg.goto(MOCK + qs, wait_until='load', timeout=90000)
        pg.wait_for_selector('html[data-map-ready="1"]', timeout=150000)
        pg.wait_for_function("() => window.__map && window.__map.areTilesLoaded()", timeout=120000); pg.wait_for_timeout(2500)
        t = datetime.datetime.now(); f = f"{name}-1440-{t:%H%M}.png"
        pg.screenshot(path=os.path.join(SHOTS, f))
        log.append({'file': f, 'shot_at': t.isoformat(timespec='seconds'), 'url': MOCK + qs, 'viewport': [1440, 900], 'note': note, 'errors': errs})
        print('찍음', f, errs or '이상 없음'); pg.close()
    b.close()
json.dump(log, open(os.path.join(OUT, 'log-shots-ortho.json' if '--ortho' in sys.argv else 'log-shots.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
