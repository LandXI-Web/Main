"""바퀴 6 now 그림 — 바깥 주소 로그인 폼(LX 직원 1 · LX 관리자 1) + 시안. 비밀번호는 server/.env."""
import datetime, json, os, re, sys
from playwright.sync_api import sync_playwright
ROOT = r'E:\Land-XI 플랫폼\01. 디자인'
OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
env = open(os.path.join(ROOT, 'server', '.env'), encoding='utf-8').read()
PW = os.environ.get('LX_PW') or os.environ.get('DEV_PASSWORD') or re.search(r'^DEV_PASSWORD=(.*)$', env, re.M).group(1).strip().strip('"')
APP, ADMIN = 'https://app.land-xi.dev', 'https://admin.land-xi.dev'
PRJ = 'prj_b2fa593a12'
LOG = {}; FAILED = []
ERR = {}


def shoot(pg, name, note, full=False):
    t = datetime.datetime.now(); fn = f'{name}-{t:%H%M}.png'
    pg.screenshot(path=os.path.join(OUT, fn), full_page=full)
    LOG[fn] = {'at': t.isoformat(timespec='seconds'), 'url': pg.url, 'note': note}
    json.dump(LOG, open(os.path.join(OUT, 'log.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('찍음', fn, flush=True)


def scene(n, f):
    try:
        f()
    except Exception as e:
        FAILED.append(n)
        print('실패', n, str(e)[:300].replace('\n', ' '), flush=True)


def newctx(b, vp=(1440, 900)):
    c = b.new_context(viewport={'width': vp[0], 'height': vp[1]}, device_scale_factor=1, locale='ko-KR')
    c.add_init_script("try { sessionStorage.setItem('lx.chat.test', '1') } catch (e) {}")
    pg = c.new_page(); pg.set_default_timeout(60000); pg.set_default_navigation_timeout(90000)
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)[:160]))
    pg.on('request', lambda r: errs.append('LOCAL ' + r.url[:80]) if re.search(r'//(127\.0\.0\.1|localhost)|:8700|:4173', r.url) else None)
    return c, pg, errs


def login(b, base, who):
    c, pg, errs = newctx(b)
    pg.goto(base + '/landxi/v3/login/', wait_until='domcontentloaded'); pg.wait_for_selector('#id')
    pg.fill('#id', who); pg.fill('#pw', PW); pg.click('#go')
    pg.wait_for_url(lambda u: '/login/' not in u, timeout=60000); pg.wait_for_timeout(2000)
    return c, pg, errs


def go(pg, url, sel=None, wait=1500):
    pg.goto(url, wait_until='domcontentloaded')
    if sel:
        pg.wait_for_selector(sel, timeout=60000)
    pg.wait_for_timeout(wait)


def px(pg, c):
    return pg.evaluate("(cc) => { const m = window.__xc.map, q = m.project(cc), r = m.getCanvas().getBoundingClientRect(); return [q.x + r.x, q.y + r.y]; }", c)


OBJ_READY = "() => { const m = window.__xc.map; const ls = m.getStyle().layers.filter((l) => /^xb-r-.*-fill$/.test(l.id) && m.getLayoutProperty(l.id, 'visibility') !== 'none').map((l) => l.id); return !m.isMoving() && ls.length && m.queryRenderedFeatures({ layers: ls }).length > 50; }"


