"""impl-13 fix-gpt2 — 외부 검수 2차 고장 고침 증거. 바깥 주소(app.land-xi.dev) 로그인 폼으로 LX 직원 한 번 → 같은 문맥으로 1–8 확인.
캡처마다 찍은 시각을 log.json 에 남긴다(원칙 162). 데이터는 바꾸지 않는다(분석 시작 · 채택 등 누르지 않음).
사용: python docs/superpowers/final/process/impl-13/fix-gpt2/shoot.py"""
import os, re, json, datetime, time
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, *['..'] * 6))
SHOTS = os.path.join(HERE, 'shots'); os.makedirs(SHOTS, exist_ok=True)
HOST = 'https://app.land-xi.dev'
pw = os.environ.get('LX_PW') or os.environ.get('DEV_PASSWORD') or re.search(r'^DEV_PASSWORD=(.*)$', open(os.path.join(ROOT, 'server', '.env'), encoding='utf-8').read(), re.M).group(1).strip().strip('"')
log = {}


def shot(pg, name, note):
    t = datetime.datetime.now(); pg.screenshot(path=os.path.join(SHOTS, name))
    log[name] = {'shot_at': t.strftime('%Y-%m-%d %H:%M:%S'), 'url': pg.url.split('#')[0], 'note': note}; print('찍음', name)


def rail(pg, label):
    pg.evaluate("(l) => [...document.querySelectorAll('nav[aria-label=\"도구\"] .k-rail-i')].find(e => e.textContent.trim() === l)?.click()", label)


