"""바퀴 9 now 그림 — 바깥 주소 로그인 폼(LX 직원 1 · LX 관리자 1) + 시안 주소. 비밀번호는 server/.env.
사용: python shoot-r9.py <출력폴더> [묶음...]   묶음 = staff · admin · mocks · 묶음:장면,장면 (실패한 장면만 다시)
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

    def newproj():
        go(pg, f'{APP}/landxi/v3/lx-console/', '.k-rail a.k-rail-i[data-id="projects"]', 800)
        pg.locator('.k-rail a.k-rail-i[data-id="projects"]').click()
        pg.wait_for_function("() => document.documentElement?.dataset.projects === '1'", timeout=60000); pg.wait_for_timeout(2000)
        pg.get_by_role('button', name='새 프로젝트').first.click()
        box = pg.locator('.lxp-new'); box.wait_for(); pg.wait_for_timeout(700)
        box.locator('input[name=name]').fill('비닐하우스 2027')
        pg.wait_for_timeout(300)
        LOG['_newproj_text'] = box.inner_text(); save()
        shoot(pg, 'now-new-project', '새 프로젝트 한 창(만들지 않고 열어 둔 모습)')
        pg.keyboard.press('Escape')
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
    scene('staff', 'train', train)

    def xijeonju():
        go(pg, f'{APP}/landxi/v3/xi-clean/', None, 500)
        pg.wait_for_selector('.xb-hud', state='attached', timeout=60000)
        pg.wait_for_function("() => window.__xc?.map && window.__xc.boot?.shown", timeout=170000)
        pg.evaluate("() => window.__xc.map.jumpTo({ center: [127.13, 35.82], zoom: 11 })"); pg.wait_for_timeout(3000); calm(pg)
        LOG['_hud_jeonju'] = pg.evaluate("() => document.querySelector('.xb-hud')?.innerText || null"); save()
        shoot(pg, 'now-ximap-jeonju', 'XI맵 시군구 카드 — 전주')
    scene('staff', 'xijeonju', xijeonju)

    def diag():
        go(pg, f'{APP}/landxi/v3/xi-clean/', None, 500)
        xi_ready(pg); pg.wait_for_timeout(2000); calm(pg)
        shoot(pg, 'now-ximap-diag', '지금 XI맵 첫 화면(진단)')
    scene('staff', 'diag', diag)

    def perf(v):
        def f():
            pg.goto(f'{APP}/landxi/proto/review/mock/ximap-perf/index.html?v={v}', wait_until='domcontentloaded', timeout=120000)
            pg.wait_for_selector('#login:not([hidden]) form, html[data-map-ready="1"]', timeout=120000)
            if pg.is_visible('#login form'):
                LOG['_logins'] += 1; save()
                pg.fill('#login input[name=login]', 'test@lx.or.kr'); pg.fill('#login input[name=password]', PW); pg.click('#login button')
            pg.wait_for_selector('html[data-map-ready="1"]', timeout=170000); pg.wait_for_timeout(5000)
            shoot(pg, f'mock-perf-{v}', f'시안 XI맵 퍼포먼스 {v.upper()}안')
        return f
    scene('staff', 'perfa', perf('a')); scene('staff', 'perfb', perf('b'))
    c.close()


def admin(b):
    c, pg = login(b, ADMIN, 'lxadmin@lx.or.kr')

    def retrain():
        reqs = []
        pg.on('requestfinished', lambda r: reqs.append((r.url[-60:], round(r.timing.get('responseEnd', 0)))))
        pg.on('requestfailed', lambda r: reqs.append((r.url[-60:], 'FAIL')))
        LOG['_reqs'] = reqs
        go(pg, f'{ADMIN}/landxi/v3/ops-infra/#/deploys/retrain', None, 800)
        try: pg.wait_for_selector('.rt-col .rt-tbl tbody tr', timeout=90000)
        except Exception:
            LOG['_retrain_dbg'] = pg.evaluate("() => [location.href, document.body.innerText.slice(0, 600)]"); save(); raise
        full = pg.evaluate("() => document.querySelector('.rt-col').scrollHeight + 200")
        pg.set_viewport_size({'width': 1440, 'height': max(900, int(full))}); pg.wait_for_timeout(500)
        LOG['_retrain_text'] = pg.evaluate("() => document.querySelector('.rt-col').innerText.slice(0, 2500)"); save()
        shoot(pg, 'now-admin-retrain', 'LX 관리자 — 배포 → XI 재학습')
        pg.set_viewport_size({'width': 1440, 'height': 900})
    scene('admin', 'retrain', retrain)

    def tmpl():
        go(pg, f'{ADMIN}/landxi/v3/ops-infra/#/deploys/templates', '.rt-blks', 800, 90000)
        calm(pg, 150)
        LOG['_tmpl_text'] = pg.evaluate("() => document.body.innerText.slice(0, 1500)"); save()
        shoot(pg, 'now-admin-template', 'LX 관리자 — 학습 서식')
    scene('admin', 'tmpl', tmpl)
    c.close()


def mocks(b):
    M = f'{APP}/landxi/proto/review/mock/staff-dash-8/index.html'
    for key, qs, name, note in (('d8', '', 'mock-dash8', '시안 8차 첫 화면'), ('d8full', '', 'mock-dash8-full', '시안 8차 세로 전체'), ('d8s6', '?stages=6', 'mock-dash8-stages6', '시안 8차 여섯 칸')):
        def f(qs=qs, name=name, note=note):
            ctx = b.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=1, locale='ko-KR'); pg = ctx.new_page()
            pg.set_default_timeout(45000)
            pg.goto(M + qs, wait_until='domcontentloaded', timeout=120000); pg.wait_for_timeout(3500)
            if name.endswith('full'):
                total = pg.evaluate('document.documentElement.scrollHeight')
                pg.set_viewport_size({'width': 1440, 'height': int(total)}); pg.wait_for_timeout(1500)
            shoot(pg, name, note)
            ctx.close()
        scene('mocks', key, f)

    def dm():
        ctx = b.new_context(viewport={'width': 1440, 'height': 1291}, device_scale_factor=1, locale='ko-KR'); pg = ctx.new_page()
        pg.set_default_timeout(45000)
        pg.goto(f'{APP}/landxi/proto/review/mock/data-map/index.html', wait_until='domcontentloaded', timeout=120000); pg.wait_for_timeout(3500)
        h = pg.evaluate('document.documentElement.scrollHeight')
        pg.set_viewport_size({'width': 1440, 'height': int(h)}); pg.wait_for_timeout(1000)
        LOG['_datamap_text'] = pg.evaluate('document.body.innerText'); save()
        shoot(pg, 'mock-data-map', '데이터 개념 진단 그림(바깥 주소 화면)')
        ctx.close()
    scene('mocks', 'dm', dm)


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
