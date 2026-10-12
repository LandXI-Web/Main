"""바퀴 7 now 그림 — 바깥 주소 로그인 폼(LX 직원 1 · LX 관리자 1) + 시안 주소. 비밀번호는 server/.env.
사용: python shoot-r7.py <출력폴더> [묶음...]   묶음 = staff · admin · mocks · 묶음:장면,장면 (실패한 장면만 다시)
장면마다 시간 제한(150초) — 넘으면 멈춘 장면을 stuck.json 에 적고 종료 → 같은 명령을 다시 돌리면 끝낸 장면은 건너뛴다."""
import datetime, json, os, re, sys, threading, time
from playwright.sync_api import sync_playwright
ROOT = r'E:\Land-XI 플랫폼\01. 디자인'
OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
env = open(os.path.join(ROOT, 'server', '.env'), encoding='utf-8').read()
PW = os.environ.get('LX_PW') or os.environ.get('DEV_PASSWORD') or re.search(r'^DEV_PASSWORD=(.*)$', env, re.M).group(1).strip().strip('"')
APP, ADMIN = 'https://app.land-xi.dev', 'https://admin.land-xi.dev'
LOGF = os.path.join(OUT, 'log.json')
LOG = json.load(open(LOGF, encoding='utf-8')) if os.path.exists(LOGF) else {}
LOG.setdefault('_done', []); LOG.setdefault('_logins', 0); LOG.setdefault('_failed', [])
LIMIT = 150
SEL = {}
for a in sys.argv[2:]:
    k, _, v = a.partition(':'); SEL[k] = [x for x in v.split(',') if x]