with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, locale='ko-KR'); pg = ctx.new_page()
    errs = []; where = {'p': 'login'}
    pg.on('console', lambda m: errs.append((where['p'], m.text)) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errs.append((where['p'], str(e))))
    # ── 4) XI맵 첫 진입(로그인 폼 1회 → 바로 XI맵) — 도착 시각 기록
    pg.goto(HOST + '/landxi/v3/xi-clean/index.html', wait_until='domcontentloaded')
    pg.wait_for_url(re.compile(r'/login/'), timeout=30000); pg.wait_for_selector('#id')
    pg.fill('#id', 'test@lx.or.kr'); pg.fill('#pw', pw); pg.click('#go')
    where['p'] = 'xi'
    pg.wait_for_url(re.compile(r'xi-clean'), timeout=60000)
    pg.wait_for_function("() => window.__xc && window.__xc.boot && window.__xc.boot.shown", timeout=90000)
    log['xi-boot-ms'] = pg.evaluate("() => window.__xc.boot"); print('boot', log['xi-boot-ms'])
    pg.wait_for_timeout(2500)
    # ── 1) 입체 — 기울이는 중(1.2초)과 자리 잡은 뒤
    rail(pg, '입체')
    pg.wait_for_timeout(1200); shot(pg, 'gpt2-1-xi-tilt-moving-1440.png', '입체로 기울이는 중 — 흰 빈자리 없이 거친 바탕이 먼저 · 전국 건수는 작은 칸')
    pg.wait_for_timeout(5000); shot(pg, 'gpt2-1-xi-tilt-1440.png', '입체 자리 잡은 뒤 — 작은 칸 · 공백 0')
    log['xi-hud-tilt'] = pg.evaluate("() => { const e = document.querySelector('.xc-hud'), r = e.getBoundingClientRect(); return { tilt: e.dataset.tilt, w: Math.round(r.width), h: Math.round(r.height) } }")
    rail(pg, '입체'); pg.wait_for_timeout(2000)
    log['xi-hud-flat'] = pg.evaluate("() => { const e = document.querySelector('.xc-hud'), r = e.getBoundingClientRect(); return { tilt: e.dataset.tilt, w: Math.round(r.width), h: Math.round(r.height) } }")
    # ── 2) 분석 예상 시간 — 비닐하우스 · 남원(분석하기 상세)
    where['p'] = 'analyze-detail'
    pg.goto(HOST + '/landxi/v3/lx-analyze/?card=card-5e85a9&region=52190', wait_until='domcontentloaded')
    pg.wait_for_function("() => /약 \\d|1분/.test(document.querySelector('.la-eta')?.innerText || '')", timeout=60000); pg.wait_for_timeout(1500)
    log['eta'] = pg.evaluate("() => document.querySelector('.la-eta')?.innerText")
    log['cond-time'] = pg.evaluate("() => [...document.querySelectorAll('.la-dl > div')].map(d => d.innerText.replace(/\\n/g, ' | ')).find(t => t.startsWith('걸리는 시간'))")
    print('eta', log['eta'], '/', log['cond-time'])
    pg.evaluate("() => document.querySelector('.la-eta')?.scrollIntoView({ block: 'center' })"); pg.wait_for_timeout(600)
    shot(pg, 'gpt2-2-eta-1440.png', '결과까지 — 고른 영상 · 범위 · 같은 영상 최근 실제 속도(서비스 조건과 같은 기록)')
    pg.evaluate("() => [...document.querySelectorAll('.la-dl dt')].find(d => d.textContent === '걸리는 시간')?.scrollIntoView({ block: 'center' })"); pg.wait_for_timeout(600)
    shot(pg, 'gpt2-2-cond-1440.png', '이 카드의 조건 — 걸리는 시간 + 전제(어느 영상 · 언제 기록)')
    # ── 3) 프로젝트 목록 · 상세
    where['p'] = 'projects'
    pg.goto(HOST + '/landxi/v3/lx-project/', wait_until='domcontentloaded'); pg.wait_for_selector('.lxp-list .sb-tb tbody tr', timeout=60000); pg.wait_for_timeout(1500)
    log['list'] = pg.evaluate("() => [...document.querySelectorAll('.lxp-list .sb-tb tbody tr')].map(r => [r.cells[0].innerText.split('\\n')[0], r.querySelector('.sb-prog small')?.textContent, [...r.querySelectorAll('.lxp-seg i')].map(i => i.dataset.st).join(',')])")
    print('list', log['list'])
    shot(pg, 'gpt2-3-list-1440.png', '프로젝트 목록 — 진행 n/6 = 서버 판정(끝남 + 건너뜀)')
    pid = pg.evaluate("() => [...document.querySelectorAll('.lxp-list .sb-tb tbody tr')].find(r => /비닐하우스/.test(r.innerText))?.dataset.id")
    if pid:
        pg.goto(HOST + f'/landxi/v3/lx-project/?project={pid}', wait_until='domcontentloaded'); pg.wait_for_selector('.lxp-bar-steps .lxp-st', timeout=60000); pg.wait_for_timeout(1500)
        log['detail-steps'] = pg.evaluate("() => [...document.querySelectorAll('.lxp-bar-steps .lxp-st')].map(a => a.getAttribute('aria-label'))")
        print('detail', log['detail-steps'])
        shot(pg, 'gpt2-3-detail-1440.png', '프로젝트 상세 — 4 추론 · 5 결과 확인 = 건너뜀, 6 배포 신청 = 완료')
    # ── 6) 대시보드 처음 — 불러오는 중 빈 틀(흐르는 결) · 가운데 로딩 하나
    where['p'] = 'dashboard'
    held = []   # 늦은 칸 흉내(찍기 위해 프로젝트 목록 · 내 작업 응답을 잠시 붙잡음 — 찍은 뒤 그대로 보냄)
    rx = re.compile(r'/api/v1/(projects\?scope=mine|me/jobs)')
    pg.route(rx, lambda r: held.append(r))
    pg.goto(HOST + '/landxi/v3/lx-console/', wait_until='domcontentloaded'); pg.wait_for_timeout(1500)
    shot(pg, 'gpt2-6-dash-loading-1440.png', '대시보드 첫 순간(흉내 — 프로젝트 목록 · 내 작업 응답을 붙잡음) — 기다리는 칸은 흐르는 빈 틀 · 표시는 가운데 하나 · 다 온 칸의 0 은 숫자 0')
    for r in held: r.continue_()
    pg.unroute(rx); pg.wait_for_timeout(4000)
    shot(pg, 'gpt2-6-dash-1440.png', '대시보드 도착 — 0 인 칸은 숫자 0 · 없음 글')
    # ── 5 · 7) 분석하기 카드 — 기준 한 줄 · 그림을 못 받은 카드(흉내 — 학습 표본 그림 막음)
    where['p'] = 'analyze'
    pg.goto(HOST + '/landxi/v3/lx-analyze/', wait_until='domcontentloaded'); pg.wait_for_selector('.la-ac', timeout=60000); pg.wait_for_timeout(3000)
    log['basis'] = pg.evaluate("() => [...document.querySelectorAll('.la-ac')].map(a => [a.querySelector('.k-sc-t')?.textContent, a.querySelector('.la-ac-basis')?.textContent])")
    shot(pg, 'gpt2-7-analyze-1440.png', '분석하기 — 검증 정확도 아래 기준 한 줄(모델 기록)')
    where['p'] = 'analyze-sim'
    pg.route('**/preview/**', lambda r: r.abort())
    pg.reload(); pg.wait_for_selector('.la-ac', timeout=60000); pg.wait_for_timeout(3000)
    pg.click('text=농지·시설'); pg.wait_for_timeout(1500)
    log['fallback'] = pg.evaluate("() => [...document.querySelectorAll('.la-ac')].map(a => [a.querySelector('.k-sc-t')?.textContent, a.querySelector('.k-sc-ex')?.textContent || '', a.querySelector('.la-ac-pic img')?.naturalWidth || 0])")
    shot(pg, 'gpt2-5-fallback-1440.png', '그림을 못 받은 카드(흉내 — 학습 표본 그림 막음) · 거르기 바꾼 뒤 — 같은 틀의 대체 그림 + 결과 장면 없음')
    pg.unroute('**/preview/**')
    # ── 8) 요청함 — 요청 · 개선 후보 구분 한 줄 + 개선 후보 창
    where['p'] = 'inbox'
    pg.goto(HOST + '/landxi/v3/lx-inbox/', wait_until='domcontentloaded'); pg.wait_for_selector('.ib-cells .ib-cell', timeout=60000); pg.wait_for_timeout(1500)
    shot(pg, 'gpt2-8-inbox-1440.png', '요청함 — 요청과 개선 후보가 다른 것임을 한 줄로')
    pg.click('.ib-cell[data-k="improve"]'); pg.wait_for_timeout(2500)
    shot(pg, 'gpt2-8-improve-1440.png', '개선 후보 창 — 어디서 왔고 · 채택하면 무엇이 바뀌는지')
    log['console_errors'] = [e for e in errs if e[0] != 'analyze-sim']
    log['console_errors_sim'] = [e for e in errs if e[0] == 'analyze-sim']
    json.dump(log, open(os.path.join(SHOTS, 'log.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('console errors', log['console_errors'])
