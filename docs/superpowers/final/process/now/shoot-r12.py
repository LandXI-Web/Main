"""바퀴 12 now 그림 — 바깥 주소 로그인 폼(LX 직원 1 · LX 관리자 1) + 시안 주소. 비밀번호는 server/.env.
사용: python shoot-r12.py <출력폴더> [묶음...]   묶음 = staff · admin · 묶음:장면,장면 (실패한 장면만 다시)
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



MF = f'{APP}/landxi/proto/review/mock/ximap-fusion/index.html'
XI_READY = "() => window.__xc?.board?.nat?.layers?.length > 0 && window.__xc.boot?.shown && document.querySelector('.xb-hud .xb-big')"


def staff(b):
    c, pg = login(b, APP, 'test@lx.or.kr')
    pt = lambda what, *a: pg.evaluate(f"(a) => window.__pt.{what}(...a)", list(a))
    hud = lambda: pg.evaluate("() => document.querySelector('.xb-hud')?.innerText || null")

    def settle():
        try: pg.wait_for_function("() => !window.__xc.map.isMoving() && window.__xc.map.areTilesLoaded()", timeout=25000)
        except Exception: pass

    def dash():
        go(pg, f'{APP}/landxi/v3/lx-console/', None, 500)
        pg.wait_for_function("() => document.documentElement.dataset.consoleReady === '1'", timeout=90000); calm(pg); pg.wait_for_timeout(2500)
        LOG['_dash_text'] = pg.locator('body').inner_text()[:2500]; save()
        shoot(pg, 'now-staff-dash', 'LX 직원 대시보드')
    scene('staff', 'dash', dash)

    def xi_first():
        go(pg, f'{APP}/landxi/v3/xi-clean/', None, 500)
        pg.wait_for_function(XI_READY, timeout=170000, polling=100)
        settle(); pg.wait_for_timeout(2500)
        LOG['_xi_first'] = {'hud': hud(), 'task': pg.evaluate("() => window.__xc.task ?? null")}; save()
        shoot(pg, 'now-xi-first', 'XI맵 첫 화면(전국 · 업무 기본 없음)')
    scene('staff', 'xifirst', xi_first)

    def xi_press():
        go(pg, f'{APP}/landxi/v3/xi-clean/', None, 500)
        pg.wait_for_function(XI_READY, timeout=170000, polling=100)
        settle()
        hot = pg.evaluate("() => window.__xc.board.hot")
        pg.evaluate("(c) => { window.__xc.map.easeTo({ center: c, zoom: 7.8, duration: 1600 }); }", hot)
        settle(); pg.wait_for_timeout(800)
        hp = pg.evaluate("(c) => { const m = window.__xc.map, q = m.project(c), r = m.getCanvas().getBoundingClientRect(); return [q.x + r.x, q.y + r.y]; }", hot)
        pg.mouse.move(hp[0] - 260, hp[1] + 140); pg.mouse.move(hp[0], hp[1], steps=40); pg.wait_for_timeout(2600)
        try: pg.wait_for_function("() => { const t = document.querySelector('.xb-tipcard:not([hidden])'); return t && !/불러오는 중/.test(t.innerText); }", timeout=8000)
        except Exception: pass
        pg.mouse.click(hp[0], hp[1])
        try: pg.wait_for_selector('.xb-pin.in', timeout=20000)
        except Exception: pass
        settle(); pg.wait_for_timeout(2500)
        LOG['_xi_press'] = {'pin': pg.evaluate("() => document.querySelector('.xb-pin')?.innerText || null"), 'hud': hud()}; save()
        shoot(pg, 'now-xi-press', 'XI맵 시군구 누름(말풍선)')
        rb = pg.locator('.xb-pin-rows button').nth(1)
        if rb.count():
            rb.click(); pg.wait_for_timeout(1600)
            LOG['_xi_task'] = {'task': pg.evaluate("() => window.__xc.task"), 'hud': hud()}; save()
            shoot(pg, 'now-xi-task', 'XI맵 말풍선 업무 줄 누름(그 업무만)')
            pg.locator('.xb-reset').click(); pg.wait_for_timeout(800)
    scene('staff', 'xipress', xi_press)

    def xi_chat():
        pg.mouse.move(700, 880)
        pg.evaluate("() => { window.__xc.map.jumpTo({ center: [127.6, 36.0], zoom: 6.4 }); }")
        settle(); pg.wait_for_timeout(800)
        pg.locator('.k-chat-fab').click(); pg.locator('.k-ck-i').fill('비닐하우스만 보여 줘'); pg.locator('.k-ck-i').press('Enter')
        try: pg.wait_for_function("() => window.__xc.task === '비닐하우스'", timeout=40000)
        except Exception: pass
        pg.wait_for_timeout(2500)
        LOG['_xi_chat'] = {'task': pg.evaluate("() => window.__xc.task"), 'hud': hud()}; save()
        shoot(pg, 'now-xi-chat', 'XI ChatGEO 비닐하우스만 보여 줘')
        pg.locator('.k-ck-i').fill('원래대로'); pg.locator('.k-ck-i').press('Enter')
        try: pg.wait_for_function("() => window.__xc.task === null", timeout=30000)
        except Exception: pass
        pg.locator('.k-chat-fab').click()
    scene('staff', 'xichat', xi_chat)

    # 시안: 융합 대시보드 (시안 안 로그인 폼이 뜨면 한 번만)
    state = {'login': False}

    def op(url):
        pg.goto(url, wait_until='load', timeout=120000)
        pg.wait_for_selector('#login:not([hidden]) form, html[data-map-ready="1"]', timeout=120000)
        if pg.is_visible('#login form'):
            if state['login']: raise Exception('시안 로그인 되풀이')
            state['login'] = True; LOG['_logins'] += 1; save()
            pg.fill('#login input[name=login]', 'test@lx.or.kr'); pg.fill('#login input[name=password]', PW); pg.click('#login button')
        pg.wait_for_selector('html[data-map-ready="1"]', timeout=170000)
    waitask = lambda: pg.wait_for_function("window.__pt && !window.__pt.busy() && window.__pt.dash()", timeout=150000)

    def fusion():
        op(MF); pg.wait_for_timeout(3500)
        shoot(pg, 'mock-fu-first', '시안 융합 대시보드 첫 화면')
        cc = pt('chip', 0); pg.mouse.move(cc['x'], cc['y'], steps=10); pg.mouse.click(cc['x'], cc['y']); pg.wait_for_timeout(1700)
        shoot(pg, 'mock-fu-mean', '시안 뜻 확인')
        waitask(); pg.wait_for_timeout(5000)
        shoot(pg, 'mock-fu-dash1', '시안 대시보드 전환 1')
        bp = pt('bar', 'bE', 2); pg.mouse.move(bp['x'], bp['y'], steps=10); pg.mouse.click(bp['x'], bp['y']); pg.wait_for_timeout(6000)
        shoot(pg, 'mock-fu-pick', '시안 막대 누름')
        bk = pt('back'); pg.mouse.move(bk['x'], bk['y'], steps=10); pg.mouse.click(bk['x'], bk['y']); pg.wait_for_timeout(3500)
        cc = pt('chip', 1); pg.mouse.move(cc['x'], cc['y'], steps=10); pg.mouse.click(cc['x'], cc['y']); waitask(); pg.wait_for_timeout(5000)
        shoot(pg, 'mock-fu-dash2', '시안 대시보드 전환 2')
    scene('mock', 'fusion', fusion)

    c.close()


def admin(b):
    c, pg = login(b, ADMIN, 'lxadmin@lx.or.kr')
    ready = lambda: pg.wait_for_function("() => { const b = document.querySelector('.sd-body'); return b && !b.querySelector('.sd-wait') && (b.querySelector('table, .sd-none') || b.querySelector('[data-kind=error]')); }", timeout=60000)

    def tabs():
        go(pg, f'{ADMIN}/landxi/v3/ops-infra/#/shared', None, 800, 90000)
        ready(); pg.wait_for_timeout(1500)
        LOG['_sd_img_head'] = pg.evaluate("() => document.querySelector('.sd-h')?.innerText.replace(/\\s+/g, ' ')"); save()
        shoot(pg, 'now-sd-img', '공유 데이터 영상 탭')
        for k, label in (('train', '학습 데이터'), ('admin', '행정 자료')):
            pg.locator('.sd-tabs button', has_text=label).click(); ready(); pg.wait_for_timeout(1000)
            LOG['_sd_' + k] = pg.evaluate("() => [...document.querySelectorAll('.sd-body tbody tr')].map(r => r.innerText.replace(/\\s+/g, ' ').trim())"); save()
            shoot(pg, 'now-sd-' + k, '공유 데이터 ' + label + ' 탭')
    scene('admin', 'tabs', tabs)
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