def save():
    json.dump(LOG, open(LOGF, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


def shoot(pg, name, note, full=False):
    t = datetime.datetime.now(); fn = f'{name}-{t:%H%M}.png'
    for old in [f for f in os.listdir(OUT) if re.fullmatch(re.escape(name) + r'-\d{4}\.png', f)]:
        os.remove(os.path.join(OUT, old))
    pg.screenshot(path=os.path.join(OUT, fn), full_page=full)
    LOG[fn] = {'at': t.isoformat(timespec='seconds'), 'url': pg.url, 'note': note}; save()
    print('찍음', fn, flush=True)


def scene(group, n, f):
    if SEL.get(group) and n not in SEL[group]:
        return
    if n in LOG['_done'] and not SEL.get(group):
        return

    def stuck():
        json.dump({'stuck': n, 'at': datetime.datetime.now().isoformat(timespec='seconds')}, open(os.path.join(OUT, 'stuck.json'), 'w'))
        print('시간 초과 — 멈춤', n, flush=True); os._exit(3)
    tm = threading.Timer(LIMIT, stuck); tm.start()
    try:
        f(); LOG['_done'].append(n)
        if n in LOG['_failed']: LOG['_failed'].remove(n)
    except Exception as e:
        if n not in LOG['_failed']: LOG['_failed'].append(n)
        print('실패', n, str(e)[:300].replace('\n', ' '), flush=True)
    finally:
        tm.cancel(); save()


def newctx(b, vp=(1440, 900)):
    c = b.new_context(viewport={'width': vp[0], 'height': vp[1]}, device_scale_factor=1, locale='ko-KR')
    c.add_init_script("try { sessionStorage.setItem('lx.chat.test', '1') } catch (e) {}")
    pg = c.new_page(); pg.set_default_timeout(45000); pg.set_default_navigation_timeout(60000)
    return c, pg


def login(b, base, who):
    c, pg = newctx(b)
    pg.goto(base + '/landxi/v3/login/', wait_until='domcontentloaded'); pg.wait_for_selector('#id')
    pg.fill('#id', who); pg.fill('#pw', PW); pg.click('#go')
    pg.wait_for_url(lambda u: '/login/' not in u, timeout=45000); pg.wait_for_timeout(2000)
    LOG['_logins'] += 1; save()
    return c, pg


def go(pg, url, sel=None, wait=1500):
    pg.goto(url, wait_until='domcontentloaded')
    if sel:
        pg.wait_for_selector(sel, timeout=45000)
    pg.wait_for_timeout(wait)


def staff(b):
    c, pg = login(b, APP, 'test@lx.or.kr')
    PID = {}

    def dash():
        go(pg, f'{APP}/landxi/v3/lx-console/', '.ld-jobs .ld-kinds', 3000)
        shoot(pg, 'now-dashboard', 'LX 직원 대시보드(지금 화면)')
    scene('staff', 'dash', dash)

    PID['id'] = pg.evaluate("async () => { const s = JSON.parse(localStorage.getItem('lx_api_session') || 'null'); const j = await fetch('/api/v1/projects?scope=all', { headers: s ? { authorization: 'Bearer ' + s.token } : {} }).then(r => r.json()).catch(() => null); return (j?.items || []).find(x => /비닐하우스/.test(x.name))?.id || null; }")
    print('비닐하우스 프로젝트', PID['id'], flush=True)
    TRAIN = lambda: f"{APP}/landxi/v3/lx-train/?project={PID['id']}&stage=train"

    def train():
        pg.goto(TRAIN(), wait_until='commit')
        pg.wait_for_function("() => document.documentElement.dataset.trainBoard === '1'", timeout=45000); pg.wait_for_timeout(1500)
        shoot(pg, 'after-train-board', '학습 화면 — 흐름 판 · 이번 학습 · 학습 이력(첫 화면)')
        full = pg.evaluate("() => document.querySelector('.tb-col').scrollHeight + 64 + 64 + 40")
        pg.set_viewport_size({'width': 1440, 'height': max(900, int(full))}); pg.wait_for_timeout(700)
        shoot(pg, 'after-train-full', '학습 화면 — 세로 전체')
        pg.set_viewport_size({'width': 1440, 'height': 900}); pg.wait_for_timeout(400)
        pg.locator('.tb-node[data-kind="cfg"]').first.click(); pg.wait_for_timeout(600)
        shoot(pg, 'after-train-drawer', '학습 화면 — 학습 설정 블록을 눌러 연 서랍')
    scene('staff', 'train', train)

    def loading():
        pat = re.compile(r'/api/v1/projects/[^/]+/train(\?|$)')

        def slow(r):
            time.sleep(1.5); r.continue_()
        pg.route(pat, slow)
        try:
            pg.goto(TRAIN(), wait_until='commit')
            pg.wait_for_selector('.k-ld.is-on', timeout=15000); pg.wait_for_timeout(250)
            LOG['_loading_label'] = pg.evaluate("() => document.querySelector('.k-ld-t')?.textContent")
            shoot(pg, 'after-loading-train', "학습 화면 — 응답을 1.5초 늦춰 본 '불러오는 중'(이 시험에서만 늦춤)")
        finally:
            pg.unroute(pat)
    scene('staff', 'loading', loading)

    def xi():
        go(pg, f'{APP}/landxi/v3/xi-clean/', None, 500)
        pg.wait_for_function("() => { const x = window.__xc; const m = x?.map; return x?.boot?.shown && x.board?.glow > 0 && m && m.getStyle().layers.some((l) => l.type === 'heatmap' && /^xb-glow0/.test(l.id)); }", timeout=45000, polling=50)
        pg.wait_for_timeout(3000)
        pg.evaluate("() => window.__xc.map.jumpTo({ center: [127.8, 36.1], zoom: 6.6 })"); pg.wait_for_timeout(3000)
        shoot(pg, 'now-ximap-glow', 'XI맵 — 전국(지금 화면)')
    scene('staff', 'xi', xi)

    def xiload():
        c2 = pg.context.new_page(); c2.set_default_timeout(30000)
        def slow2(r):
            time.sleep(1.6); r.continue_()
        c2.route(re.compile(r'/api/v1/'), slow2)
        try:
            c2.goto(APP + '/landxi/v3/xi-clean/', wait_until='commit')
            c2.wait_for_selector('.k-ld.is-on', timeout=15000); c2.wait_for_timeout(250)
            LOG['_ximap_label'] = c2.evaluate("() => document.querySelector('.k-ld-t')?.textContent")
            shoot(c2, 'after-loading-ximap', "XI맵 — 처음 열 때 '불러오는 중'")
        finally:
            c2.close()
    scene('staff', 'xiload', xiload)
    c.close()


def admin(b):
    c, pg = login(b, ADMIN, 'lxadmin@lx.or.kr')

    def adash():
        pg.wait_for_timeout(3500)
        shoot(pg, 'now-admin-dashboard', 'LX 관리자 대시보드(지금 화면 · 로그인 직후 첫 화면)')
    scene('admin', 'adash', adash)
    c.close()


def mocks(b):
    M = f'{APP}/landxi/proto/review/mock'
    jobs = (
        ('dash6', 'staff-dash-6', 'index.html', 'mock-dash6', 900, None, '시안 대시보드 6차 첫 화면'),
        ('dash6full', 'staff-dash-6', 'index.html', 'mock-dash6-full', 'FULL', None, '시안 대시보드 6차 세로 전체'),
        ('dash6s5', 'staff-dash-6', 'index.html', 'mock-dash6-stages5', 900, 'scroll:#sd6-board', '시안 진행 현황 다섯 칸'),
        ('dash6s6', 'staff-dash-6', 'index.html?stages=6', 'mock-dash6-stages6', 900, 'scroll:#sd6-board', '시안 진행 현황 여섯 칸'),
        ('dash6hover', 'staff-dash-6', 'index.html', 'mock-dash6-grid-hover', 900, 'hover:.sd4-cell:nth-child(5)', '격자 다섯째 칸에 올린 모습'),
        ('template', 'train-template', 'index.html', 'mock-train-template', 'PAGE', None, '시안 학습 서식 설명 그림 한 장'))
    for key, folder, qs, name, h, act, note in jobs:
        def f(folder=folder, qs=qs, name=name, h=h, act=act, note=note):
            hh = 900 if h in ('FULL', 'PAGE') else h
            ctx = b.new_context(viewport={'width': 1440, 'height': hh}, device_scale_factor=1, locale='ko-KR'); pg = ctx.new_page()
            pg.set_default_timeout(45000)
            pg.goto(f'{M}/{folder}/{qs}', wait_until='load', timeout=60000); pg.wait_for_timeout(3800)
            if act:
                k, sel = act.split(':', 1)
                if k == 'hover': pg.hover(sel); pg.wait_for_timeout(1000)
                if k == 'scroll': pg.eval_on_selector(sel, 'e => e.scrollIntoView({block:"start"})'); pg.wait_for_timeout(900)
            if h == 'FULL':
                total = pg.evaluate('document.querySelector(".ld-in").scrollHeight + 64 + 24 + 40')
                pg.set_viewport_size({'width': 1440, 'height': int(total)}); pg.wait_for_timeout(1500)
                shoot(pg, name, note)
            elif h == 'PAGE':
                shoot(pg, name, note, full=True)
            else:
                shoot(pg, name, note)
            ctx.close()
        scene('mocks', key, f)


with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', headless=False, args=['--ignore-gpu-blocklist'])
    which = [k for k in SEL] or ['staff', 'admin', 'mocks']
    for nm, fn in (('staff', staff), ('admin', admin), ('mocks', mocks)):
        if nm in which:
            try:
                fn(b)
            except Exception as e:
                LOG['_failed'].append('묶음:' + nm); print('실패(묶음)', nm, str(e)[:300]); save()
    b.close()
save()
print('끝 — 실패', LOG['_failed'], '로그인', LOG['_logins'])
