"""설계 17차(ximap-evolve) 시안 촬영 — landxi/proto/review/mock/ximap-evolve/ 를 PC 1440 으로 찍는다(실제 결과 데이터 · '시안' 도장).
로그인은 시안 안의 로그인 폼에 test@lx.or.kr · server/.env DEV_PASSWORD 를 한 번만(같은 브라우저 문맥) — 세션 주입 없음. GPU 0 · 서버 수정 0.
그림마다 찍은 시각을 파일 이름과 log-mock.json 에 남긴다(원칙 162).
사용: python shoot-mock.py [--local] [이름 일부...]   (--local = 이 PC 개발 서버로 미리 보기 · 그림은 scratch 로)
"""
import json, os, re, sys, datetime
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', '..', '..'))
LOCAL = '--local' in sys.argv
BASE = ('http://127.0.0.1:4173' if LOCAL else 'https://app.land-xi.dev') + '/landxi/proto/review/mock/ximap-evolve/index.html'
SHOTS = os.environ.get('SHOTS_DIR') if LOCAL else os.path.join(HERE, 'shots')
PC = (1440, 900)
LIST = [('?v=front', 'e1-front'), ('?v=fix', 'e2-fix'), ('?v=gov', 'e3-gov-reports'), ('?v=train', 'e4-retrain-compare'), ('?v=wheel', 'e0-wheel')]

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
        for qs, name in LIST:
            if only and not any(o in qs or o in name for o in only):
                continue
            errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)[:160]))
            pg.goto(BASE + qs)
            try:
                pg.wait_for_selector('#login:not([hidden]) form, html[data-map-ready="1"]', timeout=30000)
                if pg.is_visible('#login form'):
                    pg.fill('#login input[name=login]', 'test@lx.or.kr')
                    pg.fill('#login input[name=password]', pw_of())
                    pg.click('#login button')
            except Exception as e:
                errs.append('로그인 폼 ' + str(e)[:60])
            try: pg.wait_for_selector('html[data-map-ready="1"]', timeout=150000)
            except Exception: errs.append('지도 준비 시간 초과')
            pg.wait_for_timeout(1500)
            t = datetime.datetime.now()
            out = f"{name}-1440-{t:%H%M}.png"
            pg.screenshot(path=os.path.join(SHOTS, out))
            log.append({'file': out, 'shot_at': t.isoformat(timespec='seconds'), 'url': BASE + qs, 'errors': errs})
            print('찍음', out, errs or '이상 없음')
        b.close()
    if not LOCAL:
        json.dump(log, open(os.path.join(HERE, 'log-mock.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    shoot([a for a in sys.argv[1:] if not a.startswith('--')])