def staff(b):
    c, pg, errs = login(b, APP, 'test@lx.or.kr')

    def dash():
        go(pg, f'{APP}/landxi/v3/lx-console/', '.ld-jobs .ld-kinds', 3000)
        shoot(pg, 'now-dashboard', 'LX 직원 대시보드(지금 화면)')
    scene('dash', dash)

    def prj():
        go(pg, f'{APP}/landxi/v3/lx-project/?project={PRJ}', '.k-main', 3500)
        shoot(pg, 'after-project-review-path', "프로젝트 한 장 — 지금 할 일 옆 '지도에서 결과 보기' · 확인했음 단추 없음 · 다시 학습 띠")
        go(pg, f'{APP}/landxi/v3/lx-release/?project={PRJ}&stage=publish', '.k-main', 3500)
        shoot(pg, 'after-release-form', "배포 신청서 — 결과 확인 줄 없음 · 학습 데이터 170장")
    scene('prj', prj)

    def train():
        go(pg, f'{APP}/landxi/v3/lx-project/', '.k-main', 3500)
        href = pg.evaluate("() => { const a = [...document.querySelectorAll('a')].find(x => /비닐하우스 2026/.test(x.textContent) && /project=/.test(x.href)); return a ? a.href : null; }")
        print('비닐하우스 href', href)
        m = re.search(r'project=([a-z0-9_]+)', href or '')
        pid = m.group(1) if m else PRJ
        go(pg, f'{APP}/landxi/v3/lx-train/?project={pid}', '.k-main', 4000)
        shoot(pg, 'now-train', '학습 화면(지금 화면)')
    scene('train', train)

    def xi():
        go(pg, f'{APP}/landxi/v3/xi-clean/', None, 500)
        pg.wait_for_function("() => { const x = window.__xc; const m = x?.map; return x?.boot?.shown && x.board?.glow > 0 && m && m.getStyle().layers.some((l) => l.type === 'heatmap' && /^xb-glow0/.test(l.id)); }", timeout=60000, polling=50)
        pg.wait_for_timeout(3000)
        hot = pg.evaluate("() => window.__xc.board.hot"); print('hot', hot)
        pg.evaluate("() => window.__xc.map.jumpTo({ center: [127.8, 36.1], zoom: 6.6 })"); pg.wait_for_timeout(2800)
        shoot(pg, 'after-ximap-glow-national', 'XI맵 — 전국 빛나는 밀도')
        pt = px(pg, hot); pg.mouse.move(pt[0] - 6, pt[1]); pg.mouse.move(pt[0], pt[1]); pg.wait_for_timeout(900)
        shoot(pg, 'after-ximap-glow-hover', 'XI맵 — 빛에 올리면 그 자리 요약')
        pg.mouse.move(5, 450)
        for z, nm, w, note in ((9.2, 'mid', 3500, '확대 중간 — 마을 단위로 갈라진 빛'), (10.8, 'crossfade', 4000, '더 확대 — 빛이 옅어지며 객체가 진해짐'), (12.6, 'objects', 4500, '확대 — 실제 객체 모양')):
            pg.evaluate("([c, z]) => window.__xc.map.jumpTo({ center: c, zoom: z })", [hot, z]); pg.wait_for_timeout(w)
            shoot(pg, 'after-ximap-glow-' + nm, 'XI맵 — ' + note)
        pg.evaluate("() => window.__xc.map.jumpTo({ center: [127.8, 36.1], zoom: 7 })"); pg.wait_for_timeout(3500)
        pt = px(pg, hot); pg.mouse.move(pt[0], pt[1]); pg.wait_for_timeout(500)
        t0 = datetime.datetime.now(); pg.mouse.click(pt[0], pt[1])
        pg.wait_for_function("() => !window.__xc.map.isMoving() && window.__xc.map.getZoom() >= 11", timeout=20000)
        t1 = datetime.datetime.now()
        shoot(pg, 'after-ximap-landing', 'XI맵 — 전국 빛을 눌러 날아가 내려앉은 바로 그 순간(객체가 이미 그려짐)')
        pg.wait_for_function(OBJ_READY, timeout=30000)
        LOG['_fly'] = {'click_to_land_s': round((t1 - t0).total_seconds(), 2), 'click_to_objects_s': round((datetime.datetime.now() - t0).total_seconds(), 2)}
        print(LOG['_fly'])
        pg.set_viewport_size({'width': 390, 'height': 844})
        pg.evaluate("() => window.__xc.map.jumpTo({ center: [127.8, 36.0], zoom: 5.6 })"); pg.wait_for_timeout(2800)
        shoot(pg, 'after-ximap-glow-390', 'XI맵 — 휴대폰 폭')
    scene('xi', xi)
    c.close(); ERR['staff'] = errs


