"""설계 19차(ximap-board) 시안 촬영 — landxi/proto/review/mock/ximap-board/ 를 PC 1440 으로 찍는다(실제 결과 데이터 · '시안' 도장).
로그인은 시안 안의 로그인 폼에 test@lx.or.kr · server/.env DEV_PASSWORD 를 한 번만(같은 브라우저 문맥) — 세션 주입 없음. GPU 0 · 서버 수정 0.
세 화면 경계 그림은 분석하기 · 지도 서비스 실제 화면을 같은 때 새로 찍어 mock/img 에 두고 edges.html 이 보여 준다(원칙 162 · 그림마다 찍은 시각).
사용: python shoot-mock.py [--local] [이름 일부...]   (--local = 이 PC 개발 서버로 미리 보기 · 그림은 scratch 로)
"""
import json, os, re, shutil, sys, datetime
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', '..', '..'))
LOCAL = '--local' in sys.argv
ORIGIN = 'http://127.0.0.1:4173' if LOCAL else 'https://app.land-xi.dev'
MOCK = ORIGIN + '/landxi/proto/review/mock/ximap-board/'
IMG = os.path.join(ROOT, 'landxi', 'proto', 'review', 'mock', 'ximap-board', 'img')
SHOTS = os.environ.get('SHOTS_DIR') if LOCAL else os.path.join(HERE, 'shots')
PC = (1440, 900)
# (주소, 파일 이름, 종류) — mock = 시안 · real = 실제 화면 · edges = 세 화면 경계(앞의 그림을 모아서)
LIST = [
    (MOCK + 'index.html?v=board', 'b1-board-korea', 'mock'),
    (MOCK + 'index.html?v=fix', 'b2-fix-in-place', 'mock'),
    (MOCK + 'index.html?v=global', 'b3-global-kgz', 'mock'),
    (MOCK + 'index.html?v=global&z=focus', 'b4-global-focus', 'mock'),
    (ORIGIN + '/landxi/v3/lx-analyze/', 'r1-analyze', 'real'),
    (ORIGIN + '/landxi/v3/lx-map/', 'r2-mapsvc', 'real'),
    (MOCK + 'edges.html', 'b5-edges', 'edges'),
]
COPY = {'r1-analyze': ('analyze.png', 't1'), 'r2-mapsvc': ('mapsvc.png', 't2'), 'b1-board-korea': ('ximap.png', 't3')}


def pw_of():
    pw = os.environ.get('LX_PW') or os.environ.get('DEV_PASSWORD')
    if not pw:
        env = open(os.path.join(ROOT, 'server', '.env'), encoding='utf-8').read()
        pw = re.search(r'^DEV_PASSWORD=(.*)$', env, re.M).group(1).strip().strip('"')
    return pw


def shoot(only):
    os.makedirs(SHOTS, exist_ok=True); os.makedirs(IMG, exist_ok=True)
    log, at = [], {}
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        ctx = b.new_context(viewport={'width': PC[0], 'height': PC[1]}, device_scale_factor=1, locale='ko-KR')
        pg = ctx.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)[:160]))
        for url, name, kind in LIST:
            if only and not any(o in url or o in name for o in only):
                continue
            errs.clear()
            pg.goto(url)
            try:
                if kind == 'mock':
                    pg.wait_for_selector('#login:not([hidden]) form, html[data-map-ready="1"]', timeout=30000)
                    if pg.is_visible('#login form'):
                        pg.fill('#login input[name=login]', 'test@lx.or.kr')
                        pg.fill('#login input[name=password]', pw_of())
                        pg.click('#login button')
                    pg.wait_for_selector('html[data-map-ready="1"]', timeout=150000)
                    pg.wait_for_timeout(1500)
                elif kind == 'real':
                    pg.wait_for_selector('.k-main', timeout=60000)
                    try: pg.wait_for_load_state('networkidle', timeout=30000)
                    except Exception: pass
                    pg.wait_for_timeout(5000)
                else:
                    pg.wait_for_load_state('networkidle', timeout=30000)
                    pg.wait_for_timeout(800)
            except Exception as e:
                errs.append('기다림 ' + str(e)[:80])
            t = datetime.datetime.now()
            out = f"{name}-1440-{t:%H%M}.png"
            pg.screenshot(path=os.path.join(SHOTS, out))
            if name in COPY:
                fn, key = COPY[name]
                shutil.copyfile(os.path.join(SHOTS, out), os.path.join(IMG, fn))
                at[key] = f"{t:%Y-%m-%d %H:%M} 찍음" + (' · 시안' if kind == 'mock' else ' · 실제 화면')
                json.dump({**(json.load(open(os.path.join(IMG, 'at.json'), encoding='utf-8')) if os.path.exists(os.path.join(IMG, 'at.json')) else {}), **at},
                          open(os.path.join(IMG, 'at.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
            log.append({'file': out, 'shot_at': t.isoformat(timespec='seconds'), 'url': url, 'kind': kind, 'errors': list(errs)})
            print('찍음', out, errs or '이상 없음')
        b.close()
    if not LOCAL:
        json.dump(log, open(os.path.join(HERE, 'log-mock.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    shoot([a for a in sys.argv[1:] if not a.startswith('--')])
