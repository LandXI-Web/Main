"""impl-13 고침 — 바깥 주소(app.land-xi.dev) 로그인 폼으로 LX 직원 한 번 → 같은 문맥으로 ① XI맵 무주군 ② 해외 1440 · 1920 ③ 주차장 2026 추론 · 배포 신청. 캡처마다 찍은 시각을 로그에 남긴다(원칙 162).
사용: python docs/superpowers/final/process/impl-13/fix/shoot.py"""
import os, re, json, datetime, sys
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, *['..'] * 6))
SHOTS = os.path.join(HERE, 'shots'); os.makedirs(SHOTS, exist_ok=True)
HOST = 'https://app.land-xi.dev'
pw = os.environ.get('LX_PW') or os.environ.get('DEV_PASSWORD') or re.search(r'^DEV_PASSWORD=(.*)$', open(os.path.join(ROOT, 'server', '.env'), encoding='utf-8').read(), re.M).group(1).strip().strip('"')
log = {}
def shot(pg, name, note):
    t = datetime.datetime.now(); pg.screenshot(path=os.path.join(SHOTS, name))
    log[name] = {'shot_at': t.strftime('%Y-%m-%d %H:%M'), 'url': pg.url.split('#')[0], 'note': note}; print('찍음', name, note)
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    ST = os.environ.get('STATE')   # 앞서 로그인 폼으로 받은 세션 파일(다시 찍을 때 로그인 아끼기)
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, locale='ko-KR', **({'storage_state': ST} if ST else {})); pg = ctx.new_page()
    pg.goto(HOST + '/landxi/v3/xi-clean/index.html?region=52730', wait_until='domcontentloaded')
    if not ST:
        pg.wait_for_url(re.compile(r'/login/'), timeout=30000); pg.wait_for_selector('#id')
        pg.fill('#id', 'test@lx.or.kr'); pg.fill('#pw', pw); pg.click('#go')          # 로그인 폼 1회
    pg.wait_for_url(re.compile(r'xi-clean'), timeout=60000)
    pg.wait_for_function("() => window.__xc && window.__xc.boot && window.__xc.boot.shown", timeout=90000); pg.wait_for_timeout(6000)
    st = pg.evaluate("() => ({hud: document.querySelector('.xc-big')?.dataset.st, text: document.querySelector('.xc-big')?.innerText, vis: (window.__xc && window.__xc.map && window.__xc.map.getStyle ? window.__xc.map.getStyle().layers.filter(l => /^xc-ai-/.test(l.id) && (l.layout||{}).visibility === 'visible').length : null)})")
    print('무주군', st)
    shot(pg, 'xi-muju-1440.png', '무주군 — 글 \'아직 결과가 없습니다\'와 지도가 같은 판정(결과 층 안 그림)')
    log['xi-muju-state'] = st
    pg.evaluate("(l) => [...document.querySelectorAll('nav[aria-label=\"도구\"] .k-rail-i')].find(e => e.textContent.trim() === l)?.click()", '층'); pg.wait_for_timeout(1500)
    shot(pg, 'xi-muju-layers-1440.png', '층 목록 — 무주군 전역 분석 층은 직접 켜기 전 꺼짐(켜면 그려짐)')
    for w, h in [(1440, 900), (1920, 1080)]:
        pg.set_viewport_size({'width': w, 'height': h})
        pg.goto(HOST + '/landxi/v3/global/index.html', wait_until='domcontentloaded')
        pg.wait_for_function("() => document.querySelector('.gl')?.dataset.level === 'district'", timeout=150000)
        pg.wait_for_function("() => document.querySelector('.gl-sheet')?.getAnimations().length === 0 && getComputedStyle(document.querySelector('.gl-sheet')).transform === 'none'", timeout=60000); pg.wait_for_timeout(1500)
        r = pg.evaluate("() => { const r = document.querySelector('.gl-sheet').getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right), innerWidth] }")
        print('해외', w, r); log[f'global-{w}-rect'] = r
        shot(pg, f'global-{w}.png', f'해외 화면 {w}px — 오른쪽 판이 자리에 앉은 뒤(판 오른쪽 끝 {r[1]} / 화면 {r[2]})')
    pg.set_viewport_size({'width': 1440, 'height': 900})
    for stage, nm in [('infer', 'release-infer-1440.png'), ('publish', 'release-publish-1440.png')]:
        pg.goto(HOST + f'/landxi/v3/lx-release/?project=prj_b2fa593a12&stage={stage}', wait_until='domcontentloaded'); pg.wait_for_timeout(5000)
        shot(pg, nm, f'주차장 2026 {stage} 탭')
    json.dump(log, open(os.path.join(SHOTS, 'log.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
