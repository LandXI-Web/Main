"""설계 20차(ximap-board-2) 시안 촬영 — landxi/proto/review/mock/ximap-board-2/ 를 PC 1440 으로 찍는다(실제 결과 데이터 · '시안' 도장).
로그인은 시안 안의 로그인 폼에 test@lx.or.kr · server/.env DEV_PASSWORD 를 한 번만(같은 브라우저 문맥) — 세션 주입 없음. GPU 0 · 서버 수정 0.
사용: python shoot-mock.py [--local] [이름 일부...]   (--local = 이 PC 개발 서버로 미리 보기 · 그림은 SHOTS_DIR 로)
"""
import json, os, re, sys, datetime
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', '..', '..'))
LOCAL = '--local' in sys.argv
ORIGIN = 'http://127.0.0.1:4173' if LOCAL else 'https://app.land-xi.dev'
MOCK = ORIGIN + '/landxi/proto/review/mock/ximap-board-2/'
SHOTS = os.environ.get('SHOTS_DIR') if LOCAL else os.path.join(HERE, 'shots')
PC = (1440, 900)
LIST = [
    (MOCK + 'index.html?v=pick', 'c1-pick-imagery'),
    (MOCK + 'index.html?v=query&hold=11', 'c2-query-filling'),
    (MOCK + 'index.html?v=board', 'c3-board-korea'),
    (MOCK + 'index.html?v=label', 'c4-label-object'),
    (MOCK + 'index.html?v=vertex', 'c5-label-vertex'),
    (MOCK + 'index.html?v=done', 'c6-label-done'),
]


def pw_of():
    pw = os.environ.get('LX_PW') or os.environ.get('DEV_PASSWORD')
    if not pw:
        env = open(os.path.join(ROOT, 'server', '.env'), encoding='utf-8').read()
        pw = re.search(r'^DEV_PASSWORD=(.*)$', env, re.M).group(1).strip().strip('"')
    return pw


def shoot(only):
    os.makedirs(SHOTS, exist_ok=True)
    log = []
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        ctx = b.new_context(viewport={'width': PC[0], 'height': PC[1]}, device_scale_factor=1, locale='ko-KR')
        pg = ctx.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)[:160]))
        for url, name in LIST:
            if only and not any(o in url or o in name for o in only):
                continue
            errs.clear()
            pg.goto(url)
            try:
                pg.wait_for_selector('#login:not([hidden]) form, html[data-map-ready="1"]', timeout=30000)
                if pg.is_visible('#login form'):
                    pg.fill('#login input[name=login]', 'test@lx.or.kr')
                    pg.fill('#login input[name=password]', pw_of())
                    pg.click('#login button')
                pg.wait_for_selector('html[data-map-ready="1"]', timeout=150000)
                pg.wait_for_timeout(1500)
            except Exception as e:
                errs.append('기다림 ' + str(e)[:80])
            t = datetime.datetime.now()
            out = f"{name}-1440-{t:%H%M}.png"
            pg.screenshot(path=os.path.join(SHOTS, out))
            log.append({'file': out, 'shot_at': t.isoformat(timespec='seconds'), 'url': url, 'errors': list(errs)})
            print('찍음', out, errs or '이상 없음')
        b.close()
    if not LOCAL:
        json.dump(log, open(os.path.join(HERE, 'log-mock.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    shoot([a for a in sys.argv[1:] if not a.startswith('--')])
