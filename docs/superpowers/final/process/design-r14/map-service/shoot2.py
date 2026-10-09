"""설계 14차(map-service) 2차 시안 촬영 — mock/view2.html 을 개발 서버(:4173)로 열어 PC 1440 으로 찍는다(실제 지도 · 게이트웨이 타일).
로그인은 서버 로그인 API(test@lx.or.kr · 비밀번호는 server/.env DEV_PASSWORD)로 받은 세션을 브라우저 저장소에 넣는다 — 세션 주입이 아니라 같은 로그인 길.
사용: python docs/superpowers/final/process/design-r14/map-service/shoot2.py [이름 일부...]   GPU 0 · 서버 수정 0.
"""
import json, os, re, sys, urllib.request
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from shoot import CHECK_JS, FORBID, SHOTS  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..', '..', '..'))
BASE = 'http://127.0.0.1:4173/docs/superpowers/final/process/design-r14/map-service/mock/view2.html'
PC = (1440, 900)
LIST = [
    ('?v=map2&base=img&z=all', 'new2-mapsvc-img-all-1440.png', False),
    ('?v=map2&base=img&z=unbong', 'new2-mapsvc-img-unbong-1440.png', False),
    ('?v=map2&base=cad&z=unbong', 'new2-mapsvc-cadastre-1440.png', False),
    ('?v=map2&base=img&z=close', 'new2-mapsvc-img-close-1440.png', False),
    ('?v=flow2', 'new2-flow2-imagery-1440.png', True),
    ('?v=list2&n=8&w=a&d=a', 'new2-list2-all-1440.png', True),
    ('?v=list2&n=8&w=a&d=a&f=drone', 'new2-list2-drone-1440.png', True),
    ('?v=list2&n=8&w=b&d=a', 'new2-list2-td-b-1440.png', True),
    ('?v=list2&n=8&w=c&d=a', 'new2-list2-td-c-1440.png', True),
    ('?v=list2&n=8&w=a&d=b', 'new2-list2-desc-b-1440.png', True),
]

def login():
    pw = os.environ.get('LX_PW') or os.environ.get('DEV_PASSWORD')
    if not pw:
        env = open(os.path.join(ROOT, 'server', '.env'), encoding='utf-8').read()
        pw = re.search(r'^DEV_PASSWORD=(.*)$', env, re.M).group(1).strip().strip('"')
    r = urllib.request.Request('http://127.0.0.1:8700/api/v1/auth/login', data=json.dumps({'login': 'test@lx.or.kr', 'password': pw, 'realm': 'lx'}).encode(),
                               headers={'content-type': 'application/json', 'x-lx-site': 'app'}, method='POST')
    return json.load(urllib.request.urlopen(r, timeout=20))

def shoot(only):
    os.makedirs(SHOTS, exist_ok=True)
    sess = login()
    init = f"try{{localStorage.setItem('lx_api_session', {json.dumps(json.dumps(sess))}); localStorage.setItem('lx_api_base','http://127.0.0.1:8700')}}catch(e){{}}"
    bad = 0
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        ctx = b.new_context(viewport={'width': PC[0], 'height': PC[1]}, device_scale_factor=1)
        ctx.add_init_script(init)
        for qs, out, full in LIST:
            if only and not any(o in qs or o in out for o in only):
                continue
            pg = ctx.new_page()
            errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)[:120]))
            pg.goto(BASE + qs)
            try: pg.wait_for_selector('html[data-map-ready="1"]', timeout=90000)
            except Exception: errs.append('지도 준비 시간 초과')
            pg.wait_for_timeout(800)
            pg.screenshot(path=os.path.join(SHOTS, out), full_page=full)
            m = pg.evaluate(CHECK_JS)
            hits = sorted({k for k, rx in FORBID if rx.search(m['text'])})
            flags = []
            if m['overflowX']: flags.append('가로 넘침')
            if m['clipped']: flags.append('잘린 글 ' + ' / '.join(m['clipped'][:4]))
            if m['orphans']: flags.append('한 단어 줄 ' + ' / '.join(m['orphans'][:6]))
            if m['imgBroken']: flags.append('깨진 그림 ' + ' / '.join(m['imgBroken'][:4]))
            if hits: flags.append('금지어 ' + ','.join(hits))
            if errs: flags.append('오류 ' + ' / '.join(errs[:3]))
            if flags: bad += 1
            print(f"찍음 {out}  세로 {m['height']} · 첫 뷰 글자 {m['chars']} · {' · '.join(flags) or '이상 없음'}")
            pg.close()
        b.close()
    print('이상 있는 캡처:', bad)

if __name__ == '__main__':
    shoot(sys.argv[1:])
