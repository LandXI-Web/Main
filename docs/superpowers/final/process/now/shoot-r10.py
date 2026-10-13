"""바퀴 10 now 그림 — 바깥 주소 로그인 폼(LX 직원 1 · LX 관리자 1) + 시안 주소. 비밀번호는 server/.env.
사용: python shoot-r10.py <출력폴더> [묶음...]   묶음 = staff · admin · mocks · 묶음:장면,장면 (실패한 장면만 다시)
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
    pg.wait_for_timeout(1500)
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

    def newproj():
        rects = {}
        for w, h in ((1440, 900), (1280, 800)):
            pg.set_viewport_size({'width': w, 'height': h})
            pg.goto(f'{APP}/landxi/v3/lx-project/?new=1', wait_until='domcontentloaded')
            box = pg.locator('.lxp-new.lxp-new--one'); box.wait_for(timeout=60000); pg.wait_for_timeout(1500)
            rc = lambda: box.evaluate("el => { const r = el.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)] }")
            k = f'{w}x{h}'
            rects[k] = {'open': rc()}
            if w == 1440:
                LOG['_newproj_text'] = box.inner_text(); save()
                shoot(pg, 'now-new-project', '새 프로젝트 창(열기)')
            box.locator('.lxp-vt').nth(1).click()
            box.locator('.lxp-pk-c').first.wait_for(timeout=60000); pg.wait_for_timeout(1500)
            rects[k]['pick'] = rc()
            if w == 1440: shoot(pg, 'now-new-pick', '새 프로젝트 창(공유 데이터에서 고르기)')
            box.locator('.lxp-mem input').click(); pg.wait_for_timeout(1200)
            rects[k]['member'] = rc()
            if w == 1440: shoot(pg, 'now-new-member', '새 프로젝트 창(구성원 찾기)')
            pg.keyboard.press('Escape')
        LOG['_newproj_rects'] = rects; save()
        pg.set_viewport_size({'width': 1440, 'height': 900})
    scene('staff', 'newproj', newproj)

    def train():
        pg.goto(f'{APP}/landxi/v3/lx-train/?project={PRJ}&stage=train', wait_until='domcontentloaded'); pg.wait_for_timeout(2000)
        pg.wait_for_function("() => document.documentElement.dataset.trainBoard === '1'", timeout=60000)
        try: pg.wait_for_selector('.tb-perf svg, .tb-perf canvas, .tb-perf .tb-chart', timeout=45000)
        except Exception: pass
        pg.wait_for_timeout(3500)
        LOG['_train_text'] = pg.locator('body').inner_text()[:2500]
        LOG['_train_at'] = datetime.datetime.now().isoformat(timespec='seconds'); save()
        pg.set_viewport_size({'width': 1440, 'height': 1250}); pg.wait_for_timeout(2500)
        shoot(pg, 'now-train-farm', "프로젝트 '경작지 v2' 학습 화면(세로로 길게)")
        pg.set_viewport_size({'width': 1440, 'height': 900})
        node = pg.locator('.tb-node[data-kind="data"]').first
        node.wait_for(timeout=40000); node.click(); pg.wait_for_timeout(1500)
        shoot(pg, 'now-train-data', '학습 화면 · 학습 데이터 블록')
    scene('staff', 'train', train)

    def xinat():
        go(pg, f'{APP}/landxi/v3/xi-clean/', None, 500)
        pg.wait_for_function("() => window.__xc?.board?.nat?.layers?.length > 0 && window.__xc.boot?.shown", timeout=170000, polling=100)
        pg.wait_for_timeout(3500); calm(pg)
        LOG['_xna'] = pg.evaluate("() => document.querySelector('.xna-card')?.innerText || null"); save()
        shoot(pg, 'now-xi-national', 'XI맵 전국 결과 자산 칸')
    scene('staff', 'xinat', xinat)

    c.close()


def mock(b):
    """XI맵 퍼포먼스 맵 2 시안 — 직원 로그인 한 번(시안 안 로그인 폼, 이미 세션 있으면 건너뜀)."""
    M = f'{APP}/landxi/proto/review/mock/ximap-perf-2/index.html'
    c, pg = newctx(b)
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
        op(); pg.wait_for_timeout(3000); shoot(pg, 'mock-p2-first', '시안 첫 화면')
    scene('mock', 'p2first', first)

    def hoverpress(which):
        def f():
            op('?at=deok'); pg.wait_for_timeout(2500)
            cc = pt('cell')
            if cc: glide({'x': cc['x'] - 120, 'y': cc['y'] - 60}, 2); glide(cc, 14)
            pg.wait_for_timeout(1100)
            if which == 'hover':
                shoot(pg, 'mock-p2-hover', '시안 올림')
            else:
                pg.mouse.click(cc['x'], cc['y']); pg.wait_for_timeout(6500)
                o = pt('obj')
                if o: glide(o, 10); pg.mouse.click(o['x'], o['y']); pg.wait_for_timeout(2600)
                shoot(pg, 'mock-p2-press', '시안 누름')
        return f
    scene('mock', 'p2hover', hoverpress('hover')); scene('mock', 'p2press', hoverpress('press'))

    def time_():
        op('?at=namwon'); pg.wait_for_timeout(3500)
        a, z = pt('year', 2025), pt('year', 2024.05)
        pg.mouse.move(a['x'], a['y']); pg.mouse.down(); pg.mouse.move(z['x'], z['y'], steps=16); pg.mouse.up(); pg.wait_for_timeout(1200)
        shoot(pg, 'mock-p2-time', '시안 시간')
    scene('mock', 'p2time', time_)

    def filt():
        op('?at=deok'); pg.wait_for_timeout(2000)
        cc = pt('chip', 0); pg.mouse.click(cc['x'], cc['y']); pg.wait_for_timeout(11000)
        shoot(pg, 'mock-p2-filter', '시안 말로 거르기')
    scene('mock', 'p2filter', filt)
    c.close()


def admin(b):
    c, pg = login(b, ADMIN, 'lxadmin@lx.or.kr')

    def line():
        go(pg, f'{ADMIN}/landxi/v3/ops-core/', None, 500)
        try: pg.wait_for_function("() => /전국 농지/.test(document.querySelector('.oc-todo')?.textContent || '')", timeout=60000)
        except Exception: pass
        pg.wait_for_timeout(2000); calm(pg)
        LOG['_admin_line'] = pg.evaluate("() => [...document.querySelectorAll('.oc-todo li')].map(x => x.innerText.trim())"); save()
        shoot(pg, 'now-admin-dash', 'LX 관리자 대시보드')
    scene('admin', 'line', line)

    def tmpl():
        go(pg, f'{ADMIN}/landxi/v3/ops-infra/#/deploys/templates', '.rt-blks', 800, 90000)
        calm(pg, 150)
        shoot(pg, 'now-admin-template', 'LX 관리자 — 학습 서식')
    scene('admin', 'tmpl', tmpl)

    def retrain():
        go(pg, f'{ADMIN}/landxi/v3/ops-infra/#/deploys/retrain', None, 800)
        pg.wait_for_selector('.rt-col .rt-tbl tbody tr', timeout=90000)
        full = pg.evaluate("() => document.querySelector('.rt-col').scrollHeight + 200")
        pg.set_viewport_size({'width': 1440, 'height': max(900, int(full))}); pg.wait_for_timeout(500)
        LOG['_retrain_text'] = pg.evaluate("() => document.querySelector('.rt-col').innerText.slice(0, 2500)"); save()
        shoot(pg, 'now-admin-retrain', 'LX 관리자 — 배포 → XI 재학습')
        pg.set_viewport_size({'width': 1440, 'height': 900})
    scene('admin', 'retrain', retrain)
    c.close()


with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', headless=False, args=['--ignore-gpu-blocklist'])
    which = [k for k in SEL] or ['staff', 'mock', 'admin']
    for nm, fn in (('staff', staff), ('admin', admin), ('mock', mock)):
        if nm in which:
            try:
                fn(b)
            except Exception as e:
                LOG['_failed'].append('묶음:' + nm); print('실패(묶음)', nm, str(e)[:300]); save()
    b.close()
save()
print('끝 — 실패', LOG['_failed'], '로그인', LOG['_logins'])
