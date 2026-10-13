"""바퀴 11 now 그림 — 바깥 주소 로그인 폼(LX 직원 1 · LX 관리자 1) + 시안 주소. 비밀번호는 server/.env.
사용: python shoot-r11.py <출력폴더> [묶음...]   묶음 = staff · admin · mocks · 묶음:장면,장면 (실패한 장면만 다시)
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
LIMIT = 420
SEL = {}
for a in sys.argv[2:]:
    k, _, v = a.partition(':'); SEL[k] = [x for x in v.split(',') if x]


def save():
    json.dump(LOG, open(LOGF, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


def shoot(pg, name, note, full=False):
    t = datetime.datetime.now(); fn = f'{name}-{t:%H%M}.png'
    for old in [f for f in os.listdir(OUT) if re.fullmatch(re.escape(name) + r'-\d{4}\.png', f)]:
        os.remove(os.path.join(OUT, old))
    try:
        pg.screenshot(path=os.path.join(OUT, fn), full_page=full, timeout=40000)
    except Exception:
        import base64
        c = pg.context.new_cdp_session(pg)
        r = c.send('Page.captureScreenshot', {'format': 'png'})
        open(os.path.join(OUT, fn), 'wb').write(base64.b64decode(r['data']))
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
    pg.goto(base + '/landxi/v3/login/', wait_until='domcontentloaded', timeout=120000); pg.wait_for_selector('#id')
    pg.fill('#id', who); pg.fill('#pw', PW); pg.click('#go')
    try: pg.wait_for_function("() => !!localStorage.getItem('lx_api_session')", timeout=60000, polling=300)
    except Exception: pg.wait_for_url(lambda u: '/login/' not in u, timeout=45000)
    try: pg.wait_for_load_state('networkidle', timeout=20000)
    except Exception: pass
    pg.wait_for_timeout(4000)
    LOG['_logins'] += 1; save()
    return c, pg


def go(pg, url, sel=None, wait=1500, to=45000):
    pg.goto(url, wait_until='domcontentloaded')
    if sel:
        pg.wait_for_selector(sel, timeout=to)
    pg.wait_for_timeout(wait)


def calm(pg, n=100):
    try: pg.wait_for_function("() => !/서버 응답이 늦습니다|불러오는 중/.test(document.body.innerText)", timeout=n * 1000, polling=500)
    except Exception: LOG.setdefault('_slow', []).append(pg.url); save()


def xi_ready(pg):
    pg.wait_for_function("() => window.__xc?.board?.nat?.layers?.length > 0 && window.__xc.boot?.shown", timeout=170000, polling=100)


PRJ = 'prj_aa6c836803'


def staff(b):
    c, pg = login(b, APP, 'test@lx.or.kr')

    def dash():
        go(pg, f'{APP}/landxi/v3/lx-console/', None, 500)
        pg.wait_for_function("() => document.documentElement.dataset.consoleReady === '1'", timeout=90000); calm(pg); pg.wait_for_timeout(2500)
        LOG['_dash_text'] = pg.locator('body').inner_text()[:2500]; save()
        shoot(pg, 'now-staff-dash', 'LX 직원 대시보드')
    scene('staff', 'dash', dash)

    def train():
        pj = pg.evaluate("async () => { const { api } = await import('/landxi/v3/kit/util.js'); return api('/projects?scope=all') }")
        pid = next((x['id'] for x in (pj.get('items') or []) if '비닐하우스' in x.get('name', '')), PRJ)
        LOG['_train_project'] = pid; save()
        pg.goto(f'{APP}/landxi/v3/lx-train/?project={pid}&stage=train', wait_until='domcontentloaded'); pg.wait_for_timeout(2000)
        pg.wait_for_function("() => document.documentElement.dataset.trainBoard === '1'", timeout=60000)
        try: pg.wait_for_selector('.tb-perf svg, .tb-perf canvas, .tb-perf .tb-chart', timeout=45000)
        except Exception: pass
        pg.wait_for_timeout(3500)
        LOG['_train_text'] = pg.locator('body').inner_text()[:3000]
        LOG['_train_chips'] = pg.evaluate("() => [...document.querySelectorAll('.tb-node')].map(n => n.innerText.replace(/\\s+/g, ' ').trim().slice(0, 60))")
        LOG['_train_at'] = datetime.datetime.now().isoformat(timespec='seconds'); save()
        pg.set_viewport_size({'width': 1440, 'height': 1250}); pg.wait_for_timeout(2500)
        shoot(pg, 'now-train-board', "프로젝트 '비닐하우스 2026' 학습 화면(세로로 길게)")
        pg.set_viewport_size({'width': 1440, 'height': 900})
        node = pg.locator('.tb-node[data-kind="data"]').first
        node.wait_for(timeout=40000); node.click(); pg.wait_for_timeout(1500)
        LOG['_train_data_drawer'] = pg.evaluate("() => document.querySelector('.tb-side')?.innerText.replace(/\\s+/g, ' ') || null"); save()
        shoot(pg, 'now-train-data', '학습 화면 · 학습 데이터 블록')
    scene('staff', 'train', train)

    def xinat():
        go(pg, f'{APP}/landxi/v3/xi-clean/', None, 500)
        pg.wait_for_function("() => window.__xc?.board?.nat?.layers?.length > 0 && window.__xc.boot?.shown", timeout=170000, polling=100)
        pg.wait_for_timeout(3500); calm(pg)
        LOG['_xna'] = pg.evaluate("() => document.querySelector('.xna-card')?.innerText || null"); save()
        shoot(pg, 'now-xi-national', 'XI맵 전국 결과 자산 칸')
    scene('staff', 'xinat', xinat)

    # XI맵 퍼포먼스 3차 시안 - 같은 직원 세션(시안 안 로그인 폼이 뜨면 한 번만)
    M = f'{APP}/landxi/proto/review/mock/ximap-perf-3/index.html'
    state = {'login': False}

    def op(qs=''):
        pg.goto(M + qs, wait_until='load', timeout=120000)
        pg.wait_for_selector('#login:not([hidden]) form, html[data-map-ready="1"]', timeout=120000)
        if pg.is_visible('#login form'):
            if state['login']: raise Exception('시안 로그인 되풀이')
            state['login'] = True; LOG['_logins'] += 1; save()
            pg.fill('#login input[name=login]', 'test@lx.or.kr'); pg.fill('#login input[name=password]', PW); pg.click('#login button')
        pg.wait_for_selector('html[data-map-ready="1"]', timeout=170000)
    pt = lambda what, *a: pg.evaluate(f"(a) => window.__pt.{what}(...a)", list(a))
    glide = lambda p, st=12: pg.mouse.move(p['x'], p['y'], steps=st)

    def first():
        op(); pg.wait_for_timeout(4000); shoot(pg, 'mock-p3-first', '시안 첫 화면')
    scene('mock', 'p3first', first)

    def hoverpress(which):
        def f():
            op(); pg.wait_for_timeout(2500)
            cc = pt('region', '남원시')
            if cc: glide({'x': cc['x'] - 140, 'y': cc['y'] + 80}, 2); glide(cc, 14)
            pg.wait_for_timeout(1200)
            if which == 'hover':
                shoot(pg, 'mock-p3-hover', '시안 올림')
            else:
                pg.mouse.click(cc['x'], cc['y']); pg.wait_for_timeout(9000)
                o = pt('obj')
                if o: glide(o, 10); pg.mouse.click(o['x'], o['y']); pg.wait_for_timeout(2800)
                shoot(pg, 'mock-p3-press', '시안 누름')
        return f
    scene('mock', 'p3hover', hoverpress('hover')); scene('mock', 'p3press', hoverpress('press'))

    def filt():
        op(); pg.wait_for_timeout(2500)
        cc = pt('chip', 0); pg.mouse.click(cc['x'], cc['y']); pg.wait_for_timeout(5000)
        shoot(pg, 'mock-p3-filter', '시안 말로 거르기')
    scene('mock', 'p3filter', filt)
    c.close()


def admin(b):
    c, pg = login(b, ADMIN, 'lxadmin@lx.or.kr')

    def line():
        go(pg, f'{ADMIN}/landxi/v3/ops-core/', None, 500)
        try: pg.wait_for_function("() => /전국 농지/.test(document.querySelector('.oc-todo')?.textContent || '')", timeout=60000)
        except Exception: pass
        pg.wait_for_timeout(2000); calm(pg)
        LOG['_admin_line'] = pg.evaluate("() => [...document.querySelectorAll('.oc-todo li')].map(x => x.innerText.trim())"); save()
        pr = pg.evaluate("async () => { const { api } = await import('/landxi/v3/kit/util.js'); return api('/national/progress') }")
        LOG['_progress'] = pr; LOG['_progress_at'] = datetime.datetime.now().isoformat(timespec='seconds'); save()
        shoot(pg, 'now-admin-dash', 'LX 관리자 대시보드')
    scene('admin', 'line', line)

    def shared():
        go(pg, f'{ADMIN}/landxi/v3/ops-infra/#/shared', None, 800, 90000)
        pg.wait_for_function("() => /영상 올리기/.test(document.body.innerText) && /\\d+장/.test(document.body.innerText)", timeout=90000, polling=500)
        pg.wait_for_timeout(2500); calm(pg, 60)
        LOG['_shared_text'] = pg.evaluate("() => document.body.innerText.slice(0, 1500)"); save()
        shoot(pg, 'now-admin-shared', 'LX 관리자 - 공유 데이터')
    scene('admin', 'shared', shared)

    def retrain():
        go(pg, f'{ADMIN}/landxi/v3/ops-infra/#/deploys/retrain', None, 800)
        pg.wait_for_selector('.rt-col .rt-tbl tbody tr', timeout=90000)
        full = pg.evaluate("() => document.querySelector('.rt-col').scrollHeight + 200")
        pg.set_viewport_size({'width': 1440, 'height': max(900, int(full))}); pg.wait_for_timeout(500)
        LOG['_retrain_text'] = pg.evaluate("() => document.querySelector('.rt-col').innerText.slice(0, 2500)"); save()
        shoot(pg, 'now-admin-retrain', 'LX 관리자 - 배포 → XI 재학습')
        pg.set_viewport_size({'width': 1440, 'height': 900})
    scene('admin', 'retrain', retrain)

    def tmpl():
        go(pg, f'{ADMIN}/landxi/v3/ops-infra/#/deploys/templates', '.rt-blks', 800, 90000)
        calm(pg, 150)
        LOG['_tmpl_text'] = pg.evaluate("() => document.querySelector('.rt-blks')?.innerText.slice(0, 600)"); save()
        shoot(pg, 'now-admin-template', 'LX 관리자 - 학습 서식')
    scene('admin', 'tmpl', tmpl)
    c.close()


with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', headless=False, args=['--ignore-gpu-blocklist'])
    which = [k for k in SEL] or ['staff', 'mock', 'admin']
    for nm, fn in (('staff', staff), ('admin', admin)):
        if nm in which or (nm == 'staff' and 'mock' in which):
            try:
                fn(b)
            except Exception as e:
                LOG['_failed'].append('묶음:' + nm); print('실패(묶음)', nm, str(e)[:300]); save()
    b.close()
save()
print('끝 - 실패', LOG['_failed'], '로그인', LOG['_logins'])
