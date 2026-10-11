"""설계 16차(ximap) 시안 촬영 — landxi/proto/review/mock/ximap-r16/ 를 바깥 주소에서 PC 1440 으로 찍는다(실제 지도 · 실제 결과 데이터 · '시안' 도장).
로그인은 시안 안의 로그인 폼에 test@lx.or.kr · server/.env DEV_PASSWORD 를 한 번만(같은 브라우저 문맥) — 세션 주입 없음. GPU 0 · 서버 수정 0 · 코드 수정 0.
그림마다 찍은 시각을 파일 이름과 log-mock.json 에 남긴다(원칙 162).
사용: python docs/superpowers/final/process/design-r16/ximap/shoot-mock.py [이름 일부...]
"""
import json, os, re, sys, datetime
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'design-r14', 'map-service'))
from shoot import CHECK_JS, FORBID  # noqa: E402 — 같은 점검(가로 넘침 · 잘린 글 · 한 단어 줄 · 금지어 · 깨진 그림)

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', '..', '..'))
SHOTS = os.path.join(HERE, 'shots')
BASE = 'https://app.land-xi.dev/landxi/proto/review/mock/ximap-r16/index.html'
PC = (1440, 900)
LIST = [
    ('?v=home', 'm1-home-ledger'),
    ('?v=source', 'm2-source-year'),
    ('?v=run', 'm3-run-fill'),
    ('?v=change', 'm4-change-chat'),
    ('?v=global', 'm5-global-same-map'),
]

def pw_of():
    pw = os.environ.get('LX_PW') or os.environ.get('DEV_PASSWORD')
    if not pw:
        env = open(os.path.join(ROOT, 'server', '.env'), encoding='utf-8').read()
        pw = re.search(r'^DEV_PASSWORD=(.*)$', env, re.M).group(1).strip().strip('"')
    return pw

def shoot(only):
    os.makedirs(SHOTS, exist_ok=True)
    log, bad = [], 0
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        ctx = b.new_context(viewport={'width': PC[0], 'height': PC[1]}, device_scale_factor=1, locale='ko-KR')
        pg = ctx.new_page()
        for qs, name in LIST:
            if only and not any(o in qs or o in name for o in only):
                continue
            errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)[:120]))
            pg.goto(BASE + qs)
            try:
                pg.wait_for_selector('#login:not([hidden]) form, html[data-map-ready="1"]', timeout=30000)
                if pg.is_visible('#login form'):
                    pg.fill('#login input[name=login]', 'test@lx.or.kr')
                    pg.fill('#login input[name=password]', pw_of())
                    pg.click('#login button')   # 로그인 1회(세션은 문맥에 남음)
            except Exception as e:
                errs.append('로그인 폼 ' + str(e)[:60])
            try: pg.wait_for_selector('html[data-map-ready="1"]', timeout=150000)
            except Exception: errs.append('지도 준비 시간 초과')
            pg.wait_for_timeout(1500)
            t = datetime.datetime.now()
            out = f"{name}-1440-{t:%H%M}.png"
            pg.screenshot(path=os.path.join(SHOTS, out))
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
            log.append({'file': out, 'shot_at': t.isoformat(timespec='seconds'), 'url': BASE + qs, 'flags': flags})
            print(f"찍음 {out} · {' · '.join(flags) or '이상 없음'}")
        b.close()
    json.dump(log, open(os.path.join(HERE, 'log-mock.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('이상 있는 캡처:', bad)

if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    shoot(sys.argv[1:])
