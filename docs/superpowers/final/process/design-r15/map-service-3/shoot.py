"""설계 15차(map-service-3) 시안 촬영 — landxi/proto/review/mock/map-service-3/ 를 개발 서버(:4173)로 열어 PC 1440 으로 찍는다(실제 지도 · 실제 결과 데이터).
로그인은 시안 안의 로그인 폼에 test@lx.or.kr · server/.env DEV_PASSWORD 를 쳐서 한다(세션 주입 없음). GPU 0 · 서버 수정 0 · 코드 수정 0.
그림마다 찍은 시각을 파일 이름과 log.json 에 남긴다(원칙 162).
사용: python docs/superpowers/final/process/design-r15/map-service-3/shoot.py [이름 일부...]
"""
import json, os, re, sys, datetime
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'design-r14', 'map-service'))
from shoot import CHECK_JS, FORBID  # noqa: E402  — 같은 점검(가로 넘침 · 잘린 글 · 한 단어 줄 · 금지어 · 깨진 그림)

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', '..', '..'))
SHOTS = os.path.join(HERE, 'shots')
BASE = 'http://127.0.0.1:4173/landxi/proto/review/mock/map-service-3/index.html'
PC = (1440, 900)
LIST = [  # (쿼리, 이름, 전체 페이지, 로그인 필요)
    ('?v=map&base=img&z=both', 'a-mapsvc-two-groups', False, True),
    ('?v=map&base=img&z=unbong&pick=1', 'a-mapsvc-props', False, True),
    ('?v=map&base=img&z=deokgwa&pick=1', 'a-mapsvc-project-props', False, True),
    ('?v=map&base=cad&z=unbong', 'a-mapsvc-cadastre', False, True),
    ('?v=imagery&pick=ap25-namwon-2023', 'b-imagery-shared', True, False),
    ('?v=imagery&pick=vworld', 'b-imagery-vworld', True, False),
    ('?v=imagery&pick=ngii', 'b-imagery-ngii', True, False),
    ('?v=apply', 'c-apply-category', True, False),
    ('?v=admin', 'c-admin-category', True, False),
    ('?v=list', 'c-analyze-list', True, False),
    ('?v=list&cat=%EA%B1%B4%EC%B6%95%C2%B7%EB%B3%80%ED%99%94&img=%ED%95%AD%EA%B3%B5', 'c-analyze-list-filtered', True, False),
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
    bad = 0
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        ctx = b.new_context(viewport={'width': PC[0], 'height': PC[1]}, device_scale_factor=1)
        ctx.add_init_script("try{localStorage.setItem('lx_api_base','http://127.0.0.1:8700')}catch(e){}")
        for qs, name, full, need_login in LIST:
            if only and not any(o in qs or o in name for o in only):
                continue
            pg = ctx.new_page()
            errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)[:120]))
            pg.goto(BASE + qs)
            if need_login:
                try:
                    pg.wait_for_selector('#login:not([hidden]) form, html[data-map-ready="1"]', timeout=20000)
                    if pg.is_visible('#login form'):
                        pg.fill('#login input[name=login]', 'test@lx.or.kr')
                        pg.fill('#login input[name=password]', pw_of())
                        pg.click('#login button')
                except Exception as e:
                    errs.append('로그인 폼 ' + str(e)[:60])
            try: pg.wait_for_selector('html[data-map-ready="1"]', timeout=120000)
            except Exception: errs.append('지도 준비 시간 초과')
            pg.wait_for_timeout(800)
            t = datetime.datetime.now()
            out = f"{name}-1440-{t:%H%M}.png"
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
            log.append({'file': out, 'shot_at': t.isoformat(timespec='seconds'), 'query': qs, 'flags': flags, 'height': m['height']})
            print(f"찍음 {out}  세로 {m['height']} · 첫 뷰 글자 {m['chars']} · {' · '.join(flags) or '이상 없음'}")
            pg.close()
        b.close()
    json.dump(log, open(os.path.join(HERE, 'log.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('이상 있는 캡처:', bad)

if __name__ == '__main__':
    shoot(sys.argv[1:])
