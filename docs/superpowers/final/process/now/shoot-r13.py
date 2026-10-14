"""바퀴 13 now 그림 — 바깥 주소 로그인 폼(LX 직원 1 · LX 관리자 1) + 시안 주소. 비밀번호는 server/.env.
사용: python shoot-r13.py <출력폴더> [묶음...]   묶음 = staff · admin · gov · 묶음:장면,장면 (실패한 장면만 다시)
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




XI_READY = "() => window.__xc?.board?.nat?.layers?.length > 0 && window.__xc.boot?.shown && document.querySelector('.xb-hud .xb-big') && document.querySelector('.k-chat-root[data-dock]')"
V = '/landxi/v3/'


def settle(pg):
    try: pg.wait_for_function("() => !window.__xc.map.isMoving() && window.__xc.map.areTilesLoaded()", timeout=25000)
    except Exception: pass


def say(pg, q):
    inp = pg.locator('.k-chat-root[data-dock] .k-ck-i')
    inp.click(); inp.fill(''); inp.press_sequentially(q, delay=35); inp.press('Enter')
    try: pg.wait_for_function("() => document.querySelector('.k-chat')?.dataset.state && document.querySelector('.k-chat').dataset.state !== 'busy'", timeout=60000)
    except Exception: pass


def ximap(pg, qs=''):
    go(pg, f'{APP}{V}xi-clean/{qs}', None, 500)
    pg.wait_for_function(XI_READY, timeout=170000, polling=100)
    settle(pg); pg.wait_for_timeout(1500)


def staff(b):
    c, pg = login(b, APP, 'test@lx.or.kr')

    def dash():
        go(pg, f'{APP}{V}lx-console/', None, 500)
        pg.wait_for_function("() => document.documentElement.dataset.consoleReady === '1'", timeout=90000); calm(pg); pg.wait_for_timeout(2500)
        shoot(pg, 'now-staff-dash', 'LX 직원 대시보드 1440')
        pg.set_viewport_size({'width': 2560, 'height': 1440}); pg.wait_for_timeout(3500); calm(pg)
        shoot(pg, 'after-fit-staff-2560', 'LX 직원 대시보드 2560')
        pg.set_viewport_size({'width': 1440, 'height': 900}); pg.wait_for_timeout(1500)
    scene('staff', 'dash', dash)

    def analyze():
        go(pg, f'{APP}{V}lx-analyze/', None, 500); calm(pg); pg.wait_for_timeout(2500)
        shoot(pg, 'now-staff-analyze', '분석하기 1440')
    scene('staff', 'analyze', analyze)

    def chat():
        ximap(pg)
        LOG['_xi_first'] = pg.evaluate("() => ({hud: document.querySelector('.xb-hud')?.innerText, chips: [...document.querySelectorAll('.k-chat-root[data-dock] .k-chat-sugg .k-chat-chip')].map(b => b.textContent)})"); save()
        shoot(pg, 'now-xi-chat-bottom', 'XI맵 아래 채팅 창')
        say(pg, '비닐하우스만 보여 줘')
        try: pg.wait_for_function("() => window.__xc.task === '비닐하우스'", timeout=20000)
        except Exception: pass
        settle(pg); pg.wait_for_timeout(1200)
        LOG['_xi_filter'] = pg.evaluate("() => ({task: window.__xc.task, hud: document.querySelector('.xb-hud')?.innerText, answer: [...document.querySelectorAll('.k-chat-msg.ai .k-chat-bub')].pop()?.innerText})"); save()
        shoot(pg, 'now-xi-filter', '비닐하우스만 보여 줘')
        say(pg, '원래대로')
        try: pg.wait_for_function("() => !window.__xc.task", timeout=20000)
        except Exception: pass
        settle(pg)
    scene('staff', 'chat', chat)

    def fusion():
        ximap(pg)
        LOG.setdefault('_dash', {})
        qs = [('남원시 현황 보여 줘', 'now-fu-1'), ('남원시 비닐하우스 어디가 많아?', 'now-fu-2'), ('남원시 농지 이용 실태 어때?', 'now-fu-3'),
              ('전국 분석 얼마나 진행됐어?', 'now-fu-4'), ('남원시 함양군 비교해 줘', 'now-fu-5'), ('남원시 지목별 공시지가 통계', 'now-fu-6'), ('함양군 현황 보여 줘', 'now-fu-7')]
        for q, name in qs:
            pg.evaluate("() => { window.__xc.dash = null; }")
            say(pg, q)
            ok = True
            try: pg.wait_for_function("() => window.__xc.dash?.title && !document.querySelector('.xd').hidden", timeout=60000)
            except Exception: ok = False
            if not ok:
                LOG['_dash'][name] = {'q': q, 'fail': True}; save(); continue
            settle(pg); pg.wait_for_timeout(1800)
            LOG['_dash'][name] = pg.evaluate("() => ({...window.__xc.dash, kpis: [...document.querySelectorAll('.xd-kpi')].map(k => k.innerText.replace(/\\s+/g, ' ').trim())})")
            LOG['_dash'][name]['q'] = q; save()
            shoot(pg, name, '융합 대시보드 ' + q)
            if name == 'now-fu-1':
                row = pg.locator('.xd-rank tr[data-k]').nth(1)
                if row.count():
                    row.click(); settle(pg); pg.wait_for_timeout(1200)
                    shoot(pg, 'now-fu-pick', '융합 대시보드 순위 줄 누름')
        try:
            pg.locator('.xd-back').click(); pg.wait_for_timeout(1500)
        except Exception: pass
    scene('staff', 'fusion', fusion)

    def edit():
        cen = [127.247506, 35.562193]
        ximap(pg, '?test=1')
        pg.evaluate("(c) => window.__xc.map.jumpTo({ center: c, zoom: 16.2 })", cen)
        settle(pg)
        pg.wait_for_function("() => window.__xc.map.getStyle().layers.some((l) => /^xn-o-.*-f$/.test(l.id))", timeout=30000)
        settle(pg); pg.wait_for_timeout(1500)
        pt = pg.evaluate("""() => {
  const m = window.__xc.map, ls = m.getStyle().layers.filter((l) => /^xn-o-.*-f$/.test(l.id)).map((l) => l.id);
  const fs = m.queryRenderedFeatures({ layers: ls });
  const c = m.getCanvas(), cx = c.clientWidth / 2, cy = c.clientHeight / 2, r = c.getBoundingClientRect();
  let best = null;
  for (const f of fs) {
    const g = f.geometry.type === 'Polygon' ? f.geometry.coordinates[0] : f.geometry.coordinates[0][0];
    const sx = g.reduce((a, q) => a + q[0], 0) / g.length, sy = g.reduce((a, q) => a + q[1], 0) / g.length;
    const s = m.project([sx, sy]);
    const hit = m.queryRenderedFeatures(s, { layers: ls })[0];
    if (!hit || hit.properties.id !== f.properties.id) continue;
    const d = Math.hypot(s.x - cx, s.y - cy);
    if (!best || d < best.d) best = { d, x: s.x + r.x, y: s.y + r.y, id: f.properties.id };
  }
  return best; }""")
        pg.mouse.click(pt['x'], pt['y'])
        pg.wait_for_function("() => { const c = document.querySelector('.xe-card:not([hidden])'); return c && !/불러오는 중/.test(c.innerText); }", timeout=30000)
        pg.wait_for_timeout(800)
        shoot(pg, 'now-edit-1', '전국 결과 객체 그 자리 고치기 칸')
        pg.locator('.xe-card .xe-act button', has_text='지우기').first.click()
        pg.locator('.xe-card .xe-ask button', has_text='지우기').first.click()
        pg.wait_for_function("() => /지움/.test(document.querySelector('.xe-card:not([hidden]) .xe-st')?.innerText || '')", timeout=20000)
        pg.wait_for_timeout(1500)
        shoot(pg, 'now-edit-2', '지움(시험)')
        pg.locator('.xe-card .xe-undo').first.click()
        pg.wait_for_function("() => !/지움/.test(document.querySelector('.xe-card:not([hidden]) .xe-st')?.innerText || '')", timeout=20000)
        pg.wait_for_timeout(1200)
        LOG['_edit_undone'] = True; save()
        shoot(pg, 'now-edit-3', '되돌리기')
    scene('staff', 'edit', edit)

    def overseas():
        go(pg, f'{APP}{V}xi-clean/?nation=kg', None, 500)
        pg.wait_for_function("() => window.__xc?.map && window.__xc.boot?.shown", timeout=60000, polling=100)
        def idle():
            pg.evaluate("() => new Promise((res) => { const m = window.__xc.map; let d = false; const f = () => { if (!d) { d = true; res(); } }; m.once('idle', f); setTimeout(f, 12000); })")
        if not pg.evaluate("() => /kg/.test(location.search)"): pg.locator('.xn-b', has_text='키르기스스탄').click()
        pg.wait_for_timeout(2500); idle(); pg.wait_for_timeout(1500)
        shoot(pg, 'after-kg-country', '해외 바탕 키르기스스탄 나라 전체')
        pg.evaluate("() => window.__xc.map.jumpTo({ center: [74.598, 42.872], zoom: 13, pitch: 0, bearing: 0 })")
        idle(); pg.wait_for_timeout(1500)
        LOG['_credit'] = pg.evaluate("() => document.querySelector('.k-credit')?.textContent || null"); save()
        shoot(pg, 'after-bishkek', '해외 바탕 비슈케크')
    scene('staff', 'overseas', overseas)
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

    def fit():
        go(pg, f'{ADMIN}{V}ops-core/#/approvals', None, 800, 90000); calm(pg); pg.wait_for_timeout(2500)
        shoot(pg, 'now-admin-req', '요청 관리 1440')
        pg.set_viewport_size({'width': 2560, 'height': 1440}); pg.wait_for_timeout(3500); calm(pg)
        shoot(pg, 'after-fit-admin-req-2560', '요청 관리 2560')
        pg.set_viewport_size({'width': 1440, 'height': 900}); pg.wait_for_timeout(1000)
    scene('admin', 'fit', fit)

    def improve():
        go(pg, f'{ADMIN}{V}ops-infra/#/deploys/improve', None, 800, 90000); calm(pg); pg.wait_for_timeout(2500)
        try: LOG['_improve_rel'] = pg.locator('.im-rel').first.inner_text().replace('\n', ' ')[:400]; save()
        except Exception: pass
        shoot(pg, 'now-admin-improve', '배포 개선 후보')
    scene('admin', 'improve', improve)

    def infra():
        go(pg, f'{ADMIN}{V}ops-infra/#/infra', None, 800, 90000); calm(pg); pg.wait_for_timeout(2500)
        shoot(pg, 'now-admin-infra', '인프라')
        go(pg, f'{ADMIN}{V}ops-infra/#/deploys/usage', None, 800, 90000); calm(pg); pg.wait_for_timeout(3500)
        shoot(pg, 'now-admin-usage', '배포 사용 현황')
    scene('admin', 'infra', infra)
    c.close()


def gov(b):
    c, pg = newctx(b)
    pg.goto('https://namwon.land-xi.dev/', wait_until='domcontentloaded', timeout=120000)
    pg.wait_for_selector('.gh-login input[name=login]', timeout=60000)
    pg.fill('.gh-login input[name=login]', 'lxadmin@lx.or.kr'); pg.fill('.gh-login input[name=password]', PW); pg.press('.gh-login input[name=password]', 'Enter')
    pg.wait_for_url(lambda u: re.search(r'/landxi/v3/(?!gov-home/)[a-z-]+/', u), timeout=60000)
    LOG['_logins'] += 1; save(); pg.wait_for_timeout(3000)

    def fit():
        go(pg, f'https://namwon.land-xi.dev{V}gov-select/?service=card-farm', None, 800, 90000); calm(pg); pg.wait_for_timeout(3500)
        shoot(pg, 'now-gov-dash', '기관 서비스 대시보드 1440')
        pg.set_viewport_size({'width': 2560, 'height': 1440}); pg.wait_for_timeout(3500); calm(pg)
        shoot(pg, 'after-fit-gov-dash-2560', '기관 서비스 대시보드 2560')
        pg.set_viewport_size({'width': 1440, 'height': 900}); pg.wait_for_timeout(1000)
    scene('gov', 'govfit', fit)
    c.close()

def pub(b):
    c, pg = newctx(b)
    def main_login():
        go(pg, f'{APP}{V}login/', '#id', 3000); pg.wait_for_timeout(3000)
        shoot(pg, 'now-pub-login', '로그인 화면(로그인 전)')
        go(pg, f'{APP}{V}main/', None, 6000)
        shoot(pg, 'now-pub-main', '메인 첫 장면(로그인 전)')
    scene('pub', 'login', main_login)
    c.close()


with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', headless=False, args=['--ignore-gpu-blocklist'])
    which = [k for k in SEL] or ['staff', 'admin', 'gov', 'pub']
    for nm, fn in (('staff', staff), ('admin', admin), ('gov', gov), ('pub', pub)):
        if nm in which:
            try:
                fn(b)
            except Exception as e:
                LOG['_failed'].append('묶음:' + nm); print('실패(묶음)', nm, str(e)[:300]); save()
    b.close()
save()
print('끝 - 실패', LOG['_failed'], '로그인', LOG['_logins'])