def trainonly(b):
    c, pg, errs = login(b, APP, 'test@lx.or.kr')

    def train():
        go(pg, f'{APP}/landxi/v3/lx-project/', '.k-main', 3500)
        print([ (a.get('href') if False else '') for a in []])
        names = pg.evaluate("() => [...document.querySelectorAll('a,button,[role=link]')].map(x => (x.textContent || '').trim().slice(0, 40) + ' | ' + (x.getAttribute('href') || '')).filter(t => /비닐하우스/.test(t)).slice(0, 8)")
        print('후보', names)
        pg.get_by_text('비닐하우스 2026').first.click()
        pg.wait_for_url(re.compile(r'project=prj_'), timeout=30000)
        pid = re.search(r'project=(prj_[a-z0-9]+)', pg.url).group(1); print('pid', pid)
        go(pg, f'{APP}/landxi/v3/lx-train/?project={pid}', '.k-main', 4000)
        shoot(pg, 'now-train-vinyl', '학습 화면(지금 화면) — 비닐하우스 2026')
    scene('trainv', train)
    c.close(); ERR['train'] = errs


def admin(b):
    c, pg, errs = login(b, ADMIN, 'lxadmin@lx.or.kr')

    def imp():
        go(pg, f'{ADMIN}/landxi/v3/ops-infra/#/deploys/improve', '.im-t, .im-box, .im-chip', 3500)
        shoot(pg, 'after-improve-candidates', "개선 후보 — 이대로 반영 · 모아 두기 · 보류 · 모아 둔 평가 질문")
    scene('imp', imp)

    def ops():
        go(pg, f'{ADMIN}/landxi/v3/lx-deploy/?tab=ops', None, 4000)
        shoot(pg, 'after-admin-deploy-ops', '관리자 배포 운영 표 — 결과 확인 칸 없음')
    scene('ops', ops)
    c.close(); ERR['admin'] = errs


def mocks(b):
    M = f'{APP}/landxi/proto/review/mock'
    jobs = (
        ('staff-dash-5', 'index.html', 'mock-dash5', 900, None, '시안 대시보드 5차 첫 화면'),
        ('staff-dash-5', 'index.html', 'mock-dash5-full', 1260, None, '시안 대시보드 5차 세로 전체'),
        ('staff-dash-5', 'index.html', 'mock-dash5-grid-hover', 900, 'hover:.sd4-cell:nth-child(5)', '격자 다섯째 칸에 올린 모습'),
        ('train-flow-3', 'index.html', 'mock-train3', 900, None, '시안 학습 작업 흐름 3차'),
        ('train-flow-3', 'index.html', 'mock-train3-full', 1260, None, '시안 학습 3차 세로 전체'),
        ('train-flow-3', 'index.html?v=live', 'mock-train3-live', 900, None, '시안 학습 중'),
        ('train-flow-3', 'index.html', 'mock-train3-drawer', 900, 'click:.node[data-id="cfg1"]', '시안 학습 설정 블록 서랍'))
    for folder, qs, name, h, act, note in jobs:
        def f(folder=folder, qs=qs, name=name, h=h, act=act, note=note):
            ctx = b.new_context(viewport={'width': 1440, 'height': h}, device_scale_factor=1, locale='ko-KR'); pg = ctx.new_page()
            pg.goto(f'{M}/{folder}/{qs}', wait_until='load', timeout=90000); pg.wait_for_timeout(3800)
            if act:
                k, sel = act.split(':', 1)
                if k == 'hover':
                    pg.hover(sel); pg.wait_for_timeout(1000)
                if k == 'click':
                    pg.click(sel); pg.wait_for_timeout(700)
            shoot(pg, name, note); ctx.close()
        scene(name, f)


with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', headless=False, args=['--ignore-gpu-blocklist'])
    which = sys.argv[2:] or ['train', 'admin', 'mocks']
    for nm, fn in (('staff', staff), ('train', trainonly), ('admin', admin), ('mocks', mocks)):
        if nm in which:
            try:
                fn(b)
            except Exception as e:
                FAILED.append(nm); print('실패(묶음)', nm, str(e)[:300])
    b.close()
LOG['_summary'] = {'failed': FAILED, 'errors': ERR}
json.dump(LOG, open(os.path.join(OUT, 'log.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('끝 — 실패', FAILED, ERR)
